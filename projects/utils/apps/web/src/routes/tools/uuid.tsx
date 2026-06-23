import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@templar/ui/components/button";
import { useEffect, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/uuid")({
  component: UuidTool,
});

type UuidVersion = "v4" | "v7";

function generateUuidV4(): string {
  return crypto.randomUUID();
}

function generateUuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);

  const timestamp = Date.now();
  view.setUint16(0, Math.floor(timestamp / 2 ** 32));
  view.setUint32(2, timestamp >>> 0);

  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateUuid(version: UuidVersion): string {
  return version === "v4" ? generateUuidV4() : generateUuidV7();
}

function UuidTool() {
  const [version, setVersion] = useState<UuidVersion>("v4");
  const [uuid, setUuid] = useState<string>("");

  useEffect(() => {
    setUuid(generateUuid("v4"));
  }, []);

  const handleGenerate = () => {
    setUuid(generateUuid(version));
  };

  const handleSelectVersion = (next: UuidVersion) => {
    setVersion(next);
    setUuid(generateUuid(next));
  };

  return (
    <ToolFrame
      description="Client-side UUID v4 and v7. No server, no storage."
      title="UUID Generator"
    >
      <div className="flex items-center gap-2">
        <Button
          onClick={() => handleSelectVersion("v4")}
          type="button"
          variant={version === "v4" ? "default" : "outline"}
        >
          UUID v4
        </Button>
        <Button
          onClick={() => handleSelectVersion("v7")}
          type="button"
          variant={version === "v7" ? "default" : "outline"}
        >
          UUID v7
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {version === "v4" ? "UUID v4 (random)" : "UUID v7 (time-ordered)"}
        </p>
        <p className="mt-2 break-all font-mono text-xl tabular-nums">
          {uuid === "" ? "Generating..." : uuid}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleGenerate} size="lg" type="button">
          Generate
        </Button>
        <CopyButton value={uuid} />
      </div>
    </ToolFrame>
  );
}
