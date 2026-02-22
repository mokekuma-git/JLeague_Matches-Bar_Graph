// Season map loader and utilities for the 4-tier hierarchy.

import type { PointSystem } from '../types/config';
import type {
  SeasonMap, GroupEntry, CompetitionEntry, RawSeasonEntry, SeasonInfo,
} from '../types/season';

/**
 * Returns the CSV filename for a given competition and season.
 * @param competition - Competition key (e.g. 'J1', 'WC_GS', 'PrinceKanto')
 * @param season      - Season name (e.g. '2025', '2026East')
 */
export function getCsvFilename(competition: string, season: string): string {
  return 'csv/' + season + '_allmatch_result-' + competition + '.csv';
}

/**
 * Fetches and parses season_map.json.
 */
export async function loadSeasonMap(url: string = './json/season_map.json'): Promise<SeasonMap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load season map: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<SeasonMap>;
}

/** Result type for findCompetition(). */
export interface CompetitionLookup {
  groupKey: string;
  group: GroupEntry;
  competition: CompetitionEntry;
}

/**
 * Finds a competition by key across all groups.
 * Returns the group and competition entry, or undefined if not found.
 */
export function findCompetition(
  seasonMap: SeasonMap, competitionKey: string,
): CompetitionLookup | undefined {
  for (const [groupKey, group] of Object.entries(seasonMap)) {
    const comp = group.competitions[competitionKey];
    if (comp) {
      return { groupKey, group, competition: comp };
    }
  }
  return undefined;
}

/**
 * Resolves a SeasonInfo by applying the property cascade:
 * group → competition → season entry options.
 *
 * Cascade rules:
 * - Scalar (string): lower level overrides upper
 * - Array (css_files): union (deduplicated)
 * - Object (team_rename_map): merge (lower keys override)
 */
export function resolveSeasonInfo(
  group: GroupEntry,
  comp: CompetitionEntry,
  entry: RawSeasonEntry,
): SeasonInfo {
  const opts = entry[4] ?? {};

  // css_files: union across all three levels (deduplicated, preserving order)
  const cssSet = new Set<string>();
  const cssFiles: string[] = [];
  for (const file of [...(group.css_files ?? []), ...(comp.css_files ?? []), ...(opts.css_files ?? [])]) {
    if (!cssSet.has(file)) {
      cssSet.add(file);
      cssFiles.push(file);
    }
  }

  // team_rename_map: merge (lower overrides)
  const teamRenameMap: Record<string, string> = {
    ...(comp.team_rename_map ?? {}),
    ...(opts.team_rename_map ?? {}),
  };

  // Scalars: lowest defined level wins
  const leagueDisplay = opts.league_display
    ?? comp.league_display
    ?? group.display_name;

  const pointSystem: PointSystem = opts.point_system
    ?? comp.point_system
    ?? 'standard';

  return {
    teamCount: entry[0],
    promotionCount: entry[1],
    relegationCount: entry[2],
    teams: entry[3],
    rankClass: opts.rank_properties ?? {},
    groupDisplay: opts.group_display,
    urlCategory: opts.url_category,
    leagueDisplay,
    pointSystem,
    cssFiles,
    teamRenameMap,
  };
}
