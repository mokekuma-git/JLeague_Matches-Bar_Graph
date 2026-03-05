import { describe, test, expect } from 'vitest';
import { POINT_MAPS, POINT_HEIGHT_SCALE } from '../../types/config';
import type { PointSystem } from '../../types/config';
import { getPointHeightScale } from '../../core/point-calculator';

// Valid scaled point values that have corresponding CSS height classes
// in bar-column.ts (BOX_HEIGHT_CLASS: 1='short', 2='medium', 3='tall').
const VALID_BOX_HEIGHTS = new Set([1, 2, 3]);

describe('POINT_MAPS × POINT_HEIGHT_SCALE consistency', () => {
  const systems = Object.entries(POINT_MAPS) as [PointSystem, Record<string, number>][];

  test.each(systems)(
    '%s: every non-zero point × scale maps to a valid box height',
    (system, map) => {
      const scale = getPointHeightScale(system);
      for (const [result, pt] of Object.entries(map)) {
        if (pt === 0) continue; // 0-pt results go to lossBox, no height class needed
        const scaled = pt * scale;
        expect(
          VALID_BOX_HEIGHTS.has(scaled),
          `${system}.${result} = ${pt} × scale ${scale} = ${scaled} is not in {1, 2, 3}`,
        ).toBe(true);
      }
    },
  );

  test('every POINT_HEIGHT_SCALE key exists in POINT_MAPS', () => {
    for (const key of Object.keys(POINT_HEIGHT_SCALE)) {
      expect(POINT_MAPS).toHaveProperty(key);
    }
  });
});
