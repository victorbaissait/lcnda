/* LCNDA — 📜 Atelier de transcription d'actes : l'image de l'acte à gauche (zoom, contraste, rotation), le texte à droite ;
 * des zones dessinées sur l'image reliées à des passages du texte (cliquer l'un surligne l'autre) ; la lecture automatique
 * (OCR pour l'imprimé, HTR pour le manuscrit si un modèle est installé), qui pose aussi les zones ligne par ligne ;
 * le repérage des noms, rôles, dates (même écrites en toutes lettres, ou au calendrier républicain), lieux et métiers,
 * et le lien vers les fiches de la base. Serveur : lib/transcriptions.php.
 * Listes → Outils de modification → « 📜 Transcription d'actes », ou la visionneuse d'une image → « 📜 Atelier ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let seq = 0; const zid = () => 'z' + Date.now().toString(36) + (++seq);

    const KINDS = [['bapteme', 'Baptême'], ['naissance', 'Naissance'], ['mariage', 'Mariage'], ['deces', 'Décès'], ['sepulture', 'Sépulture'], ['notarial', 'Acte notarié'], ['recensement', 'Recensement'], ['militaire', 'Registre militaire'], ['lettre', 'Lettre'], ['autre', 'Autre']];
    const COLORS = ['#f6c343', '#7cc4f0', '#9be08f', '#f59ab0', '#c3a6f2', '#f7a35c', '#6fd6c8', '#e6e15a'];
    // des modèles d'acte, pour ne pas partir d'une page blanche
    const TEMPLATES = {
        bapteme: 'L’an [année], le [jour] du mois de [mois], a été [baptisé / baptisée] [prénom], [né / née] [hier / ce jour], [fils / fille] légitime de [prénom et nom du père], [métier], et de [prénom et nom de la mère], son épouse, de cette paroisse. Le parrain a été [nom], la marraine [nom], qui ont signé avec nous / déclaré ne savoir signer.\n[signatures]',
        naissance: 'L’an [année], le [jour] [mois], à [heure], par-devant nous, [nom], maire, officier de l’état civil de la commune de [commune], est comparu [prénom et nom du père], [âge], [métier], demeurant à [lieu], lequel nous a présenté un enfant de sexe [masculin / féminin], né [date] de lui déclarant et de [prénom et nom de la mère], son épouse, auquel il a donné le prénom de [prénom]. En présence de [témoin 1] et de [témoin 2].\n[signatures]',
        mariage: 'L’an [année], le [jour] [mois], après la publication de trois bans, ont été mariés [prénom et nom de l’époux], [âge], [métier], fils de [père] et de [mère], d’une part, et [prénom et nom de l’épouse], [âge], fille de [père] et de [mère], d’autre part. Présents : [témoins].\n[signatures]',
        deces: 'L’an [année], le [jour] [mois], sont comparus [déclarant 1] et [déclarant 2], lesquels nous ont déclaré que [prénom et nom], [âge], [métier], [époux / veuve de …], [fils / fille] de [père] et de [mère], est [décédé / décédée] le [date] à [lieu].\n[signatures]',
        sepulture: 'L’an [année], le [jour] du mois de [mois], a été inhumé dans le cimetière de cette paroisse le corps de [prénom et nom], [âgé / âgée] d’environ [âge] ans, [décédé / décédée] le [date], [époux / veuve de …]. Présents : [témoins].\n[signatures]',
        notarial: 'Par-devant [nom], notaire royal / public à [lieu], soussigné, et en présence des témoins ci-après nommés, furent présents [parties]…\n[objet de l’acte]\nFait et passé à [lieu], le [date], en présence de [témoins].\n[signatures]',
    };
    const USE_KEY = 'genealogie-transcribe-useenh';
    const useEnh = () => { try { return localStorage.getItem(USE_KEY) !== '0'; } catch (_) { return true; } };
    const SPECIAL = ['ſ', 'œ', 'Œ', 'æ', 'ç', 'é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'ù', 'û', 'ÿ', '&', '«', '»', '…', '†', '°', '[', ']', '[?]', '[illisible]', '/'];

    /* ═════════ Repérage : nombres et dates en toutes lettres, noms, rôles, lieux, métiers ═════════ */
    const NUM = {un: 1, une: 1, premier: 1, première: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
        vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mil: 1000, mille: 1000};
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    /** « mil sept cent quatre-vingt-dix-neuf » → 1799 ; « vingt-trois » → 23 ; null si ce ne sont pas des nombres */
    function wordsToNumber(str) {
        const words = norm(str).replace(/[’']/g, ' ').split(/[\s-]+/).filter(w => w && w !== 'et');
        if (!words.length) return null;
        let total = 0, cur = 0, any = false;
        for (const w0 of words) {
            const w = w0.replace(/s$/, '') === 'vingt' ? 'vingt' : w0, n = NUM[w] ?? NUM[w0];
            if (n === undefined) { if (/^\d+$/.test(w0)) { cur += Number(w0); any = true; continue; } return null; }
            any = true;
            if (n === 1000) { total += (cur || 1) * 1000; cur = 0; }
            else if (n === 100) cur = (cur || 1) * 100;
            else if (n === 20 && cur % 100 === 4) cur = cur - 4 + 80; // quatre-vingt
            else cur += n;
        }
        return any ? total + cur : null;
    }
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const MONTH_ALIASES = {'7bre': 9, '8bre': 10, '9bre': 11, 'xbre': 12, '10bre': 12, 'janv': 1, 'fevr': 2, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12, 'aoust': 8, 'febvrier': 2};
    const REPUB = ['vendemiaire', 'brumaire', 'frimaire', 'nivose', 'pluviose', 'ventose', 'germinal', 'floreal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jours complementaires', 'sansculottides'];
    const roman = s => { const v = {i: 1, v: 5, x: 10, l: 50, c: 100}; let t = 0, prev = 0; for (const ch of norm(s).split('').reverse()) { const n = v[ch]; if (!n) return null; t += n < prev ? -n : n; prev = Math.max(prev, n); } return t || null; };
    const NUMWORD = '(?:premier|première|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cent|cents|mil|mille|et|\\d{1,4})';
    const NUMSEQ = `${NUMWORD}(?:[\\s-]+${NUMWORD})*`;
    const MONTH_RX = '(janvier|f[ée]vrier|febvrier|mars|avril|mai|juin|juillet|ao[uû]s?t|septembre|octobre|novembre|d[ée]cembre|7bre|8bre|9bre|xbre|10bre)';
    function findDates(text) {
        const out = [];
        // jour, mois, année (en chiffres ou en lettres) : « 23 mars 1790 », « le vingt-trois mars mil sept cent quatre-vingt-dix »
        const rx = new RegExp(`(?:\\b(${NUMSEQ})(?:er|e)?\\s+(?:jour\\s+)?(?:du\\s+mois\\s+)?(?:de\\s+|d['’]\\s*)?)?\\b${MONTH_RX}\\b(?:\\s+(?:de\\s+)?(?:l['’]\\s*an\\s+(?:de\\s+grâce\\s+)?)?(${NUMSEQ}))?`, 'gi');
        let m;
        while ((m = rx.exec(text))) {
            const day = m[1] ? wordsToNumber(m[1]) : null, mon = norm(m[2]), mi = MONTHS.indexOf(mon.replace('aoust', 'aout').replace('febvrier', 'fevrier')) + 1 || MONTH_ALIASES[mon] || 0, year = m[3] ? wordsToNumber(m[3]) : null;
            if (!mi || (!day && !year) || (day && (day < 1 || day > 31)) || (year && (year < 900 || year > 2100))) continue;
            out.push({type: 'date', s: m.index, e: m.index + m[0].length, label: [day, ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][mi - 1], year].filter(Boolean).join(' '), iso: year ? `${year}-${String(mi).padStart(2, '0')}${day ? '-' + String(day).padStart(2, '0') : ''}` : ''});
        }
        // « l'an mil sept cent quatre-vingt » sans mois
        const ry = new RegExp(`\\bl['’]\\s*an\\s+(?:de\\s+grâce\\s+)?(${NUMSEQ})`, 'gi');
        while ((m = ry.exec(text))) { if (out.some(d => m.index >= d.s && m.index < d.e)) continue; const y = wordsToNumber(m[1]); if (y && y >= 900 && y <= 2100) out.push({type: 'date', s: m.index, e: m.index + m[0].length, label: `l’an ${y}`, iso: String(y)}); }
        // dates en chiffres : 23/03/1790
        const rn = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/g;
        while ((m = rn.exec(text))) { const d = +m[1], mo = +m[2], y = +m[3]; if (d <= 31 && mo >= 1 && mo <= 12) out.push({type: 'date', s: m.index, e: m.index + m[0].length, label: `${d}/${mo}/${y}`, iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`}); }
        // calendrier républicain : « 12 floréal an IV »
        const rr = new RegExp(`\\b(${NUMSEQ}|[ivx]+)\\s+(vend[ée]miaire|brumaire|frimaire|niv[ôo]se|pluvi[ôo]se|vent[ôo]se|germinal|flor[ée]al|prairial|messidor|thermidor|fructidor)\\s+(?:de\\s+)?l?['’]?\\s*an\\s+([ivx]+|\\d+|${NUMSEQ})`, 'gi');
        while ((m = rr.exec(text))) {
            const day = wordsToNumber(m[1]) || roman(m[1]), mo = REPUB.indexOf(norm(m[2]).replace('nivose', 'nivose')) + 1, an = /^\d+$/.test(m[3]) ? +m[3] : (roman(m[3]) || wordsToNumber(m[3]));
            let greg = '';
            try { if (day && mo && an && A().republicanToJdn && A().jdnToGregorian) { const g = A().jdnToGregorian(A().republicanToJdn(an, mo, day)); greg = Array.isArray(g) ? `${g[2]}/${g[1]}/${g[0]}` : (g?.year ? `${g.day}/${g.month}/${g.year}` : ''); } } catch (_) {}
            out.push({type: 'date', s: m.index, e: m.index + m[0].length, label: `${day || '?'} ${m[2]} an ${an || '?'}${greg ? ` (= ${greg})` : ''}`, iso: ''});
        }
        out.sort((a, b) => a.s - b.s);
        // « L'an mil sept cent quatre-vingt-dix, le vingt-trois mars » : le jour et le mois prennent l'année qui les précède
        out.forEach((d, i) => { if (/^\d{4}$/.test(d.iso) || /\d{4}/.test(d.label) || !/^(\d+ )?[a-zéû]+$/i.test(d.label)) return; const y = out.slice(0, i).reverse().find(q => /^\d{4}$/.test(q.iso) && d.s - q.e < 80); if (!y) return;
            const mi = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'].indexOf(d.label.replace(/^\d+ /, '')) + 1, day = parseInt(d.label, 10);
            d.label = `${d.label} ${y.iso}`; d.iso = `${y.iso}-${String(mi).padStart(2, '0')}${day ? '-' + String(day).padStart(2, '0') : ''}`; });
        return out;
    }
    const JOBS = ['laboureur', 'journalier', 'journalière', 'cultivateur', 'cultivatrice', 'agriculteur', 'fermier', 'fermière', 'métayer', 'métayère', 'vigneron', 'vigneronne', 'meunier', 'meunière', 'boulanger', 'boulangère', 'boucher', 'bouchère', 'charcutier', 'tisserand', 'tisserande', 'fileuse', 'couturière', 'tailleur', 'cordonnier', 'sabotier', 'menuisier', 'charpentier', 'maçon', 'tailleur de pierre', 'couvreur', 'forgeron', 'maréchal-ferrant', 'maréchal', 'serrurier', 'charron', 'tonnelier', 'tanneur', 'cordier', 'potier', 'tuilier', 'chapelier', 'aubergiste', 'cabaretier', 'cabaretière', 'hôtelier', 'marchand', 'marchande', 'négociant', 'mercier', 'épicier', 'épicière', 'commerçant', 'colporteur', 'domestique', 'servante', 'valet', 'berger', 'bergère', 'bouvier', 'charretier', 'voiturier', 'roulier', 'batelier', 'marinier', 'pêcheur', 'marin', 'matelot', 'soldat', 'militaire', 'gendarme', 'garde champêtre', 'garde forestier', 'instituteur', 'institutrice', 'maître d’école', 'notaire', 'huissier', 'avocat', 'procureur', 'greffier', 'médecin', 'chirurgien', 'apothicaire', 'pharmacien', 'sage-femme', 'curé', 'vicaire', 'prêtre', 'chapelain', 'sacristain', 'bedeau', 'maire', 'adjoint', 'syndic', 'bourgeois', 'rentier', 'rentière', 'propriétaire', 'ménagère', 'sans profession', 'manouvrier', 'manouvrière', 'ouvrier', 'ouvrière', 'mineur', 'carrier', 'verrier', 'horloger', 'orfèvre', 'perruquier', 'coiffeur', 'jardinier', 'meunier', 'scieur de long', 'bûcheron', 'charbonnier', 'facteur', 'employé', 'cheminot', 'mécanicien', 'écuyer', 'chevalier', 'seigneur', 'noble homme', 'honorable homme', 'sieur'];
    const JOB_RX = new RegExp(`\\b(${[...new Set(JOBS)].sort((a, b) => b.length - a.length).map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’/g, '[’\']')).join('|')})s?\\b`, 'gi');
    // les mots qui annoncent une personne, et le rôle qu'ils lui donnent
    const ROLE_WORDS = [[/\b(?:fils|fille)\s+(?:l[ée]gitime\s+|naturel(?:le)?\s+)?(?:de|du|d['’])\s*$/i, 'parent'], [/\b(?:parrain)\b[^.;\n]{0,20}$/i, 'parrain'], [/\b(?:marraine)\b[^.;\n]{0,20}$/i, 'marraine'],
        [/\b(?:t[ée]moins?|pr[ée]sents?)\b[^.;\n]{0,25}$/i, 'témoin'], [/\b(?:veuve|veuf)\s+(?:de|du|d['’])\s*$/i, 'conjoint défunt'], [/\b(?:[ée]pouse|femme|[ée]poux|mari)\s+(?:de|du|d['’])\s*$/i, 'conjoint'],
        [/\b(?:baptis[ée]e?|n[ée]e?|nomm[ée]e?|appel[ée]e?|pr[ée]nomm[ée]e?)\s*(?:le\s+nomm[ée]e?\s*)?$/i, 'sujet'], [/\b(?:inhum[ée]e?|d[ée]c[ée]d[ée]e?|le\s+corps\s+de|feu|feue|d[ée]funte?)\s*(?:de\s+)?$/i, 'défunt'],
        [/\b(?:cur[ée]|vicaire|pr[êe]tre|desservant|recteur)\b[^.;\n]{0,15}$/i, 'officiant'], [/\b(?:notaire)\b[^.;\n]{0,15}$/i, 'notaire'], [/\b(?:maire|officier\s+de\s+l['’][ée]tat\s+civil)\b[^.;\n]{0,25}$/i, 'officier'],
        [/\b(?:et\s+de|et\s+d['’])\s*$/i, 'parent'], [/\b(?:sieur|sr|me|ma[îi]tre|monsieur|madame|demoiselle|dame|dlle|mlle|honn[êe]te\s+(?:homme|femme)|noble\s+homme)\.?\s*$/i, '']];
    const STOP = new Set(['Le', 'La', 'Les', 'Lan', 'L', 'Nous', 'Et', 'De', 'Du', 'Des', 'Ce', 'Cette', 'Par', 'Pour', 'En', 'Au', 'Aux', 'Il', 'Elle', 'Ils', 'Lequel', 'Laquelle', 'Lesquels', 'Lesquelles', 'Fait', 'Signé', 'Approuvé', 'Mairie', 'Commune', 'Paroisse', 'Dieu', 'Notre', 'Sainte', 'Saint', 'Église', 'Eglise', 'Roi', 'République', 'Monsieur', 'Madame', 'Sieur', 'Maître', 'Me', 'Sr', 'Mr', 'An', 'Lan', 'Ledit', 'Ladite', 'Lesdits', 'Mention', 'Acte']);
    const CAP = "[A-ZÀ-ÖØ-Þ][\\wÀ-ÿ'’-]*";
    const NAME_RX = new RegExp(`${CAP}(?:\\s+(?:de|du|des|d['’]|le|la|van|von|dit|dite)?\\s*${CAP}){0,4}`, 'g');
    const PLACE_RX = new RegExp(`\\b(?:paroisse|commune|village|hameau|lieu[- ]dit|ville|bourg|dioc[èe]se|canton|d[ée]partement|ferme|ch[âa]teau|seigneurie|terre|demeurant|domicili[ée]e?s?|r[ée]sidant|natif|native|originaire|n[ée]e?)\\s+(?:au\\s+village\\s+)?(?:de|du|d['’]|à|a|en|au|aux|dans\\s+la\\s+paroisse\\s+de)\\s*((?:Saint|Sainte|St|Ste|Notre[- ]Dame|La|Le|Les)?[- ]?${CAP}(?:[- ](?:sur|sous|en|lès|les|le|la|de|du|des|aux)?[- ]?${CAP}){0,3})`, 'g');
    function detect(text) {
        const dates = findDates(text), people = [], places = [], jobs = [];
        let m;
        while ((m = PLACE_RX.exec(text))) { const s = m.index + m[0].lastIndexOf(m[1]); places.push({type: 'place', s, e: s + m[1].length, label: m[1].trim()}); }
        while ((m = JOB_RX.exec(text))) jobs.push({type: 'job', s: m.index, e: m.index + m[0].length, label: m[1].toLowerCase()});
        while ((m = NAME_RX.exec(text))) {
            let s = m.index, label = m[0].trim(), words = label.split(/\s+/);
            const junk = w => STOP.has(w.replace(/[’'].*$/, '')) || /^[IVXLCDM]+$/.test(w) || w.length < 2 || /^[LD][’']/.test(w); // « L'an », chiffres romains…
            while (words.length && junk(words[0])) { s = text.indexOf(words[1] || '', s + words[0].length); words.shift(); }
            while (words.length && junk(words[words.length - 1])) words.pop();
            if (!words.length) continue;
            label = words.join(' '); if (label.length < 3) continue;
            if (places.some(p => s >= p.s && s < p.e) || dates.some(d => s >= d.s && s < d.e)) continue; // un lieu, une date
            if (MONTHS.includes(norm(words[0])) || REPUB.includes(norm(words[0]))) continue;
            const before = text.slice(Math.max(0, s - 60), s);
            const role = (ROLE_WORDS.find(([rx]) => rx.test(before)) || [null, null])[1];
            const sentenceStart = /(^|[.!?\n]\s*)$/.test(before);
            const upper = words.some(w => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
            // un nom : annoncé par un mot (fils de, parrain…), ou plusieurs mots en capitales, ou un NOM écrit en majuscules
            if (role === null && (sentenceStart || words.length < 2) && !upper) continue;
            people.push({type: 'person', s, e: s + label.length, label, role: role || ''});
        }
        // pas deux fois le même passage
        const all = [...people, ...dates, ...places, ...jobs].sort((a, b) => a.s - b.s || b.e - a.e);
        const kept = []; all.forEach(x => { if (!kept.some(k => x.s < k.e && k.s < x.e && k.type === x.type)) kept.push(x); });
        return kept;
    }

    /* ═════════ L'atelier ═════════ */
    async function open(ctx = {}) {
        const TV = ext.txView; // « 🎚️ Mieux voir » et la barre réglable (heritage-transcribe-view.js)
        let t = {id: 0, title: '', kind: 'bapteme', media_id: 0, filename: '', date_text: '', place: '', source: '', body: '', data: {zones: [], people: [], status: 'todo', view: TV.viewOf()}};
        if (ctx.id) { try { const r = await api('act_transcription', {id: ctx.id}); t = {...t, ...r, data: {...t.data, ...(r.data || {})}}; t.data.view = TV.viewOf(r.data?.view); if (!['todo', 'doing', 'done'].includes(t.data.status)) t.data.status = String(t.body || '').trim() ? 'doing' : 'todo'; } catch (e) { return toast(e.message, 'error'); } }
        else if (ctx.mediaId) { t.media_id = Number(ctx.mediaId); t.filename = ctx.filename || ''; t.title = ctx.title || ''; t.body = ctx.text || ''; if (KINDS.some(k => k[0] === ctx.kind)) t.kind = ctx.kind; } // kind : ex. « lettre » pour le dos d'une carte postale
        let dirty = false, tool = 'pan', fitMode = 'page', fitOn = true, zoom = 1, panX = 0, panY = 0, selZone = null, found = [], imgW = 0, imgH = 0, matchCache = new Map();
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-tx-dlg';
        dlg.innerHTML = `<div class="h-tx">
            <header class="h-tx-top"><span class="h-tx-logo">📜</span><nav class="h-tx-menus" data-tx-menus></nav><span class="ui-topbar-hist h-tx-hist"><button type="button" class="icon-button small" data-tx-hist="undo" title="Annuler" data-shortcut="⌘Z" disabled>↶</button><button type="button" class="icon-button small" data-tx-hist="redo" title="Rétablir" data-shortcut="⇧⌘Z" disabled>↷</button></span><input data-tx="title" class="h-tx-title" maxlength="200" placeholder="Titre de l’acte (ex. Baptême de Jean Martin, 1790)" value="${esc(t.title)}">
                <select data-tx="kind" title="Genre d’acte">${KINDS.map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <input data-tx="date_text" placeholder="Date" value="${esc(t.date_text)}" title="Date de l’acte"><input data-tx="place" placeholder="Lieu" value="${esc(t.place)}" title="Paroisse, commune"><input data-tx="source" placeholder="Source (AD, cote, vue)" value="${esc(t.source)}" title="Archives, cote, numéro de vue">
                <select data-tx-state title="Où en est cette transcription (pour la liste « Transcriptions d’actes »)">${[['todo', 'À faire'], ['doing', 'En cours'], ['done', 'Finie']].map(([k, l]) => `<option value="${k}" ${t.data.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <span class="spacer"></span><span class="muted h-tx-status" data-tx-status data-ui-status></span>
                <button type="button" class="button small secondary" data-tx-cmd="export" title="Le texte (.txt), l’impression ou un PDF (image + texte)">⤓ Exporter ▾</button><button type="button" class="button small" data-tx-cmd="save" title="Enregistrer" data-shortcut="${esc(ext.shortcutLabel?.('⌘S') || '⌘S')}">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('transcribe') : ''}<button type="button" class="icon-button" data-tx-cmd="close" title="Fermer">×</button></header>
            <div class="h-tx-main">
                <nav class="h-tx-rail" data-tx-rail aria-label="Outils"><button type="button" data-tx-tool="pan" title="Déplacer l’image, ou barre d’espace" aria-label="Déplacer l’image" data-shortcut="H">✋</button><button type="button" data-tx-tool="zone" title="Dessiner une zone : choisis un passage dans le texte, puis dessine son rectangle sur l’image (les deux restent liés)" aria-label="Dessiner une zone" data-shortcut="Z">▭</button><button type="button" data-tx-cmd="loupe" title="Loupe qui suit la souris (la molette change le grossissement)" aria-label="Loupe" data-shortcut="L">🔍</button><button type="button" data-tx-cmd="rot" title="Tourner l’image de 90°" aria-label="Tourner de 90°">⟳</button><button type="button" data-tx-cmd="image" title="Choisir l’image de l’acte (base ou ordinateur)" aria-label="Image de l’acte">🖼️</button></nav>
                <section class="h-tx-left">
                    <div class="h-tx-barwrap" data-tx-barwrap>${TV.toolbarHtml(t.data.view)}</div>
                    <div class="h-tx-stage" data-tx-stage tabindex="-1"><svg data-tx-svg><g data-tx-world><image data-tx-img/><g data-tx-zones></g><g data-tx-handles></g><rect data-tx-draw class="h-tx-draw" hidden/></g></svg><canvas class="h-tx-loupe" data-tx-loupe hidden aria-hidden="true"></canvas><p class="h-tx-empty" data-tx-empty>Choisis l’image de l’acte : « 🖼️ Image… » (une photo de la base, ou un fichier de l’ordinateur).</p></div>
                    <div class="h-tx-zonebar" data-tx-zonebar hidden></div>
                </section>
                <section class="h-tx-right">
                    <div class="h-tx-tools"><button type="button" data-tx-cmd="ocr" title="Lire un texte imprimé ou tapé (pose aussi les zones ligne par ligne)">🔎 Lire (imprimé)</button><button type="button" data-tx-cmd="htr" title="Reconnaissance d’écriture manuscrite, si un modèle est installé (Réglages)" data-help="La lecture d’une écriture à la main (HTR) : elle demande un modèle installé dans les Réglages. Relis toujours : elle se trompe sur les noms." data-help-faq="transcription">✍️ Lire (manuscrit)</button>
                        <select data-tx-lang title="Langue du texte"><option value="fra">Français</option><option value="lat">Latin</option><option value="fra+lat">Français + latin</option><option value="eng">Anglais</option><option value="deu">Allemand</option><option value="ita">Italien</option><option value="spa">Espagnol</option></select>
                        <button type="button" data-tx-cmd="template" title="Un modèle d’acte à compléter">📋 Modèle</button><button type="button" data-tx-cmd="detect" title="Repérer les noms, dates, lieux et métiers" data-help="Cherche dans le texte les noms (avec leur rôle : parrain, témoin…), les dates (même en toutes lettres ou au calendrier républicain), les lieux et les métiers, pour les relier aux fiches.">🧭 Repérer</button><span class="spacer"></span>
                        <details class="h-tx-more"><summary>Plus ▾</summary><div><button type="button" data-tx-cmd="tomedia">↪ Mettre le texte dans le média</button><button type="button" data-tx-cmd="copy">📋 Copier le texte</button><label class="ui-toggle h-tx-useenh" title="La lecture (imprimé et manuscrit) et l’export prennent l’image avec les réglages « Mieux voir » (contraste, netteté, canal, seuil…), sinon l’image d’origine"><input type="checkbox" data-tx-useenh ${useEnh() ? 'checked' : ''}><i></i>Lire et exporter l’image améliorée</label></div></details></div>
                    <div class="h-tx-chars">${SPECIAL.map(c => `<button type="button" data-tx-char="${esc(c)}" title="Insérer ${esc(c)}">${esc(c)}</button>`).join('')}</div>
                    <div class="h-tx-editor"><div class="h-tx-mirror" data-tx-mirror aria-hidden="true"></div><textarea data-tx-body spellcheck="false" placeholder="La transcription, ligne à ligne comme sur l’acte. Choisis un passage, puis dessine sa zone sur l’image (▭ Zone) : les deux restent liés.">${esc(t.body)}</textarea></div>
                    <div class="h-tx-found" data-tx-found></div>
                </section>
            </div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'transcribe', true); dlg.showModal(); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        const $ = s => dlg.querySelector(s), area = $('[data-tx-body]'), mirror = $('[data-tx-mirror]'), svg = $('[data-tx-svg]'), world = $('[data-tx-world]'), img = $('[data-tx-img]'), stage = $('[data-tx-stage]');
        const UI = window.LCNDA_UI || {}, STATES = {'modifié': 'dirty', '✓ Enregistré': 'saved', 'Enregistrement…': 'saving'};
        const status = s => { const el = $('[data-tx-status]'); el.title = s || ''; if (STATES[s] && UI.savedStatus) UI.savedStatus(el, STATES[s]); else el.textContent = s || ''; };
        let commitT = 0, HX = null, txBar = null; // E1 : un vrai historique ↶ ↷ (texte, zones, personnes, réglages de l'image, fiche de l'acte) ; K18 : la barre du bas
        const flushCommit = () => { if (commitT) { clearTimeout(commitT); commitT = 0; } HX?.commit(); };
        const touch = () => { dirty = true; status('modifié'); clearTimeout(commitT); commitT = setTimeout(() => { commitT = 0; HX?.commit(); }, 450); };
        // E4 : une image glissée (ou collée) sur l'acte entre dans les Médias et devient l'image de l'acte
        UI.bindFileDrop?.(stage, async files => {
            const f = files[0], fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'image'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', A().state.csrf);
            try { const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                if (t.data.zones.length && !await A().confirmBox('Elles étaient posées pour l’ancienne image.', {title: 'Garder les zones déjà posées ?', okLabel: 'Garder les zones', cancelLabel: 'Les retirer', danger: false})) { snap(); t.data.zones = []; }
                t.media_id = Number(j.result.media_id); t.filename = j.result.filename; touch(); await loadImage(); toast('L’image est dans les Médias et devient l’image de l’acte.');
            } catch (e) { toast(`${f.name} : ${e.message}`, 'error'); }
        }, {accept: 'image/*'});
        /* ─── l'image ─── */
        /* De l'image (pixels de l'acte) à l'écran : miroir, rotation de 90° en 90° et redressement fin autour du centre,
         * puis décalage pour que le cadre englobant commence en (0, 0). Les zones restent en pixels de l'image. */
        let M = new DOMMatrix(), Mi = new DOMMatrix(), WH = [0, 0];
        const mstr = m => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
        const rotPt = (x, y) => { const p = M.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };
        const unrot = (X, Y) => { const p = Mi.transformPoint(new DOMPoint(X, Y)); return [p.x, p.y]; };
        const vecToImg = (dx, dy) => [Mi.a * dx + Mi.c * dy, Mi.b * dx + Mi.d * dy];
        const vecToScr = (dx, dy) => [M.a * dx + M.c * dy, M.b * dx + M.d * dy];
        function geom({keepCenter = true} = {}) {
            if (!imgW) return;
            const v = t.data.view, cx = imgW / 2, cy = imgH / 2, before = keepCenter ? rotPt(cx, cy) : null;
            const A0 = new DOMMatrix().translate(cx, cy).scale(v.mirror ? -1 : 1, 1).rotate((v.rot || 0) + (v.tilt || 0)).translate(-cx, -cy);
            const pts = [[0, 0], [imgW, 0], [0, imgH], [imgW, imgH]].map(([x, y]) => A0.transformPoint(new DOMPoint(x, y))), xs = pts.map(q => q.x), ys = pts.map(q => q.y);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            M = new DOMMatrix().translate(-minX, -minY).multiply(A0); Mi = M.inverse(); WH = [Math.max(...xs) - minX, Math.max(...ys) - minY];
            const tr = mstr(M); img.setAttribute('transform', tr); $('[data-tx-zones]').setAttribute('transform', tr); $('[data-tx-draw]').setAttribute('transform', tr);
            if (before) { const [ax, ay] = rotPt(cx, cy); panX += (before[0] - ax) * zoom; panY += (before[1] - ay) * zoom; } // le centre de l'image ne bouge pas à l'écran
        }
        const rotWH = () => WH;
        const FIT = {page: 'Toute l’image', width: 'Largeur', real: '100 %'}, FIT_NEXT = {page: 'width', width: 'real', real: 'page'};
        const FIT_HELP = {page: 'Toute l’image', width: 'Largeur (l’image prend toute la largeur, le mieux pour lire)', real: 'Taille réelle (100 %)'};
        const fitZoom = mode => { const r = stage.getBoundingClientRect(), [w, h] = rotWH(); return mode === 'real' ? 1 : clamp(mode === 'width' ? (r.width - 20) / w : Math.min((r.width - 20) / w, (r.height - 20) / h), .02, 20); };
        function paintZoomLabel() {
            const b = $('[data-tx-zoomlab]'); if (!b) return;
            const on = fitOn && !!imgW, now = on ? FIT[fitMode] : `${Math.round(zoom * 100)} %`, next = FIT_NEXT[on ? fitMode : 'real'];
            $('[data-tx-zoomtxt]').textContent = now; b.dataset.fit = on ? fitMode : '';
            b.title = `Zoom : ${on ? FIT_HELP[fitMode] : now}. Clic : ${FIT_HELP[next]} (puis ${FIT_HELP[FIT_NEXT[next]]}, ${FIT_HELP[FIT_NEXT[FIT_NEXT[next]]]})`;
        }
        const applyView = () => { world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`); paintOverlay(); paintZoomLabel(); txBar?.sync(); };
        /** ⤢ : trois façons d'ajuster — toute l'image, la largeur (on lit l'acte de haut en bas), la taille réelle (100 %) */
        function applyFit(mode = 'page', {keepY = false} = {}) {
            if (!imgW) return; const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
            const [w, h] = rotWH(), z = fitZoom(mode), cx = r.width / 2, cy = r.height / 2;
            if (mode === 'page') { panX = (r.width - w * z) / 2; panY = (r.height - h * z) / 2; }
            else if (mode === 'width') { panX = (r.width - w * z) / 2; panY = h * z <= r.height ? (r.height - h * z) / 2 : keepY ? clamp(panY * z / zoom, r.height - 10 - h * z, 10) : 10; }
            else { const wx = (cx - panX) / zoom, wy = (cy - panY) / zoom; panX = w * z <= r.width ? (r.width - w * z) / 2 : cx - wx * z; panY = h * z <= r.height ? (r.height - h * z) / 2 : cy - wy * z; }
            zoom = z; fitMode = mode; fitOn = true; applyView();
        }
        const fit = () => applyFit('page');
        /** zoom autour d'un point de l'écran (la souris, le milieu des deux doigts, le centre pour ＋ et －) */
        const zoomAt = (z, cx, cy) => { z = clamp(z, .02, 20); fitOn = false; panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; applyView(); };
        /* ─── « 🎚️ Mieux voir » : filtre CSS rapide, ou calcul pixel par pixel dans un Web Worker ─── */
        let enh = null, enhFor = '', srcEl = null, processed = false, loupeImg = null, srcP = null, srcFailed = '';
        const origSrc = () => `media/${encodeURIComponent(t.filename)}`;
        const setHref = u => { if (img.getAttribute('href') !== u) img.setAttribute('href', u); if (loupeImg?.dataset.u !== u) { loupeImg = new Image(); loupeImg.dataset.u = u; loupeImg.src = u; } };
        const getEnh = () => enh || (enh = TV.enhancer((u, info) => { if (!TV.needsPixels(t.data.view)) return; processed = true; img.style.filter = ''; setHref(u); dlg.dataset.txMs = String(Math.round(info.ms)); dlg.dataset.txRender = info.preview ? 'preview' : 'full'; dlg.dataset.txRenders = String(Number(dlg.dataset.txRenders || 0) + 1); }));
        /** l'image de l'acte préparée dans le worker, une seule fois (plusieurs curseurs bougés pendant la préparation l'attendent) ; false : impossible */
        function ensureSource() {
            getEnh();
            if (enhFor === t.filename && (srcP || enh.hasSource())) return srcP || Promise.resolve(true);
            enhFor = t.filename; dlg.dataset.txRender = 'source'; const t0 = performance.now(), forFile = t.filename;
            const p = srcP = enh.source(srcEl, imgW, imgH).then(ok => { if (srcP === p) srcP = null; if (!ok && enhFor === forFile) enhFor = ''; dlg.dataset.txSourceMs = String(Math.round(performance.now() - t0)); return ok; });
            return p;
        }
        async function applyImage({preview = false} = {}) {
            if (!imgW || !t.filename) return;
            const v = t.data.view;
            if (TV.needsPixels(v)) {
                getEnh();
                if (enh.ok && srcFailed !== t.filename) {
                    const wasReady = enhFor === t.filename && enh.hasSource(); if (!wasReady) status('Préparation de l’image…');
                    const ready = await ensureSource(); if (!wasReady) status('');
                    if (!dlg.isConnected) return; // l'outil a été fermé pendant la préparation
                    if (ready) { enh.render(t.data.view, {preview}); paintBadge(); return; }
                    if (srcFailed !== t.filename) { srcFailed = t.filename; toast('« Mieux voir » : cette image n’a pas pu être préparée (trop grande ou abîmée) ; seuls contraste, luminosité, négatif et gris s’appliquent.', 'error'); }
                } else if (!enh.ok && !applyImage.warned) { applyImage.warned = true; toast('Ce navigateur ne sait pas calculer ces réglages : seuls contraste, luminosité, négatif et gris s’appliquent.', 'error'); }
            }
            processed = false; setHref(origSrc()); img.style.filter = TV.cssFilter(v); paintBadge();
        }
        /** un réglage de l'image a changé (curseur : aperçu rapide pendant qu'on le bouge) */
        function setView(k, val, {preview = false} = {}) {
            t.data.view[k] = val; touch();
            if (k === 'tilt' || k === 'mirror' || k === 'rot') { geom({keepCenter: !fitOn}); if (fitOn) applyFit(fitMode); else applyView(); paintBadge(); return; }
            applyImage({preview});
        }
        /** les curseurs et cases suivent les réglages (après ↺ Origine, ↶ Annuler…) */
        function syncControls() {
            const v = t.data.view;
            dlg.querySelectorAll('[data-tx-barwrap] [data-tx-view]').forEach(i => { if (i.type === 'checkbox') i.checked = !!v[i.dataset.txView]; else i.value = String(v[i.dataset.txView]); });
            dlg.querySelectorAll('[data-tx-chan]').forEach(b => { const on = b.dataset.txChan === v.channel; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            paintBadge();
        }
        function paintBadge() { const b = $('[data-tx-badge]'); if (!b) return; const n = TV.changedCount(t.data.view, TV.panelKeys(TV.barCfg(), narrow)); b.hidden = !n; b.textContent = String(n); b.title = n ? `${n} réglage${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''} dans « Mieux voir »` : ''; }
        async function loadImage() {
            const has = !!t.filename; $('[data-tx-empty]').hidden = has; img.style.display = has ? '' : 'none'; if (!has) return;
            const src = origSrc();
            imgW = imgH = 0; srcEl = null; enhFor = ''; // une autre image : rien de l'ancienne ne reste (taille, préparation « Mieux voir »)
            await new Promise(res => { const i = new Image(); i.onload = () => { imgW = i.naturalWidth; imgH = i.naturalHeight; srcEl = i; res(); }; i.onerror = () => { toast('Image de l’acte illisible.', 'error'); res(); }; i.src = src; });
            if (!dlg.isConnected) return;
            img.setAttribute('width', imgW); img.setAttribute('height', imgH); geom({keepCenter: false}); setHref(src); applyFit('page'); await applyImage(); drawZones();
        }
        /* ─── les zones et le texte surligné ─── */
        const colorOf = (z, i) => z.c || COLORS[i % COLORS.length];
        function paintZoneRects() {
            const g = $('[data-tx-zones]'), sw = 2 / zoom;
            g.innerHTML = t.data.zones.map((z, i) => `<rect data-tx-zone="${esc(z.id)}"${selZone === z.id ? ' class="is-sel"' : ''} x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${colorOf(z, i)}" fill-opacity="${selZone === z.id ? .38 : .2}" stroke="${colorOf(z, i)}" stroke-width="${selZone === z.id ? sw * 2 : sw}"><title>${esc(t.body.slice(z.s, z.e).slice(0, 120) || z.note || 'Zone non reliée')}${selZone === z.id ? ' — glisse pour la déplacer, tire une poignée pour la redimensionner (flèches, Maj + flèches)' : ''}</title></rect>`).join('');
            paintHandles();
        }
        function drawZones() { paintZoneRects(); paintMirror(); paintZoneBar(); paintTxBar(); }
        /* ─── la zone choisie : 8 poignées (coins et milieux), toujours de la même taille à l'écran ─── */
        // les poignées sont nommées dans l'image (nw = coin haut-gauche de l'image) ; leur curseur suit leur direction à l'écran
        const HANDLES = [['n', .5, 0], ['e', 1, .5], ['s', .5, 1], ['w', 0, .5], ['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]]; // les coins par-dessus
        const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
        const cursorFor = (fx, fy) => { const [sx, sy] = vecToScr(fx - .5, fy - .5), a = ((Math.atan2(sy, sx) * 180 / Math.PI) % 180 + 180) % 180; return CURSORS[Math.round(a / 45) % 4]; };
        const HANDLE_PX = 11; // côté d'une poignée à l'écran (un peu plus au doigt)
        let coarse = false; // un doigt : des poignées plus grandes
        function paintHandles() {
            const g = $('[data-tx-handles]'), z = t.data.zones.find(q => q.id === selZone);
            if (!z || !imgW) { g.innerHTML = ''; return; }
            const hpx = coarse ? 20 : HANDLE_PX, hs = hpx / zoom, sw = 1.5 / zoom;
            if (!g.firstChild) g.innerHTML = '<polygon class="h-tx-sel-frame"/>' + HANDLES.map(([k]) => `<rect class="h-tx-handle" data-tx-h="${k}"><title>Tirer pour redimensionner</title></rect>`).join('');
            const set = (el, o) => Object.entries(o).forEach(([a, v]) => el.setAttribute(a, v)); // les mêmes éléments, déplacés (pas de clignotement sous le doigt)
            const at = (fx, fy) => rotPt(z.x + z.w * fx, z.y + z.h * fy);
            set(g.firstChild, {points: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([fx, fy]) => at(fx, fy).join(',')).join(' '), 'stroke-width': sw, 'stroke-dasharray': `${4 / zoom} ${3 / zoom}`});
            // une petite zone : les poignées des milieux s'effacent, pour que les coins restent faciles à attraper
            const scrLen = (dx, dy) => Math.hypot(...vecToScr(dx, dy)) * zoom, tightW = scrLen(z.w, 0) < hpx * 3, tightH = scrLen(0, z.h) < hpx * 3;
            HANDLES.forEach(([k, fx, fy], i) => { const [X, Y] = at(fx, fy), el = g.children[i + 1];
                set(el, {x: X - hs / 2, y: Y - hs / 2, width: hs, height: hs, rx: hs / 5, 'stroke-width': sw, display: ((k === 'n' || k === 's') && tightW) || ((k === 'e' || k === 'w') && tightH) ? 'none' : 'inline'}); el.style.cursor = cursorFor(fx, fy); });
        }
        // au zoom, seules les épaisseurs et les poignées changent : pas besoin de tout redessiner
        function paintOverlay() { const sw = 2 / zoom; $('[data-tx-zones]')?.querySelectorAll('rect').forEach(r => r.setAttribute('stroke-width', r.classList.contains('is-sel') ? sw * 2 : sw)); paintHandles(); }
        function paintMirror() {
            const text = area.value, marks = [];
            t.data.zones.forEach((z, i) => { if (z.e > z.s) marks.push({s: z.s, e: z.e, c: colorOf(z, i), on: selZone === z.id}); });
            found.forEach(f => marks.push({s: f.s, e: f.e, cls: `is-${f.type}`}));
            marks.sort((a, b) => a.s - b.s); let h = '', pos = 0;
            marks.forEach(m => { if (m.s < pos) return; h += esc(text.slice(pos, m.s)); h += `<mark class="${m.cls || ''}${m.on ? ' is-on' : ''}" ${m.c ? `style="background:${m.c}${m.on ? '' : '66'}"` : ''}>${esc(text.slice(m.s, m.e))}</mark>`; pos = m.e; });
            mirror.innerHTML = h + esc(text.slice(pos)) + '\n';
            mirror.scrollTop = area.scrollTop;
        }
        function paintZoneBar() {
            const bar = $('[data-tx-zonebar]'), z = t.data.zones.find(q => q.id === selZone); bar.hidden = !z; if (!z) return;
            const linked = z.e > z.s;
            bar.innerHTML = `<b>Zone</b> ${linked ? `« ${esc(t.body.slice(z.s, z.e).slice(0, 60))}${z.e - z.s > 60 ? '…' : ''} »` : '<span class="muted">pas encore reliée au texte</span>'}
                <button type="button" class="button small secondary" data-tx-zlink title="Relier cette zone au passage choisi dans le texte">🔗 Au passage choisi</button><input data-tx-znote placeholder="Note (mot illisible, signature…)" value="${esc(z.note || '')}" maxlength="300"><input type="color" data-tx-zcolor value="${esc(z.c || COLORS[t.data.zones.indexOf(z) % COLORS.length])}" title="Couleur"><button type="button" class="button small danger" data-tx-zdel title="Supprimer la zone (Suppr) — « ↶ Annuler » la remet">🗑</button>
                <small class="muted h-tx-zkeys" title="Glisse la zone pour la déplacer, tire une des 8 poignées pour changer sa taille">↔ glisser · poignées · flèches · Maj + flèches · ⌘Z</small>`;
        }
        /* ─── ⌘Z / ⇧⌘Z pour les zones (le texte garde l'annulation de la case) ─── */
        const hist = {undo: [], redo: []}, cloneZones = () => t.data.zones.map(z => ({...z}));
        /** à appeler juste AVANT de changer les zones */
        const snap = () => flushCommit(); // l'état d'avant est gardé dans l'historique
        function undoZones(redo = false) {
            flushCommit(); const ok = HX ? (redo ? HX.redo() : HX.undo()) : false;
            status(ok ? (redo ? '↷ Rétabli' : '↶ Annulé') : (redo ? 'Rien à rétablir' : 'Rien à annuler')); return ok;
        }
        /** H7 : la zone part tout de suite, « ↶ Annuler » la remet à sa place (liée au même passage) */
        function deleteZone(id = selZone) {
            const i = t.data.zones.findIndex(q => q.id === id); if (i < 0) return; const gone = {...t.data.zones[i]};
            snap(); t.data.zones.splice(i, 1); if (selZone === id) selZone = null; touch(); drawZones();
            const put = () => { if (!t.data.zones.some(q => q.id === gone.id)) { snap(); t.data.zones.splice(Math.min(i, t.data.zones.length), 0, {...gone}); selZone = gone.id; touch(); drawZones(); } };
            const del = () => { if (t.data.zones.some(q => q.id === gone.id)) { snap(); t.data.zones = t.data.zones.filter(q => q.id !== gone.id); if (selZone === gone.id) selZone = null; touch(); drawZones(); } };
            (A().undoToast || toast)('Zone supprimée', {undo: put, redo: del});
        }
        /** garder les liens quand on écrit : les passages après la modification se décalent */
        let before = area.value;
        area.addEventListener('input', () => {
            const now = area.value; let p = 0; while (p < before.length && p < now.length && before[p] === now[p]) p++;
            let q = 0; while (q < before.length - p && q < now.length - p && before[before.length - 1 - q] === now[now.length - 1 - q]) q++;
            const oldEnd = before.length - q, delta = now.length - before.length;
            const shift = r => { const f = v => v >= oldEnd ? v + delta : v > p ? Math.max(p, Math.min(v, p + (now.length - q - p))) : v; r.s = f(r.s); r.e = Math.max(r.s, f(r.e)); };
            t.data.zones.forEach(shift); t.data.people.forEach(shift); found.forEach(shift); [...hist.undo, ...hist.redo].forEach(list => list.forEach(shift));
            before = now; t.body = now; touch(); paintMirror(); paintPeople();
        });
        area.addEventListener('scroll', () => { mirror.scrollTop = area.scrollTop; });
        // un clic dans le texte : la zone qui contient cet endroit s'allume
        area.addEventListener('click', () => { const c = area.selectionStart, z = t.data.zones.find(q => q.e > q.s && c >= q.s && c <= q.e); if (z && z.id !== selZone) { selZone = z.id; drawZones(); reveal(z); } });
        const reveal = z => { const r = stage.getBoundingClientRect(); const cx = z.x + z.w / 2, cy = z.y + z.h / 2; const [X, Y] = rotPt(cx, cy); if (X * zoom + panX < 0 || X * zoom + panX > r.width || Y * zoom + panY < 0 || Y * zoom + panY > r.height) { panX = r.width / 2 - X * zoom; panY = r.height / 2 - Y * zoom; applyView(); } };
        const selectText = (z, focus = true) => { if (!(z?.e > z?.s)) return; if (focus) area.focus(); area.setSelectionRange(z.s, z.e); const lineH = parseFloat(getComputedStyle(area).lineHeight) || 20, lines = area.value.slice(0, z.s).split('\n').length; area.scrollTop = Math.max(0, (lines - 3) * lineH); mirror.scrollTop = area.scrollTop; };
        /* ─── glisser sur l'image : déplacer l'image, dessiner une zone, déplacer ou redimensionner la zone choisie ─── */
        let drag = null, space = false, pinch = null;
        const pointers = new Map();
        const toRot = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom]; };
        const toImg = e => unrot(...toRot(e));
        const minSide = () => Math.max(4, 12 / zoom); // une zone garde au moins 12 points d'écran (4 de l'image)
        /** la zone choisie, déplacée (mode « move ») ou tirée par une poignée (nw, n, ne, e, se, s, sw, w), en pixels de l'image :
         *  elle ne sort pas de l'image et garde une taille minimale */
        function editRect(R0, mode, dx, dy) {
            const W = imgW, H = imgH, m = Math.min(minSide(), W, H);
            if (mode === 'move') return {x: clamp(R0.x + dx, 0, Math.max(0, W - R0.w)), y: clamp(R0.y + dy, 0, Math.max(0, H - R0.h)), w: R0.w, h: R0.h};
            let x1 = R0.x, y1 = R0.y, x2 = R0.x + R0.w, y2 = R0.y + R0.h;
            if (mode.includes('w')) x1 = clamp(x1 + dx, 0, x2 - m); if (mode.includes('e')) x2 = clamp(x2 + dx, x1 + m, W);
            if (mode.includes('n')) y1 = clamp(y1 + dy, 0, y2 - m); if (mode.includes('s')) y2 = clamp(y2 + dy, y1 + m, H);
            return {x: x1, y: y1, w: x2 - x1, h: y2 - y1};
        }
        const setGeom = (z, R) => Object.assign(z, {x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.w), h: Math.round(R.h)});
        const pickZone = (id, {showText = true} = {}) => { const z = t.data.zones.find(q => q.id === id); if (!z) return null; if (selZone !== id) { selZone = id; drawZones(); } if (showText) selectText(z, false); stage.focus({preventScroll: true}); return z; };
        svg.addEventListener('pointerdown', e => {
            if (!imgW) return;
            coarse = e.pointerType === 'touch';
            pointers.set(e.pointerId, {x: e.clientX, y: e.clientY}); try { svg.setPointerCapture(e.pointerId); } catch (_) {}
            if (pointers.size >= 2) { // deux doigts : pincer pour zoomer (ce qui avait commencé avec le premier doigt est oublié)
                if (drag?.edit && drag.moved) { Object.assign(drag.z, drag.orig); drawZones(); }
                drag = null; $('[data-tx-draw]').hidden = true;
                const [a, b] = [...pointers.values()], r = svg.getBoundingClientRect();
                pinch = {d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom, wx: ((a.x + b.x) / 2 - r.left - panX) / zoom, wy: ((a.y + b.y) / 2 - r.top - panY) / zoom}; return;
            }
            if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
            const hd = e.target.closest('[data-tx-h]'), zr = e.target.closest('[data-tx-zone]'), mainBtn = e.button === 0 && !space;
            if (mainBtn && hd && selZone) { const z = t.data.zones.find(q => q.id === selZone); if (z) { stage.focus({preventScroll: true}); drag = {edit: hd.dataset.txH, z, orig: {x: z.x, y: z.y, w: z.w, h: z.h}, R0: {x: z.x, y: z.y, w: z.w, h: z.h}, p0: toImg(e), c0: [e.clientX, e.clientY], before: cloneZones(), moved: false}; stage.dataset.drag = hd.style.cursor.replace('-resize', ''); e.preventDefault(); return; } }
            if (mainBtn && zr && (tool !== 'zone' || zr.dataset.txZone === selZone)) { // un clic sur une zone la choisit ; glisser la déplace
                const z = pickZone(zr.dataset.txZone); if (z) { drag = {edit: 'move', z, orig: {x: z.x, y: z.y, w: z.w, h: z.h}, R0: {x: z.x, y: z.y, w: z.w, h: z.h}, p0: toImg(e), c0: [e.clientX, e.clientY], before: cloneZones(), moved: false}; e.preventDefault(); return; }
            }
            if (tool === 'zone' && mainBtn) { const [x, y] = toImg(e); drag = {zone: true, x0: x, y0: y, x1: x, y1: y}; return; }
            drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY};
        });
        svg.addEventListener('pointermove', e => {
            if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
            if (pinch && pointers.size >= 2) { const [a, b] = [...pointers.values()], r = svg.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
                zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .02, 20); fitOn = false; panX = mx - pinch.wx * zoom; panY = my - pinch.wy * zoom; applyView(); return; }
            if (!drag) return;
            if (drag.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); return; }
            if (drag.edit) {
                const [x, y] = toImg(e), dx = x - drag.p0[0], dy = y - drag.p0[1];
                if (!drag.moved && Math.hypot(e.clientX - drag.c0[0], e.clientY - drag.c0[1]) < 3) return; // un simple clic ne bouge rien
                drag.moved = true; setGeom(drag.z, editRect(drag.R0, drag.edit, dx, dy)); paintZoneRects(); return;
            }
            const [x, y] = toImg(e); drag.x1 = x; drag.y1 = y; const r = $('[data-tx-draw]'); // en pixels de l'image (elle tourne avec l'image) : c'est la zone qui sera posée
            r.hidden = false; r.setAttribute('x', Math.min(drag.x0, x)); r.setAttribute('y', Math.min(drag.y0, y)); r.setAttribute('width', Math.abs(x - drag.x0)); r.setAttribute('height', Math.abs(y - drag.y0)); r.setAttribute('stroke-width', 2 / zoom);
        });
        const endPointer = e => {
            pointers.delete(e.pointerId); if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
            const d = drag; drag = null; delete stage.dataset.drag; $('[data-tx-draw]').hidden = true; if (!d) return;
            if (d.edit) { if (d.moved && e.type !== 'pointercancel') { hist.undo.push(d.before); hist.redo = []; touch(); drawZones(); status(d.edit === 'move' ? 'Zone déplacée (⌘Z pour annuler)' : 'Zone redimensionnée (⌘Z pour annuler)'); } else if (d.moved) { Object.assign(d.z, d.orig); drawZones(); } return; }
            if (!d.zone || e.type === 'pointercancel') return;
            const x = clamp(Math.min(d.x0, d.x1), 0, imgW), y = clamp(Math.min(d.y0, d.y1), 0, imgH), w = Math.min(imgW - x, Math.abs(d.x1 - d.x0)), h = Math.min(imgH - y, Math.abs(d.y1 - d.y0));
            if (w < 4 || h < 4) return;
            const s = area.selectionStart, e2 = area.selectionEnd, z = {id: zid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), s: e2 > s ? s : 0, e: e2 > s ? e2 : 0, note: '', c: ''};
            snap(); t.data.zones.push(z); selZone = z.id; touch(); drawZones(); stage.focus({preventScroll: true});
            status(e2 > s ? 'Zone reliée au passage choisi' : 'Zone posée : choisis son passage dans le texte, puis « 🔗 Au passage choisi »');
        };
        svg.addEventListener('pointerup', endPointer); svg.addEventListener('pointercancel', endPointer);
        stage.addEventListener('wheel', e => { e.preventDefault(); if (loupe.on && !lc.hidden) { loupe.mag = clamp(loupe.mag * Math.exp(-e.deltaY * .002), 1.5, 12); paintLoupe(e.clientX, e.clientY); return; } const r = svg.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top; if (e.ctrlKey || e.metaKey || !e.deltaX) zoomAt(zoom * Math.exp(-e.deltaY * .0022), cx, cy); else { panX -= e.deltaX; panY -= e.deltaY; applyView(); } }, {passive: false});
        /** clavier sur la zone choisie : flèches = déplacer, Maj + flèches = redimensionner (côté droit / bas), Alt = au point près */
        let keyEdit = 0;
        function nudgeZone(key, resize, fine) {
            const z = t.data.zones.find(q => q.id === selZone); if (!z) return;
            const st = fine ? 1 / zoom : Math.max(1, 6 / zoom), sx = key === 'ArrowLeft' ? -st : key === 'ArrowRight' ? st : 0, sy = key === 'ArrowUp' ? -st : key === 'ArrowDown' ? st : 0;
            const [dx, dy] = vecToImg(sx, sy); // les flèches vont dans le sens de l'écran, même image tournée ou retournée
            if (Date.now() - keyEdit > 900) snap(); keyEdit = Date.now(); // une série de flèches = une seule annulation
            // Maj : on tire le coin qui est en bas à droite à l'écran
            const corner = resize ? [['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]].map(([k, fx, fy]) => { const [X, Y] = rotPt(z.x + z.w * fx, z.y + z.h * fy); return [k, X + Y]; }).sort((a, b) => b[1] - a[1])[0][0] : 'move';
            setGeom(z, editRect({x: z.x, y: z.y, w: z.w, h: z.h}, corner, dx, dy)); touch(); paintZoneRects(); reveal(z);
        }
        const TOOL_HELP = {pan: 'Glisse pour déplacer l’image (ou barre d’espace) · molette : zoomer · clic sur une zone : la choisir', zone: 'Choisis un passage dans le texte, puis dessine son rectangle sur l’image : les deux restent liés'};
        function paintTxBar() { if (!txBar) return; txBar.setHelp(TOOL_HELP[tool] || ''); txBar.setWhere(imgW ? `${imgW} × ${imgH} px · ${A().plural ? A().plural(t.data.zones.length, 'zone') : t.data.zones.length + ' zones'}` : 'Pas encore d’image'); txBar.sync(); }
        const setTool = k => { tool = k; dlg.querySelectorAll('[data-tx-tool]').forEach(b => { b.classList.toggle('is-active', b.dataset.txTool === k); b.setAttribute('aria-pressed', String(b.dataset.txTool === k)); }); stage.dataset.tool = k; paintTxBar(); };
        setTool('pan');
        /* ─── ce qui est repéré : noms (et fiches), dates, lieux, métiers ─── */
        function paintPeople() {
            const box = $('[data-tx-found]'), people = t.data.people;
            const kept = people.length ? `<h4>Personnes de l’acte</h4><ul class="h-tx-people">${people.map((p, i) => `<li><button type="button" class="link-button" data-tx-goto="${p.s}:${p.e}">${esc(p.name)}</button>
                <select data-tx-prole="${i}" title="Rôle dans l’acte">${['', 'sujet', 'parent', 'conjoint', 'conjoint défunt', 'défunt', 'parrain', 'marraine', 'témoin', 'déclarant', 'officiant', 'officier', 'notaire', 'autre'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r || '— rôle —'}</option>`).join('')}</select>
                ${p.person_id ? `<button type="button" class="h-tx-linked" data-tx-popen="${p.person_id}" title="Ouvrir la fiche">👤 fiche n° ${p.person_id}</button><button type="button" class="link-button" data-tx-punlink="${i}">délier</button>` : `<button type="button" class="button small secondary" data-tx-plink="${i}">🔗 Fiche…</button>`}<button type="button" class="icon-button" data-tx-pdel="${i}" title="Retirer">×</button></li>`).join('')}</ul>` : '';
            const groups = [['person', '👤 Noms repérés'], ['date', '📅 Dates'], ['place', '📍 Lieux'], ['job', '🔨 Métiers']].map(([k, l]) => { const list = found.filter(f => f.type === k); if (!list.length) return '';
                return `<h4>${l} <small class="muted">${list.length}</small>${k === 'person' ? ' <button type="button" class="link-button" data-tx-keepall>tout garder</button>' : ''}</h4><div class="h-tx-chips">${list.map(f => `<span class="h-tx-chip is-${k}"><button type="button" data-tx-goto="${f.s}:${f.e}" title="Montrer dans le texte">${esc(f.label)}${f.role ? ` <i>${esc(f.role)}</i>` : ''}</button>${k === 'person' ? `${(matchCache.get(f.label) || []).slice(0, 2).map(m => `<button type="button" class="h-tx-match" data-tx-match="${found.indexOf(f)}:${m.id}" title="Garder et relier à cette fiche">↔ ${esc(m.name)} <small>${esc(m.years)}</small></button>`).join('')}<button type="button" data-tx-keep="${found.indexOf(f)}" title="Garder dans les personnes de l’acte">＋</button>` : k === 'date' && f.iso ? `<button type="button" data-tx-setdate="${esc(f.label)}" title="Date de l’acte">⇢ date</button>` : k === 'place' ? `<button type="button" data-tx-setplace="${esc(f.label)}" title="Lieu de l’acte">⇢ lieu</button>` : ''}</span>`).join('')}</div>`; }).join('');
            box.innerHTML = kept + groups || '<p class="muted h-tx-hint">« 🧭 Repérer » cherche dans le texte les noms (et leur rôle : parrain, témoin, fils de…), les dates (même en toutes lettres, ou au calendrier républicain), les lieux et les métiers, et propose les fiches de ta base qui leur ressemblent.</p>';
        }
        async function runDetect() {
            found = detect(area.value);
            const names = [...new Set(found.filter(f => f.type === 'person').map(f => f.label))].filter(n => !matchCache.has(n));
            if (names.length) { try { const r = await post('act_match_people', {names}); (r.result || []).forEach((list, i) => matchCache.set(names[i], list)); } catch (_) {} }
            paintMirror(); paintPeople(); status(`${found.length} élément${found.length > 1 ? 's' : ''} repéré${found.length > 1 ? 's' : ''}`);
        }
        const keep = (f, personId = 0) => { if (t.data.people.some(p => p.s === f.s && p.e === f.e)) { if (personId) t.data.people.find(p => p.s === f.s && p.e === f.e).person_id = personId; } else t.data.people.push({name: f.label, role: f.role || '', person_id: personId, s: f.s, e: f.e}); touch(); paintPeople(); };
        function linkPerson(i) {
            const p = t.data.people[i];
            ext.openDialog({eyebrow: 'TRANSCRIPTION', title: `Relier « ${p.name} » à une fiche`, submitLabel: 'Relier',
                body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'tx_pick', kind: 'person', value: p.person_id || null})}</div>`,
                onOpen: dg => { const q = dg.querySelector('.pk-search:not([hidden]) .pk-input'); if (!q) return; q.value = p.name; setTimeout(() => { q.focus(); q.dispatchEvent(new Event('input', {bubbles: true})); }, 30); }, // les fiches du nom lu s’affichent tout de suite
                onSubmit: f => { const chosen = Number(f.elements.tx_pick?.value) || 0; if (!chosen) return window.LCNDA_UI.fail(f.elements.tx_pick, 'Choisis une fiche.'); p.person_id = chosen; touch(); paintPeople(); }});
        }
        $('[data-tx-found]').addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            if (d.txGoto) { const [s, en] = d.txGoto.split(':').map(Number); selectText({s, e: en}); const z = t.data.zones.find(q => q.s < en && s < q.e); if (z) { selZone = z.id; drawZones(); reveal(z); } return; }
            if (d.txKeep) return keep(found[Number(d.txKeep)]);
            if (d.txKeepall !== undefined) { found.filter(f => f.type === 'person').forEach(f => keep(f)); return; }
            if (d.txMatch) { const [fi, pid] = d.txMatch.split(':').map(Number); keep(found[fi], pid); toast('Personne gardée et reliée à sa fiche.'); return; }
            if (d.txSetdate) { t.date_text = d.txSetdate; $('[data-tx="date_text"]').value = d.txSetdate; touch(); return; }
            if (d.txSetplace) { t.place = d.txSetplace; $('[data-tx="place"]').value = d.txSetplace; touch(); return; }
            if (d.txPlink) return linkPerson(Number(d.txPlink));
            if (d.txPunlink) { t.data.people[Number(d.txPunlink)].person_id = 0; touch(); paintPeople(); return; }
            if (d.txPdel) { t.data.people.splice(Number(d.txPdel), 1); touch(); paintPeople(); return; }
            if (d.txPopen) { if (dirty && !await A().confirmBox('La transcription non enregistrée sera perdue (💾 d’abord).', {title: 'Ouvrir la fiche ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; teardown(); A().openPersonById?.(Number(d.txPopen)); }
        });
        $('[data-tx-found]').addEventListener('change', e => { const s = e.target.closest('[data-tx-prole]'); if (s) { t.data.people[Number(s.dataset.txProle)].role = s.value; touch(); } });
        /* ─── lecture automatique ─── */
        /** l'image pour la lecture (gris) ou l'export (couleurs) : améliorée (« Mieux voir », pleine taille) si c'est choisi dans « Plus ▾ ».
         *  Sans redressement ni miroir : les zones posées par la lecture restent en pixels de l'image. */
        async function filteredCanvas({gray = true} = {}) {
            const v = t.data.view, enhanced = useEnh();
            if (!imgW || !imgH) throw new Error('Image de l’acte illisible.');
            let i = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('Image de l’acte illisible.')); im.src = origSrc(); });
            if (enhanced && TV.needsPixels(v) && getEnh().ok) { srcEl = srcEl || i; if (!await ensureSource()) throw new Error('« Mieux voir » : cette image n’a pas pu être préparée.'); i = await createImageBitmap(await enh.full(v)); }
            const c = document.createElement('canvas'); c.width = imgW; c.height = imgH; const g = c.getContext('2d');
            const css = enhanced && !TV.needsPixels(v) ? TV.cssFilter(v) : '';
            g.filter = `${css}${gray ? ' grayscale(1)' : ''}`.trim() || 'none'; g.drawImage(i, 0, 0, imgW, imgH); return c;
        }
        const viewChanged = () => Object.entries(TV.DEFAULT_VIEW).some(([k, d]) => k !== 'rot' && k !== 'tilt' && k !== 'mirror' && String(t.data.view[k]) !== String(d));
        async function runOcr() {
            if (!t.filename) return toast('Choisis d’abord l’image de l’acte.', 'error');
            const lang = $('[data-tx-lang]').value; status('Chargement du lecteur…');
            try {
                const T = await A().loadOcrEngine(); status('Lecture de l’image…');
                const r = await T.recognize(await filteredCanvas(), lang);
                const dd = r?.data || {}, lines = (dd.lines?.length ? dd.lines : (dd.blocks || []).flatMap(bl => (bl.paragraphs || []).flatMap(pg => pg.lines || []))).filter(l => (l.text || '').trim() && l.bbox);
                if (!lines.length) { const plain = String(dd.text || '').trim(); if (!plain) { status(''); return toast('Aucun texte lu sur cette image (essaie le contraste, ou « Lire (manuscrit) »).', 'error'); }
                    area.value += (area.value.trim() ? '\n\n' : '') + plain; before = area.value; t.body = area.value; touch(); paintMirror(); status('Texte lu (à relire)'); return; }
                let text = area.value; if (text.trim()) text += '\n\n'; const start = text.length;
                const made = [];
                lines.forEach(l => { const s = text.length, line = l.text.replace(/\s+$/, ''); text += line + '\n'; const b = l.bbox; made.push({id: zid(), x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, s, e: s + line.length, note: '', c: ''}); });
                area.value = text; before = text; t.body = text; snap(); t.data.zones.push(...made); touch(); drawZones();
                status(`${lines.length} ligne${lines.length > 1 ? 's' : ''} lue${lines.length > 1 ? 's' : ''} (à relire)`); toast('Texte lu et zones posées ligne par ligne : relis et corrige.'); void start;
            } catch (e) { status(''); toast(e.message || 'Lecture impossible.', 'error'); }
        }
        async function runHtr() {
            if (!t.media_id) return toast('Choisis d’abord l’image de l’acte.', 'error');
            status('Reconnaissance de l’écriture…');
            try { const body = {media_id: t.media_id, model: $('[data-tx-lang]').value.startsWith('fra') ? 'fr-actes' : 'en-handwritten'};
                if (useEnh() && viewChanged()) { status('Préparation de l’image améliorée…'); const c = await filteredCanvas(); const b = await new Promise(r2 => c.toBlob(r2, 'image/jpeg', .92)); body.image_b64 = await new Promise(r2 => { const fr = new FileReader(); fr.onload = () => r2(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); }); status('Reconnaissance de l’écriture…'); }
                const r = await post('htr_recognize', body); const txt = String(r.result?.text || r.text || '').trim(); if (!txt) { status(''); return toast('Aucun texte reconnu.', 'error'); }
                area.value += (area.value.trim() ? '\n\n— Lu automatiquement (à relire) —\n' : '') + txt; before = area.value; t.body = area.value; touch(); paintMirror(); status('Texte manuscrit ajouté (à relire)'); }
            catch (e) { status(''); const m = e.message || 'Reconnaissance impossible.'; toast(/Réglages/.test(m) ? m : `${m} (Réglages → Reconnaissance d’écriture (HTR) pour installer un modèle)`, 'error'); } // le serveur dit déjà où l'installer : pas deux fois
        }
        /* ─── image : de la base ou de l'ordinateur ─── */
        async function pickImage() {
            const m = await ext.pickImage({eyebrow: 'TRANSCRIPTION', title: 'Image de l’acte', intro: 'Clique sur l’image de l’acte. Une image de l’ordinateur est ajoutée aux Médias.'}); if (!m) return;
            t.media_id = Number(m.id); t.filename = m.filename;
            if (!t.title && m.title && !m.imported) { t.title = m.title; $('[data-tx="title"]').value = t.title; }
            if (!area.value.trim() && m.transcription) { area.value = m.transcription; before = area.value; t.body = area.value; }
            if (t.data.zones.length && !await A().confirmBox('Elles étaient posées pour l’ancienne image.', {title: 'Garder les zones déjà posées ?', okLabel: 'Garder les zones', cancelLabel: 'Les retirer', danger: false})) { snap(); t.data.zones = []; }
            touch(); await loadImage();
        }
        /* ─── enregistrer, exporter ─── */
        async function save(toMedia = false) {
            ['title', 'kind', 'date_text', 'place', 'source'].forEach(k => { t[k] = $(`[data-tx="${k}"]`).value; }); t.body = area.value; t.data.status = $('[data-tx-state]').value;
            if (!t.title.trim()) { const subj = t.data.people.find(p => p.role === 'sujet' || p.role === 'défunt'); t.title = `${KINDS.find(k => k[0] === t.kind)?.[1] || 'Acte'}${subj ? ` de ${subj.name}` : ''}${t.date_text ? `, ${t.date_text}` : ''}`; $('[data-tx="title"]').value = t.title; }
            status('Enregistrement…');
            try { const r = await post('save_act_transcription', {id: t.id, title: t.title, kind: t.kind, media_id: t.media_id, date_text: t.date_text, place: t.place, source: t.source, body: t.body, data: t.data, to_media: toMedia ? 1 : 0}); t.id = r.result.id; dirty = false; status('✓ Enregistré'); if (toMedia) toast('Enregistré, et le texte est dans la transcription du média.'); ctx.onSaved?.(t.id); }
            catch (e) { status(''); toast(e.message, 'error'); }
        }
        async function printIt() {
            const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée par le navigateur.', 'error');
            let imgUrl = t.filename ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}media/${encodeURIComponent(t.filename)}` : '';
            if (t.filename && useEnh() && viewChanged()) { try { w.document.write('<p style="font:14px sans-serif">Préparation de l’image améliorée…</p>'); const c = await filteredCanvas({gray: false}); imgUrl = URL.createObjectURL(await new Promise(r2 => c.toBlob(r2, 'image/png'))); setTimeout(() => URL.revokeObjectURL(imgUrl), 120000); w.document.open(); } catch (_) {} }
            w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t.title || 'Transcription')}</title><style>body{font:14px/1.5 Georgia,serif;margin:16mm}h1{font-size:20px;margin:0 0 4px}.m{color:#555;margin:0 0 12px}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}img{max-width:100%;border:1px solid #ccc}pre{white-space:pre-wrap;font:inherit;margin:0}ul{padding-left:18px}@media print{.g{grid-template-columns:1fr}img{max-height:120mm;object-fit:contain}}</style>
                <h1>${esc($('[data-tx="title"]').value || 'Transcription')}</h1><p class="m">${esc([KINDS.find(k => k[0] === $('[data-tx="kind"]').value)?.[1], $('[data-tx="date_text"]').value, $('[data-tx="place"]').value, $('[data-tx="source"]').value].filter(Boolean).join(' · '))}</p>
                <div class="g">${imgUrl ? `<img src="${esc(imgUrl)}">` : ''}<div><pre>${esc(area.value)}</pre>${t.data.people.length ? `<h3>Personnes</h3><ul>${t.data.people.map(p => `<li>${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</li>`).join('')}</ul>` : ''}</div></div><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
            w.document.close();
        }
        dlg.addEventListener('click', async e => {
            const tl = e.target.closest('[data-tx-tool]'); if (tl) return setTool(tl.dataset.txTool);
            const chan = e.target.closest('[data-tx-chan]'); if (chan) { setView('channel', chan.dataset.txChan); syncControls(); return; }
            const ch = e.target.closest('[data-tx-char]'); if (ch) { const s = area.selectionStart, en = area.selectionEnd, c = ch.dataset.txChar; area.setRangeText(c, s, en, 'end'); area.dispatchEvent(new Event('input')); area.focus(); return; }
            if (e.target.closest('[data-tx-zlink]')) { const z = t.data.zones.find(q => q.id === selZone), s = area.selectionStart, en = area.selectionEnd; if (!z) return; if (en <= s) return toast('Choisis d’abord un passage dans le texte.', 'error'); snap(); z.s = s; z.e = en; touch(); drawZones(); return; }
            if (e.target.closest('[data-tx-zdel]')) return deleteZone();
            const c = e.target.closest('[data-tx-cmd]'); if (!c) return; c.closest('details')?.removeAttribute('open');
            const k = c.dataset.txCmd;
            if (k === 'close') return close();
            if (k === 'save') return save();
            if (k === 'tomedia') { if (!t.media_id) return toast('Il n’y a pas d’image de la base.', 'error'); return save(true); }
            if (k === 'image') return pickImage();
            if (k === 'zin' || k === 'zout') { if (!imgW) return; const r = stage.getBoundingClientRect(); zoomAt(zoom * (k === 'zin' ? 1.25 : .8), r.width / 2, r.height / 2); return; }
            if (k === 'fit') { if (!imgW) return; applyFit(fitOn ? FIT_NEXT[fitMode] : 'page'); return; }
            if (k === 'rot') { if (!fitOn) { fitOn = true; fitMode = 'page'; } setView('rot', ((t.data.view.rot || 0) + 90) % 360); drawZones(); return; }
            if (k === 'loupe') { loupe.on = !loupe.on; paintLoupeBtn(); if (!loupe.on) lc.hidden = true; status(loupe.on ? '🔍 Loupe : la molette change le grossissement' : ''); return; }
            if (k === 'better') { togglePanel(); return; }
            if (k === 'barcfg') { TV.openBarDialog(dlg); return; }
            if (k === 'keepview') { await save(); if (!dirty) toast('Réglages de l’image retenus pour cet acte : ils reviennent à la prochaine ouverture.'); return; }
            if (k === 'resetview') { const before = {...t.data.view}, origin = () => { t.data.view = TV.viewOf(); fitOn = true; fitMode = 'page'; syncControls(); geom({keepCenter: false}); applyFit('page'); applyImage(); touch(); };
                if (!Object.entries(TV.DEFAULT_VIEW).some(([kk, d]) => String(before[kk]) !== String(d))) return status('L’image est déjà d’origine');
                origin(); A().undoToast?.('Image remise d’origine', {undo: () => { t.data.view = TV.viewOf(before); syncControls(); geom({keepCenter: false}); applyFit(fitMode); applyImage(); touch(); }, redo: origin}); return; }
            if (k === 'ocr') return runOcr();
            if (k === 'htr') return runHtr();
            if (k === 'detect') return runDetect();
            if (k === 'template') { const tp = TEMPLATES[$('[data-tx="kind"]').value]; if (!tp) return toast('Pas de modèle pour ce genre d’acte.', 'error'); if (area.value.trim() && !await A().confirmBox('Le texte déjà écrit est gardé.', {title: 'Ajouter le modèle à la fin du texte ?', okLabel: 'Ajouter le modèle'})) return; area.value += (area.value.trim() ? '\n\n' : '') + tp; area.dispatchEvent(new Event('input')); return; }
            if (k === 'txt') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([area.value], {type: 'text/plain;charset=utf-8'})); a.download = `${(A().safeExportFilename ? A().safeExportFilename($('[data-tx="title"]').value || 'transcription', 'transcription') : 'transcription')}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); return; }
            if (k === 'copy') { navigator.clipboard?.writeText(area.value).then(() => toast('Texte copié.')).catch(() => toast('Copie impossible ici.', 'error')); return; }
            if (k === 'print') return printIt();
            if (k === 'export') { // E3 : une seule fenêtre d'export
                if (!UI.openExportDialog) return printIt();
                const nm = $('[data-tx="title"]').value || 'transcription';
                return UI.openExportDialog({title: nm, defaultName: nm, quality: false, info: `${area.value.trim().split(/\s+/).filter(Boolean).length} mots${t.filename ? ' · avec l’image de l’acte' : ''}`, formats: [
                    {id: 'file', label: '📝 Texte', hint: 'le texte seul (.txt)', ext: 'txt', run: async o => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([area.value], {type: 'text/plain;charset=utf-8'})); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }},
                    {id: 'pdf', hint: 'image + texte (« Enregistrer en PDF »)', ext: '', run: async () => printIt()},
                    {id: 'print', hint: 'image + texte', run: async () => printIt()}]});
            }
        });
        dlg.addEventListener('input', e => {
            const v = e.target.dataset.txView; if (v) { setView(v, e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value), {preview: e.target.type === 'range'}); return; }
            if (e.target.matches('[data-tx-useenh]')) { try { localStorage.setItem(USE_KEY, e.target.checked ? '1' : '0'); } catch (_) {} return; }
            if (e.target.dataset.tx) { t[e.target.dataset.tx] = e.target.value; touch(); }
            if (e.target.matches('[data-tx-znote]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { z.note = e.target.value.slice(0, 300); touch(); } }
            if (e.target.matches('[data-tx-zcolor]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { if (!e.target.dataset.snapped) { snap(); e.target.dataset.snapped = '1'; } z.c = e.target.value; touch(); paintZoneRects(); paintMirror(); } }
        });
        dlg.addEventListener('change', e => { if (e.target.dataset.tx === 'kind') { t.kind = e.target.value; touch(); } if (e.target.matches('[data-tx-state]')) { t.data.status = e.target.value; touch(); } });
        /* ─── « 🎚️ Mieux voir » (disposition B) : un panneau qui s'ouvre sous son bouton ─── */
        const togglePanel = (open) => { const pn = $('[data-tx-panel]'), b = $('[data-tx-cmd="better"]'); if (!pn) return; const on = open ?? pn.hidden; pn.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('is-active', on); };
        dlg.addEventListener('pointerdown', e => { const pn = $('[data-tx-panel]'); if (pn && !pn.hidden && !e.target.closest('[data-tx-item="better"]')) togglePanel(false); });
        /* ─── la barre se redessine quand on la règle (⚙️, ou Réglages) ─── */
        let narrow = false; const isNarrow = () => ($('.h-tx-left')?.getBoundingClientRect().width || 1000) < 620;
        function renderBar() { narrow = isNarrow(); $('[data-tx-barwrap]').innerHTML = TV.toolbarHtml(t.data.view, TV.barCfg(), {narrow}); setTool(tool); paintZoomLabel(); paintBadge(); paintLoupeBtn(); }
        const roBar = new ResizeObserver(() => { if (dlg.isConnected && isNarrow() !== narrow) renderBar(); }); roBar.observe($('.h-tx-left'));
        const onBar = () => renderBar(); window.addEventListener('lcnda-txbar-change', onBar);
        /* ─── 🔍 Loupe : suit la souris ; la molette change le grossissement ─── */
        const loupe = {on: false, mag: 3}, lc = $('[data-tx-loupe]');
        const paintLoupeBtn = () => { const b = $('[data-tx-cmd="loupe"]'); if (b) { b.classList.toggle('is-active', loupe.on); b.setAttribute('aria-pressed', String(loupe.on)); } };
        let lastPt = null;
        function paintLoupe(cx = lastPt?.[0], cy = lastPt?.[1]) {
            if (cx == null) return; lastPt = [cx, cy];
            const r = stage.getBoundingClientRect(), sx = cx - r.left, sy = cy - r.top, S = Math.min(240, Math.max(140, Math.round(r.width / 3)));
            if (!loupe.on || !imgW || !loupeImg?.naturalWidth || sx < 0 || sy < 0 || sx > r.width || sy > r.height) { lc.hidden = true; return; }
            const dpr = devicePixelRatio || 1; if (lc.width !== Math.round(S * dpr)) { lc.width = lc.height = Math.round(S * dpr); lc.style.width = lc.style.height = `${S}px`; }
            lc.hidden = false; lc.style.left = `${sx - S / 2}px`; lc.style.top = `${sy - S / 2}px`;
            const g = lc.getContext('2d'), k = zoom * loupe.mag, wx = (sx - panX) / zoom, wy = (sy - panY) / zoom;
            g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.fillStyle = '#3a3a40'; g.fillRect(0, 0, lc.width, lc.height);
            g.setTransform(new DOMMatrix().scale(dpr).translate(S / 2, S / 2).scale(k).translate(-wx, -wy).multiply(M).scale(imgW / loupeImg.naturalWidth, imgH / loupeImg.naturalHeight));
            g.filter = processed ? 'none' : TV.cssFilter(t.data.view); g.imageSmoothingQuality = 'high'; g.drawImage(loupeImg, 0, 0);
            g.setTransform(dpr, 0, 0, dpr, 0, 0); g.filter = 'none'; g.font = '600 12px system-ui, sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(S / 2 - 22, S - 26, 44, 18); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`× ${loupe.mag.toFixed(1).replace('.0', '').replace('.', ',')}`, S / 2, S - 13);
        }
        stage.addEventListener('pointermove', e => { if (loupe.on && e.pointerType !== 'touch') paintLoupe(e.clientX, e.clientY); });
        stage.addEventListener('pointerleave', () => { lc.hidden = true; });
        const onKey = e => {
            if (!dlg.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dlg) return; // une fenêtre par-dessus (confirmation…) garde ses touches
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
            if (e.key === 'Escape' && e.target.closest?.('[data-tx-panel]')) { e.preventDefault(); e.stopPropagation(); togglePanel(false); $('[data-tx-cmd="better"]')?.focus(); return; }
            if (e.target.closest?.('input, textarea, select')) return;
            if (e.target.closest?.('button, [contenteditable="true"]') && (e.key === ' ' || e.key === 'Enter')) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); undoZones(k === 'y' || e.shiftKey); return; } // ⌘Z, ⇧⌘Z
            if (mod || e.altKey && !e.key.startsWith('Arrow')) return;
            if (e.key === ' ' && !space) { space = true; stage.dataset.tool = 'pan'; e.preventDefault(); }
            if (k === 'z') setTool('zone'); if (k === 'h') setTool('pan'); if (k === 'l') { $('[data-tx-cmd="loupe"]') ? $('[data-tx-cmd="loupe"]').click() : (loupe.on = !loupe.on, lc.hidden = !loupe.on); return; }
            if (e.key === 'Escape' && $('[data-tx-panel]') && !$('[data-tx-panel]').hidden) { e.preventDefault(); e.stopPropagation(); togglePanel(false); $('[data-tx-cmd="better"]')?.focus(); return; }
            if (selZone && e.key.startsWith('Arrow')) { e.preventDefault(); nudgeZone(e.key, e.shiftKey, e.altKey); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selZone) { e.preventDefault(); deleteZone(); return; }
            if (e.key === 'Escape' && selZone) { e.preventDefault(); e.stopPropagation(); selZone = null; drawZones(); }
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        /** l'outil s'en va (× ou Échap, ou « ↗ Fiche » d'une personne) : touches, worker « Mieux voir », observateurs, fenêtre */
        function teardown() { if (!dlg.isConnected) return; document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('lcnda-txbar-change', onBar); enh?.stop(); ro.disconnect(); roBar.disconnect(); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        async function close() { if (dirty && !await A().confirmBox('Les dernières modifications de la transcription seront perdues.', {title: 'Fermer sans enregistrer la transcription ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; teardown(); }
        dlg.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        // la fenêtre change de taille (⛶, panneau) : l'ajustement choisi (toute l'image, largeur) suit
        let roW = 0, roH = 0; const ro = new ResizeObserver(() => { const r = stage.getBoundingClientRect(); if (!imgW || drag || (r.width === roW && r.height === roH)) return; roW = r.width; roH = r.height; if (fitOn && fitMode !== 'real') applyFit(fitMode, {keepY: true}); else applyView(); }); ro.observe(stage);
        renderBar(); paintMirror(); paintPeople(); await loadImage();
        /* E1 : l'historique (instantanés de tout l'acte) ; ⌘Z dans une case de texte garde l'annulation de la case */
        const F_KEYS = ['title', 'kind', 'date_text', 'place', 'source'];
        HX = UI.editorHistory?.({get: () => ({f: Object.fromEntries(F_KEYS.map(k => [k, $(`[data-tx="${k}"]`).value])), st: $('[data-tx-state]').value, body: area.value, zones: t.data.zones, people: t.data.people, view: t.data.view}),
            set: o => { F_KEYS.forEach(k => { $(`[data-tx="${k}"]`).value = o.f[k] ?? ''; t[k] = o.f[k] ?? ''; }); $('[data-tx-state]').value = o.st; t.data.status = o.st;
                area.value = o.body; before = o.body; t.body = o.body; t.data.zones = o.zones || []; t.data.people = o.people || []; if (!t.data.zones.some(z => z.id === selZone)) selZone = null;
                const vOld = JSON.stringify(t.data.view); t.data.view = TV.viewOf(o.view); syncControls(); if (JSON.stringify(t.data.view) !== vOld) { geom(); applyImage(); }
                dirty = true; status('modifié'); drawZones(); paintMirror(); paintPeople(); },
            onChange: h => { $('[data-tx-hist="undo"]').disabled = !h.canUndo(); $('[data-tx-hist="redo"]').disabled = !h.canRedo(); }});
        HX?.reset();
        dlg.addEventListener('click', e => { const hb = e.target.closest('[data-tx-hist]'); if (hb) undoZones(hb.dataset.txHist === 'redo'); });
        const cmdOf = k => () => { const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.txCmd = k; dlg.appendChild(b); b.click(); b.remove(); };
        UI.editorMenus?.($('[data-tx-menus]'), {
            Fichier: () => [{icon: '💾', label: 'Enregistrer', shortcut: '⌘S', run: cmdOf('save')}, {icon: '⤓', label: 'Exporter (texte, PDF, imprimer)…', run: cmdOf('export')}, '-', {icon: '🖼️', label: 'Image de l’acte…', run: cmdOf('image')}, {icon: '↪', label: 'Mettre le texte dans le média', run: cmdOf('tomedia')}, {icon: '📋', label: 'Copier le texte', run: cmdOf('copy')}, '-', {icon: '×', label: 'Fermer', run: cmdOf('close')}],
            Édition: () => [{icon: '↶', label: 'Annuler', shortcut: '⌘Z', disabled: !HX?.canUndo(), run: () => undoZones(false)}, {icon: '↷', label: 'Rétablir', shortcut: '⇧⌘Z', disabled: !HX?.canRedo(), run: () => undoZones(true)}, '-', {icon: '📋', label: 'Modèle d’acte', run: cmdOf('template')}, {icon: '🧭', label: 'Repérer les noms, dates, lieux', run: cmdOf('detect')}, {icon: '🔎', label: 'Lire (imprimé)', run: cmdOf('ocr')}, {icon: '✍️', label: 'Lire (manuscrit)', run: cmdOf('htr')}],
            Outils: () => [{icon: '✋', label: 'Déplacer l’image', shortcut: 'H', run: () => setTool('pan')}, {icon: '▭', label: 'Dessiner une zone', shortcut: 'Z', run: () => setTool('zone')}, {icon: '🔍', label: 'Loupe', shortcut: 'L', run: cmdOf('loupe')}],
            Affichage: () => [{icon: '⤢', label: 'Ajuster à la fenêtre', shortcut: '⌘0', run: () => txBar?.zoom.fit()}, {icon: '↔', label: 'Toute la largeur (pour lire)', run: () => imgW && applyFit('width')}, {label: '100 %', shortcut: '⌘1', run: () => txBar?.zoom.actual()}, {icon: '＋', label: 'Zoom avant', shortcut: '⌘+', run: () => txBar?.zoom.in()}, {icon: '−', label: 'Zoom arrière', shortcut: '⌘−', run: () => txBar?.zoom.out()}, '-', {icon: '⟳', label: 'Tourner de 90°', run: cmdOf('rot')}, {icon: '↺', label: 'Image d’origine', run: cmdOf('resetview')}]});
        UI.editorRail?.($('[data-tx-rail]'), {breaks: ['[data-tx-cmd="loupe"]', '[data-tx-cmd="image"]']});
        if (UI.editorStatus) { // K18 : l'image à gauche, l'aide de l'outil au milieu, le zoom à droite (⌘ + molette, ⌘0, ⌘1)
            txBar = UI.editorStatus({zoom: {get: () => zoom, set: k => { if (!imgW) return; const r = stage.getBoundingClientRect(); zoomAt(k, r.width / 2, r.height / 2); }, fit: () => imgW && applyFit('page'), min: .02, max: 20}});
            $('.h-tx').appendChild(txBar); paintTxBar();
        }
        if (!t.filename && !ctx.id) setTimeout(pickImage, 50);
        return {get t() { return t; }, detect: runDetect, save};
    }

    /* ═════════ Dans la visionneuse : la transcription de l'image ↔ l'outil Transcription d'actes ═════════ */
    const kindLabel = k => (KINDS.find(x => x[0] === k) || [, k || 'Acte'])[1];
    const lbItem = () => { const S = A()?.state; return S?.lightboxMedia?.[S.lightboxIndex] || null; };
    let lbActs = [], lbFor = 0, lbSeq = 0;
    async function lbRefresh(force = false) {
        const area = document.getElementById('lightbox-transcription'), it = lbItem(); if (!area || !document.getElementById('lightbox')?.open) return;
        let box = document.getElementById('lightbox-acts'); if (!box) { box = document.createElement('div'); box.id = 'lightbox-acts'; box.className = 'lb-acts'; area.after(box); }
        const isImg = it && /\.(jpe?g|png|webp|gif|tiff?)$/i.test(it.filename || '');
        if (!isImg) { box.hidden = true; return; } box.hidden = false;
        if (!force && lbFor === Number(it.id)) return;
        lbFor = Number(it.id); const n = ++lbSeq;
        try { lbActs = (await api('act_transcriptions_media', {media_id: it.id})).items || []; } catch (_) { lbActs = []; }
        if (n !== lbSeq) return;
        box.innerHTML = `<div class="lb-acts-head"><span class="section-label">📜 Transcription d’actes</span><span class="lb-acts-btns"><button type="button" class="button small secondary" data-lbact-read title="Toute la transcription, en grand (et les actes transcrits dans l’outil)">📖 Lire en entier</button><button type="button" class="button small secondary" data-lbact-new title="Ouvrir l’outil Transcription d’actes sur cette image (zones, noms, dates)">${lbActs.length ? '＋ Nouvelle' : '📜 Transcrire dans l’outil'}</button></span></div>
            ${lbActs.length ? `<ul class="lb-acts-list">${lbActs.map(a => `<li><button type="button" class="link-button" data-lbact-open="${a.id}" title="Ouvrir dans Transcription d’actes">📜 ${esc(a.title || kindLabel(a.kind))}</button> <small class="muted">${esc([kindLabel(a.kind), a.date_text, a.place].filter(Boolean).join(' · '))}${a.people?.length ? ` · ${a.people.length} personne${a.people.length > 1 ? 's' : ''}` : ''}</small></li>`).join('')}</ul>` : '<p class="empty-line small"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucun acte transcrit dans l’outil pour cette image.</span></p>'}`;
    }
    function lbOpenTool(id) {
        const it = lbItem(); if (!it) return;
        const again = () => { lbFor = 0; lbRefresh(true); };
        if (id) open({id, onClose: again}); else open({mediaId: it.id, filename: it.filename, title: it.title || '', text: document.getElementById('lightbox-transcription')?.value || it.transcription || '', onClose: again});
    }
    function lbRead() {
        const it = lbItem(); if (!it) return; const txt = document.getElementById('lightbox-transcription')?.value || it.transcription || '';
        const people = a => (a.people || []).filter(p => p.name).map(p => `${esc(p.name)}${p.role ? ` <small class="muted">(${esc(p.role)})</small>` : ''}`).join(', ');
        const body = `<div class="lb-read"><figure class="lb-read-img"><img src="media/${encodeURIComponent(it.filename)}" alt=""></figure><div class="lb-read-txt">
            <h3>Transcription du document</h3>${txt.trim() ? `<pre class="lb-read-pre">${esc(txt)}</pre>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📝</span><span class="empty-line-text">Rien d’écrit pour l’instant dans la visionneuse.</span></p>'}
            ${lbActs.map(a => `<section class="lb-read-act"><h3>📜 ${esc(a.title || kindLabel(a.kind))}</h3><p class="muted">${esc([kindLabel(a.kind), a.date_text, a.place, a.source].filter(Boolean).join(' · '))}</p>${a.people?.length ? `<p><b>Personnes :</b> ${people(a)}</p>` : ''}${a.body?.trim() ? `<pre class="lb-read-pre">${esc(a.body)}</pre>` : ''}<button type="button" class="button small secondary" data-lbact-open="${a.id}">Ouvrir dans Transcription d’actes</button></section>`).join('')}</div></div>`;
        ext.openDialog({eyebrow: 'TRANSCRIPTION', title: `📖 ${it.title || 'Document'}`, wide: true, submitLabel: '🖨 Imprimer', body,
            onOpen: dg => { dg.classList.add('lb-read-dlg'); dg.addEventListener('click', e => { const b = e.target.closest('[data-lbact-open]'); if (b) { dg.close(); lbOpenTool(Number(b.dataset.lbactOpen)); } }); },
            onSubmit: f => { const w = window.open('', '_blank'); if (!w) { toast('Fenêtre bloquée.', 'error'); return false; } const src = f.querySelector('.lb-read-txt').cloneNode(true); src.querySelectorAll('button').forEach(b => b.remove());
                w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(it.title || 'Transcription')}</title><style>body{font:14px/1.5 Georgia,serif;margin:18mm}pre{white-space:pre-wrap;font:inherit}h3{margin:18px 0 4px}small,.muted{color:#666}</style><h2>${esc(it.title || 'Transcription')}</h2>${src.innerHTML}<script>onload=()=>setTimeout(()=>print(),250)<\/script>`); w.document.close(); return false; }});
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-lbact-read],[data-lbact-new],[data-lbact-open],#act-transcriber-open'); if (!b || !b.closest('#lightbox')) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (b.hasAttribute('data-lbact-read')) return lbRead();
        if (b.dataset.lbactOpen) return lbOpenTool(Number(b.dataset.lbactOpen));
        if (b.id === 'act-transcriber-open' && lbActs.length && lbFor === Number(lbItem()?.id)) return lbOpenTool(lbActs[0].id); // l'acte déjà transcrit, plutôt qu'un doublon
        lbOpenTool(0);
    }, true);
    // suivre l'image affichée dans la visionneuse
    const lbWatch = () => { const lb = document.getElementById('lightbox'), im = document.getElementById('lightbox-image'); if (!lb || !im) return setTimeout(lbWatch, 500);
        new MutationObserver(() => lbRefresh()).observe(im, {attributes: true, attributeFilter: ['src', 'hidden']});
        new MutationObserver(() => { if (lb.open) lbRefresh(); else lbFor = 0; }).observe(lb, {attributes: true, attributeFilter: ['open']}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lbWatch); else lbWatch();

    ext.openActTranscriber = open;
    ext.actDetect = detect; ext.actWordsToNumber = wordsToNumber; ext.actFindDates = findDates;

    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'acts', icon: '📜', label: 'Transcription d’actes', what: 'transcription',
        load: async () => ((await api('act_transcriptions')).items || []).map(r => ({id: r.id, name: r.title, date: r.updated_at, thumb: r.thumb ? `<img src="media/${esc(encodeURIComponent(r.thumb))}" alt="">` : '<span class="h-et-ico">📜</span>', info: [KINDS.find(k => k[0] === r.kind)?.[1], r.date_text, r.place, `${r.people} personne${r.people > 1 ? 's' : ''}`].filter(Boolean).join(' · ')})),
        open: (id, again) => open({id, onSaved: again, onClose: again}),
        create: again => open({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_act_transcription', {id, name}),
        remove: id => post('delete_act_transcription', {id}), createLabel: '＋ Nouvelle transcription'});
})();
