/**
 * 🔎 « Poser une question en français », suite (serveur : lib/question_plus.php) :
 *  - les boutons de renvoi d'une réponse (« Ouvrir la fiche », « 🔍 Que manque-t-il ? », « 🌍 Où chercher ? », dossier ⚖️, 🗓 Ma semaine,
 *    ✅ Contrôle de la base) : ext.qpOpen(o), appelé par heritage-links.js ;
 *  - ⌘K : une question tapée dans la recherche rapide est reconnue dans le navigateur (sans serveur, mots entiers, sans accents),
 *    une ligne « 🔎 Poser la question : « … » » s'affiche tout de suite ; 400 ms après la dernière frappe, la réponse courte vient
 *    dans la ligne (« Petrus MAZAUD : 2 enfants ») avec « J'ai compris : … » en petit. Réglages → 🔎 Recherche : « Répondre aux
 *    questions dans la recherche rapide » (oui par défaut ; non = seulement la ligne « Poser la question »).
 * Chargé après app.js et heritage-links.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const KEY = 'genealogie-questions-rapides';

    /* ── réglage (une préférence de l'écran : rangée dans le navigateur) ── */
    const answersOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } };
    const setAnswers = on => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} };

    /* ── la détection d'une question (⌘K) ── */
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`´]/g, '\'');
    const FIRST = new Set(['qui', 'quel', 'quels', 'quelle', 'quelles', 'quand', 'ou', 'combien', 'comment', 'est-ce', 'pourquoi', 'mes', 'mon', 'ma', 'les', 'liste']);
    const KIN = new Set(['enfant', 'enfants', 'fils', 'fille', 'filles', 'frere', 'freres', 'soeur', 'soeurs', 'parents', 'pere', 'peres', 'mere', 'meres', 'cousin', 'cousins', 'cousine', 'cousines',
        'oncle', 'oncles', 'tante', 'tantes', 'neveu', 'neveux', 'niece', 'nieces', 'ancetres', 'aieux', 'descendants', 'descendance', 'epoux', 'epouse', 'femme', 'mari', 'conjoint', 'conjoints',
        'grands-parents', 'grand-pere', 'grand-mere', 'petits-enfants', 'petit-fils', 'petite-fille', 'arriere-grands-parents', 'heritiers', 'parrain', 'marraine', 'filleul', 'filleuls', 'gendre',
        'gendres', 'bru', 'brus', 'beaux-parents', 'belle-mere', 'beau-pere', 'beaux-freres', 'belles-soeurs', 'demi-freres', 'demi-soeurs', 'lien']);
    const EVENT = new Set(['ne', 'nee', 'nes', 'nees', 'mort', 'morte', 'morts', 'mortes', 'maries', 'mariee', 'mariees', 'decede', 'decedee', 'decedes', 'decedees', 'baptise', 'baptises', 'baptisee',
        'baptisees', 'inhumes', 'inhumees', 'enterres']);
    const AFTER_EVENT = /^(a|en|au|aux|dans|vers|avant|apres|entre|le|la|pendant|durant|depuis|\d{3,4})$/;
    /** vrai si le texte est une question en français (et pas un nom : « Combes », « Frère », « Lenfant » seuls ne comptent jamais) */
    function isQuestion(text) {
        const raw = String(text || '').trim();
        const t = fold(raw);
        const words = t.replace(/[?!.,;:«»"()]/g, ' ').split(/\s+/).filter(Boolean);
        if (words.length < 2) return false;
        if (/\?\s*$/.test(raw)) return true;
        if (FIRST.has(words[0].replace(/^(.*?)'.*$/, '$1'))) return true;
        for (let i = 0; i < words.length - 1; i++) {
            const w = words[i], next = words[i + 1];
            if (KIN.has(w) && (next === 'de' || next === 'du' || next === 'des' || /^d'/.test(next))) return true;
            if (EVENT.has(w) && AFTER_EVENT.test(next.replace(/^(a|l)'.*$/, '$1'))) return true;
        }
        if (/(^|\s)(le|la|les) plus(\s|$)/.test(t.replace(/'/g, ' ')) || /(^|\s)en moyenne(\s|$)/.test(t)) return true;
        return false;
    }

    /* ── la réponse courte d'une question (pour la ligne ⌘K) ; le texte est échappé par la liste de app.js ── */
    function shortAnswer(r) {
        if (!r) return null;
        const facts = r.facts || [];
        if ((r.homonyms || []).length > 1 && !r.count && facts.length && /laquelle/i.test(r.answer || '')) {
            return {label: `🔎 ${i18n('Plusieurs “{w}” : choisir…', {w: String(facts[0][1] || '')})}`, ask: true};
        }
        let label = String(r.answer || '').split(/(?<=[.!?])\s+/)[0].replace(/[.]\s*$/, '').trim();
        if (!label) label = window.LCNDA_I18N?.plural ? window.LCNDA_I18N.plural(Number(r.count) || 0, 'fiche trouvée', 'fiches trouvées') : `${Number(r.count) || 0} ${Number(r.count) > 1 ? 'fiches trouvées' : 'fiche trouvée'}`;
        if (label.length > 110) label = label.slice(0, 107).trimEnd() + '…';
        const u = (r.understood || []).filter(x => typeof x === 'string').join(' · ');
        return {label: `🔎 ${label}`, hint: u ? i18n('J’ai compris : {x}', {x: u.length > 120 ? u.slice(0, 117) + '…' : u}) : i18n('Question en français')};
    }
    function openQuestion(q) {
        const st = A().state;
        st.hQuestion = q; st.researchKind = 'question';
        if (st.module === 'recherche' && ext.question) { st.workspaceToken = (st.workspaceToken || 0) + 1; A().setModule('recherche'); return; }
        A().setModule('recherche');
    }
    let lastQ = '';
    // la vitesse : ask_question lit toute la base (≈ 60 à 160 ms pour 5 000 personnes, 230 à 510 ms pour 20 000, 1 à 2,2 s pour 100 000) ;
    // au-delà de 12 000 personnes, ou après deux réponses de plus de 300 ms, pas d'appel pendant la frappe : seulement « Poser la question »
    const BIG = 12000, SLOW_MS = 300;
    let slowCount = 0;
    const tooBig = () => Number(A()?.state?.bootstrap?.stats?.personnes || 0) > BIG || slowCount >= 2;
    const wait = ms => new Promise(res => setTimeout(res, ms));
    // app.js attend 150 ms avant d'appeler les fournisseurs : 250 ms de plus font les 400 ms sans frappe
    const PAUSE = 250;
    function provider(q) {
        const text = String(q || '').trim();
        lastQ = text;
        if (!isQuestion(text)) return [];
        const item = {label: `🔎 ${i18n('Poser la question : « {q} »', {q: text.length > 90 ? text.slice(0, 87) + '…' : text})}`, hint: i18n('Question en français'), question: true, go: () => openQuestion(text)};
        if (answersOn() && !tooBig()) {
            item.live = (async () => {
                await wait(PAUSE);
                if (lastQ !== text) return null; // une autre frappe entre-temps
                let r; const t0 = Date.now();
                try { r = await A().api('ask_question', {q: text}); } catch (_) { return null; } // pas comprise : la ligne reste « Poser la question »
                slowCount = Date.now() - t0 > SLOW_MS ? slowCount + 1 : 0;
                if (lastQ !== text) return null;
                return shortAnswer(r);
            })();
        }
        return [item];
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);

    /* ── les boutons de renvoi d'une réponse ── */
    function qpOpen(o) {
        if (!o || typeof o !== 'object') return;
        const app = A(), st = app.state, id = Number(o.id) || 0;
        switch (o.kind) {
            case 'person': if (id) { st.currentPersonId = id; app.setModule('personnes'); } return;
            case 'gaps': st.researchKind = 'gaps'; app.setModule('recherche'); return;
            case 'ou_chercher': if (ext.ouChercher?.openPerson) ext.ouChercher.openPerson(id); else { st.researchKind = 'ou_chercher'; app.setModule('recherche'); } return;
            case 'succ_case': ext.successoral?.openCase?.(id); return;
            case 'succ_list': ext.successoral?.openCase?.(0); return;
            case 'succ_new': if (ext.successoral?.openFor) ext.successoral.openFor(id); return;
            case 'semaine': if (ext.semaine?.openBig) ext.semaine.openBig(); else { st.dashboardPage = st.dashboardPage || ''; app.setModule('accueil'); } return;
            case 'controle': if (ext.openControle) ext.openControle({}); else { st.maintenanceTab = 'controle'; app.setModule('maintenance'); } return;
            default:
        }
    }
    ext.qpOpen = qpOpen;
    /** les boutons sous une réponse (le texte de chaque bouton vient du serveur : échappé ici) */
    ext.qpOpenHtml = (list, esc) => {
        const kiosk = document.body.classList.contains('is-kiosk');
        const ok = (list || []).filter(o => o && typeof o === 'object' && !(kiosk && String(o.kind || '').startsWith('succ')));
        return ok.length ? `<p class="h-question-open">${ok.map((o, i) => `<button type="button" class="button small secondary" data-h-question-open="${i}">${esc(o.label || '')}</button>`).join(' ')}</p>` : '';
    };

    /* ── Réglages → 🔎 Recherche : la case « Répondre aux questions dans la recherche rapide » ── */
    const baseSettings = ext.maintenance?.recherche_fr;
    if (baseSettings && !baseSettings.qpWrapped) {
        const wrapped = async token => {
            await baseSettings(token);
            const page = document.querySelector('#workspace .rfr-page');
            if (!page || page.querySelector('[data-qp-quick]')) return;
            const kiosk = document.body.classList.contains('is-kiosk');
            const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const box = document.createElement('section');
            box.className = 'maintenance-panel';
            box.innerHTML = `<h3>${esc(i18n('Questions dans la recherche rapide (⌘K)'))}</h3>
                <label class="ui-toggle"><input type="checkbox" data-qp-quick ${answersOn() ? 'checked' : ''} ${kiosk ? 'disabled' : ''}><i></i><span>${esc(i18n('Répondre aux questions dans la recherche rapide'))}<small class="muted"> — ${esc(i18n('« les enfants de Pierre Mazaud » : la réponse courte s’affiche dans la liste ; sinon seulement « Poser la question »'))}</small></span></label>`;
            const panels = page.querySelectorAll('.maintenance-panel');
            (panels[0] || page).insertAdjacentElement(panels[0] ? 'afterend' : 'beforeend', box);
            box.querySelector('[data-qp-quick]').addEventListener('change', e => { setAnswers(e.target.checked); A().toast?.(i18n('Réglage enregistré.'), 'success'); });
        };
        wrapped.qpWrapped = true;
        ext.maintenance.recherche_fr = wrapped;
    }

    ext.questionsPlus = {isQuestion, shortAnswer, provider, answersOn, setAnswers, openQuestion, tooBig, BIG}; // pour les tests
})();
