import { createFileRoute } from "@tanstack/react-router";
import { NativeSelect } from "@templar/ui/components/native-select";
import { useMemo, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/cron")({
  component: CronTool,
});

type CronFields = {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

type Field = {
  readonly key: keyof CronFields;
  readonly label: string;
};

const FIELDS: readonly Field[] = [
  { key: "minute", label: "Minute" },
  { key: "hour", label: "Hour" },
  { key: "dayOfMonth", label: "Day of month" },
  { key: "month", label: "Month" },
  { key: "dayOfWeek", label: "Day of week" },
];

const PRESETS: ReadonlyArray<readonly [string, CronFields]> = [
  ["Every minute", { dayOfMonth: "*", dayOfWeek: "*", hour: "*", minute: "*", month: "*" }],
  ["Every 5 minutes", { dayOfMonth: "*", dayOfWeek: "*", hour: "*", minute: "*/5", month: "*" }],
  ["Every hour", { dayOfMonth: "*", dayOfWeek: "*", hour: "*", minute: "0", month: "*" }],
  ["Every day at 00:00", { dayOfMonth: "*", dayOfWeek: "*", hour: "0", minute: "0", month: "*" }],
  ["Every Monday 09:00", { dayOfMonth: "*", dayOfWeek: "1", hour: "9", minute: "0", month: "*" }],
];

const FIELD_OPTIONS: Readonly<Record<keyof CronFields, readonly string[]>> = {
  minute: ["*", "0", "15", "30", "45", "*/5", "*/15", "*/30"],
  hour: ["*", "0", "6", "9", "12", "18", "*/2", "*/6"],
  dayOfMonth: ["*", "1", "15", "*/5", "*/10"],
  month: ["*", "1", "3", "6", "9", "12", "*/2", "*/3"],
  dayOfWeek: ["*", "0", "1", "2", "3", "4", "5", "6"],
};

function cronFieldRegex(field: string): boolean {
  return /^(\*|\d+(\/\d+)?)(-(\d+))?(,(\*|\d+(\/\d+)?)(-(\d+))?)*$/.test(field);
}

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const out: number[] = [];
    for (let i = min; i <= max; i += 1) {
      out.push(i);
    }
    return out;
  }
  const out: number[] = [];
  for (const part of field.split(",")) {
    const stepMatch = /^(\*|\d+)(?:\/(\d+))?$/.exec(part);
    const rangeMatch = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const step = rangeMatch[3] ? Number(rangeMatch[3]) : 1;
      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) {
          out.push(i);
        }
      }
    } else if (stepMatch) {
      const base = stepMatch[1];
      const step = stepMatch[2] ? Number(stepMatch[2]) : 1;
      if (base === "*") {
        for (let i = min; i <= max; i += step) {
          out.push(i);
        }
      } else {
        const start = Number(base);
        for (let i = start; i <= max; i += step) {
          if (i >= min && i <= max) {
            out.push(i);
          }
        }
      }
    }
  }
  return Array.from(new Set(out)).toSorted((a, b) => a - b);
}

function nextFireTimes(cron: string, count: number, from: Date = new Date()): Date[] {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(/\s+/);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return [];
  }
  if (
    ![
      [minute, 0, 59],
      [hour, 0, 23],
      [dayOfMonth, 1, 31],
      [month, 1, 12],
      [dayOfWeek, 0, 6],
    ].every(
      ([f, lo, hi]) =>
        cronFieldRegex(f as string) &&
        parseCronField(f as string, lo as number, hi as number).length > 0,
    )
  ) {
    return [];
  }
  const minutes = parseCronField(minute, 0, 59);
  const hours = parseCronField(hour, 0, 23);
  const daysOfMonth = parseCronField(dayOfMonth, 1, 31);
  const months = parseCronField(month, 1, 12);
  const daysOfWeek = parseCronField(dayOfWeek, 0, 6);

  const out: Date[] = [];
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);
  const limitMs = from.getTime() + 365 * 24 * 60 * 60 * 1000;

  let tick = start.getTime();
  while (out.length < count && tick <= limitMs) {
    const cursor = new Date(tick);
    const matchesDow = daysOfWeek.length === 7 || daysOfWeek.includes(cursor.getDay());
    const matchesDom = daysOfMonth.length === 31 || daysOfMonth.includes(cursor.getDate());
    const matchesMonth = months.includes(cursor.getMonth() + 1);
    const matchesHour = hours.includes(cursor.getHours());
    const matchesMinute = minutes.includes(cursor.getMinutes());
    if (matchesDow && matchesDom && matchesMonth && matchesHour && matchesMinute) {
      out.push(cursor);
    }
    tick += 60 * 1000;
  }
  return out;
}

function CronTool() {
  const [fields, setFields] = useState<CronFields>({
    dayOfMonth: "*",
    dayOfWeek: "*",
    hour: "*",
    minute: "*",
    month: "*",
  });

  const cron = useMemo(
    () =>
      `${fields.minute} ${fields.hour} ${fields.dayOfMonth} ${fields.month} ${fields.dayOfWeek}`,
    [fields],
  );

  const next = useMemo(() => nextFireTimes(cron, 5), [cron]);

  const handleField = (key: keyof CronFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handlePreset = (preset: CronFields) => {
    setFields(preset);
  };

  return (
    <ToolFrame
      description="Build a crontab string and see the next 5 fire times."
      title="Cron Builder"
    >
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([label, preset]) => (
          <button
            className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            key={label}
            onClick={() => handlePreset(preset)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {field.label}
            </p>
            <NativeSelect
              onChange={(e) => handleField(field.key, e.target.value)}
              value={fields[field.key]}
            >
              {FIELD_OPTIONS[field.key].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Crontab</p>
        <p className="mt-2 break-all font-mono text-xl">{cron}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Next 5 fire times
        </p>
        <pre className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          {next.length > 0
            ? next.map((d) => d.toISOString()).join("\n")
            : "No upcoming fire times. Check field values."}
        </pre>
      </div>

      <CopyButton value={cron} label="Copy crontab" />
    </ToolFrame>
  );
}
