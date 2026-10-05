// What any page with this player needs, in Video.js's order: player, skin, media. Then the two packages.
import './player.js';
import './videojs/video/skin';
import '@videojs/html/media/hlsjs-video';
import 'videojs-hlsjs-iframe-thumbnail';
import 'videojs-hlsjs-live-timeline';

// The rest is this demo's own: Unified Streaming's channel, and titles for its programs.
import Hls from 'hls.js';

import { createUnifiedSchedule } from './unified-schedule.js';

const CHANNEL = 'https://demo.unified-streaming.com/k8s/vod2live/stable';
const STREAM = `${CHANNEL}/unified-learning.isml`;

// Program titles for this one channel, which publishes no schedule. FRAGILE: see unified-schedule.js.
const schedule = createUnifiedSchedule(CHANNEL);

const video = document.querySelector('hlsjs-video');
const chapters = document.querySelector('hlsjs-live-chapters');

document.getElementById('hls-version').textContent = Hls.version;

// Each playlist reload can bring a new break, and with it the end of a program.
let engine = null;
video.addEventListener('loadstart', () => {
  if (video.engine === engine) return;
  engine = video.engine;
  engine?.on(Hls.Events.LEVEL_UPDATED, async (_event, { details }) => {
    chapters.chapters = await schedule(details.dateRanges);
  });
});

// The default half hour behind live. `filter` is Unified Origin's dynamic track selection, here leaving the channel's
// subtitles out of the manifest.
video.src = `${STREAM}/.m3u8?filter=${encodeURIComponent('(type!="textstream")')}`;
