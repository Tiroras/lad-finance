/** Nine use cases, presented as three UML views at a print width of 160 mm.
 * This source owns model semantics and publication geometry; it emits JSON,
 * PlantUML, SVG and 300 dpi PNG. Use bundled Node and THESIS_SHARP_PATH.
 */
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const sharp = require(process.env.THESIS_SHARP_PATH || "sharp");
const directory = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1200,
  FONT = 32,
  SMALL = 30;
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const usecase = (number, title, lines, x, y, rx = 190, ry = 95) => ({
  id: `U${number}`,
  uc: `UC-${String(number).padStart(2, "0")}`,
  title,
  label: [`UC-${String(number).padStart(2, "0")}`, ...lines],
  x,
  y,
  rx,
  ry,
  fontSize: FONT,
  shape: "usecase",
});
const actor = (y) => ({
  id: "Owner",
  title: "Владелец учёта",
  label: ["Владелец", "учёта"],
  x: 100,
  y,
});
const edge = (from, to, kind, d, label = [], labelX, labelY) => ({
  from,
  to,
  kind,
  d,
  label,
  ...(label.length ? { labelX, labelY, fontSize: SMALL } : {}),
});
const transactions = {
  name: "02-use-cases-transactions",
  kind: "use-case",
  title: "Финансовые операции и накопления",
  width: WIDTH,
  height: 860,
  boundary: { x: 230, y: 20, width: 960, height: 820 },
  actor: actor(410),
  nodes: [
    usecase(
      1,
      "Записать финансовую операцию",
      ["Записать финансовую", "операцию"],
      950,
      200,
    ),
    usecase(
      2,
      "Записать перевод между счетами",
      ["Записать перевод", "между счетами"],
      950,
      650,
    ),
    usecase(3, "Учесть взнос в цель", ["Учесть взнос", "в цель"], 440, 200),
    usecase(4, "Учесть вывод из цели", ["Учесть вывод", "из цели"], 440, 650),
  ],
  edges: [
    edge("Owner", "U1", "association", "M 100 347 V 75 H 950 V 105"),
    edge("Owner", "U2", "association", "M 65 500 H 20 V 790 H 950 V 745"),
    edge("Owner", "U3", "association", "M 140 410 C 205 410, 205 200, 250 200"),
    edge("Owner", "U4", "association", "M 140 410 C 205 410, 205 650, 250 650"),
    edge("U2", "U1", "generalization", "M 950 555 V 295"),
    edge(
      "U3",
      "U2",
      "include",
      "M 630 200 H 700 V 560 L 810 585.78",
      ["«include»"],
      800,
      402,
    ),
    edge("U4", "U2", "include", "M 630 650 H 760", ["«include»"], 695, 620),
  ],
};
const reconciliation = {
  name: "02-use-cases-reconciliation",
  kind: "use-case",
  title: "Сверка и корректировка остатка",
  width: WIDTH,
  height: 780,
  boundary: { x: 230, y: 20, width: 960, height: 740 },
  actor: actor(410),
  nodes: [
    {
      ...usecase(
        5,
        "Сверить остаток счёта",
        ["Сверить остаток счёта"],
        720,
        235,
        265,
        145,
      ),
      labelY: 177,
      extensionPoint: {
        name: "разрешение расхождения",
        label: ["Точка расширения", "разрешение расхождения"],
        x: 720,
        y: 292,
        fontSize: SMALL,
        dividerY: 225,
      },
    },
    usecase(
      6,
      "Скорректировать остаток счёта",
      ["Скорректировать", "остаток счёта"],
      720,
      640,
      240,
      95,
    ),
  ],
  edges: [
    edge("Owner", "U5", "association", "M 140 410 C 300 410, 300 235, 455 235"),
    edge("Owner", "U6", "association", "M 140 410 C 300 410, 300 640, 480 640"),
    edge(
      "U6",
      "U5",
      "extend",
      "M 720 545 V 380",
      [
        "«extend»",
        "[есть расхождение",
        "и владелец подтвердил",
        "корректировку]",
      ],
      952,
      460,
    ),
  ],
};
const forecast = {
  name: "02-use-cases-forecast",
  kind: "use-case",
  title: "Прогноз и финансовые решения",
  width: WIDTH,
  height: 820,
  boundary: { x: 230, y: 20, width: 960, height: 780 },
  actor: actor(410),
  nodes: [
    usecase(
      7,
      "Получить прогноз денежных остатков",
      ["Получить прогноз", "денежных остатков"],
      925,
      420,
      245,
      120,
    ),
    usecase(
      8,
      "Оценить возможность покупки",
      ["Оценить возможность", "покупки"],
      500,
      200,
      215,
      95,
    ),
    usecase(
      9,
      "Сравнить финансовые сценарии",
      ["Сравнить финансовые", "сценарии"],
      500,
      650,
      215,
      95,
    ),
  ],
  edges: [
    edge("Owner", "U7", "association", "M 140 410 L 680 420"),
    edge("Owner", "U8", "association", "M 140 410 C 210 410, 210 200, 285 200"),
    edge("Owner", "U9", "association", "M 140 410 C 210 410, 210 650, 285 650"),
    edge(
      "U8",
      "U7",
      "include",
      "M 715 200 H 925 V 300",
      ["«include»"],
      820,
      172,
    ),
    edge(
      "U9",
      "U7",
      "include",
      "M 715 650 H 925 V 540",
      ["«include»"],
      820,
      620,
    ),
  ],
};
function text(lines, x, y, size = FONT, bold = false, anchor = "middle") {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * (size + 6) + size * 0.34}" font-size="${size}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ""}>${escape(line)}</text>`,
    )
    .join("\n");
}
function svgFor(model) {
  const b = model.boundary;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${model.height}" viewBox="0 0 ${WIDTH} ${model.height}">`,
    `<title>${escape(model.title)}</title>`,
    `<rect width="${WIDTH}" height="${model.height}" fill="white"/>`,
    '<defs><marker id="open-arrow" markerWidth="15" markerHeight="13" refX="13" refY="6.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 1 L 13 6.5 L 2 12" fill="none" stroke="#111" stroke-width="2"/></marker><marker id="generalization-arrow" markerWidth="21" markerHeight="20" refX="19" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 19 10 L 1 19 Z" fill="white" stroke="#111" stroke-width="2"/></marker></defs>',
    '<g font-family="Arial, sans-serif" fill="#111">',
    `<rect data-role="system-boundary" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white" stroke="#111" stroke-width="2"/>`,
    text(["Мобильное приложение «Лад»"], 250, 49, SMALL, true, "start"),
  ];
  for (const r of model.edges) {
    const style =
      r.kind === "association"
        ? ""
        : r.kind === "generalization"
          ? ' marker-end="url(#generalization-arrow)"'
          : ' stroke-dasharray="10 7" marker-end="url(#open-arrow)"';
    svg.push(
      `<path data-from="${r.from}" data-to="${r.to}" data-relation="${r.kind}" d="${r.d}" fill="none" stroke="#111" stroke-width="2.2"${style}/>`,
    );
    if (r.label.length)
      svg.push(
        `<g data-role="relation-label" data-from="${r.from}" data-to="${r.to}">`,
        text(r.label, r.labelX, r.labelY, r.fontSize),
        "</g>",
      );
  }
  for (const n of model.nodes) {
    svg.push(
      `<g id="${n.id}" data-role="usecase" data-title="${escape(n.uc + " " + n.title)}">`,
      `<ellipse cx="${n.x}" cy="${n.y}" rx="${n.rx}" ry="${n.ry}" fill="white" stroke="#111" stroke-width="2.2"/>`,
      text(n.label, n.x, n.labelY ?? n.y, n.fontSize),
      "</g>",
    );
    if (n.extensionPoint) {
      const e = n.extensionPoint;
      const half = n.rx * Math.sqrt(1 - ((e.dividerY - n.y) / n.ry) ** 2);
      svg.push(
        `<g data-role="extension-point" data-owner="${n.id}" data-name="${escape(e.name)}">`,
        `<path d="M ${n.x - half} ${e.dividerY} H ${n.x + half}" fill="none" stroke="#111" stroke-width="1.5"/>`,
        text(e.label, e.x, e.y, e.fontSize),
        "</g>",
      );
    }
  }
  const a = model.actor;
  svg.push(
    '<g id="Owner" data-role="actor">',
    `<g fill="none" stroke="#111" stroke-width="2.5"><circle cx="${a.x}" cy="${a.y - 43}" r="20"/><path d="M ${a.x} ${a.y - 23} V ${a.y + 45} M ${a.x - 40} ${a.y} H ${a.x + 40} M ${a.x} ${a.y + 45} L ${a.x - 35} ${a.y + 90} M ${a.x} ${a.y + 45} L ${a.x + 35} ${a.y + 90}"/></g>`,
    text(a.label, a.x, a.y + 137, SMALL),
    "</g></g></svg>\n",
  );
  return svg.join("\n");
}
function pumlFor(model) {
  const lines = [
    "@startuml",
    "skinparam monochrome true",
    "skinparam shadowing false",
    "skinparam defaultFontName Arial",
    "skinparam defaultFontSize 16",
    'actor "Владелец учёта" as Owner',
    'rectangle "Мобильное приложение Лад" {',
  ];
  for (const n of model.nodes) {
    const parts = [...n.label];
    if (n.extensionPoint)
      parts.push("--", "Точка расширения", n.extensionPoint.name);
    lines.push(`  usecase "${parts.join("\\n")}" as ${n.id}`);
  }
  lines.push("}");
  for (const r of model.edges) {
    if (r.kind === "association") lines.push(`${r.from} -- ${r.to}`);
    else if (r.kind === "generalization") lines.push(`${r.from} --|> ${r.to}`);
    else {
      const condition =
        r.kind === "extend"
          ? "\\n[есть расхождение и владелец подтвердил корректировку]"
          : "";
      lines.push(`${r.from} ..> ${r.to} : <<${r.kind}>>${condition}`);
    }
  }
  lines.push("@enduml", "");
  return lines.join("\n");
}
const models = [transactions, reconciliation, forecast];
for (const model of models) {
  const ids = new Set([model.actor.id, ...model.nodes.map((n) => n.id)]);
  if (model.edges.some((r) => !ids.has(r.from) || !ids.has(r.to)))
    throw new Error(`${model.name}: missing relation endpoint`);
  if (
    model.nodes.some(
      (n) =>
        !model.edges.some(
          (r) =>
            r.from === "Owner" && r.to === n.id && r.kind === "association",
        ),
    )
  )
    throw new Error(`${model.name}: missing explicit actor association`);
  const svg = svgFor(model);
  await writeFile(path.join(directory, `${model.name}.svg`), svg);
  await writeFile(path.join(directory, `${model.name}.puml`), pumlFor(model));
  await sharp(Buffer.from(svg), { density: 144 })
    .resize({ width: 1889 })
    .withMetadata({ density: 300 })
    .png()
    .toFile(path.join(directory, `${model.name}.png`));
}
await writeFile(
  path.join(directory, "use-case-models.json"),
  JSON.stringify(
    {
      print_width_mm: 160,
      body_font_size: FONT,
      small_font_size: SMALL,
      models,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    models.map((m) => ({
      name: m.name,
      use_cases: m.nodes.length,
      relations: m.edges.length,
      height_mm: +((m.height * 160) / WIDTH).toFixed(2),
    })),
    null,
    2,
  ),
);
