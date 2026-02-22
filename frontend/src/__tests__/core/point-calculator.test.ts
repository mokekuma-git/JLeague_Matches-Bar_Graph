import { describe, test, expect } from 'vitest';
import { getPointFromResult, getMaxPointsPerGame, getWinPoints } from '../../core/point-calculator';

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

  describe('PK shootout', () => {
    test('PK win → 2 points', () => {
      expect(getPointFromResult('1', '1', false, 5, 4)).toBe(2);
      expect(getPointFromResult('0', '0', false, 3, 2)).toBe(2);
    });

    test('PK loss → 1 point', () => {
      expect(getPointFromResult('1', '1', false, 4, 5)).toBe(1);
      expect(getPointFromResult('0', '0', false, 2, 4)).toBe(1);
    });

    test('pkGet/pkLose both null → treated as regular draw (1 pt)', () => {
      expect(getPointFromResult('1', '1', false, null, null)).toBe(1);
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

  describe('old-two-points system', () => {
    test('win → 2 points', () => {
      expect(getPointFromResult('2', '1', false, null, null, 'old-two-points')).toBe(2);
    });

    test('loss → 0 points', () => {
      expect(getPointFromResult('0', '2', false, null, null, 'old-two-points')).toBe(0);
    });

    test('draw → 1 point', () => {
      expect(getPointFromResult('1', '1', false, null, null, 'old-two-points')).toBe(1);
    });
  });
});

describe('getMaxPointsPerGame', () => {
  test('standard → 3', () => {
    expect(getMaxPointsPerGame('standard')).toBe(3);
  });

  test('old-two-points → 2', () => {
    expect(getMaxPointsPerGame('old-two-points')).toBe(2);
  });

  test('defaults to standard (3)', () => {
    expect(getMaxPointsPerGame()).toBe(3);
  });
});

describe('getWinPoints', () => {
  test('standard → 3', () => {
    expect(getWinPoints('standard')).toBe(3);
  });

  test('old-two-points → 2', () => {
    expect(getWinPoints('old-two-points')).toBe(2);
  });
});
