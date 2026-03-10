// Tournament bracket viewer entry point.
//
// Loads season_map.json, filters to bracket-enabled competitions,
// and renders a CSS bracket for the selected season.
// Provides date slider, opacity, zoom, and layout controls.

import Papa from 'papaparse';
import type { RawMatchRow } from './types/match';
import type { SeasonMap, BracketSection } from './types/season';
import {
  loadSeasonMap, getCsvFilename, findCompetition, resolveSeasonInfo,
  getCompetitionViewTypes,
} from './config/season-map';
import { buildBracket } from './bracket/bracket-data';
import { renderBracket, adjustBracketPositions, drawBracketConnectors } from './bracket/bracket-renderer';
import { loadPrefs, savePrefs } from './storage/local-storage';
import { t, applyI18nAttributes, setLocale } from './i18n';
import type { Locale } from './i18n';
import type { BracketNode } from './bracket/bracket-types';

// ---- State ------------------------------------------------------------------

interface BracketState {
  csvRows: RawMatchRow[];
  bracketOrder: string[];
  fullRoot: BracketNode;        // full tree built from bracketOrder
  roundsByDepth: string[];      // round labels root-to-leaf (e.g. ['決勝戦','準決勝','準々決勝','ラウンド16'])
  allRounds: string[];          // all CSV rounds in chronological order
  defaultRoundStart?: string;   // from season_map bracket_round_start
  bracketSections?: BracketSection[];  // multi-section definitions from season_map
  matchDates: string[];         // sorted unique dates from CSV
  cssFiles: string[];
  leagueDisplay: string;
  season: string;
}

const MULTI_SECTION_VALUE = '__multi_section__';

let currentState: BracketState | null = null;

// ---- DOM helpers -----------------------------------------------------------

function getSelectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status_msg');
  if (el) el.textContent = msg;
}

// ---- Match date collection --------------------------------------------------

const PRESEASON_SENTINEL = '1970/01/01';

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

// ---- Dropdown population ---------------------------------------------------

function populateCompetitionPulldown(seasonMap: SeasonMap): void {
  const sel = document.getElementById('competition_key') as HTMLSelectElement;
  sel.innerHTML = '';
  const groups = Object.entries(seasonMap);
  const multiGroup = groups.length > 1;
  for (const [groupKey, group] of groups) {
    const bracketComps = Object.entries(group.competitions)
      .filter(([, comp]) => getCompetitionViewTypes(group, comp).includes('bracket'));
    if (bracketComps.length === 0) continue;

    if (multiGroup) {
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = `── ${group.display_name ?? groupKey} `;
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
      return e[4]?.bracket_order != null || e[4]?.bracket_sections != null || e[3]?.length > 0;
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

/** Collect unique rounds from CSV in chronological order. */
function collectRoundsFromCsv(rows: RawMatchRow[]): string[] {
  const seen = new Set<string>();
  const rounds: string[] = [];
  const sorted = [...rows].sort(
    (a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''),
  );
  for (const row of sorted) {
    if (row.round && !seen.has(row.round)) {
      seen.add(row.round);
      rounds.push(row.round);
    }
  }
  return rounds;
}

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
      r.round === round && (r.home_team === team || r.away_team === team),
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
): void {
  const sel = document.getElementById('round_start_key') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = '';

  // Add multi-section option when bracket_sections is defined
  if (hasSections) {
    const opt = document.createElement('option');
    opt.value = MULTI_SECTION_VALUE;
    opt.textContent = t('label.multiSection');
    sel.appendChild(opt);
  }

  for (const round of allRounds) {
    const opt = document.createElement('option');
    opt.value = round;
    opt.textContent = round;
    sel.appendChild(opt);
  }

  // Default: multi-section if available, otherwise configured round
  if (hasSections) {
    sel.value = MULTI_SECTION_VALUE;
  } else if (defaultRound && allRounds.includes(defaultRound)) {
    sel.value = defaultRound;
  }
}

/** Get effective bracket order for the selected start round. */
function getEffectiveBracketOrder(): (string | null)[] {
  if (!currentState) return [];
  const { fullRoot, bracketOrder, roundsByDepth, allRounds, csvRows } = currentState;
  const selected = getSelectValue('round_start_key');

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
  if (!currentState) return null;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (!slider) return null;
  const idx = parseInt(slider.value, 10);
  return currentState.matchDates[idx] ?? null;
}

/**
 * Mask a bracket tree for a target date.
 * - Nodes with matchDate > targetDate: clear scores and winner, keep date/stadium
 * - Aggregate (H&A) nodes: use earliest leg date; partially mask if between legs
 * - Nodes whose child winner is unknown: set corresponding team to null (TBD)
 * Walks bottom-up (children before parent) so winner propagation works correctly.
 */
function maskBracketForDate(node: BracketNode, targetDate: string): BracketNode {
  // Recurse into children first
  const [upper, lower] = node.children;
  const maskedUpper = upper ? maskBracketForDate(upper, targetDate) : null;
  const maskedLower = lower ? maskBracketForDate(lower, targetDate) : null;

  // Determine effective match date.
  // Aggregate (H&A) nodes don't have matchDate; derive from earliest leg date.
  let effectiveDate = node.matchDate;
  if (!effectiveDate && node.legs) {
    const legDates = node.legs
      .map(l => l.matchDate)
      .filter((d): d is string => d != null)
      .sort();
    if (legDates.length > 0) effectiveDate = legDates[0];
  }

  const isFuture = effectiveDate != null && effectiveDate > targetDate;

  if (isFuture) {
    // Replace teams with child winners (may be null = TBD)
    const homeTeam = maskedUpper ? maskedUpper.winner : node.homeTeam;
    const awayTeam = maskedLower ? maskedLower.winner : node.awayTeam;
    return {
      ...node,
      homeTeam,
      awayTeam,
      homeGoal: undefined,
      awayGoal: undefined,
      homePkScore: undefined,
      awayPkScore: undefined,
      homeScoreEx: undefined,
      awayScoreEx: undefined,
      legs: undefined,
      status: 'ＶＳ',
      winner: null,
      children: [maskedUpper, maskedLower],
    };
  }

  // Partial H&A masking: some legs played, some still in the future.
  // Show only played legs and recalculate partial aggregate (no winner yet).
  if (node.legs && node.legs.some(l => l.matchDate != null && l.matchDate > targetDate)) {
    const playedLegs = node.legs.filter(
      l => !l.matchDate || l.matchDate <= targetDate,
    );
    let upperTotal = 0;
    let lowerTotal = 0;
    for (const leg of playedLegs) {
      if (leg.homeGoal == null || leg.awayGoal == null) continue;
      const isUpperHome = leg.homeTeam === node.homeTeam;
      upperTotal += isUpperHome ? leg.homeGoal : leg.awayGoal;
      lowerTotal += isUpperHome ? leg.awayGoal : leg.homeGoal;
    }
    return {
      ...node,
      homeGoal: playedLegs.length > 0 ? upperTotal : undefined,
      awayGoal: playedLegs.length > 0 ? lowerTotal : undefined,
      homePkScore: undefined,
      awayPkScore: undefined,
      homeScoreEx: undefined,
      awayScoreEx: undefined,
      winner: null,
      status: 'ＶＳ',
      legs: playedLegs.length > 0 ? playedLegs : undefined,
      children: [maskedUpper, maskedLower],
    };
  }

  // Not future: keep original data but use masked children
  return { ...node, children: [maskedUpper, maskedLower] };
}

/** Check if the current dropdown selection is multi-section mode. */
function isMultiSectionMode(): boolean {
  return getSelectValue('round_start_key') === MULTI_SECTION_VALUE;
}

/**
 * Render a single bracket into a container, apply layout, adjust, and draw connectors.
 * The container must already be in the DOM for getBoundingClientRect to work.
 */
function renderSingleBracketInto(
  sectionContainer: HTMLElement,
  root: BracketNode,
  cssFiles: string[],
): void {
  sectionContainer.appendChild(renderBracket(root, cssFiles));
  applyLayoutTo(sectionContainer);
  adjustBracketPositions(sectionContainer);
  drawBracketConnectors(sectionContainer);
}

/**
 * Build and render a bracket tree (with date mask) into a container.
 * Handles the common build → mask → render pipeline for both normal and single-round modes.
 */
function buildAndRenderBracket(
  container: HTMLElement,
  rows: RawMatchRow[],
  order: (string | null)[],
  targetDate: string | null,
  lastDate: string,
  cssFiles: string[],
): void {
  if (order.length < 2) return;
  const fullRoot = buildBracket(rows, order);
  const root = (targetDate && targetDate < lastDate)
    ? maskBracketForDate(fullRoot, targetDate) : fullRoot;
  renderSingleBracketInto(container, root, cssFiles);
}

/**
 * Render multi-section view: each BracketSection becomes an independent
 * collapsible bracket, all sharing the same CSV and date filter.
 */
function renderMultiSections(): void {
  if (!currentState?.bracketSections) return;
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
  });
  container.appendChild(toggleBtn);

  const targetDate = getTargetDate();
  const lastDate = currentState.matchDates[currentState.matchDates.length - 1];

  for (const section of currentState.bracketSections) {
    if (section.bracket_order.length < 2) continue;

    // Pre-filter CSV rows by round_filter if specified
    const rows = section.round_filter
      ? currentState.csvRows.filter(r => section.round_filter!.includes(r.round ?? ''))
      : currentState.csvRows;

    // Create collapsible section
    const details = document.createElement('details');
    details.classList.add('bracket-section');
    // Restore previous open state; default to open for new sections
    details.open = prevOpen.get(section.label) ?? true;
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

    if (section.single_round) {
      // Single-round: split bracket_order into pairs and render each independently
      const order = section.bracket_order;
      for (let i = 0; i < order.length; i += 2) {
        const pair = order.slice(i, i + 2);
        if (pair.every(t => t == null)) continue;
        buildAndRenderBracket(sectionWrapper, rows, pair, targetDate, lastDate, currentState.cssFiles);
      }
    } else {
      buildAndRenderBracket(sectionWrapper, rows, section.bracket_order, targetDate, lastDate, currentState.cssFiles);
    }
  }
}

function renderWithDateFilter(): void {
  if (!currentState) return;
  const container = document.getElementById('bracket_container');
  if (!container) return;

  // Multi-section mode: render all sections independently
  if (isMultiSectionMode() && currentState.bracketSections) {
    renderMultiSections();
    return;
  }

  // Single bracket mode: use effective bracket order + date mask
  const effectiveOrder = getEffectiveBracketOrder();
  if (effectiveOrder.length < 2) return;
  const fullRoot = buildBracket(currentState.csvRows, effectiveOrder);
  const targetDate = getTargetDate();
  const lastDate = currentState.matchDates[currentState.matchDates.length - 1];
  const root = (targetDate && targetDate < lastDate)
    ? maskBracketForDate(fullRoot, targetDate)
    : fullRoot;

  container.replaceChildren();
  renderSingleBracketInto(container, root, currentState.cssFiles);
}

function updateSliderDisplay(): void {
  if (!currentState) return;
  const slider = document.getElementById('date_slider') as HTMLInputElement | null;
  const display = document.getElementById('post_date_slider');
  if (!slider || !display) return;
  const idx = parseInt(slider.value, 10);
  const date = currentState.matchDates[idx];
  display.textContent = date === PRESEASON_SENTINEL ? t('slider.preseason') : (date ?? '');
}

// ---- Controls: opacity, scale, layout --------------------------------------

function setBracketFutureOpacity(value: string): void {
  const container = document.getElementById('bracket_container');
  if (!container) return;
  for (const el of Array.from(container.querySelectorAll('.bracket-future'))) {
    (el as HTMLElement).style.opacity = value;
  }
  const display = document.getElementById('current_opacity');
  if (display) display.textContent = value;
}

function setBracketScale(value: string): void {
  const container = document.getElementById('bracket_container');
  if (!container) return;
  container.style.transform = `scale(${value})`;
  container.style.transformOrigin = 'top left';
  const display = document.getElementById('current_scale');
  if (display) display.textContent = value;
}

/** Apply layout class to a specific container's bracket element(s). */
function applyLayoutTo(container: HTMLElement): void {
  const layoutSel = document.getElementById('layout_toggle') as HTMLSelectElement | null;
  if (!layoutSel) return;
  const isVertical = layoutSel.value === 'vertical';
  for (const bracket of Array.from(container.querySelectorAll('.bracket'))) {
    if (isVertical) bracket.classList.add('vertical');
    else bracket.classList.remove('vertical');
  }
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
    found.group, found.competition, found.competition.seasons[season], found.groupKey,
  );
  const entry = found.competition.seasons[season];
  const bracketOrder = entry[4]?.bracket_order ?? entry[3];
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
      const matchDates = collectMatchDates(results.data);
      const defaultRoundStart = entry[4]?.bracket_round_start;
      const bracketSections = entry[4]?.bracket_sections;

      // Build full tree to extract round structure
      const fullRoot = buildBracket(results.data, bracketOrder);
      const roundsByDepth = collectRoundsByDepth(fullRoot);
      const allRounds = collectRoundsFromCsv(results.data);

      currentState = {
        csvRows: results.data,
        bracketOrder,
        fullRoot,
        roundsByDepth,
        allRounds,
        defaultRoundStart,
        bracketSections,
        matchDates,
        cssFiles: seasonInfo.cssFiles,
        leagueDisplay: seasonInfo.leagueDisplay,
        season,
      };

      // Populate round start dropdown (with multi-section option if sections exist)
      populateRoundStartPulldown(allRounds, defaultRoundStart, bracketSections != null);

      // Restore saved round start if it matches an available option
      const savedRoundStart = loadPrefs().roundStart;
      const roundSel = document.getElementById('round_start_key') as HTMLSelectElement | null;
      if (roundSel && savedRoundStart) {
        const hasOption = Array.from(roundSel.options).some(o => o.value === savedRoundStart);
        if (hasOption) roundSel.value = savedRoundStart;
      }

      // Set up date slider
      const slider = document.getElementById('date_slider') as HTMLInputElement | null;
      if (slider && matchDates.length > 0) {
        slider.min = '0';
        slider.max = String(matchDates.length - 1);
        // Restore saved date position; default to latest
        const savedDate = loadPrefs().targetDate;
        const savedIdx = savedDate ? matchDates.indexOf(savedDate) : -1;
        slider.value = String(savedIdx >= 0 ? savedIdx : matchDates.length - 1);
      }

      renderWithDateFilter();
      updateSliderDisplay();

      // Apply saved opacity
      const opacitySlider = document.getElementById('future_opacity') as HTMLInputElement | null;
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);

      // Apply saved scale
      const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
      if (scaleSlider) setBracketScale(scaleSlider.value);

      setStatus(t('status.loaded', {
        league: seasonInfo.leagueDisplay, season, rows: results.data.length,
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

  // ---- Restore saved preferences -------------------------------------------

  const opacitySlider = document.getElementById('future_opacity') as HTMLInputElement | null;
  if (opacitySlider && prefs.futureOpacity) opacitySlider.value = prefs.futureOpacity;

  const scaleSlider = document.getElementById('scale_slider') as HTMLInputElement | null;
  if (scaleSlider && prefs.scale) scaleSlider.value = prefs.scale;

  // ---- Date slider events --------------------------------------------------

  const dateSlider = document.getElementById('date_slider') as HTMLInputElement | null;
  if (dateSlider) {
    dateSlider.addEventListener('input', () => {
      updateSliderDisplay();
    });
    const saveDatePref = () => {
      const date = getTargetDate();
      if (date) savePrefs({ targetDate: date });
    };
    dateSlider.addEventListener('change', () => {
      renderWithDateFilter();
      // Re-apply opacity after re-render
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
      saveDatePref();
    });

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value, 10) - 1));
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
      saveDatePref();
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(
        parseInt(dateSlider.max, 10), parseInt(dateSlider.value, 10) + 1,
      ));
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
      saveDatePref();
    });
    document.getElementById('date_slider_reset')?.addEventListener('click', () => {
      if (!currentState) return;
      dateSlider.value = String(currentState.matchDates.length - 1);
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
      saveDatePref();
    });
  }

  // ---- Opacity slider events -----------------------------------------------

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      setBracketFutureOpacity(opacitySlider.value);
      savePrefs({ futureOpacity: opacitySlider.value });
    });
  }

  // ---- Scale slider events -------------------------------------------------

  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      setBracketScale(scaleSlider.value);
      savePrefs({ scale: scaleSlider.value });
    });
  }

  // ---- Layout toggle events ------------------------------------------------

  const layoutSel = document.getElementById('layout_toggle') as HTMLSelectElement | null;
  if (layoutSel) {
    layoutSel.addEventListener('change', () => {
      // Full re-render to recompute positions and connectors per section
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
    });
  }

  // ---- Round start change events --------------------------------------------

  document.getElementById('round_start_key')?.addEventListener('change', () => {
    renderWithDateFilter();
    const opSlider = document.getElementById('future_opacity') as HTMLInputElement | null;
    if (opSlider) setBracketFutureOpacity(opSlider.value);
    savePrefs({ roundStart: getSelectValue('round_start_key') });
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

main().catch(console.error);
