import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://test.invalid", forgeApiKey: "TEST_ONLY" } }));
const fetchMock = vi.fn();
const response = { id: "test", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] };
beforeEach(() => { fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => response }); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const payload = () => JSON.parse(fetchMock.mock.calls[0][1].body);
describe("Shared server LLM token contracts", () => {
  it("forwards a GPT completion-token budget and reasoning without max_tokens or Claude thinking", async () => {
    await invokeLLM({ model: "gpt-5-mini", messages: [{ role: "user", content: "Synthetic test only" }], max_completion_tokens: 6000, reasoning: { effort: "low" }, outputSchema: { name: "test", strict: true, schema: { type: "object", properties: {}, additionalProperties: false } } });
    expect(payload()).toMatchObject({ model: "gpt-5-mini", max_completion_tokens: 6000, reasoning: { effort: "low" }, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(payload()).not.toHaveProperty("max_tokens");
    expect(payload()).not.toHaveProperty("thinking");
  });
  it("preserves explicit Claude thinking and max_tokens without a GPT completion budget", async () => {
    await invokeLLM({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Synthetic test only" }], max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(payload()).toMatchObject({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(payload()).not.toHaveProperty("max_completion_tokens");
    expect(payload()).not.toHaveProperty("reasoning");
  });
  it("leaves existing callers' defaults unchanged", async () => {
    await invokeLLM({ messages: [{ role: "user", content: "Synthetic test only" }] });
    expect(payload()).toMatchObject({ max_tokens: 32768, thinking: { budget_tokens: 128 } });
    expect(payload()).not.toHaveProperty("max_completion_tokens");
  });
});
