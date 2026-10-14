import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText = mocks.getText;
    destroy = mocks.destroy;
  },
}));

import { extractPipBillLinesFromUpload } from "./pipBillExtraction";

function makeOnePagePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

describe("scan-only PIP bill extraction", () => {
  beforeEach(() => {
    mocks.invokeLLM.mockReset();
    mocks.getText.mockReset().mockResolvedValue({ text: "" });
    mocks.destroy.mockReset().mockResolvedValue(undefined);
  });

  it("renders a scan-only PDF for vision and returns structured bill lines", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            lines: [{ provider: "Priority Care RX", dos: "2026-04-02", pos: "01", cpt: "00093-5180-16", modifier: "", units: 1, billed: 339.1 }],
          }),
        },
      }],
    });

    const result = await extractPipBillLinesFromUpload({
      bytes: makeOnePagePdf(),
      fileName: "scan-only-hcfa.pdf",
      mimeType: "application/pdf",
      state: "PA",
    });

    expect(result).toEqual({
      lines: [{ provider: "Priority Care RX", dos: "2026-04-02", pos: "01", cpt: "00093-5180-16", modifier: "", units: 1, billed: 339.1 }],
      warning: "",
    });
    const request = mocks.invokeLLM.mock.calls[0]?.[0];
    expect(request).toMatchObject({ model: "gpt-5-mini", outputSchema: { name: "pip_bill_lines", strict: true } });
    expect(request.messages[0].content.some((part: { type: string }) => part.type === "image_url")).toBe(true);
  });
});
