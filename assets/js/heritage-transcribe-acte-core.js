/* LCNDA — 📜 Transcription d'actes, le calcul sans écran (assets/js/heritage-transcribe-acte.js pour l'écran) :
 *  - cropBox()     : la zone du document dans une image (capture d'écran d'un site d'archives : barres d'outils, bords gris…) ;
 *  - unsureStats() : la part de mots douteux d'une lecture à la main (HTR) ;
 *  - extractAct()  : « Ce que l'app a trouvé » — l'événement, les personnes, leur rôle, âge, métier, domicile et leurs liens,
 *                    à partir du texte transcrit (s'appuie sur le repérage de « 🧭 Repérer » : detect, findDates, wordsToNumber) ;
 *  - sourceGuess() : la source et la citation (archives, commune, registre, années, cote, vue n / N) d'après le champ Source,
 *                    le nom du fichier et le texte lu autour de l'image.
 * Chargé dans la page (window.LCNDA_TXACTE) et dans Node (tests/test-transcription-actes.js). Rien ne part sur Internet.
 */
(function (root) {
    'use strict';
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’]/g, "'");

    /* ═════════ 1. Recadrer sur le document ═════════ */
    /** Seuil d'Otsu sur un histogramme de 256 cases */
    function otsu(hist, total) {
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, best = 0, th = 128;
        for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
        return th;
    }
    /**
     * La plus grande zone claire et peu colorée (le papier), barres d'outils, bords sombres ou gris et vignettes laissés de côté.
     * px : RGBA (Uint8ClampedArray ou tableau) de w × h, déjà réduit (≈ 400 px de côté suffit).
     * → {x, y, w, h, ratio (part de l'image), screenshot (vrai : il y a beaucoup de choses autour), ink (part d'encre dans la zone)}
     */
    function cropBox(px, w, h) {
        const n = w * h, L = new Uint8Array(n), S = new Float32Array(n), hist = new Array(256).fill(0);
        for (let i = 0; i < n; i++) {
            const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const l = Math.round(.299 * r + .587 * g + .114 * b); L[i] = l; S[i] = mx ? (mx - mn) / mx : 0; hist[l]++;
        }
        const th = Math.max(110, otsu(hist, n));
        // le papier : plus clair que le seuil, peu coloré (le violet d'une barre d'outils, le bleu d'un bouton ne comptent pas)
        const paper = new Uint8Array(n); for (let i = 0; i < n; i++) paper[i] = L[i] > th && S[i] < .32 ? 1 : 0;
        // les lettres font des trous dans le papier : on les bouche (dilatation de 2 points)
        const R = Math.max(1, Math.round(Math.max(w, h) / 200)), dil = new Uint8Array(n);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!paper[y * w + x]) continue; for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) dil[yy * w + xx] = 1; } } }
        // les morceaux d'un seul tenant ; on garde le plus grand
        const lab = new Int32Array(n), stack = new Int32Array(n); let best = null, id = 0;
        for (let i0 = 0; i0 < n; i0++) {
            if (!dil[i0] || lab[i0]) continue; id++; let sp = 0, cnt = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; stack[sp++] = i0; lab[i0] = id;
            while (sp) { const i = stack[--sp], x = i % w, y = (i - x) / w; cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                if (x > 0 && dil[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack[sp++] = i - 1; } if (x < w - 1 && dil[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack[sp++] = i + 1; }
                if (y > 0 && dil[i - w] && !lab[i - w]) { lab[i - w] = id; stack[sp++] = i - w; } if (y < h - 1 && dil[i + w] && !lab[i + w]) { lab[i + w] = id; stack[sp++] = i + w; } }
            if (!best || cnt > best.cnt) best = {cnt, id, x0, y0, x1, y1};
        }
        if (!best || best.cnt < n * .04) return {x: 0, y: 0, w, h, ratio: 1, screenshot: false, ink: 0};
        let {x0, y0, x1, y1} = best;
        // les bords à moitié vides (une languette qui dépasse, un coin de vignette collé) sont rognés
        const fill = (ax, ay, bx, by) => { let c = 0, t = 0; for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { t++; if (lab[y * w + x] === best.id) c++; } return t ? c / t : 0; };
        for (let k = 0; k < 4 * Math.max(w, h); k++) {
            const cand = [[fill(x0, y0, x0, y1), 'l'], [fill(x1, y0, x1, y1), 'r'], [fill(x0, y0, x1, y0), 't'], [fill(x0, y1, x1, y1), 'b']].sort((a, b) => a[0] - b[0])[0];
            if (cand[0] >= .6 || x1 - x0 < w * .1 || y1 - y0 < h * .1) break;
            if (cand[1] === 'l') x0++; else if (cand[1] === 'r') x1--; else if (cand[1] === 't') y0++; else y1--;
        }
        // la dilatation avait élargi d'un rayon : on le rend
        x0 = Math.min(x1, x0 + R); y0 = Math.min(y1, y0 + R); x1 = Math.max(x0, x1 - R); y1 = Math.max(y0, y1 - R);
        let ink = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (L[y * w + x] < th - 40) ink++;
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ratio = (bw * bh) / n;
        return {x: x0, y: y0, w: bw, h: bh, ratio, screenshot: ratio < .82, ink: ink / (bw * bh)};
    }

    /* ═════════ 2. Une lecture peu sûre ═════════ */
    function unsureStats(lines, threshold = .75) {
        let words = 0, unsure = 0, sum = 0, nc = 0;
        (lines || []).forEach(l => { (l.words || []).forEach(w => { if (!w || !String(w.t || '').trim()) return; words++; if (w.c != null) { sum += w.c; nc++; if (w.c < threshold) unsure++; } }); if (!(l.words || []).length && l.conf != null) { sum += l.conf; nc++; } });
        const ratio = words ? unsure / words : 0, mean = nc ? sum / nc : 1;
        return {words, unsure, ratio, mean, low: (words >= 5 && ratio >= .4) || (nc >= 3 && mean < .6)};
    }

    /* ═════════ 3. Ce que l'app a trouvé dans l'acte ═════════ */
    const FEMALE = new Set(['marie', 'anne', 'jeanne', 'marguerite', 'catherine', 'francoise', 'louise', 'madeleine', 'magdeleine', 'elisabeth', 'elizabeth', 'antoinette', 'jacqueline', 'pierrette', 'claudine', 'genevieve', 'suzanne', 'rose', 'julie', 'victoire', 'josephine', 'therese', 'agathe', 'adelaide', 'angelique', 'helene', 'gabrielle', 'charlotte', 'sophie', 'virginie', 'eugenie', 'celestine', 'leonie', 'rosalie', 'emilie', 'adele', 'clemence', 'pauline', 'mathilde', 'philippine', 'perrine', 'michelle', 'denise', 'nicole', 'ursule', 'barbe', 'cecile', 'anastasie', 'reine', 'martine', 'simone', 'lucie', 'blanche', 'colette', 'jeannette', 'toinette', 'margot', 'manon', 'babet', 'isabelle', 'elise', 'eulalie', 'scholastique', 'apolline', 'monique', 'veronique', 'sylvie', 'hortense', 'flore', 'florence', 'honorine', 'justine', 'delphine', 'caroline', 'amelie', 'augustine', 'leontine', 'ernestine', 'josette', 'yvonne', 'germaine', 'georgette', 'paulette', 'marcelle', 'lucienne', 'henriette', 'gilberte', 'alexandrine', 'mariane', 'marianne', 'annette', 'francoise', 'maria', 'anna']);
    const MALE = new Set(['jean', 'pierre', 'jacques', 'joseph', 'francois', 'louis', 'antoine', 'michel', 'etienne', 'nicolas', 'claude', 'charles', 'guillaume', 'andre', 'martin', 'paul', 'leonard', 'philippe', 'henri', 'thomas', 'mathieu', 'simon', 'denis', 'gilbert', 'jean-baptiste', 'baptiste', 'francis', 'augustin', 'germain', 'gabriel', 'laurent', 'vincent', 'bernard', 'georges', 'hugues', 'robert', 'sylvain', 'blaise', 'gervais', 'julien', 'marc', 'noel', 'remy', 'sebastien', 'victor', 'hippolyte', 'eugene', 'auguste', 'alexandre', 'amable', 'annet', 'barthelemy', 'benoit', 'clement', 'edme', 'fiacre', 'gaspard', 'gregoire', 'honore', 'leger', 'luc', 'marcel', 'mathurin', 'maurice', 'nicolas', 'pascal', 'raymond', 'roch', 'theodore', 'urbain', 'yves']);
    const sexOfGiven = given => { const g = norm(String(given || '').split(/[\s]+/)[0]); if (FEMALE.has(g)) return 'f'; if (MALE.has(g)) return 'm'; return ''; };
    const NAME_PART = "(?:de|du|des|d'|le|la|van|von|dit|dite)";
    /** « Pierre Mazaud » → {given: 'Pierre', surname: 'Mazaud'} ; « Jean de La Roche » → surname « de La Roche » */
    function splitName(label) {
        const w = String(label || '').trim().split(/\s+/);
        if (w.length < 2) return {given: w[0] || '', surname: ''};
        let i = w.length - 1; while (i > 1 && new RegExp(`^${NAME_PART}$`, 'i').test(norm(w[i - 1]))) i--;
        const allCaps = w.findIndex((x, k) => k > 0 && x.length > 1 && x === x.toUpperCase() && /\p{L}/u.test(x));
        if (allCaps > 0 && allCaps < i) i = allCaps; // « Jean MARTIN DUPONT » : le nom en capitales
        return {given: w.slice(0, i).join(' '), surname: w.slice(i).join(' ')};
    }
    const KIND_RX = [['mariage', /unis par (?:le|les liens du) mariage|ont [ée]t[ée] mari[ée]s|c[ée]l[ée]bration du mariage|avons conjoint|re[çc]u (?:leur|le) mutuel consentement|futurs [ée]poux|contract[ée] mariage/i],
        ['bapteme', /baptis[ée]|bapt[êe]me|a [ée]t[ée] ondoy[ée]/i], ['sepulture', /inhum[ée]|s[ée]pulture|le corps de|enterr[ée]/i],
        ['deces', /d[ée]c[ée]d[ée]e?|d[ée]c[èe]s/i], ['naissance', /pr[ée]sent[ée] un enfant|enfant (?:du sexe|de sexe)|est n[ée]e?\b|naissance/i]];
    const guessKind = text => (KIND_RX.find(([, rx]) => rx.test(text)) || [''])[0];
    const SPOUSE_ROLE = {epoux: 'm', epouse: 'f'};
    /**
     * text : la transcription ; opt.kind : la sorte d'acte choisie (bapteme, mariage…) ; opt.place, opt.date : les champs du haut ;
     * opt.helpers : {detect, findDates, wordsToNumber} (ceux de « 🧭 Repérer », heritage-transcribe.js).
     */
    function extractAct(text, opt = {}) {
        const H = opt.helpers || {}, src = String(text || '');
        const kind = guessKind(src) || (opt.kind && opt.kind !== 'autre' ? opt.kind : '') || 'autre';
        const found = H.detect ? H.detect(src) : [];
        const dates = (H.findDates ? H.findDates(src) : []).filter(d => /^\d{4}(-\d\d){0,2}$/.test(d.iso || ''));
        const places = found.filter(f => f.type === 'place'), jobs = found.filter(f => f.type === 'job');
        const toNum = H.wordsToNumber || (s => (/^\d+$/.test(String(s).trim()) ? Number(s) : null));
        // l'événement : la première date complète (« L'an mil huit cent huit, le douze février » → 1808-02-12)
        const ev = dates.find(d => /^\d{4}-\d\d-\d\d$/.test(d.iso)) || dates.find(d => /^\d{4}-\d\d$/.test(d.iso)) || dates[0] || null;
        const year = ev ? Number(ev.iso.slice(0, 4)) : (Number(String(opt.date || '').match(/\b(1[0-9]{3}|20\d\d)\b/)?.[1]) || null);
        const commune = (() => { const m = src.match(/\b(?:commune|paroisse|ville|bourg)\s+(?:de|d['’]|du)\s*((?:Saint|Sainte|St|Ste|Notre[- ]Dame|La|Le|Les)?[- ]?[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'’-]*(?:[- ](?:sur|sous|en|lès|les|le|la|de|du|des|aux)?[- ]?[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'’-]*){0,3})/); return m ? m[1].trim() : ''; })();
        const place = String(opt.place || '').trim() || commune || (places[0]?.label || '');
        // les noms : ceux de « 🧭 Repérer », sans les lieux ni les mots du maire
        const mentions = found.filter(f => f.type === 'person' && !places.some(p => f.s < p.e && p.s < f.e)).filter(f => f.label.split(/\s+/).length >= 2 || /^[A-ZÀ-Ý]{2,}/.test(f.label.split(/\s+/).pop()));
        // baptême : « a été baptisé Jean, né d'hier, fils de Pierre MAZAUD » — le prénom seul de l'enfant n'est pas un nom repéré ;
        // sans lui, le père passait pour l'enfant. On l'ajoute à sa place dans le texte (il devient l'enfant, Pierre son père).
        if (kind === 'bapteme' || kind === 'naissance') {
            const bm = /\bbaptis[ée]e?s?\s+(?:sous (?:le|les) (?:nom|prénom)s? de\s+)?([A-ZÀ-Ý][a-zà-ÿ]+(?:[- ][A-ZÀ-Ý][a-zà-ÿ]+)*)/u.exec(src);
            if (bm) { const s0 = bm.index + bm[0].length - bm[1].length, e0 = s0 + bm[1].length;
                if (!mentions.some(m => m.s < e0 && s0 < m.e) && !places.some(p => p.s < e0 && s0 < p.e)) { mentions.push({type: 'person', label: bm[1], s: s0, e: e0}); mentions.sort((x, y) => x.s - y.s); } }
        }
        // naissance : « auquel il a donné le prénom de Jean » (le prénom seul)
        const people = [], byName = new Map(); let seq = 0;
        const add = p => { p.key = `p${++seq}`; people.push(p); if (!byName.has(norm(p.name))) byName.set(norm(p.name), p); return p; };
        let witnessMode = false, lastPrincipal = null, lastParentOf = null, lastParent = null, principals = 0;
        mentions.forEach((m, mi) => {
            const next = mentions[mi + 1], beforeAll = src.slice(0, m.s), before = norm(src.slice(Math.max(0, m.s - 90), m.s));
            const sentence = norm(beforeAll.slice(Math.max(beforeAll.lastIndexOf('.'), beforeAll.lastIndexOf('\n\n')) + 1));
            const after = src.slice(m.e, Math.min(next ? next.s : src.length, m.e + 170)), afterN = norm(after);
            if (/\ben presence de|\bt[e]moins?\b|\bpresents?\s*:|\bassiste[es]? de\b|\bont assiste\b/.test(sentence)) witnessMode = true;
            if (!/\ben presence de|\btemoins?\b|\bpresents?\s*:|\bassiste/.test(sentence)) witnessMode = false;
            const {given, surname} = splitName(m.label);
            const attrs = {job: '', age: null, residence: '', deceased: /\b(?:feu|feue|defunte?|decede[e]?)\s*(?:sieur\s+|sr\s+)?$/.test(before) || /^[,\s]*(?:decede|decedee|defunte?)\b/.test(afterN)};
            const jm = jobs.find(j => j.s >= m.e && j.s < m.e + Math.min(after.length, 60) && !/\b(?:fils|fille|et)\b/.test(norm(src.slice(m.e, j.s)))); if (jm) attrs.job = jm.label;
            const am = after.match(/[âa]g[ée]e?s?\s+(?:d['’]\s*(?:environ\s+)?|de\s+(?:environ\s+)?)((?:[\wÀ-ÿ-]+\s+){0,4}?)ans/i); if (am) attrs.age = toNum(am[1].trim());
            const rm = after.match(/\b(?:demeurant|domicili[ée]e?|r[ée]sidant)\s+(?:(?:à|a|au|en|dans)\s+)?(?:la\s+)?(cette\s+(?:commune|paroisse|ville)|[A-ZÀ-Ý][\wÀ-ÿ'’-]*(?:[- ](?:sur|sous|en|le|la|de|du)?[- ]?[A-ZÀ-Ý][\wÀ-ÿ'’-]*){0,3})/i);
            if (rm) attrs.residence = /^cette\s/i.test(rm[1]) ? place : rm[1].trim();
            const own = afterN.replace(/\b(?:de|du|d')\s*(?:l'\s*)?(?:epoux|epouse|enfant|defunte?)\b/g, ' ');
            let sex = /\b(?:agee|nee|fille|veuve|epouse|demeurante|domiciliee|soeur)\b/.test(own.slice(0, 70)) ? 'f' : /\b(?:age|ne|fils|veuf|epoux|frere)\b/.test(own.slice(0, 50)) ? 'm' : sexOfGiven(given);
            let role = '', rel = null;
            const parentCtx = /\b(?:fils|fille|enfant)\s+(?:(?:majeure?|mineure?|legitimes?|naturel(?:le)?|en legitime mariage)\s+)*(?:de|du|d')\s*(?:feue?\s+|defunte?\s+|sieur\s+|sr\s+|honnete\s+homme\s+|maitre\s+)?$/.test(before);
            const motherCtx = lastParent && /\bet\s+(?:de\s+|d')\s*(?:feue?\s+|defunte?\s+|dame\s+|demoiselle\s+)?$/.test(before);
            const spouseCtx = before.match(/\b(veuve|veuf|epouse|femme|mari|epoux)\s+(?:en\s+(?:premieres|secondes)\s+noces\s+)?(?:de|du|d')\s*(?:feu\s+|defunt\s+)?$/);
            const godCtx = before.match(/\b(parrain|marraine)\b(?![^.;]*\b(?:parrain|marraine)\b)[^.;]{0,30}$/); // le dernier mot (« parrain Jean DURAND, marraine Anne » : marraine)
            if (parentCtx && lastParentOf) { role = 'parent'; rel = {type: 'parent_of', of: lastParentOf.key}; if (!sex) sex = /\bfille naturelle\b/.test(before) ? 'f' : 'm'; }
            else if (motherCtx) { role = 'parent'; rel = {type: 'parent_of', of: lastParent.of}; if (!sex || sex === 'm' && !sexOfGiven(given)) sex = 'f'; }
            else if (spouseCtx && lastPrincipal) { role = 'conjoint'; rel = {type: 'spouse_of', of: lastPrincipal.key}; if (!sex) sex = /veuve|epouse|femme/.test(spouseCtx[1]) ? 'm' : 'f'; if (/veu/.test(spouseCtx[1])) attrs.deceased = true; }
            else if (godCtx) { role = godCtx[1]; sex = role === 'parrain' ? 'm' : 'f'; }
            else if (witnessMode) role = 'temoin';
            else if (/\b(?:maire|officier de l'etat civil|cure|vicaire|pretre|desservant|notaire)\b/.test(afterN.slice(0, 40)) || /\bpar-?devant nous\s*,?\s*$/.test(before)) role = 'officier';
            // la même personne nommée une deuxième fois (« … que Pierre Mazaud et Marie Lacombe sont unis… »)
            const prev = byName.get(norm(m.label));
            if (prev && (!role || role === prev.role || (role === 'temoin' && !prev.deceased && prev.role === 'temoin'))) { prev.mentions.push([m.s, m.e]); if (!prev.job && attrs.job) prev.job = attrs.job; if (prev.age == null && attrs.age != null) prev.age = attrs.age; return; }
            if (role === 'officier') return; // le maire, le curé : ni fiche, ni témoin
            const p = add({name: m.label, given, surname, sex: sex || 'u', role, job: attrs.job, age: attrs.age, residence: attrs.residence, deceased: attrs.deceased, relations: rel ? [rel] : [], s: m.s, e: m.e, mentions: [[m.s, m.e]]});
            if (!role && kind !== 'mariage' && /\b(?:sont|est|a) comparus?\b|\bcomparants?\b/.test(sentence) && !/\bdeclare que\b|\ble corps de\b/.test(sentence)) { p.role = 'declarant'; lastParentOf = p; lastParent = null; return; }
            if (!role) { // une personne principale : l'époux, l'épouse, l'enfant, le défunt…
                principals++;
                if (kind === 'mariage') p.role = principals === 1 ? 'epoux' : principals === 2 ? 'epouse' : 'autre';
                else if (kind === 'bapteme' || kind === 'naissance') p.role = principals === 1 ? 'sujet' : 'autre';
                else if (kind === 'deces' || kind === 'sepulture') p.role = principals === 1 ? 'defunt' : 'autre';
                else p.role = 'autre';
                if (SPOUSE_ROLE[p.role] && p.sex === 'u') p.sex = SPOUSE_ROLE[p.role];
                if (p.role === 'epouse' && p.sex === 'm' && !sexOfGiven(given)) p.sex = 'f';
                lastPrincipal = p; lastParentOf = p; lastParent = null;
            } else if (role === 'parent') { lastParent = {of: rel.of, key: p.key}; }
            else if (role === 'temoin' || role === 'parrain' || role === 'marraine' || role === 'conjoint') { lastParentOf = p; lastParent = null; }
            // « frère de l'épouse », « sœur de l'époux »
            const sib = afterN.match(/\b(frere|soeur|beau-frere|belle-soeur|oncle|tante|cousin|cousine)\s+(?:germaine?\s+)?(?:de|du|d')\s*l'?\s*(epoux|epouse|enfant|defunte?|comparant)\b/);
            if (sib) { const tgt = people.find(q => q.role === ({enfant: 'sujet', defunt: 'defunt', defunte: 'defunt', comparant: 'declarant'}[sib[2]] || sib[2])); if (tgt) { p.relations.push({type: /frere|soeur/.test(sib[1]) && !/beau|belle/.test(sib[1]) ? 'sibling_of' : 'kin_of', of: tgt.key, word: sib[1]}); if (/frere|oncle|cousin\b/.test(sib[1]) && p.sex === 'u') p.sex = 'm'; } }
        });
        // naissance : l'enfant n'est nommé que par son prénom (« lui a donné le prénom de Jean »)
        if ((kind === 'naissance' || kind === 'bapteme') && !people.some(p => p.role === 'sujet')) {
            const pm = src.match(/pr[ée]noms?\s+(?:de|d['’])\s*([A-ZÀ-Ý][\wÀ-ÿ-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ-]+)*)/);
            const dec = people.find(p => p.role === 'declarant');
            if (pm) { const sp = add({name: `${pm[1]}${dec?.surname ? ' ' + dec.surname : ''}`, given: pm[1], surname: dec?.surname || '', sex: /\bsexe\s+f[ée]minin\b/i.test(src) ? 'f' : /\bsexe\s+masculin\b/i.test(src) ? 'm' : sexOfGiven(pm[1]) || 'u', role: 'sujet', job: '', age: null, residence: '', deceased: false, relations: [], s: pm.index, e: pm.index + pm[0].length, mentions: []});
                if (dec && /\bde lui (?:d[ée]clarant|comparant)\b/i.test(src)) { dec.relations.push({type: 'parent_of', of: sp.key}); dec.role = 'parent'; }
                people.filter(p => p.role === 'parent' && p.relations.some(r => r.of === dec?.key)).forEach(p => { p.relations = [{type: 'parent_of', of: sp.key}]; });
                people.filter(p => p !== dec && p.role === 'declarant' && /\bde lui (?:declarant|comparant)\s+et\s+(?:de\s+|d')\s*$/.test(norm(src.slice(Math.max(0, p.s - 50), p.s)))).forEach(p => { p.role = 'parent'; p.relations = [{type: 'parent_of', of: sp.key}]; }); }
        }
        // les rôles précis : père de l'époux, mère de l'épouse…
        const keyOf = k => people.find(p => p.key === k);
        people.forEach(p => {
            const po = p.relations.find(r => r.type === 'parent_of'); if (!po) return; const c = keyOf(po.of); if (!c) return;
            const pm = p.sex === 'f' ? 'mere' : 'pere';
            p.role = c.role === 'epoux' ? `${pm}_epoux` : c.role === 'epouse' ? `${pm}_epouse` : c.role === 'defunt' ? `${pm}_defunt` : c.role === 'sujet' ? pm : p.role;
        });
        // 🔴 3 (audit) : « baptisé Jean, fils de Pierre MAZAUD » : l'enfant sans nom de famille prend celui de son père (puis la mère),
        // pour être rapproché de « Jean MAZAUD » s'il est déjà dans la base
        if (kind === 'bapteme' || kind === 'naissance') people.filter(c => c.role === 'sujet' && !c.surname).forEach(c => {
            const ps = people.filter(p => p.relations.some(r => r.type === 'parent_of' && r.of === c.key)), f = ps.find(p => p.sex !== 'f' && p.surname) || ps.find(p => p.surname);
            if (!f || f.sex === 'f' && ps.some(p => p.sex !== 'f')) return;
            c.surname = f.surname; c.name = `${c.given} ${f.surname}`.trim();
        });
        people.forEach(p => { p.birthYear = p.age != null && year ? year - p.age : null; });
        // le lien du couple, des parents
        const relations = [];
        const ep = people.find(p => p.role === 'epoux'), es = people.find(p => p.role === 'epouse');
        if (kind === 'mariage' && ep && es) relations.push({type: 'couple', a: ep.key, b: es.key, marriage: true});
        people.forEach(c => { const ps = people.filter(p => p.relations.some(r => r.type === 'parent_of' && r.of === c.key)); if (!ps.length) return;
            const f = ps.find(p => p.sex === 'm') || null, m = ps.find(p => p.sex === 'f' && p !== f) || null; relations.push({type: 'parents', father: f?.key || '', mother: m?.key || '', child: c.key}); });
        people.forEach(p => p.relations.filter(r => r.type === 'spouse_of').forEach(r => relations.push({type: 'couple', a: r.of, b: p.key, marriage: false})));
        people.forEach(p => p.relations.filter(r => r.type === 'sibling_of').forEach(r => relations.push({type: 'sibling', a: r.of, b: p.key})));
        // les signatures : la phrase telle qu'écrite
        const sig = (src.match(/[^.;]*\b(?:sign[ée]s?|signer|signature)(?![\p{L}])[^.;]*/giu) || []).map(s => { s = s.replace(/\s+/g, ' ').trim(); return s.slice(s.lastIndexOf(',', s.search(/sign/i)) + 1).trim(); }).filter(Boolean).slice(0, 3);
        return {kind, date: ev ? {label: ev.label, iso: ev.iso, s: ev.s, e: ev.e} : (opt.date ? {label: String(opt.date), iso: '', s: -1, e: -1} : null), year, place, people, relations, signatures: sig};
    }

    /* ═════════ 4. La source ═════════ */
    const DEPTS = {'01': 'de l’Ain', '02': 'de l’Aisne', '03': 'de l’Allier', '04': 'des Alpes-de-Haute-Provence', '05': 'des Hautes-Alpes', '06': 'des Alpes-Maritimes', '07': 'de l’Ardèche', '08': 'des Ardennes', '09': 'de l’Ariège', 10: 'de l’Aube', 11: 'de l’Aude', 12: 'de l’Aveyron', 13: 'des Bouches-du-Rhône', 14: 'du Calvados', 15: 'du Cantal', 16: 'de la Charente', 17: 'de la Charente-Maritime', 18: 'du Cher', 19: 'de la Corrèze', '2A': 'de la Corse-du-Sud', '2B': 'de la Haute-Corse', 21: 'de la Côte-d’Or', 22: 'des Côtes-d’Armor', 23: 'de la Creuse', 24: 'de la Dordogne', 25: 'du Doubs', 26: 'de la Drôme', 27: 'de l’Eure', 28: 'd’Eure-et-Loir', 29: 'du Finistère', 30: 'du Gard', 31: 'de la Haute-Garonne', 32: 'du Gers', 33: 'de la Gironde', 34: 'de l’Hérault', 35: 'd’Ille-et-Vilaine', 36: 'de l’Indre', 37: 'd’Indre-et-Loire', 38: 'de l’Isère', 39: 'du Jura', 40: 'des Landes', 41: 'de Loir-et-Cher', 42: 'de la Loire', 43: 'de la Haute-Loire', 44: 'de la Loire-Atlantique', 45: 'du Loiret', 46: 'du Lot', 47: 'de Lot-et-Garonne', 48: 'de la Lozère', 49: 'de Maine-et-Loire', 50: 'de la Manche', 51: 'de la Marne', 52: 'de la Haute-Marne', 53: 'de la Mayenne', 54: 'de Meurthe-et-Moselle', 55: 'de la Meuse', 56: 'du Morbihan', 57: 'de la Moselle', 58: 'de la Nièvre', 59: 'du Nord', 60: 'de l’Oise', 61: 'de l’Orne', 62: 'du Pas-de-Calais', 63: 'du Puy-de-Dôme', 64: 'des Pyrénées-Atlantiques', 65: 'des Hautes-Pyrénées', 66: 'des Pyrénées-Orientales', 67: 'du Bas-Rhin', 68: 'du Haut-Rhin', 69: 'du Rhône', 70: 'de la Haute-Saône', 71: 'de Saône-et-Loire', 72: 'de la Sarthe', 73: 'de la Savoie', 74: 'de la Haute-Savoie', 75: 'de Paris', 76: 'de la Seine-Maritime', 77: 'de Seine-et-Marne', 78: 'des Yvelines', 79: 'des Deux-Sèvres', 80: 'de la Somme', 81: 'du Tarn', 82: 'de Tarn-et-Garonne', 83: 'du Var', 84: 'du Vaucluse', 85: 'de la Vendée', 86: 'de la Vienne', 87: 'de la Haute-Vienne', 88: 'des Vosges', 89: 'de l’Yonne', 90: 'du Territoire de Belfort', 91: 'de l’Essonne', 92: 'des Hauts-de-Seine', 93: 'de la Seine-Saint-Denis', 94: 'du Val-de-Marne', 95: 'du Val-d’Oise', 971: 'de la Guadeloupe', 972: 'de la Martinique', 973: 'de la Guyane', 974: 'de La Réunion'};
    const DEPT_BY_NAME = Object.fromEntries(Object.entries(DEPTS).map(([k, v]) => [norm(v.replace(/^(?:de la |de l’|des |du |de |d’)/, '')), k]));
    const REG_LETTERS = {n: 'naissances', m: 'mariages', d: 'décès', b: 'baptêmes', s: 'sépultures', p: 'publications de mariage', t: 'tables décennales'};
    /**
     * {source, filename, title, frameText, place, kind, date, names} → {archive, commune, register, years, cote, view, view_total, act, title}
     * frameText : le texte lu sur la capture autour de l'acte (« Saint-Amand-Montrond, 1807-1809, N, M, D », « 139 / 268 »).
     */
    function sourceGuess(o = {}) {
        const all = [o.source, o.title, o.frameText].filter(Boolean).join('\n'), fn = String(o.filename || ''), out = {archive: '', commune: '', register: '', years: '', cote: '', view: '', view_total: '', act: '', title: ''};
        // les archives : « AD Cher », « AD18 », « Archives départementales du Cher », « FRAD018_… »
        let dep = '';
        const mAd = all.match(/\bA\.?\s?D\.?\s*(?:du |de la |de l['’]|des |de )?([0-9]{2,3}|2[AB]|[A-ZÉ][\wÀ-ÿ'’-]+(?:[- ][\wÀ-ÿ'’-]+){0,3})/) || all.match(/Archives\s+d[ée]partementales\s+(?:du |de la |de l['’]|des |de |d['’])?([A-ZÉ][\wÀ-ÿ'’-]+(?:[- ][\wÀ-ÿ'’-]+){0,3})/i);
        if (mAd) { const v = mAd[1].trim(); dep = /^\d+$|^2[AB]$/.test(v) ? String(Number(v) || v).padStart(v.length > 2 ? 3 : 2, '0') : (DEPT_BY_NAME[norm(v)] || ''); if (!dep && !/^\d/.test(v)) out.archive = `Archives départementales ${/^[aeiouyéè]/i.test(v) ? 'de l’' : 'de '}${v}`; }
        const mFr = fn.match(/FRAD0?(\d{2,3}|2[AB])/i); if (!dep && mFr) dep = mFr[1].length === 3 && mFr[1].startsWith('0') ? mFr[1].slice(1) : mFr[1];
        if (dep) { const k = /^0\d$/.test(dep) ? dep : String(Number(dep) || dep); out.archive = DEPTS[k] || DEPTS[dep] ? `Archives départementales ${DEPTS[k] || DEPTS[dep]}` : `Archives départementales (${dep})`; }
        // le registre : « Saint-Amand-Montrond, 1807-1809, N, M, D »
        const reg = (o.frameText || all).match(/([A-ZÀ-Ý][\wÀ-ÿ'’-]+(?:[- ][\wÀ-ÿ'’-]+){0,4})\s*[,–-]\s*((?:1[5-9]|20)\d\d)\s*[-–]\s*((?:1[5-9]|20)\d\d)\s*[,–-]?\s*((?:[NMDBSPT]\s*[,.]?\s*){1,4})/);
        if (reg) { out.commune = reg[1].trim(); out.years = `${reg[2]}-${reg[3]}`; const ls = reg[4].toLowerCase().match(/[nmdbspt]/g) || []; const w = ls.map(l => REG_LETTERS[l]).filter(Boolean); if (w.length) out.register = (w.join(', ')).replace(/^./, c => c.toUpperCase()); }
        if (!out.years) { const y = all.match(/\b((?:1[5-9]|20)\d\d)\s*[-–]\s*((?:1[5-9]|20)\d\d)\b/); if (y) out.years = `${y[1]}-${y[2]}`; }
        if (!out.commune) out.commune = String(o.place || '').trim();
        // la cote : « 3 E 1234 », « 2 MI 45 », « E dépôt 12/3 » ; dans le nom du fichier : « 3E1234 »
        const cm = all.match(/\b(?:cote\s*:?\s*)?(\d{1,3}\s?(?:E|MI|Mi|J|Q|R|M|U)\s?(?:d[ée]p[ôo]t\s?)?\d[\d\s/.-]{0,10}\d|\d{1,3}\s?(?:E|MI|Mi|J|Q|R|M|U)\s?\d)\b/) || fn.match(/(?:^|[_-])(\d{1,3}(?:E|MI|J|Q)\d{1,6})(?=[_.-])/i);
        if (cm) out.cote = cm[1].replace(/^(\d+)\s?([A-Za-z]+)\s?/, (m, a, b) => `${a} ${b.toUpperCase() === 'MI' ? 'Mi' : b.toUpperCase()} `).replace(/\s+/g, ' ').trim();
        // la vue : « vue 139 / 268 », « 139/268 », « Vue 139 sur 268 » ; dans le nom du fichier : « …_0139.jpg »
        const vm = all.match(/\bvues?\s*(?:n[°o]\s*)?(\d{1,4})\s*(?:\/|sur)\s*(\d{1,4})\b/i) || [...all.matchAll(/(?<![\d.-])(\d{1,4})\s*\/\s*(\d{1,4})(?![\d.-])/g)].find(x => Number(x[2]) >= Number(x[1]) && Number(x[2]) > 1 && Number(x[2]) < 10000 && !(Number(x[1]) <= 31 && Number(x[2]) <= 12));
        if (vm) { out.view = String(Number(vm[1])); out.view_total = String(Number(vm[2])); }
        else { const v1 = all.match(/\bvue\s*(?:n[°o]\s*)?(\d{1,4})\b/i) || fn.match(/[_-](\d{3,5})\.(?:jpe?g|png|tiff?|webp)$/i); if (v1) out.view = String(Number(v1[1])); }
        // l'acte : « Mariage Mazaud – Lacombe, 12 février 1808 »
        const KL = {mariage: 'Mariage', bapteme: 'Baptême', naissance: 'Naissance', deces: 'Décès', sepulture: 'Sépulture', notarial: 'Acte notarié'};
        const names = (o.names || []).filter(Boolean).slice(0, 2);
        out.act = [KL[o.kind] || '', names.join(' – ')].filter(Boolean).join(' ') + (o.date ? `, ${o.date}` : '');
        const civil = o.year ? o.year >= 1793 : !/\b(?:bapt|s[ée]pult|B\s*,\s*M\s*,\s*S)/i.test(all);
        const com = out.commune || String(o.place || '');
        out.title = [out.archive, com ? (civil ? `État civil de ${com}` : `Registres paroissiaux de ${com}`) : ''].filter(Boolean).join(' — ') || String(o.source || '').trim();
        return out;
    }

    /* ═════════ 5. « Ce que l'app a trouvé », plus riche : des fiches par personne, et des rubriques ═════════
     * richFind(text, {helpers, date, kind, place}) : rien n'est inventé — chaque élément garde l'endroit du texte (s, e)
     * et la phrase qui le dit (quote) ; tout est proposé, rien n'est écrit. Voir assets/js/heritage-transcribe-trouve.js. */
    const lev = (a, b) => { a = String(a); b = String(b); if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n; let prev = Array.from({length: n + 1}, (_, j) => j);
        for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
    /** deux écritures du même nom dans un acte (« Jemielet » / « Jemichet ») : une ou deux lettres de différence */
    const nameClose = (a, b) => { a = norm(a).replace(/[^a-z]/g, ''); b = norm(b).replace(/[^a-z]/g, ''); if (!a || !b) return false; if (a === b) return true; const L = Math.max(a.length, b.length); return L >= 5 && a[0] === b[0] && lev(a, b) <= (L >= 7 ? 2 : 1); };
    const PARTICLE = /^(?:de|du|des|d|le|la|les|van|von|der|den|dit|dite|y|et)$/;
    const COMMON = new Set(('comme cette cet ce ces dans ayant etant lesquels lesquelles lequel laquelle apres avant enfin ainsi aussi tous toutes tout toute leur leurs pour par sans avec sous sur entre vers chez depuis pendant '
        + 'communication prenoms prenom prenommement garcon garcons fille filles ville commune paroisse armes arme profession aujourdhui mil an ans jour jours mois annee present presents presente '
        + 'ledit ladite lesdits icelui ont sont fait faits signe signes celui celle ceux mais donc car quand que qui quoi dont ou il elle ils elles nous vous on se sa son ses mon ma mes un une les le la au aux du de et est '
        + 'monsieur madame sieur dame demoiselle maitre messire nomme nommee lui eux comparant comparants declarant declarants temoin temoins mention acte actes registre folio page fin item '
        + 'premier premiere second seconde troisieme dernier derniere ici voici voila oui non bien tres plus moins meme memes autre autres pere mere frere soeur fils epoux epouse veuf veuve enfant enfants '
        + 'seigneur seigneurs signeur signeurs citoyen citoyenne citoyens prisonnier prisonniers bataille guerre armee regiment soldat soldats empereur roi republique nation pays').split(' '));
    const ONSETS = new Set('brz prz krz grz trz drz wrz chrz szk szp szt bl br ch chl chr cl cr cz dr dz dw fl fr gl gn gr gw hr kh kl kn kr kw mn ph phl phr pf pfl pl pr ps pt qu rh sc sch schl schm schn schr schw sh sk sl sm sn sp spr st str sv sw sz szcz th thr tr ts tsch tz vl vr wh wl wr zb zd zh zl zm zr zw'.split(' '));
    const VOW = /[aeiouy]/;
    /** un mot qui ne peut pas être un nom bien lu : pas de voyelle, un début de mot impossible (« BTIS »), trop de consonnes d'affilée */
    const badLetters = w => { const x = norm(w).replace(/[^a-z]/g, ''); if (x.length < 2) return false; if (!VOW.test(x)) return true; const on = x.match(/^[^aeiouy]+/)?.[0] || ''; if (on.length >= 2 && !ONSETS.has(on)) return true; return /[^aeiouy]{5,}/.test(x); };
    // métiers qu'une lecture écrit autrement (« tisserant »), en plus de ceux de « 🧭 Repérer »
    const JOB_FIX = [[/\btisserants?\b/i, 'tisserand'], [/\btixiers?\b/i, 'tisserand'], [/\bentrepreneurs?\s+de\s+b[âa]timents?\b/i, 'entrepreneur de bâtiments'], [/\bcharpentiers?\b/i, 'charpentier'], [/\bbouchers?\b/i, 'boucher'],
        [/\bcordonniers?\b/i, 'cordonnier'], [/\bmaçons?\b|\bmassons?\b/i, 'maçon'], [/\blaboureurs?\b/i, 'laboureur'], [/\bjournaliers?\b/i, 'journalier'], [/\bmenuisiers?\b/i, 'menuisier'], [/\bforgerons?\b/i, 'forgeron'], [/\btailleurs?\b/i, 'tailleur'], [/\bboulangers?\b/i, 'boulanger'],
        [/\bvignerons?\b/i, 'vigneron'], [/\bmeuniers?\b/i, 'meunier'], [/\bdomestiques?\b/i, 'domestique'], [/\bsoldats?\b/i, 'soldat'], [/\bcultivateurs?\b/i, 'cultivateur'], [/\btonneliers?\b/i, 'tonnelier'], [/\bfileuses?\b/i, 'fileuse'], [/\bcouturi[èe]res?\b/i, 'couturière'], [/\bservantes?\b/i, 'servante'], [/\bmarchands?\b/i, 'marchand']];
    // pays, régions et villes souvent nommés dans les actes (le reste vient du contexte : « né à … », « bataille de … »)
    const GAZ = {pays: 'Allemagne Autriche Bohême Pologne Prusse Russie Hongrie Italie Espagne Portugal Angleterre Écosse Irlande Hollande Belgique Suisse Suède Danemark Norvège Turquie Égypte Amérique Algérie Luxembourg Lituanie Ukraine Croatie France Grèce Roumanie Serbie',
        region: 'Saxe Bavière Moravie Silésie Dalmatie Tyrol Westphalie Wurtemberg Hesse Lorraine Alsace Bretagne Normandie Flandre Brabant Galicie Piémont Savoie Lombardie Toscane Catalogne Bourgogne Auvergne Provence Berry Limousin Poitou Picardie Champagne Gascogne Franche-Comté Silésie Poméranie Styrie Carinthie Bade Souabe Franconie Palatinat',
        ville: 'Ulm Vienne Prague Berlin Varsovie Moscou Austerlitz Iéna Wagram Eylau Friedland Leipzig Munich Dresde Cracovie Presbourg Paris Lyon Marseille Bordeaux Toulouse Strasbourg Metz Nancy Bourges Orléans Tours Nantes Rouen Lille Milan Turin Rome Naples Madrid Lisbonne Londres Amsterdam Bruxelles Genève Mayence Cologne Francfort Hambourg Dantzig Posen Brünn Olmütz Pilsen Budweis Linz Salzbourg Innsbruck Trieste Venise Mantoue Marengo Arcole Rivoli Smolensk Borodino Vilnius Wilna Königsberg Stettin Magdebourg'};
    const GAZ_IX = new Map(); Object.entries(GAZ).forEach(([k, l]) => l.split(' ').forEach(n => { if (!GAZ_IX.has(norm(n))) GAZ_IX.set(norm(n), {name: n, kind: k}); }));
    const KIN = 'fr[èe]re|s(?:œ|oe)ur|fils|fille|[ée]poux|[ée]pouse|veuve|veuf|p[èe]re|m[èe]re|oncle|tante|cousine?|neveu|ni[èe]ce|beau-fr[èe]re|belle-s(?:œ|oe)ur|gendre|bru';
    const CAPW = "[A-ZÀ-ÖØ-Þ][a-zà-ÿA-ZÀ-ÖØ-Þ'’-]+";
    const EVENT_RX = [[/\b(bataille|combat|si[èe]ge|prise|campagne|affaire)\s+(?:de\s+la\s+|du\s+|des\s+|de\s+|d['’]\s*)([A-ZÀ-Ýa-zà-ÿ][\wÀ-ÿ'’-]+)/gi, 'bataille'],
        [/\bprisonni[eè]re?s?\s+de\s+guerre\b/gi, 'prisonniers'], [/\bd[ée]livrance\s+des\s+prisonniers\b/gi, 'delivrance'], [/\bprisonni[eè]re?s?\b/gi, 'prisonniers'],
        [/\b(?:dans|sous)\s+les\s+armes\b|\bau\s+service\s+(?:militaire|de\s+l['’]empereur|du\s+roi)\b/gi, 'service'], [/\b(?:r[ée]giment|bataillon|demi-brigade|compagnie)\s+(?:de\s+|d['’]|du\s+)?[\wÀ-ÿ'’-]+/gi, 'unite'],
        [/\b(?:conscrits?|d[ée]serteurs?|r[ée]fractaires?)\b/gi, 'conscrit'], [/\b(?:[ée]pid[ée]mie|peste|chol[ée]ra|variole|petite v[ée]role|disette|famine|incendie|inondation|naufrage)\b/gi, 'malheur'], [/\b(?:retourner|retour)\s+dans\s+leur\s+pays\b/gi, 'retour']];
    const MILITARY = /\bprisonni|\bbataille\b|\br[ée]giment\b|\bsoldats?\b|\barm[ée]e\b|\bconscri|\bd[ée]serteur|\bdans les armes\b/i;
    /** la phrase (ou la ligne) autour d'un passage, pour la citation */
    const quoteAt = (src, s, e) => { let a = s, b = e; while (a > 0 && !/[.;\n]/.test(src[a - 1]) && s - a < 160) a--; while (b < src.length && !/[.;\n]/.test(src[b]) && b - e < 160) b++; let q = src.slice(a, b).replace(/\s+/g, ' ').trim(); if (a > 0 && !/[.;\n]/.test(src[a - 1])) q = '…' + q.replace(/^\S*\s/, ''); if (b < src.length && !/[.;\n]/.test(src[b])) q = q.replace(/\s\S*$/, '') + '…'; return q; };
    const lineOf = (src, s) => src.slice(0, Math.max(0, s)).split('\n').length;

    function richFind(text, opt = {}) {
        const H = opt.helpers || {}, src = String(text || '');
        const toNum = H.wordsToNumber || (s => (/^\d+$/.test(String(s).trim()) ? Number(s) : null));
        const found = H.detect ? H.detect(src) : [];
        const ex = extractAct(src, {kind: opt.kind, place: opt.place, date: opt.date, helpers: H});
        const year = ex.year || (Number(String(opt.date || '').match(/\b(1[0-9]{3}|20\d\d)\b/)?.[1]) || null);
        const rejected = [], placeHits = [], dates = [], ages = [], events = [], numbers = [], jobsAt = [];
        const used = []; const usedAt = (s, e) => used.some(([a, b]) => s < b && a < e);
        /* — les dates — */
        const allDates = H.findDates ? H.findDates(src) : [];
        allDates.forEach(d => { dates.push({key: `d${dates.length + 1}`, label: d.label, iso: d.iso || '', repub: !d.iso && /\ban\b/.test(d.label), act: !!(ex.date && ex.date.s === d.s), s: d.s, e: d.e, quote: quoteAt(src, d.s, d.e), line: lineOf(src, d.s)}); used.push([d.s, d.e]); });
        if (!dates.some(d => d.act) && ex.date && ex.date.s < 0 && ex.date.label) dates.unshift({key: 'd0', label: ex.date.label, iso: '', repub: false, act: true, s: -1, e: -1, quote: '', line: 0, fromField: true});
        /* — les âges : « âgé de vingt un ans », « de 22 ans », « âgée d'environ 30 ans » — */
        const AGE_RX = /(?<![\p{L}\d])(?:([âa]g[ée]e?s?)\s+)?(?:d['’]\s*(?:environ\s+)?|de\s+(?:environ\s+)?)((?:(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cent|et|\d{1,3})[\s-]*){1,5}?)\s*ans(?![\p{L}])/giu;
        let m;
        while ((m = AGE_RX.exec(src))) {
            const n = toNum(m[2].trim()); if (n == null || n < 0 || n > 120) continue;
            if (!m[1] && !/(?:,|(?<![\p{L}])[ée]tant|(?<![\p{L}])et|^)\s*$/iu.test(src.slice(Math.max(0, m.index - 12), m.index))) continue; // « l'espace de deux ans » n'est pas un âge
            ages.push({key: `a${ages.length + 1}`, n, text: m[0].trim(), s: m.index, e: m.index + m[0].length, quote: quoteAt(src, m.index, m.index + m[0].length), line: lineOf(src, m.index), owner: ''}); used.push([m.index, m.index + m[0].length]);
        }
        /* — les métiers — */
        found.filter(f => f.type === 'job').forEach(j => jobsAt.push({label: j.label, s: j.s, e: j.e}));
        JOB_FIX.forEach(([rx, label]) => { const g = new RegExp(rx.source, 'gi'); let q; while ((q = g.exec(src))) { if (!jobsAt.some(j => q.index < j.e && j.s < q.index + q[0].length)) jobsAt.push({label, s: q.index, e: q.index + q[0].length}); else { const j = jobsAt.find(x => q.index < x.e && x.s < q.index + q[0].length); if (j && label !== j.label && norm(j.label) !== norm(label)) j.label = label; } } });
        jobsAt.sort((a, b) => a.s - b.s);
        /* — les lieux — */
        const addPlace = (name, s, e, kind, why) => { name = String(name).replace(/[,.;:]+$/, '').trim(); if (name.length < 2 || placeHits.some(p => p.s === s)) return; placeHits.push({name, s, e, kind: kind || GAZ_IX.get(norm(name))?.kind || 'lieu', why: why || ''}); };
        found.filter(f => f.type === 'place').forEach(p => addPlace(p.label, p.s, p.e, '', 'contexte'));
        const capRx = new RegExp(CAPW, 'g');
        while ((m = capRx.exec(src))) { const g = GAZ_IX.get(norm(m[0].replace(/['’].*$/, ''))); if (g) addPlace(g.name === m[0] ? m[0] : m[0], m.index, m.index + m[0].length, g.kind, 'liste'); }
        const ctxRx = new RegExp(`\\b(?:n[ée]e?|natif|native|originaire|demeurant|domicili[ée]e?|r[ée]sidant|bataille|si[èe]ge|combat|prise|ville|commune|paroisse)\\s+(?:de\\s+la\\s+|de\\s+l['’]|du\\s+|de\\s+|d['’]\\s*|à\\s+|a\\s+|en\\s+|au\\s+)(${CAPW}(?:[- ](?:sur|sous|en|lès|le|la|de|du)?[- ]?${CAPW}){0,2})`, 'g');
        while ((m = ctxRx.exec(src))) { const s = m.index + m[0].lastIndexOf(m[1]); if (!COMMON.has(norm(m[1]).replace(/[^a-z]/g, ''))) addPlace(m[1], s, s + m[1].length, '', 'contexte'); }
        const saintRx = /\b(?:Saint|Sainct|Sainte|St|Ste)[- ][A-ZÀ-Ý][\wÀ-ÿ'’-]+(?:[- ](?:de|du|sur|en|la|le)[- ][A-ZÀ-Ý][\wÀ-ÿ'’-]+)?/g;
        while ((m = saintRx.exec(src))) addPlace(m[0], m.index, m.index + m[0].length, 'lieu', 'saint');
        placeHits.sort((a, b) => a.s - b.s);
        const inPlace = (s, e) => placeHits.find(p => s < p.e && p.s < e);
        /* — les noms : ceux de « 🧭 Repérer », revus ; et ceux qu'un contexte annonce (« frère Corby », « Poëtrey, âgé de 20 ans ») — */
        const cand = [];
        found.filter(f => f.type === 'person').forEach(f => cand.push({label: f.label, s: f.s, e: f.e, role: f.role || '', from: 'detect'}));
        const nameRx = new RegExp(`${CAPW}(?:\\s+(?:de\\s+|du\\s+|d['’]\\s*|le\\s+|la\\s+)?${CAPW}){0,3}`, 'g');
        while ((m = nameRx.exec(src))) {
            if (cand.some(c => m.index < c.e && c.s < m.index + m[0].length)) continue;
            const before = src.slice(Math.max(0, m.index - 16), m.index), after = src.slice(m.index + m[0].length, m.index + m[0].length + 32);
            const kin = new RegExp(`\\b(?:${KIN}|nomm[ée]e?|sieur|sr|le\\s+nomm[ée]|d['’]\\s*infant|appel[ée]e?)\\s*(?:de\\s+|d['’]\\s*)?$`, 'i').test(before);
            const aged = /^\s*,?\s*(?:[^,.;\n]{0,14}[,\s]\s*)?(?:[ée]tant\s+)?[âa]g[ée]e?s?(?![\p{L}])/iu.test(after);
            const given = sexOfGiven(m[0]) && m[0].split(/\s+/).length >= 2;
            if (kin || aged || given) cand.push({label: m[0], s: m.index, e: m.index + m[0].length, role: '', from: kin ? 'kin' : aged ? 'age' : 'given'});
        }
        cand.sort((a, b) => a.s - b.s);
        const mentions = [];
        cand.forEach(c => {
            let words = c.label.split(/\s+/), s = c.s;
            const reject = why => { if (!rejected.some(r => r.label === c.label)) rejected.push({label: c.label, why, s: c.s, e: c.e}); };
            // les mots courants en tête (« Comme Lui », « C'est »)
            while (words.length && (COMMON.has(norm(words[0]).replace(/[^a-z]/g, '')) || /^[cdjlmnst]['’]/i.test(words[0]))) { s = src.indexOf(words[1] || '', s + words[0].length); words.shift(); }
            if (!words.length) return reject('common');
            if (PARTICLE.test(norm(words[words.length - 1]).replace(/[^a-z]/g, '')) || /['’]$/.test(words[words.length - 1])) return reject('particle');
            const label = words.join(' ');
            if (words.some(badLetters)) return reject('letters');
            if (words.length === 1 && (COMMON.has(norm(label).replace(/[^a-z]/g, '')) || label.length < 3)) return reject('common');
            if (jobsAt.some(j => s >= j.s && s < j.e) && words.length === 1) return reject('job');
            const pl = inPlace(s, s + label.length); if (pl) return reject('place');
            if (/^(?:Saint|Sainct|Sainte|St|Ste)$/i.test(words[0])) return reject('place');
            mentions.push({label, s, e: s + label.length, role: c.role, from: c.from});
        });
        /* — les regrouper : la même personne écrite deux façons (« Jemielet » / « Jemichet ») — */
        const people = [];
        const sameP = (p, l) => { const a = splitName(l), b = splitName(p.name); const sa = a.surname || a.given, sb = b.surname || b.given; if (!nameClose(sa, sb)) return false; if (a.surname && b.surname && a.given && b.given) return nameClose(a.given, b.given) || norm(a.given) === norm(b.given); return true; };
        mentions.forEach(mt => {
            const p = people.find(q => sameP(q, mt.label));
            if (p) { p.mentions.push([mt.s, mt.e]); p.forms[mt.label] = (p.forms[mt.label] || 0) + 1; if (!p.roleWord && mt.role) p.roleWord = mt.role; return; }
            people.push({key: `r${people.length + 1}`, name: mt.label, forms: {[mt.label]: 1}, mentions: [[mt.s, mt.e]], s: mt.s, e: mt.e, roleWord: mt.role, fields: {}});
        });
        people.forEach(p => { const fs = Object.entries(p.forms).sort((a, b) => b[1] - a[1] || p.mentions.findIndex(x => src.slice(x[0], x[1]) === a[0]) - p.mentions.findIndex(x => src.slice(x[0], x[1]) === b[0])); p.name = fs[0][0]; p.variants = fs.slice(1).map(x => x[0]); });
        /* — une personne sans nom lisible : un âge sans personne juste avant (« C'est garçon, Charpentier, âgé de vingt un ans ») — */
        const allMentions = () => people.flatMap(p => p.mentions.map(([s, e]) => ({p, s, e}))).sort((a, b) => a.s - b.s);
        ages.forEach(a => {
            const prev = allMentions().filter(x => x.e <= a.s && a.s - x.e <= 90 && !/[.]/.test(src.slice(x.e, a.s))).pop();
            const closer = ages.some(b => b !== a && b.s < a.s && prev && b.s > prev.e);
            if (prev && !closer) { a.owner = prev.p.key; return; }
            const clauseStart = Math.max(0, ...[src.lastIndexOf('.', a.s), src.lastIndexOf(';', a.s), ...ages.filter(b => b.e <= a.s).map(b => b.e)].map(x => x + 1));
            const p = {key: `r${people.length + 1}`, name: '', unnamed: true, forms: {}, variants: [], mentions: [[clauseStart, clauseStart]], s: clauseStart, e: clauseStart, roleWord: '', fields: {}};
            people.push(p); a.owner = p.key;
        });
        /* — ce que le texte dit de chaque personne : de sa première mention à la personne suivante — */
        const order = allMentions(); const starts = [...new Set(people.map(p => p.s))].sort((x, y) => x - y);
        const exBy = new Map(ex.people.map(q => [norm(q.name), q]));
        people.sort((a, b) => a.s - b.s).forEach((p, i) => {
            const nextS = starts.find(x => x > p.s) ?? src.length, segEnd = Math.min(nextS, p.s + 260), seg = src.slice(p.s, segEnd), segN = norm(seg);
            const F = p.fields, put = (k, v, s, e, extra = {}) => { if (v == null || v === '' || F[k]) return; F[k] = {value: v, s, e, quote: s >= 0 ? quoteAt(src, s, e) : '', ...extra}; };
            const ag = ages.find(a => a.owner === p.key); if (ag) { put('age', ag.n, ag.s, ag.e, {text: ag.text}); if (year) put('birth', year - ag.n, ag.s, ag.e, {approx: true}); }
            const jb = jobsAt.find(j => j.s >= p.s && j.s < segEnd && !(p.unnamed && j.s > (ag?.e ?? segEnd))) || (p.unnamed ? jobsAt.find(j => j.s >= p.s && j.s < (ag?.s ?? segEnd)) : null);
            if (jb) put('job', jb.label, jb.s, jb.e);
            const bp = seg.match(new RegExp(`\\bn[ée]e?\\s+(?:à|a|en|au|dans)\\s+(?:la\\s+|le\\s+|l['’])?(${CAPW}(?:[- ]${CAPW}){0,2})`)); if (bp) put('birthplace', bp[1], p.s + bp.index + bp[0].lastIndexOf(bp[1]), p.s + bp.index + bp[0].length);
            const rs = seg.match(new RegExp(`\\b(?:demeurant|domicili[ée]e?s?|r[ée]sidant|fix[ée]e?s?)\\s+(?:à|a|en|au|dans)\\s+(cette\\s+(?:ville|commune|paroisse)|${CAPW}(?:[- ]${CAPW}){0,2})`, 'i'));
            if (rs) { const here = /^cette\s/i.test(rs[1]); if (!here || opt.place || ex.place) put('residence', here ? (opt.place || ex.place) : rs[1], p.s + rs.index, p.s + rs.index + rs[0].length, here ? {said: rs[1]} : {}); }
            const og = placeHits.find(q => q.s >= p.s && q.s < Math.min(segEnd, p.s + 150) && q.kind !== 'lieu' && !/(?:bataille|combat|si[èe]ge|prise|campagne|affaire)\s+(?:de\s+|d['’]\s*)$/i.test(src.slice(Math.max(0, q.s - 14), q.s)) && /\b(?:de|du|d['’]|de\s+la|de\s+l['’]|signeurs?|seigneurs?|natif|native|originaire|en)\s*$/i.test(src.slice(Math.max(0, q.s - 14), q.s)) && !(F.birthplace && F.birthplace.value === q.name));
            if (og) put('origin', og.name, og.s, og.e);
            // « tous les quatre … de l'Allemagne » : l'origine vaut pour les personnes d'avant
            const all = segN.match(/\btous\s+les\s+(deux|trois|quatre|cinq|six|\d)\b/);
            if (og && all) { const k = toNum(all[1]) || 0; people.filter(q => q.s < p.s).slice(-(k - 1)).forEach(q => { if (!q.fields.origin) q.fields.origin = {value: og.name, s: og.s, e: og.e, quote: quoteAt(src, og.s, og.e), shared: all[0]}; }); }
            // le lien : « frère Corby », « fils de … », « veuve de … »
            const before = src.slice(Math.max(0, p.s - 26), p.s), kb = before.match(new RegExp(`\\b(${KIN})\\s*(?:de\\s+|d['’]\\s*)?$`, 'i'));
            const ka = seg.slice(p.name.length, p.name.length + 60).match(new RegExp(`^[^.;]{0,30}?\\b(${KIN})\\s+(?:de|du|d['’])\\s*(?:feue?\\s+|d[ée]funte?\\s+)?(${CAPW}(?:\\s+${CAPW}){0,2})`, 'i'));
            if (ka) { const of = people.find(q => q !== p && q.mentions.some(([s]) => s === p.s + p.name.length + ka.index + ka[0].lastIndexOf(ka[2]))) || people.find(q => q !== p && sameP(q, ka[2])); put('link', ka[1].toLowerCase(), p.s + p.name.length + ka.index, p.s + p.name.length + ka.index + ka[0].length, {of: of?.key || '', ofName: of?.name || ka[2]}); }
            else if (kb && !p.unnamed) { const prevP = people.filter(q => q.s < p.s).pop(); put('link', kb[1].toLowerCase(), p.s - before.length + kb.index, p.s, {of: prevP?.key || '', ofName: prevP ? (prevP.name || '') : ''}); }
            // l'état : « garçon », « fille majeure », « veuf », « prisonnier »
            const st = seg.match(/\b(gar[çc]on|fille\s+majeure|fille\s+mineure|veuf|veuve|c[ée]libataire|prisonni[eè]re?s?\s+de\s+guerre|prisonni[eè]re?)\b/i);
            if (st) put('status', st[1].toLowerCase().replace(/s(\s|$)/, '$1'), p.s + st.index, p.s + st.index + st[0].length);
            // le rôle : celui de l'acte (déclarant, témoin, parrain, défunt…), sinon le mot qui l'annonce
            const exP = p.name ? exBy.get(norm(p.name)) || ex.people.find(q => sameP({name: q.name}, p.name)) : null;
            const comp = /\bcomparus?\b|\bcomparants?\b/.test(norm(src.slice(Math.max(0, p.s - 80), p.s)));
            const role = exP && exP.role && exP.role !== 'autre' && (exP.role !== 'declarant' || comp) ? exP.role : ({'témoin': 'temoin', 'parrain': 'parrain', 'marraine': 'marraine', 'défunt': 'defunt', 'conjoint': 'conjoint', 'conjoint défunt': 'conjoint', 'sujet': 'sujet'}[p.roleWord] || (/\bcomparus?\b|\bcomparants?\b/.test(norm(src.slice(Math.max(0, p.s - 80), p.s))) ? 'declarant' : ''));
            if (role) put('role', role, p.s, p.e);
            const sp = splitName(p.name); p.given = sp.given; p.surname = sp.surname || ''; if (!p.surname && p.name && !sexOfGiven(p.name)) { p.surname = p.name; p.given = ''; }
            p.sex = exP?.sex && exP.sex !== 'u' ? exP.sex : (F.status && /veuve|fille|prisonniere/.test(norm(F.status.value)) ? 'f' : sexOfGiven(p.given) || (F.link && /soeur|fille|epouse|veuve|mere|tante|cousine|niece/.test(norm(F.link.value)) ? 'f' : F.link || F.status ? 'm' : 'u'));
            void i; void order;
        });
        /* — les événements et le contexte : « bataille d'Ulm », « prisonniers de guerre », « délivrance des prisonniers » — */
        EVENT_RX.forEach(([rx, kind]) => { const g = new RegExp(rx.source.replace(/^\\b/, '(?<![\\p{L}\\d])').replace(/\|\\b/g, '|(?<![\\p{L}\\d])'), 'giu'); let q;
            while ((q = g.exec(src))) { const s = q.index, e = s + q[0].length; if (events.some(x => s < x.e && x.s < e)) continue;
                const label = q[0].replace(/\s+/g, ' ').trim(); let place = '';
                if (kind === 'bataille' && /^[A-ZÀ-Ý]/.test(q[2] || '')) place = q[2];
                if (kind === 'prisonniers' && events.some(x => x.kind === 'prisonniers')) continue;
                events.push({key: `e${events.length + 1}`, kind, label: label.charAt(0).toUpperCase() + label.slice(1), place, s, e, quote: quoteAt(src, s, e), line: lineOf(src, s), year: null}); } });
        events.sort((a, b) => a.s - b.s);
        /* — la sorte d'acte, devinée (proposée) — */
        let kind = guessKind(src), kindWhy = '';
        if (kind) kindWhy = (src.match(KIND_RX.find(([k]) => k === kind)[1]) || [''])[0];
        else if (MILITARY.test(src)) { kind = 'militaire'; kindWhy = [...new Set((src.match(/\bprisonni\w*|\bbataille\b|\br[ée]giment\b|\bsoldats?\b|\barm[ée]e\b|\bconscri\w*|\bdans les armes\b/gi) || []).map(x => x.toLowerCase()))].slice(0, 3).join(', '); }
        else if (/\bpar-?devant\b[^.]{0,60}\bnotaire\b/i.test(src)) { kind = 'notarial'; kindWhy = 'notaire'; }
        /* — les nombres qui restent (ni date ni âge) : « tous les quatre », « 16 » — */
        const numRx = /\b(\d{1,4}|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cent)\b/gi;
        while ((m = numRx.exec(src))) { if (usedAt(m.index, m.index + m[0].length)) continue; const n = toNum(m[0]); if (n == null) continue; numbers.push({key: `n${numbers.length + 1}`, n, text: m[0], s: m.index, e: m.index + m[0].length, quote: quoteAt(src, m.index, m.index + m[0].length), line: lineOf(src, m.index)}); }
        const places = []; placeHits.forEach(p => { const q = places.find(x => norm(x.name) === norm(p.name)); if (q) q.mentions.push([p.s, p.e]); else places.push({key: `l${places.length + 1}`, name: p.name, kind: p.kind, s: p.s, e: p.e, mentions: [[p.s, p.e]], quote: quoteAt(src, p.s, p.e), line: lineOf(src, p.s)}); });
        people.forEach(p => { p.line = lineOf(src, p.s); p.quote = quoteAt(src, p.s, Math.max(p.e, p.fields.age?.e || p.e)); });
        return {year, act: ex, actDate: dates.find(d => d.act) || null, kind: kind ? {value: kind, why: kindWhy} : null, people, rejected, places, dates, ages, events, numbers};
    }

    /** IA locale : ses propositions (déjà vérifiées par le serveur) ajoutées au repérage, marquées ai: true ; rien n'est remplacé */
    function mergeAi(rf, ai) {
        if (!rf || !ai || typeof ai !== 'object') return rf;
        const str = v => (typeof v === 'string' ? v.trim().slice(0, 120) : typeof v === 'number' ? String(v) : '');
        (Array.isArray(ai.personnes) ? ai.personnes : []).slice(0, 40).forEach(x => {
            const nom = str(x.nom), pre = str(x.prenom), full = [pre, nom].filter(Boolean).join(' '); if (!full) return;
            let p = rf.people.find(q => q.name && (nameClose(splitName(q.name).surname || q.name, nom || pre) && (!pre || !splitName(q.name).given || nameClose(splitName(q.name).given, pre))));
            if (!p) { p = {key: `r${rf.people.length + 1}`, name: full, given: pre, surname: nom, sex: sexOfGiven(pre) || 'u', forms: {[full]: 1}, variants: [], mentions: [], s: -1, e: -1, fields: {}, ai: true, line: 0, quote: ''}; const at = rf.act ? -1 : -1; void at; rf.people.push(p); }
            const add = (k, v, extra = {}) => { if (v === '' || v == null || p.fields[k]) return; p.fields[k] = {value: v, s: -1, e: -1, quote: '', ai: true, ...extra}; };
            const age = Number.parseInt(str(x.age), 10); if (Number.isFinite(age) && age >= 0 && age <= 120) { add('age', age); if (rf.year) add('birth', rf.year - age, {approx: true}); }
            add('job', str(x.metier).toLowerCase()); add('origin', str(x.lieu)); add('link', str(x.lien).toLowerCase()); const r = norm(str(x.role)); add('role', /temoin/.test(r) ? 'temoin' : /declar|compar/.test(r) ? 'declarant' : /parrain/.test(r) ? 'parrain' : /marraine/.test(r) ? 'marraine' : /defunt|decede/.test(r) ? 'defunt' : r ? 'autre' : '');
        });
        (Array.isArray(ai.lieux) ? ai.lieux : []).slice(0, 40).forEach(x => { const n = str(typeof x === 'string' ? x : x?.nom); if (n && !rf.places.some(q => norm(q.name) === norm(n))) rf.places.push({key: `l${rf.places.length + 1}`, name: n, kind: GAZ_IX.get(norm(n))?.kind || 'lieu', s: -1, e: -1, mentions: [], quote: '', ai: true}); });
        (Array.isArray(ai.dates) ? ai.dates : []).slice(0, 40).forEach(x => { const n = str(typeof x === 'string' ? x : x?.texte); if (n && !rf.dates.some(q => norm(q.label) === norm(n))) rf.dates.push({key: `d${rf.dates.length + 1}`, label: n, iso: /^\d{4}(-\d\d){0,2}$/.test(n) ? n : '', repub: false, act: false, s: -1, e: -1, quote: '', ai: true}); });
        const so = str(ai.sorte); if (so && !rf.kind) rf.kind = {value: '', label: so, why: '', ai: true}; else if (so && rf.kind) rf.kind.aiLabel = so;
        rf.ai = true; return rf;
    }

    /**
     * Pour « ✓ Ajouter à la généalogie » : les fiches de richFind complètent celles d'extractAct (âge, métier, domicile cochés),
     * et les personnes nommées en plus s'ajoutent. keep(personKey, fieldKey) → vrai si la case est cochée.
     */
    function mergeRich(ex, rf, keep = () => true) {
        if (!ex || !rf) return ex;
        // les faux noms (« BTIS Afoaut ») et les variantes du même nom (« Jemielet » pour « Jemichet ») ne font pas de fiche à part
        const gone = new Set(ex.people.filter(q => rf.rejected.some(r => norm(r.label) === norm(q.name)) || rf.people.some(p => p.name && norm(p.name) !== norm(q.name) && (p.variants || []).some(w => norm(w) === norm(q.name)) && ex.people.some(x => norm(x.name) === norm(p.name)))).map(q => q.key));
        if (gone.size) { ex.people = ex.people.filter(q => !gone.has(q.key)); ex.people.forEach(q => { q.relations = q.relations.filter(r => !gone.has(r.of)); });
            ex.relations = ex.relations.filter(r => ![r.a, r.b, r.child, r.father, r.mother].some(k => k && gone.has(k))); }
        let seq = ex.people.reduce((n, p) => Math.max(n, Number(String(p.key).slice(1)) || 0), 0);
        rf.people.filter(p => p.name && keep(p.key, '')).forEach(p => {
            const F = p.fields, v = k => (F[k] && keep(p.key, k) ? F[k].value : null);
            let q = ex.people.find(x => norm(x.name) === norm(p.name) || (p.variants || []).some(w => norm(w) === norm(x.name)));
            if (!q) { q = {key: `p${++seq}`, name: p.name, given: p.given || '', surname: p.surname || '', sex: p.sex || 'u', role: 'autre', job: '', age: null, residence: '', deceased: false, relations: [], s: p.s, e: p.e, mentions: p.mentions || [], birthYear: null, fromRich: p.key}; ex.people.push(q); }
            if (!q.job && v('job')) q.job = v('job'); if (q.age == null && v('age') != null) q.age = Number(v('age'));
            if (!q.residence && v('residence')) q.residence = v('residence');
            if (q.role === 'autre' && v('role') && v('role') !== 'autre') q.role = v('role');
            if (q.age != null && ex.year && !q.birthYear) q.birthYear = ex.year - q.age;
            q.rich = p.key;
        });
        return ex;
    }

    const api = {cropBox, otsu, unsureStats, extractAct, guessKind, splitName, sexOfGiven, sourceGuess, norm, richFind, mergeAi, mergeRich, nameClose, badLetters, lev};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LCNDA_TXACTE = Object.assign(root.LCNDA_TXACTE || {}, api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
