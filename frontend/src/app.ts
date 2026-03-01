// Unified viewer entry point.
//
// Navigates the 4-tier season_map.json hierarchy:
//   group → competition → seasons → entry
//
// - Competition dropdown is populated dynamically with group separators.
// - URL parameters (?competition=J1&season=2026East) are read on init and written on change.
// - User preferences are persisted via localStorage and restored on reload.
// - Data timestamp is loaded from csv/csv_timestamp.csv and displayed.

import Papa from 'papaparse';
import type { RawMatchRow, TeamMap } from './types/match';
import type { SeasonMap, SeasonInfo } from './types/season';
import {
  loadSeasonMap, getCsvFilename, findCompetition, resolveSeasonInfo,
} from './config/season-map';
import { parseCsvResults } from './core/csv-parser';
import { dateFormat } from './core/date-utils';
import { prepareRenderData } from './core/prepare-render';
import type { MatchSortKey } from './ranking/stats-calculator';
import { makeRankData, makeRankTable } from './ranking/rank-table';
import { renderBarGraph, findSliderIndex } from './graph/renderer';
import { DEFAULT_HEIGHT_UNIT, getHeightUnit, setFutureOpacity, setSpace, setScale } from './graph/css-utils';
import { loadPrefs, savePrefs, clearPrefs } from './storage/local-storage';

// ---- Application state ------------------------------------------------

interface TeamMapCache {
  key: string;
  teamMap: TeamMap;
  teamCount: number;
  hasPk: boolean;
}

/** Mutable application state collected in one place. */
interface AppState {
  timestampMap: Record<string, string> | null;
  teamMapCache: TeamMapCache | null;
  currentMatchDates: string[];
  heightUnit: number;
}

const state: AppState = {
  timestampMap: null,
  teamMapCache: null,
  currentMatchDates: [],
  heightUnit: DEFAULT_HEIGHT_UNIT,
};

const DEFAULT_COMPETITION = 'J1';
const DEFAULT_GROUP = 'matches';

// CSV URL cache-busting: same bucket for requests within this window (seconds).
const CACHE_BUST_WINDOW_SEC = 300; // 5 minutes

// ---- Fixed dropdown options (generated into HTML by TS) ------------------

const TEAM_SORT_OPTIONS = [
  { value: 'disp_point',    label: '勝点(表示時)' },
  { value: 'disp_avlbl_pt', label: '最大勝点(表示時)' },
  { value: 'point',         label: '勝点(最新)' },
  { value: 'avlbl_pt',      label: '最大勝点(最新)' },
] as const;

const MATCH_SORT_OPTIONS = [
  { value: 'old_bottom',   label: '古い試合が下' },
  { value: 'new_bottom',   label: '新しい試合が下' },
  { value: 'first_bottom', label: '第1節が下' },
  { value: 'last_bottom',  label: '最終節が下' },
] as const;

// ---- DOM helpers -------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
}

// ---- Timestamp management ----------------------------------------------

async function loadTimestampMap(): Promise<Record<string, string>> {
  if (state.timestampMap !== null) return state.timestampMap;
  try {
    const res = await fetch('./csv/csv_timestamp.csv');
    if (!res.ok) return (state.timestampMap = {});
    const text = await res.text();
    const result = Papa.parse<{ file: string; date: string }>(text, {
      header: true,
      skipEmptyLines: 'greedy',
    });
    const map: Record<string, string> = {};
    for (const row of result.data) {
      const key = row.file.replace('../docs/', '');
      const d = new Date(row.date.replace(' ', 'T'));
      map[key] = isNaN(d.getTime()) ? row.date : formatTimestamp(d);
    }
    return (state.timestampMap = map);
  } catch {
    return (state.timestampMap = {});
  }
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showTimestamp(csvFilename: string): void {
  const el = document.getElementById('data_timestamp');
  if (!el || !state.timestampMap) return;
  el.textContent = state.timestampMap[csvFilename] ?? '';
}

// ---- URL parameter management ------------------------------------------

function readUrlParams(): { competition: string; season?: string } {
  const params = new URLSearchParams(location.search);
  return {
    competition: params.get('competition') ?? '',
    season: params.get('season') ?? undefined,
  };
}

function writeUrlParams(competition: string, season: string): void {
  const url = new URL(location.href);
  url.searchParams.set('competition', competition);
  url.searchParams.set('season', season);
  history.replaceState(null, '', url.toString());
}

// ---- Fixed dropdown population -----------------------------------------

type MatchSortUiValue = typeof MATCH_SORT_OPTIONS[number]['value'];

function populateFixedSelect(
  id: string,
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
): void {
  const sel = document.getElementById(id) as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  for (const { value, label } of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

// ---- Match sort key mapping --------------------------------------------

function getMatchSortKey(uiValue: string): MatchSortKey {
  const v = uiValue as MatchSortUiValue;
  return (v === 'first_bottom' || v === 'last_bottom') ? 'section_no' : 'match_date';
}

function isBottomFirst(uiValue: string): boolean {
  const v = uiValue as MatchSortUiValue;
  return (v === 'old_bottom' || v === 'first_bottom');
}

// ---- Competition pulldown population -----------------------------------

function populateCompetitionPulldown(seasonMap: SeasonMap): void {
  const sel = document.getElementById('competition_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const groups = Object.entries(seasonMap);
  const multiGroup = groups.length > 1;
  for (const [groupKey, group] of groups) {
    if (multiGroup) {
      // Disabled separator showing group name (only when multiple groups exist)
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = `── ${group.display_name ?? groupKey} `;
      sel.appendChild(sep);
    }

    for (const [compKey, comp] of Object.entries(group.competitions)) {
      const opt = document.createElement('option');
      opt.value = compKey;
      opt.textContent = comp.league_display ?? compKey;
      sel.appendChild(opt);
    }
  }
}

// ---- Season pulldown population ----------------------------------------

function populateSeasonPulldown(seasonMap: SeasonMap, competition: string): void {
  const sel = document.getElementById('season_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const found = findCompetition(seasonMap, competition);
  if (!found) return;
  const seasons = Object.keys(found.competition.seasons).sort().reverse();
  for (const s of seasons) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  }
}

// ---- Date slider management --------------------------------------------

function resetDateSlider(matchDates: string[], targetDate: string): void {
  state.currentMatchDates = matchDates;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (!slider || matchDates.length === 0) return;

  slider.max = String(matchDates.length - 1);

  const idx = findSliderIndex(matchDates, targetDate);
  slider.value = String(idx);

  const postEl = document.getElementById('post_date_slider');
  if (postEl) postEl.textContent = matchDates[matchDates.length - 1] ?? '';
}

// ---- Core render pipeline ----------------------------------------------

function renderFromCache(
  cache: TeamMapCache,
  seasonMap: SeasonMap,
  competition: string,
  season: string,
  targetDate: string,
  sortKey: string,
  matchSortKey: MatchSortKey,
  bottomFirst: boolean,
  disp: boolean,
): void {
  const found = findCompetition(seasonMap, competition);
  if (!found) return;
  const entry = found.competition.seasons[season];
  if (!entry) return;
  const seasonInfo = resolveSeasonInfo(found.group, found.competition, entry, found.groupKey);
  const { hasPk } = cache;

  // Determine which groups to render and in what order.
  const allGroups = Object.keys(cache.teamMap);
  const groupKeys = seasonInfo.shownGroups
    ? seasonInfo.shownGroups.filter(g => allGroups.includes(g))
    : allGroups.sort();
  const isMultiGroup = groupKeys.length > 1;

  const globalMatchDateSet = new Set<string>();
  const boxCon = document.getElementById('box_container') as HTMLElement | null;
  if (boxCon) boxCon.replaceChildren();

  // Prepare ranking table container.
  const sortableDiv = document.querySelector('#ranktable_section .sortable-table') as HTMLElement | null;
  if (sortableDiv) sortableDiv.innerHTML = '';

  for (const groupKey of groupKeys) {
    const singleGroupData = cache.teamMap[groupKey];
    if (!singleGroupData) continue;

    // For multi-group: use per-group team count, zero promotion/relegation.
    const perGroupInfo: SeasonInfo = isMultiGroup
      ? { ...seasonInfo, teamCount: Object.keys(singleGroupData).length, promotionCount: 0, relegationCount: 0 }
      : seasonInfo;

    const { groupData, sortedTeams } = prepareRenderData({
      groupData: singleGroupData, seasonInfo: perGroupInfo, targetDate, sortKey, matchSortKey,
    });

    if (boxCon) {
      const { fragment, matchDates } = renderBarGraph(
        groupData, sortedTeams, perGroupInfo,
        targetDate, disp, bottomFirst, state.heightUnit, hasPk,
      );
      for (const d of matchDates) globalMatchDateSet.add(d);

      if (isMultiGroup) {
        // Wrap each group's graph in a flex container with a label.
        const wrapper = document.createElement('div');
        wrapper.classList.add('group_wrapper');
        const label = document.createElement('div');
        label.classList.add('group_label');
        label.textContent = `グループ${groupKey}`;
        wrapper.appendChild(label);
        wrapper.appendChild(fragment);
        boxCon.appendChild(wrapper);
      } else {
        boxCon.appendChild(fragment);
      }
    }

    // Ranking table: one table per group (or single table for single-group).
    if (sortableDiv) {
      const table = document.createElement('table');
      table.className = 'ranktable';
      if (!isMultiGroup) table.id = 'ranktable';
      if (isMultiGroup) {
        const caption = document.createElement('caption');
        caption.textContent = `Group ${groupKey}`;
        table.appendChild(caption);
      }
      table.appendChild(document.createElement('thead'));
      sortableDiv.appendChild(table);
      const rankData = makeRankData(groupData, sortedTeams, perGroupInfo, disp, hasPk);
      makeRankTable(table, rankData, hasPk);
    }
  }

  if (boxCon) {
    const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
    setScale(boxCon, scaleSlider?.value ?? '1');
    const globalMatchDates = [...globalMatchDateSet].sort();
    resetDateSlider(globalMatchDates, targetDate);
  }
}

function loadAndRender(seasonMap: SeasonMap): void {
  const competition = getSelectValue('competition_key');
  const season      = getSelectValue('season_key');
  const csvKey      = `${competition}/${season}`;

  const targetDateRaw = (document.getElementById('target_date') as HTMLInputElement).value;
  const targetDate    = targetDateRaw.replace(/-/g, '/');

  const matchSortUiValue = getSelectValue('match_sort_key');
  const sortKey          = getSelectValue('team_sort_key');
  const matchSortKey     = getMatchSortKey(matchSortUiValue);
  const bottomFirst      = isBottomFirst(matchSortUiValue);
  const disp             = sortKey.startsWith('disp_');

  const found = findCompetition(seasonMap, competition);
  if (!found || !found.competition.seasons[season]) {
    setStatus(`シーズン情報なし: ${competition}/${season}`);
    return;
  }

  const leagueDisplay = resolveSeasonInfo(found.group, found.competition, found.competition.seasons[season], found.groupKey).leagueDisplay;

  writeUrlParams(competition, season);
  savePrefs({ competition, season, targetDate: targetDateRaw, teamSortKey: sortKey, matchSortKey: matchSortUiValue });

  const filename = getCsvFilename(competition, season);

  if (state.teamMapCache?.key === csvKey) {
    renderFromCache(state.teamMapCache, seasonMap, competition, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
    showTimestamp(filename);
    setStatus(`${leagueDisplay} ${season} (cached)`);
    return;
  }

  const cachebuster = Math.floor(Date.now() / 1000 / CACHE_BUST_WINDOW_SEC);
  setStatus('CSVを読み込み中...');

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const entry = found.competition.seasons[season];
      const seasonInfo = resolveSeasonInfo(found.group, found.competition, entry, found.groupKey);
      const teamMap = parseCsvResults(
        results.data,
        results.meta.fields ?? [],
        seasonInfo.teams,
        DEFAULT_GROUP,
        seasonInfo.pointSystem,
      );
      const fields = results.meta.fields ?? [];
      const hasPk = fields.includes('home_pk_score') || fields.includes('home_pk');

      const newCache = { key: csvKey, teamMap, teamCount: seasonInfo.teamCount, hasPk };
      state.teamMapCache = newCache;

      renderFromCache(newCache, seasonMap, competition, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
      showTimestamp(filename);
      setStatus(`${leagueDisplay} ${season} — ${results.data.length} 行`);
    },
    error: (err: unknown) => {
      setStatus(`CSV読み込みエラー: ${String(err)}`);
    },
  });
}

// ---- Initialization & event wiring ------------------------------------

async function main(): Promise<void> {
  void loadTimestampMap();

  let seasonMap: SeasonMap;
  try {
    seasonMap = await loadSeasonMap();
  } catch (err) {
    setStatus('season_map.json の読み込みに失敗しました');
    console.error('Failed to load season map:', err);
    return;
  }

  state.heightUnit = getHeightUnit();

  populateCompetitionPulldown(seasonMap);
  populateFixedSelect('team_sort_key', TEAM_SORT_OPTIONS);
  populateFixedSelect('match_sort_key', MATCH_SORT_OPTIONS);

  // Determine initial competition/season from URL params → localStorage → default
  const urlParams = readUrlParams();
  const prefs     = loadPrefs();

  const competitionSel = document.getElementById('competition_key') as HTMLSelectElement;
  const initCompetition = (urlParams.competition && findCompetition(seasonMap, urlParams.competition))
    ? urlParams.competition
    : (prefs.competition && findCompetition(seasonMap, prefs.competition))
    ? prefs.competition
    : DEFAULT_COMPETITION;
  competitionSel.value = initCompetition;

  populateSeasonPulldown(seasonMap, initCompetition);

  const seasonSel = document.getElementById('season_key') as HTMLSelectElement;
  const found = findCompetition(seasonMap, initCompetition);
  const initSeason = (urlParams.season && found?.competition.seasons[urlParams.season])
    ? urlParams.season
    : (prefs.season && found?.competition.seasons[prefs.season])
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

  setFutureOpacity(futureOpacityEl?.value ?? '0.1', false);
  if (prefs.spaceColor) setSpace(prefs.spaceColor, false);

  // Restore target date from prefs; fall back to today.
  const dateInput = document.getElementById('target_date') as HTMLInputElement;
  dateInput.value = prefs.targetDate ?? dateFormat(new Date(), '-');

  // ---- Data-selection events ----

  competitionSel.addEventListener('change', () => {
    state.teamMapCache = null;
    populateSeasonPulldown(seasonMap, competitionSel.value);
    loadAndRender(seasonMap);
  });

  document.getElementById('season_key')?.addEventListener('change', () => {
    state.teamMapCache = null;
    loadAndRender(seasonMap);
  });

  for (const id of ['target_date', 'team_sort_key', 'match_sort_key']) {
    document.getElementById(id)?.addEventListener('change', () => {
      loadAndRender(seasonMap);
    });
  }

  // ---- Date slider events ----

  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    const updateFromSlider = (): void => {
      const date = state.currentMatchDates[parseInt(dateSlider.value, 10)];
      if (!date) return;
      (document.getElementById('target_date') as HTMLInputElement).value = date.replace(/\//g, '-');
      loadAndRender(seasonMap);
    };

    dateSlider.addEventListener('change', updateFromSlider);

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value, 10) - 1));
      updateFromSlider();
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(parseInt(dateSlider.max, 10), parseInt(dateSlider.value, 10) + 1));
      updateFromSlider();
    });
    document.getElementById('reset_date_slider')?.addEventListener('click', () => {
      (document.getElementById('target_date') as HTMLInputElement).value = dateFormat(new Date(), '-');
      loadAndRender(seasonMap);
    });
  }

  // ---- Appearance events ----

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

  // ---- Reset ----

  document.getElementById('reset_prefs')?.addEventListener('click', () => {
    clearPrefs();
    location.assign(location.pathname);
  });

  // Initial render
  loadAndRender(seasonMap);
}

main().catch(console.error);
