/* Carte interactive d'un site fait avec LCNDA (🌐 Mon site web) : un petit afficheur de tuiles, sans bibliothèque.
 * Chaque <div class="lc-carte-vive" data-carte='{"tiles":"https://…/{z}/{x}/{y}.png","credit":"…","max":19,"view":{"lat":…,"lng":…,"z":…},"pts":[[lat,lng,"nom",n],…]}'>
 * garde son image figée tant que le script n'a pas tourné. On la déplace (glisser, doigt), on zoome (＋ − ou molette). */
(function () {
    'use strict';
    var T = 256;
    function lon2x(lng, z) { return (lng + 180) / 360 * T * Math.pow(2, z); }
    function lat2y(lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * T * Math.pow(2, z); }
    function x2lon(x, z) { return x / (T * Math.pow(2, z)) * 360 - 180; }
    function y2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / (T * Math.pow(2, z)); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
    function el(tag, cls, css) { var e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; }
    function start(box) {
        var c; try { c = JSON.parse(box.getAttribute('data-carte') || '{}'); } catch (e) { return; }
        if (!/^https:\/\/[^\s"'<>]+\{z\}[^\s"'<>]*\{x\}[^\s"'<>]*\{y\}/.test(c.tiles || '') || !c.view) return;
        var max = Math.min(19, Math.max(2, c.max | 0)), z = Math.max(2, Math.min(max, c.view.z | 0)), lat = +c.view.lat || 0, lng = +c.view.lng || 0;
        var layer = el('div', '', 'position:absolute;inset:0;overflow:hidden'), tiles = el('div', '', 'position:absolute;left:0;top:0'), marks = el('div', '', 'position:absolute;left:0;top:0');
        layer.appendChild(tiles); layer.appendChild(marks); box.appendChild(layer);
        var ui = el('div', '', 'position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:4px;z-index:2');
        [['＋', 1, 'Zoomer'], ['−', -1, 'Dézoomer']].forEach(function (b) { var k = el('button', '', 'width:32px;height:32px;border:1px solid #888;border-radius:6px;background:#fff;color:#222;font:700 18px/1 sans-serif;cursor:pointer'); k.type = 'button'; k.textContent = b[0]; k.title = b[2]; k.setAttribute('aria-label', b[2]); k.onclick = function () { zoom(b[1]); }; ui.appendChild(k); });
        var credit = el('div', '', 'position:absolute;right:0;bottom:0;background:rgba(255,255,255,.85);color:#333;font:11px/1.3 sans-serif;padding:2px 6px;z-index:2'); credit.textContent = c.credit || '';
        box.appendChild(ui); box.appendChild(credit);
        var img = box.querySelector('img'); if (img) img.style.visibility = 'hidden';
        function draw() {
            var W = box.clientWidth, H = box.clientHeight, cx = lon2x(lng, z), cy = lat2y(lat, z), x0 = cx - W / 2, y0 = cy - H / 2, n = Math.pow(2, z);
            tiles.textContent = '';
            for (var tx = Math.floor(x0 / T); tx <= Math.floor((x0 + W) / T); tx++) {
                for (var ty = Math.floor(y0 / T); ty <= Math.floor((y0 + H) / T); ty++) {
                    if (ty < 0 || ty >= n) continue;
                    var t = el('img', '', 'position:absolute;width:256px;height:256px;max-width:none;left:' + (tx * T - x0) + 'px;top:' + (ty * T - y0) + 'px');
                    t.alt = ''; t.draggable = false; t.referrerPolicy = 'strict-origin-when-cross-origin';
                    t.src = c.tiles.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
                    tiles.appendChild(t);
                }
            }
            marks.textContent = '';
            (c.pts || []).slice(0, 300).forEach(function (p) {
                var r = Math.min(14, 4 + 2 * (p[3] | 0)), m = el('span', '', 'position:absolute;border-radius:50%;background:#7a2a2a;opacity:.85;border:2px solid #fff;box-sizing:border-box;width:' + 2 * r + 'px;height:' + 2 * r + 'px;left:' + (lon2x(p[1], z) - x0 - r) + 'px;top:' + (lat2y(p[0], z) - y0 - r) + 'px');
                m.title = String(p[2] || ''); marks.appendChild(m);
            });
        }
        function zoom(d, px, py) {
            var nz = Math.max(2, Math.min(max, z + d)); if (nz === z) return;
            var W = box.clientWidth, H = box.clientHeight; px = px == null ? W / 2 : px; py = py == null ? H / 2 : py;
            var gx = lon2x(lng, z) - W / 2 + px, gy = lat2y(lat, z) - H / 2 + py, f = Math.pow(2, nz - z);
            var ncx = gx * f - px + W / 2, ncy = gy * f - py + H / 2; z = nz; lng = x2lon(ncx, z); lat = y2lat(ncy, z); draw();
        }
        var drag = null;
        box.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; drag = {x: e.clientX, y: e.clientY, cx: lon2x(lng, z), cy: lat2y(lat, z)}; box.setPointerCapture(e.pointerId); box.style.cursor = 'grabbing'; });
        box.addEventListener('pointermove', function (e) { if (!drag) return; lng = x2lon(drag.cx - (e.clientX - drag.x), z); lat = Math.max(-85, Math.min(85, y2lat(drag.cy - (e.clientY - drag.y), z))); draw(); });
        box.addEventListener('pointerup', function () { drag = null; box.style.cursor = 'grab'; });
        box.addEventListener('wheel', function (e) { e.preventDefault(); var r = box.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
        box.style.cursor = 'grab';
        draw();
        if (window.ResizeObserver) new ResizeObserver(draw).observe(box);
    }
    function all() { var l = document.querySelectorAll('.lc-carte-vive[data-carte]'); for (var i = 0; i < l.length; i++) start(l[i]); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
