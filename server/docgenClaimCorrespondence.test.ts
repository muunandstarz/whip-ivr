import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { docgenRouter } from "./routers/docgen";
import { AGENT_EXTENSIONS, getHandlerExtension } from "../shared/handlerExtensions";

const root = resolve(process.cwd());
const schemaSource = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const dbSource = readFileSync(resolve(root, "server/db.ts"), "utf8");
const handlerRouterSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const docgenRouterSource = readFileSync(resolve(root, "server/routers/docgen.ts"), "utf8");

describe("Document Generator claim correspondence and IVR extensions", () => {
  it("keeps the authoritative Aircall extension directory available without importing the Aircall router into the client", () => {
    expect(AGENT_EXTENSIONS[1881559]).toBe("309"); // Jayla Bernard
    expect(AGENT_EXTENSIONS[1924606]).toBe("048"); // Daniel Giono
    expect(AGENT_EXTENSIONS[1940186]).toBe("028"); // Tim Chan
    expect(AGENT_EXTENSIONS[1947062]).toBe("996"); // Geovanni Cabrera
    expect(getHandlerExtension("Daniel Giono")).toBe("048");
    expect(getHandlerExtension("Jayla Bernard")).toBe("309");
    expect(getHandlerExtension("Giovanni Cabrera")).toBe("996");
    expect(getHandlerExtension("D'emily")).toBe("011");
    expect(handlerRouterSource).toContain('import { AGENT_EXTENSIONS, getHandlerExtension } from "./aircallExtensions";');
    expect(handlerRouterSource).toContain("AGENT_EXTENSIONS[handler.aircallUserId] : null) ?? getHandlerExtension(handler.name)");
  });

  it("exposes created-not-sent correspondence procedures with validation for claim, recipient, subject, and body", () => {
    const procedures = Object.keys(docgenRouter._def.procedures);
    expect(procedures).toContain("createClaimCorrespondence");
    expect(procedures).toContain("getClaimCorrespondence");
    const schema = (docgenRouter._def.procedures.createClaimCorrespondence as any)._def.inputs[0];
    expect(schema.safeParse({
      claimNumber: "GB-9269-626462-884829",
      recipientEmail: "adjuster@example.com",
      subject: "Subrogation demand",
      bodyText: "Please review the attached demand and respond within fifteen days.",
    }).success).toBe(true);
    expect(schema.safeParse({
      claimNumber: "GB-9269-626462-884829",
      recipientEmail: "not-an-email",
      subject: "Subrogation demand",
      bodyText: "Please review.",
    }).success).toBe(false);
    expect(schema.safeParse({
      claimNumber: "",
      recipientEmail: "adjuster@example.com",
      subject: "Subrogation demand",
      bodyText: "Please review.",
    }).success).toBe(false);
  });

  it("stores claim correspondence as created-not-sent records rather than using Mailroom or an outbound Gmail path", () => {
    expect(schemaSource).toContain('export const claimCorrespondence = mysqlTable("claim_correspondence"');
    expect(schemaSource).toContain('mysqlEnum("status", ["created_not_sent"])');
    expect(schemaSource).not.toContain('claimCorrespondence = mysqlTable("claim_correspondence", {\n  id: int("id").autoincrement().primaryKey(),\n  claimNumber: varchar("claimNumber", { length: 64 }).notNull(),\n  recipientName: varchar("recipientName", { length: 256 }),\n  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),\n  subject: varchar("subject", { length: 512 }).notNull(),\n  bodyText: text("bodyText").notNull(),\n  status: mysqlEnum("status", ["created_not_sent", "sent"]');
    expect(dbSource).toContain('status: "created_not_sent"');
    expect(docgenRouterSource).not.toContain("forwardMailToClaim");
    expect(docgenRouterSource).not.toContain("users/me/messages/send");
    expect(docgenRouterSource).toContain("no save from this feature can queue, send, forward, ingest, or");
  });
});
