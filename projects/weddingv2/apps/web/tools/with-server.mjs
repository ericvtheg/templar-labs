// Run a command with the dev server up, then stop the server again.
// usage: node tools/with-server.mjs <command> [args...]
//        node tools/with-server.mjs node tools/fit-canva.mjs --check
// If a server is already running on the port, the command just runs against it.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const url = "http://127.0.0.1:5191/";
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("usage: node tools/with-server.mjs <command> [args...]");
  process.exit(1);
}

async function up() {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilUp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await up()) {
      return true;
    }
    await delay(250);
  }
  return false;
}

function run(program, programArgs) {
  return new Promise((resolve) => {
    const child = spawn(program, programArgs, { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

let server = null;
if (!(await up())) {
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  if (!(await waitUntilUp())) {
    server.kill();
    console.error("The dev server did not start.");
    process.exit(1);
  }
}

const code = await run(command, args);
server?.kill();
process.exit(code);
