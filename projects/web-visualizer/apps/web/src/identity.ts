export type ShowColors = readonly [string, string, string];

export const colorPresets: { name: string; colors: ShowColors }[] = [
  { name: "Neon", colors: ["#00d9ff", "#ff287e", "#edfcff"] },
  { name: "Ultraviolet", colors: ["#a352ff", "#ff6c24", "#ffe1ba"] },
  { name: "Acid", colors: ["#b8ff24", "#00dcb4", "#f4ffd9"] },
];

export function colorVector(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function artistLabel(name: string): string {
  return Array.from(name.trim().replace(/\s+/gu, " ")).slice(0, 40).join("");
}
