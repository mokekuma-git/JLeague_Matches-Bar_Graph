// Types and constants for competition configuration.

import type { MatchResult } from './match';

/**
 * Points awarded for each match result under each scoring system.
 *
 * Fallback values for result types that cannot occur in a given system are set
 * to the nearest semantically correct value (e.g. ex_win = win in 'standard').
 * These fallbacks are never triggered in practice because the corresponding
 * result types only appear when the CSV contains the relevant data columns.
 */
export const POINT_MAPS = {
  // 2003–present (default): win=3, draw=1, loss=0. No ET or PK in regular league matches.
  'standard':        { win: 3, ex_win: 3, pk_win: 0, pk_loss: 0, draw: 1, ex_loss: 0, loss: 0 },
  // 1993–94: victory count. Each win (any form) = 1; scale=3 for bar height.
  'victory-count':   { win: 1, ex_win: 1, pk_win: 1, pk_loss: 0, draw: 0, ex_loss: 0, loss: 0 },
  // 1995–96: all wins = 3 (90min/ET/PK), PK loss = 1, loss = 0. No draws.
  'win3all-pkloss1': { win: 3, ex_win: 3, pk_win: 3, pk_loss: 1, draw: 0, ex_loss: 0, loss: 0 },
  // 1997–98: graduated — 90min win=3, ET win=2, PK win=1, all losses=0. No draws.
  'graduated-win':   { win: 3, ex_win: 2, pk_win: 1, pk_loss: 0, draw: 0, ex_loss: 0, loss: 0 },
  // 1999–2002: ET win=2, draw (after ET 0-0)=1, loss=0. No PK shootout.
  'ex-win-2':        { win: 3, ex_win: 2, pk_win: 0, pk_loss: 0, draw: 1, ex_loss: 0, loss: 0 },
  // 2026 special tournament: win=3, PK win=2, PK loss=1, loss=0. No ET or draws.
  'pk-win2-loss1':   { win: 3, ex_win: 3, pk_win: 2, pk_loss: 1, draw: 0, ex_loss: 0, loss: 0 },
} satisfies Record<string, Record<MatchResult, number>>;

// Derived from POINT_MAPS keys. To add a new scoring system, add an entry above.
export type PointSystem = keyof typeof POINT_MAPS;

/**
 * Height-unit multiplier per point for the bar graph.
 * Default = 1 (applied via `?? 1` in getPointHeightScale).
 * Only systems where the multiplier differs from 1 need an explicit entry.
 *
 * victory-count: each win = 1 pt, but the bar should be as tall as a 3-pt win → scale = 3.
 */
export const POINT_HEIGHT_SCALE: Partial<Record<PointSystem, number>> = {
  'victory-count': 3,
};
