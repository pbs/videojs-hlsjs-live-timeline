import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LiveChapters, ProgramDateTime, useLiveChapters, useProgramDateTimeFormat } from '../react';
import { dateRange, FakeCue, FakeMedia, T0 } from './fakes';

// What the hooks read of `@videojs/react`: the player's media and locale.
const player = vi.hoisted(() => ({ media: null as unknown }));
vi.mock('@videojs/react', () => ({ useMedia: () => player.media, useLocale: () => 'en-US' }));

const cues = (media: FakeMedia) =>
  media.tracks[0]?.cues.map((cue) => [cue.startTime, cue.endTime > 1e300 ? 'open' : cue.endTime, cue.text]) ?? [];

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  if (!('VTTCue' in globalThis)) Object.assign(globalThis, { VTTCue: FakeCue });
});

let root: Root | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(element: ReactElement, media = new FakeMedia()) {
  player.media = media;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return {
    container,
    media,
    hls: media.engine!,
    rerender: (next: ReactElement) => act(async () => root!.render(next)),
  };
}

describe('LiveChapters', () => {
  it("places SCTE-35 breaks on the player's media", async () => {
    const { hls, media } = await render(createElement(LiveChapters, { adBreaks: true }));

    await act(async () => hls.load(30, { a: dateRange(T0 + 8_000, T0 + 20_000) }));

    expect(media.tracks[0]).toMatchObject({ kind: 'chapters', mode: 'hidden' });
    expect(cues(media)).toEqual([[8, 20, 'Ad break']]);
  });

  it('takes a schedule, and clears its cues when unmounted', async () => {
    const schedule = [{ start: T0, title: 'Show' }];
    const { hls, media } = await render(createElement(LiveChapters, { chapters: schedule }));
    await act(async () => hls.load(10));
    expect(cues(media)).toEqual([[0, 'open', 'Show']]);

    await act(async () => root!.unmount());
    root = null;
    expect(cues(media)).toEqual([]);
  });

  it('returns the track, and announces each change once', async () => {
    const onChaptersChange = vi.fn();
    const seen: (TextTrack | null)[] = [];
    function Probe(): null {
      // A new callback on every render, as when passed inline.
      seen.push(
        useLiveChapters({ chapters: [{ start: T0, title: 'Show' }], onChaptersChange: (t) => onChaptersChange(t) })
      );
      return null;
    }

    const { hls, media } = await render(createElement(Probe));
    await act(async () => hls.load(10));
    await act(async () => hls.load(12));

    expect(seen.at(-1)).toBe(media.tracks[0]);
    expect(onChaptersChange).toHaveBeenCalledTimes(1);
    expect(onChaptersChange).toHaveBeenCalledWith(media.tracks[0]);
  });
});

describe('ProgramDateTime', () => {
  it('shows the clock time at the playback position', async () => {
    const { container, hls, media } = await render(createElement(ProgramDateTime, { timeZone: 'UTC' }));
    const time = () => container.querySelector('time')!;
    expect(time().textContent).toBe('');
    expect(time().hasAttribute('data-unavailable')).toBe(true);

    await act(async () => {
      hls.load(30);
      media.currentTime = 65;
      media.dispatchEvent(new Event('timeupdate'));
    });

    expect(time().textContent).toBe('12:01:05 PM');
    expect(time().dateTime).toBe('2026-10-05T12:01:05.000Z');
    expect(time().hasAttribute('data-unavailable')).toBe(false);
    expect(time().getAttribute('aria-live')).toBe('off');
  });
});

/** The clock time at `at`, as a slider value would show it with the format. */
function Pointer({ at }: { at: number }): ReactElement {
  const format = useProgramDateTimeFormat({
    timeZone: 'UTC',
    formatOptions: { hour: 'numeric', minute: '2-digit' },
  });
  return createElement('output', null, format(at));
}

describe('useProgramDateTimeFormat', () => {
  it("formats stream times as clock times, for a slider value's format", async () => {
    const { container, hls, rerender } = await render(createElement(Pointer, { at: 90 }));
    expect(container.textContent).toBe('');

    hls.load(30);
    await rerender(createElement(Pointer, { at: 3_600 }));
    expect(container.textContent).toBe('1:00 PM');
  });
});
