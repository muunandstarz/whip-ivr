import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PhoneIncoming,
  LayoutGrid,
  Phone,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

// ── Slide definitions ────────────────────────────────────────────────────────

const SLIDES = [
  {
    icon: Sparkles,
    iconColor: "text-[#ff6221]",
    title: "Welcome to Whip Claims IVR",
    body: "This is your central hub for managing voicemail intakes, tracking callbacks, and reviewing your call performance. Everything you need is in the left sidebar — let's take a quick tour.",
    note: null,
  },
  {
    icon: LayoutGrid,
    iconColor: "text-blue-500",
    title: "My Dashboard",
    body: "Your home base. It shows your open callback queue, call performance metrics pulled from Aircall, your QA score, and AI coaching tips based on your score. Check this first when you log in each day.",
    note: "The callback queue lists every voicemail assigned to you that still needs a return call.",
  },
  {
    icon: PhoneIncoming,
    iconColor: "text-green-500",
    title: "Intake Records",
    body: "Every voicemail that comes in and gets routed to you appears here. Each record includes the caller's name, phone number, caller type, a claim number (if mentioned), and an AI-generated summary of what they said.",
    note: "You only see records assigned to your name. New voicemails appear automatically within a few minutes of the call ending.",
  },
  {
    icon: Clock,
    iconColor: "text-orange-500",
    title: "The 4-Hour Callback Window",
    body: "Every new voicemail intake starts a 4-business-hour callback clock from the time the voicemail was received — not from when you log in. Records approaching or past that window are flagged on your dashboard.",
    note: "Business hours are 8 AM – 6 PM. The clock pauses overnight and on weekends.",
  },
  {
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    title: "How to Close a Record",
    body: "Open any intake record and click Callback. The panel pre-fills with the caller's info and a script tailored to their caller type. Make the call, then log the result: Reached, No Answer, Left Voicemail, or Wrong Number. Saving closes the record automatically.",
    note: "If you can't reach them, the record stays open for a follow-up attempt.",
  },
  {
    icon: Phone,
    iconColor: "text-purple-500",
    title: "Softphone",
    body: "The Softphone page is being finalized — use your Aircall desktop app or physical phone as normal for now. It will be live shortly with a full dial pad, disposition codes, and call scripts built in.",
    note: null,
  },
];

// ── Component ────────────────────────────────────────────────────────────────

interface OnboardingModalProps {
  onDismiss: () => void;
}

export default function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const markSeen = trpc.auth.markOnboardingSeen.useMutation();

  const isFirst = step === 0;
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];
  const Icon = slide.icon;

  function handleFinish() {
    markSeen.mutate(undefined, { onSettled: onDismiss });
  }

  function handleSkip() {
    markSeen.mutate(undefined, { onSettled: onDismiss });
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-muted w-full">
          <div
            className="h-1 bg-[#ff6221] transition-all duration-300"
            style={{ width: `${((step + 1) / SLIDES.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className={`w-5 h-5 ${slide.iconColor}`} />
              </div>
              <DialogTitle className="text-lg leading-tight">{slide.title}</DialogTitle>
            </div>
          </DialogHeader>

          <p className="text-sm text-foreground leading-relaxed mb-3">{slide.body}</p>

          {slide.note && (
            <div className="bg-muted/60 rounded-lg px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {slide.note}
            </div>
          )}

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mt-5 mb-4">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  i === step
                    ? "w-4 h-1.5 bg-[#ff6221]"
                    : i < step
                    ? "w-1.5 h-1.5 bg-[#ff6221]/40"
                    : "w-1.5 h-1.5 bg-muted-foreground/25"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isLast && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  onClick={handleSkip}
                  disabled={markSeen.isPending}
                >
                  Skip tour
                </Button>
              )}
              {isLast ? (
                <Button
                  size="sm"
                  className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-1"
                  onClick={handleFinish}
                  disabled={markSeen.isPending}
                >
                  {markSeen.isPending ? "Saving…" : "Get started"}
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-[#171b31] hover:bg-[#232840] text-white gap-1"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
