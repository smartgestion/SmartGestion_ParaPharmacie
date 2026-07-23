import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Boxes, Search, FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import {
  remainingDays,
  expirationColor,
  expirationColorClasses,
  computeBatchStatus,
  isExpired,
} from '@/lib/batches'
import {
  exportExcel,
  exportPDF,
  printReport,
  type ExportColumn,
} from '@/lib/reportExport'

interface BatchRow {
  id: number
  produit_id: number
  supplier_id?: number | null
  bon_commande_id?: number | null
  lot_number?: string | null
  quantity_initial: number
  quantity_remaining: number
  purchase_price: number
  received_date?: string | null
  expiration_date?: string | null
  status: string
  produits?: { designation?: string; nom?: string; marque?: string } | null
  fournisseurs?: { nom?: string } | null
  bons_commande?: { numero?: string } | null
}

type ExpiryFilter = 'all' | 'expired' | 'expiring7' | 'expiring30' | 'expiring60' | 'expiring90'

export function LotsList() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const fmt = (d?: string | null) => (d ? formatDate(d, 'dd MMM yyyy', i18n.language) : '—')

  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all')

  // Pre-apply a filter passed via ?filter= (from dashboard / notifications).
  useEffect(() => {
    const f = searchParams.get('filter') as ExpiryFilter | null
    if (f && ['expired', 'expiring7', 'expiring30', 'expiring60', 'expiring90'].includes(f)) {
      setExpiryFilter(f)
    }
  }, [searchParams])

  const fetchBatches = async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('product_batches')
      .select(
        '*, produits:produits(designation, nom, marque), fournisseurs:fournisseurs(nom), bons_commande:bons_commande(numero)',
      )
      .eq('user_id', user.id)
      .order('expiration_date', { ascending: true })
    setBatches((data as BatchRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const products = useMemo(() => {
    const map = new Map<number, string>()
    for (const b of batches) {
      if (b.produit_id) {
        map.set(b.produit_id, b.produits?.designation || b.produits?.nom || `#${b.produit_id}`)
      }
    }
    return Array.from(map.entries())
  }, [batches])

  const suppliers = useMemo(() => {
    const map = new Map<number, string>()
    for (const b of batches) {
      if (b.supplier_id) {
        map.set(b.supplier_id, b.fournisseurs?.nom || `#${b.supplier_id}`)
      }
    }
    return Array.from(map.entries())
  }, [batches])

  const matchesExpiry = (b: BatchRow): boolean => {
    if (expiryFilter === 'all') return true
    const d = remainingDays(b.expiration_date)
    if (d === null) return false
    switch (expiryFilter) {
      case 'expired':
        return d < 0
      case 'expiring7':
        return d >= 0 && d <= 7
      case 'expiring30':
        return d >= 0 && d <= 30
      case 'expiring60':
        return d >= 0 && d <= 60
      case 'expiring90':
        return d >= 0 && d <= 90
      default:
        return true
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return batches.filter((b) => {
      if (productFilter !== 'all' && String(b.produit_id) !== productFilter) return false
      if (supplierFilter !== 'all' && String(b.supplier_id) !== supplierFilter) return false
      if (!matchesExpiry(b)) return false
      if (q) {
        const hay = [
          b.produits?.designation,
          b.produits?.nom,
          b.lot_number,
          b.fournisseurs?.nom,
          b.bons_commande?.numero,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, search, productFilter, supplierFilter, expiryFilter])

  const statusLabel = (b: BatchRow) => {
    const status = computeBatchStatus(b)
    if (status === 'Empty') return t('lots.status_empty', 'Vide')
    if (status === 'Expired') return t('lots.status_expired', 'Périmé')
    return t('lots.status_active', 'Actif')
  }

  const daysCell = (b: BatchRow) => {
    const d = remainingDays(b.expiration_date)
    if (d === null) return '—'
    if (d < 0) return `-${Math.abs(d)}`
    return String(d)
  }

  // ---- Export --------------------------------------------------------------
  const exportColumns: ExportColumn[] = [
    { key: 'product', label: t('lots.col_product', 'Produit') },
    { key: 'supplier', label: t('lots.col_supplier', 'Fournisseur') },
    { key: 'lot', label: t('lots.lot_number', 'N° Lot') },
    { key: 'document', label: t('lots.col_document', 'Document') },
    { key: 'entry', label: t('lots.entry_date', "Date d'entrée") },
    { key: 'expiry', label: t('lots.expiration_date', 'Péremption') },
    { key: 'days', label: t('lots.remaining_days', 'Jours restants'), numeric: true },
    { key: 'initial', label: t('lots.initial_qty', 'Qté initiale'), numeric: true },
    { key: 'remaining', label: t('lots.remaining_qty', 'Qté restante'), numeric: true },
    { key: 'status', label: t('lots.status', 'Statut') },
  ]

  const exportRows = () =>
    filtered.map((b) => ({
      product: b.produits?.designation || b.produits?.nom || `#${b.produit_id}`,
      supplier: b.fournisseurs?.nom || '—',
      lot: b.lot_number || '—',
      document: b.bons_commande?.numero || '—',
      entry: fmt(b.received_date),
      expiry: fmt(b.expiration_date),
      days: daysCell(b),
      initial: Number(b.quantity_initial || 0),
      remaining: Number(b.quantity_remaining || 0),
      status: statusLabel(b),
    }))

  const buildPayload = () => ({
    title: t('lots.page_title', 'Gestion des Lots'),
    columns: exportColumns,
    rows: exportRows(),
    filename: `lots-${new Date().toISOString().split('T')[0]}`,
    sheetName: t('lots.page_title', 'Lots'),
  })

  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null)

  const handleExportPDF = async () => {
    if (busy) return
    setBusy('pdf')
    try {
      await exportPDF(buildPayload())
      toast.success(t('shared.toast.pdf_success', 'PDF téléchargé avec succès'))
    } catch (e: any) {
      toast.error(e?.message || t('shared.toast.pdf_error', 'Échec du téléchargement du PDF'))
    } finally {
      setBusy(null)
    }
  }

  const handleExportExcel = async () => {
    if (busy) return
    setBusy('excel')
    try {
      await exportExcel(buildPayload())
      toast.success(t('shared.toast.excel_success', 'Fichier Excel téléchargé avec succès'))
    } catch (e: any) {
      toast.error(e?.message || t('shared.toast.excel_error', "Échec de l'export Excel"))
    } finally {
      setBusy(null)
    }
  }

  const handlePrint = () => {
    if (busy) return
    setBusy('print')
    try {
      printReport(buildPayload())
      toast.success(t('shared.toast.print_success', 'Impression envoyée'))
    } catch (e: any) {
      toast.error(e?.message || t('shared.toast.print_error', "Échec de l'impression"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-teal-50 flex items-center justify-center dark:bg-teal-500/10">
            <Boxes className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('lots.page_title', 'Gestion des Lots')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('lots.page_subtitle', 'Suivi des lots et des dates de péremption (FEFO)')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={!!busy}
            className="border border-red-200 bg-red-50 text-red-700 shadow-none hover:bg-red-100 hover:text-red-800 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            {busy === 'pdf' ? (
              <span className="mr-1.5 h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
            ) : (
              <FileDown className="h-4 w-4 mr-1.5" />
            )}
            PDF
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={!!busy}
            className="border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            {busy === 'excel' ? (
              <span className="mr-1.5 h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            )}
            Excel
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={!!busy}
            className="border border-teal-200 bg-teal-50 text-teal-700 shadow-none hover:bg-teal-100 hover:text-teal-800 disabled:opacity-60 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20"
          >
            {busy === 'print' ? (
              <span className="mr-1.5 h-4 w-4 animate-spin rounded-full border-2 border-teal-300 border-t-teal-600" />
            ) : (
              <Printer className="h-4 w-4 mr-1.5" />
            )}
            {t('shared.actions.print', 'Imprimer')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('lots.filters_title', 'Filtres')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('lots.search_ph', 'Rechercher produit, lot, fournisseur...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue placeholder={t('lots.col_product', 'Produit')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('lots.all_products', 'Tous les produits')}</SelectItem>
              {products.map(([id, name]) => (
                <SelectItem key={id} value={String(id)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue placeholder={t('lots.col_supplier', 'Fournisseur')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('lots.all_suppliers', 'Tous les fournisseurs')}</SelectItem>
              {suppliers.map(([id, name]) => (
                <SelectItem key={id} value={String(id)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={expiryFilter} onValueChange={(v) => setExpiryFilter(v as ExpiryFilter)}>
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('lots.filter_all', 'Tous')}</SelectItem>
              <SelectItem value="expired">{t('lots.filter_expired', 'Périmés')}</SelectItem>
              <SelectItem value="expiring7">{t('lots.filter_7', 'Expire ≤ 7 jours')}</SelectItem>
              <SelectItem value="expiring30">{t('lots.filter_30', 'Expire ≤ 30 jours')}</SelectItem>
              <SelectItem value="expiring60">{t('lots.filter_60', 'Expire ≤ 60 jours')}</SelectItem>
              <SelectItem value="expiring90">{t('lots.filter_90', 'Expire ≤ 90 jours')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lots.col_product', 'Produit')}</TableHead>
                  <TableHead>{t('lots.col_supplier', 'Fournisseur')}</TableHead>
                  <TableHead>{t('lots.lot_number', 'N° Lot')}</TableHead>
                  <TableHead>{t('lots.col_document', 'Document')}</TableHead>
                  <TableHead>{t('lots.entry_date', "Date d'entrée")}</TableHead>
                  <TableHead>{t('lots.expiration_date', 'Péremption')}</TableHead>
                  <TableHead className="text-right">{t('lots.remaining_days', 'Jours restants')}</TableHead>
                  <TableHead className="text-right">{t('lots.initial_qty', 'Qté init.')}</TableHead>
                  <TableHead className="text-right">{t('lots.remaining_qty', 'Qté rest.')}</TableHead>
                  <TableHead>{t('lots.status', 'Statut')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-slate-400 py-10">
                      {t('shared.loading', 'Chargement...')}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-slate-400 py-10">
                      {t('lots.no_results', 'Aucun lot trouvé.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => {
                    const color = expirationColor(b.expiration_date)
                    return (
                      <TableRow key={b.id} className={isExpired(b.expiration_date) ? 'bg-red-50/40 dark:bg-red-500/5' : ''}>
                        <TableCell className="font-medium">
                          {b.produits?.designation || b.produits?.nom || `#${b.produit_id}`}
                        </TableCell>
                        <TableCell>{b.fournisseurs?.nom || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{b.lot_number || '—'}</TableCell>
                        <TableCell className="text-xs">{b.bons_commande?.numero || '—'}</TableCell>
                        <TableCell>{fmt(b.received_date)}</TableCell>
                        <TableCell>{fmt(b.expiration_date)}</TableCell>
                        <TableCell className="text-right">{daysCell(b)}</TableCell>
                        <TableCell className="text-right">{Number(b.quantity_initial || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(b.quantity_remaining || 0)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${expirationColorClasses(color)}`}>
                            {statusLabel(b)}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
