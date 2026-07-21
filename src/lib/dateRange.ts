/**
 * Shared date-range helpers used by the Dashboard analytics sections
 * (ProductSalesFilter, ProductAnalytics). Extracted here so the range logic
 * lives in a single place and stays consistent across sections.
 */

export type DateRangeKey =
  | 'today' | 'yesterday' | 'this_week' | 'last_week'
  | 'this_month' | 'last_month' | 'this_year' | 'last_year'
  | 'all' | 'custom'

/**
 * Resolves a `DateRangeKey` (+ optional custom bounds) into concrete
 * start/end `Date`s. Returns `{ start: null, end: null }` for `all`.
 */
export function getDateRange(
  option: DateRangeKey,
  customStart?: string,
  customEnd?: string,
): { start: Date | null; end: Date | null } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  switch (option) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'yesterday':
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      break
    case 'this_week': {
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff)
      start.setHours(0, 0, 0, 0)
      break
    }
    case 'last_week': {
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff - 7)
      start.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() - diff - 1)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'this_month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case 'last_month':
      start.setMonth(start.getMonth() - 1, 1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth(), 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'this_year':
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      break
    case 'last_year':
      start.setFullYear(start.getFullYear() - 1, 0, 1)
      start.setHours(0, 0, 0, 0)
      end.setFullYear(end.getFullYear() - 1, 11, 31)
      end.setHours(23, 59, 59, 999)
      break
    case 'custom': {
      const s = customStart ? new Date(customStart) : null
      const e = customEnd ? new Date(customEnd) : null
      if (s) s.setHours(0, 0, 0, 0)
      if (e) e.setHours(23, 59, 59, 999)
      return { start: s, end: e }
    }
    case 'all':
    default:
      return { start: null, end: null }
  }
  return { start, end }
}

/**
 * Returns the immediately-preceding equivalent window for a resolved range,
 * used to compute period-over-period trends (e.g. this month vs last month).
 * Falls back to `{ null, null }` when either bound is missing (e.g. `all`).
 */
export function getPreviousRange(
  start: Date | null,
  end: Date | null,
): { start: Date | null; end: Date | null } {
  if (!start || !end) return { start: null, end: null }
  const span = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - span)
  return { start: prevStart, end: prevEnd }
}

/** Applies gte/lte bounds on an ISO date column of a Supabase query builder. */
export function applyDateFilter(q: any, field: string, start: Date | null, end: Date | null) {
  if (start) q = q.gte(field, start.toISOString())
  if (end) q = q.lte(field, end.toISOString())
  return q
}

/** Maps an i18n language code to an Intl BCP-47 tag for date/number formatting. */
export function toIntlLocale(lang: string): string {
  if (lang.startsWith('ar')) return 'ar-MA'
  if (lang.startsWith('en')) return 'en-US'
  return 'fr-FR'
}
