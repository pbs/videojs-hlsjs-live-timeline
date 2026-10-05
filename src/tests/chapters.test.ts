import { describe, expect, it } from 'vitest';

import { adBreaks, type DateRangeLike, mergeChapters, toChapters } from '../chapters';

const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);
const MINUTE = 60_000;

function range(
  start: number,
  end: number | null,
  attr: Record<string, unknown>,
  plannedDuration: number | null = null
) {
  return {
    startDate: new Date(start),
    endDate: end === null ? null : new Date(end),
    plannedDuration,
    attr,
  } satisfies DateRangeLike;
}

describe('toChapters', () => {
  it('reads ISO strings, Dates, and epoch milliseconds, and sorts', () => {
    expect(
      toChapters([
        { start: new Date(T0 + 30 * MINUTE), end: T0 + 60 * MINUTE, title: 'B' },
        { start: new Date(T0).toISOString(), end: new Date(T0 + 30 * MINUTE).toISOString(), title: 'A' },
      ])
    ).toEqual([
      { start: T0, end: T0 + 30 * MINUTE, title: 'A' },
      { start: T0 + 30 * MINUTE, end: T0 + 60 * MINUTE, title: 'B' },
    ]);
  });

  it('runs an entry without an end to the next start, and leaves the last one open', () => {
    expect(
      toChapters([
        { start: T0, title: 'A' },
        { start: T0 + 30 * MINUTE, title: 'B' },
      ])
    ).toEqual([
      { start: T0, end: T0 + 30 * MINUTE, title: 'A' },
      { start: T0 + 30 * MINUTE, end: Number.POSITIVE_INFINITY, title: 'B' },
    ]);
  });

  it('drops entries with no valid start or no length', () => {
    expect(
      toChapters([
        { start: 'not a date', title: 'bad' },
        { start: T0, end: T0, title: 'empty' },
        { start: T0, end: T0 + MINUTE, title: 'ok' },
      ])
    ).toEqual([{ start: T0, end: T0 + MINUTE, title: 'ok' }]);
  });
});

describe('adBreaks', () => {
  it('takes SCTE35-OUT ranges, closed by END-DATE or DURATION', () => {
    expect(
      adBreaks(
        {
          late: range(T0 + 10 * MINUTE, T0 + 11 * MINUTE, { 'SCTE35-OUT': '0xFC', 'SCTE35-IN': '0xFC' }),
          early: range(T0, T0 + 40_000, { 'SCTE35-OUT': '0xFC' }),
          other: range(T0, T0 + MINUTE, { CLASS: 'com.example.chapter' }),
        },
        'Ad'
      )
    ).toEqual([
      { start: T0, end: T0 + 40_000, title: 'Ad' },
      { start: T0 + 10 * MINUTE, end: T0 + 11 * MINUTE, title: 'Ad' },
    ]);
  });

  it('runs an unclosed break for its planned duration, or leaves it open', () => {
    expect(
      adBreaks(
        {
          planned: range(T0, null, { 'SCTE35-OUT': '0xFC' }, 30),
          open: range(T0 + MINUTE, null, { 'SCTE35-OUT': '0xFC' }),
        },
        'Ad'
      )
    ).toEqual([
      { start: T0, end: T0 + 30_000, title: 'Ad' },
      { start: T0 + MINUTE, end: Number.POSITIVE_INFINITY, title: 'Ad' },
    ]);
  });
});

describe('mergeChapters', () => {
  const program = { start: T0, end: T0 + 30 * MINUTE, title: 'Show' };

  it('cuts a break out of the program it falls in', () => {
    expect(mergeChapters([program], [{ start: T0 + 10 * MINUTE, end: T0 + 11 * MINUTE, title: 'Ad' }])).toEqual([
      { start: T0, end: T0 + 10 * MINUTE, title: 'Show' },
      { start: T0 + 10 * MINUTE, end: T0 + 11 * MINUTE, title: 'Ad' },
      { start: T0 + 11 * MINUTE, end: T0 + 30 * MINUTE, title: 'Show' },
    ]);
  });

  it('keeps a break that overlaps a program edge or falls between programs', () => {
    const breaks = [
      { start: T0 - MINUTE, end: T0 + MINUTE, title: 'Ad' },
      { start: T0 + 30 * MINUTE, end: T0 + 31 * MINUTE, title: 'Ad' },
    ];
    expect(mergeChapters([program], breaks)).toEqual([
      breaks[0],
      { start: T0 + MINUTE, end: T0 + 30 * MINUTE, title: 'Show' },
      breaks[1],
    ]);
  });

  it('drops slivers of program a break leaves behind', () => {
    expect(mergeChapters([program], [{ start: T0 + 100, end: T0 + 30 * MINUTE - 100, title: 'Ad' }])).toEqual([
      { start: T0 + 100, end: T0 + 30 * MINUTE - 100, title: 'Ad' },
    ]);
  });

  it('ends a program at an open break', () => {
    expect(mergeChapters([program], [{ start: T0 + 20 * MINUTE, end: Number.POSITIVE_INFINITY, title: 'Ad' }])).toEqual(
      [
        { start: T0, end: T0 + 20 * MINUTE, title: 'Show' },
        { start: T0 + 20 * MINUTE, end: Number.POSITIVE_INFINITY, title: 'Ad' },
      ]
    );
  });

  it('returns the programs when there are no breaks', () => {
    expect(mergeChapters([program], [])).toEqual([program]);
  });
});
