# Log Spiral Tools

Interactive web sketches that visualize logarithmic spirals and relate them to sound.  The project currently hosts two small p5.js applications that run entirely in the browser and require no build step or dependencies beyond a modern web browser.

## Live Demo
- [Open the published site](https://atrianglehead.github.io/log-spiral/)

## Applications
### Spiral Trace
A spiral visualizer that plots a logarithmic spiral and places markers at integer-multiple radii.  Each marker can trigger a short sine beep using the Web Audio API.

Key features:
- Adjustable number of rotations and base radius.
- Optional filtering so only multiples of *k* are shown or heard.
- Two marker reveal modes: show all from the start or reveal progressively as the spiral grows.
- Log‑scaled speed slider with on‑screen readout.
- Base pitch and master volume controls (beeps stop at 20 kHz).
- Play/pause button plus keyboard shortcuts: `Space` toggles play, `R` resets, `+`/`-` adjust speed, `{`/`}` change base radius, `M` toggles marker mode.
- Panel‑aware layout keeps the spiral from overlapping the control panel even when the window resizes.

### Harmonic Mixer
A 16‑partial harmonic mixing tool.  Each partial is visualized on the spiral and can be adjusted with its own slider.

Highlights:
- Fundamental plus 15 overtones with individual amplitude sliders.
- Mix mode: hear all active partials together.
- Sequence mode: step through partials one by one at a chosen tempo.
- Audition a single partial while adjusting its slider.
- Smooth gain transitions to avoid clicks.

## Getting Started
1. Clone this repository.
2. Open `index.html` in your browser or serve the folder with a local web server (e.g. `python -m http.server`).
3. Choose an application from the landing page.

No build process is required.  p5.js and other libraries are loaded from a CDN.  Audio starts only after the first user interaction to comply with browser autoplay policies.

## Repository Layout
```
index.html         – landing page linking to each tool
apps/spiral-trace/ – Spiral Trace application
apps/harmonic-mixer/ – Harmonic Mixer application
lib/               – shared ES modules (spiral math, panel fitting, audio helpers)
LICENSE            – project license (GPLv3)
```

## Contributing
Pull requests are welcome.  Please keep the project small and dependency‑free; each application should run by simply opening its `index.html` in a browser.

## License
This project is licensed under the [GNU General Public License v3](LICENSE).
