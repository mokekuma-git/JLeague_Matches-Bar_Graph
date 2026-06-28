// Reconstruct the result-reference graph from KO CSV rows that encode bracket
// structure via feeder placeholders (e.g. "No.74の勝者" / "No.101の敗者").
// This lets nodes be linked to CSV rows by match_number (position) instead of
// by team name, so the link survives placeholder -> real-name updates.

import type { RawMatchRow } from '../types/match';
import { parseMatchNumber } from './bracket-order-inference';

export interface SlotReference {
  role: 'winner' | 'loser';
  matchNumber: number;
}

const SLOT_REFERENCE_PATTERN = /^No\.(\d+)の(勝者|敗者)$/;

/** Parse a feeder placeholder like "No.74の勝者". Returns null for concrete team names. */
export function parseSlotReference(name: string | null | undefined): SlotReference | null {
  if (!name) return null;
  const match = SLOT_REFERENCE_PATTERN.exec(name);
  if (!match) return null;
  return {
    matchNumber: Number.parseInt(match[1], 10),
    role: match[2] === '勝者' ? 'winner' : 'loser',
  };
}

export interface ReferenceTopology {
  /** Leaf (entry-round) match numbers, left-to-right, one per bracket_order pair. */
  leafMatchNumbers: number[];
  /** Maps a normalized child match-number pair to the parent match number. */
  parentByChildPair: Map<string, number>;
}

function childPairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Reconstruct the winner-reference tree from KO CSV rows.
 * Returns null when rows have no "No.X の勝者" feeder references (historical
 * competitions where bracket_order pairs are still matched by team name).
 */
export function buildReferenceTopology(rows: RawMatchRow[]): ReferenceTopology | null {
  const rowsByMatchNumber = new Map<number, RawMatchRow>();
  for (const row of rows) {
    const matchNumber = parseMatchNumber(row);
    if (matchNumber !== undefined) rowsByMatchNumber.set(matchNumber, row);
  }
  if (rowsByMatchNumber.size === 0) return null;

  // A match is an "internal" node only when BOTH slots reference another
  // match's winner. Mixed/partial references don't occur in known data and
  // are treated as leaves (no recursion).
  const winnerRefChildren = new Set<number>();
  const parentByChildPair = new Map<string, number>();
  for (const [matchNumber, row] of rowsByMatchNumber) {
    const homeRef = parseSlotReference(row.home_team);
    const awayRef = parseSlotReference(row.away_team);
    if (homeRef?.role === 'winner' && awayRef?.role === 'winner') {
      winnerRefChildren.add(homeRef.matchNumber);
      winnerRefChildren.add(awayRef.matchNumber);
      parentByChildPair.set(childPairKey(homeRef.matchNumber, awayRef.matchNumber), matchNumber);
    }
  }
  if (parentByChildPair.size === 0) return null;

  // The root is the unique parent that is never itself referenced as a child
  // (e.g. the final). Other terminal matches such as a 3rd-place playoff
  // (loser-refs only) never enter parentByChildPair and are excluded here.
  const allParents = new Set(parentByChildPair.values());
  const rootCandidates = [...allParents].filter((m) => !winnerRefChildren.has(m));
  if (rootCandidates.length !== 1) return null;

  const leafMatchNumbers: number[] = [];
  function visit(matchNumber: number): void {
    const row = rowsByMatchNumber.get(matchNumber);
    if (!row) return;
    const homeRef = parseSlotReference(row.home_team);
    const awayRef = parseSlotReference(row.away_team);
    if (homeRef?.role === 'winner' && awayRef?.role === 'winner') {
      visit(homeRef.matchNumber);
      visit(awayRef.matchNumber);
    } else {
      leafMatchNumbers.push(matchNumber);
    }
  }
  visit(rootCandidates[0]);

  return { leafMatchNumbers, parentByChildPair };
}
