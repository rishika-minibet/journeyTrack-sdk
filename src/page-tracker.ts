import type { PageViewEvent } from "./types.js";

interface PageTrackerOptions {
  anonymousId: string;
  sessionId: string;
  /** Called with every new page event. The client decides what to do with it. */
  onPageView: (event: PageViewEvent) => void;
}

/** "https://site.com/games?x=1#top" -> "https://site.com/games?x=1" */
function withoutHash(url: string): string {
  return url.split("#")[0] ?? url;
}

/**
 * Records the current page, then keeps watching for navigation:
 * - full page loads/refreshes run this code again from scratch
 * - SPA navigation calls history.pushState / history.replaceState
 * - back/forward buttons fire the "popstate" event
 */
export function startPageTracking(options: PageTrackerOptions): void {
  let previousUrl: string | null = null;

  function recordPageView(): void {
    const url = window.location.href;

    // Skip if the page did not really change, e.g. replaceState that only
    // updates history state, or a jump to an #anchor on the same page.
    if (previousUrl !== null && withoutHash(url) === withoutHash(previousUrl)) {
      return;
    }

    const event: PageViewEvent = {
      type: "page_view",
      anonymousId: options.anonymousId,
      sessionId: options.sessionId,
      timestamp: new Date().toISOString(),
      url,
      pathname: window.location.pathname,
      // document.referrer never changes during SPA navigation, so after the
      // first page we use the URL the user was on before.
      referrer: previousUrl ?? document.referrer,
    };

    previousUrl = url;
    options.onPageView(event);
  }

  // 1. The page the user opened.
  recordPageView();

  // 2. SPA navigation. Browsers have no "URL changed" event for pushState and
  //    replaceState, so we wrap them: call the original, then record the page.
  const originalPushState = window.history.pushState;
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState.apply(window.history, args);
    recordPageView();
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState.apply(window.history, args);
    recordPageView();
  };

  // 3. Browser back/forward between SPA pages.
  window.addEventListener("popstate", () => recordPageView());

  // 4. Browser back/forward to a page restored from the back/forward cache.
  //    The browser shows the old page without re-running scripts, so count it here.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      previousUrl = null;
      recordPageView();
    }
  });
}
