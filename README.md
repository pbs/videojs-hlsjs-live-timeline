# videojs-hlsjs-live-timeline

[![npm](https://img.shields.io/npm/v/videojs-hlsjs-live-timeline)](https://www.npmjs.com/package/videojs-hlsjs-live-timeline)

Chapters and clock time for live HLS in [Video.js v10](https://videojs.org), with
[hls.js](https://github.com/video-dev/hls.js):

- `<hlsjs-live-chapters>` keeps the time slider's chapters in step with a live stream, from the SCTE-35 breaks the
  playlist signals, a schedule in wall-clock time, or both.
- `<hlsjs-program-date-time>` shows the stream's `#EXT-X-PROGRAM-DATE-TIME` as a clock time, at the playback position or
  at the slider pointer.

Video.js draws chapters from a `<track kind="chapters">` on the media, which on-demand video knows up front.
`<hlsjs-live-chapters>` builds that track from wall-clock times, adding each chapter as the stream reaches it. React
components and hooks do the same in `@videojs/react`.

[Demo](https://pbs.github.io/videojs-hlsjs-live-timeline/), with the channel from Unified Streaming's
[Remix VOD2Live demo](https://demo.unified-streaming.com/k8s/vod2live/stable/).

## Install

```sh
npm install videojs-hlsjs-live-timeline @videojs/html @videojs/hlsjs-video
```

For React:

```sh
npm install videojs-hlsjs-live-timeline @videojs/react @videojs/hlsjs-video
```

`@videojs/hlsjs-video` brings its own hls.js, which these elements use; they don't need another. Tested with Video.js
10.0.1. The elements read the player's media and slider through contexts Video.js marks internal, so a Video.js release
can break them.

## Usage

### With a packaged skin

Put `<hlsjs-live-chapters>` next to the media. The skin's chapter sections and titles fill in.

```html
<video-player>
  <video-skin>
    <hlsjs-video src="https://example.com/live.m3u8" playsinline></hlsjs-video>
    <hlsjs-live-chapters ad-breaks></hlsjs-live-chapters>
  </video-skin>
</video-player>

<script type="module">
  import '@videojs/html/video/player';
  import '@videojs/html/video/skin';
  import '@videojs/html/media/hlsjs-video';
  import 'videojs-hlsjs-live-timeline';
</script>
```

This works in the video skins. The live-video skins have no time slider, and no packaged skin can show clock time in
place of its own times. For either, use the skin's source.

### With the skin's source

This is what the [demo](demo/index.html) does. Add the video skin's source to your project:

```sh
npx shadcn@latest add https://shadcn.videojs.org/r/html/video.json
```

Paste the markup from its `skin.html` inside the player, and change three things in it:

```diff
- <!-- Add a compatible media component here. -->
+ <hlsjs-video src="https://example.com/live.m3u8" playsinline></hlsjs-video>
+ <hlsjs-live-chapters ad-breaks></hlsjs-live-chapters>
  …
- <media-time class="media-time-value video-time-value" type="current"></media-time>
+ <hlsjs-program-date-time class="media-time-value video-time-value" type="current"></hlsjs-program-date-time>
  …
- <media-slider-value class="media-time-slider-value" type="pointer"></media-slider-value>
+ <hlsjs-program-date-time class="media-time-slider-value" type="pointer"></hlsjs-program-date-time>
```

Then import the package with the rest, in Video.js's order of player, skin, and media:

```js
import '@videojs/html/video/player';
import './components/videojs/video/skin';
import '@videojs/html/media/hlsjs-video';
import 'videojs-hlsjs-live-timeline';
```

The demo also replaces the preview's `<media-slider-thumbnail>` with
[`<hlsjs-iframe-slider-thumbnail>`](https://github.com/pbs/videojs-hlsjs-iframe-thumbnail), for frames from the stream's
I-frame playlists.

### A Live button

The video skin has none. Video.js's `<media-live-button>` needs the live feature, which `<video-player>` leaves out, so
create a player with it, in a module of its own:

```js
// player.js
import { createPlayer, liveFeature, videoFeatures } from '@videojs/html';

const { PlayerElement } = createPlayer({ features: [...videoFeatures, liveFeature] });
customElements.define('dvr-player', PlayerElement);
```

Import `./player.js` where `@videojs/html/video/player` was, before the skin, whose elements look for their player as
they connect. Use `<dvr-player>` in place of `<video-player>`, add `<media-live-button class="media-button media-live-button">` to
the time slider group, and import `@videojs/html/ui/live-button` in `skin.ts`. The video skin's stylesheet leaves out
the button's styles ([videojs/v10#2885](https://github.com/videojs/v10/issues/2885)); the demo's
[`live-button.css`](demo/videojs/video/live-button.css) copies them from the live-video skin.

### React

`@videojs/react` keeps the player's media in React context, which custom elements can't read, so import from
`videojs-hlsjs-live-timeline/react`:

```tsx
import '@videojs/react/video/skin.css';
import { VideoPlayer, VideoSkin } from '@videojs/react/video';
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video';
import { LiveChapters } from 'videojs-hlsjs-live-timeline/react';

export function Player() {
  return (
    <VideoPlayer>
      <VideoSkin>
        <HlsJsVideo src="https://example.com/live.m3u8" playsInline />
        <LiveChapters adBreaks />
      </VideoSkin>
    </VideoPlayer>
  );
}
```

For clock time, add the React skin's source:

```sh
npx shadcn@latest add https://shadcn.videojs.org/r/react/video.json
```

In `video/layout/controls.tsx`, the clock time takes the place of the current time:

```diff
+ import { ProgramDateTime } from 'videojs-hlsjs-live-timeline/react';
  …
- <Time.Value
+ <ProgramDateTime
    className={cn(…)}
-   type="current"
  />
```

In `ui/time-slider.tsx`, the pointer value gets a clock-time format:

```diff
+ import { useProgramDateTimeFormat } from 'videojs-hlsjs-live-timeline/react';
  …
  export function TimeSlider({ className, previewOverflow = 'visible', renderThumbnail, ...props }: TimeSliderProps = {}) {
+   const format = useProgramDateTimeFormat();
    …
-   <TimeSliderPrimitive.Value className={'tabular-nums'} type="pointer" />
+   <TimeSliderPrimitive.Value className={'tabular-nums'} type="pointer" format={format} />
```

### Chapters from a schedule

A schedule is a list of chapters in wall-clock time. Each `start` and `end` is an ISO 8601 string, a `Date`, or
milliseconds since the epoch; without an `end`, a chapter runs until the next one starts.

```html
<hlsjs-live-chapters src="/schedule.json"></hlsjs-live-chapters>
```

```json
[
  { "start": "2026-10-05T13:00:00Z", "title": "NOVA" },
  { "start": "2026-10-05T14:00:00Z", "end": "2026-10-05T14:30:00Z", "title": "Weather" }
]
```

`src` is fetched once. For listings that change, set `chapters` from code instead, as often as they do:

```js
document.querySelector('hlsjs-live-chapters').chapters = await fetchListings();
```

With `ad-breaks` as well, the stream's breaks cut into the schedule: a break in the middle of a program splits it in two.

### Seeking to a clock time

`mediaTimeAt` converts a wall-clock time to a time on the stream's timeline, and `programDateTimeAt` converts back:

```js
import { mediaTimeAt } from 'videojs-hlsjs-live-timeline';

const video = document.querySelector('hlsjs-video');
const time = mediaTimeAt(video.engine, new Date('2026-10-05T13:00:00Z'));
if (Number.isFinite(time)) video.currentTime = time;
```

## API

### `<hlsjs-live-chapters>`

| Member                  | Description                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ad-breaks`, `adBreaks` | Add the SCTE-35 breaks the playlist signals with `#EXT-X-DATERANGE` as chapters.                                  |
| `ad-break-title`        | Title of the break chapters. Defaults to `Ad break`.                                                              |
| `src`                   | URL of a JSON schedule, fetched once.                                                                             |
| `chapters`              | A schedule set from code: `{ start, end?, title }[]`. Takes the place of `src` while set; `null` goes back to it. |
| `label`                 | Label of the chapters track it creates. Defaults to `Chapters`.                                                   |
| `media`                 | Media to follow in place of the player's. `null` goes back to the player's.                                       |
| `track` (read-only)     | The `kind="chapters"` text track it keeps, or `null` before it has media.                                         |
| `chapters-change` event | The cues on `track` changed.                                                                                      |

A chapter appears once the stream reaches its start. One still running, such as the program on now or a break the
stream has not closed, runs to the live edge. Video.js reads the first chapters track on the media, so use one
`<hlsjs-live-chapters>` per player and no other chapters track.

### `<hlsjs-program-date-time>`

| Member                  | Description                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                  | `current` (the default) for the playback position, `pointer` for the time slider pointer.                                                                                                              |
| `time-zone`, `timeZone` | IANA time zone, such as `America/New_York`. Defaults to the viewer's.                                                                                                                                  |
| `formatOptions`         | [`Intl.DateTimeFormat` options](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat#options). Defaults to hours, minutes, and seconds. |
| `media`                 | Media to follow in place of the player's. `null` goes back to the player's.                                                                                                                            |
| `date` (read-only)      | The clock time shown, in milliseconds since the epoch, or `NaN`.                                                                                                                                       |
| `data-unavailable`      | Set while there is no time to show: before the first playlist, or when the stream has no PDT.                                                                                                          |

It formats in the language of the nearest `lang` attribute, or the browser's.

### React

From `videojs-hlsjs-live-timeline/react`, inside a `@videojs/react` player:

| Export                               | Description                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `<LiveChapters>`                     | Props: `src`, `chapters`, `adBreaks`, `adBreakTitle`, `label`, and `onChaptersChange(track)`. Renders nothing.      |
| `useLiveChapters(props)`             | `<LiveChapters>` as a hook. Returns the chapters track, or `null` before there is media.                            |
| `<ProgramDateTime>`                  | A `<time>` with the clock time at the playback position. Props: `timeZone`, `formatOptions`, and those of `<time>`. |
| `useProgramDateTime()`               | The clock time at the playback position, in milliseconds since the epoch, or `NaN`.                                 |
| `useProgramDateTimeFormat(options?)` | `(time) => string`, the clock time at a stream time, for a `format` prop. Options: `timeZone`, `formatOptions`.     |

They format in the player's locale, and export the functions below as well.

### Functions

| Function                       | Description                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `programDateTimeAt(hls, time)` | Wall-clock time, in milliseconds since the epoch, at `time` seconds on the stream's timeline. |
| `mediaTimeAt(hls, date)`       | Time in seconds on the stream's timeline at `date`, a `Date` or milliseconds since the epoch. |

`hls` is the media's `engine`. Both read the latest playlist it loaded, and return `NaN` without an engine or playlist,
or when the stream has no PDT. Times outside the playlist extrapolate from its first or last segment.

## Streams

- **Clock time** needs `#EXT-X-PROGRAM-DATE-TIME`. hls.js fills in segments between tags, so one per discontinuity is
  enough.
- **Ad breaks** are `#EXT-X-DATERANGE` tags with `SCTE35-OUT`, the HLS specification's mapping of SCTE-35. hls.js
  merges the tags that share an ID, so a break closed by a later tag with `SCTE35-IN`, `END-DATE`, or `DURATION` gets its
  end; one with only `PLANNED-DURATION` runs for that long. `#EXT-X-CUE-OUT` and `#EXT-X-CUE-IN` are not read.
- **Native playback.** Where hls.js can't run and `<hlsjs-video>` falls back to the browser's own HLS, as on iPhones
  before iOS 17.1, there is no hls.js engine, and neither element shows anything.
- **DVR windows.** In a window that slides, chapters that have scrolled out are dropped. Video.js's time slider runs
  from zero to the end of the stream, though, so it keeps showing the part that has scrolled out of reach. A window that
  grows from a fixed start avoids that: MediaPackage's `start` parameter, or Unified Origin's `vbegin` with a `vend` far
  off.

## Development

```sh
npm install
npm run dev        # the demo at http://localhost:5175
npm test           # unit tests (Vitest, happy-dom)
npm run test:e2e   # Playwright against the demo's production build, streaming Unified Streaming's channel
npm run lint       # oxlint and oxfmt --check
npm run build      # dist/
```

The demo is bundled from `src/` by Vite, and the end-to-end tests run against it.

## License

[MIT](./LICENSE) © PBS
