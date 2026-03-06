import { describe, test, expect } from 'vitest';
import { findTeamsWithoutColor } from '../../graph/css-validator';

describe('findTeamsWithoutColor', () => {
  const defined = new Set(['鹿島', '浦和', '柏', '広島']);

  test('returns empty when all teams have CSS colors defined', () => {
    expect(findTeamsWithoutColor(['鹿島', '浦和'], defined)).toEqual([]);
  });

  test('returns teams without CSS color defined', () => {
    expect(findTeamsWithoutColor(['鹿島', '未知チーム'], defined)).toEqual(['未知チーム']);
  });

  test('returns all teams when none have CSS colors', () => {
    const empty = new Set<string>();
    expect(findTeamsWithoutColor(['A', 'B'], empty)).toEqual(['A', 'B']);
  });

  test('deduplicates input CSS classes', () => {
    expect(findTeamsWithoutColor(['未知', '未知', '未知'], defined)).toEqual(['未知']);
  });

  test('returns empty for empty input', () => {
    expect(findTeamsWithoutColor([], defined)).toEqual([]);
  });

  test('preserves insertion order of first occurrence', () => {
    const result = findTeamsWithoutColor(['X', 'Y', 'X', 'Z'], defined);
    expect(result).toEqual(['X', 'Y', 'Z']);
  });
});
