import { describe, expect, it } from 'vitest';
import type { SeasonMap } from '../types/season';
import {
  resolveInitialCompetition,
  resolveInitialSeason,
  shouldShowTimezone,
} from '../matches-orchestration';

const seasonMap: SeasonMap = {
  domestic: {
    competitions: {
      J1: {
        seasons: {
          '2026': {},
          '2025': {},
        },
      },
      EmperorsCup: {
        view_type: ['bracket'],
        seasons: {
          '2025': { bracket_round_start: '１回戦' },
          '2024': {},
        },
      },
    },
  },
};

describe('resolveInitialCompetition', () => {
  it('uses URL, prefs, then default in priority order', () => {
    expect(resolveInitialCompetition(
      seasonMap,
      { competition: 'EmperorsCup' },
      { competition: 'J1' },
    )).toBe('EmperorsCup');
    expect(resolveInitialCompetition(
      seasonMap,
      { competition: 'unknown' },
      { competition: 'EmperorsCup' },
    )).toBe('EmperorsCup');
    expect(resolveInitialCompetition(
      seasonMap,
      { competition: 'unknown' },
      { competition: 'also-unknown' },
    )).toBe('J1');
  });

  it('returns empty when no candidate exists', () => {
    expect(resolveInitialCompetition({}, {}, {}, 'unknown')).toBe('');
  });
});

describe('resolveInitialSeason', () => {
  it('uses URL, prefs, then the newest season in priority order', () => {
    expect(resolveInitialSeason(
      seasonMap,
      'J1',
      { season: '2025' },
      { season: '2026' },
    )).toBe('2025');
    expect(resolveInitialSeason(
      seasonMap,
      'J1',
      { season: 'unknown' },
      { season: '2025' },
    )).toBe('2025');
    expect(resolveInitialSeason(
      seasonMap,
      'J1',
      { season: 'unknown' },
      { season: 'also-unknown' },
    )).toBe('2026');
  });

  it('only restores a season available to the selected view', () => {
    expect(resolveInitialSeason(
      seasonMap,
      'EmperorsCup',
      { season: '2024' },
      {},
      ['2025'],
    )).toBe('2025');
  });

  it('returns empty for an unknown competition', () => {
    expect(resolveInitialSeason(seasonMap, 'unknown', {}, {})).toBe('');
  });
});

describe('shouldShowTimezone', () => {
  it('follows season timezone availability for league view', () => {
    expect(shouldShowTimezone('league', true)).toBe(true);
    expect(shouldShowTimezone('league', false)).toBe(false);
  });

  it('always hides timezone control for bracket view', () => {
    expect(shouldShowTimezone('bracket', true)).toBe(false);
    expect(shouldShowTimezone('bracket', false)).toBe(false);
  });
});
