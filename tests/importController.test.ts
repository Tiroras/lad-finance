import { test } from "node:test";
import { t03ImportCases } from "./helpers/t03ImportCases";

for (const entry of t03ImportCases) test(entry.name, entry.run);
