import { describe, expect, it } from 'vitest';
import {
  clampToSlider,
  createSharedDateState,
  readViewNumberPref,
  normalizeTargetDate,
  restoreTargetDate,
  toInputDate,
} from '../view-bootstrap';

describe('viewer preference normalization', () => {
  it.each([
    ['2026-06-28', '2026/06/28'],
    ['2026/06/28', '2026/06/28'],
    [undefined, null],
    ['', null],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeTargetDate(input)).toBe(expected);
  });

  it('converts a canonical date for input[type=date]', () => {
    expect(toInputDate('2026/06/28')).toBe('2026-06-28');
  });

  it('migrates a legacy saved targetDate when creating shared state', () => {
    expect(createSharedDateState({ targetDate: '2026-06-28' }).targetDate)
      .toBe('2026/06/28');
  });
});

describe('restoreTargetDate', () => {
  it('keeps a real user-chosen date', () => {
    expect(restoreTargetDate('2026/06/28')).toBe('2026/06/28');
  });

  it.each(['1970/01/01', '1970-01-01'])(
    'drops the preseason sentinel %s left by older builds',
    (saved) => {
      expect(restoreTargetDate(saved)).toBeNull();
    },
  );

  it('drops a persisted sentinel when creating shared state', () => {
    expect(createSharedDateState({ targetDate: '1970/01/01' }).targetDate)
      .toBeNull();
  });
});

describe('clampToSlider', () => {
  const slider = { min: '0.3', max: '1', value: '1' } as HTMLInputElement;

  it('clamps values below the bracket minimum', () => {
    expect(clampToSlider(0.1, slider)).toBe(0.3);
  });

  it('keeps values inside the slider range', () => {
    expect(clampToSlider(0.7, slider)).toBe(0.7);
  });
});

describe('readViewNumberPref', () => {
  it('prefers the per-view key', () => {
    expect(readViewNumberPref('0.9', '0.5', 1)).toBe(0.9);
  });

  it('falls back to the legacy shared key so existing settings carry over', () => {
    expect(readViewNumberPref(undefined, '0.5', 1)).toBe(0.5);
  });

  it("falls back to the view's own default when neither is stored", () => {
    expect(readViewNumberPref(undefined, undefined, 0.2)).toBe(0.2);
  });

  it('ignores unparseable stored values', () => {
    expect(readViewNumberPref('abc', undefined, 0.2)).toBe(0.2);
  });
});
