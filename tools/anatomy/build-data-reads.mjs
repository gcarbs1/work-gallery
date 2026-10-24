import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 820;
const HEIGHT = 500;
const BASE = { x: -152, y: -86, w: 304, d: 172, r: 8 };
const PANE = { x: -104, y: -59, w: 208, d: 118, r: 4 };
const LEVELS = [12, 43, 74];
const DATA = [14, 19, 16, 28, 24, 35, 31, 41, 37, 48, 43, 53];

const P = k.fitProjection(
  [...k.boxCorners(BASE, -20, 106), [-166, -98, -20], [166, 98, 110]],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 44, headroom: 4 },
);

const at = (point) => k.iso(point, P);
const solid = (paths, style = {}) => k.solidSvg(paths, style);
const line = (path, style = {}) => k.lineSvg(path, style);
const dots = (points, style = {}) => k.dotsSvg(points, style);
const byDepth = (points, z = 0) =>
  [...points].sort((a, b) => k.depthOf([a[0], a[1], z], P) - k.depthOf([b[0], b[1], z], P));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -20, 8, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 21), -18)) {
    out.push(solid(k.cylinder(x, y, 7, -20, 2, P, 28), { tone: "lo" }));
    out.push(solid(k.cylinder(x, y, 5.2, -18, 6, P, 28), { tone: "mid" }));
  }
  out.push(solid(k.slabOf(BASE, -12, 12, P, 10, 1.6), { tone: "mid" }));
  out.push(line(k.planOutline(k.insetPlan(BASE, 5), 0.2, P, 10), { tone: "faint" }));

  const screws = k.corners(BASE, 11);
  out.push(line(screws.map(([x, y]) => k.ring(x, y, 2.1, 0.2, P, 18)).join(""), { tone: "lo" }));
  out.push(dots(screws.map(([x, y]) => at([x, y, 0.2])), { size: 0.48, tone: "mid" }));

  const ruler = { x: -123, y: 68, w: 218, d: 7, r: 1 };
  out.push(solid(k.slabOf(ruler, 0, 0.7, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(ruler.x + 4, ruler.x + ruler.w - 4, 4, 5, ruler.y + 1, 0.7, [2, 4], P);
  out.push(line(ticks.minor, { tone: "lo" }), line(ticks.major, { tone: "mid" }));

  const control = { x: 112, y: -68, w: 28, d: 48, r: 3 };
  out.push(solid(k.slabOf(control, 0, 15, P, 6, 1), { tone: "mid" }));
  out.push(line(k.planOutline(k.insetPlan(control, 4), 15.2, P, 5), { tone: "faint" }));
  for (const [x, y] of [[120, -57], [132, -57], [120, -42], [132, -42]]) {
    out.push(solid(k.cylinder(x, y, 2.7, 15, 2.3, P, 20), { tone: "mid" }));
  }
  return out.join("");
}

function guides() {
  const out = [];
  for (const [x, y] of byDepth(k.corners(PANE, 11), 0)) {
    out.push(solid(k.cylinder(x, y, 6.2, 0, 4, P, 26), { tone: "mid" }));
    out.push(solid(k.cylinder(x, y, 3, 4, 92, P, 24), { tone: "mid", crease: "none" }));
    for (const z of [LEVELS[0] - 2, LEVELS[1] - 2, LEVELS[2] - 2]) {
      out.push(solid(k.cylinder(x, y, 5.2, z, 4, P, 24), { tone: "mid" }));
      out.push(line(k.sideArc(x, y, 5.2, z + 2, P, 14), { tone: "faint" }));
    }
    out.push(solid(k.cylinder(x, y, 4.2, 96, 3, P, 24), { tone: "mid" }));
    out.push(line(k.knurl(x, y, 4.2, 96, 99, 24, P), { tone: "lo" }));
  }
  return out.join("");
}

function seriesPoints(values, z, yScale = 1) {
  return values.map((value, index) => [
    PANE.x + 16 + index * ((PANE.w - 32) / (values.length - 1)),
    PANE.y + 18 + value * yScale,
    z,
  ]);
}

function paneBase(z, index) {
  const inner = k.insetPlan(PANE, 8);
  const out = [];
  out.push(solid(k.slabOf(PANE, z, 2.2, P, 8, 0.55), { tone: index === 1 ? "hi" : "mid" }));
  out.push(line(k.planOutline(inner, z + 2.3, P, 7), { tone: "faint" }));

  for (const [x, y] of k.corners(PANE, 12)) {
    out.push(line(k.ring(x, y, 3.2, z + 2.4, P, 20), { tone: "lo" }));
    out.push(dots([at([x, y, z + 2.4])], { size: 0.43, tone: "mid" }));
  }

  const grid = [];
  for (let x = PANE.x + 24; x <= PANE.x + PANE.w - 20; x += 24) {
    grid.push(k.lineOnTop([x, PANE.y + 12], [x, PANE.y + PANE.d - 12], z + 2.45, P));
  }
  for (let y = PANE.y + 22; y <= PANE.y + PANE.d - 16; y += 22) {
    grid.push(k.lineOnTop([PANE.x + 12, y], [PANE.x + PANE.w - 12, y], z + 2.45, P));
  }
  out.push(line(grid.join(""), { tone: "faint" }));
  return out.join("");
}

function rawRead() {
  const z = LEVELS[0];
  const points = seriesPoints(DATA, z + 2.7, 1.15);
  return `<g class="data-layer data-layer--raw">${paneBase(z, 0)}${line(k.pathOf(points.map(at)), { tone: "hi", free: "both", className: "data-line data-line--raw" })}${dots(points.map(at), { size: 0.7, tone: "hi" })}</g>`;
}

function trendRead() {
  const z = LEVELS[1];
  const smooth = DATA.map((value, index) => {
    const from = Math.max(0, index - 1);
    const to = Math.min(DATA.length - 1, index + 1);
    let sum = 0;
    for (let cursor = from; cursor <= to; cursor += 1) sum += DATA[cursor];
    return sum / (to - from + 1);
  });
  const points = seriesPoints(smooth, z + 2.7, 1.15);
  return `<g class="data-layer data-layer--trend">${paneBase(z, 1)}${line(k.pathOf(points.map(at)), { tone: "lit", free: "both", className: "data-line data-line--trend" })}${dots(points.filter((_, index) => index % 2 === 0).map(at), { size: 0.75, tone: "hi" })}</g>`;
}

function variationRead() {
  const z = LEVELS[2];
  const change = DATA.map((value, index) => index === 0 ? 0 : value - DATA[index - 1]);
  const zero = PANE.y + PANE.d / 2;
  const tops = change.map((value, index) => [
    PANE.x + 16 + index * ((PANE.w - 32) / (change.length - 1)),
    zero + value * 2.2,
    z + 2.7,
  ]);
  const stems = tops.map((point) => k.segment([point[0], zero, z + 2.7], point, P)).join("");
  return `<g class="data-layer data-layer--variation">${paneBase(z, 2)}${line(stems, { tone: "hi", className: "variation-stems" })}${dots(tops.map(at), { size: 0.8, tone: "hi" })}${line(k.lineOnTop([PANE.x + 12, zero], [PANE.x + PANE.w - 12, zero], z + 2.55, P), { tone: "mid" })}</g>`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  standalone: "dark",
  label: "One dataset arranged on three isometric reading panes: raw values, a rolling trend and period-to-period variation.",
  body: [base(), guides(), rawRead(), trendRead(), variationRead()],
})
  .replace(
    'data-theme="dark"',
    'data-theme="dark" style="--anatomy-paper:#000;--anatomy-face:#0a0a0a;--anatomy-top:#0d0d0d;--anatomy-shade-0:#030303;--anatomy-shade-1:#060606;--anatomy-shade-2:#090909;--anatomy-shade-3:#0d0d0d;--anatomy-hi:#f0eade;--anatomy-mid:#aaa59c;--anatomy-lo:#706d67;--anatomy-faint:#44413d;--anatomy-lit:#f0eade;--anatomy-lit-top:#171512;--anatomy-lit-shade:#0f0e0c;--anatomy-halo:#000"',
  )
  .replace(
    "</style>",
    `
.data-layer{transform-box:view-box;transform-origin:center;will-change:transform,opacity}
.data-layer--raw{animation:readRaw 12s cubic-bezier(.22,1,.36,1) infinite}
.data-layer--trend{animation:readTrend 12s cubic-bezier(.22,1,.36,1) infinite}
.data-layer--variation{animation:readVariation 12s cubic-bezier(.22,1,.36,1) infinite}
.data-line{stroke-dasharray:420;stroke-dashoffset:420;animation:drawData 12s cubic-bezier(.22,1,.36,1) infinite}
.data-line--trend{stroke-width:1.25px}
.variation-stems{animation:pulseStems 12s ease-in-out infinite}
@keyframes readRaw{0%,10%,90%,100%{transform:translateY(-34px);opacity:.38}24%,76%{transform:translateY(0);opacity:1}}
@keyframes readTrend{0%,10%,90%,100%{transform:translateY(-17px);opacity:.56}24%,76%{transform:translateY(0);opacity:1}}
@keyframes readVariation{0%,10%,90%,100%{transform:translateY(0);opacity:.78}24%,76%{transform:translateY(0);opacity:1}}
@keyframes drawData{0%,16%{stroke-dashoffset:420}38%,78%{stroke-dashoffset:0}94%,100%{stroke-dashoffset:-420}}
@keyframes pulseStems{0%,20%,88%,100%{opacity:.2}45%,72%{opacity:1}}
@media(prefers-reduced-motion:reduce){.data-layer,.data-line,.variation-stems{animation:none}.data-line{stroke-dashoffset:0}}
</style>`,
  );

writeFileSync(join(HERE, "../../assets/data-reads.svg"), svg);
console.log("wrote assets/data-reads.svg");
