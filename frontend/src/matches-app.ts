// Unified league / bracket viewer orchestrator.

import {
  findCompetition,
  loadSeasonMap,
  resolveCompetitionViewType,
} from './config/season-map';
import {
  BRACKET_NAMESPACED_IDS,
  initBracketView,
  populateBracketSeasonPulldown,
} from './bracket-view';
import {
  initLeagueView,
  LEAGUE_NAMESPACED_IDS,
} from './league-view';
import { clearPrefs, loadPrefs, savePrefs } from './storage/local-storage';
import type {
  SeasonMap,
  ViewType,
} from './types/season';
import {
  createSharedViewerControlState,
  normalizeTargetDate,
  readUrlParams,
  restoreLocaleAndApplyI18n,
  writeUrlParams,
} from './view-bootstrap';
import { t } from './i18n';
import {
  resolveInitialCompetition,
  resolveInitialSeason,
  shouldShowTimezone,
} from './matches-orchestration';

interface CompetitionOption {
  competitionKey: string;
  viewType: ViewType;
}

function getCompetitionOptions(seasonMap: SeasonMap): CompetitionOption[] {
  const options: CompetitionOption[] = [];
  for (const family of Object.values(seasonMap)) {
    for (const [competitionKey, competition] of Object.entries(family.competitions)) {
      try {
        options.push({
          competitionKey,
          viewType: resolveCompetitionViewType(family, competition),
        });
      } catch (error) {
        console.warn(`Skipping competition "${competitionKey}":`, error);
      }
    }
  }
  return options;
}

function populateCompetitionPulldown(
  seasonMap: SeasonMap,
  select: HTMLSelectElement,
): void {
  select.replaceChildren();
  const validKeys = new Set(getCompetitionOptions(seasonMap).map(option => option.competitionKey));
  const multiFamily = Object.keys(seasonMap).length > 1;

  for (const [familyKey, family] of Object.entries(seasonMap)) {
    const competitions = Object.entries(family.competitions)
      .filter(([competitionKey]) => validKeys.has(competitionKey));
    if (competitions.length === 0) continue;

    if (multiFamily) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = `── ${family.display_name ?? familyKey} `;
      select.appendChild(separator);
    }
    for (const [competitionKey, competition] of competitions) {
      const option = document.createElement('option');
      option.value = competitionKey;
      option.textContent = competition.league_display ?? competitionKey;
      option.dataset.viewType = resolveCompetitionViewType(family, competition);
      select.appendChild(option);
    }
  }
}

function populateLeagueSeasonPulldown(
  seasonMap: SeasonMap,
  competition: string,
  select: HTMLSelectElement,
): void {
  select.replaceChildren();
  const found = findCompetition(seasonMap, competition);
  if (!found) return;
  for (const season of Object.keys(found.competition.seasons).sort().reverse()) {
    const option = document.createElement('option');
    option.value = season;
    option.textContent = season;
    select.appendChild(option);
  }
}

function selectedViewType(select: HTMLSelectElement): ViewType | undefined {
  return select.selectedOptions[0]?.dataset.viewType as ViewType | undefined;
}

function persistSharedViewerState(
  shared: ReturnType<typeof createSharedViewerControlState>,
): void {
  shared.targetDate = normalizeTargetDate(shared.targetDate);
  savePrefs({
    scale: String(shared.scale),
    futureOpacity: String(shared.futureOpacity),
    targetDate: shared.targetDate ?? undefined,
  });
}

async function main(): Promise<void> {
  const prefs = loadPrefs();
  const savedLocale = restoreLocaleAndApplyI18n(prefs.locale);
  const status = document.getElementById('league_status_msg');

  let seasonMap: SeasonMap;
  try {
    seasonMap = await loadSeasonMap();
  } catch (error) {
    if (status) status.textContent = t('status.seasonMapError');
    console.error('Failed to load season map:', error);
    return;
  }

  const viewRoot = document.getElementById('view_root');
  const competitionSelect = document.getElementById('competition_key') as HTMLSelectElement | null;
  const seasonSelect = document.getElementById('season_key') as HTMLSelectElement | null;
  const timezoneLabel = document.getElementById('display_timezone_label');
  if (!viewRoot || !competitionSelect || !seasonSelect) {
    throw new Error('Unified viewer shell is incomplete');
  }

  const shared = createSharedViewerControlState(prefs);
  if (prefs.targetDate && prefs.targetDate !== shared.targetDate) {
    savePrefs({ targetDate: shared.targetDate ?? undefined });
  }
  const context = {
    shared,
    onViewerChange: () => persistSharedViewerState(shared),
  };
  const leagueView = initLeagueView(LEAGUE_NAMESPACED_IDS, context);
  const bracketView = initBracketView(BRACKET_NAMESPACED_IDS, context);
  const handles = { league: leagueView, bracket: bracketView };

  populateCompetitionPulldown(seasonMap, competitionSelect);
  const url = readUrlParams();
  let competition = resolveInitialCompetition(seasonMap, url, prefs);
  if (!Array.from(competitionSelect.options).some(option => option.value === competition)) {
    competition = competitionSelect.options[0]?.value ?? '';
  }
  competitionSelect.value = competition;

  let activeViewType: ViewType | undefined;

  const populateSeasons = (viewType: ViewType): void => {
    if (viewType === 'bracket') {
      populateBracketSeasonPulldown(seasonMap, competitionSelect.value, seasonSelect);
    } else {
      populateLeagueSeasonPulldown(seasonMap, competitionSelect.value, seasonSelect);
    }
  };

  const activate = (viewType: ViewType): void => {
    const selection = {
      competition: competitionSelect.value,
      season: seasonSelect.value,
    };
    if (activeViewType && activeViewType !== viewType) {
      handles[activeViewType].deactivate();
    }
    if (activeViewType !== viewType) {
      viewRoot.dataset.active = viewType;
      if (timezoneLabel && viewType === 'bracket') {
        timezoneLabel.hidden = !shouldShowTimezone(viewType, false);
      }
    }
    activeViewType = viewType;
    writeUrlParams(selection.competition, selection.season);
    savePrefs(selection);
    handles[viewType].activate(seasonMap, selection);
  };

  const initialViewType = selectedViewType(competitionSelect);
  if (!initialViewType) throw new Error('No valid competition is configured');
  populateSeasons(initialViewType);
  seasonSelect.value = resolveInitialSeason(
    seasonMap,
    competition,
    url,
    prefs,
    Array.from(seasonSelect.options).map(option => option.value),
  );

  competitionSelect.addEventListener('change', () => {
    const viewType = selectedViewType(competitionSelect);
    if (!viewType) return;
    populateSeasons(viewType);
    seasonSelect.value = resolveInitialSeason(
      seasonMap,
      competitionSelect.value,
      {},
      loadPrefs(),
      Array.from(seasonSelect.options).map(option => option.value),
    );
    activate(viewType);
  });
  seasonSelect.addEventListener('change', () => {
    const viewType = selectedViewType(competitionSelect);
    if (viewType) activate(viewType);
  });

  const localeSelect = document.getElementById('locale_key') as HTMLSelectElement | null;
  if (localeSelect) {
    if (savedLocale) localeSelect.value = savedLocale;
    localeSelect.addEventListener('change', () => {
      savePrefs({ locale: localeSelect.value });
      location.reload();
    });
  }
  document.getElementById('reset_prefs')?.addEventListener('click', () => {
    clearPrefs();
    location.assign(location.pathname);
  });

  // Leave pending only after season_map and the initial view have been resolved.
  activate(initialViewType);
}

main().catch(console.error);
