// =============================================================================
// HeatFrame — drives the real page shown in the heatmap viewer's <iframe>.
//
// The page is the live website, same origin, rendered at the width visitors
// used. On top of it, INSIDE the page's own document, sit:
//   • a canvas in document coordinates (scrolls with the page) for clicks on
//     normal content, and
//   • a canvas fixed to the viewport for clicks on things that stay put on
//     screen (sticky nav, cookie bar, chat bubble, phone "get started" bar),
//     redrawn as the page scrolls,
//   • hover outline + tooltip, scroll-reach markers, and numbered markers for
//     replaying one visitor's clicks.
// Every click is placed on the ELEMENT it hit (found again by its CSS path),
// at the same spot inside it — so it lands correctly even if the page has
// changed size. Clicks on elements that can't be found (a closed menu, a
// removed button) fall back to their recorded page position.
//
// Links and buttons inside the frame do nothing: clicking picks an element.
// =============================================================================

import { clearCanvas, drawDots, drawHeat, drawScroll, type Pt } from './render';
import type { Click, HeatElement } from './types';

export type HeatMode = 'heat' | 'dots' | 'scroll';

interface Placed { node: Element; floating: boolean }

export interface FrameCallbacks {
  /** Tooltip lines for an element (by index), or null if it has no clicks. */
  describe: (el: number) => string[] | null;
  /** An element was clicked in the frame (null = empty space). */
  onPick: (el: number | null) => void;
  /** Elements placed / missing, after each layout pass. */
  onLayout?: (info: { placed: number; missing: number; height: number }) => void;
}

const STYLE = `
body *, body *::before, body *::after {
  transition: none !important;
  animation-duration: 0.001s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
}
.rovora-site .reveal, .reveal { opacity: 1 !important; transform: none !important; }
html { scroll-behavior: auto !important; }
#rv-hm { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 2147483640; pointer-events: none; }
#rv-hm .doc { position: absolute; left: 0; top: 0; pointer-events: none; }
#rv-hm .fix { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 2147483641; }
#rv-hm .box { position: absolute; display: none; border-radius: 6px; pointer-events: none;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #ff5a2c, 0 6px 22px rgba(0,0,0,.25); z-index: 2147483642; }
#rv-hm .box.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #3b82f6, 0 6px 22px rgba(0,0,0,.25); }
#rv-hm .tip { position: fixed; display: none; pointer-events: none; z-index: 2147483645; transform-origin: 0 0;
  background: rgba(14,16,22,.96); color: #fff; font: 500 12px/1.4 system-ui, -apple-system, sans-serif;
  padding: 7px 10px; border-radius: 8px; max-width: 280px; box-shadow: 0 8px 24px rgba(0,0,0,.3); white-space: normal; }
#rv-hm .tip b { font-weight: 600; display: block; margin-bottom: 2px; }
#rv-hm .tip span { display: block; color: rgba(255,255,255,.72); font-weight: 400; }
#rv-hm .mark { position: absolute; left: 0; height: 0; border-top: 2px dashed rgba(12,16,24,.85); z-index: 2147483641; }
#rv-hm .mark i { position: absolute; left: 10px; top: -26px; font: 600 12px/1 system-ui, sans-serif; font-style: normal;
  background: rgba(12,16,24,.88); color: #fff; padding: 6px 9px; border-radius: 6px; transform-origin: 0 100%; white-space: nowrap; }
#rv-hm .num { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; z-index: 2147483643;
  background: #ff5a2c; color: #fff; font: 700 11px/24px system-ui, sans-serif; text-align: center;
  box-shadow: 0 0 0 3px rgba(255,90,44,.3), 0 4px 12px rgba(0,0,0,.3); opacity: 0; transform: scale(.4);
  transition: opacity .25s ease, transform .25s ease !important; }
#rv-hm .num.on { opacity: 1; transform: scale(var(--rv-inv, 1)); }
#rv-hm .num.now { background: #2563eb; box-shadow: 0 0 0 6px rgba(37,99,235,.28), 0 4px 12px rgba(0,0,0,.3); }
#rv-hm svg.trail { position: absolute; left: 0; top: 0; overflow: visible; z-index: 2147483642; }
`;

export class HeatFrame {
  private iframe: HTMLIFrameElement;
  private cb: FrameCallbacks;
  private doc: Document | null = null;
  private win: Window | null = null;
  private root: HTMLDivElement | null = null;
  private docCanvas: HTMLCanvasElement | null = null;
  private fixCanvas: HTMLCanvasElement | null = null;
  private box: HTMLDivElement | null = null;
  private tip: HTMLDivElement | null = null;
  private layer: HTMLDivElement | null = null;

  private elements: HeatElement[] = [];
  private clicks: Click[] = [];
  private mode: HeatMode = 'heat';
  private reach: number[] | null = null;
  private hotSince = 0;
  private placed = new Map<number, Placed | null>();
  private indexOf = new WeakMap<Element, number>();
  private selected: number | null = null;
  private inv = 1;
  /** Element rects for the duration of one draw (one layout read each). */
  private rects: Map<number, DOMRect> | null = null;

  private ro: ResizeObserver | null = null;
  private relayoutTimer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private replayTimers: ReturnType<typeof setTimeout>[] = [];
  private cleanup: (() => void)[] = [];

  constructor(iframe: HTMLIFrameElement, cb: FrameCallbacks) {
    this.iframe = iframe;
    this.cb = cb;
  }

  /** Call from the iframe's load event. */
  attach() {
    this.detach();
    const doc = this.iframe.contentDocument;
    const win = this.iframe.contentWindow;
    if (!doc || !win || !doc.body) return;
    this.doc = doc;
    this.win = win;

    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);

    const root = doc.createElement('div');
    root.id = 'rv-hm';
    root.style.setProperty('--rv-inv', String(this.inv));
    const docCanvas = doc.createElement('canvas');
    docCanvas.className = 'doc';
    const fixCanvas = doc.createElement('canvas');
    fixCanvas.className = 'fix';
    const layer = doc.createElement('div');
    const box = doc.createElement('div');
    box.className = 'box';
    const tip = doc.createElement('div');
    tip.className = 'tip';
    root.append(docCanvas, fixCanvas, layer, box, tip);
    doc.documentElement.appendChild(root);
    Object.assign(this, { root, docCanvas, fixCanvas, layer, box, tip });
    this.setUiScale(this.inv);

    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent) => {
      block(e);
      const ix = this.trackedAt(e.target);
      this.cb.onPick(ix);
    };
    const onMove = (e: MouseEvent) => this.hover(e);
    const onLeave = () => this.hideHover();
    const onScroll = () => {
      if (this.raf) return;
      this.raf = win.requestAnimationFrame(() => {
        this.raf = 0;
        this.drawFloating();
        this.positionBox();
      });
    };
    const onResize = () => this.scheduleRelayout();
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('submit', block, true);
    doc.addEventListener('auxclick', block, true);
    doc.addEventListener('mousemove', onMove, { passive: true });
    doc.addEventListener('mouseleave', onLeave);
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onResize);
    // A website pop-up opening / closing (components/marketing/popups) adds or
    // removes clickable parts without resizing anything.
    win.addEventListener('rovora:popup', onResize);
    this.cleanup.push(() => {
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('submit', block, true);
      doc.removeEventListener('auxclick', block, true);
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseleave', onLeave);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('rovora:popup', onResize);
    });

    // Images, fonts and late content change the layout — follow it.
    this.ro = new ResizeObserver(() => this.scheduleRelayout());
    this.ro.observe(doc.body);
    this.relayout();
  }

  detach() {
    for (const fn of this.cleanup.splice(0)) fn();
    this.ro?.disconnect();
    this.ro = null;
    if (this.relayoutTimer) clearTimeout(this.relayoutTimer);
    this.stopReplay();
    this.root?.remove();
    this.root = this.docCanvas = this.fixCanvas = this.layer = this.box = this.tip = null;
    this.doc = null;
    this.win = null;
    this.placed.clear();
  }

  // ── Inputs ────────────────────────────────────────────────────────────────

  setData(elements: HeatElement[], clicks: Click[]) {
    const changed = elements !== this.elements || clicks !== this.clicks;
    this.clicks = clicks;
    if (elements !== this.elements) {
      this.elements = elements;
      this.placed.clear();
      this.indexOf = new WeakMap();
    }
    if (changed && this.doc) this.resolveAll();
    this.draw();
  }

  setMode(mode: HeatMode, reach: number[] | null) {
    this.mode = mode;
    this.reach = reach;
    this.draw();
  }

  /** Clicks newer than this (epoch ms) get a halo in dot mode (live view). */
  setHotSince(t: number) {
    this.hotSince = t;
    if (this.mode === 'dots') this.draw();
  }

  /** The frame is shown scaled down by `scale`; keep its labels readable. */
  setUiScale(scale: number) {
    this.inv = scale > 0 ? Math.min(3, 1 / scale) : 1;
    if (this.root) this.root.style.setProperty('--rv-inv', String(this.inv));
    if (this.tip) this.tip.style.transform = `scale(${this.inv})`;
  }

  /** Outline an element (and scroll it into view), or clear with null. */
  select(el: number | null, scroll = true) {
    this.selected = el;
    this.positionBox();
    if (el == null || !scroll || !this.win) return;
    const p = this.place(el);
    if (!p || p.floating) return;
    const r = p.node.getBoundingClientRect();
    const top = r.top + this.win.scrollY - this.win.innerHeight / 3;
    this.win.scrollTo({ top: Math.max(0, top) });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private scheduleRelayout() {
    if (this.relayoutTimer) clearTimeout(this.relayoutTimer);
    this.relayoutTimer = setTimeout(() => this.relayout(), 250);
  }

  private relayout() {
    if (!this.doc) return;
    this.placed.clear();
    this.indexOf = new WeakMap();
    this.resolveAll();
    this.draw();
  }

  private resolveAll() {
    let placed = 0;
    let missing = 0;
    // Count only elements whose clicks are being drawn (a closed pop-up's
    // buttons aren't "missing" while the page layer is shown).
    const drawn = new Set(this.clicks.map((c) => c.el));
    for (let i = 0; i < this.elements.length; i += 1) {
      const found = this.place(i);
      if (!drawn.has(i)) continue;
      if (found) placed += 1;
      else missing += 1;
    }
    this.cb.onLayout?.({ placed, missing, height: this.docSize().h });
  }

  /** Find element i in the page (cached). Null if gone or not visible. */
  private place(i: number): Placed | null {
    if (this.placed.has(i)) return this.placed.get(i) ?? null;
    let result: Placed | null = null;
    const sel = this.elements[i]?.s;
    if (sel && this.doc) {
      let node: Element | null = null;
      try {
        node = this.doc.querySelector(sel);
      } catch {
        node = null;
      }
      if (node) {
        const r = node.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          result = { node, floating: this.isFloating(node) };
          this.indexOf.set(node, i);
        }
      }
    }
    this.placed.set(i, result);
    return result;
  }

  private isFloating(node: Element): boolean {
    const win = this.win;
    if (!win) return false;
    for (let n: Element | null = node; n && n !== this.doc?.body; n = n.parentElement) {
      const pos = win.getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  }

  private docSize() {
    const d = this.doc?.documentElement;
    const b = this.doc?.body;
    return {
      w: Math.max(d?.scrollWidth ?? 0, d?.clientWidth ?? 0),
      h: Math.max(d?.scrollHeight ?? 0, b?.scrollHeight ?? 0),
    };
  }

  /** Where a click lands now: page coords (anchored) or viewport coords (floating). */
  private pointFor(c: Click, size: { w: number; h: number }): { x: number; y: number; floating: boolean } {
    const win = this.win!;
    const p = this.place(c.el);
    if (p) {
      let r = this.rects?.get(c.el);
      if (!r) {
        r = p.node.getBoundingClientRect();
        this.rects?.set(c.el, r);
      }
      const fx = c.rx >= 0 ? c.rx / 1000 : 0.5;
      const fy = c.ry >= 0 ? c.ry / 1000 : 0.5;
      const vx = r.left + r.width * fx;
      const vy = r.top + r.height * fy;
      return p.floating ? { x: vx, y: vy, floating: true } : { x: vx + win.scrollX, y: vy + win.scrollY, floating: false };
    }
    // Element not on the page now: use the recorded position, scaled.
    const sx = size.w / Math.max(1, c.dw);
    const sy = Math.abs(c.dw - size.w) < 2 ? 1 : size.h / Math.max(1, c.dh);
    return { x: c.x * sx, y: c.y * sy, floating: false };
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  draw() {
    if (!this.doc || !this.docCanvas || !this.layer) return;
    const size = this.docSize();
    this.root!.style.height = `${size.h}px`;
    this.root!.style.width = `${size.w}px`;
    this.layer.querySelectorAll('.mark').forEach((n) => n.remove());

    if (this.mode === 'scroll') {
      const marks = this.reach ? drawScroll(this.docCanvas, this.reach, size.w, size.h) : [];
      if (this.fixCanvas) clearCanvas(this.fixCanvas);
      for (const m of marks) {
        const line = this.doc.createElement('div');
        line.className = 'mark';
        line.style.top = `${m.y}px`;
        line.style.width = `${size.w}px`;
        const label = this.doc.createElement('i');
        label.textContent = `${Math.round(m.share * 100)}% of visitors scrolled this far`;
        label.style.transform = `scale(${this.inv})`;
        line.appendChild(label);
        this.layer.appendChild(line);
      }
      return;
    }

    const anchored: Pt[] = [];
    this.rects = new Map();
    for (const c of this.clicks) {
      const p = this.pointFor(c, size);
      if (!p.floating) anchored.push({ x: p.x, y: p.y, rage: c.rage, dead: c.dead, hot: c.t >= this.hotSince && this.hotSince > 0 });
    }
    this.rects = null;
    if (this.mode === 'dots') drawDots(this.docCanvas, anchored, size.w, size.h);
    else drawHeat(this.docCanvas, anchored, size.w, size.h, size.w < 600 ? 18 : 24);
    this.drawFloating();
    this.positionBox();
  }

  /** Clicks on fixed / sticky things, drawn where those things are right now. */
  private drawFloating() {
    if (!this.fixCanvas || !this.win || this.mode === 'scroll') return;
    const size = this.docSize();
    const pts: Pt[] = [];
    this.rects = new Map();
    for (const c of this.clicks) {
      const p = this.place(c.el);
      if (!p?.floating) continue;
      const q = this.pointFor(c, size);
      pts.push({ x: q.x, y: q.y, rage: c.rage, dead: c.dead, hot: c.t >= this.hotSince && this.hotSince > 0 });
    }
    this.rects = null;
    const w = this.win.innerWidth;
    const h = this.win.innerHeight;
    if (!pts.length) {
      clearCanvas(this.fixCanvas);
      return;
    }
    if (this.mode === 'dots') drawDots(this.fixCanvas, pts, w, h);
    else drawHeat(this.fixCanvas, pts, w, h, w < 600 ? 18 : 24);
  }

  // ── Hover / select ────────────────────────────────────────────────────────

  private trackedAt(target: EventTarget | null): number | null {
    // The page lives in another window, so its nodes aren't `instanceof Element` here.
    const start = target && (target as Node).nodeType === 1 ? (target as Element) : null;
    for (let n = start; n && n !== this.doc?.documentElement; n = n.parentElement) {
      if (n.id === 'rv-hm') return null;
      const i = this.indexOf.get(n);
      if (i != null) return i;
    }
    return null;
  }

  private hover(e: MouseEvent) {
    if (!this.tip || !this.win) return;
    const ix = this.trackedAt(e.target);
    const lines = ix == null ? null : this.cb.describe(ix);
    if (ix == null || !lines) {
      this.hideHover();
      return;
    }
    if (this.selected == null || this.selected !== ix) this.outline(ix, false);
    this.tip.innerHTML = '';
    const b = this.doc!.createElement('b');
    b.textContent = lines[0];
    this.tip.appendChild(b);
    for (const l of lines.slice(1)) {
      const s = this.doc!.createElement('span');
      s.textContent = l;
      this.tip.appendChild(s);
    }
    this.tip.style.display = 'block';
    const tw = this.tip.offsetWidth * this.inv;
    const th = this.tip.offsetHeight * this.inv;
    const x = Math.min(e.clientX + 14, this.win.innerWidth - tw - 6);
    const y = e.clientY + 18 + th > this.win.innerHeight ? e.clientY - th - 12 : e.clientY + 18;
    this.tip.style.left = `${Math.max(4, x)}px`;
    this.tip.style.top = `${Math.max(4, y)}px`;
  }

  private hideHover() {
    if (this.tip) this.tip.style.display = 'none';
    this.positionBox();
  }

  private outline(ix: number | null, isSelection: boolean) {
    const box = this.box;
    if (!box || !this.win) return;
    const p = ix == null ? null : this.place(ix);
    if (!p) {
      box.style.display = 'none';
      return;
    }
    const r = p.node.getBoundingClientRect();
    box.className = isSelection ? 'box sel' : 'box';
    box.style.position = p.floating ? 'fixed' : 'absolute';
    box.style.left = `${r.left + (p.floating ? 0 : this.win.scrollX) - 3}px`;
    box.style.top = `${r.top + (p.floating ? 0 : this.win.scrollY) - 3}px`;
    box.style.width = `${r.width + 6}px`;
    box.style.height = `${r.height + 6}px`;
    box.style.display = 'block';
  }

  private positionBox() {
    this.outline(this.selected, true);
  }

  // ── Replay one visit ──────────────────────────────────────────────────────

  /**
   * Show one visitor's clicks on this page in order: numbered markers joined by
   * a line, appearing one by one at (compressed) real pace while the page
   * scrolls to follow. Returns when it is set up; `onStep` reports progress.
   */
  replay(clicks: Click[], onStep?: (i: number) => void, onDone?: () => void) {
    this.stopReplay();
    if (!this.doc || !this.layer || !this.win || !clicks.length) return;
    const size = this.docSize();
    const ns = 'http://www.w3.org/2000/svg';
    const pts = clicks.map((c) => {
      const p = this.pointFor(c, size);
      // A floating element is drawn where it sits with the page at the top.
      return p.floating ? { x: p.x + this.win!.scrollX, y: p.y + this.win!.scrollY } : { x: p.x, y: p.y };
    });

    const svg = this.doc.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'trail');
    svg.setAttribute('width', String(size.w));
    svg.setAttribute('height', String(size.h));
    const line = this.doc.createElementNS(ns, 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'rgba(255,90,44,.75)');
    line.setAttribute('stroke-width', String(2.5 * this.inv));
    line.setAttribute('stroke-dasharray', `${6 * this.inv} ${5 * this.inv}`);
    svg.appendChild(line);
    this.layer.appendChild(svg);

    const nums = pts.map((p, i) => {
      const n = this.doc!.createElement('div');
      n.className = 'num';
      n.textContent = String(i + 1);
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      this.layer!.appendChild(n);
      return n;
    });

    let delay = 300;
    clicks.forEach((c, i) => {
      if (i > 0) {
        const gap = c.ms >= 0 && clicks[i - 1].ms >= 0 ? c.ms - clicks[i - 1].ms : c.t - clicks[i - 1].t;
        // Real pace, squeezed: 0.35 s – 1.6 s between clicks.
        delay += Math.min(1600, Math.max(350, gap / 4));
      }
      this.replayTimers.push(setTimeout(() => {
        nums.forEach((n, j) => n.classList.toggle('now', j === i));
        nums[i].classList.add('on');
        line.setAttribute('points', pts.slice(0, i + 1).map((p) => `${p.x},${p.y}`).join(' '));
        const vy = pts[i].y - this.win!.scrollY;
        if (vy < 60 || vy > this.win!.innerHeight - 60) this.win!.scrollTo({ top: Math.max(0, pts[i].y - this.win!.innerHeight / 2) });
        onStep?.(i);
        if (i === clicks.length - 1) onDone?.();
      }, delay));
    });
  }

  stopReplay() {
    for (const t of this.replayTimers.splice(0)) clearTimeout(t);
    this.layer?.querySelectorAll('.num, svg.trail').forEach((n) => n.remove());
  }
}
