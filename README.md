# JourneyTrack SDK

> This is the first milestone of JourneyTrack's automatic tracking SDK. It currently tracks page activity only and outputs events to the browser console.

A small, framework-independent browser SDK for **JourneyTrack**. It works with plain websites and single-page apps (React, Vue, Next.js, …) without depending on any of them.

## What it does

After `init()`, the SDK automatically creates a `page_view` event:

- when the page first loads (including refreshes)
- when a single-page app changes the URL with `history.pushState()` or `history.replaceState()`
- when the user presses the browser back/forward buttons

Each event is logged with `console.log`. Nothing is sent over the network.

## Usage

```ts
import { createAnalytics } from "journeytrack-sdk";

const analytics = createAnalytics();
analytics.init();
```

In Next.js, call `init()` in the browser only (e.g. inside `useEffect` in a client component).

## Page event

```ts
{
  type: "page_view",
  anonymousId: "3bbe8215-c8d6-4643-871b-5bc7ef2e5298", // same browser = same ID (localStorage)
  sessionId: "fc304362-f410-4388-9784-49d7caaf69ae",   // same tab = same ID (sessionStorage)
  timestamp: "2026-10-21T10:00:00.000Z",
  url: "https://example.com/games/piggy-tap",
  pathname: "/games/piggy-tap",
  referrer: "https://example.com/home"
}
```

`referrer` is `document.referrer` for the first page, and the previous URL for SPA navigations.

## How SPA navigation is detected

Single-page apps change the URL without reloading, so the page's scripts don't run again. The SDK watches the browser History API directly:

| Navigation                   | How it is detected                                            |
| ---------------------------- | ------------------------------------------------------------- |
| First load / refresh         | `init()` records the current page                             |
| `history.pushState()`        | the SDK wraps the method and records a page after it runs     |
| `history.replaceState()`     | same as above                                                 |
| Back/forward inside the SPA  | `popstate` event                                              |
| Back/forward to a cached page | `pageshow` event with `persisted === true`                   |

A new event is only created when the URL (ignoring `#hash`) actually changes, so a `replaceState` that keeps the same URL or a jump to `#section` doesn't count as a new page.

Every router (React Router, Next.js, Vue Router, …) uses these browser APIs underneath, which is why no router-specific code is needed.

## Local demo

```bash
npm install
npm run demo
```

Open http://localhost:3000 with DevTools → Console open, then use the demo buttons, refresh, and back/forward.

## Not implemented yet

- `identify()`, `track()`, `page()`, `reset()`
- Click, form, scroll, visibility or any other DOM tracking
- Custom events
- Session expiration (the session ends when the tab is closed)
- Sending events to a backend, batching or retries
- Framework adapters (React, Next.js)
