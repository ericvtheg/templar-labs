import { createFileRoute } from "@tanstack/react-router";
import { Textarea } from "@templar/ui/components/textarea";
import { useMemo, useState } from "react";
import { ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/jwt")({
  component: JwtTool,
});

type Decoded = {
  readonly header: unknown;
  readonly payload: unknown;
  readonly exp: string | null;
  readonly iat: string | null;
  readonly error: string | null;
};

function base64UrlToJson(input: string): unknown | null {
  try {
    let normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (normalized.length % 4)) % 4;
    normalized += "=".repeat(pad);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function decodeJwt(token: string): Decoded {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    return {
      header: null,
      payload: null,
      exp: null,
      iat: null,
      error: "Expected 3 dot-separated segments.",
    };
  }
  const headerSeg = parts[0] ?? "";
  const payloadSeg = parts[1] ?? "";
  const header = base64UrlToJson(headerSeg);
  const payload = base64UrlToJson(payloadSeg);
  if (header === null || payload === null) {
    return {
      header,
      payload,
      exp: null,
      iat: null,
      error: "Could not decode header or payload.",
    };
  }
  const claims = (payload ?? {}) as { exp?: unknown; iat?: unknown };
  const exp = typeof claims.exp === "number" ? new Date(claims.exp * 1000).toISOString() : null;
  const iat = typeof claims.iat === "number" ? new Date(claims.iat * 1000).toISOString() : null;
  return { header, payload, exp, iat, error: null };
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JwtTool() {
  const [token, setToken] = useState("");
  const decoded = useMemo(() => (token === "" ? null : decodeJwt(token)), [token]);

  return (
    <ToolFrame
      description="Decode header and payload. exp/iat in human time. Nothing leaves the browser."
      title="JWT Inspector"
    >
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Token</p>
        <Textarea
          className="font-mono"
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOi..."
          rows={4}
          value={token}
        />
      </div>

      {decoded?.error ? <p className="text-sm text-destructive">{decoded.error}</p> : null}

      {decoded && !decoded.error ? (
        <div className="grid gap-3">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Header
            </p>
            <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              {pretty(decoded.header)}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Payload
            </p>
            <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              {pretty(decoded.payload)}
            </pre>
          </div>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
            <div>iat: {decoded.iat ?? "n/a"}</div>
            <div>exp: {decoded.exp ?? "n/a"}</div>
          </div>
        </div>
      ) : null}
    </ToolFrame>
  );
}
