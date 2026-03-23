import { t } from '../i18n';

export const PRESEASON_SENTINEL = '1970/01/01';

export function getLastMatchDate(matchDates: string[]): string | null {
  return matchDates.length > 0 ? matchDates[matchDates.length - 1] : null;
}

/**
 * Returns the slider index for a given target date within the matchDates array.
 *
 * Finds the last index i where matchDates[i] <= targetDate.
 * If targetDate is before the first real match (or equals the sentinel '1970/01/01'),
 * returns 0 (the "開幕前" sentinel position).
 */
export function findSliderIndex(matchDates: string[], targetDate: string): number {
  let idx = matchDates.length - 1;
  for (let i = 0; i < matchDates.length; i++) {
    if (matchDates[i] > targetDate) {
      idx = Math.max(0, i - 1);
      break;
    }
  }
  return idx;
}

export function getSliderDate(matchDates: string[], sliderValue: number): string | null {
  return matchDates[sliderValue] ?? null;
}

export function resolveTargetDate(
  matchDates: string[],
  targetDate: string | null | undefined,
): string | null {
  return targetDate ?? getLastMatchDate(matchDates);
}

export function syncSliderToTargetDate(
  slider: HTMLInputElement | null,
  matchDates: string[],
  targetDate: string | null | undefined,
): void {
  if (!slider || matchDates.length === 0) return;
  slider.max = String(matchDates.length - 1);
  const effectiveTargetDate = resolveTargetDate(matchDates, targetDate);
  if (!effectiveTargetDate) return;
  slider.value = String(findSliderIndex(matchDates, effectiveTargetDate));
}

/**
 * Returns the display text for a resolved slider date.
 *
 * When sliderDate is the sentinel '1970/01/01', returns '開幕前'.
 * Otherwise returns targetDate (the exact user-requested date,
 * which may differ from sliderDate when typed between match days).
 */
export function formatSliderDate(sliderDate: string, targetDate: string): string {
  return sliderDate === PRESEASON_SENTINEL ? t('slider.preseason') : targetDate;
}
