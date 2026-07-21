import React, {
  Suspense, useCallback, useEffect, useMemo, useRef, useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays, Search, X, Package, Loader2, Boxes, DollarSign, TrendingUp,
  TrendingDown, Layers, Star, Tag, Image as ImageIcon, Eye, Trophy,
  ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Printer, Lightbulb,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatCurrencyLocale, formatAmount } from '@/lib/utils'
import {
  type DateRangeKey, getDateRange, getPreviousRange, applyDateFilter, toIntlLocale,
} from '@/lib/dateRange'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ProductDetailsModal, type AnalyticsProduct } from './ProductDetailsModal'

const AnalyticsCharts = React.lazy(() => import('./charts/AnalyticsCharts'))

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const ITEMS_PER_PAGE = 10
const SLOW_ITEMS_PER_PAGE = 10

interface ProduitOption {
  id: string | number
  designation?: string
  nom?: string
  reference?: string
  barcode?: string
  marque?: string
}

// A raw sale line joined to its parent date (internal aggregation input).
interface SaleLine {
  produitId: string
  date: string
  qty: number
  revenueTTC: number
  tva: number
}

const emptyProduct: Omit<AnalyticsProduct, 'produitId' | 'name'> = {
  barcode: null, brand: null, imageUrl: null, stock: 0,
  qtySold: 0, revenueTTC: 0, profit: 0, margin: 0, avgPrice: 0,
}

interface AggProduct extends AnalyticsProduct {
  cogsTTC: number
  salesCount: number
  lastSaleDate: string | null
  trendPct: number | null   // vs previous period (null when no prior data)
}

export function ProductAnalytics() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const isRTL = lang.startsWith('ar')
  const dateFmt = toIntlLocale(lang)
  const tp = (key: string, opts?: Record<string, unknown>): string =>
    t(`dashboard.product_analytics.${key}`, opts as any) as unknown as string
  const fmt = (n: number | null | undefined) => formatCurrencyLocale(n ?? 0, lang)

  // ── Filters ────────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRangeKey>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [brand, setBrand] = useState<string>('all')

  // Product autocomplete
  const [productQuery, setProductQuery] = useState('')
  const [productOptions, setProductOptions] = useState<ProduitOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProduitOption | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const productBoxRef = useRef<HTMLDivElement>(null)

  // ── Data ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<AggProduct[]>([])
  const [evolution, setEvolution] = useState<Array<{ name: string; revenue: number; qty: number }>>([])
  const [brands, setBrands] = useState<string[]>([])

  // ── UI state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('overview')
  const [topPage, setTopPage] = useState(1)
  const [slowPage, setSlowPage] = useState(1)
  const [detailProduct, setDetailProduct] = useState<AnalyticsProduct | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { start: filterStart, end: filterEnd } = getDateRange(dateRange, customStart, customEnd)

  // ── Close product dropdown on outside click ──────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // ── Distinct brands for the category filter ──────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('produits').select('marque').eq('user_id', user.id)
      if (cancelled) return
      const set = new Set<string>()
      for (const p of (data as any[]) ?? []) {
        const m = (p.marque || '').trim()
        if (m) set.add(m)
      }
      setBrands(Array.from(set).sort((a, b) => a.localeCompare(b)))
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // ── Product search (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !dropdownOpen) return
    const term = productQuery.trim()
    const handle = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        let q = supabase
          .from('produits')
          .select('id, designation, nom, reference, barcode, marque')
          .eq('user_id', user.id)
        if (term) {
          const like = `%${term}%`
          q = q.or(
            `designation.ilike.${like},nom.ilike.${like},reference.ilike.${like},barcode.ilike.${like}`,
          )
        }
        q = q.order('designation').limit(20)
        const { data } = await q
        setProductOptions((data as ProduitOption[]) ?? [])
      } catch {
        setProductOptions([])
      } finally {
        setSearchingProducts(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [productQuery, dropdownOpen, user?.id])

  const productLabel = (p: ProduitOption) => p.designation || p.nom || tp('unknown_product')

  // ── Core aggregation fetch ───────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    if (!user?.id) {
      setProducts([])
      setEvolution([])
      return
    }
    setLoading(true)
    try {
      const { start: prevStart, end: prevEnd } = getPreviousRange(filterStart, filterEnd)

      // Fetch current + previous period parent documents in parallel.
      const buildFact = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('factures')
          .select('id, date_emission, statut')
          .eq('user_id', user.id)
          .in('statut', ['payée', 'reste_a_payer'])
        return applyDateFilter(q, 'date_emission', s, e)
      }
      const buildVp = (s: Date | null, e: Date | null) => {
        let q = supabase
          .from('ventes_passagers')
          .select('id, date')
          .eq('user_id', user.id)
        return applyDateFilter(q, 'date', s, e)
      }

      const usePrev = dateRange !== 'all' && prevStart != null && prevEnd != null
      const [factRes, vpRes, prevFactRes, prevVpRes, prodRes] = await Promise.all([
        buildFact(filterStart, filterEnd),
        buildVp(filterStart, filterEnd),
        usePrev ? buildFact(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        usePrev ? buildVp(prevStart, prevEnd) : Promise.resolve({ data: [] as any[] }),
        supabase.from('produits').select(
          'id, designation, nom, reference, barcode, marque, image_url, prix_achat_ht, prix_achat_ttc, taux_tva, stock_actuel',
        ).eq('user_id', user.id),
      ])

      const produits = (prodRes.data as any[]) ?? []
      const prodById = new Map(produits.map((p) => [String(p.id), p]))

      const factures = (factRes.data as any[]) ?? []
      const ventes = (vpRes.data as any[]) ?? []
      const factById = new Map(factures.map((f) => [String(f.id), f]))
      const vpById = new Map(ventes.map((v) => [String(v.id), v]))
      const factIds = factures.map((f) => f.id)
      const vpIds = ventes.map((v) => v.id)

      const prevFactIds = ((prevFactRes as any).data as any[] ?? []).map((f) => f.id)
      const prevVpIds = ((prevVpRes as any).data as any[] ?? []).map((v) => v.id)

      // Fetch line items for current + previous windows.
      const inChunks = (table: string, field: string, ids: any[]) =>
        ids.length ? supabase.from(table).select('*').in(field, ids) : Promise.resolve({ data: [] as any[] })

      const [factLignesRes, vpLignesRes, prevFactLignesRes, prevVpLignesRes] = await Promise.all([
        inChunks('facture_lignes', 'facture_id', factIds),
        vpIds.length ? supabase.from('ventes_passagers_lignes').select('*') : Promise.resolve({ data: [] as any[] }),
        inChunks('facture_lignes', 'facture_id', prevFactIds),
        prevVpIds.length ? supabase.from('ventes_passagers_lignes').select('*') : Promise.resolve({ data: [] as any[] }),
      ])

      const lineTtc = (l: any): number =>
        Number(l.montant_ttc || 0) > 0
          ? Number(l.montant_ttc)
          : Number(l.montant_ht || 0) * (1 + Number(l.tva ?? 20) / 100)

      // Build current-period sale lines.
      const vpIdSet = new Set(vpIds.map((id) => String(id)))
      const lines: SaleLine[] = []
      for (const l of (factLignesRes as any).data ?? []) {
        const parent = factById.get(String(l.facture_id))
        if (!parent || l.produit_id == null) continue
        lines.push({
          produitId: String(l.produit_id),
          date: parent.date_emission,
          qty: Number(l.quantite || 0),
          revenueTTC: lineTtc(l),
          tva: Number(l.tva ?? 20),
        })
      }
      for (const l of (vpLignesRes as any).data ?? []) {
        const key = l.vp_id ?? l.vente_passager_id
        if (key == null || !vpIdSet.has(String(key)) || l.produit_id == null) continue
        const parent = vpById.get(String(key))
        if (!parent) continue
        lines.push({
          produitId: String(l.produit_id),
          date: parent.date,
          qty: Number(l.quantite || 0),
          revenueTTC: lineTtc(l),
          tva: Number(l.tva ?? 20),
        })
      }

      // Previous-period qty per product (for trend).
      const prevVpIdSet = new Set(prevVpIds.map((id) => String(id)))
      const prevQtyByProduct = new Map<string, number>()
      for (const l of (prevFactLignesRes as any).data ?? []) {
        if (l.produit_id == null) continue
        prevQtyByProduct.set(String(l.produit_id), (prevQtyByProduct.get(String(l.produit_id)) ?? 0) + Number(l.quantite || 0))
      }
      for (const l of (prevVpLignesRes as any).data ?? []) {
        const key = l.vp_id ?? l.vente_passager_id
        if (key == null || !prevVpIdSet.has(String(key)) || l.produit_id == null) continue
        prevQtyByProduct.set(String(l.produit_id), (prevQtyByProduct.get(String(l.produit_id)) ?? 0) + Number(l.quantite || 0))
      }

      // Aggregate per product.
      const aggMap = new Map<string, AggProduct>()
      for (const line of lines) {
        const p = prodById.get(line.produitId)
        // Respect the brand filter (products with no brand excluded when a specific brand is chosen).
        if (brand !== 'all') {
          const m = (p?.marque || '').trim()
          if (m !== brand) continue
        }
        // Respect the single-product filter.
        if (selectedProduct?.id != null && String(selectedProduct.id) !== line.produitId) continue

        let agg = aggMap.get(line.produitId)
        if (!agg) {
          const costHt = Number(p?.prix_achat_ht || 0)
          agg = {
            ...emptyProduct,
            produitId: line.produitId,
            name: p?.designation || p?.nom || tp('unknown_product'),
            barcode: p?.barcode ?? null,
            brand: (p?.marque || '').trim() || null,
            imageUrl: p?.image_url ?? null,
            stock: Number(p?.stock_actuel || 0),
            cogsTTC: 0,
            salesCount: 0,
            lastSaleDate: null,
            trendPct: null,
          }
          aggMap.set(line.produitId, agg)
        }
        agg.qtySold += line.qty
        agg.revenueTTC += line.revenueTTC
        agg.cogsTTC += Number(p?.prix_achat_ht || 0) * (1 + line.tva / 100) * line.qty
        agg.salesCount += 1
        if (!agg.lastSaleDate || new Date(line.date) > new Date(agg.lastSaleDate)) {
          agg.lastSaleDate = line.date
        }
      }

      // Finalize derived metrics.
      const finalized: AggProduct[] = []
      for (const agg of aggMap.values()) {
        agg.profit = agg.revenueTTC - agg.cogsTTC
        agg.margin = agg.revenueTTC > 0 ? (agg.profit / agg.revenueTTC) * 100 : 0
        agg.avgPrice = agg.qtySold > 0 ? agg.revenueTTC / agg.qtySold : 0
        const prevQty = prevQtyByProduct.get(agg.produitId) ?? 0
        agg.trendPct = usePrev && prevQty > 0
          ? ((agg.qtySold - prevQty) / prevQty) * 100
          : (usePrev && agg.qtySold > 0 ? 100 : null)
        finalized.push(agg)
      }
      finalized.sort((a, b) => b.qtySold - a.qtySold)

      // Build the sales-evolution series (daily ≤31 days else monthly).
      const evo = buildEvolution(lines, filterStart, filterEnd, (mi) => t(`dashboard.chart.months.${MONTH_KEYS[mi]}`))

      setProducts(finalized)
      setEvolution(evo)
      setTopPage(1)
      setSlowPage(1)
    } catch {
      setProducts([])
      setEvolution([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dateRange, customStart, customEnd, brand, selectedProduct?.id, lang])

  useEffect(() => {
    if (dateRange === 'custom' && (!customStart || !customEnd)) {
      setProducts([])
      setEvolution([])
      return
    }
    fetchAnalytics()
  }, [fetchAnalytics, dateRange, customStart, customEnd])

  // ── Derived: KPIs ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalQty = products.reduce((s, p) => s + p.qtySold, 0)
    const totalRevenue = products.reduce((s, p) => s + p.revenueTTC, 0)
    const totalProfit = products.reduce((s, p) => s + p.profit, 0)
    const distinct = products.length
    const salesCount = products.reduce((s, p) => s + p.salesCount, 0)
    const avgSale = salesCount > 0 ? totalRevenue / salesCount : 0
    const best = products[0] ?? null
    return { totalQty, totalRevenue, totalProfit, distinct, avgSale, best }
  }, [products])

  // ── Derived: charts ───────────────────────────────────────────────────────
  const top10Chart = useMemo(
    () => products.slice(0, 10).map((p) => ({ name: truncate(p.name, 22), revenue: p.revenueTTC })),
    [products],
  )
  const distributionChart = useMemo(() => {
    const top = products.slice(0, 8)
    const rest = products.slice(8)
    const slices = top.map((p) => ({ name: truncate(p.name, 18), value: p.revenueTTC }))
    const othersVal = rest.reduce((s, p) => s + p.revenueTTC, 0)
    if (othersVal > 0) slices.push({ name: tp('chart_others'), value: othersVal })
    return slices
  }, [products])

  // ── Derived: insights ─────────────────────────────────────────────────────
  const insights = useMemo(() => buildInsights(products, { tp, fmt }), [products, lang])

  // ── Derived: slow movers ───────────────────────────────────────────────────
  const slowMovers = useMemo(() => {
    return [...products]
      .sort((a, b) => a.qtySold - b.qtySold || b.stock - a.stock)
  }, [products])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const topTotalPages = Math.max(1, Math.ceil(products.length / ITEMS_PER_PAGE))
  const topRows = products.slice((topPage - 1) * ITEMS_PER_PAGE, topPage * ITEMS_PER_PAGE)
  const slowTotalPages = Math.max(1, Math.ceil(slowMovers.length / SLOW_ITEMS_PER_PAGE))
  const slowRows = slowMovers.slice((slowPage - 1) * SLOW_ITEMS_PER_PAGE, slowPage * SLOW_ITEMS_PER_PAGE)

  const rangeLabel = () =>
    filterStart && filterEnd
      ? `${filterStart.toLocaleDateString(dateFmt)} – ${filterEnd.toLocaleDateString(dateFmt)}`
      : t('dashboard.date_range.all_time')

  const openDetails = (p: AggProduct) => {
    setDetailProduct(p)
    setDetailOpen(true)
  }

  const daysSince = (iso: string | null): number | null => {
    if (!iso) return null
    const diff = Date.now() - new Date(iso).getTime()
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportRows = () =>
    products.map((p, i) => ({
      '#': i + 1,
      [tp('col_product')]: p.name,
      [tp('col_barcode')]: p.barcode ?? '',
      [tp('col_category')]: p.brand ?? '',
      [tp('col_qty')]: p.qtySold,
      [tp('col_revenue')]: Number(p.revenueTTC.toFixed(2)),
      [tp('col_profit')]: Number(p.profit.toFixed(2)),
      [tp('col_avg_price')]: Number(p.avgPrice.toFixed(2)),
      [tp('col_stock')]: p.stock,
    }))

  const handleExportExcel = async () => {
    if (products.length === 0) { toast.error(tp('toast_no_data')); return }
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(exportRows())
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, tp('export_sheet_name'))
      XLSX.writeFile(wb, `${tp('export_filename')}.xlsx`)
      toast.success(tp('toast_excel_success'))
    } catch {
      toast.error(tp('toast_excel_error'))
    }
  }

  const handleExportPDF = async () => {
    if (products.length === 0) { toast.error(tp('toast_no_data')); return }
    try {
      const { default: JsPDF } = await import('jspdf')
      const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const marginX = 30
      let y = 40
      doc.setFontSize(14)
      doc.text(tp('title'), marginX, y)
      y += 16
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text(rangeLabel(), marginX, y)
      doc.setTextColor(0)
      y += 20
      const headers = ['#', tp('col_product'), tp('col_barcode'), tp('col_category'), tp('col_qty'), tp('col_revenue'), tp('col_profit'), tp('col_avg_price'), tp('col_stock')]
      const colX = [30, 60, 260, 360, 470, 540, 630, 720, 800]
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      headers.forEach((h, i) => doc.text(String(h), colX[i], y))
      doc.setFont('helvetica', 'normal')
      y += 4
      doc.line(marginX, y, 812, y)
      y += 12
      const pageHeight = doc.internal.pageSize.getHeight()
      products.forEach((p, idx) => {
        if (y > pageHeight - 30) { doc.addPage(); y = 40 }
        const cells = [
          String(idx + 1), truncate(p.name, 34), p.barcode ?? '', truncate(p.brand ?? '', 16),
          String(p.qtySold), formatAmount(p.revenueTTC), formatAmount(p.profit),
          formatAmount(p.avgPrice), String(p.stock),
        ]
        cells.forEach((c, i) => doc.text(String(c), colX[i], y))
        y += 14
      })
      doc.save(`${tp('export_filename')}.pdf`)
      toast.success(tp('toast_pdf_success'))
    } catch {
      toast.error(tp('toast_pdf_error'))
    }
  }

  const handlePrint = () => {
    if (products.length === 0) { toast.error(tp('toast_no_data')); return }
    try {
      const headers = ['#', tp('col_product'), tp('col_barcode'), tp('col_category'), tp('col_qty'), tp('col_revenue'), tp('col_profit'), tp('col_avg_price'), tp('col_stock')]
      const body = products.map((p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.barcode ?? '')}</td>
        <td>${escapeHtml(p.brand ?? '')}</td>
        <td style="text-align:right">${p.qtySold}</td>
        <td style="text-align:right">${escapeHtml(fmt(p.revenueTTC))}</td>
        <td style="text-align:right">${escapeHtml(fmt(p.profit))}</td>
        <td style="text-align:right">${escapeHtml(fmt(p.avgPrice))}</td>
        <td style="text-align:right">${p.stock}</td>
      </tr>`).join('')
      const html = `<!doctype html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"/><title>${escapeHtml(tp('title'))}</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
          h1{font-size:18px;margin:0 0 4px}
          p{font-size:12px;color:#666;margin:0 0 16px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #ddd;padding:6px 8px;text-align:${isRTL ? 'right' : 'left'}}
          th{background:#f5f5f5;font-weight:bold}
        </style></head><body>
        <h1>${escapeHtml(tp('title'))}</h1>
        <p>${escapeHtml(rangeLabel())}</p>
        <table><thead><tr>${headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table>
      </body></html>`
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'; iframe.style.bottom = '0'
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'
      iframe.setAttribute('aria-hidden', 'true')
      document.body.appendChild(iframe)
      const cleanup = () => setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe) }, 1000)
      const doc = iframe.contentWindow?.document
      if (!doc) { cleanup(); toast.error(tp('toast_print_error')); return }
      doc.open(); doc.write(html); doc.close()
      if (iframe.contentWindow) iframe.contentWindow.onafterprint = cleanup
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          toast.success(tp('toast_print_success'))
        } catch {
          toast.error(tp('toast_print_error'))
        } finally { cleanup() }
      }, 300)
    } catch {
      toast.error(tp('toast_print_error'))
    }
  }

  const medal = (rank: number): string | null =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

  const Thumb = ({ url, alt }: { url: string | null; alt: string }) =>
    url ? (
      <img
        src={url}
        alt={alt}
        className="h-9 w-9 rounded-[4px] object-cover border border-border shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <div className="h-9 w-9 rounded-[4px] bg-muted flex items-center justify-center border border-dashed border-border shrink-0">
        <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
      </div>
    )

  const TrendCell = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-muted-foreground text-xs">—</span>
    const positive = pct >= 0
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-xs font-semibold',
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}
        dir="ltr"
      >
        {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        {Math.abs(pct).toFixed(0)}%
      </span>
    )
  }

  return (
    <Card className="shadow-none rounded-[6px]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header banner */}
      <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-4 sm:px-6 py-3 sm:py-4 border-b border-primary/10 flex items-center gap-3">
        <div className="p-2 rounded-[6px] bg-primary/10 shrink-0">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground text-sm sm:text-base">{tp('title')}</h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground">{tp('subtitle')}</p>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          {/* Date */}
          <div className="space-y-2 min-w-0">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {tp('date_label')}
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              {(['today', 'yesterday', 'this_week', 'this_month', 'this_year'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setDateRange(key)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md border transition-all',
                    dateRange === key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {t(`dashboard.date_range.${key}`)}
                </button>
              ))}
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder={t('dashboard.date_range.more')}>
                    {t(`dashboard.date_range.${dateRange}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['last_week', 'last_month', 'last_year', 'all', 'custom'] as const).map((key) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {t(`dashboard.date_range.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
                />
                <span className="text-xs text-muted-foreground">-</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* Brand (category) filter */}
          <div className="space-y-2 min-w-0">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              {tp('brand_label')}
            </label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue>{brand === 'all' ? tp('brand_all') : brand}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{tp('brand_all')}</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product autocomplete */}
          <div className="space-y-2 flex-1 min-w-0 lg:max-w-sm" ref={productBoxRef}>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              {tp('product_label')}
              <span className="font-normal text-muted-foreground/70">({tp('optional')})</span>
            </label>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={selectedProduct && !dropdownOpen ? productLabel(selectedProduct) : productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value)
                  if (!dropdownOpen) setDropdownOpen(true)
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder={tp('product_search_placeholder')}
                className="ps-9 pe-9 h-9 text-sm"
              />
              {(selectedProduct || productQuery) && (
                <button
                  type="button"
                  onClick={() => { setSelectedProduct(null); setProductQuery(''); setDropdownOpen(false) }}
                  aria-label={tp('clear')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-72 overflow-y-auto">
                  {searchingProducts ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tp('searching')}
                    </div>
                  ) : productOptions.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">{tp('no_products')}</div>
                  ) : (
                    <ul className="py-1">
                      {productOptions.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedProduct(p); setProductQuery(''); setDropdownOpen(false) }}
                            className={cn(
                              'w-full text-start px-3 py-2 hover:bg-accent transition-colors',
                              selectedProduct?.id === p.id && 'bg-accent',
                            )}
                          >
                            <p className="text-sm font-medium text-foreground truncate">{productLabel(p)}</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap" dir="ltr">
                              {p.reference && <span className="font-mono">{tp('ref_short')}: {p.reference}</span>}
                              {p.barcode && <span className="font-mono">{tp('barcode_short')}: {p.barcode}</span>}
                              {p.marque && <span>{p.marque}</span>}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active range hint */}
        <p className="text-[11px] text-muted-foreground -mt-1">
          <CalendarDays className="inline h-3 w-3 me-1" />
          {rangeLabel()}
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">{tp('loading')}</span>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overview">{tp('tab_overview')}</TabsTrigger>
              <TabsTrigger value="top">{tp('tab_top_products')}</TabsTrigger>
              <TabsTrigger value="slow">{tp('tab_slow_movers')}</TabsTrigger>
              <TabsTrigger value="insights">{tp('tab_insights')}</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="pt-4 space-y-5 animate-in fade-in duration-300">
              {/* KPI cards */}
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Best seller (custom card with thumbnail) */}
                <div className="rounded-[6px] bg-card p-3 border border-border col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    <Trophy className="h-3.5 w-3.5 text-amber-500" />
                    {tp('kpi_best_seller')}
                  </div>
                  {kpi.best ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <Thumb url={kpi.best.imageUrl} alt={kpi.best.name} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-card-foreground truncate">{kpi.best.name}</p>
                        <p className="text-[11px] text-muted-foreground" dir="ltr">
                          {tp('kpi_units_sold', { count: kpi.best.qtySold })} · {fmt(kpi.best.revenueTTC)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>

                <MiniKpi icon={Boxes} label={tp('kpi_total_qty')} value={kpi.totalQty.toLocaleString(dateFmt)} iconClass="bg-blue-50 border-blue-200/60 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400" />
                <MiniKpi icon={DollarSign} label={tp('kpi_total_revenue')} value={fmt(kpi.totalRevenue)} iconClass="bg-emerald-50 border-emerald-200/60 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400" />
                <MiniKpi icon={TrendingUp} label={tp('kpi_total_profit')} value={fmt(kpi.totalProfit)} valueClass={kpi.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} iconClass="bg-violet-50 border-violet-200/60 text-violet-600 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-400" />
                <MiniKpi icon={Package} label={tp('kpi_distinct_products')} value={kpi.distinct.toLocaleString(dateFmt)} iconClass="bg-rose-50 border-rose-200/60 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400" />
                <MiniKpi icon={Star} label={tp('kpi_avg_sale')} value={fmt(kpi.avgSale)} iconClass="bg-amber-50 border-amber-200/60 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400" />
              </div>

              {/* Charts */}
              {products.length === 0 ? (
                <EmptyState label={tp('empty')} />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard title={tp('chart_top10_title')}>
                    <Suspense fallback={<ChartFallback label={tp('chart_loading')} />}>
                      <AnalyticsCharts variant="top10" top10={top10Chart} isRTL={isRTL} />
                    </Suspense>
                  </ChartCard>
                  <ChartCard title={tp('chart_distribution_title')}>
                    <Suspense fallback={<ChartFallback label={tp('chart_loading')} />}>
                      <AnalyticsCharts variant="distribution" distribution={distributionChart} isRTL={isRTL} />
                    </Suspense>
                  </ChartCard>
                  <ChartCard title={tp('chart_evolution_title')} className="lg:col-span-2">
                    <Suspense fallback={<ChartFallback label={tp('chart_loading')} />}>
                      <AnalyticsCharts variant="evolution" evolution={evolution} isRTL={isRTL} />
                    </Suspense>
                  </ChartCard>
                </div>
              )}
            </TabsContent>

            {/* ── TOP PRODUCTS ─────────────────────────────────────────── */}
            <TabsContent value="top" className="pt-4 space-y-3 animate-in fade-in duration-300">
              <ExportBar
                tp={tp}
                onExcel={handleExportExcel}
                onPdf={handleExportPDF}
                onPrint={handlePrint}
                disabled={products.length === 0}
              />
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">{tp('col_rank')}</TableHead>
                      <TableHead>{tp('col_image')}</TableHead>
                      <TableHead>{tp('col_product')}</TableHead>
                      <TableHead>{tp('col_barcode')}</TableHead>
                      <TableHead>{tp('col_category')}</TableHead>
                      <TableHead className="text-end">{tp('col_qty')}</TableHead>
                      <TableHead className="text-end">{tp('col_revenue')}</TableHead>
                      <TableHead className="text-end">{tp('col_profit')}</TableHead>
                      <TableHead className="text-end">{tp('col_avg_price')}</TableHead>
                      <TableHead className="text-end">{tp('col_stock')}</TableHead>
                      <TableHead className="text-end">{tp('col_trend')}</TableHead>
                      <TableHead className="text-end">{tp('col_actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="h-32 text-center text-muted-foreground text-sm">
                          {tp('empty')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      topRows.map((p, idx) => {
                        const rank = (topPage - 1) * ITEMS_PER_PAGE + idx + 1
                        const m = medal(rank)
                        return (
                          <TableRow key={p.produitId}>
                            <TableCell className="font-bold tabular-nums" dir="ltr">
                              {m ? <span className="text-base">{m}</span> : rank}
                            </TableCell>
                            <TableCell><Thumb url={p.imageUrl} alt={p.name} /></TableCell>
                            <TableCell className="font-medium text-sm max-w-[200px] truncate">{p.name}</TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">{p.barcode || '—'}</TableCell>
                            <TableCell className="text-sm">{p.brand || '—'}</TableCell>
                            <TableCell className="text-end tabular-nums" dir="ltr">{p.qtySold}</TableCell>
                            <TableCell className="text-end tabular-nums whitespace-nowrap font-semibold" dir="ltr">{fmt(p.revenueTTC)}</TableCell>
                            <TableCell className={cn('text-end tabular-nums whitespace-nowrap font-semibold', p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} dir="ltr">{fmt(p.profit)}</TableCell>
                            <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">{fmt(p.avgPrice)}</TableCell>
                            <TableCell className="text-end tabular-nums" dir="ltr">{p.stock}</TableCell>
                            <TableCell className="text-end"><TrendCell pct={p.trendPct} /></TableCell>
                            <TableCell className="text-end">
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openDetails(p)}>
                                <Eye className="h-3.5 w-3.5 me-1" />
                                {tp('view_details')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pager
                tp={tp}
                page={topPage}
                totalPages={topTotalPages}
                total={products.length}
                perPage={ITEMS_PER_PAGE}
                onPrev={() => setTopPage((p) => Math.max(1, p - 1))}
                onNext={() => setTopPage((p) => Math.min(topTotalPages, p + 1))}
              />
            </TabsContent>

            {/* ── SLOW MOVERS ──────────────────────────────────────────── */}
            <TabsContent value="slow" className="pt-4 space-y-3 animate-in fade-in duration-300">
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tp('slow_col_product')}</TableHead>
                      <TableHead className="text-end">{tp('slow_col_qty')}</TableHead>
                      <TableHead className="text-end">{tp('slow_col_stock')}</TableHead>
                      <TableHead className="text-end">{tp('slow_col_last_sale')}</TableHead>
                      <TableHead className="text-end">{tp('slow_col_stock_value')}</TableHead>
                      <TableHead>{tp('slow_col_action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slowMovers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                          {tp('empty')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      slowRows.map((p) => {
                        const days = daysSince(p.lastSaleDate)
                        const stockValue = p.stock * (Number(prodAchatTtc(p)) || 0)
                        const highStockLowSales = p.stock > 0 && p.qtySold <= Math.max(2, p.stock * 0.1)
                        return (
                          <TableRow key={p.produitId}>
                            <TableCell className="font-medium text-sm max-w-[220px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <Thumb url={p.imageUrl} alt={p.name} />
                                <span className="truncate">{p.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-end tabular-nums" dir="ltr">{p.qtySold}</TableCell>
                            <TableCell className="text-end tabular-nums" dir="ltr">{p.stock}</TableCell>
                            <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">
                              {days === null ? tp('slow_never_sold') : tp('days_ago', { count: days })}
                            </TableCell>
                            <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">{fmt(stockValue)}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-semibold border-0 gap-1',
                                  highStockLowSales
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {highStockLowSales && <AlertTriangle className="h-3 w-3" />}
                                {highStockLowSales ? tp('slow_action_high_stock') : tp('slow_action_ok')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pager
                tp={tp}
                page={slowPage}
                totalPages={slowTotalPages}
                total={slowMovers.length}
                perPage={SLOW_ITEMS_PER_PAGE}
                onPrev={() => setSlowPage((p) => Math.max(1, p - 1))}
                onNext={() => setSlowPage((p) => Math.min(slowTotalPages, p + 1))}
              />
            </TabsContent>

            {/* ── INSIGHTS ─────────────────────────────────────────────── */}
            <TabsContent value="insights" className="pt-4 animate-in fade-in duration-300">
              {insights.length === 0 ? (
                <EmptyState label={tp('insight_none')} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {insights.map((ins, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-[6px] border p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300',
                        ins.tone === 'positive' && 'border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5',
                        ins.tone === 'negative' && 'border-red-200/60 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5',
                        ins.tone === 'neutral' && 'border-border bg-card',
                      )}
                    >
                      <Lightbulb className={cn(
                        'h-5 w-5 shrink-0 mt-0.5',
                        ins.tone === 'positive' ? 'text-emerald-500' : ins.tone === 'negative' ? 'text-red-500' : 'text-amber-500',
                      )} />
                      <p className="text-sm text-foreground leading-relaxed">{ins.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      <ProductDetailsModal product={detailProduct} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  )
}

// ─── Helpers & subcomponents ────────────────────────────────────────────────

// The AggProduct doesn't carry prix_achat_ttc; stock value uses a derived TTC
// cost. We stash the derived cost on avgPrice? No — recompute from margin-free
// data isn't possible, so we approximate purchase TTC cost = cogsTTC / qty.
function prodAchatTtc(p: { cogsTTC: number; qtySold: number }): number {
  return p.qtySold > 0 ? p.cogsTTC / p.qtySold : 0
}

function buildEvolution(
  lines: SaleLine[],
  start: Date | null,
  end: Date | null,
  monthLabel: (monthIndex: number) => string,
): Array<{ name: string; revenue: number; qty: number }> {
  const chartStart = start || (lines.length ? new Date(Math.min(...lines.map((l) => new Date(l.date).getTime()))) : new Date())
  const chartEnd = end || new Date()
  const daysDiff = Math.ceil((chartEnd.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24))
  const useDaily = daysDiff <= 31 && daysDiff >= 0

  const out: Array<{ name: string; revenue: number; qty: number }> = []
  if (useDaily) {
    const dayCount = Math.max(1, daysDiff + 1)
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(chartStart)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayLines = lines.filter((l) => new Date(l.date).toISOString().split('T')[0] === dateStr)
      out.push({
        name: d.getDate().toString(),
        revenue: dayLines.reduce((s, l) => s + l.revenueTTC, 0),
        qty: dayLines.reduce((s, l) => s + l.qty, 0),
      })
    }
  } else {
    const startMonth = chartStart.getMonth() + chartStart.getFullYear() * 12
    const endMonth = chartEnd.getMonth() + chartEnd.getFullYear() * 12
    const monthCount = Math.max(1, endMonth - startMonth + 1)
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(chartStart.getFullYear(), chartStart.getMonth() + i, 1)
      const m = d.getMonth()
      const y = d.getFullYear()
      const monthLines = lines.filter((l) => {
        const ld = new Date(l.date)
        return ld.getMonth() === m && ld.getFullYear() === y
      })
      out.push({
        name: monthLabel(m),
        revenue: monthLines.reduce((s, l) => s + l.revenueTTC, 0),
        qty: monthLines.reduce((s, l) => s + l.qty, 0),
      })
    }
  }
  return out
}

interface Insight { text: string; tone: 'positive' | 'negative' | 'neutral' }

function buildInsights(
  products: AggProduct[],
  { tp, fmt }: { tp: (k: string, o?: Record<string, unknown>) => string; fmt: (n: number) => string },
): Insight[] {
  if (products.length === 0) return []
  const out: Insight[] = []

  // Best seller (by qty — products already sorted desc).
  const best = products[0]
  if (best) out.push({ text: tp('insight_best_seller', { product: best.name, qty: best.qtySold }), tone: 'positive' })

  // Highest profit.
  const topProfit = [...products].sort((a, b) => b.profit - a.profit)[0]
  if (topProfit && topProfit.profit > 0) {
    out.push({ text: tp('insight_top_profit', { product: topProfit.name, amount: fmt(topProfit.profit) }), tone: 'positive' })
  }

  // Lowest margin (only among products that actually sold with revenue).
  const withRevenue = products.filter((p) => p.revenueTTC > 0)
  const lowMargin = [...withRevenue].sort((a, b) => a.margin - b.margin)[0]
  if (lowMargin) {
    out.push({ text: tp('insight_lowest_margin', { product: lowMargin.name, margin: lowMargin.margin.toFixed(1) }), tone: lowMargin.margin < 0 ? 'negative' : 'neutral' })
  }

  // Biggest growth vs previous period.
  const growth = [...products].filter((p) => p.trendPct !== null).sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0))[0]
  if (growth && (growth.trendPct ?? 0) > 0) {
    out.push({ text: tp('insight_growth', { product: growth.name, percent: (growth.trendPct ?? 0).toFixed(0) }), tone: 'positive' })
  }

  // Biggest drop vs previous period.
  const drop = [...products].filter((p) => p.trendPct !== null).sort((a, b) => (a.trendPct ?? 0) - (b.trendPct ?? 0))[0]
  if (drop && (drop.trendPct ?? 0) < 0) {
    out.push({ text: tp('insight_drop', { product: drop.name, percent: Math.abs(drop.trendPct ?? 0).toFixed(0) }), tone: 'negative' })
  }

  // High stock, low sales.
  const highStock = products.find((p) => p.stock > 0 && p.qtySold <= Math.max(2, p.stock * 0.1))
  if (highStock) {
    out.push({ text: tp('insight_high_stock', { product: highStock.name }), tone: 'neutral' })
  }

  return out
}

function MiniKpi({
  icon: Icon, label, value, iconClass, valueClass,
}: {
  icon: React.ElementType; label: string; value: string; iconClass: string; valueClass?: string
}) {
  return (
    <div className="rounded-[6px] bg-card p-3 border border-border animate-in fade-in duration-300">
      <div className="flex items-start justify-between mb-2">
        <span />
        <div className={cn('h-8 w-8 rounded-sm flex items-center justify-center shrink-0 border', iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground tracking-wide uppercase text-start line-clamp-2">{label}</p>
      <p className={cn('text-base sm:text-lg font-bold mt-0.5 tracking-tight text-start truncate', valueClass ?? 'text-card-foreground')} dir="ltr">{value}</p>
    </div>
  )
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[6px] border border-border bg-card p-4', className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</h4>
      <div className="h-64 w-full">{children}</div>
    </div>
  )
}

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12">
      <div className="bg-muted/50 rounded-[8px] p-4">
        <Package className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function ExportBar({
  tp, onExcel, onPdf, onPrint, disabled,
}: {
  tp: (k: string) => string
  onExcel: () => void; onPdf: () => void; onPrint: () => void; disabled: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={onExcel} disabled={disabled}>
        <FileSpreadsheet className="h-4 w-4 me-1.5" />{tp('export_excel')}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={onPdf} disabled={disabled}>
        <FileText className="h-4 w-4 me-1.5" />{tp('export_pdf')}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={onPrint} disabled={disabled}>
        <Printer className="h-4 w-4 me-1.5" />{tp('print')}
      </Button>
    </div>
  )
}

function Pager({
  tp, page, totalPages, total, perPage, onPrev, onNext,
}: {
  tp: (k: string, o?: Record<string, unknown>) => string
  page: number; totalPages: number; total: number; perPage: number
  onPrev: () => void; onNext: () => void
}) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-muted-foreground">
        {tp('showing', {
          from: (page - 1) * perPage + 1,
          to: Math.min(page * perPage, total),
          total,
        })}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={onPrev}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />{tp('prev')}
          </Button>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {tp('page_info', { current: page, total: totalPages })}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={onNext}>
            {tp('next')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
