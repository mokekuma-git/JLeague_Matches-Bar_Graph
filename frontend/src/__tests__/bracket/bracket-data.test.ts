import { describe, it, expect } from 'vitest';
import { buildBracket } from '../../bracket/bracket-data';
import type { RawMatchRow } from '../../types/match';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import Papa from 'papaparse';
import { inferBracketOrderFromRows } from '../../bracket/bracket-order-inference';
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

describe('buildBracket', () => {
  it('throws if bracket_order has fewer than 2 teams', () => {
    expect(() => buildBracket([], ['A'])).toThrow('at least 2 teams');
  });

  it('builds a 2-team bracket (final only) — PK decides', () => {
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
    expect(root.decidedBy).toBe('penalties');
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
    expect(root.decidedBy).toBe('score');

    // Upper SF
    const upper = root.children[0]!;
    expect(upper.round).toBe('準決勝');
    expect(upper.homeTeam).toBe('S広島R');
    expect(upper.awayTeam).toBe('浦和');
    expect(upper.winner).toBe('S広島R');
    expect(upper.decidedBy).toBe('score');

    // Lower SF
    const lower = root.children[1]!;
    expect(lower.round).toBe('準決勝');
    expect(lower.homeTeam).toBe('I神戸');
    expect(lower.awayTeam).toBe('新潟L');
    expect(lower.winner).toBe('I神戸');
    expect(lower.decidedBy).toBe('score');
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
    expect(root.decidedBy).toBe('penalties');
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
    expect(root.decidedBy).toBe('extra_time');
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
    expect(root.decidedBy).toBe('pending');
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
    expect(root.children[0]!.decidedBy).toBe('score');
    // Lower SF not played
    expect(root.children[1]!.winner).toBeNull();
    expect(root.children[1]!.decidedBy).toBe('pending');
    // Final not played (no winner from lower SF)
    expect(root.winner).toBeNull();
    expect(root.decidedBy).toBe('pending');
    expect(root.homeTeam).toBe('A');
    expect(root.awayTeam).toBeNull();
  });

  it('handles bye entries (team vs null) with auto-advance', () => {
    // Bracket order with byes: A gets a bye, C vs D play
    const rows = [
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '1', away_goal: '0',
        round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'C',
        home_goal: '2', away_goal: '1',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', null, 'C', 'D']);

    // Upper SF: A gets bye (auto-advance) — decidedBy is null
    const upperSf = root.children[0]!;
    expect(upperSf.homeTeam).toBe('A');
    expect(upperSf.awayTeam).toBeNull();
    expect(upperSf.winner).toBe('A');
    expect(upperSf.decidedBy).toBeNull();

    // Lower SF: C vs D, C wins
    const lowerSf = root.children[1]!;
    expect(lowerSf.homeTeam).toBe('C');
    expect(lowerSf.awayTeam).toBe('D');
    expect(lowerSf.winner).toBe('C');
    expect(lowerSf.decidedBy).toBe('score');

    // Final: A vs C
    expect(root.homeTeam).toBe('A');
    expect(root.awayTeam).toBe('C');
    expect(root.winner).toBe('A');
    expect(root.decidedBy).toBe('score');
  });

  it('handles multi-level bye chain (team passes through 2 rounds)', () => {
    // 8-team bracket where A has byes in QF and SF
    const rows = [
      makeRow({
        home_team: 'E', away_team: 'F',
        home_goal: '2', away_goal: '0',
        round: '準々決勝',
      }),
      makeRow({
        home_team: 'G', away_team: 'H',
        home_goal: '1', away_goal: '0',
        round: '準々決勝',
      }),
      makeRow({
        home_team: 'E', away_team: 'G',
        home_goal: '3', away_goal: '1',
        round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'E',
        home_goal: '2', away_goal: '1',
        round: '決勝',
      }),
    ];
    // A has byes at positions [0, null, null, null], real teams at [4..7]
    const root = buildBracket(rows, ['A', null, null, null, 'E', 'F', 'G', 'H']);

    // Upper half: A passes through 2 levels of byes
    const upperSf = root.children[0]!;
    expect(upperSf.winner).toBe('A');
    expect(upperSf.homeTeam).toBe('A');
    expect(upperSf.awayTeam).toBeNull();
    expect(upperSf.decidedBy).toBeNull();

    // Upper SF's upper child: A bye leaf
    const upperQf = upperSf.children[0]!;
    expect(upperQf.winner).toBe('A');
    expect(upperQf.homeTeam).toBe('A');
    expect(upperQf.awayTeam).toBeNull();
    expect(upperQf.decidedBy).toBeNull();

    // Upper SF's lower child: empty (no real teams)
    const emptyQf = upperSf.children[1]!;
    expect(emptyQf.homeTeam).toBeNull();
    expect(emptyQf.awayTeam).toBeNull();
    expect(emptyQf.winner).toBeNull();
    expect(emptyQf.decidedBy).toBe('pending');

    // Final: A vs E
    expect(root.homeTeam).toBe('A');
    expect(root.awayTeam).toBe('E');
    expect(root.winner).toBe('A');
    expect(root.decidedBy).toBe('score');
  });
});

describe('buildBracket — H&A aggregate', () => {
  it('decides by score when aggregate totals differ', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        round: '決勝', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '0', away_goal: '1',
        round: '決勝', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    // A total: 2+1=3, B total: 1+0=1
    expect(root.winner).toBe('A');
    expect(root.decidedBy).toBe('aggregate_score');
    expect(root.legs).toHaveLength(2);
    expect(root.round).toBe('決勝');
  });

  it('decides by penalties when aggregate is tied and PK played', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        round: '決勝', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '1', away_goal: '0',
        home_pk_score: '4', away_pk_score: '3',
        round: '決勝', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    // Aggregate: A=1, B=1 (tied) → PK in leg 2: B wins (home=B, 4-3)
    expect(root.winner).toBe('B');
    expect(root.decidedBy).toBe('aggregate_penalties');
    expect(root.legs).toHaveLength(2);
  });

  it('decides by away goals when configured in aggregate tiebreak order', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        round: '準決勝　第1戦', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '3', away_goal: '2',
        round: '準決勝　第2戦', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B'], ['away_goals', 'penalties']);

    expect(root.winner).toBe('A');
    expect(root.decidedBy).toBe('aggregate_away_goals');
    expect(root.homeGoal).toBe(3);
    expect(root.awayGoal).toBe(3);
  });

  it('decides by wins first when configured in aggregate tiebreak order', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        round: '準決勝　第1戦', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '1', away_goal: '1',
        round: '準決勝　第2戦', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B'], ['wins', 'penalties']);

    expect(root.winner).toBe('A');
    expect(root.decidedBy).toBe('aggregate_wins');
    expect(root.homeGoal).toBe(2);
    expect(root.awayGoal).toBe(1);
  });

  it('decides by penalties after extra time when regulation and away goals are tied', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '1',
        round: '準決勝', match_date: '2024/10/10', leg: '1',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '2', away_goal: '2',
        home_score_ex: '1', away_score_ex: '1',
        home_pk_score: '5', away_pk_score: '4',
        round: '準決勝', match_date: '2024/10/14', leg: '2',
      }),
    ];

    const root = buildBracket(rows, ['A', 'B'], ['away_goals', 'penalties']);

    expect(root.winner).toBe('B');
    expect(root.decidedBy).toBe('aggregate_penalties');
    expect(root.homeGoal).toBe(3);
    expect(root.awayGoal).toBe(3);
    expect(root.homeScoreEx).toBe(1);
    expect(root.awayScoreEx).toBe(1);
  });

  it('normalizes Japanese H&A round labels by removing leg suffix', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        round: '準々決勝第1戦', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '0', away_goal: '1',
        round: '準々決勝第2戦', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    expect(root.round).toBe('準々決勝');
  });

  it('normalizes English H&A round labels by removing leg suffix', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        round: 'Round 1 1st Leg', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '0', away_goal: '1',
        round: 'Round 1 2nd Leg', match_date: '2024/12/08',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    expect(root.round).toBe('Round 1');
  });

  it('is pending when not all legs played', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        round: '決勝', match_date: '2024/12/01',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '', away_goal: '',
        round: '決勝', match_date: '2024/12/08',
        status: 'ＶＳ',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    expect(root.winner).toBeNull();
    expect(root.decidedBy).toBe('pending');
  });
});

describe('buildBracket — real tournament fixtures', () => {
  function assertNoUndefinedChildren(node: BracketNode | null): void {
    if (!node) return;
    expect(node.children[0]).not.toBe(undefined);
    expect(node.children[1]).not.toBe(undefined);
    assertNoUndefinedChildren(node.children[0]);
    assertNoUndefinedChildren(node.children[1]);
  }

  it('builds the full EmperorsCup 2025 bracket from inferred order without throwing', () => {
    const csvText = readFileSync(
      resolve(__dirname, '../../../../docs/csv/2025_allmatch_result-EmperorsCup.csv'),
      'utf-8',
    );
    const fixtureText = readFileSync(
      resolve(__dirname, '../../../../tests/test_data/emperorscup_bracket_inference_expected.yaml'),
      'utf-8',
    );
    const rows = Papa.parse<RawMatchRow>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
    }).data;
    const fixture = yaml.load(fixtureText) as {
      EmperorsCup: Record<string, { bracket_order: (string | null)[] }>;
    };
    const order = fixture.EmperorsCup['2025'].bracket_order;

    const root = buildBracket(rows, order);

    expect(root).toBeTruthy();
    expect(root.winner).toBeTruthy();
    assertNoUndefinedChildren(root);
  });

  it('builds the full EmperorsCup 2025 bracket from TypeScript-inferred order', () => {
    const csvText = readFileSync(
      resolve(__dirname, '../../../../docs/csv/2025_allmatch_result-EmperorsCup.csv'),
      'utf-8',
    );
    const rows = Papa.parse<RawMatchRow>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
    }).data;
    const inferredOrder = inferBracketOrderFromRows(rows);

    expect(inferredOrder).toBeDefined();
    const root = buildBracket(rows, inferredOrder!);

    expect(root).toBeTruthy();
    expect(root.winner).toBeTruthy();
    assertNoUndefinedChildren(root);
  });
});
