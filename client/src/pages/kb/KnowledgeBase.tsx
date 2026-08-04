import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, ChevronDown, ChevronRight, Phone, Mail, MessageSquare, FileText, AlertTriangle, Clock, CheckCircle2, Scale, Loader2, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

function Accordion({ title, badge, badgeColor, children }: { title: string; badge?: string; badgeColor?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm">{title}</span>
          {badge && <Badge className={`text-xs border-0 ${badgeColor ?? "bg-muted text-muted-foreground"}`}>{badge}</Badge>}
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border/30 text-sm space-y-3">{children}</div>}
    </div>
  );
}

const ARTICLES = [
  {
    id: "claim-intake",
    title: "Claim Intake Process",
    category: "Process",
    content: (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Standard process for receiving and logging a new claim through the IVR or direct contact.</p>
        <div className="space-y-2">
          {[
            { step: "1. Verify caller identity", desc: "Confirm caller name, phone number, and relationship to the claim (claimant, attorney, insured)." },
            { step: "2. Obtain loss details", desc: "Date of loss, location, vehicle involved (year/make/model/VIN if available), description of incident." },
            { step: "3. Determine TNC period", desc: "Was the Whip app on? Was a ride accepted? Was a passenger on board? This determines which coverage applies." },
            { step: "4. Log in system", desc: "Create intake record with all captured information. Assign claim number if not already assigned." },
            { step: "5. Acknowledge claim", desc: "Provide claimant with claim number and handler contact information. Set expectations on timeline." },
            { step: "6. Route appropriately", desc: "BI/injury → Jayla. PD → Giovanni. Legal/LOR → Jasmine. General → round-robin." },
          ].map(({ step, desc }) => (
            <div key={step} className="flex gap-3 p-2.5 rounded-lg bg-muted/30">
              <span className="font-semibold text-primary text-xs shrink-0 mt-0.5">{step}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "communication-standards",
    title: "Communication Standards",
    category: "Standards",
    content: (
      <div className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { type: "Phone", icon: Phone, rules: ["Answer within 3 rings", "Identify yourself and company: 'Whip Claims, this is [name]'", "Never promise a specific outcome", "Document all calls in the claim notes", "Do not discuss liability on first contact"] },
            { type: "Email", icon: Mail, rules: ["Respond within 1 business day", "Use professional tone — no slang or abbreviations", "CC supervisor on all attorney communications", "Never send settlement offers via email without authorization", "BCC yourself on all outbound communications"] },
            { type: "Written Correspondence", icon: FileText, rules: ["Use official Whip letterhead for all letters", "Date all letters accurately", "Cite specific policy provisions when denying", "Send via certified mail for denials and settlement offers", "Retain copies in claim file"] },
            { type: "Recorded Statements", icon: MessageSquare, rules: ["Advise claimant the statement is being recorded", "Do not record without consent (check state law)", "Do not take recorded statements from represented claimants", "Ask open-ended questions — do not lead", "Transcribe and retain in claim file"] },
          ].map(({ type, icon: Icon, rules }) => (
            <div key={type} className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{type}</span>
              </div>
              <ul className="space-y-1">
                {rules.map(r => <li key={r} className="text-xs text-muted-foreground flex gap-2"><span className="text-primary mt-0.5">•</span>{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "investigation-checklist",
    title: "Investigation Checklist",
    category: "Process",
    content: (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Complete this checklist within 72 hours of claim assignment.</p>
        <div className="space-y-2">
          {[
            { item: "Police report obtained", critical: true },
            { item: "Trip log pulled from Whip platform (confirms TNC period)", critical: true },
            { item: "Photos of all vehicles obtained", critical: true },
            { item: "Recorded statement from Whip driver", critical: false },
            { item: "Recorded statement from claimant (if unrepresented)", critical: false },
            { item: "Witness statements obtained", critical: false },
            { item: "Medical authorization obtained (BI claims)", critical: true },
            { item: "Vehicle inspection / damage estimate obtained (PD claims)", critical: true },
            { item: "Coverage verified (policy in force, vehicle on policy, driver authorized)", critical: true },
            { item: "Liability determination documented", critical: true },
            { item: "Reserves set", critical: true },
            { item: "Diary date set for follow-up", critical: false },
          ].map(({ item, critical }) => (
            <div key={item} className={`flex items-center gap-3 p-2.5 rounded-lg ${critical ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${critical ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-xs">{item}</span>
              {critical && <Badge className="text-xs border-0 bg-primary/10 text-primary ml-auto">Required</Badge>}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "settlement-authority",
    title: "Settlement Authority Levels",
    category: "Authority",
    content: (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">Role</th><th className="text-left px-3 py-2">BI Authority</th><th className="text-left px-3 py-2">PD Authority</th><th className="text-left px-3 py-2">Requires Approval From</th></tr></thead>
            <tbody>
              {[
                ["Handler", "Up to $5,000", "Up to $3,000", "Supervisor for anything above"],
                ["Senior Handler / Supervisor", "Up to $25,000", "Up to $10,000", "Manager for anything above"],
                ["Manager", "Up to $100,000", "Up to $50,000", "VP/Legal for anything above"],
                ["VP / Legal", "Unlimited", "Unlimited", "Board approval for >$500k"],
              ].map(([role, bi, pd, approval]) => (
                <tr key={role} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{role}</td>
                  <td className="px-3 py-2">{bi}</td>
                  <td className="px-3 py-2">{pd}</td>
                  <td className="px-3 py-2 text-muted-foreground">{approval}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: "diary-management",
    title: "Diary Management & Follow-Up Standards",
    category: "Process",
    content: (
      <div className="space-y-3">
        <div className="space-y-2">
          {[
            { event: "New claim assigned", followup: "Contact claimant within 24 hours" },
            { event: "Medical treatment ongoing", followup: "Diary every 30 days" },
            { event: "Demand received", followup: "Respond within 15 days" },
            { event: "Settlement offer made", followup: "Follow up within 7 days if no response" },
            { event: "LOR received", followup: "Acknowledge to attorney within 10 days" },
            { event: "Lawsuit filed", followup: "Route to legal within 24 hours — answer deadline is critical" },
            { event: "Total loss vehicle", followup: "Obtain ACV and contact within 5 business days" },
            { event: "Claim inactive >60 days", followup: "Review for closure or status update" },
          ].map(({ event, followup }) => (
            <div key={event} className="flex gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/20">
              <Clock className="w-4 h-4 text-[#ff6221] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">{event}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{followup}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "fraud-indicators",
    title: "Fraud Indicators",
    category: "Compliance",
    content: (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Flag any claim with 3 or more of these indicators for SIU (Special Investigations Unit) referral.</p>
        <div className="grid md:grid-cols-2 gap-2">
          {[
            "Accident reported significantly after the date of loss",
            "Claimant has multiple prior claims with same or different insurers",
            "Multiple claimants from a single vehicle",
            "Treatment at clinics known for inflated billing",
            "Injury inconsistent with damage (low-speed impact, high medical bills)",
            "Claimant refuses recorded statement",
            "Attorney retained immediately after minor incident",
            "Demand received within days of accident",
            "Witnesses are related to claimant",
            "Vehicle damage inconsistent with described impact",
            "Claimant cannot describe accident consistently",
            "Prior relationship between claimant and Whip driver",
          ].map((indicator, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-800/30 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              {indicator}
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"articles" | "policy">("articles");
  const [scenario, setScenario] = useState("");
  const [scenarioState, setScenarioState] = useState("all");
  const [policyResult, setPolicyResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-fill scenario from URL params (e.g. ?tab=policy&scenario=<text>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const scenarioParam = params.get("scenario");
    if (tabParam === "policy") {
      setActiveTab("policy");
    }
    if (scenarioParam) {
      setScenario(decodeURIComponent(scenarioParam));
    }
  }, []);

  const policySearch = trpc.kb.searchPolicyTerms.useMutation({
    onSuccess: (data) => setPolicyResult(data.analysis),
    onError: () => toast.error("Failed to retrieve policy language. Please try again."),
  });

  const filtered = search
    ? ARTICLES.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.category.toLowerCase().includes(search.toLowerCase()))
    : ARTICLES;

  return (
    <WhipLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">Claims handling procedures, communication standards, and compliance reference</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border">
          <button onClick={() => setActiveTab("articles")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "articles" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            Articles
          </button>
          <button onClick={() => setActiveTab("policy")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === "policy" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Scale className="w-3.5 h-3.5" /> Policy &amp; Terms Lookup
          </button>
        </div>

        {/* Articles tab */}
        {activeTab === "articles" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search articles…" className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-3">
              {filtered.map((article) => (
                <Accordion key={article.id} title={article.title} badge={article.category}
                  badgeColor={article.category === "Compliance" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                    article.category === "Authority" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-primary/10 text-primary"}>
                  {article.content}
                </Accordion>
              ))}
            </div>
          </>
        )}

        {/* Policy & Terms Lookup tab */}
        {activeTab === "policy" && (
          <div className="space-y-5">
            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium">Scenario-Based Policy Lookup</p>
              <p className="text-xs text-muted-foreground">Describe the claim scenario and get the exact applicable policy language, coverage period, exclusions, and recommended action — instantly.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 block">Describe the Scenario *</label>
                <textarea
                  value={scenario}
                  onChange={e => setScenario(e.target.value)}
                  placeholder="e.g. Driver was en route to pick up a passenger when they rear-ended another vehicle. The member's personal auto policy denied the claim. What coverage applies?"
                  className="w-full min-h-[100px] rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="w-48">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 block">State (optional)</label>
                  <Select value={scenarioState} onValueChange={setScenarioState}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All states" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      <SelectItem value="MD">Maryland</SelectItem>
                      <SelectItem value="VA">Virginia</SelectItem>
                      <SelectItem value="GA">Georgia</SelectItem>
                      <SelectItem value="FL">Florida</SelectItem>
                      <SelectItem value="IL">Illinois</SelectItem>
                      <SelectItem value="MA">Massachusetts</SelectItem>
                      <SelectItem value="PA">Pennsylvania</SelectItem>
                      <SelectItem value="TX">Texas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => {
                    if (!scenario.trim()) { toast.error("Please describe a scenario first."); return; }
                    setPolicyResult(null);
                    policySearch.mutate({ scenario: scenario.trim(), state: scenarioState !== "all" ? scenarioState : undefined });
                  }}
                  disabled={policySearch.isPending || !scenario.trim()}
                  className="h-9 px-5 shrink-0"
                >
                  {policySearch.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching…</> : <><Search className="w-4 h-4 mr-2" />Look Up Policy</>}
                </Button>
              </div>
            </div>

            {policyResult && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Policy Analysis</span>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(policyResult).then(() => { setCopied(true); toast("Copied to clipboard"); setTimeout(() => setCopied(false), 2000); }); }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="px-4 py-4 space-y-3 text-sm leading-relaxed">
                  {policyResult.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-4 first:mt-0">{line.replace('## ', '')}</h3>;
                    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold">{line.replace(/\*\*/g, '')}</p>;
                    if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 text-muted-foreground">{line.replace(/^[-*] /, '')}</li>;
                    if (line.trim() === '') return null;
                    return <p key={i} className="text-muted-foreground">{line}</p>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </WhipLayout>
  );
}
