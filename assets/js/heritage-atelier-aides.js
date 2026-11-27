/* LCNDA — 📜 Atelier de transcription : 🧰 les aides à la lecture (validées par la personne).
 *  📜 Modèle d'acte de l'époque : un texte type (baptême / naissance, mariage, sépulture / décès) vers 1700, 1780, an II, 1820,
 *     avec des [blancs] ; choisi tout seul d'après la sorte d'acte et l'année ; replié dans le panneau 🧰 à côté de l'image.
 *  🔤 Alphabet de l'époque : les lettres difficiles dessinées (✍️ Les lettres de l'Aide à la lecture, posées dans le panneau).
 *  💡 Mot illisible : « Ma…d » ou « Ma?aud » dans le texte → les noms, prénoms et communes de la base qui vont (lib/transcription_aides.php).
 *  📅 Date en toutes lettres : choisir « le vingt-trois brumaire an deux » ou « mil sept cent quatre-vingt-neuf, le douze mars »
 *     → la vraie date (calendrier républicain : LCNDA_AUTREFOIS.republican) ; « ↦ Mettre dans la fiche » remplit la date de l'acte.
 *  📖 Mon glossaire : « pnt = présent », gardé sur cet ordinateur (genealogie-tx-glossaire, aussi dans les défauts du site),
 *     rappelé sous le texte quand le mot revient.
 *  ✍️ Comparer deux signatures : les zones « signature » de l'acte, côte à côte avec celles des autres actes.
 *  📊 Ma progression : actes transcrits et part de mots douteux, mois par mois.
 * Branché par ext.txPlugins / ext.txMenus (heritage-transcribe.js). Calculs purs : ext.txAides (essai : tests/test-transcription-aides.js).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const i18n = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ſ/g, 's').replace(/[’]/g, "'");
    const GLO_KEY = 'genealogie-tx-glossaire', OPEN_KEY = 'genealogie-tx-aides';

    /* ═════════ 📜 Les modèles d'actes (textes écrits pour l'app, des [blancs] à remplir) ═════════ */
    const ERAS = [['1700', 'vers 1700 (registre paroissial)'], ['1780', 'vers 1780 (registre paroissial)'], ['an2', 'an II (Révolution, état civil)'], ['1820', 'vers 1820 (état civil)']];
    const MODELS = {
        '1700': {b: 'Le [jour] [mois] mil sept cent [année] a esté baptisé [prénom], filz de [père] et de [mère] sa femme, de cette paroisse. Le parrain a esté [parrain] et la marraine [marraine], qui ont signé / ont déclaré ne sçavoir signer. [curé], curé.',
            m: 'Le [jour] [mois] mil sept cent [année], après la publication de trois bans faite au prosne de nos messes paroissiales sans opposition, ont esté espousés [époux], filz de [père de l’époux], et [épouse], fille de [père de l’épouse], de cette paroisse, en présence de [témoins]. [curé], curé.',
            d: 'Le [jour] [mois] mil sept cent [année] a esté inhumé dans le cimetière de cette paroisse le corps de [défunt], âgé d’environ [âge] ans, décédé le jour précédent, muni des sacrements, en présence de [témoins]. [curé], curé.'},
        '1780': {b: 'L’an mil sept cent [année] et le [jour] du mois de [mois], a été baptisé par nous, curé soussigné, [prénom], né [d’hier / ce jour], fils légitime de [père], [métier], et de [mère], son épouse ; le parrain a été [parrain], la marraine [marraine], qui ont signé avec nous / ont déclaré ne savoir signer. [curé], curé.',
            m: 'L’an mil sept cent [année] et le [jour] [mois], après la publication de trois bans et les fiançailles célébrées, ne s’étant découvert aucun empêchement, nous, curé soussigné, avons reçu le mutuel consentement de mariage de [époux], fils majeur de [père] et de [mère], et de [épouse], fille de [père] et de [mère], et leur avons donné la bénédiction nuptiale, en présence de [témoin 1], [témoin 2], [témoin 3] et [témoin 4]. [curé], curé.',
            d: 'L’an mil sept cent [année] et le [jour] [mois] a été inhumé dans le cimetière de cette paroisse le corps de [défunt], [veuf / époux] de [conjoint], âgé d’environ [âge] ans, décédé hier, muni des sacrements de l’Église, en présence de [témoins] qui ont signé / ne l’ont su. [curé], curé.'},
        'an2': {b: 'Aujourd’hui [jour] [mois républicain] l’an [an] de la République française une et indivisible, à [heure], par-devant moi [officier], membre du conseil général de la commune de [commune], élu pour dresser les actes destinés à constater les naissances, mariages et décès des citoyens, est comparu [père], [métier], lequel m’a présenté un enfant [mâle / femelle], né [hier] de lui et de [mère], son épouse, auquel il a donné le prénom de [prénom], en présence de [témoin 1] et [témoin 2].',
            m: 'Aujourd’hui [jour] [mois républicain] l’an [an] de la République française, à [heure], en la maison commune, par-devant moi [officier], sont comparus [époux], [métier], âgé de [âge] ans, fils de [père] et de [mère], et [épouse], âgée de [âge] ans, fille de [père] et de [mère], lesquels, après lecture des publications, ont déclaré se prendre en mariage ; j’ai prononcé au nom de la loi qu’ils sont unis en mariage, en présence de [témoins].',
            d: 'Aujourd’hui [jour] [mois républicain] l’an [an] de la République française, par-devant moi [officier], sont comparus [déclarant 1] et [déclarant 2], lesquels m’ont déclaré que [défunt], âgé de [âge] ans, [métier], est décédé [hier] à [heure] en son domicile de [lieu].'},
        '1820': {b: 'L’an mil huit cent [année], le [jour] [mois], à [heure] heures du [matin / soir], par-devant nous [maire], maire, officier de l’état civil de la commune de [commune], canton de [canton], département de [département], est comparu [père], âgé de [âge] ans, [métier], domicilié en cette commune, lequel nous a présenté un enfant du sexe [masculin / féminin], né le [jour] à [heure], de lui déclarant et de [mère], son épouse, et auquel il a déclaré vouloir donner le prénom de [prénom] ; lesdites déclaration et présentation faites en présence de [témoin 1], âgé de [âge] ans, et de [témoin 2], âgé de [âge] ans, et ont signé avec nous / ont déclaré ne savoir signer.',
            m: 'L’an mil huit cent [année], le [jour] [mois], à [heure] heures, par-devant nous [maire], maire, officier de l’état civil de la commune de [commune], sont comparus [époux], âgé de [âge] ans, [métier], né à [lieu] le [date], fils majeur de [père] et de [mère], d’une part ; et [épouse], âgée de [âge] ans, née à [lieu] le [date], fille de [père] et de [mère], d’autre part ; lesquels nous ont requis de procéder à la célébration du mariage projeté entre eux, dont les publications ont été faites les [dates] ; après avoir donné lecture des pièces, nous avons prononcé au nom de la loi qu’ils sont unis par le mariage, en présence de [témoin 1], [témoin 2], [témoin 3] et [témoin 4].',
            d: 'L’an mil huit cent [année], le [jour] [mois], à [heure] heures, par-devant nous [maire], maire, officier de l’état civil de la commune de [commune], sont comparus [déclarant 1], âgé de [âge] ans, [lien avec le défunt], et [déclarant 2], âgé de [âge] ans, lesquels nous ont déclaré que [défunt], âgé de [âge] ans, [métier], [époux / veuf] de [conjoint], est décédé [hier / ce jour] à [heure] heures, en son domicile.'}};
    const kindGroup = k => (['mariage', 'contrat', 'fiancailles', 'divorce'].includes(k) ? 'm' : ['deces', 'sepulture', 'inhumation'].includes(k) ? 'd' : 'b');
    const eraOf = y => (!y ? '1780' : y < 1750 ? '1700' : y < 1792 ? '1780' : y <= 1805 ? 'an2' : '1820');
    const yearOf = (...txt) => { for (const s of txt) { const m = String(s || '').match(/\b(1[4-9]\d\d)\b/); if (m) return Number(m[1]); if (/\ban\s+(?:[ivx]+|\d{1,2}|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze)\b/i.test(s) && /(vend[ée]miaire|brumaire|frimaire|niv[ôo]se|pluvi[ôo]se|vent[ôo]se|germinal|flor[ée]al|prairial|messidor|thermidor|fructidor|r[ée]publique)/i.test(s)) return 1798; } return 0; };
    /** le modèle pour cette sorte d'acte et cette année : {era, group, text} */
    const modelFor = (kind, year) => { const era = eraOf(year), group = kindGroup(kind); return {era, group, text: MODELS[era][group]}; };

    /* ═════════ 📅 Une date en toutes lettres → la vraie date ═════════ */
    const NUM = {un: 1, une: 1, premier: 1, premiere: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
        vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mil: 1000, mille: 1000};
    /** « mil sept cent quatre-vingt-neuf » → 1789 ; « vingt-trois » → 23 ; null sinon */
    function wordsToNumber(str) {
        const words = fold(str).replace(/'/g, ' ').split(/[\s-]+/).filter(w => w && w !== 'et');
        if (!words.length) return null;
        let total = 0, cur = 0;
        for (const w of words) {
            if (/^\d+$/.test(w)) { cur += Number(w); continue; }
            const n = NUM[w]; if (n === undefined) return null;
            if (n === 1000) { total += (cur || 1) * 1000; cur = 0; } else if (n === 100) cur = (cur || 1) * 100; else if (n === 20 && cur % 100 === 4) cur += 76; else cur += n;
        }
        return total + cur;
    }
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const MONTH_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MALIAS = {febvrier: 2, aoust: 8, may: 5, '7bre': 9, '8bre': 10, '9bre': 11, xbre: 12, '10bre': 12, 'decembre': 12};
    const REP_RX = /(vendemiaire|brumaire|frimaire|nivose|pluviose|ventose|germinal|floreal|prairial|messidor|thermidor|fructidor)/;
    const NW = '(?:\\d{1,4}|un|une|premier|premiere|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cent|cents|mil|mille|et)';
    const NSEQ = `${NW}(?:[\\s-]+${NW})*`;
    /**
     * parseDate(« le vingt-trois brumaire an deux ») → {label, iso, rep} ; (« mil sept cent quatre-vingt-neuf, le douze mars ») → {label: '12 mars 1789', iso: '1789-03-12'}
     * opt.republican : LCNDA_AUTREFOIS.republican ; null si ce n'est pas une date
     */
    function parseDate(sel, opt = {}) {
        const s = fold(sel).replace(/[,;.()]/g, ' ').replace(/\s+/g, ' ').trim(); if (!s || s.length > 160) return null;
        let m = s.match(new RegExp(`(${NSEQ}|1er|[ivx]+)\\s+(?:jour\\s+(?:de\\s+)?)?${REP_RX.source}\\s+(?:de\\s+)?(?:l')?\\s*an\\s+([ivx]+|${NSEQ})`));
        if (m) {
            const rep = opt.republican || root.LCNDA_AUTREFOIS?.republican; if (!rep) return null;
            const r = rep(`${m[1]} ${m[2]} an ${m[3].replace(/\s+de\s+la\s+republique.*$/, '').trim()}`);
            if (!r?.ok) return r ? {error: r.text} : null;
            return {label: `${r.greg.d === 1 ? '1er' : r.greg.d} ${MONTH_FR[r.greg.m - 1]} ${r.greg.y}`, iso: `${r.greg.y}-${String(r.greg.m).padStart(2, '0')}-${String(r.greg.d).padStart(2, '0')}`, rep: r.from, weekday: r.weekday};
        }
        m = s.match(/(?:(1er|\d{1,2}|[a-z-]+(?:\s+et\s+un)?)\s+(?:jour\s+)?(?:du\s+mois\s+)?(?:de\s+|d')?)?\b(janvier|f[e]v?b?vrier|febvrier|fevrier|mars|avril|mai|may|juin|juillet|aout|aoust|septembre|octobre|novembre|decembre|7bre|8bre|9bre|xbre|10bre)\b(?:\s+(?:de\s+)?(?:l'\s*an\s+)?(.*))?/);
        if (!m) return null;
        const mo = MONTHS.indexOf(m[2]) + 1 || MALIAS[m[2]] || 0; if (!mo) return null;
        let day = m[1] ? (m[1] === '1er' ? 1 : wordsToNumber(m[1].replace(/^(le|du|ce)\s+/, ''))) : null;
        if (m[1] && !day) { const tail = m[1].split(/\s+/).slice(-3); for (let k = tail.length; k > 0 && !day; k--) day = wordsToNumber(tail.slice(-k).join(' ')); }
        if (day && (day < 1 || day > 31)) day = null;
        const findYear = txt => { const rx = new RegExp(NSEQ, 'g'); let q, best = null; while ((q = rx.exec(txt))) { const n = wordsToNumber(q[0]); if (n && n >= 900 && n <= 2100) { best = n; break; } } return best; };
        const year = (m[3] && findYear(m[3])) || findYear(s.slice(0, m.index)) || null;
        if (!year && !day) return null;
        return {label: [day === 1 ? '1er' : day, MONTH_FR[mo - 1], year].filter(Boolean).join(' '), iso: year ? `${year}-${String(mo).padStart(2, '0')}${day ? '-' + String(day).padStart(2, '0') : ''}` : ''};
    }

    /* ═════════ 💡 mot illisible, 📖 glossaire : le mot sous le curseur ═════════ */
    /** le mot autour de la position pos : {s, e, w} (lettres, ?, …, points de suspension, apostrophes internes) */
    function wordAt(text, pos) {
        const isW = c => /[\p{L}\p{M}?….ᵉʳˢᵗᵐᵇᵈⁿᵒᵃ°]/u.test(c || '');
        let s = pos, e = pos; while (s > 0 && isW(text[s - 1])) s--; while (e < text.length && isW(text[e])) e++;
        let w = text.slice(s, e); const lead = w.match(/^\.+/)?.[0].length || 0; s += lead; w = w.slice(lead);
        const t = w.match(/\.+$/)?.[0].length || 0; if (t && t !== 3) { e -= t; w = w.slice(0, -t); }
        return {s, e, w};
    }
    /** un motif de mot illisible ? « Ma…d », « Ma...d », « Ma?aud » (au moins deux lettres sûres, et une lettre après un « ? ») */
    const isPattern = w => { const v = String(w || '').replace(/\.\.\./g, '…'); return (v.match(/\p{L}/gu) || []).length >= 2 && (/…/.test(v) || /\?\p{L}/u.test(v)); };
    const gloRead = () => { try { const a = JSON.parse(localStorage.getItem(GLO_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && x.w && x.m).slice(0, 500) : []; } catch (_) { return []; } };
    const gloWrite = list => { try { localStorage.setItem(GLO_KEY, JSON.stringify(list)); } catch (_) {} };
    /** « pnt = présent » → {w: 'pnt', m: 'présent'} ; null sinon */
    const gloParse = line => { const m = String(line || '').match(/^\s*([^=]{1,40}?)\s*[=:]\s*(.{1,120}?)\s*$/); return m ? {w: m[1], m: m[2]} : null; };
    const gloFind = (list, w) => { const k = fold(w).replace(/[.\s]+$/, ''); return k ? list.find(x => fold(x.w).replace(/[.\s]+$/, '') === k) || null : null; };
    /** les entrées du glossaire présentes dans le texte (chaque mot une fois) */
    const gloInText = (list, text) => { const words = new Set(String(text || '').split(/[^\p{L}\p{M}.ᵉʳˢᵗᵐᵇᵈⁿᵒᵃ°]+/u).map(w => fold(w).replace(/[.]+$/, '')).filter(Boolean)); return list.filter(x => words.has(fold(x.w).replace(/[.\s]+$/, ''))); };

    ext.txAides = {MODELS, ERAS, modelFor, eraOf, yearOf, kindGroup, wordsToNumber, parseDate, wordAt, isPattern, gloParse, gloFind, gloInText};
    if (typeof document === 'undefined') { if (typeof module === 'object' && module.exports) module.exports = ext.txAides; return; }

    /* ═════════ l'Atelier ═════════ */
    const blanks = t => esc(t).replace(/\[([^\]]+)\]/g, '<mark class="txh-blank">[$1]</mark>');
    const api = (...a) => A().api(...a);
    function init(plug) {
        const {dlg, area, $} = plug, stage = $('[data-tx-stage]'), editor = $('[data-tx-editor]');
        if (!stage || !area) return;
        // la bande des aides, sous le texte
        const hint = document.createElement('div'); hint.className = 'txh-hint'; hint.hidden = true; hint.setAttribute('role', 'status'); hint.setAttribute('aria-live', 'polite');
        (editor || area).after(hint);
        // le panneau 🧰, à côté de l'image
        const panel = document.createElement('aside'); panel.className = 'txh-panel'; panel.hidden = true; panel.setAttribute('aria-label', i18n('Aides à la lecture'));
        stage.appendChild(panel);
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '🧰'; btn.dataset.txhToggle = '';
        btn.title = i18n('Aides : modèle d’acte de l’époque, alphabet, mon glossaire, signatures, ma progression'); btn.setAttribute('aria-label', i18n('Aides à la lecture'));
        $('[data-tx-rail]')?.appendChild(btn);
        const curYear = () => yearOf($('[data-tx="date_text"]')?.value, area.value.slice(0, 400));
        let era = null, group = null; // choisis à la main (sinon : d'après l'acte)
        const sec = (id, title, body, open) => `<details class="txh-sec" data-txh-sec="${id}"${open ? ' open' : ''}><summary>${title}</summary><div class="txh-body" data-txh-body="${id}">${body}</div></details>`;
        function paintModel() {
            const auto = modelFor(plug.kindNow?.() || '', curYear()), e = era || auto.era, g = group || auto.group, box = panel.querySelector('[data-txh-body="model"]'); if (!box) return;
            box.innerHTML = `<p class="txh-model" data-i18n-off lang="fr">${blanks(MODELS[e][g])}</p>
                <details class="txh-more"><summary>⚙️ ${esc(i18n('Personnaliser'))}</summary><div class="txh-row">
                <select data-txh-era aria-label="${esc(i18n('Époque'))}">${ERAS.map(([k, l]) => `<option value="${k}"${k === e ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>
                <select data-txh-group aria-label="${esc(i18n('Sorte d’acte'))}">${[['b', 'Baptême, naissance'], ['m', 'Mariage'], ['d', 'Sépulture, décès']].map(([k, l]) => `<option value="${k}"${k === g ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>
                ${era || group ? `<button type="button" class="button small secondary" data-txh-auto>↺ ${esc(i18n('D’après l’acte'))}</button>` : ''}</div></details>
                <p class="ui-hint">${esc(i18n('Un texte type, pour deviner un mot à sa place. Les mots entre [crochets] changent d’un acte à l’autre.'))}</p>`;
        }
        function paintGlo() {
            const box = panel.querySelector('[data-txh-body="glo"]'); if (!box) return;
            const list = gloRead(), here = new Set(gloInText(list, area.value).map(x => x.w)), sel = area.value.slice(area.selectionStart, area.selectionEnd).trim();
            box.innerHTML = `<form class="txh-row" data-txh-gloform><input data-txh-glow placeholder="${esc(i18n('mot, ex. pnt'))}" value="${esc(sel.length <= 40 ? sel : '')}" aria-label="${esc(i18n('Mot ou abréviation'))}" spellcheck="false"><input data-txh-glom placeholder="${esc(i18n('sens, ex. présent'))}" aria-label="${esc(i18n('Ce qu’il veut dire'))}"><button type="submit" class="button small">＋ ${esc(i18n('Ajouter'))}</button></form>
                ${list.length ? `<ul class="txh-glo">${list.map((x, i) => `<li class="${here.has(x.w) ? 'is-here' : ''}"><b>${esc(x.w)}</b> = ${esc(x.m)}<button type="button" class="txh-x" data-txh-glodel="${i}" title="${esc(i18n('Retirer'))}" aria-label="${esc(i18n('Retirer'))}">×</button></li>`).join('')}</ul>` : `<p class="ui-hint">${esc(i18n('Tes mots et abréviations (« pnt = présent ») : rappelés sous le texte quand ils reviennent. Gardé sur cet ordinateur.'))}</p>`}`;
        }
        async function paintSigns() {
            const box = panel.querySelector('[data-txh-body="sign"]'); if (!box) return;
            const mine = (plug.t.data.zones || []).filter(z => z.kind === 'sign' && z.id);
            if (!mine.length) { box.innerHTML = `<p class="ui-hint">${esc(i18n('Pas de zone « signature » dans cet acte : dessine une zone (▭) autour d’une signature et choisis la sorte « signature ».'))}</p>`; return; }
            const txt = z => (z.e > z.s ? area.value.slice(z.s, Math.min(z.e, z.s + 60)) : '') || i18n('Signature');
            box.innerHTML = `${!plug.t.id || plug.isDirty() ? `<p class="ui-hint">${esc(i18n('Enregistre l’acte pour voir ses signatures en image.'))}</p>` : ''}<ul class="txh-signs">${mine.map(z => `<li><span>${esc(txt(z))}</span><button type="button" class="button small secondary" data-txh-cmp="${esc(z.id)}">${esc(i18n('Comparer avec…'))}</button></li>`).join('')}</ul>`;
        }
        /** 📊 le petit graphique en barres : les actes transcrits mois par mois (le survol donne le mois et le nombre) */
        function progChart(months, max) {
            if (months.length < 2) return '';
            const bw = 14, H = 56, W = months.length * bw;
            const bars = months.map((m, i) => { const h = Math.max(2, Math.round(m.acts / max * (H - 14))); return `<rect x="${i * bw + 2}" y="${H - 12 - h}" width="${bw - 4}" height="${h}" rx="2"><title>${esc(m.month)} : ${esc(String(m.acts))}</title></rect>`; }).join('');
            return `<svg class="txh-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(i18n('Actes transcrits mois par mois'))}">${bars}
                <text x="1" y="${H - 1}" font-size="9" data-i18n-off>${esc(months[0].month)}</text><text x="${W - 1}" y="${H - 1}" font-size="9" text-anchor="end" data-i18n-off>${esc(months[months.length - 1].month)}</text></svg>`;
        }
        async function paintProgress() {
            const box = panel.querySelector('[data-txh-body="prog"]'); if (!box) return;
            box.textContent = '…';
            let r; try { r = await api('txaid_progress'); } catch (_) { box.textContent = i18n('Pas disponible pour l’instant.'); return; }
            const T = r.total || {}, pct = (u, w) => (w ? Math.round(u / w * 100) : 0), max = Math.max(1, ...(r.months || []).map(m => m.acts));
            box.innerHTML = `<p><b>${esc(String(T.acts || 0))}</b> ${esc(i18n('actes transcrits'))} · <b>${esc(String(pct(T.unsure, T.words)))} %</b> ${esc(i18n('de mots douteux'))}</p>
                ${progChart(r.months || [], max)}
                ${(r.months || []).length ? `<table class="txh-prog"><thead><tr><th>${esc(i18n('Mois'))}</th><th>${esc(i18n('Actes'))}</th><th>${esc(i18n('Douteux'))}</th></tr></thead><tbody>${r.months.map(m => `<tr><td>${esc(m.month)}</td><td><span class="txh-bar" style="width:${Math.round(m.acts / max * 60) + 4}px"></span> ${esc(String(m.acts))}</td><td>${esc(String(pct(m.unsure, m.words)))} %</td></tr>`).join('')}</tbody></table>` : ''}
                <p class="ui-hint">${esc(i18n('Mots douteux : [?], [illisible] et les mots avec « ? » ou « … ». Moins il y en a, mieux tu lis !'))}</p>`;
        }
        function paintPanel() {
            panel.innerHTML = `<div class="txh-head"><b>🧰 ${esc(i18n('Aides à la lecture'))}</b><button type="button" class="txh-x" data-txh-close title="${esc(i18n('Fermer'))}" aria-label="${esc(i18n('Fermer'))}">×</button></div>
                ${sec('model', `📜 ${esc(i18n('Modèle d’acte de l’époque'))}`, '', true)}
                ${sec('abc', `🔤 ${esc(i18n('Alphabet de l’époque'))}`, '')}
                ${sec('glo', `📖 ${esc(i18n('Mon glossaire'))}`, '')}
                ${sec('sign', `✍️ ${esc(i18n('Signatures'))}`, '')}
                ${sec('prog', `📊 ${esc(i18n('Ma progression'))}`, '')}`;
            paintModel(); paintGlo();
        }
        const setOpen = on => { panel.hidden = !on; btn.classList.toggle('is-active', on); btn.setAttribute('aria-pressed', String(on)); try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (_) {} if (on) paintPanel(); };
        plug.aides = {toggle: () => setOpen(panel.hidden), isOn: () => !panel.hidden, open: () => setOpen(true)};
        btn.addEventListener('click', () => plug.aides.toggle());
        panel.addEventListener('toggle', e => {
            const d = e.target; if (!d.open || !d.matches?.('[data-txh-sec]')) return;
            const id = d.dataset.txhSec, box = d.querySelector('.txh-body');
            if (id === 'abc' && !box.dataset.done && ext.readingAid?.mount) { box.dataset.done = '1'; ext.readingAid.mount(box, {tab: 'lettres', year: String(curYear() || '')}); }
            if (id === 'abc' && !ext.readingAid?.mount) box.innerHTML = `<p class="ui-hint">${esc(i18n('Outils → Aide à la lecture → Les lettres.'))}</p>`;
            if (id === 'sign') paintSigns(); if (id === 'prog') paintProgress(); if (id === 'glo') paintGlo();
        }, true);
        panel.addEventListener('change', e => {
            if (e.target.matches('[data-txh-era]')) { era = e.target.value; paintModel(); }
            if (e.target.matches('[data-txh-group]')) { group = e.target.value; paintModel(); }
        });
        panel.addEventListener('submit', e => {
            if (!e.target.matches('[data-txh-gloform]')) return; e.preventDefault();
            const w = e.target.querySelector('[data-txh-glow]').value.trim(), m = e.target.querySelector('[data-txh-glom]').value.trim();
            if (!w || !m) { (w ? e.target.querySelector('[data-txh-glom]') : e.target.querySelector('[data-txh-glow]')).focus(); return; }
            const before = gloRead(), list = before.filter(x => fold(x.w) !== fold(w)); list.unshift({w: w.slice(0, 40), m: m.slice(0, 120)}); gloWrite(list); paintGlo(); onCaret();
            A().toast?.(i18n('« {w} » ajouté à ton glossaire.', {w}));
        });
        panel.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-txh-close]')) { setOpen(false); btn.focus(); return; }
            if (b.matches('[data-txh-auto]')) { era = group = null; paintModel(); return; }
            if (b.matches('[data-txh-glodel]')) {
                const before = gloRead(), x = before[Number(b.dataset.txhGlodel)]; if (!x) return;
                gloWrite(before.filter((_, i) => i !== Number(b.dataset.txhGlodel))); paintGlo(); onCaret();
                const undo = () => { gloWrite(before); paintGlo(); onCaret(); };
                A().undoToast ? A().undoToast(i18n('« {w} » retiré du glossaire', {w: x.w}), {undo}) : A().toast?.(i18n('« {w} » retiré du glossaire', {w: x.w}));
                return;
            }
            if (b.matches('[data-txh-cmp]')) compareSign(b.dataset.txhCmp);
        });
        const thumb = (act, zone) => `api.php?action=atelier_idees&op=thumb&act=${encodeURIComponent(act)}&zone=${encodeURIComponent(zone)}`;
        async function compareSign(zoneId) {
            let r; try { r = await api('txaid_signs', {act_id: plug.t.id || 0}); } catch (_) { r = {signs: []}; }
            const signs = r.signs || [];
            const mine = `<figure class="txh-sig"><img src="${thumb(plug.t.id, zoneId)}" alt="${esc(i18n('Signature de cet acte'))}" onerror="this.replaceWith(document.createTextNode('—'))"><figcaption>${esc(i18n('Cet acte'))}</figcaption></figure>`;
            const d = ext.openDialog?.({eyebrow: i18n('SIGNATURES'), title: `✍️ ${i18n('Comparer deux signatures')}`, closeLabel: i18n('Fermer'),
                body: `<div class="txh-pair" data-txh-pair>${mine}<figure class="txh-sig" data-txh-other><figcaption>${esc(i18n('Choisis une signature ci-dessous'))}</figcaption></figure></div>
                    ${signs.length ? `<ul class="txh-signlist">${signs.map((s, i) => `<li><button type="button" class="txh-signpick" data-txh-pick="${i}"><img src="${thumb(s.act_id, s.zone_id)}" alt="" loading="lazy" onerror="this.remove()"><span>${esc([s.text, s.title, s.date, s.place].filter(Boolean).join(' · ') || i18n('Acte {n}', {n: s.act_id}))}</span></button></li>`).join('')}</ul>`
                        : `<p class="ui-hint">${esc(i18n('Aucune autre zone « signature » dans tes actes pour l’instant.'))}</p>`}`});
            d?.addEventListener('click', e => {
                const p = e.target.closest('[data-txh-pick]'); if (!p) return; const s = signs[Number(p.dataset.txhPick)];
                d.querySelector('[data-txh-other]').innerHTML = `<img src="${thumb(s.act_id, s.zone_id)}" alt=""><figcaption>${esc([s.title, s.date, s.place].filter(Boolean).join(' · '))}</figcaption>`;
            });
        }

        /* la bande sous le texte : 📖 glossaire, 💡 mot illisible, 📅 date choisie */
        let matchTimer = 0, lastQ = '', dateRes = null;
        const paintHint = parts => { hint.innerHTML = parts.filter(Boolean).join(''); hint.hidden = !hint.innerHTML; };
        function onCaret() {
            const parts = [], v = area.value, a = area.selectionStart, b = area.selectionEnd;
            dateRes = null;
            if (b > a && b - a <= 160) {
                const r = parseDate(v.slice(a, b));
                if (r?.label) { dateRes = r; parts.push(`<span class="txh-chip">📅 <b>${esc(r.label)}</b>${r.rep ? ` <small>(${esc(r.rep)})</small>` : ''}<button type="button" class="button small secondary" data-txh-setdate title="${esc(i18n('Mettre cette date dans la case « Date » de l’acte'))}">↦ ${esc(i18n('Mettre dans la fiche'))}</button></span>`); }
                else if (r?.error) parts.push(`<span class="txh-chip is-warn">📅 ${esc(r.error)}</span>`);
            }
            const w = wordAt(v, a), g = w.w && gloFind(gloRead(), w.w);
            if (g) parts.push(`<span class="txh-chip">📖 <b>${esc(g.w)}</b> = ${esc(g.m)}</span>`);
            if (isPattern(w.w)) {
                parts.push(`<span class="txh-chip" data-txh-sugg>💡 ${esc(i18n('Cherche « {w} » dans ta base…', {w: w.w}))}</span>`);
                clearTimeout(matchTimer); matchTimer = setTimeout(() => suggest(w), 280);
            }
            paintHint(parts);
        }
        async function suggest(w) {
            const q = w.w; lastQ = q; let r;
            try { r = await api('txaid_match', {q, place: $('[data-tx="place"]')?.value || ''}); } catch (_) { return; }
            if (lastQ !== q) return; const el = hint.querySelector('[data-txh-sugg]'); if (!el) return;
            const items = r.items || [], ico = {surname: '👪', given: '🙂', place: '📍'};
            el.innerHTML = items.length ? `💡 ${items.slice(0, 12).map(x => `<button type="button" class="txh-sug" data-txh-use="${esc(x.value)}" data-s="${w.s}" data-e="${w.e}" title="${esc(i18n({surname: 'Nom de famille dans ta base', given: 'Prénom dans ta base', place: 'Lieu dans ta base'}[x.type]))}${x.near ? ' · ' + esc(i18n('près du lieu de l’acte')) : ''}">${ico[x.type]} ${esc(x.value)}${x.n > 1 ? ` <small>×${x.n}</small>` : ''}</button>`).join('')}` : `💡 ${esc(i18n('Rien dans ta base pour « {w} ».', {w: q}))}`;
        }
        hint.addEventListener('click', e => {
            const u = e.target.closest('[data-txh-use]');
            if (u) { const s = Number(u.dataset.s), en = Number(u.dataset.e); if (area.value.slice(s, en).replace(/\.\.\./g, '…') !== lastQ.replace(/\.\.\./g, '…')) return;
                area.focus(); area.setSelectionRange(s, en); if (!document.execCommand?.('insertText', false, u.dataset.txhUse)) { area.setRangeText(u.dataset.txhUse, s, en, 'end'); area.dispatchEvent(new Event('input', {bubbles: true})); }
                onCaret(); return; }
            if (e.target.closest('[data-txh-setdate]') && dateRes) {
                const inp = $('[data-tx="date_text"]'); if (!inp) return; const before = inp.value, val = dateRes.rep ? `${dateRes.label} (${dateRes.rep})` : dateRes.label;
                const put = x => { inp.value = x; plug.t.date_text = x; plug.touch(); paintModel(); };
                put(val);
                A().undoToast ? A().undoToast(i18n('Date de l’acte : {d}', {d: val}), {undo: () => put(before), redo: () => put(val)}) : A().toast?.(i18n('Date de l’acte : {d}', {d: val}));
            }
        });
        let raf = 0; const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; onCaret(); }); };
        ['keyup', 'mouseup', 'input', 'select'].forEach(ev => area.addEventListener(ev, soon));
        $('[data-tx="kind"]')?.addEventListener('change', () => { if (!panel.hidden) paintModel(); });
        $('[data-tx="date_text"]')?.addEventListener('input', () => { if (!panel.hidden) paintModel(); });
        let on0 = false; try { on0 = localStorage.getItem(OPEN_KEY) === '1'; } catch (_) {}
        if (on0) setOpen(true);
    }

    ext.txPlugins = ext.txPlugins || []; ext.txPlugins.push(init);
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Outils' && plug.aides ? [{icon: '🧰', label: plug.aides.isOn() ? i18n('Fermer les aides') : i18n('Aides : modèle de l’époque, glossaire…'), run: () => plug.aides.toggle()}] : []));
})();
