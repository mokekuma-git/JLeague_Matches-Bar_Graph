import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import {
  parseSlotReference,
  buildReferenceTopology,
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

describe('buildReferenceTopology', () => {
  it('derives leaf match numbers and parent links from WC_KO feeder references', () => {
    const rows = loadCsv('../../../../docs/csv/2026_allmatch_result-WC_KO.csv');
    const topology = buildReferenceTopology(rows);

    expect(topology).not.toBeNull();
    expect(topology?.leafMatchNumbers).toEqual([
      74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87,
    ]);
    expect(topology?.parentByChildPair.get('74-77')).toBe(89);
    expect(topology?.parentByChildPair.get('89-90')).toBe(97);
    expect(topology?.parentByChildPair.get('101-102')).toBe(104);
    // 3rd-place playoff (loser-refs only) is not part of the winner-ref tree.
    expect(topology?.parentByChildPair.get('101-103')).toBeUndefined();
  });

  it('returns null for competitions without feeder references (name-matched fallback)', () => {
    const rows = loadCsv('../../../../docs/csv/2024_allmatch_result-EmperorsCup.csv');
    expect(buildReferenceTopology(rows)).toBeNull();
  });

  it('returns null for an empty row set', () => {
    expect(buildReferenceTopology([])).toBeNull();
  });
});
