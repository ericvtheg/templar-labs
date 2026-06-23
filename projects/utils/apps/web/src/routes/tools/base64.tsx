import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@templar/ui/components/button";
import { Textarea } from "@templar/ui/components/textarea";
import { useMemo, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/base64")({
  component: Base64Tool,
});

type Mode = "encode" | "decode";

function safeEncode(input: string, urlSafe: boolean): string {
  try {
    let out = btoa(input);
    if (urlSafe) {
      out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return out;
  } catch {
    try {
      const bytes = new TextEncoder().encode(input);
      let binary = "";
      for (const b of bytes) {
        binary += String.fromCharCode(b);
      }
      let out = btoa(binary);
      if (urlSafe) {
        out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }
      return out;
    } catch {
      return "";
    }
  }
}

function safeDecode(input: string, urlSafe: boolean): string {
  try {
    let normalized = input.trim();
    if (urlSafe) {
      normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
      const pad = (4 - (normalized.length % 4)) % 4;
      normalized += "=".repeat(pad);
    }
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function Base64Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");

  const output = useMemo(() => {
    if (input === "") {
      return "";
    }
    return mode === "encode" ? safeEncode(input, urlSafe) : safeDecode(input, urlSafe);
  }, [input, mode, urlSafe]);

  return (
    <ToolFrame description="Encode or decode Base64. URL-safe variant optional." title="Base64">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setMode("encode")}
          type="button"
          variant={mode === "encode" ? "default" : "outline"}
        >
          Encode
        </Button>
        <Button
          onClick={() => setMode("decode")}
          type="button"
          variant={mode === "decode" ? "default" : "outline"}
        >
          Decode
        </Button>
        <label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} type="checkbox" />
          URL-safe
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Input</p>
        <Textarea
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "encode" ? "Plain text" : "Base64 string"}
          rows={4}
          value={input}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Output</p>
        <Textarea readOnly rows={4} value={output} />
      </div>

      <CopyButton value={output} label="Copy output" />
    </ToolFrame>
  );
}
