import { useState, useCallback } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calculator, RefreshCw, Info } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface CalcResult {
  policyPeriodDays: number;
  daysUsed: number;
  daysRemaining: number;
  dailyRate: number;
  earnedPremium: number;
  unearned: number;
  refundPercent: number;
  proRataFactor: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number): string {
  return "$" + fmt(n);
}

// ─── Calculator Logic ──────────────────────────────────────────────────────────
function calcProRata(
  policyStart: Date,
  policyEnd: Date,
  cancellationDate: Date,
  annualPremium: number,
): CalcResult {
  const policyPeriodDays = daysBetween(policyStart, policyEnd);
  const daysUsed = daysBetween(policyStart, cancellationDate);
  const daysRemaining = policyPeriodDays - daysUsed;
  const dailyRate = annualPremium / policyPeriodDays;
  const earnedPremium = dailyRate * daysUsed;
  const unearned = annualPremium - earnedPremium;
  const proRataFactor = daysUsed / policyPeriodDays;
  const refundPercent = (daysRemaining / policyPeriodDays) * 100;
  return { policyPeriodDays, daysUsed, daysRemaining, dailyRate, earnedPremium, unearned, refundPercent, proRataFactor };
}

// ─── Result Row ────────────────────────────────────────────────────────────────
function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-4 rounded-lg ${highlight ? "bg-[#ff6221]/10 border border-[#ff6221]/30" : "bg-muted/30"}`}>
      <span className={`text-sm ${highlight ? "font-semibold text-[#ff6221]" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono font-semibold ${highlight ? "text-[#ff6221]" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ProRataCalc() {
  const today = new Date().toISOString().split("T")[0];

  const [policyStart, setPolicyStart] = useState("");
  const [policyEnd, setPolicyEnd] = useState("");
  const [cancelDate, setCancelDate] = useState(today);
  const [premium, setPremium] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState("");

  const calculate = useCallback(() => {
    setError("");
    setResult(null);

    if (!policyStart || !policyEnd || !cancelDate || !premium) {
      setError("Please fill in all fields.");
      return;
    }

    const start = new Date(policyStart + "T00:00:00");
    const end = new Date(policyEnd + "T00:00:00");
    const cancel = new Date(cancelDate + "T00:00:00");
    const prem = parseFloat(premium.replace(/[$,]/g, ""));

    if (isNaN(prem) || prem <= 0) { setError("Premium must be a positive number."); return; }
    if (end <= start) { setError("Policy end date must be after start date."); return; }
    if (cancel < start) { setError("Cancellation date cannot be before policy start."); return; }
    if (cancel > end) { setError("Cancellation date cannot be after policy end."); return; }

    setResult(calcProRata(start, end, cancel, prem));
  }, [policyStart, policyEnd, cancelDate, premium]);

  function reset() {
    setPolicyStart("");
    setPolicyEnd("");
    setCancelDate(today);
    setPremium("");
    setResult(null);
    setError("");
  }

  return (
    <WhipLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff6221]/10 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-[#ff6221]" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pro-Rata Calculator</h1>
            <p className="text-sm text-muted-foreground">Calculate earned premium and unearned refund on policy cancellation</p>
          </div>
        </div>

        {/* How it works */}
        <div className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 text-xs text-blue-800 dark:text-blue-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Pro-rata method:</strong> Refund = (Days Remaining ÷ Total Policy Days) × Full Premium. Unlike short-rate, there is no penalty — the insured receives a full proportional refund for unused coverage days.
          </div>
        </div>

        {/* Inputs */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Policy Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium">Policy Start Date</Label>
                <Input type="date" className="mt-1 h-9" value={policyStart} onChange={(e) => setPolicyStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-medium">Policy End Date</Label>
                <Input type="date" className="mt-1 h-9" value={policyEnd} onChange={(e) => setPolicyEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium">Cancellation / Effective Date</Label>
                <Input type="date" className="mt-1 h-9" value={cancelDate} onChange={(e) => setCancelDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-medium">Full Policy Premium ($)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 h-9"
                  placeholder="e.g. 1200.00"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") calculate(); }}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-1">
              <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2 flex-1" onClick={calculate}>
                <Calculator className="w-4 h-4" /> Calculate
              </Button>
              <Button variant="outline" className="gap-2" onClick={reset}>
                <RefreshCw className="w-4 h-4" /> Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Calculation Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ResultRow label="Policy Period (days)" value={String(result.policyPeriodDays)} />
              <ResultRow label="Days Used (earned)" value={String(result.daysUsed)} />
              <ResultRow label="Days Remaining (unearned)" value={String(result.daysRemaining)} />
              <Separator className="my-2" />
              <ResultRow label="Daily Rate" value={fmtCurrency(result.dailyRate)} />
              <ResultRow label="Pro-Rata Factor" value={fmt(result.proRataFactor * 100, 4) + "%"} />
              <Separator className="my-2" />
              <ResultRow label="Earned Premium (insurer keeps)" value={fmtCurrency(result.earnedPremium)} />
              <ResultRow label="Refund % of Premium" value={fmt(result.refundPercent, 2) + "%"} highlight />
              <ResultRow label="Unearned Premium (refund due)" value={fmtCurrency(result.unearned)} highlight />
            </CardContent>
          </Card>
        )}

        {/* Formula reference */}
        <Card className="border-border/50 bg-muted/20">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formula Reference</p>
            <div className="font-mono text-xs space-y-1 text-muted-foreground">
              <p>Daily Rate = Full Premium ÷ Policy Period Days</p>
              <p>Earned Premium = Daily Rate × Days Used</p>
              <p>Unearned (Refund) = Full Premium − Earned Premium</p>
              <p>Refund % = Days Remaining ÷ Policy Period Days × 100</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </WhipLayout>
  );
}
