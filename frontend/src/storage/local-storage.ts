// Viewer preference persistence via localStorage.
//
// Saved preferences are restored on next page load so the user's last
// competition/season/sort/appearance selections are preserved across sessions.

const STORAGE_KEY = 'jleague_viewer_prefs';

export interface ViewerPrefs {
  competition?: string;
  season?: string;
  targetDate?: string;   // YYYY-MM-DD (HTML date input format)
  teamSortKey?: string;
  matchSortKey?: string;
  futureOpacity?: string;
  spaceColor?: string;
  scale?: string;
}

// Legacy prefs stored `category` (numeric string like "1") instead of
// `competition` (key like "J1").  Detect and migrate on first load.
interface LegacyPrefs extends ViewerPrefs {
  category?: string;
}

const CATEGORY_TO_COMPETITION: Record<string, string> = {
  '1': 'J1', '2': 'J2', '3': 'J3',
};

export function loadPrefs(): ViewerPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LegacyPrefs;
    if (parsed.category && !parsed.competition) {
      parsed.competition = CATEGORY_TO_COMPETITION[parsed.category] ?? parsed.category;
      delete parsed.category;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
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
