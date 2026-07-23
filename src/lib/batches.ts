/**
 * Batch (Lot) & Expiration Management — FEFO core library.
 *
 * Pharmaceutical inventory best practice: First Expired, First Out (FEFO).
 *
 * Design rules (see spec):
 *  - Expiration data lives ONLY in `product_batches`, never on the product.
 *  - Every delivered Bon de Commande line creates one Product Batch.
 *  - Product `stock_actuel` is kept as the denormalised SUM of active batch
 *    remaining quantities (so existing dashboard / low-stock code keeps working).
 *  - Sales always consume the earliest-expiring active batch first (FEFO).
 *  - Expired batches cannot be sold (unless the setting is disabled).
 *  - Cancelling a sale restores quantities to their ORIGINAL batches, using the
 *    consumption records stored in `mouvements_stock.batch_id`.
 *
 * All DB access goes through the unified `supabase` client (real Supabase in
 * the browser, local SQLite adapter under Tauri).
 */

import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchStatus = 'Active' | 'Expired' | 'Empty'

export interface ProductBatch {
  id: number
  user_id?: string
  produit_id: number
  bon_commande_id?: number | null
  supplier_id?: number | null
  lot_number?: string | null
  quantity_initial: number
  quantity_remaining: number
  purchase_price: number
  received_date?: string | null
  expiration_date?: string | null
  alert_before_days: number
  status: BatchStatus
  created_at?: string
  updated_at?: string
}

export interface ExpirationSettings {
  defaultAlertDays: number
  allowCustomAlert: boolean
  includeExpiredInStock: boolean
  preventExpiredSale: boolean
  warnColors: boolean
}

export const DEFAULT_EXPIRATION_SETTINGS: ExpirationSettings = {
  defaultAlertDays: 30,
  allowCustomAlert: true,
  includeExpiredInStock: false,
  preventExpiredSale: true,
  warnColors: true,
}

/** A single batch consumption event — persisted so sales can be reversed. */
export interface BatchConsumption {
  batchId: number
  quantity: number
}

// ---------------------------------------------------------------------------
// Date / status helpers
// ---------------------------------------------------------------------------

/** Remaining days until expiration. Negative = already expired. null = no date. */
export function remainingDays(expiration?: string | null): number | null {
  if (!expiration) return null
  const exp = new Date(expiration)
  if (isNaN(exp.getTime())) return null
  const today = new Date()
  // Normalise to midnight so partial days don't skew the count.
  today.setHours(0, 0, 0, 0)
  exp.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function isExpired(expiration?: string | null): boolean {
  const d = remainingDays(expiration)
  return d !== null && d < 0
}

/** Derive the status a batch SHOULD have given its quantity and expiry. */
export function computeBatchStatus(batch: {
  quantity_remaining: number
  expiration_date?: string | null
}): BatchStatus {
  if (Number(batch.quantity_remaining) <= 0) return 'Empty'
  if (isExpired(batch.expiration_date)) return 'Expired'
  return 'Active'
}

/**
 * Colour semantics (see spec "Product Status Colors"):
 *   green  > 90 days, yellow 31–90, orange 1–30, red expired.
 * Returns a semantic key the UI maps to Tailwind classes / Badge variants.
 */
export type ExpirationColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray'

export function expirationColor(expiration?: string | null): ExpirationColor {
  const d = remainingDays(expiration)
  if (d === null) return 'gray'
  if (d < 0) return 'red'
  if (d <= 30) return 'orange'
  if (d <= 90) return 'yellow'
  return 'green'
}

/** Tailwind text/background classes for an expiration colour. */
export function expirationColorClasses(color: ExpirationColor): string {
  switch (color) {
    case 'green':
      return 'bg-emerald-100 text-emerald-700'
    case 'yellow':
      return 'bg-yellow-100 text-yellow-700'
    case 'orange':
      return 'bg-orange-100 text-orange-700'
    case 'red':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Load the user's expiration settings from `parametres` (with safe defaults). */
export async function getExpirationSettings(
  userId: string | undefined,
): Promise<ExpirationSettings> {
  if (!userId) return { ...DEFAULT_EXPIRATION_SETTINGS }
  try {
    const { data } = await supabase
      .from('parametres')
      .select(
        'expiration_default_alert_days, expiration_allow_custom_alert, expiration_include_in_stock, expiration_prevent_expired_sale, expiration_warn_colors',
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (!data) return { ...DEFAULT_EXPIRATION_SETTINGS }

    const bool = (v: any, def: boolean) =>
      v === null || v === undefined ? def : Boolean(Number(v)) || v === true

    return {
      defaultAlertDays: Number(data.expiration_default_alert_days ?? 30) || 30,
      allowCustomAlert: bool(data.expiration_allow_custom_alert, true),
      includeExpiredInStock: bool(data.expiration_include_in_stock, false),
      preventExpiredSale: bool(data.expiration_prevent_expired_sale, true),
      warnColors: bool(data.expiration_warn_colors, true),
    }
  } catch {
    return { ...DEFAULT_EXPIRATION_SETTINGS }
  }
}

// ---------------------------------------------------------------------------
// Stock synchronisation (product.stock_actuel = sum of active batches)
// ---------------------------------------------------------------------------

/**
 * Recompute `produits.stock_actuel` as the sum of batch remaining quantities.
 * By default expired batches are excluded (they cannot be sold), matching the
 * `includeExpiredInStock` setting.
 */
export async function syncProductStock(
  produitId: number | string,
  settings?: ExpirationSettings,
): Promise<number> {
  const includeExpired = settings?.includeExpiredInStock ?? false
  const { data: batches } = await supabase
    .from('product_batches')
    .select('quantity_remaining, expiration_date, status')
    .eq('produit_id', produitId)

  let total = 0
  for (const b of (batches as any[]) || []) {
    const qty = Number(b.quantity_remaining || 0)
    if (qty <= 0) continue
    if (!includeExpired && isExpired(b.expiration_date)) continue
    total += qty
  }

  await supabase
    .from('produits')
    .update({ stock_actuel: total })
    .eq('id', produitId)

  return total
}

/**
 * Refresh the stored `status` of every batch for a product (Active/Expired/Empty).
 * Cheap and idempotent; call after mutations or on page loads.
 */
export async function refreshBatchStatuses(
  produitId?: number | string,
  userId?: string,
): Promise<void> {
  let query = supabase
    .from('product_batches')
    .select('id, quantity_remaining, expiration_date, status')
  if (produitId) query = query.eq('produit_id', produitId)
  else if (userId) query = query.eq('user_id', userId)

  const { data: batches } = await query
  for (const b of (batches as any[]) || []) {
    const desired = computeBatchStatus(b)
    if (desired !== b.status) {
      await supabase
        .from('product_batches')
        .update({ status: desired })
        .eq('id', b.id)
    }
  }
}

// ---------------------------------------------------------------------------
// Batch creation on purchase delivery
// ---------------------------------------------------------------------------

export interface DeliveryLine {
  produit_id?: number | null
  quantite?: number
  prix_unitaire_ht?: number
  numero_lot?: string | null
  date_peremption?: string | null
  alert_before_days?: number | null
}

/**
 * Create one Product Batch per delivered purchase-order line and update the
 * product's total stock. Called when a Bon de Commande transitions into
 * "Livrée". Idempotency is guarded by the caller (bons_commande.stock_updated).
 */
export async function createBatchesForDelivery(params: {
  userId: string | undefined
  bonCommandeId: number | string
  supplierId?: number | null
  lines: DeliveryLine[]
  settings?: ExpirationSettings
}): Promise<void> {
  const { userId, bonCommandeId, supplierId, lines } = params
  const settings = params.settings ?? DEFAULT_EXPIRATION_SETTINGS
  const touchedProducts = new Set<number>()

  for (const l of lines) {
    if (!l.produit_id) continue
    const qty = Number(l.quantite || 0)
    if (qty <= 0) continue

    const alertDays =
      settings.allowCustomAlert && l.alert_before_days != null
        ? Number(l.alert_before_days)
        : settings.defaultAlertDays

    const batch = {
      user_id: userId,
      produit_id: l.produit_id,
      bon_commande_id: bonCommandeId,
      supplier_id: supplierId ?? null,
      lot_number: l.numero_lot || null,
      quantity_initial: qty,
      quantity_remaining: qty,
      purchase_price: Number(l.prix_unitaire_ht || 0),
      received_date: new Date().toISOString(),
      expiration_date: l.date_peremption || null,
      alert_before_days: alertDays || 30,
      status: 'Active' as BatchStatus,
    }

    await supabase.from('product_batches').insert([batch])
    touchedProducts.add(Number(l.produit_id))
  }

  for (const pid of touchedProducts) {
    await syncProductStock(pid, settings)
  }
}

/**
 * Remove the batches created for a Bon de Commande (on cancel / un-deliver)
 * and re-sync the affected products' stock.
 */
export async function removeBatchesForDelivery(
  bonCommandeId: number | string,
  settings?: ExpirationSettings,
): Promise<void> {
  const { data: batches } = await supabase
    .from('product_batches')
    .select('produit_id')
    .eq('bon_commande_id', bonCommandeId)

  const produitIds = new Set<number>(
    ((batches as any[]) || [])
      .map((b) => Number(b.produit_id))
      .filter((id) => !!id),
  )

  await supabase.from('product_batches').delete().eq('bon_commande_id', bonCommandeId)

  for (const pid of produitIds) {
    await syncProductStock(pid, settings)
  }
}

// ---------------------------------------------------------------------------
// FEFO consumption (sales) and reversal (cancellations)
// ---------------------------------------------------------------------------

/**
 * Check whether a set of cart lines can be fully satisfied by non-expired
 * batches (respecting the "prevent selling expired" setting). Returns the list
 * of offending products (empty = OK). Products with NO batches are skipped
 * (legacy scalar fallback handles them).
 */
export async function validateFEFOAvailability(
  userId: string | undefined,
  lines: { produitId: number | string; quantity: number; designation?: string }[],
  settings?: ExpirationSettings,
): Promise<{ produitId: number | string; designation?: string; requested: number; available: number }[]> {
  const s = settings ?? (await getExpirationSettings(userId))
  if (!s.preventExpiredSale) return []

  // Aggregate requested quantity per product (a product may appear twice).
  const requested = new Map<string, { qty: number; designation?: string }>()
  for (const l of lines) {
    const key = String(l.produitId)
    const cur = requested.get(key)
    requested.set(key, {
      qty: (cur?.qty || 0) + Number(l.quantity || 0),
      designation: l.designation || cur?.designation,
    })
  }

  const problems: { produitId: number | string; designation?: string; requested: number; available: number }[] = []

  for (const [produitId, info] of requested) {
    const { data: rows } = await supabase
      .from('product_batches')
      .select('quantity_remaining, expiration_date')
      .eq('produit_id', produitId)
      .gt('quantity_remaining', 0)

    const batches = (rows as any[]) || []
    if (batches.length === 0) continue // legacy product, scalar fallback

    const availableActive = batches
      .filter((b) => !isExpired(b.expiration_date))
      .reduce((sum, b) => sum + Number(b.quantity_remaining || 0), 0)

    if (availableActive < info.qty) {
      problems.push({
        produitId,
        designation: info.designation,
        requested: info.qty,
        available: availableActive,
      })
    }
  }

  return problems
}

export class InsufficientStockError extends Error {
  constructor(
    public produitId: number | string,
    public requested: number,
    public available: number,
  ) {
    super(
      `Stock insuffisant (non périmé) pour le produit ${produitId}. ` +
        `Disponible: ${available}, demandé: ${requested}`,
    )
    this.name = 'InsufficientStockError'
  }
}

/**
 * Consume `quantity` units of a product using FEFO across its active,
 * non-expired batches.
 *
 * - Ignores expired and empty batches.
 * - Sorts by expiration date ascending (earliest first; NULLs last).
 * - Throws `InsufficientStockError` when active stock cannot cover the request
 *   and `preventExpiredSale` is enabled (default). When disabled, it consumes
 *   what it can (including expired batches as a fallback) and never throws.
 *
 * Returns the list of consumptions (batchId + qty) so the sale can be reversed.
 * The caller is responsible for calling `syncProductStock` afterwards (or pass
 * `syncStock: true`).
 */
export async function consumeFEFO(params: {
  produitId: number | string
  quantity: number
  settings?: ExpirationSettings
  syncStock?: boolean
}): Promise<BatchConsumption[]> {
  const { produitId } = params
  const quantity = Number(params.quantity || 0)
  const settings = params.settings ?? DEFAULT_EXPIRATION_SETTINGS
  if (quantity <= 0) return []

  const { data: rows } = await supabase
    .from('product_batches')
    .select('id, quantity_remaining, expiration_date, status')
    .eq('produit_id', produitId)
    .gt('quantity_remaining', 0)

  const batches = ((rows as any[]) || []).filter(
    (b) => Number(b.quantity_remaining) > 0,
  )

  // Split into sellable (non-expired) and expired.
  const active = batches.filter((b) => !isExpired(b.expiration_date))
  const expired = batches.filter((b) => isExpired(b.expiration_date))

  // FEFO order: earliest expiration first, NULLs (no date) last.
  const byExpiry = (a: any, b: any) => {
    const da = a.expiration_date ? new Date(a.expiration_date).getTime() : Infinity
    const db = b.expiration_date ? new Date(b.expiration_date).getTime() : Infinity
    return da - db
  }
  active.sort(byExpiry)
  expired.sort(byExpiry)

  const availableActive = active.reduce(
    (s, b) => s + Number(b.quantity_remaining || 0),
    0,
  )

  if (settings.preventExpiredSale && availableActive < quantity) {
    throw new InsufficientStockError(produitId, quantity, availableActive)
  }

  // Consume from active first; if selling expired is allowed, fall back to them.
  const order = settings.preventExpiredSale ? active : [...active, ...expired]

  const consumptions: BatchConsumption[] = []
  let toDeduct = quantity

  for (const b of order) {
    if (toDeduct <= 0) break
    const remaining = Number(b.quantity_remaining || 0)
    if (remaining <= 0) continue
    const take = Math.min(remaining, toDeduct)
    const newRemaining = remaining - take
    await supabase
      .from('product_batches')
      .update({
        quantity_remaining: newRemaining,
        status: computeBatchStatus({
          quantity_remaining: newRemaining,
          expiration_date: b.expiration_date,
        }),
      })
      .eq('id', b.id)
    consumptions.push({ batchId: b.id, quantity: take })
    toDeduct -= take
  }

  if (params.syncStock) {
    await syncProductStock(produitId, settings)
  }

  return consumptions
}

/**
 * Restore quantities to their original batches (inverse of a FEFO consumption).
 * Used when a sale is cancelled or deleted.
 */
export async function restoreToBatches(
  consumptions: BatchConsumption[],
  produitId?: number | string,
  settings?: ExpirationSettings,
): Promise<void> {
  for (const c of consumptions) {
    if (!c.batchId) continue
    const { data: b } = await supabase
      .from('product_batches')
      .select('id, quantity_remaining, quantity_initial, expiration_date')
      .eq('id', c.batchId)
      .maybeSingle()
    if (!b) continue
    const newRemaining = Number(b.quantity_remaining || 0) + Number(c.quantity || 0)
    await supabase
      .from('product_batches')
      .update({
        quantity_remaining: newRemaining,
        status: computeBatchStatus({
          quantity_remaining: newRemaining,
          expiration_date: b.expiration_date,
        }),
      })
      .eq('id', c.batchId)
  }
  if (produitId) await syncProductStock(produitId, settings)
}

/**
 * Read back the batch consumptions recorded on `mouvements_stock` for a sale.
 * Movements store the consumption as `batch_id` + `quantite` (negative for a
 * sale). Returns positive quantities suitable for `restoreToBatches`.
 */
export async function getConsumptionsForDocument(
  referenceDocument: string,
  produitId?: number | string,
): Promise<BatchConsumption[]> {
  let query = supabase
    .from('mouvements_stock')
    .select('batch_id, quantite, produit_id')
    .eq('reference_document', referenceDocument)
  if (produitId) query = query.eq('produit_id', produitId)

  const { data } = await query
  const out: BatchConsumption[] = []
  for (const m of (data as any[]) || []) {
    if (m.batch_id) {
      out.push({ batchId: Number(m.batch_id), quantity: Math.abs(Number(m.quantite || 0)) })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Expiration overview (dashboard buckets)
// ---------------------------------------------------------------------------

export interface ExpirationBuckets {
  expired: number
  within7: number
  within30: number
  within60: number
  within90: number
}

/**
 * Count active (non-empty) batches falling into each expiration window.
 * Buckets are cumulative-exclusive: a batch expiring in 5 days counts in
 * `within7` only (not within30/60/90); an expired batch counts only in
 * `expired`.
 */
export async function getExpirationBuckets(
  userId: string | undefined,
): Promise<ExpirationBuckets> {
  const empty: ExpirationBuckets = {
    expired: 0,
    within7: 0,
    within30: 0,
    within60: 0,
    within90: 0,
  }
  if (!userId) return empty

  const { data } = await supabase
    .from('product_batches')
    .select('quantity_remaining, expiration_date')
    .eq('user_id', userId)
    .gt('quantity_remaining', 0)

  for (const b of (data as any[]) || []) {
    if (Number(b.quantity_remaining || 0) <= 0) continue
    const d = remainingDays(b.expiration_date)
    if (d === null) continue
    if (d < 0) empty.expired++
    else if (d <= 7) empty.within7++
    else if (d <= 30) empty.within30++
    else if (d <= 60) empty.within60++
    else if (d <= 90) empty.within90++
  }
  return empty
}
