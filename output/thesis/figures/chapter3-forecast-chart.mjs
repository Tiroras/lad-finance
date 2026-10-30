import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

// Run a copy of this file from a temporary directory linked to the bundled
// node_modules; chapter3-forecast-chart.py provides that reproducible entry point.
const root = path.resolve(process.argv[2]);
const payload = JSON.parse(
  await fs.readFile(
    path.join(root, "../research/controls/forecast-control-results.json"),
    "utf8",
  ),
);
const points = payload.chart;
assert.equal(points.length, 30);
assert.equal(points[0].date, "2026-10-20");
assert.equal(points.at(-1).date, "2026-11-18");
assert.equal(points[0].baseline, 4_000_000);
assert.equal(points.at(-1).baseline, 1_750_000);
assert.equal(Math.min(...points.map((row) => row.baseline)), 1_750_000);
assert.ok(points.every((row) => row.reserve === 500_000));
for (let i = 1; i < points.length; i += 1) {
  const row = points[i];
  const expected =
    -50_000 +
    (row.date === "2026-10-25" ? 1_000_000 : 0) -
    (row.date === "2026-10-28" ? 1_800_000 : 0);
  assert.equal(row.baseline - points[i - 1].baseline, expected);
}

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Прогноз");
sheet.showGridLines = false;
sheet.getRange("A1:A60").format.columnWidthPx = 100;
sheet.getRange("B1:B60").format.columnWidthPx = 200;
sheet.getRange("C1:C60").format.columnWidthPx = 100;
sheet.getRange("D1:D60").format.columnWidthPx = 120;
sheet.getRange("E1:P26").format.columnWidthPx = 40;
sheet.getRange("A1:P26").format.rowHeightPx = 20;
sheet.getRange("A30:D60").format.font = { name: "Arial", size: 11 };
sheet.getRange("A30:C60").values = [
  ["Дата", "Остаток на конец дня", "Резерв"],
  ...points.map((row) => [
    Math.round(
      (Date.parse(`${row.date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) /
        86_400_000,
    ),
    row.baseline / 100,
    row.reserve / 100,
  ]),
];
sheet.getRange("A31:A60").setNumberFormat("dd.mm.yyyy");
sheet.getRange("B31:C60").setNumberFormat("#,##0");
sheet.getRange("D30").values = [["Подпись даты"]];
sheet.getRange("D31").formulas = [['=DAY(A31)&"."&MONTH(A31)']];
sheet.getRange("D31:D60").fillDown();
sheet.getRange("A30:D30").format = {
  fill: "#E7E6E6",
  font: { name: "Arial", size: 11, bold: true },
};
sheet.getRange("F30").values = [
  ["Источник: расчёт прогноза из раздела 3.11.4 ВКР"],
];

const chart = sheet.charts.add("line", [
  sheet.getRange("D30:D60"),
  sheet.getRange("B30:B60"),
  sheet.getRange("C30:C60"),
]);
chart.setPosition("A1", "P26");
chart.title = "Прогноз денежных средств";
chart.titleTextStyle.typeface = "Arial";
chart.titleTextStyle.fontSize = 28;
chart.legend = {
  position: "bottom",
  textStyle: { typeface: "Arial", fontSize: 22 },
};
chart.xAxis = {
  axisType: "textAxis",
  textStyle: { typeface: "Arial", fontSize: 22 },
};
chart.yAxis = {
  numberFormatCode: "0",
  numberFormatSourceLinked: false,
  textStyle: { typeface: "Arial", fontSize: 22 },
};
chart.xAxis.title.text = "Дата (2026 г.)";
chart.yAxis.title.text = "Остаток, руб.";
chart.series.items[0].line = { fill: "#4472C4", style: "solid", width: 3 };
chart.series.items[1].line = { fill: "#ED7D31", style: "dashed", width: 3 };
workbook.recalculate();
assert.equal(chart.series.items.length, 2);
assert.deepEqual(
  sheet.getRange("D31:D60").values.map((row) => row[0]),
  points.map(
    (row) => Number(row.date.slice(8, 10)) + "." + Number(row.date.slice(5, 7)),
  ),
);

const workbookFile = await SpreadsheetFile.exportXlsx(workbook);
await workbookFile.save(path.join(root, "chapter3-forecast-chart.xlsx"));
const inspection = await workbook.inspect({
  kind: "table",
  range: "Прогноз!A30:D36",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 4,
  maxChars: 1800,
});
console.log(inspection.ndjson);
console.log(
  JSON.stringify({
    chartType: chart.type,
    series: chart.series.items.map((s) => ({
      values: s.formula,
      dates: s.categoryFormula,
    })),
    points: 30,
  }),
);
