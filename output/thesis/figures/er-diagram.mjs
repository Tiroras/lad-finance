/** Render one complete logical ER model as four matching A4 fragments (2 × 2). */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const dir = path.dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(await readFile(path.join(dir, "er-model.json"), "utf8"));
m.edges.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
const nodes = new Map(m.nodes.map((n) => [n.id, n]));
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const text = (s, x, y, size = 11, bold = false, anchor = "start") =>
  `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ""} text-anchor="${anchor}">${esc(s)}</text>`;
const wrap = (s, max = 27) => {
  const a = [];
  let l = "";
  for (const word of s.split(" ")) {
    if ((l + " " + word).trim().length > max && l) {
      a.push(l);
      l = word;
    } else l = (l + " " + word).trim();
  }
  if (l) a.push(l);
  return a;
};
const visible = m.edges;
const vector = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
const ports = new Map(
  m.nodes.map((n) => [n.id, { top: [], bottom: [], left: [], right: [] }]),
);
for (const e of visible) {
  const a = nodes.get(e.source),
    b = nodes.get(e.target),
    dx = b.x - a.x,
    dy = b.y - a.y;
  if (e.source === e.target) {
    e.as = "right";
    e.bs = "right";
  } else if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    e.as = dx > 0 ? "right" : "left";
    e.bs = dx > 0 ? "left" : "right";
  } else {
    e.as = dy > 0 ? "bottom" : "top";
    e.bs = dy > 0 ? "top" : "bottom";
  }
  ports.get(e.source)[e.as].push({ e, which: "a", other: b });
  ports.get(e.target)[e.bs].push({ e, which: "b", other: a });
}
for (const n of m.nodes)
  for (const side of ["top", "bottom", "left", "right"]) {
    const list = ports.get(n.id)[side];
    list.sort(
      (a, b) =>
        (["top", "bottom"].includes(side)
          ? a.other.x - b.other.x
          : a.other.y - b.other.y) || a.e.id.localeCompare(b.e.id),
    );
    list.forEach((p, i) => {
      const f = (i + 1) / (list.length + 1);
      let x, y;
      if (side === "top" || side === "bottom") {
        x = n.x + 16 + (n.width - 32) * f;
        y = n.y + (side === "bottom" ? n.height : 0);
      } else {
        x = n.x + (side === "right" ? n.width : 0);
        y = n.y + 13 + (n.height - 26) * f;
      }
      p.e[p.which + "p"] = [Math.round(x), Math.round(y)];
    });
  }
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
  W = 227,
  H = 291,
  key = (x, y) => y * W + x;
const blocked = new Set(),
  used = new Map();
for (const n of m.nodes)
  for (
    let y = Math.floor((n.y - 5) / STEP);
    y <= Math.ceil((n.y + n.height + 5) / STEP);
    y++
  )
    for (
      let x = Math.floor((n.x - 5) / STEP);
      x <= Math.ceil((n.x + n.width + 5) / STEP);
      x++
    )
      blocked.add(key(x, y));
const seams = new Map(),
  crossings = [];
for (const e of visible) {
  e.stitches = [];
  for (let i = 1; i < e.tilePath.length; i++) {
    const pair = [e.tilePath[i - 1], e.tilePath[i]].sort((a, b) => a - b),
      k = pair.join("-");
    if (!seams.has(k)) seams.set(k, []);
    const c = { edgeId: e.id, tiles: pair.map(String), order: i - 1 };
    seams.get(k).push(c);
    e.stitches.push(c);
  }
}
for (const [k, cs] of seams) {
  const [a, b] = k.split("-").map(Number),
    vertical = b - a === 1,
    offset = vertical ? (a > 2 ? 582 : 0) : a === 2 ? 454 : 0;
  cs.sort((a, b) => {
    const ea = visible.find((e) => e.id === a.edgeId),
      eb = visible.find((e) => e.id === b.edgeId),
      axis = vertical ? "y" : "x";
    return (
      nodes.get(ea.source)[axis] +
      nodes.get(ea.target)[axis] -
      (nodes.get(eb.source)[axis] + nodes.get(eb.target)[axis])
    );
  });
  cs.forEach((c, i) => {
    const along =
      offset +
      (vertical ? 85 : 60) +
      (i * (vertical ? 420 : 334)) / Math.max(1, cs.length - 1);
    c.axis = vertical ? 0 : 1;
    c.point = vertical ? [454, Math.round(along)] : [Math.round(along), 582];
    crossings.push(c);
  });
}
crossings.sort(
  (a, b) => a.axis - b.axis || a.point[1 - a.axis] - b.point[1 - b.axis],
);
crossings.forEach((c, i) => {
  c.id = "L" + String(i + 1).padStart(2, "0");
});
const portBoxes = [];
for (const c of crossings) {
  const [x, y] = c.point;
  for (let side = 0; side < 2; side++) {
    const tx = c.axis === 0 ? x + (side ? 24 : -24) : x,
      ty = c.axis === 0 ? y : y + (side ? 20 : -20);
    portBoxes.push({
      id: c.id,
      edgeId: c.edgeId,
      tile: c.tiles[side],
      neighbor: c.tiles[1 - side],
      x: tx - 15,
      y: ty - 12,
      width: 30,
      height: 24,
    });
  }
}
const portBlocks = new Map();
for (const box of portBoxes)
  for (
    let y = Math.floor((box.y - 2) / STEP);
    y <= Math.ceil((box.y + box.height + 2) / STEP);
    y++
  )
    for (
      let x = Math.floor((box.x - 2) / STEP);
      x <= Math.ceil((box.x + box.width + 2) / STEP);
      x++
    ) {
      const k = key(x, y);
      if (!portBlocks.has(k)) portBlocks.set(k, new Set());
      portBlocks.get(k).add(box.edgeId);
    }
function routePart(startPoint, endPoint, tileId, edgeId) {
  const aa = startPoint.map((v) => Math.round(v / STEP)),
    bb = endPoint.map((v) => Math.round(v / STEP)),
    start = key(...aa),
    end = key(...bb),
    open = new Heap(),
    best = new Map();
  open.push({ x: aa[0], y: aa[1], g: 0, f: 0, dir: -1, prev: null });
  best.set(start, 0);
  let fin,
    guard = 0;
  const tile = m.tiles.find((t) => t.id === String(tileId));
  while (open.length && guard++ < 180000) {
    const cur = open.pop();
    if (cur.x === bb[0] && cur.y === bb[1]) {
      fin = cur;
      break;
    }
    for (const [d, [dx, dy]] of [
      [1, [1, 0]],
      [2, [-1, 0]],
      [3, [0, 1]],
      [4, [0, -1]],
    ]) {
      const x = cur.x + dx,
        y = cur.y + dy,
        k = key(x, y),
        pb = portBlocks.get(k);
      if (
        x * STEP < tile.x + 4 ||
        x * STEP > tile.x + tile.width - 4 ||
        y * STEP < tile.y + 4 ||
        y * STEP > tile.y + tile.height - 4 ||
        ((blocked.has(k) || (pb && [...pb].some((id) => id !== edgeId))) &&
          k !== start &&
          k !== end)
      )
        continue;
      const g =
        cur.g +
        1 +
        (cur.dir !== -1 && d !== cur.dir ? 4 : 0) +
        (used.get(k) || 0) * 20;
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
  if (!fin)
    throw new Error(
      "No route " +
        edgeId +
        " tile " +
        tileId +
        " " +
        startPoint +
        " " +
        endPoint,
    );
  const grid = [];
  for (let c = fin; c; c = c.prev) {
    grid.unshift([c.x * STEP, c.y * STEP]);
    const k = key(c.x, c.y);
    used.set(k, (used.get(k) || 0) + 1);
  }
  return grid;
}
function route(e) {
  const a = e.ap,
    b = e.bp,
    va = vector[e.as],
    vb = vector[e.bs],
    aa = [a[0] + va[0] * 16, a[1] + va[1] * 16],
    bb = [b[0] + vb[0] * 16, b[1] + vb[1] * 16],
    p = [a, [a[0] + va[0] * 10, a[1] + va[1] * 10]];
  let current = aa;
  for (let i = 0; i < e.stitches.length; i++) {
    const c = e.stitches[i],
      tile = e.tilePath[i],
      side = c.tiles.indexOf(String(tile)),
      before = [...c.point],
      after = [...c.point];
    before[c.axis] += (side ? 1 : -1) * 8;
    after[c.axis] += (side ? -1 : 1) * 8;
    p.push(...routePart(current, before, tile, e.id), before, c.point, after);
    current = after;
  }
  p.push(
    ...routePart(current, bb, e.tilePath.at(-1), e.id),
    [b[0] + vb[0] * 10, b[1] + vb[1] * 10],
    b,
  );
  return p.filter(
    (v, i) =>
      i === 0 ||
      i === p.length - 1 ||
      !(
        (p[i - 1][0] === v[0] && p[i + 1][0] === v[0]) ||
        (p[i - 1][1] === v[1] && p[i + 1][1] === v[1])
      ),
  );
}
visible.sort(
  (a, b) =>
    a.stitches.length - b.stitches.length ||
    Math.abs(nodes.get(a.source).x - nodes.get(a.target).x) +
      Math.abs(nodes.get(a.source).y - nodes.get(a.target).y) -
      Math.abs(nodes.get(b.source).x - nodes.get(b.target).x) -
      Math.abs(nodes.get(b.source).y - nodes.get(b.target).y),
);
for (const e of visible) e.points = route(e);
function mark(point, side, card) {
  const [vx, vy] = vector[side],
    per = [-vy, vx],
    q = (along, cross) => [
      point[0] + vx * along + per[0] * cross,
      point[1] + vy * along + per[1] * cross,
    ];
  const line = (a, b) =>
    `<path d="M${a.join(" ")} L${b.join(" ")}" fill="none" stroke="#111" stroke-width="1"/>`;
  let s = "";
  if (card.includes("*"))
    s += line(q(9, 0), q(0, 4.5)) + line(q(9, 0), q(0, -4.5));
  else s += line(q(4, -4), q(4, 4));
  if (card.startsWith("0"))
    s += `<circle cx="${q(12, 0)[0]}" cy="${q(12, 0)[1]}" r="2.8" fill="white" stroke="#111" stroke-width="1"/>`;
  else s += line(q(11, -4), q(11, 4));
  return s;
}
const body = [];
for (const e of visible) {
  const d = e.points.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  body.push(
    `<g data-relation="${e.id}" data-source="${e.source}" data-target="${e.target}" data-role="${esc(e.role)}"><title>${esc(e.source + " " + e.sourceCardinality + " — " + e.role + " — " + e.targetCardinality + " " + e.target)}</title><path d="${d}" fill="none" stroke="white" stroke-width="3.4"/><path d="${d}" fill="none" stroke="#222" stroke-width=".9"${e.kind === "soft" ? ' stroke-dasharray="4 3"' : ""}/></g>`,
  );
}
for (const n of m.nodes) {
  body.push(
    `<g data-entity="${n.id}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="white" stroke="#111" stroke-width="1"/>`,
  );
  let y = n.y + 14;
  const title = n.id === "Profile" ? "Профиль · ключ id" : n.title;
  for (const l of wrap(title, 25)) {
    body.push(text(l, n.x + 7, y, 11, true));
    y += 13;
  }
  if (n.id !== "Profile") {
    body.push(
      `<path d="M${n.x} ${y - 7} H${n.x + n.width}" stroke="#777" stroke-width=".5"/>`,
    );
    y += 5;
    for (const l of wrap("Ключ: " + n.key, n.width < 150 ? 23 : 25)) {
      body.push(text(l, n.x + 7, y));
      y += 13;
    }
    const fields =
      n.id === "Currency"
        ? ["Общий справочник", "точность; обозначение"]
        : n.fields;
    for (const f of fields)
      for (const l of wrap(f, 27)) {
        body.push(text(l, n.x + 7, y));
        y += 13;
      }
  }
  if (y > n.y + n.height + 6)
    throw new Error("Node text overflow " + n.id + " " + y);
  body.push("</g>");
}
for (const e of visible)
  body.push(
    mark(e.ap, e.as, e.sourceCardinality),
    mark(e.bp, e.bs, e.targetCardinality),
  );
// Role labels for parallel and conditional relationships only; names imply other roles.
const labelRoles = new Set([
  "основной",
  "получатель",
  "откуда",
  "куда",
  "плательщик",
  "исходный",
  "основная",
  "исходная",
  "получателя",
  "опорный доход",
  "ежедневный",
  "возврат",
  "родитель",
  "источник XOR",
  "расход оплаты",
  "перевод",
]);
for (const e of visible) {
  if (!labelRoles.has(e.role)) continue;
  let best;
  for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1],
      b = e.points[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (
      a[1] === b[1] &&
      len > e.role.length * 6 + 12 &&
      (!best || len > best.len)
    )
      best = { len, x: (a[0] + b[0]) / 2, y: a[1] };
  }
  if (e.id === "R10") best = { x: 518, y: 876 };
  if (best) {
    const w = e.role.length * 5.5 + 8;
    body.push(
      `<g data-edge-label="${e.id}"><rect x="${best.x - w / 2}" y="${best.y - 13}" width="${w}" height="13" fill="white"/>${text(e.role, best.x, best.y - 3, 11, false, "middle")}</g>`,
    );
  }
}
body.push('<g data-role="legend">');
for (const [x, card, label] of [
  [24, "1", "1 (ровно один)"],
  [184, "0..1", "0..1"],
  [306, "0..*", "0..*"],
]) {
  body.push(
    `<path d="M${x} 18 H${x + 28}" fill="none" stroke="#111" stroke-width=".9"/>`,
    mark([x + 28, 18], "left", card),
    text(label, x + 39, 22),
  );
}
body.push(text("Все записи, кроме валют, относятся к одному профилю.", 24, 39));
body.push(text("L01 / А.2 — продолжение связи на рисунке А.2.", 24, 55));
body.push("</g>");
const common = body.join("\n");
function documentSvg(view, overlay = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}"><title>Общая ER-модель приложения Лад${view.id ? " · фрагмент " + view.id : ""}</title><rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="white"/><g font-family="Arial, sans-serif" fill="#111">${common}${overlay}</g></svg>`;
}
let fullOverlay = "";
for (const tile of m.tiles) {
  let overlay = "";
  for (const box of portBoxes.filter((b) => b.tile === tile.id)) {
    const tx = box.x + 15,
      ty = box.y + 12;
    overlay += `<g data-stitch="${box.id}" data-edge="${box.edgeId}" data-tile="${tile.id}" data-neighbor="${box.neighbor}"><rect x="${box.x}" y="${box.y}" width="30" height="24" fill="white" stroke="#222" stroke-width=".7"/>${text(box.id, tx, ty - 1, 11, true, "middle")}${text("А." + box.neighbor, tx, ty + 10, 11, false, "middle")}</g>`;
  }
  const svg = documentSvg(tile, overlay);
  await writeFile(path.join(dir, `04-er-complete-${tile.id}.svg`), svg);
  await sharp(Buffer.from(svg))
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(dir, `04-er-complete-${tile.id}.png`));
  fullOverlay += overlay;
  tile.nodes = m.nodes
    .filter(
      (n) =>
        n.x >= tile.x &&
        n.y >= tile.y &&
        n.x + n.width <= tile.x + tile.width &&
        n.y + n.height <= tile.y + tile.height,
    )
    .map((n) => n.id);
}
const full = documentSvg({ x: 0, y: 0, width: 908, height: 1164 }, fullOverlay);
await writeFile(path.join(dir, "04-er-complete.svg"), full);
await sharp(Buffer.from(full))
  .resize({ width: 3778 })
  .withMetadata({ density: 300 })
  .png()
  .toFile(path.join(dir, "04-er-complete.png"));
const dot = ["digraph ER { node [shape=box];"];
for (const n of m.nodes)
  dot.push(`${n.id} [label=${JSON.stringify(n.title + "\\nКлюч: " + n.key)}];`);
for (const e of m.edges)
  dot.push(
    `${e.source} -> ${e.target} [label=${JSON.stringify(e.sourceCardinality + " " + e.role + " " + e.targetCardinality)},dir=none];`,
  );
dot.push("}");
await writeFile(path.join(dir, "04-er-complete.dot"), dot.join("\n") + "\n");
m.geometry = {
  portBoxes,
  relationships: visible.map(({ id, ap, bp, as, bs, points }) => ({
    id,
    ap,
    bp,
    as,
    bs,
    points,
  })),
  crossings,
};
await writeFile(
  path.join(dir, "er-model.json"),
  JSON.stringify(m, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    entities: m.nodes.length,
    relations: visible.length,
    crossings: crossings.length,
    tiles: m.tiles.map((t) => ({ id: t.id, nodes: t.nodes.length })),
    sizeMm: "320×410",
    tileMm: "160×205",
    minFontPt: ((11 * 320) / 908 / 25.4) * 72,
  }),
);
