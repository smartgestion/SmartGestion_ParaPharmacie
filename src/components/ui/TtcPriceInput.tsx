import * as React from 'react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { htToTtc, ttcToHt } from '@/lib/utils'

/**
 * TTC-facing unit-price input bound to an HT form field.
 *
 * The user sees and types the TAX-INCLUDED (TTC) price; every keystroke is
 * converted back to HT (via the line's TVA rate) and written to the existing
 * `prixUnitaireHt`-style form field, so storage, payloads and all backend
 * calculations remain HT-based and unchanged.
 *
 * While the field is focused the raw text the user typed is preserved
 * verbatim (no reformat-on-keystroke artifacts); on blur the display reverts
 * to the TTC value derived from form state, rounded to 2 decimals.
 */
interface TtcPriceInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  /** Current HT value held in form state. */
  htValue: number
  /** TVA rate (%) of the line, used for the HT<->TTC conversion. */
  tvaRate: number
  /** Receives the new HT value (full precision) on every edit. */
  onHtChange: (ht: number) => void
}

export function TtcPriceInput({ htValue, tvaRate, onHtChange, onFocus, onBlur, ...props }: TtcPriceInputProps) {
  // null = not being edited -> show the derived TTC value.
  const [text, setText] = useState<string | null>(null)

  const derivedTtc = htToTtc(htValue || 0, tvaRate || 0)
  const display = text !== null ? text : String(Number(derivedTtc.toFixed(2)))

  return (
    <Input
      type="number"
      step="0.01"
      inputMode="decimal"
      {...props}
      value={display}
      onFocus={(e) => {
        setText(display)
        onFocus?.(e)
      }}
      onChange={(e) => {
        const v = e.target.value
        setText(v)
        const n = parseFloat(v)
        onHtChange(isNaN(n) ? 0 : ttcToHt(n, tvaRate || 0))
      }}
      onBlur={(e) => {
        setText(null)
        onBlur?.(e)
      }}
    />
  )
}
