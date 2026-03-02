// Ranking table data builder and renderer: port of make_rankdata / make_ranktable.

import type { TeamData, TeamMatch } from '../types/match';
import type { SeasonInfo, CrossGroupStanding } from '../types/season';
import {
  getStats,
  getSafetyLine,
  getPossibleLine,
  getSelfPossibleLine,
} from '../core/sorter';
import { teamCssClass } from '../core/team-utils';

// SortableTable is loaded from CDN as a global (not an npm package).
declare const SortableTable: new () => {
  setTable(el: HTMLElement): void;
  setData(data: unknown[]): void;
};

// ---- Shared types and column definitions ----------------------------------

// Column definition for table headers.
type ColDef = { id?: string; label: string; sortable?: true };

// Stat columns shared by all ranking table variants (between rank and goal columns).
const STAT_COLS: ColDef[] = [
  { id: 'name',        label: 'チーム' },
  { id: 'all_game',    label: '試合',   sortable: true },
  { id: 'point',       label: '勝点',   sortable: true },
  { id: 'avrg_pt',     label: '平均',   sortable: true },
  { id: 'avlbl_pt',    label: '最大',   sortable: true },
  { id: 'win',         label: '勝',     sortable: true },
  { id: 'draw',        label: '分',     sortable: true },
  { id: 'loss',        label: '負',     sortable: true },
];

// Goal and remaining-game columns shared by all ranking table variants.
const GOAL_COLS: ColDef[] = [
  { id: 'goal_get',    label: '得点',   sortable: true },
  { id: 'goal_lose',   label: '失点',   sortable: true },
  { id: 'goal_diff',   label: '点差',   sortable: true },
  { id: 'future_game', label: '残り',   sortable: true },
];

// Builds a <thead> row from a column definition array.
function buildTableHead(tableEl: HTMLElement, cols: ColDef[]): void {
  const thead = tableEl.querySelector('thead');
  if (!thead) return;
  const tr = document.createElement('tr');
  for (const col of cols) {
    const th = document.createElement('th');
    if (col.id) th.setAttribute('data-id', col.id);
    if (col.sortable) th.setAttribute('sortable', '');
    th.innerHTML = col.label;
    tr.appendChild(th);
  }
  thead.innerHTML = '';
  thead.appendChild(tr);
}

// Fields shared between per-group rank rows and cross-group comparison rows.
export interface BaseRankRow {
  name: string;      // HTML string: '<div class="TeamName">TeamName</div>'
  win: number;
  draw: number;
  loss: number;
  point: number;
  avlbl_pt: number;
  avrg_pt: string;   // toFixed(2) string for display
  all_game: number;
  goal_get: number;
  goal_lose: number;
  goal_diff: number;
  future_game: number;
}

// Row data shape for per-group ranking tables.
// Japanese strings ('確定', '自力', etc.) are used for champion/promotion/relegation columns.
export interface RankRow extends BaseRankRow {
  rank: number;
  pk_win?: number;
  pk_loss?: number;
  champion: string;
  promotion?: string;
  relegation?: string;
}

// Returns the total count of opponents with at least one remaining fixture across all teams.
// Uses latestStats.rest_games (latest state).
function getAllRestGame(teams: Record<string, TeamData>): number {
  return Object.values(teams).reduce(
    (sum, td) => sum + Object.keys(td.latestStats.rest_games).length,
    0,
  );
}

// Builds rank table rows for all teams in teamList.
// Requires calculateTeamStats to have been called on all teams beforehand.
// disp: true → use displayStats (display-time view), false → use latestStats.
export function makeRankData(
  groupData: Record<string, TeamData>,
  teamList: string[],
  seasonInfo: SeasonInfo,
  disp: boolean,
  hasPk: boolean = false,
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

    const s = getStats(td, disp);
    const rc = s.resultCounts;

    const row: RankRow = {
      rank,
      name: `<div class="${teamCssClass(teamName)}">${teamName}</div>`,
      win:         rc.win,
      ...(hasPk ? {
        pk_win:    rc.pk_win,
        pk_loss:   rc.pk_loss,
      } : {}),
      draw:        rc.draw,
      loss:        rc.loss,
      point:       s.point,
      avlbl_pt:    s.avlbl_pt,
      avrg_pt:     s.avrg_pt.toFixed(2),
      all_game:    s.all_game,
      goal_get:    s.goal_get,
      goal_diff:   s.goal_diff,
      goal_lose:   s.goal_get - s.goal_diff,
      future_game: td.df.length - s.all_game,
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
      const silver      = s.avlbl_pt - silverLine;
      const champion    = s.point    - championLine;
      const selfChampion = s.avlbl_pt - getSelfPossibleLine(1, teamName, disp, groupData, seasonInfo.pointSystem);
      row.champion = champion >= 0 ? '確定'
        : silver < 0              ? 'なし'
        : selfChampion >= 0       ? '自力'
        : '他力';

      // Promotion calculation
      if (promotionCount > 0) {
        const remaining      = s.avlbl_pt - nonPromotLine;
        const promotion      = s.point    - promotionLine;
        const selfPromotion  = s.avlbl_pt - getSelfPossibleLine(promotionCount, teamName, disp, groupData, seasonInfo.pointSystem);
        row.promotion = promotion >= 0  ? '確定'
          : remaining < 0              ? 'なし'
          : selfPromotion >= 0         ? '自力'
          : '他力';
      }

      // Relegation calculation
      if (relegationCount > 0 && keepLeagueLine !== undefined && relegationLine !== undefined) {
        const keepLeague    = s.point    - keepLeagueLine;
        const relegation    = s.avlbl_pt - relegationLine;
        const selfRelegation = s.avlbl_pt - getSelfPossibleLine(relegationRank, teamName, disp, groupData, seasonInfo.pointSystem);
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

// Builds the <thead> for per-group ranking tables.
// pk_win / pk_loss columns are included only when hasPk=true.
function buildRankTableHead(tableEl: HTMLElement, hasPk: boolean): void {
  const cols: ColDef[] = [
    { id: 'rank',        label: '',          sortable: true },
    ...STAT_COLS,
    ...(hasPk ? [
      { id: 'pk_win',  label: 'PK勝', sortable: true as true },
      { id: 'pk_loss', label: 'PK負', sortable: true as true },
    ] : []),
    ...GOAL_COLS,
    {                    label: '-' },
    { id: 'champion',    label: '優勝',      sortable: true },
    { id: 'promotion',   label: '昇格<br/>ACL', sortable: true },
    { id: 'relegation',  label: '残留',      sortable: true },
  ];
  buildTableHead(tableEl, cols);
}

// Renders rankData into the given <table> element using SortableTable from CDN.
// hasPk controls whether PK win/loss columns appear in the table header.
export function makeRankTable(tableEl: HTMLElement, rankData: RankRow[], hasPk: boolean): void {
  buildRankTableHead(tableEl, hasPk);
  const sortableTable = new SortableTable();
  sortableTable.setTable(tableEl);
  sortableTable.setData(rankData);
}

// ---- Cross-group standing comparison table --------------------------------

// Row for the cross-group comparison table.
// Uses string rank (group key) instead of numeric; no champion/promotion/relegation.
export interface CrossGroupRow extends BaseRankRow {
  rank: string;   // Group key (e.g., "A", "F")
}

// Per-group render result collected during the main rendering loop.
export interface GroupRenderResult {
  sortedTeams: string[];
  groupData: Record<string, TeamData>;
}

// Intermediate stats used during recalculation (numeric avrg_pt).
interface RecalcStats {
  win: number; draw: number; loss: number;
  point: number; avlbl_pt: number; avrg_pt: number;
  all_game: number; future_game: number;
  goal_get: number; goal_lose: number; goal_diff: number;
}

// Recalculates team stats from a filtered match list.
// Used when exclude_bottom > 0 removes some opponents' matches.
function recalcFromMatches(
  matches: TeamMatch[], disp: boolean, targetDate: string, maxPtPerGame: number,
): RecalcStats {
  let win = 0, draw = 0, loss = 0, point = 0;
  let goal_get = 0, goal_lose = 0, all_game = 0, future_game = 0;

  for (const m of matches) {
    const played = m.has_result && m.match_date !== '未定'
      && (!disp || m.match_date <= targetDate);
    if (played) {
      point += m.point;
      const get = m.goal_get ?? 0;
      const lose = m.goal_lose ?? 0;
      goal_get += get;
      goal_lose += lose;
      all_game++;
      if (get > lose) win++;
      else if (get < lose) loss++;
      else draw++;
    } else {
      future_game++;
    }
  }

  return {
    win, draw, loss, point, goal_get, goal_lose,
    goal_diff: goal_get - goal_lose,
    all_game, future_game,
    avrg_pt: all_game === 0 ? 0 : point / all_game,
    avlbl_pt: point + future_game * maxPtPerGame,
  };
}

// Builds comparison rows for the cross-group standing table.
// Pure data function (no DOM access) for testability.
export function buildCrossGroupRows(
  groupResults: Record<string, GroupRenderResult>,
  config: CrossGroupStanding,
  disp: boolean,
  targetDate: string,
  maxPtPerGame: number,
): CrossGroupRow[] {
  const { position, exclude_from_rank } = config;
  const rows: CrossGroupRow[] = [];

  for (const [groupKey, { sortedTeams, groupData }] of Object.entries(groupResults)) {
    if (sortedTeams.length < position) continue;

    const teamName = sortedTeams[position - 1];
    const td = groupData[teamName];
    if (!td) continue;

    let stats: RecalcStats;

    // Exclude teams ranked at exclude_from_rank or below (if they exist in this group).
    const excludeTeams = exclude_from_rank && sortedTeams.length >= exclude_from_rank
      ? new Set(sortedTeams.slice(exclude_from_rank - 1))
      : undefined;

    if (excludeTeams && excludeTeams.size > 0) {
      const filteredMatches = td.df.filter(m => !excludeTeams.has(m.opponent));
      stats = recalcFromMatches(filteredMatches, disp, targetDate, maxPtPerGame);
    } else {
      const s = getStats(td, disp);
      const rc = s.resultCounts;
      stats = {
        win: rc.win, draw: rc.draw, loss: rc.loss,
        point: s.point, avlbl_pt: s.avlbl_pt, avrg_pt: s.avrg_pt,
        all_game: s.all_game,
        goal_get: s.goal_get,
        goal_lose: s.goal_get - s.goal_diff,
        goal_diff: s.goal_diff,
        future_game: td.df.length - s.all_game,
      };
    }

    rows.push({
      rank: groupKey,
      name: `<div class="${teamCssClass(teamName)}">${teamName}</div>`,
      all_game: stats.all_game,
      point: stats.point,
      avrg_pt: stats.avrg_pt.toFixed(2),
      avlbl_pt: stats.avlbl_pt,
      win: stats.win, draw: stats.draw, loss: stats.loss,
      goal_get: stats.goal_get, goal_lose: stats.goal_lose, goal_diff: stats.goal_diff,
      future_game: stats.future_game,
    });
  }

  // Sort: points desc → goal_diff desc → goal_get desc
  rows.sort((a, b) => b.point - a.point || b.goal_diff - a.goal_diff || b.goal_get - a.goal_get);

  return rows;
}

// Creates and populates a cross-group comparison <table> element.
// Highlights top advance_count rows with .promoted CSS class.
export function makeCrossGroupTable(
  rows: CrossGroupRow[], config: CrossGroupStanding,
): HTMLTableElement {
  const { position, exclude_from_rank, advance_count = 0 } = config;

  const table = document.createElement('table');
  table.className = 'ranktable';

  const caption = document.createElement('caption');
  const posLabel = `${position}位チーム比較`;
  const excludeLabel = exclude_from_rank ? ` (${exclude_from_rank}位以下との対戦除外)` : '';
  caption.textContent = posLabel + excludeLabel;
  table.appendChild(caption);

  table.appendChild(document.createElement('thead'));
  buildTableHead(table, [
    { id: 'rank', label: 'Grp', sortable: true },
    ...STAT_COLS,
    ...GOAL_COLS,
  ]);

  const sortableTable = new SortableTable();
  sortableTable.setTable(table);
  sortableTable.setData(rows);

  if (advance_count > 0) {
    const tbodyRows = table.querySelectorAll('tbody tr');
    tbodyRows.forEach((tr, i) => {
      if (i < advance_count) tr.classList.add('promoted');
    });
  }

  return table;
}
