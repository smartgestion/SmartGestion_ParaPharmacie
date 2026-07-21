import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image as ImageIcon, Package, Barcode, Tag, Loader2, TrendingUp, DollarSign,
  Percent, Receipt,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatCurrencyLocale, formatAmount } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// Recharts is heavy — lazy-load the monthly chart so it doesn't bloat the
// initial Dashboard bundle. Only fetched when the modal opens.
const MonthlyBarChart = React.lazy(() => import('./charts/MonthlyBarChart'))

export interface AnalyticsProduct {
  produitId: string
  name: string
  barcode: string | null
  brand: string | null
  imageUrl: string | null
  stock: number
  qtySold: number
  revenueTTC: number
  profit: number
  margin: number
  avgPrice: number
}

interface Transaction {
  key: string
  date: string
  client: string | null
  document: string
  qty: number
  priceTTC: number
}

interface ProductDetailsModalProps {
  product: AnalyticsProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const

export function ProductDetailsModal({ product, open, onOpenChange }: ProductDetailsModalProps) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const isRTL = lang.startsWith('ar')
  const dateFmt = toIntlLocale(lang)
  const tp = (key: string, opts?: Record<string, unknown>): string =>
    t(`dashboard.product_analytics.${key}`, opts as any) as unknown as string
  const fmt = (n: number | null | undefined) => formatCurrencyLocale(n ?? 0, lang)

  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [monthly, setMonthly] = useState<Array<{ name: string; qty: number; revenue: number }>>([])

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' })
    } catch {
      return iso
    }
  }

  useEffect(() => {
    if (!open || !product || !user?.id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // Rolling 12-month window for this product's monthly evolution.
        const since = new Date()
        since.setMonth(since.getMonth() - 11, 1)
        since.setHours(0, 0, 0, 0)

        // Valid parent documents (paid / partially-paid invoices + walk-in sales).
        const [factRes, vpRes] = await Promise.all([
          supabase
            .from('factures')
            .select('id, numero, date_emission, client_id, statut')
            .eq('user_id', user.id)
            .in('statut', ['payée', 'reste_a_payer'])
            .gte('date_emission', since.toISOString()),
          supabase
            .from('ventes_passagers')
            .select('id, numero, date, client_nom')
            .eq('user_id', user.id)
            .gte('date', since.toISOString()),
        ])
        const factures = (factRes.data as any[]) ?? []
        const ventes = (vpRes.data as any[]) ?? []
        const factById = new Map(factures.map((f) => [String(f.id), f]))
        const vpById = new Map(ventes.map((v) => [String(v.id), v]))
        const factIds = factures.map((f) => f.id)
        const vpIds = ventes.map((v) => v.id)

        const [factLignesRes, vpLignesRes] = await Promise.all([
          factIds.length
            ? supabase.from('facture_lignes').select('*').in('facture_id', factIds).eq('produit_id', product.produitId)
            : Promise.resolve({ data: [] as any[] }),
          vpIds.length
            ? supabase.from('ventes_passagers_lignes').select('*').eq('produit_id', product.produitId)
            : Promise.resolve({ data: [] as any[] }),
        ])

        const lineTtc = (l: any): number =>
          Number(l.montant_ttc || 0) > 0
            ? Number(l.montant_ttc)
            : Number(l.montant_ht || 0) * (1 + Number(l.tva ?? 20) / 100)
        const unitTtc = (l: any): number =>
          Number(l.prix_unitaire_ht || 0) * (1 + Number(l.tva ?? 20) / 100)

        const txs: Transaction[] = []
        const monthAgg = new Map<string, { qty: number; revenue: number; idx: number }>()
        const bump = (date: string, qty: number, rev: number) => {
          const d = new Date(date)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          const cur = monthAgg.get(key) ?? { qty: 0, revenue: 0, idx: d.getFullYear() * 12 + d.getMonth() }
          cur.qty += qty
          cur.revenue += rev
          monthAgg.set(key, cur)
        }

        for (const l of (factLignesRes as any).data ?? []) {
          const parent = factById.get(String(l.facture_id))
          if (!parent) continue
          const qty = Number(l.quantite || 0)
          txs.push({
            key: `f-${l.id}`,
            date: parent.date_emission,
            client: null,
            document: parent.numero ?? '—',
            qty,
            priceTTC: unitTtc(l),
          })
          bump(parent.date_emission, qty, lineTtc(l))
        }
        for (const l of (vpLignesRes as any).data ?? []) {
          const key = l.vp_id ?? l.vente_passager_id
          const parent = vpById.get(String(key))
          if (!parent) continue
          const qty = Number(l.quantite || 0)
          txs.push({
            key: `v-${l.id}`,
            date: parent.date,
            client: parent.client_nom || null,
            document: parent.numero ?? '—',
            qty,
            priceTTC: unitTtc(l),
          })
          bump(parent.date, qty, lineTtc(l))
        }

        // Resolve invoice client names in one query.
        const clientIds = Array.from(new Set(factures.map((f) => f.client_id).filter((x) => x != null)))
        if (clientIds.length) {
          const { data: clients } = await supabase
            .from('clients').select('id, nom, nom_societe').in('id', clientIds)
          const cById = new Map((clients as any[] ?? []).map((c) => [String(c.id), c]))
          for (const tx of txs) {
            if (tx.key.startsWith('f-')) {
              const parent = factById.get(String((factLignesRes as any).data?.find((l: any) => `f-${l.id}` === tx.key)?.facture_id))
              const c = parent ? cById.get(String(parent.client_id)) : null
              tx.client = c ? (c.nom || c.nom_societe || null) : null
            }
          }
        }

        txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        // Build a continuous 12-month series (fill gaps with zero).
        const series: Array<{ name: string; qty: number; revenue: number }> = []
        const base = new Date(since)
        for (let i = 0; i < 12; i++) {
          const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          const agg = monthAgg.get(key)
          series.push({
            name: t(`dashboard.chart.months.${MONTH_KEYS[d.getMonth()]}`),
            qty: agg?.qty ?? 0,
            revenue: agg?.revenue ?? 0,
          })
        }

        if (!cancelled) {
          setTransactions(txs.slice(0, 10))
          setMonthly(series)
        }
      } catch {
        if (!cancelled) {
          setTransactions([])
          setMonthly([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, product, user?.id, lang])

  const stat = useMemo(() => ([
    { icon: Package, label: tp('modal_total_sold'), value: product ? `${product.qtySold}` : '0', color: 'text-blue-600 dark:text-blue-400' },
    { icon: DollarSign, label: tp('modal_revenue'), value: fmt(product?.revenueTTC), color: 'text-emerald-600 dark:text-emerald-400' },
    { icon: TrendingUp, label: tp('modal_profit'), value: fmt(product?.profit), color: (product?.profit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
    { icon: Percent, label: tp('modal_margin'), value: `${(product?.margin ?? 0).toFixed(1)}%`, color: 'text-violet-600 dark:text-violet-400' },
    { icon: Tag, label: tp('modal_avg_price'), value: fmt(product?.avgPrice), color: 'text-amber-600 dark:text-amber-400' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [product, lang])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {tp('modal_title')}
          </DialogTitle>
        </DialogHeader>

        {!product ? null : (
          <div className="space-y-6">
            {/* ── Product information ─────────────────────────────────── */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {tp('modal_product_info')}
              </h4>
              <div className="flex items-start gap-4">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-20 w-20 rounded-[6px] object-cover border border-border shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="h-20 w-20 rounded-[6px] bg-muted flex items-center justify-center border border-dashed border-border shrink-0">
                    <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-base font-bold text-foreground truncate">{product.name}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1" dir="ltr">
                      <Barcode className="h-3.5 w-3.5" /> {product.barcode || tp('modal_na')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" /> {tp('modal_category')}: {product.brand || tp('modal_na')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" /> {tp('modal_current_stock')}: <span dir="ltr">{product.stock}</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Sales statistics ────────────────────────────────────── */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {tp('modal_sales_stats')}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stat.map((s, i) => (
                  <div key={i} className="rounded-[6px] border border-border bg-card p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      <s.icon className="h-3.5 w-3.5" />
                      {s.label}
                    </div>
                    <p className={cn('text-lg font-bold', s.color)} dir="ltr">{s.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Monthly evolution chart (lazy) ──────────────────────── */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {tp('modal_monthly_chart')}
              </h4>
              <div className="h-56 w-full">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <Suspense fallback={<ChartFallback label={tp('chart_loading')} />}>
                    <MonthlyBarChart data={monthly} isRTL={isRTL} />
                  </Suspense>
                )}
              </div>
            </section>

            {/* ── Last transactions ───────────────────────────────────── */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {tp('modal_last_transactions')}
              </h4>
              <div className="rounded-[6px] border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tp('modal_tx_date')}</TableHead>
                      <TableHead>{tp('modal_tx_client')}</TableHead>
                      <TableHead>{tp('modal_tx_document')}</TableHead>
                      <TableHead className="text-end">{tp('modal_tx_qty')}</TableHead>
                      <TableHead className="text-end">{tp('modal_tx_price')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Receipt className="h-6 w-6 opacity-40" />
                            <span className="text-sm">{tp('modal_no_transactions')}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.key}>
                          <TableCell className="text-xs whitespace-nowrap" dir="ltr">{fmtDate(tx.date)}</TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate">{tx.client || '—'}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{tx.document}</TableCell>
                          <TableCell className="text-end tabular-nums" dir="ltr">{tx.qty}</TableCell>
                          <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">{formatAmount(tx.priceTTC)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}
