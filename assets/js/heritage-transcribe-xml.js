/* LCNDA — Atelier de transcription : exports ALTO et PAGE (les deux XML que lisent les archives, Transkribus et eScriptorium).
 * Fonctions pures : on leur donne les pages, chacune avec ses lignes (texte + rectangle sur l'image, en pixels) et ses
 * zones typées ; elles rendent le XML. Une zone « ⛔ à ne pas lire » n'est jamais exportée comme texte. */
(function (root) {
    'use strict';
    /** les sortes de zone : '' texte ordinaire ; les autres disent ce qu'est la zone (et l'ordre de lecture suit l'ordre des zones) */
    const KINDS = [['', '▭', 'Texte'], ['skip', '⛔', 'À ne pas lire'], ['margin', '📝', 'Mention en marge'], ['head', '🔠', 'Titre'], ['sign', '✍️', 'Signatures'], ['note', '🗒', 'Note ajoutée']];
    const PAGE_TYPE = {'': 'paragraph', margin: 'marginalia', head: 'heading', sign: 'signature-mark', note: 'footnote'};
    const x = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    const R = n => Math.max(0, Math.round(Number(n) || 0));
    const idOf = (p, s) => p + String(s).replace(/[^A-Za-z0-9_.-]/g, '_');
    /** le centre du rectangle tombe dans une zone « à ne pas lire » ? */
    const inSkip = (zones, b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return (zones || []).some(z => z.kind === 'skip' && cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h); };
    /** la zone typée (pas « texte ») qui contient le centre de la ligne */
    const regionOf = (zones, b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return (zones || []).find(z => z.kind && z.kind !== 'skip' && cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) || null; };
    /** pages = [{n, file, w, h, lines: [{id, text, box: {x, y, w, h} | null}], zones: [{id, kind, x, y, w, h}]}] */
    function clean(pages) {
        return (pages || []).map((p, i) => ({n: p.n || String(i + 1), file: p.file || '', w: R(p.w), h: R(p.h), zones: p.zones || [],
            lines: (p.lines || []).filter(l => String(l.text || '').trim() && !(l.box && inSkip(p.zones, l.box)))}));
    }
    const bboxOf = ls => { const b = ls.filter(l => l.box).map(l => l.box); if (!b.length) return null; const x0 = Math.min(...b.map(q => q.x)), y0 = Math.min(...b.map(q => q.y)); return {x: x0, y: y0, w: Math.max(...b.map(q => q.x + q.w)) - x0, h: Math.max(...b.map(q => q.y + q.h)) - y0}; };
    /** regroupe les lignes d'une page par région : les zones typées dans l'ordre où elles ont été posées, puis le texte ordinaire */
    function regions(p) {
        const out = [], main = {id: 'main', kind: '', lines: []};
        const typed = p.zones.filter(z => z.kind && z.kind !== 'skip').map(z => ({id: z.id, kind: z.kind, zone: z, lines: []}));
        p.lines.forEach(l => { const z = l.box && regionOf(p.zones, l.box), r = z && typed.find(q => q.id === z.id); (r || main).lines.push(l); });
        // l'ordre de lecture : celui des zones (une marge posée avant le texte se lit avant)
        let mainAt = typed.findIndex(r => r.kind !== 'margin' && r.kind !== 'head'); if (mainAt < 0) mainAt = typed.length;
        typed.forEach((r, i) => { if (i === mainAt) out.push(main); out.push(r); }); if (mainAt >= typed.length) out.push(main);
        return out.filter(r => r.lines.length).map(r => ({...r, box: r.zone ? {x: r.zone.x, y: r.zone.y, w: r.zone.w, h: r.zone.h} : bboxOf(r.lines)}));
    }
    const lineH = (b, k) => b || {x: 0, y: k * 40, w: 0, h: 0};

    function alto(pages, {title = ''} = {}) {
        const P = clean(pages);
        const body = P.map((p, pi) => {
            let k = 0;
            const blocks = regions(p).map((r, ri) => { const bb = r.box || {x: 0, y: 0, w: 0, h: 0};
                const ls = r.lines.map(l => { const b = lineH(l.box, k++), words = String(l.text).trim().split(/\s+/), step = b.w / Math.max(1, String(l.text).trim().length);
                    let off = 0; const strs = words.map((w, wi) => { const ww = R(w.length * step), s = `<String CONTENT="${x(w)}" HPOS="${R(b.x + off)}" VPOS="${R(b.y)}" WIDTH="${ww}" HEIGHT="${R(b.h)}"/>`; off += (w.length + 1) * step; return wi ? `<SP/>${s}` : s; }).join('');
                    return `          <TextLine ID="${idOf('l', `${pi + 1}_${l.id ?? k}`)}" HPOS="${R(b.x)}" VPOS="${R(b.y)}" WIDTH="${R(b.w)}" HEIGHT="${R(b.h)}">${strs}</TextLine>`; }).join('\n');
                return `        <TextBlock ID="${idOf('b', `${pi + 1}_${ri + 1}`)}"${r.kind ? ` TAGREFS="${x(r.kind)}"` : ''} HPOS="${R(bb.x)}" VPOS="${R(bb.y)}" WIDTH="${R(bb.w)}" HEIGHT="${R(bb.h)}">\n${ls}\n        </TextBlock>`; }).join('\n');
            return `    <Page ID="${idOf('p', pi + 1)}" PHYSICAL_IMG_NR="${pi + 1}" WIDTH="${p.w}" HEIGHT="${p.h}">\n      <PrintSpace HPOS="0" VPOS="0" WIDTH="${p.w}" HEIGHT="${p.h}">\n${blocks}\n      </PrintSpace>\n    </Page>`;
        }).join('\n');
        const tags = KINDS.filter(k => k[0] && k[0] !== 'skip').map(k => `    <OtherTag ID="${k[0]}" LABEL="${x(k[2])}"/>`).join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.loc.gov/standards/alto/ns-v4# http://www.loc.gov/standards/alto/v4/alto-4-2.xsd">
  <Description>
    <MeasurementUnit>pixel</MeasurementUnit>
    <sourceImageInformation><fileName>${x(P[0]?.file || '')}</fileName></sourceImageInformation>
    <Processing><processingStepDescription>${x(title)}</processingStepDescription><processingSoftware><softwareName>LCNDA</softwareName></processingSoftware></Processing>
  </Description>
  <Tags>
${tags}
  </Tags>
  <Layout>
${body}
  </Layout>
</alto>
`;
    }

    const pts = b => { const a = R(b.x), c = R(b.y), d = R(b.x + b.w), e = R(b.y + b.h); return `${a},${c} ${d},${c} ${d},${e} ${a},${e}`; };
    /** PAGE : un fichier par page (c'est la règle du format) ; on rend la liste [{name, xml}] */
    function page(pages, {created = new Date().toISOString().slice(0, 19)} = {}) {
        return clean(pages).map((p, pi) => {
            let k = 0; const R0 = regions(p);
            const regs = R0.map((r, ri) => { const rid = idOf('r', `${ri + 1}`);
                const ls = r.lines.map(l => { const b = lineH(l.box, k++); return `      <TextLine id="${idOf('l', `${ri + 1}_${l.id ?? k}`)}">\n        <Coords points="${pts(b)}"/>\n        <Baseline points="${R(b.x)},${R(b.y + b.h * .8)} ${R(b.x + b.w)},${R(b.y + b.h * .8)}"/>\n        <TextEquiv><Unicode>${x(l.text)}</Unicode></TextEquiv>\n      </TextLine>`; }).join('\n');
                return `    <TextRegion id="${rid}" type="${PAGE_TYPE[r.kind] || 'paragraph'}" custom="readingOrder {index:${ri};}">\n      <Coords points="${pts(r.box || {x: 0, y: 0, w: 0, h: 0})}"/>\n${ls}\n      <TextEquiv><Unicode>${x(r.lines.map(l => l.text).join('\n'))}</Unicode></TextEquiv>\n    </TextRegion>`; }).join('\n');
            const order = R0.map((r, ri) => `        <RegionRefIndexed index="${ri}" regionRef="${idOf('r', `${ri + 1}`)}"/>`).join('\n');
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
  <Metadata><Creator>LCNDA</Creator><Created>${created}</Created><LastChange>${created}</LastChange></Metadata>
  <Page imageFilename="${x(p.file)}" imageWidth="${p.w}" imageHeight="${p.h}">
    <ReadingOrder><OrderedGroup id="ro1">
${order}
    </OrderedGroup></ReadingOrder>
${regs}
  </Page>
</PcGts>
`;
            return {name: `${String(pi + 1).padStart(3, '0')}_${(p.file || 'page').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_')}.xml`, xml};
        });
    }
    const api = {KINDS, PAGE_TYPE, inSkip, regionOf, regions, clean, alto, page};
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof root === 'object') { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.txXml = api; }
})(typeof window !== 'undefined' ? window : null);
