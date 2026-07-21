import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Warehouse, History, PackageX, PackageMinus, PackagePlus, Clock, ArrowDownUp,
} from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import { Badge } from '@/components/ui/badge'
import type { ReportData, ProductRow, StockMovement } from '@/pages/reports/useReportData'

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
}

export function InventorySection({ data, isRTL, rangeLabel }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const ri = (k: string): string => t(`reports.inventory.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDateTime = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }

  const { products, movements, stockValuationPurchase, stockValuationSelling } = data
  const expectedProfit = stockValuationSelling - stockValuationPurchase

  const daysSince = (iso: string | null): number | null => {
    if (!iso) return null
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
  }

  const lowStock = useMemo(() => products.filter((p) => p.stock > 0 && p.stockMin > 0 && p.stock <= p.stockMin), [products])
  const outOfStock = useMemo(() => products.filter((p) => p.stock <= 0), [products])
  const overstock = useMemo(() => products.filter((p) => p.stock > 0 && p.qtySold <= Math.max(2, p.stock * 0.1)).sort((a, b) => (b.stock * b.prixAchatTtc) - (a.stock * a.prixAchatTtc)), [products])
  const unsold = (days: number) => products.filter((p) => {
    const d = daysSince(p.lastSale)
    return d === null || d >= days
  })

  const movementLabel = (type: string) => {
    const key = type.toLowerCase()
    if (key.includes('sortie') || key.includes('vente') || key.includes('sale')) return { label: ri('mv_sale'), cls: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: PackageMinus }
    if (key.includes('entree') || key.includes('entrée') || key.includes('achat') || key.includes('livr')) return { label: ri('mv_purchase'), cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: PackagePlus }
    if (key.includes('initial')) return { label: ri('mv_initial'), cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: PackagePlus }
    if (key.includes('retour') || key.includes('return')) return { label: ri('mv_return'), cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: ArrowDownUp }
    return { label: type, cls: 'bg-muted text-muted-foreground', icon: ArrowDownUp }
  }

  const productCols = (extra?: ReportColumn<ProductRow>[]): ReportColumn<ProductRow>[] => [
    { key: 'name', label: ri('col_product'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'barcode', label: ri('col_barcode'), render: (p) => <span className="font-mono text-xs" dir="ltr">{p.barcode || '—'}</span> },
    { key: 'stock', label: ri('col_stock'), align: 'end', numeric: true },
    { key: 'stockMin', label: ri('col_stock_min'), align: 'end', numeric: true },
    ...(extra ?? []),
    { key: 'stockValue', label: ri('col_stock_value'), align: 'end', numeric: true, value: (p) => p.stock * p.prixAchatTtc, render: (p) => fmt(p.stock * p.prixAchatTtc) },
  ]

  const unsoldCols: ReportColumn<ProductRow>[] = [
    { key: 'name', label: ri('col_product'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'stock', label: ri('col_stock'), align: 'end', numeric: true },
    { key: 'qtySold', label: ri('col_qty_sold'), align: 'end', numeric: true },
    { key: 'lastSale', label: ri('col_last_sale'), align: 'end', value: (p) => p.lastSale ?? '', render: (p) => fmtDate(p.lastSale) },
    { key: 'days', label: ri('col_days'), align: 'end', numeric: true, value: (p) => daysSince(p.lastSale) ?? 99999, render: (p) => { const d = daysSince(p.lastSale); return d === null ? ri('never') : `${d}` } },
    { key: 'stockValue', label: ri('col_stock_value'), align: 'end', numeric: true, value: (p) => p.stock * p.prixAchatTtc, render: (p) => fmt(p.stock * p.prixAchatTtc) },
  ]

  const movementCols: ReportColumn<StockMovement>[] = [
    { key: 'date', label: ri('mv_date'), value: (m) => m.date ?? '', render: (m) => <span className="text-xs whitespace-nowrap" dir="ltr">{fmtDateTime(m.date)}</span> },
    { key: 'productName', label: ri('mv_product'), render: (m) => <span className="font-medium text-sm">{m.productName}</span> },
    { key: 'type', label: ri('mv_type'), render: (m) => { const info = movementLabel(m.type); return <Badge variant="outline" className={cn('text-[10px] border-0 gap-1', info.cls)}><info.icon className="h-3 w-3" />{info.label}</Badge> } },
    { key: 'qty', label: ri('mv_qty'), align: 'end', numeric: true },
    { key: 'entite', label: ri('mv_entity'), render: (m) => m.entite || '—' },
    { key: 'reference', label: ri('mv_reference'), render: (m) => <span className="font-mono text-xs" dir="ltr">{m.reference || '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      {/* Stock valuation */}
      <Panel>
        <SectionTitle icon={Warehouse} title={ri('valuation_title')} subtitle={rangeLabel} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ValCard label={ri('purchase_value')} value={fmt(stockValuationPurchase)} />
          <ValCard label={ri('selling_value')} value={fmt(stockValuationSelling)} />
          <ValCard label={ri('expected_profit')} value={fmt(expectedProfit)} valueClass={signedClass(expectedProfit)} />
          <ValCard label={ri('inventory_value')} value={fmt(stockValuationPurchase)} />
        </div>
      </Panel>

      {/* Movements */}
      <Panel>
        <SectionTitle icon={History} title={ri('movement_title')} subtitle={ri('movement_hint')} />
        <ReportTable
          columns={movementCols}
          rows={movements}
          rowKey={(m) => m.id}
          exportTitle={ri('movement_title')}
          exportFilename="mouvements-stock"
          isRTL={isRTL}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyLabel={ri('movement_empty')}
        />
      </Panel>

      {/* Low stock */}
      <Panel>
        <SectionTitle icon={PackageMinus} title={ri('low_stock_title')} />
        <ReportTable columns={productCols()} rows={lowStock} rowKey={(p) => p.id} exportTitle={ri('low_stock_title')} exportFilename="stock-faible" isRTL={isRTL} initialSort={{ key: 'stock', dir: 'asc' }} emptyLabel={ri('none')} />
      </Panel>

      {/* Out of stock */}
      <Panel>
        <SectionTitle icon={PackageX} title={ri('out_of_stock_title')} />
        <ReportTable columns={productCols()} rows={outOfStock} rowKey={(p) => p.id} exportTitle={ri('out_of_stock_title')} exportFilename="rupture-stock" isRTL={isRTL} emptyLabel={ri('none')} />
      </Panel>

      {/* Overstock */}
      <Panel>
        <SectionTitle icon={PackagePlus} title={ri('overstock_title')} subtitle={ri('overstock_hint')} />
        <ReportTable columns={productCols([{ key: 'qtySold', label: ri('col_qty_sold'), align: 'end', numeric: true }])} rows={overstock} rowKey={(p) => p.id} exportTitle={ri('overstock_title')} exportFilename="surstock" isRTL={isRTL} emptyLabel={ri('none')} />
      </Panel>

      {/* Unsold 30/60/90 */}
      <Panel>
        <SectionTitle icon={Clock} title={ri('unsold_title')} />
        <div className="space-y-6">
          {[30, 60, 90].map((d) => (
            <div key={d}>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{ri('unsold_days').replace('{{days}}', String(d))}</p>
              <ReportTable columns={unsoldCols} rows={unsold(d)} rowKey={(p) => p.id} exportTitle={`${ri('unsold_title')} ${d}j`} exportFilename={`invendus-${d}j`} isRTL={isRTL} initialSort={{ key: 'days', dir: 'desc' }} emptyLabel={ri('none')} perPage={5} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ValCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-[6px] border border-border bg-background p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-2">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5 tracking-tight truncate', valueClass ?? 'text-card-foreground')} dir="ltr">{value}</p>
    </div>
  )
}
