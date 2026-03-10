# Source Patterns

This file lists concrete heuristics for the public sources already used in this repo.

## JFA Emperor's Cup

Primary page:

- `https://www.jfa.jp/match/emperorscup_2025/schedule_result/`

Observed pattern:

- the schedule page includes explicit links for `準々決勝以降のトーナメント表` and `ラウンド16(4回戦)までのトーナメント表`
- each bracket is available as a downloadable PDF
- the PDF is the authoritative source for spatial bracket structure

Useful extracted source URLs:

- `https://www.jfa.jp/match/emperorscup_2025/schedule_result/pdf/Tournament.pdf`
- `https://www.jfa.jp/match/emperorscup_2025/schedule_result/pdf/Tournament_round16.pdf`

Practical rule:

- for Emperor's Cup, prefer the PDF over page text
- split the definition by PDF scope if the official site already splits it
- preserve placeholders and seeded entries even if later rounds already show winners

## J.League Levain Cup

Primary page:

- `https://www.jleague.jp/leaguecup/2025/standings/tournament.html`

Observed pattern:

- the page is segmented by headings such as `プライムラウンド`, `プレーオフラウンド`, `1stラウンド`
- the bracket itself is published as images rather than text-heavy DOM
- 1st round is already split across multiple images, which is a strong signal that the output should support multiple sections

Practical rule:

- use page headings as hard section boundaries
- do not infer PO to Prime connections when the official competition redraw breaks a fixed tree
- when 1st round is published as several images, keep each image or group as its own section until a verified merge point exists

## Ambiguity handling

When a source is visual and the connection is not explicit:

- prefer "unresolved" over guessing
- preserve the exact published label
- distinguish between:
  - a real feeder relationship
  - a same-round visual grouping
  - a later draw with no fixed connection yet
