/* LCNDA — 📜 Atelier de transcription, outils en plus (3) : les calculs, sans page (aussi require() dans Node :
 * tests/test-atelier-plus3.js). L'écran : heritage-atelier-plus3.js. Serveur : lib/atelier_plus3.php.
 *  🗂 7  suggestOutline(texte)       le plan d'un long acte (comparution, apports, clauses, inventaire pièce par pièce, signatures…)
 *        d'après des mots connus ; resolveOutline : chaque titre retrouvé par le début de sa ligne (at), même si le texte a bougé.
 *  👥 8  peopleRows(ex, people)      les personnes de l'acte en tableau (rôle, âge, métier, domicile, fiche reliée).
 *  🕸 9  sketchLayout(ex) / sketchSvg  le croquis des liens dits par l'acte (parents, enfant, époux, parrain, marraine, témoins).
 *  ✏️ 10 scanMarks / wrapMark / readingText / teiInline   mot rayé 〚…〛, ajout entre les lignes \…/, note en marge [en marge : …]
 *        (les signes de Leyde, les crochets de l'app) ; en TEI : <del rend="strikethrough">, <add place="above">, <note place="margin">.
 *  ❓ 11 scanDoubts(texte)            les mots douteux : « Ma?aud », « mot[?] », « Ma…d », « [illisible] » (même règle que le serveur).
 *  🎤 12 dictationPlan(env)           la dictée : possible ? sur cet ordinateur ou en ligne ? refusée pour un acte confidentiel…
 *  🆚 13 parseReleve / guessMapping / compareReleve   une ligne de relevé collée (CSV, point-virgule, tabulation) comparée à la mienne.
 *  🔗 14 TWIN_RELS                    les actes jumeaux (bans ↔ mariage, naissance ↔ baptême, décès ↔ inhumation, contrat ↔ mariage).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.txPlus3Data = api; }
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = root?.LCNDA_I18N; return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ſ/g, 's').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/[’`]/g, "'");
    const lineStart = (text, i) => { const k = String(text).lastIndexOf('\n', Math.max(0, i - 1)); return i <= 0 ? 0 : k + 1; };

    /* ═════════ 🗂 7. Le plan d'un long acte ═════════ */
    /** les parties qu'on reconnaît : la clé, le titre proposé, les mots (le premier trouvé donne la place) ; many : une partie qui revient (les pièces d'un inventaire) */
    const OUTLINE = [
        {key: 'preambule', h: 'Préambule', rx: /\b(?:par[- ]?devant|pardevant)\s+(?:nous|les?\s+notaires?|ma[iî]tre)|\bl['’]an\s+(?:mil|\d{4})/i},
        {key: 'comparution', h: 'Comparution', rx: /\b(?:furent\s+pr[ée]sents?|sont\s+comparus?|ont\s+comparu|a\s+comparu|compar(?:ant|urent)|est\s+comparu)/i},
        {key: 'objet', h: 'Objet de l’acte', rx: /\b(?:lesquels?|lesquelles)\s+(?:ont|a)\s+(?:dit|d[ée]clar[ée]|requis|fait)|\b(?:dans\s+la\s+vue|en\s+vue)\s+du\s+mariage|\bpour\s+parvenir\s+(?:à|au)/i},
        {key: 'apports', h: 'Apports et dot', rx: /\b(?:apport(?:e|ent|s)?|se\s+constitu(?:e|ent)|constitu(?:e|ent)\s+en\s+dot|en\s+(?:avancement|faveur)\s+d['’]hoirie|trousseau|dot\b)/i},
        {key: 'clauses', h: 'Clauses', rx: /\b(?:communaut[ée]\s+de\s+biens|douaire|pr[ée]ciput|au\s+survivant|donation\s+mutuelle|il\s+a\s+[ée]t[ée]\s+convenu|à\s+la\s+charge\s+de|sous\s+la\s+condition)/i},
        {key: 'piece', h: 'Dans {x}', many: true, rx: /\b(?:dans|en)\s+(la\s+cuisine|la\s+chambre(?:\s+(?:haute|basse|du\s+fond|à\s+coucher|de\s+derri[èe]re|sur\s+la\s+rue))?|le\s+grenier|la\s+grange|l['’][ée]curie|l['’][ée]table|la\s+cave|le\s+cellier|la\s+boutique|l['’]atelier|la\s+salle|le\s+fournil)\b/i},
        {key: 'bestiaux', h: 'Bestiaux', rx: /\b(?:bestiaux|une?\s+(?:vache|paire\s+de\s+b[œo]eufs|jument|cheval|brebis|cochons?))\b/i},
        {key: 'argent', h: 'Argent comptant', rx: /\bargent\s+comptant|\bdeniers\s+comptants/i},
        {key: 'titres', h: 'Titres et papiers', rx: /\btitres\s+et\s+papiers|\bpapiers\s+de\s+la\s+succession|\bensuivent\s+les\s+titres/i},
        {key: 'dettes', h: 'Dettes', rx: /\b(?:dettes\s+(?:actives|passives)|est\s+d[ûu]\s+(?:à|par))/i},
        {key: 'lots', h: 'Partage et lots', rx: /\b(?:premier|second|deuxi[èe]me|troisi[èe]me)\s+lot\b|\btirage\s+(?:au\s+sort\s+)?des\s+lots/i},
        {key: 'estimation', h: 'Estimation', rx: /\b(?:prisée?|estim[ée]s?\s+(?:à|la\s+somme)|montant\s+total)/i},
        {key: 'clotures', h: 'Clôture', rx: /\b(?:dont\s+acte|fait\s+et\s+pass[ée]|lecture\s+(?:faite|leur\s+ayant\s+[ée]t[ée]\s+faite))/i},
        {key: 'signatures', h: 'Signatures', rx: /\b(?:ont\s+sign[ée]|a\s+sign[ée]|ne\s+savoir\s+signer|ont\s+d[ée]clar[ée]\s+ne\s+savoir|signé\s*:)/i},
    ];
    const ANCHOR = 32;
    const anchorOf = (text, s) => String(text).slice(s, s + ANCHOR).split('\n')[0];
    const lineCount = t => String(t || '').split('\n').filter(l => l.trim()).length;
    /** un acte assez long pour un plan (25 lignes, ou 2 500 lettres) */
    const isLong = t => lineCount(t) >= 25 || String(t || '').length >= 2500;
    /** les titres proposés : au début de la ligne où le mot apparaît pour la première fois (les pièces : chaque fois) */
    function suggestOutline(text) {
        const T = String(text || ''), out = [];
        OUTLINE.forEach(o => {
            const rx = new RegExp(o.rx.source, o.rx.flags.includes('g') ? o.rx.flags : o.rx.flags + 'g');
            let m, seen = 0; while ((m = rx.exec(T))) {
                const s = lineStart(T, m.index); if (out.some(x => x.s === s)) { if (!o.many) break; continue; }
                const h = o.many ? i18n(o.h, {x: m[1].replace(/\s+/g, ' ').toLowerCase()}) : i18n(o.h);
                out.push({s, h, key: o.key, at: anchorOf(T, s), auto: true});
                if (!o.many || ++seen >= 12) break;
            }
        });
        return out.sort((a, b) => a.s - b.s).slice(0, 60);
    }
    /** chaque titre gardé retrouvé dans le texte d'aujourd'hui : sa place (s) si le début de ligne (at) y est encore, sinon le plus proche ; lost si plus là */
    function resolveOutline(outline, text) {
        const T = String(text || '');
        return (Array.isArray(outline) ? outline : []).map(o => {
            const s0 = Math.max(0, Math.min(T.length, Number(o.s) || 0)), at = String(o.at || '');
            if (!at || T.startsWith(at, s0)) return {...o, s: lineStart(T, s0), lost: false};
            let best = -1, k = T.indexOf(at); while (k >= 0) { if (best < 0 || Math.abs(k - s0) < Math.abs(best - s0)) best = k; k = T.indexOf(at, k + 1); }
            return best >= 0 ? {...o, s: lineStart(T, best), lost: false} : {...o, s: lineStart(T, s0), lost: true};
        }).sort((a, b) => a.s - b.s);
    }
    /** les propositions ajoutées à ce qui est gardé (jamais sur une ligne qui a déjà un titre) */
    function mergeOutline(kept, sugg) {
        const out = [...(kept || [])];
        (sugg || []).forEach(x => { if (!out.some(o => o.s === x.s)) out.push(x); });
        return out.sort((a, b) => a.s - b.s).slice(0, 60);
    }
    /** ce qui se garde avec l'acte (data.outline) */
    const cleanOutline = (list, text) => resolveOutline(list, text).filter(o => String(o.h || '').trim()).slice(0, 60)
        .map(o => ({s: o.s, h: String(o.h).trim().slice(0, 120), at: anchorOf(text, o.s), ...(o.auto ? {auto: true} : {})}));

    /* ═════════ 👥 8. Les personnes de l'acte, en tableau ═════════ */
    const ROLES = {epoux: 'Époux', epouse: 'Épouse', pere_epoux: 'Père de l’époux', mere_epoux: 'Mère de l’époux', pere_epouse: 'Père de l’épouse', mere_epouse: 'Mère de l’épouse', pere: 'Père', mere: 'Mère',
        pere_defunt: 'Père du défunt', mere_defunt: 'Mère du défunt', sujet: 'Enfant', defunt: 'Défunt', conjoint: 'Conjoint', temoin: 'Témoin', parrain: 'Parrain', marraine: 'Marraine', declarant: 'Déclarant', parent: 'Parent', autre: 'Autre personne'};
    /** le rôle lisible ; un « parent » de l'enfant devient Père ou Mère */
    function roleOf(p, ex) {
        if (p.role === 'parent') { const r = (p.relations || []).find(x => x.type === 'parent_of'), of = r && (ex?.people || []).find(q => q.key === r.of);
            if (of && ['sujet', 'defunt'].includes(of.role)) return p.sex === 'f' ? 'mere' : 'pere';
            if (of && of.role === 'epoux') return p.sex === 'f' ? 'mere_epoux' : 'pere_epoux';
            if (of && of.role === 'epouse') return p.sex === 'f' ? 'mere_epouse' : 'pere_epouse'; }
        return p.role || 'autre';
    }
    const roleLabel = (role, sex) => i18n(role === 'defunt' && sex === 'f' ? 'Défunte' : role === 'conjoint' && sex === 'f' ? 'Conjointe' : ROLES[role] || 'Autre personne');
    const sameName = (a, b) => { const x = fold(a).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(), y = fold(b).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); return !!x && x === y; };
    /**
     * ex : ce que l'app a trouvé (extractAct) ; people : data.people (les noms gardés, avec la fiche reliée)
     * → [{key, name, role, label, sex, age, job, residence, deceased, s, e, idx (dans data.people, ou -1), person_id}]
     * Les noms gardés que le repérage n'a pas retrouvés sont ajoutés à la fin.
     */
    function peopleRows(ex, people) {
        const P = Array.isArray(people) ? people : [], used = new Set(), rows = [];
        (ex?.people || []).filter(p => p.name && !p.unnamed).forEach(p => {
            const role = roleOf(p, ex);
            let idx = P.findIndex((q, i) => !used.has(i) && q && sameName(q.name, p.name));
            if (idx < 0) idx = P.findIndex((q, i) => !used.has(i) && q && q.e > q.s && q.s < p.e && p.s < q.e);
            if (idx >= 0) used.add(idx);
            rows.push({key: p.key, name: p.name, given: p.given || '', surname: p.surname || '', role, label: roleLabel(role, p.sex), sex: p.sex || 'u', age: p.age ?? null, job: p.job || '', residence: p.residence || '', deceased: !!p.deceased,
                birthYear: p.birthYear || null, s: p.s, e: p.e, idx, person_id: idx >= 0 ? Number(P[idx].person_id) || 0 : 0});
        });
        P.forEach((q, i) => { if (used.has(i) || !q?.name) return; rows.push({key: `k${i}`, name: q.name, given: '', surname: '', role: q.role || 'autre', label: roleLabel(q.role || 'autre', ''), sex: 'u', age: null, job: '', residence: '', deceased: false, birthYear: null, s: Number(q.s) || 0, e: Number(q.e) || 0, idx: i, person_id: Number(q.person_id) || 0}); });
        return rows;
    }
    /** prénom et nom d'un nom écrit (« Pierre MAZAUD », « Jean de LA COMBE ») */
    function splitName(name) {
        const w = String(name || '').trim().split(/\s+/).filter(Boolean); if (!w.length) return {given: '', surname: ''};
        let k = w.findIndex((x, i) => i > 0 && /^\p{Lu}[\p{Lu}'’-]+$/u.test(x)); if (k < 0) k = w.length > 1 ? w.length - 1 : 1;
        while (k > 1 && /^(de|du|des|d'|d’|la|le)$/i.test(w[k - 1])) k--;
        return {given: w.slice(0, k).join(' '), surname: w.slice(k).join(' ')};
    }

    /* ═════════ 🕸 9. Le croquis des liens ═════════ */
    const NW = 150, NH = 46, GX = 26, GY = 70;
    /**
     * Les personnes posées par rangée : en haut les parents, au milieu l'enfant / les époux / le défunt (et son conjoint),
     * à côté parrain et marraine, en bas les témoins. Les liens : parent → enfant, conjoints, parrain / marraine → filleul (pointillé), témoins (pointillé).
     * → {nodes: [{key, x, y, name, role, label, sex, deceased}], edges: [{a, b, type: parent|spouse|sponsor|witness}], w, h}
     */
    function sketchLayout(ex) {
        const ps = (ex?.people || []).filter(p => p.name && !p.unnamed).map(p => ({...p, role2: roleOf(p, ex)}));
        const byKey = k => ps.find(p => p.key === k);
        const main = ps.filter(p => ['sujet', 'defunt', 'epoux', 'epouse'].includes(p.role2));
        const spouses = ps.filter(p => p.role2 === 'conjoint' || (p.relations || []).some(r => r.type === 'spouse_of' && main.some(m => m.key === r.of)));
        const parentOf = p => (p.relations || []).filter(r => r.type === 'parent_of').map(r => r.of);
        const parents = ps.filter(p => !main.includes(p) && (['pere', 'mere', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'pere_defunt', 'mere_defunt'].includes(p.role2) || parentOf(p).length));
        const sponsors = ps.filter(p => ['parrain', 'marraine'].includes(p.role2));
        const witnesses = ps.filter(p => !main.includes(p) && !spouses.includes(p) && !parents.includes(p) && !sponsors.includes(p));
        const mid = [...main.filter(p => p.role2 === 'epoux'), ...main.filter(p => p.role2 !== 'epoux'), ...spouses.filter(p => !main.includes(p))];
        // en haut : les parents de chacun, dans l'ordre de la rangée du milieu
        const topOrder = []; mid.forEach(m => parents.filter(p => parentOf(p).includes(m.key) || (m.role2 === 'epoux' && /_epoux$/.test(p.role2)) || (m.role2 === 'epouse' && /_epouse$/.test(p.role2)) || (['sujet', 'defunt'].includes(m.role2) && /^(pere|mere)(_defunt)?$/.test(p.role2)))
            .sort((a, b) => (a.sex === 'f') - (b.sex === 'f')).forEach(p => { if (!topOrder.includes(p)) topOrder.push(p); }));
        parents.forEach(p => { if (!topOrder.includes(p)) topOrder.push(p); });
        const rows = [topOrder, [sponsors.find(p => p.role2 === 'parrain'), ...mid, sponsors.find(p => p.role2 === 'marraine'), ...sponsors.filter(p => !['parrain', 'marraine'].includes(p.role2))].filter(Boolean), witnesses].filter(r => r.length);
        const w = Math.max(NW, ...rows.map(r => r.length * NW + (r.length - 1) * GX)) + 2 * GX;
        const nodes = [];
        rows.forEach((r, ri) => { const rw = r.length * NW + (r.length - 1) * GX, x0 = (w - rw) / 2;
            r.forEach((p, i) => nodes.push({key: p.key, x: Math.round(x0 + i * (NW + GX)), y: GX + ri * (NH + GY), name: p.name, role: p.role2, label: roleLabel(p.role2, p.sex), sex: p.sex || 'u', deceased: !!p.deceased})); });
        const has = k => nodes.some(n => n.key === k), edges = [];
        const add = (a, b, type) => { if (a && b && a !== b && has(a) && has(b) && !edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) edges.push({a, b, type}); };
        ps.forEach(p => (p.relations || []).forEach(r => { if (r.type === 'parent_of') add(p.key, r.of, 'parent'); if (r.type === 'spouse_of') add(p.key, r.of, 'spouse'); }));
        // les parents nommés par leur rôle, sans lien repéré : vers l'enfant, l'époux ou l'épouse
        parents.forEach(p => { if (edges.some(e => e.a === p.key && e.type === 'parent')) return; const tgt = /_epoux$/.test(p.role2) ? mid.find(m => m.role2 === 'epoux') : /_epouse$/.test(p.role2) ? mid.find(m => m.role2 === 'epouse') : mid.find(m => ['sujet', 'defunt'].includes(m.role2)); if (tgt) add(p.key, tgt.key, 'parent'); });
        const fp = parents.filter(p => /^pere/.test(p.role2)), mp = parents.filter(p => /^mere/.test(p.role2));
        fp.forEach(f => { const m = mp.find(x => x.role2.replace(/^mere/, '') === f.role2.replace(/^pere/, '')); if (m) add(f.key, m.key, 'spouse'); });
        const ep = mid.find(m => m.role2 === 'epoux'), es = mid.find(m => m.role2 === 'epouse'); if (ep && es) add(ep.key, es.key, 'spouse');
        const subj = mid.find(m => ['sujet', 'defunt'].includes(m.role2)) || ep || mid[0];
        if (subj) { sponsors.forEach(p => add(p.key, subj.key, 'sponsor')); witnesses.forEach(p => add(p.key, (ep && es && p.role2 === 'temoin') ? ep.key : subj.key, 'witness')); }
        void byKey;
        return {nodes, edges, w: Math.round(w), h: Math.round(GX * 2 + rows.length * NH + (rows.length - 1) * GY)};
    }
    const xesc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** le croquis en SVG (couleurs : celles du thème, via des classes ; rien d'autre que du texte et des traits) */
    function sketchSvg(L, o = {}) {
        if (!L?.nodes?.length) return '';
        const at = k => L.nodes.find(n => n.key === k), cut = s => (s.length > 22 ? `${s.slice(0, 21)}…` : s);
        const line = e => { const a = at(e.a), b = at(e.b); if (!a || !b) return '';
            const same = a.y === b.y, x1 = a.x + NW / 2, y1 = same ? a.y + NH / 2 : a.y + (a.y < b.y ? NH : 0), x2 = b.x + NW / 2, y2 = same ? b.y + NH / 2 : b.y + (a.y < b.y ? 0 : NH);
            const xa = same ? (a.x < b.x ? a.x + NW : a.x) : x1, xb = same ? (a.x < b.x ? b.x : b.x + NW) : x2;
            return `<line class="ap3-sk-e is-${e.type}" x1="${xa}" y1="${y1}" x2="${xb}" y2="${y2}"${e.type === 'parent' ? ' marker-end="url(#ap3-arrow)"' : ''}><title>${xesc(i18n({parent: 'parent de', spouse: 'conjoints', sponsor: 'parrain ou marraine de', witness: 'témoin'}[e.type]))}</title></line>`; };
        const node = n => `<g class="ap3-sk-n is-${n.sex}${n.deceased ? ' is-dead' : ''}" data-ap3-sk="${xesc(n.key)}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button" aria-label="${xesc(`${n.label} : ${n.name}`)}"><rect width="${NW}" height="${NH}" rx="8"/>`
            + `<text class="ap3-sk-r" x="${NW / 2}" y="16" text-anchor="middle">${xesc(n.label)}</text><text class="ap3-sk-t" x="${NW / 2}" y="34" text-anchor="middle" data-i18n-off>${xesc(cut(n.name) + (n.deceased ? ' †' : ''))}</text></g>`;
        return `<svg class="ap3-sk" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}" role="img" aria-label="${xesc(o.title || i18n('Croquis des liens dits par l’acte'))}" xmlns="http://www.w3.org/2000/svg">`
            + '<defs><marker id="ap3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ap3-sk-a"/></marker></defs>'
            + L.edges.map(line).join('') + L.nodes.map(node).join('') + '</svg>';
    }

    /* ═════════ ✏️ 10. Mots rayés, ajouts entre les lignes, notes en marge ═════════ */
    // les signes de Leyde (〚rayé〛, \ajouté au-dessus/) et les crochets de l'app ([?], [illisible], [en marge : …])
    const MARKS = {del: ['〚', '〛'], add: ['\\', '/'], margin: ['[en marge : ', ']']};
    const MARK_RX = /〚([^〚〛\n]{1,200})〛|\\([^\\/\n]{1,200})\/|\[(?:en\s+)?marge\s*:\s*([^\]\n]{1,400})\]/giu;
    /** → [{type: del|add|margin, s, e (toute la marque), is, ie (le texte dedans), inner}] */
    function scanMarks(text) {
        const T = String(text || ''), out = []; let m; MARK_RX.lastIndex = 0;
        while ((m = MARK_RX.exec(T))) {
            const type = m[1] != null ? 'del' : m[2] != null ? 'add' : 'margin', inner = m[1] ?? m[2] ?? m[3], is = m.index + m[0].indexOf(inner);
            out.push({type, s: m.index, e: m.index + m[0].length, is, ie: is + inner.length, inner});
        }
        return out;
    }
    /** le passage choisi entouré de la marque ; sans passage : la marque vide, le curseur dedans → {text, caret} */
    function wrapMark(type, sel) {
        const [a, b] = MARKS[type] || MARKS.del, s = String(sel || '');
        const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
        return core ? {text: `${lead}${a}${core}${b}${trail}`, caret: lead.length + a.length + core.length + b.length} : {text: a + b, caret: a.length};
    }
    /** le texte « lu » : les mots rayés retirés, les ajouts à leur place, les notes en marge à part (à la fin) */
    function readingText(text) {
        const T = String(text || ''), notes = [];
        const body = T.replace(MARK_RX, (m0, d, a, n) => (d != null ? '' : a != null ? a : (notes.push(n.trim()), ''))).replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:])/g, '$1');
        return notes.length ? `${body.replace(/\s+$/, '')}\n\n${i18n('En marge')} :\n${notes.map(n => `- ${n}`).join('\n')}` : body;
    }
    /** une ligne en TEI : le texte échappé par x(), les marques en éléments */
    function teiInline(line, x) {
        const T = String(line ?? ''), E = x || xesc; let out = '', at = 0, m; MARK_RX.lastIndex = 0;
        while ((m = MARK_RX.exec(T))) {
            out += E(T.slice(at, m.index));
            out += m[1] != null ? `<del rend="strikethrough">${E(m[1])}</del>` : m[2] != null ? `<add place="above">${E(m[2])}</add>` : `<note place="margin">${E(m[3].trim())}</note>`;
            at = m.index + m[0].length;
        }
        return out + E(T.slice(at));
    }

    /* ═════════ ❓ 11. Les mots douteux ═════════ */
    /** un mot avec « ? » ou « … » (Ma?aud, Ma…d, mot[?]), « [?] » seul, « [illisible] » → [{s, e, word, line (n° 1…), kind}] */
    function scanDoubts(text) {
        const T = String(text || ''), out = []; let ln = 1, pos = 0;
        T.split('\n').forEach(L => {
            const rx = /\S+/gu; let m;
            while ((m = rx.exec(L))) {
                const w = m[0];
                const kind = /\[illisible\]/i.test(w) ? 'illisible' : /\[\?\]/.test(w) || /^\?+$/.test(w) ? 'mark' : /\p{L}\?|\?\p{L}|\p{L}(?:…|\.{3})|(?:…|\.{3})\p{L}|^…$/u.test(w) ? 'word' : '';
                if (kind) out.push({s: pos + m.index, e: pos + m.index + w.length, word: w, line: ln, kind});
            }
            pos += L.length + 1; ln++;
        });
        return out;
    }

    /* ═════════ 🎤 12. La dictée ═════════ */
    /**
     * env : {pref (réglage allumé), hasSR, desktop (l'app de bureau : pas de service de reconnaissance), local ('available' | autre),
     *        kiosk, guest (appareil invité du réseau local), living (une fiche reliée vivante), confidential (fiche confidentielle, acte récent)}
     * → {ok, mode: 'local' | 'online' | '', why: '' | off | none | desktop | kiosk | guest | living | confidential}
     * En ligne (la voix part vers le service du navigateur) : jamais pour un acte confidentiel, en consultation ni sur un appareil invité.
     */
    function dictationPlan(env = {}) {
        if (!env.pref) return {ok: false, mode: '', why: 'off'};
        if (env.kiosk) return {ok: false, mode: '', why: 'kiosk'};
        if (!env.hasSR) return {ok: false, mode: '', why: 'none'};
        const local = env.local === 'available';
        if (env.desktop && !local) return {ok: false, mode: '', why: 'desktop'};
        if (local) return {ok: true, mode: 'local', why: ''};
        if (env.guest) return {ok: false, mode: 'online', why: 'guest'};
        if (env.living) return {ok: false, mode: 'online', why: 'living'};
        if (env.confidential) return {ok: false, mode: 'online', why: 'confidential'};
        return {ok: true, mode: 'online', why: ''};
    }

    /* ═════════ 🆚 13. Comparer avec un relevé trouvé ailleurs ═════════ */
    const FIELDS = [['date', 'Date', ['date', 'date acte', 'jour', 'date de l acte', 'date evenement']], ['type', 'Type d’acte', ['type', 'type d acte', 'nature', 'acte', 'evenement']],
        ['nom', 'Nom', ['nom', 'patronyme', 'nom de famille', 'nom du sujet', 'nom epoux', 'nom du defunt']], ['prenom', 'Prénom', ['prenom', 'prenoms', 'prenom epoux', 'prenom du sujet']],
        ['pere', 'Père', ['pere', 'nom du pere', 'pere epoux', 'prenom pere']], ['mere', 'Mère', ['mere', 'nom de la mere', 'mere epoux', 'prenom mere']],
        ['conjoint', 'Conjoint', ['conjoint', 'epouse', 'epoux', 'conjointe', 'nom epouse']], ['parrain', 'Parrain', ['parrain']], ['marraine', 'Marraine', ['marraine']],
        ['temoins', 'Témoins', ['temoins', 'temoin', 'temoin 1', 'temoin 2']], ['lieu', 'Lieu', ['lieu', 'commune', 'paroisse', 'ville', 'localite']],
        ['cote', 'Cote', ['cote', 'reference', 'ref']], ['vue', 'Vue', ['vue', 'page', 'folio', 'image']], ['notes', 'Notes', ['notes', 'note', 'observations', 'remarques', 'commentaire']]];
    const FIELD_KEYS = FIELDS.map(f => f[0]);
    const fieldLabel = k => i18n((FIELDS.find(f => f[0] === k) || [k, k])[1]);
    /** une ligne CSV coupée (guillemets compris) */
    function splitLine(line, sep) {
        const out = []; let cur = '', q = false;
        for (let i = 0; i < line.length; i++) { const c = line[i];
            if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
            else if (c === '"' && !cur.trim()) q = true; else if (c === sep) { out.push(cur.trim()); cur = ''; } else cur += c; }
        out.push(cur.trim()); return out;
    }
    /** le texte collé → {header: [noms] | null, cells: [valeurs], sep} ; la première ligne est un en-tête si ses cases ressemblent à des noms de colonne */
    function parseReleve(raw) {
        const lines = String(raw || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) return {header: null, cells: [], sep: ';'};
        const count = (l, c) => l.split(c).length - 1, seps = ['\t', ';', '|', ','];
        const sep = seps.map(c => [c, count(lines[0], c)]).sort((a, b) => b[1] - a[1])[0][1] ? seps.map(c => [c, count(lines[0], c)]).sort((a, b) => b[1] - a[1])[0][0] : ';';
        const rows = lines.map(l => splitLine(l, sep));
        const known = r => r.filter(c => fieldOf(c)).length;
        if (rows.length >= 2 && known(rows[0]) >= Math.max(2, Math.ceil(rows[0].length / 3))) return {header: rows[0], cells: rows[1], sep};
        return {header: null, cells: rows[0], sep};
    }
    const fkey = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
    function fieldOf(name) { const n = fkey(name); if (!n) return ''; const f = FIELDS.find(([k, , syn]) => syn.includes(n) || n === k); if (f) return f[0]; const g = FIELDS.find(([, , syn]) => syn.some(s => n.startsWith(s + ' ') || n.endsWith(' ' + s))); return g ? g[0] : ''; }
    const looksDate = v => /\b(1[2-9]\d{2}|20\d{2})\b/.test(v) && /\d/.test(v) && (/\d{1,2}[/.\-]\d{1,2}|janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c|\b\d{4}-\d\d/i.test(v) || /^\s*\d{4}\s*$/.test(v));
    const KIND_WORDS = /^(?:b|bapt[eê]me|baptism|n|naissance|m|mariage|d|d[ée]c[eè]s|s|s[ée]pulture|inhumation|bans?|publication)$/i;
    /** la case de chaque valeur : d'après l'en-tête ; sans en-tête, l'ordre du relevé de l'app (date, type, nom, prénom, père, mère…) corrigé par ce qui se voit (une date) */
    function guessMapping(header, cells) {
        if (header) { const used = new Set(); return header.map(h => { const k = fieldOf(h); if (!k || (used.has(k) && k !== 'temoins')) return ''; used.add(k); return k; }); }
        const c = cells || [], out = c.map(() => ''); let order = [...FIELD_KEYS];
        const di = c.findIndex(looksDate); if (di >= 0) { out[di] = 'date'; order = order.filter(k => k !== 'date'); }
        const ti = c.findIndex((v, i) => i !== di && KIND_WORDS.test(v.trim())); if (ti >= 0) { out[ti] = 'type'; order = order.filter(k => k !== 'type'); }
        c.forEach((v, i) => { if (out[i] || !v.trim()) return; const k = order.shift(); out[i] = k || ''; });
        return out;
    }
    const cmpNorm = v => fold(v).replace(/\b(?:fils|fille|de|du|des|d'|la|le|veuve|veuf|feu|feue)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const dateNorm = v => { const s = fold(v), y = s.match(/\b(1[2-9]\d{2}|20\d{2})\b/)?.[1] || '', MO = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
        let mo = MO.findIndex(m => s.includes(m)) + 1; const rb = s.match(/\b([789x]|10)bre\b/); if (rb) mo = {7: 9, 8: 10, 9: 11, x: 12, 10: 12}[rb[1]];
        const num = s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/); if (num) return `${num[3]}-${num[2].padStart(2, '0')}-${num[1].padStart(2, '0')}`;
        const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (iso) return iso[0];
        const d = s.match(/\b(\d{1,2})(?:er)?\s+(?:[a-z]|[789x]bre|10bre)/)?.[1] || ''; return [y, mo ? String(mo).padStart(2, '0') : '', d ? d.padStart(2, '0') : ''].filter(Boolean).join('-'); };
    /** ma ligne de relevé complétée par ce que l'app lit dans le texte (extractAct) quand le gabarit et les personnes gardées ne disent rien */
    function rowFromEx(ex, base = {}) {
        const out = {...base}, ps = (ex?.people || []).filter(p => p.name && !p.unnamed).map(p => ({...p, r: roleOf(p, ex)}));
        const one = roles => ps.find(p => roles.includes(p.r)), all = roles => ps.filter(p => roles.includes(p.r)).map(p => p.name).join(' ; ');
        const put = (k, v) => { if (!String(out[k] ?? '').trim() && v) out[k] = v; };
        const main = one(ex?.kind === 'mariage' ? ['epoux'] : ['sujet', 'defunt']) || one(['epoux', 'sujet', 'defunt']);
        if (main) { const n = main.given || main.surname ? {given: main.given || '', surname: main.surname || ''} : splitName(main.name); put('nom', n.surname); put('prenom', n.given); }
        put('pere', one(['pere', 'pere_epoux', 'pere_defunt'])?.name); put('mere', one(['mere', 'mere_epoux', 'mere_defunt'])?.name);
        put('conjoint', one(ex?.kind === 'mariage' ? ['epouse'] : ['conjoint'])?.name); put('parrain', one(['parrain'])?.name); put('marraine', one(['marraine'])?.name); put('temoins', all(['temoin']));
        return out;
    }
    /**
     * map : la case de chaque valeur ; cells : les valeurs ; mine : ma ligne de relevé (txp2_releve_row) ; body : mon texte
     * → [{field, label, theirs, mine, state: same | diff | theirs | mine, inText}] (inText : la valeur du relevé se lit dans mon texte)
     */
    function compareReleve(map, cells, mine, body) {
        const B = cmpNorm(body || ''), out = [], theirs = {};
        (map || []).forEach((k, i) => { if (!k) return; const v = String(cells?.[i] ?? '').trim(); if (!v) return; theirs[k] = theirs[k] ? `${theirs[k]} ; ${v}` : v; });
        const nameMine = k => String(mine?.[k] ?? '').trim();
        FIELD_KEYS.forEach(k => {
            const a = theirs[k] || '', b = nameMine(k); if (!a && !b) return;
            const na = k === 'date' ? dateNorm(a) : cmpNorm(a), nb = k === 'date' ? dateNorm(b) : cmpNorm(b);
            const same = na && nb && (na === nb || (k !== 'date' && k !== 'vue' && (na.split(' ').every(w => nb.split(' ').includes(w)) || nb.split(' ').every(w => na.split(' ').includes(w)))) || (k === 'date' && (na.startsWith(nb) || nb.startsWith(na))));
            const state = a && b ? (same ? 'same' : 'diff') : a ? 'theirs' : 'mine';
            const inText = !!a && k !== 'date' && k !== 'type' && k !== 'cote' && k !== 'vue' && cmpNorm(a).split(' ').filter(w => w.length > 2).every(w => B.includes(w));
            out.push({field: k, label: fieldLabel(k), theirs: a, mine: b, state, inText});
        });
        return out;
    }

    /* ═════════ 🔗 14. Les actes jumeaux ═════════ */
    const TWIN_RELS = {bans: 'Publication des bans', bapteme: 'Naissance et baptême', inhumation: 'Décès et inhumation', contrat: 'Contrat de mariage', autre: 'Acte lié'};
    const twinLabel = r => i18n(TWIN_RELS[r] || TWIN_RELS.autre);
    const cleanTwins = list => (Array.isArray(list) ? list : []).filter(x => Number(x?.id) > 0).filter((x, i, l) => l.findIndex(y => Number(y.id) === Number(x.id)) === i).slice(0, 12)
        .map(x => ({id: Number(x.id), rel: TWIN_RELS[x.rel] ? x.rel : 'autre'}));

    return {fold, OUTLINE, anchorOf, isLong, suggestOutline, resolveOutline, mergeOutline, cleanOutline, ROLES, roleOf, roleLabel, sameName, peopleRows, splitName,
        sketchLayout, sketchSvg, MARKS, scanMarks, wrapMark, readingText, teiInline, scanDoubts, dictationPlan,
        FIELDS, FIELD_KEYS, fieldLabel, parseReleve, fieldOf, guessMapping, compareReleve, rowFromEx, dateNorm, TWIN_RELS, twinLabel, cleanTwins};
});
