/* LCNDA — 🗺 La fiche d'un point de carte : un clic sur un point ouvre une petite fiche, SANS quitter la carte.
 *
 *  Pour toute carte de heritage-mini-carte.js qui la demande (le moteur des listes de données app-listes-donnees.js : onglet 📊 Données,
 *  Listes, listes réunies ; la vue 🗺 d'un bloc Données d'une Fiche, heritage-fiches.js) :
 *   - un point : une petite fiche accrochée au point (titre, au plus 6 lignes, 👪 Dans la famille, ↗ la source, 📎 · 🧺 · ☰ Voir la ligne ·
 *     🔍 Zoomer ici · ✕) ; elle suit la carte quand on la déplace ;
 *   - une pastille « 42 », ou des points posés les uns sur les autres : la liste des lignes de cet endroit (10, puis « + N autres ») ;
 *     chacune s'ouvre en fiche ; « 🔍 Zoomer ici » fait ce que faisait la pastille (zoomer pour séparer) ;
 *   - 📌 Garder ouvert : la fiche devient un panneau à droite DANS le cadre de la carte ; on clique point après point, il suit.
 *     Retenu (localStorage « genealogie-carte-fiche » : « popup » au départ, ou « panel ») ;
 *   - clavier : Tab jusqu'aux points, Entrée ouvre, Échap ferme (le focus revient au point) ;
 *   - carte étroite (téléphone, 390 px) : la fiche est une feuille en bas, dans le cadre de la carte ; thème sombre ;
 *   - rien n'est demandé à Internet : tout ce que montre la fiche est déjà dans la page (les liens ↗ ne s'ouvrent que si on clique).
 *  API : LCNDA_EXT.carteFiche = {attach(hôte, cfg), close(hôte), mode()}
 *    cfg = {card(i) → {title, lines: [[libellé, html]], fam?: Promise<html>|html, src?: html, ins?, bk?, line?, roWhy?},
 *           label(i) → texte (la liste d'un endroit), sub?(i) → texte, onAct(kind 'ins'|'bk'|'line', i, bouton)}
 *    les points de la carte portent data-cf-i = l'index de leur ligne (les autres points ne s'ouvrent pas).
 *  Essai : tests/test-carte-fiche-point.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n).toLocaleString('fr-FR');
    const KEY = 'genealogie-carte-fiche', LIST_MAX = 10, NEAR_PX = 9, NARROW = 560;
    const mode = () => { try { return localStorage.getItem(KEY) === 'panel' ? 'panel' : 'popup'; } catch (_) { return 'popup'; } };
    const setMode = m => { try { localStorage.setItem(KEY, m); } catch (_) {} };
    const ctlOf = host => ext.miniMapOf?.(host) || null;
    const proj = (lat, lon) => ext.miniMapEngine?.project?.(lat, lon) || null;

    /** brancher une carte (hôte : l'élément qui contient la carte) */
    function attach(host, cfg) {
        const stage = host?.querySelector?.('[data-mm]') || host?.querySelector?.('.person-map-stage'); if (!stage || !cfg) return null;
        if (host.__cf) host.__cf.destroy();
        const S = host.__cf = {host, stage, cfg, box: null, anchor: null, from: null, list: null, i: -1, raf: 0, destroy};
        const pointOf = g => ctlOf(stage)?.points?.find(p => p.g === g) || null;
        const idxOf = g => { const v = g?.dataset?.cfI; return v == null || v === '' ? -1 : Number(v); };
        /** les autres points (avec une ligne) posés au même endroit, à l'écran */
        const overlapping = g => {
            const ctl = ctlOf(stage), p = pointOf(g); if (!ctl || !p) return [idxOf(g)];
            const out = ctl.points.filter(q => q.g && idxOf(q.g) >= 0 && q.g.style.display !== 'none' && Math.hypot(q.sx - p.sx, q.sy - p.sy) <= NEAR_PX).map(q => idxOf(q.g));
            return out.length ? out : [idxOf(g)];
        };
        const onClick = e => {
            if (e.target.closest('.cf-card')) return;
            const ctl = ctlOf(stage);
            if (ctl?.noClick && Date.now() - ctl.noClick < 400) return; // la fin d'un glissé
            const c = e.target.closest('.h-map-cluster');
            if (c && stage.contains(c)) {
                const list = (c.__pts || []).map(p => idxOf(p.g)).filter(i => i >= 0); if (!list.length) return;
                e.stopPropagation(); e.preventDefault();
                const ps = c.__pts.filter(p => idxOf(p.g) >= 0);
                return openList(list, {lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length}, c);
            }
            const g = e.target.closest('.h-map-point');
            if (g && stage.contains(g) && idxOf(g) >= 0) {
                e.stopPropagation(); e.preventDefault();
                const near = overlapping(g), p = pointOf(g), at = p ? {lat: p.lat, lon: p.lon} : null;
                return near.length > 1 ? openList(near, at, g) : openCard(idxOf(g), at, g);
            }
            if (S.box && !S.box.classList.contains('cf-panel') && e.target.closest('[data-mm]') === stage && !e.target.closest('.mm-ctl, .mm-credit')) close(false); // un clic sur le fond : la bulle se ferme (le panneau reste)
        };
        const onKey = e => {
            if (e.key === 'Escape' && S.box) { e.preventDefault(); e.stopPropagation(); close(true); return; }
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (e.target.closest('.cf-card')) return;
            const c = e.target.closest('.h-map-cluster'), g = e.target.closest('.h-map-point');
            if (c || (g && idxOf(g) >= 0)) { e.preventDefault(); e.stopPropagation(); onClick({target: e.target, stopPropagation() {}, preventDefault() {}}); }
        };
        host.addEventListener('click', onClick, true);
        host.addEventListener('keydown', onKey, true);

        function frame() {
            S.raf = 0;
            if (!S.box || !S.box.isConnected || !stage.isConnected) return;
            place(); S.raf = requestAnimationFrame(frame);
        }
        /** la bulle suit son point ; le panneau et la feuille du bas ont leur place fixe (CSS) */
        function place() {
            const box = S.box; if (!box) return;
            const ctl = ctlOf(stage), a = S.anchor, n = a && ctl?.view ? proj(a.lat, a.lon) : null;
            const narrow = stage.clientWidth < NARROW || !n, panel = mode() === 'panel'; // une carte figée (sans gestes) : la feuille du bas
            box.classList.toggle('cf-sheet', narrow); box.classList.toggle('cf-panel', panel && !narrow); stage.classList.toggle('cf-has-panel', panel && !narrow && !!box);
            if (narrow || panel) { if (box.style.left) { box.style.left = ''; box.style.top = ''; } return; }
            const [x, y] = ctl.screen(n[0], n[1]), W = stage.clientWidth, H = stage.clientHeight, w = box.offsetWidth, h = box.offsetHeight;
            let left = Math.max(8, Math.min(W - w - 8, x - w / 2)), top = y - h - 16;
            if (top < 8) top = y + 16;
            if (top + h > H - 8) { // ni au-dessus ni en dessous : à côté du point (à droite, sinon à gauche), sans le cacher
                top = Math.max(8, Math.min(H - h - 8, y - h / 2));
                left = x + 16 + w <= W - 8 ? x + 16 : x - 16 - w >= 8 ? x - 16 - w : left;
            }
            const L = left.toFixed(0) + 'px', Tp = top.toFixed(0) + 'px';
            if (box.style.left !== L) box.style.left = L; if (box.style.top !== Tp) box.style.top = Tp;
        }
        function ensureBox() {
            if (S.box?.isConnected) return S.box;
            const box = S.box = document.createElement('div');
            box.className = 'cf-card'; box.setAttribute('role', 'dialog'); box.tabIndex = -1;
            box.addEventListener('click', onCardClick);
            box.addEventListener('pointerdown', e => e.stopPropagation()); // pas de glissé de la carte depuis la fiche
            box.addEventListener('wheel', e => e.stopPropagation(), {passive: true});
            box.addEventListener('dblclick', e => e.stopPropagation());
            stage.appendChild(box);
            return box;
        }
        const head = (title, back) => `<div class="cf-head">${back ? `<button type="button" class="cf-ico" data-cf-back aria-label="${esc(T('Revenir à la liste de cet endroit'))}" title="${esc(T('Revenir à la liste de cet endroit'))}">←</button>` : ''}<b class="cf-title">${esc(title)}</b>
            <span class="cf-tools"><button type="button" class="cf-ico" data-cf-pin aria-pressed="${mode() === 'panel'}" title="${esc(mode() === 'panel' ? T('Revenir à la bulle sur le point') : T('Garder ouvert : un panneau à droite, qui suit les points cliqués'))}">📌<span class="cf-lab">${esc(mode() === 'panel' ? T('Détacher') : T('Garder ouvert'))}</span></button><button type="button" class="cf-ico" data-cf-x aria-label="${esc(T('Fermer (Échap)'))}" title="${esc(T('Fermer (Échap)'))}">✕</button></span></div>`;
        function show(html, label, at, from) {
            const box = ensureBox(), had = box.contains(document.activeElement);
            box.innerHTML = html; box.setAttribute('aria-label', label);
            if (at) S.anchor = at; if (from) S.from = from;
            place();
            if (!S.raf) S.raf = requestAnimationFrame(frame);
            (had ? box.querySelector('[data-cf-back], .cf-list button, [data-cf-x]') : box).focus({preventScroll: true});
            stage.dispatchEvent(new CustomEvent('carte-fiche', {bubbles: true, detail: {open: true, i: S.i}}));
        }
        function openCard(i, at, from, back = false) {
            let m = null; try { m = cfg.card(i); } catch (e) { console.error(e); } if (!m) return;
            S.i = i; if (!back) S.list = null;
            const ro = m.roWhy ? ` disabled title="${esc(m.roWhy)}"` : '';
            const acts = [m.ins ? `<button type="button" class="button small secondary" data-cf-act="ins"${ro || ` title="${esc(T('Insérer cette ligne (avec sa source)'))}"`}>📎 ${esc(T('Insérer'))}</button>` : '',
                m.bk ? `<button type="button" class="button small secondary" data-cf-act="bk"${ro || ` title="${esc(T('Mettre cette ligne au panier'))}"`}>🧺 ${esc(T('Au panier'))}</button>` : '',
                m.line ? `<button type="button" class="button small secondary" data-cf-act="line" title="${esc(T('Voir cette ligne dans le tableau'))}">☰ ${esc(T('Voir la ligne'))}</button>` : '',
                `<button type="button" class="button small ghost" data-cf-zoom>🔍 ${esc(T('Zoomer ici'))}</button>`].join('');
            const lines = (m.lines || []).filter(l => l && l[1] != null && l[1] !== '').slice(0, 6);
            const html = `${head(m.title || '—', !!S.list && back)}${m.sub ? `<p class="cf-sub muted">${esc(m.sub)}</p>` : ''}
                ${lines.length ? `<dl class="cf-lines">${lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
                ${m.fam ? `<p class="cf-fam" data-cf-fam>👪 <b>${esc(T('Dans la famille'))}</b> <span data-cf-fam-t>${typeof m.fam === 'string' ? m.fam : '…'}</span></p>` : ''}
                ${m.src ? `<p class="cf-src"><small>${esc(T('Source :'))} ${m.src}</small></p>` : ''}
                <div class="cf-acts">${acts}</div>`;
            if (m.at) at = m.at;
            show(html, m.title || '', at, from);
            if (m.fam && typeof m.fam.then === 'function') {
                const box = S.box, my = i;
                m.fam.then(h => { if (S.box !== box || S.i !== my) return; const el = box.querySelector('[data-cf-fam]'); if (!el) return; if (!h) el.remove(); else { el.querySelector('[data-cf-fam-t]').innerHTML = h; place(); } }, () => box.querySelector('[data-cf-fam]')?.remove());
            }
        }
        function openList(list, at, from) {
            S.i = -1; S.list = {list, at, from};
            const lab = i => { try { return cfg.label(i) || '—'; } catch (_) { return '—'; } }, sub = i => { try { return cfg.sub?.(i) || ''; } catch (_) { return ''; } };
            const title = T('{n} lignes à cet endroit', {n: nf(list.length)}), rest = list.length - LIST_MAX;
            const html = `${head(title)}<ul class="cf-list">${list.slice(0, LIST_MAX).map(i => { const s = sub(i); return `<li><button type="button" data-cf-pick="${i}"><span>${esc(lab(i))}</span>${s ? `<small class="muted">${esc(s)}</small>` : ''}</button></li>`; }).join('')}</ul>
                ${rest > 0 ? `<p class="cf-more muted">${esc(rest === 1 ? T('+ 1 autre') : T('+ {n} autres', {n: nf(rest)}))} — ${esc(T('zoome pour les séparer'))}</p>` : ''}
                <div class="cf-acts"><button type="button" class="button small ghost" data-cf-zoom>🔍 ${esc(T('Zoomer ici'))}</button></div>`;
            show(html, title, at, from);
        }
        function zoomHere() {
            const ctl = ctlOf(stage); if (!ctl?.view) return;
            if (S.list && S.i < 0 && S.list.from?.classList?.contains('h-map-cluster') && S.list.from.__pts) { const g = S.list.from; close(false); ctl.openCluster(g); return; }
            const a = S.anchor; if (!a) return;
            ctl.setView(a.lat, a.lon, Math.min(17, Math.max(ctl.view.z + 3, 11)));
        }
        function onCardClick(e) {
            const t = e.target; let b;
            e.stopPropagation();
            if (t.closest('[data-cf-x]')) return close(true);
            if (t.closest('[data-cf-pin]')) { setMode(mode() === 'panel' ? 'popup' : 'panel'); const i = S.i; if (i >= 0) openCard(i, S.anchor, S.from, !!S.list); else if (S.list) openList(S.list.list, S.list.at, S.list.from); S.box?.querySelector('[data-cf-pin]')?.focus(); return; }
            if (t.closest('[data-cf-back]')) { if (S.list) openList(S.list.list, S.list.at, S.list.from); return; }
            if ((b = t.closest('[data-cf-pick]'))) { const i = Number(b.dataset.cfPick), ctl = ctlOf(stage), p = ctl?.points?.find(q => q.g && idxOf(q.g) === i); return openCard(i, p ? {lat: p.lat, lon: p.lon} : S.anchor, p?.g || S.from, true); }
            if (t.closest('[data-cf-zoom]')) return zoomHere();
            if ((b = t.closest('[data-cf-act]'))) { try { cfg.onAct?.(b.dataset.cfAct, S.i, b); } catch (x) { console.error(x); } }
        }
        function close(focusBack) {
            const from = S.from;
            if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0;
            S.box?.remove(); S.box = null; S.i = -1; S.list = null; S.anchor = null; S.from = null;
            stage.classList.remove('cf-has-panel');
            if (focusBack && from?.isConnected && from.style.display !== 'none') { try { from.focus({preventScroll: true}); } catch (_) {} }
            else if (focusBack) stage.focus?.({preventScroll: true});
            stage.dispatchEvent(new CustomEvent('carte-fiche', {bubbles: true, detail: {open: false}}));
        }
        function destroy() { if (S.raf) cancelAnimationFrame(S.raf); host.removeEventListener('click', onClick, true); host.removeEventListener('keydown', onKey, true); S.box?.remove(); if (host.__cf === S) host.__cf = null; }
        S.open = (i, at) => { const ctl = ctlOf(stage), p = ctl?.points?.find(q => q.g && idxOf(q.g) === i); openCard(i, at || (p ? {lat: p.lat, lon: p.lon} : null), p?.g || null); };
        S.close = () => close(false);
        S.current = () => S.i;
        return S;
    }
    ext.carteFiche = {attach, close: host => host?.__cf?.close(), mode, of: host => host?.__cf || null};
})();
