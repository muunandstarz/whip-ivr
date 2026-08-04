import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import WhipLayout from "@/components/WhipLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bot, Play, RefreshCw, Users, Calendar, Settings2, ClipboardList,
  Mail, FileText, AlertTriangle, CheckCircle2, Clock, Zap, Plus, Trash2, Edit2, Save, X,
} from "lucide-react";

type SubPage = "control" | "log" | "agents" | "pto" | "schedule";

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Bot Control Panel ─────────────────────────────────────────────────────────
function BotControlPanel() {
  const utils = trpc.useUtils();
  const { data: config, isLoading: configLoading } = trpc.mailBot.getConfig.useQuery();
  const { data: stats } = trpc.mailBot.getStats.useQuery();
  const { data: runs } = trpc.mailBot.listRuns.useQuery({ limit: 5 });
  const [batchSize, setBatchSize] = useState<number | null>(null);
  const [lookback, setLookback] = useState<number | null>(null);
  const [runScanMode, setRunScanMode] = useState<"hours" | "all_time" | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const runMutation = trpc.mailBot.runNow.useMutation({
    onSuccess: (result) => {
      toast.success(`Run complete: ${result.assigned} assigned, ${result.skipped} skipped`);
      utils.mailBot.listRuns.invalidate();
      utils.mailBot.getStats.invalidate();
      utils.mailBot.listAssignments.invalidate();
      setRunning(null);
    },
    onError: (err) => {
      toast.error(`Run failed: ${err.message}`);
      setRunning(null);
    },
  });

  const updateConfig = trpc.mailBot.updateConfig.useMutation({
    onSuccess: () => { toast.success("Config saved"); utils.mailBot.getConfig.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  function handleRun(source: "slack_mail" | "gmail_fax" | "both") {
    setRunning(source);
    runMutation.mutate({
      source,
      batchSize: batchSize ?? config?.batchSize ?? 3,
      lookbackHours: lookback ?? config?.lookbackHours ?? 24,
      scanMode: runScanMode ?? ((config as typeof config & { scanMode?: string })?.scanMode as "hours" | "all_time" | undefined) ?? "hours",
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Assignments" value={stats?.total ?? "—"} icon={ClipboardList} color="bg-primary/10 text-primary" />
        <StatCard label="Today" value={stats?.today ?? "—"} icon={Zap} color="bg-[#ff6221]/10 text-[#ff6221]" />
        <StatCard label="Open Items" value={stats?.open ?? "—"} icon={Clock} color="bg-amber-500/10 text-amber-600" />
        <StatCard label="Legal Items" value={stats?.legal ?? "—"} icon={AlertTriangle} color="bg-red-500/10 text-red-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Run Controls */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="w-4 h-4 text-[#ff6221]" /> Run Bot Now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Batch Size</Label>
                <Input
                  type="number" min={1} max={50}
                  placeholder={String(config?.batchSize ?? 3)}
                  value={batchSize ?? ""}
                  onChange={(e) => setBatchSize(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Lookback Hours</Label>
                <Input
                  type="number" min={1} max={168}
                  placeholder={String(config?.lookbackHours ?? 24)}
                  value={lookback ?? ""}
                  onChange={(e) => setLookback(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 h-8 text-sm"
                  disabled={(runScanMode ?? (config as typeof config & { scanMode?: string })?.scanMode) === "all_time"}
                />
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Scan Mode (this run)</Label>
                <div className="mt-1 flex rounded-md border border-border overflow-hidden text-xs">
                  <button type="button"
                    onClick={() => setRunScanMode("hours")}
                    className={`flex-1 py-1.5 font-medium transition-colors ${(runScanMode ?? (config as typeof config & { scanMode?: string })?.scanMode ?? "hours") === "hours" ? "bg-[#ff6221] text-white" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
                  >Last N Hours</button>
                  <button type="button"
                    onClick={() => setRunScanMode("all_time")}
                    className={`flex-1 py-1.5 font-medium transition-colors ${(runScanMode ?? (config as typeof config & { scanMode?: string })?.scanMode ?? "hours") === "all_time" ? "bg-[#ff6221] text-white" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
                  >All Unchecked</button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(runScanMode ?? (config as typeof config & { scanMode?: string })?.scanMode ?? "hours") === "all_time"
                    ? "Scans every unprocessed item in #claims-mail regardless of age."
                    : "Scans only items posted within the lookback window."}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2"
                disabled={!!running}
                onClick={() => handleRun("slack_mail")}
              >
                {running === "slack_mail" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Push Mail Now (#claims-mail)
              </Button>
              <Button
                variant="outline" className="w-full gap-2"
                disabled={!!running}
                onClick={() => handleRun("gmail_fax")}
              >
                {running === "gmail_fax" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Push Fax Now (Gmail/eFax)
              </Button>
              <Button
                variant="outline" className="w-full gap-2"
                disabled={!!running}
                onClick={() => handleRun("both")}
              >
                {running === "both" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                Push Both
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Config */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" /> Bot Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {configLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : config && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Process #claims-mail</Label>
                  <Switch
                    checked={config.processMailChannel}
                    onCheckedChange={(v) => updateConfig.mutate({ processMailChannel: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Process Gmail/eFax</Label>
                  <Switch
                    checked={config.processFax}
                    onCheckedChange={(v) => updateConfig.mutate({ processFax: v })}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs">Default Batch Size</Label>
                  <Input
                    type="number" min={1} max={50}
                    defaultValue={config.batchSize}
                    className="mt-1 h-8 text-sm"
                    onBlur={(e) => updateConfig.mutate({ batchSize: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Default Lookback (hours)</Label>
                  <Input
                    type="number" min={1} max={168}
                    defaultValue={config.lookbackHours}
                    className="mt-1 h-8 text-sm"
                    onBlur={(e) => updateConfig.mutate({ lookbackHours: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Apps Script URL (Google Sheet logging)</Label>
                  <Input
                    defaultValue={config.appsScriptUrl ?? ""}
                    className="mt-1 h-8 text-sm font-mono text-xs"
                    onBlur={(e) => updateConfig.mutate({ appsScriptUrl: e.target.value })}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Runs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Recent Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!runs?.length ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.runId} className="flex items-center justify-between text-sm border border-border/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <div>
                      <span className="font-medium capitalize">{run.trigger.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="text-green-600 font-medium">{run.itemsAssigned} assigned</span>
                    <span>{run.itemsSkipped} skipped</span>
                    {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Assignment Log ────────────────────────────────────────────────────────────
function AssignmentLog() {
  const [filters, setFilters] = useState({ status: "", assignedTo: "", mailType: "", dateFrom: "", dateTo: "" });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const { data: assignments, isLoading } = trpc.mailBot.listAssignments.useQuery({
    limit: LIMIT,
    offset,
    status: (filters.status as "open" | "in_review" | "actioned" | "closed") || undefined,
    assignedTo: filters.assignedTo || undefined,
    mailType: filters.mailType || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const utils = trpc.useUtils();
  const updateMutation = trpc.mailBot.updateAssignment.useMutation({
    onSuccess: () => { toast.success("Updated"); utils.mailBot.listAssignments.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const statusColor: Record<string, string> = {
    open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    actioned: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => { setFilters(f => ({ ...f, status: v === "all" ? "" : v })); setOffset(0); }}>
                <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="actioned">Actioned</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assigned To</Label>
              <Input placeholder="Name…" className="h-8 mt-1 text-xs" value={filters.assignedTo}
                onChange={(e) => { setFilters(f => ({ ...f, assignedTo: e.target.value })); setOffset(0); }} />
            </div>
            <div>
              <Label className="text-xs">Mail Type</Label>
              <Input placeholder="Type…" className="h-8 mt-1 text-xs" value={filters.mailType}
                onChange={(e) => { setFilters(f => ({ ...f, mailType: e.target.value })); setOffset(0); }} />
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-8 mt-1 text-xs" value={filters.dateFrom}
                onChange={(e) => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setOffset(0); }} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-8 mt-1 text-xs" value={filters.dateTo}
                onChange={(e) => { setFilters(f => ({ ...f, dateTo: e.target.value })); setOffset(0); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Mail Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Assigned To</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Claim #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Notes</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading…</td></tr>
                ) : !assignments?.length ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No assignments found.</td></tr>
                ) : assignments.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} statusColor={statusColor} onUpdate={(updates) => updateMutation.mutate({ id: a.id, ...updates })} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous</Button>
            <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + (assignments?.length ?? 0)}</span>
            <Button variant="outline" size="sm" disabled={(assignments?.length ?? 0) < LIMIT} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AssignmentRow({ assignment: a, statusColor, onUpdate }: {
  assignment: {
    id: number; processedAt: Date; mailType: string; assignedTo: string; source: string;
    claimNumber: string | null; status: string; notes: string | null; isLegal: boolean;
    actionTaken: string | null;
  };
  statusColor: Record<string, string>;
  onUpdate: (updates: { status?: "open" | "in_review" | "actioned" | "closed"; notes?: string; claimNumber?: string; actionTaken?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [claimNumber, setClaimNumber] = useState(a.claimNumber ?? "");
  const [status, setStatus] = useState(a.status as "open" | "in_review" | "actioned" | "closed");

  function save() {
    onUpdate({ status, notes, claimNumber });
    setEditing(false);
  }

  return (
    <tr className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${a.isLegal ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(a.processedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {a.isLegal && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
          <span className="text-xs font-medium">{a.mailType}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-xs font-medium">{a.assignedTo}</td>
      <td className="px-4 py-2.5">
        <Badge variant="outline" className="text-xs capitalize">{a.source.replace(/_/g, " ")}</Badge>
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <Input value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} className="h-6 text-xs w-28" />
        ) : (
          <span className="text-xs font-mono">{a.claimNumber ?? "—"}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-6 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status] ?? ""}`}>
            {a.status.replace(/_/g, " ")}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 max-w-[200px]">
        {editing ? (
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs h-14 resize-none" />
        ) : (
          <span className="text-xs text-muted-foreground line-clamp-2">{a.notes ?? "—"}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" className="h-6 px-2 text-xs" onClick={save}><Save className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}><Edit2 className="w-3 h-3" /></Button>
        )}
      </td>
    </tr>
  );
}

// ─── Agent Rules ───────────────────────────────────────────────────────────────
function AgentRules() {
  const CATEGORY_ROUTING = [
    {
      role: "total_loss",
      label: "Total Loss Documents",
      color: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      description: "TL settlement packets, total loss letters, salvage docs, diminished value",
      priority: [
        { order: 1, label: "Priority", name: "Daniel Giono", note: "Primary handler for all TL docs" },
        { order: 2, label: "Secondary", name: "OB Subro Team", note: "Overflow when Giono is at cap or OOO" },
        { order: 3, label: "Third", name: "General Round-Robin", note: "Fallback when both above unavailable" },
      ],
    },
    {
      role: "subro_docs",
      label: "Subrogation Documents",
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      description: "Outbound subro demands, recovery letters, adverse carrier correspondence, subro packets",
      priority: [
        { order: 1, label: "Primary", name: "OB Subro Team", note: "All outbound subro-related documents" },
        { order: 2, label: "Secondary", name: "General Round-Robin", note: "Fallback when OB Subro is at cap or OOO" },
      ],
    },
  ];

  const utils = trpc.useUtils();
  const { data: agents, isLoading } = trpc.mailBot.listAgents.useQuery();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; slackId: string; role: string; dailyCap: number; isActive: boolean; roundRobinOrder: number; isOverflowTarget: boolean }>({
    name: "", slackId: "", role: "general_roundrobin", dailyCap: 3, isActive: true, roundRobinOrder: 0, isOverflowTarget: false,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", slackId: "", role: "general_roundrobin" as "legal" | "lor_roundrobin" | "bi_injury" | "pd" | "general_roundrobin" | "total_loss" | "subro_docs", dailyCap: 3, isActive: true, roundRobinOrder: 0, isOverflowTarget: false });

  const updateMutation = trpc.mailBot.updateAgent.useMutation({
    onSuccess: () => { toast.success("Agent updated"); utils.mailBot.listAgents.invalidate(); setEditingId(null); },
    onError: (err) => toast.error(err.message),
  });
  const addMutation = trpc.mailBot.addAgent.useMutation({
    onSuccess: () => { toast.success("Agent added"); utils.mailBot.listAgents.invalidate(); setShowAdd(false); },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.mailBot.removeAgent.useMutation({
    onSuccess: () => { toast.success("Agent removed"); utils.mailBot.listAgents.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const roleLabels: Record<string, string> = {
    legal: "Legal Handler",
    lor_roundrobin: "LOR Round-Robin",
    bi_injury: "BI / Injury Demands",
    pd: "PD Demands",
    general_roundrobin: "General Round-Robin",
  };

  function startEdit(agent: NonNullable<typeof agents>[number]) {
    setEditingId(agent.id);
    setEditForm({
      name: agent.name, slackId: agent.slackId, role: agent.role,
      dailyCap: agent.dailyCap, isActive: agent.isActive,
      roundRobinOrder: agent.roundRobinOrder, isOverflowTarget: agent.isOverflowTarget,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Configure assignment rules, daily caps, and round-robin order for each agent.</p>
        <Button size="sm" className="gap-2 bg-[#ff6221] hover:bg-[#e5541a] text-white" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" /> Add Agent
        </Button>
      </div>
      {/* Category Routing Rules */}
      <div className="grid md:grid-cols-2 gap-4">
        {CATEGORY_ROUTING.map((cat) => (
          <Card key={cat.role} className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>{cat.label}</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {cat.priority.map((p) => (
                  <div key={p.order} className="flex items-start gap-3 text-xs">
                    <span className="w-16 shrink-0 font-semibold text-muted-foreground">{p.label}</span>
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-2">— {p.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showAdd && (
        <Card className="border-[#ff6221]/40 bg-[#ff6221]/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">New Agent</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><Label className="text-xs">Name</Label><Input className="h-8 mt-1 text-sm" value={newAgent.name} onChange={(e) => setNewAgent(a => ({ ...a, name: e.target.value }))} /></div>
              <div><Label className="text-xs">Slack ID</Label><Input className="h-8 mt-1 text-sm font-mono" value={newAgent.slackId} onChange={(e) => setNewAgent(a => ({ ...a, slackId: e.target.value }))} /></div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={newAgent.role} onValueChange={(v) => setNewAgent(a => ({ ...a, role: v as typeof newAgent.role }))}>
                  <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Daily Cap</Label><Input type="number" className="h-8 mt-1 text-sm" value={newAgent.dailyCap} onChange={(e) => setNewAgent(a => ({ ...a, dailyCap: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs">Round-Robin Order</Label><Input type="number" className="h-8 mt-1 text-sm" value={newAgent.roundRobinOrder} onChange={(e) => setNewAgent(a => ({ ...a, roundRobinOrder: Number(e.target.value) }))} /></div>
              <div className="flex items-end gap-4 pb-1">
                <div className="flex items-center gap-2"><Switch checked={newAgent.isActive} onCheckedChange={(v) => setNewAgent(a => ({ ...a, isActive: v }))} /><Label className="text-xs">Active</Label></div>
                <div className="flex items-center gap-2"><Switch checked={newAgent.isOverflowTarget} onCheckedChange={(v) => setNewAgent(a => ({ ...a, isOverflowTarget: v }))} /><Label className="text-xs">Overflow</Label></div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white" onClick={() => addMutation.mutate(newAgent)}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : agents?.map((agent) => (
          <Card key={agent.id} className={`border-border/50 ${!agent.isActive ? "opacity-50" : ""}`}>
            <CardContent className="p-4">
              {editingId === agent.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div><Label className="text-xs">Name</Label><Input className="h-8 mt-1 text-sm" value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><Label className="text-xs">Slack ID</Label><Input className="h-8 mt-1 text-sm font-mono" value={editForm.slackId} onChange={(e) => setEditForm(f => ({ ...f, slackId: e.target.value }))} /></div>
                    <div>
                      <Label className="text-xs">Role</Label>
                      <Select value={editForm.role} onValueChange={(v) => setEditForm(f => ({ ...f, role: v }))}>
                        <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(roleLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Daily Cap</Label><Input type="number" className="h-8 mt-1 text-sm" value={editForm.dailyCap} onChange={(e) => setEditForm(f => ({ ...f, dailyCap: Number(e.target.value) }))} /></div>
                    <div><Label className="text-xs">Round-Robin Order</Label><Input type="number" className="h-8 mt-1 text-sm" value={editForm.roundRobinOrder} onChange={(e) => setEditForm(f => ({ ...f, roundRobinOrder: Number(e.target.value) }))} /></div>
                    <div className="flex items-end gap-4 pb-1">
                      <div className="flex items-center gap-2"><Switch checked={editForm.isActive} onCheckedChange={(v) => setEditForm(f => ({ ...f, isActive: v }))} /><Label className="text-xs">Active</Label></div>
                      <div className="flex items-center gap-2"><Switch checked={editForm.isOverflowTarget} onCheckedChange={(v) => setEditForm(f => ({ ...f, isOverflowTarget: v }))} /><Label className="text-xs">Overflow</Label></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-1" onClick={() => updateMutation.mutate({ id: agent.id, ...editForm, role: editForm.role as "legal" | "lor_roundrobin" | "bi_injury" | "pd" | "general_roundrobin" | "total_loss" | "subro_docs" })}><Save className="w-3 h-3" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-3 h-3" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{agent.slackId}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{roleLabels[agent.role] ?? agent.role}</Badge>
                    <span className="text-xs text-muted-foreground">Cap: {agent.dailyCap}/day</span>
                    {agent.isOverflowTarget && <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">Overflow</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={agent.isActive} onCheckedChange={(v) => updateMutation.mutate({ id: agent.id, isActive: v })} />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(agent)}><Edit2 className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Remove ${agent.name}?`)) removeMutation.mutate({ id: agent.id }); }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── PTO Manager ───────────────────────────────────────────────────────────────
function PtoManager() {
  const utils = trpc.useUtils();
  const { data: ptoList, isLoading } = trpc.mailBot.listPto.useQuery();
  const { data: agents } = trpc.mailBot.listAgents.useQuery();
  const [form, setForm] = useState({ agentId: "", startDate: "", endDate: "", note: "" });

  const addMutation = trpc.mailBot.addPto.useMutation({
    onSuccess: () => { toast.success("PTO added"); utils.mailBot.listPto.invalidate(); setForm({ agentId: "", startDate: "", endDate: "", note: "" }); },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.mailBot.removePto.useMutation({
    onSuccess: () => { toast.success("PTO removed"); utils.mailBot.listPto.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const agentMap = useMemo(() => {
    const m: Record<number, string> = {};
    agents?.forEach(a => { m[a.id] = a.name; });
    return m;
  }, [agents]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#ff6221]" /> Set PTO / Out of Office
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Agent</Label>
              <Select value={form.agentId} onValueChange={(v) => setForm(f => ({ ...f, agentId: v }))}>
                <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue placeholder="Select agent…" /></SelectTrigger>
                <SelectContent>
                  {agents?.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" className="h-8 mt-1 text-xs" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" className="h-8 mt-1 text-xs" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input className="h-8 mt-1 text-xs" placeholder="Vacation, sick…" value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <Button
            size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2"
            disabled={!form.agentId || !form.startDate || !form.endDate}
            onClick={() => addMutation.mutate({ agentId: Number(form.agentId), startDate: form.startDate, endDate: form.endDate, note: form.note || undefined })}
          >
            <Plus className="w-4 h-4" /> Add PTO
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3"><CardTitle className="text-base">Scheduled PTO</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            !ptoList?.length ? <p className="text-sm text-muted-foreground">No PTO scheduled.</p> :
            <div className="space-y-2">
              {ptoList.map((pto) => (
                <div key={pto.id} className="flex items-center justify-between border border-border/40 rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {(agentMap[pto.agentId] ?? "?").charAt(0)}
                    </div>
                    <div>
                      <span className="font-medium">{agentMap[pto.agentId] ?? `Agent #${pto.agentId}`}</span>
                      <span className="text-muted-foreground ml-3 text-xs">{pto.startDate} → {pto.endDate}</span>
                      {pto.note && <span className="text-muted-foreground ml-2 text-xs italic">{pto.note}</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeMutation.mutate({ id: pto.id })}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Schedule Controller ───────────────────────────────────────────────────────
function ScheduleController() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.mailBot.getConfig.useQuery();
  const updateMutation = trpc.mailBot.updateConfig.useMutation({
    onSuccess: () => { toast.success("Schedule saved"); utils.mailBot.getConfig.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const [cron, setCron] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Sync local state when config loads
  const [synced, setSynced] = useState(false);
  if (config && !synced) {
    setCron(config.cronExpression ?? "0 0 18 * * 2-5");
    setEnabled(config.scheduleEnabled);
    setSynced(true);
  }

  const PRESETS = [
    { label: "Tue–Fri 1:00 PM ET (default)", value: "0 0 18 * * 2-5" },
    { label: "Mon–Fri 9:00 AM ET", value: "0 0 14 * * 1-5" },
    { label: "Mon–Fri 12:00 PM ET", value: "0 0 17 * * 1-5" },
    { label: "Mon–Fri 5:00 PM ET", value: "0 0 22 * * 1-5" },
    { label: "Daily 8:00 AM ET", value: "0 0 13 * * *" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#ff6221]" /> Scheduled Run
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                <div>
                  <p className="text-sm font-medium">Schedule Enabled</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Bot will run automatically on the configured schedule</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => {
                    setEnabled(v);
                    updateMutation.mutate({ scheduleEnabled: v });
                  }}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule Preset</Label>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => { if (p.value !== "custom") setCron(p.value); }}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        cron === p.value && p.value !== "custom"
                          ? "border-[#ff6221] bg-[#ff6221]/10 text-[#ff6221] font-medium"
                          : "border-border/50 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Cron Expression (UTC)</Label>
                <Input
                  className="mt-1 font-mono text-sm h-9"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 0 18 * * 2-5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: sec min hour day month weekday (0=Sun, 1=Mon…). All times UTC.
                </p>
              </div>

              <Button
                className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2"
                onClick={() => updateMutation.mutate({ cronExpression: cron, scheduleEnabled: enabled })}
              >
                <Save className="w-4 h-4" /> Save Schedule
              </Button>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-400">
                <strong>Note:</strong> Schedule changes take effect on the next server restart or when you click Save. The schedule is stored in the database and controlled entirely from this dashboard — not from Manus.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MailBot() {
  return <AdminGate><MailBotInner /></AdminGate>;
}

function MailBotInner() {
  const [subPage, setSubPage] = useState<SubPage>("control");

  const subNav: { id: SubPage; label: string; icon: React.ElementType }[] = [
    { id: "control", label: "Bot Control", icon: Bot },
    { id: "log", label: "Assignment Log", icon: ClipboardList },
    { id: "agents", label: "Agent Rules", icon: Users },
    { id: "pto", label: "PTO Manager", icon: Calendar },
    { id: "schedule", label: "Schedule", icon: Clock },
  ];

  return (
    <WhipLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff6221]/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#ff6221]" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Mail / Fax Bot</h1>
            <p className="text-sm text-muted-foreground">Automated mail triage and assignment from #claims-mail and Gmail/eFax</p>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex gap-1 border-b border-border/50 overflow-x-auto">
          {subNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSubPage(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                subPage === id
                  ? "border-[#ff6221] text-[#ff6221]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {subPage === "control" && <BotControlPanel />}
        {subPage === "log" && <AssignmentLog />}
        {subPage === "agents" && <AgentRules />}
        {subPage === "pto" && <PtoManager />}
        {subPage === "schedule" && <ScheduleController />}
      </div>
    </WhipLayout>
  );
}
// ─── Admin Gate ───────────────────────────────────────────────────────────────
function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  if (loading) return (
    <WhipLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading…</div>
    </WhipLayout>
  );
  if (!user || user.role !== "admin") {
    return (
      <WhipLayout>
        <div className="max-w-md mx-auto mt-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold">Admin Access Required</h2>
          <p className="text-sm text-muted-foreground">The Mail / Fax Bot dashboard is restricted to administrators. Contact your team lead if you need access.</p>
          <Button variant="outline" onClick={() => navigate("/")}>Back to Dashboard</Button>
        </div>
      </WhipLayout>
    );
  }
  return <>{children}</>;
}
