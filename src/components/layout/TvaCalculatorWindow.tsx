import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, Copy, Check, X, GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Calculateur TVA — fenêtre flottante (draggable + resizable).
 *
 * Deux modes :
 *   TTC → HT :  PrixHT  = PrixTTC / (1 + TVA/100)   ;  MontantTVA = PrixTTC − PrixHT
 *   HT → TTC :  PrixTTC = PrixHT  * (1 + TVA/100)   ;  MontantTVA = PrixTTC − PrixHT
 *
 * Position et taille mémorisées dans localStorage.
 */

type Mode = 'ttc-ht' | 'ht-ttc'

interface Pos { x: number; y: number }
interface Size { w: number; h: number }

const POS_KEY = 'pg_tva_calc_position'
const SIZE_KEY = 'pg_tva_calc_size'
const MODE_KEY = 'pg_tva_calc_mode'

const MIN_W = 300
const MIN_H = 380
const DEFAULT_W = 340
const DEFAULT_H = 440

/** Formatage FR : 2 décimales, séparateur de milliers espace, virgule décimale. */
const frFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const formatFR = (n: number) => frFormatter.format(n)

/** Convertit une saisie FR/EN ("1 234,56" ou "1234.56") en nombre. */
function parseNumber(raw: string): number {
  if (!raw) return NaN
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\u00A0/g, '')
    .replace(',', '.')
  return Number(cleaned)
}

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Pos
      if (typeof p.x === 'number' && typeof p.y === 'number') return p
    }
  } catch { /* ignore */ }
  // par défaut : coin haut-droit
  const x = typeof window !== 'undefined' ? Math.max(16, window.innerWidth - DEFAULT_W - 24) : 24
  return { x, y: 72 }
}

function readSize(): Size {
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Size
      if (typeof s.w === 'number' && typeof s.h === 'number') {
        return { w: Math.max(MIN_W, s.w), h: Math.max(MIN_H, s.h) }
      }
    }
  } catch { /* ignore */ }
  return { w: DEFAULT_W, h: DEFAULT_H }
}

function readMode(): Mode {
  const raw = localStorage.getItem(MODE_KEY)
  return raw === 'ht-ttc' ? 'ht-ttc' : 'ttc-ht'
}

interface TvaCalculatorWindowProps {
  open: boolean
  onClose: () => void
}

export function TvaCalculatorWindow({ open, onClose }: TvaCalculatorWindowProps) {
  const [mode, setMode] = useState<Mode>(() => readMode())
  const [pos, setPos] = useState<Pos>(() => readPos())
  const [size, setSize] = useState<Size>(() => readSize())

  const [prix, setPrix] = useState('')
  const [tva, setTva] = useState('20')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const prixInputRef = useRef<HTMLInputElement>(null)

  // Refs pour drag / resize sans re-render pendant le mouvement.
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false, startX: 0, startY: 0, ox: 0, oy: 0,
  })
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; ow: number; oh: number }>({
    active: false, startX: 0, startY: 0, ow: 0, oh: 0,
  })

  // Persistance
  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(pos)) }, [pos])
  useEffect(() => { localStorage.setItem(SIZE_KEY, JSON.stringify(size)) }, [size])
  useEffect(() => { localStorage.setItem(MODE_KEY, mode) }, [mode])

  // Focus le champ prix à l'ouverture.
  useEffect(() => {
    if (open) {
      setCopied(false)
      const id = window.setTimeout(() => prixInputRef.current?.focus(), 50)
      return () => window.clearTimeout(id)
    }
  }, [open])

  // Fermer avec Échap.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Calcul instantané.
  const result = useMemo(() => {
    const p = parseNumber(prix)
    const t = parseNumber(tva)
    if (prix.trim() === '') return null
    if (isNaN(p)) return { err: 'invalid_price' as const }
    if (p < 0) return { err: 'negative_price' as const }
    if (isNaN(t) || t < 0) return { err: 'invalid_tva' as const }

    if (mode === 'ttc-ht') {
      const ht = p / (1 + t / 100)
      const montantTva = p - ht
      return { primary: ht, montantTva, ttc: p }
    } else {
      const ttc = p * (1 + t / 100)
      const montantTva = ttc - p
      return { primary: ttc, montantTva, ht: p }
    }
  }, [prix, tva, mode])

  useEffect(() => {
    if (!result) { setError(''); return }
    if ('err' in result) {
      if (result.err === 'invalid_price') setError('Prix invalide.')
      else if (result.err === 'negative_price') setError('Le prix ne peut pas être négatif.')
      else setError('TVA invalide.')
    } else {
      setError('')
    }
  }, [result])

  const validResult = result && !('err' in result) ? result : null

  // ---- Drag ----
  const startDrag = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y }
  }, [pos])

  // ---- Resize ----
  const startResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { active: true, startX: e.clientX, startY: e.clientY, ow: size.w, oh: size.h }
  }, [size])

  useEffect(() => {
    if (!open) return
    const onMove = (e: MouseEvent) => {
      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX
        const dy = e.clientY - dragRef.current.startY
        const maxX = window.innerWidth - 40
        const maxY = window.innerHeight - 40
        setPos({
          x: Math.min(Math.max(0, dragRef.current.ox + dx), maxX),
          y: Math.min(Math.max(0, dragRef.current.oy + dy), maxY),
        })
      } else if (resizeRef.current.active) {
        const dx = e.clientX - resizeRef.current.startX
        const dy = e.clientY - resizeRef.current.startY
        setSize({
          w: Math.max(MIN_W, resizeRef.current.ow + dx),
          h: Math.max(MIN_H, resizeRef.current.oh + dy),
        })
      }
    }
    const onUp = () => {
      dragRef.current.active = false
      resizeRef.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [open])

  const handleCopy = useCallback(() => {
    if (!validResult) return
    const label = mode === 'ttc-ht' ? 'Prix HT' : 'Prix TTC'
    const text = `${label}: ${formatFR(validResult.primary)}  |  Montant TVA: ${formatFR(validResult.montantTva)}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [validResult, mode])

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Le calcul est déjà instantané : Entrée retire le focus pour valider visuellement.
      ;(e.target as HTMLElement).blur?.()
      prixInputRef.current?.focus()
    }
  }

  if (!open) return null

  const primaryLabel = mode === 'ttc-ht' ? 'Prix HT' : 'Prix TTC'
  const inputLabel = mode === 'ttc-ht' ? 'Prix TTC' : 'Prix HT'

  return createPortal(
    <div
      className="fixed z-[100] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden animate-scale-in"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      role="dialog"
      aria-label="Calculateur TVA"
    >
      {/* Barre de titre (poignée de drag) */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/40 cursor-move select-none shrink-0"
        onMouseDown={startDrag}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
        <Calculator className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold flex-1 truncate">Calculateur TVA</span>
        <button
          onClick={onClose}
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Fermer"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mode */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mode</label>
          <div className="grid grid-cols-2 gap-1 rounded-xl border-2 border-border/50 bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setMode('ttc-ht')}
              className={cn(
                'py-1.5 text-sm font-semibold rounded-lg transition-all',
                mode === 'ttc-ht'
                  ? 'bg-background text-emerald-600 border border-emerald-500/40 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              TTC → HT
            </button>
            <button
              type="button"
              onClick={() => setMode('ht-ttc')}
              className={cn(
                'py-1.5 text-sm font-semibold rounded-lg transition-all',
                mode === 'ht-ttc'
                  ? 'bg-background text-emerald-600 border border-emerald-500/40 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              HT → TTC
            </button>
          </div>
        </div>

        {/* Prix */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{inputLabel}</label>
          <Input
            ref={prixInputRef}
            inputMode="decimal"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0,00"
            aria-invalid={!!error}
          />
        </div>

        {/* TVA */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TVA (%)</label>
          <Input
            inputMode="decimal"
            value={tva}
            onChange={(e) => setTva(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="20"
          />
        </div>

        {/* Résultat */}
        <div className="rounded-xl border-2 border-border/50 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Résultat</span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!validResult}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium transition-colors',
                validResult ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed',
              )}
              title="Copier le résultat"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>

          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : validResult ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{primaryLabel}</span>
                <span className="text-lg font-bold text-foreground tabular-nums">{formatFR(validResult.primary)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Montant TVA</span>
                <span className="text-base font-semibold text-emerald-600 tabular-nums">{formatFR(validResult.montantTva)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70">Saisissez un prix et un taux de TVA.</p>
          )}
        </div>
      </div>

      {/* Poignée de redimensionnement */}
      <div
        onMouseDown={startResize}
        className="absolute bottom-0 end-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 0 50%, var(--color-border, #cbd5e1) 50% 60%, transparent 60% 70%, var(--color-border, #cbd5e1) 70% 80%, transparent 80%)',
        }}
        title="Redimensionner"
      />
    </div>,
    document.body,
  )
}
