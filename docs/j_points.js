// TODO: Global変数以外の解決方法は、後で調べる
let HEIGHT_UNIT;
let INPUTS;

const CATEGORY_TOP_TEAMS = [3, 2, 2];
const CATEGORY_BOTTOM_TEAMS = [4, 4, 0];
const CATEGORY_TEAMS_COUNT = [20, 22, 15];

window.addEventListener('load', init, false);

function init() {
  read_inputs('j1_points.json');
  document.querySelector('#space').addEventListener('change', updateSpace, false);
  HEIGHT_UNIT = parseInt(window.getComputedStyle(document.querySelector('.short')).getPropertyValue('height'));
  document.querySelector('#team_sort_key').addEventListener('change', render_bar_graph, false);
  document.querySelector('#old_bottom').addEventListener('change', render_bar_graph, false);
  document.querySelector('#category').addEventListener('change', refresh_category, false);
}

function refresh_category() {
  const filename = 'j' + document.querySelector('#category').value + '_points.json';
  console.log(filename);
  read_inputs(filename);
}

function read_inputs(filename) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', filename);
  xhr.send();
  xhr.onload = ()=> {
    INPUTS = JSON.parse(xhr.responseText);
    render_bar_graph();
  };
}

function make_insert_columns(category) {
  //各カテゴリの勝ち点列を入れる敷居位置を決定
  //  昇格チーム (ACL出場チーム)、中間、降格チームの位置に挟む
  category -= 1;
  var columns = [CATEGORY_TOP_TEAMS[category], Math.floor(CATEGORY_TEAMS_COUNT[category] / 2)];
  if(CATEGORY_BOTTOM_TEAMS[category])
    columns.push(CATEGORY_TEAMS_COUNT[category] - CATEGORY_BOTTOM_TEAMS[category]);
  return columns;
}

function make_html_column(target_team, team_data, max_point) {
  //抽出したチームごとのDataFrameを使って、HTMLでチームの勝ち点積み上げ表を作る
  //  target_team: 対象チームの名称
  //  team_data:
  //    .df: make_team_dfで抽出したチームデータ (試合リスト)
  //    .point: 対象チームの最大勝ち点
  //  max_point: 全チーム中の最大勝ち点
  var team_name = '<div class="short box ' + target_team + '">' + target_team + '</div>\n';
  var box_list = [];
  team_data.df.sort().forEach(function(_row) {
    var future;
    if(! _row['has_result']) {
      box_height = 3;
      future = true;
    } else {
      box_height = _row['point'];
      future = false;
    }
    if(box_height == 0)
      return;
    var match_date;
    if(_row['match_date'] instanceof String) {
      match_date = _row['match_date'];
    } else {
      match_date = (_row['match_date']) ? _row['match_date'] : '未定 ';
    }
    var content;
    var box_html;
    // INNER_HTMLにHTML直書きはダサい？ コンポーネントごと追加していくスタイルにすべきか
    if(box_height == 3) {
      content = match_date + _row['opponent'] + '<br/>';
      content += _row['goal_get'] + '-' + _row['goal_lose'] + '<br/>' + _row['stadium'] + '<br/>';
      if(future) {
        box_html = '<div class="tall box"><div class="future bg ' + target_team + '"></div><p>' + content + '</p></div>\n';
      } else {
        box_html = '<div class="tall box"><p class="' + target_team + '">' + content + '</p></div>\n';
      }
    } else {
      box_html = '<div class="short box"><p class="' + target_team + '">' + match_date + _row['opponent'] + '</p></div>\n';
      // _row['goal_get'] + '-' + _row['goal_lose'] + '<br/>';
    }
    box_list.push(box_html);
  });
  var space_cols = max_point - team_data.avlbl_pt;
  // console.log(target_team, space_cols)
  if(space_cols) {
    box_list.push('<div class="space box" style="height:' + HEIGHT_UNIT * space_cols + 'px">(' + space_cols + ')</div>');
  }
  if(document.querySelector('#old_bottom').value == 'true') {
    box_list.reverse();
  }
  return '<div>' + team_name + box_list.join('') + team_name + '</div>\n\n';
}

function make_point_column(max_point) {
  // 勝点列を作って返す
  var box_list = []
  Array.from(Array(max_point), (v, k) => k + 1).forEach(function(_i) {
    box_list.push('<div class="point box">' + _i + '</div>')
  });
  if(document.querySelector('#old_bottom').value == 'true') {
    box_list.reverse();
  }
  return '<div><div class="point box">勝点</div>' + box_list.join('') + '<div class="point box">勝点</div></div>\n\n'
}

function render_bar_graph() {
  var boxContainer = document.querySelector('.boxContainer');
  boxContainer.innerHTML = '';
  var columns = {};
  Object.keys(INPUTS['matches']).forEach(function (key) {
    columns[key] = make_html_column(key, INPUTS.matches[key], INPUTS.max_point);
  });
  var insert_point_columns = make_insert_columns(INPUTS.category);
  var point_column = make_point_column(INPUTS.max_point);
  boxContainer.innerHTML += point_column;
  get_sorted_team_list(INPUTS.matches).forEach(function(key, index) {
    if(insert_point_columns.includes(index))
      boxContainer.innerHTML += point_column;
    boxContainer.innerHTML += columns[key];
  });
  boxContainer.innerHTML += point_column;
}

function get_sorted_team_list(matches) {
  var sort_key = document.querySelector('#team_sort_key').value;
  return Object.keys(matches).sort(function(a, b) {return matches[b][sort_key] - matches[a][sort_key]});
}
/////////////////////////////////////////////////////////////// 背景調整用
function updateSpace(event) {
  document.querySelectorAll('.space').forEach(function(space) {
  space.style.backgroundColor = event.target.value;
  space.style.color = getBright(event.target.value, mod) > 0.5 ? 'black' : 'white';
  });
}
//https://qiita.com/fnobi/items/d3464ba0e4b6596863cb より
// 補正付きの明度取得
var getBright = function (colorcode, mod) {
  // 先頭の#は、あってもなくてもOK
  if (colorcode.match(/^#/)) {
    colorcode = colorcode.slice(1);
  }
  // 無駄に、ケタを動的に判断してるので、
  // 3の倍数ケタの16進数表現ならOK etc) #ff0000 #f00 #fff000000
  var rank = Math.floor(colorcode.length / 3);
  if (rank < 1) {
    return false;
  }
  // 16進数をparseして、RGBそれぞれに割り当て
  var rgb = [];
  for (var i = 0; i < 3; i++) {
    rgb.push(parseInt(colorcode.slice(rank * i, rank * (i + 1)), 16));
  }
  // 青は暗めに見えるなど、見え方はRGBそれぞれで違うので、
  // それぞれ補正値を付けて、人間の感覚に寄せられるようにした
  var rmod = mod.r || 1;
  var gmod = mod.g || 1;
  var bmod = mod.b || 1;
  // 明度 = RGBの最大値
  var bright = Math.max(rgb[0] * rmod, rgb[1] * gmod, rgb[2] * bmod) / 255;
  // 明度を返す
  return bright;
};

// 補正はとりあえず、こんなもんがよさげだった
var mod = { r: 0.9, g: 0.8, b: 0.4 };
