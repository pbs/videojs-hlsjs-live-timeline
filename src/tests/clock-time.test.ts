import { describe, expect, it } from 'vitest';

import { fragmentsDateAt, fragmentsTimeAt, mediaTimeAt, programDateTimeAt } from '../clock-time';

const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);

// Four-second fragments from 100 s on the timeline, with a PDT jump of a minute before the third: a clip boundary.
const fragments = [
  { start: 100, programDateTime: T0 },
  { start: 104, programDateTime: T0 + 4_000 },
  { start: 108, programDateTime: T0 + 68_000 },
  { start: 112, programDateTime: T0 + 72_000 },
];

describe('fragmentsDateAt', () => {
  it('interpolates within a fragment', () => {
    expect(fragmentsDateAt(fragments, 102.5)).toBe(T0 + 2_500);
    expect(fragmentsDateAt(fragments, 113)).toBe(T0 + 73_000);
  });

  it('follows a PDT jump from the fragment it starts at', () => {
    expect(fragmentsDateAt(fragments, 107.9)).toBeCloseTo(T0 + 7_900);
    expect(fragmentsDateAt(fragments, 108)).toBe(T0 + 68_000);
  });

  it('extrapolates before the first fragment and after the last', () => {
    expect(fragmentsDateAt(fragments, 90)).toBe(T0 - 10_000);
    expect(fragmentsDateAt(fragments, 130)).toBe(T0 + 90_000);
  });

  it('is NaN without fragments, PDT, or a finite time', () => {
    expect(fragmentsDateAt([], 100)).toBeNaN();
    expect(fragmentsDateAt([{ start: 0, programDateTime: null }], 1)).toBeNaN();
    expect(fragmentsDateAt(fragments, Number.NaN)).toBeNaN();
  });
});

describe('fragmentsTimeAt', () => {
  it('inverts fragmentsDateAt', () => {
    for (const time of [100, 102.5, 106, 108, 115]) {
      expect(fragmentsTimeAt(fragments, fragmentsDateAt(fragments, time))).toBeCloseTo(time);
    }
  });

  it('extrapolates before the first fragment and after the last', () => {
    expect(fragmentsTimeAt(fragments, T0 - 10_000)).toBe(90);
    expect(fragmentsTimeAt(fragments, T0 + 90_000)).toBe(130);
  });

  it('is NaN without fragments, PDT, or a finite date', () => {
    expect(fragmentsTimeAt([], T0)).toBeNaN();
    expect(fragmentsTimeAt([{ start: 0, programDateTime: null }], T0)).toBeNaN();
    expect(fragmentsTimeAt(fragments, Number.NaN)).toBeNaN();
  });
});

describe('programDateTimeAt and mediaTimeAt', () => {
  it('are NaN without an engine, as when the browser plays the stream natively', () => {
    expect(programDateTimeAt(null, 10)).toBeNaN();
    expect(mediaTimeAt(null, T0)).toBeNaN();
  });
});
