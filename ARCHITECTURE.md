# Architecture: JourneyTrack SDK

This file explains how the SDK works inside a customer's page and how it will talk to the backend. For usage, the public API and build details, see [README.md](README.md).

Related repositories (separate git repos, normally checked out next to this one):

| Repo                      | Role | Its architecture doc |
| ------------------------- | ---- | -------------------- |
| `journeyTrack-sdk/` (this) | Browser SDK, zero runtime dependencies, ESM | this file |
| `JourneyTracker-backend/` | NestJS API; receives events on `POST /events` | `JourneyTracker-backend/ARCHITECTURE.md` |
| `JourneyTrack/`           | Dashboard where customers view the tracked data. It does **not** use the SDK. | `JourneyTrack/ARCHITECTURE.md` |

---

## System context

```text
 Customer website (React, Vue, Next.js, plain HTML …)
   │  createAnalytics().init()
   ▼
 journeytrack-sdk ──▶ console.log            ← today
                 └─▶ POST {apiUrl}/events    ← next step (backend is ready)
                       x-journeytrack-key: <environment's SDK key>
                               ▼
                     JourneyTracker-backend ──▶ PostgreSQL ──▶ read by the JourneyTrack dashboard
```

The SDK's whole job is to **observe the host page and produce events**. It stores nothing beyond two IDs, renders nothing, and must never break the host page.

## Responsibilities of this repo

| Owns | Does not own |
| ---- | ------------ |
| Detecting page loads and SPA navigation | Authentication logic (the key is only passed through; the backend validates it) |
| Creating and persisting `anonymousId` and `sessionId` | Deciding which environment data goes to (the backend derives it from the key) |
| Building event payloads that match the backend contract | The event schema itself (the backend owns it; shared contracts package planned) |
| Delivering events: console today, HTTP next | Storing, aggregating or displaying data |

---

## Internal structure

```text
src/index.ts            public surface: createAnalytics, types
  └─ src/client.ts      AnalyticsClient
        ├─ generateId()          crypto.randomUUID() → fallback Date.now()+Math.random()
        ├─ getOrCreateId()       storage read/write, wrapped in try/catch
        ├─ logPageView()         ← the transport (console today)
        └─ init()                SSR guard, double-init guard, wires the pieces below
              └─ src/page-tracker.ts  startPageTracking({ anonymousId, sessionId, onPageView })
                    ├─ recordPageView()   dedupes by URL without #hash, builds PageViewEvent
                    ├─ wraps history.pushState / history.replaceState
                    ├─ listens: popstate
                    └─ listens: pageshow (persisted → reset previousUrl, record)
src/types.ts            PageViewEvent
```

**The key design choice:** `page-tracker.ts` produces events and hands them to a callback. It knows nothing about storage or transport. New outputs (HTTP, batching, debug logging) and new event sources (`track()`, `page()`) all plug into `client.ts` without changing the tracker.

## Lifecycle

1. **Import**: no side effects (`"sideEffects": false`). Nothing runs until `init()`.
2. **`init()`**: returns early (with a warning) on the server or on a second call. Then:
   - `anonymousId` ← `localStorage["journeytrack_anonymous_id"]`, or a new ID
   - `sessionId` ← `sessionStorage["journeytrack_session_id"]`, or a new ID
   - the current page is recorded immediately
3. **Navigation**: `pushState` / `replaceState` (wrapped), `popstate` and `pageshow` (bfcache) each call `recordPageView()`, which skips the event if the URL without its hash is unchanged.
4. **Teardown**: none. The wrappers and listeners live for the life of the page. There is no `destroy()`.

## Identity and sessions

| ID | Where | Scope | Edge cases |
| -- | ----- | ----- | ---------- |
| `anonymousId` | `localStorage` | One browser profile per site origin. Different subdomains get different IDs. | Storage blocked → a new ID on every page load, so the backend sees each load as a new visitor |
| `sessionId` | `sessionStorage` | One tab until it closes. Duplicating a tab copies it. | No inactivity timeout; storage blocked → a new ID per load |

On the backend, `anonymousId` becomes one `tracked_users` row per environment, and `sessionId` is stored on every event. **Identification** (linking to the customer's own user ID, stored in the backend's `tracked_users.external_id`) and **reset on logout** are not implemented. They will be `identify()` and `reset()`.

---

## Communication with the backend (next step)

The backend side is already built. What the SDK has to do:

| Concern | Backend expectation |
| ------- | ------------------- |
| URL | `POST {apiUrl}/events`; `apiUrl` must become an `init()` option (local: `http://localhost:3000`) |
| Auth | Header `x-journeytrack-key`. The key decides the environment. |
| Body | Exactly `PageViewEvent`. Unknown fields → `400`. |
| CORS | Any origin is allowed; `POST` only; **no credentials**. Use `credentials: "omit"`. |
| Results | `202` stored; `400` bad body and `401` bad or revoked key: **do not retry** these |
| Clock | Timestamps more than 5 minutes in the future are replaced by server time |

Recommended transport: `fetch(url, { method: "POST", keepalive: true, credentials: "omit", headers, body })`, so that the event on the last page before unload still arrives. Note that `navigator.sendBeacon` cannot set the custom key header, so it would need the key moved into the URL or body, which is a backend change. Batching is not supported by the API yet.

## Custom events (planned)

The dashboard's dummy data already shows `login`, `signup`, `game_opened`, `mission_completed`, `deposit` (`{ amount, currency, method }`), `withdrawal` (`{ amount, currency, method, status }`) and others. To support them:

1. Agree the schema in a shared contracts package. Event names are `snake_case`; settle `page_view` vs. past-tense names such as `game_opened`, and the money format.
2. Add `track(type, properties)` here, reusing `anonymousId` and `sessionId`.
3. The backend adds a matching DTO. Today it accepts only `page_view`.

---

## Terminology: this repo vs. the others

| Concept | This repo | Backend | Dashboard (frontend) |
| ------- | --------- | ------- | -------------------- |
| Browser visitor ID | `anonymousId` | `TrackedUser.anonymousId` | not modelled ⚠ |
| Visitor record | — | `TrackedUser` | `User` ⚠ |
| Tracking session | `sessionId` | `Event.sessionId` | not modelled ⚠ |
| Page view type | `page_view` | `page_view` / "Page View" | `page_viewed` ⚠ |
| Event time | `timestamp` | `timestamp` on the wire, `occurredAt` in the database | `timestamp` |
| Previous page | `referrer` | `properties.referrer` | not shown ⚠ |

The SDK and backend agree on every term. The ⚠ items are dashboard-side fixes.

## Shared / reusable code

| What | Here | Recommendation |
| ---- | ---- | -------------- |
| `PageViewEvent` | `src/types.ts` | Import it from a shared **types-only** contracts package owned by the backend. Types add zero bytes to the bundle. |
| `"page_view"` literal | `types.ts`, `page-tracker.ts` | Shared `EVENT_TYPES` constant (a tiny runtime constant is acceptable) |
| Key header name | not here yet | Import `SDK_KEY_HEADER` from the contracts package, not retyped |
| `generateId`, `getOrCreateId`, storage keys | `client.ts` | **Keep local.** No other repo needs browser visitor IDs; the dashboard and backend use their own ID schemes. |

Rule: the SDK may depend only on that contracts package, and only for types and constants. It must not depend on React, Nest, Prisma or any UI code.

## Inconsistencies and loose ends in this repo

1. Events never leave the browser (console only).
2. `init()` takes no SDK key or API URL.
3. The demo server's port (3000, hard-coded in `demo/server.mjs`) clashes with the backend's default port.
4. Only an ESM build: no `<script>`-tag (IIFE) bundle and no minification.
5. Blocked storage means a new `anonymousId` per page load, so one person looks like many visitors.
6. No tests, linter or formatter. Code style (double quotes) differs from the backend (single quotes).

## Next steps for this repo

1. `init({ sdkKey, apiUrl, debug? })` and an HTTP transport replacing `logPageView`, with error handling that never throws into the host page.
2. Make the demo port configurable (or move it to 3001); add a key input to the demo page.
3. Adopt the shared contracts package.
4. `page()`, `identify()`, `track()`, `reset()`, after the backend endpoints and event schemas are agreed.
5. Add an IIFE/minified build for `<script>`-tag installs, plus Vitest (jsdom) tests for the tracker.
