// =============================================================================
// Heatmap drawing — pure canvas code, no React.
//
// Heat: every click adds a soft Gaussian "splat" to a coarse grid (a few CSS
// pixels per cell, so even a 15 000 px tall page stays a small canvas); the
// grid is normalised to its hottest cell and coloured blue → green → yellow →
// red. A square-root curve keeps single clicks visible next to hot spots.
// Dots: one small dot per click (red for rage, grey ring for dead).
// Scroll: horizontal bands coloured by how many visitors scrolled that far.
// =============================================================================

export interface Pt { x: number; y: number; rage?: boolean; dead?: boolean; hot?: boolean }

/** Keep canvases well inside every browser's size limit (iOS: ~16 M pixels). */
const MAX_PIXELS = 4_000_000;

/** blue → cyan → green → yellow → red, as 256 RGB triples. */
const PALETTE: Uint8ClampedArray = (() => {
  const stops: [number, [number, number, number]][] = [
    [0, [40, 70, 255]],
    [0.25, [0, 200, 255]],
    [0.5, [40, 220, 90]],
    [0.75, [255, 225, 40]],
    [1, [255, 45, 35]],
  ];
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k += 1;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = (t - t0) / (t1 - t0 || 1);
    for (let j = 0; j < 3; j += 1) out[i * 3 + j] = Math.round(c0[j] + (c1[j] - c0[j]) * f);
  }
  return out;
})();

/** CSS colour for a 0–1 value on the heat scale (legends, scroll bands). */
export function heatColor(v: number, alpha = 1): string {
  const i = Math.max(0, Math.min(255, Math.round(v * 255))) * 3;
  return `rgba(${PALETTE[i]},${PALETTE[i + 1]},${PALETTE[i + 2]},${alpha})`;
}

/** Size a canvas to cover width × height CSS px at a resolution it can afford. */
function prepare(canvas: HTMLCanvasElement, width: number, height: number, density: number) {
  const scale = Math.min(density, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, w, h);
  return { ctx, scale, w, h };
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw a heatmap of `points` (CSS px) over a width × height area.
 * `radius` is the splat radius in CSS px.
 */
export function drawHeat(canvas: HTMLCanvasElement, points: Pt[], width: number, height: number, radius = 22) {
  // About one grid cell per 3 CSS px; fewer on very tall pages.
  const { ctx, scale, w, h } = prepare(canvas, width, height, 1 / 3);
  if (!ctx || !points.length) return;

  const r = Math.max(2, Math.round(radius * scale));
  const sigma = r / 2;
  const size = r * 2 + 1;
  const kernel = new Float32Array(size * size);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const d2 = dx * dx + dy * dy;
      kernel[(dy + r) * size + (dx + r)] = d2 > r * r ? 0 : Math.exp(-d2 / (2 * sigma * sigma));
    }
  }

  const grid = new Float32Array(w * h);
  let max = 0;
  for (const p of points) {
    const cx = Math.round(p.x * scale);
    const cy = Math.round(p.y * scale);
    if (cx < -r || cy < -r || cx > w + r || cy > h + r) continue;
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(h - 1, cy + r);
    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(w - 1, cx + r);
    for (let y = y0; y <= y1; y += 1) {
      const krow = (y - cy + r) * size;
      const grow = y * w;
      for (let x = x0; x <= x1; x += 1) {
        const k = kernel[krow + (x - cx + r)];
        if (!k) continue;
        const v = (grid[grow + x] += k);
        if (v > max) max = v;
      }
    }
  }
  if (max <= 0) return;

  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let i = 0; i < grid.length; i += 1) {
    const g = grid[i];
    if (g <= 0) continue;
    const v = Math.sqrt(g / max);
    if (v < 0.04) continue;
    const c = Math.min(255, Math.round(v * 255)) * 3;
    const o = i * 4;
    px[o] = PALETTE[c];
    px[o + 1] = PALETTE[c + 1];
    px[o + 2] = PALETTE[c + 2];
    px[o + 3] = Math.round(Math.min(0.88, 0.25 + v * 0.7) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** One dot per click. `hot` points (e.g. the last minute, live) get a halo. */
export function drawDots(canvas: HTMLCanvasElement, points: Pt[], width: number, height: number) {
  const { ctx, scale } = prepare(canvas, width, height, 1);
  if (!ctx) return;
  const r = Math.max(1.5, 4 * scale);
  for (const p of points) {
    const x = p.x * scale;
    const y = p.y * scale;
    if (p.hot) {
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 70, 50, 0.22)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.rage ? 'rgba(240, 40, 40, 0.92)' : p.dead ? 'rgba(130, 130, 140, 0.85)' : 'rgba(255, 95, 30, 0.78)';
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }
}

/**
 * Scroll reach: reach[k] = page views that scrolled to at least k × 5 % of the
 * page (reach[0] = all measured views). Bands go red (everyone saw this) →
 * blue (few did), with a marker line where 75 / 50 / 25 % of visitors stopped.
 */
export function drawScroll(canvas: HTMLCanvasElement, reach: number[], width: number, height: number): { y: number; share: number }[] {
  const { ctx, w, h } = prepare(canvas, width, height, 1 / 4);
  if (!ctx || !reach.length || !reach[0]) return [];
  const total = reach[0];
  const bands = reach.length - 1;
  for (let k = 0; k < bands; k += 1) {
    ctx.fillStyle = heatColor(reach[k + 1] / total, 0.4);
    ctx.fillRect(0, Math.floor((k / bands) * h), w, Math.ceil(h / bands) + 1);
  }
  // Where 75 / 50 / 25 % of visitors had stopped — labelled by the caller (as
  // DOM text, which stays sharp where canvas text would blur).
  const marks: { y: number; share: number }[] = [];
  for (const share of [0.75, 0.5, 0.25]) {
    let k = 0;
    while (k < bands && reach[k + 1] / total >= share) k += 1;
    if (k > 0 && k < bands) marks.push({ y: Math.round((k / bands) * height), share });
  }
  return marks;
}
