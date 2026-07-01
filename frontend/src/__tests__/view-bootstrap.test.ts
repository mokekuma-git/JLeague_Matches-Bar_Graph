import { describe, expect, it } from 'vitest';
import {
  clampToSlider,
  createSharedViewerControlState,
  normalizeTargetDate,
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
    expect(createSharedViewerControlState({ targetDate: '2026-06-28' }).targetDate)
      .toBe('2026/06/28');
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
