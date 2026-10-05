import type { PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';
import { mediaContext, UIElement } from '@videojs/html';

import type { ChapterInput } from './chapters.js';
import { type HlsJsMedia, isHlsJsMedia } from './engine.js';
import { LiveChaptersTrack } from './live-chapters-track.js';

/**
 * Chapters for a live stream, kept on a `kind="chapters"` text track in step with the playlist, so the time slider's
 * `<media-time-slider-chapters>` and `<media-time-slider-chapter-title>` work for live content. Chapters come from a
 * schedule in wall-clock time (`src` or `chapters`), from SCTE-35 breaks the playlist signals with `#EXT-X-DATERANGE`
 * (`ad-breaks`), or both, with breaks cutting into the schedule. A chapter appears once the stream reaches it.
 *
 * @fires chapters-change - The cues on `track` changed.
 */
export class HlsJsLiveChaptersElement extends UIElement {
  static readonly tagName = 'hlsjs-live-chapters';

  static override properties = {
    src: { type: String },
    adBreaks: { type: Boolean, attribute: 'ad-breaks' },
    adBreakTitle: { type: String, attribute: 'ad-break-title' },
    label: { type: String },
  };

  /** URL of a JSON schedule: an array of `{ start, end?, title }` in wall-clock time. */
  declare src: string | undefined;
  /** Add the stream's SCTE-35 breaks as chapters. */
  declare adBreaks: boolean;
  /** Title of the ad break chapters. */
  declare adBreakTitle: string;
  /** Label of the chapters track. */
  declare label: string;

  readonly #media = new ContextConsumer(this, { context: mediaContext, subscribe: true });
  readonly #track = new LiveChaptersTrack(() => this.dispatchEvent(new Event('chapters-change')));

  #ownMedia: HlsJsMedia | null = null;
  #chapters: readonly ChapterInput[] | null = null;

  constructor() {
    super();
    this.adBreaks = false;
    this.adBreakTitle = 'Ad break';
    this.label = 'Chapters';
  }

  /**
   * The media this element follows: the player's, or one set here, which takes its place while set. `null` goes back to
   * the player's. For players that don't share their media with custom elements.
   */
  get media(): HlsJsMedia | null {
    return this.#track.media;
  }

  set media(media: HlsJsMedia | null) {
    this.#ownMedia = media;
    this.requestUpdate();
  }

  /** Chapters in wall-clock time, set from code. Takes the place of `src` while set. */
  get chapters(): readonly ChapterInput[] | null {
    return this.#chapters;
  }

  set chapters(chapters: readonly ChapterInput[] | null) {
    this.#chapters = chapters;
    this.requestUpdate();
  }

  /** The chapters track this element keeps, or `null` before it has media. */
  get track(): TextTrack | null {
    return this.#track.track;
  }

  override disconnectedCallback(): void {
    // Disconnecting lets go of the media, so clear its cues first.
    this.#track.clear();
    super.disconnectedCallback();
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const media = this.#ownMedia ?? this.#media.value?.media;
    this.#track.setMedia(isHlsJsMedia(media) ? media : null);
    this.#track.setOptions({
      src: this.src,
      chapters: this.#chapters,
      adBreaks: this.adBreaks,
      adBreakTitle: this.adBreakTitle,
      label: this.label,
    });
  }
}
