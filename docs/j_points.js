// TODO: Global変数以外の解決方法は、後で調べる
let HEIGHT_UNIT;
let INPUTS;
let COOKIE_OBJ; // COOKIE_OBJはwrite throughキャッシュ

const CATEGORY_TOP_TEAMS = [3, 2, 2];
const CATEGORY_BOTTOM_TEAMS = [4, 4, 0];
const CATEGORY_TEAMS_COUNT = [20, 22, 15];
const TARGET_ITEM_ID = {
  sort: '#team_sort_key',
  bottom: '#old_bottom',
  cat: '#category'
}

window.addEventListener('load', init, false);

function init() {
  load_cookies();
  refresh_category();
  document.querySelector('#future_opacity').addEventListener('change', set_future_opacity_ev, false);
  document.querySelector('#space_color').addEventListener('change', set_space_ev, false);
  document.querySelector('#team_sort_key').addEventListener('change', set_sort_key_ev, false);
  document.querySelector('#old_bottom').addEventListener('change', set_old_bottom_ev, false);
  document.querySelector('#category').addEventListener('change', set_category_ev, false);

  // デフォルト値の読み込み
  HEIGHT_UNIT = parseInt(window.getComputedStyle(document.querySelector('.short')).getPropertyValue('height'));
  if(!get_cookie('opacity')) { // cookieにopacity設定がなければ、CSSのデフォルト値を設定
    const _rule = get_css_rule('.future');
    document.querySelector('#future_opacity').value = _rule.style.opacity;
    document.querySelector('#current_opacity').innerHTML = _rule.style.opacity;
  }

}

function load_cookies() {
  COOKIE_OBJ = parse_cookies();
  const opacity = get_cookie('opacity');
  if(opacity) set_future_opacity(opacity, false, true);

  const space = get_cookie('space');
  if(space) set_space(space, false, true);

  const sort = get_cookie('sort');
  if(sort) set_pulldown('sort', sort, false, true, false);

  const bottom = get_cookie('bottom');
  if(bottom) set_pulldown('bottom', bottom, false, true, false);

  const cat = get_cookie('cat');
  if(cat) set_pulldown('cat', cat, false, true, false);
  // load_cookieの後にはrenderが呼ばれるので、ここではrenderは不要
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

function refresh_category() {
  const filename = 'j' + document.querySelector('#category').value + '_points.json';
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
  category -= 1;
  const columns = [CATEGORY_TOP_TEAMS[category], Math.floor(CATEGORY_TEAMS_COUNT[category] / 2)];
  if(CATEGORY_BOTTOM_TEAMS[category])
    columns.push(CATEGORY_TEAMS_COUNT[category] - CATEGORY_BOTTOM_TEAMS[category]);
  return columns;
}

function make_html_column(target_team, team_data, max_point) {
  // 抽出したチームごとのDataFrameを使って、HTMLでチームの勝ち点積み上げ表を作る
  //  target_team: 対象チームの名称
  //  team_data:
  //    .df: make_team_dfで抽出したチームデータ (試合リスト)
  //    .point: 対象チームの最大勝ち点
  //  max_point: 全チーム中の最大勝ち点
  const box_list = [];
  const lose_box = [];
  team_data.df.sort().forEach(function(_row) {
    let future;
    if(! _row.has_result) {
      box_height = 3;
      future = true;
    } else {
      box_height = _row.point;
      future = false;
    }

    let match_date;
    if(_row.match_date instanceof String) {
      match_date = _row.match_date;
    } else {
      match_date = (_row.match_date) ? _row.match_date : '未定 ';
    }

    let box_html;
    // INNER_HTMLにHTML直書きはダサい？ コンポーネントごと追加していくスタイルにすべきか
    const draw_content = match_date + _row.opponent;
    const win_content = draw_content + '<br/>' + _row.goal_get + '-' + _row.goal_lose + '<br/>' + _row.stadium;
    const full_content = '(' + _row.section_no + ') ' + win_content;
    if(box_height == 3) {
      if(future) {
        box_html = '<div class="tall box"><div class="future bg ' + target_team + '"></div><p class="tooltip">'
          + win_content
          + '<span class="tooltiptext ' + target_team + '">(' + _row.section_no + ')</span></p></div>\n';
      } else {
        box_html = '<div class="tall box"><p class="tooltip ' + target_team + '">' + win_content
          + '<span class="tooltiptext ' + target_team + '">(' + _row.section_no + ')</span></p></div>\n';
      }
    } else if(box_height == 1) {
      box_html = '<div class="short box"><p class="tooltip ' + target_team + '">'
        + draw_content + '<span class="tooltiptext ' + target_team + '" style="width: 150px">'
        + full_content + '</span></p></div>';
      // _row.goal_get + '-' + _row.goal_lose + '<br/>';
    } else if(box_height == 0) {
      lose_box.push(full_content);
    }
    box_list.push(box_html);
  });
  let space_cols = max_point - team_data.avlbl_pt;
  // console.log(target_team, space_cols)
  if(space_cols) {
    box_list.push('<div class="space box" style="height:' + HEIGHT_UNIT * space_cols + 'px">(' + space_cols + ')</div>');
  }
  if(document.querySelector('#old_bottom').value == 'true') {
    box_list.reverse();
  }
  const team_name = '<div class="short box tooltip ' + target_team + '">' + target_team
    + '<span class=" tooltiptext ' + target_team + '" style="width: 150px">敗戦記録:<hr/>'
    + lose_box.join('<hr/>') + '</span></div>\n';
  return '<div>' + team_name + box_list.join('') + team_name + '</div>\n\n';
}

function make_point_column(max_point) {
  // 勝点列を作って返す
  let box_list = []
  Array.from(Array(max_point), (v, k) => k + 1).forEach(function(_i) {
    box_list.push('<div class="point box">' + _i + '</div>')
  });
  if(document.querySelector('#old_bottom').value == 'true') {
    box_list.reverse();
  }
  return '<div><div class="point box">勝点</div>' + box_list.join('') + '<div class="point box">勝点</div></div>\n\n'
}

function render_bar_graph() {
  if(! INPUTS) return;
  let boxContainer = document.querySelector('.boxContainer');
  boxContainer.innerHTML = '';
  let columns = {};
  Object.keys(INPUTS.matches).forEach(function (key) {
    columns[key] = make_html_column(key, INPUTS.matches[key], INPUTS.max_point);
  });
  let insert_point_columns = make_insert_columns(INPUTS.category);
  let point_column = make_point_column(INPUTS.max_point);
  boxContainer.innerHTML += point_column;
  get_sorted_team_list(INPUTS.matches).forEach(function(key, index) {
    if(insert_point_columns.includes(index))
      boxContainer.innerHTML += point_column;
    boxContainer.innerHTML += columns[key];
  });
  boxContainer.innerHTML += point_column;
}

function get_sorted_team_list(matches) {
  let sort_key = document.querySelector('#team_sort_key').value;
  return Object.keys(matches).sort(function(a, b) {return matches[b][sort_key] - matches[a][sort_key]});
}
/// //////////////////////////////////////////////////////////// 背景調整用
function set_future_opacity_ev(event) {
  set_future_opacity(event.target.value, true, false);
}
function set_future_opacity(value, cookie_write = true, slidebar_write = true) {
  // set_future_opacity はクラス設定の変更のみで、renderは呼ばないのでcall_renderは不要
  _rule = get_css_rule('.future')
  _rule.style.opacity = value;
  document.querySelector('#current_opacity').innerHTML = value;
  if(cookie_write) set_cookie('opacity', value);
  if(slidebar_write) document.querySelector('#future_opacity').value = value;
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
  if(color_write) document.querySelector('#space_color').value = value;
}

function set_sort_key_ev(event) {
  set_pulldown('sort', event.target.value, true, false);
}
function set_old_bottom_ev(event) {
  set_pulldown('bottom', event.target.value, true, false);
}
function set_category_ev(event) {
  refresh_category();
  set_pulldown('cat', event.target.value, true, false, false);
}
function set_pulldown(key, value, cookie_write = true, pulldown_write = true, call_render = true) {
  if(cookie_write) set_cookie(key, value);
  if(pulldown_write) {
    const select = document.querySelector(TARGET_ITEM_ID[key]);
    select.selectedIndex = select.querySelector('option[value="' + value + '"]').index;
  }
  if(call_render) render_bar_graph();
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
