import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  type DateRangeKey, getDateRange, getPreviousRange, applyDateFilter,
} from '@/lib/dateRange'

/* ================================================================== */
/* Filters                                                            */
/* ================================================================== */

export interface ReportFilters {
  dateRange: DateRangeKey
  customStart: string
  customEnd: string
  productId: string | null      // produits.id
  category: string | null       // produits.marque (labelled "Catégorie")
  supplierId: string | null     // fournisseurs.id (via purchase history)
  clientId: string | null       // clients.id
  paymentMethod: string | null  // factures.mode_paiement / depenses.mode_paiement
  invoiceStatus: string | null  // factures.statut
}

export const DEFAULT_FILTERS: ReportFilters = {
  dateRange: 'this_month',
  customStart: '',
  customEnd: '',
  productId: null,
  category: null,
  supplierId: null,
  clientId: null,
  paymentMethod: null,
  invoiceStatus: null,
}

/* ================================================================== */
/* Normalised shapes                                                  */
/* ================================================================== */

export interface SaleLine {
  key: string
  produitId: string | null
  parentId: string
  documentNumber: string
  source: 'facture' | 'vente_passager'
  date: string          // parent document date (ISO)
  createdAt: string      // parent created_at (for hour heatmap)
  clientId: string | null
  clientName: string | null
  designation: string
  qty: number
  tva: number
  revenueTTC: number
  revenueHT: number
  costTTC: number        // prix_achat_ht × (1+tva/100) × qty
  costHT: number
  profit: number         // revenueTTC − costTTC
  paymentMethod: string | null
  statut: string | null
}

export interface PurchaseLine {
  key: string
  produitId: string | null
  bonId: string
  documentNumber: string
  date: string
  supplierId: string | null
  supplierName: string | null
  designation: string
  qty: number
  costTTC: number
  costHT: number
}

export interface ProductRow {
  id: string
  name: string
  barcode: string | null
  brand: string | null       // marque
  imageUrl: string | null
  supplierName: string | null // inferred from latest purchase
  stock: number
  stockMin: number
  prixAchatHt: number
  prixAchatTtc: number
  prixVenteTtc: number
  tva: number
  qtySold: number
  qtyPurchased: number
  revenueTTC: number
  revenueHT: number
  costTTC: number
  profit: number
  margin: number
  avgSellPrice: number
  lastSale: string | null
  lastPurchase: string | null
}

export interface ClientRow {
  id: string
  name: string
  invoices: number
  revenueTTC: number
  profit: number
  avgInvoice: number
  outstanding: number
  lastPurchase: string | null
  firstPurchase: string | null
}

export interface SupplierRow {
  id: string
  name: string
  orders: number
  products: number
  amountTTC: number
  avgPurchase: number
}

export interface ExpenseRow {
  id: string
  categorie: string
  supplierName: string | null
  montantTTC: number
  date: string
  paymentMethod: string | null
}

export interface StockMovement {
  id: string
  produitId: string | null
  productName: string
  type: string
  qty: number
  date: string
  reference: string | null
  entite: string | null
}

export interface Totals {
  revenueTTC: number
  revenueHT: number
  tvaCollected: number
  cogsTTC: number
  grossProfit: number
  expensesTTC: number
  expensesHT: number
  tvaDeductible: number
  netProfit: number
  margin: number          // grossProfit / revenueTTC %
  invoicesCount: number   // distinct sale documents
  productsSold: number    // total qty
  avgSale: number         // revenueTTC / salesCount
  activeCustomers: number
  purchasesTTC: number
  purchaseOrders: number
}

export interface ReportData {
  saleLines: SaleLine[]
  purchaseLines: PurchaseLine[]
  products: ProductRow[]
  clients: ClientRow[]
  suppliers: SupplierRow[]
  expenses: ExpenseRow[]
  movements: StockMovement[]
  totals: Totals
  prevTotals: Totals
  stockValuationPurchase: number
  stockValuationSelling: number
  paymentMethods: string[]
  categories: string[]
  loading: boolean
  refresh: () => void
}

/* ================================================================== */
/* Cache (filter-signature keyed, short TTL)                          */
/* ================================================================== */

interface RawBundle {
  saleLines: SaleLine[]
  purchaseLines: PurchaseLine[]
  products: ProductRow[]
  clients: ClientRow[]
  suppliers: SupplierRow[]
  expenses: ExpenseRow[]
  movements: StockMovement[]
  stockValuationPurchase: number
  stockValuationSelling: number
  paymentMethods: string[]
  categories: string[]
  prevSaleLines: SaleLine[]
  prevExpenses: ExpenseRow[]
  prevPurchaseTTC: number
  prevPurchaseOrders: number
}

const cache = new Map<string, { at: number; data: RawBundle }>()
const CACHE_TTL = 60_000

function sig(userId: string, f: ReportFilters): string {
  return JSON.stringify([userId, f])
}

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

const lineTtc = (l: any): number =>
  Number(l.montant_ttc || 0) > 0
    ? Number(l.montant_ttc)
    : Number(l.montant_ht || 0) * (1 + Number(l.tva ?? 20) / 100)

const lineHt = (l: any): number =>
  Number(l.montant_ht || 0) > 0
    ? Number(l.montant_ht)
    : Number(l.quantite || 0) * Number(l.prix_unitaire_ht || 0)

function emptyTotals(): Totals {
  return {
    revenueTTC: 0, revenueHT: 0, tvaCollected: 0, cogsTTC: 0, grossProfit: 0,
    expensesTTC: 0, expensesHT: 0, tvaDeductible: 0, netProfit: 0, margin: 0,
    invoicesCount: 0, productsSold: 0, avgSale: 0, activeCustomers: 0,
    purchasesTTC: 0, purchaseOrders: 0,
  }
}

/* ================================================================== */
/* Hook                                                               */
/* ================================================================== */

export function useReportData(filters: ReportFilters): ReportData {
  const { user } = useAuth()
  const [bundle, setBundle] = useState<RawBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const { start, end } = getDateRange(filters.dateRange, filters.customStart, filters.customEnd)
  const { start: prevStart, end: prevEnd } = getPreviousRange(start, end)

  const fetchAll = useCallback(async () => {
    if (!user?.id) { setBundle(null); return }
    if (filters.dateRange === 'custom' && (!filters.customStart || !filters.customEnd)) {
      setBundle(null)
      return
    }

    const key = sig(user.id, filters)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setBundle(cached.data)
      return
    }

    setLoading(true)
    try {
      const usePrev = filters.dateRange !== 'all' && prevStart != null && prevEnd != null

      // ── Parent documents (current + previous window) ──────────────
      const buildFact = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('factures')
          .select('id, numero, date_emission, created_at, client_id, statut, mode_paiement, reste_a_payer')
          .eq('user_id', user.id)
          .in('statut', ['payée', 'reste_a_payer'])
        q = applyDateFilter(q, 'date_emission', s, e)
        if (filters.invoiceStatus) q = q.eq('statut', filters.invoiceStatus)
        if (filters.clientId) q = q.eq('client_id', filters.clientId)
        if (filters.paymentMethod) q = q.eq('mode_paiement', filters.paymentMethod)
        return q
      }
      const buildVp = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('ventes_passagers')
          .select('id, numero, date, created_at')
          .eq('user_id', user.id)
        return applyDateFilter(q, 'date', s, e)
      }
      const buildBc = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('bons_commande')
          .select('id, numero, date_commande, created_at, fournisseur_id, statut')
          .eq('user_id', user.id)
          .in('statut', ['confirmé', 'livré', 'livrée'])
        q = applyDateFilter(q, 'date_commande', s, e)
        if (filters.supplierId) q = q.eq('fournisseur_id', filters.supplierId)
        return q
      }
      const buildDep = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('depenses')
          .select('id, categorie, montant_ht, montant_tva, montant_ttc, date_depense, mode_paiement, fournisseur_id')
          .eq('user_id', user.id)
        q = applyDateFilter(q, 'date_depense', s, e)
        if (filters.paymentMethod) q = q.eq('mode_paiement', filters.paymentMethod)
        if (filters.supplierId) q = q.eq('fournisseur_id', filters.supplierId)
        return q
      }

      const [
        factRes, vpRes, bcRes, depRes,
        prevFactRes, prevVpRes, prevBcRes, prevDepRes,
        prodRes, cliRes, fourRes, movRes,
      ] = await Promise.all([
        buildFact(start, end),
        // Walk-in sales aren't filtered by client/payment/status (no such columns).
        (filters.clientId || filters.invoiceStatus) ? Promise.resolve({ data: [] as any[] }) : buildVp(start, end),
        buildBc(start, end),
        buildDep(start, end),
        usePrev ? buildFact(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        usePrev && !(filters.clientId || filters.invoiceStatus) ? buildVp(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        usePrev ? buildBc(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        usePrev ? buildDep(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        supabase.from('produits').select(
          'id, designation, nom, reference, barcode, marque, image_url, prix_achat_ht, prix_achat_ttc, prix_vente_ttc, prix_vente_ht, taux_tva, stock_actuel, stock_min',
        ).eq('user_id', user.id),
        supabase.from('clients').select('id, nom, nom_societe').eq('user_id', user.id),
        supabase.from('fournisseurs').select('id, nom, nom_societe').eq('user_id', user.id),
        supabase.from('mouvements_stock').select('*').order('date_mouvement', { ascending: false }).limit(300),
      ])

      const produits = (prodRes.data as any[]) ?? []
      const prodById = new Map(produits.map((p) => [String(p.id), p]))
      const clientsRaw = (cliRes.data as any[]) ?? []
      const clientById = new Map(clientsRaw.map((c) => [String(c.id), c]))
      const fournRaw = (fourRes.data as any[]) ?? []
      const fournById = new Map(fournRaw.map((f) => [String(f.id), f]))

      const factures = (factRes.data as any[]) ?? []
      const ventes = (vpRes.data as any[]) ?? []
      const bons = (bcRes.data as any[]) ?? []
      const depenses = (depRes.data as any[]) ?? []
      const factById = new Map(factures.map((f) => [String(f.id), f]))
      const vpById = new Map(ventes.map((v) => [String(v.id), v]))
      const bcById = new Map(bons.map((b) => [String(b.id), b]))

      const prevFactures = ((prevFactRes as any).data as any[]) ?? []
      const prevVentes = ((prevVpRes as any).data as any[]) ?? []
      const prevBons = ((prevBcRes as any).data as any[]) ?? []
      const prevDepenses = ((prevDepRes as any).data as any[]) ?? []
      const prevFactById = new Map(prevFactures.map((f) => [String(f.id), f]))
      const prevVpById = new Map(prevVentes.map((v) => [String(v.id), v]))
      const prevBcById = new Map(prevBons.map((b) => [String(b.id), b]))

      // ── Line items ────────────────────────────────────────────────
      const inQ = (table: string, field: string, ids: any[]) =>
        ids.length ? supabase.from(table).select('*').in(field, ids) : Promise.resolve({ data: [] as any[] })

      const factIds = factures.map((f) => f.id)
      const vpIds = ventes.map((v) => v.id)
      const bcIds = bons.map((b) => b.id)
      const prevFactIds = prevFactures.map((f) => f.id)
      const prevVpIds = prevVentes.map((v) => v.id)
      const prevBcIds = prevBons.map((b) => b.id)

      const [
        factLignesRes, vpLignesRes, bcLignesRes,
        prevFactLignesRes, prevVpLignesRes, prevBcLignesRes,
      ] = await Promise.all([
        inQ('facture_lignes', 'facture_id', factIds),
        vpIds.length ? supabase.from('ventes_passagers_lignes').select('*') : Promise.resolve({ data: [] as any[] }),
        inQ('bon_commande_lignes', 'bon_commande_id', bcIds),
        inQ('facture_lignes', 'facture_id', prevFactIds),
        prevVpIds.length ? supabase.from('ventes_passagers_lignes').select('*') : Promise.resolve({ data: [] as any[] }),
        inQ('bon_commande_lignes', 'bon_commande_id', prevBcIds),
      ])

      const clientName = (id: any): string | null => {
        if (id == null) return null
        const c = clientById.get(String(id))
        return c ? (c.nom || c.nom_societe || null) : null
      }
      const matchesProduct = (pid: any) => !filters.productId || String(pid) === filters.productId
      const matchesCategory = (pid: any) => {
        if (!filters.category) return true
        const p = prodById.get(String(pid))
        return ((p?.marque || '').trim()) === filters.category
      }

      // Build current-period sale lines.
      const vpIdSet = new Set(vpIds.map((i) => String(i)))
      const buildSaleLines = (
        factLignes: any[], vpLignes: any[],
        fById: Map<string, any>, vById: Map<string, any>, vpSet: Set<string>,
      ): SaleLine[] => {
        const out: SaleLine[] = []
        for (const l of factLignes) {
          const parent = fById.get(String(l.facture_id))
          if (!parent) continue
          if (!matchesProduct(l.produit_id) || !matchesCategory(l.produit_id)) continue
          const p = prodById.get(String(l.produit_id))
          const qty = Number(l.quantite || 0)
          const tva = Number(l.tva ?? 20)
          const rTtc = lineTtc(l)
          const rHt = lineHt(l)
          const cHt = Number(p?.prix_achat_ht || 0) * qty
          const cTtc = Number(p?.prix_achat_ht || 0) * (1 + tva / 100) * qty
          out.push({
            key: `f-${l.id}`, produitId: l.produit_id != null ? String(l.produit_id) : null,
            parentId: String(parent.id), documentNumber: parent.numero ?? '—', source: 'facture',
            date: parent.date_emission, createdAt: parent.created_at || parent.date_emission,
            clientId: parent.client_id != null ? String(parent.client_id) : null,
            clientName: clientName(parent.client_id),
            designation: l.designation || p?.designation || p?.nom || '—',
            qty, tva, revenueTTC: rTtc, revenueHT: rHt, costTTC: cTtc, costHT: cHt,
            profit: rTtc - cTtc, paymentMethod: parent.mode_paiement || null, statut: parent.statut || null,
          })
        }
        for (const l of vpLignes) {
          const k = l.vp_id ?? l.vente_passager_id
          if (k == null || !vpSet.has(String(k))) continue
          const parent = vById.get(String(k))
          if (!parent) continue
          if (!matchesProduct(l.produit_id) || !matchesCategory(l.produit_id)) continue
          const p = prodById.get(String(l.produit_id))
          const qty = Number(l.quantite || 0)
          const tva = Number(l.tva ?? 20)
          const rTtc = lineTtc(l)
          const rHt = lineHt(l)
          const cHt = Number(p?.prix_achat_ht || 0) * qty
          const cTtc = Number(p?.prix_achat_ht || 0) * (1 + tva / 100) * qty
          out.push({
            key: `v-${l.id}`, produitId: l.produit_id != null ? String(l.produit_id) : null,
            parentId: String(parent.id), documentNumber: parent.numero ?? '—', source: 'vente_passager',
            date: parent.date, createdAt: parent.created_at || parent.date,
            clientId: null, clientName: null,
            designation: l.designation || p?.designation || p?.nom || '—',
            qty, tva, revenueTTC: rTtc, revenueHT: rHt, costTTC: cTtc, costHT: cHt,
            profit: rTtc - cTtc, paymentMethod: null, statut: null,
          })
        }
        return out
      }

      const saleLines = buildSaleLines(
        (factLignesRes as any).data ?? [], (vpLignesRes as any).data ?? [],
        factById, vpById, vpIdSet,
      )
      const prevVpIdSet = new Set(prevVpIds.map((i) => String(i)))
      const prevSaleLines = buildSaleLines(
        (prevFactLignesRes as any).data ?? [], (prevVpLignesRes as any).data ?? [],
        prevFactById, prevVpById, prevVpIdSet,
      )

      // Build purchase lines.
      const buildPurchaseLines = (bcLignes: any[], bById: Map<string, any>): PurchaseLine[] => {
        const out: PurchaseLine[] = []
        for (const l of bcLignes) {
          const parent = bById.get(String(l.bon_commande_id))
          if (!parent) continue
          if (!matchesProduct(l.produit_id) || !matchesCategory(l.produit_id)) continue
          const p = prodById.get(String(l.produit_id))
          const f = parent.fournisseur_id != null ? fournById.get(String(parent.fournisseur_id)) : null
          const qty = Number(l.quantite || 0)
          const tva = Number(l.tva ?? 20)
          const cHt = lineHt(l)
          const cTtc = lineTtc(l)
          out.push({
            key: `bc-${l.id}`, produitId: l.produit_id != null ? String(l.produit_id) : null,
            bonId: String(parent.id), documentNumber: parent.numero ?? '—',
            date: parent.date_commande,
            supplierId: parent.fournisseur_id != null ? String(parent.fournisseur_id) : null,
            supplierName: f ? (f.nom || f.nom_societe || null) : null,
            designation: l.designation || p?.designation || p?.nom || '—',
            qty, costTTC: cTtc, costHT: cHt,
          })
        }
        return out
      }
      const purchaseLines = buildPurchaseLines((bcLignesRes as any).data ?? [], bcById)

      // ── Per-product aggregation ────────────────────────────────────
      const supplierByProduct = new Map<string, string | null>()
      for (const pl of purchaseLines) {
        if (pl.produitId && !supplierByProduct.has(pl.produitId)) {
          supplierByProduct.set(pl.produitId, pl.supplierName)
        }
      }
      const productAgg = new Map<string, ProductRow>()
      const ensureProduct = (pid: string): ProductRow => {
        let row = productAgg.get(pid)
        if (!row) {
          const p = prodById.get(pid)
          row = {
            id: pid, name: p?.designation || p?.nom || '—', barcode: p?.barcode ?? null,
            brand: (p?.marque || '').trim() || null, imageUrl: p?.image_url ?? null,
            supplierName: supplierByProduct.get(pid) ?? null,
            stock: Number(p?.stock_actuel || 0), stockMin: Number(p?.stock_min || 0),
            prixAchatHt: Number(p?.prix_achat_ht || 0),
            prixAchatTtc: Number(p?.prix_achat_ttc || 0) > 0 ? Number(p?.prix_achat_ttc) : Number(p?.prix_achat_ht || 0) * (1 + Number(p?.taux_tva ?? 20) / 100),
            prixVenteTtc: Number(p?.prix_vente_ttc || 0) > 0 ? Number(p?.prix_vente_ttc) : Number(p?.prix_vente_ht || 0) * (1 + Number(p?.taux_tva ?? 20) / 100),
            tva: Number(p?.taux_tva ?? 20),
            qtySold: 0, qtyPurchased: 0, revenueTTC: 0, revenueHT: 0, costTTC: 0,
            profit: 0, margin: 0, avgSellPrice: 0, lastSale: null, lastPurchase: null,
          }
          productAgg.set(pid, row)
        }
        return row
      }
      for (const sl of saleLines) {
        if (!sl.produitId) continue
        const row = ensureProduct(sl.produitId)
        row.qtySold += sl.qty
        row.revenueTTC += sl.revenueTTC
        row.revenueHT += sl.revenueHT
        row.costTTC += sl.costTTC
        if (!row.lastSale || new Date(sl.date) > new Date(row.lastSale)) row.lastSale = sl.date
      }
      for (const pl of purchaseLines) {
        if (!pl.produitId) continue
        const row = ensureProduct(pl.produitId)
        row.qtyPurchased += pl.qty
        if (!row.lastPurchase || new Date(pl.date) > new Date(row.lastPurchase)) row.lastPurchase = pl.date
      }
      const products: ProductRow[] = []
      for (const row of productAgg.values()) {
        row.profit = row.revenueTTC - row.costTTC
        row.margin = row.revenueTTC > 0 ? (row.profit / row.revenueTTC) * 100 : 0
        row.avgSellPrice = row.qtySold > 0 ? row.revenueTTC / row.qtySold : 0
        products.push(row)
      }
      products.sort((a, b) => b.revenueTTC - a.revenueTTC)

      // ── Per-client aggregation ─────────────────────────────────────
      const clientAgg = new Map<string, ClientRow>()
      for (const sl of saleLines) {
        if (sl.source !== 'facture' || !sl.clientId) continue
        let row = clientAgg.get(sl.clientId)
        if (!row) {
          row = {
            id: sl.clientId, name: sl.clientName || '—', invoices: 0,
            revenueTTC: 0, profit: 0, avgInvoice: 0, outstanding: 0,
            lastPurchase: null, firstPurchase: null,
          }
          clientAgg.set(sl.clientId, row)
        }
        row.revenueTTC += sl.revenueTTC
        row.profit += sl.profit
        if (!row.lastPurchase || new Date(sl.date) > new Date(row.lastPurchase)) row.lastPurchase = sl.date
        if (!row.firstPurchase || new Date(sl.date) < new Date(row.firstPurchase)) row.firstPurchase = sl.date
      }
      // Distinct invoices + outstanding per client.
      const invoiceClientPairs = new Set<string>()
      for (const f of factures) {
        const cid = f.client_id != null ? String(f.client_id) : null
        if (!cid) continue
        const row = clientAgg.get(cid)
        if (!row) continue
        const pairKey = `${cid}:${f.id}`
        if (!invoiceClientPairs.has(pairKey)) {
          invoiceClientPairs.add(pairKey)
          row.invoices += 1
        }
        if (f.statut === 'reste_a_payer') row.outstanding += Number(f.reste_a_payer || 0)
      }
      const clients: ClientRow[] = []
      for (const row of clientAgg.values()) {
        row.avgInvoice = row.invoices > 0 ? row.revenueTTC / row.invoices : 0
        clients.push(row)
      }
      clients.sort((a, b) => b.revenueTTC - a.revenueTTC)

      // ── Per-supplier aggregation ───────────────────────────────────
      const supplierAgg = new Map<string, SupplierRow & { _prodSet: Set<string>; _orderSet: Set<string> }>()
      for (const pl of purchaseLines) {
        const sid = pl.supplierId ?? 'none'
        let row = supplierAgg.get(sid)
        if (!row) {
          row = {
            id: sid, name: pl.supplierName || '—', orders: 0, products: 0,
            amountTTC: 0, avgPurchase: 0, _prodSet: new Set(), _orderSet: new Set(),
          }
          supplierAgg.set(sid, row)
        }
        row.amountTTC += pl.costTTC
        row._orderSet.add(pl.bonId)
        if (pl.produitId) row._prodSet.add(pl.produitId)
      }
      const suppliers: SupplierRow[] = []
      for (const row of supplierAgg.values()) {
        row.orders = row._orderSet.size
        row.products = row._prodSet.size
        row.avgPurchase = row.orders > 0 ? row.amountTTC / row.orders : 0
        const { _prodSet, _orderSet, ...clean } = row
        suppliers.push(clean)
      }
      suppliers.sort((a, b) => b.amountTTC - a.amountTTC)

      // ── Expenses ────────────────────────────────────────────────────
      const supplierName = (id: any): string | null => {
        if (id == null) return null
        const f = fournById.get(String(id))
        return f ? (f.nom || f.nom_societe || null) : null
      }
      const expenses: ExpenseRow[] = depenses.map((d) => ({
        id: String(d.id), categorie: d.categorie || 'autre', supplierName: supplierName(d.fournisseur_id),
        montantTTC: Number(d.montant_ttc || 0), date: d.date_depense, paymentMethod: d.mode_paiement || null,
      }))

      // ── Stock movements ─────────────────────────────────────────────
      const movementsRaw = (movRes.data as any[]) ?? []
      const movements: StockMovement[] = movementsRaw
        .filter((m) => !filters.productId || String(m.produit_id) === filters.productId)
        .map((m) => ({
          id: String(m.id), produitId: m.produit_id != null ? String(m.produit_id) : null,
          productName: prodById.get(String(m.produit_id))?.designation || prodById.get(String(m.produit_id))?.nom || '—',
          type: m.type || '—', qty: Number(m.quantite || 0), date: m.date_mouvement,
          reference: m.reference_document || null, entite: m.entite_nom || null,
        }))

      // ── Stock valuation (whole catalog, respecting product/category filters) ──
      let stockValuationPurchase = 0
      let stockValuationSelling = 0
      for (const p of produits) {
        if (filters.productId && String(p.id) !== filters.productId) continue
        if (filters.category && (p.marque || '').trim() !== filters.category) continue
        const stock = Number(p.stock_actuel || 0)
        const tva = Number(p.taux_tva ?? 20)
        const achatTtc = Number(p.prix_achat_ttc || 0) > 0 ? Number(p.prix_achat_ttc) : Number(p.prix_achat_ht || 0) * (1 + tva / 100)
        const venteTtc = Number(p.prix_vente_ttc || 0) > 0 ? Number(p.prix_vente_ttc) : Number(p.prix_vente_ht || 0) * (1 + tva / 100)
        stockValuationPurchase += stock * achatTtc
        stockValuationSelling += stock * venteTtc
      }

      // ── Distinct payment methods & categories for the filter bar ──────
      const paymentMethods = Array.from(new Set([
        ...factures.map((f) => f.mode_paiement).filter(Boolean),
        ...depenses.map((d) => d.mode_paiement).filter(Boolean),
      ] as string[])).sort()
      const categories = Array.from(new Set(
        produits.map((p) => (p.marque || '').trim()).filter(Boolean),
      )).sort()

      const prevExpenses: ExpenseRow[] = prevDepenses.map((d) => ({
        id: String(d.id), categorie: d.categorie || 'autre', supplierName: null,
        montantTTC: Number(d.montant_ttc || 0), date: d.date_depense, paymentMethod: d.mode_paiement || null,
      }))
      const prevPurchaseTTC = prevBons.reduce((s, b) => s + 0, 0) // computed from lines below
      const prevBcLignes = (prevBcLignesRes as any).data ?? []
      const prevPurchaseTTCReal = prevBcLignes.reduce((s: number, l: any) => s + lineTtc(l), 0)

      const data: RawBundle = {
        saleLines, purchaseLines, products, clients, suppliers, expenses, movements,
        stockValuationPurchase, stockValuationSelling, paymentMethods, categories,
        prevSaleLines, prevExpenses,
        prevPurchaseTTC: prevPurchaseTTCReal || prevPurchaseTTC,
        prevPurchaseOrders: prevBons.length,
      }
      cache.set(key, { at: Date.now(), data })
      setBundle(data)
    } catch {
      setBundle(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, JSON.stringify(filters), nonce])

  useEffect(() => { fetchAll() }, [fetchAll])

  const refresh = useCallback(() => {
    if (user?.id) cache.delete(sig(user.id, filters))
    setNonce((n) => n + 1)
  }, [user?.id, filters])

  // ── Totals derivation ───────────────────────────────────────────────
  const computeTotals = (
    saleLines: SaleLine[], expenses: ExpenseRow[], purchaseLines: PurchaseLine[],
  ): Totals => {
    const t = emptyTotals()
    const saleDocs = new Set<string>()
    const customers = new Set<string>()
    for (const sl of saleLines) {
      t.revenueTTC += sl.revenueTTC
      t.revenueHT += sl.revenueHT
      t.tvaCollected += sl.revenueTTC - sl.revenueHT
      t.cogsTTC += sl.costTTC
      t.productsSold += sl.qty
      saleDocs.add(`${sl.source}:${sl.parentId}`)
      if (sl.clientId) customers.add(sl.clientId)
    }
    t.grossProfit = t.revenueTTC - t.cogsTTC
    t.expensesTTC = expenses.reduce((s, e) => s + e.montantTTC, 0)
    // Deductible TVA from purchase lines (BC) + expenses (approx expense TVA at 20%).
    t.tvaDeductible = purchaseLines.reduce((s, p) => s + (p.costTTC - p.costHT), 0)
      + expenses.reduce((s, e) => s + (e.montantTTC - e.montantTTC / 1.2), 0)
    t.netProfit = t.revenueTTC - t.expensesTTC
    t.margin = t.revenueTTC > 0 ? (t.grossProfit / t.revenueTTC) * 100 : 0
    t.invoicesCount = saleDocs.size
    t.avgSale = saleDocs.size > 0 ? t.revenueTTC / saleDocs.size : 0
    t.activeCustomers = customers.size
    t.purchasesTTC = purchaseLines.reduce((s, p) => s + p.costTTC, 0)
    t.purchaseOrders = new Set(purchaseLines.map((p) => p.bonId)).size
    return t
  }

  return useMemo<ReportData>(() => {
    if (!bundle) {
      return {
        saleLines: [], purchaseLines: [], products: [], clients: [], suppliers: [],
        expenses: [], movements: [], totals: emptyTotals(), prevTotals: emptyTotals(),
        stockValuationPurchase: 0, stockValuationSelling: 0,
        paymentMethods: [], categories: [], loading, refresh,
      }
    }
    const totals = computeTotals(bundle.saleLines, bundle.expenses, bundle.purchaseLines)
    const prevTotals = computeTotals(bundle.prevSaleLines, bundle.prevExpenses, [])
    // Previous-period purchase totals come from the prev BC aggregate captured at fetch.
    prevTotals.purchasesTTC = bundle.prevPurchaseTTC
    prevTotals.purchaseOrders = bundle.prevPurchaseOrders
    return {
      saleLines: bundle.saleLines, purchaseLines: bundle.purchaseLines, products: bundle.products,
      clients: bundle.clients, suppliers: bundle.suppliers, expenses: bundle.expenses,
      movements: bundle.movements, totals, prevTotals,
      stockValuationPurchase: bundle.stockValuationPurchase, stockValuationSelling: bundle.stockValuationSelling,
      paymentMethods: bundle.paymentMethods, categories: bundle.categories, loading, refresh,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, loading])
}
