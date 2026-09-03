import { describe, expect, it } from 'vitest';
import { computeCoverageThrough } from './DocGenerator';

function iso(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

describe('computeCoverageThrough', () => {
  it('uses the current weekly Maryland renewal period after the 30-day initial term', () => {
    const result = computeCoverageThrough({
      state: 'MD',
      startDateStr: '2026-05-01',
      dateOfLossStr: '',
      stillInRental: true,
      refDateStr: '2026-08-06',
    });
    expect(iso(result.throughDate)).toBe('2026-08-09');
    expect(result.warning).toBeNull();
  });

  it('uses the Maryland initial-term end while still inside the first 30 days', () => {
    const result = computeCoverageThrough({
      state: 'MD',
      startDateStr: '2026-05-01',
      dateOfLossStr: '',
      stillInRental: true,
      refDateStr: '2026-05-20',
    });
    expect(iso(result.throughDate)).toBe('2026-05-31');
  });

  it('uses the non-Maryland 12-month initial term before beginning weekly renewals', () => {
    const result = computeCoverageThrough({
      state: 'GA',
      startDateStr: '2026-05-01',
      dateOfLossStr: '',
      stillInRental: true,
      refDateStr: '2026-08-06',
    });
    expect(iso(result.throughDate)).toBe('2027-05-01');
  });

  it('uses the editable last-rental day directly when the driver is no longer in the rental', () => {
    const result = computeCoverageThrough({
      state: 'MD',
      startDateStr: '2026-05-01',
      dateOfLossStr: '2026-06-05',
      stillInRental: false,
      refDateStr: '2026-08-06',
    });
    expect(iso(result.throughDate)).toBe('2026-06-05');
  });

  it('does not project coverage when the reference date precedes the issue date', () => {
    const result = computeCoverageThrough({
      state: 'MD',
      startDateStr: '2026-05-01',
      dateOfLossStr: '',
      stillInRental: true,
      refDateStr: '2026-04-30',
    });
    expect(result.throughDate).toBeNull();
    expect(result.warning).toMatch(/before the coverage start date/i);
  });
});
