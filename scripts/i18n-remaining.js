#!/usr/bin/env node
/* 🌐 Reconnaître un texte français resté tel quel à l'écran dans une autre langue (pour tests/test-i18n.js et les sondes).
 *   const R = require('./scripts/i18n-remaining.js'); const isFr = R.make('de'); isFr('Tableau de bord') → true
 * Un texte est « resté en français » s'il est (avec ou sans symbole devant) un texte français du code (i18n-extract)
 * pas traduit dans cette langue, ou s'il contient des mots qui n'existent qu'en français (les, une, avec, pour…).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const X = require('./i18n-extract.js');
const ROOT = path.join(__dirname, '..');
const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
let bank = null;
function frenchBank() {
    if (bank) return bank;
    bank = new Set();
    const files = [...X.filesOf(path.join(ROOT, 'assets/js')), path.join(ROOT, 'index.php')];
    for (const f of files) { if (/app-i18n\.js$/.test(f)) continue; try { X.textsOfFile(f).forEach(x => bank.add(norm(x.text))); } catch (_) {} }
    return bank;
}
const MARKERS = /(^|[\s(«"'’])(les|une|avec|pour|dans|sur|tes|aucun|aucune|déjà|très|être|cette|ces|vos|votre|ici|aussi|encore|toutes)(?=$|[\s,.;:!?)»"'])/i;
const ELISION = /(^|[\s(«])([lL]|[dD]|qu|Qu|n|j|s)’[a-zàâéèêëîïôûùüœ]/;
function make(lang) {
    const dict = X.loadDict(lang), B = frenchBank();
    const core = s => { const lead = (s.match(LEAD) || [''])[0], rest = s.slice(lead.length); return [rest, rest.replace(TRAIL, '')]; };
    return raw => {
        const s = norm(raw); if (!s || !/\p{L}{3}/u.test(s)) return false;
        const [rest, c] = core(s);
        const inBank = B.has(s) || B.has(rest) || B.has(c);
        if (inBank) { const v = dict[s] ?? dict[rest] ?? dict[c]; if (v == null) return true; const t = typeof v === 'string' ? v : (v.other || v.one); return t !== s && t !== rest && t !== c; }
        if (MARKERS.test(s)) return true;
        if (lang !== 'it' && ELISION.test(s)) return true;
        return false;
    };
}
module.exports = {make, frenchBank};
