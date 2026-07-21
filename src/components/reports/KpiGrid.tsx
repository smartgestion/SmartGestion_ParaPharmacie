import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  DollarSign, TrendingUp, Activity, Percent, Boxes, Star, FileText, Users,
  Warehouse, PackageCheck,
} from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import type { ReportData } from '@/pages/reports/useReportData'

interface KpiGridProps {
  data: ReportData
  onDrill?: (kind: 'revenue' | 'profit' | 'invoices') => void
}

export function KpiGrid({ data, onDrill }: KpiGridProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rk = (k: string): string => t(`reports.kpi.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const num = (n: number) => n.toLocaleString(dateFmt)

  const { totals, stockValuationPurchase, stockValuationSelling } = data
  const inventoryProfit = stockValuationSelling - stockValuationPurchase

  const cards: Array<{
    key: string; label: string; value: string; icon: React.ElementType
    iconClass: string; valueClass?: string; onClick?: () => void
  }> = [
    { key: 'revenue', label: rk('total_revenue'), value: fmt(totals.revenueTTC), icon: DollarSign, iconClass: 'bg-emerald-50 border-emerald-200/60 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400', onClick: onDrill ? () => onDrill('revenue') : undefined },
    { key: 'net_profit', label: rk('net_profit'), value: fmt(totals.netProfit), icon: TrendingUp, iconClass: 'bg-violet-50 border-violet-200/60 text-violet-600 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-400', valueClass: totals.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
    { key: 'expenses', label: rk('total_expenses'), value: fmt(totals.expensesTTC), icon: Activity, iconClass: 'bg-rose-50 border-rose-200/60 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400' },
    { key: 'margin', label: rk('commercial_margin'), value: fmt(totals.grossProfit), icon: Percent, iconClass: 'bg-amber-50 border-amber-200/60 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400', valueClass: totals.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
    { key: 'products_sold', label: rk('products_sold'), value: num(totals.productsSold), icon: Boxes, iconClass: 'bg-blue-50 border-blue-200/60 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400' },
    { key: 'avg_sale', label: rk('avg_sale'), value: fmt(totals.avgSale), icon: Star, iconClass: 'bg-cyan-50 border-cyan-200/60 text-cyan-600 dark:bg-cyan-500/10 dark:border-cyan-500/20 dark:text-cyan-400' },
    { key: 'invoices', label: rk('invoices'), value: num(totals.invoicesCount), icon: FileText, iconClass: 'bg-indigo-50 border-indigo-200/60 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400', onClick: onDrill ? () => onDrill('invoices') : undefined },
    { key: 'active_customers', label: rk('active_customers'), value: num(totals.activeCustomers), icon: Users, iconClass: 'bg-pink-50 border-pink-200/60 text-pink-600 dark:bg-pink-500/10 dark:border-pink-500/20 dark:text-pink-400' },
    { key: 'stock_value', label: rk('stock_value'), value: fmt(stockValuationPurchase), icon: Warehouse, iconClass: 'bg-slate-100 border-slate-200/60 text-slate-600 dark:bg-slate-500/10 dark:border-slate-500/20 dark:text-slate-400' },
    { key: 'inventory_profit', label: rk('inventory_profit'), value: fmt(inventoryProfit), icon: PackageCheck, iconClass: 'bg-teal-50 border-teal-200/60 text-teal-600 dark:bg-teal-500/10 dark:border-teal-500/20 dark:text-teal-400', valueClass: inventoryProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClick}
          disabled={!c.onClick}
          className={cn(
            'rounded-[6px] bg-card p-3 border border-border text-start animate-in fade-in duration-300',
            c.onClick && 'hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer',
            !c.onClick && 'cursor-default',
          )}
        >
          <div className="flex items-start justify-between mb-2">
            <span />
            <div className={cn('h-8 w-8 rounded-sm flex items-center justify-center shrink-0 border', c.iconClass)}>
              <c.icon className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground tracking-wide uppercase text-start line-clamp-2">{c.label}</p>
          <p className={cn('text-base sm:text-lg font-bold mt-0.5 tracking-tight text-start truncate', c.valueClass ?? 'text-card-foreground')} dir="ltr">{c.value}</p>
        </button>
      ))}
    </div>
  )
}
