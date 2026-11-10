/**
 * 🌍 « Où chercher ? » et 🧩 « Les murs de brique » — les écrans (le moteur de pertinence est dans app-ou-chercher-core.js,
 * les données dans lib/ou_chercher.php).
 *
 * Construit sur l'existant, sans rien recopier :
 *  - les sites : la liste de « Chercher sur internet » (A().webSearchAllSites : app.js, lots « sources ouvertes », Mes sites)
 *    et les registres des lots (window.LCNDA_SOURCES_OUVERTES*, LCNDA_SO4…) lus À CHAQUE FOIS : un lot ajouté plus tard compte
 *    tout seul ; les adresses sont remplies par le même mécanisme (A().webSearchParams), le site s'ouvre dans le navigateur ;
 *  - « Gratuites seulement » : le réglage existant (LCNDA_EXT.sourcesOuvertes6.freeOnly, clé genealogie-sources-gratuites) ;
 *  - ✓ déjà cherché : un dépouillement du Journal des recherches (POST save_archive_digest, template_key « ouc:<site> ») ;
 *  - ＋ En faire une piste : une piste d'enquête (POST ou_chercher_piste) ;
 *  - Murs de brique : liste H10 (UI.listBar), statut K8, ↶ Annuler (H7), widget du tableau de bord (même moteur de widgets),
 *    une ligne par semaine dans « 🗓 Ma semaine de recherche » (lib/semaine.php).
 * Entrées : fiche (bloc « 🌍 Où chercher ? », menu ⋯ : « 🌍 Où chercher ? », « 🧱 Je bloque ici »), Recherche → Type de
 * recherche (« 🌍 Où chercher ? », « 🧩 Murs de brique »), widget « 🧩 Murs de brique ». Aucune requête sortante.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const C = () => window.LCNDA_OU_CHERCHER;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await api(action, {}, {method: 'POST', body}); return r?.result || r; };
    const plural = (n, w, pl) => (A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const lsJson = k => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } };
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const when = d => (d && UI().when ? UI().when(d) : esc(String(d || '').slice(0, 10)));
    const STATUS = {open: ['À chercher', ''], progress: ['En cours', 'blue'], solved: ['Résolu', 'green'], abandoned: ['Abandonné', 'grey']};
    const RESULT = {found: ['Trouvé', 'green'], none: ['Rien trouvé', 'grey'], partial: ['En partie', 'yellow'], review: ['À revoir', 'yellow']};
    const MISS = {both: 'ses deux parents', father: 'son père', mother: 'sa mère', '': 'rien (marqué à la main)'};

    /* ═════════════════════ « Gratuites seulement » : le réglage qui existe déjà ═════════════════════ */
    const FREE_KEY = () => window.LCNDA_SOURCES_OUVERTES_6?.FREE_KEY || 'genealogie-sources-gratuites';
    const freeOnly = () => (ext.sourcesOuvertes6?.freeOnly ? !!ext.sourcesOuvertes6.freeOnly() : lsGet(FREE_KEY(), '1') !== '0');
    const setFreeOnly = on => { if (ext.sourcesOuvertes6?.setFreeOnly) ext.sourcesOuvertes6.setFreeOnly(!!on); else lsSet(FREE_KEY(), on ? '1' : '0'); };

    /* ═════════════════════ le registre des sites, lu à chaque fois ═════════════════════ */
    /** les registres des lots « sources ouvertes » présents dans la page : LCNDA_SOURCES_OUVERTES, …_2 … _N, LCNDA_SO4… */
    function lots() {
        const out = [];
        Object.keys(window).forEach(name => {
            const m = name.match(/^LCNDA_(?:SOURCES_OUVERTES(?:_(\d+))?|SO(\d+))$/); if (!m) return;
            const G = window[name]; if (!G || !Array.isArray(G.SITES) || typeof G.url !== 'function') return;
            const n = Number(m[1] || m[2] || 1);
            out.push({n, G, prefix: n === 1 ? 'so_' : `so${n}_`});
        });
        return out.sort((a, b) => a.n - b.n);
    }
    /** les adresses que la personne a changées pour un lot (« ⚙️ Adresses des sites ») */
    function lotCustom(n) {
        const raw = lsJson(n === 1 ? 'genealogie-sources-ouvertes-sites' : `genealogie-sources-ouvertes-${n}-sites`) || {};
        return raw.urls && typeof raw.urls === 'object' ? {...raw.urls, cercles: raw.cercles || {}} : raw;
    }
    const groupCountry = (G, gid) => { const g = Array.isArray(G.GROUPS) ? G.GROUPS.find(x => x.id === gid || x.key === gid) : G.GROUPS?.[gid]; return g?.country || ''; };
    const META = ['icon', 'country', 'countries', 'years', 'where', 'on', 'place', 'region', 'paid', 'partlyPaid', 'note', 'rel', 'copy', 'needs', 'account', 'sensitive', 'existing'];
    /**
     * Tous les sites, au format du moteur : {key, label, group, icon, url(p), lot?, raw?, …règles}. D'abord ceux de « Chercher sur
     * internet » (mêmes clés, mêmes adresses), puis ceux des lots qui n'y sont pas ; les champs de règles des lots sont recopiés.
     */
    function allSites() {
        const map = new Map();
        (A()?.webSearchAllSites?.() || []).forEach(el => {
            if (!Array.isArray(el) || !el[0] || typeof el[3] !== 'function') return;
            const meta = el[4] && typeof el[4] === 'object' ? el[4] : {};
            map.set(String(el[0]), {key: String(el[0]), label: String(el[1] || el[0]).replace(/^\p{Extended_Pictographic}️?\s*/u, ''), group: el[2] || '', icon: meta.icon || '', url: el[3], ...meta});
        });
        const S6 = window.LCNDA_SOURCES_OUVERTES_6;
        lots().forEach(({n, G, prefix}) => {
            const custom = lotCustom(n);
            G.SITES.forEach(s => {
                if (!s || !s.key) return;
                if (Object.keys(s).some(k => /^lot\d$/.test(k) && map.has(`so${k.slice(3)}_${s[k]}`))) return; // déjà dans un autre lot
                const keys = [`${prefix}${s.key}`, s.key, s.existing, s.existing && `${prefix}${s.existing}`].filter(Boolean);
                const hit = keys.map(k => map.get(k)).find(Boolean);
                const meta = {};
                META.forEach(k => { if (s[k] !== undefined) meta[k] = s[k]; });
                if (!meta.country) { const c = groupCountry(G, s.group); if (c) meta.country = c; }
                if (s.partlyPaid) meta.paid = 'partiel'; else if (s.group === 'payant' && meta.paid === undefined) meta.paid = true; // Geneanet : gratuit, une partie payante
                if (hit) { META.forEach(k => { if (hit[k] === undefined && meta[k] !== undefined) hit[k] = meta[k]; }); hit.lot = hit.lot || G; hit.raw = hit.raw || s.key; return; }
                map.set(`${prefix}${s.key}`, {key: `${prefix}${s.key}`, label: String(s.label || s.key), group: s.group || '', lot: G, raw: s.key, ...meta,
                    url: p => G.url(s.key, p, custom)});
            });
        });
        if (S6) { (S6.PAID || []).forEach(k => { if (map.has(k)) map.get(k).paid = true; }); Object.keys(S6.PARTLY_PAID || {}).forEach(k => { if (map.has(k) && !map.get(k).paid) map.get(k).paid = 'partiel'; }); }
        return [...map.values()];
    }

    /** les adresses des Archives des départements de sa vie (une proposition par département) */
    function deptSites(ctx) {
        return ctx.depts.slice(0, 4).map(d => ({key: `ouc_ad_${d.code}`, icon: '🏛', label: `${d.service || 'Archives du département'} — état civil et registres paroissiaux`, group: 'Archives',
            url: () => d.url || `https://www.google.com/search?q=${encodeURIComponent(`${d.service || 'archives départementales ' + d.name} état civil registres paroissiaux en ligne ${d.place || ''}`.trim())}`,
            rel: {countries: ['fr'], base: 1.6, missing: ['birth', 'death', 'marriage', 'parents', 'father', 'mother'], why: c => {
                const at = d.place ? `${d.place} (${d.name})` : d.name;
                if (c.missing.has('birth')) return `Naissance inconnue : les registres de ${at}, en ligne${c.by ? `, autour de ${c.by}` : ''}`;
                if (c.missing.has('parents') || c.missing.has('father') || c.missing.has('mother')) return `Parents inconnus : son acte de ${c.tags.has('MARR') ? 'mariage' : 'naissance'} à ${at} donne le nom de ses parents`;
                if (c.missing.has('death')) return `Décès inconnu : les registres de ${at}`;
                return `${c.female ? 'Elle a vécu' : 'Il a vécu'} à ${at} : l’état civil et les registres paroissiaux en ligne`;
            }}}));
    }

    /* ═════════════════════ une personne : ses données, ses propositions ═════════════════════ */
    const cache = new Map();
    async function loadPerson(pid, {detail = null, fresh = false} = {}) {
        if (!fresh && cache.has(pid)) return cache.get(pid);
        const [raw, det] = await Promise.all([api('ou_chercher_person', {id: pid}), detail ? Promise.resolve(detail) : api('person', {id: pid})]);
        const data = {raw, detail: det};
        cache.set(pid, data);
        return data;
    }
    /** les paramètres de l'adresse : le même mécanisme que « Chercher sur internet » (nom, années de vie, lieu de naissance) */
    function paramsOf(data, ctx) {
        let p = null;
        try {
            const wctx = A().webSearchContext(data.detail);
            const life = A().webSearchLifeRange ? A().webSearchLifeRange(wctx) : {from: ctx.by, to: ctx.dy};
            p = A().webSearchParams(wctx, {years: true, y1: life.from, y2: life.to, place: wctx.places?.[0]?.value || '', spouse: ''});
        } catch (_) { p = {first: ctx.first, last: ctx.last, name: ctx.name, place: ctx.places[0] || '', y1: ctx.by, y2: ctx.dy, year: ctx.by, q: `"${ctx.name}"`}; }
        const d = ctx.birthDept || ctx.depts[0] || null;
        return {...p, birthYear: p.birthYear || ctx.by || '', deathYear: p.deathYear || (ctx.deathKnown ? ctx.dy : ''), dept: d?.code || '', deptCode: d?.code || '', deptName: d?.name || '', county: d?.name || '',
            adUrl: d?.url || '', country: ctx.birthCountry ? (C().COUNTRY_NAME[ctx.birthCountry] || '') : '', port: p.place || '', insee: ''};
    }
    /** les propositions rangées pour une personne */
    function suggest(data, {free = freeOnly()} = {}) {
        const ctx = C().context(data.raw);
        const S6 = window.LCNDA_SOURCES_OUVERTES_6;
        ctx.regions = S6?.regionOf ? [...new Set(ctx.depts.map(d => S6.regionOf({insee: d.code})?.key).filter(Boolean))] : [];
        const p = paramsOf(data, ctx);
        const sites = [...deptSites(ctx), ...allSites()].filter(s => {
            if (s.needs === 'adUrl' && !p.adUrl) return false;
            if (s.needs && s.needs !== 'adUrl' && !(s.needs === 'place' && p.place)) return false;
            return true;
        });
        sites.forEach(s => { try { s.href = A().safeUrl ? A().safeUrl(s.url(p)) : s.url(p); } catch (_) { s.href = ''; } try { s.host = new URL(s.href).hostname; } catch (_) { s.host = ''; } });
        const ok = sites.filter(s => s.href && /^https?:\/\//i.test(s.href));
        const r = C().rank(ok, ctx, {freeOnly: free});
        // deux propositions du même site pour la même raison : une seule
        const seen = new Set(); r.list = r.list.filter(x => { const k = `${x.site.host}|${x.reasons[0] || ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
        return {ctx, p, ...r};
    }

    /* ═════════════════════ l'affichage d'une proposition ═════════════════════ */
    const PAID_BADGE = {paid: ['Payant', 'red'], partly: ['En partie payant', 'yellow'], library: ['Gratuit en bibliothèque', 'blue']};
    function rowHtml(x, {compact = false} = {}) {
        const s = x.site, pb = PAID_BADGE[x.paid], prev = x.searched;
        const res = prev ? (prev.status === 'review' ? RESULT.review : RESULT[prev.result] || ['Cherché', 'grey']) : null;
        return `<li class="ouc-row${prev && prev.status !== 'review' ? ' is-done' : ''}" data-ouc-key="${esc(s.key)}">
            <span class="ouc-ico" aria-hidden="true">${esc(s.icon || (prev ? '✓' : '🌐'))}</span>
            <div class="ouc-main"><div class="ouc-name"><b>${esc(s.label)}</b>${pb ? ' ' + badge(pb[0], pb[1]) : ''}${res ? ` ${badge(res[0], res[1])} <small class="muted">${when(prev.date)}</small>` : ''}</div>
                <div class="ouc-why">${esc(x.reasons[0] || '')}</div>${!compact && x.reasons.length > 1 ? `<div class="ouc-why2">${x.reasons.slice(1).map(esc).join(' · ')}</div>` : ''}</div>
            <div class="ouc-acts"><a class="button small${prev && prev.status !== 'review' ? ' secondary' : ''}" href="${esc(s.href)}" target="_blank" rel="noopener noreferrer" data-ouc-go title="S’ouvre dans ton navigateur, avec son nom déjà rempli">↗ Chercher</a>${prev && prev.status !== 'review' ? '' : `<button type="button" class="button small secondary" data-ouc-done title="Noter dans le Journal des recherches ce que ça a donné">✓ Déjà cherché</button>`}<button type="button" class="icon-button small" data-ouc-more title="Plus d’actions" aria-label="Plus d’actions">⋯</button></div></li>`;
    }
    function listHtml(rows, opts = {}) { return rows.length ? `<ul class="ouc-list">${rows.map(x => rowHtml(x, opts)).join('')}</ul>` : ''; }

    /* ═════════════════════ ✓ déjà cherché (Journal des recherches), ＋ piste ═════════════════════ */
    const VIEWS = new Map(); // un affichage → {pid, data, res, redraw}
    let uid = 0;
    const viewOf = el => VIEWS.get(el.closest('[data-ouc-view]')?.dataset.oucView || '');
    async function markSearched(view, x, result) {
        const ctx = view.res.ctx, pid = view.pid;
        const status = result === 'review' ? 'review' : 'done';
        let id = 0;
        try {
            const r = await post('save_archive_digest', {id: 0, archive_service: x.site.label.slice(0, 200), archive_url: x.site.href, template_key: `ouc:${x.site.key}`.slice(0, 120), record_type: 'autre', status,
                result: result === 'review' ? '' : result, city_name: ctx.places[0] || '', department: (ctx.birthDept || ctx.depts[0])?.name || '', year_text: C().lifeText(ctx),
                searched: `${ctx.name} — ${x.site.label}${x.reasons[0] ? ` (${x.reasons[0]})` : ''} — proposé par « Où chercher ? »`.slice(0, 900), sought_ids: [pid]});
            id = Number(r?.id || 0);
        } catch (e) { A().toast(e.message, 'error', {retry: () => markSearched(view, x, result)}); return; }
        await refreshView(view);
        const label = {found: 'Trouvé', none: 'Rien trouvé', review: 'À revoir'}[result];
        A().undoToast(`✓ ${label} sur ${x.site.label} : noté dans le Journal des recherches`, {undo: async () => { if (id) await post('delete_archive_digest', {id}); await refreshView(view); }});
    }
    async function makeLead(view, x) {
        const ctx = view.res.ctx;
        let r;
        try { r = await post('ou_chercher_piste', {person_id: view.pid, title: `Chercher sur ${x.site.label}`.slice(0, 200), url: x.site.href, notes: `${x.reasons.join('. ')}. — proposé par « 🌍 Où chercher ? » pour ${ctx.name}.`}); }
        catch (e) { A().toast(e.message, 'error'); return; }
        await refreshView(view);
        A().undoToast(`＋ Piste ajoutée : « Chercher sur ${x.site.label} »${r.created ? ' (nouvelle enquête « Où chercher ? »)' : ''}`, {undo: async () => {
            if (r.item_id) await post('delete_investigation_item', {id: r.item_id});
            if (r.created && r.investigation_id) await post('delete_investigation', {id: r.investigation_id});
            await refreshView(view);
        }});
    }
    async function copyIfNeeded(x) {
        const s = x.site; if (!s.copy || !s.lot?.copyText) return;
        const t = s.lot.copyText(s.raw, x.p || {}); if (!t) return;
        try { await navigator.clipboard.writeText(t); A().toast(`« ${t} » est copié : colle-le dans la case de recherche du site (${A().keys?.text ? A().keys.text('⌘V') : '⌘V'}).`, 'success'); } catch (_) {}
    }
    document.addEventListener('click', e => {
        const t = e.target; const row = t.closest?.('[data-ouc-key]'); if (!row) return;
        const view = viewOf(row); if (!view?.res) return;
        const key = row.dataset.oucKey, x = [...view.res.list, ...view.res.searched].find(r => r.site.key === key); if (!x) return;
        x.p = view.res.p;
        if (t.closest('[data-ouc-go]')) { copyIfNeeded(x); return; } // le lien s'ouvre tout seul dans le navigateur
        if (t.closest('[data-ouc-done]')) {
            e.preventDefault();
            UI().menuAt?.(t.closest('[data-ouc-done]'), [
                {icon: '✓', label: 'Trouvé', run: () => markSearched(view, x, 'found')},
                {icon: '∅', label: 'Rien trouvé', run: () => markSearched(view, x, 'none')},
                {icon: '↻', label: 'À revoir', run: () => markSearched(view, x, 'review')},
            ], {title: 'Ce que ça a donné'});
            return;
        }
        if (t.closest('[data-ouc-more]')) { e.preventDefault(); UI().menuAt?.(t.closest('[data-ouc-more]'), menuItems(view, x), {title: x.site.label}); }
    });
    function menuItems(view, x) {
        return [{icon: '↗', label: 'Chercher sur ce site', run: () => { copyIfNeeded(x); window.open(x.site.href, '_blank', 'noopener'); }},
            {icon: '✓', label: 'Trouvé', run: () => markSearched(view, x, 'found')}, {icon: '∅', label: 'Rien trouvé', run: () => markSearched(view, x, 'none')}, {icon: '↻', label: 'À revoir', run: () => markSearched(view, x, 'review')},
            '-', {icon: '＋', label: 'En faire une piste', run: () => makeLead(view, x)},
            {icon: '📋', label: 'Copier l’adresse', run: async () => { try { await navigator.clipboard.writeText(x.site.href); A().toast('Adresse copiée.', 'success'); } catch (_) {} }}];
    }
    // K14 : clic droit sur une proposition = son menu ⋯
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('.ouc-row[data-ouc-key]'); if (!row || e.shiftKey || !UI().contextMenu) return;
        const view = viewOf(row); const x = view?.res && [...view.res.list, ...view.res.searched].find(r => r.site.key === row.dataset.oucKey); if (!x) return;
        x.p = view.res.p; e.preventDefault(); e.stopPropagation(); UI().contextMenu(e, menuItems(view, x), {title: x.site.label});
    }, true);
    async function refreshView(view) {
        try { view.data = await loadPerson(view.pid, {fresh: true, detail: view.data?.detail}); } catch (_) {}
        view.redraw?.();
    }

    /* ═════════════════════ 1. Le bloc de la fiche ═════════════════════ */
    const BLOCK_N = 5;
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.ou_chercher = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !C()) return '';
        return A().card(index, '🌍 Où chercher ?', '', `<div class="ouc-block" data-ouc-block="${Number(p.id)}">${UI().spinner ? UI().spinner('Je cherche les bons sites…') : '…'}</div>`, 'span-12',
            `<button type="button" class="button small secondary" data-ouc-page="${Number(p.id)}" title="Toutes les propositions, et celles déjà cherchées">Tout voir ↗</button>`);
    };
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(async detail => {
        const box = document.querySelector(`#workspace [data-ouc-block="${Number(detail?.person?.id) || 0}"]`); if (!box) return;
        const pid = Number(detail.person.id);
        const id = `b${++uid}`; box.dataset.oucView = id;
        const view = {pid, data: null, res: null};
        VIEWS.set(id, view);
        view.redraw = () => {
            if (!box.isConnected) { VIEWS.delete(id); return; }
            view.res = suggest(view.data);
            const top = view.res.list.slice(0, BLOCK_N);
            const n = view.res.list.length, done = view.res.searched.length;
            box.innerHTML = `<p class="ouc-intro">Les sites les plus utiles pour ${esc(view.res.ctx.name)}, d’après ses lieux, ses dates et ce qui manque. Chaque site s’ouvre dans ton navigateur, son nom déjà rempli.</p>
                ${freeToggle()}${top.length ? listHtml(top, {compact: true}) : A().empty('Aucun site à proposer pour cette fiche.', {icon: '🌍', hint: 'Ajoute un lieu ou une date : les propositions s’affinent.'})}
                <p class="ouc-foot">${n > BLOCK_N ? `<button type="button" class="link-button" data-ouc-page="${pid}">Voir les ${n - BLOCK_N} autres propositions ↓</button>` : ''}${done ? ` <span class="muted">· ✓ ${plural(done, 'site déjà cherché', 'sites déjà cherchés')}</span>` : ''}${view.res.hidden ? ` <span class="muted">· ${plural(view.res.hidden, 'site payant caché', 'sites payants cachés')}</span>` : ''}</p>`;
        };
        // le bloc grandit une fois rempli : si on est plus bas dans la fiche (adresse #personnes/1/documents…), rien ne bouge à l'écran
        const keep = fn => {
            const sc = (() => { for (let el = box.parentElement; el; el = el.parentElement) { const o = getComputedStyle(el).overflowY; if (/(auto|scroll)/.test(o) && el.scrollHeight > el.clientHeight) return el; } return document.scrollingElement; })();
            const above = box.getBoundingClientRect().bottom <= (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + 1;
            const h0 = box.offsetHeight; fn();
            if (above) sc.scrollTop += box.offsetHeight - h0;
        };
        try { view.data = await loadPerson(pid, {detail, fresh: true}); keep(() => view.redraw()); }
        catch (e) { box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); }
    });
    const freeToggle = () => `<label class="ui-toggle ouc-free" title="Cache les sites payants (le même réglage que dans « Archives en ligne »)"><input type="checkbox" data-ouc-free ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement</label>`;
    document.addEventListener('change', e => {
        if (!e.target.matches?.('[data-ouc-free]')) return;
        setFreeOnly(e.target.checked);
        VIEWS.forEach((v, k) => { if (v.redraw && v.data) v.redraw(); else VIEWS.delete(k); });
    });

    /* ═════════════════════ 2. La page (Recherche → 🌍 Où chercher ?) ═════════════════════ */
    const S = () => A().state;
    function openPerson(pid, kind = 'ou_chercher') {
        const st = S(); if (pid) st.oucPerson = Number(pid);
        st.researchKind = kind;
        if (kind === 'murs' && pid) st.oucOpenWall = Number(pid); // la page des murs l'ouvre une fois dessinée
        A().persistUiState?.();
        A().setModule('recherche');
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ouc-page]'); if (!b) return;
        e.preventDefault(); openPerson(Number(b.dataset.oucPage) || 0);
    });
    async function page(token, kind) {
        if (kind === 'murs') return wallsPage(token);
        const ws = document.getElementById('workspace'); const st = S();
        const pid = Number(st.oucPerson || st.currentPersonId || 0);
        const id = `p${++uid}`;
        ws.innerHTML = `<section class="page ouc-page" data-ouc-view="${id}">${UI().pageHeader({where: 'Recherche', icon: '🌍', title: 'Où chercher ?',
            help: 'Pour une personne, les sites à consulter, les plus utiles d’abord : d’après ses lieux, son époque, son métier ou sa vie (soldat, marin, émigré…) et ce qui manque. Chaque site s’ouvre dans ton navigateur avec son nom déjà rempli ; note ensuite ce que ça a donné.',
            actions: ['<button type="button" class="button secondary" data-ouc-to-walls>🧩 Murs de brique</button>']})}
            <div class="ouc-who"><span class="pk-lab">Pour qui ?</span>${A().pickerField ? A().pickerField({name: 'ouc_person', kind: 'person', value: pid || null}) : ''}</div>
            <div data-ouc-body>${pid ? (UI().spinner ? UI().spinner('Je cherche les bons sites…') : '…') : A().emptyState({icon: '🌍', text: 'Choisis une personne', hint: 'Ses lieux, ses dates et ce qui manque décident des sites proposés.'})}</div></section>`;
        ws.querySelector('[data-ouc-to-walls]').addEventListener('click', () => openPerson(0, 'murs'));
        ws.querySelector('.ouc-who').addEventListener('picker-change', e => { const v = Number(e.detail?.value) || 0; if (v) { st.oucPerson = v; A().persistUiState?.(); load(v); } });
        const body = ws.querySelector('[data-ouc-body]');
        const view = {pid, data: null, res: null, tab: 'todo', shown: 15};
        VIEWS.set(id, view);
        view.redraw = () => {
            if (!body.isConnected) { VIEWS.delete(id); return; }
            const res = view.res = suggest(view.data);
            const ctx = res.ctx, todo = res.list, done = res.searched;
            const facts = [ctx.by ? `${C().lifeText(ctx)}` : '', ...[...ctx.countries.keys()].map(c => C().COUNTRY_NAME[c] || c), ...ctx.depts.map(d => d.name), ...[...ctx.profiles].filter(k => C().PROFILES[k]).map(k => `${C().PROFILES[k][0]} ${C().PROFILES[k][1]}`), ...[...ctx.missing].map(m => `❓ ${C().MISSING[m]}`)].filter(Boolean);
            const tabs = [['todo', `Proposés (${todo.length})`], ['done', `✓ Déjà cherchés (${done.length})`], ['out', `Écartés (${res.out.length})`]];
            const rows = view.tab === 'done' ? done : view.tab === 'out' ? [] : todo;
            body.innerHTML = `<div class="ouc-facts" aria-label="Ce qui compte pour choisir">${facts.map(f => `<span class="ouc-fact">${esc(f)}</span>`).join('')}</div>
                <div class="ouc-bar"><div class="ui-filters" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="${view.tab === k ? 'is-active' : ''}" data-ouc-tab="${k}">${esc(l)}</button>`).join('')}</div>${freeToggle()}
                <button type="button" class="button small secondary" data-ouc-open-person="${view.pid}">↗ Fiche</button><button type="button" class="button small secondary" data-ouc-wall-toggle>${view.data.raw.wall?.manual ? '🧱 Ne plus bloquer ici' : '🧱 Je bloque ici'}</button></div>
                ${view.tab === 'out' ? (res.out.length ? `<ul class="ouc-out">${res.out.slice(0, 200).map(o => `<li><b>${esc(o.site.label)}</b> <span class="muted">— ${esc(o.why)}</span></li>`).join('')}</ul>` : A().empty('Aucun site écarté.', {icon: '🌍'}))
                    : rows.length ? listHtml(rows.slice(0, view.shown)) + (rows.length > view.shown ? `<button type="button" class="ui-more" data-ouc-more-rows>${rows.length - view.shown === 1 ? 'Voir le suivant ↓' : `Voir les ${Math.min(15, rows.length - view.shown)} suivants ↓`}</button>` : '')
                    : view.tab === 'done' ? A().empty('Rien n’a encore été noté pour cette personne.', {icon: '✓', hint: 'Après une recherche, « ✓ Déjà cherché » la note dans le Journal des recherches.'})
                    : A().empty('Aucun site à proposer.', {icon: '🌍', hint: res.hidden ? `${plural(res.hidden, 'site payant est caché', 'sites payants sont cachés')} : décoche « Gratuites seulement ».` : 'Ajoute un lieu ou une date sur la fiche.'})}
                ${view.tab === 'todo' && res.hidden ? `<p class="ui-hint">${plural(res.hidden, 'site payant caché', 'sites payants cachés')} par « Gratuites seulement ».</p>` : ''}
                ${view.data.raw.leads?.length ? `<details class="ouc-leads"><summary>📌 ${plural(view.data.raw.leads.length, 'piste d’enquête', 'pistes d’enquête')}</summary><ul>${view.data.raw.leads.slice(0, 20).map(l => `<li>${esc(l.title)} <small class="muted">· ${esc(l.investigation)}</small> <button type="button" class="link-button" data-ouc-inv="${l.investigation_id}">↗ Ouvrir</button></li>`).join('')}</ul></details>` : ''}`;
        };
        body.addEventListener('click', async e => {
            const tb = e.target.closest('[data-ouc-tab]'); if (tb) { view.tab = tb.dataset.oucTab; view.shown = 15; view.redraw(); return; }
            if (e.target.closest('[data-ouc-more-rows]')) { view.shown += 15; view.redraw(); return; }
            const op = e.target.closest('[data-ouc-open-person]'); if (op) { S().currentPersonId = view.pid; A().setModule('personnes'); return; }
            const inv = e.target.closest('[data-ouc-inv]'); if (inv) { Object.assign(S(), {currentInvestigationId: Number(inv.dataset.oucInv), enquetesTab: 'enquetes'}); A().setModule('enquetes'); return; }
            if (e.target.closest('[data-ouc-wall-toggle]')) { await toggleManual(view.pid, view.data.raw.person?.name || '', !view.data.raw.wall?.manual); await refreshView(view); }
        });
        async function load(p) {
            view.pid = p; body.innerHTML = UI().spinner ? UI().spinner('Je cherche les bons sites…') : '…';
            try { view.data = await loadPerson(p, {fresh: true}); } catch (e) { body.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
            if (token !== S().workspaceToken) return;
            view.redraw();
        }
        if (pid) await load(pid);
    }

    /* ═════════════════════ 3. Les murs de brique ═════════════════════ */
    async function wallSave(pid, body) { return post('mur_save', {person_id: pid, ...body}); }
    async function toggleManual(pid, name, on) {
        let r; try { r = await wallSave(pid, {manual: on ? 1 : 0}); } catch (e) { A().toast(e.message, 'error'); return null; }
        A().undoToast(on ? `🧱 ${name || 'Cette personne'} : ajoutée aux murs de brique` : `🧱 ${name || 'Cette personne'} : ne bloque plus ici`, {undo: async () => { await post('mur_restore', {person_id: pid, prev: r.prev}); refreshWalls(); }});
        refreshWalls(); return r;
    }
    async function setStatus(pid, name, status, after) {
        let r; try { r = await wallSave(pid, {status}); } catch (e) { A().toast(e.message, 'error'); return; }
        const undo = async () => { await post('mur_restore', {person_id: pid, prev: r.prev}); await after?.(); refreshWalls(); };
        if (status === 'solved') A().undoToast(`🎉 Bravo ! Le mur de ${name} est tombé : une génération de plus à découvrir.`, {undo, icon: '🎉'});
        else A().undoToast(`🧩 ${name} : ${STATUS[status][0].toLowerCase()}`, {undo});
        await after?.(); refreshWalls();
    }
    const wallsState = {data: null};
    async function loadWalls() { wallsState.data = await api('murs_de_brique'); congratulate(wallsState.data); return wallsState.data; }
    /** un mur tombé tout seul (ses parents sont maintenant dans la base) : félicitations, une seule fois */
    function congratulate(d) {
        (d?.newly_solved || []).forEach(w => A().undoToast?.(`🎉 Bravo ! Le mur de ${w.name} est tombé : ses parents sont maintenant dans ta base.`, {icon: '🎉'}));
    }
    function refreshWalls() {
        if (S()?.module === 'recherche' && S().researchKind === 'murs' && document.querySelector('#workspace .ouc-walls')) wallsPaint?.();
        document.querySelectorAll('[data-ouc-walls-widget]').forEach(el => paintWidget(el));
    }
    const avatar = w => (UI().avatarOn?.() && UI().avatar ? UI().avatar({id: w.person_id, first_name: w.first_name, last_name: w.last_name, gender: w.gender, kind: w.kind}, 34)
        : `<span class="ouc-av is-${w.gender === 'female' ? 'f' : w.gender === 'male' ? 'm' : 'u'}" aria-hidden="true">${esc(((w.first_name || '?')[0] + (w.last_name || '')[0] || '').toUpperCase())}</span>`);
    const lifeOf = w => [w.birth ? `° ${w.birth.year || '?'}${w.birth.place ? ' ' + w.birth.place.split(',')[0] : ''}` : '', w.death ? `† ${w.death.year || '?'}${w.death.place ? ' ' + w.death.place.split(',')[0] : ''}` : ''].filter(Boolean).join(' · ');
    const statusBadge = w => (STATUS[w.status]?.[1] ? badge(STATUS[w.status][0], STATUS[w.status][1]) : '');
    let wallsPaint = null;
    async function wallsPage(token) {
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page ouc-walls">${UI().pageHeader({where: 'Recherche', icon: '🧩', title: 'Murs de brique',
            help: 'Les ancêtres où tu bloques : un parent ou les deux manquent, ou tu l’as marqué « 🧱 Je bloque ici ». Pour chacun : ce qui a déjà été cherché, les sites à essayer, les indices de ta base.',
            primary: '<button type="button" class="button" data-ouc-wall-add>＋ Ajouter un mur…</button>', actions: ['<button type="button" class="button secondary" data-ouc-to-where>🌍 Où chercher ?</button>']})}
            <div data-ouc-wall-bar></div><div data-ouc-wall-list>${UI().spinner ? UI().spinner('Je cherche les murs…') : '…'}</div><div data-ouc-wall-more></div></section>`;
        ws.querySelector('[data-ouc-to-where]').addEventListener('click', () => openPerson(0, 'ou_chercher'));
        ws.querySelector('[data-ouc-wall-add]').addEventListener('click', async () => {
            const it = await (window.LCNDA_PICKER || A()).openPicker?.({kind: 'person', title: 'Sur qui bloques-tu ?'});
            if (!it || !Number(it.id)) return;
            await toggleManual(Number(it.id), it.title || '', true);
        });
        let d;
        try { d = await loadWalls(); } catch (e) { ws.querySelector('[data-ouc-wall-list]').innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        if (token !== S().workspaceToken) return;
        let shown = 40;
        const gens = [...new Set(d.items.map(w => w.generation).filter(Boolean))].sort((a, b) => a - b);
        const bar = UI().listBar({key: 'recherche:murs', search: {placeholder: 'Chercher un nom… (ex. Martin, Naves)'},
            filters: [{id: 'status', label: 'Statut', type: 'check', options: Object.entries(STATUS).map(([k, v]) => [k, v[0], v[0], d.counts[k] || 0]), value: ['open', 'progress']},
                {id: 'miss', label: 'Ce qui manque', type: 'check', options: [['both', 'Les deux parents', 'Deux parents', d.counts.both || 0], ['father', 'Le père', 'Père', d.counts.father || 0], ['mother', 'La mère', 'Mère', d.counts.mother || 0]]},
                {id: 'manual', label: 'Marqués à la main', chipLabel: '🧱 À la main', type: 'check'},
                {id: 'gen', label: 'Génération', type: 'radio', options: [['', 'Toutes'], ...gens.map(g => [String(g), `Génération ${g}`])], dflt: ''}],
            view: {dflt: 'list', what: 'fiches'},
            sort: {options: [['gen', 'Génération, puis Sosa'], ['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Plus récents']], value: 'gen'},
            onChange: () => { shown = 40; paint(); }});
        ws.querySelector('[data-ouc-wall-bar]').appendChild(bar);
        const list = ws.querySelector('[data-ouc-wall-list]'), more = ws.querySelector('[data-ouc-wall-more]');
        const fold = s => C().fold(s);
        function rows() {
            const st = bar.state, f = st.filters, q = fold(st.q);
            let l = (wallsState.data?.items || []).filter(w => (!q || fold(`${w.name} ${w.birth?.place || ''} ${w.death?.place || ''} ${w.note}`).includes(q))
                && (!f.status?.length || f.status.includes(w.status)) && (!f.miss?.length || f.miss.includes(w.missing)) && (!f.manual || w.manual) && (!f.gen || String(w.generation) === f.gen));
            if (st.sort === 'az' || st.sort === 'za' || st.sort === 'recent') l = UI().sortItems(l, st.sort, {name: w => `${w.last_name} ${w.first_name}`, date: w => w.updated_at});
            return l;
        }
        function paint() {
            const st = bar.state, l = rows(), part = l.slice(0, shown);
            bar.setCount(l.length, 'mur');
            const cards = st.view === 'cards';
            const items = part.map(w => {
                const l1 = [w.sosa ? `Sosa ${w.sosa}` : 'Hors lignée', w.generation ? `génération ${w.generation}` : '', lifeOf(w)].filter(Boolean).join(' · ');
                const l2 = `Manque : ${MISS[w.missing] ?? '—'}${w.searched ? ` · 🔍 ${plural(w.searched, 'recherche')}` : ''}${w.leads ? ` · 📌 ${plural(w.leads, 'piste')}` : ''}${w.note ? ` · ✎ ${w.note.slice(0, 60)}` : ''}`;
                return {thumb: avatar(w), name: w.name, open: `data-ouc-wall="${w.person_id}"`, openLabel: 'Ouvrir', attrs: `data-ouc-wall-row="${w.person_id}"`,
                    lines: cards ? [l1, l2] : [{html: `${statusBadge(w)}${w.manual ? ' ' + badge('🧱 À la main', 'grey') : ''} ${esc(l1)}`}, l2],
                    badges: cards ? [w.sosa ? {text: `Sosa ${w.sosa}`, kind: 'sosa'} : '', STATUS[w.status]?.[1] ? {text: STATUS[w.status][0], kind: STATUS[w.status][1]} : '', w.manual ? {text: '🧱 À la main', kind: 'grey'} : ''].filter(Boolean) : [],
                    when: w.updated_at || '', whenLabel: 'Modifié', actions: `<button type="button" class="button small secondary" data-ouc-wall="${w.person_id}">Ouvrir</button>`};
            });
            list.innerHTML = l.length ? UI().itemsHtml(st.view, items) : (wallsState.data.items.length
                ? A().emptyState({icon: '🔍', text: 'Aucun mur ne correspond', hint: 'Retire un filtre ou change la recherche.'})
                : A().emptyState({icon: '🎉', text: 'Aucun mur de brique', hint: 'Tous tes ancêtres connus ont leurs deux parents. Si tu bloques quelque part, marque-le « 🧱 Je bloque ici ».', action: {label: '＋ Ajouter un mur…', attrs: 'data-empty-click="[data-ouc-wall-add]"'}}));
            more.innerHTML = '';
            if (l.length > shown && UI().moreButton) more.appendChild(UI().moreButton({remaining: l.length - shown, step: 40, onClick: () => { shown += 40; paint(); }}));
        }
        wallsPaint = async () => { try { await loadWalls(); } catch (_) {} paint(); };
        list.addEventListener('click', e => { const b = e.target.closest('[data-ouc-wall]'); if (b) { e.preventDefault(); openWall(Number(b.dataset.oucWall)); } });
        paint();
        if (S().oucOpenWall) { const w = S().oucOpenWall; S().oucOpenWall = 0; openWall(w); }
    }
    // K14 : clic droit sur une ligne de mur
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('[data-ouc-wall-row]'); if (!row || e.shiftKey || !UI().contextMenu) return;
        const pid = Number(row.dataset.oucWallRow), w = wallsState.data?.items.find(x => x.person_id === pid); if (!w) return;
        e.preventDefault(); e.stopPropagation();
        UI().contextMenu(e, [{icon: '↗', label: 'Ouvrir', run: () => openWall(pid)}, {icon: '🌍', label: 'Où chercher ?', run: () => openPerson(pid)},
            ...Object.entries(STATUS).filter(([k]) => k !== w.status).map(([k, v]) => ({icon: k === 'solved' ? '🎉' : '🧩', label: v[0], run: () => setStatus(pid, w.name, k)})),
            ...(w.manual ? ['-', {icon: '🧱', label: 'Ne plus bloquer ici', run: () => toggleManual(pid, w.name, false)}] : [])], {title: w.name});
    }, true);

    /** la fenêtre d'un mur : déjà cherché · pistes proposées · indices · note et statut */
    async function openWall(pid) {
        if (!pid) return;
        if (!ext.openDialog) return;
        const dlg = ext.openDialog({eyebrow: '🧩 MUR DE BRIQUE', title: 'Mur de brique', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<div class="ouc-wall" data-ouc-wall-box>${UI().spinner ? UI().spinner('Je rassemble ce que tu sais…') : '…'}</div>`});
        const box = dlg?.querySelector('[data-ouc-wall-box]'); if (!box) return;
        let data, det, wall;
        const id = `w${++uid}`; box.dataset.oucView = id;
        const view = {pid, data: null, res: null};
        VIEWS.set(id, view);
        const load = async () => {
            [data, det] = await Promise.all([loadPerson(pid, {fresh: true}), api('mur_de_brique', {id: pid})]);
            view.data = data;
            if (!wallsState.data) { try { await loadWalls(); } catch (_) {} }
            wall = wallsState.data?.items.find(w => w.person_id === pid) || {person_id: pid, name: data.raw.person.name, status: data.raw.wall?.status || 'open', note: data.raw.wall?.note || '', manual: !!data.raw.wall?.manual, missing: ''};
        };
        view.redraw = () => {
            if (!box.isConnected) { VIEWS.delete(id); return; }
            const res = view.res = suggest(view.data);
            const h = dlg.querySelector('.modal-head h2'); if (h) h.textContent = `Mur de brique — ${data.raw.person.name}`;
            const todo = res.list.slice(0, 6);
            const journal = det.journal || [], leads = det.leads || [], hints = det.hints || [];
            const hint = x => `<li class="ouc-hint is-${esc(x.sort)}"><span aria-hidden="true">${{homonym: '👥', witness: '✍', census: '🏠', dna: '🧬'}[x.sort] || '•'}</span> ${x.person_id ? `<button type="button" class="table-link" data-ouc-open-p="${x.person_id}">${esc(x.name)}</button>` : `<b>${esc(x.name)}</b>`} <span class="muted">— ${esc(x.text)}</span></li>`;
            box.innerHTML = `<div class="ouc-wall-head">${avatar({...wall, first_name: data.raw.person.first, last_name: data.raw.person.last, gender: data.raw.person.gender})}<div><b>${esc(data.raw.person.name)}</b>
                <div class="muted">${esc([wall.sosa ? `Sosa ${wall.sosa}` : '', wall.generation ? `génération ${wall.generation}` : '', C().lifeText(res.ctx), wall.missing ? `manque ${MISS[wall.missing]}` : ''].filter(Boolean).join(' · '))}</div></div>
                <div class="segmented ouc-status" role="radiogroup" aria-label="Statut">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="${wall.status === k ? 'is-active' : ''}" data-ouc-st="${k}" aria-pressed="${wall.status === k}">${k === 'solved' ? '🎉 ' : ''}${esc(v[0])}</button>`).join('')}</div></div>
                <div class="ouc-wall-grid">
                  <section><h4>🔍 Déjà cherché <small>${journal.length + leads.length + (det.courriers || []).length}</small></h4>
                    ${journal.length || leads.length || det.courriers?.length ? `<ul class="ouc-mini">${journal.slice(0, 12).map(j => `<li>${j.result && RESULT[j.result] ? badge(RESULT[j.result][0], RESULT[j.result][1]) + ' ' : ''}${esc(j.title)} <small class="muted">${when(j.date)}</small></li>`).join('')}
                      ${(det.courriers || []).map(c => `<li>✉️ ${esc(c.objet)} — ${esc(c.destinataire)} <small class="muted">${esc(c.statut)}</small></li>`).join('')}
                      ${leads.map(l => `<li>📌 ${esc(l.title)} <small class="muted">· ${esc({to_explore_priority: 'à explorer en priorité', to_explore: 'à explorer', promising: 'prometteuse', explored: 'explorée', closed: 'fermée'}[l.status] || l.status)}</small> <button type="button" class="link-button" data-ouc-inv="${l.investigation_id}">↗</button></li>`).join('')}</ul>`
                      : A().empty('Rien de noté pour l’instant.', {icon: '🔍'})}
                    ${det.hypotheses?.length ? `<p class="muted">⚖️ ${plural(det.hypotheses.length, 'hypothèse')} : ${det.hypotheses.slice(0, 3).map(x => esc(x.title)).join(' · ')}</p>` : ''}</section>
                  <section><h4>🌍 À essayer <small>${res.list.length}</small></h4>${todo.length ? listHtml(todo, {compact: true}) : A().empty('Tous les sites proposés ont été cherchés.', {icon: '✓'})}
                    ${res.list.length > todo.length ? `<button type="button" class="link-button" data-ouc-page="${pid}">Voir les ${res.list.length - todo.length} autres ↗</button>` : ''}</section>
                  <section><h4>💡 Indices dans ta base <small>${hints.length}</small></h4>${hints.length ? `<ul class="ouc-mini">${hints.slice(0, 12).map(hint).join('')}</ul>` : A().empty('Pas d’homonyme, de témoin ni de voisin repéré.', {icon: '💡'})}</section>
                  <section><h4>✎ Note</h4><textarea class="ouc-note" data-ouc-note rows="4" maxlength="4000" placeholder="Ce que tu sais, ce que tu soupçonnes, où tu as déjà regardé…">${esc(wall.note || '')}</textarea><p class="ui-hint" data-ouc-note-hint>Gardée toute seule.</p>
                    <label class="ui-toggle"><input type="checkbox" data-ouc-manual ${wall.manual ? 'checked' : ''}><i></i>🧱 Je bloque ici (marqué à la main)</label></section>
                </div>`;
        };
        try { await load(); view.redraw(); } catch (e) { box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        let noteT = 0;
        box.addEventListener('input', e => {
            if (!e.target.matches('[data-ouc-note]')) return;
            clearTimeout(noteT); const v = e.target.value;
            noteT = setTimeout(async () => { try { const r = await wallSave(pid, {note: v}); wall.note = v; const hnt = box.querySelector('[data-ouc-note-hint]'); if (hnt) { hnt.textContent = '✓ Enregistré'; hnt.classList.add('is-ok'); } const w = wallsState.data?.items.find(x => x.person_id === pid); if (w) w.note = v; void r; } catch (err) { A().toast(err.message, 'error'); } }, 600);
        });
        box.addEventListener('change', async e => {
            if (!e.target.matches('[data-ouc-manual]')) return;
            await toggleManual(pid, data.raw.person.name, e.target.checked); wall.manual = e.target.checked;
        });
        box.addEventListener('click', async e => {
            const st = e.target.closest('[data-ouc-st]');
            if (st && st.dataset.oucSt !== wall.status) { await setStatus(pid, data.raw.person.name, st.dataset.oucSt, async () => { await load(); view.redraw(); }); return; }
            const op = e.target.closest('[data-ouc-open-p]'); if (op) { dlg.close(); S().currentPersonId = Number(op.dataset.oucOpenP); A().setModule('personnes'); return; }
            const inv = e.target.closest('[data-ouc-inv]'); if (inv) { dlg.close(); Object.assign(S(), {currentInvestigationId: Number(inv.dataset.oucInv), enquetesTab: 'enquetes'}); A().setModule('enquetes'); return; }
            if (e.target.closest('[data-ouc-page]')) dlg.close();
        });
    }

    /* ═════════════════════ 4. Le widget « 🧩 Murs de brique » (même moteur de widgets) ═════════════════════ */
    ext.dashboard = ext.dashboard || {};
    function widgetBody(d, limit) {
        if (!d) return A().empty('Les murs de brique n’ont pas pu être lus.', {icon: '⛔'});
        const open = d.items.filter(w => w.status === 'open' || w.status === 'progress');
        const c = d.counts || {};
        const pills = [c.open ? badge(`${c.open} à chercher`, 'yellow') : '', c.progress ? badge(`${c.progress} en cours`, 'blue') : '', c.solved ? badge(`🎉 ${c.solved} résolu${c.solved > 1 ? 's' : ''}`, 'green') : ''].join(' ');
        if (!open.length) return `${pills ? `<div class="ouc-w-counts">${pills}</div>` : ''}${A().empty(c.solved ? 'Tous tes murs sont tombés, bravo !' : 'Aucun mur de brique : tes ancêtres connus ont leurs parents.', {icon: '🎉'})}`;
        return `<div class="ouc-w-counts">${pills}</div><ul class="ouc-w-list">${open.slice(0, limit).map(w => `<li><button type="button" class="ouc-w-row" data-ouc-wall-open="${w.person_id}">${avatar(w)}<span><b>${esc(w.name)}</b><small class="muted">${esc([w.sosa ? `Sosa ${w.sosa}` : '', `manque ${MISS[w.missing] ?? ''}`].filter(Boolean).join(' · '))}</small></span>${statusBadge(w)}</button></li>`).join('')}</ul>
            ${open.length > limit ? `<button type="button" class="link-button" data-ouc-walls-all>Voir les ${open.length - limit} autres ↓</button>` : ''}`;
    }
    function paintWidget(el) {
        api('murs_de_brique').then(d => { wallsState.data = d; el.innerHTML = widgetBody(d, Number(el.dataset.limit) || 5); }).catch(() => {});
    }
    ext.dashboard.brick_walls = {
        load: () => api('murs_de_brique').then(d => { wallsState.data = d; congratulate(d); return d; }).catch(() => null),
        render: (index, widget, span, data) => {
            const limit = Math.max(1, Math.min(40, Number(widget?.limit) || 5));
            const n = data ? data.items.filter(w => w.status === 'open' || w.status === 'progress').length : '';
            return A().card(index, '🧩 Murs de brique', n, `<div data-ouc-walls-widget data-limit="${limit}">${widgetBody(data, limit)}</div>`, span,
                '<button type="button" class="button small secondary" data-ouc-walls-all title="Tous les murs de brique (Recherche)">Tout voir ↗</button>');
        },
    };
    document.addEventListener('click', e => {
        const o = e.target.closest?.('[data-ouc-wall-open]'); if (o) { e.preventDefault(); openWall(Number(o.dataset.oucWallOpen)); return; }
        if (e.target.closest?.('[data-ouc-walls-all]')) { e.preventDefault(); openPerson(0, 'murs'); }
    });

    /* ═════════════════════ 5. La fiche : menu ⋯ (🌍 Où chercher ?, 🧱 Je bloque ici) ═════════════════════ */
    // le menu ⋯ de la fiche (app-sections.js lit ext.personMoreItems : une fonction → une ligne ou null)
    ext.personMoreItems = ext.personMoreItems || [];
    const humanOf = detail => { const p = detail?.person; return p?.id && p.kind !== 'animal' ? p : null; };
    ext.personMoreItems.push(detail => { const p = humanOf(detail); return p ? {icon: '🌍', label: 'Où chercher ?', run: () => openPerson(Number(p.id))} : null; });
    ext.personMoreItems.push(detail => {
        const p = humanOf(detail); if (!p) return null;
        const manual = !!(cache.get(Number(p.id))?.raw?.wall?.manual);
        return {icon: '🧱', label: manual ? 'Ne plus bloquer ici' : 'Je bloque ici (mur de brique)', run: async () => {
            let on = !manual; try { on = !(await loadPerson(Number(p.id), {fresh: true, detail})).raw.wall?.manual; } catch (_) {}
            await toggleManual(Number(p.id), A().personName?.(p) || p.first_name || '', on); cache.delete(Number(p.id)); }};
    });

    ext.ouChercher = {page, openPerson, openWall, allSites, suggest, loadPerson, lots, freeOnly, setFreeOnly, widgetBody, loadWalls};
})();
