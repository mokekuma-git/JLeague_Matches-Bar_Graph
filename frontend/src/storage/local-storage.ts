// Viewer preference persistence via localStorage.
//
// Saved preferences are restored on next page load so the user's last
// competition/season/sort/appearance selections are preserved across sessions.

const STORAGE_KEY = 'jleague_viewer_prefs';

export interface ViewerPrefs {
  competition?: string;
  season?: string;
  targetDate?: string;   // Canonical YYYY/MM/DD (CSV date format)
  teamSortKey?: string;
  matchSortKey?: string;
  /** @deprecated Legacy shared value; read as a fallback for the per-view keys below. */
  futureOpacity?: string;
  spaceColor?: string;
  /** @deprecated Legacy shared value; read as a fallback for the per-view keys below. */
  scale?: string;
  // Per-view appearance. scale ranges and opacity defaults differ between the
  // views, so sharing one value let the bracket's clamp destroy the league's
  // setting (#302). Legacy keys above seed these on first load only.
  leagueScale?: string;
  bracketScale?: string;
  leagueFutureOpacity?: string;
  bracketFutureOpacity?: string;
  locale?: string;
  displayTimezone?: string;  // display IANA TZ name ('' or absent = browser default)
  roundStart?: string;   // bracket round start selection (or '__multi_section__')
  hiddenColumns?: string[];  // rank table column data-ids hidden by the user (default: none hidden)
}

export function loadPrefs(): ViewerPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ViewerPrefs;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Partial<ViewerPrefs>): void {
  try {
    const merged = { ...loadPrefs(), ...prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage unavailable (private browsing, etc.) — ignore silently
  }
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
