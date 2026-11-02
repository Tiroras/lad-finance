/** Deterministic publication layout for the conceptual domain UML models. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url),
  sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const prettier = require("prettier");
const oi = process.argv.indexOf("--output-dir"),
  outDir = oi < 0 ? sourceDir : path.resolve(process.argv[oi + 1]);
await mkdir(outDir, { recursive: true });
const model = JSON.parse(
  await readFile(path.join(sourceDir, "domain-models.json"), "utf8"),
);
const FONT = model.fontSize,
  LABEL = model.labelFontSize,
  LINE = 24;
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const cache = new Map();
async function measure(s, size = FONT, bold = false) {
  const k = [s, size, bold].join("|");
  if (cache.has(k)) return cache.get(k);
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
  const r = { width: info.width + 2, height: info.height };
  cache.set(k, r);
  return r;
}
async function wrap(s, width, bold = false) {
  const lines = [];
  for (const paragraph of s.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? line + " " + word : word;
      if (line && (await measure(next, FONT, bold)).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}
const segments = (points) => points.slice(1).map((p, i) => [points[i], p]);
function intersect(a, b, pad = 0) {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width > b.x - pad &&
    a.y < b.y + b.height + pad &&
    a.y + a.height > b.y - pad
  );
}
function hits(points, b, pad = 0) {
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
const unit = (a, b) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
};
function marker(e) {
  const p = e.kind === "composition" ? e.points[0] : e.points.at(-1),
    q = e.kind === "composition" ? e.points[1] : e.points.at(-2),
    v = unit(p, q),
    at = (s, t) => [p[0] + v[0] * s - v[1] * t, p[1] + v[1] * s + v[0] * t];
  if (e.kind === "composition")
    return {
      id: e.id,
      kind: "composition",
      points: [at(0, 0), at(10, 6), at(20, 0), at(10, -6)],
    };
  if (e.kind === "dependency")
    return {
      id: e.id,
      kind: "dependency-arrow",
      points: [at(13, 6), at(0, 0), at(13, -6)],
    };
  return null;
}
function text(s, x, y, size = FONT, bold = false, extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ""} ${extra}>${esc(s)}</text>`;
}
const reports = [];
for (const d of model.diagrams) {
  const labels = [],
    markers = d.edges.map(marker).filter(Boolean),
    issues = [];
  for (const n of d.nodes) {
    n.titleLines = await wrap(n.title, n.width - 20, true);
    n.attributeLines = [];
    for (let i = 0; i < n.attributes.length; i++)
      n.attributeLines.push({
        index: i,
        lines: await wrap(n.attributes[i], n.width - 20),
      });
    const rows =
        n.titleLines.length +
        n.attributeLines.reduce((s, a) => s + a.lines.length, 0),
      needed = rows * LINE + 20;
    if (needed > n.height && !n.context)
      issues.push(["text-height", n.id, needed, n.height]);
  }
  const markerBounds = markers.map((m) => ({
    x: Math.min(...m.points.map((p) => p[0])) - 1,
    y: Math.min(...m.points.map((p) => p[1])) - 1,
    width:
      Math.max(...m.points.map((p) => p[0])) -
      Math.min(...m.points.map((p) => p[0])) +
      2,
    height:
      Math.max(...m.points.map((p) => p[1])) -
      Math.min(...m.points.map((p) => p[1])) +
      2,
    id: m.id,
  }));
  async function place(e, kind, s) {
    const metrics = await measure(s, LABEL),
      w = metrics.width,
      h = LABEL + 2,
      candidates = [];
    const endpoint =
      kind === "sourceCardinality" || kind === "sourceRole"
        ? "source"
        : kind === "targetCardinality" || kind === "targetRole"
          ? "target"
          : null;
    const add = (cx, cy, score, inline = false) => {
      const b = {
        kind,
        text: s,
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
        center: [cx, cy],
        inline,
      };
      if (b.x < 3 || b.y < 3 || b.x + w > d.width - 3 || b.y + h > d.height - 3)
        return;
      if (
        d.nodes.some((n) => intersect(b, n, 3)) ||
        labels.some((l) => intersect(b, l, 4)) ||
        markerBounds.some((m) => intersect(b, m, 3))
      )
        return;
      if (
        d.edges.some(
          (other) => (other !== e || !inline) && hits(other.points, b, 4),
        )
      )
        return;
      candidates.push({ ...b, score });
    };
    if (e.labelPositions?.[kind]) {
      const [x, y] = e.labelPositions[kind];
      add(x, y, 10000);
    }
    if (endpoint) {
      const p = endpoint === "source" ? e.points[0] : e.points.at(-1),
        q = endpoint === "source" ? e.points[1] : e.points.at(-2),
        v = unit(p, q),
        per = [-v[1], v[0]];
      for (const along of [24, 38, 52, 66, 80])
        for (const side of [-1, 1])
          for (const offset of [16, 26, 38, 52])
            add(
              p[0] + v[0] * along + per[0] * side * offset,
              p[1] + v[1] * along + per[1] * side * offset,
              200 - along - offset * 0.6,
            );
    } else
      for (const [a, b] of segments(e.points)) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
          horizontal = a[1] === b[1];
        for (const f of [0.5, 0.25, 0.75]) {
          const cx = a[0] + (b[0] - a[0]) * f,
            cy = a[1] + (b[1] - a[1]) * f;
          for (const side of [-1, 1]) {
            if (horizontal) add(cx, cy + side * (h / 2 + 6), len);
            else add(cx + side * (w / 2 + 6), cy, len);
          }
          if (horizontal && len > w + 10) add(cx, cy, len - 60, true);
        }
      }
    if (!candidates.length) {
      issues.push(["missing-label", e.id, kind, s]);
      return null;
    }
    const chosen = candidates.sort((a, b) => b.score - a.score)[0];
    delete chosen.score;
    labels.push(chosen);
    return chosen;
  }
  for (const e of d.edges) {
    e.labels = [];
    for (const [kind, s] of [
      ["sourceCardinality", e.sourceCardinality],
      ["targetCardinality", e.targetCardinality],
      ["sourceRole", e.sourceRole],
      ["targetRole", e.targetRole],
      ["role", e.role],
    ])
      if (s) {
        const l = await place(e, kind, s);
        if (l) e.labels.push(l);
      }
  }
  for (const e of d.edges)
    for (const n of d.nodes) {
      if (n.id === e.source || n.id === e.target) continue;
      if (
        hits(e.points, {
          x: n.x + 1,
          y: n.y + 1,
          width: n.width - 2,
          height: n.height - 2,
        })
      )
        issues.push(["edge-node", e.id, n.id]);
    }
  const body = [];
  for (const e of d.edges) {
    const points = e.points.map((p) => p.join(",")).join(" ");
    body.push(
      `<g data-relation="${e.id}" data-source="${e.source}" data-target="${e.target}" data-kind="${e.kind}"><polyline points="${points}" fill="none" stroke="white" stroke-width="5.4"/><polyline points="${points}" fill="none" stroke="black" stroke-width="1.6"${e.kind === "dependency" ? ' stroke-dasharray="6 4"' : ""}/></g>`,
    );
  }
  for (const n of d.nodes) {
    body.push(
      `<g data-class="${n.id}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="white" stroke="black" stroke-width="1.6"/>`,
    );
    let y = n.y + 25;
    for (const line of n.titleLines) {
      body.push(
        text(
          line,
          n.x + n.width / 2,
          y,
          FONT,
          true,
          'text-anchor="middle" data-class-title="true"',
        ),
      );
      y += LINE;
    }
    if (n.attributes.length) {
      body.push(
        `<path d="M${n.x} ${y - 15} H${n.x + n.width}" stroke="black" stroke-width="1.2"/>`,
      );
      y += 6;
      for (const a of n.attributeLines)
        for (const line of a.lines) {
          body.push(
            text(line, n.x + 10, y, FONT, false, `data-attribute="${a.index}"`),
          );
          y += LINE;
        }
    }
    body.push("</g>");
  }
  for (const m of markers) {
    const points = m.points.map((p) => p.join(",")).join(" ");
    body.push(
      m.kind === "composition"
        ? `<g data-composition="${m.id}"><polygon points="${points}" fill="black" stroke="black" stroke-width="1.4"/></g>`
        : `<g data-dependency-arrow="${m.id}"><polyline points="${points}" fill="none" stroke="black" stroke-width="1.6"/></g>`,
    );
  }
  for (const e of d.edges)
    for (const l of e.labels)
      body.push(
        `<g data-label-relation="${e.id}"><rect x="${l.x - 1}" y="${l.y - 1}" width="${l.width + 2}" height="${l.height + 2}" fill="white"/>${text(l.text, l.center[0], l.center[1] + 6.5, LABEL, false, `text-anchor="middle" data-label-kind="${l.kind}"`)}</g>`,
      );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" data-diagram="${d.id}"><rect width="${d.width}" height="${d.height}" fill="white"/><g font-family="Arial" fill="black">${body.join("\n")}</g></svg>\n`;
  await writeFile(path.join(outDir, d.id + ".svg"), svg);
  await sharp(Buffer.from(svg))
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(outDir, d.id + ".png"));
  const pu = [
    "@startuml",
    "skinparam backgroundColor white",
    "skinparam shadowing false",
    "skinparam defaultFontName Arial",
    "skinparam defaultFontSize 20",
    "skinparam classAttributeIconSize 0",
    "hide circle",
    "hide methods",
  ];
  for (const n of d.nodes) {
    pu.push(`class "${n.title.replaceAll("\n", " ")}" as ${n.id} {`);
    for (const a of n.attributes) pu.push("  " + a);
    pu.push("}");
  }
  for (const e of d.edges)
    pu.push(
      e.kind === "dependency"
        ? `${e.source} ..> ${e.target}${e.role ? " : " + e.role : ""}`
        : `${e.source} "${e.sourceCardinality}" ${e.kind === "composition" ? "*--" : "--"} "${e.targetCardinality}" ${e.target}${[e.role, e.sourceRole, e.targetRole].filter(Boolean).length ? " : " + [e.role, e.sourceRole, e.targetRole].filter(Boolean).join(" / ") : ""}`,
    );
  pu.push("@enduml");
  await writeFile(path.join(outDir, d.id + ".puml"), pu.join("\n") + "\n");
  d.geometry = { markers, labels };
  reports.push({
    id: d.id,
    nodes: d.nodes.length,
    edges: d.edges.length,
    issues,
    widthMm: model.widthMm,
    heightMm: (d.height * model.widthMm) / d.width,
    fontPt: ((FONT * model.widthMm) / d.width / 25.4) * 72,
  });
}
await writeFile(
  path.join(outDir, "domain-models.json"),
  await prettier.format(JSON.stringify(model, null, 2), {
    ...((await prettier.resolveConfig(
      path.join(sourceDir, "domain-models.json"),
    )) || {}),
    parser: "json",
  }),
);
console.log(JSON.stringify(reports, null, 2));
