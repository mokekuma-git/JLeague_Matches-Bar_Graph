// Season map loader and utilities for the 4-tier hierarchy.

import yaml from 'js-yaml';
import type { PointSystem } from '../types/config';
import type {
  SeasonMap, CompetitionFamilyEntry, CompetitionEntry, RawSeasonEntry, SeasonInfo,
  CrossGroupStanding, DataSource, ViewType, AggregateTiebreakCriterion,
} from '../types/season';
import { generateRuleNotes } from './rule-notes';
import { t } from '../i18n';
import { normalizeBracketRoundLabel } from '../bracket/round-label';

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
  familyKey: string;
  family: CompetitionFamilyEntry;
  competition: CompetitionEntry;
}

/**
 * Finds a competition by key across all families.
 * Returns the family and competition entry, or undefined if not found.
 */
export function findCompetition(
  seasonMap: SeasonMap, competitionKey: string,
): CompetitionLookup | undefined {
  for (const [familyKey, family] of Object.entries(seasonMap)) {
    const comp = family.competitions[competitionKey];
    if (comp) {
      return { familyKey, family, competition: comp };
    }
  }
  return undefined;
}

/**
 * Resolve view_type at the family → competition level (ignoring per-season).
 * Used for dropdown filtering without resolving every season entry.
 * Returns ['league'] as the default when no level specifies view_type.
 */
export function getCompetitionViewTypes(family: CompetitionFamilyEntry, comp: CompetitionEntry): ViewType[] {
  const viewTypes = mergeUniqueArrays(family.view_type, comp.view_type);
  return viewTypes.length > 0 ? viewTypes : ['league'];
}

function pickCascade<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function requireCascade<T>(
  label: string,
  ...values: (T | undefined)[]
): T {
  const resolved = pickCascade(...values);
  if (resolved === undefined) {
    throw new Error(`Missing required season_map field: ${label}`);
  }
  return resolved;
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

const MULTI_SECTION_VALUE = '__multi_section__';

interface ResolvedBaseFields {
  cssFiles: string[];
  leagueDisplay: string;
  pointSystem: PointSystem;
  tiebreakOrder: string[];
  aggregateTiebreakOrder: AggregateTiebreakCriterion[];
  dataSource?: DataSource;
  rawNotes: string[];
  viewTypes: ViewType[];
}

export interface TournamentSeasonInfo {
  cssFiles: string[];
  leagueDisplay: string;
  notes: string[];
  viewTypes: ViewType[];
  dataSource?: DataSource;
  aggregateTiebreakOrder: AggregateTiebreakCriterion[];
  defaultRoundStart?: string;
  roundStartOptions?: string[];
}

/**
 * Expands a scalar value into a Record using the given index keys.
 * If the value is already a Record, returns it as-is.
 * This enables YAML shorthand: `group_team_count: 4` instead of `{A: 4, B: 4, ...}`.
 */
function expandScalarDefault<T>(
  value: T | Record<string, T> | undefined,
  indexKeys: string[] | undefined,
  fieldName: string,
): Record<string, T> | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, T>;
  }
  if (!indexKeys || indexKeys.length === 0) {
    throw new Error(
      `${fieldName} scalar form requires index keys to expand`,
    );
  }
  return Object.fromEntries(indexKeys.map((key) => [key, value as T]));
}

function resolveBaseFields(
  family: CompetitionFamilyEntry,
  comp: CompetitionEntry,
  entry: RawSeasonEntry,
  familyKey: string = '',
): ResolvedBaseFields {
  const cssFiles = mergeUniqueArrays(family.css_files, comp.css_files, entry.css_files);

  const leagueDisplay = pickCascade(
    entry.league_display,
    comp.league_display,
    family.display_name,
    familyKey,
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
    family.aggregate_tiebreak_order,
    ['penalties'] as AggregateTiebreakCriterion[],
  )!;

  const dataSource: DataSource | undefined = pickCascade(
    entry.data_source,
    comp.data_source,
    family.data_source,
  );

  const rawNotes = [
    ...toArray(family.note),
    ...toArray(comp.note),
    ...toArray(entry.note),
  ];

  const viewTypes = mergeUniqueArrays(family.view_type, comp.view_type, entry.view_type);

  return {
    cssFiles,
    leagueDisplay,
    pointSystem,
    tiebreakOrder,
    aggregateTiebreakOrder,
    dataSource,
    rawNotes,
    viewTypes: viewTypes.length > 0 ? viewTypes : ['league'],
  };
}

/**
 * Resolves a SeasonInfo by applying the property cascade:
 * family → competition → season entry options.
 *
 * Cascade rules:
 * - Scalar (string): lower level overrides upper
 * - Array (css_files): union (deduplicated)
 * - Object (team_rename_map): merge (lower keys override)
 */
export function resolveSeasonInfo(
  family: CompetitionFamilyEntry,
  comp: CompetitionEntry,
  entry: RawSeasonEntry,
  familyKey: string = '',
): SeasonInfo {
  const base = resolveBaseFields(family, comp, entry, familyKey);

  // team_rename_map currently cascades only competition -> season.
  const teamRenameMap = mergeObjects<Record<string, string>>(
    comp.team_rename_map,
    entry.team_rename_map,
  );

  const seasonStartMonth = pickCascade(
    entry.season_start_month,
    comp.season_start_month,
    family.season_start_month,
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
  const compGroupTeamCount = expandScalarDefault(comp.group_team_count, shownGroups, 'group_team_count');
  const entryGroupTeamCount = expandScalarDefault(entry.group_team_count, shownGroups, 'group_team_count');
  const groupTeamCountRaw = mergeObjects<Record<string, number>>(
    compGroupTeamCount,
    entryGroupTeamCount,
  );
  const groupTeamCount = hasEntries(groupTeamCountRaw) ? groupTeamCountRaw : undefined;

  const promotionLabel = pickCascade(
    entry.promotion_label,
    comp.promotion_label,
    family.promotion_label,
    t('col.promotion'),
  )!;

  const notes = [
    ...base.rawNotes,
    ...generateRuleNotes(base.pointSystem, base.tiebreakOrder, base.aggregateTiebreakOrder),
  ];

  const bracketDefaultCount = base.viewTypes.includes('bracket') ? 0 : undefined;
  const inferredTeamCount = entry.teams && entry.teams.length > 0 ? entry.teams.length : undefined;
  const teamCount = requireCascade('team_count', entry.team_count, comp.team_count, inferredTeamCount);
  const promotionCount = requireCascade(
    'promotion_count',
    entry.promotion_count,
    comp.promotion_count,
    bracketDefaultCount,
  );
  const relegationCount = requireCascade(
    'relegation_count',
    entry.relegation_count,
    comp.relegation_count,
    bracketDefaultCount,
  );

  return {
    teamCount,
    promotionCount,
    relegationCount,
    teams: entry.teams ?? [],
    rankClass: entry.rank_properties ?? {},
    groupDisplay: entry.group_display,
    urlCategory: entry.url_category,
    leagueDisplay: base.leagueDisplay,
    pointSystem: base.pointSystem,
    cssFiles: base.cssFiles,
    teamRenameMap,
    tiebreakOrder: base.tiebreakOrder,
    seasonStartMonth,
    shownGroups,
    crossGroupStanding,
    groupTeamCount,
    dataSource: base.dataSource,
    notes,
    promotionLabel,
    viewTypes: base.viewTypes,
  };
}

export function resolveTournamentSeasonInfo(
  family: CompetitionFamilyEntry,
  comp: CompetitionEntry,
  entry: RawSeasonEntry,
  familyKey: string = '',
): TournamentSeasonInfo {
  const base = resolveBaseFields(family, comp, entry, familyKey);

  return {
    cssFiles: base.cssFiles,
    leagueDisplay: base.leagueDisplay,
    notes: base.rawNotes,
    viewTypes: base.viewTypes,
    dataSource: base.dataSource,
    aggregateTiebreakOrder: base.aggregateTiebreakOrder,
    defaultRoundStart: entry.bracket_round_start
      ? normalizeBracketRoundLabel(entry.bracket_round_start)
      : undefined,
    roundStartOptions: entry.round_start_options?.map((option) => (
      option === MULTI_SECTION_VALUE ? option : normalizeBracketRoundLabel(option)
    )),
  };
}
