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
