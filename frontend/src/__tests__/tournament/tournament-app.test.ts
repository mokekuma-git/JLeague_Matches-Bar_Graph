import { describe, expect, test } from 'vitest';
import { __testables } from '../../tournament-app';
import type { RawMatchRow } from '../../types/match';
import type { BracketSection } from '../../types/season';
import type { BracketNode } from '../../bracket/bracket-types';

function makeRow(overrides: Partial<RawMatchRow> = {}): RawMatchRow {
  const base: RawMatchRow = {
    match_date: '2025/03/15',
    section_no: '98',
    match_index_in_section: '1',
    start_time: '15:00',
    stadium: 'Test Stadium',
    home_team: 'TeamA',
    home_goal: '2',
    away_goal: '1',
    away_team: 'TeamB',
    status: '試合終了',
    round: '準決勝 第1戦',
  };
  return { ...base, ...overrides };
}

function makeNode(overrides: Partial<BracketNode> = {}): BracketNode {
  return {
    round: '準決勝',
    homeTeam: null,
    awayTeam: null,
    status: '試合終了',
    winner: null,
    decidedBy: null,
    children: [null, null],
    ...overrides,
  };
}

describe('tournament-app helpers', () => {
  describe('createControlStateFromPrefs', () => {
    test('separates viewer-common prefs from bracket-specific prefs', () => {
      const state = __testables.createControlStateFromPrefs({
        scale: '1.5',
        futureOpacity: '0.35',
        targetDate: '2025/03/20',
        roundStart: '準決勝',
      });

      expect(state.viewer).toEqual({
        scale: 1.5,
        futureOpacity: 0.35,
        targetDate: '2025/03/20',
      });
      expect(state.bracket).toEqual({
        layout: 'horizontal',
        roundStart: '準決勝',
      });
    });

    test('falls back to current defaults when prefs are absent', () => {
      const state = __testables.createControlStateFromPrefs({});

      expect(state.viewer).toEqual({
        scale: 1,
        futureOpacity: 0.2,
        targetDate: null,
      });
      expect(state.bracket).toEqual({
        layout: 'horizontal',
        roundStart: null,
      });
    });
  });

  test('filterRowsByRounds matches both raw and normalized round labels', () => {
    const rows = [
      makeRow({ round: '準決勝 第1戦' }),
      makeRow({ round: '決勝', home_team: 'TeamC', away_team: 'TeamD' }),
    ];
    const filtered = __testables.filterRowsByRounds(rows, ['準決勝']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].round).toBe('準決勝 第1戦');
  });

  describe('resolveSectionRoundFilters', () => {
    test('applies default_round_filter to sections without round_filter', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦', '2回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦', '2回戦']);
      expect(resolved[1].round_filter).toEqual(['1回戦', '2回戦']);
    });

    test('preserves section-level round_filter over default', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'], round_filter: ['準決勝', '決勝'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦', '2回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦', '2回戦']);
      expect(resolved[1].round_filter).toEqual(['準決勝', '決勝']);
    });

    test('returns sections unchanged when no default provided', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'], round_filter: ['準決勝'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, undefined);
      expect(resolved[0].round_filter).toBeUndefined();
      expect(resolved[1].round_filter).toEqual(['準決勝']);
    });

    test('returns sections unchanged when default is empty array', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, []);
      expect(resolved[0].round_filter).toBeUndefined();
    });

    test('does not mutate original sections', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦']);
      expect(sections[0].round_filter).toBeUndefined();
    });
  });

  test('collectBracketSourceRows ignores section columns in dedup keys', () => {
    const rows = [
      makeRow({
        section_no: '98',
        match_index_in_section: '1',
        round: '準決勝 第1戦',
      }),
      makeRow({
        section_no: '12',
        match_index_in_section: '9',
        round: '準決勝 第1戦',
      }),
    ];
    const sections: BracketSection[] = [
      { label: '準決勝', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝'] },
      { label: '第1戦', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝 第1戦'] },
    ];
    const collected = __testables.collectBracketSourceRows(rows, sections);
    expect(collected).toHaveLength(1);
  });

  describe('resolveInclusiveBracketOrder', () => {
    const fullRoot = makeNode({
      round: '決勝',
      winner: 'TeamA',
      children: [
        makeNode({ round: '準決勝', winner: 'TeamA' }),
        makeNode({ round: '準決勝', winner: 'TeamC' }),
      ],
    });

    test('collapses to winners when a later round is selected', () => {
      const order = __testables.resolveInclusiveBracketOrder({
        fullRoot,
        bracketOrder: ['TeamA', 'TeamB', 'TeamC', 'TeamD'],
        roundsByDepth: ['決勝', '準決勝'],
        allRounds: ['準決勝', '決勝'],
        csvRows: [],
      }, '決勝');

      expect(order).toEqual(['TeamA', 'TeamC']);
    });

    test('extends backward when an earlier round is selected', () => {
      const order = __testables.resolveInclusiveBracketOrder({
        fullRoot,
        bracketOrder: ['TeamA', 'TeamB', 'TeamC', 'TeamD'],
        roundsByDepth: ['決勝', '2回戦'],
        allRounds: ['1回戦', '2回戦', '決勝'],
        csvRows: [
          makeRow({ round: '1回戦', home_team: 'TeamA', away_team: 'TeamX' }),
          makeRow({ round: '1回戦', home_team: 'TeamC', away_team: 'TeamY' }),
          makeRow({ round: '1回戦', home_team: 'TeamD', away_team: 'TeamZ' }),
        ],
      }, '1回戦');

      expect(order).toEqual(['TeamA', 'TeamX', 'TeamB', null, 'TeamC', 'TeamY', 'TeamD', 'TeamZ']);
    });
  });

  describe('shouldRenderMultiSectionView', () => {
    test('returns true only when multi-section option and sections are both present', () => {
      expect(__testables.shouldRenderMultiSectionView(
        [{ label: 'A', bracket_order: ['TeamA', 'TeamB'] }],
        '__multi_section__',
      )).toBe(true);
      expect(__testables.shouldRenderMultiSectionView(
        [{ label: 'A', bracket_order: ['TeamA', 'TeamB'] }],
        '準決勝',
      )).toBe(false);
      expect(__testables.shouldRenderMultiSectionView(undefined, '__multi_section__')).toBe(false);
    });
  });
});
