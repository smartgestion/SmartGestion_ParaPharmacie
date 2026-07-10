# Remise Page — Full Restore Guide

Backup of the CURRENT remise feature. After pulling the other version (which deletes this),
use this file to re-add everything. There are **5 parts**: the page file + 4 wiring points.

---

## 1. Page file — `src/pages/remises/RemisesList.tsx`

Create the folder `src/pages/remises/` and this file:

```tsx
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Percent, ChevronLeft, ChevronRight, Package,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Remises — read-only report page.
 *
 * Displays every product; when a product was purchased through one or more
 * Bons de Commande, one row per BC line is shown with the supplier, the
 * purchase price and the remise coming straight from `bon_commande_lignes`.
 * Products never purchased through a BC still appear, with empty supplier /
 * purchase price / remise cells.
 *
 * No create / edit / delete actions — data is always re-read from the BCs,
 * so any remise change made in a Bon de Commande is reflected here.
 */

interface RemiseRow {
  /** Unique key: `p{produitId}` or `l{ligneId}`. */
  key: string;
  produitId: number;
  produitNom: string;
  reference: string;
  barcode: string;
  /** Supplier name — empty when the product has no BC. */
  fournisseurNom: string;
  /** BC number for context — empty when the product has no BC. */
  bcNumero: string;
  /** Quantity ordered on the BC line — null when the product has no BC. */
  quantiteBc: number | null;
  /** Remaining stock of the product (produits.stock_actuel). */
  stockActuel: number;
  unite: string;
  /** True when the row comes from a BC line, false for product-only rows. */
  hasBc: boolean;
  /**
   * Purchase price TTC — from the BC line when the product has a BC,
   * otherwise the product's own `prix_achat_ttc` (remise already applied).
   */
  prixAchatTtc: number | null;
  /**
   * Remise (%) — from the BC line when the product has a BC, otherwise
   * the product's own `calc_remise` (defined when the product was added).
   */
  remise: number | null;
}

const ITEMS_PER_PAGE = 10;

export function RemisesList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<RemiseRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    if (!user?.id) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // 1) All products of the user.
      const { data: produits, error: produitsError } = await supabase
        .from('produits')
        .select('*')
        .eq('user_id', user.id)
        .order('designation');
      if (produitsError) throw produitsError;

      // 2) All BCs of the user with their supplier embedded.
      const { data: bons, error: bonsError } = await supabase
        .from('bons_commande')
        .select('*, fournisseur:fournisseurs(*)')
        .eq('user_id', user.id)
        .order('date_commande', { ascending: false });
      if (bonsError) throw bonsError;

      // 3) All BC lines belonging to those BCs.
      const bonIds = (bons || []).map((b: any) => b.id);
      let lignes: any[] = [];
      if (bonIds.length > 0) {
        const { data: lignesData, error: lignesError } = await supabase
          .from('bon_commande_lignes')
          .select('*')
          .in('bon_commande_id', bonIds);
        if (lignesError) throw lignesError;
        lignes = lignesData || [];
      }

      // Index BCs by id, then group lines by product — newest BC first.
      const bonById = new Map<number, any>();
      for (const bon of bons || []) bonById.set(Number(bon.id), bon);

      const bonOrder = new Map<number, number>();
      (bons || []).forEach((b: any, i: number) => bonOrder.set(Number(b.id), i));

      const lignesByProduit = new Map<number, any[]>();
      for (const ligne of lignes) {
        const pid = Number(ligne.produit_id);
        if (!pid) continue;
        if (!lignesByProduit.has(pid)) lignesByProduit.set(pid, []);
        lignesByProduit.get(pid)!.push(ligne);
      }
      for (const list of lignesByProduit.values()) {
        list.sort(
          (a, b) =>
            (bonOrder.get(Number(a.bon_commande_id)) ?? 0) -
            (bonOrder.get(Number(b.bon_commande_id)) ?? 0)
        );
      }

      // Build display rows: one per BC line, or a single product-only row
      // when the product has never been purchased through a BC. In that
      // case the purchase price TTC / remise fall back to the values stored
      // on the product itself (prix_achat_ttc / calc_remise).
      const out: RemiseRow[] = [];
      for (const p of produits || []) {
        const base = {
          produitId: Number(p.id),
          produitNom: p.designation || p.nom || '',
          reference: p.reference || '',
          barcode: p.barcode || '',
          stockActuel: Number(p.stock_actuel || 0),
          unite: p.unite || '',
        };
        const produitLignes = lignesByProduit.get(Number(p.id)) || [];
        if (produitLignes.length === 0) {
          const produitAchatTtc = Number(p.prix_achat_ttc || 0);
          out.push({
            ...base,
            key: `p${p.id}`,
            fournisseurNom: '',
            bcNumero: '',
            quantiteBc: null,
            hasBc: false,
            // Purchase price TTC from the product itself; hidden when 0.
            prixAchatTtc: produitAchatTtc > 0 ? produitAchatTtc : null,
            // Remise always comes from the product (calc_remise) when
            // there is no BC — shown even when it is 0%.
            remise: Number(p.calc_remise || 0),
          });
        } else {
          for (const ligne of produitLignes) {
            const bon = bonById.get(Number(ligne.bon_commande_id));
            const prixHt = Number(ligne.prix_unitaire_ht || 0);
            const tva = Number(ligne.tva ?? 20);
            out.push({
              ...base,
              key: `l${ligne.id}`,
              fournisseurNom: bon?.fournisseur?.nom || '',
              bcNumero: bon?.numero || '',
              quantiteBc: Number(ligne.quantite || 0),
              hasBc: true,
              prixAchatTtc: Number((prixHt * (1 + tva / 100)).toFixed(2)),
              remise: Number(ligne.remise || 0),
            });
          }
        }
      }

      setRows(out);
    } catch (error) {
      console.error('ERROR:', error);
      toast.error(t('remises.toast_load_error'));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  // Real-time search: product name, barcode, supplier name.
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter((row) =>
      row.produitNom.toLowerCase().includes(query) ||
      row.barcode.toLowerCase().includes(query) ||
      row.fournisseurNom.toLowerCase().includes(query)
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Summary stats.
  const produitsCount = useMemo(() => new Set(rows.map(r => r.produitId)).size, [rows]);
  const lignesAvecRemise = rows.filter(r => (r.remise ?? 0) > 0).length;
  const remises = rows.filter(r => r.remise !== null && r.remise > 0);
  const avgRemise = remises.length > 0
    ? remises.reduce((sum, r) => sum + (r.remise || 0), 0) / remises.length
    : 0;
  const produitsSansBc = rows.filter(r => !r.hasBc).length;

  const emptyCell = <span className="text-slate-300 dark:text-slate-600">—</span>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-amber-50 border border-amber-200/50 dark:bg-[#0F172A]/60 dark:border-white/10 shrink-0">
            <Percent className="h-5 w-5 text-amber-500 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">{t('remises.page_title')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
              {t('remises.page_subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Left Column - Table */}
        <div className="lg:col-span-3 space-y-4 min-w-0">
          {/* Search */}
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none dark:text-slate-500" />
            <Input
              type="text"
              placeholder={t('remises.search_ph')}
              className="ps-9 h-10 bg-white border-slate-200 rounded-[4px] focus:border-slate-300 shadow-none text-sm dark:bg-[#0F172A] dark:border-white/10 dark:text-white dark:placeholder:text-slate-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Table */}
          <Card className="border border-slate-200 shadow-none rounded-[6px] overflow-hidden dark:bg-[#0F172A] dark:border-white/10">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-100 dark:border-white/5">
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('remises.col_product')}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('remises.col_supplier')}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-right dark:text-slate-400">{t('remises.col_qty_bc')}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-right dark:text-slate-400">{t('remises.col_stock')}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('remises.col_buy_price')}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-right dark:text-slate-400">{t('remises.col_remise')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="h-8 w-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground font-medium">{t('remises.loading')}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="bg-slate-50 rounded-[6px] p-4 border border-slate-100 dark:bg-[#0F172A]/40 dark:border-white/10">
                            <Percent className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                          </div>
                          <p className="text-sm text-slate-500 font-medium dark:text-slate-400">
                            {searchQuery ? t('remises.empty_filtered') : t('remises.empty_all')}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => (
                      <TableRow
                        key={row.key}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors dark:border-white/5 dark:hover:bg-white/[0.02]"
                      >
                        <TableCell className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-800 dark:text-white">
                              {row.produitNom || '-'}
                            </span>
                            {row.barcode && (
                              <span className="text-[10px] font-mono text-slate-300 mt-0.5 dark:text-slate-600">
                                {row.barcode}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          {row.fournisseurNom ? (
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                {row.fournisseurNom}
                              </span>
                              {row.bcNumero && (
                                <span className="text-[10px] font-mono text-slate-400 mt-0.5 dark:text-slate-500">
                                  {row.bcNumero}
                                </span>
                              )}
                            </div>
                          ) : emptyCell}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          {row.quantiteBc !== null ? (
                            <span className="text-sm text-slate-600 dark:text-slate-400" dir="ltr">
                              {row.quantiteBc}
                            </span>
                          ) : emptyCell}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200/70 dark:bg-white/5 dark:text-slate-300 dark:border-white/10" dir="ltr">
                            {row.stockActuel} {row.unite}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          {row.prixAchatTtc !== null ? (
                            <span className="text-sm text-slate-600 dark:text-slate-400" dir="ltr">
                              {formatCurrency(row.prixAchatTtc)}
                            </span>
                          ) : emptyCell}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          {row.remise !== null ? (
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
                              row.remise > 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                : "bg-slate-50 text-slate-500 border border-slate-200/70 dark:bg-white/5 dark:text-slate-400 dark:border-white/10"
                            )} dir="ltr">
                              {row.remise}%
                            </span>
                          ) : emptyCell}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {!isLoading && paginatedRows.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/5">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} {t('shared.pagination.of')} {filteredRows.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-[4px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 min-w-[32px] rounded-[4px] text-sm font-medium",
                        page === currentPage
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-white"
                          : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/5"
                      )}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-[4px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-slate-200 shadow-none rounded-[6px] dark:bg-[#0F172A] dark:border-white/10">
            <CardHeader className="px-4 py-4 border-b border-slate-100 dark:border-white/5">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('remises.sidebar_title')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-[6px] bg-amber-50 border border-amber-200/50 shrink-0 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  <Package className="h-4 w-4 text-amber-500 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('remises.sidebar_total_products')}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white" dir="ltr">{produitsCount}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-white/5 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('remises.sidebar_with_remise')}</span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{lignesAvecRemise}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('remises.sidebar_avg_remise')}</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{avgRemise.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('remises.sidebar_no_bc')}</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{produitsSansBc}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

---

## 2. Route — `src/App.tsx`

Add the import (near the other page imports):

```tsx
import { RemisesList } from './pages/remises/RemisesList'
```

Add the route inside the `DashboardLayout` / `ProtectedRoute` nested routes:

```tsx
<Route path="remises" element={<RemisesList />} />
```

---

## 3. Sidebar link — `src/components/layout/Sidebar.tsx`

Make sure `Percent` is imported from `lucide-react`, then add this entry under the **"achat"** (purchase) group:

```tsx
{ nameKey: 'navigation.remises', href: '/remises', icon: Percent },
```

---

## 4. Page header mapping — `src/components/layout/DashboardLayout.tsx`

Add to the route-title map object:

```tsx
'/remises':         { titleKey: 'navigation.remises',        subtitleKey: 'header.subtitles.remises'        },
```

---

## 5. i18n keys — `src/locales/fr.json`, `en.json`, `ar.json`

In each locale file add:
- `navigation.remises` (inside the `"navigation"` object)
- `header.subtitles.remises` (inside `"header" > "subtitles"`)
- the full `"remises"` namespace (top-level object)

### fr.json
```json
"navigation": { "remises": "Remises" }
"header": { "subtitles": { "remises": "Remises des bons de commande" } }
```
```json
"remises": {
  "page_title":      "Remises",
  "page_subtitle":   "Consultez les remises définies dans les bons de commande",
  "search_ph":       "Rechercher par produit, code-barres, fournisseur...",
  "loading":         "Chargement des remises...",
  "empty_filtered":  "Aucun résultat trouvé",
  "empty_all":       "Aucun produit enregistré",
  "toast_load_error":"Erreur",
  "sidebar_title":   "Aperçu des Remises",
  "sidebar_total_products": "Total produits",
  "sidebar_with_remise":    "Lignes avec remise",
  "sidebar_avg_remise":     "Remise moyenne",
  "sidebar_no_bc":          "Produits sans BC",
  "col_product":     "Produit",
  "col_supplier":    "Fournisseur",
  "col_qty_bc":      "Qté BC",
  "col_stock":       "Quantité restante",
  "col_buy_price":   "Prix Achat TTC",
  "col_remise":      "Remise"
}
```

### en.json
```json
"navigation": { "remises": "Discounts" }
"header": { "subtitles": { "remises": "Purchase order discounts" } }
```
```json
"remises": {
  "page_title":      "Discounts",
  "page_subtitle":   "View the discounts defined in purchase orders",
  "search_ph":       "Search by product, barcode, supplier...",
  "loading":         "Loading discounts...",
  "empty_filtered":  "No results found",
  "empty_all":       "No products recorded",
  "toast_load_error":"Error",
  "sidebar_title":   "Discounts Overview",
  "sidebar_total_products": "Total products",
  "sidebar_with_remise":    "Lines with discount",
  "sidebar_avg_remise":     "Average discount",
  "sidebar_no_bc":          "Products without PO",
  "col_product":     "Product",
  "col_supplier":    "Supplier",
  "col_qty_bc":      "PO Qty",
  "col_stock":       "Remaining Qty",
  "col_buy_price":   "Buy Price (incl.)",
  "col_remise":      "Discount"
}
```

### ar.json
```json
"navigation": { "remises": "الخصومات" }
"header": { "subtitles": { "remises": "خصومات أوامر الشراء" } }
```
```json
"remises": {
  "page_title":      "الخصومات",
  "page_subtitle":   "عرض الخصومات المحددة في أوامر الشراء",
  "search_ph":       "بحث بالمنتج أو الباركود أو المورد...",
  "loading":         "جارٍ تحميل الخصومات...",
  "empty_filtered":  "لا توجد نتائج مطابقة",
  "empty_all":       "لم يتم تسجيل أي منتج",
  "toast_load_error":"خطأ",
  "sidebar_title":   "نظرة عامة على الخصومات",
  "sidebar_total_products": "إجمالي المنتجات",
  "sidebar_with_remise":    "أسطر بخصم",
  "sidebar_avg_remise":     "متوسط الخصم",
  "sidebar_no_bc":          "منتجات بدون أمر شراء",
  "col_product":     "المنتج",
  "col_supplier":    "المورد",
  "col_qty_bc":      "كمية أمر الشراء",
  "col_stock":       "الكمية المتبقية",
  "col_buy_price":   "سعر الشراء (ش.ض)",
  "col_remise":      "الخصم"
}
```

---

## Dependencies (must already exist after the pull)
The page relies on these — verify they are present:
- `@/lib/supabase`  (supabase / local SQLite adapter)
- `@/contexts/AuthContext`  (`useAuth`)
- `@/lib/utils`  (`cn`, `formatCurrency`)
- UI: `@/components/ui/{input,button,table,card}`, `sonner`
- DB columns: `bon_commande_lignes.remise`, `produits.calc_remise`, `produits.prix_achat_ttc`
- i18n key `shared.pagination.of` (used by the pagination footer)

---

**Tip:** After pulling, just tell me "restore the remise page" and I'll re-apply all 5 parts automatically from this file.
```
