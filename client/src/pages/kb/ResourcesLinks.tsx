import WhipLayout from "@/components/WhipLayout";
import { ExternalLink, Hash, FileText, Wrench, Database } from "lucide-react";

type Resource = { label: string; url?: string; note?: string };
type Section = { id: string; title: string; icon: React.ReactNode; color: string; items: Resource[] };

const SECTIONS: Section[] = [
  {
    id: "claims-systems",
    title: "Claims Systems",
    icon: <Database className="h-4 w-4" />,
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",
    items: [
      { label: "Snapsheet — Claims CRM",                url: "https://app.snapsheet.com" },
      { label: "Argyle — TNC Trip Status Lookup",       url: "https://argyle.com" },
      { label: "ChargeOver — Invoicing + Billing",      url: "https://www.chargeover.com" },
      { label: "Smartsheet — Customer Database",        url: "https://www.smartsheet.com" },
      { label: "Fountain — Driver Applications",        url: "https://fountain.com" },
      { label: "Metro Reporting Bureau — Police Reports / VIN", url: "https://metroreportingbureau.com" },
    ],
  },
  {
    id: "slack",
    title: "Slack Channels",
    icon: <Hash className="h-4 w-4" />,
    color: "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900",
    items: [
      { label: "#claims",                   note: "Central Claims Channel" },
      { label: "#claims-hub",               note: "Claims Team Chat" },
      { label: "#liability-auth-requests",  note: "Auth Request Channel" },
      { label: "#payments-dev",             note: "Payment Request Channel" },
      { label: "#claims-mail",              note: "Mail Triage Channel" },
    ],
  },
  {
    id: "docs",
    title: "Documents + Sheets",
    icon: <FileText className="h-4 w-4" />,
    color: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900",
    items: [
      { label: "Claims Mail Log — Google Sheet",  url: "https://docs.google.com/spreadsheets/d/1ltmuAF5fhwoWs1Qhs8D2WloWqAwoqnghvUpnUYT-9fA" },
      { label: "Coverage Reference Guide",        note: "Internal — ask team lead for link" },
      { label: "Whip Letterhead / Coverage Disclosures", note: "Internal — ask team lead for link" },
      { label: "Claims Tracker — Liability Tab",  note: "Internal — ask team lead for link" },
      { label: "Condition Reports (1–6 days old)", note: "Internal — ask team lead for link" },
      { label: "Condition Reports (7+ days old)", note: "Internal — ask team lead for link" },
    ],
  },
  {
    id: "external",
    title: "External Tools",
    icon: <Wrench className="h-4 w-4" />,
    color: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900",
    items: [
      { label: "Whip FNOL Form",          url: "https://www.drivewhip.com/rideshare/accident/",  note: "drivewhip.com" },
      { label: "BuyCrash",               url: "https://www.buycrash.com",                       note: "Police Report Requests" },
      { label: "Checkr",                 url: "https://portal.checkr.com",                      note: "Background Check Portal" },
      { label: "Mailform",               url: "https://mailform.io",                             note: "Print & Mail Service" },
      { label: "HireRight",              url: "https://www.hireright.com",                       note: "Driver History Reports" },
    ],
  },
];

function ResourceItem({ item }: { item: Resource }) {
  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors group">
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
        <span className="text-sm font-medium group-hover:text-primary transition-colors">{item.label}</span>
        {item.note && <span className="text-xs text-muted-foreground ml-auto">{item.note}</span>}
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg">
      <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
      <span className="text-sm font-medium font-mono">{item.label}</span>
      {item.note && <span className="text-xs text-muted-foreground ml-2">{item.note}</span>}
    </div>
  );
}

export default function ResourcesLinks() {
  return (
    <WhipLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Resources + Links</h1>
          <p className="text-muted-foreground text-sm mt-1">Claim systems, team channels, external tools, and reference documents.</p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SECTIONS.map(section => (
            <div key={section.id} className={`rounded-xl border p-5 ${section.color}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-primary">{section.icon}</span>
                <h2 className="font-semibold text-sm">{section.title}</h2>
              </div>
              <div className="space-y-0.5">
                {section.items.map((item, i) => (
                  <ResourceItem key={i} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick reference note */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <strong>Note:</strong> Internal documents and sheets without links require access through your team lead. Contact D'emily (FP Team Lead) or Jasmine (Head of Claims) for access requests.
        </div>
      </div>
    </WhipLayout>
  );
}
