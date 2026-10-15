import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, "../../../..");
const output = path.join(root, "test-results/t01/a04/share-receiver");
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(
    homedir(),
    process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk",
  );
const receiverJavaHome = [
  process.env.JAVA_HOME,
  path.join(homedir(), ".sdkman/candidates/java/current"),
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
].find(
  (directory) => directory && existsSync(path.join(directory, "bin/javac")),
);
if (!receiverJavaHome) throw new Error("Нужен JDK 17+; укажите JAVA_HOME.");
const env = {
  ...process.env,
  JAVA_HOME: receiverJavaHome,
  PATH: `${path.join(receiverJavaHome, "bin")}${path.delimiter}${process.env.PATH || ""}`,
};
const buildTools = path.join(sdk, "build-tools", "36.0.0");
const androidJar = path.join(sdk, "platforms/android-36/android.jar");
for (const file of [
  androidJar,
  ...["aapt2", "d8", "zipalign", "apksigner"].map((name) =>
    path.join(buildTools, name),
  ),
]) {
  if (!existsSync(file))
    throw new Error(`Не найден установленный Android SDK tool: ${file}`);
}
const run = (command, args) =>
  execFileSync(command, args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const java = (name, args) =>
  run(path.join(receiverJavaHome, "bin", name), args);
const android = (name, args) => run(path.join(buildTools, name), args);
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(path.join(output, "build-"));
const apk = path.join(output, "a04-test-receiver.apk");
const keyStore = path.join(output, "test-only-signing.p12");
// Dedicated public test signer, unrelated to Lad, SecureStore or user signing keys.
const testPassword = "a04-test-only";
try {
  const classes = path.join(staging, "classes");
  const dex = path.join(staging, "dex");
  mkdirSync(classes);
  mkdirSync(dex);
  java("javac", [
    "--release",
    "8",
    "-encoding",
    "UTF-8",
    "-classpath",
    androidJar,
    "-d",
    classes,
    path.join(source, "ShareReceiverActivity.java"),
  ]);
  const classJar = path.join(staging, "classes.jar");
  java("jar", ["cf", classJar, "-C", classes, "."]);
  android("d8", [
    "--lib",
    androidJar,
    "--min-api",
    "26",
    "--output",
    dex,
    classJar,
  ]);
  const resources = path.join(staging, "resources.apk");
  android("aapt2", [
    "link",
    "-I",
    androidJar,
    "--manifest",
    path.join(source, "AndroidManifest.xml"),
    "-o",
    resources,
  ]);
  java("jar", ["uf", resources, "-C", dex, "classes.dex"]);
  const aligned = path.join(staging, "aligned.apk");
  android("zipalign", ["-f", "4", resources, aligned]);
  if (!existsSync(keyStore))
    java("keytool", [
      "-genkeypair",
      "-keystore",
      keyStore,
      "-storetype",
      "PKCS12",
      "-storepass",
      testPassword,
      "-keypass",
      testPassword,
      "-alias",
      "a04receiver",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "3650",
      "-dname",
      "CN=A04 Test Receiver",
      "-noprompt",
    ]);
  android("apksigner", [
    "sign",
    "--ks",
    keyStore,
    "--ks-key-alias",
    "a04receiver",
    "--ks-pass",
    `pass:${testPassword}`,
    "--key-pass",
    `pass:${testPassword}`,
    "--out",
    apk,
    aligned,
  ]);
  const verification = android("apksigner", [
    "verify",
    "--verbose",
    "--print-certs",
    apk,
  ]);
  const badging = android("aapt2", ["dump", "badging", apk]);
  const permissions = android("aapt2", ["dump", "permissions", apk]);
  if (/uses-permission/.test(permissions))
    throw new Error("У приёмника не должно быть разрешений Android.");
  if (!badging.includes("package: name='app.lad.testreceiver'"))
    throw new Error("Неверный package ID APK.");
  writeFileSync(
    path.join(output, "apk-verification.txt"),
    verification + "\n" + badging + "\n" + permissions,
  );
  const manifest = {
    builtAt: new Date().toISOString(),
    package: "app.lad.testreceiver",
    apk: path.relative(root, apk),
    apkSha256: hash(apk),
    androidPlatform: 36,
    buildTools: "36.0.0",
    javaVersion: run(path.join(receiverJavaHome, "bin/java"), [
      "--version",
    ]).trim(),
    deviceInstall: "not-run: install only on the explicitly selected test AVD",
    sourceSha256: Object.fromEntries(
      ["AndroidManifest.xml", "ShareReceiverActivity.java", "build.mjs"].map(
        (name) => [name, hash(path.join(source, name))],
      ),
    ),
  };
  writeFileSync(
    path.join(output, "build-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
