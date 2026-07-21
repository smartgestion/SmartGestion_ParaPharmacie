import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Search, X, Package, Loader2, Filter, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { type DateRangeKey } from '@/lib/dateRange'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { ReportFilters } from '@/pages/reports/useReportData'

interface Option { id: string; label: string }

interface FilterBarProps {
  filters: ReportFilters
  onChange: (patch: Partial<ReportFilters>) => void
  onReset: () => void
  categories: string[]
  paymentMethods: string[]
}

const INVOICE_STATUSES = ['payée', 'reste_a_payer'] as const

export function FilterBar({ filters, onChange, onReset, categories, paymentMethods }: FilterBarProps) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const rf = (k: string): string => t(`reports.filters.${k}`) as unknown as string

  const [clients, setClients] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])

  // Product autocomplete
  const [productQuery, setProductQuery] = useState('')
  const [productOptions, setProductOptions] = useState<Array<{ id: string; label: string; barcode?: string; reference?: string }>>([])
  const [selectedProductLabel, setSelectedProductLabel] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const [cliRes, fourRes] = await Promise.all([
        supabase.from('clients').select('id, nom, nom_societe').eq('user_id', user.id).order('nom'),
        supabase.from('fournisseurs').select('id, nom, nom_societe').eq('user_id', user.id).order('nom'),
      ])
      if (cancelled) return
      setClients(((cliRes.data as any[]) ?? []).map((c) => ({ id: String(c.id), label: c.nom || c.nom_societe || `#${c.id}` })))
      setSuppliers(((fourRes.data as any[]) ?? []).map((f) => ({ id: String(f.id), label: f.nom || f.nom_societe || `#${f.id}` })))
    })()
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (!user?.id || !dropdownOpen) return
    const term = productQuery.trim()
    const handle = setTimeout(async () => {
      setSearching(true)
      try {
        let q = supabase.from('produits').select('id, designation, nom, reference, barcode').eq('user_id', user.id)
        if (term) {
          const like = `%${term}%`
          q = q.or(`designation.ilike.${like},nom.ilike.${like},reference.ilike.${like},barcode.ilike.${like}`)
        }
        q = q.order('designation').limit(20)
        const { data } = await q
        setProductOptions(((data as any[]) ?? []).map((p) => ({
          id: String(p.id), label: p.designation || p.nom || `#${p.id}`, barcode: p.barcode, reference: p.reference,
        })))
      } catch {
        setProductOptions([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [productQuery, dropdownOpen, user?.id])

  const statusLabel = (s: string) => t(`shared.status.${s === 'payée' ? 'paid' : 'partial'}`)

  return (
    <div className="rounded-[6px] border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {rf('title')}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 me-1" />
          {rf('reset')}
        </Button>
      </div>

      {/* Date fast filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year'] as const).map((key) => (
          <button
            key={key}
            onClick={() => onChange({ dateRange: key })}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md border transition-all',
              filters.dateRange === key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {t(`dashboard.date_range.${key}`)}
          </button>
        ))}
        <Select value={filters.dateRange} onValueChange={(v) => onChange({ dateRange: v as DateRangeKey })}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue>{t(`dashboard.date_range.${filters.dateRange}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(['all', 'custom'] as const).map((key) => (
              <SelectItem key={key} value={key} className="text-xs">{t(`dashboard.date_range.${key}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filters.dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={filters.customStart} onChange={(e) => onChange({ customStart: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2.5 text-xs" />
            <span className="text-xs text-muted-foreground">-</span>
            <input type="date" value={filters.customEnd} onChange={(e) => onChange({ customEnd: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2.5 text-xs" />
          </div>
        )}
      </div>

      {/* Dropdown filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Product autocomplete */}
        <div className="relative" ref={boxRef}>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{rf('product')}</label>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={filters.productId && !dropdownOpen ? selectedProductLabel : productQuery}
              onChange={(e) => { setProductQuery(e.target.value); if (!dropdownOpen) setDropdownOpen(true) }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={rf('product_ph')}
              className="ps-9 pe-9 h-9 text-sm"
            />
            {(filters.productId || productQuery) && (
              <button
                type="button"
                onClick={() => { onChange({ productId: null }); setSelectedProductLabel(''); setProductQuery(''); setDropdownOpen(false) }}
                aria-label={rf('clear')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-64 overflow-y-auto">
                {searching ? (
                  <div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />{rf('searching')}
                  </div>
                ) : productOptions.length === 0 ? (
                  <div className="py-5 text-center text-xs text-muted-foreground">{rf('no_products')}</div>
                ) : (
                  <ul className="py-1">
                    {productOptions.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => { onChange({ productId: p.id }); setSelectedProductLabel(p.label); setProductQuery(''); setDropdownOpen(false) }}
                          className={cn('w-full text-start px-3 py-2 hover:bg-accent transition-colors', filters.productId === p.id && 'bg-accent')}
                        >
                          <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{p.label}
                          </p>
                          {(p.barcode || p.reference) && (
                            <p className="text-[11px] text-muted-foreground font-mono ps-5" dir="ltr">{p.reference} {p.barcode}</p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category (brand) */}
        <FilterSelect
          label={rf('category')}
          allLabel={rf('all_categories')}
          value={filters.category}
          onChange={(v) => onChange({ category: v })}
          options={categories.map((c) => ({ id: c, label: c }))}
        />

        {/* Supplier */}
        <FilterSelect
          label={rf('supplier')}
          allLabel={rf('all_suppliers')}
          value={filters.supplierId}
          onChange={(v) => onChange({ supplierId: v })}
          options={suppliers}
        />

        {/* Client */}
        <FilterSelect
          label={rf('client')}
          allLabel={rf('all_clients')}
          value={filters.clientId}
          onChange={(v) => onChange({ clientId: v })}
          options={clients}
        />

        {/* Payment method */}
        <FilterSelect
          label={rf('payment_method')}
          allLabel={rf('all_payments')}
          value={filters.paymentMethod}
          onChange={(v) => onChange({ paymentMethod: v })}
          options={paymentMethods.map((m) => ({ id: m, label: m }))}
        />

        {/* Invoice status */}
        <FilterSelect
          label={rf('invoice_status')}
          allLabel={rf('all_statuses')}
          value={filters.invoiceStatus}
          onChange={(v) => onChange({ invoiceStatus: v })}
          options={INVOICE_STATUSES.map((s) => ({ id: s, label: statusLabel(s) }))}
        />

        {/* Warehouse (future-ready, disabled) */}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{rf('warehouse')}</label>
          <Select value="all" disabled>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue>{rf('all_warehouses')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{rf('all_warehouses')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active range hint */}
      <p className="text-[11px] text-muted-foreground">
        <CalendarDays className="inline h-3 w-3 me-1" />
        {t(`dashboard.date_range.${filters.dateRange}`)}
      </p>
    </div>
  )
}

function FilterSelect({
  label, allLabel, value, onChange, options,
}: {
  label: string; allLabel: string; value: string | null
  onChange: (v: string | null) => void; options: Option[]
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{label}</label>
      <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue>{value ? (options.find((o) => o.id === value)?.label ?? value) : allLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all" className="text-xs">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
