/**
 * 🐞 Petit journal des erreurs (pour « Signaler un problème », assets/js/app-signaler.js) : les 50 dernières erreurs
 * JavaScript (erreurs, promesses refusées, console.error) et serveur (réponse d'api.php en erreur), en mémoire et dans
 * localStorage (« lcnda-journal-erreurs », 50 au plus, 40 000 caractères au plus).
 *
 * Rien de la généalogie n'y entre : chaque texte passe par scrub() AVANT d'être gardé — noms (mots à majuscule qui ne
 * sont pas des mots de programme ou de phrase courante), textes entre guillemets, dates, années, mois, nombres longs,
 * adresses e-mail, chemins de fichiers (C:\…, /Users/…, /home/…) et adresses web (gardé : le nom du fichier de l'app
 * « assets/js/app.js:120:5 » et l'action « api.php?action=save_person »). Testé : tests/test-signaler-probleme.js.
 *
 * Chargé tout en haut (sans defer) pour voir aussi les erreurs du démarrage. Aussi pour Node (require).
 */
(function (root) {
    'use strict';
    const KEY = 'lcnda-journal-erreurs', MAX = 50, MAX_CHARS = 40000, MAX_MSG = 400;

    /* mots à majuscule qu'on garde (programme, messages du navigateur, débuts de phrase courants) ; tout autre mot à
       majuscule devient [nom] (un prénom, un nom de famille, un lieu) */
    const KEEP = new Set(('Cannot Can Could Failed Failure Uncaught Unexpected Invalid Maximum Minimum Script Network Load Loading Error Errors Undefined Null '
        + 'The A An This That These Not No Unable Too Out Of Is Are Was Must Should Unknown Missing Request Response Permission Access Denied Timeout Timed '
        + 'Aborted Abort Internal Server Bad Gateway Service Unavailable Forbidden Found Unauthorized Method Allowed Payload Quota Exceeded Illegal Assignment '
        + 'Constant Variable Property Properties Object Function Promise Rejection Unhandled Syntax Token Reference Type Range Value Argument Arguments Call '
        + 'Stack Size Index Key Read Write Fetch Blocked Origin Navigation Document Window Element Node Child Parent Failed Refused Connection Reset Closed '
        + 'Resource Resources Module Import Export Unsupported Operation Operations Expected Got Received Status Code Message Cause Details Line Column File '
        + 'Infinity NaN True False Integrity Violation Database Locked Busy Disk Full At In On For With From To By Or And If Else Then When While Try Catch Throw New Delete Return '
        + 'Impossible Erreur Erreurs Le La Les L Un Une Des Du De Ce Cette Ces Cet Il Elle Ils Elles On Ta Ton Tes Ma Mon Mes Pas Aucun Aucune Trop '
        + 'Fichier Fiche Fiches Base Action Réponse Serveur Vérifie Refusé Refusée Rien Pour Avec Sans Dans Sur Par Cela Ceci Échec Délai Connexion Format '
        + 'Personne Personnes Nom Prénom Texte Page Image Images Média Médias Source Sources Note Notes Mode Données Requête Session Jeton Accès Merci '
        + 'Recharge Réessaie Attends Choisis Donne Plus Moins Tout Toute Tous Toutes Non Oui Si Mais Et Ou Quand Comme Déjà Encore Seulement Version Mise '
        + 'Importer Exporter Enregistrement Enregistrer Suppression Modification Création Lecture Écriture Téléchargement Chargement Calcul Problème '
        + 'Interdit Interdite Introuvable Inconnu Inconnue Invalide Manquant Manquante Verrouillée Verrouillé Consultation Fenêtre Réseau Internet '
        + 'Navigateur Réglages Réglage Tableau Carte Cartes Arbre Liste Listes Onglet Bloc Blocs Outil Outils Lieu Lieux Date Dates Événement Événements '
        + 'Famille Familles Enquête Enquêtes Animal Animaux Photo Photos Document Documents Son Vidéo Cette Ici Là Votre Vos Ton Trop Grand Petit '
        + 'Annulé Annuler Rétablir Fermer Ouvrir Supprimer Retirer Modifier Créer Ajouter Relier Chercher Voir Essaie Réessayer Recommence Attention').split(' '));
    /* sigles et mots en capitales du programme ; tout autre mot en capitales (« DUPONT ») devient [nom] */
    const KEEP_CAPS = new Set(('JSON HTTP HTTPS API URL URI SQL SQLITE SQLSTATE CSRF PHP HTML DOM CSS SVG PNG JPG JPEG PDF GIF WEBP CSV TSV XML ZIP GEDCOM GED '
        + 'UTF ID IO CORS GET POST PUT PATCH DELETE HEAD OK NULL TRUE FALSE ERR NETWORK ABORTED FAILED WEBGL GPU CPU RAM KB MB GB PRAGMA SELECT INSERT UPDATE FROM '
        + 'WHERE TABLE INDEX UNIQUE CONSTRAINT FOREIGN KEY NOT AND OR LCNDA WASM MP3 MP4 WAV OGG OPUS FLAC EXIF IIIF CSP DOCX ODT ODS XLSX RTF TXT MD HTR OCR '
        + 'ADN DNA INSEE A4 A5 IGN OSM GPS UI JS TS NS ES').split(' '));
    const PASCAL_OK = /^[A-Z][A-Za-z0-9]*(Error|Exception|Element|Event|Events|Type|Request|Response|Promise|Object|Array|String|Number|Function|Map|Set|Observer|Context|Worker|Storage|Stream|Buffer|Node|Document|Window|Image|Canvas|Audio|Video|Media|Data|Text|URL|JSON|Range|Selection|Font|Rect|Item|List|Engine|Handler|Callback|Reader|Writer|Decoder|Encoder|Socket|Database|Transaction|Signal|Controller)$/;
    const MONTHS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|janv|févr|fevr|avr|juil|sept|oct|nov|déc|dec|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep';
    const RE_MONTH = new RegExp(`(?:\\b\\d{1,2}(?:er)?\\s+)?\\b(?:${MONTHS})\\b\\.?(?:\\s+\\d{2,4}\\b)?`, 'giu');
    const APP_FILE = /(?:^|\/)((?:assets\/(?:js|css)\/)?[\w.-]+\.(?:js|css|php|html))$/;

    /** une adresse web → « assets/js/app.js:12:5 », « api.php?action=save_person », sinon « [adresse] » */
    function cleanUrl(m) {
        let s = m, pos = '';
        const lc = /(:\d+(?::\d+)?)\)?$/.exec(s);
        if (lc) { pos = lc[1]; s = s.slice(0, lc.index); }
        const action = /[?&]action=([a-z0-9_]{1,60})(?![\w])/i.exec(s);
        let p = s.split(/[?#]/)[0];
        try { p = new URL(p).pathname; } catch (_) { p = p.replace(/^[a-z]+:\/\/[^/]*/i, ''); }
        const f = APP_FILE.exec(p);
        if (!f) return '[adresse]';
        return f[1] + (action ? `?action=${action[1]}` : '') + pos;
    }

    /** enlève tout ce qui pourrait venir de la généalogie ou de l'ordinateur de la personne */
    function scrub(input) {
        let s = String(input == null ? '' : input).slice(0, 4000);
        s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
        // e-mails
        s = s.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, '[e-mail]');
        // adresses web (garder le fichier de l'app et l'action d'api.php)
        s = s.replace(/\b(?:https?|file|blob|webpack|chrome-extension|moz-extension):\/{1,3}[^\s()"'<>]+/gi, cleanUrl);
        // chemins Windows (C:\…, \\serveur\…) et Unix (/Users/…, ~/…, tout chemin absolu à plusieurs dossiers)
        s = s.replace(/(?:\b[A-Za-z]:[\\/]|\\\\)[^\s"'<>|]*/g, '[chemin]');
        s = s.replace(/(^|[\s(=:"'«[,])~?\/(?:[^\s/"'<>]+\/)+[^\s"'<>)\]]*/g, '$1[chemin]');
        s = s.replace(/(^|[\s(=:"'«[,])~\/[^\s"'<>)]*/g, '$1[chemin]');
        // textes entre guillemets (souvent un nom, un titre, une valeur tapée)
        s = s.replace(/«[^»\n]{0,300}»/g, '«…»').replace(/“[^”\n]{0,300}”/g, '“…”').replace(/‘[^’\n]{0,300}’/g, '‘…’');
        s = s.replace(/"([^"\n]{0,300})"/g, (m, x) => (/^[a-z_$][\w$.-]{0,40}$/.test(x) ? m : '"…"'));
        s = s.replace(/(^|[^\p{L}\p{N}])'([^'\n]{0,300})'/gu, (m, a, x) => (/^[a-z_$][\w$.-]{0,40}$/.test(x) ? m : `${a}'…'`));
        s = s.replace(/`([^`\n]{0,300})`/g, (m, x) => (/^[a-z_$][\w$.-]{0,40}$/.test(x) ? m : '`…`'));
        // dates : 2026-10-18(T…), 12/03/1890, 12.03.1890, mois en lettres, années (pas les « :120:5 » des fichiers)
        s = s.replace(/\b\d{4}-\d{1,2}-\d{1,2}(?:[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)?)?\b/g, '[date]');
        s = s.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '[date]');
        s = s.replace(RE_MONTH, '[date]');
        s = s.replace(/(^|[^\w:.#\]-])(?:1[0-9]{3}|20[0-9]{2})(?![\w:])/g, '$1[année]');
        // nombres longs (codes postaux, numéros de téléphone, identifiants) ; pas les positions « :1234 » dans un fichier
        s = s.replace(/(^|[^\w:.#\]-])\d[\d ]{3,}\d(?![\w:])/g, '$1[nombre]');
        // mots à majuscule : programme et phrases courantes gardés, le reste = un nom ou un lieu
        s = s.replace(/[\p{L}][\p{L}\p{M}]*(?:[’'][\p{L}]+)?/gu, (w, at, all) => {
            if (!/^\p{Lu}/u.test(w)) return w;
            if (/^[A-Z]{1,4}$/.test(w) && /\d/.test(all[at + w.length] || '')) return w; // un code (HY000, E11000…)
            const base = w.replace(/[’'].*$/, '');
            if (KEEP.has(base) || KEEP.has(w)) return w;
            if (/^\p{Lu}$/u.test(w)) return w; // une lettre seule (A, B…)
            if (/^[A-Z0-9_]+$/.test(w) && (KEEP_CAPS.has(w) || /^(ERR|SQLITE|HTTP|E)_/.test(w) || w.includes('_'))) return w;
            if (PASCAL_OK.test(w)) return w;
            if (/^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(w) && /(?:HTML|DOM|SVG|URL|JSON|Web|Indexed|Array|Script|Event|Element|Node|Text|Media|Audio|Video|Image|Canvas)/.test(w)) return w;
            return '[nom]';
        });
        // « [nom] [nom] », « [nom]-de-[nom] », « [nom] d’[nom] » → un seul [nom]
        s = s.replace(/\[nom\](?:(?:[\s'’-]+(?:de|du|des|la|le|les|d|l|van|von|der|den|di|da|del|dos|y|el|sur|en|lès|les|sous|aux|au)\b)*[\s'’-]+\[nom\])+/giu, '[nom]');
        return s.replace(/[ \t]{2,}/g, ' ').trim();
    }

    /* ─────────── le journal ─────────── */
    let items = [];
    const load = () => {
        try { const raw = root.localStorage && root.localStorage.getItem(KEY); const v = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) items = v.filter(x => x && typeof x.msg === 'string').slice(-MAX).map(x => ({t: Number(x.t) || 0, kind: String(x.kind || 'js').slice(0, 10), msg: scrub(x.msg).slice(0, MAX_MSG), where: scrub(x.where || '').slice(0, 200), n: Math.max(1, Math.min(9999, Number(x.n) || 1))})); } catch (_) { items = []; }
    };
    const save = () => {
        try {
            if (!root.localStorage) return;
            let out = items.slice(-MAX);
            while (out.length && JSON.stringify(out).length > MAX_CHARS) out = out.slice(1);
            root.localStorage.setItem(KEY, JSON.stringify(out));
        } catch (_) {}
    };
    let saving = 0;
    const saveSoon = () => { if (saving) return; saving = setTimeout(() => { saving = 0; save(); }, 400); };
    /** add('js' | 'promise' | 'console' | 'server', message, where) : texte nettoyé, doublons comptés */
    function add(kind, msg, where = '') {
        const m = scrub(msg).slice(0, MAX_MSG), w = scrub(where).slice(0, 200);
        if (!m) return;
        const last = items[items.length - 1];
        if (last && last.msg === m && last.kind === kind && last.where === w) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
        else { items.push({t: Date.now(), kind: String(kind).slice(0, 10), msg: m, where: w, n: 1}); if (items.length > MAX) items = items.slice(-MAX); }
        saveSoon();
    }
    const list = () => items.slice();
    const clear = () => { items = []; try { root.localStorage && root.localStorage.removeItem(KEY); } catch (_) {} };
    const errText = e => {
        if (e == null) return '';
        if (e instanceof Error || (typeof e === 'object' && typeof e.message === 'string')) return `${e.name || 'Error'}: ${e.message}${e.stack ? '\n' + String(e.stack).split('\n').slice(1, 6).join('\n') : ''}`;
        if (typeof e === 'object') return '[objet]';
        return String(e);
    };
    const api = {KEY, MAX, scrub, add, list, clear, errText, _reload: load};

    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.LCNDA_JOURNAL = api;
    load();

    /* ─────────── ce qu'on capte (navigateur) ─────────── */
    root.addEventListener('error', e => {
        if (e && e.target && e.target !== root && e.target.tagName) { // un script ou une feuille de style de l'app qui ne charge pas (pas les images : trop nombreuses)
            const t = e.target, tag = String(t.tagName).toLowerCase();
            if (tag === 'script' || tag === 'link') add('js', `Chargement impossible : <${tag}>`, t.src || t.href || '');
            return;
        }
        add('js', e && e.error ? errText(e.error) : (e && e.message) || 'Erreur', e && e.filename ? `${e.filename}:${e.lineno || 0}:${e.colno || 0}` : '');
    }, true);
    root.addEventListener('unhandledrejection', e => add('promise', errText(e && e.reason) || 'Promesse refusée'));
    const ce = root.console && root.console.error;
    if (ce) root.console.error = function (...a) { try { add('console', a.map(errText).join(' ')); } catch (_) {} return ce.apply(this, a); };
    // erreurs du serveur : réponse d'api.php / upload.php en erreur (on garde l'action, le code et le message nettoyé)
    const f = root.fetch;
    if (f) root.fetch = async function (input, init) {
        const res = await f.apply(this, arguments);
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (res && res.status >= 400 && /(?:^|\/)(?:api|upload)\.php/.test(url)) {
                const action = (/[?&]action=([a-z0-9_]{1,60})/i.exec(url) || [])[1] || (init && typeof init.body === 'string' ? ((/"action"\s*:\s*"([a-z0-9_]{1,60})"/i.exec(init.body) || [])[1] || '') : '');
                res.clone().json().then(j => add('server', `${res.status} ${j && j.error ? j.error : ''}`, `${/upload/.test(url) ? 'upload.php' : 'api.php'}${action ? '?action=' + action : ''}`))
                    .catch(() => add('server', String(res.status), `api.php${action ? '?action=' + action : ''}`));
            }
        } catch (_) {}
        return res;
    };
})(typeof window !== 'undefined' ? window : globalThis);
