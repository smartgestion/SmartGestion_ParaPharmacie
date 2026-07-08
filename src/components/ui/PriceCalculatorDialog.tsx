import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const round2 = (n: number) => Number(n.toFixed(2))

export interface PriceCalculatorResult {
  /** Prix de vente HT (TTC sans la TVA) */
  prixVenteHT: number
  /** Prix d'achat TTC (TTC après remise) */
  prixAchatTTC: number
  /** Prix d'achat HT (Prix achat TTC sans la TVA) */
  prixAchatHT: number
  /** TVA saisie (%) */
  tva: number
  /** Remise saisie (%) */
  remise: number
}

export interface PriceCalculatorInitialValues {
  ttc?: number | string
  tva?: number | string
  remise?: number | string
}

interface PriceCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (result: PriceCalculatorResult) => void
  /** Valeurs pré-remplies / mémorisées à l'ouverture */
  initialValues?: PriceCalculatorInitialValues
}

/**
 * Modal réutilisable de calcul automatique des prix.
 * Partagé entre le formulaire Produit et le Bon de Commande.
 *
 * Formules :
 *   PrixVenteHT  = TTC / (1 + TVA/100)
 *   PrixAchatTTC = TTC * (1 - Remise/100)
 *   PrixAchatHT  = PrixAchatTTC / (1 + TVA/100)
 *
 * Le calcul utilise les valeurs complètes ; l'arrondi à 2 décimales
 * n'est appliqué qu'aux valeurs renvoyées (affichage / remplissage).
 */
export function PriceCalculatorDialog({
  open,
  onOpenChange,
  onConfirm,
  initialValues,
}: PriceCalculatorDialogProps) {
  const { t } = useTranslation()

  const [calcTtc, setCalcTtc] = useState('')
  const [calcTva, setCalcTva] = useState('')
  const [calcRemise, setCalcRemise] = useState('')
  const [calcError, setCalcError] = useState('')

  // Pré-remplir les valeurs propres à l'élément courant (produit / ligne) à
  // chaque ouverture. Chaque produit possède ses valeurs uniques : aucune
  // valeur n'est partagée entre produits.
  useEffect(() => {
    if (open) {
      const ttc = initialValues?.ttc !== undefined && initialValues.ttc !== null && `${initialValues.ttc}` !== '0'
        ? `${initialValues.ttc}`
        : ''
      const tva = initialValues?.tva !== undefined && initialValues.tva !== null
        ? `${initialValues.tva}`
        : ''
      const remise = initialValues?.remise !== undefined && initialValues.remise !== null
        ? `${initialValues.remise}`
        : ''

      setCalcTtc(ttc)
      setCalcTva(tva)
      setCalcRemise(remise)
      setCalcError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleConfirm() {
    const prixVenteTTC = Number(calcTtc)
    const tvaPct = Number(calcTva)
    const remisePct = Number(calcRemise)

    // Validation
    if (!(prixVenteTTC > 0)) {
      setCalcError(t('shared.form.calc_err_ttc', 'Le prix de vente TTC doit être supérieur à 0.'))
      return
    }
    if (isNaN(tvaPct) || tvaPct < 0) {
      setCalcError(t('shared.form.calc_err_tva', 'La TVA doit être supérieure ou égale à 0.'))
      return
    }
    if (isNaN(remisePct) || remisePct < 0 || remisePct > 100) {
      setCalcError(t('shared.form.calc_err_remise', 'La remise doit être comprise entre 0 et 100.'))
      return
    }
    setCalcError('')

    // Calcul avec les valeurs complètes (sans arrondi intermédiaire)
    const prixVenteHT = prixVenteTTC / (1 + tvaPct / 100)
    const prixAchatTTC = prixVenteTTC * (1 - remisePct / 100)
    const prixAchatHT = prixAchatTTC / (1 + tvaPct / 100)

    onConfirm({
      prixVenteHT: round2(prixVenteHT),
      prixAchatTTC: round2(prixAchatTTC),
      prixAchatHT: round2(prixAchatHT),
      tva: round2(tvaPct),
      remise: round2(remisePct),
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shared.form.price_calculator', 'Calculateur de prix')}</DialogTitle>
          <DialogDescription>
            {t('shared.form.price_calculator_desc', 'Saisissez le prix TTC, la TVA et la remise pour calculer automatiquement les prix HT.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('shared.form.sale_price_ttc', 'Prix Vendre TTC')}
            </label>
            <Input
              type="number"
              step="0.01"
              value={calcTtc}
              onChange={(e) => { setCalcTtc(e.target.value); setCalcError('') }}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('shared.form.vat_pct', 'TVA (%)')}
            </label>
            <Input
              type="number"
              step="0.1"
              value={calcTva}
              onChange={(e) => { setCalcTva(e.target.value); setCalcError('') }}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('shared.form.discount_pct', 'Remise (%)')}
            </label>
            <Input
              type="number"
              step="0.01"
              value={calcRemise}
              onChange={(e) => { setCalcRemise(e.target.value); setCalcError('') }}
              placeholder="0"
            />
          </div>

          {calcError && (
            <p className="text-sm font-medium text-destructive">{calcError}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('shared.actions.cancel', 'Annuler')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {t('shared.actions.ok', 'OK')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
