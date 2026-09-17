import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  pdfGetText: vi.fn(),
  pdfDestroy: vi.fn(),
}));

vi.mock('../_core/llm', () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock('../storage', () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl }));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText = mocks.pdfGetText;
    destroy = mocks.pdfDestroy;
  },
}));

import { docgenRouter } from './docgen';

function makeOnePagePdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

describe('docgen.parseEstimate structured upload parsing', () => {
  beforeEach(() => {
    mocks.invokeLLM.mockReset();
    mocks.storageGetSignedUrl.mockReset();
    mocks.pdfGetText.mockReset();
    mocks.pdfDestroy.mockReset().mockResolvedValue(undefined);
  });

  it('returns normalized estimate data from a schema-constrained model response', async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: '{"repairTotal":"$1,234.50","vehicle":"2024 Toyota Camry SE","vin":"1HGCM82633A004352","claimNumber":"PF438367","dateOfLoss":"September 1, 2026","shopName":"Example Collision","insurerName":"Klutch Insurance","claimantName":"Taylor Morgan","adjusterName":"Jordan Smith","lineItems":[{"description":"Replace bumper cover","amount":"800.00"}]}',
        },
      }],
    });
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/repair-estimate.pdf',
      fileName: 'repair-estimate.pdf',
    })).resolves.toMatchObject({
      repairTotal: '1234.50',
      vehicle: '2024 Toyota Camry SE',
      vin: '1HGCM82633A004352',
      claimNumber: 'PF438367',
      dateOfLoss: '2026-09-01',
      insurerName: 'Klutch Insurance',
      claimantName: 'Taylor Morgan',
      adjusterName: 'Jordan Smith',
      lineItems: [{ description: 'Replace bumper cover', amount: '800.00' }],
    });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      outputSchema: expect.objectContaining({ name: 'repair_estimate', strict: true }),
    }));
  });

  it('retries a blank structured response through the multimodal path before failing the shared upload workflow', async () => {
    mocks.invokeLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"repairTotal":"2267.45","vehicle":"2023 Toyota Corolla LE","vin":"1HGCM82633A004352","claimNumber":"WHIP-42","dateOfLoss":"2026-09-01","shopName":"Example Collision","lineItems":[{"description":"Rear bumper cover","amount":"1200"}]}',
          },
        }],
      });
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/repair-estimate.pdf',
      fileName: 'repair-estimate.pdf',
    })).resolves.toMatchObject({
      repairTotal: '2267.45',
      vehicle: '2023 Toyota Corolla LE',
      claimNumber: 'WHIP-42',
      lineItems: [{ description: 'Rear bumper cover', amount: '1200.00' }],
    });
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(2);
    expect(mocks.invokeLLM.mock.calls[1]?.[0]).toMatchObject({
      model: 'gemini-3-flash-preview',
      responseFormat: { type: 'json_object' },
    });
  });

  it('reads provider-parsed structured content when the message text field is blank', async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: '',
          parsed: {
            repairTotal: '845.00', vehicle: '', vin: '', claimNumber: '', dateOfLoss: '', shopName: '', lineItems: [],
          },
        },
      }],
    });
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/repair-estimate.pdf',
    })).resolves.toMatchObject({ repairTotal: '845.00' });
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
  });

  it('continues to the multimodal parser when the primary structured-output request fails', async () => {
    mocks.invokeLLM
      .mockRejectedValueOnce(new Error('primary provider unavailable'))
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"repairTotal":"550","vehicle":"","vin":"","claimNumber":"","dateOfLoss":"","shopName":"","lineItems":[]}',
          },
        }],
      });
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/repair-estimate.pdf',
    })).resolves.toMatchObject({ repairTotal: '550.00' });
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(2);
  });

  it('uses retained-upload PDF text before costly file-url model attempts', async () => {
    mocks.invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"repairTotal":"1875","vehicle":"2022 Honda Accord Sport","vin":"","claimNumber":"SUB-109","dateOfLoss":"2026-09-01","shopName":"Reliable Auto Body","lineItems":[{"description":"Rear bumper","amount":"675"}]}',
          },
        }],
      });
    mocks.storageGetSignedUrl.mockResolvedValue('https://files.example.com/retained-estimate.pdf');
    mocks.pdfGetText.mockResolvedValue({ text: 'Estimate Total: $1,875.00\n2022 Honda Accord Sport\nClaim SUB-109' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(Buffer.from('%PDF mock'), { status: 200 }));
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/repair-estimate.pdf',
      fileName: 'repair-estimate.pdf',
      storageKey: 'docgen-uploads/123_repair-estimate.pdf',
    })).resolves.toMatchObject({ repairTotal: '1875.00', claimNumber: 'SUB-109' });
    expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith('docgen-uploads/123_repair-estimate.pdf');
    expect(mocks.pdfGetText).toHaveBeenCalled();
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(mocks.invokeLLM.mock.calls[0]?.[0].messages[0].content).toContain('SERVER-EXTRACTED PDF TEXT');
    fetchMock.mockRestore();
  });

  it('renders a scan-only retained PDF and uses vision extraction when no embedded text is available', async () => {
    mocks.invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"repairTotal":"3000","vehicle":"2021 Ford Escape","vin":"","claimNumber":"SCAN-1","dateOfLoss":"","shopName":"","lineItems":[]}',
          },
        }],
      });
    mocks.storageGetSignedUrl.mockResolvedValue('https://files.example.com/scan-only.pdf');
    mocks.pdfGetText.mockResolvedValue({ text: '' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(makeOnePagePdf(), { status: 200 }));
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseEstimate({
      fileUrl: 'https://files.example.com/scan-only.pdf',
      fileName: 'scan-only.pdf',
      storageKey: 'docgen-uploads/124_scan-only.pdf',
    })).resolves.toMatchObject({ repairTotal: '3000.00', claimNumber: 'SCAN-1' });
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    const visionCall = mocks.invokeLLM.mock.calls[0]?.[0];
    expect(visionCall).toMatchObject({ model: 'gemini-3-flash-preview' });
    expect(visionCall.messages[0].content.some((part: { type: string }) => part.type === 'image_url')).toBe(true);
    fetchMock.mockRestore();
  });

  it('extracts the carrier name, claim number, offer, stated reason, and line position for a rebuttal', async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: '{"carrierName":"Geico","carrierClaimNumber":"047819485010130","adjusterName":"Daniel Rodriguez","offerTotal":"1527.24","denialReasons":"Applied an unsupported betterment deduction to the bumper assembly.","lineItems":[{"description":"Rear bumper assembly","offer":"1527.24","reason":"Betterment deduction applied"}]}',
        },
      }],
    });
    const caller = docgenRouter.createCaller({
      user: { id: 90001, openId: 'test', name: 'Test User', email: 'test@example.com', role: 'admin' },
    } as any);

    await expect(caller.parseCarrierResponse({
      fileUrl: 'https://files.example.com/geico-response.pdf',
      fileName: 'geico-response.pdf',
    })).resolves.toEqual({
      carrierName: 'Geico',
      carrierClaimNumber: '047819485010130',
      adjusterName: 'Daniel Rodriguez',
      offerTotal: '1527.24',
      denialReasons: 'Applied an unsupported betterment deduction to the bumper assembly.',
      lineItems: [{ description: 'Rear bumper assembly', offer: '1527.24', reason: 'Betterment deduction applied' }],
    });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      outputSchema: expect.objectContaining({ name: 'carrier_response', strict: true }),
    }));
  });
});
