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
  /** All KO rows in this CSV, indexed by match_number. */
  rowsByMatchNumber: Map<number, RawMatchRow>;
}

export function childPairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Determine the winner of a KO match from a CSV row.
 * Returns null if the match hasn't been played.
 */
export function determineWinner(row: RawMatchRow): string | null {
  if (!row.home_goal || !row.away_goal) return null;
  const hg = parseInt(row.home_goal, 10);
  const ag = parseInt(row.away_goal, 10);
  if (isNaN(hg) || isNaN(ag)) return null;

  // PK decides
  if (row.home_pk_score && row.away_pk_score) {
    const hpk = parseInt(row.home_pk_score, 10);
    const apk = parseInt(row.away_pk_score, 10);
    return hpk > apk ? row.home_team : row.away_team;
  }

  // home_goal/away_goal already include ET — no need to add score_ex
  if (hg !== ag) return hg > ag ? row.home_team : row.away_team;

  // Equal score without PK — shouldn't happen in KO but return null
  return null;
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

  // Pass 1: a match is an "internal" node when BOTH slots still carry a
  // "No.Xの勝者" feeder reference. This is the only signal available before
  // any result overwrites the placeholders, and finding at least one such
  // reference anywhere is what confirms this competition uses the No.X
  // convention at all (guards the historical name-matched competitions below).
  const childrenByParent = new Map<number, [number, number]>();
  for (const [matchNumber, row] of rowsByMatchNumber) {
    const homeRef = parseSlotReference(row.home_team);
    const awayRef = parseSlotReference(row.away_team);
    if (homeRef?.role === 'winner' && awayRef?.role === 'winner') {
      childrenByParent.set(matchNumber, [homeRef.matchNumber, awayRef.matchNumber]);
    }
  }
  if (childrenByParent.size === 0) return null;

  // Pass 2: once BOTH of a match's feeders are decided, that match's own row
  // gets updated with real team names and the "No.X" text above disappears —
  // so a match can drop out of childrenByParent even though it's still
  // structurally internal. Reconstruct those rows' children by matching their
  // real team names against the *computed* winner of still-unclaimed
  // subtrees, walking rounds from the entry round (deepest section_no,
  // i.e. most negative) upward so a row's children are always resolved
  // before the row itself is examined.
  const bySection = new Map<number, number[]>();
  for (const [matchNumber, row] of rowsByMatchNumber) {
    const sectionNo = Number.parseInt(row.section_no, 10);
    if (!Number.isInteger(sectionNo)) continue;
    const group = bySection.get(sectionNo);
    if (group) group.push(matchNumber);
    else bySection.set(sectionNo, [matchNumber]);
  }
  const sectionOrder = [...bySection.keys()].sort((a, b) => a - b);
  const entrySectionNo = sectionOrder[0];

  // Winner name of the subtree currently rooted at a match number, known only
  // for rows that have actually been played.
  const winnerNameByMatchNumber = new Map<number, string>();
  const unclaimed = new Set<number>(bySection.get(entrySectionNo) ?? []);
  for (const matchNumber of unclaimed) {
    const winner = determineWinner(rowsByMatchNumber.get(matchNumber)!);
    if (winner) winnerNameByMatchNumber.set(matchNumber, winner);
  }

  const resolveChild = (name: string | null | undefined): number | undefined => {
    const ref = parseSlotReference(name);
    if (ref?.role === 'winner' && unclaimed.has(ref.matchNumber)) return ref.matchNumber;
    if (!name) return undefined;
    for (const candidate of unclaimed) {
      if (winnerNameByMatchNumber.get(candidate) === name) return candidate;
    }
    return undefined;
  };

  for (const sectionNo of sectionOrder.slice(1)) {
    for (const matchNumber of bySection.get(sectionNo)!) {
      const row = rowsByMatchNumber.get(matchNumber)!;
      if (!childrenByParent.has(matchNumber)) {
        const homeChild = resolveChild(row.home_team);
        const awayChild = resolveChild(row.away_team);
        if (homeChild !== undefined && awayChild !== undefined && homeChild !== awayChild) {
          childrenByParent.set(matchNumber, [homeChild, awayChild]);
        }
      }
      const children = childrenByParent.get(matchNumber);
      if (!children) continue;
      unclaimed.delete(children[0]);
      unclaimed.delete(children[1]);
      unclaimed.add(matchNumber);
      const winner = determineWinner(row);
      if (winner) winnerNameByMatchNumber.set(matchNumber, winner);
    }
  }

  // The root is the unique parent that is never itself referenced as a child
  // (e.g. the final). Other terminal matches such as a 3rd-place playoff
  // (loser-refs only) never enter childrenByParent and are excluded here.
  const parentByChildPair = new Map<string, number>();
  const allChildren = new Set<number>();
  for (const [parent, [a, b]] of childrenByParent) {
    parentByChildPair.set(childPairKey(a, b), parent);
    allChildren.add(a);
    allChildren.add(b);
  }
  const rootCandidates = [...childrenByParent.keys()].filter((m) => !allChildren.has(m));
  if (rootCandidates.length !== 1) return null;

  const leafMatchNumbers: number[] = [];
  function visit(matchNumber: number): void {
    const children = childrenByParent.get(matchNumber);
    if (children) {
      visit(children[0]);
      visit(children[1]);
    } else {
      leafMatchNumbers.push(matchNumber);
    }
  }
  visit(rootCandidates[0]);

  return { leafMatchNumbers, parentByChildPair, rowsByMatchNumber };
}
