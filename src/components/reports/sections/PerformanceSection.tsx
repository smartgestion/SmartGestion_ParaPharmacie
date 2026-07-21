import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Gauge, TrendingUp, TrendingDown, Trophy, AlertTriangle, Minus,
} from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import { Badge } from '@/components/ui/badge'
import type { ReportData, Totals, ProductRow } from '@/pages/reports/useReportData'

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
}

interface Alert { icon: React.ElementType; tone: 'negative' | 'warning'; text: string }

export function PerformanceSection({ data, isRTL, rangeLabel }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rperf = (k: string, o?: Record<string, unknown>): string => t(`reports.performance.${k}`, o as any) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)

  const { totals, prevTotals, products, clients } = data

  const growth = (cur: number, prev: number): number | null =>
    prev === 0 ? (cur > 0 ? 100 : null) : ((cur - prev) / prev) * 100

  const comparisons = useMemo(() => ([
    { key: 'revenue', label: rperf('revenue'), cur: totals.revenueTTC, prev: prevTotals.revenueTTC, money: true },
    { key: 'profit', label: rperf('profit'), cur: totals.netProfit, prev: prevTotals.netProfit, money: true },
    { key: 'expenses', label: rperf('expenses'), cur: totals.expensesTTC, prev: prevTotals.expensesTTC, money: true },
    { key: 'margin', label: rperf('margin'), cur: totals.margin, prev: prevTotals.margin, money: false, suffix: '%' },
    { key: 'sales', label: rperf('sales'), cur: totals.invoicesCount, prev: prevTotals.invoicesCount, money: false },
    { key: 'purchases', label: rperf('purchases'), cur: totals.purchasesTTC, prev: prevTotals.purchasesTTC, money: true },
  ]), [totals, prevTotals, lang])

  // Product profitability rankings.
  const profitability = useMemo(() => products.filter((p) => p.qtySold > 0), [products])

  // Alerts.
  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = []
    const outOfStock = products.filter((p) => p.stock <= 0)
    if (outOfStock.length) out.push({ icon: AlertTriangle, tone: 'negative', text: rperf('alert_out_of_stock', { count: outOfStock.length }) })
    const lowStock = products.filter((p) => p.stock > 0 && p.stockMin > 0 && p.stock <= p.stockMin)
    if (lowStock.length) out.push({ icon: AlertTriangle, tone: 'warning', text: rperf('alert_low_stock', { count: lowStock.length }) })
    const negProfit = products.filter((p) => p.qtySold > 0 && p.profit < 0)
    if (negProfit.length) out.push({ icon: TrendingDown, tone: 'negative', text: rperf('alert_negative_profit', { count: negProfit.length }) })
    const belowCost = products.filter((p) => p.qtySold > 0 && p.avgSellPrice > 0 && p.avgSellPrice < p.prixAchatTtc)
    if (belowCost.length) out.push({ icon: TrendingDown, tone: 'negative', text: rperf('alert_below_cost', { count: belowCost.length }) })
    const outstanding = clients.filter((c) => c.outstanding > 0)
    if (outstanding.length) {
      const total = outstanding.reduce((s, c) => s + c.outstanding, 0)
      out.push({ icon: AlertTriangle, tone: 'warning', text: rperf('alert_outstanding', { count: outstanding.length, amount: fmt(total) }) })
    }
    const daysSince = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null
    const inactive = clients.filter((c) => { const d = daysSince(c.lastPurchase); return d !== null && d >= 60 })
    if (inactive.length) out.push({ icon: AlertTriangle, tone: 'warning', text: rperf('alert_inactive_customers', { count: inactive.length }) })
    return out
  }, [products, clients, lang])

  const profitColumns: ReportColumn<ProductRow>[] = [
    { key: 'name', label: rperf('col_product'), render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'qtySold', label: rperf('col_qty'), align: 'end', numeric: true },
    { key: 'revenueTTC', label: rperf('col_revenue'), align: 'end', numeric: true, render: (p) => fmt(p.revenueTTC) },
    { key: 'profit', label: rperf('col_profit'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.profit)}>{fmt(p.profit)}</span> },
    { key: 'margin', label: rperf('col_margin'), align: 'end', numeric: true, render: (p) => <span className={signedClass(p.margin)}>{p.margin.toFixed(1)}%</span> },
  ]

  return (
    <div className="space-y-6">
      {/* Period comparison */}
      <Panel>
        <SectionTitle icon={Gauge} title={rperf('comparison_title')} subtitle={rperf('comparison_hint')} />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((c) => {
            const g = growth(c.cur, c.prev)
            const positive = (g ?? 0) >= 0
            const fmtVal = (n: number) => c.money ? fmt(n) : `${n.toLocaleString(dateFmt)}${c.suffix ?? ''}`
            return (
              <div key={c.key} className="rounded-[6px] border border-border bg-background p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <div className="flex items-end justify-between mt-1 gap-2">
                  <p className="text-lg font-bold text-card-foreground tracking-tight" dir="ltr">{fmtVal(c.cur)}</p>
                  {g === null ? (
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground"><Minus className="h-3 w-3" /></span>
                  ) : (
                    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} dir="ltr">
                      {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {Math.abs(g).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">{rperf('previous')}: {fmtVal(c.prev)}</p>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* Growth summary */}
      <Panel>
        <SectionTitle icon={TrendingUp} title={rperf('growth_title')} />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <GrowthCard label={rperf('growth_revenue')} value={growth(totals.revenueTTC, prevTotals.revenueTTC)} />
          <GrowthCard label={rperf('growth_profit')} value={growth(totals.netProfit, prevTotals.netProfit)} />
          <GrowthCard label={rperf('growth_expenses')} value={growth(totals.expensesTTC, prevTotals.expensesTTC)} invert />
          <GrowthCard label={rperf('growth_customers')} value={growth(totals.activeCustomers, prevTotals.activeCustomers)} />
        </div>
      </Panel>

      {/* Product profitability */}
      <Panel>
        <SectionTitle icon={Trophy} title={rperf('profitability_title')} subtitle={rperf('profitability_hint')} />
        <ReportTable columns={profitColumns} rows={profitability} rowKey={(p) => p.id} exportTitle={rperf('profitability_title')} exportFilename="rentabilite-produits" exportSubtitle={rangeLabel} isRTL={isRTL} initialSort={{ key: 'profit', dir: 'desc' }} emptyLabel={rperf('empty')} />
      </Panel>

      {/* Alerts */}
      <Panel>
        <SectionTitle icon={AlertTriangle} title={rperf('alerts_title')} />
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{rperf('alerts_none')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {alerts.map((a, i) => (
              <div key={i} className={cn('rounded-[6px] border p-3 flex items-start gap-3', a.tone === 'negative' ? 'border-red-200/60 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5' : 'border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5')}>
                <a.icon className={cn('h-5 w-5 shrink-0 mt-0.5', a.tone === 'negative' ? 'text-red-500' : 'text-amber-500')} />
                <p className="text-sm text-foreground leading-relaxed">{a.text}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function GrowthCard({ label, value, invert }: { label: string; value: number | null; invert?: boolean }) {
  const positive = value === null ? true : invert ? value <= 0 : value >= 0
  return (
    <div className="rounded-[6px] border border-border bg-background p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-2">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5 tracking-tight', value === null ? 'text-muted-foreground' : positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} dir="ltr">
        {value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
      </p>
    </div>
  )
}
