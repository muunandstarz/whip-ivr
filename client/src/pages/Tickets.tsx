import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, CircleDot, Lightbulb, ListFilter, MessageSquarePlus, Send, ShieldCheck, Ticket, Wrench } from 'lucide-react';
import WhipLayout from '@/components/WhipLayout';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const TYPES = ['bug', 'issue', 'suggestion', 'other'] as const;
const STATUSES = ['new', 'triaged', 'in_progress', 'ready_for_approval', 'approved_for_production', 'resolved', 'closed'] as const;
const TRIAGE_STATUSES = ['new', 'triaged', 'in_progress', 'ready_for_approval', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
type TicketType = typeof TYPES[number];
type TicketStatus = typeof STATUSES[number];
type TicketPriority = typeof PRIORITIES[number];

const typeCopy: Record<TicketType, string> = { bug: 'Bug', issue: 'Issue', suggestion: 'Suggestion', other: 'Other' };
const statusCopy: Record<TicketStatus, string> = {
  new: 'New', triaged: 'Triaged', in_progress: 'In progress', ready_for_approval: 'Ready for approval',
  approved_for_production: 'Approved for production', resolved: 'Resolved', closed: 'Closed',
};
const priorityCopy: Record<TicketPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function TicketTypeBadge({ type }: { type: TicketType }) {
  const classes: Record<TicketType, string> = {
    bug: 'border-red-300 bg-red-50 text-red-700', issue: 'border-amber-300 bg-amber-50 text-amber-800',
    suggestion: 'border-blue-300 bg-blue-50 text-blue-800', other: 'border-slate-300 bg-slate-50 text-slate-700',
  };
  return <Badge variant="outline" className={classes[type]}>{typeCopy[type]}</Badge>;
}

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const classes: Record<TicketStatus, string> = {
    new: 'border-primary/25 bg-primary/10 text-primary', triaged: 'border-amber-300 bg-amber-50 text-amber-800',
    in_progress: 'border-blue-300 bg-blue-50 text-blue-800', ready_for_approval: 'border-violet-300 bg-violet-50 text-violet-800',
    approved_for_production: 'border-emerald-300 bg-emerald-50 text-emerald-800', resolved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    closed: 'border-slate-300 bg-slate-50 text-slate-700',
  };
  return <Badge variant="outline" className={classes[status]}>{statusCopy[status]}</Badge>;
}

function TicketSubmitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const submit = trpc.tickets.submit.useMutation();
  const [ticketType, setTicketType] = useState<TicketType>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const save = async () => {
    if (title.trim().length < 3) { toast.error('Give the ticket a brief title.'); return; }
    if (body.trim().length < 10) { toast.error('Add enough detail for the team to reproduce or evaluate it.'); return; }
    try {
      const result = await submit.mutateAsync({ ticketType, title, body });
      await Promise.all([utils.tickets.mine.invalidate(), utils.tickets.list.invalidate()]);
      setTitle(''); setBody(''); setTicketType('bug'); onOpenChange(false);
      toast.success(result.ownerNotified ? `Ticket #${result.id} submitted and sent to leadership now.` : `Ticket #${result.id} submitted for review; the in-dashboard record is saved.`);
    } catch (error: any) { toast.error(error.message ?? 'Ticket could not be submitted.'); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Ticket className="h-5 w-5 text-[#ff6221]" /> Submit a dashboard ticket</DialogTitle>
        <DialogDescription>Report a bug, operational issue, suggestion, or other improvement. Leadership is notified immediately, and the ticket remains visible here through triage and approval.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="space-y-1.5"><Label>Type</Label><Select value={ticketType} onValueChange={(value) => setTicketType(value as TicketType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((type) => <SelectItem key={type} value={type}>{typeCopy[type]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ticket-title">Short title</Label><Input id="ticket-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="What needs attention?" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ticket-detail">Details</Label><Textarea id="ticket-detail" value={body} onChange={(event) => setBody(event.target.value)} rows={7} maxLength={5000} placeholder="Describe what happened, what you expected, and any page, claim, or step that helps reproduce it. Do not include sensitive claim data unless it is necessary." /><p className="text-right text-xs text-muted-foreground">{body.length}/5000</p></div>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="gap-2 bg-[#ff6221] text-white hover:bg-[#e5541a]" disabled={submit.isPending} onClick={save}><Send className="h-4 w-4" />{submit.isPending ? 'Submitting…' : 'Submit ticket'}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

function NotificationState({ ticket }: { ticket: any }) {
  if (ticket.production_approved_at) return <p className="mt-2 text-xs text-emerald-700">Production approval recorded {formatDate(ticket.production_approved_at)}.</p>;
  if (ticket.production_ready_at) return <p className="mt-2 text-xs text-violet-700">Production approval requested {formatDate(ticket.production_ready_at)}.</p>;
  if (ticket.owner_notified_at) return <p className="mt-2 text-xs text-emerald-700">Leadership notified {formatDate(ticket.owner_notified_at)}.</p>;
  if (ticket.owner_notification_error) return <p className="mt-2 text-xs text-amber-700">The ticket was saved; an immediate notification could not be confirmed. The daily digest remains a backup.</p>;
  return null;
}

function MyTicketList() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const { data: tickets, isLoading } = trpc.tickets.mine.useQuery({ status: status === 'all' ? undefined : status as TicketStatus, ticketType: type === 'all' ? undefined : type as TicketType, limit: 150 });
  return <Card><CardHeader className="space-y-3"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><CardTitle className="text-base">My tickets</CardTitle><CardDescription>Submitted dashboard feedback, immediate notice status, and the latest triage decision.</CardDescription></div><div className="grid gap-2 sm:grid-cols-2"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((entry) => <SelectItem key={entry} value={entry}>{statusCopy[entry]}</SelectItem>)}</SelectContent></Select><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{TYPES.map((entry) => <SelectItem key={entry} value={entry}>{typeCopy[entry]}</SelectItem>)}</SelectContent></Select></div></div></CardHeader><CardContent className="space-y-3">{isLoading ? <p className="text-sm text-muted-foreground">Loading your tickets…</p> : !(tickets ?? []).length ? <div className="rounded-lg border border-dashed p-7 text-center"><MessageSquarePlus className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-medium">No tickets in this view</p><p className="mt-1 text-sm text-muted-foreground">Use “Submit ticket” whenever something needs attention.</p></div> : (tickets as any[]).map((ticket) => <article key={ticket.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><TicketTypeBadge type={ticket.ticket_type} /><TicketStatusBadge status={ticket.status} /><span className="text-xs text-muted-foreground">#{ticket.id}</span></div><h3 className="mt-2 font-semibold leading-snug">{ticket.title}</h3></div><span className="text-xs text-muted-foreground">{formatDate(ticket.created_at)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{ticket.body}</p><NotificationState ticket={ticket} />{ticket.triage_note && <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">Team update</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{ticket.triage_note}</p>{ticket.triaged_by_name && <p className="mt-2 text-xs text-muted-foreground">Updated by {ticket.triaged_by_name} · {formatDate(ticket.triaged_at)}</p>}</div>}</article>)}</CardContent></Card>;
}

function TicketTriage() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState('new');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const { data: tickets, isLoading } = trpc.tickets.list.useQuery({ status: status === 'all' ? undefined : status as TicketStatus, ticketType: type === 'all' ? undefined : type as TicketType, search: search || undefined, limit: 300 });
  const triage = trpc.tickets.triage.useMutation();
  const approve = trpc.tickets.approveForProduction.useMutation();
  const digest = trpc.tickets.digestStatus.useQuery();
  const [drafts, setDrafts] = useState<Record<number, { status: TicketStatus; priority: TicketPriority; note: string }>>({});
  const selection = (ticket: any) => drafts[ticket.id] ?? { status: ticket.status as TicketStatus, priority: ticket.priority as TicketPriority, note: ticket.triage_note ?? '' };
  const updateDraft = (ticket: any, patch: Partial<{ status: TicketStatus; priority: TicketPriority; note: string }>) => setDrafts((current) => ({ ...current, [ticket.id]: { ...selection(ticket), ...patch } }));
  const refresh = async () => { await Promise.all([utils.tickets.list.invalidate(), utils.tickets.mine.invalidate()]); };
  const save = async (ticket: any) => {
    const value = selection(ticket);
    try {
      await triage.mutateAsync({ id: ticket.id, status: value.status, priority: value.priority, triageNote: value.note || undefined });
      setDrafts((current) => { const next = { ...current }; delete next[ticket.id]; return next; });
      await refresh();
      toast.success(value.status === 'ready_for_approval' ? `Ticket #${ticket.id} is ready for your production decision; an immediate notice was sent.` : `Ticket #${ticket.id} updated.`);
    } catch (error: any) { toast.error(error.message ?? 'Ticket could not be updated.'); }
  };
  const approveTicket = async (ticket: any) => {
    try {
      await approve.mutateAsync({ id: ticket.id });
      await refresh();
      toast.success(`Production approval for ticket #${ticket.id} is recorded and confirmed now.`);
    } catch (error: any) { toast.error(error.message ?? 'Production approval could not be recorded.'); }
  };
  const openCount = useMemo(() => (tickets ?? []).filter((ticket: any) => !['resolved', 'closed'].includes(ticket.status)).length, [tickets]);
  return <div className="space-y-5"><Card className="border-primary/15"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-primary" /> Ticket notices and production decisions</CardTitle><CardDescription>Every new ticket sends leadership an immediate notification. The weekday 5:30 PM Eastern digest is only a backstop. Mark a completed item “Ready for approval” with an implementation summary, then use the separate approval button to record the production decision in real time.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-medium text-muted-foreground">Digest backstop</p><p className="mt-1 text-sm font-semibold">{digest.data?.is_enabled ? 'Enabled' : 'Paused'}</p></div><div><p className="text-xs font-medium text-muted-foreground">Last successful digest</p><p className="mt-1 text-sm font-semibold">{digest.data?.last_digest_for_date || 'Not delivered yet'}</p></div><div><p className="text-xs font-medium text-muted-foreground">Open in this view</p><p className="mt-1 text-sm font-semibold">{openCount}</p></div></CardContent></Card>
  <Card><CardHeader className="space-y-3"><div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end"><div><CardTitle className="text-base">Team ticket triage</CardTitle><CardDescription>Prioritize, document work, request production approval, and resolve only after the production work is complete.</CardDescription></div><div className="grid gap-2 sm:grid-cols-[minmax(200px,1fr)_190px_170px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or reporter" /><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((entry) => <SelectItem key={entry} value={entry}>{statusCopy[entry]}</SelectItem>)}</SelectContent></Select><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{TYPES.map((entry) => <SelectItem key={entry} value={entry}>{typeCopy[entry]}</SelectItem>)}</SelectContent></Select></div></div></CardHeader><CardContent className="space-y-4">{isLoading ? <p className="text-sm text-muted-foreground">Loading ticket triage…</p> : !(tickets ?? []).length ? <p className="rounded-lg bg-muted/40 p-6 text-sm text-muted-foreground">No tickets match this triage view.</p> : (tickets as any[]).map((ticket) => { const value = selection(ticket); const ready = ticket.status === 'ready_for_approval'; return <article key={ticket.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><TicketTypeBadge type={ticket.ticket_type} /><TicketStatusBadge status={ticket.status} /><Badge variant="outline">{priorityCopy[ticket.priority as TicketPriority]}</Badge><span className="text-xs text-muted-foreground">#{ticket.id}</span></div><h3 className="mt-2 font-semibold">{ticket.title}</h3><p className="mt-1 text-xs text-muted-foreground">Reported by {ticket.reporter_name || ticket.reporter_email || 'Whip team member'} · {formatDate(ticket.created_at)}</p></div>{ready && <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" disabled={approve.isPending} onClick={() => approveTicket(ticket)}><ShieldCheck className="h-4 w-4" />{approve.isPending ? 'Approving…' : 'Approve for production'}</Button>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{ticket.body}</p><NotificationState ticket={ticket} /><div className="mt-4 grid gap-3 border-t pt-4 lg:grid-cols-[190px_180px_1fr_auto]"><div className="space-y-1"><Label className="text-xs">Status</Label><Select value={value.status} onValueChange={(next) => updateDraft(ticket, { status: next as TicketStatus })} disabled={ticket.status === 'approved_for_production'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIAGE_STATUSES.map((entry) => <SelectItem key={entry} value={entry}>{statusCopy[entry]}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Priority</Label><Select value={value.priority} onValueChange={(next) => updateDraft(ticket, { priority: next as TicketPriority })} disabled={ticket.status === 'approved_for_production'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((entry) => <SelectItem key={entry} value={entry}>{priorityCopy[entry]}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Visible team update {value.status === 'ready_for_approval' && <span className="text-violet-700">(required for approval)</span>}</Label><Input value={value.note} onChange={(event) => updateDraft(ticket, { note: event.target.value })} placeholder="What is being investigated, changed, or ready for production?" disabled={ticket.status === 'approved_for_production'} /></div><div className="flex items-end"><Button className="w-full lg:w-auto" onClick={() => save(ticket)} disabled={triage.isPending || ticket.status === 'approved_for_production'}>{triage.isPending ? 'Saving…' : value.status === 'ready_for_approval' ? 'Request approval' : 'Save'}</Button></div></div></article>; })}</CardContent></Card></div>;
}

export default function Tickets() {
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const [location] = useLocation();
  const [submitOpen, setSubmitOpen] = useState(false);
  const isAdmin = user?.role === 'admin' && !isImpersonating;
  const [tab, setTab] = useState('mine');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new') === '1') setSubmitOpen(true); }, [location]);
  return <WhipLayout><div className="space-y-5 p-4 sm:p-6"><header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d13]"><MessageSquarePlus className="h-4 w-4" /> Dashboard feedback</div><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Tickets</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Send bugs, issues, suggestions, and operational feedback directly to the dashboard team. Leadership is notified immediately, and you can follow the response here.</p></div><Button className="gap-2 bg-[#ff6221] text-white hover:bg-[#e5541a]" onClick={() => setSubmitOpen(true)}><MessageSquarePlus className="h-4 w-4" /> Submit ticket</Button></header><Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="mine"><CircleDot className="h-4 w-4" /> My tickets</TabsTrigger>{isAdmin && <TabsTrigger value="triage"><ListFilter className="h-4 w-4" /> Team triage</TabsTrigger>}</TabsList><TabsContent value="mine" className="mt-5"><MyTicketList /></TabsContent>{isAdmin && <TabsContent value="triage" className="mt-5"><TicketTriage /></TabsContent>}</Tabs><TicketSubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} /></div></WhipLayout>;
}
