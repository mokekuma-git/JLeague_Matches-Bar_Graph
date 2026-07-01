// League view module.
//
// Navigates the 4-tier season_map.yaml hierarchy:
//   family → competition → seasons → entry
//
// - Competition dropdown is populated dynamically with family separators.
// - URL parameters (?competition=J1&season=2026East) are read on init and written on change.
// - User preferences are persisted via localStorage and restored on reload.
// - Data timestamp is loaded from csv/csv_timestamp.csv and displayed.

import Papa from 'papaparse';
import type { RawMatchRow, TeamMap } from './types/match';
import type { SeasonMap, LeagueSeasonInfo } from './types/season';
import {
  getCsvFilename, findCompetition, resolveLeagueSeasonInfo,
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
  buildCrossGroupRows, makeCrossGroupTable, getToggleableColumns,
} from './ranking/rank-table';
import type { GroupRenderResult } from './ranking/rank-table';
import { getMaxPointsPerGame } from './core/point-calculator';
import { renderBarGraph } from './graph/renderer';
import { DEFAULT_HEIGHT_UNIT, getHeightUnit, setFutureOpacity, setSpace, setScale } from './graph/css-utils';
import { findTeamsWithoutColor } from './graph/css-validator';
import { teamCssClass } from './core/team-utils';
import { loadPrefs, savePrefs } from './storage/local-storage';
import type { ViewerPrefs } from './storage/local-storage';
import { t } from './i18n';
import {
  clampToSlider, normalizeTargetDate, toInputDate,
} from './view-bootstrap';
import type { SharedViewerControlState } from './view-bootstrap';

// ---- Application state ------------------------------------------------

interface TeamMapCache {
  key: string;
  teamMap: TeamMap;
  teamCount: number;
  hasPk: boolean;
  hasEx: boolean;
  hasTimezone: boolean;  // true → at least one match carries a source TZ (per-row column or season)
}

/** Mutable application state collected in one place. */
interface AppState {
  timestampMap: Record<string, string> | null;
  teamMapCache: TeamMapCache | null;
  currentMatchDates: string[];
  heightUnit: number;
  renderVersion: number;
}

const state: AppState = {
  timestampMap: null,
  teamMapCache: null,
  currentMatchDates: [],
  heightUnit: DEFAULT_HEIGHT_UNIT,
  renderVersion: 0,
};

// ---- Control state (symmetric with bracket-view.ts) --------------------

interface LeagueViewerControlState extends SharedViewerControlState {
  displayTimezone: string;  // '' = browser default; otherwise an IANA TZ name
  hiddenColumns: Set<string>;  // rank table column data-ids hidden by the user
}

interface LeagueControlState {
  teamSortKey: string;
  matchSortKey: string;
  spaceColor: string;
}

interface ControlState {
  viewer: LeagueViewerControlState;
  league: LeagueControlState;
}

function createControlStateFromPrefs(
  prefs: ViewerPrefs,
  shared: SharedViewerControlState,
): ControlState {
  return {
    viewer: {
      ...shared,
      displayTimezone: prefs.displayTimezone ?? '',
      hiddenColumns: new Set(prefs.hiddenColumns ?? []),
    },
    league: {
      teamSortKey: prefs.teamSortKey ?? 'disp_point',
      matchSortKey: prefs.matchSortKey ?? 'old_bottom',
      spaceColor: prefs.spaceColor ?? '#cccccc',
    },
  };
}

let controlState: ControlState;
let activeSeasonMap: SeasonMap | null = null;
let activeSelection: LeagueViewSelection | null = null;

const DEFAULT_GROUP = 'matches';

// CSV URL cache-busting: same bucket for requests within this window (seconds).
const CACHE_BUST_WINDOW_SEC = 300; // 5 minutes

export interface LeagueViewSelection {
  competition: string;
  season: string;
}

export interface LeagueViewContext {
  shared: SharedViewerControlState;
  onViewerChange(): void;
}

export interface LeagueViewHandle {
  activate(seasonMap: SeasonMap, selection: LeagueViewSelection): void;
  deactivate(): void;
}

export interface LeagueViewIds {
  competition: string;
  season: string;
  teamSort: string;
  matchSort: string;
  displayTimezone: string;
  displayTimezoneLabel: string;
  dateSlider: string;
  dateSliderDown: string;
  dateSliderUp: string;
  dateSliderReset: string;
  postDateSlider: string;
  targetDate: string;
  scaleSlider: string;
  futureOpacity: string;
  spaceColor: string;
  columnToggleList: string;
  status: string;
  warning: string;
  timestamp: string;
  boxContainer: string;
  ranktableSection: string;
  seasonNotes: string;
  dataSourceSection: string;
}

export const LEAGUE_STANDALONE_IDS: LeagueViewIds = {
  competition: 'competition_key',
  season: 'season_key',
  teamSort: 'team_sort_key',
  matchSort: 'match_sort_key',
  displayTimezone: 'display_timezone',
  displayTimezoneLabel: 'display_timezone_label',
  dateSlider: 'date_slider',
  dateSliderDown: 'date_slider_down',
  dateSliderUp: 'date_slider_up',
  dateSliderReset: 'reset_date_slider',
  postDateSlider: 'post_date_slider',
  targetDate: 'target_date',
  scaleSlider: 'scale_slider',
  futureOpacity: 'future_opacity',
  spaceColor: 'space_color',
  columnToggleList: 'column_toggle_list',
  status: 'status_msg',
  warning: 'warning_msg',
  timestamp: 'data_timestamp',
  boxContainer: 'box_container',
  ranktableSection: 'ranktable_section',
  seasonNotes: 'season_notes',
  dataSourceSection: 'data_source_section',
};

export const LEAGUE_NAMESPACED_IDS: LeagueViewIds = {
  ...LEAGUE_STANDALONE_IDS,
  dateSlider: 'league_date_slider',
  dateSliderDown: 'league_date_slider_down',
  dateSliderUp: 'league_date_slider_up',
  postDateSlider: 'league_post_date_slider',
  scaleSlider: 'league_scale_slider',
  futureOpacity: 'league_future_opacity',
  status: 'league_status_msg',
  seasonNotes: 'league_season_notes',
};

interface LeagueViewRefs {
  competition: HTMLSelectElement;
  season: HTMLSelectElement;
  teamSort: HTMLSelectElement;
  matchSort: HTMLSelectElement;
  displayTimezone: HTMLSelectElement;
  displayTimezoneLabel: HTMLElement;
  dateSlider: HTMLInputElement;
  dateSliderDown: HTMLElement;
  dateSliderUp: HTMLElement;
  dateSliderReset: HTMLElement;
  postDateSlider: HTMLElement;
  targetDate: HTMLInputElement;
  scaleSlider: HTMLInputElement;
  futureOpacity: HTMLInputElement;
  spaceColor: HTMLInputElement;
  columnToggleList: HTMLElement;
  status: HTMLElement;
  warning: HTMLElement;
  timestamp: HTMLElement;
  boxContainer: HTMLElement;
  sortableTable: HTMLElement;
  seasonNotes: HTMLElement;
  dataSourceSection: HTMLElement;
}

let refs: LeagueViewRefs;
let viewContext: LeagueViewContext;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`League view element not found: #${id}`);
  return element as T;
}

function resolveRefs(ids: LeagueViewIds): LeagueViewRefs {
  const ranktableSection = requireElement<HTMLElement>(ids.ranktableSection);
  const sortableTable = ranktableSection.querySelector<HTMLElement>('.sortable-table');
  if (!sortableTable) throw new Error(`League view sortable table not found in #${ids.ranktableSection}`);
  return {
    competition: requireElement(ids.competition),
    season: requireElement(ids.season),
    teamSort: requireElement(ids.teamSort),
    matchSort: requireElement(ids.matchSort),
    displayTimezone: requireElement(ids.displayTimezone),
    displayTimezoneLabel: requireElement(ids.displayTimezoneLabel),
    dateSlider: requireElement(ids.dateSlider),
    dateSliderDown: requireElement(ids.dateSliderDown),
    dateSliderUp: requireElement(ids.dateSliderUp),
    dateSliderReset: requireElement(ids.dateSliderReset),
    postDateSlider: requireElement(ids.postDateSlider),
    targetDate: requireElement(ids.targetDate),
    scaleSlider: requireElement(ids.scaleSlider),
    futureOpacity: requireElement(ids.futureOpacity),
    spaceColor: requireElement(ids.spaceColor),
    columnToggleList: requireElement(ids.columnToggleList),
    status: requireElement(ids.status),
    warning: requireElement(ids.warning),
    timestamp: requireElement(ids.timestamp),
    boxContainer: requireElement(ids.boxContainer),
    sortableTable,
    seasonNotes: requireElement(ids.seasonNotes),
    dataSourceSection: requireElement(ids.dataSourceSection),
  };
}

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

// Curated display-TZ list: browser default (empty value) + JST/UTC + WC2026 host zones.
// Labels are language-neutral (IANA name + offset hint); only the default is translated.
function getDisplayTzOptions(): { value: string; label: string }[] {
  return [
    { value: '',                     label: t('tz.browserDefault') },
    { value: 'Asia/Tokyo',           label: 'Asia/Tokyo (JST)' },
    { value: 'UTC',                  label: 'UTC' },
    { value: 'America/New_York',     label: 'America/New_York (ET)' },
    { value: 'America/Chicago',      label: 'America/Chicago (CT)' },
    { value: 'America/Denver',       label: 'America/Denver (MT)' },
    { value: 'America/Los_Angeles',  label: 'America/Los_Angeles (PT)' },
    { value: 'America/Mexico_City',  label: 'America/Mexico_City' },
    { value: 'America/Monterrey',    label: 'America/Monterrey' },
    { value: 'America/Vancouver',    label: 'America/Vancouver' },
    { value: 'America/Toronto',      label: 'America/Toronto' },
  ];
}

// ---- DOM helpers -------------------------------------------------------

function setStatus(msg: string): void {
  refs.status.textContent = msg;
}

function showWarning(msg: string | null): void {
  if (msg) {
    refs.warning.textContent = msg;
    refs.warning.hidden = false;
  } else {
    refs.warning.textContent = '';
    refs.warning.hidden = true;
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
  if (!state.timestampMap) return;
  refs.timestamp.textContent = state.timestampMap[csvFilename] ?? '';
}

// ---- Fixed dropdown population -----------------------------------------

type MatchSortUiValue = typeof MATCH_SORT_VALUES[number];

function populateFixedSelect(
  sel: HTMLSelectElement,
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
): void {
  sel.innerHTML = '';
  for (const { value, label } of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

// ---- Column visibility toggle population -------------------------------

// Builds one checkbox per toggleable rank-table column inside #column_toggle_list.
// onToggle is invoked with (columnId, checked) whenever a checkbox changes.
function populateColumnToggleList(
  hiddenColumns: ReadonlySet<string>,
  onToggle: (columnId: string, checked: boolean) => void,
): void {
  const container = refs.columnToggleList;
  container.innerHTML = '';
  for (const col of getToggleableColumns()) {
    if (!col.id) continue;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenColumns.has(col.id);
    checkbox.addEventListener('change', () => onToggle(col.id!, checkbox.checked));
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(col.label));
    container.appendChild(label);
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

// ---- Date slider management --------------------------------------------

function resetDateSlider(matchDates: string[], targetDate: string): void {
  state.currentMatchDates = matchDates;
  if (matchDates.length === 0) return;
  syncSliderToTargetDate(refs.dateSlider, matchDates, targetDate);

  const lastDate = getLastMatchDate(matchDates);
  if (lastDate) refs.postDateSlider.textContent = lastDate;
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
  const seasonInfo = resolveLeagueSeasonInfo(found.family, found.competition, entry, found.familyKey);
  const { hasPk, hasEx } = cache;

  // Show the display-timezone selector only when this season actually has source TZ data.
  refs.displayTimezoneLabel.hidden = !cache.hasTimezone;

  // Determine which groups to render and in what order.
  const allGroups = Object.keys(cache.teamMap);
  const groupKeys = seasonInfo.shownGroups
    ? seasonInfo.shownGroups.filter(g => allGroups.includes(g))
    : allGroups.sort();
  const isMultiGroup = groupKeys.length > 1;

  const globalMatchDateSet = new Set<string>();
  const allTeamCssClasses: string[] = [];
  const boxCon = refs.boxContainer;
  {
    boxCon.replaceChildren();
    // Multi-group graphs are laid out as stacked block rows (column); single-group
    // keeps the original single horizontal row.
    boxCon.classList.toggle('blockrows', isMultiGroup);
  }

  // Block-row wrapping state (multi-group only): accumulate team counts and wrap to
  // a new .group_block_row once the next group would exceed maxRowTeams.
  let currentBlockRow: HTMLElement | null = null;
  let currentRowTeams = 0;

  // Prepare ranking table container.
  const sortableDiv = refs.sortableTable;
  sortableDiv.innerHTML = '';

  // Collect per-group results for cross-group comparison (populated during loop).
  const allGroupResults: Record<string, GroupRenderResult> = {};

  for (const groupKey of groupKeys) {
    const singleGroupData = cache.teamMap[groupKey];
    if (!singleGroupData) continue;

    // For multi-group: use per-group team count from config.
    // promotionCount is kept as-is (group-stage competitions advance a fixed number per group).
    // relegationCount is zeroed because relegation is never decided per-group.
    const groupTeamCount = seasonInfo.groupTeamCount?.[groupKey] ?? seasonInfo.teamCount;
    const perGroupInfo: LeagueSeasonInfo = isMultiGroup
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
        controlState.viewer.displayTimezone || undefined,
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

        // Start a new block row when the current one would overflow maxRowTeams.
        // Use the actual rendered column count (sortedTeams.length), not the config
        // team count. Wrapping happens only at group boundaries (a group is never split).
        const rowTeams = sortedTeams.length;
        if (currentBlockRow === null
            || (currentRowTeams > 0 && currentRowTeams + rowTeams > seasonInfo.maxRowTeams)) {
          currentBlockRow = document.createElement('div');
          currentBlockRow.classList.add('group_block_row');
          boxCon.appendChild(currentBlockRow);
          currentRowTeams = 0;
        }
        currentBlockRow.appendChild(wrapper);
        currentRowTeams += rowTeams;
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
      makeRankTable(table, rankData, hasPk, hasEx, perGroupInfo.promotionLabel, controlState.viewer.hiddenColumns);
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
      sortableDiv.appendChild(makeCrossGroupTable(rows, cgs, controlState.viewer.hiddenColumns));
    }
  }

  setScale(boxCon, refs.scaleSlider.value);
  const globalMatchDates = [...globalMatchDateSet].sort();
  resetDateSlider(globalMatchDates, targetDate);

  // Update season notes from season_map config.
  refs.seasonNotes.replaceChildren();
  for (const text of seasonInfo.notes) {
    const li = document.createElement('li');
    li.textContent = text;
    refs.seasonNotes.appendChild(li);
  }

  // Update data source link from season_map config.
  if (seasonInfo.dataSource) {
    const a = document.createElement('a');
    a.href = seasonInfo.dataSource.url;
    a.textContent = seasonInfo.dataSource.label;
    refs.dataSourceSection.replaceChildren(t('status.dataSource'), a);
  } else {
    refs.dataSourceSection.replaceChildren();
  }

  // I3: Warn about teams with undefined CSS colors.
  const undefinedTeams = findTeamsWithoutColor(allTeamCssClasses);
  if (undefinedTeams.length > 0) {
    showWarning(t('warn.undefinedColor', { teams: undefinedTeams.join(', ') }));
  } else {
    showWarning(null);
  }
}

function loadAndRender(): void {
  if (!activeSeasonMap || !activeSelection) return;
  const renderVersion = ++state.renderVersion;
  const seasonMap = activeSeasonMap;
  const { competition, season } = activeSelection;
  const csvKey      = `${competition}/${season}`;

  const targetDate = normalizeTargetDate(viewContext.shared.targetDate) ?? dateFormat(new Date(), '/');

  const sortKey      = controlState.league.teamSortKey;
  const matchSortKey = getMatchSortKey(controlState.league.matchSortKey);
  const bottomFirst  = isBottomFirst(controlState.league.matchSortKey);
  const disp         = sortKey.startsWith('disp_');

  const found = findCompetition(seasonMap, competition);
  if (!found || !found.competition.seasons[season]) {
    setStatus(t('status.noSeason', { competition, season }));
    return;
  }

  const leagueDisplay = resolveLeagueSeasonInfo(
    found.family,
    found.competition,
    found.competition.seasons[season],
    found.familyKey,
  ).leagueDisplay;

  savePrefs({
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
      if (renderVersion !== state.renderVersion) return;
      const entry = found.competition.seasons[season];
      const seasonInfo = resolveLeagueSeasonInfo(found.family, found.competition, entry, found.familyKey);
      const teamMap = parseCsvResults(
        results.data,
        results.meta.fields ?? [],
        seasonInfo.teams,
        DEFAULT_GROUP,
        seasonInfo.pointSystem,
        seasonInfo.timezone,
      );
      const fields = results.meta.fields ?? [];
      const hasPk = fields.includes('home_pk_score');
      const hasEx = fields.includes('home_score_ex');
      // Source TZ is available when the CSV carries a per-row column or the season sets one.
      const hasTimezone = fields.includes('timezone') || Boolean(seasonInfo.timezone);

      const newCache = { key: csvKey, teamMap, teamCount: seasonInfo.teamCount, hasPk, hasEx, hasTimezone };
      state.teamMapCache = newCache;

      renderFromCache(newCache, seasonMap, competition, season, targetDate, sortKey, matchSortKey, bottomFirst, disp);
      showTimestamp(filename);
      setStatus(t('status.loaded', { league: leagueDisplay, season, rows: results.data.length }));
    },
    error: (err: unknown) => {
      if (renderVersion !== state.renderVersion) return;
      setStatus(t('status.error', { detail: String(err) }));
    },
  });
}

// ---- Initialization & event wiring ------------------------------------

export function initLeagueView(ids: LeagueViewIds, ctx: LeagueViewContext): LeagueViewHandle {
  refs = resolveRefs(ids);
  viewContext = ctx;
  const prefs = loadPrefs();
  controlState = createControlStateFromPrefs(prefs, ctx.shared);
  state.heightUnit = getHeightUnit();
  void loadTimestampMap().then(() => {
    if (activeSelection) showTimestamp(getCsvFilename(
      activeSelection.competition,
      activeSelection.season,
    ));
  });

  populateFixedSelect(refs.teamSort, getTeamSortOptions());
  populateFixedSelect(refs.matchSort, getMatchSortOptions());
  populateFixedSelect(refs.displayTimezone, getDisplayTzOptions());
  refs.teamSort.value = controlState.league.teamSortKey;
  refs.matchSort.value = controlState.league.matchSortKey;
  refs.displayTimezone.value = controlState.viewer.displayTimezone;
  refs.spaceColor.value = controlState.league.spaceColor;

  populateColumnToggleList(controlState.viewer.hiddenColumns, (columnId, checked) => {
    if (checked) controlState.viewer.hiddenColumns.delete(columnId);
    else controlState.viewer.hiddenColumns.add(columnId);
    savePrefs({ hiddenColumns: [...controlState.viewer.hiddenColumns] });
    loadAndRender();
  });

  refs.targetDate.addEventListener('change', () => {
    ctx.shared.targetDate = normalizeTargetDate(refs.targetDate.value);
    ctx.onViewerChange();
    loadAndRender();
  });
  refs.teamSort.addEventListener('change', () => {
    controlState.league.teamSortKey = refs.teamSort.value;
    loadAndRender();
  });
  refs.matchSort.addEventListener('change', () => {
    controlState.league.matchSortKey = refs.matchSort.value;
    loadAndRender();
  });

  const updateFromSlider = (): void => {
    const date = getSliderDate(state.currentMatchDates, parseInt(refs.dateSlider.value, 10));
    if (!date) return;
    refs.targetDate.value = toInputDate(date);
    ctx.shared.targetDate = normalizeTargetDate(date);
    ctx.onViewerChange();
    loadAndRender();
  };
  refs.dateSlider.addEventListener('change', updateFromSlider);
  refs.dateSlider.addEventListener('input', () => {
    const date = getSliderDate(state.currentMatchDates, parseInt(refs.dateSlider.value, 10));
    if (date) refs.targetDate.value = toInputDate(date);
  });
  refs.dateSliderDown.addEventListener('click', () => {
    refs.dateSlider.value = String(Math.max(0, parseInt(refs.dateSlider.value, 10) - 1));
    updateFromSlider();
  });
  refs.dateSliderUp.addEventListener('click', () => {
    refs.dateSlider.value = String(
      Math.min(parseInt(refs.dateSlider.max, 10), parseInt(refs.dateSlider.value, 10) + 1),
    );
    updateFromSlider();
  });
  refs.dateSliderReset.addEventListener('click', () => {
    const today = dateFormat(new Date(), '/');
    refs.targetDate.value = toInputDate(today);
    ctx.shared.targetDate = today;
    ctx.onViewerChange();
    loadAndRender();
  });

  refs.scaleSlider.addEventListener('input', () => {
    ctx.shared.scale = parseFloat(refs.scaleSlider.value);
    setScale(refs.boxContainer, refs.scaleSlider.value);
    ctx.onViewerChange();
  });
  refs.futureOpacity.addEventListener('input', () => {
    ctx.shared.futureOpacity = parseFloat(refs.futureOpacity.value);
    setFutureOpacity(refs.futureOpacity.value);
    ctx.onViewerChange();
  });
  refs.spaceColor.addEventListener('input', () => {
    controlState.league.spaceColor = refs.spaceColor.value;
    setSpace(refs.spaceColor.value);
    savePrefs({ spaceColor: refs.spaceColor.value });
  });
  refs.displayTimezone.addEventListener('change', () => {
    controlState.viewer.displayTimezone = refs.displayTimezone.value;
    savePrefs({ displayTimezone: refs.displayTimezone.value });
    loadAndRender();
  });

  return {
    activate(seasonMap, selection) {
      const selectionChanged = activeSelection?.competition !== selection.competition
        || activeSelection?.season !== selection.season;
      activeSeasonMap = seasonMap;
      activeSelection = selection;
      if (selectionChanged) state.teamMapCache = null;

      const previousScale = ctx.shared.scale;
      const clampedScale = clampToSlider(previousScale, refs.scaleSlider);
      refs.scaleSlider.value = String(clampedScale);
      ctx.shared.scale = parseFloat(refs.scaleSlider.value);
      if (ctx.shared.scale !== previousScale) ctx.onViewerChange();
      controlState.viewer.scale = ctx.shared.scale;
      refs.futureOpacity.value = String(ctx.shared.futureOpacity);
      controlState.viewer.futureOpacity = ctx.shared.futureOpacity;
      controlState.viewer.targetDate = ctx.shared.targetDate;
      refs.targetDate.value = toInputDate(ctx.shared.targetDate) || dateFormat(new Date(), '-');
      setFutureOpacity(refs.futureOpacity.value, false);
      if (prefs.spaceColor) setSpace(controlState.league.spaceColor, false);
      loadAndRender();
    },
    deactivate() {
      // League view currently has no transient UI state to clean up.
    },
  };
}
