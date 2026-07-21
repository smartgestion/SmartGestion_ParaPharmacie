import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, Truck, Package, TrendingUp } from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, ChartBox } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import type { ReportData, SupplierRow, PurchaseLine } from '@/pages/reports/useReportData'
import type { DrillDownState } from '../DrillDownDialog'

const ReportCharts = React.lazy(() => import('../ReportCharts'))

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
  onDrill: (state: DrillDownState) => void
}

interface PurchaseByProduct {
  produitId: string | null
  name: string
  qty: number
  avgCost: number
  supplier: string | null
  lastPurchase: string | null
}

export function PurchasesSection({ data, isRTL, rangeLabel, onDrill }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rp = (k: string): string => t(`reports.purchases.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }

  const { purchaseLines, suppliers, totals } = data

  const summary = useMemo(() => {
    const orders = new Set(purchaseLines.map((p) => p.bonId)).size
    const totalTTC = purchaseLines.reduce((s, p) => s + p.costTTC, 0)
    return { totalTTC, orders, avg: orders > 0 ? totalTTC / orders : 0, cost: totalTTC }
  }, [purchaseLines])

  const byProduct = useMemo<PurchaseByProduct[]>(() => {
    const map = new Map<string, PurchaseByProduct & { totalCost: number }>()
    for (const l of purchaseLines) {
      const k = l.produitId ?? l.designation
      let row = map.get(k)
      if (!row) { row = { produitId: l.produitId, name: l.designation, qty: 0, avgCost: 0, supplier: l.supplierName, lastPurchase: null, totalCost: 0 }; map.set(k, row) }
      row.qty += l.qty
      row.totalCost += l.costTTC
      if (!row.lastPurchase || new Date(l.date) > new Date(row.lastPurchase)) row.lastPurchase = l.date
    }
    return Array.from(map.values()).map((r) => {
      const { totalCost, ...rest } = r
      return { ...rest, avgCost: r.qty > 0 ? totalCost / r.qty : 0 }
    }).sort((a, b) => b.qty - a.qty)
  }, [purchaseLines])

  // Monthly purchase trend.
  const trend = useMemo(() => {
    if (purchaseLines.length === 0) return []
    const map = new Map<string, { idx: number; amount: number }>()
    for (const l of purchaseLines) {
      const d = new Date(l.date)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      const cur = map.get(key) ?? { idx: d.getFullYear() * 12 + d.getMonth(), amount: 0 }
      cur.amount += l.costTTC
      map.set(key, cur)
    }
    const monthName = (idx: number) => new Date(2000, idx % 12, 1).toLocaleDateString(dateFmt, { month: 'short' })
    return Array.from(map.entries())
      .sort((a, b) => a[1].idx - b[1].idx)
      .map(([, v]) => ({ name: monthName(v.idx), value: v.amount }))
  }, [purchaseLines, dateFmt])

  const supplierCols: ReportColumn<SupplierRow>[] = [
    { key: 'name', label: rp('sup_name'), render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'orders', label: rp('sup_orders'), align: 'end', numeric: true },
    { key: 'products', label: rp('sup_products'), align: 'end', numeric: true },
    { key: 'amountTTC', label: rp('sup_amount'), align: 'end', numeric: true, render: (s) => fmt(s.amountTTC) },
    { key: 'avgPurchase', label: rp('sup_avg'), align: 'end', numeric: true, render: (s) => fmt(s.avgPurchase) },
  ]

  const productCols: ReportColumn<PurchaseByProduct>[] = [
    { key: 'name', label: rp('prod_name'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'qty', label: rp('prod_qty'), align: 'end', numeric: true },
    { key: 'avgCost', label: rp('prod_avg_cost'), align: 'end', numeric: true, render: (p) => fmt(p.avgCost) },
    { key: 'supplier', label: rp('prod_supplier'), render: (p) => p.supplier || '—' },
    { key: 'lastPurchase', label: rp('prod_last'), align: 'end', value: (p) => p.lastPurchase ?? '', render: (p) => fmtDate(p.lastPurchase) },
  ]

  const drillSupplier = (s: SupplierRow) =>
    onDrill({ title: `${rp('by_supplier')}: ${s.name}`, purchases: purchaseLines.filter((l) => (l.supplierId ?? 'none') === s.id) })
  const drillProduct = (p: PurchaseByProduct) =>
    onDrill({ title: p.name, purchases: purchaseLines.filter((l) => l.produitId === p.produitId) })

  return (
    <div className="space-y-6">
      <Panel>
        <SectionTitle icon={ShoppingCart} title={rp('summary_title')} subtitle={rangeLabel} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ValCard label={rp('total_purchases')} value={fmt(summary.totalTTC)} />
          <ValCard label={rp('avg_purchase')} value={fmt(summary.avg)} />
          <ValCard label={rp('purchase_cost')} value={fmt(summary.cost)} />
          <ValCard label={rp('orders_count')} value={summary.orders.toLocaleString(dateFmt)} />
        </div>
      </Panel>

      <ChartBox title={rp('trend_title')}>
        <ReportCharts variant="area" data={trend} dataKeys={['value']} currency isRTL={isRTL} />
      </ChartBox>

      <Panel>
        <SectionTitle icon={Truck} title={rp('by_supplier')} />
        <ReportTable columns={supplierCols} rows={suppliers} rowKey={(s) => s.id} exportTitle={rp('by_supplier')} exportFilename="achats-par-fournisseur" exportSubtitle={rangeLabel} isRTL={isRTL} initialSort={{ key: 'amountTTC', dir: 'desc' }} onRowClick={drillSupplier} emptyLabel={rp('empty')} />
      </Panel>

      <Panel>
        <SectionTitle icon={Package} title={rp('by_product')} />
        <ReportTable columns={productCols} rows={byProduct} rowKey={(p) => p.produitId ?? p.name} exportTitle={rp('by_product')} exportFilename="achats-par-produit" exportSubtitle={rangeLabel} isRTL={isRTL} initialSort={{ key: 'qty', dir: 'desc' }} onRowClick={drillProduct} emptyLabel={rp('empty')} />
      </Panel>
    </div>
  )
}

function ValCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-border bg-background p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-2">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5 tracking-tight truncate text-card-foreground')} dir="ltr">{value}</p>
    </div>
  )
}
