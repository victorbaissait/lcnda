/* LCNDA — ⚖️ Outils du généalogiste successoral, sans écran (window.LCNDA_SUCC_OUTILS ; aussi require() dans Node).
 * Maquette : docs/design/onglets-et-successoral-outils.html, partie B (B1 à B6). Écrans : heritage-successoral-outils.js et
 * heritage-successoral.js ; serveur : lib/successoral_outils.php ; essais : tests/test-successoral-outils.js.
 *  B1 ⏱ chronomètre : arrondi à la minute, découpe à minuit (une ligne par jour), pause après 10 min sans rien toucher ;
 *  B2 🔔 échéances : ce qui est en retard, dû aujourd'hui, dans la semaine (toutes les généalogies, index léger) ;
 *  B3 📋 avant de remettre au notaire : d'après progress() et pieces() du moteur — avertit, n'empêche jamais ;
 *     un acte demandé mais pas reçu est « à revoir », pas « manque » ;
 *  B4 🧾 chaîne de filiation : du défunt vers chaque héritier, les actes et leurs cotes (aucun texte de loi) ;
 *  B5 📊 parts en euros : l'actif net tapé (jamais gardé) × les fractions exactes du moteur, en centimes entiers (BigInt),
 *     arrondi au centime inférieur puis reste réparti aux plus grosses pertes : le total tombe juste ; commission telle
 *     qu'écrite au contrat (pas de TVA ajoutée), arrondie au centime le plus proche ; l'impôt n'est jamais calculé ;
 *  B6 ✉️ courriers en série : les champs ({civilité} {prénom} {nom}…), les héritiers exclus d'office et pourquoi.
 */
(function (root, factory) {
    const m = factory(root && root.LCNDA_SUCC_CORE ? root.LCNDA_SUCC_CORE : (typeof require === 'function' ? require('./heritage-successoral-core.js') : null));
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root) root.LCNDA_SUCC_OUTILS = m;
})(typeof window !== 'undefined' ? window : null, S => {
    'use strict';
    const fill = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
    const T0 = (s, v) => fill(s, v);
    const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayNum = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };

    /* ═════ B5. Les parts en euros ═════ */
    const MAX_CENTS = 10n ** 17n; // au-delà : absurde (10^15 €)
    const HUGE_CENTS = 100000000000n; // 1 milliard d'euros : on demande de confirmer
    /**
     * « 187 450,50 », « 187450.5 », « 187.450,50 », « 1 000 000 € » → {ok: true, cents: 18745050n, huge}.
     * Rien, des lettres, un nombre négatif : {ok: false, why: 'empty' | 'nan' | 'neg' | 'absurd'}.
     */
    function parseEuros(text) {
        let s = String(text ?? '').replace(/[\s   ']/g, '').replace(/(€|eur|euros?)$/i, '').replace(/^€/, '');
        if (!s) return {ok: false, why: 'empty'};
        if (/^[-−–]/.test(s)) return {ok: false, why: 'neg'};
        s = s.replace(/^\+/, '');
        if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return {ok: false, why: 'nan'};
        const lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
        let intPart = s, dec = '';
        if (lastDot >= 0 && lastCom >= 0) { const sep = lastDot > lastCom ? '.' : ','; const i = s.lastIndexOf(sep); intPart = s.slice(0, i); dec = s.slice(i + 1); if (intPart.includes(sep)) return {ok: false, why: 'nan'}; }
        else if (lastDot >= 0 || lastCom >= 0) {
            const sep = lastDot >= 0 ? '.' : ',', parts = s.split(sep);
            // un seul séparateur suivi de 1 ou 2 chiffres : la virgule des centimes ; sinon des milliers (« 187.450 », « 1,000,000 »)
            if (parts.length === 2 && parts[1].length <= 2) { intPart = parts[0]; dec = parts[1]; }
            else if (parts.slice(1).every(p => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3) { intPart = parts.join(''); dec = ''; }
            else if (parts.length === 2 && parts[1].length > 2) { intPart = parts[0]; dec = parts[1]; }
            else return {ok: false, why: 'nan'};
        }
        intPart = intPart.replace(/[.,]/g, '');
        if (!/^\d*$/.test(intPart) || !/^\d*$/.test(dec)) return {ok: false, why: 'nan'};
        if (!intPart && !dec) return {ok: false, why: 'nan'};
        if (intPart.length > 18) return {ok: false, why: 'absurd'};
        // au-delà de deux décimales : arrondi au centime le plus proche
        const d3 = (dec + '000').slice(0, 3);
        let cents = BigInt(intPart || '0') * 100n + BigInt(d3.slice(0, 2));
        if (Number(d3[2]) >= 5) cents += 1n;
        if (cents > MAX_CENTS) return {ok: false, why: 'absurd'};
        return {ok: true, cents, huge: cents > HUGE_CENTS};
    }
    /** des centimes (BigInt) → « 187 450,50 » ; seps : {group, decimal} de la langue de l'app, ou une locale Intl (sans le symbole €) */
    function formatCents(cents, seps = 'fr-FR') {
        const c = BigInt(cents), neg = c < 0n, a = neg ? -c : c;
        let group = '\u202f', decimal = ',';
        if (seps && typeof seps === 'object') { group = seps.group ?? group; decimal = seps.decimal ?? decimal; }
        else { try { const parts = new Intl.NumberFormat(seps, {minimumFractionDigits: 1}).formatToParts(12345.5); group = (parts.find(p => p.type === 'group') || {}).value ?? ''; decimal = (parts.find(p => p.type === 'decimal') || {}).value || ','; } catch (_) {} }
        const int = String(a / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, group); // en BigInt : exact, même pour un montant énorme
        return `${neg ? '-' : ''}${int}${decimal}${String(a % 100n).padStart(2, '0')}`;
    }
    /** les séparateurs d'un nombre formaté (« 12 345,5 ») : ceux de la langue de l'app */
    const sepsOf = sample => { const m = String(sample || '').match(/^12(\D*)345(\D)5$/); return m ? {group: m[1], decimal: m[2]} : null; };
    const frac = s => { const m = String(s || '0').match(/^(\d+)(?:\/(\d+))?$/); return m ? {n: BigInt(m[1]), d: BigInt(m[2] || 1)} : {n: 0n, d: 1n}; };
    /**
     * Partager totalCents selon les fractions exactes. shares = [{id, share: '1/3'}] → [{id, cents, lost}] dans le même ordre.
     * Chaque part est d'abord arrondie au centime inférieur ; les centimes restants vont, un par un, aux parts qui ont perdu
     * le plus (à égalité : l'ordre de la liste). Le total vaut exactement totalCents × (somme des fractions), arrondi.
     */
    function splitCents(totalCents, shares) {
        const T = BigInt(totalCents);
        const rows = shares.map((s, i) => { const f = frac(s.share); const num = T * f.n; return {i, id: s.id, base: f.d ? num / f.d : 0n, rem: f.d ? num % f.d : 0n, d: f.d}; });
        // la somme exacte des fractions (dénominateur commun) → le total visé
        let sn = 0n, sd = 1n;
        for (const s of shares) { const f = frac(s.share); sn = sn * f.d + f.n * sd; sd *= f.d; }
        const exactNum = T * sn; let target = exactNum / sd; if ((exactNum % sd) * 2n >= sd) target += 1n;
        let left = target - rows.reduce((a, r) => a + r.base, 0n);
        const order = [...rows].sort((a, b) => { const x = a.rem * b.d, y = b.rem * a.d; return x > y ? -1 : x < y ? 1 : a.i - b.i; });
        const plus = new Set();
        for (const r of order) { if (left <= 0n) break; if (r.rem === 0n) continue; plus.add(r.i); left -= 1n; }
        return rows.map(r => ({id: r.id, cents: r.base + (plus.has(r.i) ? 1n : 0n), rounded: plus.has(r.i)}));
    }
    /** la commission : pourcentage tel qu'écrit (« 30 », « 12,5 ») × montant, arrondie au centime le plus proche ; pas de TVA */
    function commission(cents, percent) {
        const p = Number(String(percent ?? '').replace(',', '.'));
        if (!Number.isFinite(p) || p <= 0) return 0n;
        const ppm = BigInt(Math.round(Math.min(100, p) * 10000)); // en millionièmes
        const num = BigInt(cents) * ppm;
        return (num * 2n + 1000000n) / 2000000n;
    }
    /**
     * Le tableau des parts en euros. rows : les lignes du moteur (R.rows) ; contracts : {id: {percent, signed}}.
     * Rend {lines: [{id, name, kin, share, cents, percent, signed, fee, rest, zero, souche}], total, fees, rests} (centimes BigInt).
     */
    function euroTable(rows, totalCents, contracts = {}) {
        const heirs = rows.filter(r => ['heir', 'parent', 'spouse'].includes(r.role));
        const split = splitCents(totalCents, heirs.map(r => ({id: r.id, share: r.share})));
        const by = new Map(split.map(s => [s.id, s]));
        let total = 0n, fees = 0n, rests = 0n;
        const lines = heirs.map(r => {
            const s = by.get(r.id) || {cents: 0n, rounded: false}; const c = contracts[r.id] || contracts[String(r.id)] || null;
            const fee = c ? commission(s.cents, c.percent) : 0n, rest = s.cents - fee;
            total += s.cents; fees += fee; rests += rest;
            return {id: r.id, name: r.name, kin: r.kin, share: r.share, cents: s.cents, rounded: s.rounded, percent: c ? c.percent : null, signed: c ? !!c.signed : false, fee, rest, zero: r.share === '0', role: r.role};
        });
        return {lines, total, fees, rests};
    }

    /* ═════ B1. Le chronomètre ═════ */
    const IDLE_MS = 10 * 60000; // pause toute seule après 10 min sans frappe, clic ni défilement
    const LONG_MS = 10 * 3600000; // plus de 10 h d'affilée : on demande avant de noter
    /** ms → minutes arrondies à la minute la plus proche */
    const roundMinutes = ms => Math.max(0, Math.round((Number(ms) || 0) / 60000));
    /** le temps compté : les morceaux fermés et celui qui tourne */
    const elapsed = (st, now = Date.now()) => (st?.segs || []).reduce((a, s) => a + Math.max(0, s.to - s.from), 0) + (st?.start ? Math.max(0, now - st.start) : 0);
    /** les morceaux, découpés à minuit (heure de l'ordinateur) : [{day: 'AAAA-MM-JJ', minutes}] (jours sans minute retirés) */
    function byDay(segs) {
        const days = new Map();
        for (const s of segs || []) {
            let a = Number(s.from), b = Number(s.to); if (!(b > a)) continue;
            while (a < b) {
                const d = new Date(a), next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), end = Math.min(b, next);
                days.set(isoDay(d), (days.get(isoDay(d)) || 0) + (end - a)); a = end;
            }
        }
        return [...days.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([day, ms]) => ({day, ms, minutes: roundMinutes(ms)})).filter(x => x.minutes > 0);
    }
    /** pause toute seule : le morceau qui tourne s'arrête au dernier geste ; rend le nouvel état (et le temps non compté) */
    function autoPause(st, lastActivity, now = Date.now(), idle = IDLE_MS) {
        if (!st?.start || !idle || now - lastActivity < idle) return null;
        const to = Math.max(st.start, lastActivity);
        return {...st, start: 0, segs: [...(st.segs || []), {from: st.start, to}], paused: 'auto', gap: {from: to, to: now}};
    }
    /** « Quoi » proposé d'après les onglets ouverts pendant le comptage */
    const chronoLabel = (tabs, t = T0) => (tabs && tabs.length ? t('Recherches : {what}', {what: tabs.join(', ')}) : t('Recherches'));

    /* ═════ B2. Les échéances de la cloche ═════ */
    /**
     * items : [{due: 'AAAA-MM-JJ', …}] de toutes les généalogies → {late, today, week, later, count} (count = retards + aujourd'hui,
     * la pastille) ; les retards d'abord, du plus ancien au plus récent.
     */
    function bellGroups(items, today = isoDay(new Date())) {
        const t = dayNum(today), late = [], now = [], week = [];
        for (const x of items || []) {
            const d = dayNum(x.due); if (d == null) continue;
            if (d < t) late.push(x); else if (d === t) now.push(x); else if (d <= t + 7) week.push(x);
        }
        const by = (a, b) => String(a.due).localeCompare(String(b.due)) || String(a.number || '').localeCompare(String(b.number || ''), 'fr', {numeric: true});
        late.sort(by); now.sort(by); week.sort(by);
        const n = late.length + now.length;
        return {late, today: now, week, count: n, badge: n > 9 ? '9+' : n ? String(n) : ''};
    }
    /** ⏭ reporter : demain, ou lundi si demain tombe un samedi ou un dimanche */
    function snoozeDay(today = isoDay(new Date())) {
        const m = String(today).match(/^(\d{4})-(\d{2})-(\d{2})$/); const d = m ? new Date(+m[1], +m[2] - 1, +m[3] + 1) : new Date();
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        return isoDay(d);
    }

    /* ═════ B3. Avant de remettre au notaire ═════ */
    /**
     * La liste de contrôle, d'après ce que le moteur sait déjà (progress, pieces, contact, échéances) : rien de neuf à saisir.
     * Chaque point : {key, level: 'ok' | 'warn' | 'miss', text, detail, go} (go = l'onglet où corriger) ; ça avertit, ça n'empêche pas.
     */
    function beforeNotary(D, R, P, opts = {}) {
        const t = opts.t || T0, today = opts.today || isoDay(new Date()), fd = opts.fmt || (x => x);
        const nm = id => S.name(D.graph?.persons?.[id]);
        const items = [];
        const add = (key, level, text, detail = '', go = '') => items.push({key, level, text, detail, go});
        const prog = S.progress(D, R, P, opts);
        const list = P?.list || [];
        const dead = list.find(i => i.key === 'D:' + D.deceased_id);
        const actTxt = it => it?.act || '';
        // 1. l'acte de décès du défunt
        if (dead?.state === 'have') add('death', 'ok', t('Acte de décès de {name} en main', {name: nm(D.deceased_id)}), [actTxt(dead), (D.acts?.[dead.key]?.sources || []).join(' ; ')].filter(Boolean).join(' · '));
        else add('death', 'miss', t('Acte de décès de {name} pas en main', {name: nm(D.deceased_id)}), dead?.state === 'asked' ? t('demandé, pas encore reçu') : '', 'pieces');
        // 2. l'arbre complet (ou l'hypothèse écrite)
        const TO_FIND = new Set(['branch', 'parents', 'kids', 'lit', 'nodesc', 'adoption', 'marriage']);
        const search = (R.search || []).filter(s => TO_FIND.has(s.kind));
        const note = String(D.hypothesis_note || '').trim();
        if (!search.length) add('tree', 'ok', t('Arbre de dévolution complet'), t('Aucune branche à chercher.'));
        else add('tree', note ? 'warn' : 'miss', t('Branches encore à chercher : {n}', {n: search.length}), note ? t('Hypothèse retenue : {h}', {h: note}) : search.slice(0, 4).map(s => s.name).join(', '), 'tree');
        // 3. les héritiers dont l'existence n'est pas établie
        const unk = (R.rows || []).filter(r => r.unknown && r.share !== '0');
        if (unk.length) add('unknown', 'warn', t('Héritiers dont l’existence n’est pas établie : {n}', {n: unk.length}), unk.map(r => r.name).join(', ') + (note ? ' · ' + t('Hypothèse retenue : {h}', {h: note}) : ''), 'heirs');
        // 4. chaque lien prouvé par un acte : manquant = ✗, seulement demandé = ⚠️ (à revoir)
        const heirs = (R.rows || []).filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const linked = key => heirs.filter(h => (P?.perHeir?.[h.id] || []).includes(key)).map(h => h.name);
        const links = list.filter(i => i.key !== 'D:' + D.deceased_id && i.state !== 'na');
        const missing = links.filter(i => i.state === 'missing'), asked = links.filter(i => i.state === 'asked');
        if (missing.length) add('links', 'miss', t('Liens prouvés par aucun acte : {n}', {n: missing.length}), missing.slice(0, 6).map(i => { const who = linked(i.key); return who.length ? t('{what} (relie {who} au défunt)', {what: i.what, who: who.join(', ')}) : i.what; }).join(' ; '), 'pieces');
        else add('links', 'ok', t('Chaque lien est prouvé par un acte'));
        if (asked.length) add('asked', 'warn', t('Actes demandés, pas encore reçus : {n}', {n: asked.length}), asked.slice(0, 6).map(i => i.asked?.date ? t('{what} · demandé le {d}', {what: i.what, d: fd(i.asked.date)}) + (i.asked.courrier_id ? ' ' + t('(courrier n° {n})', {n: i.asked.courrier_id}) : '') : i.what).join(' ; '), 'relance');
        // 5. les adresses des vivants (étape 4)
        const st4 = prog.steps[3], st5 = prog.steps[4];
        if (!st4.total || st4.done >= st4.total) add('addresses', 'ok', st4.total ? t('Adresses des héritiers vivants : {n} sur {m}', {n: st4.done, m: st4.total}) : t('Aucun héritier vivant à joindre'));
        else add('addresses', 'warn', t('Adresses des héritiers vivants : {n} sur {m}', {n: st4.done, m: st4.total}), '', 'living');
        // 6. les contrats signés, ou le refus noté (étape 5)
        const cs = D.courriers || [];
        const living = heirs.filter(r => !r.unknown && ['surv', 'abs'].includes(r.timing));
        const unsigned = living.filter(r => !cs.some(c => Number(c.person_id) === r.id && c.kind !== 'acte' && (c.signe_le || c.reponse === 'no')));
        if (!st5.total || !unsigned.length) add('contracts', 'ok', st5.total ? t('Contrats signés (ou refus noté) : {n} sur {m}', {n: st5.total - unsigned.length, m: st5.total}) : t('Aucun contrat à faire signer'));
        else add('contracts', 'warn', t('Contrats pas encore signés : {n}', {n: unsigned.length}), unsigned.slice(0, 6).map(r => { const yes = cs.find(c => Number(c.person_id) === r.id && c.reponse === 'yes'); return yes ? t('{name} a répondu « oui », pas de date de signature', {name: r.name}) : r.name; }).join(' ; '), 'contacts');
        // 7. 🔎 introuvable / 🔇 ne répond pas
        const lost = living.map(r => ({r, c: S.contactOf(D, r.id)})).filter(x => x.c.state);
        if (lost.length) add('contact', 'warn', t('Héritiers introuvables ou silencieux : {n}', {n: lost.length}), lost.map(x => `${x.r.name} (${x.c.state === 'introuvable' ? t('introuvable') : t('ne répond pas')}${x.c.at ? ', ' + t('depuis le {d}', {d: fd(String(x.c.at).slice(0, 10))}) : ''})`).join(' ; '), 'heirs');
        // 8. le total des parts (ne devrait jamais manquer)
        if (R.totalOk) add('total', 'ok', t('Parts : le total fait bien 1'), heirs.map(r => r.share).join(' + '));
        else add('total', 'miss', t('Les parts ne totalisent pas 1 : à revoir'), R.total ? t('total {t}', {t: R.total}) : '', 'heirs');
        // 9. les échéances en retard
        const late = (D.deadlines || []).filter(x => !x.done && dayNum(x.due) != null && dayNum(x.due) < dayNum(today));
        if (late.length) add('late', 'warn', t('Échéances en retard : {n}', {n: late.length}), late.map(x => `${fd(x.due)} · ${x.label}`).join(' ; '), 'dossier');
        else add('late', 'ok', t('Aucune échéance en retard'));
        const ok = items.filter(i => i.level === 'ok').length, warn = items.filter(i => i.level === 'warn').length, miss = items.filter(i => i.level === 'miss').length;
        return {items, ok, warn, miss, total: items.length, ready: !warn && !miss};
    }
    /** la ligne du journal quand on remet quand même : « Remis au notaire avec 1 manque et 2 points à revoir (…) » */
    function notaryJournal(ck, t = T0) {
        if (ck.ready) return '';
        const what = ck.items.filter(i => i.level !== 'ok').map(i => i.text).join(' ; ');
        return t('Remis au notaire avec {miss} manque(s) et {warn} point(s) à revoir ({what})', {miss: ck.miss, warn: ck.warn, what});
    }

    /* ═════ B4. La chaîne de filiation ═════ */
    /**
     * Pour chaque héritier, les actes qui le relient au défunt, du défunt vers l'héritier : les actes communs (le décès et la
     * naissance du défunt…) puis ceux de sa branche, dans l'ordre de pieces(). Un acte déjà écrit pour un héritier précédent
     * est marqué « seen » (n° de l'héritier où il est écrit en entier).
     * Rend [{n, id, name, kin, share, steps: [{key, kind, what, act, state, sources, asked, seen}]}].
     */
    function filiationChain(D, R, P) {
        const heirs = (R.rows || []).filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const byKey = new Map((P?.list || []).map(i => [i.key, i]));
        const common = (P?.groups || []).find(g => g.key === 'common');
        const firstAt = new Map(), out = [];
        heirs.forEach((h, i) => {
            const keys = [...(common ? common.items.map(x => x.key) : []), ...((P?.perHeir || {})[h.id] || [])];
            const steps = [...new Set(keys)].map(k => byKey.get(k)).filter(Boolean).filter(it => it.state !== 'na').map(it => {
                const seen = firstAt.has(it.key) ? firstAt.get(it.key) : 0; if (!seen) firstAt.set(it.key, i + 1);
                return {key: it.key, kind: it.kind, what: it.what, act: it.act, state: it.state, sources: (D.acts?.[it.key]?.sources || []).slice(), asked: it.asked || null, seen};
            });
            out.push({n: i + 1, id: h.id, name: h.name, kin: h.kin, share: h.share, unknown: !!h.unknown, steps});
        });
        return out;
    }
    /** les articles cités par le moteur pour ce dossier (notes, ordres, conjoint, avertissements, branches à chercher) */
    function citedArticles(R) {
        const texts = [...(R.notes || []), ...(R.orders || []).map(o => o.label), ...(R.warnings || []).map(w => w.text), ...(R.search || []).map(s => s.text), ...(R.rows || []).filter(r => r.art).map(r => `art. ${r.art}`)];
        const all = new Set(); texts.forEach(x => S.lawCited(x).forEach(a => { if (S.LAW[a]) all.add(a); }));
        const num = a => a.split('-').map(Number);
        return [...all].sort((a, b) => { const x = num(a), y = num(b); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); });
    }

    /* ═════ B6. Les courriers en série ═════ */
    const FIELDS = ['civilité', 'prénom', 'nom', 'adresse', 'qualité', 'dossier', 'notaire', 'date', 'envoyé_le', 'expéditeur'];
    const ALIASES = {heir: null, sender: 'expéditeur', sent: 'envoyé_le'}; // les champs d'avant : {heir} = prénom et nom
    const FIELD_RE = /\{([\p{L}_]+)\}/gu;
    /** les champs inconnus d'un modèle : [{name, line}] */
    function unknownFields(text, allowed = FIELDS) {
        const out = [];
        String(text || '').split('\n').forEach((l, i) => { for (const m of l.matchAll(FIELD_RE)) if (!allowed.includes(m[1]) && !(m[1] in ALIASES)) out.push({name: m[1], line: i + 1}); });
        return out;
    }
    /** les valeurs des champs pour un héritier ; le nom du défunt n'en fait jamais partie */
    function letterValues(D, row, o = {}) {
        const p = D.graph?.persons?.[row.id] || {};
        const t = o.t || T0;
        const civ = p.gender === 'female' ? t('Madame') : p.gender === 'male' ? t('Monsieur') : '';
        return {'civilité': civ, 'prénom': String(p.first || '').trim(), 'nom': String(p.last || '').trim().toLocaleUpperCase('fr'), 'adresse': (D.addresses?.[row.id]?.lines || []).join('\n'),
            'qualité': row.kin || '', 'dossier': D.number || '', 'notaire': D.notary || '', 'date': o.date || '', 'envoyé_le': o.sent || '', 'expéditeur': o.sender || ''};
    }
    /**
     * Remplir un modèle : {text, empty: [champs vides], parts: [{text, field, empty}]} (parts : pour l'aperçu, qui surligne les
     * champs vides). Un champ vide s'efface avec l'espace qui le suit (« {civilité} {nom} » → « MAZAUD »).
     */
    function fillLetter(tpl, v) {
        const val = name => (name === 'heir' ? [v['prénom'], v['nom']].filter(Boolean).join(' ') : v[ALIASES[name] || name]);
        const parts = [], empty = new Set();
        let last = 0;
        const src = String(tpl || '');
        for (const m of src.matchAll(FIELD_RE)) {
            const name = m[1]; if (!FIELDS.includes(name) && !(name in ALIASES)) continue;
            parts.push({text: src.slice(last, m.index)});
            const x = val(name); let end = m.index + m[0].length;
            if (x == null || x === '') { empty.add(ALIASES[name] || (name === 'heir' ? 'nom' : name)); parts.push({text: '', field: name, empty: true}); if (src[end] === ' ') end++; }
            else parts.push({text: String(x), field: name});
            last = end;
        }
        parts.push({text: src.slice(last)});
        return {text: parts.map(p => p.text).join(''), empty: [...empty], parts};
    }
    /**
     * À qui écrire : les héritiers à contacter (pas ceux dont l'existence n'est pas établie). Décochés d'office : sans adresse,
     * 🔎 introuvable, 🔇 ne répond pas — avec la raison ; « last » = le dernier courrier déjà envoyé.
     */
    function recipients(D, R) {
        const rows = (R.rows || []).filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0' && !r.unknown);
        return rows.map(r => {
            const addr = D.addresses?.[r.id] || D.addresses?.[String(r.id)] || null, c = S.contactOf(D, r.id);
            const last = (D.courriers || []).filter(x => Number(x.person_id) === r.id && x.kind !== 'acte').sort((a, b) => String(b.date_envoi).localeCompare(String(a.date_envoi)))[0] || null;
            const why = c.state === 'introuvable' ? 'introuvable' : c.state === 'silence' ? 'silence' : !addr || !(addr.lines || []).length ? 'noaddr' : '';
            return {id: r.id, name: r.name, kin: r.kin, share: r.share, address: addr ? (addr.lines || []).join(', ') : '', email: addr?.email || '', why, since: c.at || '', checked: !why, last: last ? {date: last.date_envoi, kind: last.kind} : null};
        });
    }

    return {parseEuros, formatCents, sepsOf, splitCents, commission, euroTable, HUGE_CENTS, IDLE_MS, LONG_MS, roundMinutes, elapsed, byDay, autoPause, chronoLabel,
        bellGroups, snoozeDay, beforeNotary, notaryJournal, filiationChain, citedArticles, FIELDS, unknownFields, letterValues, fillLetter, recipients, isoDay};
});
