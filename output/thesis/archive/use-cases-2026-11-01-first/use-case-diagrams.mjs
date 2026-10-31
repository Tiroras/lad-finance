/** Publication layout for six UML models at 160 mm in the thesis.
 * PlantUML owns labels, groups, actors and relations; @row comments own layout.
 * THESIS_SHARP_PATH selects Sharp from the external document runtime.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const directory = path.dirname(fileURLToPath(import.meta.url));
const names = [
  "02-use-cases-security",
  "02-use-cases-ledger",
  "02-use-cases-budgets-goals",
  "03-use-cases-planning",
  "03-use-cases-forecast",
  "03-use-cases-analysis",
];
const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function readModel(source, name) {
  const groups = [],
    nodes = new Map();
  let group;
  for (const line of source.split("\n")) {
    const heading = line.match(/^  package "([^"]+)" as (U\d+) \{/);
    if (heading) {
      group = { id: heading[2], title: heading[1].split("\\n"), rows: [] };
      groups.push(group);
    }
    const node = line.match(/^    usecase "([^"]+)" as (\w+)/);
    if (node) nodes.set(node[2], node[1].split("\\n"));
    const row = line.match(/^    ' @row (\w+)(?: (\w+))?$/);
    if (row) group.rows.push([row[1], row[2]].filter(Boolean));
  }
  const associations = [...source.matchAll(/^Owner -- (\w+)$/gm)].map(
    (m) => m[1],
  );
  const relations = [
    ...source.matchAll(/^(\w+) \.\.> (\w+) : <<(include|extend)>>$/gm),
  ].map(([, from, to, type]) => ({ from, to, type }));
  const placed = groups.flatMap((g) => g.rows.flat());
  if (
    !groups.length ||
    new Set(placed).size !== nodes.size ||
    placed.length !== nodes.size ||
    placed.some((id) => !nodes.has(id)) ||
    associations.length !== groups.reduce((sum, g) => sum + g.rows.length, 0)
  ) {
    throw new Error(`${name}: incomplete or duplicate layout`);
  }
  for (const row of groups.flatMap((g) => g.rows)) {
    if (!associations.includes(row[0]))
      throw new Error(`${name}: missing actor association`);
    const edges = relations.filter(
      (r) => row.includes(r.from) && row.includes(r.to),
    );
    if (
      edges.length !== row.length - 1 ||
      edges.some((r) =>
        r.type === "include" ? r.from !== row[0] : r.to !== row[0],
      )
    ) {
      throw new Error(`${name}: invalid relationship or direction`);
    }
  }
  if (relations.length !== placed.length - associations.length)
    throw new Error(`${name}: an unrendered relationship`);
  return { groups, nodes, associations, relations };
}

function label(lines, x, y, size = 32, bold = false) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * (size + 5) + size * 0.34}" font-size="${size}"${bold ? ' font-weight="bold"' : ""}>${escape(line)}</text>`,
    )
    .join("\n");
}

const summary = [];
for (const name of names) {
  const model = readModel(
    await readFile(path.join(directory, `${name}.puml`), "utf8"),
    name,
  );
  const positions = new Map();
  let top = 70;
  for (const group of model.groups) {
    group.top = top;
    const headingHeight = 32 + group.title.length * 38;
    group.height = headingHeight + group.rows.length * 174 + 18;
    group.rows.forEach((row, i) =>
      row.forEach((id, j) =>
        positions.set(id, {
          x: j ? 960 : 410,
          y: top + headingHeight + 87 + i * 174,
        }),
      ),
    );
    top += group.height + 26;
  }
  const height = top + 3,
    actorY = Math.round(height / 2);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">`,
    `<rect width="1200" height="${height}" fill="white"/>`,
    '<defs><marker id="open-arrow" markerWidth="13" markerHeight="11" refX="11" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 5.5 L 1 10" fill="none" stroke="#222" stroke-width="1.8"/></marker></defs>',
    '<g font-family="Arial, sans-serif" fill="#111" text-anchor="middle">',
    `<rect x="185" y="10" width="1000" height="${height - 20}" fill="white" stroke="#222" stroke-width="2"/>`,
    label(["Лад"], 685, 38, 32, true),
  ];
  for (const group of model.groups) {
    svg.push(
      `<rect x="205" y="${group.top}" width="960" height="${group.height}" fill="white" stroke="#888" stroke-width="1.5"/>`,
      `<g id="${group.id}" data-role="requirement">`,
      label(
        group.title,
        685,
        group.top + 25 + group.title.length * 19,
        32,
        true,
      ),
      "</g>",
    );
  }
  for (const id of model.associations) {
    const { x, y } = positions.get(id);
    svg.push(
      `<path data-from="Owner" data-to="${id}" data-relation="association" d="M 123 ${actorY} C 166 ${actorY}, 171 ${y}, ${x - 185} ${y}" fill="none" stroke="#444" stroke-width="1.6"/>`,
    );
  }
  for (const { from, to, type } of model.relations) {
    const start = positions.get(from),
      end = positions.get(to),
      direction = Math.sign(end.x - start.x);
    const x1 = start.x + direction * 185,
      x2 = end.x - direction * 185;
    svg.push(
      `<path data-from="${from}" data-to="${to}" data-relation="${type}" d="M ${x1} ${start.y} L ${x2} ${end.y}" fill="none" stroke="#222" stroke-width="1.8" stroke-dasharray="8 6" marker-end="url(#open-arrow)"/>`,
      label([`«${type}»`], (x1 + x2) / 2, start.y - 25, 30),
    );
  }
  for (const [id, lines] of model.nodes) {
    const { x, y } = positions.get(id);
    svg.push(
      `<g id="${id}" data-role="action">`,
      `<ellipse cx="${x}" cy="${y}" rx="185" ry="69" fill="white" stroke="#222" stroke-width="2"/>`,
      label(lines, x, y),
      "</g>",
    );
  }
  svg.push(
    '<g id="Owner" fill="none" stroke="#222" stroke-width="2.5">',
    `<circle cx="80" cy="${actorY - 58}" r="22"/>`,
    `<path d="M 80 ${actorY - 36} V ${actorY + 37} M 37 ${actorY} H 123 M 80 ${actorY + 37} L 42 ${actorY + 94} M 80 ${actorY + 37} L 118 ${actorY + 94}"/>`,
    "</g>",
    label(["Владелец"], 80, actorY + 130, 30),
    "</g></svg>",
  );
  const image = svg.join("\n") + "\n";
  await writeFile(path.join(directory, `${name}.svg`), image);
  await sharp(Buffer.from(image), { density: 144 })
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(directory, `${name}.png`));
  summary.push({
    name,
    requirements: model.groups.map((g) => g.id),
    actions: model.nodes.size,
    relationships: model.relations.length,
    height_mm: +((height * 160) / 1200).toFixed(2),
  });
}
console.log(JSON.stringify(summary, null, 2));
