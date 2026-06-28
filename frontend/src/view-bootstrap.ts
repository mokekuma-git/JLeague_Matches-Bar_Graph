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

// ---- Shared viewer control state -----------------------------------------

export interface SharedViewerControlState {
  scale: number;
  futureOpacity: number;
  targetDate: string | null;
}

/** Defaults differ slightly between views (e.g. bracket's default futureOpacity is 0.2). */
export interface SharedViewerControlDefaults {
  scale?: number;
  futureOpacity?: number;
}

export function createSharedViewerControlState(
  prefs: ViewerPrefs,
  defaults: SharedViewerControlDefaults = {},
): SharedViewerControlState {
  return {
    scale: prefs.scale ? parseFloat(prefs.scale) : (defaults.scale ?? 1),
    futureOpacity: prefs.futureOpacity ? parseFloat(prefs.futureOpacity) : (defaults.futureOpacity ?? 0.1),
    targetDate: prefs.targetDate ?? null,
  };
}
