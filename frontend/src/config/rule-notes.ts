// Auto-generated rule notes for non-standard point systems and tiebreak orders.

import type { PointSystem } from '../types/config';
import type { AggregateTiebreakCriterion } from '../types/season';
import type { MessageKey } from '../i18n';
import { t } from '../i18n';

/** Point system → i18n key. 'standard' is omitted (no note needed). */
const POINT_SYSTEM_NOTE_KEYS: Partial<Record<PointSystem, MessageKey>> = {
  'victory-count':   'rule.victoryCount',
  'win3all-pkloss1': 'rule.win3allPkloss1',
  'graduated-win':   'rule.graduatedWin',
  'ex-win-2':        'rule.exWin2',
  'pk-win2-loss1':   'rule.pkWin2Loss1',
};

/** Tiebreak criteria → i18n key. */
const TIEBREAK_LABEL_KEYS: Record<string, MessageKey> = {
  head_to_head: 'rule.headToHead',
  goal_diff: 'rule.goalDiff',
  goal_get: 'rule.goalGet',
  wins: 'rule.wins',
};

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
  aggregateTiebreakOrder: readonly AggregateTiebreakCriterion[] = [],
): string[] {
  const notes: string[] = [];

  const psKey = POINT_SYSTEM_NOTE_KEYS[pointSystem];
  if (psKey) notes.push(t(psKey));

  if (!arraysEqual(tiebreakOrder, DEFAULT_TIEBREAK)) {
    const labels = tiebreakOrder.map(k => {
      const key = TIEBREAK_LABEL_KEYS[k];
      return key ? t(key) : k;
    });
    notes.push(t('rule.tiebreakPrefix') + labels.join(' → '));
  }

  if (aggregateTiebreakOrder.includes('away_goals')) {
    notes.push(t('bracketNote.agAnnotation'));
  }

  return notes;
}
