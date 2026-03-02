import { describe, test, expect } from 'vitest';
import { buildCrossGroupRows } from '../../ranking/rank-table';
import type { GroupRenderResult } from '../../ranking/rank-table';
import type { CrossGroupStanding } from '../../types/season';
import { TeamStats } from '../../types/match';
import type { TeamData, TeamMatch } from '../../types/match';

// ---- Test helpers --------------------------------------------------------

function makeMatch(overrides: Partial<TeamMatch> = {}): TeamMatch {
  return {
    is_home: true, opponent: 'Opp', goal_get: 2, goal_lose: 1,
    pk_get: null, pk_lose: null, score_ex_get: null, score_ex_lose: null,
    has_result: true, point: 3, match_date: '2022/04/01', section_no: 1,
    stadium: 'Stadium', start_time: '15:00', status: '試合終了', live: false,
    ...overrides,
  };
}

/** Build a TeamData with pre-populated latestStats (bypasses calculateTeamStats). */
function buildTeamData(
  stats: { point: number; avlbl_pt: number; all_game: number;
    goal_diff?: number; goal_get?: number;
    win?: number; draw?: number; loss?: number },
  matches: TeamMatch[] = [],
): TeamData {
  const s = new TeamStats();
  s.point = stats.point; s.avlbl_pt = stats.avlbl_pt; s.all_game = stats.all_game;
  s.goal_diff = stats.goal_diff ?? 0; s.goal_get = stats.goal_get ?? 0;
  s.resultCounts.win = stats.win ?? 0;
  s.resultCounts.draw = stats.draw ?? 0;
  s.resultCounts.loss = stats.loss ?? 0;
  s.avrg_pt = stats.all_game > 0 ? stats.point / stats.all_game : 0;
  // displayStats = latestStats copy for simplicity
  const d = new TeamStats();
  Object.assign(d, { ...s, resultCounts: { ...s.resultCounts } });
  return { df: matches, latestStats: s, displayStats: d };
}

// ---- Tests ---------------------------------------------------------------

describe('buildCrossGroupRows', () => {
  // 3 groups × 4 teams, standard 3pt system.
  // Sorted teams per group: [1st, 2nd, 3rd, 4th].
  function makeThreeGroupResults(): Record<string, GroupRenderResult> {
    return {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3, goal_diff: 5, goal_get: 7 }),
          A2: buildTeamData({ point: 6, avlbl_pt: 6, all_game: 3, win: 2, loss: 1, goal_diff: 2, goal_get: 5 }),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2, goal_diff: -1, goal_get: 3 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3, goal_diff: -6, goal_get: 1 }),
        },
      },
      B: {
        sortedTeams: ['B1', 'B2', 'B3', 'B4'],
        groupData: {
          B1: buildTeamData({ point: 7, avlbl_pt: 7, all_game: 3, win: 2, draw: 1, goal_diff: 4, goal_get: 6 }),
          B2: buildTeamData({ point: 5, avlbl_pt: 5, all_game: 3, win: 1, draw: 2, goal_diff: 1, goal_get: 4 }),
          B3: buildTeamData({ point: 4, avlbl_pt: 4, all_game: 3, win: 1, draw: 1, loss: 1, goal_diff: 0, goal_get: 3 }),
          B4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3, goal_diff: -5, goal_get: 2 }),
        },
      },
      C: {
        sortedTeams: ['C1', 'C2', 'C3', 'C4'],
        groupData: {
          C1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3, goal_diff: 6, goal_get: 8 }),
          C2: buildTeamData({ point: 4, avlbl_pt: 4, all_game: 3, win: 1, draw: 1, loss: 1, goal_diff: 0, goal_get: 3 }),
          C3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2, goal_diff: -2, goal_get: 2 }),
          C4: buildTeamData({ point: 1, avlbl_pt: 1, all_game: 3, draw: 1, loss: 2, goal_diff: -4, goal_get: 1 }),
        },
      },
    };
  }

  test('extracts 2nd-place teams and sorts by points desc', () => {
    const results = makeThreeGroupResults();
    const config: CrossGroupStanding = { position: 2 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    expect(rows).toHaveLength(3);
    // A2: 6pt, B2: 5pt, C2: 4pt
    expect(rows[0].rank).toBe('A');
    expect(rows[0].point).toBe(6);
    expect(rows[1].rank).toBe('B');
    expect(rows[1].point).toBe(5);
    expect(rows[2].rank).toBe('C');
    expect(rows[2].point).toBe(4);
  });

  test('sorts by goal_diff then goal_get when points tied', () => {
    const results = makeThreeGroupResults();
    // Make B2 and C2 same points, different goal_diff
    results.B.groupData.B2 = buildTeamData({
      point: 4, avlbl_pt: 4, all_game: 3, win: 1, draw: 1, loss: 1,
      goal_diff: -1, goal_get: 2,
    });
    // C2 already has point=4, goal_diff=0, goal_get=3
    const config: CrossGroupStanding = { position: 2 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    // A2: 6pt, then C2: 4pt/gd=0 before B2: 4pt/gd=-1
    expect(rows[0].rank).toBe('A');
    expect(rows[1].rank).toBe('C');
    expect(rows[2].rank).toBe('B');
  });

  test('skips group when position exceeds team count', () => {
    const results = makeThreeGroupResults();
    // Group C has only 2 teams
    results.C.sortedTeams = ['C1', 'C2'];
    const config: CrossGroupStanding = { position: 3 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    // Only A3 and B3
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.rank).sort()).toEqual(['A', 'B']);
  });

  test('populates all BaseRankRow fields', () => {
    const results = makeThreeGroupResults();
    const config: CrossGroupStanding = { position: 2 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);
    const a2 = rows.find(r => r.rank === 'A')!;

    expect(a2.point).toBe(6);
    expect(a2.win).toBe(2);
    expect(a2.draw).toBe(0);
    expect(a2.loss).toBe(1);
    expect(a2.goal_diff).toBe(2);
    expect(a2.goal_get).toBe(5);
    expect(a2.goal_lose).toBe(3); // goal_get - goal_diff
    expect(a2.all_game).toBe(3);
    expect(a2.avrg_pt).toBe('2.00');
    expect(a2.name).toContain('A2');
  });

  // ---- exclude_from_rank tests ----

  test('exclude_from_rank=4 recalculates stats without 4th-place matches', () => {
    // Build group with real match data for the 2nd-place team
    const a2Matches: TeamMatch[] = [
      // vs A1: loss (0-2)
      makeMatch({ opponent: 'A1', goal_get: 0, goal_lose: 2, point: 0 }),
      // vs A3: win (3-1)
      makeMatch({ opponent: 'A3', goal_get: 3, goal_lose: 1, point: 3 }),
      // vs A4: win (4-0) — this should be excluded
      makeMatch({ opponent: 'A4', goal_get: 4, goal_lose: 0, point: 3 }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData({ point: 6, avlbl_pt: 6, all_game: 3, win: 2, loss: 1 }, a2Matches),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2, exclude_from_rank: 4 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    expect(rows).toHaveLength(1);
    const a2 = rows[0];
    // Without A4 match: 1 loss (vs A1) + 1 win (vs A3) = 3pt, 2 games
    expect(a2.point).toBe(3);
    expect(a2.all_game).toBe(2);
    expect(a2.win).toBe(1);
    expect(a2.loss).toBe(1);
    expect(a2.goal_get).toBe(3);  // 0 + 3 = 3 (A4 match excluded)
    expect(a2.goal_lose).toBe(3); // 2 + 1 = 3
    expect(a2.goal_diff).toBe(0);
    expect(a2.future_game).toBe(0);
  });

  test('no exclude_from_rank uses pre-calculated stats', () => {
    const a2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'A1', goal_get: 0, goal_lose: 2, point: 0 }),
      makeMatch({ opponent: 'A3', goal_get: 3, goal_lose: 1, point: 3 }),
      makeMatch({ opponent: 'A4', goal_get: 4, goal_lose: 0, point: 3 }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData(
            { point: 6, avlbl_pt: 6, all_game: 3, win: 2, loss: 1, goal_get: 7, goal_diff: 4 },
            a2Matches,
          ),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    // Uses latestStats, not recalculated from df
    expect(rows[0].point).toBe(6);
    expect(rows[0].all_game).toBe(3);
    expect(rows[0].goal_get).toBe(7);
  });

  test('exclude_from_rank skips exclusion for groups with fewer teams than the rank', () => {
    // Group A: 4 teams → exclude 4th (A4)
    // Group B: 3 teams (withdrawal) → no rank 4 → no exclusion
    const a2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'A1', goal_get: 0, goal_lose: 2, point: 0 }),
      makeMatch({ opponent: 'A3', goal_get: 3, goal_lose: 1, point: 3 }),
      makeMatch({ opponent: 'A4', goal_get: 4, goal_lose: 0, point: 3 }),
    ];
    const b2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'B1', goal_get: 1, goal_lose: 2, point: 0 }),
      makeMatch({ opponent: 'B3', goal_get: 2, goal_lose: 0, point: 3 }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData({ point: 6, avlbl_pt: 6, all_game: 3, win: 2, loss: 1 }, a2Matches),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
      B: {
        sortedTeams: ['B1', 'B2', 'B3'],
        groupData: {
          B1: buildTeamData({ point: 6, avlbl_pt: 6, all_game: 2, win: 2 }),
          B2: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 2, win: 1, loss: 1, goal_get: 3, goal_diff: 1 }, b2Matches),
          B3: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 2, loss: 2 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2, exclude_from_rank: 4 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    expect(rows).toHaveLength(2);

    const a2 = rows.find(r => r.rank === 'A')!;
    // Group A (4 teams): rank 4 excluded → recalc without A4
    expect(a2.all_game).toBe(2);
    expect(a2.point).toBe(3); // vs A1 loss + vs A3 win

    const b2 = rows.find(r => r.rank === 'B')!;
    // Group B (3 teams): no rank 4 → uses all matches (pre-calculated stats)
    expect(b2.all_game).toBe(2);
    expect(b2.point).toBe(3); // vs B1 loss + vs B3 win (all included)
    expect(b2.goal_get).toBe(3); // 1 + 2 = 3
  });

  test('exclude_from_rank with unplayed matches counts them as future', () => {
    const a2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'A1', goal_get: 0, goal_lose: 2, point: 0 }),
      makeMatch({ opponent: 'A3', goal_get: 3, goal_lose: 1, point: 3 }),
      // vs A4: unplayed — should be excluded entirely
      makeMatch({ opponent: 'A4', has_result: false, goal_get: null, goal_lose: null, point: 0 }),
      // vs A3: unplayed — should remain as future
      makeMatch({ opponent: 'A3', has_result: false, goal_get: null, goal_lose: null, point: 0 }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData({ point: 3, avlbl_pt: 9, all_game: 2, win: 1, loss: 1 }, a2Matches),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2, exclude_from_rank: 4 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    const a2 = rows[0];
    expect(a2.all_game).toBe(2);     // 2 played (vs A1, A3)
    expect(a2.future_game).toBe(1);  // 1 unplayed vs A3 (A4 match removed)
    expect(a2.avlbl_pt).toBe(6);     // 3 + 1*3
  });

  test('disp mode filters by targetDate in recalc', () => {
    const a2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'A1', goal_get: 0, goal_lose: 2, point: 0, match_date: '2022/04/01' }),
      makeMatch({ opponent: 'A3', goal_get: 3, goal_lose: 1, point: 3, match_date: '2022/05/01' }),
      makeMatch({ opponent: 'A4', goal_get: 2, goal_lose: 0, point: 3, match_date: '2022/04/10' }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData({ point: 6, avlbl_pt: 6, all_game: 3, win: 2, loss: 1 }, a2Matches),
          A3: buildTeamData({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2, exclude_from_rank: 4 };

    // A4 excluded by rank. Remaining: vs A1 (04/01), vs A3 (05/01).
    // In disp mode with targetDate='2022/04/15':
    // vs A1 (04/01) → played → point=0, goal 0-2, loss
    // vs A3 (05/01) → future
    const rows = buildCrossGroupRows(results, config, true, '2022/04/15', 3);
    const a2 = rows[0];
    expect(a2.all_game).toBe(1);
    expect(a2.point).toBe(0);
    expect(a2.future_game).toBe(1);
  });

  test('match_date "未定" treated as unplayed even with has_result', () => {
    const a2Matches: TeamMatch[] = [
      makeMatch({ opponent: 'A1', goal_get: 1, goal_lose: 0, point: 3 }),
      makeMatch({ opponent: 'A3', goal_get: 2, goal_lose: 2, point: 1, match_date: '未定', has_result: true }),
      makeMatch({ opponent: 'A4', goal_get: 3, goal_lose: 0, point: 3 }),
    ];
    const results: Record<string, GroupRenderResult> = {
      A: {
        sortedTeams: ['A1', 'A2', 'A3', 'A4'],
        groupData: {
          A1: buildTeamData({ point: 9, avlbl_pt: 9, all_game: 3, win: 3 }),
          A2: buildTeamData({ point: 7, avlbl_pt: 7, all_game: 3, win: 2, draw: 1 }, a2Matches),
          A3: buildTeamData({ point: 1, avlbl_pt: 1, all_game: 3, draw: 1, loss: 2 }),
          A4: buildTeamData({ point: 0, avlbl_pt: 0, all_game: 3, loss: 3 }),
        },
      },
    };
    const config: CrossGroupStanding = { position: 2, exclude_from_rank: 4 };
    const rows = buildCrossGroupRows(results, config, false, '9999/12/31', 3);

    // A4 excluded by rank. Remaining: vs A1 (win, 3pt), vs A3 (未定 → unplayed)
    // 未定 match treated as future regardless of has_result
    expect(rows[0].all_game).toBe(1);
    expect(rows[0].point).toBe(3);
    expect(rows[0].future_game).toBe(1);
  });
});
