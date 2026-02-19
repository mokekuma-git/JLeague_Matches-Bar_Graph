// Development entry point: loads season map + CSV, calculates stats, and renders the ranking table.

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

// ---- DOM helpers -------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
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

// ---- Match sort key mapping --------------------------------------------

// UI dropdown value → MatchSortKey used by calculateTeamStats
function getMatchSortKey(uiValue: string): MatchSortKey {
  return ['first_bottom', 'last_bottom'].includes(uiValue) ? 'section_no' : 'match_date';
}

// ---- Cached TeamMap (re-used when only controls change, not season) ----

// Simple cache keyed by 'category/season' to avoid redundant CSV fetches.
// PapaParse downloads are also browser-cached, so re-fetches are cheap anyway.
interface TeamMapCache {
  key: string;
  groupData: Record<string, TeamData>;
  teamCount: number;
}
let teamMapCache: TeamMapCache | null = null;

// ---- Core render pipeline ----------------------------------------------

function renderFromCache(
  cache: TeamMapCache,
  seasonMap: SeasonMap,
  category: string,
  season: string,
  targetDate: string,
  sortKey: string,
  matchSortKey: MatchSortKey,
  disp: boolean,
): void {
  const seasonEntry = seasonMap[category]?.[season];
  if (!seasonEntry) return;
  const seasonInfo = parseSeasonEntry(seasonEntry);

  // Deep-copy df arrays so calculateTeamStats can mutate without corrupting cache.
  // (TeamData stats fields are re-initialized inside calculateTeamStats, but df is sorted in place.)
  const groupData: Record<string, TeamData> = {};
  for (const [name, td] of Object.entries(cache.groupData)) {
    groupData[name] = { ...td, df: [...td.df] };
  }

  for (const teamData of Object.values(groupData)) {
    calculateTeamStats(teamData, targetDate, matchSortKey);
  }

  const sortedTeams = getSortedTeamList(groupData, sortKey);
  const rankData    = makeRankData(groupData, sortedTeams, seasonInfo, disp);

  const tableEl = document.getElementById('ranktable');
  if (tableEl) makeRankTable(tableEl, rankData);
}

function loadAndRender(seasonMap: SeasonMap): void {
  const category = getSelectValue('category_key');
  const season   = getSelectValue('season_key');
  const csvKey   = `${category}/${season}`;

  const targetDateRaw = (document.getElementById('target_date') as HTMLInputElement).value;
  const targetDate    = targetDateRaw.replace(/-/g, '/'); // YYYY/MM/DD for CSV comparison

  const sortKey      = getSelectValue('team_sort_key');
  const matchSortKey = getMatchSortKey(getSelectValue('match_sort_key'));
  const disp         = sortKey.startsWith('disp_');

  const seasonEntry = seasonMap[category]?.[season];
  if (!seasonEntry) {
    setStatus(`シーズン情報なし: ${category}/${season}`);
    return;
  }
  const seasonInfo = parseSeasonEntry(seasonEntry);

  // Re-use cached CSV when category/season hasn't changed
  if (teamMapCache?.key === csvKey) {
    renderFromCache(teamMapCache, seasonMap, category, season, targetDate, sortKey, matchSortKey, disp);
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

      // Store raw parsed data (before stat calculation) in cache
      teamMapCache = { key: csvKey, groupData, teamCount: seasonInfo.teamCount };

      renderFromCache(teamMapCache, seasonMap, category, season, targetDate, sortKey, matchSortKey, disp);
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

  // Set today's date as default for the target date input
  const today  = new Date();
  const yyyy   = today.getFullYear();
  const mm     = String(today.getMonth() + 1).padStart(2, '0');
  const dd     = String(today.getDate()).padStart(2, '0');
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

  // Initial render
  loadAndRender(seasonMap);
}

main().catch(console.error);
