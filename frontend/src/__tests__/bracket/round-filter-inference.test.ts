import { describe, it, expect } from 'vitest';
import { inferRoundFilter } from '../../bracket/round-filter-inference';
import type { RawMatchRow } from '../../types/match';

function makeRow(overrides: Partial<RawMatchRow>): RawMatchRow {
  return {
    match_date: '2024/12/08',
    section_no: '-1',
    match_index_in_section: '1',
    start_time: '14:00',
    stadium: 'Test Stadium',
    home_team: '',
    home_goal: '',
    away_goal: '',
    away_team: '',
    status: '試合終了',
    ...overrides,
  };
}

describe('inferRoundFilter', () => {
  it('returns undefined for empty bracketOrder', () => {
    const rows = [makeRow({ home_team: 'A', away_team: 'B', round: '決勝' })];
    expect(inferRoundFilter(rows, [])).toBeUndefined();
  });

  it('returns undefined for all-null bracketOrder', () => {
    const rows = [makeRow({ home_team: 'A', away_team: 'B', round: '決勝' })];
    expect(inferRoundFilter(rows, [null, null])).toBeUndefined();
  });

  it('returns undefined when no candidate matches found', () => {
    const rows = [makeRow({ home_team: 'X', away_team: 'Y', round: '決勝' })];
    expect(inferRoundFilter(rows, ['A', 'B'])).toBeUndefined();
  });

  it('returns undefined when candidates have no round label', () => {
    const rows = [makeRow({ home_team: 'A', away_team: 'B' })];
    expect(inferRoundFilter(rows, ['A', 'B'])).toBeUndefined();
  });

  it('infers a simple 2-round KO bracket (SF + Final)', () => {
    const rows = [
      makeRow({ home_team: 'A', away_team: 'B', round: '準決勝', match_date: '2024/11/01', start_time: '14:00' }),
      makeRow({ home_team: 'C', away_team: 'D', round: '準決勝', match_date: '2024/11/01', start_time: '16:00' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '決勝', match_date: '2024/12/08', start_time: '14:00' }),
    ];
    // 4-team bracket → K=2, rounds by date: [準決勝, 決勝], tail 2 = both → all included
    expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D'])).toEqual(['準決勝', '決勝']);
  });

  it('infers a 3-round KO bracket (QF + SF + Final)', () => {
    const rows = [
      makeRow({ home_team: 'A', away_team: 'B', round: '準々決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'C', away_team: 'D', round: '準々決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'E', away_team: 'F', round: '準々決勝', match_date: '2024/10/02' }),
      makeRow({ home_team: 'G', away_team: 'H', round: '準々決勝', match_date: '2024/10/02' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '準決勝', match_date: '2024/11/01' }),
      makeRow({ home_team: 'E', away_team: 'G', round: '準決勝', match_date: '2024/11/01' }),
      makeRow({ home_team: 'A', away_team: 'E', round: '決勝', match_date: '2024/12/08' }),
    ];
    // 8-team bracket → K=3, all 3 rounds are the last 3 → all included
    expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']))
      .toEqual(['準々決勝', '準決勝', '決勝']);
  });

  it('filters out group stage rounds via time-series bracket_start', () => {
    const rows = [
      // Group stage rounds (earlier dates)
      makeRow({ home_team: 'A', away_team: 'B', round: '第1節', match_date: '2024/03/01' }),
      makeRow({ home_team: 'C', away_team: 'D', round: '第1節', match_date: '2024/03/01' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '第2節', match_date: '2024/04/01' }),
      makeRow({ home_team: 'B', away_team: 'D', round: '第2節', match_date: '2024/04/01' }),
      // KO rounds (later dates)
      makeRow({ home_team: 'A', away_team: 'D', round: '準決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'B', away_team: 'C', round: '準決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'A', away_team: 'B', round: '決勝', match_date: '2024/12/08' }),
    ];
    // 4-team → K=2, rounds by date: [第1節, 第2節, 準決勝, 決勝]
    // tail K=2: [準決勝, 決勝], bracket_start = 準決勝 date
    // After filter: [準決勝, 決勝]
    expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D'])).toEqual(['準決勝', '決勝']);
  });

  it('normalizes H&A leg suffixes (第1戦/第2戦)', () => {
    const rows = [
      makeRow({ home_team: 'A', away_team: 'B', round: '準決勝　第1戦', match_date: '2024/10/01' }),
      makeRow({ home_team: 'B', away_team: 'A', round: '準決勝　第2戦', match_date: '2024/10/15' }),
      makeRow({ home_team: 'C', away_team: 'D', round: '準決勝　第1戦', match_date: '2024/10/01' }),
      makeRow({ home_team: 'D', away_team: 'C', round: '準決勝　第2戦', match_date: '2024/10/15' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '決勝', match_date: '2024/12/08' }),
    ];
    // H&A legs normalize to the same round
    expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D'])).toEqual(['準決勝', '決勝']);
  });

  describe('singleRound', () => {
    it('picks the round with the most matches among bracket_order teams', () => {
      const rows = [
        makeRow({ home_team: 'A', away_team: 'B', round: '1回戦', match_date: '2024/06/01' }),
        makeRow({ home_team: 'C', away_team: 'D', round: '1回戦', match_date: '2024/06/01' }),
        makeRow({ home_team: 'A', away_team: 'C', round: '2回戦', match_date: '2024/09/01' }),
      ];
      // 1回戦=2 matches, 2回戦=1 → picks 1回戦
      expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D'], true)).toEqual(['1回戦']);
    });

    it('picks KO round over GS when KO has more bracket_order matchups', () => {
      // Simulates 2007 QF: 8 teams in QF bracket_order, GS has fewer team-pair matches
      const rows = [
        // GS: scattered matches between some bracket_order teams
        makeRow({ home_team: 'A', away_team: 'B', round: '第1節', match_date: '2024/03/01' }),
        makeRow({ home_team: 'C', away_team: 'D', round: '第2節', match_date: '2024/04/01' }),
        // QF: all 4 matchups (H&A = 8 rows)
        makeRow({ home_team: 'A', away_team: 'C', round: '準々決勝　第1戦', match_date: '2024/10/01' }),
        makeRow({ home_team: 'C', away_team: 'A', round: '準々決勝　第2戦', match_date: '2024/10/08' }),
        makeRow({ home_team: 'B', away_team: 'D', round: '準々決勝　第1戦', match_date: '2024/10/01' }),
        makeRow({ home_team: 'D', away_team: 'B', round: '準々決勝　第2戦', match_date: '2024/10/08' }),
        makeRow({ home_team: 'E', away_team: 'F', round: '準々決勝　第1戦', match_date: '2024/10/02' }),
        makeRow({ home_team: 'F', away_team: 'E', round: '準々決勝　第2戦', match_date: '2024/10/09' }),
        makeRow({ home_team: 'G', away_team: 'H', round: '準々決勝　第1戦', match_date: '2024/10/02' }),
        makeRow({ home_team: 'H', away_team: 'G', round: '準々決勝　第2戦', match_date: '2024/10/09' }),
      ];
      // 準々決勝=8 (normalized), 第1節=1, 第2節=1 → picks 準々決勝
      expect(inferRoundFilter(
        rows, ['A', 'C', 'B', 'D', 'E', 'F', 'G', 'H'], true,
      )).toEqual(['準々決勝']);
    });

    it('breaks count ties by preferring the latest round', () => {
      const rows = [
        makeRow({ home_team: 'A', away_team: 'B', round: '第1節', match_date: '2024/03/01' }),
        makeRow({ home_team: 'A', away_team: 'B', round: 'PO', match_date: '2024/10/01' }),
      ];
      // Both rounds have count=1, tie → latest (PO) wins
      expect(inferRoundFilter(rows, ['A', 'B'], true)).toEqual(['PO']);
    });
  });

  it('handles rows with only one team in bracketOrder (excluded)', () => {
    const rows = [
      // Only home_team is in bracketOrder → not a candidate
      makeRow({ home_team: 'A', away_team: 'X', round: '第1節', match_date: '2024/03/01' }),
      // Both teams in bracketOrder
      makeRow({ home_team: 'A', away_team: 'B', round: '決勝', match_date: '2024/12/08' }),
    ];
    expect(inferRoundFilter(rows, ['A', 'B'])).toEqual(['決勝']);
  });

  it('ignores byes (null) in bracketOrder for team extraction', () => {
    const rows = [
      makeRow({ home_team: 'A', away_team: 'B', round: '準決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '決勝', match_date: '2024/12/08' }),
    ];
    // bracketOrder has null slots (byes) but real teams: A, B, null, C
    // 4 leaf positions → K=2
    expect(inferRoundFilter(rows, ['A', 'B', null, 'C'])).toEqual(['準決勝', '決勝']);
  });

  it('returns rounds in chronological order even if CSV is unordered', () => {
    const rows = [
      makeRow({ home_team: 'A', away_team: 'B', round: '決勝', match_date: '2024/12/08' }),
      makeRow({ home_team: 'A', away_team: 'C', round: '準決勝', match_date: '2024/10/01' }),
      makeRow({ home_team: 'B', away_team: 'D', round: '準決勝', match_date: '2024/10/01' }),
    ];
    expect(inferRoundFilter(rows, ['A', 'B', 'C', 'D'])).toEqual(['準決勝', '決勝']);
  });
});
