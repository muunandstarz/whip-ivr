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
          content: '{"repairTotal":"$1,234.50","vehicle":"2024 Toyota Camry SE","vin":"1HGCM82633A004352","claimNumber":"PF438367","dateOfLoss":"2026-09-01","shopName":"Example Collision","lineItems":[{"description":"Replace bumper cover","amount":"800.00"}]}',
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
});
