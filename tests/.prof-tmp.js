'use strict';
(async () => {
    const B = await require('./prendre-depuis-seed.js').start();
    const p = B.page, sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        await p.evaluate(() => {
            const E = window.LCNDA_EXT, rows = [];
            for (let i = 0; i < 5000; i++) rows.push({name: 'Combat n° ' + i, d: `${1600 + i % 300}-01-01`, y: 1600 + i % 300, lat: 45 + (i % 100) / 100, lon: 1 + (i % 70) / 100, lieu: 'Lieu ' + (i % 40), u: ''});
            E.dataLists.push({id: 'test_piege', icon: '⚔️', label: 'Piège', group: 'Le monde', theme: 'guerres', source: 'S', load: async () => rows,
                fields: [{key: 'name', label: 'Combat', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Lien', type: 'url'}],
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name, familyColumn: true});
            E.donneesPlus?.resetCache?.();
        });
        const cdp = await p.context().newCDPSession(p);
        await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {interval: 200}); await cdp.send('Profiler.start');
        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_piege'; A.setModule('listes'); });
        await p.waitForSelector('[data-ld-page="test_piege"] [data-ld-results] tbody tr[data-ld-row]', {timeout: 60000}); await sleep(3000);
        const {profile} = await cdp.send('Profiler.stop');
        const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
        const dt = profile.timeDeltas; const counts = new Map();
        profile.samples.forEach((s, i) => counts.set(s, (counts.get(s) || 0) + (dt[i] || 0)));
        for (const [id, t] of counts) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + t / 1000); }
        // inclusive by function too
        const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
        const incl = new Map();
        for (const [id, t] of counts) { const seen = new Set(); let cur = id; while (cur != null) { const n = byId.get(cur); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t / 1000); } cur = parent.get(cur); } }
        console.log('SELF', [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join('\n'));
        console.log('INCL', [...incl].filter(([k]) => /app-|heritage-/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join('\n'));
    } finally { await B.stop(); }
})();
