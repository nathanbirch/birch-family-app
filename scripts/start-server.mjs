/**
 * Starts the production server on the first free port.
 *
 *   npm start
 *
 * `next start` takes a single port and gives up if something is already
 * listening on it — which happens often enough locally (a stray server, a dev
 * server, another project) to be worth handling. So we walk a small range,
 * 3000 to 3005, and hand the first free port to Next. If all six are taken we
 * say so and exit rather than starting on some arbitrary port.
 *
 * The check is a real bind: we open a server on the port and close it again.
 * That is the same thing Next is about to do, so it answers the actual
 * question, rather than guessing from a list of processes.
 *
 * Extra arguments are forwarded, so `npm start -- --keepAliveTimeout 70000`
 * still works. Passing your own `-p`/`--port` is not supported here; set PORT
 * instead and the search starts from there.
 */

import net from "node:net";
import { spawn } from "node:child_process";

const FIRST_PORT = Number(process.env.PORT) || 3000;
const ATTEMPTS = 6;
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

/** Resolves true if we can bind the port ourselves right now. */
function isFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, HOSTNAME);
  });
}

const ports = Array.from({ length: ATTEMPTS }, (_, i) => FIRST_PORT + i);
const last = ports[ports.length - 1];

let port;
for (const candidate of ports) {
  if (await isFree(candidate)) {
    port = candidate;
    break;
  }
  const suffix = candidate < last ? `, trying ${candidate + 1}...` : ".";
  console.log(`Port ${candidate} is in use${suffix}`);
}

if (port === undefined) {
  console.error(
    `\nNo free port between ${FIRST_PORT} and ${last}. ` +
      `Stop whatever is using them, or set PORT to start the search elsewhere.\n`,
  );
  process.exit(1);
}

if (port !== FIRST_PORT) console.log(`Starting on port ${port}.`);

// Between the probe closing and Next binding, another process could take the
// port. Nothing we can do about that gap, and Next's own error is clear enough.
const next = spawn(
  "next",
  ["start", "--port", String(port), ...process.argv.slice(2)],
  { stdio: "inherit", shell: process.platform === "win32" },
);

next.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
