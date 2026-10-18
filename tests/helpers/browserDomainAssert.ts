/** Strict assertions for the plain financial data used by browser domain suites.
 * Unsupported comparison types fail explicitly instead of weakening assertions.
 */
function fail(message: string): never {
  throw new Error(message);
}

function display(value: unknown): string {
  if (typeof value === "number" && Object.is(value, -0)) return "-0";
  return JSON.stringify(value) ?? String(value);
}

function equal(actual: unknown, expected: unknown, message?: string) {
  if (!Object.is(actual, expected)) {
    fail(
      message || `Expected ${display(expected)}, received ${display(actual)}`,
    );
  }
}

function deepDifference(
  actual: unknown,
  expected: unknown,
  path: string,
): string | undefined {
  if (Object.is(actual, expected)) return;
  if (
    actual === null ||
    expected === null ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  ) {
    return `${path}: expected ${display(expected)}, received ${display(actual)}`;
  }
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) {
    return `${path}: different prototypes`;
  }
  if (
    !Array.isArray(actual) &&
    Object.getPrototypeOf(actual) !== Object.prototype
  ) {
    fail(`Unsupported deep comparison at ${path}`);
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const lengthDifference = deepDifference(
      actual.length,
      expected.length,
      path,
    );
    if (lengthDifference) return lengthDifference;
  }
  const keys = (value: object) =>
    Reflect.ownKeys(value).filter((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    );
  const actualKeys = keys(actual);
  const expectedKeys = keys(expected);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    return `${path}: different keys (${actualKeys.map(String)} / ${expectedKeys.map(String)})`;
  }
  for (const key of actualKeys) {
    const difference = deepDifference(
      Reflect.get(actual, key),
      Reflect.get(expected, key),
      `${path}.${String(key)}`,
    );
    if (difference) return difference;
  }
}

function deepEqual(actual: unknown, expected: unknown, message?: string) {
  const difference = deepDifference(actual, expected, "value");
  if (difference) fail(message ? `${message}: ${difference}` : difference);
}

function ok(value: unknown, message?: string) {
  if (!value)
    fail(message || `Expected a truthy value, received ${display(value)}`);
}

function match(actual: string, expected: RegExp, message?: string) {
  if (typeof actual !== "string" || !(expected instanceof RegExp)) {
    fail("Browser assertion match requires a string and RegExp");
  }
  if (!expected.test(actual)) {
    fail(message || `Expected ${actual} to match ${expected}`);
  }
}

function throws(run: () => unknown, expected?: RegExp, message?: string) {
  if (expected !== undefined && !(expected instanceof RegExp)) {
    fail("Browser assertion throws supports only an optional RegExp");
  }
  let threw = false;
  try {
    run();
  } catch (error) {
    threw = true;
    if (expected) match(String(error), expected, message);
  }
  if (!threw) fail(message || "Expected an exception");
}

function doesNotThrow(run: () => unknown, message?: string) {
  try {
    run();
  } catch (error) {
    fail(message || `Unexpected exception: ${String(error)}`);
  }
}

export default {
  equal,
  strictEqual: equal,
  deepEqual,
  ok,
  match,
  throws,
  doesNotThrow,
};
