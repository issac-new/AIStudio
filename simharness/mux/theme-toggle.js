/* theme-toggle.js —— 方案页与报告页共用的明暗主题切换（2026-10-14）
 *
 * 单一事实源：本文件在两个仓各存一份，字节级同文——
 *   overlay/scripts/plan-html/theme-toggle.js
 *   simharness/mux/theme-toggle.js
 * 改任一侧必须同步另一侧（与 tokens.css 同一规矩，见 tests/report-three-elements.test.ts）。
 *
 * 机制：
 *   1) 主题落在 <html data-theme="light|dark">，CSS 全部按该属性作用域取色，
 *      切换不触发重排、不重新渲染。
 *   2) 未手动选过之前跟随系统 prefers-color-scheme；手动点过之后以 localStorage 为准。
 *   3) 监听 storage 事件 → 同一浏览器打开的方案页与报告页互相跟随，一个页面切换另一个跟着变。
 *   4) 本脚本必须放在 <head> 末尾：先定主题再绘制，否则切换瞬间会闪一下另一套配色。
 */
(function () {
  'use strict';
  var KEY = 'ncwk-doc-theme';           // 两页共用同一个键，才能跨页同步
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function current() {
    return root.getAttribute('data-theme') || (systemDark() ? 'dark' : 'light');
  }
  function apply(mode) {
    root.setAttribute('data-theme', mode);
    try { localStorage.setItem(KEY, mode); } catch (e) { /* 隐私模式下写失败：本次会话内仍生效 */ }
    paint();
  }
  function paint() {
    var btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    var dark = current() === 'dark';
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-label', dark ? '切换到明色主题' : '切换到暗色主题');
    btn.title = dark ? '切换到明色主题' : '切换到暗色主题';
  }

  // ① 首屏定主题（必须在绘制前）
  var saved = stored();
  root.setAttribute('data-theme', (saved === 'light' || saved === 'dark') ? saved : (systemDark() ? 'dark' : 'light'));

  // ② 控件
  function mount() {
    if (document.getElementById('theme-toggle-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark');
    });
    document.body.appendChild(btn);
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ③ 跨标签/跨页同步（storage 事件只在别的文档写入时触发）
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || !e.newValue) return;
    if (e.newValue !== 'light' && e.newValue !== 'dark') return;
    root.setAttribute('data-theme', e.newValue);
    paint();
  });

  // ④ 系统主题跟随：用户没手动点过时，系统切深浅色页面也跟着走
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (!stored()) { root.setAttribute('data-theme', mq.matches ? 'dark' : 'light'); paint(); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
