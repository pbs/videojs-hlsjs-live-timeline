import { ContextProvider } from '@videojs/element/context';
import { mediaContext, type MediaContextValue, sliderContext, type SliderContextValue } from '@videojs/html';

type Listener = (event: string, data: object) => void;

export const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);

/** Four-second fragments from `start` seconds, with a PDT of `T0` at 0 s, shifted by `jump` milliseconds. */
export function fragments(count: number, start = 0, jump = 0) {
  return Array.from({ length: count }, (_, i) => ({
    start: start + i * 4,
    duration: 4,
    programDateTime: T0 + (start + i * 4) * 1000 + jump,
  }));
}

export function dateRange(start: number, end: number | null, attr: Record<string, unknown> = { 'SCTE35-OUT': '0xFC' }) {
  return { startDate: new Date(start), endDate: end === null ? null : new Date(end), plannedDuration: null, attr };
}

/** Only what the elements read of hls.js: its statics, `latestLevelDetails`, and `on`/`off`. */
export class FakeHls {
  static Events = {
    MANIFEST_LOADING: 'hlsManifestLoading',
    LEVEL_UPDATED: 'hlsLevelUpdated',
    DESTROYING: 'hlsDestroying',
  };

  latestLevelDetails: { fragments: ReturnType<typeof fragments>; edge: number; dateRanges: object } | null = null;
  listeners = new Map<string, Set<Listener>>();

  /** Loads a playlist of `count` fragments from 0 s and announces it. */
  load(count: number, dateRanges: object = {}): void {
    this.loadFragments(fragments(count), dateRanges);
  }

  /** Loads a playlist of these fragments, such as a window that has slid, and announces it. */
  loadFragments(list: ReturnType<typeof fragments>, dateRanges: object = {}): void {
    const last = list.at(-1);
    this.latestLevelDetails = { fragments: list, edge: last ? last.start + last.duration : 0, dateRanges };
    this.fire(FakeHls.Events.LEVEL_UPDATED);
  }

  on(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  fire(event: string, data: object = {}): void {
    this.listeners.get(event)?.forEach((listener) => listener(event, data));
  }
}

export class FakeCue {
  constructor(
    public startTime: number,
    public endTime: number,
    public text: string
  ) {}
}

export class FakeTextTrack {
  mode = 'disabled';
  readonly cues: FakeCue[] = [];

  constructor(
    public kind: string,
    public label: string,
    public language: string
  ) {}

  addCue(cue: FakeCue): void {
    this.cues.push(cue);
  }

  removeCue(cue: FakeCue): void {
    this.cues.splice(this.cues.indexOf(cue), 1);
  }
}

/** `<hlsjs-video>` as the elements see it. */
export class FakeMedia extends EventTarget {
  engine: FakeHls | null;
  currentTime = 0;
  readonly textTracks = Object.assign(new EventTarget(), { length: 0 });
  readonly tracks: FakeTextTrack[] = [];

  constructor(engine: FakeHls | null = new FakeHls()) {
    super();
    this.engine = engine;
  }

  addTextTrack(kind: string, label = '', language = ''): FakeTextTrack {
    const track = new FakeTextTrack(kind, label, language);
    this.tracks.push(track);
    return track;
  }

  /** Swaps in a new engine the way `<hlsjs-video>` does: build it, then dispatch `loadstart`. */
  replaceEngine(engine: FakeHls | null): void {
    this.engine = engine;
    this.dispatchEvent(new Event('loadstart'));
  }
}

const sliderValue = (pointerValue: number) =>
  // The elements read only `pointerValue`.
  ({ pointerValue, state: { pointing: true, dragging: false } }) as unknown as SliderContextValue;

/** Mounts `element` inside a fake player that provides `media` and a slider. */
export async function mount<T extends HTMLElement & { updateComplete: Promise<boolean> }>(
  element: T,
  media: FakeMedia = new FakeMedia()
) {
  const player = document.createElement('div');
  const slider = new ContextProvider(player, { context: sliderContext, initialValue: sliderValue(0) });
  const provider = new ContextProvider(player, {
    context: mediaContext,
    initialValue: { media, registerMedia: () => () => {} } as unknown as MediaContextValue,
  });

  player.append(element);
  document.body.append(player);
  await element.updateComplete;

  return {
    element,
    media,
    hls: media.engine!,
    provider,
    point: async (time: number) => {
      slider.setValue(sliderValue(time));
      await element.updateComplete;
    },
  };
}
