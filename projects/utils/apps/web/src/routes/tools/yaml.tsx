import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@templar/ui/components/button";
import { Textarea } from "@templar/ui/components/textarea";
import { useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/yaml")({
  component: YamlTool,
});

type Direction = "to-json" | "to-yaml";

function YamlTool() {
  const [direction, setDirection] = useState<Direction>("to-json");
  const [input, setInput] = useState("");

  const { error, output } = useMemo(() => {
    if (input.trim() === "") {
      return { error: null, output: "" };
    }
    try {
      if (direction === "to-json") {
        const parsed = parseYaml(input);
        return { error: null, output: JSON.stringify(parsed, null, 2) };
      }
      const parsed = JSON.parse(input);
      return { error: null, output: stringifyYaml(parsed) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), output: "" };
    }
  }, [input, direction]);

  return (
    <ToolFrame
      description="Round-trip convert between YAML and JSON in the browser."
      title="YAML \u2194 JSON"
    >
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setDirection("to-json")}
          type="button"
          variant={direction === "to-json" ? "default" : "outline"}
        >
          {"YAML \u2192 JSON"}
        </Button>
        <Button
          onClick={() => setDirection("to-yaml")}
          type="button"
          variant={direction === "to-yaml" ? "default" : "outline"}
        >
          {"JSON \u2192 YAML"}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Input ({direction === "to-json" ? "YAML" : "JSON"})
        </p>
        <Textarea
          className="font-mono"
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          value={input}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Output ({direction === "to-json" ? "JSON" : "YAML"})
        </p>
        <Textarea className="font-mono" readOnly rows={6} value={output} />
      </div>

      <CopyButton value={output} label="Copy output" />
    </ToolFrame>
  );
}
