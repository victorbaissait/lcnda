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
        const K = page.__rk = {cfg, destroy: () => { page.querySelectorAll('[data-rk-own]').forEach(x => x.remove()); const old = page.querySelector('[data-rp-export][data-rk-hidden]'); if (old) { old.hidden = false; delete old.dataset.rkHidden; } page.classList.remove('rk-page'); }};
        page.classList.add('rk-page');
        const picked = () => { try { const s = cfg.selected ? cfg.selected() : [...page.querySelectorAll('[data-rp-pick]:checked')].map(c => Number(c.dataset.rpPick)); return s && s.length ? s : null; } catch (_) { return null; } };
        const nOf = () => { const s = picked(); return s ? s.length : null; };
        /* ⤓ Exporter ▾ : un menu (l'export d'avant, puis 🧺 et 📎) */
        const old = page.querySelector('.page-header [data-rp-export]');
        let exp = null;
        if (old) {
            exp = document.createElement('button'); exp.type = 'button'; exp.className = old.className; exp.dataset.rkExport = ''; exp.dataset.rkOwn = ''; exp.setAttribute('aria-haspopup', 'menu');
            exp.textContent = T('⤓ Exporter ▾'); old.hidden = true; old.dataset.rkHidden = ''; old.before(exp);
            exp.addEventListener('click', () => {
                const n = nOf(), what = n ? T('les {n} cochés', {n}) : T('tout');
                const items = [{icon: '📊', label: T('CSV ou impression…'), run: () => old.click()}];
                if (!kiosk()) items.push('-', {icon: '🧺', label: n ? T('Mettre dans le panier ({n} cochés)', {n}) : T('Mettre dans le panier'), run: () => toBasket(cfg.items(picked()), exp)},
                    {icon: '📎', label: n ? T('Insérer… ({n} cochés)', {n}) : T('Insérer…'), help: T('Dans une note, une enquête, une fiche, l’Atelier… (avec la source)'), run: () => toInsert(cfg, setOf(cfg, cfg.rows(picked())), exp)});
                UI().menuAt ? UI().menuAt(exp, items, {title: T('⤓ Exporter {what}', {what})}) : old.click();
            });
        }
        /* 📎 🧺 au bout de chaque résultat */
        const rowEls = cfg.rowSel ? [...page.querySelectorAll(cfg.rowSel)] : [...page.querySelectorAll('[data-rp-pick]')].map(c => c.closest('article, tr')).filter(Boolean);
        rowEls.forEach(el => { const id = el.dataset.rkRow ?? el.querySelector('[data-rp-pick]')?.dataset.rpPick; if (id != null) el.dataset.rkId = id; });
        if (!kiosk() && cfg.rowItems) {
            rowEls.forEach(el => {
                if (el.dataset.rkId == null) return;
                el.classList.add('rk-row');
                const box = document.createElement('span'); box.className = 'rk-row-acts'; box.dataset.rkOwn = '';
                box.innerHTML = `<button type="button" class="rk-ico" data-rk-ins title="${esc(T('Insérer (avec la source)'))}" aria-label="${esc(T('Insérer (avec la source)'))}">📎</button><button type="button" class="rk-ico" data-rk-bk title="${esc(T('Mettre au panier'))}" aria-label="${esc(T('Mettre au panier'))}">🧺</button>`;
                (el.tagName === 'TR' ? el.lastElementChild : el).appendChild(box);
            });
            page.addEventListener('click', e => {
                const b = e.target.closest('[data-rk-ins], [data-rk-bk]'); if (!b || !page.contains(b) || b.closest('.cf-card')) return;
                const id = b.closest('[data-rk-id]')?.dataset.rkId; if (id == null) return;
                let r = null; try { r = cfg.rowItems(id); } catch (x) { console.error(x); } if (!r) return;
                if (b.matches('[data-rk-bk]')) toBasket(r.items || [], b);
                else toInsert(cfg, setOf(cfg, r.rows || [], r.columns || cfg.columns, r.title || cfg.title), b);
            });
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
            page.addEventListener('mouseover', e => { const r = rowOf(e.target); if (r && page.contains(r) && !panel.contains(r)) hi(r.dataset.rkId); });
            page.addEventListener('mouseout', e => { const r = rowOf(e.target); if (r && !r.contains(e.relatedTarget)) hi(null); });
            page.addEventListener('focusin', e => { const r = rowOf(e.target); if (r && !panel.contains(r)) hi(r.dataset.rkId); });
            K.open = on => set(on); K.highlight = hi; K.points = pts;
        }
        return K;
    }

    ext.researchKit = {mount, personItem, setOf, kindOf, colorOf};
})();
