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
