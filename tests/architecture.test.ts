import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const allowedLayers: Record<string, readonly string[]> = {
  application: [
    "application",
    "screens",
    "features",
    "state",
    "domain",
    "infrastructure",
    "shared",
  ],
  screens: ["screens", "features", "state", "domain", "shared"],
  features: ["features", "state", "domain", "infrastructure", "shared"],
  state: ["state", "domain", "infrastructure", "shared"],
  infrastructure: ["infrastructure", "domain", "shared"],
  domain: ["domain", "shared"],
  shared: ["shared"],
};
type Platform = "default" | "native";
type Dependency = { specifier: string; typeOnly: boolean; isImport: boolean };
const slash = (path: string) => path.split(sep).join("/");

function scan(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? scan(path)
      : /\.[jt]sx?$/.test(entry.name)
        ? [slash(relative(sourceRoot, path))]
        : [];
  });
}

function dependencies(code: string, filename: string): Dependency[] {
  const result: Dependency[] = [];
  const source = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    let literal: ts.Node | undefined;
    let typeOnly = false;
    let isImport = false;
    if (ts.isImportDeclaration(node)) {
      literal = node.moduleSpecifier;
      isImport = true;
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      typeOnly =
        !!clause?.isTypeOnly ||
        !!(
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length &&
          bindings.elements.every((item) => item.isTypeOnly)
        );
    } else if (ts.isExportDeclaration(node)) {
      literal = node.moduleSpecifier;
      typeOnly =
        node.isTypeOnly ||
        !!(
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length &&
          node.exportClause.elements.every((item) => item.isTypeOnly)
        );
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      literal = node.argument.literal;
      typeOnly = true;
      isImport = true;
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      literal = node.moduleReference.expression;
      typeOnly = node.isTypeOnly;
      isImport = true;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      literal = node.arguments[0];
      isImport = true;
    }
    if (literal && ts.isStringLiteralLike(literal))
      result.push({ specifier: literal.text, typeOnly, isImport });
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

const files = scan(sourceRoot).sort();
const fileSet = new Set(files);
const imports = new Map<string, Dependency[]>();
const runtimeImports = new Map<string, Dependency[]>();
for (const file of files) {
  const code = readFileSync(join(sourceRoot, file), "utf8");
  imports.set(file, dependencies(code, file));
  // Transpilation removes imports used only as types, including implicit ones.
  const emitted = file.endsWith(".d.ts")
    ? ""
    : ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText;
  runtimeImports.set(
    file,
    dependencies(emitted, file.replace(/\.tsx?$/, ".js")),
  );
}

function resolveImport(file: string, specifier: string, platform: Platform) {
  const base = slash(
    relative(sourceRoot, resolve(sourceRoot, dirname(file), specifier)),
  );
  if (fileSet.has(base)) return base;
  const extensions =
    platform === "native"
      ? [
          ".native.ts",
          ".native.tsx",
          ".native.js",
          ".native.jsx",
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
        ]
      : [".ts", ".tsx", ".js", ".jsx"];
  return [
    ...extensions.map((extension) => base + extension),
    ...extensions.map((extension) => `${base}/index${extension}`),
  ].find((candidate) => fileSet.has(candidate));
}

function activeFiles(platform: Platform) {
  return files.filter((file) =>
    platform === "default"
      ? !/\.native\.[jt]sx?$/.test(file)
      : /\.native\.[jt]sx?$/.test(file) ||
        !fileSet.has(file.replace(/(\.[jt]sx?)$/, ".native$1")),
  );
}

const moduleOf = (file: string) => file.split("/").slice(0, 2).join("/");
const isModuleIndex = (file: string) =>
  /^[^/]+\/[^/]+\/index(?:\.native)?\.[jt]sx?$/.test(file);
function assertNoErrors(errors: string[]) {
  assert.equal(errors.length, 0, errors.join("\n"));
}

test("source folders and imports respect the architecture in AGENTS.md", () => {
  const errors: string[] = [];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !(entry.name in allowedLayers))
      errors.push(`Unexpected src entry: ${entry.name}`);
  }
  if (files.some((file) => /^features\/index\.[jt]sx?$/.test(file)))
    errors.push(
      "Features must expose their own public API, not a shared features/index",
    );
  for (const platform of ["default", "native"] as const) {
    for (const file of activeFiles(platform)) {
      for (const dependency of imports.get(file)!) {
        if (!dependency.specifier.startsWith(".")) continue;
        const target = resolveImport(file, dependency.specifier, platform);
        const edge = `[${platform}] ${file} -> ${dependency.specifier}`;
        if (!target) {
          errors.push(`${edge}: unresolved source import`);
          continue;
        }
        const [fromLayer, fromModule] = file.split("/");
        const [toLayer, toModule] = target.split("/");
        const navigationType =
          (fromLayer === "features" || fromLayer === "screens") &&
          target === "application/navigation/types.ts" &&
          dependency.isImport &&
          dependency.typeOnly;
        if (!navigationType && !allowedLayers[fromLayer]?.includes(toLayer))
          errors.push(`${edge}: forbidden layer dependency`);
        if (
          fromLayer === "domain" &&
          toLayer === "shared" &&
          toModule !== "lib"
        )
          errors.push(`${edge}: domain can only use pure shared/lib`);
        if (
          fromLayer === "screens" &&
          toLayer === "screens" &&
          fromModule !== toModule &&
          !/^screens\/index\.[jt]sx?$/.test(file)
        )
          errors.push(`${edge}: screen imports another screen's internals`);
        if (
          toLayer === "features" &&
          moduleOf(file) !== moduleOf(target) &&
          !isModuleIndex(target)
        )
          errors.push(`${edge}: use the feature's public index`);
        if (
          target.startsWith("state/finance/") &&
          !file.startsWith("state/finance/") &&
          !isModuleIndex(target)
        )
          errors.push(`${edge}: use state/finance/index`);
        if (isModuleIndex(target) && moduleOf(file) === moduleOf(target))
          errors.push(
            `${edge}: import sibling files directly, not the module's own index`,
          );
      }
    }
  }
  assertNoErrors(errors);
});

for (const platform of ["default", "native"] as const) {
  test(`runtime dependencies are acyclic and domain stays independent of React (${platform})`, () => {
    const graph = new Map<string, string[]>();
    const errors: string[] = [];
    for (const file of files) {
      graph.set(
        file,
        runtimeImports.get(file)!.flatMap(({ specifier }) => {
          const target = specifier.startsWith(".")
            ? resolveImport(file, specifier, platform)
            : undefined;
          return target ? [target] : [];
        }),
      );
    }
    const completed = new Set<string>();
    const visiting = new Set<string>();
    const stack: string[] = [];
    function visit(file: string) {
      if (visiting.has(file)) {
        errors.push(
          `Runtime cycle: ${[...stack.slice(stack.indexOf(file)), file].join(" -> ")}`,
        );
        return;
      }
      if (completed.has(file)) return;
      visiting.add(file);
      stack.push(file);
      for (const target of graph.get(file) ?? []) visit(target);
      stack.pop();
      visiting.delete(file);
      completed.add(file);
    }
    for (const file of activeFiles(platform)) visit(file);

    const domainDependencies = new Set<string>();
    function checkPure(file: string) {
      if (domainDependencies.has(file)) return;
      domainDependencies.add(file);
      for (const { specifier } of [
        ...(imports.get(file) ?? []),
        ...(runtimeImports.get(file) ?? []),
      ]) {
        if (
          /^(react($|[-/])|expo($|[-/])|@expo\/|@react-native[-/])/.test(
            specifier,
          )
        )
          errors.push(
            `Domain depends on UI or platform API through ${file}: ${specifier}`,
          );
      }
      for (const target of graph.get(file) ?? []) checkPure(target);
    }
    for (const file of activeFiles(platform))
      if (file.startsWith("domain/")) checkPure(file);
    assertNoErrors(errors);
  });
}
