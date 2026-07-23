import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import {
  remainingDays,
  expirationColor,
  computeBatchStatus,
  isExpired,
  type ProductBatch,
  type ExpirationColor,
} from '@/lib/batches'
import { Button } from '@/components/ui/button'
import {
  Layers,
  Hash,
  CalendarDays,
  CalendarClock,
  Timer,
  PackageOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

const PAGE_SIZE = 10

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  produitId: number | string | null
  produitName?: string
}

// ---------------------------------------------------------------------------
// Colour palettes keyed off the shared semantic expiration colour.
// ---------------------------------------------------------------------------

const PALETTE: Record<ExpirationColor, {
  accent: string      // left border
  dot: string         // solid dot / bar fill
  text: string        // strong text
  badge: string       // badge bg + text + ring
  soft: string        // soft tinted row highlight on hover
}> = {
  green: {
    accent: 'before:bg-emerald-400',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    soft: 'hover:bg-emerald-50/40',
  },
  yellow: {
    accent: 'before:bg-amber-400',
    dot: 'bg-amber-500',
    text: 'text-amber-600',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    soft: 'hover:bg-amber-50/40',
  },
  orange: {
    accent: 'before:bg-orange-400',
    dot: 'bg-orange-500',
    text: 'text-orange-600',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    soft: 'hover:bg-orange-50/40',
  },
  red: {
    accent: 'before:bg-red-500',
    dot: 'bg-red-500',
    text: 'text-red-600',
    badge: 'bg-red-50 text-red-700 ring-red-200',
    soft: 'hover:bg-red-50/40',
  },
  gray: {
    accent: 'before:bg-slate-300',
    dot: 'bg-slate-400',
    text: 'text-slate-500',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    soft: 'hover:bg-slate-50',
  },
}

/**
 * "Inventory Batches" — read-only list of all batches for a single product.
 * Shown from the Products page (per-row action). No expiration data lives on
 * the product itself; it all comes from `product_batches`.
 */
export function ProductBatchesDialog({ open, onOpenChange, produitId, produitName }: Props) {
  const { t, i18n } = useTranslation()
  const fmt = (d?: string | null) => (d ? formatDate(d, 'dd MMM yyyy', i18n.language) : '—')
  const [batches, setBatches] = useState<ProductBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!open || !produitId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('product_batches')
        .select('*')
        .eq('produit_id', produitId)
        .order('expiration_date', { ascending: true })
      if (!cancelled) {
        setBatches((data as ProductBatch[]) || [])
        setPage(1)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, produitId])

  // ---- Aggregated summary for the header stat chips (over ALL batches) -------
  const totalRemaining = batches.reduce((s, b) => s + Number(b.quantity_remaining || 0), 0)
  const expiredCount = batches.filter((b) => isExpired(b.expiration_date)).length
  const soonCount = batches.filter((b) => {
    const d = remainingDays(b.expiration_date)
    return d !== null && d >= 0 && d <= 30
  }).length

  // ---- Pagination ------------------------------------------------------------
  const total = batches.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageBatches = useMemo(
    () => batches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [batches, currentPage],
  )
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total)

  const statusBadge = (b: ProductBatch) => {
    const status = computeBatchStatus(b)
    const color = status === 'Empty' ? 'gray' : expirationColor(b.expiration_date)
    const p = PALETTE[color]
    const label =
      status === 'Empty'
        ? t('lots.status_empty', 'Vide')
        : status === 'Expired'
        ? t('lots.status_expired', 'Périmé')
        : t('lots.status_active', 'Actif')
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${p.badge}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
        {label}
      </span>
    )
  }

  const daysLabel = (b: ProductBatch) => {
    const d = remainingDays(b.expiration_date)
    if (d === null) return <span className="text-slate-400">—</span>
    if (d < 0)
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-red-600">
          {t('lots.expired_since', { days: Math.abs(d), defaultValue: `Périmé (${Math.abs(d)}j)` })}
        </span>
      )
    const color = expirationColor(b.expiration_date)
    const p = PALETTE[color]
    return (
      <span className={`font-semibold ${p.text}`}>
        {t('lots.days_left', { days: d, defaultValue: `${d} j` })}
      </span>
    )
  }

  // A slim horizontal bar showing remaining vs. initial quantity.
  const qtyBar = (b: ProductBatch) => {
    const init = Number(b.quantity_initial || 0)
    const rem = Number(b.quantity_remaining || 0)
    const pct = init > 0 ? Math.max(0, Math.min(100, (rem / init) * 100)) : 0
    const status = computeBatchStatus(b)
    const color = status === 'Empty' ? 'gray' : expirationColor(b.expiration_date)
    const p = PALETTE[color]
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="tabular-nums font-semibold text-slate-800">{rem}</span>
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${p.dot}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  const rowColor = (b: ProductBatch): ExpirationColor => {
    const status = computeBatchStatus(b)
    return status === 'Empty' ? 'gray' : expirationColor(b.expiration_date)
  }

  const headCell = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full !max-w-4xl overflow-hidden rounded-md border-0 p-0">
        {/* Gradient header */}
        <DialogHeader className="gap-3 bg-gradient-to-r from-teal-600 via-teal-600 to-cyan-600 px-6 pt-6 pb-5">
          <DialogTitle className="flex items-center gap-3 text-base text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur">
              <Layers className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-semibold leading-tight">
                {t('lots.inventory_batches', 'Lots en stock')}
              </span>
              {produitName ? (
                <span className="text-xs font-normal text-white/70">{produitName}</span>
              ) : null}
            </span>
          </DialogTitle>

          {/* Summary chips */}
          {!loading && batches.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <StatChip label={t('lots.batches_count', 'Lots')} value={batches.length} />
              <StatChip label={t('lots.remaining_qty', 'Qté restante')} value={totalRemaining} />
              {soonCount > 0 ? (
                <StatChip
                  label={t('lots.expiring_soon', 'Bientôt périmés')}
                  value={soonCount}
                  tone="warn"
                />
              ) : null}
              {expiredCount > 0 ? (
                <StatChip
                  label={t('lots.status_expired', 'Périmé')}
                  value={expiredCount}
                  tone="danger"
                />
              ) : null}
            </div>
          ) : null}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto bg-white px-3 py-2">
          <Table>
            <TableHeader>
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className={`${headCell} pl-6`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-slate-400" />
                    {t('lots.lot_number', 'N° Lot')}
                  </span>
                </TableHead>
                <TableHead className={headCell}>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    {t('lots.entry_date', "Date d'entrée")}
                  </span>
                </TableHead>
                <TableHead className={headCell}>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    {t('lots.expiration_date', 'Péremption')}
                  </span>
                </TableHead>
                <TableHead className={`${headCell} text-right`}>
                  {t('lots.initial_qty', 'Qté initiale')}
                </TableHead>
                <TableHead className={`${headCell} text-right`}>
                  {t('lots.remaining_qty', 'Qté restante')}
                </TableHead>
                <TableHead className={headCell}>
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-slate-400" />
                    {t('lots.remaining_days', 'Jours restants')}
                  </span>
                </TableHead>
                <TableHead className={`${headCell} pr-4`}>
                  {t('lots.status', 'Statut')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
                      {t('shared.loading', 'Chargement...')}
                    </span>
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-50 ring-1 ring-inset ring-slate-100">
                        <PackageOpen className="h-7 w-7 text-slate-300" />
                      </span>
                      <span className="text-sm">
                        {t('lots.no_batches', 'Aucun lot pour ce produit.')}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageBatches.map((b) => {
                  const p = PALETTE[rowColor(b)]
                  return (
                    <TableRow
                      key={b.id}
                      className={`group relative border-none transition-colors ${p.soft}
                        before:absolute before:left-2 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-sm ${p.accent}`}
                    >
                      <TableCell className="py-3 pl-6">
                        <span className="rounded-sm bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70">
                          {b.lot_number || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-slate-600">{fmt(b.received_date)}</TableCell>
                      <TableCell className={`py-3 font-medium ${p.text}`}>
                        {fmt(b.expiration_date)}
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-slate-400">
                        {Number(b.quantity_initial || 0)}
                      </TableCell>
                      <TableCell className="py-3 text-right">{qtyBar(b)}</TableCell>
                      <TableCell className="py-3">{daysLabel(b)}</TableCell>
                      <TableCell className="py-3 pr-4">{statusBadge(b)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        {!loading && total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-3">
            <span className="text-xs text-slate-500">
              {t('shared.showing_range', {
                start: rangeStart,
                end: rangeEnd,
                total,
                defaultValue: `${rangeStart}–${rangeEnd} sur ${total}`,
              })}
            </span>
            <div className="flex items-center gap-1">
              <PagerButton
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                aria-label={t('shared.first_page', 'Première page')}
              >
                <ChevronsLeft className="h-4 w-4" />
              </PagerButton>
              <PagerButton
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                disabled={currentPage === 1}
                aria-label={t('shared.previous', 'Précédent')}
              >
                <ChevronLeft className="h-4 w-4" />
              </PagerButton>
              <span className="px-2 text-xs font-medium tabular-nums text-slate-600">
                {t('shared.page_of', {
                  page: currentPage,
                  total: pageCount,
                  defaultValue: `Page ${currentPage} / ${pageCount}`,
                })}
              </span>
              <PagerButton
                onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
                disabled={currentPage === pageCount}
                aria-label={t('shared.next', 'Suivant')}
              >
                <ChevronRight className="h-4 w-4" />
              </PagerButton>
              <PagerButton
                onClick={() => setPage(pageCount)}
                disabled={currentPage === pageCount}
                aria-label={t('shared.last_page', 'Dernière page')}
              >
                <ChevronsRight className="h-4 w-4" />
              </PagerButton>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// Compact square icon button used by the pagination footer.
function PagerButton({
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="h-7 w-7 rounded-sm border-slate-200 text-slate-600 disabled:opacity-40"
      {...props}
    >
      {children}
    </Button>
  )
}

// A compact stat chip used in the gradient header.
function StatChip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'warn' | 'danger'
}) {
  const tones: Record<string, string> = {
    default: 'bg-white/15 text-white ring-white/25',
    warn: 'bg-amber-400/25 text-amber-50 ring-amber-200/40',
    danger: 'bg-red-500/30 text-red-50 ring-red-200/40',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium ring-1 ring-inset backdrop-blur ${tones[tone]}`}
    >
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  )
}
