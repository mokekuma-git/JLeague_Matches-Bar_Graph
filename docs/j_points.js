// TODO: Global変数以外の解決方法は、後で調べる
let HEIGHT_UNIT;
let INPUTS;
let COOKIE_OBJ; // COOKIE_OBJはwrite throughキャッシュ
let TARGET_DATE;
let BOX_CON;
const MATCH_DATE_SET = [];

const TARGET_ITEM_ID = { // Cookie_Key: HTML_key
  team_sort: 'team_sort_key',
  match_sort: 'match_sort_key',
  cat: 'category',
  season: 'season'
}

const SEASON_MAP = {
  // {Category: {Season: [All, Promoted, Relegated, [Default_Ranking]]}
  1: {
    "2021": [20, 3, 4,
      ["川崎Ｆ", "Ｇ大阪", "名古屋", "Ｃ大阪", "鹿島", "FC東京", "柏", "広島", "横浜FM", "浦和", "大分", "札幌", "鳥栖", "神戸", "横浜FC", "清水", "仙台", "湘南", "徳島", "福岡"]],
    "2020": [18, 4, 0,
      ["横浜FM", "FC東京", "鹿島", "川崎Ｆ", "Ｃ大阪", "広島", "Ｇ大阪", "神戸", "大分", "札幌", "仙台", "清水", "名古屋", "浦和", "鳥栖", "湘南", "柏", "横浜FC"]],
    "2019": [18, 3, 3,
      ["川崎Ｆ", "広島", "鹿島", "札幌", "浦和", "FC東京", "Ｃ大阪", "清水", "Ｇ大阪", "神戸", "仙台", "横浜FM", "湘南", "鳥栖", "名古屋", "磐田", "松本", "大分"]],
    "2018": [18, 3, 3,
      ["川崎Ｆ", "鹿島", "Ｃ大阪", "柏", "横浜FM", "磐田", "浦和", "鳥栖", "神戸", "Ｇ大阪", "札幌", "仙台", "FC東京", "清水", "広島", "湘南", "長崎", "名古屋"]],
    "2017": [18, 4, 3,
      ["鹿島", "浦和", "川崎Ｆ", "Ｇ大阪", "大宮", "広島", "神戸", "柏", "FC東京", "横浜FM", "鳥栖", "仙台", "磐田", "甲府", "新潟", "札幌", "清水", "Ｃ大阪"]],
    "2016B": [18, 4, 3,
      ["鹿島", "川崎Ｆ", "浦和", "広島", "大宮", "Ｇ大阪", "柏", "磐田", "FC東京", "仙台", "横浜FM", "神戸", "新潟", "名古屋", "鳥栖", "湘南", "甲府", "福岡"]],
    "2016A": [18, 4, 3,
      ["広島", "Ｇ大阪", "浦和", "FC東京", "鹿島", "川崎Ｆ", "横浜FM", "湘南", "名古屋", "柏", "鳥栖", "神戸", "甲府", "仙台", "新潟", "大宮", "磐田", "福岡"]],
    "2015B": [18, 4, 3,
      ["浦和", "FC東京", "広島", "Ｇ大阪", "川崎Ｆ", "横浜FM", "仙台", "鹿島", "名古屋", "湘南", "鳥栖", "甲府", "神戸", "柏", "松本", "山形", "新潟", "清水"]],
    "2015A": [18, 4, 3,
      ["Ｇ大阪", "浦和", "鹿島", "柏", "鳥栖", "川崎Ｆ", "横浜FM", "広島", "FC東京", "名古屋", "神戸", "新潟", "甲府", "仙台", "清水", "湘南", "松本", "山形"]],
    "2014": [18, 4, 3,
      ["広島", "横浜FM", "川崎Ｆ", "Ｃ大阪", "鹿島", "浦和", "新潟", "Ｆ東京", "清水", "柏", "名古屋", "鳥栖", "仙台", "大宮", "甲府", "Ｇ大阪", "神戸", "徳島"]],
    "2013": [18, 4, 3,
      ["広島", "仙台", "浦和", "横浜FM", "鳥栖", "柏", "名古屋", "川崎Ｆ", "清水", "Ｆ東京", "鹿島", "磐田", "大宮", "Ｃ大阪", "新潟", "甲府", "湘南", "大分"]],
    "2012": [18, 3, 3,
      ["柏", "名古屋", "Ｇ大阪", "仙台", "横浜FM", "鹿島", "広島", "磐田", "神戸", "清水", "川崎Ｆ", "Ｃ大阪", "大宮", "新潟", "浦和", "Ｆ東京", "鳥栖", "札幌"]],
    "2011": [18, 3, 3,
      ["名古屋", "Ｇ大阪", "Ｃ大阪", "鹿島", "川崎Ｆ", "清水", "広島", "横浜FM", "新潟", "浦和", "磐田", "大宮", "山形", "仙台", "神戸", "柏", "甲府", "福岡"]],
    "2010": [18, 3, 3,
      ["鹿島", "川崎Ｆ", "Ｇ大阪", "広島", "Ｆ東京", "浦和", "清水", "新潟", "名古屋", "横浜FM", "磐田", "京都", "大宮", "神戸", "山形", "仙台", "Ｃ大阪", "湘南"]],
    "2009": [18, 4, 3,
      ["鹿島", "川崎Ｆ", "名古屋", "大分", "清水", "Ｆ東京", "浦和", "Ｇ大阪", "横浜FM", "神戸", "柏", "大宮", "新潟", "京都", "千葉", "磐田", "広島", "山形"]],
    "2008": [18, 3, 3,
      ["鹿島", "浦和", "Ｇ大阪", "清水", "川崎Ｆ", "新潟", "横浜FM", "柏", "磐田", "神戸", "名古屋", "Ｆ東京", "千葉", "大分", "大宮", "札幌", "東京Ｖ", "京都"]],
    "2007": [18, 1, 3,
      ["浦和", "川崎Ｆ", "Ｇ大阪", "清水", "磐田", "鹿島", "名古屋", "大分", "横浜FM", "広島", "千葉", "大宮", "Ｆ東京", "新潟", "甲府", "横浜FC", "柏", "神戸"]],
    "2006": [18, 2, 3,
      ["Ｇ大阪", "浦和", "鹿島", "千葉", "Ｃ大阪", "磐田", "広島", "川崎Ｆ", "横浜FM", "Ｆ東京", "大分", "新潟", "大宮", "名古屋", "清水", "京都", "福岡", "甲府"]],
    "2005": [18, 1, 3,
      ["横浜FM", "浦和", "Ｇ大阪", "千葉", "磐田", "鹿島", "名古屋", "Ｆ東京", "東京Ｖ", "新潟", "神戸", "広島", "大分", "清水", "Ｃ大阪", "柏", "川崎Ｆ", "大宮"]],
    "2004B": [16, 1, 1,
      ["横浜FM", "磐田", "浦和", "Ｇ大阪", "鹿島", "Ｆ東京", "市原", "名古屋", "東京Ｖ", "大分", "清水", "神戸", "広島", "新潟", "柏", "Ｃ大阪"]],
    "2004A": [16, 1, 1,
      ["横浜FM", "磐田", "市原", "Ｆ東京", "鹿島", "浦和", "名古屋", "東京Ｖ", "Ｃ大阪", "Ｇ大阪", "清水", "柏", "神戸", "大分", "新潟", "広島"]],
    "2003B": [16, 1, 2,
      ["横浜FM", "磐田", "市原", "Ｆ東京", "Ｃ大阪", "浦和", "名古屋", "鹿島", "柏", "東京Ｖ", "清水", "Ｇ大阪", "神戸", "大分", "仙台", "京都"]],
    "2003A": [16, 1, 2,
      ["磐田", "横浜FM", "Ｇ大阪", "鹿島", "京都", "名古屋", "市原", "清水", "Ｆ東京", "東京Ｖ", "浦和", "柏", "仙台", "神戸", "大分", "Ｃ大阪"]],
    "2002B": [16, 1, 2,
      ["磐田", "横浜FM", "名古屋", "Ｇ大阪", "京都", "鹿島", "清水", "市原", "仙台", "Ｆ東京", "浦和", "東京Ｖ", "神戸", "柏", "広島", "札幌"]],
    "2002A": [16, 1, 2,
      ["鹿島", "磐田", "市原", "清水", "名古屋", "柏", "Ｇ大阪", "Ｆ東京", "広島", "浦和", "札幌", "神戸", "横浜FM", "東京Ｖ", "京都", "仙台"]],
    "2001B": [16, 1, 2,
      ["磐田", "名古屋", "清水", "市原", "Ｇ大阪", "柏", "Ｆ東京", "浦和", "札幌", "神戸", "鹿島", "広島", "福岡", "東京Ｖ", "Ｃ大阪", "横浜FM"]],
    "2001A": [16, 1, 2,
      ["鹿島", "横浜FM", "柏", "磐田", "Ｃ大阪", "Ｇ大阪", "Ｆ東京", "清水", "名古屋", "東京Ｖ", "広島", "福岡", "神戸", "市原", "札幌", "浦和"]],
    "2000B": [16, 1, 2,
      ["横浜FM", "Ｃ大阪", "清水", "柏", "磐田", "鹿島", "Ｆ東京", "神戸", "Ｖ川崎", "広島", "名古屋", "市原", "福岡", "Ｇ大阪", "川崎Ｆ", "京都"]],
    "2000A": [16, 1, 2,
      ["磐田", "清水", "柏", "名古屋", "横浜FM", "Ｃ大阪", "Ｖ川崎", "広島", "鹿島", "神戸", "Ｇ大阪", "京都", "市原", "福岡", "川崎Ｆ", "Ｆ東京"]],
    "1999B": [16, 1, 2,
      ["磐田", "Ｖ川崎", "清水", "柏", "Ｃ大阪", "広島", "横浜FM", "名古屋", "鹿島", "Ｇ大阪", "福岡", "神戸", "市原", "浦和", "京都", "平塚"]],
    "1999A": [16, 1, 2,
      ["鹿島", "磐田", "清水", "横浜FM", "名古屋", "浦和", "柏", "Ｃ大阪", "広島", "平塚", "Ｖ川崎", "京都", "Ｇ大阪", "市原", "神戸", "福岡"]],
    "1998B": [18, 1, 0,
      ["磐田", "清水", "名古屋", "横浜M", "鹿島", "Ｖ川崎", "浦和", "横浜Ｆ", "Ｃ大阪", "柏", "市原", "平塚", "広島", "Ｇ大阪", "京都", "札幌", "神戸", "福岡"]],
    "1998A": [18, 1, 0,
      ["磐田", "鹿島", "横浜M", "Ｇ大阪", "清水", "横浜Ｆ", "柏", "平塚", "名古屋", "浦和", "Ｃ大阪", "広島", "市原", "京都", "Ｖ川崎", "神戸", "福岡", "札幌"]],
    "1997B": [17, 1, 0,
      ["鹿島", "横浜Ｆ", "柏", "平塚", "横浜M", "磐田", "清水", "Ｇ大阪", "浦和", "広島", "Ｃ大阪", "名古屋", "京都", "神戸", "市原", "Ｖ川崎", "福岡"]],
    "1997A": [17, 1, 0,
      ["鹿島", "名古屋", "横浜Ｆ", "磐田", "柏", "浦和", "Ｖ川崎", "横浜M", "市原", "清水", "平塚", "Ｇ大阪", "Ｃ大阪", "広島", "福岡", "京都", "神戸"]],
    "1996": [16, 1, 0,
      ["横浜M", "Ｖ川崎", "名古屋", "浦和", "市原", "磐田", "鹿島", "Ｃ大阪", "清水", "広島", "平塚", "柏", "横浜Ｆ", "Ｇ大阪", "福岡", "京都"]],
    "1995B": [14, 1, 0,
      ["横浜M", "Ｖ川崎", "浦和", "名古屋", "磐田", "市原", "平塚", "鹿島", "Ｃ大阪", "広島", "Ｇ大阪", "清水", "横浜Ｆ", "柏"]],
    "1995A": [14, 1, 0,
      ["Ｖ川崎", "広島", "鹿島", "清水", "平塚", "横浜M", "横浜Ｆ", "磐田", "市原", "Ｇ大阪", "名古屋", "浦和", "Ｃ大阪", "柏"]],
    "1994B": [12, 1, 0,
      ["広島", "清水", "鹿島", "Ｖ川崎", "横浜Ｆ", "市原", "磐田", "名古屋", "横浜M", "Ｇ大阪", "平塚", "浦和"]],
    "1994A": [12, 1, 0,
      ["Ｖ川崎", "鹿島", "清水", "横浜M", "広島", "横浜Ｆ", "Ｇ大阪", "市原", "名古屋", "浦和", "平塚", "磐田"]],
    "1993B": [10, 1, 0,
      ["鹿島", "Ｖ川崎", "横浜M", "清水", "市原", "広島", "横浜Ｆ", "Ｇ大阪", "名古屋", "浦和"]],
    "1993A": [10, 1, 0,
      ["Ｖ川崎", "清水", "名古屋", "鹿島", "浦和", "市原", "横浜M", "Ｇ大阪", "広島", "横浜Ｆ"]],
  },
  2: {
    "2021": [22, 2, 4,
      ["長崎", "甲府", "北九州", "磐田", "山形", "水戸", "京都", "栃木", "新潟", "東京Ｖ", "松本", "千葉", "大宮", "琉球", "岡山", "金沢", "町田", "群馬", "愛媛", "山口", "秋田", "相模原"]],
    "2020": [22, 2, 0,
      ["松本", "磐田", "大宮", "徳島", "甲府", "山形", "水戸", "京都", "岡山", "新潟", "金沢", "長崎", "東京Ｖ", "琉球", "山口", "福岡", "千葉", "町田", "愛媛", "栃木", "北九州", "群馬"]],
    "2019": [22, 6, 2,
      ["柏", "長崎", "横浜FC", "町田", "大宮", "東京Ｖ", "福岡", "山口", "甲府", "水戸", "徳島", "山形", "金沢", "千葉", "岡山", "新潟", "栃木", "愛媛", "京都", "岐阜", "琉球", "鹿児島"]],
    "2018": [22, 6, 2,
      ["甲府", "新潟", "大宮", "福岡", "東京Ｖ", "千葉", "徳島", "松本", "大分", "横浜FC", "山形","京都", "岡山", "水戸", "愛媛", "町田", "金沢", "岐阜", "讃岐", "山口", "熊本", "栃木"]],
    "2017": [22, 6, 2,
      ["名古屋", "湘南", "福岡", "松本", "京都", "岡山", "町田", "横浜FC", "徳島", "愛媛", "千葉", "山口", "水戸", "山形", "長崎", "熊本", "群馬", "東京Ｖ", "讃岐", "岐阜", "金沢", "大分"]],
    "2016": [22, 6, 2,
      ["松本", "清水", "山形", "Ｃ大阪", "愛媛", "長崎", "北九州", "東京Ｖ", "千葉", "札幌", "岡山", "金沢", "熊本", "徳島", "横浜FC", "讃岐", "京都", "群馬", "水戸", "岐阜", "山口", "町田"]],
    "2015": [22, 6, 2,
      ["大宮", "Ｃ大阪", "徳島", "千葉", "磐田", "北九州", "大分", "岡山", "京都", "札幌", "横浜FC", "栃木", "熊本", "長崎", "水戸", "福岡", "岐阜", "群馬", "愛媛", "東京Ｖ", "讃岐", "金沢"]],
    "2014": [22, 6, 2,
      ["湘南", "磐田", "大分", "京都", "千葉", "長崎", "松本", "札幌", "栃木", "山形", "横浜FC", "岡山", "東京Ｖ", "福岡", "水戸", "北九州", "愛媛", "富山", "熊本", "群馬", "岐阜", "讃岐"]],
    "2013": [22, 6, 1,
      ["神戸", "Ｇ大阪", "札幌", "京都", "横浜FC", "千葉", "東京Ｖ", "岡山", "北九州", "山形", "栃木", "松本", "水戸", "熊本", "徳島", "愛媛", "群馬", "福岡", "富山", "鳥取", "岐阜", "長崎"]],
    "2012": [22, 6, 1,
      ["甲府", "福岡", "山形", "徳島", "東京Ｖ", "千葉", "京都", "北九州", "草津", "栃木", "熊本", "大分", "岡山", "湘南", "愛媛", "富山", "水戸", "横浜FC", "鳥取", "岐阜", "町田", "松本"]],
    "2011": [20, 3, 0,
      ["Ｆ東京", "京都", "湘南", "千葉", "東京Ｖ", "横浜FC", "熊本", "徳島", "鳥栖", "栃木", "愛媛", "草津", "札幌", "岐阜", "大分", "水戸", "岡山", "富山", "北九州", "鳥取"]],
    "2010": [19, 3, 0,
      ["柏", "大分", "千葉", "甲府", "鳥栖", "札幌", "東京Ｖ", "水戸", "徳島", "草津", "福岡", "岐阜", "富山", "熊本", "愛媛", "横浜FC", "栃木", "岡山", "北九州"]],
    "2009": [18, 3, 0,
      ["東京Ｖ", "札幌", "仙台", "Ｃ大阪", "湘南", "鳥栖", "甲府", "福岡", "草津", "横浜FC", "水戸", "熊本", "岐阜", "愛媛", "徳島", "栃木", "富山", "岡山"]],
    "2008": [15, 3, 0,
      ["広島", "甲府", "横浜FC", "仙台", "Ｃ大阪", "湘南", "福岡", "鳥栖", "山形", "愛媛", "草津", "水戸", "徳島", "熊本", "岐阜"]],
    "2007": [13, 3, 0,
      ["福岡", "Ｃ大阪", "京都", "鳥栖", "仙台", "札幌", "東京Ｖ", "山形", "愛媛", "水戸", "湘南", "草津", "徳島"]],
    "2006": [13, 3, 0,
      ["柏", "東京Ｖ", "神戸", "仙台", "山形", "札幌", "湘南", "鳥栖", "徳島", "水戸", "横浜FC", "草津", "愛媛"]],
    "2005": [12, 3, 0,
      ["福岡", "山形", "京都", "仙台", "甲府", "横浜FC", "水戸", "湘南", "鳥栖", "札幌", "徳島", "草津"]],
    "2004": [12, 3, 0,
      ["仙台", "京都", "川崎Ｆ", "福岡", "甲府", "大宮", "水戸", "山形", "札幌", "湘南", "横浜FC", "鳥栖"]],
    "2003": [12, 2, 0,
      ["広島", "札幌", "新潟", "川崎Ｆ", "湘南", "大宮", "甲府", "福岡", "鳥栖", "水戸", "山形", "横浜FC"]],
    "2002": [12, 2, 0,
      ["福岡", "Ｃ大阪", "山形", "新潟", "大宮", "大分", "川崎Ｆ", "湘南", "横浜FC", "鳥栖", "水戸", "甲府"]],
    "2001": [12, 2, 0,
      ["京都", "川崎Ｆ", "大分", "大宮", "仙台", "鳥栖", "新潟", "湘南", "水戸", "山形", "甲府", "横浜FC"]],
    "2000": [11, 2, 0,
      ["浦和", "湘南", "大分", "新潟", "札幌", "大宮", "山形", "鳥栖", "仙台", "甲府", "水戸"]],
    "1999": [10, 2, 0,
      ["札幌", "Ｆ東京", "川崎Ｆ", "山形", "甲府", "大分", "仙台", "鳥栖", "新潟", "大宮"]],
  },
  3: {
    "2021": [15, 2, 0,
      ["長野", "鹿児島", "鳥取", "岐阜", "今治", "熊本", "富山", "藤枝", "岩手", "沼津", "福島", "八戸", "讃岐", "YS横浜", "宮崎"]],
    "2020": [18, 2, 0,
      ["鹿児島", "岐阜", "藤枝", "富山", "熊本", "Ｃ大23", "鳥取", "秋田", "長野", "八戸", "福島", "沼津", "YS横浜", "讃岐", "相模原", "Ｆ東23", "Ｇ大23", "岩手", "今治"]],
    "2019": [18, 2, 0,
      ["熊本", "讃岐", "鳥取", "沼津", "群馬", "Ｇ大23", "Ｃ大23", "秋田", "相模原", "長野", "富山", "福島", "盛岡", "Ｆ東23", "YS横浜", "藤枝", "北九州", "八戸"]],
    "2018": [17, 2, 0,
      ["群馬", "秋田", "沼津", "鹿児島", "長野", "琉球", "藤枝", "富山", "北九州", "福島", "Ｆ東23", "相模原", "Ｃ大23", "YS横浜", "盛岡", "Ｇ大23", "鳥取"]],
    "2017": [17, 2, 0,
      ["北九州", "栃木", "長野", "秋田", "鹿児島", "富山", "藤枝", "琉球", "Ｇ大23", "Ｆ東23", "相模原", "Ｃ大23", "盛岡", "福島", "鳥取", "YS横浜", "沼津"]],
    "2016": [16, 2, 0,
      ["大分", "栃木", "長野", "相模原", "富山", "鳥取", "福島", "秋田", "琉球", "藤枝", "盛岡", "YS横浜", "鹿児島", "Ｇ大23", "Ｆ東23", "Ｃ大23"]],
    "2015": [13, 2, 0,
      ["富山", "長野", "町田", "鳥取", "盛岡", "相模原", "福島", "秋田", "琉球", "J-22", "藤枝", "YS横浜", "山口"]],
    "2014": [12, 2, 0,
      ["鳥取", "長野", "相模原", "町田", "金沢", "秋田", "琉球", "YS横浜", "藤枝", "福島", "盛岡", "J-22"]],
  },
};

window.addEventListener('load', init, false);

function init() {
  BOX_CON = document.getElementById('box_container');
  load_cookies();
  refresh_match_data();
  TARGET_DATE = date_format(new Date());
  document.getElementById('future_opacity').addEventListener('change', set_future_opacity_ev, false);
  document.getElementById('space_color').addEventListener('change', set_space_ev, false);
  document.getElementById('team_sort_key').addEventListener('change', set_sort_key_ev, false);
  document.getElementById('match_sort_key').addEventListener('change', set_match_sort_key_ev, false);
  document.getElementById('category').addEventListener('change', set_category_ev, false);
  document.getElementById('season').addEventListener('change', set_season_ev, false);
  document.getElementById('date_slider').addEventListener('change', set_date_slider_ev, false);
  document.getElementById('reset_date_slider').addEventListener('click', reset_date_slider_ev, false);
  document.getElementById('reset_cookie').addEventListener('click', function(){clear_cookies(); load_cookies();}, false);
  document.getElementById('scale_slider').addEventListener('change', set_scale_ev, false);

  // デフォルト値の読み込み
  HEIGHT_UNIT = parseInt(get_css_rule('.short').style.height);
}

function load_cookies() {
  COOKIE_OBJ = parse_cookies();
  const opacity = get_cookie('opacity');
  if(opacity) {
    set_future_opacity(opacity, false, true);
  } else { // cookieにopacity設定がなければ、CSSのデフォルト値を設定
    const _rule = get_css_rule('.future');
    document.getElementById('future_opacity').value = _rule.style.opacity;
    document.getElementById('current_opacity').innerHTML = _rule.style.opacity;
  }

  const space = get_cookie('space');
  if(space) set_space(space, false, true);

  const team_sort = get_cookie('team_sort');
  if(team_sort) set_pulldown('team_sort', team_sort, false, true, false);

  const match_sort = get_cookie('match_sort');
  if(match_sort) set_pulldown('match_sort', match_sort, false, true, false);

  const cat = get_cookie('cat');
  if(cat) set_pulldown('cat', cat, false, true, false);
  // load_cookieの後にはrenderが呼ばれるので、ここではrenderは不要
  make_season_pulldown();

  const scale = get_cookie('scale');
  if(scale) set_scale(scale, false, true);
}

function parse_cookies() {
  const cookies = document.cookie;
  COOKIE_OBJ = {};
  for(const c of cookies.split(';')) {
    const cArray = c.trim().split('=');
    // TODO: =が無かった時のチェック
    COOKIE_OBJ[cArray[0]] = cArray[1];
  }
  return COOKIE_OBJ;
}

function get_cookie(key) {
  if(key in COOKIE_OBJ) return COOKIE_OBJ[key];
  return undefined;
}

function set_cookie(key, value) { // COOKIE_OBJはwrite throughキャッシュ
  COOKIE_OBJ[key] = value;
  document.cookie = key + '=' + value;
}

function clear_cookies() {
  const cookie_obj = parse_cookies();
  Object.keys(cookie_obj).forEach(function(key) {
    document.cookie = key + '=;max-age=0';
  });
}

function refresh_match_data() {
  let filename = 'j' + document.getElementById('category').value + '_points.json';
  let season = get_season();
  if (document.querySelector("#season").selectedIndex != 0) filename = season + "-" + filename;
  // console.log('Read match data: ' + filename);
  read_inputs(filename);
}

function read_inputs(filename) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', filename);
  xhr.send();
  xhr.onload = ()=> {
    INPUTS = JSON.parse(xhr.responseText);
    render_bar_graph();
  };
}

function make_insert_columns(category) {
  // 各カテゴリの勝ち点列を入れる敷居位置を決定
  //  昇格チーム (ACL出場チーム)、中間、降格チームの位置に挟む
  let season_data = SEASON_MAP[category][get_season()];
  const columns = [season_data[1], Math.floor(season_data[0] / 2)];
  if (season_data[2] != 0) columns.push(season_data[0] - season_data[2]);
  return columns;
}

function get_season() {
  const season = document.querySelector("#season").value;
  if (season == "current") return new Date().getYear() + 1900;
  return season;
}

const is_string = (value) => (typeof(value) === 'string' || value instanceof String);
const is_number = (value) => (typeof(value) === 'number');

const compare_str = (a, b) => (a === b) ? 0 : (a < b) ? -1 : 1;
function make_html_column(target_team, team_data) {
  // 抽出したチームごとのDataFrameを使って、HTMLでチームの勝ち点積み上げ表を作る
  //  target_team: 対象チームの名称
  //  team_data:
  //    .df: make_team_dfで抽出したチームデータ (試合リスト)
  //    以下、この関数の中で生成
  //    .point: 対象チームの勝ち点 (最新)
  //    .avlbl_pt: 対象チームの最大勝ち点 (最新)
  //    .disp_point: 表示時点の勝点
  //    .disp_avlbl_pt: 表示時点の最大勝点
  const box_list = [];
  const lose_box = [];
  team_data.point = 0; // 最新の勝点 TODO: 最新情報は、CSVを直接読む形式に変えた時にそちらで計算
  team_data.avlbl_pt = 0; // 最新の最大勝ち点
  team_data.goal_diff = 0; // 最新の得失点差
  team_data.goal_get = 0; // 最新の総得点
  team_data.disp_avlbl_pt = 0; // 表示時の最大勝点
  team_data.disp_point = 0; // 表示時の勝ち点
  team_data.disp_goal_diff = 0; // 表示時の得失点差
  team_data.disp_goal_get = 0; // 表示時の総得点
  let match_sort_key;
  if(['first_bottom', 'last_bottom'].includes(document.getElementById('match_sort_key').value)) {
    match_sort_key = 'section_no';
  } else {
    match_sort_key = 'match_date';
  }
  team_data.df.sort(function(a, b) {
    v_a = a[match_sort_key];
    v_b = b[match_sort_key];
    if(match_sort_key === 'section_no') return parseInt(v_a) - parseInt(v_b);
    return compare_str(v_a, v_b);
  }).forEach(function(_row) {
    let match_date;
    if(is_string(_row.match_date)) {
      match_date = _row.match_date;
      if (!MATCH_DATE_SET.includes(match_date)) MATCH_DATE_SET.push(match_date)
    } else {
      match_date = (_row.match_date) ? _row.match_date : '未定 ';
    }

    let future;
    if(! _row.has_result) {
      future = true;
      box_height = 3;
      // 試合が無いので、勝点、得失点差は不変、最大勝ち点は⁺3
      team_data.avlbl_pt += 3;
      team_data.disp_avlbl_pt += 3;
    } else {
      // 試合があるので、実際の勝ち点、最大勝ち点、得失点は実際の記録通り
      team_data.point += _row.point;
      team_data.avlbl_pt += _row.point;
      team_data.goal_diff += _row.goal_get - _row.goal_lose;
      team_data.goal_get += _row.goal_get;
      if(match_date <= TARGET_DATE) {
        future = false;
        box_height = _row.point;
        // 表示対象なので、表示時点のdisp_も実際と同じ
        team_data.disp_point += _row.point;
        team_data.disp_avlbl_pt += _row.point;
        team_data.disp_goal_diff += _row.goal_get - _row.goal_lose;
        team_data.disp_goal_get += _row.goal_get;
      } else {
        future = true;
        box_height = 3;
        // 表示対象ではないので、表示時点のdisp_は勝点、得失点差は不変、最大勝ち点は⁺3
        team_data.disp_avlbl_pt += 3;
      }
    }

    let box_html;
    // INNER_HTMLにHTML直書きはダサい？ コンポーネントごと追加していくスタイルにすべきか
    if(box_height == 3) {
      if(future) {
        box_html = '<div class="tall box"><div class="future bg ' + target_team + '"></div><p class="tooltip">'
          + make_win_content(_row, match_date)
          + '<span class="tooltiptext ' + target_team + '">(' + _row.section_no + ')</span></p></div>\n';
      } else {
        box_html = '<div class="tall box"><p class="tooltip ' + target_team + '">' + make_win_content(_row, match_date)
          + '<span class="tooltiptext ' + target_team + '">(' + _row.section_no + ')</span></p></div>\n';
      }
    } else if(box_height == 1) {
      box_html = '<div class="short box"><p class="tooltip ' + target_team + '">'
        + make_draw_content(_row, match_date) + '<span class="tooltiptext full ' + target_team + '">'
        + make_full_content(_row, match_date) + '</span></p></div>';
      // _row.goal_get + '-' + _row.goal_lose + '<br/>';
    } else if(box_height == 0) {
      lose_box.push(make_full_content(_row, match_date));
    }
    box_list.push(box_html);
  });
  return {html: box_list, avlbl_pt: team_data.disp_avlbl_pt, target_team: target_team, lose_box: lose_box};
}
function append_space_cols(cache, max_avlbl_pt) {
  // 上の make_html_column の各チームの中間状態と、全チームで最大の「シーズン最大勝ち点(avlbl_pt)」を受け取る
  //
  const space_cols = max_avlbl_pt - cache.avlbl_pt; // 最大勝ち点は、スライダーで変わるので毎回計算することに修正
  if(space_cols) {
    cache.html.push('<div class="space box" style="height:' + HEIGHT_UNIT * space_cols + 'px">(' + space_cols + ')</div>');
  }
  if(['old_bottom', 'first_bottom'].includes(document.getElementById('match_sort_key').value)) {
    cache.html.reverse();
    cache.lose_box.reverse();
  }
  const team_name = '<div class="short box tooltip ' + cache.target_team + '">' + cache.target_team
    + '<span class=" tooltiptext full ' + cache.target_team + '">敗戦記録:<hr/>'
    + cache.lose_box.join('<hr/>') + '</span></div>\n';
  return '<div id="' + cache.target_team + '_column">' + team_name + cache.html.join('') + team_name + '</div>\n\n';
}

function make_win_content(_row, match_date) {
  return match_date + ' ' + _row.opponent + '<br/>'
    + _row.goal_get + '-' + _row.goal_lose
    + '<br/>' + _row.stadium;
}
function make_draw_content(_row, match_date) {
  return match_date + ' ' + _row.opponent;
}
function make_full_content(_row, match_date) {
  return '(' + _row.section_no + ') ' + match_date + ' ' + _row.opponent + '<br/>'
    + _row.goal_get + '-' + _row.goal_lose + ' ' + _row.stadium;
}

const dgt = (m, n) => ('0000' + m).substr(-n);
function date_format(_date) {
  if(is_string(_date)) return _date;
  return [dgt((_date.getMonth() + 1), 2), dgt(_date.getDate(), 2)].join('/');
}

function make_point_column(max_avlbl_pt) {
  // 勝点列を作って返す
  let box_list = []
  Array.from(Array(max_avlbl_pt), (v, k) => k + 1).forEach(function(_i) {
    box_list.push('<div class="point box">' + _i + '</div>')
  });
  if(['old_bottom', 'first_bottom'].includes(document.getElementById('match_sort_key').value)) {
    box_list.reverse();
  }
  return '<div class="point_column"><div class="point box">勝点</div>' + box_list.join('') + '<div class="point box">勝点</div></div>\n\n'
}

function render_bar_graph() {
  if(! INPUTS) return;
  MATCH_DATE_SET.length = 0; // TODO: 最新情報は、CSVを直接読む形式に変えた時にそちらで計算
  MATCH_DATE_SET.push('01/01');
  BOX_CON.innerHTML = '';
  let columns = {};
  let max_avlbl_pt = 0;
  Object.keys(INPUTS.matches).forEach(function (team_name) {
    // 各チームの積み上げグラフ (spaceは未追加) を作って、中間状態を受け取る
    columns[team_name] = make_html_column(team_name, INPUTS.matches[team_name]);
    max_avlbl_pt = Math.max(max_avlbl_pt, columns[team_name].avlbl_pt);
  });
  Object.keys(INPUTS.matches).forEach(function (team_name) {
    columns[team_name].html = append_space_cols(columns[team_name], max_avlbl_pt);
  });
  MATCH_DATE_SET.sort();
  reset_date_slider(date_format(TARGET_DATE));
  let insert_point_columns = make_insert_columns(INPUTS.category);
  let point_column = make_point_column(max_avlbl_pt);
  BOX_CON.innerHTML += point_column;
  get_sorted_team_list(INPUTS.matches).forEach(function(team_name, index) {
    if(insert_point_columns.includes(index))
      BOX_CON.innerHTML += point_column;
    BOX_CON.innerHTML += columns[team_name].html;
  });
  BOX_CON.innerHTML += point_column;
  set_scale(document.getElementById('scale_slider').value, false, false);
}

function get_sorted_team_list(matches) {
  const sort_key = document.getElementById('team_sort_key').value;
  return Object.keys(matches).sort(function(a, b) {
    // team_sort_keyで指定された勝ち点で比較
    let compare = matches[b][sort_key] - matches[a][sort_key];
    // console.log('勝点', sort_key, a, matches[a][sort_key], b, matches[b][sort_key]);
    if(compare != 0) return compare;

    // 得失点差で比較 (表示時点か最新かで振り分け)
    if(sort_key.startsWith('disp_')) {
      compare = matches[b].disp_goal_diff - matches[a].disp_goal_diff;
      // console.log('得失点(disp)', a, matches[a].disp_goal_diff, b, matches[b].disp_goal_diff);
    } else {
      compare = matches[b].goal_diff - matches[a].goal_diff;
      // console.log('得失点', a, matches[a].goal_diff, b, matches[b].goal_diff);
    }
    if(compare != 0) return compare;

    // 総得点で比較 (表示時点か最新かで振り分け)
    if (sort_key.startsWith("disp_")) {
      compare = matches[b].disp_goal_get - matches[a].disp_goal_get;
      // console.log('総得点(disp)', a, matches[a].disp_goal_get, b, matches[b].disp_goal_get);
    } else {
      compare = matches[b].goal_get - matches[a].goal_get;
      // console.log('総得点', a, matches[a].goal_get, b, matches[b].goal_get);
    }
    if (compare != 0) return compare;

    // それでも同じなら、前年の順位を元にソート
    // console.log('前年順位', a, DEFAULT_TEAM_SORT[category].indexOf(a), b, DEFAULT_TEAM_SORT[category].indexOf(b));
    const season = get_season();
    if (! SEASON_MAP[INPUTS.category][season][3]) return 0;
    return (
      SEASON_MAP[INPUTS.category][season][3].indexOf(a) -
      SEASON_MAP[INPUTS.category][season][3].indexOf(b)
    );
  });
}

function reset_date_slider(target_date) { // MATCH_DATAが変わった時用
  if(!MATCH_DATE_SET) return;
  const slider = document.getElementById('date_slider');
  slider.max = MATCH_DATE_SET.length - 1;
  document.getElementById('pre_date_slider').innerHTML = MATCH_DATE_SET[0];
  document.getElementById('post_date_slider').innerHTML = MATCH_DATE_SET[MATCH_DATE_SET.length - 1];
  document.getElementById('target_date').innerHTML = target_date;
  let _i = 0;
  for(; _i < MATCH_DATE_SET.length; _i++) {
    if(MATCH_DATE_SET[_i + 1] <= target_date) continue;
    break;
  }
  slider.value = _i;
}

function make_season_pulldown() {
  const category = document.querySelector("#category").value;
  const options = [];
  Object.keys(SEASON_MAP[category]).sort().reverse().forEach(function (x) {
      options.push('<option value="' + x + '">' + x + "</option>\n");
    });
  document.querySelector("#season").innerHTML = options.join("");
}

/// //////////////////////////////////////////////////////////// 設定変更
function set_scale_ev(event) {
  set_scale(event.target.value, true, false);
}
function set_scale(scale, cookie_write = true, slider_write = true) {
  BOX_CON.style.transform = "scale(" + scale + ")";
  const p_col = document.querySelector('.point_column');
  if(p_col) BOX_CON.style.height = p_col.clientHeight * scale;
  document.getElementById('current_scale').innerHTML = scale;
  if(cookie_write) set_cookie('scale', scale);
  if(slider_write) document.getElementById('scale_slider').value = scale;
}

function set_sort_key_ev(event) {
  set_pulldown('team_sort', event.target.value, true, false);
}
function set_match_sort_key_ev(event) {
  set_pulldown('match_sort', event.target.value, true, false);
}
function set_category_ev(event) {
  make_season_pulldown();
  refresh_match_data();
  set_pulldown('cat', event.target.value, true, false, false);
}
function set_season_ev(event) {
  reset_target_date();
  refresh_match_data();
  // set_pulldown('season', event.target.value, true, false, false); // COOKIE保存は後回し
}
function set_pulldown(key, value, cookie_write = true, pulldown_write = true, call_render = true) {
  if(cookie_write) set_cookie(key, value);
  if(pulldown_write) {
    const select = document.getElementById(TARGET_ITEM_ID[key]);
    select.selectedIndex = select.querySelector('option[value="' + value + '"]').index;
  }
  if(call_render) render_bar_graph(); // 今のところ、false だけだけど、念のため
}

function set_date_slider_ev(event) { // Cookieで制御しないし、数値リセットは別コマンドなので、シンプルに
  TARGET_DATE = MATCH_DATE_SET[event.target.value];
  document.getElementById('target_date').innerHTML = TARGET_DATE;
  render_bar_graph();
}
function reset_date_slider_ev(event) {
  reset_target_date();
  reset_date_slider(TARGET_DATE);
  render_bar_graph();
}
function reset_target_date() {
  if(document.querySelector('#season').selectedIndex == 0) TARGET_DATE = date_format(new Date());
  else TARGET_DATE = '12/31';
}
/// //////////////////////////////////////////////////////////// 背景調整用
function set_future_opacity_ev(event) {
  set_future_opacity(event.target.value, true, false);
}
function set_future_opacity(value, cookie_write = true, slider_write = true) {
  // set_future_opacity はクラス設定の変更のみで、renderは呼ばないのでcall_renderは不要
  _rule = get_css_rule('.future')
  _rule.style.opacity = value;
  document.getElementById('current_opacity').innerHTML = value;
  if(cookie_write) set_cookie('opacity', value);
  if(slider_write) document.getElementById('future_opacity').value = value;
}

function set_space_ev(event) {
  set_space(event.target.value, true, false);
}
function set_space(value, cookie_write = true, color_write = true) {
  // set_space はクラス設定の変更のみで、renderは呼ばないのでcall_renderは不要
  _rule = get_css_rule('.space')
  _rule.style.backgroundColor = value;
  _rule.style.color = getBright(value, RGB_MOD) > 0.5 ? 'black' : 'white';
  if(cookie_write) set_cookie('space', value);
  if(color_write) document.getElementById('space_color').value = value;
}

function get_css_rule(selector) {
  let _sheet;
  Array.from(document.styleSheets).forEach(function(sheet) {if(sheet.href.endsWith('j_points.css')) {_sheet = sheet;}});
  let _rule;
  Array.from(_sheet.cssRules).forEach(function(rule) {if(rule.selectorText == selector) _rule = rule;});
  return _rule;
}

// https://qiita.com/fnobi/items/d3464ba0e4b6596863cb より
// 補正付きの明度取得
function getBright (colorcode, RGB_MOD) {
  // 先頭の#は、あってもなくてもOK
  if (colorcode.match(/^#/)) {
    colorcode = colorcode.slice(1);
  }
  // 無駄に、ケタを動的に判断してるので、
  // 3の倍数ケタの16進数表現ならOK etc) #ff0000 #f00 #fff000000
  const rank = Math.floor(colorcode.length / 3);
  if (rank < 1) {
    return false;
  }
  // 16進数をparseして、RGBそれぞれに割り当て
  const rgb = [];
  for (let i = 0; i < 3; i++) {
    rgb.push(parseInt(colorcode.slice(rank * i, rank * (i + 1)), 16));
  }
  // 青は暗めに見えるなど、見え方はRGBそれぞれで違うので、
  // それぞれ補正値を付けて、人間の感覚に寄せられるようにした
  const rmod = RGB_MOD.r || 1;
  const gmod = RGB_MOD.g || 1;
  const bmod = RGB_MOD.b || 1;
  // 明度 = RGBの最大値
  const bright = Math.max(rgb[0] * rmod, rgb[1] * gmod, rgb[2] * bmod) / 255;
  // 明度を返す
  return bright;
};

// 補正はとりあえず、こんなもんがよさげだった
const RGB_MOD = { r: 0.9, g: 0.8, b: 0.4 };
