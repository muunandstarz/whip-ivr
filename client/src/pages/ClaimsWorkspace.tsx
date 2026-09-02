import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { format, isPast, isToday, startOfWeek, endOfWeek } from "date-fns";
import {
  Archive, ArrowRight, Bell, Bold, BookOpen, Car, Check, CheckCircle2,
  CircleDot, Clock3, Copy, CornerDownRight, Crosshair, FileDown, Flag,
  Highlighter, Italic, ListChecks, Map as MapIcon, MapPin, Menu, MoreHorizontal,
  Navigation, NotebookPen, Pencil, Pin, Plus, RefreshCw, RotateCw, Search,
  Send, StickyNote, Target, Trash2, Type, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import WhipLayout from "@/components/WhipLayout";
import { MapView } from "@/components/Map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type VehicleKind = "sedan" | "suv" | "van" | "truck" | "motorcycle" | "bicycle" | "pedestrian";
type RoadLayout = "straight" | "three_way" | "four_way" | "parking_lot" | "highway" | "roundabout";
type SceneVehicle = { id: string; kind: VehicleKind; label: string; x: number; y: number; rotation: number; color: string };
type SceneMark = { id: string; kind: "stop" | "light" | "crosswalk" | "impact" | "arrow" | "note"; x: number; y: number; text?: string; rotation?: number };
type RoadLabel = { id: string; text: string; x: number; y: number; rotation?: number };
type Stroke = { id: string; points: Array<{ x: number; y: number }> };
type SceneData = { vehicles: SceneVehicle[]; marks: SceneMark[]; roadLabels: RoadLabel[]; strokes: Stroke[] };

const STATE_OPTIONS = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"];
const ROAD_LAYOUTS: Array<{ value: RoadLayout; label: string }> = [
  { value: "straight", label: "Straight roadway" }, { value: "three_way", label: "3-way intersection" },
  { value: "four_way", label: "4-way intersection" }, { value: "parking_lot", label: "Parking lot" },
  { value: "highway", label: "Highway" }, { value: "roundabout", label: "Roundabout" },
];
const VEHICLE_KINDS: Array<{ value: VehicleKind; label: string; color: string }> = [
  { value: "sedan", label: "Sedan", color: "#2867b2" }, { value: "suv", label: "SUV", color: "#6a4ab5" },
  { value: "van", label: "Van", color: "#f4a51c" }, { value: "truck", label: "Truck", color: "#7d8796" },
  { value: "motorcycle", label: "Motorcycle", color: "#ec5a3c" }, { value: "bicycle", label: "Bicycle", color: "#20a978" },
  { value: "pedestrian", label: "Pedestrian", color: "#171b31" },
];
const DEFAULT_SCENE: SceneData = { vehicles: [], marks: [], roadLabels: [], strokes: [] };

function getSceneData(raw: unknown): SceneData {
  const candidate = raw as Partial<SceneData> | null;
  return {
    vehicles: Array.isArray(candidate?.vehicles) ? candidate!.vehicles : [],
    marks: Array.isArray(candidate?.marks) ? candidate!.marks : [],
    roadLabels: Array.isArray(candidate?.roadLabels) ? candidate!.roadLabels : [],
    strokes: Array.isArray(candidate?.strokes) ? candidate!.strokes : [],
  };
}

function priorityClass(priority: string) {
  if (priority === "urgent") return "bg-rose-100 text-rose-700 border-rose-200";
  if (priority === "high") return "bg-orange-100 text-[#a63a0f] border-orange-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function TaskBucket({ title, tasks, onComplete, onSnooze }: { title: string; tasks: any[]; onComplete: (id: number) => void; onSnooze: (id: number) => void }) {
  return <Card className="shadow-sm border-slate-200">
    <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
      <div><CardTitle className="text-sm">{title}</CardTitle><CardDescription className="text-xs mt-0.5">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</CardDescription></div>
      <Badge variant="outline" className="text-xs">{tasks.length}</Badge>
    </CardHeader>
    <CardContent className="space-y-2">
      {tasks.length === 0 ? <p className="text-xs text-muted-foreground py-3">Nothing here yet.</p> : tasks.slice(0, 5).map(task => <div key={task.id} className="rounded-lg border border-slate-100 bg-white p-3 group">
        <div className="flex items-start gap-2">
          <button onClick={() => onComplete(task.id)} className="mt-0.5 h-4 w-4 rounded border border-slate-300 hover:border-[#6750c8] hover:bg-violet-50 transition-colors" aria-label={`Complete ${task.title}`} />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-tight line-clamp-2">{task.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
              {task.dueAt && <><Clock3 className="h-3 w-3" />{format(new Date(task.dueAt), "MMM d, h:mm a")}</>}
              <Badge variant="outline" className={`h-4 px-1 text-[9px] ${priorityClass(task.priority)}`}>{task.priority}</Badge>
            </div>
          </div>
          <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" onClick={() => onSnooze(task.id)} aria-label={`Snooze ${task.title}`}><Bell className="h-3.5 w-3.5" /></button>
        </div>
      </div>)}
    </CardContent>
  </Card>;
}

function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value;
  }, [value]);
  const run = (command: string) => { editor.current?.focus(); document.execCommand(command); onChange(editor.current?.innerHTML ?? ""); };
  return <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-2">
      <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()} onClick={() => run("undo")} aria-label="Undo"><Undo2 className="h-3.5 w-3.5" /></Button>
      <span className="h-5 w-px bg-slate-200 mx-1" />
      <Button variant="ghost" size="icon" className="h-7 w-7 font-bold" onMouseDown={e => e.preventDefault()} onClick={() => run("bold")} aria-label="Bold"><Bold className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 italic" onMouseDown={e => e.preventDefault()} onClick={() => run("italic")} aria-label="Italic"><Italic className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()} onClick={() => run("insertUnorderedList")} aria-label="Checklist"><ListChecks className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()} onClick={() => run("hiliteColor")} aria-label="Highlight"><Highlighter className="h-3.5 w-3.5" /></Button>
    </div>
    <div ref={editor} contentEditable suppressContentEditableWarning spellCheck className="min-h-[390px] p-6 text-[15px] leading-7 focus:outline-none prose max-w-none" onInput={e => onChange(e.currentTarget.innerHTML)} />
  </div>;
}

function RoadBackground({ layout }: { layout: RoadLayout }) {
  if (layout === "roundabout") return <><rect width="100%" height="100%" fill="#dce8d7" /><circle cx="50%" cy="50%" r="25%" fill="#48515d" /><circle cx="50%" cy="50%" r="12%" fill="#759369" /><path d="M0 50 H100 M50 0 V100" stroke="#48515d" strokeWidth="18" /><circle cx="50%" cy="50%" r="20%" fill="none" stroke="white" strokeWidth="1" strokeDasharray="3 2" /></>;
  if (layout === "parking_lot") return <><rect width="100%" height="100%" fill="#626b77" />{Array.from({ length: 14 }).map((_, i) => <path key={i} d={`M${i * 9 - 15} 8 L${i * 9 + 10} 92`} stroke="white" strokeWidth="0.7" opacity=".8" />)}</>;
  if (layout === "highway") return <><rect width="100%" height="100%" fill="#52606e" /><path d="M0 33 H100 M0 66 H100" stroke="white" strokeWidth="0.8" strokeDasharray="4 3" /><path d="M0 50 H100" stroke="#d9b35c" strokeWidth="1.5" /></>;
  if (layout === "straight") return <><rect width="100%" height="100%" fill="#53606d" /><path d="M0 50 H100" stroke="white" strokeWidth="1" strokeDasharray="4 3" /><path d="M0 46 H100 M0 54 H100" stroke="white" strokeWidth=".4" opacity=".5" /></>;
  return <><rect width="100%" height="100%" fill="#dbe7d4" /><path d="M0 36 H100 V64 H0 Z" fill="#515e6d" /><path d="M36 0 H64 V100 H36 Z" fill="#515e6d" />{layout === "three_way" && <rect x="0" y="36" width="37" height="28" fill="#dbe7d4" />}
    <path d="M0 50 H100 M50 0 V100" stroke="white" strokeWidth=".9" strokeDasharray="4 3" /><path d="M0 46 H100 M0 54 H100 M46 0 V100 M54 0 V100" stroke="white" strokeWidth=".35" opacity=".45" />
  </>;
}

function VehicleShape({ vehicle }: { vehicle: SceneVehicle }) {
  const x = vehicle.x; const y = vehicle.y;
  if (vehicle.kind === "pedestrian") return <g transform={`translate(${x} ${y}) rotate(${vehicle.rotation})`}><circle cx="0" cy="-3" r="2" fill={vehicle.color} /><path d="M0 -1 L0 5 M-3 1 L3 1 M-2 9 L0 5 L2 9" fill="none" stroke={vehicle.color} strokeWidth="1.5" strokeLinecap="round" /></g>;
  if (vehicle.kind === "bicycle") return <g transform={`translate(${x} ${y}) rotate(${vehicle.rotation})`}><circle cx="-4" cy="3" r="3" fill="none" stroke={vehicle.color} strokeWidth="1.4" /><circle cx="4" cy="3" r="3" fill="none" stroke={vehicle.color} strokeWidth="1.4" /><path d="M-4 3 L0 -3 L4 3 L-1 3 L2 -5" fill="none" stroke={vehicle.color} strokeWidth="1.3" /></g>;
  if (vehicle.kind === "motorcycle") return <g transform={`translate(${x} ${y}) rotate(${vehicle.rotation})`}><rect x="-1.4" y="-7" width="2.8" height="14" rx="1.4" fill={vehicle.color} stroke="white" strokeWidth=".6" /><circle cx="0" cy="-4.6" r="1.7" fill="#d8e7f1" /><rect x="-3" y="-1" width="6" height="1.8" rx=".7" fill="#25303e" /><circle cx="0" cy="4.6" r="1.6" fill="#25303e" /></g>;
  const width = vehicle.kind === "truck" ? 13 : vehicle.kind === "van" ? 12 : vehicle.kind === "suv" ? 11.5 : 10.5;
  const height = vehicle.kind === "truck" ? 22 : vehicle.kind === "van" || vehicle.kind === "suv" ? 20 : 18;
  const halfW = width / 2; const halfH = height / 2;
  const isTruck = vehicle.kind === "truck";
  return <g transform={`translate(${x} ${y}) rotate(${vehicle.rotation})`}>
    <path d={isTruck ? `M${-halfW} ${-halfH + 7} Q${-halfW} ${-halfH + 2} ${-halfW + 4} ${-halfH + 1} H${halfW - 4} Q${halfW} ${-halfH + 2} ${halfW} ${-halfH + 7} V${halfH - 2} Q${halfW} ${halfH} ${halfW - 2} ${halfH} H${-halfW + 2} Q${-halfW} ${halfH} ${-halfW} ${halfH - 2} Z` : `M0 ${-halfH} C${halfW - 1} ${-halfH} ${halfW} ${-halfH + 3} ${halfW} ${-halfH + 6} V${halfH - 3} Q${halfW} ${halfH} ${halfW - 3} ${halfH} H${-halfW + 3} Q${-halfW} ${halfH} ${-halfW} ${halfH - 3} V${-halfH + 6} C${-halfW} ${-halfH + 3} ${-halfW + 1} ${-halfH} 0 ${-halfH} Z`} fill={vehicle.color} stroke="white" strokeWidth=".8" />
    {isTruck ? <><rect x={-halfW + 1.5} y={-halfH + 2.2} width={width - 3} height="5.7" rx="1" fill="#c8e1f1" opacity=".9" /><rect x={-halfW + 1.3} y="-1" width={width - 2.6} height={halfH} rx=".7" fill="#586472" opacity=".55" /></> : <><path d={`M${-halfW + 1.5} ${-halfH + 5} Q0 ${-halfH + 1.8} ${halfW - 1.5} ${-halfH + 5} V-1 H${-halfW + 1.5} Z`} fill="#c8e1f1" opacity=".95" /><path d={`M${-halfW + 1.5} 1 H${halfW - 1.5} V${halfH - 3} H${-halfW + 1.5} Z`} fill="#8095a8" opacity=".58" /></>}
    <rect x={-halfW - .65} y={-halfH + 3.3} width="1.25" height="4" rx=".5" fill="#24313e" /><rect x={halfW - .6} y={-halfH + 3.3} width="1.25" height="4" rx=".5" fill="#24313e" /><rect x={-halfW - .65} y={halfH - 7.3} width="1.25" height="4" rx=".5" fill="#24313e" /><rect x={halfW - .6} y={halfH - 7.3} width="1.25" height="4" rx=".5" fill="#24313e" />
    <path d={`M${-halfW + 2} ${-halfH + 1.2} H${halfW - 2}`} stroke="#f9f4bf" strokeWidth="1" strokeLinecap="round" /><path d={`M${-halfW + 2} ${halfH - 1.2} H${halfW - 2}`} stroke="#ee6954" strokeWidth="1" strokeLinecap="round" />
  </g>;
}

function SceneSvg({ layout, scene, showRoad = true, selectedVehicleId, onPointer, onVehiclePointerDown, onRotatePointerDown }: { layout: RoadLayout; scene: SceneData; showRoad?: boolean; selectedVehicleId: string | null; onPointer: (event: React.PointerEvent<SVGSVGElement>) => void; onVehiclePointerDown: (event: React.PointerEvent<SVGGElement>, id: string) => void; onRotatePointerDown: (event: React.PointerEvent<SVGGElement>, id: string) => void }) {
  return <svg id="claims-scene-svg" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full touch-none select-none" onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer}>
    {showRoad && <RoadBackground layout={layout} />}
    {scene.marks.map(mark => <g key={mark.id} transform={`translate(${mark.x} ${mark.y}) rotate(${mark.rotation ?? 0})`}>
      {mark.kind === "stop" && <><polygon points="0,-4 3,-3 4,0 3,3 0,4 -3,3 -4,0 -3,-3" fill="#df4444" /><text x="0" y="1.2" textAnchor="middle" fontSize="2" fill="white">STOP</text></>}
      {mark.kind === "light" && <rect x="-2" y="-5" width="4" height="10" rx="1" fill="#202a36" />}
      {mark.kind === "crosswalk" && <path d="M-8 0 H8" stroke="white" strokeWidth="3" strokeDasharray="1 1" />}
      {mark.kind === "impact" && <><circle r="4" fill="#ef4444" /><path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke="white" strokeWidth="1" /></>}
      {mark.kind === "arrow" && <path d="M-7 0 H6 M2 -4 L6 0 L2 4" fill="none" stroke="#e8b023" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {mark.kind === "note" && <text fontSize="3" fill="#171b31">{mark.text || "Note"}</text>}
    </g>)}
    {scene.strokes.map(stroke => <polyline key={stroke.id} points={stroke.points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#593bb8" strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round" />)}
    {scene.roadLabels.map(label => <g key={label.id} transform={`translate(${label.x} ${label.y}) rotate(${label.rotation ?? 0})`}><rect x={-Math.max(11, label.text.length * 1.2)} y="-3.4" width={Math.max(22, label.text.length * 2.4)} height="6.8" rx="1.5" fill="rgba(15,23,42,.78)" /><text textAnchor="middle" y="1.25" fontSize="3" fill="white" fontWeight="700">{label.text}</text></g>)}
    {scene.vehicles.map(vehicle => <g key={vehicle.id} className="cursor-grab active:cursor-grabbing"><g onPointerDown={event => onVehiclePointerDown(event, vehicle.id)}><VehicleShape vehicle={vehicle} /><text x={vehicle.x} y={vehicle.y + 13} textAnchor="middle" fontSize="2.6" fill="#172033" fontWeight="600" stroke="white" strokeWidth=".7" paintOrder="stroke">{vehicle.label}</text></g>{selectedVehicleId === vehicle.id && <g transform={`translate(${vehicle.x} ${vehicle.y - 14})`} onPointerDown={event => onRotatePointerDown(event, vehicle.id)} className="cursor-crosshair"><circle r="3.5" fill="#ff6221" stroke="white" strokeWidth=".8" /><text textAnchor="middle" y="1.4" fontSize="4" fill="white" fontWeight="700">↻</text><path d={`M0 3.5 V${14}`} stroke="#ff6221" strokeWidth=".7" strokeDasharray="1.3 1" /></g>}</g>)}
  </svg>;
}

function AccidentWorkspace({ scenes }: { scenes: any[] }) {
  const utils = trpc.useUtils();
  const saveScene = trpc.claimsWorkspace.saveScene.useMutation({ onSuccess: result => { if (result.created) setSelectedSceneId(result.id); utils.claimsWorkspace.dashboard.invalidate(); toast.success("Scene saved"); } });
  const analyze = trpc.kb.analyzeFault.useMutation();
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(scenes[0]?.id ?? null);
  const selectedScene = scenes.find(scene => scene.id === selectedSceneId) ?? null;
  const [title, setTitle] = useState(selectedScene?.title ?? "Accident analysis");
  const [version, setVersion] = useState(selectedScene?.versionLabel ?? "My Analysis");
  const [state, setState] = useState(selectedScene?.state ?? "");
  const [location, setLocation] = useState(selectedScene?.lossLocation ?? "");
  const [layout, setLayout] = useState<RoadLayout>((selectedScene?.roadLayout as RoadLayout) ?? "four_way");
  const [scene, setScene] = useState<SceneData>(getSceneData(selectedScene?.sceneData));
  const [mode, setMode] = useState<"diagram" | "map">("diagram");
  const [tool, setTool] = useState<"select" | "draw">("select");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [draggedVehicle, setDraggedVehicle] = useState<string | null>(null);
  const [rotatingVehicle, setRotatingVehicle] = useState<string | null>(null);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [narrative, setNarrative] = useState("");
  const [folNarrative, setFolNarrative] = useState("");
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (!selectedScene) return;
    setTitle(selectedScene.title); setVersion(selectedScene.versionLabel); setState(selectedScene.state ?? ""); setLocation(selectedScene.lossLocation ?? "");
    setLayout(selectedScene.roadLayout as RoadLayout); setScene(getSceneData(selectedScene.sceneData)); setSelectedVehicleId(null);
  }, [selectedSceneId]);

  const addVehicle = (kind: VehicleKind) => {
    const entry = VEHICLE_KINDS.find(vehicle => vehicle.value === kind)!;
    const vehicle = { id: crypto.randomUUID(), kind, label: kind === "sedan" ? "IV" : "CV", x: 50, y: 50, rotation: 0, color: entry.color };
    setScene(current => ({ ...current, vehicles: [...current.vehicles, vehicle] })); setSelectedVehicleId(vehicle.id);
  };
  const addMark = (kind: SceneMark["kind"]) => setScene(current => ({ ...current, marks: [...current.marks, { id: crypto.randomUUID(), kind, x: 50, y: 45, text: kind === "note" ? "Witness" : undefined }] }));
  const addRoadLabel = () => setScene(current => ({ ...current, roadLabels: [...current.roadLabels, { id: crypto.randomUUID(), text: "Main St", x: 50, y: 18 }] }));
  const positionFor = (event: React.PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)) }; };
  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const position = positionFor(event);
    if (event.type === "pointerdown" && tool === "draw") { const stroke = { id: crypto.randomUUID(), points: [position] }; setCurrentStroke(stroke); setScene(current => ({ ...current, strokes: [...current.strokes, stroke] })); return; }
    if (event.type === "pointermove") {
      if (draggedVehicle) setScene(current => ({ ...current, vehicles: current.vehicles.map(vehicle => vehicle.id === draggedVehicle ? { ...vehicle, ...position } : vehicle) }));
      if (rotatingVehicle) setScene(current => ({ ...current, vehicles: current.vehicles.map(vehicle => {
        if (vehicle.id !== rotatingVehicle) return vehicle;
        const degrees = (Math.atan2(position.y - vehicle.y, position.x - vehicle.x) * 180 / Math.PI + 90 + 360) % 360;
        return { ...vehicle, rotation: Math.round(degrees) };
      }) }));
      if (currentStroke) setScene(current => ({ ...current, strokes: current.strokes.map(stroke => stroke.id === currentStroke.id ? { ...stroke, points: [...stroke.points, position] } : stroke) }));
    }
    if (event.type === "pointerup") { setDraggedVehicle(null); setRotatingVehicle(null); setCurrentStroke(null); }
  };
  const save = () => saveScene.mutate({ id: selectedSceneId ?? undefined, title: title.trim() || "Accident analysis", versionLabel: version, state: state || null, lossLocation: location || null, roadLayout: layout, sceneData: scene, analysisNotes: narrative || null });
  const exportSvg = () => { const svg = document.getElementById("claims-scene-svg"); if (!svg) return; const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>${svg.outerHTML}`], { type: "image/svg+xml" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${title || "accident-scene"}.svg`; anchor.click(); URL.revokeObjectURL(url); };
  const geocode = (map = mapRef.current) => { if (!map || !location.trim() || !window.google) return; new google.maps.Geocoder().geocode({ address: location }, (results, status) => { if (status === "OK" && results?.[0]) { map.setCenter(results[0].geometry.location); map.setZoom(18); } else toast.error("Location not found. Refine the loss location and try again."); }); };
  const openLocationMap = () => { if (!location.trim()) { toast.error("Enter a loss location, intersection, or approximate address first."); return; } setMode("map"); };
  const sceneContext = `Accident workspace: ${layout.replace("_", " ")}; ${scene.vehicles.map(vehicle => `${vehicle.label} (${vehicle.kind}) at ${Math.round(vehicle.x)},${Math.round(vehicle.y)}, facing ${Math.round(vehicle.rotation)}°`).join("; ") || "no vehicles placed"}; markers: ${scene.marks.map(mark => mark.kind).join(", ") || "none"}.`;
  const submitAnalysis = () => { if (!narrative.trim() || !state) { toast.error("Add a driver narrative and state of loss before analysis."); return; } analyze.mutate({ narrative, folNarrative: folNarrative || undefined, state, accidentType: undefined, damageLocation: undefined, policeReport: undefined, additionalContext: `${sceneContext}${location ? ` Loss location: ${location}.` : ""}` }); };
  const structured = analyze.data?.structured as any;

  return <div className="space-y-5">
    <Card className="border-slate-200 shadow-sm"><CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-end">
      <div className="flex-1"><Label>Workspace name</Label><Input value={title} onChange={event => setTitle(event.target.value)} className="mt-1" /></div>
      <div className="w-full lg:w-44"><Label>Version</Label><Select value={version} onValueChange={setVersion}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["Member Version", "Claimant Version", "Witness Version", "My Analysis"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="w-full lg:w-28"><Label>State</Label><Select value={state} onValueChange={setState}><SelectTrigger className="mt-1"><SelectValue placeholder="State" /></SelectTrigger><SelectContent>{STATE_OPTIONS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="w-full lg:flex-1"><Label>Loss location</Label><div className="mt-1 flex gap-2"><Input value={location} onChange={event => setLocation(event.target.value)} placeholder="Address, cross streets, or approximate location" /><Button variant="outline" className="shrink-0" onClick={openLocationMap}><MapPin className="mr-1.5 h-4 w-4" />Map</Button></div></div>
      <div className="flex gap-2"><Button variant="outline" onClick={exportSvg}><FileDown className="mr-2 h-4 w-4" />Export</Button><Button onClick={save} disabled={saveScene.isPending}>{saveScene.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save version</Button></div>
    </CardContent></Card>
    <div className="grid xl:grid-cols-[220px_minmax(0,1fr)_330px] gap-5">
      <Card className="border-slate-200 shadow-sm h-fit"><CardHeader className="pb-3"><CardTitle className="text-sm">Scene tools</CardTitle></CardHeader><CardContent className="space-y-4">
        <div><Label className="text-xs">Road layout</Label><Select value={layout} onValueChange={value => setLayout(value as RoadLayout)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{ROAD_LAYOUTS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <div><p className="mb-2 text-xs font-medium">Add road controls</p><div className="grid grid-cols-2 gap-2">{[["stop", "Stop sign"], ["light", "Traffic light"], ["crosswalk", "Crosswalk"], ["impact", "Impact"], ["arrow", "Arrow"], ["note", "Evidence label"]].map(([kind, label]) => <Button key={kind} variant="outline" size="sm" className="text-xs justify-start" onClick={() => addMark(kind as SceneMark["kind"])}>{label}</Button>)}<Button variant="outline" size="sm" className="col-span-2 text-xs justify-start" onClick={addRoadLabel}><Type className="mr-2 h-3.5 w-3.5" />Road name label</Button></div></div>
        <div><p className="mb-2 text-xs font-medium">Add people & vehicles</p><div className="space-y-1">{VEHICLE_KINDS.map(item => <Button key={item.value} variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => addVehicle(item.value)}><Car className="mr-2 h-3.5 w-3.5" style={{ color: item.color }} />{item.label}</Button>)}</div></div>
        <div className="border-t pt-3"><Button size="sm" className={`w-full ${tool === "draw" ? "bg-[#ff6221] hover:bg-[#e5541a]" : ""}`} variant={tool === "draw" ? "default" : "outline"} onClick={() => setTool(tool === "draw" ? "select" : "draw")}><Pencil className="mr-2 h-3.5 w-3.5" />{tool === "draw" ? "Drawing enabled" : "Freehand draw"}</Button></div>
      </CardContent></Card>
      <Card className="border-slate-200 shadow-sm overflow-hidden"><CardHeader className="pb-3 flex-row items-center justify-between space-y-0"><div><CardTitle className="text-sm">Accident Workspace</CardTitle><CardDescription>Drag a vehicle to position it. Select it, then drag its orange rotate handle to set direction.</CardDescription></div><Tabs value={mode} onValueChange={value => setMode(value as "diagram" | "map")}><TabsList className="h-8"><TabsTrigger value="diagram" className="text-xs h-7"><Pencil className="mr-1 h-3 w-3" />Diagram</TabsTrigger><TabsTrigger value="map" className="text-xs h-7"><MapIcon className="mr-1 h-3 w-3" />Map</TabsTrigger></TabsList></Tabs></CardHeader>
        <CardContent className="p-0"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100">{mode === "diagram" ? <SceneSvg layout={layout} scene={scene} selectedVehicleId={selectedVehicleId} onPointer={handlePointer} onVehiclePointerDown={(event, id) => { event.stopPropagation(); setSelectedVehicleId(id); setDraggedVehicle(id); (event.currentTarget.ownerSVGElement as SVGSVGElement)?.setPointerCapture(event.pointerId); }} onRotatePointerDown={(event, id) => { event.stopPropagation(); setSelectedVehicleId(id); setRotatingVehicle(id); (event.currentTarget.ownerSVGElement as SVGSVGElement)?.setPointerCapture(event.pointerId); }} /> : <div className="relative h-full"><MapView className="h-full" initialCenter={{ lat: 39.084, lng: -77.152 }} initialZoom={12} onMapReady={map => { mapRef.current = map; geocode(map); }} /><div className="absolute inset-0 pointer-events-none bg-black/5" /><div className="absolute top-3 left-3 right-3 flex gap-2"><Input className="bg-white shadow-sm" value={location} onChange={event => setLocation(event.target.value)} placeholder="Paste loss location or intersection" /><Button onClick={() => geocode()} className="shrink-0"><Search className="h-4 w-4" /></Button></div><div className="absolute inset-0 top-14"><SceneSvg layout={layout} showRoad={false} scene={scene} selectedVehicleId={selectedVehicleId} onPointer={handlePointer} onVehiclePointerDown={(event, id) => { event.stopPropagation(); setSelectedVehicleId(id); setDraggedVehicle(id); }} onRotatePointerDown={(event, id) => { event.stopPropagation(); setSelectedVehicleId(id); setRotatingVehicle(id); }} /></div></div>}</div>
          {(scene.vehicles.length > 0 || scene.roadLabels.length > 0) && <div className="border-t p-3 space-y-2"><div className="flex flex-wrap gap-2">{scene.vehicles.map(vehicle => <div key={vehicle.id} className={`flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs ${selectedVehicleId === vehicle.id ? "ring-1 ring-[#ff6221]" : ""}`}><button aria-label={`Select ${vehicle.label}`} onClick={() => setSelectedVehicleId(vehicle.id)}><span className="block h-2 w-2 rounded-full" style={{ backgroundColor: vehicle.color }} /></button><Input aria-label={`${vehicle.label} label`} className="h-6 w-14 px-1 text-xs border-0" value={vehicle.label} onChange={event => setScene(current => ({ ...current, vehicles: current.vehicles.map(item => item.id === vehicle.id ? { ...item, label: event.target.value } : item) }))} /><button title="Rotate 15 degrees counterclockwise" onClick={() => setScene(current => ({ ...current, vehicles: current.vehicles.map(item => item.id === vehicle.id ? { ...item, rotation: (item.rotation + 345) % 360 } : item) }))}><RotateCw className="h-3.5 w-3.5 -scale-x-100" /></button><input aria-label={`${vehicle.label} rotation`} className="w-14 accent-[#ff6221]" type="range" min="0" max="359" value={vehicle.rotation} onChange={event => setScene(current => ({ ...current, vehicles: current.vehicles.map(item => item.id === vehicle.id ? { ...item, rotation: Number(event.target.value) } : item) }))} /><button title="Rotate 15 degrees clockwise" onClick={() => setScene(current => ({ ...current, vehicles: current.vehicles.map(item => item.id === vehicle.id ? { ...item, rotation: (item.rotation + 15) % 360 } : item) }))}><RotateCw className="h-3.5 w-3.5" /></button><button onClick={() => setScene(current => ({ ...current, vehicles: current.vehicles.filter(item => item.id !== vehicle.id) }))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button></div>)}</div>{scene.roadLabels.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{scene.roadLabels.map(label => <div key={label.id} className="flex items-center gap-1 rounded-lg border bg-slate-50 px-2 py-1 text-xs"><MapPin className="h-3.5 w-3.5 text-[#ff6221]" /><Input aria-label="Road label" className="h-6 w-28 border-0 bg-transparent px-1 text-xs" value={label.text} onChange={event => setScene(current => ({ ...current, roadLabels: current.roadLabels.map(item => item.id === label.id ? { ...item, text: event.target.value } : item) }))} /><button onClick={() => setScene(current => ({ ...current, roadLabels: current.roadLabels.filter(item => item.id !== label.id) }))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button></div>)}</div>}</div>}
        </CardContent></Card>
      <div className="space-y-4"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm">Liability workpad</CardTitle><CardDescription>Use the scene as evidence—not as a final accident reconstruction.</CardDescription></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs">First notice / facts of loss</Label><Textarea className="mt-1 min-h-20 text-xs" value={folNarrative} onChange={event => setFolNarrative(event.target.value)} placeholder="Key loss facts, statements, damage, report details..." /></div><div><Label className="text-xs">Driver narrative <span className="text-rose-600">*</span></Label><Textarea className="mt-1 min-h-24 text-xs" value={narrative} onChange={event => setNarrative(event.target.value)} placeholder="What happened, in the driver’s own words?" /></div><Button className="w-full" onClick={submitAnalysis} disabled={analyze.isPending}>{analyze.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}Analyze liability</Button><Button variant="outline" className="w-full" onClick={() => { save(); window.location.href = "/kb/liability-guide"; }}>Open full Liability Guide <ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
        {structured && <Card className="border-orange-200 bg-orange-50/40 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Liability & recoverability <Badge className="bg-[#ff6221]">AI-assisted</Badge></CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-white p-2 border"><p className="text-[10px] uppercase text-muted-foreground">Estimated fault</p><p className="font-semibold">{structured.estimatedFaultPct ?? "Review facts"}</p></div><div className="rounded-lg bg-white p-2 border"><p className="text-[10px] uppercase text-muted-foreground">Recovery likelihood</p><p className="font-semibold">{structured.recoveryLikelihood ?? "Review facts"}</p></div></div><p className="leading-5">{structured.faultAnalysis}</p>{Array.isArray(structured.evidenceNeeded) && <div><p className="text-xs font-semibold mb-1">Evidence to obtain</p><ul className="space-y-1 text-xs">{structured.evidenceNeeded.slice(0, 4).map((item: string) => <li key={item} className="flex gap-1.5"><span className="text-[#ff6221]">•</span>{item}</li>)}</ul></div>}<Button variant="outline" size="sm" className="w-full" onClick={() => { navigator.clipboard.writeText([structured.faultAnalysis, structured.stateLawImpact, structured.recommendedAction].filter(Boolean).join("\n\n")); toast.success("Liability workpad copied"); }}><Copy className="mr-2 h-3.5 w-3.5" />Copy determination</Button></CardContent></Card>}
      </div>
    </div>
  </div>;
}

export default function ClaimsWorkspace() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.claimsWorkspace.dashboard.useQuery(undefined, { refetchOnWindowFocus: false });
  const [tab, setTab] = useState("notes");
  const [noteId, setNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("Untitled note");
  const [noteContent, setNoteContent] = useState("<p>Start writing your claim thinking here…</p>");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [noteSearch, setNoteSearch] = useState("");
  const [quickText, setQuickText] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskReminder, setTaskReminder] = useState("");
  const [taskRepeat, setTaskRepeat] = useState<"none" | "daily" | "weekdays" | "weekly" | "monthly">("none");
  const [taskPriority, setTaskPriority] = useState<"normal" | "high" | "urgent">("normal");
  const saveNote = trpc.claimsWorkspace.saveNote.useMutation({ onSuccess: result => { if (result.created) setNoteId(result.id); utils.claimsWorkspace.dashboard.invalidate(); } });
  const togglePin = trpc.claimsWorkspace.setNotePinned.useMutation({ onSuccess: () => utils.claimsWorkspace.dashboard.invalidate() });
  const archiveNote = trpc.claimsWorkspace.archiveNote.useMutation({ onSuccess: () => { utils.claimsWorkspace.dashboard.invalidate(); setNoteId(null); setNoteTitle("Untitled note"); setNoteContent("<p>Start writing your claim thinking here…</p>"); setNoteTags([]); } });
  const saveQuickNote = trpc.claimsWorkspace.saveQuickNote.useMutation({ onSuccess: () => { setQuickText(""); utils.claimsWorkspace.dashboard.invalidate(); } });
  const archiveQuickNote = trpc.claimsWorkspace.archiveQuickNote.useMutation({ onSuccess: () => utils.claimsWorkspace.dashboard.invalidate() });
  const convertQuickNote = trpc.claimsWorkspace.convertQuickNoteToTask.useMutation({ onSuccess: () => { utils.claimsWorkspace.dashboard.invalidate(); toast.success("Quick note converted to a task"); } });
  const saveTask = trpc.claimsWorkspace.saveTask.useMutation({ onSuccess: () => { utils.claimsWorkspace.dashboard.invalidate(); setTaskDialogOpen(false); setTaskTitle(""); setTaskDue(""); setTaskDetails(""); setTaskReminder(""); setTaskRepeat("none"); setTaskPriority("normal"); toast.success("Task saved"); } });
  const setTaskStatus = trpc.claimsWorkspace.setTaskStatus.useMutation({ onSuccess: () => utils.claimsWorkspace.dashboard.invalidate() });
  const snoozeTask = trpc.claimsWorkspace.snoozeTask.useMutation({ onSuccess: () => { utils.claimsWorkspace.dashboard.invalidate(); toast.success("Task snoozed until tomorrow morning"); } });

  useEffect(() => { if (!noteId) return; const timer = window.setTimeout(() => saveNote.mutate({ id: noteId, title: noteTitle.trim() || "Untitled note", content: noteContent, tags: noteTags }), 850); return () => window.clearTimeout(timer); }, [noteId, noteTitle, noteContent, noteTags]);
  const openNote = (note: any) => { setNoteId(note.id); setNoteTitle(note.title); setNoteContent(note.content); setNoteTags(Array.isArray(note.tags) ? note.tags : []); setTab("notes"); };
  const createNote = () => { const title = "Untitled note"; saveNote.mutate({ title, content: "<p>Start writing your claim thinking here…</p>", tags: [] }, { onSuccess: result => { setNoteId(result.id); setNoteTitle(title); setNoteContent("<p>Start writing your claim thinking here…</p>"); setNoteTags([]); } }); };
  const saveTaskFromDialog = () => { if (!taskTitle.trim()) return; saveTask.mutate({ title: taskTitle, details: taskDetails || null, priority: taskPriority, dueAt: taskDue ? new Date(taskDue) : null, remindAt: taskReminder ? new Date(taskReminder) : null, repeatRule: taskRepeat, sourceNoteId: noteId ?? null }); };
  const tasks = data?.tasks ?? [];
  const completedTasks = data?.completedTasks ?? [];
  const dueToday = tasks.filter(task => task.dueAt && isToday(new Date(task.dueAt)));
  const overdue = tasks.filter(task => task.dueAt && isPast(new Date(task.dueAt)) && !isToday(new Date(task.dueAt)));
  const dueWeek = tasks.filter(task => task.dueAt && new Date(task.dueAt) >= startOfWeek(new Date()) && new Date(task.dueAt) <= endOfWeek(new Date()) && !isToday(new Date(task.dueAt)));
  const upcoming = tasks.filter(task => !task.dueAt || new Date(task.dueAt) > endOfWeek(new Date()));
  const visibleNotes = (data?.notes ?? []).filter(note => `${note.title} ${note.content} ${Array.isArray(note.tags) ? (note.tags as string[]).join(" ") : ""}`.toLowerCase().includes(noteSearch.toLowerCase()));

  return <WhipLayout><main className="min-h-full bg-[#f8fafc] p-5 lg:p-7"><div className="mx-auto max-w-[1600px]">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#ff6221]"><NotebookPen className="h-4 w-4" />Handler productivity space</div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Claims Workspace</h1><p className="mt-1 text-sm text-slate-500">Think, visualize, remember, then document the final decision in Snapsheet.</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => setTaskDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New task</Button><Button onClick={createNote} disabled={saveNote.isPending}><NotebookPen className="mr-2 h-4 w-4" />New note</Button></div></div>
    <Tabs value={tab} onValueChange={setTab} className="space-y-5"><TabsList className="h-10 rounded-xl bg-white border border-slate-200 p-1 shadow-sm"><TabsTrigger value="notes" className="rounded-lg gap-2"><BookOpen className="h-4 w-4" />Notes</TabsTrigger><TabsTrigger value="accident" className="rounded-lg gap-2"><Car className="h-4 w-4" />Accident Workspace</TabsTrigger><TabsTrigger value="tasks" className="rounded-lg gap-2"><ListChecks className="h-4 w-4" />Tasks & Alerts</TabsTrigger></TabsList>
      <TabsContent value="notes" className="m-0"><div className="grid xl:grid-cols-[255px_minmax(0,1fr)_280px] gap-5"><Card className="h-fit border-slate-200 shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">My notes</CardTitle><Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNote}><Plus className="h-4 w-4" /></Button></div><div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><Input className="h-8 pl-8 text-xs" value={noteSearch} onChange={event => setNoteSearch(event.target.value)} placeholder="Search notes" /></div></CardHeader><CardContent className="space-y-1 max-h-[620px] overflow-y-auto">{visibleNotes.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">Create a notebook page to begin.</p> : visibleNotes.map(note => <button key={note.id} onClick={() => openNote(note)} className={`w-full rounded-lg p-2.5 text-left transition-colors ${note.id === noteId ? "bg-violet-50 ring-1 ring-violet-200" : "hover:bg-slate-50"}`}><div className="flex items-start gap-1"><p className="flex-1 truncate text-sm font-medium">{note.title}</p>{note.isPinned ? <Pin className="h-3.5 w-3.5 fill-violet-600 text-violet-600" /> : null}</div><p className="mt-1 line-clamp-2 text-[11px] text-slate-500" dangerouslySetInnerHTML={{ __html: note.content }} /><div className="mt-2 flex gap-1">{(Array.isArray(note.tags) ? (note.tags as string[]) : []).slice(0, 2).map(tag => <Badge key={tag} variant="outline" className="h-4 px-1 text-[9px]">{tag}</Badge>)}</div></button>)}</CardContent></Card>
        <div className="space-y-3"><Card className="border-slate-200 shadow-sm"><CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center"><Input className="border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0" value={noteTitle} onChange={event => setNoteTitle(event.target.value)} placeholder="Note title" /><div className="flex items-center gap-1 shrink-0"><Button variant="ghost" size="sm" onClick={() => { const activeNote = (data?.notes ?? []).find(note => note.id === noteId); if (noteId) togglePin.mutate({ id: noteId, isPinned: !activeNote?.isPinned }); }}><Pin className="mr-1.5 h-3.5 w-3.5" />Pin</Button><Button variant="ghost" size="sm" onClick={() => noteId && archiveNote.mutate({ id: noteId })}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button></div></CardContent></Card><RichEditor value={noteContent} onChange={setNoteContent} /><div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><Badge variant="outline" className="h-6">Autosaves</Badge>{noteTags.map(tag => <Badge key={tag} className="h-6 bg-violet-100 text-violet-800 hover:bg-violet-100">{tag}<button onClick={() => setNoteTags(tags => tags.filter(value => value !== tag))} className="ml-1"><X className="h-3 w-3" /></button></Badge>)}<Input className="h-7 w-32 text-xs" placeholder="Add tag + Enter" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const tag = event.currentTarget.value.trim(); if (tag && !noteTags.includes(tag)) setNoteTags(tags => [...tags, tag]); event.currentTarget.value = ""; } }} /><span className="ml-auto text-xs text-slate-400">{saveNote.isPending ? "Saving…" : noteId ? "Saved" : "Create this note to save"}</span><Button size="sm" variant="outline" onClick={() => { const selection = window.getSelection()?.toString().trim(); setTaskTitle(selection || noteTitle); setTaskDialogOpen(true); }}><ListChecks className="mr-2 h-3.5 w-3.5" />Create task</Button></div></div>
        <div className="space-y-4"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm">Quick Notes</CardTitle><CardDescription>Short-lived reminders and scratch thoughts.</CardDescription></CardHeader><CardContent className="space-y-2"><Textarea className="min-h-20 text-sm" value={quickText} onChange={event => setQuickText(event.target.value)} placeholder="Waiting on police report…" /><Button size="sm" className="w-full" disabled={!quickText.trim() || saveQuickNote.isPending} onClick={() => saveQuickNote.mutate({ content: quickText })}><StickyNote className="mr-2 h-3.5 w-3.5" />Save quick note</Button>{(data?.quickNotes ?? []).map(note => <div key={note.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="text-xs leading-5">{note.content}</p><div className="mt-2 flex gap-1"><Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => convertQuickNote.mutate({ id: note.id, priority: "normal" })}>To task</Button><Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => archiveQuickNote.mutate({ id: note.id })}><X className="h-3.5 w-3.5" /></Button></div></div>)}</CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm">Today’s focus</CardTitle></CardHeader><CardContent>{dueToday.length === 0 ? <p className="text-xs text-muted-foreground">No tasks due today.</p> : dueToday.slice(0, 4).map(task => <div key={task.id} className="py-2 border-b last:border-0 text-xs flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-violet-700" />{task.title}</div>)}</CardContent></Card></div>
      </div></TabsContent>
      <TabsContent value="accident" className="m-0"><AccidentWorkspace scenes={data?.scenes ?? []} /></TabsContent>
      <TabsContent value="tasks" className="m-0 space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Tasks & Alerts</h2><p className="text-sm text-muted-foreground">Personal follow-up work, independent of the official claims system.</p></div><Button onClick={() => setTaskDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New task</Button></div><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4"><TaskBucket title="Overdue" tasks={overdue} onComplete={id => setTaskStatus.mutate({ id, status: "completed" })} onSnooze={id => snoozeTask.mutate({ id, remindAt: new Date(Date.now() + 86_400_000) })} /><TaskBucket title="Due today" tasks={dueToday} onComplete={id => setTaskStatus.mutate({ id, status: "completed" })} onSnooze={id => snoozeTask.mutate({ id, remindAt: new Date(Date.now() + 86_400_000) })} /><TaskBucket title="This week" tasks={dueWeek} onComplete={id => setTaskStatus.mutate({ id, status: "completed" })} onSnooze={id => snoozeTask.mutate({ id, remindAt: new Date(Date.now() + 86_400_000) })} /><TaskBucket title="Upcoming" tasks={upcoming} onComplete={id => setTaskStatus.mutate({ id, status: "completed" })} onSnooze={id => snoozeTask.mutate({ id, remindAt: new Date(Date.now() + 86_400_000) })} /></div><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm">All active tasks</CardTitle></CardHeader><CardContent className="divide-y">{tasks.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Create tasks from a note, quick note, accident-workspace label, or here.</p> : tasks.map(task => <div key={task.id} className="flex items-center gap-3 py-3"><button onClick={() => setTaskStatus.mutate({ id: task.id, status: "completed" })} className="h-5 w-5 rounded border border-slate-300 hover:border-[#ff6221]" /><div className="flex-1"><p className="text-sm font-medium">{task.title}</p>{task.details && <p className="text-xs text-muted-foreground">{task.details}</p>}{task.repeatRule !== "none" && <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#ff6221]">Repeats {task.repeatRule}</p>}</div><Badge variant="outline" className={priorityClass(task.priority)}>{task.priority}</Badge><span className="text-xs text-muted-foreground min-w-24 text-right">{task.dueAt ? format(new Date(task.dueAt), "MMM d, h:mm a") : "No due date"}</span></div>)}</CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm">Completed history</CardTitle><CardDescription>Recently completed personal follow-up tasks.</CardDescription></CardHeader><CardContent>{completedTasks.length === 0 ? <p className="text-sm text-muted-foreground">No completed tasks yet.</p> : <div className="divide-y">{completedTasks.slice(0, 10).map(task => <div key={task.id} className="flex items-center gap-3 py-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><div className="flex-1"><p className="text-sm font-medium line-through text-slate-500">{task.title}</p><p className="text-[11px] text-muted-foreground">Completed {task.completedAt ? format(new Date(task.completedAt), "MMM d, h:mm a") : "recently"}</p></div><Button variant="ghost" size="sm" onClick={() => setTaskStatus.mutate({ id: task.id, status: "active" })}>Reopen</Button></div>)}</div>}</CardContent></Card></TabsContent>
    </Tabs>
  </div></main>
  <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader><div className="space-y-4 py-2"><div><Label>Task</Label><Input className="mt-1" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Follow up with claimant…" /></div><div><Label>Details <span className="text-muted-foreground">(optional)</span></Label><Textarea className="mt-1 min-h-16" value={taskDetails} onChange={event => setTaskDetails(event.target.value)} placeholder="Context, contact, claim number, or next step…" /></div><div className="grid grid-cols-2 gap-3"><div><Label>Due date & time</Label><Input className="mt-1" type="datetime-local" value={taskDue} onChange={event => setTaskDue(event.target.value)} /></div><div><Label>Reminder</Label><Input className="mt-1" type="datetime-local" value={taskReminder} onChange={event => setTaskReminder(event.target.value)} /></div><div><Label>Priority</Label><Select value={taskPriority} onValueChange={value => setTaskPriority(value as typeof taskPriority)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div><Label>Repeat</Label><Select value={taskRepeat} onValueChange={value => setTaskRepeat(value as typeof taskRepeat)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Does not repeat</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekdays">Weekdays</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div></div></div><DialogFooter><Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button><Button onClick={saveTaskFromDialog} disabled={!taskTitle.trim() || saveTask.isPending}>{saveTask.isPending ? "Saving…" : "Save task"}</Button></DialogFooter></DialogContent></Dialog>
  </WhipLayout>;
}
