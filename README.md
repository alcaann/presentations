# presentations

Zooming presentations, served by GitHub Pages at
<https://alcaann.github.io/presentations/>.

Each presentation is one folder named after the course, containing a
self-contained `index.html` — inline SVG plus a small viewer that tweens the
SVG `viewBox` between camera frames. No build step, no dependencies, no network
at runtime.

| Folder | Course | Presentation |
|---|---|---|
| `tdt03-facenet/` | TDT03 — Advanced Topics in Visual Computing | FaceNet inference pipeline |
| `tdt16/` | TDT16 — XR | Gaussian's Anatomy: 3D Gaussian Splatting for Cinematic Anatomy (slides, speaker notes, headset demo video; `P` opens the presenter view) |

## Adding one

1. Make a folder named after the course.
2. Put the built page in it as `index.html`.
3. Add a card to the root `index.html`.
4. Commit and push — Pages redeploys in about a minute.

`.nojekyll` at the root disables Jekyll, which would otherwise ignore any file
or folder whose name starts with `_`.

## Where these come from

Built from hand-drawn GoodNotes canvases. The generator and the full workflow —
export settings that preserve vector ink, camera-frame rectangles, the checks
that catch a rasterized export — live in the `thesis-prep` repo under
`theory_modules/<course>/presentation/`.

Sources for each presentation (`canvas.svg`, `canvas.pdf`) sit next to its
`index.html` so the page can be rebuilt from what is here.

`tdt16/` is a slide deck instead: one image per slide plus its speaker notes and
video, exported from the deck in `theory_modules/xr_TDT16/presentation/` by
`tools/deploy.sh` (`tools/export-pages.mjs`). Its presenter view (`P`) shows the
notes, the next slide and a timer, and opens a synced audience window for the projector.

## Presenting

Use the local file, not this URL. The pages are self-contained precisely so a
presentation never depends on venue wifi. This site is for sharing afterwards.
