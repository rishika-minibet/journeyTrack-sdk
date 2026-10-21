/** Created every time the user lands on, or navigates to, a page. */
export interface PageViewEvent {
  type: "page_view";
  /** Stays the same for this browser across page loads (stored in localStorage). */
  anonymousId: string;
  /** Stays the same until the tab is closed (stored in sessionStorage). */
  sessionId: string;
  /** ISO 8601 string, e.g. "2026-10-21T10:00:00.000Z". */
  timestamp: string;
  url: string;
  pathname: string;
  /** The previous page: `document.referrer` on a full load, the previous URL on SPA navigation. */
  referrer: string;
}
