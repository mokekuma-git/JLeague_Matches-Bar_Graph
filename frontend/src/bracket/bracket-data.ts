// Build a BracketNode tree from CSV rows and bracket_order.
//
// The bracket_order array lists teams in their bracket position (top to bottom).
// For 4 teams: [0] vs [1] → SF1, [2] vs [3] → SF2, winners → Final.

import type { RawMatchRow } from '../types/match';
import type { BracketNode } from './bracket-types';

/**
 * Determine the winner of a KO match from a CSV row.
 * Returns null if the match hasn't been played.
 */
function determineWinner(row: RawMatchRow): string | null {
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

  // Total score (regular + extra time if present)
  const hex = row.home_score_ex ? parseInt(row.home_score_ex, 10) : 0;
  const aex = row.away_score_ex ? parseInt(row.away_score_ex, 10) : 0;
  const totalH = hg + hex;
  const totalA = ag + aex;
  if (totalH !== totalA) return totalH > totalA ? row.home_team : row.away_team;

  // Equal total score without PK — shouldn't happen in KO but return null
  return null;
}

/**
 * Find a CSV row matching a matchup between two teams.
 */
function findMatch(
  rows: RawMatchRow[], teamA: string | null, teamB: string | null,
): RawMatchRow | undefined {
  if (!teamA || !teamB) return undefined;
  return rows.find(r =>
    (r.home_team === teamA && r.away_team === teamB) ||
    (r.home_team === teamB && r.away_team === teamA),
  );
}

/** Check if a subtree contains any real (non-null) team. */
function hasAnyTeam(node: BracketNode | null): boolean {
  if (!node) return false;
  if (node.homeTeam || node.awayTeam) return true;
  return hasAnyTeam(node.children[0]) || hasAnyTeam(node.children[1]);
}

/**
 * Create a BracketNode from a CSV row (or a placeholder if no match found).
 */
function nodeFromMatch(
  row: RawMatchRow | undefined,
  upperTeam: string | null,
  lowerTeam: string | null,
  children: [BracketNode | null, BracketNode | null] = [null, null],
): BracketNode {
  if (!row) {
    // Auto-advance: if one team exists and the opponent side is entirely
    // empty (no real teams in the subtree), the existing team wins.
    // This handles single-round byes (leaf) and multi-round skips (deep).
    let winner: string | null = null;
    if (upperTeam && !lowerTeam && !hasAnyTeam(children[1])) {
      winner = upperTeam;
    } else if (!upperTeam && lowerTeam && !hasAnyTeam(children[0])) {
      winner = lowerTeam;
    }
    return {
      round: '',
      homeTeam: upperTeam,
      awayTeam: lowerTeam,
      status: 'ＶＳ',
      winner,
      children,
    };
  }

  // Preserve bracket position: upperTeam must be homeTeam in the node.
  // If CSV home/away is reversed relative to bracket order, swap scores.
  const needsSwap = upperTeam != null && row.home_team !== upperTeam;
  const parse = (v: string | undefined): number | undefined =>
    v ? parseInt(v, 10) : undefined;

  const [hGoal, aGoal] = needsSwap ? [parse(row.away_goal), parse(row.home_goal)]
    : [parse(row.home_goal), parse(row.away_goal)];
  const [hPk, aPk] = needsSwap ? [parse(row.away_pk_score), parse(row.home_pk_score)]
    : [parse(row.home_pk_score), parse(row.away_pk_score)];
  const [hEx, aEx] = needsSwap ? [parse(row.away_score_ex), parse(row.home_score_ex)]
    : [parse(row.home_score_ex), parse(row.away_score_ex)];

  return {
    round: row.round ?? '',
    matchNumber: row.match_number ? parseInt(row.match_number, 10) : undefined,
    homeTeam: needsSwap ? row.away_team : row.home_team,
    awayTeam: needsSwap ? row.home_team : row.away_team,
    homeGoal: hGoal, awayGoal: aGoal,
    homePkScore: hPk, awayPkScore: aPk,
    homeScoreEx: hEx, awayScoreEx: aEx,
    matchDate: row.match_date,
    stadium: row.stadium,
    status: row.status,
    winner: determineWinner(row),
    children,
  };
}

/**
 * Recursively build a bracket tree from bracket_order positions.
 */
function buildNode(rows: RawMatchRow[], teams: (string | null)[]): BracketNode {
  if (teams.length === 2) {
    const match = findMatch(rows, teams[0], teams[1]);
    return nodeFromMatch(match, teams[0], teams[1]);
  }

  const mid = Math.floor(teams.length / 2);
  const upper = buildNode(rows, teams.slice(0, mid));
  const lower = buildNode(rows, teams.slice(mid));

  const upperWinner = upper.winner;
  const lowerWinner = lower.winner;
  const match = findMatch(rows, upperWinner, lowerWinner);

  return nodeFromMatch(match, upperWinner, lowerWinner, [upper, lower]);
}

/**
 * Build the full bracket tree from CSV rows and bracket_order.
 *
 * @param rows - Parsed CSV rows for the KO stage.
 * @param bracketOrder - Teams in bracket position order (top to bottom).
 * @returns Root BracketNode of the tournament tree.
 */
export function buildBracket(rows: RawMatchRow[], bracketOrder: (string | null)[]): BracketNode {
  if (bracketOrder.length < 2) {
    throw new Error(`bracket_order must have at least 2 teams, got ${bracketOrder.length}`);
  }
  return buildNode(rows, bracketOrder);
}
