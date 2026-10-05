import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { HlsJsProgramDateTimeElement } from '../index';
import { FakeMedia, mount } from './fakes';

// Formats depend on the locale, so fix the one the elements find.
beforeAll(() => {
  document.documentElement.lang = 'en-US';
});

afterEach(() => {
  document.body.replaceChildren();
});

async function clock(setup: (element: HlsJsProgramDateTimeElement) => void = () => {}) {
  const element = new HlsJsProgramDateTimeElement();
  element.timeZone = 'UTC';
  setup(element);
  return mount(element);
}

describe('HlsJsProgramDateTimeElement', () => {
  it('is empty and marked unavailable until the stream has PDT', async () => {
    const { element } = await clock();

    expect(element.textContent).toBe('');
    expect(element.hasAttribute('data-unavailable')).toBe(true);
    expect(element.getAttribute('aria-live')).toBe('off');
  });

  it('shows the clock time at the playback position, in its time zone', async () => {
    const { element, hls, media } = await clock();
    hls.load(30);
    media.currentTime = 65;
    media.dispatchEvent(new Event('timeupdate'));
    await element.updateComplete;

    expect(element.textContent).toBe('12:01:05 PM');
    expect(element.hasAttribute('data-unavailable')).toBe(false);
    expect(element.date).toBe(Date.UTC(2026, 9, 5, 12, 1, 5));
  });

  it('appears as soon as the first playlist loads, before any playback', async () => {
    const { element, hls } = await clock();
    hls.load(30);
    await element.updateComplete;

    expect(element.textContent).toBe('12:00:00 PM');
  });

  it('follows the slider pointer with type="pointer"', async () => {
    const { element, hls, point } = await clock((el) => (el.type = 'pointer'));
    hls.load(30);
    await point(90);

    expect(element.textContent).toBe('12:01:30 PM');
  });

  it('formats with formatOptions and the nearest lang', async () => {
    const { element, hls } = await clock((el) => {
      el.formatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    });
    element.parentElement!.setAttribute('lang', 'de');
    hls.load(30);
    await element.updateComplete;

    expect(element.textContent).toBe('12:00');
  });

  it('follows media set on it, with or without a player', async () => {
    const own = new FakeMedia();
    const { element, media } = await clock((el) => (el.media = own as never));
    own.engine!.load(30);
    own.currentTime = 10;
    own.dispatchEvent(new Event('timeupdate'));
    await element.updateComplete;
    expect(element.textContent).toBe('12:00:10 PM');

    // `null` goes back to the player's.
    element.media = null;
    media.engine!.load(30);
    await element.updateComplete;
    expect(element.media).toBe(media);
    expect(element.textContent).toBe('12:00:00 PM');

    const alone = new HlsJsProgramDateTimeElement();
    alone.timeZone = 'UTC';
    alone.media = own as never;
    document.body.append(alone);
    await alone.updateComplete;
    expect(alone.textContent).toBe('12:00:10 PM');
  });

  it('is unavailable without an hls.js engine', async () => {
    const { element } = await mount(new HlsJsProgramDateTimeElement(), new FakeMedia(null));

    expect(element.hasAttribute('data-unavailable')).toBe(true);
  });
});
