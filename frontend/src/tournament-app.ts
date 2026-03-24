// Tournament bracket viewer entry point.
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
} from './types/season';
import {
  loadSeasonMap, getCsvFilename, findCompetition, resolveSeasonInfo,
  getCompetitionViewTypes,
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
import { normalizeBracketRoundLabel } from './bracket/round-label';
import { inferRoundFilter } from './bracket/round-filter-inference';
import { renderBracketInto, unpinTooltip } from './bracket/bracket-renderer';
import { loadPrefs, savePrefs } from './storage/local-storage';
import type { ViewerPrefs } from './storage/local-storage';
import { t, applyI18nAttributes, setLocale } from './i18n';
import type { Locale } from './i18n';
import type { BracketNode } from './bracket/bracket-types';

// ---- State ------------------------------------------------------------------

interface BracketState {
  csvRows: RawMatchRow[];
  bracketOrder: (string | null)[];
  aggregateTiebreakOrder: AggregateTiebreakCriterion[];
  fullRoot: BracketNode;        // full tree built from bracketOrder
  roundsByDepth: string[];      // round labels root-to-leaf (e.g. ['決勝戦','準決勝','準々決勝','ラウンド16'])
  allRounds: string[];          // all CSV rounds in chronological order
  defaultRoundStart?: string;   // from season_map bracket_round_start
  roundStartOptions?: string[];
  bracketBlocks?: BracketBlock[];  // multi-section definitions from season_map
  matchDates: string[];         // sorted unique dates from CSV
  cssFiles: string[];
  leagueDisplay: string;
  season: string;
}

interface ViewerControlState {
  scale: number;
  futureOpacity: number;
  targetDate: string | null;
}

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

function createControlStateFromPrefs(prefs: ViewerPrefs): ControlState {
  return {
    viewer: {
      scale: prefs.scale ? parseFloat(prefs.scale) : 1,
      futureOpacity: prefs.futureOpacity ? parseFloat(prefs.futureOpacity) : 0.2,
      targetDate: prefs.targetDate ?? null,
    },
    bracket: {
      layout: 'horizontal',
      roundStart: prefs.roundStart ?? null,
    },
  };
}

// ---- DOM helpers -----------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
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

function resolveSeasonBracketOrder(entry: RawSeasonEntry): (string | null)[] | undefined {
  const explicitOrder = entry.bracket_order;
  if (explicitOrder != null && explicitOrder.length > 0) {
    return explicitOrder;
  }

  const legacyOrder = entry.teams;
  if (legacyOrder.length > 0) {
    return legacyOrder;
  }

  const sectionOrder = entry.bracket_blocks?.flatMap((section) => section.bracket_order);
  if (sectionOrder != null && sectionOrder.length > 0) {
    return sectionOrder;
  }

  return undefined;
}

// ---- Dropdown population ---------------------------------------------------

function populateCompetitionPulldown(seasonMap: SeasonMap): void {
  const sel = document.getElementById('competition_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const families = Object.entries(seasonMap);
  const multiFamily = families.length > 1;
  for (const [familyKey, family] of families) {
    const bracketComps = Object.entries(family.competitions)
      .filter(([, comp]) => getCompetitionViewTypes(family, comp).includes('bracket'));
    if (bracketComps.length === 0) continue;

    if (multiFamily) {
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = `── ${family.display_name ?? familyKey} `;
      sel.appendChild(sep);
    }
    for (const [compKey, comp] of bracketComps) {
      const opt = document.createElement('option');
      opt.value = compKey;
      opt.textContent = comp.league_display ?? compKey;
      sel.appendChild(opt);
    }
  }
}

function populateSeasonPulldown(seasonMap: SeasonMap, competition: string): void {
  const sel = document.getElementById('season_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const found = findCompetition(seasonMap, competition);
  if (!found) return;
  const seasons = Object.keys(found.competition.seasons)
    .filter(s => {
      const e = found.competition.seasons[s];
      return e.bracket_order != null || e.bracket_blocks != null || e.teams?.length > 0;
    })
    .sort().reverse();
  for (const s of seasons) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  }
}

// ---- URL params ------------------------------------------------------------

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
    const inferred = inferRoundFilter(rows, s.bracket_order, s.matchup_pairs);
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
  const sel = document.getElementById('round_start_key') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = '';
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
  state: Pick<BracketState, 'csvRows' | 'aggregateTiebreakOrder' | 'matchDates' | 'cssFiles'>,
  order: (string | null)[],
): SingleBracketRenderInput | null {
  if (order.length < 2 || state.matchDates.length === 0) return null;
  return {
    rows: state.csvRows,
    order,
    aggregateTiebreakOrder: state.aggregateTiebreakOrder,
    targetDate: getTargetDate(),
    lastDate: state.matchDates[state.matchDates.length - 1],
    cssFiles: state.cssFiles,
  };
}

function createInclusiveBracketRenderInput(
  state: Pick<
  BracketState,
  'csvRows' | 'aggregateTiebreakOrder' | 'matchDates' | 'cssFiles' |
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
  const container = document.getElementById('bracket_container');
  if (!container) return;

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
    if (section.bracket_order.length < 2) continue;

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
      const order = section.bracket_order;
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
        section.bracket_order,
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
  const container = document.getElementById('bracket_container');
  if (!container) return;

  // Dismiss any pinned tooltip before re-render (DOM will be replaced)
  unpinTooltip();

  // Multi-section mode: render each section as its own bracket block.
  if (shouldRenderMultiSectionView(currentState.bracketBlocks, controlState.bracket.roundStart)) {
    renderMultiSections();
    return;
  }

  // Inclusive mode: resolve one effective bracket order, then render it as one tree.
  renderInclusiveBracket(container);
}

/** Sync viewer control targetDate from slider position. */
function syncTargetDateFromSlider(): void {
  if (!currentState) return;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (!slider) return;
  controlState.viewer.targetDate = getSliderDate(currentState.matchDates, parseInt(slider.value, 10));
}

/** Align slider position to the kept target date without overwriting the target itself. */
function syncSliderFromTargetDate(): void {
  if (!currentState) return;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  syncSliderToTargetDate(slider, currentState.matchDates, controlState.viewer.targetDate);
}

/** Update display label from current slider position + kept target date. */
function updateSliderDisplay(): void {
  if (!currentState) return;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  const display = document.getElementById('post_date_slider');
  if (!slider || !display) return;
  const sliderDate = getSliderDate(currentState.matchDates, parseInt(slider.value, 10)) ?? '';
  const targetDate = resolveTargetDate(currentState.matchDates, controlState.viewer.targetDate) ?? sliderDate;
  display.textContent = formatSliderDate(sliderDate, targetDate);
}

// ---- Controls: opacity, scale, layout --------------------------------------

/** Apply futureOpacity from controlState to all .bracket-future elements. */
function applyFutureOpacity(): void {
  const container = document.getElementById('bracket_container');
  if (!container) return;
  const value = String(controlState.viewer.futureOpacity);
  for (const el of Array.from(container.querySelectorAll('.bracket-future'))) {
    (el as HTMLElement).style.opacity = value;
  }
  const display = document.getElementById('current_opacity');
  if (display) display.textContent = value;
}

/** Keep layout height in sync with the visual scale of the bracket container. */
function syncBracketContainerHeight(container: HTMLElement): void {
  container.style.height = 'auto';
  const rawHeight = container.scrollHeight;
  if (rawHeight > 0) {
    container.style.height = `${rawHeight * controlState.viewer.scale}px`;
  }
}

/** Apply scale from controlState to bracket container. */
function applyScale(): void {
  const container = document.getElementById('bracket_container');
  if (!container) return;
  const value = String(controlState.viewer.scale);
  container.style.transform = `scale(${value})`;
  container.style.transformOrigin = 'top left';
  syncBracketContainerHeight(container);
  const display = document.getElementById('current_scale');
  if (display) display.textContent = value;
}

// ---- Render pipeline -------------------------------------------------------

const CACHE_BUST_WINDOW_SEC = 300;

function loadAndRender(seasonMap: SeasonMap): void {
  const competition = getSelectValue('competition_key');
  const season = getSelectValue('season_key');
  if (!competition || !season) return;

  const found = findCompetition(seasonMap, competition);
  if (!found || !found.competition.seasons[season]) {
    setStatus(t('status.noSeason', { competition, season }));
    return;
  }

  const seasonInfo = resolveSeasonInfo(
    found.family, found.competition, found.competition.seasons[season], found.familyKey,
  );
  const entry = found.competition.seasons[season];
  const bracketOrder = resolveSeasonBracketOrder(entry);
  if (!bracketOrder || bracketOrder.length === 0) {
    setStatus('No bracket data for this season.');
    return;
  }

  writeUrlParams(competition, season);
  savePrefs({ competition, season });

  const filename = getCsvFilename(competition, season);
  const cachebuster = Math.floor(Date.now() / 1000 / CACHE_BUST_WINDOW_SEC);
  setStatus(t('status.loading'));

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const defaultRoundStart = entry.bracket_round_start
        ? normalizeBracketRoundLabel(entry.bracket_round_start)
        : undefined;
      const roundStartOptions = entry.round_start_options?.map((option) => (
        option === MULTI_SECTION_VALUE ? option : normalizeBracketRoundLabel(option)
      ));
      const aggregateTiebreakOrder = entry.aggregate_tiebreak_order ?? ['penalties'];
      const rawSections = entry.bracket_blocks;
      const resolved = rawSections
        ? resolveSectionRoundFilters(rawSections, entry.default_round_filter)
        : undefined;
      const bracketBlocks = resolved
        ? inferMissingSectionRoundFilters(resolved, results.data)
        : undefined;
      const bracketRows = collectBracketSourceRows(results.data, bracketBlocks);
      const matchDates = collectMatchDates(bracketRows);

      // Build full tree to extract round structure and pre-populate cache
      const fullRoot = buildBracket(bracketRows, bracketOrder, aggregateTiebreakOrder);
      bracketCache = new Map();
      bracketCache.set(JSON.stringify(bracketOrder), fullRoot);
      const roundsByDepth = collectRoundsByDepth(fullRoot);
      const bracketRounds = collectBracketRounds(fullRoot);
      const allRounds = bracketBlocks
        ? bracketRounds
        : collectRoundsFromCsv(bracketRows).filter(r => bracketRounds.includes(r));

      currentState = {
        csvRows: bracketRows,
        bracketOrder,
        aggregateTiebreakOrder,
        fullRoot,
        roundsByDepth,
        allRounds,
        defaultRoundStart,
        roundStartOptions,
        bracketBlocks,
        matchDates,
        cssFiles: seasonInfo.cssFiles,
        leagueDisplay: seasonInfo.leagueDisplay,
        season,
      };

      // Populate round start dropdown (with multi-section option if sections exist)
      populateRoundStartPulldown(
        allRounds,
        defaultRoundStart,
        bracketBlocks != null,
        roundStartOptions,
      );

      // Sync round start: restore from controlState or pick up dropdown default
      const roundSel = document.getElementById('round_start_key') as HTMLSelectElement | null;
      if (roundSel && controlState.bracket.roundStart) {
        const normalizedSelected = normalizeBracketRoundLabel(controlState.bracket.roundStart);
        const hasOption = Array.from(roundSel.options).some(o => o.value === normalizedSelected);
        if (hasOption) {
          roundSel.value = normalizedSelected;
          controlState.bracket.roundStart = normalizedSelected;
        } else {
          controlState.bracket.roundStart = roundSel.value;
        }
      } else if (roundSel) {
        controlState.bracket.roundStart = roundSel.value;
      }

      // Set up date slider and sync viewer control targetDate
      const slider = document.getElementById('date_slider') as HTMLInputElement | null;
      if (slider && matchDates.length > 0) {
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
      const notesEl = document.getElementById('season_notes');
      if (notesEl) {
        notesEl.replaceChildren();
        const bracketNotes = [
          t('bracketNote.aggregateScore'),
          t('bracketNote.etIncluded'),
          t('bracketNote.pkAnnotation'),
        ];
        for (const text of [...seasonInfo.notes, ...bracketNotes]) {
          const li = document.createElement('li');
          li.textContent = text;
          notesEl.appendChild(li);
        }
      }

      setStatus(t('status.loaded', {
        league: seasonInfo.leagueDisplay, season, rows: bracketRows.length,
      }));
    },
    error: (err: unknown) => {
      setStatus(t('status.error', { detail: String(err) }));
    },
  });
}

// ---- Initialization --------------------------------------------------------

async function main(): Promise<void> {
  const savedLocale = loadPrefs().locale;
  if (savedLocale === 'ja' || savedLocale === 'en') setLocale(savedLocale as Locale);
  applyI18nAttributes();

  let seasonMap: SeasonMap;
  try {
    seasonMap = await loadSeasonMap();
  } catch (err) {
    setStatus(t('status.seasonMapError'));
    console.error('Failed to load season map:', err);
    return;
  }

  populateCompetitionPulldown(seasonMap);

  const urlParams = readUrlParams();
  const prefs = loadPrefs();

  // Initialize control state from saved preferences
  controlState = createControlStateFromPrefs(prefs);

  const competitionSel = document.getElementById('competition_key') as HTMLSelectElement;
  const initCompetition = (urlParams.competition && findCompetition(seasonMap, urlParams.competition))
    ? urlParams.competition
    : (prefs.competition && findCompetition(seasonMap, prefs.competition))
    ? prefs.competition
    : competitionSel.options[0]?.value ?? '';
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

  // Locale selector
  const localeSel = document.getElementById('locale_key') as HTMLSelectElement | null;
  if (localeSel) {
    if (savedLocale) localeSel.value = savedLocale;
    localeSel.addEventListener('change', () => {
      savePrefs({ locale: localeSel.value });
      location.reload();
    });
  }

  // ---- Sync DOM sliders from controlState ----------------------------------

  const opacitySlider = document.getElementById('future_opacity') as HTMLInputElement | null;
  if (opacitySlider) opacitySlider.value = String(controlState.viewer.futureOpacity);

  const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
  if (scaleSlider) scaleSlider.value = String(controlState.viewer.scale);

  // ---- Date slider events --------------------------------------------------

  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    dateSlider.addEventListener('input', () => {
      syncTargetDateFromSlider();
      updateSliderDisplay();
    });
    dateSlider.addEventListener('change', () => {
      syncTargetDateFromSlider();
      updateSliderDisplay();
      renderWithDateFilter();
      applyFutureOpacity();
      savePrefs({ targetDate: controlState.viewer.targetDate ?? undefined });
    });

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value, 10) - 1));
      syncTargetDateFromSlider();
      updateSliderDisplay();
      renderWithDateFilter();
      applyFutureOpacity();
      savePrefs({ targetDate: controlState.viewer.targetDate ?? undefined });
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(
        parseInt(dateSlider.max, 10), parseInt(dateSlider.value, 10) + 1,
      ));
      syncTargetDateFromSlider();
      updateSliderDisplay();
      renderWithDateFilter();
      applyFutureOpacity();
      savePrefs({ targetDate: controlState.viewer.targetDate ?? undefined });
    });
    document.getElementById('date_slider_reset')?.addEventListener('click', () => {
      if (!currentState) return;
      controlState.viewer.targetDate = getLastMatchDate(currentState.matchDates);
      syncSliderFromTargetDate();
      updateSliderDisplay();
      renderWithDateFilter();
      applyFutureOpacity();
      savePrefs({ targetDate: controlState.viewer.targetDate ?? undefined });
    });
  }

  // ---- Opacity slider events -----------------------------------------------

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      controlState.viewer.futureOpacity = parseFloat(opacitySlider.value);
      applyFutureOpacity();
      savePrefs({ futureOpacity: opacitySlider.value });
    });
  }

  // ---- Scale slider events -------------------------------------------------

  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      controlState.viewer.scale = parseFloat(scaleSlider.value);
      applyScale();
      savePrefs({ scale: scaleSlider.value });
    });
  }

  // ---- Layout toggle events ------------------------------------------------

  const layoutSel = document.getElementById('layout_toggle') as HTMLSelectElement | null;
  if (layoutSel) {
    layoutSel.addEventListener('change', () => {
      controlState.bracket.layout = layoutSel.value as 'horizontal' | 'vertical';
      // Full re-render to recompute positions and connectors per section
      renderWithDateFilter();
      applyFutureOpacity();
    });
  }

  // ---- Round start change events --------------------------------------------

  document.getElementById('round_start_key')?.addEventListener('change', () => {
    controlState.bracket.roundStart = getSelectValue('round_start_key');
    renderWithDateFilter();
    applyFutureOpacity();
    savePrefs({ roundStart: controlState.bracket.roundStart });
  });

  // ---- Competition/season change events ------------------------------------

  competitionSel.addEventListener('change', () => {
    populateSeasonPulldown(seasonMap, competitionSel.value);
    loadAndRender(seasonMap);
  });
  document.getElementById('season_key')?.addEventListener('change', () => {
    loadAndRender(seasonMap);
  });

  loadAndRender(seasonMap);
}

if (typeof document !== 'undefined') {
  main().catch(console.error);
}
