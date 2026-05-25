export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(cents / 100);
}

export function formatSignedCurrency(cents: number): string {
  if (cents === 0) {
    return "$0.00";
  }

  const absolute = formatCurrency(Math.abs(cents));

  return cents > 0 ? `+${absolute}` : `-${absolute}`;
}

export function parseDollarInput(value: string): number | null {
  const normalized = value.trim().replace(/^\$/, "");

  if (normalized.length === 0 || !/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) {
    return null;
  }

  const [dollars = "0", cents = ""] = normalized.split(".");
  const paddedCents = cents.padEnd(2, "0");
  const total = Number.parseInt(dollars || "0", 10) * 100 + Number.parseInt(paddedCents || "0", 10);

  return Number.isSafeInteger(total) ? total : null;
}

export function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parsePercentInput(value: string): number | null {
  const normalized = value.trim().replace(/%$/, "");

  if (normalized.length === 0 || !/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) {
    return null;
  }

  const [whole = "0", fractional = ""] = normalized.split(".");
  const paddedFractional = fractional.padEnd(2, "0");
  const basisPoints =
    Number.parseInt(whole || "0", 10) * 100 + Number.parseInt(paddedFractional || "0", 10);

  return Number.isSafeInteger(basisPoints) ? basisPoints : null;
}

export function basisPointsToPercentInput(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.00$/, "");
}
