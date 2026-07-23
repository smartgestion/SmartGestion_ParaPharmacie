import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, DatabaseZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { importCatalogFromBuffer, type ImportProgress } from '@/lib/catalog/catalog';
import { isTauri } from '@/lib/db/runtime';

interface ImportCatalogProps {
  /** Called after a successful import with the number of imported products. */
  onImported?: (count: number) => void;
  className?: string;
}

/**
 * Button that imports the reference catalogue into the local SQLite catalogue.
 *
 * Two sources:
 *   1. The catalogue bundled with the app (`/catalogue_unifie.xlsx`).
 *   2. A file the user picks from disk (fallback / updates).
 *
 * The bundled file is tried first (single click). If it is missing, a file
 * picker opens.
 */
export function ImportCatalog({ onImported, className }: ImportCatalogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = async (buffer: ArrayBuffer) => {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const n = await importCatalogFromBuffer(buffer, setProgress);
      toast.success(t('catalog.import_success', { count: n }));
      onImported?.(n);
    } catch (e: any) {
      console.error('Catalog import error:', e);
      toast.error(e?.message || t('catalog.import_error', "Échec de l'import du catalogue."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleClick = async () => {
    if (!isTauri()) {
      toast.error(t('catalog.desktop_only', "Disponible uniquement dans l'application desktop."));
      return;
    }
    // Try the bundled catalogue first.
    try {
      const res = await fetch('/catalogue_unifie.xlsx');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 0) {
          await runImport(buf);
          return;
        }
      }
    } catch {
      /* fall through to file picker */
    }
    // Bundled file unavailable → let the user pick one.
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const buf = await file.arrayBuffer();
    await runImport(buf);
  };

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={busy}
        className={className}
        title={t('catalog.import_tooltip', 'Importer le catalogue de référence')}
      >
        {busy ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {progress && progress.total > 0
              ? t('catalog.importing_pct', { pct })
              : t('catalog.importing', 'Import...')}
          </>
        ) : (
          <>
            <DatabaseZap className="me-2 h-4 w-4" />
            {t('catalog.import_button', 'Importer catalogue')}
          </>
        )}
      </Button>
    </>
  );
}
