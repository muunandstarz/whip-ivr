import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, BookOpenCheck, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, FileText, Gavel, Info, Layers3, MessageSquare, Plus, Repeat2, Scale, Send, ShieldCheck, Target, Trophy, TrendingUp, UserCheck, Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const ROLE_OPTIONS = ['First Party', 'Liability - PD', 'Liability - Injury', 'Intake'] as const;
type ResultValue = 'pending' | 'met' | 'not_met' | 'not_applicable' | 'not_determinable';

const resultCopy: Record<ResultValue, string> = {
  pending: 'Pending',
  met: 'Met',
  not_met: 'Not met',
  not_applicable: 'Not applicable',
  not_determinable: 'Not determinable',
};

function displayDate(value?: string | Date | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'MMM d, yyyy');
}

function sourcePayload(evaluation: any) {
  if (!evaluation?.legacy_payload) return null;
  try {
    const parsed = JSON.parse(evaluation.legacy_payload);
    return parsed?.kind === 'airtable_claims_qa' ? parsed : null;
  } catch {
    return null;
  }
}

function auditDisplayKey(evaluation: any) {
  return sourcePayload(evaluation)?.auditId
    || String(evaluation?.evaluation_key ?? '').replace(/^airtable-claims-qa-/, '')
    || '—';
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    not_released: 'Ready for leadership review',
    released: 'Released to handler',
    responded: 'Handler responded',
    in_adjudication: 'In adjudication',
    closed: 'Closed',
  };
  return labels[value ?? ''] ?? 'Unknown';
}

function ratingLabel(value?: string | null) {
  const labels: Record<string, string> = {
    critical_miss: 'Critical miss',
    small_sample: 'Small sample',
    strong: 'Strong',
    solid: 'Solid',
    needs_work: 'Needs work',
  };
  return labels[value ?? ''] ?? 'Not rated';
}

function RatingBadge({ value }: { value?: string | null }) {
  const className = value === 'critical_miss'
    ? 'border-red-300 bg-red-50 text-red-700'
    : value === 'strong'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : value === 'solid'
        ? 'border-blue-300 bg-blue-50 text-blue-700'
        : value === 'needs_work'
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={className}>{ratingLabel(value)}</Badge>;
}

function handlerInitials(name?: string | null) {
  return String(name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function roleShort(role?: string | null) {
  const labels: Record<string, string> = { 'First Party': 'FP', 'Liability - PD': 'PD', 'Liability - Injury': 'BI', Intake: 'Intake' };
  return labels[role ?? ''] ?? role ?? '—';
}

function scoreTone(rating?: string | null) {
  if (rating === 'strong') return 'bg-emerald-100 text-emerald-800';
  if (rating === 'solid') return 'bg-amber-100 text-amber-800';
  if (rating === 'critical_miss') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

function ResultBadge({ value }: { value?: string | null }) {
  const className = value === 'met'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : value === 'not_met'
      ? 'border-red-300 bg-red-50 text-red-700'
      : value === 'not_applicable'
        ? 'border-slate-300 bg-slate-50 text-slate-700'
        : value === 'not_determinable'
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={className}>{resultCopy[(value ?? 'pending') as ResultValue] ?? 'Pending'}</Badge>;
}

function Definition({ label, body }: { label: string; body: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-4">
          {label}<Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-xs leading-relaxed">{body}</TooltipContent>
    </Tooltip>
  );
}

function Metric({ label, value, caption, tone = 'navy' }: { label: string; value: string | number; caption?: string; tone?: 'navy' | 'orange' | 'green' | 'red' }) {
  const tones = {
    navy: 'bg-primary/10 text-primary',
    orange: 'bg-[#ff6221]/10 text-[#d94d13]',
    green: 'bg-emerald-500/10 text-emerald-700',
    red: 'bg-red-500/10 text-red-700',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
            {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
          </div>
          <div className={`rounded-lg p-2 ${tones[tone]}`}><ClipboardCheck className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateEvaluationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { data: handlers } = trpc.handlers.list.useQuery();
  const createDraft = trpc.claimsQa.createDraft.useMutation();
  const utils = trpc.useUtils();
  const [handlerId, setHandlerId] = useState('');
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>('First Party');
  const [claimNumber, setClaimNumber] = useState('');
  const [exposureId, setExposureId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [summary, setSummary] = useState('');
  const [improvements, setImprovements] = useState('');

  const submit = async () => {
    const handler = handlers?.find((row: any) => String(row.id) === handlerId);
    if (!handler) { toast.error('Select the handler being evaluated.'); return; }
    try {
      const result = await createDraft.mutateAsync({
        handlerId: handler.id,
        handlerName: handler.name,
        role,
        claimNumber: claimNumber || undefined,
        exposureId: exposureId || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        auditorSummary: summary || undefined,
        areasForImprovement: improvements || undefined,
      });
      await utils.claimsQa.invalidate();
      toast.success(`Draft created with ${result.resultCount} scorecard lines.`);
      onOpenChange(false);
    } catch (error: any) { toast.error(error.message ?? 'Unable to create the evaluation.'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#ff6221]" /> New Claims QA evaluation</DialogTitle>
          <DialogDescription>Creates an unreleased draft with the active rubric for the selected role. Score and confirm all lines before manual release.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Handler</Label><Select value={handlerId} onValueChange={setHandlerId}><SelectTrigger><SelectValue placeholder="Choose handler" /></SelectTrigger><SelectContent>{(handlers ?? []).map((handler: any) => <SelectItem key={handler.id} value={String(handler.id)}>{handler.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Role scorecard</Label><Select value={role} onValueChange={(value) => setRole(value as (typeof ROLE_OPTIONS)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((entry) => <SelectItem value={entry} key={entry}>{entry}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Claim number</Label><Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label>Exposure ID</Label><Input value={exposureId} onChange={(event) => setExposureId(event.target.value)} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Auditor summary</Label><Textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="State the sample, the scored and N/A line counts, and file corrections required." /></div>
        <div className="space-y-1.5"><Label>Areas for improvement</Label><Textarea rows={3} value={improvements} onChange={(event) => setImprovements(event.target.value)} placeholder="Coaching context for the complete evaluation." /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white" disabled={createDraft.isPending} onClick={submit}>{createDraft.isPending ? 'Creating…' : 'Create unreleased draft'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ScoreLine({ line, evaluation, leadership }: { line: any; evaluation: any; leadership: boolean }) {
  const utils = trpc.useUtils();
  const saveLine = trpc.claimsQa.saveLine.useMutation();
  const respond = trpc.claimsQa.respondToLine.useMutation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ResultValue>(line.result ?? 'pending');
  const [evidence, setEvidence] = useState(line.evidence ?? '');
  const [locator, setLocator] = useState(line.evidence_locator ?? '');
  const [note, setNote] = useState(line.auditor_note ?? '');
  const [confirmed, setConfirmed] = useState(Boolean(line.human_confirmed_at));
  const [response, setResponse] = useState<'agree' | 'disagree' | ''>(line.handler_response ?? '');
  const [responseComment, setResponseComment] = useState(line.handler_response_comment ?? '');
  const isDraft = evaluation.status === 'not_released';

  const refresh = async () => { await utils.claimsQa.detail.invalidate({ evaluationId: evaluation.id }); await utils.claimsQa.invalidate(); };
  const save = async () => {
    try {
      await saveLine.mutateAsync({ evaluationId: evaluation.id, resultId: line.id, result: value, evidence: evidence || undefined, evidenceLocator: locator || undefined, auditorNote: note || undefined, humanConfirmed: confirmed });
      await refresh(); setEditing(false); toast.success(`${line.item_key} saved.`);
    } catch (error: any) { toast.error(error.message ?? 'Unable to save the score.'); }
  };
  const saveResponse = async (next: 'agree' | 'disagree') => {
    try {
      await respond.mutateAsync({ evaluationId: evaluation.id, resultId: line.id, response: next, comment: responseComment || undefined });
      setResponse(next); await refresh(); toast.success(next === 'agree' ? 'Agreement saved.' : 'Dispute saved for adjudication.');
    } catch (error: any) { toast.error(error.message ?? 'Unable to save response.'); }
  };

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{line.item_key}</span>{line.critical ? <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">Critical</Badge> : null}{line.requires_human_confirmation ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Human confirm required</Badge> : null}</div><p className="mt-1 text-sm font-semibold leading-relaxed">{line.check_text}</p></div>
        <ResultBadge value={line.result} />
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2"><div className="rounded-md bg-muted/50 p-2"><span className="font-medium text-muted-foreground">Passes when:</span><p className="mt-1 leading-relaxed">{line.passing_standard}</p></div><div className="rounded-md bg-muted/50 p-2"><span className="font-medium text-muted-foreground">Where to find it:</span><p className="mt-1 leading-relaxed">{line.where_to_find}</p><p className="mt-1 text-muted-foreground">Graded by {line.grading_method}</p></div></div>
      {(line.evidence || line.evidence_locator || line.auditor_note) && <div className="rounded-md border border-primary/15 bg-primary/[0.03] p-3 text-sm"><p className="font-medium text-primary">Evidence</p>{line.evidence && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{line.evidence}</p>}{line.evidence_locator && <p className="mt-2 text-xs text-muted-foreground">Source: {line.evidence_locator}</p>}{line.auditor_note && <p className="mt-2 text-xs italic text-muted-foreground">Auditor note: {line.auditor_note}</p>}</div>}
      {line.adjudication_outcome && <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><p className="font-medium">Adjudication: {line.adjudication_outcome.replaceAll('_', ' ')}</p><p className="mt-1 whitespace-pre-wrap">{line.adjudication_note}</p></div>}
      {leadership && isDraft && (
        <div className="border-t pt-3"><Button size="sm" variant="outline" onClick={() => setEditing((current) => !current)}>{editing ? 'Close score editor' : 'Score or revise line'}</Button>
          {editing && <div className="mt-3 grid gap-3 rounded-lg bg-muted/30 p-3"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label className="text-xs">Result</Label><Select value={value} onValueChange={(next) => setValue(next as ResultValue)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(resultCopy).map(([key, label]) => <SelectItem value={key} key={key}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Evidence location</Label><Input value={locator} onChange={(event) => setLocator(event.target.value)} placeholder="Note number, date, author, or field path" /></div></div><div className="space-y-1"><Label className="text-xs">Evidence or N/A explanation</Label><Textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={4} placeholder="Full evidence; nothing is truncated." /></div><div className="space-y-1"><Label className="text-xs">Auditor note</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} /></div>{line.requires_human_confirmation && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />I completed the required human confirmation for this critical machine-judged line.</label>}<div><Button size="sm" className="bg-primary text-white" onClick={save} disabled={saveLine.isPending}>{saveLine.isPending ? 'Saving…' : 'Save score'}</Button></div></div>}
        </div>
      )}
      {!leadership && !isDraft && <div className="border-t pt-3 space-y-2"><p className="text-xs font-medium text-muted-foreground">Your response</p>{response !== 'agree' && <Textarea rows={2} value={responseComment} onChange={(event) => setResponseComment(event.target.value)} placeholder="Comment is required if you disagree." />}<div className="flex flex-wrap gap-2"><Button size="sm" variant={response === 'agree' ? 'default' : 'outline'} onClick={() => saveResponse('agree')} disabled={respond.isPending}>Agree</Button><Button size="sm" variant={response === 'disagree' ? 'default' : 'outline'} className={response === 'disagree' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''} onClick={() => saveResponse('disagree')} disabled={respond.isPending}>Disagree</Button>{response && <span className="text-xs self-center text-muted-foreground">Response saved</span>}</div></div>}
    </div>
  );
}

function ReviewedExample({ line, index }: { line: any; index: number }) {
  const evidence = line.evidence || line.auditor_note || 'No supporting evidence was recorded for this line.';
  const explanation = line.result === 'met'
    ? 'The evidence supports the required standard.'
    : line.result === 'not_met'
      ? 'The required standard was not demonstrated in the reviewed evidence.'
      : line.result === 'not_applicable'
        ? 'This check did not apply to this claim.'
        : 'The file did not contain enough information to make a determination.';

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50/80 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-primary">{line.item_key}</span>{line.critical && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Critical</Badge>}</div>
            <p className="mt-1 text-sm font-semibold leading-snug">{line.check_text}</p>
          </div>
        </div>
        <ResultBadge value={line.result} />
      </div>
      <div className="grid divide-y text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What was reviewed</p>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{evidence}</p>
          {line.evidence_locator && <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Source:</span> {line.evidence_locator}</p>}
        </div>
        <div className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Why this result</p>
          <p className="mt-2 leading-relaxed">{line.auditor_note || explanation}</p>
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs"><span className="font-semibold">Pass standard:</span> {line.passing_standard}</div>
        </div>
      </div>
    </div>
  );
}

function MessageThread({ evaluation, messages, leadership }: { evaluation: any; messages: any[]; leadership: boolean }) {
  const addMessage = trpc.claimsQa.addMessage.useMutation();
  const utils = trpc.useUtils();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'handler' | 'leadership'>('handler');
  const send = async () => {
    try { await addMessage.mutateAsync({ evaluationId: evaluation.id, body, visibility }); setBody(''); await utils.claimsQa.detail.invalidate({ evaluationId: evaluation.id }); toast.success('Message added to the evaluation.'); }
    catch (error: any) { toast.error(error.message ?? 'Unable to add message.'); }
  };
  return <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Coaching conversation</CardTitle><CardDescription>Messages remain attached to this evaluation rather than being moved to email.</CardDescription></CardHeader><CardContent className="space-y-3">{messages.length ? <div className="space-y-2">{messages.map((message) => <div key={message.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">{message.author_name}</span><span>{displayDate(message.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No coaching messages yet.</p>}<div className="border-t pt-3 space-y-2"><Textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a message that remains with this evaluation…" />{leadership && <Select value={visibility} onValueChange={(value) => setVisibility(value as 'handler' | 'leadership')}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="handler">Visible to handler and leadership</SelectItem><SelectItem value="leadership">Leadership only</SelectItem></SelectContent></Select>}<Button size="sm" className="gap-1" onClick={send} disabled={!body.trim() || addMessage.isPending}><Send className="h-3 w-3" />{addMessage.isPending ? 'Sending…' : 'Add message'}</Button></div></CardContent></Card>;
}

function EvaluationDetail({ evaluationId, open, onOpenChange, leadership }: { evaluationId: number | null; open: boolean; onOpenChange: (value: boolean) => void; leadership: boolean }) {
  const detailQuery = trpc.claimsQa.detail.useQuery({ evaluationId: evaluationId ?? 0 }, { enabled: Boolean(evaluationId && open) });
  const utils = trpc.useUtils();
  const release = trpc.claimsQa.release.useMutation();
  const signOff = trpc.claimsQa.signOff.useMutation();
  const createCalibration = trpc.claimsQa.createCalibration.useMutation();
  const [signoffText, setSignoffText] = useState('');
  const [detailTab, setDetailTab] = useState<'review' | 'items' | 'notes' | 'activity'>('review');
  const detail = detailQuery.data as any;
  const evaluation = detail?.evaluation;
  const grouped = useMemo(() => {
    const values = (detail?.results ?? []) as any[];
    return values.reduce((groups: Record<string, any[]>, line) => { (groups[line.category] ??= []).push(line); return groups; }, {});
  }, [detail?.results]);
  const source = sourcePayload(evaluation);
  const scoredLines = (detail?.results ?? []).filter((line: any) => ['met', 'not_met'].includes(line.result));
  const missedLines = scoredLines.filter((line: any) => line.result === 'not_met');
  const reviewedExamples = [...missedLines, ...scoredLines.filter((line: any) => line.result === 'met')].slice(0, 4);
  const recommendedOutcome = evaluation?.original_critical_failures > 0 || missedLines.length > 0 ? 'Review required' : 'Ready to release';
  useEffect(() => { setDetailTab('review'); setSignoffText(''); }, [evaluationId]);
  // Hooks must remain unconditional while the selected audit changes between
  // null and an ID. Rendering nothing is deferred until every hook is called.
  if (!evaluationId) return null;
  const handleRelease = async () => { try { await release.mutateAsync({ evaluationId }); await utils.claimsQa.invalidate(); toast.success('Evaluation released to the handler.'); } catch (error: any) { toast.error(error.message ?? 'Unable to release evaluation.'); } };
  const handleSignOff = async () => { try { await signOff.mutateAsync({ evaluationId, overallResponse: signoffText }); await utils.claimsQa.invalidate(); toast.success('Evaluation sign-off recorded.'); } catch (error: any) { toast.error(error.message ?? 'Unable to sign off.'); } };
  const openCalibration = async () => { try { const result = await createCalibration.mutateAsync({ evaluationId }); await utils.claimsQa.invalidate(); toast.success(result.existing ? 'Existing open calibration retained.' : 'Calibration opened for independent review.'); } catch (error: any) { toast.error(error.message ?? 'Unable to create calibration.'); } };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[760px] lg:w-[44vw]"><SheetHeader className="border-b bg-card px-5 py-4 pr-12"><div className="flex flex-wrap items-center justify-between gap-3"><div><SheetTitle className="text-xl">{auditDisplayKey(evaluation)}</SheetTitle><SheetDescription>Claim {evaluation?.claim_number || 'not supplied'}</SheetDescription></div>{evaluation && <Badge variant="outline" className={evaluation.status === 'not_released' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}>{statusLabel(evaluation.status)}</Badge>}</div><div className="-mb-4 mt-2 flex gap-6 overflow-x-auto text-sm font-medium">{([{ key: 'review', label: 'Overview' }, { key: 'items', label: `Audit items (${detail?.results?.length ?? 0})` }, { key: 'notes', label: leadership ? `Notes (${detail?.messages?.length ?? 0})` : 'My response' }, { key: 'activity', label: 'Activity log' }] as const).map((entry) => <button key={entry.key} onClick={() => setDetailTab(entry.key)} className={`whitespace-nowrap border-b-2 pb-3 transition ${detailTab === entry.key ? 'border-[#ff6221] text-[#d94d13]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{entry.label}</button>)}</div></SheetHeader>
    <div className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-5">{detailQuery.isLoading ? <p className="p-8 text-center text-muted-foreground">Loading full scorecard…</p> : !evaluation ? <p className="p-8 text-center text-muted-foreground">Evaluation unavailable.</p> : <div className="space-y-4 pb-8">
      {detailTab === 'review' && <>
        <Card><CardContent className="p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{handlerInitials(evaluation.handler_name)}</div><div><p className="font-bold">{evaluation.handler_name}</p><p className="text-sm text-muted-foreground">Handler · {evaluation.role}</p></div></div><div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3"><div><p className="text-muted-foreground">Role</p><p className="mt-1 font-semibold">{roleShort(evaluation.role)}</p></div><div><p className="text-muted-foreground">Audit date</p><p className="mt-1 font-semibold">{displayDate(evaluation.audit_date)}</p></div><div className="col-span-2 sm:col-span-1"><p className="text-muted-foreground">Auditor</p><p className="mt-1 font-semibold">{evaluation.auditor_name || 'Claims QA'}</p></div></div></div></CardContent></Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Rating</p><p className="mt-1 text-xl font-bold">{ratingLabel(evaluation.original_rating)}</p><p className="mt-1 text-xs text-muted-foreground">{source?.scoreInWords ?? 'Critical-first rating'}</p></div><Trophy className="h-5 w-5 text-emerald-600" /></div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Score</p><p className="mt-1 text-xl font-bold">{evaluation.original_items_met} / {evaluation.original_items_scored}</p><p className="mt-1 text-xs text-muted-foreground">{evaluation.original_pass_rate == null ? 'Small sample' : `${evaluation.original_pass_rate}% pass rate`}</p></div><BarChart3 className="h-5 w-5 text-emerald-600" /></div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Critical failures</p><p className="mt-1 text-xl font-bold">{evaluation.original_critical_failures}</p><p className="mt-1 text-xs text-muted-foreground">Never averaged away</p></div><CircleAlert className={`h-5 w-5 ${evaluation.original_critical_failures ? 'text-red-600' : 'text-emerald-600'}`} /></div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">N/A lines</p><p className="mt-1 text-xl font-bold">{evaluation.original_not_applicable} + {evaluation.original_not_determinable}</p><p className="mt-1 text-xs text-muted-foreground">N/A + not determinable</p></div><FileText className="h-5 w-5 text-primary" /></div></CardContent></Card></div>
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${recommendedOutcome === 'Ready to release' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended outcome</p><p className="mt-1 font-bold">{recommendedOutcome}</p></div><RatingBadge value={evaluation.original_rating} /></div>
        {(evaluation.auditor_summary || evaluation.areas_for_improvement || source?.strengths) && <div className="grid gap-3 lg:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary" /> Auditor summary</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{evaluation.auditor_summary || 'No summary supplied.'}</CardContent></Card><Card className="border-emerald-200 bg-emerald-50/50"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-emerald-900"><Trophy className="h-4 w-4" /> Strengths</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{source?.strengths || 'No strengths summary supplied.'}</CardContent></Card><Card className="border-orange-200 bg-orange-50/50"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-orange-900"><Target className="h-4 w-4" /> Areas for improvement</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{evaluation.areas_for_improvement || 'No scored misses in this file.'}</CardContent></Card></div>}
        {leadership && evaluation.status === 'not_released' && <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 lg:grid-cols-[1fr_220px]"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="text-sm text-amber-950"><p className="font-semibold">Manual release safeguard</p><p className="mt-1 leading-relaxed">Review the examples below, confirm every scored line, and add context before manually pushing this audit to the handler.</p></div></div><div className="grid gap-2"><Button className="bg-[#ff4f00] text-white hover:bg-[#e54800]" onClick={handleRelease} disabled={release.isPending || !(detail.results ?? []).length}><Send className="mr-2 h-4 w-4" />{release.isPending ? 'Releasing…' : 'Release to handler'}</Button><Button variant="outline" className="bg-white" onClick={() => setDetailTab('items')}>Review or revise scores</Button><Button variant="outline" className="bg-white" onClick={() => setDetailTab('notes')}>Add leadership note</Button></div></div>}
        {leadership && evaluation.status !== 'not_released' && <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDetailTab('notes')}><MessageSquare className="mr-2 h-4 w-4" />Review notes</Button><Button variant="outline" onClick={openCalibration} disabled={createCalibration.isPending}><Scale className="mr-2 h-4 w-4" />{createCalibration.isPending ? 'Opening…' : 'Open calibration'}</Button></div>}
        {!leadership && evaluation.handler_overall_response && <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4 text-primary" /> Your response</CardTitle><CardDescription>Submitted {displayDate(evaluation.handler_signed_off_at)}</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{evaluation.handler_overall_response}</p></CardContent></Card>}
        <Card><CardHeader className="pb-3"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Reviewed examples</CardTitle><CardDescription>Clear samples of the exact checks, evidence reviewed, and reason for each outcome. Misses appear first.</CardDescription></div><Button size="sm" variant="outline" onClick={() => setDetailTab('items')}>View all {detail?.results?.length ?? 0} audit items <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></CardHeader><CardContent className="space-y-3">{reviewedExamples.map((line: any, index: number) => <ReviewedExample key={line.id} line={line} index={index} />)}</CardContent></Card>
        {!leadership && ['released', 'in_adjudication'].includes(evaluation.status) && <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><UserCheck className="h-4 w-4 text-primary" /> Handler sign-off</CardTitle><CardDescription>Respond to every scored line under Audit items, then add your overall response.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea rows={3} value={signoffText} onChange={(event) => setSignoffText(event.target.value)} placeholder="Confirm what you reviewed, agreed with, or disputed…" /><Button className="bg-[#ff4f00] text-white hover:bg-[#e54800]" onClick={handleSignOff} disabled={signOff.isPending}>{signOff.isPending ? 'Signing off…' : 'Submit sign-off'}</Button></CardContent></Card>}
      </>}
      {detailTab === 'items' && <section className="space-y-5">{Object.entries(grouped).map(([category, lines]) => { const categoryLines = lines as any[]; const met = categoryLines.filter((line) => line.result === 'met').length; const notMet = categoryLines.filter((line) => line.result === 'not_met').length; const notApplicable = categoryLines.filter((line) => line.result === 'not_applicable').length; const notDeterminable = categoryLines.filter((line) => line.result === 'not_determinable').length; const critical = categoryLines.filter((line) => line.critical && line.result === 'not_met').length; return <div key={category} className="space-y-3"><div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 py-3 backdrop-blur"><h3 className="font-semibold">{category}</h3><Badge variant="outline">{met} met / {met + notMet} scored</Badge>{notMet > 0 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{notMet} not met</Badge>}{(notApplicable + notDeterminable) > 0 && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{notApplicable} N/A · {notDeterminable} not determinable</Badge>}{critical > 0 && <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">{critical} critical</Badge>}</div><div className="space-y-3">{categoryLines.map((line) => <ScoreLine key={line.id} line={line} evaluation={evaluation} leadership={leadership} />)}</div></div>; })}</section>}
      {detailTab === 'notes' && <MessageThread evaluation={evaluation} messages={detail.messages ?? []} leadership={leadership} />}
      {detailTab === 'activity' && <Card><CardHeader><CardTitle className="text-base">Audit activity</CardTitle><CardDescription>Key workflow events for this evaluation.</CardDescription></CardHeader><CardContent className="space-y-4">{[{ label: 'Audit created', value: evaluation.created_at }, { label: 'Audited', value: evaluation.audit_date }, { label: 'Released to handler', value: evaluation.released_at }, { label: 'Handler signed off', value: evaluation.handler_signed_off_at }, { label: 'Closed', value: evaluation.closed_at }].filter((entry) => entry.value).map((entry) => <div key={entry.label} className="flex gap-3"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ff6221]" /><div><p className="text-sm font-semibold">{entry.label}</p><p className="text-xs text-muted-foreground">{displayDate(entry.value)}</p></div></div>)}</CardContent></Card>}
    </div>}</div>
  </SheetContent></Sheet>;
}

function EvaluationTable({ leadership, onOpen }: { leadership: boolean; onOpen: (id: number) => void }) {
  const [role, setRole] = useState('all');
  const [queueView, setQueueView] = useState(leadership ? 'ready' : 'action');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data: evaluations, isLoading } = trpc.claimsQa.list.useQuery({ role: role === 'all' ? undefined : role, limit: 300 });
  const allEvaluations = (evaluations ?? []) as any[];
  const queueCounts = useMemo(() => ({
    ready: allEvaluations.filter((row) => row.status === 'not_released').length,
    action: allEvaluations.filter((row) => ['released', 'in_adjudication'].includes(row.status)).length,
    responded: allEvaluations.filter((row) => row.status === 'responded').length,
    closed: allEvaluations.filter((row) => row.status === 'closed').length,
  }), [evaluations]);
  const visibleEvaluations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allEvaluations.filter((evaluation) => {
      const matchesQueue = queueView === 'all'
        || (queueView === 'ready' && evaluation.status === 'not_released')
        || (queueView === 'action' && ['released', 'in_adjudication'].includes(evaluation.status))
        || (queueView === 'responded' && evaluation.status === 'responded')
        || (queueView === 'closed' && evaluation.status === 'closed');
      if (!matchesQueue) return false;
      if (!needle) return true;
      return [auditDisplayKey(evaluation), evaluation.handler_name, evaluation.claim_number, evaluation.role, ratingLabel(evaluation.original_rating), statusLabel(evaluation.status)]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [allEvaluations, queueView, search]);
  const totalScored = allEvaluations.reduce((sum, row) => sum + Number(row.original_items_scored ?? 0), 0);
  const totalMet = allEvaluations.reduce((sum, row) => sum + Number(row.original_items_met ?? 0), 0);
  const averagePassRate = totalScored >= 15 ? Math.round((totalMet / totalScored) * 100) : null;
  const criticalFindings = allEvaluations.reduce((sum, row) => sum + Number(row.original_critical_failures ?? 0), 0);
  const filters = leadership
    ? [{ key: 'ready', label: 'Ready for review', count: queueCounts.ready }, { key: 'action', label: 'In review', count: queueCounts.action }, { key: 'responded', label: 'Handler responded', count: queueCounts.responded }, { key: 'closed', label: 'Closed', count: queueCounts.closed }, { key: 'all', label: 'All', count: allEvaluations.length }]
    : [{ key: 'action', label: 'Needs my review', count: queueCounts.action }, { key: 'responded', label: 'Responded', count: queueCounts.responded }, { key: 'closed', label: 'Closed', count: queueCounts.closed }, { key: 'all', label: 'All', count: allEvaluations.length }];
  const pageCount = Math.max(1, Math.ceil(visibleEvaluations.length / 10));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visibleEvaluations.slice(safePage * 10, safePage * 10 + 10);
  useEffect(() => { setPage(0); }, [queueView, role, search]);
  useEffect(() => { setQueueView(leadership ? 'ready' : 'action'); }, [leadership]);

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={leadership ? 'Audits ready' : 'Available reviews'} value={leadership ? queueCounts.ready : queueCounts.action} caption={leadership ? 'Ready for leadership review' : 'Released to you for review'} />
      <Metric label="Critical findings" value={criticalFindings} caption="Require focused attention" tone={criticalFindings ? 'red' : 'green'} />
      <Metric label="Average pass rate" value={averagePassRate == null ? '—' : `${averagePassRate}%`} caption={`${totalMet} / ${totalScored} scored lines met`} tone="green" />
      <Metric label={leadership ? 'Leadership actions' : 'Completed responses'} value={leadership ? queueCounts.action + queueCounts.responded : queueCounts.responded + queueCounts.closed} caption={leadership ? 'Released, disputed, or responded' : 'Submitted or closed'} tone="orange" />
    </div>
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="space-y-4 border-b pb-0">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div><CardTitle className="text-lg">{leadership ? 'Audit queue' : 'My audit reviews'} <span className="text-muted-foreground">({visibleEvaluations.length})</span></CardTitle><CardDescription>{leadership ? 'Choose an audit to compare the exact check, evidence reviewed, and outcome before release.' : 'Review released scorecards, respond to each finding, and sign off.'}</CardDescription></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(260px,1fr)_180px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search audits, claims, or handlers…" /><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{ROLE_OPTIONS.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="flex gap-5 overflow-x-auto">{filters.map((filter) => <button key={filter.key} onClick={() => setQueueView(filter.key)} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition ${queueView === filter.key ? 'border-[#ff6221] text-[#d94d13]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{filter.label} ({filter.count})</button>)}</div>
      </CardHeader>
      <CardContent className="p-0">{isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading claim audits…</p> : !visibleEvaluations.length ? <p className="p-8 text-center text-sm text-muted-foreground">No audits match this queue and filter.</p> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><th className="w-10 px-4 py-3"></th><th className="px-4 py-3">Audit / claim</th><th className="px-4 py-3">Handler</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Critical</th><th className="px-4 py-3">Review state</th><th className="px-4 py-3">Date</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y">{pageRows.map((evaluation) => <tr key={evaluation.id} role="button" tabIndex={0} onClick={() => onOpen(evaluation.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(evaluation.id); } }} className="group cursor-pointer transition hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff6221]"><td className="px-4 py-3"><span className="block h-4 w-4 rounded border bg-background" /></td><td className="px-4 py-3"><p className="font-mono text-xs font-bold text-foreground">{auditDisplayKey(evaluation)}</p><p className="mt-1 max-w-[200px] truncate text-xs text-muted-foreground">Claim {evaluation.claim_number || '—'}</p></td><td className="px-4 py-3 font-medium">{evaluation.handler_name}</td><td className="px-4 py-3"><Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">{roleShort(evaluation.role)}</Badge></td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-bold ${scoreTone(evaluation.original_rating)}`}>{evaluation.original_items_met}/{evaluation.original_items_scored}</span></td><td className={`px-4 py-3 font-bold ${evaluation.original_critical_failures ? 'text-red-700' : ''}`}>{evaluation.original_critical_failures}</td><td className="px-4 py-3"><Badge variant="outline" className={evaluation.status === 'not_released' ? 'border-blue-100 bg-blue-50 text-blue-700' : ''}>{statusLabel(evaluation.status)}</Badge></td><td className="px-4 py-3 text-xs">{displayDate(evaluation.audit_date)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" className="gap-1 bg-white" onClick={(event) => { event.stopPropagation(); onOpen(evaluation.id); }}>Open review <ChevronRight className="h-3 w-3" /></Button></td></tr>)}</tbody></table></div>
        <div className="divide-y md:hidden">{pageRows.map((evaluation) => <button key={evaluation.id} onClick={() => onOpen(evaluation.id)} className="w-full p-4 text-left transition hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold">{auditDisplayKey(evaluation)}</p><p className="mt-1 font-medium">{evaluation.handler_name}</p><p className="text-xs text-muted-foreground">Claim {evaluation.claim_number || '—'} · {roleShort(evaluation.role)}</p></div><span className={`rounded px-2 py-1 text-xs font-bold ${scoreTone(evaluation.original_rating)}`}>{evaluation.original_items_met}/{evaluation.original_items_scored}</span></div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline">{statusLabel(evaluation.status)}</Badge><span className="inline-flex items-center gap-1 text-xs font-medium">Open review <ChevronRight className="h-3 w-3" /></span></div></button>)}</div>
        <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {safePage * 10 + 1}–{Math.min((safePage + 1) * 10, visibleEvaluations.length)} of {visibleEvaluations.length} audits</span><div className="flex items-center gap-1"><Button size="sm" variant="outline" className="h-8 w-8 bg-white p-0" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>{Array.from({ length: Math.min(5, pageCount) }, (_, index) => { const number = pageCount <= 5 ? index : Math.min(Math.max(safePage - 2, 0) + index, pageCount - 1); return <Button key={number} size="sm" variant={number === safePage ? 'default' : 'outline'} className={`h-8 w-8 p-0 ${number === safePage ? 'bg-[#ff6221] text-white hover:bg-[#e5541a]' : 'bg-white'}`} onClick={() => setPage(number)}>{number + 1}</Button>; })}<Button size="sm" variant="outline" className="h-8 w-8 bg-white p-0" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </>}</CardContent>
    </Card>
  </div>;
}

function Scorecard({ leadership }: { leadership: boolean }) {
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>('First Party');
  const { data, isLoading } = trpc.claimsQa.rubric.useQuery({ role });
  const groups = useMemo(() => ((data?.items ?? []) as any[]).reduce((acc: Record<string, any[]>, item) => { (acc[item.category] ??= []).push(item); return acc; }, {}), [data?.items]);
  return <Card><CardHeader className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /> Published role scorecard</CardTitle><CardDescription>Version {data?.version?.version ?? 'v9'} · The contract is visible before it is used. Deactivated items remain for historical context.</CardDescription></div><Select value={role} onValueChange={(value) => setRole(value as (typeof ROLE_OPTIONS)[number])}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent className="space-y-5">{isLoading ? <p className="text-sm text-muted-foreground">Loading scorecard…</p> : Object.entries(groups).map(([category, items]) => <section key={category}><h3 className="mb-2 font-semibold">{category}</h3><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Check and pass standard</th><th className="px-3 py-2">Where to find it</th><th className="px-3 py-2">Method</th></tr></thead><tbody className="divide-y">{(items as any[]).map((item) => <tr key={item.id} className={!item.active ? 'opacity-55 bg-muted/20' : ''}><td className="px-3 py-3 align-top"><span className="font-mono text-xs font-semibold text-primary">{item.item_key}</span>{item.critical && <Badge variant="outline" className="ml-2 border-red-300 bg-red-50 text-red-700">Critical</Badge>}{!item.active && <Badge variant="outline" className="ml-2">Deactivated</Badge>}</td><td className="px-3 py-3 align-top"><p className="font-medium">{item.check_text}</p><p className="mt-1 text-xs text-muted-foreground">Passes when: {item.passing_standard}</p></td><td className="px-3 py-3 align-top text-xs">{item.where_to_find}</td><td className="px-3 py-3 align-top text-xs">{item.grading_method}</td></tr>)}</tbody></table></div></section>)}</CardContent></Card>;
}

function Disputes({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: disputes, isLoading } = trpc.claimsQa.disputes.useQuery();
  const adjudicate = trpc.claimsQa.adjudicate.useMutation();
  const utils = trpc.useUtils();
  const [outcomes, setOutcomes] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const rule = async (row: any) => { const outcome = outcomes[row.id]; if (!outcome) { toast.error('Select an adjudication outcome.'); return; } try { await adjudicate.mutateAsync({ evaluationId: row.evaluation_id, resultId: row.id, outcome: outcome as any, note: notes[row.id] ?? '' }); await utils.claimsQa.invalidate(); toast.success('Adjudication recorded.'); } catch (error: any) { toast.error(error.message ?? 'Unable to adjudicate.'); } };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5 text-primary" /> Adjudication queue</CardTitle><CardDescription>Original scores are preserved. Handling-correct overturns score Met after review; rubric-defect overturns are excluded as Not determinable. More than two rubric-defect overturns flag a rewrite.</CardDescription></CardHeader><CardContent className="space-y-3">{isLoading ? <p className="text-sm text-muted-foreground">Loading disputes…</p> : !(disputes ?? []).length ? <p className="rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">No pending disputes.</p> : (disputes as any[]).map((row) => <div key={row.id} className="rounded-xl border p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{row.handler_name} · {row.item_key}</p><p className="text-xs text-muted-foreground">{row.role} · Claim {row.claim_number || '—'}</p></div><Button size="sm" variant="outline" onClick={() => onOpen(row.evaluation_id)}>Open evaluation</Button></div><p className="text-sm font-medium">{row.check_text}</p><div className="grid gap-2 md:grid-cols-2"><div className="rounded-md bg-muted/40 p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Original evidence</p><p className="mt-1 whitespace-pre-wrap">{row.evidence || 'No evidence provided.'}</p></div><div className="rounded-md bg-amber-50 p-3 text-sm"><p className="text-xs font-semibold text-amber-800">Handler argument</p><p className="mt-1 whitespace-pre-wrap">{row.handler_response_comment}</p></div></div><div className="grid gap-2 md:grid-cols-[240px_1fr_auto]"><Select value={outcomes[row.id] ?? ''} onValueChange={(value) => setOutcomes((current) => ({ ...current, [row.id]: value }))}><SelectTrigger><SelectValue placeholder="Ruling" /></SelectTrigger><SelectContent><SelectItem value="upheld">Upheld</SelectItem><SelectItem value="overturned_handling_correct">Overturned — handling correct</SelectItem><SelectItem value="overturned_rubric_defect">Overturned — rubric defect</SelectItem></SelectContent></Select><Input value={notes[row.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Adjudication note required" /><Button onClick={() => rule(row)} disabled={adjudicate.isPending}>Rule</Button></div></div>)}</CardContent></Card>;
}

function Calibration({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: evaluations } = trpc.claimsQa.list.useQuery({ limit: 100 });
  const create = trpc.claimsQa.createCalibration.useMutation();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState('');
  const [calibrationId, setCalibrationId] = useState<number | null>(null);
  const detail = trpc.claimsQa.calibrationDetail.useQuery({ calibrationId: calibrationId ?? 0 }, { enabled: Boolean(calibrationId) });
  const submit = trpc.claimsQa.submitCalibration.useMutation();
  const [values, setValues] = useState<Record<number, ResultValue>>({});
  const [evidence, setEvidence] = useState<Record<number, string>>({});
  const start = async () => { if (!selected) { toast.error('Choose an evaluation to calibrate.'); return; } try { const result = await create.mutateAsync({ evaluationId: Number(selected) }); setCalibrationId(result.id); toast.success(result.existing ? 'Existing calibration opened.' : 'Calibration created.'); } catch (error: any) { toast.error(error.message ?? 'Unable to create calibration.'); } };
  const send = async () => { const rows = detail.data?.rows ?? []; const scores = rows.filter((row: any) => values[row.id] && values[row.id] !== 'pending').map((row: any) => ({ evaluationResultId: row.id, result: values[row.id] as Exclude<ResultValue, 'pending'>, evidence: evidence[row.id] || undefined })); if (!scores.length) { toast.error('Score at least one line independently.'); return; } try { const result = await submit.mutateAsync({ calibrationId: calibrationId!, scores }); await utils.claimsQa.invalidate(); toast.success(result.completed ? 'Second independent calibration complete.' : 'Calibration submitted; awaiting second reviewer.'); } catch (error: any) { toast.error(error.message ?? 'Unable to submit calibration.'); } };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> Calibration</CardTitle><CardDescription>Two leadership reviewers score the same released evaluation independently. Divergence is reported without changing the original evaluation.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Select value={selected} onValueChange={setSelected}><SelectTrigger className="w-full md:w-[440px]"><SelectValue placeholder="Select a released evaluation" /></SelectTrigger><SelectContent>{(evaluations ?? []).filter((row: any) => row.status !== 'not_released').map((row: any) => <SelectItem key={row.id} value={String(row.id)}>{row.handler_name} · {row.role} · {row.claim_number || 'No claim #'} · {displayDate(row.audit_date)}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={start} disabled={create.isPending}>{create.isPending ? 'Opening…' : 'Open calibration'}</Button></div>{calibrationId && <div className="space-y-3 border-t pt-4">{detail.isLoading ? <p className="text-sm text-muted-foreground">Loading calibration…</p> : <><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Status: <Badge variant="outline">{detail.data?.calibration?.status}</Badge> · Divergent lines: <strong>{detail.data?.divergence ?? 0}</strong></p><Button size="sm" variant="outline" onClick={() => onOpen(detail.data?.calibration?.evaluation_id)}>Open original evaluation</Button></div><p className="text-xs text-muted-foreground">Your selections are stored independently. When two reviewers submit a line, differences are counted as calibration divergence.</p><div className="max-h-[460px] overflow-y-auto space-y-3 pr-1">{Object.values((detail.data?.rows ?? []).reduce((acc: Record<number, any>, row: any) => { acc[row.id] ??= row; return acc; }, {})).map((row: any) => <div key={row.id} className="rounded-lg border p-3"><p className="font-mono text-xs text-primary">{row.item_key}</p><p className="mt-1 text-sm font-medium">{row.check_text}</p><div className="mt-2 grid gap-2 md:grid-cols-[200px_1fr]"><Select value={values[row.id] ?? ''} onValueChange={(value) => setValues((current) => ({ ...current, [row.id]: value as ResultValue }))}><SelectTrigger><SelectValue placeholder="Independent result" /></SelectTrigger><SelectContent>{(['met', 'not_met', 'not_applicable', 'not_determinable'] as const).map((value) => <SelectItem key={value} value={value}>{resultCopy[value]}</SelectItem>)}</SelectContent></Select><Input value={evidence[row.id] ?? ''} onChange={(event) => setEvidence((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Evidence citation (optional in calibration)" /></div></div>)}</div><Button onClick={send} disabled={submit.isPending}>{submit.isPending ? 'Submitting…' : 'Submit independent calibration'}</Button></>}</div>}</CardContent></Card>;
}

function TrendItemList({ title, description, rows, repeated, onSelect }: { title: string; description: string; rows: any[]; repeated?: boolean; onSelect: (row: any) => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{repeated ? <Repeat2 className="h-4 w-4 text-[#d94d13]" /> : <Target className="h-4 w-4 text-[#d94d13]" />}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length ? rows.slice(0, 6).map((row: any, index: number) => (
          <button key={row.itemKey} onClick={() => onSelect(row)} className="group w-full rounded-xl border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-[#ff6221]/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/8 text-xs font-bold text-primary">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{row.itemKey}</span>{row.critical && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Critical</Badge>}</div>
                  <span className="text-sm font-bold text-red-700">{row.missRate}%</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{row.checkText}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff6221]" style={{ width: `${Math.max(4, row.missRate ?? 0)}%` }} /></div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{repeated ? `${row.repeatedMisses} repeat misses · ${row.repeatedHandlers} handlers` : `${row.misses} misses / ${row.scored} scored`}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground group-hover:text-[#d94d13]">Explore <ChevronRight className="h-3 w-3" /></span>
                </div>
              </div>
            </div>
          </button>
        )) : <p className="rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">No missed-item trend is available yet.</p>}
      </CardContent>
    </Card>
  );
}

function TrendDrilldown({ item, open, onOpenChange, onOpenEvaluation, onReviewAll }: { item: any; open: boolean; onOpenChange: (value: boolean) => void; onOpenEvaluation: (id: number) => void; onReviewAll: () => void }) {
  const [view, setView] = useState<'handlers' | 'teams'>('handlers');
  const rows = view === 'handlers'
    ? (item?.handlers ?? []).filter((row: any) => row.misses > 0)
    : (item?.teams ?? []).filter((row: any) => row.misses > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div><DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-primary">{item?.itemKey}</span>{item?.critical && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Critical</Badge>}</DialogTitle><DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed">{item?.checkText}</DialogDescription></div>
            <div className="text-right"><p className="text-2xl font-bold text-red-700">{item?.missRate ?? 0}%</p><p className="text-xs text-muted-foreground">{item?.misses ?? 0} misses / {item?.scored ?? 0} scored</p></div>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3"><Metric label="Affected handlers" value={item?.affectedHandlers ?? 0} caption="Handlers with at least one miss" /><Metric label="Affected teams" value={item?.affectedTeams ?? 0} caption="Role scorecards involved" tone="orange" /><Metric label="Repeated pattern" value={item?.repeatedHandlers ?? 0} caption="Handlers missing this on 2+ files" tone={item?.repeatedHandlers ? 'red' : 'green'} /></div>
          <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Where the pattern sits</CardTitle><CardDescription>Compare the same rubric item without turning the overview into a leaderboard.</CardDescription></div><div className="flex rounded-lg bg-muted p-1"><Button size="sm" variant={view === 'handlers' ? 'default' : 'ghost'} onClick={() => setView('handlers')}>By handler</Button><Button size="sm" variant={view === 'teams' ? 'default' : 'ghost'} onClick={() => setView('teams')}>By team</Button></div></div></CardHeader><CardContent className="space-y-2">{rows.map((row: any) => <div key={view === 'handlers' ? `${row.handlerId}:${row.handlerName}` : row.role} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{view === 'handlers' ? row.handlerName : row.role}</p>{view === 'handlers' && <p className="text-xs text-muted-foreground">{row.role}</p>}</div><div className="text-right"><p className="text-sm font-bold">{row.missRate}% miss rate</p><p className="text-xs text-muted-foreground">{row.misses} of {row.scored} scored</p></div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff6221]" style={{ width: `${Math.max(4, row.missRate ?? 0)}%` }} /></div></div>)}</CardContent></Card>
          <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Affected evaluations</CardTitle><CardDescription>Open the original scorecard and evidence for the specific miss.</CardDescription></div><Button variant="outline" onClick={onReviewAll}>Review all evaluations <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></CardHeader><CardContent className="space-y-2">{(item?.audits ?? []).slice(0, 8).map((audit: any) => <button key={audit.evaluationId} onClick={() => onOpenEvaluation(audit.evaluationId)} className="flex w-full flex-col justify-between gap-2 rounded-lg border p-3 text-left transition hover:border-[#ff6221]/40 hover:bg-muted/30 sm:flex-row sm:items-center"><div><p className="font-mono text-xs font-semibold text-primary">{String(audit.evaluationKey ?? '').replace(/^airtable-claims-qa-/, '')}</p><p className="mt-1 text-sm font-medium">{audit.handlerName} · Claim {audit.claimNumber || '—'}</p><p className="text-xs text-muted-foreground">{audit.role} · {displayDate(audit.auditDate)}</p></div><span className="inline-flex items-center gap-1 text-xs font-medium">Open audit <ChevronRight className="h-3 w-3" /></span></button>)}</CardContent></Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClaimsQaOverview({ data, leadership, onOpenEvaluation, onReviewAll }: { data: any; leadership: boolean; onOpenEvaluation: (id: number) => void; onReviewAll: () => void }) {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const rounds = data?.rounds ?? [];
  const latestRound = rounds.length ? rounds[rounds.length - 1] : null;
  const teamRows = data?.teams ?? [];
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.045] via-card to-[#ff6221]/[0.045]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d13]"><TrendingUp className="h-4 w-4" /> Quality pulse</div><h2 className="mt-2 text-xl font-bold tracking-tight">{latestRound?.periodLabel ?? 'Current quality round'}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{leadership ? 'Leadership signal first: movement, concentrated risk, and the patterns that need coaching or a rubric review.' : 'Your released quality results over time, with the items and patterns to focus on next.'}</p></div>
            <Button variant="outline" onClick={onReviewAll}>{leadership ? 'Review evaluation queue' : 'Review my evaluations'} <ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Audits" value={data?.counts?.evaluations ?? 0} caption={`${data?.counts?.released ?? 0} released`} /><Metric label="Pass rate" value={data?.quality?.passRate == null ? '—' : `${data.quality.passRate}%`} caption={data?.quality?.scored ? `${data.quality.met} / ${data.quality.scored} scored items met` : 'No scored lines'} tone="green" /><Metric label="Critical misses" value={data?.counts?.criticalFailures ?? 0} caption="Never averaged away" tone={data?.counts?.criticalFailures ? 'red' : 'green'} /><Metric label="Files clean" value={data?.counts?.filesClean ?? 0} caption="Strong, no critical miss" tone="orange" /><Metric label="Open actions" value={data?.counts?.openActions ?? 0} caption="Released or in adjudication" /></div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" /> Round-over-round quality</CardTitle><CardDescription>Pass rate, critical misses, and clean files. Denominators remain visible in the tooltip.</CardDescription></CardHeader><CardContent>{rounds.length ? <div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={rounds} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="periodLabel" tickLine={false} axisLine={false} fontSize={12} /><YAxis yAxisId="rate" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="count" orientation="right" tickLine={false} axisLine={false} fontSize={11} /><RechartsTooltip formatter={(value: number, name: string) => [name === 'Pass rate' ? `${value}%` : value, name]} labelFormatter={(label) => `${label} round`} /><Line yAxisId="rate" type="monotone" dataKey="passRate" name="Pass rate" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: '#0f766e' }} connectNulls /><Line yAxisId="count" type="monotone" dataKey="criticalFailures" name="Critical misses" stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: '#dc2626' }} /><Line yAxisId="count" type="monotone" dataKey="filesClean" name="Files clean" stroke="#ff6221" strokeWidth={2} dot={{ r: 3, fill: '#ff6221' }} /></LineChart></ResponsiveContainer></div> : <p className="rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">Round trends will appear after audits are scored.</p>}{rounds.length === 1 && <p className="mt-2 text-xs text-muted-foreground">This first imported round is the baseline; future rounds will extend the trend automatically.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers3 className="h-4 w-4 text-primary" /> Scorecard section risk</CardTitle><CardDescription>Worst-performing sections first, with every denominator shown. <Definition label="Pass rate" body={data?.definitions?.passRate ?? ''} /></CardDescription></CardHeader><CardContent className="space-y-3">{(data?.categories ?? []).map((row: any) => <div key={row.category}><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{row.category}</p><span className="text-sm font-bold">{row.passRate == null ? 'Small sample' : `${row.passRate}%`}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${row.criticalFailures ? 'bg-red-500' : 'bg-emerald-600'}`} style={{ width: `${Math.max(3, row.passRate ?? 0)}%` }} /></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{row.met} / {row.scored} met</span><span>{row.criticalFailures} critical</span></div></div>)}</CardContent></Card>
      </div>

      {leadership && <Card><CardHeader><CardTitle className="text-base">Team pulse</CardTitle><CardDescription>A compact comparison for resourcing and coaching. Click item trends below for handler-level specifics.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{teamRows.map((row: any) => <div key={row.role} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{row.role}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.evaluations} audits · {row.handlers} handlers</p></div><span className={`text-lg font-bold ${row.criticalFailures ? 'text-red-700' : 'text-emerald-700'}`}>{row.passRate == null ? '—' : `${row.passRate}%`}</span></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{row.met} / {row.scored} met</span><span>{row.criticalFailures} critical</span></div></div>)}</div></CardContent></Card>}

      <div className="grid gap-5 xl:grid-cols-2"><TrendItemList title="Most-missed items" description="Highest miss rate across scored files. Click any item for handlers, teams, and the source audits." rows={data?.mostMissed ?? []} onSelect={setSelectedItem} /><TrendItemList title="Repeated missed items" description="The same item missed by the same handler on two or more files—your clearest coaching pattern." rows={data?.repeatedMissed ?? []} repeated onSelect={setSelectedItem} /></div>
      <TrendDrilldown item={selectedItem} open={Boolean(selectedItem)} onOpenChange={(next) => { if (!next) setSelectedItem(null); }} onOpenEvaluation={(id) => { setSelectedItem(null); onOpenEvaluation(id); }} onReviewAll={() => { setSelectedItem(null); onReviewAll(); }} />
    </div>
  );
}

export default function WeeklyQA() {
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const leadership = user?.role === 'admin' && !isImpersonating;
  const [tab, setTab] = useState('evaluations');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState<number | null>(null);
  const overview = trpc.claimsQa.overview.useQuery();
  const data = overview.data as any;
  const open = (id: number) => setSelectedEvaluation(id);

  return <WhipLayout><div className="p-4 sm:p-6 space-y-5"><header className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Claims QA</h1><Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700"><Users className="mr-1 h-3.5 w-3.5" />{leadership ? 'Leadership review' : 'Handler review'}</Badge></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{leadership ? 'Executive review and adjudication of claim audits. Ensure quality, compliance, and coaching outcomes before release.' : 'Review your released claim audits, inspect the evidence, respond to findings, and complete sign-off.'}</p></div>{leadership && <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New evaluation</Button>}</header>
    <Tabs value={tab} onValueChange={setTab} className="gap-4"><TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted p-1 sm:w-fit"><TabsTrigger value="overview" className="px-3"><ClipboardCheck /> Overview</TabsTrigger><TabsTrigger value="evaluations" className="px-3"><FileText /> Evaluations</TabsTrigger><TabsTrigger value="scorecard" className="px-3"><BookOpenCheck /> Scorecard</TabsTrigger>{leadership && <TabsTrigger value="disputes" className="px-3"><Gavel /> Disputes</TabsTrigger>}{leadership && <TabsTrigger value="calibration" className="px-3"><Scale /> Calibration</TabsTrigger>}</TabsList>
      <TabsContent value="overview" className="space-y-5">{overview.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading Claims QA…</p> : <ClaimsQaOverview data={data} leadership={leadership} onOpenEvaluation={open} onReviewAll={() => setTab('evaluations')} />}</TabsContent>
      <TabsContent value="evaluations"><EvaluationTable leadership={leadership} onOpen={open} /></TabsContent>
      <TabsContent value="scorecard"><Scorecard leadership={leadership} /></TabsContent>
      {leadership && <TabsContent value="disputes"><Disputes onOpen={open} /></TabsContent>}
      {leadership && <TabsContent value="calibration"><Calibration onOpen={open} /></TabsContent>}
    </Tabs>
    {leadership && <CreateEvaluationDialog open={createOpen} onOpenChange={setCreateOpen} />}
    <EvaluationDetail evaluationId={selectedEvaluation} open={selectedEvaluation !== null} onOpenChange={(next) => { if (!next) setSelectedEvaluation(null); }} leadership={leadership} />
  </div></WhipLayout>;
}
