import React, { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Section heading used across report groups. */
export function SectionTitle({ icon: Icon, title, subtitle }: { icon?: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

/** White card wrapper with consistent spacing. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-[6px] border border-border bg-card p-4', className)}>{children}</div>
}

/** Chart container with a fixed responsive height and lazy-loading Suspense. */
export function ChartBox({ title, height = 'h-64', children }: { title?: string; height?: string; children: React.ReactNode }) {
  return (
    <Panel>
      {title && <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</h4>}
      <div className={cn('w-full', height)}>
        <Suspense fallback={<ChartFallback />}>{children}</Suspense>
      </div>
    </Panel>
  )
}

export function ChartFallback() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

/** A small stat row for financial statements (P&L, cash flow, TVA). */
export function StatLine({
  label, value, strong, positive, negative, indent, op,
}: {
  label: string; value: string; strong?: boolean
  positive?: boolean; negative?: boolean; indent?: boolean; op?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0', indent && 'ps-4')}>
      <span className={cn('text-sm flex items-center gap-1.5', strong ? 'font-bold text-foreground' : 'text-muted-foreground')}>
        {op && <span className="font-mono font-bold text-foreground w-3 text-center">{op}</span>}
        {label}
      </span>
      <span
        className={cn(
          'text-sm tabular-nums whitespace-nowrap',
          strong ? 'font-bold' : 'font-semibold',
          positive && 'text-emerald-600 dark:text-emerald-400',
          negative && 'text-red-600 dark:text-red-400',
          !positive && !negative && 'text-card-foreground',
        )}
        dir="ltr"
      >
        {value}
      </span>
    </div>
  )
}

/** Colour a value green (positive) or red (negative). */
export function signedClass(n: number): string {
  return n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-red-600 dark:text-red-400' : 'text-card-foreground'
}

/** Hour × weekday heatmap (pure CSS grid — recharts has no heatmap). */
export function Heatmap({
  matrix, rowLabels, colLabels, title,
}: {
  matrix: number[][]        // [row][col]
  rowLabels: string[]       // weekdays
  colLabels: string[]       // hours
  title?: string
}) {
  const max = Math.max(1, ...matrix.flat())
  const cellColor = (v: number) => {
    if (v <= 0) return 'bg-muted/40'
    const intensity = v / max
    if (intensity > 0.75) return 'bg-emerald-600 text-white'
    if (intensity > 0.5) return 'bg-emerald-500/80 text-white'
    if (intensity > 0.25) return 'bg-emerald-400/60'
    return 'bg-emerald-300/40'
  }
  return (
    <Panel>
      {title && <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</h4>}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Column header */}
          <div className="flex">
            <div className="w-12 shrink-0" />
            {colLabels.map((c) => (
              <div key={c} className="flex-1 min-w-[22px] text-center text-[9px] text-muted-foreground">{c}</div>
            ))}
          </div>
          {matrix.map((row, ri) => (
            <div key={ri} className="flex items-center">
              <div className="w-12 shrink-0 text-[10px] text-muted-foreground text-end pe-2">{rowLabels[ri]}</div>
              {row.map((v, ci) => (
                <div
                  key={ci}
                  title={`${rowLabels[ri]} ${colLabels[ci]}: ${v}`}
                  className={cn('flex-1 min-w-[22px] h-6 m-[1px] rounded-[3px] flex items-center justify-center text-[9px] font-medium transition-colors', cellColor(v))}
                >
                  {v > 0 ? v : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
