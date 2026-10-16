// mux/dark-contrast-scan.js —— 报告暗色可读性扫描器（2026-10-14 随 run19 暗色根治同轮落地）
//
// 用法：把本文件内容作为 <script> 注入报告 HTML（末尾即可），Chrome headless 跑
//   --headless --virtual-time-budget=8000 --dump-dom file:///path/scan.html
// 然后读 <title>：N=<命中数> 后跟每条 `对比度 :: 选择器 :: fg/bg :: 文本`。
//
// 判据：WCAG AA —— 正文 4.5:1，≥24px（或 ≥18.66px 粗体）大字 3:1。
//
// 两个已知盲区，必须人工截图兜底：
//   1) linear-gradient / color-mix 背景读不到 —— 会向上找到更外层的纯色底，导致误报
//      （本轮即有 2 条恒定误报：nv-loop-idx 圆点、st-hd 里的 pb 进度条）；
//   2) SVG 内部文本不参与（getComputedStyle 取到的是 SVG 自身样式）。
// 因此「N=2 且这两条恒定」= 干净；N 明显为 0 反而要确认扫描器是否真的跑起来了。
setTimeout(function () {
  function parse(c) {
    var m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function hex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('');
  }
  function bgOf(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var cs = getComputedStyle(n);
      var p = parse(cs.backgroundColor);
      if (p && p.a > 0.55) return p;
      // 渐变底：取第一个 color-stop 近似（hero 就是深蓝渐变，扫描器读不到会把
      // 深底上的白字误报成「白底白字 1.05:1」——这类噪声会淹没真问题）。
      var img = cs.backgroundImage || '';
      if (img.indexOf('gradient') >= 0) {
        var stops = img.match(/rgba?\([^)]+\)/g);
        if (stops && stops.length) {
          var sp = parse(stops[0]);
          if (sp) return sp;
        }
      }
      n = n.parentElement;
    }
    return { r: 11, g: 18, b: 32, a: 1 };
  }
  function path(el) {
    var s = el.tagName.toLowerCase(), n = el.parentElement, d = 0;
    while (n && n !== document.body && d < 3) {
      if (n.className && typeof n.className === 'string') { s += '.' + n.className.trim().split(/\s+/).join('.'); d++; }
      n = n.parentElement;
    }
    return s;
  }
  function inl(el) {
    var m = (el.getAttribute('style') || '').match(/color\s*:\s*([^;]+)/);
    return m ? m[1].trim() : '';
  }
  var out = [], seen = {}, all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var direct = [].filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 1; })
      .map(function (n) { return n.textContent.trim(); }).join(' ');
    if (!direct) continue;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) continue;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    var fg = parse(cs.color);
    if (!fg || fg.a < 1) continue;
    var bg = bgOf(el);
    var l1 = lum(fg), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    var fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight) || 400;
    var need = (fs >= 24 || (fs >= 18.66 && fw >= 700)) ? 3 : 4.5;
    if (ratio >= need) continue;
    var key = path(el) + '|' + hex(fg);
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(ratio.toFixed(2) + ' :: ' + path(el) + ' :: fg=' + hex(fg) + ' bg=' + hex(bg) + ' inline=' + inl(el) + ' :: ' + direct.slice(0, 26));
  }
  document.title = 'N=' + out.length + ' ' + out.join(' || ');
}, 1500);
