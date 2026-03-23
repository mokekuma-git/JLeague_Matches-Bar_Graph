import type { RawMatchRow } from '../types/match';
import { normalizeBracketRoundLabel } from './round-label';

/**
 * Infer round_filter from bracket_order teams and CSV time-series data.
 *
 * Algorithm:
 *  1. Collect candidate matches where both teams appear in bracketOrder
 *  2. Group by normalized round label, find earliest datetime and match count
 *  3a. matchup_pairs: pick the round with the most candidate matches
 *      (no time filter — bracket_order teams share GS/KO, count separates them)
 *  3b. normal: estimate bracket_start = first of chronologically last K rounds
 *      (K = ceil(log2(bracketOrder.length))), return rounds on or after it
 *
 * Returns undefined when inference is not possible (empty bracket, no candidates).
 */
export function inferRoundFilter(
  rows: RawMatchRow[],
  bracketOrder: (string | null)[],
  matchupPairs?: boolean,
): string[] | undefined {
  // Extract real teams from bracket positions
  const teams = new Set(bracketOrder.filter((t): t is string => t !== null));
  if (teams.size === 0) return undefined;

  // Find candidate matches: both home and away must be in the bracket team set
  const candidates = rows.filter(
    r => r.round && teams.has(r.home_team) && teams.has(r.away_team),
  );
  if (candidates.length === 0) return undefined;

  // Group by normalized round → earliest datetime + match count
  const roundEarliest = new Map<string, string>();
  const roundCount = new Map<string, number>();
  for (const row of candidates) {
    const round = normalizeBracketRoundLabel(row.round!);
    if (!round) continue;
    const datetime = `${row.match_date} ${row.start_time}`;
    const current = roundEarliest.get(round);
    if (!current || datetime < current) {
      roundEarliest.set(round, datetime);
    }
    roundCount.set(round, (roundCount.get(round) ?? 0) + 1);
  }
  if (roundEarliest.size === 0) return undefined;

  // Sort rounds chronologically by their earliest match
  const roundsByDate = [...roundEarliest.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([round]) => round);

  // matchup_pairs: pick the round with the most matches (ties → latest by date)
  if (matchupPairs) {
    let bestRound: string | undefined;
    let bestCount = 0;
    for (const round of roundsByDate) {
      const count = roundCount.get(round) ?? 0;
      if (count >= bestCount) {
        bestCount = count;
        bestRound = round;
      }
    }
    return bestRound ? [bestRound] : undefined;
  }

  // Normal: expected bracket depth K = ceil(log2(leaf positions))
  // TODO: K can over-estimate for mid-join blocks (e.g. 2011 JLeagueCup where
  // block winners merge into a shared QF). Possible refinements:
  //   - Detect bye positions to derive effective pair count
  //   - Account for seeded-team single-side placement
  //   - Use section pair count instead of full leaf count
  // Currently all sections infer correctly without these, but edge cases in
  // future tournaments may benefit from a more precise K calculation.
  const K = Math.max(1, Math.ceil(Math.log2(bracketOrder.length)));

  // bracket_start = first of the chronologically last K rounds
  const startIndex = Math.max(0, roundsByDate.length - K);
  const bracketStartDatetime = roundEarliest.get(roundsByDate[startIndex])!;

  // Return all rounds on or after bracket_start, in chronological order
  const result = roundsByDate.filter(
    r => (roundEarliest.get(r) ?? '') >= bracketStartDatetime,
  );

  return result.length > 0 ? result : undefined;
}
