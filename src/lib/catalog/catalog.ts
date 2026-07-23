/**
 * Reference-catalogue helpers.
 *
 * The catalogue is a large (~48k) read-only table of parapharmacy products
 * (barcode / nom / marque / image_url / description) used only to help the
 * user find and pre-fill a product quickly. It lives in its own SQLite
 * tables (`catalog_products` + `catalog_fts`) separate from the user's own
 * stock (`produits`).
 *
 * All functions here run ONLY inside the Tauri desktop shell (they use the
 * Rust SQL bridge). Callers must guard with `isTauri()`.
 */
import {
  executeQuery,
  fetchRows,
  isTauri,
  downloadImage,
  toAssetUrl,
} from '@/lib/db/runtime';

export interface CatalogProduct {
  id: number;
  barcode: string | null;
  nom: string;
  marque: string | null;
  image_url: string | null;
  description: string | null;
}

/** Raw row shape as read from the Excel catalogue. */
interface RawRow {
  'Code Barre'?: unknown;
  'Nom Produit'?: unknown;
  Marque?: unknown;
  'Image URL'?: unknown;
  Description?: unknown;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Number of products currently in the local catalogue. */
export async function catalogCount(): Promise<number> {
  if (!isTauri()) return 0;
  const rows = await fetchRows<{ n: number }>(
    'SELECT COUNT(*) AS n FROM catalog_products',
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportProgress {
  done: number;
  total: number;
}

/**
 * Import products from an Excel file (ArrayBuffer) into `catalog_products`.
 *
 * The existing catalogue is REPLACED (cleared first) so re-importing an
 * updated file does not create duplicates. Rows are inserted in batched
 * transactions for speed; the FTS index is maintained by SQL triggers.
 *
 * @param buffer   the .xlsx file contents
 * @param onProgress optional progress callback (called every batch)
 */
export async function importCatalogFromBuffer(
  buffer: ArrayBuffer,
  onProgress?: (p: ImportProgress) => void,
): Promise<number> {
  if (!isTauri()) {
    throw new Error("L'import du catalogue est disponible uniquement dans l'application desktop.");
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });

  // Normalise + drop empty rows (no name).
  const clean = rows
    .map((r) => ({
      barcode: str(r['Code Barre']),
      nom: str(r['Nom Produit']),
      marque: str(r['Marque']),
      image_url: str(r['Image URL']),
      description: str(r['Description']),
    }))
    .filter((r) => r.nom.length > 0);

  const total = clean.length;
  if (total === 0) {
    throw new Error('Le fichier ne contient aucun produit valide (colonne "Nom Produit" vide).');
  }

  // Fresh import: clear previous data.
  await executeQuery('DELETE FROM catalog_products');

  const BATCH = 400;
  let done = 0;

  for (let i = 0; i < total; i += BATCH) {
    const slice = clean.slice(i, i + BATCH);
    // Build a single multi-row INSERT for the batch.
    const placeholders = slice.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params: (string | null)[] = [];
    for (const r of slice) {
      params.push(
        r.barcode || null,
        r.nom,
        r.marque || null,
        r.image_url || null,
        r.description || null,
      );
    }
    await executeQuery(
      `INSERT INTO catalog_products (barcode, nom, marque, image_url, description) VALUES ${placeholders}`,
      params,
    );
    done += slice.length;
    onProgress?.({ done, total });
  }

  // Rebuild FTS from scratch to be safe (triggers already kept it in sync,
  // but an explicit rebuild guarantees consistency after a bulk load).
  await executeQuery("INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild')");

  return done;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Escape a user query for an FTS5 prefix MATCH.
 *
 * Each whitespace token becomes a quoted prefix term (`"tok"*`) so special
 * characters can't break the FTS syntax. Empty queries return ''.
 */
function toFtsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/["]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

/**
 * Full-text search the catalogue. Returns up to `limit` products ordered by
 * FTS relevance. Fast even on 48k rows (millisecond-scale).
 */
export async function searchCatalog(
  query: string,
  limit = 30,
): Promise<CatalogProduct[]> {
  if (!isTauri()) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const ftsQuery = toFtsQuery(q);
  if (!ftsQuery) return [];

  return fetchRows<CatalogProduct>(
    `SELECT p.id, p.barcode, p.nom, p.marque, p.image_url, p.description
     FROM catalog_fts f
     JOIN catalog_products p ON p.id = f.rowid
     WHERE catalog_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [ftsQuery, limit],
  );
}

/** Look up a single catalogue product by exact barcode (for scanner input). */
export async function findByBarcode(barcode: string): Promise<CatalogProduct | null> {
  if (!isTauri()) return null;
  const bc = barcode.trim();
  if (!bc) return null;
  const rows = await fetchRows<CatalogProduct>(
    `SELECT id, barcode, nom, marque, image_url, description
     FROM catalog_products WHERE barcode = ? LIMIT 1`,
    [bc],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Image acquisition
// ---------------------------------------------------------------------------

export interface ResolvedImage {
  /** URL to render right now (local asset URL if downloaded, else remote). */
  displayUrl: string;
  /** Local disk path once downloaded, else ''. */
  localPath: string;
  /** True when the file was successfully saved to disk. */
  downloaded: boolean;
}

/**
 * Try to download a catalogue image to disk. On success returns a local asset
 * URL; on failure (offline / error) returns the remote URL unchanged and
 * enqueues a retry in `image_download_queue`.
 *
 * @param remoteUrl  the catalogue image URL
 * @param produitId  id of the just-created product (nullable if not yet saved)
 */
export async function acquireImage(
  remoteUrl: string,
  produitId?: number | null,
): Promise<ResolvedImage> {
  const url = (remoteUrl || '').trim();
  if (!url || !isTauri() || !/^https?:\/\//i.test(url)) {
    return { displayUrl: url, localPath: '', downloaded: false };
  }
  try {
    const res = await downloadImage(url);
    const asset = await toAssetUrl(res.path);
    return { displayUrl: asset, localPath: res.path, downloaded: true };
  } catch {
    // Offline or failed → remember it for a later retry.
    try {
      await executeQuery(
        `INSERT INTO image_download_queue (produit_id, image_url, status)
         VALUES (?, ?, 'pending')`,
        [produitId ?? null, url],
      );
    } catch {
      /* best-effort; ignore queue errors */
    }
    return { displayUrl: url, localPath: '', downloaded: false };
  }
}

// ---------------------------------------------------------------------------
// Retry queue — re-download images that failed while offline
// ---------------------------------------------------------------------------

interface QueueRow {
  id: number;
  produit_id: number | null;
  image_url: string;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
let queueRunning = false;

/**
 * Process the pending image-download queue. Safe to call repeatedly (guards
 * against concurrent runs). For each pending row it tries to download the
 * image; on success it saves the local path onto the matching product(s) and
 * marks the row done; on failure it increments the attempt counter and gives
 * up after MAX_ATTEMPTS.
 *
 * Returns the number of images successfully downloaded this run.
 */
export async function processImageQueue(): Promise<number> {
  if (!isTauri() || queueRunning) return 0;
  queueRunning = true;
  let ok = 0;
  try {
    const rows = await fetchRows<QueueRow>(
      `SELECT id, produit_id, image_url, attempts
       FROM image_download_queue
       WHERE status = 'pending' AND attempts < ?
       ORDER BY id
       LIMIT 50`,
      [MAX_ATTEMPTS],
    );

    for (const row of rows) {
      try {
        const res = await downloadImage(row.image_url);
        const asset = await toAssetUrl(res.path);

        // Attach to the product: by id when known, else by matching the
        // remote URL still stored in image_url.
        if (row.produit_id != null) {
          await executeQuery(
            `UPDATE produits SET image_local = ?, image_url = ? WHERE id = ?`,
            [res.path, asset, row.produit_id],
          );
        } else {
          await executeQuery(
            `UPDATE produits SET image_local = ?, image_url = ? WHERE image_url = ?`,
            [res.path, asset, row.image_url],
          );
        }

        await executeQuery(
          `UPDATE image_download_queue
           SET status = 'done', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [row.id],
        );
        ok += 1;
      } catch (e: any) {
        const attempts = row.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await executeQuery(
          `UPDATE image_download_queue
           SET attempts = ?, status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [attempts, status, String(e?.message ?? e).slice(0, 300), row.id],
        );
      }
    }
  } catch {
    /* ignore queue-level errors; will retry next tick */
  } finally {
    queueRunning = false;
  }
  return ok;
}

/** Number of images still waiting to be downloaded. */
export async function pendingImageCount(): Promise<number> {
  if (!isTauri()) return 0;
  const rows = await fetchRows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM image_download_queue WHERE status = 'pending'`,
  );
  return rows[0]?.n ?? 0;
}

/**
 * Start a lightweight background loop that drains the image queue whenever
 * the browser reports connectivity, and periodically as a fallback. Returns
 * a cleanup function. No-op outside Tauri.
 */
export function startImageQueueWorker(intervalMs = 60_000): () => void {
  if (!isTauri()) return () => {};

  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void processImageQueue();
  };

  // Run soon after startup, then on an interval, and on reconnect.
  const startId = setTimeout(tick, 3_000);
  timer = setInterval(tick, intervalMs);
  const onOnline = () => tick();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }

  return () => {
    clearTimeout(startId);
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
  };
}
