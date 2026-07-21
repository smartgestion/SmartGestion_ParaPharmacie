import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { cn, formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { SaleLine, PurchaseLine } from '@/pages/reports/useReportData'

export interface DrillDownState {
  title: string
  sales?: SaleLine[]
  purchases?: PurchaseLine[]
}

interface DrillDownDialogProps {
  state: DrillDownState | null
  onClose: () => void
}

/**
 * Generic drill-down modal: lists the underlying sale (and/or purchase) lines
 * that produced a clicked KPI, chart slice or table row.
 */
export function DrillDownDialog({ state, onClose }: DrillDownDialogProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const isRTL = lang.startsWith('ar')
  const dateFmt = toIntlLocale(lang)
  const rd = (k: string): string => t(`reports.drilldown.${k}`) as unknown as string
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' }) }
    catch { return iso }
  }

  const open = state != null
  const sales = state?.sales ?? []
  const purchases = state?.purchases ?? []

  const salesTotal = sales.reduce((s, l) => s + l.revenueTTC, 0)
  const purchTotal = purchases.reduce((s, l) => s + l.costTTC, 0)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[88vh] overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {state?.title || rd('title')}
          </DialogTitle>
          <DialogDescription>{rd('subtitle')}</DialogDescription>
        </DialogHeader>

        {sales.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rd('sales')}</h4>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmt(salesTotal)}</span>
            </div>
            <div className="rounded-[6px] border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{rd('date')}</TableHead>
                    <TableHead>{rd('document')}</TableHead>
                    <TableHead>{rd('product')}</TableHead>
                    <TableHead>{rd('client')}</TableHead>
                    <TableHead className="text-end">{rd('qty')}</TableHead>
                    <TableHead className="text-end">{rd('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.slice(0, 200).map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="text-xs whitespace-nowrap" dir="ltr">{fmtDate(l.date)}</TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">{l.documentNumber}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{l.designation}</TableCell>
                      <TableCell className="text-sm">
                        {l.source === 'facture'
                          ? (l.clientName || '—')
                          : <Badge variant="outline" className="text-[10px] border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{rd('walk_in')}</Badge>}
                      </TableCell>
                      <TableCell className="text-end tabular-nums" dir="ltr">{l.qty}</TableCell>
                      <TableCell className="text-end tabular-nums whitespace-nowrap font-semibold" dir="ltr">{fmt(l.revenueTTC)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {purchases.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rd('purchases')}</h4>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400" dir="ltr">{fmt(purchTotal)}</span>
            </div>
            <div className="rounded-[6px] border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{rd('date')}</TableHead>
                    <TableHead>{rd('document')}</TableHead>
                    <TableHead>{rd('product')}</TableHead>
                    <TableHead>{rd('supplier')}</TableHead>
                    <TableHead className="text-end">{rd('qty')}</TableHead>
                    <TableHead className="text-end">{rd('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.slice(0, 200).map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="text-xs whitespace-nowrap" dir="ltr">{fmtDate(l.date)}</TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">{l.documentNumber}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{l.designation}</TableCell>
                      <TableCell className="text-sm">{l.supplierName || '—'}</TableCell>
                      <TableCell className="text-end tabular-nums" dir="ltr">{l.qty}</TableCell>
                      <TableCell className="text-end tabular-nums whitespace-nowrap font-semibold" dir="ltr">{fmt(l.costTTC)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {sales.length === 0 && purchases.length === 0 && (
          <p className={cn('py-10 text-center text-sm text-muted-foreground')}>{rd('empty')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
