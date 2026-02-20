// Viewer preference persistence via localStorage.
//
// Saved preferences are restored on next page load so the user's last
// category/season/sort/appearance selections are preserved across sessions.

const STORAGE_KEY = 'jleague_viewer_prefs';

export interface ViewerPrefs {
  category?: string;
  season?: string;
  targetDate?: string;   // YYYY-MM-DD (HTML date input format)
  teamSortKey?: string;
  matchSortKey?: string;
  futureOpacity?: string;
  spaceColor?: string;
  scale?: string;
}

export function loadPrefs(): ViewerPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ViewerPrefs) : {};
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
