import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ChevronDown, ClipboardList, GripVertical, NotebookPen, Plus, StickyNote } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/**
 * A deliberately small, personal scratchpad. It stays outside the route tree
 * so that an adjuster can capture a thought while working anywhere in the app.
 */
export default function FloatingClaimsWorkspace() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const utils = trpc.useUtils();
  const dashboard = trpc.claimsWorkspace.dashboard.useQuery(undefined, {
    enabled: Boolean(user) && open,
    staleTime: 30_000,
  });
  const saveQuickNote = trpc.claimsWorkspace.saveQuickNote.useMutation({
    onSuccess: () => {
      setQuickNote("");
      utils.claimsWorkspace.dashboard.invalidate();
    },
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("whip.claimsWorkspace.floatingOffset");
      if (!saved) return;
      const parsed = JSON.parse(saved) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") setOffset({ x: parsed.x, y: parsed.y });
    } catch {
      // A corrupt browser preference should never prevent the workspace from opening.
    }
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragOrigin.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const next = {
      x: Math.max(-Math.max(0, window.innerWidth - 96), Math.min(20, origin.offsetX + event.clientX - origin.x)),
      y: Math.max(-Math.max(0, window.innerHeight - 76), Math.min(20, origin.offsetY + event.clientY - origin.y)),
    };
    setOffset(next);
  };
  const endDrag = () => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    setOffset(current => {
      window.localStorage.setItem("whip.claimsWorkspace.floatingOffset", JSON.stringify(current));
      return current;
    });
  };

  if (loading || !user || window.location.pathname === "/claims-workspace") return null;

  const activeTasks = dashboard.data?.tasks ?? [];
  const notes = dashboard.data?.notes ?? [];
  return (
    <div className="fixed bottom-24 right-5 z-[9988] flex flex-col items-end gap-2" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}>
      {open && (
        <section className="w-[318px] overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl shadow-slate-900/20">
          <header className="flex items-center justify-between bg-[#171b31] px-4 py-3 text-white">
            <button className="flex items-center gap-2 text-left" onClick={() => navigate("/claims-workspace")}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff6221]"><NotebookPen className="h-4 w-4" /></span>
              <span><strong className="block text-sm">Claims Workspace</strong><span className="text-[11px] text-slate-300">Personal workpad</span></span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white active:cursor-grabbing"
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Move Claims Workspace panel"
                title="Drag to move this panel"
              ><GripVertical className="h-4 w-4" /></button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label="Minimize Claims Workspace"><ChevronDown className="h-4 w-4" /></Button>
            </div>
          </header>
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">Quick note</p><StickyNote className="h-3.5 w-3.5 text-amber-500" /></div>
              <Textarea value={quickNote} onChange={event => setQuickNote(event.target.value)} placeholder="Capture a thought or follow-up…" className="min-h-16 text-xs" />
              <Button size="sm" className="mt-2 h-7 w-full text-xs" disabled={!quickNote.trim() || saveQuickNote.isPending} onClick={() => saveQuickNote.mutate({ content: quickNote })}><Plus className="mr-1.5 h-3.5 w-3.5" />Save quick note</Button>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">My active tasks</p><span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">{activeTasks.length}</span></div>
              {dashboard.isLoading ? <p className="text-xs text-slate-400">Loading workpad…</p> : activeTasks.length === 0 ? <p className="text-xs text-slate-400">No active tasks. Add one from the workspace.</p> : <div className="space-y-1.5">{activeTasks.slice(0, 3).map(task => <div key={task.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-violet-700" /><p className="line-clamp-2 text-xs leading-4 text-slate-700">{task.title}</p></div>)}</div>}
            </div>
            <button onClick={() => navigate("/claims-workspace")} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50"><span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-violet-700" />Open notes, scene, and tasks</span><span>→</span></button>
          </div>
        </section>
      )}
      {!open && <Button onClick={() => setOpen(true)} className="h-12 rounded-full bg-[#171b31] px-4 text-white shadow-lg hover:bg-[#252b4a]" aria-label="Open Claims Workspace"><NotebookPen className="mr-2 h-4 w-4 text-[#ff6221]" />Claims Workspace</Button>}
    </div>
  );
}
