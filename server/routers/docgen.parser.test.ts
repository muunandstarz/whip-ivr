import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));

vi.mock('../_core/llm', () => ({ invokeLLM: mocks.invokeLLM }));

import { docgenRouter } from './docgen';

describe('docgen.parseEstimate structured upload parsing', () => {
  beforeEach(() => mocks.invokeLLM.mockReset());

  it('returns normalized estimate data from a schema-constrained model response', async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: '{"repairTotal":"$1,234.50","vehicle":"2024 Toyota Camry SE","vin":"1HGCM82633A004352","claimNumber":"PF438367","dateOfLoss":"September 1, 2026","shopName":"Example Collision","lineItems":[{"description":"Replace bumper cover","amount":"800.00"}]}',
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
});
