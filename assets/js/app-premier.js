/**
 * 🧭 Premier lancement (maquette validée docs/design/premier-lancement.html, serveur : lib/premier.php).
 *
 *  - Écran d'installation d'une base vide (P1) : sous « Créer et ouvrir la base », le lien discret
 *    « Je veux faire autre chose ▾ » déplie 9 grandes cartes d'usages (une seule à la fois, ↑ ↓ ← → Entrée, Échap
 *    ou « ▴ Replier » = « 🌳 Ma généalogie ») ; la carte de droite devient le premier formulaire de l'usage
 *    (« 🐾 Créer le premier animal » P2, sinon « Commencer avec une base vide »). « Importer un fichier » reste là
 *    (fenêtre K13). En bas : « Commencer avec une base vide » et « 🧪 Essayer avec une base d'exemple ».
 *  - Un usage ne change QUE l'affichage : les onglets montrés ou cachés (les mêmes réglages que Réglages → Apparence →
 *    ordre du menu : genealogie-menu-hidden, genealogie-menu-<onglet>, onglets à soi, noms), et le premier écran.
 *    Aucune donnée n'est supprimée.
 *  - Réglages → Apparence → « 🧭 Usage de l'app » (P5) : interrupteurs K16 gardés tout de suite (K2), plusieurs usages
 *    se combinent, le dernier allumé ne s'éteint pas, « Premier écran à l'ouverture », « 🧭 Revoir le premier lancement ».
 *  - 🧪 Base d'exemple : une généalogie à part (Mes généalogies), bandeau discret « 🧪 Base d'exemple » avec
 *    « Repartir d'une base vide » ou « Revenir à ma généalogie ». Jamais en mode simple ni en mode consultation.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c]));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.log(m));
    const USAGE_KEY = 'genealogie-usage';
    const CHOICE_KEY = 'lcnda-premier-choice'; // l'usage choisi sur l'écran (cet ordinateur seulement : pour « Repartir d'une base vide »)
    const GO_KEY = 'lcnda-premier-go';         // le premier écran à ouvrir juste après la création

    /* ═════ Les usages (P1, P4) : ce qu'ils montrent, cachent, ajoutent, et leur premier écran ═════ */
    const USAGES = [
        {k: 'genealogie', ic: '🌳', t: 'Ma généalogie', short: 'Ma généalogie', pp: 'Ta famille, tes ancêtres, leurs actes et leurs photos.', change: 'Rien : l’app telle qu’elle est. Premier écran : « Créer la première personne ».', row: 'Personnes, arbre, actes.', show: ['personnes'], start: {module: 'dashboard', label: 'Tableau de bord'}},
        {k: 'lignee', ic: '🐾', t: 'Une lignée d’animaux', short: 'Une lignée d’animaux', pp: 'Un élevage, le pedigree de tes chiens, chats, chevaux…', change: 'Personnes → 🐾 Animaux. Premier écran : « Créer le premier animal ».', row: '🐾 Animaux, portées, pedigree.', show: ['animaux'], animals: true, start: {module: 'animaux', label: '🐾 Animaux'}},
        {k: 'recensement', ic: '🔭', t: 'Recenser des animaux', short: 'Recenser des animaux', pp: 'Suivre des animaux : baguage, puces, observations, trajets.', change: 'Personnes → 🐾 Animaux, + 🐾 Suivi des animaux. Premier écran : le Suivi.', row: '🐾 Suivi des animaux.', show: ['animaux', 'suivi'], animals: true, start: {module: 'suivi', label: '🐾 Suivi des animaux'}},
        {k: 'maison', ic: '🏠', t: 'L’histoire d’une maison ou d’un village', short: 'Maison ou village', pp: 'Qui a vécu où, de génération en génération, pièce par pièce.', change: '+ 🏠 Maisons et lieux, Carte en avant. Premier écran : « Créer la maison ».', row: '🏠 Maisons et lieux.', show: ['personnes'], tabs: [{id: 'ct_usmaison', icon: '🏠', name: 'Maisons et lieux', target: 'list:houses'}], start: {tab: 'ct_usmaison', label: '🏠 Maisons et lieux'}},
        {k: 'artiste', ic: '🎨', t: 'Le catalogue d’un artiste ou d’une collection', short: 'Artiste ou collection', pp: 'Ses œuvres, ses expositions, son catalogue raisonné.', change: '+ 🎨 Catalogue raisonné (onglet). Premier écran : « Créer l’artiste ».', row: '🎨 Catalogue raisonné.', show: ['personnes', 'catalogue'], start: {module: 'catalogue', label: '🎨 Catalogue raisonné'}},
        {k: 'archives', ic: '📚', t: 'Un fonds d’archives ou un musée familial', short: 'Archives ou musée', pp: 'Des photos, des lettres, des objets à classer et à décrire.', change: '+ 📄 Documents (onglet), + ✨ Trésors (musée de famille). Premier écran : « ⤒ Importer les premiers fichiers ».', row: '📄 Documents, ✨ Trésors.', show: ['personnes', 'documents', 'tresors'], start: {module: 'documents', label: '📄 Documents'}},
        {k: 'nom', ic: '🔤', t: 'L’étude d’un nom de famille', short: 'Un nom de famille', pp: 'Tous les porteurs d’un nom, ses variantes, d’où ils viennent.', change: '+ 🔤 Le nom étudié, Carte des porteurs. Premier écran : les noms et leurs porteurs.', row: '🔤 Le nom étudié.', show: ['personnes'], tabs: [{id: 'ct_usnom', icon: '🔤', name: 'Le nom étudié', target: 'stat:surnames'}], start: {tab: 'ct_usnom', label: '🔤 Le nom étudié'}},
        {k: 'entreprise', ic: '🏭', t: 'L’histoire d’une entreprise ou d’une association', short: 'Entreprise ou association', pp: 'Ses lieux, ses dirigeants, ses salariés ou ses membres.', change: '+ 🏭 L’entreprise, Personnes = « Membres ». Premier écran : « Créer l’entreprise ».', row: '🏭 L’entreprise, 👥 Membres.', show: ['personnes'], tabs: [{id: 'ct_usentrep', icon: '🏭', name: 'L’entreprise', target: 'list:employers'}], rename: '👥 Membres', start: {tab: 'ct_usentrep', label: '🏭 L’entreprise'}},
        {k: 'souvenirs', ic: '✨', t: 'Transmettre des souvenirs', short: 'Transmettre des souvenirs', pp: 'Des lettres à ouvrir plus tard, des recettes, des chansons, des souvenirs à laisser.', change: '+ ✨ Trésors de famille. Premier écran : « 💌 Écrire une lettre aux descendants ».', row: '✨ Trésors de famille.', show: ['personnes', 'tresors'], start: {module: 'tresors', label: '✨ Trésors de famille'}},
    ];
    const byKey = k => USAGES.find(u => u.k === k);
    const MANAGED = ['personnes', 'animaux', 'suivi', 'documents', 'catalogue', 'tresors'];
    const FLAGGED = ['animaux', 'suivi', 'documents', 'catalogue', 'tresors']; // cachés au départ tant que leur repère « genealogie-menu-<onglet> » n'est pas posé
    const SPECIES = [['chien', 'Chien'], ['chat', 'Chat'], ['cheval', 'Cheval, poney, âne'], ['lapin', 'Lapin'], ['rongeur', 'Rongeur'], ['oiseau', 'Oiseau'], ['poisson', 'Poisson'], ['reptile', 'Reptile, tortue'], ['ferme', 'Animal de la ferme'], ['autre', 'Autre']];
    const cleanSet = set => { const s = USAGES.map(u => u.k).filter(k => (set || []).includes(k)); return s.length ? s : ['genealogie']; };
    const shows = (set, tab) => set.some(k => (byKey(k)?.show || []).includes(tab));
    const hasTab = (set, id) => set.some(k => (byKey(k)?.tabs || []).some(t => t.id === id));
    const jparse = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch (_) { return d; } };

    /**
     * Les réglages qui changent quand on passe des usages « before » (null = base neuve) à « after ».
     * Seuls les onglets dont l'état change sont touchés : un interrupteur d'onglet changé à la main reste comme on l'a mis.
     * get(clé) lit le réglage actuel (texte ou null). Rend {clé: texte, ou null pour l'enlever}.
     */
    function usageChanges(before, after, get) {
        after = cleanSet(after);
        const out = {};
        let hidden = jparse(get('genealogie-menu-hidden'), []); if (!Array.isArray(hidden)) hidden = [];
        MANAGED.forEach(tab => {
            const now = shows(after, tab);
            if (before && shows(before, tab) === now) return;
            if (!before && tab === 'personnes' && now) return; // base neuve : Personnes est déjà là
            if (!before && !now && FLAGGED.includes(tab)) return; // base neuve : déjà caché au départ
            hidden = now ? hidden.filter(x => x !== tab) : (hidden.includes(tab) ? hidden : [...hidden, tab]);
            if (FLAGGED.includes(tab)) out[`genealogie-menu-${tab}`] = '1';
        });
        out['genealogie-menu-hidden'] = JSON.stringify(hidden);
        // onglets à soi des usages (Maisons et lieux, Le nom étudié, L'entreprise) : ajoutés, ou cachés (jamais effacés)
        let own = jparse(get('genealogie-custom-tabs'), []); if (!Array.isArray(own)) own = [];
        let ownChanged = false;
        USAGES.forEach(u => (u.tabs || []).forEach(t => {
            const now = hasTab(after, t.id), was = before ? hasTab(before, t.id) : false;
            if (now === was) return;
            const cur = own.find(x => x && x.id === t.id);
            if (now && !cur) { own.push({id: t.id, name: t.name, icon: t.icon, kind: 'screen', target: t.target, after: 'dashboard', intro: `Ajouté par l’usage « ${u.short} » (Réglages → Apparence → 🧭 Usage de l’app).`, hidden: false}); ownChanged = true; }
            else if (cur && !!cur.hidden !== !now) { cur.hidden = !now; ownChanged = true; }
        }));
        if (ownChanged) out['genealogie-custom-tabs'] = JSON.stringify(own);
        // « Personnes » s'appelle « 👥 Membres » pour une entreprise seule
        const membres = after.includes('entreprise') && !after.includes('genealogie');
        const wasMembres = before ? before.includes('entreprise') && !before.includes('genealogie') : false;
        if (membres !== wasMembres) {
            const names = jparse(get('genealogie-menu-names'), {}) || {};
            if (membres && !names.personnes) names.personnes = '👥 Membres';
            if (!membres && names.personnes === '👥 Membres') delete names.personnes;
            out['genealogie-menu-names'] = JSON.stringify(names);
        }
        // animaux : la base devient une base d'élevage (ou les deux, avec la généalogie)
        const animals = after.some(k => byKey(k)?.animals), wasAnimals = before ? before.some(k => byKey(k)?.animals) : false;
        const both = after.some(k => !byKey(k)?.animals);
        if (animals) { const mode = both ? 'both' : 'breeding'; if (get('genealogie-base-mode') !== mode) out['genealogie-base-mode'] = mode; }
        else if (wasAnimals) out['genealogie-base-mode'] = 'family';
        const cfg = jparse(get(USAGE_KEY), {}) || {};
        out[USAGE_KEY] = JSON.stringify({usages: after, start: typeof cfg.start === 'string' ? cfg.start : 'last'});
        return out;
    }
    const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
    function usageCfg() {
        const c = jparse(lsGet(USAGE_KEY), null);
        return {usages: cleanSet(c?.usages), start: typeof c?.start === 'string' ? c.start : 'last'};
    }
    /** Appliquer un ensemble d'usages dans l'app (réglages du navigateur, suivis par la base) */
    function applyUsages(after) {
        const before = usageCfg().usages;
        const changes = usageChanges(before, after, lsGet);
        Object.entries(changes).forEach(([k, v]) => lsSet(k, v));
        try { A().applyMenuOrder?.(); } catch (_) {}
        return Object.keys(changes);
    }
    const USAGE_KEYS = [USAGE_KEY, 'genealogie-menu-hidden', 'genealogie-custom-tabs', 'genealogie-menu-names', 'genealogie-base-mode', ...FLAGGED.map(t => `genealogie-menu-${t}`)];

    /* ═════ Appels au serveur (aussi sur l'écran d'installation, où l'app n'est pas démarrée) ═════ */
    async function post(action, body = {}, csrf = null, genealogy = null) {
        const token = csrf ?? (A().state?.csrf || window.INSTALL_CSRF || '');
        const g = genealogy ?? window.LCNDA_GENEALOGY;
        const r = await fetch(`api.php?action=${action}`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': token, ...(typeof g === 'string' ? {'X-Genealogy': g} : {})}, body: JSON.stringify({...body, csrf: token})});
        const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur.'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Erreur du serveur.');
        return j;
    }
    const goHome = () => { ['genealogie-last-route', 'genealogie-baissait-ui-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} }); try { history.replaceState(null, '', location.pathname + '#dashboard'); } catch (_) {} location.reload(); }; // l'adresse gagne sur le dernier écran gardé (qui peut être réécrit en quittant la page)

    /** 🧪 Essayer avec une base d'exemple : une généalogie à part, créée (une fois) puis remplie, et ouverte */
    async function openExample(btn) {
        const label = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ui-spin" aria-hidden="true"></span>Préparation de la base d’exemple…'; }
        try {
            await window.LCNDA_SETTINGS_DETACH?.(); // les réglages de la généalogie ouverte partent dans SA base, rien n'est mélangé
            const o = await post('premier_example_open');
            await post('premier_example_build', {}, o.csrf, o.id);
            if (!window.GENEALOGY_READY) { try { sessionStorage.setItem(GO_KEY, JSON.stringify({module: 'dashboard', example: true})); } catch (_) {} } // venu du premier lancement : la visite est proposée
            goHome();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.innerHTML = label; }
            toast(`Impossible d’ouvrir la base d’exemple : ${e.message}`, 'error');
            if (window.GENEALOGY_READY) setTimeout(() => location.reload(), 1800);
        }
    }

    /* ═════ P1 · L'écran d'installation ═════ */
    const usageCardHtml = (u, on) => `<div class="pl-uz${on ? ' is-on' : ''}${u.k === 'genealogie' ? ' is-def' : ''}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-pl-usage="${u.k}">
        <span class="pl-rk" aria-hidden="true"></span><span class="pl-ui" aria-hidden="true">${u.ic}</span><b>${esc(u.t)}</b><span class="pl-pp">${esc(u.pp)}</span>
        <small><em>Ce qui change</em>${esc(u.change)}</small></div>`;
    const usagesGridHtml = cur => `<div class="pl-usages" role="radiogroup" aria-label="Qu’est-ce que tu veux faire avec l’app ?">${USAGES.map(u => usageCardHtml(u, u.k === cur)).join('')}</div>`;
    function bindUsageGrid(grid, onPick) {
        const cards = () => [...grid.querySelectorAll('[data-pl-usage]')];
        const pick = (el, focus = true) => {
            cards().forEach(c => { const on = c === el; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', String(on)); c.tabIndex = on ? 0 : -1; });
            if (focus) el.focus();
            onPick(el.dataset.plUsage);
        };
        grid.addEventListener('click', e => { const c = e.target.closest('[data-pl-usage]'); if (c) pick(c); });
        grid.addEventListener('keydown', e => {
            const c = e.target.closest('[data-pl-usage]'); if (!c) return;
            const list = cards(), i = list.indexOf(c), cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 1;
            const move = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols}[e.key];
            if (move) { e.preventDefault(); const n = list[Math.max(0, Math.min(list.length - 1, i + move))]; list.forEach(x => { x.tabIndex = x === n ? 0 : -1; }); n.focus(); return; }
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c); }
        });
        return {pick: k => { const el = cards().find(c => c.dataset.plUsage === k); if (el) pick(el, false); }};
    }

    function animalFormHtml() {
        return `<h3>🐾 Créer le premier animal</h3><p class="muted">Une base vide avec une première fiche d’animal, à compléter ensuite (parents, portées, photos…).</p>
        <form class="import-form pl-animal" data-pl-animal novalidate>
            <label>Nom<input type="text" name="name" autocomplete="off" maxlength="120" placeholder="Ulysse"></label>
            <div class="pl-row2"><label>Espèce<select name="species">${SPECIES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
            <label>Race<input type="text" name="breed" autocomplete="off" maxlength="120" placeholder="Berger australien"></label></div>
            <div class="pl-field"><span class="pl-lab" id="pl-sex-l">Sexe</span><div class="segmented pl-seg" role="radiogroup" aria-labelledby="pl-sex-l" data-pl-seg="sex"><button type="button" data-v="M" class="is-active" aria-checked="true" role="radio">♂ Mâle</button><button type="button" data-v="F" role="radio" aria-checked="false">♀ Femelle</button><button type="button" data-v="" role="radio" aria-checked="false">Inconnu</button></div><input type="hidden" name="sex" value="M"></div>
            <label>Affixe / élevage<input type="text" name="affix" autocomplete="off" maxlength="120" placeholder="du Val d’Argent"></label>
            <div class="pl-field"><span class="pl-lab" id="pl-id-l">N° d’identification</span><div class="segmented pl-seg" role="radiogroup" aria-labelledby="pl-id-l" data-pl-seg="id_kind"><button type="button" data-v="microchip" class="is-active" role="radio" aria-checked="true">Puce</button><button type="button" data-v="tattoo" role="radio" aria-checked="false">Tatouage</button><button type="button" data-v="pedigree" role="radio" aria-checked="false">N° de livre</button></div><input type="hidden" name="id_kind" value="microchip">
            <input type="text" name="id_value" autocomplete="off" maxlength="40" aria-labelledby="pl-id-l" placeholder="250 26 9 60 1234567"></div>
            <button class="button" type="submit">Créer le premier animal</button>
        </form>`;
    }
    const otherFormHtml = u => `<h3>${u.ic} ${esc(u.t)}</h3><p class="muted">${esc(u.pp)}</p>
        <p class="pl-alt-what">${esc(u.change)}</p>
        <button class="button" type="button" data-pl-empty>Commencer avec une base vide</button>
        <p class="ui-hint">L’app s’ouvre sur « ${esc(u.start.label)} », avec les onglets qui vont avec. Tu pourras tout changer après.</p>`;

    function installScreen(screen) {
        const options = screen.querySelector('.install-options'), cards = options?.querySelectorAll(':scope > .install-card');
        const right = cards?.[1]; if (!right || screen.dataset.plDone) return; screen.dataset.plDone = '1';
        let current = 'genealogie';
        const original = [...right.children];
        const alt = document.createElement('div'); alt.className = 'pl-alt'; alt.hidden = true;
        right.appendChild(alt);
        const other = document.createElement('button'); other.type = 'button'; other.className = 'pl-other'; other.setAttribute('aria-expanded', 'false'); other.setAttribute('aria-controls', 'pl-fold');
        other.textContent = 'Je veux faire autre chose ▾';
        right.appendChild(other);
        const fold = document.createElement('div'); fold.className = 'pl-fold'; fold.id = 'pl-fold'; fold.hidden = true;
        fold.innerHTML = `<h3>Qu’est-ce que tu veux faire avec l’app ?</h3><p>Choisis ce qui te ressemble : l’app s’ouvre avec les bons onglets et le bon premier écran. Tu pourras tout changer après.</p>
            ${usagesGridHtml(current)}
            <div class="pl-ofoot"><span>ℹ️ Rien n’est figé : Réglages → Apparence → « 🧭 Usage de l’app ».</span><button type="button" class="pl-lnk" data-pl-fold>▴ Replier</button></div>`;
        options.after(fold);
        const start = document.createElement('div'); start.className = 'pl-start';
        start.innerHTML = `<span class="pl-start-t">Ou bien :</span><button type="button" class="button secondary" data-pl-empty-any>Commencer avec une base vide</button><button type="button" class="button secondary" data-pl-example>🧪 Essayer avec une base d’exemple</button>
            <p class="ui-hint">La base d’exemple est une famille imaginaire (5 générations, des photos d’époque dessinées) rangée à part dans « Mes généalogies » : ta généalogie n’est jamais touchée.</p>`;
        fold.after(start);
        const setUsage = k => {
            current = byKey(k) ? k : 'genealogie';
            try { localStorage.setItem(CHOICE_KEY, current); } catch (_) {}
            const u = byKey(current);
            const gen = current === 'genealogie';
            original.forEach(el => { el.hidden = !gen; });
            alt.hidden = gen;
            alt.innerHTML = gen ? '' : current === 'lignee' ? animalFormHtml() : otherFormHtml(u);
            UI().scan?.(alt);
        };
        const grid = bindUsageGrid(fold.querySelector('.pl-usages'), setUsage);
        const open = on => {
            fold.hidden = !on; other.setAttribute('aria-expanded', String(on)); other.classList.toggle('is-on', on);
            other.textContent = on ? 'Je veux faire autre chose ▴' : 'Je veux faire autre chose ▾';
            if (on) fold.querySelector('[data-pl-usage].is-on')?.focus();
            else { grid.pick('genealogie'); other.focus(); }
        };
        other.addEventListener('click', () => open(fold.hidden));
        fold.querySelector('[data-pl-fold]').addEventListener('click', () => open(false));
        screen.addEventListener('keydown', e => { if (e.key === 'Escape' && !fold.hidden && !document.querySelector('dialog[open]')) { e.preventDefault(); open(false); } });
        // segmentés (sexe, sorte de numéro)
        alt.addEventListener('click', e => {
            const b = e.target.closest('[data-pl-seg] button'); if (!b) return;
            const seg = b.closest('[data-pl-seg]');
            seg.querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', String(on)); });
            const inp = seg.parentElement.querySelector(`input[name="${seg.dataset.plSeg}"]`); if (inp) inp.value = b.dataset.v;
        });
        const startWith = async (btn, extra = {}) => {
            const u = byKey(current);
            const settings = current === 'genealogie' ? {} : Object.fromEntries(Object.entries(usageChanges(null, [current], () => null)).filter(([, v]) => v != null));
            const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>Création de la base…`;
            try {
                await post('premier_start', {usages: [current], settings, ...extra});
                try { sessionStorage.setItem(GO_KEY, JSON.stringify({...u.start, usage: current, animal: extra.animal?.name || ''})); } catch (_) {}
                goHome();
            } catch (e) {
                btn.disabled = false; btn.innerHTML = label;
                const nameField = alt.querySelector('[name="name"]');
                if (extra.animal && /nom/i.test(e.message) && nameField && UI().fail) return UI().fail(nameField, e.message.replace(/^⛔\s*/, ''));
                toast(e.message, 'error');
            }
        };
        alt.addEventListener('submit', e => {
            const f = e.target.closest('[data-pl-animal]'); if (!f) return;
            e.preventDefault();
            const d = Object.fromEntries(new FormData(f).entries());
            if (!String(d.name || '').trim()) return UI().fail ? UI().fail(f.elements.name, 'Donne un nom à ton animal.') : toast('Donne un nom à ton animal.', 'error');
            startWith(f.querySelector('button[type=submit]'), {animal: d});
        });
        alt.addEventListener('click', e => { const b = e.target.closest('[data-pl-empty]'); if (b) startWith(b); });
        start.querySelector('[data-pl-empty-any]').addEventListener('click', e => startWith(e.currentTarget));
        start.querySelector('[data-pl-example]').addEventListener('click', e => openExample(e.currentTarget));
    }

    /* ═════ Après la création : le premier écran de l'usage ═════ */
    function afterBoot(fn, tries = 0) {
        const st = A().state;
        if (st?.bootstrap && st.module) return setTimeout(fn, 60);
        if (tries < 120) setTimeout(() => afterBoot(fn, tries + 1), 100);
    }
    function goTo(start) {
        if (!start) return;
        if (start.tab) { const b = document.querySelector(`.main-nav .nav-item[data-board="${start.tab}"]`); if (b && b.style.display !== 'none') b.click(); return; }
        if (start.module && start.module !== A().state?.module) { const b = document.querySelector(`.main-nav .nav-item[data-module="${start.module}"]:not(.nav-custom-tab)`); if (b && b.style.display !== 'none') b.click(); else A().setModule?.(start.module); }
    }
    function firstScreen() {
        if (document.documentElement.classList.contains('ms-open') || document.body.classList.contains('is-kiosk')) return;
        let go = null; try { go = JSON.parse(sessionStorage.getItem(GO_KEY) || 'null'); sessionStorage.removeItem(GO_KEY); } catch (_) {}
        if (go) {
            goTo(go);
            if (!go.example) toast(go.animal ? `✓ Fiche « ${go.animal} » créée.` : `✓ Base créée${byKey(go.usage) && go.usage !== 'genealogie' ? ` pour « ${byKey(go.usage).short} »` : ''} : tu peux commencer.`);
            // fin du premier lancement (seulement là) : « Une petite visite ? » (assets/js/app-visite.js ; rien si déjà vue)
            setTimeout(() => { try { A().offerTour?.(); } catch (_) {} }, 700);
            return;
        }
        // « Premier écran à l'ouverture » (P5) : seulement sans adresse demandée
        const cfg = usageCfg();
        if (cfg.start === 'last' || (location.hash && location.hash.length > 1 && !/^#(dashboard)?$/.test(location.hash) && performance.getEntriesByType?.('navigation')?.[0]?.type !== 'reload')) return;
        goTo(startOption(cfg.start));
    }
    function startOptions(set) {
        const out = [['last', 'Le dernier écran ouvert (comme avant)'], ['dashboard', 'Tableau de bord']];
        set.forEach(k => { const s = byKey(k)?.start; if (s && s.module !== 'dashboard') out.push([s.tab || s.module, s.label]); });
        return out;
    }
    const startOption = v => (v === 'dashboard' ? {module: 'dashboard'} : /^ct_/.test(v) ? {tab: v} : v && v !== 'last' ? {module: v} : null);

    /* ═════ P5 · Réglages → Apparence → « 🧭 Usage de l'app » ═════ */
    function usagePanelHtml() {
        const cfg = usageCfg(), only = cfg.usages.length === 1;
        const rows = USAGES.map(u => {
            const on = cfg.usages.includes(u.k);
            return `<div class="pl-urow${on ? ' is-on' : ''}"><span class="pl-uic" aria-hidden="true">${u.ic}</span><span><b>${esc(u.short)}</b><small>${esc(u.row)}</small></span>${UI().toggleHtml ? UI().toggleHtml('', {checked: on, attrs: `data-pl-use="${u.k}" aria-label="${esc(u.short)}"`, disabled: on && only}) : `<input type="checkbox" data-pl-use="${u.k}" ${on ? 'checked' : ''}>`}</div>`;
        }).join('');
        const opts = startOptions(cfg.usages);
        return `<section class="person-block-config pl-usage" id="lc-usage"><header><span class="eyebrow">APPARENCE</span><h3 data-help="Ce que tu fais avec l’app : ses onglets et son premier écran. Aucune fiche n’est supprimée." data-help-faq="usage de l’app">🧭 Usage de l’app</h3>
            <p>Changer d’usage change <b>seulement les onglets et le premier écran</b>. Aucune fiche n’est supprimée : les personnes restent là, même quand l’onglet est caché. On peut en allumer plusieurs : leurs onglets s’additionnent.</p></header>
            <div class="maintenance-panel pl-usage-panel"><div class="pl-usage-head"><button type="button" class="button small secondary" data-pl-use-reset title="« 🌳 Ma généalogie » seule">↺ Remettre comme au départ</button></div>
            <div class="pl-urows">${rows}</div>
            <label class="pl-startsel">Premier écran à l’ouverture<select data-pl-start>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cfg.start ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <p class="ui-hint">Les onglets se rangent, se renomment et se cachent un par un dans « Ordre et noms du menu principal ».</p>
            <div class="page-actions action-zone"><button type="button" class="button small secondary" data-pl-reopen>🧭 Revoir le premier lancement</button>${isExample() ? '' : '<button type="button" class="button small secondary" data-pl-example>🧪 Essayer avec une base d’exemple</button>'}</div></div></section>`;
    }
    function refreshPanel() {
        const old = document.getElementById('lc-usage'); if (!old) return;
        const wasOff = old.classList.contains('reg-a-off');
        old.outerHTML = usagePanelHtml();
        const box = document.getElementById('lc-usage'); if (wasOff) box.classList.add('reg-a-off');
        bindPanel(box);
    }
    function bindPanel(box) {
        if (!box || box.dataset.plBound) return; box.dataset.plBound = '1';
        box.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-pl-use]')) {
                const cfg = usageCfg(), k = t.dataset.plUse;
                const set = t.checked ? [...new Set([...cfg.usages, k])] : cfg.usages.filter(x => x !== k);
                if (!set.length) { t.checked = true; return; }
                applyUsages(set);
                setTimeout(refreshPanel, 0);
                return;
            }
            if (t.matches('[data-pl-start]')) { const cfg = usageCfg(); lsSet(USAGE_KEY, JSON.stringify({usages: cfg.usages, start: t.value})); }
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-pl-use-reset]')) { applyUsages(['genealogie']); const cfg = usageCfg(); lsSet(USAGE_KEY, JSON.stringify({usages: cfg.usages, start: 'last'})); setTimeout(refreshPanel, 0); }
            else if (b.matches('[data-pl-reopen]')) openDialog();
            else if (b.matches('[data-pl-example]')) openExample(b);
        });
    }
    ext.designPanels = ext.designPanels || [];
    ext.designPanels.push(() => usagePanelHtml());
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => {
        const box = document.getElementById('lc-usage'), grid = document.querySelector('#workspace .design-order-grid-four');
        if (box && grid && grid.previousElementSibling !== box) grid.before(box); // juste avant « Ordre et noms du menu principal »
        bindPanel(box);
        try { A().applyMenuOrder?.(); } catch (_) {} // aussi après « ↶ Annuler » (la page est redessinée)
    });

    /* ═════ « 🧭 Revoir le premier lancement » (Réglages, FAQ) : les usages, la base d'exemple, l'import ═════ */
    function openDialog() {
        if (document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open')) return toast('Pas en mode consultation ni en mode simple.');
        document.getElementById('pl-dialog')?.remove();
        const cfg = usageCfg();
        let choice = cfg.usages[0];
        const dl = document.createElement('dialog'); dl.className = 'modal modal-l h-modal pl-dialog'; dl.id = 'pl-dialog';
        dl.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">PREMIER LANCEMENT</span><h2>Qu’est-ce que tu veux faire avec l’app ?</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <p class="muted">Choisis ce qui te ressemble : l’app garde tes fiches et change seulement ses onglets et son premier écran. ${cfg.usages.length > 1 ? `Tu as aujourd’hui ${cfg.usages.length} usages allumés : en choisir un ici les remplace.` : ''}</p>
            ${usagesGridHtml(choice)}
            <div class="pl-dlg-more"><button type="button" class="button secondary" data-pl-import>⤒ Importer un fichier…</button>${isExample() ? '' : '<button type="button" class="button secondary" data-pl-example>🧪 Essayer avec une base d’exemple</button>'}</div>
            <p class="ui-hint">Plusieurs usages à la fois : Réglages → Apparence → « 🧭 Usage de l’app ».</p>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Enregistrer</button></div></form>`;
        document.body.appendChild(dl);
        bindUsageGrid(dl.querySelector('.pl-usages'), k => { choice = k; });
        dl.addEventListener('close', () => dl.remove());
        dl.querySelectorAll('[data-x]').forEach(x => x.addEventListener('click', () => dl.close()));
        dl.querySelector('[data-pl-example]')?.addEventListener('click', e => openExample(e.currentTarget));
        dl.querySelector('[data-pl-import]').addEventListener('click', () => { dl.close(); const st = A().state; if (st) st.maintenanceTab = 'import'; A().setModule?.('maintenance'); });
        dl.querySelector('form').addEventListener('submit', e => {
            e.preventDefault();
            const u = byKey(choice); dl.close();
            const apply = () => applyUsages([choice]);
            const redraw = () => { try { A().applyMenuOrder?.(); } catch (_) {} refreshPanel(); };
            if (A().undoLocalChange) A().undoLocalChange(`Usage « ${u.short} » choisi : onglets mis à jour`, USAGE_KEYS, apply, redraw); else { apply(); toast('Usage enregistré.'); }
            refreshPanel();
            goTo(u.start);
        });
        dl.showModal();
        dl.querySelector('[data-pl-usage].is-on')?.focus();
    }
    ext.premierLancement = {open: openDialog, usages: () => USAGES.map(u => ({...u})), usageChanges, applyUsages, openExample};

    /* ═════ 🧪 Bandeau de la base d'exemple ═════ */
    let example = null;
    function isExample() { return !!example; }
    async function exampleBanner() {
        let data; try { const r = await fetch('api.php?action=genealogies'); data = await r.json(); } catch (_) { return; }
        const cur = (data?.genealogies || []).find(g => g.active);
        if (!cur?.example) return;
        example = cur;
        if (document.getElementById('example-banner')) return;
        const b = document.createElement('div'); b.id = 'example-banner'; b.setAttribute('role', 'note');
        b.innerHTML = `<span class="pl-ex-badge">🧪 Base d’exemple</span><span class="pl-ex-text">Une famille imaginaire pour essayer l’app : ta généalogie n’est pas touchée.</span>
            ${cur.from_ready ? '<button type="button" class="button small" data-pl-leave="back">Revenir à ma généalogie</button>' : '<button type="button" class="button small" data-pl-leave="empty">Repartir d’une base vide</button>'}`;
        document.body.prepend(b);
        b.addEventListener('click', e => { const btn = e.target.closest('[data-pl-leave]'); if (btn) leaveExample(btn); });
        refreshPanel();
    }
    async function leaveExample(btn) {
        if (document.body.classList.contains('is-kiosk')) return;
        btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="ui-spin" aria-hidden="true"></span>' + esc(label);
        try {
            await window.LCNDA_SETTINGS_DETACH?.();
            const r = await post('premier_example_leave');
            if (btn.dataset.plLeave === 'empty' && !r.ready) {
                const k = (() => { try { return localStorage.getItem(CHOICE_KEY) || 'genealogie'; } catch (_) { return 'genealogie'; } })();
                const usage = byKey(k) ? k : 'genealogie';
                const settings = usage === 'genealogie' ? {} : usageChanges(null, [usage], () => null);
                await post('premier_start', {usages: [usage], settings}, r.csrf, r.genealogy);
                try { sessionStorage.setItem(GO_KEY, JSON.stringify({...byKey(usage).start, usage})); } catch (_) {}
            }
            goHome();
        } catch (e) { btn.disabled = false; btn.textContent = label; toast(e.message + ' (la page va se recharger)', 'error'); setTimeout(() => location.reload(), 1800); }
    }

    function init() {
        const screen = document.getElementById('install-screen');
        if (screen && !window.GENEALOGY_READY) { installScreen(screen); return; }
        if (!window.GENEALOGY_READY) return;
        if (new URLSearchParams(location.search).has('view')) return; // deuxième écran, écran posé dans un onglet
        exampleBanner();
        afterBoot(firstScreen);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
