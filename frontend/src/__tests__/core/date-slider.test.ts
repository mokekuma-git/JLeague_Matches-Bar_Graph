// @vitest-environment happy-dom

import { describe, expect, test } from 'vitest';
import {
  PRESEASON_SENTINEL,
  findSliderIndex,
  formatSliderDate,
  getLastMatchDate,
  getSliderDate,
  resolveTargetDate,
  syncSliderToTargetDate,
} from '../../core/date-slider';

describe('date-slider helpers', () => {
  const DATES = [PRESEASON_SENTINEL, '2026/03/08', '2026/03/15', '2026/03/22'];

  describe('findSliderIndex', () => {
    test('targetDate before first real match -> 0', () => {
      expect(findSliderIndex(DATES, '2026/01/01')).toBe(0);
    });

    test('targetDate between two match dates -> last index <= targetDate', () => {
      expect(findSliderIndex(DATES, '2026/03/10')).toBe(1);
    });

    test('targetDate after last match -> last index', () => {
      expect(findSliderIndex(DATES, '2099/12/31')).toBe(3);
    });
  });

  describe('formatSliderDate', () => {
    test('sentinel -> preseason label', () => {
      expect(formatSliderDate(PRESEASON_SENTINEL, '2026/03/08')).toBe('開幕前');
    });

    test('real match date -> targetDate', () => {
      expect(formatSliderDate('2026/03/08', '2026/03/10')).toBe('2026/03/10');
    });
  });

  test('getSliderDate returns null for out-of-range index', () => {
    expect(getSliderDate(DATES, 99)).toBeNull();
  });

  test('getLastMatchDate returns null for empty matchDates', () => {
    expect(getLastMatchDate([])).toBeNull();
  });

  test('resolveTargetDate falls back to the latest match date', () => {
    expect(resolveTargetDate(DATES, null)).toBe('2026/03/22');
  });

  test('syncSliderToTargetDate aligns slider to effective target date', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    syncSliderToTargetDate(slider, DATES, '2026/03/10');
    expect(slider.max).toBe('3');
    expect(slider.value).toBe('1');
  });

  test('syncSliderToTargetDate uses latest date when targetDate is absent', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    syncSliderToTargetDate(slider, DATES, undefined);
    expect(slider.value).toBe('3');
  });
});
