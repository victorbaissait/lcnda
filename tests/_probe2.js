const {start, sleep} = require('./prendre-depuis-seed.js');
(async () => {
  const B = await start(); const p = B.page;
  try {
    await p.evaluate(() => window.LCNDA_EXT.diagrammesOnglet.setOn(true, {undo: false}));
    await p.click('.nav-item[data-module=diagrammes]'); await sleep(1500);
    console.log(await p.evaluate(() => document.querySelector('#workspace .page-header').outerHTML.slice(0, 600)));
  } catch (e) { console.log('ERR', e); } finally { await B.stop(); }
})();
