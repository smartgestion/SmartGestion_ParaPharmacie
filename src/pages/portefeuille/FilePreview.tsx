import { useEffect, useState, useRef, useCallback, type WheelEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download, FileText, X, ZoomIn, ZoomOut, Maximize2, RotateCw, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogPortal } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface PortefeuilleFile {
  id: number;
  nom: string;
  folder_id: number | null;
  mime_type?: string | null;
  extension?: string | null;
  size_bytes?: number;
  url?: string | null;
  data?: string | null;
  is_favorite?: number | boolean;
  created_at?: string;
}

interface FilePreviewProps {
  file: PortefeuilleFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: PortefeuilleFile) => void;
  onRename?: (file: PortefeuilleFile) => void;
}

/** The best available source for the file bytes: cloud URL or base64 data URL. */
function sourceOf(file: PortefeuilleFile): string {
  return file.data || file.url || '';
}

function isImage(file: PortefeuilleFile): boolean {
  const mt = (file.mime_type || '').toLowerCase();
  const ext = (file.extension || '').toLowerCase();
  return mt.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

function isPdf(file: PortefeuilleFile): boolean {
  const mt = (file.mime_type || '').toLowerCase();
  return mt === 'application/pdf' || (file.extension || '').toLowerCase() === 'pdf';
}

function isText(file: PortefeuilleFile): boolean {
  const mt = (file.mime_type || '').toLowerCase();
  const ext = (file.extension || '').toLowerCase();
  return mt.startsWith('text/') || ['txt', 'csv', 'md', 'json', 'log'].includes(ext);
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function FilePreview({ file, isOpen, onClose, onDownload, onRename }: FilePreviewProps) {
  const { t } = useTranslation();
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  // Image zoom / pan / rotate state.
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; ox: number; oy: number }>({
    dragging: false, startX: 0, startY: 0, ox: 0, oy: 0,
  });

  const image = file ? isImage(file) : false;
  const pdf = file ? isPdf(file) : false;
  const text = file ? isText(file) : false;

  // Reset view state whenever a new file is opened.
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, [file?.id, isOpen]);

  useEffect(() => {
    let cancelled = false;
    setTextContent(null);
    if (file && isOpen && isText(file)) {
      const src = sourceOf(file);
      if (src) {
        setLoadingText(true);
        fetch(src)
          .then((r) => r.text())
          .then((txt) => { if (!cancelled) setTextContent(txt); })
          .catch(() => { if (!cancelled) setTextContent(null); })
          .finally(() => { if (!cancelled) setLoadingText(false); });
      }
    }
    return () => { cancelled = true; };
  }, [file, isOpen]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))), []);
  const resetView = useCallback(() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); }, []);
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  // Ctrl/⌘ + wheel zoom on images.
  const onWheel = useCallback((e: WheelEvent) => {
    if (!image) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => {
        const next = e.deltaY < 0 ? z + ZOOM_STEP : z - ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +next.toFixed(2)));
      });
    }
  }, [image]);

  const onMouseDown = (e: MouseEvent) => {
    if (!image || zoom <= 1) return;
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: MouseEvent) => {
    const d = dragState.current;
    if (!d.dragging) return;
    setOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) });
  };
  const endDrag = () => { dragState.current.dragging = false; };

  // Keyboard shortcuts while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!image) return;
      if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, image, zoomIn, zoomOut, resetView, onClose]);

  if (!file) return null;

  const src = sourceOf(file);
  const canZoom = image;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        {/* Full-screen overlay + panel (bypasses the default centered/max-width
            DialogContent so the preview fills the whole window). */}
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm animate-in fade-in duration-150">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 h-14 shrink-0 border-b border-white/10 bg-slate-950/60 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-sm font-medium truncate">{file.nom}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canZoom && (
                <div className="flex items-center gap-1 me-1 rounded-[6px] bg-white/5 p-0.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:!bg-white/15 hover:!text-white" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title={t('portefeuille.preview.zoom_out')}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <button
                    className="min-w-[52px] text-center text-xs font-medium tabular-nums hover:bg-white/10 rounded px-1 py-1.5"
                    onClick={resetView}
                    title={t('portefeuille.preview.reset')}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:!bg-white/15 hover:!text-white" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title={t('portefeuille.preview.zoom_in')}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:!bg-white/15 hover:!text-white" onClick={rotate} title={t('portefeuille.preview.rotate')}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:!bg-white/15 hover:!text-white" onClick={resetView} title={t('portefeuille.preview.fit')}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {onRename && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-[4px] text-white hover:!bg-white/15 hover:!text-white"
                  onClick={() => onRename(file)}
                >
                  <Pencil className="h-4 w-4 me-1.5" />
                  <span className="hidden sm:inline">{t('portefeuille.actions.rename')}</span>
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 rounded-[4px] bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white border-0 shadow-none"
                onClick={() => onDownload(file)}
              >
                <Download className="h-4 w-4 me-1.5" />
                <span className="hidden sm:inline">{t('portefeuille.actions.download')}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:!bg-white/15 hover:!text-white"
                onClick={onClose}
                title={t('shared.actions.close')}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div
            className="flex-1 min-h-0 overflow-hidden"
            onWheel={onWheel}
          >
            {image ? (
              <div
                className={cn(
                  'w-full h-full flex items-center justify-center overflow-hidden select-none',
                  zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                )}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onDoubleClick={() => (zoom > 1 ? resetView() : setZoom(2))}
              >
                <img
                  src={src}
                  alt={file.nom}
                  draggable={false}
                  className="max-w-full max-h-full object-contain transition-transform duration-75 will-change-transform"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            ) : pdf ? (
              <iframe title={file.nom} src={src} className="w-full h-full border-0 bg-white" />
            ) : text ? (
              <div className="w-full h-full overflow-auto p-6 bg-slate-100 dark:bg-slate-900">
                {loadingText ? (
                  <p className="text-sm text-muted-foreground text-center py-12">{t('portefeuille.preview.loading')}</p>
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-sm font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 rounded-[6px] p-4 border border-slate-200 dark:border-white/10 max-w-4xl mx-auto">
                    {textContent}
                  </pre>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="bg-white/10 rounded-[8px] p-5 border border-white/10">
                  <FileText className="h-10 w-10 text-slate-300" />
                </div>
                <p className="text-sm text-slate-300">{t('portefeuille.preview.no_preview')}</p>
                <Button variant="outline" className="rounded-[4px] bg-white/5 text-white border-white/20 hover:bg-white/10" onClick={() => onDownload(file)}>
                  <Download className="h-4 w-4 me-2" />
                  {t('portefeuille.preview.download_instead')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
