var space_color;

window.addEventListener("load", init, false);

function init() {
  space_color = document.querySelector("#space");
  space_color.addEventListener("change", updateSpace, false);
}

function updateSpace(event) {
  document.querySelectorAll(".space").forEach(function(space) {
    space.style.backgroundColor = event.target.value;
    space.style.color = getBright(event.target.value, mod) > 0.5 ? 'black' : 'white'
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
    var keta = Math.floor(colorcode.length / 3);

    if (keta < 1) {
        return false;
    }

    // 16進数をparseして、RGBそれぞれに割り当て
    var rgb = [];
    for (var i = 0; i < 3; i++) {
        rgb.push(parseInt(colorcode.slice(keta * i, keta * (i + 1)), 16));
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

