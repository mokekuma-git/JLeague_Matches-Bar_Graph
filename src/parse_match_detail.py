"""Parse match detail pages from data.j-league.or.jp/SFMS02/.

Pure parsing module — no HTTP access. Accepts HTML text and returns
structured data. Designed for testability and reuse.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from bs4 import BeautifulSoup


@dataclass
class HalfScore:
    """Score for a single period (e.g. 前半, 後半, 延長前半, 延長後半)."""
    period: str
    home: int
    away: int


@dataclass
class MatchDetail:
    """Parsed match detail from a data.j-league.or.jp SFMS02 page."""
    home_team: str
    away_team: str
    home_goal: int
    away_goal: int
    half_scores: list[HalfScore] = field(default_factory=list)
    home_score_ex: int | None = None
    away_score_ex: int | None = None
    home_pk: int | None = None
    away_pk: int | None = None

    @property
    def has_extra_time(self) -> bool:
        return self.home_score_ex is not None


def parse_match_detail(html: str) -> MatchDetail:
    """Parse a match detail page and extract scores.

    Args:
        html: Full or partial HTML of a SFMS02 match detail page.

    Returns:
        MatchDetail with total scores, per-half breakdown, extra-time
        scores (if any), and PK shootout scores (if any).
    """
    soup = BeautifulSoup(html, 'lxml')

    # --- Total scores and team names ---
    main = soup.select_one('.score-board-main')
    if main is None:
        raise ValueError('No .score-board-main found in HTML')

    score_cells = main.select('td.score')
    if len(score_cells) < 2:
        raise ValueError(f'Expected 2 td.score cells, found {len(score_cells)}')
    home_goal = int(score_cells[0].get_text(strip=True))
    away_goal = int(score_cells[1].get_text(strip=True))

    team_names = main.select('th.team-name')
    if len(team_names) < 2:
        raise ValueError(f'Expected 2 th.team-name, found {len(team_names)}')
    home_team = team_names[0].get_text(strip=True)
    away_team = team_names[1].get_text(strip=True)

    # --- Per-half scores (前半, 後半, 延長前半, 延長後半) ---
    half_scores: list[HalfScore] = []
    home_ex = 0
    away_ex = 0
    has_extra = False

    time_cell = main.select_one('td.time')
    if time_cell:
        for dl in time_cell.find_all('dl'):
            dt = dl.find('dt')
            if dt is None:
                continue
            period = dt.get_text(strip=True)
            left = dl.select_one('dd.left-area')
            right = dl.select_one('dd.right-area')
            if left is None or right is None:
                continue
            h = int(left.get_text(strip=True))
            a = int(right.get_text(strip=True))
            half_scores.append(HalfScore(period=period, home=h, away=a))
            if '延長' in period:
                has_extra = True
                home_ex += h
                away_ex += a

    # --- PK shootout ---
    # PK block uses class "score-board-pk mb20" (distinct from the goal
    # event block which uses "score-board-pk mb10").
    home_pk: int | None = None
    away_pk: int | None = None

    for pk_div in soup.select('div.score-board-pk'):
        classes = pk_div.get('class', [])
        if 'mb20' not in classes:
            continue
        th = pk_div.find('th')
        if th and 'PK' in th.get_text():
            cells = pk_div.select('td')
            if len(cells) >= 2:
                home_pk = int(cells[0].get_text(strip=True))
                away_pk = int(cells[1].get_text(strip=True))
            break

    return MatchDetail(
        home_team=home_team,
        away_team=away_team,
        home_goal=home_goal,
        away_goal=away_goal,
        half_scores=half_scores,
        home_score_ex=home_ex if has_extra else None,
        away_score_ex=away_ex if has_extra else None,
        home_pk=home_pk,
        away_pk=away_pk,
    )
