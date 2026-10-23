/**
 * 🔤 Alphabets et langues des actes — cadre de Réglages → Calendrier / mesures (à droite de « Fêtes religieuses »).
 * Trois onglets : « Une langue » (alphabet, lettres spéciales, lettres anciennes, indices), « Quelle langue ? »
 * (on tape des lettres ou un mot : les langues possibles, des plus probables aux moins probables) et
 * « Cyrillique et grec » (petit clavier, copie, translittération en lettres latines).
 * Données : assets/js/heritage-alphabets-data.js (window.LCNDA_ALPHABETS). Test : tests/test-alphabets.js.
 * Tout se fait dans le navigateur, sans requête.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const D = () => window.LCNDA_ALPHABETS || {languages: [], keyboard: {}, names: {}, keyTr: {}, scripts: {}};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['calendarPanels', 'afterCalendar']) ext[key] = ext[key] || [];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** Texte français : espaces insécables dans « … » et devant : ; ! ? (pas de guillemet seul en fin de ligne). */
    const frText = value => esc(String(value ?? '').replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;!?])/g, '\u00a0$1'));
    const toast = (...args) => A()?.toast ? A().toast(...args) : undefined;
    const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;
    const store = {get(k, d) { try { return localStorage.getItem('lcnda-abc-' + k) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('lcnda-abc-' + k, v); } catch (_) {} }};

    /* ═════════════ Lettres : découpage, casse, ensembles par langue ═════════════ */
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('fr', {granularity: 'grapheme'}) : null;
    const graphemes = text => { const s = String(text ?? '').normalize('NFC'); return seg ? Array.from(seg.segment(s), x => x.segment) : (s.match(/\P{M}\p{M}*|\p{M}+/gu) || []); };
    const SPECIAL_UPPER = {'ß': 'ẞ', 'ĳ': 'Ĳ', 'ſ': 'ſ', 'ŉ': 'ŉ'};
    const single = s => graphemes(s).length === 1;
    const upperOf = c => {
        if (SPECIAL_UPPER[c]) return SPECIAL_UPPER[c];
        const g = graphemes(c);
        if (g.length > 1) return upperOf(g[0]) + g.slice(1).join(''); // digramme : « Ch », « Dž », « C'h »
        const u = c.toUpperCase().normalize('NFC');
        return single(u) ? u : c;
    };
    const lowerOf = c => { const l = c.toLowerCase().normalize('NFC'); return single(l) ? l : c; };
    const HEB_AR_MARKS = /[\u0591-\u05C7\u064B-\u065F\u0670\u06D6-\u06ED]/g;
    const BASIC = /^[a-z]$/i;
    const SKIP = /^(?:\s+|\p{Nd}|[.,;:!?'"’‘“”()[\]{}\-–—/\\«»…*+=_#%~|<>^`@$€£])$/u;
    let built = null;
    function build() {
        const data = D();
        if (built && built.data === data) return built;
        const langs = data.languages.map(l => {
            const all = new Set(), native = new Set();
            const add = (entry, into) => { for (const g of graphemes(entry)) { if (SKIP.test(g)) continue; for (const s of into) { s.add(g); s.add(upperOf(g)); } } };
            l.alphabet.forEach((c, i) => { add(c, [all, native]); if (l.upper?.[i]) for (const g of graphemes(l.upper[i])) { all.add(g); native.add(g); } });
            (l.special || []).forEach(c => add(c, [all, native]));
            (l.extra || []).forEach(c => add(c, [all]));
            (l.old || []).forEach(([c]) => add(c, [all]));
            (l.matchExtra || []).forEach(c => add(c, [all, native]));
            Object.keys(l.tr || {}).forEach(c => add(c, [all]));
            return {...l, set: all, native};
        });
        built = {data, langs, byId: Object.fromEntries(langs.map(l => [l.id, l]))};
        return built;
    }
    const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[״"׳']/g, '');
    /** La langue a-t-elle ce caractère ? 1 = dans son alphabet, .6 = seulement dans les lettres anciennes ou étrangères,
     *  .5 = une fois les points-voyelles (hébreu, arabe) retirés, 0 = non. */
    function has(lang, g) {
        if (lang.native.has(g) || lang.native.has(lowerOf(g))) return 1;
        if (lang.set.has(g) || lang.set.has(lowerOf(g))) return .6;
        if (lang.stripMarks) { const base = g.normalize('NFD').replace(HEB_AR_MARKS, '').normalize('NFC'); if (base && base !== g && lang.set.has(base)) return .5; }
        return 0;
    }

    /** « Quelle langue ? » : les caractères tapés → les langues possibles, des plus probables aux moins probables. */
    function identify(text) {
        const {langs} = build();
        const seen = new Map();
        for (const g of graphemes(text)) {
            if (SKIP.test(g)) continue;
            const key = lowerOf(g);
            if (!seen.has(key)) seen.set(key, g);
        }
        const chars = [...seen.entries()].map(([key, g]) => {
            const hits = langs.map(l => [l, has(l, g)]).filter(([, w]) => w > 0);
            return {char: key, raw: g, basic: BASIC.test(g), langs: hits.map(([l]) => l.id), weights: Object.fromEntries(hits.map(([l, w]) => [l.id, w])), unknown: !hits.length};
        });
        const known = chars.filter(c => !c.unknown), special = known.filter(c => !c.basic);
        const tokens = (String(text || '').normalize('NFC').match(/[\p{L}\p{M}״"׳]+/gu) || []).map(fold).filter(t => t.length >= 2);
        const results = [];
        if (known.length) for (const l of langs) {
            if (!known.every(c => c.weights[l.id])) continue;
            let score = 0, exclusive = [];
            for (const c of special) { const w = c.weights[l.id] / c.langs.length; score += w; if (c.langs.length === 1 && c.weights[l.id] >= .6) exclusive.push(c.char); }
            if (!special.length) for (const c of known) if (!l.native.has(c.raw) && !l.native.has(c.char)) score -= .15; // lettre des mots étrangers seulement
            const words = [];
            for (const w of l.words || []) { const f = fold(w); if (tokens.some(t => t === f || (t.length >= 5 && f.startsWith(t)))) words.push(w); }
            score += words.length * 2;
            const level = exclusive.length || words.length ? 3 : score >= .3 ? 2 : 1;
            results.push({id: l.id, name: l.name, script: l.script, score: Math.round(score * 1000) / 1000, level, exclusive, words, prior: l.prior || 0});
        }
        results.sort((a, b) => b.score - a.score || b.prior - a.prior || a.name.localeCompare(b.name, 'fr'));
        return {chars, results, onlyBasic: known.length > 0 && !special.length, unknown: chars.filter(c => c.unknown).map(c => c.char)};
    }

    /* ═════════════ Translittération ═════════════ */
    const ISO9 = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ґ': 'g\u0300', 'д': 'd', 'ђ': 'đ', 'ѓ': 'ǵ', 'е': 'e', 'ё': 'ë', 'є': 'ê', 'ж': 'ž', 'з': 'z', 'ѕ': 'ẑ', 'и': 'i', 'і': 'ì', 'ї': 'ï', 'й': 'j',
        'ј': 'ǰ', 'к': 'k', 'л': 'l', 'љ': 'l\u0302', 'м': 'm', 'н': 'n', 'њ': 'n\u0302', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'ќ': 'ḱ', 'у': 'u', 'ў': 'ŭ', 'ф': 'f', 'х': 'h',
        'ц': 'c', 'ч': 'č', 'џ': 'd\u0302', 'ш': 'š', 'щ': 'ŝ', 'ъ': 'ʺ', 'ы': 'y', 'ь': 'ʹ', 'э': 'è', 'ю': 'û', 'я': 'â', 'ѣ': 'ě', 'ѳ': 'f\u0300', 'ѵ': 'ỳ', 'ѫ': 'ǎ', 'ѝ': 'ì', 'ʼ': '’'};
    const FR_RU = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'io', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'ï', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
        'р': 'r', 'с': 's', 'т': 't', 'у': 'ou', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'tch', 'ш': 'ch', 'щ': 'chtch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'iou', 'я': 'ia',
        'і': 'i', 'ѣ': 'e', 'ѳ': 'f', 'ѵ': 'i', 'ѫ': 'ă', 'ѝ': 'i', 'ʼ': '', 'ґ': 'g', 'є': 'ie', 'ї': 'ï', 'ў': 'ou', 'ђ': 'dj', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'tch', 'џ': 'dj'};
    const FR_LANG = {
        ru: {}, uk: {'г': 'h', 'и': 'y', 'й': 'ï', 'є': 'ie'}, be: {'г': 'h', 'ў': 'ou'}, bg: {'щ': 'cht', 'ъ': 'ă'},
        sr: {'ђ': 'đ', 'ж': 'ž', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'ć', 'у': 'u', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š', 'й': 'j'},
    };
    const CYR = /[\u0400-\u052F\u02BC]/;
    const CYR_VOWEL = /[аеёиоуыэюяіїєѣ]/;
    const isUp = c => c !== c.toLowerCase() && c === c.toUpperCase();
    const casing = (out, src, prev, next) => {
        if (!out || !isUp(src)) return out;
        if (out.length > 1 && ((next && isUp(next)) || (prev && isUp(prev) && !(next && /\p{Ll}/u.test(next))))) return out.toUpperCase();
        return out.charAt(0).toUpperCase() + out.slice(1);
    };
    function cyrLanguage(text) {
        const t = String(text || '').toLowerCase();
        if (/[їєґ]/.test(t)) return 'uk';
        if (/ў/.test(t)) return 'be';
        if (/[ђјљњћџ]/.test(t)) return 'sr';
        if (/ѝ|ѫ/.test(t) || (/ъ(?=[\u0430-\u044F])/.test(t) && !/[ыэё]/.test(t))) return 'bg';
        return 'ru';
    }
    function translitCyrillic(text, {system = 'fr', lang = 'auto'} = {}) {
        const chars = Array.from(String(text || '').normalize('NFC'));
        const lg = lang === 'auto' ? cyrLanguage(text) : lang;
        const table = system === 'iso' ? ISO9 : {...FR_RU, ...(FR_LANG[lg] || {})};
        const lc = i => (chars[i] || '').toLowerCase();
        let out = '';
        for (let i = 0; i < chars.length; i++) {
            const src = chars[i], c = src.toLowerCase();
            if (!CYR.test(src) || !(c in table)) { out += src; continue; }
            let r = table[c];
            if (system !== 'iso' && lg !== 'sr') {
                const p = lc(i - 1), n = lc(i + 1), atStart = !p || !CYR.test(chars[i - 1]), atEnd = !n || !CYR.test(chars[i + 1]);
                if ((lg === 'ru' || lg === 'be') && c === 'е' && (atStart || p === 'ъ' || p === 'ь')) r = 'ie';
                else if ((lg === 'ru' || lg === 'be') && c === 'е' && CYR_VOWEL.test(p)) r = 'ïe';
                if (c === 'ё' && /[жчшщ]/.test(p)) r = 'o';
                if (c === 'й' && atEnd && (p === 'и' || p === 'ы')) r = '';
                if ((c === 'я' || c === 'ю') && p === 'и') r = r.slice(1);
                if (c === 'с' && CYR_VOWEL.test(p) && CYR_VOWEL.test(n)) r = 'ss';
                if (c === 'г' && r === 'g' && /[еиёыэі]/.test(n)) r = 'gu';
            }
            out += casing(r, src, chars[i - 1], chars[i + 1]);
        }
        return out;
    }
    const GR_BASE = /[\u0370-\u03FF]/;
    const GR_POLY = /[\u1F00-\u1FFF\u0313\u0314\u0342\u0345\u0300]/;
    const GR_MOD = {'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r',
        'σ': 's', 'ς': 's', 'ϲ': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o', 'ϝ': 'w', 'ϛ': 'st', 'ϙ': 'q', 'ϟ': 'q', 'ϡ': 'ss'};
    const GR_ANC = {...GR_MOD, 'β': 'b', 'η': 'ē', 'φ': 'ph', 'ω': 'ō'};
    const GR_VOWEL = /[αεηιουω]/;
    function translitGreek(text, {mode = 'auto'} = {}) {
        const src = String(text || '').normalize('NFC');
        const ancient = mode === 'ancient' || (mode === 'auto' && GR_POLY.test(src.normalize('NFD')));
        const T = ancient ? GR_ANC : GR_MOD;
        // lettres : [lettre telle qu'écrite, base en minuscule, signes]
        const gs = graphemes(src).map(g => { const d = g.normalize('NFD'); const base = d.charAt(0); return {g, base: base.toLowerCase(), up: isUp(base), marks: d.slice(1), greek: GR_BASE.test(base) && (base.toLowerCase() in T)}; });
        let out = '';
        for (let i = 0; i < gs.length; i++) {
            const x = gs[i];
            if (!x.greek) { out += x.g; continue; }
            const prev = gs[i - 1]?.greek ? gs[i - 1] : null, next = gs[i + 1]?.greek ? gs[i + 1] : null;
            const wordStart = !prev, wordEnd = !next;
            let r = T[x.base], used = 1;
            const nb = next?.base, trema = next && /\u0308/.test(next.marks);
            if (x.base === 'ο' && nb === 'υ' && !trema) { r = 'ou'; used = 2; }
            else if (/[αεη]/.test(x.base) && nb === 'υ' && !trema) {
                const v = {α: 'a', ε: 'e', η: ancient ? 'ē' : 'i'}[x.base];
                if (ancient) r = v + 'u';
                else { const after = gs[i + 2]?.greek ? gs[i + 2].base : ''; r = v + (!after || /[θκξπστφχψς]/.test(after) ? 'f' : 'v'); }
                used = 2;
            } else if (!ancient && x.base === 'μ' && nb === 'π') { r = wordStart ? 'b' : 'mb'; used = 2; }
            else if (!ancient && x.base === 'ν' && nb === 'τ') { r = wordStart ? 'd' : 'nt'; used = 2; }
            else if (x.base === 'γ' && /[γκξχ]/.test(nb || '')) { r = ancient || nb !== 'κ' ? 'n' : (wordStart ? 'g' : 'gk'); if (!ancient && nb === 'κ') used = 2; }
            else if (ancient && x.base === 'ρ' && /\u0314/.test(x.marks)) r = 'rh';
            else if (ancient && x.base === 'υ' && !GR_VOWEL.test(prev?.base || '-')) r = 'y';
            // esprit rude au début du mot (sur la voyelle ou la 2e lettre d'une diphtongue) = h
            if (ancient && wordStart && GR_VOWEL.test(x.base) && (/\u0314/.test(x.marks) || (used === 2 && /\u0314/.test(next.marks)) || (next && /[ιυ]/.test(nb) && /\u0314/.test(next.marks)))) r = 'h' + r;
            if (ancient && /\u0345/.test(x.marks)) r += 'i';
            if (used === 2 && ancient && /\u0345/.test(next.marks)) r += 'i';
            const nextUp = gs[i + used]?.greek ? gs[i + used].up : false;
            if (x.up) r = (r.length > 1 && (nextUp || (prev?.up && !(gs[i + used]?.greek && !nextUp)))) ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1);
            out += r;
            i += used - 1;
            void wordEnd;
        }
        return out;
    }
    const translit = (text, o = {}) => translitGreek(translitCyrillic(text, o), o);

    /* ═════════════ Rendu ═════════════ */
    const TABS = [['lang', '🔤 Une langue'], ['guess', '🔎 Quelle langue ?'], ['keys', '⌨\uFE0F Cyrillique et grec']];
    const RTL = new Set(['hebrew', 'arabic']);
    const trText = (l, c) => { const t = l.tr?.[c] || D().keyTr?.[c]; if (!t) return ''; return t[0] === t[1] || !t[1] ? t[0] : `${t[0]} · ${t[1]}`; };
    const cell = (l, c, i, special) => {
        const cased = l.script !== 'hebrew' && l.script !== 'arabic';
        const up = l.upper?.[i] || upperOf(c);
        const tr = l.tr ? trText(l, c) : '';
        const label = `${cased && up !== c ? up + ' ' : ''}${c}${tr ? ' — ' + tr : ''}`;
        return `<span class="h-abc-cell${special ? ' is-special' : ''}${graphemes(c).length > 1 ? ' is-multi' : ''}" title="${esc(label)}"><span class="h-abc-glyph" lang="${esc(l.id)}"${RTL.has(l.script) ? ' dir="rtl"' : ''}>${cased && up !== c ? `<b>${esc(up)}</b><i>${esc(c)}</i>` : `<b>${esc(c)}</b>`}</span>${tr ? `<small>${esc(tr)}</small>` : ''}</span>`;
    };
    function langHtml(id) {
        const {langs, byId} = build();
        const l = byId[id] || langs[0];
        if (!l) return '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔤</span><span class="empty-line-text">Aucune langue.</span></p>';
        const specials = new Set(l.special || []);
        const trLegend = l.tr ? `<p class="h-abc-legend">Sous chaque lettre : sa translittération (${esc((l.trLabels || ['usuelle', 'savante']).join(' · '))}).</p>` : '';
        const alpha = `<h4>L’alphabet <small>(${plural(l.alphabet.length, 'lettre')})</small></h4>${trLegend}${specials.size && l.alphabet.some(c => specials.has(c)) ? '<p class="h-abc-legend"><span class="h-abc-dot"></span> lettres à accents ou propres à la langue</p>' : ''}
            <div class="h-abc-grid">${l.alphabet.map((c, i) => cell(l, c, i, specials.has(c))).join('')}</div>`;
        const sp = l.special?.length ? `<h4>Lettres à accents et lettres spéciales</h4><div class="h-abc-grid">${l.special.map(c => cell(l, c, -1, true)).join('')}</div>`
            : '<h4>Lettres à accents et lettres spéciales</h4><p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔤</span><span class="empty-line-text">Aucune : cette langue n’a pas de lettres à accents.</span></p>';
        const extra = l.extra?.length ? `<p class="h-abc-extra"><strong>${frText(l.extraLabel || 'Seulement dans les mots et les noms étrangers :')}</strong> ${l.extra.map(c => `<span class="h-abc-mini" lang="${esc(l.id)}">${esc(c)}</span>`).join(' ')}</p>` : '';
        const old = l.old?.length ? `<h4>Lettres anciennes et abréviations des actes</h4><ul class="h-abc-old">${l.old.map(([c, note]) => `<li><span class="h-abc-oldglyph" lang="${esc(l.id)}"${RTL.has(l.script) ? ' dir="rtl"' : ''}>${esc(c)}</span><span>${frText(note)}</span></li>`).join('')}</ul>` : '';
        const hints = `<h4>Comment la reconnaître</h4><ul class="h-abc-hints">${(l.hints || []).map(h => `<li>${frText(h)}</li>`).join('')}</ul>`;
        const words = l.words?.length ? `<p class="h-abc-words"><strong>Mots fréquents dans les actes :</strong> ${l.words.slice(0, 12).map(w => `<span class="h-abc-word" lang="${esc(l.id)}"${RTL.has(l.script) ? ' dir="rtl"' : ''}>${esc(w)}</span>`).join(' ')}</p>` : '';
        return `<div class="h-abc-lang" data-abc-current="${esc(l.id)}">${alpha}${sp}${extra}${old}${hints}${words}</div>`;
    }
    const LEVEL = {3: ['très probable', 'is-high'], 2: ['probable', 'is-mid'], 1: ['possible', 'is-low']};
    function guessHtml(text) {
        if (!String(text || '').trim()) return '<p class="muted">Tape une lettre (ł, ő, ж, ω…) ou un mot entier de l’acte : les langues possibles s’affichent, les plus probables d’abord.</p>';
        const r = identify(text), {byId} = build();
        const chips = ids => ids.map(id => `<button type="button" class="h-abc-chip" data-abc-open="${esc(id)}">${esc(byId[id]?.name || id)}</button>`).join('');
        const msg = (kind, icon, t) => `<p class="h-abc-msg is-${kind}" role="status"><span aria-hidden="true">${icon}</span> ${esc(t)}</p>`;
        let head;
        if (!r.chars.length) head = msg('info', 'ℹ\uFE0F', 'Tape des lettres : les chiffres, les espaces et la ponctuation ne comptent pas.');
        else if (!r.results.length) head = msg('warn', '⚠\uFE0F', r.chars.every(c => c.unknown) ? 'Ce caractère n’est dans aucune des langues de la liste.' : 'Aucune langue de la liste n’a tous ces caractères ensemble : regarde lettre par lettre ci-dessous.');
        else head = `<p class="h-abc-count">${esc(plural(r.results.length, 'langue possible', 'langues possibles'))}${r.onlyBasic ? ' — que des lettres simples (a à z) : tape une lettre à accent ou un mot entier pour départager.' : ''}</p>
            <ol class="h-abc-results">${r.results.map(x => { const [label, cls] = LEVEL[x.level]; const why = [x.exclusive.length ? `${x.exclusive.join(', ')} : seulement dans cette langue` : '', x.words.length ? `mot des actes : « ${x.words.join(' », « ')} »` : ''].filter(Boolean).join(' · ');
                return `<li><button type="button" class="h-abc-result" data-abc-open="${esc(x.id)}"><span class="h-abc-rname">${esc(x.name)}</span><span class="h-abc-level ${cls}">${esc(label)}</span>${why ? `<small>${esc(why)}</small>` : ''}</button></li>`; }).join('')}</ol>`;
        const per = r.chars.length ? `<h4>Lettre par lettre</h4><ul class="h-abc-per">${r.chars.map(c => `<li><span class="h-abc-pchar">${esc(c.raw)}</span><span class="h-abc-pwhere">${c.unknown ? '<em>ce caractère n’est dans aucune des langues de la liste</em>'
            : c.basic ? `<em>lettre simple : dans ${esc(plural(c.langs.length, 'langue'))} en lettres latines</em>` : chips(c.langs)}</span></li>`).join('')}</ul>` : '';
        return head + per;
    }
    function keysHtml(upper) {
        const K = D().keyboard || {}, N = D().names || {};
        const keyTitle = c => { const l = c.toLowerCase(); const t = D().keyTr?.[l] || build().langs.map(x => x.tr?.[l]).find(Boolean); return `${upper ? upperOf(c) : c} — ${N[l] || 'lettre'}${t ? ' · ' + (t[0] === t[1] ? t[0] : t[0] + ' / ' + t[1]) : ''}`; };
        const group = (g, script) => `<div class="h-abc-kgroup"><span class="h-abc-ktitle">${esc(g.title)}</span><div class="h-abc-keys" role="group" aria-label="${esc(g.title)}">${
            g.marks ? g.marks.map(([m, name, shown]) => `<button type="button" class="h-abc-key is-mark" data-abc-mark="${esc(m)}" title="${esc(name)}" aria-label="${esc(name)}"><span lang="grc">${esc(shown || '◌' + m)}</span></button>`).join('')
                : g.keys.map(c => { const v = upper ? upperOf(c) : c; return `<button type="button" class="h-abc-key" data-abc-key="${esc(v)}" title="${esc(keyTitle(c))}" aria-label="${esc(keyTitle(c))}"><span lang="${script === 'greek' ? 'el' : 'ru'}">${esc(v)}</span></button>`; }).join('')}</div></div>`;
        return `<div class="h-abc-kbar"><button type="button" class="button small secondary h-abc-shift${upper ? ' is-on' : ''}" data-abc-shift aria-pressed="${upper ? 'true' : 'false'}" title="Majuscules (cliquer encore pour revenir aux minuscules)">⇧ Majuscules</button></div>
            <h4>Cyrillique</h4>${(K.cyrillic || []).map(g => group(g, 'cyrillic')).join('')}
            <h4>Grec</h4>${(K.greek || []).map(g => group(g, 'greek')).join('')}`;
    }
    function panelHtml() {
        const {langs} = build();
        if (!langs.length) return '';
        const tab = store.get('tab', 'lang'), cur = build().byId[store.get('lang', 'fr')] ? store.get('lang', 'fr') : 'fr';
        const S = D().scripts || {};
        const options = Object.keys(S).map(s => { const ls = langs.filter(l => l.script === s); return ls.length ? `<optgroup label="${esc(S[s])}">${ls.map(l => `<option value="${esc(l.id)}"${l.id === cur ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
        const t = k => TABS.find(x => x[0] === k) ? k : 'lang';
        const active = t(tab);
        return `<section class="maintenance-panel h-abc-panel" id="h-abc-panel"><h3>Alphabets et langues des actes</h3>
            <p>Pour lire un acte écrit dans une autre langue : l’alphabet de chaque langue, ses lettres à accents, les lettres anciennes, et comment la reconnaître.</p>
            <div class="ui-tabs h-abc-tabs" role="tablist" aria-label="Alphabets">${TABS.map(([k, label]) => `<button type="button" role="tab" id="h-abc-tab-${k}" aria-controls="h-abc-pane-${k}" data-abc-tab="${k}" class="${k === active ? 'is-active' : ''}" aria-selected="${k === active}" tabindex="${k === active ? 0 : -1}">${esc(label)}</button>`).join('')}</div>
            <div class="h-abc-pane" role="tabpanel" id="h-abc-pane-lang" aria-labelledby="h-abc-tab-lang"${active === 'lang' ? '' : ' hidden'}>
                <label class="h-abc-pick">Langue <select data-abc-lang>${options}</select></label>
                <div data-abc-lang-out>${langHtml(cur)}</div></div>
            <div class="h-abc-pane" role="tabpanel" id="h-abc-pane-guess" aria-labelledby="h-abc-tab-guess"${active === 'guess' ? '' : ' hidden'}>
                <label class="h-abc-guess-label">Lettres ou mot de l’acte<input type="search" data-ui-search data-abc-guess placeholder="Chercher… (ł, ő, ж, ω, natus, урожденный)" autocomplete="off" spellcheck="false"></label>
                <div data-abc-guess-out aria-live="polite">${guessHtml('')}</div></div>
            <div class="h-abc-pane" role="tabpanel" id="h-abc-pane-keys" aria-labelledby="h-abc-tab-keys"${active === 'keys' ? '' : ' hidden'}>
                <div data-abc-keys-out>${keysHtml(false)}</div>
                <label class="h-abc-text-label">Texte<textarea data-abc-text rows="3" dir="auto" spellcheck="false" placeholder="Clique sur les lettres, ou tape ici"></textarea></label>
                <div class="h-abc-actions"><button type="button" class="button small" data-abc-copy>📋 Copier</button><button type="button" class="button small secondary" data-abc-back title="Effacer la dernière lettre" aria-label="Effacer la dernière lettre">⌫</button><button type="button" class="button small secondary" data-abc-clear>Vider</button></div>
                <div class="h-abc-trbar"><label>Cyrillique en <select data-abc-sys><option value="fr">français courant</option><option value="iso">ISO 9 (savante)</option></select></label>
                    <label>Langue <select data-abc-cyrlang><option value="auto">automatique</option><option value="ru">russe</option><option value="uk">ukrainien</option><option value="be">biélorusse</option><option value="bg">bulgare</option><option value="sr">serbe</option></select></label>
                    <label>Grec <select data-abc-grmode><option value="auto">automatique</option><option value="modern">moderne</option><option value="ancient">ancien</option></select></label></div>
                <div class="h-abc-trout"><span>En lettres latines :</span> <output data-abc-tr></output><small data-abc-trinfo class="muted"></small></div>
            </div></section>`;
    }

    function bind() {
        const panel = document.getElementById('h-abc-panel');
        if (!panel || panel.dataset.abcBound) return;
        panel.dataset.abcBound = '1';
        const $ = s => panel.querySelector(s);
        const showTab = (k, focus) => {
            panel.querySelectorAll('[data-abc-tab]').forEach(b => { const on = b.dataset.abcTab === k; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
            panel.querySelectorAll('.h-abc-pane').forEach(p => { p.hidden = p.id !== 'h-abc-pane-' + k; });
            store.set('tab', k);
            if (k === 'guess' && focus === 'input') $('[data-abc-guess]')?.focus();
        };
        const openLang = id => { const sel = $('[data-abc-lang]'); if (!build().byId[id]) return; sel.value = id; $('[data-abc-lang-out]').innerHTML = langHtml(id); store.set('lang', id); showTab('lang'); sel.focus(); };
        panel.addEventListener('click', e => {
            const tab = e.target.closest('[data-abc-tab]'); if (tab) { showTab(tab.dataset.abcTab); return; }
            const open = e.target.closest('[data-abc-open]'); if (open) { openLang(open.dataset.abcOpen); return; }
            const key = e.target.closest('[data-abc-key]'); if (key) { insert(key.dataset.abcKey); return; }
            const mark = e.target.closest('[data-abc-mark]'); if (mark) { addMark(mark.dataset.abcMark); return; }
            if (e.target.closest('[data-abc-shift]')) { upper = !upper; const had = document.activeElement?.matches?.('[data-abc-shift]'); $('[data-abc-keys-out]').innerHTML = keysHtml(upper); if (had) $('[data-abc-shift]')?.focus(); return; }
            if (e.target.closest('[data-abc-copy]')) { copy(); return; }
            if (e.target.closest('[data-abc-back]')) { back(); return; }
            if (e.target.closest('[data-abc-clear]')) { clear(); return; }
        });
        panel.querySelector('.h-abc-tabs').addEventListener('keydown', e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const ks = TABS.map(t => t[0]), i = ks.indexOf(panel.querySelector('[data-abc-tab].is-active')?.dataset.abcTab);
            const j = e.key === 'Home' ? 0 : e.key === 'End' ? ks.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ks.length) % ks.length;
            showTab(ks[j], true);
        });
        // flèches dans le clavier : d'une touche à l'autre
        panel.addEventListener('keydown', e => {
            const k = e.target.closest?.('.h-abc-key'); if (!k || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const all = [...panel.querySelectorAll('.h-abc-key')], i = all.indexOf(k);
            const n = all[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); }
        });
        $('[data-abc-lang]').addEventListener('change', e => { $('[data-abc-lang-out]').innerHTML = langHtml(e.target.value); store.set('lang', e.target.value); });
        const guess = $('[data-abc-guess]'), gout = $('[data-abc-guess-out]');
        guess.addEventListener('input', () => { gout.innerHTML = guessHtml(guess.value); });
        guess.addEventListener('search', () => { gout.innerHTML = guessHtml(guess.value); });
        let upper = false;
        const ta = $('[data-abc-text]'), trOut = $('[data-abc-tr]'), trInfo = $('[data-abc-trinfo]');
        const opts = () => ({system: $('[data-abc-sys]').value, lang: $('[data-abc-cyrlang]').value, mode: $('[data-abc-grmode]').value});
        const drawTr = () => {
            const o = opts(), v = ta.value;
            trOut.textContent = translit(v, o);
            const bits = [];
            if (CYR.test(v)) bits.push(o.system === 'iso' ? 'cyrillique en ISO 9' : `lu comme du ${{ru: 'russe', uk: 'ukrainien', be: 'biélorusse', bg: 'bulgare', sr: 'serbe'}[o.lang === 'auto' ? cyrLanguage(v) : o.lang]}`);
            if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(v)) bits.push(o.mode === 'ancient' || (o.mode === 'auto' && GR_POLY.test(v.normalize('NFD'))) ? 'grec ancien' : 'grec moderne');
            trInfo.textContent = bits.length ? ` (${bits.join(' · ')})` : '';
        };
        ['data-abc-sys', 'data-abc-cyrlang', 'data-abc-grmode'].forEach(a => $(`[${a}]`).addEventListener('change', drawTr));
        ta.addEventListener('input', drawTr);
        // place du curseur, gardée même quand on clique sur les touches (la zone de texte n'a plus le focus)
        let caret = [0, 0];
        const remember = () => { caret = [ta.selectionStart ?? ta.value.length, ta.selectionEnd ?? ta.value.length]; };
        ['select', 'click', 'keyup', 'input', 'focus'].forEach(t => ta.addEventListener(t, remember));
        const sel = () => { const n = ta.value.length; const [a, b] = document.activeElement === ta ? [ta.selectionStart ?? n, ta.selectionEnd ?? n] : caret; return [Math.min(a, n), Math.min(Math.max(a, b), n)]; };
        const setText = (v, at) => { ta.value = v; caret = [at, at]; try { ta.setSelectionRange(at, at); } catch (_) {} drawTr(); };
        function insert(s) { const [a, b] = sel(); setText(ta.value.slice(0, a) + s + ta.value.slice(b), a + s.length); }
        const ORDER = {'\u0308': 0, '\u0313': 1, '\u0314': 1, '\u0301': 2, '\u0300': 2, '\u0342': 2, '\u0345': 3};
        function addMark(m) {
            const [a] = sel(), before = ta.value.slice(0, a), gs = graphemes(before), last = gs[gs.length - 1] || '';
            const d = last.normalize('NFD'), base = d.charAt(0);
            if (!/[\u0391-\u03A9\u03B1-\u03C9\u03DA-\u03E1]/.test(base)) { toast('Clique d’abord sur une lettre grecque, puis sur l’accent ou l’esprit.'); return; }
            let marks = [...d.slice(1)];
            if (marks.includes(m)) marks = marks.filter(x => x !== m); else marks = marks.filter(x => ORDER[x] !== ORDER[m]).concat(m);
            marks.sort((x, y) => (ORDER[x] ?? 9) - (ORDER[y] ?? 9));
            const g = (base + marks.join('')).normalize('NFC');
            const head = gs.slice(0, -1).join(''), rest = ta.value.slice(a);
            setText(head + g + rest, head.length + g.length);
        }
        function back() {
            const [a, b] = sel();
            if (a !== b) { setText(ta.value.slice(0, a) + ta.value.slice(b), a); return; }
            const gs = graphemes(ta.value.slice(0, a)); if (!gs.length) return;
            const head = gs.slice(0, -1).join(''); setText(head + ta.value.slice(a), head.length);
        }
        function clear() {
            const old = ta.value; if (!old) return;
            setText('', 0);
            const u = A()?.undoToast; if (u) u('Texte vidé', {undo: () => setText(old, old.length), redo: () => setText('', 0)}); else toast('Texte vidé.');
        }
        async function copy() {
            const v = ta.value;
            if (!v) { toast('Rien à copier : clique d’abord sur des lettres.'); return; }
            let ok = false;
            try { await navigator.clipboard.writeText(v); ok = true; } catch (_) {
                try { ta.select(); ok = document.execCommand('copy'); } catch (_) { ok = false; }
            }
            toast(ok ? 'Texte copié : colle-le où tu veux (⌘V).' : 'Copie impossible : sélectionne le texte et fais ⌘C.', ok ? 'success' : 'error');
        }
        drawTr();
    }

    ext.calendarPanels.push(panelHtml);
    ext.afterCalendar.push(bind);
    ext.alphabets = {identify, translit, translitCyrillic, translitGreek, graphemes, langHtml, guessHtml};
})();
