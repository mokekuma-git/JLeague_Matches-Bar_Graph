// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderBracket, renderBracketInto } from '../../bracket/bracket-renderer';
import { buildBracket } from '../../bracket/bracket-data';
import type { RawMatchRow } from '../../types/match';
import type { BracketNode } from '../../bracket/bracket-types';

function makeRow(overrides: Partial<RawMatchRow>): RawMatchRow {
  return {
    match_date: '2024/12/08',
    section_no: '98',
    match_index_in_section: '1',
    start_time: '12:00',
    stadium: 'Test Stadium',
    home_team: '',
    home_goal: '',
    away_goal: '',
    away_team: '',
    status: '試合終了',
    ...overrides,
  };
}

/** Render a bracket tree and return the container element. */
function renderToElement(root: BracketNode): HTMLElement {
  const fragment = renderBracket(root, []);
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container;
}

describe('renderBracket — DOM structure', () => {
  it('renders a 2-team single match with team rows and scores', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/08', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    // One match card
    const cards = el.querySelectorAll('.bracket-match');
    expect(cards).toHaveLength(1);

    // Two team rows
    const teamRows = cards[0].querySelectorAll('.bracket-team');
    expect(teamRows).toHaveLength(2);

    // Team names
    const names = el.querySelectorAll('.bracket-team-name');
    expect(names[0].textContent).toBe('A');
    expect(names[1].textContent).toBe('B');

    // Scores
    const scores = el.querySelectorAll('.bracket-score');
    expect(scores[0].textContent).toContain('2');
    expect(scores[1].textContent).toContain('1');
  });

  it('applies winner/loser classes', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    const teamRows = el.querySelectorAll('.bracket-team');
    expect(teamRows[0].classList.contains('winner')).toBe(true);
    expect(teamRows[1].classList.contains('loser')).toBe(true);
  });

  it('applies bracket-future class for TBD teams', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/01', round: '準決勝',
      }),
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '', away_goal: '',
        match_date: '2024/12/15', round: '準決勝', status: 'ＶＳ',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B', 'C', 'D']);
    const el = renderToElement(root);

    // Final: A vs null (lower SF pending) → away team is TBD
    // The final has one null team → bracket-future
    const futureRows = el.querySelectorAll('.bracket-future');
    expect(futureRows.length).toBeGreaterThanOrEqual(1);
  });

  it('renders H&A aggregate with leg date range', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        match_date: '2024/12/01', round: '決勝', leg: '1',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '0', away_goal: '1',
        match_date: '2024/12/08', round: '決勝', leg: '2',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    // Date line should show date range
    const dateLine = el.querySelector('.bracket-match-date');
    expect(dateLine).not.toBeNull();
    expect(dateLine!.textContent).toContain('12/01');
    expect(dateLine!.textContent).toContain('12/08');
  });

  it('renders bye leaf with bracket-bye-team class', () => {
    // 4-team bracket: A has leaf-level bye
    const rows = [
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '1', away_goal: '0',
        round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'C',
        home_goal: '2', away_goal: '1',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', null, 'C', 'D']);
    const el = renderToElement(root);

    const byeTeams = el.querySelectorAll('.bracket-bye-team');
    expect(byeTeams.length).toBeGreaterThanOrEqual(1);
    expect(byeTeams[0].textContent).toBe('A');
  });

  it('renders ghost cards for multi-level bye chains', () => {
    // 8-team bracket: A byes through QF and SF (positions [0, null, null, null])
    const rows = [
      makeRow({
        home_team: 'E', away_team: 'F',
        home_goal: '2', away_goal: '0', round: '準々決勝',
      }),
      makeRow({
        home_team: 'G', away_team: 'H',
        home_goal: '1', away_goal: '0', round: '準々決勝',
      }),
      makeRow({
        home_team: 'E', away_team: 'G',
        home_goal: '3', away_goal: '1', round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'E',
        home_goal: '2', away_goal: '1', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', null, null, null, 'E', 'F', 'G', 'H']);
    const el = renderToElement(root);

    // Ghost cards for multi-level bye chain (QF + SF levels)
    const ghosts = el.querySelectorAll('.bracket-ghost');
    expect(ghosts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders PK annotation in score', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '1',
        home_pk_score: '4', away_pk_score: '2',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    const pkAnnotations = el.querySelectorAll('.bracket-score-pk');
    expect(pkAnnotations).toHaveLength(2);
    expect(pkAnnotations[0].textContent).toBe('(PK4)');
    expect(pkAnnotations[1].textContent).toBe('(PK2)');
  });

  it('renders ET annotation in score', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1',
        home_score_ex: '1', away_score_ex: '0',
        round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    const etAnnotations = el.querySelectorAll('.bracket-score-pk');
    expect(etAnnotations).toHaveLength(2);
    expect(etAnnotations[0].textContent).toBe('(ET1)');
    expect(etAnnotations[1].textContent).toBe('(ET0)');
  });

  it('renders aggregate PK annotation for H&A tied on aggregate', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        match_date: '2024/12/01', round: '決勝', leg: '1',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '1', away_goal: '0',
        home_pk_score: '4', away_pk_score: '3',
        home_score_ex: '0', away_score_ex: '0',
        match_date: '2024/12/08', round: '決勝', leg: '2',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    // Aggregate: A=1, B=1, PK 4-3 for B (home in leg 2)
    const pkAnnotations = el.querySelectorAll('.bracket-score-pk');
    expect(pkAnnotations).toHaveLength(2);
    // B is lower (away in bracket), PK mapped: A(upper)→3, B(lower)→4
    const texts = Array.from(pkAnnotations).map(e => e.textContent);
    expect(texts).toContain('(PK3)');
    expect(texts).toContain('(PK4)');
  });

  it('renders aggregate ET annotation for H&A with extra time in a leg', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '1',
        match_date: '2024/12/01', round: '決勝', leg: '1',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '3', away_goal: '2',
        home_score_ex: '1', away_score_ex: '0',
        match_date: '2024/12/08', round: '決勝', leg: '2',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const el = renderToElement(root);

    // Aggregate: A=1+2=3, B=1+3=4, ET in leg2: B(home)=1, A(away)=0
    // Mapped to upper/lower: A(upper) ET=0, B(lower) ET=1
    const etAnnotations = el.querySelectorAll('.bracket-score-pk');
    expect(etAnnotations).toHaveLength(2);
    const texts = Array.from(etAnnotations).map(e => e.textContent);
    expect(texts).toContain('(ET0)');
    expect(texts).toContain('(ET1)');
  });

  it('renders aggregate away-goals annotation in score', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '1', away_goal: '0',
        match_date: '2024/12/01', round: '決勝', leg: '1',
      }),
      makeRow({
        home_team: 'B', away_team: 'A',
        home_goal: '3', away_goal: '2',
        match_date: '2024/12/08', round: '決勝', leg: '2',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B'], ['away_goals', 'penalties']);
    const el = renderToElement(root);

    const agAnnotations = el.querySelectorAll('.bracket-score-pk');
    expect(agAnnotations).toHaveLength(2);
    const texts = Array.from(agAnnotations).map(e => e.textContent);
    expect(texts).toContain('(AG2)');
    expect(texts).toContain('(AG0)');
  });

  it('renders single-round pair (2-team minimal bracket)', () => {
    const rows = [
      makeRow({
        home_team: 'X', away_team: 'Y',
        home_goal: '3', away_goal: '0',
        round: '1回戦',
      }),
    ];
    const root = buildBracket(rows, ['X', 'Y']);
    const el = renderToElement(root);

    // Exactly one match card with round label
    const cards = el.querySelectorAll('.bracket-match');
    expect(cards).toHaveLength(1);
    const roundLabel = el.querySelector('.bracket-round-label');
    expect(roundLabel!.textContent).toBe('1回戦');
  });
});

describe('renderBracketInto — pipeline integration', () => {
  function makeContainer(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  }

  it('renders bracket into container with horizontal layout', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const container = makeContainer();

    renderBracketInto(container, root, [], 'horizontal');

    expect(container.querySelector('.bracket')).not.toBeNull();
    expect(container.querySelector('.bracket')!.classList.contains('vertical')).toBe(false);
    expect(container.querySelectorAll('.bracket-match')).toHaveLength(1);
  });

  it('applies vertical class when layout is vertical', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B']);
    const container = makeContainer();

    renderBracketInto(container, root, [], 'vertical');

    expect(container.querySelector('.bracket')!.classList.contains('vertical')).toBe(true);
  });

  it('creates SVG connector elements for multi-match bracket', () => {
    const rows = [
      makeRow({
        home_team: 'A', away_team: 'B',
        home_goal: '2', away_goal: '1', round: '準決勝',
      }),
      makeRow({
        home_team: 'C', away_team: 'D',
        home_goal: '1', away_goal: '0', round: '準決勝',
      }),
      makeRow({
        home_team: 'A', away_team: 'C',
        home_goal: '3', away_goal: '2', round: '決勝',
      }),
    ];
    const root = buildBracket(rows, ['A', 'B', 'C', 'D']);
    const container = makeContainer();

    renderBracketInto(container, root, [], 'horizontal');

    // SVG overlay should be created (coordinates are 0 in happy-dom but element exists)
    const svg = container.querySelector('.bracket-svg');
    expect(svg).not.toBeNull();
  });
});
