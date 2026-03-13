export function normalizeBracketRoundLabel(round: string): string {
  return round
    .replace(/[ 　]*第[12]戦$/, '')
    .replace(/[ ]+(?:1st|2nd) Leg$/i, '')
    .trim();
}
