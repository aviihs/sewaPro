import { describe, expect, it } from 'vitest';
import { InvalidReportRangeError, fillPeriods, periodsBetween } from './admin-stats.js';

describe('report periods', () => {
  it('lists days and months inclusively', () => {
    expect(periodsBetween({ from: '2030-01-30', to: '2030-02-02', unit: 'day' })).toEqual([
      '2030-01-30',
      '2030-01-31',
      '2030-02-01',
      '2030-02-02',
    ]);
    expect(periodsBetween({ from: '2030-11-15', to: '2031-02-01', unit: 'month' })).toEqual([
      '2030-11',
      '2030-12',
      '2031-01',
      '2031-02',
    ]);
  });

  it('rejects impossible, inverted and oversized ranges', () => {
    expect(() => periodsBetween({ from: '2030-02-30', to: '2030-03-01', unit: 'day' })).toThrow(
      InvalidReportRangeError,
    );
    expect(() => periodsBetween({ from: '2030-02-01', to: '2030-01-01', unit: 'day' })).toThrow(
      InvalidReportRangeError,
    );
    expect(() => periodsBetween({ from: '2030-01-01', to: '2031-12-31', unit: 'day' })).toThrow(
      InvalidReportRangeError,
    );
    expect(() => periodsBetween({ from: '2020-01-01', to: '2030-01-01', unit: 'month' })).toThrow(
      InvalidReportRangeError,
    );
  });

  it('fills missing periods with zeros', () => {
    const rows = [{ period: '2030-02', n: 3 }];
    expect(fillPeriods(['2030-01', '2030-02'], rows, (period) => ({ period, n: 0 }))).toEqual([
      { period: '2030-01', n: 0 },
      { period: '2030-02', n: 3 },
    ]);
  });
});
