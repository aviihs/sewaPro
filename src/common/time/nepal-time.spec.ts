import { describe, expect, it } from 'vitest';
import { isCalendarDate, nepalDayRange, nepalMonthRange, toNepalTime } from './nepal-time.js';

describe('nepal time', () => {
  it('converts an instant to Nepal local day, minute and date', () => {
    expect(toNepalTime(new Date('2030-01-06T03:15:00Z'))).toEqual({
      dayOfWeek: 0,
      minuteOfDay: 9 * 60,
      date: '2030-01-06',
    });
    expect(toNepalTime(new Date('2030-01-06T18:20:00Z'))).toEqual({
      dayOfWeek: 1,
      minuteOfDay: 5,
      date: '2030-01-07',
    });
  });

  it('bounds a Nepal calendar day in UTC', () => {
    expect(nepalDayRange('2030-01-07')).toEqual({
      start: new Date('2030-01-06T18:15:00.000Z'),
      end: new Date('2030-01-07T18:15:00.000Z'),
    });
  });

  it('bounds the Nepal month of an instant, across year end', () => {
    expect(nepalMonthRange(new Date('2030-12-31T19:00:00Z'))).toEqual({
      start: new Date('2030-12-31T18:15:00.000Z'),
      end: new Date('2031-01-31T18:15:00.000Z'),
    });
  });

  it('validates calendar dates', () => {
    expect(isCalendarDate('2030-02-28')).toBe(true);
    expect(isCalendarDate('2030-02-30')).toBe(false);
    expect(isCalendarDate('2030-2-3')).toBe(false);
  });
});
