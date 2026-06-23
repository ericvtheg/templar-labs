export const tools = [
  {
    blurb: "UUID v4 and v7",
    name: "UUID Generator",
    slug: "uuid",
  },
  {
    blurb: "Epoch \u2194 ISO in both directions",
    name: "Unix Time",
    slug: "unix-time",
  },
  {
    blurb: "Encode / decode, URL-safe toggle",
    name: "Base64",
    slug: "base64",
  },
  {
    blurb: "Hex / RGB / HSL with swatch",
    name: "RGB / HSL / Hex",
    slug: "rgb",
  },
  {
    blurb: "Decode header and payload, exp in human time",
    name: "JWT Inspector",
    slug: "jwt",
  },
  {
    blurb: "Public IP, user-agent, country",
    name: "My IP",
    slug: "ip",
  },
  {
    blurb: "Pick fields, get crontab, see next fire times",
    name: "Cron Builder",
    slug: "cron",
  },
  {
    blurb: "Pretty-print, minify, escape",
    name: "JSON Pretty",
    slug: "json",
  },
  {
    blurb: "Round-trip convert",
    name: "YAML \u2194 JSON",
    slug: "yaml",
  },
] as const;

export type Tool = (typeof tools)[number];
export type ToolSlug = Tool["slug"];

export function findTool(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}
