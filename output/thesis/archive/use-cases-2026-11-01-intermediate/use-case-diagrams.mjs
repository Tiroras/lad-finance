/** Ten user goals and three activity models for thesis section 2.1.
 * The model and publication layout below generate PlantUML, SVG, PNG and JSON.
 * Use bundled Node and Sharp; PNG files are 1889 px wide at 300 dpi (160 mm).
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
  SMALL = 28;
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const title = (id, name, lines, x, y) => ({
  id,
  label: [`UC-${id.slice(1).padStart(2, "0")}`, ...lines],
  title: name,
  x,
  y,
  rx: 215,
  ry: 100,
  fontSize: 30,
  shape: "usecase",
});
const overview = {
  name: "02-use-cases-overview",
  kind: "use-case",
  title: "Прецеденты мобильного приложения «Лад»",
  width: WIDTH,
  height: 1450,
  actor: { id: "Owner", title: "Владелец учёта", x: 600, y: 100 },
  nodes: [
    title(
      "U1",
      "Организовать и защитить личный учёт",
      ["Организовать", "и защитить", "личный учёт"],
      250,
      370,
    ),
    title(
      "U2",
      "Поддерживать достоверные остатки счетов",
      ["Поддерживать", "достоверные остатки", "счетов"],
      950,
      370,
    ),
    title(
      "U3",
      "Вести историю финансовых операций",
      ["Вести историю", "финансовых операций"],
      250,
      590,
    ),
    title(
      "U4",
      "Контролировать расходы по бюджету",
      ["Контролировать", "расходы по бюджету"],
      950,
      590,
    ),
    title(
      "U5",
      "Накапливать средства на финансовую цель",
      ["Накапливать средства", "на финансовую цель"],
      250,
      810,
    ),
    title(
      "U6",
      "Планировать и учитывать доходы и платежи",
      ["Планировать", "и учитывать доходы", "и платежи"],
      950,
      810,
    ),
    title(
      "U7",
      "Контролировать долги и кредитные обязательства",
      ["Контролировать долги", "и кредитные", "обязательства"],
      250,
      1030,
    ),
    title(
      "U10",
      "Анализировать финансовую историю",
      ["Анализировать", "финансовую историю"],
      950,
      1030,
    ),
    title(
      "U8",
      "Получать прогноз денежных остатков",
      ["Получать прогноз", "денежных остатков"],
      250,
      1250,
    ),
    title(
      "U9",
      "Оценивать покупку и изменения финансового плана",
      ["Оценивать покупку", "и изменения", "финансового плана"],
      950,
      1250,
    ),
  ],
};
overview.edges = overview.nodes.map((n) => ({
  from: "Owner",
  to: n.id,
  kind: "association",
  d:
    n.x < 600
      ? `M 550 100 C 520 190, 520 ${n.y}, ${n.x + n.rx} ${n.y}`
      : `M 650 100 C 680 190, 680 ${n.y}, ${n.x - n.rx} ${n.y}`,
}));
overview.edges.push({
  from: "U9",
  to: "U8",
  kind: "include",
  d: "M 950 1350 V 1400 H 250 V 1350",
  label: ["«include»"],
  labelX: 600,
  labelY: 1375,
});
const action = (id, role, label, x, y, w, h, uc = []) => ({
  id,
  role,
  label,
  x,
  y,
  w,
  h,
  uc,
  shape: "action",
});
const diamond = (id, label, x, y, w = 400, h = 126) => ({
  id,
  label,
  x,
  y,
  w,
  h,
  shape: "decision",
});
const edge = (from, to, d, label, labelX, labelY) => ({
  from,
  to,
  d,
  kind: "control-flow",
  ...(label ? { label: [label], labelX, labelY } : {}),
});
const point = (id, shape, x, y) => ({ id, shape, x, y, label: [] });
const plan = {
  name: "02-activity-plan-fact",
  kind: "activity",
  title: "Связь планового события с фактической операцией",
  width: WIDTH,
  height: 1270,
  nodes: [
    point("Start", "initial", 600, 35),
    action(
      "Select",
      "Владелец · UC-06",
      ["Выбрать доход или платёж", "и подтвердить исполнение"],
      600,
      155,
      860,
      135,
      ["UC-06"],
    ),
    action(
      "Validate",
      "Лад",
      ["Проверить событие, сумму, счёт", "и допустимость связи с операцией"],
      600,
      355,
      860,
      135,
    ),
    diamond("Method", ["Как исполнить?"], 600, 555),
    action(
      "New",
      "Лад · UC-03 / UC-06",
      ["Создать проведённую", "операцию и связать", "с событием"],
      205,
      800,
      360,
      190,
      ["UC-03", "UC-06"],
    ),
    action(
      "Pending",
      "Лад · UC-03 / UC-06",
      ["Провести ожидающую", "операцию, сохранив", "связь с событием"],
      600,
      800,
      360,
      190,
      ["UC-03", "UC-06"],
    ),
    action(
      "Posted",
      "Лад · UC-03 / UC-06",
      ["Привязать факт", "к событию без нового", "движения денег"],
      995,
      800,
      360,
      190,
      ["UC-03", "UC-06"],
    ),
    diamond("Merge", [], 600, 980, 32, 32),
    action(
      "Result",
      "Лад · UC-02 / UC-03 / UC-06",
      [
        "Согласованно сохранить изменение",
        "и показать остатки, историю",
        "и отметку исполнения события",
      ],
      600,
      1120,
      900,
      170,
      ["UC-02", "UC-03", "UC-06"],
    ),
    point("End", "final", 600, 1245),
  ],
  edges: [
    edge("Start", "Select", "M 600 47 V 87.5"),
    edge("Select", "Validate", "M 600 222.5 V 287.5"),
    edge("Validate", "Method", "M 600 422.5 V 492"),
    edge("Method", "New", "M 400 555 H 205 V 705", "[новая запись]", 300, 525),
    edge("Method", "Pending", "M 600 618 V 705", "[ожидающая]", 750, 665),
    edge(
      "Method",
      "Posted",
      "M 800 555 H 995 V 705",
      "[проведённая]",
      900,
      525,
    ),
    edge("New", "Merge", "M 205 895 V 980 H 584"),
    edge("Pending", "Merge", "M 600 895 V 964"),
    edge("Posted", "Merge", "M 995 895 V 980 H 616"),
    edge("Merge", "Result", "M 600 996 V 1035"),
    edge("Result", "End", "M 600 1205 V 1231"),
  ],
  puml: [
    "start",
    "@Select",
    "@Validate",
    "switch (Как исполнить?)",
    "case (новая запись)",
    "@New",
    "case (ожидающая)",
    "@Pending",
    "case (проведённая)",
    "@Posted",
    "endswitch",
    "@Result",
    "stop",
  ],
};
const goal = {
  name: "02-activity-goal",
  kind: "activity",
  title: "Пополнение и вывод средств финансовой цели",
  width: WIDTH,
  height: 1320,
  nodes: [
    point("Start", "initial", 600, 35),
    action(
      "Choose",
      "Владелец · UC-05",
      ["Выбрать цель, сумму и счета", "для пополнения или вывода"],
      600,
      150,
      900,
      135,
      ["UC-05"],
    ),
    diamond("Direction", ["Взнос или вывод?"], 600, 345),
    action(
      "CheckDeposit",
      "Лад · UC-05",
      ["Проверить остаток цели", "и доступные деньги", "повседневного счёта"],
      300,
      570,
      500,
      175,
      ["UC-05"],
    ),
    action(
      "CheckWithdraw",
      "Лад · UC-05",
      ["Проверить накопленное", "и обеспеченность", "остальных целей"],
      900,
      570,
      500,
      175,
      ["UC-05"],
    ),
    action(
      "Deposit",
      "Лад · UC-02 / UC-05",
      [
        "Подготовить перевод",
        "на накопительный счёт",
        "и увеличение прогресса",
      ],
      300,
      805,
      500,
      175,
      ["UC-02", "UC-05"],
    ),
    action(
      "Withdraw",
      "Лад · UC-02 / UC-05",
      [
        "Подготовить освобождение",
        "суммы цели и перевод",
        "на повседневный счёт",
      ],
      900,
      805,
      500,
      175,
      ["UC-02", "UC-05"],
    ),
    diamond("Merge", [], 600, 975, 32, 32),
    action(
      "Commit",
      "Лад · UC-02 / UC-05",
      [
        "Сохранить перевод и распределение",
        "одним изменением, обновить остатки",
        "счетов и прогресс цели",
      ],
      600,
      1110,
      960,
      170,
      ["UC-02", "UC-05"],
    ),
    point("End", "final", 600, 1250),
  ],
  edges: [
    edge("Start", "Choose", "M 600 47 V 82.5"),
    edge("Choose", "Direction", "M 600 217.5 V 282"),
    edge(
      "Direction",
      "CheckDeposit",
      "M 400 345 H 300 V 482.5",
      "[пополнение]",
      170,
      440,
    ),
    edge(
      "Direction",
      "CheckWithdraw",
      "M 800 345 H 900 V 482.5",
      "[вывод]",
      1030,
      440,
    ),
    edge("CheckDeposit", "Deposit", "M 300 657.5 V 717.5"),
    edge("CheckWithdraw", "Withdraw", "M 900 657.5 V 717.5"),
    edge("Deposit", "Merge", "M 300 892.5 V 975 H 584"),
    edge("Withdraw", "Merge", "M 900 892.5 V 975 H 616"),
    edge("Merge", "Commit", "M 600 991 V 1025"),
    edge("Commit", "End", "M 600 1195 V 1236"),
  ],
  puml: [
    "start",
    "@Choose",
    "if (Взнос или вывод?) then (пополнение)",
    "@CheckDeposit",
    "@Deposit",
    "else (вывод)",
    "@CheckWithdraw",
    "@Withdraw",
    "endif",
    "@Commit",
    "stop",
  ],
};
const forecast = {
  name: "02-activity-forecast",
  kind: "activity",
  title: "Оценка финансового решения на основе прогноза",
  width: WIDTH,
  height: 1350,
  nodes: [
    point("Start", "initial", 600, 30),
    action(
      "Choose",
      "Владелец · UC-09",
      ["Выбрать покупку или сценарий,", "ввести условия и горизонт"],
      600,
      145,
      900,
      135,
      ["UC-09"],
    ),
    action(
      "Base",
      "Лад · UC-08 / UC-09",
      ["Проверить ввод и рассчитать", "прогноз по текущему плану"],
      600,
      335,
      900,
      135,
      ["UC-08", "UC-09"],
    ),
    action(
      "Variant",
      "Лад · UC-08",
      ["Рассчитать прогноз с покупкой", "или условиями сценария"],
      600,
      525,
      900,
      135,
      ["UC-08"],
    ),
    diamond("Purpose", ["Тип решения"], 600, 715),
    action(
      "Purchase",
      "Лад · UC-09",
      [
        "Проверить выбранный счёт,",
        "резерв и предупреждения",
        "на всём горизонте",
      ],
      300,
      935,
      520,
      175,
      ["UC-09"],
    ),
    action(
      "Scenario",
      "Лад · UC-09",
      ["Сравнить остатки, минимум", "и даты риска двух", "вариантов плана"],
      900,
      935,
      520,
      175,
      ["UC-09"],
    ),
    diamond("Merge", [], 600, 1090, 32, 32),
    action(
      "Result",
      "Лад · UC-09",
      ["Показать вывод и его причины", "Факты и исходные планы не меняются"],
      600,
      1200,
      960,
      135,
      ["UC-09"],
    ),
    point("End", "final", 600, 1320),
  ],
  edges: [
    edge("Start", "Choose", "M 600 42 V 77.5"),
    edge("Choose", "Base", "M 600 212.5 V 267.5"),
    edge("Base", "Variant", "M 600 402.5 V 457.5"),
    edge("Variant", "Purpose", "M 600 592.5 V 652"),
    edge(
      "Purpose",
      "Purchase",
      "M 400 715 H 300 V 847.5",
      "[покупка]",
      190,
      810,
    ),
    edge(
      "Purpose",
      "Scenario",
      "M 800 715 H 900 V 847.5",
      "[сценарий]",
      1020,
      810,
    ),
    edge("Purchase", "Merge", "M 300 1022.5 V 1090 H 584"),
    edge("Scenario", "Merge", "M 900 1022.5 V 1090 H 616"),
    edge("Merge", "Result", "M 600 1106 V 1132.5"),
    edge("Result", "End", "M 600 1267.5 V 1306"),
  ],
  puml: [
    "start",
    "@Choose",
    "@Base",
    "@Variant",
    "if (Тип решения) then (покупка)",
    "@Purchase",
    "else (сценарий)",
    "@Scenario",
    "endif",
    "@Result",
    "stop",
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
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${model.height}" viewBox="0 0 ${WIDTH} ${model.height}">`,
    `<title>${escape(model.title)}</title>`,
    `<rect width="${WIDTH}" height="${model.height}" fill="white"/>`,
    '<defs><marker id="open-arrow" markerWidth="15" markerHeight="13" refX="13" refY="6.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 1 L 13 6.5 L 2 12" fill="none" stroke="#111" stroke-width="2"/></marker><marker id="flow-arrow" markerWidth="14" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 12 6 L 1 11 Z" fill="#111"/></marker></defs>',
    '<g font-family="Arial, sans-serif" fill="#111">',
  ];
  if (model.kind === "use-case")
    svg.push(
      '<rect x="10" y="215" width="1180" height="1220" fill="white" stroke="#111" stroke-width="2"/>',
      text(["Мобильное приложение «Лад»"], 36, 247, 30, true, "start"),
    );
  for (const r of model.edges) {
    svg.push(
      `<path data-from="${r.from}" data-to="${r.to}" data-relation="${r.kind}" d="${r.d}" fill="none" stroke="#111" stroke-width="${r.kind === "association" ? 1.8 : 2.2}"${r.kind === "include" ? ' stroke-dasharray="10 7" marker-end="url(#open-arrow)"' : r.kind === "control-flow" ? ' marker-end="url(#flow-arrow)"' : ""}/>`,
    );
    if (r.label) {
      const width =
        Math.max(...r.label.map((s) => s.length)) * SMALL * 0.57 + 16;
      svg.push(
        `<rect x="${r.labelX - width / 2}" y="${r.labelY - 20}" width="${width}" height="40" fill="white"/>`,
        text(r.label, r.labelX, r.labelY, SMALL),
      );
    }
  }
  for (const n of model.nodes) {
    svg.push(
      `<g id="${n.id}" data-role="${n.shape}"${n.title ? ` data-title="${escape(n.title)}"` : ""}>`,
    );
    if (n.shape === "usecase")
      svg.push(
        `<ellipse cx="${n.x}" cy="${n.y}" rx="${n.rx}" ry="${n.ry}" fill="white" stroke="#111" stroke-width="2.2"/>`,
        text(n.label, n.x, n.y, n.fontSize ?? FONT),
      );
    else if (n.shape === "action")
      svg.push(
        `<rect x="${n.x - n.w / 2}" y="${n.y - n.h / 2}" width="${n.w}" height="${n.h}" rx="20" fill="white" stroke="#111" stroke-width="2.2"/>`,
        text([n.role], n.x, n.y - n.h / 2 + 29, SMALL, true),
        text(n.label, n.x, n.y + 19, n.fontSize ?? FONT),
      );
    else if (n.shape === "decision")
      svg.push(
        `<path d="M ${n.x} ${n.y - n.h / 2} L ${n.x + n.w / 2} ${n.y} L ${n.x} ${n.y + n.h / 2} L ${n.x - n.w / 2} ${n.y} Z" fill="white" stroke="#111" stroke-width="2.2"/>`,
        text(n.label, n.x, n.y, n.fontSize ?? FONT),
      );
    else if (n.shape === "initial")
      svg.push(`<circle cx="${n.x}" cy="${n.y}" r="12" fill="#111"/>`);
    else
      svg.push(
        `<circle cx="${n.x}" cy="${n.y}" r="14" fill="white" stroke="#111" stroke-width="2.2"/><circle cx="${n.x}" cy="${n.y}" r="8" fill="#111"/>`,
      );
    svg.push("</g>");
  }
  if (model.actor)
    svg.push(
      '<g id="Owner" data-role="actor">',
      text([model.actor.title], 600, 20),
      '<g fill="none" stroke="#111" stroke-width="2.5"><circle cx="600" cy="59" r="20"/><path d="M 600 79 V 137 M 550 100 H 650 M 600 137 L 568 179 M 600 137 L 632 179"/></g></g>',
    );
  svg.push("</g></svg>\n");
  return svg.join("\n");
}
function pumlFor(model) {
  const pre = [
    "@startuml",
    "skinparam monochrome true",
    "skinparam shadowing false",
    "skinparam defaultFontName Arial",
    "skinparam defaultFontSize 16",
  ];
  if (model.kind === "use-case")
    return [
      ...pre,
      'actor "Владелец учёта" as Owner',
      'rectangle "Мобильное приложение Лад" {',
      ...model.nodes.map(
        (n) => `  usecase "${n.label.join("\\n")}" as ${n.id}`,
      ),
      "}",
      ...model.edges.map((r) =>
        r.kind === "association"
          ? `${r.from} -- ${r.to}`
          : `${r.from} ..> ${r.to} : <<include>>`,
      ),
      "@enduml",
      "",
    ].join("\n");
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  return [
    ...pre,
    ...model.puml.map((line) => {
      if (!line.startsWith("@")) return line;
      const n = byId.get(line.slice(1));
      return `:${n.role}\\n${n.label.join("\\n")};`;
    }),
    "@enduml",
    "",
  ].join("\n");
}
for (const n of plan.nodes) {
  if (["New", "Pending", "Posted"].includes(n.id)) n.fontSize = 30;
}
const models = [overview, plan, goal, forecast];
for (const model of models) {
  const ids = new Set(model.nodes.map((n) => n.id));
  if (model.actor) ids.add(model.actor.id);
  if (model.edges.some((r) => !ids.has(r.from) || !ids.has(r.to)))
    throw new Error(`${model.name}: missing endpoint`);
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
      kind: m.kind,
      nodes: m.nodes.length,
      relations: m.edges.length,
      height_mm: +((m.height * 160) / WIDTH).toFixed(2),
    })),
    null,
    2,
  ),
);
