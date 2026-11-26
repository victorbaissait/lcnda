/* LCNDA — 🔎 Recherche : le petit nécessaire commun des écrans de résultats (app-recherche.js, app-recherche-outils.js).
 *  Chaque écran dit ce qu'il a ; rien n'apparaît là où ça n'a pas de sens :
 *  - « 🗺 Carte » (avant « ⤓ Exporter ▾ ») : seulement si des résultats ont une position. Un panneau qui monte au-dessus des résultats
 *    (hauteur douce, sans animation si « réduire les animations ») ; la petite carte commune (ext.miniMap, heritage-mini-carte.js),
 *    la fiche d'un point (ext.carteFiche, app-carte-fiche.js), les couleurs des sortes de la Carte (LCNDA_CARTE_COULEURS,
 *    « genealogie-carte-couleurs ») ; ouvert / fermé retenu (localStorage, ex. « genealogie-proximite-carte ») ;
 *    mode consultation / invité du wifi : le fond « hors ligne » (rien n'est demandé à Internet) ;
 *  - « ⤓ Exporter ▾ » devient un menu : l'export d'avant (CSV, impression…), puis 🧺 Mettre dans le panier et 📎 Insérer… (ce qui est
 *    coché, sinon tout) — un ensemble (tableau) avec les critères de la recherche comme source ; ↶ Annuler par le panier / « Mettre dans… » ;
 *  - 📎 🧺 au bout de chaque résultat (au survol, au focus, toujours au doigt) ; survoler un résultat éclaire ses points sur la carte.
 *  Mode consultation : ni 🧺 ni 📎.
 *  API : LCNDA_EXT.researchKit = {mount(page, cfg), personItem(p, origin)}
 *   cfg = {key, storeKey?, title, criteria, columns, rows(sel) → [[…]], items(sel) → [éléments du panier], selected() → ids | null,
 *          rowItems?(id) → {items, columns?, rows?, title?}, rowSel? (sélecteur des résultats, défaut : la case [data-rp-pick]),
 *          map?: {points: [{lat, lon, tag?, kind?, color?, label, n?, rowIds?: [...]}], circles?, card(i), label?(i), sub?(i), onAct?(kind, i, btn)}}
 *  Essai : tests/test-proximite-carte-panier.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const CX = () => ext.connexions || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const toast = (m, k) => A().toast?.(m, k);
    const readFlag = k => { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } };
    const writeFlag = (k, on) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch (_) {} };

    /* ── les couleurs des sortes : celles de la Carte (réglage « genealogie-carte-couleurs » s'il est là) ── */
    const KINDS = [['births', 'Naissances', ['BIRT', 'CHR', 'BAPM']], ['marriages', 'Mariages', ['MARR', 'MARC', 'ENGA', 'MARB', 'MARL', 'MARS']], ['deaths', 'Décès', ['DEAT']],
        ['burials', 'Inhumations', ['BURI', 'CREM']], ['residences', 'Résidences', ['RESI']], ['census', 'Recensements', ['CENS']], ['events', 'Autres événements', []]];
    const DEF = {births: '#2b8a3e', marriages: '#c2255c', deaths: '#495057', burials: '#7048e8', residences: '#1971c2', census: '#0b7285', events: '#e8590c'};
    const KC = () => window.LCNDA_CARTE_COULEURS || null;
    const kindOf = tag => { try { if (KC()?.kindOf) return KC().kindOf({gedcom_tag: tag}); } catch (_) {} const t = String(tag || '').toUpperCase(); return (KINDS.find(k => k[2].includes(t)) || KINDS[6])[0]; };
    const colorOf = k => { try { if (KC()?.color) return KC().color(k); } catch (_) {} return DEF[k] || DEF.events; };
    const kindName = k => { try { if (KC()?.kindName) return KC().kindName(k); } catch (_) {} return T((KINDS.find(x => x[0] === k) || KINDS[6])[1]); };

    /** une personne → un élément du panier */
    function personItem(p, origin) {
        const name = String(p.name || (A().personName ? A().personName(p) : `${p.first_name || ''} ${p.last_name || ''}`) || '').trim() || T('Personne sans nom');
        return {kind: 'person', ref_id: Number(p.id), title: name, value: String(p.value || ''), origin};
    }
    /** un ensemble (tableau) avec sa source : les critères de la recherche */
    function setOf(cfg, rows, columns = cfg.columns, title = cfg.title) {
        return {kind: 'set', title: `${title} — ${rows.length === 1 ? T('1 ligne') : T('{n} lignes', {n: rows.length.toLocaleString('fr-FR')})}`, value: '',
            data: {icon: '🔎', columns, rows, criteria: cfg.criteria || '', source: `${T('Recherche')} · ${cfg.criteria || title}`, url: '', taken: new Date().toISOString().slice(0, 10)},
            origin: {kind: 'research', label: `${T('Recherche')} · ${cfg.criteria || title}`, url: ''}};
    }
    function blockOf(cfg, set) {
        const d = set.data, line = r => r.filter(x => x !== '' && x != null).join(' — ');
        const text = `${set.title}\n${d.rows.map(r => `• ${line(r)}`).join('\n')}\n${T('Source :')} ${d.source}`;
        const html = `<p><b>${esc(set.title)}</b></p><table><tr>${d.columns.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${d.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table><p><small>${esc(T('Source :'))} ${esc(d.source)}</small></p>`;
        return {text, html, items: [set], title: set.title};
    }
    async function toBasket(items, anchor) {
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être écrit.'));
        const cx = CX(); if (!cx?.take) return toast(T('Le panier n’est pas chargé.'), 'error');
        if (!items.length) return toast(T('Rien à mettre.'));
        try { const bid = cx.chooseBasket ? await cx.chooseBasket(anchor) : 0; if (bid === null) return; return await cx.take(items, {basketId: bid || null}); } catch (e) { toast(e.message, 'error'); }
    }
    function toInsert(cfg, set, anchor) {
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être écrit.'));
        if (!set.data.rows.length) return toast(T('Rien à mettre.'));
        if (ext.insertInfo?.insertBlock) return ext.insertInfo.insertBlock(blockOf(cfg, set), {anchor});
        if (CX()?.putInto) return CX().putInto([set], {anchor});
        return toast(T('« Insérer une info » n’est pas chargé.'), 'error');
    }

    function mount(page, cfg = {}) {
        if (!page || !cfg) return null;
        page.__rk?.destroy?.();
        const ac = new AbortController();
        const K = page.__rk = {cfg, destroy: () => { ac.abort(); page.querySelectorAll('[data-rk-own]').forEach(x => x.remove()); page.classList.remove('rk-page'); }};
        page.classList.add('rk-page');
        const picked = () => { try { const s = cfg.selected ? cfg.selected() : [...page.querySelectorAll('[data-rp-pick]:checked')].map(c => Number(c.dataset.rpPick)); return s && s.length ? s : null; } catch (_) { return null; } };
        const nOf = () => { const s = picked(); return s ? s.length : null; };
        /* ⤓ Exporter ▾ : la fenêtre d'export commune reçoit, après CSV et Imprimer, 🧺 et 📎 (app-recherche-outils.js bindExportPrint lit K.formats) */
        let exp = page.querySelector('.page-header [data-rp-export]');
        if (!exp && cfg.ensureExport !== false && ext.researchBar) { // un écran sans « ⤓ Exporter ▾ » (Que manque-t-il ?, multicritère, SocFace…) : le bouton commun
            const head = page.querySelector('.page-header');
            if (head) {
                let acts = head.querySelector('.page-actions'); if (!acts) { acts = document.createElement('div'); acts.className = 'page-actions ui-ph-actions'; head.appendChild(acts); }
                acts.insertAdjacentHTML('beforeend', ext.researchBar.headActions()[0]); exp = acts.lastElementChild; exp.dataset.rkOwn = '';
                ext.researchBar.bindExportPrint({querySelector: q => (q === '[data-rp-export]' ? exp : null), get __rk() { return page.__rk; }}, () => ({title: cfg.title, head: cfg.columns, rows: cfg.rows(null)}));
            }
        }
        K.formats = () => {
            if (kiosk()) return [];
            const n = nOf(), hint = n ? T('les {n} cochés', {n}) : T('tout');
            const later = fn => async () => { setTimeout(fn, 80); }; // après la fermeture de la fenêtre d'export
            return [{id: 'rk_basket', label: T('🧺 Mettre dans le panier'), hint, ext: '', quality: false, copy: false, goLabel: n ? T('Mettre dans le panier ({n} cochés)', {n}) : T('🧺 Mettre dans le panier'),
                run: later(() => toBasket(cfg.items(picked()), exp))},
            {id: 'rk_insert', label: T('📎 Insérer…'), hint: T('note, enquête, fiche, Atelier… (avec la source)'), ext: '', quality: false, copy: false, goLabel: n ? T('Insérer… ({n} cochés)', {n}) : T('📎 Insérer…'),
                run: later(() => toInsert(cfg, setOf(cfg, cfg.rows(picked())), exp))}];
        };
        /* 📎 🧺 au bout de chaque résultat */
        /** les résultats (aussi après un nouveau dessin de la liste : K.refreshRows()) : leur identifiant, et 📎 🧺 au bout */
        const applyRows = () => {
            const rowEls = cfg.rowSel ? [...page.querySelectorAll(cfg.rowSel)] : [...page.querySelectorAll('[data-rp-pick]')].map(c => c.closest('article, tr')).filter(Boolean);
            rowEls.forEach(el => { const id = cfg.rowAttr ? el.dataset[cfg.rowAttr] : (el.dataset.rkRow ?? el.querySelector('[data-rp-pick]')?.dataset.rpPick); if (id != null) el.dataset.rkId = id; });
            if (kiosk() || !cfg.rowItems) return;
            rowEls.forEach(el => {
                if (el.dataset.rkId == null || el.querySelector(':scope > .rk-row-acts, :scope > td:last-child > .rk-row-acts')) return;
                el.classList.add('rk-row');
                const box = document.createElement('span'); box.className = 'rk-row-acts'; box.dataset.rkOwn = '';
                box.innerHTML = `<button type="button" class="rk-ico" data-rk-ins title="${esc(T('Insérer (avec la source)'))}" aria-label="${esc(T('Insérer (avec la source)'))}">📎</button><button type="button" class="rk-ico" data-rk-bk title="${esc(T('Mettre au panier'))}" aria-label="${esc(T('Mettre au panier'))}">🧺</button>`;
                (el.tagName === 'TR' ? el.lastElementChild : el).appendChild(box);
            });
        };
        applyRows(); K.refreshRows = applyRows;
        if (!kiosk() && cfg.rowItems) {
            page.addEventListener('click', e => {
                const b = e.target.closest('[data-rk-ins], [data-rk-bk]'); if (!b || !page.contains(b) || b.closest('.cf-card')) return;
                const id = b.closest('[data-rk-id]')?.dataset.rkId; if (id == null) return;
                let r = null; try { r = cfg.rowItems(id); } catch (x) { console.error(x); } if (!r) return;
                if (b.matches('[data-rk-bk]')) toBasket(r.items || [], b);
                else toInsert(cfg, setOf(cfg, r.rows || [], r.columns || cfg.columns, r.title || cfg.title), b);
            }, {signal: ac.signal});
        }
        /* 🗺 Carte */
        const pts = (cfg.map?.points || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && !(Number(p.lat) === 0 && Number(p.lon) === 0));
        if (pts.length && ext.miniMap && exp) {
            const store = cfg.storeKey || `genealogie-recherche-carte-${cfg.key || 'x'}`;
            const pid = 'rk-map-' + Math.random().toString(36).slice(2, 8);
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'button secondary rk-map-btn'; btn.dataset.rkMapBtn = ''; btn.dataset.rkOwn = '';
            btn.setAttribute('aria-controls', pid); btn.textContent = T('🗺 Carte'); exp.before(btn);
            const panel = document.createElement('div'); panel.className = 'rk-map'; panel.id = pid; panel.dataset.rkMap = ''; panel.dataset.rkOwn = '';
            panel.innerHTML = '<div class="rk-map-in"><div class="rk-map-host" data-rk-map-host></div><div class="rk-legend" data-rk-legend></div></div>';
            const head = page.querySelector('.page-header'); (head || page.firstElementChild)?.after(panel);
            pts.forEach(p => { p.kind = p.kind || (p.tag != null ? kindOf(p.tag) : ''); if (!p.color) p.color = p.kind ? colorOf(p.kind) : '#0066cc'; });
            let drawn = false;
            const draw = () => {
                drawn = true;
                const host = panel.querySelector('[data-rk-map-host]');
                host.innerHTML = ext.miniMap(pts.map(p => ({lat: Number(p.lat), lon: Number(p.lon), label: p.label, color: p.color, n: p.n || ''})), [], {height: 380, circles: cfg.map.circles || [], ...(kiosk() ? {bg: 'offline'} : {})});
                host.querySelectorAll('.h-map-point').forEach((g, i) => { if (!pts[i]) return; g.dataset.cfI = String(i); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', pts[i].label || ''); g.style.cursor = 'pointer'; });
                const kinds = [...new Set(pts.map(p => p.kind).filter(Boolean))];
                const order = KINDS.map(k => k[0]);
                panel.querySelector('[data-rk-legend]').innerHTML = [...kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(k => `<span class="rk-leg"><i style="background:${esc(colorOf(k))}"></i>${esc(kindName(k))}</span>`),
                    ...(cfg.map.legend || []).map(l => `<span class="rk-leg"><i style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`)].join('');
                ext.carteFiche?.attach(host, {card: i => cfg.map.card?.(i) || null, label: i => (cfg.map.label ? cfg.map.label(i) : pts[i]?.label || ''), sub: i => cfg.map.sub?.(i) || '', onAct: (k, i, b) => cfg.map.onAct?.(k, i, b)});
                // un lien vers une fiche dans la bulle : la fiche s'ouvre (la bulle arrête les clics)
                host.addEventListener('click', e => { const b = e.target.closest('.cf-card [data-open-person]'); if (!b) return; e.stopPropagation(); const st = A().state; if (st) st.currentPersonId = Number(b.dataset.openPerson); A().setModule?.('personnes'); }, true);
            };
            const set = (on, remember = true) => {
                if (on && !drawn) draw();
                panel.classList.toggle('is-open', on); btn.setAttribute('aria-expanded', String(on)); btn.classList.toggle('is-on', on);
                panel.toggleAttribute('inert', !on); panel.setAttribute('aria-hidden', String(!on));
                if (remember) writeFlag(store, on);
            };
            btn.addEventListener('click', () => set(!panel.classList.contains('is-open')));
            set(readFlag(store), false);
            /* survoler un résultat : ses points s'éclairent */
            const hi = id => {
                const host = panel.querySelector('[data-rk-map-host]'); if (!host) return;
                const on = new Set(); if (id != null) pts.forEach((p, i) => { if ((p.rowIds || []).map(String).includes(String(id))) on.add(i); });
                host.querySelectorAll('.h-map-point').forEach((g, i) => g.classList.toggle('is-rk-hi', on.has(i)));
                const gs = new Set([...host.querySelectorAll('.h-map-point')].filter((g, i) => on.has(i)));
                host.querySelectorAll('.h-map-cluster').forEach(c => c.classList.toggle('is-rk-hi', (c.__pts || []).some(p => gs.has(p.g))));
                host.classList.toggle('has-rk-hi', on.size > 0);
            };
            const rowOf = t => t.closest?.('[data-rk-id]');
            page.addEventListener('mouseover', e => { const r = rowOf(e.target); if (r && page.contains(r) && !panel.contains(r)) hi(r.dataset.rkId); }, {signal: ac.signal});
            page.addEventListener('mouseout', e => { const r = rowOf(e.target); if (r && !r.contains(e.relatedTarget)) hi(null); }, {signal: ac.signal});
            page.addEventListener('focusin', e => { const r = rowOf(e.target); if (r && !panel.contains(r)) hi(r.dataset.rkId); }, {signal: ac.signal});
            K.open = on => set(on); K.highlight = hi; K.points = pts;
        }
        return K;
    }

    /* ═════ les écrans qui s'en servent ═════ */
    const link = p => `<button type="button" class="table-link" data-open-person="${Number(p.id)}">${esc(p.name || T('Personne sans nom'))}</button>`;
    const links = (ps, max = 8) => `${ps.slice(0, max).map(link).join(', ')}${ps.length > max ? ` <small class="muted">${esc(T('+ {n} autres', {n: ps.length - max}))}</small>` : ''}`;
    const evDate = ev => String(ev.date_text || ev.year || '');
    const near = (a, b) => Math.abs(Number(a.lat) - Number(b.lat)) < 1e-6 && Math.abs(Number(a.lon) - Number(b.lon)) < 1e-6;

    /** 📍 Proximité · qui d'autre était là ? (app-recherche.js renderProximitySearch) */
    function proximity(page, {data, people, criteria, title}) {
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria}`, url: ''};
        const byId = new Map(people.map(p => [String(p.id), p]));
        const list = sel => (sel ? sel.map(id => byId.get(String(id))).filter(Boolean) : people);
        const evRows = ps => ps.flatMap(p => (p.events || []).map(ev => [p.name || '', ev.type || '', evDate(ev), ev.place || '']));
        const roleLabel = {principal: T('Événement'), famille: T('Conjoint / famille'), temoin: T('Témoin')};
        // un point par événement (ses personnes), plus la commune cherchée (★) et les communes voisines
        const evs = new Map();
        people.forEach(p => (p.events || []).forEach(ev => { if (!evs.has(ev.id)) evs.set(ev.id, {ev, who: []}); evs.get(ev.id).who.push({id: p.id, name: p.name, role: ev.role}); }));
        const pts = [], cards = [];
        const communeAt = (lat, lon, name, km) => {
            const here = [...evs.values()].filter(x => x.ev.lat != null && near(x.ev, {lat, lon}));
            const who = [...new Map(here.flatMap(x => x.who).map(w => [w.id, w])).values()];
            return {title: name, lines: [[T('Distance'), km != null ? esc(T('{km} km', {km: String(km).replace('.', ',')})) : esc(T('la commune cherchée'))], [T('Événements'), esc(String(here.length))], [T('Personnes'), who.length ? links(who) : '—']], src: esc(criteria), ins: !kiosk(), bk: !kiosk(), _who: who, _rows: here.flatMap(x => x.who.map(w => [w.name || '', x.ev.type || '', evDate(x.ev), x.ev.place || '']))};
        };
        if (data.placeLat != null && data.placeLon != null) { pts.push({lat: data.placeLat, lon: data.placeLon, label: data.placeName, color: '#d4380d', n: '★'}); cards.push(() => communeAt(data.placeLat, data.placeLon, data.placeName, null)); }
        (data.nearbyPlaces || []).forEach(np => { if (np.lat == null) return; pts.push({lat: np.lat, lon: np.lon, label: `${np.name} · ${np.distance_km} km`, color: '#868e96'}); cards.push(() => communeAt(np.lat, np.lon, np.name, np.distance_km)); });
        evs.forEach(x => {
            if (x.ev.lat == null) return;
            pts.push({lat: x.ev.lat, lon: x.ev.lon, tag: x.ev.gedcom_tag, label: `${x.ev.type} · ${evDate(x.ev)} · ${x.who.map(w => w.name).join(', ')}`, rowIds: x.who.map(w => w.id)});
            cards.push(() => ({title: `${x.ev.type} — ${evDate(x.ev)}`, lines: [[T('Personnes'), x.who.map(w => `${link(w)} <small class="muted">${esc(roleLabel[w.role] || '')}</small>`).join('<br>')], [T('Commune'), esc(x.ev.place || '—')]],
                src: esc(criteria), ins: !kiosk(), bk: !kiosk(), _who: x.who, _rows: x.who.map(w => [w.name || '', x.ev.type || '', evDate(x.ev), x.ev.place || ''])}));
        });
        const cardOf = i => { try { return cards[i]?.() || null; } catch (_) { return null; } };
        const columns = [T('Personne'), T('Événement'), T('Date'), T('Commune')];
        const cfg = {key: 'proximity', storeKey: 'genealogie-proximite-carte', title, criteria, columns,
            rows: sel => evRows(list(sel)),
            items: sel => list(sel).map(p => personItem({...p, value: T('{n} occurrence(s)', {n: p.count || (p.events || []).length})}, origin)),
            rowItems: id => { const p = byId.get(String(id)); return p ? {items: [personItem(p, origin)], rows: evRows([p]), title: `${title} · ${p.name || ''}`} : null; },
            map: {points: pts, circles: data.radiusKm > 0 && data.placeLat != null ? [{lat: data.placeLat, lon: data.placeLon, km: Number(data.radiusKm)}] : [],
                legend: [{color: '#d4380d', label: T('Commune cherchée')}, ...((data.nearbyPlaces || []).length ? [{color: '#868e96', label: T('Communes voisines incluses')}] : [])],
                card: cardOf,
                onAct: (k, i, b) => { const c = cardOf(i); if (!c) return; if (k === 'bk') toBasket((c._who || []).map(w => personItem(w, origin)), b); if (k === 'ins') toInsert(cfg, setOf(cfg, c._rows || [], columns, `${title} · ${c.title}`), b); }}};
        return mount(page, cfg);
    }

    /** 📅 Période ou date précise (app-recherche.js renderDateSearch) : des événements */
    function dates(page, {events, criteria, title, placeOf}) {
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria}`, url: ''};
        const byId = new Map(events.map(e => [String(e.id), e]));
        const who = e => (e.participants || []).map(p => p.name).join(' + ');
        const row = e => [who(e), e.type || '', evDate(e), placeOf(e) || ''];
        const item = e => ({kind: 'event', ref_id: Number(e.id), title: `${e.type || ''} — ${who(e)}`.trim(), value: [evDate(e), placeOf(e)].filter(Boolean).join(' · '), origin});
        const placed = events.filter(e => e.lat != null && e.lon != null);
        const columns = [T('Personne'), T('Événement'), T('Date'), T('Lieu')];
        const cfg = {key: 'dates', title, criteria, columns, rows: () => events.map(row), items: () => events.map(item), selected: () => null, rowSel: '[data-rk-row]',
            rowItems: id => { const e = byId.get(String(id)); return e ? {items: [item(e)], rows: [row(e)]} : null; },
            map: {points: placed.map(e => ({lat: e.lat, lon: e.lon, tag: e.gedcom_tag, label: `${e.type} · ${evDate(e)} · ${who(e)}`, rowIds: [e.id]})),
                card: i => { const e = placed[i]; return e ? {title: `${e.type} — ${evDate(e)}`, lines: [[T('Personnes'), (e.participants || []).length ? links(e.participants) : '—'], [T('Lieu'), esc(placeOf(e) || '—')]], src: esc(criteria), ins: !kiosk(), bk: !kiosk()} : null; },
                onAct: (k, i, b) => { const e = placed[i]; if (!e) return; if (k === 'bk') toBasket([item(e)], b); if (k === 'ins') toInsert(cfg, setOf(cfg, [row(e)]), b); }}};
        return mount(page, cfg);
    }

    /** 📍 Nom de lieu avec joker (app-recherche.js renderPlaceNameSearch) : des lieux */
    function places(page, {rows, criteria, title}) {
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria}`, url: ''};
        const label = r => [r.name, r.subdivision, r.country].filter(Boolean).join(', ');
        const row = r => [r.name || '', [r.subdivision, r.county].filter(Boolean).join(', '), r.country || '', r.latitude != null ? `${r.latitude}, ${r.longitude}` : ''];
        const item = r => ({kind: 'place', ref_id: Number(r.id) || 0, title: r.name || '', value: label(r), data: r.latitude != null ? {lat: Number(r.latitude), lon: Number(r.longitude)} : null, origin});
        const placed = rows.filter(r => r.latitude != null && r.longitude != null && r.latitude !== '');
        const cfg = {key: 'place_name', title, criteria, columns: [T('Lieu'), T('Subdivision'), T('Pays'), T('Coordonnées')], rows: () => rows.map(row), items: () => rows.map(item), selected: () => null,
            map: {points: placed.map(r => ({lat: Number(r.latitude), lon: Number(r.longitude), label: label(r), color: '#1971c2'})),
                card: i => { const r = placed[i]; return r ? {title: r.name || '—', lines: [[T('Lieu'), esc(label(r))], [T('Coordonnées'), esc(`${r.latitude}, ${r.longitude}`)]], src: esc(criteria), ins: !kiosk(), bk: !kiosk()} : null; },
                onAct: (k, i, b) => { const r = placed[i]; if (!r) return; if (k === 'bk') toBasket([item(r)], b); if (k === 'ins') toInsert(cfg, setOf(cfg, [row(r)]), b); }}};
        return mount(page, cfg);
    }

    /** ▦ une liste de résultats quelconque (dépouillements, Que manque-t-il ?, transcriptions, INSEE, SocFace, sites…) :
     *  list, cells(o) → [colonnes], itemOf(o) → élément du panier (défaut : une ligne), geoOf(o) → {lat, lon, place, tag?} | null.
     *  La carte : un point par lieu (le nombre de lignes dedans) ; sa fiche dit les lignes de l'endroit. */
    function table(page, {key, title, criteria, columns, list, cells, itemOf, geoOf, idOf, rowSel, rowAttr, color = '#1971c2', storeKey, hoverIds, legend}) {
        const L = () => (typeof list === 'function' ? list() || [] : list || []);
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria || title}`, url: ''};
        const it = itemOf || (o => { const c = cells(o); return {kind: 'row', ref_id: 0, title: String(c[0] ?? ''), value: c.slice(1).filter(x => x !== '' && x != null).join(' · '), data: {columns, row: c}, origin}; });
        const byId = new Map(idOf ? L().map(o => [String(idOf(o)), o]) : []);
        const groups = new Map();
        if (geoOf) L().forEach(o => { let g = null; try { g = geoOf(o); } catch (_) {} if (!g || g.lat == null || g.lon == null || g.lat === '' || !Number.isFinite(Number(g.lat))) return; const k = `${Number(g.lat).toFixed(5)},${Number(g.lon).toFixed(5)}`; if (!groups.has(k)) groups.set(k, {g, rows: []}); groups.get(k).rows.push(o); });
        const G = [...groups.values()];
        const cardOf = i => { const x = G[i]; if (!x) return null; const one = x.rows.length === 1, c0 = cells(x.rows[0]);
            const lines = one ? columns.slice(1).map((h, j) => [h, esc(c0[j + 1] ?? '')]) : [[T('Lignes'), x.rows.slice(0, 8).map(o => { const c = cells(o); return `• ${esc(c.slice(0, 3).filter(Boolean).join(' — '))}`; }).join('<br>') + (x.rows.length > 8 ? `<br><small class="muted">${esc(T('+ {n} autres', {n: x.rows.length - 8}))}</small>` : '')]];
            const who = x.rows.flatMap(o => (hoverIds ? hoverIds(o) : [])).filter(Boolean);
            return {title: one ? String(c0[0] ?? '') : `${x.g.place || ''} · ${x.rows.length}`, lines, src: esc(criteria || title), ins: !kiosk(), bk: !kiosk(), _rows: x.rows, _who: who}; };
        const cfg = {key, storeKey, title, criteria: criteria || title, columns, selected: () => null, rowSel, rowAttr,
            rows: () => L().map(cells), items: () => L().map(it),
            rowItems: idOf && rowSel ? id => { const o = byId.get(String(id)); return o ? {items: [it(o)], rows: [cells(o)]} : null; } : null,
            map: G.length ? {points: G.map(x => ({lat: Number(x.g.lat), lon: Number(x.g.lon), label: `${x.g.place || ''}${x.rows.length > 1 ? ` · ${x.rows.length}` : ''}`, tag: x.g.tag, color: x.g.tag ? undefined : color, n: x.rows.length > 1 ? String(x.rows.length) : '', rowIds: x.rows.flatMap(o => (hoverIds ? hoverIds(o) : idOf ? [idOf(o)] : []))})),
                legend: legend ? [{color, label: legend}] : [], card: cardOf, onAct: (k, i, b) => { const c = cardOf(i); if (!c) return; if (k === 'bk') toBasket(c._rows.map(it), b); if (k === 'ins') toInsert(cfg, setOf(cfg, c._rows.map(cells), columns, `${title} · ${c.title}`), b); }} : null};
        return mount(page, cfg);
    }

    /** 👤 une liste de personnes (☑ la barre d'app-recherche-outils.js : texte, lien de parenté, comparer deux recherches) — pas de carte */
    function people(page, {people: ps, title, criteria, head, row, nameOf, key = 'people'}) {
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria || title}`, url: ''};
        const byId = new Map(ps.map(p => [String(p.id), p]));
        const list = sel => (sel ? sel.map(id => byId.get(String(id))).filter(Boolean) : ps);
        const it = p => personItem({id: p.id, name: nameOf(p), value: row(p).slice(1).filter(x => x && x !== '—').join(' · ')}, origin);
        // 🗺 si les fiches ont des lieux placés (« places » : naissance, mariage, décès… donnés par le serveur)
        const pts = ps.flatMap(p => (p.places || []).map(g => ({lat: g.lat, lon: g.lon, tag: g.gedcom_tag, label: `${nameOf(p)} · ${g.type} · ${g.date} · ${g.place}`, rowIds: [p.id], _p: p, _g: g})));
        const cfg = {key, title, criteria: criteria || title, columns: head, rows: sel => list(sel).map(row), items: sel => list(sel).map(it),
            rowItems: id => { const p = byId.get(String(id)); return p ? {items: [it(p)], rows: [row(p)]} : null; },
            map: pts.length ? {points: pts, card: i => { const x = pts[i]; return x ? {title: `${x._g.type} — ${x._g.date}`, lines: [[T('Personne'), link({id: x._p.id, name: nameOf(x._p)})], [T('Lieu'), esc(x._g.place)]], src: esc(criteria || title), ins: !kiosk(), bk: !kiosk()} : null; },
                onAct: (k, i, b) => { const x = pts[i]; if (!x) return; if (k === 'bk') toBasket([it(x._p)], b); if (k === 'ins') toInsert(cfg, setOf(cfg, [row(x._p)]), b); }} : null};
        return mount(page, cfg);
    }

    /** 🧾 Sources et citations (app-recherche-outils.js) : les sources trouvées, sans carte */
    function sources(page, {sources: list, criteria}) {
        const origin = {kind: 'research', label: `${T('Recherche')} · ${criteria}`, url: ''};
        const row = s => [s.title || '', s.author || '', s.snippet || ''];
        return mount(page, {key: 'sources', title: T('Sources et citations'), criteria, columns: [T('Source'), T('Auteur'), T('Extrait')], selected: () => null,
            rows: () => list.map(row), items: () => list.map(s => ({kind: 'source', ref_id: Number(s.id) || 0, title: s.title || T('Source sans titre'), value: s.author || '', origin}))});
    }

    /* 🌍 Où chercher ? : les sites proposés (l'onglet montré) → 🧺 au panier comme liens, 📎 un tableau « site · pourquoi · lien » ; pas de carte (des sites, pas des lieux) */
    const linkCells = a => [a.label, a.why, a.href];
    const linkItem = (crit) => a => ({kind: 'datum', ref_id: 0, title: a.label, value: a.href, data: {url: a.href, why: a.why}, origin: {kind: 'link', label: a.label, url: a.href}});
    {
        const oc = ext.ouChercher = ext.ouChercher || {};
        (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
            const page = body?.closest?.('.page'); if (!page || S0().researchKind !== 'ou_chercher') return;
            const list = () => [...body.querySelectorAll('.ouc-row')].map(li => ({label: li.querySelector('.ouc-name b')?.textContent.trim() || '', why: li.querySelector('.ouc-why')?.textContent.trim() || '', href: li.querySelector('a[data-ouc-go]')?.href || ''})).filter(x => x.label && /^https?:/i.test(x.href));
            if (!list().length) { page.__rk?.destroy?.(); return; }
            const name = view?.res?.ctx?.name || '', crit = `${T('Où chercher ?')}${name ? ` · ${name}` : ''}`;
            table(page, {key: 'ou_chercher', title: crit, criteria: crit, columns: [T('Site'), T('Pourquoi'), T('Lien')], list, cells: linkCells, itemOf: linkItem(crit)});
        });
    }
    const S0 = () => A().state || {};
    /** 🌐 Chercher sur internet : les liens des sites (les cochés, sinon tous) */
    function webLinks(page, {criteria}) {
        const all = () => [...page.querySelectorAll('a[data-ws-site]')].filter(a => /^https?:/i.test(a.getAttribute('href') || ''));
        const list = () => { const on = all().filter(a => page.querySelector(`[data-ws-pick="${CSS.escape(a.dataset.wsSite)}"]`)?.checked); return (on.length ? on : all()).map(a => ({label: a.textContent.replace(/\s+/g, ' ').replace(/↗/g, '').trim(), why: '', href: a.href})); };
        const K = table(page, {key: 'web', title: T('Chercher sur internet'), criteria: criteria(), columns: [T('Site'), T('Pourquoi'), T('Lien')], list, cells: linkCells, itemOf: linkItem()});
        if (K) Object.defineProperty(K.cfg, 'criteria', {get: criteria, configurable: true}); // la source suit ce qui est tapé
        return K;
    }

    ext.researchKit = {mount, personItem, setOf, kindOf, colorOf, proximity, dates, places, people, sources, table, webLinks};
})();
