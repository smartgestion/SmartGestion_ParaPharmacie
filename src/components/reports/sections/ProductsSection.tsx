import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes, Image as ImageIcon, Zap, Snail } from 'lucide-react'
import { formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, ChartBox, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import type { ReportData, ProductRow } from '@/pages/reports/useReportData'
import type { DrillDownState } from '../DrillDownDialog'

const ReportCharts = React.lazy(() => import('../ReportCharts'))

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
  onDrill: (state: DrillDownState) => void
}

export function ProductsSection({ data, isRTL, rangeLabel, onDrill }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rp = (k: string): string => t(`reports.products.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }

  const { products, saleLines, purchaseLines } = data

  const topRevenue = useMemo(() => [...products].sort((a, b) => b.revenueTTC - a.revenueTTC).slice(0, 10).map((p) => ({ name: truncate(p.name, 20), value: p.revenueTTC })), [products])
  const topProfit = useMemo(() => [...products].sort((a, b) => b.profit - a.profit).slice(0, 10).map((p) => ({ name: truncate(p.name, 20), value: p.profit })), [products])
  const topQty = useMemo(() => [...products].sort((a, b) => b.qtySold - a.qtySold).slice(0, 10).map((p) => ({ name: truncate(p.name, 20), value: p.qtySold })), [products])
  const fast = useMemo(() => [...products].filter((p) => p.qtySold > 0).sort((a, b) => b.qtySold - a.qtySold).slice(0, 10).map((p) => ({ name: truncate(p.name, 20), value: p.qtySold })), [products])
  const slow = useMemo(() => [...products].sort((a, b) => a.qtySold - b.qtySold).slice(0, 10).map((p) => ({ name: truncate(p.name, 20), value: p.qtySold })), [products])

  const drill = (p: ProductRow) => onDrill({
    title: p.name,
    sales: saleLines.filter((l) => l.produitId === p.id),
    purchases: purchaseLines.filter((l) => l.produitId === p.id),
  })

  const columns: ReportColumn<ProductRow>[] = [
    { key: 'image', label: rp('col_image'), sortable: false, render: (p) => <Thumb url={p.imageUrl} alt={p.name} /> },
    { key: 'name', label: rp('col_name'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'barcode', label: rp('col_barcode'), render: (p) => <span className="font-mono text-xs" dir="ltr">{p.barcode || '—'}</span> },
    { key: 'supplierName', label: rp('col_supplier'), render: (p) => p.supplierName || '—', defaultHidden: true },
    { key: 'brand', label: rp('col_category'), render: (p) => p.brand || '—' },
    { key: 'qtyPurchased', label: rp('col_qty_purchased'), align: 'end', numeric: true },
    { key: 'qtySold', label: rp('col_qty_sold'), align: 'end', numeric: true },
    { key: 'revenueTTC', label: rp('col_revenue'), align: 'end', numeric: true, render: (p) => fmt(p.revenueTTC) },
    { key: 'costTTC', label: rp('col_cost'), align: 'end', numeric: true, render: (p) => fmt(p.costTTC) },
    { key: 'profit', label: rp('col_profit'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.profit)}>{fmt(p.profit)}</span> },
    { key: 'margin', label: rp('col_margin'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.margin)}>{p.margin.toFixed(1)}%</span> },
    { key: 'stock', label: rp('col_stock'), align: 'end', numeric: true },
    { key: 'stockValue', label: rp('col_stock_value'), align: 'end', numeric: true, value: (p) => p.stock * p.prixAchatTtc, render: (p) => fmt(p.stock * p.prixAchatTtc) },
    { key: 'lastSale', label: rp('col_last_sale'), align: 'end', value: (p) => p.lastSale ?? '', render: (p) => fmtDate(p.lastSale), defaultHidden: true },
    { key: 'lastPurchase', label: rp('col_last_purchase'), align: 'end', value: (p) => p.lastPurchase ?? '', render: (p) => fmtDate(p.lastPurchase), defaultHidden: true },
  ]

  return (
    <div className="space-y-6">
      <Panel>
        <SectionTitle icon={Boxes} title={rp('title')} subtitle={rangeLabel} />
        <ReportTable
          columns={columns}
          rows={products}
          rowKey={(p) => p.id}
          exportTitle={rp('title')}
          exportFilename="analyse-produits"
          exportSubtitle={rangeLabel}
          isRTL={isRTL}
          initialSort={{ key: 'revenueTTC', dir: 'desc' }}
          onRowClick={drill}
          emptyLabel={rp('empty')}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartBox title={rp('top_revenue')}><ReportCharts variant="hbar" data={topRevenue} dataKeys={['value']} currency isRTL={isRTL} /></ChartBox>
        <ChartBox title={rp('top_profit')}><ReportCharts variant="hbar" data={topProfit} dataKeys={['value']} currency isRTL={isRTL} /></ChartBox>
        <ChartBox title={rp('top_qty')}><ReportCharts variant="hbar" data={topQty} dataKeys={['value']} isRTL={isRTL} /></ChartBox>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle icon={Zap} title={rp('fast_moving')} />
          <ChartBox><ReportCharts variant="hbar" data={fast} dataKeys={['value']} isRTL={isRTL} /></ChartBox>
        </div>
        <div>
          <SectionTitle icon={Snail} title={rp('slow_moving')} />
          <ChartBox><ReportCharts variant="hbar" data={slow} dataKeys={['value']} isRTL={isRTL} /></ChartBox>
        </div>
      </div>
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

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
