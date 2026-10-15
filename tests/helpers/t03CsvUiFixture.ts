import { createInitialState } from "../../src/domain/seed";
import { createT03LargeExportFixture } from "./t03CsvCases";
import { parseCsv } from "../../src/domain/csv";

export function createT03PersonalFixture() {
  const state = createInitialState(false, "2026-10-15");
  state.accounts[0].openingBalance = 1_000_000;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
}

export function createT03ExportFixture() {
  const state = createT03LargeExportFixture();
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
}

export function inspectExportFiles(contents: string[]) {
  const groups = new Map<string, number>();
  const rows = contents.map((content, part) => {
    const table = parseCsv(content);
    for (const row of table.rows) {
      const id = row[15] || row[9];
      const previous = groups.get(id);
      if (previous !== undefined && previous !== part)
        throw new Error(`Group ${id} crosses CSV parts`);
      groups.set(id, part);
    }
    return table.rows.length;
  });
  return { rows, groups: groups.size };
}
