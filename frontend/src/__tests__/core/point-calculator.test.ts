import { describe, test, expect } from 'vitest';
import { getPointFromResult, getMaxPointsPerGame, getWinPoints, getPointHeightScale } from '../../core/point-calculator';

describe('getPointFromResult', () => {
  describe('win / loss / draw', () => {
    test('win → 3 points', () => {
      expect(getPointFromResult('2', '1')).toBe(3);
      expect(getPointFromResult('3', '0')).toBe(3);
    });

    test('loss → 0 points', () => {
      expect(getPointFromResult('0', '2')).toBe(0);
      expect(getPointFromResult('1', '3')).toBe(0);
    });

    test('draw → 1 point', () => {
      expect(getPointFromResult('1', '1')).toBe(1);
      expect(getPointFromResult('0', '0')).toBe(1);
    });
  });

  describe('PK shootout (standard: pk_win=0, pk_loss=0 — PK not used in modern J-League)', () => {
    test('PK win → 0 points under standard', () => {
      expect(getPointFromResult('1', '1', null, null, 5, 4)).toBe(0);
      expect(getPointFromResult('0', '0', null, null, 3, 2)).toBe(0);
    });

    test('PK loss → 0 points under standard', () => {
      expect(getPointFromResult('1', '1', null, null, 4, 5)).toBe(0);
      expect(getPointFromResult('0', '0', null, null, 2, 4)).toBe(0);
    });

    test('pkGet/pkLose both null → treated as regular draw (1 pt)', () => {
      expect(getPointFromResult('1', '1', null, null, null, null)).toBe(1);
    });
  });

  describe('PK shootout (pk-win2-loss1: pk_win=2, pk_loss=1 — 2026 special)', () => {
    test('PK win → 2 points', () => {
      expect(getPointFromResult('1', '1', null, null, 5, 4, 'pk-win2-loss1')).toBe(2);
      expect(getPointFromResult('0', '0', null, null, 3, 2, 'pk-win2-loss1')).toBe(2);
    });

    test('PK loss → 1 point', () => {
      expect(getPointFromResult('1', '1', null, null, 4, 5, 'pk-win2-loss1')).toBe(1);
      expect(getPointFromResult('0', '0', null, null, 2, 4, 'pk-win2-loss1')).toBe(1);
    });
  });

  describe('unplayed match', () => {
    test('both goals empty → 0 points', () => {
      expect(getPointFromResult('', '')).toBe(0);
    });

    test('one goal empty → 0 points', () => {
      expect(getPointFromResult('', '1')).toBe(0);
      expect(getPointFromResult('2', '')).toBe(0);
    });
  });

  describe('string comparison behaviour (ported from JS, single-digit only)', () => {
    // goalGet > goalLose uses lexicographic string comparison.
    // Within single-digit scores this is correct: '2' > '1', '9' > '0', etc.
    test('9-1: single-digit win', () => {
      expect(getPointFromResult('9', '1')).toBe(3);
    });

    // Lexicographic edge: '9' > '1' (first char), so '9' is detected as win vs '10'.
    // Document the existing behaviour — this is a known limitation of string comparison.
    test('lexicographic edge: "9" vs "10" → treated as win (string "9" > "10")', () => {
      // String '9' > '10' because '9' > '1' at the first character.
      expect(getPointFromResult('9', '10')).toBe(3);
    });
  });

  describe('victory-count system', () => {
    test('win → 1 point', () => {
      expect(getPointFromResult('2', '1', null, null, null, null, 'victory-count')).toBe(1);
    });

    test('loss → 0 points', () => {
      expect(getPointFromResult('0', '2', null, null, null, null, 'victory-count')).toBe(0);
    });

    test('PK win → 1 point', () => {
      expect(getPointFromResult('1', '1', null, null, 5, 3, 'victory-count')).toBe(1);
    });

    test('PK loss → 0 points', () => {
      expect(getPointFromResult('1', '1', null, null, 3, 5, 'victory-count')).toBe(0);
    });

    test('draw (no PK) → 0 points', () => {
      expect(getPointFromResult('1', '1', null, null, null, null, 'victory-count')).toBe(0);
    });
  });

  describe('extra-time (ET) results', () => {
    // ET win: final score already includes ET goal (e.g. 90min 2-2 → ET 1-0 → final 3-2)
    test('ET win under standard → 3 (ex_win fallback = win)', () => {
      expect(getPointFromResult('3', '2', 1, 0)).toBe(3);
    });

    test('ET win under graduated-win → 2 (ex_win = 2)', () => {
      expect(getPointFromResult('3', '2', 1, 0, null, null, 'graduated-win')).toBe(2);
    });

    test('ET loss under graduated-win → 0 (ex_loss = 0)', () => {
      expect(getPointFromResult('2', '3', 0, 1, null, null, 'graduated-win')).toBe(0);
    });

    test('ET win under ex-win-2 → 2', () => {
      expect(getPointFromResult('2', '1', 1, 0, null, null, 'ex-win-2')).toBe(2);
    });

    test('ET 0-0 then PK: PK check takes priority over ET scores', () => {
      // ET ended 0-0 (both scoreEx=0), then PK 7-6
      expect(getPointFromResult('0', '0', 0, 0, 7, 6, 'win3all-pkloss1')).toBe(3); // PK win
      expect(getPointFromResult('0', '0', 0, 0, 6, 7, 'win3all-pkloss1')).toBe(1); // PK loss
    });

    test('no ET data (null) → regular win/loss', () => {
      expect(getPointFromResult('2', '1', null, null)).toBe(3); // regular win
      expect(getPointFromResult('1', '2', null, null)).toBe(0); // regular loss
    });
  });

  describe('win3all-pkloss1 system (1995-96)', () => {
    test('90min win → 3', () => {
      expect(getPointFromResult('2', '1', null, null, null, null, 'win3all-pkloss1')).toBe(3);
    });
    test('ET win → 3', () => {
      expect(getPointFromResult('2', '1', 1, 0, null, null, 'win3all-pkloss1')).toBe(3);
    });
    test('PK win → 3', () => {
      expect(getPointFromResult('1', '1', 0, 0, 5, 3, 'win3all-pkloss1')).toBe(3);
    });
    test('PK loss → 1', () => {
      expect(getPointFromResult('1', '1', 0, 0, 3, 5, 'win3all-pkloss1')).toBe(1);
    });
    test('loss → 0', () => {
      expect(getPointFromResult('0', '2', null, null, null, null, 'win3all-pkloss1')).toBe(0);
    });
  });

  describe('graduated-win system (1997-98)', () => {
    test('90min win → 3', () => {
      expect(getPointFromResult('2', '1', null, null, null, null, 'graduated-win')).toBe(3);
    });
    test('ET win → 2', () => {
      expect(getPointFromResult('2', '1', 1, 0, null, null, 'graduated-win')).toBe(2);
    });
    test('PK win → 1', () => {
      expect(getPointFromResult('1', '1', 0, 0, 5, 3, 'graduated-win')).toBe(1);
    });
    test('loss → 0', () => {
      expect(getPointFromResult('1', '2', null, null, null, null, 'graduated-win')).toBe(0);
    });
  });

  describe('ex-win-2 system (1999-2002)', () => {
    test('90min win → 3', () => {
      expect(getPointFromResult('2', '1', null, null, null, null, 'ex-win-2')).toBe(3);
    });
    test('ET win → 2', () => {
      expect(getPointFromResult('2', '1', 1, 0, null, null, 'ex-win-2')).toBe(2);
    });
    test('draw (ET 0-0, no PK) → 1', () => {
      expect(getPointFromResult('0', '0', 0, 0, null, null, 'ex-win-2')).toBe(1);
    });
    test('loss → 0', () => {
      expect(getPointFromResult('0', '2', null, null, null, null, 'ex-win-2')).toBe(0);
    });
  });
});

describe('getMaxPointsPerGame', () => {
  test('standard → 3', () => {
    expect(getMaxPointsPerGame('standard')).toBe(3);
  });

  test('victory-count → 1', () => {
    expect(getMaxPointsPerGame('victory-count')).toBe(1);
  });

  test('defaults to standard (3)', () => {
    expect(getMaxPointsPerGame()).toBe(3);
  });
});

describe('getWinPoints', () => {
  test('standard → 3', () => {
    expect(getWinPoints('standard')).toBe(3);
  });

  test('victory-count → 1', () => {
    expect(getWinPoints('victory-count')).toBe(1);
  });
});

describe('getPointHeightScale', () => {
  test('standard → 1', () => {
    expect(getPointHeightScale('standard')).toBe(1);
  });

  test('victory-count → 3 (1 pt rendered at 3× height)', () => {
    expect(getPointHeightScale('victory-count')).toBe(3);
  });

  test('new systems default to 1', () => {
    expect(getPointHeightScale('win3all-pkloss1')).toBe(1);
    expect(getPointHeightScale('graduated-win')).toBe(1);
    expect(getPointHeightScale('ex-win-2')).toBe(1);
    expect(getPointHeightScale('pk-win2-loss1')).toBe(1);
  });

  test('defaults to standard (1)', () => {
    expect(getPointHeightScale()).toBe(1);
  });
});
