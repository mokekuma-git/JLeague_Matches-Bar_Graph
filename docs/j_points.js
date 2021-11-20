// TODO: Global変数以外の解決方法は、後で調べる
let HEIGHT_UNIT;
let SEASON_MAP;
let INPUTS;
let COOKIE_OBJ; // COOKIE_OBJはwrite throughキャッシュ
let TARGET_DATE;
let BOX_CON;
let COMPARE_DEBUG = false;
let RELEGATION_DEBUG = false;
const MATCH_DATE_SET = [];

const TARGET_ITEM_ID = { // Cookie_Key: HTML_key
  team_sort: 'team_sort_key',
  match_sort: 'match_sort_key',
  cat: 'category',
  season: 'season'
}

window.addEventListener('load', read_seasonmap, false);

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
  const date_slider = document.getElementById('date_slider')
  date_slider.addEventListener('change', set_date_slider_ev, false);
  document.getElementById('date_slider_up').addEventListener('click', function() {date_slider.value++; set_date_slider_ev()}, false);
  document.getElementById('date_slider_down').addEventListener('click', function() {date_slider.value--; set_date_slider_ev()}, false);
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
  if(COOKIE_OBJ.hasOwnProperty(key)) return COOKIE_OBJ[key];
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
  INPUTS = {'matches': {}};
  read_inputs(get_csv_files(get_category(), get_season()));
}

function get_csv_files(category, season) {
  if (document.getElementById('season').selectedIndex == 0) return [get_csv_filename(category)];
  const target_seasons = [];
  Object.keys(SEASON_MAP[1]).forEach(function(x) {if (x.startsWith(season)) target_seasons.push(x);});
  if (target_seasons.length == 1) return [get_csv_filename(category, season)];
  target_seasons.shift(season);
  target_seasons.sort();
  const result = [];
  target_seasons.forEach(function(x) {result.push(get_csv_filename(category, x));});
  return result;
}

function get_csv_filename(category, season=null) {
  if (season) return 'csv/' + season + '_allmatch_result-J' + category + '.csv';
  return 'csv/match_result-J' + category + '.csv';
}

function read_seasonmap() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', './json/season_map.json');
  xhr.send();
  xhr.onload = ()=> {
    SEASON_MAP = JSON.parse(xhr.responseText);
    init();
  };
}

function read_inputs(filenames) {
  const cachebuster = Math.floor((new Date).getTime() / 1000 / 3600); // 1時間に1度キャッシュクリアというつもり
  Papa.parse(filenames.shift() + '?_='+ cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
	  download: true,
    complete: function(results) {
      // console.log(results);
      append_inputs(parse_csvresults(results.data, results.meta.fields, 'matches'));
      if (filenames.length == 0) render_bar_graph();
      else read_inputs(filenames);
    }
  });
}

// Javascriptではpandasも無いし、手続き的に
function parse_csvresults(data, fields, default_group=null) {
  const team_map = {};
  if (default_group === 'null') default_group = 'DefaultGroup';
  if (fields.includes('group')) default_group = null;
  let _i = 0
  let group = '';
  data.forEach(function (_match) {
    _i++;
    group = default_group || _match.group;
    // console.log(_i, group, _match.match_date, _match.home_team, _match.away_team);
    // console.log(_match);

    if (! team_map.hasOwnProperty(group)) team_map[group] = {};
    if (! team_map[group].hasOwnProperty(_match.home_team)) team_map[group][_match.home_team] = {'df': []};
    if (! team_map[group].hasOwnProperty(_match.away_team)) team_map[group][_match.away_team] = {'df': []};

    let match_date_str = _match.match_date;
    const match_date = new Date(_match.match_date);
    if (! isNaN(match_date))
      match_date_str = ('0' + (match_date.getMonth() + 1)).slice(-2) + '/' + ('0' + match_date.getDate()).slice(-2);
    team_map[group][_match.home_team].df.push({
      'is_home': true,
      'opponent': _match.away_team,
      'goal_get': _match.home_goal,
      'goal_lose': _match.away_goal,
      'has_result': Boolean(_match.home_goal && _match.away_goal),
      'point': get_point_from_result(_match.home_goal, _match.away_goal),
      'match_date': match_date_str,
      'section_no': _match.section_no,
      'stadium': _match.stadium,
      'start_time': _match.start_time
    });
    // console.log(team_map[group][_match.home_teame].df.slice(-1)[0]);
    team_map[group][_match.away_team].df.push({
      'is_home': false,
      'opponent': _match.home_team,
      'goal_get': _match.away_goal,
      'goal_lose': _match.home_goal,
      'has_result': Boolean(_match.home_goal && _match.away_goal),
      'point': get_point_from_result(_match.away_goal, _match.home_goal),
      'match_date': match_date_str,
      'section_no': _match.section_no,
      'stadium': _match.stadium,
      'start_time': _match.start_time
    });
    // console.log(team_map[group][_match.away_teame].df.slice(-1)[0]);
  });
  // console.log(team_map);
  return team_map;
}

function get_point_from_result(goal_get, goal_lose, has_extra=false, pk_get=null, pk_lose=null) {
  if (! (goal_get && goal_lose)) return 0;
  if (goal_get > goal_lose) return 3;
  if (goal_get < goal_lose) return 0;
  return 1;
}

function append_inputs(next) {
  // 複数シーズン表示用に、INPUTSの内容に、nextの試合内容を追加
  // 追加するmatches以外は、元のINPUTSの内容を引き継ぐ
  let _length = 0;
  // 奇数チーム数の時、各節にかならず1試合あるとは限らない
  // これまでの節数は、INPUTS内の最大のsection_noを調べて返す必要がある
  Object.keys(INPUTS.matches).forEach(function(team_name) {
    const match_data = INPUTS.matches[team_name].df;
    _length = Math.max(_length, parseInt(match_data[match_data.length -1].section_no));
  });
  Object.keys(next.matches).forEach(function(team_name) {
    if (! INPUTS.matches.hasOwnProperty(team_name)) {
      INPUTS.matches[team_name] = {'df': []};
    }
    next.matches[team_name].df.forEach(function(match_data) {
      match_data.section_no = parseInt(match_data.section_no) + _length;
      INPUTS.matches[team_name].df.push(match_data);
    });
  });
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
  const season = document.getElementById('season').value;
  if (season == 'current') return new Date().getYear() + 1900;
  return season;
}

function get_category() {
  return document.getElementById('category').value;
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
  team_data.win = 0; // 最新の勝利数
  team_data.lose = 0; // 最新の敗北数
  team_data.draw = 0; // 最新の引分数
  team_data.disp_win = 0; // 最新の勝利数
  team_data.disp_lose = 0; // 最新の敗北数
  team_data.disp_draw = 0; // 最新の引分数
  team_data.rest_games = {}; // 最新の残り試合・対戦相手
  team_data.disp_rest_games = {}; // 表示時の残り試合・対戦相手

  let match_sort_key;
  if(['first_bottom', 'last_bottom'].includes(document.getElementById('match_sort_key').value)) {
    match_sort_key = 'section_no';
  } else {
    match_sort_key = 'match_date';
  }
  team_data.df.sort(function(a, b) {  // 超カッコ悪い もっとうまく比較したい
    v_a = a[match_sort_key];
    v_b = b[match_sort_key];
    if(match_sort_key === 'section_no') return parseInt(v_a) - parseInt(v_b);
    if (! v_a.match(/^\d\d\/\d\d$/g)) {
      if (! v_b.match(/^\d\d\/\d\d$/g)) return 0;
      return 1;
    }
    if (! v_b.match(/^\d\d\/\d\d$/g)) return -1;
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
      if (team_data.rest_games.hasOwnProperty(_row.opponent)) team_data.rest_games[_row.opponent]++;
      else team_data.rest_games[_row.opponent] = 1;
      if (team_data.disp_rest_games.hasOwnProperty(_row.opponent)) team_data.disp_rest_games[_row.opponent]++;
      else team_data.disp_rest_games[_row.opponent] = 1;
    } else {
      // 試合があるので、実際の勝ち点、最大勝ち点、得失点は実際の記録通り
      team_data.point += _row.point;
      team_data.avlbl_pt += _row.point;
      if (_row.point > 1) team_data.win += 1;
      else if (_row.point == 1) team_data.draw += 1;
      else if (_row.point == 0) team_data.lose += 1; // 2013年以前は、また別途考慮 ⇒ 関数化すべき
      team_data.goal_diff += parseInt(_row.goal_get) - parseInt(_row.goal_lose);
      team_data.goal_get += parseInt(_row.goal_get);
      if(match_date <= TARGET_DATE) {
        future = false;
        box_height = _row.point;
        // 表示対象なので、表示時点のdisp_も実際と同じ
        if (_row.point > 1) team_data.disp_win += 1;
        else if (_row.point == 1) team_data.disp_draw += 1;
        else if (_row.point == 0) team_data.disp_lose += 1; // 2013年以前は、また別途考慮 ⇒ 関数化すべき
        team_data.disp_point += _row.point;
        team_data.disp_avlbl_pt += _row.point;
        team_data.disp_goal_diff += parseInt(_row.goal_get) - parseInt(_row.goal_lose);
        team_data.disp_goal_get += parseInt(_row.goal_get);
      } else {
        future = true;
        box_height = 3;
        // 表示対象ではないので、表示時点のdisp_は勝点、得失点差は不変、最大勝ち点は⁺3
        team_data.disp_avlbl_pt += 3;
        if (team_data.disp_rest_games.hasOwnProperty(_row.opponent)) team_data.disp_rest_games[_row.opponent]++;
        else team_data.disp_rest_games[_row.opponent] = 1;
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
  const stats = make_team_stats(team_data);
  return {graph: box_list, avlbl_pt: team_data.disp_avlbl_pt, target_team: target_team, lose_box: lose_box, stats: stats};
}

function make_team_stats(team_data) {
  let _pre = '';
  let _stats_type = '最新の状態';
  if(document.getElementById('team_sort_key').value.startsWith('disp_')) {
    _pre = 'disp_';
    _stats_type = '表示時の状態';
  }

  return _stats_type + '<br/>'
  + team_data[_pre + 'win'] + '勝 ' + team_data[_pre + 'draw'] + '分 ' + team_data[_pre + 'lose'] + '敗<br/>'
  + '勝点' + team_data[_pre + 'point'] + ', 最大' + team_data[_pre + 'avlbl_pt'] + '<br/>'
  + team_data[_pre + 'goal_get'] + '得点, ' + (team_data[_pre + 'goal_get'] - team_data[_pre + 'goal_diff']) + '失点<br/>'
  + '得失点差: ' + team_data[_pre + 'goal_diff'];
}

function append_space_cols(cache, max_avlbl_pt) {
  // 上の make_html_column の各チームの中間状態と、全チームで最大の「シーズン最大勝ち点(avlbl_pt)」を受け取る
  //
  const space_cols = max_avlbl_pt - cache.avlbl_pt; // 最大勝ち点は、スライダーで変わるので毎回計算することに修正
  if(space_cols) {
    cache.graph.push('<div class="space box" style="height:' + HEIGHT_UNIT * space_cols + 'px">(' + space_cols + ')</div>');
  }
  if(['old_bottom', 'first_bottom'].includes(document.getElementById('match_sort_key').value)) {
    cache.graph.reverse();
    cache.lose_box.reverse();
  }
  const team_name = '<div class="short box tooltip ' + cache.target_team + '">' + cache.target_team
    + '<span class=" tooltiptext full ' + cache.target_team + '">'
    + '成績情報:<hr/>' + cache.stats
    + '<hr/>敗戦記録:<hr/>'
    + cache.lose_box.join('<hr/>') + '</span></div>\n';
  return '<div id="' + cache.target_team + '_column">' + team_name + cache.graph.join('') + team_name + '</div>\n\n';
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
    columns[team_name].graph = append_space_cols(columns[team_name], max_avlbl_pt);
  });
  MATCH_DATE_SET.sort();
  reset_date_slider(date_format(TARGET_DATE));
  let insert_point_columns = make_insert_columns(get_category());
  let point_column = make_point_column(max_avlbl_pt);
  BOX_CON.innerHTML += point_column;
  get_sorted_team_list(INPUTS.matches).forEach(function(team_name, index) {
    if(insert_point_columns.includes(index))
      BOX_CON.innerHTML += point_column;
    BOX_CON.innerHTML += columns[team_name].graph;
  });
  BOX_CON.innerHTML += point_column;
  set_scale(document.getElementById('scale_slider').value, false, false);

  make_ranktable();
}

function get_sorted_team_list(matches) {
  const sort_key = document.getElementById('team_sort_key').value;
  return Object.keys(matches).sort(function(a, b) {
    // team_sort_keyで指定された勝ち点で比較
    let compare = matches[b][sort_key] - matches[a][sort_key];
    if (COMPARE_DEBUG) console.log('勝点', sort_key, a, matches[a][sort_key], b, matches[b][sort_key]);
    if(compare != 0) return compare;
    if (sort_key.endsWith('avlbl_pt')) { // 最大勝ち点が同じときは、既に取った勝ち点を次点で比較
      let sub_key = sort_key.replace('avlbl_pt', 'point');
      compare = matches[b][sub_key] - matches[a][sub_key];
      if (COMPARE_DEBUG) console.log('(通常の)勝点', sub_key, a, matches[a][sub_key], b, matches[b][sub_key]);
      if(compare != 0) return compare;
    }

    // 得失点差で比較 (表示時点か最新かで振り分け)
    if(sort_key.startsWith('disp_')) {
      compare = matches[b].disp_goal_diff - matches[a].disp_goal_diff;
      if (COMPARE_DEBUG) console.log('得失点(disp)', a, matches[a].disp_goal_diff, b, matches[b].disp_goal_diff);
    } else {
      compare = matches[b].goal_diff - matches[a].goal_diff;
      if (COMPARE_DEBUG) console.log('得失点', a, matches[a].goal_diff, b, matches[b].goal_diff);
    }
    if(compare != 0) return compare;

    // 総得点で比較 (表示時点か最新かで振り分け)
    if (sort_key.startsWith('disp_')) {
      compare = matches[b].disp_goal_get - matches[a].disp_goal_get;
      if (COMPARE_DEBUG) console.log('総得点(disp)', a, matches[a].disp_goal_get, b, matches[b].disp_goal_get);
    } else {
      compare = matches[b].goal_get - matches[a].goal_get;
      if (COMPARE_DEBUG) console.log('総得点', a, matches[a].goal_get, b, matches[b].goal_get);
    }
    if (compare != 0) return compare;

    // それでも同じなら、前年の順位を元にソート
    const pre_season = SEASON_MAP[get_category()][get_season()][3];
    if (! pre_season) return 0; // 前年データが入っていなければ、差分無しとして返す
    if (COMPARE_DEBUG) console.log('前年順位', a, pre_season.indexOf(a), b, pre_season.indexOf(b));
    return pre_season.indexOf(a) - pre_season.indexOf(b);
  });
}

function reset_date_slider(target_date) { // MATCH_DATAが変わった時用
  if(!MATCH_DATE_SET) return;
  const slider = document.getElementById('date_slider');
  slider.max = MATCH_DATE_SET.length - 1;
  document.getElementById('pre_date_slider').innerHTML = '開幕前';
  document.getElementById('post_date_slider').innerHTML = MATCH_DATE_SET[MATCH_DATE_SET.length - 1];
  document.getElementById('target_date').innerHTML = (target_date === MATCH_DATE_SET[0]) ? '開幕前' : target_date;
  if(target_date === MATCH_DATE_SET[0]) {
    slider.value = 0;
    return;
  }
  let _i = 0;
  for(; _i < MATCH_DATE_SET.length; _i++) {
    if(MATCH_DATE_SET[_i + 1] <= target_date) continue;
    break;
  }
  slider.value = _i;
}

function make_season_pulldown() {
  const category = get_category();
  const options = [];
  Object.keys(SEASON_MAP[category]).sort().reverse().forEach(function (x) {
      options.push('<option value="' + x + '">' + x + "</option>\n");
    });
  document.getElementById('season').innerHTML = options.join('');
}

/// //////////////////////////////////////////////////////////// 順位表
function make_ranktable() {
  const sortableTable = new SortableTable();
  sortableTable.setTable(document.getElementById('ranktable'));
  sortableTable.setData(make_rankdata());
}

function make_rankdata() {
  const disp = document.getElementById('team_sort_key').value.startsWith('disp_');
  const team_list = get_sorted_team_list(INPUTS.matches);
  const datalist = [];

  const [all_team_num, promotion_num, relegation_num] = SEASON_MAP[get_category()][get_season()];
  const relegation_rank = (all_team_num - relegation_num);
  // const promotion_rank = SEASON_MAP[get_category()][get_season()][1];
  const silver_line = get_possible_line(1, disp);
  const champion_line = get_safety_line(1, disp);
  const relegation_line = (relegation_num > 0) ? get_possible_line(relegation_rank, disp) : undefined;
  const keepleague_line = (relegation_num > 0) ? get_safety_line(relegation_rank, disp) : undefined;
  const promotion_line = get_safety_line(promotion_num, disp);
  const nonpromot_line = get_possible_line(promotion_num, disp);

  let rank = 0;
  team_list.forEach(function(team_name) {
    rank++;
    const team_data = INPUTS.matches[team_name];
    const tmp_data = {
      rank: rank,
      name: '<div class="' + team_name + '">' + team_name + '</div>',
      win: get_team_attr(team_data, 'win', disp),
      draw: get_team_attr(team_data, 'draw', disp),
      lose: get_team_attr(team_data, 'lose', disp),
      point: get_team_attr(team_data, 'point', disp),
      avlbl_pt: get_team_attr(team_data, 'avlbl_pt', disp),
      goal_get: get_team_attr(team_data, 'goal_get', disp),
      goal_diff: get_team_attr(team_data, 'goal_diff', disp),
    }
    tmp_data.goal_lose = tmp_data.goal_get - tmp_data.goal_diff;
    tmp_data.all_game = tmp_data.win + tmp_data.draw + tmp_data.lose;
    tmp_data.points_per_game = ((tmp_data.point == 0) ? 0 : (tmp_data.point / tmp_data.all_game)).toFixed(2);
    tmp_data.future_game = team_data.df.length - tmp_data.all_game;

    // 優勝計算
    const silver = tmp_data.avlbl_pt - silver_line;
    const champion = tmp_data.point - champion_line;
    const self_champion = tmp_data.avlbl_pt - get_self_possible_line(1, team_name, disp);
    tmp_data.champion = (champion >= 0) ? '確定' : (silver < 0) ? 'なし' : (self_champion >= 0) ? '自力' : '他力';
    // 昇格計算
    if (promotion_num > 0) {
      const remaining = tmp_data.avlbl_pt - nonpromot_line;
      const promotion = tmp_data.point - promotion_line;
      const self_promotion = tmp_data.avlbl_pt - get_self_possible_line(promotion_num, team_name, disp);
      tmp_data.promotion = (promotion >= 0) ? '確定' : (remaining < 0) ? 'なし' : (self_promotion >= 0) ? '自力' : '他力';
    }
    // 残留計算
    if (relegation_num > 0) {
      const keepleague = tmp_data.point - keepleague_line;
      const relegation = tmp_data.avlbl_pt - relegation_line;
      const self_relegation = tmp_data.avlbl_pt - get_self_possible_line(relegation_rank, team_name, disp);
      tmp_data.relegation = (keepleague >= 0) ? '確定' : (relegation < 0) ? '降格' : (self_relegation >= 0) ? '自力' : '他力';
    } else {
      tmp_data.relegation = 'なし';
    }
    datalist.push(tmp_data);
  });
  return datalist;
}
function get_team_attr(team_data, attr, disp) {
  const prefix = disp ? 'disp_' : '';
  return team_data[prefix + attr];
}
function make_point_cache() {
  // 勝ち点関係データをキャッシュしたobjectを返す (残留争いに得失点差情報は不要)
  const cache = {};
  Object.keys(INPUTS.matches).forEach(function(team_name) {
    const team_data = INPUTS.matches[team_name];  
    cache[team_name] = {
      point: team_data.point,
      avlbl_pt: team_data.avlbl_pt,
      disp_point: team_data.disp_point,
      disp_avlbl_pt: team_data.disp_avlbl_pt,
      rest_games: team_data.rest_games,
      disp_rest_games: team_data.disp_rest_games
    };
  });
  return cache;
}
function get_point_sorted_team_list(_key='point', point_map=null) {
  // 残留、昇格ラインなどのために、_keyでソートしたチーム名リストを返す (得失点差は無視)
  // 勝ち点マップを渡さない場合は、現在のテーブル表記に用いるマップを使用
  // 自力残留計算の場合は、残り試合対象のチームの最大勝ち点を引いたマップを渡して使う
  if (point_map == null) point_map = INPUTS.matches;
  return Object.keys(point_map).sort(function(a, b) {return point_map[b][_key] - point_map[a][_key]});
}
function get_safety_line(rank, disp=True) {
  // 現時点でrankの順位を確実にクリア可能な勝ち点を返す。
  // この値以上の勝ち点を持っているチームは、rank以上確定。 
  // 入力のrankは1-based、順位配列のindexは0-basedであることに注意
  const avlbl_pt = disp ? 'disp_avlbl_pt' : 'avlbl_pt'
  const avlbl_pt_sorted = get_point_sorted_team_list(avlbl_pt);
  if (RELEGATION_DEBUG) console.log(avlbl_pt_sorted[rank], INPUTS.matches[avlbl_pt_sorted[rank]], avlbl_pt);
  return INPUTS.matches[avlbl_pt_sorted[rank]][avlbl_pt] + 1;
}
function get_possible_line(rank, disp=True) {
  // 現時点でrankの順位の可能性がある勝ち点を返す。
  // この値以下の最大勝ち点しかないチームは、rankの順位になれる可能性はない
  rank--; // 0オリジンの rank 位チームに合わせる
  const point = disp ? 'disp_point' : 'point';
  const point_sorted = get_point_sorted_team_list(point);
  if (RELEGATION_DEBUG) console.log(point_sorted[rank], INPUTS.matches[point_sorted[rank]], point);
  return INPUTS.matches[point_sorted[rank]][point];
}
function get_self_possible_line(rank, team_name, disp=True) {
  // 現時点でrankの順位の可能性がある勝ち点を返す。
  // この値以下の最大勝ち点しかないチームは、rankの順位になれる可能性はない
  const avlbl_pt = disp ? 'disp_avlbl_pt' : 'avlbl_pt'
  // 入力のrankは1-based、順位配列のindexは0-basedであることに注意
  rank--; // 両方0-basedへ
  point_cache = make_point_cache();
  const avlbl_pt_list = Object.keys(point_cache).map(function(x){return point_cache[x].avlbl_pt;}).sort().reverse();
  const self_rank = avlbl_pt_list.indexOf(point_cache[team_name].avlbl_pt);  // チームの最大勝ち点的な順位を得る

  delete point_cache[team_name];
  const point_sorted = get_point_sorted_team_list(avlbl_pt, point_cache);
  let rest_games = INPUTS.matches[team_name][disp ? 'disp_rest_games' : 'rest_games'];
  Object.keys(rest_games).forEach(function (opponent) { // 自力計算では、残り試合の対戦相手はすべて負け前提
    point_cache[opponent][avlbl_pt] -= 3 * rest_games[opponent]; // 残り試合数×3点分、最大勝ち点を減らす
  });
  // 自力で全部勝った時に、残留チーム数分のチームよりavlbl_ptで上に立てれば、残留可能性はある
  if (RELEGATION_DEBUG) console.log('self_rank, rank: ', self_rank, rank);
  // if (RELEGATION_DEBUG) console.log(point_sorted, point_cache);
  if (RELEGATION_DEBUG) console.log(team_name + ' 残留比較対象チーム: ' + point_sorted[rank]);
  if (RELEGATION_DEBUG) point_sorted.forEach(function(opponent) {console.log(opponent, point_cache[opponent][avlbl_pt]);})
  return point_cache[point_sorted[rank]][avlbl_pt];
}
/// //////////////////////////////////////////////////////////// 設定変更
function set_scale_ev(event) {
  set_scale(event.target.value, true, false);
}
function set_scale(scale, cookie_write = true, slider_write = true) {
  BOX_CON.style.transform = 'scale(' + scale + ')';
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
    const target = select.querySelector('option[value="' + value + '"]');
    if(target) select.selectedIndex = target.index;
  }
  if(call_render) render_bar_graph(); // 今のところ、false だけだけど、念のため
}

function set_date_slider_ev(event) { // Cookieで制御しないし、数値リセットは別コマンドなので、シンプルに
  TARGET_DATE = MATCH_DATE_SET[document.getElementById('date_slider').value];
  document.getElementById('target_date').innerHTML = TARGET_DATE;
  render_bar_graph();
}
function reset_date_slider_ev(event) {
  reset_target_date();
  reset_date_slider(TARGET_DATE);
  render_bar_graph();
}
function reset_target_date() {
  if(document.getElementById('season').selectedIndex == 0) TARGET_DATE = date_format(new Date());
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
  Array.from(document.styleSheets).forEach(function(sheet) {if(sheet.href && sheet.href.endsWith('j_points.css')) {_sheet = sheet;}});
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
