/* LCNDA — ⚖️ Successoral, quinze outils de plus : calculs sans écran (window.LCNDA_SUCC_P2 ; aussi require() dans Node).
 * Maquette validée : docs/design/successoral-plus-2.html. Écrans : heritage-successoral-plus2.js et -plus2b.js ; serveur :
 * lib/successoral_plus2.php et lib/successoral_factures.php ; essais : tests/test-successoral-plus2*.js.
 *  SPEC : chaque décision de la maquette est un réglage (successoral.json, « p2 ») ; l'option conseillée est la valeur par
 *         défaut, les autres options restent choisissables ; une phrase d'aide par réglage ;
 *  🧾 totaux d'une facture en centimes entiers (comme le serveur) ; le taux est tapé, jamais deviné ;
 *  💶 fonds : reste dû = reçu − commission − frais − reversé ; commission proposée = % du contrat × reçu (modifiable) ;
 *  🔗 double preuve : les pièces de chaque maillon (sources distinctes, dossier de preuve « prouvé », « une pièce me suffit ») ;
 *  📮 une lettre par service (actes manquants regroupés par commune de l'acte) ; numéro de recommandé ;
 *  🗓 rappels J−30 / J−7 / J−1 ; 🙈 écran partagé (initiales ou numéros, montants masqués) ;
 *  📋 questionnaire hors ligne (page .html autonome, réponses en .json avec somme de contrôle SHA-256) ;
 *  🤝 copie pour le notaire chiffrée dans le navigateur (PBKDF2-SHA256 + AES-256-GCM), page qui se déchiffre seule.
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root) root.LCNDA_SUCC_P2 = m;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════ Les réglages : un groupe par outil, l'option conseillée d'abord (= par défaut) ═════ */
    const SPEC = [
        // 🗂 la disposition des onglets d'un dossier (maquette docs/design/dossier-et-transcriptions.html, A) : un menu de choix unique
        {tool: '🗂 Onglets d’un dossier', items: [
            {key: 'tabs_layout', def: 'line', select: true, options: [['line', 'Une ligne, le reste dans « Plus ▾ »'], ['families', 'Par familles (deux lignes)'], ['side', 'Une colonne à gauche']], help: 'Comment ranger les onglets d’un dossier. Les compteurs restent visibles (Pièces 1 / 2, Contactés 2 / 6…).'}]},
        {tool: '⚰️ Décès d’un héritier', items: [
            {key: 'insee_write', def: 'both', options: [['both', 'Le décès sur la fiche et le statut du dossier'], ['case', 'Seulement le statut du dossier']], help: 'Ce que « ✓ C’est lui » écrit : la fiche sert aussi aux autres dossiers.'},
            {key: 'insee_threshold', def: 40, options: [[40, '40'], [60, '60']], custom: [1, 100], help: 'Les pistes sont montrées à partir de ce score (sur 100). Plus haut : moins de bruit, risque d’en rater.'},
            {key: 'insee_auto', def: 'auto', options: [['auto', 'Automatique, dans la cloche'], ['manual', 'Seulement à la main']], help: 'Après chaque nouvel import du fichier INSEE : vérifier les dossiers en cours tout seul (jamais de changement sans ton clic).'}]},
        {tool: '📋 Questionnaire', items: [
            {key: 'q_format', def: 'json', options: [['json', 'Un petit fichier .json'], ['html', 'La page .html remplie']], help: 'Ce que l’héritier te renvoie après avoir rempli le questionnaire.'},
            {key: 'q_prefill', def: 'yes', options: [['yes', 'Pré-rempli (ce qui le concerne)'], ['no', 'Tout vide']], help: 'Pré-rempli : son nom et sa naissance seulement, jamais le défunt ni un montant.'}]},
        {tool: '📞 Échanges', items: [
            {key: 'calls_place', def: 'tab', options: [['tab', 'Un onglet du dossier et un raccourci dans 👥 Héritiers'], ['heirs', 'Seulement dans 👥 Héritiers']], help: 'Où noter et relire les appels, courriels et visites.'},
            {key: 'calls_mail', def: 'grey', options: [['grey', 'Montrés en gris, en lecture'], ['hidden', 'Pas montrés']], help: 'Les courriers du Registre dans la liste des échanges.'}]},
        {tool: '📮 Recommandés', items: [
            {key: 'rec_relance', def: 15, options: [[15, '15 jours'], [8, '8 jours'], [21, '21 jours']], custom: [1, 120], help: 'Relance quand l’accusé de réception n’est pas revenu (réglable aussi pour chaque courrier).'},
            {key: 'rec_link', def: 'yes', options: [['yes', 'Lien vers la page de suivi'], ['no', 'Pas de lien (on copie le numéro)']], help: 'L’app n’interroge jamais La Poste : le lien ouvre la page dans ton navigateur, tu notes toi-même l’AR.'},
            {key: 'rec_url', def: 'https://www.laposte.fr/outils/suivre-vos-envois?code={numero}', text: true, help: 'Adresse de la page de suivi, avec {numero} (https:// seulement).'}]},
        {tool: '🧾 Devis et factures', items: [
            {key: 'inv_register', def: 'cabinet', options: [['cabinet', 'Un seul registre pour le cabinet'], ['genealogy', 'Dans la généalogie des dossiers']], help: 'Un seul registre : numérotation continue même si les dossiers sont dans plusieurs généalogies. Passer de l’un à l’autre repartirait d’un autre compteur (numéros en double) : ce choix est bloqué dès la première facture émise.'},
            {key: 'inv_numbering', def: 'yearly', options: [['yearly', 'F-2026-0042 (remis à 1 chaque année)'], ['single', 'Compteur unique (F-0042)']], help: 'Le compteur ne recule jamais ; un brouillon effacé ne consomme pas de numéro. Bloqué dès la première facture émise.'},
            {key: 'inv_time', def: 'unchecked', options: [['unchecked', 'Temps décoché quand il y a une commission'], ['checked', 'Temps toujours coché']], help: 'La ligne « temps passé » proposée sur la facture.'},
            {key: 'inv_prefix_f', def: 'F', prefix: true, help: 'Préfixe des factures.'}, {key: 'inv_prefix_a', def: 'A', prefix: true, help: 'Préfixe des avoirs.'}, {key: 'inv_prefix_d', def: 'D', prefix: true, help: 'Préfixe des devis.'}]},
        {tool: '📈 Activité', items: [
            {key: 'act_period', def: 'year', options: [['year', 'L’année en cours'], ['12m', 'Les 12 derniers mois']], help: 'La période montrée en ouvrant le tableau de bord.'},
            {key: 'act_amounts', def: 'ttc', options: [['ttc', 'TTC'], ['ht', 'HT'], ['choice', 'Au choix (bouton)']], help: 'Les montants facturés et encaissés.'}]},
        {tool: '🤝 Copie pour le notaire', items: [
            {key: 'nc_password', def: 'yes', options: [['yes', 'Mot de passe coché au départ'], ['no', 'Décoché au départ']], help: 'La copie contient des actes et des noms de vivants.'},
            {key: 'nc_addresses', def: 'no', options: [['no', 'Adresses décochées au départ'], ['yes', 'Cochées au départ']], help: 'Le notaire reçoit souvent les adresses à part.'}]},
        {tool: '🗺 Carte des héritiers', items: [
            {key: 'map_precision', def: 'commune', options: [['commune', 'La commune'], ['ban', 'Le numéro de rue (BAN déjà téléchargée)']], help: 'Rien n’est envoyé en ligne : la commune vient de la base ; le numéro, seulement si la BAN du département est déjà dans l’app (🗺️ Plan des adresses).'},
            {key: 'map_notaries', def: 'known', options: [['known', 'Les notaires de tes dossiers et contacts'], ['none', 'Pas de notaires']], help: 'L’app n’a pas d’annuaire des notaires et n’en invente pas.'}]},
        {tool: '📝 Contrat', items: [
            {key: 'contract_builtin', def: 'removed', options: [['removed', 'Retiré : page vide avec les champs'], ['example', 'Gardé, marqué « exemple non juridique »']], help: 'Le brouillon de contrat écrit par l’app. Un contrat t’engage : fais-le écrire ou relire par ton conseil.'},
            {key: 'contract_versions', def: 'all', options: [['all', 'Toutes les versions gardées'], ['last', 'Seulement la dernière']], help: 'Chaque contrat rangé retient la version utilisée.'}]},
        {tool: '💶 Fonds', items: [
            {key: 'funds_commission', def: 'calc', options: [['calc', 'Calculée puis modifiable'], ['manual', 'Toujours tapée à la main']], help: 'Commission = % du contrat × montant reçu.'},
            {key: 'funds_print', def: 'print', options: [['print', 'Décompte imprimable'], ['screen', 'Écran seulement']], help: 'Le décompte à l’héritier.'}]},
        {tool: '🔗 Double preuve', items: [
            {key: 'proof_min', def: '2', options: [['2', 'Deux pièces par lien'], ['1', 'Une seule (signaler seulement « aucune »)']], help: 'Le seuil d’un lien solide.'},
            {key: 'proof_block', def: 'review', options: [['review', '« À revoir » (n’empêche rien)'], ['block', 'Bloquant']], help: 'Dans la liste « avant de remettre ».'}]},
        {tool: '🗓 Dates importantes', items: [
            {key: 'dates_reminders', def: '30,7,1', options: [['30,7,1', 'J−30, J−7, J−1'], ['7', 'J−7 seulement']], help: 'Les rappels proposés pour une nouvelle date (réglables pour chaque date). L’app ne calcule aucun délai légal.'},
            {key: 'dates_place', def: 'same', options: [['same', 'Dans les échéances, avec un drapeau 🗓'], ['apart', 'Un bloc à part']], help: 'Où les voir dans 📁 Dossier.'}]},
        {tool: '👥 Fusion de dossiers', items: [
            {key: 'merge_mode', def: 'two', options: [['two', 'Deux défunts, deux calculs côte à côte'], ['linked', 'Dossiers liés (recherches en commun)']], help: 'Les successions restent distinctes : le calcul n’est jamais mélangé.'},
            {key: 'merge_undo', def: '30d', options: [['30d', '↶ pendant 30 jours'], ['untouched', '↶ tant que rien n’a été ajouté']], help: 'Combien de temps la fusion peut être annulée.'}]},
        {tool: '🕵️ Recherches', items: [
            {key: 'research_join', def: 'no', options: [['no', 'Décoché au départ'], ['yes', 'Coché au départ']], help: 'Joindre les recherches faites au dossier du notaire.'}]},
        {tool: '📦 Archive', items: [
            {key: 'archive_password', def: 'proposed', options: [['proposed', 'Proposé, coché'], ['required', 'Obligatoire'], ['none', 'Pas proposé']], help: 'Le mot de passe de l’archive de fin de dossier. Oublié = archive perdue.'}]},
        {tool: '💡 Autres idées', items: [
            {key: 'linked_attach', def: 'descendants', options: [['descendants', 'Ses descendants rattachés'], ['none', 'Dossier vide']], help: '🔗 Le dossier lié d’un héritier mort après le défunt.'},
            {key: 'group_scope', def: 'missing', options: [['missing', 'Les actes manquants'], ['missing_asked', 'Manquants et déjà demandés']], help: '📮 Une lettre par service : quels actes.'},
            {key: 'delay_stat', def: 'mean', options: [['mean', 'Moyenne'], ['median', 'Médiane']], help: '⏳ Délai de réponse par organisme.'},
            {key: 'delay_min', def: 3, options: [[3, '3'], [2, '2'], [5, '5']], custom: [1, 20], help: '⏳ Nombre de courriers avant de donner un délai.'},
            {key: 'validity_warn', def: 15, options: [[15, '15 jours'], [7, '7 jours'], [30, '30 jours']], custom: [1, 120], help: '📅 La cloche prévient avant qu’une copie d’acte soit trop ancienne (durée tapée par toi pour chaque pièce).'},
            {key: 'share_names', def: 'initials', options: [['initials', 'Initiales'], ['numbers', 'Numéros (Héritier 1, 2…)']], help: '🙈 Écran partagé : ce qui remplace les noms.'},
            {key: 'share_amounts', def: 'yes', options: [['yes', 'Montants masqués'], ['no', 'Montants visibles']], help: '🙈 Écran partagé : les montants.'}]},
    ];
    const DEFAULTS = Object.fromEntries(SPEC.flatMap(g => g.items.map(i => [i.key, i.def])));
    const settings = s => ({...DEFAULTS, ...(s && typeof s === 'object' ? s : {})});

    /* ═════ 🧾 Factures : centimes entiers, arrondi au centime (la moitié s'éloigne de zéro) ═════ */
    const div = (a, b) => { const q = Math.floor((Math.abs(a) * 2 + b) / (2 * b)); return a < 0 ? -q : q; };
    /** « 20 », « 5,5 », « 0 » → points de base (2000, 550, 0) ; null : pas un taux */
    function rate(t) { const s = String(t ?? '').replace(',', '.').replace(/[%\s]/g, ''); if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null; const bp = Math.round(Number(s) * 100); return bp <= 10000 ? bp : null; }
    function totals(lines, bp) {
        let ht = 0; const out = (lines || []).map(l => { const q = Math.round(Number(String(l.qty ?? 1).replace(',', '.')) * 1000); const t = div(q * Number(l.unit_cents || 0), 1000); ht += t; return {...l, total_cents: t}; });
        const vat = bp == null ? 0 : div(ht * bp, 10000);
        return {lines: out, ht, vat, ttc: ht + vat};
    }
    /** « 1 234,56 » → 123456 (centimes) ; null si ce n'est pas un montant */
    function cents(text) {
        let s = String(text ?? '').replace(/[\s  ']/g, '').replace(/€$/, '');
        if (!s) return null;
        const neg = /^[-−]/.test(s); s = s.replace(/^[-−+]/, '');
        if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/\.\d{1,2}$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(/[.,]/g, '');
        if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
        const [a, b = ''] = s.split('.'); const v = Number(a) * 100 + Number((b + '00').slice(0, 2));
        return Number.isSafeInteger(v) ? (neg ? -v : v) : null;
    }
    const money = (c, group = ' ', dec = ',') => { const n = Math.abs(Math.round(c)); return `${c < 0 ? '−' : ''}${String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, group)}${dec}${String(n % 100).padStart(2, '0')}`; };

    /* ═════ 💶 Fonds par héritier (aucun actif net : seulement des mouvements tapés) ═════ */
    function commission(recuCents, percent) { const p = Number(String(percent ?? '').replace(',', '.')); if (!Number.isFinite(p) || p < 0) return 0; return div(Math.round(recuCents * p * 100), 10000); }
    function funds(rows) {
        const by = {};
        for (const r of rows || []) { const x = by[r.person_id] = by[r.person_id] || {recu: 0, commission: 0, frais: 0, reverse: 0, lines: []}; if (x[r.sens] != null) x[r.sens] += Number(r.cents) || 0; x.lines.push(r); }
        for (const x of Object.values(by)) { x.rest = x.recu - x.commission - x.frais - x.reverse; x.over = x.rest < 0; x.settled = x.recu > 0 && x.rest === 0; }
        return by;
    }

    /* ═════ 🔗 Double preuve : combien de pièces prouvent chaque maillon ═════ */
    /**
     * Un maillon = une naissance (filiation : l'enfant de ses parents), un mariage, un décès d'un représenté… de la chaîne de chaque
     * héritier (P.list du moteur). Une « pièce » = une source citée sur l'acte (deux copies du même acte = une) ; un dossier de
     * preuve « prouvé » sur ce lien compte pour une de plus ; « ✓ Une pièce me suffit ici » (retenu avec la date) le rend bon.
     */
    function proofLinks(D, R, P, {min = 2, t = s => s} = {}) {
        const heirs = (R?.rows || []).filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const who = key => heirs.filter(h => (P?.perHeir?.[h.id] || []).includes(key) || (P?.groups || []).some(g => g.key === 'common' && g.items.some(i => i.key === key))).map(h => h.name);
        const proved = (D?.p2?.proofs || []);
        const okOne = D?.p2?.one_piece_ok || {};
        const out = [];
        for (const it of P?.list || []) {
            if (it.state === 'na' || it.kind !== 'N') continue;
            const src = [...new Set((D?.acts?.[it.key]?.sources || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))];
            let n = src.length; if (!n && it.state === 'have') n = 1; // en main sans cote notée : une pièce
            const pid = Number(it.person_id);
            const parents = (D?.graph?.parents || []).filter(l => Number(l.child) === pid).map(l => Number(l.parent));
            const pc = proved.some(x => Number(x.child) === pid && (!x.parent || parents.includes(Number(x.parent)))); if (pc) n++;
            const one = okOne[it.key] || null;
            const level = n >= min || (one && n >= 1) ? 'ok' : n === 0 ? 'none' : 'one';
            out.push({key: it.key, what: it.what, n, sources: D?.acts?.[it.key]?.sources || [], proof: pc, one, level, heirs: who(it.key), state: it.state});
        }
        const order = {none: 0, one: 1, ok: 2};
        out.sort((a, b) => order[a.level] - order[b.level]);
        return {links: out, none: out.filter(x => x.level === 'none').length, one: out.filter(x => x.level === 'one').length, ok: out.filter(x => x.level === 'ok').length};
    }
    /** l'élément ajouté à la liste « avant de remettre » : à revoir (n'empêche rien) ou bloquant (réglage) */
    function proofCheck(pl, {block = false, min = 2, t = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))} = {}) {
        const bad = pl.links.filter(x => x.level === 'none' || (min >= 2 && x.level === 'one'));
        if (!bad.length) return {key: 'proof', level: 'ok', text: t('Chaque lien a assez de pièces'), detail: '', go: 'pieces', block: false};
        return {key: 'proof', level: block ? 'miss' : 'warn', text: t('Liens avec trop peu de pièces : {n}', {n: bad.length}), detail: bad.slice(0, 5).map(x => x.what).join(' ; '), go: 'pieces', block};
    }

    /* ═════ 📮 Une lettre par service : les actes manquants regroupés par commune de l'acte ═════ */
    function groupMissing(D, P, {scope = 'missing', t = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))} = {}) {
        const groups = new Map();
        for (const it of P?.list || []) {
            if (!(it.state === 'missing' || (scope === 'missing_asked' && it.state === 'asked'))) continue;
            const a = D?.acts?.[it.key];
            const place = String(a?.place || '').split(/[,(]/)[0].trim();
            const service = place ? t('Mairie de {p}', {p: place}) : t('Service à préciser');
            const g = groups.get(service) || {service, place, keys: [], items: []};
            g.keys.push(it.key); g.items.push(it); groups.set(service, g);
        }
        return [...groups.values()].sort((a, b) => b.keys.length - a.keys.length || a.service.localeCompare(b.service));
    }

    /* ═════ 📮 Le numéro d'un recommandé : lettres et chiffres, 13 caractères (sinon « inhabituel », gardé tel quel) ═════ */
    const recNumOk = n => /^[A-Z0-9]{13}$/.test(String(n || '').replace(/\s+/g, '').toUpperCase());
    const trackUrl = (tpl, n) => { const u = String(tpl || ''); if (!/^https:\/\/[a-z0-9.-]+(\/[^\s<>"]*)?$/i.test(u) || !u.includes('{numero}')) return ''; return u.replace('{numero}', encodeURIComponent(String(n || '').replace(/\s+/g, ''))); };

    /* ═════ 🗓 Les rappels d'une date importante ═════ */
    const dayN = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
    const isoOf = n => { const d = new Date(n * 864e5); return d.toISOString().slice(0, 10); };
    function reminders(due, rem, seen = '', today) {
        const d = dayN(due), t = dayN(today); if (d == null || t == null) return null;
        const days = d - t; if (days < 0) return {late: true, days};
        const s = String(seen).split(',').filter(Boolean).map(Number);
        const js = String(rem || '').split(',').filter(x => x !== '').map(Number).filter(x => x >= 0).sort((a, b) => b - a);
        const next = js.filter(j => days <= j && !s.includes(j)).sort((a, b) => a - b)[0];
        return {late: false, days, list: js.map(j => ({j, day: isoOf(d - j)})), now: next ?? null};
    }

    /* ═════ 🙈 Écran partagé ═════ */
    function maskName(name, mode = 'initials', n = 1) {
        if (mode === 'numbers') return `#${n}`;
        const w = String(name || '').trim().split(/[\s-]+/).filter(Boolean);
        return w.length ? w.map(x => x[0].toLocaleUpperCase() + '.').join(' ') : '…';
    }
    const AMOUNT_RE = /(?:[−-]\s?)?\d{1,3}(?:[\s  .,]\d{3})*(?:[.,]\d{1,2})?\s?€|€\s?\d[\d\s  .,]*/g;
    const maskAmounts = s => String(s).replace(AMOUNT_RE, '••• €');

    /* ═════ 📋 Questionnaire hors ligne ═════ */
    /** la même somme que le serveur : SHA-256 de « identifiant|réponses en JSON » */
    async function qSum(token, answers) {
        const data = new TextEncoder().encode(`${token}|${JSON.stringify(answers)}`);
        const c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : require('node:crypto').webcrypto;
        const h = await c.subtle.digest('SHA-256', data);
        return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    /**
     * La page que l'héritier ouvre d'un double-clic, sans internet : ses réponses restent sur son appareil tant qu'il n'envoie rien.
     * « ⤓ Enregistrer mes réponses » → un .json (ou la page .html remplie, réglage) avec l'identifiant et la somme de contrôle.
     * T : les textes déjà traduits ; item : {token, number, prefill, fields, question} ; jamais le nom du défunt ni un montant.
     */
    function questionnaireHtml(item, T, {format = 'json', cabinet = '', lang = 'fr'} = {}) {
        const f = new Set(item.fields || []), p = item.prefill || {};
        const field = (name, label, value = '', type = 'text') => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}"></label>`;
        const sec = (n, title, body) => `<fieldset><legend>${n} · ${esc(title)}</legend>${body}</fieldset>`;
        let n = 0;
        const parts = [];
        if (f.has('civil')) parts.push(sec(++n, T.you, field('last', T.last, p.last) + field('first', T.first, p.first) + field('birth', T.birth, p.birth) + field('birth_place', T.birthPlace, p.birth_place)));
        if (f.has('spouses')) parts.push(sec(++n, T.spouses, `<div data-rep="spouses">${[0, 1].map(i => `<div class="rep">${field(`spouses.${i}.name`, T.name)}${field(`spouses.${i}.date`, T.marriage)}${field(`spouses.${i}.place`, T.place)}</div>`).join('')}</div>`));
        if (f.has('children')) parts.push(sec(++n, T.children, `<div data-rep="children">${[0, 1, 2, 3].map(i => `<div class="rep">${field(`children.${i}.name`, T.name)}${field(`children.${i}.birth`, T.birth)}<label class="ck"><input type="checkbox" name="children.${i}.dead"> ${esc(T.dead)}</label></div>`).join('')}</div>`));
        if (f.has('contact')) parts.push(sec(++n, T.contact, field('address', T.address) + field('postal_code', T.postal) + field('city', T.city) + field('phone', T.phone, '', 'tel') + field('email', T.email, '', 'email')));
        if (f.has('family')) parts.push(sec(++n, T.family, `<label>${esc(T.familyHint)}<textarea name="family" rows="4"></textarea></label>`));
        if (f.has('documents')) parts.push(sec(++n, T.documents, T.docList.map((d, i) => `<label class="ck"><input type="checkbox" name="documents.${i}" value="${esc(d)}"> ${esc(d)}</label>`).join('') + field('documents.other', T.other)));
        if (f.has('question') && item.question) parts.push(sec(++n, T.question, `<p>${esc(item.question)}</p><textarea name="question" rows="4"></textarea>`));
        const data = JSON.stringify({token: item.token, number: item.number, format}).replace(/</g, '\\u003c');
        return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(T.title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#1d1d1f;background:#fff}h1{font-size:20px}fieldset{border:1px solid #ccc;border-radius:10px;margin:0 0 14px;padding:10px 12px}legend{font-weight:700}label{display:block;margin:6px 0}input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #bbb;border-radius:8px}label.ck{display:flex;gap:8px;align-items:center}label.ck input{width:auto}.rep{border-top:1px dashed #ddd;padding-top:4px}button{font:inherit;font-weight:700;padding:10px 16px;border-radius:10px;border:0;background:#2b5bd7;color:#fff;width:100%}.muted{color:#666;font-size:14px}@media (prefers-color-scheme:dark){body{background:#151517;color:#eee}input,textarea{background:#222;color:#eee;border-color:#555}fieldset{border-color:#444}.muted{color:#aaa}}</style></head>
<body><h1>📋 ${esc(T.title)}</h1><p><b>${esc(cabinet)}</b><br><span class="muted">${esc(T.about)} · ${esc(T.file)} ${esc(item.number)}</span></p>
<form id="q">${parts.join('')}<p class="muted">${esc(T.privacy)}</p><button type="button" id="save">⤓ ${esc(T.save)}</button></form>
<script type="application/json" id="q-meta">${data}</script>
<script>(function(){var meta=JSON.parse(document.getElementById('q-meta').textContent);var form=document.getElementById('q');
function read(){var a={},docs=[];form.querySelectorAll('input,textarea').forEach(function(el){var n=el.name;if(!n)return;if(n.indexOf('documents.')===0){if(n==='documents.other'){if(el.value.trim())docs.push(el.value.trim());}else if(el.checked)docs.push(el.value);return;}
var m=n.match(/^(spouses|children)\\.(\\d+)\\.(\\w+)$/);if(m){a[m[1]]=a[m[1]]||[];var o=a[m[1]][+m[2]]=a[m[1]][+m[2]]||{};o[m[3]]=el.type==='checkbox'?(el.checked?'1':''):el.value.trim();return;}a[n]=el.value.trim();});
['spouses','children'].forEach(function(k){if(a[k])a[k]=a[k].filter(function(o){return o&&o.name;});});a.documents=docs;return a;}
function hex(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return('0'+x.toString(16)).slice(-2);}).join('');}
document.getElementById('save').addEventListener('click',function(){var a=read();crypto.subtle.digest('SHA-256',new TextEncoder().encode(meta.token+'|'+JSON.stringify(a))).then(function(h){
var out={format:'lcnda-succ-questionnaire',version:1,token:meta.token,number:meta.number,answers:a,sum:hex(h)};var blob,name;
if(meta.format==='html'){var d=document.documentElement.cloneNode(true);var s=d.querySelector('#q-answers');if(s)s.remove();var sc=document.createElement('script');sc.type='application/json';sc.id='q-answers';sc.textContent=JSON.stringify(out).replace(/</g,'\\\\u003c');d.querySelector('body').appendChild(sc);blob=new Blob(['<!doctype html>'+d.outerHTML],{type:'text/html'});name='reponses-'+meta.number+'.html';}
else{blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});name='reponses-'+meta.number+'.json';}
var l=document.createElement('a');l.href=URL.createObjectURL(blob);l.download=name;document.body.appendChild(l);l.click();l.remove();});});})();</script></body></html>`;
    }
    /** lire un fichier de réponses : .json, ou la page .html remplie (le bloc « q-answers ») */
    function readAnswers(text) {
        const s = String(text || '').trim();
        try {
            if (s.startsWith('{')) return JSON.parse(s);
            const m = s.match(/<script type="application\/json" id="q-answers">([\s\S]*?)<\/script>/);
            if (m) return JSON.parse(m[1].replace(/\\u003c/g, '<'));
        } catch (_) {}
        return null;
    }

    /* ═════ 🤝 Copie pour le notaire : chiffrée dans le navigateur, page qui se déchiffre seule (sans internet) ═════ */
    const subtle = () => ((typeof crypto !== 'undefined' && crypto.subtle) ? crypto : require('node:crypto').webcrypto);
    const b64 = u8 => { let s = ''; const a = new Uint8Array(u8); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
    const ITER = 310000;
    async function encrypt(text, password) {
        const c = subtle(), salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
        const base = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await c.subtle.deriveKey({name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
        const ct = await c.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(text));
        return {v: 1, kdf: 'pbkdf2-sha256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct)};
    }
    async function decrypt(env, password) {
        const c = subtle(), dec = s => Uint8Array.from(typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'), ch => ch.charCodeAt(0));
        const base = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await c.subtle.deriveKey({name: 'PBKDF2', salt: dec(env.salt), iterations: env.iter, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
        return new TextDecoder().decode(await c.subtle.decrypt({name: 'AES-GCM', iv: dec(env.iv)}, key, dec(env.data)));
    }
    /** la page du notaire : onglets Héritiers · Arbre · Filiation · Pièces · (Recherches) ; inner = HTML déjà échappé par l'app */
    function notaryPage({title, foot, tabs, lang = 'fr', T}) {
        const body = `<nav>${tabs.map((x, i) => `<button type="button" data-t="${i}"${i ? '' : ' class="on"'}>${esc(x.label)}</button>`).join('')}</nav>${tabs.map((x, i) => `<section data-s="${i}"${i ? ' hidden' : ''}>${x.html}</section>`).join('')}<footer>${esc(foot)}</footer>`;
        return {body, wrap: inner => `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.45 Georgia,serif;margin:0 auto;max-width:980px;padding:14px;color:#1d1d1f;background:#fff}h1{font:700 18px system-ui,sans-serif}nav{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}nav button{font:600 14px system-ui;padding:6px 12px;border-radius:999px;border:1px solid #bbb;background:#fff;color:inherit}nav button.on{background:#2b5bd7;color:#fff;border-color:#2b5bd7}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}img,svg{max-width:100%;height:auto}footer{margin-top:20px;color:#666;font:13px system-ui}.lock{max-width:360px;margin:40px auto;font:15px system-ui}.lock input{width:100%;font:inherit;padding:8px;box-sizing:border-box}.lock button{margin-top:8px;font:inherit;padding:8px 14px}@media (prefers-color-scheme:dark){body{background:#151517;color:#eee}nav button{background:#222}td,th{border-color:#333}}</style></head>
<body><h1>${esc(title)}</h1>${inner}<script>document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('nav button');if(!b)return;document.querySelectorAll('nav button').forEach(function(x){x.classList.toggle('on',x===b);});document.querySelectorAll('section[data-s]').forEach(function(s){s.hidden=s.getAttribute('data-s')!==b.getAttribute('data-t');});});</script></body></html>`,
        lockScript: env => `<div class="lock" id="lock"><p>🔒 ${esc(T.locked)}</p><input type="password" id="pw" autocomplete="off" aria-label="${esc(T.password)}"><button type="button" id="go">${esc(T.open)}</button><p id="err" hidden>${esc(T.wrong)}</p></div><div id="out"></div>
<script type="application/json" id="env">${JSON.stringify(env)}</script><script>(function(){var env=JSON.parse(document.getElementById('env').textContent);function d(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0);});}
function go(){var pw=document.getElementById('pw').value;crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']).then(function(b){return crypto.subtle.deriveKey({name:'PBKDF2',salt:d(env.salt),iterations:env.iter,hash:'SHA-256'},b,{name:'AES-GCM',length:256},false,['decrypt']);}).then(function(k){return crypto.subtle.decrypt({name:'AES-GCM',iv:d(env.iv)},k,d(env.data));}).then(function(p){document.getElementById('lock').remove();document.getElementById('out').innerHTML=new TextDecoder().decode(p);},function(){document.getElementById('err').hidden=false;});}
document.getElementById('go').addEventListener('click',go);document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')go();});})();</script>`};
    }

    return {SPEC, DEFAULTS, settings, rate, totals, cents, money, commission, funds, proofLinks, proofCheck, groupMissing, recNumOk, trackUrl, reminders, maskName, maskAmounts, AMOUNT_RE,
        qSum, questionnaireHtml, readAnswers, encrypt, decrypt, notaryPage, esc};
});
