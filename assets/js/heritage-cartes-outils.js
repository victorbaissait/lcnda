/* LCNDA — 🧭 Carte : quatre outils en plus, construits sur la Carte (crochets ext.mapSetup / ext.mapDraw), les fonds des
 * diagrammes « Cartes » (ext.diagramCartes : Natural Earth, IGN Admin Express, projections), la grille des altitudes du socle
 * météo (lib/meteo.php) et le moteur 3D de la maison (assets/vendor/three.module.js, le même, jamais un deuxième) :
 *  1. 🧭 Distances et temps de trajet d'autrefois : entre deux lieux (menu de choix ×2) ou le long d'une vie ; à pied, à cheval,
 *     en diligence, en bateau, en train selon l'année ; vitesses sourcées et réglables (app-cartes-outils-core.js) ; bloc
 *     « 🧭 Ses déplacements » de la fiche ;
 *  2. 🖼 Grande carte à imprimer (A3 → A0) : 5 styles, cartouche, légende, rose des vents, échelle, naissances / mariages /
 *     décès, migrations, une branche, portraits en médaillon ; fond vectoriel hors ligne (pas de tuiles : leurs conditions
 *     d'usage interdisent le téléchargement en masse pour l'impression) ; export E3 (PDF, PNG, JPG, SVG) et impression L1 ;
 *  3. ⛰ Relief 3D d'une zone avec les lieux de la famille en épingles (exagération réglable, souris et clavier) ;
 *  4. ✏️ Mes couches : zones, itinéraires, points et notes dessinés sur la carte, gardés en base (↶ Annuler H7),
 *     montrés / cachés, ⤓ GeoJSON / KML et ⤒ réimportés (K13).
 * Serveur : api.php?action=cartes_outils / cartes_outils_write (lib/cartes_outils.php). Jamais un vivant ni une fiche
 * confidentielle sur la grande carte (lieux, migrations, portraits filtrés côté serveur).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    ext.personBlocks = ext.personBlocks || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER || A();
    const C = () => window.LCNDA_CARTES_OUTILS, DC = () => ext.diagramCartes;
    const S = () => A()?.state || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const pl = (n, w, m) => A()?.plural ? A().plural(n, w, m) : `${n} ${w}`;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m))); // 🌐 docs/I18N.md
    const isFr = () => !window.LCNDA_I18N || window.LCNDA_I18N.lang === 'fr';
    const nf = (n, d) => window.LCNDA_I18N.fmtNumber(n, {maximumFractionDigits: d});
    // 🌐 les textes du moteur (app-cartes-outils-core.js, en français) refaits dans la langue choisie ; en français, ceux du moteur tels quels
    const kmT = n => (isFr() || !isF(n) ? C().fmtKm(n) : n < 10 ? `${nf(n, 1)} km` : `${nf(Math.round(n), 0)} km`);
    const durT = t => {
        if (!t) return ''; if (isFr()) return t.text; const {hours, days} = t; if (!isF(hours) || !isF(days)) return '';
        if (days < 0.8) { if (hours < 1) return `≈ ${Math.max(5, Math.round(hours * 60 / 5) * 5)} min`; return `≈ ${nf(Math.round(hours * 2) / 2, 1)} h`; }
        if (days < 14) { const d = Math.max(1, Math.round(days * 2) / 2); return '≈ ' + i18n(d === 1 ? '{n} jour' : '{n} jours', {n: nf(d, 1)}); }
        const d = Math.round(days); return '≈ ' + (d >= 21 ? i18n('{n} jours ({w} semaines)', {n: d, w: Math.round(d / 7)}) : i18n('{n} jours', {n: d}));
    };
    const sentenceT = o => {
        if (isFr()) return C().sentence(o);
        const {from, to, year, distKm, mode = '', settings: st} = o; if (!isF(distKm)) return '';
        const t = mode ? C().travel(distKm, year, mode, st) : C().best(distKm, year, st); if (!t) return '';
        const y = isF(Number(year)) && year !== null && year !== '' ? Number(year) : null, past = y !== null && y < new Date().getFullYear() - 30;
        const what = i18n(t.mode === 'mer' || t.mode === 'riviere' ? '{km} sur l’eau' : t.mode === 'train' ? '{km} de voie' : '{km} de route', {km: kmT(t.routeKm)});
        const v = {dur: durT(t).replace(/^≈ /, ''), from: from || i18n('ce lieu'), to: to || i18n('ce lieu'), year: y === null ? '' : String(y), how: i18n(t.label), what};
        return y === null ? i18n('Il faut environ {dur} pour aller de {from} à {to} ({how}, ≈ {what}).', v) : i18n(past ? 'Il fallait environ {dur} pour aller de {from} à {to} en {year} ({how}, ≈ {what}).' : 'Il faut environ {dur} pour aller de {from} à {to} en {year} ({how}, ≈ {what}).', v);
    };
    const isF = Number.isFinite;
    const r1 = v => Math.round(v * 10) / 10;
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('is-mode-simple');
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* navigateur sans stockage */ } };
    const get = (op, q = {}) => A().api('cartes_outils', {op, ...q});
    const post = (op, body) => A().api('cartes_outils_write', {}, {method: 'POST', body: {op, ...body}});
    const pkItem = el => { if (!el) return null; let v = []; try { v = JSON.parse(el.dataset.pkValue || '[]'); } catch (_) { /* vide */ } const it = Array.isArray(v) ? v[0] : null; return it && !it.free && it.id ? it : null; };
    const download = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
    const placeName = it => String(it?.title || it?.name || it?.place_name || i18n('ce lieu')).split(',')[0].trim();
    const yearNow = () => new Date().getFullYear();

    /* ═════════════════════ 1. 🧭 Distances et temps de trajet ═════════════════════ */
    const SET_KEY = 'genealogie-trajets';
    const settings = () => C().cleanSettings(lsGet(SET_KEY, {}));
    function modesTable(distKm, year) {
        const st = settings(), rows = C().allModes(distKm, year, st);
        return `<div class="cpo-modes-wrap"><table class="data-table cpo-modes"><thead><tr><th>Moyen</th><th>Durée</th><th>Distance parcourue</th><th>Par jour</th></tr></thead><tbody>${rows.map(t => `<tr class="${t.available ? '' : 'is-off'}" data-cpo-mode="${t.mode}">
            <td><span aria-hidden="true">${t.icon}</span> ${esc(i18n(t.name))}${t.custom ? ` ${UI().badge ? UI().badge(i18n('réglé'), 'blue', {title: i18n('Vitesse réglée par toi')}) : ''}` : ''}</td>
            <td><b>${t.available ? esc(durT(t)) : ''}</b>${t.available ? '' : UI().badge ? UI().badge(i18n('pas encore'), 'grey', {title: i18n('Pas avant {year}', {year: String(C().modeOf(t.mode).from)})}) : i18n('pas encore')}</td>
            <td>${esc(kmT(t.routeKm))}</td><td>${esc(kmT(t.kmDay))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function settingsHtml(year) {
        const st = settings();
        return `<details class="cpo-settings" data-cpo-settings><summary>⚙️ Vitesses et sources</summary>
            <p class="ui-hint">Les vitesses suivent l’époque (ordres de grandeur pour la France et l’Europe de l’Ouest). Écris une autre distance par jour pour un moyen ; vide = selon l’époque.</p>
            <div class="cpo-speeds">${C().MODES.map(m => { const sp = C().speedAt(m, year, {}); return `<label class="cpo-speed"><span>${m.icon} ${esc(i18n(m.name))}</span><input type="number" min="1" max="5000" step="1" data-unit="${esc(i18n('km/j'))}" data-cpo-speed="${m.id}" value="${st.speeds[m.id] || ''}" placeholder="${Math.round(sp.kmDay)}" aria-label="${esc(i18n('{name} : kilomètres par jour', {name: i18n(m.name)}))}"></label>`; }).join('')}</div>
            <div class="cpo-speeds">${Object.entries(C().ROUTES).map(([k, [lab]]) => `<label class="cpo-speed"><span>${esc(i18n('Détour {how}', {how: i18n(lab)}))}</span><input type="number" min="1" max="3" step="0.05" data-unit="×" data-cpo-detour="${k}" value="${st.detour[k]}" aria-label="${esc(i18n('Détour {how}', {how: i18n(lab)}))}"></label>`).join('')}</div>
            <p class="ui-hint">Le détour : la route n’est jamais droite. 1,25 = 25 % de plus que la distance à vol d’oiseau.</p>
            <div class="cpo-set-row"><button type="button" class="button small secondary" data-cpo-reset>↺ Remettre comme au départ</button><span class="cpo-saved" data-cpo-saved hidden>✓ Enregistré</span></div>
            <h4>Sources</h4><ul class="cpo-sources">${C().MODES.map(m => `<li><b>${m.icon} ${esc(i18n(m.name))}</b> — ${esc(i18n(m.note))}. ${m.src.map(s => esc(i18n(C().SOURCES[s]))).join(' ')}</li>`).join('')}</ul></details>`;
    }
    function bindSettings(box, redraw) {
        const saved = box.querySelector('[data-cpo-saved]');
        const save = () => {
            const before = lsGet(SET_KEY, {}), now = {speeds: {}, detour: {}};
            box.querySelectorAll('[data-cpo-speed]').forEach(i => { if (i.value !== '') now.speeds[i.dataset.cpoSpeed] = Number(i.value); });
            box.querySelectorAll('[data-cpo-detour]').forEach(i => { if (i.value !== '') now.detour[i.dataset.cpoDetour] = Number(String(i.value).replace(',', '.')); });
            lsSet(SET_KEY, C().cleanSettings(now)); if (saved) { saved.hidden = false; clearTimeout(saved._t); saved._t = setTimeout(() => { saved.hidden = true; }, 2500); }
            redraw();
            A()?.undoToast?.(i18n('Vitesses de trajet enregistrées'), {icon: '', undo: () => { lsSet(SET_KEY, before); refill(); redraw(); }, redo: () => { lsSet(SET_KEY, C().cleanSettings(now)); refill(); redraw(); }});
        };
        const refill = () => { const st = settings(); box.querySelectorAll('[data-cpo-speed]').forEach(i => { i.value = st.speeds[i.dataset.cpoSpeed] || ''; }); box.querySelectorAll('[data-cpo-detour]').forEach(i => { i.value = st.detour[i.dataset.cpoDetour]; }); };
        box.querySelectorAll('[data-cpo-speed],[data-cpo-detour]').forEach(i => i.addEventListener('change', save));
        box.querySelector('[data-cpo-reset]')?.addEventListener('click', () => { const before = lsGet(SET_KEY, {}); lsSet(SET_KEY, {}); refill(); redraw(); A()?.undoToast?.(i18n('Vitesses remises comme au départ'), {icon: '', undo: () => { lsSet(SET_KEY, before); refill(); redraw(); }}); });
    }
    /** la fenêtre « 🧭 Distances et temps de trajet » : {from, to} = lieux {id, title, lat, lon}, year, person = id */
    function openTravel(o = {}) {
        const tab0 = o.person ? 'life' : (lsGet('lcnda-trajets-onglet', 'two') === 'life' ? 'life' : 'two');
        const y0 = isF(Number(o.year)) && o.year ? Number(o.year) : '';
        const body = `<div class="cpo-travel" data-cpo-travel>
            <div class="segmented" role="tablist"><button type="button" role="tab" data-cpo-tab="two" class="${tab0 === 'two' ? 'is-active' : ''}">📍 Entre deux lieux</button><button type="button" role="tab" data-cpo-tab="life" class="${tab0 === 'life' ? 'is-active' : ''}">👤 Le long d’une vie</button></div>
            <div data-cpo-pane="two" ${tab0 === 'two' ? '' : 'hidden'}>
                <div class="cpo-grid2"><div><span class="pk-lab">Départ</span>${P().pickerField({name: 'cp_from', kind: 'place', value: o.from || null, placeholder: i18n('Tulle, Brive…')})}</div>
                <div><span class="pk-lab">Arrivée</span>${P().pickerField({name: 'cp_to', kind: 'place', value: o.to || null, placeholder: i18n('Paris…')})}</div></div>
                <label class="cpo-year">Année du voyage <input type="number" min="1000" max="2100" step="1" data-cpo-year value="${esc(y0)}" placeholder="${yearNow()}"></label>
                <div data-cpo-result aria-live="polite"></div>
            </div>
            <div data-cpo-pane="life" ${tab0 === 'life' ? '' : 'hidden'}>
                <span class="pk-lab">Personne</span>${P().pickerField({name: 'cp_person', kind: 'person', value: o.person || null})}
                <div data-cpo-life aria-live="polite"></div>
            </div>
            <div data-cpo-setbox>${settingsHtml(y0 || yearNow())}</div></div>`;
        const dlg = ext.openDialog({eyebrow: 'CARTE', title: '🧭 Distances et temps de trajet', wide: true, submitLabel: 'Fermer', body, onSubmit: () => true});
        dlg.classList.add('cpo-travel-dlg');
        const $ = s => dlg.querySelector(s);
        const drawTwo = () => {
            const box = $('[data-cpo-result]'), a = pkItem(dlg.querySelector('[data-pk-opts*="cp_from"]')), b = pkItem(dlg.querySelector('[data-pk-opts*="cp_to"]'));
            const year = Number($('[data-cpo-year]').value) || yearNow();
            if (!a || !b) { box.innerHTML = A().empty('Choisis le lieu de départ et le lieu d’arrivée', {icon: '🧭'}); return; }
            const d = C().km({lat: a.lat, lon: a.lon}, {lat: b.lat, lon: b.lon});
            if (d === null) { box.innerHTML = UI().notice('warn', i18n('Un des deux lieux n’a pas de position sur la carte ({name}) : place-le d’abord.', {name: esc(placeName(d === null && !isF(Number(a.lat)) ? a : b))})); return; }
            const st = settings();
            box.innerHTML = `<p class="cpo-phrase">${esc(sentenceT({from: placeName(a), to: placeName(b), year, distKm: d, settings: st}))}</p>
                <p class="cpo-dist">${i18n('À vol d’oiseau : <b>{km}</b>', {km: esc(kmT(d))})}</p>${modesTable(d, year)}`;
        };
        const drawLife = async () => {
            const box = $('[data-cpo-life]'), it = pkItem(dlg.querySelector('[data-pk-opts*="cp_person"]'));
            if (!it) { box.innerHTML = A().empty('Choisis une personne pour suivre ses déplacements', {icon: '👤'}); return; }
            box.innerHTML = UI().spinner(i18n('Je relis ses événements…'));
            let detail = null; try { detail = await A().api('person', {id: it.id}); } catch (e) { box.innerHTML = UI().notice('error', e.message); return; }
            box.innerHTML = lifeHtml(detail, {full: true});
        };
        dlg.addEventListener('click', e => {
            const t = e.target.closest('[data-cpo-tab]'); if (!t) return;
            dlg.querySelectorAll('[data-cpo-tab]').forEach(b => b.classList.toggle('is-active', b === t));
            dlg.querySelectorAll('[data-cpo-pane]').forEach(p => { p.hidden = p.dataset.cpoPane !== t.dataset.cpoTab; });
            lsSet('lcnda-trajets-onglet', t.dataset.cpoTab);
            if (t.dataset.cpoTab === 'life') drawLife(); else drawTwo();
        });
        dlg.addEventListener('picker-change', e => { if (e.detail.name === 'cp_person') drawLife(); else drawTwo(); });
        $('[data-cpo-year]').addEventListener('input', () => { drawTwo(); });
        bindSettings($('[data-cpo-setbox]'), () => { drawTwo(); if (!$('[data-cpo-pane="life"]').hidden) drawLife(); });
        // les lieux prérempli par un numéro seulement : relus par le menu de choix, puis le calcul
        setTimeout(drawTwo, 50); setTimeout(drawTwo, 700);
        if (tab0 === 'life') drawLife();
        return dlg;
    }
    /** les étapes d'une vie (événements placés + voyages en mer) → HTML : liste des déplacements, phrase du plus long, total */
    function lifeLegs(detail) {
        const st = settings();
        const evs = (detail?.events || []).map(e => ({lat: e.precise_lat ?? e.latitude, lon: e.precise_lon ?? e.longitude, year: e.year, place: e.place_name || e.name || '', label: e.type_label || ''}));
        const legs = C().legs(evs, st);
        (detail?.heritage?.voyages || []).forEach(v => {
            const a = {lat: Number(v.dep_lat), lon: Number(v.dep_lon), place: String(v.departure_port || '').split(',')[0]}, b = {lat: Number(v.dest_lat), lon: Number(v.dest_lon), place: String(v.arrival_port || v.destination || '').split(',')[0]};
            const d = C().km(a, b), y = Number(v.departure_year) || Number(String(v.departure_date || '').match(/\d{4}/)?.[0]) || null;
            if (d !== null && d > 50) legs.push({from: a, to: b, km: d, year: y, best: C().travel(d, y, 'mer', st), sea: true});
        });
        return legs.sort((p, q) => (p.year ?? 99999) - (q.year ?? 99999));
    }
    function lifeHtml(detail, {full = false} = {}) {
        const legs = lifeLegs(detail), st = settings();
        if (!legs.length) return A().empty(full ? 'Pas de déplacement : il faut au moins deux lieux placés sur la carte' : 'Pas de déplacement entre deux lieux placés', {icon: '🧭'});
        const total = legs.reduce((s, l) => s + l.km, 0), longest = legs.reduce((m, l) => (l.km > m.km ? l : m), legs[0]);
        const phrase = sentenceT({from: longest.from.place, to: longest.to.place, year: longest.year, distKm: longest.km, mode: longest.sea ? 'mer' : '', settings: st});
        const rows = legs.slice(0, full ? 200 : 8).map(l => `<li><span class="cpo-leg-y">${esc(l.year ?? '?')}</span><span class="cpo-leg-p">${esc(l.from.place || '?')} → ${esc(l.to.place || '?')}</span><span class="cpo-leg-d">${esc(kmT(l.km))}</span><span class="cpo-leg-t">${l.best ? `${l.best.icon} ${esc(durT(l.best))}` : ''}</span></li>`).join('');
        return `<p class="cpo-phrase">${esc(phrase)}</p><ol class="cpo-legs">${rows}</ol>${!full && legs.length > 8 ? `<p class="ui-hint">${i18n('… et {n}.', {n: pl(legs.length - 8, 'autre déplacement', 'autres déplacements')})}</p>` : ''}
            <p class="cpo-dist">${i18n('Au total, environ <b>{km}</b> à vol d’oiseau d’un lieu de vie à l’autre ({n}).', {km: esc(kmT(total)), n: pl(legs.length, 'déplacement')})}</p>`;
    }
    // 🧭 Le bloc de la fiche : seulement quand la personne a bougé (deux lieux placés au moins)
    ext.personBlocks.travel = (index, detail) => {
        const p = detail?.person; if (!p || !C()) return '';
        if (!lifeLegs(detail).length) return '';
        return A().card(index, '🧭 Ses déplacements', '', `<div class="cpo-block">${lifeHtml(detail)}</div>`, 'span-6', `<button type="button" class="button small secondary" data-cpo-travel-person="${Number(p.id)}">🧭 Calculer un trajet…</button>`);
    };
    document.addEventListener('click', e => { const b = e.target.closest('[data-cpo-travel-person]'); if (b) { e.preventDefault(); openTravel({person: Number(b.dataset.cpoTravelPerson)}); } });

    /* ═════════════════════ 2. 🖼 Grande carte à imprimer ═════════════════════ */
    const STYLES = {
        ancien: {name: '📜 Ancienne (parchemin)', paper: '#efe3c4', sea: '#dcdcc4', land: '#f6ecd2', border: '#8b6d48', dept: '#c4ab86', ink: '#3d2b1a', b: '#2f6b3a', m: '#a8323a', d: '#2b2b2b', move: '#7a3b1d', font: 'Georgia, "Times New Roman", serif', italic: true, vignette: true},
        etatmajor: {name: '🎖 État-major (XIXᵉ)', paper: '#f2e8cf', sea: '#c9dde6', land: '#f7f0dd', border: '#3b2f24', dept: '#a69378', ink: '#3b2f24', b: '#3d6b2f', m: '#b04a2f', d: '#2a2018', move: '#8a3a1a', font: 'Georgia, "Times New Roman", serif', italic: true},
        moderne: {name: '🗺 Moderne', paper: '#ffffff', sea: '#d4e6f5', land: '#f7f6f2', border: '#8d97a3', dept: '#cdd2d8', ink: '#1d2733', b: '#1f7a4d', m: '#c2410c', d: '#334155', move: '#2563eb', font: 'Helvetica, Arial, sans-serif'},
        nb: {name: '⚫ Noir et blanc', paper: '#ffffff', sea: '#ffffff', land: '#f1f1f1', border: '#222222', dept: '#a0a0a0', ink: '#000000', b: '#000000', m: '#000000', d: '#000000', move: '#000000', font: 'Georgia, "Times New Roman", serif'},
        nuit: {name: '🌙 Bleu nuit et or', paper: '#14213d', sea: '#0f1a30', land: '#1f3157', border: '#c9a227', dept: '#3d5486', ink: '#f1e3b3', b: '#7bd389', m: '#f4a261', d: '#e9e9e9', move: '#c9a227', font: 'Georgia, "Times New Roman", serif', italic: true},
    };
    const FRAMES = {auto: ['🎯 Autour des lieux', null], france: ['🇫🇷 France', [-5.3, 41.2, 9.7, 51.3]], europe: ['🇪🇺 Europe', [-11, 34.5, 32, 61]], monde: ['🌍 Monde', [-170, -56, 180, 78]]};
    const POSTER_KEY = 'genealogie-grande-carte';
    const posterDefaults = () => ({paper: 'A3', orientation: 'portrait', style: 'ancien', frame: 'auto', title: '', family: '', dates: '', b: true, m: true, d: true, moves: true, labels: true, photos: true, legend: true, compass: true, scale: true, cartouche: true, branch: null});
    const posterOpts = () => ({...posterDefaults(), ...(lsGet(POSTER_KEY, {}) || {}), branch: null});
    const MAPB = new Map(); // le dessin du fond (pays, départements) d'un cadrage : gardé pendant que l'on règle le reste
    /** la vue (ouest, sud, est, nord) qui contient les lieux, élargie au rapport largeur / hauteur du cadre */
    function viewFor(o, pts, w, h) {
        let v = FRAMES[o.frame]?.[1];
        if (!v) {
            const b = C().bounds(pts) || [-5.3, 41.2, 9.7, 51.3];
            let [x0, y0, x1, y1] = b; const mx = Math.max(.35, (x1 - x0) * .18), my = Math.max(.25, (y1 - y0) * .18);
            v = [x0 - mx, y0 - my, x1 + mx, y1 + my];
        }
        // même rapport que le cadre (en km : une longitude vaut cos(latitude) fois une latitude)
        const k = Math.cos((v[1] + v[3]) / 2 * Math.PI / 180) || 1, vw = (v[2] - v[0]) * k, vh = v[3] - v[1], want = w / h;
        if (vw / vh < want) { const add = (vh * want / k - (v[2] - v[0])) / 2; v = [v[0] - add, v[1], v[2] + add, v[3]]; }
        else { const add = (vw / want - vh) / 2; v = [v[0], v[1] - add, v[2], v[3] + add]; }
        return [Math.max(-180, v[0]), Math.max(-85, v[1]), Math.min(180, v[2]), Math.min(85, v[3])];
    }
    function ringsPath(base, pr, w, h, view, maxZones = 99999) {
        let d = '';
        const mx = (view[2] - view[0]) * .3 + .5, my = (view[3] - view[1]) * .3 + .5, jump = Math.max(w, h) * .55;
        let n = 0;
        for (const z of base.zones) {
            const b = z.bbox; if (b && (b[2] < view[0] - mx || b[0] > view[2] + mx || b[3] < view[1] - my || b[1] > view[3] + my)) continue;
            if (++n > maxZones) break;
            for (const poly of z.polys) for (const r of poly) {
                let s = '', k = 0, lx = NaN, ly = NaN, bad = false;
                for (let i = 0; i < r.length; i += 2) {
                    const [x, y] = pr.p(r[i], r[i + 1]); if (!isF(x) || !isF(y)) continue;
                    if (k && Math.abs(x - lx) > jump) { bad = true; break; }
                    if (k && Math.abs(x - lx) < .25 && Math.abs(y - ly) < .25 && i < r.length - 2) continue;
                    s += (k ? 'L' : 'M') + r1(x) + ' ' + r1(y); k++; lx = x; ly = y;
                }
                if (!bad && k > 2) d += s + 'Z';
            }
        }
        return d;
    }
    async function baseLayers(view, pr, w, h) {
        const key = `${view.map(v => v.toFixed(3)).join(',')}|${Math.round(w)}x${Math.round(h)}`;
        if (MAPB.has(key)) return MAPB.get(key);
        const dc = DC(); if (!dc) return {land: '', dept: ''};
        const wide = view[2] - view[0] > 70;
        const world = await dc.load(wide ? 'monde-110m' : 'monde-50m').catch(() => null);
        const inFrance = view[0] < 9.7 && view[2] > -5.3 && view[1] < 51.3 && view[3] > 41.2 && view[2] - view[0] < 30;
        const fr = inFrance ? await dc.load('fr-departements').catch(() => null) : null;
        const out = {land: world ? ringsPath(world, pr, w, h, view) : '', dept: fr ? ringsPath({zones: fr.zones.filter(z => !z.outre)}, pr, w, h, view) : '', attr: ['Natural Earth (domaine public)', fr ? 'IGN Admin Express (Licence Ouverte)' : ''].filter(Boolean).join(' · ')};
        MAPB.set(key, out); if (MAPB.size > 8) MAPB.delete(MAPB.keys().next().value);
        return out;
    }
    /** les portraits en données (data:) : sinon ils ne passent pas dans l'image exportée (une image SVG ne charge rien d'autre) */
    const IMG = new Map();
    async function photoData(url) {
        if (IMG.has(url)) return IMG.get(url);
        const p = (async () => {
            try {
                const blob = await (await fetch(url, {credentials: 'same-origin'})).blob(); if (!/^image\//.test(blob.type)) return '';
                const bmp = await createImageBitmap(blob), s = Math.min(1, 480 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
                return c.toDataURL('image/jpeg', .88);
            } catch (_) { return ''; }
        })();
        IMG.set(url, p); return p;
    }
    const symbol = (kind, x, y, r, st, fill) => {
        const col = fill || st[kind] || st.ink, sw = r * .28;
        if (kind === 'm') return `<path d="M${r1(x)} ${r1(y - r)}L${r1(x + r)} ${r1(y)}L${r1(x)} ${r1(y + r)}L${r1(x - r)} ${r1(y)}Z" fill="${col}" stroke="${st.paper}" stroke-width="${r1(sw)}"/>`;
        if (kind === 'd') { const a = r * .9, t = r * .32; return `<path d="M${r1(x - t)} ${r1(y - a)}h${r1(2 * t)}v${r1(a * .55)}h${r1(a * .6)}v${r1(2 * t)}h${r1(-a * .6)}v${r1(a * 1.45 - 2 * t)}h${r1(-2 * t)}v${r1(-(a * 1.45 - 2 * t))}h${r1(-a * .6)}v${r1(-2 * t)}h${r1(a * .6)}Z" fill="${col}" stroke="${st.paper}" stroke-width="${r1(sw * .7)}"/>`; }
        return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${col}" stroke="${st.paper}" stroke-width="${r1(sw)}"/>`;
    };
    function compassSvg(cx, cy, R, st) {
        const pts = (a, r) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
        let s = `<g class="cpo-compass"><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R * .72)}" fill="none" stroke="${st.ink}" stroke-width="${r1(R * .02)}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R * .78)}" fill="none" stroke="${st.ink}" stroke-width="${r1(R * .01)}"/>`;
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, long = i % 2 === 0, L = long ? R : R * .55, wdt = long ? R * .13 : R * .09;
            const [tx, ty] = pts(a, L), [lx, ly] = pts(a - Math.PI / 2, wdt), [rx, ry] = pts(a + Math.PI / 2, wdt);
            s += `<path d="M${r1(cx)} ${r1(cy)}L${r1(lx)} ${r1(ly)}L${r1(tx)} ${r1(ty)}Z" fill="${st.ink}"/><path d="M${r1(cx)} ${r1(cy)}L${r1(rx)} ${r1(ry)}L${r1(tx)} ${r1(ty)}Z" fill="${st.paper}" stroke="${st.ink}" stroke-width="${r1(R * .012)}"/>`;
        }
        const [nx, ny] = pts(0, R * 1.18);
        return s + `<text x="${r1(nx)}" y="${r1(ny)}" font-size="${r1(R * .3)}" text-anchor="middle" font-weight="700" fill="${st.ink}" font-family='${st.font}'>N</text></g>`;
    }
    /** l'affiche entière (SVG, unité = 1 mm) : data = réponse de cartes_outils&op=places ; imgs = url → data: des portraits */
    async function posterSvg(data, o, imgs = new Map()) {
        const st = STYLES[o.style] || STYLES.ancien, [pw, ph] = C().PAPERS[o.paper] || C().PAPERS.A3, land = o.orientation === 'landscape';
        const W = land ? ph : pw, H = land ? pw : ph, f = Math.sqrt(W / 297) * (land ? .92 : 1), M = Math.round(W * .045);
        const fx = M, fy = M, fw = W - 2 * M, fh = H - 2 * M; // le cadre de la carte
        const kinds = ['b', 'm', 'd'].filter(k => o[k]);
        const pts = (data.places || []).filter(p => kinds.some(k => p[k] > 0));
        const photos = o.photos ? (data.photos || []).filter(ph => imgs.get(ph.url)).slice(0, land ? 10 : 8) : [];
        const bandH0 = photos.length ? Math.min(fh * .2, 48 * f) : 0, mh = fh - bandH0; // les médaillons ont leur bande : la carte se cadre au-dessus
        const view = viewFor(o, pts, fw, mh);
        const dc = DC(); if (!dc) throw new Error('Les fonds de carte ne sont pas encore chargés : réessaie dans un instant.');
        const pr = dc.fitProj(dc.autoProj(view), view, fw, mh, false);
        const bl = await baseLayers(view, pr, fw, mh);
        const byId = new Map((data.places || []).map(p => [p.id, p]));
        const XY = p => pr.p(p.lon, p.lat);
        const fs = 3.3 * f, ital = st.italic ? ' font-style="italic"' : '', ff = `font-family='${st.font}'`;
        let g = `<rect width="${W}" height="${H}" fill="${st.paper}"/>`;
        if (st.vignette) g += `<defs><radialGradient id="cpov" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="${st.paper}" stop-opacity="0"/><stop offset="100%" stop-color="#7a5a2a" stop-opacity=".28"/></radialGradient></defs>`;
        g += `<defs><clipPath id="cpoclip"><rect x="0" y="0" width="${r1(fw)}" height="${r1(fh)}"/></clipPath><marker id="cpoarr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${st.move}"/></marker></defs>`;
        let m = `<g transform="translate(${fx} ${fy})"><g clip-path="url(#cpoclip)"><rect width="${r1(fw)}" height="${r1(fh)}" fill="${st.sea}"/>`;
        if (bl.land) m += `<path d="${bl.land}" fill="${st.land}" stroke="${st.border}" stroke-width="${r1(.35 * f)}" stroke-linejoin="round"${o.style === 'ancien' ? ` stroke-dasharray="${r1(1.6 * f)} ${r1(.7 * f)}"` : ''}/>`;
        if (bl.dept) m += `<path d="${bl.dept}" fill="none" stroke="${st.dept}" stroke-width="${r1(.18 * f)}" stroke-linejoin="round"/>`;
        // migrations : naissance → décès, courbe et flèche, plus épaisse quand plusieurs personnes ont fait le même trajet
        if (o.moves) (data.moves || []).forEach(mv => {
            const a = byId.get(mv.from), b = byId.get(mv.to); if (!a || !b) return;
            const [x1, y1] = XY(a), [x2, y2] = XY(b); if (![x1, y1, x2, y2].every(isF) || Math.hypot(x2 - x1, y2 - y1) < 2) return;
            const mx = (x1 + x2) / 2 - (y2 - y1) * .18, my = (y1 + y2) / 2 + (x2 - x1) * .18;
            m += `<path class="cpo-move" d="M${r1(x1)} ${r1(y1)}Q${r1(mx)} ${r1(my)} ${r1(x2)} ${r1(y2)}" fill="none" stroke="${st.move}" stroke-opacity=".8" stroke-width="${r1(Math.min(2.6, .45 + Math.sqrt(mv.n) * .35) * f)}" stroke-linecap="round" marker-end="url(#cpoarr)"/>`;
        });
        // les lieux : un symbole par sorte (naissance ●, mariage ◆, décès ✝), plus gros quand il y a plus d'événements
        const placed = [], labels = [];
        pts.slice().sort((p, q) => q.n - p.n).forEach(p => {
            const [x, y] = XY(p); if (!isF(x) || !isF(y) || x < -5 || y < -5 || x > fw + 5 || y > fh + 5) return;
            const ks = kinds.filter(k => p[k] > 0), r = (1.1 + Math.min(2.2, Math.sqrt(ks.reduce((s, k) => s + p[k], 0)) * .45)) * f;
            const off = ks.length > 1 ? r * 1.15 : 0;
            ks.forEach((k, i) => { const a = (i / ks.length) * Math.PI * 2 - Math.PI / 2; m += symbol(k, x + Math.cos(a) * off, y + Math.sin(a) * off, r, st); });
            placed.push({p, x, y, r: r + off});
        });
        // noms des lieux : les plus importants d'abord, sans chevauchement
        if (o.labels) {
            const boxes = placed.map(q => [q.x - q.r, q.y - q.r, q.x + q.r, q.y + q.r]), hit = b => boxes.some(c => b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1]);
            placed.slice(0, 80).forEach(q => {
                const t = q.p.name, tw = t.length * fs * .55, x = q.x + q.r + 1.2 * f, y = q.y + fs * .35, bx = [x, y - fs, x + tw, y + fs * .3];
                if (bx[2] > fw - 2 || hit(bx)) return; boxes.push(bx);
                labels.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(fs)}" fill="${st.ink}" ${ff}${ital} stroke="${st.land}" stroke-width="${r1(fs * .28)}" stroke-linejoin="round" paint-order="stroke">${esc(t)}</text>`);
            });
        }
        m += labels.join('') + `</g><rect width="${r1(fw)}" height="${r1(fh)}" fill="none" stroke="${st.ink}" stroke-width="${r1(.6 * f)}"/>`;
        // portraits en médaillon : une bande en bas du cadre, reliés à leur lieu par un trait fin
        let bandTop = fh;
        if (photos.length) {
            const bandH = bandH0, rr = Math.min(bandH * .32, fw / photos.length * .3); bandTop = fh - bandH;
            m += `<rect x="0" y="${r1(bandTop)}" width="${r1(fw)}" height="${r1(bandH)}" fill="${st.paper}" fill-opacity=".86"/><line x1="0" x2="${r1(fw)}" y1="${r1(bandTop)}" y2="${r1(bandTop)}" stroke="${st.ink}" stroke-width="${r1(.3 * f)}"/>`;
            photos.forEach((ph, i) => {
                const cx = fw * (i + .5) / photos.length, cy = bandTop + bandH * .42, pt = byId.get(ph.place), id = `cpoph${i}`;
                if (pt) { const [x, y] = XY(pt); if (isF(x) && y < bandTop) m += `<line class="cpo-leader" x1="${r1(cx)}" y1="${r1(cy - rr)}" x2="${r1(x)}" y2="${r1(y)}" stroke="${st.ink}" stroke-opacity=".45" stroke-width="${r1(.2 * f)}" stroke-dasharray="${r1(.8 * f)} ${r1(.6 * f)}"/>`; }
                m += `<clipPath id="${id}"><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rr)}"/></clipPath><image class="cpo-medal" href="${esc(imgs.get(ph.url))}" x="${r1(cx - rr)}" y="${r1(cy - rr)}" width="${r1(2 * rr)}" height="${r1(2 * rr)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
                    <circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rr)}" fill="none" stroke="${st.ink}" stroke-width="${r1(.5 * f)}"/><text x="${r1(cx)}" y="${r1(cy + rr + fs * 1.1)}" font-size="${r1(fs * .82)}" text-anchor="middle" fill="${st.ink}" ${ff}${ital}>${esc(ph.name)}${ph.year ? ` · ${ph.year}` : ''}</text>`;
            });
        }
        // échelle (en bas à gauche) : une longueur ronde en km
        if (o.scale) {
            const y = (photos.length ? bandTop : fh) - 7 * f, x = 6 * f, a = pr.inv(fw / 2 - 50, fh / 2), b = pr.inv(fw / 2 + 50, fh / 2);
            const kmPerU = (C().km({lon: a[0], lat: a[1]}, {lon: b[0], lat: b[1]}) || 1) / 100, nice = C().niceScale(kmPerU * fw * .18), L = nice / kmPerU;
            m += `<g class="cpo-scale"><rect x="${r1(x - 2 * f)}" y="${r1(y - 6 * f)}" width="${r1(L + 4 * f + fs * 3)}" height="${r1(9 * f)}" fill="${st.paper}" fill-opacity=".75"/>${[0, 1, 2, 3].map(i => `<rect x="${r1(x + L * i / 4)}" y="${r1(y)}" width="${r1(L / 4)}" height="${r1(1.2 * f)}" fill="${i % 2 ? st.paper : st.ink}" stroke="${st.ink}" stroke-width="${r1(.2 * f)}"/>`).join('')}
                <text x="${r1(x)}" y="${r1(y - 1.3 * f)}" font-size="${r1(fs * .8)}" fill="${st.ink}" ${ff}>0</text><text x="${r1(x + L)}" y="${r1(y - 1.3 * f)}" font-size="${r1(fs * .8)}" text-anchor="middle" fill="${st.ink}" ${ff}>${esc(C().fmtKm(nice))}</text></g>`;
        }
        // rose des vents (en haut à droite)
        if (o.compass) m += compassSvg(fw - 16 * f, 18 * f, 11 * f, st);
        // légende (en bas à droite, au-dessus des médaillons)
        if (o.legend) {
            const rows = [...kinds.map(k => [k, i18n({b: 'Naissances et baptêmes', m: 'Mariages', d: 'Décès et sépultures'}[k]), pts.reduce((s, p) => s + (p[k] || 0), 0)]), ...(o.moves && (data.moves || []).length ? [['mv', i18n('Migrations (naissance → décès)'), (data.moves || []).reduce((s, x) => s + x.n, 0)]] : [])];
            const lh = fs * 1.7, lw = 70 * f, lh0 = lh * (rows.length + 1.3), lx = fw - lw - 4 * f, ly = (photos.length ? bandTop : fh) - lh0 - 4 * f;
            m += `<g class="cpo-legend"><rect x="${r1(lx)}" y="${r1(ly)}" width="${r1(lw)}" height="${r1(lh0)}" fill="${st.paper}" fill-opacity=".9" stroke="${st.ink}" stroke-width="${r1(.3 * f)}"/><text x="${r1(lx + 3 * f)}" y="${r1(ly + lh)}" font-size="${r1(fs)}" font-weight="700" fill="${st.ink}" ${ff}>${esc(i18n('Légende'))}</text>`
                + rows.map(([k, t, n], i) => { const yy = ly + lh * (i + 2); return (k === 'mv' ? `<line x1="${r1(lx + 2 * f)}" y1="${r1(yy - fs * .35)}" x2="${r1(lx + 7 * f)}" y2="${r1(yy - fs * .35)}" stroke="${st.move}" stroke-width="${r1(.8 * f)}" marker-end="url(#cpoarr)"/>` : symbol(k, lx + 4.5 * f, yy - fs * .35, 1.6 * f, st)) + `<text x="${r1(lx + 10 * f)}" y="${r1(yy)}" font-size="${r1(fs * .9)}" fill="${st.ink}" ${ff}>${esc(t)} (${n})</text>`; }).join('') + '</g>';
        }
        // cartouche (en haut à gauche) : titre, famille, dates
        if (o.cartouche) {
            const years = data.years ? `${data.years[0]} – ${data.years[1]}` : '';
            const title = o.title || (data.surname ? i18n('Les {name}', {name: data.surname}) : i18n('Notre famille')), fam = o.family || (data.branch ? i18n('Les ancêtres de {name}', {name: data.branch}) : i18n('Les lieux de la famille')), dates = o.dates || years;
            const tf = Math.min(14 * f, fw * .05), cw = Math.min(fw * .62, Math.max(title.length * tf * .56, fam.length * fs * 1.1 * .55, 60 * f) + 14 * f), ch = tf * 1.4 + fs * 4.2;
            m += `<g class="cpo-cartouche"><rect x="${r1(5 * f)}" y="${r1(5 * f)}" width="${r1(cw)}" height="${r1(ch)}" fill="${st.paper}" fill-opacity=".93" stroke="${st.ink}" stroke-width="${r1(.7 * f)}"/><rect x="${r1(6.6 * f)}" y="${r1(6.6 * f)}" width="${r1(cw - 3.2 * f)}" height="${r1(ch - 3.2 * f)}" fill="none" stroke="${st.ink}" stroke-width="${r1(.25 * f)}"/>
                <text x="${r1(5 * f + cw / 2)}" y="${r1(5 * f + tf * 1.25)}" font-size="${r1(tf)}" text-anchor="middle" font-weight="700" fill="${st.ink}" ${ff}${ital}>${esc(title)}</text>
                <line x1="${r1(5 * f + cw * .25)}" x2="${r1(5 * f + cw * .75)}" y1="${r1(5 * f + tf * 1.6)}" y2="${r1(5 * f + tf * 1.6)}" stroke="${st.ink}" stroke-width="${r1(.3 * f)}"/>
                <text x="${r1(5 * f + cw / 2)}" y="${r1(5 * f + tf * 1.6 + fs * 1.6)}" font-size="${r1(fs * 1.1)}" text-anchor="middle" fill="${st.ink}" ${ff}${ital}>${esc(fam)}</text>
                ${dates ? `<text x="${r1(5 * f + cw / 2)}" y="${r1(5 * f + tf * 1.6 + fs * 3.1)}" font-size="${r1(fs)}" text-anchor="middle" fill="${st.ink}" ${ff}>${esc(dates)}</text>` : ''}</g>`;
        }
        m += '</g>';
        // cadre extérieur et mention des sources
        const frame = `<rect x="${r1(M * .45)}" y="${r1(M * .45)}" width="${r1(W - M * .9)}" height="${r1(H - M * .9)}" fill="none" stroke="${st.ink}" stroke-width="${r1(1.1 * f)}"/><rect x="${r1(M * .62)}" y="${r1(M * .62)}" width="${r1(W - M * 1.24)}" height="${r1(H - M * 1.24)}" fill="none" stroke="${st.ink}" stroke-width="${r1(.3 * f)}"/>`;
        const attr = `<text x="${r1(W - M)}" y="${r1(H - M * .62 - 1.2 * f)}" font-size="${r1(fs * .62)}" text-anchor="end" fill="${st.ink}" fill-opacity=".75" ${ff}>${esc(i18n('Fond : {src}', {src: i18n(bl.attr || 'Natural Earth')}))} · LCNDA</text>`;
        const vig = st.vignette ? `<rect width="${W}" height="${H}" fill="url(#cpov)" pointer-events="none"/>` : '';
        return {svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" class="cpo-poster-svg" data-cpo-places="${placed.length}">${g}${m}${frame}${attr}${vig}</svg>`, W, H, count: placed.length};
    }
    async function rasterize(svg, w, h, type = 'image/png', quality = .92) {
        const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
        try {
            const im = new Image(); im.decoding = 'async';
            await new Promise((ok, ko) => { im.onload = ok; im.onerror = () => ko(new Error(i18n('dessin impossible'))); im.src = url; });
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
            const blob = await new Promise(r => c.toBlob(r, type, quality)); if (!blob) throw new Error(i18n('image trop grande pour ce navigateur'));
            return blob;
        } finally { URL.revokeObjectURL(url); }
    }
    /** un PDF d'une page à la taille exacte de l'affiche (points PDF), avec l'image JPEG en pleine page */
    async function jpegPdf(jpegBlob, wmm, hmm, title) {
        const img = new Uint8Array(await jpegBlob.arrayBuffer()), bmp = await createImageBitmap(jpegBlob);
        const PW = r1(wmm / 25.4 * 72), PH = r1(hmm / 25.4 * 72), enc = new TextEncoder(), parts = [], offs = []; let len = 0;
        const push = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
        const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`, safeTitle = String(title || 'Carte').replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '');
        push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
        const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
        obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${bmp.width} /Height ${bmp.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
        obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
        obj(6, () => push(`<< /Title (${safeTitle}) /Producer (LCNDA) >>`));
        const xref = len;
        push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(parts, {type: 'application/pdf'});
    }
    async function openPoster(pre = {}) {
        const o = {...posterOpts(), ...pre};
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-xl cpo-poster-dlg';
        const radios = (key, list) => `<div class="segmented cpo-seg" role="radiogroup">${list.map(([v, l]) => `<button type="button" role="radio" data-cpo-o="${key}" data-v="${esc(v)}" class="${String(o[key]) === String(v) ? 'is-active' : ''}" aria-checked="${String(o[key]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
        const check = (k, l) => `<label class="checkbox-line"><input type="checkbox" data-cpo-c="${k}"${o[k] ? ' checked' : ''}> ${esc(l)}</label>`;
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">CARTE · À IMPRIMER</span><h2>🖼 Grande carte à imprimer</h2></div><button type="button" class="icon-button" data-cpo-x aria-label="Fermer">×</button></div>
            <div class="cpo-poster-body"><div class="cpo-poster-side">
                <h4>Format</h4>${radios('paper', [['A3', 'A3'], ['A2', 'A2'], ['A1', 'A1'], ['A0', 'A0']])}${radios('orientation', [['portrait', 'Portrait'], ['landscape', 'Paysage']])}
                <h4>Style</h4><div class="cpo-styles" role="radiogroup">${Object.entries(STYLES).map(([k, s]) => `<button type="button" role="radio" class="cpo-style ${o.style === k ? 'is-active' : ''}" data-cpo-o="style" data-v="${k}" aria-checked="${o.style === k}"><i style="background:${s.paper};border-color:${s.ink}"><b style="background:${s.land}"></b><u style="background:${s.m}"></u></i>${esc(s.name)}</button>`).join('')}</div>
                <h4>Cadrage</h4>${radios('frame', Object.entries(FRAMES).map(([k, [l]]) => [k, l]))}
                <h4>Cartouche</h4><label class="cpo-in">Titre <input data-cpo-t="title" value="${esc(o.title)}" placeholder="Les BORIE" maxlength="80"></label><label class="cpo-in">Famille <input data-cpo-t="family" value="${esc(o.family)}" placeholder="Les lieux de la famille" maxlength="120"></label><label class="cpo-in">Dates <input data-cpo-t="dates" value="${esc(o.dates)}" placeholder="1828 – 2010" maxlength="40"></label>
                <h4>Ce qu’on met dessus</h4>${check('b', '● Lieux de naissance')}${check('m', '◆ Lieux de mariage')}${check('d', '✝ Lieux de décès')}${check('moves', '➜ Migrations (naissance → décès)')}${check('labels', 'Noms des lieux')}${check('photos', '👤 Portraits en médaillon')}
                <span class="pk-lab">Une branche (ses ancêtres seulement)</span>${P().pickerField({name: 'cp_branch', kind: 'person', placeholder: 'Toute la famille'})}
                <h4>Habillage</h4>${check('cartouche', 'Cartouche (titre, famille, dates)')}${check('legend', 'Légende')}${check('compass', 'Rose des vents')}${check('scale', 'Échelle')}
                <p class="ui-hint">Jamais de personne vivante ni de fiche confidentielle sur cette carte. Le fond est dessiné par l’app (Natural Earth, IGN), sans tuiles d’Internet : il reste net à toutes les tailles.</p>
            </div><div class="cpo-poster-prev"><div class="cpo-poster-stage" data-cpo-prev>${UI().spinner(i18n('Je dessine la carte…'))}</div><small class="cpo-poster-info" data-cpo-info></small></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-cpo-x>Fermer</button><button type="button" class="button secondary" data-cpo-print>🖨 Imprimer</button><button type="submit" class="button" data-cpo-export>⤓ Exporter…</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s);
        let data = null, cur = null, seq = 0;
        const imgs = new Map();
        const load = async () => {
            data = await get('places', {branch: o.branch || '', photos: 12});
            await Promise.all((data.photos || []).map(async ph => { const d = await photoData(ph.url); if (d) imgs.set(ph.url, d); }));
        };
        const draw = async () => {
            const my = ++seq; lsSet(POSTER_KEY, {...o, branch: null});
            try {
                if (!data) await load();
                const r = await posterSvg(data, o, imgs); if (my !== seq) return;
                cur = r; $('[data-cpo-prev]').innerHTML = r.svg;
                const px = C().posterPixels(o.paper, o.orientation, 300);
                $('[data-cpo-info]').textContent = `${o.paper} ${o.orientation === 'landscape' ? i18n('paysage') : i18n('portrait')} · ${r.W} × ${r.H} mm · ${pl(r.count, 'lieu')}${data.hidden ? ` · ${i18n(data.hidden > 1 ? '{n} laissées de côté' : '{n} laissée de côté', {n: pl(data.hidden, 'personne vivante ou confidentielle', 'personnes vivantes ou confidentielles')})}` : ''} · ${i18n('image : jusqu’à {w} × {h} px ({dpi} ppp)', {w: px.w, h: px.h, dpi: px.dpi})}`;
                if (!r.count) $('[data-cpo-prev]').insertAdjacentHTML('afterbegin', UI().notice('info', 'Aucun lieu placé sur la carte pour ces choix : place les lieux de la famille (fiche du lieu → position) ou coche d’autres événements.'));
            } catch (e) { if (my === seq) $('[data-cpo-prev]').innerHTML = UI().notice('error', e.message); }
        };
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-cpo-x]')) { dlg.close(); return; }
            const b = e.target.closest('[data-cpo-o]'); if (!b) return;
            o[b.dataset.cpoO] = b.dataset.v;
            b.parentElement.querySelectorAll('[data-cpo-o]').forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', on); });
            draw();
        });
        dlg.addEventListener('change', e => { const c = e.target.closest('[data-cpo-c]'); if (c) { o[c.dataset.cpoC] = c.checked; draw(); } });
        let tt = 0; dlg.addEventListener('input', e => { const t = e.target.closest('[data-cpo-t]'); if (t) { o[t.dataset.cpoT] = t.value.slice(0, 120); clearTimeout(tt); tt = setTimeout(draw, 250); } });
        dlg.addEventListener('picker-change', e => { if (e.detail.name !== 'cp_branch') return; o.branch = Number(e.detail.value) || null; data = null; draw(); });
        const name = () => (o.title || 'grande-carte').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'grande-carte';
        const print = () => { if (!cur) return; UI().openPrintDialog?.({title: o.title || 'Grande carte', key: 'grande-carte', paper: 'custom', size: [Math.min(cur.W, cur.H), Math.max(cur.W, cur.H)], orientation: o.orientation, keepFormat: true, margin: 0,
            html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title || 'Grande carte')}</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body data-k-page>${cur.svg}</body></html>`}); };
        $('[data-cpo-print]').addEventListener('click', print);
        $('form').addEventListener('submit', async e => {
            e.preventDefault(); if (!cur) return;
            const mm = [cur.W, cur.H];
            const raster = async (q, type) => { const px = C().posterPixels(o.paper, o.orientation, q); if (px.reduced) toast(i18n('Qualité ramenée à {dpi} ppp (taille de l’affiche, mémoire du navigateur).', {dpi: px.dpi})); return rasterize(cur.svg, px.w, px.h, type, .9); };
            const copy = async (blob, fname, opt) => { if (opt.saveCopy && A().importMediaFile) { try { await A().importMediaFile(new File([blob], fname, {type: blob.type}), ['image']); toast(i18n('Une copie est rangée dans les médias.')); } catch (err) { toast(err.message, 'error'); } } };
            await UI().openExportDialog({title: o.title || 'Grande carte', defaultName: name(), quality: 300, saveCopy: !!A().importMediaFile, info: `${o.paper} · ${cur.W} × ${cur.H} mm`,
                preview: () => { const d = document.createElement('div'); d.className = 'cpo-export-prev'; d.innerHTML = cur.svg; return d; },
                formats: [{id: 'pdf', hint: i18n('{paper}, prêt pour l’imprimeur', {paper: o.paper}), run: async x => { const b = await raster(x.quality, 'image/jpeg'); const pdf = await jpegPdf(b, mm[0], mm[1], o.title); download(pdf, x.filename); }},
                    {id: 'png', hint: i18n('haute définition'), run: async x => { const b = await raster(x.quality, 'image/png'); download(b, x.filename); await copy(b, x.filename, x); }},
                    {id: 'jpg', run: async x => { const b = await raster(x.quality, 'image/jpeg'); download(b, x.filename); await copy(b, x.filename, x); }},
                    {id: 'svg', hint: 'net à toutes les tailles', run: async x => { download(new Blob([cur.svg], {type: 'image/svg+xml'}), x.filename); }},
                    {id: 'print', quality: false, run: async () => { setTimeout(print, 50); }}]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        await draw();
        return dlg;
    }

    /* ═════════════════════ 3. ⛰ Relief 3D ═════════════════════ */
    let THREE = null; const three = async () => (THREE ??= await import('../vendor/three.module.js'));
    const RELIEF_KEY = 'genealogie-relief-3d';
    function altColor(t, isSea) {
        if (isSea) return [.62, .77, .88];
        const stops = [[0, [.36, .58, .32]], [.25, [.62, .72, .40]], [.5, [.84, .78, .52]], [.75, [.62, .48, .34]], [.92, [.85, .85, .85]], [1, [1, 1, 1]]];
        for (let i = 0; i < stops.length - 1; i++) if (t <= stops[i + 1][0]) { const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0] || 1); return stops[i][1].map((v, k) => v + (stops[i + 1][1][k] - v) * f); }
        return stops[stops.length - 1][1];
    }
    async function openRelief(pre = {}) {
        const keep = lsGet(RELIEF_KEY, {});
        const o = {radius: Number(keep.radius) || 40, exag: Number(keep.exag) || 3, pins: keep.pins !== false, ...pre};
        let places = [];
        try { places = (await get('places', {photos: 0})).places || []; } catch (_) { /* sans les lieux, le relief reste possible */ }
        const center = pre.center || (places.length ? places.slice().sort((p, q) => q.n - p.n)[0] : null);
        const body = `<div class="cpo-relief" data-cpo-relief><div class="cpo-relief-side">
                <span class="pk-lab">Au centre</span>${P().pickerField({name: 'cp_center', kind: 'place', value: center ? {id: center.id, title: center.name, lat: center.lat, lon: center.lon} : null})}
                <div data-cpo-r-radius></div><div data-cpo-r-exag></div>
                ${UI().toggleHtml ? UI().toggleHtml(i18n('📍 Lieux de la famille en épingles'), {checked: o.pins, attrs: 'data-cpo-pins'}) : ''}
                <p class="ui-hint">Glisse pour tourner, molette pour zoomer. Au clavier : ← → pour tourner, ↑ ↓ pour pencher, + et − pour zoomer, 0 pour revenir.</p>
                <div data-cpo-r-info aria-live="polite"></div></div>
            <div class="cpo-relief-view" tabindex="0" role="img" aria-label="${esc(i18n('Relief en 3D'))}" data-cpo-r-view><div class="cpo-relief-labels" data-cpo-r-labels></div></div></div>`;
        const dlg = ext.openDialog({eyebrow: 'CARTE · RELIEF', title: '⛰ Relief 3D', wide: true, submitLabel: 'Fermer', body, onSubmit: () => true});
        dlg.classList.add('cpo-relief-dlg');
        const $ = s => dlg.querySelector(s);
        const radius = UI().rangeField({label: i18n('Rayon'), min: 5, max: 150, step: 5, value: o.radius, unit: 'km', default: 40});
        const exag = UI().rangeField({label: i18n('Exagération du relief'), min: 1, max: 10, step: .5, value: o.exag, unit: '×', default: 3});
        $('[data-cpo-r-radius]').appendChild(radius); $('[data-cpo-r-exag]').appendChild(exag);
        const view = $('[data-cpo-r-view]'), info = $('[data-cpo-r-info]'), labelsEl = $('[data-cpo-r-labels]');
        let R = null; // le dessin 3D en cours : {renderer, scene, camera, mesh, pins, grid, draw()}
        const stop = () => { if (!R) return; cancelAnimationFrame(R.raf); R.renderer.dispose(); R.mesh?.geometry.dispose(); R.renderer.forceContextLoss?.(); R.renderer.domElement.remove(); R = null; };
        dlg.addEventListener('close', stop);
        const save = () => lsSet(RELIEF_KEY, {radius: Number(radius.input.value), exag: Number(exag.input.value), pins: !!$('[data-cpo-pins]')?.checked});
        async function build() {
            const it = pkItem(dlg.querySelector('[data-pk-opts*="cp_center"]'));
            if (!it || !isF(Number(it.lat))) { stop(); info.innerHTML = A().empty('Choisis le lieu du centre (un lieu placé sur la carte)', {icon: '⛰'}); return; }
            const rk = Number(radius.input.value) || 40, lat = Number(it.lat), lon = Number(it.lon), dLat = rk / 110.57, dLon = rk / (111.32 * Math.cos(lat * Math.PI / 180));
            info.innerHTML = UI().spinner(i18n('Je lis les altitudes…'));
            let g;
            try { g = await get('relief', {s: (lat - dLat).toFixed(4), w: (lon - dLon).toFixed(4), n: (lat + dLat).toFixed(4), e: (lon + dLon).toFixed(4), size: 140}); }
            catch (e) { info.innerHTML = UI().notice('error', e.message); return; }
            if (!g.installed) { stop(); info.innerHTML = UI().notice('info', i18n('La carte du relief n’est pas installée : elle vient avec la Météo d’autrefois (Réglages → 🌦 Météo d’autrefois).')); return; }
            if (!g.covered) { stop(); info.innerHTML = UI().notice('info', g.countries?.length ? i18n('Pas d’altitude pour cette zone : la carte du relief couvre {n} pays ({list}).', {n: g.countries.length, list: g.countries.join(', ')}) : i18n('Pas d’altitude pour cette zone : la carte du relief couvre seulement quelques pays.')); return; }
            await draw3d(g, it);
            const inside = places.filter(p => p.lat <= g.n && p.lat >= g.s && p.lon >= g.w && p.lon <= g.e);
            info.innerHTML = `<p><b>${esc(placeName(it))}</b> · ${esc(i18n('{km} de côté', {km: kmT(rk * 2)}))}</p><p>${esc(i18n('Altitudes : {min} m à {max} m', {min: g.min, max: g.max}))}${g.covered < .98 ? ` · ${esc(i18n('{pct} % sans altitude (mer ou hors de la carte)', {pct: Math.round((1 - g.covered) * 100)}))}` : ''}</p><p>${esc(i18n('{n} dans la zone', {n: pl(inside.length, 'lieu de la famille', 'lieux de la famille')}))}</p><p class="ui-hint">${esc(i18n('Altitudes : Copernicus DEM GLO-90 (grille de 30″), © DLR / Airbus, Copernicus.'))}</p>`;
        }
        async function draw3d(g, centerItem) {
            let T; try { T = await three(); } catch (e) { info.innerHTML = UI().notice('error', i18n('Le moteur 3D ne se charge pas.')); return; }
            stop();
            let renderer;
            try { renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); } catch (_) { info.innerHTML = UI().notice('warn', i18n('Ce navigateur ne sait pas dessiner en 3D (WebGL éteint).')); return; }
            const wv = view.clientWidth || 640, hv = view.clientHeight || 420;
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(wv, hv); view.prepend(renderer.domElement);
            const dark = document.documentElement.dataset.theme === 'dark';
            const scene = new T.Scene(); scene.background = new T.Color(dark ? 0x1d232c : 0xe9f1f8);
            const camera = new T.PerspectiveCamera(42, wv / hv, .1, 5000);
            scene.add(new T.HemisphereLight(0xffffff, 0x445566, 1.2)); const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-1, 2, 1); scene.add(sun);
            const latc = (g.s + g.n) / 2, Wk = (g.e - g.w) * 111.32 * Math.cos(latc * Math.PI / 180), Hk = (g.n - g.s) * 110.57;
            const ex = Number(exag.input.value) || 3, lo = Math.min(0, g.min ?? 0), span = Math.max(1, (g.max ?? 1) - lo);
            const geo = new T.PlaneGeometry(Wk, Hk, g.cols - 1, g.rows - 1); geo.rotateX(-Math.PI / 2);
            const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
            const hAt = k => { const v = g.z[k]; return v == null ? lo : v; };
            for (let k = 0; k < pos.count; k++) { const a = hAt(k); pos.setY(k, (a - lo) / 1000 * ex); const c = altColor((a - lo) / span, g.z[k] == null); cols.set(c, k * 3); }
            geo.setAttribute('color', new T.BufferAttribute(cols, 3)); geo.computeVertexNormals();
            const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({vertexColors: true, side: T.DoubleSide})); scene.add(mesh);
            // les épingles : une tige et une tête, posées sur le sol (altitude lue dans la grille)
            const groundAt = (lat, lon) => { const fx = (lon - g.w) / (g.e - g.w) * (g.cols - 1), fy = (g.n - lat) / (g.n - g.s) * (g.rows - 1); const j = Math.max(0, Math.min(g.cols - 1, Math.round(fx))), i = Math.max(0, Math.min(g.rows - 1, Math.round(fy))); return (hAt(i * g.cols + j) - lo) / 1000 * ex; };
            const toXZ = (lat, lon) => [((lon - g.w) / (g.e - g.w) - .5) * Wk, ((g.n - lat) / (g.n - g.s) - .5) * Hk];
            const pins = [], pinH = Math.max(Wk, Hk) * .06;
            if ($('[data-cpo-pins]')?.checked !== false) {
                const list = places.filter(p => p.lat <= g.n && p.lat >= g.s && p.lon >= g.w && p.lon <= g.e).slice(0, 60);
                if (!list.some(p => Number(p.id) === Number(centerItem.id)) && isF(Number(centerItem.lat))) list.unshift({id: centerItem.id, name: placeName(centerItem), lat: Number(centerItem.lat), lon: Number(centerItem.lon), n: 0});
                list.forEach(p => {
                    const [x, z] = toXZ(p.lat, p.lon), y = groundAt(p.lat, p.lon);
                    const stick = new T.Mesh(new T.CylinderGeometry(pinH * .02, pinH * .02, pinH, 6), new T.MeshLambertMaterial({color: 0x333333})); stick.position.set(x, y + pinH / 2, z); scene.add(stick);
                    const head = new T.Mesh(new T.SphereGeometry(pinH * .12, 14, 10), new T.MeshLambertMaterial({color: p.n ? 0xd9480f : 0x055dff})); head.position.set(x, y + pinH, z); scene.add(head);
                    pins.push({p, at: new T.Vector3(x, y + pinH * 1.15, z)});
                });
            }
            labelsEl.innerHTML = pins.map((q, i) => `<span class="cpo-pin-label" data-i="${i}">${esc(q.p.name)}</span>`).join('');
            const cam = {theta: .6, phi: .95, dist: Math.max(Wk, Hk) * 1.25};
            const place = () => { const c = cam; camera.position.set(c.dist * Math.sin(c.phi) * Math.sin(c.theta), c.dist * Math.cos(c.phi), c.dist * Math.sin(c.phi) * Math.cos(c.theta)); camera.lookAt(0, 0, 0); };
            const v3 = new T.Vector3();
            const render = () => {
                place(); renderer.render(scene, camera);
                const w = view.clientWidth, h = view.clientHeight;
                labelsEl.querySelectorAll('.cpo-pin-label').forEach(el => { const q = pins[Number(el.dataset.i)]; v3.copy(q.at).project(camera); const on = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; el.hidden = !on; if (on) el.style.transform = `translate(${Math.round((v3.x + 1) / 2 * w)}px, ${Math.round((1 - v3.y) / 2 * h)}px)`; });
            };
            R = {renderer, scene, camera, mesh, raf: 0, cam, g, render, ask: () => { cancelAnimationFrame(R.raf); R.raf = requestAnimationFrame(render); }};
            render();
        }
        // souris, molette, clavier, redimensionnement
        let drag = null;
        view.addEventListener('pointerdown', e => { if (!R) return; drag = {x: e.clientX, y: e.clientY, t: R.cam.theta, p: R.cam.phi}; view.setPointerCapture(e.pointerId); });
        view.addEventListener('pointermove', e => { if (!drag || !R) return; R.cam.theta = drag.t - (e.clientX - drag.x) * .008; R.cam.phi = Math.max(.12, Math.min(1.5, drag.p - (e.clientY - drag.y) * .006)); R.ask(); });
        view.addEventListener('pointerup', () => { drag = null; });
        view.addEventListener('wheel', e => { if (!R) return; e.preventDefault(); R.cam.dist = Math.max(2, Math.min(4000, R.cam.dist * (e.deltaY > 0 ? 1.12 : .89))); R.ask(); }, {passive: false});
        view.addEventListener('keydown', e => {
            if (!R) return; const c = R.cam; let used = true;
            if (e.key === 'ArrowLeft') c.theta += .12; else if (e.key === 'ArrowRight') c.theta -= .12; else if (e.key === 'ArrowUp') c.phi = Math.max(.12, c.phi - .08); else if (e.key === 'ArrowDown') c.phi = Math.min(1.5, c.phi + .08);
            else if (e.key === '+' || e.key === '=') c.dist = Math.max(2, c.dist * .88); else if (e.key === '-' || e.key === '_') c.dist = Math.min(4000, c.dist * 1.14); else if (e.key === '0') { c.theta = .6; c.phi = .95; } else used = false;
            if (used) { e.preventDefault(); e.stopPropagation(); R.ask(); }
        });
        const ro = new ResizeObserver(() => { if (!R) return; const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; R.renderer.setSize(w, h); R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); R.ask(); });
        ro.observe(view); dlg.addEventListener('close', () => ro.disconnect());
        let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => { save(); build(); }, 250); };
        radius.input.addEventListener('change', later); exag.input.addEventListener('change', later);
        dlg.addEventListener('change', e => { if (e.target.closest('[data-cpo-pins]')) later(); });
        dlg.addEventListener('picker-change', e => { if (e.detail.name === 'cp_center') later(); });
        // ⤓ une image du relief tel qu'on le voit
        dlg.querySelector('.modal-actions .spacer')?.insertAdjacentHTML('afterend', '<button type="button" class="button secondary" data-cpo-r-png>⤓ Exporter en PNG</button>');
        $('[data-cpo-r-png]')?.addEventListener('click', () => { if (!R) return; R.render(); R.renderer.domElement.toBlob(b => b && download(b, 'relief-3d.png'), 'image/png'); });
        await build();
        ext.cartesOutils.reliefState = () => (R ? {rows: R.g.rows, cols: R.g.cols, pins: labelsEl.children.length} : null);
        return dlg;
    }

    /* ═════════════════════ 4. ✏️ Mes couches ═════════════════════ */
    const L = {list: null, open: !!lsGet('lcnda-cartes-couches', false), cur: 0, tool: '', draft: [], last: null, pop: null};
    const TOOLS = [['point', '📍', 'Point'], ['note', '📝', 'Note'], ['route', '〰', 'Itinéraire'], ['zone', '⬠', 'Zone']];
    async function loadLayers(force = false) { if (L.list && !force) return L.list; try { L.list = (await get('layers')).layers || []; } catch (_) { L.list = L.list || []; } return L.list; }
    const layerById = id => (L.list || []).find(l => Number(l.id) === Number(id));
    const clone = v => JSON.parse(JSON.stringify(v));
    async function saveLayer(layer) {
        const r = await post('layer_save', {id: layer.id || 0, name: layer.name, color: layer.color, visible: layer.visible !== false, features: layer.features || []});
        const saved = r.layer || r.result?.layer; const i = (L.list || []).findIndex(l => Number(l.id) === Number(saved.id));
        if (i >= 0) L.list[i] = saved; else (L.list = L.list || []).push(saved);
        return saved;
    }
    /** un changement d'une couche avec « ↶ Annuler » (H7) : before / after sont deux états complets de la couche */
    async function changeLayer(id, mutate, message) {
        const l = layerById(id); if (!l) return;
        const before = clone(l), after = clone(l); mutate(after);
        try { await saveLayer(after); } catch (e) { toast(e.message, 'error'); return; }
        redraw();
        A()?.undoToast?.(message, {undo: async () => { await saveLayer(before); redraw(); }, redo: async () => { await saveLayer(after); redraw(); }});
    }
    async function newLayer(name) {
        const used = (L.list || []).map(l => l.name), colors = ['#d9480f', '#2b8a3e', '#1971c2', '#9c36b5', '#e8590c', '#0b7285', '#c2255c'];
        const base = i18n('Ma couche'), nm = name || (UI().freeName ? (used.includes(base) ? UI().freeName(base, used) : base) : base);
        const l = await saveLayer({name: nm, color: colors[(L.list || []).length % colors.length], visible: true, features: []});
        L.cur = l.id; return l;
    }
    const stage = () => document.getElementById('map-stage');
    const toScreen = (lon, lat) => { const l = L.last; return l ? [A().lngToX(lon, l.z) - l.left, A().latToY(lat, l.z) - l.top] : [NaN, NaN]; };
    const toLonLat = (x, y) => { const l = L.last; return [A().xToLng(l.left + x, l.z), A().yToLat(l.top + y, l.z)]; };
    function featureSvg(f, color, li, fi) {
        const g = f.geometry, c = f.properties.color || color, nm = esc(f.properties.name), at = `data-cpo-f="${li}:${fi}"`;
        if (g.type === 'Point') {
            const [x, y] = toScreen(g.coordinates[0], g.coordinates[1]); if (!isF(x)) return '';
            const label = nm ? `<text x="${r1(x + 11)}" y="${r1(y + 4)}" class="cpo-f-label">${nm}</text>` : '';
            return f.properties.kind === 'note' ? `<g class="cpo-f is-note" ${at}><rect x="${r1(x - 9)}" y="${r1(y - 9)}" width="18" height="18" rx="3" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${r1(x)}" y="${r1(y + 4)}" text-anchor="middle" font-size="11" fill="#fff">✎</text>${label}<title>${nm}${f.properties.note ? ' — ' + esc(f.properties.note) : ''}</title></g>`
                : `<g class="cpo-f" ${at}><circle cx="${r1(x)}" cy="${r1(y)}" r="7" fill="${c}" stroke="#fff" stroke-width="2.5"/>${label}<title>${nm}</title></g>`;
        }
        const ring = g.type === 'LineString' ? g.coordinates : g.coordinates[0];
        const d = ring.map(([lo, la], i) => { const [x, y] = toScreen(lo, la); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('') + (g.type === 'Polygon' ? 'Z' : '');
        return g.type === 'Polygon' ? `<path class="cpo-f is-zone" ${at} d="${d}" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"><title>${nm}</title></path>`
            : `<path class="cpo-f is-route" ${at} d="${d}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><title>${nm}</title></path>`;
    }
    function redraw() {
        const svg = document.getElementById('cpo-layers'); if (!svg || !L.last) return;
        const {width, height} = L.last; svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        let s = '';
        (L.list || []).forEach((l, li) => { if (l.visible === false) return; (l.features || []).forEach((f, fi) => { s += featureSvg(f, l.color, li, fi); }); });
        if (L.tool && L.draft.length) {
            const cur = layerById(L.cur), c = cur?.color || '#d9480f';
            const d = L.draft.map(([lo, la], i) => { const [x, y] = toScreen(lo, la); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('');
            s += `<path class="cpo-draft" d="${d}${L.tool === 'zone' && L.draft.length > 2 ? 'Z' : ''}" fill="${L.tool === 'zone' ? c : 'none'}" fill-opacity=".15" stroke="${c}" stroke-width="3" stroke-dasharray="7 5"/>` + L.draft.map(([lo, la]) => { const [x, y] = toScreen(lo, la); return `<circle class="cpo-draft" cx="${r1(x)}" cy="${r1(y)}" r="4.5" fill="#fff" stroke="${c}" stroke-width="2"/>`; }).join('');
        }
        svg.innerHTML = s;
        svg.classList.toggle('is-drawing', !!L.tool);
        panelFill();
    }
    function panelFill() {
        const box = document.getElementById('cpo-panel'); if (!box) return;
        box.hidden = !L.open;
        const ro = readOnly(), list = L.list || [];
        if (!L.cur || !layerById(L.cur)) L.cur = list[0]?.id || 0;
        const hint = L.tool ? (L.tool === 'point' || L.tool === 'note' ? i18n('Clique sur la carte pour poser le point. Échap pour arrêter.') : `${i18n('Clique point par point.')} ${L.draft.length ? `${pl(L.draft.length, 'point')} · ` : ''}${i18n('Entrée ou double-clic pour finir, ⌫ pour retirer le dernier, Échap pour arrêter.')}`) : '';
        box.innerHTML = `<div class="cpo-panel-head"><b>✏️ Mes couches</b><button type="button" class="icon-button small" data-cpo-close aria-label="Fermer">×</button></div>
            ${list.length ? `<ul class="cpo-layer-list">${list.map(l => `<li class="cpo-layer ${Number(l.id) === Number(L.cur) ? 'is-cur' : ''}" data-cpo-layer="${l.id}">
                <label class="ui-toggle" title="Montrer ou cacher"><input type="checkbox" data-cpo-vis="${l.id}"${l.visible !== false ? ' checked' : ''}><i></i></label>
                <button type="button" class="cpo-swatch" data-cpo-color="${l.id}" style="background:${esc(l.color)}" aria-label="Couleur de la couche" ${ro ? 'disabled' : ''}></button>
                <button type="button" class="cpo-layer-name" data-cpo-pick="${l.id}" title="Dessiner dans cette couche">${esc(l.name)} <small>${(l.features || []).length}</small></button>
                <button type="button" class="icon-button small" data-cpo-more="${l.id}" aria-label="Plus d’actions">⋯</button></li>`).join('')}</ul>` : A().empty('Aucune couche pour l’instant', {icon: '✏️'})}
            ${ro ? '' : `<div class="cpo-tools" role="toolbar" aria-label="Dessiner">${TOOLS.map(([k, ic, lab]) => `<button type="button" class="button small ${L.tool === k ? '' : 'secondary'}" data-cpo-tool="${k}" aria-pressed="${L.tool === k}">${ic} ${esc(i18n(lab))}</button>`).join('')}</div>
            ${L.tool && (L.tool === 'route' || L.tool === 'zone') ? `<div class="cpo-draw-act"><button type="button" class="button small" data-cpo-finish ${L.draft.length < (L.tool === 'zone' ? 3 : 2) ? 'disabled' : ''}>✓ Terminer</button><button type="button" class="button small secondary" data-cpo-cancel>Annuler</button></div>` : ''}
            ${hint ? `<p class="ui-hint">${esc(hint)}</p>` : ''}
            <div class="cpo-panel-foot"><button type="button" class="button small secondary" data-cpo-new>＋ Nouvelle couche</button><button type="button" class="button small secondary" data-cpo-import>⤒ Importer…</button>${list.length ? '<button type="button" class="button small secondary" data-cpo-exportall>⤓ Exporter ▾</button>' : ''}</div>`}`;
    }
    function exportLayers(layers, fmt) {
        const base = (layers.length === 1 ? layers[0].name : 'mes-couches').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'couches';
        if (fmt === 'kml') download(new Blob([C().toKML(layers)], {type: 'application/vnd.google-earth.kml+xml'}), base + '.kml');
        else download(new Blob([JSON.stringify(C().toGeoJSON(layers), null, 1)], {type: 'application/geo+json'}), base + '.geojson');
    }
    function importLayers() {
        UI().openImportDialog?.({title: 'Importer des couches', accept: '.geojson,.json,.kml', what: 'GeoJSON ou KML',
            analyze: async files => {
                const text = await files[0].text(); const layers = C().readLayersFile(files[0].name, text);
                const n = layers.reduce((s, l) => s + l.features.length, 0);
                return {ok: n > 0, count: n, data: layers, summary: n ? `${pl(layers.length, 'couche')} · ${pl(n, 'forme')} (${layers.map(l => esc(l.name)).join(', ')})` : i18n('Aucune forme lisible dans ce fichier.')};
            },
            run: async an => {
                const made = []; for (const l of an.data) made.push(await saveLayer(l));
                L.open = true; lsSet('lcnda-cartes-couches', true); L.cur = made[0]?.id || L.cur; redraw(); fitTo(made);
                return {message: `${pl(made.length, 'couche importée', 'couches importées')}`, undo: async () => { for (const l of made) await post('layer_delete', {id: l.id}); await loadLayers(true); redraw(); }};
            }});
    }
    function fitTo(layers) {
        const b = C().bounds(layers.flatMap(l => l.features || [])); if (!b || !S().mapCenter) return;
        S().mapCenter = {lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2};
        const st = stage(), w = st?.clientWidth || 800, h = st?.clientHeight || 500;
        for (let z = 15; z >= 3; z--) { if (Math.abs(A().lngToX(b[2], z) - A().lngToX(b[0], z)) < w - 120 && Math.abs(A().latToY(b[1], z) - A().latToY(b[3], z)) < h - 120) { S().mapZoom = z; break; } }
        A().persistUiState?.(); A().drawMap?.();
    }
    async function finishDraft() {
        const tool = L.tool, pts = L.draft.slice(); if ((tool === 'route' && pts.length < 2) || (tool === 'zone' && pts.length < 3)) return;
        L.draft = []; redraw();
        const name = await A().askText?.({title: tool === 'zone' ? i18n('⬠ Nom de la zone') : i18n('〰 Nom de l’itinéraire'), message: i18n('Facultatif.'), value: '', placeholder: tool === 'zone' ? i18n('Les terres de la famille') : i18n('Le chemin de l’école'), okLabel: i18n('Enregistrer')});
        if (name === null) { redraw(); return; }
        const f = tool === 'zone' ? {type: 'Feature', geometry: {type: 'Polygon', coordinates: [[...pts, pts[0]]]}, properties: {kind: 'zone', name: name || '', note: '', color: ''}} : {type: 'Feature', geometry: {type: 'LineString', coordinates: pts}, properties: {kind: 'route', name: name || '', note: '', color: ''}};
        await addFeature(f);
    }
    async function addFeature(f) {
        if (!layerById(L.cur)) await newLayer();
        await changeLayer(L.cur, l => { l.features.push(f); }, i18n({zone: 'Zone ajoutée à « {name} »', route: 'Itinéraire ajouté à « {name} »', note: 'Note ajoutée à « {name} »'}[f.properties.kind] || 'Point ajouté à « {name} »', {name: layerById(L.cur)?.name || i18n('Ma couche')}));
    }
    async function addPoint(lon, lat, kind) {
        const name = await A().askText?.({title: kind === 'note' ? i18n('📝 La note') : i18n('📍 Nom du point'), message: kind === 'note' ? i18n('Ce que tu veux noter à cet endroit.') : i18n('Facultatif.'), value: '', placeholder: kind === 'note' ? i18n('Ici se trouvait le moulin') : i18n('La ferme'), okLabel: i18n('Enregistrer')});
        if (name === null) return;
        const f = {type: 'Feature', geometry: {type: 'Point', coordinates: [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]}, properties: {kind, name: kind === 'note' ? (name.split('\n')[0] || '').slice(0, 60) : name, note: kind === 'note' ? name : '', color: ''}};
        await addFeature(f);
    }
    function closePop() { L.pop?.remove(); L.pop = null; }
    function featurePop(li, fi, x, y) {
        closePop(); const l = (L.list || [])[li], f = l?.features?.[fi]; if (!f) return;
        const st = stage(), pop = document.createElement('div'); pop.className = 'cpo-pop';
        const kindLab = i18n({point: '📍 Point', note: '📝 Note', route: '〰 Itinéraire', zone: '⬠ Zone'}[f.properties.kind] || '');
        const len = f.geometry.type === 'LineString' ? f.geometry.coordinates.reduce((s, c, i, a) => s + (i ? C().km({lon: a[i - 1][0], lat: a[i - 1][1]}, {lon: c[0], lat: c[1]}) : 0), 0) : null;
        pop.innerHTML = `<button type="button" class="icon-button small cpo-pop-x" aria-label="Fermer">×</button><small class="muted">${kindLab} · ${esc(l.name)}</small><b>${esc(f.properties.name || i18n('Sans nom'))}</b>${f.properties.note ? `<p>${esc(f.properties.note)}</p>` : ''}${len ? `<p class="muted">${esc(kmT(len))} · ${esc(i18n('{dur} aujourd’hui', {dur: durT(C().best(len, null, settings()))}))}</p>` : ''}
            ${readOnly() ? '' : `<div class="cpo-pop-act"><button type="button" class="button small secondary" data-cpo-fedit>✎ Modifier</button><button type="button" class="button small secondary danger" data-cpo-fdel>🗑 Supprimer</button></div>`}`;
        pop.style.left = `${Math.max(8, Math.min(st.clientWidth - 280, x + 12))}px`; pop.style.top = `${Math.max(8, Math.min(st.clientHeight - 170, y - 20))}px`;
        st.appendChild(pop); L.pop = pop;
        pop.addEventListener('pointerdown', e => e.stopPropagation());
        pop.querySelector('.cpo-pop-x').addEventListener('click', closePop);
        pop.querySelector('[data-cpo-fdel]')?.addEventListener('click', () => { closePop(); changeLayer(l.id, x2 => { x2.features.splice(fi, 1); }, i18n('« {name} » supprimé de la couche', {name: f.properties.name || kindLab})); });
        pop.querySelector('[data-cpo-fedit]')?.addEventListener('click', () => { closePop(); editFeature(l.id, fi); });
    }
    function editFeature(lid, fi) {
        const l = layerById(lid), f = l?.features?.[fi]; if (!f) return;
        const dlg = ext.openDialog({eyebrow: 'MES COUCHES', title: '✎ Modifier', submitLabel: 'Enregistrer',
            body: `<label>Nom<input name="name" maxlength="200" value="${esc(f.properties.name)}"></label><label>Note<textarea name="note" rows="4" maxlength="2000">${esc(f.properties.note)}</textarea></label><div class="cpo-color-row"><span>Couleur</span><span data-cpo-fcolor></span><small class="ui-hint">« Aucune » = la couleur de la couche</small></div>`,
            onSubmit: async form => { const name = form.elements.name.value, note = form.elements.note.value, color = cf.value || ''; await changeLayer(lid, x => { Object.assign(x.features[fi].properties, {name, note, color}); }, i18n('« {name} » modifié', {name: name || i18n('Sans nom')})); }});
        const cf = UI().colorField({name: 'color', value: f.properties.color || '', allowNone: true}); dlg.querySelector('[data-cpo-fcolor]').appendChild(cf);
    }
    function layerMenu(btn, id) {
        const l = layerById(id); if (!l) return;
        const ro = readOnly();
        UI().menuAt(btn, [
            {icon: '🎯', label: 'Cadrer sur la couche', run: () => fitTo([l])},
            ...(ro ? [] : [{icon: '✎', label: 'Renommer', run: async () => { const nm = await A().askText({title: 'Renommer la couche', value: l.name, okLabel: 'Enregistrer'}); if (nm) changeLayer(id, x => { x.name = nm.slice(0, 80); }, i18n('Couche renommée « {name} »', {name: nm.slice(0, 80)})); }}]),
            {icon: '⤓', label: 'Exporter en GeoJSON', run: () => exportLayers([l], 'geojson')},
            {icon: '⤓', label: 'Exporter en KML', run: () => exportLayers([l], 'kml')},
            ...(ro ? [] : ['-', {icon: '🗑', label: 'Supprimer la couche', danger: true, run: async () => {
                try { await post('layer_delete', {id}); } catch (e) { toast(e.message, 'error'); return; }
                L.list = L.list.filter(x => Number(x.id) !== Number(id)); redraw();
                A()?.undoToast?.(i18n('Couche « {name} » supprimée', {name: l.name}), {undo: async () => { await post('layer_restore', {id}); await loadLayers(true); redraw(); }, redo: async () => { await post('layer_delete', {id}); await loadLayers(true); redraw(); }});
            }}]),
        ], {title: l.name});
    }
    function setupLayers(stripCtl) {
        const st = stage(); if (!st) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'cpo-layers'; svg.setAttribute('class', 'cpo-layers'); svg.setAttribute('aria-hidden', 'true');
        st.insertBefore(svg, document.getElementById('map-overlay') || null);
        const panel = document.createElement('div'); panel.id = 'cpo-panel'; panel.className = 'cpo-panel'; panel.hidden = !L.open; st.appendChild(panel);
        panel.addEventListener('pointerdown', e => e.stopPropagation()); panel.addEventListener('wheel', e => e.stopPropagation());
        panel.addEventListener('change', e => { const v = e.target.closest('[data-cpo-vis]'); if (v) { const id = Number(v.dataset.cpoVis), l = layerById(id); if (!l) return; l.visible = v.checked; redraw(); if (!readOnly()) saveLayer(l).catch(err => toast(err.message, 'error')); } });
        panel.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-cpo-close]')) { toggle(false); return; }
            if (b.dataset.cpoPick) { L.cur = Number(b.dataset.cpoPick); panelFill(); return; }
            if (b.dataset.cpoMore) { layerMenu(b, Number(b.dataset.cpoMore)); return; }
            if (b.dataset.cpoColor) { const id = Number(b.dataset.cpoColor), l = layerById(id); UI().openColorBox?.(b, {get: () => l.color, set: (v, final) => { b.style.background = v; if (final && v && v !== l.color) changeLayer(id, x => { x.color = v; }, i18n('Couleur de la couche changée')); }}); return; }
            if (b.dataset.cpoTool) { L.tool = L.tool === b.dataset.cpoTool ? '' : b.dataset.cpoTool; L.draft = []; closePop(); if (L.tool && !layerById(L.cur)) { try { await newLayer(); } catch (err) { toast(err.message, 'error'); L.tool = ''; } } redraw(); st.classList.toggle('is-cpo-drawing', !!L.tool); return; }
            if (b.matches('[data-cpo-finish]')) { finishDraft(); return; }
            if (b.matches('[data-cpo-cancel]')) { L.tool = ''; L.draft = []; st.classList.remove('is-cpo-drawing'); redraw(); return; }
            if (b.matches('[data-cpo-new]')) { try { const l = await newLayer(); redraw(); A()?.undoToast?.(i18n('Couche « {name} » créée', {name: l.name}), {undo: async () => { await post('layer_delete', {id: l.id}); await loadLayers(true); redraw(); }}); } catch (err) { toast(err.message, 'error'); } return; }
            if (b.matches('[data-cpo-import]')) { importLayers(); return; }
            if (b.matches('[data-cpo-exportall]')) { UI().menuAt(b, [{icon: '⤓', label: 'Toutes en GeoJSON', run: () => exportLayers(L.list, 'geojson')}, {icon: '⤓', label: 'Toutes en KML', run: () => exportLayers(L.list, 'kml')}]); }
        });
        let down = null;
        st.addEventListener('pointerdown', e => { down = e.target.closest('button,a,input,.cpo-panel,.cpo-pop,.map-tooltip') ? null : {x: e.clientX, y: e.clientY, f: e.target.closest?.('[data-cpo-f]') || null}; });
        st.addEventListener('pointerup', e => {
            if (!down || !L.last) return; const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4, fel = down.f; down = null; if (moved) return;
            const r = st.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
            if (L.tool) { const [lon, lat] = toLonLat(x, y); if (L.tool === 'point' || L.tool === 'note') { const k = L.tool; addPoint(lon, lat, k); } else { L.draft.push([Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]); redraw(); } return; }
            const f = fel || e.target.closest?.('[data-cpo-f]'); if (f) { const [li, fi] = f.dataset.cpoF.split(':').map(Number); featurePop(li, fi, x, y); }
        });
        st.addEventListener('dblclick', e => { if (!L.tool || !['route', 'zone'].includes(L.tool)) return; e.preventDefault(); if (L.draft.length > 1) { const a = L.draft[L.draft.length - 1], b = L.draft[L.draft.length - 2]; if (Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5) L.draft.pop(); } finishDraft(); });
        loadLayers().then(redraw);
        stripCtl.querySelector('[data-cpo-layers]')?.setAttribute('aria-pressed', String(L.open));
    }
    function toggle(on) {
        L.open = on ?? !L.open; lsSet('lcnda-cartes-couches', L.open);
        if (!L.open) { L.tool = ''; L.draft = []; stage()?.classList.remove('is-cpo-drawing'); closePop(); }
        document.querySelector('[data-cpo-layers]')?.setAttribute('aria-pressed', String(L.open));
        document.querySelector('[data-cpo-layers]')?.classList.toggle('is-active', L.open);
        redraw();
    }
    document.addEventListener('keydown', e => {
        if (!L.tool || S().module !== 'carte' || document.querySelector('dialog[open]')) return;
        if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        if (e.key === 'Escape') { e.preventDefault(); L.tool = ''; L.draft = []; stage()?.classList.remove('is-cpo-drawing'); redraw(); }
        else if (e.key === 'Enter') { e.preventDefault(); finishDraft(); }
        else if (e.key === 'Backspace' && L.draft.length) { e.preventDefault(); L.draft.pop(); redraw(); }
    });

    /* ═════════ Branchement dans la Carte : « 🧭 Outils ▾ » et « ✏️ Mes couches » ═════════ */
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'); if (!strip || !C()) return;
        const ctl = document.createElement('span'); ctl.className = 'cpo-ctl';
        ctl.innerHTML = `<button type="button" class="button small secondary" data-cpo-tools aria-haspopup="menu">🧭 Outils ▾</button><button type="button" class="button small secondary${L.open ? ' is-active' : ''}" data-cpo-layers aria-pressed="${L.open}">✏️ Mes couches</button>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        ctl.querySelector('[data-cpo-tools]').addEventListener('click', e => UI().menuAt(e.currentTarget, [
            {icon: '🧭', label: 'Distances et temps de trajet…', run: () => openTravel()},
            {icon: '🖼', label: 'Grande carte à imprimer…', run: () => openPoster()},
            {icon: '⛰', label: 'Relief 3D…', run: () => openRelief()},
            {icon: '✏️', label: L.open ? 'Cacher mes couches' : 'Mes couches (dessiner)', run: () => toggle()},
        ]));
        ctl.querySelector('[data-cpo-layers]').addEventListener('click', () => toggle());
        setupLayers(ctl);
    });
    ext.mapDraw.push(({left, top, z, width, height}) => { L.last = {left, top, z, width, height}; redraw(); });

    ext.cartesOutils = {openTravel, openPoster, openRelief, posterSvg, lifeLegs, STYLES, helpers: {viewFor, baseLayers, rasterize, jpegPdf, photoData, compassSvg}, // helpers : aussi pour 🗺 Mes cartes (heritage-cartes-perso.js)
        layers: {load: loadLayers, save: saveLayer, toggle, list: () => L.list, state: L, exportLayers, importLayers}};
})();
