/**
 * Render detailed UML views from the canonical semantic/geometry manifest.
 * SVG and PNG preserve publication geometry; PlantUML preserves the UML model.
 * Run with bundled Node and THESIS_SHARP_PATH, at a print width of 160 mm.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const directory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(directory, "use-case-models.json"), "utf8"),
);
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function text(lines, x, y, size = 30, bold = false, anchor = "middle") {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * (size + 6) + size * 0.34}" font-size="${size}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ""}>${escape(line)}</text>`,
    )
    .join("\n");
}
function svgFor(m) {
  const b = m.boundary;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}">`,
    `<title>${escape(m.title)}</title>`,
    `<rect width="${m.width}" height="${m.height}" fill="white"/>`,
    '<defs><marker id="open-arrow" markerWidth="18" markerHeight="16" refX="16" refY="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 1 L 16 8 L 2 15" fill="none" stroke="#111" stroke-width="2.3"/></marker><marker id="generalization-arrow" markerWidth="23" markerHeight="22" refX="21" refY="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 21 11 L 1 21 Z" fill="white" stroke="#111" stroke-width="2.3"/></marker></defs>',
    '<g font-family="Arial, sans-serif" fill="#111">',
    `<rect data-role="system-boundary" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white" stroke="#111" stroke-width="2"/>`,
    text(["Мобильное приложение «Лад»"], b.x + 20, b.y + 30, 30, true, "start"),
  ];
  for (const e of m.edges) {
    const style =
      e.kind === "association"
        ? ""
        : e.kind === "generalization"
          ? ' marker-end="url(#generalization-arrow)"'
          : ' stroke-dasharray="10 7" marker-end="url(#open-arrow)"';
    svg.push(
      `<path data-from="${e.from}" data-to="${e.to}" data-relation="${e.kind}" d="${e.d}" fill="none" stroke="#111" stroke-width="2.3"${style}/>`,
    );
  }
  for (const n of m.nodes) {
    svg.push(
      `<g id="${n.id}" data-id="${n.id}" data-role="usecase" data-primary="${n.primary}" data-title="${escape(n.displayTitle)}">`,
      `<ellipse cx="${n.x}" cy="${n.y}" rx="${n.rx}" ry="${n.ry}" fill="white" stroke="#111" stroke-width="2.3"/>`,
      text(n.label, n.x, n.labelY ?? n.y, n.fontSize),
      "</g>",
    );
    if (n.extensionPoint) {
      const e = n.extensionPoint,
        half = n.rx * Math.sqrt(1 - ((e.dividerY - n.y) / n.ry) ** 2);
      svg.push(
        `<g data-role="extension-point" data-owner="${n.id}" data-name="${escape(e.name)}">`,
        `<path d="M ${n.x - half} ${e.dividerY} H ${n.x + half}" fill="none" stroke="#111" stroke-width="1.5"/>`,
        text(e.label, e.x, e.y, e.fontSize),
        "</g>",
      );
    }
  }
  for (const e of m.edges)
    if (e.label?.length)
      svg.push(
        `<g data-role="relation-label" data-from="${e.from}" data-to="${e.to}">`,
        text(e.label, e.labelX, e.labelY, e.fontSize),
        "</g>",
      );
  for (const e of m.edges) {
    const condition = e.conditionLabel;
    if (condition)
      svg.push(
        `<g data-role="condition-label" data-from="${e.from}" data-to="${e.to}">`,
        text(condition.label, condition.x, condition.y, condition.fontSize),
        "</g>",
      );
  }
  const a = m.actor;
  svg.push(
    '<g id="Owner" data-role="actor">',
    `<g fill="none" stroke="#111" stroke-width="2.5"><circle cx="${a.x}" cy="${a.y - 43}" r="20"/><path d="M ${a.x} ${a.y - 23} V ${a.y + 45} M ${a.x - 40} ${a.y} H ${a.x + 40} M ${a.x} ${a.y + 45} L ${a.x - 35} ${a.y + 90} M ${a.x} ${a.y + 45} L ${a.x + 35} ${a.y + 90}"/></g>`,
    text(a.label, a.x, a.y + 137, 30),
    "</g></g></svg>\n",
  );
  return svg.join("\n");
}
function pumlFor(m) {
  const lines = [
    "@startuml",
    "skinparam monochrome true",
    "skinparam shadowing false",
    "skinparam defaultFontName Arial",
    "skinparam defaultFontSize 16",
    'actor "Владелец учёта" as Owner',
    'rectangle "Мобильное приложение Лад" {',
  ];
  for (const n of m.nodes) {
    const parts = [...n.label];
    if (n.extensionPoint) parts.push("--", ...n.extensionPoint.label);
    lines.push(`  usecase "${parts.join("\\n")}" as ${n.id}`);
  }
  lines.push("}");
  for (const e of m.edges) {
    lines.push(
      e.kind === "association"
        ? `${e.from} -- ${e.to}`
        : e.kind === "generalization"
          ? `${e.from} --|> ${e.to}`
          : `${e.from} ..> ${e.to} : <<${e.kind}>>${e.condition ? `\\n[${e.condition.replaceAll("\n", "\\n")}]` : ""}`,
    );
  }
  lines.push("@enduml", "");
  return lines.join("\n");
}
for (const m of manifest.models) {
  const ids = new Set(["Owner", ...m.nodes.map((n) => n.id)]);
  if (m.edges.some((e) => !ids.has(e.from) || !ids.has(e.to)))
    throw new Error(`${m.name}: unknown endpoint`);
  if (
    m.nodes.some((n) => n.fontSize < 30) ||
    m.edges.some((e) => e.label?.length && e.fontSize < 30)
  )
    throw new Error(`${m.name}: print text too small`);
  if (m.nodes.some((n) => n.label.join(" ") !== n.displayTitle))
    throw new Error(`${m.name}: incomplete use-case title`);
  const svg = svgFor(m);
  await writeFile(path.join(directory, `${m.name}.svg`), svg);
  await writeFile(path.join(directory, `${m.name}.puml`), pumlFor(m));
  await sharp(Buffer.from(svg), { density: 144 })
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(directory, `${m.name}.png`));
  console.log(
    `${m.name}: ${m.nodes.length} ovals; ${m.edges.length} relationships; 160 × ${((m.height * 160) / m.width).toFixed(1)} mm`,
  );
}
