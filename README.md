# Log Spiral Tools

Log Spiral Tools is a collection of tiny, dependency‑free web sketches
that connect the geometry of the logarithmic spiral with sound.  Each
application runs entirely in the browser; simply open the HTML file and
start experimenting.

## Try it now

Visit the [main page](https://atrianglehead.github.io/log-spiral/) to
launch any of the sketches instantly.

## Quick start

1. Clone this repository.
2. Open `index.html` in your browser, or serve the folder locally with
   a simple HTTP server such as `python -m http.server`.
3. Choose an application from the landing page.

No build process is required; libraries are loaded from CDNs and audio
only begins after the first user interaction to satisfy autoplay
policies.

## Applications

### Pitch Spiral
Arrange pitches around a spiral and audition them in sequence.

* Toggle an **f₀ drone** for reference with a single button.
* Add, drag and fine‑tune additional pitches.
* Master volume control and sequential playback.

### Spiral Trace
Plot a logarithmic spiral and trigger a short sine beep when the spiral
passes marked radii.

* Adjustable rotations and base radius.
* Filter markers to only show multiples of *k*.
* Base pitch and master volume controls.

### Pitch Harmonic Mixer
Visualise and mix the first sixteen harmonics of a fundamental pitch.

* Individual amplitude sliders for each partial.
* Mix mode or step‑through sequence mode.
* Audition a single partial while adjusting its slider.

### Tempo Harmonic Mixer
Build polyrhythms from tempo harmonics of a fundamental beat.

* Individual volume sliders for each tempo.
* Mix (polyrhythm) mode or step‑through sequence mode with adjustable beat count.
* Fundamental tempo control between 20–40 BPM.

## Repository layout

```
index.html                 – landing page linking to each tool
apps/spiral-trace/         – Spiral Trace application
apps/pitch-harmonic-mixer/ – Pitch Harmonic Mixer application
apps/tempo-harmonic-mixer/ – Tempo Harmonic Mixer application
apps/pitch-spiral/         – Pitch Spiral application
lib/                 – shared ES modules (spiral math, panel fitting, audio helpers)
LICENSE              – project license (GPLv3)
```

## Contributing

Pull requests are welcome.  Please keep the project small and
dependency‑free; each application should run by simply opening its
`index.html` in a browser.

## License

This project is licensed under the
[GNU General Public License v3](LICENSE).

