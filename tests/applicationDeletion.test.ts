import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("completed deletion is consumed and effect replay preserves newly created data", async () => {
  // Replay Application effects with retained hook state, the Fast Refresh
  // contract. Native rendering is covered separately; the deletion protocol is real.
  await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("./helpers/applicationDeletion.cjs", import.meta.url),
      ),
      fileURLToPath(new URL("../", import.meta.url)),
    ],
    { timeout: 15000 },
  );
});
