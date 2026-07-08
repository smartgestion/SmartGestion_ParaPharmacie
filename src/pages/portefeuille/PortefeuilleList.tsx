import { useEffect, useState, useMemo, useCallback, useRef, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderPlus, Upload, FilePlus, Search, Folder, FileText, File as FileIcon,
  Image as ImageIcon, FileSpreadsheet, MoreVertical, Star, ChevronRight,
  Home, Loader2, FolderArchive, Download, Eye, Pencil, FolderInput, Trash2,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { FilePreview, type PortefeuilleFile } from './FilePreview'
import { PaperEditor, type PortefeuillePaper } from './PaperEditor'

interface PortefeuilleFolder {
  id: number;
  nom: string;
  parent_id: number | null;
  is_favorite?: number | boolean;
  created_at?: string;
}

const MAX_UPLOAD = 15 * 1024 * 1024; // 15 MB per file

type ItemKind = 'folder' | 'file' | 'paper';

interface Row {
  kind: ItemKind;
  id: number;
  name: string;
  folder?: PortefeuilleFolder;
  file?: PortefeuilleFile;
  paper?: PortefeuillePaper;
  favorite: boolean;
  size?: number;
  date?: string;
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function extensionOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function fileIcon(ext: string) {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return ImageIcon;
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
  return FileIcon;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --------------------------------------------------------------------------
// component
// --------------------------------------------------------------------------

export function PortefeuilleList() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [folders, setFolders] = useState<PortefeuilleFolder[]>([]);
  const [files, setFiles] = useState<PortefeuilleFile[]>([]);
  const [papers, setPapers] = useState<PortefeuillePaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'all' | 'favorites' | 'recent'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Dialogs
  const [nameDialog, setNameDialog] = useState<{
    mode: 'new-folder' | 'rename-folder' | 'rename-file' | 'rename-paper';
    id?: number;
    value: string;
  } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ kind: ItemKind; id: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: ItemKind; id: number } | null>(null);

  // Preview / editor
  const [previewFile, setPreviewFile] = useState<PortefeuilleFile | null>(null);
  const [editingPaper, setEditingPaper] = useState<PortefeuillePaper | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- data loading -------------------------------------------------------

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setFolders([]); setFiles([]); setPapers([]); setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [f, fi, p] = await Promise.all([
        supabase.from('portefeuille_folders').select('*').eq('user_id', user.id).order('nom', { ascending: true }),
        supabase.from('portefeuille_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('portefeuille_papers').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);
      if (f.error || fi.error || p.error) {
        toast.error(t('portefeuille.toast.load_error'));
      }
      setFolders(f.data || []);
      setFiles(fi.data || []);
      setPapers(p.data || []);
    } catch {
      toast.error(t('portefeuille.toast.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    if (user?.id) fetchAll();
  }, [user?.id, fetchAll]);

  // ---- breadcrumb ---------------------------------------------------------

  const breadcrumb = useMemo(() => {
    const chain: PortefeuilleFolder[] = [];
    let cur = folders.find((x) => x.id === currentFolderId) || null;
    const guard = new Set<number>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      chain.unshift(cur);
      cur = folders.find((x) => x.id === cur!.parent_id) || null;
    }
    return chain;
  }, [folders, currentFolderId]);

  // ---- current view rows --------------------------------------------------

  const searching = searchQuery.trim().length > 0;
  const q = searchQuery.trim().toLowerCase();

  // Favorites & Recent are cross-folder "smart" views; the folder breadcrumb
  // and folder-scoping are ignored while one of them is active. Searching also
  // spans every folder regardless of the current view.
  const flatView = view !== 'all' || searching;

  const rows = useMemo<Row[]>(() => {
    const bool = (v: number | boolean | undefined) => v === 1 || v === true;
    const ts = (d?: string) => (d ? new Date(d).getTime() : 0);

    let fRows = folders.map<Row>((f) => ({
      kind: 'folder', id: f.id, name: f.nom, folder: f,
      favorite: bool(f.is_favorite), date: f.created_at,
    }));
    let fiRows = files.map<Row>((f) => ({
      kind: 'file', id: f.id, name: f.nom, file: f,
      favorite: bool(f.is_favorite), size: f.size_bytes, date: f.created_at,
    }));
    let pRows = papers.map<Row>((p) => ({
      kind: 'paper', id: p.id, name: p.titre, paper: p,
      favorite: bool(p.is_favorite), date: p.updated_at || p.created_at,
    }));

    let all = [...fRows, ...fiRows, ...pRows];

    // Text search spans all folders.
    if (searching) {
      all = all.filter((r) => r.name.toLowerCase().includes(q));
    }

    if (view === 'favorites') {
      // Only favorited items, newest first.
      all = all.filter((r) => r.favorite).sort((a, b) => ts(b.date) - ts(a.date));
      return all;
    }

    if (view === 'recent') {
      // Files & papers only (folders aren't "documents"), 20 most recent.
      all = all
        .filter((r) => r.kind !== 'folder')
        .sort((a, b) => ts(b.date) - ts(a.date))
        .slice(0, 20);
      return all;
    }

    // Default "all" view: keep the current-folder scoping unless searching.
    if (!searching) {
      all = all.filter((r) => {
        if (r.kind === 'folder') return (r.folder!.parent_id ?? null) === currentFolderId;
        if (r.kind === 'file') return (r.file!.folder_id ?? null) === currentFolderId;
        return (r.paper!.folder_id ?? null) === currentFolderId;
      });
    }
    return all;
  }, [folders, files, papers, currentFolderId, searching, q, view]);

  const folderRows = rows.filter((r) => r.kind === 'folder');
  const itemRows = rows.filter((r) => r.kind !== 'folder');

  // ---- mutations ----------------------------------------------------------

  const createFolder = async (nom: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from('portefeuille_folders').insert([{
      nom, parent_id: currentFolderId, user_id: user.id,
    }]);
    if (error) {
      console.error('[portefeuille] createFolder failed:', error);
      return toast.error(t('portefeuille.toast.action_error'));
    }
    toast.success(t('portefeuille.toast.folder_created'));
    fetchAll();
  };

  const rename = async (kind: ItemKind, id: number, value: string) => {
    if (!user?.id) return;
    const table = kind === 'folder' ? 'portefeuille_folders'
      : kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
    const col = kind === 'paper' ? 'titre' : 'nom';
    const { error } = await supabase.from(table)
      .update({ [col]: value, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id);
    if (error) return toast.error(t('portefeuille.toast.action_error'));
    toast.success(t('portefeuille.toast.renamed'));
    fetchAll();
  };

  const move = async (kind: ItemKind, id: number, target: number | null) => {
    if (!user?.id) return;
    const table = kind === 'folder' ? 'portefeuille_folders'
      : kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
    const col = kind === 'folder' ? 'parent_id' : 'folder_id';
    // Prevent moving a folder into itself.
    if (kind === 'folder' && target === id) return;
    const { error } = await supabase.from(table)
      .update({ [col]: target, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id);
    if (error) return toast.error(t('portefeuille.toast.action_error'));
    toast.success(t('portefeuille.toast.moved'));
    fetchAll();
  };

  /** Recursively collect a folder and all its descendants. */
  const descendantFolderIds = useCallback((rootId: number): number[] => {
    const ids = [rootId];
    let frontier = [rootId];
    while (frontier.length) {
      const next: number[] = [];
      for (const f of folders) {
        if (f.parent_id != null && frontier.includes(f.parent_id)) {
          ids.push(f.id);
          next.push(f.id);
        }
      }
      frontier = next;
    }
    return ids;
  }, [folders]);

  const remove = async (kind: ItemKind, id: number) => {
    if (!user?.id) return;
    try {
      if (kind === 'folder') {
        // Cascade manually so the local SQLite backend (no ON DELETE CASCADE
        // guarantees for existing rows) stays consistent with the cloud one.
        const ids = descendantFolderIds(id);
        for (const fid of ids) {
          await supabase.from('portefeuille_files').delete().eq('folder_id', fid).eq('user_id', user.id);
          await supabase.from('portefeuille_papers').delete().eq('folder_id', fid).eq('user_id', user.id);
        }
        // Delete child folders deepest-first, then the root.
        for (const fid of ids.slice(1).reverse()) {
          await supabase.from('portefeuille_folders').delete().eq('id', fid).eq('user_id', user.id);
        }
        await supabase.from('portefeuille_folders').delete().eq('id', id).eq('user_id', user.id);
      } else {
        const table = kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
        await supabase.from(table).delete().eq('id', id).eq('user_id', user.id);
      }
      toast.success(t('portefeuille.toast.deleted'));
      fetchAll();
    } catch {
      toast.error(t('portefeuille.toast.action_error'));
    }
  };

  const toggleFavorite = async (row: Row) => {
    if (!user?.id) return;
    const table = row.kind === 'folder' ? 'portefeuille_folders'
      : row.kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
    const { error } = await supabase.from(table)
      .update({ is_favorite: row.favorite ? 0 : 1 })
      .eq('id', row.id).eq('user_id', user.id);
    if (error) return toast.error(t('portefeuille.toast.action_error'));
    fetchAll();
  };

  const createPaper = async () => {
    if (!user?.id) return;
    const titre = t('portefeuille.paper.untitled');
    try {
      const { data, error } = await supabase.from('portefeuille_papers').insert([{
        titre, content: '', folder_id: currentFolderId, user_id: user.id,
      }]).select().single();
      if (error) throw new Error(error.message || 'insert failed');

      toast.success(t('portefeuille.toast.paper_created'));
      await fetchAll();

      // The local adapter returns the freshly-inserted row from `.select().single()`.
      // If for any reason it didn't, fall back to the most recent paper we just fetched.
      let created = data as PortefeuillePaper | null;
      if (!created?.id) {
        const { data: latest } = await supabase
          .from('portefeuille_papers')
          .select('*')
          .eq('user_id', user.id)
          .order('id', { ascending: false })
          .limit(1);
        created = (Array.isArray(latest) ? latest[0] : null) as PortefeuillePaper | null;
      }
      if (created?.id) setEditingPaper(created);
    } catch (e) {
      console.error('[portefeuille] createPaper failed:', e);
      toast.error(t('portefeuille.toast.action_error'));
    }
  };

  // ---- upload -------------------------------------------------------------

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!user?.id) return;
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setIsUploading(true);
    let ok = 0;
    let usedBase64 = false;
    for (const file of arr) {
      if (file.size > MAX_UPLOAD) {
        toast.error(t('portefeuille.upload.too_large', { size: (MAX_UPLOAD / 1024 / 1024).toFixed(0) }));
        continue;
      }
      const ext = extensionOf(file.name);
      let url: string | null = null;
      let data: string | null = null;
      try {
        const path = `portefeuille/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`;
        const res = await supabase.storage.from('product-images').upload(path, file, {
          upsert: true, contentType: file.type || undefined,
        });
        if (res.error) throw res.error;
        const pub = supabase.storage.from('product-images').getPublicUrl(path);
        url = pub.data.publicUrl;
      } catch {
        // Offline / no bucket → store as base64 data URL in the DB.
        try {
          data = await readAsDataURL(file);
          usedBase64 = true;
        } catch {
          toast.error(t('portefeuille.upload.error'));
          continue;
        }
      }
      const { error } = await supabase.from('portefeuille_files').insert([{
        nom: file.name,
        folder_id: currentFolderId,
        mime_type: file.type || null,
        extension: ext || null,
        size_bytes: file.size,
        url,
        data,
        user_id: user.id,
      }]);
      if (error) {
        toast.error(t('portefeuille.upload.error'));
      } else {
        ok++;
      }
    }
    setIsUploading(false);
    if (ok > 0) {
      toast.success(usedBase64 ? t('portefeuille.upload.success_offline') : t('portefeuille.upload.success'));
      fetchAll();
    }
  }, [user?.id, currentFolderId, t, fetchAll]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const downloadFile = (file: PortefeuilleFile) => {
    const src = file.data || file.url;
    if (!src) {
      toast.error(t('portefeuille.toast.action_error'));
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = src;
      a.download = file.nom;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t('portefeuille.toast.downloaded', { name: file.nom }));
    } catch {
      toast.error(t('portefeuille.toast.action_error'));
    }
  };

  // ---- destinations for the Move dialog -----------------------------------

  const moveDestinations = useMemo(() => {
    if (!moveDialog) return [];
    // When moving a folder, exclude itself and its descendants.
    const excluded = moveDialog.kind === 'folder'
      ? new Set(descendantFolderIds(moveDialog.id))
      : new Set<number>();
    return folders.filter((f) => !excluded.has(f.id));
  }, [moveDialog, folders, descendantFolderIds]);

  // ---- paper editor view --------------------------------------------------

  if (editingPaper) {
    return (
      <PaperEditor
        paper={editingPaper}
        onBack={() => { setEditingPaper(null); fetchAll(); }}
        onSaved={(u) => setPapers((prev) => prev.map((p) => (p.id === u.id ? { ...p, ...u } : p)))}
      />
    );
  }

  // ---- render helpers -----------------------------------------------------

  const RowActions = ({ row }: { row: Row }) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <Button {...props} variant="ghost" size="icon" className="h-8 w-8 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-48">
        {row.kind === 'file' && (
          <>
            <DropdownMenuItem onClick={() => setPreviewFile(row.file!)}>
              <Eye className="h-4 w-4" /> {t('portefeuille.actions.preview')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadFile(row.file!)}>
              <Download className="h-4 w-4" /> {t('portefeuille.actions.download')}
            </DropdownMenuItem>
          </>
        )}
        {row.kind === 'paper' && (
          <DropdownMenuItem onClick={() => setEditingPaper(row.paper!)}>
            <Eye className="h-4 w-4" /> {t('portefeuille.actions.open')}
          </DropdownMenuItem>
        )}
        {row.kind === 'folder' && (
          <DropdownMenuItem onClick={() => { setCurrentFolderId(row.id); setSearchQuery(''); setView('all'); }}>
            <Folder className="h-4 w-4" /> {t('portefeuille.actions.open')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => toggleFavorite(row)}>
          <Star className={cn('h-4 w-4', row.favorite && 'fill-amber-400 text-amber-400')} />
          {row.favorite ? t('portefeuille.actions.unfavorite') : t('portefeuille.actions.favorite')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setNameDialog({
          mode: row.kind === 'folder' ? 'rename-folder' : row.kind === 'file' ? 'rename-file' : 'rename-paper',
          id: row.id, value: row.name,
        })}>
          <Pencil className="h-4 w-4" /> {t('portefeuille.actions.rename')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMoveDialog({ kind: row.kind, id: row.id })}>
          <FolderInput className="h-4 w-4" /> {t('portefeuille.actions.move')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ kind: row.kind, id: row.id })}>
          <Trash2 className="h-4 w-4" /> {t('portefeuille.actions.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const openRow = (row: Row) => {
    if (row.kind === 'folder') { setCurrentFolderId(row.id); setSearchQuery(''); setView('all'); }
    else if (row.kind === 'file') setPreviewFile(row.file!);
    else setEditingPaper(row.paper!);
  };

  const totalItems = folderRows.length + itemRows.length;

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-emerald-50 border border-emerald-200/50 dark:bg-emerald-500/10 dark:border-emerald-500/20 shrink-0">
            <FolderArchive className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">{t('portefeuille.page_title')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{t('portefeuille.page_subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="rounded-[4px] h-10" onClick={() => setNameDialog({ mode: 'new-folder', value: '' })}>
            <FolderPlus className="me-2 h-4 w-4" /> {t('portefeuille.new_folder')}
          </Button>
          <Button variant="outline" className="rounded-[4px] h-10" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
            {isUploading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
            {t('portefeuille.upload_file')}
          </Button>
          <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-[4px] h-10 shadow-none" onClick={createPaper}>
            <FilePlus className="me-2 h-4 w-4" /> {t('portefeuille.new_paper')}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      {/* Breadcrumb / view label */}
      <div className="flex items-center gap-1 text-sm flex-wrap min-w-0">
        {view === 'favorites' ? (
          <span className="flex items-center gap-1.5 px-2 py-1 text-foreground font-medium">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {t('portefeuille.favorites')}
          </span>
        ) : view === 'recent' ? (
          <span className="flex items-center gap-1.5 px-2 py-1 text-foreground font-medium">
            <Clock className="h-4 w-4 text-sky-500" /> {t('portefeuille.recent')}
          </span>
        ) : (
          <>
            <button
              className={cn('flex items-center gap-1.5 px-2 py-1 rounded-[4px] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors', currentFolderId === null ? 'text-foreground font-medium' : 'text-muted-foreground')}
              onClick={() => { setCurrentFolderId(null); setSearchQuery(''); }}
            >
              <Home className="h-4 w-4" /> {t('portefeuille.root')}
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 rtl:rotate-180 shrink-0" />
                <button
                  className={cn('px-2 py-1 rounded-[4px] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors truncate max-w-[160px]', f.id === currentFolderId ? 'text-foreground font-medium' : 'text-muted-foreground')}
                  onClick={() => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                >
                  {f.nom}
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* View tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="inline-flex items-center gap-0.5 rounded-[8px] border border-slate-200 bg-white p-0.5 dark:bg-slate-900/60 dark:border-white/10 self-start">
          {([
            { key: 'all', label: t('portefeuille.tabs.all'), icon: FolderArchive },
            { key: 'favorites', label: t('portefeuille.favorites'), icon: Star },
            { key: 'recent', label: t('portefeuille.recent'), icon: Clock },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setView(tab.key); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-colors',
                view === tab.key
                  ? 'bg-slate-100 text-foreground dark:bg-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-50 dark:hover:bg-white/5',
              )}
            >
              <tab.icon className={cn('h-4 w-4', tab.key === 'favorites' && view === tab.key && 'fill-amber-400 text-amber-400')} />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('portefeuille.search_ph')}
            className="ps-9 h-10 rounded-[4px] shadow-none text-sm"
          />
        </div>
      </div>

      {/* Body with drag & drop */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        className={cn(
          'relative rounded-[8px] border transition-colors min-h-[300px]',
          isDragging ? 'border-emerald-400 border-dashed bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-transparent',
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[8px] bg-white/70 dark:bg-slate-950/70 pointer-events-none">
            <Upload className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t('portefeuille.upload.drop_hint')}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-4">
            <div className="bg-slate-50 rounded-[8px] p-5 border border-slate-100 dark:bg-slate-900/40 dark:border-white/5">
              {view === 'favorites' ? (
                <Star className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              ) : view === 'recent' ? (
                <Clock className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              ) : (
                <FolderArchive className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              )}
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {searching
                ? t('portefeuille.empty_filtered')
                : view === 'favorites'
                  ? t('portefeuille.empty_favorites')
                  : view === 'recent'
                    ? t('portefeuille.empty_recent')
                    : t('portefeuille.empty_all')}
            </p>
            {!searching && view === 'all' && (
              <p className="text-xs text-muted-foreground max-w-sm">{t('portefeuille.empty_hint')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-6 p-1">
            {/* Folders grid */}
            {folderRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">{t('portefeuille.folders')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {folderRows.map((row) => (
                    <div
                      key={`folder-${row.id}`}
                      onDoubleClick={() => openRow(row)}
                      className="group relative flex items-center gap-3 rounded-[8px] border border-slate-200 bg-white p-3 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all dark:bg-slate-900/60 dark:border-white/10 dark:hover:border-emerald-500/30"
                      onClick={() => openRow(row)}
                    >
                      <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-amber-50 border border-amber-200/50 shrink-0 dark:bg-amber-500/10 dark:border-amber-500/20">
                        <Folder className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t('portefeuille.type_folder')}</p>
                      </div>
                      {row.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 absolute top-2 end-9" />}
                      <div onClick={(e) => e.stopPropagation()}><RowActions row={row} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files & papers list */}
            {itemRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                  {t('portefeuille.files')} &amp; {t('portefeuille.papers')}
                </p>
                <div className="rounded-[8px] border border-slate-200 bg-white overflow-hidden dark:bg-slate-900/60 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                  {itemRows.map((row) => {
                    const Icon = row.kind === 'paper' ? FileText : fileIcon(extensionOf(row.name));
                    return (
                      <div
                        key={`${row.kind}-${row.id}`}
                        onClick={() => openRow(row)}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        <div className={cn(
                          'flex items-center justify-center h-9 w-9 rounded-[6px] shrink-0 border',
                          row.kind === 'paper'
                            ? 'bg-sky-50 border-sky-200/50 dark:bg-sky-500/10 dark:border-sky-500/20'
                            : 'bg-emerald-50 border-emerald-200/50 dark:bg-emerald-500/10 dark:border-emerald-500/20',
                        )}>
                          <Icon className={cn('h-4 w-4', row.kind === 'paper' ? 'text-sky-500' : 'text-emerald-500')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
                            {row.favorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {row.kind === 'paper' ? t('portefeuille.type_paper') : (extensionOf(row.name).toUpperCase() || t('portefeuille.type_file'))}
                          </p>
                        </div>
                        <span className="hidden sm:block text-xs text-muted-foreground w-20 text-end shrink-0" dir="ltr">
                          {row.kind === 'file' ? formatSize(row.size) : '-'}
                        </span>
                        <span className="hidden md:block text-xs text-muted-foreground w-28 text-end shrink-0">
                          {row.date ? new Date(row.date).toLocaleDateString() : '-'}
                        </span>
                        <div onClick={(e) => e.stopPropagation()}><RowActions row={row} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Name dialog (create folder / rename) */}
      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'new-folder' ? t('portefeuille.dialog.new_folder_title') : t('portefeuille.dialog.rename_title')}
            </DialogTitle>
            <DialogDescription>
              {nameDialog?.mode === 'new-folder' ? t('portefeuille.dialog.new_folder_desc') : t('portefeuille.dialog.rename_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={nameDialog?.value ?? ''}
              placeholder={t('portefeuille.dialog.name_ph')}
              onChange={(e) => setNameDialog((d) => (d ? { ...d, value: e.target.value } : d))}
              onKeyDown={(e) => { if (e.key === 'Enter') (document.getElementById('pf-name-confirm') as HTMLButtonElement)?.click(); }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setNameDialog(null)}>{t('shared.actions.cancel')}</Button>
            <Button
              id="pf-name-confirm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={!nameDialog?.value.trim()}
              onClick={() => {
                if (!nameDialog) return;
                const val = nameDialog.value.trim();
                if (!val) return;
                if (nameDialog.mode === 'new-folder') createFolder(val);
                else if (nameDialog.mode === 'rename-folder') rename('folder', nameDialog.id!, val);
                else if (nameDialog.mode === 'rename-file') rename('file', nameDialog.id!, val);
                else rename('paper', nameDialog.id!, val);
                setNameDialog(null);
              }}
            >
              {nameDialog?.mode === 'new-folder' ? t('portefeuille.dialog.create') : t('portefeuille.dialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveDialog} onOpenChange={(o) => !o && setMoveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('portefeuille.dialog.move_title')}</DialogTitle>
            <DialogDescription>{t('portefeuille.dialog.move_desc')}</DialogDescription>
          </DialogHeader>
          <div className="py-1 max-h-[45vh] overflow-y-auto space-y-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-[6px] text-sm hover:bg-slate-100 dark:hover:bg-white/5 text-start"
              onClick={() => { if (moveDialog) { move(moveDialog.kind, moveDialog.id, null); setMoveDialog(null); } }}
            >
              <Home className="h-4 w-4 text-slate-400" /> {t('portefeuille.dialog.move_root')}
            </button>
            {moveDestinations.map((f) => (
              <button
                key={f.id}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[6px] text-sm hover:bg-slate-100 dark:hover:bg-white/5 text-start"
                onClick={() => { if (moveDialog) { move(moveDialog.kind, moveDialog.id, f.id); setMoveDialog(null); } }}
              >
                <Folder className="h-4 w-4 text-amber-500" /> {f.nom}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveDialog(null)}>{t('shared.actions.cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) remove(deleteTarget.kind, deleteTarget.id); }}
        title={
          deleteTarget?.kind === 'folder' ? t('portefeuille.confirm_delete.folder_title')
            : deleteTarget?.kind === 'file' ? t('portefeuille.confirm_delete.file_title')
              : t('portefeuille.confirm_delete.paper_title')
        }
        description={
          deleteTarget?.kind === 'folder' ? t('portefeuille.confirm_delete.folder_body')
            : deleteTarget?.kind === 'file' ? t('portefeuille.confirm_delete.file_body')
              : t('portefeuille.confirm_delete.paper_body')
        }
        confirmText={t('shared.actions.delete')}
        cancelText={t('shared.actions.cancel')}
      />

      {/* File preview */}
      <FilePreview
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={downloadFile}
        onRename={(f) => {
          // Close the fullscreen preview, then open the rename dialog for it.
          setPreviewFile(null);
          setNameDialog({ mode: 'rename-file', id: f.id, value: f.nom });
        }}
      />
    </div>
  );
}
