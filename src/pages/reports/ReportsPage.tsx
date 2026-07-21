import React, { Suspense, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getDateRange, toIntlLocale } from '@/lib/dateRange'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilterBar } from '@/components/reports/FilterBar'
import { KpiGrid } from '@/components/reports/KpiGrid'
import { DrillDownDialog, type DrillDownState } from '@/components/reports/DrillDownDialog'
import { useReportData, DEFAULT_FILTERS, type ReportFilters } from './useReportData'

// Lazy-load each report section so only the active tab's code (and its charts)
// is fetched.
const SalesSection = React.lazy(() => import('@/components/reports/sections/SalesSection').then((m) => ({ default: m.SalesSection })))
const ProductsSection = React.lazy(() => import('@/components/reports/sections/ProductsSection').then((m) => ({ default: m.ProductsSection })))
const InventorySection = React.lazy(() => import('@/components/reports/sections/InventorySection').then((m) => ({ default: m.InventorySection })))
const PurchasesSection = React.lazy(() => import('@/components/reports/sections/PurchasesSection').then((m) => ({ default: m.PurchasesSection })))
const FinanceSection = React.lazy(() => import('@/components/reports/sections/FinanceSection').then((m) => ({ default: m.FinanceSection })))
const CustomersSection = React.lazy(() => import('@/components/reports/sections/CustomersSection').then((m) => ({ default: m.CustomersSection })))
const PerformanceSection = React.lazy(() => import('@/components/reports/sections/PerformanceSection').then((m) => ({ default: m.PerformanceSection })))

const TABS = ['sales', 'products', 'inventory', 'purchases', 'finance', 'customers', 'performance'] as const
type TabKey = typeof TABS[number]

export function ReportsPage() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const isRTL = lang.startsWith('ar')
  const dateFmt = toIntlLocale(lang)
  const rr = (k: string): string => t(`reports.${k}`) as unknown as string

  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<TabKey>('sales')
  const [drill, setDrill] = useState<DrillDownState | null>(null)

  const data = useReportData(filters)

  const patchFilters = useCallback((patch: Partial<ReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }, [])
  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  const rangeLabel = useMemo(() => {
    const { start, end } = getDateRange(filters.dateRange, filters.customStart, filters.customEnd)
    return start && end
      ? `${start.toLocaleDateString(dateFmt)} – ${end.toLocaleDateString(dateFmt)}`
      : t('dashboard.date_range.all_time')
  }, [filters, dateFmt, t])

  const openDrill = useCallback((state: DrillDownState) => setDrill(state), [])

  const kpiDrill = useCallback((kind: 'revenue' | 'profit' | 'invoices') => {
    if (kind === 'revenue' || kind === 'invoices') {
      setDrill({ title: t(`reports.kpi.${kind === 'revenue' ? 'total_revenue' : 'invoices'}`), sales: data.saleLines })
    }
  }, [data.saleLines, t])

  if (!user) {
    return <div className="p-8 text-center text-muted-foreground">{rr('auth_required')}</div>
  }

  const sectionProps = { data, isRTL, rangeLabel, onDrill: openDrill }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-primary/10 border border-primary/20 shrink-0">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{rr('title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{rr('subtitle')}</p>
        </div>
      </div>

      {/* Global filters */}
      <FilterBar
        filters={filters}
        onChange={patchFilters}
        onReset={resetFilters}
        categories={data.categories}
        paymentMethods={data.paymentMethods}
      />

      {data.loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-sm">{rr('loading')}</span>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <KpiGrid data={data} onDrill={kpiDrill} />

          {/* Report groups */}
          <Card className="shadow-none rounded-[6px]" dir={isRTL ? 'rtl' : 'ltr'}>
            <CardContent className="p-4 sm:p-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
                <TabsList className="flex-wrap h-auto">
                  {TABS.map((k) => (
                    <TabsTrigger key={k} value={k}>{rr(`tabs.${k}`)}</TabsTrigger>
                  ))}
                </TabsList>

                <div className="pt-5">
                  <Suspense fallback={<SectionFallback label={rr('loading')} />}>
                    {tab === 'sales' && <SalesSection {...sectionProps} />}
                    {tab === 'products' && <ProductsSection {...sectionProps} />}
                    {tab === 'inventory' && <InventorySection data={data} isRTL={isRTL} rangeLabel={rangeLabel} />}
                    {tab === 'purchases' && <PurchasesSection {...sectionProps} />}
                    {tab === 'finance' && <FinanceSection data={data} isRTL={isRTL} rangeLabel={rangeLabel} />}
                    {tab === 'customers' && <CustomersSection {...sectionProps} />}
                    {tab === 'performance' && <PerformanceSection data={data} isRTL={isRTL} rangeLabel={rangeLabel} />}
                  </Suspense>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      <DrillDownDialog state={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function SectionFallback({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
