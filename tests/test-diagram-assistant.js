'use strict';
/**
 * 💬 « Je veux représenter… » (assets/js/heritage-diagram-assistant.js) : la phrase comprise (sujet, envie, années, siècle, lieu, nom, sexe),
 * 3 diagrammes faits sur une petite base fictive (MAZAUD, LACOMBE, DURAND), qui se dessinent ; une phrase incomprise le dit.
 * Puis dans l'app : la galerie « Nouveau diagramme » propose, « Faire ce diagramme » ouvre l'éditeur avec ces données.
 *     node tests/test-diagram-assistant.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const BAD = /NaN|undefined|Infinity|Dessin impossible/;
const P = [[1, 'Pierre', 'MAZAUD', 'm', 1750, 1810, 10, 10, 'vers 1750', '3 mars 1810', 'Cultivateur'], [2, 'Marie', 'LACOMBE', 'f', 1755, 1820, 11, 10, 'avant 1756', '14 juillet 1820', ''], [3, 'Jean', 'MAZAUD', 'm', 1780, 1850, 10, 12, '12 janvier 1780', 'entre 1849 et 1851', 'Porteur d’eau'],
    [4, 'Anne', 'DURAND', 'f', 1785, 1860, 12, 12, '3 février 1785', '', ''], [5, 'Jean', 'MAZAUD', 'm', 1810, 1880, 12, 12, '5 août 1810', '', 'Marchand'], [6, 'Louise', 'MAZAUD', 'f', 1812, 1813, 12, 12, '2 mai 1812', '1813', ''], [7, 'Paul', 'DURAND', 'm', 1840, 1915, 13, 12, '1840', '1915', 'Maçon']];
const D = {people: P.map(([id, f, l, g, by, dy, bp, dp, bt, dt, occ]) => ({id, f, l, g, by, dy, bp, dp, bt, dt, occ})), places: {10: ['Aurillac', 44.93, 2.44], 11: ['Mauriac', 45.22, 2.33], 12: ['Paris', 48.86, 2.35], 13: ['Lyon', 45.76, 4.84]}, events: [], couples: [[1, 2, 1778, 10], [3, 4, 1808, 12]], root: 5};
D.byId = new Map(D.people.map(p => [p.id, p]));
const sb = {window: {}, console, setTimeout, clearTimeout, Intl, document: {addEventListener() {}, querySelectorAll: () => [], getElementById: () => ({}), createElement: () => ({}), head: {appendChild() {}}}};
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-cartes.js', 'heritage-diagram-manquants.js', 'heritage-diagram-assistant.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, AS = ext.diagramAssistant;

(async () => {
    await t('la phrase comprise : sujet, envie, années, siècle, lieu de la base, nom, sexe', () => {
        const a = AS.parse('D’où venaient les gens nés à Paris entre 1800 et 1850 ?', D); same([a.subject, a.from, a.to, a.place], ['origins', 1800, 1850, 'Paris']);
        const b = AS.parse('L’âge au décès selon le siècle', D); assert.equal(b.subject, 'agedeath');
        const c = AS.parse('les naissances des hommes et des femmes au XIXe siècle', D); same([c.subject, c.from, c.to, c.intents.includes('compare')], ['births', 1801, 1900, true]);
        const d = AS.parse('Les prénoms les plus donnés chez les Mazaud', D); same([d.subject, d.surname, d.intents.includes('top')], ['firstnames', 'MAZAUD', true]);
        assert.equal(AS.parse('Les migrations de la famille', D).subject, 'migrations'); assert.equal(AS.parse('les mariages entre familles', D).subject, 'alliances');
        assert.equal(AS.parse('Les naissances selon le mois', D).subject, 'months'); assert.equal(AS.parse('à quel âge se mariait-on ?', D).subject, 'agemarriage');
        same([AS.parse('les décès des femmes depuis 1800', D).sex, AS.parse('les décès des femmes depuis 1800', D).from], ['f', 1800]);
    });
    await t('3 diagrammes faits sur la base, qui se dessinent sans NaN', () => {
        for (const q of ['L’âge au décès selon le siècle', 'Les prénoms les plus donnés dans ma famille', 'D’où venaient les gens', 'Les naissances des hommes et des femmes', 'Les migrations de la famille', 'Les mariages entre familles', 'Les naissances selon le mois', 'les vies de la famille', 'à quelle distance se mariait-on', 'les dates approchées', 'les métiers', 'les décès au XIXe siècle', 'à quel âge se mariait-on']) {
            const r = AS.suggest(q, D); assert.ok(r.items.length >= 1, `${q} : ${r.message}`); assert.ok(r.items.length <= 3);
            r.items.forEach(it => { assert.ok(R.KINDS[it.kind], it.kind); assert.ok(it.spec.o.title && it.reason, q); if (R.KINDS[it.kind].group === 'Cartes') { assert.ok(Object.keys(it.spec.places || {}).length, `${q} → ${it.kind} : des lieux`); return; } /* une carte charge son fond (navigateur) : vue plus bas */ const svg = R.svg(it.spec, 600); assert.doesNotMatch(svg, BAD, `${q} → ${it.kind}`); assert.ok(svg.length > 300, `${q} → ${it.kind}`); });
        }
    });
    await t('les filtres comptent : années, lieu, nom, sexe', () => {
        const line = AS.suggest('les naissances entre 1780 et 1815', D).items.find(i => i.kind === 'line'); same(line.spec.rows.map(r => [r.label, r.s0]), [['1780', 2], ['1790', 0], ['1800', 0], ['1810', 2]]);
        const pr = AS.suggest('les prénoms des Mazaud', D).items.find(i => i.kind === 'bars'); same(pr.spec.rows[0], {label: 'Jean', s0: 2});
        const mig = AS.suggest('les migrations', D).items.find(i => i.kind === 'flowmap'); assert.ok(mig.spec.rows.some(r => r.from === 'Aurillac' && r.to === 'Paris')); assert.ok(mig.spec.places.paris && mig.spec.places.aurillac);
        const fem = AS.suggest('l’âge au décès des femmes', D).items.find(i => i.kind === 'density'); assert.equal(fem.spec.rows.length, 3); // Marie, Anne, Louise
    });
    await t('une phrase incomprise : un message et des exemples, aucun diagramme', () => {
        const r = AS.suggest('bonjour la météo', D); assert.equal(r.items.length, 0); assert.match(r.message, /pas compris/);
    });
    console.log(failed ? `${failed} essai(s) en échec` : '« Je veux représenter… » marche.');
    process.exit(failed ? 1 : 0);
})();
