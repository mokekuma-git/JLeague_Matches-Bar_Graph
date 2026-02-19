// Ranking table data builder and renderer: port of make_rankdata / make_ranktable.

import type { TeamData } from '../types/match';
import type { SeasonInfo } from '../types/season';
import {
  getTeamAttr,
  getSafetyLine,
  getPossibleLine,
  getSelfPossibleLine,
} from '../core/sorter';

// SortableTable is loaded from CDN as a global (not an npm package).
declare const SortableTable: new () => {
  setTable(el: HTMLElement): void;
  setData(data: unknown[]): void;
};

// Row data shape expected by SortableTable.
// Japanese strings ('確定', '自力', etc.) are used for champion/promotion/relegation columns.
export interface RankRow {
  rank: number;
  name: string;      // HTML string: '<div class="TeamName">TeamName</div>'
  win: number;
  pk_win: number;
  pk_loss: number;
  draw: number;
  lose: number;
  point: number;
  avlbl_pt: number;
  avrg_pt: string;   // toFixed(2) string for display
  all_game: number;
  goal_get: number;
  goal_lose: number;
  goal_diff: number;
  future_game: number;
  champion: string;
  promotion?: string;
  relegation?: string;
}

// Returns the total count of opponents with at least one remaining fixture across all teams.
// Uses rest_games (latest state), not disp_rest_games.
function getAllRestGame(teams: Record<string, TeamData>): number {
  return Object.values(teams).reduce(
    (sum, td) => sum + Object.keys(td.rest_games ?? {}).length,
    0,
  );
}

// Builds rank table rows for all teams in teamList.
// Requires calculateTeamStats to have been called on all teams beforehand.
// disp: true → use disp_* stats (display-time view), false → use latest stats.
export function makeRankData(
  groupData: Record<string, TeamData>,
  teamList: string[],
  seasonInfo: SeasonInfo,
  disp: boolean,
): RankRow[] {
  const { teamCount, promotionCount, relegationCount } = seasonInfo;
  const relegationRank = teamCount - relegationCount;

  const silverLine = getPossibleLine(1, disp, groupData);
  const championLine = getSafetyLine(1, disp, groupData);
  const relegationLine = relegationCount > 0
    ? getPossibleLine(relegationRank, disp, groupData)
    : undefined;
  const keepLeagueLine = relegationCount > 0
    ? getSafetyLine(relegationRank, disp, groupData)
    : undefined;
  const promotionLine = getSafetyLine(promotionCount, disp, groupData);
  const nonPromotLine = getPossibleLine(promotionCount, disp, groupData);

  const allGameFinished = getAllRestGame(groupData) === 0;

  const datalist: RankRow[] = [];
  let rank = 0;

  for (const teamName of teamList) {
    rank++;
    const td = groupData[teamName];

    const point    = getTeamAttr(td, 'point',    disp);
    const avlblPt  = getTeamAttr(td, 'avlbl_pt', disp);
    const allGame  = getTeamAttr(td, 'all_game', disp);
    const goalGet  = getTeamAttr(td, 'goal_get', disp);
    const goalDiff = getTeamAttr(td, 'goal_diff', disp);
    const avrgPt   = getTeamAttr(td, 'avrg_pt',  disp);

    const row: RankRow = {
      rank,
      name: `<div class="${teamName}">${teamName}</div>`,
      win:         getTeamAttr(td, 'win',      disp),
      pk_win:      getTeamAttr(td, 'pk_win',   disp),
      pk_loss:     getTeamAttr(td, 'pk_loss',  disp),
      draw:        getTeamAttr(td, 'draw',     disp),
      lose:        getTeamAttr(td, 'lose',     disp),
      point,
      avlbl_pt:    avlblPt,
      avrg_pt:     avrgPt.toFixed(2),
      all_game:    allGame,
      goal_get:    goalGet,
      goal_diff:   goalDiff,
      goal_lose:   goalGet - goalDiff,
      future_game: td.df.length - allGame,
      champion:    '',
    };

    if (allGameFinished) {
      row.champion   = rank <= 1 ? '確定' : 'なし';
      if (promotionCount > 0) {
        row.promotion = rank <= promotionCount ? '確定' : 'なし';
      }
      if (relegationCount > 0) {
        row.relegation = rank <= relegationRank ? '確定' : '降格';
      }
    } else {
      // Champion calculation
      const silver      = avlblPt - silverLine;
      const champion    = point   - championLine;
      const selfChampion = avlblPt - getSelfPossibleLine(1, teamName, disp, groupData);
      row.champion = champion >= 0 ? '確定'
        : silver < 0              ? 'なし'
        : selfChampion >= 0       ? '自力'
        : '他力';

      // Promotion calculation
      if (promotionCount > 0) {
        const remaining      = avlblPt - nonPromotLine;
        const promotion      = point   - promotionLine;
        const selfPromotion  = avlblPt - getSelfPossibleLine(promotionCount, teamName, disp, groupData);
        row.promotion = promotion >= 0  ? '確定'
          : remaining < 0              ? 'なし'
          : selfPromotion >= 0         ? '自力'
          : '他力';
      }

      // Relegation calculation
      if (relegationCount > 0 && keepLeagueLine !== undefined && relegationLine !== undefined) {
        const keepLeague    = point   - keepLeagueLine;
        const relegation    = avlblPt - relegationLine;
        const selfRelegation = avlblPt - getSelfPossibleLine(relegationRank, teamName, disp, groupData);
        row.relegation = keepLeague >= 0 ? '確定'
          : relegation < 0              ? '降格'
          : selfRelegation >= 0         ? '自力'
          : '他力';
      } else {
        row.relegation = '確定';
      }
    }

    datalist.push(row);
  }

  return datalist;
}

// Renders rankData into the given <table> element using SortableTable from CDN.
export function makeRankTable(tableEl: HTMLElement, rankData: RankRow[]): void {
  const sortableTable = new SortableTable();
  sortableTable.setTable(tableEl);
  sortableTable.setData(rankData);
}
