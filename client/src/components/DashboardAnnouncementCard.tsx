import { useMemo, useState } from 'react';
import { Link2, Megaphone, PartyPopper, Pencil, Save, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DashboardAnnouncementCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.announcements.getDashboardMessage.useQuery(undefined, { staleTime: 60_000 });
  const { data: birthday } = trpc.announcements.getBirthdayPreference.useQuery(undefined, { staleTime: 60_000 });
  const { data: announcements } = trpc.announcements.list.useQuery(undefined, { enabled: isAdmin, staleTime: 60_000 });
  const saveAnnouncement = trpc.announcements.save.useMutation({
    onSuccess: () => { utils.announcements.getDashboardMessage.invalidate(); utils.announcements.list.invalidate(); toast.success('Dashboard message saved'); setEditOpen(false); },
    onError: (error) => toast.error(error.message),
  });
  const archiveAnnouncement = trpc.announcements.archive.useMutation({
    onSuccess: () => { utils.announcements.getDashboardMessage.invalidate(); utils.announcements.list.invalidate(); toast.success('Announcement archived'); },
    onError: (error) => toast.error(error.message),
  });
  const saveBirthday = trpc.announcements.setBirthdayPreference.useMutation({
    onSuccess: () => { utils.announcements.getBirthdayPreference.invalidate(); utils.announcements.getDashboardMessage.invalidate(); toast.success('Birthday preference saved'); setBirthdayOpen(false); },
    onError: (error) => toast.error(error.message),
  });

  const current = data?.announcement ?? null;
  const fallback = data?.fallback ?? { title: 'Good morning, team', message: 'Start with the facts, document the decision, and keep the next step clear.' };
  const visible = current ?? fallback;
  const [editOpen, setEditOpen] = useState(false);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<'feature' | 'message'>('message');
  const [actionLabel, setActionLabel] = useState('');
  const [actionHref, setActionHref] = useState('');
  const [month, setMonth] = useState(String(birthday?.birthMonth ?? new Date().getMonth() + 1));
  const [day, setDay] = useState(String(birthday?.birthDay ?? new Date().getDate()));
  const [optedIn, setOptedIn] = useState(Boolean(birthday?.isOptedIn));

  const birthdayNames = useMemo(() => data?.birthdayNames ?? [], [data?.birthdayNames]);
  const greetingName = user?.name?.split(' ')[0] || 'team';
  const beginEdit = () => {
    const selected = current;
    setTitle(selected?.title ?? 'Good morning, team');
    setMessage(selected?.message ?? '');
    setKind(selected?.kind === 'feature' ? 'feature' : 'message');
    setActionLabel(selected?.actionLabel ?? '');
    setActionHref(selected?.actionHref ?? '');
    setEditOpen(true);
  };
  const submitAnnouncement = () => {
    if (!title.trim() || !message.trim()) { toast.error('Add a title and message first'); return; }
    saveAnnouncement.mutate({
      id: current?.id,
      title: title.trim(),
      message: message.trim(),
      kind,
      actionLabel: actionLabel.trim() || null,
      actionHref: actionHref.trim() || null,
      isActive: true,
    });
  };
  const submitBirthday = () => {
    saveBirthday.mutate({
      isOptedIn: optedIn,
      birthMonth: optedIn ? Number(month) : null,
      birthDay: optedIn ? Number(day) : null,
    });
  };

  return (
    <Card className="overflow-hidden border-[#ff6221]/25 bg-gradient-to-r from-[#171b31] via-[#20284a] to-[#171b31] text-white shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6221] text-white shadow-sm">
            {current?.kind === 'feature' ? <Megaphone className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffb18e]">{isLoading ? 'Loading briefing…' : `Good morning, ${greetingName}`}</span>
              {current?.kind === 'feature' && <Badge className="border-0 bg-[#ff6221]/20 px-2 py-0 text-[10px] text-[#ffd7c5]">New feature</Badge>}
            </div>
            <h2 className="text-base font-semibold leading-tight text-white">{visible.title}</h2>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-200">{visible.message}</p>
            {birthdayNames.length > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-amber-100">
                <PartyPopper className="h-3.5 w-3.5 text-[#ffb18e]" /> Happy birthday, {birthdayNames.join(' and ')}!
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {current?.actionHref && current?.actionLabel && (
              <a href={current.actionHref} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#ff6221] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#e5541a]">
                <Link2 className="h-3.5 w-3.5" /> {current.actionLabel}
              </a>
            )}
            {isAdmin && <Button type="button" size="sm" variant="outline" onClick={beginEdit} className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/15 hover:text-white"><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 bg-black/10 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-300">Want a birthday shout-out? <button type="button" onClick={() => { setMonth(String(birthday?.birthMonth ?? new Date().getMonth() + 1)); setDay(String(birthday?.birthDay ?? new Date().getDate())); setOptedIn(Boolean(birthday?.isOptedIn)); setBirthdayOpen(true); }} className="font-semibold text-[#ffb18e] underline underline-offset-2 hover:text-white">Share your month and day</button> — no birth year collected.</p>
          {birthday?.isOptedIn && <span className="text-[11px] text-slate-400">Birthday recognition is on</span>}
        </div>

        {birthdayOpen && (
          <div className="border-t border-white/10 bg-[#11182e] px-5 py-4">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Birthday recognition</h3><p className="text-xs text-slate-300">Only your month and day are stored. You can turn this off at any time.</p></div><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => setBirthdayOpen(false)}><X className="h-4 w-4" /></Button></div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2"><Switch checked={optedIn} onCheckedChange={setOptedIn} id="birthday-opt" /><Label htmlFor="birthday-opt" className="text-xs text-slate-100">Include me in birthday recognition</Label></div>
              {optedIn && <><label className="text-xs text-slate-200">Month<select value={month} onChange={(event) => setMonth(event.target.value)} className="ml-1 h-8 rounded border border-white/20 bg-white/10 px-2 text-xs text-white">{MONTHS.map((label, index) => <option key={label} value={index + 1} className="text-black">{label}</option>)}</select></label><label className="text-xs text-slate-200">Day<select value={day} onChange={(event) => setDay(event.target.value)} className="ml-1 h-8 rounded border border-white/20 bg-white/10 px-2 text-xs text-white">{Array.from({ length: 31 }, (_, index) => index + 1).map((value) => <option key={value} value={value} className="text-black">{value}</option>)}</select></label></>}
              <Button type="button" size="sm" className="h-8 bg-[#ff6221] text-xs hover:bg-[#e5541a]" onClick={submitBirthday} disabled={saveBirthday.isPending}>{saveBirthday.isPending ? 'Saving…' : 'Save preference'}</Button>
            </div>
          </div>
        )}

        {isAdmin && editOpen && (
          <div className="border-t border-white/10 bg-[#11182e] px-5 py-4">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Dashboard announcement</h3><p className="text-xs text-slate-300">Use a feature message to add a direct link to a new workflow. Leaving this blank returns the daily team message.</p></div><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => setEditOpen(false)}><X className="h-4 w-4" /></Button></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label className="text-xs text-slate-200">Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-8 border-white/20 bg-white/5 text-sm text-white" /></div>
              <div><Label className="text-xs text-slate-200">Message type</Label><select value={kind} onChange={(event) => setKind(event.target.value as 'feature' | 'message')} className="mt-1 h-8 w-full rounded-md border border-white/20 bg-white/5 px-2 text-sm text-white"><option value="message" className="text-black">Morning message</option><option value="feature" className="text-black">New feature announcement</option></select></div>
              <div className="md:col-span-2"><Label className="text-xs text-slate-200">Message</Label><Textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 min-h-20 border-white/20 bg-white/5 text-sm text-white" /></div>
              {kind === 'feature' && <><div><Label className="text-xs text-slate-200">Button label</Label><Input value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="See how it works" className="mt-1 h-8 border-white/20 bg-white/5 text-sm text-white placeholder:text-slate-500" /></div><div><Label className="text-xs text-slate-200">Button link</Label><Input value={actionHref} onChange={(event) => setActionHref(event.target.value)} placeholder="/claims-workspace" className="mt-1 h-8 border-white/20 bg-white/5 text-sm text-white placeholder:text-slate-500" /></div></>}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {current && <Button type="button" size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-xs text-white hover:bg-white/15 hover:text-white" disabled={archiveAnnouncement.isPending} onClick={() => archiveAnnouncement.mutate({ id: current.id })}>Return to daily message</Button>}
              <Button type="button" size="sm" className="h-8 bg-[#ff6221] text-xs hover:bg-[#e5541a]" disabled={saveAnnouncement.isPending} onClick={submitAnnouncement}><Save className="mr-1 h-3.5 w-3.5" />{saveAnnouncement.isPending ? 'Saving…' : 'Publish message'}</Button>
            </div>
            {announcements && announcements.length > 1 && <p className="mt-2 text-[11px] text-slate-400">{announcements.length} announcements in history. The latest active message is visible to the team.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
