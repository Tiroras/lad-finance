import { test } from "node:test";
import { t03ExportCases } from "./helpers/t03ExportCases";

for (const scenario of t03ExportCases) test(scenario.name, scenario.run);
