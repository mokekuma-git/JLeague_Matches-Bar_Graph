// Build a BracketNode tree from CSV rows and bracket_order.
//
// The bracket_order array lists teams in their bracket position (top to bottom).
// For 4 teams: [0] vs [1] → SF1, [2] vs [3] → SF2, winners → Final.

import type { RawMatchRow } from '../types/match';
import type { BracketNode, DecidedBy, LegDetail } from './bracket-types';

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

  // home_goal/away_goal already include ET — no need to add score_ex
  if (hg !== ag) return hg > ag ? row.home_team : row.away_team;

  // Equal score without PK — shouldn't happen in KO but return null
  return null;
}

/**
 * Find all CSV rows matching a matchup between two teams.
 * For H&A ties, returns both legs (in CSV order, i.e. leg 1 first).
 */
function findMatches(
  rows: RawMatchRow[], teamA: string | null, teamB: string | null,
): RawMatchRow[] {
  if (!teamA || !teamB) return [];
  return rows.filter(r =>
    (r.home_team === teamA && r.away_team === teamB) ||
    (r.home_team === teamB && r.away_team === teamA),
  );
}

/** Check if a subtree contains any real (non-null) team. */
export function hasAnyTeam(node: BracketNode | null): boolean {
  if (!node) return false;
  if (node.homeTeam || node.awayTeam) return true;
  return hasAnyTeam(node.children[0]) || hasAnyTeam(node.children[1]);
}

/**
 * Create a BracketNode from a single CSV row (or a placeholder if no match found).
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
      decidedBy: winner ? null : 'pending',
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

  const winner = determineWinner(row);
  let decidedBy: DecidedBy | null;
  if (!winner) {
    decidedBy = 'pending';
  } else if (hPk != null && aPk != null) {
    decidedBy = 'penalties';
  } else {
    decidedBy = 'score';
  }

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
    winner,
    decidedBy,
    children,
  };
}

/**
 * Create a BracketNode from multiple H&A leg rows.
 * Shows aggregate score; winner determined by total goals then PK.
 */
function nodeFromAggregate(
  matches: RawMatchRow[],
  upperTeam: string | null,
  lowerTeam: string | null,
  children: [BracketNode | null, BracketNode | null] = [null, null],
): BracketNode {
  let upperTotal = 0;
  let lowerTotal = 0;
  let allPlayed = true;
  let anyPlayed = false;
  let roundName = '';
  const legs: LegDetail[] = [];
  const parse = (v: string | undefined): number | undefined =>
    v ? parseInt(v, 10) : undefined;

  for (const row of matches) {
    if (!row.home_goal || !row.away_goal) { allPlayed = false; continue; }
    anyPlayed = true;
    const hg = parseInt(row.home_goal, 10);
    const ag = parseInt(row.away_goal, 10);

    // home_goal/away_goal already include ET — don't add score_ex again
    const isUpperHome = row.home_team === upperTeam;
    upperTotal += isUpperHome ? hg : ag;
    lowerTotal += isUpperHome ? ag : hg;

    // Store per-leg detail in CSV original order (homeTeam/awayTeam match homeGoal/awayGoal)
    legs.push({
      matchDate: row.match_date,
      stadium: row.stadium,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      homeGoal: parse(row.home_goal),
      awayGoal: parse(row.away_goal),
      homePkScore: parse(row.home_pk_score),
      awayPkScore: parse(row.away_pk_score),
      homeScoreEx: parse(row.home_score_ex),
      awayScoreEx: parse(row.away_score_ex),
      leg: row.leg,
    });

    if (!roundName && row.round) roundName = row.round;
  }

  // Aggregate ET scores across all legs (mapped to upper/lower position)
  let upperExTotal = 0;
  let lowerExTotal = 0;
  let hasEx = false;
  for (const row of matches) {
    if (!row.home_goal || !row.away_goal) continue;
    if (row.home_score_ex && row.away_score_ex) {
      hasEx = true;
      const hex = parseInt(row.home_score_ex, 10);
      const aex = parseInt(row.away_score_ex, 10);
      const isUpperHome = row.home_team === upperTeam;
      upperExTotal += isUpperHome ? hex : aex;
      lowerExTotal += isUpperHome ? aex : hex;
    }
  }

  let winner: string | null = null;
  let upperPk: number | undefined;
  let lowerPk: number | undefined;
  if (allPlayed) {
    if (upperTotal > lowerTotal) winner = upperTeam;
    else if (lowerTotal > upperTotal) winner = lowerTeam;
    else {
      // Aggregate tied — PK only happens in the decisive (last) leg
      const lastMatch = [...matches].reverse().find(r => r.home_goal && r.away_goal);
      if (lastMatch?.home_pk_score && lastMatch?.away_pk_score) {
        const hpk = parseInt(lastMatch.home_pk_score, 10);
        const apk = parseInt(lastMatch.away_pk_score, 10);
        const isUpperHome = lastMatch.home_team === upperTeam;
        upperPk = isUpperHome ? hpk : apk;
        lowerPk = isUpperHome ? apk : hpk;
        const pkWinner = hpk > apk ? lastMatch.home_team : lastMatch.away_team;
        winner = pkWinner === upperTeam ? upperTeam : lowerTeam;
      }
    }
  }

  let decidedBy: DecidedBy | null;
  if (!winner) {
    decidedBy = 'pending';
  } else if (upperTotal === lowerTotal) {
    // Aggregate tied → winner decided by PK
    decidedBy = 'penalties';
  } else {
    decidedBy = 'score';
  }

  return {
    round: roundName,
    homeTeam: upperTeam,
    awayTeam: lowerTeam,
    homeGoal: anyPlayed ? upperTotal : undefined,
    awayGoal: anyPlayed ? lowerTotal : undefined,
    homePkScore: upperPk,
    awayPkScore: lowerPk,
    homeScoreEx: hasEx ? upperExTotal : undefined,
    awayScoreEx: hasEx ? lowerExTotal : undefined,
    status: allPlayed ? '試合終了' : 'ＶＳ',
    winner,
    decidedBy,
    legs: legs.length > 0 ? legs : undefined,
    children,
  };
}

/**
 * Resolve a matchup: single match uses nodeFromMatch, H&A uses nodeFromAggregate.
 */
function resolveMatch(
  rows: RawMatchRow[],
  upperTeam: string | null,
  lowerTeam: string | null,
  children: [BracketNode | null, BracketNode | null] = [null, null],
): BracketNode {
  const matches = findMatches(rows, upperTeam, lowerTeam);
  if (matches.length <= 1) {
    return nodeFromMatch(matches[0], upperTeam, lowerTeam, children);
  }
  return nodeFromAggregate(matches, upperTeam, lowerTeam, children);
}

/**
 * Recursively build a bracket tree from bracket_order positions.
 */
function buildNode(rows: RawMatchRow[], teams: (string | null)[]): BracketNode {
  if (teams.length === 2) {
    return resolveMatch(rows, teams[0], teams[1]);
  }

  const mid = Math.floor(teams.length / 2);
  const upper = buildNode(rows, teams.slice(0, mid));
  const lower = buildNode(rows, teams.slice(mid));

  return resolveMatch(rows, upper.winner, lower.winner, [upper, lower]);
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
