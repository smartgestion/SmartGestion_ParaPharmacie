import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, Legend,
} from 'recharts'
import { formatAmount } from '@/lib/utils'

const PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

interface TopProduct { name: string; revenue: number }
interface DistSlice { name: string; value: number }
interface EvolPoint { name: string; revenue: number; qty: number }

interface AnalyticsChartsProps {
  variant: 'top10' | 'distribution' | 'evolution'
  isRTL?: boolean
  top10?: TopProduct[]
  distribution?: DistSlice[]
  evolution?: EvolPoint[]
  currencyLabel?: string
}

/**
 * Combined lazy-loaded chart module. A single `variant` prop selects which
 * chart to render so the three Overview charts share one lazy chunk.
 * Default-exported for `React.lazy`.
 */
export default function AnalyticsCharts({
  variant, isRTL, top10 = [], distribution = [], evolution = [],
}: AnalyticsChartsProps) {
  if (variant === 'top10') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={top10}
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10 }}
            reversed={isRTL}
            className="fill-muted-foreground"
            tickFormatter={(v) => formatAmount(Number(v))}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            orientation={isRTL ? 'right' : 'left'}
            width={120}
            className="fill-muted-foreground"
          />
          <Tooltip
            formatter={(value: any) => [`${formatAmount(Number(value))} DH`, '']}
            contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
            cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
          />
          <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {top10.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (variant === 'distribution') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={distribution}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="75%"
            innerRadius="45%"
            paddingAngle={2}
            label={(entry: any) => `${(entry.percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {distribution.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [`${formatAmount(Number(value))} DH`, name]}
            contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  // evolution
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={evolution} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed={isRTL} className="fill-muted-foreground" />
        <YAxis
          tick={{ fontSize: 10 }}
          orientation={isRTL ? 'right' : 'left'}
          width={52}
          className="fill-muted-foreground"
          tickFormatter={(v) => formatAmount(Number(v))}
        />
        <Tooltip
          formatter={(value: any) => [`${formatAmount(Number(value))} DH`, '']}
          contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
