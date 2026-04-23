import express from "express";
import { invokeLLM } from "./_core/llm";
import {
  upsertCallSession,
  getCallSession,
  createIntakeRecord,
  deleteCallSession,
} from "./db";
import { notifyOwner } from "./_core/notification";

export const ivrRouter = express.Router();

// Parse URL-encoded Twilio webhooks
ivrRouter.use(express.urlencoded({ extended: false }));

const HANDLERS = [
  "Natasha",
  "Jayla",
  "Carlito",
  "Annie",
  "Lorraine",
  "Jovel",
  "MJ",
  "Daryl",
];

const WRONG_DEPT_NUMBERS: Record<string, string> = {
  vehicle: "1-855-906-5948",
  billing: "1-855-906-5947",
  help_desk: "1-855-906-5948",
};

// ─── TwiML helper ──────────────────────────────────────────────────────────

function twiml(sayText: string, gatherOrHangup: "gather" | "hangup" = "gather"): string {
  const escaped = sayText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  if (gatherOrHangup === "hangup") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escaped}</Say>
  <Hangup/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" speechTimeout="3" speechModel="phone_call" action="/api/ivr/gather" method="POST" timeout="10">
    <Say voice="Polly.Joanna" language="en-US">${escaped}</Say>
  </Gather>
  <Redirect method="POST">/api/ivr/gather</Redirect>
</Response>`;
}

function twimlTransfer(message: string, forwardNumber: string): string {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escaped}</Say>
  <Dial>${forwardNumber}</Dial>
</Response>`;
}

// ─── Inbound call entry point ──────────────────────────────────────────────

ivrRouter.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid as string;
  const callerPhone = req.body.From as string;

  await upsertCallSession({
    callSid,
    callerPhone,
    state: "greeting",
    collectedData: {},
    conversationHistory: [],
    callerType: "unknown",
  });

  res.type("text/xml").send(
    twiml(
      "Thank you for calling Whip Claims. To help route your call, please tell me: " +
        "are you a Whip member, claimant, or police officer? Or are you calling from an insurance company, law office, or medical provider? " +
        "You can also say help desk or billing if you need a different department."
    )
  );
});

// ─── Gather handler — processes speech input ───────────────────────────────

ivrRouter.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid as string;
  const callerPhone = req.body.From as string;
  const speechResult = (req.body.SpeechResult as string) || "";

  let session = await getCallSession(callSid);
  if (!session) {
    await upsertCallSession({
      callSid,
      callerPhone,
      state: "greeting",
      collectedData: {},
      conversationHistory: [],
      callerType: "unknown",
    });
    session = await getCallSession(callSid);
  }

  const collectedData = (session?.collectedData as Record<string, string>) || {};
  const history = (session?.conversationHistory as Array<{ role: string; content: string }>) || [];
  const currentState = session?.state || "greeting";

  // Add user speech to history
  if (speechResult) {
    history.push({ role: "user", content: speechResult });
  }

  // ── LLM-driven conversation ──────────────────────────────────────────────
  const systemPrompt = `You are an AI voice assistant for Whip Claims, an auto insurance claims department. 
Your job is to route callers and collect intake information efficiently and professionally.

CALLER TYPES:
- "member" = Whip fleet member (rideshare driver who leases a vehicle through Whip)
- "claimant" = third-party claimant involved in an accident with a Whip member
- "police" = law enforcement calling about an incident
- "carrier" = insurance company adjuster or representative
- "law_office" = attorney or law office staff
- "medical_provider" = doctor, hospital, or medical billing staff
- "wrong_department" = vehicle/car issues, billing, help desk, or anything not claims-related

ROUTING RULES:
- Members, claimants, and police → route to live agent (say you are connecting them now)
- Carriers, law offices, medical providers → collect intake information
- Wrong department → provide correct phone number and end call

INTAKE FIELDS TO COLLECT (for carriers/law offices/medical providers):
1. caller_name - their full name
2. organization - company/firm name
3. whip_claim_number - Whip claim number (format MD-XXXX or similar)
4. caller_reference_number - their internal reference or file number
5. call_purpose - reason for calling (status check, demand, payment inquiry, new claim, etc.)
6. message - their full message or what they need
7. callback_phone - best callback number
8. callback_email - email address
9. assigned_handler - who at Whip they are trying to reach (if known)

CURRENT STATE: ${currentState}
COLLECTED DATA SO FAR: ${JSON.stringify(collectedData)}

RESPONSE FORMAT: Respond with a JSON object:
{
  "speak": "What to say to the caller",
  "state": "new_state",
  "callerType": "detected_type_or_null",
  "collectField": "field_name_or_null",
  "fieldValue": "extracted_value_or_null",
  "action": "continue|transfer_live|transfer_wrong_dept|complete_intake|confirm_readback",
  "wrongDeptType": "vehicle|billing|help_desk|null"
}

States: greeting → identify_type → collect_intake → confirm_readback → complete

For the confirm_readback state, read back ALL collected information and ask for confirmation.
Keep responses concise and professional. Do not repeat yourself.`;

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content as string })),
  ];

  let aiResponse: {
    speak: string;
    state: string;
    callerType: string | null;
    collectField: string | null;
    fieldValue: string | null;
    action: string;
    wrongDeptType: string | null;
  };

  try {
    const llmResult = await invokeLLM({
      messages: llmMessages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ivr_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              speak: { type: "string" },
              state: { type: "string" },
              callerType: { type: ["string", "null"] },
              collectField: { type: ["string", "null"] },
              fieldValue: { type: ["string", "null"] },
              action: { type: "string" },
              wrongDeptType: { type: ["string", "null"] },
            },
            required: ["speak", "state", "callerType", "collectField", "fieldValue", "action", "wrongDeptType"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = llmResult.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : "{}";
    aiResponse = JSON.parse(content || "{}");
  } catch (err) {
    console.error("[IVR] LLM error:", err);
    res.type("text/xml").send(
      twiml(
        "I'm sorry, I'm having trouble processing your request. Please hold while I transfer you to a team member."
      )
    );
    return;
  }

  // Update collected data
  if (aiResponse.collectField && aiResponse.fieldValue) {
    collectedData[aiResponse.collectField] = aiResponse.fieldValue;
  }
  if (aiResponse.callerType) {
    collectedData["callerType"] = aiResponse.callerType;
  }

  // Add AI response to history
  history.push({ role: "assistant", content: aiResponse.speak });

  // Save updated session
  await upsertCallSession({
    callSid,
    callerPhone,
    state: aiResponse.state,
    collectedData,
    conversationHistory: history,
    callerType: (aiResponse.callerType || session?.callerType || "unknown") as
      | "carrier"
      | "law_office"
      | "medical_provider"
      | "member"
      | "claimant"
      | "police"
      | "wrong_department"
      | "unknown",
  });

  // ── Handle actions ───────────────────────────────────────────────────────

  if (aiResponse.action === "transfer_live") {
    // Route member/claimant/police to live agent queue
    res.type("text/xml").send(
      twimlTransfer(
        aiResponse.speak + " Please hold while I connect you now.",
        "+18559065949" // Main claims line — Twilio will ring through to agents
      )
    );
    await deleteCallSession(callSid);
    return;
  }

  if (aiResponse.action === "transfer_wrong_dept") {
    const deptType = aiResponse.wrongDeptType || "help_desk";
    const number = WRONG_DEPT_NUMBERS[deptType] || WRONG_DEPT_NUMBERS["help_desk"];
    res.type("text/xml").send(
      twiml(
        `${aiResponse.speak} The correct number for that department is ${number}. Thank you for calling Whip, and have a great day.`,
        "hangup"
      )
    );
    await deleteCallSession(callSid);
    return;
  }

  if (aiResponse.action === "complete_intake") {
    // Save the intake record
    const transcript = history
      .map((h) => `${h.role === "user" ? "Caller" : "AI"}: ${h.content}`)
      .join("\n");

    const intakeId = await createIntakeRecord({
      callSid,
      callerPhone,
      callerType: (collectedData["callerType"] || "unknown") as InsertIntakeRecord["callerType"],
      callerName: collectedData["caller_name"],
      organization: collectedData["organization"],
      whipClaimNumber: collectedData["whip_claim_number"],
      callerReferenceNumber: collectedData["caller_reference_number"],
      callPurpose: collectedData["call_purpose"],
      message: collectedData["message"],
      callbackPhone: collectedData["callback_phone"],
      callbackEmail: collectedData["callback_email"],
      assignedHandler: collectedData["assigned_handler"],
      status: "open",
      transcript,
      source: "ai_ivr",
    });

    // Send notification
    const handlerName = collectedData["assigned_handler"] || "Claims Team";
    const org = collectedData["organization"] || "Unknown";
    const claimNum = collectedData["whip_claim_number"] || "N/A";
    await notifyOwner({
      title: `New AI Intake: ${org} — Whip Claim ${claimNum}`,
      content: `New intake record #${intakeId} created.\n\nCaller: ${collectedData["caller_name"] || "Unknown"} from ${org}\nClaim: ${claimNum}\nPurpose: ${collectedData["call_purpose"] || "N/A"}\nHandler: ${handlerName}\nCallback: ${collectedData["callback_phone"] || "N/A"}\nEmail: ${collectedData["callback_email"] || "N/A"}\n\nMessage: ${collectedData["message"] || "N/A"}`,
    });

    res.type("text/xml").send(twiml(aiResponse.speak, "hangup"));
    await deleteCallSession(callSid);
    return;
  }

  // Default: continue conversation
  res.type("text/xml").send(twiml(aiResponse.speak));
});

// ─── Voicemail / recording callback ───────────────────────────────────────

ivrRouter.post("/voicemail", async (req, res) => {
  const callSid = req.body.CallSid as string;
  const callerPhone = req.body.From as string;
  const recordingUrl = req.body.RecordingUrl as string;

  // Transcribe via Whisper
  let transcript = "";
  try {
    const { transcribeAudio } = await import("./_core/voiceTranscription");
    const result = await transcribeAudio({ audioUrl: recordingUrl + ".mp3" });
    transcript = ("text" in result ? result.text : "") || "";
  } catch (err) {
    console.error("[IVR] Transcription error:", err);
    transcript = "[Transcription unavailable]";
  }

  await createIntakeRecord({
    callSid,
    callerPhone,
    callerType: "unknown",
    message: transcript,
    transcript,
    status: "open",
    source: "voicemail",
  });

  await notifyOwner({
    title: `New Voicemail from ${callerPhone}`,
    content: `Voicemail received from ${callerPhone}.\n\nTranscript:\n${transcript}`,
  });

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

// ─── Call status callback ──────────────────────────────────────────────────

ivrRouter.post("/status", async (req, res) => {
  const callSid = req.body.CallSid as string;
  const callStatus = req.body.CallStatus as string;

  if (["completed", "failed", "busy", "no-answer", "canceled"].includes(callStatus)) {
    await deleteCallSession(callSid).catch(() => {});
  }

  res.sendStatus(204);
});

// Type alias for InsertIntakeRecord used in this file
type InsertIntakeRecord = {
  callSid?: string;
  callerPhone?: string;
  callerType?: "carrier" | "law_office" | "medical_provider" | "member" | "claimant" | "police" | "wrong_department" | "unknown";
  callerName?: string;
  organization?: string;
  whipClaimNumber?: string;
  callerReferenceNumber?: string;
  callPurpose?: string;
  message?: string;
  callbackPhone?: string;
  callbackEmail?: string;
  assignedHandler?: string;
  status?: "open" | "closed";
  transcript?: string;
  source?: "ai_ivr" | "voicemail" | "manual";
};
