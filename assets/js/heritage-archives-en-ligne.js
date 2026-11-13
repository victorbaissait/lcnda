/* LCNDA — 🔍 Archives en ligne : UNE fenêtre pour tous les sites de tous les lots (les écrans).
 * Règle « un seul modèle partout » (CLAUDE.md) : les 7 lots « sources ouvertes » et SocFace gardent leurs adresses, leurs imports
 * et leur serveur ; cette couche les réunit (app-archives-en-ligne-core.js, LCNDA_ARCHIVES) :
 *  - « 🔍 Chercher dans les archives en ligne » (ext.archives.open) : tous les sites, une ligne par site, rangés par pays puis
 *    par thème (pastilles C5 avec le nombre), case C1, « Gratuites seulement », « Pour : » la personne ou le lieu, adresse montrée
 *    telle qu'elle s'ouvre, pastille vérifiée / en partie / non vérifiée, PAYANT ; « ⤒ Importer ce que tu as trouvé ▾ » envoie vers
 *    l'import propre de chaque lot (ses fenêtres K13, inchangées). Les boutons des blocs (Poilu, Militaire, Départs, Enfant placé,
 *    Médias, Récompenses, lieu, employeur, objet…) ouvrent CETTE fenêtre, déjà sur « 🎯 » leur rubrique.
 *  - « ⚙️ Adresses des sites » (ext.archives.openSettings) : un seul écran, rubriques repliables, qui lit et écrit la clé de chaque
 *    lot (K2, « ↺ Remettre comme au départ ») ; « Mes sites » et les cercles généalogiques.
 *  - « 🔗 Coller un lien » (ext.archives.openPaste) : un seul, qui reconnaît les liens de tous les lots.
 *  - Bloc « Chercher sur internet » de la fiche : « 🔍 Archives en ligne… » · « 🔗 Coller un lien » · « 🌍 Où chercher ? ».
 * L'app n'interroge jamais ces sites : seul le navigateur de la personne les ouvre. Mode d'emploi : docs/UI.md (« 🔍 Archives en ligne »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const AR = () => window.LCNDA_ARCHIVES;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const LS = (() => { try { return window.localStorage; } catch (_) { return null; } })();
    const lsGet = (k, d) => { try { const v = LS.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { if (v == null) LS.removeItem(k); else LS.setItem(k, v); } catch (_) { /* stockage bloqué */ } };
    const lsJson = (k, d) => { try { const v = JSON.parse(lsGet(k, '')); return v ?? d; } catch (_) { return d; } };
    const badge = (t, k, o) => (UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`);
    const i18n = (text, vars) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(text, vars) : String(text ?? '')); // 🌐 app-i18n.js
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const regs = () => AR().registries(window);
    const lotUi = n => (n === 'socface' ? ext.socface : ext[AR().LOTS[n]?.ui]);
    const entries = () => AR().collect(regs(), {mine: AR().mineSites(LS), hidden: AR().hiddenIds(LS)});
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open') || Number(A()?.state?.currentPerson?.person?.is_locked) === 1;
    const freeOnly = () => (ext.sourcesOuvertes6?.freeOnly ? !!ext.sourcesOuvertes6.freeOnly() : AR().freeOnly(LS));
    const setFreeOnly = on => { if (ext.sourcesOuvertes6?.setFreeOnly) ext.sourcesOuvertes6.setFreeOnly(!!on); else lsSet(AR().FREE_KEY, on ? '1' : '0'); };
    const VERIF = {oui: ['Adresse vérifiée', 'green', 'Forme de l’adresse vue sur le site'], partiel: ['Vérifiée en partie', 'yellow', 'La forme de l’adresse est connue, mais pas tous ses paramètres'],
        non: ['Adresse non vérifiée', 'grey', 'Construite d’après la forme connue du site : si elle ne marche plus, change-la dans « ⚙️ Adresses des sites »'], mine: ['Mon site', 'blue', 'Un site que tu as ajouté']};
    const PAID = {oui: ['Payant', 'red', 'Ce site demande un abonnement ou des crédits pour voir les documents'], partiel: ['En partie payant', 'yellow', 'Gratuit, sauf une partie qui demande un abonnement'],
        bibliotheque: ['Gratuit en bibliothèque', 'blue', 'Gratuit seulement sur les ordinateurs d’une bibliothèque ou des archives']};
    const SAMPLE = {first: '{prénom}', last: '{nom}', place: '{lieu}', county: '{département}', country: '{pays}', what: '{quoi}', port: '{port}', employer: '{employeur}', photographer: '{photographe}', unit: '{unité}', canton: ''};
    const sampleUrl = u => { try { return decodeURIComponent(String(u || '').replace(/%(?![0-9A-F]{2})/gi, '%25')); } catch (_) { return String(u || ''); } };

    /* ═════ ce que la fiche apporte (même calcul que les lots) ═════ */
    const ctxCache = new Map();
    const context = pid => { const k = Number(pid) || 0; if (!k) return Promise.resolve(null); if (!ctxCache.has(k)) ctxCache.set(k, api('so_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    function paramsFrom(ctx, o = {}) {
        const p = ctx?.person || {}, place = o.place && typeof o.place === 'object' ? o.place : null;
        const placeOnly = !!(o.placeOnly || (place && !o.personId) || o.target);
        const cur = A()?.state?.currentPerson?.person;
        const d = ctx?.dept || null;
        const y2 = p.death_year || (p.birth_year ? Math.min(Number(p.birth_year) + 90, new Date().getFullYear()) : '');
        const pl = place?.name || (typeof o.place === 'string' ? o.place : '') || o.target?.place || String(ctx?.birth?.place || ctx?.places?.[0] || '').split(',')[0];
        return {first: placeOnly ? '' : String(p.first || '').split(/\s+/)[0] || '', last: placeOnly ? '' : p.last || '', place: String(pl || '').split(',')[0],
            y1: placeOnly ? '' : p.birth_year || '', y2: placeOnly ? '' : y2, birthYear: p.birth_year || '', deathYear: p.death_year || '',
            unit: ctx?.units?.[0]?.unit_name || '', dept: place?.dept || d?.code || '', deptCode: place?.dept || d?.code || '', deptName: d?.name || '', adUrl: d?.url || '',
            county: place?.county || o.county || ctx?.birth?.county || d?.name || '', insee: place?.insee || o.insee || '', state: place?.state || o.state || '', country: place?.country || o.country || '',
            canton: lsGet('genealogie-sources-ouvertes-2-canton', ''), what: o.target?.name || '', port: o.port || '', employer: o.employer || '', photographer: o.photographer || '',
            fsId: o.fsId || (cur && Number(cur.id) === Number(p.id) ? cur.familysearch_id || '' : ''), withFirst: true};
    }

    /* ═════ une ligne : un site ═════ */
    function whyNot(e, u) {
        if (!u) return e.needs === 'unit' ? 'Indique son unité (régiment…) dans « Plus de précisions » pour trouver le journal de marche.'
            : e.needs === 'adUrl' ? 'Choisis le département dans « Plus de précisions » pour ouvrir le site de ses archives.'
                : e.needs === 'dept' ? 'Indique le département dans « Plus de précisions ».' : 'Indique au moins un nom.';
        if (e.needs === 'fsId') return 'Il faut son identifiant FamilySearch (écrit sur sa fiche).';
        if (e.needs === 'port') return 'Écris son port d’attache dans « Plus de précisions ».';
        if (e.byPhotographer) return 'Écris le nom du photographe dans « Plus de précisions ».';
        return e.byPlace ? 'Écris au moins un nom ou un lieu.' : 'Écris au moins un nom.';
    }
    const copyOf = (e, p) => { if (!e.copy) return ''; const G = regs()[e.lot]; try { if (G?.copyText) return G.copyText(e.key, p) || ''; } catch (_) { /* rien à copier */ } return [String(p.last || '').toUpperCase(), p.first].filter(Boolean).join(' '); };
    const urlOf = (e, p) => AR().url(e, p, regs(), LS);
    function badgesOf(e, o = {}) {
        const v = VERIF[e.verified] || VERIF.non, out = [badge(v[0], v[1], {title: v[2], cls: 'ael-verif'})];
        if (e.paid) { const b = PAID[e.paid]; out.unshift(badge(b[0], b[1], {title: b[2], cls: 'ael-paid'})); }
        if (e.account) out.push(badge('Compte gratuit', 'blue', {title: 'Le site demande de créer un compte (gratuit) pour voir les résultats'}));
        if (e.sensitive) out.push(badge('Mémoire', 'black', {title: 'Ton sobre : ce qui vient de ce site n’entre jamais dans un jeu'}));
        if (o.mine) out.push(badge('Ta région', 'blue'));
        if (AR().hasCustom(e, LS)) out.push(badge('Adresse à toi', 'blue'));
        return out.join(' ');
    }
    function rowHtml(e, p, view) {
        const u = urlOf(e, p), ok = !!u && AR().ready(e, p), copy = ok ? copyOf(e, p) : '';
        const G = regs()[e.lot];
        const extra = [e, ...e.merged.map(id => view.raw.get(id)).filter(Boolean)]
            .map(x => { try { return lotUi(x.lot)?.archives?.extra?.(x, p, view.ctx) || ''; } catch (_) { return ''; } }).join('');
        let google = ''; try { google = ok && e.verified === 'non' && G?.googleUrl && !AR().hasCustom(e, LS) ? G.googleUrl(e.key, p) : ''; } catch (_) { google = ''; }
        let data = ''; try { data = ok && e.data && G?.dataUrl ? G.dataUrl(e.key, p) : ''; } catch (_) { data = ''; }
        const also = ok ? e.also.map(a => { const x = view.raw.get(a.id); const au = x ? urlOf(x, p) : ''; return au ? `<a href="${esc(au)}" target="_blank" rel="noopener noreferrer" data-ael-go="${esc(a.id)}">${esc(a.label)} ↗</a>` : ''; }).filter(Boolean) : [];
        const go = ok ? `<a class="button small${e.paid === 'oui' ? ' secondary' : ''}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-ael-go="${esc(e.id)}"${copy ? ` data-ael-copy="${esc(copy)}" title="${i18n('« {text} » est copié : colle-le dans la case du site', {text: esc(copy)})}"` : ''}>${copy ? '📋 Copier le nom et ouvrir' : '↗ Ouvrir'}</a>`
            : `<button type="button" class="button small" disabled title="${esc(whyNot(e, u))}">↗ Ouvrir</button>`;
        const imp = !view.ro && (e.kind || e.lot === 'socface') && !e.mine ? `<button type="button" class="icon-button small ael-imp" data-ael-import="${esc(e.id)}" title="⤒ Importer ce que tu as trouvé sur ce site" aria-label="${i18n('Importer ce que tu as trouvé sur {site}', {site: esc(e.label)})}">⤒</button>` : '';
        return `<li class="so-link ael-site${e.paid === 'oui' || e.paid === 'bibliotheque' ? ' is-paid' : ''}" data-ael-site="${esc(e.id)}" data-lot="${esc(e.lot)}" data-key="${esc(e.key)}">
            <span class="so-link-ico" aria-hidden="true">${esc(e.icon)}</span>
            <span class="so-link-main"><b>${esc(e.label)}</b> <span class="ael-badges">${badgesOf(e, {mine: view.region.has(e.id)})}</span>
                ${ok ? `<code class="so-url" data-ael-url="${esc(e.id)}">${esc(u)}</code>` : `<small class="ui-hint">${esc(whyNot(e, u))}</small>`}
                ${e.note ? `<small class="ui-hint">${esc(e.note)}</small>` : ''}${extra}
                ${also.length ? `<small class="ui-hint ael-also">Aussi : ${also.join(' · ')}</small>` : ''}
                ${google ? `<small class="ui-hint">${i18n('Si la page ne trouve rien :')} <a href="${esc(google)}" target="_blank" rel="noopener noreferrer" data-ael-google="${esc(e.id)}">${i18n('chercher avec Google dans ce site ↗')}</a></small>` : ''}
                ${data ? `<small class="ui-hint">${i18n('Données ouvertes :')} <a href="${esc(data)}" target="_blank" rel="noopener noreferrer" data-ael-data>${i18n('⤓ les résultats en JSON')}</a> ${i18n('— enregistre le fichier, puis « ⤒ Importer ce que tu as trouvé ».')}</small>` : ''}</span>
            <span class="ael-acts">${go}${imp}</span></li>`;
    }

    /* ═════ le focus : la rubrique d'un bouton de bloc (« 🎯 ») ═════ */
    function focusOf(o, all, p) {
        const ids = new Set(); let label = '';
        const add = id => { const r = AR().resolve(id); if (all.some(e => e.id === r)) ids.add(r); };
        if (Array.isArray(o.sites) && o.sites.length) { o.sites.forEach(add); label = o.focusLabel || '🎯 Pour cette recherche'; }
        else if (o.lot) {
            const n = o.lot === 'socface' ? 'socface' : Number(o.lot), G = regs()[n];
            const raw = AR().collectAll(regs()).filter(e => e.lot === n);
            if (o.group) {
                raw.filter(e => e.group === o.group).forEach(e => add(e.id));
                const g = G ? AR().groupsOf(G).find(x => x.id === o.group) : null;
                label = `🎯 ${g ? `${g.icon || ''} ${String(g.label || '').replace(/^(France|Canada|États-Unis|Monde)\s*[—·]\s*/, '')}`.trim() : 'Cette rubrique'}`;
            } else if (o.where && G?.forPlace) {
                let l = []; try { l = G.forPlace(o.where, {...p, country: p.country || o.country || ''}); } catch (_) { l = []; }
                l.forEach(s => add(`${AR().prefix(n)}${s.key}`));
                label = AR().WHERE_LABEL[o.where] ? `🎯 ${AR().WHERE_LABEL[o.where].replace(/^\S+\s/, '')}` : '🎯 Pour cette recherche';
                if (o.where === 'lieu' || o.where === 'fiche') label = o.where === 'lieu' ? '📍 Pour ce lieu' : '🎯 Pour sa fiche';
            } else if (n === 'socface') { add('socface'); label = '🧾 Recensements'; }
            else { raw.forEach(e => add(e.id)); label = '🎯 Pour cette recherche'; }
        } else if (o.placeOnly || (o.place && typeof o.place === 'object' && !o.personId) || o.target) {
            all.filter(e => e.byPlace || ['lieux', 'livres', 'tombes'].includes(e.theme)).forEach(e => ids.add(e.id));
            label = o.target?.type === 'object' ? '🏺 Pour cet objet' : o.target?.type === 'house' ? '🏠 Pour cette maison' : '📍 Pour ce lieu';
        }
        return ids.size ? {ids, label} : null;
    }

    /* ═════ 🔍 La fenêtre ═════ */
    function open(o = {}) {
        if (!AR()) return null;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search ael-search';
        let ctx = null, pid = Number(o.personId) || 0, all = entries();
        const saved = lsJson(AR().VIEW_KEY, {}) || {};
        const st = {q: '', zone: '', country: '', theme: '', useFocus: true, showOld: false, focus: null};
        if (!o.lot && !o.sites && !o.place && !o.target && !o.placeOnly) { st.zone = saved.zone || ''; st.country = saved.country || ''; st.theme = saved.theme || ''; }
        const target = o.target || (o.place && typeof o.place === 'object' ? {type: 'place', ...o.place} : (o.placeOnly && o.place ? {type: 'place', name: o.place} : null));
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔍 Chercher dans les archives en ligne</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body ael-body" data-ael-body>${UI().spinner ? UI().spinner('Ce que la fiche sait…') : '…'}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-ael-settings>⚙️ Adresses des sites</button><span class="spacer"></span>
                <button type="button" class="button secondary" data-ael-paste-in>🔗 Coller un lien</button>${readOnly() ? '' : '<button type="button" class="button secondary" data-ael-import-menu aria-haspopup="menu">⤒ Importer ce que tu as trouvé ▾</button>'}<button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-ael-body]');
        const val = () => { const v = {...paramsFrom(ctx, {...o, personId: pid})}; dlg.querySelectorAll('.ael-fields [name]').forEach(i => { v[i.name] = i.value; });
            const d = (ctx?.depts || []).find(x => x.code === v.dept); if (d) { v.deptCode = d.code; v.deptName = d.name; v.adUrl = d.url || ''; if (!v.county) v.county = d.name; } else { v.deptCode = v.dept; if (v.dept !== paramsFrom(ctx, o).dept) v.adUrl = ''; }
            if (!v.birthYear && v.y1) v.birthYear = v.y1; return v; };
        const regionIds = p => { const S6 = regs()[6]; if (!S6?.libraryFor || !p.place) return new Set(); try { return new Set(S6.libraryFor({text: p.place, county: p.county, state: p.state, insee: p.insee, country: p.country}).mine.map(s => `so6_${s.key}`)); } catch (_) { return new Set(); } };
        const pills = (attr, items, cur) => items.map(([id, label, n]) => `<button type="button" class="${id === cur ? 'is-active' : ''}" aria-pressed="${id === cur}" data-${attr}="${esc(id)}">${esc(label)} (${n})</button>`).join('');
        const help = () => {
            if (!o.lot || !o.group) return '';
            const h = lotUi(o.lot)?.archives?.help?.[o.group]; if (!h || h === regs()[2]?.GROUPS?.memoire?.text) return ''; // la phrase sobre est déjà en tête de la rubrique
            return `<p class="so-help" data-ael-help>${esc(h)}</p>`;
        };
        const update = () => {
            const p = val(); all = entries();
            const fx = st.focus = focusOf(o, all, p);
            const f = {q: st.q, free: freeOnly(), focus: fx && st.useFocus ? fx.ids : null, p, showOld: st.showOld};
            const c = AR().counts(all, f), cz = AR().counts(all, {...f, focus: null});
            if (st.zone && !c.zone[st.zone]) { st.zone = ''; st.country = ''; }
            if (st.country && !c.country[st.country]) st.country = '';
            const c2 = AR().counts(all, {...f, zone: st.zone, country: st.country});
            if (st.theme && !c2.theme[st.theme]) st.theme = '';
            const list = AR().filter(all, {...f, zone: st.zone, country: st.country, theme: st.theme});
            const region = regionIds(p);
            // pastilles : 🎯 focus · Tout · zones ; pays de la zone ; thèmes
            const zones = body.querySelector('[data-ael-zones]');
            if (zones) zones.innerHTML = [fx ? `<button type="button" class="ael-focus${st.useFocus ? ' is-active' : ''}" aria-pressed="${st.useFocus}" data-ael-focus="1">${esc(fx.label)} (${AR().filter(all, {...f, focus: fx.ids}).length})</button>` : '',
                `<button type="button" class="${!st.zone && !(fx && st.useFocus) ? 'is-active' : ''}" data-ael-zone="">${i18n('Tout ({n})', {n: cz.all})}</button>`,
                pills('ael-zone', AR().ZONES.filter(z => cz.zone[z.id]).map(z => [z.id, `${z.icon} ${z.label}`, cz.zone[z.id]]), fx && st.useFocus ? '' : st.zone)].join('');
            const ctry = body.querySelector('[data-ael-countries]');
            const cs = Object.keys(c.country).filter(k => !st.zone || AR().COUNTRIES[k][0] === st.zone);
            if (ctry) { ctry.hidden = !st.zone || cs.length < 2; ctry.innerHTML = `<button type="button" class="${st.country ? '' : 'is-active'}" data-ael-country="">${i18n('Tous les pays ({n})', {n: cs.reduce((a, k) => a + c.country[k], 0)})}</button>${pills('ael-country', Object.keys(AR().COUNTRIES).filter(k => cs.includes(k)).map(k => [k, `${AR().COUNTRIES[k][1]} ${k}`, c.country[k]]), st.country)}`; }
            const th = body.querySelector('[data-ael-themes]');
            if (th) th.innerHTML = `<button type="button" class="${st.theme ? '' : 'is-active'}" data-ael-theme="">${i18n('Tous les thèmes ({n})', {n: AR().filter(all, {...f, zone: st.zone, country: st.country}).length})}</button>${pills('ael-theme', AR().THEMES.filter(t => c2.theme[t.id]).map(t => [t.id, `${t.icon} ${t.label}`, c2.theme[t.id]]), st.theme)}`;
            // les rubriques
            const view = {all, raw: new Map(AR().collectAll(regs()).map(e => [e.id, e])), ctx, ro: readOnly(), region};
            const secs = AR().sections(list, {first: [...region]});
            const box = body.querySelector('[data-ael-links]');
            const q = st.q;
            box.innerHTML = secs.length ? secs.map(s => `<section class="ael-section" data-ael-sec="${esc(s.id)}"><h4>${esc(s.flag)} ${esc(s.country)} · ${esc(s.theme.icon)} ${esc(s.theme.label)} <small class="muted">${s.list.length}</small></h4>
                ${s.theme.respect && regs()[2]?.GROUPS?.memoire?.text ? `<div class="so2-respect ael-respect"><span aria-hidden="true">🕯</span><p>${esc(regs()[2].GROUPS.memoire.text)}</p></div>` : ''}
                ${s.list.some(e => e.paid === 'oui') ? `<p class="ui-hint ael-paid-hint">Les sites payants demandent un abonnement ou des crédits : la recherche y est souvent possible sans payer, pas la lecture des documents. Essaie d’abord les sites gratuits.</p>` : ''}
                <ul class="so-links">${s.list.map(e => rowHtml(e, p, view)).join('')}</ul></section>`).join('')
                : (A()?.empty ? A().empty(q ? i18n('Aucun site pour « {q} ».', {q}) : 'Aucun site ici.', {icon: '🔍', hint: q ? 'Vérifie l’orthographe, ou choisis « Tout ».' : 'Choisis « Tout », ou décoche « Gratuites seulement ».'}) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${q ? i18n('Aucun site pour « {q} ».', {q: esc(q)}) : i18n('Aucun site.')}</span></p>`);
            // ce qui est caché
            const old = AR().filter(all, {...f, zone: st.zone, country: st.country, theme: st.theme, p: null}).filter(e => AR().outOfTime(e, p));
            const paidHidden = f.free ? AR().filter(all, {...f, free: false, zone: st.zone, country: st.country, theme: st.theme}).filter(e => e.paid === 'oui' || e.paid === 'bibliotheque').length : 0;
            const hid = body.querySelector('[data-ael-hidden]');
            if (hid) hid.innerHTML = [old.length && !st.showOld ? `${plural(old.length, 'site hors de son époque', 'sites hors de son époque')} <button type="button" class="button small secondary" data-ael-old>Les montrer</button>` : st.showOld ? `<button type="button" class="button small secondary" data-ael-old>Cacher les sites hors de son époque</button>` : '',
                paidHidden ? `<span class="so6-hidden-paid">${i18n('{n} par « Gratuites seulement ».', {n: plural(paidHidden, 'site payant caché', 'sites payants cachés')})}</span>` : ''].filter(Boolean).join(' · ');
            const cnt = body.querySelector('[data-ael-count]'); if (cnt) cnt.textContent = plural(list.length, 'site');
            const cl = body.querySelector('[data-ael-classe]'); const SO = regs()[1];
            if (cl) { const show = SO?.classOf && (st.theme === 'soldats' || (fx && st.useFocus)) && list.some(e => e.lot === 1 && e.group === 'matricules'); cl.hidden = !show; if (show) { const k = SO.classOf(p.birthYear); cl.innerHTML = k.classe ? `<b>Classe ${esc(k.classe)}</b> — ${esc(k.text)}` : esc(k.text); } }
            if (!o.lot && !o.sites && !target) lsSet(AR().VIEW_KEY, JSON.stringify({...lsJson(AR().VIEW_KEY, {}), zone: st.zone, country: st.country, theme: st.theme}));
        };
        const draw = () => {
            const p = paramsFrom(ctx, {...o, personId: pid});
            const SO = regs()[1], S2 = regs()[2], S6 = regs()[6];
            const living = ctx?.person && SO?.livingRisk?.(ctx.person);
            const fx = focusOf(o, entries(), p);
            const needMore = !!fx && entries().some(e => fx.ids.has(e.id) && (e.needs || e.byPhotographer || e.key === 'anmt' || (e.lot === 1 && e.group === 'matricules')));
            const forHtml = target ? `<p class="ael-target so2-target so7-target">${esc({place: '📍', house: '🏠', object: '🏺'}[target.type] || '📍')} ${i18n('Pour {name}', {name: `<b>${esc(target.name || '')}</b>`})}${target.county || target.place ? ` · ${esc(target.county || target.place)}` : ''}</p>`
                : `<div class="ael-who"><span class="pk-lab">Pour :</span>${pickerField({name: 'ael_pid', kind: 'person', value: pid || null})}${pid && ext.ouChercher?.openPerson ? '<button type="button" class="button small secondary" data-ael-ouc>🌍 Où chercher ?</button>' : ''}</div>`;
            body.innerHTML = `${forHtml}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                ${help()}
                <div class="ael-fields">
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Tulle, Napoli, Bergen…"></label>
                    <label>De l’année<input name="y1" type="number" min="1500" max="2100" value="${esc(p.y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1500" max="2100" value="${esc(p.y2)}"></label>
                </div>
                <details class="ael-more" data-ael-more ${needMore ? 'open' : ''}><summary>Plus de précisions (né en, département, unité, port, canton…)</summary>
                <div class="form-grid so-grid">
                    <label>Né(e) en<input name="birthYear" type="number" min="1500" max="2100" value="${esc(p.birthYear)}"></label>
                    <label>Département<select name="dept"><option value="">—</option>${(ctx?.depts || []).map(x => `<option value="${esc(x.code)}" ${x.code === p.dept ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`).join('')}${p.dept && !(ctx?.depts || []).some(x => x.code === p.dept) ? `<option value="${esc(p.dept)}" selected>${esc(p.dept)}</option>` : ''}</select></label>
                    <label>Unité (régiment…)<input name="unit" value="${esc(p.unit)}" placeholder="152e régiment d’infanterie" autocomplete="off"></label>
                    <label>Port d’attache (marins)<input name="port" value="${esc(p.port)}" list="ael-ports" autocomplete="off" placeholder="Saint-Malo, Fécamp, Sète…"><datalist id="ael-ports">${(S6?.PORT_NAMES || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
                    <label>Canton suisse<select name="canton"><option value="">—</option>${(S2?.CANTONS || []).map(c => `<option value="${esc(c[0])}" ${c[0] === p.canton ? 'selected' : ''}>${esc(c[1])} (${esc(c[0])})</option>`).join('')}</select></label>
                    <label>Ce que tu cherches (patrimoine)<input name="what" value="${esc(p.what)}" placeholder="église Saint-Martin, cloche, retable…" autocomplete="off"></label>
                    <label>Employeur<input name="employer" value="${esc(p.employer)}" autocomplete="off" placeholder="Filature Motte-Bossut…"></label>
                    <label>Photographe (au dos de la carte)<input name="photographer" value="${esc(p.photographer)}" autocomplete="off" placeholder="Nadar, Disdéri…"></label>
                    <label>Pays<input name="country" value="${esc(p.country)}" autocomplete="off" placeholder="France, Allemagne…"></label>
                </div></details>
                </div>
                <p class="so-classe" data-ael-classe hidden></p>
                ${UI().notice('info', 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.')}
                <div class="ael-bar"><input type="search" data-ael-q placeholder="Chercher un site… (Italie, notaires, Gallica, payant…)" autocomplete="off" aria-label="Chercher un site" value="${esc(st.q)}">
                    <label class="ui-toggle ael-free"><input type="checkbox" data-ael-free ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement</label></div>
                <div class="ui-filters ael-pills" data-ael-zones role="group" aria-label="Pays"></div>
                <div class="ui-filters ael-pills ael-sub" data-ael-countries role="group" aria-label="Pays de la zone" hidden></div>
                <div class="ui-filters ael-pills ael-sub" data-ael-themes role="group" aria-label="Thèmes"></div>
                <p class="ui-hint ael-count"><span data-ael-count></span> <span data-ael-hidden></span></p>
                <div class="ael-links" data-ael-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Ensuite, enregistre le document (image, PDF, page) ou copie son lien, et fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            update();
        };
        dlg.addEventListener('input', e => { if (e.target.matches('[data-ael-q]')) { st.q = e.target.value; update(); } else if (e.target.closest('.ael-fields')) update(); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-ael-q]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; st.q = ''; update(); } });
        dlg.addEventListener('change', async e => {
            if (e.target.matches('[data-ael-free]')) { setFreeOnly(e.target.checked); update(); return; }
            if (e.target.name === 'canton') lsSet('genealogie-sources-ouvertes-2-canton', e.target.value || null);
            if (e.target.name === 'ael_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); return; }
            if (e.target.closest('.ael-fields') && e.target.tagName === 'SELECT') update(); // une case de texte : déjà fait à la frappe (redessiner ici avalerait le clic suivant)
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const fz = e.target.closest('[data-ael-focus]'); if (fz) { st.useFocus = true; st.zone = ''; st.country = ''; st.theme = ''; update(); return; }
            const z = e.target.closest('[data-ael-zone]'); if (z) { st.zone = z.dataset.aelZone; st.country = ''; st.theme = ''; st.useFocus = false; update(); return; }
            const c = e.target.closest('[data-ael-country]'); if (c) { st.country = c.dataset.aelCountry; st.theme = ''; update(); return; }
            const t = e.target.closest('[data-ael-theme]'); if (t) { st.theme = t.dataset.aelTheme; update(); return; }
            if (e.target.closest('[data-ael-old]')) { st.showOld = !st.showOld; update(); return; }
            const go = e.target.closest('[data-ael-go][data-ael-copy]');
            if (go) { const txt = go.dataset.aelCopy; try { navigator.clipboard?.writeText(txt).then(() => toast(i18n('« {text} » est copié : colle-le dans la case du site.', {text: txt})), () => toast(i18n('Écris « {text} » dans la case du site.', {text: txt}))); } catch (_) { /* presse-papiers refusé */ } }
            const im = e.target.closest('[data-ael-import]'); if (im) { const en = all.find(x => x.id === im.dataset.aelImport); if (en) { dlg.close(); importFor(en, {personId: pid, place: o.place, target, placeId: o.placeId}); } return; }
            if (e.target.closest('[data-ael-settings]')) { openSettings({lot: o.lot, onChange: () => update()}); return; }
            if (e.target.closest('[data-ael-ouc]')) { dlg.close(); ext.ouChercher.openPerson(pid); return; }
            if (e.target.closest('[data-ael-paste-in]')) { dlg.close(); openPaste({personId: pid, lot: o.lot}); return; }
            const mb = e.target.closest('[data-ael-import-menu]'); if (mb) { importMenu(mb, {personId: pid, lot: o.lot, place: o.place, target, placeId: o.placeId, close: () => dlg.close()}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        context(pid).then(c => { ctx = c; draw(); }).catch(() => { ctx = null; draw(); });
        return dlg;
    }

    /* ═════ ⤒ Importer : vers l'import propre de chaque lot ═════ */
    function importFor(e, o = {}) {
        const n = e.lot, ui = lotUi(n);
        if (n === 'socface') return ext.socface?.openImport?.({personId: o.personId});
        if (!ui?.openImport) return toast('Cet import n’est pas disponible ici.', 'error');
        const place = o.place && typeof o.place === 'object' ? o.place : null;
        if (n === 4 && e.group === 'fr_lieux' && place?.id && ui.openPopulation) return ui.openPopulation({placeId: place.id});
        return ui.openImport({personId: o.personId || 0, kind: e.kind || undefined, site: e.key, target: o.target || null, place, placeId: o.placeId || place?.id || 0, placeName: place?.name || (typeof o.place === 'string' ? o.place : '')});
    }
    const IMPORTS = () => [...AR().LOT_IDS.filter(n => lotUi(n)?.openImport).map(n => ({n, label: AR().LOTS[n].import})), ...(ext.socface?.openImport ? [{n: 'socface', label: '🧾 Recensements SocFace (fichier CSV de FranceArchives)'}] : [])];
    function importMenu(anchor, o = {}) {
        const l = IMPORTS(); const first = l.filter(x => String(x.n) === String(o.lot)); const rest = l.filter(x => String(x.n) !== String(o.lot));
        const item = x => ({icon: x.label.split(' ')[0], label: x.label.split(' ').slice(1).join(' '), run: () => { o.close?.(); if (x.n === 'socface') ext.socface.openImport({personId: o.personId}); else lotUi(x.n).openImport({personId: o.personId || 0, target: o.target || null, place: o.place && typeof o.place === 'object' ? o.place : null, placeId: o.placeId || 0}); }});
        UI().menuAt(anchor, [...first.map(item), ...(first.length ? ['-'] : []), ...rest.map(item)], {title: '⤒ Importer ce que tu as trouvé'});
    }

    /* ═════ 🔗 Coller un lien : un seul, qui reconnaît les liens de tous les lots ═════ */
    function openPaste(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-paste ael-paste';
        const imports = IMPORTS();
        dlg.innerHTML = `<form method="dialog" novalidate><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔗 Coller un lien</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien de la fiche, de l’acte ou de l’article<input name="link" inputmode="url" placeholder="https://gallica.bnf.fr/ark:/12148/…" autocomplete="off"></label>
            <p class="ui-hint" data-ael-found>Copie l’adresse dans la barre de ton navigateur : l’app reconnaît le site (Gallica, Mémoire des hommes, FamilySearch, IdRef, Archives Portal Europe…) et ouvre le bon import.</p>
            <label>Importer avec<select name="lot">${imports.map(x => `<option value="${esc(x.n)}">${esc(x.label)}</option>`).join('')}</select></label>
            <label>Texte de la fiche (facultatif)<textarea name="text" rows="6" placeholder="Nom : DUPONT&#10;Prénoms : Jean Marie&#10;Date de décès : 20/08/1914…"></textarea></label>
            <p class="ui-hint">Pas de lien ? Colle seulement le texte copié sur la page : la sorte de fiche est reconnue quand c’est possible.</p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        const link = dlg.querySelector('[name=link]'), sel = dlg.querySelector('[name=lot]'), found = dlg.querySelector('[data-ael-found]');
        if (o.lot && imports.some(x => String(x.n) === String(o.lot))) sel.value = String(o.lot);
        const text = dlg.querySelector('[name=text]');
        let touched = false;
        const detect = () => {
            const r = link.value.trim() ? AR().detectLink(link.value, regs(), {prefer: Number(o.lot) || 0}) : AR().detectText(text.value, regs(), {prefer: Number(o.lot) || 0});
            const okLot = r && imports.some(x => String(x.n) === String(r.lot));
            if (okLot && !touched) sel.value = String(r.lot);
            if (okLot) { found.className = 'ui-hint is-ok'; found.textContent = `✓ Reconnu : ${r.label}.`; }
            else if (link.value.trim()) { found.className = 'ui-hint'; found.textContent = AR().cleanUrl(link.value) ? '⚠️ Site pas reconnu : choisis l’import ci-dessous.' : '⚠️ Colle une adresse qui commence par https://'; }
            return r;
        };
        link.addEventListener('input', detect); text.addEventListener('input', detect);
        sel.addEventListener('change', () => { touched = true; });
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const l = link.value.trim(), t = text.value;
            if (l && !AR().cleanUrl(l)) return UI().fail?.(link, 'Colle une adresse qui commence par https://');
            if (!l && !t.trim()) return UI().fail?.(link, 'Colle le lien de la fiche (ou son texte, plus bas).');
            const n = sel.value === 'socface' ? 'socface' : Number(sel.value);
            dlg.close();
            if (n === 'socface') return ext.socface?.openPaste?.();
            lotUi(n)?.openImport?.({personId: Number(o.personId) || 0, link: l, text: t, linkOnly: true, textOnly: true, files: [new File([t || l], l ? 'lien-colle.txt' : 'texte-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); setTimeout(() => link.focus(), 30);
        return dlg;
    }

    /* ═════ ⚙️ Adresses des sites : un seul écran (K2), les clés de chaque lot ═════ */
    function openSettings(opt = {}) {
        if (typeof opt === 'function') opt = {onChange: opt};
        const onChange = opt.onChange;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-settings ael-settings';
        const view = lsJson(AR().VIEW_KEY, {}) || {};
        let open = Array.isArray(view.open) ? view.open : [];
        const rowsOf = () => {
            const R = regs(), keep = AR().collect(R, {mine: [], hidden: []}), alsoRows = AR().collectAll(R).filter(e => e.mergedInto && AR().MERGED[e.id]?.also && typeof e.lot === 'number');
            return [...keep.filter(e => e.lot !== 'socface'), ...alsoRows];
        };
        const html = () => {
            const R = regs(), hidden = new Set(AR().hiddenIds(LS)), rows = rowsOf(), secs = AR().sections(rows);
            const lotOpen = opt.lot ? new Set(secs.filter(s => s.list.some(e => String(e.lot) === String(opt.lot))).map(s => s.id)) : null;
            const rub = secs.map(s => { const n = s.list.filter(e => AR().hasCustom(e, LS)).length;
                return `<details class="ael-rub so3-rub" data-ael-rub="${esc(s.id)}" ${(lotOpen ? lotOpen.has(s.id) : open.includes(s.id)) ? 'open' : ''}><summary><b>${esc(s.flag)} ${esc(s.country)} · ${esc(s.theme.icon)} ${esc(s.theme.label)}</b> <small class="muted">${plural(s.list.length, 'site')}${n ? ` · ${plural(n, 'adresse à toi', 'adresses à toi')}` : ''}</small></summary>
                ${s.list.map(e => { const G = R[e.lot]; let ph = ''; try { ph = sampleUrl(G.url(e.key, SAMPLE, {})); } catch (_) { ph = ''; } const cu = AR().custom(e.lot, LS)[e.key]; const hid = hidden.has(e.id) || (e.lot === 7 && hidden.has(e.key));
                    return `<div class="so-set-row ael-set-row${e.paid === 'oui' ? ' is-paid' : ''}" data-ael-text="${esc(e.text)}"><div class="ael-set-head"><label class="ui-toggle" title="Montrer ce site dans la fenêtre de recherche"><input type="checkbox" data-ael-show="${esc(e.id)}" ${hid ? '' : 'checked'}><i></i><b>${esc(e.icon)} ${esc(e.mergedInto ? AR().MERGED[e.id].also : e.label)}</b></label> <span class="ael-badges">${badgesOf(e)}</span></div>
                    <label class="ael-set-url"><span class="sr-only">${i18n('Adresse à toi pour {site}', {site: esc(e.label)})}</span><input name="${esc(e.id)}" data-ael-lot="${esc(e.lot)}" data-ael-key="${esc(e.key)}" value="${esc(typeof cu === 'string' ? cu : '')}" placeholder="${esc(ph.slice(0, 300))}" autocomplete="off" spellcheck="false"></label></div>`; }).join('')}</details>`; }).join('');
            const cer = Object.entries(AR().store(7, LS).cercles || {});
            const cercles = R[7] ? `<details class="ael-rub so3-rub" data-ael-rub="cercles" ${open.includes('cercles') ? 'open' : ''}><summary><b>📒 Mon cercle généalogique, par département</b> <small class="muted">${cer.length ? plural(cer.length, 'département') : 'aucun'}</small></summary><p class="ui-hint">Le n° du département puis l’adresse du site de son cercle (ses relevés). Une ligne par département.</p>
                <div data-ael-cercles>${[...cer, ['', '']].map(([d, u]) => `<div class="so7-cercle"><label>Département<input data-ael-cdep value="${esc(d)}" placeholder="32" maxlength="3" autocomplete="off"></label><label>Adresse du cercle<input data-ael-curl value="${esc(u)}" inputmode="url" placeholder="https://…" autocomplete="off"></label></div>`).join('')}</div></details>` : '';
            const mine = AR().mineSites(LS);
            const mines = `<details class="ael-rub so3-rub" data-ael-rub="mine" ${open.includes('mine') || opt.mine ? 'open' : ''}><summary><b>⭐ Mes sites</b> <small class="muted">${mine.length ? plural(mine.length, 'site') : i18n('aucun')} · ${i18n('aussi dans « Chercher sur internet »')}</small></summary>
                ${mine.length ? `<ul class="so6-mine ael-mine">${mine.map(s => `<li><b>${esc(s.label)}</b> <code>${esc(s.url)}</code> <button type="button" class="icon-button small" data-ael-mine-del="${esc(s.from)}:${esc(s.key)}" aria-label="${i18n('Retirer {name}', {name: esc(s.label)})}" title="Retirer">✕</button></li>`).join('')}</ul>`
                    : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">⭐</span><span class="empty-line-text">Ajoute ici le site d’une association, d’une bibliothèque ou d’un relevé que tu connais.</span></p>'}
                <div class="form-grid so6-mine-form"><label>Nom du site<input data-ael-mine-label placeholder="Cercle généalogique du Finistère" autocomplete="off"></label>
                    <label class="so-span-2">Adresse de recherche<input data-ael-mine-url placeholder="https://exemple.fr/recherche?nom={nom}&prenom={prénom}" autocomplete="off" spellcheck="false"></label>
                    <p class="ui-hint so-span-2">Mets {nom}, {prénom}, {nom_complet}, {lieu}, {année}, {de} ou {à} à la place de ce que tu cherches.</p>
                    <div><button type="button" class="button small" data-ael-mine-add>＋ Ajouter mon site</button></div></div></details>`;
            return rub + cercles + mines;
        };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Adresses des sites</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Si un site change son adresse de recherche, écris la nouvelle ici. Case vide = l’adresse de l’app (en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {naissance}, {décès}, {département}, {insee}, {pays}, {classe}, {unité}, {canton}, {quoi}, {port}, {employeur}, {photographe}, {requête}. Seules les adresses en http(s) sont gardées. L’interrupteur montre ou cache le site dans la fenêtre de recherche.</p>
            <label class="ui-toggle"><input type="checkbox" data-ael-free-set ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement (les sites payants restent à la fin quand on décoche)</label>
            <div class="ael-bar"><input type="search" data-ael-sq placeholder="Chercher un site… (Italie, FreeBMD, cheminots, payant…)" autocomplete="off" aria-label="Chercher un site"></div>
            <p class="ui-hint" data-ael-scount></p>
            <div class="so-set ael-set" data-ael-set>${html()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const box = dlg.querySelector('[data-ael-set]');
        const filter = () => {
            const q = AR().fold(dlg.querySelector('[data-ael-sq]').value); let n = 0;
            box.querySelectorAll('details.ael-rub').forEach(d => { const rows = d.querySelectorAll('.so-set-row'); if (!rows.length) { d.hidden = !!q; return; } let k = 0; rows.forEach(r => { const ok = !q || q.split(' ').every(w => r.dataset.aelText.includes(w)); r.hidden = !ok; if (ok) k++; }); d.hidden = !k; if (q && k) d.open = true; n += k; });
            dlg.querySelector('[data-ael-scount]').textContent = q ? (n ? `${plural(n, 'site trouvé', 'sites trouvés')}` : i18n('Aucun site pour « {q} ».', {q: dlg.querySelector('[data-ael-sq]').value})) : '';
        };
        const save = () => {
            const R = regs(), by = {}, shownKeys = {};
            const before = n => Object.fromEntries(Object.entries(AR().custom(n, LS)).filter(([k, v]) => k !== 'cercles' && typeof v === 'string'));
            box.querySelectorAll('input[data-ael-lot]').forEach(i => { const n = Number(i.dataset.aelLot); if (!n) return; (shownKeys[n] = shownKeys[n] || new Set()).add(i.dataset.aelKey); });
            box.querySelectorAll('input[data-ael-lot]').forEach(i => { const n = Number(i.dataset.aelLot); if (!n) return; const v = i.value.trim(); const clean = R[n]?.cleanUrl || AR().cleanUrl;
                // les adresses d'un site qui n'a pas de case ici (un doublon rangé ailleurs) restent comme elles sont
                if (!by[n]) by[n] = Object.fromEntries(Object.entries(before(n)).filter(([k]) => !shownKeys[n].has(k)));
                if (v && clean(v.replace(/[{}]/g, ''))) by[n][i.dataset.aelKey] = v.slice(0, 600); });
            Object.entries(by).forEach(([n, urls]) => { const b = before(Number(n)); const sorted = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
                if (sorted(b) !== sorted(urls)) AR().writeUrls(Number(n), urls, LS); });
            const shown = [...box.querySelectorAll('[data-ael-show]')]; const allHidden = new Set(AR().hiddenIds(LS));
            shown.forEach(i => { const id = i.dataset.aelShow; const lot7 = id.startsWith('so7_') ? id.slice(4) : null; allHidden.delete(id); if (lot7) allHidden.delete(lot7); if (!i.checked) allHidden.add(lot7 || id); });
            const prevHidden = AR().hiddenIds(LS); if (JSON.stringify([...allHidden].sort()) !== JSON.stringify([...prevHidden].sort())) AR().writeHidden([...allHidden], LS);
            const cb = box.querySelector('[data-ael-cercles]');
            if (cb) { const cer = {}; const clean = R[7]?.cleanUrl || AR().cleanUrl; cb.querySelectorAll('.so7-cercle').forEach(r => { const d = r.querySelector('[data-ael-cdep]').value.trim().toUpperCase(); const u = clean(r.querySelector('[data-ael-curl]').value); if (/^(\d{2,3}|2A|2B)$/.test(d) && u) cer[d] = u; });
                const o7 = AR().store(7, LS); if (JSON.stringify(o7.cercles || {}) !== JSON.stringify(cer)) { o7.cercles = cer; lsSet(AR().LOTS[7].store, JSON.stringify(o7)); } }
            // une adresse retirée de partout, plus de réglage : la clé du lot 7 part si elle est vide
            const o7 = AR().store(7, LS); if (lsGet(AR().LOTS[7].store, null) && !Object.keys(o7.urls || {}).length && !(o7.hidden || []).length && !Object.keys(o7.cercles || {}).length && !(o7.mine || []).length) lsSet(AR().LOTS[7].store, null);
        };
        UI().autoSaveDialog(dlg, {keys: [...AR().STORE_KEYS, AR().FREE_KEY], label: 'Adresse d’un site',
            save: () => { const fr = dlg.querySelector('[data-ael-free-set]'); if (fr && fr.checked !== freeOnly()) setFreeOnly(fr.checked); save(); },
            reload: () => { box.innerHTML = html(); filter(); const fr = dlg.querySelector('[data-ael-free-set]'); if (fr) fr.checked = freeOnly(); },
            reset: () => { AR().STORE_KEYS.forEach(k => lsSet(k, null)); },
            onChange: () => onChange?.()});
        const redrawMine = () => { const d = box.querySelector('[data-ael-rub="mine"]'); if (d) { const tmp = document.createElement('div'); opt.mine = true; tmp.innerHTML = html(); d.replaceWith(tmp.querySelector('[data-ael-rub="mine"]')); } onChange?.(); };
        dlg.addEventListener('input', e => { if (e.target.matches('[data-ael-sq]')) filter(); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-ael-sq]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; filter(); } });
        dlg.addEventListener('toggle', e => { const d = e.target.closest?.('details.ael-rub'); if (!d || dlg.querySelector('[data-ael-sq]').value) return; open = [...box.querySelectorAll('details.ael-rub[open]')].map(x => x.dataset.aelRub); lsSet(AR().VIEW_KEY, JSON.stringify({...lsJson(AR().VIEW_KEY, {}), open})); }, true);
        dlg.addEventListener('change', e => { // la dernière ligne des cercles remplie : une ligne vide s'ajoute
            const row = e.target.closest('.so7-cercle:last-child'); if (!row) return;
            if (row.querySelector('[data-ael-cdep]').value.trim() && AR().cleanUrl(row.querySelector('[data-ael-curl]').value)) row.insertAdjacentHTML('afterend', '<div class="so7-cercle"><label>Département<input data-ael-cdep placeholder="32" maxlength="3" autocomplete="off"></label><label>Adresse du cercle<input data-ael-curl inputmode="url" placeholder="https://…" autocomplete="off"></label></div>');
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-ui-x]')) { dlg.close(); return; }
            if (e.target.closest('[data-ael-mine-add]')) {
                const lab = dlg.querySelector('[data-ael-mine-label]'), url = dlg.querySelector('[data-ael-mine-url]');
                const errs = []; if (!lab.value.trim()) errs.push([lab, 'Donne un nom au site.']);
                if (!/^https?:\/\/\S+$/i.test(url.value.trim()) || !AR().cleanUrl(url.value.trim().replace(/[{}]/g, ''))) errs.push([url, 'L’adresse doit commencer par https:// (ou http://), sans espace.']);
                if (errs.length) { if (UI().formErrors) UI().formErrors(dlg.querySelector('form'), errs); else UI().fail?.(errs[0][0], errs[0][1]); return; }
                const l = lsJson(AR().CUSTOM_KEY, []); const list = Array.isArray(l) ? l : [];
                list.push({key: `custom-${Date.now().toString(36)}`, label: lab.value.trim().slice(0, 80), url: url.value.trim().slice(0, 500)}); lsSet(AR().CUSTOM_KEY, JSON.stringify(list)); redrawMine();
                toast(i18n('Site « {name} » ajouté : il est aussi dans « Chercher sur internet ».', {name: lab.value.trim()}), 'success');
                return;
            }
            const del = e.target.closest('[data-ael-mine-del]');
            if (del) {
                const [from, key] = del.dataset.aelMineDel.split(/:(.+)/);
                const k = from === 'lot7' ? AR().LOTS[7].store : AR().CUSTOM_KEY; const before = lsGet(k, null);
                if (from === 'lot7') { const o7 = AR().store(7, LS); o7.mine = (o7.mine || []).filter(x => x.key !== key); lsSet(k, JSON.stringify(o7)); }
                else { const l = lsJson(k, []); lsSet(k, JSON.stringify((Array.isArray(l) ? l : []).filter(x => x.key !== key))); }
                redrawMine();
                const undo = () => { lsSet(k, before); redrawMine(); };
                if (A().undoToast) A().undoToast('Site retiré de « Mes sites »', {undo}); else toast('Site retiré.', '', {kind: 'undo', actions: [{label: '↶ Annuler', run: undo}]});
            }
        });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal(); filter();
        return dlg;
    }

    /* ═════ Le bloc « Chercher sur internet » : un bouton, un lien collé, « Où chercher ? » ═════ */
    const panelButton = ctx => `<div class="so-ws ael-ws"><button type="button" class="button small" data-ael-open data-pid="${Number(ctx?.id) || 0}" title="Tous les sites d’archives en ligne, nom et années déjà remplis : Mémoire des hommes, Gallica, FamilySearch, archives d’Europe…">🔍 Archives en ligne…</button><button type="button" class="button small secondary" data-ael-paste data-pid="${Number(ctx?.id) || 0}" title="Colle le lien d’une fiche trouvée : l’app reconnaît le site et ouvre le bon import">🔗 Coller un lien</button>${ctx?.id && ext.ouChercher?.openPerson ? `<button type="button" class="button small secondary" data-ael-ouc data-pid="${Number(ctx.id)}" title="Les sites les plus utiles pour cette personne, et pourquoi">🌍 Où chercher ?</button>` : ''}</div>`;
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-ael-open]'); if (b && !b.closest('dialog.ael-search')) { e.preventDefault(); const d = b.dataset; open({personId: Number(d.pid) || 0, lot: d.lot ? (d.lot === 'socface' ? 'socface' : Number(d.lot)) : undefined, group: d.group || undefined, where: d.where || undefined}); return; }
        const pl = e.target.closest('[data-ael-paste]'); if (pl) { e.preventDefault(); openPaste({personId: Number(pl.dataset.pid) || 0}); return; }
        const oc = e.target.closest('[data-ael-ouc]'); if (oc && !oc.closest('dialog')) { e.preventDefault(); ext.ouChercher?.openPerson?.(Number(oc.dataset.pid) || 0); }
    });
    // Recherche → « Chercher sur internet » (sans fiche) : les mêmes boutons sous le titre
    const decorateTool = () => { const tool = document.querySelector('.web-search-tool:not([data-ael]) .page-header > div'); if (!tool) return; tool.closest('.web-search-tool').dataset.ael = '1'; tool.insertAdjacentHTML('beforeend', panelButton(null)); };
    const start = () => { if (!document.body) return setTimeout(start, 100); new MutationObserver(() => decorateTool()).observe(document.body, {childList: true, subtree: true}); decorateTool(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    ext.archives = {open, openSettings, openPaste, importMenu, importFor, panelButton, entries, context, paramsFrom};
})();
