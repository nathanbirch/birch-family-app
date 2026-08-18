# Database

## What and where

| | |
|---|---|
| **Provider** | MongoDB Atlas |
| **Cluster** | `cluster0.pmxixtt.mongodb.net` |
| **Database** | `birch_family_app` |
| **Driver** | `mongodb` (official Node driver) |
| **Connection string** | `MONGODB_URI` in `.env` — never committed |

---

## This app stays in its own database

The cluster is shared with other applications. Rather than scattering
prefixed collections through somebody else's database, this app claims
**`birch_family_app`** and never reads or writes outside it.

That guarantee is enforced in one place. The connection string deliberately has
no database path on the end, so the driver has no default to fall back on, and
every query in the app goes through `getDb()`:

```ts
// src/lib/db.ts
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);        // src/config/db.ts
}
```

There is no code path that reaches another database. Nothing this app does can
collide with, overwrite, or even see another app's data.

---

## Collections

Declared in [`src/config/db.ts`](../src/config/db.ts). Add new ones there rather
than hardcoding strings at the call site.

### `users`

One document per person who can sign in.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `email` | string | Lowercased. Unique index. The login identifier. |
| `passwordHash` | string | bcrypt, cost 12. Never leaves the server. |
| `displayName` | string | Shown on the dashboard and account page. |
| `createdAt` / `updatedAt` | Date | |

**Indexes:** `email_unique` — unique on `email`. This is what actually enforces
one account per email; the check in `createUserIfAbsent` is a convenience, not
the guarantee.

### `sessions`

One document per signed-in device.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | The cookie holds a signed pointer to this. |
| `userId` | ObjectId | → `users._id` |
| `createdAt` | Date | |
| `lastSeenAt` | Date | |
| `expiresAt` | Date | 30 days after creation. |

**Indexes:**

- `session_ttl` — TTL index on `expiresAt` with `expireAfterSeconds: 0`.
  MongoDB deletes expired sessions itself, so the collection cannot grow
  without bound and there is no cleanup job to forget about. Mongo sweeps about
  once a minute, so the app also re-checks `expiresAt` on read.
- `by_user` — so "sign out everywhere" stays cheap when it is built.

Deleting a session document signs that device out immediately. That is the
whole reason the cookie is a pointer rather than a self-contained token — see
[Authentication](authentication.md).

### `petRotations`

One document per animal: who sleeps with Bella and Leia tonight. The first
collection holding something the family can *see* rather than something the
login needs.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `petId` | string | `"bella"` / `"leia"` — an id from `src/config/pets.ts`. Unique index. |
| `order` | string[] | Child ids, in the order they take their turn. **The same list for every pet.** |
| `anchorDate` | string | `YYYY-MM-DD`, a local calendar date. |
| `anchorChildId` | string | Who sleeps with this pet on `anchorDate`. |
| `updatedAt` | Date | |

**Indexes:** `pet_unique` — unique on `petId`. One row per animal.

Two things this collection does differently, both deliberate:

- **Reads are forgiving.** A missing, malformed or unsafe document does not
  take the seating page down — `src/lib/pets/store.ts` logs it and falls back
  to the rotation compiled into `src/config/pets.ts`.
- **Writes are strict.** The seed refuses a configuration that would let one
  child end up with both animals on the same night.

Editing it by hand is a supported way to re-anchor the rotation. See
[Pets](pets.md#re-anchoring) for the `updateOne` and the one rule to respect.

---

### `choreRotations`

Who has which chore, and when it changes hands. One document per pool.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `poolId` | string | `"elder-pair"` / `"younger-pair"` — an id from `src/config/chore-rotation.ts`. Unique index. A document whose `poolId` is no longer one of those is ignored by the app and deleted by the next seed. |
| `name` | string | Shown when the page explains a rotation. |
| `children` | string[] | Child ids, in the order the chores walk through them. **Reordering reassigns chores.** |
| `chores` | string[] | Task ids from `src/config/stars.ts`, in *dealing* order — consecutive entries go to different children. |
| `anchorWeek` | string | `YYYY-MM-DD`, and it must be a **Monday**. The week this deal is known to be right for; the chores swap on Monday morning. |
| `updatedAt` | Date | |

**Indexes:** `pool_unique` — unique on `poolId`.

Same two rules as `petRotations`: reads fall back to the pools compiled into
`src/config/chore-rotation.ts`, and the seed refuses to write a rotation that
`findChorePoolProblem()` rejects — a child in two pools, a chore in none, a
chore that is not a task at all. See [Star charts](stars.md#the-anchor) for
re-anchoring.

---

### `starWeeks`

Every star anybody has coloured in. One document per child per week.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `childId` | string | A child id from `src/config/family.ts`. |
| `weekStart` | string | `YYYY-MM-DD`, always a Monday. |
| `marks` | object | Task id → five booleans, Monday first. A task never ticked has no key. |
| `updatedAt` | Date | |

**Indexes:** `child_week_unique` — unique on `(childId, weekStart)`, which is
also what stops two simultaneous taps creating two documents for the same week
— and `by_week` for reading a whole week, or a past one for the report.

This is the only collection that grows steadily: five documents a week, about
260 a year. Writes go through an aggregation pipeline update for a reason worth
knowing before you touch them — see
[Star charts](stars.md#ticking-a-star).

### `shoppingItems`

The family shopping list. One document per line on it.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | **Chosen by the browser** before the write goes out — see [the shopping list](shopping.md#why-the-browser-invents-the-id). That is what makes an add idempotent: a retry collides with its own first attempt instead of adding the milk twice. |
| `name` | string | Trimmed, whitespace collapsed, 80 characters at most. |
| `addedBy` | string | The `displayName` of whoever added it. Copied in, not joined. |
| `createdAt` | Date | The sort order of the wanted half, newest first. |
| `completedAt` | Date \| null | `null` while it is still wanted. |
| `completedBy` | string \| null | Who ticked it off. Overwritten each time, which is correct — the last person to tick it is who got it. |
| `updatedAt` | Date | Bumped by every write. **Load-bearing:** the live stream's entire "has anything changed?" question is a count plus the maximum of this field, so a write that forgets it is invisible to every other device in the house. |

**Indexes:**

- `by_wanted` — `(completedAt: 1, createdAt: -1)`. The top half of the page and
  the duplicate check every add runs. The equality term first, the sort second,
  which is the order a compound index has to be declared in to serve both.
- `by_bought` — `(completedAt: -1)`. The accordion: the hundred most recently
  ticked off.

The stream's poll deliberately has no index of its own; the reasoning is in
`scripts/seed-database.ts` next to the ones that do.

Two things this collection does differently from `starWeeks`, both deliberate:

- **The document is the item**, not a bucket. The stars put a whole week in one
  document because the paper chart is a week and a star is never edited alone.
  Here the unit somebody adds, ticks and deletes *is* the item, two people are
  editing different items at the same moment, and no bucket ever closes.
- **Deleting really deletes.** Ticking off is kept — it is what the accordion is
  — but the bin is the "that was a typo" button, and a tombstone would keep every
  typo on the page forever.

This and `starWeeks` are the two collections that grow. This one grows by
whatever the family buys and is never pruned; only the newest hundred finished
rows are ever *shown*.

---

## Seeding

```bash
npm run db:seed
```

Creates every index, the first login account, the pet rotation and the chore
pools. **Safe to run repeatedly** — it never overwrites an existing account, pet
rotation or chore pool, so re-running it after you have changed a password,
re-anchored Bella or re-anchored the chores does not undo any of them. Index
creation is idempotent by definition.

Run it:

- once after cloning,
- after adding a collection or index,
- after pointing at a fresh cluster.

The script is [`scripts/seed-database.ts`](../scripts/seed-database.ts). It
reads `.env` via `tsx --env-file`, so it needs no extra setup.

---

## The allowlist

**This is the one that will cost you an afternoon.** Atlas rejects connections
from IP addresses that are not on its Network Access allowlist — and it rejects
them *during the TLS handshake*, before it ever looks at your credentials. The
error mentions neither Atlas nor allowlists:

```
805DF6F401000000:error:0A000438:SSL routines:ssl3_read_bytes:
tlsv1 alert internal error … SSL alert number 80
```

It reads like a broken certificate or a TLS version mismatch. It is neither.

**Fix:** <https://cloud.mongodb.com> → your project → **Network Access** →
*Add IP Address* → *Add Current IP Address*.

Both `src/lib/db.ts` (`describeConnectionError`) and the seed script translate
this error into a message that names the actual cause, so you should not have
to remember any of the above — but the raw error is here in case it shows up
somewhere that does not.

### For the deployed app

Vercel's outbound IPs are not fixed, so add **`0.0.0.0/0`**.

That sounds alarming and is worth being clear about: it means any host on the
internet may *attempt* to connect. It does not mean anyone can read the data —
the database user's password still gates access, and that password is only in
`.env` and Vercel's environment settings. It is the standard configuration for
serverless hosts. If you later want to narrow it, Vercel sells static outbound
IPs on paid plans.

### Other causes of connection failure

| Symptom | Cause |
|---|---|
| `Server selection timed out` | Cluster paused in Atlas, or port 27017 blocked by a VPN or firewall. |
| `Authentication failed` | Wrong username or password in `MONGODB_URI`. |
| `MONGODB_URI is not set` | No `.env` locally, or the variable is missing in Vercel. |

Atlas free-tier clusters **pause themselves after 60 days idle**. If this
project sits untouched for a couple of months — which, given it is a family
app, is likely — expect to log into Atlas and resume the cluster before
anything works. Resuming takes a few minutes.

### Just tell me what's wrong

```bash
npm run db:check
```

Works through the connection one layer at a time — DNS, TCP, TLS, then MongoDB
— stops at the first failure, and tells you which of the causes below you have.
It never prints the password.

```
  ✓ DNS      resolved 3 cluster members
  ✓ TCP      port 27017 is reachable
  ✗ TLS      handshake hung
```

The layering is the point: every cause below fails at a different layer, so the
layer that breaks identifies the problem without guessing.

| Fails at | Cause |
|---|---|
| DNS | Wrong cluster address, or the network is intercepting DNS |
| TCP | **The network blocks outbound 27017** — common on corporate, hotel and guest wifi |
| TLS, rejected | Your IP is not on the Atlas allowlist |
| TLS, hung | The cluster is paused — *or* a firewall is proxying TCP and dropping the rest |
| MongoDB | Wrong username or password |

That last TLS row is genuinely ambiguous, and the check says so rather than
guessing. Tethering to a phone for thirty seconds settles it: if it passes on
cellular, the building was the problem; if it fails identically, the cluster is
paused.

### Telling "not allowlisted" apart from "paused" by hand

If you would rather not use the script, or want to understand what it does.
Both fail, and the driver's message is unhelpful in both cases:

```bash
# Does TCP reach the cluster at all?
node -e "const n=require('net');const s=n.connect(27017,'ac-ia2kuwl-shard-00-00.pmxixtt.mongodb.net',
()=>{console.log('TCP OK');s.end()});s.on('error',e=>console.log('TCP',e.code));
s.setTimeout(8000,()=>{console.log('TCP TIMEOUT');s.destroy()})"
```

| TCP connect | TLS handshake | Meaning |
|---|---|---|
| succeeds | rejected — `tlsv1 alert internal error`, alert 80 | **IP not allowlisted.** Atlas is up and actively refusing you. |
| succeeds | hangs until timeout, no error | **Cluster paused or resuming.** The edge accepts the socket; there is no `mongod` behind it. |
| times out | — | Outbound 27017 blocked locally — VPN, corporate firewall, or a sandboxed shell. |

A useful second signal for the paused case: ask the driver what it saw.

```bash
node --env-file=.env -e "
const {MongoClient}=require('mongodb');
new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000}).connect()
 .catch(e=>{for(const [a,d] of e.reason?.servers??[]) console.log(a, d.type, d.error?.message??'no error')})"
```

Every replica-set member reporting `Unknown` **with no error at all** means the
handshake never completed and never failed — it simply got no answer. That is a
paused cluster, not a credentials or allowlist problem.

---

## Connection pooling

`src/lib/db.ts` keeps exactly one `MongoClient` per process, cached on
`globalThis`. Two reasons:

- The driver maintains its own connection pool. A second client would double
  the connections to the cluster for no benefit, and Atlas's free tier has a
  hard connection cap that is easy to exhaust.
- `next dev` hot-reloads modules on every edit. Without the `globalThis` cache
  each reload would leak a fresh pool, and after enough edits the cluster stops
  accepting new connections. Stashing the promise on `globalThis` survives
  module reloads.

---

## Adding a collection

1. Add its name to `COLLECTIONS` in [`src/config/db.ts`](../src/config/db.ts).
2. Write its accessors in `src/lib/`, going through `getCollection()`.
3. Add its indexes to [`scripts/seed-database.ts`](../scripts/seed-database.ts).
4. Run `npm run db:seed`.
5. Document its shape in the Collections section above.
