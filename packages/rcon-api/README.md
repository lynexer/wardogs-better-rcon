# WARDOGS RCON API (@lynexer/wardogs-api)

Typed client and runtime-validated schemas for the **Wardogs RCON v1 HTTP API**.

Every response is checked against a [Zod](https://zod.dev) schema at the boundary, so a
server-side change surfaces as a descriptive error instead of an undefined-property crash
deeper in your code.

> **Unofficial.** This contract was reverse-engineered from the Wardogs demo web console.
> It is not published, documented, or versioned by the game's developers, and this package
> is not affiliated with or endorsed by them. Endpoints may change without notice.

## Install

```sh
pnpm add @lynexer/wardogs-api zod
# or
npm i @lynexer/wardogs-api zod
# or
yarn add @lynexer/wardogs-api zod
```

`zod` is a peer dependency (`^3.23.0 || ^4.0.0`) — install the version your project already uses.

The package is **ESM-only** and ships TypeScript declarations.

### Requirements

- Node.js 20+, or any modern browser
- A global `fetch` and `AbortSignal.timeout` (built in on both targets above)

## Quick start

```ts
import { WardogsRconClient } from "@lynexer/wardogs-api";

const client = new WardogsRconClient({
  baseUrl: "http://203.0.113.10:7777", // the RCON HTTP listener
  password: process.env.RCON_PASSWORD!,
});

const status = await client.getStatus();
console.log(
  `${status.serverName} — ${status.map} ` +
    `(${status.players.current}/${status.players.max})`,
);

await client.broadcast("Map rotation in 60 seconds.");
```

## Configuration

The constructor takes a single options object:

| Option      | Type         | Default             | Notes                                                             |
| ----------- | ------------ | ------------------- | ---------------------------------------------------------------- |
| `baseUrl`   | `string`     | — (required)        | Base URL of the RCON HTTP listener. A trailing slash is trimmed.  |
| `password`  | `string`     | — (required)        | Sent as `Authorization: Bearer <password>` on every request.      |
| `fetch`     | `FetchLike`  | `globalThis.fetch`  | Inject a custom implementation for proxies, extra headers, or tests. |
| `timeoutMs` | `number`     | `15000`             | Per-request timeout. On expiry the client throws `RconError` with code `unreachable`. |

```ts
const client = new WardogsRconClient({
  baseUrl: "http://203.0.113.10:7777",
  password,
  timeoutMs: 30_000,
  fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
});
```

## Error handling

Read and command methods **throw**:

- **`RconError`** — the request failed. Inspect `.code` and `.status`:
  - `unreachable` — network failure or timeout (`.status` is `null`)
  - `http_error` — an error response with no recognizable body
  - a server-provided code (e.g. `not_found`, `unauthorized`) parsed from `{ "error": { "code", "message" } }`
  - `empty_patch` — `setSettings` was called with no fields
- **`RconSchemaError`** — the response did not match the expected schema. Inspect `.path`
  (the endpoint) and `.issues` (the raw Zod issues).

```ts
import { RconError, RconSchemaError } from "@lynexer/wardogs-api";

try {
  await client.kickPlayer("76561198000000000", "AFK");
} catch (err) {
  if (err instanceof RconError) {
    console.error(`[${err.code}] ${err.message}`);
  } else if (err instanceof RconSchemaError) {
    console.error(`Unexpected response from ${err.path}`, err.issues);
  } else {
    throw err;
  }
}
```

The config methods (`validateConfig`, `applyConfig`) are the exception — they **never throw**
for network or HTTP errors. They always resolve to a [`ConfigResult`](#config-document) whose
`ok`, `errorCode`, and `errorMessage` fields describe the outcome.

## Capability probing

RCON servers vary in which routes they expose. `probeCapabilities()` fetches
`/v1/capabilities` once (the result is cached) and normalizes it:

```ts
const features = await client.probeCapabilities();

if (features.changeTeam) {
  await client.changeFaction(steamId, "BLU");
}
```

| Field            | Type          | Meaning                                                        |
| ---------------- | ------------- | ------------------------------------------------------------- |
| `changeTeam`     | `boolean`     | `PATCH /v1/players/*` is available                             |
| `configDocument` | `boolean`     | `PUT /v1/config` is available and the config is writable       |
| `reservedExpiry` | `boolean`     | Currently always `false` (reserved for a future server field)  |
| `routes`         | `Set<string>` | Normalized route signatures, e.g. `"POST /v1/broadcast"`       |

## Config document

`getConfig()` returns the current config text plus its `revision`. Pass that revision back
to `applyConfig` so a concurrent edit is rejected instead of silently overwritten:

```ts
const doc = await client.getConfig();
const result = await client.applyConfig(editedText, { revision: doc.revision });

if (result.conflict) {
  // HTTP 412 — the config changed since you loaded it; re-fetch and merge
} else if (!result.ok) {
  console.error(result.errorMessage, result.errors);
} else {
  console.log("applied at revision", result.revision);
}
```

`applyConfig(text, options)` accepts:

| Option      | Type      | Effect                                                    |
| ----------- | --------- | ------------------------------------------------------- |
| `revision`  | `string`  | Sent as `If-Match`; a mismatch yields `result.conflict` |
| `force`     | `boolean` | Adds `?force=true`                                        |
| `fullApply` | `boolean` | Adds `?fullApply=true`                                    |

Use `validateConfig(text)` for a dry run — same `ConfigResult` shape, no write.

## Working with schemas

The schemas are exported so you can validate fixtures, mock responses, or connected data
with the exact rules the client uses:

```ts
// namespaced
import { schemas } from "@lynexer/wardogs-api";
const status = schemas.Status.parse(json);

// or from the subpath export
import { Status, Player } from "@lynexer/wardogs-api/schemas";
```

Inferred response types are also re-exported from the root (`StatusShape`, `PlayerShape`,
`RotationShape`, `ConfigDocumentShape`, …).

## API reference

All methods are `async`. Unless noted, they resolve to `{ message?: string }`.

### Status & players

| Method                              | Endpoint                       | Resolves to        |
| ----------------------------------- | ------------------------------ | ------------------ |
| `connect()`                         | `GET /v1/status`               | `StatusShape` (alias of `getStatus`) |
| `getStatus()`                       | `GET /v1/status`               | `StatusShape`      |
| `getPlayers()`                      | `GET /v1/players`              | `{ players: [] }`  |
| `kickPlayer(steamId, reason?)`      | `POST /v1/players/:id/kick`    | message            |
| `killPlayer(steamId)`               | `POST /v1/players/:id/kill`    | message            |
| `whisper(steamId, message)`         | `POST /v1/players/:id/message` | message            |
| `changeFaction(steamId, faction)`   | `PATCH /v1/players/:id`        | message            |
| `broadcast(message)`                | `POST /v1/broadcast`           | message            |

### Bans & reserved slots

| Method                        | Endpoint                        | Resolves to           |
| ----------------------------- | ------------------------------- | --------------------- |
| `getBans()`                   | `GET /v1/bans`                  | `{ bans: [] }`        |
| `banPlayer(steamId, reason?)` | `POST /v1/bans`                 | message               |
| `unban(steamId)`              | `DELETE /v1/bans/:id`           | message               |
| `getReservedSlots()`          | `GET /v1/reserved-slots`        | `{ reservedSlots: [] }` |
| `addReserved(steamId)`        | `POST /v1/reserved-slots`       | message               |
| `removeReserved(steamId)`     | `DELETE /v1/reserved-slots/:id` | message               |

### Catalogs

| Method                       | Endpoint                                  | Resolves to           |
| ---------------------------- | ---------------------------------------- | --------------------- |
| `getMaps()`                  | `GET /v1/catalog/maps`                    | `{ maps: [] }`        |
| `getLightings()`             | `GET /v1/catalog/lightings`               | `{ lightings: [] }`   |
| `getExperiences()`           | `GET /v1/catalog/experiences`             | `{ experiences: [] }` |
| `getMapExperiences(mapId)`   | `GET /v1/catalog/maps/:id/experiences`    | `{ experiences: [] }` |
| `getMapAlternators(mapId)`   | `GET /v1/catalog/maps/:id/alternators`    | `{ alternators: [] }` |

### Match & world

| Method                    | Endpoint                | Resolves to |
| ------------------------- | ----------------------- | ----------- |
| `changeMap(selection)`    | `POST /v1/match/map`    | message     |
| `endMatch()`              | `POST /v1/match/end`    | message     |
| `restartMatch()`          | `POST /v1/match/restart`| message     |
| `setLighting(lighting)`   | `PUT /v1/world/lighting`| message     |

### Rotation

| Method                                | Endpoint                              | Resolves to        |
| ------------------------------------- | ------------------------------------ | ------------------ |
| `getRotation()`                       | `GET /v1/rotation`                    | `RotationShape`    |
| `addRotationEntry(selection)`         | `POST /v1/rotation/entries`           | message            |
| `removeRotationEntry(index)`          | `DELETE /v1/rotation/entries/:index`  | message            |
| `moveRotationEntry(index, direction)` | `POST /v1/rotation/entries/:index/move` | message (`direction` is `"up"` \| `"down"`) |
| `saveRotation()`                      | `POST /v1/rotation/save`              | message            |

### Settings, sponsor & audit

| Method                | Endpoint             | Resolves to      |
| --------------------- | -------------------- | ---------------- |
| `setSettings(patch)`  | `PATCH /v1/settings` | message          |
| `getSponsor()`        | `GET /v1/sponsor`    | `{ imageUrl }`   |
| `setSponsor(imageUrl)`| `PUT /v1/sponsor`    | message          |
| `getAudit(limit = 50)`| `GET /v1/audit`      | `{ entries: [] }` (`limit` clamped to 1–500) |

### Config

| Method                        | Endpoint                    | Resolves to          |
| ----------------------------- | -------------------------- | -------------------- |
| `probeCapabilities()`         | `GET /v1/capabilities`      | `Features`           |
| `getConfig()`                 | `GET /v1/config`            | `ConfigDocumentShape`|
| `validateConfig(text)`        | `POST /v1/config/validate`  | `ConfigResult`       |
| `applyConfig(text, options?)` | `PUT /v1/config`            | `ConfigResult`       |

## Input shapes

### `MapSelection`

Used by `changeMap` and `addRotationEntry`.

```ts
interface MapSelection {
  map: string;
  experiences?: string[];
  lighting?: string;
  alternator?: string;
  zoneAlternator?: string; // takes precedence over `alternator`
}
```

Empty or `"None"` alternator values are dropped from the request. The `mapSelection()`
helper that performs this normalization is also exported if you need the raw request body.

### `SettingsPatch`

```ts
interface SettingsPatch {
  scoreTick?: number;
  rotationEnabled?: boolean;
  rotationMode?: string;
}
```

At least one field must be present, or `setSettings` throws `RconError` (`empty_patch`).

## License

MIT
