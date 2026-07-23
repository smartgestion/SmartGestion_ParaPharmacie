import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarClock, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getExpirationBuckets, type ExpirationBuckets } from '@/lib/batches'

interface BucketCard {
  key: keyof ExpirationBuckets
  label: string
  filter: string
  classes: string
}

/**
 * "Expiration Overview" dashboard widget. Shows how many batches fall into each
 * expiration window; clicking a card opens the Batch Management page with the
 * matching filter pre-applied.
 */
export function ExpirationOverview() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [buckets, setBuckets] = useState<ExpirationBuckets>({
    expired: 0,
    within7: 0,
    within30: 0,
    within60: 0,
    within90: 0,
  })

  useEffect(() => {
    if (!user?.id) return
    getExpirationBuckets(user.id).then(setBuckets)
  }, [user?.id])

  const cards: BucketCard[] = [
    {
      key: 'expired',
      label: t('dashboard.expiration.expired', 'Produits périmés'),
      filter: 'expired',
      classes: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400',
    },
    {
      key: 'within7',
      label: t('dashboard.expiration.within7', 'Expire ≤ 7 jours'),
      filter: 'expiring7',
      classes: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400',
    },
    {
      key: 'within30',
      label: t('dashboard.expiration.within30', 'Expire ≤ 30 jours'),
      filter: 'expiring30',
      classes: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
    },
    {
      key: 'within60',
      label: t('dashboard.expiration.within60', 'Expire ≤ 60 jours'),
      filter: 'expiring60',
      classes: 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:border-yellow-500/20 dark:text-yellow-400',
    },
    {
      key: 'within90',
      label: t('dashboard.expiration.within90', 'Expire ≤ 90 jours'),
      filter: 'expiring90',
      classes: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
    },
  ]

  const total = cards.reduce((s, c) => s + buckets[c.key], 0)

  return (
    <Card className="shadow-none rounded-[6px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary shrink-0" />
          {t('dashboard.expiration.title', 'Aperçu des péremptions')}
          {buckets.expired > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {buckets.expired} {t('dashboard.expiration.expired_short', 'périmés')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => navigate(`/lots?filter=${c.filter}`)}
              className={`rounded-[8px] border p-4 text-left transition-colors ${c.classes}`}
            >
              <div className="text-3xl font-black tabular-nums">{buckets[c.key]}</div>
              <div className="text-xs font-medium mt-1 opacity-90">{c.label}</div>
            </button>
          ))}
        </div>
        {total === 0 && (
          <p className="text-sm text-slate-400 mt-3 text-center">
            {t('dashboard.expiration.none', 'Aucun lot à surveiller pour le moment.')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
