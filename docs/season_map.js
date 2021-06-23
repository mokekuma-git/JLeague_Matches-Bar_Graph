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
    "2016": [18, 4, 3,
      ["広島", "Ｇ大阪", "浦和", "FC東京", "鹿島", "川崎Ｆ", "横浜FM", "湘南", "名古屋", "柏", "鳥栖", "神戸", "甲府", "仙台", "新潟", "大宮", "磐田", "福岡"]],
    "2015B": [18, 4, 3,
      ["浦和", "FC東京", "広島", "Ｇ大阪", "川崎Ｆ", "横浜FM", "仙台", "鹿島", "名古屋", "湘南", "鳥栖", "甲府", "神戸", "柏", "松本", "山形", "新潟", "清水"]],
    "2015A": [18, 4, 3,
      ["Ｇ大阪", "浦和", "鹿島", "柏", "鳥栖", "川崎Ｆ", "横浜FM", "広島", "FC東京", "名古屋", "神戸", "新潟", "甲府", "仙台", "清水", "湘南", "松本", "山形"]],
    "2015": [18, 4, 3,
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
    "2004": [16, 1, 1,
      ["横浜FM", "磐田", "市原", "Ｆ東京", "鹿島", "浦和", "名古屋", "東京Ｖ", "Ｃ大阪", "Ｇ大阪", "清水", "柏", "神戸", "大分", "新潟", "広島"]],
    "2003B": [16, 1, 2,
      ["横浜FM", "磐田", "市原", "Ｆ東京", "Ｃ大阪", "浦和", "名古屋", "鹿島", "柏", "東京Ｖ", "清水", "Ｇ大阪", "神戸", "大分", "仙台", "京都"]],
    "2003A": [16, 1, 2,
      ["磐田", "横浜FM", "Ｇ大阪", "鹿島", "京都", "名古屋", "市原", "清水", "Ｆ東京", "東京Ｖ", "浦和", "柏", "仙台", "神戸", "大分", "Ｃ大阪"]],
    "2003": [16, 1, 2,
      ["磐田", "横浜FM", "Ｇ大阪", "鹿島", "京都", "名古屋", "市原", "清水", "Ｆ東京", "東京Ｖ", "浦和", "柏", "仙台", "神戸", "大分", "Ｃ大阪"]],
    "2002B": [16, 1, 2,
      ["磐田", "横浜FM", "名古屋", "Ｇ大阪", "京都", "鹿島", "清水", "市原", "仙台", "Ｆ東京", "浦和", "東京Ｖ", "神戸", "柏", "広島", "札幌"]],
    "2002A": [16, 1, 2,
      ["鹿島", "磐田", "市原", "清水", "名古屋", "柏", "Ｇ大阪", "Ｆ東京", "広島", "浦和", "札幌", "神戸", "横浜FM", "東京Ｖ", "京都", "仙台"]],
    "2002": [16, 1, 2,
      ["鹿島", "磐田", "市原", "清水", "名古屋", "柏", "Ｇ大阪", "Ｆ東京", "広島", "浦和", "札幌", "神戸", "横浜FM", "東京Ｖ", "京都", "仙台"]],
    "2001B": [16, 1, 2,
      ["磐田", "名古屋", "清水", "市原", "Ｇ大阪", "柏", "Ｆ東京", "浦和", "札幌", "神戸", "鹿島", "広島", "福岡", "東京Ｖ", "Ｃ大阪", "横浜FM"]],
    "2001A": [16, 1, 2,
      ["鹿島", "横浜FM", "柏", "磐田", "Ｃ大阪", "Ｇ大阪", "Ｆ東京", "清水", "名古屋", "東京Ｖ", "広島", "福岡", "神戸", "市原", "札幌", "浦和"]],
    "2001": [16, 1, 2,
      ["鹿島", "横浜FM", "柏", "磐田", "Ｃ大阪", "Ｇ大阪", "Ｆ東京", "清水", "名古屋", "東京Ｖ", "広島", "福岡", "神戸", "市原", "札幌", "浦和"]],
    "2000B": [16, 1, 2,
      ["横浜FM", "Ｃ大阪", "清水", "柏", "磐田", "鹿島", "Ｆ東京", "神戸", "Ｖ川崎", "広島", "名古屋", "市原", "福岡", "Ｇ大阪", "川崎Ｆ", "京都"]],
    "2000A": [16, 1, 2,
      ["磐田", "清水", "柏", "名古屋", "横浜FM", "Ｃ大阪", "Ｖ川崎", "広島", "鹿島", "神戸", "Ｇ大阪", "京都", "市原", "福岡", "川崎Ｆ", "Ｆ東京"]],
    "2000": [16, 1, 2,
      ["磐田", "清水", "柏", "名古屋", "横浜FM", "Ｃ大阪", "Ｖ川崎", "広島", "鹿島", "神戸", "Ｇ大阪", "京都", "市原", "福岡", "川崎Ｆ", "Ｆ東京"]],
    "1999B": [16, 1, 2,
      ["磐田", "Ｖ川崎", "清水", "柏", "Ｃ大阪", "広島", "横浜FM", "名古屋", "鹿島", "Ｇ大阪", "福岡", "神戸", "市原", "浦和", "京都", "平塚"]],
    "1999A": [16, 1, 2,
      ["鹿島", "磐田", "清水", "横浜FM", "名古屋", "浦和", "柏", "Ｃ大阪", "広島", "平塚", "Ｖ川崎", "京都", "Ｇ大阪", "市原", "神戸", "福岡"]],
    "1999": [16, 1, 2,
      ["鹿島", "磐田", "清水", "横浜FM", "名古屋", "浦和", "柏", "Ｃ大阪", "広島", "平塚", "Ｖ川崎", "京都", "Ｇ大阪", "市原", "神戸", "福岡"]],
    "1998B": [18, 1, 0,
      ["磐田", "清水", "名古屋", "横浜M", "鹿島", "Ｖ川崎", "浦和", "横浜Ｆ", "Ｃ大阪", "柏", "市原", "平塚", "広島", "Ｇ大阪", "京都", "札幌", "神戸", "福岡"]],
    "1998A": [18, 1, 0,
      ["磐田", "鹿島", "横浜M", "Ｇ大阪", "清水", "横浜Ｆ", "柏", "平塚", "名古屋", "浦和", "Ｃ大阪", "広島", "市原", "京都", "Ｖ川崎", "神戸", "福岡", "札幌"]],
    "1998": [18, 1, 0,
      ["磐田", "鹿島", "横浜M", "Ｇ大阪", "清水", "横浜Ｆ", "柏", "平塚", "名古屋", "浦和", "Ｃ大阪", "広島", "市原", "京都", "Ｖ川崎", "神戸", "福岡", "札幌"]],
    "1997B": [17, 1, 0,
      ["鹿島", "横浜Ｆ", "柏", "平塚", "横浜M", "磐田", "清水", "Ｇ大阪", "浦和", "広島", "Ｃ大阪", "名古屋", "京都", "神戸", "市原", "Ｖ川崎", "福岡"]],
    "1997A": [17, 1, 0,
      ["鹿島", "名古屋", "横浜Ｆ", "磐田", "柏", "浦和", "Ｖ川崎", "横浜M", "市原", "清水", "平塚", "Ｇ大阪", "Ｃ大阪", "広島", "福岡", "京都", "神戸"]],
    "1997": [17, 1, 0,
      ["鹿島", "名古屋", "横浜Ｆ", "磐田", "柏", "浦和", "Ｖ川崎", "横浜M", "市原", "清水", "平塚", "Ｇ大阪", "Ｃ大阪", "広島", "福岡", "京都", "神戸"]],
    "1996": [16, 1, 0,
      ["横浜M", "Ｖ川崎", "名古屋", "浦和", "市原", "磐田", "鹿島", "Ｃ大阪", "清水", "広島", "平塚", "柏", "横浜Ｆ", "Ｇ大阪", "福岡", "京都"]],
    "1995B": [14, 1, 0,
      ["横浜M", "Ｖ川崎", "浦和", "名古屋", "磐田", "市原", "平塚", "鹿島", "Ｃ大阪", "広島", "Ｇ大阪", "清水", "横浜Ｆ", "柏"]],
    "1995A": [14, 1, 0,
      ["Ｖ川崎", "広島", "鹿島", "清水", "平塚", "横浜M", "横浜Ｆ", "磐田", "市原", "Ｇ大阪", "名古屋", "浦和", "Ｃ大阪", "柏"]],
    "1995": [14, 1, 0,
      ["Ｖ川崎", "広島", "鹿島", "清水", "平塚", "横浜M", "横浜Ｆ", "磐田", "市原", "Ｇ大阪", "名古屋", "浦和", "Ｃ大阪", "柏"]],
    "1994B": [12, 1, 0,
      ["広島", "清水", "鹿島", "Ｖ川崎", "横浜Ｆ", "市原", "磐田", "名古屋", "横浜M", "Ｇ大阪", "平塚", "浦和"]],
    "1994A": [12, 1, 0,
      ["Ｖ川崎", "鹿島", "清水", "横浜M", "広島", "横浜Ｆ", "Ｇ大阪", "市原", "名古屋", "浦和", "平塚", "磐田"]],
    "1994": [12, 1, 0,
      ["Ｖ川崎", "鹿島", "清水", "横浜M", "広島", "横浜Ｆ", "Ｇ大阪", "市原", "名古屋", "浦和", "平塚", "磐田"]],
    "1993B": [10, 1, 0,
      ["鹿島", "Ｖ川崎", "横浜M", "清水", "市原", "広島", "横浜Ｆ", "Ｇ大阪", "名古屋", "浦和"]],
    "1993A": [10, 1, 0,
      ["Ｖ川崎", "清水", "名古屋", "鹿島", "浦和", "市原", "横浜M", "Ｇ大阪", "広島", "横浜Ｆ"]],
    "1993": [10, 1, 0,
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