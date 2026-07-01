import { findCompetition } from './config/season-map';
import type { SeasonMap, ViewType } from './types/season';

export interface InitialSelectionSource {
  competition?: string;
  season?: string;
}

export function resolveInitialCompetition(
  seasonMap: SeasonMap,
  url: InitialSelectionSource,
  prefs: InitialSelectionSource,
  defaultCompetition: string = 'J1',
): string {
  for (const value of [url.competition, prefs.competition, defaultCompetition]) {
    if (value && findCompetition(seasonMap, value)) return value;
  }
  return '';
}

export function resolveInitialSeason(
  seasonMap: SeasonMap,
  competition: string,
  url: InitialSelectionSource,
  prefs: InitialSelectionSource,
  availableSeasons?: readonly string[],
): string {
  const found = findCompetition(seasonMap, competition);
  if (!found) return '';
  const available = new Set(
    availableSeasons ?? Object.keys(found.competition.seasons),
  );
  for (const value of [url.season, prefs.season]) {
    if (value && available.has(value)) return value;
  }
  return availableSeasons?.[0]
    ?? Object.keys(found.competition.seasons).sort().reverse()[0]
    ?? '';
}

export function shouldShowTimezone(viewType: ViewType, hasTimezone: boolean): boolean {
  return viewType === 'league' && hasTimezone;
}
