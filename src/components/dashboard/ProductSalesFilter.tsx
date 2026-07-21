import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays, Search, X, Package, ShoppingCart, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, FileText, Printer,
  Boxes, DollarSign, ListChecks, Tag, Loader2, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatCurrencyLocale, formatAmount } from '@/lib/utils'
import {
  type DateRangeKey, getDateRange, applyDateFilter, toIntlLocale,
} from '@/lib/dateRange'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProduitOption {
  id: string | number
  designation?: string
  nom?: string
  reference?: string
  barcode?: string
  marque?: string
}

type SaleSource = 'facture' | 'vente_passager'

interface SaleRow {
  key: string
  date: string            // ISO date of the parent document
  produitId: string | null
  productName: string
  barcode: string | null
  quantite: number
  prixUnitaire: number    // unit price TTC (displayed tax-included)
  montant: number         // total TTC for the line
  source: SaleSource
  documentNumber: string
  clientName: string | null
}

type SortField =
  | 'date' | 'productName' | 'barcode' | 'quantite'
  | 'prixUnitaire' | 'montant' | 'source' | 'documentNumber' | 'clientName'
type SortDir = 'asc' | 'desc'

const ITEMS_PER_PAGE = 10

// ─── Component ─────────────────────────────────────────────────────────────

export function ProductSalesFilter() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const isRTL = lang.startsWith('ar')
  const dateFmt = toIntlLocale(lang)

  const tp = (key: string, opts?: Record<string, unknown>): string =>
    t(`dashboard.product_filter.${key}`, opts as any) as unknown as string
  const fmt = (n: number | null | undefined) => formatCurrencyLocale(n ?? 0, lang)

  // ── Filter state ───────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRangeKey>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // ── Product autocomplete ─────────────────────────────────────────────────
  const [productQuery, setProductQuery] = useState('')
  const [productOptions, setProductOptions] = useState<ProduitOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProduitOption | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const productBoxRef = useRef<HTMLDivElement>(null)

  // ── Results ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [resultSearch, setResultSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const { start: filterStart, end: filterEnd } = getDateRange(dateRange, customStart, customEnd)

  // ── Close product dropdown on outside click ───────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // ── Product search (debounced, indexed queries on designation/reference/barcode) ──
  useEffect(() => {
    if (!user?.id) return
    const term = productQuery.trim()
    if (!dropdownOpen) return

    const handle = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        let q = supabase
          .from('produits')
          .select('id, designation, nom, reference, barcode, marque')
          .eq('user_id', user.id)
        if (term) {
          const like = `%${term}%`
          // Search across name, barcode and reference/SKU.
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

  const productLabel = (p: ProduitOption) =>
    p.designation || p.nom || tp('unknown_product')

  // ── Core data fetch — optimized, loads only matching filtered data ─────────
  const fetchSales = useCallback(async () => {
    if (!user?.id) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      // 1) Fetch parent documents within the date range (indexed on user_id/date).
      //    We only pull the columns we need to keep payloads small.
      let factQuery = supabase
        .from('factures')
        .select('id, numero, date_emission, client_id, statut')
        .eq('user_id', user.id)
        .neq('statut', 'annulée')
      let vpQuery = supabase
        .from('ventes_passagers')
        .select('id, numero, date, client_nom')
        .eq('user_id', user.id)

      if (dateRange !== 'all') {
        factQuery = applyDateFilter(factQuery, 'date_emission', filterStart, filterEnd)
        vpQuery = applyDateFilter(vpQuery, 'date', filterStart, filterEnd)
      }

      const [factRes, vpRes] = await Promise.all([factQuery, vpQuery])
      const factures = (factRes.data as any[]) ?? []
      const ventesPassagers = (vpRes.data as any[]) ?? []

      const factById = new Map<string, any>()
      factures.forEach((f) => factById.set(String(f.id), f))
      const vpById = new Map<string, any>()
      ventesPassagers.forEach((v) => vpById.set(String(v.id), v))

      const factIds = factures.map((f) => f.id)
      const vpIds = ventesPassagers.map((v) => v.id)
      const productId = selectedProduct?.id ?? null

      // 2) Fetch line items restricted to matching parents (indexed FK lookups),
      //    optionally narrowed to a single product.
      const buildLignesQuery = (
        table: string,
        parentField: string,
        parentIds: (string | number)[],
      ) => {
        if (parentIds.length === 0) return null
        let q = supabase.from(table).select('*').in(parentField, parentIds)
        if (productId != null) q = q.eq('produit_id', productId)
        return q
      }

      const factLignesQuery = buildLignesQuery('facture_lignes', 'facture_id', factIds)
      // VP line items carry both `vp_id` and `vente_passager_id`. We fetch all
      // for the matched VP ids and reconcile client-side (matching either key).
      let vpLignesQuery: any = null
      if (vpIds.length > 0) {
        vpLignesQuery = supabase.from('ventes_passagers_lignes').select('*')
        if (productId != null) vpLignesQuery = vpLignesQuery.eq('produit_id', productId)
      }

      // 3) Resolve client names for factures (only the clients actually referenced).
      const clientIds = Array.from(
        new Set(
          factures
            .map((f) => f.client_id)
            .filter((id) => id != null),
        ),
      )
      const clientsQuery = clientIds.length
        ? supabase.from('clients').select('id, nom, nom_societe').in('id', clientIds)
        : null

      const [factLignesRes, vpLignesRes, clientsRes] = await Promise.all([
        factLignesQuery ?? Promise.resolve({ data: [] as any[] }),
        vpLignesQuery ?? Promise.resolve({ data: [] as any[] }),
        clientsQuery ?? Promise.resolve({ data: [] as any[] }),
      ])

      const factLignesData = ((factLignesRes as any).data ?? []) as any[]
      const vpLignesData = ((vpLignesRes as any).data ?? []) as any[]

      // Barcode lives on `produits` (indexed), not on the line items. Resolve
      // it for only the products actually referenced by the matched lines.
      const barcodeByProduct = new Map<string, string | null>()
      if (selectedProduct?.id != null) {
        barcodeByProduct.set(String(selectedProduct.id), selectedProduct.barcode ?? null)
      } else {
        const prodIds = Array.from(
          new Set(
            [...factLignesData, ...vpLignesData]
              .map((l) => l.produit_id)
              .filter((id) => id != null)
              .map((id) => String(id)),
          ),
        )
        if (prodIds.length) {
          const { data: prods } = await supabase
            .from('produits')
            .select('id, barcode')
            .in('id', prodIds)
          ;((prods as any[]) ?? []).forEach((p) =>
            barcodeByProduct.set(String(p.id), p.barcode ?? null),
          )
        }
      }
      const barcodeOf = (produitId: any): string | null =>
        produitId != null ? barcodeByProduct.get(String(produitId)) ?? null : null

      const clientById = new Map<string, any>()
      ;((clientsRes as any).data ?? []).forEach((c: any) => clientById.set(String(c.id), c))
      const clientName = (f: any): string | null => {
        if (f.client_id == null) return null
        const c = clientById.get(String(f.client_id))
        if (!c) return null
        return c.nom || c.nomSociete || c.nom_societe || null
      }

      const out: SaleRow[] = []

      // Facture lines
      for (const l of factLignesData) {
        const parent = factById.get(String(l.facture_id))
        if (!parent) continue
        out.push({
          key: `f-${l.id}`,
          date: parent.date_emission,
          produitId: l.produit_id != null ? String(l.produit_id) : null,
          productName: l.designation || tp('unknown_product'),
          barcode: barcodeOf(l.produit_id),
          quantite: Number(l.quantite || 0),
          // Affichage TTC : préférer les montants TTC stockés, sinon dérivés du HT
          prixUnitaire: Number(l.prix_unitaire_ht || 0) * (1 + Number(l.tva ?? 20) / 100),
          montant: Number(l.montant_ttc || 0) > 0
            ? Number(l.montant_ttc)
            : Number(l.montant_ht || 0) * (1 + Number(l.tva ?? 20) / 100),
          source: 'facture',
          documentNumber: parent.numero ?? '—',
          clientName: clientName(parent),
        })
      }

      // Vente Passager lines (reconcile vp_id / vente_passager_id)
      for (const l of vpLignesData) {
        const key = l.vp_id ?? l.vente_passager_id
        if (key == null) continue
        const parent = vpById.get(String(key))
        if (!parent) continue
        out.push({
          key: `v-${l.id}`,
          date: parent.date,
          produitId: l.produit_id != null ? String(l.produit_id) : null,
          productName: l.designation || tp('unknown_product'),
          barcode: barcodeOf(l.produit_id),
          quantite: Number(l.quantite || 0),
          // Affichage TTC : préférer les montants TTC stockés, sinon dérivés du HT
          prixUnitaire: Number(l.prix_unitaire_ht || 0) * (1 + Number(l.tva ?? 20) / 100),
          montant: Number(l.montant_ttc || 0) > 0
            ? Number(l.montant_ttc)
            : Number(l.montant_ht || 0) * (1 + Number(l.tva ?? 20) / 100),
          source: 'vente_passager',
          documentNumber: parent.numero ?? '—',
          clientName: parent.client_nom || null,
        })
      }

      setRows(out)
      setCurrentPage(1)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dateRange, customStart, customEnd, selectedProduct?.id])

  // ── Auto-refresh whenever a filter changes ───────────────────────────────
  useEffect(() => {
    // For custom range, only fetch once both bounds are set.
    if (dateRange === 'custom' && (!customStart || !customEnd)) {
      setRows([])
      return
    }
    fetchSales()
  }, [fetchSales, dateRange, customStart, customEnd])

  // ── Client-side search-within-results ─────────────────────────────────────
  const searchedRows = useMemo(() => {
    const term = resultSearch.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) =>
      r.productName.toLowerCase().includes(term) ||
      (r.barcode ?? '').toLowerCase().includes(term) ||
      r.documentNumber.toLowerCase().includes(term) ||
      (r.clientName ?? '').toLowerCase().includes(term),
    )
  }, [rows, resultSearch])

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const arr = [...searchedRows]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let av: any = a[sortField]
      let bv: any = b[sortField]
      if (sortField === 'date') {
        av = new Date(a.date).getTime()
        bv = new Date(b.date).getTime()
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir
      }
      av = av ?? 0
      bv = bv ?? 0
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return arr
  }, [searchedRows, sortField, sortDir])

  // ── Summary stats (over the searched result set) ───────────────────────────
  const summary = useMemo(() => {
    const totalQty = searchedRows.reduce((s, r) => s + r.quantite, 0)
    const totalAmount = searchedRows.reduce((s, r) => s + r.montant, 0)
    const salesCount = searchedRows.length
    const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0
    const distinctProducts = new Set(
      searchedRows.map((r) => r.produitId ?? r.productName),
    ).size
    return { totalQty, totalAmount, salesCount, avgPrice, distinctProducts }
  }, [searchedRows])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ITEMS_PER_PAGE))
  const pageRows = sortedRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])
  useEffect(() => {
    setCurrentPage(1)
  }, [resultSearch])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sourceLabel = (s: SaleSource) =>
    s === 'facture' ? tp('source_facture') : tp('source_vente_passager')

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' })
    } catch {
      return iso
    }
  }

  // ── Export helpers ──────────────────────────────────────────────────────────
  const exportRowsForFile = () =>
    sortedRows.map((r) => ({
      [tp('col_date')]: fmtDate(r.date),
      [tp('col_product')]: r.productName,
      [tp('col_barcode')]: r.barcode ?? '',
      [tp('col_quantity')]: r.quantite,
      [tp('col_unit_price')]: r.prixUnitaire,
      [tp('col_total')]: r.montant,
      [tp('col_source')]: sourceLabel(r.source),
      [tp('col_document')]: r.documentNumber,
      [tp('col_client')]: r.clientName ?? '',
    }))

  const handleExportExcel = async () => {
    if (sortedRows.length === 0) {
      toast.error(tp('toast_no_data'))
      return
    }
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(exportRowsForFile())
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, tp('export_sheet_name'))
      XLSX.writeFile(wb, `${tp('export_filename')}.xlsx`)
      toast.success(tp('toast_excel_success'))
    } catch {
      toast.error(tp('toast_excel_error'))
    }
  }

  const handleExportPDF = async () => {
    if (sortedRows.length === 0) {
      toast.error(tp('toast_no_data'))
      return
    }
    try {
      const { default: JsPDF } = await import('jspdf')
      const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const marginX = 30
      let y = 40

      doc.setFontSize(14)
      doc.text(tp('title'), marginX, y)
      y += 18
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text(rangeLabel(), marginX, y)
      if (selectedProduct) {
        y += 12
        doc.text(`${tp('product_label')}: ${productLabel(selectedProduct)}`, marginX, y)
      }
      doc.setTextColor(0)
      y += 20

      const headers = [
        tp('col_date'), tp('col_product'), tp('col_barcode'), tp('col_quantity'),
        tp('col_unit_price'), tp('col_total'), tp('col_source'), tp('col_document'),
        tp('col_client'),
      ]
      const colX = [30, 100, 250, 340, 390, 460, 540, 640, 720]
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      headers.forEach((h, i) => doc.text(String(h), colX[i], y))
      doc.setFont('helvetica', 'normal')
      y += 4
      doc.line(marginX, y, 812, y)
      y += 12

      const pageHeight = doc.internal.pageSize.getHeight()
      for (const r of sortedRows) {
        if (y > pageHeight - 30) {
          doc.addPage()
          y = 40
        }
        const cells = [
          fmtDate(r.date),
          truncate(r.productName, 28),
          r.barcode ?? '',
          String(r.quantite),
          formatAmount(r.prixUnitaire),
          formatAmount(r.montant),
          sourceLabel(r.source),
          r.documentNumber,
          truncate(r.clientName ?? '', 16),
        ]
        cells.forEach((c, i) => doc.text(String(c), colX[i], y))
        y += 14
      }
      doc.save(`${tp('export_filename')}.pdf`)
      toast.success(tp('toast_pdf_success'))
    } catch {
      toast.error(tp('toast_pdf_error'))
    }
  }

  const buildPrintHtml = () => {
    const headers = [
      tp('col_date'), tp('col_product'), tp('col_barcode'), tp('col_quantity'),
      tp('col_unit_price'), tp('col_total'), tp('col_source'), tp('col_document'),
      tp('col_client'),
    ]
    const body = sortedRows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(fmtDate(r.date))}</td>
          <td>${escapeHtml(r.productName)}</td>
          <td>${escapeHtml(r.barcode ?? '')}</td>
          <td style="text-align:right">${r.quantite}</td>
          <td style="text-align:right">${escapeHtml(fmt(r.prixUnitaire))}</td>
          <td style="text-align:right">${escapeHtml(fmt(r.montant))}</td>
          <td>${escapeHtml(sourceLabel(r.source))}</td>
          <td>${escapeHtml(r.documentNumber)}</td>
          <td>${escapeHtml(r.clientName ?? '')}</td>
        </tr>`,
      )
      .join('')
    return `<!doctype html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head>
      <meta charset="utf-8"/><title>${escapeHtml(tp('title'))}</title>
      <style>
        @page { size: landscape; margin: 12mm; }
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        p{font-size:12px;color:#666;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:${isRTL ? 'right' : 'left'}}
        th{background:#f5f5f5;font-weight:bold}
        tfoot td{font-weight:bold;background:#fafafa}
      </style></head><body>
      <h1>${escapeHtml(tp('title'))}</h1>
      <p>${escapeHtml(rangeLabel())}${selectedProduct ? ' — ' + escapeHtml(productLabel(selectedProduct)) : ''}</p>
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td colspan="3">${escapeHtml(tp('total'))}</td>
          <td style="text-align:right">${summary.totalQty}</td>
          <td></td>
          <td style="text-align:right">${escapeHtml(fmt(summary.totalAmount))}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>
    </body></html>`
  }

  const handlePrint = () => {
    if (sortedRows.length === 0) {
      toast.error(tp('toast_no_data'))
      return
    }
    try {
      // Use a hidden same-document iframe instead of window.open(). Popups are
      // frequently blocked (and window.open is unavailable in the Tauri webview),
      // whereas an iframe prints reliably in both the browser and desktop app.
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.setAttribute('aria-hidden', 'true')
      document.body.appendChild(iframe)

      const cleanup = () => {
        // Delay removal so the print dialog has captured the document.
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        }, 1000)
      }

      const doc = iframe.contentWindow?.document
      if (!doc) {
        cleanup()
        toast.error(tp('toast_print_error'))
        return
      }

      doc.open()
      doc.write(buildPrintHtml())
      doc.close()

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          toast.success(tp('toast_print_success'))
        } catch {
          toast.error(tp('toast_print_error'))
        } finally {
          cleanup()
        }
      }

      // Wait for the iframe document to finish rendering before printing.
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup
      }
      // Give the browser a tick to lay out the content.
      setTimeout(triggerPrint, 300)
    } catch {
      toast.error(tp('toast_print_error'))
    }
  }

  const rangeLabel = () =>
    filterStart && filterEnd
      ? `${filterStart.toLocaleDateString(dateFmt)} – ${filterEnd.toLocaleDateString(dateFmt)}`
      : t('dashboard.date_range.all_time')

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const Th = ({ field, label, align = 'start' }: { field: SortField; label: string; align?: 'start' | 'end' }) => (
    <TableHead className={cn(align === 'end' ? 'text-end' : 'text-start')}>
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          'inline-flex items-center gap-1 font-semibold hover:text-primary transition-colors',
          align === 'end' && 'flex-row-reverse',
        )}
      >
        {label}
        <SortIcon field={field} />
      </button>
    </TableHead>
  )

  return (
    <Card className="shadow-none rounded-[6px]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Section header banner */}
      <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-4 sm:px-6 py-3 sm:py-4 border-b border-primary/10 flex items-center gap-3">
        <div className="p-2 rounded-[6px] bg-primary/10 shrink-0">
          <Boxes className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground text-sm sm:text-base">{tp('title')}</h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground">{tp('subtitle')}</p>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          {/* Date filter */}
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
                  onClick={() => {
                    setSelectedProduct(null)
                    setProductQuery('')
                    setDropdownOpen(false)
                  }}
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
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      {tp('no_products')}
                    </div>
                  ) : (
                    <ul className="py-1">
                      {productOptions.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p)
                              setProductQuery('')
                              setDropdownOpen(false)
                            }}
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
            {selectedProduct && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <Tag className="h-3 w-3" />
                {productLabel(selectedProduct)}
              </Badge>
            )}
          </div>
        </div>

        {/* Active range hint */}
        <p className="text-[11px] text-muted-foreground -mt-1">
          <CalendarDays className="inline h-3 w-3 me-1" />
          {rangeLabel()}
        </p>

        {/* ── Summary cards ─────────────────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            icon={Boxes}
            label={tp('summary_total_qty')}
            value={summary.totalQty.toLocaleString(dateFmt)}
            iconClass="bg-blue-50 border border-blue-200/60 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400"
          />
          <SummaryCard
            icon={DollarSign}
            label={tp('summary_total_amount')}
            value={fmt(summary.totalAmount)}
            iconClass="bg-emerald-50 border border-emerald-200/60 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
          />
          <SummaryCard
            icon={ListChecks}
            label={tp('summary_sales_count')}
            value={summary.salesCount.toLocaleString(dateFmt)}
            iconClass="bg-violet-50 border border-violet-200/60 text-violet-600 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-400"
          />
          <SummaryCard
            icon={Tag}
            label={tp('summary_avg_price')}
            value={fmt(summary.avgPrice)}
            iconClass="bg-amber-50 border border-amber-200/60 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
          />
          <SummaryCard
            icon={Package}
            label={tp('summary_distinct_products')}
            value={summary.distinctProducts.toLocaleString(dateFmt)}
            iconClass="bg-rose-50 border border-rose-200/60 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400"
          />
        </div>

        {/* ── Toolbar: search + export ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={resultSearch}
              onChange={(e) => setResultSearch(e.target.value)}
              placeholder={tp('result_search_placeholder')}
              className="ps-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={handleExportExcel}
              disabled={sortedRows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 me-1.5" />
              {tp('export_excel')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={handleExportPDF}
              disabled={sortedRows.length === 0}
            >
              <FileText className="h-4 w-4 me-1.5" />
              {tp('export_pdf')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={handlePrint}
              disabled={sortedRows.length === 0}
            >
              <Printer className="h-4 w-4 me-1.5" />
              {tp('print')}
            </Button>
          </div>
        </div>

        {/* ── Results table ─────────────────────────────────────────────── */}
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Th field="date" label={tp('col_date')} />
                <Th field="productName" label={tp('col_product')} />
                <Th field="barcode" label={tp('col_barcode')} />
                <Th field="quantite" label={tp('col_quantity')} align="end" />
                <Th field="prixUnitaire" label={tp('col_unit_price')} align="end" />
                <Th field="montant" label={tp('col_total')} align="end" />
                <Th field="source" label={tp('col_source')} />
                <Th field="documentNumber" label={tp('col_document')} />
                <Th field="clientName" label={tp('col_client')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-sm">{tp('loading')}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="bg-muted/50 rounded-[8px] p-4">
                        <Receipt className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">{tp('empty')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap text-xs" dir="ltr">{fmtDate(r.date)}</TableCell>
                    <TableCell className="font-medium text-sm max-w-[220px] truncate">{r.productName}</TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{r.barcode || '—'}</TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{r.quantite}</TableCell>
                    <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">{fmt(r.prixUnitaire)}</TableCell>
                    <TableCell className="text-end tabular-nums whitespace-nowrap font-semibold" dir="ltr">{fmt(r.montant)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-semibold border-0',
                          r.source === 'facture'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {r.source === 'facture'
                          ? <FileText className="h-3 w-3 me-1" />
                          : <ShoppingCart className="h-3 w-3 me-1" />}
                        {sourceLabel(r.source)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{r.documentNumber}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{r.clientName || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {!loading && sortedRows.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {tp('showing', {
                from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                to: Math.min(currentPage * ITEMS_PER_PAGE, sortedRows.length),
                total: sortedRows.length,
              })}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  {tp('prev')}
                </Button>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {tp('page_info', { current: currentPage, total: totalPages })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  {tp('next')}
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Small presentational helpers ───────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  iconClass: string
}) {
  return (
    <div className="rounded-[6px] bg-card p-3 border border-border">
      <div className="flex items-start justify-between mb-2">
        <span />
        <div className={cn('h-8 w-8 rounded-sm flex items-center justify-center shrink-0', iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground tracking-wide uppercase text-start line-clamp-2">
        {label}
      </p>
      <p className="text-base sm:text-lg font-bold text-card-foreground mt-0.5 tracking-tight text-start truncate" dir="ltr">
        {value}
      </p>
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
