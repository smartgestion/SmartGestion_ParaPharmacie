import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Package, ImageIcon, Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { searchCatalog, catalogCount, type CatalogProduct } from '@/lib/catalog/catalog';

export interface CatalogPick {
  nom: string;
  marque: string;
  barcode: string;
  description: string;
  imageUrl: string;
}

interface CatalogSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks a product from the catalogue. */
  onPick: (pick: CatalogPick) => void;
}

/**
 * Fast catalogue search modal. Searches the local FTS5-indexed reference
 * catalogue (~48k products) as the user types, and lets them pick a product
 * to pre-fill the "new product" form. It does NOT add anything to stock by
 * itself — it only hands the chosen product data back to the caller.
 */
export function CatalogSearch({ open, onOpenChange, onPick }: CatalogSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load catalogue size when the modal opens.
  useEffect(() => {
    if (!open) return;
    catalogCount().then(setCount).catch(() => setCount(0));
    // focus the search field
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [open]);

  // Reset when closed.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchCatalog(query, 30);
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePick = (p: CatalogProduct) => {
    onPick({
      nom: p.nom || '',
      marque: p.marque || '',
      barcode: p.barcode || '',
      description: p.description || '',
      imageUrl: p.image_url || '',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-white/10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5 text-amber-500 dark:text-emerald-400" />
            {t('catalog.search_title', 'Rechercher dans le catalogue')}
          </DialogTitle>
          {count !== null && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t('catalog.count_hint', { count })}
            </p>
          )}
        </DialogHeader>

        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('catalog.search_ph', 'Nom, marque ou code-barres...')}
              className="ps-9 h-11"
            />
            {loading && (
              <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <Search className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {t('catalog.type_to_search', 'Tapez au moins 2 caractères pour rechercher.')}
              </p>
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <Package className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {t('catalog.no_results', 'Aucun produit trouvé dans le catalogue.')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(p)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-start hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        loading="lazy"
                        className="h-11 w-11 rounded-[4px] object-cover border border-slate-200 dark:border-white/10 shrink-0 bg-white"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-[4px] bg-slate-100 flex items-center justify-center border border-dashed border-slate-200 dark:bg-slate-800 dark:border-white/10 shrink-0">
                        <ImageIcon className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {p.nom}
                      </p>
                      <div className="flex items-center gap-2">
                        {p.marque && (
                          <span className="text-[11px] text-slate-400 italic dark:text-slate-500 truncate">
                            {p.marque}
                          </span>
                        )}
                        {p.barcode && (
                          <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600">
                            {p.barcode}
                          </span>
                        )}
                      </div>
                    </div>
                    <PlusCircle className="h-5 w-5 text-slate-300 group-hover:text-amber-500 dark:group-hover:text-emerald-400 shrink-0 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
