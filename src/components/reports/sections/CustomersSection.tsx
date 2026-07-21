import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Trophy, Wallet, UserPlus, Repeat, UserX } from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle, ChartBox, signedClass } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import type { ReportData, ClientRow } from '@/pages/reports/useReportData'
import type { DrillDownState } from '../DrillDownDialog'

const ReportCharts = React.lazy(() => import('../ReportCharts'))

interface Props {
  data: ReportData
  isRTL: boolean
  rangeLabel: string
  onDrill: (state: DrillDownState) => void
}

export function CustomersSection({ data, isRTL, rangeLabel, onDrill }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const rc = (k: string): string => t(`reports.customers.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) } catch { return iso }
  }

  const { clients, saleLines } = data

  const balance = useMemo(() => {
    const totalRevenue = clients.reduce((s, c) => s + c.revenueTTC, 0)
    const outstanding = clients.reduce((s, c) => s + c.outstanding, 0)
    return { paid: totalRevenue - outstanding, remaining: outstanding, credit: 0 }
  }, [clients])

  const newCustomers = useMemo(() => {
    const map = new Map<string, { idx: number; count: number }>()
    for (const c of clients) {
      if (!c.firstPurchase) continue
      const d = new Date(c.firstPurchase)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      const cur = map.get(key) ?? { idx: d.getFullYear() * 12 + d.getMonth(), count: 0 }
      cur.count += 1
      map.set(key, cur)
    }
    const monthName = (idx: number) => new Date(2000, idx % 12, 1).toLocaleDateString(dateFmt, { month: 'short' })
    return Array.from(map.values()).sort((a, b) => a.idx - b.idx).map((v) => ({ name: monthName(v.idx), value: v.count }))
  }, [clients, dateFmt])

  const returning = useMemo(() => {
    const repeat = clients.filter((c) => c.invoices > 1).length
    const total = clients.length
    return { repeat, once: total - repeat, rate: total > 0 ? (repeat / total) * 100 : 0 }
  }, [clients])

  const daysSince = (iso: string | null): number | null => {
    if (!iso) return null
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
  }
  const inactive = (days: number) => clients.filter((c) => { const d = daysSince(c.lastPurchase); return d !== null && d >= days })

  const drill = (c: ClientRow) => onDrill({ title: c.name, sales: saleLines.filter((l) => l.clientId === c.id) })

  const columns: ReportColumn<ClientRow>[] = [
    { key: 'name', label: rc('col_name'), render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'invoices', label: rc('col_invoices'), align: 'end', numeric: true },
    { key: 'revenueTTC', label: rc('col_revenue'), align: 'end', numeric: true, render: (c) => fmt(c.revenueTTC) },
    { key: 'profit', label: rc('col_profit'), align: 'end', numeric: true, render: (c) => <span className={signedClass(c.profit)}>{fmt(c.profit)}</span> },
    { key: 'avgInvoice', label: rc('col_avg'), align: 'end', numeric: true, render: (c) => fmt(c.avgInvoice) },
    { key: 'outstanding', label: rc('col_outstanding'), align: 'end', numeric: true, render: (c) => <span className={c.outstanding > 0 ? 'text-red-600 dark:text-red-400' : ''}>{fmt(c.outstanding)}</span> },
    { key: 'lastPurchase', label: rc('col_last'), align: 'end', value: (c) => c.lastPurchase ?? '', render: (c) => fmtDate(c.lastPurchase) },
  ]

  const inactiveColumns: ReportColumn<ClientRow>[] = [
    { key: 'name', label: rc('col_name'), render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'revenueTTC', label: rc('col_revenue'), align: 'end', numeric: true, render: (c) => fmt(c.revenueTTC) },
    { key: 'lastPurchase', label: rc('col_last'), align: 'end', value: (c) => c.lastPurchase ?? '', render: (c) => fmtDate(c.lastPurchase) },
    { key: 'days', label: rc('col_days'), align: 'end', numeric: true, value: (c) => daysSince(c.lastPurchase) ?? 0, render: (c) => `${daysSince(c.lastPurchase) ?? '—'}` },
  ]

  return (
    <div className="space-y-6">
      {/* Top customers + ranking (same sorted table) */}
      <Panel>
        <SectionTitle icon={Trophy} title={rc('top_title')} subtitle={rangeLabel} />
        <ReportTable columns={columns} rows={clients} rowKey={(c) => c.id} exportTitle={rc('top_title')} exportFilename="top-clients" exportSubtitle={rangeLabel} isRTL={isRTL} initialSort={{ key: 'revenueTTC', dir: 'desc' }} onRowClick={drill} emptyLabel={rc('empty')} />
      </Panel>

      {/* Balance + returning */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={Wallet} title={rc('balance_title')} />
          <div className="grid grid-cols-3 gap-3">
            <ValCard label={rc('paid')} value={fmt(balance.paid)} valueClass="text-emerald-600 dark:text-emerald-400" />
            <ValCard label={rc('remaining')} value={fmt(balance.remaining)} valueClass="text-red-600 dark:text-red-400" />
            <ValCard label={rc('credit')} value={fmt(balance.credit)} />
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Repeat} title={rc('returning_title')} />
          <div className="grid grid-cols-3 gap-3">
            <ValCard label={rc('returning_repeat')} value={returning.repeat.toLocaleString(dateFmt)} />
            <ValCard label={rc('returning_once')} value={returning.once.toLocaleString(dateFmt)} />
            <ValCard label={rc('returning_rate')} value={`${returning.rate.toFixed(0)}%`} />
          </div>
        </Panel>
      </div>

      {/* New customers */}
      <Panel>
        <SectionTitle icon={UserPlus} title={rc('new_title')} />
        <ChartBox><ReportCharts variant="bar" data={newCustomers} dataKeys={['value']} isRTL={isRTL} /></ChartBox>
      </Panel>

      {/* Inactive */}
      <Panel>
        <SectionTitle icon={UserX} title={rc('inactive_title')} />
        <div className="space-y-6">
          {[30, 60, 90].map((d) => (
            <div key={d}>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{rc('inactive_days').replace('{{days}}', String(d))}</p>
              <ReportTable columns={inactiveColumns} rows={inactive(d)} rowKey={(c) => c.id} exportTitle={`${rc('inactive_title')} ${d}j`} exportFilename={`clients-inactifs-${d}j`} isRTL={isRTL} initialSort={{ key: 'days', dir: 'desc' }} onRowClick={drill} emptyLabel={rc('none')} perPage={5} />
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
