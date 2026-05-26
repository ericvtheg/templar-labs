import process from "node:process";
import { fileURLToPath } from "node:url";

export const devPorts = {
  "cardiff-split-web": 5177,
  "hello-world-web": 5173,
  "launch-room-web": 5175,
  "loan-payment-calculator-web": 5176,
  "swedish-fifty-web": 5178,
  "ui-showcase-web": 5174,
} as const;

export type DevPortName = keyof typeof devPorts;

export function devPort(name: DevPortName): number {
  return devPorts[name];
}

export function checkDevPorts(): string[] {
  const failures: string[] = [];
  const seenPorts = new Map<number, string>();

  for (const [name, port] of Object.entries(devPorts)) {
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
      failures.push(`${name} uses invalid port ${port}.`);
    }

    const previousName = seenPorts.get(port);

    if (previousName) {
      failures.push(`${name} and ${previousName} both use port ${port}.`);
    }

    seenPorts.set(port, name);
  }

  return failures;
}

function listDevPorts() {
  for (const [name, port] of Object.entries(devPorts)) {
    console.log(`${name}: ${port}`);
  }
}

function getDevPort(name: string | undefined) {
  if (!name) {
    console.error("Usage: pnpm dev-ports get <name>");
    process.exitCode = 1;
    return;
  }

  if (!(name in devPorts)) {
    console.error(`No dev port registered for ${name}.`);
    process.exitCode = 1;
    return;
  }

  console.log(devPort(name as DevPortName));
}

function runCheck() {
  const failures = checkDevPorts();

  if (failures.length > 0) {
    console.error("Dev port check failed:\n");

    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("Dev port check passed.");
}

function runCli([command, name]: string[]) {
  switch (command) {
    case undefined:
    case "list":
      listDevPorts();
      break;
    case "get":
      getDevPort(name);
      break;
    case "check":
      runCheck();
      break;
    default:
      console.error(`Unknown dev-ports command: ${command}`);
      console.error("Usage: pnpm dev-ports [list|check|get <name>]");
      process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2));
}
