// Auto-generated rule notes for non-standard point systems and tiebreak orders.
//
// i18n strategy: all user-facing strings live in the dictionaries below.
// To add a locale, introduce a Record<Locale, ...> wrapper around each dictionary
// and pass a locale parameter to generateRuleNotes().

import type { PointSystem } from '../types/config';

/** Point system rule descriptions. 'standard' is omitted (no note needed). */
const POINT_SYSTEM_NOTES: Partial<Record<PointSystem, string>> = {
  'victory-count':   '勝敗数のみカウント (勝ち=1点)',
  'win3all-pkloss1': '勝ち=3点 (90分/延長/PK共通), PK負け=1点',
  'graduated-win':   '90分勝ち=3点, 延長勝ち=2点, PK勝ち=1点',
  'ex-win-2':        '90分勝ち=3点, 延長勝ち=2点, 引分け=1点',
  'pk-win2-loss1':   '勝ち=3点, PK勝ち=2点, PK負け=1点',
};

/** Human-readable labels for tiebreak criteria. */
const TIEBREAK_LABELS: Record<string, string> = {
  head_to_head: '直接対戦',
  goal_diff: '得失点差',
  goal_get: '総得点',
  wins: '勝利数',
};

const TIEBREAK_PREFIX = '同勝点時の順位決定: ';

/** Default tiebreak order — no note generated when this is the active order. */
const DEFAULT_TIEBREAK: readonly string[] = ['goal_diff', 'goal_get'];

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Generates rule-explanation notes for the active point system and tiebreak order.
 * Returns an empty array when both are standard/default.
 */
export function generateRuleNotes(
  pointSystem: PointSystem,
  tiebreakOrder: readonly string[],
): string[] {
  const notes: string[] = [];

  const psNote = POINT_SYSTEM_NOTES[pointSystem];
  if (psNote) notes.push(psNote);

  if (!arraysEqual(tiebreakOrder, DEFAULT_TIEBREAK)) {
    const labels = tiebreakOrder.map(k => TIEBREAK_LABELS[k] ?? k);
    notes.push(TIEBREAK_PREFIX + labels.join(' → '));
  }

  return notes;
}
