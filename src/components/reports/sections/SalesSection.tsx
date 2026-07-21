import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, ShoppingBag, PieChart as PieIcon, Users, Clock, CalendarDays, Image as ImageIcon } from 'lucide-react'
import { cn, formatCurrencyLocale, formatAmount } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, ChartBox, Heatmap, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import type { ReportData, SaleLine } from '@/pages/reports/useReportData'
import type { DrillDownState } from '../DrillDownDialog'

const ReportCharts = React.lazy(() => import('../ReportCharts'))

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const WEEKDAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
  onDrill: (state: DrillDownState) => void
}

interface CategoryAgg { name: string; revenue: number; profit: number; qty: number; pct: number }
interface CustomerAgg { id: string; name: string; purchases: number; revenue: number; profit: number; basket: number; last: string | null }

export function SalesSection({ data, isRTL, rangeLabel, onDrill }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rs = (k: string, o?: Record<string, unknown>): string => t(`reports.sales.${k}`, o as any) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }

  const { saleLines, totals, products } = data

  // ── Summary metrics ──────────────────────────────────────────────────────
  const summary = useMemo(() => ({
    revenueTTC: totals.revenueTTC,
    revenueHT: totals.revenueHT,
    tva: totals.tvaCollected,
    salesCount: totals.invoicesCount,
    avgInvoice: totals.avgSale,
    profit: totals.grossProfit,
    margin: totals.margin,
  }), [totals])

  // ── Revenue evolution (daily ≤31d else monthly) ───────────────────────────
  const evolution = useMemo(() => buildEvolution(saleLines, lang), [saleLines, lang])

  // ── Sales by category (marque) ─────────────────────────────────────────────
  const categories = useMemo<CategoryAgg[]>(() => {
    const map = new Map<string, CategoryAgg>()
    const prodBrand = new Map(products.map((p) => [p.id, p.brand]))
    for (const l of saleLines) {
      const brand = (l.produitId ? prodBrand.get(l.produitId) : null) || rs('uncategorized')
      let row = map.get(brand)
      if (!row) { row = { name: brand, revenue: 0, profit: 0, qty: 0, pct: 0 }; map.set(brand, row) }
      row.revenue += l.revenueTTC
      row.profit += l.profit
      row.qty += l.qty
    }
    const arr = Array.from(map.values())
    const total = arr.reduce((s, c) => s + c.revenue, 0)
    arr.forEach((c) => { c.pct = total > 0 ? (c.revenue / total) * 100 : 0 })
    arr.sort((a, b) => b.revenue - a.revenue)
    return arr
  }, [saleLines, products, lang])

  // ── Sales by customer ─────────────────────────────────────────────────────
  const customers = useMemo<CustomerAgg[]>(() => {
    const map = new Map<string, CustomerAgg & { docs: Set<string> }>()
    for (const l of saleLines) {
      if (l.source !== 'facture' || !l.clientId) continue
      let row = map.get(l.clientId)
      if (!row) { row = { id: l.clientId, name: l.clientName || '—', purchases: 0, revenue: 0, profit: 0, basket: 0, last: null, docs: new Set() }; map.set(l.clientId, row) }
      row.revenue += l.revenueTTC
      row.profit += l.profit
      row.docs.add(l.parentId)
      if (!row.last || new Date(l.date) > new Date(row.last)) row.last = l.date
    }
    return Array.from(map.values()).map((r) => {
      const { docs, ...rest } = r
      return { ...rest, purchases: docs.size, basket: docs.size > 0 ? r.revenue / docs.size : 0 }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [saleLines])

  // ── Sales by hour × weekday (heatmap, from created_at) ─────────────────────
  const heatmap = useMemo(() => {
    // 7 weekdays × 24 hours
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    for (const l of saleLines) {
      const d = new Date(l.createdAt)
      if (isNaN(d.getTime())) continue
      matrix[d.getDay()][d.getHours()] += 1
    }
    return matrix
  }, [saleLines])

  // ── Sales by weekday (revenue) ─────────────────────────────────────────────
  const weekday = useMemo(() => {
    const rev = Array.from({ length: 7 }, () => 0)
    for (const l of saleLines) {
      const d = new Date(l.createdAt)
      if (isNaN(d.getTime())) continue
      rev[d.getDay()] += l.revenueTTC
    }
    // Present Monday-first for readability.
    const order = [1, 2, 3, 4, 5, 6, 0]
    return order.map((di) => ({ name: t(`reports.weekday.${WEEKDAY_KEYS[di]}`), value: rev[di] }))
  }, [saleLines, lang])

  // Top / worst products by qty.
  const topProducts = useMemo(() => [...products].sort((a, b) => b.qtySold - a.qtySold).slice(0, 10)
    .map((p) => ({ name: truncate(p.name, 22), value: p.qtySold })), [products])
  const worstProducts = useMemo(() => [...products].filter((p) => p.qtySold > 0).sort((a, b) => a.qtySold - b.qtySold).slice(0, 10)
    .map((p) => ({ name: truncate(p.name, 22), value: p.qtySold })), [products])

  const drillCategory = (name: string) => {
    const prodBrand = new Map(products.map((p) => [p.id, p.brand]))
    const lines = saleLines.filter((l) => ((l.produitId ? prodBrand.get(l.produitId) : null) || rs('uncategorized')) === name)
    onDrill({ title: `${rs('by_category')}: ${name}`, sales: lines })
  }
  const drillCustomer = (c: CustomerAgg) => {
    onDrill({ title: `${rs('by_customer')}: ${c.name}`, sales: saleLines.filter((l) => l.clientId === c.id) })
  }

  const productLine = (name: string): SaleLine[] =>
    saleLines.filter((l) => truncate(l.designation, 22) === name)

  // ── Product table ─────────────────────────────────────────────────────────
  const productColumns: ReportColumn<typeof products[number]>[] = [
    { key: 'image', label: rs('col_image'), sortable: false, render: (p) => <Thumb url={p.imageUrl} alt={p.name} /> },
    { key: 'name', label: rs('col_product'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'barcode', label: rs('col_barcode'), render: (p) => <span className="font-mono text-xs" dir="ltr">{p.barcode || '—'}</span> },
    { key: 'qtySold', label: rs('col_qty'), align: 'end', numeric: true },
    { key: 'revenueTTC', label: rs('col_revenue'), align: 'end', numeric: true, render: (p) => fmt(p.revenueTTC) },
    { key: 'costTTC', label: rs('col_cost'), align: 'end', numeric: true, render: (p) => fmt(p.costTTC) },
    { key: 'profit', label: rs('col_profit'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.profit)}>{fmt(p.profit)}</span> },
    { key: 'margin', label: rs('col_margin'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.margin)}>{p.margin.toFixed(1)}%</span> },
    { key: 'avgSellPrice', label: rs('col_avg_price'), align: 'end', numeric: true, render: (p) => fmt(p.avgSellPrice) },
    { key: 'stock', label: rs('col_stock'), align: 'end', numeric: true },
  ]

  const customerColumns: ReportColumn<CustomerAgg>[] = [
    { key: 'name', label: rs('cust_name'), render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'purchases', label: rs('cust_purchases'), align: 'end', numeric: true },
    { key: 'revenue', label: rs('cust_revenue'), align: 'end', numeric: true, render: (c) => fmt(c.revenue) },
    { key: 'profit', label: rs('cust_profit'), align: 'end', numeric: true, render: (c) => <span className={signedClass(c.profit)}>{fmt(c.profit)}</span> },
    { key: 'basket', label: rs('cust_basket'), align: 'end', numeric: true, render: (c) => fmt(c.basket) },
    { key: 'last', label: rs('cust_last'), align: 'end', render: (c) => fmtDate(c.last) },
  ]

  const categoryColumns: ReportColumn<CategoryAgg>[] = [
    { key: 'name', label: rs('cat_name'), render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'revenue', label: rs('cat_revenue'), align: 'end', numeric: true, render: (c) => fmt(c.revenue) },
    { key: 'profit', label: rs('cat_profit'), align: 'end', numeric: true, render: (c) => <span className={signedClass(c.profit)}>{fmt(c.profit)}</span> },
    { key: 'qty', label: rs('cat_qty'), align: 'end', numeric: true },
    { key: 'pct', label: rs('cat_pct'), align: 'end', numeric: true, render: (c) => `${c.pct.toFixed(1)}%` },
  ]

  const hourLabels = Array.from({ length: 24 }, (_, h) => `${h}`)
  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((di) => t(`reports.weekday.${WEEKDAY_KEYS[di]}`))
  const heatmapOrdered = [1, 2, 3, 4, 5, 6, 0].map((di) => heatmap[di])

  return (
    <div className="space-y-6">
      {/* ── Sales summary ──────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={TrendingUp} title={rs('summary_title')} subtitle={rangeLabel} />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Metric label={rs('revenue_ttc')} value={fmt(summary.revenueTTC)} />
          <Metric label={rs('revenue_ht')} value={fmt(summary.revenueHT)} />
          <Metric label={rs('tva_collected')} value={fmt(summary.tva)} />
          <Metric label={rs('total_sales')} value={summary.salesCount.toLocaleString(dateFmt)} />
          <Metric label={rs('avg_invoice')} value={fmt(summary.avgInvoice)} />
          <Metric label={rs('profit')} value={fmt(summary.profit)} valueClass={signedClass(summary.profit)} />
          <Metric label={rs('margin')} value={`${summary.margin.toFixed(1)}%`} valueClass={signedClass(summary.margin)} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartBox title={rs('revenue_evolution')}>
          <ReportCharts variant="area" data={evolution} dataKeys={['revenue']} currency isRTL={isRTL} labels={{ revenue: rs('revenue_ttc') }} />
        </ChartBox>
        <ChartBox title={rs('sales_trend')}>
          <ReportCharts variant="line" data={evolution} dataKeys={['qty']} isRTL={isRTL} labels={{ qty: rs('total_sales') }} />
        </ChartBox>
      </div>

      {/* ── Sales by product ───────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={ShoppingBag} title={rs('by_product')} />
        <ReportTable
          columns={productColumns}
          rows={products}
          rowKey={(p) => p.id}
          exportTitle={rs('by_product')}
          exportFilename="ventes-par-produit"
          exportSubtitle={rangeLabel}
          isRTL={isRTL}
          initialSort={{ key: 'qtySold', dir: 'desc' }}
          onRowClick={(p) => onDrill({ title: `${rs('by_product')}: ${p.name}`, sales: saleLines.filter((l) => l.produitId === p.id) })}
          emptyLabel={rs('empty')}
        />
        <div className="grid gap-4 lg:grid-cols-2 mt-4">
          <ChartBox title={rs('top_selling')}>
            <ReportCharts variant="hbar" data={topProducts} dataKeys={['value']} isRTL={isRTL} />
          </ChartBox>
          <ChartBox title={rs('worst_selling')}>
            <ReportCharts variant="hbar" data={worstProducts} dataKeys={['value']} isRTL={isRTL} />
          </ChartBox>
        </div>
      </Panel>

      {/* ── Sales by category ──────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={PieIcon} title={rs('by_category')} />
        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          <ChartBox title={rs('cat_pie')}>
            <ReportCharts variant="pie" data={categories.slice(0, 10).map((c) => ({ name: c.name, value: c.revenue }))} valueKey="value" currency isRTL={isRTL} />
          </ChartBox>
          <ChartBox title={rs('cat_bar')}>
            <ReportCharts variant="bar" data={categories.slice(0, 10).map((c) => ({ name: truncate(c.name, 14), value: c.revenue }))} dataKeys={['value']} currency isRTL={isRTL} />
          </ChartBox>
        </div>
        <ReportTable
          columns={categoryColumns}
          rows={categories}
          rowKey={(c) => c.name}
          exportTitle={rs('by_category')}
          exportFilename="ventes-par-categorie"
          exportSubtitle={rangeLabel}
          isRTL={isRTL}
          initialSort={{ key: 'revenue', dir: 'desc' }}
          onRowClick={(c) => drillCategory(c.name)}
          emptyLabel={rs('empty')}
        />
      </Panel>

      {/* ── Sales by customer ──────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Users} title={rs('by_customer')} />
        <ReportTable
          columns={customerColumns}
          rows={customers}
          rowKey={(c) => c.id}
          exportTitle={rs('by_customer')}
          exportFilename="ventes-par-client"
          exportSubtitle={rangeLabel}
          isRTL={isRTL}
          initialSort={{ key: 'revenue', dir: 'desc' }}
          onRowClick={drillCustomer}
          emptyLabel={rs('empty')}
        />
      </Panel>

      {/* ── Sales by hour / weekday ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle icon={Clock} title={rs('by_hour')} subtitle={rs('by_hour_hint')} />
          <Heatmap matrix={heatmapOrdered} rowLabels={weekdayLabels} colLabels={hourLabels} />
        </div>
        <div>
          <SectionTitle icon={CalendarDays} title={rs('by_weekday')} />
          <ChartBox>
            <ReportCharts variant="bar" data={weekday} dataKeys={['value']} currency isRTL={isRTL} />
          </ChartBox>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-[6px] border border-border bg-background p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-2">{label}</p>
      <p className={cn('text-base font-bold mt-0.5 tracking-tight truncate', valueClass ?? 'text-card-foreground')} dir="ltr">{value}</p>
    </div>
  )
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  return url ? (
    <img src={url} alt={alt} className="h-9 w-9 rounded-[4px] object-cover border border-border shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
  ) : (
    <div className="h-9 w-9 rounded-[4px] bg-muted flex items-center justify-center border border-dashed border-border shrink-0">
      <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
    </div>
  )
}

function buildEvolution(lines: SaleLine[], lang: string): Array<{ name: string; revenue: number; qty: number }> {
  if (lines.length === 0) return []
  const times = lines.map((l) => new Date(l.date).getTime()).filter((n) => !isNaN(n))
  if (times.length === 0) return []
  const start = new Date(Math.min(...times))
  const end = new Date(Math.max(...times))
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const useDaily = daysDiff <= 31
  const out: Array<{ name: string; revenue: number; qty: number }> = []
  const monthLabel = (mi: number) => {
    // Reuse existing dashboard month keys via i18n at call sites is heavy here;
    // use Intl for month short names to avoid extra i18n round-trips.
    return new Date(2000, mi, 1).toLocaleDateString(
      lang.startsWith('ar') ? 'ar-MA' : lang.startsWith('en') ? 'en-US' : 'fr-FR',
      { month: 'short' },
    )
  }
  if (useDaily) {
    const dayCount = Math.max(1, daysDiff + 1)
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      const dl = lines.filter((l) => new Date(l.date).toISOString().split('T')[0] === key)
      out.push({ name: `${d.getDate()}`, revenue: dl.reduce((s, l) => s + l.revenueTTC, 0), qty: dl.reduce((s, l) => s + l.qty, 0) })
    }
  } else {
    const sm = start.getMonth() + start.getFullYear() * 12
    const em = end.getMonth() + end.getFullYear() * 12
    for (let i = 0; i <= em - sm; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const ml = lines.filter((l) => { const ld = new Date(l.date); return ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear() })
      out.push({ name: monthLabel(d.getMonth()), revenue: ml.reduce((s, l) => s + l.revenueTTC, 0), qty: ml.reduce((s, l) => s + l.qty, 0) })
    }
  }
  return out
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
