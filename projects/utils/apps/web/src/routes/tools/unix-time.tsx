import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@templar/ui/components/button";
import { Input } from "@templar/ui/components/input";
import { useEffect, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/unix-time")({
  component: UnixTimeTool,
});

function UnixTimeTool() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [epoch, setEpoch] = useState<string>(() => String(now));
  const [iso, setIso] = useState<string>(() => new Date(now * 1000).toISOString());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleEpochChange = (value: string) => {
    setEpoch(value);
    const parsed = Number(value);
    if (value.trim() !== "" && Number.isFinite(parsed)) {
      const ms = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
      setIso(new Date(ms).toISOString());
    }
  };

  const handleIsoChange = (value: string) => {
    setIso(value);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      setEpoch(String(Math.floor(parsed / 1000)));
    }
  };

  const handleNow = () => {
    const current = Math.floor(Date.now() / 1000);
    setNow(current);
    setEpoch(String(current));
    setIso(new Date(current * 1000).toISOString());
  };

  return (
    <ToolFrame
      description="Convert between Unix epoch and ISO 8601 in both directions."
      title="Unix Time"
    >
      <div className="text-sm text-muted-foreground font-mono">
        now: <span className="text-foreground tabular-nums">{now}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleNow} type="button">
          Use now
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Epoch (seconds or milliseconds)
        </p>
        <Input
          inputMode="numeric"
          onChange={(e) => handleEpochChange(e.target.value)}
          value={epoch}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          ISO 8601
        </p>
        <Input onChange={(e) => handleIsoChange(e.target.value)} value={iso} />
      </div>

      <div className="flex items-center gap-2">
        <CopyButton value={epoch} label="Copy epoch" />
        <CopyButton value={iso} label="Copy ISO" />
      </div>
    </ToolFrame>
  );
}
