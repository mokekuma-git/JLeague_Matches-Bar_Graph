import { describe, it, expect } from 'vitest';
import { buildBracket, maskBracketForDate } from '../../bracket/bracket-data';
import type { RawMatchRow } from '../../types/match';
import type { BracketNode } from '../../bracket/bracket-types';

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

describe('maskBracketForDate', () => {
  it('clears scores and winner for future single matches', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/15', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const masked = maskBracketForDate(root, '2024/12/10');

    expect(masked.homeGoal).toBeUndefined();
    expect(masked.awayGoal).toBeUndefined();
    expect(masked.winner).toBeNull();
    expect(masked.decidedBy).toBe('pending');
    expect(masked.status).toBe('ＶＳ');
    // Teams preserved
    expect(masked.homeTeam).toBe('A');
    expect(masked.awayTeam).toBe('B');
  });

  it('preserves past matches unchanged', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/01', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const masked = maskBracketForDate(root, '2024/12/10');

    expect(masked.homeGoal).toBe(2);
    expect(masked.awayGoal).toBe(1);
    expect(masked.winner).toBe('A');
    expect(masked.decidedBy).toBe('score');
  });

  it('clears PK and ET scores for future matches', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '1',
        home_pk_score: '4', away_pk_score: '3',
        match_date: '2024/12/15', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const masked = maskBracketForDate(root, '2024/12/10');

    expect(masked.homePkScore).toBeUndefined();
    expect(masked.awayPkScore).toBeUndefined();
    expect(masked.homeScoreEx).toBeUndefined();
    expect(masked.awayScoreEx).toBeUndefined();
  });

  it('sets child winner teams to TBD (null) when child match is future', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/15', round: '準決勝',
      }),
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '3', away_goal: '0',
        match_date: '2024/12/15', round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'C',
        home_goal: '1', away_goal: '0',
        match_date: '2024/12/22', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B', 'C', 'D']);
    const masked = maskBracketForDate(root, '2024/12/10');

    // SFs are future → winners unknown
    expect(masked.children[0]!.winner).toBeNull();
    expect(masked.children[1]!.winner).toBeNull();
    // Final teams derived from child winners → null (TBD)
    expect(masked.homeTeam).toBeNull();
    expect(masked.awayTeam).toBeNull();
  });

  it('propagates known SF winner to final when SF is past but final is future', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/01', round: '準決勝',
      }),
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '3', away_goal: '0',
        match_date: '2024/12/01', round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'C',
        home_goal: '1', away_goal: '0',
        match_date: '2024/12/22', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B', 'C', 'D']);
    const masked = maskBracketForDate(root, '2024/12/10');

    // SFs completed → winners known
    expect(masked.children[0]!.winner).toBe('A');
    expect(masked.children[1]!.winner).toBe('C');
    // Final is future but teams are known from SF winners
    expect(masked.homeTeam).toBe('A');
    expect(masked.awayTeam).toBe('C');
    expect(masked.winner).toBeNull();
    expect(masked.homeGoal).toBeUndefined();
  });

  describe('H&A aggregate masking', () => {
    function buildHABracket(): BracketNode {
      const rows = [
        makeRow({
          home_team: 'A', away_team: 'B',
          home_goal: '2', away_goal: '1',
          match_date: '2024/12/01', round: '決勝', leg: '1',
        }),
        makeRow({
          home_team: 'B', away_team: 'A',
          home_goal: '1', away_goal: '0',
          match_date: '2024/12/08', round: '決勝', leg: '2',
        }),
      ];
      return buildBracket(rows, ['A', 'B']);
    }

    it('shows partial aggregate when between legs', () => {
      const root = buildHABracket();
      // After leg 1 (12/01) but before leg 2 (12/08)
      const masked = maskBracketForDate(root, '2024/12/05');

      // Only leg 1 counted: A home=2, away=1 → upper(A)=2, lower(B)=1
      expect(masked.homeGoal).toBe(2);
      expect(masked.awayGoal).toBe(1);
      expect(masked.winner).toBeNull();
      expect(masked.decidedBy).toBe('pending');
      expect(masked.status).toBe('ＶＳ');
    });

    it('clears PK/ET scores in partial aggregate', () => {
      const root = buildHABracket();
      const masked = maskBracketForDate(root, '2024/12/05');

      expect(masked.homePkScore).toBeUndefined();
      expect(masked.awayPkScore).toBeUndefined();
      expect(masked.homeScoreEx).toBeUndefined();
      expect(masked.awayScoreEx).toBeUndefined();
    });

    it('shows full aggregate when all legs are past', () => {
      const root = buildHABracket();
      const masked = maskBracketForDate(root, '2024/12/15');

      // Both legs counted: A=2+0=2, B=1+1=2 → tied, no PK → no winner
      expect(masked.homeGoal).toBe(2);
      expect(masked.awayGoal).toBe(2);
    });

    it('hides entire aggregate when all legs are future', () => {
      const root = buildHABracket();
      const masked = maskBracketForDate(root, '2024/11/01');

      expect(masked.homeGoal).toBeUndefined();
      expect(masked.awayGoal).toBeUndefined();
      expect(masked.winner).toBeNull();
      expect(masked.legs).toBeUndefined();
    });

    it('filters legs in partial masking', () => {
      const root = buildHABracket();
      const masked = maskBracketForDate(root, '2024/12/05');

      // Only leg 1 should be in the masked legs
      expect(masked.legs).toHaveLength(1);
      expect(masked.legs![0].matchDate).toBe('2024/12/01');
    });
  });
});
