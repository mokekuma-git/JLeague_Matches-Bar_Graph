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
    // Frozen fixture, not the live docs/csv: WC2026 is in progress and the CSV
    // update cron resolves these placeholders over time, which would make the
    // match_number assertions below go stale on their own (see #279).
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_snapshot.csv');
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

  it('keeps position-based leaves when a round-16 match has already resolved both feeders to real names', () => {
    // Regression fixture for #281: match 89 (round of 16) here carries real
    // team names ("ドイツ"/"フランス") because its feeders (74, 77) have been
    // played, while the rest of round 32 is still unplayed. Before the fix,
    // visit() re-parsed row 89's own home/away text, saw no "No.X" pattern,
    // and misclassified 89 itself as a leaf instead of recursing into 74/77.
    const rows = loadCsv('../fixtures/csv/2026_wc_ko_r16_partial_resolved.csv');
    const topology = buildReferenceTopology(rows);

    expect(topology).not.toBeNull();
    expect(topology?.leafMatchNumbers).toEqual([
      74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87,
    ]);
    expect(topology?.parentByChildPair.get('74-77')).toBe(89);
  });

  it('returns null for competitions without feeder references (name-matched fallback)', () => {
    const rows = loadCsv('../../../../docs/csv/2024_allmatch_result-EmperorsCup.csv');
    expect(buildReferenceTopology(rows)).toBeNull();
  });

  it('returns null for an empty row set', () => {
    expect(buildReferenceTopology([])).toBeNull();
  });
});
