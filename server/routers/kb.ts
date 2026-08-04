import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

function extractText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: { type: string; text?: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("");
  }
  return "";
}

const STATE_RULES: Record<string, string> = {
  MD: "Maryland — Pure Contributory Negligence. If our driver is even 1% at fault, there is NO recovery. Be extremely conservative.",
  VA: "Virginia — Pure Contributory Negligence. Same as MD — even 1% fault bars recovery entirely.",
  FL: "Florida — Pure Comparative Negligence. Recovery is reduced by fault percentage but never eliminated.",
  GA: "Georgia — Modified Comparative, 50% Bar. Our driver can recover if 49% or less at fault.",
  IL: "Illinois — Modified Comparative, 51% Bar. Our driver can recover if 50% or less at fault.",
  MA: "Massachusetts — Modified Comparative, 51% Bar. Our driver can recover if 50% or less at fault.",
  PA: "Pennsylvania — Modified Comparative, 51% Bar. Our driver can recover if 50% or less at fault.",
};

export const kbRouter = router({
  searchPolicyTerms: protectedProcedure
    .input(z.object({
      scenario: z.string().min(5),
      state: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const stateContext = input.state ? `The claim is in ${input.state}.` : "";
      const prompt = `You are a Whip Claims Management policy analyst. An adjuster has described the following scenario and needs to know the exact applicable policy language, coverage rules, and any relevant exclusions or conditions.

SCENARIO: ${input.scenario}
${stateContext}

Respond with a structured answer in this exact format:

## Applicable Coverage
[Which coverage period (P0/P1/P2/P3) applies and why. State the exact coverage limits.]

## Policy Language
[Quote or closely paraphrase the exact policy provision(s) that govern this scenario. Be specific — cite the section or provision name if known.]

## Conditions & Requirements
[Any conditions the member/claimant must meet for coverage to apply — notice requirements, cooperation clauses, documentation, etc.]

## Exclusions That May Apply
[List any exclusions that could limit or void coverage in this scenario. Be direct — if an exclusion clearly applies, say so.]

## State-Specific Notes
[Any state law or regulatory requirement that modifies the standard policy language for this state. If no state was specified, note the most common variations across Whip's operating markets.]

## Recommended Action
[What the adjuster should do next based on this policy analysis — accept, investigate further, deny, or escalate.]

Be precise and actionable. If the scenario is ambiguous, identify the key facts needed to make a definitive determination.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      return { analysis: extractText(result) };
    }),

  analyzeFault: protectedProcedure
    .input(z.object({
      narrative: z.string().min(10),
      state: z.string(),
      accidentType: z.string().optional(),
      damageLocation: z.string().optional(),
      policeReport: z.string().optional(),
      additionalContext: z.string().optional(),
      folNarrative: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const stateRule = STATE_RULES[input.state] ?? `State: ${input.state}`;
      const prompt = `You are a claims liability analyst for Whip Claims Management, a rideshare vehicle claims operation.

Analyze the following accident and return a JSON object ONLY — no markdown, no prose, no code fences. The JSON must match this exact schema:
{
  "accidentType": "string — identified accident type (e.g. Rear-End, Left Turn, Sideswipe)",
  "faultAnalysis": "string — 2-4 sentences: who is at fault and why based on the narrative and evidence",
  "redFlags": ["array of strings — any inconsistencies, suspicious elements, or missing facts. Empty array if none."],
  "stateLawImpact": "string — how ${input.state} law affects recovery in this specific scenario",
  "estimatedFaultPct": number between 0 and 100 for our driver,
  "recoveryLikelihood": "Yes" | "No" | "Partial" | "Uncertain",
  "evidenceNeeded": ["array of strings — specific evidence items that would strengthen or change the determination"],
  "recommendedAction": "string — concrete next steps for the handler"
}

STATE LAW: ${stateRule}

DRIVER NARRATIVE:
${input.narrative}

${input.folNarrative ? `FIRST OF LOSS NARRATIVE (FOL):\n${input.folNarrative}` : ""}
${input.accidentType && input.accidentType !== "auto" ? `ACCIDENT TYPE: ${input.accidentType}` : ""}
${input.damageLocation ? `DAMAGE ON WHIP VEHICLE: ${input.damageLocation}` : ""}
${input.policeReport ? `POLICE REPORT STATUS: ${input.policeReport}` : ""}
${input.additionalContext ? `ADDITIONAL CONTEXT: ${input.additionalContext}` : ""}

Return ONLY the JSON object. No explanation, no markdown.`;

      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const raw = extractText(result);
      // Try to parse structured JSON; fall back to raw text if parsing fails
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { determination: null, structured: parsed };
        }
      } catch {
        // fall through to raw
      }
      return { determination: raw, structured: null };
    }),
});
