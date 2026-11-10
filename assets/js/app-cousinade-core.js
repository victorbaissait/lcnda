/* LCNDA — 🎉 Organiser une cousinade : les calculs sans écran (aussi chargés par Node pour les tests :
 * require('…/app-cousinade-core.js')). L'écran est dans heritage-cousinade.js, le serveur dans lib/cousinade.php.
 *  - foyers(invités) : une invitation par foyer (le descendant, son conjoint, ses enfants mineurs ; un « foyer » se change à la main) ;
 *  - foyerName(membres) : « Paul et Marie MARTIN », « Paul MARTIN et Anne DURAND », « Famille MARTIN » ;
 *  - fill(modèle, valeurs) : « Chère {foyer}, … le {date} à {lieu} » (champs connus seulement, rien d'autre n'est lu) ;
 *  - mailto(foyer, objet, texte) : un courriel prêt (rien n'est envoyé par l'app) ;
 *  - tablePlan(invités, places) : plan de table simple, par branche, un foyer jamais coupé ;
 *  - stats(invités, branches) : invités, réponses et personnes attendues par branche, régimes ;
 *  - badge(invité, projet, réglages) : le nom en gros, la branche et sa couleur, « cousin issu de germains de … » ;
 *  - branchColor(i) : la couleur de départ de chaque branche ; mapColumns(entêtes) : lire un tableau importé.
 */
(function (root) {
    'use strict';
    const PALETTE = ['#2f6fdf', '#d9534f', '#2e9d5b', '#e08a1e', '#8a4fd0', '#1aa3a3', '#c2477f', '#7a6a2a', '#4a5a7a', '#b8452a', '#3f8f2f', '#9a3f9a'];
    const branchColor = i => PALETTE[((Number(i) || 0) % PALETTE.length + PALETTE.length) % PALETTE.length];
    const up = s => String(s || '').trim().toLocaleUpperCase('fr-FR');
    const fullName = g => `${String(g.first_name || '').trim()} ${up(g.last_name)}`.trim() || 'Sans nom';
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();

    /** « Paul et Marie MARTIN » ; « Paul MARTIN et Anne DURAND » ; trois et plus : « Famille MARTIN » */
    function foyerName(members) {
        const m = (members || []).filter(Boolean);
        if (!m.length) return '';
        if (m.length === 1) return fullName(m[0]);
        if (m.length === 2) {
            const [a, b] = m;
            if (up(a.last_name) && up(a.last_name) === up(b.last_name)) return `${String(a.first_name || '').trim()} et ${String(b.first_name || '').trim()} ${up(a.last_name)}`.replace(/\s+/g, ' ').trim();
            return `${fullName(a)} et ${fullName(b)}`;
        }
        const last = up((m.find(g => g.person_id && !g.spouse_of) || m[0]).last_name);
        return last ? `Famille ${last}` : m.map(fullName).join(', ');
    }

    /** les foyers des invités cochés : [{key, members, name, address: [lignes], emails, phones, branch_id}] */
    function foyers(guests, {all = false} = {}) {
        const map = new Map();
        for (const g of guests || []) {
            if (!all && !g.invited) continue;
            const k = String(g.foyer || '').trim() || 'g' + g.id;
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(g);
        }
        const out = [];
        for (const [key, members] of map) {
            // le descendant d'abord, puis son conjoint, puis les enfants (les plus âgés d'abord)
            members.sort((a, b) => (a.spouse_of ? 1 : 0) - (b.spouse_of ? 1 : 0) || (a.gen || 99) - (b.gen || 99) || (a.birth || 0) - (b.birth || 0) || a.id - b.id);
            const withAddr = members.find(g => String(g.address || '').trim() || String(g.city || '').trim());
            const address = withAddr ? [String(withAddr.address || '').trim(), [String(withAddr.postal_code || '').trim(), up(withAddr.city)].filter(Boolean).join(' '), /^france$/i.test(String(withAddr.country || '').trim()) ? '' : up(withAddr.country)].filter(Boolean) : [];
            const emails = [...new Set(members.map(g => String(g.email || '').trim()).filter(e => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e)))];
            const phones = [...new Set(members.map(g => String(g.phone || '').trim()).filter(Boolean))];
            out.push({key, members, name: foyerName(members), address, emails, phones, branch_id: members[0].branch_id || null});
        }
        return out.sort((a, b) => (a.branch_id || 0) - (b.branch_id || 0) || a.name.localeCompare(b.name, 'fr'));
    }

    const FIELDS = ['foyer', 'prenoms', 'titre', 'date', 'lieu', 'ancetre', 'reponse_avant', 'contact', 'branche'];
    /** remplit un modèle : {foyer} {prenoms} {titre} {date} {lieu} {ancetre} {reponse_avant} {contact} {branche} — rien d'autre */
    function fill(tpl, v = {}) {
        return String(tpl || '').replace(/\{([a-z_]+)\}/g, (m, k) => (FIELDS.includes(k) ? String(v[k] ?? '') : m));
    }
    const firstNames = members => { const n = members.map(g => String(g.first_name || '').trim()).filter(Boolean); return n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`; };
    /** les valeurs d'un foyer pour le modèle */
    function foyerValues(f, project = {}, branches = []) {
        const b = branches.find(x => x.id === f.branch_id);
        return {foyer: f.name, prenoms: firstNames(f.members), titre: project.title || '', date: project.date_text || '', lieu: project.place_text || '', ancetre: project.ancestor_name || '',
            reponse_avant: project.options?.invitation?.answerBy || '', contact: project.options?.invitation?.contact || '', branche: b ? b.name : ''};
    }
    /** un courriel prêt : mailto: avec les adresses du foyer (rien n'est envoyé par l'app) */
    function mailto(emails, subject, body, {bcc = false} = {}) {
        const list = (emails || []).filter(Boolean).join(',');
        const q = [`subject=${encodeURIComponent(subject || '')}`, `body=${encodeURIComponent(String(body || '').replace(/\r?\n/g, '\r\n'))}`];
        if (bcc) return `mailto:?bcc=${encodeURIComponent(list)}&${q.join('&')}`;
        return `mailto:${list.split(',').map(encodeURIComponent).join(',')}?${q.join('&')}`;
    }

    /** les places d'un invité : le nombre donné avec sa réponse, sinon 1 */
    const seats = g => (Number.isFinite(Number(g.people_count)) && g.people_count !== null && g.people_count !== '' ? Math.max(0, Math.round(Number(g.people_count))) : 1);
    /**
     * Plan de table : les invités qui viennent (oui ; « peut-être » aussi si maybe), rangés par branche puis par foyer ;
     * une table de `size` places au plus ; un foyer n'est jamais coupé (un foyer plus grand qu'une table en prend plusieurs) ;
     * chaque branche commence une nouvelle table, sauf si mix (les petites branches se partagent alors une table).
     * → {tables: [{no, branch_id, guests: [ids], seats}], byGuest: {id: no}}
     */
    function tablePlan(guests, size = 8, {maybe = false, mix = false} = {}) {
        size = Math.max(2, Math.min(40, Math.round(Number(size) || 8)));
        const coming = (guests || []).filter(g => g.invited && (g.answer === 'yes' || (maybe && g.answer === 'maybe')) && seats(g) > 0);
        const fs = foyers(coming, {all: true}).map(f => ({...f, seats: f.members.reduce((s, g) => s + seats(g), 0)}));
        const tables = [], byGuest = {};
        let cur = null;
        const open = br => { cur = {no: tables.length + 1, branch_id: br, guests: [], seats: 0}; tables.push(cur); };
        for (const f of fs) {
            if (!cur || (!mix && cur.branch_id !== f.branch_id) || cur.seats + Math.min(f.seats, size) > size) open(f.branch_id);
            for (const g of f.members) {
                const s = seats(g);
                if (cur.seats + s > size && cur.seats > 0) open(f.branch_id);
                cur.guests.push(g.id); cur.seats += s; byGuest[g.id] = cur.no;
            }
        }
        return {tables, byGuest};
    }

    /** chiffres par branche : invités, oui, non, peut-être, sans réponse, personnes attendues ; régimes */
    function stats(guests, branches = []) {
        const row = () => ({invited: 0, yes: 0, no: 0, maybe: 0, wait: 0, people: 0, present: 0, guests: 0});
        const by = new Map(), total = row(), diets = new Map();
        const key = g => g.branch_id || 0;
        for (const g of guests || []) {
            const r = by.get(key(g)) || row(); by.set(key(g), r);
            for (const x of [r, total]) {
                x.guests++;
                if (!g.invited) continue;
                x.invited++;
                if (g.answer === 'yes') { x.yes++; x.people += seats(g); } else if (g.answer === 'no') x.no++; else if (g.answer === 'maybe') x.maybe++; else x.wait++;
                if (g.present) x.present++;
            }
            const d = String(g.diet || '').trim();
            if (g.invited && g.answer === 'yes' && d) for (const part of d.split(/[,;/]+/).map(s => s.trim()).filter(Boolean)) { const k = fold(part); const o = diets.get(k) || {label: part, n: 0}; o.n++; diets.set(k, o); }
        }
        const rows = branches.map((b, i) => ({id: b.id, name: b.name, color: b.color || branchColor(i), ...(by.get(b.id) || row())}));
        if (by.has(0)) rows.push({id: 0, name: 'Sans branche', color: '#8a8f98', ...by.get(0)});
        for (const [id, r] of by) if (id && !branches.some(b => b.id === id)) rows.push({id, name: 'Autre branche', color: '#8a8f98', ...r});
        return {rows, total, diets: [...diets.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr'))};
    }

    /** une majuscule au début */
    const ucfirst = s => (s ? s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1) : s);
    /**
     * Le badge d'un invité : {first, last, branch, color, line, photo}
     * line : « Petit-fils de Jean MARTIN » (rel = 'ancestor'), « Cousin issu de germains de Marie » (rel = 'ref'), ou les deux.
     */
    function badge(g, project = {}, {rel = 'ancestor', photo = true} = {}) {
        const branches = project.branches || [], bi = branches.findIndex(b => b.id === g.branch_id), b = bi >= 0 ? branches[bi] : null;
        const color = (b && project.options?.branchColors?.[b.id]) || (bi >= 0 ? branchColor(bi) : '#8a8f98');
        const anc = project.ancestor_name || '', ref = project.ref;
        const toAnc = g.kin_ancestor ? ucfirst(`${g.kin_ancestor} de ${anc}`) : '';
        const toRef = g.kin_ref === 'self' ? (ref ? 'La personne de référence' : '') : g.kin_ref && ref ? ucfirst(`${g.kin_ref} de ${ref.first || ref.name}`) : '';
        const lines = rel === 'both' ? [toAnc, toRef] : rel === 'ref' ? [toRef || toAnc] : [toAnc || toRef];
        return {first: String(g.first_name || '').trim() || up(g.last_name), last: up(g.last_name), branch: b ? `Branche ${b.first || b.name}` : '', color, lines: lines.filter(Boolean),
            photo: photo && g.portrait ? g.portrait : '', id: g.id, person_id: g.person_id || null};
    }

    /** les colonnes d'un tableau importé → champs des invités (entêtes en français ou en anglais, sans accents) */
    const COLS = [['first_name', /^(prenoms?|first ?names?|given ?names?)$/], ['last_name', /^(noms?( de famille)?|last ?names?|surnames?|family ?names?)$/],
        ['fullname', /^(nom complet|prenom nom|nom prenom|name|full ?name|invites?|personnes?)$/], ['email', /^(e ?mails?|courriels?|mails?|adresse e ?mail|adresse mail)$/],
        ['phone', /^(tel|telephones?|phones?|portables?|mobiles?|gsm)$/], ['address', /^(adresses?|rue|address|street)$/], ['postal_code', /^(cp|code postal|zip|postcode|postal code)$/],
        ['city', /^(villes?|communes?|city|town)$/], ['country', /^(pays|country)$/], ['answer', /^(reponses?|answer|rsvp|vient|presence)$/],
        ['people_count', /^(nb|nombre|nb de personnes|nombre de personnes|personnes attendues|people|count|combien)$/], ['diet', /^(regimes?|diet|allergies?|repas)$/],
        ['note', /^(notes?|remarques?|commentaires?|comments?)$/], ['foyer', /^(foyer|famille|household)$/]];
    function mapColumns(header) { return (header || []).map(h => { const k = fold(h); const hit = COLS.find(([, re]) => re.test(k)); return hit ? hit[0] : ''; }); }
    /** « oui », « Non », « peut-être », « ? », « x » → yes / no / maybe / '' */
    function readAnswer(v) {
        const k = fold(v);
        if (!k) return '';
        if (/^(oui|yes|y|o|x|ok|1|vient|present|presente|viendra)$/.test(k)) return 'yes';
        if (/^(non|no|n|0|absent|absente|excuse|excusee)$/.test(k)) return 'no';
        if (/^(peut etre|peutetre|maybe|p|\?|sais pas|ne sait pas|incertain)$/.test(k)) return 'maybe';
        return '';
    }
    /** des lignes de tableau (première ligne = entêtes) → invités prêts pour l'import */
    function rowsToGuests(rows) {
        const [head, ...body] = rows || [];
        const cols = mapColumns(head || []);
        if (!cols.some(Boolean)) return {guests: [], cols, unknown: (head || []).length};
        const guests = [];
        for (const r of body) {
            const g = {};
            cols.forEach((c, i) => { if (!c) return; const v = String(r?.[i] ?? '').trim(); if (v) g[c] = v; });
            if (g.fullname && !g.first_name && !g.last_name) { const parts = g.fullname.split(/\s+/); const lastIdx = parts.findIndex(p => p.length > 1 && p === p.toLocaleUpperCase('fr-FR') && /\p{L}/u.test(p)); if (lastIdx > 0) { g.first_name = parts.slice(0, lastIdx).join(' '); g.last_name = parts.slice(lastIdx).join(' '); } else if (lastIdx === 0) { g.last_name = parts.filter(p => p === p.toLocaleUpperCase('fr-FR')).join(' '); g.first_name = parts.filter(p => p !== p.toLocaleUpperCase('fr-FR')).join(' '); } else { g.first_name = parts.slice(0, -1).join(' '); g.last_name = parts.slice(-1).join(' '); } }
            delete g.fullname;
            if ('answer' in g) g.answer = readAnswer(g.answer);
            if ('people_count' in g) { const n = parseInt(g.people_count, 10); if (Number.isFinite(n)) g.people_count = n; else delete g.people_count; }
            if (g.first_name || g.last_name) guests.push(g);
        }
        return {guests, cols, unknown: cols.filter(c => !c).length};
    }

    const api = {PALETTE, branchColor, foyerName, foyers, fill, FIELDS, foyerValues, firstNames, mailto, seats, tablePlan, stats, badge, mapColumns, readAnswer, rowsToGuests, fullName, fold};
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_COUSINADE = api;
})(typeof window !== 'undefined' ? window : null);
