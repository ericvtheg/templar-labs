export interface Issue {
  path: string;
  code: "missing" | "invalid";
  message: string;
}

export type Result<T> =
  | { status: "ok"; value: T }
  | { status: "missing" | "invalid"; issues: Issue[] };

export const ok = <T>(value: T): Result<T> => ({ status: "ok", value });
export const failure = <T = never>(issues: Issue[]): Result<T> => ({
  status: issues.some((issue) => issue.code === "invalid") ? "invalid" : "missing",
  issues,
});
export const bad = <T = never>(path: string, message: string): Result<T> =>
  failure([{ path, code: "invalid", message }]);

export interface RuntimeRecord extends Record<string, unknown> {
  kind?: unknown;
  name?: unknown;
  inputs?: unknown;
  provenance?: unknown;
  asOf?: unknown;
  reference?: unknown;
  value?: unknown;
  financing?: unknown;
  overrides?: unknown;
  constant?: unknown;
  market?: unknown;
  buybox?: unknown;
  mode?: unknown;
  scheme?: unknown;
  pattern?: unknown;
  token?: unknown;
  id?: unknown;
  label?: unknown;
  context?: unknown;
  rows?: unknown;
  setup?: unknown;
  sources?: unknown;
  rules?: unknown;
  input?: unknown;
  version?: unknown;
  cards?: unknown;
  cardId?: unknown;
  propertyKey?: unknown;
  reviewerId?: unknown;
  useful?: unknown;
  correctness?: unknown;
  researchSeconds?: unknown;
  reason?: unknown;
  reveal?: unknown;
  reviewerIds?: unknown;
}

export function record(value: unknown): value is RuntimeRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

export const own = (value: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(value, key) ? value[key] : undefined;

export function text(value: unknown, max = 200): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value === value.trim() &&
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
  );
}

export function dateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function finite(value: unknown, min: number, max: number, integer = false): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  );
}

export const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 && Number.isFinite(numerator / denominator) ? numerator / denominator : null;
