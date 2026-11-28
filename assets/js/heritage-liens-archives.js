/* LCNDA — 🔗 Archives à consulter (docs/donnees-manquantes.md, B-26, B-27 et partie C), les écrans. Rien à changer ailleurs :
 *  - 🌍 « Où chercher ? » (ext.ouChercher.afterRedraw) : une partie repliable « 🇬🇧🇺🇸 Archives britanniques et américaines ».
 *    The National Archives (Kew, Discovery) : recherche ICI, à la demande (un clic = une requête, rien n'est gardé) ; NARA : avec
 *    une clé facultative (« ⚙️ Personnaliser »), sinon seulement le lien de recherche sur leur site (↗). Chaque notice : « ↗ Voir
 *    la notice — <source> ». Rien pour une fiche vivante, peut-être vivante ou confidentielle ; rien du tout en mode consultation
 *    et pour un invité du wifi (le serveur refuse aussi : lib/archives_ukus.php). Les sites de la partie C arrivent tout seuls
 *    dans la liste des sites (lot 27, app-liens-archives-core.js) ; le STO n'est pas montré pour une personne vivante.
 *  - 🧰 Listes → Données : une carte « lien » par site, rangée dans son thème (⚔️ Guerres, 📚 Livres, 💶 Prix…) : ↗ et la source.
 *  - 📜 Monographie de commune : « 🔗 Archives à consulter en ligne pour ce lieu » (tirage au sort, HathiTrust, mercuriales,
 *    plaques d'Antibes), un lien par site avec sa source.
 *  - ⌘K (ext.quickSearchProviders) et « 🧭 Je veux… » (ext.intentsHand) : « Bulletin des lois », « Red Star Line », « archives
 *    anglaises »… mènent au bon endroit.
 * Réglage : « genealogie-ouc-ukus » (partie ouverte '1' / fermée '0' ; sinon ouverte pour une vie au Royaume-Uni, en Irlande, aux
 * États-Unis ou un émigré). Essai : tests/test-liens-archives.js
 */
(() => {
    'use strict';
    if (window.LCNDA_EXT?.liensArchives) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const L = () => window.LCNDA_SO27;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const kiosk = () => typeof document !== 'undefined' && !!document.body?.classList.contains('is-kiosk');
    const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const K_OPEN = 'genealogie-ouc-ukus';
    const ext_a = (href, text) => `${window.LCNDA_UI.extLink(href, text, {cls: 'link-button'})}`;
    const openUrl = u => { const s = L()?.cleanUrl?.(u) || ''; if (s) window.open(s, '_blank', 'noopener,noreferrer'); };
    const siteUrl = (s, p = {}) => L()?.url?.(s.key, p) || s.home;

    /* ═════════════════════ 🇬🇧🇺🇸 Archives britanniques et américaines (Où chercher ?) ═════════════════════ */
    const KINDS = [['', 'Tout le catalogue'], ['wills', 'Testaments (PROB 11, 1384-1858)'], ['soldiers', 'Soldats et armée (WO)'], ['naturalisation', 'Naturalisations (HO)']];
    const STATE = new Map(); // personne → {f, tna, nara, loading, err}
    let SRV = null; // {kiosk, nara_key}
    const srvState = async () => { if (SRV) return SRV; try { SRV = await A().api('ukus_state'); } catch (_) { SRV = {kiosk: false, nara_key: false}; } return SRV; };
    const tnaLink = name => `https://discovery.nationalarchives.gov.uk/results/r?_q=${encodeURIComponent(name)}`;
    const naraLink = name => `https://catalog.archives.gov/search?q=${encodeURIComponent(`"${name}"`)}`;
    /** la fiche peut-elle partir ? (la même règle que le serveur : ni vivante, ni peut-être vivante, ni confidentielle) */
    function blocked(view) {
        if (kiosk()) return T('Mode consultation : aucune recherche n’est envoyée à un site extérieur.');
        const p = view.data?.raw?.person || {}, ctx = view.res?.ctx || {};
        if (p.private) return T('Fiche confidentielle : rien n’est envoyé à un site extérieur.');
        const dead = p.living === 'deceased' || !!ctx.deathKnown, by = Number(p.birth_year) || Number(ctx.by) || 0;
        if (p.living === 'living' || (!dead && !(by && by <= new Date().getFullYear() - 100))) return T('Personne vivante (ou peut-être vivante) : rien n’est envoyé à un site extérieur.');
        return '';
    }
    function stateOf(view) {
        if (!STATE.has(view.pid)) {
            const ctx = view.res.ctx || {}, by = Number(ctx.by) || 0, dy = ctx.deathKnown ? Number(ctx.dy) || 0 : (by ? by + 90 : 0);
            STATE.set(view.pid, {f: {first: String(ctx.first || '').split(/[\s,]+/)[0] || '', last: ctx.last || '', y1: by || '', y2: dy || '', kind: ''}, tna: null, nara: null, loading: '', err: {}});
        }
        return STATE.get(view.pid);
    }
    const nameOf = f => [f.first, f.last].filter(Boolean).join(' ').trim();
    function rowsHtml(r, source) {
        if (!r) return '';
        if (!r.rows?.length) return `${window.LCNDA_APP.empty(T('Aucune notice avec ces critères.'))}`;
        return `<p class="ouc-oa-count"><b>${esc(T('{n} notices trouvées', {n: Number(r.found || r.rows.length).toLocaleString('fr-FR')}))}</b>${r.rows.length < r.found ? ` <span class="muted">${esc(T('— les {n} premières', {n: r.rows.length}))}</span>` : ''}${r.cached ? ` <span class="muted">· ${esc(T('réponse gardée du {date}', {date: r.fetched_at}))}</span>` : ''}</p>
            <ul class="ouc-list">${r.rows.map(x => `<li class="ouc-row"><span class="ouc-ico" aria-hidden="true">📜</span><div class="ouc-main"><div class="ouc-name"><b>${esc(x.title || x.reference || T('Notice'))}</b>${x.dates ? ` <span class="ouc-period">🗓 ${esc(x.dates)}</span>` : ''}</div>
                ${x.description && x.description !== x.title ? `<div class="ouc-why">${esc(x.description.slice(0, 240))}</div>` : ''}<div class="ouc-why2">${esc([x.reference, x.held_by].filter(Boolean).join(' · '))}</div></div>
                <div class="ouc-acts">${ext_a(x.url, T('↗ Voir la notice — {source}', {source}))}</div></li>`).join('')}</ul>`;
    }
    function sectionHtml(view) {
        const why = blocked(view);
        const ctx = view.res.ctx || {};
        const auto = ['gb', 'ie', 'us'].some(c => ctx.countries?.has?.(c)) || ctx.profiles?.has?.('emigrant');
        const open = lsGet(K_OPEN, '') === '' ? auto : lsGet(K_OPEN, '') === '1';
        const head = `<summary>🇬🇧🇺🇸 <b>${esc(T('Archives britanniques et américaines'))}</b> <small class="muted">${esc(T('testaments anglais, soldats, naturalisations, passagers : The National Archives (Kew) et NARA'))}</small></summary>`;
        if (why) return `<details class="ouc-oa ouc-ukus" data-ouc-ukus ${open ? 'open' : ''}>${head}<p class="ui-hint">🔒 ${esc(why)}</p></details>`;
        const st = stateOf(view), f = st.f, name = nameOf(f), key = !!SRV?.nara_key;
        const opt = (v, l) => `<option value="${esc(v)}" ${f.kind === v ? 'selected' : ''}>${esc(T(l))}</option>`;
        const err = k => (st.err[k] ? (UI().notice ? UI().notice('error', st.err[k]) : `<p>${esc(st.err[k])}</p>`) : '');
        return `<details class="ouc-oa ouc-ukus" data-ouc-ukus ${open ? 'open' : ''}>${head}
            <p class="ouc-intro">${esc(T('Une recherche seulement quand tu cliques ; seuls le prénom, le nom et les années partent. Rien n’est ajouté à la fiche.'))}</p>
            <form class="ouc-oa-form" data-ukus-form>
                <label><span>${esc(T('Prénom'))}</span><input name="first" value="${esc(f.first)}" autocomplete="off"></label>
                <label><span>${esc(T('Nom'))}</span><input name="last" value="${esc(f.last)}" autocomplete="off" required></label>
                <label class="ouc-oa-y"><span>${esc(T('Années des documents'))}</span><span class="ouc-oa-yy"><input name="y1" type="number" min="1000" max="2000" value="${esc(f.y1)}" aria-label="${esc(T('De'))}"> – <input name="y2" type="number" min="1000" max="2000" value="${esc(f.y2)}" aria-label="${esc(T('À'))}"></span></label>
                <label><span>${esc(T('À Kew'))}</span><select name="kind">${KINDS.map(([v, l]) => opt(v, l)).join('')}</select></label>
                <div class="ouc-oa-go"><button type="submit" class="button" data-ukus-go="tna" ${st.loading ? 'disabled' : ''}>${esc(st.loading === 'tna' ? T('Je cherche…') : T('🔍 Chercher à Kew (The National Archives)'))}</button>
                    ${key ? `<button type="submit" class="button secondary" data-ukus-go="nara" ${st.loading ? 'disabled' : ''}>${esc(st.loading === 'nara' ? T('Je cherche…') : T('🔍 Chercher au NARA (États-Unis)'))}</button>` : ext_a(naraLink(name), T('↗ Chercher « {name} » dans le catalogue — NARA', {name}))}</div></form>
            ${err('tna')}<div data-ukus-res="tna">${rowsHtml(st.tna, 'The National Archives')}</div>
            ${err('nara')}<div data-ukus-res="nara">${rowsHtml(st.nara, 'NARA')}</div>
            <p class="ui-hint ouc-oa-credit">${esc(st.tna?.attribution || T('Données : The National Archives (Kew), catalogue Discovery — Open Government Licence. Réponse non gardée.'))} ${ext_a(tnaLink(name), T('↗ La même recherche — The National Archives'))}<br>${esc(T('Données : National Archives Catalog (NARA, États-Unis). Ce produit utilise l’API du catalogue sans être approuvé par NARA.'))} ${ext_a(naraLink(name), T('↗ La même recherche — NARA'))}</p>
            <details class="ouc-ukus-set" data-ukus-set><summary>⚙️ ${esc(T('Personnaliser'))}</summary>
                <p class="ui-hint">${esc(T('NARA demande une clé personnelle (gratuite, par courriel à Catalog_API@nara.gov). Colle-la ici : elle reste sur cet ordinateur, n’est jamais montrée ni sauvegardée avec la base, et ne part que vers catalog.archives.gov.'))}</p>
                <form class="ouc-oa-form" data-ukus-key-form><label><span>${esc(T('Clé de l’API NARA'))}</span><input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(key ? T('Clé enregistrée') : '')}"></label>
                    <div class="ouc-oa-go"><button type="submit" class="button small">${esc(T('Enregistrer la clé'))}</button>${key ? `<button type="button" class="button small secondary" data-ukus-key-forget>${esc(T('Oublier la clé'))}</button>` : ''}</div></form></details></details>`;
    }
    const BODY = new WeakMap();
    function repaint(body) {
        const view = BODY.get(body), sec = body.querySelector('[data-ouc-ukus]'); if (!view || !sec) return;
        const was = sec.open, set = sec.querySelector('[data-ukus-set]')?.open;
        const tmp = document.createElement('div'); tmp.innerHTML = sectionHtml(view);
        const neu = tmp.firstElementChild; neu.open = was; const ns = neu.querySelector('[data-ukus-set]'); if (ns && set) ns.open = true;
        sec.replaceWith(neu);
    }
    async function search(body, which) {
        const view = BODY.get(body); if (!view || blocked(view)) return;
        const st = stateOf(view);
        st.loading = which; st.err[which] = ''; repaint(body);
        try {
            const r = await A().api(which === 'tna' ? 'ukus_tna_search' : 'ukus_nara_search', {id: view.pid, ...st.f});
            if (r?.error) throw new Error(r.error);
            if (r?.need_key) { SRV = {...(SRV || {}), nara_key: false}; st.nara = null; } else st[which] = r;
        } catch (e) { st.err[which] = e.message || String(e); }
        st.loading = ''; repaint(body);
    }
    async function saveKey(body, form) {
        const k = String(new FormData(form).get('key') || '').trim(); if (!k) return;
        try { const r = await A().api('ukus_nara_key_save', {}, {method: 'POST', body: {key: k}}); if (r?.error) throw new Error(r.error); SRV = {...(SRV || {}), nara_key: true}; A().toast?.(T('Clé NARA enregistrée sur cet ordinateur.'), 'success'); }
        catch (e) { A().toast?.(e.message || String(e), 'error'); }
        repaint(body);
    }
    async function forgetKey(body) {
        try { await A().api('ukus_nara_key_forget', {}, {method: 'POST', body: {}}); SRV = {...(SRV || {}), nara_key: false}; A().toast?.(T('Clé NARA oubliée.'), 'success'); } catch (e) { A().toast?.(e.message || String(e), 'error'); }
        repaint(body);
    }
    function wire(body) {
        body.addEventListener('submit', e => {
            const f = e.target.closest?.('[data-ukus-form]'), kf = e.target.closest?.('[data-ukus-key-form]');
            if (kf) { e.preventDefault(); saveKey(body, kf); return; }
            if (!f) return; e.preventDefault();
            const view = BODY.get(body); if (!view) return;
            const d = Object.fromEntries(new FormData(f).entries());
            stateOf(view).f = {first: String(d.first || '').trim(), last: String(d.last || '').trim(), y1: Number(d.y1) || '', y2: Number(d.y2) || '', kind: String(d.kind || '')};
            search(body, e.submitter?.dataset?.ukusGo === 'nara' ? 'nara' : 'tna');
        });
        body.addEventListener('click', e => {
            if (e.target.closest('[data-ukus-key-forget]')) { forgetKey(body); return; }
            const sm = e.target.closest('[data-ouc-ukus] > summary'); // ouvert / fermé à la main : retenu (pas l'ouverture automatique)
            if (sm) setTimeout(() => lsSet(K_OPEN, sm.parentElement.open ? '1' : '0'), 0);
        });
    }
    async function afterRedraw(view, body) {
        if (!view?.res || !body) return;
        BODY.set(body, view);
        // le STO : seulement pour une personne décédée
        if (view.data?.raw?.person?.living === 'living') body.querySelectorAll('[data-ouc-key="so27_sto"]').forEach(el => el.remove());
        if (!kiosk()) await srvState();
        if (!body.isConnected && !body.parentNode) return;
        body.querySelector('[data-ouc-ukus]')?.remove();
        const plus = body.querySelector('[data-ouc-plus]'), facts = body.querySelector('.ouc-facts');
        const html = sectionHtml(view);
        if (plus) plus.insertAdjacentHTML('beforeend', html); else if (facts) facts.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        if (!body.dataset.ukusWired) { body.dataset.ukusWired = '1'; wire(body); }
    }
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push(afterRedraw);

    /* ═════════════════════ 🧰 Listes → Données : une carte « lien » par site ═════════════════════ */
    function registerLists() {
        if (!L()) return;
        const reg = ext.dataLists = ext.dataLists || [];
        L().SITES.forEach(s => {
            const id = `link_so27_${s.key}`;
            if (reg.some(d => d?.id === id)) return;
            reg.push({id, icon: s.icon, label: s.label, group: 'Chercher', theme: s.theme, source: `↗ ${s.source}`, description: `↗ ${s.source}`, link: () => openUrl(siteUrl(s))});
        });
    }
    registerLists();

    /* ═════════════════════ 📜 Monographie de commune : les liens du lieu ═════════════════════ */
    (ext.monographSections = ext.monographSections || []).push({id: 'so27_liens', icon: '🔗', label: T('Archives à consulter en ligne pour ce lieu'), group: 'Le lieu', defaultOn: true,
        source: T('Liens vers FranceArchives, Gallica, HathiTrust, data.gouv.fr : rien n’est copié dans l’app'),
        render: async (place, host) => {
            const links = L()?.placeLinks?.(place || {}) || [];
            if (!links.length) return false;
            host.innerHTML = `<ul class="so27-place">${links.map(x => `<li>${esc(x.icon)} ${esc(T(x.label))} — ${ext_a(x.href, T('↗ {source}', {source: x.source}))}</li>`).join('')}</ul>`;
            return true;
        }});

    /* ═════════════════════ ⌘K ═════════════════════ */
    const UKUS_WORDS = /\b(national archives|kew|discovery|nara|archives (anglaises|britanniques|americaines|des etats unis)|testaments? anglais|naturalisations? britanniques?|soldats? britanniques?)\b/;
    function openOuChercher() { const st = A().state; if (!st) return; st.researchKind = 'ou_chercher'; A().persistUiState?.(); A().setModule?.('recherche'); }
    function provider(q) {
        const text = String(q || '').trim(); if (text.length < 4 || !L()) return [];
        const out = [];
        if (UKUS_WORDS.test(L().fold(text).replace(/[^a-z0-9 ]+/g, ' '))) out.push({label: `🇬🇧🇺🇸 ${T('Archives britanniques et américaines')}`, hint: T('Où chercher ? · The National Archives (Kew) et NARA'), go: openOuChercher});
        L().match(text).slice(0, 3).forEach(s => out.push({label: `↗ ${s.icon} ${T(s.label)}`, hint: `${s.source} · ${T('lien')}`, go: () => openUrl(siteUrl(s))}));
        return out;
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);

    /* ═════════════════════ 🧭 Je veux… ═════════════════════ */
    function intents(H, g) {
        if (!L()) return [];
        const ukus = H('ukus_search', 'chercher', '🇬🇧', 'Chercher dans les archives britanniques et américaines', 'The National Archives (Kew) et NARA : testaments anglais, soldats, naturalisations, passagers.',
            ['Recherche', '🌍 Où chercher ?', '🇬🇧🇺🇸 Archives britanniques et américaines'], {act: ['trouver'], obj: ['archive', 'acte', 'personne'],
                words: 'national archives kew discovery nara angleterre anglais britannique royaume uni etats unis amerique americain testament naturalisation soldat passagers emigration',
                phrases: ['archives anglaises', 'archives americaines', 'testament anglais', 'national archives'], needs: {person: 1}, go: g.research('ou_chercher'), module: 'recherche'});
        const links = L().SITES.map(s => H(`so27_${s.key}`, 'chercher', s.icon, s.label, `↗ ${s.source}`, ['Listes', '🧰 Données', s.label],
            {act: ['trouver', 'voir'], obj: s.theme === 'guerres' ? ['archive', 'guerre'] : ['archive'], words: `${s.words || ''} ${s.source}`, phrases: [L().fold(s.label.split(' — ')[0].split(' (')[0].split(',')[0])], go: () => openUrl(siteUrl(s)), target: `list:data_link_so27_${s.key}`, module: 'listes'}));
        return [ukus, ...links];
    }
    (ext.intentsHand = ext.intentsHand || []).push(intents);

    ext.liensArchives = {provider, intents, sectionHtml, blocked, registerLists};
})();
