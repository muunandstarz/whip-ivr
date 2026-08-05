import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  saveDocgenDraft, getDocgenDrafts, deleteDocgenDraft,
  toggleDocgenFavorite, getDocgenFavorites,
  addDocgenRecentDoc, getDocgenRecentDocs,
  shareDocgenTemplate, getDocgenSharedTemplates, markDocgenTemplateRead,
  listAllUsers,
} from "../db";
import { lookupClaimForDocgen } from "../db";

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


function getStateCoverageInfo(state: string): string {
  const rules: Record<string, string> = {
    MD: "PIP: $2,500 mandatory (waivable). BI: $30k/$60k. PD: $15k. UM/UIM: $30k/$60k. No-fault state with PIP threshold for tort.",
    DC: "No PIP. BI: $25k/$50k. PD: $10k. UM: $25k/$50k. Tort state.",
    VA: "No PIP. BI: $25k/$50k. PD: $20k. UM/UIM rejectable. Tort state.",
    FL: "PIP: $10k mandatory (80% medical, 60% lost wages). No mandatory BI. PD: $10k. No-fault state — PIP threshold $10k for tort.",
    GA: "No PIP. BI: $25k/$50k. PD: $25k. UM/UIM not mandated. Tort state.",
    IL: "No PIP. BI: $25k/$50k. PD: $20k. UM/UIM rejectable. Tort state.",
    MA: "PIP: $8k mandatory (statutory). BI: $20k/$40k. PD: $5k. No-fault state.",
    PA: "PIP: $5k mandatory. BI: $15k/$30k. PD: $5k. Choice no-fault (limited/full tort).",
    NJ: "PIP: $15k mandatory. BI: $15k/$30k. PD: $5k. No-fault state.",
    TX: "No PIP. BI: $30k/$60k. PD: $25k. UM/UIM rejectable. Tort state.",
    NY: "PIP: $50k mandatory (no-fault). BI: $25k/$50k. PD: $10k. No-fault state — serious injury threshold for tort.",
    NC: "No PIP. BI: $50k/$100k. PD: $50k. UM/UIM rejectable. Tort state.",
    DE: "PIP: $15k mandatory. BI: $25k/$50k. PD: $10k. No-fault state.",
    OH: "No PIP. BI: $25k/$50k. PD: $25k. UM/UIM rejectable. Tort state.",
  };
  return rules[state.toUpperCase()] ?? `Standard tort state — verify ${state} minimum limits.`;
}


export const docgenRouter = router({
  improveWithAI: protectedProcedure
    .input(z.object({
      body: z.string().min(10),
      claimNumber: z.string().optional(),
      recipient: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { body, claimNumber, recipient } = input;
      const ctx = [claimNumber ? `Claim #: ${claimNumber}` : null, recipient ? `Recipient: ${recipient}` : null].filter(Boolean).join("\n");
      const prompt = `You are a claims professional at Whip Claims Management writing a formal letter. Rewrite the following letter body to sound more professional, clear, and legally appropriate for a claims context. Preserve all key facts, claim numbers, names, and dollar amounts exactly. Keep approximately the same length. Do not add a salutation or signature — just the body paragraphs. Output only the rewritten body text.\n\n${ctx ? `Context:\n${ctx}\n\n` : ""}Original:\n${body}`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const improved = extractText(result);
      if (!improved) throw new Error("AI returned empty response");
      return { improved };
    }),

  generateRebuttal: protectedProcedure
    .input(z.object({
      claimNumber: z.string(),
      theirClaimNumber: z.string().optional(),
      vehicle: z.string(),
      dateOfLoss: z.string(),
      carrier: z.string(),
      adjuster: z.string(),
      accidentType: z.string().optional(),
      lineItems: z.array(z.object({ item: z.string(), ours: z.number(), theirs: z.number(), reason: z.string().optional() })),
      carrierDocUrl: z.string().optional(),
      ourEstimateUrl: z.string().optional(),
      ourImageReportUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { claimNumber, theirClaimNumber, vehicle, dateOfLoss, carrier, adjuster, accidentType, lineItems, carrierDocUrl, ourEstimateUrl, ourImageReportUrl } = input;
      const totalOurs = lineItems.reduce((s, r) => s + r.ours, 0);
      const totalTheirs = lineItems.reduce((s, r) => s + r.theirs, 0);
      const gap = totalOurs - totalTheirs;
      const lines = lineItems.filter(r => r.ours - r.theirs > 0).map(r => `- ${r.item}: We claim $${r.ours.toFixed(2)}, carrier offered $${r.theirs.toFixed(2)} (gap: $${(r.ours - r.theirs).toFixed(2)})${r.reason ? ` — Carrier reason: ${r.reason}` : ""}`).join("\n");
      const promptText = `You are a senior insurance claims attorney for Whip Claims Management / DriveWhip, a commercial rideshare fleet operator. Write a complete formal carrier rebuttal letter.\n\nCLAIM DETAILS:\n- Claim #: ${claimNumber}${theirClaimNumber ? `\n- Their Claim #: ${theirClaimNumber}` : ""}\n- Vehicle: ${vehicle}\n- Date of Loss: ${dateOfLoss}\n- Adverse Carrier / Adjuster: ${carrier} / ${adjuster}${accidentType ? `\n- Accident Type: ${accidentType}` : ""}\n- Total we claim: $${totalOurs.toFixed(2)}\n- Carrier offered: $${totalTheirs.toFixed(2)}\n- Gap: $${gap.toFixed(2)}\n\nDISPUTED LINE ITEMS:\n${lines}\n\nWrite a complete formal rebuttal that opens with our address (Whip Claims Management, P.O. Box 10622, Rockville, MD 20849), cites I-CAR MRC standards/OEM procedures/state insurance code for each disputed item, demands full payment of $${gap.toFixed(2)} within 30 days, and closes with a professional signature block. FOR SETTLEMENT PURPOSES ONLY. Output only the letter.`;
      const hasAttachments = ourEstimateUrl || ourImageReportUrl || carrierDocUrl;
      let result;
      if (hasAttachments) {
        const userContent: Array<any> = [{ type: "text", text: promptText }];
        if (ourEstimateUrl) {
          userContent.push({ type: "text", text: "Our repair estimate (attached):" });
          userContent.push({ type: "file_url", file_url: { url: ourEstimateUrl, mime_type: "application/pdf" } });
        }
        if (ourImageReportUrl) {
          userContent.push({ type: "text", text: "Our vehicle image/damage report (attached):" });
          userContent.push({ type: "file_url", file_url: { url: ourImageReportUrl, mime_type: "application/pdf" } });
        }
        if (carrierDocUrl) {
          userContent.push({ type: "text", text: "Carrier's rebuttal/denial document (attached):" });
          userContent.push({ type: "file_url", file_url: { url: carrierDocUrl, mime_type: "application/pdf" } });
        }
        result = await invokeLLM({ messages: [{ role: "user", content: userContent as any }] });
      } else {
        result = await invokeLLM({ messages: [{ role: "user", content: promptText }] });
      }
      const letter = extractText(result);
      if (!letter) throw new Error("AI returned empty response");
      return { letter };
    }),

  polishRebuttal: protectedProcedure
    .input(z.object({
      draft: z.string().min(50),
      claimNumber: z.string().optional(),
      vehicle: z.string().optional(),
      carrier: z.string().optional(),
      adjuster: z.string().optional(),
      dateOfLoss: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { draft, claimNumber, vehicle, carrier, adjuster, dateOfLoss } = input;
      const prompt = `You are a senior insurance claims attorney for Whip Claims Management. Polish this carrier rebuttal letter into a legally authoritative document.\n\nCONTEXT:\n- Claim #: ${claimNumber || "[not provided]"}\n- Vehicle: ${vehicle || "[not provided]"}\n- Carrier / Adjuster: ${carrier || "[not provided]"} / ${adjuster || "[not provided]"}\n- Date of Loss: ${dateOfLoss || "[not provided]"}\n- We are a commercial fleet operator — vehicles must be repaired to OEM standards.\n\nDRAFT:\n${draft}\n\nRewrite into a polished rebuttal that: (1) opens with a firm dispute statement citing the exact dollar gap, (2) for each disputed item cites the specific regulatory/industry standard violated, (3) demands full payment within 30 days with threat of escalation to state insurance commissioner and/or litigation, (4) closes with a professional Whip Claims Management signature block. Output only the letter.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const polished = extractText(result);
      if (!polished) throw new Error("AI returned empty response");
      return { polished };
    }),

  generateSettlementEmail: protectedProcedure
    .input(z.object({
      type: z.enum(["bi", "pd"]),
      claimantName: z.string(),
      claimNumber: z.string(),
      dateOfLoss: z.string(),
      settlementAmount: z.string(),
      adjusterName: z.string(),
      additionalNotes: z.string().optional(),
      recipientEmail: z.string().optional(),
      injuryDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { type, claimantName, claimNumber, dateOfLoss, settlementAmount, adjusterName, additionalNotes, injuryDescription, recipientEmail } = input;
      const isBi = type === "bi";
      const prompt = `You are a claims adjuster at Whip Claims Management writing a professional settlement email.\n\nCLAIM DETAILS:\n- Type: ${isBi ? "Bodily Injury (BI)" : "Property Damage (PD)"}\n- Claimant: ${claimantName}\n- Claim #: ${claimNumber}\n- Date of Loss: ${dateOfLoss}\n- Settlement Amount: $${settlementAmount}\n- Adjuster: ${adjusterName}${recipientEmail ? `\n- Recipient: ${recipientEmail}` : ""}${injuryDescription ? `\n- Injury/Damage: ${injuryDescription}` : ""}${additionalNotes ? `\n- Notes: ${additionalNotes}` : ""}\n\nWrite a professional settlement email with a clear subject line, states the offer of $${settlementAmount}, explains what the release covers, provides next steps (sign/return release, payment timeline), notes this is for settlement purposes only and not an admission of liability, and closes professionally. Format:\nSubject: [subject]\n\n[email body]`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const email = extractText(result);
      if (!email) throw new Error("AI returned empty response");
      return { email };
    }),

  generateTLSettlementLetter: protectedProcedure
    .input(z.object({
      claimantName: z.string(),
      claimNumber: z.string(),
      dateOfLoss: z.string(),
      vehicle: z.string(),
      vin: z.string().optional(),
      market: z.string().optional(),
      acv: z.string(),
      priorPayment: z.string().optional(),
      lienHolder: z.string().optional(),
      lienPayoff: z.string().optional(),
      storageDeducted: z.string().optional(),
      otherDeductions: z.array(z.object({ label: z.string(), amount: z.string() })).optional(),
      netAmount: z.string(),
      adjusterName: z.string(),
      rentalCutoffDate: z.string().optional(),
      additionalNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { claimantName, claimNumber, dateOfLoss, vehicle, vin, market, acv, priorPayment, lienHolder, lienPayoff, storageDeducted, otherDeductions, netAmount, adjusterName, rentalCutoffDate, additionalNotes } = input;
      const firstName = claimantName.split(/[\s,]+/)[0] || claimantName;
      const deductions = [];
      if (priorPayment && parseFloat(priorPayment) > 0) deductions.push(`Less: Prior Payment to Claimant: ($${parseFloat(priorPayment).toFixed(2)})`);
      if (lienHolder && lienPayoff && parseFloat(lienPayoff) > 0) deductions.push(`Less: Loan Payoff — ${lienHolder}: ($${parseFloat(lienPayoff).toFixed(2)})`);
      if (storageDeducted && parseFloat(storageDeducted) > 0) deductions.push(`Less: Storage — Reasonable & Customary Amount Allowed: ($${parseFloat(storageDeducted).toFixed(2)})`);
      if (otherDeductions) for (const d of otherDeductions) if (d.label && d.amount && parseFloat(d.amount) > 0) deductions.push(`Less: ${d.label}: ($${parseFloat(d.amount).toFixed(2)})`);
      const prompt = `You are a claims adjuster at Whip Claims Management / Metro Cars Leasing Corp writing a total loss settlement offer letter.\n\nCLAIM DETAILS:\n- Claimant: ${claimantName}\n- Claim #: ${claimNumber}\n- Date of Loss: ${dateOfLoss}\n- Vehicle: ${vehicle}${vin ? ` | VIN: ${vin}` : ""}${market ? `\n- Market: ${market}` : ""}\n- ACV / Gross Settlement: $${parseFloat(acv).toFixed(2)}\n${deductions.join("\n")}\n- Net Amount Payable to Claimant: $${parseFloat(netAmount).toFixed(2)}\n${lienHolder && lienPayoff ? `- Lienholder: ${lienHolder}, Payoff: $${parseFloat(lienPayoff).toFixed(2)}\n` : ""}${rentalCutoffDate ? `- Rental review cutoff: ${rentalCutoffDate}\n` : ""}${additionalNotes ? `- Notes: ${additionalNotes}\n` : ""}- Adjuster: ${adjusterName}\n\nWrite the letter body ONLY (no letterhead, no footer). Start with "Dear ${firstName}," and include: (1) opening paragraph about total loss determination, (2) text-formatted settlement breakdown table, (3) payment issuance instructions, (4) storage deduction explanation if applicable, (5) rental review note if cutoff provided, (6) acceptance instructions, (7) closing with adjuster name/title "Claims Adjuster | Metro Cars Leasing Corp. — Claims Management" and email "claims@drivewhip.com". Output only the letter body.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const letter = extractText(result);
      if (!letter) throw new Error("AI returned empty response");
      return { letter };
    }),

  reviewCPTCodes: protectedProcedure
    .input(z.object({
      billText: z.string().min(20),
      state: z.string(),
      dateOfLoss: z.string().optional(),
      injuryDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { billText, state, dateOfLoss, injuryDescription } = input;
      const prompt = `You are a medical billing specialist and PIP claims expert at Whip Claims Management. Review the following medical bill or demand and analyze the CPT codes for applicability to the claimed injury.\n\nSTATE: ${state}\n${dateOfLoss ? `DATE OF LOSS: ${dateOfLoss}\n` : ""}${injuryDescription ? `CLAIMED INJURY: ${injuryDescription}\n` : ""}\nMEDICAL BILL / DEMAND:\n${billText}\n\nFor each CPT code found:\n1. Identify the code and description\n2. Determine if it is APPLICABLE or NOT APPLICABLE to the claimed injury\n3. Provide a brief expert explanation for your determination\n4. Flag any codes that appear excessive, duplicative, or inconsistent with the injury mechanism\n\nAlso provide:\n- OVERALL ASSESSMENT: Summary of the bill's medical necessity\n- RED FLAGS: Any codes or patterns that warrant further investigation\n- RECOMMENDED ALLOWANCE: Estimated reasonable allowance vs. billed amount\n\nFormat your response as a structured expert summary suitable for inclusion in a claim file.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const analysis = extractText(result);
      if (!analysis) throw new Error("AI returned empty response");
      return { analysis };
    }),

  // ─── Medical Bills Review ─────────────────────────────────────────────────
  analyzeMedicalDemand: protectedProcedure
    .input(z.object({
      demandFileUrl: z.string().min(1),
      vehiclePhoto1Url: z.string().optional(),
      vehiclePhoto2Url: z.string().optional(),
      state: z.string().min(1),
      dateOfLoss: z.string().optional(),
      impactType: z.string().optional(),
      injuryDescription: z.string().optional(),
      factsOfLoss: z.string().optional(),
      coverageType: z.enum(["pip", "bi", "umbi", "all"]).default("all"),
    }))
    .mutation(async ({ input }) => {
      const { demandFileUrl, vehiclePhoto1Url, vehiclePhoto2Url, state, dateOfLoss, impactType, injuryDescription, factsOfLoss, coverageType } = input;

      const systemPrompt = `You are a senior claims adjuster and medical billing expert at Whip Claims Management / Metro Cars Leasing Corp. You specialize in analyzing medical demand packages, evaluating CPT codes for medical necessity and causation, and determining applicable insurance coverage exposures.

Your analysis must be thorough, objective, and defensible. You apply state-specific insurance requirements and coverage rules.`;

      const userContent: Array<{type: string; text?: string; image_url?: {url: string; detail?: string}; file_url?: {url: string; mime_type?: string}}> = [];

      userContent.push({
        type: "text",
        text: `Analyze this medical demand package for a ${state} claim.

CLAIM DETAILS:
- State: ${state}
- Date of Loss: ${dateOfLoss || "Not provided"}
- Impact Type / Mechanism of Loss: ${impactType || "Not specified"}
- Reported Injuries: ${injuryDescription || "Not specified"}
- Facts of Loss: ${factsOfLoss || "Not provided"}
- Coverage Focus: ${coverageType === "all" ? "PIP, BI, and UMBI" : coverageType.toUpperCase()}

STATE COVERAGE REQUIREMENTS FOR ${state}:
${getStateCoverageInfo(state)}

Please analyze the attached demand package and provide:

1. BILL EXTRACTION: List every medical bill/treatment entry found with:
   - Provider name
   - Date of service
   - CPT code(s) and description
   - Billed amount
   - APPLICABLE or NOT APPLICABLE determination
   - Reason for determination (causation, medical necessity, state fee schedule)

2. CPT CODE ANALYSIS: For each unique CPT code:
   - Is it consistent with the reported mechanism of loss?
   - Is it medically necessary given the injury description?
   - Any red flags (unbundling, upcoding, duplicate billing)?

3. MECHANISM OF LOSS ASSESSMENT: Based on the impact type and facts:
   - What injuries are reasonably expected from this type of collision?
   - Which treatments are causally related vs. unrelated?

4. COVERAGE EXPOSURE CALCULATION:
   - PIP exposure (if applicable in ${state}): $X
   - BI exposure: $X
   - UMBI exposure (if applicable): $X
   - Total applicable medical: $X
   - Total not applicable: $X

5. EXPERT SUMMARY: A written expert summary (3-5 paragraphs) suitable for the claim file explaining:
   - Overall assessment of the demand
   - Key findings and red flags
   - Recommended position and rationale
   - Applicable vs. not applicable treatment breakdown

6. RESPONSE LETTER: Draft a professional response letter to the claimant/attorney addressing the demand, citing specific findings.

Format your response as structured JSON matching this schema:
{
  "bills": [{"provider": string, "date": string, "cptCode": string, "description": string, "amount": number, "applicable": boolean, "reason": string}],
  "cptAnalysis": [{"code": string, "description": string, "applicable": boolean, "redFlags": string[]}],
  "mechanismAssessment": string,
  "pipExposure": number,
  "biExposure": number,
  "umbiExposure": number,
  "totalApplicable": number,
  "totalNotApplicable": number,
  "expertSummary": string,
  "responseLetter": string,
  "redFlags": string[]
}`
      });

      // Add the demand PDF as a file
      userContent.push({
        type: "file_url",
        file_url: {
          url: demandFileUrl,
          mime_type: "application/pdf"
        }
      } as any);

      // Add vehicle photos if provided
      if (vehiclePhoto1Url) {
        userContent.push({
          type: "text",
          text: "Vehicle 1 (Whip/insured vehicle) photo:"
        });
        userContent.push({
          type: "image_url",
          image_url: { url: vehiclePhoto1Url, detail: "high" }
        } as any);
      }
      if (vehiclePhoto2Url) {
        userContent.push({
          type: "text",
          text: "Vehicle 2 (claimant/third-party vehicle) photo:"
        });
        userContent.push({
          type: "image_url",
          image_url: { url: vehiclePhoto2Url, detail: "high" }
        } as any);
      }

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent as any }
        ],
        outputSchema: {
          name: "medical_demand_analysis",
          schema: {
            type: "object",
            properties: {
              bills: { type: "array", items: { type: "object", properties: { provider: {type:"string"}, date: {type:"string"}, cptCode: {type:"string"}, description: {type:"string"}, amount: {type:"number"}, applicable: {type:"boolean"}, reason: {type:"string"} }, required: ["provider","date","cptCode","description","amount","applicable","reason"] } },
              cptAnalysis: { type: "array", items: { type: "object", properties: { code: {type:"string"}, description: {type:"string"}, applicable: {type:"boolean"}, redFlags: {type:"array", items:{type:"string"}} }, required: ["code","description","applicable","redFlags"] } },
              mechanismAssessment: { type: "string" },
              pipExposure: { type: "number" },
              biExposure: { type: "number" },
              umbiExposure: { type: "number" },
              totalApplicable: { type: "number" },
              totalNotApplicable: { type: "number" },
              expertSummary: { type: "string" },
              responseLetter: { type: "string" },
              redFlags: { type: "array", items: { type: "string" } }
            },
            required: ["bills","cptAnalysis","mechanismAssessment","pipExposure","biExposure","umbiExposure","totalApplicable","totalNotApplicable","expertSummary","responseLetter","redFlags"]
          }
        }
      });

      const raw = extractText(result);
      try {
        const parsed = JSON.parse(raw ?? "{}");
        return { success: true, analysis: parsed };
      } catch {
        return { success: true, analysis: null, raw };
      }
    }),

  // ─── Validate Release Language ────────────────────────────────────────────
  validateReleaseLanguage: protectedProcedure
    .input(z.object({
      releaseType: z.enum(["bi", "pd", "limited_bi"]),
      state: z.string(),
      claimantName: z.string(),
      settlementAmount: z.string(),
      isMinor: z.boolean().default(false),
      guardianName: z.string().optional(),
      isCarrierPayee: z.boolean().default(false),
      carrierName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { releaseType, state, claimantName, settlementAmount, isMinor, guardianName, isCarrierPayee, carrierName } = input;

      const prompt = `You are a claims attorney reviewing a ${releaseType === "bi" ? "General Release of All Claims – Bodily Injury" : releaseType === "pd" ? "General Release of All Claims – Property Damage" : "Limited Liability Release – Bodily Injury"} for a ${state} claim.

RELEASE DETAILS:
- State: ${state}
- Claimant: ${claimantName}
- Settlement Amount: $${settlementAmount}
- Minor: ${isMinor ? `Yes — Guardian: ${guardianName || "TBD"}` : "No"}
${isCarrierPayee ? `- Payee: ${carrierName || "Carrier"} (subrogation/carrier payee)` : ""}

Please review and provide:
1. Any state-specific language requirements for ${state} (e.g., minor settlement approval, court approval requirements, specific statutory language)
2. Any modifications needed for ${isMinor ? "minor claimant" : "adult claimant"}
3. ${isCarrierPayee ? `Modifications needed for carrier/subrogation payee (${carrierName})` : "Standard payee language is appropriate"}
4. Lien/Medicare/Medicaid considerations for ${state}
5. Statute of limitations language specific to ${state}
6. APPROVED or FLAG — is this release appropriate as-is or does it need modification?
7. Any recommended additional language

Be concise and practical. Focus on ${state}-specific requirements.`;

      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const review = extractText(result);
      if (!review) throw new Error("AI returned empty response");
      return { review };
    }),

  // ─── Parse PIP/Exhaustion Document ───────────────────────────────────────
  parsePIPDocument: protectedProcedure
    .input(z.object({
      fileUrl: z.string().min(1),
      state: z.string(),
      claimantName: z.string().optional(),
      dateOfLoss: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { fileUrl, state, claimantName, dateOfLoss } = input;

      const userContent: any[] = [
        {
          type: "text",
          text: `Parse this PIP/medical document for a ${state} claim.
${claimantName ? `Claimant: ${claimantName}` : ""}
${dateOfLoss ? `Date of Loss: ${dateOfLoss}` : ""}

Extract and provide:
1. All PIP payments made (date, provider, amount, service type)
2. Total PIP paid to date
3. Remaining PIP limit (if ${state} PIP limit is known)
4. Whether PIP is exhausted or approaching exhaustion
5. Any coordination of benefits issues
6. Summary suitable for a PIP exhaustion letter

Format as JSON: { payments: [{date, provider, amount, serviceType}], totalPaid: number, pipLimit: number, remaining: number, isExhausted: boolean, summary: string }`
        },
        {
          type: "file_url",
          file_url: { url: fileUrl, mime_type: "application/pdf" }
        }
      ];

      const result = await invokeLLM({
        messages: [{ role: "user", content: userContent }],
        outputSchema: {
          name: "pip_document_parse",
          schema: {
            type: "object",
            properties: {
              payments: { type: "array", items: { type: "object", properties: { date: {type:"string"}, provider: {type:"string"}, amount: {type:"number"}, serviceType: {type:"string"} }, required: ["date","provider","amount","serviceType"] } },
              totalPaid: { type: "number" },
              pipLimit: { type: "number" },
              remaining: { type: "number" },
              isExhausted: { type: "boolean" },
              summary: { type: "string" }
            },
            required: ["payments","totalPaid","pipLimit","remaining","isExhausted","summary"]
          }
        }
      });

      const raw = extractText(result);
      try {
        const parsed = JSON.parse(raw ?? "{}");
        return { success: true, parsed };
      } catch {
        return { success: true, parsed: null, raw };
      }
    }),

  // ─── Drafts ──────────────────────────────────────────────────────────────────
  saveDraft: protectedProcedure
    .input(z.object({
    tabKey: z.string(),
    tabLabel: z.string(),
    claimNumber: z.string().optional(),
      formData: z.record(z.string(), z.unknown()),
    draftId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await saveDocgenDraft(ctx.user.id, input.tabKey, input.tabLabel, input.claimNumber ?? null, input.formData, input.draftId);
      return { id };
    }),

  getDrafts: protectedProcedure.query(async ({ ctx }) => {
    return getDocgenDrafts(ctx.user.id);
  }),

  deleteDraft: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteDocgenDraft(ctx.user.id, input.draftId);
      return { ok: true };
    }),

  // ─── Favorites ────────────────────────────────────────────────────────────────
  toggleFavorite: protectedProcedure
    .input(z.object({ tabKey: z.string(), tabLabel: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isFav = await toggleDocgenFavorite(ctx.user.id, input.tabKey, input.tabLabel);
      return { isFavorite: isFav };
    }),

  getFavorites: protectedProcedure.query(async ({ ctx }) => {
    return getDocgenFavorites(ctx.user.id);
  }),

  // ─── Recent Docs ──────────────────────────────────────────────────────────────
  addRecentDoc: protectedProcedure
    .input(z.object({
      tabKey: z.string(),
      tabLabel: z.string(),
      documentName: z.string(),
      claimNumber: z.string().optional(),
      status: z.enum(["draft", "sent", "finalized"]).default("draft"),
      pdfDataUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await addDocgenRecentDoc(ctx.user.id, input.tabKey, input.tabLabel, input.documentName, input.claimNumber ?? null, input.status, input.pdfDataUrl);
      return { ok: true };
    }),

  getRecentDocs: protectedProcedure.query(async ({ ctx }) => {
    return getDocgenRecentDocs(ctx.user.id);
  }),

  // ─── Shared Templates ─────────────────────────────────────────────────────────
  shareTemplate: protectedProcedure
    .input(z.object({
      toUserId: z.number(),
    tabKey: z.string(),
    tabLabel: z.string(),
    templateName: z.string(),
      formData: z.record(z.string(), z.unknown()),
    message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await shareDocgenTemplate(ctx.user.id, input.toUserId, input.tabKey, input.tabLabel, input.templateName, input.formData, input.message);
      return { ok: true };
    }),

  getSharedTemplates: protectedProcedure.query(async ({ ctx }) => {
    return getDocgenSharedTemplates(ctx.user.id);
  }),

  markTemplateRead: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markDocgenTemplateRead(ctx.user.id, input.templateId);
      return { ok: true };
    }),

  listUsers: protectedProcedure.query(async () => {
    const users = await listAllUsers();
    return users.map(u => ({ id: u.id, name: u.name, email: u.email }));
  }),
  claimLookup: protectedProcedure
    .input(z.object({ claimNumber: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      return lookupClaimForDocgen(input.claimNumber);
    }),
  extractPIPBills: protectedProcedure
    .input(z.object({ fileUrl: z.string().url(), state: z.enum(["PA", "FL", "MD", "MA"]) }))
    .mutation(async ({ input }) => {
      const prompt = `You are a medical billing extraction specialist. Extract all line items from this HCFA-1500 health insurance claim form.

CRITICAL RULES:
1. Each row in Box 24 is a SEPARATE line item. Do NOT combine rows.
2. If the same CPT appears on multiple dates, output a separate line for EACH date.
3. ALWAYS read dollar amounts in Box 24F. Never return null for billed amounts.
4. Read units in Box 24G. Each row's units stand alone.
5. If the document contains MULTIPLE bills, include ALL line items from ALL bills.

Return ONLY valid JSON in this exact schema:
{
  "lines": [
    {
      "provider": "string (provider name from box 33)",
      "dos": "YYYY-MM-DD (box 24A From date for THIS row)",
      "pos": "string (place of service from box 24B)",
      "cpt": "string (CPT code from box 24D)",
      "modifier": "string (modifiers from box 24D, empty if none)",
      "units": number (from box 24G for THIS row),
      "billed": number (dollars from box 24F for THIS row, no dollar sign)
    }
  ]
}
Return JSON only. No preamble, no markdown.`;
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: input.fileUrl } },
      ];
      const result = await invokeLLM({
        messages: [{ role: "user", content: userContent as any }],
        max_tokens: 4000,
      });
      try {
        const text = extractText(result);
        const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        const parsed = JSON.parse(clean) as { lines: Array<{ provider: string; dos: string; pos: string; cpt: string; modifier: string; units: number; billed: number }> };
        return { lines: parsed.lines || [] };
      } catch {
        return { lines: [] };
      }
    }),
});
