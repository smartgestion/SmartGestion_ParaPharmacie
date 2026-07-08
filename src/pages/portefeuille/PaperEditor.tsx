import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, Eraser,
  Printer, FileDown, Check, Loader2, FileType2, Save, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export interface PortefeuillePaper {
  id: number;
  titre: string;
  folder_id: number | null;
  content: string;
  is_favorite?: number | boolean;
  created_at?: string;
  updated_at?: string;
}

interface PaperEditorProps {
  paper: PortefeuillePaper;
  onBack: () => void;
  /** Notify the parent when title/content changed so its list can refresh. */
  onSaved?: (updated: PortefeuillePaper) => void;
}

type SaveState = 'idle' | 'saving' | 'saved';

/** Toolbar button wrapper. */
function TB({
  onClick, title, active, children,
}: {
  onClick: () => void; title: string; active?: boolean; children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep the caret/selection
      onClick={onClick}
      className={cn(
        'h-8 w-8 rounded-[4px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5',
        active && 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white',
      )}
    >
      {children}
    </Button>
  );
}

export function PaperEditor({ paper, onBack, onSaved }: PaperEditorProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(paper.titre);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Load initial content into the contentEditable once.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = paper.content || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id]);

  const saving = useRef(false);

  const doSave = useCallback(async () => {
    if (!user?.id) return;
    // Guard against overlapping autosaves (debounce flush + unmount flush).
    if (saving.current) return;
    saving.current = true;
    const html = editorRef.current?.innerHTML ?? '';
    const nextTitle = title.trim() || t('portefeuille.paper.untitled');
    setSaveState('saving');
    try {
      const { error } = await supabase
        .from('portefeuille_papers')
        .update({
          titre: nextTitle,
          content: html,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paper.id)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message || 'update failed');
      dirty.current = false;
      setSaveState('saved');
      setLastSavedAt(
        new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      );
      try { onSaved?.({ ...paper, titre: nextTitle, content: html }); } catch { /* parent refresh is best-effort */ }
    } catch (e) {
      console.error('[portefeuille] paper save failed:', e);
      setSaveState('idle');
      toast.error(t('portefeuille.paper.save_error'));
    } finally {
      saving.current = false;
    }
  }, [user?.id, title, paper, onSaved, t]);

  // Debounced autosave whenever content or title changes.
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void doSave();
    }, 1200);
  }, [doSave]);

  // Autosave title edits too.
  useEffect(() => {
    if (title !== paper.titre) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Flush pending save on unmount / navigating away.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) void doSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirty.current) await doSave();
    onBack();
  };

  /** Manual save — cancels the pending debounce and saves immediately. */
  const saveNow = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await doSave();
    toast.success(t('portefeuille.toast.saved'));
  };

  const exec = (command: string, value?: string) => {
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    scheduleSave();
  };

  /** Build a standalone printable HTML document from the current content. */
  const buildPrintDoc = (): string => {
    const html = editorRef.current?.innerHTML ?? '';
    const safeTitle = (title.trim() || t('portefeuille.paper.untitled'))
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 40px; line-height: 1.6; }
  h1.__doc_title { font-size: 24px; margin: 0 0 24px; border-bottom: 2px solid #10b981; padding-bottom: 12px; }
  .__doc_body { font-size: 14px; }
  .__doc_body ul, .__doc_body ol { padding-inline-start: 24px; }
  @page { margin: 20mm; }
</style></head>
<body>
  <h1 class="__doc_title">${safeTitle}</h1>
  <div class="__doc_body">${html}</div>
</body></html>`;
  };

  /**
   * Print via a hidden same-document <iframe>.
   *
   * `window.open()` is blocked inside the Tauri webview (no popups), which is
   * why the old popup-based print/export silently failed. An off-screen iframe
   * whose `contentWindow.print()` we call works in both the browser and the
   * desktop shell. In the print dialog the user can pick a physical printer or
   * "Save as PDF" / "Microsoft Print to PDF".
   */
  const printViaIframe = () => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        toast.error(t('portefeuille.toast.action_error'));
        return;
      }
      doc.open();
      doc.write(buildPrintDoc());
      doc.close();

      const trigger = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('[portefeuille] print failed:', e);
          toast.error(t('portefeuille.toast.action_error'));
        }
        // Remove the iframe after the dialog has had time to open.
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      };

      // Wait for the iframe document to lay out before printing.
      if (iframe.contentWindow) {
        iframe.contentWindow.onload = trigger;
      }
      setTimeout(trigger, 300);
    } catch (e) {
      console.error('[portefeuille] print setup failed:', e);
      toast.error(t('portefeuille.toast.action_error'));
    }
  };

  const handlePrint = () => printViaIframe();

  /**
   * Export the document directly to a downloadable PDF file.
   *
   * We render an off-screen A4-width clone of the document (title + content)
   * with html2canvas, then place it into a jsPDF A4 page — slicing across
   * multiple pages when the content is taller than one page. This produces a
   * real `.pdf` download in one click, working in both the browser and the
   * Tauri desktop shell (no print dialog, no popup).
   */
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    const html = editorRef.current?.innerHTML ?? '';
    const safeTitle = title.trim() || t('portefeuille.paper.untitled');

    // Build an off-screen render surface sized to A4 width (@96dpi ≈ 794px),
    // with print-like padding. Kept in the DOM (off-screen) so fonts/layout
    // resolve exactly as on screen.
    const surface = document.createElement('div');
    surface.style.position = 'fixed';
    surface.style.left = '-10000px';
    surface.style.top = '0';
    surface.style.width = '794px';
    surface.style.padding = '56px';
    surface.style.background = '#ffffff';
    surface.style.color = '#1e293b';
    surface.style.fontFamily = 'Arial, Helvetica, sans-serif';
    surface.style.fontSize = '15px';
    surface.style.lineHeight = '1.6';
    surface.innerHTML =
      `<h1 style="font-size:24px;font-weight:700;margin:0 0 20px;border-bottom:2px solid #10b981;padding-bottom:10px;">` +
      `${safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>` +
      `<div class="__pdf_body">${html}</div>`;
    // Normalise list indentation inside the clone.
    surface.querySelectorAll('ul,ol').forEach((el) => {
      (el as HTMLElement).style.paddingInlineStart = '24px';
    });
    document.body.appendChild(surface);

    try {
      const canvas = await html2canvas(surface, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      // Image scaled to the full page width; height derived from aspect ratio.
      const imgH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      // Add extra pages by shifting the same tall image upward.
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }

      const fileName = (safeTitle.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document') + '.pdf';
      pdf.save(fileName);
      toast.success(t('portefeuille.toast.downloaded', { name: fileName }));
    } catch (e) {
      console.error('[portefeuille] export pdf failed:', e);
      toast.error(t('portefeuille.toast.action_error'));
    } finally {
      if (surface.parentNode) surface.parentNode.removeChild(surface);
      setExportingPdf(false);
    }
  };

  /**
   * Export as a real Microsoft Word document (.doc).
   *
   * We wrap the editor HTML in a Word-flavoured HTML container with the
   * `application/msword` MIME type. Word opens this natively as an editable
   * document — no external library required, and it works identically in the
   * browser and the Tauri desktop shell.
   */
  const handleExportWord = () => {
    try {
      const html = editorRef.current?.innerHTML ?? '';
      const safeTitle = (title.trim() || t('portefeuille.paper.untitled'));
      const escTitle = safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doc =
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
        `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
        `<head><meta charset="utf-8"><title>${escTitle}</title>` +
        `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>` +
        `<w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->` +
        `<style>` +
        `@page { size: A4; margin: 2cm; }` +
        `body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }` +
        `h1 { font-size: 20pt; } h2 { font-size: 15pt; }` +
        `h1.__title { border-bottom: 1.5pt solid #10b981; padding-bottom: 6pt; margin-bottom: 14pt; }` +
        `ul, ol { margin-left: 18pt; }` +
        `</style></head>` +
        `<body><h1 class="__title">${escTitle}</h1>${html}</body></html>`;

      const blob = new Blob(['\ufeff', doc], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fileName = (safeTitle.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document') + '.doc';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(t('portefeuille.toast.downloaded', { name: fileName }));
    } catch (e) {
      console.error('[portefeuille] export word failed:', e);
      toast.error(t('portefeuille.toast.action_error'));
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleBack} title={t('portefeuille.paper.back')}>
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            {saveState === 'saving' && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('portefeuille.paper.saving')}
              </>
            )}
            {saveState === 'saved' && (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                {lastSavedAt
                  ? t('portefeuille.paper.saved_at', { time: lastSavedAt })
                  : t('portefeuille.paper.saved')}
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-9 rounded-[4px] bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-none"
            onClick={saveNow}
            disabled={saveState === 'saving'}
          >
            {saveState === 'saving'
              ? <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              : <Save className="h-4 w-4 me-1.5" />}
            {t('portefeuille.paper.save')}
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-[4px]" onClick={handlePrint}>
            <Printer className="h-4 w-4 me-1.5" />
            {t('portefeuille.actions.print')}
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-[4px]" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf
              ? <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              : <FileDown className="h-4 w-4 me-1.5" />}
            {t('portefeuille.actions.export_pdf')}
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-[4px] bg-[#2b579a] hover:bg-[#1f4272] text-white border-0 shadow-none"
            onClick={handleExportWord}
          >
            <FileType2 className="h-4 w-4 me-1.5" />
            {t('portefeuille.paper.export_word')}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-[6px] border border-slate-200 bg-white p-1 dark:bg-slate-900/60 dark:border-white/10 sticky top-0 z-10">
        <TB title={t('portefeuille.paper.bold')} onClick={() => exec('bold')}><Bold className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.italic')} onClick={() => exec('italic')}><Italic className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.underline')} onClick={() => exec('underline')}><Underline className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.strike')} onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></TB>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />
        <TB title={t('portefeuille.paper.h1')} onClick={() => exec('formatBlock', 'H1')}><Heading1 className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.h2')} onClick={() => exec('formatBlock', 'H2')}><Heading2 className="h-4 w-4" /></TB>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />
        <TB title={t('portefeuille.paper.bullet_list')} onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.ordered_list')} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></TB>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />
        <TB title={t('portefeuille.paper.align_left')} onClick={() => exec('justifyLeft')}><AlignLeft className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.align_center')} onClick={() => exec('justifyCenter')}><AlignCenter className="h-4 w-4" /></TB>
        <TB title={t('portefeuille.paper.align_right')} onClick={() => exec('justifyRight')}><AlignRight className="h-4 w-4" /></TB>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />
        <TB title={t('portefeuille.paper.clear_format')} onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></TB>
      </div>

      {/* Word-like document sheet: an A4-ish white page holding the title
          field and the editable body, centred on a soft grey backdrop. */}
      <div className="rounded-[8px] bg-slate-100 dark:bg-slate-950/40 p-4 sm:p-8">
        <div className="mx-auto w-full max-w-3xl bg-white dark:bg-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_10px_30px_-12px_rgba(0,0,0,0.2)] rounded-[2px] border border-slate-200/70 dark:border-white/10 min-h-[70vh] px-8 sm:px-14 py-10">
          {/* Title field inside the sheet — the pencil makes it obvious the
              title is editable/renameable and focuses the field on click. */}
          <div className="group/title flex items-center gap-2 mb-6 border-b-2 border-transparent focus-within:border-emerald-400 transition-colors">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('portefeuille.paper.title_ph')}
              className="flex-1 min-w-0 bg-transparent outline-none border-0 pb-2 text-2xl font-bold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
            <button
              type="button"
              title={t('portefeuille.actions.rename')}
              onClick={() => {
                const el = titleRef.current;
                if (el) { el.focus(); el.select(); }
              }}
              className="shrink-0 mb-1.5 flex items-center justify-center h-8 w-8 rounded-[6px] text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 opacity-60 group-hover/title:opacity-100 focus-within/title:opacity-100 transition-all"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>

          {/* Editable body */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={scheduleSave}
            data-placeholder={t('portefeuille.paper.content_ph')}
            className={cn(
              'pf-paper-editor min-h-[50vh] text-[15px] leading-7 text-slate-700 dark:text-slate-200 outline-none',
              '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2',
              '[&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6',
              'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none',
            )}
          />
        </div>
      </div>
    </div>
  );
}
