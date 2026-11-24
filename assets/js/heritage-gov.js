/* LCNDA — 🏰 Lieux anciens d'Allemagne et d'Europe centrale (GOV, gov.genealogy.net ; serveur : lib/gov.php).
 * Rien n'est livré avec l'app : Réglages → 🏰 Lieux anciens (GOV) → « ⤓ Installer » télécharge le pack (version « gov-donnees »).
 * Une fois installé :
 *  - page d'un lieu (Monographie de commune) : « 🏰 Ce lieu dans GOV » — ses anciens noms et à quoi il appartenait (paroisse,
 *    Kreis, province, État) l'année de ses événements ; « C'est celui-ci » quand plusieurs lieux portent ce nom (↶ Annuler) ;
 *  - fiche : sous chaque événement d'un lieu reconnu, « 🏰 en 1870 : Kirchspiel X, Kreis Y, Province de Silésie, Royaume de Prusse » ;
 *  - choix d'un lieu (menu des lieux) : « 🏰 Chercher dans les lieux anciens » ;
 *  - « Trouver un lieu ancien » : un nom allemand, polonais, tchèque… → le lieu d'aujourd'hui et ses coordonnées,
 *    « ＋ Ajouter ce lieu à ma base » (↶ Annuler), « ↗ GOV en ligne » (la source).
 * Réglages : localStorage['genealogie-gov'] ; téléchargement en cours : localStorage['genealogie-gov-dl'].
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-gov', DL_KEY = 'genealogie-gov-dl';
    const TAB = ['gov', '25o', '🏰 Lieux anciens (GOV)'];
    const DEF = {events: true, place: true, picker: true};
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; };
    const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => (A().toast ? A().toast(m, k) : null);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const SRC = () => i18n('Source : GOV – Geschichtliches Orts-Verzeichnis (gov.genealogy.net), Verein für Computergenealogie e. V., CC BY-SA');

    function register() {
        const app = A(); if (!app.defaultMaintenanceTabs) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB);
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);

    (function css() {
        if (document.getElementById('gov-css')) return;
        const st = document.createElement('style'); st.id = 'gov-css';
        st.textContent = `.gov-box{margin:10px 0;padding:10px 12px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px}
.gov-box h4{margin:0 0 6px;font-size:1em}.gov-line{margin:2px 0}.gov-muted{opacity:.72;font-size:.88em}.gov-src{margin-top:8px;font-size:.8em;opacity:.7}
.gov-names{display:flex;flex-wrap:wrap;gap:4px 12px;margin:4px 0}.gov-names span small{opacity:.7}
.gov-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}.gov-choice{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px dashed color-mix(in srgb,currentColor 18%,transparent)}
.gov-ev{margin-top:3px;font-size:.88em;opacity:.85}.gov-ev button{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer;text-align:left}.gov-ev button:hover{text-decoration:underline}
.gov-res{display:grid;gap:8px;margin-top:10px;max-height:58vh;overflow:auto}.gov-hit{padding:8px 10px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:8px}
.gov-hit b{font-size:1.02em}.gov-search-row{display:flex;gap:8px}.gov-search-row input{flex:1}.gov-chain li{margin:2px 0}.gov-year{width:6em}
.gov-set .gov-data{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.gov-prog{display:inline-block;width:160px;height:8px;border-radius:4px;background:color-mix(in srgb,currentColor 15%,transparent);overflow:hidden;vertical-align:middle}.gov-prog i{display:block;height:100%;background:#2f7d4a}
.pk-hint.gov-pk{display:flex;justify-content:flex-start}.pk-hint.gov-pk button{font:inherit;background:none;border:0;color:inherit;cursor:pointer;padding:2px 0;text-decoration:underline}`;
        (document.head || document.documentElement).appendChild(st);
    })();

    /* ═════════ Installé ? (gardé une minute) ═════════ */
    let STATUS = null, statusAt = 0;
    async function status(force = false) {
        if (!force && STATUS && Date.now() - statusAt < 60000) return STATUS;
        try { STATUS = await api('gov_status'); statusAt = Date.now(); } catch (_) { STATUS = {installed: false}; }
        return STATUS;
    }
    const forget = () => { STATUS = null; evCache.clear(); };

    /* ═════════ Morceaux d'affichage ═════════ */
    const span = n => (n.from && n.to ? i18n('{a} → {b}', {a: String(n.from), b: String(n.to)}) : n.from ? i18n('depuis {y}', {y: String(n.from)}) : n.to ? i18n('jusqu’en {y}', {y: String(n.to)}) : n.year ? i18n('attesté en {y}', {y: String(n.year)}) : '');
    const namesHtml = names => `<div class="gov-names">${(names || []).map(n => `<span>${esc(n.name)} <small>(${esc([n.lang_fr, span(n)].filter(Boolean).join(', '))})</small></span>`).join('')}</div>`;
    const chainLines = ch => {
        if (!ch) return '';
        const li = (lab, arr) => (arr && arr.length ? `<li><b>${esc(i18n(lab))}</b> : ${esc(arr.map(x => x.text).join(' → '))}</li>` : '');
        const html = li('Paroisse', ch.church) + li('État civil', ch.civil) + li('Tribunal', ch.court) + li('Administration', ch.admin);
        return html ? `<ul class="gov-chain">${html}</ul>` : `<p class="gov-muted">${esc(i18n('GOV ne dit pas à quoi il appartenait cette année-là.'))}</p>`;
    };
    const todayText = ch => (ch?.admin || []).filter(x => x.kind === 'admin' && x.level <= 3).map(x => x.name).join(', ');
    const govLink = url => `<a class="button small secondary" href="${esc(url)}" target="_blank" rel="noopener">↗ ${esc(i18n('GOV en ligne'))}</a>`;
    const srcLine = () => `<p class="gov-src">${esc(SRC())}</p>`;

    /** le contenu « Ce lieu dans GOV » d'un objet, à une année */
    function objectHtml(o, {year = null, placeId = 0, how = '', km = null} = {}) {
        const coords = o.lat != null ? `${String(o.lat).replace('.', ',')} ; ${String(o.lon).replace('.', ',')}` : '';
        return `<div class="gov-obj" data-gov-obj="${esc(o.gov)}">
            <div class="gov-line"><b>${esc(o.name)}</b>${o.type ? ` <span class="gov-muted">· ${esc(o.type)}</span>` : ''}${o.name_today && o.name_today !== o.name ? ` · ${esc(i18n('aujourd’hui'))} <b>${esc(o.name_today)}</b>` : ''}</div>
            ${how === 'near' ? `<p class="gov-muted">${esc(i18n('Trouvé par le nom et la position (à {km} km).', {km: String(km ?? 0).replace('.', ',')}))}</p>` : ''}
            <h4>${esc(i18n('Ses noms'))}</h4>${namesHtml(o.names)}
            <h4>${esc(i18n('À quoi il appartenait'))} <label class="gov-muted">${esc(i18n('en'))} <input type="number" class="gov-year" data-gov-year min="1000" max="2100" value="${year ?? ''}" placeholder="${esc(i18n('année'))}"></label></h4>
            <div data-gov-at>${o.at ? `<p class="gov-line">${esc(o.at.sentence)}</p>${chainLines(o.at)}` : `<p class="gov-muted">${esc(i18n('Choisis une année.'))}</p>`}</div>
            <div class="gov-line"><b>${esc(i18n('Aujourd’hui'))}</b> : ${esc(todayText(o.today) || '—')}</div>
            ${o.postal?.length ? `<div class="gov-line"><b>${esc(i18n('Code postal'))}</b> : ${esc(o.postal.join(', '))}</div>` : ''}
            ${coords ? `<div class="gov-line"><b>${esc(i18n('Coordonnées'))}</b> : ${esc(coords)}${o.coords_from_parent ? ` <span class="gov-muted">(${esc(i18n('celles du village'))})</span>` : ''}</div>` : ''}
            <div class="gov-acts">${placeId && how === 'near' && !kiosk() ? `<button type="button" class="button small" data-gov-link="${esc(o.gov)}" data-gov-place-id="${Number(placeId)}">✓ ${esc(i18n('C’est bien ce lieu'))}</button>` : ''}
                ${placeId && how === 'link' && !kiosk() ? `<button type="button" class="button small secondary" data-gov-unlink="${Number(placeId)}">${esc(i18n('Ce n’est pas ce lieu'))}</button>` : ''}
                ${!placeId && !kiosk() ? `<button type="button" class="button small" data-gov-add="${esc(o.gov)}">＋ ${esc(i18n('Ajouter ce lieu à ma base'))}</button>` : ''}
                ${govLink(o.url)}</div>${srcLine()}</div>`;
    }
    async function refreshAt(box) {
        const host = box.querySelector('[data-gov-at]'), gov = box.dataset.govObj, y = box.querySelector('[data-gov-year]')?.value;
        if (!host || !gov) return;
        try { const o = await api('gov_object', {gov, year: y || ''}); host.innerHTML = o.at ? `<p class="gov-line">${esc(o.at.sentence)}</p>${chainLines(o.at)}` : `<p class="gov-muted">${esc(i18n('Choisis une année.'))}</p>`; }
        catch (e) { host.innerHTML = `<p class="gov-muted">${esc(e.message)}</p>`; }
    }

    /* ═════════ Fenêtre d'un objet GOV ═════════ */
    async function openObject(gov, year = null) {
        let o; try { o = await api('gov_object', {gov, year: year ?? ''}); } catch (e) { return toast(e.message, 'error'); }
        ext.openDialog?.({eyebrow: '🏰 ' + i18n('LIEUX ANCIENS (GOV)'), title: o.name || gov, wide: true, body: objectHtml(o, {year})});
    }

    /* ═════════ « Trouver un lieu ancien » ═════════ */
    async function openSearch(q = '') {
        const st = await status();
        if (!st.installed) { toast(i18n('Les lieux anciens (GOV) ne sont pas installés : Réglages → 🏰 Lieux anciens (GOV) → ⤓ Installer.'), 'info'); return openSettings(); }
        const dlg = ext.openDialog?.({eyebrow: '🏰 ' + i18n('LIEUX ANCIENS (GOV)'), title: i18n('Trouver un lieu ancien'), wide: true,
            body: `<p class="gov-muted">${esc(i18n('Un nom d’autrefois en allemand, polonais, tchèque… : le lieu d’aujourd’hui, où il est, et à quoi il appartenait.'))}</p>
                <div class="gov-search-row"><input type="search" data-gov-q value="${esc(q)}" placeholder="${esc(i18n('Schreiberhau, Breslau, Reichenberg…'))}" aria-label="${esc(i18n('Nom du lieu'))}"><button type="button" class="button" data-gov-go>${esc(i18n('Chercher'))}</button></div>
                <div class="gov-res" data-gov-res></div>${srcLine()}`});
        if (!dlg) return;
        const inp = dlg.querySelector('[data-gov-q]'), res = dlg.querySelector('[data-gov-res]');
        let seq = 0, timer = 0;
        const run = async () => {
            const my = ++seq, v = inp.value.trim();
            if (v.length < 2) { res.innerHTML = ''; return; }
            res.innerHTML = UI().spinner ? UI().spinner(i18n('Recherche…')) : '…';
            let r; try { r = await api('gov_search', {q: v}); } catch (e) { if (my === seq) res.innerHTML = `<p class="gov-muted">${esc(e.message)}</p>`; return; }
            if (my !== seq) return;
            res.innerHTML = r.items.length ? r.items.map(hitHtml).join('') : `<p class="gov-muted">${esc(i18n('Aucun lieu de GOV ne porte ce nom. Essaie sans le début (« Ober », « Nieder »…) ou avec une autre orthographe.'))}</p>`;
        };
        inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        dlg.querySelector('[data-gov-go]').addEventListener('click', run);
        setTimeout(() => inp.focus(), 50);
        if (q) run();
    }
    function hitHtml(it) {
        const coords = it.lat != null ? `${String(it.lat).replace('.', ',')} ; ${String(it.lon).replace('.', ',')}` : i18n('pas de coordonnées');
        return `<div class="gov-hit" data-gov-hit="${esc(it.gov)}"><div><b>${esc(it.name_today || it.matched)}</b>${it.type ? ` <span class="gov-muted">· ${esc(it.type)}</span>` : ''}</div>
            <div class="gov-muted">${esc(i18n('Trouvé par « {n} » ({l})', {n: it.matched, l: it.matched_lang}))}${it.old_names ? ` · ${esc(i18n('noms : {n}', {n: it.old_names}))}` : ''}</div>
            <div class="gov-muted">${esc([it.today, coords].filter(Boolean).join(' · '))}</div>
            <div class="gov-acts">${!kiosk() ? `<button type="button" class="button small" data-gov-add="${esc(it.gov)}">＋ ${esc(i18n('Ajouter ce lieu à ma base'))}</button>` : ''}<button type="button" class="button small secondary" data-gov-open="${esc(it.gov)}">🏰 ${esc(i18n('Le détail'))}</button>${govLink(it.url)}</div></div>`;
    }

    /* ═════════ Écrire (avec ↶ Annuler) ═════════ */
    async function addPlace(gov, btn) {
        let r; try { r = await post('gov_place_add', {gov}); } catch (e) { return toast(e.message, 'error'); }
        if (btn) { btn.disabled = true; btn.textContent = '✓ ' + i18n('Dans ta base'); }
        if (!r.created) return toast(i18n('Ce lieu est déjà dans ta base.'), 'info');
        let pid = r.place_id;
        undoToast(i18n('📍 « {n} » ajouté à ta base (avec ses anciens noms)', {n: r.name || ''}), {
            undo: async () => { await post('gov_place_add_undo', {place_id: pid}); if (btn) { btn.disabled = false; btn.textContent = '＋ ' + i18n('Ajouter ce lieu à ma base'); } },
            redo: async () => { const x = await post('gov_place_add', {gov}); pid = x.place_id; if (btn) { btn.disabled = true; btn.textContent = '✓ ' + i18n('Dans ta base'); } }});
    }
    async function linkPlace(placeId, gov) {
        let r; try { r = await post('gov_place_link', {place_id: placeId, gov}); } catch (e) { return toast(e.message, 'error'); }
        evCache.clear(); repaintPlaces();
        undoToast(gov ? i18n('🏰 Lieu relié à GOV') : i18n('🏰 Lien avec GOV retiré'), {
            undo: async () => { await post('gov_place_link', {place_id: placeId, gov: r.old || ''}); evCache.clear(); repaintPlaces(); },
            redo: async () => { await post('gov_place_link', {place_id: placeId, gov}); evCache.clear(); repaintPlaces(); }});
    }

    document.addEventListener('click', e => {
        const t = e.target;
        const add = t.closest?.('[data-gov-add]'); if (add) { e.preventDefault(); return addPlace(add.dataset.govAdd, add); }
        const op = t.closest?.('[data-gov-open]'); if (op) { e.preventDefault(); return openObject(op.dataset.govOpen, op.dataset.govYear ? Number(op.dataset.govYear) : null); }
        const ln = t.closest?.('[data-gov-link]'); if (ln) { e.preventDefault(); return linkPlace(Number(ln.dataset.govPlaceId), ln.dataset.govLink); }
        const un = t.closest?.('[data-gov-unlink]'); if (un) { e.preventDefault(); return linkPlace(Number(un.dataset.govUnlink), ''); }
        const pk = t.closest?.('[data-gov-pk]'); if (pk) { e.preventDefault(); e.stopPropagation(); const q = pk.closest('.pk-search')?.querySelector('.pk-input')?.value || ''; pk.closest('.pk-search')?.querySelector('.pk-list')?.setAttribute('hidden', ''); return openSearch(q.trim()); }
        if (t.closest?.('[data-gov-search]')) { e.preventDefault(); return openSearch(); }
        if (t.closest?.('[data-gov-about]')) { e.preventDefault(); return openAbout(); }
    }, true);
    document.addEventListener('change', e => { const y = e.target.closest?.('[data-gov-year]'); if (y) refreshAt(y.closest('[data-gov-obj]')); });

    /* ═════════ Page d'un lieu (Monographie de commune) : « 🏰 Ce lieu dans GOV » ═════════ */
    async function fillPlace(host) {
        const pid = Number(host.dataset.govPlace);
        let r; try { r = await api('gov_place', {id: pid}); } catch (_) { host.remove(); return; }
        if (!host.isConnected) return;
        if (!r.installed || r.how === 'none') { host.hidden = true; return; }
        host.hidden = false;
        const head = `<h4>🏰 ${esc(i18n('Ce lieu dans GOV'))} <button type="button" class="link-button gov-muted" data-gov-search>🔎 ${esc(i18n('Trouver un lieu ancien'))}</button></h4>`;
        if (r.how === 'choose') {
            host.innerHTML = `${head}<p class="gov-muted">${esc(i18n('Plusieurs lieux de GOV portent ce nom : lequel est le tien ?'))}</p>${r.choices.map(c => `<div class="gov-choice"><span><b>${esc(c.name_today)}</b> <span class="gov-muted">${esc([c.type, c.where, c.km != null ? i18n('à {n} km', {n: c.km}) : ''].filter(Boolean).join(' · '))}</span></span>
                <span class="gov-acts">${kiosk() ? '' : `<button type="button" class="button small" data-gov-link="${esc(c.gov)}" data-gov-place-id="${pid}">${esc(i18n('C’est celui-ci'))}</button>`}<button type="button" class="button small secondary" data-gov-open="${esc(c.gov)}">🏰</button></span></div>`).join('')}${srcLine()}`;
            return;
        }
        host.innerHTML = head + objectHtml(r.object, {year: r.year, placeId: pid, how: r.how, km: r.km});
    }
    function repaintPlaces() { document.querySelectorAll('[data-gov-place]').forEach(h => fillPlace(h)); }
    async function scanPlaces() {
        if (!settings().place) return;
        const hosts = [...document.querySelectorAll('#workspace .place-monograph-summary')].filter(s => !s.querySelector('[data-gov-place]'));
        if (!hosts.length) return;
        const st = await status(); if (!st.installed) return;
        hosts.forEach(s => {
            const id = Number(s.querySelector('[data-wx-place-alt]')?.dataset.wxPlaceAlt || s.closest('.place-monograph-shell')?.querySelector('[data-pli-place]')?.dataset.pliPlace || 0);
            if (!id || s.querySelector('[data-gov-place]')) return;
            const div = document.createElement('div'); div.className = 'gov-box'; div.dataset.govPlace = String(id); div.hidden = true;
            (s.firstElementChild || s).appendChild(div); fillPlace(div);
        });
    }

    /* ═════════ Fiche : « 🏰 en 1870 : … » sous les événements ═════════ */
    const evCache = new Map();
    async function decorateEvents(root) {
        if (!settings().events) return;
        const rows = [...root.querySelectorAll('.event-row[data-event-id]')].filter(r => !r.querySelector('.gov-ev'));
        if (!rows.length) return;
        const st = await status(); if (!st.installed) return;
        const missing = [...new Set(rows.map(r => Number(r.dataset.eventId)).filter(id => id && !evCache.has(id)))];
        for (let i = 0; i < missing.length; i += 150) {
            try { const r = await api('gov_events', {ids: missing.slice(i, i + 150).join(',')}); missing.slice(i, i + 150).forEach(id => evCache.set(id, (r.events || {})[id] || null)); }
            catch (_) { return; }
        }
        rows.forEach(row => {
            const x = evCache.get(Number(row.dataset.eventId)); if (!x || row.querySelector('.gov-ev')) return;
            const div = document.createElement('div'); div.className = 'gov-ev';
            div.innerHTML = `<button type="button" data-gov-open="${esc(x.gov)}" data-gov-year="${x.year ?? ''}" title="${esc(i18n('Ce lieu dans GOV'))}">🏰 ${esc(x.sentence)}</button>`;
            (row.querySelector('.event-content') || row).appendChild(div);
        });
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { const ws = document.getElementById('workspace'); if (ws) decorateEvents(ws.querySelector('[data-pblock="events"]') || ws); });

    /* ═════════ Choix d'un lieu : « 🏰 Chercher dans les lieux anciens » ═════════ */
    function decoratePicker(list) {
        if (!settings().picker || !STATUS?.installed || list.hidden || list.querySelector('.gov-pk')) return;
        const s = list.closest('.pk-search'); if (!s || (s.querySelector('.pk-ico')?.textContent || '').trim() !== '📍') return;
        const q = (s.querySelector('.pk-input')?.value || '').trim(); if (q.length < 3) return;
        const d = document.createElement('div'); d.className = 'pk-hint gov-pk';
        d.innerHTML = `<button type="button" data-gov-pk>🏰 ${esc(i18n('Chercher « {q} » dans les lieux anciens (GOV)', {q}))}</button>`;
        list.appendChild(d);
    }

    let scanT = 0;
    const watch = () => {
        if (!document.body) return setTimeout(watch, 200);
        new MutationObserver(muts => {
            for (const m of muts) { const l = m.target.closest?.('.pk-list'); if (l) decoratePicker(l); }
            clearTimeout(scanT); scanT = setTimeout(scanPlaces, 150);
        }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
        status();
    };
    watch();

    /* ═════════ À propos des données ═════════ */
    async function openAbout() {
        let a = {}; try { a = await api('gov_about'); } catch (_) {}
        ext.openDialog?.({eyebrow: '🏰 ' + i18n('LIEUX ANCIENS (GOV)'), title: i18n('À propos des données'), wide: true,
            body: `<p><b>GOV — Geschichtliches Orts-Verzeichnis</b> (« ${esc(i18n('répertoire historique des lieux'))} »), ${esc(i18n('fait par les bénévoles du Verein für Computergenealogie e. V.'))} : ${esc(i18n('environ 1,2 million de lieux, paroisses et territoires, surtout d’Allemagne et d’Europe centrale, avec leurs noms au fil du temps et ce à quoi ils appartenaient.'))}</p>
                <ul><li><b>${esc(i18n('Source'))}</b> : <a href="${esc(a.source_url || 'https://gov.genealogy.net')}" target="_blank" rel="noopener">gov.genealogy.net</a>${a.built ? ` · ${esc(i18n('lu le {d}', {d: a.built}))}` : ''}${a.objects ? ` · ${esc(i18n('{n} objets dans le pack', {n: nf(a.objects)}))}` : ''}</li>
                <li><b>${esc(i18n('Licence'))}</b> : ${esc(a.licence || 'CC BY-SA')} — <a href="${esc(a.licence_url || 'https://wiki.genealogy.net/GOV/Webservice')}" target="_blank" rel="noopener">GenWiki « GOV/Webservice »</a>${a.licence_checked ? ` (${esc(i18n('vérifiée le {d}', {d: a.licence_checked}))})` : ''}</li>
                <li><b>${esc(i18n('Mention à recopier'))}</b> : ${esc(a.mention || '')}</li></ul>
                ${a.licence_text ? `<details><summary>${esc(i18n('Le texte de la licence, tel que lu'))}</summary><p class="gov-muted">${esc(a.licence_text)}</p></details>` : ''}
                ${UI().notice ? UI().notice('info', i18n('Le pack est fabriqué une fois à partir du service public de GOV (scripts/gov/build-gov.py) ; l’app le télécharge, puis n’a plus besoin d’Internet. Rien n’est envoyé à GOV.')) : ''}
                ${UI().notice ? UI().notice('warn', i18n('GOV est rempli par des bénévoles : une paroisse ou une date peut manquer. Le bouton « ↗ GOV en ligne » montre la fiche et ses sources.')) : ''}`});
    }

    /* ═════════ Réglages → 🏰 Lieux anciens (GOV) ═════════ */
    const DL = {online: undefined, err: '', run: null, paused: null};
    let redraw = () => {}, refresh = async () => {};
    const dlSaved = () => { try { return localStorage.getItem(DL_KEY) || ''; } catch (_) { return ''; } };
    const dlRemember = id => { try { localStorage.setItem(DL_KEY, id); } catch (_) {} };
    const dlForget = () => { try { localStorage.removeItem(DL_KEY); } catch (_) {} };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    function dlActs(st) {
        if (st.installed) return kiosk() ? '' : `<button type="button" class="button small secondary" data-gov-remove>🗑 ${esc(i18n('Supprimer'))}</button>`;
        if (DL.run) return `<span class="gov-prog"><i style="width:${pct(DL.run.received, DL.run.size)}%"></i></span> <small data-gov-dl-txt>${esc(i18n('{p} % · {a} sur {b}', {p: pct(DL.run.received, DL.run.size), a: fmtSize(DL.run.received), b: fmtSize(DL.run.size)}))}</small> <button type="button" class="button small secondary" data-gov-pause>⏸ ${esc(i18n('Pause'))}</button>`;
        if (DL.paused) return `<span class="gov-prog"><i style="width:${pct(DL.paused.received, DL.paused.size)}%"></i></span> <small>${esc(i18n('En pause : {p} %', {p: pct(DL.paused.received, DL.paused.size)}))}</small> <button type="button" class="button small" data-gov-dl>▶ ${esc(i18n('Reprendre'))}</button> <button type="button" class="button small secondary" data-gov-cancel>✕ ${esc(i18n('Abandonner'))}</button>`;
        if (DL.online === undefined) return `<small class="gov-muted">${esc(i18n('Recherche des données en ligne…'))}</small>`;
        if (!DL.online) return `<small class="gov-muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>`;
        return `<button type="button" class="button small" data-gov-dl>⤓ ${esc(i18n('Installer ({s})', {s: fmtSize(DL.online.size)}))}</button>`;
    }
    async function dlRun() {
        if (DL.run) return;
        let id = DL.paused?.id || dlSaved(), run;
        try {
            if (id) { const r = await api('gov_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('gov_dl_start', {}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { return toast(x.message, 'error'); }
        dlRemember(id); DL.paused = null; DL.run = {...run, stop: false}; redraw();
        let fails = 0;
        while (!DL.run.stop) {
            try { const r = await post('gov_dl_step', {id}); DL.run.received = r.received; fails = 0; const t = document.querySelector('[data-gov-dl-txt]'); if (t) { t.textContent = i18n('{p} % · {a} sur {b}', {p: pct(r.received, r.size), a: fmtSize(r.received), b: fmtSize(r.size)}); t.previousElementSibling?.firstElementChild?.style.setProperty('width', pct(r.received, r.size) + '%'); } if (r.done) break; }
            catch (x) { if (++fails >= 3) { toast(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); }
        const t = document.querySelector('[data-gov-dl-txt]'); if (t) t.textContent = i18n('Vérification et installation…');
        try {
            const r = await post('gov_pack_finish', {id}); dlForget(); DL.run = null; forget(); await refresh();
            undoToast(i18n('🏰 Lieux anciens (GOV) installés ({n} lieux).', {n: nf(r.objects)}), {undo: async () => { await post('gov_pack_undo', {}); forget(); await refresh(); }});
        } catch (x) { dlForget(); DL.run = null; redraw(); toast(x.message, 'error'); }
    }
    async function dlCancel() {
        const id = DL.paused?.id || dlSaved(); DL.paused = null; dlForget();
        if (id) { try { await post('gov_dl_cancel', {id}); } catch (_) {} }
        redraw();
    }
    function openSettings() { const st = A().state; if (!st) return; register(); st.maintenanceTab = 'gov'; A().persistUiState?.(); A().setModule?.('maintenance'); }

    ext.maintenance = ext.maintenance || {};
    ext.maintenance.gov = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = await status(true);
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), K = UI().toggleHtml || ((l, o) => `<label><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}> ${esc(l)}</label>`);
            const desc = st.installed ? `${i18n('{n} lieux, paroisses et territoires', {n: nf(st.objects)})} · ${i18n('{n} avec coordonnées', {n: nf(st.with_coords)})} · ${fmtSize(st.size || 0)}${st.built ? ' · ' + i18n('lu le {d}', {d: st.built}) : ''}${st.fixture ? ' · ' + i18n('(jeu d’essai)') : ''}`
                : i18n('Les lieux d’Allemagne et d’Europe centrale (Pologne, Tchéquie, Autriche…) avec leurs anciens noms, leurs paroisses, Kreise, provinces et États au fil du temps.');
            ws.innerHTML = `<section class="page gov-set">${UI().pageHeader ? UI().pageHeader({title: i18n('Lieux anciens (GOV)'), icon: '🏰', where: i18n('Réglages · Données'), help: i18n('Retrouver un village d’Allemagne ou d’Europe centrale sous son ancien nom, et savoir de quelle paroisse, de quel Kreis et de quel État il dépendait.')}) : `<h2>🏰 ${esc(i18n('Lieux anciens (GOV)'))}</h2>`}
                <section class="card"><h3>${esc(i18n('Les données'))}</h3>
                    <div class="gov-data"><span><b>GOV</b><br><small>${esc(desc)}</small></span>${UI().badge ? UI().badge(i18n(st.installed ? 'Installé' : 'Pas installé'), st.installed ? 'green' : 'grey') : ''}<span>${dlActs(st)}</span></div>
                    ${UI().notice ? UI().notice('info', i18n('Le téléchargement se fait une fois ; ensuite l’app n’a plus besoin d’Internet. Rien n’est envoyé.')) : ''}
                    <p><button type="button" class="link-button" data-gov-about>↗ ${esc(i18n('À propos des données'))}</button></p>
                </section>
                <section class="card"><h3>${esc(i18n('Où le voir'))}</h3>
                    ${K(i18n('Sur la page d’un lieu'), {checked: s.place, attrs: 'data-gov-opt="place"', sub: i18n('« 🏰 Ce lieu dans GOV » : anciens noms, paroisse, Kreis, province, État.')})}
                    ${K(i18n('Sous les événements des fiches'), {checked: s.events, attrs: 'data-gov-opt="events"', sub: i18n('« 🏰 en 1870 : Kirchspiel…, Kreis…, Province de… »')})}
                    ${K(i18n('Dans le choix d’un lieu'), {checked: s.picker, attrs: 'data-gov-opt="picker"', sub: i18n('« 🏰 Chercher dans les lieux anciens (GOV) »')})}
                    <p><button type="button" class="button" data-gov-search ${st.installed ? '' : 'disabled'}>🔎 ${esc(i18n('Trouver un lieu ancien'))}</button></p>
                </section></section>`;
        };
        draw();
        redraw = () => { if (ws.querySelector('.gov-set')) draw(); };
        refresh = async () => { st = await status(true); redraw(); if (!st.installed && DL.online === undefined) loadInfo(); };
        const loadInfo = () => api('gov_dl_info').then(r => { DL.online = r.packs?.gov || null; DL.err = r.error || ''; }).catch(x => { DL.online = null; DL.err = x.message; }).finally(async () => {
            const id = dlSaved(); if (id && !DL.run) { try { const r = await api('gov_dl_resume', {id}); if (r.exists) DL.paused = {id, received: r.received, size: r.size}; else dlForget(); } catch (_) {} }
            redraw(); });
        if (!st.installed) loadInfo();
        if (ws.__govBound !== true) {
            ws.__govBound = true;
            ws.addEventListener('change', e => {
                const o = e.target.closest?.('[data-gov-opt]'); if (!o || !ws.querySelector('.gov-set')) return;
                const k = o.dataset.govOpt, before = settings(); save({...before, [k]: !!o.checked});
                undoToast(i18n('🏰 Réglage enregistré'), {undo: () => { save(before); redraw(); }});
            });
            ws.addEventListener('click', async e => {
                if (!ws.querySelector('.gov-set')) return;
                if (e.target.closest('[data-gov-dl]')) return dlRun();
                if (e.target.closest('[data-gov-pause]')) { if (DL.run) DL.run.stop = true; return; }
                if (e.target.closest('[data-gov-cancel]')) return dlCancel();
                if (e.target.closest('[data-gov-remove]')) {
                    try { await post('gov_pack_remove', {}); } catch (x) { return toast(x.message, 'error'); }
                    forget(); await refresh();
                    undoToast(i18n('🗑 Lieux anciens (GOV) supprimés'), {undo: async () => { await post('gov_pack_restore', {}); forget(); await refresh(); }, redo: async () => { await post('gov_pack_remove', {}); forget(); await refresh(); }});
                }
            });
        }
    };

    ext.gov = {settings, status, openSearch, openObject, openAbout, openSettings, register, run: dlRun, state: DL, decorateEvents, scanPlaces};
})();
