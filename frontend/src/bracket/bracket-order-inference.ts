import type { RawMatchRow } from '../types/match';

function parseMatchNumber(row: RawMatchRow): number | undefined {
  if (!row.match_number) return undefined;
  const value = Number.parseInt(row.match_number, 10);
  return Number.isNaN(value) ? undefined : value;
}

function parseBracketDepth(row: RawMatchRow): number | undefined {
  const value = Number.parseInt(row.section_no, 10);
  if (Number.isNaN(value) || value >= 0) return undefined;
  return Math.abs(value);
}

function buildSeedSubtree(team: string, sideSize: number): (string | null)[] {
  return [team, ...Array.from({ length: Math.max(0, sideSize - 1) }, () => null)];
}

export function extractTeamsFromBracketOrder(bracketOrder: readonly (string | null)[]): string[] {
  return bracketOrder.filter((team): team is string => team != null);
}

/**
 * Reconstruct a full bracket_order from KO CSV rows with match_number.
 *
 * The algorithm walks backward from the final match and uses each team's
 * previous match_number as the feeder subtree. When a team first appears in a
 * later round, the remaining side slots become byes.
 */
export function inferBracketOrderFromRows(rows: RawMatchRow[]): (string | null)[] | undefined {
  const numberedRows = rows
    .map((row) => {
      const matchNumber = parseMatchNumber(row);
      const bracketDepth = parseBracketDepth(row);
      return matchNumber !== undefined && bracketDepth !== undefined
        ? { row, matchNumber, bracketDepth }
        : undefined;
    })
    .filter((value): value is { row: RawMatchRow; matchNumber: number; bracketDepth: number } => (
      value !== undefined
    ))
    .sort((a, b) => a.matchNumber - b.matchNumber);

  if (numberedRows.length === 0) return undefined;

  const maxDepth = Math.max(...numberedRows.map(({ bracketDepth }) => bracketDepth));
  const rowsByMatchNumber = new Map(
    numberedRows.map(({ matchNumber, row }) => [matchNumber, row]),
  );
  const matchHistory = new Map<string, number[]>();
  for (const { row, matchNumber } of numberedRows) {
    for (const team of [row.home_team, row.away_team]) {
      const history = matchHistory.get(team) ?? [];
      history.push(matchNumber);
      matchHistory.set(team, history);
    }
  }

  const finalMatchNumber = numberedRows[numberedRows.length - 1]?.matchNumber;
  if (finalMatchNumber === undefined) return undefined;

  function expandTeam(team: string, currentMatchNumber: number, sideSize: number): (string | null)[] {
    const history = matchHistory.get(team) ?? [];
    const feederMatchNumber = [...history].reverse().find((matchNumber) => matchNumber < currentMatchNumber);
    if (feederMatchNumber === undefined) {
      return buildSeedSubtree(team, sideSize);
    }

    const feederRow = rowsByMatchNumber.get(feederMatchNumber);
    if (!feederRow) {
      return buildSeedSubtree(team, sideSize);
    }

    return expandMatch(feederRow, feederMatchNumber);
  }

  function expandMatch(row: RawMatchRow, matchNumber: number): (string | null)[] {
    const bracketDepth = parseBracketDepth(row);
    if (bracketDepth === undefined) {
      return [row.home_team, row.away_team];
    }

    const sideSize = 2 ** (maxDepth - bracketDepth);
    return [
      ...expandTeam(row.home_team, matchNumber, sideSize),
      ...expandTeam(row.away_team, matchNumber, sideSize),
    ];
  }

  const finalRow = rowsByMatchNumber.get(finalMatchNumber);
  if (!finalRow) return undefined;
  return expandMatch(finalRow, finalMatchNumber);
}
