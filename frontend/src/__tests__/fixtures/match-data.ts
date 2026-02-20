// Shared factory functions for test data.

import type { TeamData, TeamMatch } from '../../types/match';
import type { SeasonInfo } from '../../types/season';

/** Creates a TeamMatch with sensible defaults; override any field as needed. */
export function makeMatch(overrides: Partial<TeamMatch> = {}): TeamMatch {
  return {
    is_home: true,
    opponent: 'TeamB',
    goal_get: '2',
    goal_lose: '1',
    pk_get: null,
    pk_lose: null,
    has_result: true,
    point: 3,
    match_date: '2025/03/15',
    section_no: '1',
    stadium: 'TestStadium',
    start_time: '15:00',
    status: '試合終了',
    live: false,
    ...overrides,
  };
}

/** Creates a TeamData with an optional match list; stats are NOT pre-calculated. */
export function makeTeamData(matches: TeamMatch[] = []): TeamData {
  return { df: matches };
}

/** Creates a SeasonInfo for a 4-team season with 1 promotion and 1 relegation slot. */
export function makeSeasonInfo(overrides: Partial<SeasonInfo> = {}): SeasonInfo {
  return {
    teamCount: 4,
    promotionCount: 1,
    relegationCount: 1,
    teams: ['TeamA', 'TeamB', 'TeamC', 'TeamD'],
    rankClass: {},
    extra: {},
    ...overrides,
  };
}
