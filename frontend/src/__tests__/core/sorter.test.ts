import { describe, test, expect } from 'vitest';
import {
  calcCompare,
  getTeamAttr,
  getSortedTeamList,
  getPointSortedTeamList,
  getSafetyLine,
  getPossibleLine,
  getSelfPossibleLine,
} from '../../core/sorter';
import { makeTeamData } from '../fixtures/match-data';

// Helper: build TeamData with pre-filled stat fields (no matches needed for sorter tests).
function makeStats(overrides: Record<string, number | Record<string, number>> = {}) {
  return {
    ...makeTeamData(),
    point: 0,
    avlbl_pt: 0,
    disp_point: 0,
    disp_avlbl_pt: 0,
    goal_diff: 0,
    goal_get: 0,
    disp_goal_diff: 0,
    disp_goal_get: 0,
    rest_games: {} as Record<string, number>,
    disp_rest_games: {} as Record<string, number>,
    ...overrides,
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

describe('getTeamAttr', () => {
  test('returns the plain attribute when disp=false', () => {
    const td = makeStats({ goal_diff: 5, disp_goal_diff: 99 });
    expect(getTeamAttr(td, 'goal_diff', false)).toBe(5);
  });

  test('returns the disp_ attribute when disp=true', () => {
    const td = makeStats({ goal_diff: 5, disp_goal_diff: 99 });
    expect(getTeamAttr(td, 'goal_diff', true)).toBe(99);
  });

  test('returns 0 for missing attribute', () => {
    const td = makeTeamData();
    expect(getTeamAttr(td, 'goal_diff', false)).toBe(0);
  });
});

describe('getPointSortedTeamList', () => {
  test('sorts by the given key descending', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 30 }),
      TeamB: makeStats({ avlbl_pt: 45 }),
      TeamC: makeStats({ avlbl_pt: 15 }),
    };
    const result = getPointSortedTeamList('avlbl_pt', teams);
    expect(result).toEqual(['TeamB', 'TeamA', 'TeamC']);
  });

  test('handles equal values stably by key order', () => {
    const teams = {
      TeamA: makeStats({ point: 10 }),
      TeamB: makeStats({ point: 10 }),
    };
    const result = getPointSortedTeamList('point', teams);
    expect(result).toHaveLength(2);
    expect(result).toContain('TeamA');
    expect(result).toContain('TeamB');
  });
});

describe('getSortedTeamList', () => {
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

  test('disp_ variants use disp fields for tiebreakers', () => {
    const teams = {
      TeamA: makeStats({ disp_point: 10, disp_goal_diff: 5, disp_goal_get: 18 }),
      TeamB: makeStats({ disp_point: 10, disp_goal_diff: 8, disp_goal_get: 20 }),
    };
    const result = getSortedTeamList(teams, 'disp_point');
    expect(result[0]).toBe('TeamB'); // higher disp_goal_diff
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

  test('disp=true uses disp_avlbl_pt', () => {
    const teams = {
      TeamA: makeStats({ avlbl_pt: 80, disp_avlbl_pt: 50 }),
      TeamB: makeStats({ avlbl_pt: 60, disp_avlbl_pt: 30 }),
    };
    expect(getSafetyLine(1, true, teams)).toBe(31); // based on disp_avlbl_pt=30 of 2nd
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

  test('disp=true uses disp_point', () => {
    const teams = {
      TeamA: makeStats({ point: 50, disp_point: 25 }),
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
});
