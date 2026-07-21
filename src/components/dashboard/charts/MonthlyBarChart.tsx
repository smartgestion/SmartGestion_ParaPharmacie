import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { formatAmount } from '@/lib/utils'

interface MonthlyBarChartProps {
  data: Array<{ name: string; qty: number; revenue: number }>
  isRTL?: boolean
}

/**
 * Monthly product revenue bar chart (used in the Product Details modal).
 * Default-exported so it can be `React.lazy`-loaded.
 */
export default function MonthlyBarChart({ data, isRTL }: MonthlyBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10 }}
          reversed={isRTL}
          interval={0}
          className="fill-muted-foreground"
        />
        <YAxis tick={{ fontSize: 10 }} orientation={isRTL ? 'right' : 'left'} className="fill-muted-foreground" width={48} />
        <Tooltip
          formatter={(value: any) => [`${formatAmount(Number(value))} DH`, '']}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid hsl(var(--border))',
            fontSize: 12,
          }}
          cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
        />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((_, i) => (
            <Cell key={i} fill="var(--color-primary, #10b981)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
