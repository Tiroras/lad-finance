import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const device = process.argv[2];
if (!device || !/^emulator-\d+$/.test(device)) {
  throw new Error(
    "Укажите serial выделенного AVD: node pull.mjs emulator-5556 [каталог результата]",
  );
}
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(
    homedir(),
    process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk",
  );
const adb = path.join(sdk, "platform-tools/adb");
const run = (args, maxBuffer = 65536) =>
  execFileSync(adb, ["-s", device, ...args], {
    maxBuffer,
    timeout: 120000,
    stdio: ["ignore", "pipe", "pipe"],
  });
const avd = run(["shell", "getprop", "ro.boot.qemu.avd_name"])
  .toString("utf8")
  .trim();
const allowedAvds = [
  "Lad_FirstRun_Test",
  "Lad_A04_Transfer_Test",
  "Lad_T02_Recovery_Test",
  "Lad_T02_Transfer_Test",
];
if (!allowedAvds.includes(avd))
  throw new Error(
    `Нужен ${allowedAvds.join(" или ")}, получен ${avd || "неизвестный AVD"}.`,
  );
const receiptBytes = run([
  "exec-out",
  "run-as",
  "app.lad.testreceiver",
  "cat",
  "files/last-receipt.json",
]);
const receipt = JSON.parse(receiptBytes.toString("utf8"));
if (receipt.status !== "success")
  throw new Error(
    `Приёмник не подтвердил файл: ${receipt.phase || "unknown"} / ${receipt.errorType || "unknown"}`,
  );
if (
  typeof receipt.file !== "string" ||
  !/^files\/received\/received-\d+-[a-f0-9]{8}\.(json|ladbackup)$/.test(
    receipt.file,
  )
)
  throw new Error("Неожиданное имя файла в метаданных приёмника.");
if (
  !Number.isSafeInteger(receipt.bytes) ||
  receipt.bytes < 1 ||
  receipt.bytes > 15_000_000
)
  throw new Error("Некорректный размер файла в метаданных.");
const received = run(
  ["exec-out", "run-as", "app.lad.testreceiver", "cat", receipt.file],
  15_000_001,
);
const sha256 = createHash("sha256").update(received).digest("hex");
if (received.length !== receipt.bytes || sha256 !== receipt.sha256)
  throw new Error(
    "Байты adb-выгрузки не совпадают с проверенным файлом приёмника.",
  );
const output = path.resolve(process.argv[3] || "test-results/t01/a04/received");
mkdirSync(output, { recursive: true });
const file = path.join(output, path.basename(receipt.file));
writeFileSync(file, received);
writeFileSync(`${file}.receipt.json`, receiptBytes);
console.log(
  JSON.stringify(
    {
      result: "captured-bytes-verified",
      device,
      avd,
      file,
      bytes: received.length,
      sha256,
    },
    null,
    2,
  ),
);
