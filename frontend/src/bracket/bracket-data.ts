// Build a BracketNode tree from CSV rows and bracket_order.
//
// The bracket_order array lists teams in their bracket position (top to bottom).
// For 4 teams: [0] vs [1] → SF1, [2] vs [3] → SF2, winners → Final.

import type { RawMatchRow } from '../types/match';
import type { AggregateTiebreakCriterion } from '../types/season';
import type { BracketNode, DecidedBy, LegDetail } from './bracket-types';
import { normalizeBracketRoundLabel } from './round-label';

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
  } else if (hEx != null && aEx != null) {
    decidedBy = 'extra_time';
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
  aggregateTiebreakOrder: AggregateTiebreakCriterion[],
  children: [BracketNode | null, BracketNode | null] = [null, null],
): BracketNode {
  let upperTotal = 0;
  let lowerTotal = 0;
  let upperRegulationTotal = 0;
  let lowerRegulationTotal = 0;
  let upperAwayGoals = 0;
  let lowerAwayGoals = 0;
  let upperWins = 0;
  let lowerWins = 0;
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
    const hex = parse(row.home_score_ex) ?? 0;
    const aex = parse(row.away_score_ex) ?? 0;
    const regulationHg = hg - hex;
    const regulationAg = ag - aex;

    // home_goal/away_goal already include ET — don't add score_ex again
    const isUpperHome = row.home_team === upperTeam;
    upperTotal += isUpperHome ? hg : ag;
    lowerTotal += isUpperHome ? ag : hg;
    upperRegulationTotal += isUpperHome ? regulationHg : regulationAg;
    lowerRegulationTotal += isUpperHome ? regulationAg : regulationHg;
    upperAwayGoals += isUpperHome ? 0 : regulationAg;
    lowerAwayGoals += isUpperHome ? regulationAg : 0;
    if (regulationHg > regulationAg) {
      if (isUpperHome) upperWins += 1;
      else lowerWins += 1;
    } else if (regulationAg > regulationHg) {
      if (isUpperHome) lowerWins += 1;
      else upperWins += 1;
    }

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

    if (!roundName && row.round) roundName = normalizeBracketRoundLabel(row.round);
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
  let decidedBy: DecidedBy | null = 'pending';
  if (allPlayed) {
    if (aggregateTiebreakOrder.includes('wins')) {
      if (upperWins > lowerWins) {
        winner = upperTeam;
        decidedBy = 'aggregate_wins';
      } else if (lowerWins > upperWins) {
        winner = lowerTeam;
        decidedBy = 'aggregate_wins';
      }
    }

    if (!winner && upperRegulationTotal > lowerRegulationTotal) winner = upperTeam;
    else if (!winner && lowerRegulationTotal > upperRegulationTotal) winner = lowerTeam;
    if (winner) {
      decidedBy ??= 'aggregate_score';
      if (decidedBy === 'pending') decidedBy = 'aggregate_score';
    } else {
      for (const criterion of aggregateTiebreakOrder) {
        if (criterion === 'wins') continue;
        if (criterion === 'away_goals' && matches.length === 2) {
          if (upperAwayGoals > lowerAwayGoals) {
            winner = upperTeam;
            decidedBy = 'aggregate_away_goals';
            break;
          }
          if (lowerAwayGoals > upperAwayGoals) {
            winner = lowerTeam;
            decidedBy = 'aggregate_away_goals';
            break;
          }
        }
      }

      if (!winner) {
        if (upperTotal > lowerTotal) {
          winner = upperTeam;
          decidedBy = 'aggregate_extra_time';
        } else if (lowerTotal > upperTotal) {
          winner = lowerTeam;
          decidedBy = 'aggregate_extra_time';
        }
      }

      if (!winner && aggregateTiebreakOrder.includes('penalties')) {
        const lastMatch = [...matches].reverse().find(r => r.home_goal && r.away_goal);
        if (lastMatch?.home_pk_score && lastMatch?.away_pk_score) {
          const hpk = parseInt(lastMatch.home_pk_score, 10);
          const apk = parseInt(lastMatch.away_pk_score, 10);
          const isUpperHome = lastMatch.home_team === upperTeam;
          upperPk = isUpperHome ? hpk : apk;
          lowerPk = isUpperHome ? apk : hpk;
          const pkWinner = hpk > apk ? lastMatch.home_team : lastMatch.away_team;
          winner = pkWinner === upperTeam ? upperTeam : lowerTeam;
          decidedBy = 'aggregate_penalties';
        }
      }
    }
  }

  if (!winner) {
    decidedBy = 'pending';
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
  aggregateTiebreakOrder: AggregateTiebreakCriterion[],
  children: [BracketNode | null, BracketNode | null] = [null, null],
): BracketNode {
  const matches = findMatches(rows, upperTeam, lowerTeam);
  if (matches.length <= 1) {
    return nodeFromMatch(matches[0], upperTeam, lowerTeam, children);
  }
  return nodeFromAggregate(matches, upperTeam, lowerTeam, aggregateTiebreakOrder, children);
}

/**
 * Recursively build a bracket tree from bracket_order positions.
 */
function isValidPairingOrder(order: number[], width: number): boolean {
  if (order.length !== width) return false;
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= width || seen.has(index)) {
      return false;
    }
    seen.add(index);
  }
  return true;
}

function buildNode(
  rows: RawMatchRow[],
  teams: (string | null)[],
  aggregateTiebreakOrder: AggregateTiebreakCriterion[],
  pairingOrders?: number[][],
): BracketNode {
  if (teams.length === 2) {
    return resolveMatch(rows, teams[0], teams[1], aggregateTiebreakOrder);
  }

  let levelNodes: BracketNode[] = [];
  for (let i = 0; i < teams.length; i += 2) {
    levelNodes.push(resolveMatch(
      rows,
      teams[i] ?? null,
      teams[i + 1] ?? null,
      aggregateTiebreakOrder,
    ));
  }
  let level = 0;

  while (levelNodes.length > 1) {
    const pairingOrder = pairingOrders?.[level];
    const orderedNodes = (pairingOrder && isValidPairingOrder(pairingOrder, levelNodes.length))
      ? pairingOrder.map(index => levelNodes[index])
      : levelNodes;

    const nextLevel: BracketNode[] = [];
    for (let i = 0; i < orderedNodes.length; i += 2) {
      const upper = orderedNodes[i];
      const lower = orderedNodes[i + 1];
      nextLevel.push(resolveMatch(
        rows,
        upper.winner,
        lower.winner,
        aggregateTiebreakOrder,
        [upper, lower],
      ));
    }
    levelNodes = nextLevel;
    level += 1;
  }

  return levelNodes[0];
}

/**
 * Build the full bracket tree from CSV rows and bracket_order.
 *
 * @param rows - Parsed CSV rows for the KO stage.
 * @param bracketOrder - Teams in bracket position order (top to bottom).
 * @returns Root BracketNode of the tournament tree.
 */
export function buildBracket(
  rows: RawMatchRow[],
  bracketOrder: (string | null)[],
  aggregateTiebreakOrder: AggregateTiebreakCriterion[] = ['penalties'],
  pairingOrders?: number[][],
): BracketNode {
  if (bracketOrder.length < 2) {
    throw new Error(`bracket_order must have at least 2 teams, got ${bracketOrder.length}`);
  }
  return buildNode(rows, bracketOrder, aggregateTiebreakOrder, pairingOrders);
}

/**
 * Mask a bracket tree for a target date.
 * - Nodes with matchDate > targetDate: clear scores and winner, keep date/stadium
 * - Aggregate (H&A) nodes: use earliest leg date; partially mask if between legs
 * - Nodes whose child winner is unknown: set corresponding team to null (TBD)
 * Walks bottom-up (children before parent) so winner propagation works correctly.
 */
export function maskBracketForDate(node: BracketNode, targetDate: string): BracketNode {
  // Recurse into children first
  const [upper, lower] = node.children;
  const maskedUpper = upper ? maskBracketForDate(upper, targetDate) : null;
  const maskedLower = lower ? maskBracketForDate(lower, targetDate) : null;

  // Determine effective match date.
  // Aggregate (H&A) nodes don't have matchDate; derive from earliest leg date.
  let effectiveDate = node.matchDate;
  if (!effectiveDate && node.legs) {
    const legDates = node.legs
      .map(l => l.matchDate)
      .filter((d): d is string => d != null)
      .sort();
    if (legDates.length > 0) effectiveDate = legDates[0];
  }

  const isFuture = effectiveDate != null && effectiveDate > targetDate;

  if (isFuture) {
    // Replace teams with child winners (may be null = TBD)
    const homeTeam = maskedUpper ? maskedUpper.winner : node.homeTeam;
    const awayTeam = maskedLower ? maskedLower.winner : node.awayTeam;
    return {
      ...node,
      homeTeam,
      awayTeam,
      homeGoal: undefined,
      awayGoal: undefined,
      homePkScore: undefined,
      awayPkScore: undefined,
      homeScoreEx: undefined,
      awayScoreEx: undefined,
      legs: undefined,
      status: 'ＶＳ',
      winner: null,
      decidedBy: 'pending',
      children: [maskedUpper, maskedLower],
    };
  }

  // Partial H&A masking: some legs played, some still in the future.
  // Show only played legs and recalculate partial aggregate (no winner yet).
  if (node.legs && node.legs.some(l => l.matchDate != null && l.matchDate > targetDate)) {
    const playedLegs = node.legs.filter(
      l => !l.matchDate || l.matchDate <= targetDate,
    );
    let upperTotal = 0;
    let lowerTotal = 0;
    for (const leg of playedLegs) {
      if (leg.homeGoal == null || leg.awayGoal == null) continue;
      const isUpperHome = leg.homeTeam === node.homeTeam;
      upperTotal += isUpperHome ? leg.homeGoal : leg.awayGoal;
      lowerTotal += isUpperHome ? leg.awayGoal : leg.homeGoal;
    }
    return {
      ...node,
      homeGoal: playedLegs.length > 0 ? upperTotal : undefined,
      awayGoal: playedLegs.length > 0 ? lowerTotal : undefined,
      homePkScore: undefined,
      awayPkScore: undefined,
      homeScoreEx: undefined,
      awayScoreEx: undefined,
      winner: null,
      decidedBy: 'pending',
      status: 'ＶＳ',
      legs: playedLegs.length > 0 ? playedLegs : undefined,
      children: [maskedUpper, maskedLower],
    };
  }

  // Not future: keep original data but use masked children
  return { ...node, children: [maskedUpper, maskedLower] };
}
