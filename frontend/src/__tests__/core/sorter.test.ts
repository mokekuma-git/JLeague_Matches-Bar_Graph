import { describe, test, expect } from 'vitest';
import {
  calcCompare,
  getStats,
  getSortedTeamList,
  getSafetyLine,
  getPossibleLine,
  getSelfPossibleLine,
} from '../../core/sorter';
import { makeTeamData, makeMatch } from '../fixtures/match-data';
import type { TeamData, TeamMatch } from '../../types/match';
import { TeamStats } from '../../types/match';

/** Populate a TeamStats instance from a partial spec. */
interface StatsInput {
  point?: number;
  avlbl_pt?: number;
  goal_diff?: number;
  goal_get?: number;
  win?: number;
  rest_games?: Record<string, number>;
}

function buildTeamStats(input: StatsInput = {}): TeamStats {
  const s = new TeamStats();
  s.point = input.point ?? 0;
  s.avlbl_pt = input.avlbl_pt ?? 0;
  s.goal_diff = input.goal_diff ?? 0;
  s.goal_get = input.goal_get ?? 0;
  if (input.win !== undefined) s.resultCounts.win = input.win;
  if (input.rest_games) s.rest_games = input.rest_games;
  return s;
}

// Helper: build TeamData with pre-filled latestStats and displayStats.
function makeStats(latest: StatsInput = {}, display?: StatsInput): TeamData {
  return {
    df: [],
    latestStats: buildTeamStats(latest),
    displayStats: buildTeamStats(display ?? latest),
  };
}

/** Build a TeamData with matches and pre-filled stats for H2H tests. */
function makeTeamWithMatches(
  matches: TeamMatch[],
  latest: StatsInput = {},
  display?: StatsInput,
): TeamData {
  return {
    df: matches,
    latestStats: buildTeamStats(latest),
    displayStats: buildTeamStats(display ?? latest),
  };
}

describe('calcCompare', () => {
  test('returns positive when valA < valB (b before a in descending sort)', () => {
    expect(calcCompare(1, 3)).toBeGreaterThan(0);
  });
  test('returns negative when valA > valB', () => {
    expect(calcCompare(5, 2)).toBeLessThan(0);
  });
  test('returns 0 when equal', () => {
    expect(calcCompare(4, 4)).toBe(0);
  });
  test('treats undefined as 0', () => {
    expect(calcCompare(undefined, 3)).toBeGreaterThan(0);
    expect(calcCompare(3, undefined)).toBeLessThan(0);
    expect(calcCompare(undefined, undefined)).toBe(0);
  });
});

describe('getStats', () => {
  test('returns latestStats when disp=false', () => {
    const td = makeStats({ goal_diff: 5 }, { goal_diff: 99 });
    const s = getStats(td, false);
    expect(s.goal_diff).toBe(5);
  });

  test('returns displayStats when disp=true', () => {
    const td = makeStats({ goal_diff: 5 }, { goal_diff: 99 });
    const s = getStats(td, true);
    expect(s.goal_diff).toBe(99);
  });

  test('returns zero-initialized stats for fresh TeamData', () => {
    const td = makeTeamData();
    const s = getStats(td, false);
    expect(s.goal_diff).toBe(0);
  });
});

describe('getSortedTeamList', () => {
  test('throws on unknown sort field', () => {
    const teams = { TeamA: makeStats({ point: 10 }) };
    expect(() => getSortedTeamList(teams, 'unknown_field')).toThrow('Unknown sort field');
  });

  test('sorts by point descending', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 5, goal_get: 20 }),
      TeamB: makeStats({ point: 30, goal_diff: 3, goal_get: 15 }),
      TeamC: makeStats({ point: 10, goal_diff: 1, goal_get: 10 }),
    };
    expect(getSortedTeamList(teams, 'point')[0]).toBe('TeamB');
    expect(getSortedTeamList(teams, 'point')[2]).toBe('TeamC');
  });

  test('tiebreaker: goal_diff wins over same point', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 5, goal_get: 20 }),
      TeamB: makeStats({ point: 20, goal_diff: 10, goal_get: 25 }),
    };
    const result = getSortedTeamList(teams, 'point');
    expect(result[0]).toBe('TeamB'); // higher goal_diff wins
  });

  test('tiebreaker: goal_get wins when goal_diff also tied', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 5, goal_get: 18 }),
      TeamB: makeStats({ point: 20, goal_diff: 5, goal_get: 25 }),
    };
    const result = getSortedTeamList(teams, 'point');
    expect(result[0]).toBe('TeamB');
  });

  test('avlbl_pt sort uses point as secondary tiebreaker', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 30, point: 10, goal_diff: 0, goal_get: 0 }),
      TeamB: makeStats({ avlbl_pt: 30, point: 20, goal_diff: 0, goal_get: 0 }),
    };
    const result = getSortedTeamList(teams, 'avlbl_pt');
    expect(result[0]).toBe('TeamB'); // same avlbl_pt, higher point wins
  });

  test('disp_ variants use displayStats for tiebreakers', () => {
    const teams = {
      TeamA: makeStats({}, { point: 10, goal_diff: 5, goal_get: 18 }),
      TeamB: makeStats({}, { point: 10, goal_diff: 8, goal_get: 20 }),
    };
    const result = getSortedTeamList(teams, 'disp_point');
    expect(result[0]).toBe('TeamB'); // higher displayStats.goal_diff
  });
});

describe('getSafetyLine', () => {
  test('returns avlbl_pt of rank-th team + 1', () => {
    // For rank=1 champion line: need to beat the 2nd-place team's avlbl_pt.
    const teams = {
      TeamA: makeStats({ avlbl_pt: 80 }),
      TeamB: makeStats({ avlbl_pt: 60 }),
      TeamC: makeStats({ avlbl_pt: 40 }),
    };
    // 2nd in avlbl_pt order is TeamB (60), so safety line for rank=1 → 61
    expect(getSafetyLine(1, false, teams)).toBe(61);
  });

  test('returns 0 when rank >= number of teams (no competitor)', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 80 }),
    };
    expect(getSafetyLine(1, false, teams)).toBe(0);
  });

  test('disp=true uses displayStats.avlbl_pt', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 80 }, { avlbl_pt: 50 }),
      TeamB: makeStats({ avlbl_pt: 60 }, { avlbl_pt: 30 }),
    };
    expect(getSafetyLine(1, true, teams)).toBe(31); // based on displayStats.avlbl_pt=30 of 2nd
  });
});

describe('getPossibleLine', () => {
  test('returns the current point of the team at rank', () => {
    const teams = {
      TeamA: makeStats({ point: 50 }),
      TeamB: makeStats({ point: 35 }),
      TeamC: makeStats({ point: 20 }),
    };
    // Rank 1 = TeamA (50), rank 2 = TeamB (35)
    expect(getPossibleLine(1, false, teams)).toBe(50);
    expect(getPossibleLine(2, false, teams)).toBe(35);
  });

  test('returns 0 when rank is out of bounds', () => {
    const teams = { TeamA: makeStats({ point: 50 }) };
    expect(getPossibleLine(5, false, teams)).toBe(0);
  });

  test('disp=true uses displayStats.point', () => {
    const teams = {
      TeamA: makeStats({ point: 50 }, { point: 25 }),
    };
    expect(getPossibleLine(1, true, teams)).toBe(25);
  });
});

describe('getSelfPossibleLine', () => {
  test("reduces opponents' avlbl_pt for remaining head-to-head fixtures", () => {
    // TeamA has 2 remaining games vs TeamB; TeamB has avlbl_pt=30.
    // After assuming TeamA wins both, TeamB's avlbl_pt should drop by 6.
    const teams = {
      TeamA: makeStats({ avlbl_pt: 40, rest_games: { TeamB: 2 } }),
      TeamB: makeStats({ avlbl_pt: 30, rest_games: { TeamA: 2 } }),
      TeamC: makeStats({ avlbl_pt: 20, rest_games: {} }),
    };
    // We test that TeamA can self-secure rank 1: after TeamA wins all vs TeamB,
    // the 1st competitor (TeamB in the pre-reduction sort order) has avlbl_pt = 30 - 6 = 24.
    const selfLine = getSelfPossibleLine(1, 'TeamA', false, teams);
    expect(selfLine).toBe(24);
  });

  test('returns 0 when rank index exceeds remaining competitors', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 40, rest_games: {} }),
    };
    expect(getSelfPossibleLine(1, 'TeamA', false, teams)).toBe(0);
  });

  test('old-two-points: reduces opponents by 2pt per game instead of 3', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 20, rest_games: { TeamB: 2 } }),
      TeamB: makeStats({ avlbl_pt: 18, rest_games: { TeamA: 2 } }),
      TeamC: makeStats({ avlbl_pt: 10, rest_games: {} }),
    };
    // TeamA wins 2 vs TeamB → TeamB loses 2*2=4pt → 18-4=14
    const selfLine = getSelfPossibleLine(1, 'TeamA', false, teams, 'old-two-points');
    expect(selfLine).toBe(14);
  });
});

// ---- getSortedTeamList with tiebreakOrder ---------------------------------

describe('getSortedTeamList tiebreakOrder', () => {
  test('default tiebreakOrder ["goal_diff", "goal_get"] preserves existing behavior', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 5, goal_get: 18 }),
      TeamB: makeStats({ point: 20, goal_diff: 5, goal_get: 25 }),
    };
    const result = getSortedTeamList(teams, 'point');
    expect(result[0]).toBe('TeamB');
  });

  test('tiebreakOrder ["goal_get"] skips goal_diff', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 10, goal_get: 18 }),
      TeamB: makeStats({ point: 20, goal_diff: 5, goal_get: 25 }),
    };
    // With only goal_get as tiebreaker, TeamB (25) beats TeamA (18)
    // even though TeamA has a better goal_diff
    const result = getSortedTeamList(teams, 'point', ['goal_get']);
    expect(result[0]).toBe('TeamB');
  });

  test('tiebreakOrder ["wins", "goal_diff"] uses wins first', () => {
    const teams = {
      TeamA: makeStats({ point: 20, win: 6, goal_diff: 10, goal_get: 20 }),
      TeamB: makeStats({ point: 20, win: 5, goal_diff: 15, goal_get: 25 }),
    };
    // wins: TeamA (6) > TeamB (5) → TeamA first
    const result = getSortedTeamList(teams, 'point', ['wins', 'goal_diff']);
    expect(result[0]).toBe('TeamA');
  });

  test('H2H 2 teams: direct result decides', () => {
    // TeamA and TeamB tied on points, but TeamA beat TeamB 2-1
    const teams = {
      TeamA: makeTeamWithMatches(
        [
          makeMatch({ opponent: 'TeamB', goal_get: 2, goal_lose: 1, point: 3, is_home: true }),
          makeMatch({ opponent: 'TeamC', goal_get: 0, goal_lose: 1, point: 0 }),
        ],
        { point: 3, goal_diff: 0, goal_get: 2, win: 1 },
      ),
      TeamB: makeTeamWithMatches(
        [
          makeMatch({ opponent: 'TeamA', goal_get: 1, goal_lose: 2, point: 0, is_home: false }),
          makeMatch({ opponent: 'TeamC', goal_get: 3, goal_lose: 0, point: 3 }),
        ],
        { point: 3, goal_diff: 0, goal_get: 4, win: 1 },
      ),
      TeamC: makeTeamWithMatches([], { point: 0, goal_diff: -4, goal_get: 0 }),
    };
    // With default tiebreakers: goal_diff tied (0 = 0), goal_get TeamB > TeamA → TeamB first.
    // With H2H: TeamA beat TeamB → TeamA first.
    const result = getSortedTeamList(teams, 'point', ['head_to_head', 'goal_diff', 'goal_get']);
    expect(result[0]).toBe('TeamA');
    expect(result[1]).toBe('TeamB');
  });

  test('H2H 3 teams: mini-table decides', () => {
    // Three-way tie: A beat B, B beat C, C beat A — all 3 pts each
    // H2H mini-table: A(3pts,+1gd), B(3pts,+1gd), C(3pts,+1gd) → still tied
    // But with different H2H goal differences we can distinguish:
    // A beat B 2-0, B beat C 3-1, C beat A 1-0
    // H2H: A: 3pts +2gd (from B) + 0pts -1gd (from C) = 3pts, +1gd
    //       B: 0pts -2gd (from A) + 3pts +2gd (from C) = 3pts, 0gd
    //       C: 3pts +1gd (from A) + 0pts -2gd (from B) = 3pts, -1gd
    // All 3pts → sub-tie by H2H goal diff: A(+1) > B(0) > C(-1)
    const teams = {
      TeamA: makeTeamWithMatches(
        [
          makeMatch({ opponent: 'TeamB', goal_get: 2, goal_lose: 0, point: 3 }),
          makeMatch({ opponent: 'TeamC', goal_get: 0, goal_lose: 1, point: 0 }),
        ],
        { point: 6, goal_diff: 5, goal_get: 10 },
      ),
      TeamB: makeTeamWithMatches(
        [
          makeMatch({ opponent: 'TeamA', goal_get: 0, goal_lose: 2, point: 0 }),
          makeMatch({ opponent: 'TeamC', goal_get: 3, goal_lose: 1, point: 3 }),
        ],
        { point: 6, goal_diff: 5, goal_get: 10 },
      ),
      TeamC: makeTeamWithMatches(
        [
          makeMatch({ opponent: 'TeamA', goal_get: 1, goal_lose: 0, point: 3 }),
          makeMatch({ opponent: 'TeamB', goal_get: 1, goal_lose: 3, point: 0 }),
        ],
        { point: 6, goal_diff: 5, goal_get: 10 },
      ),
    };
    const result = getSortedTeamList(teams, 'point', ['head_to_head', 'goal_diff', 'goal_get']);
    expect(result[0]).toBe('TeamA');
    expect(result[1]).toBe('TeamB');
    expect(result[2]).toBe('TeamC');
  });

  test('H2H fallthrough when no direct matches exist', () => {
    // TeamA and TeamB tied on points but have not played each other
    const teams = {
      TeamA: makeTeamWithMatches(
        [makeMatch({ opponent: 'TeamC', goal_get: 1, goal_lose: 0, point: 3 })],
        { point: 3, goal_diff: 1, goal_get: 1 },
      ),
      TeamB: makeTeamWithMatches(
        [makeMatch({ opponent: 'TeamC', goal_get: 3, goal_lose: 0, point: 3 })],
        { point: 3, goal_diff: 3, goal_get: 3 },
      ),
      TeamC: makeTeamWithMatches([], { point: 0, goal_diff: -4, goal_get: 0 }),
    };
    // H2H returns null (no A vs B match) → falls through to goal_diff → TeamB first
    const result = getSortedTeamList(teams, 'point', ['head_to_head', 'goal_diff', 'goal_get']);
    expect(result[0]).toBe('TeamB');
    expect(result[1]).toBe('TeamA');
  });

  test('unknown tiebreaker key is skipped (treated as no-op)', () => {
    const teams = {
      TeamA: makeStats({ point: 20, goal_diff: 5, goal_get: 20 }),
      TeamB: makeStats({ point: 20, goal_diff: 10, goal_get: 25 }),
    };
    // 'unknown_key' is ignored, then goal_diff resolves
    const result = getSortedTeamList(teams, 'point', ['unknown_key', 'goal_diff']);
    expect(result[0]).toBe('TeamB');
  });
});
