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
        bapteme: 'L’an [année], le [jour] du mois de [mois], a été baptisé(e) [prénom], né(e) [hier / ce jour], fils/fille légitime de [prénom et nom du père], [métier], et de [prénom et nom de la mère], son épouse, de cette paroisse. Le parrain a été [nom], la marraine [nom], qui ont signé avec nous / déclaré ne savoir signer.\n[signatures]',
        naissance: 'L’an [année], le [jour] [mois], à [heure], par-devant nous, [nom], maire, officier de l’état civil de la commune de [commune], est comparu [prénom et nom du père], [âge], [métier], demeurant à [lieu], lequel nous a présenté un enfant de sexe [masculin / féminin], né [date] de lui déclarant et de [prénom et nom de la mère], son épouse, auquel il a donné le prénom de [prénom]. En présence de [témoin 1] et de [témoin 2].\n[signatures]',
        mariage: 'L’an [année], le [jour] [mois], après la publication de trois bans, ont été mariés [prénom et nom de l’époux], [âge], [métier], fils de [père] et de [mère], d’une part, et [prénom et nom de l’épouse], [âge], fille de [père] et de [mère], d’autre part. Présents : [témoins].\n[signatures]',
        deces: 'L’an [année], le [jour] [mois], sont comparus [déclarant 1] et [déclarant 2], lesquels nous ont déclaré que [prénom et nom], [âge], [métier], [époux / veuve de …], fils/fille de [père] et de [mère], est décédé(e) le [date] à [lieu].\n[signatures]',
        sepulture: 'L’an [année], le [jour] du mois de [mois], a été inhumé(e) dans le cimetière de cette paroisse le corps de [prénom et nom], âgé(e) d’environ [âge] ans, décédé(e) le [date], [époux / veuve de …]. Présents : [témoins].\n[signatures]',
        notarial: 'Par-devant [nom], notaire royal / public à [lieu], soussigné, et en présence des témoins ci-après nommés, furent présents [parties]…\n[objet de l’acte]\nFait et passé à [lieu], le [date], en présence de [témoins].\n[signatures]',
    };
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
        let t = {id: 0, title: '', kind: 'bapteme', media_id: 0, filename: '', date_text: '', place: '', source: '', body: '', data: {zones: [], people: [], view: {contrast: 100, bright: 100, invert: false, rot: 0, gray: false}}};
        if (ctx.id) { try { const r = await api('act_transcription', {id: ctx.id}); t = {...t, ...r, data: {...t.data, ...(r.data || {})}}; t.data.view = {...{contrast: 100, bright: 100, invert: false, rot: 0, gray: false}, ...(r.data?.view || {})}; } catch (e) { return toast(e.message, 'error'); } }
        else if (ctx.mediaId) { t.media_id = Number(ctx.mediaId); t.filename = ctx.filename || ''; t.title = ctx.title || ''; t.body = ctx.text || ''; }
        let dirty = false, tool = 'pan', zoom = 1, panX = 0, panY = 0, selZone = null, found = [], imgW = 0, imgH = 0, matchCache = new Map();
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-tx-dlg';
        dlg.innerHTML = `<div class="h-tx">
            <header class="h-tx-top"><span class="h-tx-logo">📜</span><input data-tx="title" class="h-tx-title" maxlength="200" placeholder="Titre de l’acte (ex. Baptême de Jean Martin, 1790)" value="${esc(t.title)}">
                <select data-tx="kind" title="Genre d’acte">${KINDS.map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <input data-tx="date_text" placeholder="Date" value="${esc(t.date_text)}" title="Date de l’acte"><input data-tx="place" placeholder="Lieu" value="${esc(t.place)}" title="Paroisse, commune"><input data-tx="source" placeholder="Source (AD, cote, vue)" value="${esc(t.source)}" title="Archives, cote, numéro de vue">
                <span class="spacer"></span><span class="muted h-tx-status" data-tx-status data-ui-status></span>
                <button type="button" class="button small secondary" data-tx-cmd="export" title="Le texte (.txt), l’impression ou un PDF (image + texte)">⤓ Exporter ▾</button><button type="button" class="button small" data-tx-cmd="save" title="Enregistrer" data-shortcut="${esc(ext.shortcutLabel?.('⌘S') || '⌘S')}">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('transcribe') : ''}<button type="button" class="icon-button" data-tx-cmd="close" title="Fermer">×</button></header>
            <div class="h-tx-main">
                <section class="h-tx-left">
                    <div class="h-tx-tools"><button type="button" data-tx-cmd="image" title="Choisir l’image de l’acte (base ou ordinateur)">🖼️ Image…</button><span class="h-tx-sep"></span>
                        <button type="button" data-tx-tool="pan" title="Déplacer l’image, ou barre d’espace" data-shortcut="H">✋</button><button type="button" data-tx-tool="zone" title="Dessiner une zone (elle se relie au passage choisi dans le texte)" data-shortcut="Z" data-help="Choisis un passage dans le texte, puis dessine un rectangle sur l’image : les deux restent liés (un clic sur l’un montre l’autre).">▭ Zone</button>
                        <button type="button" data-tx-cmd="zin" title="Zoom avant">＋</button><button type="button" data-tx-cmd="zout" title="Zoom arrière">－</button><button type="button" data-tx-cmd="fit" title="Toute l’image">⤢</button><button type="button" data-tx-cmd="rot" title="Tourner de 90°">⟳</button><span class="h-tx-sep"></span>
                        <label title="Contraste">◐<input type="range" data-tx-view="contrast" min="50" max="300" value="${t.data.view.contrast}"></label><label title="Luminosité">☀<input type="range" data-tx-view="bright" min="40" max="220" value="${t.data.view.bright}"></label>
                        <label class="checkbox-line" title="Négatif : encre claire sur fond sombre"><input type="checkbox" data-tx-view="invert" ${t.data.view.invert ? 'checked' : ''}>Négatif</label><label class="checkbox-line"><input type="checkbox" data-tx-view="gray" ${t.data.view.gray ? 'checked' : ''}>Gris</label></div>
                    <div class="h-tx-stage" data-tx-stage tabindex="-1"><svg data-tx-svg><g data-tx-world><image data-tx-img/><g data-tx-zones></g><rect data-tx-draw class="h-tx-draw" hidden/></g></svg><p class="h-tx-empty" data-tx-empty>Choisis l’image de l’acte : « 🖼️ Image… » (une photo de la base, ou un fichier de l’ordinateur).</p></div>
                    <div class="h-tx-zonebar" data-tx-zonebar hidden></div>
                </section>
                <section class="h-tx-right">
                    <div class="h-tx-tools"><button type="button" data-tx-cmd="ocr" title="Lire un texte imprimé ou tapé (pose aussi les zones ligne par ligne)">🔎 Lire (imprimé)</button><button type="button" data-tx-cmd="htr" title="Reconnaissance d’écriture manuscrite, si un modèle est installé (Maintenance)" data-help="La lecture d’une écriture à la main (HTR) : elle demande un modèle installé dans Maintenance. Relis toujours : elle se trompe sur les noms." data-help-faq="transcription">✍️ Lire (manuscrit)</button>
                        <select data-tx-lang title="Langue du texte"><option value="fra">Français</option><option value="lat">Latin</option><option value="fra+lat">Français + latin</option><option value="eng">Anglais</option><option value="deu">Allemand</option><option value="ita">Italien</option><option value="spa">Espagnol</option></select>
                        <button type="button" data-tx-cmd="template" title="Un modèle d’acte à compléter">📋 Modèle</button><button type="button" data-tx-cmd="detect" title="Repérer les noms, dates, lieux et métiers" data-help="Cherche dans le texte les noms (avec leur rôle : parrain, témoin…), les dates (même en toutes lettres ou au calendrier républicain), les lieux et les métiers, pour les relier aux fiches.">🧭 Repérer</button><span class="spacer"></span>
                        <details class="h-tx-more"><summary>⋯ Plus</summary><div><button type="button" data-tx-cmd="tomedia">↪ Mettre le texte dans le média</button><button type="button" data-tx-cmd="copy">📋 Copier le texte</button></div></details></div>
                    <div class="h-tx-chars">${SPECIAL.map(c => `<button type="button" data-tx-char="${esc(c)}" title="Insérer ${esc(c)}">${esc(c)}</button>`).join('')}</div>
                    <div class="h-tx-editor"><div class="h-tx-mirror" data-tx-mirror aria-hidden="true"></div><textarea data-tx-body spellcheck="false" placeholder="La transcription, ligne à ligne comme sur l’acte. Choisis un passage, puis dessine sa zone sur l’image (▭ Zone) : les deux restent liés.">${esc(t.body)}</textarea></div>
                    <div class="h-tx-found" data-tx-found></div>
                </section>
            </div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'transcribe', true); dlg.showModal(); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        const $ = s => dlg.querySelector(s), area = $('[data-tx-body]'), mirror = $('[data-tx-mirror]'), svg = $('[data-tx-svg]'), world = $('[data-tx-world]'), img = $('[data-tx-img]'), stage = $('[data-tx-stage]');
        const UI = window.LCNDA_UI || {}, STATES = {'modifié': 'dirty', '✓ Enregistré': 'saved', 'Enregistrement…': 'saving'};
        const status = s => { const el = $('[data-tx-status]'); if (STATES[s] && UI.savedStatus) UI.savedStatus(el, STATES[s]); else el.textContent = s || ''; };
        const touch = () => { dirty = true; status('modifié'); };
        // E4 : une image glissée (ou collée) sur l'acte entre dans les Médias et devient l'image de l'acte
        UI.bindFileDrop?.(stage, async files => {
            const f = files[0], fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'image'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', A().state.csrf);
            try { const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                if (t.data.zones.length && !await A().confirmBox('Elles étaient posées pour l’ancienne image.', {title: 'Garder les zones déjà posées ?', okLabel: 'Garder les zones', cancelLabel: 'Les retirer', danger: false})) t.data.zones = [];
                t.media_id = Number(j.result.media_id); t.filename = j.result.filename; touch(); await loadImage(); toast('L’image est dans les Médias et devient l’image de l’acte.');
            } catch (e) { toast(`${f.name} : ${e.message}`, 'error'); }
        }, {accept: 'image/*'});
        /* ─── l'image ─── */
        const applyView = () => { world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`); };
        const fit = () => { const r = stage.getBoundingClientRect(); if (!imgW) return; const rot = (t.data.view.rot || 0) % 180 !== 0, w = rot ? imgH : imgW, h = rot ? imgW : imgH; zoom = clamp(Math.min((r.width - 20) / w, (r.height - 20) / h), .02, 20); panX = (r.width - w * zoom) / 2; panY = (r.height - h * zoom) / 2; applyView(); };
        const filter = () => { const v = t.data.view; img.style.filter = `contrast(${v.contrast}%) brightness(${v.bright}%)${v.invert ? ' invert(1)' : ''}${v.gray ? ' grayscale(1)' : ''}`; const rot = v.rot || 0; img.setAttribute('transform', rot ? (rot === 90 ? `translate(${imgH} 0) rotate(90)` : rot === 180 ? `translate(${imgW} ${imgH}) rotate(180)` : `translate(0 ${imgW}) rotate(270)`) : ''); $('[data-tx-zones]').setAttribute('transform', img.getAttribute('transform') || ''); };
        async function loadImage() {
            const has = !!t.filename; $('[data-tx-empty]').hidden = has; img.style.display = has ? '' : 'none'; if (!has) return;
            const src = `media/${encodeURIComponent(t.filename)}`;
            await new Promise(res => { const i = new Image(); i.onload = () => { imgW = i.naturalWidth; imgH = i.naturalHeight; res(); }; i.onerror = () => { toast('Image de l’acte illisible.', 'error'); res(); }; i.src = src; });
            img.setAttribute('href', src); img.setAttribute('width', imgW); img.setAttribute('height', imgH); filter(); fit(); drawZones();
        }
        /* ─── les zones et le texte surligné ─── */
        const colorOf = (z, i) => z.c || COLORS[i % COLORS.length];
        function drawZones() {
            const g = $('[data-tx-zones]'), sw = 2 / zoom;
            g.innerHTML = t.data.zones.map((z, i) => `<rect data-tx-zone="${esc(z.id)}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${colorOf(z, i)}" fill-opacity="${selZone === z.id ? .38 : .2}" stroke="${colorOf(z, i)}" stroke-width="${selZone === z.id ? sw * 2 : sw}"><title>${esc(t.body.slice(z.s, z.e).slice(0, 120) || z.note || 'Zone non reliée')}</title></rect>`).join('');
            paintMirror(); paintZoneBar();
        }
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
                <button type="button" class="button small secondary" data-tx-zlink title="Relier cette zone au passage choisi dans le texte">🔗 Au passage choisi</button><input data-tx-znote placeholder="Note (mot illisible, signature…)" value="${esc(z.note || '')}" maxlength="300"><input type="color" data-tx-zcolor value="${esc(z.c || COLORS[t.data.zones.indexOf(z) % COLORS.length])}" title="Couleur"><button type="button" class="button small danger" data-tx-zdel>🗑</button>`;
        }
        /** garder les liens quand on écrit : les passages après la modification se décalent */
        let before = area.value;
        area.addEventListener('input', () => {
            const now = area.value; let p = 0; while (p < before.length && p < now.length && before[p] === now[p]) p++;
            let q = 0; while (q < before.length - p && q < now.length - p && before[before.length - 1 - q] === now[now.length - 1 - q]) q++;
            const oldEnd = before.length - q, delta = now.length - before.length;
            const shift = r => { const f = v => v >= oldEnd ? v + delta : v > p ? Math.max(p, Math.min(v, p + (now.length - q - p))) : v; r.s = f(r.s); r.e = Math.max(r.s, f(r.e)); };
            t.data.zones.forEach(shift); t.data.people.forEach(shift); found.forEach(shift);
            before = now; t.body = now; touch(); paintMirror(); paintPeople();
        });
        area.addEventListener('scroll', () => { mirror.scrollTop = area.scrollTop; });
        // un clic dans le texte : la zone qui contient cet endroit s'allume
        area.addEventListener('click', () => { const c = area.selectionStart, z = t.data.zones.find(q => q.e > q.s && c >= q.s && c <= q.e); if (z && z.id !== selZone) { selZone = z.id; drawZones(); reveal(z); } });
        const reveal = z => { const r = stage.getBoundingClientRect(); const cx = z.x + z.w / 2, cy = z.y + z.h / 2; const [X, Y] = rotPt(cx, cy); if (X * zoom + panX < 0 || X * zoom + panX > r.width || Y * zoom + panY < 0 || Y * zoom + panY > r.height) { panX = r.width / 2 - X * zoom; panY = r.height / 2 - Y * zoom; applyView(); } };
        const rotPt = (x, y) => { const r = t.data.view.rot || 0; return r === 90 ? [imgH - y, x] : r === 180 ? [imgW - x, imgH - y] : r === 270 ? [y, imgW - x] : [x, y]; };
        const unrot = (X, Y) => { const r = t.data.view.rot || 0; return r === 90 ? [Y, imgH - X] : r === 180 ? [imgW - X, imgH - Y] : r === 270 ? [imgW - Y, X] : [X, Y]; };
        const selectText = z => { if (!(z.e > z.s)) return; area.focus(); area.setSelectionRange(z.s, z.e); const lineH = parseFloat(getComputedStyle(area).lineHeight) || 20, lines = area.value.slice(0, z.s).split('\n').length; area.scrollTop = Math.max(0, (lines - 3) * lineH); mirror.scrollTop = area.scrollTop; };
        /* ─── glisser sur l'image : déplacer ou dessiner une zone ─── */
        let drag = null, space = false;
        const toImg = e => { const r = svg.getBoundingClientRect(); return unrot((e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom); };
        svg.addEventListener('pointerdown', e => {
            if (!imgW) return; svg.setPointerCapture(e.pointerId);
            const zr = e.target.closest('[data-tx-zone]');
            if (zr && tool !== 'zone' && !space) { selZone = zr.dataset.txZone; drawZones(); selectText(t.data.zones.find(q => q.id === selZone)); return; }
            if (tool === 'zone' && !space && e.button === 0) { const [x, y] = toImg(e); drag = {zone: true, x0: x, y0: y, x1: x, y1: y}; return; }
            drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY};
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            if (drag.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); return; }
            const [x, y] = toImg(e); drag.x1 = x; drag.y1 = y; const r = $('[data-tx-draw]'), [ax, ay] = rotPt(drag.x0, drag.y0), [bx, by] = rotPt(x, y);
            r.hidden = false; r.setAttribute('x', Math.min(ax, bx)); r.setAttribute('y', Math.min(ay, by)); r.setAttribute('width', Math.abs(bx - ax)); r.setAttribute('height', Math.abs(by - ay)); r.setAttribute('stroke-width', 2 / zoom);
        });
        svg.addEventListener('pointerup', () => {
            const d = drag; drag = null; $('[data-tx-draw]').hidden = true; if (!d?.zone) return;
            const x = clamp(Math.min(d.x0, d.x1), 0, imgW), y = clamp(Math.min(d.y0, d.y1), 0, imgH), w = Math.min(imgW - x, Math.abs(d.x1 - d.x0)), h = Math.min(imgH - y, Math.abs(d.y1 - d.y0));
            if (w < 4 || h < 4) return;
            const s = area.selectionStart, e2 = area.selectionEnd, z = {id: zid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), s: e2 > s ? s : 0, e: e2 > s ? e2 : 0, note: '', c: ''};
            t.data.zones.push(z); selZone = z.id; touch(); drawZones();
            status(e2 > s ? 'Zone reliée au passage choisi' : 'Zone posée : choisis son passage dans le texte, puis « 🔗 Au passage choisi »');
        });
        stage.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top; if (e.ctrlKey || e.metaKey || !e.deltaX) { const z = clamp(zoom * Math.exp(-e.deltaY * .0022), .02, 20); panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; } else { panX -= e.deltaX; panY -= e.deltaY; } applyView(); drawZones(); }, {passive: false});
        const setTool = k => { tool = k; dlg.querySelectorAll('[data-tx-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.txTool === k)); stage.dataset.tool = k; };
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
                onSubmit: f => { const chosen = Number(f.elements.tx_pick?.value) || 0; if (!chosen) { toast('Choisis une fiche.', 'error'); return false; } p.person_id = chosen; touch(); paintPeople(); }});
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
            if (d.txPopen) { if (dirty && !await A().confirmBox('La transcription non enregistrée sera perdue (💾 d’abord).', {title: 'Ouvrir la fiche ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; dlg.close(); dlg.remove(); A().openPersonById?.(Number(d.txPopen)); }
        });
        $('[data-tx-found]').addEventListener('change', e => { const s = e.target.closest('[data-tx-prole]'); if (s) { t.data.people[Number(s.dataset.txProle)].role = s.value; touch(); } });
        /* ─── lecture automatique ─── */
        async function filteredCanvas() {
            const i = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = `media/${encodeURIComponent(t.filename)}`; });
            const c = document.createElement('canvas'); c.width = imgW; c.height = imgH; const g = c.getContext('2d'), v = t.data.view;
            g.filter = `contrast(${v.contrast}%) brightness(${v.bright}%)${v.invert ? ' invert(1)' : ''} grayscale(1)`; g.drawImage(i, 0, 0); return c;
        }
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
                area.value = text; before = text; t.body = text; t.data.zones.push(...made); touch(); drawZones();
                status(`${lines.length} ligne${lines.length > 1 ? 's' : ''} lue${lines.length > 1 ? 's' : ''} (à relire)`); toast('Texte lu et zones posées ligne par ligne : relis et corrige.'); void start;
            } catch (e) { status(''); toast(e.message || 'Lecture impossible.', 'error'); }
        }
        async function runHtr() {
            if (!t.media_id) return toast('Choisis d’abord l’image de l’acte.', 'error');
            status('Reconnaissance de l’écriture…');
            try { const r = await post('htr_recognize', {media_id: t.media_id, model: $('[data-tx-lang]').value.startsWith('fra') ? 'fr-actes' : 'en-handwritten'}); const txt = String(r.result?.text || r.text || '').trim(); if (!txt) { status(''); return toast('Aucun texte reconnu.', 'error'); }
                area.value += (area.value.trim() ? '\n\n— Lu automatiquement (à relire) —\n' : '') + txt; before = area.value; t.body = area.value; touch(); paintMirror(); status('Texte manuscrit ajouté (à relire)'); }
            catch (e) { status(''); toast(`${e.message || 'Reconnaissance impossible.'} (Maintenance → Reconnaissance manuscrite pour installer un modèle)`, 'error'); }
        }
        /* ─── image : de la base ou de l'ordinateur ─── */
        async function pickImage() {
            const m = await ext.pickImage({eyebrow: 'TRANSCRIPTION', title: 'Image de l’acte', intro: 'Clique sur l’image de l’acte. Une image de l’ordinateur est ajoutée aux Médias.'}); if (!m) return;
            t.media_id = Number(m.id); t.filename = m.filename;
            if (!t.title && m.title && !m.imported) { t.title = m.title; $('[data-tx="title"]').value = t.title; }
            if (!area.value.trim() && m.transcription) { area.value = m.transcription; before = area.value; t.body = area.value; }
            if (t.data.zones.length && !await A().confirmBox('Elles étaient posées pour l’ancienne image.', {title: 'Garder les zones déjà posées ?', okLabel: 'Garder les zones', cancelLabel: 'Les retirer', danger: false})) t.data.zones = [];
            touch(); await loadImage();
        }
        /* ─── enregistrer, exporter ─── */
        async function save(toMedia = false) {
            ['title', 'kind', 'date_text', 'place', 'source'].forEach(k => { t[k] = $(`[data-tx="${k}"]`).value; }); t.body = area.value;
            if (!t.title.trim()) { const subj = t.data.people.find(p => p.role === 'sujet' || p.role === 'défunt'); t.title = `${KINDS.find(k => k[0] === t.kind)?.[1] || 'Acte'}${subj ? ` de ${subj.name}` : ''}${t.date_text ? `, ${t.date_text}` : ''}`; $('[data-tx="title"]').value = t.title; }
            status('Enregistrement…');
            try { const r = await post('save_act_transcription', {id: t.id, title: t.title, kind: t.kind, media_id: t.media_id, date_text: t.date_text, place: t.place, source: t.source, body: t.body, data: t.data, to_media: toMedia ? 1 : 0}); t.id = r.result.id; dirty = false; status('✓ Enregistré'); if (toMedia) toast('Enregistré, et le texte est dans la transcription du média.'); ctx.onSaved?.(t.id); }
            catch (e) { status(''); toast(e.message, 'error'); }
        }
        function printIt() {
            const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée par le navigateur.', 'error');
            w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t.title || 'Transcription')}</title><style>body{font:14px/1.5 Georgia,serif;margin:16mm}h1{font-size:20px;margin:0 0 4px}.m{color:#555;margin:0 0 12px}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}img{max-width:100%;border:1px solid #ccc}pre{white-space:pre-wrap;font:inherit;margin:0}ul{padding-left:18px}@media print{.g{grid-template-columns:1fr}img{max-height:120mm;object-fit:contain}}</style>
                <h1>${esc($('[data-tx="title"]').value || 'Transcription')}</h1><p class="m">${esc([KINDS.find(k => k[0] === $('[data-tx="kind"]').value)?.[1], $('[data-tx="date_text"]').value, $('[data-tx="place"]').value, $('[data-tx="source"]').value].filter(Boolean).join(' · '))}</p>
                <div class="g">${t.filename ? `<img src="${location.origin}${location.pathname.replace(/[^/]*$/, '')}media/${esc(encodeURIComponent(t.filename))}">` : ''}<div><pre>${esc(area.value)}</pre>${t.data.people.length ? `<h3>Personnes</h3><ul>${t.data.people.map(p => `<li>${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</li>`).join('')}</ul>` : ''}</div></div><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
            w.document.close();
        }
        dlg.addEventListener('click', async e => {
            const tl = e.target.closest('[data-tx-tool]'); if (tl) return setTool(tl.dataset.txTool);
            const ch = e.target.closest('[data-tx-char]'); if (ch) { const s = area.selectionStart, en = area.selectionEnd, c = ch.dataset.txChar; area.setRangeText(c, s, en, 'end'); area.dispatchEvent(new Event('input')); area.focus(); return; }
            if (e.target.closest('[data-tx-zlink]')) { const z = t.data.zones.find(q => q.id === selZone), s = area.selectionStart, en = area.selectionEnd; if (!z) return; if (en <= s) return toast('Choisis d’abord un passage dans le texte.', 'error'); z.s = s; z.e = en; touch(); drawZones(); return; }
            if (e.target.closest('[data-tx-zdel]')) { t.data.zones = t.data.zones.filter(q => q.id !== selZone); selZone = null; touch(); drawZones(); return; }
            const c = e.target.closest('[data-tx-cmd]'); if (!c) return; c.closest('details')?.removeAttribute('open');
            const k = c.dataset.txCmd;
            if (k === 'close') return close();
            if (k === 'save') return save();
            if (k === 'tomedia') { if (!t.media_id) return toast('Il n’y a pas d’image de la base.', 'error'); return save(true); }
            if (k === 'image') return pickImage();
            if (k === 'zin' || k === 'zout') { const r = stage.getBoundingClientRect(), f = k === 'zin' ? 1.25 : .8, z = clamp(zoom * f, .02, 20); panX = r.width / 2 - (r.width / 2 - panX) * z / zoom; panY = r.height / 2 - (r.height / 2 - panY) * z / zoom; zoom = z; applyView(); drawZones(); return; }
            if (k === 'fit') { fit(); drawZones(); return; }
            if (k === 'rot') { t.data.view.rot = ((t.data.view.rot || 0) + 90) % 360; touch(); filter(); fit(); drawZones(); return; }
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
            const v = e.target.dataset.txView; if (v) { t.data.view[v] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value); filter(); touch(); return; }
            if (e.target.dataset.tx) { t[e.target.dataset.tx] = e.target.value; touch(); }
            if (e.target.matches('[data-tx-znote]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { z.note = e.target.value.slice(0, 300); touch(); } }
            if (e.target.matches('[data-tx-zcolor]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { z.c = e.target.value; touch(); drawZones(); } }
        });
        dlg.addEventListener('change', e => { if (e.target.dataset.tx === 'kind') { t.kind = e.target.value; touch(); } });
        const onKey = e => {
            if (!dlg.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dlg) return; // une fenêtre par-dessus (confirmation…) garde ses touches
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
            if (e.target.closest?.('input, textarea, select')) return;
            if (e.key === ' ' && !space) { space = true; stage.dataset.tool = 'pan'; e.preventDefault(); }
            if (e.key.toLowerCase() === 'z') setTool('zone'); if (e.key.toLowerCase() === 'h') setTool('pan');
            if ((e.key === 'Delete' || e.key === 'Backspace') && selZone) { t.data.zones = t.data.zones.filter(q => q.id !== selZone); selZone = null; touch(); drawZones(); }
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        async function close() { if (dirty && !await A().confirmBox('Les dernières modifications de la transcription seront perdues.', {title: 'Fermer sans enregistrer la transcription ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); ro.disconnect(); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        const ro = new ResizeObserver(() => { if (imgW && !drag) { applyView(); } }); ro.observe(stage);
        paintMirror(); paintPeople(); await loadImage();
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
            ${lbActs.length ? `<ul class="lb-acts-list">${lbActs.map(a => `<li><button type="button" class="link-button" data-lbact-open="${a.id}" title="Ouvrir dans Transcription d’actes">📜 ${esc(a.title || kindLabel(a.kind))}</button> <small class="muted">${esc([kindLabel(a.kind), a.date_text, a.place].filter(Boolean).join(' · '))}${a.people?.length ? ` · ${a.people.length} personne${a.people.length > 1 ? 's' : ''}` : ''}</small></li>`).join('')}</ul>` : '<p class="muted small">Aucun acte transcrit dans l’outil pour cette image.</p>'}`;
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
            <h3>Transcription du document</h3>${txt.trim() ? `<pre class="lb-read-pre">${esc(txt)}</pre>` : '<p class="muted">Rien d’écrit pour l’instant dans la visionneuse.</p>'}
            ${lbActs.map(a => `<section class="lb-read-act"><h3>📜 ${esc(a.title || kindLabel(a.kind))}</h3><p class="muted">${esc([kindLabel(a.kind), a.date_text, a.place, a.source].filter(Boolean).join(' · '))}</p>${a.people?.length ? `<p><b>Personnes :</b> ${people(a)}</p>` : ''}${a.body?.trim() ? `<pre class="lb-read-pre">${esc(a.body)}</pre>` : ''}<button type="button" class="button small secondary" data-lbact-open="${a.id}">Ouvrir dans Transcription d’actes</button></section>`).join('')}</div></div>`;
        ext.openDialog({eyebrow: 'TRANSCRIPTION', title: `📖 ${it.title || 'Document'}`, wide: true, submitLabel: '🖨️ Imprimer', body,
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
