import { bad, finite, ok, type Result, record, text } from "./validation.ts";

export interface CsvLimits {
  maxChars?: number;
  maxRows?: number;
  maxColumns?: number;
  maxCellChars?: number;
}
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(input: unknown, options: unknown = {}): Result<CsvTable> {
  if (typeof input !== "string" || !record(options)) {
    return bad("csv", "Expected CSV text and a limits object");
  }
  const defaults = {
    maxChars: 5_000_000,
    maxRows: 50_000,
    maxColumns: 100,
    maxCellChars: 10_000,
  };
  const limits = { ...defaults };
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(defaults, key)) {
      return bad("limits", "Unknown limit");
    }
    const typedKey = key as keyof typeof defaults;
    const value = options[key];
    if (!finite(value, 1, defaults[typedKey], true)) {
      return bad(`limits.${key}`, "Limits must be positive integers no larger than hard caps");
    }
    limits[typedKey] = value;
  }
  if (input.length > limits.maxChars) {
    return bad("csv", "CSV exceeds character limit");
  }
  const source = input.startsWith("\ufeff") ? input.slice(1) : input;
  if (!source.length) {
    return bad("csv", "CSV header required");
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let atStart = true;
  let endedRow = false;
  const pushField = () => {
    row.push(field);
    field = "";
    closed = false;
    atStart = true;
    return row.length <= limits.maxColumns;
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
    return rows.length <= limits.maxRows + 1;
  };
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    endedRow = false;
    if (character === "\0") {
      return bad("csv", "NUL is not supported");
    }
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += character;
      }
    } else if (character === ",") {
      if (!pushField()) {
        return bad("csv", "Column limit exceeded");
      }
    } else if (character === "\r" || character === "\n") {
      if (!pushField() || !pushRow()) {
        return bad("csv", "Row or column limit exceeded");
      }
      if (character === "\r" && source[index + 1] === "\n") {
        index++;
      }
      endedRow = true;
    } else if (closed) {
      return bad("csv", "Unexpected content after a closing quote");
    } else if (character === '"') {
      if (!atStart) {
        return bad("csv", "Quote inside unquoted field");
      }
      quoted = true;
      atStart = false;
    } else {
      field += character;
      atStart = false;
    }
    if (field.length > limits.maxCellChars) {
      return bad("csv", "Cell limit exceeded");
    }
  }
  if (quoted) {
    return bad("csv", "Unclosed quoted field");
  }
  if (!endedRow) {
    if (!pushField() || !pushRow()) {
      return bad("csv", "Row or column limit exceeded");
    }
  }
  const headers = rows.shift();
  if (
    !headers ||
    headers.some((header) => !text(header, limits.maxCellChars)) ||
    new Set(headers).size !== headers.length
  ) {
    return bad(
      "headers",
      "Headers must be nonempty unique literal strings without boundary whitespace",
    );
  }
  if (rows.some((entry) => entry.length !== headers.length)) {
    return bad("csv", "Every row must match header width");
  }
  return ok({ headers, rows });
}

export type ContextColumn = string | { constant: string };
export interface IdentifierCsvMapping {
  market: ContextColumn;
  scheme: ContextColumn;
  token: string;
}
export interface IdentifierRow {
  market: unknown;
  scheme: unknown;
  token: unknown;
}

export function mapIdentifierCsv(
  input: unknown,
  mapping: unknown,
  limits: unknown = {},
): Result<IdentifierRow[]> {
  const parsed = parseCsv(input, limits);
  if (parsed.status !== "ok") {
    return parsed;
  }
  if (!record(mapping)) {
    return bad("mapping", "Expected exact header mapping");
  }
  const { headers, rows } = parsed.value;
  const indices: Record<string, number | string> = {};
  for (const key of ["market", "scheme", "token"]) {
    const selected = mapping[key];
    if (key !== "token" && record(selected) && text(selected.constant)) {
      indices[key] = selected.constant;
    } else if (typeof selected === "string" && headers.includes(selected)) {
      indices[key] = headers.indexOf(selected);
    } else {
      return bad(
        `mapping.${key}`,
        "Expected an existing exact header, or explicit context constant",
      );
    }
  }
  return ok(
    rows.map((row) => {
      const value = (key: string): unknown =>
        typeof indices[key] === "number" ? row[indices[key] as number] : indices[key];
      return { market: value("market"), scheme: value("scheme"), token: value("token") };
    }),
  );
}
