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
            const godCtx = before.match(/\b(parrain|marraine)\b[^.;]{0,30}$/);
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

    const api = {cropBox, otsu, unsureStats, extractAct, guessKind, splitName, sexOfGiven, sourceGuess, norm};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LCNDA_TXACTE = Object.assign(root.LCNDA_TXACTE || {}, api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
