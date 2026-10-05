import { expect, type Page, test } from '@playwright/test';

// The demo plays Unified Streaming's vod2live channel, with its 30-minute DVR window, so these need network access.

type Hls = { playingDate: Date | null };
type Media = HTMLElement & { engine: Hls | null; currentTime: number; textTracks: TextTrackList };
type Chapters = HTMLElement & { track: TextTrack | null };
type Clock = HTMLElement & { date: number };

async function waitForPlayback(page: Page) {
  await page.waitForFunction(() => ((document.getElementById('video') as Media | null)?.currentTime ?? 0) > 1, null, {
    timeout: 60_000,
  });
}

const cueTexts = (page: Page) =>
  page.evaluate(() =>
    [...((document.getElementById('chapters') as Chapters).track?.cues ?? [])].map((cue) => (cue as VTTCue).text)
  );

test('SCTE-35 breaks and the programs between them become chapters', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => cueTexts(page).then((texts) => texts.length), { timeout: 60_000 }).toBeGreaterThan(2);

  const texts = await cueTexts(page);
  expect(texts).toContain('Ad break');
  // Programs are titled from the playout list once the breaks line up with its ads, without the presenters' names.
  await expect
    .poll(() => cueTexts(page).then((all) => all.filter((text) => text !== 'Ad break').length))
    .toBeGreaterThan(1);
  expect((await cueTexts(page)).join(' ')).not.toMatch(/\b(Boy|Doug|Jamie|Linzi|Pepijn|Rochelle|Simon)\b/);

  // The skin's chapter sections read the same track.
  await expect.poll(() => page.locator('.media-time-slider-chapter').count()).toBeGreaterThanOrEqual(texts.length);
});

test('the clock shows the clock time of the playback position', async ({ page }) => {
  await page.goto('/');
  await waitForPlayback(page);
  await page.waitForTimeout(1_000);

  const { shown, playing } = await page.evaluate(() => ({
    shown: (document.getElementById('clock') as Clock).date,
    playing: (document.getElementById('video') as Media).engine!.playingDate!.getTime(),
  }));
  expect(Math.abs(shown - playing)).toBeLessThan(1_000);
  await expect(page.locator('#clock')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  await expect(page.locator('media-time[type="current"]')).toHaveCount(0);
});

test('the preview shows an I-frame, the chapter title and its clock time', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => cueTexts(page).then((texts) => texts.length), { timeout: 60_000 }).toBeGreaterThan(2);
  await waitForPlayback(page);

  await page.locator('dvr-player media-container').first().hover();
  const box = (await page.locator('media-time-slider').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 4 });

  const preview = page.locator('media-slider-preview');
  await expect(preview.locator('media-time-slider-chapter-title')).not.toBeEmpty();
  await expect(preview.locator('hlsjs-program-date-time')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  await expect
    .poll(() =>
      page.evaluate(() => (document.getElementById('thumbnail') as HTMLElement & { frameTime: number }).frameTime)
    )
    .not.toBeNaN();
});

test('the filtered manifest leaves out the subtitles', async ({ page }) => {
  await page.goto('/');
  await waitForPlayback(page);

  const kinds = await page.evaluate(() =>
    [...(document.getElementById('video') as Media).textTracks].map((t) => t.kind)
  );
  expect(kinds).not.toContain('subtitles');
  await expect(page.locator('media-captions-button')).toBeHidden();
});
