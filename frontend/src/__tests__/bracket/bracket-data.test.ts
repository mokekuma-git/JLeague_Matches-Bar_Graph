import { describe, it, expect } from 'vitest';
import { buildBracket } from '../../bracket/bracket-data';
import type { RawMatchRow } from '../../types/match';

function makeRow(overrides: Partial<RawMatchRow>): RawMatchRow {
  return {
    match_date: '2024/12/08',
    section_no: '98',
    match_index_in_section: '1',
    start_time: '12:00',
    stadium: 'Test Stadium',
    home_team: '',
    home_goal: '',
    away_goal: '',
    away_team: '',
    status: '試合終了',
    ...overrides,
  };
}

describe('buildBracket', () => {
  it('throws if bracket_order has fewer than 2 teams', () => {
    expect(() => buildBracket([], ['A'])).toThrow('at least 2 teams');
  });

  it('builds a 2-team bracket (final only)', () => {
    const rows = [
      makeRow({
        home_team: '浦和', away_team: '東京NB',
        home_goal: '3', away_goal: '3',
        home_pk_score: '4', away_pk_score: '2',
        round: '決勝', section_no: '99',
      }),
    ];
    const root = buildBracket(rows, ['浦和', '東京NB']);

    expect(root.round).toBe('決勝');
    expect(root.homeTeam).toBe('浦和');
    expect(root.awayTeam).toBe('東京NB');
    expect(root.homeGoal).toBe(3);
    expect(root.awayGoal).toBe(3);
    expect(root.homePkScore).toBe(4);
    expect(root.awayPkScore).toBe(2);
    expect(root.winner).toBe('浦和');
    expect(root.children).toEqual([null, null]);
  });

  it('builds a 4-team bracket (SF + Final)', () => {
    const rows = [
      makeRow({
        home_team: 'S広島R', away_team: '浦和',
        home_goal: '3', away_goal: '2',
        round: '準決勝', section_no: '98',
      }),
      makeRow({
        home_team: 'I神戸', away_team: '新潟L',
        home_goal: '1', away_goal: '0',
        round: '準決勝', section_no: '98',
      }),
      makeRow({
        home_team: 'S広島R', away_team: 'I神戸',
        home_goal: '1', away_goal: '0',
        round: '決勝', section_no: '99',
      }),
    ];
    const root = buildBracket(rows, ['S広島R', '浦和', 'I神戸', '新潟L']);

    // Final
    expect(root.round).toBe('決勝');
    expect(root.homeTeam).toBe('S広島R');
    expect(root.awayTeam).toBe('I神戸');
    expect(root.winner).toBe('S広島R');

    // Upper SF
    const upper = root.children[0]!;
    expect(upper.round).toBe('準決勝');
    expect(upper.homeTeam).toBe('S広島R');
    expect(upper.awayTeam).toBe('浦和');
    expect(upper.winner).toBe('S広島R');

    // Lower SF
    const lower = root.children[1]!;
    expect(lower.round).toBe('準決勝');
    expect(lower.homeTeam).toBe('I神戸');
    expect(lower.awayTeam).toBe('新潟L');
    expect(lower.winner).toBe('I神戸');
  });

  it('handles PK winner correctly', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '1',
        home_pk_score: '3', away_pk_score: '5',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    expect(root.winner).toBe('B');
  });

  it('handles extra time winner correctly', () => {
    // home_goal/away_goal include ET: regular 1-1, ET 1-0, total 2-1
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        home_score_ex: '1', away_score_ex: '0',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    expect(root.winner).toBe('A');
    expect(root.homeGoal).toBe(2);
    expect(root.awayGoal).toBe(1);
    expect(root.homeScoreEx).toBe(1);
    expect(root.awayScoreEx).toBe(0);
  });

  it('handles unplayed match (no CSV row for matchup)', () => {
    const root = buildBracket([], ['A', 'B']);
    expect(root.homeTeam).toBe('A');
    expect(root.awayTeam).toBe('B');
    expect(root.winner).toBeNull();
    expect(root.status).toBe('ＶＳ');
  });

  it('handles partially played 4-team bracket', () => {
    // Only one SF played; final not yet played
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        round: '準決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B', 'C', 'D']);

    // Upper SF completed
    expect(root.children[0]!.winner).toBe('A');
    // Lower SF not played
    expect(root.children[1]!.winner).toBeNull();
    // Final not played (no winner from lower SF)
    expect(root.winner).toBeNull();
    expect(root.homeTeam).toBe('A');
    expect(root.awayTeam).toBeNull();
  });
});
