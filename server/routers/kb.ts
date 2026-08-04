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
  analyzeFault: protectedProcedure
    .input(z.object({
      narrative: z.string().min(10),
      state: z.string(),
      accidentType: z.string().optional(),
      damageLocation: z.string().optional(),
      policeReport: z.string().optional(),
      additionalContext: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const stateRule = STATE_RULES[input.state] ?? `State: ${input.state}`;
      const prompt = `You are a claims liability analyst for Whip Claims Management, a rideshare vehicle claims operation.

Analyze the following accident and provide a fault determination.

STATE LAW: ${stateRule}

DRIVER NARRATIVE:
${input.narrative}

${input.accidentType && input.accidentType !== "auto" ? `ACCIDENT TYPE: ${input.accidentType}` : ""}
${input.damageLocation ? `DAMAGE ON WHIP VEHICLE: ${input.damageLocation}` : ""}
${input.policeReport ? `POLICE REPORT STATUS: ${input.policeReport}` : ""}
${input.additionalContext ? `ADDITIONAL CONTEXT: ${input.additionalContext}` : ""}

Provide a structured fault determination with:
1. **Accident Type Identified** — what type of accident this appears to be
2. **Fault Analysis** — who appears at fault and why, based on the narrative and evidence
3. **State Law Impact** — how the applicable state law affects recovery
4. **Estimated Fault %** — estimated fault percentage for our driver (0–100%)
5. **Recovery Likelihood** — can Whip recover damages? (Yes / No / Partial / Uncertain)
6. **Key Evidence Needed** — what additional evidence would strengthen or change this determination
7. **Recommended Action** — next steps for the handler

Be direct and specific. Flag any red flags or inconsistencies in the narrative.`;

      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      return { determination: extractText(result) };
    }),
});
