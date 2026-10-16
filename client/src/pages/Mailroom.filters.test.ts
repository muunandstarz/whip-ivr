import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Mailroom.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../../../server/routers/mail.ts", import.meta.url), "utf8");

describe("Mailroom queue filters", () => {
  it("sends the selected sort mode to the admin queue instead of only changing local state", () => {
    expect(source).toContain("sort: sortOrder,");
    expect(routerSource).toContain("sort: z.enum(['receivedAt_desc', 'receivedAt_asc', 'dueAt_asc', 'dueAt_desc']).optional()");
    expect(source).toContain('<SelectItem value="receivedAt_desc">Newest First</SelectItem>');
    expect(source).toContain('<SelectItem value="receivedAt_asc">Oldest First</SelectItem>');
  });

  it("keeps category, source, handler, and status filters connected to query state", () => {
    expect(source).toContain('category: categoryFilter !== "all" ? categoryFilter : undefined');
    expect(source).toContain('handlerId: handlerFilter !== "all" ? Number(handlerFilter) : undefined');
    expect(source).toContain('source: sourceFilter !== "all" ? sourceFilter as any : undefined');
    expect(source).toContain('if (activeTab === "all" && statusFilter !== "all") base.status = statusFilter;');
  });
});
