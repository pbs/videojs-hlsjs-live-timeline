import { HlsJsLiveChaptersElement } from './live-chapters.js';
import { HlsJsProgramDateTimeElement } from './program-date-time.js';

export type { ChapterInput, ClockTime } from './chapters.js';
export type { HlsJsMedia } from './engine.js';
export { mediaTimeAt, programDateTimeAt } from './clock-time.js';
export { HlsJsLiveChaptersElement, HlsJsProgramDateTimeElement };

for (const element of [HlsJsProgramDateTimeElement, HlsJsLiveChaptersElement]) {
  if (!customElements.get(element.tagName)) customElements.define(element.tagName, element);
}

declare global {
  interface HTMLElementTagNameMap {
    [HlsJsProgramDateTimeElement.tagName]: HlsJsProgramDateTimeElement;
    [HlsJsLiveChaptersElement.tagName]: HlsJsLiveChaptersElement;
  }
}
