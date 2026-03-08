// Render a BracketNode tree as a DOM tree using recursive flexbox layout.

import type { BracketNode } from './bracket-types';
import { teamCssClass } from '../core/team-utils';
import './bracket.css';

/**
 * Format score text for a team line.
 * Returns the main score and optional PK/ET annotation.
 */
function formatScore(
  node: BracketNode, isHome: boolean,
): { main: string; annotation: string } {
  const goal = isHome ? node.homeGoal : node.awayGoal;
  if (goal == null) return { main: '', annotation: '' };

  const main = String(goal);
  const pk = isHome ? node.homePkScore : node.awayPkScore;
  const opponentPk = isHome ? node.awayPkScore : node.homePkScore;
  if (pk != null && opponentPk != null) {
    return { main, annotation: `(PK${pk}-${opponentPk})` };
  }

  const ex = isHome ? node.homeScoreEx : node.awayScoreEx;
  const opponentEx = isHome ? node.awayScoreEx : node.homeScoreEx;
  if (ex != null && opponentEx != null) {
    return { main, annotation: `(ET${ex}-${opponentEx})` };
  }

  return { main, annotation: '' };
}

/** Create a team row element within a match card. */
function createTeamRow(
  team: string | null, node: BracketNode, isHome: boolean,
): HTMLElement {
  const row = document.createElement('div');
  row.classList.add('bracket-team');
  if (isHome) row.classList.add('home');
  else row.classList.add('away');

  // Team color via CSS class
  if (team) {
    row.style.borderLeftColor = '';
    row.classList.add(teamCssClass(team));
  }

  // Winner/loser styling
  if (node.winner) {
    row.classList.add(node.winner === team ? 'winner' : 'loser');
  }

  // Team name
  const nameSpan = document.createElement('span');
  nameSpan.classList.add('bracket-team-name');
  nameSpan.textContent = team ?? 'TBD';
  row.appendChild(nameSpan);

  // Score
  const { main, annotation } = formatScore(node, isHome);
  if (main) {
    const scoreSpan = document.createElement('span');
    scoreSpan.classList.add('bracket-score');
    scoreSpan.textContent = main;
    if (annotation) {
      const pkSpan = document.createElement('span');
      pkSpan.classList.add('bracket-score-pk');
      pkSpan.textContent = annotation;
      scoreSpan.appendChild(pkSpan);
    }
    row.appendChild(scoreSpan);
  }

  return row;
}

/** Create a match card element. */
function createMatchCard(node: BracketNode): HTMLElement {
  const card = document.createElement('div');
  card.classList.add('bracket-match');

  // Round label
  if (node.round) {
    const label = document.createElement('div');
    label.classList.add('bracket-round-label');
    label.textContent = node.round;
    card.appendChild(label);
  }

  card.appendChild(createTeamRow(node.homeTeam, node, true));
  card.appendChild(createTeamRow(node.awayTeam, node, false));

  // Match info (date, stadium)
  if (node.matchDate || node.stadium) {
    const info = document.createElement('div');
    info.classList.add('bracket-match-info');
    const parts: string[] = [];
    if (node.matchDate) parts.push(node.matchDate);
    if (node.stadium) parts.push(node.stadium);
    info.textContent = parts.join(' | ');
    card.appendChild(info);
  }

  return card;
}

/** Create connector lines between child matches and their parent. */
function createConnector(): HTMLElement {
  const connector = document.createElement('div');
  connector.classList.add('bracket-connector');

  const top = document.createElement('div');
  top.classList.add('connector-top');
  connector.appendChild(top);

  const bottom = document.createElement('div');
  bottom.classList.add('connector-bottom');
  connector.appendChild(bottom);

  return connector;
}

/** Create a horizontal line from connector to match card. */
function createConnectorLine(): HTMLElement {
  const line = document.createElement('div');
  line.classList.add('connector-line');
  return line;
}

/** Recursively render a BracketNode subtree. */
function renderNode(node: BracketNode): HTMLElement {
  const [upper, lower] = node.children;

  // Leaf node: just the match card
  if (!upper && !lower) {
    return createMatchCard(node);
  }

  const subtree = document.createElement('div');
  subtree.classList.add('bracket-subtree');

  // Render child subtrees
  const children = document.createElement('div');
  children.classList.add('bracket-children');
  if (upper) children.appendChild(renderNode(upper));
  if (lower) children.appendChild(renderNode(lower));
  subtree.appendChild(children);

  // Connector lines
  subtree.appendChild(createConnector());
  subtree.appendChild(createConnectorLine());

  // This match
  subtree.appendChild(createMatchCard(node));

  return subtree;
}

/**
 * Render a full bracket from its root node.
 *
 * @param root - Root BracketNode (the final match).
 * @param _cssFiles - CSS file names for team colors (loaded via link tags in HTML).
 * @returns DocumentFragment containing the rendered bracket.
 */
export function renderBracket(root: BracketNode, _cssFiles: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.classList.add('bracket');
  wrapper.appendChild(renderNode(root));
  fragment.appendChild(wrapper);
  return fragment;
}
