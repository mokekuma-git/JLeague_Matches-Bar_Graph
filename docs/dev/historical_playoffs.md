# 過去のJリーグ昇格プレーオフ・入れ替え戦

Jリーグ公式データサイトの試合結果を、通常のJ1・J2・J3と並列のブラケットとして表示する。
1998〜2025年の26大会・シーズン、72試合が対象。2026年の百年構想リーグ順位決定戦は既存の別シーズンとして維持する。

## データと再生成

日付、ホーム・アウェイ、得点、会場、キックオフ時刻の正本は
[公式データサイト SFMS01](https://data.j-league.or.jp/SFMS01/) と、その各試合のSFMS02公式記録。
中間CSV `csv/{year}.csv` は既存の `scripts/legacy/read_older2020_matches.py` で取得する。
公開CSVの再生成はリポジトリ直下から行う。

```bash
uv run python scripts/make_historical_playoffs_csv.py
uv run python scripts/make_historical_playoffs_csv.py --years 2013 2024
```

出力は `docs/csv/{year}_allmatch_result-{J1PO,J2PO,J3PO}.csv`。
既に終了した大会だけを扱うため、日次更新には組み込まない。
同じ入力からの再実行では、公開CSVと `csv_timestamp.csv` を変更しない。

- 大会名を明示的に選別し、ルヴァンカップのプレーオフステージは含めない。
- `match_number` に公式データサイトの `match_card_id` を保存する。大会内の連番を新たに作らない。
- `round` は大会進行上のラウンド、`leg` はH&Aの第1・第2戦を表す。
- `section_no` は最後のラウンドを `-1` とする負の深度。同じH&A対戦は両legで同じ `match_index_in_section` を持つ。
- 得点は延長分を含む公式の最終得点。PK・延長内訳は中間CSVに存在する値を保存する。

## 対象と公式結果の照合

以下の勝者はPO・入れ替え戦そのものの勝者。上位リーグ所属クラブが勝つ場合は残留を意味する。
年のリンク先は、その年の公式試合結果一覧。1998年は3クラブが参入する大会であり、単独の優勝クラブを設けない。

| 年・公式結果 | J1PO | J2PO | J3PO | 試合数 |
| --- | --- | --- | --- | ---: |
| [1998](https://data.j-league.or.jp/SFMS01/search?competition_years=1998) | 参入決定戦：市原・神戸・福岡が参入 | — | — | 7 |
| [2004](https://data.j-league.or.jp/SFMS01/search?competition_years=2004) | J1/J2入替：柏 | — | — | 2 |
| [2005](https://data.j-league.or.jp/SFMS01/search?competition_years=2005) | J1/J2入替：甲府 | — | — | 2 |
| [2006](https://data.j-league.or.jp/SFMS01/search?competition_years=2006) | J1/J2入替：神戸 | — | — | 2 |
| [2007](https://data.j-league.or.jp/SFMS01/search?competition_years=2007) | J1/J2入替：京都 | — | — | 2 |
| [2008](https://data.j-league.or.jp/SFMS01/search?competition_years=2008) | J1/J2入替：磐田 | — | — | 2 |
| [2012](https://data.j-league.or.jp/SFMS01/search?competition_years=2012) | J1昇格PO：大分 | — | — | 3 |
| [2013](https://data.j-league.or.jp/SFMS01/search?competition_years=2013) | J1昇格PO：徳島 | J2/JFL入替：讃岐 | — | 5 |
| [2014](https://data.j-league.or.jp/SFMS01/search?competition_years=2014) | J1昇格PO：山形 | J2/J3入替：讃岐 | — | 4 |
| [2015](https://data.j-league.or.jp/SFMS01/search?competition_years=2015) | J1昇格PO：福岡 | J2/J3入替：町田 | — | 5 |
| [2016](https://data.j-league.or.jp/SFMS01/search?competition_years=2016) | J1昇格PO：Ｃ大阪 | J2/J3入替：金沢 | — | 5 |
| [2017](https://data.j-league.or.jp/SFMS01/search?competition_years=2017) | J1昇格PO：名古屋 | — | — | 3 |
| [2018](https://data.j-league.or.jp/SFMS01/search?competition_years=2018) | J1参入PO：磐田 | — | — | 3 |
| [2019](https://data.j-league.or.jp/SFMS01/search?competition_years=2019) | J1参入PO：湘南 | — | — | 4 |
| [2022](https://data.j-league.or.jp/SFMS01/search?competition_years=2022) | J1参入PO：京都 | — | — | 4 |
| [2023](https://data.j-league.or.jp/SFMS01/search?competition_years=2023) | J1昇格PO：東京Ｖ | — | — | 3 |
| [2024](https://data.j-league.or.jp/SFMS01/search?competition_years=2024) | J1昇格PO：岡山 | J2昇格PO：富山 | J3/JFL入替：高知 | 8 |
| [2025](https://data.j-league.or.jp/SFMS01/search?competition_years=2025) | J1昇格PO：千葉 | J2昇格PO：宮崎 | J3/JFL入替：滋賀 | 8 |
| 合計 | 18シーズン・54試合 | 6シーズン・14試合 | 2シーズン・4試合 | 72 |

入れ替え戦での昇格・残留は[公式沿革](https://www.jleague.jp/corporate/about_j/history_j/)でも確認できる。
例えば2006年の神戸は2戦合計1–1からアウェイゴールで勝利し、2015年の福岡は決勝の引き分けから年間順位によって昇格した。

## 方式の違い

### 1998年の参入決定戦

予備戦の福岡–川崎Ｆは1試合制で、福岡がVゴールにより3–2で勝った。
その後のH&Aでは、市原が福岡に、神戸が札幌にそれぞれ連勝して参入を決め、
敗者同士の福岡–札幌のH&Aを福岡が制した。
[公式の予備戦回顧](https://www.jleague.jp/news/article/15590/)と
[神戸–札幌第2戦の公式記録](https://data.j-league.or.jp/SFMS02/?match_card_id=4396)、
[福岡–札幌第2戦の公式記録](https://data.j-league.or.jp/SFMS02/?match_card_id=4398)を参照。

表示は「予備戦」「第1・第2参入クラブ決定戦」「第3参入クラブ決定戦」の独立した3ブロック。
これらは進行経路を区別する表示名であり、SFMS02の大会欄にある「第3参入クラブ決定戦」を全ブロックへ転記しない。
敗者が次へ進む経路を通常の勝者ツリーに混ぜず、全7試合を一度ずつ表示する。

### H&Aの入れ替え戦

| 対象 | 勝敗決定順 | 根拠 |
| --- | --- | --- |
| J1/J2 2004–2005 | 勝利数→得失点差→延長→PK。アウェイゴールなし | [2004年大会概要](https://www.jleague.jp/img/aboutj/document/jnews/102/vol0102.pdf)、[公式沿革の2005/12/20決定](https://www.jleague.jp/corporate/about_j/history_j/) |
| J1/J2 2006–2008 | 勝利数→得失点差→アウェイゴール→延長→PK | 同上。2006年からアウェイゴールを導入 |
| J2/JFL 2013、J2/J3 2014–2016 | 勝利数→得失点差→アウェイゴール→延長→PK | [2013年規程](https://aboutj.jleague.jp/corporate/assets/pdf/regulation/archives/jleague_Terms_and_regulations_2013.pdf)、[2014年大会概要](https://www.j3league.jp/wp-content/uploads/2019/12/20140129-2.pdf)、[2015年大会概要](https://aboutj.jleague.jp/corporate/pressrelease/article/7476)、[2016年規程](https://www.jleague.jp/corporate/assets/pdf/regulation/archives/jleague_Terms_and_regulations_2016.pdf) |
| J3/JFL 2024–2025 | 勝利数→得失点差→延長→PK。アウェイゴールなし | [2024年要項](https://www.jleague.jp/news/article/26788/)、[2025年要項](https://www.jleague.jp/news/article/29453/) |

延長の得点を通常時間のアウェイゴールとして数えない。設定は既存の `aggregate_tiebreak_order` で表す。

### 昇格・参入POのシードと引き分け

J1昇格POはJ2、J2昇格POはJ3の年間順位を優先順位とする1試合制。
引き分けなら順位上位クラブが勝ち抜け、延長・PKを作らない。
[J1昇格PO要項](https://www.jleague.jp/news/article/26786/)と
[J2昇格PO要項](https://www.jleague.jp/news/article/26785/)を参照。

2014年は5位北九州がJ1ライセンスを持たず、3位千葉・4位磐田・6位山形の3クラブが出場。
千葉が決勝から参加する。[公式大会報告](https://www.jleague.jp/img/aboutj/document/jnews/223/vol0223_01-04.pdf)

2018年はJ2・4位町田がJ1ライセンスを持たず不参加。J2の3位横浜FCは2回戦から参加する。
2018・2019・2022年の決定戦にはJ1・16位のクラブが参加し、引き分け時はそのJ1クラブを勝者とする。
[2018年大会特集](https://www.jleague.jp/special/j1promotion-playoffs/2018/)と
[決定戦の公式要項](https://www.jleague.jp/news/article/13424/)を参照。

## 上位優遇のデータ表現

任意列 `advantage_team` に、引き分け時に優遇されるクラブを明示する。
変換処理は下表の公式年間順位から選び、決定戦では別途確認したJ1・16位クラブを用いる。
ホーム側であることから優遇を推測しない。ライセンスによる不参加クラブがあっても、順位を詰め直さない。

| シーズン・公式順位表 | 優遇順位の根拠となる参加クラブ |
| --- | --- |
| [2012 J2](https://data.j-league.or.jp/SFRT01/?yearId=2012&competitionId=323&competitionSectionId=0&search=search) | 京都3、横浜FC4、千葉5、大分6 |
| [2013 J2](https://data.j-league.or.jp/SFRT01/?yearId=2013&competitionId=348&competitionSectionId=0&search=search) | 京都3、徳島4、千葉5、長崎6 |
| [2014 J2](https://data.j-league.or.jp/SFRT01/?yearId=2014&competitionId=373&competitionSectionId=0&search=search) | 千葉3、磐田4、山形6 |
| [2015 J2](https://data.j-league.or.jp/SFRT01/?yearId=2015&competitionId=400&competitionSectionId=0&search=search) | 福岡3、Ｃ大阪4、愛媛5、長崎6 |
| [2016 J2](https://data.j-league.or.jp/SFRT01/?yearId=2016&competitionId=413&competitionSectionId=0&search=search) | 松本3、Ｃ大阪4、京都5、岡山6 |
| [2017 J2](https://data.j-league.or.jp/SFRT01/?yearId=2017&competitionId=429&competitionSectionId=0&search=search) | 名古屋3、福岡4、東京Ｖ5、千葉6 |
| [2018 J2](https://data.j-league.or.jp/SFRT01/?yearId=2018&competitionId=445&competitionSectionId=0&search=search) | 横浜FC3、大宮5、東京Ｖ6。決定戦は[磐田（J1・16位）](https://data.j-league.or.jp/SFRT01/?yearId=2018&competitionId=444&competitionSectionId=0&search=search) |
| [2019 J2](https://data.j-league.or.jp/SFRT01/?yearId=2019&competitionId=467&competitionSectionId=0&search=search) | 大宮3、徳島4、甲府5、山形6。決定戦は[湘南（J1・16位）](https://data.j-league.or.jp/SFRT01/?yearId=2019&competitionId=460&competitionSectionId=0&search=search) |
| [2022 J2](https://data.j-league.or.jp/SFRT01/?yearId=2022&competitionId=522&competitionSectionId=0&search=search) | 岡山3、熊本4、大分5、山形6。決定戦は[京都（J1・16位）](https://data.j-league.or.jp/SFRT01/?yearId=2022&competitionId=521&competitionSectionId=0&search=search) |
| [2023 J2](https://data.j-league.or.jp/SFRT01/?yearId=2023&competitionId=555&competitionSectionId=0&search=search) | 東京Ｖ3、清水4、山形5、千葉6 |
| [2024 J2](https://data.j-league.or.jp/SFRT01/?yearId=2024&competitionId=590&competitionSectionId=0&search=search) | 長崎3、山形4、岡山5、仙台6 |
| [2025 J2](https://data.j-league.or.jp/SFRT01/?yearId=2025&competitionId=655&competitionSectionId=0&search=search) | 千葉3、徳島4、磐田5、大宮6 |
| [2024 J3](https://data.j-league.or.jp/SFRT01/?yearId=2024&competitionId=591&competitionSectionId=0&search=search) | 富山3、松本4、福島5、FC大阪6 |
| [2025 J3](https://data.j-league.or.jp/SFRT01/?yearId=2025&competitionId=657&competitionSectionId=0&search=search) | FC大阪3、宮崎4、鹿児島5、金沢6 |

描画時には、得点同数・PKなし・`status: 試合終了` であり、`advantage_team` が対戦クラブのいずれかに一致する場合だけ適用する。
得点差またはPKによる決着を上書きしない。勝敗理由は `advantage` とし、ツールチップに上位優遇での勝ち抜けを表示する。
表示日より未来の試合では、得点と勝者を従来どおり隠す。

## 回帰確認

Python側では、公式中間CSVの対象72試合と公開CSVのID集合、ホーム・アウェイ、得点、ラウンド・legを照合する。
フロント側では26シーズン全ての公式勝者、各試合の得点、ブラケットへの全件収容を確認する。
上位優遇の単体テストには、2013年の引き分けた準決勝から決勝への連結、アウェイ側の明示優遇、速報中には適用しないこと、理由表示と日付マスクを含める。
