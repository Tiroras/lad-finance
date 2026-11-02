/** Two matching portrait A4 fragments of the complete logical data model. */
import { readFile, writeFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const dir = path.dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(await readFile(path.join(dir, "er-model.json"), "utf8"));
const FONT = m.layout.fontSize,
  LABEL = m.layout.labelFontSize,
  LINE = 22,
  W = m.canvas.width,
  H = m.canvas.height;
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const measured = new Map();
async function measure(s, bold = false, size = FONT) {
  const k = [s, bold, size].join("|");
  if (measured.has(k)) return measured.get(k);
  const { info } = await sharp({
    text: {
      text: esc(s),
      font: `Arial ${bold ? "Bold " : ""}${size}`,
      fontfile: "/System/Library/Fonts/Supplemental/Arial.ttf",
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  const width = info.width + 2;
  measured.set(k, width);
  return width;
}
async function wrap(s, width, bold = false) {
  const out = [];
  let rest = s;
  while ((await measure(rest, bold)) > width) {
    let cut = rest.length - 1;
    while (cut > 1 && (await measure(rest.slice(0, cut), bold)) > width) cut--;
    let safe = -1;
    for (let i = 1; i <= cut; i++)
      if (rest[i - 1] === " " || rest[i - 1] === "." || rest[i] === "[")
        safe = i;
    if (safe > 0) cut = safe;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
const nodes = new Map(m.nodes.map((n) => [n.id, n]));
for (const n of m.nodes) {
  n.width = 250;
  n.titleFont = n.id === "IncomeOverride" ? 18 : FONT;
  n.titlePadding = n.id === "IncomeOverride" ? 5 : 10;
  n.titleLines =
    n.id === "IncomeOverride"
      ? [n.title]
      : await wrap(n.title, n.width - 20, true);
  n.fields = n.attributes.map(
    (a) => a.name + (a.optional ? "?" : "") + ": " + (a.displayType || a.type),
  );
  n.fieldLines = [];
  for (let i = 0; i < n.fields.length; i++)
    n.fieldLines.push({
      field: n.attributes[i].name,
      lines: await wrap(n.fields[i], n.width - 20),
    });
  n.height =
    8 +
    LINE *
      (n.titleLines.length +
        n.fieldLines.reduce((s, f) => s + f.lines.length, 0)) +
    10;
}
for (let ti = 0; ti < m.tiles.length; ti++) {
  const t = m.tiles[ti];
  const top = t.y + (ti ? 70 : 15),
    bottom = t.y + t.height - (ti ? 15 : 65);
  t.nodes = [];
  for (let col = 0; col < 3; col++) {
    const ns = m.layout.columns[ti][col].map((id) => nodes.get(id));
    const columnTop = ti === 1 && col === 2 ? top + 210 : top;
    const total = ns.reduce((s, n) => s + n.height, 0),
      gap = (bottom - columnTop - total) / (ns.length - 1);
    if (gap < 25)
      throw Error(
        `Not enough room tile ${t.id} column ${col}: height ${total}, gap ${gap}`,
      );
    let y = columnTop;
    for (const n of ns) {
      n.tile = t.id;
      n.x = 25 + col * 300;
      n.y = Math.round(y);
      y += n.height + gap;
      t.nodes.push(n.id);
    }
    console.log("column", t.id, col, "height", total, "gap", gap.toFixed(1));
  }
}

const text = (s, x, y, size = FONT, bold = false, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ""} ${extra}>${esc(s)}</text>`;
function nodeSvg(n) {
  let y = n.y + FONT + 4;
  let s = `<g data-entity="${n.id}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="white" stroke="#111" stroke-width="1.4"/>`;
  for (const l of n.titleLines) {
    s += text(l, n.x + n.titlePadding, y, n.titleFont, true);
    y += LINE;
  }
  s += `<path d="M${n.x} ${y - 16} H${n.x + n.width}" stroke="#555" stroke-width="1"/>`;
  y += 3;
  for (const f of n.fieldLines)
    for (const l of f.lines) {
      s += text(l, n.x + 10, y);
      y += LINE;
    }
  return s + "</g>";
}
function svgDoc(t, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t.width}" height="${t.height}" viewBox="${t.x} ${t.y} ${t.width} ${t.height}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="white"/><g font-family="Arial" fill="#111">${body}</g></svg>`;
}
const vector = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
const ports = new Map(
  m.nodes.map((n) => [n.id, { top: [], bottom: [], left: [], right: [] }]),
);
const center = (n) => [n.x + n.width / 2, n.y + n.height / 2];
function chooseSide(n, other, self = false) {
  const [cx, cy] = center(n),
    [ox, oy] = center(other),
    p = ports.get(n.id);
  const candidates = Object.keys(vector).filter(
    (side) =>
      !(side === "top" && n.y < m.tiles[Number(n.tile) - 1].y + 35) &&
      !(side === "left" && n.x < 45) &&
      !(side === "right" && n.x + n.width > W - 45),
  );
  if (self)
    return n.id === "Category"
      ? "top"
      : n.id === "Transaction"
        ? "bottom"
        : candidates.includes("right")
          ? "right"
          : "left";
  return candidates.sort((a, b) => {
    const cost = (side) => {
      const [vx, vy] = vector[side],
        dot = (ox - cx) * vx + (oy - cy) * vy;
      const length = side === "left" || side === "right" ? n.height : n.width;
      return (
        -dot +
        120 * p[side].length +
        600 * Math.max(0, (p[side].length + 1) * 18 - length)
      );
    };
    return cost(a) - cost(b);
  })[0];
}
for (const e of m.edges) {
  const a = nodes.get(e.source),
    b = nodes.get(e.target);
  e.as = chooseSide(a, b, a === b);
  ports.get(a.id)[e.as].push({ e, key: "ap", other: b });
  e.bs = chooseSide(b, a, a === b);
  ports.get(b.id)[e.bs].push({ e, key: "bp", other: a });
  e.tilePath =
    a.tile === b.tile ? [Number(a.tile)] : [Number(a.tile), Number(b.tile)];
}
for (const n of m.nodes)
  for (const side of Object.keys(vector)) {
    const list = ports.get(n.id)[side],
      horizontal = side === "top" || side === "bottom";
    list.sort(
      (a, b) =>
        center(a.other)[horizontal ? 0 : 1] -
          center(b.other)[horizontal ? 0 : 1] ||
        a.e.id.localeCompare(b.e.id) ||
        a.key.localeCompare(b.key),
    );
    list.forEach((p, i) => {
      const f = (i + 1) / (list.length + 1);
      p.e[p.key] = horizontal
        ? [
            Math.round((n.x + 14 + (n.width - 28) * f) / 4) * 4,
            n.y + (side === "bottom" ? n.height : 0),
          ]
        : [
            n.x + (side === "right" ? n.width : 0),
            Math.round((n.y + 14 + (n.height - 28) * f) / 4) * 4,
          ];
    });
  }
const cross = m.edges
  .filter((e) => e.tilePath.length === 2)
  .sort(
    (a, b) =>
      center(nodes.get(a.source))[0] +
        center(nodes.get(a.target))[0] -
        center(nodes.get(b.source))[0] -
        center(nodes.get(b.target))[0] || a.id.localeCompare(b.id),
  );
const seam = m.tiles[0].height;
const crossings = cross.map((e, i) => ({
  id: "L" + String(i + 1).padStart(2, "0"),
  edgeId: e.id,
  tiles: ["1", "2"],
  axis: 1,
  point: [Math.round((40 + (i * (W - 80)) / (cross.length - 1)) / 4) * 4, seam],
}));
const portBoxes = crossings.flatMap((c) =>
  [0, 1].map((side) => ({
    id: c.id,
    edgeId: c.edgeId,
    tile: String(side + 1),
    neighbor: String(2 - side),
    x: c.point[0] - 13,
    y: seam + (side ? 3 : -22),
    width: 26,
    height: 20,
  })),
);
for (const e of m.edges)
  e.stitches = crossings.filter((c) => c.edgeId === e.id);
class Heap {
  constructor() {
    this.a = [];
  }
  push(v) {
    let i = this.a.push(v) - 1;
    while (i) {
      let p = (i - 1) >> 1;
      if (this.a[p].f <= v.f) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = v;
  }
  pop() {
    const v = this.a[0],
      last = this.a.pop();
    if (this.a.length) {
      let i = 0;
      while (2 * i + 1 < this.a.length) {
        let j = 2 * i + 1;
        if (j + 1 < this.a.length && this.a[j + 1].f < this.a[j].f) j++;
        if (this.a[j].f >= last.f) break;
        this.a[i] = this.a[j];
        i = j;
      }
      this.a[i] = last;
    }
    return v;
  }
  get length() {
    return this.a.length;
  }
}
const STEP = 4,
  GW = Math.ceil(W / STEP) + 1,
  key = (x, y) => y * GW + x;
const blocked = new Set(),
  used = new Map();
for (const n of m.nodes)
  for (
    let y = Math.floor((n.y - 6) / STEP);
    y <= Math.ceil((n.y + n.height + 6) / STEP);
    y++
  )
    for (
      let x = Math.floor((n.x - 6) / STEP);
      x <= Math.ceil((n.x + n.width + 6) / STEP);
      x++
    )
      blocked.add(key(x, y));
const markerBoxes = m.edges.flatMap((e) =>
  [
    ["source", e.ap, e.as],
    ["target", e.bp, e.bs],
  ].map(([endpoint, p, side]) => {
    const [vx, vy] = vector[side];
    return {
      id: e.id,
      edgeId: e.id,
      endpoint,
      x: Math.min(p[0], p[0] + vx * 20) - (vy ? 7 : 0),
      y: Math.min(p[1], p[1] + vy * 20) - (vx ? 7 : 0),
      width: vx ? 20 : 14,
      height: vy ? 20 : 14,
    };
  }),
);
const labelBoxes = [];
const requiredLabels = new Set([
  "R10",
  "R11",
  "R15",
  "R20",
  "R55",
  "R56",
  "R58",
  "R59",
  "R69",
  "R70",
  "R71",
  "R72",
  "R74",
  "R75",
]);
function inBox(p, b, pad = 0) {
  return (
    p[0] >= b.x - pad &&
    p[0] <= b.x + b.width + pad &&
    p[1] >= b.y - pad &&
    p[1] <= b.y + b.height + pad
  );
}
function routePart(startPoint, endPoint, tileId, edgeId, skipLabels = false) {
  const aa = startPoint.map((v) => Math.round(v / STEP)),
    bb = endPoint.map((v) => Math.round(v / STEP)),
    start = key(...aa),
    end = key(...bb),
    open = new Heap(),
    best = new Map(),
    tile = m.tiles[Number(tileId) - 1];
  open.push({ x: aa[0], y: aa[1], g: 0, f: 0, dir: -1, prev: null });
  best.set(start, 0);
  let fin,
    guard = 0;
  const forbidden = new Set();
  for (const box of [
    ...portBoxes.filter(
      (b) => b.tile === String(tileId) && b.edgeId !== edgeId,
    ),
    ...markerBoxes.filter((b) => b.edgeId !== edgeId),
    ...(skipLabels
      ? labelBoxes.filter((b) => requiredLabels.has(b.id))
      : labelBoxes),
  ])
    for (
      let y = Math.floor((box.y - 3) / STEP);
      y <= Math.ceil((box.y + box.height + 3) / STEP);
      y++
    )
      for (
        let x = Math.floor((box.x - 3) / STEP);
        x <= Math.ceil((box.x + box.width + 3) / STEP);
        x++
      )
        forbidden.add(key(x, y));
  while (open.length && guard++ < 350000) {
    const cur = open.pop();
    if (cur.x === bb[0] && cur.y === bb[1]) {
      fin = cur;
      break;
    }
    for (const [d, [dx, dy]] of [
      [0, [1, 0]],
      [1, [-1, 0]],
      [2, [0, 1]],
      [3, [0, -1]],
    ]) {
      const x = cur.x + dx,
        y = cur.y + dy,
        k = key(x, y);
      if (
        x * STEP < 4 ||
        x * STEP > W - 4 ||
        y * STEP < tile.y + 4 ||
        y * STEP > tile.y + tile.height - 4 ||
        ((blocked.has(k) || forbidden.has(k)) && k !== start && k !== end)
      )
        continue;
      const g =
        cur.g +
        1 +
        (cur.dir !== -1 && d !== cur.dir ? 6 : 0) +
        (used.get(k) || 0) * 12;
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      open.push({
        x,
        y,
        g,
        f: g + Math.abs(x - bb[0]) + Math.abs(y - bb[1]),
        dir: d,
        prev: cur,
      });
    }
  }
  if (!fin && !skipLabels)
    return routePart(startPoint, endPoint, tileId, edgeId, true);
  if (!fin)
    throw Error(
      "No route " +
        edgeId +
        " tile " +
        tileId +
        " " +
        startPoint +
        " " +
        endPoint,
    );
  const pts = [];
  for (let c = fin; c; c = c.prev) pts.unshift([c.x * STEP, c.y * STEP]);
  return pts;
}
function simplify(pts) {
  const p = pts.filter(
    (v, i) => !i || v[0] !== pts[i - 1][0] || v[1] !== pts[i - 1][1],
  );
  return p.filter(
    (v, i) =>
      !i ||
      i === p.length - 1 ||
      !(
        (p[i - 1][0] === v[0] && p[i + 1][0] === v[0]) ||
        (p[i - 1][1] === v[1] && p[i + 1][1] === v[1])
      ),
  );
}
function outside(point, side) {
  const [x, y] = point,
    [vx, vy] = vector[side];
  return [Math.round((x + vx * 20) / 4) * 4, Math.round((y + vy * 20) / 4) * 4];
}
function route(e) {
  const aa = outside(e.ap, e.as),
    bb = outside(e.bp, e.bs);
  const pts = [e.ap, aa];
  if (e.stitches.length) {
    const c = e.stitches[0],
      direction = e.tilePath[0] === 1 ? 1 : -1,
      before = [c.point[0], seam - direction * 32],
      after = [c.point[0], seam + direction * 32];
    pts.push(
      ...routePart(aa, before, e.tilePath[0], e.id),
      before,
      c.point,
      after,
      ...routePart(after, bb, e.tilePath[1], e.id),
    );
  } else pts.push(...routePart(aa, bb, e.tilePath[0], e.id));
  pts.push(bb, e.bp);
  return simplify(pts);
}
function segments(points) {
  return points.slice(1).map((p, i) => [points[i], p]);
}
function touchesBox(points, b, pad = 0) {
  return segments(points).some(([a, c]) =>
    a[0] === c[0]
      ? a[0] >= b.x - pad &&
        a[0] <= b.x + b.width + pad &&
        Math.max(a[1], c[1]) >= b.y - pad &&
        Math.min(a[1], c[1]) <= b.y + b.height + pad
      : a[1] >= b.y - pad &&
        a[1] <= b.y + b.height + pad &&
        Math.max(a[0], c[0]) >= b.x - pad &&
        Math.min(a[0], c[0]) <= b.x + b.width + pad,
  );
}
const routed = [];
async function placeLabel(e) {
  const width = await measure(e.role, false, LABEL),
    height = LABEL + 3,
    candidates = [];
  for (const [a, b] of segments(e.points)) {
    const lineHorizontal = a[1] === b[1],
      len = Math.abs(lineHorizontal ? a[0] - b[0] : a[1] - b[1]);
    if (len < 8) continue;
    for (const f of [0.5, 0.25, 0.75, 0, 1])
      for (const side of [-1, 1, 0])
        for (const horizontal of [true, false])
          for (const offset of [5, 9]) {
            const mid = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
              bw = horizontal ? width : height,
              bh = horizontal ? height : width,
              inline = side === 0;
            if (
              inline &&
              (lineHorizontal !== horizontal ||
                len < (lineHorizontal ? bw : bh) + 8)
            )
              continue;
            const box = inline
              ? {
                  x: mid[0] - bw / 2,
                  y: mid[1] - bh / 2,
                  width: bw,
                  height: bh,
                }
              : lineHorizontal
                ? {
                    x: mid[0] - bw / 2,
                    y: mid[1] + (side === -1 ? -bh - offset : offset),
                    width: bw,
                    height: bh,
                  }
                : {
                    x: mid[0] + (side === -1 ? -bw - offset : offset),
                    y: mid[1] - bh / 2,
                    width: bw,
                    height: bh,
                  };
            if (
              box.x < 2 ||
              box.x + box.width > W - 2 ||
              box.y < 2 ||
              box.y + box.height > H - 2 ||
              (box.y < seam + 34 && box.y + box.height > seam - 34)
            )
              continue;
            if (
              m.nodes.some(
                (n) =>
                  box.x < n.x + n.width + 4 &&
                  box.x + box.width > n.x - 4 &&
                  box.y < n.y + n.height + 4 &&
                  box.y + box.height > n.y - 4,
              )
            )
              continue;
            if (
              [...labelBoxes, ...portBoxes].some(
                (b) =>
                  box.x < b.x + b.width + 3 &&
                  box.x + box.width > b.x - 3 &&
                  box.y < b.y + b.height + 3 &&
                  box.y + box.height > b.y - 3,
              )
            )
              continue;
            if (
              [...routed, e].some(
                (q) => (q !== e || !inline) && touchesBox(q.points, box, 3),
              )
            )
              continue;
            if (
              m.edges.some(
                (q) =>
                  touchesBox(
                    [q.ap, outside(q.ap, q.as)],
                    box,
                    q === e ? 2 : 7,
                  ) ||
                  touchesBox([q.bp, outside(q.bp, q.bs)], box, q === e ? 2 : 7),
              )
            )
              continue;
            candidates.push({
              ...box,
              horizontal,
              inline,
              score:
                len +
                (horizontal ? 100 : 0) -
                (inline ? 50 : 0) -
                Math.hypot(mid[0] - e.ap[0], mid[1] - e.ap[1]) * 0.15,
            });
          }
  }
  if (!candidates.length) return null;
  const b = candidates.sort((a, b) => b.score - a.score)[0];
  b.id = e.id;
  labelBoxes.push(b);
  return b;
}
const ordered = [...m.edges].sort(
  (a, b) =>
    Number(requiredLabels.has(b.id)) - Number(requiredLabels.has(a.id)) ||
    a.stitches.length - b.stitches.length ||
    Math.hypot(
      ...center(nodes.get(a.source)).map(
        (v, i) => v - center(nodes.get(a.target))[i],
      ),
    ) -
      Math.hypot(
        ...center(nodes.get(b.source)).map(
          (v, i) => v - center(nodes.get(b.target))[i],
        ),
      ) ||
    a.id.localeCompare(b.id),
);
for (const e of ordered) {
  e.points = route(e);
  e.label = await placeLabel(e);
  routed.push(e);
  for (const [a, b] of segments(e.points)) {
    const n = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / STEP;
    for (let i = 0; i <= n; i++) {
      const k = key(
        Math.round((a[0] + ((b[0] - a[0]) * i) / n) / STEP),
        Math.round((a[1] + ((b[1] - a[1]) * i) / n) / STEP),
      );
      used.set(k, (used.get(k) || 0) + 1);
    }
  }
  console.log("route", e.id, e.label ? "labelled" : "NO LABEL");
}
for (const e of m.edges)
  if (
    e.label &&
    m.edges.some(
      (q) => (q !== e || !e.label.inline) && touchesBox(q.points, e.label, 3),
    )
  ) {
    labelBoxes.splice(labelBoxes.indexOf(e.label), 1);
    e.label = null;
  }
for (const e of m.edges) if (!e.label) e.label = await placeLabel(e);
function mark(point, side, card) {
  const [vx, vy] = vector[side],
    per = [-vy, vx],
    q = (along, cross) => [
      point[0] + vx * along + per[0] * cross,
      point[1] + vy * along + per[1] * cross,
    ],
    line = (a, b) =>
      `<path d="M${a.join(" ")} L${b.join(" ")}" fill="none" stroke="#111" stroke-width="1.3"/>`;
  let s = "";
  if (card.includes("*"))
    s += line(q(11, 0), q(0, 6)) + line(q(11, 0), q(0, -6));
  else s += line(q(5, -5), q(5, 5));
  if (card.startsWith("0"))
    s += `<circle cx="${q(16, 0)[0]}" cy="${q(16, 0)[1]}" r="3.5" fill="white" stroke="#111" stroke-width="1.3"/>`;
  else s += line(q(15, -5), q(15, 5));
  return s;
}
const body = [];
for (const e of ordered) {
  const d = e.points.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  body.push(
    `<g data-relation="${e.id}" data-source="${e.source}" data-target="${e.target}" data-role="${esc(e.role)}"><path d="${d}" fill="none" stroke="white" stroke-width="5.5"/><path d="${d}" fill="none" stroke="#222" stroke-width="1.3"${e.kind === "soft" ? ' stroke-dasharray="6 4"' : ""}/></g>`,
  );
}
body.push(...m.nodes.map(nodeSvg));
for (const e of m.edges) {
  body.push(
    `<g data-cardinality="${e.id}" data-endpoint="source">${mark(e.ap, e.as, e.sourceCardinality)}</g>`,
    `<g data-cardinality="${e.id}" data-endpoint="target">${mark(e.bp, e.bs, e.targetCardinality)}</g>`,
  );
  const b = e.label;
  if (!b) continue;
  const x = b.horizontal ? b.x : b.x + LABEL,
    y = b.horizontal ? b.y + LABEL : b.y + b.height;
  body.push(
    `<g data-edge-label="${e.id}"><rect x="${b.x - 2}" y="${b.y - 2}" width="${b.width + 4}" height="${b.height + 4}" fill="white"/>${text(e.role, x, y, LABEL, false, b.horizontal ? "" : `transform="rotate(-90 ${x} ${y})"`)}</g>`,
  );
}
const common = body.join("\n");
for (const t of m.tiles) {
  let overlay = "";
  for (const b of portBoxes.filter((b) => b.tile === t.id))
    overlay += `<g data-stitch="${b.id}" data-edge="${b.edgeId}" data-tile="${b.tile}" data-neighbor="${b.neighbor}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white"/>${text(b.id.slice(1), b.x + b.width / 2, b.y + 17, LABEL, false, 'text-anchor="middle"')}</g>`;
  const svg = svgDoc(t, common + overlay);
  await writeFile(path.join(dir, `04-er-complete-${t.id}.svg`), svg);
  await sharp(Buffer.from(svg))
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(dir, `04-er-complete-${t.id}.png`));
}
const full = svgDoc({ x: 0, y: 0, width: W, height: H }, common);
await writeFile(path.join(dir, "04-er-complete.svg"), full);
await sharp(Buffer.from(full))
  .resize({ width: 1889 })
  .withMetadata({ density: 300 })
  .png()
  .toFile(path.join(dir, "04-er-complete.png"));
const dot = ["digraph ER {", "  node [shape=box];"];
for (const n of m.nodes)
  dot.push(
    `  ${n.id} [label=${JSON.stringify([n.title, ...n.fields].join("\n"))}];`,
  );
for (const e of m.edges)
  dot.push(
    `  ${e.source} -> ${e.target} [id="${e.id}",label=${JSON.stringify(e.role)},taillabel="${e.sourceCardinality}",headlabel="${e.targetCardinality}",dir=none];`,
  );
dot.push("}");
await writeFile(path.join(dir, "04-er-complete.dot"), dot.join("\n") + "\n");
m.geometry = {
  portBoxes,
  crossings,
  labelBoxes,
  markerBoxes,
  relationships: m.edges.map(({ id, ap, bp, as, bs, points, label }) => ({
    id,
    ap,
    bp,
    as,
    bs,
    points,
    label,
  })),
};
await writeFile(
  path.join(dir, "er-model.json"),
  JSON.stringify(m, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    entities: m.nodes.length,
    relations: m.edges.length,
    crossings: crossings.length,
    unlabelled: m.edges.filter((e) => !e.label).map((e) => e.id),
    fontPt: ((FONT * 160) / W / 25.4) * 72,
    tiles: m.tiles.map((t) => ({
      id: t.id,
      widthMm: 160,
      heightMm: (t.height * 160) / W,
    })),
  }),
);

// The two former extra fragments are obsolete; keep the generated catalog exact.
for (const tile of ["3", "4"])
  for (const extension of ["svg", "png"])
    await unlink(path.join(dir, `04-er-complete-${tile}.${extension}`)).catch(
      (error) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
