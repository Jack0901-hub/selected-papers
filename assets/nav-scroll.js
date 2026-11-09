/* 窄屏导航：可横向滑动，并让当前/点击的导航项尽量居中 */
(function () {
  "use strict";
  function centerWithin(nav, el) {
    if (!nav || !el) return;
    if (nav.scrollWidth <= nav.clientWidth + 1) return;
    var target = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    target = Math.max(0, Math.min(target, nav.scrollWidth - nav.clientWidth));
    try { nav.scrollTo({ left: target, behavior: "smooth" }); }
    catch (err) { nav.scrollLeft = target; }
  }
  function centerActive() {
    var nav = document.querySelector(".header-nav");
    if (!nav) return;
    var active = nav.querySelector('[aria-current="page"]');
    if (active) centerWithin(nav, active);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".header-nav a");
    if (!a) return;
    var nav = a.closest(".header-nav");
    centerWithin(nav, a);
  }, true);
  function schedule() {
    try { window.requestAnimationFrame(function () { setTimeout(centerActive, 60); }); }
    catch (err) { setTimeout(centerActive, 60); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
  window.addEventListener("load", schedule);
  setTimeout(centerActive, 400);
  setTimeout(centerActive, 1200);
  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(centerActive, 150);
  });
})();
