/* LCNDA — ⚰️ Veille des décès (serveur : lib/veille_deces.php ; style : assets/css/veille-synchro.css).
 * Les fiches « vivantes » ou au statut inconnu, nées il y a moins de 110 ans, comparées au fichier des personnes décédées de l'INSEE
 * INSTALLÉ sur l'ordinateur (Recherche → Décès INSEE). Rien n'est envoyé sur Internet.
 *  - à l'ouverture de l'app puis toutes les 30 minutes : si un nouveau fichier INSEE est arrivé, la comparaison se fait (vd_auto) ;
 *    s'il y a de nouveaux décès possibles, un message « ⚰️ … » avec « Voir » ;
 *  - Réglages → « ⚰️ Veille des décès » : interrupteur (clé genealogie-veille-deces ; allumé par défaut seulement si la base INSEE
 *    est installée), « Vérifier maintenant », chaque décès possible : « ✓ C'est elle : ajouter le décès (source INSEE) » /
 *    « ✗ Ce n'est pas elle » (retenu), ↶ Annuler ; les pistes écartées (▸ plus) ;
 *  - widget du tableau de bord « ⚰️ Veille des décès » ;
 *  - « Où chercher » : liens de recherche vers les avis de décès des journaux (libramemoria, dansnoscoeurs, avis-de-deces…) :
 *    ce ne sont PAS des données ouvertes, rien n'est récupéré, seulement un lien que la personne ouvre elle-même.
 * Pour d'autres fichiers : LCNDA_EXT.veilleDeces. Essai : tests/test-veille-deces.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const escRaw = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════ calculs sans écran (aussi pour Node) ═════ */
    /** la phrase d'un décès possible : « Décès possible : Jeanne LACOMBE, née le 12 mars 1935 à Tulle (19), décédée le … à … » */
    function sentence(it) {
        const f = it.person?.gender === 'female' || it.insee?.sexe === '2' || it.insee?.sexe === 'F';
        const name = it.person?.name || `${it.insee?.prenoms || ''} ${it.insee?.nom || ''}`.trim();
        const born = it.insee?.naissance ? T(f ? 'née le {d}' : 'né le {d}', {d: it.insee.naissance}) + (it.insee.lieu_naissance ? ' ' + T('à {p}', {p: it.insee.lieu_naissance}) : '') : '';
        const died = it.insee?.deces ? T(f ? 'décédée le {d}' : 'décédé le {d}', {d: it.insee.deces}) + (it.insee.lieu_deces ? ' ' + T('à {p}', {p: it.insee.lieu_deces}) : '') : '';
        return T('Décès possible : {who}', {who: [name, born, died].filter(Boolean).join(', ')});
    }
    const yesLabel = it => (it.person?.gender === 'female' ? T('✓ C’est elle : ajouter le décès (source INSEE)') : it.person?.gender === 'male' ? T('✓ C’est lui : ajouter le décès (source INSEE)') : T('✓ C’est cette personne : ajouter le décès (source INSEE)'));
    const noLabel = it => (it.person?.gender === 'female' ? T('✗ Ce n’est pas elle') : it.person?.gender === 'male' ? T('✗ Ce n’est pas lui') : T('✗ Ce n’est pas cette personne'));
    /** les avis de décès des journaux : seulement des liens de recherche (pas de données ouvertes) */
    const OBIT = [
        ['libramemoria', 'Libra Memoria (avis de décès des journaux régionaux)', 'libramemoria.com'],
        ['dansnoscoeurs', 'Dans nos cœurs (avis de décès)', 'dansnoscoeurs.fr'],
        ['avisdedeces', 'Avis-de-deces.net', 'avis-de-deces.net'],
        ['inmemori', 'InMemori (pages de souvenir)', 'inmemori.com'],
    ];
    function obitUrl(domain, p) {
        const name = [p.first, p.last].filter(Boolean).join(' ').trim() || String(p.name || '').trim();
        const commune = String(p.place || '').split(/[,(]/)[0].trim();
        return `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} "${name}"${commune ? ` ${commune}` : ''}`)}`;
    }
    const core = {sentence, yesLabel, noLabel, obitUrl, OBIT};
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ═════ l'écran ═════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : escRaw(v));
    const get = (a, q) => A().api(a, q || {});
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b || {}}).then(r => r.result || r);
    const KEY = 'genealogie-veille-deces', TOLD = 'lcnda-vd-told';
    const TAB = ['veille_deces', '08b', '⚰️ Veille des décès'];
    const ls = {get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }};
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const plural = (n, a, b) => (A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`);
    let STATUS = null;
    const enabled = (st = STATUS) => { const v = ls.get(KEY); return v === null ? !!st?.insee?.installed : v === '1'; };
    const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

    async function refresh({auto = true} = {}) {
        try { STATUS = await get('vd_status'); } catch (_) { return null; }
        if (auto && enabled() && !kiosk() && STATUS.insee?.installed && (STATUS.new_file || !STATUS.last_run)) {
            try { STATUS = await post('vd_auto'); } catch (_) {}
        }
        tell();
        return STATUS;
    }
    /** un message quand il y a plus de décès possibles qu'au dernier message */
    function tell() {
        if (!STATUS || !enabled()) return;
        const n = Number(STATUS.pending || 0), told = Number(ls.get(TOLD, '0'));
        if (n > told) {
            A().toast?.(T('⚰️ Veille des décès : {n} dans ton arbre (fichier INSEE, comparé sur l’ordinateur).', {n: plural(n, 'décès possible', 'décès possibles')}), '', {duration: 12000, action: {label: T('Voir'), run: open}});
        }
        ls.set(TOLD, String(n));
    }
    function open() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /** « 2026-11-26 10:00:00 » → « 26/11/2026 » */
    const dayFr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const ficheBtn = id => `<button type="button" class="button small secondary vd-fiche" data-vd-fiche="${Number(id)}">${esc(T('👤 Ouvrir la fiche'))}</button>`;
    function cardHtml(it, mode = 'new', inFrame = false, onPage = false) {
        const d = it.detail || {};
        const why = [d.name === 1 ? T('même nom') : d.near ? T('nom proche') : d.name ? T('nom composé') : '', d.first === 1 ? T('même prénom') : d.first ? T('prénom proche') : '',
            d.birth === 'day' ? T('même date de naissance') : d.birth === 'month' ? T('même mois de naissance') : d.birth === 'year' ? T('même année de naissance') : d.birth === 'near' ? T('naissance à un an près') : '',
            d.place === 1 ? T('même lieu de naissance') : d.place === 0.5 ? T('même département de naissance') : ''].filter(Boolean);
        const mine = [it.person.birth ? T('naissance : {d}', {d: it.person.birth}) : '', it.person.birth_place].filter(Boolean).join(', ');
        const dbt = it.doubt;
        const acts = mode === 'new' ? `<button type="button" class="button small" data-vd-yes="${it.id}">${esc(yesLabel(it))}</button>${kiosk() ? '' : dbt ? `<button type="button" class="button small secondary" data-vd-doubt="${it.id}" data-vd-doubt-off aria-pressed="true">${esc(T('↩ Plus de doute'))}</button>` : `<button type="button" class="button small secondary" data-vd-doubt="${it.id}" title="${esc(T('Je l’ai vue, je reviendrai dessus : elle reste dans la liste'))}">${esc(T('🤔 J’ai un doute'))}</button>`}<button type="button" class="button small secondary" data-vd-no="${it.id}">${esc(noLabel(it))}</button>`
            : `<button type="button" class="button small secondary" data-vd-undo="${it.id}">${esc(T('↶ Remettre dans les décès possibles'))}</button>`;
        return `<article class="vd-card" data-vd-card="${it.id}">
            <p class="vd-sentence"><b>${esc(sentence(it))}</b> <span class="vd-src">(${link(it.insee.url, T('INSEE, Licence Ouverte'))}) ${link(it.source.url, T('↗ source'))}</span></p>
            ${dbt && mode === 'new' ? `<p class="vd-doubt"><span class="ui-badge is-yellow vd-doubt-badge">${esc(T('🤔 Vu le {d} — à revoir', {d: dayFr(dbt.at)}))}</span>${dbt.note ? ` <span class="vd-doubt-text">${esc(dbt.note)}</span>` : ''}${kiosk() ? '' : ` <button type="button" class="link-button" data-vd-note-edit="${it.id}">${esc(dbt.note ? T('✎ Changer la note') : T('✎ Ajouter une note'))}</button>`}</p>` : ''}
            ${inFrame ? '' : `<p class="muted vd-mine">${esc(T('Ta fiche :'))} <button type="button" class="table-link" data-open-person="${it.person.id}">${esc(it.person.name)}</button>${mine ? ` — ${esc(mine)}` : ''}${onPage ? ` ${ficheBtn(it.person.id)}` : ''}</p>`}
            <p class="vd-why"><span class="ui-badge">${esc(T('{n} % de ressemblance', {n: it.score}))}</span> ${esc(why.join(' · '))}${it.insee.acte ? ` · ${esc(T('acte n° {n}', {n: it.insee.acte}))}` : ''}</p>
            <div class="page-actions vd-acts">${acts}</div></article>`;
    }

    async function decide(id, action) {
        try {
            const res = await post(action === 'yes' ? 'vd_confirm' : action === 'no' ? 'vd_not_same' : 'vd_undo', {id});
            const msg = action === 'yes' ? T('⚰️ Décès ajouté à la fiche — source :') : action === 'no' ? T('Noté : ce n’est pas la même personne. Cette piste ne reviendra pas.') : T('Piste remise dans les décès possibles.');
            if (action === 'undo') A().toast?.(msg, 'success');
            else {
                const el = A().undoToast?.(msg, {undo: async () => { await post('vd_undo', {id}); await draw(); }});
                // ✓ : « source : INSEE ↗ », le lien de la fiche INSEE (sinon le fichier sur data.gouv.fr)
                const url = [res?.url, res?.source_url].find(u => /^https?:\/\/\S+$/i.test(String(u || '')));
                if (action === 'yes' && url && el?.querySelector) {
                    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'vd-toast-src'; a.textContent = T('INSEE ↗'); a.dataset.vdToastSrc = '';
                    (el.querySelector('.ui-toast-text') || el).append(' ', a);
                }
            }
            root.dispatchEvent?.(new CustomEvent('lcnda:data-changed'));
            LIST = null; document.querySelectorAll(`[data-vd-card="${id}"]`).forEach(c => { if (c.closest('[data-vd-person]')) c.remove(); });
            await draw();
            STATUS = await get('vd_status').catch(() => STATUS); ls.set(TOLD, String(STATUS?.pending || 0));
        } catch (e) { A().toast?.(e.message, 'error'); }
    }

    /** 🗂 un cadre par personne de l'arbre (réglage genealogie-cadres) : ses fiches INSEE possibles dedans ; on décide toujours fiche par fiche */
    const cards = (items, mode = 'new') => (!UI().framesOn?.() ? items.map(it => cardHtml(it, mode, false, true)).join('')
        : UI().personCardsHtml(UI().groupByPerson(items, it => it.person?.id).map(g => { const p = g.items[0].person || {};
            return UI().personCardHtml({id: p.id, name: p.name || '', actions: ficheBtn(p.id), life: [p.birth ? T('naissance : {d}', {d: p.birth}) : '', p.birth_place].filter(Boolean).join(', '), cls: 'vd-frame',
                count: mode === 'new' ? plural(g.items.length, 'décès possible', 'décès possibles') : plural(g.items.length, 'piste écartée', 'pistes écartées'), body: g.items.map(it => cardHtml(it, mode, true)).join('')}); }).join('')));
    const FILTER = 'lcnda-vd-filter';
    const vdFilter = () => { const v = ls.get(FILTER, 'all'); return ['all', 'todo', 'doubt'].includes(v) ? v : 'all'; };
    /** 🤔 poser / enlever le doute ; ↶ remet l'état d'avant */
    async function doubt(id, body, msg) {
        let r; try { r = await post('vd_doubt', {id, ...body}); } catch (e) { A().toast?.(e.message, 'error'); return null; }
        LIST = null; await keepPlace(draw); refillPersons();
        if (msg) A().undoToast?.(msg, {undo: async () => { await post('vd_doubt', {id, prev: r.prev}); LIST = null; await keepPlace(draw); refillPersons(); }});
        return r;
    }
    const refillPersons = () => document.querySelectorAll('#workspace [data-vd-person]').forEach(h => fillPerson(h, Number(h.dataset.vdPerson)));
    /** redessiner sans bouger : la même position dans la page (aller sur une fiche puis revenir : l'app remet la position de l'écran) */
    const keepPlace = async fn => { const ws = document.getElementById('workspace'), y = ws?.scrollTop || 0, y2 = document.scrollingElement?.scrollTop || 0; await fn(); if (ws) ws.scrollTop = y; if (document.scrollingElement) document.scrollingElement.scrollTop = y2; };
    function noteField(id) {
        const card = document.querySelector(`#workspace [data-vd-card="${id}"]`); if (!card || card.querySelector('[data-vd-note]')) return;
        const cur = card.querySelector('.vd-doubt-text')?.textContent || '';
        const f = document.createElement('form'); f.className = 'vd-note'; f.dataset.vdNoteForm = String(id);
        f.innerHTML = `<input type="text" maxlength="500" data-vd-note="${id}" value="${esc(cur)}" placeholder="${esc(T('Une note pour plus tard (facultatif)'))}" aria-label="${esc(T('Note du doute'))}"><button type="submit" class="button small">${esc(T('Enregistrer'))}</button><button type="button" class="button small secondary" data-vd-note-cancel>${esc(T('Pas de note'))}</button>`;
        (card.querySelector('.vd-doubt') || card.querySelector('.vd-acts')).after(f);
        f.querySelector('input').focus();
    }
    /* 👤 aller sur une fiche puis revenir : la même position dans l'écran (retenue quand on fait défiler soi-même ; remise après le dessin,
     *  tant qu'on ne touche à rien pendant ~1 s) */
    let PLACE = 0, painting = false;
    document.addEventListener('scroll', e => { if (painting) return; const ws = document.getElementById('workspace'); if (ws?.querySelector('[data-vd-page]') && (e.target === ws || e.target === document)) PLACE = Math.max(ws.scrollTop, document.scrollingElement?.scrollTop || 0); }, true);
    function putPlace(ws) {
        const want = PLACE; let touched = false; const stop = () => { touched = true; };
        ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, stop, {once: true, passive: true, capture: true}));
        const put = () => { if (touched || !ws.querySelector('[data-vd-page]')) return; if (Math.abs(ws.scrollTop - want) > 2) ws.scrollTop = want; if (document.scrollingElement && ws.scrollTop < want - 2) document.scrollingElement.scrollTop = want; };
        put(); requestAnimationFrame(() => { put(); painting = false; });
        [120, 350, 700, 1200].forEach(ms => setTimeout(put, ms));
        setTimeout(() => ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.removeEventListener(ev, stop, {capture: true})), 1300);
    }
    async function draw(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-vd-page]')) return;
        let list = {items: []}, gone = {items: []};
        try { [list, gone] = await Promise.all([get('vd_list'), get('vd_dismissed')]); STATUS = list; } catch (e) { ws.innerHTML = `<section class="page"><p class="h-offsite-sentence is-warn">${esc(e.message)}</p></section>`; return; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const st = list, ins = st.insee || {};
        const on = enabled(st);
        const nDoubt = list.items.filter(it => it.doubt).length, f = nDoubt || vdFilter() !== 'doubt' ? vdFilter() : 'all';
        const shown = list.items.filter(it => f === 'all' || (f === 'doubt' ? it.doubt : !it.doubt));
        const chips = list.items.length ? `<div class="ui-filters vd-filters" role="group" aria-label="${esc(T('Décès possibles'))}">${[['all', T('Tous'), list.items.length], ['todo', T('À trancher'), list.items.length - nDoubt], ['doubt', T('🤔 À revoir'), nDoubt]]
            .map(([k, l, n]) => `<button type="button" class="${f === k ? 'is-active' : ''}" aria-pressed="${f === k}" data-vd-filter="${k}">${esc(l)} <small>(${n})</small></button>`).join('')}</div>` : '';
        const head = UI().pageHeader ? UI().pageHeader({title: T('Veille des décès'), icon: '⚰️', where: T('Réglages · Données'), help: esc(T('Les personnes de ton arbre qu’on croit vivantes, comparées au fichier des décès de l’INSEE installé sur ton ordinateur.'))}) : `<h2>${esc(TAB[2])}</h2>`;
        const insLine = ins.installed ? T('Fichier des décès de l’INSEE installé : décès de {a} à {b}.', {a: String(ins.from || '?'), b: String(ins.to || '?')}) : T('Le fichier des décès de l’INSEE n’est pas installé : installe-le dans Recherche → Décès INSEE (bouton « ⤓ Tout installer »). Sans lui, la veille ne peut rien comparer.');
        const lastLine = st.last_run ? T('Dernière comparaison : {d}. Fiches surveillées : {n}.', {d: esc(String(st.last_run).slice(0, 16)), n: String(st.watched)}) : T('Fiches surveillées : {n}.', {n: String(st.watched)});
        painting = true;
        ws.innerHTML = `<section class="page vd-page" data-vd-page>${head}
            <div class="maintenance-panel"><label class="checkbox-line cplus-tg"><input type="checkbox" data-vd-toggle ${on ? 'checked' : ''}><span><b>${esc(T('Surveiller les décès des personnes vivantes de mon arbre'))}</b><br><small class="muted">${esc(T('Quand un nouveau fichier des décès arrive (vérifié chaque jour dans Décès INSEE), l’app compare les fiches « vivantes » ou au statut inconnu, nées il y a moins de 110 ans : nom de naissance, prénoms, date et lieu de naissance. Rien n’est envoyé sur Internet : tout est comparé sur l’ordinateur.'))}</small></span></label>
                <p>${esc(insLine)}</p><p class="muted">${lastLine}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-vd-run ${ins.installed && !kiosk() ? '' : 'disabled'}>${esc(T('🔎 Vérifier maintenant (tout le fichier)'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('Décès possibles'))} ${list.items.length ? `<span class="ui-badge">${list.items.length}</span>` : ''}</h3>
                ${chips}${list.items.length ? (shown.length ? cards(shown) : `<p class="muted">${esc(f === 'doubt' ? T('Aucune piste à revoir.') : T('Tout est à revoir : rien d’autre à trancher.'))}</p>`) : `<p class="muted">${esc(ins.installed ? T('Aucun décès possible pour l’instant.') : T('Rien à montrer tant que le fichier INSEE n’est pas installé.'))}</p>`}
                ${gone.items.length ? `<details class="cplus-more"><summary>${esc(T('▸ Pistes écartées ({n})', {n: gone.items.length}))}</summary>${cards(gone.items, 'gone')}</details>` : ''}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3>
                <p>${esc(T('Source :'))} ${link(st.source?.url || 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/', T('Fichier des personnes décédées (INSEE), data.gouv.fr'))} — ${link(st.source?.licence_url || 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', st.source?.licence || 'Licence Ouverte 2.0 (Etalab)')}. ${esc(T('Chaque décès ajouté porte cette source et le numéro de l’acte ; « ↗ » ouvre la recherche de la personne dans matchID, le moteur libre du même fichier.'))}</p>
                <p class="muted">${esc(T('Les avis de décès des journaux et des sites (Libra Memoria, Dans nos cœurs, Avis-de-deces…) ne sont pas des données ouvertes : l’app ne les lit pas. Elle propose seulement des liens de recherche dans « Où chercher » d’une personne.'))}</p></div></section>`;
        putPlace(ws);
        if (!A().escapeHtml) return;
        A().bindTableLinks?.();
    }
    document.addEventListener('click', e => {
        // 👤 ouvrir une fiche : le filtre est retenu (localStorage), la position de l'écran aussi (l'app la remet au retour)
        const fb = e.target.closest?.('[data-vd-fiche]'); if (fb) { const st = A().state; st.currentPersonId = Number(fb.dataset.vdFiche); A().setModule?.('personnes'); return; }
        const fl = e.target.closest?.('[data-vd-filter]'); if (fl) { ls.set(FILTER, fl.dataset.vdFilter); keepPlace(draw); return; }
        if (e.target.closest?.('[data-vd-note-cancel]')) { e.target.closest('form')?.remove(); return; }
        const ne = e.target.closest?.('[data-vd-note-edit]'); if (ne) { if (!kiosk()) noteField(Number(ne.dataset.vdNoteEdit)); return; }
        const db = e.target.closest?.('[data-vd-doubt]');
        if (db) {
            if (kiosk()) return;
            const id = Number(db.dataset.vdDoubt); db.disabled = true;
            if (db.hasAttribute('data-vd-doubt-off')) { doubt(id, {off: 1}, T('Plus de doute sur cette piste.')); return; }
            doubt(id, {}, T('🤔 Notée « à revoir » : elle reste dans la liste.')).then(r => { if (r) noteField(id); });
            return;
        }
        const t = e.target.closest?.('[data-vd-yes],[data-vd-no],[data-vd-undo],[data-vd-run],[data-vd-open]'); if (!t) return;
        if (t.matches('[data-vd-open]')) { e.preventDefault(); return open(); }
        if (kiosk()) return;
        if (t.matches('[data-vd-run]')) {
            t.disabled = true; t.textContent = T('Comparaison en cours…');
            post('vd_run', {full: 1}).then(r => { A().toast?.(r.found ? T('{n} trouvé(s).', {n: plural(r.found, 'nouveau décès possible', 'nouveaux décès possibles')}) : T('Rien de nouveau : aucun décès possible de plus.'), 'success'); ls.set(TOLD, String(r.pending || 0)); return draw(); })
                .catch(err => { A().toast?.(err.message, 'error'); t.disabled = false; });
            return;
        }
        t.disabled = true;
        const id = Number(t.dataset.vdYes || t.dataset.vdNo || t.dataset.vdUndo);
        decide(id, t.matches('[data-vd-yes]') ? 'yes' : t.matches('[data-vd-no]') ? 'no' : 'undo');
    });
    document.addEventListener('submit', e => {
        const f = e.target.closest?.('[data-vd-note-form]'); if (!f) return;
        e.preventDefault(); if (kiosk()) return;
        doubt(Number(f.dataset.vdNoteForm), {note: f.querySelector('input').value}, '');
    });
    document.addEventListener('change', e => {
        if (!e.target.matches?.('[data-vd-toggle]')) return;
        const on = e.target.checked; ls.set(KEY, on ? '1' : '0');
        A().undoToast?.(on ? T('Veille des décès allumée.') : T('Veille des décès éteinte.'), {undo: () => { ls.set(KEY, on ? '0' : '1'); draw(); }});
        if (on) refresh();
    });

    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => draw(token);

    /* widget du tableau de bord */
    ext.dashboard = ext.dashboard || {};
    ext.dashboard.veille_deces = {
        load: () => get('vd_list').catch(() => null),
        render: (index, widget, span, d) => {
            const n = d?.items?.length || 0;
            const body = !d ? `<p class="muted">${esc(T('La veille n’a pas pu être lue.'))}</p>` : !d.insee?.installed ? `<p class="muted">${esc(T('Installe le fichier des décès de l’INSEE (Recherche → Décès INSEE) pour surveiller les décès des personnes vivantes de ton arbre.'))}</p>`
                : n ? `<ul class="vd-w-list">${d.items.slice(0, 3).map(it => `<li>${esc(sentence(it))}</li>`).join('')}</ul>` : `<p class="muted">${esc(T('Aucun décès possible pour l’instant.'))}</p>`;
            const html = `<div class="vd-widget">${body}<p class="cplus-src">${esc(T('Source :'))} ${link('https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/', 'INSEE')} — Licence Ouverte</p></div>`;
            return A().card ? A().card(index, `⚰️ ${T('Veille des décès')}`, n || '', html, span, `<button type="button" class="button small secondary" data-vd-open>${esc(T('Voir'))}</button>`) : html;
        },
    };

    /* la fiche d'une personne : « ⚰️ Décès possible » — seulement s'il y en a un (sinon rien du tout) */
    let LIST = null;
    const listOnce = () => (LIST ||= get('vd_list').catch(() => ({items: []})));
    window.addEventListener('lcnda:data-changed', () => { LIST = null; });
    async function fillPerson(host, pid) {
        if (!enabled()) return false;
        const L = await listOnce(); const mine = (L.items || []).filter(it => it.person.id === pid);
        if (!mine.length) return false;
        host.innerHTML = mine.map(it => cardHtml(it)).join('');
        host.closest('section.card')?.removeAttribute('hidden');
        return true;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.veille_deces = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !enabled() || p.living_status === 'deceased') return '';
        return A().card(index, T('⚰️ Décès possible'), '', `<div class="vd-block" data-vd-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-vd-person]:not([data-vd-done])').forEach(h => { h.dataset.vdDone = '1'; fillPerson(h, Number(h.dataset.vdPerson)); }); });
    /* à la demande (« 🧰 Données ») : les décès possibles d'une personne */
    (ext.dataSources = ext.dataSources || []).push({id: 'veille_deces', icon: '⚰️', label: T('Décès possible (fichier INSEE)'), group: 'La personne', needs: ['person'],
        installed: () => get('vd_status').then(s => !!s.insee?.installed).catch(() => false),
        run: async (ctx, host) => { LIST = null; const id = Number(ctx.person?.id || ctx.person); if (!(await fillPerson(host, id))) host.innerHTML = `<p class="muted">${esc(T('Aucun décès possible pour cette personne dans le fichier INSEE installé.'))}</p>`; }});

    /* « Où chercher » : les avis de décès des journaux (liens seulement) — registre lu par heritage-ou-chercher.js */
    root.LCNDA_SO21 = root.LCNDA_SO21 || {
        SITES: OBIT.map(([key, label, domain]) => ({key, label, group: 'Avis de décès', icon: '🕯', country: 'France', domain, verified: false,
            rel: {countries: ['fr'], from: 2000, missing: ['death'], base: 0.7, why: () => T('Décès récent possible : les avis de décès des journaux (lien de recherche, rien n’est récupéré)')}})),
        url: (key, p) => { const s = OBIT.find(o => o[0] === key); return s ? obitUrl(s[2], p || {}) : ''; },
    };

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'import'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'veille_deces')) { B.splice(Math.min(2, B.length), 0, ['veille_deces', '⚰️ Décès possible']); if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.veille_deces ||= '12'; }
        if (Array.isArray(app.defaultDashboardBlocks) && !app.defaultDashboardBlocks.some(x => x[0] === 'veille_deces')) {
            app.defaultDashboardBlocks.push(['veille_deces', '⚰️ Veille des décès']);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.veille_deces = '6';
            if (app.dashboardWidgetInfo) app.dashboardWidgetInfo.veille_deces = T('Les décès possibles des personnes vivantes de ton arbre, trouvés dans le fichier des décès de l’INSEE installé sur l’ordinateur.');
        }
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    // au démarrage, puis toutes les 30 minutes (un nouveau fichier INSEE peut avoir été installé entre-temps)
    (function boot(n = 0) {
        if (!A().state?.csrf) { if (n < 120) setTimeout(() => boot(n + 1), 500); return; }
        setTimeout(() => refresh(), 4000);
        setInterval(() => refresh(), 30 * 60 * 1000);
    })();

    ext.veilleDeces = {...core, refresh, open, draw, enabled, status: () => STATUS};
})(typeof window !== 'undefined' ? window : globalThis);
