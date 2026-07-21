import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { formatCurrency, htToTtc, ttcToHt } from '@/lib/utils'
import { TtcPriceInput } from '@/components/ui/TtcPriceInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PriceCalculatorDialog, type PriceCalculatorResult } from '@/components/ui/PriceCalculatorDialog'
import { ProductSearchBar } from '@/components/ui/ProductSearchBar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface DevisFormProps {
  initialData?: any;
  onSuccess: () => void;
}

export function DevisForm({ initialData, onSuccess }: DevisFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Editing an existing document vs creating a new one. New documents are
  // forced to "brouillon" (the default value) and the status dropdown is
  // hidden during creation.
  const isEditing = !!initialData?.id;
  const [clients, setClients] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [parametres, setParametres] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Calculateur de prix : index de la ligne en cours d'édition (null = fermé)
  const [calcRowIndex, setCalcRowIndex] = useState<number | null>(null);
  // Valeurs du calculateur par ligne (pré-remplies depuis le produit)
  const [calcMemo, setCalcMemo] = useState<Record<number, { ttc?: string; tva?: string; remise?: string }>>({});

  const ligneSchema = z.object({
    produitId: z.string().optional(),
    reference: z.string().optional(),
    designation: z.string().min(1, t('shared.validation.designation_required')),
    quantite: z.number().min(0.01, t('shared.validation.qty_min')),
    prixUnitaireHt: z.number().min(0, t('shared.validation.price_positive')),
    tva: z.number().min(0, t('shared.validation.vat_positive')),
    remise: z.number().optional(),
    prixVenteTtc: z.number().optional(),
  });

  const devisSchema = z.object({
    clientId: z.string().min(1, t('shared.validation.client_required')),
    dateEmission: z.string().min(1, t('shared.validation.emission_date_required')),
    dateValidite: z.string().min(1, t('shared.validation.validity_date_required')),
    statut: z.string().min(1, t('shared.validation.status_required')),
    modePaiement: z.string().optional(),
    notes: z.string().optional(),
    lignes: z.array(ligneSchema).min(1, t('shared.validation.lines_min')),
  });

  type DevisFormValues = z.infer<typeof devisSchema>;

  const form = useForm<DevisFormValues>({
    resolver: zodResolver(devisSchema),
    defaultValues: initialData || {
      clientId: '',
      dateEmission: new Date().toISOString().split('T')[0],
      dateValidite: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      statut: 'brouillon',
      modePaiement: 'Virement',
      notes: '',
      lignes: [
        {
          designation: '',
          quantite: 1,
          prixUnitaireHt: 0,
          tva: 20,
          reference: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      
      try {
        const [{ data: clientsData }, { data: produitsData }, { data: parametresData }] = await Promise.all([
          supabase.from('clients').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('produits').select('*').eq('user_id', user.id).order('designation'),
          supabase.from('parametres').select('*').eq('user_id', user.id).limit(1)
        ]);
        
        setClients(clientsData || []);
        setProduits(produitsData || []);
        setParametres(parametresData?.[0] || null);

        if (initialData) {
          form.reset({
            ...initialData,
            clientId: initialData.clientId?.toString(),
            dateEmission: initialData.dateEmission ? new Date(initialData.dateEmission).toISOString().split('T')[0] : '',
            dateValidite: initialData.dateValidite ? new Date(initialData.dateValidite).toISOString().split('T')[0] : '',
            lignes: initialData.lignes?.map((l: any) => ({
              ...l,
              produitId: l.produitId?.toString(),
              prixUnitaireHt: Number(l.prixUnitaireHt || 0),
              quantite: Number(l.quantite || 0),
              tva: Number(l.tva || 0),
              montantHt: Number(l.montantHt || 0),
              montantTtc: Number(l.montantTtc || 0)
            })) || []
          });
        } else if (parametresData?.[0]) {
          form.setValue('notes', parametresData[0].pied_page_defaut || '');
        }
      } catch (error) {
        toast.error(t('shared.toast.loading_error'));
      }
    };
    fetchData();
  }, [initialData, user]);

  const watchLignes = form.watch('lignes');

  const totals = watchLignes.reduce(
    (acc, ligne) => {
      const montantHt = (ligne.quantite || 0) * (ligne.prixUnitaireHt || 0);
      const montantTva = montantHt * ((ligne.tva || 0) / 100);
      return {
        ht: acc.ht + montantHt,
        tva: acc.tva + montantTva,
        ttc: acc.ttc + montantHt + montantTva,
      };
    },
    { ht: 0, tva: 0, ttc: 0 }
  );

  async function generateDevisRef(): Promise<string> {
    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('devis')
      .select('numero')
      .like('numero', `DEV-${year}-%`)
      .eq('user_id', user?.id);
    let maxNum = 0;
    for (const d of existing || []) {
      const match = d.numero?.match(new RegExp(`^DEV-${year}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `DEV-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  const onSubmit = async (data: DevisFormValues) => {
    setIsLoading(true);
    try {
      let devisNum: string | undefined;
      if (!initialData?.id) {
        let attempts = 0;
        while (attempts < 10) {
          const candidate = await generateDevisRef();
          const { data: dup } = await supabase.from('devis').select('id').eq('numero', candidate).eq('user_id', user?.id).maybeSingle();
          if (!dup) { devisNum = candidate; break; }
          attempts++;
        }
      }

      const payload = {
        client_id: data.clientId === 'none' ? null : Number(data.clientId),
        date_emission: new Date(data.dateEmission).toISOString(),
        date_validite: new Date(data.dateValidite).toISOString(),
        numero: devisNum || initialData?.numero,
        statut: data.statut || 'en_attente',
        notes: data.notes || '',
        montant_ht: Number(totals.ht) || 0,
        montant_tva: Number(totals.tva) || 0,
        montant_ttc: Number(totals.ttc) || 0,
      };

      let devisId = initialData?.id;

      if (!devisId) {
        let { data: newDevis, error } = await supabase.from('devis').insert([{ ...payload, user_id: user?.id }]).select().single();
        if (error?.message?.includes('duplicate key') || error?.code === '23505') {
          devisNum = await generateDevisRef();
          payload.numero = devisNum;
          const retry = await supabase.from('devis').insert([{ ...payload, user_id: user?.id }]).select().single();
          newDevis = retry.data;
          error = retry.error;
        }
        if (error) throw error;
        devisId = newDevis.id;
      } else {
        const { error } = await supabase.from('devis').update(payload).eq('id', devisId);
        if (error) throw error;
        await supabase.from('devis_lignes').delete().eq('devis_id', devisId);
      }

      const lignesPayload = (data.lignes || []).map((ligne: any, index: number) => {
        const montantHt = (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaireHt) || 0);
        const montantTtc = montantHt * (1 + (Number(ligne.tva) || 20) / 100);
        return {
          devis_id: Number(devisId),
          produit_id: ligne.produitId && ligne.produitId !== 'none' ? Number(ligne.produitId) : null,
          designation: ligne.designation || '',
          quantite: Number(ligne.quantite) || 1,
          prix_unitaire_ht: Number(ligne.prixUnitaireHt) || 0,
          tva: Number(ligne.tva) || 20,
          remise: Number(ligne.remise) || 0,
          prix_vente_ttc: Number(ligne.prixVenteTtc) || 0,
          montant_ht: montantHt,
          montant_ttc: montantTtc,
          ordre: index,
        };
      });

      if (lignesPayload.length > 0) {
        const { error: lignesError } = await supabase.from('devis_lignes').insert(lignesPayload);
        if (lignesError) throw lignesError;
      }

      toast.success(initialData ? 'Devis modifié' : 'Devis créé');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || t('shared.toast.save_error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Document de vente : le prix unitaire de la ligne = prix HT APRÈS remise
  // (= prixAchatHT du calculateur = (TTC × (1-remise/100)) / (1+TVA/100)).
  const handleCalcConfirm = (res: PriceCalculatorResult) => {
    if (calcRowIndex === null) return;
    const index = calcRowIndex;
    const prixVenteTtc = Number((res.prixVenteHT * (1 + res.tva / 100)).toFixed(2));
    form.setValue(`lignes.${index}.prixUnitaireHt`, res.prixAchatHT, { shouldValidate: true, shouldDirty: true });
    form.setValue(`lignes.${index}.tva`, res.tva, { shouldValidate: true, shouldDirty: true });
    form.setValue(`lignes.${index}.remise`, res.remise, { shouldDirty: true });
    form.setValue(`lignes.${index}.prixVenteTtc`, prixVenteTtc, { shouldDirty: true });
    setCalcMemo((prev) => ({ ...prev, [index]: { ttc: `${prixVenteTtc}`, tva: `${res.tva}`, remise: `${res.remise}` } }));
  };

  const handleProduitSelect = (index: number, produitId: string) => {
    const produit = produits.find((p) => p.id.toString() === produitId);
    if (produit) {
      const tva = Number(produit.taux_tva ?? produit.tauxTva ?? produit.tva ?? 20);
      const calcTtc = Number(produit.calc_vente_ttc || 0);
      const calcRemise = Number(produit.calc_remise || 0);
      form.setValue(`lignes.${index}.produitId`, produit.id.toString());
      form.setValue(`lignes.${index}.reference`, produit.reference || '');
      form.setValue(`lignes.${index}.designation`, produit.designation || produit.nom || '');
      // Prix affiché en TTC : préférer le TTC catalogue (conversion exacte),
      // sinon retomber sur le HT stocké. Le champ de formulaire reste HT.
      const prixVenteTtcProd = Number(produit.prixVenteTtc || produit.prix_vente_ttc || 0);
      form.setValue(`lignes.${index}.prixUnitaireHt`, prixVenteTtcProd > 0
        ? ttcToHt(prixVenteTtcProd, tva)
        : Number(produit.prixVenteHt || produit.prix_vente_ht || 0));
      form.setValue(`lignes.${index}.tva`, tva);
      form.setValue(`lignes.${index}.remise`, calcRemise, { shouldDirty: true });
      form.setValue(`lignes.${index}.prixVenteTtc`, calcTtc, { shouldDirty: true });
      // Récupérer les valeurs du calculateur enregistrées sur le produit
      setCalcMemo((prev) => ({
        ...prev,
        [index]: {
          ttc: calcTtc ? `${calcTtc}` : undefined,
          tva: `${tva}`,
          remise: `${calcRemise}`,
        },
      }));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <div className="dark:bg-slate-900/40 dark:border-white/10 bg-slate-50 p-4 rounded-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.client_label')}</Label>
            <Select
              value={form.watch('clientId') || ""}
              onValueChange={(val) => form.setValue('clientId', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('shared.form.select_client')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.nom || client.nomSociete || '-'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.clientId && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.clientId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.emission_date')}</Label>
            <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300" {...form.register('dateEmission')} />
            {form.formState.errors.dateEmission && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.dateEmission.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.validity_date')}</Label>
            <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300" {...form.register('dateValidite')} />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.status_label')}</Label>
              <Select
                value={form.watch('statut') || ""}
                onValueChange={(val) => form.setValue('statut', val)}
              >
                <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                  <SelectValue placeholder={t('shared.form.select_status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brouillon">{t('shared.status.draft')}</SelectItem>
                  <SelectItem value="envoyé">{t('shared.status.sent')}</SelectItem>
                  <SelectItem value="accepté">{t('shared.status.accepted')}</SelectItem>
                  <SelectItem value="refusé">{t('shared.status.refused')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.suggested_payment')}</Label>
            <Select
              value={form.watch('modePaiement') || ""}
              onValueChange={(val) => form.setValue('modePaiement', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('shared.form.select_mode')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Virement">{t('shared.payment_modes.bank_transfer')}</SelectItem>
                <SelectItem value="Chèque">{t('shared.payment_modes.cheque')}</SelectItem>
                <SelectItem value="Espèces">{t('shared.payment_modes.cash')}</SelectItem>
                <SelectItem value="Carte">{t('shared.payment_modes.card')}</SelectItem>
                <SelectItem value="Effet">{t('shared.payment_modes.bill_of_exchange')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b dark:border-white/10 pb-2">
          <h3 className="text-lg font-bold dark:text-card-foreground text-slate-800">{t('shared.form.lines_section')}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dark:border-white/10 dark:text-muted-foreground dark:hover:bg-white/5 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() =>
              append({ designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20, reference: '' })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('shared.form.add_line')}
          </Button>
        </div>

        {/* Line items grid — wrapped in `overflow-x-auto` so the wide row
            scrolls horizontally on phones instead of overflowing the page. */}
        <div className="border dark:border-white/10 border-slate-200 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b dark:border-white/10">
              <tr>
                <th className="p-3 text-start font-semibold dark:text-muted-foreground text-slate-600">{t('shared.table.product')}</th>
                <th className="p-3 text-start font-semibold dark:text-muted-foreground text-slate-600">{t('shared.form.description_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-24">{t('shared.form.qty_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-32">{t('shared.form.price_ttc_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-24">{t('shared.form.vat_pct_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-32">{t('shared.form.total_ttc')}</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-white/10 divide-slate-100">
              {fields.map((field, index) => {
                const ligne = watchLignes[index];
                // Total de ligne affiché en TTC (le HT reste la source stockée)
                const totalTtc = htToTtc((ligne?.quantite || 0) * (ligne?.prixUnitaireHt || 0), ligne?.tva ?? 20);
                const selectedProductId = form.watch(`lignes.${index}.produitId`);
                const selectedProduct = selectedProductId ? produits.find(p2 => p2.id.toString() === selectedProductId) : null;

                return (
                  <tr key={field.id}>
                    <td className="p-2 min-w-[220px]">
                      <ProductSearchBar
                        compact
                        produits={produits}
                        priceField="vente"
                        accent="blue"
                        selectedLabel={selectedProduct ? (selectedProduct.designation || selectedProduct.nom || selectedProduct.reference || '-') : ''}
                        onSelect={(p) => handleProduitSelect(index, p.id.toString())}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-9 dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.designation`)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.quantite`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2">
                      <TtcPriceInput
                        className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        htValue={ligne?.prixUnitaireHt || 0}
                        tvaRate={ligne?.tva ?? 20}
                        onHtChange={(ht) => form.setValue(`lignes.${index}.prixUnitaireHt`, ht, { shouldValidate: true, shouldDirty: true })}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.tva`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2 text-right font-semibold dark:text-card-foreground text-slate-700 align-middle">
                      {formatCurrency(totalTtc)}
                    </td>
                    <td className="p-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-white/5"
                          onClick={() => setCalcRowIndex(index)}
                          disabled={!form.watch(`lignes.${index}.produitId`)}
                          title={t('shared.form.price_calculator', 'Calculateur de prix')}
                        >
                          <Calculator className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 dark:text-muted-foreground dark:hover:text-red-400 dark:hover:bg-red-500/10 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        {form.formState.errors.lignes && (
          <p className="text-sm text-red-500 font-medium">{form.formState.errors.lignes.message}</p>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.notes')}</Label>
            <Textarea 
              {...form.register('notes')} 
              placeholder={t('shared.form.notes_placeholder')} 
              className="min-h-[100px] dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300"
            />
          </div>
        </div>

        <div className="w-full md:w-80">
          <div className="dark:bg-slate-900/60 dark:border-white/10 bg-slate-50 p-6 rounded-sm border border-slate-200 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="dark:text-muted-foreground text-slate-500 font-medium">{t('shared.form.subtotal_ht')}</span>
              <span className="font-bold dark:text-card-foreground text-slate-800" dir="ltr">{formatCurrency(totals.ht)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="dark:text-muted-foreground text-slate-500 font-medium">{t('shared.form.total_vat')}</span>
              <span className="font-bold dark:text-card-foreground text-slate-800" dir="ltr">{formatCurrency(totals.tva)}</span>
            </div>
            <div className="h-px dark:bg-white/10 bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="dark:text-card-foreground text-slate-900 font-bold text-lg">{t('shared.form.total_ttc')}</span>
              <span className="text-2xl font-black text-blue-600" dir="ltr">{formatCurrency(totals.ttc)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center space-x-4 pt-6 border-t dark:border-white/10">
        <Button type="button" variant="ghost" onClick={() => onSuccess()} className="dark:text-muted-foreground dark:hover:text-card-foreground text-slate-500 hover:text-slate-700">
          {t('shared.actions.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 h-10 rounded-sm shadow-none">
          {isLoading ? t('shared.actions.saving') : t('shared.actions.save')}
        </Button>
      </div>

      {/* ── Popup : Calculateur de prix (par ligne) ───────────────────── */}
      <PriceCalculatorDialog
        open={calcRowIndex !== null}
        onOpenChange={(open) => { if (!open) setCalcRowIndex(null); }}
        onConfirm={handleCalcConfirm}
        initialValues={calcRowIndex !== null ? calcMemo[calcRowIndex] : undefined}
      />
    </form>
  );
}
