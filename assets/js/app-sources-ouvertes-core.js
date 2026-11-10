/* LCNDA — 🗂 Archives en ligne : Mémoire des hommes, Léonore, registres matricules, presse ancienne. Calculs purs, SANS RÉSEAU
 * (window.LCNDA_SOURCES_OUVERTES ; aussi require() dans Node pour les tests).
 *
 * Même principe que les recensements SocFace (app-socface-core.js) : l'app N'INTERROGE JAMAIS ces sites. Elle fabrique
 * seulement l'adresse d'une recherche, que le navigateur de la personne ouvre, puis lit les fichiers que la personne a
 * téléchargés elle-même (image, PDF, page enregistrée) ou le texte / le lien qu'elle a copié.
 *
 *  - SITES                          les sites et leurs bases (clé, nom, groupe, adresse modèle, vérifiée ou non)
 *  - url(key, p, custom)            l'adresse remplie (p : first, last, place, y1, y2, birthYear, deathYear, unit, dept, deptName, adUrl)
 *  - fill(modèle, p)                remplit un modèle « {nom} {prénom} {lieu} {de} {à} {classe} {unité} {département} … » (encodé)
 *  - classOf(année)                 la classe de recrutement (naissance + 20 ans) et la phrase qui l'explique
 *  - parseLink(adresse)             ce qu'un lien collé dit déjà (site, journal, date, page, notice, cote)
 *  - parseSavedPage(html)           une page enregistrée (« Enregistrer sous… ») → {title, url, text} — le texte seul, jamais le HTML
 *  - parseFields(texte, sorte)      le texte copié d'une fiche (Mémoire des hommes, Léonore, matricule) → champs reconnus
 *  - cleanUrl(adresse)              une adresse http(s) sûre (sinon '')
 *
 * Adresses : seules celles marquées verified:true ont été vérifiées ; les autres sont construites d'après la forme connue des
 * sites (voir docs/UI.md, « 🗂 Archives en ligne ») et se changent dans « ⚙️ Adresses des sites ».
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const i18n = (s, v) => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js (dans Node : le français)
    const MDH = 'https://www.memoiredeshommes.sga.defense.gouv.fr/';
    const LEONORE = 'https://www.leonore.archives-nationales.culture.gouv.fr/';
    const MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const yearOf = v => { const m = String(v ?? '').match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : 0; };
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const google = (site, p, words = '') => `https://www.google.com/search?q=${encodeURIComponent([`site:${site}`, p.last ? `"${clean(p.last)}"` : '', p.first ? `"${firstOnly(p.first)}"` : '', words].filter(Boolean).join(' '))}`;
    /** la racine d'un site (« https://archives.cantal.fr/… » → « https://archives.cantal.fr/ ») */
    const rootOf = u => { const m = cleanUrl(u).match(/^(https?:\/\/[^/?#]+)/i); return m ? m[1] + '/' : ''; };
    /** années bornées, dans l'ordre */
    const years = p => { let a = Number(p.y1) || 0, b = Number(p.y2) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };

    /* ═════ Les sites ═════
     * group : mdh · leonore · matricules · presse ; verified : adresse vérifiée en ligne le jour où elle a été écrite.
     * build(p) : l'adresse remplie ; home : la page d'accueil (toujours sûre). */
    const SITES = [
        // 🎖 Mémoire des hommes (ministère des Armées) : les recherches ne gardent pas les champs dans l'adresse → recherche
        // Google limitée au site, avec les mots de la base ; « Le site » ouvre l'accueil où l'on choisit la base.
        {key: 'mdh_mpf1418', group: 'mdh', icon: '🎖', label: 'Morts pour la France 1914-1918', home: MDH, verified: false,
            build: p => google('memoiredeshommes.sga.defense.gouv.fr', p, 'mort pour la France 1914-1918')},
        {key: 'mdh_mpf3945', group: 'mdh', icon: '🎖', label: 'Morts pour la France 1939-1945', home: MDH, verified: false,
            build: p => google('memoiredeshommes.sga.defense.gouv.fr', p, 'mort pour la France 1939-1945')},
        {key: 'mdh_sepultures', group: 'mdh', icon: '✝', label: 'Sépultures de guerre', home: MDH, verified: false,
            build: p => google('memoiredeshommes.sga.defense.gouv.fr', p, 'sépulture de guerre')},
        {key: 'mdh_hors_mpf', group: 'mdh', icon: '📄', label: 'Militaires décédés (sans la mention « Mort pour la France »)', home: MDH, verified: false,
            build: p => google('memoiredeshommes.sga.defense.gouv.fr', p, 'militaires décédés')},
        {key: 'mdh_marins', group: 'mdh', icon: '⚓', label: 'Marins', home: MDH, verified: false,
            build: p => google('memoiredeshommes.sga.defense.gouv.fr', p, 'marin')},
        {key: 'mdh_jmo', group: 'mdh', icon: '📖', label: 'Journal de marche de son unité', home: MDH, verified: false, needs: 'unit',
            build: p => p.unit ? `https://www.google.com/search?q=${encodeURIComponent(`"${clean(p.unit)}" journal des marches et opérations site:memoiredeshommes.sga.defense.gouv.fr`)}` : ''},
        // 🏅 Léonore (Archives nationales) : dossiers des membres de la Légion d'honneur morts avant 1977
        {key: 'leonore', group: 'leonore', icon: '🏅', label: 'Léonore — Légion d’honneur', home: LEONORE, verified: false,
            build: p => google('leonore.archives-nationales.culture.gouv.fr', p)},
        // 📋 Registres matricules : le site des Archives du département (liste de l'app) + la base de noms de FranceArchives
        {key: 'matricules_ad', group: 'matricules', icon: '🏛', label: 'Archives du département (registres matricules)', home: '', verified: false, needs: 'adUrl',
            build: p => rootOf(p.adUrl) || cleanUrl(p.adUrl)},
        {key: 'francearchives_noms', group: 'matricules', icon: '🔍', label: 'FranceArchives — base de noms', home: 'https://francearchives.gouv.fr/fr/basedenoms', verified: false,
            build: p => { const q = []; if (p.last) q.push(`es_names=${enc(p.last)}`); if (p.first) q.push(`es_forenames=${enc(firstOnly(p.first))}`); if (p.place) q.push(`es_locations=${enc(clean(p.place).split(',')[0])}`);
                return `https://francearchives.gouv.fr/fr/basedenoms${q.length ? '?' + q.join('&') : ''}`; }},
        {key: 'grand_memorial', group: 'matricules', icon: '🗂', label: 'Grand Mémorial (culture.fr)', home: 'https://www.culture.fr/Genealogie/Grand-Memorial', verified: false,
            build: () => 'https://www.culture.fr/Genealogie/Grand-Memorial'},
        // 📰 Presse ancienne
        {key: 'gallica', group: 'presse', icon: '📰', label: 'Gallica — presse (BnF, gratuit)', home: 'https://gallica.bnf.fr/', verified: false,
            build: p => { const [a, b] = years(p); const name = [p.withFirst === false ? '' : firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
                const parts = [`(gallica all "${name.replace(/"/g, '')}")`, 'dc.type all "fascicule"'];
                if (p.place) parts.push(`(gallica all "${clean(p.place).split(',')[0].replace(/"/g, '')}")`);
                if (a) parts.push(`gallicapublication_date>="${a}/01/01"`); if (b) parts.push(`gallicapublication_date<="${b}/12/31"`);
                return `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(parts.join(' and '))}`; }},
        {key: 'retronews', group: 'presse', icon: '🗞', label: 'RetroNews (BnF, en partie payant)', home: 'https://www.retronews.fr/', verified: false, paid: true,
            build: p => { const name = [p.withFirst === false ? '' : firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
                return `https://www.retronews.fr/search#allTerms=${encodeURIComponent(`"${name.replace(/"/g, '')}"${p.place ? ' ' + clean(p.place).split(',')[0] : ''}`)}&sort=score&page=1&searchIn=all`; }},
        {key: 'europeana', group: 'presse', icon: '🇪🇺', label: 'Europeana — journaux d’Europe', home: 'https://www.europeana.eu/fr', verified: false,
            build: p => { const name = [p.withFirst === false ? '' : firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
                return `https://www.europeana.eu/fr/search?query=${encodeURIComponent(`"${name.replace(/"/g, '')}"${p.place ? ' ' + clean(p.place).split(',')[0] : ''}`)}&qf=${encodeURIComponent('TYPE:"TEXT"')}`; }},
    ];
    const GROUPS = {
        mdh: {icon: '🎖', label: 'Mémoire des hommes', kind: 'mdh'},
        leonore: {icon: '🏅', label: 'Léonore', kind: 'leonore'},
        matricules: {icon: '📋', label: 'Registres matricules', kind: 'matricule'},
        presse: {icon: '📰', label: 'Presse ancienne', kind: 'presse'},
    };
    const site = key => SITES.find(s => s.key === key) || null;

    /** un modèle d'adresse écrit par la personne : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {naissance}, {décès}, {classe}, {unité}, {département} */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: [firstOnly(p.first), p.last].filter(Boolean).join(' '), lieu: clean(p.place).split(',')[0], de: a || '', a: b || '',
            naissance: p.birthYear || '', deces: p.deathYear || '', classe: p.birthYear ? Number(p.birthYear) + 20 : '', unite: p.unit, departement: p.dept || p.deptName};
        return String(template).replace(/\{([^{}]{1,20})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse à ouvrir : celle écrite dans « ⚙️ Adresses des sites » si elle est sûre, sinon celle de l'app */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        return cleanUrl(s.build(p)) || '';
    }

    /** classe de recrutement : l'année des 20 ans ; registres matricules en ligne en général pour les classes ≈ 1867 à 1921 */
    function classOf(birthYear) {
        const y = Number(birthYear) || 0;
        if (!y) return {classe: 0, text: 'Sans année de naissance, on ne peut pas calculer sa classe.', inRange: false};
        const c = y + 20;
        const inRange = c >= 1859 && c <= 1940;
        return {classe: c, inRange, text: i18n('Né en {y}, il est de la classe {c} : les garçons étaient recensés l’année de leurs 20 ans ({y} + 20 = {c}). Les registres matricules sont rangés par classe, puis par bureau de recrutement.', {y: String(y), c: String(c)})
            + (inRange ? '' : c < 1859 ? ' ' + i18n('Avant les années 1860, il n’y a en général pas encore de registre matricule.') : ' ' + i18n('Les registres de cette classe ne sont souvent pas encore en ligne (délai de 100 à 120 ans).'))};
    }

    /** ce qu'un lien collé dit déjà */
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const titleCase = s => String(s).split('-').filter(Boolean).map((w, i) => (i && /^(le|la|les|de|du|des|d|l|et|en|a|au|aux)$/.test(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace(/\b([DL]) /g, '$1’');
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', journal: '', date: '', page: '', notice: '', cote: '', ark: ''};
        if (!u) return out;
        let host = ''; try { host = new URL(u).hostname.toLowerCase(); } catch (_) { return out; }
        if (/(^|\.)gallica\.bnf\.fr$/.test(host)) {
            out.site = 'gallica';
            const a = u.match(/ark:\/12148\/([a-z0-9]+)/i); if (a) out.ark = a[1];
            const f = u.match(/\/f(\d+)\.(?:item|image|texte|planchecontact|highres)/i); if (f) out.page = f[1];
            const d = u.match(/\/date(\d{4})(\d{2})(\d{2})\b/); if (d) out.date = `${Number(d[3])} ${MONTHS_FR[Number(d[2]) - 1] || ''} ${d[1]}`.trim();
        } else if (/(^|\.)retronews\.fr$/.test(host)) {
            out.site = 'retronews';
            const m = u.match(/\/journal\/([a-z0-9-]+)\/(\d{1,2})-([a-zà-ÿ]+)-(\d{4})\/[^?#]*/i);
            if (m) { out.journal = titleCase(m[1]); const mi = MONTHS.indexOf(fold(m[3])); out.date = `${Number(m[2])} ${mi >= 0 ? MONTHS_FR[mi] : m[3]} ${m[4]}`;
                const parts = m[0].split('/').filter(Boolean); const last = parts[parts.length - 1]; if (parts.length >= 6 && /^\d{1,3}$/.test(last)) out.page = last; }
        } else if (/(^|\.)europeana\.eu$/.test(host)) {
            out.site = 'europeana'; const m = u.match(/\/item\/([\w/.-]+)/); if (m) out.notice = m[1];
        } else if (/leonore\.archives-nationales\.culture\.gouv\.fr$/.test(host)) {
            out.site = 'leonore'; const m = u.match(/\/notice\/(\d+)/) || u.match(/[?&]id=(\d+)/); if (m) out.notice = m[1];
        } else if (/memoiredeshommes\.sga\.defense\.gouv\.fr$/.test(host)) {
            out.site = 'mdh'; const m = u.match(/ark:\/(\d+\/[\w.-]+)/); if (m) out.ark = m[1];
        } else if (/(^|\.)francearchives\.gouv\.fr$/.test(host)) {
            out.site = 'francearchives'; const m = u.match(/\/basedenoms\/([0-9a-f]+)/i); if (m) out.notice = m[1];
        }
        return out;
    }

    /** une page enregistrée par le navigateur : le titre, son adresse d'origine et son texte (jamais le HTML lui-même) */
    function decodeEntities(s) {
        const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', hellip: '…', ndash: '–', mdash: '—', deg: '°'};
        return String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e) => {
            if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 31 && n < 0x110000 && n !== 127 ? String.fromCodePoint(n) : ' '; }
            return named[e.toLowerCase()] ?? m;
        });
    }
    function parseSavedPage(html) {
        const s = String(html ?? '').slice(0, 6_000_000);
        const saved = s.match(/<!--\s*saved from url=\(\d+\)\s*(https?:\/\/[^\s>]+)\s*-->/i);
        const canon = s.match(/<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i) || s.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?canonical/i);
        const og = s.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
        const title = decodeEntities((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]).replace(/\s+/g, ' ').trim().slice(0, 300);
        const text = decodeEntities(s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
            .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th|\/dt|\/dd)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
            .replace(/[ \t ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim().slice(0, 20000);
        return {title, url: cleanUrl(decodeEntities(saved?.[1] || canon?.[1] || og?.[1] || '')), text};
    }

    /* Le texte copié d'une fiche : « Étiquette : valeur » ou « Étiquette » puis la valeur à la ligne */
    const LABELS = {
        mdh: {last: ['nom'], first: ['prenoms', 'prenom'], birth_date: ['date de naissance', 'ne le', 'naissance'], birth_place: ['lieu de naissance', 'departement de naissance'],
            rank: ['grade'], unit: ['unite', 'corps', 'regiment', 'unite / corps'], matricule: ['matricule au corps', 'matricule', 'n° matricule au corps'], classe: ['classe'],
            recruitment: ['recrutement', 'bureau de recrutement'], death_date: ['date de deces', 'mort le', 'decede le', 'deces'], death_place: ['lieu de deces', 'lieu du deces'],
            cause: ['genre de mort', 'cause du deces', 'cause'], mention: ['mention', 'mort pour la france']},
        leonore: {last: ['nom'], first: ['prenoms', 'prenom'], birth_date: ['date de naissance'], birth_place: ['lieu de naissance'], cote: ['cote', 'cote du dossier'],
            grade: ['grade', 'grade dans l\'ordre'], date: ['date de nomination', 'date de promotion', 'date'], gender: ['sexe']},
        matricule: {matricule: ['numero matricule', 'n° matricule', 'matricule', 'numero matricule du recrutement'], classe_mobilisation: ['classe', 'classe de mobilisation'],
            bureau_recrutement: ['bureau de recrutement', 'recrutement'], cheveux: ['cheveux'], yeux: ['yeux'], taille: ['taille'], degre_instruction_gen: ['degre d\'instruction', 'degre d\'instruction generale', 'instruction generale'],
            campagnes: ['campagnes'], blessures: ['blessures', 'blessures, citations', 'blessures et citations'], localites_successives: ['localites successives', 'adresses successives', 'domiciles successifs']},
    };
    function parseFields(text, kind) {
        const map = LABELS[kind] || {}; const out = {}; const lines = String(text ?? '').slice(0, 40000).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, '').replace(/[.]+$/, ''); for (const [k, list] of Object.entries(map)) if (list.includes(f)) return k; return null; };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:]{2,40}?)\s*:\s*(.*)$/);
            let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1] && !/:\s*/.test(lines[i + 1])) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (k && v && !out[k]) out[k] = v.slice(0, 600);
        }
        if (kind === 'mdh') {
            const all = fold(text);
            if (/mort pour la france/.test(all) && !/non mort pour la france|n'est pas mort pour la france/.test(all)) out.mpf = 'yes';
            if (out.last && out.last === out.last.toUpperCase()) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        }
        if (kind === 'leonore' && !out.cote) { const c = String(text ?? '').match(/\b(LH\/\d{1,5}\/\d{1,4}|19800035\/\d{1,5}\/\d{1,6}|C\/0\/\d{1,4})\b/); if (c) out.cote = c[1]; }
        return out;
    }

    /** « vivant » ou trop proche : on ne met jamais en avant le nom d'un vivant dans un lien fait pour être partagé */
    function livingRisk(person = {}, now = new Date().getFullYear()) {
        if (String(person.living_status || '') === 'living') return true;
        if (String(person.living_status || '') === 'deceased' || Number(person.death_year) > 0) return false;
        const b = Number(person.birth_year) || 0;
        return b > 0 && now - b < 100;
    }

    return {SITES, GROUPS, MENTION, site, url, fill, classOf, parseLink, parseSavedPage, parseFields, cleanUrl, rootOf, livingRisk, yearOf, fold};
});
