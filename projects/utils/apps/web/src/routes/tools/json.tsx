import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@templar/ui/components/button";
import { Textarea } from "@templar/ui/components/textarea";
import { useMemo, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/json")({
  component: JsonTool,
});

type Mode = "pretty" | "minify" | "escape";

function transform(input: string, mode: Mode): { error: string | null; output: string } {
  if (input.trim() === "") {
    return { error: null, output: "" };
  }
  try {
    const parsed: unknown = JSON.parse(input);
    if (mode === "pretty") {
      return { error: null, output: JSON.stringify(parsed, null, 2) };
    }
    if (mode === "minify") {
      return { error: null, output: JSON.stringify(parsed) };
    }
    return { error: null, output: JSON.stringify(JSON.stringify(parsed, null, 2)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), output: "" };
  }
}

function JsonTool() {
  const [mode, setMode] = useState<Mode>("pretty");
  const [input, setInput] = useState("");

  const { error, output } = useMemo(() => transform(input, mode), [input, mode]);

  return (
    <ToolFrame
      description="Pretty-print, minify, or escape JSON. Errors inline."
      title="JSON Pretty"
    >
      <div className="flex items-center gap-2">
        {(["pretty", "minify", "escape"] as const).map((m) => (
          <Button
            key={m}
            onClick={() => setMode(m)}
            type="button"
            variant={mode === m ? "default" : "outline"}
          >
            {m}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Input</p>
        <Textarea
          className="font-mono"
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          value={input}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Output</p>
        <Textarea className="font-mono" readOnly rows={6} value={output} />
      </div>

      <CopyButton value={output} label="Copy output" />
    </ToolFrame>
  );
}
