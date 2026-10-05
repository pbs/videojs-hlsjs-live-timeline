import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HlsJsLiveChaptersElement } from '../index';
import { dateRange, FakeCue, FakeHls, FakeMedia, fragments, mount, T0 } from './fakes';

const cues = (media: FakeMedia) =>
  media.tracks[0]?.cues.map((cue) => [cue.startTime, cue.endTime > 1e300 ? 'open' : cue.endTime, cue.text]) ?? [];

beforeAll(() => {
  // happy-dom has no VTTCue.
  if (!('VTTCue' in globalThis)) Object.assign(globalThis, { VTTCue: FakeCue });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function chapters(setup: (element: HlsJsLiveChaptersElement) => void = () => {}) {
  const element = new HlsJsLiveChaptersElement();
  setup(element);
  const mounted = await mount(element);
  const changes = vi.fn();
  mounted.media.textTracks.addEventListener('change', changes);
  return { ...mounted, changes };
}

describe('HlsJsLiveChaptersElement', () => {
  it('places SCTE-35 breaks on the stream timeline from their PDT', async () => {
    const { hls, media } = await chapters((el) => (el.adBreaks = true));

    hls.load(30, {
      b: dateRange(T0 + 40_000, T0 + 70_000),
      a: dateRange(T0 + 8_000, T0 + 20_000),
      other: dateRange(T0, T0 + 4_000, { CLASS: 'com.example' }),
    });

    expect(media.tracks).toHaveLength(1);
    expect(media.tracks[0]).toMatchObject({ kind: 'chapters', label: 'Chapters', mode: 'hidden' });
    expect(cues(media)).toEqual([
      [8, 20, 'Ad break'],
      [40, 70, 'Ad break'],
    ]);
  });

  it('cuts the breaks out of a schedule', async () => {
    const { hls, media } = await chapters((el) => {
      el.adBreaks = true;
      el.adBreakTitle = 'Ad';
      el.chapters = [
        { start: T0, title: 'Morning' },
        { start: new Date(T0 + 60_000).toISOString(), title: 'Noon' },
      ];
    });

    hls.load(30, { a: dateRange(T0 + 20_000, T0 + 30_000) });

    expect(cues(media)).toEqual([
      [0, 20, 'Morning'],
      [20, 30, 'Ad'],
      [30, 60, 'Morning'],
      [60, 'open', 'Noon'],
    ]);
  });

  it('adds a chapter once the playlist reaches its start, and tells Video.js to read the track again', async () => {
    const { element, hls, media, changes } = await chapters((el) => {
      el.chapters = [
        { start: T0, title: 'Now' },
        { start: T0 + 150_000, title: 'Next' },
      ];
    });
    const changed = vi.fn();
    element.addEventListener('chapters-change', changed);

    hls.load(30);
    expect(cues(media)).toEqual([[0, 150, 'Now']]);
    expect(changes).toHaveBeenCalledTimes(1);

    hls.load(40);
    expect(cues(media)).toEqual([
      [0, 150, 'Now'],
      [150, 'open', 'Next'],
    ]);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('leaves the cues alone when a reload changes nothing', async () => {
    const { hls, changes } = await chapters((el) => (el.chapters = [{ start: T0, title: 'Now' }]));

    hls.load(30);
    hls.load(31);
    hls.load(32);

    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('drops chapters a sliding window has passed, and keeps the times of boundaries it has passed', async () => {
    const { hls, media, changes } = await chapters((el) => {
      el.chapters = [
        { start: T0, title: 'First' },
        { start: T0 + 40_000, title: 'Second' },
        { start: T0 + 100_000, title: 'Third' },
      ];
    });

    hls.load(30);
    expect(cues(media)).toEqual([
      [0, 40, 'First'],
      [40, 100, 'Second'],
      [100, 'open', 'Third'],
    ]);

    // The window slides past 40 s, and a PDT jump after it would move an extrapolated 40 s by ten seconds.
    hls.loadFragments(fragments(30, 60, 10_000));
    expect(cues(media)).toEqual([
      [40, 100, 'Second'],
      [100, 'open', 'Third'],
    ]);

    // Sliding on without passing another boundary changes nothing.
    const before = changes.mock.calls.length;
    hls.loadFragments(fragments(30, 64, 10_000));
    expect(changes).toHaveBeenCalledTimes(before);
  });

  it('closes an open break when its SCTE35-IN arrives', async () => {
    const { hls, media } = await chapters((el) => (el.adBreaks = true));

    hls.load(30, { a: dateRange(T0 + 100_000, null) });
    expect(cues(media)).toEqual([[100, 'open', 'Ad break']]);

    hls.load(40, { a: dateRange(T0 + 100_000, T0 + 130_000) });
    expect(cues(media)).toEqual([[100, 130, 'Ad break']]);
  });

  it('clears the cues for a new manifest, and waits for its first playlist', async () => {
    const { element, hls, media } = await chapters((el) => (el.chapters = [{ start: T0, title: 'Old' }]));
    hls.load(30);

    hls.fire(FakeHls.Events.MANIFEST_LOADING);
    expect(cues(media)).toEqual([]);

    // Until the new playlist loads, the engine holds the old one, so nothing is placed from it.
    element.chapters = [{ start: T0, title: 'New' }];
    await element.updateComplete;
    expect(cues(media)).toEqual([]);

    hls.load(10);
    expect(cues(media)).toEqual([[0, 'open', 'New']]);
  });

  it('moves to a new engine and keeps one track per media', async () => {
    const { element, media } = await chapters((el) => (el.chapters = [{ start: T0, title: 'Show' }]));
    const next = new FakeHls();

    media.replaceEngine(next);
    next.load(10);

    expect(cues(media)).toEqual([[0, 'open', 'Show']]);
    expect(media.tracks).toHaveLength(1);
    expect(element.track).toBe(media.tracks[0]);
  });

  it('empties the track of media it moves away from', async () => {
    const { element, hls, media, provider } = await chapters((el) => (el.chapters = [{ start: T0, title: 'Show' }]));
    hls.load(10);
    const other = new FakeMedia();

    provider.setValue({ media: other, registerMedia: () => () => {} } as never);
    await element.updateComplete;
    other.engine!.load(10);

    expect(cues(media)).toEqual([]);
    expect(cues(other)).toEqual([[0, 'open', 'Show']]);
  });

  it('clears its cues when removed', async () => {
    const { element, hls, media } = await chapters((el) => (el.chapters = [{ start: T0, title: 'Show' }]));
    hls.load(10);

    element.remove();

    expect(cues(media)).toEqual([]);
  });

  it("follows media set on it in place of the player's, and outside a player", async () => {
    const own = new FakeMedia();
    const { element, hls, media } = await chapters((el) => {
      el.chapters = [{ start: T0, title: 'Show' }];
      el.media = own as never;
    });
    own.engine!.load(10);
    hls.load(10);
    expect(cues(own)).toEqual([[0, 'open', 'Show']]);
    expect(cues(media)).toEqual([]);

    const alone = new HlsJsLiveChaptersElement();
    alone.chapters = [{ start: T0, title: 'Alone' }];
    alone.media = media as never;
    document.body.append(alone);
    await alone.updateComplete;
    expect(alone.track).toBe(media.tracks[0]);
    expect(cues(media)).toEqual([[0, 'open', 'Alone']]);
    element.remove();
  });

  it('loads the schedule again after a removal that cut its load short', async () => {
    let resolve: ((response: Response) => void) | undefined;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((done, fail) => {
          resolve = done;
          init?.signal?.addEventListener('abort', () => fail(new DOMException('Aborted', 'AbortError')));
        })
    );
    const { element, hls, media } = await chapters((el) => (el.src = '/schedule.json'));
    const player = element.parentElement!;
    element.remove();
    player.append(element);
    await element.updateComplete;
    resolve!(new Response(JSON.stringify([{ start: T0, title: 'Fetched' }])));
    hls.load(10);

    await vi.waitFor(() => expect(cues(media)).toEqual([[0, 'open', 'Fetched']]));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('loads a schedule from src', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ start: T0, end: T0 + 20_000, title: 'Fetched' }])));
    const { hls, media } = await chapters((el) => (el.src = '/schedule.json'));
    hls.load(10);

    await vi.waitFor(() => expect(cues(media)).toEqual([[0, 20, 'Fetched']]));
    expect(String(fetch.mock.calls[0]![0])).toMatch(/\/schedule\.json$/);
  });
});
