/* LCNDA — 📊 Les données, en plus : les outils (maquette validée docs/design/donnees-plus.html ; le cœur : app-donnees-plus.js).
 *
 *  ⚖️ Comparer (7) deux personnes (leurs lieux pendant leurs vies) ou deux lieux (toutes les années), thème par thème ; en bleu ce qu'ils
 *     ont en commun ; chaque case ouvre la liste filtrée.
 *  🗺 Tout autour d'un lieu (8) : une seule carte (la petite carte de l'app : même fond, même repli sans Internet), une couche par thème
 *     (pastilles qui l'allument ou l'éteignent, légende, nombres).
 *  🕳 Ce qui manque (9) : les lieux de l'arbre sans coordonnées, rangés par ce qu'ils débloquent ; « 📍 Placer » (un lieu connu, ou
 *     « lat, lon ») avec ce qui apparaîtrait, ↶ Annuler (lib/donnees_plus.php : dplus_missing, dplus_place).
 *  📖 Citer (14) : Simple · ISO 690 · Chicago — la vraie source de la liste, sa licence, la date du pack installé (date de consultation),
 *     le lien de la ligne et son numéro Wikidata (Q…) quand la ligne le connaît ; rien d'inventé.
 *  📜 Crédits et licences (15, toujours là) : fait à partir du sommaire des packs (assets/data/manifest.json, donnees_maj_status) et du
 *     registre des listes, rangé par thème ; les packs installés et leur version ; ⤓ Exporter les crédits (HTML).
 *  📄 Livret « Le monde de mes ancêtres » (16) : une personne ou une branche (elle et ses ascendants sur deux générations, jamais une personne
 *     vivante ou confidentielle) ; chapitres de départ : sa ville, guerres, terre et eaux, le temps, trains et routes (+ sources, toujours) ;
 *     un chapitre vide n'est jamais imprimé ; A4 / A5 ; 🖨 Imprimer / ⤓ PDF par la fenêtre d'impression de l'app (LCNDA_UI.printDocument).
 *  🎞 Sa vie, année par année (17) : 3,5 s par année (lent / normal / vite), sans musique ; Espace, ← →, Échap ; ⛶ plein écran ;
 *     « ✏️ Ouvrir dans 🎤 Présentation » : la même chose en présentation modifiable (heritage-keynote.js : keynoteFromText ; enregistrée
 *     par l'éditeur dans lib/slideshows.php, mode « keynote » ; export PDF, vidéo, .pptx depuis l'éditeur).
 *  🔗 Partager sur le site familial (18) : l'aperçu de ce qui part et de ce qui ne part pas ; membres du site au départ, « Tout le monde »
 *     demande une confirmation ; jamais les vivants (le serveur les retire encore, et à chaque lecture par famille.php) ; ni mes notes ni mes
 *     lignes sauf si cochées.
 *  💽 Place prise (19) et 🕰 Versions (21) : dans Réglages → 🗂 Données (app-listes-maj.js), à côté de ce qui existe : la place par
 *     thème, « faire de la place » (packs jamais ouverts dans Listes, jamais un favori, un récent ou une question gardée ; ↶ Annuler) ;
 *     les versions d'un pack livré (celle en place, celle gardée pour ↶, celle livrée ; « ↶ Revenir à cette version »).
 *  Essai : tests/test-donnees-plus.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const P = () => ext.donneesPlus || {};
    const M = () => ext.listesMaj || {};
    const TH = () => ext.listesThemes || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const lang = () => (window.LCNDA_I18N?.lang || document.documentElement.lang || 'fr');
    const loc = () => (lang() === 'fr' ? 'fr-FR' : lang());
    const nf = n => Number(n || 0).toLocaleString(loc());
    const toast = (m, k) => A().toast?.(m, k);
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body = {}) => { const r = await A().api(a, {}, {method: 'POST', body}); return r && typeof r === 'object' && r.result && typeof r.result === 'object' ? r.result : r; };
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const fmtSize = b => { b = Number(b) || 0; const d = lang() === 'fr' ? ',' : '.'; return b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', d)} ${T('Go')}` : b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', d)} ${T('Mo')}` : `${Math.max(1, Math.round(b / 1e3))} ${T('Ko')}`; };
    const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d\d)(?:-(\d\d))?/); if (!m) return String(iso || ''); try { return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), 12)).toLocaleDateString(loc(), {day: 'numeric', month: 'long', year: 'numeric'}); } catch (_) { return iso; } };
    const today = () => new Date().toLocaleDateString(loc(), {day: 'numeric', month: 'long', year: 'numeric'});
    const dialog = o => ext.openDialog?.(o);
    const kiosk = () => P().kiosk?.() || document.body.classList.contains('is-kiosk');
    const ro = () => P().ro?.() || kiosk();
    const themeOf = id => P().themeById?.(id) || null;
    const COLORS = ['#0066cc', '#c62828', '#0f9bb4', '#6929c4', '#d4a800', '#1a7f37', '#d9480f', '#555555', '#b0007a', '#00806b', '#8a5a00', '#3355aa'];
    async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (_) {} try { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch (_) { return false; } }
    /** chercher un lieu connu (base et référentiels) : [{name, lat, lon}] */
    async function findPlaces(q, n = 6) { try { const r = await api('picker_search', {kind: 'place', q, limit: n}); return (r.groups || []).flatMap(g => g.items || []).filter(x => x.lat != null && x.lon != null).map(x => ({name: String(x.title || x.name || q).replace(/\s*\(.*$/, ''), full: String(x.title || x.name || q), lat: Number(x.lat), lon: Number(x.lon), id: x.id})).slice(0, n); } catch (_) { return []; } }
    async function findPeople(q) { try { const r = await api('picker_search', {kind: 'person', q, limit: 8}); return (r.groups || []).flatMap(g => g.items || []).filter(x => x.id).slice(0, 8); } catch (_) { return []; } }
    /** un petit champ « chercher » avec ses résultats (personne ou lieu) */
    function picker(box, kind, onPick, value = '') {
        box.innerHTML = `<input type="search" class="dp-pin" value="${esc(value)}" placeholder="${esc(kind === 'person' ? T('Prénom NOM') : T('Un lieu'))}" aria-label="${esc(kind === 'person' ? T('Une personne de l’arbre') : T('Un lieu'))}" autocomplete="off"><ul class="dp-pres"></ul>`;
        const inp = box.querySelector('input'), ul = box.querySelector('ul'); let tq = 0, my = 0;
        const run = () => { clearTimeout(tq); tq = setTimeout(async () => { const q = inp.value.trim(), n = ++my; if (q.length < 2) { ul.innerHTML = ''; return; }
            const its = kind === 'person' ? await findPeople(q) : await findPlaces(q); if (n !== my) return;
            ul.innerHTML = its.length ? its.map((x, i) => `<li><button type="button" class="dp-pick" data-i="${i}">${kind === 'person' ? '👤' : '📍'} ${esc(kind === 'person' ? (x.title || x.name) : x.full)}</button></li>`).join('') : `<li class="muted">${esc(T('Rien trouvé'))}</li>`;
            ul.__its = its; }, 220); };
        inp.addEventListener('input', run);
        ul.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const x = ul.__its[Number(b.dataset.i)]; ul.innerHTML = ''; inp.value = kind === 'person' ? String(x.title || x.name).replace(/\s*\(.*$/, '') : x.name; onPick(x); });
        if (value) run();
        return inp;
    }
    const famPresence = () => ext.listesFamille || null;

    /* ═════════════ ⚖️ comparer (7) ═════════════ */
    function compare(kind0 = 'p') {
        let kind = kind0; const sel = [null, null];
        dialog({eyebrow: T('Récap des données'), title: `⚖️ ${T('Comparer, côte à côte, par thème')}`, wide: true, submitLabel: 'Fermer',
            body: `<div class="dp-row"><span class="segmented dp-seg" role="group" aria-label="${esc(T('Comparer'))}" data-dp-ck><button type="button" data-k="p" aria-pressed="true">${esc(T('Deux personnes'))}</button><button type="button" data-k="l" aria-pressed="false">${esc(T('Deux lieux'))}</button></span></div>
                <div class="dp-cmp-pick"><div data-dp-c="0"></div><div data-dp-c="1"></div></div><div class="dp-cmp-out" data-dp-cmp aria-live="polite"></div>
                <p class="muted small">${esc(T('Deux personnes : leurs lieux pendant leurs vies. Deux lieux : toutes les années. En bleu : ce qu’ils ont en commun. Chaque case ouvre la liste filtrée.'))}</p>`,
            onOpen: dl => {
                const pick = () => [0, 1].forEach(i => { sel[i] = null; picker(dl.querySelector(`[data-dp-c="${i}"]`), kind === 'p' ? 'person' : 'place', async x => {
                    try { sel[i] = kind === 'p' ? await P().personInfo(x.id) : {name: x.name, places: [x]}; } catch (e) { toast(e.message, 'error'); return; }
                    if (sel[0] && sel[1]) paint(dl); }); });
                pick();
                dl.querySelector('[data-dp-ck]').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; dl.querySelectorAll('[data-dp-ck] button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); dl.querySelector('[data-dp-cmp]').innerHTML = ''; pick(); });
                dl.addEventListener('click', e => { const c = e.target.closest('[data-dp-copen]'); if (!c) return; const [i, th] = c.dataset.dpCopen.split('|'); openTheme(sel[Number(i)], th); dl.close(); });
            }, onSubmit: () => true});
        async function paint(dl) {
            const out = dl.querySelector('[data-dp-cmp]'); out.innerHTML = UI().spinner ? UI().spinner(T('On compte…')) : '…';
            const res = await Promise.all(sel.map(s => P().collect({places: s.places, from: kind === 'p' ? s.b : null, to: kind === 'p' ? s.end : null})));
            const by = res.map(rows => { const m = {}; rows.forEach(x => { (m[x.theme] = m[x.theme] || []).push(x); }); return m; });
            const ths = [...new Set([...Object.keys(by[0]), ...Object.keys(by[1])])].sort((a, b) => ((by[1][b]?.length || 0) + (by[0][b]?.length || 0)) - ((by[1][a]?.length || 0) + (by[0][a]?.length || 0)));
            const cell = (i, th) => { const l = by[i][th] || []; if (!l.length) return `<div class="dp-c0">${esc(T('aucune'))}</div>`; const top = l.sort((a, b) => a.k - b.k)[0];
                return `<div class="${by[0][th]?.length && by[1][th]?.length ? 'is-both' : ''}"><button type="button" class="dp-lnk" data-dp-copen="${i}|${esc(th)}">${esc(l.length > 1 ? T('{n} lignes', {n: nf(l.length)}) : T('1 ligne'))}</button><small>${esc(`${top.title} ${top.y}`)}${kind === 'p' && sel[i].b ? ` · ${esc(T('{n} ans', {n: top.y - sel[i].b}))}` : ''}</small></div>`; };
            const h = i => `<div class="dp-h">${esc(sel[i].name)}<small>${esc(kind === 'p' ? `${sel[i].b || '?'}–${sel[i].d || '…'}${sel[i].places[0] ? ` · ${sel[i].places[0].name}` : ''}` : T('toutes les années'))}</small></div>`;
            out.innerHTML = ths.length ? `<div class="dp-cmp"><div class="dp-h dp-t">${esc(T('Thème'))}</div>${h(0)}${h(1)}${ths.map(th => { const t = themeOf(th); return `<div class="dp-t">${esc(t?.icon || '')} ${esc(T(t?.label || th))}</div>${cell(0, th)}${cell(1, th)}`; }).join('')}</div>`
                : `<p class="muted">${esc(T('Rien dans les listes installées autour de leurs lieux.'))}</p>`;
        }
    }
    async function openTheme(s, theme) {
        const c = (await P().candLists()).find(x => x.theme === theme); if (!c || !s) return;
        const p = s.places[0], preset = {near: p ? {lat: p.lat, lon: p.lon, km: P().kmOf(theme), title: p.name || s.name} : null, sort: p ? '_km' : ''};
        if (s.b) preset.period = {from: s.b, to: s.end, mode: 'overlap', label: `👤 ${s.name} · ${P().momentText('life').toLowerCase()}, ${s.b}–${s.end}`, pid: s.id, pb: s.b, pname: s.name};
        E().open?.(c.d.id, preset);
    }

    /* ═════════════ 🗺 tout autour d'un lieu (8) ═════════════ */
    function around(p0) {
        let place = p0 && Number.isFinite(Number(p0.lat)) ? p0 : null, km = Number(P().opt?.('radius')) || 30, rows = [], off = new Set();
        dialog({eyebrow: T('Une seule carte de tout'), title: `🗺 ${T('Tout autour d’un lieu')}`, wide: true, submitLabel: 'Fermer',
            body: `<div class="dp-row dp-around-top"><div class="dp-pbox" data-dp-ap></div><label class="dp-o dp-num"><span class="lbl">${esc(T('Rayon'))}</span><input type="number" min="1" max="500" step="1" data-dp-akm value="${km}" aria-label="${esc(T('Rayon en km'))}"><span>km</span></label></div>
                <div class="dp-lyr" data-dp-lyr role="group" aria-label="${esc(T('Couches'))}"></div><div class="dp-stage" data-dp-map></div><div class="dp-mlegend" data-dp-leg></div>`,
            onOpen: dl => {
                picker(dl.querySelector('[data-dp-ap]'), 'place', x => { place = x; load(dl); }, place?.name || '');
                dl.querySelector('[data-dp-akm]').addEventListener('change', e => { const n = Math.round(Number(e.target.value)); if (!(n >= 1 && n <= 500)) { e.target.value = km; return; } km = n; if (place) load(dl); });
                dl.querySelector('[data-dp-lyr]').addEventListener('click', e => { const b = e.target.closest('[data-ly]'); if (!b) return; const k = b.dataset.ly; if (off.has(k)) off.delete(k); else off.add(k); paint(dl); dl.querySelector(`[data-ly="${CSS.escape(k)}"]`)?.focus(); });
                if (place) load(dl); else dl.querySelector('[data-dp-map]').innerHTML = `<p class="muted">${esc(T('Choisis un lieu : toutes les listes installées autour de lui, sur une carte.'))}</p>`;
            }, onSubmit: () => true});
        async function load(dl) {
            dl.querySelector('[data-dp-map]').innerHTML = UI().spinner ? UI().spinner(T('On cherche…')) : '…';
            rows = await P().collect({places: [place], km: () => km}); paint(dl);
        }
        function paint(dl) {
            const ths = [...new Set(rows.map(r => r.theme))], col = th => COLORS[ths.indexOf(th) % COLORS.length], n = th => rows.filter(r => r.theme === th).length;
            dl.querySelector('[data-dp-lyr]').innerHTML = ths.map(th => { const t = themeOf(th), o = !off.has(th); return `<button type="button" class="ui-listbar-chip dp-chip${o ? '' : ' off'}" data-ly="${esc(th)}" aria-pressed="${o}"><i style="background:${col(th)}"></i>${esc(t?.icon || '')} ${esc(T(t?.label || th))} · ${nf(n(th))}</button>`; }).join('');
            const shown = rows.filter(r => !off.has(r.theme)).slice(0, 1500);
            const pts = shown.map(r => ({lat: r.g[0], lon: r.g[1], label: `${r.title} (${r.y})`, color: col(r.theme)}));
            pts.push({lat: place.lat, lon: place.lon, label: place.name, color: '#2b8a3e', n: '◆'});
            dl.querySelector('[data-dp-map]').innerHTML = rows.length ? (ext.miniMap ? ext.miniMap(pts, [], {height: 420, circles: [{lat: place.lat, lon: place.lon, km}]}) : '') : `<p class="muted">${esc(T('Rien dans les listes installées à moins de {n} km.', {n: km}))}</p>`;
            dl.querySelector('[data-dp-leg]').innerHTML = rows.length ? `<b>${esc(T('Autour de {p} · {n} km', {p: place.name, n: km}))}</b>${ths.filter(th => !off.has(th)).map(th => `<span><i style="background:${col(th)}"></i>${esc(T(themeOf(th)?.label || th))} · ${nf(n(th))}</span>`).join('')}<span><i class="dp-fam-ic"></i>${esc(T('le lieu choisi'))}</span>${shown.length < rows.filter(r => !off.has(r.theme)).length ? `<span>${esc(T('les {n} premiers points', {n: nf(shown.length)}))}</span>` : ''}` : '';
        }
    }

    /* ═════════════ 🕳 ce qui manque : placer un lieu (9) ═════════════ */
    function missing() {
        dialog({eyebrow: T('Ce qui manque'), title: `🕳 ${T('Lieux de l’arbre sans coordonnées')}`, wide: true, submitLabel: 'Fermer', body: `<div data-dp-miss>${UI().spinner ? UI().spinner(T('Chargement…')) : '…'}</div>`,
            onOpen: async dl => {
                const box = dl.querySelector('[data-dp-miss]'); let r;
                try { r = await api('dplus_missing'); } catch (e) { box.innerHTML = `<p class="dp-err">${esc(e.message)}</p>`; return; }
                const pl = r.places || [];
                box.innerHTML = pl.length ? `<p class="muted small">${esc(T('Rangés par ce qu’ils débloquent : le lieu qui a le plus d’actes d’abord. « 📍 Placer » : choisis un lieu connu, ou écris « latitude, longitude ».'))}</p><div class="data-table-wrap"><table class="data-table dp-stack"><thead><tr><th>${esc(T('Lieu de l’arbre sans coordonnées'))}</th><th>${esc(T('Dans l’arbre'))}</th><th></th></tr></thead><tbody>${pl.map(p => `<tr data-dp-pl="${p.id}"><td><b>${esc(p.name)}</b>${p.where ? `<small class="muted"> ${esc(p.where)}</small>` : ''}<div class="dp-placer" data-dp-placer hidden></div></td><td>${esc(T('{a} actes · {p} personnes', {a: nf(p.acts), p: nf(p.people)}))}</td><td>${ro() ? '' : `<button type="button" class="button small" data-dp-place-go>📍 ${esc(T('Placer'))}</button>`}</td></tr>`).join('')}</tbody></table></div>`
                    : `<p>✓ ${esc(T('Tous les lieux de l’arbre ont des coordonnées.'))}</p>`;
                box.addEventListener('click', e => {
                    const b = e.target.closest('[data-dp-place-go]'); if (!b) return;
                    const tr = b.closest('tr'), id = Number(tr.dataset.dpPl), p = pl.find(x => x.id === id), host = tr.querySelector('[data-dp-placer]');
                    if (!host.hidden) { host.hidden = true; return; }
                    host.hidden = false; host.innerHTML = `<div class="dp-pbox" data-dp-pp></div><label class="dp-fld"><span>${esc(T('ou « latitude, longitude »'))}</span><input data-dp-ll placeholder="45.2667, 1.7667" inputmode="decimal"></label><p class="small" data-dp-gain aria-live="polite"></p><div class="dp-row"><button type="button" class="button small" data-dp-place-ok disabled>✓ ${esc(T('Placer ici'))}</button></div>`;
                    let cand = null;
                    const show = async c => { cand = c; host.querySelector('[data-dp-place-ok]').disabled = !c; if (!c) return; const g = host.querySelector('[data-dp-gain]'); g.textContent = T('On compte…'); const rows = await P().collect({places: [c]}); g.textContent = rows.length ? T('{n} données de plus apparaîtraient autour de ce lieu.', {n: nf(rows.length)}) : T('Aucune donnée de plus dans les listes installées, mais le lieu sera placé.'); };
                    picker(host.querySelector('[data-dp-pp]'), 'place', x => show({lat: x.lat, lon: x.lon, name: x.name}), p.name);
                    host.querySelector('[data-dp-ll]').addEventListener('change', ev => { const m = ev.target.value.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/); if (!m) { toast(T('Écris « latitude, longitude », par exemple 45.2667, 1.7667.'), 'error'); return; } show({lat: Number(m[1].replace(',', '.')), lon: Number(m[2].replace(',', '.')), name: p.name}); });
                    host.querySelector('[data-dp-place-ok]').addEventListener('click', async () => {
                        if (!cand) return;
                        try {
                            const res = await post('dplus_place', {id, lat: cand.lat, lon: cand.lon});
                            ext.listesFamille?.reset?.();
                            tr.querySelector('td:last-child').innerHTML = `<span class="ui-badge is-green">✓ ${esc(T('placé'))}</span>`; host.hidden = true;
                            const back = async () => { await post('dplus_place', {id, lat: res.before.lat, lon: res.before.lon}); ext.listesFamille?.reset?.(); if (tr.isConnected) tr.querySelector('td:last-child').innerHTML = `<button type="button" class="button small" data-dp-place-go>📍 ${esc(T('Placer'))}</button>`; };
                            A().undoToast ? A().undoToast(T('{p} placé : ses données apparaissent dans les listes', {p: p.name}), {undo: back, redo: () => post('dplus_place', {id, lat: cand.lat, lon: cand.lon})}) : toast(T('{p} placé : ses données apparaissent dans les listes', {p: p.name}));
                        } catch (x) { toast(x.message, 'error'); }
                    });
                });
            }, onSubmit: () => true});
    }

    /* ═════════════ 📖 citer une ligne (14) ═════════════ */
    const splitSource = s => { const m = String(s || '').match(/^(.*?)\s*\(([^()]*)\)\s*$/); return m ? {name: m[1].trim(), lic: m[2].trim()} : {name: String(s || '').trim(), lic: ''}; };
    /** le pack d'une liste, seulement s'il est sûr : déclaré (d.pack, d.packs) ou du même nom — jamais deviné d'après les fichiers lus */
    async function packOf(d) { try { const st = await M().status(); const ids = [].concat(d.packs || d.pack || []), base = String(d.id || '').toLowerCase().replace(/_/g, '-'); return st.packs.find(p => ids.includes(p.id)) || st.packs.find(p => p.id === base || p.id === base.replace(/s$/, '')) || null; } catch (_) { return null; } }
    async function citeData(d, r) {
        const base = d._base || d, pk = await packOf(base), sp = splitSource(base.source);
        const title = ext.dataHome?.titleOf ? ext.dataHome.titleOf(d, r) : '', per = E().periodOf?.(d, r);
        const dateF = (d.fields || []).find(f => f.type === 'date' && r[f.key]);
        const when = dateF ? String(r[dateF.key]) : per ? String(per[0]) : '';
        const q = P().qidOf?.(r) || '', url0 = P().srcUrlOf?.(d, r) || '', url = /^https?:/.test(url0) ? url0 : '';
        return {title, when, source: sp.name || pk?.source || T(base.label), licence: sp.lic || pk?.licence || '', consulted: pk?.version ? fmtDate(pk.version) : today(), packDate: pk?.version ? fmtDate(pk.version) : '', list: T(base.label), qid: q, url: url || (q ? `https://www.wikidata.org/wiki/${q}` : '')};
    }
    function citeText(c, style) {
        const lic = c.licence ? (style === 'i' ? ` ${T('Licence {l}.', {l: c.licence})}` : ` (${c.licence})`) : '';
        const what = [c.title, c.when].filter(Boolean).join(', ');
        if (style === 'i') return `${c.source.toUpperCase()}. <i>${esc(what)}</i> [${esc(T('en ligne'))}].${esc(lic)} [${esc(T('Consulté le {d}', {d: c.consulted}))}].${c.qid ? ` ${esc(T('Identifiant Wikidata : {q}.', {q: c.qid}))}` : ''}${c.url ? ` ${esc(T('Disponible à l’adresse : {u}', {u: c.url}))}` : ''}`;
        if (style === 'c') return `« ${esc(what)} ». <i>${esc(c.source)}</i>${c.licence ? `, ${esc(c.licence)}` : ''}. ${esc(T('Consulté le {d}', {d: c.consulted}))}.${c.url ? ` ${esc(c.url)}.` : ''}`;
        return `${esc(what)}. ${esc(c.source)}${esc(lic)}, ${esc(T('consulté le {d}', {d: c.consulted}))}${c.packDate ? ` ; ${esc(T('liste « {l} », données du {d}', {l: c.list, d: c.packDate}))}` : ''}${c.qid ? ` ; ${esc(c.qid)}` : ''}.${c.url ? ` ${esc(c.url)}` : ''}`;
    }
    async function cite(d, r) {
        const c = await citeData(d, r); let style = P().opt?.('citeStyle') || 's';
        dialog({eyebrow: T('Citer une ligne'), title: `📖 ${c.title}`, submitLabel: 'Fermer',
            body: `<span class="segmented dp-seg" role="group" aria-label="${esc(T('Style'))}" data-dp-cs>${[['s', 'Simple'], ['i', 'ISO 690'], ['c', 'Chicago']].map(([k, l]) => `<button type="button" data-c="${k}" aria-pressed="${k === style}">${esc(T(l))}</button>`).join('')}</span>
                <div class="dp-cite" data-dp-cite aria-live="polite">${citeText(c, style)}</div><div class="dp-row"><button type="button" class="button small" data-dp-ccopy>📋 ${esc(T('Copier'))}</button></div>
                <p class="muted small">${esc(T('La source de la liste, sa licence, la date des données installées (date de consultation) et le lien de la ligne.'))}</p>`,
            onOpen: dl => {
                dl.querySelector('[data-dp-cs]').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; style = b.dataset.c; dl.querySelectorAll('[data-dp-cs] button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); dl.querySelector('[data-dp-cite]').innerHTML = citeText(c, style); });
                dl.querySelector('[data-dp-ccopy]').addEventListener('click', async () => { const ok = await copyText(dl.querySelector('[data-dp-cite]').textContent.trim()); toast(ok ? T('Citation copiée') : T('Copie impossible : sélectionne le texte.'), ok ? '' : 'error'); });
            }, onSubmit: () => true});
    }

    /* ═════════════ 📜 crédits et licences (15) ═════════════ */
    const BASEMAPS = [['Natural Earth', 'domaine public', 'https://www.naturalearthdata.com/'], ['IGN Admin Express', 'Licence Ouverte 2.0', 'https://geoservices.ign.fr/adminexpress'], ['OpenStreetMap', 'ODbL · © les contributeurs', 'https://www.openstreetmap.org/copyright']];
    async function creditsData() {
        let st = null; try { st = await M().status?.(); } catch (_) {}
        const packs = st?.packs || [], byTheme = new Map();
        const I = TH()?.index?.();
        for (const [tid, ds] of I?.by.entries() || []) {
            for (const d of ds) {
                if (!d.source && !d.sourceUrl) continue;
                let pk = null; try { const ids = [].concat(d.packs || d.pack || []); const base = String(d.id || '').toLowerCase().replace(/_/g, '-'); pk = packs.find(p => ids.includes(p.id)) || packs.find(p => p.id === base) || null; } catch (_) {}
                const sp = splitSource(d.source), key = fold(sp.name || d.sourceUrl);
                if (!byTheme.has(tid)) byTheme.set(tid, new Map());
                const m = byTheme.get(tid); if (!m.has(key)) m.set(key, {source: sp.name || d.sourceUrl, licence: pk?.licence || sp.lic, url: d.sourceUrl || pk?.url || '', date: pk?.version || '', lists: []});
                const x = m.get(key); x.lists.push(T(d.label)); if (!x.licence && (pk?.licence || sp.lic)) x.licence = pk?.licence || sp.lic; if (pk?.version && pk.version > x.date) x.date = pk.version;
            }
        }
        const fam = (M().families || []).map(f => ({source: f.source, licence: f.licence, url: f.url, theme: f.theme}));
        return {byTheme, fam, packs};
    }
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    async function credits() {
        dialog({eyebrow: T('Aide'), title: `📜 ${T('Crédits et licences')}`, wide: true, submitLabel: 'Fermer', body: `<div data-dp-cred>${UI().spinner ? UI().spinner(T('Chargement…')) : '…'}</div>`,
            onOpen: async dl => {
                const c = await creditsData(), box = dl.querySelector('[data-dp-cred]');
                const row = x => `<tr><td><b>${esc(x.source)}</b>${x.url && /^https?:/.test(x.url) ? ` <a class="srca" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(T('La source'))}">↗</a>` : ''}${x.lists ? `<small class="muted"> ${esc(x.lists.slice(0, 3).join(' · '))}${x.lists.length > 3 ? ` +${x.lists.length - 3}` : ''}</small>` : ''}</td><td>${esc(x.licence || T('voir la source'))}</td><td class="dp-hs">${esc(x.date ? fmtDate(x.date) : x.shipped ? T('livré avec l’app') : '')}</td></tr>`;
                const tl = (TH()?.themeList?.() || []).filter(t => c.byTheme.has(t.id));
                box.innerHTML = `<p class="muted small">${esc(T('Toutes les sources des listes, rangées par thème, avec leur licence et la date des données installées. Il ne s’éteint pas : les licences le demandent.'))}</p>
                    <div class="data-table-wrap"><table class="data-table dp-cred" data-dp-credt><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Licence'))}</th><th class="dp-hs">${esc(T('Données du'))}</th></tr></thead><tbody>
                    ${tl.map(t => `<tr class="dp-thm"><td colspan="3">${esc(t.icon)} ${esc(T(t.label))}</td></tr>${[...c.byTheme.get(t.id).values()].map(row).join('')}`).join('')}
                    ${c.fam.length ? `<tr class="dp-thm"><td colspan="3">⤓ ${esc(T('Packs à télécharger'))}</td></tr>${[...new Map(c.fam.map(x => [x.source, x])).values()].map(row).join('')}` : ''}
                    <tr class="dp-thm"><td colspan="3">🗺 ${esc(T('Fond des cartes'))}</td></tr>${BASEMAPS.map(([s, l, u]) => row({source: s, licence: T(l), url: u, shipped: true})).join('')}</tbody></table></div>
                    <details class="dp-packs"><summary>${esc(T('Les {n} packs livrés et installés, avec leur version', {n: nf(c.packs.length)}))}</summary><ul>${c.packs.map(p => `<li><b>${esc(p.id)}</b> · ${esc(fmtDate(p.version))}${p.state === 'updated' ? ` (${esc(T('mis à jour'))})` : ''}${p.licence ? ` · ${esc(p.licence)}` : ''}${p.source ? ` · <small class="muted">${esc(String(p.source).slice(0, 160))}</small>` : ''}</li>`).join('')}</ul></details>
                    <div class="dp-row"><button type="button" class="button small secondary" data-dp-credx>⤓ ${esc(T('Exporter les crédits'))}</button></div>`;
                box.querySelector('[data-dp-credx]').addEventListener('click', () => {
                    const html = `<!doctype html><html lang="${esc(lang())}"><head><meta charset="utf-8"><title>${esc(T('Crédits et licences'))}</title><style>body{font:14px/1.45 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px 8px;text-align:left;vertical-align:top}.dp-thm td{background:#f4f4f4;font-weight:700}a{color:#0066cc}</style></head><body><h1>📜 ${esc(T('Crédits et licences'))}</h1>${box.querySelector('[data-dp-credt]').outerHTML}<h2>${esc(T('Packs installés'))}</h2>${box.querySelector('.dp-packs ul').outerHTML}<p><small>${esc(T('Fait le {d}', {d: today()}))}</small></p></body></html>`;
                    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], {type: 'text/html'})); a.download = 'credits-licences.html'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
                });
            }, onSubmit: () => true});
    }

    /* ═════════════ 📄 livret « Le monde de mes ancêtres » (16) ═════════════ */
    const CHAPTERS = [['ville', '🏙', 'Sa ville, son pays', ['lieux', 'pouvoirs', 'monuments', 'village'], true], ['guerres', '⚔️', 'Les guerres de sa vie', ['guerres'], true], ['terre', '🌋', 'La terre et les eaux', ['seismes', 'eaux'], true],
        ['temps', '⛅', 'Le temps qu’il faisait', ['ciel'], true], ['routes', '🚂', 'Trains, routes, bateaux', ['routes'], true], ['fetes', '🏆', 'Fêtes et sport', ['fetes', 'sport'], false], ['prix', '💶', 'Les prix de son temps', ['prix'], false],
        ['metiers', '⚒️', 'Métiers et industries', ['metiers'], false], ['croire', '✝️', 'Croire, soigner, enfermer', ['croire'], false], ['evenements', '🌍', 'Grands événements', ['evenements'], false]];
    async function branchOf(p) { // elle et ses ascendants sur deux générations ; jamais une personne vivante ou confidentielle
        const out = [p], seen = new Set([p.id]);
        let gen = p.parents || [];
        for (let g = 0; g < 2 && gen.length; g++) {
            const next = [];
            for (const id of gen) { if (seen.has(id)) continue; seen.add(id); try { const q = await P().personInfo(id); if (q.living) continue; out.push(q); next.push(...q.parents); } catch (_) {} }
            gen = next;
        }
        return out;
    }
    async function booklet(pid) {
        let who = null, branch = false, fmt = P().opt?.('bookFormat') || 'A4';
        const on = new Set(CHAPTERS.filter(c => c[4]).map(c => c[0]));
        dialog({eyebrow: T('Livret'), title: `📄 ${T('Le monde de mes ancêtres')}`, wide: true, submitLabel: 'Fermer',
            body: `<div class="dp-book"><div class="dp-bopts">
                <span class="segmented dp-seg" role="group" aria-label="${esc(T('Pour'))}" data-dp-bk><button type="button" data-k="1" aria-pressed="true">${esc(T('Une personne'))}</button><button type="button" data-k="b" aria-pressed="false">${esc(T('Une branche'))}</button></span>
                <div class="dp-pbox" data-dp-bp></div><p class="small" data-dp-bwho></p>
                <div class="dp-subh">${esc(T('Chapitres'))}</div><div class="dp-chaps">${CHAPTERS.map(c => `<label class="dp-chk"><input type="checkbox" data-dp-ch="${c[0]}" ${on.has(c[0]) ? 'checked' : ''}> ${c[1]} ${esc(T(c[2]))}</label>`).join('')}<label class="dp-chk"><input type="checkbox" checked disabled> 📜 ${esc(T('Sources et licences (toujours)'))}</label></div>
                <span class="segmented dp-seg" role="group" aria-label="${esc(T('Format'))}" data-dp-bf>${['A4', 'A5'].map(f => `<button type="button" data-f="${f}" aria-pressed="${f === fmt}">${f}</button>`).join('')}</span>
                <div class="dp-row"><button type="button" class="button small" data-dp-bprint disabled>🖨 ${esc(T('Imprimer'))}</button><button type="button" class="button small secondary" data-dp-bpdf disabled>⤓ ${esc(T('PDF'))}</button></div>
                <p class="muted small">${esc(T('Pour une branche : les personnes vivantes ou confidentielles ne sont pas dans le livret, même nommées. Un chapitre vide n’est jamais imprimé.'))}</p></div></div>`,
            onOpen: async dl => {
                const ready = () => { dl.querySelectorAll('[data-dp-bprint], [data-dp-bpdf]').forEach(b => { b.disabled = !who; }); dl.querySelector('[data-dp-bwho]').textContent = who ? `👤 ${who.name} (${who.b || '?'}–${who.d || '…'})` : ''; };
                const set = async id => { try { who = await P().personInfo(id); if (who.living) { who = null; toast(T('Pas de livret pour une personne vivante.'), 'error'); } } catch (e) { who = null; toast(e.message, 'error'); } ready(); };
                picker(dl.querySelector('[data-dp-bp]'), 'person', x => set(x.id));
                if (pid) set(pid);
                dl.querySelector('[data-dp-bk]').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; branch = b.dataset.k === 'b'; dl.querySelectorAll('[data-dp-bk] button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
                dl.querySelector('[data-dp-bf]').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; fmt = b.dataset.f; dl.querySelectorAll('[data-dp-bf] button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
                dl.addEventListener('change', e => { const c = e.target.closest('[data-dp-ch]'); if (c) { if (c.checked) on.add(c.dataset.dpCh); else on.delete(c.dataset.dpCh); } });
                const go = async () => { if (!who) return; const doc = await bookHtml(branch ? await branchOf(who) : [who], [...on], fmt); if (!doc) return toast(T('Rien à imprimer : aucune donnée autour de ses lieux.'), 'error'); UI().printDocument ? UI().printDocument(doc) : toast(T('L’impression n’est pas chargée.'), 'error'); };
                dl.querySelector('[data-dp-bprint]').addEventListener('click', go); dl.querySelector('[data-dp-bpdf]').addEventListener('click', go);
            }, onSubmit: () => true});
    }
    async function bookHtml(people, chaps, fmt) {
        const parts = [], srcs = new Map();
        for (const p of people) {
            if (!p.places.length || !p.b) continue;
            const rows = (await P().collect({places: p.places, from: p.b, to: p.end})).filter(r => r.y >= p.b && r.y2 - r.y <= 5); // des événements de sa vie, pas ce qui dure des siècles
            const chs = CHAPTERS.filter(c => chaps.includes(c[0])).map(c => ({c, rows: rows.filter(r => c[3].includes(r.theme)).sort((a, b) => a.y - b.y || a.k - b.k).slice(0, 30)})).filter(x => x.rows.length);
            if (!chs.length) continue;
            chs.forEach(x => x.rows.forEach(r => { const b = r.d._base || r.d, sp = splitSource(b.source); srcs.set(sp.name || T(b.label), {s: sp.name || T(b.label), l: sp.lic, u: b.sourceUrl || ''}); }));
            parts.push(`<section class="bk-person"><h5>${esc(T('Le monde de mes ancêtres'))}</h5><h1>${esc(p.name)}</h1><p class="bk-sub">${esc([p.places[0]?.name, `${p.b} – ${p.d || '…'}`].filter(Boolean).join(', '))}</p>
                <h3>${esc(T('Sommaire'))}</h3><ol class="bk-toc">${chs.map(x => `<li>${esc(T(x.c[2]))}</li>`).join('')}<li>${esc(T('Sources et licences'))}</li></ol></section>
                ${chs.map((x, i) => `<section class="bk-ch"><h5>${i + 1} · ${esc(T(x.c[2]))}</h5><h2>${x.c[1]} ${esc(T(x.c[2]))}</h2>${x.rows.map(r => `<div class="bk-ev"><b>${esc(`${r.y} · ${r.title}`)}</b>${esc(r.y >= p.b ? T('{p} a {n} ans.', {p: p.name, n: r.y - p.b}) : '')} <small>${esc(T('à {n} km de ses lieux', {n: String(r.k).replace('.', ',')}))} — ${esc(splitSource((r.d._base || r.d).source).name || T((r.d._base || r.d).label))}</small></div>`).join('')}</section>`).join('')}`);
        }
        if (!parts.length) return '';
        const src = `<section class="bk-ch"><h2>📜 ${esc(T('Sources et licences'))}</h2><ul>${[...srcs.values()].map(s => `<li>${esc(s.s)}${s.l ? ` — ${esc(s.l)}` : ''}${s.u ? ` · ${esc(s.u)}` : ''}</li>`).join('')}</ul><p><small>${esc(T('Calculé par LCNDA le {d}, avec les lieux et les dates de la généalogie et les listes de données installées.', {d: today()}))}</small></p></section>`;
        return `<!doctype html><html lang="${esc(lang())}"><head><meta charset="utf-8"><title>${esc(T('Le monde de mes ancêtres'))} — ${esc(people[0].name)}</title><style>@page{size:${fmt === 'A5' ? 'A5' : 'A4'} portrait;margin:16mm}body{font:12px/1.5 Georgia,"Times New Roman",serif;color:#1b1b1b}h1{font-size:26px;margin:8px 0 4px}h2{font-size:18px;margin:0 0 10px}h5{font:700 9px system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#0066cc;margin:0}.bk-person,.bk-ch{break-after:page;page-break-after:always}.bk-sub{font-style:italic}.bk-ev{border-left:3px solid #0066cc;padding:2px 0 2px 9px;margin:8px 0}.bk-ev b{display:block;font-family:system-ui,sans-serif;font-size:11.5px}.bk-ev small{color:#666}.bk-toc li{border-bottom:1px dotted #bbb;padding:2px 0}</style></head><body>${parts.join('')}${src}</body></html>`;
    }

    /* ═════════════ 🎞 sa vie, année par année (17) ═════════════ */
    async function slideshow(pid) {
        let p; try { p = await P().personInfo(pid); } catch (e) { return toast(e.message, 'error'); }
        if (p.living) return toast(T('Pas de diaporama pour une personne vivante.'), 'error'); // comme le livret : il part dans 🎤 Présentation, puis en PDF, vidéo, .pptx
        if (!p.b) return toast(T('{p} n’a pas d’année de naissance : impossible de situer sa vie.', {p: p.name}), 'error');
        const rows = p.places.length ? (await P().collect({places: p.places, from: p.b, to: p.end})).filter(r => r.y >= p.b && r.y2 - r.y <= 5).sort((a, b) => a.k - b.k) : [];
        const by = new Map(); rows.forEach(r => { const y = r.y; if (!by.has(y)) by.set(y, []); if (by.get(y).length < 3) by.get(y).push({t: r.title, s: `${themeOf(r.theme)?.icon || ''} ${T(themeOf(r.theme)?.label || '')} · ${T('à {n} km', {n: String(r.k).replace('.', ',')})}`}); });
        const birthPl = p.evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.gedcom_tag))?.place_name, deathPl = p.evs.find(e => ['DEAT', 'BURI'].includes(e.gedcom_tag))?.place_name;
        if (!by.has(p.b)) by.set(p.b, []); by.get(p.b).unshift({t: T('Naissance'), s: birthPl || ''});
        if (p.d) { if (!by.has(p.d)) by.set(p.d, []); by.get(p.d).push({t: T('Décès'), s: deathPl || ''}); }
        const S = [...by.entries()].sort((a, b) => a[0] - b[0]); let i = 0, timer = null, speed = Number(P().opt?.('speed')) || 3500;
        const name = T('La vie de {p}, année par année', {p: p.name});
        dialog({eyebrow: T('Diaporama'), title: `🎞 ${name}`, wide: true, submitLabel: 'Fermer',
            body: `<div class="dp-slide" data-dp-slide aria-live="polite" tabindex="0"></div>
                <div class="dp-ctl"><button type="button" class="button small" data-dp-sp>▶ ${esc(T('Lecture'))}</button><button type="button" class="button small secondary" data-dp-sv="-1" aria-label="${esc(T('Année précédente'))}">‹</button><button type="button" class="button small secondary" data-dp-sv="1" aria-label="${esc(T('Année suivante'))}">›</button>
                <span class="segmented dp-seg" role="group" aria-label="${esc(T('Vitesse'))}" data-dp-ss>${[['6000', 'Lent'], ['3500', 'Normal'], ['1800', 'Vite']].map(([v, l]) => `<button type="button" data-s="${v}" aria-pressed="${Number(v) === speed}">${esc(T(l))}</button>`).join('')}</span>
                <span class="muted small">🔇 ${esc(T('Sans musique'))}</span><button type="button" class="button small secondary" data-dp-sf>⛶ ${esc(T('Plein écran'))}</button>${ro() ? '' : `<button type="button" class="button small secondary" data-dp-skn>✏️ ${esc(T('Ouvrir dans 🎤 Présentation'))}</button>`}</div>
                <p class="muted small">${esc(T('Les années sans rien sont sautées. Espace : pause · ← → : une année · Échap : sortir.'))}</p>`,
            onOpen: dl => {
                const box = dl.querySelector('[data-dp-slide]');
                const paint = () => { const [y, ev] = S[i]; box.innerHTML = `<div class="dp-fade"><div class="dp-yr">${y}</div><div class="dp-who">${esc(p.name)} · ${esc(y === p.b ? T('naissance') : T('{n} ans', {n: y - p.b}))}</div><div class="dp-evs">${ev.map(e => `<div>${esc(e.t)}<small>${esc(e.s)}</small></div>`).join('')}</div></div><div class="dp-bar" aria-hidden="true"><i style="width:${((i + 1) / S.length * 100).toFixed(1)}%"></i></div>`; };
                const stop = () => { clearInterval(timer); timer = null; dl.querySelector('[data-dp-sp]').textContent = `▶ ${T('Lecture')}`; };
                const play = () => { if (timer) return stop(); if (i >= S.length - 1) i = 0; paint(); timer = setInterval(() => { i = Math.min(S.length - 1, i + 1); paint(); if (i >= S.length - 1) stop(); }, speed); dl.querySelector('[data-dp-sp]').textContent = `⏸ ${T('Pause')}`; };
                const step = d => { i = (i + d + S.length) % S.length; paint(); };
                paint();
                dl.addEventListener('click', e => {
                    if (e.target.closest('[data-dp-sp]')) return play();
                    const v = e.target.closest('[data-dp-sv]'); if (v) return step(Number(v.dataset.dpSv));
                    const s = e.target.closest('[data-s]'); if (s) { speed = Number(s.dataset.s); dl.querySelectorAll('[data-dp-ss] button').forEach(x => x.setAttribute('aria-pressed', String(x === s))); if (timer) { stop(); play(); } return; }
                    if (e.target.closest('[data-dp-sf]')) { try { (box.requestFullscreen || box.webkitRequestFullscreen)?.call(box); } catch (_) {} return; }
                    if (e.target.closest('[data-dp-skn]')) { stop(); toKeynote(); }
                });
                dl.addEventListener('keydown', e => { if (e.target.closest('input, textarea, select')) return; if (e.key === ' ') { e.preventDefault(); play(); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } });
                dl.addEventListener('close', stop);
                box.focus();
            }, onSubmit: () => true});
        function toKeynote() {
            if (!ext.keynoteFromText) return toast(T('L’outil 🎤 Présentation n’est pas chargé.'), 'error');
            const html = `<h1>${esc(name)}</h1><p>${esc(`${p.b} – ${p.d || '…'}`)}</p>${S.map(([y, ev]) => `<h2>${y} · ${esc(y === p.b ? T('naissance') : T('{n} ans', {n: y - p.b}))}</h2><ul>${ev.map(e => `<li>${esc(e.t)}${e.s ? ` — ${esc(e.s)}` : ''}</li>`).join('')}</ul>`).join('')}`;
            document.querySelectorAll('dialog[open]').forEach(d => { if (d.querySelector('[data-dp-slide]')) d.close(); });
            ext.keynoteFromText(html, name);
        }
    }

    /* ═════════════ 🔗 partager une liste filtrée (18) ═════════════ */
    async function share(pg) {
        if (ro()) return toast(T('Mode consultation : rien ne peut être écrit.'));
        const d = pg.base || pg.d; let rows = [];
        try { rows = (await pg.allRows()).slice(0, 500); } catch (e) { return toast(e.message, 'error'); }
        const t2 = pg.table2d(rows), cols0 = t2[0] || [], body0 = t2.slice(1);
        const notes = P().notes?.(d.id) || {}, mine = P().mine?.(d.id) || [];
        let aud = P().opt?.('shareAud') || 'membres', withNotes = !!P().opt?.('shareNotes'), withMine = false, preview = null;
        const sources = [(() => { const sp = splitSource(d.source); return {source: sp.name || T(d.label), licence: sp.lic, url: d.sourceUrl || ''}; })()];
        const filters = pg.critSummary ? (() => { try { return String(pg.critSummary() || ''); } catch (_) { return ''; } })() : P().critLabel?.(d, pg.state()) || '';
        const build = () => { const cols = [...cols0, ...(withNotes ? [T('Note')] : [])]; const rs = body0.map((r, i) => [...r.map(v => String(v ?? '')), ...(withNotes ? [notes[P().rkey(pg.d, rows[i])]?.note || ''] : [])]);
            if (withMine) mine.forEach(m => rs.push([m.what, m.when, m.where, ...cols.slice(3).map(() => '')].slice(0, cols.length))); return {cols, rows: rs}; };
        let acc = 0; try { acc = (await api('dplus_shares')).accounts || 0; } catch (_) {}
        dialog({eyebrow: T('Envoyer vers…'), title: `🔗 ${T('Partager sur le site familial')}`, wide: true, submitLabel: T('🔗 Publier sur le site familial'),
            body: `<div class="dp-goes"><div class="dp-ok-box"><b>${esc(T('Ce qui part'))}</b><ul><li data-dp-sn></li><li>${esc(T('Colonnes : {c}', {c: cols0.join(', ')}))}</li><li>${esc(T('Sources et licences, en bas'))}</li></ul></div>
                <div class="dp-no-box"><b>${esc(T('Ce qui ne part pas'))}</b><ul><li data-dp-sd></li><li>${esc(T('Tes notes 📝 · tes lignes ✋ · tes ⚠️ (cases ci-dessous)'))}</li></ul></div></div>
                <div class="dp-row"><label class="dp-chk"><input type="checkbox" data-dp-sh="notes" ${withNotes ? 'checked' : ''}> ${esc(T('joindre mes notes'))}</label><label class="dp-chk"><input type="checkbox" data-dp-sh="mine"> ${esc(T('joindre mes lignes ajoutées'))}</label>
                <span class="segmented dp-seg" role="group" aria-label="${esc(T('Qui voit'))}" data-dp-aud>${[['membres', 'Membres du site'], ['tous', 'Tout le monde']].map(([v, l]) => `<button type="button" data-a="${v}" aria-pressed="${aud === v}">${esc(T(l))}</button>`).join('')}</span></div>
                ${acc ? '' : `<p class="dp-warn small">${esc(T('Aucun compte du site familial pour l’instant : la liste attendra qu’un proche ait un compte (Réglages → 👪 Site familial).'))}</p>`}
                <div class="dp-visitor"><div class="dp-vh"><span>👁 ${esc(T('Aperçu : ce que voit un membre'))}</span><span>${esc(T('site familial · lecture seule'))}</span></div><div class="data-table-wrap" data-dp-prev></div></div>
                <p class="muted small">${esc(T('Retirer plus tard : ici, « Mes partages », ou en publiant à nouveau.'))}</p><div data-dp-mysh></div>`,
            onOpen: dl => {
                const paint = async () => {
                    const b = build();
                    try { preview = await post('dplus_share', {name: T(d.label), audience: aud, cols: b.cols, rows: b.rows, sources, filters, dry: 1}); } catch (e) { preview = {rows: b.rows.length, dropped: 0}; }
                    dl.querySelector('[data-dp-sn]').textContent = T('« {l} » : {n} lignes', {l: T(d.label), n: nf(preview.rows)}) + (filters ? ` (${filters})` : '');
                    dl.querySelector('[data-dp-sd]').textContent = preview.dropped ? T('{n} lignes qui parlent d’une personne vivante ou confidentielle : retirées', {n: nf(preview.dropped)}) : T('Rien sur les personnes vivantes (jamais).');
                    dl.querySelector('[data-dp-prev]').innerHTML = `<table class="data-table"><thead><tr>${b.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.slice(0, 8).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
                };
                const mysh = async () => { let r; try { r = await api('dplus_shares'); } catch (_) { return; } const box = dl.querySelector('[data-dp-mysh]'); box.innerHTML = r.shares.length ? `<div class="dp-subh">${esc(T('Mes partages'))}</div><ul class="dp-shl">${r.shares.map(s => `<li><span>${esc(s.name)} <small class="muted">${esc(T('{n} lignes', {n: nf(s.rows)}))} · ${esc(s.audience === 'tous' ? T('tout le monde') : T('les membres'))}</small></span><button type="button" class="dp-x" data-dp-unshare="${s.id}" aria-label="${esc(T('Retirer ce partage'))}" title="${esc(T('Retirer ce partage'))}">×</button></li>`).join('')}</ul>` : ''; };
                paint(); mysh();
                dl.addEventListener('change', e => { const c = e.target.closest('[data-dp-sh]'); if (!c) return; if (c.dataset.dpSh === 'notes') withNotes = c.checked; else withMine = c.checked; paint(); });
                dl.querySelector('[data-dp-aud]').addEventListener('click', async e => { const b = e.target.closest('[data-a]'); if (!b) return;
                    if (b.dataset.a === 'tous' && aud !== 'tous') { const ok = A().confirmBox ? await A().confirmBox(T('Toute personne qui ouvre la page de la famille verra cette liste (jamais les personnes vivantes).'), {title: T('Partager avec tout le monde ?'), okLabel: T('Tout le monde'), danger: false}) : true; if (!ok) return; }
                    aud = b.dataset.a; dl.querySelectorAll('[data-dp-aud] button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
                dl.addEventListener('click', async e => { const x = e.target.closest('[data-dp-unshare]'); if (!x) return;
                    try { const r = await post('dplus_share_remove', {id: Number(x.dataset.dpUnshare)}); mysh(); A().undoToast?.(T('Partage retiré du site familial'), {undo: async () => { await post('dplus_share_restore', {share: r.share}); mysh(); }}); } catch (er) { toast(er.message, 'error'); } });
            },
            onSubmit: async () => {
                const b = build(), r = await post('dplus_share', {name: T(d.label), audience: aud, cols: b.cols, rows: b.rows, sources, filters});
                const msg = T('🔗 « {l} » publié sur le site familial ({n} lignes)', {l: T(d.label), n: nf(r.rows)});
                A().undoToast ? A().undoToast(msg, {undo: () => post('dplus_share_remove', {id: r.id})}) : toast(msg);
            }});
    }

    /* ═════════════ 💽 place prise (19) ═════════════ */
    async function famStatus() {
        const out = [];
        for (const f of M().families || []) {
            let s = null; try { s = await api(f.status); } catch (_) { continue; }
            const items = f.itemsOf ? f.itemsOf(s, null) : f.items;
            for (const it of items || []) { if (!f.installed(s, it.k)) continue; out.push({f, k: it.k, name: it.name, theme: f.theme, icon: f.icon, size: Number(f.size(s, it.k)) || 0, removable: !f.removable || f.removable(s, it.k), built: f.built(s, it.k)}); }
        }
        return out;
    }
    const used = () => readJ('genealogie-donnees-ouvertes', {}) || {};
    function neverUsed(it) {
        const u = used(), pre = `${it.f.id}_`, keep = new Set([...(P().favs?.() || []).map(x => x.id), ...(P().recents?.() || []).map(x => x.id), ...(P().savedQs?.() || []).map(x => x.list).filter(Boolean)]);
        return !Object.keys(u).some(id => id !== '__since' && (id === it.f.id || id.startsWith(pre))) && ![...keep].some(id => id === it.f.id || String(id).startsWith(pre));
    }
    async function diskData() {
        const st = await M().status?.().catch(() => null), fam = await famStatus();
        const shipped = (st?.packs || []).filter(p => p.state === 'shipped').reduce((n, p) => n + (Number(p.size) || 0), 0);
        const total = (st?.data_dir_size || 0) + shipped;
        const byTh = new Map(); fam.forEach(x => byTh.set(x.theme, (byTh.get(x.theme) || 0) + x.size));
        const shipBy = new Map(); (st?.packs || []).forEach(p => { const d = (E().list?.() || []).find(x => [].concat(x.packs || x.pack || []).includes(p.id) || String(x.id || '').toLowerCase().replace(/_/g, '-') === p.id); const t = d ? P().themeById?.(TH()?.themeOf?.(d)) : null; const k = t ? `${t.icon} ${T(t.label)}` : T('Livrées avec l’app'); shipBy.set(k, (shipBy.get(k) || 0) + (Number(p.size) || 0)); });
        shipBy.forEach((v, k) => byTh.set(k, (byTh.get(k) || 0) + v));
        const since = Number(used().__since) || 0, early = !since || Date.now() - since < 14 * 864e5; // les listes ouvertes ne sont notées que depuis ce module : pas de « jamais ouvert » avant deux semaines
        const sugg = early ? [] : fam.filter(x => x.removable && neverUsed(x)).sort((a, b) => b.size - a.size);
        return {total, free: st?.free ?? null, bars: [...byTh.entries()].sort((a, b) => b[1] - a[1]), sugg, early};
    }
    async function diskSummary() {
        const x = await diskData(); if (!x.total) return null;
        const ns = x.sugg.reduce((n, s) => n + s.size, 0);
        return {total: fmtSize(x.total), never: x.sugg.length, neverSize: fmtSize(ns), low: x.free != null && x.free < (Number(P().opt?.('warnGo')) || 0) * 1e9};
    }
    async function diskHtml() {
        const x = await diskData(), max = Math.max(1, ...x.bars.map(b => b[1])), top = x.bars.slice(0, 6), rest = x.bars.slice(6).reduce((n, b) => n + b[1], 0);
        return `<p><b>${esc(T('{s} de données sur ce disque', {s: fmtSize(x.total)}))}</b>${x.free != null ? ` · <span class="muted">${esc(T('libre : {s}', {s: fmtSize(x.free)}))}</span>` : ''}</p>
            <div class="dp-bars">${[...top, ...(rest ? [[T('{n} autres', {n: x.bars.length - 6}), rest]] : [])].map(([k, v]) => `<div class="dp-barl"><span>${esc(T(k))}</span><span class="dp-tk"><i style="width:${Math.max(1, Math.round(v / max * 100))}%"></i></span><span class="dp-v">${esc(fmtSize(v))}</span></div>`).join('')}</div>
            <div class="dp-subh">${esc(T('Faire de la place · jamais ouverts'))}</div>
            ${x.early ? `<p class="muted">${esc(T('Les suggestions viendront après deux semaines d’usage : l’app note seulement depuis peu les listes que tu ouvres.'))}</p>` : x.sugg.length ? `<ul class="dp-sugg">${x.sugg.map(s => `<li data-dp-sg="${esc(`${s.f.id}:${s.k}`)}"><span><b>${esc(T(s.name))}</b><small>${esc(T('{t} · jamais ouvert dans Listes', {t: T(s.theme)}))}</small></span>${ro() ? '' : `<button type="button" class="button small secondary" data-dp-free="${esc(`${s.f.id}:${s.k}`)}">${esc(T('Retirer · {s}', {s: fmtSize(s.size)}))}</button>`}</li>`).join('')}</ul>` : `<p class="muted">${esc(T('Rien à proposer : tout ce qui est installé a déjà servi.'))}</p>`}
            <p class="muted small">${esc(T('Jamais un pack favori, récent ou utilisé par une question gardée. Retiré = réinstallable d’un clic ; « ↶ Annuler » tout de suite.'))}</p>`;
    }
    function bindDisk(box, again) {
        box.addEventListener('click', async e => {
            const b = e.target.closest('[data-dp-free]'); if (!b || b.disabled) return;
            const [fid, k] = b.dataset.dpFree.split(':'), f = (M().families || []).find(x => x.id === fid); if (!f) return;
            b.disabled = true;
            try { await post(`${f.pre}_pack_remove`, f.body(k)); } catch (x) { b.disabled = false; return toast(x.message, 'error'); }
            const li = b.closest('li'); li.classList.add('is-gone'); b.textContent = T('retiré');
            const undo = async () => { await post(`${f.pre}_pack_restore`, f.body(k)); again(); }, redo = async () => { await post(`${f.pre}_pack_remove`, f.body(k)); again(); };
            A().undoToast ? A().undoToast(T('🗑 {name} retiré', {name: T(li.querySelector('b').textContent)}), {undo, redo, icon: '🗑'}) : toast(T('🗑 {name} retiré', {name: li.querySelector('b').textContent}));
        });
    }
    function disk() {
        dialog({eyebrow: T('Entretien'), title: `💽 ${T('Place prise, et en faire')}`, wide: true, submitLabel: 'Fermer', body: `<div data-dp-disk>${UI().spinner ? UI().spinner(T('Chargement…')) : '…'}</div>`,
            onOpen: async dl => { const box = dl.querySelector('[data-dp-disk]'); const again = async () => { if (box.isConnected) box.innerHTML = await diskHtml(); }; await again(); bindDisk(box, again); }, onSubmit: () => true});
    }

    /* ═════════════ 🕰 versions d'un pack (21) ═════════════ */
    const K_VERS = 'genealogie-donnees-versions';
    async function versionsHtml(id) {
        let r; try { r = await api('dplus_versions', {pack: id}); } catch (e) { return `<p class="dp-err">${esc(e.message)}</p>`; }
        const log = readJ(K_VERS, {}) || {}, mineLog = Array.isArray(log[id]) ? log[id] : [], vs = r.versions || [];
        const cur = vs.find(v => v.kind === 'current'); if (cur && !mineLog.some(x => x.v === cur.version)) { mineLog.unshift({v: cur.version, rows: cur.rows, at: Date.now()}); log[id] = mineLog.slice(0, 12); writeJ(K_VERS, log); }
        const known = new Set(vs.map(v => v.version));
        const delta = v => (v.kind === 'current' && v.from_rows ? (v.rows - v.from_rows >= 0 ? T('+{n} lignes depuis la version d’avant', {n: nf(v.rows - v.from_rows)}) : T('{n} lignes depuis la version d’avant', {n: nf(v.rows - v.from_rows)})) : T('{n} lignes', {n: nf(v.rows)}));
        return `<ul class="dp-vers">${vs.map(v => `<li class="${v.kind === 'current' ? 'is-cur' : ''}"><b>${esc(fmtDate(v.version))}</b> ${v.kind === 'current' ? `<span class="ui-badge is-blue">${esc(T('utilisée'))}</span>` : v.kind === 'kept' ? `<span class="ui-badge is-grey">${esc(T('gardée'))}</span>` : `<span class="ui-badge is-grey">${esc(T('livrée avec l’app'))}</span>`}<small>${esc(delta(v))}</small>
                ${v.revert && !ro() ? `<div class="dp-row"><button type="button" class="button small secondary" data-dp-rev="${esc(id)}" data-v="${esc(v.version)}">↶ ${esc(T('Revenir à cette version'))}</button></div>` : ''}</li>`).join('')}
            ${mineLog.filter(x => !known.has(x.v)).map(x => `<li class="is-old"><b>${esc(fmtDate(x.v))}</b> <span class="ui-badge is-grey">${esc(T('plus gardée'))}</span><small>${esc(T('{n} lignes', {n: nf(x.rows)}))}</small></li>`).join('')}</ul>
            <p class="muted small">${esc(T('L’app garde la version d’avant de chaque pack mis à jour. Tes notes, lignes ajoutées et marques suivent les lignes : une version plus ancienne les garde.'))}</p>`;
    }
    function bindVersions(box, again) {
        box.addEventListener('click', async e => {
            const b = e.target.closest('[data-dp-rev]'); if (!b) return; const id = b.dataset.dpRev; b.disabled = true;
            try {
                await post('donnees_maj_undo', {pack: id}); await M().status?.(true);
                const sw = async () => { await post('donnees_maj_undo', {pack: id}); await M().status?.(true); again(); };
                A().undoToast ? A().undoToast(T('{p} revient à la version du {d}. Tes notes et marques sont gardées.', {p: id, d: fmtDate(b.dataset.v)}), {undo: sw, redo: sw}) : toast(T('Version remise.'));
                again();
            } catch (x) { b.disabled = false; toast(x.message, 'error'); }
        });
    }

    /* ═════════════ Réglages → 🗂 Données : 💽 et 🕰, à côté de ce qui existe ═════════════ */
    async function maintExtras(panel) {
        if (!panel?.isConnected || panel.querySelector('[data-dp-maint]')) return;
        const box = document.createElement('div'); box.dataset.dpMaint = ''; box.className = 'dp-maint';
        const show19 = P().on?.(19), show21 = P().on?.(21); if (!show19 && !show21) return;
        let st = null; try { st = await M().status?.(); } catch (_) {}
        const packs = (st?.packs || []).filter(p => p.state === 'updated' || p.can_undo).concat((st?.packs || []).filter(p => !(p.state === 'updated' || p.can_undo)));
        box.innerHTML = `${show19 ? `<section class="maintenance-panel dp-diskp"><h3>💽 ${esc(T('Place prise, et en faire'))}</h3><div data-dp-disk>${UI().spinner ? UI().spinner(T('Chargement…')) : '…'}</div></section>` : ''}
            ${show21 && packs.length ? `<section class="maintenance-panel dp-versp"><h3>🕰 ${esc(T('Versions d’un pack'))}</h3><label class="dp-fld"><span>${esc(T('Pack'))}</span><select data-dp-vpack>${packs.map(p => `<option value="${esc(p.id)}">${esc(p.id)}${p.state === 'updated' ? ` · ${esc(T('mis à jour'))}` : ''}</option>`).join('')}</select></label><div data-dp-vers></div></section>` : ''}`;
        if (!panel.isConnected || panel.querySelector('[data-dp-maint]')) return;
        panel.appendChild(box);
        const dbox = box.querySelector('[data-dp-disk]'); if (dbox) { const again = async () => { if (dbox.isConnected) dbox.innerHTML = await diskHtml(); }; again(); bindDisk(dbox, again); }
        const vbox = box.querySelector('[data-dp-vers]'), sel = box.querySelector('[data-dp-vpack]');
        if (vbox) { const again = async () => { if (vbox.isConnected) vbox.innerHTML = await versionsHtml(sel.value); }; again(); sel.addEventListener('change', again); bindVersions(vbox, again); }
    }
    function wrapMaint() {
        ext.maintenance = ext.maintenance || {};
        const base = ext.maintenance.donnees_installees; if (!base || base.__dp) return !!base;
        const w = async token => { const r = await base(token); const panel = document.querySelector('#workspace [data-dmaj-panel]'); if (panel) { maintExtras(panel); new MutationObserver((_, mo) => { if (!panel.isConnected) return mo.disconnect(); if (!panel.querySelector('[data-dp-maint]')) maintExtras(panel); }).observe(panel, {childList: true}); } return r; };
        w.__dp = true; ext.maintenance.donnees_installees = w; return true;
    }
    if (!wrapMaint()) document.addEventListener('DOMContentLoaded', () => { if (!wrapMaint()) setTimeout(wrapMaint, 500); });

    ext.donneesPlusOutils = {compare, around, missing, cite, citeData, citeText, credits, creditsData, booklet, bookHtml, slideshow, share, disk, diskSummary, diskData, versionsHtml, CHAPTERS};
})();
