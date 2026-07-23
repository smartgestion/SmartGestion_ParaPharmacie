import { supabase } from './supabase'
import {
  consumeFEFO,
  restoreToBatches,
  getConsumptionsForDocument,
  getExpirationSettings,
  syncProductStock,
  remainingDays,
  refreshBatchStatuses,
} from './batches'

const recentCreateCache = new Set<string>()

export async function ensureLowStockNotifications(
  userId: string | undefined,
  produitIds?: (number | string)[]
) {
  if (!userId) return

  try {
    let query = supabase
      .from('produits')
      .select('id, designation, nom, stock_actuel, stock_min')
      .eq('user_id', userId)

    if (produitIds && produitIds.length > 0) {
      query = query.in('id', produitIds)
    }

    const { data: produits } = await query

    if (!produits || produits.length === 0) return

    const toInsert: any[] = []

    for (const p of produits) {
      const threshold = Math.max(Number(p.stock_min) || 0, 5)
      if (Number(p.stock_actuel) <= threshold) {
        const designation = p.designation || p.nom || 'Produit'
        const cacheKey = `${userId}:${p.id}`
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        if (recentCreateCache.has(cacheKey)) continue

        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('title', 'Stock Faible')
          .ilike('message', `${designation} - %`)
          .gte('created_at', twentyFourHoursAgo)
          .limit(1)

        if (!existing || existing.length === 0) {
          toInsert.push({
            user_id: userId,
            title: 'Stock Faible',
            message: `${designation} - ${p.stock_actuel} unités restantes`,
            type: 'warning',
            is_read: false,
            link: `/produits?id=${p.id}`,
            created_at: new Date().toISOString()
          })
          recentCreateCache.add(cacheKey)
        }
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('notifications').insert(toInsert)
    }
  } catch (err) {
    console.error('Error ensuring low stock notifications:', err)
  }
}

export async function updateStockAndNotify(
  userId: string | undefined,
  produitId: number | string,
  delta: number
) {
  if (!userId || !produitId) return

  try {
    const { data: produit } = await supabase
      .from('produits')
      .select('stock_actuel, designation, nom, stock_min')
      .eq('id', produitId)
      .single()

    if (!produit) return

    const currentStock = Number(produit.stock_actuel || 0)
    const newStock = currentStock + delta

    await supabase
      .from('produits')
      .update({ stock_actuel: newStock })
      .eq('id', produitId)

    const designation = produit.designation || produit.nom || 'Produit'
    const threshold = Math.max(Number(produit.stock_min) || 0, 5)

    if (delta < 0 && newStock <= threshold) {
      await notifyLowStock(userId, produitId, designation, newStock)
    }
  } catch (err) {
    console.error('Error updating stock:', err)
  }
}

/** Insert a persistent "Stock Faible" notification (deduped within 24h). */
async function notifyLowStock(
  userId: string,
  produitId: number | string,
  designation: string,
  newStock: number,
) {
  const cacheKey = `${userId}:${produitId}`
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  if (recentCreateCache.has(cacheKey)) return

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'Stock Faible')
    .ilike('message', `${designation} - %`)
    .gte('created_at', twentyFourHoursAgo)
    .limit(1)

  if (!existing || existing.length === 0) {
    await supabase.from('notifications').insert([{
      user_id: userId,
      title: 'Stock Faible',
      message: `${designation} - ${newStock} unités restantes`,
      type: 'warning',
      is_read: false,
      link: `/produits?id=${produitId}`,
      created_at: new Date().toISOString(),
    }])
    recentCreateCache.add(cacheKey)
  }
}

// ---------------------------------------------------------------------------
// FEFO stock consumption for sales
// ---------------------------------------------------------------------------

/**
 * Sell `quantity` units of a product using FEFO across its batches, record the
 * per-batch consumption on `mouvements_stock` (so the sale can be reversed to
 * the exact origin batches), re-sync the product's total stock, and raise a
 * low-stock notification when appropriate.
 *
 * Throws `InsufficientStockError` when non-expired batches can't cover the
 * request and the "prevent selling expired" setting is enabled (default).
 *
 * If the product has NO batches at all (legacy products created before this
 * feature), it falls back to the simple scalar `stock_actuel` decrement so the
 * app keeps working during migration.
 */
export async function sellStockFEFO(
  userId: string | undefined,
  produitId: number | string,
  quantity: number,
  opts: {
    referenceDocument?: string
    entiteNom?: string
    type?: string
    notes?: string
  } = {},
): Promise<void> {
  if (!userId || !produitId) return
  const qty = Number(quantity || 0)
  if (qty <= 0) return

  const settings = await getExpirationSettings(userId)

  // Does the product have any batches? If not, legacy scalar fallback.
  const { data: existingBatches } = await supabase
    .from('product_batches')
    .select('id')
    .eq('produit_id', produitId)
    .limit(1)

  if (!existingBatches || existingBatches.length === 0) {
    await updateStockAndNotify(userId, produitId, -qty)
    return
  }

  // FEFO consume (throws on insufficient non-expired stock).
  const consumptions = await consumeFEFO({ produitId, quantity: qty, settings })

  // Record a stock movement per consumed batch for exact reversibility.
  const movements = consumptions.map((c) => ({
    produit_id: produitId,
    type: opts.type || 'vente',
    quantite: -Number(c.quantity),
    notes: opts.notes || null,
    reference_document: opts.referenceDocument || null,
    entite_nom: opts.entiteNom || null,
    batch_id: c.batchId,
    date_mouvement: new Date().toISOString(),
  }))
  if (movements.length > 0) {
    await supabase.from('mouvements_stock').insert(movements)
  }

  // Re-sync the denormalised product stock and notify if low.
  const newStock = await syncProductStock(produitId, settings)

  const { data: produit } = await supabase
    .from('produits')
    .select('designation, nom, stock_min')
    .eq('id', produitId)
    .maybeSingle()
  const designation = produit?.designation || produit?.nom || 'Produit'
  const threshold = Math.max(Number(produit?.stock_min) || 0, 5)
  if (newStock <= threshold) {
    await notifyLowStock(userId, produitId, designation, newStock)
  }
}

/**
 * Reverse every FEFO consumption recorded for a sale document, restoring
 * quantities to their original batches, then re-sync affected products.
 * Falls back to a scalar restock for products with no recorded batch movements.
 */
export async function restoreStockForDocument(
  userId: string | undefined,
  referenceDocument: string,
  lines: { produit_id?: number | string | null; quantite?: number }[],
): Promise<void> {
  if (!userId) return
  const settings = await getExpirationSettings(userId)

  for (const l of lines) {
    if (!l.produit_id) continue
    const consumptions = await getConsumptionsForDocument(
      referenceDocument,
      l.produit_id,
    )
    if (consumptions.length > 0) {
      await restoreToBatches(consumptions, l.produit_id, settings)
    } else {
      // No batch trace (legacy sale) — scalar restock.
      await updateStockAndNotify(userId, l.produit_id, Number(l.quantite || 0))
    }
  }
}

// ---------------------------------------------------------------------------
// Expiration notifications (startup)
// ---------------------------------------------------------------------------

/**
 * On application start, scan all active batches and raise persistent
 * notifications when a batch's remaining days fall at/below its alert
 * threshold, or when batches are already expired. Deduped within 24h.
 */
export async function ensureExpirationNotifications(userId: string | undefined) {
  if (!userId) return
  try {
    // Keep statuses fresh so counts are accurate.
    await refreshBatchStatuses(undefined, userId)

    const { data: batches } = await supabase
      .from('product_batches')
      .select('expiration_date, alert_before_days, quantity_remaining')
      .eq('user_id', userId)
      .gt('quantity_remaining', 0)

    let expiredCount = 0
    let expiringCount = 0

    for (const b of (batches as any[]) || []) {
      if (Number(b.quantity_remaining || 0) <= 0) continue
      const d = remainingDays(b.expiration_date)
      if (d === null) continue
      const alert = Number(b.alert_before_days ?? 30) || 30
      if (d < 0) expiredCount++
      else if (d <= alert) expiringCount++
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const toInsert: any[] = []

    if (expiringCount > 0) {
      const key = `${userId}:exp-soon`
      if (!recentCreateCache.has(key)) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('title', 'Lots à péremption proche')
          .gte('created_at', twentyFourHoursAgo)
          .limit(1)
        if (!existing || existing.length === 0) {
          toInsert.push({
            user_id: userId,
            title: 'Lots à péremption proche',
            message: `⚠️ ${expiringCount} lot(s) expirent bientôt.`,
            type: 'warning',
            is_read: false,
            link: '/lots?filter=expiring30',
            created_at: new Date().toISOString(),
          })
          recentCreateCache.add(key)
        }
      }
    }

    if (expiredCount > 0) {
      const key = `${userId}:exp-expired`
      if (!recentCreateCache.has(key)) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('title', 'Lots périmés')
          .gte('created_at', twentyFourHoursAgo)
          .limit(1)
        if (!existing || existing.length === 0) {
          toInsert.push({
            user_id: userId,
            title: 'Lots périmés',
            message: `❌ ${expiredCount} lot(s) sont déjà périmés.`,
            type: 'error',
            is_read: false,
            link: '/lots?filter=expired',
            created_at: new Date().toISOString(),
          })
          recentCreateCache.add(key)
        }
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('notifications').insert(toInsert)
    }
  } catch (err) {
    console.error('Error ensuring expiration notifications:', err)
  }
}
