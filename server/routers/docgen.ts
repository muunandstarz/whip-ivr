import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

function extractText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("")
      .trim();
  }
  return "";
}

export const docgenRouter = router({
  /**
   * Blank Letterhead — "Improve with AI"
   * Takes the raw letter body and rewrites it professionally.
   */
  improveWithAI: protectedProcedure
    .input(
      z.object({
        body: z.string().min(10, "Letter body is too short"),
        claimNumber: z.string().optional(),
        recipient: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { body, claimNumber, recipient } = input;

      const contextHints = [
        claimNumber ? `Claim #: ${claimNumber}` : null,
        recipient ? `Recipient: ${recipient}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const prompt = `You are a claims professional at Whip Claims Management writing a formal letter. Rewrite the following letter body to sound more professional, clear, and legally appropriate for a claims context. Preserve all the key facts, claims numbers, names, and dollar amounts exactly. Keep approximately the same length. Do not add a salutation or signature — just the body paragraphs. Output only the rewritten body text, nothing else.

${contextHints ? `Context:\n${contextHints}\n\n` : ""}Original:
${body}`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
      });

      const improved = extractText(result);
      if (!improved) throw new Error("AI returned empty response");
      return { improved };
    }),

  /**
   * Carrier Rebuttal — "AI Generate"
   * Generates a complete formal rebuttal letter from line items.
   */
  generateRebuttal: protectedProcedure
    .input(
      z.object({
        claimNumber: z.string(),
        theirClaimNumber: z.string().optional(),
        vehicle: z.string(),
        dateOfLoss: z.string(),
        carrier: z.string(),
        adjuster: z.string(),
        accidentType: z.string().optional(),
        lineItems: z.array(
          z.object({
            item: z.string(),
            ours: z.number(),
            theirs: z.number(),
            reason: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const {
        claimNumber,
        theirClaimNumber,
        vehicle,
        dateOfLoss,
        carrier,
        adjuster,
        accidentType,
        lineItems,
      } = input;

      const totalOurs = lineItems.reduce((s, r) => s + r.ours, 0);
      const totalTheirs = lineItems.reduce((s, r) => s + r.theirs, 0);
      const totalGap = totalOurs - totalTheirs;

      const lineItemsText = lineItems
        .filter((r) => r.ours - r.theirs > 0)
        .map(
          (r) =>
            `- ${r.item}: We claim $${r.ours.toFixed(2)}, carrier offered $${r.theirs.toFixed(2)} (gap: $${(r.ours - r.theirs).toFixed(2)})${r.reason ? ` — Carrier reason: ${r.reason}` : ""}`
        )
        .join("\n");

      const prompt = `You are a senior insurance claims attorney and litigation specialist for Whip Claims Management / DriveWhip, a commercial rideshare fleet operator. Write a complete, formal carrier rebuttal letter.

CLAIM DETAILS:
- Claim #: ${claimNumber}${theirClaimNumber ? `\n- Their Claim #: ${theirClaimNumber}` : ""}
- Vehicle: ${vehicle}
- Date of Loss: ${dateOfLoss}
- Adverse Carrier / Adjuster: ${carrier} / ${adjuster}${accidentType ? `\n- Accident Type: ${accidentType}` : ""}
- Total we are claiming: $${totalOurs.toFixed(2)}
- Total carrier offered: $${totalTheirs.toFixed(2)}
- Total gap to recover: $${totalGap.toFixed(2)}

DISPUTED LINE ITEMS:
${lineItemsText}

Write a complete formal rebuttal letter that:
1. Opens with the date, our address (Whip Claims Management, P.O. Box 10622, Rockville, MD 20849), and the carrier's information
2. States the claim number, vehicle, and date of loss in the subject line
3. For each disputed line item, cites the specific regulatory or industry standard being violated (I-CAR MRC standards, OEM repair procedures, state insurance code, CCC/Mitchell/Audatex methodology)
4. Demands full payment of $${totalGap.toFixed(2)} within 30 days
5. Closes with a professional signature block for Whip Claims Management
6. Uses formal legal/insurance language throughout
7. Is FOR SETTLEMENT PURPOSES ONLY

Output only the letter text, no commentary.`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
      });

      const letter = extractText(result);
      if (!letter) throw new Error("AI returned empty response");
      return { letter };
    }),

  /**
   * Carrier Rebuttal — "AI Polish"
   * Polishes an existing draft rebuttal letter.
   */
  polishRebuttal: protectedProcedure
    .input(
      z.object({
        draft: z.string().min(50, "Draft is too short"),
        claimNumber: z.string().optional(),
        vehicle: z.string().optional(),
        carrier: z.string().optional(),
        adjuster: z.string().optional(),
        dateOfLoss: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { draft, claimNumber, vehicle, carrier, adjuster, dateOfLoss } =
        input;

      const prompt = `You are a senior insurance claims attorney and litigation specialist for Whip Claims Management / DriveWhip, a commercial rideshare fleet operator. You are writing a formal carrier rebuttal letter to dispute an adverse carrier's inadequate repair estimate or claim denial.

CONTEXT:
- Claim #: ${claimNumber || "[not provided]"}
- Vehicle: ${vehicle || "[not provided]"}
- Adverse Carrier / Adjuster: ${carrier || "[not provided]"} / ${adjuster || "[not provided]"}
- Date of Loss: ${dateOfLoss || "[not provided]"}
- We are a commercial fleet operator — our vehicles must be repaired to OEM standards to maintain fleet safety ratings, insurance compliance, and resale value.

DRAFT REBUTTAL TO POLISH:
${draft}

YOUR TASK — rewrite this into a polished, legally authoritative rebuttal letter that:
1. OPENING: Opens with a firm but professional statement of dispute, citing the specific claim number and the exact dollar gap between our position and the carrier's offer.
2. LINE-BY-LINE ARGUMENTS: For each disputed line item, provide:
   - The specific regulatory or industry standard being violated (e.g., I-CAR MRC standards, OEM repair procedures, state insurance code, CCC/Mitchell/Audatex methodology)
   - A citation to the applicable standard
   - A clear statement of what the correct amount should be and why
   - If betterment was applied: cite that betterment is only applicable to consumable parts (tires, batteries, brakes) and not structural or cosmetic components
3. CLOSING: Demands full payment within 30 days with a threat of escalation to the state insurance commissioner and/or litigation if not resolved
4. SIGNATURE: Closes with a professional signature block for Whip Claims Management

Output only the polished letter text, no commentary.`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
      });

      const polished = extractText(result);
      if (!polished) throw new Error("AI returned empty response");
      return { polished };
    }),

  /**
   * General Release (BI/PD) — "Generate Settlement Email"
   * Generates a professional settlement email for BI or PD releases.
   */
  generateSettlementEmail: protectedProcedure
    .input(
      z.object({
        type: z.enum(["bi", "pd"]),
        claimantName: z.string(),
        claimNumber: z.string(),
        dateOfLoss: z.string(),
        settlementAmount: z.string(),
        adjusterName: z.string(),
        additionalNotes: z.string().optional(),
        recipientEmail: z.string().optional(),
        injuryDescription: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const {
        type,
        claimantName,
        claimNumber,
        dateOfLoss,
        settlementAmount,
        adjusterName,
        additionalNotes,
        injuryDescription,
        recipientEmail,
      } = input;

      const isBi = type === "bi";

      const prompt = `You are a claims adjuster at Whip Claims Management writing a professional settlement email to a claimant or their attorney.

CLAIM DETAILS:
- Type: ${isBi ? "Bodily Injury (BI)" : "Property Damage (PD)"}
- Claimant: ${claimantName}
- Claim #: ${claimNumber}
- Date of Loss: ${dateOfLoss}
- Settlement Amount: $${settlementAmount}
- Adjuster: ${adjusterName}${recipientEmail ? `\n- Recipient Email: ${recipientEmail}` : ""}${injuryDescription ? `\n- Injury/Damage Description: ${injuryDescription}` : ""}${additionalNotes ? `\n- Additional Notes: ${additionalNotes}` : ""}

Write a professional settlement email that:
1. Has a clear subject line referencing the claim number and claimant name
2. Opens with a professional greeting
3. States the settlement offer of $${settlementAmount} clearly
4. Explains what the release covers (${isBi ? "all bodily injury claims arising from the accident" : "all property damage claims arising from the accident"})
5. Provides clear next steps (sign and return the enclosed release, payment timeline)
6. Notes that this offer is for settlement purposes only and does not constitute an admission of liability
7. Closes professionally with the adjuster's name and Whip Claims Management contact info
8. Is appropriately formal but approachable

Output the email in this format:
Subject: [subject line]

[email body]`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
      });

      const email = extractText(result);
      if (!email) throw new Error("AI returned empty response");
      return { email };
    }),
});
