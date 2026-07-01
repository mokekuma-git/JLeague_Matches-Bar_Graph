// Standalone league viewer entry point.

import type { SeasonMap } from './types/season';
import {
  findCompetition,
  getCompetitionViewTypes,
  loadSeasonMap,
} from './config/season-map';
import {
  createSharedViewerControlState,
  readUrlParams,
  restoreLocaleAndApplyI18n,
  writeUrlParams,
} from './view-bootstrap';
import {
  initLeagueView,
  LEAGUE_STANDALONE_IDS,
} from './league-view';
import { clearPrefs, loadPrefs, savePrefs } from './storage/local-storage';
import { t } from './i18n';

const DEFAULT_COMPETITION = 'J1';

function populateCompetitionPulldown(seasonMap: SeasonMap, select: HTMLSelectElement): void {
  select.replaceChildren();
  const families = Object.entries(seasonMap);
  const multiFamily = families.length > 1;
  for (const [familyKey, family] of families) {
    if (multiFamily) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = `── ${family.display_name ?? familyKey} `;
      select.appendChild(separator);
    }
    for (const [competitionKey, competition] of Object.entries(family.competitions)) {
      if (!getCompetitionViewTypes(family, competition).includes('league')) continue;
      const option = document.createElement('option');
      option.value = competitionKey;
      option.textContent = competition.league_display ?? competitionKey;
      select.appendChild(option);
    }
  }
}

function populateSeasonPulldown(
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

async function main(): Promise<void> {
  const prefs = loadPrefs();
  const savedLocale = restoreLocaleAndApplyI18n(prefs.locale);
  const status = document.getElementById('status_msg');

  let seasonMap: SeasonMap;
  try {
    seasonMap = await loadSeasonMap();
  } catch (error) {
    if (status) status.textContent = t('status.seasonMapError');
    console.error('Failed to load season map:', error);
    return;
  }

  const competitionSelect = document.getElementById('competition_key') as HTMLSelectElement;
  const seasonSelect = document.getElementById('season_key') as HTMLSelectElement;
  populateCompetitionPulldown(seasonMap, competitionSelect);

  const urlParams = readUrlParams();
  const initialCompetition = (urlParams.competition && findCompetition(seasonMap, urlParams.competition))
    ? urlParams.competition
    : (prefs.competition && findCompetition(seasonMap, prefs.competition))
      ? prefs.competition
      : DEFAULT_COMPETITION;
  competitionSelect.value = initialCompetition;
  populateSeasonPulldown(seasonMap, initialCompetition, seasonSelect);

  const found = findCompetition(seasonMap, initialCompetition);
  const initialSeason = (urlParams.season && found?.competition.seasons[urlParams.season])
    ? urlParams.season
    : (prefs.season && found?.competition.seasons[prefs.season])
      ? prefs.season
      : seasonSelect.options[0]?.value ?? '';
  seasonSelect.value = initialSeason;

  const shared = createSharedViewerControlState(prefs);
  if (prefs.targetDate && prefs.targetDate !== shared.targetDate) {
    savePrefs({ targetDate: shared.targetDate ?? undefined });
  }
  const leagueView = initLeagueView(LEAGUE_STANDALONE_IDS, {
    shared,
    onViewerChange() {
      savePrefs({
        scale: String(shared.scale),
        futureOpacity: String(shared.futureOpacity),
        targetDate: shared.targetDate ?? undefined,
      });
    },
  });

  const activate = (): void => {
    const selection = {
      competition: competitionSelect.value,
      season: seasonSelect.value,
    };
    writeUrlParams(selection.competition, selection.season);
    savePrefs(selection);
    leagueView.activate(seasonMap, selection);
  };

  competitionSelect.addEventListener('change', () => {
    populateSeasonPulldown(seasonMap, competitionSelect.value, seasonSelect);
    activate();
  });
  seasonSelect.addEventListener('change', activate);

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

  activate();
}

main().catch(console.error);
