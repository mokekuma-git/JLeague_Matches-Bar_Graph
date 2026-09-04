import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import {
  parseSlotReference,
  buildTopologyFromRounds,
} from '../../bracket/bracket-reference-graph';
import type { RawMatchRow } from '../../types/match';

function loadCsv(path: string): RawMatchRow[] {
  const csvText = readFileSync(resolve(__dirname, path), 'utf-8');
  return Papa.parse<RawMatchRow>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
  }).data;
}

describe('parseSlotReference', () => {
  it('parses a winner reference', () => {
    expect(parseSlotReference('No.74の勝者')).toEqual({ role: 'winner', matchNumber: 74 });
  });

  it('parses a loser reference', () => {
    expect(parseSlotReference('No.101の敗者')).toEqual({ role: 'loser', matchNumber: 101 });
  });

  it('returns null for a concrete team name', () => {
    expect(parseSlotReference('ドイツ')).toBeNull();
  });

  it('returns null for a group-rank placeholder', () => {
    expect(parseSlotReference('グループA2位')).toBeNull();
  });

  it('returns null for undefined/empty', () => {
    expect(parseSlotReference(undefined)).toBeNull();
    expect(parseSlotReference('')).toBeNull();
  });
});

describe('buildTopologyFromRounds', () => {
  // season_map's bracket_topology for WC2026: match_number per round, entry
  // round first, each round in bracket position order.
  const WC_ROUNDS = [
    [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
    [89, 90, 93, 94, 91, 92, 95, 96],
    [97, 98, 99, 100],
    [101, 102],
    [104],
  ];

  it('turns authored rounds into leaf order and parent links', () => {
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_complete.csv');
    const topology = buildTopologyFromRounds(WC_ROUNDS, rows);

    expect(topology).not.toBeNull();
    expect(topology?.leafMatchNumbers).toEqual(WC_ROUNDS[0]);
    expect(topology?.parentByChildPair.get('74-77')).toBe(89);
    expect(topology?.parentByChildPair.get('89-90')).toBe(97);
    expect(topology?.parentByChildPair.get('101-102')).toBe(104);
    // The third-place playoff lives in its own block, not in this tree.
    expect(topology?.parentByChildPair.get('101-103')).toBeUndefined();
    expect(topology?.rowsByMatchNumber.get(104)?.home_team).toBe('スペイン');
  });

  it('works on an in-progress CSV, where feeder references still remain', () => {
    // Same authored topology, earlier snapshot: the topology no longer depends
    // on whether the CSV still carries "No.Xの勝者" text (#307).
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_snapshot.csv');
    const topology = buildTopologyFromRounds(WC_ROUNDS, rows);

    expect(topology?.leafMatchNumbers).toEqual(WC_ROUNDS[0]);
    expect(topology?.parentByChildPair.get('74-77')).toBe(89);
  });

  it('applies pairing orders so authored rounds stay in bracket position order', () => {
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_complete.csv');
    // Swapping the first two entry-round matches must move their parent link
    // with them, exactly as buildNode() reorders nodes before pairing.
    const pairingOrders = [[1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
    const topology = buildTopologyFromRounds(WC_ROUNDS, rows, pairingOrders);

    expect(topology?.parentByChildPair.get('74-77')).toBe(89);
    expect(topology?.parentByChildPair.get('73-75')).toBe(90);
  });

  it('returns null when a round is not half the one below it', () => {
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_complete.csv');
    expect(buildTopologyFromRounds([[73, 74], [89, 90]], rows)).toBeNull();
  });

  it('returns null for empty rounds or rows without match numbers', () => {
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_complete.csv');
    expect(buildTopologyFromRounds([], rows)).toBeNull();
    expect(buildTopologyFromRounds([[104]], [])).toBeNull();
  });
});
