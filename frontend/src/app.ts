// Unified viewer entry point.
//
// Navigates the 4-tier season_map.yaml hierarchy:
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
  getCompetitionViewTypes,
} from './config/season-map';
import { parseCsvResults } from './core/csv-parser';
import { dateFormat } from './core/date-utils';
import {
  getLastMatchDate, getSliderDate, syncSliderToTargetDate,
} from './core/date-slider';
import { prepareRenderData } from './core/prepare-render';
import type { MatchSortKey } from './ranking/stats-calculator';
import {
  makeRankData, makeRankTable,
  buildCrossGroupRows, makeCrossGroupTable,
} from './ranking/rank-table';
import type { GroupRenderResult } from './ranking/rank-table';
import { getMaxPointsPerGame } from './core/point-calculator';
import { renderBarGraph } from './graph/renderer';
import { DEFAULT_HEIGHT_UNIT, getHeightUnit, setFutureOpacity, setSpace, setScale } from './graph/css-utils';
import { findTeamsWithoutColor } from './graph/css-validator';
import { teamCssClass } from './core/team-utils';
import { loadPrefs, savePrefs, clearPrefs } from './storage/local-storage';
import type { ViewerPrefs } from './storage/local-storage';
import { t, applyI18nAttributes, setLocale } from './i18n';
import type { Locale } from './i18n';

// ---- Application state ------------------------------------------------

interface TeamMapCache {
  key: string;
  teamMap: TeamMap;
  teamCount: number;
  hasPk: boolean;
  hasEx: boolean;
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

// ---- Control state (symmetric with tournament-app.ts) -----------------

interface ViewerControlState {
  scale: number;
  futureOpacity: number;
  targetDate: string | null;
}

interface LeagueControlState {
  teamSortKey: string;
  matchSortKey: string;
  spaceColor: string;
}

interface ControlState {
  viewer: ViewerControlState;
  league: LeagueControlState;
}

function createControlStateFromPrefs(prefs: ViewerPrefs): ControlState {
  return {
    viewer: {
      scale: prefs.scale ? parseFloat(prefs.scale) : 1,
      futureOpacity: prefs.futureOpacity ? parseFloat(prefs.futureOpacity) : 0.1,
      targetDate: prefs.targetDate ?? null,
    },
    league: {
      teamSortKey: prefs.teamSortKey ?? 'disp_point',
      matchSortKey: prefs.matchSortKey ?? 'old_bottom',
      spaceColor: prefs.spaceColor ?? '#cccccc',
    },
  };
}

let controlState: ControlState = createControlStateFromPrefs({});

const DEFAULT_COMPETITION = 'J1';
const DEFAULT_GROUP = 'matches';

// CSV URL cache-busting: same bucket for requests within this window (seconds).
const CACHE_BUST_WINDOW_SEC = 300; // 5 minutes

// ---- Fixed dropdown options (generated into HTML by TS) ------------------

const MATCH_SORT_VALUES = ['old_bottom', 'new_bottom', 'first_bottom', 'last_bottom'] as const;

function getTeamSortOptions(): { value: string; label: string }[] {
  return [
    { value: 'disp_point',    label: t('sort.dispPoint') },
    { value: 'disp_avlbl_pt', label: t('sort.dispAvlblPt') },
    { value: 'point',         label: t('sort.point') },
    { value: 'avlbl_pt',      label: t('sort.avlblPt') },
  ];
}

function getMatchSortOptions(): { value: string; label: string }[] {
  return [
    { value: 'old_bottom',   label: t('sort.oldBottom') },
    { value: 'new_bottom',   label: t('sort.newBottom') },
    { value: 'first_bottom', label: t('sort.firstBottom') },
    { value: 'last_bottom',  label: t('sort.lastBottom') },
  ];
}

// ---- DOM helpers -------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
}

function showWarning(msg: string | null): void {
  const el = document.getElementById('warning_msg');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
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

type MatchSortUiValue = typeof MATCH_SORT_VALUES[number];

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
      if (!getCompetitionViewTypes(group, comp).includes('league')) continue;
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
  syncSliderToTargetDate(slider, matchDates, targetDate);

  const postEl = document.getElementById('post_date_slider');
  const lastDate = getLastMatchDate(matchDates);
  if (postEl && lastDate) postEl.textContent = lastDate;
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
  const { hasPk, hasEx } = cache;

  // Determine which groups to render and in what order.
  const allGroups = Object.keys(cache.teamMap);
  const groupKeys = seasonInfo.shownGroups
    ? seasonInfo.shownGroups.filter(g => allGroups.includes(g))
    : allGroups.sort();
  const isMultiGroup = groupKeys.length > 1;

  const globalMatchDateSet = new Set<string>();
  const allTeamCssClasses: string[] = [];
  const boxCon = document.getElementById('box_container') as HTMLElement | null;
  if (boxCon) boxCon.replaceChildren();

  // Prepare ranking table container.
  const sortableDiv = document.querySelector('#ranktable_section .sortable-table') as HTMLElement | null;
  if (sortableDiv) sortableDiv.innerHTML = '';

  // Collect per-group results for cross-group comparison (populated during loop).
  const allGroupResults: Record<string, GroupRenderResult> = {};

  for (const groupKey of groupKeys) {
    const singleGroupData = cache.teamMap[groupKey];
    if (!singleGroupData) continue;

    // For multi-group: use per-group team count from config.
    // promotionCount is kept as-is (group-stage competitions advance a fixed number per group).
    // relegationCount is zeroed because relegation is never decided per-group.
    const groupTeamCount = seasonInfo.groupTeamCount?.[groupKey] ?? seasonInfo.teamCount;
    const perGroupInfo: SeasonInfo = isMultiGroup
      ? { ...seasonInfo, teamCount: groupTeamCount, relegationCount: 0 }
      : seasonInfo;

    const { groupData, sortedTeams } = prepareRenderData({
      groupData: singleGroupData, seasonInfo: perGroupInfo, targetDate, sortKey, matchSortKey,
    });

    for (const team of sortedTeams) allTeamCssClasses.push(teamCssClass(team));

    if (boxCon) {
      const { fragment, matchDates } = renderBarGraph(
        groupData, sortedTeams, perGroupInfo,
        targetDate, disp, bottomFirst, state.heightUnit, hasPk, hasEx,
      );
      for (const d of matchDates) globalMatchDateSet.add(d);

      if (isMultiGroup) {
        // Wrap each group's graph in a flex container with a label.
        const wrapper = document.createElement('div');
        wrapper.classList.add('group_wrapper');
        const label = document.createElement('div');
        label.classList.add('group_label');
        label.textContent = t('graph.group', { key: groupKey });
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
      const rankData = makeRankData(groupData, sortedTeams, perGroupInfo, disp, hasPk, hasEx);
      makeRankTable(table, rankData, hasPk, hasEx, perGroupInfo.promotionLabel);
    }

    // Collect for cross-group comparison.
    if (isMultiGroup && seasonInfo.crossGroupStanding) {
      allGroupResults[groupKey] = { sortedTeams, groupData };
    }
  }

  // Cross-group standing comparison table (after all per-group tables).
  if (sortableDiv && seasonInfo.crossGroupStanding && Object.keys(allGroupResults).length > 1) {
    const cgs = seasonInfo.crossGroupStanding;
    const maxPt = getMaxPointsPerGame(seasonInfo.pointSystem);
    const rows = buildCrossGroupRows(allGroupResults, cgs, disp, targetDate, maxPt);
    if (rows.length > 0) {
      sortableDiv.appendChild(document.createElement('hr'));
      sortableDiv.appendChild(makeCrossGroupTable(rows, cgs));
    }
  }

  if (boxCon) {
    const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
    setScale(boxCon, scaleSlider?.value ?? '1');
    const globalMatchDates = [...globalMatchDateSet].sort();
    resetDateSlider(globalMatchDates, targetDate);
  }

  // Update season notes from season_map config.
  const notesEl = document.getElementById('season_notes');
  if (notesEl) {
    notesEl.replaceChildren();
    for (const text of seasonInfo.notes) {
      const li = document.createElement('li');
      li.textContent = text;
      notesEl.appendChild(li);
    }
  }

  // Update data source link from season_map config.
  const dsSection = document.getElementById('data_source_section');
  if (dsSection) {
    if (seasonInfo.dataSource) {
      const a = document.createElement('a');
      a.href = seasonInfo.dataSource.url;
      a.textContent = seasonInfo.dataSource.label;
      dsSection.replaceChildren(t('status.dataSource'), a);
    } else {
      dsSection.replaceChildren();
    }
  }

  // I3: Warn about teams with undefined CSS colors.
  const undefinedTeams = findTeamsWithoutColor(allTeamCssClasses);
  if (undefinedTeams.length > 0) {
    showWarning(t('warn.undefinedColor', { teams: undefinedTeams.join(', ') }));
  } else {
    showWarning(null);
  }
}

function loadAndRender(seasonMap: SeasonMap): void {
  const competition = getSelectValue('competition_key');
  const season      = getSelectValue('season_key');
  const csvKey      = `${competition}/${season}`;

  const targetDate    = controlState.viewer.targetDate?.replace(/-/g, '/') ?? dateFormat(new Date(), '/');

  const sortKey      = controlState.league.teamSortKey;
  const matchSortKey = getMatchSortKey(controlState.league.matchSortKey);
  const bottomFirst  = isBottomFirst(controlState.league.matchSortKey);
  const disp         = sortKey.startsWith('disp_');

  const found = findCompetition(seasonMap, competition);
  if (!found || !found.competition.seasons[season]) {
    setStatus(t('status.noSeason', { competition, season }));
    return;
  }

  const leagueDisplay = resolveSeasonInfo(found.group, found.competition, found.competition.seasons[season], found.groupKey).leagueDisplay;

  writeUrlParams(competition, season);
  savePrefs({
    competition, season,
    targetDate: controlState.viewer.targetDate ?? undefined,
    teamSortKey: sortKey,
    matchSortKey: controlState.league.matchSortKey,
  });

  const filename = getCsvFilename(competition, season);

  if (state.teamMapCache?.key === csvKey) {
    renderFromCache(state.teamMapCache, seasonMap, competition, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
    showTimestamp(filename);
    setStatus(t('status.cached', { league: leagueDisplay, season }));
    return;
  }

  const cachebuster = Math.floor(Date.now() / 1000 / CACHE_BUST_WINDOW_SEC);
  setStatus(t('status.loading'));

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
      const hasPk = fields.includes('home_pk_score');
      const hasEx = fields.includes('home_score_ex');

      const newCache = { key: csvKey, teamMap, teamCount: seasonInfo.teamCount, hasPk, hasEx };
      state.teamMapCache = newCache;

      renderFromCache(newCache, seasonMap, competition, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
      showTimestamp(filename);
      setStatus(t('status.loaded', { league: leagueDisplay, season, rows: results.data.length }));
    },
    error: (err: unknown) => {
      setStatus(t('status.error', { detail: String(err) }));
    },
  });
}

// ---- Initialization & event wiring ------------------------------------

async function main(): Promise<void> {
  // Restore locale from prefs before any i18n calls.
  const savedLocale = loadPrefs().locale;
  if (savedLocale === 'ja' || savedLocale === 'en') setLocale(savedLocale as Locale);

  applyI18nAttributes();
  void loadTimestampMap();

  let seasonMap: SeasonMap;
  try {
    seasonMap = await loadSeasonMap();
  } catch (err) {
    setStatus(t('status.seasonMapError'));
    console.error('Failed to load season map:', err);
    return;
  }

  state.heightUnit = getHeightUnit();

  populateCompetitionPulldown(seasonMap);
  populateFixedSelect('team_sort_key', getTeamSortOptions());
  populateFixedSelect('match_sort_key', getMatchSortOptions());

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

  // Restore control state from prefs
  controlState = createControlStateFromPrefs(prefs);

  const teamSortSel  = document.getElementById('team_sort_key') as HTMLSelectElement | null;
  const matchSortSel = document.getElementById('match_sort_key') as HTMLSelectElement | null;
  if (teamSortSel)  teamSortSel.value  = controlState.league.teamSortKey;
  if (matchSortSel) matchSortSel.value = controlState.league.matchSortKey;

  const futureOpacityEl = document.getElementById('future_opacity') as HTMLInputElement | null;
  const spaceColorEl    = document.getElementById('space_color')    as HTMLInputElement | null;
  const scaleSliderEl   = document.getElementById('scale_slider')   as HTMLInputElement | null;
  if (futureOpacityEl) futureOpacityEl.value = String(controlState.viewer.futureOpacity);
  if (spaceColorEl)    spaceColorEl.value    = controlState.league.spaceColor;
  if (scaleSliderEl)   scaleSliderEl.value   = String(controlState.viewer.scale);

  setFutureOpacity(String(controlState.viewer.futureOpacity), false);
  if (prefs.spaceColor) setSpace(controlState.league.spaceColor, false);

  const dateInput = document.getElementById('target_date') as HTMLInputElement;
  dateInput.value = controlState.viewer.targetDate ?? dateFormat(new Date(), '-');

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

  document.getElementById('target_date')?.addEventListener('change', () => {
    controlState.viewer.targetDate = (document.getElementById('target_date') as HTMLInputElement).value;
    loadAndRender(seasonMap);
  });

  document.getElementById('team_sort_key')?.addEventListener('change', () => {
    controlState.league.teamSortKey = getSelectValue('team_sort_key');
    loadAndRender(seasonMap);
  });

  document.getElementById('match_sort_key')?.addEventListener('change', () => {
    controlState.league.matchSortKey = getSelectValue('match_sort_key');
    loadAndRender(seasonMap);
  });

  // ---- Date slider events ----

  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    const updateFromSlider = (): void => {
      const date = getSliderDate(state.currentMatchDates, parseInt(dateSlider.value, 10));
      if (!date) return;
      const htmlDate = date.replace(/\//g, '-');
      (document.getElementById('target_date') as HTMLInputElement).value = htmlDate;
      controlState.viewer.targetDate = htmlDate;
      loadAndRender(seasonMap);
    };

    dateSlider.addEventListener('change', updateFromSlider);

    // Show date label in real-time while dragging (no graph redraw)
    dateSlider.addEventListener('input', () => {
      const date = getSliderDate(state.currentMatchDates, parseInt(dateSlider.value, 10));
      if (!date) return;
      (document.getElementById('target_date') as HTMLInputElement).value = date.replace(/\//g, '-');
    });

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value, 10) - 1));
      updateFromSlider();
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(parseInt(dateSlider.max, 10), parseInt(dateSlider.value, 10) + 1));
      updateFromSlider();
    });
    document.getElementById('reset_date_slider')?.addEventListener('click', () => {
      const today = dateFormat(new Date(), '-');
      (document.getElementById('target_date') as HTMLInputElement).value = today;
      controlState.viewer.targetDate = today;
      loadAndRender(seasonMap);
    });
  }

  // ---- Appearance events ----

  const boxCon = document.getElementById('box_container') as HTMLElement;

  document.getElementById('scale_slider')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    controlState.viewer.scale = parseFloat(v);
    setScale(boxCon, v);
    savePrefs({ scale: v });
  });

  document.getElementById('future_opacity')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    controlState.viewer.futureOpacity = parseFloat(v);
    setFutureOpacity(v);
    savePrefs({ futureOpacity: v });
  });

  document.getElementById('space_color')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    controlState.league.spaceColor = v;
    setSpace(v);
    savePrefs({ spaceColor: v });
  });

  // ---- Locale selector ----

  const localeSel = document.getElementById('locale_key') as HTMLSelectElement | null;
  if (localeSel) {
    if (savedLocale) localeSel.value = savedLocale;
    localeSel.addEventListener('change', () => {
      savePrefs({ locale: localeSel.value });
      location.reload();
    });
  }

  // ---- Reset ----

  document.getElementById('reset_prefs')?.addEventListener('click', () => {
    clearPrefs();
    location.assign(location.pathname);
  });

  // Initial render
  loadAndRender(seasonMap);
}

main().catch(console.error);
