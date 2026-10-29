'use strict';
/** Les essais du lot 6 des Trésors (passeports intérieurs, grand-parent raconte, cohérence en direct, partage temporaire, passeport des lieux,
 *  tour du monde, maisons dans le temps) — appelés par tests/test-tresors.js */
const fs = require('node:fs'), path = require('node:path');
module.exports = async (t, {page, open, body, tmp}, assert) => {
    const T = fn => page.evaluate(`(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => (${fn})(T, tr)); })()`);
    await t('🛂 passeports : la taille d’autrefois en cm, le portrait-robot suit le signalement', async () => {
        const h = await page.evaluate(() => ['1 m 65', '1,72', '1 mètre 650 millimètres', '5 pieds 2 pouces', '168'].map(window.LCNDA_EXT.tresorPassports.heightCm)); assert.deepEqual(h, [165, 172, 165, 168, 168]);
        const svg = await page.evaluate(() => window.LCNDA_EXT.tresorPassports.robotSvg({cheveux: 'roux', yeux: 'bleus', barbe: 'brune', signes: 'cicatrice à la joue'}));
        assert.match(svg, /#b5532a/); assert.match(svg, /#4a7fc0/); assert.match(svg, /opacity="\.92"/); assert.match(svg, /stroke="#8a3a2a"/);
    });
    await t('🛂 passeports : un passeport saisi pour Paul MARTIN, sur la page et dans le bloc de sa fiche', async () => {
        await open('passeports'); await page.click('[data-pp-new]'); await page.waitForSelector('dialog[open] [name="taille"]');
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('dialog[open] [name="who"]'); el.value = String(tr.people.find(p => T.name(p) === 'Paul MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        for (const [k, v] of [['date', '3 mai 1899'], ['commune', 'Tulle'], ['destination', 'Paris'], ['motif', 'travail'], ['taille', '1 m 68'], ['cheveux', 'châtains'], ['yeux', 'gris'], ['nez', 'aquilin'], ['barbe', 'naissante']]) await page.fill(`dialog[open] [name="${k}"]`, v);
        assert.ok(await page.$('dialog[open] [data-pp-robot] svg')); await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('.h-tr-pp');
        const b = await body(); assert.match(b, /Paul MARTIN[\s\S]*Délivré à Tulle le 3 mai 1899[\s\S]*pour Paris — travail/); assert.match(b, /168 cm/);
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => T.openPerson(tr.people.find(p => T.name(p) === 'Paul MARTIN').id)); });
        await page.waitForSelector('[data-pp-block] .h-tr-pp', {timeout: 15000}); assert.match(await page.textContent('[data-pp-block]'), /aquilin/);
    });
    await t('🛂 import d’un relevé : XML à enregistrements répétés et tableur XML ; Paul MARTIN rapproché (nom et âge)', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><passeports><passeport><nom>MARTIN</nom><prenom>Paul</prenom><age>25</age><taille>1 m 68</taille><cheveux>châtains</cheveux><yeux>gris</yeux><nez>aquilin</nez><profession>menuisier</profession><destination>Paris</destination><date_delivrance>12 mai 1904</date_delivrance><cote>2 I 14</cote></passeport>
            <passeport><nom>LE GOFF</nom><prenom>Yves</prenom><age>30</age><taille>1 m 60</taille><cheveux>noirs</cheveux><yeux>bleus</yeux><nez>moyen</nez><profession>marin</profession><destination>Brest</destination><date_delivrance>1834</date_delivrance><cote>2 I 15</cote></passeport></passeports>`;
        const file = path.join(tmp, 'passeports.xml'); fs.writeFileSync(file, xml);
        await open('passeports'); await page.click('[data-pp-imp]'); // la fenêtre d'import de l'application prend le relais
        await page.waitForSelector('dialog.k-import[open] input[type=file]', {state: 'attached'}); await page.setInputFiles('dialog.k-import[open] input[type=file]', file);
        await page.waitForSelector('dialog.k-import[open] [data-k-go]:not([disabled]):not([hidden])'); await page.click('dialog.k-import[open] [data-k-go]'); await page.waitForSelector('[data-pp-table]');
        const b = await body(); assert.match(b, /passeports\.xml : 2 passeports/); assert.match(b, /nom → nom/); assert.match(b, /1 correspondance possible/);
        await page.click('[data-pp-attach]'); await page.waitForTimeout(300);
        const it = await page.evaluate(() => window.LCNDA_APP.api('tresors', {kind: 'passport'})); const att = it.items.find(x => x.data?.releve === 'MARTIN Paul'); assert.ok(att, 'rattaché'); assert.equal(att.data.profession, 'menuisier'); assert.match(att.data.cote, /2 I 14 · passeports\.xml/);
        const ss = await page.evaluate(() => window.LCNDA_EXT.tresorPassports.parseRecords(`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table><Row><Cell><Data>Nom</Data></Cell><Cell><Data>Prénoms</Data></Cell><Cell><Data>Cheveux</Data></Cell></Row><Row><Cell><Data>FAURE</Data></Cell><Cell><Data>Pierre</Data></Cell><Cell><Data>gris</Data></Cell></Row></Table></Worksheet></Workbook>`, 'x.xml').records);
        assert.deepEqual(ss.map(r => [r.nom, r.prenom, r.cheveux]), [['FAURE', 'Pierre', 'gris']]);
    });
    await t('👵 grand-parent raconte : les faits du récit comparés à l’arbre, un domicile ajouté à la fiche', async () => {
        await open('raconte'); await page.fill('[data-rc-txt]', 'Mon père était ingénieur. Mon grand-père Henri est né en 1906 à Paris. Ma grand-mère Suzanne travaillait comme couturière. Ma mère habitait à Brive-la-Gaillarde avant la guerre.');
        await page.click('[data-rc-go]'); const b = await body();
        assert.match(b, /Métier — Claude MARTIN \(son père\) : ingénieur[\s\S]*concorde/); assert.match(b, /Naissance — Henri MARTIN[\s\S]*1906[\s\S]*l’arbre dit 1905/); assert.match(b, /couturière[\s\S]*l’arbre dit secrétaire/); assert.match(b, /Domicile — Anne MOREL[\s\S]*Brive-la-Gaillarde[\s\S]*pas encore sur la fiche/);
        const btns = await page.$$('[data-rc-add]'); let done = false; for (const bt of btns) { const li = await bt.evaluate(x => x.closest('li').textContent); if (/Domicile/.test(li)) { await bt.click(); done = true; break; } } assert.ok(done);
        await page.waitForTimeout(500); assert.match(await body(), /Domicile — Anne MOREL[\s\S]*ce lieu est déjà dans l’arbre/);
    });
    await t('⚠️ cohérence en direct : frère né à moins de 9 mois, mariage après la mort, lieu à plus de 300 km la même année — et dans la fenêtre d’événement', async () => {
        const r = await T(`(T, tr) => { const C = window.LCNDA_EXT.tresorChecks, id = n => tr.people.find(p => T.name(p) === n).id, f = tr.families.find(x => x.a === id('Antoine MARTIN')), paris = Object.entries(tr.places).find(([, p]) => p.name === 'Paris')[0];
            return [C.extraChecks(T, tr, {personId: id('Lucien MARTIN'), tag: 'BIRT', iso: '1905-12-01', year: 1905}), C.extraChecks(T, tr, {personId: id('Antoine MARTIN'), familyId: f.id, tag: 'MARR', year: 1925}), C.extraChecks(T, tr, {personId: id('Jean MARTIN'), tag: 'RESI', year: 1902, placeId: Number(paris)})]; }`);
        assert.match(r[0].join(), /Henri, son frère, est né le 30 août 1905 : moins de neuf mois/); assert.match(r[1].join(), /Antoine MARTIN est mort en 1920, avant ce mariage/); assert.match(r[2].join(), /à Naves, à 3\d\d km/);
        // dans la vraie fenêtre d'un événement (#event-form) : la naissance de Lucien le 1er décembre 1905
        const live = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => new Promise(res => { const f = document.getElementById('event-form'), birt = window.LCNDA_APP.state.bootstrap.eventTypes.find(x => x.gedcom_tag === 'BIRT').id;
            f.elements.person_id.value = tr.people.find(p => T.name(p) === 'Lucien MARTIN').id; if (![...f.elements.event_type_id.options].some(o => o.value === String(birt))) f.elements.event_type_id.add(new Option('Naissance', String(birt))); f.elements.event_type_id.value = String(birt); f.elements.date_text.value = '1 décembre 1905'; f.elements.date_text.dispatchEvent(new Event('input', {bubbles: true}));
            setTimeout(() => res(f.querySelector('#event-check-plus')?.textContent || ''), 900); })); });
        assert.match(live, /moins de neuf mois/);
    });
    await t('🔗 partage temporaire : un fichier chiffré, sans les vivants ; le bon mot de passe l’ouvre, la date passée le ferme', async () => {
        await open('partage'); await page.fill('[data-sh] [name="pw"]', 'cousin2026'); await page.selectOption('[data-sh] [name="scope"]', 'asc');
        assert.match(await body(), /\d+ personnes partagées · 3 retirées/);
        const dl = page.waitForEvent('download'); await page.click('[data-tr-page] .page-header [data-sh-go]'); assert.match((await dl).suggestedFilename(), /^partage-branche-jusqu-au-\d{4}-\d\d-\d\d\.html$/);
        const html = await page.evaluate(() => window.LCNDA_EXT.tresorShare.last); assert.ok(!/Antoine/.test(html), 'chiffré : aucun nom en clair');
        assert.ok(!/MARTIN/i.test(html), 'le titre (nom de famille) est chiffré lui aussi'); assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/, 'le fichier ne se connecte à rien'); assert.match(html, /"it":600000/, 'PBKDF2 600 000 tours');
        const pw = await page.evaluate(() => window.LCNDA_EXT.tresorShare.makePassword()); assert.match(pw, /^[a-z-]+-\d\d$/); assert.equal(await page.evaluate(p => window.LCNDA_EXT.tresorShare.strength(p)[0], pw), 'solide');
        const file = path.join(tmp, 'partage.html'); fs.writeFileSync(file, html); const p2 = await page.context().newPage(); await p2.goto('file://' + file); /* un vrai fichier : le chiffrement du navigateur y est permis */ await p2.fill('#pw', 'mauvais'); await p2.click('#f button'); await p2.waitForSelector('#e:not(:empty)');
        await p2.fill('#pw', 'cousin2026'); await p2.click('#f button'); await p2.waitForSelector('.p'); const txt = await p2.textContent('#l'); assert.match(txt, /Antoine MARTIN/); assert.match(txt, /Henri MARTIN/); assert.ok(!/Léa|Claude/.test(txt), 'ni Léa (vivante) ni Claude (né il y a moins de cent ans)');
        const old = await page.evaluate(() => window.LCNDA_EXT.tresorShare.shareHtml('x', Date.now() - 1000, {exp: Date.now() - 1000, people: []}, false)); fs.writeFileSync(file, old); await p2.goto('file://' + file); assert.match(await p2.textContent('#z'), /a expiré/); await p2.close();
    });
    await t('📍 passeport des lieux : un tampon par lieu, « J’y suis allé » colore Naves', async () => {
        await open('passeport-lieux'); assert.match(await body(), /0 \/ \d+ lieux visités/); await page.click('.h-tr-stampbtn:has-text("Naves")'); await page.waitForSelector('dialog[open] [name="note"]');
        await page.fill('dialog[open] [name="note"]', 'la tombe d’Antoine'); await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('.h-tr-stamp.is-visited'); assert.match(await body(), /1 \/ \d+ lieux visités[\s\S]*la tombe d’Antoine/);
    });
    await t('🌍 tour du monde : les kilomètres, le plus long voyage, le plus loin du berceau (Lyon)', async () => {
        await open('tour-du-monde'); const b = await body(); assert.match(b, /Tous ensemble[\s\S]*km/); assert.match(b, /Le plus long voyage/); assert.match(b, /Le plus loin du berceau \(Lyon\)/); assert.match(b, /Les grands voyageurs/);
        const s = await T('(T, tr) => window.LCNDA_EXT.tresorWorld.travelStats(T, tr).total'); assert.ok(s > 1000, `${s} km`);
    });
    await t('🏡 maisons dans le temps : Naves, de 1848 aux années 1940, sur plusieurs générations', async () => {
        await open('maisons'); const b = await body(); assert.match(b, /ans de présence de la famille/); assert.ok(await page.$$eval('.h-tr-houses rect', l => l.length) >= 3);
        const rows = await T('(T, tr) => window.LCNDA_EXT.tresorHouses.dwellers(T, tr, Number(Object.entries(tr.places).find(([, p]) => p.name === "Naves")[0])).map(r => T.name(r.p))'); assert.ok(rows.includes('Antoine MARTIN') && rows.includes('Marcel FAURE'), rows.join());
    });
};
