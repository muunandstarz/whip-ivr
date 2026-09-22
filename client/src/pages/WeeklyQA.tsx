import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowRight, BookOpenCheck, Check, ChevronRight, CircleAlert, ClipboardCheck, FileText, Gavel, Info, MessageSquare, Plus, Scale, Send, ShieldCheck, Sparkles, UserCheck, Users } from 'lucide-react';
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
  const detail = detailQuery.data as any;
  const evaluation = detail?.evaluation;
  const grouped = useMemo(() => {
    const values = (detail?.results ?? []) as any[];
    return values.reduce((groups: Record<string, any[]>, line) => { (groups[line.category] ??= []).push(line); return groups; }, {});
  }, [detail?.results]);
  const source = sourcePayload(evaluation);
  // Hooks must remain unconditional while the selected audit changes between
  // null and an ID. Rendering nothing is deferred until every hook is called.
  if (!evaluationId) return null;
  const handleRelease = async () => { try { await release.mutateAsync({ evaluationId }); await utils.claimsQa.invalidate(); toast.success('Evaluation released to the handler.'); } catch (error: any) { toast.error(error.message ?? 'Unable to release evaluation.'); } };
  const handleSignOff = async () => { try { await signOff.mutateAsync({ evaluationId, overallResponse: signoffText }); await utils.claimsQa.invalidate(); toast.success('Evaluation sign-off recorded.'); } catch (error: any) { toast.error(error.message ?? 'Unable to sign off.'); } };
  const openCalibration = async () => { try { const result = await createCalibration.mutateAsync({ evaluationId }); await utils.claimsQa.invalidate(); toast.success(result.existing ? 'Existing open calibration retained.' : 'Calibration opened for independent review.'); } catch (error: any) { toast.error(error.message ?? 'Unable to create calibration.'); } };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-6xl h-[92vh] overflow-y-auto"><DialogHeader><div className="flex flex-wrap items-center justify-between gap-3 pr-8"><div><DialogTitle className="text-xl">{evaluation?.handler_name ?? 'Claims QA evaluation'}</DialogTitle><DialogDescription>{auditDisplayKey(evaluation)} · {evaluation?.role} · Claim {evaluation?.claim_number || 'not supplied'} · Audited {displayDate(evaluation?.audit_date)}</DialogDescription></div>{evaluation && <div className="flex items-center gap-2"><RatingBadge value={evaluation.original_rating} /><Badge variant="outline">{statusLabel(evaluation.status)}</Badge></div>}</div></DialogHeader>{detailQuery.isLoading ? <p className="p-8 text-center text-muted-foreground">Loading full scorecard…</p> : !evaluation ? <p className="p-8 text-center text-muted-foreground">Evaluation unavailable.</p> : <div className="space-y-5 pb-4"><div className="grid gap-3 md:grid-cols-4"><Metric label="Rating" value={ratingLabel(evaluation.original_rating)} caption={source?.scoreInWords ?? 'Critical-first headline'} tone={evaluation.original_rating === 'critical_miss' ? 'red' : 'navy'} /><Metric label="Score" value={evaluation.original_items_scored ? `${evaluation.original_items_met} / ${evaluation.original_items_scored}` : '—'} caption={evaluation.original_pass_rate == null ? 'Percentage suppressed for small sample' : `${evaluation.original_pass_rate}% pass rate`} tone="green" /><Metric label="Critical failures" value={evaluation.original_critical_failures} caption="Never averaged away" tone={evaluation.original_critical_failures ? 'red' : 'green'} /><Metric label="N/A lines" value={`${evaluation.original_not_applicable} + ${evaluation.original_not_determinable}`} caption="Not applicable + not determinable" tone="orange" /></div>
      {(evaluation.auditor_summary || evaluation.areas_for_improvement || source?.strengths) && <div className="grid gap-3 lg:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Auditor summary</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{evaluation.auditor_summary || 'No summary supplied.'}</CardContent></Card><Card className="border-emerald-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-900">Strengths</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{source?.strengths || 'No strengths summary supplied.'}</CardContent></Card><Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-900">Areas for improvement</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{evaluation.areas_for_improvement || 'No scored misses in this file.'}</CardContent></Card></div>}
      {leadership && evaluation.status === 'not_released' && <div className="flex flex-wrap gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><CircleAlert className="mt-0.5 h-4 w-4 text-amber-700" /><div className="flex-1 text-sm text-amber-900"><p className="font-semibold">Manual release safeguard</p><p className="mt-1">Every line must be scored; critical machine-judged lines require human confirmation. Release is explicit and never scheduled.</p></div><Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white" onClick={handleRelease} disabled={release.isPending || !(detail.results ?? []).length}>{release.isPending ? 'Releasing…' : 'Release to handler'}</Button></div>}
      {leadership && evaluation.status !== 'not_released' && <div className="flex justify-end"><Button size="sm" variant="outline" className="gap-1" onClick={openCalibration} disabled={createCalibration.isPending}><Scale className="h-3.5 w-3.5" />{createCalibration.isPending ? 'Opening…' : 'Open calibration'}</Button></div>}
      {(detail.results ?? []).length > 0 && <section className="space-y-5">{Object.entries(grouped).map(([category, lines]) => { const categoryLines = lines as any[]; const met = categoryLines.filter((line) => line.result === 'met').length; const notMet = categoryLines.filter((line) => line.result === 'not_met').length; const notApplicable = categoryLines.filter((line) => line.result === 'not_applicable').length; const notDeterminable = categoryLines.filter((line) => line.result === 'not_determinable').length; const critical = categoryLines.filter((line) => line.critical && line.result === 'not_met').length; return <div key={category} className="space-y-3"><div className="flex flex-wrap items-center gap-2 border-b pb-2"><h3 className="font-semibold">{category}</h3><Badge variant="outline">{met} met / {met + notMet} scored</Badge>{notMet > 0 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{notMet} not met</Badge>}{(notApplicable + notDeterminable) > 0 && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{notApplicable} N/A · {notDeterminable} not determinable</Badge>}{critical > 0 && <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">{critical} critical</Badge>}</div><div className="space-y-3">{categoryLines.map((line) => <ScoreLine key={line.id} line={line} evaluation={evaluation} leadership={leadership} />)}</div></div>; })}</section>}
      {!leadership && ['released', 'in_adjudication'].includes(evaluation.status) && <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary" /> Handler sign-off</CardTitle><CardDescription>Respond to every scored line, then record an affirmative overall response.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea rows={3} value={signoffText} onChange={(event) => setSignoffText(event.target.value)} placeholder="Overall response and sign-off…" /><Button onClick={handleSignOff} disabled={signOff.isPending}>{signOff.isPending ? 'Signing off…' : 'Sign off evaluation'}</Button></CardContent></Card>}
      <MessageThread evaluation={evaluation} messages={detail.messages ?? []} leadership={leadership} />
    </div>}</DialogContent></Dialog>;
}

function EvaluationTable({ leadership, onOpen }: { leadership: boolean; onOpen: (id: number) => void }) {
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const { data: evaluations, isLoading } = trpc.claimsQa.list.useQuery({ role: role === 'all' ? undefined : role, status: status === 'all' ? undefined : status, limit: 300 });
  const visibleEvaluations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return (evaluations ?? []) as any[];
    return ((evaluations ?? []) as any[]).filter((evaluation) => [
      auditDisplayKey(evaluation), evaluation.handler_name, evaluation.claim_number,
      evaluation.role, ratingLabel(evaluation.original_rating), statusLabel(evaluation.status),
    ].some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [evaluations, search]);

  return <Card><CardHeader className="space-y-3"><div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end"><div><CardTitle className="text-base">Completed claim audits</CardTitle><CardDescription>{leadership ? 'Review the imported Airtable audits, open the full evidence, and release each evaluation when ready.' : 'Your released claim-file audits and open response actions.'}</CardDescription></div><div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_190px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search audit, claim, or handler" /><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{ROLE_OPTIONS.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All review states</SelectItem>{['not_released', 'released', 'responded', 'in_adjudication', 'closed'].map((entry) => <SelectItem key={entry} value={entry}>{statusLabel(entry)}</SelectItem>)}</SelectContent></Select></div></div></CardHeader><CardContent className="p-0">{isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading completed audits…</p> : !visibleEvaluations.length ? <p className="p-8 text-center text-sm text-muted-foreground">No audits match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Audit / claim</th><th className="px-4 py-3">Handler / role</th><th className="px-4 py-3">Audit date</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Critical</th><th className="px-4 py-3">Review state</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y">{visibleEvaluations.map((evaluation) => <tr key={evaluation.id} className="hover:bg-muted/30"><td className="px-4 py-3"><p className="font-mono text-xs font-semibold text-primary">{auditDisplayKey(evaluation)}</p><p className="mt-1 font-medium">Claim {evaluation.claim_number || '—'}</p></td><td className="px-4 py-3"><p className="font-medium">{evaluation.handler_name}</p><p className="text-xs text-muted-foreground">{evaluation.role}</p></td><td className="px-4 py-3">{displayDate(evaluation.audit_date)}</td><td className="px-4 py-3"><RatingBadge value={evaluation.original_rating} /></td><td className="px-4 py-3">{evaluation.original_items_scored ? <><span className="font-medium">{evaluation.original_items_met}/{evaluation.original_items_scored}</span><p className="text-xs text-muted-foreground">{evaluation.original_pass_rate == null ? 'Small sample' : `${evaluation.original_pass_rate}%`}</p></> : '—'}</td><td className="px-4 py-3"><span className={evaluation.original_critical_failures ? 'font-semibold text-red-700' : ''}>{evaluation.original_critical_failures || '—'}</span></td><td className="px-4 py-3"><Badge variant="outline">{statusLabel(evaluation.status)}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" className="gap-1" onClick={() => onOpen(evaluation.id)}>Open audit <ChevronRight className="h-3 w-3" /></Button></td></tr>)}</tbody></table></div>}</CardContent></Card>;
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

export default function WeeklyQA() {
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const leadership = user?.role === 'admin' && !isImpersonating;
  const [tab, setTab] = useState('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState<number | null>(null);
  const overview = trpc.claimsQa.overview.useQuery();
  const data = overview.data as any;
  const open = (id: number) => setSelectedEvaluation(id);

  return <WhipLayout><div className="p-4 sm:p-6 space-y-5"><header className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d13]"><ShieldCheck className="h-4 w-4" /> Claims quality programme</div><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Claims QA</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Evidence-led scorecards, human-confirmed critical findings, handler response, adjudication, coaching, and calibration. Quality is kept separate from call productivity.</p></div>{leadership && <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New evaluation</Button>}</header>
    <Tabs value={tab} onValueChange={setTab} className="gap-4"><TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted p-1 sm:w-fit"><TabsTrigger value="overview" className="px-3"><ClipboardCheck /> Overview</TabsTrigger><TabsTrigger value="evaluations" className="px-3"><FileText /> Evaluations</TabsTrigger><TabsTrigger value="scorecard" className="px-3"><BookOpenCheck /> Scorecard</TabsTrigger>{leadership && <TabsTrigger value="disputes" className="px-3"><Gavel /> Disputes</TabsTrigger>}{leadership && <TabsTrigger value="calibration" className="px-3"><Scale /> Calibration</TabsTrigger>}</TabsList>
      <TabsContent value="overview" className="space-y-5">{overview.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading Claims QA…</p> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Completed audits" value={data?.counts?.evaluations ?? 0} caption="Claim-file evaluations in Claims QA" /><Metric label="Pass rate" value={data?.quality?.passRate == null ? '—' : `${data.quality.passRate}%`} caption={data?.quality?.scored ? `${data.quality.met} of ${data.quality.scored} scored items met` : 'No scored claim lines yet'} tone="green" /><Metric label="Critical misses" value={data?.counts?.criticalFailures ?? 0} caption="Never averaged away" tone={data?.counts?.criticalFailures ? 'red' : 'green'} /><Metric label="Files clean" value={data?.counts?.filesClean ?? 0} caption="Strong with no critical miss" tone="orange" /></div><div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]"><Card><CardHeader><CardTitle className="text-base">Quality by scorecard section</CardTitle><CardDescription>Worst actionable category first. <Definition label="Pass rate" body={data?.definitions?.passRate ?? ''} /></CardDescription></CardHeader><CardContent>{(data?.categories ?? []).length ? <div className="space-y-3">{data.categories.map((row: any) => <div key={row.category} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{row.category}</p><span className="text-sm font-semibold">{row.passRate == null ? 'Small sample' : `${row.passRate}%`}</span></div><p className="mt-1 text-xs text-muted-foreground">{row.met} of {row.scored} met · {row.criticalFailures} critical</p></div>)}</div> : <p className="rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">Category results will appear after claim evaluations are scored.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Most-missed items</CardTitle><CardDescription>Training and rubric signals, not a handler leaderboard.</CardDescription></CardHeader><CardContent>{(data?.mostMissed ?? []).length ? <div className="space-y-3">{data.mostMissed.map((row: any) => <div key={row.itemKey} className="rounded-lg bg-muted/40 p-3"><div className="flex items-start justify-between gap-3"><p className="font-mono text-xs text-primary">{row.itemKey}</p><span className="text-xs font-semibold text-red-700">{row.missRate}% miss rate</span></div><p className="mt-1 text-sm">{row.checkText}</p><p className="mt-1 text-xs text-muted-foreground">{row.misses} misses across {row.scored} scored audits</p></div>)}</div> : <p className="rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">No claim-level misses have been scored.</p>}</CardContent></Card></div><Card><CardHeader><CardTitle className="text-base">{leadership ? 'Handler quality view' : 'Your quality view'}</CardTitle><CardDescription>Quality only. Call performance and productivity remain in Call Tracking. <Definition label="Critical failures" body={data?.definitions?.criticalFailures ?? ''} /></CardDescription></CardHeader><CardContent className="p-0">{(data?.handlers ?? []).length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Handler</th><th className="px-4 py-3">Evaluations</th><th className="px-4 py-3">Pass rate</th><th className="px-4 py-3">Critical</th><th className="px-4 py-3">Open actions</th></tr></thead><tbody className="divide-y">{data.handlers.map((row: any) => <tr key={row.handlerId}><td className="px-4 py-3 font-medium">{row.handlerName}</td><td className="px-4 py-3">{row.evaluations}</td><td className="px-4 py-3">{row.passRate == null ? 'Small sample' : `${row.passRate}%`} <span className="text-xs text-muted-foreground">({row.met}/{row.scored})</span></td><td className="px-4 py-3">{row.criticalFailures}</td><td className="px-4 py-3">{row.openActions}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted-foreground">No visible evaluation records.</p>}</CardContent></Card></>}</TabsContent>
      <TabsContent value="evaluations"><EvaluationTable leadership={leadership} onOpen={open} /></TabsContent>
      <TabsContent value="scorecard"><Scorecard leadership={leadership} /></TabsContent>
      {leadership && <TabsContent value="disputes"><Disputes onOpen={open} /></TabsContent>}
      {leadership && <TabsContent value="calibration"><Calibration onOpen={open} /></TabsContent>}
    </Tabs>
    {leadership && <CreateEvaluationDialog open={createOpen} onOpenChange={setCreateOpen} />}
    <EvaluationDetail evaluationId={selectedEvaluation} open={selectedEvaluation !== null} onOpenChange={(next) => { if (!next) setSelectedEvaluation(null); }} leadership={leadership} />
  </div></WhipLayout>;
}
