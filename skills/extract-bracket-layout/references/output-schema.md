# Output Schema

Use the simplest format that preserves official bracket structure without inventing connections.

## Option A: `bracket_order` only

Use only when:

- the tournament is a single binary tree
- the earliest visible round fully determines the tree
- no redraw, re-seeding, or disconnected sections exist

Example:

```json
{
  "format": "bracket_order",
  "round_start": "準々決勝",
  "bracket_order": [
    "横浜FC",
    "神戸",
    "湘南",
    "広島",
    "浦和",
    "川崎Ｆ",
    "横浜FM",
    "柏"
  ]
}
```

## Option B: explicit graph definition

Use when the source is more complex than a single binary tree.

```json
{
  "format": "graph",
  "title": "Emperor's Cup 2025 Round of 16 and later",
  "source_urls": [
    "https://www.jfa.jp/match/emperorscup_2025/schedule_result/",
    "https://www.jfa.jp/match/emperorscup_2025/schedule_result/pdf/Tournament_round16.pdf"
  ],
  "sections": [
    {
      "id": "main",
      "label": "ラウンド16以降",
      "rounds": ["ラウンド16", "準々決勝", "準決勝", "決勝"],
      "slots": [
        { "id": "r16-1", "label": "ヴィッセル神戸" },
        { "id": "r16-2", "label": "ヴァンフォーレ甲府" }
      ],
      "matches": [
        {
          "id": "m1",
          "round": "ラウンド16",
          "feeders": ["r16-1", "r16-2"],
          "winner_to": "m5"
        },
        {
          "id": "m5",
          "round": "準々決勝",
          "feeders": ["m1", "m2"],
          "winner_to": "m7"
        }
      ]
    }
  ],
  "assumptions": [],
  "unresolved": []
}
```

## Field guidance

### `slots`

- earliest visible entrants or placeholders
- preserve visual order exactly
- use placeholders such as `"Match 1 winner"` or `"都道府県代表 TBD"` when the official bracket does

### `matches`

- `feeders` must be ordered according to visual position
- `winner_to` is optional only for the final
- if a node is a bye, represent it explicitly rather than omitting structure

### `sections`

Use multiple sections when:

- later rounds are drawn separately
- the page is published as multiple independent bracket images
- a playoff or group stage feed-in exists without fixed connections

## season_map handoff

When converting a validated graph to `season_map.yaml`, use one of these strategies:

- flatten a simple section into `bracket_order`
- keep the graph as a sidecar JSON file and reference it from a new season option such as `bracket_definition`
- split disconnected sections into separate competition or season entries only if the UI also treats them separately
