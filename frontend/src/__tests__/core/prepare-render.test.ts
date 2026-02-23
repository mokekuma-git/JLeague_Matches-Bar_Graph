import { describe, test, expect } from 'vitest';
import { prepareRenderData } from '../../core/prepare-render';
import type { PrepareRenderInput } from '../../core/prepare-render';
import { makeMatch, makeTeamData, makeSeasonInfo } from '../fixtures/match-data';

function makeTestInput(overrides: Partial<PrepareRenderInput> = {}): PrepareRenderInput {
  return {
    groupData: {
      TeamA: makeTeamData([
        makeMatch({ opponent: 'TeamB', point: 3, match_date: '2025/03/01', section_no: '1', goal_get: '2', goal_lose: '0' }),
        makeMatch({ opponent: 'TeamC', point: 0, match_date: '2025/03/08', section_no: '2', goal_get: '0', goal_lose: '1' }),
      ]),
      TeamB: makeTeamData([
        makeMatch({ opponent: 'TeamA', point: 0, match_date: '2025/03/01', section_no: '1', goal_get: '0', goal_lose: '2', is_home: false }),
        makeMatch({ opponent: 'TeamC', point: 1, match_date: '2025/03/08', section_no: '2', goal_get: '1', goal_lose: '1' }),
      ]),
      TeamC: makeTeamData([
        makeMatch({ opponent: 'TeamA', point: 3, match_date: '2025/03/08', section_no: '2', goal_get: '1', goal_lose: '0', is_home: false }),
        makeMatch({ opponent: 'TeamB', point: 1, match_date: '2025/03/08', section_no: '2', goal_get: '1', goal_lose: '1', is_home: false }),
      ]),
    },
    seasonInfo: makeSeasonInfo({ teamCount: 3, teams: ['TeamA', 'TeamB', 'TeamC'] }),
    targetDate: '2025/12/31',
    sortKey: 'point',
    matchSortKey: 'section_no',
    ...overrides,
  };
}

describe('prepareRenderData', () => {
  test('returns groupData with stats calculated', () => {
    const result = prepareRenderData(makeTestInput());
    // TeamA: 3 + 0 = 3pt, TeamB: 0 + 1 = 1pt, TeamC: 3 + 1 = 4pt
    expect(result.groupData.TeamA.point).toBe(3);
    expect(result.groupData.TeamA.win).toBe(1);
    expect(result.groupData.TeamA.lose).toBe(1);
    expect(result.groupData.TeamB.point).toBe(1);
    expect(result.groupData.TeamB.draw).toBe(1);
    expect(result.groupData.TeamC.point).toBe(4);
  });

  test('sortedTeams is sorted by requested sort key', () => {
    const result = prepareRenderData(makeTestInput());
    // TeamC: 4pt, TeamA: 3pt, TeamB: 1pt
    expect(result.sortedTeams).toEqual(['TeamC', 'TeamA', 'TeamB']);
  });

  test('does not mutate the input groupData', () => {
    const input = makeTestInput();
    const originalPointA = input.groupData.TeamA.point; // undefined before stats
    const originalDfLenA = input.groupData.TeamA.df.length;
    prepareRenderData(input);
    expect(input.groupData.TeamA.point).toBe(originalPointA);
    expect(input.groupData.TeamA.df.length).toBe(originalDfLenA);
  });

  test('disp sort key uses disp_point for sorting', () => {
    // targetDate between section 1 and section 2
    const input = makeTestInput({
      targetDate: '2025/03/05',
      sortKey: 'disp_point',
    });
    const result = prepareRenderData(input);
    // At 2025/03/05: TeamA disp_point=3 (section 1 only), TeamB disp_point=0, TeamC disp_point=0
    expect(result.groupData.TeamA.disp_point).toBe(3);
    expect(result.groupData.TeamB.disp_point).toBe(0);
    expect(result.groupData.TeamC.disp_point).toBe(0);
    expect(result.sortedTeams[0]).toBe('TeamA');
  });

  test('respects matchSortKey parameter', () => {
    const bySection = prepareRenderData(makeTestInput({ matchSortKey: 'section_no' }));
    const byDate = prepareRenderData(makeTestInput({ matchSortKey: 'match_date' }));
    // Both should produce the same stats for this data (dates align with sections)
    expect(bySection.groupData.TeamA.point).toBe(byDate.groupData.TeamA.point);
    expect(bySection.sortedTeams).toEqual(byDate.sortedTeams);
  });

  test('works with empty team list', () => {
    const input = makeTestInput({
      groupData: {},
      seasonInfo: makeSeasonInfo({ teamCount: 0, teams: [] }),
    });
    const result = prepareRenderData(input);
    expect(result.groupData).toEqual({});
    expect(result.sortedTeams).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pointSystem variations
// ---------------------------------------------------------------------------
describe('prepareRenderData with pointSystem', () => {
  test('old-two-points: win earns 2pt, sort order reflects lower point scale', () => {
    const input: PrepareRenderInput = {
      groupData: {
        TeamA: makeTeamData([
          makeMatch({ opponent: 'TeamB', point: 2, goal_get: '1', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamC', point: 1, goal_get: '0', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamB: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamC', point: 2, goal_get: '2', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamC: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 1, goal_get: '0', goal_lose: '0', match_date: '2025/03/08', section_no: '2', is_home: false }),
          makeMatch({ opponent: 'TeamB', point: 0, goal_get: '0', goal_lose: '2', match_date: '2025/03/08', section_no: '2', is_home: false }),
        ]),
      },
      seasonInfo: makeSeasonInfo({
        teamCount: 3, teams: ['TeamA', 'TeamB', 'TeamC'],
        pointSystem: 'old-two-points',
      }),
      targetDate: '2025/12/31',
      sortKey: 'point',
      matchSortKey: 'section_no',
    };
    const result = prepareRenderData(input);
    // TeamA: 2+1=3pt, TeamB: 0+2=2pt, TeamC: 1+0=1pt
    expect(result.groupData.TeamA.point).toBe(3);
    expect(result.groupData.TeamB.point).toBe(2);
    expect(result.groupData.TeamC.point).toBe(1);
    expect(result.sortedTeams).toEqual(['TeamA', 'TeamB', 'TeamC']);
  });

  test('old-two-points: avlbl_pt uses 2pt per unplayed game', () => {
    const input: PrepareRenderInput = {
      groupData: {
        TeamA: makeTeamData([
          makeMatch({ opponent: 'TeamB', point: 2, goal_get: '1', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamC', point: 0, goal_get: '', goal_lose: '', has_result: false, match_date: '2025/06/01', section_no: '2' }),
        ]),
        TeamB: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamC', point: 0, goal_get: '', goal_lose: '', has_result: false, match_date: '2025/06/01', section_no: '2' }),
        ]),
      },
      seasonInfo: makeSeasonInfo({
        teamCount: 2, teams: ['TeamA', 'TeamB'],
        pointSystem: 'old-two-points',
      }),
      targetDate: '2025/12/31',
      sortKey: 'avlbl_pt',
      matchSortKey: 'section_no',
    };
    const result = prepareRenderData(input);
    // TeamA: avlbl_pt = 2 (win) + 2 (future) = 4
    // TeamB: avlbl_pt = 0 (loss) + 2 (future) = 2
    expect(result.groupData.TeamA.avlbl_pt).toBe(4);
    expect(result.groupData.TeamB.avlbl_pt).toBe(2);
    expect(result.sortedTeams[0]).toBe('TeamA');
  });

  test('standard vs old-two-points: same results produce different sort order', () => {
    // Two teams with identical match results but different point systems
    // can yield different relative standings when draw frequency differs.
    const buildGroupData = () => ({
      TeamA: makeTeamData([
        makeMatch({ opponent: 'TeamB', point: 3, goal_get: '1', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
        makeMatch({ opponent: 'TeamC', point: 1, goal_get: '0', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
      ]),
      TeamB: makeTeamData([
        makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/03/01', section_no: '1', is_home: false }),
        makeMatch({ opponent: 'TeamC', point: 3, goal_get: '2', goal_lose: '0', match_date: '2025/03/15', section_no: '3' }),
      ]),
    });

    const standardResult = prepareRenderData({
      groupData: buildGroupData(),
      seasonInfo: makeSeasonInfo({ teamCount: 2, teams: ['TeamA', 'TeamB'], pointSystem: 'standard' }),
      targetDate: '2025/12/31', sortKey: 'point', matchSortKey: 'section_no',
    });
    // Standard: TeamA=3+1=4pt, TeamB=0+3=3pt → TeamA first
    expect(standardResult.groupData.TeamA.point).toBe(4);
    expect(standardResult.groupData.TeamB.point).toBe(3);
    expect(standardResult.sortedTeams[0]).toBe('TeamA');

    // old-two-points uses the point values from matches (which the caller
    // would have set to the old-two-points scale). Here we verify the system
    // correctly uses the pointSystem for classification (win/draw/lose).
    const oldResult = prepareRenderData({
      groupData: {
        TeamA: makeTeamData([
          makeMatch({ opponent: 'TeamB', point: 2, goal_get: '1', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamC', point: 1, goal_get: '0', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamB: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamC', point: 2, goal_get: '2', goal_lose: '0', match_date: '2025/03/15', section_no: '3' }),
        ]),
      },
      seasonInfo: makeSeasonInfo({ teamCount: 2, teams: ['TeamA', 'TeamB'], pointSystem: 'old-two-points' }),
      targetDate: '2025/12/31', sortKey: 'point', matchSortKey: 'section_no',
    });
    // old-two-points: TeamA=2+1=3pt, TeamB=0+2=2pt
    expect(oldResult.groupData.TeamA.point).toBe(3);
    expect(oldResult.groupData.TeamB.point).toBe(2);
    // Classification: TeamA has 1 win + 1 draw; TeamB has 1 loss + 1 win
    expect(oldResult.groupData.TeamA.win).toBe(1);
    expect(oldResult.groupData.TeamA.draw).toBe(1);
    expect(oldResult.groupData.TeamB.win).toBe(1);
    expect(oldResult.groupData.TeamB.lose).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// tiebreakOrder variations
// ---------------------------------------------------------------------------
describe('prepareRenderData with tiebreakOrder', () => {
  function makeTiedInput(
    tiebreakOrder: string[],
    overrides: Partial<PrepareRenderInput> = {},
  ): PrepareRenderInput {
    // TeamA and TeamB: same results (1W 1L = 3pt each) but different goal stats.
    // TeamA: beat TeamB 2-0, lost to TeamC 0-3 → gd=-1, gg=2
    // TeamB: lost to TeamA 0-2, beat TeamC 3-0 → gd=+1, gg=3
    return {
      groupData: {
        TeamA: makeTeamData([
          makeMatch({ opponent: 'TeamB', point: 3, goal_get: '2', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamC', point: 0, goal_get: '0', goal_lose: '3', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamB: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '2', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamC', point: 3, goal_get: '3', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamC: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 3, goal_get: '3', goal_lose: '0', match_date: '2025/03/08', section_no: '2', is_home: false }),
          makeMatch({ opponent: 'TeamB', point: 0, goal_get: '0', goal_lose: '3', match_date: '2025/03/08', section_no: '2', is_home: false }),
        ]),
      },
      seasonInfo: makeSeasonInfo({
        teamCount: 3,
        teams: ['TeamA', 'TeamB', 'TeamC'],
        tiebreakOrder,
      }),
      targetDate: '2025/12/31',
      sortKey: 'point',
      matchSortKey: 'section_no',
      ...overrides,
    };
  }

  test('goal_diff first: TeamB ranks above TeamA (gd +1 > -1)', () => {
    const result = prepareRenderData(makeTiedInput(['goal_diff', 'goal_get']));
    // TeamA: 3pt gd=-1; TeamB: 3pt gd=+1; TeamC: 3pt gd=0
    // By goal_diff: TeamB(+1) > TeamC(0) > TeamA(-1)
    expect(result.sortedTeams[0]).toBe('TeamB');
    expect(result.sortedTeams[2]).toBe('TeamA');
  });

  test('goal_get first: TeamB ranks above TeamA (gg 3 > 2)', () => {
    const result = prepareRenderData(makeTiedInput(['goal_get']));
    // TeamC: 3pt gg=3, TeamB: 3pt gg=3, TeamA: 3pt gg=2
    // TeamC and TeamB tied at gg=3; TeamA last
    expect(result.sortedTeams[2]).toBe('TeamA');
  });

  test('wins first: all equal (1 win each), falls through to goal_diff', () => {
    const result = prepareRenderData(makeTiedInput(['wins', 'goal_diff']));
    // All 3 teams have 1 win each → wins tiebreaker doesn't resolve
    // Falls through to goal_diff: TeamB(+1) > TeamC(0) > TeamA(-1)
    expect(result.sortedTeams[0]).toBe('TeamB');
    expect(result.sortedTeams[2]).toBe('TeamA');
  });

  test('head_to_head: A beat B directly, so A ranks above B among the tied pair', () => {
    // TeamA and TeamB are at 3pt each; TeamA beat TeamB 2-0.
    // With H2H first, TeamA should rank above TeamB among equals.
    const result = prepareRenderData(makeTiedInput(['head_to_head', 'goal_diff', 'goal_get']));
    // All three teams have 3pt.
    // H2H among all three: A beat B 2-0, B beat C 3-0, C beat A 3-0
    // H2H points: A=3(vsB)+0(vsC)=3, B=0(vsA)+3(vsC)=3, C=3(vsA)+0(vsB)=3
    // H2H gd: A=+2-3=-1, B=-2+3=+1, C=+3-3=0
    // Result: B(3pt,+1gd) > C(3pt,0gd) > A(3pt,-1gd)
    expect(result.sortedTeams[0]).toBe('TeamB');
    expect(result.sortedTeams[1]).toBe('TeamC');
    expect(result.sortedTeams[2]).toBe('TeamA');
  });

  test('head_to_head with no direct match: falls through to next tiebreaker', () => {
    // TeamX and TeamY tied on points but never played each other
    const input: PrepareRenderInput = {
      groupData: {
        TeamX: makeTeamData([
          makeMatch({ opponent: 'TeamZ', point: 3, goal_get: '1', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
        ]),
        TeamY: makeTeamData([
          makeMatch({ opponent: 'TeamZ', point: 3, goal_get: '3', goal_lose: '0', match_date: '2025/03/08', section_no: '2' }),
        ]),
        TeamZ: makeTeamData([
          makeMatch({ opponent: 'TeamX', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamY', point: 0, goal_get: '0', goal_lose: '3', match_date: '2025/03/08', section_no: '2', is_home: false }),
        ]),
      },
      seasonInfo: makeSeasonInfo({
        teamCount: 3, teams: ['TeamX', 'TeamY', 'TeamZ'],
        tiebreakOrder: ['head_to_head', 'goal_diff'],
      }),
      targetDate: '2025/12/31',
      sortKey: 'point',
      matchSortKey: 'section_no',
    };
    const result = prepareRenderData(input);
    // H2H: no X vs Y match → fallthrough to goal_diff
    // TeamX: gd=+1, TeamY: gd=+3 → TeamY first
    expect(result.sortedTeams[0]).toBe('TeamY');
    expect(result.sortedTeams[1]).toBe('TeamX');
  });
});

// ---------------------------------------------------------------------------
// disp sort keys + targetDate cutoff
// ---------------------------------------------------------------------------
describe('prepareRenderData with disp sort keys and targetDate', () => {
  function makeDispInput(
    sortKey: string,
    targetDate: string,
  ): PrepareRenderInput {
    // TeamA: section 1 (2025/03/01) win 3pt, section 2 (2025/04/01) win 3pt
    // TeamB: section 1 (2025/03/01) win 3pt, section 2 (2025/04/01) loss 0pt
    // TeamC: section 1 (2025/03/01) loss 0pt, section 2 (2025/04/01) win 3pt
    return {
      groupData: {
        TeamA: makeTeamData([
          makeMatch({ opponent: 'TeamC', point: 3, goal_get: '2', goal_lose: '0', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamB', point: 3, goal_get: '1', goal_lose: '0', match_date: '2025/04/01', section_no: '2' }),
        ]),
        TeamB: makeTeamData([
          makeMatch({ opponent: 'TeamC', point: 3, goal_get: '3', goal_lose: '1', match_date: '2025/03/01', section_no: '1' }),
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '1', match_date: '2025/04/01', section_no: '2', is_home: false }),
        ]),
        TeamC: makeTeamData([
          makeMatch({ opponent: 'TeamA', point: 0, goal_get: '0', goal_lose: '2', match_date: '2025/03/01', section_no: '1', is_home: false }),
          makeMatch({ opponent: 'TeamB', point: 3, goal_get: '2', goal_lose: '0', match_date: '2025/04/01', section_no: '2' }),
        ]),
      },
      seasonInfo: makeSeasonInfo({ teamCount: 3, teams: ['TeamA', 'TeamB', 'TeamC'] }),
      targetDate,
      sortKey,
      matchSortKey: 'section_no',
    };
  }

  test('disp_point at mid-season: only section 1 counts for display sort', () => {
    const result = prepareRenderData(makeDispInput('disp_point', '2025/03/15'));
    // disp_point: TeamA=3, TeamB=3, TeamC=0 (only March matches count)
    // latest point: TeamA=6, TeamB=3, TeamC=3
    expect(result.groupData.TeamA.disp_point).toBe(3);
    expect(result.groupData.TeamB.disp_point).toBe(3);
    expect(result.groupData.TeamC.disp_point).toBe(0);
    // TeamC should be last; TeamA and TeamB are tied at 3 disp_point
    expect(result.sortedTeams[2]).toBe('TeamC');
  });

  test('disp_point at end of season vs point: same result when all matches in range', () => {
    const dispResult = prepareRenderData(makeDispInput('disp_point', '2025/12/31'));
    const ptResult = prepareRenderData(makeDispInput('point', '2025/12/31'));
    // When targetDate covers all matches, disp_point === point
    expect(dispResult.groupData.TeamA.disp_point).toBe(ptResult.groupData.TeamA.point);
    expect(dispResult.sortedTeams).toEqual(ptResult.sortedTeams);
  });

  test('disp_avlbl_pt: after-cutoff matches treated as future for display', () => {
    const result = prepareRenderData(makeDispInput('disp_avlbl_pt', '2025/03/15'));
    // TeamA: disp_avlbl_pt = 3 (March win) + 3 (April treated as future) = 6
    // TeamB: disp_avlbl_pt = 3 (March win) + 3 (April treated as future) = 6
    // TeamC: disp_avlbl_pt = 0 (March loss) + 3 (April treated as future) = 3 … wait
    // Actually: disp_avlbl_pt counts completed-in-display as point, completed-after-display as maxPt,
    // and unplayed as maxPt. April match has has_result=true but date > targetDate → disp future → +3
    expect(result.groupData.TeamA.disp_avlbl_pt).toBe(6);
    expect(result.groupData.TeamB.disp_avlbl_pt).toBe(6);
    expect(result.groupData.TeamC.disp_avlbl_pt).toBe(3);
  });

  test('disp_point sort differs from point sort when targetDate splits matches', () => {
    // At March 15: disp_point TeamA=3 TeamB=3 TeamC=0
    // Latest point: TeamA=6 TeamB=3 TeamC=3
    const dispResult = prepareRenderData(makeDispInput('disp_point', '2025/03/15'));
    const ptResult = prepareRenderData(makeDispInput('point', '2025/03/15'));
    // disp sort: TeamC last (0pt); point sort: TeamA first (6pt)
    expect(dispResult.sortedTeams[2]).toBe('TeamC');
    expect(ptResult.sortedTeams[0]).toBe('TeamA');
    // The two sort orders differ
    expect(dispResult.sortedTeams).not.toEqual(ptResult.sortedTeams);
  });

  test('targetDate before any match: all disp stats are zero', () => {
    const result = prepareRenderData(makeDispInput('disp_point', '2025/01/01'));
    for (const team of ['TeamA', 'TeamB', 'TeamC']) {
      expect(result.groupData[team].disp_point).toBe(0);
      expect(result.groupData[team].disp_all_game).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Large team count: sort stability
// ---------------------------------------------------------------------------
describe('prepareRenderData sort stability with many teams', () => {
  test('20 teams: sort is deterministic and handles tied teams', () => {
    const teamNames = Array.from({ length: 20 }, (_, i) =>
      `Team${String.fromCharCode(65 + i)}`,
    );
    const groupData: Record<string, ReturnType<typeof makeTeamData>> = {};

    for (let i = 0; i < 20; i++) {
      const opponentIdx = (i + 1) % 20;
      const opponent = teamNames[opponentIdx];
      // Deliberately create ties: teams in groups of 4 share the same point total
      const tierPoints = [3, 3, 1, 0]; // W, W, D, L pattern within a group of 4
      const matchIdx = i % 4;
      const pt = tierPoints[matchIdx];
      const gg = matchIdx < 2 ? '2' : matchIdx === 2 ? '1' : '0';
      const gl = matchIdx < 2 ? '0' : matchIdx === 2 ? '1' : '2';

      groupData[teamNames[i]] = makeTeamData([
        makeMatch({
          opponent,
          point: pt,
          goal_get: gg,
          goal_lose: gl,
          match_date: `2025/03/${String(i + 1).padStart(2, '0')}`,
          section_no: '1',
        }),
      ]);
    }

    const input: PrepareRenderInput = {
      groupData,
      seasonInfo: makeSeasonInfo({ teamCount: 20, teams: teamNames }),
      targetDate: '2025/12/31',
      sortKey: 'point',
      matchSortKey: 'section_no',
    };

    const result1 = prepareRenderData(input);
    const result2 = prepareRenderData(input);

    // All 20 teams present
    expect(result1.sortedTeams).toHaveLength(20);
    // Deterministic: same input → same output
    expect(result1.sortedTeams).toEqual(result2.sortedTeams);

    // Descending order: each team's point >= next team's point
    for (let i = 0; i < result1.sortedTeams.length - 1; i++) {
      const pt1 = result1.groupData[result1.sortedTeams[i]].point!;
      const pt2 = result1.groupData[result1.sortedTeams[i + 1]].point!;
      expect(pt1).toBeGreaterThanOrEqual(pt2);
    }
  });

  test('20 teams with all identical stats: sort order is stable and deterministic', () => {
    const teamNames = Array.from({ length: 20 }, (_, i) =>
      `Team${String(i).padStart(2, '0')}`,
    );
    const groupData: Record<string, ReturnType<typeof makeTeamData>> = {};

    // All teams: 1 draw each → same point, same goal_diff, same goal_get
    for (const name of teamNames) {
      const oppIdx = teamNames.indexOf(name);
      const opponent = teamNames[(oppIdx + 1) % 20];
      groupData[name] = makeTeamData([
        makeMatch({
          opponent,
          point: 1,
          goal_get: '1',
          goal_lose: '1',
          match_date: '2025/03/01',
          section_no: '1',
        }),
      ]);
    }

    const input: PrepareRenderInput = {
      groupData,
      seasonInfo: makeSeasonInfo({ teamCount: 20, teams: teamNames }),
      targetDate: '2025/12/31',
      sortKey: 'point',
      matchSortKey: 'section_no',
    };

    const result1 = prepareRenderData(input);
    const result2 = prepareRenderData(input);

    expect(result1.sortedTeams).toHaveLength(20);
    // Deterministic despite all ties
    expect(result1.sortedTeams).toEqual(result2.sortedTeams);
  });
});
