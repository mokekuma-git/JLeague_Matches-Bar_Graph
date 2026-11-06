// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBracket, maskBracketForDate } from '../../bracket/bracket-data';
import { determineWinner } from '../../bracket/bracket-reference-graph';
import { renderBracket } from '../../bracket/bracket-renderer';
import type { RawMatchRow } from '../../types/match';

function row(overrides: Partial<RawMatchRow> & { advantage_team?: string } = {}): RawMatchRow {
  return {
    match_date: '2013/12/01', section_no: '-2', match_index_in_section: '1',
    start_time: '14:00', stadium: '西京極', home_team: '京都', away_team: '長崎',
    home_goal: '0', away_goal: '0', status: '試合終了', round: '準決勝',
    ...overrides,
  };
}

describe('explicit league-rank advantage in promotion playoffs', () => {
  it('advances the declared team on a completed draw and connects the final', () => {
    const rows = [
      row({ advantage_team: '京都' }),
      row({ home_team: '徳島', away_team: '千葉', home_goal: '1', away_goal: '1', advantage_team: '徳島' }),
      row({ match_date: '2013/12/08', section_no: '-1', round: '決勝', home_team: '京都',
        away_team: '徳島', home_goal: '0', away_goal: '2', advantage_team: '京都' }),
    ];
    const root = buildBracket(rows, ['京都', '長崎', '徳島', '千葉']);
    expect(root.children[0]?.winner).toBe('京都');
    expect(root.children[0]?.decidedBy).toBe('advantage');
    expect(root.children[1]?.winner).toBe('徳島');
    expect(root.winner).toBe('徳島');
    expect(root.homeTeam).toBe('京都');
  });

  it('uses the explicit away team rather than assuming home advantage', () => {
    expect(determineWinner(row({ advantage_team: '長崎' }))).toBe('長崎');
  });

  it('requires a completed match, a draw, and a participating advantage team', () => {
    expect(determineWinner(row())).toBeNull();
    expect(determineWinner(row({ advantage_team: '他クラブ' }))).toBeNull();
    expect(determineWinner(row({ advantage_team: '京都', status: '速報中後半 45分' }))).toBeNull();
    expect(determineWinner(row({ advantage_team: '京都', home_goal: '', away_goal: '', status: 'ＶＳ' }))).toBeNull();
    expect(determineWinner(row({ advantage_team: '京都', home_goal: '0', away_goal: '1' }))).toBe('長崎');
    expect(determineWinner(row({ advantage_team: '京都', home_pk_score: '3', away_pk_score: '4' }))).toBe('長崎');
  });

  it('shows the decision reason without changing the score and masks future results', () => {
    const root = buildBracket([row({ advantage_team: '京都' })], ['京都', '長崎']);
    const container = document.createElement('div');
    container.appendChild(renderBracket(root, []));
    document.body.appendChild(container);
    container.querySelector<HTMLElement>('.bracket-match')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('.bracket-tooltip')?.textContent).toContain('上位優遇');
    expect(root.homeGoal).toBe(0);
    expect(root.awayGoal).toBe(0);
    expect(maskBracketForDate(root, '2013/11/30').winner).toBeNull();
    expect(maskBracketForDate(root, '2013/11/30').decidedBy).toBe('pending');
    container.remove();
  });
});
