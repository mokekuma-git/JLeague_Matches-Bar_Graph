// Pure data preparation for the render pipeline.
//
// Extracts the data-transformation portion of renderFromCache(),
// making it testable without any DOM dependency.

import type { TeamData } from '../types/match';
import type { SeasonInfo } from '../types/season';
import { calculateTeamStats } from '../ranking/stats-calculator';
import type { MatchSortKey } from '../ranking/stats-calculator';
import { getSortedTeamList } from './sorter';

/** Input parameters for prepareRenderData. */
export interface PrepareRenderInput {
  /** Raw group data from the CSV cache (will be deep-copied, not mutated). */
  groupData: Record<string, TeamData>;
  /** Fully resolved season info (from resolveSeasonInfo). */
  seasonInfo: SeasonInfo;
  /** Display cutoff date in 'YYYY/MM/DD' format. */
  targetDate: string;
  /** Team sort key (e.g. 'point', 'disp_avlbl_pt'). */
  sortKey: string;
  /** Match sort axis: 'section_no' or 'match_date'. */
  matchSortKey: MatchSortKey;
}

/** Output of prepareRenderData, consumed by the rendering layer. */
export interface PrepareRenderResult {
  /** Deep-copied group data with stats calculated (mutated copy, not the original). */
  groupData: Record<string, TeamData>;
  /** Team names sorted by the requested sort key. */
  sortedTeams: string[];
}

/**
 * Prepares render-ready data from cached CSV data and season configuration.
 *
 * This is a pure function (no DOM access). It:
 * 1. Deep-copies groupData so the original cache is not mutated.
 * 2. Calculates team statistics (points, goals, etc.) for the given target date.
 * 3. Sorts teams by the requested sort key with configured tiebreakers.
 */
export function prepareRenderData(input: PrepareRenderInput): PrepareRenderResult {
  const { groupData: rawGroupData, seasonInfo, targetDate, sortKey, matchSortKey } = input;

  // Deep copy: clone each TeamData and its df array so stats calculation
  // does not mutate the cached original.
  const groupData: Record<string, TeamData> = {};
  for (const [name, td] of Object.entries(rawGroupData)) {
    groupData[name] = { ...td, df: [...td.df] };
  }

  for (const teamData of Object.values(groupData)) {
    calculateTeamStats(teamData, targetDate, matchSortKey, seasonInfo.pointSystem);
  }

  const sortedTeams = getSortedTeamList(groupData, sortKey, seasonInfo.tiebreakOrder);

  return { groupData, sortedTeams };
}
