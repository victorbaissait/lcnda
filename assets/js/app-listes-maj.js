/* LCNDA — 🗂 Données installées : la date des données, « ↻ Vérifier » s'il existe plus récent, mettre à jour, tout télécharger.
 *
 *  1. Dans chaque liste de Listes → 🧰 Données (app-listes-donnees.js appelle LCNDA_EXT.listesMaj.header(page, d)) :
 *     « Données du 25 nov. 2026 · ↻ Vérifier ». Le pack d'une liste : d.pack / d.packs si la liste le dit, sinon son nom
 *     (l8c_tour → l8c-tour), sinon les fichiers assets/data/ qu'elle lit pendant qu'elle est ouverte.
 *     « ↻ Vérifier » (seulement sur un clic) → lib/donnees_maj.php lit le sommaire assets/data/manifest.json de la branche GitHub ;
 *     plus récent → « Une version plus récente existe (2 446 → 2 467 lignes, données du …) · Mettre à jour (1,2 Mo) », licence
 *     et source dites avant ; après : « +21 lignes : 2026 » avec ↶ Annuler (A().undoToast). Listes Wikidata : « compter sur
 *     Wikidata maintenant ».
 *  2. Réglages → « 🗂 Données » : TOUT ce qui se télécharge (packs météo, GOV, histoire du lieu, prénoms, élections, bases
 *     officielles, annuaires, lieux-dits et patrimoine — par leurs propres routes X_dl_start / X_dl_step / X_pack_finish —
 *     et les données livrées avec l'app), rangé par thème, avec taille, date, source + licence, état, actions ; filtres,
 *     recherche ; « ⤓ Tout télécharger », « ↻ Tout mettre à jour » : une file, un pack à la fois, pause, annuler, reprise
 *     après un redémarrage (localStorage « genealogie-donnees-file »).
 *  3. « Vérifier les mises à jour des données une fois par mois » (localStorage « genealogie-donnees-maj-auto », éteint
 *     au départ) : sinon rien ne part sur Internet sans un clic.
 * Mode consultation : rien ne se télécharge (le serveur refuse aussi). Essai : tests/test-donnees-maj.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lang = () => (window.LCNDA_I18N?.lang || document.documentElement.lang || 'fr');
    const nf = n => Number(n || 0).toLocaleString(lang() === 'fr' ? 'fr-FR' : lang());
    const fmtSize = b => { b = Number(b) || 0; const d = lang() === 'fr' ? ',' : '.'; return b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', d)} ${T('Go')}` : b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', d)} ${T('Mo')}` : `${Math.max(1, Math.round(b / 1e3))} ${T('Ko')}`; };
    const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d\d)(?:-(\d\d))?/); if (!m) return ''; try { return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), 12)).toLocaleDateString(lang() === 'fr' ? 'fr-FR' : lang(), m[3] ? {day: 'numeric', month: 'short', year: 'numeric'} : {month: 'long', year: 'numeric'}); } catch (_) { return iso; } };
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body = {}) => { const r = await A().api(a, {}, {method: 'POST', body}); return r && typeof r === 'object' && r.result && typeof r.result === 'object' ? r.result : r; };
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
    const AUTO = 'genealogie-donnees-maj-auto', LAST = 'genealogie-donnees-maj-dernier', QKEY = 'genealogie-donnees-file';
    const ensureCss = () => { if (document.querySelector('link[href*="donnees-maj.css"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/donnees-maj.css?v=1'; document.head.appendChild(l); };

    /* ═════════════ les données livrées (lib/donnees_maj.php) ═════════════ */
    let statusP = null;
    const status = (fresh = false) => { if (fresh || !statusP) statusP = api('donnees_maj_status').catch(e => { statusP = null; throw e; }); return statusP; };
    const packOf = async id => (await status()).packs.find(p => p.id === id) || null;

    /* les fichiers assets/data/ lus pendant qu'une liste est ouverte : le dernier recours pour savoir d'où viennent ses lignes */
    const seen = new Map();
    if (!window.fetch.__dmaj) {
        const of = window.fetch;
        const wrapped = function (input, init) {
            try {
                const u = typeof input === 'string' ? input : input?.url || '';
                const m = /assets\/data\/([^?#]+)/.exec(u);
                const page = m && document.querySelector('[data-ld-page]');
                if (page) { const id = page.dataset.ldPage; if (!seen.has(id)) seen.set(id, new Set()); seen.get(id).add(decodeURIComponent(m[1])); }
            } catch (_) {}
            return of.apply(this, arguments);
        };
        wrapped.__dmaj = true; window.fetch = wrapped;
    }
    /** les packs d'une liste */
    async function packsOfList(d) {
        const st = await status(), ids = new Set(), has = id => st.packs.some(p => p.id === id);
        [].concat(d.packs || d.pack || []).forEach(x => { if (has(x)) ids.add(x); });
        if (!ids.size) {
            const base = String(d.id || '').toLowerCase().replace(/_/g, '-');
            for (const c of [base, base.replace(/s$/, ''), base + 's']) if (has(c)) { ids.add(c); break; }
        }
        if (!ids.size) for (const rel of seen.get(d.id) || []) { const id = st.index?.[rel]; if (id) ids.add(id); }
        return [...ids];
    }

    /* ═════════════ 1. la ligne sous le titre d'une liste ═════════════ */
    function header(page, d) {
        if (!page || !d || page.querySelector('[data-dmaj-line]')) return;
        ensureCss();
        const line = document.createElement('div');
        line.className = 'dmaj-line'; line.dataset.dmajLine = d.id; line.hidden = true;
        const src = page.querySelector('.ld-source');
        if (src) src.insertAdjacentElement('afterend', line); else (page.firstElementChild || page).insertAdjacentElement('afterend', line);
        let tries = 0;
        const fill = async () => {
            if (!line.isConnected) return;
            let ids = []; try { ids = await packsOfList(d); } catch (_) { return; }
            if (!ids.length) { if (tries++ < 3) setTimeout(fill, [1200, 3000, 6000][tries - 1]); return; }
            const st = await status(), ps = ids.map(id => st.packs.find(p => p.id === id)).filter(Boolean);
            const date = ps.map(p => p.version).sort().pop();
            const upd = ps.some(p => p.state === 'updated');
            line.dataset.dmajPacks = ids.join(',');
            line.innerHTML = `<small class="muted"><span data-dmaj-date>${esc(date ? T('Données du {d}', {d: fmtDate(date)}) : T('Données livrées avec l’app'))}${upd ? ` ${esc(T('(mises à jour)'))}` : ''}</span>${kiosk() ? '' : ` · <button type="button" class="dmaj-link" data-dmaj-check>↻ ${esc(T('Vérifier'))}</button>`}</small><div class="dmaj-res" data-dmaj-res hidden aria-live="polite"></div>`;
            line.hidden = false;
            line.querySelector('[data-dmaj-check]')?.addEventListener('click', () => checkLine(line, ids, ps));
        };
        fill();
    }

    /** le message d'erreur réseau, clair */
    const isNet = e => !!(e?.network || e?.status === 503 || /connexion|réseau|Internet/i.test(e?.message || ''));
    const netMsg = e => (isNet(e) ? T('Pas de connexion à Internet (ou le réseau bloque GitHub) : impossible de vérifier pour l’instant. Rien n’a changé.') : (e?.message || T('Vérification impossible.')));

    async function checkLine(line, ids, ps) {
        const res = line.querySelector('[data-dmaj-res]'), btn = line.querySelector('[data-dmaj-check]');
        res.hidden = false; res.innerHTML = `<small class="muted">${esc(T('Vérification…'))}</small>`; if (btn) btn.disabled = true;
        try {
            const r = await api('donnees_maj_check', {packs: ids.join(','), fresh: 1});
            writeLS(LAST, String(Date.now()));
            const list = ids.map(id => [id, r.packs?.[id]]).filter(x => x[1]);
            const newer = list.filter(([, x]) => x.newer);
            const wd = ps.filter(p => p.wikidata);
            const wdBtn = wd.length ? ` <button type="button" class="dmaj-link" data-dmaj-wd="${esc(wd[0].id)}">🌐 ${esc(T('Compter sur Wikidata maintenant'))}</button>` : '';
            if (!newer.length) {
                const v = list.map(([, x]) => x.current.version).sort().pop();
                res.innerHTML = `<p class="dmaj-ok" data-dmaj-uptodate>✓ ${esc(T('Ces données sont à jour (version du {d}).', {d: fmtDate(v)}))}${wdBtn}</p><p class="dmaj-wd" data-dmaj-wd-res hidden></p>`;
            } else {
                const rows0 = newer.reduce((n, [, x]) => n + (x.current.rows || 0), 0), rows1 = newer.reduce((n, [, x]) => n + (x.remote?.rows || 0), 0);
                const dl = newer.reduce((n, [, x]) => n + (x.download || 0), 0), date = newer.map(([, x]) => x.remote?.version).sort().pop();
                const rem = newer[0][1].remote || {};
                res.innerHTML = `<p class="dmaj-new" data-dmaj-newer>${esc(T('Une version plus récente existe ({a} → {b} lignes, données du {d})', {a: nf(rows0), b: nf(rows1), d: fmtDate(date)}))}
                    · <button type="button" class="button small" data-dmaj-apply>${esc(T('Mettre à jour ({s})', {s: fmtSize(dl)}))}</button></p>
                    <p class="dmaj-lic"><small class="muted">${esc(T('Source : {s}', {s: rem.source || '—'}))} · ${esc(T('Licence : {l}', {l: rem.licence || '—'}))}${rem.url ? ` · <a href="${esc(rem.url)}" target="_blank" rel="noopener">↗</a>` : ''} · ${esc(T('Téléchargé depuis GitHub, vérifié (sha256) ; l’ancienne version est gardée.'))}</small></p>${wdBtn ? `<p>${wdBtn}</p><p class="dmaj-wd" data-dmaj-wd-res hidden></p>` : ''}`;
                res.querySelector('[data-dmaj-apply]').addEventListener('click', async ev => {
                    ev.currentTarget.disabled = true;
                    const ok = await applyPacks(newer.map(([id]) => id), {label: line.closest('[data-ld-page]')?.querySelector('h1,h2')?.textContent?.trim() || ''});
                    if (ok) { res.innerHTML = `<p class="dmaj-ok" data-dmaj-done>✓ ${esc(T('Mis à jour.'))} <button type="button" class="dmaj-link" data-dmaj-reload>↻ ${esc(T('Recharger la liste'))}</button></p>`; res.querySelector('[data-dmaj-reload]').addEventListener('click', () => location.reload()); refreshLine(line); }
                    else ev.currentTarget.disabled = false;
                });
            }
            res.querySelector('[data-dmaj-wd]')?.addEventListener('click', ev => wikidataCount(ev.currentTarget.dataset.dmajWd, res.querySelector('[data-dmaj-wd-res]')));
        } catch (e) {
            res.innerHTML = `<p class="dmaj-off" data-dmaj-offline>⚠ ${esc(netMsg(e))}</p>`;
        } finally { if (btn) btn.disabled = false; }
    }
    async function refreshLine(line) {
        const ids = (line.dataset.dmajPacks || '').split(',').filter(Boolean); if (!ids.length) return;
        const st = await status(true), ps = ids.map(id => st.packs.find(p => p.id === id)).filter(Boolean);
        const date = ps.map(p => p.version).sort().pop(), upd = ps.some(p => p.state === 'updated');
        const el = line.querySelector('[data-dmaj-date]'); if (el) el.textContent = `${T('Données du {d}', {d: fmtDate(date)})}${upd ? ` ${T('(mises à jour)')}` : ''}`;
    }
    async function wikidataCount(id, box) {
        if (!box) return; box.hidden = false; box.textContent = T('Question envoyée à Wikidata (seulement la question publique de la liste, rien de personnel)…');
        try { const r = await api('donnees_maj_wikidata', {pack: id}); box.textContent = r.count > r.rows ? T('Wikidata en compte {n} aujourd’hui (le pack en a {m}) : la prochaine version des données les apportera.', {n: nf(r.count), m: nf(r.rows)}) : T('Wikidata en compte {n} aujourd’hui (le pack en a {m}).', {n: nf(r.count), m: nf(r.rows)}); }
        catch (e) { box.textContent = '⚠ ' + netMsg(e); }
    }

    /** « +21 lignes : 2026 » */
    const diffText = r => {
        const d = r.diff || {}, delta = (r.after?.rows || 0) - (r.before?.rows || 0);
        const parts = [];
        if (d.added || delta > 0) parts.push(T('+{n} lignes', {n: nf(d.added || delta)}));
        if (d.removed) parts.push(T('−{n} lignes', {n: nf(d.removed)}));
        const y = (d.years || []).length ? ` : ${d.years.join(', ')}` : '';
        return parts.length ? parts.join(', ') + y : T('mêmes lignes, valeurs corrigées');
    };
    /** télécharge et remplace ; ↶ Annuler remet l'ancienne (et ↷ la nouvelle) */
    async function applyPacks(ids, {label = '', quiet = false} = {}) {
        if (kiosk()) { toast(T('Mode consultation : les données ne se mettent pas à jour.'), 'error'); return false; }
        const done = [];
        for (const id of ids) {
            try { const r = await post('donnees_maj_apply', {pack: id}); if (!r.already) done.push(r); }
            catch (e) { toast(netMsg(e), 'error'); break; }
        }
        statusP = null;
        if (!done.length) return false;
        const msg = done.length === 1 ? T('🗂 {name} mis à jour : {d}', {name: label || done[0].pack, d: diffText(done[0])}) : T('🗂 {n} packs de données mis à jour', {n: done.length});
        const swap = async () => { for (const r of done) await post('donnees_maj_undo', {pack: r.pack}); statusP = null; repaintAll(); };
        if (!quiet) (A().undoToast ? A().undoToast(msg, {undo: swap, redo: swap, icon: '🗂'}) : toast(msg, 'success'));
        repaintAll();
        return done;
    }

    /* ═════════════ 2. tout ce qui se télécharge : le catalogue ═════════════ */
    /* chaque famille garde ses propres routes (lib/meteo_dl.php, gov.php…) ; ici, on les appelle de la même façon */
    const one = (k, name, what, extra = {}) => ({k, name, what, ...extra});
    const FAM = [
        {id: 'meteo', icon: '🌦', theme: 'Météo d’autrefois', tab: 'meteo', status: 'meteo_status', info: 'meteo_dl_info', pre: 'meteo', finish: 'meteo_pack_finish', body: k => ({kind: k}),
            source: 'Météo-France, MeteoSwiss, IRM, DWD, NOAA, Copernicus (voir la page Météo)', licence: 'Licence Ouverte, CC BY 4.0', url: 'https://meteo.data.gouv.fr/',
            installed: (s, k) => !!s?.files?.[k], built: (s, k) => s?.files?.[k]?.built || '', size: (s, k) => s?.files?.[k]?.size || 0, removable: (s, k) => s?.files?.[k]?.removable !== false, online: (i, k) => i?.packs?.[k],
            items: [one('socle', 'Socle', 'France, Belgique, Suisse, Luxembourg depuis 1836 · ≈ 300 stations', {approx: 550e6}), one('complet', 'Pack complet', 'Toutes les stations (≈ 14 700), heure par heure depuis 1950', {approx: 3e9}),
                one('europe', 'Pack Europe', 'Stations de 10 pays d’Europe + reconstitution 1836–1939', {approx: 2.5e9}),
                one('monde-amerique-nord', 'Amérique du Nord', '≈ 2 500 stations (NOAA GHCN-Daily)', {approx: 300e6}), one('monde-amerique-sud', 'Amérique du Sud', '≈ 400 stations', {approx: 15e6}),
                one('monde-afrique', 'Afrique', '≈ 600 stations', {approx: 25e6}), one('monde-asie', 'Asie', '≈ 1 800 stations', {approx: 100e6}), one('monde-oceanie', 'Océanie', '≈ 1 000 stations', {approx: 50e6}),
                one('monde-europe', 'Europe (hors pack Europe)', '≈ 1 200 stations', {approx: 80e6}),
                one('plus-neige', 'Neige et températures fines', 'ERA5-Land (Copernicus), carreaux de ≈ 9 km', {approx: 220e6, licence: 'CC BY 4.0'}), one('plus-cerra', 'Températures très fines', 'CERRA (Copernicus), carreaux de ≈ 5,5 km', {approx: 450e6, licence: 'CC BY 4.0'}),
                one('plus-ressenti', 'Ressenti thermique', 'UTCI, ERA5-HEAT (Copernicus)', {approx: 200e6, licence: 'CC BY 4.0'}), one('plus-rivieres', 'Débit des rivières', 'GloFAS (Copernicus CEMS)', {approx: 150e6, licence: 'Licence CEMS-FLOODS, libre avec mention'}),
                one('plus-anciennes', 'Relevés anciens (avant 1836)', 'Les plus vieilles séries d’Europe (Copernicus)', {approx: 5e6, licence: 'CC BY 4.0'})]},
        {id: 'gov', icon: '🏰', theme: 'Lieux et histoire', tab: 'gov', status: 'gov_status', info: 'gov_dl_info', pre: 'gov', finish: 'gov_pack_finish', body: () => ({}),
            source: 'GOV, gov.genealogy.net', licence: 'CC BY-SA 3.0', url: 'https://gov.genealogy.net/', installed: s => !!s?.installed, built: s => s?.built || '', size: s => s?.size || 0, online: i => i?.packs?.gov,
            items: [one('gov', 'Lieux anciens (GOV)', 'Les noms anciens des lieux, leurs paroisses et rattachements')]},
        {id: 'hist', icon: '🏘', theme: 'Lieux et histoire', tab: 'histoire', status: 'hist_status', info: 'hist_dl_info', pre: 'hist', finish: 'hist_pack_finish', body: () => ({}),
            source: 'Insee, Géorisques, NOAA, INGV… (voir Histoire du lieu)', licence: 'Licence Ouverte, CC BY 4.0, ODbL', url: 'https://www.insee.fr/', installed: s => !!s?.installed, built: s => s?.built || '', size: s => s?.size || 0, online: i => i?.packs?.histoire,
            items: [one('histoire', 'Histoire du lieu', 'Population des communes, gares, crues, séismes, vendanges…')]},
        {id: 'lp', icon: '🏘️', theme: 'Lieux et histoire', tab: 'lieux_patrimoine', status: 'lp_status', info: 'lp_dl_info', pre: 'lp', finish: 'lp_pack_finish', body: k => ({key: k}), multi: true,
            source: 'IGN (lieux-dits) ; ministère de la Culture, Mérimée et Palissy', licence: 'Licence Ouverte 2.0', url: 'https://www.pop.culture.gouv.fr/',
            installed: (s, k) => !!s?.packs?.[k], built: (s, k) => s?.packs?.[k]?.built || '', size: (s, k) => s?.packs?.[k]?.size || 0, online: (i, k) => i?.packs?.[k],
            /* les départements de la généalogie (et ceux déjà installés) : les autres, sur la page Lieux-dits et patrimoine */
            itemsOf: (s, i) => { const deps = new Set([...(s?.wanted || []), ...Object.values(s?.packs || {}).map(p => p.dep)]); const names = s?.dep_names || {}; const out = [];
                for (const dep of [...deps].sort()) for (const [kind, lab, what] of [['lieuxdits', 'Lieux-dits', 'Les lieux-dits du département (IGN)'], ['patrimoine', 'Patrimoine', 'Églises, cloches, monuments (Mérimée, Palissy)']]) out.push(one(`${kind}-${dep}`, `${lab} · ${dep} ${names[dep] || ''}`.trim(), what));
                for (const k of Object.keys(i?.packs || {})) if (!out.some(x => x.k === k) && s?.packs?.[k]) out.push(one(k, k, '')); return out; }},
        {id: 'pp', icon: '📊', theme: 'Personnes et noms', tab: '', status: 'prenoms_pays_status', info: 'prenoms_pays_dl_info', pre: 'prenoms_pays', finish: 'prenoms_pays_dl_finish', body: () => ({}),
            source: 'Insee, OFS, Statbel, RRQ…', licence: 'Licence Ouverte et licences des offices', url: 'https://www.insee.fr/fr/statistiques/2540004', installed: s => !!s?.installed, built: s => s?.built || '', size: s => s?.size || 0, online: i => i?.pack,
            items: [one('pays', 'Prénoms d’ici et d’ailleurs', 'Les prénoms donnés par pays, région et année')]},
        {id: 'elections', icon: '🗳', theme: 'Lieux et histoire', tab: 'elections', status: 'elections_status', info: 'elections_dl_info', pre: 'elections', finish: 'elections_dl_finish', body: () => ({}),
            source: 'Données électorales historiques (voir Élections d’autrefois)', licence: 'voir la page Élections', url: '', installed: s => !!s?.installed, built: s => s?.built || '', size: s => s?.size || 0, online: i => i?.pack,
            items: [one('elections', 'Élections d’autrefois', 'Les résultats commune par commune')]},
        {id: 'bo', icon: '🎖️', theme: 'Personnes et noms', tab: 'bases_officielles', status: 'bo_status', info: 'bo_dl_info', pre: 'bo', finish: 'bo_dl_finish', body: k => ({kind: k}),
            source: 'Mémoire des hommes (ministère des Armées) ; base Léonore (Archives nationales)', licence: 'Licence Ouverte', url: 'https://www.memoiredeshommes.sga.defense.gouv.fr/',
            installed: (s, k) => !!s?.bases?.[k]?.installed, built: (s, k) => s?.bases?.[k]?.built || '', size: (s, k) => s?.bases?.[k]?.size || 0, online: (i, k) => i?.packs?.[k],
            items: [one('mpf', 'Morts pour la France 1914–1918', 'Les fiches des soldats morts pour la France'), one('leonore', 'Légion d’honneur (base Léonore)', 'Les dossiers des décorés')]},
        {id: 'ba', icon: '📇', theme: 'Personnes et noms', tab: 'brevets_annuaires', status: 'ba_status', info: 'ba_dl_info', pre: 'ba', finish: 'ba_dl_finish', body: () => ({}),
            source: 'SoDUCo, Annuaires historiques parisiens 1798-1914 (NAKALA)', licence: 'Licence Ouverte 2.0', url: 'https://nakala.fr/', installed: s => !!s?.installed, built: s => s?.built || '', size: s => s?.size || 0, online: i => i?.packs?.annuaires,
            items: [one('annuaires', 'Annuaires de Paris', 'Les commerçants et métiers de Paris, 1798–1914')]}];
    const THEMES = ['Météo d’autrefois', 'Lieux et histoire', 'Personnes et noms', 'Livrées avec l’app'];
    const famOf = id => FAM.find(f => f.id === id);

    /* l'état de chaque famille (local) et ce qui est en ligne (seulement après un clic) */
    const C = {st: {}, info: {}, infoErr: {}, net: '', data: null, check: null, checkErr: '', checkedAt: 0, filter: readLS('genealogie-donnees-filtre', 'all'), q: ''};
    async function loadLocal() {
        await Promise.all(FAM.map(async f => { try { C.st[f.id] = await api(f.status); } catch (e) { C.st[f.id] = null; } }));
        try { C.data = await status(true); } catch (_) { C.data = null; }
    }
    /** « ↻ Vérifier tout » : les sommaires en ligne de chaque famille + celui des données livrées */
    async function loadOnline() {
        C.net = '';
        await Promise.all(FAM.map(async f => { try { C.info[f.id] = await api(f.info); C.infoErr[f.id] = ''; } catch (e) { C.info[f.id] = null; C.infoErr[f.id] = e?.message || '?'; if (isNet(e)) C.net = netMsg(e); } }));
        try { C.check = await api('donnees_maj_check', {fresh: 1}); C.checkErr = ''; } catch (e) { C.check = null; C.checkErr = netMsg(e); if (isNet(e)) C.net = netMsg(e); }
        C.checkedAt = Date.now(); writeLS(LAST, String(Date.now()));
    }
    /** toutes les lignes : {key, fam, k, theme, icon, name, what, size, date, source, licence, url, state: ok|update|missing|unknown, dl, removable} */
    function rows() {
        const out = [];
        for (const f of FAM) {
            const s = C.st[f.id], i = C.info[f.id];
            const items = f.itemsOf ? f.itemsOf(s, i) : f.items;
            for (const it of items) {
                const inst = !!(s && f.installed(s, it.k)), on = i ? f.online(i, it.k) : null;
                const built = s ? f.built(s, it.k) : '';
                const upd = inst && on && on.built && built && String(on.built) > String(built);
                out.push({key: `${f.id}:${it.k}`, fam: f.id, k: it.k, theme: f.theme, icon: f.icon, name: it.name, what: it.what, tab: f.tab,
                    size: inst ? f.size(s, it.k) : (on?.size || it.approx || 0), approx: !inst && !on, date: inst ? built : (on?.built || ''), online: !!on, unreachable: !!C.infoErr[f.id],
                    source: f.source, licence: it.licence || f.licence, url: f.url, state: inst ? (upd ? 'update' : 'ok') : on ? 'missing' : (i || C.infoErr[f.id] ? 'absent' : 'missing'),
                    dl: upd || !inst ? (on?.size || 0) : 0, removable: inst && (!f.removable || f.removable(s, it.k))});
            }
        }
        for (const p of C.data?.packs || []) {
            const c = C.check?.packs?.[p.id];
            out.push({key: `data:${p.id}`, fam: 'data', k: p.id, theme: 'Livrées avec l’app', icon: '📦', name: titleOf(p), what: p.rows ? T('{n} lignes', {n: nf(p.rows)}) : '', size: p.size, date: p.version,
                source: p.source, licence: p.licence, url: p.url, state: c?.newer ? 'update' : 'ok', dl: c?.newer ? c.download : 0, removable: false, canUndo: p.can_undo, updated: p.state === 'updated', remote: c?.remote || null});
        }
        return out;
    }
    /* le nom d'un pack livré : celui de sa liste (Listes → Données) quand on le connaît */
    function titleOf(p) {
        const L = ext.dataListsEngine?.list?.() || ext.dataLists || [];
        const d = L.find(x => [].concat(x.packs || x.pack || []).includes(p.id) || String(x.id || '').toLowerCase().replace(/_/g, '-') === p.id);
        if (d) return `${d.icon || ''} ${T(d.label)}`.trim();
        const t = String(p.title || '').replace(/\s*\(.*$/, '');
        return t ? (t.length > 70 ? t.slice(0, 68) + '…' : t) : p.id;
    }

    /* ═════════════ la file : un pack à la fois, pause, annuler, reprise après redémarrage ═════════════ */
    const Q = {items: [], running: false, pause: false, cancel: false, done: []};
    const qSave = () => writeLS(QKEY, Q.items.length ? JSON.stringify(Q.items.filter(x => x.state !== 'done').map(({fam, k, name, id, received, size, state}) => ({fam, k, name, id: id || '', received: received || 0, size: size || 0, state: state === 'run' ? 'paused' : state}))) : null);
    (() => { try { const v = JSON.parse(readLS(QKEY, '[]')); if (Array.isArray(v)) Q.items = v.filter(x => x && (famOf(x.fam) || x.fam === 'data') && typeof x.k === 'string').map(x => ({...x, state: x.state === 'error' ? 'error' : 'paused'})); } catch (_) {} })();
    const qPending = () => Q.items.filter(x => x.state !== 'done' && x.state !== 'error');
    function enqueue(list) {
        for (const r of list) if (!Q.items.some(x => x.fam === r.fam && x.k === r.k && x.state !== 'done')) Q.items.push({fam: r.fam, k: r.k, name: r.name, size: r.dl || r.size || 0, received: 0, state: 'wait'});
        qSave(); paintQueue();
    }
    async function runQueue() {
        if (Q.running || kiosk()) return;
        Q.running = true; Q.pause = false; Q.cancel = false; Q.done = [];
        Q.items.forEach(x => { if (x.state === 'paused') x.state = 'wait'; });
        paintQueue();
        try {
            for (;;) {
                if (Q.pause || Q.cancel) break;
                const it = Q.items.find(x => x.state === 'wait'); if (!it) break;
                it.state = 'run'; paintQueue();
                try { await runOne(it); if (it.state === 'run') { it.state = 'done'; Q.done.push(it); } }
                catch (e) { it.state = 'error'; it.err = e?.message || String(e); if (e?.network || e?.status === 503) { it.state = 'paused'; Q.pause = true; toast(netMsg(e), 'error'); } }
                qSave(); paintQueue();
            }
        } finally {
            Q.running = false;
            if (Q.cancel) { Q.items = Q.items.filter(x => x.state === 'done'); }
            if (Q.pause) Q.items.forEach(x => { if (x.state === 'wait') x.state = 'paused'; });
            Q.items = Q.items.filter(x => x.state !== 'done');
            qSave(); paintQueue();
            const done = Q.done.slice(); Q.done = [];
            if (done.length) {
                const undo = async () => { for (const it of done.slice().reverse()) { try { await undoOne(it); } catch (_) {} } await refreshPanel(); };
                const msg = done.length === 1 ? T('⤓ {name} installé.', {name: T(done[0].name)}) : T('⤓ {n} packs installés.', {n: done.length});
                A().undoToast ? A().undoToast(msg, {undo, icon: '⤓'}) : toast(msg, 'success');
            }
            await refreshPanel();
        }
    }
    async function runOne(it) {
        if (it.fam === 'data') {
            const r = await applyPacks([it.k], {label: it.name, quiet: true});
            if (!r) throw new Error(T('Mise à jour impossible : {name}', {name: it.name}));
            it.result = r[0]; it.received = it.size; return;
        }
        const f = famOf(it.fam);
        if (it.id) { try { const r = await api(`${f.pre}_dl_resume`, {id: it.id}); if (r.exists) { it.received = r.received || 0; it.size = r.size || it.size; } else it.id = ''; } catch (_) { it.id = ''; } }
        if (!it.id) { const r = await post(`${f.pre}_dl_start`, f.body(it.k)); if (r?.error) throw new Error(r.error); it.id = r.id; it.size = r.size || it.size; it.received = 0; qSave(); }
        let fails = 0;
        for (;;) {
            if (Q.pause) { it.state = 'paused'; return; }
            if (Q.cancel) { try { await post(`${f.pre}_dl_cancel`, {id: it.id}); } catch (_) {} it.state = 'cancelled'; return; }
            try { const r = await post(`${f.pre}_dl_step`, {id: it.id}); it.received = r.received; it.size = r.size || it.size; fails = 0; paintProgress(it); qSave(); if (r.done) break; }
            catch (e) { if (++fails >= 4) throw e; await new Promise(res => setTimeout(res, 1500 * fails)); }
        }
        const r = await post(f.finish, {id: it.id}); if (r?.error) throw new Error(r.error);
        it.id = '';
    }
    async function undoOne(it) {
        if (it.fam === 'data') return post('donnees_maj_undo', {pack: it.k});
        const f = famOf(it.fam); return post(`${f.pre}_pack_undo`, f.body(it.k));
    }
    function pauseQueue() { Q.pause = true; paintQueue(); }
    async function cancelQueue() {
        const ok = A().confirmBox ? await A().confirmBox(T('Ce qui est déjà installé reste ; le téléchargement en cours est effacé.'), {title: T('Annuler les téléchargements ?'), okLabel: T('Annuler les téléchargements'), cancelLabel: T('Continuer')}) : true;
        if (!ok) return;
        if (Q.running) { Q.cancel = true; return; }
        for (const it of Q.items) { if (it.id && famOf(it.fam)) { try { await post(`${famOf(it.fam).pre}_dl_cancel`, {id: it.id}); } catch (_) {} } }
        Q.items = []; qSave(); paintQueue();
    }

    /* ═════════════ Réglages → 🗂 Données ═════════════ */
    const TAB = ['donnees_installees', '25k2', '🗂 Données'];
    function register() {
        const app = A(); if (!Array.isArray(app?.defaultMaintenanceTabs)) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB);
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', () => { if (!register()) setTimeout(register, 500); });
    const ws = () => document.getElementById('workspace');
    const panel = () => ws()?.querySelector('[data-dmaj-panel]');
    const goTab = tab => { const st = A().state; if (!st || !tab) return; st.maintenanceTab = tab; A().persistUiState?.(); A().setModule?.('maintenance'); };

    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const host = ws(); if (!host) return; ensureCss();
        host.innerHTML = `<section class="page dmaj-page" data-dmaj-panel>${UI().pageHeader ? UI().pageHeader({title: T('Données'), icon: '🗂', where: T('Réglages · Données'), help: T('Tout ce que l’app peut télécharger, et les données livrées avec elle : ce qui est installé, ce qui manque, ce qui a une version plus récente.')}) : `<h2>🗂 ${esc(T('Données'))}</h2>`}${UI().spinner ? UI().spinner(T('Chargement…')) : ''}</section>`;
        await loadLocal();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        drawPanel();
    };
    async function refreshPanel() { if (!panel()) return; await loadLocal(); drawPanel(); }
    function repaintAll() { document.querySelectorAll('[data-dmaj-line]').forEach(l => refreshLine(l).catch(() => {})); if (panel()) refreshPanel(); }

    const STATE_TXT = {ok: ['✓', 'installé · à jour'], update: ['↻', 'mise à jour dispo'], missing: ['⤓', 'pas installé'], absent: ['—', 'pas en ligne']};
    function drawPanel() {
        const host = panel(); if (!host) return;
        const all = rows(), q = fold(C.q);
        const installedSize = (C.data?.data_dir_size || 0) + (C.data?.packs || []).filter(p => p.state === 'shipped').reduce((n, p) => n + p.size, 0);
        const missing = all.filter(r => r.state === 'missing' && r.online), updates = all.filter(r => r.state === 'update');
        const sum = l => l.reduce((n, r) => n + (r.dl || 0), 0);
        const pass = r => (C.filter === 'all' || (C.filter === 'installed' && (r.state === 'ok' || r.state === 'update')) || (C.filter === 'missing' && (r.state === 'missing' || r.state === 'absent')) || (C.filter === 'update' && r.state === 'update'))
            && (!q || fold(`${r.name} ${r.what} ${r.source} ${r.theme}`).includes(q));
        const shown = all.filter(pass);
        const auto = readLS(AUTO, '0') === '1';
        const last = Number(readLS(LAST, '0')) || 0;
        const K = UI().toggleHtml || ((l, o) => `<label class="ui-toggle"><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`);
        const filt = [['all', 'Tout'], ['installed', 'Installé'], ['missing', 'Pas installé'], ['update', 'Mise à jour dispo']];
        const offline = C.net || C.checkErr;
        const head = host.querySelector('.page-header, header') ? host.querySelector('.page-header, header').outerHTML : `<h2>🗂 ${esc(T('Données'))}</h2>`;
        const group = th => { const list = shown.filter(r => r.theme === th); if (!list.length) return '';
            const body = list.map(rowHtml).join('');
            return th === 'Livrées avec l’app' ? `<details class="dmaj-group" data-dmaj-group="data" ${C.filter === 'update' || q ? 'open' : ''}><summary><h3>📦 ${esc(T(th))} <small class="muted">${esc(T('{n} packs', {n: list.length}))}</small></h3></summary><div class="dmaj-rows">${body}</div></details>`
                : `<section class="dmaj-group" data-dmaj-group="${esc(th)}"><h3>${esc(T(th))}</h3><div class="dmaj-rows">${body}</div></section>`; };
        host.innerHTML = `${head}
            <div class="dmaj-top card">
              <p class="dmaj-sum"><span data-dmaj-used>${esc(T('Installé : {s}', {s: fmtSize(installedSize)}))}</span>${C.data?.free != null ? ` · <span data-dmaj-free>${esc(T('Libre sur le disque : {s}', {s: fmtSize(C.data.free)}))}</span>` : ''}
                 ${last ? ` · <small class="muted">${esc(T('Vérifié le {d}', {d: new Date(last).toLocaleDateString(lang() === 'fr' ? 'fr-FR' : lang())}))}</small>` : ''}</p>
              ${kiosk() ? `<p class="muted">${esc(T('Mode consultation : rien ne se télécharge.'))}</p>` : `<div class="dmaj-acts">
                <button type="button" class="button small secondary" data-dmaj-checkall>↻ ${esc(T('Vérifier tout'))}</button>
                <button type="button" class="button small" data-dmaj-getall ${C.checkedAt && !missing.length ? 'disabled' : ''}>⤓ ${esc(C.checkedAt ? T('Tout télécharger ({s})', {s: fmtSize(sum(missing))}) : T('Tout télécharger'))}</button>
                <button type="button" class="button small" data-dmaj-updall ${C.checkedAt && !updates.length ? 'disabled' : ''}>↻ ${esc(C.checkedAt ? T('Tout mettre à jour ({n})', {n: updates.length}) : T('Tout mettre à jour'))}</button></div>`}
              ${offline ? `<p class="dmaj-off" data-dmaj-offline>⚠ ${esc(offline)}</p>` : ''}
              <div data-dmaj-queue></div>
              <div class="dmaj-auto">${K(T('Vérifier les mises à jour des données une fois par mois'), {checked: auto, attrs: 'data-dmaj-auto', sub: T('Éteint : rien ne part sur Internet sans un clic. Seuls les sommaires publics sont lus (GitHub), rien de personnel.')})}</div>
            </div>
            <div class="dmaj-filters"><span class="segmented" role="group" aria-label="${esc(T('Montrer'))}">${filt.map(([v, l]) => `<button type="button" data-dmaj-filter="${v}" class="${C.filter === v ? 'is-active' : ''}" aria-pressed="${C.filter === v}">${esc(T(l))}</button>`).join('')}</span>
              <input type="search" class="dmaj-q" data-dmaj-q placeholder="${esc(T('Chercher un pack…'))}" aria-label="${esc(T('Chercher un pack'))}" value="${esc(C.q)}"></div>
            <div data-dmaj-list>${shown.length ? [...new Set([...THEMES, ...FAM.map(f => f.theme)])].map(group).join('') : `<p class="muted">${esc(T('Rien à montrer avec ce filtre.'))}</p>`}</div>
            <p class="muted"><small>${esc(T('Les données livrées avec l’app sont refaites sur GitHub (dépôt du projet) ; une mise à jour est vérifiée (sha256) et l’ancienne version gardée. Les packs se téléchargent un à la fois, pour ménager les serveurs.'))}</small></p>`;
        bindPanel(host);
        paintQueue();
    }
    function rowHtml(r) {
        const [ico, lab] = STATE_TXT[r.state] || STATE_TXT.missing;
        const k = kiosk(), q = Q.items.find(x => x.fam === r.fam && x.k === r.k && x.state !== 'done');
        const act = k ? '' : q ? `<span class="dmaj-inq muted" data-dmaj-inq>${esc(q.state === 'run' ? T('en cours…') : T('dans la file'))}</span>`
            : r.state === 'update' ? `<button type="button" class="button small" data-dmaj-do="update">${esc(T('Mettre à jour'))}${r.dl ? ` <small>(${esc(fmtSize(r.dl))})</small>` : ''}</button>`
            : r.state === 'missing' ? `<button type="button" class="button small secondary" data-dmaj-do="get" ${r.online || !C.checkedAt ? '' : 'disabled'}>⤓ ${esc(T('Télécharger'))}</button>` : '';
        const del = !k && r.removable && !q ? `<button type="button" class="dmaj-icon" data-dmaj-do="remove" title="${esc(T('Supprimer pour libérer de la place (↶ possible)'))}" aria-label="${esc(T('Supprimer {name}', {name: T(r.name)}))}">🗑</button>` : '';
        const back = !k && r.fam === 'data' && r.canUndo && r.updated ? `<button type="button" class="dmaj-icon" data-dmaj-do="revert" title="${esc(T('Remettre la version d’avant'))}" aria-label="${esc(T('Remettre la version d’avant'))}">↶</button>` : '';
        const go = r.tab ? `<button type="button" class="dmaj-link" data-dmaj-go="${esc(r.tab)}" title="${esc(T('Ouvrir sa page dans les Réglages'))}">${esc(T(r.name))}</button>` : `<b>${esc(T(r.name))}</b>`;
        return `<div class="dmaj-row is-${r.state}" data-dmaj-row="${esc(r.key)}" data-dmaj-state="${r.state}">
            <span class="dmaj-ico" aria-hidden="true">${esc(r.icon)}</span>
            <div class="dmaj-main"><div class="dmaj-name">${go}${r.what ? ` <small class="muted">${esc(T(r.what))}</small>` : ''}</div>
              <div class="dmaj-meta"><small class="muted">${r.size ? `${r.approx ? '≈ ' : ''}${esc(fmtSize(r.size))}` : ''}${r.date ? ` · ${esc(fmtDate(r.date))}` : ''}${r.source ? ` · ${esc(r.source)}` : ''}${r.licence ? ` · ${esc(r.licence)}` : ''}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(T('La source'))}">↗</a>` : ''}</small></div>
              <div class="dmaj-prog" data-dmaj-prog hidden><i></i></div></div>
            <span class="dmaj-state" title="${esc(T(lab))}"><span aria-hidden="true">${ico}</span> ${esc(T(lab))}</span>
            <span class="dmaj-act">${act}${back}${del}</span></div>`;
    }
    function bindPanel(host) {
        if (host.__dmajBound) return; host.__dmajBound = true;
        host.addEventListener('click', async e => {
            const t = e.target.closest?.('button'); if (!t || t.disabled) return;
            if (t.dataset.dmajFilter) { C.filter = t.dataset.dmajFilter; writeLS('genealogie-donnees-filtre', C.filter); return drawPanel(); }
            if (t.dataset.dmajGo) return goTab(t.dataset.dmajGo);
            if (t.hasAttribute('data-dmaj-checkall')) { t.disabled = true; t.textContent = T('Vérification…'); await loadOnline(); await loadLocal(); return drawPanel(); }
            if (t.hasAttribute('data-dmaj-getall') || t.hasAttribute('data-dmaj-updall')) {
                if (!C.checkedAt) { t.disabled = true; await loadOnline(); await loadLocal(); drawPanel(); }
                const all = rows(), list = t.hasAttribute('data-dmaj-getall') ? all.filter(r => r.state === 'missing' && r.online) : all.filter(r => r.state === 'update');
                return confirmAndQueue(list, t.hasAttribute('data-dmaj-getall'));
            }
            if (t.hasAttribute('data-dmaj-pause')) return pauseQueue();
            if (t.hasAttribute('data-dmaj-resume')) return runQueue();
            if (t.hasAttribute('data-dmaj-cancel')) return cancelQueue();
            if (t.hasAttribute('data-dmaj-retry')) { Q.items.forEach(x => { if (x.state === 'error') x.state = 'wait'; }); qSave(); return runQueue(); }
            const rowEl = t.closest('[data-dmaj-row]'), what = t.dataset.dmajDo; if (!rowEl || !what) return;
            const r = rows().find(x => x.key === rowEl.dataset.dmajRow); if (!r) return;
            if (what === 'get' || what === 'update') {
                if (!C.checkedAt || (what === 'get' && !r.online)) { t.disabled = true; await loadOnline(); await loadLocal(); drawPanel(); const r2 = rows().find(x => x.key === r.key); if (!r2 || (r2.state !== 'missing' && r2.state !== 'update') || (r2.state === 'missing' && !r2.online)) return; return confirmAndQueue([r2], what === 'get'); }
                return confirmAndQueue([r], what === 'get');
            }
            if (what === 'remove') return removeRow(r);
            if (what === 'revert') { try { await post('donnees_maj_undo', {pack: r.k}); statusP = null; const msg = T('↶ {name} : version d’avant remise', {name: r.name}); const sw = async () => { await post('donnees_maj_undo', {pack: r.k}); statusP = null; repaintAll(); }; A().undoToast ? A().undoToast(msg, {undo: sw, redo: sw}) : toast(msg); repaintAll(); } catch (x) { toast(x.message, 'error'); } }
        });
        host.addEventListener('input', e => { if (e.target.matches?.('[data-dmaj-q]')) { C.q = e.target.value; clearTimeout(host.__qT); host.__qT = setTimeout(() => { const pos = e.target.selectionStart; drawPanel(); const i = panel()?.querySelector('[data-dmaj-q]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (_) {} } }, 200); } });
        host.addEventListener('change', e => {
            if (!e.target.matches?.('[data-dmaj-auto]')) return;
            const on = !!e.target.checked, before = readLS(AUTO, '0');
            writeLS(AUTO, on ? '1' : '0');
            const set = v => { writeLS(AUTO, v); const i = panel()?.querySelector('[data-dmaj-auto]'); if (i) i.checked = v === '1'; };
            const msg = on ? T('Les données seront vérifiées une fois par mois.') : T('Vérification mensuelle éteinte.');
            A().undoToast ? A().undoToast(msg, {undo: () => set(before), redo: () => set(on ? '1' : '0')}) : toast(msg);
        });
    }
    /** la confirmation : total, temps, licences ; puis la file */
    async function confirmAndQueue(list, isNew) {
        if (!list.length || kiosk()) return;
        const total = list.reduce((n, r) => n + (r.dl || r.size || 0), 0), mins = Math.max(1, Math.round(total / (4e6 * 60)));
        const lic = [...new Set(list.map(r => `${r.source} — ${r.licence}`).filter(Boolean))].slice(0, 8);
        const body = `${list.length === 1 ? T('« {name} » : {s} à télécharger (environ {m} min avec une bonne connexion).', {name: T(list[0].name), s: fmtSize(total), m: mins}) : T('{n} packs, {s} à télécharger (environ {m} min avec une bonne connexion), un à la fois.', {n: list.length, s: fmtSize(total), m: mins})}\n\n${T('Sources et licences :')}\n${lic.map(x => '· ' + x).join('\n')}\n\n${T('Tu peux mettre en pause, annuler, ou fermer l’app : la file reprendra où elle en était.')}`;
        const ok = A().confirmBox ? await A().confirmBox(body, {title: isNew ? T('Télécharger ?') : T('Mettre à jour ?'), okLabel: isNew ? T('Télécharger') : T('Mettre à jour'), danger: false}) : true;
        if (!ok) return;
        enqueue(list); runQueue();
    }
    async function removeRow(r) {
        const f = famOf(r.fam); if (!f) return;
        const ok = A().confirmBox ? await A().confirmBox(T('Le fichier est mis de côté : « ↶ Annuler » le remet tout de suite.'), {title: T('Supprimer « {name} » ?', {name: T(r.name)}), okLabel: T('Supprimer')}) : true;
        if (!ok) return;
        try { await post(`${f.pre}_pack_remove`, f.body(r.k)); } catch (x) { return toast(x.message, 'error'); }
        await refreshPanel();
        const msg = T('🗑 {name} supprimé ({s} libérés)', {name: T(r.name), s: fmtSize(r.size)});
        const undo = async () => { await post(`${f.pre}_pack_restore`, f.body(r.k)); await refreshPanel(); }, redo = async () => { await post(`${f.pre}_pack_remove`, f.body(r.k)); await refreshPanel(); };
        A().undoToast ? A().undoToast(msg, {undo, redo, icon: '🗑'}) : toast(msg);
    }
    function paintProgress(it) {
        const el = panel()?.querySelector(`[data-dmaj-row="${CSS.escape(`${it.fam}:${it.k}`)}"] [data-dmaj-prog]`); if (el) { el.hidden = false; el.firstElementChild.style.width = `${Math.round(100 * (it.received || 0) / Math.max(1, it.size || 1))}%`; }
        const q = panel()?.querySelector(`[data-dmaj-qi="${CSS.escape(`${it.fam}:${it.k}`)}"] [data-dmaj-qp]`); if (q) q.textContent = `${Math.round(100 * (it.received || 0) / Math.max(1, it.size || 1))} %`;
    }
    function paintQueue() {
        const box = panel()?.querySelector('[data-dmaj-queue]'); if (!box) return;
        const list = Q.items.filter(x => x.state !== 'done'); if (!list.length) { box.innerHTML = ''; return; }
        const pct = x => `${Math.round(100 * (x.received || 0) / Math.max(1, x.size || 1))} %`;
        const st = x => ({wait: T('en attente'), run: T('en cours'), paused: T('en pause'), error: T('erreur'), cancelled: T('annulé')}[x.state] || x.state);
        const paused = !Q.running && list.some(x => x.state === 'paused' || x.state === 'wait');
        box.innerHTML = `<div class="dmaj-queue" data-dmaj-queue-box><div class="dmaj-qhead"><b>${esc(T('File de téléchargement'))}</b> <small class="muted">${esc(T('{n} packs', {n: list.length}))}</small>
            <span class="dmaj-qacts">${Q.running ? `<button type="button" class="button small secondary" data-dmaj-pause>⏸ ${esc(T('Pause'))}</button>` : paused ? `<button type="button" class="button small" data-dmaj-resume>▶ ${esc(T('Reprendre'))}</button>` : ''}${list.some(x => x.state === 'error') && !Q.running ? `<button type="button" class="button small secondary" data-dmaj-retry>↻ ${esc(T('Réessayer'))}</button>` : ''}<button type="button" class="button small secondary" data-dmaj-cancel>✕ ${esc(T('Annuler'))}</button></span></div>
            <ol>${list.map(x => `<li data-dmaj-qi="${esc(`${x.fam}:${x.k}`)}" data-dmaj-qstate="${x.state}">${esc(T(x.name))} <small class="muted">· ${esc(st(x))}${x.size ? ` · <span data-dmaj-qp>${esc(pct(x))}</span> ${esc(T('de {s}', {s: fmtSize(x.size)}))}` : ''}${x.err ? ` · ${esc(x.err)}` : ''}</small></li>`).join('')}</ol></div>`;
    }

    /* ═════════════ 3. une fois par mois, si on l'a demandé ═════════════ */
    function monthly() {
        if (readLS(AUTO, '0') !== '1' || kiosk()) return;
        const last = Number(readLS(LAST, '0')) || 0;
        if (Date.now() - last < 30 * 86400e3) return;
        setTimeout(async () => {
            try { await loadLocal(); await loadOnline(); } catch (_) { return; }
            const n = rows().filter(r => r.state === 'update').length;
            if (n) toast(T('🗂 {n} mises à jour de données disponibles.', {n}), '', {duration: 15000, action: {label: T('Voir'), run: () => { C.filter = 'update'; goTab(TAB[0]); }}});
        }, 8000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monthly); else monthly();

    ext.listesMaj = {header, packsOfList, check: ids => api('donnees_maj_check', {packs: ids.join(','), fresh: 1}), apply: applyPacks, status, rows: () => rows(), queue: Q, runQueue, families: FAM};
})();
