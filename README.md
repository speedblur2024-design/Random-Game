# Flappy Bird Remake

A faithful recreation of the hit game **Flappy Bird** built with HTML5 Canvas — no assets, no libraries.

## Play

Just open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

- `Space` / `↑` / `W` / Click / Tap — flap
- `P` — pause
- `R` — restart
- `Enter` — confirm

## Features

- Classic flap physics with tilt + wing animation
- Procedural pipes with shrinking gaps / increasing speed
- Canvas-drawn bird, parallax clouds, hills, scrolling ground
- Score + persistent best score (`localStorage`), medals (Bronze → Platinum)
- Menu / Get Ready / Game Over screens, particles, screen shake + hit flash
- WebAudio sound effects (flap, score, hit, die, swoosh) — no audio files needed
- Mobile-friendly: responsive canvas, touch controls
- Pause on `P` or tab-hide