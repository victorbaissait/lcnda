const {start, sleep} = require('./prendre-depuis-seed.js');
(async () => {
  const B = await start(); const p = B.page;
  try {
    p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
    console.log('hidden?', await p.evaluate(() => [window.LCNDA_EXT.diagrammesOnglet.on(), getComputedStyle(document.querySelector('.nav-item[data-module=diagrammes]')).display]));
    await p.evaluate(() => window.LCNDA_EXT.diagrammesOnglet.setOn(true, {undo: false}));
    console.log('on?', await p.evaluate(() => [window.LCNDA_EXT.diagrammesOnglet.on(), getComputedStyle(document.querySelector('.nav-item[data-module=diagrammes]')).display]));
    await p.click('.nav-item[data-module=diagrammes]'); await sleep(1500);
    console.log(await p.evaluate(() => [location.hash, document.querySelector('#workspace')?.innerText.slice(0, 300), document.querySelector('#sidebar-content')?.innerText.slice(0, 300)]));
    await p.click('#workspace [data-dgo-new]'); await sleep(800);
    await p.click('[data-dgo-door=gal]'); await sleep(1500);
    console.log(await p.evaluate(() => [location.hash, document.querySelectorAll('#workspace .h-dg-tile').length]));
    await p.click('#workspace .h-dg-tile'); await sleep(2500);
    console.log(await p.evaluate(() => [location.hash, !!document.querySelector('#workspace .h-dg-inline'), document.querySelector('#workspace [data-ui-status]')?.textContent, document.querySelector('#workspace [data-dg-crumb]')?.textContent]));
    await p.fill('#workspace [data-dg-name]', 'Pyramide des MAZAUD'); await sleep(1800);
    console.log(await p.evaluate(async () => [(await window.LCNDA_APP.api('diagrams')).diagrams.map(d => d.name), document.querySelector('#workspace [data-ui-status]')?.textContent, document.querySelector('[data-dg-undo]').disabled]));
    await p.click('[data-dg-undo]'); await sleep(1500);
    console.log(await p.evaluate(() => document.querySelector('#workspace [data-dg-name]').value));
    await p.click('[data-dg-back]'); await sleep(1500);
    console.log(await p.evaluate(() => [location.hash, document.querySelectorAll('#workspace .dgo-card').length, document.querySelector('#workspace .dgo-card')?.innerHTML.slice(0, 200)]));
    await sleep(2000);
    console.log(await p.evaluate(() => document.querySelector('#workspace .dgo-thimg')?.outerHTML.slice(0, 120)));
    console.log('errs', B.errs);
  } catch (e) { console.log('ERR', e); } finally { await B.stop(); }
})();
