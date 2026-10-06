import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { decodeBackup } from "../../src/domain/backup";

const start = performance.now();
const state = decodeBackup(readFileSync(process.argv[2], "utf8"));
process.stdout.write(
  JSON.stringify({
    decodeAndReadMs: performance.now() - start,
    count: state.transactions.length,
    memory: process.memoryUsage(),
    maxRssKiB: process.resourceUsage().maxRSS,
  }),
);
