import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileBarChart, Receipt, Percent, Wallet, Landmark } from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, ChartBox, StatLine, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import type { ReportData } from '@/pages/reports/useReportData'

const ReportCharts = React.lazy(() => import('../ReportCharts'))

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
}

interface ExpenseAgg { name: string; supplier: string | null; amount: number; pct: number }
interface MarginAgg { name: string; revenue: number; cost: number; margin: number; marginPct: number }

export function FinanceSection({ data, isRTL, rangeLabel }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rf = (k: string): string => t(`reports.finance.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)

  const { totals, expenses, saleLines, products, purchaseLines } = data

  // ── Expenses by category ──────────────────────────────────────────────────
  const expensesByCategory = useMemo<ExpenseAgg[]>(() => {
    const map = new Map<string, { amount: number; supplier: string | null }>()
    for (const e of expenses) {
      const cur = map.get(e.categorie) ?? { amount: 0, supplier: e.supplierName }
      cur.amount += e.montantTTC
      map.set(e.categorie, cur)
    }
    const total = expenses.reduce((s, e) => s + e.montantTTC, 0)
    return Array.from(map.entries())
      .map(([name, v]) => ({ name: t(`depenses.categories.${categoryKey(name)}`, name) as string, supplier: v.supplier, amount: v.amount, pct: total > 0 ? (v.amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses, lang])

  // ── Commercial margin by product & category ────────────────────────────────
  const marginByProduct = useMemo<MarginAgg[]>(() =>
    products.map((p) => ({ name: p.name, revenue: p.revenueTTC, cost: p.costTTC, margin: p.profit, marginPct: p.margin }))
      .filter((m) => m.revenue > 0)
      .sort((a, b) => b.margin - a.margin),
  [products])

  const marginByCategory = useMemo<MarginAgg[]>(() => {
    const prodBrand = new Map(products.map((p) => [p.id, p.brand]))
    const map = new Map<string, { revenue: number; cost: number }>()
    for (const l of saleLines) {
      const brand = (l.produitId ? prodBrand.get(l.produitId) : null) || rf('uncategorized')
      const cur = map.get(brand) ?? { revenue: 0, cost: 0 }
      cur.revenue += l.revenueTTC
      cur.cost += l.costTTC
      map.set(brand, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, revenue: v.revenue, cost: v.cost, margin: v.revenue - v.cost, marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin)
  }, [saleLines, products, lang])

  // ── Cash flow (monthly) ────────────────────────────────────────────────────
  const cashFlow = useMemo(() => {
    const map = new Map<string, { idx: number; in: number; out: number }>()
    const bump = (iso: string, inAmt: number, outAmt: number) => {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      const cur = map.get(key) ?? { idx: d.getFullYear() * 12 + d.getMonth(), in: 0, out: 0 }
      cur.in += inAmt
      cur.out += outAmt
      map.set(key, cur)
    }
    for (const l of saleLines) bump(l.date, l.revenueTTC, 0)
    for (const e of expenses) bump(e.date, 0, e.montantTTC)
    for (const p of purchaseLines) bump(p.date, 0, p.costTTC)
    const monthName = (idx: number) => new Date(2000, idx % 12, 1).toLocaleDateString(dateFmt, { month: 'short' })
    return Array.from(map.values())
      .sort((a, b) => a.idx - b.idx)
      .map((v) => ({ name: monthName(v.idx), moneyIn: v.in, moneyOut: v.out, balance: v.in - v.out }))
  }, [saleLines, expenses, purchaseLines, dateFmt])

  const moneyIn = cashFlow.reduce((s, c) => s + c.moneyIn, 0)
  const moneyOut = cashFlow.reduce((s, c) => s + c.moneyOut, 0)

  const expenseColumns: ReportColumn<ExpenseAgg>[] = [
    { key: 'name', label: rf('exp_category'), render: (e) => <span className="font-medium">{e.name}</span> },
    { key: 'amount', label: rf('exp_amount'), align: 'end', numeric: true, render: (e) => fmt(e.amount) },
    { key: 'pct', label: rf('exp_pct'), align: 'end', numeric: true, render: (e) => `${e.pct.toFixed(1)}%` },
  ]
  const marginProductColumns: ReportColumn<MarginAgg>[] = [
    { key: 'name', label: rf('mg_name'), render: (m) => <span className="font-medium">{m.name}</span> },
    { key: 'revenue', label: rf('mg_revenue'), align: 'end', numeric: true, render: (m) => fmt(m.revenue) },
    { key: 'cost', label: rf('mg_cost'), align: 'end', numeric: true, render: (m) => fmt(m.cost) },
    { key: 'margin', label: rf('mg_margin'), align: 'end', numeric: true, render: (m) => <span className={signedClass(m.margin)}>{fmt(m.margin)}</span> },
    { key: 'marginPct', label: rf('mg_margin_pct'), align: 'end', numeric: true, render: (m) => <span className={signedClass(m.marginPct)}>{m.marginPct.toFixed(1)}%</span> },
  ]

  return (
    <div className="space-y-6">
      {/* ── Profit & Loss ──────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={FileBarChart} title={rf('pl_title')} subtitle={rangeLabel} />
        <div className="max-w-xl">
          <StatLine label={rf('pl_revenue')} value={fmt(totals.revenueTTC)} strong />
          <StatLine label={rf('pl_cogs')} value={fmt(totals.cogsTTC)} op="−" negative />
          <StatLine label={rf('pl_gross_profit')} value={fmt(totals.grossProfit)} strong positive={totals.grossProfit >= 0} negative={totals.grossProfit < 0} />
          <StatLine label={rf('pl_expenses')} value={fmt(totals.expensesTTC)} op="−" negative />
          <div className="mt-2 rounded-[6px] bg-muted/50 px-3 py-2 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{rf('pl_net_profit')}</span>
            <span className={cn('text-lg font-bold', signedClass(totals.netProfit))} dir="ltr">{fmt(totals.netProfit)}</span>
          </div>
        </div>
      </Panel>

      {/* ── Expense report ─────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Receipt} title={rf('expense_title')} />
        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          <ChartBox title={rf('exp_pie')}>
            <ReportCharts variant="pie" data={expensesByCategory.map((e) => ({ name: e.name, value: e.amount }))} valueKey="value" currency isRTL={isRTL} />
          </ChartBox>
          <ChartBox title={rf('exp_bar')}>
            <ReportCharts variant="bar" data={expensesByCategory.map((e) => ({ name: e.name, value: e.amount }))} dataKeys={['value']} currency isRTL={isRTL} />
          </ChartBox>
        </div>
        <ReportTable columns={expenseColumns} rows={expensesByCategory} rowKey={(e) => e.name} exportTitle={rf('expense_title')} exportFilename="depenses" exportSubtitle={rangeLabel} isRTL={isRTL} initialSort={{ key: 'amount', dir: 'desc' }} emptyLabel={rf('empty')} />
      </Panel>

      {/* ── Commercial margin ──────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Percent} title={rf('margin_title')} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{rf('margin_by_product')}</p>
            <ReportTable columns={marginProductColumns} rows={marginByProduct} rowKey={(m) => m.name} exportTitle={rf('margin_by_product')} exportFilename="marge-produit" isRTL={isRTL} initialSort={{ key: 'margin', dir: 'desc' }} emptyLabel={rf('empty')} perPage={5} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{rf('margin_by_category')}</p>
            <ReportTable columns={marginProductColumns} rows={marginByCategory} rowKey={(m) => m.name} exportTitle={rf('margin_by_category')} exportFilename="marge-categorie" isRTL={isRTL} initialSort={{ key: 'margin', dir: 'desc' }} emptyLabel={rf('empty')} perPage={5} />
          </div>
        </div>
      </Panel>

      {/* ── Cash flow ──────────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Wallet} title={rf('cashflow_title')} />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <ValCard label={rf('money_in')} value={fmt(moneyIn)} valueClass="text-emerald-600 dark:text-emerald-400" />
          <ValCard label={rf('money_out')} value={fmt(moneyOut)} valueClass="text-red-600 dark:text-red-400" />
          <ValCard label={rf('balance')} value={fmt(moneyIn - moneyOut)} valueClass={signedClass(moneyIn - moneyOut)} />
        </div>
        <ChartBox>
          <ReportCharts variant="bar" data={cashFlow} dataKeys={['moneyIn', 'moneyOut']} currency isRTL={isRTL} labels={{ moneyIn: rf('money_in'), moneyOut: rf('money_out') }} colors={['#10b981', '#ef4444']} />
        </ChartBox>
      </Panel>

      {/* ── TVA report ─────────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Landmark} title={rf('tva_title')} subtitle={rf('tva_hint')} />
        <div className="max-w-xl">
          <StatLine label={rf('tva_collected')} value={fmt(totals.tvaCollected)} />
          <StatLine label={rf('tva_deductible')} value={fmt(totals.tvaDeductible)} op="−" />
          <div className="mt-2 rounded-[6px] bg-muted/50 px-3 py-2 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{rf('tva_balance')}</span>
            <span className={cn('text-lg font-bold', signedClass(totals.tvaCollected - totals.tvaDeductible))} dir="ltr">{fmt(totals.tvaCollected - totals.tvaDeductible)}</span>
          </div>
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

function categoryKey(cat: string): string {
  switch (cat) {
    case 'fournitures': return 'supplies'
    case 'loyer': return 'rent'
    case 'salaires': return 'salaries'
    case 'marketing': return 'marketing'
    default: return 'other'
  }
}
