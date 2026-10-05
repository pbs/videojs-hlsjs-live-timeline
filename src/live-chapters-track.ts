import type Hls from 'hls.js';
import type { Fragment } from 'hls.js';

import { adBreaks, type Chapter, type ChapterInput, mergeChapters, toChapters } from './chapters.js';
import { fragmentsTimeAt } from './clock-time.js';
import { type EngineChange, HlsJsEngineController, type HlsJsMedia } from './engine.js';

/** End time of a cue for a chapter still running: past any live edge, so the slider runs it to the edge. */
const OPEN_END = Number.MAX_VALUE;

/** Media outlive whatever keeps their chapters, and a text track cannot be removed, so each media keeps one. */
const tracks = new WeakMap<HlsJsMedia, TextTrack>();

type CueSpec = readonly [start: number, end: number, title: string];

function round(time: number): number {
  return Math.round(time * 1000) / 1000;
}

export interface LiveChaptersOptions {
  /** URL of a JSON schedule: an array of `{ start, end?, title }` in wall-clock time. */
  src?: string | undefined;
  /** Chapters in wall-clock time, set from code. Take the place of `src` while set. */
  chapters?: readonly ChapterInput[] | null | undefined;
  /** Add the stream's SCTE-35 breaks as chapters. */
  adBreaks?: boolean | undefined;
  /** Title of the ad break chapters. Defaults to `Ad break`. */
  adBreakTitle?: string | undefined;
  /** Label of the chapters track. Defaults to `Chapters`. */
  label?: string | undefined;
}

/**
 * Keeps a media's `kind="chapters"` text track in step with its playlist, for `<hlsjs-live-chapters>` and the React
 * `<LiveChapters>`. Chapters come from a schedule in wall-clock time, from the SCTE-35 breaks the playlist signals with
 * `#EXT-X-DATERANGE`, or both, with breaks cutting into the schedule. A chapter appears once the stream reaches it.
 */
export class LiveChaptersTrack {
  readonly #engine = new HlsJsEngineController(null, (change) => this.#onEngineChange(change));
  readonly #onChange: () => void;

  #options: LiveChaptersOptions = {};
  #src: string | undefined;
  #fetched: Chapter[] = [];
  #fetch: AbortController | null = null;
  #cues: readonly CueSpec[] = [];
  /** The media whose track holds `#cues`. */
  #applied: HlsJsMedia | null = null;
  /** Set from a new manifest until its first playlist, while the engine still holds the old one's details. */
  #stale = false;
  /**
   * Stream times of wall-clock boundaries, kept from while they were in the playlist. A window that slides drops its
   * oldest segments, and a boundary that has scrolled out would otherwise be extrapolated from a different first
   * segment on each reload, across any PDT discontinuity in between.
   */
  readonly #times = new Map<number, number>();

  /** `onChange` runs whenever the cues on `track` change. */
  constructor(onChange: () => void = () => {}) {
    this.#onChange = onChange;
  }

  get media(): HlsJsMedia | null {
    return this.#engine.media;
  }

  /** The chapters track of the media, or `null` without media. */
  get track(): TextTrack | null {
    const media = this.#engine.media;
    return (media && tracks.get(media)) ?? null;
  }

  /** Follow this media's playlist, or `null` to let go of it. */
  setMedia(media: HlsJsMedia | null): void {
    this.#engine.setMedia(media);
  }

  setOptions(options: LiveChaptersOptions): void {
    this.#options = options;
    if (options.src !== this.#src) this.#load(options.src);
    this.#sync();
  }

  /** Empty the track and let go of the media. `setMedia` and `setOptions` start again. */
  clear(): void {
    this.#apply([]);
    if (this.#fetch) {
      this.#fetch.abort();
      this.#fetch = null;
      // Unfinished, so load it again next time.
      this.#src = undefined;
    }
    this.setMedia(null);
  }

  #onEngineChange(change: EngineChange): void {
    // Cues and times placed on the old timeline mean nothing on the new one.
    if (change !== 'playlist') {
      this.#apply([]);
      this.#times.clear();
    }
    this.#stale = change === 'manifest';
    this.#sync();
  }

  #load(src: string | undefined): void {
    this.#fetch?.abort();
    this.#fetch = null;
    this.#src = src;
    this.#fetched = [];
    if (!src) return;

    const controller = new AbortController();
    this.#fetch = controller;

    fetch(new URL(src, document.baseURI), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ChapterInput[]>;
      })
      .then((schedule) => {
        this.#fetch = null;
        this.#fetched = toChapters(schedule);
        this.#sync();
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') console.warn(`[hlsjs-live-chapters] ${src}: ${error.message}`);
      });
  }

  #sync(): void {
    const hls = this.#engine.engine;
    const details = hls?.latestLevelDetails;
    if (!details || this.#stale) return;

    const { chapters, adBreaks: withBreaks, adBreakTitle = 'Ad break' } = this.#options;
    const programs = chapters ? toChapters(chapters) : this.#fetched;
    const breaks = withBreaks ? adBreaks(details.dateRanges, adBreakTitle) : [];

    this.#apply(this.#place(hls!, mergeChapters(programs, breaks)));
  }

  /**
   * Stream times for the chapters in the playlist's window. Every boundary converts in the same pass, so one chapter's
   * end and the next one's start are the same number; rounding keeps reloads that move nothing from changing the cues.
   */
  #place(hls: Hls, chapters: readonly Chapter[]): CueSpec[] {
    const { fragments, edge } = hls.latestLevelDetails!;
    const windowStart = fragments[0]?.start ?? 0;
    const cues: CueSpec[] = [];

    for (const chapter of chapters) {
      const start = Math.max(0, this.#timeAt(fragments, chapter.start));
      // The stream runs behind the clock: a chapter waits until its start is in the playlist.
      if (!(start < edge)) continue;

      const end = chapter.end === Number.POSITIVE_INFINITY ? OPEN_END : this.#timeAt(fragments, chapter.end);
      // A sliding window drops a chapter once it has scrolled out entirely.
      if (end > start && end > windowStart) cues.push([start, end, chapter.title]);
    }

    return cues;
  }

  #timeAt(fragments: readonly Fragment[], date: number): number {
    const kept = this.#times.get(date);
    if (kept !== undefined) return kept;

    const time = round(fragmentsTimeAt(fragments, date));
    const first = fragments[0];
    const last = fragments.at(-1);
    const inPlaylist =
      first?.programDateTime != null &&
      last?.programDateTime != null &&
      date >= first.programDateTime &&
      date <= last.programDateTime + last.duration * 1000;

    if (inPlaylist && !Number.isNaN(time)) this.#times.set(date, time);
    return time;
  }

  #apply(cues: readonly CueSpec[]): void {
    const media = this.#engine.media;

    // Moved to other media: empty the track it left before filling the new one.
    if (this.#applied && this.#applied !== media) {
      this.#write(this.#applied, []);
      this.#applied = null;
      this.#cues = [];
    }

    const same =
      cues.length === this.#cues.length && cues.every((cue, i) => cue.every((part, j) => part === this.#cues[i]![j]));
    if (same || !media) return;

    this.#write(media, cues);
    this.#applied = media;
    this.#cues = cues;
    this.#onChange();
  }

  #write(media: HlsJsMedia, cues: readonly CueSpec[]): void {
    const track = this.#trackFor(media);
    for (const cue of Array.from(track.cues ?? [])) track.removeCue(cue);
    for (const [start, end, title] of cues) track.addCue(new VTTCue(start, end, title));

    // Video.js reads chapter cues again only on text track list, loadstart, and duration events. Adding a cue fires
    // none of them, and a live stream's duration stays Infinity, so it would not see these until the next source.
    media.textTracks.dispatchEvent(new Event('change'));
  }

  #trackFor(media: HlsJsMedia): TextTrack {
    let track = tracks.get(media);

    if (!track) {
      track = media.addTextTrack('chapters', this.#options.label ?? 'Chapters', document.documentElement.lang);
      tracks.set(media, track);
    }

    track.mode = 'hidden';
    return track;
  }
}
