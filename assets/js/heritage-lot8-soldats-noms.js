/**
 * LCNDA — 🎖️ Soldats et noms (lot 8) : dix pistes, toutes sourcées, sur la fiche d'une personne (bloc « 🎖️ Régiment, nom,
 * nationalité »), dans la monographie de commune, dans Listes et à la demande (« 🔎 Ce qui le concerne »).
 *  🎖️ L'histoire de son régiment   : le régiment lu dans son dossier militaire (bloc Militaire, bloc Poilu 14-18, notes, actes :
 *                                      « 63e RI », « 63e régiment d'infanterie »…) → l'article de Wikipédia (CC BY-SA) : caserné à…,
 *                                      a combattu à… pendant ses années de service ; lien vers le journal de marche (JMO).
 *  🗺️ Le front le jour de sa mort   : pour un mort de 14-18, où combattait son régiment l'année de sa mort (Wikipédia). Aucune
 *                                      carte libre du front jour par jour n'a été trouvée : pas de calque de carte, un lien.
 *  🪖 Prisonnier en 14-18 ?          : les fiches du CICR (lien seulement ; « 📋 Copier le nom et ouvrir »), déjà dans « Où chercher ».
 *  🏥 Les hôpitaux de sa ville 14-18 : les hôpitaux connus (Wikidata, données de « 🧭 Histoire autour », relues ici) + liens.
 *  🇫🇷 Les prénoms révolutionnaires  : calendrier républicain (noms des jours, Wikipédia), catégorie « Prénom révolutionnaire ».
 *  👶 Les noms des enfants trouvés   : comment les hospices nommaient les enfants (Wikipédia, citations vérifiées) ; renvoie à
 *                                      l'hospice de « 🧭 Histoire autour » sans le recopier.
 *  📚 Son nom dans les romans        : personnages de fiction de Wikidata (CC0) qui portent son nom de famille.
 *  🔤 Les variantes de son nom       : noms de famille « dits identiques » (Wikidata P460) ; « ＋ Ajouter aux variantes » (↶).
 *  🛂 Les changements de nationalité : Savoie et Nice 1860, Alsace-Moselle 1871 et 1918, Algérie, colonies, lois de 1927, 1940,
 *                                      1962 (citations vérifiées) ; les lois générales restent dans « ⚖️ Ce que la loi disait ».
 *  🏛️ Sa naturalisation au JO        : les décrets nominatifs ne sont pas dans les données ouvertes du JO (vie privée) : liens.
 * Données : assets/data/l8b-*.json(.gz), refaites par scripts/lot8-soldats-noms/ ; serveur : lib/lot8_soldats_noms.php (lecture).
 * Réglages → « 🎖️ Soldats et noms » : chaque partie s'éteint (localStorage « genealogie-lot8-soldats-noms »).
 *   window.LCNDA_EXT.soldatsNoms = {…}   (Node : module.exports = core)   Essai : tests/test-lot8-soldats-noms.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? String(w[k]) : m)); };

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const table = f => (f?.rows || []).map(r => Object.fromEntries(f.fields.map((k, i) => [k, r[i] ?? null])));
    const yearOf = v => { const m = String(v ?? '').match(/(^|[^\d])(1[5-9]\d\d|20\d\d)(?!\d)/); return m ? Number(m[2]) : null; };

    /* ── 🎖️ le régiment dans un texte ── */
    // les sortes d'unités : [sigle, mots qui la disent (texte sans accents, en minuscules)]
    const UNIT_WORDS = [
        ['RIT', "regiment d'infanterie territoriale|infanterie territoriale|r\\.? ?i\\.? ?t\\.?|reg\\.? inf\\.? terr\\.?|territorial d'infanterie"],
        ['RIC', "regiment d'infanterie coloniale|infanterie coloniale|r\\.? ?i\\.? ?c\\.?"],
        ['RIM', "regiment d'infanterie de marine|infanterie de marine|r\\.? ?i\\.? ?m\\.?"],
        ['BCA', 'bataillon de chasseurs alpins|chasseurs alpins|b\\.? ?c\\.? ?a\\.?'],
        ['BCP', 'bataillon de chasseurs a pied|bataillon de chasseurs|chasseurs a pied|b\\.? ?c\\.? ?p\\.?'],
        ['RCA', "regiment de chasseurs d'afrique|chasseurs d'afrique|r\\.? ?c\\.? ?a\\.?"],
        ['RCC', 'regiment de chasseurs a cheval|chasseurs a cheval|r\\.? ?c\\.? ?c\\.?|r\\.? ?ch\\.?'],
        ['RD', 'regiment de dragons|dragons|r\\.? ?d\\.?'], ['RC', 'regiment de cuirassiers|cuirassiers'], ['RH', 'regiment de hussards|hussards|r\\.? ?h\\.?'],
        ['RSA', 'regiment de spahis algeriens|spahis algeriens|spahis'],
        ['RAC', "regiment d'artillerie de campagne|artillerie de campagne|r\\.? ?a\\.? ?c\\.?"],
        ['RAL', "regiment d'artillerie lourde|artillerie lourde|r\\.? ?a\\.? ?l\\.?"],
        ['RAP', "regiment d'artillerie a pied|artillerie a pied|r\\.? ?a\\.? ?p\\.?"],
        ['RAM', "regiment d'artillerie de montagne|artillerie de montagne"],
        ['RACol', "regiment d'artillerie coloniale|artillerie coloniale"],
        ['RAMa', "regiment d'artillerie de marine|artillerie de marine"],
        ['RA', "regiment d'artillerie|d'artillerie|artillerie|r\\.? ?a\\.?"],
        ['RG', 'regiment du genie|du genie|genie|r\\.? ?g\\.?'], ['RT', 'regiment du train|escadron du train|du train'],
        ['RZ', 'regiment de zouaves|zouaves|r\\.? ?z\\.?'],
        ['RTA', 'regiment de tirailleurs algeriens|tirailleurs algeriens|r\\.? ?t\\.? ?a\\.?'],
        ['RTS', 'regiment de tirailleurs senegalais|tirailleurs senegalais|r\\.? ?t\\.? ?s\\.?'],
        ['RTM', 'regiment de tirailleurs marocains|tirailleurs marocains|r\\.? ?t\\.? ?m\\.?'],
        ['RTT', 'regiment de tirailleurs tunisiens|tirailleurs tunisiens'],
        ['REI', "regiment etranger d'infanterie|etranger d'infanterie|r\\.? ?e\\.? ?i\\.?"],
        ['RIL', "regiment d'infanterie legere|infanterie legere|leger"],
        ['RI', "regiment d'infanterie de ligne|regiment d'infanterie|reg(?:t|\\.)? d'inf(?:anterie|\\.)?|rgt d'inf(?:anterie|\\.)?|d'infanterie|de ligne|r\\.? ?i\\.?|inf(?:anterie)?\\b"]];
    const UNIT_RX = new RegExp(`(?:^|[^\\d])(\\d{1,3})\\s*(?:er|ere|re|e|eme|ieme|°|ᵉ|ᵉʳ)?\\s*(?:-\\s*)?(?:regiment\\s+|regt\\.?\\s+|rgt\\.?\\s+)?(${UNIT_WORDS.map(([k, w]) => `(?<${k}>${w})`).join('|')})(?![a-z])`, 'g');
    /** les régiments écrits dans un texte : [{kind, n, raw, at}] (dans l'ordre du texte, sans doublon) */
    function regimentRefs(text) {
        const t = fold(text).replace(/r\s*\.\s*i\s*\./g, 'r.i.'), out = [], seen = new Set();
        for (const m of t.matchAll(UNIT_RX)) {
            const n = Number(m[1]); if (!n || n > 450) continue;
            const kind = Object.keys(m.groups).find(k => m.groups[k] !== undefined); if (!kind) continue;
            // « classe 1912 », « 1er janvier » : déjà exclus (les mots d'unité sont exigés) ; « 3 dragons » sans « e » : trop faible
            const ord = /^\d{1,3}\s*(?:er|ere|re|e|eme|ieme|°|ᵉ)/.test(m[0].replace(/^[^\d]/, ''));
            const strong = /regiment|regt|rgt|bataillon|d'infanterie|de ligne|artillerie|genie|chasseurs|zouaves|tirailleurs|dragons|cuirassiers|hussards|spahis|train/.test(m[2]);
            if (!ord && !strong) continue;
            const key = `${kind}:${n}`; if (seen.has(key)) continue; seen.add(key);
            out.push({kind, n, raw: m[0].replace(/^[^\d]/, '').trim(), at: m.index});
        }
        return out;
    }
    /** une date (« 1914-08-02 », « 2 août 1914 », « 1914 ») → année */
    const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    function isoOf(s) {
        const t = fold(s); let m;
        if ((m = t.match(/(\d{4})-(\d\d)(?:-(\d\d))?/))) return `${m[1]}-${m[2]}${m[3] ? '-' + m[3] : ''}`;
        if ((m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        if ((m = t.match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/)) && MOIS.indexOf(m[2]) >= 0) return `${m[3]}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const y = yearOf(t); return y ? String(y) : '';
    }
    /**
     * Les unités de la personne, la plus sûre d'abord : [{kind, n, from, to, src, unit}]
     * src : 'poilu' (bloc Poilu 14-18), 'militaire' (bloc Militaire : services, corps, notes), 'texte' (actes, notes).
     */
    function regimentsOfLife(life) {
        const out = [], seen = new Map();
        const add = (refs, src, from = null, to = null, unit = '') => refs.forEach(r => {
            const k = `${r.kind}:${r.n}`, cur = seen.get(k);
            if (cur) { if (from && !cur.from) cur.from = from; if (to && !cur.to) cur.to = to; return; }
            const x = {kind: r.kind, n: r.n, from, to, src, unit: unit || r.raw}; seen.set(k, x); out.push(x);
        });
        for (const u of life?.poilu?.units || []) add(regimentRefs(u.unit_name), 'poilu', yearOf(u.date_from), yearOf(u.date_to), u.unit_name);
        const M = life?.military || {};
        const begin = yearOf(M.date_entree_active), end = yearOf(M.date_liberation) || yearOf(M.date_disponibilite) || yearOf(M.date_reserve);
        for (const k of ['corps_armee_active', 'services_mutations', 'corps_disponibilite', 'corps_territoriale', 'notes_militaires', 'decision_conseil', 'localites_successives']) {
            if (!M[k]) continue;
            // « services et mutations » : chaque passage a souvent sa date (« passé au 263e RI le 4 mai 1915 »)
            const refs = regimentRefs(M[k]);
            refs.forEach(r => {
                const after = String(M[k]).slice(0, 4000);
                const y = k === 'services_mutations' ? yearOf(fold(after).slice(r.at, r.at + 80)) : null;
                add([r], 'militaire', y || (k === 'corps_armee_active' ? begin : null), k === 'corps_armee_active' ? end : null);
            });
        }
        for (const e of life?.events || []) add(regimentRefs(`${e.title || ''} ${e.description || ''} ${e.address || ''}`), 'texte', num(e.year), null);
        add(regimentRefs(life?.text || ''), 'texte');
        return out;
    }
    const WWI = [1914, 1919];
    /** a-t-il fait la Grande Guerre ? (bloc Poilu, mort pour la France, mort en 1914-1919 avec un régiment, homme né 1865-1900) */
    function wasPoilu(life) {
        const p = life?.person || {}, b = num(p.birth), d = num(p.death);
        if ((life?.poilu?.units || []).length || (life?.poilu?.events || []).length) return true;
        if (p.mpf === 'yes' || p.mpf === '1' || p.mpf === 'true') return true;
        if (p.gender === 'female') return false;
        if (b !== null && (b < 1865 || b > 1900)) return false;
        if (d !== null && d < 1914) return false;
        return b !== null;
    }
    /** ses années de service avec cette unité : {from, to, why} (ce qu'on sait, sinon une estimation dite comme telle) */
    function servicePeriod(life, ref) {
        const p = life?.person || {}, b = num(p.birth), d = num(p.death);
        if (ref?.from || ref?.to) { const from = ref.from || ref.to, to = ref.to || Math.max(from, Math.min(d ?? from + 3, from + 3)); return {from, to: Math.max(from, to), why: 'dossier'}; }
        const M = life?.military || {}, bg = yearOf(M.date_entree_active), en = yearOf(M.date_liberation);
        if (bg) return {from: bg, to: en || bg + 3, why: 'dossier'};
        if (wasPoilu(life)) return {from: 1914, to: Math.min(1918, d ?? 1918), why: 'guerre'};
        if (b !== null) return {from: b + 20, to: Math.min(b + 23, d ?? b + 23), why: 'age'};
        return null;
    }
    const KIND_LABEL = {RI: ["régiment d'infanterie", 'RI'], RIT: ["régiment d'infanterie territoriale", 'RIT'], RIC: ["régiment d'infanterie coloniale", 'RIC'], RIM: ["régiment d'infanterie de marine", 'RIM'],
        BCP: ['bataillon de chasseurs à pied', 'BCP'], BCA: ['bataillon de chasseurs alpins', 'BCA'], RD: ['régiment de dragons', 'RD'], RC: ['régiment de cuirassiers', 'RC'], RH: ['régiment de hussards', 'RH'],
        RCC: ['régiment de chasseurs à cheval', 'RCC'], RCA: ["régiment de chasseurs d'Afrique", 'RCA'], RSA: ['régiment de spahis algériens', 'RSA'], RA: ["régiment d'artillerie", 'RA'],
        RAC: ["régiment d'artillerie de campagne", 'RAC'], RAL: ["régiment d'artillerie lourde", 'RAL'], RAP: ["régiment d'artillerie à pied", 'RAP'], RAM: ["régiment d'artillerie de montagne", 'RAM'],
        RACol: ["régiment d'artillerie coloniale", 'RAC'], RAMa: ["régiment d'artillerie de marine", 'RAMa'], RG: ['régiment du génie', 'RG'], RT: ['régiment du train', 'RT'], RZ: ['régiment de zouaves', 'RZ'],
        RTA: ['régiment de tirailleurs algériens', 'RTA'], RTS: ['régiment de tirailleurs sénégalais', 'RTS'], RTM: ['régiment de tirailleurs marocains', 'RTM'], RTT: ['régiment de tirailleurs tunisiens', 'RTT'],
        REI: ["régiment étranger d'infanterie", 'REI'], RIL: ["régiment d'infanterie légère", 'RIL']};
    const ordTxt = n => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`);
    const unitShort = (kind, n) => `${ordTxt(n)} ${(KIND_LABEL[kind] || ['', kind])[1]}`;
    const unitLong = (kind, n) => `${ordTxt(n)} ${(KIND_LABEL[kind] || [kind])[0]}`;
    // un « 263e RI » de réserve est dans l'article du « 263e régiment d'infanterie » ; un « RA » peut être un « RAC » ou un « RAL »
    const FALLBACK = {RA: ['RAC', 'RAL', 'RAP'], RAC: ['RA'], RAL: ['RA'], RAP: ['RA'], BCP: ['BCA'], BCA: ['BCP'], RIM: ['RIC'], RIC: ['RIM'], RCC: [], RI: ['RIL']};
    function regimentRow(R, kind, n) {
        if (!R?.byKey) return null;
        return R.byKey.get(`${kind}:${n}`) || (FALLBACK[kind] || []).map(k => R.byKey.get(`${k}:${n}`)).find(Boolean) || null;
    }
    /** ce que l'article dit pendant ses années de service : [{y, text}] et les batailles de ces années [{y, label, link}] */
    function regimentDuring(row, period) {
        if (!row || !period) return {years: [], battles: []};
        const years = [...Object.entries(row.years || {}).map(([y, text]) => ({y: Number(y), text})).filter(x => x.y >= period.from && x.y <= period.to),
            ...(row.spans || []).filter(([a, b]) => a <= period.to && b >= period.from).map(([a, b, text]) => ({y: a, y2: b, text}))].sort((a, b) => a.y - b.y);
        const battles = (row.battles || []).map(([y, label, link]) => ({y, label, link})).filter(b => b.y >= period.from && b.y <= period.to);
        return {years, battles};
    }
    /** « Bataille de Verdun » → « à Verdun » ; « Bataille de la Marne » → « à la bataille de la Marne » ; « Siège de Toul » → « au siège de Toul » */
    function battlePhrase(noun) {
        const s = String(noun || '').trim(); let m;
        if ((m = s.match(/^Bataille (?:de |d['’])([A-ZÉÈÂÎÔ][^\s]*(?:[- ][A-ZÉÈ][^\s]*)*)$/))) return `à ${m[1]}`;
        if (/^Chemin des Dames/.test(s)) return `au ${s}`;
        if (/^(Siège|Combat)\b/i.test(s)) return `au ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
        if (/^(Bataille|Batailles|Offensive|Prise|Campagne|Course|Opération|Expédition)\b/i.test(s)) return `à la ${s.charAt(0).toLowerCase()}${s.slice(1)}`.replace(/^à la batailles/, 'aux batailles').replace(/^à la (course|offensive|opération|expédition|campagne|prise)/i, (x, w) => `à ${/^[aeiouéo]/i.test(w) ? "l'" : 'la '}${w.toLowerCase()}`);
        return `à ${s}`;
    }
    /** la caserne : celle de 1914 (« Casernement : Limoges ») pour un poilu, sinon celle de l'encadré */
    const garrisonOf = (row, period) => ((period && period.from <= 1918 && period.to >= 1914 && row?.case1914) ? row.case1914 : '');

    /* ── 🗺️ le front l'année de sa mort ── */
    function deathFront(life, R) {
        const d = num(life?.person?.death); if (d === null || d < WWI[0] || d > 1918) return null;
        if (!wasPoilu(life)) return null;
        const refs = regimentsOfLife(life);
        for (const ref of refs) {
            const row = regimentRow(R, ref.kind, ref.n); if (!row) continue;
            const text = row.years?.[d]; if (!text) continue;
            return {ref, row, year: d, text, battles: (row.battles || []).filter(b => b[0] === d).map(([y, label, link]) => ({y, label, link}))};
        }
        return null;
    }

    /* ── 🇫🇷 prénoms révolutionnaires ── */
    /** prépare le fichier : {days: Map(nom plié → [{mo, d, name, link}]), cat: Map(nom plié → {name, link}), …} */
    function prepPrenoms(f) {
        const days = new Map(), cat = new Map(), months = new Map();
        for (const [mo, d, name, link] of f?.days || []) { const k = fold(name); if (!days.has(k)) days.set(k, []); days.get(k).push({mo, d, name, link}); }
        for (const [name, link] of f?.cat || []) cat.set(fold(name), {name, link});
        (f?.months || []).forEach((m, i) => months.set(fold(m), i + 1));
        return {...f, days, cat, months};
    }
    const firstNames = s => String(s || '').split(/[\s,]+/).flatMap(w => [w, ...(w.includes('-') ? w.split('-') : [])]).map(w => w.trim()).filter(w => w.length > 1);
    /** ses prénoms du calendrier républicain ou de la liste : [{name, cat, days, month, sameDay, strong}] */
    function revNames(first, birthIso, P, rep = null) {
        if (!P) return [];
        const out = [], by = yearOf(birthIso);
        const r = rep && /^\d{4}-\d\d-\d\d/.test(birthIso || '') ? rep(...birthIso.split('-').map(Number)) : null;
        for (const w of [...new Set(firstNames(first))]) {
            const k = fold(w), cat = P.cat.get(k) || null, days = P.days.get(k) || [], month = P.months.get(k) || 0;
            if (!cat && !days.length && !month) continue;
            const sameDay = !!(r && days.some(x => x.mo === r.mo && x.d === r.d));
            const inPeriod = by !== null && by >= 1792 && by <= 1810;
            out.push({name: w, cat, days, month, sameDay, inPeriod, strong: sameDay || (inPeriod && !!month)});
        }
        return out;
    }

    /* ── 👶 enfants trouvés ── */
    const FOUND_WORDS = /enfant trouv|enfants trouv|enfant abandonn|abandonne|expose (?:au|a la|dans|sur)|exposee|de pere et mere inconnus|de parents inconnus|pere et mere inconnus|pupille|assistance publique|tour d.abandon|hospice des enfants|enfant de l.hospice|enfant assiste/;
    const MONTH_NAMES = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    /** les raisons de penser à un enfant trouvé : {words, rules:[règle du fichier], calendarDay, noParents} ou null */
    function foundlingOf(life, F, P) {
        if (!F) return null;
        const last = fold(life?.person?.last || ''), txt = fold(`${life?.text || ''} ${(life?.events || []).map(e => `${e.title} ${e.description} ${e.address}`).join(' ')}`);
        const noParents = Number(life?.parents || 0) === 0, words = FOUND_WORDS.test(txt);
        const by = num(life?.person?.birth);
        const rules = (F.rules || []).filter(r => {
            if (r.surnames && r.surnames.some(s => fold(s) === last)) return true;
            if (r.test === 'month' && MONTH_NAMES.includes(last)) return true;
            if (r.test === 'weekday' && WEEKDAYS.includes(last)) return true;
            if (r.test === 'calendar' && P && P.days.has(last) && by !== null && by >= (r.from || 1793) && by <= (r.to || 1801)) return true;
            return false;
        });
        if (!rules.length && !words) return null;
        if (!noParents && !words) return null; // un nom « Trouvé » avec ses deux parents connus : rien à dire
        return {words, noParents, rules, general: (F.rules || []).find(r => r.test === 'general') || null};
    }

    /* ── 📚 personnages, 🔤 variantes ── */
    function prepRomans(f) {
        const by = new Map();
        for (const r of table(f)) { const k = fold(r.fn); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
        for (const l of by.values()) l.sort((a, b) => (a.y || 9999) - (b.y || 9999));
        return {meta: f, by, n: f?.rows?.length || 0};
    }
    const charactersOf = (Ro, last) => (Ro?.by?.get(fold(last)) || []);
    function prepVariants(f) {
        const by = new Map();
        (f?.names || []).forEach((row, i) => { const k = fold(row[0]); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
        return {meta: f, names: f?.names || [], by};
    }
    /** les noms « dits identiques » à son nom : [{name, q}] (sans le sien, sans ceux déjà notés) */
    function variantsOf(V, last, have = []) {
        if (!V) return [];
        const k = fold(last), skip = new Set([k, ...have.map(fold)]), out = new Map();
        for (const i of V.by.get(k) || []) for (const j of V.names[i][2] || []) { const x = V.names[j]; if (x && !skip.has(fold(x[0])) && !out.has(fold(x[0]))) out.set(fold(x[0]), {name: x[0], q: x[1], from: V.names[i][1]}); }
        return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }

    /* ── 🛂 nationalité ── */
    const COLONY_WORDS = /senegal|soudan francais|mali|guinee|cote d.ivoire|dahomey|benin|niger|haute-volta|burkina|mauritanie|tchad|gabon|moyen-congo|congo francais|oubangui|centrafrique|cameroun|togo|madagascar|comores|djibouti|cote francaise des somalis|indochine|viet ?nam|annam|tonkin|cochinchine|cambodge|laos|nouvelle-caledonie|wallis|polynesie|tahiti|nouvelles-hebrides/;
    function deptOf(e) {
        const ins = String(e?.insee || '');
        if (/^\d[\dAB]\d{3}$/i.test(ins)) return ins.slice(0, 2).toUpperCase();
        const m = String(e?.place_full || '').match(/\((\d{2}|2[AB])\)/); return m ? m[1] : '';
    }
    function whereOf(e) {
        const c = fold(`${e?.country || ''}`), full = fold(`${e?.place_full || ''} ${e?.country || ''}`);
        const lat = num(e?.lat), lon = num(e?.lon);
        const algeria = /algerie|algeria/.test(full) || (lat !== null && lat > 18.9 && lat < 37.2 && lon > -8.7 && lon < 12 && !/maroc|tunisie|libye|mali|niger|mauritanie|espagne|italie|france/.test(c) && !(lat > 35.9 && lon < -1.7));
        return {dept: deptOf(e), algeria, colony: COLONY_WORDS.test(full), foreign: !!c && !/^(france|fr|fra|republique francaise)$/.test(c) && !algeria};
    }
    /** les règles qui ont touché sa vie : [{rule, at: {place, year}}] — rule.where : {depts} | {algeria} | {colony} | {natu} */
    function nationalityFor(life, N) {
        if (!N?.rows) return [];
        const p = life?.person || {}, b = num(p.birth), d = num(p.death);
        const evs = (life?.events || []).map(e => ({...e, w: whereOf(e), y: num(e.year)}));
        const natu = evs.find(e => e.tag === 'NATU');
        const out = [];
        for (const r of N.rows) {
            const f = yearOf(r.from), t = r.to ? yearOf(r.to) : 9999;
            if (f === null) continue;
            if (b !== null && b > (r.bornBefore || t)) continue; // né après : pas concerné
            if (d !== null && d < f) continue;               // mort avant
            if (b === null && d === null && !evs.some(e => e.y !== null)) continue;
            let hit = null;
            const near = e => e.y === null || (e.y >= f - (r.before || 15) && e.y <= Math.min(t, f + (r.after || 15)));
            if (r.where?.depts) hit = evs.find(e => r.where.depts.includes(e.w.dept) && near(e));
            else if (r.where?.algeria) hit = evs.find(e => e.w.algeria && near(e));
            else if (r.where?.colony) hit = evs.find(e => e.w.colony && near(e));
            else if (r.where?.natu) hit = natu && natu.y !== null && natu.y >= f && natu.y < t ? natu : null;
            if (!hit) continue;
            if (r.where?.born && !(hit.tag === 'BIRT' || hit.tag === 'BAPM' || hit.tag === 'CHR')) continue;
            out.push({rule: r, at: {place: hit.place || '', year: hit.y}});
        }
        return out;
    }
    /** né hors de France, mort (ou vécu) en France : peut-être naturalisé */
    function maybeNaturalised(life) {
        const evs = life?.events || [];
        if (evs.some(e => e.tag === 'NATU')) return {natu: evs.find(e => e.tag === 'NATU')};
        const b = evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.tag) && (e.country || e.place_full));
        if (!b) return null;
        const wb = whereOf(b); if (!wb.foreign) return null;
        const fr = evs.find(e => e !== b && num(e.year) !== null && num(e.year) >= 1850 && !whereOf(e).foreign && (fold(e.country) === 'france' || /^\d[\dAB]\d{3}$/i.test(String(e.insee || ''))));
        return fr ? {born: b, inFrance: fr} : null;
    }

    const core = {fold, battlePhrase, regimentRefs, regimentsOfLife, servicePeriod, wasPoilu, regimentRow, regimentDuring, garrisonOf, deathFront, unitShort, unitLong, isoOf,
        prepPrenoms, revNames, foundlingOf, prepRomans, charactersOf, prepVariants, variantsOf, nationalityFor, maybeNaturalised, whereOf, table};
    if (typeof module === 'object' && module.exports) { module.exports = core; }
    if (typeof document === 'undefined') return;

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const KEY = 'genealogie-lot8-soldats-noms';
    const TAB = ['lot8_soldats_noms', '25l8', '🎖️ Soldats et noms'];
    const BLOCK = ['l8b_person', '🎖️ Régiment, nom, nationalité'];
    const PARTS = [
        ['regiment', '🎖️ L’histoire de son régiment', 'Le régiment lu dans son dossier militaire : où il était caserné, où il a combattu pendant ses années de service (Wikipédia).'],
        ['front', '🗺️ Le front l’année de sa mort', 'Pour un mort de 14-18 : où combattait son régiment l’année de sa mort.'],
        ['prisonnier', '🪖 Prisonnier en 14-18 ?', 'Pour un homme en âge de se battre : les fiches de prisonniers du CICR (lien).'],
        ['hopitaux', '🏥 Les hôpitaux de sa ville en 14-18', 'Les hôpitaux connus de la ville où il est mort pendant la guerre (et dans la monographie de commune).'],
        ['prenoms', '🇫🇷 Les prénoms révolutionnaires', 'Un prénom du calendrier républicain ou de l’époque de la Révolution.'],
        ['trouves', '👶 Les noms des enfants trouvés', 'Comment on nommait les enfants abandonnés, quand son nom ou sa fiche le laisse penser.'],
        ['romans', '📚 Son nom dans les romans', 'Les personnages de romans, de films ou de pièces qui portent son nom de famille (Wikidata).'],
        ['variantes', '🔤 Les variantes de son nom', 'Les noms dits identiques au sien (Wikidata), à ajouter à ses variantes en un clic.'],
        ['nationalite', '🛂 Les changements de nationalité', 'Savoie et Nice (1860), Alsace-Moselle (1871, 1918), Algérie, colonies, lois de 1927, 1940, 1962.'],
        ['naturalisation', '🏛️ Sa naturalisation au Journal officiel', 'Pour une personne née à l’étranger ou naturalisée : où trouver son décret.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateTxt = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y && m && d ? `${d === 1 ? '1er' : d} ${T(MONTHS[m - 1])} ${y}` : y && m ? `${T(MONTHS[m - 1])} ${y}` : y ? String(y) : ''; };
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const wpUrl = (t, lang = 'fr') => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const srcLink = s => (s?.url ? `${esc(s.title || '')} ${link(s.url, '↗ source')}` : esc(s?.title || ''));
    const row = (icon, html, src, extra = '', part = '') => `<div class="hist-row l8b-row"${part ? ` data-l8b-part="${esc(part)}"` : ''}><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="l8b-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const quote = s => (s?.quote ? `<blockquote class="l8b-quote">« ${esc(s.quote)} »</blockquote>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const he = P => (P?.gender === 'female' ? T('Elle') : P?.gender === 'male' ? T('Il') : (P?.first ? esc(P.first) : T('Cette personne')));
    const fullName = P => [P?.first, P?.last].filter(Boolean).join(' ');

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {regiments: 'l8b-regiments.json.gz', romans: 'l8b-personnages.json.gz', variantes: 'l8b-variantes.json.gz', prenoms: 'l8b-prenoms.json', trouves: 'l8b-enfants-trouves.json', nationalite: 'l8b-nationalite.json'};
    const PREP = {
        regiments: f => { const rows = table(f); const byKey = new Map(); rows.forEach(r => { r.years = r.years || {}; r.battles = r.battles || []; byKey.set(`${r.k}:${r.n}`, r); }); return {meta: f, rows, byKey}; },
        romans: prepRomans, variantes: prepVariants, prenoms: prepPrenoms, trouves: f => f, nationalite: f => f};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? PREP[kind](f) : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const loadSafe = k => load(k).catch(() => null);
    const repConv = () => root.LCNDA_SHEET?.gregorianToRepublican || (A().jdnToRepublican && A().gregorianToJdn ? (y, m, d) => { const r = A().jdnToRepublican(A().gregorianToJdn(y, m, d)); return r ? {an: r.year, mo: r.month, d: r.day} : null; } : null);
    const REP_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jour complémentaire'];
    const repDay = (mo, d) => `${d === 1 ? '1er' : d} ${T(REP_MONTHS[mo - 1] || '')}`;

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('l8b_person', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    // 🎖️
    function regimentHtml(life, R) {
        const refs = regimentsOfLife(life); if (!refs.length) return '';
        const found = refs.map(ref => ({ref, row: regimentRow(R, ref.kind, ref.n)})).filter(x => x.row);
        if (!found.length) {
            const r = refs[0];
            return row('🎖️', T('Son dossier dit : {u}. Wikipédia n’a pas (encore) d’article sur ce régiment.', {u: `<b>${esc(unitShort(r.kind, r.n))}</b>`}), '', `<p class="l8b-links">${jmoLinks(r)}</p>`, 'regiment');
        }
        const parts = found.slice(0, 3).map(({ref, row: rg}, i) => {
            const per = servicePeriod(life, ref), dur = regimentDuring(rg, per), gar = garrisonOf(rg, per);
            const top = dur.battles[0];
            const unitTxt = `<b>${esc(unitShort(ref.kind, ref.n))}</b>`;
            let lead;
            if (gar && top) lead = T('Le {u}, caserné à {g}, a combattu {b} ({y}).', {u: unitTxt, g: esc(gar), b: esc(battlePhrase(top.label)), y: top.y});
            else if (gar) lead = T('Le {u} était caserné à {g}.', {u: unitTxt, g: esc(gar)});
            else if (top) lead = T('Le {u} a combattu {b} ({y}).', {u: unitTxt, b: esc(battlePhrase(top.label)), y: top.y});
            else lead = T('Son régiment : le {u}.', {u: unitTxt});
            const why = {dossier: T('d’après son dossier'), guerre: T('la guerre de 1914-1918'), age: T('estimées : de 20 à 23 ans')}[per?.why] || '';
            const tl = dur.years.length ? `<ul class="hist-ul l8b-tl">${dur.years.map(x => `<li><b>${x.y}${x.y2 ? `–${x.y2}` : ''}</b> : ${esc(x.text)}</li>`).join('')}</ul>` : '';
            const others = dur.battles.slice(1, 10).map(b => `${link(wpUrl(b.link), b.label)} (${b.y})`).join(' · ');
            const detail = `${rg.garrison && rg.garrison !== gar ? `<p class="muted">${esc(T('Garnison donnée par l’article (la dernière connue) : {g}.', {g: rg.garrison}))}</p>` : ''}${per ? `<p class="muted">${esc(T('Ses années de service : {a}–{b} ({w}).', {a: per.from, b: per.to, w: why}))}</p>` : ''}${tl}${others ? `<p>${esc(T('Batailles de ces années :'))} ${others}</p>` : ''}<p class="l8b-links">${jmoLinks(ref)}</p>`;
            const src = `${link(wpUrl(rg.t), `« ${rg.t} »`)} — Wikipédia, CC BY-SA 4.0 ${link(`https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(rg.t)}&action=history`, T('(auteurs)'))}`;
            return row(i ? '·' : '🎖️', `${lead} ${link(wpUrl(rg.t), '↗')}`, src, more(detail), 'regiment');
        });
        return parts.join('');
    }
    function jmoLinks(ref) {
        const u = unitLong(ref.kind, ref.n).replace('ᵉʳ', 'er').replace('ᵉ', 'e');
        const q = `https://www.google.com/search?q=${encodeURIComponent(`"${u}" journal des marches et opérations site:memoiredeshommes.sga.defense.gouv.fr`)}`;
        return `${link(q, T('📖 Trouver son journal de marche (JMO) ↗'))} · ${link('https://www.memoiredeshommes.sga.defense.gouv.fr/', T('Mémoire des hommes ↗'))}`;
    }
    // 🗺️
    function frontHtml(life, R) {
        const x = deathFront(life, R); if (!x) return '';
        const death = (life.events || []).find(e => ['DEAT', 'BURI'].includes(e.tag));
        const when = death?.date && /^\d{4}-\d\d-\d\d/.test(death.date) ? dateTxt(death.date.slice(0, 10)) : String(x.year);
        const lead = T('L’année de sa mort ({d}), son régiment, le {u}, combattait là : {t}', {d: esc(when), u: `<b>${esc(unitShort(x.ref.kind, x.ref.n))}</b>`, t: esc(x.text)});
        const det = `<p class="muted">${esc(T('C’est ce que l’article de Wikipédia dit de son régiment pour toute l’année ; le journal de marche (JMO) dit où il était jour par jour. Aucune carte libre du front jour par jour n’a été trouvée.'))}</p><p class="l8b-links">${jmoLinks(x.ref)}</p>`;
        return row('🗺️', lead, `${link(wpUrl(x.row.t), `« ${x.row.t} »`)} — Wikipédia, CC BY-SA 4.0`, more(det), 'front');
    }
    // 🪖
    const CICR = 'https://grandeguerre.icrc.org/fr';
    function prisonerHtml(life, Q) {
        const p = life.person || {}, b = num(p.birth), d = num(p.death);
        if (p.gender === 'female' || b === null || b < 1860 || b > 1902 || (d !== null && d < 1914)) return '';
        const pow = (life.poilu?.events || []).some(e => e.kind === 'prisonnier') || /prisonnier|captur|captivit/.test(fold(life.text));
        const lead = pow ? T('Sa fiche dit qu’il a été fait prisonnier : le CICR a gardé les fiches des prisonniers de 1914-1918.') : T('Fait prisonnier en 14-18 ? Le CICR a gardé les fiches des prisonniers de la Grande Guerre.');
        const btn = `<button type="button" class="link-button" data-l8b-copy="${esc(`${String(p.last || '').toUpperCase()} ${p.first || ''}`.trim())}" data-l8b-open="${esc(CICR)}">${esc(T('📋 Copier le nom et ouvrir'))}</button>`;
        return row('🪖', `${lead} ${btn}`, srcLink(Q?.cicr), more(`${quote(Q?.cicr)}<p class="muted">${esc(T('Le site du CICR ne garde pas le nom dans son adresse : colle « NOM Prénom » dans sa case de recherche. Ensuite, le bloc « Militaire » ou « Poilu 14-18 » sait importer sa fiche (« ⤒ Importer… »).'))}</p>`), 'prisonnier');
    }
    // 🏥 (les hôpitaux de « 🧭 Histoire autour », relus pour 1914-1918)
    async function hospitalsNear(lat, lon, radius = 4) {
        const H = ext.histoireAutour; if (!H?.load || !H.institutionsNear) return [];
        const D = await H.load('institutions').catch(() => null); if (!D) return [];
        return H.institutionsNear(D.rows, lat, lon, radius, {kinds: ['hopital', 'hoteldieu', 'hospice']}).filter(x => (x.i.from == null || x.i.from <= 1918) && (x.i.to == null || x.i.to >= 1914));
    }
    function gallicaHospitals(town) { return `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(gallica all "hôpital auxiliaire" and gallica all "${town}")`)}`; }
    async function hospitalsHtml(life, Q) {
        const d = (life.events || []).find(e => ['DEAT', 'BURI'].includes(e.tag) && num(e.year) >= 1914 && num(e.year) <= 1919);
        if (!d || !wasPoilu(life) || num(d.lat) === null) return '';
        const list = await hospitalsNear(d.lat, d.lon, 4);
        const town = d.place || '';
        if (!list.length) return row('🏥', T('Mort à {p} pendant la guerre : beaucoup de soldats mouraient dans les hôpitaux militaires, temporaires ou auxiliaires (Croix-Rouge).', {p: esc(town)}), srcLink(Q?.hopital), more(`${quote(Q?.hopital)}<p class="l8b-links">${link(gallicaHospitals(town), T('Chercher « hôpital auxiliaire » et {p} dans Gallica ↗', {p: town}))}</p>`), 'hopitaux');
        const li = list.slice(0, 8).map(x => `<li>${esc(x.i.n)}${x.i.q ? ' ' + link(wdUrl(x.i.q), '↗') : ''}</li>`).join('');
        return row('🏥', T('Mort à {p} pendant la guerre. Les hôpitaux connus de la ville à cette époque : {h}.', {p: esc(town), h: list.slice(0, 2).map(x => `<b>${esc(x.i.n)}</b>`).join(', ')}), `Wikidata (CC0) ${esc(T('— les données de « 🧭 Histoire autour »'))}`,
            more(`<ul class="hist-ul">${li}</ul>${quote(Q?.hopital)}<p class="l8b-links">${link(gallicaHospitals(town), T('Chercher « hôpital auxiliaire » et {p} dans Gallica ↗', {p: town}))}</p>`, list.length), 'hopitaux');
    }
    // 🇫🇷
    function prenomsHtml(life, P) {
        const b = (life.events || []).find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.tag));
        const iso = b?.date ? String(b.date).slice(0, 10) : '';
        const hits = revNames(`${life.person.first || ''} ${life.person.middle || ''}`, iso || String(life.person.birth || ''), P, repConv());
        const shown = hits.filter(h => h.strong || h.inPeriod); if (!shown.length) return '';
        const h = shown[0];
        let lead;
        const day = h.days[0];
        if (h.sameDay) lead = T('Son prénom {n} est le nom du jour de sa naissance dans le calendrier républicain ({d}).', {n: `<b>${esc(h.name)}</b>`, d: esc(repDay(day.mo, day.d))});
        else if (h.month) lead = T('Son prénom {n} est un nom de mois du calendrier républicain.', {n: `<b>${esc(h.name)}</b>`});
        else if (h.cat) lead = T('{n} est dans la liste des prénoms révolutionnaires de Wikipédia : un prénom peut-être choisi sous la Révolution.', {n: `<b>${esc(h.name)}</b>`});
        else lead = T('{n} est aussi le nom d’un jour du calendrier républicain ({d}) : un prénom peut-être choisi sous la Révolution.', {n: `<b>${esc(h.name)}</b>`, d: esc(repDay(day.mo, day.d))});
        const li = shown.map(x => `<li><b>${esc(x.name)}</b> : ${[x.days.length ? T('jour du calendrier républicain ({d})', {d: x.days.map(y => repDay(y.mo, y.d)).join(', ')}) : '', x.cat ? `${esc(T('prénom révolutionnaire'))} ${link(wpUrl(x.cat.link), '↗')}` : '', x.month ? T('mois du calendrier républicain') : ''].filter(Boolean).join(' · ')}</li>`).join('');
        return row('🇫🇷', lead, srcLink(P.src), more(`<ul class="hist-ul">${li}</ul>${quote(P.src)}`), 'prenoms');
    }
    // 👶
    function trouvesHtml(life, F, P) {
        const x = foundlingOf(life, F, P); if (!x) return '';
        const r = x.rules[0] || x.general; if (!r) return '';
        const last = life.person.last || '';
        const lead = x.rules.length ? T(r.lead || 'Son nom {n} est un nom souvent donné aux enfants trouvés.', {n: `<b>${esc(last)}</b>`}) : T('Sa fiche parle d’un enfant trouvé ou abandonné : voici comment les hospices leur donnaient un nom.');
        const prudent = esc(T('C’est une piste, pas une preuve : beaucoup de familles portent ces noms depuis des siècles.'));
        const ha = ext.histoireAutour ? `<p class="muted">${esc(T('L’hospice des enfants trouvés près de son lieu de naissance est dans le bloc « 🧭 Histoire autour ».'))}</p>` : '';
        const all = [...x.rules, ...(x.rules.includes(x.general) || !x.general ? [] : [x.general])];
        return row('👶', `${lead} <small class="muted">${prudent}</small>`, srcLink(r.src), more(`${all.map(y => `<p><b>${esc(T(y.title))}</b></p>${quote(y.src)}<small class="hist-src">${srcLink(y.src)}</small>`).join('')}${ha}`), 'trouves');
    }
    // 📚
    function charLi(c) {
        const what = [c.w ? `« ${esc(c.w)} »` : '', c.a ? T('de {a}', {a: esc(c.a)}) : '', c.y ? String(c.y) : ''].filter(Boolean).join(', ');
        return `<li><b>${esc(c.ch)}</b>${what ? ` — ${what}` : ''} ${link(wdUrl(c.q), '↗')}</li>`;
    }
    function romansHtml(life, Ro) {
        const list = charactersOf(Ro, life.person.last); if (!list.length) return '';
        const c = list.find(x => x.a && x.w) || list.find(x => x.w) || list[0];
        const lead = c.a && c.w ? T('Un personnage de {a} s’appelle {n} : {c}, dans « {w} »{y}.', {a: esc(c.a), n: `<b>${esc(life.person.last)}</b>`, c: esc(c.ch), w: esc(c.w), y: c.y ? ` (${c.y})` : ''})
            : c.w ? T('Un personnage s’appelle {n} : {c}, dans « {w} »{y}.', {n: `<b>${esc(life.person.last)}</b>`, c: esc(c.ch), w: esc(c.w), y: c.y ? ` (${c.y})` : ''})
                : T('Un personnage de fiction s’appelle {n} : {c}.', {n: `<b>${esc(life.person.last)}</b>`, c: esc(c.ch)});
        return row('📚', `${lead} ${link(wdUrl(c.q), '↗')}`, `Wikidata (CC0) ${link(wdUrl(c.q), '↗ source')}`, more(`<ul class="hist-ul">${list.slice(0, 30).map(charLi).join('')}</ul><p class="muted">${esc(T('Un même nom ne veut pas dire une même famille : c’est pour le plaisir.'))}</p>`, list.length > 1 ? list.length : null), 'romans');
    }
    // 🔤
    function variantesHtml(life, V) {
        const have = (life.variants || []).map(v => v.last_name).filter(Boolean);
        const list = variantsOf(V, life.person.last, have); if (!list.length) return '';
        const ro = A().state?.readOnly || document.body.classList.contains('is-kiosk') || life.person.locked;
        const btn = v => (ro ? '' : ` <button type="button" class="link-button" data-l8b-addvar="${esc(v.name)}" data-l8b-pid="${Number(life.person.id)}" data-l8b-q="${esc(v.q)}">${esc(T('＋ Ajouter aux variantes'))}</button>`);
        const lead = T('Son nom {n} est dit identique à : {l}.', {n: `<b>${esc(life.person.last)}</b>`, l: list.slice(0, 4).map(v => `<b>${esc(v.name)}</b>`).join(', ') + (list.length > 4 ? '…' : '')});
        const li = list.slice(0, 40).map(v => `<li>${esc(v.name)} ${link(wdUrl(v.q), '↗')}${btn(v)}</li>`).join('');
        return row('🔤', lead, `Wikidata (CC0), « dit être le même que » (P460) ${link(wdUrl(list[0].from), '↗ source')}`, more(`<ul class="hist-ul">${li}</ul><p class="muted">${esc(T('Ajoutée à ses variantes, l’orthographe sert aussi à la recherche de l’app.'))}</p>`, list.length), 'variantes');
    }
    // 🛂
    function nationaliteHtml(life, N) {
        const list = nationalityFor(life, N); if (!list.length) return '';
        const x = list[0], r = x.rule;
        const lead = T(r.lead, {p: esc(x.at.place || ''), y: x.at.year ?? ''});
        const opt = r2 => (r2.search === 'optants' ? `${quote(N.quotes?.optant)}<small class="hist-src">${srcLink(N.quotes?.optant)}</small><p class="l8b-links">${link(`https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(`optants ${life.person.last || ''}`.trim())}`, T('🏛 Chercher son nom dans les listes d’optants (FranceArchives) ↗'))}</p>` : '');
        const li = list.map(y => `<li><b>${esc(T(y.rule.title))}</b> — ${esc(T(y.rule.rule))}${quote(y.rule.src)}<small class="hist-src">${srcLink(y.rule.src)}</small>${y.rule.see ? `<small class="muted"> ${esc(T(y.rule.see))}</small>` : ''}${opt(y.rule)}</li>`).join('');
        const dp = ext.droitPouvoir ? `<p class="muted">${esc(T('Les lois générales de la nationalité (1889, femmes mariées…) sont dans le bloc « ⚖️ Ce que la loi disait ».'))}</p>` : '';
        return row(r.icon || '🛂', lead, srcLink(r.src), more(`<ul class="hist-ul">${li}</ul>${dp}`, list.length > 1 ? list.length : null), 'nationalite');
    }
    // 🏛️
    function naturalisationHtml(life, N) {
        const p = life.person || {};
        if (p.living === 'living' || (num(p.death) === null && num(p.birth) !== null && num(p.birth) > new Date().getFullYear() - 100)) return ''; // vie privée : seulement les personnes décédées
        const x = maybeNaturalised(life); if (!x) return '';
        const lead = x.natu ? T('Sa fiche a une naturalisation{y} : son décret est paru au Journal officiel.', {y: x.natu.year ? ` (${x.natu.year})` : ''}) : T('Né à l’étranger, il a vécu en France : a-t-il été naturalisé ? Les décrets paraissaient au Journal officiel.');
        const fa = `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(`${p.last || ''} ${p.first || ''} naturalisation`.trim())}`;
        const ga = `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(gallica all "${p.last || ''}" and gallica all "naturalisation") and dc.title all "Journal officiel"`)}`;
        const det = `<p class="l8b-links">${link(fa, T('🏛 Son dossier aux Archives nationales (FranceArchives) ↗'))} · ${link(ga, T('📜 Le Journal officiel dans Gallica ↗'))}</p>${quote(N?.jorf)}<p class="muted">${esc(T('Ces sites sont aussi dans « 🌍 Où chercher ? ».'))}</p>`;
        return row('🏛️', lead.replace('Né à', p.gender === 'female' ? 'Née à' : 'Né à'), srcLink(N?.jorf), more(det), 'naturalisation');
    }

    /** remplit un élément avec les lignes de la personne ; renvoie le nombre de lignes */
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PARTS.map(p => p[0])).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (e) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const need = new Set();
        if (want.some(k => ['regiment', 'front'].includes(k))) need.add('regiments');
        if (want.some(k => ['prenoms', 'trouves'].includes(k))) need.add('prenoms');
        if (want.includes('trouves')) need.add('trouves');
        if (want.includes('romans') && life.person.last) need.add('romans');
        if (want.includes('variantes') && life.person.last) need.add('variantes');
        if (want.some(k => ['nationalite', 'naturalisation', 'prisonnier', 'hopitaux'].includes(k))) need.add('nationalite');
        const D = Object.fromEntries(await Promise.all([...need].map(async k => [k, await loadSafe(k)])));
        if (!host.isConnected && !opts.detached) return 0;
        const Q = D.nationalite?.quotes || {};
        const html = [];
        const safe = f => { try { return f(); } catch (e) { console.error(e); return ''; } };
        if (want.includes('regiment') && D.regiments) html.push(safe(() => regimentHtml(life, D.regiments)));
        if (want.includes('front') && D.regiments) html.push(safe(() => frontHtml(life, D.regiments)));
        if (want.includes('prisonnier')) html.push(safe(() => prisonerHtml(life, Q)));
        if (want.includes('hopitaux')) html.push(await hospitalsHtml(life, Q).catch(() => ''));
        if (want.includes('prenoms') && D.prenoms) html.push(safe(() => prenomsHtml(life, D.prenoms)));
        if (want.includes('trouves') && D.trouves) html.push(safe(() => trouvesHtml(life, D.trouves, D.prenoms)));
        if (want.includes('romans') && D.romans) html.push(safe(() => romansHtml(life, D.romans)));
        if (want.includes('variantes') && D.variantes) html.push(safe(() => variantesHtml(life, D.variantes)));
        if (want.includes('nationalite') && D.nationalite) html.push(safe(() => nationaliteHtml(life, D.nationalite)));
        if (want.includes('naturalisation')) html.push(safe(() => naturalisationHtml(life, Q)));
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life l8b-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PARTS.some(([k]) => on(k))) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="l8b-block" data-l8b-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-l8b-person]').forEach(async h => {
            const id = Number(h.dataset.l8bPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── les boutons ─────────── */
    document.addEventListener('click', async e => {
        const cp = e.target.closest?.('[data-l8b-copy]');
        if (cp) {
            e.preventDefault();
            try { await navigator.clipboard?.writeText(cp.dataset.l8bCopy); A().toast?.(T('« {n} » est copié : colle-le dans la case de recherche.', {n: cp.dataset.l8bCopy})); } catch (_) {}
            const w = cp.dataset.l8bOpen; if (w) { if (A().openExternal) A().openExternal(w); else root.open(w, '_blank', 'noopener'); }
            return;
        }
        const av = e.target.closest?.('[data-l8b-addvar]');
        if (av) {
            e.preventDefault();
            const pid = Number(av.dataset.l8bPid), name = av.dataset.l8bAddvar;
            av.disabled = true;
            try {
                const r = await A().api('add_variant', {}, {method: 'POST', body: {person_id: pid, type: 'variant', last_name: name, source_note: T('Nom dit identique sur Wikidata ({q})', {q: av.dataset.l8bQ || ''})}});
                const vid = Number(r?.result?.id || r?.id || 0);
                av.replaceWith(Object.assign(document.createElement('small'), {className: 'muted', textContent: T('✓ ajouté')}));
                lifeMemo.delete(pid);
                A().undoToast?.(T('« {n} » est ajouté aux variantes de son nom.', {n: name}), {undo: async () => { if (vid) await A().api('delete_variant', {}, {method: 'POST', body: {id: vid}}); lifeMemo.delete(pid); A().rerenderPerson?.(); }});
            } catch (err) { av.disabled = false; A().toast?.(err.message || String(err), 'error'); }
        }
    });

    /* ─────────── 📜 Monographie : les régiments de la ville, ses hôpitaux de 14-18 ─────────── */
    function regimentsOfTown(R, name) {
        const k = fold(name); if (!k || k.length < 3) return [];
        const rx = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
        return R.rows.filter(r => rx.test(fold(r.garrison)) || rx.test(fold(r.case1914)));
    }
    async function placeRegimentsHtml(place) {
        const R = await loadSafe('regiments'); if (!R) return '';
        const list = regimentsOfTown(R, place?.name); if (!list.length) return '';
        const li = list.slice(0, 40).map(r => `<li><b>${esc(unitShort(r.k, r.n))}</b> ${link(wpUrl(r.t), '↗')}${r.case1914 && fold(r.case1914).includes(fold(place.name)) ? ` <small class="muted">${esc(T('caserné ici en 1914'))}</small>` : ''}</li>`).join('');
        return row('🎖️', T('{n} régiments ou bataillons ont été casernés à {p} (d’après Wikipédia).', {n: list.length, p: esc(place.name)}).replace(/^1 régiments ou bataillons ont été casernés/, T('Un régiment a été caserné')), `Wikipédia (CC BY-SA 4.0)`, more(`<ul class="hist-ul">${li}</ul>`, list.length));
    }
    async function placeHospitalsHtml(place) {
        const lat = num(place?.latitude ?? place?.lat), lon = num(place?.longitude ?? place?.lon); if (lat === null || lon === null) return '';
        const list = await hospitalsNear(lat, lon, 4); if (!list.length) return '';
        const Q = (await loadSafe('nationalite'))?.quotes || {};
        const li = list.slice(0, 12).map(x => `<li>${esc(x.i.n)}${x.i.q ? ' ' + link(wdUrl(x.i.q), '↗') : ''}</li>`).join('');
        return row('🏥', T('Les hôpitaux connus de {p} pendant la guerre de 1914-1918 : {h}.', {p: esc(place.name), h: list.slice(0, 3).map(x => `<b>${esc(x.i.n)}</b>`).join(', ')}), 'Wikidata (CC0)', more(`<ul class="hist-ul">${li}</ul>${quote(Q.hopital)}<p class="l8b-links">${link(gallicaHospitals(place.name), T('Chercher « hôpital auxiliaire » et {p} dans Gallica ↗', {p: place.name}))}</p>`, list.length));
    }
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'l8b_regiments', icon: '🎖️', label: T('Les régiments de la ville'), group: 'Le lieu', defaultOn: true, enabled: () => on('regiment'), source: 'Wikipédia (CC BY-SA 4.0)',
            render: async (place, host) => { const h = await placeRegimentsHtml(place); host.innerHTML = h ? `<div class="hist-life l8b-life">${h}</div>` : ''; return !!h; }},
        {id: 'l8b_hopitaux', icon: '🏥', label: T('Ses hôpitaux en 14-18'), group: 'Le lieu', defaultOn: true, enabled: () => on('hopitaux'), source: 'Wikidata (CC0)',
            render: async (place, host) => { const h = await placeHospitalsHtml(place); host.innerHTML = h ? `<div class="hist-life l8b-life">${h}</div>` : ''; return !!h; }});

    /* ─────────── 📋 Listes ─────────── */
    let treeMemo = null;
    const tree = () => (treeMemo ||= A().api('l8b_tree', {}).catch(e => { treeMemo = null; throw e; }));
    const openPerson = id => A().openPersonById?.(Number(id));
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l8b_regiments', icon: '🎖️', label: T('Régiments français (Wikipédia)'), group: 'La personne', source: 'Wikipédia en français (CC BY-SA 4.0)', sourceUrl: 'https://fr.wikipedia.org/',
            load: async () => { const R = await load('regiments'); return R ? R.rows.map(r => ({name: unitLong(r.k, r.n), sigle: unitShort(r.k, r.n), kind: (KIND_LABEL[r.k] || [r.k])[0], garrison: r.garrison || '', c1914: r.case1914 || '', battles: (r.battles || []).length, from: Math.min(...Object.keys(r.years).map(Number).concat([9999])) === 9999 ? null : Math.min(...Object.keys(r.years).map(Number)), source: wpUrl(r.t)})) : []; },
            fields: [{key: 'name', label: T('Régiment'), type: 'text'}, {key: 'sigle', label: T('Sigle'), type: 'text'}, {key: 'kind', label: T('Arme'), type: 'enum'}, {key: 'garrison', label: T('Garnison'), type: 'text'}, {key: 'c1914', label: T('Caserne en 1914'), type: 'text'}, {key: 'battles', label: T('Batailles citées'), type: 'number'}, {key: 'source', label: T('Source'), type: 'url'}],
            open: r => root.open(r.source, '_blank', 'noopener')},
        {id: 'l8b_calendrier', icon: '🇫🇷', label: T('Les jours du calendrier républicain'), group: 'Le monde', source: 'Wikipédia, « Calendrier républicain » (CC BY-SA 4.0)', sourceUrl: wpUrl('Calendrier républicain'),
            load: async () => { const P = await load('prenoms'); return P ? [...P.days.values()].flat().map(x => ({name: x.name, month: T(REP_MONTHS[x.mo - 1]), day: x.d, prenom: P.cat.has(fold(x.name)) ? T('oui') : '', source: x.link ? wpUrl(x.link) : wpUrl('Calendrier républicain')})) : []; },
            fields: [{key: 'name', label: T('Nom du jour'), type: 'text'}, {key: 'month', label: T('Mois'), type: 'enum'}, {key: 'day', label: T('Jour'), type: 'number'}, {key: 'prenom', label: T('Prénom révolutionnaire'), type: 'enum'}, {key: 'source', label: T('Source'), type: 'url'}]},
        {id: 'l8b_prenoms_famille', icon: '🇫🇷', label: T('Prénoms révolutionnaires de ta famille'), group: 'La personne', source: 'Wikipédia, « Calendrier républicain », catégorie « Prénom révolutionnaire » (CC BY-SA 4.0)', sourceUrl: wpUrl('Calendrier républicain'),
            load: async () => {
                const [P, t] = await Promise.all([load('prenoms'), tree()]); if (!P || !t?.born_rev) return [];
                const rep = repConv(), out = [];
                for (const [id, first, last, , y, d] of t.born_rev) for (const h of revNames(first, d || String(y), P, rep)) out.push({id, person: `${first} ${last}`.trim(), name: h.name, born: y, why: h.sameDay ? T('né le jour de ce nom') : h.month ? T('mois républicain') : h.cat ? T('prénom révolutionnaire') : T('nom d’un jour'), level: h.strong ? T('sûr') : T('peut-être')});
                return out;
            },
            fields: [{key: 'person', label: T('Personne'), type: 'text'}, {key: 'name', label: T('Prénom'), type: 'text'}, {key: 'born', label: T('Née en'), type: 'year'}, {key: 'why', label: T('Pourquoi'), type: 'enum'}, {key: 'level', label: T('Certitude'), type: 'enum'}],
            period: r => [r.born, r.born], open: r => openPerson(r.id)},
        {id: 'l8b_personnages', icon: '📚', label: T('Personnages de fiction et leur nom de famille'), group: 'La personne', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/',
            load: async () => { const Ro = await load('romans'); return Ro ? table(Ro.meta).map(r => ({name: r.ch, surname: r.fn, work: r.w || '', author: r.a || '', year: r.y, source: wdUrl(r.q)})) : []; },
            fields: [{key: 'name', label: T('Personnage'), type: 'text'}, {key: 'surname', label: T('Nom de famille'), type: 'text'}, {key: 'work', label: T('Œuvre'), type: 'text'}, {key: 'author', label: T('Auteur'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'source', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year]},
        {id: 'l8b_noms_romans', icon: '📚', label: T('Les noms de ta famille dans les romans'), group: 'La personne', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/',
            load: async () => { const [Ro, t] = await Promise.all([load('romans'), tree()]); if (!Ro || !t?.surnames) return []; const out = []; for (const [n, c] of t.surnames) { const l = charactersOf(Ro, n); if (l.length) { const x = l.find(y => y.a && y.w) || l[0]; out.push({surname: n, people: c, characters: l.length, example: `${x.ch}${x.w ? ` — ${x.w}` : ''}${x.a ? `, ${x.a}` : ''}`, source: wdUrl(x.q)}); } } return out; },
            fields: [{key: 'surname', label: T('Nom'), type: 'text'}, {key: 'people', label: T('Personnes de ta base'), type: 'number'}, {key: 'characters', label: T('Personnages'), type: 'number'}, {key: 'example', label: T('Exemple'), type: 'text'}, {key: 'source', label: T('Source'), type: 'url'}]},
        {id: 'l8b_nationalite', icon: '🛂', label: T('Les changements de nationalité (Savoie, Alsace-Moselle, Algérie…)'), group: 'Le monde', source: 'Wikipédia (citations, CC BY-SA 4.0)', sourceUrl: 'https://fr.wikipedia.org/',
            load: async () => { const N = await load('nationalite'); return N ? N.rows.map(r => ({title: T(r.title), from: yearOf(r.from), to: r.to ? yearOf(r.to) : null, rule: T(r.rule), quote: r.src?.quote || '', source: r.src?.url || ''})) : []; },
            fields: [{key: 'title', label: T('Changement'), type: 'text'}, {key: 'from', label: T('Depuis'), type: 'year'}, {key: 'to', label: T('Jusqu’à'), type: 'year'}, {key: 'rule', label: T('Ce que ça change'), type: 'text'}, {key: 'quote', label: T('Citation'), type: 'text'}, {key: 'source', label: T('Source'), type: 'url'}],
            period: r => [r.from, r.to || r.from]});

    /* ─────────── 🔎 à la demande (« Ce qui le concerne ») ─────────── */
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = '';
        return n;
    }
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || '', latitude: pl.lat ?? pl.latitude ?? null, longitude: pl.lon ?? pl.longitude ?? null} : null);
    (ext.dataSources = ext.dataSources || []).push(
        ...PARTS.map(([k, label]) => ({id: `l8b_${k}`, icon: label.split(' ')[0], label: T(label.replace(/^\S+\s/, '')), group: ['nationalite', 'naturalisation', 'prisonnier'].includes(k) ? 'Chercher' : 'La personne', needs: ['person'], installed: () => true,
            run: (ctx, host) => runPerson([k], ctx, host)})),
        {id: 'l8b_regiments_ville', icon: '🎖️', label: T('Les régiments casernés dans la ville'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const h = await placeRegimentsHtml(placeOfCtx(ctx.place)); host.innerHTML = h ? `<div class="hist-life l8b-life">${h}</div>` : ''; return !!h; }},
        {id: 'l8b_hopitaux_ville', icon: '🏥', label: T('Les hôpitaux de la ville en 14-18'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const h = await placeHospitalsHtml(placeOfCtx(ctx.place)); host.innerHTML = h ? `<div class="hist-life l8b-life">${h}</div>` : ''; return !!h; }});

    /* ─────────── 🌍 Où chercher : le Journal officiel pour une naturalisation (le site existe déjà, on lui donne sa règle) ─────────── */
    function ouChercherRules() {
        const C = root.LCNDA_OU_CHERCHER; if (!C?.addRules || !C.RULES) return false;
        if (!C.RULES.so2_jo_gallica) C.addRules({so2_jo_gallica: {profiles: ['emigrant'], events: ['NATU', 'IMMI'], countries: ['fr'], from: 1870, to: 1950, base: 0.3, why: () => T('Venu d’ailleurs : sa naturalisation est parue au Journal officiel')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🎖️ Soldats et noms ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { const D = await loadSafe(k); if (D) metas[k] = D.meta || D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l8b-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const NAMES = {regiments: '🎖️ Régiments', romans: '📚 Personnages', variantes: '🔤 Variantes de noms', prenoms: '🇫🇷 Calendrier républicain', trouves: '👶 Enfants trouvés', nationalite: '🛂 Nationalité'};
        const rows = Object.keys(FILES).map(k => { const m = metas[k]; if (!m) return `<tr><td>${esc(T(NAMES[k]))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            return `<tr><td>${esc(T(NAMES[k]))}</td><td>${link(m.source_url, m.source)}</td><td>${esc(nf(m.count))}</td><td>${esc(m.licence || '')}</td><td>${esc(m.built || '')}</td></tr>`; }).join('');
        ws.innerHTML = `<section class="page cplus-settings l8b-settings" data-l8b-settings>${UI().pageHeader ? UI().pageHeader({title: T('Soldats et noms'), icon: '🎖️', where: T('Réglages · Données'), help: esc(T('Le régiment de tes soldats, le front, les prisonniers, les hôpitaux de 14-18, les prénoms révolutionnaires, les noms des enfants trouvés, ton nom dans les romans, ses variantes, les changements de nationalité. Tout est livré avec l’app.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🎖️ Régiment, nom, nationalité ») et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Le régiment est lu dans le texte de sa fiche par l’app : vérifie-le sur sa fiche matricule. Les noms et les prénoms sont des pistes, pas des preuves.'))}</p>
                <p class="muted">${esc(T('Pas dans l’app, faute de données libres : une carte du front jour par jour, les décrets de naturalisation nominatifs (retirés des données ouvertes du Journal officiel pour la vie privée), les fiches du CICR. Des liens y mènent.'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l8b-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l8bTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot8_monde_village'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire_autour'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'poilu'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [...BLOCK]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        ouChercherRules();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.soldatsNoms = {...core, load, settings, personInto, lifeOf, regimentsOfTown, placeRegimentsHtml, placeHospitalsHtml, drawSettings,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
