# Design: JourneyTrack SDK

The SDK runs on **customers' websites**, so its first design rule is to be visually invisible. This file covers:

1. what the SDK may and may not do to the host page
2. the visual style for this repo's own pages: the demo (`demo/index.html`) and any future documentation or playground pages

The visual design system is owned by the dashboard repo: **`JourneyTrack/design.md` is the source of truth**. The values below are copied from it. If they ever differ, that file wins: update it first, then this copy.

---

## Part 1: rules for the SDK inside customer pages

| Rule | Why |
| ---- | --- |
| **Never inject CSS, fonts, DOM elements or global styles** | The customer owns their page's look. Today the SDK adds nothing visible, and it must stay that way. |
| Never change the page's behaviour | The History API wrappers call the original method first and only then record the event. Keep that order, and never swallow arguments or return values. |
| Never throw into the host page | Wrap storage and network access in `try/catch` (as `getOrCreateId` does). Prefer a silent failure plus a `console.warn` to a broken site. |
| Console output uses the `[JourneyTrack]` prefix | So customers can filter it. Once the SDK sends to the backend, per-event logging should move behind a `debug` option. |
| Keep the global footprint to two storage keys | `journeytrack_anonymous_id` (localStorage) and `journeytrack_session_id` (sessionStorage). Any new key uses the `journeytrack_` prefix. |

If a visible SDK feature is ever added (for example a consent banner or an in-page widget), it needs a separate design decision. It should render inside a Shadow DOM root so that host and SDK styles cannot leak into each other, and use the tokens below **scoped to that root**, never on `:root` of the host page.

---

## Part 2: style for the demo and documentation pages

`demo/index.html` currently uses browser defaults, which is acceptable for a developer demo. When it gets styling, or when docs pages are added, make them look like the dashboard. There is no Tailwind in this repo; use plain CSS with these variables:

```css
:root {
  /* Theme tokens: exact values from JourneyTrack/src/index.css */
  --color-brand: #16a34a;
  --color-brand-light: #dcfce7;
  --color-brand-dark: #15803d;
  --color-page: #f8fafc;
  --color-line: #e2e8f0;
  --color-ink: #0f172a;
  --color-muted: #64748b;
  --color-surface: #ffffff;
  --color-surface-muted: #f8fafc;   /* slate-50: code blocks, table headers */
  --color-surface-hover: #f1f5f9;   /* slate-100: secondary button hover */

  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --radius-sm: 6px;
  --radius-md: 8px;     /* buttons, inputs, code blocks */
  --radius-lg: 12px;    /* cards */
  --radius-pill: 9999px;
}

body {
  margin: 0;
  background: var(--color-page);
  color: var(--color-ink);
  font: 14px/20px var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

### Components used on demo/docs pages

| Element | Spec (matches the dashboard component) |
| ------- | -------------------------------------- |
| Page | Content max width 1152 px, padding 16 px on mobile and 32 px from 768 px |
| Card / panel | white, 1 px `--color-line` border, `--radius-lg`, 20 px padding, subtle shadow `0 1px 2px rgb(0 0 0 / 0.05)` |
| Heading (page) | 24 px / 32 px, weight 600 |
| Heading (section) | 16 px / 24 px, weight 600 |
| Secondary text | 12–14 px, `--color-muted` |
| Primary button | `--color-brand` background, white text, `--radius-md`, padding 8 px 16 px, weight 500; hover `--color-brand-dark`; focus ring 2 px `--color-brand` |
| Secondary button (the demo's navigation buttons) | white, 1 px `--color-line` border, `--color-ink` text; hover `--color-surface-hover` |
| Code / event output | `--font-mono` 12 px, `--color-surface-muted` background, 1 px `--color-line` border, `--radius-md`, padding 8 px 12 px |
| Event-type dot | 8 px circle; `page_view` = `#22c55e` (green-500, the dashboard's page-view indicator) |
| Spacing | multiples of 4 px: 4, 8, 12, 16, 20, 24, 32, 48 |
| Breakpoints | 640 px (rows instead of stacks) and 768 px (wider padding), the same as the dashboard |

**Do not add new colours.** If a demo needs one, add it to `JourneyTrack/design.md` first, then copy it here.

## Shared / reusable code

The tokens above are copied by hand from the dashboard. That is fine for one demo page. If the SDK gets a real docs site or a visible widget, export the tokens from the shared contracts package as plain hex strings, so that the dashboard, the backend and the SDK stop maintaining separate copies.
