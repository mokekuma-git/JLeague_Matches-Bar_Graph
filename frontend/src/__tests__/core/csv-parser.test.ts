import { describe, test, expect } from 'vitest';
import { parseCsvResults } from '../../core/csv-parser';
import { calculateTeamStats } from '../../ranking/stats-calculator';
import type { RawMatchRow } from '../../types/match';

/** Minimal RawMatchRow factory. */
function makeRow(overrides: Partial<RawMatchRow> = {}): RawMatchRow {
  return {
    match_date: '2025-03-15',
    section_no: '1',
    match_index_in_section: '1',
    start_time: '15:00',
    stadium: 'TestStadium',
    home_team: 'TeamA',
    home_goal: '2',
    away_goal: '1',
    away_team: 'TeamB',
    status: '試合終了',
    ...overrides,
  };
}

const BASE_FIELDS = [
  'match_date', 'section_no', 'match_index_in_section', 'start_time',
  'stadium', 'home_team', 'home_goal', 'away_goal', 'away_team', 'status',
];

describe('parseCsvResults', () => {
  describe('basic structure', () => {
    test('creates one TeamMatch per team from a single row', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df).toHaveLength(1);
      expect(result['DefaultGroup']['TeamB'].df).toHaveLength(1);
    });

    test('home team match has is_home=true, away team has is_home=false', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].is_home).toBe(true);
      expect(result['DefaultGroup']['TeamB'].df[0].is_home).toBe(false);
    });

    test('opponents are set correctly (cross-reference)', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].opponent).toBe('TeamB');
      expect(result['DefaultGroup']['TeamB'].df[0].opponent).toBe('TeamA');
    });

    test('goal_get and goal_lose are swapped for away team', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      const homeMatch = result['DefaultGroup']['TeamA'].df[0];
      const awayMatch = result['DefaultGroup']['TeamB'].df[0];
      expect(homeMatch.goal_get).toBe('2');
      expect(homeMatch.goal_lose).toBe('1');
      expect(awayMatch.goal_get).toBe('1');
      expect(awayMatch.goal_lose).toBe('2');
    });

    test('points are computed correctly (win=3, loss=0)', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].point).toBe(3); // home wins 2-1
      expect(result['DefaultGroup']['TeamB'].df[0].point).toBe(0); // away loses
    });

    test('match_date is normalised to YYYY/MM/DD', () => {
      // makeRow sets match_date='2025-03-15' (ISO format); parseCsvResults should normalise it.
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].match_date).toBe('2025/03/15');
    });

    test('pre-populated team entries exist even without matching rows', () => {
      // TeamC appears in teamList but not in the CSV row.
      const result = parseCsvResults(
        [makeRow()], BASE_FIELDS, ['TeamA', 'TeamB', 'TeamC'], 'DefaultGroup',
      );
      expect(result['DefaultGroup']['TeamC']).toBeDefined();
      expect(result['DefaultGroup']['TeamC'].df).toHaveLength(0);
    });
  });

  describe('has_result flag', () => {
    test('has_result=true when both goals are present', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].has_result).toBe(true);
    });

    test('has_result=false when goals are empty', () => {
      const row = makeRow({ home_goal: '', away_goal: '', status: 'ＶＳ' });
      const result = parseCsvResults([row], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].has_result).toBe(false);
    });
  });

  describe('live match detection', () => {
    test('live=true when status contains "速報中"', () => {
      const row = makeRow({ status: '速報中' });
      const result = parseCsvResults([row], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].live).toBe(true);
    });

    test('"速報中" is stripped from the displayed status string', () => {
      const row = makeRow({ status: '前半速報中' });
      const result = parseCsvResults([row], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].status).toBe('前半');
      expect(result['DefaultGroup']['TeamA'].df[0].live).toBe(true);
    });

    test('"ＶＳ" status → displayed as "開始前"', () => {
      const row = makeRow({ home_goal: '', away_goal: '', status: 'ＶＳ' });
      const result = parseCsvResults([row], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].status).toBe('開始前');
      expect(result['DefaultGroup']['TeamA'].df[0].live).toBe(false);
    });
  });

  describe('PK shootout', () => {
    test('PK scores are parsed as integers', () => {
      const fields = [...BASE_FIELDS, 'home_pk_score', 'away_pk_score'];
      const row = makeRow({ home_goal: '1', away_goal: '1', home_pk_score: '5', away_pk_score: '4' });
      const result = parseCsvResults([row], fields, ['TeamA', 'TeamB'], 'DefaultGroup');
      const homeMatch = result['DefaultGroup']['TeamA'].df[0];
      expect(homeMatch.pk_get).toBe(5);
      expect(homeMatch.pk_lose).toBe(4);
    });

    test('PK win earns 2 points, PK loss earns 1 point', () => {
      const fields = [...BASE_FIELDS, 'home_pk_score', 'away_pk_score'];
      const row = makeRow({ home_goal: '1', away_goal: '1', home_pk_score: '5', away_pk_score: '4' });
      const result = parseCsvResults([row], fields, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].point).toBe(2); // PK win
      expect(result['DefaultGroup']['TeamB'].df[0].point).toBe(1); // PK loss
    });

    test('pk_get/pk_lose are null when no PK column', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df[0].pk_get).toBeNull();
      expect(result['DefaultGroup']['TeamA'].df[0].pk_lose).toBeNull();
    });
  });

  describe('group handling', () => {
    test('defaultGroup is used when CSV has no group column', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'East');
      expect(Object.keys(result)).toEqual(['East']);
    });

    test('string "null" as defaultGroup is treated as "DefaultGroup"', () => {
      const result = parseCsvResults([makeRow()], BASE_FIELDS, ['TeamA', 'TeamB'], 'null');
      expect(Object.keys(result)).toEqual(['DefaultGroup']);
    });

    test('group column in CSV overrides defaultGroup', () => {
      const fields = [...BASE_FIELDS, 'group'];
      const rows = [
        makeRow({ group: 'EAST', home_team: 'TeamA', away_team: 'TeamB' }),
        makeRow({ group: 'WEST', home_team: 'TeamC', away_team: 'TeamD' }),
      ];
      const result = parseCsvResults(rows, fields, [], null);
      expect(Object.keys(result).sort()).toEqual(['EAST', 'WEST']);
      expect(result['EAST']['TeamA'].df).toHaveLength(1);
      expect(result['WEST']['TeamC'].df).toHaveLength(1);
    });
  });

  // Integration: parseCsvResults + calculateTeamStats on a full 3-team round-robin.
  // Rows: A 2-1 B (s1), A 1-1 C (s2), B 0-1 C (s3)
  // Expected totals (all games before targetDate):
  //   TeamA: W1 D1 → pt=4, goal_get=3, goal_diff=1
  //   TeamB: L2    → pt=0, goal_get=1, goal_diff=-2
  //   TeamC: W1 D1 → pt=4, goal_get=2, goal_diff=1
  describe('round-robin integration (parseCsvResults + calculateTeamStats)', () => {
    const rows = [
      makeRow({ section_no: '1', match_date: '2025-03-01', home_team: 'TeamA', away_team: 'TeamB', home_goal: '2', away_goal: '1', status: '試合終了' }),
      makeRow({ section_no: '2', match_date: '2025-03-08', home_team: 'TeamA', away_team: 'TeamC', home_goal: '1', away_goal: '1', status: '試合終了' }),
      makeRow({ section_no: '3', match_date: '2025-03-15', home_team: 'TeamB', away_team: 'TeamC', home_goal: '0', away_goal: '1', status: '試合終了' }),
    ];
    const teamList = ['TeamA', 'TeamB', 'TeamC'];
    const TARGET = '2025/12/31';

    test('each team receives exactly 2 matches', () => {
      const result = parseCsvResults(rows, BASE_FIELDS, teamList, 'DefaultGroup');
      expect(result['DefaultGroup']['TeamA'].df).toHaveLength(2);
      expect(result['DefaultGroup']['TeamB'].df).toHaveLength(2);
      expect(result['DefaultGroup']['TeamC'].df).toHaveLength(2);
    });

    test('TeamA accumulates W1 D1: point=4, goal_get=3, goal_diff=1', () => {
      const result = parseCsvResults(rows, BASE_FIELDS, teamList, 'DefaultGroup');
      const td = result['DefaultGroup']['TeamA'];
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.point).toBe(4);
      expect(td.win).toBe(1);
      expect(td.draw).toBe(1);
      expect(td.goal_get).toBe(3);
      expect(td.goal_diff).toBe(1);
    });

    test('TeamB accumulates L2: point=0, goal_get=1, goal_diff=-2', () => {
      const result = parseCsvResults(rows, BASE_FIELDS, teamList, 'DefaultGroup');
      const td = result['DefaultGroup']['TeamB'];
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.point).toBe(0);
      expect(td.lose).toBe(2);
      expect(td.goal_get).toBe(1);
      expect(td.goal_diff).toBe(-2);
    });

    test('TeamC accumulates W1 D1: point=4, goal_get=2, goal_diff=1', () => {
      const result = parseCsvResults(rows, BASE_FIELDS, teamList, 'DefaultGroup');
      const td = result['DefaultGroup']['TeamC'];
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.point).toBe(4);
      expect(td.win).toBe(1);
      expect(td.draw).toBe(1);
      expect(td.goal_get).toBe(2);
      expect(td.goal_diff).toBe(1);
    });
  });
});
