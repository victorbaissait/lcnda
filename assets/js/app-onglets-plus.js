/* LCNDA — ＋ Ajouter un onglet (maquette docs/design/onglets-et-successoral-outils.html, partie A : A1 à A3).
 * Un catalogue d'onglets en option, pour tous les usages, à partir de ce qui existe déjà :
 *  1. des parties de l'app cachées au départ (📄 Documents, ✨ Trésors, 📒 Fiches, 🧬 ADN, 🎨 Catalogue, 🐾 Animaux, 🐾 Suivi,
 *     ⚖️ Successions) : « montrées », comme la case de Réglages → Menus (genealogie-menu-hidden + repère genealogie-menu-<onglet>) ;
 *  2. un raccourci vers une liste ou un outil : un « onglet à soi » de sorte « raccourci » (genealogie-custom-tabs,
 *     {kind: 'screen', target: 'list:courriers'}, identifiants fixes ct_add… : deux clics ne font jamais deux onglets).
 * Rien de neuf n'est stocké, sauf la liste des onglets ajoutés à la main (genealogie-menu-added) : un changement d'usage ne
 * les cache jamais (app-premier.js, usageChanges). « Conseillé pour ton usage » : le tableau usage × onglet (A2) ; plusieurs
 * usages : conseillé pour au moins l'un ; « — » (absent du catalogue) pour tous les usages allumés.
 * Entrées : le ＋ au bout du menu (petit et gris, toujours là ; case « Montrer le ＋ au bout du menu ») et Réglages → Menus,
 * colonne et listes → « Menu » → « ＋ Ajouter un onglet… » au-dessus de « Ordre et noms du menu principal » ; pas de ＋ en
 * mode consultation ni en mode simple. A3 : un raccourci se « Retire » dans la liste de l'ordre du menu (↶ Annuler).
 * « ⠿ Ordre du menu » (4e bouton du haut) : les onglets du menu, à glisser (⠿, ou Alt + ↑ / ↓ au clavier) ; le même ordre et le même
 * stockage que Réglages → Menus (genealogie-menu-order, LCNDA_APP.orderedMenuKeys / applyMenuOrder).
 * « ＋ Une autre liste… » / « ＋ Un autre outil… » : n'importe quelle liste ou outil, choisi dans le menu de choix des raccourcis
 * (LCNDA_EXT.shortcuts.chooseTargets, recherche mêlée), devient un raccourci au bout du menu (identifiant fixe ct_p…, tiré de la cible).
 * « Mettre mes onglets à la fin du menu » (genealogie-menu-own-last, coché au départ) : les onglets à soi arrivent au bout, regroupés
 * dans les listes de la fenêtre ; un ordre réglé à la main ne bouge pas (« ⤓ Regrouper mes onglets à la fin » le fait sur demande).
 * Essais : tests/test-onglets-plus-ordre.js, tests/test-successoral-outils.js.
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root && root.document) m.mount(root);
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    // les 10 usages, dans l'ordre du tableau A2 (app-premier.js, USAGES)
    const USAGE_ORDER = ['genealogie', 'lignee', 'recensement', 'maison', 'artiste', 'archives', 'nom', 'entreprise', 'souvenirs', 'successoral'];
    // Y = déjà montré par l'usage · R = conseillé · P = possible · N = n'a pas de sens ici (absent du catalogue)
    const CATALOG = [
        {k: 'documents', g: 1, icon: '📄', name: 'Documents', desc: 'Tes photos, actes, lettres de A à Z, rangés en dossiers.', module: 'documents', rec: 'RPPRRYRRRY', words: 'document photo acte lettre papier'},
        {k: 'tresors', g: 1, icon: '✨', name: 'Trésors de famille', desc: 'Lettres à ouvrir plus tard, recettes, musée de famille.', module: 'tresors', rec: 'RPNRPYPPYN', words: 'trésor souvenir recette musée'},
        {k: 'fiches', g: 1, icon: '📒', name: 'Fiches', desc: 'Fiches thématiques : un métier, une guerre, un village.', module: 'fiches', rec: 'RPPRPRRRPP', words: 'fiche thème métier guerre village'},
        {k: 'adn', g: 1, icon: '🧬', name: 'ADN', desc: 'Tes correspondances ADN et leurs liens.', module: 'adn', rec: 'PNNNNNRNPP', words: 'adn dna correspondance'},
        {k: 'catalogue', g: 1, icon: '🎨', name: 'Catalogue raisonné', desc: 'Les œuvres d’un artiste, albums, expositions.', module: 'catalogue', rec: 'PNNPYRNPPN', words: 'artiste œuvre oeuvre exposition album'},
        {k: 'animaux', g: 1, icon: '🐾', name: 'Animaux', desc: 'Pedigree, portées. (Suivi des animaux : à part.)', module: 'animaux', rec: 'PYYPNNNNPN', words: 'animal chien chat cheval pedigree portée'},
        {k: 'suivi', g: 1, icon: '🐾', name: 'Suivi des animaux', desc: 'Baguage, puces, observations, trajets.', module: 'suivi', rec: 'PYYPNNNNPN', words: 'animal suivi baguage observation'},
        {k: 'successoral', g: 1, icon: '⚖️', name: 'Successions', desc: 'Dossiers de succession, pour un notaire.', module: 'successoral', rec: 'PNNNNNNNNY', pro: true, words: 'succession héritier notaire dossier'},
        {k: 'courriers', g: 2, icon: '📮', name: 'Courriers', desc: 'Le Registre de courriers : demandes d’actes, relances, réponses.', target: 'list:courriers', where: 'Listes → Archives et sources → Registre de courriers', rec: 'RPNPPRRPPR', words: 'courrier lettre relance demande acte mairie'},
        {k: 'transcriptions', g: 2, icon: '📜', name: 'Transcriptions d’actes', desc: 'Tes actes recopiés, mot à mot.', target: 'list:act_transcriptions_list', where: 'Listes → Archives et sources', rec: 'RNNRNPRPNR', words: 'acte transcription recopie'},
        {k: 'agenda', g: 2, icon: '🗓', name: 'Mon agenda', desc: 'Visites, rendez-vous, relances, à la semaine.', target: 'list:my_calendar', where: 'Listes → Recherche et organisation', rec: 'RPRPPPPRPR', words: 'agenda calendrier rendez-vous semaine'},
        {k: 'rappels', g: 2, icon: '⏰', name: 'Rappels', desc: 'Les choses à faire, avec leur date.', target: 'list:reminders', where: 'Listes → Recherche et organisation', rec: 'RPRPPPPRPR', words: 'rappel tâche à faire'},
        {k: 'medias', g: 2, icon: '🖼', name: 'Médias', desc: 'Toutes les images, sons, vidéos en tableau.', target: 'list:media', where: 'Listes → Médias et documents', rec: 'PPPPRPPPPP', words: 'média image photo son vidéo'},
        {k: 'questions', g: 2, icon: '💬', name: 'Questions aux proches', desc: 'Questionnaires pour recueillir les souvenirs.', target: 'list:family_questions', where: 'Listes → Médias et documents', rec: 'RNNRPPPPRN', words: 'question questionnaire souvenir proche'},
        {k: 'maisons', g: 2, icon: '🏠', name: 'Maisons de famille', desc: 'Les maisons, pièce par pièce, et qui y a vécu.', target: 'list:houses', where: 'Listes → Lieux et maisons', rec: 'PNNYPPPPPN', words: 'maison lieu pièce'},
        {k: 'vivants', g: 2, icon: '📇', name: 'Répertoire des vivants', desc: 'Adresses et contacts des cousins vivants.', target: 'list:living_contacts', where: 'Listes → Personnes et familles', rec: 'PPNNPNPPPR', words: 'adresse contact vivant cousin répertoire'},
        {k: 'archives', g: 2, icon: '🏛', name: 'Archives', desc: 'Les dépôts, leurs cotes, leurs horaires.', target: 'list:archives', where: 'Listes → Archives et sources', rec: 'RNNRPRRPNR', words: 'archive dépôt cote'},
        {k: 'visites', g: 2, icon: '🧭', name: 'Visites d’archives', desc: 'Le planificateur : quoi consulter, où, quand.', target: 'list:archive_visits', where: 'Listes → Archives et sources', rec: 'RNNRPRRPNR', words: 'visite archive planificateur'},
        {k: 'heritages', g: 2, icon: '🏠', name: 'Héritages et successions', desc: 'Qui a hérité de quoi d’après les actes anciens.', target: 'list:successions', where: 'Listes → Médias et documents', rec: 'PNNRNPPNPP', words: 'héritage succession acte ancien'},
        {k: 'ou_chercher', g: 3, icon: '🌍', name: 'Où chercher ?', desc: 'Les bons sites pour la personne ouverte.', target: 'search:ou_chercher', where: 'Recherche → Type de recherche', rec: 'RNNPNNRNNR', words: 'chercher site internet recherche'},
        {k: 'doublons', g: 3, icon: '🧩', name: 'Doublons', desc: 'Trouver et fusionner les fiches en double.', target: 'maint:duplicates', where: 'Réglages → Fusion de doublons', rec: 'PPPPPPRPPP', words: 'doublon fusion double'},
        {k: 'controle', g: 3, icon: '✅', name: 'Contrôle de la base', desc: 'Dates impossibles, liens bizarres.', target: 'maint:controle', where: 'Réglages → Contrôle de la base', rec: 'PPPPPPRPPP', words: 'contrôle erreur date lien'},
        {k: 'nom', g: 3, icon: '🔤', name: 'Le nom étudié', desc: 'Les porteurs d’un nom, ses variantes.', target: 'stat:surnames', where: 'Graphiques → statistique des noms', rec: 'PNNNNNYNNN', words: 'nom patronyme variante porteur'},
        {k: 'entreprise', g: 3, icon: '🏭', name: 'L’entreprise', desc: 'Employeurs, salariés, membres.', target: 'list:employers', where: 'Listes → Employeurs', rec: 'PNNPNPNYNN', words: 'entreprise employeur salarié association'},
    ];
    const GROUPS = {1: ['Des parties de l’app, cachées au départ', 'Elles existent déjà : cocher les montre dans le menu.'], 2: ['Un raccourci vers une liste', 'Il devient un « onglet à soi » (Éditeur d’onglets).'], 3: ['Un raccourci vers un outil', '']};
    const FLAGGED = ['animaux', 'suivi', 'documents', 'catalogue', 'tresors', 'successoral', 'fiches', 'adn']; // cachés au départ tant que leur repère n'est pas posé (app.js, menuHiddenKeys)
    /** pour les usages allumés : 'shown' (déjà montré par l'usage), 'rec' (conseillé), 'ok' (possible), 'off' (absent du catalogue) */
    function status(item, usages) {
        const set = (Array.isArray(usages) && usages.length ? usages : ['genealogie']).map(u => USAGE_ORDER.indexOf(u)).filter(i => i >= 0);
        const marks = set.map(i => item.rec[i] || 'P');
        if (!marks.length) return 'ok';
        if (marks.includes('Y')) return 'shown';
        if (marks.includes('R')) return 'rec';
        if (marks.every(m => m === 'N')) return 'off';
        return 'ok';
    }
    const idOf = item => 'ct_add' + item.k.replace(/[^a-z0-9]/g, '').slice(0, 18);
    const slug = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
    /** la recherche du catalogue : nom, description, mots-clés (sans accents) */
    const matches = (item, q, tr = s => s) => { const w = slug(q).trim(); if (!w) return true; const hay = slug([tr(item.name), tr(item.desc), item.name, item.desc, item.words].join(' ')); return w.split(/\s+/).every(x => hay.includes(x)); };

    function mount(win) {
        const doc = win.document;
        const A = () => win.LCNDA_APP, UI = () => win.LCNDA_UI;
        const ext = win.LCNDA_EXT = win.LCNDA_EXT || {};
        const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
        const i18n = (s, v) => (win.LCNDA_I18N ? win.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
        const ls = {get(k, d) { try { const v = JSON.parse(win.localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, raw(k) { try { return win.localStorage.getItem(k); } catch (_) { return null; } },
            put(k, v) { try { if (v == null) win.localStorage.removeItem(k); else win.localStorage.setItem(k, v); } catch (_) {} }};
        const kiosk = () => doc.body?.classList.contains('is-kiosk');
        const simple = () => doc.documentElement.classList.contains('ms-open');
        const usages = () => { const c = ls.get('genealogie-usage', null); return Array.isArray(c?.usages) && c.usages.length ? c.usages : ['genealogie']; };
        const plusOn = () => ls.raw('genealogie-menu-plus') !== '0';
        const ownTabs = () => (A()?.customTabs ? A().customTabs() : ls.get('genealogie-custom-tabs', []) || []);
        const nav = () => doc.querySelector('.main-nav');
        const hiddenKeys = () => (A()?.menuHiddenKeys ? A().menuHiddenKeys() : ls.get('genealogie-menu-hidden', []) || []);
        const ownLast = () => (A()?.menuOwnLast ? A().menuOwnLast() : ls.raw('genealogie-menu-own-last') !== '0');
        /** mes raccourcis qui ne sont pas dans le catalogue (ajoutés par « Une autre liste… », l'Éditeur d'onglets…) : g = 2 (listes) ou 3 (outils) */
        const isListTarget = t => /^(list|mylist|village):/.test(String(t || ''));
        const extraOwn = g => ownTabs().filter(t => t.kind === 'screen' && t.target && !CATALOG.some(c => c.target === t.target) && (g === 2) === isListTarget(t.target));
        /** l'onglet est-il dans le menu ? (une partie de l'app montrée, ou un onglet à soi visible vers le même écran) */
        const inMenu = item => item.module ? !!nav()?.querySelector(`.nav-item[data-module="${item.module}"]:not([data-board])`) && !hiddenKeys().includes(item.module)
            : ownTabs().some(t => t.kind === 'screen' && t.target === item.target && !t.hidden);
        const SNAP = ['genealogie-menu-hidden', 'genealogie-menu-order', 'genealogie-custom-tabs', 'genealogie-menu-added', ...FLAGGED.map(k => `genealogie-menu-${k}`)];
        const snapshot = () => Object.fromEntries(SNAP.map(k => [k, ls.raw(k)]));
        const restore = snap => { Object.entries(snap).forEach(([k, v]) => ls.put(k, v)); A()?.applyMenuOrder?.(); paintPlus(); };
        /** l'ordre actuel du menu (tous les onglets, cachés compris), tel que dessiné */
        const domOrder = () => [...(nav()?.querySelectorAll('.nav-item[data-module]:not([data-board]), .nav-custom-tab[data-board]') || [])].map(b => b.dataset.board || b.dataset.module).filter((k, i, l) => k && l.indexOf(k) === i);
        const menuKeys = () => (A()?.orderedMenuKeys ? A().orderedMenuKeys() : domOrder());
        /** un onglet ajouté arrive à la fin, avant Réglages ; une partie de l'app, avant mes onglets du bout (« Mettre mes onglets à la fin du menu ») */
        const toEnd = key => {
            const own = new Set(ownTabs().map(t => t.id)), o = menuKeys().filter(k => k !== key), m = o.indexOf('maintenance');
            let at = m < 0 ? o.length : m;
            if (!own.has(key) && ownLast()) while (at > 0 && own.has(o[at - 1])) at--;
            o.splice(at, 0, key); ls.put('genealogie-menu-order', JSON.stringify(o)); A()?.applyMenuOrder?.();
        };
        /** ⤓ mes onglets regroupés à la fin (avant Réglages s'il est dernier), dans l'ordre où ils sont */
        const ownGrouped = order => { const own = new Set(ownTabs().map(t => t.id)), mine = order.filter(k => own.has(k)), rest = order.filter(k => !own.has(k)), m = rest.indexOf('maintenance'); rest.splice(m >= 0 && m === rest.length - 1 ? m : rest.length, 0, ...mine); return rest; };
        const label = item => `${item.icon} ${i18n(item.name)}`;
        function setShown(item, on) {
            const snap = snapshot();
            let added = ls.get('genealogie-menu-added', []); if (!Array.isArray(added)) added = [];
            if (item.module) {
                let hidden = ls.get('genealogie-menu-hidden', []); if (!Array.isArray(hidden)) hidden = [];
                hidden = on ? hidden.filter(k => k !== item.module) : [...new Set([...hidden, item.module])];
                ls.put('genealogie-menu-hidden', JSON.stringify(hidden));
                if (FLAGGED.includes(item.module)) ls.put(`genealogie-menu-${item.module}`, '1');
                added = on ? [...new Set([...added, item.module])] : added.filter(k => k !== item.module);
                ls.put('genealogie-menu-added', JSON.stringify(added));
                A()?.applyMenuOrder?.();
                if (on) toEnd(item.module);
            } else {
                const list = ownTabs().map(t => ({...t}));
                const same = list.filter(t => t.kind === 'screen' && t.target === item.target);
                let id;
                if (on) {
                    const cur = same.find(t => t.id === idOf(item)) || same[0];
                    if (cur) { cur.hidden = false; id = cur.id; }
                    else { id = idOf(item); list.push({id, name: i18n(item.name), icon: item.icon, kind: 'screen', target: item.target, intro: i18n('Ajouté depuis « ＋ Ajouter un onglet ».'), hidden: false}); }
                } else same.forEach(t => { t.hidden = true; }); // caché, pas effacé : on le retrouve coché ici
                if (A()?.saveCustomTabs) A().saveCustomTabs(list); else ls.put('genealogie-custom-tabs', JSON.stringify(list));
                if (on) toEnd(id);
            }
            paintPlus();
            const msg = on ? i18n('✓ Onglet « {name} » ajouté', {name: label(item)}) : i18n('Onglet « {name} » caché', {name: label(item)});
            if (A()?.undoToast) A().undoToast(msg, {undo: () => { restore(snap); refreshDialog(); }});
        }
        /** un de mes raccourcis hors catalogue : caché / remontré (rien n'est effacé) */
        function setOwnShown(id, on) {
            const snap = snapshot(), list = ownTabs().map(t => ({...t})), t = list.find(x => x.id === id); if (!t) return;
            t.hidden = !on;
            if (A()?.saveCustomTabs) A().saveCustomTabs(list); else ls.put('genealogie-custom-tabs', JSON.stringify(list));
            if (on) toEnd(id);
            paintPlus();
            const name = `${t.icon || ''} ${t.name || ''}`.trim();
            A()?.undoToast?.(on ? i18n('✓ Onglet « {name} » ajouté', {name}) : i18n('Onglet « {name} » caché', {name}), {undo: () => { restore(snap); refreshDialog(); }});
        }
        /** ＋ Une autre liste… / ＋ Un autre outil… : le menu de choix des raccourcis (recherche mêlée), réduit aux listes ou aux outils */
        const tabIdFor = target => { let h = 5381; for (const ch of String(target)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return 'ct_p' + h.toString(36) + String(target).length.toString(36); };
        const splitIcon = s => { const m = String(s || '').match(/^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s+(.+)$/u); return m ? [m[1], m[2]] : ['', String(s || '')]; };
        async function addMore(kind) {
            const sc = ext.shortcuts; if (!sc?.chooseTargets) { A()?.toast?.(i18n('La fenêtre n’est pas encore prête. Réessaie dans un instant.'), 'error'); return; }
            const lists = kind === 'list';
            const got = await sc.chooseTargets({eyebrow: i18n('MENU'), title: lists ? i18n('＋ Une liste dans le menu') : i18n('＋ Un outil dans le menu'), submitLabel: i18n('Ajouter au menu'),
                intro: lists ? i18n('Choisis une ou plusieurs listes : chacune devient un onglet au bout du menu.') : i18n('Choisis un ou plusieurs outils (un graphique, une page des Réglages, la retouche des photos…) : chacun devient un onglet au bout du menu.'),
                only: r => lists ? /^list:/.test(r.target) : /^(graph|stat|maint|tool):/.test(r.target)});
            if (!got?.length) return;
            const snap = snapshot(), list = ownTabs().map(t => ({...t})), names = [], ids = [];
            got.forEach(l => {
                const same = list.find(t => t.kind === 'screen' && t.target === l.target);
                if (same) { same.hidden = false; ids.push(same.id); names.push(`${same.icon || ''} ${same.name || ''}`.trim()); return; }
                const d = sc.describe ? sc.describe(l.target) : {}, [ic, base] = splitIcon(l.name || d.label || l.target);
                const id = tabIdFor(l.target), icon = ic || d.icon || (lists ? '📋' : '🛠️');
                list.push({id, name: base.slice(0, 60), icon, kind: 'screen', target: l.target, intro: i18n('Ajouté depuis « ＋ Ajouter un onglet ».'), hidden: false});
                ids.push(id); names.push(`${icon} ${base}`.trim());
            });
            if (A()?.saveCustomTabs) A().saveCustomTabs(list); else ls.put('genealogie-custom-tabs', JSON.stringify(list));
            ids.forEach(toEnd);
            paintPlus(); refreshDialog();
            const msg = names.length === 1 ? i18n('✓ Onglet « {name} » ajouté', {name: names[0]}) : i18n('✓ Onglets ajoutés au menu : {names}', {names: names.join(', ')});
            A()?.undoToast?.(msg, {undo: () => { restore(snap); refreshDialog(); }});
        }
        /** ⠿ l'ordre du menu changé dans la fenêtre : les onglets cachés gardent leur place */
        let orderChanged = false;
        function saveOrder(list) {
            const vis = [...list.querySelectorAll('.order-row[data-order-key]')].map(r => r.dataset.orderKey), set = new Set(vis), full = menuKeys();
            let i = 0; const next = full.map(k => (set.has(k) ? vis[i++] : k));
            if (next.join('|') === full.join('|')) return;
            const snap = snapshot();
            ls.put('genealogie-menu-order', JSON.stringify(next)); A()?.applyMenuOrder?.(); paintPlus(); orderChanged = true;
            list.querySelectorAll('.order-row .order-number').forEach((n, j) => { n.textContent = String(j + 1).padStart(2, '0'); });
            A()?.undoToast?.(i18n('Ordre du menu changé'), {undo: () => { restore(snap); refreshDialog(); }});
        }

        /* ── la fenêtre « ＋ Ajouter un onglet » ── */
        let dlgState = {filter: 'all', q: ''};
        let refreshDialog = () => {};
        const usageName = () => { const list = ext.premierLancement?.usages?.() || []; return usages().map(k => { const u = list.find(x => x.k === k); return u ? `${u.ic} ${i18n(u.short)}` : k; }).join(' · '); };
        function cardHtml(item, st) {
            const on = inMenu(item);
            const tags = [st === 'rec' ? `<span class="tp-tag is-rec">${esc(i18n('conseillé pour toi'))}</span>` : '', st === 'shown' ? `<span class="tp-tag is-shown">${esc(i18n('montré par ton usage'))}</span>` : '', item.pro ? `<span class="tp-tag is-pro">${esc(i18n('métier'))}</span>` : ''].join('');
            return `<label class="tp-card${on ? ' is-on' : ''}" data-tp-card="${esc(item.k)}"><input type="checkbox" data-tp-item="${esc(item.k)}" ${on ? 'checked' : ''}><span class="tp-ico" aria-hidden="true">${item.icon}</span><span class="tp-txt"><b>${esc(i18n(item.name))}</b><small>${esc(i18n(item.desc))}</small>${item.where ? `<small class="tp-where">${esc(i18n(item.where))}</small>` : ''}${tags ? `<span class="tp-tags">${tags}</span>` : ''}</span></label>`;
        }
        function ownCardHtml(t) {
            const on = !t.hidden, d = ext.shortcuts?.describe ? ext.shortcuts.describe(t.target) : null;
            return `<label class="tp-card is-own${on ? ' is-on' : ''}" data-tp-own-card="${esc(t.id)}"><input type="checkbox" data-tp-own="${esc(t.id)}" ${on ? 'checked' : ''}><span class="tp-ico" aria-hidden="true">${esc(t.icon || '🗂️')}</span><span class="tp-txt"><b>${esc(t.name || i18n('Mon onglet'))}</b>${d?.what ? `<small class="tp-where">${esc(i18n(d.what))}</small>` : ''}<span class="tp-tags"><span class="tp-tag is-own">${esc(i18n('mon onglet'))}</span></span></span></label>`;
        }
        /** ⠿ Ordre du menu : les onglets montrés, dans l'ordre du menu */
        function navButton(key) { const n = nav(); if (!n) return null; return /^ct_/.test(key) ? n.querySelector(`.nav-custom-tab[data-board="${key}"]`) : n.querySelector(`.nav-item[data-module="${key}"]:not([data-board])`); }
        function orderHtml() {
            const own = new Set(ownTabs().map(t => t.id));
            const rows = menuKeys().map(k => [k, navButton(k)]).filter(([, b]) => b && b.style.display !== 'none');
            const keys = rows.map(([k]) => k), grouped = ownGrouped(menuKeys()).filter(k => keys.includes(k)).join('|') === keys.join('|');
            return `<p class="ui-hint">${esc(i18n('Glisse ⠿ pour changer l’ordre des onglets du menu, ou prends ⠿ au clavier (Tab) puis Alt + ↑ / ↓. C’est le même ordre que dans Réglages → Menus.'))}</p>
                <div class="order-list tp-order" data-tp-order>${rows.map(([k, b], i) => { const txt = [...b.childNodes].filter(n => !(n.nodeType === 1 && n.tagName === 'SPAN')).map(n => n.textContent).join('').trim();
                    return `<div class="order-row${own.has(k) ? ' is-own' : ''}" data-order-key="${esc(k)}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(i + 1).padStart(2, '0')}</span><b>${esc(txt || k)}</b>${own.has(k) ? `<span class="tp-tag is-own">${esc(i18n('mon onglet'))}</span>` : ''}</div>`; }).join('')}</div>
                <label class="checkbox-line tp-own-last"><input type="checkbox" data-tp-own-last ${ownLast() ? 'checked' : ''}> ${esc(i18n('Mettre mes onglets à la fin du menu'))}</label>
                <p class="ui-hint">${esc(i18n('Un onglet que tu crées arrive au bout du menu ; l’ordre que tu as déjà réglé ne bouge pas.'))}</p>
                ${own.size && !grouped ? `<p><button type="button" class="button small secondary" data-tp-own-group>${esc(i18n('⤓ Regrouper mes onglets à la fin'))}</button></p>` : ''}`;
        }
        function bodyHtml() {
            const u = usages(), all = CATALOG.map(item => ({item, st: status(item, u)})).filter(x => x.st !== 'off');
            const f = dlgState.filter, q = dlgState.q;
            // mes raccourcis hors catalogue : regroupés à la fin de leur groupe (2 · listes, 3 · outils)
            const ownMatch = t => { const w = slug(q).trim(); return !w || w.split(/\s+/).every(x => slug(`${t.name} ${t.target}`).includes(x)); };
            const own = {2: extraOwn(2), 3: extraOwn(3)};
            const ownPick = g => (f === 'rec' ? [] : own[g].filter(t => ownMatch(t) && (f !== 'menu' || !t.hidden)));
            const rec = all.filter(x => x.st === 'rec'), shown = all.filter(x => inMenu(x.item)), ownOn = [...own[2], ...own[3]].filter(t => !t.hidden).length;
            const pick = all.filter(x => matches(x.item, q, i18n) && (f === 'rec' ? x.st === 'rec' : f === 'menu' ? inMenu(x.item) : true));
            const phone = win.matchMedia?.('(max-width: 640px)').matches;
            const more = g => (f === 'all' && g > 1 ? `<p class="tp-more"><button type="button" class="button small secondary" data-tp-more="${g === 2 ? 'list' : 'tool'}">${esc(g === 2 ? i18n('＋ Une autre liste…') : i18n('＋ Un autre outil…'))}</button></p>` : '');
            let groups;
            if (f === 'order') groups = orderHtml();
            else if (phone && f === 'all' && !q) {
                const r = pick.filter(x => x.st === 'rec'), rest = pick.filter(x => x.st !== 'rec');
                groups = `${r.length ? `<section class="tp-group"><h4>${esc(i18n('Conseillés pour toi'))}</h4><div class="tp-cards">${r.map(x => cardHtml(x.item, x.st)).join('')}</div></section>` : ''}<details class="tp-group tp-rest"><summary>${esc(i18n('Tout le reste ▾'))}</summary><div class="tp-cards">${rest.map(x => cardHtml(x.item, x.st)).join('')}${[...ownPick(2), ...ownPick(3)].map(ownCardHtml).join('')}</div>${more(2)}${more(3)}</details>`;
            } else groups = [1, 2, 3].map(g => { const xs = pick.filter(x => x.item.g === g), mine = g > 1 ? ownPick(g) : []; return xs.length || mine.length || (f === 'all' && g > 1) ? `<section class="tp-group" data-tp-group="${g}"><h4>${esc(`${g} · ${i18n(GROUPS[g][0])}`)}</h4>${GROUPS[g][1] ? `<p class="ui-hint">${esc(i18n(GROUPS[g][1]))}</p>` : ''}<div class="tp-cards">${xs.map(x => cardHtml(x.item, x.st)).join('')}${mine.map(ownCardHtml).join('')}</div>${more(g)}</section>` : ''; }).join('');
            return `<p class="tp-q">${esc(i18n('Qu’est-ce que tu veux avoir sous la main ?'))}</p>
                <p class="tp-usage">${esc(i18n('Ton usage : {u}', {u: usageName()}))} <button type="button" class="link-button" data-tp-usage>${esc(i18n('changer'))}</button></p>
                <label class="tp-search"${f === 'order' ? ' hidden' : ''}><span class="sr-only">${esc(i18n('Chercher un onglet'))}</span><input type="search" data-tp-q value="${esc(q)}" placeholder="${esc(i18n('🔍 Chercher un onglet… (courrier, acte, agenda)').replace(/^🔍\s*/u, ''))}" autocomplete="off"></label>
                <div class="segmented tp-filter" role="tablist">${[['all', i18n('Tous')], ['rec', i18n('Conseillés ({n})', {n: rec.length})], ['menu', i18n('Déjà dans le menu ({n})', {n: shown.length + ownOn})], ['order', i18n('⠿ Ordre du menu')]].map(([k, l]) => `<button type="button" role="tab" data-tp-filter="${k}" class="${f === k ? 'is-active' : ''}" aria-selected="${f === k}">${esc(l)}</button>`).join('')}</div>
                <div class="tp-list">${groups || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${esc(i18n('Aucun onglet ne correspond.'))}</span></p>`}</div>
                ${f === 'order' ? '' : `<p class="ui-hint">${esc(i18n('Une carte cochée = l’onglet est dans le menu. Cocher l’ajoute à la fin du menu ; décocher le cache (un raccourci est caché, pas effacé).'))}</p>`}
                <p><button type="button" class="link-button" data-tp-editor>${esc(i18n('↗ Faire un onglet à moi (Éditeur d’onglets)'))}</button></p>`;
        }
        function openCatalog() {
            if (kiosk() || simple()) return;
            dlgState = {filter: 'all', q: ''};
            const open = ext.openDialog; if (!open) return;
            const d = open({eyebrow: i18n('MENU'), title: i18n('＋ Ajouter un onglet'), wide: true, submitLabel: 'Fermer', onSubmit: () => true, body: `<div class="tp-cat" data-tp-cat>${bodyHtml()}</div>`,
                onOpen: dlg => {
                    const box = dlg.querySelector('[data-tp-cat]');
                    orderChanged = false;
                    const bindOrder = () => { const list = box.querySelector('[data-tp-order]'); if (!list || list.dataset.bound) return; list.dataset.bound = '1'; A()?.setupDragOrder?.(list); list.addEventListener('dragend', () => setTimeout(() => saveOrder(list), 0)); };
                    refreshDialog = () => { if (!dlg.isConnected) return; const q = box.querySelector('[data-tp-q]'), had = doc.activeElement === q, pos = q?.selectionStart; box.innerHTML = bodyHtml(); bindOrder(); if (had) { const n = box.querySelector('[data-tp-q]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } };
                    // Réglages → Menus ouvert derrière : redessiné à la fermeture, pour montrer le même ordre
                    dlg.addEventListener('close', () => { if (orderChanged && doc.getElementById('menu-order') && A()?.state?.module === 'maintenance') A().setModule('maintenance'); });
                    box.addEventListener('input', e => { if (e.target.matches('[data-tp-q]')) { dlgState.q = e.target.value; refreshDialog(); } dlg.dataset.dirty = ''; }); // tout s'applique tout de suite : rien à « enregistrer » en fermant
                    box.addEventListener('change', e => { dlg.dataset.dirty = '';
                        const o = e.target.closest('[data-tp-own]'); if (o) { setOwnShown(o.dataset.tpOwn, o.checked); refreshDialog(); return; }
                        if (e.target.closest('[data-tp-own-last]')) { setOwnLast(e.target.checked); refreshDialog(); return; }
                        const c = e.target.closest('[data-tp-item]'); if (!c) return; const item = CATALOG.find(x => x.k === c.dataset.tpItem); if (item) { setShown(item, c.checked); refreshDialog(); } });
                    box.addEventListener('click', e => {
                        const f = e.target.closest('[data-tp-filter]'); if (f) { dlgState.filter = f.dataset.tpFilter; return refreshDialog(); }
                        const mo = e.target.closest('[data-tp-more]'); if (mo) { addMore(mo.dataset.tpMore); return; }
                        if (e.target.closest('[data-tp-own-group]')) { const snap = snapshot(); ls.put('genealogie-menu-order', JSON.stringify(ownGrouped(menuKeys()))); A()?.applyMenuOrder?.(); paintPlus(); orderChanged = true; refreshDialog(); A()?.undoToast?.(i18n('Tes onglets sont regroupés à la fin du menu'), {undo: () => { restore(snap); refreshDialog(); }}); return; }
                        if (e.target.closest('[data-tp-editor]')) { dlg.close(); return A()?.openCustomScreen ? A().openCustomScreen('maint:tabs_editor') : (A().state.maintenanceTab = 'tabs_editor', A().setModule('maintenance')); }
                        if (e.target.closest('[data-tp-usage]')) { dlg.close(); A().state.maintenanceTab = 'nav_menus'; A().setModule('maintenance'); setTimeout(() => doc.getElementById('lc-usage')?.scrollIntoView({block: 'start'}), 900); }
                    });
                }});
            return d;
        }
        /** la case « Mettre mes onglets à la fin du menu » (fenêtre et Réglages → Menus), avec ↶ Annuler */
        function setOwnLast(on) {
            const prev = ls.raw('genealogie-menu-own-last');
            ls.put('genealogie-menu-own-last', on ? null : '0'); A()?.applyMenuOrder?.(); paintPlus();
            doc.querySelectorAll('[data-tp-own-last]').forEach(x => { x.checked = on; });
            A()?.undoToast?.(on ? i18n('Tes nouveaux onglets arrivent à la fin du menu') : i18n('Tes nouveaux onglets ne vont plus forcément à la fin du menu'), {undo: () => { ls.put('genealogie-menu-own-last', prev); A()?.applyMenuOrder?.(); paintPlus(); doc.querySelectorAll('[data-tp-own-last]').forEach(x => { x.checked = ownLast(); }); }});
        }

        /* ── le ＋ au bout du menu ── */
        function paintPlus() {
            const n = nav(); if (!n) return;
            let b = n.querySelector(':scope > .nav-add-tab');
            const show = plusOn() && !kiosk() && !simple() && win.GENEALOGY_READY !== false;
            if (!show) { b?.remove(); return; }
            if (!b) { b = doc.createElement('button'); b.type = 'button'; b.className = 'nav-add-tab'; b.dataset.tabPlus = ''; b.innerHTML = '<span aria-hidden="true">＋</span><b class="nav-add-txt"></b>'; }
            const t = i18n('Ajouter un onglet'); if (b.getAttribute('aria-label') !== t) { b.title = t; b.setAttribute('aria-label', t); b.querySelector('.nav-add-txt').textContent = i18n('＋ Ajouter un onglet').replace(/^＋\s*/, ''); }
            if (n.lastElementChild !== b) n.appendChild(b); // toujours le dernier (applyMenuOrder range les autres)
        }
        /* ── Réglages → Menus : le bouton, la case « Montrer le ＋ », « Retirer » sur les raccourcis ── */
        function paintSettings() {
            const list = doc.getElementById('menu-order'); if (!list) return;
            const panel = list.closest('section') || list.parentElement;
            if (!panel.querySelector('[data-tp-settings]')) {
                const bar = doc.createElement('div'); bar.className = 'tp-settings'; bar.dataset.tpSettings = '';
                bar.innerHTML = `<button type="button" class="button small" data-tab-plus>${esc(i18n('＋ Ajouter un onglet…'))}</button><label class="checkbox-line"><input type="checkbox" data-tp-plus-show ${plusOn() ? 'checked' : ''}> ${esc(i18n('Montrer le ＋ au bout du menu'))}</label><label class="checkbox-line"><input type="checkbox" data-tp-own-last ${ownLast() ? 'checked' : ''}> ${esc(i18n('Mettre mes onglets à la fin du menu'))}</label>`;
                const h = panel.querySelector('h3'); if (h) h.before(bar); else panel.prepend(bar);
            }
            const tabs = Object.fromEntries(ownTabs().map(t => [t.id, t]));
            list.querySelectorAll('.order-row[data-order-key^="ct_"]').forEach(row => {
                const t = tabs[row.dataset.orderKey]; if (!t || t.kind !== 'screen' || row.querySelector('[data-tp-remove]')) return;
                const b = doc.createElement('button'); b.type = 'button'; b.className = 'button small secondary tp-remove'; b.dataset.tpRemove = t.id; b.textContent = i18n('Retirer'); b.title = i18n('Retirer ce raccourci du menu (un onglet de l’app ne se retire pas : il se cache)');
                row.appendChild(b);
            });
        }
        doc.addEventListener('click', e => {
            const t = e.target; if (!t.closest) return;
            if (t.closest('[data-tab-plus]')) { e.preventDefault(); openCatalog(); return; }
            const rm = t.closest('[data-tp-remove]');
            if (rm) {
                e.preventDefault();
                const id = rm.dataset.tpRemove, snap = snapshot(), tab = ownTabs().find(x => x.id === id); if (!tab) return;
                const list = ownTabs().filter(x => x.id !== id);
                if (A()?.saveCustomTabs) A().saveCustomTabs(list); else ls.put('genealogie-custom-tabs', JSON.stringify(list));
                rm.closest('.order-row')?.remove();
                A()?.undoToast?.(i18n('Onglet « {name} » retiré du menu', {name: `${tab.icon || ''} ${tab.name || ''}`.trim()}), {undo: () => { restore(snap); if (A()?.state?.module === 'maintenance') A().setModule('maintenance'); }});
            }
        });
        doc.addEventListener('change', e => {
            const ol = e.target.closest?.('[data-tp-settings] [data-tp-own-last]'); if (ol) { setOwnLast(ol.checked); return; }
            const c = e.target.closest?.('[data-tp-plus-show]'); if (!c) return;
            const prev = ls.raw('genealogie-menu-plus');
            ls.put('genealogie-menu-plus', c.checked ? null : '0'); paintPlus();
            A()?.undoToast?.(c.checked ? i18n('Le ＋ est au bout du menu') : i18n('Le ＋ n’est plus au bout du menu'), {undo: () => { ls.put('genealogie-menu-plus', prev); paintPlus(); const x = doc.querySelector('[data-tp-plus-show]'); if (x) x.checked = plusOn(); }});
        });
        const start = () => {
            if (!nav() || !A()) return setTimeout(start, 200);
            paintPlus();
            new win.MutationObserver(() => paintPlus()).observe(nav(), {childList: true});
            const again = () => paintPlus();
            new win.MutationObserver(again).observe(doc.body, {attributes: true, attributeFilter: ['class']});
            new win.MutationObserver(again).observe(doc.documentElement, {attributes: true, attributeFilter: ['class', 'lang']});
            const ws = doc.getElementById('workspace'); let t = 0;
            if (ws) new win.MutationObserver(() => { clearTimeout(t); t = setTimeout(paintSettings, 60); }).observe(ws, {childList: true, subtree: true});
            win.addEventListener('storage', e => { if (/^genealogie-(menu|custom-tabs|usage)/.test(e.key || '')) paintPlus(); });
        };
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
        ext.tabsPlus = {open: openCatalog, catalog: () => CATALOG.map(x => ({...x})), status, inMenu, setShown: (k, on) => { const it = CATALOG.find(x => x.k === k); if (it) setShown(it, on); }, addMore, ownGrouped, tabIdFor};
    }
    return {CATALOG, USAGE_ORDER, GROUPS, status, idOf, matches, mount};
});
