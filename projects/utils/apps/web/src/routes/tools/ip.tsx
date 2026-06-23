import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/ip")({
  component: IpTool,
});

type IpInfo = {
  readonly ip: string | null;
  readonly headers: ReadonlyArray<readonly [string, string]>;
};

const fetchIp = createServerFn({ method: "GET" }).handler((ctx) => {
  const request = (ctx as { readonly request?: Request }).request;
  if (!request) {
    return { headers: [], ip: null } satisfies IpInfo;
  }
  const cf = (
    request as unknown as {
      readonly cf?: { readonly ip?: string };
    }
  ).cf;
  const ip =
    cf?.ip ??
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null;
  const headers: ReadonlyArray<readonly [string, string]> = Array.from(
    request.headers.entries(),
  ).map(([name, value]) => [name, value] as const);
  return { headers, ip } satisfies IpInfo;
});

function IpTool() {
  const [info, setInfo] = useState<IpInfo | null>(null);

  useEffect(() => {
    void fetchIp().then((data) => setInfo(data as IpInfo));
  }, []);

  return (
    <ToolFrame
      description="Your public IP and request headers, straight off the edge."
      title="My IP"
    >
      <div className="rounded-lg border bg-muted/40 px-4 py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Public IP
        </p>
        <p className="mt-2 break-all font-mono text-xl">{info?.ip ?? "loading..."}</p>
      </div>
      {info?.ip ? <CopyButton value={info.ip} label="Copy IP" /> : null}
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Headers</p>
        <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          {(info?.headers ?? []).map(([name, value]) => `${name}: ${value}`).join("\n")}
        </pre>
      </div>
    </ToolFrame>
  );
}
