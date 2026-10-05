import { useLocale, useMedia } from '@videojs/react';
import {
  createElement,
  type HTMLAttributes,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { programDateTimeAt } from '../clock-time';
import { HlsJsEngineController, type HlsJsMedia, isHlsJsMedia } from '../engine';
import { DEFAULT_FORMAT } from '../format';
import { type LiveChaptersOptions, LiveChaptersTrack } from '../live-chapters-track';

export type { ChapterInput, ClockTime } from '../chapters';
export { mediaTimeAt, programDateTimeAt } from '../clock-time';
export type { LiveChaptersOptions } from '../live-chapters-track';

/** The player's media, when hls.js plays it, as with `<HlsJsVideo>`. */
function useHlsJsMedia(): HlsJsMedia | null {
  const media: unknown = useMedia();
  return isHlsJsMedia(media) ? media : null;
}

export interface LiveChaptersProps extends LiveChaptersOptions {
  /** The cues on the chapters track changed. */
  onChaptersChange?: ((track: TextTrack) => void) | undefined;
}

/**
 * Keeps a chapters track on the player's media in step with the live stream, so the skin's chapter sections and titles
 * work for live content. Returns the track, or `null` until there is media.
 */
export function useLiveChapters({
  src,
  chapters,
  adBreaks,
  adBreakTitle,
  label,
  onChaptersChange,
}: LiveChaptersProps): TextTrack | null {
  const media = useHlsJsMedia();
  // A new object for each change of cues, so the same track still renders again.
  const [change, setChange] = useState<{ track: TextTrack | null } | null>(null);

  const [live] = useState(() => {
    const instance: LiveChaptersTrack = new LiveChaptersTrack(() => setChange({ track: instance.track }));
    return instance;
  });

  // Each change once, though a callback passed inline is a new function on every render.
  const announced = useRef(change);
  useEffect(() => {
    if (!change || change === announced.current) return;
    announced.current = change;
    if (change.track) onChaptersChange?.(change.track);
  }, [change, onChaptersChange]);

  useEffect(() => {
    live.setMedia(media);
    live.setOptions({ src, chapters, adBreaks, adBreakTitle, label });
  }, [live, media, src, chapters, adBreaks, adBreakTitle, label]);

  useEffect(() => () => live.clear(), [live]);

  return change?.track ?? null;
}

/** `useLiveChapters` as a component, rendering nothing. Put it inside the player, next to the media. */
export function LiveChapters(props: LiveChaptersProps): null {
  useLiveChapters(props);
  return null;
}

export interface ProgramDateTimeFormatOptions {
  /** IANA time zone, such as `America/New_York`. Defaults to the viewer's. */
  timeZone?: string | undefined;
  /** `Intl.DateTimeFormat` options. Defaults to hours, minutes, and seconds. */
  formatOptions?: Intl.DateTimeFormatOptions | undefined;
}

function useFormatter({ timeZone, formatOptions }: ProgramDateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = useLocale();
  // Options passed inline are a new object on every render.
  const options = JSON.stringify(formatOptions ?? DEFAULT_FORMAT);
  return useMemo(
    () => new Intl.DateTimeFormat(locale, { ...(JSON.parse(options) as Intl.DateTimeFormatOptions), timeZone }),
    [locale, options, timeZone]
  );
}

/**
 * The clock time at the playback position, in milliseconds since the epoch, kept current as the stream plays. `NaN`
 * until the stream reports a `#EXT-X-PROGRAM-DATE-TIME`.
 */
export function useProgramDateTime(): number {
  const media = useHlsJsMedia();
  const [date, setDate] = useState(Number.NaN);

  useEffect(() => {
    const update = () => {
      const hls = media?.engine;
      setDate(hls && media ? programDateTimeAt(hls, media.currentTime) : Number.NaN);
    };

    // A new engine or playlist can bring the first PDT before the next time event.
    const engine = new HlsJsEngineController(null, update);
    engine.setMedia(media);

    // `loadedmetadata` shows the time before playback starts, for when autoplay is blocked.
    const types = ['loadedmetadata', 'timeupdate', 'seeked'];
    for (const type of types) media?.addEventListener(type, update);
    update();

    return () => {
      for (const type of types) media?.removeEventListener(type, update);
      engine.setMedia(null);
    };
  }, [media]);

  return date;
}

/**
 * A function from a time on the stream's timeline to its clock time, as text: empty without a PDT. Pass it to the
 * `format` of Video.js's `<TimeSlider.Value type="pointer">` for the clock time at the pointer.
 */
export function useProgramDateTimeFormat(options: ProgramDateTimeFormatOptions = {}): (time: number) => string {
  const media = useHlsJsMedia();
  const formatter = useFormatter(options);

  return useCallback(
    (time: number) => {
      const hls = media?.engine;
      const date = hls ? programDateTimeAt(hls, time) : Number.NaN;
      return Number.isNaN(date) ? '' : formatter.format(date);
    },
    [media, formatter]
  );
}

export interface ProgramDateTimeProps
  extends ProgramDateTimeFormatOptions, Omit<HTMLAttributes<HTMLTimeElement>, 'children'> {}

/**
 * The clock time at the playback position, from the stream's `#EXT-X-PROGRAM-DATE-TIME`. Empty, with
 * `data-unavailable`, until the stream reports one.
 */
export function ProgramDateTime({ timeZone, formatOptions, ...props }: ProgramDateTimeProps): ReactElement {
  const date = useProgramDateTime();
  const formatter = useFormatter({ timeZone, formatOptions });
  const available = !Number.isNaN(date);

  return createElement(
    'time',
    {
      'aria-live': 'off',
      'data-unavailable': available ? undefined : '',
      dateTime: available ? new Date(date).toISOString() : undefined,
      ...props,
    },
    available ? formatter.format(date) : ''
  );
}
