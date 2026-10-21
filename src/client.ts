import { startPageTracking } from "./page-tracker.js";
import type { PageViewEvent } from "./types.js";

const ANONYMOUS_ID_KEY = "journeytrack_anonymous_id";
const SESSION_ID_KEY = "journeytrack_session_id";

/**
 * Creates a random unique ID.
 * `crypto.randomUUID()` only exists in modern browsers on HTTPS/localhost,
 * so we fall back to a simple random string elsewhere.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reads an ID from storage, or creates and saves a new one.
 * Storage can throw (e.g. blocked cookies, some private modes), so on
 * failure we still return a fresh ID that lives only in memory.
 */
function getOrCreateId(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key);
    if (existing) {
      return existing;
    }
    const id = generateId();
    storage.setItem(key, id);
    return id;
  } catch {
    return generateId();
  }
}

/**
 * Where events go. For now that is the console; later this is the place
 * that will send events to the JourneyTrack backend.
 */
function logPageView(event: PageViewEvent): void {
  console.log("[JourneyTrack] Page view", event);
}

export class AnalyticsClient {
  private initialized = false;

  init(): void {
    // Frameworks like Next.js may run code on the server, where there is no window.
    if (typeof window === "undefined") {
      console.warn("[JourneyTrack] init() skipped: not running in a browser.");
      return;
    }

    if (this.initialized) {
      console.warn("[JourneyTrack] init() was already called.");
      return;
    }
    this.initialized = true;

    startPageTracking({
      // localStorage survives browser restarts, so the same browser keeps the same ID.
      anonymousId: getOrCreateId(window.localStorage, ANONYMOUS_ID_KEY),
      // sessionStorage is cleared when the tab is closed, which gives us a simple session.
      sessionId: getOrCreateId(window.sessionStorage, SESSION_ID_KEY),
      onPageView: logPageView,
    });
  }
}

export function createAnalytics(): AnalyticsClient {
  return new AnalyticsClient();
}
