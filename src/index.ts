import { HlsJsLiveChaptersElement } from './live-chapters';
import { HlsJsProgramDateTimeElement } from './program-date-time';

export type { ChapterInput, ClockTime } from './chapters';
export type { HlsJsMedia } from './engine';
export { mediaTimeAt, programDateTimeAt } from './clock-time';
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
