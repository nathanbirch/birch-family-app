/**
 * A deterministic YAML emitter, just large enough for an OpenAPI document.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT A YAML LIBRARY
 * ---------------------------------------------------------------------------
 * The committed `.openapi.yaml` has to be generated from the same TypeScript
 * the route handlers use, or it drifts — and a drifted Action schema is how a
 * Custom GPT ends up confidently describing a field that no longer exists.
 * Generating it needs an emitter.
 *
 * A dependency would do the job, but this is a family app that ships nine
 * runtime packages, the input is a plain object this repository controls
 * entirely, and the required subset of YAML is scalars, lists and maps. Sixty
 * lines here is a better trade than a package, an audit surface and a
 * `package-lock.json` churn — and it is unit-tested in
 * `tests/family-api-openapi.test.ts` against a round trip through `JSON.parse`,
 * because every document this emits is also valid JSON-compatible YAML.
 *
 * Deterministic on purpose: the same input must produce byte-identical output
 * every time, so the test that asserts the committed file matches the
 * generator is a real check rather than a coin toss.
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

/** Characters that force a scalar to be quoted rather than written bare. */
const NEEDS_QUOTES = /^$|^[-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|^\s|[\n\r\t]|^(?:true|false|null|yes|no|on|off|~)$|^[-+]?[\d.]+$/i;

function scalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot emit a non-finite number as YAML: ${value}`);
    }
    return String(value);
  }

  if (!NEEDS_QUOTES.test(value)) return value;

  // Double quotes with JSON escaping. JSON string escapes are a subset of
  // YAML's double-quoted escapes, so `JSON.stringify` is exactly right here
  // and handles newlines, quotes and non-ASCII without a second opinion.
  return JSON.stringify(value);
}

function isPlainObject(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emit(value: YamlValue, indent: number): string[] {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];

    const lines: string[] = [];
    for (const item of value) {
      if (isPlainObject(item) || Array.isArray(item)) {
        const nested = emit(item, indent + 1);
        // Hoist the first line up onto the dash, which is how YAML lists of
        // maps are conventionally written and how anybody reading the file
        // expects it to look.
        lines.push(`${pad}- ${nested[0].trimStart()}`);
        lines.push(...nested.slice(1));
      } else {
        lines.push(`${pad}- ${scalar(item)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [`${pad}{}`];

    const lines: string[] = [];
    for (const key of keys) {
      const child = value[key];
      const name = scalar(key);

      if (isPlainObject(child) && Object.keys(child).length === 0) {
        lines.push(`${pad}${name}: {}`);
      } else if (Array.isArray(child) && child.length === 0) {
        lines.push(`${pad}${name}: []`);
      } else if (isPlainObject(child) || Array.isArray(child)) {
        lines.push(`${pad}${name}:`);
        // A list nested under a key is indented, which YAML permits and which
        // keeps the emitter's indentation rule to exactly one case.
        lines.push(...emit(child, indent + 1));
      } else {
        lines.push(`${pad}${name}: ${scalar(child)}`);
      }
    }
    return lines;
  }

  return [`${pad}${scalar(value)}`];
}

/** Serialise a document. Always ends in exactly one newline. */
export function toYaml(document: YamlValue): string {
  return emit(document, 0).join("\n") + "\n";
}
