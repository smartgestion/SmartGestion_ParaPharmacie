import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { formatCurrencyLocale } from '@/lib/utils'
import { toIntlLocale } from '@/lib/dateRange'
import { Panel, SectionTitle } from '../reportUi'
import { ReportTable, type ReportColumn } from '../ReportTable'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { remainingDays, expirationColor, expirationColorClasses, computeBatchStatus } from '@/lib/batches'

interface Props {
  isRTL: boolean
  rangeLabel: string
}

interface ExpRow {
  id: number
  product: string
  brand: string
  supplier: string
  lot: string
  entryDate: string | null
  expiryDate: string | null
  days: number | null
  initial: number
  remaining: number
  purchasePrice: number
  purchaseValue: number
  lostValue: number
  status: string
}

/**
 * "Expiration Report" — a self-contained report section listing every product
 * batch with purchase value and estimated lost value (remaining × purchase
 * price for expired batches). Excel / CSV / PDF / Print come free via
 * <ReportTable>.
 */
export function ExpirationSection({ isRTL, rangeLabel }: Props) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const lang = i18n.language ?? 'fr'
  const dateFmt = toIntlLocale(lang)
  const fmt = (n: number) => formatCurrencyLocale(n, lang)
  const rl = (k: string, d: string) => t(`reports.expiration.${k}`, d) as unknown as string

  const [rows, setRows] = useState<ExpRow[]>([])

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString(dateFmt, { timeZone: 'Africa/Casablanca' })
    } catch {
      return iso
    }
  }

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('product_batches')
        .select(
          '*, produits:produits(designation, nom, marque), fournisseurs:fournisseurs(nom)',
        )
        .eq('user_id', user.id)
        .order('expiration_date', { ascending: true })

      const mapped: ExpRow[] = ((data as any[]) || []).map((b) => {
        const remaining = Number(b.quantity_remaining || 0)
        const price = Number(b.purchase_price || 0)
        const d = remainingDays(b.expiration_date)
        const status = computeBatchStatus(b)
        const lost = d !== null && d < 0 ? remaining * price : 0
        return {
          id: b.id,
          product: b.produits?.designation || b.produits?.nom || `#${b.produit_id}`,
          brand: b.produits?.marque || '—',
          supplier: b.fournisseurs?.nom || '—',
          lot: b.lot_number || '—',
          entryDate: b.received_date || null,
          expiryDate: b.expiration_date || null,
          days: d,
          initial: Number(b.quantity_initial || 0),
          remaining,
          purchasePrice: price,
          purchaseValue: remaining * price,
          lostValue: lost,
          status:
            status === 'Empty'
              ? t('lots.status_empty', 'Vide')
              : status === 'Expired'
              ? t('lots.status_expired', 'Périmé')
              : t('lots.status_active', 'Actif'),
        }
      })
      if (!cancelled) setRows(mapped)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const totalPurchaseValue = useMemo(() => rows.reduce((s, r) => s + r.purchaseValue, 0), [rows])
  const totalLostValue = useMemo(() => rows.reduce((s, r) => s + r.lostValue, 0), [rows])

  const columns: ReportColumn<ExpRow>[] = [
    { key: 'product', label: rl('col_product', 'Produit'), render: (r) => <span className="font-medium">{r.product}</span> },
    { key: 'brand', label: rl('col_brand', 'Marque') },
    { key: 'supplier', label: rl('col_supplier', 'Fournisseur') },
    { key: 'lot', label: rl('col_lot', 'N° Lot'), render: (r) => <span className="font-mono text-xs">{r.lot}</span> },
    { key: 'entryDate', label: rl('col_entry', "Date d'entrée"), value: (r) => r.entryDate ?? '', render: (r) => fmtDate(r.entryDate) },
    { key: 'expiryDate', label: rl('col_expiry', 'Péremption'), value: (r) => r.expiryDate ?? '', render: (r) => fmtDate(r.expiryDate) },
    {
      key: 'days',
      label: rl('col_days', 'Jours restants'),
      align: 'end',
      numeric: true,
      value: (r) => (r.days === null ? '' : r.days),
      render: (r) => {
        if (r.days === null) return '—'
        const color = expirationColor(r.expiryDate)
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${expirationColorClasses(color)}`}>
            {r.days < 0 ? `-${Math.abs(r.days)}` : r.days}
          </span>
        )
      },
    },
    { key: 'initial', label: rl('col_initial', 'Qté initiale'), align: 'end', numeric: true },
    { key: 'remaining', label: rl('col_remaining', 'Qté restante'), align: 'end', numeric: true },
    { key: 'purchaseValue', label: rl('col_purchase_value', "Valeur d'achat"), align: 'end', numeric: true, value: (r) => r.purchaseValue, render: (r) => fmt(r.purchaseValue) },
    { key: 'lostValue', label: rl('col_lost_value', 'Valeur perdue estimée'), align: 'end', numeric: true, value: (r) => r.lostValue, render: (r) => <span className={r.lostValue > 0 ? 'text-red-600 font-semibold' : ''}>{fmt(r.lostValue)}</span> },
    { key: 'status', label: rl('col_status', 'Statut') },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Panel>
          <div className="text-xs text-muted-foreground">{rl('total_purchase_value', "Valeur d'achat totale (lots)")}</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalPurchaseValue)}</div>
        </Panel>
        <Panel>
          <div className="text-xs text-muted-foreground">{rl('total_lost_value', 'Valeur perdue estimée (périmés)')}</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{fmt(totalLostValue)}</div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle icon={CalendarClock} title={rl('title', 'Rapport de péremption')} />
        <ReportTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          exportTitle={rl('title', 'Rapport de péremption')}
          exportFilename={`rapport-peremption-${new Date().toISOString().split('T')[0]}`}
          exportSubtitle={rangeLabel}
          isRTL={isRTL}
          initialSort={{ key: 'days', dir: 'asc' }}
        />
      </Panel>
    </div>
  )
}
