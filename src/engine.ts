import type Hls from 'hls.js';

/** Media backed by an hls.js engine, such as `<hlsjs-video>`. */
export interface HlsJsMedia extends EventTarget {
  readonly engine: Hls | null;
  readonly currentTime: number;
  readonly textTracks: TextTrackList;
  addTextTrack(kind: TextTrackKind, label?: string, language?: string): TextTrack;
}

export function isHlsJsMedia(media: unknown): media is HlsJsMedia {
  return typeof media === 'object' && media !== null && 'engine' in media && 'addEventListener' in media;
}

/**
 * The hls.js class behind an instance. Read off the instance rather than imported, so events come from the same hls.js
 * copy as the player's and nothing here depends on hls.js at runtime.
 */
export function hlsStatics(instance: Hls): typeof Hls {
  return instance.constructor as typeof Hls;
}

/** Why the engine controller asked its host to update. */
export type EngineChange =
  /** A different engine, or none. Its `latestLevelDetails`, if any, describe its current stream. */
  | 'engine'
  /** A new manifest on the same engine. Until its first playlist loads, `latestLevelDetails` describe the old one. */
  | 'manifest'
  /** A playlist load: the same timeline, with more of it known. */
  | 'playlist';

/**
 * Follows the hls.js engine of a media element. `<hlsjs-video>` builds a new engine for some source changes and keeps
 * the engine for others, loading a new manifest on it, so the controller listens for both. With a host, it lets go when
 * the host disconnects; without one, `setMedia(null)` does.
 */
/**
 * What the controller needs of a host, such as a Video.js element: kept here rather than imported, so the React entry's
 * types don't reach for `@videojs/element`.
 */
interface ControllerHost {
  addController(controller: { hostDisconnected(): void }): void;
}

export class HlsJsEngineController {
  readonly #onChange: (change: EngineChange) => void;

  #media: HlsJsMedia | null = null;
  #hls: Hls | null = null;

  constructor(host: ControllerHost | null, onChange: (change: EngineChange) => void) {
    this.#onChange = onChange;
    host?.addController(this);
  }

  get media(): HlsJsMedia | null {
    return this.#media;
  }

  get engine(): Hls | null {
    return this.#hls;
  }

  /** Follow this media's engine, or `null` to stop listening. */
  setMedia(media: HlsJsMedia | null): void {
    if (media === this.#media) return;

    this.#media?.removeEventListener('loadstart', this.#onLoadStart);
    this.#media = media;
    // `<hlsjs-video>` dispatches `loadstart` after building a new engine and before it loads the source.
    media?.addEventListener('loadstart', this.#onLoadStart);
    this.#setHls(media?.engine ?? null);
  }

  hostDisconnected(): void {
    this.setMedia(null);
  }

  #setHls(hls: Hls | null): void {
    if (hls === this.#hls) return;

    if (this.#hls) {
      const { Events } = hlsStatics(this.#hls);
      this.#hls.off(Events.MANIFEST_LOADING, this.#onManifestLoading);
      this.#hls.off(Events.LEVEL_UPDATED, this.#onLevelUpdated);
      this.#hls.off(Events.DESTROYING, this.#onDestroying);
    }

    this.#hls = hls;

    if (hls) {
      const { Events } = hlsStatics(hls);
      hls.on(Events.MANIFEST_LOADING, this.#onManifestLoading);
      hls.on(Events.LEVEL_UPDATED, this.#onLevelUpdated);
      hls.on(Events.DESTROYING, this.#onDestroying);
    }

    this.#onChange('engine');
  }

  #onLoadStart = (): void => {
    this.#setHls(this.#media?.engine ?? null);
  };

  #onManifestLoading = (): void => {
    this.#onChange('manifest');
  };

  #onLevelUpdated = (): void => {
    this.#onChange('playlist');
  };

  #onDestroying = (): void => {
    this.#setHls(null);
  };
}
