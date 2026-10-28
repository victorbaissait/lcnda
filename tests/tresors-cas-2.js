'use strict';
/** Les essais du lot 2 des Trésors (souvenirs, recettes, chansons, entretien, veillée, prénoms, pouvoir d'achat, vieux mots, quiz,
 *  faire-part, signatures, film, rideau, promenade, rappels, actes manquants, thème d'époque, bloc de la fiche) — appelés par tests/test-tresors.js */
/** l'impression passe par la fenêtre « Imprimer » de l'app (K13) : on lit son aperçu */
const printFrame = async page => { const fr = await (await page.waitForSelector('dialog.k-print[open] iframe', {timeout: 15000})).contentFrame(); return {waitForSelector: (...a) => fr.waitForSelector(...a), $$eval: (...a) => fr.$$eval(...a), content: () => fr.content(), close: () => page.click('dialog.k-print[open] [data-k-x]')}; };
module.exports = async (t, {page, open, body, pick: exportPick}, assert) => {
    const pick = async (name, label) => page.evaluate(([n, l]) => { const T = window.LCNDA_EXT.tresors.T; return T.tree().then(tr => { const p = tr.people.find(x => T.name(x) === l); const el = document.querySelector(`dialog[open] [name="${n}"]`); el.value = String(p.id); el.dispatchEvent(new Event('change', {bubbles: true})); }); }, [name, label]);
    await t('👃 souvenir des sens : noté, filtré par sens, retrouvé par un mot', async () => {
        await open('sens'); await page.click('[data-c-new]'); await page.waitForSelector('dialog[open] [name="title"]');
        await page.selectOption('dialog[open] [name="sense"]', 'odeur'); await page.fill('dialog[open] [name="title"]', 'L’odeur de la cire dans l’escalier');
        await pick('from', 'Marie DURAND'); await page.fill('dialog[open] [name="place"]', 'la maison de Naves'); await page.fill('dialog[open] [name="body"]', 'Chaque samedi, elle cirait les marches.');
        await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('[data-c-id]');
        let b = await body(); assert.match(b, /L’odeur de la cire/); assert.match(b, /ça rappelle Marie DURAND · la maison de Naves/);
        await page.selectOption('[data-c-f]', 'son'); await page.waitForTimeout(150); assert.ok(!(await body()).includes('L’odeur de la cire'));
        await page.selectOption('[data-c-f]', ''); await page.fill('[data-c-q]', 'samedi'); await page.waitForTimeout(150); assert.match(await body(), /1 sur 1/);
    });
    await t('🥘 livre de recettes : une recette, puis le livre imprimé (couverture, sommaire, page)', async () => {
        await page.evaluate(() => window.LCNDA_EXT.tresors.T.save({kind: 'recipe', title: 'Le clafoutis de Rose', body: 'Beurrer le plat, y mettre les cerises.', data: {from: 'txt:Rose', dish: 'dessert', serves: 'pour 6', ingredients: '500 g de cerises\n3 œufs', story: 'Le dimanche de juin.'}}));
        await open('recettes'); assert.match(await body(), /Le clafoutis de Rose[\s\S]*La recette de Rose[\s\S]*500 g de cerises/);
        await page.click('[data-c-book]'); const w = await printFrame(page); await w.waitForSelector('.pg');
        const html = await w.content(); assert.match(html, /Le livre de recettes/); assert.match(html, /Sommaire/); assert.match(html, /Desserts et gâteaux/); assert.match(html, /3 œufs/); await w.close();
    });
    await t('🎶 chansons : paroles, air, chantée par ; le carnet s’imprime', async () => {
        await page.evaluate(() => window.LCNDA_EXT.tresors.T.save({kind: 'song', title: 'Dodo, l’enfant do', body: 'Dodo, l’enfant do,\nL’enfant dormira bien vite', data: {from: 'txt:Mémé Berthe', occasion: 'berceuse', tune: 'traditionnel'}}));
        await open('chansons'); assert.match(await body(), /Chantée par Mémé Berthe, sur l’air de « traditionnel »/);
        await page.click('[data-c-book]'); const w = await printFrame(page); await w.waitForSelector('.pg'); assert.match(await w.content(), /Le carnet de chansons[\s\S]*Berceuses/); await w.close();
    });
    await t('🎙️ entretien guidé : les questions défilent (sans micro), les repères et les notes sont gardés', async () => {
        await open('entretien'); await page.uncheck('[data-iv-form] [name="rec"]'); await page.uncheck('[data-iv-form] [name="speak"]');
        await page.click('[data-tr-page] .page-header [data-iv-go]'); await page.waitForSelector('.h-tr-ivq');
        const q1 = await page.textContent('.h-tr-ivq'); assert.match(q1, /Où es-tu né/);
        await page.fill('[data-iv-note]', 'À Tulle, rue de la Barrière'); await page.click('[data-iv-next]'); await page.waitForTimeout(100);
        assert.notEqual(await page.textContent('.h-tr-ivq'), q1); await page.click('[data-iv-stop]'); await page.waitForSelector('[data-iv-item]');
        const b = await body(); assert.match(b, /Entretien/); assert.match(b, /À Tulle, rue de la Barrière/); assert.match(b, /Sans enregistrement/);
    });
    await t('🕯️ veillée : les diapositives racontent les ancêtres de Léa dans l’ordre, en plein écran', async () => {
        const s = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => window.LCNDA_EXT.tresorVeillee.slides(T, tr, T.start(tr).id, 'asc', 4).map(x => [x.title, x.text, x.sub || ''])); });
        assert.match(s[0][0], /La veillée de la famille MARTIN/); assert.equal(s[1][0], 'Pierre FAURE'); assert.match(s.find(x => x[0] === 'Antoine MARTIN')[1], /Il était sabotier\. Il a épousé Marie DURAND le 20 mai 1876 à Naves/);
        assert.match(s.find(x => x[0] === 'Antoine MARTIN')[2], /arrière-arrière-grand-père de Léa/);
        await open('veillee'); await page.uncheck('[data-vl-form] [name="voice"]'); await page.uncheck('[data-vl-form] [name="music"]'); await page.click('[data-tr-page] .page-header [data-vl-go]');
        await page.waitForSelector('.h-tr-veillee h2'); assert.match(await page.textContent('.h-tr-veillee h2'), /La veillée/);
        await page.click('.h-tr-veillee [data-vl="next"]'); await page.waitForTimeout(100); assert.equal(await page.textContent('.h-tr-veillee h2'), 'Pierre FAURE');
        await page.click('.h-tr-veillee [data-vl="close"]'); await page.waitForTimeout(100); assert.equal(await page.$('.h-tr-veillee'), null);
    });
    await t('👶 prénoms qui sautent une génération : Henri (1994), comme son grand-père Henri', async () => {
        await open('prenoms-sauts'); const b = await body(); assert.match(b, /Henri MARTIN \(1994\), comme son grand-père Henri MARTIN \(1905\)/); assert.match(b, /MARTIN/);
    });
    await t('💰 pouvoir d’achat : 100 francs de 1900 ≈ 400 € et ≈ 300 kg de pain ; la dot de 1200 francs de l’arbre est convertie', async () => {
        await open('pouvoir-achat'); const w = await page.evaluate(() => window.LCNDA_EXT.tresorMoney.worth(100, 'livre', 1900));
        assert.ok(w.euros > 350 && w.euros < 450, `${w.euros} €`); assert.ok(w.bread > 250 && w.bread < 330, `${w.bread} kg`); assert.ok(w.days > 20 && w.days < 60, `${w.days} j`);
        const b = await body(); assert.match(b, /En euros d’aujourd’hui/); assert.match(b, /1200 francs en 1876 — Antoine MARTIN|1200 francs en 1876/);
        const e = await page.evaluate(() => window.LCNDA_EXT.tresorMoney.worth(10, 'euro', 2025)); assert.ok(Math.abs(e.euros - 10) < 0.01);
    });
    await t('📜 vieux mots : l’acte collé est surligné, les mots expliqués', async () => {
        await open('vieux-mots'); await page.fill('[data-w-in]', 'A été baptisé Jean, fils légitime de feu Antoine Martin, laboureur, le 3 brumaire an II. Louise, marraine.');
        await page.waitForTimeout(150); const marks = await page.$$eval('mark.h-tr-word', l => l.map(m => m.textContent.toLowerCase()));
        ['feu', 'laboureur', 'brumaire', 'marraine'].forEach(w => assert.ok(marks.includes(w), `${w} dans ${marks}`)); assert.ok(!marks.includes('louise'));
        assert.match(await body(), /laboureur — paysan qui possède charrue/);
    });
    await t('📺 quiz du repas : des questions de l’arbre, la réponse, les points des équipes', async () => {
        const qs = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => window.LCNDA_EXT.tresorQuiz.quizQuestions(T, tr, 10, 42)); });
        assert.equal(qs.length, 10); qs.forEach(q => { assert.ok(q.options.length >= 2); assert.ok(q.answer >= 0 && q.answer < q.options.length); });
        await open('quiz-tv'); await page.fill('[data-qz-form] [name="teams"]', 'Rouges, Bleus'); await page.fill('[data-qz-form] [name="sec"]', '0'); await page.click('[data-tr-page] .page-header [data-qz-go]');
        await page.waitForSelector('.h-tr-qz h2'); await page.keyboard.press('Enter'); await page.waitForSelector('.h-tr-qz-opt.is-good');
        await page.keyboard.press('2'); await page.waitForTimeout(80); assert.match(await page.textContent('.h-tr-qz-score'), /Bleus 1/);
        await page.keyboard.press('Escape'); await page.waitForTimeout(80); assert.equal(await page.$('.h-tr-quiz'), null);
    });
    await t('💌 faire-part : le mariage de Jean et Louise (parents, date, lieu), en PNG', async () => {
        await open('faire-part'); await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('[data-fp] [name="who"]'); el.value = String(tr.people.find(p => T.name(p) === 'Jean MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        await page.waitForTimeout(100); const evs = await page.$$eval('[data-fp] [name="ev"] option', l => l.map(o => o.value)); const m = evs.find(v => v.startsWith('m'));
        await page.selectOption('[data-fp] [name="ev"]', m); await page.waitForTimeout(100);
        const txt = await page.inputValue('[data-fp] [name="txt"]'); assert.match(txt, /Antoine MARTIN et Marie DURAND/); assert.match(txt, /Pierre FAURE et Jeanne BORIE/); assert.match(txt, /\* Jean & Louise/); assert.match(txt, /célébré le 15 juin 1903 à Paris/);
        assert.match(await page.$eval('[data-fp-out] svg', s => s.outerHTML), /Jean &amp; Louise/);
        const dl = page.waitForEvent('download'); await exportPick('Image PNG'); const d = await dl; assert.match(d.suggestedFilename(), /faire-part-jean\.png/);
        // plus d'options : format carré, écriture, couleurs, photo ; puis 📐 la mise en page
        await page.selectOption('[data-fp] [name="st"]', 'royal'); await page.selectOption('[data-fp] [name="format"]', 'carre'); await page.selectOption('[data-fp] [name="font"]', 'script'); await page.selectOption('[data-fp] [name="align"]', 'gauche');
        let svg = await page.$eval('[data-fp-out] svg', s => s.outerHTML); assert.match(svg, /viewBox="0 0 720 720"/); assert.match(svg, /Brush Script/); assert.match(svg, /fill="#14244a"/); assert.match(svg, /text-anchor="start"/);
        await page.check('[data-fp] [name="colors"]'); await page.$eval('[data-fp] [name="bg"]', i => { i.value = '#ffeedd'; i.dispatchEvent(new Event('input', {bubbles: true})); }); assert.match(await page.$eval('[data-fp-out] svg', s => s.outerHTML), /fill="#ffeedd"/);
        await page.uncheck('[data-fp] [name="colors"]'); await page.selectOption('[data-fp] [name="format"]', 'a6'); await page.selectOption('[data-fp] [name="align"]', 'centre'); await page.selectOption('[data-fp] [name="font"]', 'style');
        await exportPick('mise en page'); await page.waitForSelector('.ly-item.ly-frame', {timeout: 10000}); assert.ok(await page.$('.ly-item.ly-frame image, .ly-item.ly-frame img'), 'le faire-part dans un cadre de la mise en page');
        await page.keyboard.press('Escape'); await page.waitForTimeout(300); const left = await page.$('dialog[open] .ly-item'); if (left) await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        // un décès : « dans sa 71e année », « De la part de »
        const dz = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => window.LCNDA_EXT.tresorCard.announce(T, tr, tr.people.find(p => T.name(p) === 'Antoine MARTIN'), 'd')); });
        assert.equal(dz.style, 'deuil'); assert.match(dz.lines.map(l => l.t).join(' | '), /survenu le 2 mai 1920 à Naves, dans sa 71e année[\s\S]*Madame Marie DURAND, son épouse[\s\S]*Jean MARTIN, Paul MARTIN, ses enfants/);
    });
    await t('✍️ mur des signatures : la signature de Jean MARTIN (1903), découpée, à la Belle Époque', async () => {
        await open('signatures'); await page.waitForSelector('.h-tr-sig canvas'); const b = await body(); assert.match(b, /La Belle Époque/); assert.match(b, /Jean MARTIN · 1903/);
        const w = await page.$eval('.h-tr-sig canvas', c => c.width); assert.ok(w > 50);
    });
    await t('🎞️ film des migrations : les parcours, une image par année, et la vidéo WebM', async () => {
        const tk = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const t = window.LCNDA_EXT.tresorFilm.tracks(T, tr).find(x => T.name(x.p) === 'Jean MARTIN'); return {steps: t.steps.map(s => [s.y, s.place]), at: window.LCNDA_EXT.tresorFilm.where(t, 1902.5)}; }); });
        assert.deepEqual(tk.steps.map(s => s[1]), ['Naves', 'Paris']); assert.ok(tk.at.moving, 'en route vers Paris en 1902');
        await open('film-migrations'); await page.selectOption('[data-fm-bg]', 'grid'); await page.waitForTimeout(300);
        const blob = await page.evaluate(async () => { const b = await window.LCNDA_EXT.tresorFilm.record(1.5); return b ? b.size : 0; }); assert.ok(blob > 1000, `${blob} octets`);
    });
    await t('🪟 hier / aujourd’hui : les tuiles Cassini et d’aujourd’hui, le rideau glisse', async () => {
        await open('hier-aujourdhui'); const n = await page.$$eval('[data-cu-then] img', l => l.filter(i => /CASSINI/.test(i.src)).length); assert.ok(n > 0);
        const box = await page.$('[data-cu]'), r = await box.boundingBox(); await page.mouse.click(r.x + r.width * 0.25, r.y + r.height / 2);
        assert.match(await page.$eval('[data-cu-then]', e => e.style.clipPath), /inset\(0(px)? 7[45]/);
    });
    await t('🚶 promenade : Naves puis Paris, avec la distance et le texte de chaque étape', async () => {
        await open('promenade'); await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('[data-wk] [name="who"]'); el.value = String(tr.people.find(p => T.name(p) === 'Jean MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        await page.waitForTimeout(150); const b = await body(); assert.match(b, /Naves[\s\S]*Ici est né Jean MARTIN, le 12 mars 1877[\s\S]*Paris[\s\S]*km depuis l’étape d’avant[\s\S]*a épousé Louise FAURE[\s\S]*est mort Jean MARTIN/);
    });
    await t('⏰ rappels de recherche : les branches de Léa et un rappel créé dans les rappels de l’application', async () => {
        await open('rappels'); await page.selectOption('[data-rm-min]', '0'); await page.waitForTimeout(100); assert.match(await body(), /Branche MARTIN \(Henri\)/);
        await page.click('[data-rm-add]'); await page.waitForSelector('dialog[open] [name="due"]'); await page.click('dialog[open] button[type="submit"]'); await page.waitForTimeout(400);
        const r = await page.evaluate(() => window.LCNDA_APP.api('list', {type: 'reminders'}).catch(e => ({error: e.message}))); assert.match(JSON.stringify(r), /Reprendre la branche/);
    });
    await t('🏛️ actes manquants : le raccourci vers l’assistant de Recherche', async () => {
        await open('actes-manquants'); assert.match(await body(), /Que manque-t-il/); await page.click('[data-gp-go]'); await page.waitForFunction(() => window.LCNDA_APP.state.module === 'recherche');
    });
    await t('🎩 thème d’époque et ✨ bloc de la fiche : la fiche de Marie DURAND (née en 1855) en sépia du XIXe, avec son souvenir', async () => {
        await open('theme-epoque'); await page.check('[data-era-on]');
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => T.openPerson(tr.people.find(p => T.name(p) === 'Marie DURAND').id)); });
        await page.waitForSelector('#workspace .person-page[data-tr-era]', {timeout: 15000}); assert.equal(await page.$eval('#workspace .person-page', e => e.dataset.trEra), 'sepia');
        await page.waitForSelector('[data-tr-block] .h-tr-bk'); assert.match(await page.textContent('[data-tr-block]'), /Souvenirs des sens[\s\S]*L’odeur de la cire/);
        await page.evaluate(() => localStorage.setItem('lcnda-tr-era', '0'));
    });
};
