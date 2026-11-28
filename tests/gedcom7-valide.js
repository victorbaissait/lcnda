'use strict';
/**
 * Vérificateur GEDCOM pour les tests (pas un test à lui seul) :
 *  - gedcom7Errors(text) : un fichier GEDCOM 7.0 contrôlé avec les RÈGLES OFFICIELLES de FamilySearch
 *    (tests/fixtures/gedcom7-regles : fichiers extraits de la spécification, dépôt FamilySearch/GEDCOM, commit 240a1dd,
 *    licence Apache 2.0) : balises permises sous chaque structure, nombre d'apparitions (cardinalités), type de chaque
 *    valeur (pointeur vers le bon type d'enregistrement ou @VOID@, Y|<NULL>, entier, énumération, date, âge, heure,
 *    langue, type de fichier, latitude, longitude), grammaire des lignes, identifiants uniques, pointeurs résolus,
 *    pas de CONC, balises d'extension déclarées dans HEAD.SCHMA ;
 *  - gedcom551Errors(text) : contrôle de structure d'un GEDCOM 5.5.1 (en-tête complet avec SUBM, CHAR, GEDC.FORM,
 *    niveaux, lignes de 255 caractères au plus, identifiants, pointeurs, TRLR).
 * Rend la liste des erreurs (vide : le fichier est valable).
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'fixtures', 'gedcom7-regles');
const V = 'https://gedcom.io/terms/v7/';
let rules = null;
function loadRules() {
    if (rules) return rules;
    const tsv = f => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
    const sub = new Map();          // superstructure uri ('' = enregistrement) → Map(tag → uri)
    for (const [sup, tag, uri] of tsv('substructures.tsv')) { if (!sub.has(sup)) sub.set(sup, new Map()); sub.get(sup).set(tag, uri); }
    const card = new Map();         // super → Map(uri → {min,max})
    for (const [sup, uri, c] of tsv('cardinalities.tsv')) { const m = /\{(\d+):(\d+|M)\}/.exec(c); if (!card.has(sup)) card.set(sup, new Map()); card.get(sup).set(uri, {min: +m[1], max: m[2] === 'M' ? Infinity : +m[2]}); }
    const payload = new Map(tsv('payloads.tsv').map(([u, p]) => [u, p || '']));
    const uriTag = new Map(tsv('uri-tags.tsv'));
    const enumSetOf = new Map(tsv('enumerations.tsv'));
    const enumValues = new Map();   // set → Set(tag)
    for (const [set, val] of tsv('enumerationsets.tsv')) { if (!enumValues.has(set)) enumValues.set(set, new Set()); enumValues.get(set).add(uriTag.get(val) || val.split('/').pop()); }
    const calendars = new Map(tsv('calendars.tsv').map(([c, m, e]) => [c, {months: new Set((m || '').split(',').filter(Boolean)), epochs: new Set((e || '').split(',').filter(Boolean))}]));
    rules = {sub, card, payload, enumSetOf, enumValues, calendars};
    return rules;
}

/** Une date GEDCOM 7 (DateValue, ou seulement exacte, ou seulement une période) : vraie si elle suit la grammaire. */
function date7Ok(v, kind = 'value') {
    const R = loadRules();
    const one = s => {
        const t = s.split(' ');
        let cal = 'GREGORIAN';
        if (R.calendars.has(t[0])) cal = t.shift();
        else if (/^_[A-Z0-9_]+$/.test(t[0])) return true; // calendrier d'extension
        const c = R.calendars.get(cal);
        if (t.length && c.epochs.has(t[t.length - 1])) t.pop();
        if (t.length < 1 || t.length > 3 || !/^\d+$/.test(t[t.length - 1])) return false;
        if (t.length >= 2 && !c.months.has(t[t.length - 2]) && !/^_[A-Z0-9_]+$/.test(t[t.length - 2])) return false;
        if (t.length === 3 && !/^\d+$/.test(t[0])) return false;
        return true;
    };
    if (kind === 'exact') return /^\d+ [A-Z]{3} \d+$/.test(v) && R.calendars.get('GREGORIAN').months.has(v.split(' ')[1]);
    if (v === '') return kind !== 'exact';
    let m;
    if ((m = /^FROM (.+?)(?: TO (.+))?$/.exec(v)) || (m = /^TO (.+)$/.exec(v))) { return m.slice(1).filter(Boolean).every(one); }
    if (kind === 'period') return false;
    if ((m = /^BET (.+) AND (.+)$/.exec(v))) return one(m[1]) && one(m[2]);
    if ((m = /^(?:BEF|AFT|ABT|CAL|EST) (.+)$/.exec(v))) return one(m[1]);
    return one(v);
}

function parseLines(text, errors, strict7) {
    const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    const rx = strict7 ? /^(0|[1-9]\d*) (?:@([A-Z0-9_]+)@ )?([A-Z][A-Z0-9_]*|_[A-Z0-9_]+)(?: (.*))?$/ : /^(\d{1,2}) (?:@([^@ ]+)@ )?([A-Za-z0-9_]+)(?: (.*))?$/;
    const root = []; const stack = [];
    lines.forEach((l, i) => {
        const m = rx.exec(l);
        if (!m) { errors.push(`ligne ${i + 1} illisible : ${JSON.stringify(l.slice(0, 80))}`); return; }
        const node = {level: +m[1], xref: m[2] || null, tag: m[3], value: m[4] ?? '', children: [], line: i + 1};
        if (node.level > stack.length) { errors.push(`ligne ${i + 1} : niveau ${node.level} après le niveau ${stack.length - 1}`); return; }
        stack.length = node.level;
        if (node.level === 0) root.push(node); else stack[node.level - 1].children.push(node);
        stack.push(node);
    });
    return {lines, root};
}

function gedcom7Errors(text) {
    const R = loadRules();
    const errors = [];
    if (/\0/.test(text)) errors.push('octet nul');
    const {root} = parseLines(text, errors, true);
    if (!root.length || root[0].tag !== 'HEAD') errors.push('le fichier ne commence pas par « 0 HEAD »');
    if (!root.length || root[root.length - 1].tag !== 'TRLR') errors.push('le fichier ne finit pas par « 0 TRLR »');
    const head = root[0] || {children: []};
    const vers = head.children.find(c => c.tag === 'GEDC')?.children.find(c => c.tag === 'VERS')?.value;
    if (!/^7\.0(\.\d+)?$/.test(vers || '')) errors.push(`HEAD.GEDC.VERS vaut « ${vers} », pas 7.0`);
    const declared = new Set((head.children.find(c => c.tag === 'SCHMA')?.children || []).filter(c => c.tag === 'TAG').map(c => c.value.split(' ')[0]));
    const xrefs = new Map();
    for (const r of root) { if (r.xref) { if (xrefs.has(r.xref)) errors.push(`@${r.xref}@ défini deux fois`); xrefs.set(r.xref, r); } }
    const recordUri = new Map([...R.sub.get('')].map(([t, u]) => [t, u]));
    const undeclared = new Set();
    const check = (node, uri, where) => {
        const at = `${where}.${node.tag} (ligne ${node.line})`;
        const p = R.payload.get(uri) ?? '';
        const v = node.value;
        // CONT fait partie de la valeur : retiré avant de contrôler les sous-structures
        if (p === '') { if (v !== '') errors.push(`${at} : valeur « ${v.slice(0, 40)} » interdite (aucune valeur attendue)`); }
        else if (p === 'Y|<NULL>') { if (v !== '' && v !== 'Y') errors.push(`${at} : valeur « ${v} » (seulement Y ou rien)`); }
        else if (p.startsWith('@<')) {
            const want = p.slice(2, -2); const pm = /^@([A-Z0-9_]+)@$/.exec(v);
            if (!pm) errors.push(`${at} : « ${v} » n'est pas un pointeur`);
            else if (pm[1] !== 'VOID') { const r = xrefs.get(pm[1]); if (!r) errors.push(`${at} : @${pm[1]}@ ne mène à rien`); else if (recordUri.get(r.tag) !== want && !r.tag.startsWith('_')) errors.push(`${at} : @${pm[1]}@ est un ${r.tag}, pas un ${want.split('-').pop()}`); }
        } else if (v.startsWith('@') && !v.startsWith('@@')) { errors.push(`${at} : texte qui commence par une seule « @ » (« @@ » attendu)`); }
        else if (p.endsWith('nonNegativeInteger')) { if (!/^\d+$/.test(v)) errors.push(`${at} : « ${v} » n'est pas un entier`); }
        else if (p.endsWith('type-Enum')) { const set = R.enumValues.get(R.enumSetOf.get(uri)); if (!set?.has(v) && !/^_[A-Z0-9_]+$/.test(v)) errors.push(`${at} : « ${v} » n'est pas une valeur permise (${[...(set || [])].slice(0, 8).join(', ')}…)`); }
        else if (p.endsWith('type-List#Enum')) { const set = R.enumValues.get(R.enumSetOf.get(uri)); for (const x of v.split(/\s*,\s*/)) if (!set?.has(x) && !/^_[A-Z0-9_]+$/.test(x)) errors.push(`${at} : « ${x} » n'est pas une valeur permise`); }
        else if (p.endsWith('type-Date')) { if (!date7Ok(v)) errors.push(`${at} : date « ${v} » hors grammaire GEDCOM 7`); }
        else if (p.endsWith('type-Date#exact')) { if (!date7Ok(v, 'exact')) errors.push(`${at} : date exacte « ${v} » attendue`); }
        else if (p.endsWith('type-Date#period')) { if (!date7Ok(v, 'period')) errors.push(`${at} : période « ${v} » attendue`); }
        else if (p.endsWith('type-Time')) { if (!/^\d\d?:\d\d(:\d\d(\.\d+)?)?Z?$/.test(v)) errors.push(`${at} : heure « ${v} »`); }
        else if (p.endsWith('type-Age')) { if (!/^(?:[<>] )?(?:\d+y(?: \d+m)?(?: \d+w)?(?: \d+d)?|\d+m(?: \d+w)?(?: \d+d)?|\d+w(?: \d+d)?|\d+d)?$/.test(v)) errors.push(`${at} : âge « ${v} »`); }
        else if (p.endsWith('#Language')) { if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(v)) errors.push(`${at} : langue « ${v} » (BCP 47 attendu, « fr »)`); }
        else if (p.endsWith('dcat#mediaType')) { if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+(;.*)?$/i.test(v)) errors.push(`${at} : type de fichier « ${v} » (« image/jpeg » attendu)`); }
        else if (p.endsWith('type-Latitude')) { if (!/^[NS]\d{1,2}(\.\d+)?$/.test(v)) errors.push(`${at} : latitude « ${v} »`); }
        else if (p.endsWith('type-Longitude')) { if (!/^[EW]\d{1,3}(\.\d+)?$/.test(v)) errors.push(`${at} : longitude « ${v} »`); }
        else if (p.endsWith('type-TagDef')) { if (!/^_[A-Z0-9_]+ \S+$/.test(v)) errors.push(`${at} : déclaration « ${v} »`); }
        const allowed = R.sub.get(uri) || new Map();
        const counts = new Map();
        for (const c of node.children) {
            if (c.tag === 'CONC') { errors.push(`${at} : CONC n'existe plus en GEDCOM 7 (ligne ${c.line})`); continue; }
            if (c.tag === 'CONT') { if (p === '' || p.startsWith('@<') || p === 'Y|<NULL>') errors.push(`${at} : CONT sous une valeur qui n'est pas un texte`); if (c.children.length) errors.push(`CONT ligne ${c.line} avec des sous-structures`); continue; }
            if (c.tag.startsWith('_')) { if (!declared.has(c.tag)) undeclared.add(c.tag); continue; } // extension : son contenu ne se contrôle pas
            const cu = allowed.get(c.tag);
            if (!cu) { errors.push(`${at} : ${c.tag} n'est pas permis ici (ligne ${c.line})`); continue; }
            counts.set(cu, (counts.get(cu) || 0) + 1);
            check(c, cu, `${where}.${node.tag}`);
        }
        for (const [cu, {min, max}] of R.card.get(uri) || []) {
            const n = counts.get(cu) || 0;
            if (n < min) errors.push(`${at} : ${cu.replace(V, '')} manque (au moins ${min})`);
            if (n > max) errors.push(`${at} : ${cu.replace(V, '')} ${n} fois (au plus ${max})`);
        }
    };
    for (const r of root) {
        if (r.tag.startsWith('_')) { if (!declared.has(r.tag)) undeclared.add(r.tag); continue; }
        const uri = recordUri.get(r.tag);
        if (!uri) { errors.push(`enregistrement ${r.tag} inconnu (ligne ${r.line})`); continue; }
        if (['HEAD', 'TRLR'].includes(r.tag) && r.xref) errors.push(`${r.tag} ligne ${r.line} : identifiant en trop`);
        check(r, uri, '');
    }
    for (const t of undeclared) errors.push(`balise d'extension ${t} non déclarée dans HEAD.SCHMA`);
    return errors;
}

function gedcom551Errors(text) {
    const errors = [];
    const {lines, root} = parseLines(text, errors, false);
    lines.forEach((l, i) => { if (Buffer.byteLength(l, 'utf8') > 255) errors.push(`ligne ${i + 1} : ${Buffer.byteLength(l, 'utf8')} octets (255 au plus en 5.5.1)`); });
    const head = root[0];
    if (!head || head.tag !== 'HEAD') errors.push('le fichier ne commence pas par « 0 HEAD »');
    if (!root.length || root[root.length - 1].tag !== 'TRLR') errors.push('pas de « 0 TRLR » à la fin');
    const kid = (n, t) => n?.children.find(c => c.tag === t);
    if (head) {
        if (!kid(head, 'SOUR')?.value) errors.push('HEAD.SOUR manque');
        if (!/^5\.5(\.1)?$/.test(kid(kid(head, 'GEDC'), 'VERS')?.value || '')) errors.push('HEAD.GEDC.VERS n\'est pas 5.5.1');
        if (kid(kid(head, 'GEDC'), 'FORM')?.value !== 'LINEAGE-LINKED') errors.push('HEAD.GEDC.FORM LINEAGE-LINKED manque');
        if (!['ANSEL', 'UTF-8', 'UNICODE', 'ASCII'].includes(kid(head, 'CHAR')?.value)) errors.push('HEAD.CHAR manque ou inconnu');
        if (!/^@[^@]+@$/.test(kid(head, 'SUBM')?.value || '')) errors.push('HEAD.SUBM manque (obligatoire en 5.5.1)');
    }
    const xrefs = new Map();
    for (const r of root) { if (r.xref) { if (xrefs.has(r.xref)) errors.push(`@${r.xref}@ défini deux fois`); xrefs.set(r.xref, r.tag); } }
    const subm = kid(head, 'SUBM')?.value?.slice(1, -1);
    if (subm && xrefs.get(subm) !== 'SUBM') errors.push('HEAD.SUBM ne mène pas à un enregistrement SUBM');
    const ptr = {FAMC: 'FAM', FAMS: 'FAM', HUSB: 'INDI', WIFE: 'INDI', CHIL: 'INDI', REPO: 'REPO', ASSO: 'INDI'};
    const walk = (n, recTag) => {
        for (const c of n.children) {
            const m = /^@([^@]+)@$/.exec(c.value);
            if (m) {
                const t = xrefs.get(m[1]);
                if (!t) errors.push(`ligne ${c.line} : @${m[1]}@ ne mène à rien`);
                else if (ptr[c.tag] && ptr[c.tag] !== t) errors.push(`ligne ${c.line} : ${c.tag} pointe vers un ${t}`);
                else if (c.tag === 'SOUR' && t !== 'SOUR') errors.push(`ligne ${c.line} : SOUR pointe vers un ${t}`);
                else if (c.tag === 'OBJE' && t !== 'OBJE') errors.push(`ligne ${c.line} : OBJE pointe vers un ${t}`);
            } else if (c.value.startsWith('@') && !c.value.startsWith('@@') && !c.value.startsWith('@#D')) errors.push(`ligne ${c.line} : « @ » seule au début d'un texte`);
            if (['CONC', 'CONT'].includes(c.tag) && c.children.length) errors.push(`ligne ${c.line} : ${c.tag} avec des sous-structures`);
            walk(c, recTag);
        }
    };
    for (const r of root) {
        walk(r, r.tag);
        if (r.tag === 'OBJE' && r.xref) {
            const file = kid(r, 'FILE');
            if (!file) errors.push(`OBJE @${r.xref}@ sans FILE`);
            else if (!kid(file, 'FORM')) errors.push(`OBJE @${r.xref}@ : FILE sans FORM`);
            if (kid(r, 'TITL')) errors.push(`OBJE @${r.xref}@ : TITL doit être sous FILE en 5.5.1`);
        }
    }
    return errors;
}

module.exports = {gedcom7Errors, gedcom551Errors, date7Ok};
