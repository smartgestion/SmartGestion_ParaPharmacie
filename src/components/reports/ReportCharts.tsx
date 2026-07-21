import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts'
import { formatAmount } from '@/lib/utils'

export const CHART_PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7',
]

interface SeriesPoint { name: string; [key: string]: string | number }

type Variant = 'bar' | 'hbar' | 'line' | 'area' | 'pie'

interface ReportChartsProps {
  variant: Variant
  data: SeriesPoint[]
  /** Data keys to plot (for bar/line/area). Defaults to ['value']. */
  dataKeys?: string[]
  /** For pie: which key holds the numeric value. */
  valueKey?: string
  /** Format Y/values as currency. */
  currency?: boolean
  isRTL?: boolean
  colors?: string[]
  /** Series labels keyed by dataKey, for the legend/tooltip. */
  labels?: Record<string, string>
}

/**
 * Unified, lazy-loaded recharts module for the Reports page. A single
 * `variant` prop chooses the chart type so all report charts share one chunk.
 * Default-exported for `React.lazy`.
 */
export default function ReportCharts({
  variant, data, dataKeys = ['value'], valueKey = 'value',
  currency, isRTL, colors = CHART_PALETTE, labels = {},
}: ReportChartsProps) {
  const fmtVal = (v: any) => (currency ? `${formatAmount(Number(v))} DH` : String(v))
  const tooltipStyle = { borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }
  const nameOf = (k: string) => labels[k] ?? k

  if (variant === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="75%"
            innerRadius="45%"
            paddingAngle={2}
            label={(e: any) => `${(e.percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: any, n: any) => [fmtVal(v), n]} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (variant === 'hbar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} reversed={isRTL} className="fill-muted-foreground" tickFormatter={(v) => (currency ? formatAmount(Number(v)) : String(v))} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} orientation={isRTL ? 'right' : 'left'} width={130} className="fill-muted-foreground" />
          <Tooltip formatter={(v: any) => [fmtVal(v), '']} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
          <Bar dataKey={dataKeys[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (variant === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed={isRTL} className="fill-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} orientation={isRTL ? 'right' : 'left'} width={52} className="fill-muted-foreground" tickFormatter={(v) => (currency ? formatAmount(Number(v)) : String(v))} />
          <Tooltip formatter={(v: any, k: any) => [fmtVal(v), nameOf(String(k))]} contentStyle={tooltipStyle} />
          {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k) => nameOf(String(k))} />}
          {dataKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (variant === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {dataKeys.map((k, i) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.35} />
                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed={isRTL} className="fill-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} orientation={isRTL ? 'right' : 'left'} width={52} className="fill-muted-foreground" tickFormatter={(v) => (currency ? formatAmount(Number(v)) : String(v))} />
          <Tooltip formatter={(v: any, k: any) => [fmtVal(v), nameOf(String(k))]} contentStyle={tooltipStyle} />
          {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k) => nameOf(String(k))} />}
          {dataKeys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} fill={`url(#grad-${k})`} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  // vertical bar (default)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed={isRTL} interval={0} className="fill-muted-foreground" />
        <YAxis tick={{ fontSize: 10 }} orientation={isRTL ? 'right' : 'left'} width={52} className="fill-muted-foreground" tickFormatter={(v) => (currency ? formatAmount(Number(v)) : String(v))} />
        <Tooltip formatter={(v: any, k: any) => [fmtVal(v), nameOf(String(k))]} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k) => nameOf(String(k))} />}
        {dataKeys.map((k, i) => (
          <Bar key={k} dataKey={k} radius={[4, 4, 0, 0]} maxBarSize={40} fill={colors[i % colors.length]}>
            {dataKeys.length === 1 && data.map((_, idx) => <Cell key={idx} fill={colors[idx % colors.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
