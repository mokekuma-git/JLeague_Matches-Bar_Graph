import { describe, test, expect } from 'vitest';
import { generateRuleNotes } from '../../config/rule-notes';

describe('generateRuleNotes', () => {
  test('standard + default tiebreak → no notes', () => {
    expect(generateRuleNotes('standard', ['goal_diff', 'goal_get'])).toEqual([]);
  });

  test('victory-count → point system note only', () => {
    const notes = generateRuleNotes('victory-count', ['goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('勝ち=1点');
  });

  test('win3all-pkloss1 → describes all wins=3 and PK loss=1', () => {
    const notes = generateRuleNotes('win3all-pkloss1', ['goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('PK負け=1点');
  });

  test('graduated-win → describes ET=2 and PK=1', () => {
    const notes = generateRuleNotes('graduated-win', ['goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('延長勝ち=2点');
    expect(notes[0]).toContain('PK勝ち=1点');
  });

  test('ex-win-2 → describes ET=2 and draw=1', () => {
    const notes = generateRuleNotes('ex-win-2', ['goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('延長勝ち=2点');
    expect(notes[0]).toContain('引分け=1点');
  });

  test('pk-win2-loss1 → describes PK win=2 and PK loss=1', () => {
    const notes = generateRuleNotes('pk-win2-loss1', ['goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('PK勝ち=2点');
    expect(notes[0]).toContain('PK負け=1点');
  });

  test('non-default tiebreak order → generates tiebreak note', () => {
    const notes = generateRuleNotes('standard', ['head_to_head', 'goal_diff', 'goal_get']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('直接対戦');
    expect(notes[0]).toContain('得失点差');
    expect(notes[0]).toContain('総得点');
    expect(notes[0]).toContain('→');
  });

  test('non-standard point system + non-default tiebreak → both notes', () => {
    const notes = generateRuleNotes('graduated-win', ['head_to_head', 'goal_diff', 'goal_get']);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('延長勝ち=2点');
    expect(notes[1]).toContain('直接対戦');
  });

  test('unknown tiebreak key falls back to raw key name', () => {
    const notes = generateRuleNotes('standard', ['unknown_key', 'goal_diff']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('unknown_key');
  });

  test('aggregate away-goals annotation note is added when configured', () => {
    const notes = generateRuleNotes('standard', ['goal_diff', 'goal_get'], ['away_goals']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('(AGn)');
    expect(notes[0]).toContain('アウェイゴール');
  });
});
