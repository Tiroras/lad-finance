/** Generate the functional tree, not the source-code directory structure. */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const directory = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(
  await readFile(path.join(directory, "structure-model.json"), "utf8"),
);
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const leafHeight = 86;
const leafGap = 10;
const groupGap = 30;
const margin = 20;
let cursor = margin;
const groups = model.subsystems.map((subsystem) => {
  const top = cursor;
  const height =
    subsystem.functions.length * leafHeight +
    (subsystem.functions.length - 1) * leafGap;
  cursor += height + groupGap;
  return {
    ...subsystem,
    y: top + height / 2,
    functions: subsystem.functions.map((item, index) => ({
      ...item,
      y: top + leafHeight / 2 + index * (leafHeight + leafGap),
    })),
  };
});
const height = cursor - groupGap + margin;
const nodes = [
  { ...model.root, x: 10, y: height / 2, width: 330, height: 180, level: 0 },
  ...groups.map((group) => ({
    ...group,
    x: 460,
    width: 360,
    height: 120,
    level: 1,
  })),
  ...groups.flatMap((group) =>
    group.functions.map((item) => ({
      ...item,
      x: 890,
      width: 500,
      height: leafHeight,
      level: 2,
    })),
  ),
];
if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
  throw new Error("Duplicate node identifiers");
if (nodes.some((node) => node.label.join(" ") !== node.title))
  throw new Error("Incomplete node title");
if ((((model.fontSize * model.printWidthMm) / model.width) * 72) / 25.4 < 11)
  throw new Error("Print font below 11 points");
if ((height * model.printWidthMm) / model.width > 220)
  throw new Error("Figure height exceeds A4 limit");
const edges = [];
for (const group of groups) {
  edges.push({
    from: model.root.id,
    to: group.id,
    d: `M 340 ${height / 2} H 395 V ${group.y} H 460`,
  });
  for (const item of group.functions)
    edges.push({
      from: group.id,
      to: item.id,
      d: `M 820 ${group.y} H 855 V ${item.y} H 890`,
    });
}
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${model.width}" height="${height}" viewBox="0 0 ${model.width} ${height}">`,
  `<title>${escape(model.title)}</title>`,
  `<rect width="${model.width}" height="${height}" fill="white"/>`,
  '<g fill="none" stroke="#333" stroke-width="2">',
  ...edges.map(
    (edge) =>
      `<path data-from="${edge.from}" data-to="${edge.to}" d="${edge.d}"/>`,
  ),
  '</g><g font-family="Arial, sans-serif" fill="#111">',
];
for (const node of nodes) {
  svg.push(
    `<g id="${node.id}" data-level="${node.level}" data-title="${escape(node.title)}">`,
    `<rect x="${node.x}" y="${node.y - node.height / 2}" width="${node.width}" height="${node.height}" fill="white" stroke="#333" stroke-width="2"/>`,
  );
  node.label.forEach((line, i) =>
    svg.push(
      `<text x="${node.x + node.width / 2}" y="${node.y + (i - (node.label.length - 1) / 2) * 40 + model.fontSize * 0.34}" font-size="${model.fontSize}" text-anchor="middle"${node.level < 2 ? ' font-weight="bold"' : ""}>${escape(line)}</text>`,
    ),
  );
  svg.push("</g>");
}
svg.push("</g></svg>\n");
const svgText = svg.join("\n");
const puml = [
  "@startmindmap",
  "skinparam monochrome true",
  "skinparam backgroundColor white",
  "skinparam shadowing false",
  "skinparam defaultFontName Arial",
  "skinparam defaultFontSize 24",
  "",
  `* ${model.root.title}`,
];
for (const group of groups) {
  puml.push(`** ${group.title}`);
  for (const item of group.functions) puml.push(`*** ${item.title}`);
}
puml.push("@endmindmap", "");
await writeFile(path.join(directory, "06-structure.svg"), svgText);
await writeFile(path.join(directory, "06-structure.puml"), puml.join("\n"));
await sharp(Buffer.from(svgText), { density: 144 })
  .resize({ width: 1889 })
  .withMetadata({ density: 300 })
  .png()
  .toFile(path.join(directory, "06-structure.png"));
console.log(
  `${nodes.length} nodes; ${edges.length} tree edges; ${model.printWidthMm} × ${((height * model.printWidthMm) / model.width).toFixed(1)} mm; ${((((model.fontSize * model.printWidthMm) / model.width) * 72) / 25.4).toFixed(2)} pt`,
);
