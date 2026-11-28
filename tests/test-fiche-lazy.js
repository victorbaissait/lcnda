#!/usr/bin/env node
/* ⏱ La fiche se charge à mesure qu'on la lit (assets/js/app-fiche-lazy.js, branché dans app.js : renderPerson) :
 *  - les blocs loin de l'écran attendent (en-tête gardé, contenu sorti de la page) ; ceux du premier écran, l'identité et les événements
 *    sont là tout de suite ;
 *  - moins de demandes au serveur à l'ouverture qu'en chargeant tout (LCNDA_SHEET_LAZY_OFF) ;
 *  - un bloc qui arrive à l'écran revient, et les modules qui le remplissent (ext.afterPerson) le remplissent, lui seul ;
 *  - ⌘F (Ctrl+F) et l'impression ramènent toute la fiche ; une adresse de section (#personnes/1/documents) ramène ses blocs ;
 *  - aucune erreur JavaScript.
 *   node tests/test-fiche-lazy.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const openCounting = async (off) => {
        let n = 0; const on = r => { if (/api\.php/.test(r.url()) && !/save_settings/.test(r.url())) n++; };
        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 0; A.setModule('dashboard'); }); await sleep(500);
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_SHEET_LAZY); await sleep(2500); // une page neuve : rien de gardé en mémoire d'une ouverture à l'autre
        await p.evaluate(o => { window.LCNDA_SHEET_LAZY_OFF = o; }, off);
        p.on('request', on);
        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
        await p.waitForSelector('#workspace .person-page [data-pblock]'); await sleep(6000);
        p.off('request', on); return n;
    };
    try {
        let nAll = 0, nLazy = 0;
        await t('moins de demandes au serveur qu’en chargeant toute la fiche', async () => {
            nLazy = await openCounting(false); nAll = await openCounting(true); await openCounting(false);
            console.log(`   demandes à l’ouverture : ${nAll} (tout) → ${nLazy} (à mesure)`);
            assert.ok(nLazy < nAll * 0.85, `${nLazy} / ${nAll}`);
        });
        await t('les blocs loin de l’écran attendent ; le premier écran, l’identité et les événements sont là', async () => {
            const r = await p.evaluate(() => { const L = window.LCNDA_SHEET_LAZY; const all = [...document.querySelectorAll('#workspace [data-pblock]')];
                return {pending: L.pending(), lazyCore: all.filter(s => s.classList.contains('is-lazy') && ['identity', 'events'].includes(s.dataset.pblock)).map(s => s.dataset.pblock),
                    lazyNear: all.filter(s => { const r = s.getBoundingClientRect(); return s.classList.contains('is-lazy') && r.height > 0 && r.top < innerHeight && r.bottom > 0; }).map(s => s.dataset.pblock + ':' + Math.round(s.getBoundingClientRect().top) + (s.hidden ? ':caché' : '')),
                    heads: all.filter(s => s.classList.contains('is-lazy')).every(s => s.querySelector(':scope > header.card-head') && s.children.length === 1),
                    identity: !!document.querySelector('[data-pblock="identity"]:not(.is-lazy)'), events: !!document.querySelector('[data-pblock="events"]:not(.is-lazy) .event-row')}; });
            assert.ok(r.pending > 0, 'des blocs en attente');
            assert.deepStrictEqual(r.lazyCore, [], 'l’identité et les événements ne sont jamais en attente');
            assert.deepStrictEqual(r.lazyNear, [], 'rien n’attend sur le premier écran');
            assert.ok(r.heads, 'un bloc en attente garde son en-tête, rien d’autre');
            assert.ok(r.identity && r.events);
        });
        await t('un bloc qui arrive à l’écran revient et se remplit (sans refaire les autres)', async () => {
            const key = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-pblock].is-lazy:not([hidden])')].pop()?.dataset.pblock);
            assert.ok(key, 'un bloc en attente');
            const before = await p.evaluate(() => window.LCNDA_SHEET_LAZY.pending());
            await p.$eval(`[data-pblock="${key}"]`, e => e.scrollIntoView({block: 'center'}));
            await p.waitForFunction(k => !document.querySelector(`[data-pblock="${k}"]`).classList.contains('is-lazy'), key, {timeout: 5000});
            assert.ok(await p.$eval(`[data-pblock="${key}"]`, e => e.children.length > 1), 'son contenu est revenu');
            assert.ok(await p.evaluate(() => window.LCNDA_SHEET_LAZY.pending()) < before);
        });
        await t('⌘F (Ctrl+F) ramène toute la fiche', async () => {
            await p.$eval('#workspace .person-hero', e => e.scrollIntoView());
            await p.keyboard.press('Control+f'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_SHEET_LAZY.pending()), 0);
            await p.keyboard.press('Escape');
        });
        await t('un bloc qui se branche juste après son dessin (📚 Recueils) répond aussi quand il arrive plus tard', async () => {
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = false; const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('#workspace [data-pblock="recueils"]', {state: 'attached', timeout: 15000}); await sleep(800);
            await p.$eval('#workspace [data-pblock="recueils"]', e => e.scrollIntoView({block: 'center'}));
            await p.waitForSelector('#workspace [data-pblock="recueils"] [data-rc-attach]', {timeout: 10000});
            await p.click('#workspace [data-pblock="recueils"] [data-rc-attach]');
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => /Aucun recueil/.test(d.textContent)), null, {timeout: 10000});
            await p.keyboard.press('Escape');
        });
        await t('une adresse de section ramène ses blocs (#personnes/1/documents)', async () => {
            await p.evaluate(() => { location.hash = '#dashboard'; }); await sleep(800);
            await p.evaluate(() => { location.hash = '#personnes/1/documents'; });
            await p.waitForSelector('.fsec[data-fsec="s_docs"]', {timeout: 15000}); await sleep(1500);
            assert.strictEqual(await p.$$eval('.fsec[data-fsec="s_docs"] [data-pblock].is-lazy', x => x.length), 0);
        });
        await t('aucune erreur JavaScript', async () => assert.deepStrictEqual(B.errs, []));
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
