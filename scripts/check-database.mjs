/**
 * Can this machine reach the database?
 *
 *   npm run db:check
 *
 * Works through the connection one layer at a time — DNS, then TCP, then TLS,
 * then MongoDB itself — and stops at the first thing that fails.
 *
 * That layering is the whole point. "Cannot connect" has several very
 * different causes and the driver reports most of them identically, but each
 * one fails at its own layer:
 *
 *   TCP times out ............ the network you are on blocks outbound 27017
 *   TLS is rejected .......... your IP is not on the Atlas allowlist
 *   TLS hangs ................ the cluster is paused
 *   MongoDB refuses .......... wrong username or password
 *
 * So the layer that breaks tells you which problem you have, without guessing.
 */

import { Resolver } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { MongoClient } from "mongodb";

const TIMEOUT_MS = 8000;
const MONGO_PORT = 27017;

const tick = "  ✓";
const cross = "  ✗";

function fail(heading, detail) {
  console.log(`\n${heading}\n`);
  for (const line of detail) console.log(`  ${line}`);
  console.log("");
  process.exit(1);
}

/** Pulls the hostname out of the URI without printing the password. */
function parseUri(uri) {
  const match = /^mongodb(\+srv)?:\/\/(?:([^:@]+)(?::[^@]*)?@)?([^/?,]+)/.exec(uri);
  if (!match) {
    fail("MONGODB_URI could not be parsed.", [
      "Expected something like:",
      "  mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/",
    ]);
  }
  return {
    srv: Boolean(match[1]),
    username: match[2] ?? "(none)",
    host: match[3],
  };
}

function withTimeout(socket, label) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(TIMEOUT_MS, () => done({ ok: false, reason: "timeout" }));
    socket.on("error", (error) =>
      done({ ok: false, reason: "error", error: error.message }),
    );
    socket.on(label, () => done({ ok: true }));
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail("MONGODB_URI is not set.", [
      "This script reads .env via `node --env-file`.",
      "Check that .env exists and contains MONGODB_URI. See .env.example.",
    ]);
  }

  const { srv, username, host } = parseUri(uri);
  console.log("\nChecking the database connection\n");
  console.log(`  cluster   ${host}`);
  console.log(`  user      ${username}`);
  console.log(`  scheme    mongodb${srv ? "+srv" : ""}\n`);

  /* 1. DNS ---------------------------------------------------------------- */

  let targets = [{ host, port: MONGO_PORT }];

  if (srv) {
    try {
      const records = await new Resolver().resolveSrv(`_mongodb._tcp.${host}`);
      if (!records.length) throw new Error("no SRV records");
      targets = records.map((r) => ({ host: r.name, port: r.port }));
      console.log(`${tick} DNS      resolved ${records.length} cluster members`);
    } catch (error) {
      fail("DNS lookup failed.", [
        `Could not resolve _mongodb._tcp.${host}`,
        `  ${error.message}`,
        "",
        "This is unusual. Either the cluster address is wrong, or something on",
        "this network is intercepting DNS. Try a phone hotspot to compare.",
      ]);
    }
  }

  const target = targets[0];

  /* 2. TCP ---------------------------------------------------------------- */

  const tcp = await withTimeout(
    net.connect(target.port, target.host),
    "connect",
  );

  if (!tcp.ok) {
    console.log(`${cross} TCP      cannot open ${target.host}:${target.port}`);
    fail("The network you are on is blocking MongoDB.", [
      tcp.reason === "timeout"
        ? "The connection timed out with no response at all."
        : `The connection was refused: ${tcp.error}`,
      "",
      "THIS IS ALMOST CERTAINLY THE BUILDING'S NETWORK.",
      "",
      "Corporate, hotel, school and guest wifi very often allow only ports",
      "80 and 443, and MongoDB needs outbound 27017. Nothing about the app,",
      "the credentials or the Atlas settings is at fault here.",
      "",
      "To confirm in thirty seconds: tether to your phone and re-run this.",
      "If it passes on cellular, it is the building.",
      "",
      "Workarounds: use your phone's hotspot, or a VPN that tunnels all",
      "traffic. The deployed app on Vercel is unaffected either way — this",
      "only blocks connecting from this machine.",
    ]);
  }

  console.log(`${tick} TCP      port ${target.port} is reachable`);

  /* 3. TLS ---------------------------------------------------------------- */

  const handshake = await withTimeout(
    tls.connect({
      host: target.host,
      port: target.port,
      servername: target.host,
    }),
    "secureConnect",
  );

  if (!handshake.ok) {
    const rejected =
      handshake.reason === "error" &&
      /alert|ssl|tls/i.test(handshake.error ?? "");

    console.log(`${cross} TLS      handshake ${rejected ? "rejected" : "hung"}`);

    if (rejected) {
      fail("Atlas refused the TLS handshake — your IP is not allowlisted.", [
        `  ${handshake.error}`,
        "",
        "Atlas rejects non-allowlisted IPs during the handshake, before it",
        "ever looks at your username and password, which is why the error",
        "mentions neither Atlas nor allowlists.",
        "",
        "Fix: https://cloud.mongodb.com -> Network Access ->",
        "     Add IP Address -> Add Current IP Address",
        "",
        "Note that this is a different IP for every network you connect from,",
        "so a new building means a new allowlist entry.",
      ]);
    }

    fail("Something accepted the connection but never completed TLS.", [
      "TCP connected, so outbound 27017 is not simply blocked — but nothing",
      "answered the handshake. Two things look identical from here:",
      "",
      "  1. THE CLUSTER IS PAUSED (or still resuming). Atlas free-tier",
      "     clusters pause themselves after 60 days idle.",
      "     Check: https://cloud.mongodb.com -> Cluster0. If it says Paused,",
      "     hit Resume and wait a few minutes.",
      "",
      "  2. A FIREWALL IS INTERCEPTING. Some corporate, hotel and guest",
      "     networks complete the TCP handshake at a proxy and then silently",
      "     drop anything that is not HTTP. That produces exactly this",
      "     symptom, which is why TCP succeeding does not rule the network",
      "     out on its own.",
      "",
      "TO TELL THEM APART: tether to your phone and re-run this check.",
      "",
      "  passes on cellular ....... the building was the problem",
      "  same failure on cellular . the cluster is paused, fix it in Atlas",
      "",
      "Either way the deployed app on Vercel is unaffected — this only",
      "concerns connecting from this machine.",
    ]);
  }

  console.log(`${tick} TLS      handshake completed`);

  /* 4. MongoDB ------------------------------------------------------------ */

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(`${tick} MongoDB  authenticated and responding`);

    const db = client.db("birch_family_app");
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name).sort();

    console.log("\nAll good — the database is reachable from here.\n");
    console.log(`  database    birch_family_app`);
    console.log(
      `  collections ${names.length ? names.join(", ") : "(none yet — run `npm run db:seed`)"}`,
    );
    if (names.includes("users")) {
      console.log(`  users       ${await db.collection("users").countDocuments()}`);
    }
    console.log("");
  } catch (error) {
    const message = error.message ?? String(error);
    console.log(`${cross} MongoDB  ${message.split("\n")[0]}`);

    if (/Authentication failed|bad auth/i.test(message)) {
      fail("MongoDB rejected the credentials.", [
        "The network and TLS are both fine, so this is purely the username or",
        "password in MONGODB_URI.",
        "",
        "Check them at https://cloud.mongodb.com -> Database Access.",
      ]);
    }

    fail("Connected, but MongoDB did not respond as expected.", [message]);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  fail("The check itself failed.", [error?.stack ?? String(error)]);
});
