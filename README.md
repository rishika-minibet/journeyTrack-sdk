# JourneyTrack SDK

> **Status: first milestone.** The SDK tracks page activity automatically and logs each event to the browser console. It does **not** send anything to the JourneyTrack backend yet, and it takes no configuration.

A small, framework-independent browser SDK for **JourneyTrack**. It works with plain websites and single-page apps (React, Vue, Next.js, …) without depending on any of them, and it has no runtime dependencies.

For how the SDK fits with the backend and the dashboard, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Usage

```ts
import { createAnalytics } from "journeytrack-sdk";

const analytics = createAnalytics();
analytics.init();
```

In Next.js, call `init()` in the browser only, for example inside `useEffect` in a client component. On the server, `init()` logs a warning and does nothing.

## Architecture

```text
createAnalytics() ─▶ AnalyticsClient
                       └─ init()
                            ├─ getOrCreateId(localStorage,  "journeytrack_anonymous_id")
                            ├─ getOrCreateId(sessionStorage, "journeytrack_session_id")
                            └─ startPageTracking({ anonymousId, sessionId, onPageView })
                                   │  records the current page, then wraps history.pushState /
                                   │  replaceState and listens to popstate + pageshow
                                   ▼
                              onPageView(event) ─▶ logPageView ─▶ console.log   ← the transport goes here
```

`page-tracker.ts` knows nothing about where events go. It calls `onPageView`, and the client decides what to do with the event. That separation is the place to add network sending.

### Folder structure

```text
journeyTrack-sdk/
├── src/
│   ├── index.ts          Public entry: exports createAnalytics and the types
│   ├── client.ts         AnalyticsClient, ID generation and storage, the console "transport"
│   ├── page-tracker.ts   History API wrapping and page_view creation
│   └── types.ts          PageViewEvent
├── demo/
│   ├── index.html        Demo page with a tiny fake router (pushState / replaceState buttons)
│   └── server.mjs        Dependency-free static server on http://localhost:3000 with SPA fallback
├── tsconfig.json         ES2020 + DOM, ESM, strict, emits .js + .d.ts + source maps to dist/
└── package.json
```

## Public API

Everything the package exports (`src/index.ts`):

| Export            | Kind     | Description |
| ----------------- | -------- | ----------- |
| `createAnalytics()` | function | Returns a new `AnalyticsClient`. Create one per page. |
| `AnalyticsClient` | type     | The client class (exported as a type only) |
| `PageViewEvent`   | type     | The shape of a page event |

### `init()`

```ts
analytics.init(): void
```

- Takes **no options today**: no SDK key, no API URL, no debug flag.
- Does nothing (with a `console.warn`) if `window` is undefined, or if it was already called on this client.
- Creates or reads the anonymous ID and the session ID, records the current page, and starts watching navigation.

### `identify`, `track`, `page`, `reset`

**Not implemented.** The client has only `init()`. What exists elsewhere to support them:

| Method       | Intended purpose | What is ready elsewhere |
| ------------ | ---------------- | ----------------------- |
| `identify()` | Link the anonymous visitor to the customer's own user ID and traits | Backend columns `tracked_users.external_id`, `name`, `email`, `signed_up_at`, `attributes` (JSONB). No endpoint yet. |
| `track()`    | Send a custom event such as `deposit` or `withdrawal` | Backend `events.type` is free text and `events.properties` is JSONB. The `/events` DTO only accepts `page_view` today. The dashboard prototype already displays `login`, `signup`, `game_opened`, `deposit`, `withdrawal`, … from dummy data. |
| `page()`     | Record a page view manually, for apps that don't use the History API or want custom properties | `recordPageView()` exists inside `page-tracker.ts` but is not exposed |
| `reset()`    | Clear identity on logout: new `anonymousId` and `sessionId` | — |

## Automatic page tracking

After `init()`, a `page_view` is created:

| Navigation                    | How it is detected                                            |
| ----------------------------- | ------------------------------------------------------------- |
| First load / refresh          | `init()` records the current page                             |
| `history.pushState()`         | The SDK wraps the method and records a page after it runs     |
| `history.replaceState()`      | Same as above                                                 |
| Back/forward inside the SPA   | `popstate` event                                              |
| Back/forward to a cached page | `pageshow` event with `persisted === true`                    |

A new event is created only when the URL **ignoring `#hash`** actually changes. A `replaceState` that keeps the same URL, or a jump to `#section`, does not count as a new page. Every router (React Router, Next.js, Vue Router, …) uses these browser APIs underneath, which is why no router-specific code is needed.

`referrer` is `document.referrer` for the first page, and the previous URL for SPA navigations.

Not tracked: clicks, forms, scrolling, visibility or time on page.

## Anonymous ID and session ID

| ID            | Storage          | Key                          | Lifetime |
| ------------- | ---------------- | ---------------------------- | -------- |
| `anonymousId` | `localStorage`   | `journeytrack_anonymous_id`  | Until the user clears site data. Same browser = same ID. |
| `sessionId`   | `sessionStorage` | `journeytrack_session_id`    | Until the tab is closed. There is no inactivity timeout. A new tab means a new session. |

IDs are `crypto.randomUUID()`. Where that is unavailable (old browsers, or non-HTTPS pages other than localhost), the fallback is `` `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` ``. If storage throws, as it can with blocked cookies or in some private modes, a fresh ID is used in memory for that page load.

## Event structure

```ts
interface PageViewEvent {
  type: "page_view";
  anonymousId: string;  // localStorage
  sessionId: string;    // sessionStorage
  timestamp: string;    // ISO 8601, browser clock
  url: string;          // full URL, including the hash
  pathname: string;
  referrer: string;     // "" when there is none
}
```

Example:

```ts
{
  type: "page_view",
  anonymousId: "3bbe8215-c8d6-4643-871b-5bc7ef2e5298",
  sessionId: "fc304362-f410-4388-9784-49d7caaf69ae",
  timestamp: "2026-10-21T10:00:00.000Z",
  url: "https://example.com/games/piggy-tap",
  pathname: "/games/piggy-tap",
  referrer: "https://example.com/home"
}
```

This is **exactly** the body that the backend's `POST /events` accepts (`JourneyTracker-backend/src/events/dto/page-view-event.dto.ts`). The backend rejects unknown fields, so adding a field here without adding it to the DTO will break ingestion.

## API communication

**None yet.** `logPageView()` in `src/client.ts` is the only output.

What the backend already expects, so that wiring it up is a small change:

| Item       | Value |
| ---------- | ----- |
| Endpoint   | `POST {apiUrl}/events`, where `apiUrl` is `http://localhost:3000` locally |
| Auth       | Header `x-journeytrack-key: <SDK key of the environment>`. The environment is derived from the key. |
| Body       | One `PageViewEvent` as JSON (no batching yet) |
| CORS       | Any origin; `POST` only; no credentials. Do **not** send cookies (`credentials: "omit"`). |
| Responses  | `202` stored · `400` invalid body · `401` missing, unknown or revoked key |
| Local keys | Seeded by the backend, for example `jt_mock_dev_4hQ8vK2nW7pX1rT9sB3c` (see `JourneyTracker-backend/prisma/seed.ts`) |

Suggested shape (recommendation, not implemented): `init({ sdkKey, apiUrl? })`, sending with `fetch(url, { method: "POST", keepalive: true, credentials: "omit" })` so that events survive page unloads. Do not retry a `401` or `400`.

## Configuration

There is none today. `init()` takes no arguments, and the storage keys and console prefix are hard-coded in `src/client.ts`.

## Build and package

| Script               | What it does |
| -------------------- | ------------ |
| `npm run build`      | `tsc` → `dist/*.js`, `*.d.ts`, source maps |
| `npm run typecheck`  | `tsc --noEmit` |
| `npm run demo`       | Build, then serve `demo/` on http://localhost:3000 |

- Package name `journeytrack-sdk`, version `0.1.0`, `"private": true` (not published).
- ESM only: `exports["."]` → `dist/index.js` + `dist/index.d.ts`. `"sideEffects": false`. Only `dist/` is included in the package (`files`).
- Target ES2020 with DOM libs. There is no bundler, minifier, UMD/IIFE build or `<script>`-tag snippet yet.

## Integrating into a website

The package is not published, so install it locally:

```bash
# from the website project
npm install ../journeyTrack-sdk      # or: npm pack in the SDK and install the .tgz
```

```ts
// Plain site or SPA entry point
import { createAnalytics } from "journeytrack-sdk";
createAnalytics().init();
```

```tsx
// Next.js (app router): a client component rendered once in the root layout
"use client";
import { useEffect } from "react";
import { createAnalytics } from "journeytrack-sdk";

export function Analytics() {
  useEffect(() => {
    createAnalytics().init();
  }, []);
  return null;
}
```

Because there is no IIFE build, a site without a bundler must load it as a module: `<script type="module">import { createAnalytics } from "/path/to/dist/index.js"; createAnalytics().init();</script>`. This is the approach the demo page uses.

## Local demo

```bash
npm install
npm run demo
```

Open http://localhost:3000 with DevTools → Console open, then use the demo buttons, refresh, and use back/forward.

> The backend also defaults to port 3000. Stop one, or start the backend with `PORT=3001`.

## Development conventions

- Zero runtime dependencies. The SDK runs on customers' pages, so keep it small and side-effect-free on import (work starts in `init()`).
- Never throw into the host page. Wrap storage access (as `getOrCreateId` does) and future network calls in `try/catch`.
- Guard every browser API (`typeof window`, `typeof crypto`) for SSR frameworks.
- Strict TypeScript with `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`. Use `import type` for types and the `.js` extension on relative imports.
- Double quotes. There is no Prettier or linter configured in this repo, unlike the backend, which uses single quotes. See the next steps in `ARCHITECTURE.md`.
- Log with the `[JourneyTrack]` prefix.
- Any change to the event shape must be made in the backend DTO in the same change.

## Shared / Reusable Code

| What                         | Here                             | Duplicated in / needed by                                       | Recommendation |
| ---------------------------- | -------------------------------- | --------------------------------------------------------------- | -------------- |
| `PageViewEvent` type         | `src/types.ts`                   | Backend `PageViewEventDto`                                      | Move to a shared, **types-only** contracts package (see [`ARCHITECTURE.md`](ARCHITECTURE.md#shared--reusable-code)). Types and constants add no bytes to the SDK bundle. The backend owns the contract. |
| `"page_view"` literal        | `src/types.ts`, `src/page-tracker.ts` | Backend DTO and service; the frontend uses `page_viewed` ⚠  | Shared `EVENT_TYPES` constant |
| SDK key header name          | — (needed when sending)          | Backend `SDK_KEY_HEADER = 'x-journeytrack-key'`                 | Import from the shared package instead of retyping it |
| `generateId()` (UUID + fallback) | `src/client.ts`              | Nothing comparable. The frontend's `createId()` makes prefixed mock IDs, and the backend uses `cuid()`. | **Keep local.** It has a different purpose, and no other repo needs browser visitor IDs. |
| Storage keys `journeytrack_*` | `src/client.ts`                 | The frontend uses a different style: `journeytrack.mock-state`  | Keep local; just keep the `journeytrack` prefix |
| Future `track()` event schemas (deposit, withdrawal, …) | — | Frontend dummy data `src/types/event.ts`, `src/data/events.ts` | Define them once in the shared package before implementing `track()` |

## Not implemented yet

- Sending events to the backend, batching, retries, and `sendBeacon`/`keepalive` on unload
- `init()` options (SDK key, API URL, debug)
- `identify()`, `track()`, `page()`, `reset()`
- Click, form, scroll, visibility or any other DOM tracking
- Session expiration (the session ends when the tab is closed)
- Framework adapters (React, Next.js) and a `<script>`-tag (IIFE) build
- Tests
