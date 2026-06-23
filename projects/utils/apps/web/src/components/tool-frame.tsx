import { Button } from "@templar/ui/components/button";
import type * as React from "react";
import { useState } from "react";

type ToolFrameProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
};

export function ToolFrame({ title, description, children }: ToolFrameProps) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

type CopyButtonProps = {
  readonly value: string;
  readonly label?: string;
};

export function CopyButton({ value, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (value === "") {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button disabled={value === ""} onClick={handleCopy} size="sm" type="button" variant="outline">
      {copied ? "Copied!" : label}
    </Button>
  );
}
