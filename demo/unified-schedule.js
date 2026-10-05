// FRAGILE: guesswork for this demo's one stream, not part of videojs-hlsjs-live-timeline.
//
// Unified Streaming's vod2live demo channel publishes no schedule, so this works out its program titles from how the
// channel happens to be built today. None of it is documented, and any of it can change without notice:
//
// - The channel plays the clips of `smils/unified-learning.smil` in a loop, and the clips' file names are the only
//   titles there are. They carry the presenters' names, which the list below strips.
// - The stream signals every ad as a closed SCTE-35 break, and each ad clip runs the same length every time, so the
//   lengths of the breaks say where in the loop they are.
// - The half hour the stream keeps holds too few breaks to tell, so two hours more are fetched once, through Unified
//   Origin's `vbegin` and `vend` on the audio rendition's playlist, by the name it has now.
//
// When any of that changes, the programs lose their titles and the chapters fall back to the ad breaks alone. A real
// channel has a schedule to read instead: give `<hlsjs-live-chapters>` its URL in `src`, or set `chapters` from code.

const SMIL = 'smils/unified-learning.smil';
const AUDIO_PLAYLIST = 'unified-learning.isml/unified-learning-audio_eng=128000.m3u8';
const PRESENTERS = new Set(['boy', 'doug', 'jamie', 'linzi', 'pepijn', 'rochelle', 'simon']);
const MINOR_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'is', 'of', 'on', 'the', 'to']);

/** A time as Unified Origin's `vbegin` and `vend` take it. */
const iso = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * Starts loading what the guess needs from `channel`, and returns a function that turns a media playlist's date ranges
 * into the titled programs between its breaks, for `<hlsjs-live-chapters>`'s `chapters`: `[]` when the guess fails.
 */
export function createUnifiedSchedule(channel) {
  const now = Date.now();

  const loaded = Promise.all([
    loadPlayout(`${channel}/${SMIL}`),
    loadBreaks(`${channel}/${AUDIO_PLAYLIST}?vbegin=${iso(now - 2 * 3600_000)}&vend=${iso(now)}`),
  ]).catch((error) => {
    console.warn('The Unified demo schedule is unavailable, so the programs go untitled.', error);
    return null;
  });

  return async (dateRanges) => {
    const result = await loaded;
    if (!result) return [];

    const [ads, history] = result;
    return programChapters(mergeBreaks(history, liveBreaks(dateRanges)), ads);
  };
}

/** Clip names like `StorageProxy_Doug-dref.mp4` read as `Storage Proxy`. */
function titleOf(src) {
  return src
    .split('/')
    .pop()
    .replace(/(-ad)?-dref\.mp4$/, '')
    .split('_')
    .filter((word) => !/^v\d+$/i.test(word) && !PRESENTERS.has(word.toLowerCase()))
    .flatMap((word) => word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' '))
    .map((word, i) => (i > 0 && MINOR_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** The ads in playout order, each with the title of the program that follows it. */
async function loadPlayout(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

  const smil = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const clips = [...smil.querySelectorAll('par')].map((par) => {
    const src = par.querySelector('video').getAttribute('src');
    return {
      title: titleOf(src),
      // Ad clips carry a splice out of the network. Short clips named `-ad` that splice back in are bumpers.
      ad: par.querySelector('SpliceInsert')?.getAttribute('outOfNetworkIndicator') === '1',
      bumper: src.endsWith('-ad-dref.mp4'),
    };
  });

  const ads = [];
  clips.forEach((clip, i) => {
    if (!clip.ad) return;

    const program = [];
    for (let j = 1; j < clips.length && !clips[(i + j) % clips.length].ad; j++) {
      program.push(clips[(i + j) % clips.length]);
    }

    const shows = program.filter((p) => !p.bumper);
    ads.push({ title: clip.title, next: (shows.length ? shows : program).map((p) => p.title).join(' / ') });
  });

  return ads;
}

/** The closed SCTE-35 breaks among a media playlist's `#EXT-X-DATERANGE` tags, as `{ start, end }` in milliseconds. */
async function loadBreaks(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

  // A break's tags share an ID: one opens it with SCTE35-OUT, and a later one closes it with its end.
  const ranges = new Map();
  for (const line of (await response.text()).split('\n')) {
    if (!line.startsWith('#EXT-X-DATERANGE:')) continue;

    const attributes = Object.fromEntries(
      [...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(([, name, value]) => [name, value.replace(/^"|"$/g, '')])
    );
    ranges.set(attributes.ID, { ...ranges.get(attributes.ID), ...attributes });
  }

  return [...ranges.values()]
    .filter((range) => 'SCTE35-OUT' in range && (range['END-DATE'] || range.DURATION))
    .map((range) => {
      const start = Date.parse(range['START-DATE']);
      return { start, end: range['END-DATE'] ? Date.parse(range['END-DATE']) : start + Number(range.DURATION) * 1000 };
    });
}

/** The same, from the date ranges hls.js parsed out of the playlist it is playing. */
function liveBreaks(dateRanges) {
  return Object.values(dateRanges)
    .filter((range) => range && 'SCTE35-OUT' in range.attr && range.endDate)
    .map((range) => ({ start: range.startDate.getTime(), end: range.endDate.getTime() }));
}

/** Two lists of breaks as one, in order, with the breaks they share once. */
function mergeBreaks(a, b) {
  const breaks = [...a, ...b].toSorted((x, y) => x.start - y.start);
  return breaks.filter((cut, i) => i === 0 || cut.start - breaks[i - 1].start > 1000);
}

/**
 * Lines `breaks` (closed SCTE-35 breaks in playout order, `{ start, end }` in milliseconds) up with the playout's ads:
 * the offset into the loop at which every ad clip that repeats lasts the same each time. `-1` when none, or more than
 * one, fits.
 */
function alignBreaks(breaks, ads) {
  const fits = [];

  for (let offset = 0; offset < ads.length; offset++) {
    const lengths = new Map();
    const consistent = breaks.every((b, i) => {
      const { title } = ads[(offset + i) % ads.length];
      const length = (b.end - b.start) / 1000;
      if (!lengths.has(title)) lengths.set(title, length);
      return Math.abs(lengths.get(title) - length) < 0.5;
    });
    if (consistent) fits.push(offset);
  }

  return fits.length === 1 ? fits[0] : -1;
}

/** Programs between the breaks, titled from the playout, as chapters in wall-clock time. */
function programChapters(breaks, ads) {
  const offset = alignBreaks(breaks, ads);
  if (offset < 0 || breaks.length === 0) return [];

  const ad = (i) => ads[(((offset + i) % ads.length) + ads.length) % ads.length];
  const chapters = [{ start: 0, end: breaks[0].start, title: ad(-1).next }];

  breaks.forEach((b, i) => {
    chapters.push({ start: b.end, end: breaks[i + 1]?.start ?? null, title: ad(i).next });
  });

  return chapters;
}
