/* LCNDA — 📜 Atelier de transcription d'actes : l'image de l'acte à gauche (zoom, contraste, rotation), le texte à droite ;
 * des zones dessinées sur l'image reliées à des passages du texte (cliquer l'un surligne l'autre) ; la lecture automatique
 * (OCR pour l'imprimé, HTR pour le manuscrit si un modèle est installé), qui pose aussi les zones ligne par ligne ;
 * le repérage des noms, rôles, dates (même écrites en toutes lettres, ou au calendrier républicain), lieux et métiers,
 * et le lien vers les fiches de la base. Serveur : lib/transcriptions.php.
 * Listes → Outils de modification → « 📜 Atelier de transcription », ou la visionneuse d'une image → « 📜 Ouvrir dans l'Atelier ».
 * 📄 Un seul texte par document (maquette docs/design/dossier-et-transcriptions.html, B) : le texte de l'Atelier est celui du
 * document (lib/transcriptions.php le recopie dans le média) ; la case de la visionneuse le montre et le change.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); }; // 🌐 textes traduits (docs/I18N.md) ; nombres gardés tels quels
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    /* ─── 🧲 les zones reliées aux lignes du texte : décalées de quelques caractères sur les anciennes transcriptions.
     * La cause : la case du texte était remplie par du HTML (<textarea>texte</textarea>), qui mange le saut de ligne du tout début
     * (et change \r\n en \n) : un texte qui commençait par une ligne vide perdait 1 caractère, et toutes les zones (posées sur le
     * texte enregistré) commençaient un caractère trop tard, à chaque ligne. La case est maintenant remplie par .value, et le texte
     * \r\n ramené à \n avec ses zones (normBody). snapZones recale les zones déjà abîmées sur les lignes du texte. ─── */
    /** \r\n et \r → \n ; les passages (zones, personnes…) de chaque liste suivent. Rend le texte. */
    function normBody(body, lists = []) {
        body = String(body ?? ''); if (!body.includes('\r')) return body;
        const map = new Array(body.length + 1); let out = '';
        for (let i = 0; i < body.length; i++) { map[i] = out.length; if (body[i] === '\r') { if (body[i + 1] !== '\n') out += '\n'; } else out += body[i]; }
        map[body.length] = out.length;
        const at = v => map[clamp(Math.round(Number(v) || 0), 0, body.length)];
        lists.forEach(list => (list || []).forEach(r => { if (r && r.s != null && r.e != null) { r.s = at(r.s); r.e = Math.max(r.s, at(r.e)); } }));
        return out;
    }
    const PAGE_MARK = /^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u, SNAP_MAX = 3, SNAP_SKIP = ['sign', 'note', 'skip'];
    /** les lignes du texte (sans les blancs du bord, sans les lignes vides ni les repères « — page 2 — ») : [{s, e}] */
    function textLinesOf(text) {
        const out = []; let pos = 0;
        for (const raw of String(text ?? '').split('\n')) { const s = pos; pos += raw.length + 1; const body = raw.trim(); if (!body || PAGE_MARK.test(raw)) continue; const lead = raw.length - raw.trimStart().length; out.push({s: s + lead, e: s + lead + body.length}); }
        return out;
    }
    /**
     * Les zones reliées à une ligne du texte dont le passage déborde ou s'arrête à quelques caractères des bords de la ligne :
     * {fixes: [{i, id, s, e}] (i : la place de la zone dans la liste ; le passage recalé sur la ligne), left: n (sans doute décalées, mais pas sûr : laissées)}.
     * Jamais touchées : les zones sans texte, les signatures / notes / « à ne pas lire », les zones de plusieurs lignes, celles d'un
     * mot ou d'un passage dans la ligne. startOnly : seulement les zones dont le début est décalé (le défaut des anciennes transcriptions).
     */
    function snapZones(text, zones, {startOnly = false} = {}) {
        text = String(text ?? ''); const lines = textLinesOf(text), fixes = [], key = l => `${l.s}:${l.e}`;
        const taken = new Set((zones || []).filter(z => lines.some(l => l.s === z.s && l.e === z.e)).map(z => `${z.s}:${z.e}`));
        let left = 0;
        (zones || []).forEach(z => {
            if (!z || !(z.e > z.s) || SNAP_SKIP.includes(z.kind) || taken.has(`${z.s}:${z.e}`)) return;
            const ov = lines.map(l => ({l, n: Math.min(z.e, l.e) - Math.max(z.s, l.s)})).filter(o => o.n > 0).sort((a, b) => b.n - a.n);
            if (!ov.length) return;
            if (ov.length > 1 && ov[1].n > SNAP_MAX) return; // plusieurs lignes : voulu
            const b = ov[0].l, ds = z.s - b.s, de = z.e - b.e, len = b.e - b.s;
            if (z.s <= b.s && z.e >= b.e && !text.slice(z.s, z.e).trim().replace(text.slice(b.s, b.e), '')) return; // la ligne et des blancs autour : juste
            if (Math.abs(ds) > 2 * SNAP_MAX || Math.abs(de) > 2 * SNAP_MAX) return; // un mot, un passage dans la ligne : pas une zone de ligne
            if (startOnly && !ds) return;
            const lim = Math.min(SNAP_MAX, Math.floor(len / 8)), shifted = ds === de && Math.abs(ds) <= SNAP_MAX;
            const ok = (shifted || (Math.abs(ds) <= lim && Math.abs(de) <= lim)) && ov[0].n >= len * .6 && !taken.has(key(b));
            if (!ok) { left++; return; }
            taken.add(key(b)); fixes.push({i: zones.indexOf(z), id: z.id, s: b.s, e: b.e});
        });
        return {fixes, left};
    }
    /* ─── 🧲 les zones de ligne suivent ce qu'on écrit : une zone qui couvrait toute sa ligne la couvre encore après la modification
     * (une lettre au début ou à la fin de la ligne, la 1re lettre effacée, un collage sur le début, Entrée au milieu : la zone garde la
     * 1re partie ; Retour arrière au début d'une ligne : les deux zones se partagent la ligne ; le contraire les remet comme avant). ─── */
    const lineBounds = (text, pos) => { const ls = text.lastIndexOf('\n', pos - 1) + 1; let le = text.indexOf('\n', pos); if (le < 0) le = text.length; return [ls, le]; };
    /** la zone couvre exactement le texte de sa ligne (sans les blancs du bord) */
    function isFullLine(text, z) {
        if (!(z.e > z.s) || z.e > text.length || text.slice(z.s, z.e).includes('\n')) return false;
        const [ls, le] = lineBounds(text, z.s), raw = text.slice(ls, le), lead = raw.length - raw.trimStart().length;
        return z.s === ls + lead && z.e === ls + lead + raw.trim().length;
    }
    /** before → now (un seul morceau changé : [p, oldEnd) de before devient [p, oldEnd + delta) de now) : les zones suivent */
    function followEdit(before, now, zones, {p, oldEnd, delta}) {
        const nowEnd = oldEnd + delta, ins = now.slice(p, nowEnd);
        const full = new Set(zones.filter(z => !SNAP_SKIP.includes(z.kind) && z.s - 1 <= oldEnd && p <= z.e + 1 && isFullLine(before, z)));
        const f = v => (v >= oldEnd ? v + delta : v > p ? Math.max(p, Math.min(v, nowEnd)) : v);
        const lead = oldEnd === p && delta > 0 && (p === 0 || now[p - 1] === '\n') && !ins.includes('\n'); // écrit tout au début de la ligne
        const nl = oldEnd === p && delta > 0 ? ins.indexOf('\n') : -1; // un retour à la ligne écrit juste à la fin d'une zone : elle s'arrête avant
        zones.forEach(z => { if (lead && z.s === p && z.e > z.s) z.e += delta; else if (nl >= 0 && z.e === p && z.e > z.s && z.s < p) z.e = p + nl; else { z.s = f(z.s); z.e = Math.max(z.s, f(z.e)); } });
        full.forEach(z => {
            const k = now.slice(z.s, z.e).search(/\S/); if (k < 0) return; const pos = z.s + k; // la 1re lettre de la zone : sa ligne
            const [ls, le] = lineBounds(now, pos); let a = ls, b = le;
            full.forEach(o => { if (o === z || !(o.e > o.s) || o.e <= ls || o.s >= le) return; if (o.s >= pos) b = Math.min(b, o.s); else if (o.e <= pos) a = Math.max(a, o.e); }); // une autre zone de ligne sur la même ligne (deux lignes jointes)
            while (a < b && /\s/.test(now[a])) a++; while (b > a && /\s/.test(now[b - 1])) b--;
            if (b > a) { z.s = a; z.e = b; }
        });
        return zones;
    }
    /** le morceau changé entre deux textes : {p, oldEnd, delta} */
    function diffOf(before, now) {
        let p = 0; while (p < before.length && p < now.length && before[p] === now[p]) p++;
        let q = 0; while (q < before.length - p && q < now.length - p && before[before.length - 1 - q] === now[now.length - 1 - q]) q++;
        return {p, q, oldEnd: before.length - q, delta: now.length - before.length};
    }
    ext.txSnap = {normBody, textLinesOf, snapZones, followEdit, diffOf, isFullLine}; // pour les essais (tests/test-zones-recalees.js)
    let deepRun = null; // 📑 « 🔬 Lecture approfondie » sur toutes les pages : la lecture en cours (elle suit l'Atelier d'un acte à l'autre, un texte par page)
    let seq = 0; const zid = () => 'z' + Date.now().toString(36) + (++seq);
    const TXX = () => ext.txXml; // 🧾 ALTO / 📄 PAGE et les sortes de zone (heritage-transcribe-xml.js)
    const XK = k => { const r = TXX()?.KINDS.find(q => q[0] === k); return r ? `${r[1]} ${i18n(r[2])}` : ''; };
    const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.parentNode.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

    const KINDS = [['apreciser', i18n('À préciser')], ['bapteme', i18n('Baptême')], ['naissance', i18n('Naissance')], ['mariage', i18n('Mariage')], ['deces', i18n('Décès')], ['sepulture', i18n('Sépulture')], ['notarial', i18n('Acte notarié')], ['notoriete', i18n('Acte de notoriété')], ['recensement', i18n('Recensement')], ['militaire', i18n('Registre militaire')], ['lettre', i18n('Lettre')], ['autre', i18n('Autre')]];
    const COLORS = ['#f6c343', '#7cc4f0', '#9be08f', '#f59ab0', '#c3a6f2', '#f7a35c', '#6fd6c8', '#e6e15a'];
    // des modèles d'acte, pour ne pas partir d'une page blanche
    let fixAfterSwitch = false; // 📑 un texte par page : la barre des corrections suit sur l'acte de l'autre page
    const TEMPLATES = {
        bapteme: 'L’an [année], le [jour] du mois de [mois], a été [baptisé / baptisée] [prénom], [né / née] [hier / ce jour], [fils / fille] légitime de [prénom et nom du père], [métier], et de [prénom et nom de la mère], son épouse, de cette paroisse. Le parrain a été [nom], la marraine [nom], qui ont signé avec nous / déclaré ne savoir signer.\n[signatures]',
        naissance: 'L’an [année], le [jour] [mois], à [heure], par-devant nous, [nom], maire, officier de l’état civil de la commune de [commune], est comparu [prénom et nom du père], [âge], [métier], demeurant à [lieu], lequel nous a présenté un enfant de sexe [masculin / féminin], né [date] de lui déclarant et de [prénom et nom de la mère], son épouse, auquel il a donné le prénom de [prénom]. En présence de [témoin 1] et de [témoin 2].\n[signatures]',
        mariage: 'L’an [année], le [jour] [mois], après la publication de trois bans, ont été mariés [prénom et nom de l’époux], [âge], [métier], fils de [père] et de [mère], d’une part, et [prénom et nom de l’épouse], [âge], fille de [père] et de [mère], d’autre part. Présents : [témoins].\n[signatures]',
        deces: 'L’an [année], le [jour] [mois], sont comparus [déclarant 1] et [déclarant 2], lesquels nous ont déclaré que [prénom et nom], [âge], [métier], [époux / veuve de …], [fils / fille] de [père] et de [mère], est [décédé / décédée] le [date] à [lieu].\n[signatures]',
        sepulture: 'L’an [année], le [jour] du mois de [mois], a été inhumé dans le cimetière de cette paroisse le corps de [prénom et nom], [âgé / âgée] d’environ [âge] ans, [décédé / décédée] le [date], [époux / veuve de …]. Présents : [témoins].\n[signatures]',
        notarial: 'Par-devant [nom], notaire royal / public à [lieu], soussigné, et en présence des témoins ci-après nommés, furent présents [parties]…\n[objet de l’acte]\nFait et passé à [lieu], le [date], en présence de [témoins].\n[signatures]',
    };
    /* la frise du panneau de droite (maquette atelier-transcription-idees.html, P3 ; décision 3) : [clé, nom, ce qu'on y fait] */
    const STEPS = [['read', 'Lire', 'Lire l’image (« ✨ Lire ▾ ») ou écrire le texte, ligne à ligne'], ['fix', 'Corriger', 'Relire et corriger : corrections proposées, mots douteux [?], aide à la lecture'],
        ['find', 'Repérer', 'Repérer les noms, dates, lieux et métiers'], ['add', 'Ajouter', 'Ajouter les personnes et l’événement à la généalogie']];
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

    /* La langue du texte (lecture automatique + « 📜 Aide à la lecture » ouverte sur cette langue) : retenue d'une fois sur l'autre */
    const TX_BASE = [['fra', i18n('Français')], ['lat', 'Latin'], ['fra+lat', i18n('Français + latin')], ['eng', 'Anglais'], ['deu', 'Allemand'], ['ita', 'Italien'], ['spa', 'Espagnol'], ['pol', 'Polonais'], ['nld', i18n('Néerlandais')], ['grc', 'Grec ancien'], ['ell', 'Grec moderne']];
    /** la liste + les langues de l'aide à la lecture (aide-langues/<code>.js, leur champ `ocr`) qui n'y sont pas encore */
    const txLangs = () => { const out = TX_BASE.slice(), have = new Set(out.map(([k]) => k));
        (window.LCNDA_AIDE_LECTURE?.langs?.() || []).forEach(l => (l.ocr || []).forEach(c => { if (/^[a-z]{3}(\+[a-z]{3})?$/.test(c) && !have.has(c)) { have.add(c); out.push([c, String(l.name || c)]); } }));
        return out; };
    const TX_LANG_KEY = 'genealogie-tx-lang';
    const txLang = () => { try { const v = localStorage.getItem(TX_LANG_KEY); return txLangs().some(([k]) => k === v) ? v : 'fra'; } catch (_) { return 'fra'; } };
    /** la langue de l'aide à la lecture pour la langue choisie (« deu » → « de ») ; rien pour le français */
    const aideLang = v => window.LCNDA_AIDE_LECTURE?.langForOcr?.(v) || '';
    const langName = code => window.LCNDA_AIDE_LECTURE?.langOf?.(code)?.name || '';

    /* ═════════ 🪄 Corrections proposées (moteur : app-htr-correction.js ; lexique de la base : GET htr_lexicon) ═════════
     * Jamais imposées : un mot souligné en violet, un clic → 1 à 3 propositions, « Garder tel quel », « Ajouter au lexique » ;
     * « ✓ Accepter les N propositions sûres » ; « ↶ Annuler » après chaque geste. Réglages : genealogie-htr-fix ('0' = non),
     * genealogie-htr-fix-level ('plus' = plus de propositions) ; le lexique personnel : genealogie-htr-lexique (gardé aussi dans la base). */
    const FIX_KEY = 'genealogie-htr-fix', FIX_LEVEL_KEY = 'genealogie-htr-fix-level', FIX_LEX_KEY = 'genealogie-htr-lexique';
    const lsGet = (k, d = '') => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const fixOn = () => lsGet(FIX_KEY) !== '0';
    const fixLevel = () => (lsGet(FIX_LEVEL_KEY) === 'plus' ? 'plus' : 'prudent');
    const personalLex = () => { try { const a = JSON.parse(lsGet(FIX_LEX_KEY, '[]')); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).slice(0, 5000) : []; } catch (_) { return []; } };
    let fixNames = null, fixCache = null;
    /** le lexique pour cette langue et ce lieu (les noms de la base lus une fois) */
    async function fixLexicon(lang, place = '') {
        const F = window.LCNDA_HTRFIX; if (!F) return null;
        if (!fixNames) fixNames = A().api('htr_lexicon').catch(() => ({}));
        const dico = await F.loadDico?.().catch(() => null); // 📖 le dictionnaire général du français, chargé une fois (un mot juste n'est jamais remplacé)
        const names = await fixNames, pers = personalLex(), key = `${lang}|${place}|${dico ? 1 : 0}|${pers.join('\u0001')}`;
        if (fixCache?.key !== key) fixCache = {key, lex: F.buildLexicon({lang, names, personal: pers, place})};
        return fixCache.lex;
    }
    /** « Ajouter au lexique » (↶ Annuler le retire) */
    function addToLexicon(word, after) {
        const w = String(word || '').trim(); if (!w) return;
        const list = personalLex(); if (list.some(x => x.toLowerCase() === w.toLowerCase())) return;
        lsSet(FIX_LEX_KEY, JSON.stringify([...list, w])); fixCache = null; after?.();
        A().undoToast?.(i18n('« {w} » ajouté au lexique', {w}), {undo: () => { lsSet(FIX_LEX_KEY, JSON.stringify(personalLex().filter(x => x !== w))); fixCache = null; after?.(true); }, redo: () => { lsSet(FIX_LEX_KEY, JSON.stringify([...personalLex(), w])); fixCache = null; after?.(); }});
    }
    /** le petit menu d'un mot souligné (K14) */
    function fixMenu(at, fix, {apply, keep, addLex}) {
        const items = fix.props.map(p => ({icon: '✓', label: p.value, help: p.why, run: () => apply(p.value)}));
        items.push('-', {icon: '✋', label: i18n('Garder tel quel'), run: keep}, {icon: '＋', label: i18n('Ajouter au lexique'), help: i18n('Ce mot ne sera plus souligné'), run: addLex});
        return window.LCNDA_UI?.menuAt?.(at, items, {title: `« ${fix.word} »`});
    }
    /** réglages : l'interrupteur et le choix du seuil (K16 ; menu de choix unique) */
    const fixSettingsHtml = () => `<label class="ui-toggle h-fix-on"><input type="checkbox" data-fix-on ${fixOn() ? 'checked' : ''}><i></i>${esc(i18n('Proposer des corrections (conseillé)'))}</label>
        <label class="h-fix-level">${esc(i18n('Seuil'))} <select data-fix-level><option value="prudent" ${fixLevel() === 'prudent' ? 'selected' : ''}>${esc(i18n('Prudent (conseillé)'))}</option><option value="plus" ${fixLevel() === 'plus' ? 'selected' : ''}>${esc(i18n('Plus de propositions'))}</option></select></label>`;
    const bindFixSettings = (root, onChange) => {
        root.querySelector('[data-fix-on]')?.addEventListener('change', e => { lsSet(FIX_KEY, e.target.checked ? '1' : '0'); onChange?.(); });
        root.querySelector('[data-fix-level]')?.addEventListener('change', e => { lsSet(FIX_LEVEL_KEY, e.target.value); onChange?.(); });
    };
    ext.htrFix = {fixOn, fixLevel, personalLex, fixSettingsHtml, bindFixSettings, lexicon: fixLexicon, addToLexicon, menu: fixMenu, KEYS: {FIX_KEY, FIX_LEVEL_KEY, FIX_LEX_KEY}};

    /* ═════════ « ✨ Lire ▾ » : un seul bouton, trois lectures expliquées (maquette atelier-transcription-idees.html, P2) ═════════ */
    // [commande, symbole, nom, ce qui la distingue] — la lecture à la main d'abord : c'est la plus utile pour les registres
    const READS = [
        ['htr', '✍️', 'Lire l’écriture à la main (rapide)', 'Quelques secondes par page, sur cet ordinateur. Toute la page ou la zone choisie (▭) ; chaque ligne est reliée à sa zone de l’image, les mots peu sûrs surlignés. S’installe une fois (Réglages).'],
        ['ocr', '🖨', 'Lire un texte imprimé', 'Pour un texte imprimé ou tapé (journaux, fiches matricules) : rapide, rien à installer, chaque ligne reliée à sa zone. Ne sait pas lire l’écriture à la main.'],
        ['deep', '🔬', 'Lecture approfondie (IA)', 'Plus lente (de 20 s à quelques minutes par page) mais meilleure sur une écriture difficile : un modèle d’IA qui tourne sur cet ordinateur (Ollama, plusieurs Go à télécharger une fois). Les lignes se relient ensuite à l’image (▤).'],
    ];
    function readPanelHtml() {
        const opt = ([k, ic, label, what]) => `<button type="button" class="h-tx-readopt" data-tx-cmd="${k}" role="menuitem"><span class="h-tx-readt">${ic} <b>${esc(i18n(label))}</b><span class="h-tx-readst" data-tx-readst="${k}"></span></span><small>${esc(i18n(what))}</small></button>`;
        return `<div class="h-tx-readpanel" data-tx-readpanel hidden role="menu" aria-label="${esc(i18n('Lire', {ctx: 'atelier'}))}">${READS.map(opt).join('')}
            <div class="h-tx-readscope" data-tx-readscope hidden role="radiogroup" aria-label="${esc(i18n('Plusieurs pages'))}"><label><input type="radio" name="txreadscope" value="page" checked> ${esc(i18n('Sur la page affichée'))}</label><label><input type="radio" name="txreadscope" value="all"> ${esc(i18n('Sur toutes les pages'))}</label><label><input type="radio" name="txreadscope" value="empty"> ${esc(i18n('Seulement les pages pas encore lues'))}</label><small class="h-tx-pread" data-tx-pread></small></div>
            <div class="h-tx-readmore"><button type="button" class="link-button h-tx-readia" data-tx-cmd="aideia" role="menuitem" title="${esc(i18n('Ce que l’on sait déjà de l’acte (titre, de quoi il parle, personnes reliées, indices de la base) : l’IA s’en sert pour lire les mots douteux, sans rien inventer'))}">🧠 ${esc(i18n('Aider l’IA à lire…'))}</button><button type="button" class="h-tx-readopt h-tx-readline" data-tx-cmd="lines" role="menuitem" title="${esc(i18n('Relier chaque ligne du texte à sa ligne sur l’image (zones de couleur, clic ligne ↔ zone) : après la lecture approfondie, ou sur un texte déjà mis'))}">▤ ${esc(i18n('Relier les lignes à l’image'))}</button>
            <label class="h-tx-readlang">🌐 ${esc(i18n('Langue du texte'))} <select data-tx-lang title="${esc(i18n('Langue du texte : sert à la lecture automatique, et « 📖 Aide à la lecture » s’ouvre sur cette langue'))}">${txLangs().map(([v, l]) => `<option value="${esc(v)}" ${txLang() === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="ui-toggle h-tx-useenh" title="${esc(i18n('La lecture (imprimé et manuscrit) et l’export prennent l’image avec les réglages « Mieux voir » (contraste, netteté, canal, seuil…), sinon l’image d’origine'))}"><input type="checkbox" data-tx-useenh ${useEnh() ? 'checked' : ''}><i></i>${i18n('Lire et exporter l’image améliorée')}</label></div></div>`;
    }
    /** l'état de chaque lecture : installée ou à installer (demandé à l'ouverture du menu, gardé une minute) */
    let readSt = null, readStAt = 0;
    async function readStates() {
        if (readSt && Date.now() - readStAt < 60000) return readSt;
        const [h, d] = await Promise.all([api('htr_setup_status').catch(() => null), api('tx_deep_status').catch(() => null)]);
        readSt = {ocr: true, htr: !!(h && h.ready && (h.models || []).some(m => m.present)), deep: !!(d && d.local_only !== false && d.running && (d.models || []).some(m => m.present))}; readStAt = Date.now(); return readSt;
    }

    /* 🎨 opacité des cadres de couleur (0 à 100 %, retenue sur cet ordinateur ; 100 = comme avant) */
    const ZOP_KEY = 'genealogie-tx-zone-opacity';
    const zop = () => { try { const v = Number(localStorage.getItem(ZOP_KEY)); return localStorage.getItem(ZOP_KEY) === null || !Number.isFinite(v) ? 1 : Math.min(1, Math.max(0, v / 100)); } catch (_) { return 1; } };
    const zopHtml = () => `<label class="h-tx-zop" title="${esc(i18n('Opacité des cadres de couleur (0 = presque invisibles)'))}">${esc(i18n('Cadres'))} <input type="range" min="0" max="100" step="5" value="${Math.round(zop() * 100)}" data-tx-zop aria-label="${esc(i18n('Opacité des cadres de couleur (0 = presque invisibles)'))}"></label>`;

    /* ═════════ L'atelier ═════════ */
    async function open(ctx = {}) {
        const TV = ext.txView; // « 🎚️ Mieux voir » et la barre réglable (heritage-transcribe-view.js)
        let t = {id: 0, title: '', kind: 'apreciser', media_id: 0, filename: '', date_text: '', place: '', source: '', body: '', data: {zones: [], people: [], status: 'todo', view: TV.viewOf()}};
        if (!ctx.id && ctx.mediaId) { try { const o = await api('act_page_owner', {media_id: ctx.mediaId}); if (o?.id) ctx = {...ctx, id: Number(o.id), page: Number(ctx.mediaId)}; } catch (_) {} } // 📑
        if (ctx.id) { try { const r = await api('act_transcription', {id: ctx.id}); t = {...t, ...r, data: {...t.data, ...(r.data || {})}}; t.data.view = TV.viewOf(r.data?.view); if (!['todo', 'doing', 'checked', 'done'].includes(t.data.status)) t.data.status = String(t.body || '').trim() ? 'doing' : 'todo'; } catch (e) { return toast(e.message, 'error'); } }
        else if (ctx.mediaId) { t.media_id = Number(ctx.mediaId); t.filename = ctx.filename || ''; t.title = fileLikeTitle(ctx.title, ctx.filename) ? '' : (ctx.title || ''); t.body = ctx.text || ''; if (KINDS.some(k => k[0] === ctx.kind)) t.kind = ctx.kind; } // kind : ex. « lettre » pour le dos d'une carte postale
        t.data.zones = Array.isArray(t.data.zones) ? t.data.zones : []; t.data.people = Array.isArray(t.data.people) ? t.data.people : [];
        t.body = normBody(t.body, [t.data.zones, t.data.people]); // 🧲 \r\n → \n : la case le ferait de toute façon, les zones suivent
        let dirty = false, tool = 'pan', fitMode = 'page', fitOn = true, zoom = 1, panX = 0, panY = 0, selZone = null, found = [], imgW = 0, imgH = 0, matchCache = new Map();
        let flowView = '', flowCur = '', flowT = 0, fixCount = null, fixCountFor = ''; // la frise (plus bas)
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-tx-dlg';
        dlg.innerHTML = `<div class="h-tx" data-ptab="text">
            <header class="h-tx-top"><span class="h-tx-logo">📜</span><nav class="h-tx-menus" data-tx-menus></nav><span class="ui-topbar-hist h-tx-hist"><button type="button" class="icon-button small" data-tx-hist="undo" title="${esc(i18n('Annuler'))}" data-shortcut="⌘Z" disabled>↶</button><button type="button" class="icon-button small" data-tx-hist="redo" title="${esc(i18n('Rétablir'))}" data-shortcut="⇧⌘Z" disabled>↷</button></span><input data-tx="title" class="h-tx-title" maxlength="200" placeholder="${esc(i18n('Titre de l’acte (ex. Baptême de Jean Martin, 1790)'))}" value="${esc(t.title)}">
                <select data-tx="kind" title="${esc(i18n('Genre d’acte'))}">${KINDS.map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <input data-tx="date_text" placeholder="${esc(i18n('Date'))}" value="${esc(t.date_text)}" title="${esc(i18n('Date de l’acte'))}"><input data-tx="place" placeholder="${esc(i18n('Lieu'))}" value="${esc(t.place)}" title="${esc(i18n('Paroisse, commune'))}"><input data-tx="source" placeholder="${esc(i18n('Source (AD, cote, vue)'))}" value="${esc(t.source)}" title="${esc(i18n('Archives, cote, numéro de vue'))}">
                <select data-tx-state title="${esc(i18n('Où en est cette transcription (pour la liste « Transcriptions d’actes »)'))}">${[['todo', i18n('À faire')], ['doing', i18n('En cours')], ['checked', i18n('Relue')], ['done', i18n('Finie')]].map(([k, l]) => `<option value="${k}" ${t.data.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <span class="spacer"></span><span class="muted h-tx-status" data-tx-status data-ui-status></span>
                <button type="button" class="button small secondary h-tx-iabtn" data-tx-cmd="aideia" title="${esc(i18n('Aider l’IA à lire cet acte : ce qui est coché part avec l’image vers l’IA (lecture approfondie)'))}">🧠 ${esc(i18n('Aider l’IA'))}<span data-tx-iacount></span></button><button type="button" class="button small secondary" data-tx-cmd="export" title="${esc(i18n('Le texte (.txt), l’impression ou un PDF (image + texte)'))}">⤓ ${i18n('Exporter ▾')}</button><button type="button" class="button small" data-tx-cmd="save" title="${esc(i18n('Enregistrer'))}" data-shortcut="${esc(ext.shortcutLabel?.('⌘S') || '⌘S')}">💾 ${i18n('Enregistrer')}</button>${ext.fullButton ? ext.fullButton('transcribe') : ''}<button type="button" class="icon-button" data-tx-cmd="close" title="${esc(i18n('Fermer'))}">×</button></header>
            <div class="ui-tabs h-tx-ptabs" role="tablist" aria-label="${esc(i18n('Image, texte ou personnes'))}" data-tx-ptabs>${[['image', '🖼️', 'Image'], ['text', '📝', 'Texte'], ['people', '👥', 'Personnes']].map(([k, ic, l]) => `<button type="button" role="tab" data-tx-ptab="${k}" class="${k === 'text' ? 'is-active' : ''}" aria-selected="${k === 'text'}">${ic} ${esc(i18n(l))}${k === 'people' ? ' <span class="h-tx-pcount" data-tx-pcount></span>' : ''}</button>`).join('')}</div>
            <div class="h-tx-main">
                <nav class="h-tx-rail" data-tx-rail aria-label="${esc(i18n('Outils'))}"><button type="button" data-tx-tool="pan" title="${esc(i18n('Déplacer l’image, ou barre d’espace'))}" aria-label="${esc(i18n('Déplacer l’image'))}" data-shortcut="H">✋</button><button type="button" data-tx-tool="zone" title="${esc(i18n('Dessiner une zone : choisis un passage dans le texte, puis dessine son rectangle sur l’image (les deux restent liés)'))}" aria-label="${esc(i18n('Dessiner une zone'))}" data-shortcut="Z">▭</button><button type="button" data-tx-cmd="loupe" title="${esc(i18n('Loupe qui suit la souris (la molette change le grossissement)'))}" aria-label="${esc(i18n('Loupe'))}" data-shortcut="L">🔍</button><button type="button" data-tx-cmd="rot" title="${esc(i18n('Tourner l’image de 90°'))}" aria-label="${esc(i18n('Tourner de 90°'))}">⟳</button><button type="button" data-tx-cmd="image" title="${esc(i18n('Choisir l’image de l’acte (base ou ordinateur)'))}" aria-label="${esc(i18n('Image de l’acte'))}">🖼️</button></nav>
                <section class="h-tx-left">
                    <div class="h-tx-barwrap" data-tx-barwrap>${TV.toolbarHtml(t.data.view)}${zopHtml()}${ext.txCtx ? ext.txCtx.wordColorHtml() : ''}</div><div class="h-tx-pages" data-tx-pages role="tablist" aria-label="${esc(i18n('Pages du document'))}" hidden></div>
                    <div class="h-tx-stage" data-tx-stage tabindex="-1"><svg data-tx-svg><g data-tx-world><image data-tx-img/><g data-tx-zones></g><g data-tx-words></g><g data-tx-handles></g><rect data-tx-draw class="h-tx-draw" hidden/></g></svg><canvas class="h-tx-loupe" data-tx-loupe hidden aria-hidden="true"></canvas><p class="h-tx-empty" data-tx-empty>${i18n('Choisis l’image de l’acte : « 🖼️ Image… » (une photo de la base, ou un fichier de l’ordinateur).')}</p></div>
                    <div class="h-tx-zonebar" data-tx-zonebar hidden></div>
                </section>
                <section class="h-tx-right">
                    <div class="h-tx-flow" data-tx-flow><div class="h-tx-steps" role="tablist" aria-label="${esc(i18n('Les étapes : Lire, Corriger, Repérer, Ajouter à la généalogie'))}" data-tx-steps>${STEPS.map(([k, label, help], i) => `<button type="button" role="tab" class="h-tx-step" data-tx-step="${k}" aria-selected="false" aria-controls="h-tx-pane-${k}" title="${esc(i18n(help))}"><i aria-hidden="true">${i + 1}</i><span><b>${esc(k === 'read' ? i18n('Lire', {ctx: 'atelier'}) : i18n(label))}</b><small data-tx-steprest="${k}"></small></span></button>`).join('')}</div>
                    <div class="h-tx-tools h-tx-stepbody" data-tx-stepbody><span class="h-tx-readw"><button type="button" class="h-tx-readbtn" data-tx-cmd="readmenu" aria-haspopup="true" aria-expanded="false" title="${esc(i18n('Lire le texte de l’image : écriture à la main, texte imprimé, ou lecture approfondie par l’IA'))}">✨ ${esc(i18n('Lire', {ctx: 'atelier'}))} ▾</button>${readPanelHtml()}</span><span class="h-tx-htrrun" data-tx-htrrun hidden>${window.LCNDA_UI.spinner('', {inline: true})}<button type="button" class="button small secondary" data-tx-cmd="htrstop" title="${esc(i18n('Arrêter la lecture'))}">■ ${i18n('Arrêter')}</button></span>
                        <span class="h-tx-pane" role="tabpanel" id="h-tx-pane-read" data-tx-pane="read"><button type="button" data-tx-cmd="template" title="${esc(i18n('Un modèle d’acte à compléter'))}">🧩 ${i18n('Modèle')}</button><small class="muted h-tx-panehint">${esc(i18n('Toute la page ou la zone choisie (▭) ; ou écris le texte toi-même, ligne à ligne.'))}</small></span>
                        <span class="h-tx-pane" role="tabpanel" id="h-tx-pane-fix" data-tx-pane="fix"><button type="button" data-tx-cmd="fix" title="${esc(i18n('Proposer des corrections pour les mots mal lus (un mot souligné : clique-le pour choisir)'))}">🪄 ${i18n('Corrections')}</button><button type="button" data-tx-cmd="aide" title="${esc(i18n('Le latin des registres, les abréviations, les anciennes lettres (ſ, ꝑ…) et des exercices : choisis d’abord un mot dans le texte pour le chercher'))}">📖 ${i18n('Aide à la lecture')}</button><button type="button" data-tx-cmd="review" data-shortcut="R" title="${esc(i18n('Relire ligne à ligne en plein écran : le morceau d’image au-dessus de chaque ligne'))}">👁 ${esc(i18n('Relire ligne à ligne'))}</button><button type="button" data-tx-cmd="aideia" title="${esc(i18n('Ce que l’on sait déjà de l’acte (titre, de quoi il parle, personnes reliées, indices de la base) : l’IA s’en sert pour lire les mots douteux, sans rien inventer'))}">🧠 ${esc(i18n('Aider l’IA'))}</button><small class="muted h-tx-panehint" data-tx-fixinfo></small></span>
                        <span class="h-tx-pane" role="tabpanel" id="h-tx-pane-find" data-tx-pane="find"><button type="button" data-tx-cmd="detect" title="${esc(i18n('Repérer les noms, dates, lieux et métiers'))}" data-help="${esc(i18n('Cherche dans le texte les noms (avec leur rôle : parrain, témoin…), les dates (même en toutes lettres ou au calendrier républicain), les lieux et les métiers, pour les relier aux fiches.'))}">🧭 ${i18n('Repérer')}</button><small class="muted h-tx-panehint" data-tx-findinfo></small></span>
                        <span class="h-tx-pane" role="tabpanel" id="h-tx-pane-add" data-tx-pane="add"><button type="button" data-tx-cmd="found" title="${esc(i18n('L’événement, les personnes et leurs liens, la source : relier, comparer ou créer les fiches'))}">✓ ${i18n('Ajouter à la généalogie')}…</button><small class="muted h-tx-panehint">${esc(i18n("L’événement, les personnes et leurs liens, la source : relier, comparer ou créer les fiches"))}</small></span>
                        <span class="spacer"></span><button type="button" class="h-tx-stepnext" data-tx-stepnext title="${esc(i18n('Étape suivante'))}">${esc(i18n('Étape suivante'))} ›</button></div><div class="h-tx-prog" data-tx-prog aria-label="${esc(i18n('Avancement'))}"></div></div>
                    <div class="h-tx-why" data-tx-whyrow hidden></div><div class="h-tx-chars">${SPECIAL.map(c => `<button type="button" data-tx-char="${esc(c)}" title="${esc(i18n('Insérer {c}', {c: esc(c)}))}">${esc(c)}</button>`).join('')}</div>
                    <div class="h-tx-find" data-tx-find hidden role="search" aria-label="${esc(i18n('Chercher dans le texte'))}"><input type="search" data-tx-fq placeholder="${esc(i18n('Chercher…'))}" aria-label="${esc(i18n('Chercher'))}" spellcheck="false" autocomplete="off" data-ui-off><span class="h-tx-fcount" data-tx-fcount aria-live="polite"></span><button type="button" data-tx-f="prev" title="${esc(i18n('Précédent'))}" aria-label="${esc(i18n('Précédent'))}" data-shortcut="⇧↩">↑</button><button type="button" data-tx-f="next" title="${esc(i18n('Suivant'))}" aria-label="${esc(i18n('Suivant'))}" data-shortcut="↩">↓</button><button type="button" data-tx-f="case" aria-pressed="false" title="${esc(i18n('Majuscules et minuscules comptent'))}">Aa</button><button type="button" data-tx-f="rep" aria-pressed="false" title="${esc(i18n('Chercher et remplacer'))}" data-shortcut="⌥⌘F">⇄</button><button type="button" class="h-tx-fclose" data-tx-f="close" title="${esc(i18n('Fermer'))}" aria-label="${esc(i18n('Fermer'))}">×</button>
                        <span class="h-tx-frep" data-tx-frep hidden><input type="text" data-tx-fr placeholder="${esc(i18n('Remplacer par…'))}" aria-label="${esc(i18n('Remplacer par…'))}" spellcheck="false" autocomplete="off" data-ui-off><button type="button" data-tx-f="one">${esc(i18n('Remplacer'))}</button><button type="button" data-tx-f="all">${esc(i18n('Tout remplacer'))}</button></span></div>
                    <div class="h-tx-editor${TV.lineNos() ? ' has-ln' : ''}" data-tx-editor><div class="h-tx-mirror" data-tx-mirror aria-hidden="true"></div><textarea data-tx-body spellcheck="false" placeholder="${esc(i18n('La transcription, ligne à ligne comme sur l’acte. Choisis un passage, puis dessine sa zone sur l’image (▭ Zone) : les deux restent liés.'))}">${esc(t.body)}</textarea><div class="h-tx-abtip" data-tx-abtip hidden role="tooltip"></div></div>
                    <div class="h-tx-fixbar" data-tx-fixbar hidden></div>
                    <div class="h-tx-vers" data-tx-vers hidden></div><div class="h-tx-vprev" data-tx-vprev hidden></div><p class="h-tx-docnote" data-tx-docnote hidden>📄 ${esc(i18n('Ce texte est celui du document : il se voit dans la visionneuse, la page du document et la fiche des personnes reliées.'))}</p>
                    <div class="h-tx-found" data-tx-found></div>
                    <div class="h-tx-addbar" data-tx-addbar><span class="h-tx-addinfo" data-tx-addinfo></span><span class="h-tx-extra"><button type="button" class="button small secondary" data-tx-cmd="copy">📋 ${i18n("Copier le texte")}</button><button type="button" class="button small" data-tx-cmd="found" title="${esc(i18n('L’événement, les personnes et leurs liens, la source : relier, comparer ou créer les fiches'))}">✓ ${i18n('Ajouter à la généalogie')}…</button></span></div>
                </section>
            </div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'transcribe', true); dlg.showModal();
        dlg.txApi = {get: () => t, touch: () => touch()}; // 🌐 « Traduire » (plus-famille-latin.js) : garder la traduction dans la transcription (t.data.translation) // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        const $ = s => dlg.querySelector(s), area = $('[data-tx-body]'), mirror = $('[data-tx-mirror]'), svg = $('[data-tx-svg]'), world = $('[data-tx-world]'), img = $('[data-tx-img]'), stage = $('[data-tx-stage]');
        area.value = t.body; // 🧲 le HTML d'une <textarea> mange le saut de ligne du tout début : sans ceci, toutes les zones commençaient 1 caractère trop tard
        const UI = window.LCNDA_UI || {}, STATES = {'modifié': 'dirty', '✓ Enregistré': 'saved', 'Enregistrement…': 'saving'};
        const status = s => { const el = $('[data-tx-status]'); el.title = s || ''; if (STATES[s] && UI.savedStatus) UI.savedStatus(el, STATES[s]); else el.textContent = s || ''; };
        let commitT = 0, HX = null, txBar = null; // E1 : un vrai historique ↶ ↷ (texte, zones, personnes, réglages de l'image, fiche de l'acte) ; K18 : la barre du bas
        const flushCommit = () => { if (commitT) { clearTimeout(commitT); commitT = 0; } HX?.commit(); };
        const touch = () => { dirty = true; status(i18n('modifié')); clearTimeout(commitT); commitT = setTimeout(() => { commitT = 0; HX?.commit(); }, 450); };
        // E4 : une image glissée (ou collée) sur l'acte entre dans les Médias et devient l'image de l'acte
        UI.bindFileDrop?.(stage, async files => {
            if (pagesLocked()) return;
            const f = files[0], fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'image'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', A().state.csrf);
            try { const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                if (t.data.zones.length && !await A().confirmBox(i18n('Elles étaient posées pour l’ancienne image.'), {title: i18n('Garder les zones déjà posées ?'), okLabel: i18n('Garder les zones'), cancelLabel: i18n('Les retirer'), danger: false})) { snap(); t.data.zones = []; }
                t.media_id = Number(j.result.media_id); t.filename = j.result.filename; touch(); await loadImage(); toast(i18n('L’image est dans les Médias et devient l’image de l’acte.'));
            } catch (e) { toast(`${f.name} : ${e.message}`, 'error'); }
        }, {accept: 'image/*'});
        /* ─── 📑 un document en plusieurs pages (heritage-transcribe-pages.js ; les pages : heritage-pages.js, lib/media_pages.php) :
         * les onglets des pages au-dessus de l'image ; réglage « Plusieurs pages » : un seul texte coupé par « — page 2 — » (conseillé :
         * le morceau n° i du texte est la page t.data.pages[i], chaque zone sait sa page, z.p) ou un texte par page (un acte par page). ─── */
        const PG = ext.txPages;
        let PAGES = [], pageIx = 0, pageForm = '', switching = false, readQ = null, perSet = null, perCombo = null, perWarnAt = 0;
        const curPid = () => Number(PAGES[pageIx]?.media_id || t.media_id);
        /** ⛔ le centre de ce rectangle (pixels de l'image affichée) est dans une zone « à ne pas lire » de cette page */
        const skipped = b => !!TXX()?.inSkip(t.data.zones.filter(z => z.kind === 'skip' && onHere(z)), b);
        const onHere = z => pageForm !== 'one' || Number(z.p || t.media_id) === curPid();
        const pz = () => (pageForm === 'one' ? {p: curPid()} : {});
        const pageZone = z => Object.assign(z, pz());
        const segIx = () => { const i = (t.data.pages || []).map(Number).indexOf(curPid()); return i < 0 ? 0 : i; };
        const pageName = (p, i) => (ext.mediaPages ? ext.mediaPages.labelOf(p, i) : i18n('Page {n}', {n: i + 1}));
        /** remplace [at, end) du texte par str ; les zones, personnes et repérages qui suivent se décalent */
        function spliceText(at, end, str) {
            const v = area.value, delta = str.length - (end - at);
            const fs = x => (x >= end ? x + delta : x > at ? at : x), fe = x => (x > end || (x === end && end > at) ? x + delta : x > at ? at : x);
            const sh = r => { r.s = fs(r.s); r.e = Math.max(r.s, fe(r.e)); };
            t.data.zones.forEach(sh); t.data.people.forEach(sh); found.forEach(sh); txFix.forEach(sh); [...hist.undo, ...hist.redo].forEach(list => list.forEach(sh));
            area.value = v.slice(0, at) + str + v.slice(end); before = area.value; t.body = area.value;
        }
        /** un texte lu (text = l'ancien texte + le nouveau, zones posées dessus) : à la fin du texte, ou à la fin de la page affichée (un seul texte) */
        function putRead(text, made) {
            if (pageForm !== 'one') { before = area.value = text; t.body = text; snap(); t.data.zones.push(...made); touch(); drawZones(); return; }
            const old = area.value, rest = text.slice(old.length), add = rest.replace(/^\n+/, ''), base = old.length + (rest.length - add.length);
            const sg = PG.segments(old)[segIx()] || {s: old.length, e: old.length}, at = sg.e, had = !!old.slice(sg.s, at).trim();
            const pre = had ? (old.slice(0, at).endsWith('\n') ? '\n' : '\n\n') : '', ins = pre + (at < old.length ? add.replace(/\n+$/, '') : add);
            spliceText(at, at, ins); snap();
            const k = at + pre.length - base; made.forEach(z => { z.s += k; z.e += k; z.p = curPid(); });
            t.data.zones.push(...made); touch(); drawZones();
            return {s: at + pre.length, e: at + ins.length};
        }
        /** remplacer le texte de la page affichée (un seul texte pour plusieurs pages) ou tout le texte ; ses zones de lecture partent avec lui */
        function replaceRead(str) {
            snap();
            const sg = pageForm === 'one' && PAGES.length > 1 ? PG.segments(area.value)[segIx()] : {s: 0, e: area.value.length};
            t.data.zones = t.data.zones.filter(z => !(z.src && onHere(z) && z.s < sg.e && z.e > sg.s));
            spliceText(sg.s, sg.e, str); return {s: sg.s, e: sg.s + str.length};
        }
        function appendRead(str) {
            const old = area.value, s0 = old.length + (old.trim() ? 2 : 0);
            if (pageForm !== 'one') { area.value += (old.trim() ? '\n\n' : '') + str; return {s: s0, e: area.value.length}; }
            return putRead(old + (old.trim() ? '\n\n' : '') + str, []);
        }
        function paintPages() {
            const bar = $('[data-tx-pages]'); if (!bar) return;
            const many = PAGES.length > 1; bar.hidden = !many; dlg.dataset.txPages = many ? pageForm : '';
            const sc = $('[data-tx-readscope]'); if (sc) sc.hidden = !many;
            if (!many) { bar.innerHTML = ''; return; }
            bar.innerHTML = PAGES.map((p, i) => `<button type="button" role="tab" class="h-tx-page${i === pageIx ? ' is-on' : ''}" data-tx-page="${i}" aria-selected="${i === pageIx}" title="${esc(p.title || p.filename)}"><b>${i + 1}</b> ${esc(pageName(p, i))}</button>`).join('')
                + `<span class="h-tx-pagesinfo">${esc(pageForm === 'one' ? i18n('Un seul texte, coupé par « — page 2 — »') : i18n('Un texte par page'))}</span><button type="button" class="icon-button small h-tx-pagesmore" data-tx-pagesmenu title="${esc(i18n('Pages du document'))}" aria-label="${esc(i18n('Pages du document'))}" aria-haspopup="menu">⋯</button>`;
        }
        /** les pages du document (et, pour un seul texte, le texte coupé en morceaux : un repère par page, les textes déjà écrits gardés) */
        async function initPages() {
            if (!PG || !ext.mediaPages || !t.media_id) return;
            let st; try { st = await ext.mediaPages.get(t.media_id, true); } catch (_) { return; }
            const set = (st?.pages || []).filter(p => p.filename);
            if (set.length < 2 || !set.some(p => Number(p.media_id) === Number(t.media_id))) { PAGES = []; pageForm = ''; paintPages(); return; }
            PAGES = set;
            const has = Array.isArray(t.data.pages) && t.data.pages.length > 1;
            pageForm = has ? 'one' : set.some(p => Number(p.media_id) !== Number(t.media_id) && (p.acts || []).length) ? 'per' : PG.mode();
            pageIx = Math.max(0, PAGES.findIndex(p => Number(p.media_id) === Number(ctx.page || t.media_id)));
            if (pageForm === 'one' && layoutText()) { dirty = true; status(i18n('modifié')); }
            if (pageForm === 'per') await loadPerSet();
            t.filename = PAGES[pageIx].filename; paintPages();
            const pv0 = t.data.pageViews?.[curPid()]; if (pageForm === 'one' && pv0 && typeof pv0 === 'object') { t.data.view = TV.viewOf(pv0); syncControls(); paintBadge(); } // 🎚 les réglages de cette page
        }
        function layoutText() {
            const ids = PAGES.map(p => Number(p.media_id)), byId = id => PAGES.find(p => Number(p.media_id) === id);
            let pages = Array.isArray(t.data.pages) && t.data.pages.length > 1 ? t.data.pages.map(Number) : null, changed = false;
            if (!pages) {
                if (!t.id && !area.value.trim()) { // un acte nouveau : chaque page avec le texte qu'elle avait déjà, dans l'ordre des pages
                    pages = ids.slice();
                    area.value = PAGES.map((p, i) => (i ? PG.markerText(i + 1) + '\n' : '') + String(Number(p.media_id) === Number(t.media_id) ? (ctx.text ?? p.transcription ?? '') : (p.transcription || '')).trim()).join('\n');
                    before = area.value; t.body = area.value; changed = true;
                } else pages = [Number(t.media_id)];
            }
            // une page sans acte à elle dont le texte n'est pas dans l'acte : gardé à la fin de son morceau (rien n'est perdu)
            pages.forEach((id, i) => { const p = byId(id); const tx = String(p?.transcription || '').trim(); if (!i || !p || (p.acts || []).length || !tx || area.value.includes(tx)) return;
                const sg = PG.segments(area.value)[i]; if (!sg) return; const had = !!area.value.slice(sg.s, sg.e).trim(); spliceText(sg.e, sg.e, (had ? '\n———\n' : '') + tx); changed = true; });
            // les pages reliées depuis : un repère de plus à la fin, avec le texte qu'elles avaient déjà
            ids.forEach(id => { if (pages.includes(id)) return; const v = area.value, tx = String(byId(id)?.transcription || '').trim();
                spliceText(v.length, v.length, (v.endsWith('\n') ? '' : '\n') + PG.markerText(ids.indexOf(id) + 1) + '\n' + tx); pages.push(id); changed = true; });
            // les repères suivent l'ordre des pages (« — page 3 — » après un glisser)
            const mk = PG.marks(area.value);
            for (let j = mk.length - 1; j >= 0; j--) { const n = ids.indexOf(Number(pages[j + 1])) + 1; if (n > 0 && mk[j].n !== n) { spliceText(mk[j].at, mk[j].end, PG.markerText(n)); changed = true; } }
            if (JSON.stringify(t.data.pages || []) !== JSON.stringify(pages)) { t.data.pages = pages; changed = true; }
            return changed;
        }
        async function goPage(i, {keepText = false, goto = null} = {}) {
            if (i < 0 || i >= PAGES.length || i === pageIx) return;
            if (pageForm === 'per') return switchAct(i, goto);
            // 🎚 chaque page garde ses réglages d'image (rotation, miroir, redressement, « Mieux voir ») : deux photos n'ont pas le même cadrage
            const pv = t.data.pageViews = (t.data.pageViews && typeof t.data.pageViews === 'object' && !Array.isArray(t.data.pageViews)) ? t.data.pageViews : {};
            pv[curPid()] = {...t.data.view};
            pageIx = i; t.filename = PAGES[i].filename; selZone = null; paintPages();
            t.data.view = TV.viewOf(pv[curPid()] || {...t.data.view, rot: 0, tilt: 0, mirror: false}); syncControls(); paintBadge();
            if (!keepText) { const sg = PG.segments(area.value)[segIx()]; if (sg) { area.setSelectionRange(sg.s, sg.s); const lineH = parseFloat(getComputedStyle(area).lineHeight) || 20; area.scrollTop = Math.max(0, (area.value.slice(0, sg.s).split('\n').length - 2) * lineH); mirror.scrollTop = area.scrollTop; } }
            await loadImage();
        }
        /** un texte par page : les actes des autres pages du même ensemble (pour « Ce que l'app a trouvé » sur tout le document) */
        async function loadPerSet() {
            perSet = await Promise.all(PAGES.map(async (p, i) => { if (i === pageIx) return null; const id = Number((p.acts || [])[0] || 0);
                if (id) { try { const r = await api('act_transcription', {id}); return {id, body: String(r.body || '')}; } catch (_) {} }
                return {id: 0, body: String(p.transcription || '')}; }));
        }
        /** le texte de toutes les pages (celle-ci telle qu'elle est écrite), coupé par « — page N — » : {text, starts} */
        function makeCombo() {
            if (pageForm !== 'per' || PAGES.length < 2 || !perSet) return null;
            let text = ''; const starts = [];
            PAGES.forEach((p, i) => { if (i) text += '\n' + PG.markerText(i + 1) + '\n'; starts.push(text.length); text += i === pageIx ? area.value : (perSet[i]?.body || ''); });
            return {text, starts};
        }
        /** « (page 3, ligne 7) » d'une position du texte de toutes les pages (un texte par page) : la page, son acte, la position dans son texte */
        const perRef = pos => { const c = perCombo; if (!c || !(pos >= 0)) return null; const li = PG.lineOf(c.text, pos), i = li.seg; if (!PAGES[i]) return null;
            return {n: i + 1, code: PAGES[i].label || 'page', name: pageName(PAGES[i], i), line: li.line, text: i18n('(page {n}, ligne {line})', {n: i + 1, line: li.line}),
                mediaId: Number(PAGES[i].media_id), actId: i === pageIx ? t.id : (perSet?.[i]?.id || 0), seg: i, at: pos - c.starts[i]}; };
        /** un texte par page : chaque page a son acte ; changer de page enregistre celui-ci et ouvre celui de la page */
        async function switchAct(i, goto = null) {
            const p = PAGES[i]; if (!p) return;
            if (dirty) { await save(); if (dirty) return; }
            switching = true; teardown();
            const next = (p.acts || []).length ? {id: Number(p.acts[0])} : {mediaId: Number(p.media_id), filename: p.filename, title: '', text: p.transcription || ''};
            return open({...next, page: Number(p.media_id), goto, onClose: ctx.onClose, onSaved: ctx.onSaved});
        }
        /** un clic (ou les flèches) dans le texte d'une autre page : son image s'affiche */
        function followCaret() {
            if (pageForm !== 'one' || PAGES.length < 2) return;
            const id = Number((t.data.pages || [])[PG.segAt(area.value, area.selectionStart)] || 0), i = PAGES.findIndex(p => Number(p.media_id) === id);
            if (i >= 0 && i !== pageIx) goPage(i, {keepText: true});
        }
        /** « (page 3, ligne 7) » d'une position du texte (un seul texte sur plusieurs pages) ; null sinon */
        const pageRef = pos => { if (pageForm !== 'one' || PAGES.length < 2 || !(pos >= 0)) return null; const li = PG.lineOf(area.value, pos), id = Number((t.data.pages || [])[li.seg] || 0), i = PAGES.findIndex(p => Number(p.media_id) === id); if (i < 0) return null;
            return {n: i + 1, code: PAGES[i].label || 'page', name: pageName(PAGES[i], i), line: li.line, text: i18n('(page {n}, ligne {line})', {n: i + 1, line: li.line})}; };
        const blankMarks = v => (PG ? v.replace(/^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/gmu, m => ' '.repeat(m.length)) : v);
        const findText = () => blankMarks(area.value);
        const readAllAny = () => PAGES.length > 1 && !!$('[data-tx-readscope] input:is([value="all"], [value="empty"]):checked');
        // 📑 les pages à lire : toutes, ou seulement celles sans texte (« Seulement les pages pas encore lues »)
        const pagesToRead = () => PAGES.map((_, i) => i).filter(i => !$('[data-tx-readscope] input[value="empty"]')?.checked || !pageLines(i));
        const readAllOn = () => pageForm === 'one' && readAllAny();
        const perOnly = () => { if (pageForm === 'per' && readAllAny()) toast(i18n('Un texte par page : la lecture rapide et la lecture d’un imprimé se font page par page ; la lecture approfondie peut lire toutes les pages.')); };
        function readAll(kind) { const left = pagesToRead(); if (!left.length) return toast(i18n('Toutes les pages ont déjà du texte.')); readQ = {kind, left}; readNext(true); }
        async function readNext(ok) {
            if (!readQ) return; if (!ok || !dlg.isConnected) { readQ = null; return; }
            const i = readQ.left.shift(); if (i == null) { readQ = null; status(i18n('Toutes les pages sont lues (à relire)')); return; }
            await goPage(i);
            if (readQ.kind === 'ocr') { await runOcr(); readNext(true); } else runHtr();
        }
        async function addPages() {
            const P = window.LCNDA_MEDIA_PICKER; if (!P?.openMediaPicker || !ext.mediaPages) return toast(i18n('La fenêtre des images n’est pas chargée.'), 'error');
            const st = await ext.mediaPages.get(t.media_id, true), list = st.pages.length ? st.pages.map(x => ({media_id: Number(x.media_id), label: x.label})) : [{media_id: Number(t.media_id), label: 'page'}];
            const picked = await P.openMediaPicker({types: ['image'], multiple: true, title: `📑 ${i18n('Relier une autre page…')}`, eyebrow: i18n('PAGES DU DOCUMENT'), okLabel: i18n('Relier ces pages')});
            const add = (picked || []).map(m => Number(m.id)).filter(id => id > 0 && !list.some(x => x.media_id === id)); if (!add.length) return;
            try { await ext.mediaPages.save(t.media_id, [...list, ...add.map(id => ({media_id: id, label: 'page'}))], {label: i18n('Page reliée'), before: list}); } catch (e) { return toast(e.message, 'error'); }
            await initPages(); drawZones();
        }
        function pagesMenu(at) {
            const m = PG.mode(), set = v => { PG.setMode(v); if (pageForm && pageForm !== v) toast(i18n('Réglage gardé : il vaut pour les documents pas encore commencés ; celui-ci garde sa forme.')); };
            UI.menuAt?.(at, [
                {icon: m === 'one' ? '✓' : '', label: i18n('Un seul texte, coupé par « — page 2 — » (conseillé)'), run: () => set('one')},
                {icon: m === 'per' ? '✓' : '', label: i18n('Un texte par page'), run: () => set('per')},
                '-', {icon: '＋', label: i18n('Relier une autre page…'), run: () => addPages()},
            ], {title: i18n('Plusieurs pages')});
        }
        dlg.addEventListener('click', e => {
            const pb = e.target.closest('[data-tx-page]'); if (pb) { goPage(Number(pb.dataset.txPage)); return; }
            const pm = e.target.closest('[data-tx-pagesmenu]'); if (pm) pagesMenu(pm);
        });
        $('[data-tx-pages]')?.addEventListener('contextmenu', e => { e.preventDefault(); pagesMenu({x: e.clientX, y: e.clientY}); });
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
            const tr = mstr(M); img.setAttribute('transform', tr); $('[data-tx-zones]').setAttribute('transform', tr); $('[data-tx-words]').setAttribute('transform', tr); $('[data-tx-draw]').setAttribute('transform', tr);
            if (before) { const [ax, ay] = rotPt(cx, cy); panX += (before[0] - ax) * zoom; panY += (before[1] - ay) * zoom; } // le centre de l'image ne bouge pas à l'écran
        }
        const rotWH = () => WH;
        const FIT = {page: i18n('Toute l’image'), width: i18n('Largeur'), real: '100 %'}, FIT_NEXT = {page: 'width', width: 'real', real: 'page'};
        const FIT_HELP = {page: i18n('Toute l’image'), width: i18n('Largeur (l’image prend toute la largeur, le mieux pour lire)'), real: i18n('Taille réelle (100 %)')};
        const fitZoom = mode => { const r = stage.getBoundingClientRect(), [w, h] = rotWH(); return mode === 'real' ? 1 : clamp(mode === 'width' ? (r.width - 20) / w : Math.min((r.width - 20) / w, (r.height - 20) / h), .02, 20); };
        function paintZoomLabel() {
            const b = $('[data-tx-zoomlab]'); if (!b) return;
            const on = fitOn && !!imgW, now = on ? FIT[fitMode] : `${Math.round(zoom * 100)} %`, next = FIT_NEXT[on ? fitMode : 'real'];
            $('[data-tx-zoomtxt]').textContent = now; b.dataset.fit = on ? fitMode : '';
            b.title = i18n('Zoom : {now}. Clic : {next} (puis {then}, {last})', {now: on ? FIT_HELP[fitMode] : now, next: FIT_HELP[next], then: FIT_HELP[FIT_NEXT[next]], last: FIT_HELP[FIT_NEXT[FIT_NEXT[next]]]});
        }
        const applyView = () => { world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`); paintOverlay(); paintZoomLabel(); txBar?.sync(); paintWords(); };
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
                    const wasReady = enhFor === t.filename && enh.hasSource(); if (!wasReady) status(i18n('Préparation de l’image…'));
                    const ready = await ensureSource(); if (!wasReady) status('');
                    if (!dlg.isConnected) return; // l'outil a été fermé pendant la préparation
                    if (ready) { enh.render(t.data.view, {preview}); paintBadge(); return; }
                    if (srcFailed !== t.filename) { srcFailed = t.filename; toast(i18n('« Mieux voir » : cette image n’a pas pu être préparée (trop grande ou abîmée) ; seuls contraste, luminosité, négatif et gris s’appliquent.'), 'error'); }
                } else if (!enh.ok && !applyImage.warned) { applyImage.warned = true; toast(i18n('Ce navigateur ne sait pas calculer ces réglages : seuls contraste, luminosité, négatif et gris s’appliquent.'), 'error'); }
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
            dlg.querySelectorAll('[data-tx-recipe]').forEach(b => { const on = TV.recipeOn(v, b.dataset.txRecipe); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            paintBadge();
        }
        function paintBadge() { const b = $('[data-tx-badge]'); if (!b) return; const n = TV.changedCount(t.data.view, TV.panelKeys(TV.barCfg(), narrow)); b.hidden = !n; b.textContent = String(n); b.title = n ? i18n(n > 1 ? '{n} réglages actifs dans « Mieux voir »' : '{n} réglage actif dans « Mieux voir »', {n}) : ''; }
        async function loadImage() {
            const has = !!t.filename; $('[data-tx-empty]').hidden = has; img.style.display = has ? '' : 'none'; if (!has) return;
            const src = origSrc();
            imgW = imgH = 0; srcEl = null; enhFor = ''; // une autre image : rien de l'ancienne ne reste (taille, préparation « Mieux voir »)
            await new Promise(res => { const i = new Image(); i.onload = () => { imgW = i.naturalWidth; imgH = i.naturalHeight; srcEl = i; res(); }; i.onerror = () => { toast(i18n('Image de l’acte illisible.'), 'error'); res(); }; i.src = src; });
            if (!dlg.isConnected) return;
            if (A().mediaLimits?.tooBig(imgW, imgH)) srcFailed = t.filename; // 📎 image immense : affichée, mais « Mieux voir » ne la décode pas (app-media-limits.js)
            img.setAttribute('width', imgW); img.setAttribute('height', imgH); geom({keepCenter: false}); setHref(src); applyFit('page'); await applyImage(); drawZones();
        }
        /* ─── les zones et le texte surligné ─── */
        const colorOf = (z, i) => z.c || COLORS[i % COLORS.length];
        function paintZoneRects() {
            const g = $('[data-tx-zones]'), sw = 2 / zoom;
            g.innerHTML = t.data.zones.map((z, i) => !onHere(z) ? '' : `<rect data-tx-zone="${esc(z.id)}"${selZone === z.id || z.kind ? ` class="${selZone === z.id ? 'is-sel' : ''}${z.kind ? ` is-k-${esc(z.kind)}` : ''}"` : ''}${z.kind === 'skip' ? ` stroke-dasharray="${6 / zoom} ${4 / zoom}"` : ''} x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${z.kind === 'skip' ? '#6b7280' : colorOf(z, i)}" fill-opacity="${(selZone === z.id ? .38 : .2) * zop()}" stroke="${colorOf(z, i)}" stroke-opacity="${selZone === z.id ? 1 : Math.max(.08, zop())}" stroke-width="${selZone === z.id ? sw * 2 : sw}"><title>${z.kind ? `${esc(XK(z.kind))} — ` : ''}${esc(t.body.slice(z.s, z.e).slice(0, 120) || z.note || i18n('Zone non reliée'))}${selZone === z.id ? ` ${i18n('— glisse pour la déplacer, tire une poignée pour la redimensionner (flèches, Maj + flèches)')}` : ''}</title></rect>`).join('');
            paintHandles();
        }
        function drawZones() { paintZoneRects(); paintMirror(); paintZoneBar(); paintTxBar(); paintWords(); }
        /* 🔦 les mots choisis dans le texte : un cadre serré dans la bande de leur ligne (≈ estimé, ou exact si la lecture a donné la place des mots) */
        function paintWords() {
            const g = $('[data-tx-words]'); if (!g) return; const C = ext.txCtx, s = area.selectionStart, e = area.selectionEnd;
            const boxes = C && imgW && e > s && area.value.slice(s, e).trim() ? C.wordBoxes(area.value, t.data.zones.filter(onHere), s, e) : [];
            dlg.dataset.txWords = String(boxes.length);
            if (!boxes.length) { if (g.firstChild) g.innerHTML = ''; return; }
            const col = C.wordColor(), sw = 2.5 / zoom, fs = 12 / zoom, cut = x => (x.length > 32 ? x.slice(0, 31) + '…' : x);
            g.innerHTML = boxes.map((b, i) => `<rect class="h-tx-wbox" data-tx-wbox="${b.exact ? 'exact' : 'est'}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${3 / zoom}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="${sw}"><title>${esc(b.exact ? i18n('Place donnée par la lecture') : i18n('≈ place estimée d’après la position des mots dans la ligne'))}</title></rect>${i ? '' : `<text class="h-tx-wlab" x="${b.x}" y="${b.y - 5 / zoom}" font-size="${fs}" fill="${col}">${b.exact ? '' : '≈ '}« ${esc(cut(boxes.map(q => q.label).join(' ')))} »</text>`}`).join('');
        }
        // 🔦 selectionchange : un choix au clavier ou à la souris relâchée hors de la case (sans mouseup sur elle) ; un rAF à la fois
        let wordsRaf = 0; ['select', 'selectionchange', 'mouseup', 'keyup', 'input', 'focus'].forEach(ev => area.addEventListener(ev, () => { if (!wordsRaf) wordsRaf = requestAnimationFrame(() => { wordsRaf = 0; paintWords(); }); }));
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-tx-wcol]'); if (!b || !ext.txCtx) return; ext.txCtx.setWordColor(b.dataset.txWcol);
            dlg.querySelectorAll('[data-tx-wcol]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); }); paintWords(); });
        dlg.addEventListener('input', e => { if (!e.target.matches?.('[data-tx-zop]')) return; try { localStorage.setItem(ZOP_KEY, String(Math.round(Number(e.target.value) || 0))); } catch (_) {} paintZoneRects(); });
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
            if (!g.firstChild) g.innerHTML = '<polygon class="h-tx-sel-frame"/>' + HANDLES.map(([k]) => `<rect class="h-tx-handle" data-tx-h="${k}"><title>${i18n('Tirer pour redimensionner')}</title></rect>`).join('');
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
        /* 🪄 les corrections proposées sur le texte de l'Atelier : soulignées dans le miroir, un clic dans le texte → le menu */
        let txFix = [], txFixOn = false, txFixT = 0; const txFixUndo = [], txKept = new Set();
        /* ce qu'on dessine dans le texte, par-dessus les couleurs des lignes : 🔍 les résultats de la recherche, 🪄 les corrections proposées,
         * les abréviations connues (soulignées en pointillé) ; un mot coupé par le bord d'une zone : marqué des deux côtés */
        let findHits = [], findCur = -1, abbrevs = [], hintW = [];
        const decos = () => [...hintW.map((f, i) => ({s: f.s, e: f.e, o: `<span class="h-tx-hintw" data-hw="${i}">`, c: '</span>', w: 3})),...findHits.map((f, i) => ({s: f.s, e: f.e, o: `<span class="h-tx-hit${i === findCur ? ' is-cur' : ''}">`, c: '</span>', w: 0})),
            ...txFix.map(f => ({s: f.s, e: f.e, o: `<u class="h-tx-fix${f.sure ? ' is-sure' : ''}">`, c: '</u>', w: 1})),
            ...abbrevs.map((f, i) => ({s: f.s, e: f.e, o: `<span class="h-tx-ab${f.amount ? ' is-amount' : ''}" data-ab="${i}">`, c: '</span>', w: 2}))].sort((x, y) => x.s - y.s || x.w - y.w);
        let curDecos = [];
        const fixSeg = (text, a, b) => { let h = '', q = a; curDecos.filter(f => f.e > a && f.s < b).forEach(f => { const s0 = Math.max(a, f.s), e0 = Math.min(b, f.e); if (s0 < q) return; h += esc(text.slice(q, s0)) + f.o + esc(text.slice(s0, e0)) + f.c; q = e0; }); return h + esc(text.slice(q, b)); };
        async function runFix({quiet = false} = {}) {
            if (!window.LCNDA_HTRFIX) { if (!quiet) toast(i18n('Les corrections proposées ne sont pas chargées.'), 'error'); return; }
            const lex = await fixLexicon($('[data-tx-lang]').value, $('[data-tx="place"]').value); if (!lex || !dlg.isConnected) return;
            txFix = window.LCNDA_HTRFIX.propose(area.value, lex, {level: fixLevel(), keep: txKept}); txFixOn = true;
            // 📑 un texte par page : les corrections des autres pages (leurs actes), comptées pour la barre
            perFix = pageForm === 'per' && PAGES.length > 1 ? PAGES.map((_, i) => (i === pageIx ? txFix.length : window.LCNDA_HTRFIX.propose(String(perSet?.[i]?.body || ''), lex, {level: fixLevel()}).length)) : null;
            paintMirror(); paintTxFix();
            if (!quiet) status(txFix.length ? (A().plural ? A().plural(txFix.length, 'correction proposée', 'corrections proposées') : String(txFix.length)) : i18n('Aucune correction à proposer'));
        }
        // 📑 un seul texte pour plusieurs pages : combien de corrections sur chaque page (un clic montre la page)
        let perFix = null;
        function fixByPage() {
            if (pageForm === 'per' && perFix && PAGES.length > 1) return perFix.some(n => n) ? `<span class="h-tx-fixpages">${perFix.map((n, i) => (n ? `<button type="button" class="button small ${i === pageIx ? '' : 'secondary'}" data-txfix-page="${i}">${esc(pageName(PAGES[i], i))} : ${n}</button>` : '')).join('')}</span>` : '';
            if (pageForm !== 'one' || PAGES.length < 2 || !txFix.length) return '';
            const per = new Map(); txFix.forEach(f => { const id = Number((t.data.pages || [])[PG.segAt(area.value, f.s)] || 0), i = PAGES.findIndex(p => Number(p.media_id) === id); if (i >= 0) per.set(i, (per.get(i) || 0) + 1); });
            return `<span class="h-tx-fixpages">${[...per].sort((x, y) => x[0] - y[0]).map(([i, n]) => `<button type="button" class="button small secondary" data-txfix-page="${i}">${esc(pageName(PAGES[i], i))} : ${n}</button>`).join('')}</span>`;
        }
        function paintTxFix() {
            const bar = $('[data-tx-fixbar]'); if (!bar) return; bar.hidden = !txFixOn; if (!txFixOn) return;
            const sure = txFix.filter(f => f.sure).length;
            bar.innerHTML = `<span>🪄 ${txFix.length ? esc(A().plural ? A().plural(txFix.length, 'correction proposée', 'corrections proposées') : txFix.length) + ` <small class="muted">${esc(i18n('(soulignées en violet : clique un mot)'))}</small>` : esc(i18n('Aucune correction à proposer'))}</span>${fixByPage()}
                ${sure ? `<button type="button" class="button small" data-txfix="accept">✓ ${esc(sure > 1 ? i18n('Accepter les {n} propositions sûres', {n: sure}) : i18n('Accepter la proposition sûre'))}</button>` : ''}
                <button type="button" class="button small secondary" data-txfix="undo" ${txFixUndo.length ? '' : 'disabled'}>↶ ${esc(i18n('Annuler'))}</button><span class="spacer"></span>${fixSettingsHtml()}
                <button type="button" class="icon-button small" data-txfix="close" title="${esc(i18n('Fermer'))}">×</button>`;
            bindFixSettings(bar, () => runFix({quiet: true}));
        }
        /** remplacer le texte (une ou plusieurs corrections), avec ↶ Annuler */
        function setTxText(next, label) {
            const old = area.value; if (next === old) return;
            area.value = next; area.dispatchEvent(new Event('input')); txFixUndo.push(old);
            const back = () => { const k = txFixUndo.lastIndexOf(old); if (k >= 0) txFixUndo.splice(k, 1); area.value = old; area.dispatchEvent(new Event('input')); runFix({quiet: true}); };
            runFix({quiet: true}); A().undoToast?.(label, {undo: back});
        }
        $('[data-tx-fixbar]')?.addEventListener('click', e => {
            const pg = e.target.closest('[data-txfix-page]'); if (pg) { const i = Number(pg.dataset.txfixPage); if (pageForm === 'per') { if (i !== pageIx) { fixAfterSwitch = true; goPage(i).finally(() => { fixAfterSwitch = false; }); } return; } goPage(i); return; }
            const b = e.target.closest('[data-txfix]'); if (!b) return; const k = b.dataset.txfix;
            if (k === 'close') { txFixOn = false; txFix = []; paintMirror(); paintTxFix(); return; }
            if (k === 'undo') { const old = txFixUndo.pop(); if (old != null) { area.value = old; area.dispatchEvent(new Event('input')); runFix({quiet: true}); } return; }
            if (k === 'accept') { const sure = txFix.filter(f => f.sure); if (sure.length) versionBefore('Avant « Accepter les propositions sûres »'); if (sure.length) setTxText(window.LCNDA_HTRFIX.applySure(area.value, sure), A().plural ? A().plural(sure.length, 'proposition sûre acceptée', 'propositions sûres acceptées') : String(sure.length)); }
        });
        area.addEventListener('click', e => {
            if (!txFix.length || area.selectionStart !== area.selectionEnd) return;
            const c = area.selectionStart, fx = txFix.find(f => c >= f.s && c <= f.e); if (!fx) return;
            fixMenu({x: e.clientX, y: e.clientY}, fx, {apply: v => setTxText(window.LCNDA_HTRFIX.applyFix(area.value, fx, v), `« ${fx.word} » → « ${v} »`),
                keep: () => { txFix = txFix.filter(f => f !== fx); txKept.add(fx.word); paintMirror(); paintTxFix(); A().undoToast?.(i18n('« {w} » gardé tel quel', {w: fx.word}), {undo: () => { txKept.delete(fx.word); txFix.push(fx); txFix.sort((x, y) => x.s - y.s); paintMirror(); paintTxFix(); }}); },
                addLex: () => addToLexicon(fx.word, () => runFix({quiet: true}))});
        });
        function paintMirror() {
            const text = area.value, marks = []; abbrevs = TV.abbrevOn?.() && window.LCNDA_AIDE_LECTURE?.abbrevs ? window.LCNDA_AIDE_LECTURE.abbrevs(text, aideLang($('[data-tx-lang]')?.value || '')) : [];
            // 💰📏 les sommes et les mesures anciennes (app-montants-core.js) : soulignées comme les abréviations, leur valeur au survol
            if (TV.amountsOn?.() && window.LCNDA_MONTANTS) { const am = window.LCNDA_MONTANTS.scan(text).filter(h => !abbrevs.some(a => h.s < a.e && h.e > a.s)); abbrevs = [...abbrevs, ...am.map(h => ({s: h.s, e: h.e, word: h.raw, amount: h}))].sort((x, y) => x.s - y.s); }
            hintW = Number(t.data.hinted) > 0 && ext.txCtx?.doubtWords ? ext.txCtx.doubtWords(text) : []; // 🧠 les mots [?] d'une lecture faite avec des indices
            curDecos = decos();
            t.data.zones.forEach((z, i) => { if (z.e > z.s) marks.push({s: z.s, e: z.e, c: colorOf(z, i), on: selZone === z.id}); });
            found.forEach(f => marks.push({s: f.s, e: f.e, cls: `is-${f.type}`}));
            marks.sort((a, b) => a.s - b.s); let h = '', pos = 0;
            marks.forEach(m => { if (m.s < pos) return; h += fixSeg(text, pos, m.s); h += `<mark class="${m.cls || (m.c ? 'h-tx-zm' : '')}${m.on ? ' is-on' : ''}" ${m.c ? `style="--zc:${m.c}"` : ''}>${fixSeg(text, m.s, m.e)}</mark>`; pos = m.e; });
            h += fixSeg(text, pos, text.length);
            if (TV.lineNos()) { let n = 1; h = `<span class="h-tx-ln" data-n="1"></span>${h.replace(/\n/g, () => `\n<span class="h-tx-ln" data-n="${++n}"></span>`)}`; } // le numéro au début de chaque ligne, dans la marge
            mirror.innerHTML = h + '\n';
            mirror.scrollTop = area.scrollTop; flowSoon();
        }
        function paintZoneBar() {
            const bar = $('[data-tx-zonebar]'), z = t.data.zones.find(q => q.id === selZone); bar.hidden = !z; if (!z) return;
            const linked = z.e > z.s;
            bar.innerHTML = `<b>Zone</b> ${linked ? `« ${esc(t.body.slice(z.s, z.e).slice(0, 60))}${z.e - z.s > 60 ? '…' : ''} »` : `<span class="muted">${i18n('pas encore reliée au texte')}</span>`}
                <button type="button" class="button small secondary" data-tx-zlink title="${esc(i18n('Relier cette zone au passage choisi dans le texte'))}">🔗 ${i18n('Au passage choisi')}</button><select data-tx-zkind title="${esc(i18n('Ce qu’est cette zone : « ⛔ À ne pas lire » est sautée par la lecture automatique et les exports ; les autres donnent l’ordre de lecture et la sorte de bloc (ALTO, PAGE)'))}">${(TXX()?.KINDS || []).map(([v, ic, l]) => `<option value="${v}"${(z.kind || '') === v ? ' selected' : ''}>${ic} ${esc(i18n(l))}</option>`).join('')}</select><input data-tx-znote placeholder="${esc(i18n('Note (mot illisible, signature…)'))}" value="${esc(z.note || '')}" maxlength="300"><input type="color" data-tx-zcolor value="${esc(z.c || COLORS[t.data.zones.indexOf(z) % COLORS.length])}" title="${esc(i18n('Couleur'))}"><button type="button" class="button small secondary" data-tx-cmd="htrzone" title="${esc(i18n('Lire l’écriture à la main dans cette zone seulement'))}">✨ ${i18n('Lire cette zone')}</button>${z.kind === 'sign' && ext.openSeals ? `<button type="button" class="button small secondary" data-tx-zsign title="${esc(i18n('Ouvrir cette signature dans « Signatures et sceaux » : le papier s’efface, l’encre devient un tracé net'))}">✍️ ${i18n('Détourer la signature')}</button>` : ''}<button type="button" class="button small danger" data-tx-zdel title="${esc(i18n('Supprimer la zone (Suppr) — « ↶ Annuler » la remet'))}">🗑</button>
                <small class="muted h-tx-zkeys" title="${esc(i18n('Glisse la zone pour la déplacer, tire une des 8 poignées pour changer sa taille'))}">↔ ${i18n('glisser · poignées · flèches · Maj + flèches · ⌘Z')}</small>`;
        }
        /* ─── ⌘Z / ⇧⌘Z pour les zones (le texte garde l'annulation de la case) ─── */
        const hist = {undo: [], redo: []}, cloneZones = () => t.data.zones.map(z => ({...z}));
        /** à appeler juste AVANT de changer les zones */
        const snap = () => flushCommit(); // l'état d'avant est gardé dans l'historique
        function undoZones(redo = false) {
            flushCommit(); const ok = HX ? (redo ? HX.redo() : HX.undo()) : false;
            status(ok ? (redo ? `↷ ${i18n('Rétabli')}` : `↶ ${i18n('Annulé')}`) : (redo ? i18n('Rien à rétablir') : i18n('Rien à annuler'))); return ok;
        }
        /** H7 : la zone part tout de suite, « ↶ Annuler » la remet à sa place (liée au même passage) */
        function deleteZone(id = selZone) {
            const i = t.data.zones.findIndex(q => q.id === id); if (i < 0) return; const gone = {...t.data.zones[i]};
            snap(); t.data.zones.splice(i, 1); if (selZone === id) selZone = null; touch(); drawZones();
            const put = () => { if (!t.data.zones.some(q => q.id === gone.id)) { snap(); t.data.zones.splice(Math.min(i, t.data.zones.length), 0, {...gone}); selZone = gone.id; touch(); drawZones(); } };
            const del = () => { if (t.data.zones.some(q => q.id === gone.id)) { snap(); t.data.zones = t.data.zones.filter(q => q.id !== gone.id); if (selZone === gone.id) selZone = null; touch(); drawZones(); } };
            (A().undoToast || toast)(i18n('Zone supprimée'), {undo: put, redo: del});
        }
        /** garder les liens quand on écrit : les passages après la modification se décalent */
        let before = area.value;
        area.addEventListener('input', () => {
            const now = area.value, dd = diffOf(before, now), {p, q, oldEnd, delta} = dd;
            const shift = r => { const f = v => v >= oldEnd ? v + delta : v > p ? Math.max(p, Math.min(v, p + (now.length - q - p))) : v; r.s = f(r.s); r.e = Math.max(r.s, f(r.e)); };
            followEdit(before, now, t.data.zones, dd); t.data.people.forEach(shift); // 🧲 les zones de ligne restent sur toute leur ligne found.forEach(shift); [...hist.undo, ...hist.redo].forEach(list => list.forEach(shift));
            txFix.forEach(shift); txFix = txFix.filter(f => now.slice(f.s, f.e) === f.word); if (txFixOn) { clearTimeout(txFixT); txFixT = setTimeout(() => runFix({quiet: true}), 900); }
            before = now; t.body = now; touch(); if (!findBar.hidden) findRun({keep: true}); paintMirror(); paintPeople();
        });
        area.addEventListener('scroll', () => { mirror.scrollTop = area.scrollTop; });
        area.addEventListener('click', () => followCaret()); area.addEventListener('keyup', e => { if (/^(Arrow|Page|Home|End)/.test(e.key)) followCaret(); });
        // un clic dans le texte : la zone qui contient cet endroit s'allume
        area.addEventListener('click', () => { const c = area.selectionStart, z = t.data.zones.find(q => q.e > q.s && c >= q.s && c <= q.e); if (z && z.id !== selZone) { selZone = z.id; drawZones(); reveal(z); } });
        const reveal = z => { if (!onHere(z)) { const i = PAGES.findIndex(p => Number(p.media_id) === Number(z.p || t.media_id)); if (i >= 0) { goPage(i, {keepText: true}).then(() => { if (onHere(z)) { drawZones(); revealNow(z); } }); return; } } revealNow(z); };
        const revealNow = z => { const r = stage.getBoundingClientRect(); const cx = z.x + z.w / 2, cy = z.y + z.h / 2; const [X, Y] = rotPt(cx, cy); if (X * zoom + panX < 0 || X * zoom + panX > r.width || Y * zoom + panY < 0 || Y * zoom + panY > r.height) { panX = r.width / 2 - X * zoom; panY = r.height / 2 - Y * zoom; applyView(); } };
        const gotoRange = (s, en) => { if (phone()) showPtab('text', false); selectText({s, e: en}); const z = t.data.zones.find(q => q.s < en && s < q.e); if (z) { selZone = z.id; drawZones(); reveal(z); } else followCaret(); };
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
        /** le curseur au début du mot, dans le texte (le mot montré dans la barre d'état) */
        const caretTo = w => { if (phone()) showPtab('text', false); area.focus({preventScroll: true}); area.setSelectionRange(w.s, w.s); const lineH = parseFloat(getComputedStyle(area).lineHeight) || 20, lines = area.value.slice(0, w.s).split('\n').length;
            if ((lines - 1) * lineH < area.scrollTop || (lines + 1) * lineH > area.scrollTop + area.clientHeight) { area.scrollTop = Math.max(0, (lines - 3) * lineH); mirror.scrollTop = area.scrollTop; }
            dlg.dataset.txCaret = String(w.s); status(i18n('Curseur sur « {w} »', {w: w.word})); };
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
            if (mainBtn && zr && ((tool === 'zone' && zr.dataset.txZone === selZone) || e.altKey)) { // ▭ : glisser la zone choisie la déplace ; ✋ : Alt + glisser (un glisser simple déplace l'image)
                const z = pickZone(zr.dataset.txZone); if (z) { drag = {edit: 'move', z, orig: {x: z.x, y: z.y, w: z.w, h: z.h}, R0: {x: z.x, y: z.y, w: z.w, h: z.h}, p0: toImg(e), c0: [e.clientX, e.clientY], before: cloneZones(), moved: false}; e.preventDefault(); return; }
            }
            if (tool === 'zone' && mainBtn) { const [x, y] = toImg(e); drag = {zone: true, x0: x, y0: y, x1: x, y1: y}; return; }
            drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY, pick: mainBtn && zr ? zr.dataset.txZone : null}; // ✋ sur une zone : un clic la choisit, glisser déplace l'image
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
            if (d.pan) { if (e.type === 'pointercancel' || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 5) return;
                // un clic sur un mot de la ligne déjà choisie (ou à côté d'une ligne) : le curseur va sur ce mot dans le texte ; sinon le clic choisit la ligne, comme avant
                const w = (!d.pick || d.pick === selZone) && ext.txCtx?.wordAt ? ext.txCtx.wordAt(area.value, t.data.zones.filter(onHere), ...toImg(e)) : null;
                if (w) { if (w.zone !== selZone) { selZone = w.zone; drawZones(); } caretTo(w); return; }
                if (d.pick) pickZone(d.pick); return; }
            if (d.edit) { if (d.moved && e.type !== 'pointercancel') { hist.undo.push(d.before); hist.redo = []; touch(); drawZones(); status(d.edit === 'move' ? i18n('Zone déplacée (⌘Z pour annuler)') : i18n('Zone redimensionnée (⌘Z pour annuler)')); } else if (d.moved) { Object.assign(d.z, d.orig); drawZones(); } return; }
            if (!d.zone || e.type === 'pointercancel') return;
            const x = clamp(Math.min(d.x0, d.x1), 0, imgW), y = clamp(Math.min(d.y0, d.y1), 0, imgH), w = Math.min(imgW - x, Math.abs(d.x1 - d.x0)), h = Math.min(imgH - y, Math.abs(d.y1 - d.y0));
            if (w < 4 || h < 4) return;
            const s = area.selectionStart, e2 = area.selectionEnd, z = {id: zid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), s: e2 > s ? s : 0, e: e2 > s ? e2 : 0, note: '', c: ''};
            snap(); t.data.zones.push(pageZone(z)); selZone = z.id; touch(); drawZones(); stage.focus({preventScroll: true});
            status(e2 > s ? i18n('Zone reliée au passage choisi') : i18n('Zone posée : choisis son passage dans le texte, puis « 🔗 Au passage choisi »'));
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
        const TOOL_HELP = {pan: i18n('Glisse pour déplacer l’image (ou barre d’espace) · molette : zoomer · clic sur une zone : la choisir'), zone: i18n('Choisis un passage dans le texte, puis dessine son rectangle sur l’image : les deux restent liés')};
        // 📑 plusieurs pages (un seul texte) : les zones de la page affichée, et le total du document
        function zoneCount() {
            const pl = n => (A().plural ? A().plural(n, 'zone') : n + ' zones'), all = t.data.zones.length, here = t.data.zones.filter(onHere).length;
            return PAGES.length > 1 && here !== all ? i18n('{zones} sur cette page ({n} en tout)', {zones: pl(here), n: all}) : pl(all);
        }
        function paintTxBar() { if (!txBar) return; txBar.setHelp(TOOL_HELP[tool] || ''); txBar.setWhere(imgW ? `${imgW} × ${imgH} px · ${zoneCount()}` : i18n('Pas encore d’image')); txBar.sync(); }
        const setTool = k => { tool = k; dlg.querySelectorAll('[data-tx-tool]').forEach(b => { b.classList.toggle('is-active', b.dataset.txTool === k); b.setAttribute('aria-pressed', String(b.dataset.txTool === k)); }); stage.dataset.tool = k; paintTxBar(); };
        setTool('pan');
        /* ─── ce qui est repéré : noms (et fiches), dates, lieux, métiers ─── */
        function paintPeople() {
            const box = $('[data-tx-found]'), people = t.data.people;
            const kept = people.length ? `<h4>${i18n('Personnes de l’acte')}</h4><ul class="h-tx-people">${people.map((p, i) => `<li><button type="button" class="link-button" data-tx-goto="${p.s}:${p.e}">${esc(p.name)}</button>
                <select data-tx-prole="${i}" title="${esc(i18n('Rôle dans l’acte'))}">${['', 'sujet', 'parent', 'conjoint', 'conjoint défunt', 'défunt', 'parrain', 'marraine', 'témoin', 'déclarant', 'officiant', 'officier', 'notaire', 'autre'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r ? esc(i18n(r, {ctx: 'role'})) : i18n('— rôle —')}</option>`).join('')}</select>
                ${p.person_id ? `<button type="button" class="h-tx-linked" data-tx-popen="${p.person_id}" title="${esc(i18n('Ouvrir la fiche'))}">👤 ${i18n('fiche n° {person_id}', {person_id: p.person_id})}</button><button type="button" class="link-button" data-tx-punlink="${i}" title="${esc(i18n('La personne reste dans l’acte, sans fiche reliée'))}">${i18n('Retirer le lien')}</button>` : `<button type="button" class="button small secondary" data-tx-plink="${i}">🔗 ${i18n('Relier…')}</button>`}<button type="button" class="icon-button" data-tx-pdel="${i}" title="${esc(i18n('Retirer de l’acte'))}" aria-label="${esc(i18n('Retirer de l’acte'))}">×</button></li>`).join('')}</ul>` : '';
            const groups = [['person', `👤 ${i18n('Noms repérés')}`], ['date', `📅 ${i18n('Dates')}`], ['place', `📍 ${i18n('Lieux')}`], ['job', `🔨 ${i18n('Métiers')}`]].map(([k, l]) => { const list = found.filter(f => f.type === k); if (!list.length) return '';
                return `<h4>${l} <small class="muted">${list.length}</small>${k === 'person' ? ` <button type="button" class="link-button" data-tx-keepall>${i18n('tout garder')}</button>` : ''}</h4><div class="h-tx-chips">${list.map(f => `<span class="h-tx-chip is-${k}"><button type="button" data-tx-goto="${f.s}:${f.e}" title="${esc(i18n('Montrer dans le texte'))}">${esc(f.label)}${f.role ? ` <i>${esc(f.role)}</i>` : ''}</button>${k === 'person' ? `${(matchCache.get(f.label) || []).slice(0, 2).map(m => `<button type="button" class="h-tx-match" data-tx-match="${found.indexOf(f)}:${m.id}" title="${esc(i18n('Garder et relier à cette fiche'))}">↔ ${esc(m.name)} <small>${esc(m.years)}</small></button>`).join('')}<button type="button" data-tx-keep="${found.indexOf(f)}" title="${esc(i18n('Garder dans les personnes de l’acte'))}">＋</button>` : k === 'date' && f.iso ? `<button type="button" data-tx-setdate="${esc(f.label)}" title="${esc(i18n('Date de l’acte'))}">⇢ date</button>` : k === 'place' ? `<button type="button" data-tx-setplace="${esc(f.label)}" title="${esc(i18n('Lieu de l’acte'))}">⇢ ${i18n('lieu')}</button>` : ''}</span>`).join('')}</div>`; }).join('');
            const lg = aideLang($('[data-tx-lang]').value), kw = lg && found.length + people.length ? (window.LCNDA_AIDE_LECTURE?.known?.(area.value, lg) || []) : [];
            const words = kw.length ? `<h4>📖 ${esc(i18n('Mots connus ({lang})', {lang: langName(lg).toLowerCase()}))} <small class="muted">${kw.length}</small></h4><div class="h-tx-chips">${kw.map(w => `<span class="h-tx-chip is-word"><button type="button" data-tx-lookword="${esc(String(w.item.t).split(',')[0].trim())}" title="${esc(i18n('Ouvrir dans 📖 Aide à la lecture'))}">${esc(w.word)} <i>${esc(w.item.d.length > 48 ? `${w.item.d.slice(0, 46)}…` : w.item.d)}</i></button></span>`).join('')}</div>` : '';
            const ex = lastExtract && (found.length || lastRich?.people.length) ? lastExtract : null;
            const rfT = perCombo && lastRichAll ? lastRichAll : lastRich;
            const tf = ext.txTrouve && rfT && (found.length || rfT.people.length) ? '<div data-tx-trouve></div>' : ''; // 🧭 le bloc riche (heritage-transcribe-trouve.js)
            const cta = ex && ex.people.length && ext.txActe ? `<div class="h-txa-cta"><span><b>${{mariage: '💍', bapteme: '💧', naissance: '👶', deces: '✝', sepulture: '⚱'}[ex.kind] || '📜'} ${esc(i18n('Ce que l’app a trouvé dans l’acte'))}</b> <small class="muted">${esc(A().plural ? A().plural(ex.people.length, 'personne') : ex.people.length)}${ex.date ? ' · ' + esc(ex.date.label) : ''}${ex.place ? ' · ' + esc(ex.place) : ''}</small></span><button type="button" class="button small" data-tx-cmd="found">✓ ${i18n('Ajouter à la généalogie')}…</button></div>` : '';
            const gb = GB(), gabTabs = gb ? `<div class="ui-tabs h-gab-tabs" role="tablist" aria-label="${esc(i18n('Ce que l’app a trouvé'))}">${[['found', `🧾 ${i18n('Ce que l’app a trouvé')}`], ['gab', `🧩 ${i18n('Gabarit')}`]].map(([k, l]) => `<button type="button" role="tab" class="ui-tab${gabTab === k ? ' is-active' : ''}" aria-selected="${gabTab === k}" data-gab-tab="${k}">${esc(l)}</button>`).join('')}</div>` : '';
            if (gb && gabTab === 'gab') { box.innerHTML = gabTabs + '<div class="h-gab" data-gab-box></div>'; paintGabarit(); flowSoon(60); return; }
            box.innerHTML = gabTabs + ((cta + kept + (tf || groups) + words) || `<p class="muted h-tx-hint">${i18n('« 🧭 Repérer » cherche dans le texte les noms (et leur rôle : parrain, témoin, fils de…), les dates (même en toutes lettres, ou au calendrier républicain), les lieux et les métiers, et propose les fiches de ta base qui leur ressemblent.')}</p>`);
            if (tf) ext.txTrouve.mount($('[data-tx-trouve]'), {text: rfT === lastRichAll ? blankMarks(perCombo.text) : area.value, rf: rfT, kind: $('[data-tx="kind"]').value, date: $('[data-tx="date_text"]').value, place: $('[data-tx="place"]').value, source: $('[data-tx="source"]').value,
                filename: t.filename, title: $('[data-tx="title"]').value, mediaId: t.media_id, transcriptionId: t.id, people: t.data.people, keep: (f, pid) => keepAt(f, pid, rfT === lastRichAll), pageRef: rfT === lastRichAll ? perRef : pageForm === 'one' && PAGES.length > 1 ? pageRef : null,
                gotoOf: rfT === lastRichAll ? (a, b) => { const r = perRef(a); return r ? `p${r.seg}:${r.at}:${r.at + (b - a)}` : `${a}:${b}`; } : null,
                setDate: v => { if (!v) return; t.date_text = v; $('[data-tx="date_text"]').value = v; touch(); }, setPlace: v => { if (!v) return; t.place = v; $('[data-tx="place"]').value = v; touch(); },
                setKind: k => { const sel = $('[data-tx="kind"]'); if (!sel || ![...sel.options].some(o => o.value === k)) return; sel.value = k; sel.dispatchEvent(new Event('change', {bubbles: true})); }});
            flowSoon(60);
        }
        /* ─── la frise « Lire → Corriger → Repérer → Ajouter » (P3) : l'étape en cours, ce qui reste à faire à chacune ─── */
        const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`);
        const markCount = text => (String(text).match(/\[\?\]|\[illisible\]/g) || []).length;
        /** les corrections qu'on proposerait (rien n'est souligné tant qu'on n'a pas cliqué « 🪄 Corrections ») : pour « N mots à revoir » */
        async function countFixes() {
            const text = area.value, key = `${fixOn()}|${fixLevel()}|${text}`; if (key === fixCountFor) return;
            if (!fixOn() || !window.LCNDA_HTRFIX || !text.trim()) { fixCount = 0; fixCountFor = key; return; }
            try { const lex = await fixLexicon($('[data-tx-lang]').value, $('[data-tx="place"]').value); if (!lex || !dlg.isConnected || area.value !== text) return; fixCount = window.LCNDA_HTRFIX.propose(text, lex, {level: fixLevel(), keep: txKept}).length; fixCountFor = key; } catch (_) { fixCount = 0; }
        }
        function flowState() {
            const text = area.value, has = !!findText().trim(), lines = ext.txReview ? ext.txReview.linesOf(text).length : text.split('\n').filter(l => l.trim()).length; // 📑 sans les repères « — page 2 — »
            const fixes = txFixOn ? txFix.length : (fixCount ?? 0), marks = markCount(text), toFix = fixes + marks;
            const people = t.data.people, toLink = people.filter(p => !p.person_id).length, names = found.filter(f => f.type === 'person' && !people.some(p => p.s < f.e && f.s < p.e)).length;
            const st = {read: {done: has, rest: has ? plural(lines, 'ligne') : i18n('À faire')},
                fix: {done: has && !toFix && (txFixOn || fixCount !== null), rest: !has ? '' : toFix ? plural(toFix, 'mot à revoir', 'mots à revoir') : i18n('rien à revoir'), fixes, marks, toFix},
                find: {done: people.length > 0, rest: people.length ? plural(people.length, 'personne') : names ? plural(names, 'nom repéré', 'noms repérés') : has ? i18n('À faire') : '', names},
                add: {done: people.length > 0 && !toLink, rest: people.length ? (toLink ? i18n('{n} à relier', {n: toLink}) : i18n('Tout est relié')) : '', toLink, people: people.length}};
            st.cur = STEPS.map(s => s[0]).find(k => !st[k].done) || 'add';
            return st;
        }
        function paintFlow() {
            if (!dlg.isConnected) return;
            const st = flowState(); if (st.cur !== flowCur) { flowCur = st.cur; flowView = ''; } // une étape faite : la frise passe d'elle-même à la suivante
            const view = flowView || st.cur; dlg.dataset.txFlow = st.cur; dlg.dataset.txFlowView = view;
            dlg.querySelectorAll('[data-tx-step]').forEach((b, i) => { const k = b.dataset.txStep, s = st[k], on = k === view;
                b.classList.toggle('is-done', s.done); b.classList.toggle('is-cur', k === st.cur); b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
                b.querySelector('i').textContent = s.done ? '✓' : String(i + 1); b.querySelector('[data-tx-steprest]').textContent = s.rest; });
            dlg.querySelectorAll('[data-tx-pane]').forEach(p => { const on = p.dataset.txPane === view; p.classList.toggle('is-shown', on); p.classList.toggle('is-cur', p.dataset.txPane === st.cur); }); // les boutons de l'étape montrée en avant (sur téléphone : seulement eux)
            const nx = $('[data-tx-stepnext]'); if (nx) nx.hidden = view === 'add';
            const rvb = $('[data-tx-cmd="review"]'); if (rvb) rvb.hidden = !TV.reviewMode?.();
            const fi = $('[data-tx-fixinfo]'); if (fi) fi.textContent = [st.fix.fixes ? plural(st.fix.fixes, 'correction proposée', 'corrections proposées') : '', st.fix.marks ? i18n('{n} × [?] ou [illisible]', {n: st.fix.marks}) : '', st.fix.toFix || !area.value.trim() ? '' : i18n('rien à revoir')].filter(Boolean).join(' · ');
            const fd = $('[data-tx-findinfo]'); if (fd) fd.textContent = found.length ? i18n(found.length > 1 ? '{n} éléments repérés' : '{n} élément repéré', {n: found.length}) : '';
            const ai = $('[data-tx-addinfo]'); if (ai) ai.textContent = st.add.people ? `👥 ${plural(st.add.people, 'personne dans l’acte', 'personnes dans l’acte')} · ${st.add.toLink ? i18n('{n} à relier', {n: st.add.toLink}) : i18n('Tout est relié')}` : `👥 ${i18n('Personne dans l’acte pour l’instant : « 🧭 Repérer » les trouve dans le texte')}`;
            const pc = $('[data-tx-pcount]'); if (pc) pc.textContent = st.add.people ? String(st.add.people) : '';
            paintProg();
        }
        function flowSoon(ms = 350) { clearTimeout(flowT); flowT = setTimeout(() => { flowT = 0; paintFlow(); countFixes().then(paintFlow); }, ms); }
        /** 📱 téléphone (décision 4) : trois onglets Image / Texte / Personnes ; l'écran étroit est décidé par la CSS (même seuil) */
        const phone = () => matchMedia('(max-width: 700px)').matches;
        function showPtab(k, focus = true) { const h = $('.h-tx'); h.dataset.ptab = k; dlg.querySelectorAll('[data-tx-ptab]').forEach(b => { const on = b.dataset.txPtab === k; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); if (focus) dlg.querySelector(`[data-tx-ptab="${k}"]`)?.focus({preventScroll: true}); }
        const showStep = k => { flowView = k; paintFlow(); dlg.querySelector(`[data-tx-step="${k}"]`)?.focus({preventScroll: true}); };
        /* ─── 👁 relecture ligne à ligne en plein écran (heritage-transcribe-relecture.js ; réglage, conseillé oui) ─── */
        function openReview() {
            if (!TV.reviewMode?.() || !ext.txReview) return;
            if (!area.value.trim()) return toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error');
            flushCommit();
            return ext.txReview.open({title: $('[data-tx="title"]').value, text: () => area.value, start: area.selectionStart, zones: () => (pageForm === 'one' && PAGES.length > 1 ? t.data.zones : t.data.zones.filter(onHere)), imageSrc: () => (t.filename ? origSrc() : ''),
                // 📑 un seul texte pour plusieurs pages : l'image de la page de chaque zone, et la page de chaque ligne (« Page 2 (2 sur 4) · Ligne 7 sur 39 »)
                imageFor: z => { if (pageForm !== 'one' || PAGES.length < 2) return ''; const p = PAGES.find(q => Number(q.media_id) === Number(z.p || t.media_id)); return p?.filename ? `media/${encodeURIComponent(p.filename)}` : ''; },
                pageOf: pos => { if (pageForm === 'per' && PAGES.length > 1) return i18n('{page} ({i} sur {n})', {page: pageName(PAGES[pageIx], pageIx), i: pageIx + 1, n: PAGES.length}); const r = pageRef(pos); if (!r) return ''; const i = PAGES.findIndex(q => Number(q.media_id) === Number((t.data.pages || [])[PG.lineOf(area.value, pos).seg])); return i < 0 ? '' : i18n('{page} ({i} sur {n})', {page: pageName(PAGES[i], i), i: i + 1, n: PAGES.length}); }, filter: () => TV.cssFilter(t.data.view),
                replace: (s, e, str) => { area.setRangeText(str, s, e, 'end'); area.dispatchEvent(new Event('input')); },
                reviewed: () => t.data.reviewed || [], setReviewed: list => { t.data.reviewed = list.slice(-5000); touch(); flowSoon(60); },
                onClose: l => { flushCommit(); if (phone()) showPtab('text', false); if (!l) return; selectText(l); const z = t.data.zones.find(q => q.e > q.s && q.s < l.e && l.s < q.e); if (z) { selZone = z.id; drawZones(); reveal(z); } }});
        }
        /* ─── 🔍 Chercher / Remplacer dans le texte (⌘F, ⌥⌘F) : les résultats surlignés, Entrée / ⇧ Entrée, « Tout remplacer » et ↶ Annuler ─── */
        const fq = $('[data-tx-fq]'), fr = $('[data-tx-fr]'), findBar = $('[data-tx-find]');
        let findCase = false;
        function findRun({keep = false} = {}) {
            const q = findBar.hidden ? '' : fq.value, text = area.value, out = [];
            if (q) { const hay = findCase ? text : text.toLocaleLowerCase(), nd = findCase ? q : q.toLocaleLowerCase(); let i = 0; while ((i = hay.indexOf(nd, i)) >= 0 && out.length < 5000) { out.push({s: i, e: i + nd.length}); i += Math.max(1, nd.length); } }
            const was = findHits[findCur]; findHits = out;
            findCur = !out.length ? -1 : keep && was ? Math.max(0, out.findIndex(h => h.s >= was.s)) : Math.max(0, out.findIndex(h => h.s >= area.selectionStart));
            if (findCur < 0 && out.length) findCur = 0;
            $('[data-tx-fcount]').textContent = q ? (out.length ? i18n('{n} sur {total}', {n: findCur + 1, total: out.length}) : i18n('Aucun résultat')) : '';
            $('[data-tx-fcount]').classList.toggle('is-none', !!q && !out.length); paintMirror();
        }
        /** montrer le résultat en cours : choisi dans le texte (sans y aller), le texte défile jusqu'à lui */
        function findShow() { const h = findHits[findCur]; if (!h) return; area.setSelectionRange(h.s, h.e); const lineH = parseFloat(getComputedStyle(area).lineHeight) || 20; area.scrollTop = Math.max(0, (area.value.slice(0, h.s).split('\n').length - 3) * lineH); mirror.scrollTop = area.scrollTop; $('[data-tx-fcount]').textContent = i18n('{n} sur {total}', {n: findCur + 1, total: findHits.length}); paintMirror(); }
        const findStep = d => { if (!findHits.length) return; findCur = (findCur + d + findHits.length) % findHits.length; findShow(); };
        function openFind(replace = false) {
            const sel = area.value.slice(area.selectionStart, area.selectionEnd);
            findBar.hidden = false; if (sel && !/\n/.test(sel) && sel.length < 80) fq.value = sel;
            if (replace) $('[data-tx-frep]').hidden = false; $('[data-tx-f="rep"]').setAttribute('aria-pressed', String(!$('[data-tx-frep]').hidden));
            if (phone()) showPtab('text', false);
            (replace && fq.value ? fr : fq).focus(); (replace && fq.value ? fr : fq).select(); findRun(); if (findHits.length) findShow();
        }
        function closeFind() { findBar.hidden = true; findHits = []; findCur = -1; paintMirror(); area.focus(); }
        /** remplacer : chaque remplacement est une petite modification (les zones et les personnes suivent leur passage) */
        const replaceAt = (h, str) => { area.setRangeText(str, h.s, h.e, 'end'); area.dispatchEvent(new Event('input')); };
        function replaceOne() { const h = findHits[findCur]; if (!h) return; versionBefore('Avant « Remplacer »'); replaceAt(h, fr.value); findRun({keep: true}); findShow(); }
        function replaceAll() {
            if (!findHits.length) return; const n = findHits.length, q = fq.value, by = fr.value, snapBefore = snapText();
            versionBefore('Avant « Tout remplacer »'); flushCommit();
            [...findHits].reverse().forEach(h => replaceAt(h, by)); flushCommit(); findRun();
            const after = snapText();
            A().undoToast?.(i18n('« {q} » → « {by} » : {n}', {q, by, n: plural(n, 'remplacement', 'remplacements')}), {undo: () => { putText(snapBefore); findRun(); }, redo: () => { putText(after); findRun(); }});
        }
        findBar.addEventListener('input', e => { if (e.target === fq) findRun(); });
        findBar.addEventListener('click', e => { const b = e.target.closest('[data-tx-f]'); if (!b) return; const k = b.dataset.txF;
            if (k === 'next' || k === 'prev') return findStep(k === 'next' ? 1 : -1);
            if (k === 'case') { findCase = !findCase; b.setAttribute('aria-pressed', String(findCase)); b.classList.toggle('is-active', findCase); return findRun({keep: true}); }
            if (k === 'rep') { const rp = $('[data-tx-frep]'); rp.hidden = !rp.hidden; b.setAttribute('aria-pressed', String(!rp.hidden)); if (!rp.hidden) fr.focus(); return; }
            if (k === 'one') return replaceOne(); if (k === 'all') return replaceAll(); if (k === 'close') return closeFind(); });
        findBar.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return closeFind(); }
            if (e.key === 'Enter' && e.target === fq) { e.preventDefault(); e.stopPropagation(); return findStep(e.shiftKey ? -1 : 1); }
            if (e.key === 'Enter' && e.target === fr) { e.preventDefault(); e.stopPropagation(); return (e.metaKey || e.ctrlKey) ? replaceAll() : replaceOne(); }
        });
        /* ─── 🕘 Versions du texte (la fenêtre commune, app-versions.js ; serveur : act_transcription_versions) ─── */
        const snapText = () => ({body: area.value, zones: t.data.zones.map(z => ({...z})), people: t.data.people.map(p => ({...p})), reviewed: [...(t.data.reviewed || [])]});
        function putText(x) { flushCommit(); area.value = x.body; before = x.body; t.body = x.body; t.data.zones = (x.zones || []).map(z => ({...z})); t.data.people = (x.people || []).map(p => ({...p})); t.data.reviewed = [...(x.reviewed || [])];
            if (!t.data.zones.some(z => z.id === selZone)) selZone = null; txFix = []; touch(); drawZones(); paintPeople(); if (!findBar.hidden) findRun(); flushCommit(); }
        /** juste avant un gros changement (tout remplacer, propositions sûres, lecture mise dans le texte) : une version automatique, si l'acte est enregistré */
        function versionBefore(label) { if (!t.id || !area.value.trim()) return; post('save_act_transcription_version', {act_id: t.id, label, body: area.value, data: {zones: t.data.zones, people: t.data.people, reviewed: t.data.reviewed || []}, auto: 1}).then(() => VS?.soon(), () => {}); }
        async function openVersions() {
            if (!UI.openVersions) return toast(i18n('La fenêtre des versions n’est pas chargée.'), 'error');
            if (!t.id) { await save(); if (!t.id) return; }
            const full = new Map(), get = async id => { if (!full.has(id)) full.set(id, await api('act_transcription_version', {id})); return full.get(id); };
            const info = (lines, words) => `${plural(lines, 'ligne')} · ${plural(words, 'mot')}`, nowLines = () => area.value.split('\n').filter(l => l.trim()).length;
            const dataOf = () => ({zones: t.data.zones, people: t.data.people, reviewed: t.data.reviewed || []});
            return UI.openVersions({title: $('[data-tx="title"]').value || i18n('Acte'), tool: i18n('Atelier de transcription'), kind: 'text',
                list: async () => ((await api('act_transcription_versions', {act_id: t.id})).items || []).map(v => ({...v, label: i18n(v.label), auto: !!v.auto, info: info(v.lines, v.words)})),
                now: () => ({info: info(nowLines(), (area.value.match(/\S+/g) || []).length), hint: i18n('le texte à l’écran')}),
                preview: async v => ({text: v ? (await get(v.id)).body : area.value}),
                keepNow: label => post('save_act_transcription_version', {act_id: t.id, label, body: area.value, data: dataOf(), auto: 1}),
                restore: async v => { const x = await get(v.id), was = snapText(), to = {body: x.body, zones: x.data?.zones || [], people: x.data?.people || [], reviewed: x.data?.reviewed || []}; putText(to);
                    return {undo: () => putText(was), redo: () => putText(to)}; },
                rename: (v, label) => post('rename_act_transcription_version', {id: v.id, label}),
                remove: async v => { const r = await post('delete_act_transcription_version', {id: v.id}); full.delete(v.id); return {undo: () => post('restore_act_transcription_version', {version: (r.result || r).version})}; },
                removeMany: async vs => { const r = await ext.txCtx.removeVersions(vs); vs.forEach(v => full.delete(v.id)); return r; }, onChange: () => VS?.soon(), // 🗑 plusieurs cochées, une seule ↶ Annuler ; la bande suit
                saveNow: async () => { const name = await A().askText({title: `🕘 ${i18n('Nouvelle version')}`, message: i18n('Un nom pour cette version (facultatif) :'), value: '', okLabel: i18n('Enregistrer')}); if (name === null) return;
                    await post('save_act_transcription_version', {act_id: t.id, label: String(name || '').trim().slice(0, 120), body: area.value, data: dataOf(), auto: 0}); }});
        }
        /* ─── ⚖️ chaque lecture gardée (✍ main, 🔬 IA, 🔎 OCR) pour les comparer et prendre le meilleur (heritage-transcribe-compare.js) ─── */
        /** meta : ce que la lecture retient avec elle (🕘 la bande « Versions ») — img : auto | mine | orig, part : page | zone, hints : les indices de « 🧠 Aider l'IA » */
        async function keepReading(text, source, model = '', meta = {}) {
            const C = ext.txCompare; if (!C || !C.keepOn() || !String(text || '').trim()) return;
            const page = PAGES.length > 1 ? pageName(PAGES[pageIx], pageIx) : '';
            const v = {label: C.labelOf(source, model, page), body: String(text).trim(), data: {zones: [], people: [], meta: {model: String(model || '').slice(0, 80), ...meta}}, auto: 0, source: `${source}:${String(model || '').slice(0, 80)}`};
            // un acte pas encore enregistré : la lecture attend le premier enregistrement (l'enregistrer ici, pendant la lecture, écrasait le texte lu)
            if (!t.id) { readsWaiting.push(v); return; }
            post('save_act_transcription_version', {act_id: t.id, ...v}).then(() => VS?.soon(), () => {});
        }
        const readsWaiting = [];
        let lastHints = 0; // 🧠 le nombre d'indices de la dernière lecture approfondie
        const flushReads = () => { if (!t.id) return; readsWaiting.splice(0).forEach(v => post('save_act_transcription_version', {act_id: t.id, ...v}).then(() => VS?.soon(), () => {})); VS?.soon(); };
        /** l'image envoyée à la lecture rapide et à l'OCR : améliorée (« Mieux voir ») ou d'origine */
        const readImg = () => (useEnh() && viewChanged() ? 'mine' : 'orig');
        /* ─── 🕘 la bande « Versions » au-dessus de « 📄 Ce texte est celui du document » (heritage-transcribe-contexte.js) ─── */
        const VS = ext.txCtx ? ext.txCtx.versionsStrip($('[data-tx-vers]'), $('[data-tx-vprev]'), {
            list: async () => (t.id ? ((await api('act_transcription_versions', {act_id: t.id})).items || []) : []),
            body: id => api('act_transcription_version', {id}),
            use: async v => { // ✓ Utiliser cette version : elle devient « Ma version » ; l'ancienne est gardée (🕘), ↶ Annuler
                let x; try { x = await api('act_transcription_version', {id: v.id}); } catch (e) { return toast(e.message, 'error'); }
                versionBefore('Avant « Utiliser cette version »');
                const was = snapText(), to = {body: x.body, zones: x.data?.zones || [], people: x.data?.people || [], reviewed: x.data?.reviewed || []};
                const hWas = Number(t.data.hinted) || 0, hTo = Number(x.data?.meta?.hints) || 0, put = (o, h) => { t.data.hinted = h; putText(o); }; // 🧠 les mots [?] de cette lecture : « lu avec un indice »
                put(to, hTo); status(i18n('Version mise dans le texte (à relire)'));
                A().undoToast?.(i18n('« {x} » est maintenant ta version (l’ancienne est gardée dans 🕘 Versions)', {x: ext.txCtx.chipOf(v)[1]}), {undo: () => put(was, hWas), redo: () => put(to, hTo), icon: '🕘'}); },
            compare: v => openCompare([v.id]),
            duplicate: async v => { // ⧉ garder une copie de la version affichée (ou de ma version)
                if (!t.id) { await save(); if (!t.id) return; }
                let x = {body: area.value, data: {zones: t.data.zones, people: t.data.people}}; if (v) { try { x = await api('act_transcription_version', {id: v.id}); } catch (e) { return toast(e.message, 'error'); } }
                const src = String(v?.source || '').split(':')[0], label = !v ? 'Copie de ma version' : ['deep', 'htr', 'ocr'].includes(src) ? 'Copie de l’IA' : 'Copie';
                let id = 0; try { id = Number(((await post('save_act_transcription_version', {act_id: t.id, label, body: x.body, data: {zones: x.data?.zones || [], people: x.data?.people || [], meta: {from: v ? ext.txCtx.chipOf(v)[1] : i18n('Ma version')}}, auto: 0, source: 'copy'})).result || {}).id || 0); } catch (e) { return toast(e.message, 'error'); }
                await VS.refresh();
                A().undoToast?.(i18n('Copie gardée : « {x} »', {x: i18n(label)}), {undo: async () => { if (id) await post('delete_act_transcription_version', {id}); VS.refresh(); }, icon: '⧉'}); },
            rename: async v => { const name = await A().askText({title: `✎ ${i18n('Renommer')}`, message: i18n('Le nouveau nom de cette version :'), value: i18n(v.label || ''), okLabel: i18n('Renommer')}); if (name === null || !String(name).trim()) return;
                const old = v.label; try { await post('rename_act_transcription_version', {id: v.id, label: String(name).trim().slice(0, 120)}); } catch (e) { return toast(e.message, 'error'); } await VS.refresh();
                A().undoToast?.(i18n('Version renommée'), {undo: async () => { await post('rename_act_transcription_version', {id: v.id, label: old}); VS.refresh(); }, icon: '✎'}); },
            openAll: () => openVersions(),
            /* ✎ « Travailler sur cette version dans l'éditeur » : elle devient le texte (le mien gardé), ses zones à elle ou les miennes reliées à ses lignes */
            work: async v => {
                if (!t.id) { await save(); if (!t.id) return; }
                let x; try { x = await api('act_transcription_version', {id: v.id}); } catch (e) { return toast(e.message, 'error'); }
                const C = ext.txCtx, cur = VS.working(), here = snapText(), hHere = Number(t.data.hinted) || 0, mine = cur ? cur.was : here;
                if (cur) await keepWork(cur); else versionBefore('Avant « Travailler sur cette version »');
                const body = String(x.body || ''), own = (x.data?.zones || []).filter(z => z.e > z.s);
                const R = own.length && own.every(z => z.e <= body.length) ? {zones: x.data.zones, unlinked: 0} : C.relinkZones(mine.zones, mine.body, body, ext.txSnap.textLinesOf);
                const to = {body, zones: R.zones, people: x.data?.people || [], reviewed: []}, hTo = Number(x.data?.meta?.hints) || 0, w = {v, body, was: mine, wasHinted: cur ? cur.wasHinted : hHere};
                const put = (o, h, ww) => { t.data.hinted = h; putText(o); VS.setWorking(ww); };
                put(to, hTo, w); status(R.unlinked ? i18n(R.unlinked > 1 ? '{n} zones à relier aux lignes de cette version' : '{n} zone à relier aux lignes de cette version', {n: R.unlinked}) : i18n('Zones reliées aux lignes de cette version'));
                A().undoToast?.(i18n('Tu travailles sur « {x} » dans l’éditeur (ton texte est gardé)', {x: C.chipOf(v)[1]}), {undo: () => put(here, hHere, cur), redo: () => put(to, hTo, w), icon: '✎'}); },
            back: async () => { const w = VS.working(); if (!w) return; await keepWork(w); const here = snapText(), hHere = Number(t.data.hinted) || 0;
                const put = (o, h, ww) => { t.data.hinted = h; putText(o); VS.setWorking(ww); }; put(w.was, w.wasHinted, null); status(i18n('Retour à ta version'));
                A().undoToast?.(i18n('Retour à ta version'), {undo: () => put(here, hHere, w), redo: () => put(w.was, w.wasHinted, null), icon: '↩'}); },
            keep: w => keepWork(w),
            dim: on => $('[data-tx-editor]')?.classList.toggle('is-dim', on)}) : null;
        /** ✎ en quittant une version : elle garde ses zones reliées ; son texte corrigé → une copie (une lecture n'est jamais écrasée) */
        async function keepWork(w) {
            if (!w || !t.id) return; const from = ext.txCtx.chipOf(w.v)[1];
            try { if (area.value === w.body) await post('save_act_transcription_version_zones', {id: w.v.id, zones: t.data.zones});
                else await post('save_act_transcription_version', {act_id: t.id, label: 'Copie corrigée', body: area.value, data: {zones: t.data.zones, people: t.data.people, meta: {from}}, auto: 0, source: 'copy'}); } catch (e) { toast(e.message, 'error'); }
            VS?.soon(); }
        async function openCompare(pick = null) {
            if (!ext.txCompare) return toast(i18n('La comparaison des lectures n’est pas chargée.'), 'error');
            if (!t.id) { await save(); if (!t.id) return; }
            ext.txCompare.open({actId: t.id, title: $('[data-tx="title"]').value || i18n('Acte'), current: () => area.value, api, post, pick: Array.isArray(pick) ? pick : null, // ⚖️ « Comparer avec ma version » : ces lectures cochées
                images: PAGES.length > 1 ? PAGES.map((p, i) => ({src: `media/${encodeURIComponent(p.filename)}`, label: pageName(p, i)})) : t.filename ? [{src: origSrc()}] : [], // 🖼 l'image de l'acte à côté des lectures
                apply: (txt, label) => { versionBefore(label); const was = snapText(), to = {...was, body: txt + (txt.endsWith('\n') ? '' : '\n')}; putText(to); status(i18n('Texte fusionné (à relire)'));
                    A().undoToast?.(i18n('Lectures fusionnées dans le texte.'), {undo: () => putText(was), redo: () => putText(to)}); }});
        }
        /* ─── 🧠 « Aider l'IA » (heritage-transcribe-contexte.js) : le titre, de quoi parle l'acte, les personnes reliées, les indices de la base ;
         * cochés au départ : l'événement, les noms, les lieux (et ❓ pourquoi l'acte). Envoyés avec l'image à la lecture approfondie. ─── */
        let iaOn = true, iaCache = {key: null, list: []};
        const iaPeople = () => [...new Set(t.data.people.map(p => Number(p.person_id) || 0).filter(Boolean))].sort((a, b) => a - b);
        async function iaList() {
            const key = JSON.stringify([iaPeople(), $('[data-tx="place"]').value]); if (iaCache.key === key) return iaCache.list;
            let list = []; try { const r = await post('act_ai_hints', {person_ids: iaPeople(), place: $('[data-tx="place"]').value}); list = (r.result || r).hints || []; } catch (_) { list = []; }
            iaCache = {key, list}; return list;
        }
        const IA = {get key() { return String(t.id || `m${t.media_id}`); }, title: () => $('[data-tx="title"]').value, setTitle: v => { const el = $('[data-tx="title"]'); el.value = v; t.title = v; touch(); },
            about: () => t.data.about || '', setAbout: v => { t.data.about = String(v).slice(0, 600); touch(); }, people: () => t.data.people, hints: iaList,
            reason: () => (kindNow() === 'notoriete' ? t.data.reason || null : null), lang: () => $('[data-tx-lang]').value, onChange: () => paintIaCount(),
            doc: () => { const kl = KINDS.find(k => k[0] === kindNow() && k[0] !== 'apreciser')?.[1] || '', where = [$('[data-tx="date_text"]').value, $('[data-tx="place"]').value].filter(x => x.trim()).join(', '), ti = $('[data-tx="title"]').value.trim();
                return [ti, kl && kl !== ti ? `${kl}${where ? ` (${where})` : ''}` : where].filter(Boolean).join(' — '); },
            onRead: withHints => { iaOn = withHints; paintIaCount(); openDeep(); }};
        /** ce qui part vers l'IA avec l'image (null : sans « Aider l'IA ») */
        const iaContext = async () => (iaOn && ext.txCtx ? ext.txCtx.contextOf(IA, await iaList()) : null);
        const iaCount = () => (iaOn && ext.txCtx ? ext.txCtx.checkedCount(IA, iaCache.list) : 0);
        async function paintIaCount() { const el = $('[data-tx-iacount]'); if (!el || !ext.txCtx) return; await iaList(); const n = iaCount(); el.textContent = n ? ` · ${n}` : ''; }
        function openIa() { if (!ext.txCtx) return toast(i18n('« Aider l’IA » n’est pas chargé.'), 'error'); flushCommit(); return ext.txCtx.openAide(IA); }
        /* ─── ❓ acte de notoriété : « Pourquoi cet acte a été fait » (data.reason), au-dessus du texte et dans le 🧩 Gabarit ─── */
        function paintWhy() { const row = $('[data-tx-whyrow]'), on = kindNow() === 'notoriete' && !!ext.txCtx; if (!row) return; row.hidden = !on; row.innerHTML = on ? ext.txCtx.whyHtml(t.data.reason) : ''; }
        const whySync = () => { const r = t.data.reason; dlg.querySelectorAll('[data-tx-why-k]').forEach(x => { x.value = r?.k || ''; }); dlg.querySelectorAll('[data-tx-why-t]').forEach(x => { if (x !== document.activeElement) x.value = r?.t || ''; }); dlg.querySelectorAll('.h-why-k').forEach(x => x.classList.toggle('is-auto', !!r?.auto)); dlg.querySelectorAll('.h-why-auto').forEach(x => { if (!r?.auto) x.remove(); }); };
        dlg.addEventListener('change', e => { if (!e.target.matches?.('[data-tx-why-k]')) return; snap(); const k = e.target.value, txt = t.data.reason?.t || '';
            if (k) t.data.reason = {k, t: txt}; else delete t.data.reason; touch(); whySync(); paintIaCount(); });
        dlg.addEventListener('input', e => { if (!e.target.matches?.('[data-tx-why-t]')) return; const v = e.target.value.slice(0, 300);
            t.data.reason = {k: t.data.reason?.k || 'autre', t: v}; touch(); whySync(); });
        /** « 🧭 Repérer » : la raison lue dans le texte, en vert, à vérifier (jamais à la place d'un choix fait à la main) */
        function guessWhy(src) { if (kindNow() !== 'notoriete' || !ext.txCtx || (t.data.reason && !t.data.reason.auto)) return; const g = ext.txCtx.reasonGuess(src); if (!g || t.data.reason?.k === g.k) return;
            t.data.reason = {k: g.k, t: t.data.reason?.t || '', auto: true}; touch(); paintWhy(); }
        /* ─── ⌨️ les touches de l'Atelier (⌘/ ou ?) ─── */
        function showKeys() {
            const K = A().keys, kk = s => (K?.html ? K.html(s) : `<kbd>${esc(s)}</kbd>`);
            const rows = [['⌘S', 'Enregistrer'], ['⌘Z', 'Annuler'], ['⇧⌘Z', 'Rétablir'], ['⌘F', 'Chercher dans le texte'], ['⌥⌘F', 'Chercher et remplacer'], ['↩ / ⇧↩', 'Résultat suivant, résultat d’avant'],
                ...(TV.reviewMode?.() ? [['R', 'Relire ligne à ligne']] : []), ['⌥↓ / ⌥↑', 'Ligne suivante, ligne d’avant : l’image suit sa zone'], ['H', 'Déplacer l’image'], ['Espace', 'Déplacer l’image, en restant appuyé'], ['Z', 'Dessiner une zone'], ['L', 'Loupe'],
                ['← → ↑ ↓', 'Déplacer la zone choisie (⇧ : l’agrandir)'], ['Suppr', 'Supprimer la zone choisie'], ['⌘0', 'Ajuster à la fenêtre'], ['⌘1', '100 %'], ['⌘+ / ⌘−', 'Zoom avant, zoom arrière'], ['⌘P', 'Imprimer'], ['⌘/ / ?', 'Cette liste des touches'], ['Échap', 'Fermer']];
            ext.openDialog({eyebrow: i18n('Atelier de transcription').toUpperCase(), title: `⌨️ ${i18n('Raccourcis clavier')}`, submitLabel: i18n('Fermer'),
                body: `<table class="h-tx-keys" data-tx-keys><tbody>${rows.map(([k, l]) => `<tr><td>${k.split(' / ').map(kk).join(' / ')}</td><td>${esc(i18n(l))}</td></tr>`).join('')}</tbody></table><p class="ui-hint">${esc(i18n('Sur PC et Linux : Ctrl au lieu de ⌘, Alt au lieu de ⌥.'))}</p>`, onSubmit: () => {}});
        }
        /** ⌥↓ / ⌥↑ dans le texte : la ligne suivante ou d'avant est choisie, l'image va à sa zone */
        function lineStep(d) {
            const v = area.value, c = d > 0 ? area.selectionEnd : area.selectionStart, start = v.lastIndexOf('\n', c - 1) + 1;
            let s = d > 0 ? v.indexOf('\n', c) + 1 : v.lastIndexOf('\n', start - 2) + 1; if (d > 0 && s === 0) return; if (d < 0 && start === 0) return;
            const e = v.indexOf('\n', s) < 0 ? v.length : v.indexOf('\n', s); selectText({s, e}); const z = t.data.zones.find(q => q.e > q.s && q.s < e && s < q.e); if (z) { selZone = z.id; drawZones(); reveal(z); }
        }
        /* ─── avancement (F6) : l'état de l'acte, les lignes relues, les mots douteux, les lignes reliées ; un clic va au premier endroit ─── */
        const STATE = {todo: ['À faire', 'grey'], doing: ['En cours', 'yellow'], checked: ['Relue', 'blue'], done: ['Finie', 'green']};
        const setState = (k, {undo = true} = {}) => { const sel = $('[data-tx-state]'), was = sel.value; if (was === k) return; sel.value = k; t.data.status = k; touch(); paintProg();
            if (undo) A().undoToast?.(i18n('État : {x}', {x: i18n(STATE[k][0])}), {undo: () => setState(was, {undo: false}), redo: () => setState(k, {undo: false})}); };
        function progState() {
            const RV = ext.txReview, text = area.value, ls = RV ? RV.linesOf(text) : [], keys = new Set(t.data.reviewed || []);
            const reviewed = RV ? ls.filter(l => keys.has(RV.lineKey(l.text))).length : 0, linked = ls.filter(l => t.data.zones.some(z => z.e > z.s && z.s < l.e && l.s < z.e)).length;
            const fixes = txFixOn ? txFix.length : (fixCount ?? 0), doubt = fixes + markCount(text), toLink = t.data.people.filter(p => !p.person_id).length;
            return {lines: ls, total: ls.length, reviewed, linked, doubt, toLink, people: t.data.people.length, keys};
        }
        function paintProg() {
            const box = $('[data-tx-prog]'); if (!box) return; const s = progState(), st = $('[data-tx-state]').value, [lab, col] = STATE[st] || STATE.doing;
            const chip = (k, ic, txt, warn) => `<button type="button" class="h-tx-pchip${warn ? ' is-warn' : ' is-ok'}" data-tx-pgo="${k}">${ic} ${esc(txt)}${warn ? ' ›' : ''}</button>`;
            const allDone = s.total && s.reviewed === s.total && !s.doubt && s.linked === s.total && !s.toLink;
            const propose = !s.total ? '' : allDone && st !== 'done' ? `<button type="button" class="button small" data-tx-pset="done">✓ ${esc(i18n('Marquer comme finie'))}</button>` : s.reviewed === s.total && !s.doubt && (st === 'todo' || st === 'doing') ? `<button type="button" class="button small secondary" data-tx-pset="checked">✓ ${esc(i18n('Marquer comme relue'))}</button>` : '';
            box.innerHTML = `<button type="button" class="h-tx-pstate" data-tx-pstate aria-haspopup="menu" title="${esc(i18n('Où en est cette transcription (pour la liste « Transcriptions d’actes »)'))}">${UI.badge ? UI.badge(i18n(lab), col) : esc(i18n(lab))} ▾</button>
                ${s.total ? chip('doubt', '🟡', s.doubt ? plural(s.doubt, 'mot douteux', 'mots douteux') : i18n('aucun mot douteux'), s.doubt) + chip('review', '👁', i18n('{n} / {total} lignes relues', {n: s.reviewed, total: s.total}), s.reviewed < s.total) + chip('zone', '▭', i18n('{n} / {total} lignes reliées', {n: s.linked, total: s.total}), s.linked < s.total) : ''}
                ${s.people ? chip('link', '👥', s.toLink ? i18n('{n} à relier', {n: s.toLink}) : i18n('Tout est relié'), s.toLink) : ''}${propose}`;
            dlg.dataset.txProg = JSON.stringify({state: st, total: s.total, reviewed: s.reviewed, linked: s.linked, doubt: s.doubt, toLink: s.toLink});
        }
        /** un compteur : aller au premier endroit concerné */
        function progGo(k) {
            const s = progState(), text = area.value;
            if (k === 'review') { const l = s.lines.find(x => !s.keys.has(ext.txReview.lineKey(x.text))); if (!l) return; if (TV.reviewMode?.()) { area.setSelectionRange(l.s, l.s); return openReview(); } return selectText(l); }
            if (k === 'zone') { const l = s.lines.find(x => !t.data.zones.some(z => z.e > z.s && z.s < x.e && x.s < z.e)); if (l) { if (phone()) showPtab('text', false); selectText(l); status(i18n('Ligne sans zone : dessine-la sur l’image (▭)')); } return; }
            if (k === 'doubt') { const at = [...text.matchAll(/\[\?\]|\[illisible\]/g)].map(m => ({s: m.index, e: m.index + m[0].length})); const first = [...at, ...txFix].sort((a, b) => a.s - b.s)[0];
                if (!first && !txFixOn && fixCount) return runFix(); if (first) { if (phone()) showPtab('text', false); selectText(first); } return; }
            if (k === 'link') { if (phone()) showPtab('people', false); const i = t.data.people.findIndex(p => !p.person_id); if (i >= 0) $(`[data-tx-plink="${i}"]`)?.scrollIntoView({block: 'nearest'}); return showStep('add'); }
        }
        $('[data-tx-prog]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.txPgo) return progGo(b.dataset.txPgo);
            if (b.dataset.txPset) return setState(b.dataset.txPset);
            if (b.hasAttribute('data-tx-pstate')) { const cur = $('[data-tx-state]').value; // menu de choix unique
                return UI.menuAt?.(b, Object.entries(STATE).map(([k, [l]]) => ({icon: k === cur ? '●' : '○', label: i18n(l), run: () => setState(k)})), {title: i18n('État')}); } });
        /* ─── abréviations connues (F4) : soulignées en pointillé, leur sens au survol ou au toucher (données de « 📖 Aide à la lecture ») ─── */
        const abTip = $('[data-tx-abtip]'); let abShown = -1, abHide = 0;
        /** 💰📏 la bulle d'une somme ou d'une mesure : l'année de l'acte, la région des mesures d'après le lieu (« (35) ») ou celle du Convertisseur */
        function amountInfo(h) {
            const MT = window.LCNDA_MONTANTS, cm = ext.calendarMore; if (!MT) return null; if (!ext.prixReference) MT.loadPrices?.();
            const ym = String($('[data-tx="date_text"]')?.value || '').match(/\b(1[2-9]\d{2}|20[0-2]\d)\b/), dm = String($('[data-tx="place"]')?.value || '').match(/\((\d{2}|2[AB])\)/i);
            let region = dm && cm?.regionOfDept ? cm.regionOfDept(dm[1]) : ''; if (!region) { try { region = JSON.parse(localStorage.getItem('lcnda-autrefois-region') || '"paris"'); } catch (_) { region = 'paris'; } }
            return MT.explain(h, {year: ym ? Number(ym[1]) : 0, region, wageSols: A().journalierWageSols, calendarMore: cm, prices: ext.prixReference});
        }
        const abAt = (x, y) => { let hit = -1; mirror.querySelectorAll('.h-tx-ab').forEach(sp => { if (hit >= 0) return; for (const r of sp.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2) { hit = Number(sp.dataset.ab); return; } }); return hit; };
        function showAb(i) {
            const a = abbrevs[i]; if (!a) return hideAb(); clearTimeout(abHide); if (abShown === i && !abTip.hidden) return; abShown = i;
            const sp = mirror.querySelector(`.h-tx-ab[data-ab="${i}"]`); if (!sp) return;
            if (a.amount) { const x = amountInfo(a.amount); if (!x) return hideAb();
                abTip.innerHTML = `<b>${a.amount.type === 'money' ? '💰' : '📏'} ${esc(x.title)}</b>${x.lines.map(l => `<span class="h-tx-amline">${esc(l)}</span>`).join('')}${x.source ? `<small>${esc(i18n('Source'))} : ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.source)} ↗</a>` : esc(x.source)}</small>` : ''}<button type="button" class="link-button" data-tx-abopen>${esc(i18n('Voir le calcul dans 🪙 le Convertisseur d’autrefois'))}</button>`; }
            else abTip.innerHTML = `<b data-i18n-off>${esc(a.word)}</b> = <span data-i18n-off>${esc(a.item.d)}</span>${a.item.ex ? `<small data-i18n-off>${esc(a.item.ex)}</small>` : ''}<button type="button" class="link-button" data-tx-abopen>${esc(i18n('Ouvrir dans 📖 Aide à la lecture'))}</button>`;
            abTip.hidden = false; const ed = $('[data-tx-editor]').getBoundingClientRect(), r = sp.getClientRects()[0] || sp.getBoundingClientRect(), w = abTip.offsetWidth, h = abTip.offsetHeight;
            const left = Math.max(4, Math.min(ed.width - w - 4, r.left - ed.left)), below = r.bottom - ed.top + 4; abTip.style.left = `${left}px`; abTip.style.top = `${below + h > ed.height ? Math.max(4, r.top - ed.top - h - 4) : below}px`;
            dlg.dataset.txAb = a.word;
        }
        function hideAb() { abShown = -1; abTip.hidden = true; delete dlg.dataset.txAb; }
        let abRaf = 0;
        /* 🧠 un mot [?] lu avec un indice de « Aider l'IA » : la bulle « lu avec un indice » (la même que celle des abréviations) */
        const hwAt = (x, y) => { let hit = -1; mirror.querySelectorAll('.h-tx-hintw').forEach(sp => { if (hit >= 0) return; for (const r of sp.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2) { hit = Number(sp.dataset.hw); return; } }); return hit; };
        function showHint(i) {
            const w = hintW[i], sp = mirror.querySelector(`.h-tx-hintw[data-hw="${i}"]`); if (!w || !sp) return hideAb(); clearTimeout(abHide);
            if (abShown === 1e6 + i && !abTip.hidden) return; abShown = 1e6 + i;
            abTip.innerHTML = `<b>🧠 ${esc(i18n('lu avec un indice'))}</b> <span data-i18n-off>« ${esc(w.word)} »</span><small>${esc(i18n('L’IA a lu ce mot en s’aidant d’un indice de « Aider l’IA » : vérifie-le sur l’image.'))}</small>`;
            abTip.hidden = false; const ed = $('[data-tx-editor]').getBoundingClientRect(), r = sp.getClientRects()[0] || sp.getBoundingClientRect(), tw = abTip.offsetWidth, th = abTip.offsetHeight;
            const left = Math.max(4, Math.min(ed.width - tw - 4, r.left - ed.left)), below = r.bottom - ed.top + 4; abTip.style.left = `${left}px`; abTip.style.top = `${below + th > ed.height ? Math.max(4, r.top - ed.top - th - 4) : below}px`;
            dlg.dataset.txAb = w.word;
        }
        area.addEventListener('mousemove', e => { if (!abbrevs.length && !hintW.length) return; cancelAnimationFrame(abRaf); abRaf = requestAnimationFrame(() => { const i = abbrevs.length ? abAt(e.clientX, e.clientY) : -1; if (i >= 0) return showAb(i); const h = hintW.length ? hwAt(e.clientX, e.clientY) : -1; if (h >= 0) return showHint(h); if (!abTip.hidden) { clearTimeout(abHide); abHide = setTimeout(hideAb, 350); } }); });
        area.addEventListener('mouseleave', () => { clearTimeout(abHide); abHide = setTimeout(hideAb, 350); });
        abTip.addEventListener('mouseenter', () => clearTimeout(abHide)); abTip.addEventListener('mouseleave', () => { abHide = setTimeout(hideAb, 250); });
        abTip.addEventListener('click', e => { if (!e.target.closest('[data-tx-abopen]')) return; const a = abShown < 1e6 ? abbrevs[abShown] : null; hideAb(); if (a?.amount) { const x = amountInfo(a.amount); if (x) ext.autrefois?.open({tab: x.convert.tab, value: x.convert.value, year: x.convert.year}); return; } if (a) ext.readingAid?.open({q: String(a.item.t).split(',')[0].trim(), lang: aideLang($('[data-tx-lang]').value)}); });
        // au toucher (ou un clic) : le mot touché montre sa bulle (sauf s'il a une correction proposée : son menu passe d'abord)
        area.addEventListener('click', () => { if (!abbrevs.length || area.selectionStart !== area.selectionEnd) return hideAb(); const c = area.selectionStart; if (txFix.some(f => c >= f.s && c <= f.e)) return; const i = abbrevs.findIndex(a => c >= a.s && c <= a.e); if (i >= 0) showAb(i); else hideAb(); });
        area.addEventListener('input', hideAb); area.addEventListener('scroll', hideAb);
        let lastExtract = null, lastUnsure = 0, lastRich = null, lastRichAll = null;
        async function runDetect() {
            const src = findText(); // 📑 les repères « — page 2 — » ne sont ni des noms, ni des nombres
            found = detect(src);
            const names = [...new Set(found.filter(f => f.type === 'person').map(f => f.label))].filter(n => !matchCache.has(n));
            if (names.length) { try { const r = await post('act_match_people', {names}); (r.result || []).forEach((list, i) => matchCache.set(names[i], list)); } catch (_) {} }
            try { lastExtract = window.LCNDA_TXACTE?.extractAct(src, {kind: $('[data-tx="kind"]').value, place: $('[data-tx="place"]').value, date: $('[data-tx="date_text"]').value, helpers: {detect, findDates, wordsToNumber}}) || null; } catch (_) { lastExtract = null; }
            try { lastRich = window.LCNDA_TXACTE?.richFind?.(src, {kind: $('[data-tx="kind"]').value, place: $('[data-tx="place"]').value, date: $('[data-tx="date_text"]').value, helpers: {detect, findDates, wordsToNumber}}) || null; if (lastExtract && lastRich) window.LCNDA_TXACTE.mergeRich(lastExtract, lastRich); } catch (_) { lastRich = null; }
            // 📑 un texte par page : « Ce que l'app a trouvé » lit aussi les actes des autres pages (une carte par personne sur tout le document)
            perCombo = makeCombo(); lastRichAll = null; 
            if (perCombo) { try { lastRichAll = window.LCNDA_TXACTE?.richFind?.(blankMarks(perCombo.text), {kind: $('[data-tx="kind"]').value, place: $('[data-tx="place"]').value, date: $('[data-tx="date_text"]').value, helpers: {detect, findDates, wordsToNumber}}) || null; } catch (_) { lastRichAll = null; } }
            fillGabarit(src); guessWhy(src);
            paintMirror(); paintPeople(); status(i18n(found.length > 1 ? '{n} éléments repérés' : '{n} élément repéré', {n: found.length}));
        }
        /* ─── 🧩 le gabarit (heritage-transcribe-gabarit.js) : les cases de la sorte d'acte, remplies par Repérer, jamais une case ✓ ou écrite écrasée ─── */
        const GB = () => (ext.txGabarit && ext.txGabarit.mode() === 'gabarit' ? ext.txGabarit : null);
        let gabTab = 'found';
        const kindNow = () => $('[data-tx="kind"]').value;
        function fillGabarit(src) {
            const g = GB(); if (!g || !g.has(kindNow())) return;
            const next = g.fill(t.data.gabarit, kindNow(), lastExtract, src ?? findText());
            if (JSON.stringify(next) !== JSON.stringify(t.data.gabarit || null)) { t.data.gabarit = next; touch(); }
        }
        const gabWhere = s0 => { const r = pageRef(s0); return r ? i18n('page {n}, l. {line}', {n: r.n, line: r.line}) : i18n('l. {n}', {n: area.value.slice(0, s0).split('\n').length}); };
        function paintGabarit() { const box = $('[data-gab-box]'); if (box) GB()?.render(box, {gab: t.data.gabarit, kind: kindNow(), guess: lastExtract?.kind, where: gabWhere, top: kindNow() === 'notoriete' && ext.txCtx ? ext.txCtx.whyHtml(t.data.reason) : ''}); }
        function gabCount() { const g = GB(), el = $('[data-gab-count]'); if (!g || !el || !g.has(kindNow())) return; const F = g.fieldsOf(kindNow(), t.data.gabarit), f = t.data.gabarit?.fields || {};
            el.textContent = i18n('Cases remplies : {a}/{b} · vérifiées : {c}', {a: F.filter(([k]) => f[k]?.v).length, b: F.length, c: F.filter(([k]) => f[k]?.ok).length}); }
        function gabField(k) { const g = t.data.gabarit = (t.data.gabarit && t.data.gabarit.kind === kindNow()) ? t.data.gabarit : {kind: kindNow(), fields: {}}; g.fields = g.fields || {}; return g; }
        /** le texte à trous d'avant (« Coller le texte à trous » dans le menu ⋯, ou le réglage « Modèle d'acte : texte à trous ») */
        async function pasteTemplate() { const tp = TEMPLATES[$('[data-tx="kind"]').value]; if (!tp) return toast(i18n('Pas de modèle pour ce genre d’acte.'), 'error'); const sgT = multiPages() ? PG.segments(area.value)[segIx()] : null; if ((sgT ? area.value.slice(sgT.s, sgT.e) : area.value).trim() && !await A().confirmBox(i18n('Le texte déjà écrit est gardé.'), {title: i18n('Ajouter le modèle à la fin du texte ?'), okLabel: i18n('Ajouter le modèle')})) return; if (multiPages()) { const sg = PG.segments(area.value)[segIx()]; if (sg) { snap(); spliceText(sg.e, sg.e, (area.value.slice(sg.s, sg.e).trim() ? '\n\n' : '') + tp); area.dispatchEvent(new Event('input')); return; } } // 📑 dans la page affichée
                area.value += (area.value.trim() ? '\n\n' : '') + tp; area.dispatchEvent(new Event('input')); return; }
        /** « ＋ Ajouter une case » : une case à toi, dans cet acte seulement (pour toute la sorte : « 🧩 Mes gabarits… ») */
        function gabAddCase() {
            const inp = $('[data-gab-newlabel]'), label = String(inp?.value || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!label) { inp?.focus(); return; }
            const g = gabField(), taken = new Set(ext.txGabarit.fieldsOf(kindNow(), g).map(x => x[0])), key = ext.txGabarit.uniqueKey(label, taken);
            snap(); g.extra = [...(g.extra || []), {key, label}].slice(0, 20); touch(); paintGabarit(); $(`[data-gab-field="${key}"]`)?.focus();
        }
        /** « 🧩 Mes gabarits… » : pour une sorte d'acte, montrer ou masquer les cases prêtes, et ajouter les siennes (gardé sur cet ordinateur) */
        function openMesGabarits() {
            const G2 = ext.txGabarit; let kind = G2.KIND_NAME[kindNow()] ? kindNow() : 'bapteme';
            const d = ext.openDialog({eyebrow: i18n('GABARITS'), title: `🧩 ${i18n('Mes gabarits')}`, body: '<div class="h-gab-mine" data-gab-mine></div>'});
            const box = d.querySelector('[data-gab-mine]');
            const paint = () => { const P = G2.perso(), mine = P[kind] || {}, hide = new Set(mine.hide || []);
                box.innerHTML = `<label class="h-gab-mk">${esc(i18n('Sorte d’acte'))} <select data-gab-mkind>${Object.entries(G2.KIND_NAME).map(([k, l]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
                    <p class="muted">${esc(i18n('Les cases cochées se montrent dans le gabarit de chaque acte de cette sorte. Gardé sur cet ordinateur.'))}</p>
                    <ul class="h-gab-mlist">${(G2.G[kind] || []).map(([k, l]) => `<li><label><input type="checkbox" data-gab-mshow="${k}" ${hide.has(k) ? '' : 'checked'}> ${esc(i18n(l))}</label></li>`).join('')}
                    ${(mine.add || []).map(x => `<li><label><input type="checkbox" checked disabled> ${esc(x.label)}</label> <button type="button" class="icon-button small" data-gab-mdel="${esc(x.key)}" title="${esc(i18n('Retirer cette case'))}" aria-label="${esc(i18n('Retirer cette case'))}">×</button></li>`).join('')}</ul>
                    <div class="h-gab-addrow"><input type="text" data-gab-mnew maxlength="60" placeholder="${esc(i18n('Nom de la case (ex. Profession du parrain)'))}" aria-label="${esc(i18n('Nom de la case'))}" spellcheck="false" autocomplete="off"><button type="button" class="button small" data-gab-madd>＋ ${esc(i18n('Ajouter une case'))}</button></div>`; };
            const save = fn => { const P = G2.perso(); P[kind] = P[kind] || {add: [], hide: []}; fn(P[kind]); G2.setPerso(P); paint(); paintGabarit(); };
            const add = () => { const inp = box.querySelector('[data-gab-mnew]'), label = String(inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!label) return inp.focus();
                save(m => { const taken = new Set([...(G2.G[kind] || []).map(x => x[0]), ...(m.add || []).map(x => x.key)]); m.add = [...(m.add || []), {key: G2.uniqueKey(label, taken), label}].slice(0, 30); }); box.querySelector('[data-gab-mnew]')?.focus(); };
            box.addEventListener('change', e => { if (e.target.matches('[data-gab-mkind]')) { kind = e.target.value; paint(); return; }
                const k = e.target.dataset.gabMshow; if (k) save(m => { const h = new Set(m.hide || []); if (e.target.checked) h.delete(k); else h.add(k); m.hide = [...h]; }); });
            box.addEventListener('click', e => { if (e.target.closest('[data-gab-madd]')) return add();
                const del = e.target.closest('[data-gab-mdel]'); if (!del) return; const k = del.dataset.gabMdel, before = (G2.perso()[kind]?.add || []).slice();
                save(m => { m.add = (m.add || []).filter(x => x.key !== k); });
                A().undoToast?.(i18n('Case retirée'), {undo: () => save(m => { m.add = before; })}); });
            box.addEventListener('keydown', e => { if (e.target.matches('[data-gab-mnew]') && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } });
            paint();
        }
        /** « ⤓ Tableur » : tous les actes d'une sorte, une ligne par acte, une colonne par case (relevé de paroisse) */
        async function gabSheet(kind) {
            const G2 = ext.txGabarit; flushCommit(); if (dirty) await save();
            let items = []; try { items = (await api('act_gabarits', {kind})).items || []; } catch (e) { return toast(e.message, 'error'); }
            if (!items.length) return toast(i18n('Aucun acte de cette sorte pour l’instant.'));
            const cols = []; const seen = new Set(); const addCol = (k, l) => { if (!seen.has(k)) { seen.add(k); cols.push([k, l]); } };
            G2.fieldsOf(kind, null).forEach(([k, l]) => addCol(k, l));
            items.forEach(it => (it.gabarit?.extra || []).forEach(x => addCol(x.key, x.label)));
            const cell = v => (A().csvCell ? A().csvCell(v, {sep: ';', quote: 'always'}) : `"${String(v ?? '').replace(/"/g, '""')}"`);
            const head = [i18n('Titre'), i18n('Date'), i18n('Lieu'), i18n('Source'), ...cols.map(c => c[1])];
            const rows = items.map(it => [it.title, it.date_text, it.place, it.source, ...cols.map(([k]) => it.gabarit?.fields?.[k]?.v || '')]);
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
            a.download = `${A().safeExportFilename ? A().safeExportFilename(`${i18n(G2.KIND_NAME[kind] || 'Autre')} ${i18n('gabarits')}`, 'gabarits') : 'gabarits'}.csv`; /* sans accents : sinon le navigateur l'appelle « download » */ document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                        toast(i18n('Tableur : {x}', {x: plural(items.length, 'acte')}));
        }
        function gabMenu(at) {
            const g = GB() || ext.txGabarit, m = g.mode(), set = v => { g.setMode(v); paintPeople(); };
            UI.menuAt?.(at, [
                {icon: m === 'gabarit' ? '✓' : '', label: i18n('🧩 Gabarit à cases (conseillé)'), run: () => set('gabarit')},
                {icon: m === 'texte' ? '✓' : '', label: i18n('Texte à trous (comme avant)'), run: () => set('texte')},
                '-', {icon: '🧭', label: i18n('Remplir à nouveau'), run: () => runDetect()},
                {icon: '🧩', label: i18n('Mes gabarits…'), run: () => openMesGabarits()},
                {icon: '⤓', label: i18n('Tableur de tous les actes « {x} »', {x: i18n(g.KIND_NAME[kindNow()] || 'Autre')}), run: () => gabSheet(kindNow())},
                {icon: '📝', label: i18n('Coller le texte à trous'), run: () => pasteTemplate()},
            ], {title: i18n('Modèle d’acte')});
        }
        /** garder une personne de « Ce que l'app a trouvé » ; sur toutes les pages (un texte par page) : une mention sur la page affichée */
        function keepAt(f, pid, all) {
            if (!all) return keep({label: f.label, role: f.role, s: f.s, e: f.e}, pid);
            const st0 = perCombo.starts[pageIx], en0 = st0 + area.value.length, m = [[f.s, f.e], ...(f.mentions || [])].find(q => q[0] >= st0 && q[1] <= en0);
            if (!m) { if (Date.now() - perWarnAt > 1500) { perWarnAt = Date.now(); toast(i18n('« {name} » est sur une autre page : ouvre sa page pour le garder.', {name: f.label})); } return; }
            keep({label: f.label, role: f.role, s: m[0] - st0, e: m[1] - st0}, pid);
        }
        const keep = (f, personId = 0) => { if (t.data.people.some(p => p.s === f.s && p.e === f.e)) { if (personId) t.data.people.find(p => p.s === f.s && p.e === f.e).person_id = personId; } else t.data.people.push({name: f.label, role: f.role || '', person_id: personId, s: f.s, e: f.e}); touch(); paintPeople(); };
        function linkPerson(i) {
            const p = t.data.people[i];
            ext.openDialog({eyebrow: 'TRANSCRIPTION', title: i18n('Relier « {name} » à une fiche', {name: p.name}), submitLabel: i18n('Relier'),
                body: `<div class="h-pk-solo"><span class="pk-lab">${i18n('Personne')}</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'tx_pick', kind: 'person', value: p.person_id || null})}</div>`,
                onOpen: dg => { const q = dg.querySelector('.pk-search:not([hidden]) .pk-input'); if (!q) return; q.value = p.name; setTimeout(() => { q.focus(); q.dispatchEvent(new Event('input', {bubbles: true})); }, 30); }, // les fiches du nom lu s’affichent tout de suite
                onSubmit: f => { const chosen = Number(f.elements.tx_pick?.value) || 0; if (!chosen) return window.LCNDA_UI.fail(f.elements.tx_pick, i18n('Choisis une fiche.')); p.person_id = chosen; touch(); paintPeople(); }});
        }
        $('[data-tx-found]').addEventListener('input', e => {
            const k = e.target.dataset?.gabField; if (!k) return; const g = gabField(), f = g.fields[k] = g.fields[k] || {v: '', s: -1, e: -1};
            f.v = e.target.value.slice(0, 300); f.own = !!f.v; f.ok = false; if (!f.v) delete g.fields[k];
            e.target.className = `h-gab-v ${!f.v ? 'is-empty' : 'is-own'}`; touch(); gabCount();
        });
        $('[data-tx-found]').addEventListener('keydown', e => {
            if (e.target.matches?.('[data-gab-newlabel]') && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); return gabAddCase(); }
            const k = e.target.dataset?.gabField; if (!k || e.key !== 'Enter') return; e.preventDefault(); e.stopPropagation();
            const g = gabField(), f = g.fields[k]; if (f?.v) { snap(); f.ok = true; touch(); }
            paintGabarit(); const all = [...dlg.querySelectorAll('[data-gab-field]')], i = all.findIndex(x => x.dataset.gabField === k); (all[i + 1] || all[i])?.focus();
        });
        $('[data-tx-found]').addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            // 🧩 le gabarit : onglets, ✓ vérifié, la sorte devinée, le menu ⋯
            if (d.gabTab) { gabTab = d.gabTab; if (gabTab === 'gab') { fillGabarit(); } paintPeople(); return; }
            if (d.gabOk) { const g = gabField(); const f = g.fields[d.gabOk]; if (!f?.v) return; snap(); f.ok = true; touch(); paintGabarit(); $(`[data-gab-field="${d.gabOk}"]`)?.focus(); return; }
            if (d.gabKind) { const sel = $('[data-tx="kind"]'); if (sel && [...sel.options].some(o => o.value === d.gabKind)) { sel.value = d.gabKind; sel.dispatchEvent(new Event('change', {bubbles: true})); } return; }
            if ('gabMenu' in d) return gabMenu(b);
            if ('gabAdd' in d) { const r = $('[data-gab-addrow]'); if (r) { r.hidden = !r.hidden; if (!r.hidden) r.querySelector('input')?.focus(); } return; }
            if ('gabAddok' in d) return gabAddCase();
            if (d.gabDel) { const g = gabField(), k = d.gabDel, before = {extra: (g.extra || []).slice(), f: g.fields[k] ? {...g.fields[k]} : null};
                snap(); g.extra = (g.extra || []).filter(x => x.key !== k); delete g.fields[k]; touch(); paintGabarit();
                A().undoToast?.(i18n('Case retirée'), {undo: () => { const h = gabField(); h.extra = before.extra; if (before.f) h.fields[k] = before.f; touch(); paintGabarit(); }}); return; }
            if (d.txLookword) return ext.readingAid?.open({q: d.txLookword, lang: aideLang($('[data-tx-lang]').value)});
            if (d.txGoto && d.txGoto[0] === 'p') { const [i, s, en] = d.txGoto.slice(1).split(':').map(Number); if (i !== pageIx) return void goPage(i, {goto: {s, e: en}}); return gotoRange(s, en); } // 📑 un texte par page : l'acte de l'autre page
            if (d.txGoto) { const [s, en] = d.txGoto.split(':').map(Number); return gotoRange(s, en); }
            if (d.txKeep) return keep(found[Number(d.txKeep)]);
            if (d.txKeepall !== undefined) { found.filter(f => f.type === 'person').forEach(f => keep(f)); return; }
            if (d.txMatch) { const [fi, pid] = d.txMatch.split(':').map(Number); keep(found[fi], pid); toast(i18n('Personne gardée et reliée à sa fiche.')); return; }
            if (d.txSetdate) { t.date_text = d.txSetdate; $('[data-tx="date_text"]').value = d.txSetdate; touch(); return; }
            if (d.txSetplace) { t.place = d.txSetplace; $('[data-tx="place"]').value = d.txSetplace; touch(); return; }
            if (d.txPlink) return linkPerson(Number(d.txPlink));
            if (d.txPunlink) { t.data.people[Number(d.txPunlink)].person_id = 0; touch(); paintPeople(); return; }
            if (d.txPdel) { t.data.people.splice(Number(d.txPdel), 1); touch(); paintPeople(); return; }
            if (d.txPopen) { if (dirty && !await A().confirmBox(i18n('La transcription non enregistrée sera perdue (💾 d’abord).'), {title: i18n('Ouvrir la fiche ?'), okLabel: i18n('Ouvrir sans enregistrer'), danger: true})) return; teardown(); A().openPersonById?.(Number(d.txPopen)); }
        });
        $('[data-tx-found]').addEventListener('change', e => { const s = e.target.closest('[data-tx-prole]'); if (s) { t.data.people[Number(s.dataset.txProle)].role = s.value; touch(); } });
        /* ─── lecture automatique ─── */
        /** l'image pour la lecture (gris) ou l'export (couleurs) : améliorée (« Mieux voir », pleine taille) si c'est choisi dans « Plus ▾ ».
         *  Sans redressement ni miroir : les zones posées par la lecture restent en pixels de l'image. */
        async function filteredCanvas({gray = true, enhanced = useEnh()} = {}) {
            const v = t.data.view;
            if (!imgW || !imgH) throw new Error(i18n('Image de l’acte illisible.'));
            let i = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error(i18n('Image de l’acte illisible.'))); im.src = origSrc(); });
            if (enhanced && TV.needsPixels(v) && getEnh().ok) { srcEl = srcEl || i; if (!await ensureSource()) throw new Error(i18n('« Mieux voir » : cette image n’a pas pu être préparée.')); i = await createImageBitmap(await enh.full(v)); }
            const c = document.createElement('canvas'); c.width = imgW; c.height = imgH; const g = c.getContext('2d');
            const css = enhanced && !TV.needsPixels(v) ? TV.cssFilter(v) : '';
            g.filter = `${css}${gray ? ' grayscale(1)' : ''}`.trim() || 'none'; g.drawImage(i, 0, 0, imgW, imgH); return c;
        }
        const viewChanged = () => Object.entries(TV.DEFAULT_VIEW).some(([k, d]) => k !== 'rot' && k !== 'tilt' && k !== 'mirror' && String(t.data.view[k]) !== String(d));
        async function runOcr() {
            if (!t.filename) return toast(i18n('Choisis d’abord l’image de l’acte.'), 'error');
            const lang = $('[data-tx-lang]').value; status(i18n('Chargement du lecteur…'));
            try {
                const T = await A().loadOcrEngine(); status(i18n('Lecture de l’image…'));
                const r = await T.recognize(await filteredCanvas(), lang);
                const dd = r?.data || {}, lines = (dd.lines?.length ? dd.lines : (dd.blocks || []).flatMap(bl => (bl.paragraphs || []).flatMap(pg => pg.lines || []))).filter(l => (l.text || '').trim() && l.bbox && !skipped({x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0}));
                if (!lines.length) { const plain = String(dd.text || '').trim(); if (plain) keepReading(plain, 'ocr', lang, {img: readImg(), part: 'page'}); if (!plain) { status(''); return toast(i18n('Aucun texte lu sur cette image (essaie le contraste, ou « Lire (manuscrit) »).'), 'error'); }
                    appendRead(plain); before = area.value; t.body = area.value; touch(); paintMirror(); status(i18n('Texte lu (à relire)')); return; }
                keepReading(lines.map(l => l.text.replace(/\s+$/, '')).join('\n'), 'ocr', lang, {img: readImg(), part: 'page'}); // ⚖️
                let text = area.value; if (text.trim()) text += '\n\n'; const start = text.length;
                const made = [];
                lines.forEach(l => { const s = text.length, line = l.text.replace(/\s+$/, ''); text += line + '\n'; const b = l.bbox; made.push({id: zid(), x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, s, e: s + line.length, note: '', c: '', src: 'ocr'}); });
                putRead(text, made);
                status(i18n(lines.length > 1 ? '{n} lignes lues (à relire)' : '{n} ligne lue (à relire)', {n: lines.length})); toast(i18n('Texte lu et zones posées ligne par ligne : relis et corrige.')); void start;
            } catch (e) { status(''); toast(e.message || 'Lecture impossible.', 'error'); }
        }
        /* ─── ✨ Lire l'acte (écriture à la main) : en arrière-plan, puis le texte proposé ligne par ligne à relire ─── */
        let htrJob = null; // {id, timer, t0}
        const HTR_MODEL_KEY = 'genealogie-htr-model', UNSURE = .75;
        const htrRunEl = () => $('[data-tx-htrrun]');
        function htrBusy(on, text = '') { const el = htrRunEl(); if (!el) return; el.hidden = !on; if (on) el.querySelector('.ui-spinner > span:last-child').textContent = text; $('[data-tx-cmd="htr"]').disabled = on; }
        function htrStop(silent = false) { if (!htrJob) return; clearTimeout(htrJob.timer); const id = htrJob.id, then = htrJob.then; htrJob = null; then?.(false); htrBusy(false); if (id) post('htr_read_cancel', {id}).catch(() => {}); if (!silent) status(i18n('Lecture arrêtée')); }
        /** la zone choisie (en pixels de l'image), sinon toute la page */
        const htrArea = () => { const z = t.data.zones.find(q => q.id === selZone); return z && z.w > 8 && z.h > 8 ? {x: Math.max(0, Math.round(z.x)), y: Math.max(0, Math.round(z.y)), w: Math.round(z.w), h: Math.round(z.h)} : null; };
        /* ─── A : recadrer sur le texte avant la lecture (heritage-transcribe-acte.js) ─── */
        let cropFor = '', cropBox = null, cropChoice = ''; // la zone du document, calculée une fois par image ; le choix fait (« crop » / « full »)
        const loadSrcImg = () => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(i18n('Image de l’acte illisible.'))); i.src = origSrc(); });
        async function docCrop() { if (cropFor !== t.filename) { cropFor = t.filename; cropChoice = ''; try { cropBox = ext.txActe?.detectCrop(await loadSrcImg()) || null; } catch (_) { cropBox = null; } } return cropBox; }
        /** les zones dessinées à la main (pas celles posées par une lecture) : on ne lit qu'elles, le reste de l'image en blanc */
        const handZones = () => { const z = t.data.zones.filter(q => onHere(q) && !q.src && q.w > 8 && q.h > 8); return z.length && z.length <= 12 ? z : []; };
        /** la zone à lire quand rien n'est choisi : les zones dessinées, sinon le document recadré (après la question A si c'est une capture d'écran) */
        async function pageArea({ask = true, force = false} = {}) {
            const hz = handZones();
            if (hz.length) { const x0 = Math.max(0, Math.min(...hz.map(z => z.x))), y0 = Math.max(0, Math.min(...hz.map(z => z.y))), x1 = Math.min(imgW, Math.max(...hz.map(z => z.x + z.w))), y1 = Math.min(imgH, Math.max(...hz.map(z => z.y + z.h)));
                return {x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), mask: hz.map(z => ({x: Math.round(z.x), y: Math.round(z.y), w: Math.round(z.w), h: Math.round(z.h)}))}; }
            const b = await docCrop(); if (!b) return null;
            if (force) return {x: b.x, y: b.y, w: b.w, h: b.h};
            if (!b.screenshot) return b.ratio < .97 ? {x: b.x, y: b.y, w: b.w, h: b.h} : null; // de petits bords : coupés sans rien demander
            if (!cropChoice && ask) { cropChoice = await ext.txActe.askCrop(await loadSrcImg(), b) || ''; if (!cropChoice) return false; }
            return cropChoice === 'crop' ? {x: b.x, y: b.y, w: b.w, h: b.h} : null;
        }
        /** l'image de la zone (ou de toute la page), en PNG base64 — pour la lecture approfondie. mode (🖼 choisi dans sa fenêtre) :
         *  'orig' l'image d'origine, 'mine' avec « Mieux voir », 'auto' l'origine améliorée doucement (heritage-transcribe-acte.js autoEnhance) ;
         *  sans mode : comme « Lire et exporter l'image améliorée ». Une copie en mémoire : le fichier de l'acte n'est jamais touché. */
        async function areaB64(box, {max = 0, mode = ''} = {}) {
            const full = await filteredCanvas(mode ? {gray: false, enhanced: mode === 'mine'} : {gray: false}); let c = full;
            if (box) { c = document.createElement('canvas'); c.width = Math.max(1, Math.min(box.w, imgW - box.x)); c.height = Math.max(1, Math.min(box.h, imgH - box.y)); const g = c.getContext('2d');
                if (box.mask) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); box.mask.forEach(z => g.drawImage(full, z.x, z.y, z.w, z.h, z.x - box.x, z.y - box.y, z.w, z.h)); } else g.drawImage(full, box.x, box.y, c.width, c.height, 0, 0, c.width, c.height); }
            if (max && Math.max(c.width, c.height) > max) { const k = max / Math.max(c.width, c.height), r = document.createElement('canvas'); r.width = Math.round(c.width * k); r.height = Math.round(c.height * k); r.getContext('2d').drawImage(c, 0, 0, r.width, r.height); c = r; }
            if (mode === 'auto' && ext.txActe?.autoEnhance) c = ext.txActe.autoEnhance(c, {target: 2000, max});
            const b = await new Promise(r2 => c.toBlob(r2, 'image/png'));
            return new Promise(r2 => { const fr = new FileReader(); fr.onload = () => r2(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); });
        }
        async function runHtr({model = '', zone, then} = {}) { // then(true | false) : seulement le découpage en lignes (▤), sans la fenêtre de relecture
            const bail = v => { then?.(false); if (!then) readQ = null; return v; };
            if (!t.media_id) return bail(toast(i18n('Choisis d’abord l’image de l’acte.'), 'error'));
            if (htrJob) return bail(toast(i18n('Une lecture est déjà en cours.'), 'error'));
            if (A().mediaLimits?.tooBig(imgW, imgH)) return bail(); // 📎 trop de points pour être lue sans saturer la mémoire (le message le dit)
            let st; try { st = await api('htr_setup_status'); } catch (e) { return bail(toast(e.message, 'error')); }
            const installed = (st.models || []).filter(m => m.present);
            if (!st.ready || !installed.length) return bail(), toast(i18n('La lecture d’écriture manuscrite n’est pas encore installée : Réglages → Reconnaissance d’écriture (HTR) (une seule fois, l’assistant explique tout).'), 'error');
            let pick = model; if (!pick) { try { pick = localStorage.getItem(HTR_MODEL_KEY) || ''; } catch (_) {} }
            if (!installed.some(m => m.file === pick)) pick = (installed.find(m => m.recommended) || installed[0]).file;
            let box = zone === undefined ? htrArea() : zone;
            if (zone === undefined && !box) { box = await pageArea(); if (box === false) return bail(); } // A : capture d'écran → recadrer sur le texte ?
            htrBusy(true, box && !box.mask && zone !== undefined ? i18n('Lecture de la zone…') : i18n('Lecture de l’acte…')); status('');
            try {
                const body = {media_id: curPid(), model_file: pick, language: $('[data-tx-lang]').value};
                if (box || (useEnh() && viewChanged())) { // la zone découpée, et/ou l'image améliorée (« Mieux voir »)
                    const full = await filteredCanvas(); let c = full;
                    if (box) { c = document.createElement('canvas'); c.width = Math.min(box.w, imgW - box.x); c.height = Math.min(box.h, imgH - box.y); const g = c.getContext('2d');
                        if (box.mask) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); box.mask.forEach(z => g.drawImage(full, z.x, z.y, z.w, z.h, z.x - box.x, z.y - box.y, z.w, z.h)); } // seulement les zones dessinées
                        else g.drawImage(full, box.x, box.y, c.width, c.height, 0, 0, c.width, c.height); }
                    const b = await new Promise(r2 => c.toBlob(r2, 'image/png'));
                    body.image_b64 = await new Promise(r2 => { const fr = new FileReader(); fr.onload = () => r2(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); });
                }
                const r = await post('htr_read_start', body);
                htrJob = {id: r.result.id, t0: Date.now(), timer: 0, then};
                const poll = async () => {
                    if (!htrJob || !dlg.isConnected) return;
                    let j; try { j = await api('htr_read_job', {id: htrJob.id}); } catch (e) { htrJob = null; htrBusy(false); return bail(toast(e.message, 'error')); }
                    if (!htrJob) return;
                    if (j.state === 'running') { htrBusy(true, `${box ? i18n('Lecture de la zone') : i18n('Lecture de l’acte')}… ${j.elapsed} s`); htrJob.timer = setTimeout(poll, 1200); return; }
                    htrJob = null; htrBusy(false);
                    if (j.state === 'error') return bail(toast(j.error || i18n('La lecture n’a pas abouti.'), 'error'));
                    if (j.state !== 'done') return bail();
                    const ox = box?.x || 0, oy = box?.y || 0; // ▤ la lecture rapide gardée pour relier plus tard les lignes d'un autre texte
                    htrCache = {file: t.filename, lines: (j.lines || []).map(l => (Array.isArray(l.bbox) ? {...l, bbox: [l.bbox[0] + ox, l.bbox[1] + oy, l.bbox[2] + ox, l.bbox[3] + oy]} : l))};
                    if (then) { htrBusy(false); return then(true); }
                    try { localStorage.setItem(HTR_MODEL_KEY, j.model_file || pick); } catch (_) {}
                    if (!(j.lines || []).length) { setTimeout(() => readNext(true), 60); } if (!(j.lines || []).length) return toast(i18n('Aucune ligne d’écriture trouvée : essaie « 🎚️ Mieux voir » (contraste), ou une zone plus serrée.'), 'error');
                    keepReading((j.lines || []).map(l => l.text || '').join('\n'), 'htr', j.model_file || pick, {img: readImg(), part: box ? 'zone' : 'page'}); // ⚖️ la lecture gardée, même si elle n'est pas mise dans le texte
                    htrReview(j.lines, box, j.model_file || pick, installed);
                };
                htrJob.timer = setTimeout(poll, 700);
            } catch (e) { htrJob = null; htrBusy(false); bail(); toast(e.message || 'Lecture impossible.', 'error'); }
        }
        /** Les lignes lues, à côté de leur morceau d'image ; les mots peu sûrs surlignés ; on corrige, puis on met dans le texte */
        async function htrReview(lines, box, modelFile, installed) {
            const ox = box?.x || 0, oy = box?.y || 0;
            lines = lines.filter(l => !l.bbox || !skipped({x: l.bbox[0] + ox, y: l.bbox[1] + oy, w: l.bbox[2] - l.bbox[0], h: l.bbox[3] - l.bbox[1]})); // ⛔ zones à ne pas lire
            let im = null; try { im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = origSrc(); }); } catch (_) {}
            const crop = b => { if (!im || !b) return ''; const [x0, y0, x1, y1] = b, w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), k = Math.min(1, 52 / h, 900 / w); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k)); c.getContext('2d').drawImage(im, x0 + ox, y0 + oy, w, h, 0, 0, c.width, c.height); try { return c.toDataURL('image/jpeg', .85); } catch (_) { return ''; } };
            const pct = c => Math.round(c * 100);
            // 🪄 les corrections proposées : un mot souligné en violet (une autre couleur que « peu sûr »), jamais changé tout seul
            const FX = window.LCNDA_HTRFIX, fxLang = $('[data-tx-lang]').value, fxPlace = $('[data-tx="place"]').value;
            let lex = null; if (FX) { try { lex = await fixLexicon(fxLang, fxPlace); } catch (_) { lex = null; } }
            const wordsOf = l => (l.words?.length ? l.words : String(l.text || '').split(/\s+/).map(w => ({t: w, c: null}))).filter(w => w.t);
            const lineText = l => wordsOf(l).map(w => w.t).join(' ');
            let fixSeq = 0; const fixMap = new Map(), kept = new Set(); // kept : les mots « gardés tels quels » (pas reproposés)
            const fixesFor = (text, ws) => { if (!lex || !fixOn()) return []; const spans = []; let o = 0; ws.forEach(w => { spans.push({s: o, e: o + w.t.length, c: w.c}); o += w.t.length + 1; });
                const at = (a, b) => spans.find(x => a >= x.s && b <= x.e);
                return FX.propose(text, lex, {level: fixLevel(), keep: kept, unsure: (a, b) => { const x = at(a, b); return !!(x && x.c != null && x.c < UNSURE); }, sure: (a, b) => { const x = at(a, b); return !!(x && x.c != null && x.c >= .95); }}); };
            const fixSpan = (fx, inner) => { const id = 'f' + (++fixSeq); fixMap.set(id, fx); return `<span class="h-htr-fix${fx.sure ? ' is-sure' : ''}" data-fx="${id}" title="${esc(i18n('Correction proposée : « {x} » — clique pour choisir', {x: fx.props[0].value}))}">${inner}</span>`; };
            /** une ligne : les mots peu sûrs surlignés, les corrections soulignées ; textNow : le texte déjà corrigé à la main (sans les mots peu sûrs) */
            const lineHtml = (l, textNow = null) => {
                const ws = textNow == null || textNow === lineText(l) ? wordsOf(l) : textNow.split(/\s+/).filter(Boolean).map(t2 => ({t: t2, c: null}));
                const fixes = fixesFor(ws.map(w => w.t).join(' '), ws); let o = 0;
                return ws.map(w => { const s0 = o; o += w.t.length + 1; let inner = '', q = 0;
                    fixes.filter(f => f.s >= s0 && f.e <= s0 + w.t.length).forEach(f => { inner += esc(w.t.slice(q, f.s - s0)) + fixSpan(f, esc(w.t.slice(f.s - s0, f.e - s0))); q = f.e - s0; });
                    inner += esc(w.t.slice(q));
                    return w.c != null && w.c < UNSURE ? `<mark class="h-htr-unsure" title="${esc(i18n('Sûr à {x} % — clique pour le corriger', {x: pct(w.c)}))}">${inner}</mark>` : inner; }).join(' ');
            };
            const unsure = lines.reduce((n, l) => n + (l.words || []).filter(w => w.c != null && w.c < UNSURE).length, 0);
            const stats = window.LCNDA_TXACTE?.unsureStats(lines, UNSURE) || {low: false}; lastUnsure = unsure; // B : un texte peu sûr → recadrer, ou la lecture approfondie
            const name = f => installed.find(m => m.file === f)?.title || f;
            const dlgR = ext.openDialog({eyebrow: i18n('LECTURE AUTOMATIQUE · À RELIRE'), title: `✨ ${i18n('Le texte lu, ligne par ligne')}`, wide: true, submitLabel: `✓ ${i18n('Mettre {x} dans le texte', {x: lines.length > 1 ? i18n('les {n} lignes', {n: lines.length}) : i18n('la ligne')})}`,
                body: `<div class="h-htr-rev-head"><span>${A().plural ? A().plural(lines.length, 'ligne') : lines.length + ' lignes'} · ${unsure ? `<mark class="h-htr-unsure">${A().plural ? A().plural(unsure, 'mot peu sûr', 'mots peu sûrs') : unsure + ` ${i18n('mots peu sûrs')}`}</mark> ${i18n('(sûrs à moins de {x} %)', {x: pct(UNSURE)})}` : i18n('aucun mot peu sûr')}</span>
                    <label class="h-htr-rev-model">${i18n('Modèle')} <select data-htr-rmodel>${installed.map(m => `<option value="${esc(m.file)}" ${m.file === modelFile ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-htr-reread>↻ ${i18n('Relire avec ce modèle')}</button></div>
                    ${lex ? `<div class="h-htr-fixbar" data-htr-fixbar></div>` : ''}${stats.low && ext.txActe ? ext.txActe.lowNoticeHtml(stats) : ''}<ol class="h-htr-rev">${lines.map((l, i) => { const src = crop(l.bbox); return `<li data-i="${i}"><label class="checkbox-line h-htr-keep" title="${esc(i18n('Garder cette ligne'))}"><input type="checkbox" data-htr-keep checked></label>
                        <div class="h-htr-rev-body">${src ? `<img class="h-htr-crop" src="${src}" alt="${esc(i18n('Ligne {x} sur l’image', {x: i + 1}))}">` : `<span class="h-htr-crop is-none">${i18n('pas d’image pour cette ligne')}</span>`}
                        <div class="h-htr-line" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="Ligne ${i + 1}" data-htr-line>${lineHtml(l)}</div></div>
                        <small class="h-htr-conf ${l.conf != null && l.conf < UNSURE ? 'is-low' : ''}">${l.conf != null ? `${pct(l.conf)} %` : ''}</small></li>`; }).join('')}</ol>
                    <div class="h-htr-lx" data-htr-lx hidden></div><div class="h-htr-lx h-htr-known" data-htr-known hidden></div>
                    <p class="ui-hint">${i18n('Corrige directement dans les lignes (clique un mot surligné pour le remplacer) · Entrée : ligne suivante · décoche une ligne pour la laisser de côté. Lu par « {x} », sur cet ordinateur. Ensuite, « 🧭 Repérer » cherche tout seul les noms, dates et lieux.', {x: esc(name(modelFile))})}</p>`,
                onOpen: d => {
                    d.querySelector('.h-htr-line')?.focus();
                    // 🪄 corrections proposées : menu d'un mot, ✓ Accepter les sûres, ↶ Annuler, réglages
                    const fixBar = d.querySelector('[data-htr-fixbar]'), undo = [];
                    const lineEls = () => [...d.querySelectorAll('[data-htr-line]')];
                    const snap = () => lineEls().map(x => x.innerHTML), restore = sn => { lineEls().forEach((x, i) => { x.innerHTML = sn[i]; }); paintFixBar(); };
                    const unwrap = sp => { sp.replaceWith(document.createTextNode(sp.textContent)); };
                    const done = (sn, label) => { undo.push(sn); paintFixBar(); A().undoToast?.(label, {undo: () => { const k = undo.lastIndexOf(sn); if (k >= 0) undo.splice(k, 1); restore(sn); }}); };
                    const applyFix = (spans, values, label) => { const sn = snap(); spans.forEach((sp, i) => { sp.closest('.h-htr-unsure')?.classList.add('is-fixed'); sp.replaceWith(document.createTextNode(values[i])); }); done(sn, label); };
                    function paintFixBar() {
                        if (!fixBar) return;
                        const all = d.querySelectorAll('.h-htr-fix'), sure = d.querySelectorAll('.h-htr-fix.is-sure');
                        fixBar.innerHTML = `<span class="h-htr-fixn">🪄 ${fixOn() ? (all.length ? esc(A().plural ? A().plural(all.length, 'correction proposée', 'corrections proposées') : all.length) + ` <small class="muted">${esc(i18n('(soulignées en violet : clique un mot)'))}</small>` : esc(i18n('Aucune correction à proposer'))) : esc(i18n('Corrections proposées : non'))}</span>
                            ${sure.length ? `<button type="button" class="button small" data-fix-accept>✓ ${esc(sure.length > 1 ? i18n('Accepter les {n} propositions sûres', {n: sure.length}) : i18n('Accepter la proposition sûre'))}</button>` : ''}
                            <button type="button" class="button small secondary" data-fix-undo ${undo.length ? '' : 'disabled'} title="${esc(i18n('Annuler'))}">↶ ${esc(i18n('Annuler'))}</button><span class="spacer"></span>${fixSettingsHtml()}`;
                        bindFixSettings(fixBar, rerender);
                    }
                    async function rerender() { try { lex = FX ? await fixLexicon(fxLang, fxPlace) : null; } catch (_) {} d.querySelectorAll('.h-htr-rev > li').forEach(li => { const el = li.querySelector('[data-htr-line]'); el.innerHTML = lineHtml(lines[Number(li.dataset.i)], el.textContent.replace(/\s+/g, ' ').trim()); }); paintFixBar(); }
                    paintFixBar();
                    fixBar?.addEventListener('click', e => {
                        if (e.target.closest('[data-fix-accept]')) { const sp = [...d.querySelectorAll('.h-htr-fix.is-sure')]; if (!sp.length) return; applyFix(sp, sp.map(x => fixMap.get(x.dataset.fx)?.props[0].value || x.textContent), A().plural ? A().plural(sp.length, 'proposition sûre acceptée', 'propositions sûres acceptées') : String(sp.length)); return; }
                        if (e.target.closest('[data-fix-undo]')) { const sn = undo.pop(); if (sn) restore(sn); }
                    });
                    d.addEventListener('click', e => {
                        const sp = e.target.closest('.h-htr-fix'); if (!sp || !sp.closest('[data-htr-line]')) return;
                        const fx = fixMap.get(sp.dataset.fx); if (!fx) return;
                        e.preventDefault(); e.stopPropagation();
                        fixMenu(sp, fx, {apply: v => applyFix([sp], [v], `« ${fx.word} » → « ${v} »`),
                            keep: () => { const sn = snap(); unwrap(sp); kept.add(fx.word); done(sn, i18n('« {w} » gardé tel quel', {w: fx.word})); },
                            addLex: () => { const sn = snap(); addToLexicon(fx.word, undone => { if (undone) { restore(sn); return; } d.querySelectorAll('.h-htr-fix').forEach(x => { if (FX.norm(fixMap.get(x.dataset.fx)?.word) === FX.norm(fx.word)) unwrap(x); }); paintFixBar(); }); }});
                    }, true);
                    d.addEventListener('input', e => { const s2 = getSelection(), sp = s2.anchorNode?.parentElement?.closest?.('.h-htr-fix'); if (sp && e.target.closest('[data-htr-line]')) { unwrap(sp); paintFixBar(); } });
                    d.addEventListener('click', e => { const mk = e.target.closest('.h-htr-unsure'); if (mk && mk.closest('[data-htr-line]')) { const r = document.createRange(); r.selectNodeContents(mk); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } });
                    d.addEventListener('input', e => { const ln = e.target.closest('[data-htr-line]'); if (!ln) return; const s = getSelection(), mk = s.anchorNode?.parentElement?.closest?.('.h-htr-unsure'); if (mk) mk.classList.add('is-fixed'); });
                    d.addEventListener('paste', e => { const ln = e.target.closest('[data-htr-line]'); if (!ln) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ')); });
                    d.addEventListener('keydown', e => { const ln = e.target.closest('[data-htr-line]'); if (!ln || e.key !== 'Enter') return; e.preventDefault(); const all = [...d.querySelectorAll('[data-htr-line]')], nx = all[all.indexOf(ln) + (e.shiftKey ? -1 : 1)]; if (nx) { nx.focus(); const r = document.createRange(); r.selectNodeContents(nx); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } else d.querySelector('[type=submit]')?.focus(); });
                    d.querySelector('[data-htr-reread]').addEventListener('click', () => { const m = d.querySelector('[data-htr-rmodel]').value; d.close(); runHtr({model: m, zone: box || null}); });
                    d.querySelector('[data-txa-recrop]')?.addEventListener('click', async () => { const m = d.querySelector('[data-htr-rmodel]').value; d.close(); cropChoice = 'crop'; const b = await pageArea({force: true}); runHtr({model: m, zone: b || null}); });
                    d.querySelector('[data-txa-deep]')?.addEventListener('click', () => { const txt = [...d.querySelectorAll('[data-htr-line]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'); d.close(); openDeep({htrText: txt, box}); });
                    // 📜 les mots connus de la langue choisie (allemand, latin, grec…), avec leur traduction : aide à relire
                    const lg = aideLang($('[data-tx-lang]').value), kBox = d.querySelector('[data-htr-known]');
                    const drawKnown = () => { if (!lg || !kBox) return; const kw = window.LCNDA_AIDE_LECTURE?.known?.([...d.querySelectorAll('[data-htr-line]')].map(x => x.textContent).join('\n'), lg) || [];
                        kBox.hidden = !kw.length; kBox.innerHTML = kw.length ? `<h4>📜 Mots connus (${esc(langName(lg).toLowerCase())})</h4><ul>${kw.slice(0, 16).map(w => `<li><b>${esc(w.word)}</b> = ${esc(w.item.d)} <button type="button" class="link-button" data-htr-aide="${esc(String(w.item.t).split(',')[0].trim())}">↗ ${i18n('Aide')}</button></li>`).join('')}</ul>` : ''; };
                    drawKnown(); d.addEventListener('input', e => { if (e.target.closest('[data-htr-line]')) { clearTimeout(drawKnown.t); drawKnown.t = setTimeout(drawKnown, 400); } });
                    kBox?.addEventListener('click', e => { const b = e.target.closest('[data-htr-aide]'); if (b) ext.readingAid?.open({q: b.dataset.htrAide, lang: lg}); });
                    // 🔍 les erreurs typiques d'une lecture automatique (même moteur que SocFace : app-lecture-auto.js) : abréviations, noms proches de ceux de la base
                    (async () => {
                        const LX = window.LCNDA_LECTURE, host = d.querySelector('[data-htr-lx]'); if (!LX || !host) return;
                        let ctx = {}; try { ctx = await (ext.socface?.readingContext ? ext.socface.readingContext() : Promise.resolve({})); } catch (_) {}
                        const draw = () => {
                            const text = [...d.querySelectorAll('[data-htr-line]')].map(x => x.textContent).join('\n');
                            const ws = LX.checkWords(text, {surnames: ctx.surnames || [], firstNames: ctx.firstNames || []}).slice(0, 12);
                            host.hidden = !ws.length;
                            host.innerHTML = ws.length ? `<h4>🔍 ${i18n('Lectures à vérifier')}</h4><ul>${ws.map(w => `<li>🟡 ${esc(w.why)} ${w.proposals.map(p => `<button type="button" class="button small secondary" data-htr-lx-word="${esc(w.word)}" data-htr-lx-value="${esc(p.value)}">${i18n('Utiliser « {value} »', {value: esc(p.value)})}</button>`).join(' ')}</li>`).join('')}</ul>` : '';
                        };
                        draw();
                        host.addEventListener('click', e => {
                            const b = e.target.closest('[data-htr-lx-word]'); if (!b) return;
                            const from = b.dataset.htrLxWord, to = b.dataset.htrLxValue, rx = new RegExp(`(^|[^\\p{L}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'gu');
                            const before = [...d.querySelectorAll('[data-htr-line]')].map(x => x.innerHTML);
                            d.querySelectorAll('[data-htr-line]').forEach(x => { if (rx.test(x.textContent)) { rx.lastIndex = 0; x.textContent = x.textContent.replace(rx, (m, a) => a + to); } rx.lastIndex = 0; });
                            draw();
                            A().undoToast?.(`« ${from} » → « ${to} »`, {undo: () => { d.querySelectorAll('[data-htr-line]').forEach((x, i) => { x.innerHTML = before[i]; }); draw(); }});
                        });
                    })();
                },
                onSubmit: f => {
                    const kept = [...f.querySelectorAll('.h-htr-rev > li')].filter(li => li.querySelector('[data-htr-keep]').checked).map(li => ({l: lines[Number(li.dataset.i)], text: li.querySelector('[data-htr-line]').textContent.replace(/\s+/g, ' ').trim()})).filter(k => k.text);
                    if (!kept.length) { toast(i18n('Aucune ligne gardée.')); return; }
                    versionBefore('Avant la lecture mise dans le texte'); let text = area.value; if (text.trim()) text += '\n\n';
                    const made = [];
                    kept.forEach(({l, text: line}) => { const s = text.length; text += line + '\n'; if (l.bbox) { const [x0, y0, x1, y1] = l.bbox; const z = {id: zid(), x: x0 + ox, y: y0 + oy, w: x1 - x0, h: y1 - y0, s, e: s + line.length, note: l.conf != null && l.conf < UNSURE ? i18n('Lu automatiquement (sûr à {x} %)', {x: pct(l.conf)}) : '', c: '', src: 'htr'};
                        const wb = line === lineText(l) ? ext.txCtx?.wordsOfLine(wordsOf(l), ox) : null; if (wb) { z.wb = wb; z.wl = line.length; } // 🔦 la place de chaque mot (le cadre des mots choisis est alors exact)
                        made.push(z); } });
                    putRead(text, made);
                    status(i18n('{x} (à relire)', {x: A().plural ? A().plural(kept.length, 'ligne lue', 'lignes lues') : kept.length + ' lignes lues'}));
                    runDetect().then(() => toast(i18n('Texte mis dans la transcription, zones posées ligne par ligne ; noms, dates et lieux repérés à droite.')));
                    if (fixOn()) runFix({quiet: true});
                }});
            dlgR?.addEventListener?.('close', () => setTimeout(() => readNext(true), 60)); // 📑 « Sur toutes les pages » : la page suivante
            return dlgR;
        }
        /* ─── G : 🔍 la lecture approfondie (Ollama, sur cet ordinateur), les deux lectures côte à côte ─── */
        async function openDeep({htrText = '', box, all = false} = {}) {
            if (!ext.txActe) return toast(i18n('La lecture approfondie n’est pas chargée.'), 'error');
            if (!t.media_id || !imgW) return toast(i18n('Choisis d’abord l’image de l’acte.'), 'error');
            if (all && !pagesToRead().length) return toast(i18n('Toutes les pages ont déjà du texte.'));
            if (all) { if (deepRun) return toast(i18n('Lecture approfondie : page {i} sur {n}…', {i: deepRun.done + 1, n: deepRun.n})); // 📑 toutes les pages, l'une après l'autre
                return ext.txActe.openDeep({lang: $('[data-tx-lang]').value, all: {n: pagesToRead().length, run: model => startDeepAll(model)}, onCompare: out => LG()?.compareExtras(out, {})}); }
            let b = box; const isZone = box !== undefined ? !!box : !!htrArea(); if (b === undefined) { b = htrArea(); if (!b) { b = await pageArea(); if (b === false) return; } }
            // 📑 un seul texte pour plusieurs pages : on compare avec le morceau de la page affichée, pas avec tout le document
            const many = pageForm === 'one' && PAGES.length > 1, sg = many ? PG.segments(area.value)[segIx()] : null;
            const cur = htrText || (sg ? area.value.slice(sg.s, sg.e) : area.value).trim();
            const pageLabel = PAGES.length > 1 ? i18n('{page} ({i} sur {n})', {page: pageName(PAGES[pageIx], pageIx), i: pageIx + 1, n: PAGES.length}) : '';
            ext.txActe.openDeep({lang: $('[data-tx-lang]').value, htrText: cur, pageLabel, getImage: mode => areaB64(b, {max: 2200, mode: mode || ext.txActe.imageMode?.() || 'auto'}), onReading: (txt, model, info) => { lastHints = Number(info?.hints) || 0; keepReading(txt, 'deep', model, {img: info?.img || '', hints: info?.hints || 0, part: isZone ? 'zone' : 'page'}); }, context: iaContext, ctxCount: iaCount, onCtx: () => openIa(), onCompareAll: () => openCompare(), // ⚖️ chaque lecture de chaque modèle gardée, et la comparaison
                onCompare: out => LG()?.compareExtras(out, {fix: ext.htrFix, lang: $('[data-tx-lang]').value, place: $('[data-tx="place"]').value}), // 🪄 et la case ▤ dans la fenêtre des deux lectures
                existing: !htrText && !!cur, // le texte déjà là (de la page) : « Remplacer » ou « Ajouter à la suite »
                onKeep: (text, from, mode) => { if (text.trim() === area.value.trim() || (!htrText && from === 'htr' && text.trim() === cur)) return; /* garder le texte déjà là : rien à ajouter */
                    if (mode === 'replace') versionBefore('Avant « Remplacer par la lecture approfondie »'); // l'ancien texte reste dans 🕘 Versions
                    const put = mode === 'replace' ? replaceRead(text.trim() + '\n') : appendRead(text.trim() + '\n'), start = put.s;
                    if (from !== 'htr') t.data.hinted = mode === 'replace' ? lastHints : Math.max(Number(t.data.hinted) || 0, lastHints); // 🧠 lue avec des indices : ses mots [?] le disent au survol
                    before = area.value; t.body = area.value; touch(); paintMirror(); status(i18n('Texte lu (à relire)')); runDetect();
                    if (LG()?.linkOn()) linkLines({s: start, e: put.e, box: b || null, src: from === 'htr' ? 'htr' : 'deep'}); // ▤ une zone par ligne, comme la lecture rapide
                    if (fixOn()) runFix({quiet: true}); }}); // 🪄 les corrections proposées aussi sur ce texte
        }
        /* ─── 📑 la lecture approfondie de toutes les pages : une demande à Ollama par page, l'une après l'autre ; le texte de chaque page
         * dans son morceau (un seul texte) ou dans l'acte de sa page (un texte par page, l'Atelier passe d'un acte à l'autre) ;
         * ▤ les lignes reliées à l'image page par page si la case est cochée ; 🪄 les corrections proposées comme pour une page ─── */
        function startDeepAll(model) {
            if (deepRun || PAGES.length < 2) return;
            const left = pagesToRead(); if (!left.length) return toast(i18n('Toutes les pages ont déjà du texte.'));
            deepRun = {model, lang: $('[data-tx-lang]').value, left, n: left.length, done: 0, stop: false, job: 0, busy: false};
            iaContext().then(c => { if (deepRun) deepRun.ctx = c; }, () => {}).finally(() => deepAllStep());
        }
        function paintDeepAll() {
            let bar = $('[data-tx-deepall]'); const R = deepRun;
            if (!R) { if (bar) bar.hidden = true; return; }
            if (!bar) { bar = document.createElement('div'); bar.className = 'h-tx-deepall'; bar.dataset.txDeepall = ''; bar.setAttribute('role', 'status'); ($('[data-tx-pages]') || stage).after(bar);
                bar.addEventListener('click', e => { if (!e.target.closest('[data-tx-deepstop]') || !deepRun) return; deepRun.stop = true; if (deepRun.job) post('tx_deep_cancel', {id: deepRun.job}).catch(() => {}); paintDeepAll(); }); }
            bar.hidden = false;
            bar.innerHTML = `<span>🔬 ${esc(i18n('Lecture approfondie : page {i} sur {n}…', {i: Math.min(R.done + 1, R.n), n: R.n}))}</span><div class="h-txa-bar"><i style="width:${Math.round((R.done + .5) / R.n * 100)}%"></i></div><button type="button" class="button small secondary" data-tx-deepstop ${R.stop ? 'disabled' : ''}>■ ${esc(i18n('Arrêter'))}</button>`;
        }
        async function deepAllStep() {
            const R = deepRun; if (!R || R.busy) return;
            if (R.stop || !dlg.isConnected) return deepAllEnd(true);
            const i = R.left[0]; if (i == null) return deepAllEnd(false);
            if (i !== pageIx) { await goPage(i); if (pageForm === 'per') { if (dlg.isConnected) deepAllEnd(true); return; } } // un texte par page : l'Atelier de l'autre acte continue
            R.busy = true; paintDeepAll();
            let txt = '', err = '', b = null;
            try {
                b = await pageArea({ask: false}); if (b === false) b = null;
                const img = await areaB64(b, {max: 2200, mode: ext.txActe?.imageMode?.() || 'auto'}); // 🖼 l'image choisie dans la fenêtre
                if (!R.stop) { const r = await post('tx_deep_read', {model: R.model, language: R.lang, image_b64: img, ...(R.ctx ? {context: R.ctx} : {})}); R.job = r.result.id; } // 🧠 « Aider l'IA »
                while (!R.stop && R.job) { await new Promise(res => setTimeout(res, 900)); if (R.stop) break;
                    const j = await api('tx_deep_job', {id: R.job}); if (j.state === 'running') continue;
                    if (j.state === 'done') txt = String(j.text || ''); else if (j.state !== 'cancelled') err = j.error ? i18n(j.error) : i18n('La lecture approfondie n’a pas abouti.');
                    break; }
            } catch (e) { err = e?.message || String(e); }
            R.busy = false; R.job = 0;
            if (R.stop || !dlg.isConnected) return deepAllEnd(true);
            if (err) { toast(err, 'error'); return deepAllEnd(true); }
            if (txt.trim()) keepReading(txt, 'deep', R.model, {img: ext.txActe?.imageMode?.() || 'auto', hints: R.ctx?.hints?.length || 0, part: 'page'}); // ⚖️
            if (txt.trim()) { if (R.ctx?.hints?.length) t.data.hinted = Math.max(Number(t.data.hinted) || 0, R.ctx.hints.length); const put = appendRead(txt.trim() + '\n'); before = area.value; t.body = area.value; touch(); paintMirror();
                if (LG()?.linkOn()) await linkLines({s: put.s, e: put.e, box: b || null, src: 'deep'}); // ▤ une zone par ligne, sur l'image de cette page
                if (fixOn()) runFix({quiet: true}); } // 🪄
            R.left.shift(); R.done++;
            deepAllStep();
        }
        async function deepAllEnd(stopped) {
            const R = deepRun; deepRun = null; paintDeepAll(); if (!R || !dlg.isConnected) return;
            await runDetect();
            if (pageForm === 'per' && dirty) await save(); // un texte par page : l'acte de la dernière page aussi (les autres l'ont été en changeant de page)
            status(stopped ? i18n('La lecture a été arrêtée.') : i18n('Toutes les pages sont lues (à relire)'));
            if (!stopped) toast(i18n('Toutes les pages sont lues (à relire)'));
        }
        /* ─── ▤ Relier les lignes du texte à l'image (calculs : app-lignes-alignement.js) : après la lecture approfondie, ou à la demande ─── */
        let htrCache = null; // la dernière lecture rapide de cette image : {file, lines} (boîtes en pixels de l'image)
        const LG = () => window.LCNDA_LIGNES, DOUBT_C = '#8d8d96';
        /** l'image (gris, améliorée si c'est choisi) découpée sur la zone ; seulement les zones dessinées si box.mask */
        const cropCanvas = (full, box) => { if (!box) return full; const c = document.createElement('canvas'); c.width = Math.max(1, Math.min(box.w, imgW - box.x)); c.height = Math.max(1, Math.min(box.h, imgH - box.y)); const g = c.getContext('2d');
            if (box.mask) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); box.mask.forEach(z => g.drawImage(full, z.x, z.y, z.w, z.h, z.x - box.x, z.y - box.y, z.w, z.h)); } else g.drawImage(full, box.x, box.y, c.width, c.height, 0, 0, c.width, c.height); return c; };
        /** les lignes de l'image : la lecture rapide déjà faite, sinon Kraken (s'il est installé), sinon un découpage simple de l'image */
        async function lineBands(box) {
            const inBox = q => !box || (q.x + q.w / 2 >= box.x && q.x + q.w / 2 <= box.x + box.w && q.y + q.h / 2 >= box.y && q.y + q.h / 2 <= box.y + box.h);
            const cached = () => { if (htrCache?.file !== t.filename) return null; const B = LG().bandsFromHtr(htrCache.lines); B.main = B.main.filter(inBox); B.margin = B.margin.filter(inBox); return B.main.length ? {...B, how: 'htr'} : null; };
            let B = cached(); if (B) return B;
            let ready = false; try { const st = await api('htr_setup_status'); ready = !!(st.ready && (st.models || []).some(m => m.present)); } catch (_) {}
            if (ready && !htrJob && !A().mediaLimits?.tooBig(imgW, imgH)) { status(i18n('Découpage de la page en lignes (lecture rapide)…')); if (await new Promise(res => runHtr({zone: box || null, then: res})) && (B = cached())) return B; }
            if (!dlg.isConnected) return {main: [], margin: [], how: 'image'};
            status(i18n('Découpage simple de la page en lignes…'));
            const c = cropCanvas(await filteredCanvas(), box), G = LG().grayOf(c), seg = LG().segment(G.gray, G.w, G.h), k = 1 / G.k, ox = box?.x || 0, oy = box?.y || 0;
            return {main: seg.bands.map(q => ({x: q.x * k + ox, y: q.y * k + oy, w: q.w * k, h: q.h * k, ink: q.ink * k})), margin: [], how: 'image'};
        }
        /** relie les lignes du texte (de s à e ; tout le texte à la demande) à leurs lignes sur l'image ; ↶ Annuler remet les zones d'avant */
        async function linkLines({s = 0, e, box, src = 'deep', manual = false} = {}) {
            if (!LG()) return manual ? toast(i18n('Le découpage en lignes n’est pas chargé.'), 'error') : null;
            if (!imgW || !t.filename) return manual ? toast(i18n('Choisis d’abord l’image de l’acte.'), 'error') : null;
            if (pageForm === 'one' && e == null && !s) { const sg = PG.segments(area.value)[segIx()]; if (sg) { s = sg.s; e = sg.e; } } // 📑 la page affichée seulement
            const text0 = area.value; e = e == null ? text0.length : Math.min(e, text0.length);
            let L0 = LG().textLines(text0, {from: s, to: e, marginTitles: [i18n('Mention en marge :')]});
            const hand = t.data.zones.filter(z => !z.src && z.e > z.s), byHand = l => hand.some(z => z.s < l.e && l.s < z.e); // une ligne déjà reliée à la main reste comme elle est
            L0 = {main: L0.main.filter(l => !byHand(l)), margin: L0.margin.filter(l => !byHand(l))};
            if (!L0.main.length && !L0.margin.length) return manual ? toast(i18n('Pas de ligne de texte à relier.'), 'error') : null;
            if (box === undefined) { const sz = t.data.zones.find(q => q.id === selZone); box = sz && !sz.src ? htrArea() : null; if (!box) box = (await pageArea({ask: false})) || null; } // une zone dessinée à la main et choisie : seulement elle (pas une zone de ligne)
            status(i18n('Découpage de la page en lignes…'));
            let B; try { B = await lineBands(box); } catch (err) { status(''); return toast(err.message || String(err), 'error'); }
            if (!dlg.isConnected) return null;
            let shift = 0; // le texte a pu changer pendant le découpage : on retrouve le passage, sinon on s'arrête
            if (area.value !== text0) { const seg = text0.slice(s, e), at = seg ? area.value.indexOf(seg) : -1; if (at < 0) { status(''); return toast(i18n('Le texte a changé pendant le découpage : « ▤ Relier les lignes à l’image » pour recommencer.'), 'error'); } shift = at - s; }
            const mv = l => ({...l, s: l.s + shift, e: l.e + shift}), lines = {main: L0.main.map(mv), margin: L0.margin.map(mv)};
            if (!B.main.length && !B.margin.length) { status(''); return toast(i18n('Aucune ligne d’écriture trouvée : essaie « 🎚️ Mieux voir » (contraste), ou une zone plus serrée.'), 'error'); }
            const r = LG().link(lines, B), linked = [...lines.main, ...(B.margin.length ? lines.margin : [])];
            const replaced = z => onHere(z) && z.src && linked.some(l => z.s < l.e && l.s < z.e); // les zones d'une lecture sur ces lignes : remplacées
            const made = r.zones.map(z => ({id: zid(), x: z.x, y: z.y, w: z.w, h: z.h, s: z.s, e: z.e, note: z.doubt ? `❔ ${i18n('Ligne reliée sans certitude : vérifie sur l’image')}` : '', c: z.doubt ? DOUBT_C : '', src, ...pz()}));
            const prev = cloneZones(); snap(); t.data.zones = [...t.data.zones.filter(z => !replaced(z)), ...made]; touch(); drawZones(); const next = cloneZones();
            const put = list => () => { snap(); t.data.zones = list.map(z => ({...z})); if (!t.data.zones.some(z => z.id === selZone)) selZone = null; touch(); drawZones(); };
            const msg = [`▤ ${i18n('Lignes reliées à l’image : {x}', {x: A().plural ? A().plural(made.length, 'zone') : made.length})}`, r.doubt ? i18n('à vérifier (❔) : {n}', {n: r.doubt}) : '', r.missing.length ? i18n('sans zone : {n}', {n: r.missing.length}) : '',
                B.how === 'htr' ? i18n('d’après la lecture rapide') : i18n('d’après un découpage simple de l’image')].filter(Boolean).join(' · ');
            status(msg); const note = (A().undoToast || toast)(msg, {undo: put(prev), redo: put(next)});
            // le texte de toutes ces lignes remplacé ou effacé : le message « ↶ Annuler » n'a plus de sens et s'en va
            const was = new Map(made.map(m => [m.id, area.value.slice(m.s, m.e)]));
            const gone = () => { if (!note?.isConnected) { area.removeEventListener('input', gone); return; } if (!t.data.zones.some(z => was.has(z.id) && z.e > z.s && area.value.slice(z.s, z.e) === was.get(z.id))) { note.close?.(); area.removeEventListener('input', gone); } };
            area.addEventListener('input', gone);
            dlg.dataset.txLines = JSON.stringify({zones: made.length, doubt: r.doubt, missing: r.missing.length, how: B.how, mode: r.mode}); // pour les essais
            return r;
        }
        /** le texte écrit autour de l'acte sur une capture d'écran (titre du registre, « 139 / 268 ») : pour préparer la source */
        async function frameText() {
            if (t.data.frame_text) return t.data.frame_text;
            const b = await docCrop(); if (!b?.screenshot || !A().loadOcrEngine) return '';
            try {
                status(i18n('Lecture du texte autour de l’acte…'));
                const im = await loadSrcImg(), c = document.createElement('canvas'), k = Math.min(1, 2400 / Math.max(imgW, imgH)); c.width = Math.round(imgW * k); c.height = Math.round(imgH * k);
                const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height); g.fillStyle = '#fff'; g.fillRect(b.x * k, b.y * k, b.w * k, b.h * k); // l'acte caché : seulement l'interface autour
                const T = await A().loadOcrEngine(), r = await T.recognize(c, 'fra');
                t.data.frame_text = String(r?.data?.text || '').replace(/\s+/g, ' ').trim().slice(0, 600); touch();
            } catch (_) { t.data.frame_text = ''; }
            status(''); return t.data.frame_text || '';
        }
        /* ─── C–F : 🧭 ce que l'app a trouvé → la généalogie ─── */
        const TX_ROLE = {epoux: 'sujet', epouse: 'sujet', sujet: 'sujet', defunt: 'défunt', conjoint: 'conjoint', temoin: 'témoin', parrain: 'parrain', marraine: 'marraine', declarant: 'déclarant', autre: 'autre'};
        const txRole = p => TX_ROLE[p.role] || (/^(pere|mere|parent)/.test(p.role) ? 'parent' : 'autre');
        function keepPeople(list) {
            list.filter(p => p.action !== 'ignore').forEach(p => { const role = txRole(p), q = t.data.people.find(x => (x.s === p.s && x.e === p.e) || (x.name && ext.txActe && window.LCNDA_TXACTE.norm(x.name) === window.LCNDA_TXACTE.norm(p.name)));
                if (q) { if (p.person_id) q.person_id = p.person_id; if (!q.role) q.role = role; } else t.data.people.push({name: p.name, role, person_id: p.person_id || 0, s: Math.max(0, p.s), e: Math.max(0, p.e)}); });
        }
        async function openFound() {
            if (!ext.txActe) return;
            if (!area.value.trim()) return toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error');
            flushCommit();
            let undoSnap = null;
            ext.txActe.openFound({text: findText(), kind: $('[data-tx="kind"]').value, date: $('[data-tx="date_text"]').value, place: $('[data-tx="place"]').value, source: $('[data-tx="source"]').value,
                filename: t.filename, title: $('[data-tx="title"]').value, mediaId: t.media_id, transcriptionId: t.id, unsure: lastUnsure, kinds: KINDS, gabarit: GB() && t.data.gabarit?.kind === kindNow() ? t.data.gabarit : null, helpers: {detect, findDates, wordsToNumber}, frameText, rich: ext.txTrouve?.selection(area.value),
                onKeepOnly: list => { keepPeople(list.map(p => ({...p, person_id: p.person_id || 0}))); touch(); paintPeople(); toast(i18n('Personnes gardées dans la transcription, sans créer de fiche.')); },
                onApplied: async ({result, people, source}) => {
                    undoSnap = {people: t.data.people.map(p => ({...p})), source: $('[data-tx="source"]').value};
                    keepPeople(people);
                    if (!$('[data-tx="source"]').value.trim() && source?.title) { const ref = [source.title, source.cote, source.view ? `vue ${source.view}${source.view_total ? '/' + source.view_total : ''}` : ''].filter(Boolean).join(', '); $('[data-tx="source"]').value = ref; t.source = ref; }
                    void result; touch(); paintPeople(); await save();
                },
                onUndone: async () => { if (!undoSnap) return; t.data.people = undoSnap.people; $('[data-tx="source"]').value = undoSnap.source; t.source = undoSnap.source; touch(); paintPeople(); await save(); }});
        }
        /* ─── image : de la base ou de l'ordinateur ─── */
        // 📑 document en plusieurs pages : changer l'image ici remplaçait toujours la page 1 et « Les retirer » effaçait les zones de
        // toutes les pages ; on change une page dans « 📑 Pages du document » (retirer l'ancienne, relier la nouvelle)
        function pagesLocked() {
            if (PAGES.length < 2) return false;
            toast(i18n('Ce document a plusieurs pages : pour changer l’image d’une page, ouvre « 📑 Pages du document », retire l’ancienne page puis relie la nouvelle.'), 'error');
            return true;
        }
        async function pickImage() {
            if (pagesLocked()) return;
            const m = await ext.pickImage({eyebrow: 'TRANSCRIPTION', title: i18n('Image de l’acte'), intro: i18n('Clique sur l’image de l’acte. Une image de l’ordinateur est ajoutée aux Médias.')}); if (!m) return;
            t.media_id = Number(m.id); t.filename = m.filename;
            if (!t.title && m.title && !m.imported) { t.title = m.title; $('[data-tx="title"]').value = t.title; }
            if (!area.value.trim() && m.transcription) { area.value = m.transcription; before = area.value; t.body = area.value; }
            if (t.data.zones.length && !await A().confirmBox(i18n('Elles étaient posées pour l’ancienne image.'), {title: i18n('Garder les zones déjà posées ?'), okLabel: i18n('Garder les zones'), cancelLabel: i18n('Les retirer'), danger: false})) { snap(); t.data.zones = []; }
            touch(); docNote(); await loadImage();
        }
        /* ─── enregistrer, exporter ─── */
        let saving = null; // deux ⌘S rapides : le second attend le premier et réutilise l'id créé (jamais deux transcriptions)
        async function save() {
            if (saving) { const p = saving; await p.catch(() => {}); return; }
            saving = saveNow().finally(() => { saving = null; });
            return saving;
        }
        async function saveNow() {
            ['title', 'kind', 'date_text', 'place', 'source'].forEach(k => { t[k] = $(`[data-tx="${k}"]`).value; }); t.body = area.value; t.data.status = $('[data-tx-state]').value;
            if (!t.title.trim()) { const subj = t.data.people.find(p => p.role === 'sujet' || p.role === 'défunt'); t.title = `${t.kind === 'apreciser' ? i18n('Acte') : (KINDS.find(k => k[0] === t.kind)?.[1] || i18n('Acte'))}${subj ? ` — ${subj.name}` : ''}${t.date_text ? ` — ${t.date_text}` : ''}`; $('[data-tx="title"]').value = t.title; }
            status('Enregistrement…');
            if (pageForm === 'one' && PAGES.length > 1) { if (!t.data.pageViews || typeof t.data.pageViews !== 'object' || Array.isArray(t.data.pageViews)) t.data.pageViews = {}; t.data.pageViews[curPid()] = {...t.data.view}; }
            try { const r = await post('save_act_transcription', {id: t.id, title: t.title, kind: t.kind, media_id: t.media_id, date_text: t.date_text, place: t.place, source: t.source, body: t.body, data: t.data}); t.id = r.result.id; dirty = false; status(`✓ ${i18n('Enregistré')}`); flushReads();
                // 📄 un seul texte par document : le texte d'avant de cette image est gardé sous le tien (rien n'est écrasé)
                if (typeof r.result.body === 'string' && r.result.body !== t.body) { snap(); area.value = r.result.body; before = area.value; t.body = area.value; paintMirror(); toast(i18n('Le texte déjà écrit pour ce document est gardé sous le tien.')); }
                docNote(); VS?.soon(); ctx.onSaved?.(t.id);
                // 🧩 un acte enregistré peut répondre à ce qui manque à une enquête (heritage-connexions-besoins.js : un message seulement si c'est presque sûr, une fois)
                ext.cxNeeds?.announce?.({kind: 'act', ref_id: t.id, what: t.kind, person_ids: (t.data.people || []).map(p => Number(p.person_id) || 0).filter(Boolean), names: (t.data.people || []).map(p => p.name).filter(Boolean), date: t.date_text, place: t.place, title: t.title, text: String(t.body || '').slice(0, 4000)}); }
            catch (e) { status(''); toast(e.message, 'error'); }
        }
        /** L1 : la fenêtre « Imprimer » commune — image et texte côte à côte, l'un puis l'autre, ou le texte seul ; image améliorée ; personnes et rôles */
        // 📑 un seul texte pour plusieurs pages : les morceaux du texte avec le nom et l'image de leur page (export et impression)
        const multiPages = () => pageForm === 'one' && PAGES.length > 1;
        function pageParts() {
            const segs = PG.segments(area.value);
            return segs.map((sg, k) => { const id = Number((t.data.pages || [])[k] || 0), i = PAGES.findIndex(p => Number(p.media_id) === id);
                return {i, name: i >= 0 ? pageName(PAGES[i], i) : i18n('Page {n}', {n: k + 1}), text: area.value.slice(sg.s, sg.e).replace(/^\n+|\n+$/g, ''), file: i >= 0 ? PAGES[i].filename : ''}; });
        }
        // 3d : « l. 5 » se cite dans une preuve — les numéros comme dans l'Atelier (par page : « page 2, l. 3 »)
        const numbered = text => { const L = String(text).split('\n'), w = String(L.length).length; return L.map((l, i) => `${String(i + 1).padStart(w, ' ')}  ${l}`).join('\n'); };
        const peopleText = () => (t.data.people || []).filter(p => p.name).map(p => `- ${p.name}${p.role ? ` — ${i18n(p.role)}` : ''}`).join('\n');
        const namedText = (o = {}) => { const body = multiPages() ? pageParts().map(q => `— ${q.name} —\n${o.ln ? numbered(q.text) : q.text}`).join('\n\n') : (o.ln ? numbered(area.value) : area.value);
            const pp = o.people ? peopleText() : ''; return pp ? `${body}\n\n${i18n('Personnes')}\n${pp}\n` : body; };
        /** les cases remplies du gabarit, dans l'ordre : [[nom, valeur]] (impression, PDF) */
        const gabRows = () => { const g = GB(), gb = t.data.gabarit; if (!g || !gb || gb.kind !== kindNow()) return []; return g.fieldsOf(kindNow(), gb).filter(([k]) => gb.fields?.[k]?.v).map(([k, l]) => [l, gb.fields[k].v + (gb.fields[k].ok ? ' ✓' : '')]); };
        /**
         * 3e · TEI (P5) : le format XML des chercheurs et des archives. En-tête (titre, sorte, date, lieu, source), une « surface » par page
         * avec son image et ses zones (coordonnées en pixels de l'image), le texte avec un <pb/> par page et un <lb n="…"/> par ligne (relié à
         * sa zone par @facs quand une zone couvre la ligne), les personnes et leur rôle (<listPerson>), les cases du 🧩 gabarit (<interpGrp>).
         */
        /** ALTO / PAGE : chaque page, ses lignes (avec la zone qui les couvre) et ses zones typées */
        function xmlPages() {
            const pages = multiPages() ? pageParts() : [{i: -1, name: '', text: area.value, file: t.filename}], pidOf = q => (q.i >= 0 ? Number(PAGES[q.i].media_id) : Number(t.media_id));
            let at = 0; return pages.map(q => {
                const start = multiPages() ? area.value.indexOf(q.text, at) : 0; if (start >= 0) at = start + q.text.length;
                const zs = t.data.zones.filter(z => (q.i < 0 ? true : Number(z.p || t.media_id) === pidOf(q)) && z.w > 0 && z.h > 0);
                let pos = Math.max(0, start); const lines = q.text.split('\n').map((l, k) => { const s0 = pos; pos += l.length + 1; const z = zs.find(zz => zz.e > zz.s && zz.s < s0 + l.length && s0 < zz.e); return {id: k + 1, text: l, box: z ? {x: z.x, y: z.y, w: z.w, h: z.h} : null}; });
                const cur = q.i < 0 || pidOf(q) === curPid();
                return {n: q.name || '1', file: q.file || '', w: cur ? imgW : 0, h: cur ? imgH : 0, lines, zones: zs.filter(z => z.kind).map(z => ({id: z.id, kind: z.kind, x: z.x, y: z.y, w: z.w, h: z.h}))};
            });
        }
        function teiXml() {
            const zid = z => 'z_' + String(z.id).replace(/[^A-Za-z0-9_.-]/g, '_'); // un identifiant XML commence par une lettre
            const x = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
            const title = $('[data-tx="title"]').value || 'Transcription', kind = KINDS.find(k => k[0] === kindNow())?.[1] || '';
            const pages = multiPages() ? pageParts() : [{i: -1, name: '', text: area.value, file: t.filename}];
            const pageId = q => `p${q.i >= 0 ? q.i + 1 : 1}`, pidOf = q => (q.i >= 0 ? Number(PAGES[q.i].media_id) : Number(t.media_id));
            const zonesOf = q => t.data.zones.filter(z => (q.i < 0 ? true : Number(z.p || t.media_id) === pidOf(q)) && z.w > 0 && z.h > 0);
            const surf = pages.map(q => `      <surface xml:id="${pageId(q)}"${q.name ? ` n="${x(q.name)}"` : ''}>\n        <graphic url="${x(q.file ? 'media/' + q.file : '')}"/>\n${zonesOf(q).map(z => `        <zone xml:id="${zid(z)}" ulx="${Math.round(z.x)}" uly="${Math.round(z.y)}" lrx="${Math.round(z.x + z.w)}" lry="${Math.round(z.y + z.h)}"/>`).join('\n')}${zonesOf(q).length ? '\n' : ''}      </surface>`).join('\n');
            // le texte : chaque ligne et la zone qui la couvre (positions dans le texte de l'Atelier)
            let at = 0; const body = pages.map(q => {
                const start = multiPages() ? area.value.indexOf(q.text, at) : 0; if (start >= 0) at = start + q.text.length;
                let pos = Math.max(0, start); const ls = q.text.split('\n').map((l, k) => { const s0 = pos; pos += l.length + 1; const z = zonesOf(q).find(zz => zz.e > zz.s && zz.s < s0 + l.length && s0 < zz.e);
                    return `        <lb n="${k + 1}"${z ? ` facs="#${zid(z)}"` : ''}/>${x(l)}`; });
                return `        <pb n="${x(q.name || '1')}" facs="#${pageId(q)}"/>\n${ls.join('\n')}`; }).join('\n');
            const ppl = (t.data.people || []).filter(p => p.name).map((p, k) => `          <person xml:id="pers${k + 1}"${p.role ? ` role="${x(p.role)}"` : ''}${p.person_id ? ` corresp="lcnda:person/${Number(p.person_id)}"` : ''}><persName>${x(p.name)}</persName></person>`).join('\n');
            const gb = gabRows();
            return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>${x(title)}</title></titleStmt>
      <publicationStmt><p>${x(i18n('Transcription faite avec LCNDA (Le Carnet numérique des ancêtres).'))}</p></publicationStmt>
      <sourceDesc><msDesc><msIdentifier><idno>${x($('[data-tx="source"]').value)}</idno></msIdentifier>${kind ? `<msContents><p>${x(kind)}</p></msContents>` : ''}<history><origin>${$('[data-tx="date_text"]').value ? `<origDate>${x($('[data-tx="date_text"]').value)}</origDate>` : ''}${$('[data-tx="place"]').value ? `<origPlace>${x($('[data-tx="place"]').value)}</origPlace>` : ''}</origin></history></msDesc></sourceDesc>
    </fileDesc>${ppl ? `
    <profileDesc>
      <particDesc>
        <listPerson>
${ppl}
        </listPerson>
      </particDesc>
    </profileDesc>` : ''}
  </teiHeader>
  <facsimile>
${surf}
  </facsimile>
  <text>
    <body>
      <ab>
${body}
      </ab>${gb.length ? `
      <interpGrp type="gabarit">
${gb.map(([l, v]) => `        <interp n="${x(l)}">${x(v)}</interp>`).join('\n')}
      </interpGrp>` : ''}
    </body>
  </text>
</TEI>
`;
        }
        /** le texte à l'impression : tel quel, ou une liste numérotée (les numéros dans la marge, comme dans l'Atelier) */
        const preOf = (text, ln) => (ln ? `<ol class="ln">${String(text).split('\n').map(l => `<li>${esc(l) || '&#8203;'}</li>`).join('')}</ol>` : `<pre>${esc(text)}</pre>`);
        async function printIt() {
            const UI2 = window.LCNDA_UI; if (!UI2?.openPrintDialog) return toast(i18n('La fenêtre « Imprimer » n’est pas chargée.'), 'error');
            const plainUrl = t.filename ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}media/${encodeURIComponent(t.filename)}` : '';
            let enhUrl = '';
            const canEnh = !!t.filename && viewChanged();
            const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}media/`;
            const imgFor = async c => { if (!c.enh || !canEnh) return plainUrl; if (!enhUrl) { try { const cv = await filteredCanvas({gray: false}); enhUrl = URL.createObjectURL(await new Promise(r2 => cv.toBlob(r2, 'image/png'))); setTimeout(() => URL.revokeObjectURL(enhUrl), 300000); } catch (_) { return plainUrl; } } return enhUrl; };
            const title = $('[data-tx="title"]').value || 'Transcription', meta = [KINDS.find(k => k[0] === $('[data-tx="kind"]').value)?.[1], $('[data-tx="date_text"]').value, $('[data-tx="place"]').value, $('[data-tx="source"]').value].filter(Boolean).join(' · ');
            UI2.openPrintDialog({title, key: 'transcription', zone: 'Transcription', photos: false, margin: 14,
                options: [{key: 'lay', type: 'radio', value: 'side', choices: [['side', i18n('Image + texte côte à côte')], ['stack', i18n('Image puis texte')], ['text', i18n('Texte seul')]]},
                    ...(multiPages() ? [{key: 'pages', type: 'radio', value: 'all', choices: [['all', i18n('Sur toutes les pages')], ['here', i18n('Sur la page affichée')]]}] : []),
                    ...(canEnh ? [{key: 'enh', label: i18n('Image améliorée'), checked: useEnh(), show: c => c.lay !== 'text'}] : []), {key: 'people', label: i18n('Personnes et rôles'), checked: true},
                    ...(gabRows().length ? [{key: 'gab', label: `🧩 ${i18n('Gabarit')}`, checked: true}] : []), {key: 'ln', label: i18n('Numéros de ligne'), checked: true}],
                html: async c => { const img = c.lay === 'text' ? '' : await imgFor(c);
                    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.5 Georgia,serif;margin:0;color:#111}h1{font-size:20px;margin:0 0 4px}.m{color:#555;margin:0 0 12px}.g{display:grid;gap:16px;align-items:start}.g.side{grid-template-columns:1fr 1fr}img{max-width:100%;border:1px solid #ccc;display:block}.g.stack img{max-height:150mm;margin:0 auto 4mm;object-fit:contain}pre{white-space:pre-wrap;font:inherit;margin:0}ul{padding-left:18px}h2{font-size:16px;margin:12px 0 6px}.brk{break-before:page}ol.ln{margin:0;padding-left:3.2em;white-space:pre-wrap;font:inherit}ol.ln li{padding-left:.4em}ol.ln li::marker{color:#888;font-size:11px}table.gab{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 10px}table.gab th{text-align:left;font-weight:600;color:#555;width:34%;padding:3px 8px 3px 0;vertical-align:top}table.gab td{padding:3px 0;border-bottom:1px solid #ddd}</style></head><body>
                        <h1>${esc(title)}</h1><p class="m">${esc(meta)}</p>${multiPages() ? (await Promise.all(pageParts().filter(q => c.pages !== 'here' || q.i === pageIx).map(async (q, k) => { const u = c.lay === 'text' || !q.file ? '' : q.i === pageIx ? img : base + encodeURIComponent(q.file);
                            return `<section class="pg${k ? ' brk' : ''}"><h2>${esc(q.name)}</h2><div class="g ${c.lay}">${u ? `<img src="${esc(u)}" alt="">` : ''}<div>${preOf(q.text, c.ln)}</div></div></section>`; }))).join('') + '<div><div>' : `<div class="g ${c.lay}">${img ? `<img src="${esc(img)}" alt="">` : ''}<div>${preOf(area.value, c.ln)}`}${c.gab && gabRows().length ? `<h3>🧩 ${esc(i18n('Gabarit'))}</h3><table class="gab">${gabRows().map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}${c.people && t.data.people.length ? `<h3>${i18n('Personnes')}</h3><ul>${t.data.people.map(p => `<li>${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</li>`).join('')}</ul>` : ''}</div></div></body></html>`; }});
        }
        window.LCNDA_UI?.onPrintKey?.(dlg, () => printIt()); // L1 : ⌘P
        dlg.addEventListener('click', async e => {
            const tl = e.target.closest('[data-tx-tool]'); if (tl) return setTool(tl.dataset.txTool);
            const chan = e.target.closest('[data-tx-chan]'); if (chan) { setView('channel', chan.dataset.txChan); syncControls(); return; }
            const rcp = e.target.closest('[data-tx-recipe]'); if (rcp) { // 🎚️ une recette en un clic, puis on ajuste ; « ↶ Annuler » sur le message
                const before = {...t.data.view}, id = rcp.dataset.txRecipe, r = TV.RECIPES.find(x => x[0] === id); if (!r) return;
                const put = v => { t.data.view = TV.viewOf(v); syncControls(); geom({keepCenter: !fitOn}); if (fitOn) applyFit(fitMode); else applyView(); applyImage(); touch(); };
                put(TV.recipeView(before, id)); A().undoToast?.(i18n('Recette « {name} » posée sur l’image', {name: r[2]}), {undo: () => put(before), redo: () => put(TV.recipeView(before, id))}); return; }
            const ch = e.target.closest('[data-tx-char]'); if (ch) { const s = area.selectionStart, en = area.selectionEnd, c = ch.dataset.txChar; area.setRangeText(c, s, en, 'end'); area.dispatchEvent(new Event('input')); area.focus(); return; }
            if (e.target.closest('[data-tx-zlink]')) { const z = t.data.zones.find(q => q.id === selZone), s = area.selectionStart, en = area.selectionEnd; if (!z) return; if (en <= s) return toast(i18n('Choisis d’abord un passage dans le texte.'), 'error'); snap(); z.s = s; z.e = en; touch(); drawZones(); return; }
            if (e.target.closest('[data-tx-zdel]')) return deleteZone();
            if (e.target.closest('[data-tx-zsign]')) return signZone();
            const pt = e.target.closest('[data-tx-ptab]'); if (pt) return showPtab(pt.dataset.txPtab);
            const stp = e.target.closest('[data-tx-step]'); if (stp) return showStep(stp.dataset.txStep);
            if (e.target.closest('[data-tx-stepnext]')) { const ks = STEPS.map(s => s[0]), i = ks.indexOf(flowView || flowCur); return showStep(ks[Math.min(ks.length - 1, i + 1)]); }
            const c = e.target.closest('[data-tx-cmd]'); if (!c) return; c.closest('details')?.removeAttribute('open');
            const k = c.dataset.txCmd;
            if (k === 'readmenu') { toggleRead(); return; }
            if (c.closest('[data-tx-readpanel]')) toggleRead(false);
            if (k === 'close') return close();
            if (k === 'save') return save();
            if (k === 'image') return pickImage();
            if (k === 'zin' || k === 'zout') { if (!imgW) return; const r = stage.getBoundingClientRect(); zoomAt(zoom * (k === 'zin' ? 1.25 : .8), r.width / 2, r.height / 2); return; }
            if (k === 'fit') { if (!imgW) return; applyFit(fitOn ? FIT_NEXT[fitMode] : 'page'); return; }
            if (k === 'rot') { if (!fitOn) { fitOn = true; fitMode = 'page'; } setView('rot', ((t.data.view.rot || 0) + 90) % 360); drawZones(); return; }
            if (k === 'loupe') { loupe.on = !loupe.on; paintLoupeBtn(); if (!loupe.on) lc.hidden = true; status(loupe.on ? `🔍 ${i18n('Loupe : la molette change le grossissement')}` : ''); return; }
            if (k === 'better') { togglePanel(); return; }
            if (k === 'barcfg') { TV.openBarDialog(dlg); return; }
            if (k === 'keepview') { await save(); if (!dirty) toast(i18n('Réglages de l’image retenus pour cet acte : ils reviennent à la prochaine ouverture.')); return; }
            if (k === 'resetview') { const before = {...t.data.view}, origin = () => { t.data.view = TV.viewOf(); fitOn = true; fitMode = 'page'; syncControls(); geom({keepCenter: false}); applyFit('page'); applyImage(); touch(); };
                if (!Object.entries(TV.DEFAULT_VIEW).some(([kk, d]) => String(before[kk]) !== String(d))) return status(i18n('L’image est déjà comme au départ'));
                origin(); A().undoToast?.(i18n('Image remise comme au départ'), {undo: () => { t.data.view = TV.viewOf(before); syncControls(); geom({keepCenter: false}); applyFit(fitMode); applyImage(); touch(); }, redo: origin}); return; }
            if (k === 'ocr') return readAllOn() ? readAll('ocr') : (perOnly(), runOcr());
            if (k === 'htr') return readAllOn() ? readAll('htr') : (perOnly(), runHtr());
            if (k === 'htrstop') return htrStop();
            if (k === 'htrzone') return runHtr({zone: htrArea()});
            if (k === 'review') return openReview();
            if (k === 'detect') return runDetect();
            if (k === 'fix') return runFix();
            if (k === 'deep') return openDeep({all: readAllAny()});
            if (k === 'aideia') return openIa();
            if (k === 'lines') return linkLines({manual: true});
            if (k === 'found') return openFound();
            if (k === 'aide') { const sel = area.value.slice(area.selectionStart, area.selectionEnd).trim().slice(0, 40); return ext.readingAid ? ext.readingAid.open({q: /\n/.test(sel) ? '' : sel, lang: aideLang($('[data-tx-lang]').value)}) : toast(i18n('L’aide à la lecture n’est pas chargée.'), 'error'); } // heritage-lecture-autrefois.js : ouverte sur la langue du texte
            if (k === 'template' && GB() && GB().has(kindNow())) { gabTab = 'gab'; showStep('find'); fillGabarit(); paintPeople(); return; }
            if (k === 'template' && GB() && kindNow() === 'apreciser') { gabTab = 'gab'; showStep('find'); paintPeople(); return; }
            if (k === 'template') return pasteTemplate();
            if (k === 'txt') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([namedText()], {type: 'text/plain;charset=utf-8'})); a.download = `${(A().safeExportFilename ? A().safeExportFilename($('[data-tx="title"]').value || 'transcription', 'transcription') : 'transcription')}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); return; }
            if (k === 'copy') { navigator.clipboard?.writeText(area.value).then(() => toast(i18n('Texte copié.'))).catch(() => toast(i18n('Copie impossible ici.'), 'error')); return; }
            if (k === 'print') return printIt();
            if (k === 'export') { // E3 : une seule fenêtre d'export
                if (!UI.openExportDialog) return printIt();
                const nm = $('[data-tx="title"]').value || 'transcription';
                return UI.openExportDialog({title: nm, defaultName: nm, quality: false, info: `${i18n('Mots : {n}', {n: area.value.trim().split(/\s+/).filter(Boolean).length})}${t.filename ? ` · ${i18n('avec l’image de l’acte')}` : ''}`, formats: [
                    {id: 'file', label: '📝 Texte', hint: i18n('le texte seul (.txt)'), ext: 'txt', run: async o => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([namedText({ln: o.checks?.ln !== false, people: !!o.checks?.people})], {type: 'text/plain;charset=utf-8'})); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }},
                    ...(window.LCNDA_TEXT?.toDocx ? [{id: 'docx', label: '📝 Word', hint: i18n('le texte mis en page, à ouvrir dans Word ou LibreOffice (.docx)'), ext: 'docx', run: async o => { try { dl(await docxBlob({people: o.checks?.people !== false}), o.filename); } catch (e) { toast(e.message || String(e), 'error'); } }}] : []),
                    {id: 'pdf', hint: i18n('image + texte (« Enregistrer en PDF »)'), ext: '', run: async () => printIt()},
                    {id: 'print', hint: 'image + texte', run: async () => printIt()},
                    {id: 'tei', label: '🗂 TEI', hint: i18n('XML des chercheurs et des archives (lignes, zones, personnes)'), ext: 'xml', run: async o => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([teiXml()], {type: 'application/xml;charset=utf-8'})); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }},
                    ...(TXX() ? [{id: 'alto', label: '🧾 ALTO', hint: i18n('XML des bibliothèques et archives (lignes et mots avec leur place sur l’image)'), ext: 'xml', run: async o => dl(new Blob([TXX().alto(xmlPages(), {title: nm})], {type: 'application/xml;charset=utf-8'}), o.filename)},
                        {id: 'pagexml', label: '📄 PAGE', hint: i18n('XML de Transkribus et eScriptorium (régions, lignes, ordre de lecture) ; un fichier par page, en .zip s’il y en a plusieurs'), ext: 'xml', run: async o => { const F = TXX().page(xmlPages()); if (F.length === 1) return dl(new Blob([F[0].xml], {type: 'application/xml;charset=utf-8'}), o.filename);
                            const Z = window.LCNDA_SHEET?.zipStore; if (Z) return dl(Z(F.map(f => ({name: f.name, data: f.xml}))), o.filename.replace(/\.xml$/i, '') + '.zip'); for (const f of F) dl(new Blob([f.xml], {type: 'application/xml;charset=utf-8'}), f.name); }}] : []),
                    ],
                    checks: [{id: 'ln', label: i18n('Numéros de ligne'), checked: true, show: id => id === 'file'}, {id: 'people', label: i18n('Personnes et rôles'), checked: true, show: id => id === 'file' || id === 'docx'}]});
            }
        });
        dlg.addEventListener('input', e => {
            const v = e.target.dataset.txView; if (v) { setView(v, e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value), {preview: e.target.type === 'range'}); return; }
            if (e.target.matches('[data-tx-useenh]')) { try { localStorage.setItem(USE_KEY, e.target.checked ? '1' : '0'); } catch (_) {} return; }
            if (e.target.dataset.tx) { t[e.target.dataset.tx] = e.target.value; touch(); }
            if (e.target.matches('[data-tx-znote]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { z.note = e.target.value.slice(0, 300); touch(); } }
            if (e.target.matches('[data-tx-zcolor]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { if (!e.target.dataset.snapped) { snap(); e.target.dataset.snapped = '1'; } z.c = e.target.value; touch(); paintZoneRects(); paintMirror(); } }
        });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-tx-zkind]')) { const z = t.data.zones.find(q => q.id === selZone); if (z) { snap(); if (e.target.value) z.kind = e.target.value; else delete z.kind; touch(); paintZoneRects(); paintZoneBar(); $('[data-tx-zkind]')?.focus(); } return; }
            if (e.target.dataset.tx === 'kind') { t.kind = e.target.value; touch(); paintWhy(); paintIaCount(); if (GB()) { fillGabarit(); paintPeople(); } } if (e.target.matches('[data-tx-state]')) { t.data.status = e.target.value; touch(); paintProg(); }
            if (e.target.matches('[data-tx-lang]')) { try { localStorage.setItem(TX_LANG_KEY, e.target.value); } catch (_) {} if (found.length) paintPeople(); } }); // la langue : retenue, et les mots connus suivent
        /* ─── « 🎚️ Mieux voir » (disposition B) : un panneau qui s'ouvre sous son bouton ─── */
        const togglePanel = (open) => { const pn = $('[data-tx-panel]'), b = $('[data-tx-cmd="better"]'); if (!pn) return; const on = open ?? pn.hidden; pn.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('is-active', on); };
        dlg.addEventListener('pointerdown', e => { const pn = $('[data-tx-panel]'); if (pn && !pn.hidden && !e.target.closest('[data-tx-item="better"]')) togglePanel(false);
            const rp = $('[data-tx-readpanel]'); if (rp && !rp.hidden && !e.target.closest('.h-tx-readw')) toggleRead(false); });
        /* ─── « ✨ Lire ▾ » : le menu des trois lectures, avec l'état de chacune ─── */
        // 📑 l'état de chaque page sous « Sur la page affichée / Sur toutes les pages » : « Page 1 : 39 lignes · Page 2 : vide »
        function pageLines(i) {
            const n = v => String(v || '').split('\n').filter(x => x.trim()).length;
            if (pageForm === 'one') { const sg = PG.segments(area.value)[(t.data.pages || []).map(Number).indexOf(Number(PAGES[i]?.media_id))]; return sg ? n(area.value.slice(sg.s, sg.e)) : 0; }
            return i === pageIx ? n(area.value) : n(perSet?.[i]?.body ?? PAGES[i]?.transcription);
        }
        function paintPageRead() {
            const el = $('[data-tx-pread]'); if (!el) return;
            el.textContent = PAGES.length > 1 ? `${i18n('Lignes déjà écrites')} — ${PAGES.map((p, i) => `${pageName(p, i)} : ${pageLines(i)}`).join(' · ')}` : '';
        }
        function toggleRead(open) {
            const pn = $('[data-tx-readpanel]'), b = $('[data-tx-cmd="readmenu"]'); if (!pn) return; const on = open ?? pn.hidden; pn.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('is-active', on);
            if (!on) return; pn.querySelector('.h-tx-readopt:not(:disabled)')?.focus();
            paintPageRead();
            readStates().then(st => { if (!dlg.isConnected) return; pn.querySelectorAll('[data-tx-readst]').forEach(el => { const ok = st[el.dataset.txReadst];
                el.innerHTML = UI.badge ? UI.badge(ok ? i18n('Installé') : i18n('À installer'), ok ? 'green' : 'yellow') : esc(ok ? i18n('Installé') : i18n('À installer')); el.dataset.state = ok ? 'ok' : 'todo'; }); });
        }
        /* ─── la barre se redessine quand on la règle (⚙️, ou Réglages) ─── */
        let narrow = false; const isNarrow = () => ($('.h-tx-left')?.getBoundingClientRect().width || 1000) < 620;
        function renderBar() { narrow = isNarrow(); $('[data-tx-barwrap]').innerHTML = TV.toolbarHtml(t.data.view, TV.barCfg(), {narrow}) + zopHtml() + (ext.txCtx ? ext.txCtx.wordColorHtml() : ''); setTool(tool); paintZoomLabel(); paintBadge(); paintLoupeBtn(); }
        const roBar = new ResizeObserver(() => { if (dlg.isConnected && isNarrow() !== narrow) renderBar(); }); roBar.observe($('.h-tx-left'));
        const onBar = () => { renderBar(); $('[data-tx-editor]')?.classList.toggle('has-ln', TV.lineNos()); paintMirror(); paintFlow(); }; window.addEventListener('lcnda-txbar-change', onBar);
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
            if (e.key === 'Escape' && $('[data-tx-readpanel]') && !$('[data-tx-readpanel]').hidden) { e.preventDefault(); e.stopPropagation(); toggleRead(false); $('[data-tx-cmd="readmenu"]')?.focus(); return; }
            { const mk = e.metaKey || e.ctrlKey; // 🔍 ⌘F, ⌥⌘F (et Ctrl+H) ; ⌨️ ⌘/ ; ⌥↓ ⌥↑ dans le texte
              if (mk && !e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) { e.preventDefault(); e.stopPropagation(); openFind(e.altKey); return; }
              if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h' && e.target === area) { e.preventDefault(); e.stopPropagation(); openFind(true); return; }
              if (mk && (e.key === '/' || e.code === 'Slash')) { e.preventDefault(); e.stopPropagation(); showKeys(); return; }
              if (e.altKey && !mk && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target === area) { e.preventDefault(); e.stopPropagation(); lineStep(e.key === 'ArrowDown' ? 1 : -1); return; } }
            if (e.target.closest?.('[data-tx-ptabs]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); const ks = ['image', 'text', 'people'], i = ks.indexOf(e.target.closest('[data-tx-ptab]')?.dataset.txPtab); showPtab(ks[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3]); return; }
            if (e.target.closest?.('[data-tx-steps]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); const ks = STEPS.map(s => s[0]), i = ks.indexOf(e.target.closest('[data-tx-step]')?.dataset.txStep); showStep(ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]); return; } // C5 : les flèches d'un onglet à l'autre
            if (e.target.closest?.('input, textarea, select')) return;
            if (e.target.closest?.('button, [contenteditable="true"]') && (e.key === ' ' || e.key === 'Enter')) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); undoZones(k === 'y' || e.shiftKey); return; } // ⌘Z, ⇧⌘Z
            if (mod || e.altKey && !e.key.startsWith('Arrow')) return;
            if (e.key === ' ' && !space) { space = true; stage.dataset.tool = 'pan'; e.preventDefault(); }
            if (e.key === '?' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); showKeys(); return; }
            if (k === 'r' && !e.shiftKey && TV.reviewMode?.()) { e.preventDefault(); openReview(); return; }
            if (k === 'z') setTool('zone'); if (k === 'h') setTool('pan'); if (k === 'l') { $('[data-tx-cmd="loupe"]') ? $('[data-tx-cmd="loupe"]').click() : (loupe.on = !loupe.on, lc.hidden = !loupe.on); return; }
            if (e.key === 'Escape' && $('[data-tx-panel]') && !$('[data-tx-panel]').hidden) { e.preventDefault(); e.stopPropagation(); togglePanel(false); $('[data-tx-cmd="better"]')?.focus(); return; }
            if (selZone && e.key.startsWith('Arrow')) { e.preventDefault(); nudgeZone(e.key, e.shiftKey, e.altKey); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selZone) { e.preventDefault(); deleteZone(); return; }
            if (e.key === 'Escape' && selZone) { e.preventDefault(); e.stopPropagation(); selZone = null; drawZones(); }
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        /** l'outil s'en va (× ou Échap, ou « ↗ Fiche » d'une personne) : touches, worker « Mieux voir », observateurs, fenêtre */
        function teardown() { if (!dlg.isConnected) return; htrStop(true); if (!switching && deepRun) { deepRun.stop = true; if (deepRun.job) post('tx_deep_cancel', {id: deepRun.job}).catch(() => {}); deepRun = null; } document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('lcnda-txbar-change', onBar); enh?.stop(); ro.disconnect(); roBar.disconnect(); dlg.close(); dlg.remove(); if (!switching) ctx.onClose?.(); }
        async function close() { if (dirty && !await A().confirmBox(i18n('Les dernières modifications de la transcription seront perdues.'), {title: i18n('Fermer sans enregistrer la transcription ?'), okLabel: i18n('Fermer sans enregistrer'), danger: true})) return; teardown(); }
        dlg.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        // la fenêtre change de taille (⛶, panneau) : l'ajustement choisi (toute l'image, largeur) suit
        let roW = 0, roH = 0; const ro = new ResizeObserver(() => { const r = stage.getBoundingClientRect(); if (!imgW || drag || (r.width === roW && r.height === roH)) return; roW = r.width; roH = r.height; if (fitOn && fitMode !== 'real') applyFit(fitMode, {keepY: true}); else applyView(); }); ro.observe(stage);
        function docNote() { const n = $('[data-tx-docnote]'); if (n) n.hidden = !t.media_id; }
        renderBar(); paintMirror(); paintPeople(); docNote(); paintWhy(); VS?.refresh(); paintIaCount(); await initPages(); if (PAGES.length) { paintMirror(); paintPeople(); } await loadImage();
        if (deepRun && dlg.isConnected) setTimeout(deepAllStep, 0); // 📑 la lecture approfondie de toutes les pages continue sur cette page
        if (fixAfterSwitch && dlg.isConnected) { fixAfterSwitch = false; runFix({quiet: true}); }
        if (ctx.goto && dlg.isConnected) { runDetect(); setTimeout(() => gotoRange(ctx.goto.s, ctx.goto.e), 60); } // 📑 venu d'un « (page 3, ligne 7) » d'une autre page
        /* E1 : l'historique (instantanés de tout l'acte) ; ⌘Z dans une case de texte garde l'annulation de la case */
        const F_KEYS = ['title', 'kind', 'date_text', 'place', 'source'];
        HX = UI.editorHistory?.({get: () => ({f: Object.fromEntries(F_KEYS.map(k => [k, $(`[data-tx="${k}"]`).value])), st: $('[data-tx-state]').value, body: area.value, zones: t.data.zones, people: t.data.people, view: t.data.view}),
            set: o => { F_KEYS.forEach(k => { $(`[data-tx="${k}"]`).value = o.f[k] ?? ''; t[k] = o.f[k] ?? ''; }); $('[data-tx-state]').value = o.st; t.data.status = o.st;
                area.value = o.body; before = o.body; t.body = o.body; t.data.zones = o.zones || []; t.data.people = o.people || []; if (!t.data.zones.some(z => z.id === selZone)) selZone = null;
                const vOld = JSON.stringify(t.data.view); t.data.view = TV.viewOf(o.view); syncControls(); if (JSON.stringify(t.data.view) !== vOld) { geom(); applyImage(); }
                dirty = true; status(i18n('modifié')); drawZones(); paintMirror(); paintPeople(); },
            onChange: h => { $('[data-tx-hist="undo"]').disabled = !h.canUndo(); $('[data-tx-hist="redo"]').disabled = !h.canRedo(); }});
        HX?.reset();
        /** 🧲 recaler sur les lignes du texte les zones décalées de quelques caractères ; auto (à l'ouverture) : seulement si c'est sûr
         *  (au moins 2 zones dont le début est décalé, comme sur les anciennes transcriptions) ; « ↶ Annuler » remet les zones d'avant */
        function snapToLines({auto = false} = {}) {
            const r = snapZones(area.value, t.data.zones, {startOnly: auto});
            dlg.dataset.txSnap = JSON.stringify({fixed: auto && r.fixes.length < 2 ? 0 : r.fixes.length, left: r.left, auto}); // pour les essais
            if (auto && r.fixes.length < 2) return r;
            if (!r.fixes.length) { toast(r.left ? i18n('Aucune zone recalée : {n} à vérifier à la main (pas sûr)', {n: r.left}) : i18n('Les zones sont déjà calées sur les lignes du texte.')); return r; }
            const prev = cloneZones(); snap(); r.fixes.forEach(f => { const z = t.data.zones[f.i]; if (z) { z.s = f.s; z.e = f.e; } }); touch(); drawZones(); const next = cloneZones();
            const put = list => () => { snap(); t.data.zones = list.map(z => ({...z})); if (!t.data.zones.some(z => z.id === selZone)) selZone = null; touch(); drawZones(); };
            const msg = [i18n(r.fixes.length > 1 ? '{n} lignes recalées sur le texte' : '{n} ligne recalée sur le texte', {n: r.fixes.length}), r.left ? i18n('{n} à vérifier à la main (pas sûr)', {n: r.left}) : ''].filter(Boolean).join(' · ');
            status(msg); (A().undoToast || toast)(msg, {undo: put(prev), redo: put(next), icon: '🧲'});
            return r;
        }
        if (dlg.isConnected && t.data.zones.length) snapToLines({auto: true});
        dlg.addEventListener('click', e => { const hb = e.target.closest('[data-tx-hist]'); if (hb) undoZones(hb.dataset.txHist === 'redo'); });
        const cmdOf = k => () => { const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.txCmd = k; dlg.appendChild(b); b.click(); b.remove(); };
        /* ═════ 🔗 Liens avec les autres outils (maquette docs/design/outils-liens.html) : 📤 Envoyer vers…, 📝 Traitement de texte,
           🎚️ Retouche, ✍️ Signatures et sceaux, Word (.docx) ═════ */
        const actTitle = () => ($('[data-tx="title"]').value || t.title || '').trim() || i18n('Transcription');
        /** l'image affichée (la page choisie d'un acte en plusieurs pages) → {id, filename, title} ; null sans image rangée */
        const curMedia = () => { const p = PAGES[pageIx]; if (p && p.media_id && p.filename) return {id: Number(p.media_id), filename: p.filename, title: p.title || actTitle()};
            return t.media_id && t.filename ? {id: Number(t.media_id), filename: t.filename, title: actTitle()} : null; };
        /** le texte en paragraphes (une ligne vide = un nouveau paragraphe, un retour à la ligne = <br>) */
        const textHtml = () => String(namedText() || '').replace(/\r/g, '').split(/\n{2,}/).filter(p => p.trim()).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';
        const metaLine = () => [kindNow() && kindNow() !== 'apreciser' ? kindLabel(kindNow()) : '', $('[data-tx="date_text"]').value.trim(), $('[data-tx="place"]').value.trim()].filter(Boolean).join(' · ');
        /** les personnes de l'acte (gardées, sinon repérées), avec les dates, lieux et métiers trouvés dans la même phrase */
        function peopleRows() {
            const src = findText(), det = detect(src), sentOf = pos => { const L = src.slice(0, pos), a = Math.max(L.lastIndexOf('.'), L.lastIndexOf(';'), L.lastIndexOf('\n')) + 1, r = src.slice(pos).search(/[.;\n]/); return [a, r < 0 ? src.length : pos + r]; };
            const kept = (t.data.people || []).filter(p => p.name), list = kept.length ? kept.map(p => ({label: p.name, role: p.role || '', s: p.s, e: p.e, linked: !!p.person_id})) : det.filter(f => f.type === 'person').map(f => ({label: f.label, role: f.role || '', s: f.s, e: f.e, linked: false}));
            const near = (p, type) => { const [a, b] = sentOf(Number(p.s) || 0); return [...new Set(det.filter(f => f.type === type && f.s >= a && f.e <= b).map(f => f.label))].join(', '); };
            const rows = list.map(p => [p.label, p.role ? i18n(p.role) : '', near(p, 'job'), near(p, 'date'), near(p, 'place'), p.linked ? i18n('Oui') : '']);
            return [[i18n('Nom'), i18n('Rôle'), i18n('Métier'), i18n('Dates'), i18n('Lieux'), i18n('Reliée à une fiche')], ...rows];
        }
        const sendOpts = title => ({anchor: $('[data-ui-menu="Fichier"]') || dlg, title, exclude: ['atelier']});
        function sendImageTo() { const m = curMedia(); if (!m) return toast(i18n('Choisis d’abord l’image de l’acte.'), 'error'); return ext.sendTo('image', {media: m}, sendOpts(m.title)); }
        function sendTextTo() { if (!area.value.trim()) return toast(i18n('Le texte est vide : écris ou lis d’abord l’acte.'), 'error'); return ext.sendTo('text', {html: textHtml(), name: actTitle()}, sendOpts(actTitle())); }
        function sendPeopleTo() { const rows = peopleRows(); if (rows.length < 2) return toast(i18n('Aucune personne repérée dans le texte pour l’instant.'), 'error'); return ext.sendTo('rows', {rows, name: i18n('Personnes — {t}', {t: actTitle()})}, sendOpts(actTitle())); }
        function sendMenu() {
            if (!ext.sendTo) return toast(i18n('L’envoi vers les autres outils n’est pas chargé.'), 'error');
            UI.menuAt?.($('[data-ui-menu="Fichier"]') || dlg, [{icon: '🖼️', label: i18n('L’image de l’acte'), disabled: !curMedia(), run: sendImageTo}, {icon: '📝', label: i18n('Le texte de la transcription'), disabled: !area.value.trim(), run: sendTextTo},
                {icon: '👥', label: i18n('Les personnes repérées (tableau)'), run: sendPeopleTo}], {title: i18n('Envoyer vers…')});
        }
        /** 📝 comme « Documents » (data-ong-wp) : un nouveau document du traitement de texte avec le titre et le texte */
        function toTextDoc() {
            if (!ext.openTextDoc) return toast(i18n('Le traitement de texte n’est pas chargé.'), 'error');
            const meta = metaLine(), html = `<h1>${esc(actTitle())}</h1>${meta ? `<p><i>${esc(meta)}</i></p>` : ''}${textHtml()}`, name = i18n('Transcription — {t}', {t: actTitle()});
            const data = ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(html) : null;
            return ext.openTextDoc(data ? {data, name} : {name});
        }
        function retouchImage() { const m = curMedia(); if (!m) return toast(i18n('Choisis d’abord l’image de l’acte.'), 'error'); return ext.retouchMedia?.(m); }
        /** ✍️ la zone « signature » découpée dans l'image de l'acte (avec une petite marge), en PNG data: → Signatures et sceaux */
        async function signZone(z = t.data.zones.find(q => q.id === selZone)) {
            if (!z || !ext.openSeals) return null;
            let im; try { im = await loadSrcImg(); } catch (e) { return toast(e.message, 'error'); }
            const W = im.naturalWidth, H = im.naturalHeight, kx = imgW ? W / imgW : 1, ky = imgH ? H / imgH : 1, pad = Math.round(Math.max(z.w * kx, z.h * ky) * .04);
            const x = clamp(Math.round(z.x * kx) - pad, 0, W - 1), y = clamp(Math.round(z.y * ky) - pad, 0, H - 1), w = clamp(Math.round(z.w * kx) + 2 * pad, 1, W - x), h = clamp(Math.round(z.h * ky) + 2 * pad, 1, H - y);
            const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h);
            const src = c.toDataURL('image/png'), title = z.note?.trim() || i18n('Signature — {t}', {t: actTitle()});
            ext.openSeals(null, {src, title}); return {src, w, h};
        }
        /** Word (.docx) : le moteur du traitement de texte (app-texte-formats.js, LCNDA_TEXT.toDocx), sans passer par l'éditeur */
        async function docxBlob({people = true} = {}) {
            const X = window.LCNDA_TEXT; if (!X?.toDocx || !X.newDoc) throw new Error(i18n('L’export Word n’est pas chargé.'));
            const doc = X.newDoc({title: actTitle()}), P = (txt, o) => X.para([X.run(txt)], o), lines = s => { const out = []; String(s).split('\n').forEach((l, i) => { if (i) out.push({br: true}); out.push(X.run(l)); }); return X.para(out); };
            const meta = metaLine(), src = $('[data-tx="source"]')?.value.trim() || t.source || '', blocks = [P(actTitle(), {st: 'title'})];
            if (meta) blocks.push(P(meta, {st: 'subtitle'}));
            if (src) blocks.push(P(`${i18n('Source')} : ${src}`));
            String(namedText() || '').replace(/\r/g, '').split(/\n{2,}/).filter(p => p.trim()).forEach(p => blocks.push(lines(p)));
            const pp = people ? (t.data.people || []).filter(p => p.name) : [];
            if (pp.length) { blocks.push(P(i18n('Personnes'), {st: 'h2'})); pp.forEach(p => blocks.push(P(`${p.name}${p.role ? ` — ${i18n(p.role)}` : ''}`))); }
            doc.sections = [{page: null, blocks}];
            return X.toDocx(doc);
        }
        const fichierLinks = () => [ext.sendTo ? {icon: '📤', label: i18n('Envoyer vers…'), run: sendMenu} : null, ext.openTextDoc ? {icon: '📝', label: i18n('Dans le traitement de texte'), run: toTextDoc} : null,
            ext.retouchMedia ? {icon: '🎚️', label: i18n('Éclaircir / restaurer l’image'), disabled: !curMedia(), run: retouchImage} : null].filter(Boolean);
        UI.editorMenus?.($('[data-tx-menus]'), {
            Fichier: () => [{icon: '💾', label: i18n('Enregistrer'), shortcut: '⌘S', run: cmdOf('save')}, {icon: '⤓', label: i18n('Exporter (texte, PDF, imprimer)…'), run: cmdOf('export')}, '-', ...(fichierLinks().length ? [...fichierLinks(), '-'] : []), {icon: '🖼️', label: i18n('Image de l’acte…'), run: cmdOf('image')}, {icon: '🕘', label: `${i18n('Versions')}…`, run: () => openVersions()}, {icon: '⚖️', label: `${i18n('Comparer les lectures')}…`, run: () => openCompare()}, '-', {icon: '×', label: i18n('Fermer'), run: cmdOf('close')}],
            Édition: () => [{icon: '↶', label: i18n('Annuler'), shortcut: '⌘Z', disabled: !HX?.canUndo(), run: () => undoZones(false)}, {icon: '↷', label: i18n('Rétablir'), shortcut: '⇧⌘Z', disabled: !HX?.canRedo(), run: () => undoZones(true)}, '-', {icon: '📋', label: i18n('Copier le texte'), run: cmdOf('copy')}, {icon: '🔍', label: `${i18n('Chercher et remplacer')}…`, shortcut: '⌘F', run: () => openFind(true)}, {icon: '🧩', label: i18n('Modèle d’acte'), run: cmdOf('template')}, '-', {icon: '🧲', label: i18n('Recaler les zones sur les lignes'), disabled: !t.data.zones.some(z => z.e > z.s), run: () => snapToLines()}],
            // K1 : les lectures, Repérer et « Ajouter à la généalogie » sont des outils (plus dans Édition) ; un symbole = une action (K11)
            Outils: () => [{icon: '✋', label: i18n('Déplacer l’image'), shortcut: 'H', run: () => setTool('pan')}, {icon: '▭', label: i18n('Dessiner une zone'), shortcut: 'Z', run: () => setTool('zone')}, {icon: '🔍', label: i18n('Loupe'), shortcut: 'L', run: cmdOf('loupe')}, '-',
                {icon: '✍️', label: i18n('Lire l’écriture à la main (rapide)'), run: cmdOf('htr')}, {icon: '🖨', label: i18n('Lire un texte imprimé'), run: cmdOf('ocr')}, {icon: '🔬', label: `${i18n('Lecture approfondie (IA)')}…`, run: cmdOf('deep')}, {icon: '▤', label: i18n('Relier les lignes à l’image'), run: cmdOf('lines')}, '-',
                {icon: '🪄', label: i18n('Corrections'), run: cmdOf('fix')}, {icon: '🧭', label: i18n('Repérer les noms, dates, lieux'), run: cmdOf('detect')}, {icon: '✓', label: `${i18n('Ajouter à la généalogie')}…`, run: cmdOf('found')}, '-',
                {icon: '📖', label: i18n('Aide à la lecture…'), run: cmdOf('aide')}, {icon: '🪙', label: i18n('Convertisseur d’autrefois…'), run: () => ext.autrefois?.open()}],
            Affichage: () => [{icon: '⤢', label: i18n('Ajuster à la fenêtre'), shortcut: '⌘0', run: () => txBar?.zoom.fit()}, {icon: '↔', label: i18n('Toute la largeur (pour lire)'), run: () => imgW && applyFit('width')}, {label: '100 %', shortcut: '⌘1', run: () => txBar?.zoom.actual()}, {icon: '＋', label: i18n('Zoom avant'), shortcut: '⌘+', run: () => txBar?.zoom.in()}, {icon: '−', label: i18n('Zoom arrière'), shortcut: '⌘−', run: () => txBar?.zoom.out()}, '-',
                {icon: '⟳', label: i18n('Tourner de 90°'), run: cmdOf('rot')}, $('[data-tx-cmd="better"]') ? {icon: '🎚️', label: `${i18n('Mieux voir')}…`, run: () => togglePanel(true)} : null, {icon: '↺', label: i18n('Remettre l’image comme au départ'), run: cmdOf('resetview')}, '-',
                TV.reviewMode?.() ? {icon: '👁', label: i18n('Relire ligne à ligne'), shortcut: 'R', run: cmdOf('review')} : null, {icon: '№', label: TV.lineNos() ? i18n('Cacher les numéros de ligne') : i18n('Montrer les numéros de ligne'), run: () => TV.setLineNos(!TV.lineNos())}, {label: TV.abbrevOn?.() ? i18n('Ne plus souligner les abréviations') : i18n('Souligner les abréviations connues'), run: () => TV.setAbbrevOn(!TV.abbrevOn())}, '-', {icon: '⌨️', label: i18n('Raccourcis clavier'), shortcut: '⌘/', run: () => showKeys()}]});
        UI.editorRail?.($('[data-tx-rail]'), {breaks: ['[data-tx-cmd="loupe"]', '[data-tx-cmd="image"]']});
        if (UI.editorStatus) { // K18 : l'image à gauche, l'aide de l'outil au milieu, le zoom à droite (⌘ + molette, ⌘0, ⌘1)
            txBar = UI.editorStatus({zoom: {get: () => zoom, set: k => { if (!imgW) return; const r = stage.getBoundingClientRect(); zoomAt(k, r.width / 2, r.height / 2); }, fit: () => imgW && applyFit('page'), min: .02, max: 20}});
            $('.h-tx').appendChild(txBar); paintTxBar();
        }
        if (!t.filename && !ctx.id) setTimeout(pickImage, 50);
        return {get t() { return t; }, detect: runDetect, save, links: {curMedia, textHtml, peopleRows, sendImageTo, sendTextTo, sendPeopleTo, toTextDoc, retouchImage, signZone, docxBlob, selectZone: id => { selZone = id; drawZones(); }}};
    }

    /* ═════════ Dans la visionneuse : un seul texte par document, partagé avec l'Atelier de transcription ═════════ */
    const kindLabel = k => (KINDS.find(x => x[0] === k) || [, k || 'Acte'])[1];
    const lbItem = () => { const S = A()?.state; return S?.lightboxMedia?.[S.lightboxIndex] || null; };
    let lbActs = [], lbFor = 0, lbSeq = 0;
    const ST_LABEL = {todo: ['À faire', 'grey'], doing: ['En cours', 'yellow'], checked: ['Relue', 'blue'], done: ['Finie', 'green']};
    const badgeH = (txt, k) => (window.LCNDA_UI?.badge ? window.LCNDA_UI.badge(txt, k) : `<span class="ui-badge is-${k}">${esc(txt)}</span>`);
    /** la section « Transcription » de la visionneuse (maquette B2) : sous la case, ce que l'Atelier sait de ce texte (sorte, état,
     *  zones, personnes relevées) et « 📜 Ouvrir dans l'Atelier » ; plusieurs actes sur l'image : un bloc par acte, la case en lecture */
    async function lbRefresh(force = false) {
        const area = document.getElementById('lightbox-transcription'), it = lbItem(); if (!area || !document.getElementById('lightbox')?.open) return;
        ext.txAligne?.gutter(area)?.paint();
        let box = document.getElementById('lightbox-acts'); if (!box) { box = document.createElement('div'); box.id = 'lightbox-acts'; box.className = 'lb-acts'; area.after(box); }
        const old = document.getElementById('act-transcriber-open'); if (old) old.hidden = true; // remplacé par « 📜 Ouvrir dans l'Atelier » ci-dessous
        const isImg = it && /\.(jpe?g|png|webp|gif|tiff?)$/i.test(it.filename || '');
        if (!isImg) { box.hidden = true; area.readOnly = false; return; } box.hidden = false;
        if (!force && lbFor === Number(it.id)) return;
        lbFor = Number(it.id); const n = ++lbSeq;
        let text = null;
        try { const r = await api('act_transcriptions_media', {media_id: it.id}); lbActs = r.items || []; text = typeof r.text === 'string' ? r.text : null; } catch (_) { lbActs = []; }
        if (n !== lbSeq) return;
        // après l'Atelier : la case montre le texte du document à jour
        if (force && text != null && area.value !== text) { area.value = text; it.transcription = text; }
        const many = lbActs.length > 1, ro = !!document.body?.classList.contains('is-kiosk'), pageOf = lbActs.some(a => a.page_of); // 📑 une page d'un acte en plusieurs pages
        area.readOnly = many || pageOf;
        ext.txAligne?.gutter(area)?.paint(); // 3c : les mêmes numéros de ligne que dans l'Atelier
        area.title = many ? i18n('Plusieurs actes sur cette image : chacun se modifie dans l’Atelier de transcription.') : pageOf ? i18n('Cette page fait partie d’un acte en plusieurs pages : son texte se modifie dans l’Atelier de transcription.') : '';
        // 3c : comme sur la page du document, un nom pas encore relié se relie dans l'Atelier (🔗)
        const people = a => (a.people || []).filter(p => p.name).map(p => (!p.person_id && !ro ? `<button type="button" class="lb-acts-chip is-unlinked" data-lbact-open="${a.id}" title="${esc(i18n('Pas encore relié : le relier dans l’Atelier'))}">🔗 ${esc(p.name)}${p.role ? ` <small>${esc(p.role)}</small>` : ''}</button>`
            : `<span class="lb-acts-chip">${esc(p.name)}${p.role ? ` <small>${esc(p.role)}</small>` : ''}${p.person_id ? ' ✓' : ''}</span>`)).join('');
        const actRow = a => { const st = ST_LABEL[a.status] || ST_LABEL.doing;
            return `<li><div class="lb-acts-meta">${many ? `<b>📜 ${esc(a.title || kindLabel(a.kind))}</b> ` : ''}${badgeH(kindLabel(a.kind), 'grey')}${badgeH(i18n(st[0]), st[1])}${a.zones ? badgeH(A().plural(a.zones, 'zone'), 'blue') : ''}${many && !ro ? ` <button type="button" class="link-button" data-lbact-open="${a.id}">${esc(i18n('📜 Ouvrir dans l’Atelier'))}</button>` : ''}</div>
                ${(a.people || []).some(p => p.name) ? `<div class="lb-acts-people"><span class="muted">${esc(i18n('Relevés dans le texte :'))}</span> ${people(a)}</div>` : ''}</li>`; };
        box.innerHTML = `${lbActs.length ? `<ul class="lb-acts-list">${lbActs.map(actRow).join('')}</ul>` : ''}
            ${many ? `<p class="lb-acts-hint">${esc(i18n('Plusieurs actes sur cette image : chacun se modifie dans l’Atelier de transcription.'))}</p>` : lbActs.length ? `<p class="lb-acts-hint">📄 ${esc(i18n('Ce texte est aussi celui de l’Atelier de transcription.'))}</p>` : ''}
            <div class="lb-acts-btns">${ro ? '' : `<button type="button" class="button small" data-lbact-new>${esc(i18n('📜 Ouvrir dans l’Atelier'))}</button>`}<button type="button" class="button small secondary" data-lbact-read title="${esc(i18n('Toute la transcription, en grand'))}">📖 ${i18n('Lire en entier')}</button>${!ro && lbActs.length ? `<button type="button" class="button small secondary" data-lbact-another title="${esc(i18n('Un autre acte sur cette image (un registre : plusieurs actes sur une vue)'))}">＋ ${esc(i18n('Un autre acte'))}</button>` : ''}</div>`;
    }
    /** un titre qui n'est qu'un nom de fichier (« 84e6ae97-2284-… », « IMG_1234 », « scan.jpg ») : l'atelier en fabrique un lisible à l'enregistrement */
    function fileLikeTitle(title, filename = '') {
        const x = String(title || '').trim(); if (!x) return true;
        const base = String(filename || '').replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
        return x === base || x === String(filename || '') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x) || /^[0-9a-f_-]{16,}$/i.test(x) || /^(img|dsc|dscn|dcim|pxl|scan|photo|image)[-_ ]?\d+/i.test(x) || /\.(jpe?g|png|gif|tiff?|webp|heic|pdf)$/i.test(x);
    }
    async function lbOpenTool(id, another = false) {
        const it = lbItem(); if (!it) return;
        const again = () => { lbFor = 0; lbRefresh(true); };
        // 📄 la case vient d'être changée (pas encore enregistrée) : son texte part d'abord dans le document, donc dans l'acte
        const area = document.getElementById('lightbox-transcription');
        if (area && !area.readOnly && area.value !== (it.transcription || '') && (id || lbActs.length)) {
            try { await api('save_media_transcription', {}, {method: 'POST', body: {media_id: it.id, transcription: area.value}}); it.transcription = area.value; } catch (e) { return toast(e.message, 'error'); }
        }
        if (id) open({id, page: Number(it.id), onClose: again}); else open({mediaId: it.id, filename: it.filename, title: fileLikeTitle(it.title, it.filename) ? '' : (it.title || ''), text: another ? '' : (area?.value || it.transcription || ''), onClose: again});
    }
    function lbRead() {
        const it = lbItem(); if (!it) return; const txt = document.getElementById('lightbox-transcription')?.value || it.transcription || '';
        const people = a => (a.people || []).filter(p => p.name).map(p => `${esc(p.name)}${p.role ? ` <small class="muted">(${esc(p.role)})</small>` : ''}`).join(', ');
        const body = `<div class="lb-read"><figure class="lb-read-img"><img src="media/${encodeURIComponent(it.filename)}" alt=""></figure><div class="lb-read-txt">
            ${lbActs.length ? '' : `<h3>${i18n('Transcription du document')}</h3>`}${lbActs.length ? '' : txt.trim() ? `<pre class="lb-read-pre">${esc(txt)}</pre>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📝</span><span class="empty-line-text">${i18n('Rien d’écrit pour l’instant dans la visionneuse.')}</span></p>`}
            ${lbActs.map(a => `<section class="lb-read-act"><h3>📜 ${esc(a.title || kindLabel(a.kind))}</h3><p class="muted">${esc([kindLabel(a.kind), a.date_text, a.place, a.source].filter(Boolean).join(' · '))}</p>${a.reason && ext.txCtx ? `<p class="lb-read-why">${ext.txCtx.reasonHtml(a.reason)}</p>` : ''}${a.people?.length ? `<p><b>${i18n('Personnes :')}</b> ${people(a)}</p>` : ''}${a.body?.trim() ? `<pre class="lb-read-pre">${esc(a.body)}</pre>` : ''}<button type="button" class="button small secondary" data-lbact-open="${a.id}">${esc(i18n('📜 Ouvrir dans l’Atelier'))}</button></section>`).join('')}</div></div>`;
        ext.openDialog({eyebrow: 'TRANSCRIPTION', title: `📖 ${it.title || 'Document'}`, wide: true, submitLabel: `🖨 ${i18n('Imprimer')}`, body,
            onOpen: dg => { dg.classList.add('lb-read-dlg'); dg.addEventListener('click', e => { const b = e.target.closest('[data-lbact-open]'); if (b) { dg.close(); lbOpenTool(Number(b.dataset.lbactOpen)); } }); },
            onSubmit: f => { const UI2 = window.LCNDA_UI; if (!UI2?.openPrintDialog) { toast(i18n('La fenêtre « Imprimer » n’est pas chargée.'), 'error'); return false; } // L1 : la fenêtre « Imprimer » commune
                const src = f.querySelector('.lb-read-txt').cloneNode(true); src.querySelectorAll('button').forEach(b => b.remove());
                const noPeople = src.cloneNode(true); noPeople.querySelectorAll('.lb-read-act p').forEach(p => { if (/Personnes/.test(p.textContent)) p.remove(); });
                const imgUrl = `media/${encodeURIComponent(it.filename)}`;
                UI2.openPrintDialog({title: it.title || 'Transcription', key: 'transcription', zone: 'Transcription', photos: false, margin: 14,
                    options: [{key: 'lay', type: 'radio', value: 'side', choices: [['side', i18n('Image + texte côte à côte')], ['stack', i18n('Image puis texte')], ['text', i18n('Texte seul')]]}, {key: 'people', label: i18n('Personnes et rôles'), checked: true}],
                    html: c => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(it.title || 'Transcription')}</title><style>body{font:14px/1.5 Georgia,serif;margin:0}pre{white-space:pre-wrap;font:inherit}h3{margin:18px 0 4px}small,.muted{color:#666}.g{display:grid;gap:16px;align-items:start}.g.side{grid-template-columns:1fr 1fr}img{max-width:100%;display:block;border:1px solid #ccc}.g.stack img{max-height:150mm;margin:0 auto;object-fit:contain}</style></head><body><h2>${esc(it.title || 'Transcription')}</h2><div class="g ${c.lay}">${c.lay === 'text' ? '' : `<img src="${esc(imgUrl)}" alt="">`}<div>${(c.people ? src : noPeople).innerHTML}</div></div></body></html>`});
                return false; }});
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-lbact-read],[data-lbact-new],[data-lbact-open],[data-lbact-another],#act-transcriber-open'); if (!b || !b.closest('#lightbox')) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (b.hasAttribute('data-lbact-read')) return lbRead();
        if (b.dataset.lbactOpen) return lbOpenTool(Number(b.dataset.lbactOpen));
        if (b.hasAttribute('data-lbact-another')) return lbOpenTool(0, true); // ＋ un autre acte sur la même image (un registre)
        if ((b.id === 'act-transcriber-open' || b.hasAttribute('data-lbact-new')) && lbActs.length && lbFor === Number(lbItem()?.id)) return lbOpenTool(lbActs[0].id); // l'acte déjà transcrit, plutôt qu'un doublon
        lbOpenTool(0);
    }, true);
    // suivre l'image affichée dans la visionneuse
    const lbWatch = () => { const lb = document.getElementById('lightbox'), im = document.getElementById('lightbox-image'); if (!lb || !im) return setTimeout(lbWatch, 500);
        new MutationObserver(() => lbRefresh()).observe(im, {attributes: true, attributeFilter: ['src', 'hidden']});
        new MutationObserver(() => { if (lb.open) lbRefresh(); else lbFor = 0; }).observe(lb, {attributes: true, attributeFilter: ['open']}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lbWatch); else lbWatch();

    ext.openActTranscriber = open;
    ext.actKindLabel = kindLabel;
    /** 📄 ouvrir un document dans la visionneuse par son numéro (recherche du haut, fiche → 📜 Actes et transcriptions) */
    ext.openDocMedia = async id => {
        let d; try { d = (await api('onglets', {op: 'document', id})).document; } catch (e) { return toast(e.message, 'error'); }
        if (!d?.filename) return toast(i18n('Ce document n’a pas de fichier.'), 'error');
        A().openLightbox([{id: d.id, title: d.title, filename: d.filename, thumbnail: d.thumbnail, media_type: d.media_type, date_text: d.date_text, document_reference: d.cote, transcription: d.transcription, description: d.description}], 0, !!document.body?.classList.contains('is-kiosk'));
    };
    ext.actDetect = detect; ext.actWordsToNumber = wordsToNumber; ext.actFindDates = findDates;

    /* ═════════ 👤 « 📜 Actes et transcriptions » sur la fiche (maquette docs/design/dossier-et-transcriptions.html, B4) ═════════
     * Chaque document où la personne est reliée (le média ou un de ses événements) ou relevée dans l'Atelier (avec un numéro de fiche),
     * son rôle et un extrait ; les noms relevés pas encore reliés qui lui ressemblent : « à relier », avec « Relier » (jamais tout seul,
     * ↶ Annuler). Case « Avec les noms relevés pas encore reliés » (cochée au départ, retenue). Serveur : act_transcriptions_for_person. */
    const GUESS_KEY = 'genealogie-acts-guess';
    const withGuess = () => { try { return localStorage.getItem(GUESS_KEY) !== '0'; } catch (_) { return true; } };
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.acts = (index, detail) => {
        const all = detail?.heritage?.acts || [], pid = Number(detail?.person?.id || 0); if (!all.length) return '';
        const list = all.filter(r => r.state !== 'tolink' || withGuess()), kiosk = !!document.body?.classList.contains('is-kiosk');
        const row = (r, i) => { const role = r.state === 'tolink' ? badgeH(i18n('relevé, à relier'), 'yellow') : r.role ? badgeH(r.role, 'grey') : '';
            const th = r.thumb ? `<img src="media/${esc(encodeURIComponent(r.thumb))}" alt="" loading="lazy">` : '<span aria-hidden="true">📜</span>';
            const main = r.state === 'tolink' ? (kiosk ? '' : `<button type="button" class="button small secondary" data-pacts-link="${i}">${esc(i18n('Relier'))}</button>`) : `<button type="button" class="button small secondary" data-pacts-open="${i}">${esc(i18n('Ouvrir'))}</button>`;
            return `<li data-pacts-row="${i}"><span class="h-pacts-img">${th}</span><div><b>${esc(r.title || kindLabel(r.kind))}</b> ${role}${r.state === 'tolink' && r.name ? ` <small class="muted">${esc(r.name)}</small>` : ''}${r.reason && ext.txCtx ? `<div class="h-pacts-why">${ext.txCtx.reasonHtml(r.reason)}</div>` : ''}${r.excerpt ? `<q data-i18n-off>${esc(r.excerpt)}</q>` : ''}</div><span class="h-pacts-acts">${main}<button type="button" class="icon-button small" data-pacts-more="${i}" aria-label="${esc(i18n('Plus d’actions'))}" title="${esc(i18n('Plus d’actions'))}">⋯</button></span></li>`; };
        const guessN = all.filter(r => r.state === 'tolink').length;
        const body = `<div class="h-pacts" data-pacts-person="${pid}">${list.length ? `<ul class="h-pacts-list">${list.map(r => row(r, all.indexOf(r))).join('')}</ul>` : `<p class="muted">${esc(i18n('Aucun document transcrit pour l’instant.'))}</p>`}
            ${guessN ? `<div class="h-pacts-foot">${window.LCNDA_UI?.checkHtml ? window.LCNDA_UI.checkHtml(i18n('Avec les noms relevés pas encore reliés'), {checked: withGuess(), attrs: 'data-pacts-guess'}) : ''}</div>` : ''}</div>`;
        ext._pacts = {all, pid};
        return A().card(index, i18n('📜 Actes et transcriptions'), list.length, body, 'span-12', '');
    };
    const pactsItem = el => { const i = Number(el.dataset.pactsOpen ?? el.dataset.pactsLink ?? el.dataset.pactsMore ?? el.closest('[data-pacts-row]')?.dataset.pactsRow); return ext._pacts?.all?.[i] || null; };
    async function pactsLink(r) {
        const pid = ext._pacts?.pid; if (!r || !pid || r.index < 0) return;
        try { await post('act_link_person', {id: r.act_id, index: r.index, person_id: pid, was: 0}); } catch (e) { return toast(e.message, 'error'); }
        ext.refreshView?.();
        A().undoToast?.(i18n('Nom relié à la fiche : {name}', {name: r.name || r.title}), {undo: async () => { await post('act_link_person', {id: r.act_id, index: r.index, person_id: 0, was: pid}); ext.refreshView?.(); }});
    }
    const pactsItems = r => [
        r.media_id ? {icon: '🖼️', label: i18n('Ouvrir'), run: () => ext.openDocMedia(r.media_id)} : null,
        r.act_id && !document.body?.classList.contains('is-kiosk') ? {icon: '📜', label: i18n('📜 Ouvrir dans l’Atelier').replace(/^📜\s*/, ''), run: () => open({id: r.act_id, onClose: () => ext.refreshView?.()})} : null,
        r.media_id ? {icon: '📄', label: i18n('Page du document'), run: async () => { await A().setModule('documents'); ext.onglets?.documents?.select?.(r.media_id); }} : null,
        r.state === 'tolink' && !document.body?.classList.contains('is-kiosk') ? {icon: '🔗', label: i18n('Relier'), run: () => pactsLink(r)} : null].filter(Boolean);
    const pactsMenu = (r, at) => window.LCNDA_UI?.menuAt?.(at, pactsItems(r), {title: r.title});
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-pacts-open],[data-pacts-link],[data-pacts-more]'); if (!b || !b.closest('.h-pacts')) return;
        const r = pactsItem(b); if (!r) return; e.preventDefault();
        if (b.hasAttribute('data-pacts-open')) return r.media_id ? ext.openDocMedia(r.media_id) : r.act_id ? open({id: r.act_id}) : null;
        if (b.hasAttribute('data-pacts-link')) return pactsLink(r);
        pactsMenu(r, b);
    });
    document.addEventListener('contextmenu', e => { const li = e.target.closest?.('.h-pacts [data-pacts-row]'); if (!li) return; const r = pactsItem(li); if (!r) return; window.LCNDA_UI?.contextMenu?.(e, pactsItems(r), {title: r.title}); });
    document.addEventListener('change', e => { if (!e.target.matches?.('[data-pacts-guess]')) return; try { localStorage.setItem(GUESS_KEY, e.target.checked ? '1' : '0'); } catch (_) {} ext.refreshView?.(); });

    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'acts', icon: '📜', label: i18n('Atelier de transcription'), what: 'transcription',
        load: async () => ((await api('act_transcriptions')).items || []).map(r => ({id: r.id, name: r.title, date: r.updated_at, thumb: r.thumb ? `<img src="media/${esc(encodeURIComponent(r.thumb))}" alt="">` : '<span class="h-et-ico">📜</span>', info: [KINDS.find(k => k[0] === r.kind)?.[1], r.date_text, r.place, `${r.people} personne${r.people > 1 ? 's' : ''}`].filter(Boolean).join(' · ')})),
        open: (id, again) => open({id, onSaved: again, onClose: again}),
        create: again => open({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_act_transcription', {id, name}),
        remove: id => post('delete_act_transcription', {id}), createLabel: `＋ ${i18n('Nouvelle transcription')}`,
        extra: `<button type="button" class="button secondary" data-et-x="aide">📜 ${i18n('Aide à la lecture')}</button><button type="button" class="button secondary" data-et-x="autrefois">🪙 ${i18n('Convertisseur d’autrefois')}</button>`,
        onExtra: k => (k === 'aide' ? ext.readingAid?.open() : ext.autrefois?.open())});
})();
