// Development entry point: loads season map + CSV, then renders bar graph and ranking table.

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
import { renderBarGraph, findSliderIndex, formatSliderDate } from './graph/renderer';
import { getHeightUnit, setFutureOpacity, setSpace, setScale } from './graph/css-utils';

// ---- DOM helpers -------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
}

// ---- Match sort key mapping --------------------------------------------

// UI dropdown value → MatchSortKey used by calculateTeamStats
function getMatchSortKey(uiValue: string): MatchSortKey {
  return ['first_bottom', 'last_bottom'].includes(uiValue) ? 'section_no' : 'match_date';
}

// UI dropdown value → whether to reverse box order (old/first match at graphical bottom)
function isBottomFirst(uiValue: string): boolean {
  return ['old_bottom', 'first_bottom'].includes(uiValue);
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

// Module-level cache of match dates from the last render (for slider ↔ date input sync).
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

  const displayEl = document.getElementById('target_date_display');
  if (displayEl) displayEl.textContent = formatSliderDate(matchDates[idx] ?? '1970/01/01', targetDate);
}

// ---- Cached TeamMap (re-used when only controls change, not season) ----

interface TeamMapCache {
  key: string;
  groupData: Record<string, TeamData>;
  teamCount: number;
}
let teamMapCache: TeamMapCache | null = null;

// HEIGHT_UNIT: initialized from CSS after page load; falls back to 20px.
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

  // Deep-copy df arrays so calculateTeamStats can mutate without corrupting cache.
  const groupData: Record<string, TeamData> = {};
  for (const [name, td] of Object.entries(cache.groupData)) {
    groupData[name] = { ...td, df: [...td.df] };
  }

  for (const teamData of Object.values(groupData)) {
    calculateTeamStats(teamData, targetDate, matchSortKey);
  }

  const sortedTeams = getSortedTeamList(groupData, sortKey);

  // Render bar graph
  const boxCon = document.getElementById('box_container') as HTMLElement | null;
  if (boxCon) {
    const { html, matchDates } = renderBarGraph(
      groupData, sortedTeams, seasonInfo,
      targetDate, disp, matchSortKey, bottomFirst, heightUnit,
    );
    boxCon.innerHTML = html;
    const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
    setScale(boxCon, scaleSlider?.value ?? '1', false);
    // matchDates already starts with sentinel '1970/01/01' (added in renderBarGraph).
    resetDateSlider(matchDates, targetDate);
  }

  // Render ranking table
  const rankData = makeRankData(groupData, sortedTeams, seasonInfo, disp);
  const tableEl = document.getElementById('ranktable');
  if (tableEl) makeRankTable(tableEl, rankData);
}

function loadAndRender(seasonMap: SeasonMap): void {
  const category = getSelectValue('category_key');
  const season   = getSelectValue('season_key');
  const csvKey   = `${category}/${season}`;

  const targetDateRaw = (document.getElementById('target_date') as HTMLInputElement).value;
  const targetDate    = targetDateRaw.replace(/-/g, '/'); // YYYY/MM/DD for CSV comparison

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
  const seasonInfo = parseSeasonEntry(seasonEntry);

  // Re-use cached CSV when category/season hasn't changed
  if (teamMapCache?.key === csvKey) {
    renderFromCache(teamMapCache, seasonMap, category, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
    setStatus(`${category} ${season} (cached)`);
    return;
  }

  // Fetch CSV
  const filename    = getCsvFilename(category, season);
  const cachebuster = Math.floor(Date.now() / 1000 / 300);
  setStatus('CSVを読み込み中...');

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const teamMap = parseCsvResults(
        results.data,
        results.meta.fields ?? [],
        seasonInfo.teams,
        'matches',
      );
      const groupData = teamMap['matches'] ?? {};

      teamMapCache = { key: csvKey, groupData, teamCount: seasonInfo.teamCount };

      renderFromCache(teamMapCache, seasonMap, category, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
      setStatus(`${category} ${season} — ${results.data.length} 行`);
    },
    error: (err: unknown) => {
      setStatus(`CSV読み込みエラー: ${String(err)}`);
    },
  });
}

// ---- Initialization & event wiring ------------------------------------

async function main(): Promise<void> {
  const seasonMap = await loadSeasonMap();

  // HEIGHT_UNIT: read from CSS after stylesheets are loaded.
  const unit = getHeightUnit();
  if (unit > 0) heightUnit = unit;

  // Set today's date as default for the target date input
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  (document.getElementById('target_date') as HTMLInputElement).value = `${yyyy}-${mm}-${dd}`;

  // Populate season pulldown for the default category
  const categorySel = document.getElementById('category_key') as HTMLSelectElement;
  populateSeasonPulldown(seasonMap, categorySel.value);

  // Re-populate seasons (and clear cache) when category changes, then re-render
  categorySel.addEventListener('change', () => {
    teamMapCache = null;
    populateSeasonPulldown(seasonMap, categorySel.value);
    loadAndRender(seasonMap);
  });

  // Re-render on season change (clears cache), or controls-only change (uses cache)
  document.getElementById('season_key')?.addEventListener('change', () => {
    teamMapCache = null;
    loadAndRender(seasonMap);
  });
  for (const id of ['target_date', 'team_sort_key', 'match_sort_key']) {
    document.getElementById(id)?.addEventListener('change', () => loadAndRender(seasonMap));
  }

  // ---- Date slider events ----

  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    const updateFromSlider = (): void => {
      const date = currentMatchDates[parseInt(dateSlider.value)];
      if (!date) return;
      const isPreSeason = date === '1970/01/01';
      // Update date input: '1970/01/01' → '1970-01-01' (renders all matches as future)
      (document.getElementById('target_date') as HTMLInputElement).value =
        date.replace(/\//g, '-');
      // Update display span immediately (don't wait for full re-render)
      const displayEl = document.getElementById('target_date_display');
      if (displayEl) displayEl.textContent = isPreSeason ? '開幕前' : date;
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

  // ---- Appearance slider events (no localStorage in Phase 3a) ----

  const boxCon = document.getElementById('box_container') as HTMLElement;

  document.getElementById('scale_slider')?.addEventListener('input', (e) => {
    setScale(boxCon, (e.target as HTMLInputElement).value);
  });

  document.getElementById('future_opacity')?.addEventListener('input', (e) => {
    setFutureOpacity((e.target as HTMLInputElement).value);
  });

  document.getElementById('space_color')?.addEventListener('input', (e) => {
    setSpace((e.target as HTMLInputElement).value);
  });

  // Initial render
  loadAndRender(seasonMap);
}

main().catch(console.error);
