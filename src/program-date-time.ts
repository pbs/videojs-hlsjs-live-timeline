import type { PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';
import { mediaContext, sliderContext, UIElement } from '@videojs/html';

import { programDateTimeAt } from './clock-time.js';
import { HlsJsEngineController, type HlsJsMedia, isHlsJsMedia } from './engine.js';
import { DEFAULT_FORMAT } from './format.js';

/**
 * A clock time from the stream's `#EXT-X-PROGRAM-DATE-TIME`: at the playback position, or with `type="pointer"` inside
 * a `<media-time-slider>`, at the pointer. Empty, with `data-unavailable`, until the stream reports one.
 */
export class HlsJsProgramDateTimeElement extends UIElement {
  static readonly tagName = 'hlsjs-program-date-time';

  static override properties = {
    type: { type: String },
    timeZone: { type: String, attribute: 'time-zone' },
  };

  /** `current` for the playback position, `pointer` for the slider pointer. */
  declare type: 'current' | 'pointer';
  /** IANA time zone, such as `America/New_York`. Defaults to the viewer's. */
  declare timeZone: string | undefined;

  readonly #slider = new ContextConsumer(this, { context: sliderContext, subscribe: true });
  readonly #media = new ContextConsumer(this, { context: mediaContext, subscribe: true });
  readonly #engine = new HlsJsEngineController(this, () => this.requestUpdate());

  #ownMedia: HlsJsMedia | null = null;
  #formatOptions: Intl.DateTimeFormatOptions = DEFAULT_FORMAT;
  #formatter: Intl.DateTimeFormat | null = null;
  #formatterKey = '';
  #listening: HlsJsMedia | null = null;

  constructor() {
    super();
    this.type = 'current';
  }

  /**
   * The media this element follows: the player's, or one set here, which takes its place while set. `null` goes back to
   * the player's. For players that don't share their media with custom elements.
   */
  get media(): HlsJsMedia | null {
    return this.#engine.media;
  }

  set media(media: HlsJsMedia | null) {
    this.#ownMedia = media;
    this.requestUpdate();
  }

  /** `Intl.DateTimeFormat` options for the display. Defaults to hours, minutes, and seconds. */
  get formatOptions(): Intl.DateTimeFormatOptions {
    return this.#formatOptions;
  }

  set formatOptions(options: Intl.DateTimeFormatOptions) {
    this.#formatOptions = options;
    this.#formatter = null;
    this.requestUpdate();
  }

  /** The clock time shown, in milliseconds since the epoch, or `NaN`. */
  get date(): number {
    const hls = this.#engine.engine;
    const media = this.#engine.media;
    if (!hls || !media) return Number.NaN;

    const time = this.type === 'pointer' ? this.#slider.value?.pointerValue : media.currentTime;
    return time === undefined ? Number.NaN : programDateTimeAt(hls, time);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

    this.setAttribute('aria-live', 'off');
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#listen(null);
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const media = this.#ownMedia ?? this.#media.value?.media;
    const hlsMedia = isHlsJsMedia(media) ? media : null;

    this.#engine.setMedia(hlsMedia);
    this.#listen(this.type === 'current' ? hlsMedia : null);

    const date = this.date;
    const available = !Number.isNaN(date);

    this.textContent = available ? this.#format(date) : '';
    this.toggleAttribute('data-unavailable', !available);
  }

  #format(date: number): string {
    const locale = this.closest('[lang]')?.getAttribute('lang') || undefined;
    const key = `${locale}|${this.timeZone}`;

    if (!this.#formatter || key !== this.#formatterKey) {
      this.#formatter = new Intl.DateTimeFormat(locale, { ...this.#formatOptions, timeZone: this.timeZone });
      this.#formatterKey = key;
    }

    return this.#formatter.format(date);
  }

  // `loadedmetadata` shows the time before playback starts, for when autoplay is blocked.
  #listen(media: HlsJsMedia | null): void {
    if (media === this.#listening) return;

    for (const type of ['loadedmetadata', 'timeupdate', 'seeked']) {
      this.#listening?.removeEventListener(type, this.#onTime);
      media?.addEventListener(type, this.#onTime);
    }
    this.#listening = media;
  }

  #onTime = (): void => {
    this.requestUpdate();
  };
}
