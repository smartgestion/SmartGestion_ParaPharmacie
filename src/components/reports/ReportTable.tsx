import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Columns3, FileSpreadsheet, FileText, FileDown, Printer, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  exportExcel, exportCSV, exportPDF, printReport,
  type ExportColumn,
} from '@/lib/reportExport'

export interface ReportColumn<T> {
  key: string
  label: string
  /** Custom cell renderer; falls back to `row[key]`. */
  render?: (row: T) => React.ReactNode
  /** Value used for sorting / export / search (defaults to row[key]). */
  value?: (row: T) => string | number | null | undefined
  align?: 'start' | 'end'
  numeric?: boolean
  sortable?: boolean
  /** Hidden by default (still toggleable). */
  defaultHidden?: boolean
}

interface ReportTableProps<T> {
  columns: ReportColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Export metadata. */
  exportTitle: string
  exportFilename: string
  exportSubtitle?: string
  /** Row click → drill-down. */
  onRowClick?: (row: T) => void
  emptyLabel?: string
  perPage?: number
  isRTL?: boolean
  /** Default sort. */
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  /** Compact density. */
  dense?: boolean
}

const DEFAULT_PER_PAGE = 10

export function ReportTable<T>({
  columns, rows, rowKey, exportTitle, exportFilename, exportSubtitle,
  onRowClick, emptyLabel, perPage = DEFAULT_PER_PAGE, isRTL, initialSort, dense,
}: ReportTableProps<T>) {
  const { t } = useTranslation()
  const rt = (k: string, o?: Record<string, unknown>): string =>
    t(`reports.table.${k}`, o as any) as unknown as string

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort?.dir ?? 'desc')
  const [page, setPage] = useState(1)
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  )
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const valueOf = (col: ReportColumn<T>, row: T): string | number | null | undefined =>
    col.value ? col.value(row) : (row as any)[col.key]

  const visibleColumns = columns.filter((c) => !hidden.has(c.key))

  // ── Search across all column values ─────────────────────────────────────
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      columns.some((c) => String(valueOf(c, row) ?? '').toLowerCase().includes(term)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, columns])

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return searched
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return searched
    const dir = sortDir === 'asc' ? 1 : -1
    return [...searched].sort((a, b) => {
      const av = valueOf(col, a)
      const bv = valueOf(col, b)
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir
      const an = Number(av ?? 0)
      const bn = Number(bv ?? 0)
      if (an < bn) return -1 * dir
      if (an > bn) return 1 * dir
      return 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages, page])
  useEffect(() => { setPage(1) }, [search])
  const pageRows = sorted.slice((page - 1) * perPage, page * perPage)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Export (filtered + sorted rows) ─────────────────────────────────────
  const buildPayload = () => {
    const exportCols: ExportColumn[] = visibleColumns.map((c) => ({
      key: c.key, label: c.label, numeric: c.numeric,
    }))
    const exportRows = sorted.map((row) => {
      const o: Record<string, string | number | null | undefined> = {}
      for (const c of visibleColumns) o[c.key] = valueOf(c, row)
      return o
    })
    return {
      title: exportTitle, subtitle: exportSubtitle, columns: exportCols, rows: exportRows,
      filename: exportFilename, sheetName: exportTitle, isRTL,
    }
  }

  const SortIcon = ({ col }: { col: ReportColumn<T> }) => {
    if (col.sortable === false) return null
    if (sortKey !== col.key) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={rt('search_placeholder')}
            className="ps-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Column visibility */}
          <div className="relative" ref={colMenuRef}>
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => setColMenuOpen((v) => !v)}>
              <Columns3 className="h-4 w-4 me-1.5" />
              {rt('columns')}
            </Button>
            {colMenuOpen && (
              <div className="absolute z-50 mt-1 end-0 w-52 rounded-md border border-input bg-popover shadow-lg py-1 max-h-72 overflow-y-auto">
                {columns.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleColumn(c.key)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-start"
                  >
                    <span className={cn('h-4 w-4 rounded-[3px] border flex items-center justify-center shrink-0', !hidden.has(c.key) ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>
                      {!hidden.has(c.key) && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => exportExcel(buildPayload())} disabled={sorted.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => exportCSV(buildPayload())} disabled={sorted.length === 0}>
            <FileDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => exportPDF(buildPayload())} disabled={sorted.length === 0}>
            <FileText className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => printReport(buildPayload())} disabled={sorted.length === 0}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table (sticky header, horizontal scroll) */}
      <div className="rounded-md border border-border overflow-x-auto max-h-[560px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {visibleColumns.map((c) => (
                <TableHead key={c.key} className={cn(c.align === 'end' ? 'text-end' : 'text-start', 'bg-card')}>
                  {c.sortable === false ? (
                    <span className="font-semibold">{c.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn('inline-flex items-center gap-1 font-semibold hover:text-primary transition-colors', c.align === 'end' && 'flex-row-reverse')}
                    >
                      {c.label}
                      <SortIcon col={c} />
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="h-28 text-center text-sm text-muted-foreground">
                  {emptyLabel ?? rt('empty')}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && 'cursor-pointer', dense && '[&>td]:py-1.5')}
                >
                  {visibleColumns.map((c) => (
                    <TableCell key={c.key} className={cn(c.align === 'end' && 'text-end', c.numeric && 'tabular-nums whitespace-nowrap')} dir={c.numeric ? 'ltr' : undefined}>
                      {c.render ? c.render(row) : (valueOf(c, row) ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {rt('showing', {
              from: (page - 1) * perPage + 1,
              to: Math.min(page * perPage, sorted.length),
              total: sorted.length,
            })}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />{rt('prev')}
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {rt('page_info', { current: page, total: totalPages })}
              </span>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                {rt('next')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
