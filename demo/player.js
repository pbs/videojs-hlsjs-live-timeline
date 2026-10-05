import { createPlayer, liveFeature, videoFeatures } from '@videojs/html';

// The video player's features, plus the live feature the Live button needs. Its own module, imported before the skin:
// the skin's elements look for their player as they connect.
const { PlayerElement } = createPlayer({ features: [...videoFeatures, liveFeature] });
customElements.define('dvr-player', PlayerElement);
