// Tournament bracket view module.
//
// Loads season_map.yaml, filters to bracket-enabled competitions,
// and renders a CSS bracket for the selected season.
// Provides date slider, opacity, zoom, and layout controls.

import Papa from 'papaparse';
import type { RawMatchRow } from './types/match';
import type {
  SeasonMap,
  BracketBlock,
  AggregateTiebreakCriterion,
  RawSeasonEntry,
  TournamentSeasonInfo,
} from './types/season';
import {
  getCsvFilename, findCompetition, resolveTournamentSeasonInfo,
} from './config/season-map';
import {
  PRESEASON_SENTINEL,
  formatSliderDate,
  getLastMatchDate,
  getSliderDate,
  resolveTargetDate,
  syncSliderToTargetDate,
} from './core/date-slider';
import { buildBracket, maskBracketForDate } from './bracket/bracket-data';
import { inferBracketOrderFromRows } from './bracket/bracket-order-inference';
import { normalizeBracketRoundLabel } from './bracket/round-label';
import { inferRoundFilter } from './bracket/round-filter-inference';
import { renderBracketInto, unpinTooltip } from './bracket/bracket-renderer';
import { loadPrefs, savePrefs } from './storage/local-storage';
import type { ViewerPrefs } from './storage/local-storage';
import { t } from './i18n';
import { clampToSlider, createSharedViewerControlState } from './view-bootstrap';
import type { SharedViewerControlState } from './view-bootstrap';
import type { BracketNode } from './bracket/bracket-types';

// ---- State ------------------------------------------------------------------

interface BracketState {
  csvRows: RawMatchRow[];
  bracketOrder: (string | null)[];
  seasonInfo: TournamentSeasonInfo;
  fullRoot: BracketNode;        // full tree built from bracketOrder
  roundsByDepth: string[];      // round labels root-to-leaf (e.g. ['決勝戦','準決勝','準々決勝','ラウンド16'])
  allRounds: string[];          // all CSV rounds in chronological order
  bracketBlocks?: BracketBlock[];  // multi-section definitions from season_map
  matchDates: string[];         // sorted unique dates from CSV
  season: string;
}

type ViewerControlState = SharedViewerControlState;

interface BracketControlState {
  layout: 'horizontal' | 'vertical';
  roundStart: string | null;
}

interface ControlState {
  viewer: ViewerControlState;
  bracket: BracketControlState;
}

interface SingleBracketRenderInput {
  rows: RawMatchRow[];
  order: (string | null)[];
  aggregateTiebreakOrder: AggregateTiebreakCriterion[];
  targetDate: string | null;
  lastDate: string;
  cssFiles: string[];
}

const MULTI_SECTION_VALUE = '__multi_section__';

/** Placeholder root for multi-section-only competitions that have no inclusive tree. */
const EMPTY_BRACKET_ROOT: BracketNode = {
  round: '', homeTeam: null, awayTeam: null, status: '', winner: null,
  decidedBy: null, children: [null, null],
};

let currentState: BracketState | null = null;

/** Cache buildBracket results to avoid redundant rebuilds on slider/layout changes. */
let bracketCache = new Map<string, BracketNode>();

let controlState: ControlState = {
  viewer: {
    scale: 1,
    futureOpacity: 0.2,
    targetDate: null,
  },
  bracket: {
    layout: 'horizontal',
    roundStart: null,
  },
};

function createControlStateFromPrefs(
  prefs: ViewerPrefs,
  shared = createSharedViewerControlState(prefs, { futureOpacity: 0.2 }),
): ControlState {
  return {
    viewer: shared,
    bracket: {
      layout: 'horizontal',
      roundStart: prefs.roundStart ?? null,
    },
  };
}

export interface BracketViewSelection {
  competition: string;
  season: string;
}

export interface BracketViewContext {
  shared: SharedViewerControlState;
  onViewerChange(): void;
}

export interface BracketViewHandle {
  activate(seasonMap: SeasonMap, selection: BracketViewSelection): void;
  deactivate(): void;
}

export interface BracketViewIds {
  competition: string;
  season: string;
  roundStart: string;
  dateSlider: string;
  dateSliderDown: string;
  dateSliderUp: string;
  dateSliderReset: string;
  postDateSlider: string;
  futureOpacity: string;
  currentOpacity: string;
  scaleSlider: string;
  currentScale: string;
  layout: string;
  status: string;
  container: string;
  seasonNotes: string;
}

export const BRACKET_STANDALONE_IDS: BracketViewIds = {
  competition: 'competition_key',
  season: 'season_key',
  roundStart: 'round_start_key',
  dateSlider: 'date_slider',
  dateSliderDown: 'date_slider_down',
  dateSliderUp: 'date_slider_up',
  dateSliderReset: 'date_slider_reset',
  postDateSlider: 'post_date_slider',
  futureOpacity: 'future_opacity',
  currentOpacity: 'current_opacity',
  scaleSlider: 'scale_slider',
  currentScale: 'current_scale',
  layout: 'layout_toggle',
  status: 'status_msg',
  container: 'bracket_container',
  seasonNotes: 'season_notes',
};

export const BRACKET_NAMESPACED_IDS: BracketViewIds = {
  ...BRACKET_STANDALONE_IDS,
  dateSlider: 'bracket_date_slider',
  dateSliderDown: 'bracket_date_slider_down',
  dateSliderUp: 'bracket_date_slider_up',
  postDateSlider: 'bracket_post_date_slider',
  futureOpacity: 'bracket_future_opacity',
  currentOpacity: 'bracket_current_opacity',
  scaleSlider: 'bracket_scale_slider',
  currentScale: 'bracket_current_scale',
  status: 'bracket_status_msg',
  seasonNotes: 'bracket_season_notes',
};

interface BracketViewRefs {
  competition: HTMLSelectElement;
  season: HTMLSelectElement;
  roundStart: HTMLSelectElement;
  dateSlider: HTMLInputElement;
  dateSliderDown: HTMLElement;
  dateSliderUp: HTMLElement;
  dateSliderReset: HTMLElement;
  postDateSlider: HTMLElement;
  futureOpacity: HTMLInputElement;
  currentOpacity: HTMLElement;
  scaleSlider: HTMLInputElement;
  currentScale: HTMLElement;
  layout: HTMLSelectElement;
  status: HTMLElement;
  container: HTMLElement;
  seasonNotes: HTMLElement;
}

let refs: BracketViewRefs;
let viewContext: BracketViewContext;
let activeSelection: BracketViewSelection | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Bracket view element not found: #${id}`);
  return element as T;
}

function resolveRefs(ids: BracketViewIds): BracketViewRefs {
  return {
    competition: requireElement(ids.competition),
    season: requireElement(ids.season),
    roundStart: requireElement(ids.roundStart),
    dateSlider: requireElement(ids.dateSlider),
    dateSliderDown: requireElement(ids.dateSliderDown),
    dateSliderUp: requireElement(ids.dateSliderUp),
    dateSliderReset: requireElement(ids.dateSliderReset),
    postDateSlider: requireElement(ids.postDateSlider),
    futureOpacity: requireElement(ids.futureOpacity),
    currentOpacity: requireElement(ids.currentOpacity),
    scaleSlider: requireElement(ids.scaleSlider),
    currentScale: requireElement(ids.currentScale),
    layout: requireElement(ids.layout),
    status: requireElement(ids.status),
    container: requireElement(ids.container),
    seasonNotes: requireElement(ids.seasonNotes),
  };
}

function setStatus(msg: string): void {
  refs.status.textContent = msg;
}

// ---- Match date collection --------------------------------------------------

function collectMatchDates(rows: RawMatchRow[]): string[] {
  const dates = new Set<string>();
  for (const r of rows) {
    if (r.match_date) dates.add(r.match_date);
  }
  const sorted = Array.from(dates).sort();
  // Prepend sentinel so slider index 0 = "before any match"
  sorted.unshift(PRESEASON_SENTINEL);
  return sorted;
}

/**
 * Resolve the season-wide inclusive tree order from bracket_blocks: the
 * bracket_order of the "main" block (the tree that crowns the champion).
 * Matchup-pairs blocks form no tree and are never main. A sole non-matchup
 * block is implicitly main; among several, `inclusive_tree: true` marks it.
 * Returns undefined when no main block resolves (multi-section-only seasons).
 */
function resolveMainBlockOrder(
  blocks: BracketBlock[] | undefined,
): (string | null)[] | undefined {
  if (!blocks || blocks.length === 0) return undefined;
  const candidates = blocks.filter((block) => !block.matchup_pairs);
  const main = candidates.length === 1
    ? candidates[0]
    : candidates.find((block) => block.inclusive_tree);
  const order = main?.bracket_order;
  return order != null && order.length > 0 ? order : undefined;
}

function resolveSeasonBracketOrder(
  entry: RawSeasonEntry,
  inferredOrder?: (string | null)[],
): (string | null)[] | undefined {
  return resolveMainBlockOrder(entry.bracket_blocks) ?? inferredOrder;
}

function hasBracketMetadata(entry: RawSeasonEntry): boolean {
  return entry.bracket_blocks != null
    || entry.bracket_round_start != null;
}

// ---- Dropdown population ---------------------------------------------------

export function populateBracketSeasonPulldown(
  seasonMap: SeasonMap,
  competition: string,
  select: HTMLSelectElement = refs.season,
): void {
  select.replaceChildren();
  const found = findCompetition(seasonMap, competition);
  if (!found) return;
  const seasons = Object.keys(found.competition.seasons)
    .filter(s => {
      const e = found.competition.seasons[s];
      return hasBracketMetadata(e);
    })
    .sort().reverse();
  for (const s of seasons) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  }
}

// ---- Round start helpers ---------------------------------------------------

/** Collect round labels at each tree depth via BFS (root → leaf). */
function collectRoundsByDepth(node: BracketNode): string[] {
  const rounds: string[] = [];
  let level: BracketNode[] = [node];
  while (level.length > 0) {
    const roundName = level.find(n => n.round)?.round ?? '';
    if (roundName) rounds.push(roundName);
    const next: BracketNode[] = [];
    for (const n of level) {
      for (const child of n.children) {
        if (child) next.push(child);
      }
    }
    level = next;
  }
  return rounds;
}

/** Collect unique normalized KO rounds from the built bracket tree in play order. */
function collectBracketRounds(node: BracketNode): string[] {
  return collectRoundsByDepth(node)
    .map(r => normalizeBracketRoundLabel(r))
    .reverse();
}

/** Filter rows by round using raw or normalized bracket labels. */
function filterRowsByRounds(rows: RawMatchRow[], roundFilter: string[]): RawMatchRow[] {
  const rawSet = new Set(roundFilter);
  const normalizedSet = new Set(roundFilter.map(r => normalizeBracketRoundLabel(r)));
  return rows.filter((r) => {
    const round = r.round ?? '';
    return rawSet.has(round) || normalizedSet.has(normalizeBracketRoundLabel(round));
  });
}

/** Apply default_round_filter to sections that lack their own round_filter. */
function resolveSectionRoundFilters(
  sections: BracketBlock[], defaultRoundFilter?: string[],
): BracketBlock[] {
  if (!defaultRoundFilter || defaultRoundFilter.length === 0) return sections;
  return sections.map(s =>
    s.round_filter ? s : { ...s, round_filter: defaultRoundFilter },
  );
}

/** Infer round_filter for sections still without one after default resolution. */
function inferMissingSectionRoundFilters(
  sections: BracketBlock[], rows: RawMatchRow[],
): BracketBlock[] {
  return sections.map(s => {
    if (s.round_filter) return s;
    const inferred = inferRoundFilter(rows, s.bracket_order ?? [], s.matchup_pairs);
    return inferred ? { ...s, round_filter: inferred } : s;
  });
}

function collectBracketSourceRows(rows: RawMatchRow[], sections?: BracketBlock[]): RawMatchRow[] {
  if (!sections || sections.length === 0) return rows;
  const merged: RawMatchRow[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const sectionRows = section.round_filter
      ? filterRowsByRounds(rows, section.round_filter)
      : rows;
    for (const row of sectionRows) {
      const key = [
        row.match_number ?? '',
        row.match_date ?? '',
        row.home_team ?? '',
        row.away_team ?? '',
        row.round ?? '',
        row.leg ?? '',
        row.stadium ?? '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

/** Collect unique rounds from CSV in chronological order. */
function collectRoundsFromCsv(rows: RawMatchRow[]): string[] {
  const seen = new Set<string>();
  const rounds: string[] = [];
  const sorted = [...rows].sort(
    (a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''),
  );
  for (const row of sorted) {
    const normalized = row.round ? normalizeBracketRoundLabel(row.round) : '';
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      rounds.push(normalized);
    }
  }
  return rounds;
}

export const __testables = {
  createControlStateFromPrefs,
  resolveMainBlockOrder,
  resolveSeasonBracketOrder,
  filterRowsByRounds,
  resolveSectionRoundFilters,
  inferMissingSectionRoundFilters,
  collectBracketSourceRows,
  collectRoundsFromCsv,
  resolveInclusiveBracketOrder,
  shouldRenderMultiSectionView,
};

/** Collect winners at a given tree depth (in bracket positional order). */
function collectWinnersAtDepth(
  node: BracketNode, depth: number,
): (string | null)[] {
  if (depth === 0) return [node.winner];
  const results: (string | null)[] = [];
  for (const child of node.children) {
    if (child) results.push(...collectWinnersAtDepth(child, depth - 1));
  }
  return results;
}

/**
 * Extend bracket order backward by one round.
 * For each team, find their match in the given round and expand to [home, away].
 * Teams that entered at a later round (no match found) become [team, null] (bye).
 */
function extendBracketBackward(
  order: (string | null)[],
  rows: RawMatchRow[],
  round: string,
): (string | null)[] {
  const extended: (string | null)[] = [];
  for (const team of order) {
    if (!team) {
      extended.push(null, null);
      continue;
    }
    const match = rows.find(r =>
      normalizeBracketRoundLabel(r.round ?? '') === round
        && (r.home_team === team || r.away_team === team),
    );
    if (match) {
      extended.push(match.home_team, match.away_team);
    } else {
      // Team entered at a later round (bye)
      extended.push(team, null);
    }
  }
  return extended;
}

function populateRoundStartPulldown(
  allRounds: string[], defaultRound?: string,
  hasSections?: boolean,
  explicitOptions?: string[],
): void {
  const sel = refs.roundStart;
  sel.replaceChildren();
  sel.disabled = false;

  const options = explicitOptions ?? [
    ...(hasSections ? [MULTI_SECTION_VALUE] : []),
    ...allRounds,
  ];

  for (const round of options) {
    const opt = document.createElement('option');
    opt.value = round;
    opt.textContent = round === MULTI_SECTION_VALUE ? t('label.multiSection') : round;
    sel.appendChild(opt);
  }

  if (explicitOptions && explicitOptions.length === 1) {
    sel.value = explicitOptions[0];
    sel.disabled = true;
  } else if (defaultRound && options.includes(defaultRound)) {
    sel.value = defaultRound;
  } else if (options.includes(MULTI_SECTION_VALUE)) {
    sel.value = MULTI_SECTION_VALUE;
  } else if (options.length > 0) {
    sel.value = options[0];
  }
}

/** Resolve bracket order for the single-tree ("inclusive") bracket view. */
function resolveInclusiveBracketOrder(
  state: Pick<BracketState, 'fullRoot' | 'bracketOrder' | 'roundsByDepth' | 'allRounds' | 'csvRows'>,
  selectedRoundStart: string | null,
): (string | null)[] {
  const { fullRoot, bracketOrder, roundsByDepth, allRounds, csvRows } = state;
  const selected = selectedRoundStart ?? '';
  const leafRound = roundsByDepth[roundsByDepth.length - 1];
  const leafIdx = allRounds.indexOf(leafRound);
  const selectedIdx = allRounds.indexOf(selected);
  if (selectedIdx < 0) return bracketOrder;

  if (selectedIdx === leafIdx) {
    // Same as configured leaf → original bracket order
    return bracketOrder;
  } else if (selectedIdx > leafIdx) {
    // Later round → collapse using bracket tree
    const treeDepthIdx = roundsByDepth.indexOf(selected);
    if (treeDepthIdx < 0) return bracketOrder;
    return collectWinnersAtDepth(fullRoot, treeDepthIdx + 1);
  } else {
    // Earlier round → extend backward from leaf
    let order: (string | null)[] = [...bracketOrder];
    for (let i = leafIdx - 1; i >= selectedIdx; i--) {
      order = extendBracketBackward(order, csvRows, allRounds[i]);
    }
    return order;
  }
}

// ---- Bracket rendering with date filter ------------------------------------

function getTargetDate(): string | null {
  return controlState.viewer.targetDate;
}

/** Check whether the selection should render bracket sections independently. */
function shouldRenderMultiSectionView(
  bracketBlocks: BracketBlock[] | undefined,
  roundStart: string | null,
): boolean {
  return roundStart === MULTI_SECTION_VALUE && bracketBlocks != null;
}

/**
 * Build and render a bracket tree (with date mask) into a container.
 * Uses cache to avoid redundant buildBracket calls on slider/layout changes.
 */
function buildAndRenderBracket(
  container: HTMLElement,
  input: SingleBracketRenderInput,
): void {
  const { rows, order, aggregateTiebreakOrder, targetDate, lastDate, cssFiles } = input;
  if (order.length < 2) return;
  const cacheKey = JSON.stringify(order);
  let fullRoot = bracketCache.get(cacheKey);
  if (!fullRoot) {
    fullRoot = buildBracket(rows, order, aggregateTiebreakOrder);
    bracketCache.set(cacheKey, fullRoot);
  }
  const root = (targetDate && targetDate < lastDate)
    ? maskBracketForDate(fullRoot, targetDate) : fullRoot;
  renderBracketInto(container, root, cssFiles, controlState.bracket.layout);
}

function createSingleBracketRenderInput(
  state: Pick<BracketState, 'csvRows' | 'seasonInfo' | 'matchDates'>,
  order: (string | null)[],
): SingleBracketRenderInput | null {
  if (order.length < 2 || state.matchDates.length === 0) return null;
  return {
    rows: state.csvRows,
    order,
    aggregateTiebreakOrder: state.seasonInfo.aggregateTiebreakOrder,
    targetDate: getTargetDate(),
    lastDate: state.matchDates[state.matchDates.length - 1],
    cssFiles: state.seasonInfo.cssFiles,
  };
}

function createInclusiveBracketRenderInput(
  state: Pick<
  BracketState,
  'csvRows' | 'seasonInfo' | 'matchDates' |
  'fullRoot' | 'bracketOrder' | 'roundsByDepth' | 'allRounds'
  >,
): SingleBracketRenderInput | null {
  const order = resolveInclusiveBracketOrder(state, controlState.bracket.roundStart);
  return createSingleBracketRenderInput(state, order);
}

/**
 * Render multi-section view: each BracketBlock becomes an independent
 * collapsible bracket, all sharing the same CSV and date filter.
 */
function renderMultiSections(): void {
  if (!currentState?.bracketBlocks) return;
  const container = refs.container;

  // Save open/closed state of existing sections before re-render
  const prevOpen = new Map<string, boolean>();
  for (const d of Array.from(container.querySelectorAll<HTMLDetailsElement>('.bracket-section'))) {
    const label = d.querySelector('.bracket-section-summary')?.textContent ?? '';
    if (label) prevOpen.set(label, d.open);
  }

  container.replaceChildren();

  // Toggle-all button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle_section_all';
  toggleBtn.textContent = t('btn.collapseAll');
  toggleBtn.addEventListener('click', () => {
    const allDetails = container.querySelectorAll<HTMLDetailsElement>('.bracket-section');
    const anyOpen = Array.from(allDetails).some(d => d.open);
    for (const d of Array.from(allDetails)) d.open = !anyOpen;
    toggleBtn.textContent = anyOpen ? t('btn.expandAll') : t('btn.collapseAll');
    applyScale();
  });
  container.appendChild(toggleBtn);

  for (const section of currentState.bracketBlocks) {
    const sectionOrder = section.bracket_order ?? [];
    if (sectionOrder.length < 2) continue;

    // Pre-filter CSV rows by round_filter if specified
    const rows = section.round_filter
      ? filterRowsByRounds(currentState.csvRows, section.round_filter)
      : currentState.csvRows;

    // Create collapsible section
    const details = document.createElement('details');
    details.classList.add('bracket-section');
    // Restore previous open state; default to open for new sections
    details.open = prevOpen.get(section.label) ?? true;
    details.addEventListener('toggle', () => {
      applyScale();
    });
    const summary = document.createElement('summary');
    summary.classList.add('bracket-section-summary');
    summary.textContent = section.label;
    details.appendChild(summary);

    // Bracket wrapper (needed as container for adjustBracketPositions)
    const sectionWrapper = document.createElement('div');
    sectionWrapper.classList.add('bracket-section-content');
    details.appendChild(sectionWrapper);

    // Append to DOM before rendering (getBoundingClientRect needs layout)
    container.appendChild(details);

    if (section.matchup_pairs) {
      // Matchup pairs: split bracket_order into pairs and render each independently
      const order = sectionOrder;
      for (let i = 0; i < order.length; i += 2) {
        const pair = order.slice(i, i + 2);
        if (pair.every(t => t == null)) continue;
        const input = createSingleBracketRenderInput(
          { ...currentState, csvRows: rows },
          pair,
        );
        if (input) buildAndRenderBracket(sectionWrapper, input);
      }
    } else {
      const input = createSingleBracketRenderInput(
        { ...currentState, csvRows: rows },
        sectionOrder,
      );
      if (input) buildAndRenderBracket(sectionWrapper, input);
    }
  }
}

/** Render the single-tree ("inclusive") bracket view. */
function renderInclusiveBracket(container: HTMLElement): void {
  if (!currentState) return;
  const input = createInclusiveBracketRenderInput(currentState);
  if (!input) return;
  container.replaceChildren();
  buildAndRenderBracket(container, input);
}

function renderWithDateFilter(): void {
  if (!currentState) return;
  const container = refs.container;

  // Dismiss any pinned tooltip before re-render (DOM will be replaced)
  unpinTooltip();

  // Multi-section mode: render each section as its own bracket block.
  if (shouldRenderMultiSectionView(currentState.bracketBlocks, controlState.bracket.roundStart)) {
    renderMultiSections();
  } else {
    // Inclusive mode: resolve one effective bracket order, then render it as one tree.
    renderInclusiveBracket(container);
  }

}

/** Sync viewer control targetDate from slider position. */
function syncTargetDateFromSlider(): void {
  if (!currentState) return;
  const slider = refs.dateSlider;
  controlState.viewer.targetDate = getSliderDate(currentState.matchDates, parseInt(slider.value, 10));
}

/** Align slider position to the kept target date without overwriting the target itself. */
function syncSliderFromTargetDate(): void {
  if (!currentState) return;
  const slider = refs.dateSlider;
  syncSliderToTargetDate(slider, currentState.matchDates, controlState.viewer.targetDate);
}

/** Update display label from current slider position + kept target date. */
function updateSliderDisplay(): void {
  if (!currentState) return;
  const slider = refs.dateSlider;
  const display = refs.postDateSlider;
  const sliderDate = getSliderDate(currentState.matchDates, parseInt(slider.value, 10)) ?? '';
  const targetDate = resolveTargetDate(currentState.matchDates, controlState.viewer.targetDate) ?? sliderDate;
  display.textContent = formatSliderDate(sliderDate, targetDate);
}

// ---- Controls: opacity, scale, layout --------------------------------------

/** Apply futureOpacity from controlState to all .bracket-future elements. */
function applyFutureOpacity(): void {
  const container = refs.container;
  const value = String(controlState.viewer.futureOpacity);
  for (const el of Array.from(container.querySelectorAll('.bracket-future'))) {
    (el as HTMLElement).style.opacity = value;
  }
  refs.currentOpacity.textContent = value;
}

/** Keep layout height in sync with the visual scale of the bracket container. */
function syncBracketContainerHeight(container: HTMLElement): void {
  container.style.height = 'auto';
  // scrollHeight can retain the previous explicit height and offsetHeight
  // excludes the translated match wrappers used to align bracket branches.
  // Measure the rendered descendant bounds, which include those transforms.
  const containerTop = container.getBoundingClientRect().top;
  const visualBottom = Array.from(container.querySelectorAll<HTMLElement>('*')).reduce(
    (bottom, child) => Math.max(bottom, child.getBoundingClientRect().bottom),
    containerTop,
  );
  const visualHeight = visualBottom - containerTop;
  if (visualHeight > 0) {
    container.style.height = `${visualHeight}px`;
  }
}

/** Apply scale from controlState to bracket container. */
function applyScale(): void {
  const container = refs.container;
  const value = String(controlState.viewer.scale);
  container.style.transform = `scale(${value})`;
  container.style.transformOrigin = 'top left';
  syncBracketContainerHeight(container);
  refs.currentScale.textContent = value;
}

// ---- Render pipeline -------------------------------------------------------

const CACHE_BUST_WINDOW_SEC = 300;

function loadAndRender(seasonMap: SeasonMap): void {
  const competition = activeSelection?.competition ?? '';
  const season = activeSelection?.season ?? '';
  if (!competition || !season) return;

  const found = findCompetition(seasonMap, competition);
  if (!found || !found.competition.seasons[season]) {
    setStatus(t('status.noSeason', { competition, season }));
    return;
  }

  const entry = found.competition.seasons[season];

  const filename = getCsvFilename(competition, season);
  const cachebuster = Math.floor(Date.now() / 1000 / CACHE_BUST_WINDOW_SEC);
  setStatus(t('status.loading'));

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const inferredOrder = inferBracketOrderFromRows(results.data);
      const rawSections = entry.bracket_blocks;
      const tournamentSeasonInfo = resolveTournamentSeasonInfo(
        found.family, found.competition, entry, found.familyKey,
      );
      const seasonOrder = resolveSeasonBracketOrder(entry, inferredOrder);
      const hasInclusiveTree = seasonOrder != null && seasonOrder.length > 0;
      if (!hasInclusiveTree && !(rawSections && rawSections.length > 0)) {
        setStatus('No bracket data for this season.');
        return;
      }
      const bracketOrder = seasonOrder ?? [];
      const resolved = rawSections
        ? resolveSectionRoundFilters(rawSections, entry.default_round_filter)
        : undefined;
      const bracketBlocks = resolved
        ? inferMissingSectionRoundFilters(resolved, results.data)
        : undefined;
      const bracketRows = collectBracketSourceRows(results.data, bracketBlocks);
      const matchDates = collectMatchDates(bracketRows);

      // Build full tree to extract round structure and pre-populate cache.
      // Multi-section-only competitions (matchup pairs across disjoint ties,
      // or multiple tree blocks with no inclusive_tree main block) have no
      // inclusive tree, so skip the inclusive build — renderMultiSections
      // builds each block's tree independently.
      const multiSectionOnly = !hasInclusiveTree || (
        tournamentSeasonInfo.roundStartOptions?.length === 1 &&
        tournamentSeasonInfo.roundStartOptions[0] === MULTI_SECTION_VALUE
      );
      const fullRoot = multiSectionOnly
        ? EMPTY_BRACKET_ROOT
        : buildBracket(
          bracketRows,
          bracketOrder,
          tournamentSeasonInfo.aggregateTiebreakOrder,
        );
      bracketCache = new Map();
      // Don't cache the placeholder root: a section sharing the same order as
      // the season order (e.g. the main block itself) must build its own tree.
      if (!multiSectionOnly) {
        bracketCache.set(JSON.stringify(bracketOrder), fullRoot);
      }
      const roundsByDepth = collectRoundsByDepth(fullRoot);
      const bracketRounds = collectBracketRounds(fullRoot);
      const allRounds = bracketBlocks
        ? bracketRounds
        : collectRoundsFromCsv(bracketRows).filter(r => bracketRounds.includes(r));

      currentState = {
        csvRows: bracketRows,
        bracketOrder,
        seasonInfo: tournamentSeasonInfo,
        fullRoot,
        roundsByDepth,
        allRounds,
        bracketBlocks,
        matchDates,
        season,
      };

      // Populate round start dropdown (with multi-section option if sections exist)
      populateRoundStartPulldown(
        allRounds,
        tournamentSeasonInfo.defaultRoundStart,
        bracketBlocks != null,
        tournamentSeasonInfo.roundStartOptions,
      );

      // Sync round start: restore from controlState or pick up dropdown default
      const roundSel = refs.roundStart;
      if (controlState.bracket.roundStart) {
        const normalizedSelected = normalizeBracketRoundLabel(controlState.bracket.roundStart);
        const hasOption = Array.from(roundSel.options).some(o => o.value === normalizedSelected);
        if (hasOption) {
          roundSel.value = normalizedSelected;
          controlState.bracket.roundStart = normalizedSelected;
        } else {
          controlState.bracket.roundStart = roundSel.value;
        }
      } else {
        controlState.bracket.roundStart = roundSel.value;
      }

      // Set up date slider and sync viewer control targetDate
      const slider = refs.dateSlider;
      if (matchDates.length > 0) {
        slider.min = '0';
        if (!controlState.viewer.targetDate) {
          controlState.viewer.targetDate = getLastMatchDate(matchDates);
        }
        syncSliderFromTargetDate();
      }

      renderWithDateFilter();
      updateSliderDisplay();
      applyFutureOpacity();
      applyScale();

      // Update season notes + bracket-specific notes
      const notesEl = refs.seasonNotes;
      {
        notesEl.replaceChildren();
        const bracketNotes = [
          t('bracketNote.aggregateScore'),
          t('bracketNote.etIncluded'),
          t('bracketNote.pkAnnotation'),
        ];
        for (const text of [...tournamentSeasonInfo.notes, ...bracketNotes]) {
          const li = document.createElement('li');
          li.textContent = text;
          notesEl.appendChild(li);
        }
      }

      setStatus(t('status.loaded', {
        league: tournamentSeasonInfo.leagueDisplay, season, rows: bracketRows.length,
      }));
    },
    error: (err: unknown) => {
      setStatus(t('status.error', { detail: String(err) }));
    },
  });
}

// ---- Lifecycle -------------------------------------------------------------

export function initBracketView(
  ids: BracketViewIds,
  context: BracketViewContext,
): BracketViewHandle {
  refs = resolveRefs(ids);
  viewContext = context;
  const prefs = loadPrefs();
  controlState = createControlStateFromPrefs(prefs, context.shared);

  refs.dateSlider.addEventListener('input', () => {
    syncTargetDateFromSlider();
    updateSliderDisplay();
  });
  refs.dateSlider.addEventListener('change', () => {
    syncTargetDateFromSlider();
    updateSliderDisplay();
    renderWithDateFilter();
    applyFutureOpacity();
    viewContext.onViewerChange();
  });
  refs.dateSliderDown.addEventListener('click', () => {
    refs.dateSlider.value = String(Math.max(0, parseInt(refs.dateSlider.value, 10) - 1));
    syncTargetDateFromSlider();
    updateSliderDisplay();
    renderWithDateFilter();
    applyFutureOpacity();
    viewContext.onViewerChange();
  });
  refs.dateSliderUp.addEventListener('click', () => {
    refs.dateSlider.value = String(Math.min(
      parseInt(refs.dateSlider.max, 10), parseInt(refs.dateSlider.value, 10) + 1,
    ));
    syncTargetDateFromSlider();
    updateSliderDisplay();
    renderWithDateFilter();
    applyFutureOpacity();
    viewContext.onViewerChange();
  });
  refs.dateSliderReset.addEventListener('click', () => {
    if (!currentState) return;
    controlState.viewer.targetDate = getLastMatchDate(currentState.matchDates);
    syncSliderFromTargetDate();
    updateSliderDisplay();
    renderWithDateFilter();
    applyFutureOpacity();
    viewContext.onViewerChange();
  });
  refs.futureOpacity.addEventListener('input', () => {
    controlState.viewer.futureOpacity = parseFloat(refs.futureOpacity.value);
    applyFutureOpacity();
    viewContext.onViewerChange();
  });
  refs.scaleSlider.addEventListener('input', () => {
    controlState.viewer.scale = parseFloat(refs.scaleSlider.value);
    applyScale();
    viewContext.onViewerChange();
  });
  refs.layout.addEventListener('change', () => {
    controlState.bracket.layout = refs.layout.value as 'horizontal' | 'vertical';
    renderWithDateFilter();
    applyFutureOpacity();
    applyScale();
  });
  refs.roundStart.addEventListener('change', () => {
    controlState.bracket.roundStart = refs.roundStart.value;
    renderWithDateFilter();
    applyFutureOpacity();
    applyScale();
    savePrefs({ roundStart: controlState.bracket.roundStart });
  });

  return {
    activate(seasonMap, selection) {
      activeSelection = selection;
      refs.competition.value = selection.competition;
      refs.season.value = selection.season;
      refs.futureOpacity.value = String(controlState.viewer.futureOpacity);
      const previousScale = controlState.viewer.scale;
      controlState.viewer.scale = clampToSlider(previousScale, refs.scaleSlider);
      refs.scaleSlider.value = String(controlState.viewer.scale);
      if (controlState.viewer.scale !== previousScale) viewContext.onViewerChange();
      loadAndRender(seasonMap);
    },
    deactivate() {
      unpinTooltip();
    },
  };
}
