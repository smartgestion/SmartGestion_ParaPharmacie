import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Search, Package, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn, formatCurrencyLocale } from '@/lib/utils'

/**
 * Raw or normalized product row. All fields are optional/defensive because the
 * document forms keep raw snake_case rows in state while other callers pass the
 * camelCase-normalized shape (see `mapProduit`). The component reads both.
 */
export interface SearchableProduit {
  id: number | string;
  reference?: string;
  designation?: string;
  nom?: string;
  marque?: string;
  barcode?: string;
  // sale price (both cases)
  prix_vente_ht?: number;
  prixVenteHt?: number;
  // purchase price (both cases)
  prix_achat_ht?: number;
  prixAchatHt?: number;
  // vat / stock (all known casings)
  taux_tva?: number;
  tauxTva?: number;
  tva?: number;
  stock_actuel?: number;
  stockActuel?: number;
  [key: string]: any;
}

interface ProductSearchBarProps {
  produits: SearchableProduit[];
  /** Called with the raw product when the user picks one. */
  onSelect: (produit: SearchableProduit) => void;
  /** Which unit price to display in results. Sales docs → 'vente', purchase docs → 'achat'. */
  priceField?: 'vente' | 'achat';
  /** Accent color used for the focus ring / highlight. Tailwind base color name. */
  accent?: 'emerald' | 'blue' | 'orange' | 'rose' | 'purple';
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Keep the search text after selecting (default clears it). */
  keepValueOnSelect?: boolean;
  /**
   * Per-line mode: label of the product already selected on this line. When
   * set and the user is not actively typing, it is shown in the input so the
   * field doubles as both a picker and a display of the current selection.
   */
  selectedLabel?: string;
  /** Compact height (h-9) to line up with table row inputs. */
  compact?: boolean;
}

/** Max results rendered at once — keeps the dropdown fast for large catalogs. */
const MAX_RESULTS = 50;

const getName = (p: SearchableProduit) => p.designation || p.nom || '';
const getStock = (p: SearchableProduit) => Number(p.stock_actuel ?? p.stockActuel ?? 0);
const getPrice = (p: SearchableProduit, field: 'vente' | 'achat') =>
  field === 'achat'
    ? Number(p.prix_achat_ht ?? p.prixAchatHt ?? p.prix_vente_ht ?? p.prixVenteHt ?? 0)
    : Number(p.prix_vente_ht ?? p.prixVenteHt ?? p.prix_achat_ht ?? p.prixAchatHt ?? 0);

const ACCENT = {
  emerald: {
    ring: 'focus:border-emerald-300 focus:ring-emerald-500/15 dark:focus:border-emerald-500/40',
    active: 'bg-emerald-50 dark:bg-emerald-500/10',
    bar: 'bg-emerald-500',
    price: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    ring: 'focus:border-blue-300 focus:ring-blue-500/15 dark:focus:border-blue-500/40',
    active: 'bg-blue-50 dark:bg-blue-500/10',
    bar: 'bg-blue-500',
    price: 'text-blue-600 dark:text-blue-400',
  },
  orange: {
    ring: 'focus:border-orange-300 focus:ring-orange-500/15 dark:focus:border-orange-500/40',
    active: 'bg-orange-50 dark:bg-orange-500/10',
    bar: 'bg-orange-500',
    price: 'text-orange-600 dark:text-orange-400',
  },
  rose: {
    ring: 'focus:border-rose-300 focus:ring-rose-500/15 dark:focus:border-rose-500/40',
    active: 'bg-rose-50 dark:bg-rose-500/10',
    bar: 'bg-rose-500',
    price: 'text-rose-600 dark:text-rose-400',
  },
  purple: {
    ring: 'focus:border-purple-300 focus:ring-purple-500/15 dark:focus:border-purple-500/40',
    active: 'bg-purple-50 dark:bg-purple-500/10',
    bar: 'bg-purple-500',
    price: 'text-purple-600 dark:text-purple-400',
  },
} as const;

function StockPill({ stock }: { stock: number }) {
  const { t } = useTranslation();
  if (stock <= 0) {
    return (
      <span className="shrink-0 text-[10px] font-semibold text-white bg-rose-500 px-2 py-0.5 rounded-full">
        {t('shared.product_search.out_of_stock')}
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 px-2 py-0.5 rounded-full">
        {t('shared.product_search.stock_count', { count: stock })}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30 px-2 py-0.5 rounded-full">
      {t('shared.product_search.stock_count', { count: stock })}
    </span>
  );
}

/**
 * Inline product search / autocomplete used across all sales and purchase
 * documents (factures, devis, BL, BC, avoirs). Type to filter by name,
 * reference or barcode; navigate with ↑/↓; Enter to add, Esc to close.
 * Selecting a product invokes `onSelect(produit)` — the parent form is
 * responsible for appending / filling the line.
 */
export function ProductSearchBar({
  produits,
  onSelect,
  priceField = 'vente',
  accent = 'emerald',
  placeholder,
  disabled,
  className,
  keepValueOnSelect = false,
  selectedLabel,
  compact = false,
}: ProductSearchBarProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const colors = ACCENT[accent] ?? ACCENT.emerald;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return produits.slice(0, MAX_RESULTS);
    const matched: SearchableProduit[] = [];
    for (const p of produits) {
      const hay =
        `${getName(p)} ${p.reference || ''} ${p.barcode || ''} ${p.marque || ''}`.toLowerCase();
      if (hay.includes(q)) {
        matched.push(p);
        if (matched.length >= MAX_RESULTS) break;
      }
    }
    return matched;
  }, [produits, query]);

  // Keep the active row within bounds when results change.
  useEffect(() => {
    setActiveIndex((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  // Position the dropdown (rendered in a portal so it escapes the table's
  // `overflow-x-auto` clipping and any stacking contexts).
  const updateCoords = useCallback(() => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const handler = () => updateCoords();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updateCoords]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the active item scrolled into view.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (p: SearchableProduit) => {
    onSelect(p);
    setOpen(false);
    setActiveIndex(0);
    if (!keepValueOnSelect) setQuery('');
    // Per-line mode (has selectedLabel prop): blur so the chosen product name
    // is shown in the field. Standalone "add" mode: refocus so the user can
    // keep adding products without touching the mouse.
    if (selectedLabel !== undefined) {
      setFocused(false);
      inputRef.current?.blur();
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && results[activeIndex]) {
        e.preventDefault();
        const p = results[activeIndex];
        if (getStock(p) > 0 || priceField === 'achat') choose(p);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const rtl = i18n.language.startsWith('ar');

  const dropdown = open && coords ? (
    <div
      ref={listRef}
      role="listbox"
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        top: coords.top + 4,
        left: coords.left,
        width: coords.width,
        zIndex: 60,
      }}
      className="max-h-[320px] overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0F172A]"
    >
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <Package className="h-6 w-6 text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {query
              ? t('shared.product_search.no_match', { term: query })
              : t('shared.product_search.no_products')}
          </p>
        </div>
      ) : (
        results.map((p, index) => {
          const stock = getStock(p);
          const outOfStock = stock <= 0;
          // Purchase docs may still add out-of-stock items (receiving goods).
          const selectable = !outOfStock || priceField === 'achat';
          const name = getName(p) || t('shared.product_search.unnamed');
          const active = index === activeIndex;
          return (
            <button
              type="button"
              key={p.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectable && choose(p)}
              disabled={!selectable}
              className={cn(
                'relative flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors',
                'border-b border-slate-100 last:border-0 dark:border-white/5',
                active ? colors.active : 'hover:bg-slate-50 dark:hover:bg-white/5',
                !selectable && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div
                className={cn(
                  'absolute start-0 top-1.5 bottom-1.5 w-[3px] rounded-e-full transition-all',
                  active ? colors.bar : 'bg-transparent',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-sm font-semibold',
                      outOfStock
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-slate-800 dark:text-card-foreground',
                    )}
                  >
                    {name}
                  </p>
                  <StockPill stock={stock} />
                </div>
                {(p.reference || p.marque || p.barcode) && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {p.marque && <span>{p.marque}</span>}
                    {p.marque && p.reference && <span> • </span>}
                    {p.reference && (
                      <span className="font-mono" dir="ltr">
                        {p.reference}
                      </span>
                    )}
                    {(p.marque || p.reference) && p.barcode && <span> • </span>}
                    {p.barcode && (
                      <span className="font-mono" dir="ltr">
                        {p.barcode}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <span
                dir={rtl ? 'rtl' : 'ltr'}
                className={cn('shrink-0 text-sm font-black', colors.price)}
              >
                {formatCurrencyLocale(getPrice(p, priceField), i18n.language)}
              </span>
            </button>
          );
        })
      )}
    </div>
  ) : null;

  // In per-line mode, when the user is not actively editing show the already
  // selected product's name inside the field (so it reads like the current
  // selection). While focused/typing, the live query takes over.
  const showingSelection = !!selectedLabel && !focused && query === '';
  const displayValue = showingSelection ? selectedLabel! : query;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
      <Input
        ref={inputRef}
        value={displayValue}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={
          selectedLabel ?? placeholder ?? t('shared.product_search.placeholder')
        }
        title={selectedLabel || undefined}
        aria-autocomplete="list"
        aria-expanded={open}
        className={cn(
          'ps-9 pe-9 bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 dark:text-card-foreground dark:placeholder:text-slate-500 shadow-none transition-all focus:ring-2',
          compact ? 'h-9 text-sm' : 'h-10',
          showingSelection && 'font-medium text-slate-800 dark:text-card-foreground',
          colors.ring,
        )}
      />
      {query && (
        <button
          type="button"
          aria-label={t('shared.product_search.clear')}
          onClick={() => {
            setQuery('');
            setActiveIndex(0);
            inputRef.current?.focus();
          }}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
