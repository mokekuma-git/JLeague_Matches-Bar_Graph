// Tournament bracket viewer entry point.
//
// Loads season_map.json, filters to bracket-enabled competitions,
// and renders a CSS bracket for the selected season.
// Provides date slider, opacity, zoom, and layout controls.

import Papa from 'papaparse';
import type { RawMatchRow } from './types/match';
import type { SeasonMap } from './types/season';
import {
  loadSeasonMap, getCsvFilename, findCompetition, resolveSeasonInfo,
  getCompetitionViewTypes,
} from './config/season-map';
import { buildBracket } from './bracket/bracket-data';
import { renderBracket } from './bracket/bracket-renderer';
import { loadPrefs, savePrefs } from './storage/local-storage';
import { t, applyI18nAttributes, setLocale } from './i18n';
import type { Locale } from './i18n';
import type { BracketNode } from './bracket/bracket-types';

// ---- State ------------------------------------------------------------------

interface BracketState {
  csvRows: RawMatchRow[];
  bracketOrder: string[];
  matchDates: string[];       // sorted unique dates from CSV
  cssFiles: string[];
  leagueDisplay: string;
  season: string;
}

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
      return e[4]?.bracket_order != null || e[3]?.length > 0;
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
 * - Nodes whose child winner is unknown: set corresponding team to null (TBD)
 * Walks bottom-up (children before parent) so winner propagation works correctly.
 */
function maskBracketForDate(node: BracketNode, targetDate: string): BracketNode {
  // Recurse into children first
  const [upper, lower] = node.children;
  const maskedUpper = upper ? maskBracketForDate(upper, targetDate) : null;
  const maskedLower = lower ? maskBracketForDate(lower, targetDate) : null;

  // Determine if this match is in the future
  const isFuture = node.matchDate != null && node.matchDate > targetDate;

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
      status: 'ＶＳ',
      winner: null,
      children: [maskedUpper, maskedLower],
    };
  }

  // Not future: keep original data but use masked children
  return { ...node, children: [maskedUpper, maskedLower] };
}

function renderWithDateFilter(): void {
  if (!currentState) return;
  const container = document.getElementById('bracket_container');
  if (!container) return;

  // Build full tree from all CSV data, then mask for target date
  const fullRoot = buildBracket(currentState.csvRows, currentState.bracketOrder);
  const targetDate = getTargetDate();
  const lastDate = currentState.matchDates[currentState.matchDates.length - 1];
  const root = (targetDate && targetDate < lastDate)
    ? maskBracketForDate(fullRoot, targetDate)
    : fullRoot;

  container.replaceChildren(renderBracket(root, currentState.cssFiles));

  // Apply layout class
  applyLayout();
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

function applyLayout(): void {
  const layoutSel = document.getElementById('layout_toggle') as HTMLSelectElement | null;
  const bracket = document.querySelector('.bracket');
  if (!bracket || !layoutSel) return;
  if (layoutSel.value === 'vertical') {
    bracket.classList.add('vertical');
  } else {
    bracket.classList.remove('vertical');
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

      currentState = {
        csvRows: results.data,
        bracketOrder,
        matchDates,
        cssFiles: seasonInfo.cssFiles,
        leagueDisplay: seasonInfo.leagueDisplay,
        season,
      };

      // Set up date slider
      const slider = document.getElementById('date_slider') as HTMLInputElement | null;
      if (slider && matchDates.length > 0) {
        slider.min = '0';
        slider.max = String(matchDates.length - 1);
        slider.value = String(matchDates.length - 1);
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
    dateSlider.addEventListener('change', () => {
      renderWithDateFilter();
      // Re-apply opacity after re-render
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
    });

    document.getElementById('date_slider_down')?.addEventListener('click', () => {
      dateSlider.value = String(Math.max(0, parseInt(dateSlider.value, 10) - 1));
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
    });
    document.getElementById('date_slider_up')?.addEventListener('click', () => {
      dateSlider.value = String(Math.min(
        parseInt(dateSlider.max, 10), parseInt(dateSlider.value, 10) + 1,
      ));
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
    });
    document.getElementById('date_slider_reset')?.addEventListener('click', () => {
      if (!currentState) return;
      dateSlider.value = String(currentState.matchDates.length - 1);
      updateSliderDisplay();
      renderWithDateFilter();
      if (opacitySlider) setBracketFutureOpacity(opacitySlider.value);
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
      applyLayout();
    });
  }

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
