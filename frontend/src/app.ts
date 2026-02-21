// Unified viewer entry point.
//
// Differences from j_points.ts (J-league-only dev page):
//   - Category dropdown is populated dynamically from season_map.json keys.
//   - URL parameters (?category=1&season=2026) are read on init and written on change.
//   - User preferences (category, season, target_date, sort keys, appearance) are persisted
//     via localStorage and restored on reload.
//   - Data timestamp is loaded from csv/csv_timestamp.csv and displayed.
//   - A "reset preferences" button clears localStorage.

import Papa from 'papaparse';
import type { RawMatchRow, TeamData } from './types/match';
import type { SeasonMap } from './types/season';
import { loadSeasonMap, getCsvFilename } from './config/season-map';
import { parseCsvResults } from './core/csv-parser';
import { parseSeasonEntry } from './types/season';
import { getSortedTeamList } from './core/sorter';
import { calculateTeamStats } from './ranking/stats-calculator';
import type { MatchSortKey } from './ranking/stats-calculator';
import { makeRankData, makeRankTable } from './ranking/rank-table';
import { renderBarGraph, findSliderIndex } from './graph/renderer';
import { getHeightUnit, setFutureOpacity, setSpace, setScale } from './graph/css-utils';
import { loadPrefs, savePrefs, clearPrefs } from './storage/local-storage';

const DEFAULT_CATEGORY = '1';

// ---- Category helpers --------------------------------------------------

/** Derives a display name from a category key. e.g. "1" → "J1リーグ" */
function categoryName(category: string): string {
  return `J${category}リーグ`;
}

// ---- DOM helpers -------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
}

// ---- Timestamp management ----------------------------------------------

// Cache: CSV filename (e.g. "csv/2026_allmatch_result-J1.csv") → timestamp string
let timestampMap: Record<string, string> | null = null;

/**
 * Loads csv/csv_timestamp.csv once and caches the result.
 * The "file" column uses "../docs/csv/..." paths; we strip "../docs/" to
 * match the paths returned by getCsvFilename().
 */
async function loadTimestampMap(): Promise<Record<string, string>> {
  if (timestampMap !== null) return timestampMap;
  try {
    const res = await fetch('./csv/csv_timestamp.csv');
    if (!res.ok) return (timestampMap = {});
    const text = await res.text();
    const result = Papa.parse<{ file: string; date: string }>(text, {
      header: true,
      skipEmptyLines: 'greedy',
    });
    const map: Record<string, string> = {};
    for (const row of result.data) {
      const key = row.file.replace('../docs/', '');
      // Format: "2026-01-01 12:34:56.789+09:00" → "2026/01/01 12:34"
      const d = new Date(row.date.replace(' ', 'T'));
      map[key] = isNaN(d.getTime()) ? row.date : formatTimestamp(d);
    }
    return (timestampMap = map);
  } catch {
    return (timestampMap = {});
  }
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showTimestamp(csvFilename: string): void {
  const el = document.getElementById('data_timestamp');
  if (!el || !timestampMap) return;
  el.textContent = timestampMap[csvFilename] ?? '';
}

// ---- URL parameter management ------------------------------------------

function readUrlParams(): { category: string; season?: string } {
  const params = new URLSearchParams(location.search);
  return {
    category: params.get('category') ?? '',
    season: params.get('season') ?? undefined,
  };
}

function writeUrlParams(category: string, season: string): void {
  const url = new URL(location.href);
  url.searchParams.set('category', category);
  url.searchParams.set('season', season);
  history.replaceState(null, '', url.toString());
}

// ---- Match sort key mapping --------------------------------------------

function getMatchSortKey(uiValue: string): MatchSortKey {
  return ['first_bottom', 'last_bottom'].includes(uiValue) ? 'section_no' : 'match_date';
}

function isBottomFirst(uiValue: string): boolean {
  return ['old_bottom', 'first_bottom'].includes(uiValue);
}

// ---- Category pulldown population --------------------------------------

function populateCategoryPulldown(seasonMap: SeasonMap): void {
  const sel = document.getElementById('category_key') as HTMLSelectElement;
  sel.innerHTML = '';
  for (const cat of Object.keys(seasonMap).sort()) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = categoryName(cat);
    sel.appendChild(opt);
  }
}

// ---- Season pulldown population ----------------------------------------

function populateSeasonPulldown(seasonMap: SeasonMap, category: string): void {
  const sel = document.getElementById('season_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const seasons = Object.keys(seasonMap[category] ?? {}).sort().reverse();
  for (const s of seasons) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  }
}

// ---- Date slider management --------------------------------------------

let currentMatchDates: string[] = [];

function resetDateSlider(matchDates: string[], targetDate: string): void {
  currentMatchDates = matchDates;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (!slider || matchDates.length === 0) return;

  slider.max = String(matchDates.length - 1);

  const idx = findSliderIndex(matchDates, targetDate);
  slider.value = String(idx);

  const postEl = document.getElementById('post_date_slider');
  if (postEl) postEl.textContent = matchDates[matchDates.length - 1] ?? '';

}

// ---- Cached TeamMap ----------------------------------------------------

interface TeamMapCache {
  key: string;
  groupData: Record<string, TeamData>;
  teamCount: number;
  hasPk: boolean;
}
let teamMapCache: TeamMapCache | null = null;

let heightUnit = 20;

// ---- Core render pipeline ----------------------------------------------

function renderFromCache(
  cache: TeamMapCache,
  seasonMap: SeasonMap,
  category: string,
  season: string,
  targetDate: string,
  sortKey: string,
  matchSortKey: MatchSortKey,
  bottomFirst: boolean,
  disp: boolean,
): void {
  const seasonEntry = seasonMap[category]?.[season];
  if (!seasonEntry) return;
  const seasonInfo = parseSeasonEntry(seasonEntry);

  const groupData: Record<string, TeamData> = {};
  for (const [name, td] of Object.entries(cache.groupData)) {
    groupData[name] = { ...td, df: [...td.df] };
  }

  for (const teamData of Object.values(groupData)) {
    calculateTeamStats(teamData, targetDate, matchSortKey);
  }

  const sortedTeams = getSortedTeamList(groupData, sortKey);

  const { hasPk } = cache;

  const boxCon = document.getElementById('box_container') as HTMLElement | null;
  if (boxCon) {
    const { html, matchDates } = renderBarGraph(
      groupData, sortedTeams, seasonInfo,
      targetDate, disp, matchSortKey, bottomFirst, heightUnit, hasPk,
    );
    boxCon.innerHTML = html;
    const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
    setScale(boxCon, scaleSlider?.value ?? '1');
    resetDateSlider(matchDates, targetDate);
  }

  const rankData = makeRankData(groupData, sortedTeams, seasonInfo, disp);
  const tableEl = document.getElementById('ranktable');
  if (tableEl) makeRankTable(tableEl, rankData, hasPk);
}

function loadAndRender(seasonMap: SeasonMap): void {
  const category = getSelectValue('category_key');
  const season   = getSelectValue('season_key');
  const csvKey   = `${category}/${season}`;

  const targetDateRaw = (document.getElementById('target_date') as HTMLInputElement).value;
  const targetDate    = targetDateRaw.replace(/-/g, '/');

  const matchSortUiValue = getSelectValue('match_sort_key');
  const sortKey          = getSelectValue('team_sort_key');
  const matchSortKey     = getMatchSortKey(matchSortUiValue);
  const bottomFirst      = isBottomFirst(matchSortUiValue);
  const disp             = sortKey.startsWith('disp_');

  const seasonEntry = seasonMap[category]?.[season];
  if (!seasonEntry) {
    setStatus(`シーズン情報なし: ${category}/${season}`);
    return;
  }

  writeUrlParams(category, season);
  savePrefs({ category, season, targetDate: targetDateRaw, teamSortKey: sortKey, matchSortKey: matchSortUiValue });

  const filename = getCsvFilename(category, season);

  if (teamMapCache?.key === csvKey) {
    renderFromCache(teamMapCache!, seasonMap, category, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
    showTimestamp(filename);
    setStatus(`${categoryName(category)} ${season} (cached)`);
    return;
  }

  const cachebuster = Math.floor(Date.now() / 1000 / 300);
  setStatus('CSVを読み込み中...');

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const parseSeasonInfo = parseSeasonEntry(seasonMap[category]![season]!);
      const teamMap = parseCsvResults(
        results.data,
        results.meta.fields ?? [],
        parseSeasonInfo.teams,
        'matches',
      );
      const groupData = teamMap['matches'] ?? {};
      const hasPk = (results.meta.fields ?? []).includes('home_pk_score');

      const newCache = { key: csvKey, groupData, teamCount: parseSeasonInfo.teamCount, hasPk };
      teamMapCache = newCache;

      renderFromCache(newCache, seasonMap, category, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
      showTimestamp(filename);
      setStatus(`${categoryName(category)} ${season} — ${results.data.length} 行`);
    },
    error: (err: unknown) => {
      setStatus(`CSV読み込みエラー: ${String(err)}`);
    },
  });
}

// ---- Initialization & event wiring ------------------------------------

async function main(): Promise<void> {
  // Match result file timestamp fetch in parallel with season map load.
  void loadTimestampMap();
  const seasonMap = await loadSeasonMap();

  const unit = getHeightUnit();
  if (unit > 0) heightUnit = unit;

  // Populate category dropdown from season_map.json keys
  populateCategoryPulldown(seasonMap);

  // Determine initial category/season from URL params → localStorage → default
  const urlParams = readUrlParams();
  const prefs     = loadPrefs();

  const categorySel = document.getElementById('category_key') as HTMLSelectElement;
  const initCategory = (urlParams.category && seasonMap[urlParams.category])
    ? urlParams.category
    : (prefs.category && seasonMap[prefs.category])
    ? prefs.category
    : DEFAULT_CATEGORY;
  categorySel.value = initCategory;

  populateSeasonPulldown(seasonMap, initCategory);

  const seasonSel = document.getElementById('season_key') as HTMLSelectElement;
  const initSeason = (urlParams.season && seasonMap[initCategory]?.[urlParams.season])
    ? urlParams.season
    : (prefs.season && seasonMap[initCategory]?.[prefs.season])
    ? prefs.season
    : seasonSel.options[0]?.value ?? '';
  seasonSel.value = initSeason;

  // Restore sort keys from prefs
  const teamSortSel  = document.getElementById('team_sort_key') as HTMLSelectElement | null;
  const matchSortSel = document.getElementById('match_sort_key') as HTMLSelectElement | null;
  if (teamSortSel  && prefs.teamSortKey)   teamSortSel.value  = prefs.teamSortKey;
  if (matchSortSel && prefs.matchSortKey)  matchSortSel.value = prefs.matchSortKey;

  // Restore appearance from prefs
  const futureOpacityEl = document.getElementById('future_opacity') as HTMLInputElement | null;
  const spaceColorEl    = document.getElementById('space_color')    as HTMLInputElement | null;
  const scaleSliderEl   = document.getElementById('scale_slider')   as HTMLInputElement | null;
  if (futureOpacityEl && prefs.futureOpacity) futureOpacityEl.value = prefs.futureOpacity;
  if (spaceColorEl    && prefs.spaceColor)    spaceColorEl.value    = prefs.spaceColor;
  if (scaleSliderEl   && prefs.scale)         scaleSliderEl.value   = prefs.scale;

  // Apply restored values to CSS rules and update display spans.
  // updateSlider=false because the inputs were already set above.
  setFutureOpacity(futureOpacityEl?.value ?? '0.1', false);
  if (prefs.spaceColor) setSpace(prefs.spaceColor, false);

  // Restore target date from prefs; fall back to today.
  const dateInput = document.getElementById('target_date') as HTMLInputElement;
  if (prefs.targetDate) {
    dateInput.value = prefs.targetDate;
  } else {
    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  // ---- Event listeners ----

  categorySel.addEventListener('change', () => {
    teamMapCache = null;
    populateSeasonPulldown(seasonMap, categorySel.value);
    loadAndRender(seasonMap);
  });

  document.getElementById('season_key')?.addEventListener('change', () => {
    teamMapCache = null;
    loadAndRender(seasonMap);
  });

  for (const id of ['target_date', 'team_sort_key', 'match_sort_key']) {
    document.getElementById(id)?.addEventListener('change', () => {
      // targetDate is saved inside loadAndRender via savePrefs
      loadAndRender(seasonMap);
    });
  }

  // Date slider
  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    const updateFromSlider = (): void => {
      const date = currentMatchDates[parseInt(dateSlider.value)];
      if (!date) return;
      (document.getElementById('target_date') as HTMLInputElement).value = date.replace(/\//g, '-');
      loadAndRender(seasonMap);
    };

    dateSlider.addEventListener('change', updateFromSlider);

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value) - 1));
      updateFromSlider();
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(parseInt(dateSlider.max), parseInt(dateSlider.value) + 1));
      updateFromSlider();
    });
    document.getElementById('reset_date_slider')?.addEventListener('click', () => {
      const t = new Date();
      (document.getElementById('target_date') as HTMLInputElement).value =
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      loadAndRender(seasonMap);
    });
  }

  // Appearance sliders
  const boxCon = document.getElementById('box_container') as HTMLElement;

  document.getElementById('scale_slider')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    setScale(boxCon, v);
    savePrefs({ scale: v });
  });

  document.getElementById('future_opacity')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    setFutureOpacity(v);
    savePrefs({ futureOpacity: v });
  });

  document.getElementById('space_color')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    setSpace(v);
    savePrefs({ spaceColor: v });
  });

  // Reset preferences
  document.getElementById('reset_prefs')?.addEventListener('click', () => {
    clearPrefs();
    location.assign(location.pathname); // reload without URL params
  });

  // Initial render
  loadAndRender(seasonMap);
}

main().catch(console.error);
