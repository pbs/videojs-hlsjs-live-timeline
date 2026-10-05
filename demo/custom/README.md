# Custom skin

Another take on the demo's player, kept for reference. It starts from the same video skin source and moves the chapter
title and clock time into a box below the thumbnail, puts the clock after the Live button, and drops the remaining time,
the settings menu, cast, AirPlay, and picture-in-picture.

To try it, replace what's inside `<dvr-player>` in `demo/index.html` with `skin.html`, and import `./custom/skin` in
`demo/index.js` in place of `./videojs/video/skin`.
