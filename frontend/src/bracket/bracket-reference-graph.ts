// Link bracket nodes to CSV rows by match_number (position) rather than by team
// name, so the link survives placeholder -> real-name updates.
//
// The topology itself is authored in season_map (`bracket_topology`) because it
// is a competition rule fixed before the draw. It used to be derived here from
// the CSV's "No.Xの勝者" feeder text, but that text is overwritten as matches
// are played, so a fully played tournament lost its structure entirely (#307).
// Feeder references are still read for one narrow purpose: deciding a parent
// row's home/away orientation while its entrant text is still a placeholder.

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
 * Build the position-linking topology from a season_map `bracket_topology`.
 *
 * @param rounds - match_number per round, entry round first, each round in
 *   bracket position order (as authored in season_map).
 * @param rows - Parsed CSV rows for the KO stage.
 * @param pairingOrders - Per level reorder applied before pairing, mirroring
 *   what buildNode() does, so authored rounds stay in plain position order.
 * @returns Topology, or null when the rounds are unusable.
 */
export function buildTopologyFromRounds(
  rounds: number[][],
  rows: RawMatchRow[],
  pairingOrders?: number[][],
): ReferenceTopology | null {
  if (!rounds.length || !rounds[0].length) return null;

  const rowsByMatchNumber = new Map<number, RawMatchRow>();
  for (const row of rows) {
    const matchNumber = parseMatchNumber(row);
    if (matchNumber !== undefined) rowsByMatchNumber.set(matchNumber, row);
  }
  if (rowsByMatchNumber.size === 0) return null;

  const parentByChildPair = new Map<string, number>();
  for (let level = 1; level < rounds.length; level += 1) {
    const below = rounds[level - 1];
    const above = rounds[level];
    if (below.length !== above.length * 2) return null;
    const pairingOrder = pairingOrders?.[level - 1];
    const ordered = (pairingOrder && pairingOrder.length === below.length)
      ? pairingOrder.map(index => below[index])
      : below;
    for (let i = 0; i < above.length; i += 1) {
      parentByChildPair.set(childPairKey(ordered[i * 2], ordered[i * 2 + 1]), above[i]);
    }
  }

  return { leafMatchNumbers: [...rounds[0]], parentByChildPair, rowsByMatchNumber };
}

/**
 * Derive the topology from the CSV's "No.Xの勝者" feeder references.
 *
 * Only for blocks that declare `topology_source: feeder_reference`. Returns
 * null when the references are no longer there to read, which happens once
 * enough of the tournament has been played -- pin the result with
 * scripts/generate_bracket_topology.py before that point.
 */
export function deriveTopologyFromFeederReferences(
  rows: RawMatchRow[],
): ReferenceTopology | null {
  const rowsByMatchNumber = new Map<number, RawMatchRow>();
  for (const row of rows) {
    const matchNumber = parseMatchNumber(row);
    if (matchNumber !== undefined) rowsByMatchNumber.set(matchNumber, row);
  }
  if (rowsByMatchNumber.size === 0) return null;

  // Pass 1: a match is an "internal" node when BOTH slots still carry a
  // "No.Xの勝者" feeder reference. Before any result overwrites the
  // placeholders this is the only signal available. Finding none no longer
  // means "not this convention" -- the block declared the convention -- it
  // means derivation failed, and the caller says so out loud (#307).
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
