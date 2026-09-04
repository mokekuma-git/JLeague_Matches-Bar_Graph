// Shared initialization helpers used by league-view / bracket-view (and the
// matches-app orchestrator): URL param read/write, locale restore + i18n
// application, and the viewer-level (scale/futureOpacity/targetDate) slice of
// control state that both views derive from the same ViewerPrefs shape.

import type { ViewerPrefs } from './storage/local-storage';
import { setLocale, applyI18nAttributes } from './i18n';
import type { Locale } from './i18n';

// ---- URL parameter management ------------------------------------------

export function readUrlParams(): { competition: string; season?: string } {
  const params = new URLSearchParams(location.search);
  return {
    competition: params.get('competition') ?? '',
    season: params.get('season') ?? undefined,
  };
}

export function writeUrlParams(competition: string, season: string): void {
  const url = new URL(location.href);
  url.searchParams.set('competition', competition);
  url.searchParams.set('season', season);
  history.replaceState(null, '', url.toString());
}

// ---- Locale restore + i18n ----------------------------------------------

/**
 * Restore locale from a saved pref value (if it is a known Locale) and apply
 * data-i18n attributes. Must run before any t()/applyI18nAttributes() calls.
 * Returns the restored Locale, or undefined if the saved value was absent/invalid.
 */
export function restoreLocaleAndApplyI18n(savedLocale: string | undefined): Locale | undefined {
  const locale = (savedLocale === 'ja' || savedLocale === 'en') ? savedLocale as Locale : undefined;
  if (locale) setLocale(locale);
  applyI18nAttributes();
  return locale;
}

// ---- Shared viewer state --------------------------------------------------

/**
 * The only viewer state both views share. Scale and future opacity used to
 * live here too, but their ranges and defaults differ per view, so sharing
 * them let one view's clamp overwrite the other's setting (#302). The target
 * date stays shared so a competition's group and knockout stages can be read
 * at the same point in time.
 */
export interface SharedDateState {
  targetDate: string | null;
}

export function normalizeTargetDate(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value.replace(/-/g, '/');
}

/**
 * The bracket slider's "before any match" sentinel. Older builds wrote it into
 * the shared target date, which pinned League to a preseason view on reload.
 * Writing it is fixed (#298); this drops the value for anyone who already has
 * it saved. Kept as a literal rather than importing PRESEASON_SENTINEL so this
 * module stays free of view-layer imports.
 */
const PERSISTED_PRESEASON_SENTINEL = '1970/01/01';

/** Restore a persisted target date, discarding values that were never user-chosen. */
export function restoreTargetDate(value: string | null | undefined): string | null {
  const normalized = normalizeTargetDate(value);
  return normalized === PERSISTED_PRESEASON_SENTINEL ? null : normalized;
}

export function toInputDate(value: string | null | undefined): string {
  return normalizeTargetDate(value)?.replace(/\//g, '-') ?? '';
}

export function clampToSlider(value: number, slider: HTMLInputElement): number {
  const min = slider.min === '' ? Number.NEGATIVE_INFINITY : Number(slider.min);
  const max = slider.max === '' ? Number.POSITIVE_INFINITY : Number(slider.max);
  const finiteValue = Number.isFinite(value) ? value : Number(slider.value);
  return Math.min(max, Math.max(min, finiteValue));
}

export function createSharedDateState(prefs: ViewerPrefs): SharedDateState {
  return { targetDate: restoreTargetDate(prefs.targetDate) };
}

/**
 * Read a per-view numeric pref, falling back to the legacy shared key and then
 * to the view's own default. The legacy key is only ever read: once the user
 * touches a control, the per-view key is written and takes over from then on.
 */
export function readViewNumberPref(
  value: string | undefined,
  legacyValue: string | undefined,
  fallback: number,
): number {
  const raw = value ?? legacyValue;
  if (raw == null || raw === '') return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
