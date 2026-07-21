import { forwardRef, useMemo } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { getDateLocale, formatAmount } from '@/lib/utils'
import { numberToFrenchWords } from '@/lib/numberToWords'
import { DOC_COLORS as C } from './docColors'

interface FactureDocumentProps {
  facture: any
  entreprise: any
  /** BCP-47 language tag from i18n.language */
  lang?: string
}

// Prices use `formatAmount` (always 2 decimals). `fmtLoose` is kept for
// non-money values (percentages / quantities) that must NOT force decimals.
const fmtLoose = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

const safeNum = (v: any, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? fallback : n
}

const pickVal = (obj: any, ...keys: string[]) => {
  for (const k of keys) { const v = obj?.[k]; if (v !== null && v !== undefined) return v }
  return null
}

const pickNum = (obj: any, ...keys: string[]) => safeNum(pickVal(obj, ...keys))

const makeFmtDate = (lang?: string) => (d: any): string => {
  if (!d) return '-'
  try {
    let date: Date
    if (typeof d === 'string') {
      date = d.includes('T') || d.includes('-') ? parseISO(d) : new Date(d)
    } else if (d instanceof Date) {
      date = d
    } else {
      date = new Date(d)
    }
    return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: getDateLocale(lang) }) : '-'
  } catch {
    return '-'
  }
}

interface TvaBucket {
  rate: number
  baseHt: number
  montantTva: number
}

function computeTvaBuckets(lignes: any[]): TvaBucket[] {
  const map = new Map<number, TvaBucket>()
  for (const l of lignes) {
    const qte = safeNum(l.quantite, 1)
    const pu = pickNum(l, 'prixUnitaireHt', 'prix_unitaire_ht')
    const mHt = pickNum(l, 'montantHt', 'montant_ht')
    const totalHt = mHt > 0 ? mHt : qte * pu
    const tvaRate = safeNum(l.tva, 20)
    const existing = map.get(tvaRate)
    if (existing) {
      existing.baseHt += totalHt
      existing.montantTva += totalHt * (tvaRate / 100)
    } else {
      map.set(tvaRate, { rate: tvaRate, baseHt: totalHt, montantTva: totalHt * (tvaRate / 100) })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.rate - a.rate)
}

export const FactureDocument = forwardRef<HTMLDivElement, FactureDocumentProps>(
  ({ facture, entreprise, lang }, ref) => {
    if (!facture) return null

    const fmtDate = makeFmtDate(lang)

    const lignes = facture.lignes || []
    const totalHt = pickNum(facture, 'montantHt', 'montant_ht')
    const totalTva = pickNum(facture, 'montantTva', 'montant_tva')
    const totalTtc = pickNum(facture, 'montantTtc', 'montant_ttc')
    const dateEmission = fmtDate(pickVal(facture, 'dateEmission', 'date_emission'))
    const numero = facture.numero || '-'
    const modePaiement = (pickVal(facture, 'modePaiement', 'mode_paiement') as string) || ''
    const client = pickVal(facture, 'client', 'fournisseur') || {}
    const ville = client?.ville || 'CASABLANCA'
    const entityName = client?.nomSociete || client?.nom || '-'

    const tvaBuckets = useMemo(() => computeTvaBuckets(lignes), [lignes])

    const getPu = (l: any) => pickNum(l, 'prixUnitaireHt', 'prix_unitaire_ht')
    const getQt = (l: any) => safeNum(l.quantite, 1)
    const getTva = (l: any) => safeNum(l.tva, 20)
    const getRemise = (l: any) => pickNum(l, 'remise', 'remise_pct')
    // Prix d'Achat TTC unitaire = Prix unitaire HT × (1 + TVA/100)
    const getPrixAchatTtc = (l: any) => getPu(l) * (1 + getTva(l) / 100)
    // Prix de Vente TTC : valeur enregistrée, sinon dérivée du Prix Achat TTC et de la remise
    const getPrixVenteTtc = (l: any) => {
      const stored = pickNum(l, 'prixVenteTtc', 'prix_vente_ttc')
      if (stored > 0) return stored
      const remise = getRemise(l)
      const achatTtc = getPrixAchatTtc(l)
      return remise < 100 ? achatTtc / (1 - remise / 100) : achatTtc
    }

    const amountWords = numberToFrenchWords(Math.abs(Number(totalTtc)))

    // When there are exactly 10 products the full block (header + table +
    // totals + signatures) is just slightly too tall for a single A4 page,
    // which pushes the whole items table onto page 2 and leaves a large
    // blank gap on page 1. Tighten the row vertical padding ONLY in that
    // case so everything fits back onto one page. All other cases are left
    // untouched.
    const isTenProducts = lignes.length === 10
    const rowPadY = isTenProducts ? '4px' : '8px'

    return (
      <>
        <style>{`
          @page { margin: 0; size: A4; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; }
          }
          .fw-doc {
            font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
            color: ${C.text};
            background: #fff;
            position: relative;
          }
          .fw-doc table { border-collapse: collapse; }
          .fw-watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt;
            font-weight: 900;
            color: ${C.watermark};
            z-index: 0;
            white-space: nowrap;
            pointer-events: none;
            letter-spacing: 12px;
            text-transform: uppercase;
            user-select: none;
          }
        `}</style>
        <div ref={ref} className="fw-doc">
          <div style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '15mm',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {entreprise?.activerFiligrane !== false && (
              <div className="fw-watermark">{entreprise?.watermarkText || 'SmartGestion'}</div>
            )}

            {/* ===== HEADER =================================================
                 Left column: optional logo + company name + contact lines.
                 Right column: red title pill with white text + N°/Date row.
                 This mirrors the reference design and is shared visually
                 with the other 4 document types (only the pill label
                 changes). */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {entreprise?.logoUrl && (
                  <img src={entreprise.logoUrl} alt="Logo" style={{ width: 100, height: 60, objectFit: 'contain', flexShrink: 0 }} />
                )}
                <div style={{ fontSize: '9pt', lineHeight: 1.6, color: C.text }}>
                  <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title, marginBottom: 6, letterSpacing: 0.3 }}>
                    {(entreprise?.nom || entreprise?.nomEntreprise || 'Nom de l\'entreprise').toUpperCase()}
                  </div>
                  {entreprise?.adresse  && <div style={{ color: C.muted }}>{entreprise.adresse}</div>}
                  {entreprise?.ville    && <div style={{ color: C.muted }}>{entreprise.ville}</div>}
                  {entreprise?.telephone && <div style={{ color: C.muted }}>Tel: {entreprise.telephone}</div>}
                  {entreprise?.email     && <div style={{ color: C.muted }}>Email: {entreprise.email}</div>}
                </div>
              </div>

              {/* Red title pill — solid accent fill with white text inside.
                  N°/Date sit underneath, right-aligned and quietly styled. */}
              <div style={{ textAlign: 'right', minWidth: 200 }}>
                <div style={{
                  display: 'inline-block',
                  background: C.accent,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '14pt',
                  letterSpacing: 2,
                  padding: '10px 28px',
                  textTransform: 'uppercase',
                }}>
                  {facture?.isAvoir ? 'Avoir' : 'Facture'}
                </div>
                <div style={{ fontSize: '9pt', marginTop: 8, color: C.text }}>
                  <strong style={{ color: C.title }}>N°:</strong> {numero}
                  <span style={{ marginLeft: 16 }}><strong style={{ color: C.title }}>Date:</strong> {dateEmission}</span>
                </div>
              </div>
            </div>

            {/* Thin red rule separating the header from the FACTURÉ À box. */}
            <div style={{ borderTop: `2px solid ${C.accent}`, marginBottom: 14 }} />

            {/* ===== FACTURÉ À BOX ==========================================
                 Thin red border around a small label tab + the client info
                 block. The label tab is achieved by absolutely-positioning
                 a white-background label over the top-start edge of the
                 border. */}
            <div style={{ position: 'relative', marginBottom: 18 }}>
              <div style={{
                position: 'absolute',
                top: -8,
                left: 14,
                background: '#fff',
                padding: '0 8px',
                fontSize: '9pt',
                fontWeight: 700,
                color: C.title,
                letterSpacing: 0.5,
              }}>
                — FACTURÉ À —
              </div>
              <div style={{
                border: `1px solid ${C.accent}`,
                padding: '14px 16px 12px',
                fontSize: '9.5pt',
                lineHeight: 1.65,
                color: C.text,
              }}>
                <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title, marginBottom: 4, letterSpacing: 0.3 }}>
                  {(entityName || '-').toUpperCase()}
                </div>
                {client?.ice       && <div>ICE: {client.ice}</div>}
                {client?.telephone && <div>{client.telephone}</div>}
                {client?.adresse   && <div>{client.adresse}</div>}
                {client?.ville     && <div>{(client.ville || ville || '').toString().toUpperCase()}</div>}
              </div>
            </div>

            {/* Optional payment-reference strip — only rendered when a
                mode de paiement was captured on the invoice. Kept very
                subtle (muted text on a faint divider) so it doesn't
                compete with the FACTURÉ À box visually. */}
            {modePaiement && (
              <div style={{
                fontSize: '9pt',
                color: C.muted,
                marginBottom: 12,
                paddingBottom: 6,
                borderBottom: `1px solid ${C.borderSoft}`,
              }}>
                <strong style={{ color: C.title }}>Mode de paiement:</strong> {modePaiement}
              </div>
            )}

            {/* ===== ITEMS TABLE ============================================
                 Solid red header bar with white uppercase column labels.
                 Body rows alternate with a faint slate-50 zebra so reading
                 across is easy on busy invoices. The first column is a
                 simple row index (N°) printed in the accent red — a small
                 brand touch that matches the reference image. */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '17%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: C.accent, color: '#fff' }}>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 8px`, fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>N°</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 12px`, fontSize: '9.5pt', fontWeight: 700, textAlign: 'left',   textTransform: 'uppercase', letterSpacing: 0.5 }}>Désignation</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 8px`,  fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>U.G.</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 12px`, fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quantité</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 12px`, fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Prix U.</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 8px`,  fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>%Rem</th>
                    <th style={{ padding: `${isTenProducts ? '6px' : '10px'} 12px`, fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : C.rowAlt }}>
                      <td style={{ padding: `${rowPadY} 8px`, fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.accent, fontWeight: 700 }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: `${rowPadY} 12px`, fontSize: '9.5pt', textAlign: 'left', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>
                        {ligne.designation || '-'}
                      </td>
                      <td style={{ padding: `${rowPadY} 8px`, fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}></td>
                      <td style={{ padding: `${rowPadY} 12px`, fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>
                        {getQt(ligne)}
                      </td>
                      <td style={{ padding: `${rowPadY} 12px`, fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>
                        {formatAmount(getPrixVenteTtc(ligne))}
                      </td>
                      <td style={{ padding: `${rowPadY} 8px`, fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>
                        {fmtLoose(getRemise(ligne))}
                      </td>
                      <td style={{ padding: `${rowPadY} 12px`, fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text, fontWeight: 700 }}>
                        {formatAmount(getPrixAchatTtc(ligne))}
                      </td>
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '10px 8px', fontSize: '9pt', textAlign: 'center', fontStyle: 'italic', color: C.subtle, borderBottom: `0.5pt solid ${C.borderSoft}` }}>
                        Aucun article
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* ===== TOTALS STACK =========================================
                   Right-aligned 3-row block: Total H.T → TVA → solid red
                   TOTAL TTC bar. Each row uses thin slate dividers; the
                   TTC row is a solid red rectangle with white text — the
                   reference design's headline element. */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '9.5pt', width: 320 }}>
                  <tbody>
                    <tr>
                      <td style={{
                        padding: '8px 14px',
                        textAlign: 'left',
                        background: C.rowAlt,
                        borderBottom: `1px solid ${C.borderSoft}`,
                        color: C.text,
                      }}>
                        Total H.T
                      </td>
                      <td style={{
                        padding: '8px 14px',
                        textAlign: 'right',
                        background: C.rowAlt,
                        borderBottom: `1px solid ${C.borderSoft}`,
                        color: C.text,
                        fontWeight: 700,
                      }}>
                        {formatAmount(totalHt)} DH
                      </td>
                    </tr>
                    <tr>
                      <td style={{
                        padding: '8px 14px',
                        textAlign: 'left',
                        background: C.rowAlt,
                        color: C.text,
                      }}>
                        TVA{tvaBuckets.length === 1 ? ` (${tvaBuckets[0].rate}%)` : ''}
                      </td>
                      <td style={{
                        padding: '8px 14px',
                        textAlign: 'right',
                        background: C.rowAlt,
                        color: C.text,
                        fontWeight: 700,
                      }}>
                        {formatAmount(totalTva)} DH
                      </td>
                    </tr>
                    <tr>
                      <td style={{
                        padding: '12px 14px',
                        textAlign: 'left',
                        background: C.accent,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '11pt',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}>
                        Total TTC
                      </td>
                      <td style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        background: C.accent,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '11pt',
                      }}>
                        {formatAmount(totalTtc)} DH
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ===== AMOUNT IN WORDS ======================================
                   Light gray box, italic centered text — matches the
                   reference's "Arrêtée la présente facture à la somme de"
                   call-out. */}
              <div style={{
                marginTop: 18,
                padding: '12px 16px',
                background: C.rowAlt,
                fontSize: '9pt',
                textAlign: 'center',
                lineHeight: 1.5,
                color: C.text,
              }}>
                <div style={{ fontStyle: 'italic', color: C.muted, marginBottom: 4 }}>
                  Arrêtée la présente facture à la somme de :
                </div>
                <div style={{ fontWeight: 700, color: C.title }}>
                  {amountWords} dirhams
                </div>
              </div>

              {/* ===== PAYMENT INFO + NOTES =================================
                   Optional sections — only rendered when data is present. */}
              {(entreprise?.banque || entreprise?.rib) && (
                <div style={{ marginTop: 18, fontSize: '9pt', color: C.text }}>
                  <div style={{ fontWeight: 700, color: C.title, letterSpacing: 0.5, marginBottom: 4 }}>
                    INFORMATIONS DE PAIEMENT
                  </div>
                  {entreprise?.banque && <div>{entreprise.banque}</div>}
                  {entreprise?.rib    && <div>{entreprise.rib}</div>}
                </div>
              )}

              {facture.notes && (
                <div style={{ marginTop: 14, fontSize: '9pt', color: C.text }}>
                  <strong style={{ color: C.title }}>Notes:</strong> {facture.notes}
                </div>
              )}

              {/* Push signatures to the bottom of the page */}
              <div style={{ flex: 1 }} />

              {/* ===== SIGNATURES ===========================================
                   Two simple thin-rule signature lines, "SIGNATURE DU
                   VENDEUR" / "SIGNATURE DU CLIENT" labels underneath in
                   small caps — sober, professional, matches the reference. */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 40,
                gap: 60,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ borderTop: `1px solid ${C.title}`, width: 180, marginBottom: 6 }} />
                  <div style={{ fontSize: '9pt', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Signature du Vendeur
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ borderTop: `1px solid ${C.title}`, width: 180, marginBottom: 6, marginLeft: 'auto' }} />
                  <div style={{ fontSize: '9pt', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Signature du Client
                  </div>
                </div>
              </div>

              {/* ===== LEGAL FOOTER =========================================
                   Single-line strip at the very bottom: capital + RC + IF +
                   ICE — small, slate-muted, centered. */}
              <div style={{
                marginTop: 18,
                paddingTop: 8,
                borderTop: `1px solid ${C.borderSoft}`,
                textAlign: 'center',
                fontSize: '7.5pt',
                lineHeight: 1.5,
                color: C.muted,
              }}>
                {entreprise?.formeJuridique && entreprise?.capitalSocial && (
                  <span>{entreprise.formeJuridique} au Capital de {entreprise.capitalSocial} — </span>
                )}
                {entreprise?.rc       && <span>R.C: {entreprise.rc} — </span>}
                {entreprise?.ifNumber && <span>I.F: {entreprise.ifNumber} — </span>}
                {entreprise?.ice      && <span>I.C.E: {entreprise.ice}</span>}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }
)

FactureDocument.displayName = 'FactureDocument'
