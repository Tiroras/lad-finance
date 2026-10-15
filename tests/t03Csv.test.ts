import { test } from "node:test";
import { t03CsvCases } from "./helpers/t03CsvCases";

for (const scenario of t03CsvCases) test(scenario.name, scenario.run);
