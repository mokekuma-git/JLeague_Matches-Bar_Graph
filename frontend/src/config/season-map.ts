// Season map loader and utilities for the 4-tier hierarchy.

import yaml from 'js-yaml';
import type { PointSystem } from '../types/config';
import type {
  SeasonMap, GroupEntry, CompetitionEntry, RawSeasonEntry, SeasonInfo,
  CrossGroupStanding, DataSource, ViewType,
} from '../types/season';
import { generateRuleNotes } from './rule-notes';
import { t } from '../i18n';

/**
 * Returns the CSV filename for a given competition and season.
 * @param competition - Competition key (e.g. 'J1', 'WC_GS', 'PrinceKanto')
 * @param season      - Season name (e.g. '2025', '2026East')
 */
export function getCsvFilename(competition: string, season: string): string {
  return `csv/${season}_allmatch_result-${competition}.csv`;
}

/**
 * Fetches and parses season_map.yaml.
 */
export async function loadSeasonMap(url: string = './yaml/season_map.yaml'): Promise<SeasonMap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load season map: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return yaml.load(text) as SeasonMap;
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
 * Resolve view_type at the group → competition level (ignoring per-season).
 * Used for dropdown filtering without resolving every season entry.
 * Returns ['league'] as the default when no level specifies view_type.
 */
export function getCompetitionViewTypes(group: GroupEntry, comp: CompetitionEntry): ViewType[] {
  const viewTypes = mergeUniqueArrays(group.view_type, comp.view_type);
  return viewTypes.length > 0 ? viewTypes : ['league'];
}

function pickCascade<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function mergeObjects<T extends Record<string, unknown>>(...values: (T | undefined)[]): T {
  return Object.assign({}, ...values) as T;
}

function mergeUniqueArrays<T>(...values: (readonly T[] | undefined)[]): T[] {
  const merged: T[] = [];
  const seen = new Set<T>();

  for (const value of values) {
    for (const item of value ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }

  return merged;
}

function toArray<T>(value: T | readonly T[] | undefined): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return [...value];
  return [value as T];
}

function hasEntries(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
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
  groupKey: string = '',
): SeasonInfo {
  const cssFiles = mergeUniqueArrays(group.css_files, comp.css_files, entry.css_files);

  // team_rename_map currently cascades only competition -> season.
  const teamRenameMap = mergeObjects<Record<string, string>>(
    comp.team_rename_map,
    entry.team_rename_map,
  );

  const leagueDisplay = pickCascade(
    entry.league_display,
    comp.league_display,
    group.display_name,
    groupKey,
  )!;

  const pointSystem: PointSystem = pickCascade(
    entry.point_system,
    comp.point_system,
    'standard',
  )!;

  const tiebreakOrder = pickCascade(
    entry.tiebreak_order,
    comp.tiebreak_order,
    ['goal_diff', 'goal_get'],
  )!;

  const aggregateTiebreakOrder = pickCascade(
    entry.aggregate_tiebreak_order,
    comp.aggregate_tiebreak_order,
    group.aggregate_tiebreak_order,
    [],
  )!;

  const seasonStartMonth = pickCascade(
    entry.season_start_month,
    comp.season_start_month,
    group.season_start_month,
    7,
  )!;

  const shownGroups = pickCascade(
    entry.shown_groups,
    comp.shown_groups,
  );

  const crossGroupStanding: CrossGroupStanding | undefined = pickCascade(
    entry.cross_group_standing,
    comp.cross_group_standing,
  );

  // group_team_count currently cascades only competition -> season.
  const groupTeamCountRaw = mergeObjects<Record<string, number>>(
    comp.group_team_count,
    entry.group_team_count,
  );
  const groupTeamCount = hasEntries(groupTeamCountRaw) ? groupTeamCountRaw : undefined;

  const dataSource: DataSource | undefined = pickCascade(
    entry.data_source,
    comp.data_source,
    group.data_source,
  );

  const promotionLabel = pickCascade(
    entry.promotion_label,
    comp.promotion_label,
    group.promotion_label,
    t('col.promotion'),
  )!;

  const notes = [
    ...toArray(group.note),
    ...toArray(comp.note),
    ...toArray(entry.note),
    ...generateRuleNotes(pointSystem, tiebreakOrder, aggregateTiebreakOrder),
  ];

  const viewTypes = mergeUniqueArrays(group.view_type, comp.view_type, entry.view_type);

  return {
    teamCount: entry.team_count,
    promotionCount: entry.promotion_count,
    relegationCount: entry.relegation_count,
    teams: entry.teams,
    rankClass: entry.rank_properties ?? {},
    groupDisplay: entry.group_display,
    urlCategory: entry.url_category,
    leagueDisplay,
    pointSystem,
    cssFiles,
    teamRenameMap,
    tiebreakOrder,
    seasonStartMonth,
    shownGroups,
    crossGroupStanding,
    groupTeamCount,
    dataSource,
    notes,
    promotionLabel,
    viewTypes: viewTypes.length > 0 ? viewTypes : ['league'],
  };
}
