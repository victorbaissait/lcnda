/**
 * 📝 Les fichiers du traitement de texte (complète window.LCNDA_TEXT, app-texte-engine.js ; aussi require() dans Node) :
 *   toDocx / fromDocx (Word), toOdt / fromOdt (LibreOffice), toRtf / fromRtf, toMarkdown / fromMarkdown, toText / fromText.
 * Tout est fait ici, sans bibliothèque : le ZIP et la lecture XML sûre sont ceux du moteur commun des tableaux
 * (app-tableur-engine.js : unzip borné — taille, nombre d'éléments, bombe zip —, parseXml qui refuse DOCTYPE et ENTITY).
 * Les images arrivent en octets (opts.images : src → {data, type, w, h}) et repartent en data:image (le navigateur les range
 * ensuite dans les médias). Rien n'est exécuté : macros, objets, scripts et liens « javascript: » d'un fichier sont ignorés.
 */
(function (root, factory) {
    const T = root.LCNDA_TEXT || (typeof require === 'function' ? require('./app-texte-engine.js') : null);
    Object.assign(T, factory(root, T));
    if (typeof module === 'object' && module.exports) module.exports = T;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G, T) {
    'use strict';
    const {xe, hex6, col, clamp, fontOk, nid, run, para, plainOf, toB64, dataUrl, fromDataUrl, sniffImage, imageSize, mergeRuns, BASE_STYLES} = T;
    const {local, kids, kid, xtext, attr, findAll, onOff, finish} = T._x;
    const S = () => G.LCNDA_SHEET || (typeof require === 'function' ? require('./app-tableur-engine.js') : null);
    const MMTW = mm => Math.round(mm / T.TW_MM), TWMM = tw => Math.round(Number(tw) * T.TW_MM * 10) / 10;
    const PXEMU = px => Math.round(px * T.EMU_PX), EMUPX = e => Math.round(Number(e) / T.EMU_PX);
    const enc = new (G.TextEncoder || require('node:util').TextEncoder)();
    const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

    /* ═════════ DOCX : écrire ═════════ */
    const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const STYLE_IDS = {normal: 'Normal', title: 'Title', subtitle: 'Subtitle', h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6', quote: 'Quote', caption: 'Caption'};
    const STYLE_NAMES = {normal: 'Normal', title: 'Title', subtitle: 'Subtitle', h1: 'heading 1', h2: 'heading 2', h3: 'heading 3', h4: 'heading 4', h5: 'heading 5', h6: 'heading 6', quote: 'Quote', caption: 'caption'};
    const wStyleId = id => STYLE_IDS[id] || ('Lc' + String(id).replace(/[^A-Za-z0-9]/g, '') || 'LcStyle');
    const JC = {left: 'left', center: 'center', right: 'right', justify: 'both'};
    function rPrXml(r, {style = ''} = {}) {
        const p = [];
        if (style) p.push(`<w:rStyle w:val="${style}"/>`);
        if (r.font) { const f = xe(fontOk(r.font)); p.push(`<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>`); }
        if (r.b) p.push('<w:b/>'); else if (r.b === 0) p.push('<w:b w:val="0"/>');
        if (r.i) p.push('<w:i/>');
        if (r.caps) p.push('<w:caps/>');
        if (r.sc) p.push('<w:smallCaps/>');
        if (r.s) p.push('<w:strike/>');
        if (r.col) { const h = hex6(r.col); if (h) p.push(`<w:color w:val="${h}"/>`); }
        if (r.sz) { const hp = Math.round(clamp(r.sz, 1, 1638) * 2); p.push(`<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`); }
        if (r.u) p.push('<w:u w:val="single"/>');
        if (r.bg) { const h = hex6(r.bg); if (h) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${h}"/>`); }
        if (r.sup) p.push('<w:vertAlign w:val="superscript"/>'); else if (r.sub) p.push('<w:vertAlign w:val="subscript"/>');
        return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
    }
    function pPrXml(b, ctx, {extra = '', sect = ''} = {}) {
        const p = [];
        const st = b._wst || (b.st && b.st !== 'normal' ? wStyleId(b.st) : '');
        if (st) p.push(`<w:pStyle w:val="${st}"/>`);
        if (b.keep) p.push('<w:keepNext/>');
        if (b.pb) p.push('<w:pageBreakBefore/>');
        if (extra) p.push(extra);
        if (b.list) p.push(`<w:numPr><w:ilvl w:val="${clamp(b.list.l || 0, 0, 8)}"/><w:numId w:val="${b.list.numId || 1}"/></w:numPr>`);
        if (b.bd) p.push('<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="444444"/><w:left w:val="single" w:sz="6" w:space="4" w:color="444444"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="444444"/><w:right w:val="single" w:sz="6" w:space="4" w:color="444444"/></w:pBdr>');
        if (b.hrule) p.push('<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="888888"/></w:pBdr>');
        if (b.bg) { const h = hex6(b.bg); if (h) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${h}"/>`); }
        const sp = []; if (b.sb != null) sp.push(`w:before="${Math.round(clamp(b.sb, 0, 1584) * 20)}"`); if (b.sa != null) sp.push(`w:after="${Math.round(clamp(b.sa, 0, 1584) * 20)}"`); if (b.lh) sp.push(`w:line="${Math.round(clamp(b.lh, 0.5, 5) * 240)}" w:lineRule="auto"`);
        if (sp.length) p.push(`<w:spacing ${sp.join(' ')}/>`);
        const ind = []; if (b.il) ind.push(`w:left="${MMTW(b.il)}"`); if (b.ir) ind.push(`w:right="${MMTW(b.ir)}"`); if (b.fi > 0) ind.push(`w:firstLine="${MMTW(b.fi)}"`); else if (b.fi < 0) ind.push(`w:hanging="${MMTW(-b.fi)}"`);
        if (ind.length) p.push(`<w:ind ${ind.join(' ')}/>`);
        if (b.al && JC[b.al]) p.push(`<w:jc w:val="${JC[b.al]}"/>`);
        if (sect) p.push(sect);
        return p.length ? `<w:pPr>${p.join('')}</w:pPr>` : '';
    }
    const tXml = s => `<w:t xml:space="preserve">${xe(s)}</w:t>`;
    function runsXml(runs, ctx) {
        const out = []; let openCm = [];
        const list = mergeRuns(runs);
        list.forEach((r, i) => {
            // les commentaires : début avant le premier morceau, fin après le dernier
            const cms = r.cm || [];
            cms.filter(id => !openCm.includes(id)).forEach(id => { const n = ctx.cmId(id); if (n != null) out.push(`<w:commentRangeStart w:id="${n}"/>`); });
            openCm = [...new Set([...openCm, ...cms])];
            out.push(oneRunXml(r, ctx));
            const next = list[i + 1]?.cm || [];
            openCm.filter(id => !next.includes(id)).forEach(id => { const n = ctx.cmId(id); if (n != null) out.push(`<w:commentRangeEnd w:id="${n}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${n}"/></w:r>`); });
            openCm = openCm.filter(id => next.includes(id));
        });
        return out.join('');
    }
    function oneRunXml(r, ctx) {
        let inner;
        if (r.br) inner = `<w:r>${rPrXml(r)}<w:br/></w:r>`;
        else if (r.tab) inner = `<w:r>${rPrXml(r)}<w:tab/></w:r>`;
        else if (r.note) {
            const k = r.note.k === 'end' ? 'endnote' : 'footnote', id = ctx.addNote(k, r.note);
            inner = `<w:r><w:rPr><w:rStyle w:val="${k === 'endnote' ? 'EndnoteReference' : 'FootnoteReference'}"/></w:rPr><w:${k}Reference w:id="${id}"/></w:r>`;
        }
        else if (r.field === 'page' || r.field === 'pages') inner = `<w:fldSimple w:instr=" ${r.field === 'page' ? 'PAGE' : 'NUMPAGES'} "><w:r>${rPrXml(r)}${tXml(r.fieldText || '1')}</w:r></w:fldSimple>`;
        else if (r.img) inner = `<w:r>${ctx.drawing({...r.img, inline: true}) || tXml(r.img.alt ? `[${r.img.alt}]` : '')}</w:r>`;
        else {
            const del = r.tc?.k === 'del';
            inner = `<w:r>${rPrXml(r, {style: r.cs && !T.BUILTIN.has(r.cs) ? wStyleId(r.cs) : r.href || r.link ? 'Hyperlink' : ''})}${del ? `<w:delText xml:space="preserve">${xe(r.x || '')}</w:delText>` : tXml(r.x || r.fieldText || '')}</w:r>`;
        }
        if (r.tc) { const n = ctx.revId(); inner = `<w:${r.tc.k === 'del' ? 'del' : 'ins'} w:id="${n}" w:author="${xe(r.tc.a || 'LCNDA')}" w:date="${xe(isoDate(r.tc.t))}">${inner}</w:${r.tc.k === 'del' ? 'del' : 'ins'}>`; }
        if (r.href && /^(https?:\/\/|mailto:)/i.test(r.href)) inner = `<w:hyperlink r:id="${ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', r.href, true)}" w:history="1">${inner}</w:hyperlink>`;
        else if (r.href && /^#/.test(r.href)) inner = `<w:hyperlink w:anchor="${xe(r.href.slice(1).replace(/[^\w-]/g, '_').slice(0, 40))}">${inner}</w:hyperlink>`;
        else if (r.link) inner = `<w:hyperlink w:anchor="lcnda-${r.link.k === 'place' ? 'place' : 'person'}-${Number(r.link.id) || 0}${r.link.part ? '-' + String(r.link.part).replace(/[^a-z_]/g, '') : ''}" w:tooltip="${r.link.k === 'place' ? 'Lieu' : 'Fiche'} de la base LCNDA">${inner}</w:hyperlink>`;
        return inner;
    }
    const isoDate = t => { const d = t ? new Date(t) : new Date(); return isNaN(d) ? new Date().toISOString().replace(/\.\d+Z$/, 'Z') : d.toISOString().replace(/\.\d+Z$/, 'Z'); };
    function sectPrXml(sec, ctx, last, {cols = 1, type = 'nextPage'} = {}) {
        const pg = {...T.PAGE0, ...(ctx.doc.page || {}), ...(sec.page || {})}, m = {...T.PAGE0.m, ...(ctx.doc.page?.m || {}), ...(sec.page?.m || {})};
        let w = pg.w, h = pg.h; const land = pg.orient === 'landscape'; if (land && h > w) [w, h] = [h, w]; if (!land && w > h) [w, h] = [h, w];
        const hf = ctx.hfRefs.join('');
        return `<w:sectPr>${hf}<w:type w:val="${type}"/><w:pgSz w:w="${MMTW(w)}" w:h="${MMTW(h)}"${land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${MMTW(m.t)}" w:right="${MMTW(m.r)}" w:bottom="${MMTW(m.b)}" w:left="${MMTW(m.l)}" w:header="${MMTW(Math.min(12.5, m.t / 2))}" w:footer="${MMTW(Math.min(12.5, m.b / 2))}" w:gutter="0"/><w:cols w:space="${MMTW(pg.gap || 10)}"${cols > 1 ? ` w:num="${clamp(cols, 1, 6)}"` : ''}/>${ctx.titlePg ? '<w:titlePg/>' : ''}<w:docGrid w:linePitch="360"/></w:sectPr>`;
    }
    function tableXml(b, ctx) {
        const rows = b.rows || []; if (!rows.length) return '';
        // la grille : chaque case prend sa place, les fusions vers le bas laissent des cases « suite » (vMerge)
        const grid = [], nCols = Math.max(1, ...rows.map(r => r.reduce((n, c) => n + Math.max(1, c.cs || 1), 0)));
        rows.forEach((r, ri) => { grid[ri] = grid[ri] || []; let ci = 0; r.forEach(c => { while (grid[ri][ci]) ci++; const cs = Math.max(1, c.cs || 1), rs = Math.max(1, c.rs || 1); for (let y = 0; y < rs; y++) { grid[ri + y] = grid[ri + y] || []; for (let x = 0; x < cs; x++) grid[ri + y][ci + x] = y === 0 && x === 0 ? {c, cs, rs} : {cont: y > 0 && x === 0, cs, owner: c}; } ci += cs; }); });
        const textW = ctx.textWidthMm, cols = (b.cols && b.cols.length === nCols ? b.cols : Array.from({length: nCols}, () => 100 / nCols)).map(p => MMTW(textW * p / 100));
        const bd = b.bd === false ? '' : '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="808080"/></w:tblBorders>';
        let x = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
        grid.forEach((row, ri) => {
            x += `<w:tr>${ri < (b.head || 0) ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
            for (let ci = 0; ci < nCols; ci++) {
                const g = row[ci];
                const width = cols.slice(ci, ci + (g?.cs || 1)).reduce((a, w) => a + w, 0);
                if (!g) { x += `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; continue; }
                if (g.c) {
                    const c = g.c, sh = c.bg && hex6(c.bg) ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex6(c.bg)}"/>` : '';
                    x += `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${g.cs > 1 ? `<w:gridSpan w:val="${g.cs}"/>` : ''}${g.rs > 1 ? '<w:vMerge w:val="restart"/>' : ''}${sh}</w:tcPr>${blocksXml(c.blocks || [], ctx, {inCell: true, head: ri < (b.head || 0)}) || '<w:p/>'}</w:tc>`;
                    ci += g.cs - 1;
                } else if (g.cont) { x += `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${g.cs > 1 ? `<w:gridSpan w:val="${g.cs}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`; ci += g.cs - 1; }
            }
            x += '</w:tr>';
        });
        return x + '</w:tbl>';
    }
    function blocksXml(blocks, ctx, o = {}) {
        const out = []; let listRun = null;
        blocks.forEach((b, i) => {
            if (b.t === 'p') {
                // une liste numérotée qui commence : sa propre numérotation (elle repart de 1)
                if (b.list) { if (!listRun || listRun.k !== b.list.k || listRun.end !== i - 1) listRun = {k: b.list.k, numId: b.list.k === 'ol' ? ctx.newOl() : 1}; listRun.end = i; b = {...b, list: {...b.list, numId: listRun.numId}}; }
                if (b.drop && plainOf(b.runs).trim().length > 1) { // la lettrine : la première lettre dans un cadre « lettrine » (comme Word)
                    const first = b.runs.find(r => r.x && r.x.trim()); const ch = first.x.trimStart()[0];
                    out.push(`<w:p>${pPrXml({st: b.st}, ctx, {extra: '<w:framePr w:dropCap="drop" w:lines="3" w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>'})}<w:r><w:rPr>${first.font ? `<w:rFonts w:ascii="${xe(fontOk(first.font))}" w:hAnsi="${xe(fontOk(first.font))}"/>` : ''}${first.b ? '<w:b/>' : ''}<w:position w:val="-6"/><w:sz w:val="${Math.round(((ctx.doc.styles || []).find(s => s.id === 'normal')?.size || 12) * 2 * 3.2)}"/></w:rPr>${tXml(ch)}</w:r></w:p>`);
                    const runs = []; let done = false; b.runs.forEach(r => { if (!done && r === first) { const k = r.x.indexOf(ch); runs.push({...r, x: r.x.slice(k + 1)}); done = true; } else runs.push(r); });
                    b = {...b, runs, drop: false};
                }
                out.push(`<w:p>${pPrXml(b, ctx)}${runsXml(o.head ? b.runs.map(r => ({...r, b: r.b ?? 1})) : b.runs, ctx)}</w:p>`);
                return;
            }
            listRun = null;
            if (b.t === 'pb') out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
            else if (b.t === 'hr') out.push(`<w:p>${pPrXml({hrule: true}, ctx)}</w:p>`);
            else if (b.t === 'img') {
                const d = ctx.drawing(b);
                out.push(`<w:p>${pPrXml({al: b.wrap === 'square' ? '' : b.al || 'center', keep: !!b.cap}, ctx)}${d ? `<w:r>${d}</w:r>` : `<w:r>${tXml(b.alt ? `[${b.alt}]` : '[image]')}</w:r>`}</w:p>`);
                if (b.cap) out.push(`<w:p>${pPrXml({st: 'caption', al: b.wrap === 'square' ? b.al : undefined}, ctx)}<w:r>${tXml(b.cap)}</w:r></w:p>`);
            }
            else if (b.t === 'table') { out.push(tableXml(b, ctx)); if (o.inCell || i === blocks.length - 1) out.push('<w:p/>'); }
            else if (b.t === 'cols' || b.t === 'toc' || b.t === 'index' || b.t === 'bib') {
                const gen = {toc: 'TOC', index: 'Index', bib: 'Bibliography'}[b.t];
                (b.blocks || []).forEach(x => { if (gen && x.t === 'p') x = {...x, st: 'normal', _wst: !x.lvl ? (b.t === 'toc' ? 'TOCHeading' : b.t === 'index' ? 'IndexHeading' : 'Bibliography') : b.t === 'toc' ? `TOC${clamp(x.lvl, 1, 3)}` : b.t === 'index' ? 'Index1' : 'Bibliography'}; out.push(blocksXml([x], ctx, o)); });
            }
        });
        return out.join('');
    }
    function stylesXml(doc) {
        const styles = doc.styles || T.styleSet(doc.set), normal = styles.find(s => s.id === 'normal') || BASE_STYLES[0];
        const pPr = s => { const p = []; if (s.keep) p.push('<w:keepNext/>'); const sp = []; if (s.before != null) sp.push(`w:before="${Math.round(s.before * 20)}"`); if (s.after != null) sp.push(`w:after="${Math.round(s.after * 20)}"`); if (s.line) sp.push(`w:line="${Math.round(s.line * 240)}" w:lineRule="auto"`); if (sp.length) p.push(`<w:spacing ${sp.join(' ')}/>`);
            const ind = []; if (s.il) ind.push(`w:left="${MMTW(s.il)}"`); if (s.ir) ind.push(`w:right="${MMTW(s.ir)}"`); if (s.fi > 0) ind.push(`w:firstLine="${MMTW(s.fi)}"`); if (s.fi < 0) ind.push(`w:hanging="${MMTW(-s.fi)}"`); if (ind.length) p.push(`<w:ind ${ind.join(' ')}/>`);
            if (s.align) p.push(`<w:jc w:val="${JC[s.align]}"/>`); const lv = /^h([1-6])$/.exec(s.id); if (lv) p.push(`<w:outlineLvl w:val="${Number(lv[1]) - 1}"/>`);
            return p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''; };
        const rPr = s => rPrXml({font: s.font, b: s.b, i: s.i, u: s.u, s: s.s, sc: s.sc, caps: s.caps, col: s.color, sz: s.size, bg: s.bg});
        const font = xe(fontOk(normal.font || 'Georgia'));
        let x = `${XMLH}<w:styles ${NS_W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${Math.round((normal.size || 12) * 2)}"/><w:szCs w:val="${Math.round((normal.size || 12) * 2)}"/><w:lang w:val="${xe(doc.lang === 'fr' ? 'fr-FR' : doc.lang || 'fr-FR')}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`;
        styles.filter(s => s.kind !== 'c').forEach(s => {
            const id = wStyleId(s.id), name = STYLE_NAMES[s.id] || s.name;
            x += `<w:style w:type="paragraph"${s.id === 'normal' ? ' w:default="1"' : ''} w:styleId="${id}"><w:name w:val="${xe(name)}"/>${s.id !== 'normal' ? `<w:basedOn w:val="${s.base && s.base !== s.id ? wStyleId(s.base) : 'Normal'}"/><w:next w:val="Normal"/>` : ''}<w:qFormat/>${pPr(s)}${rPr(s)}</w:style>`;
        });
        styles.filter(s => s.kind === 'c' && !T.BUILTIN.has(s.id)).forEach(s => { x += `<w:style w:type="character" w:customStyle="1" w:styleId="${wStyleId(s.id)}"><w:name w:val="${xe(s.name)}"/>${rPr(s)}</w:style>`; });
        x += '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
            + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>'
            + '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
            + '<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
            + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
            + '<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/></w:rPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>'
            + [1, 2, 3].map(n => `<w:style w:type="paragraph" w:styleId="TOC${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9060"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="${(n - 1) * 240}"/></w:pPr></w:style>`).join('')
            + '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="IndexHeading"><w:name w:val="index heading"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/></w:rPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="Index1"><w:name w:val="index 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/><w:ind w:left="240" w:hanging="240"/></w:pPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567" w:hanging="567"/></w:pPr></w:style>'
            + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>';
        return x + '</w:styles>';
    }
    const BULLETS = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'], NUMFMT = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
    function numberingXml(nOl) {
        const lvls = k => Array.from({length: 9}, (_, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${k === 'ul' ? 'bullet' : NUMFMT[l]}"/><w:lvlText w:val="${k === 'ul' ? BULLETS[l] : `%${l + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
        let x = `${XMLH}<w:numbering ${NS_W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('ul')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('ol')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
        for (let i = 0; i < nOl; i++) x += `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
        return x + '</w:numbering>';
    }
    /**
     * toDocx(doc, {images}) → Promise<Blob> (navigateur) ou {files} (Node : opts.files = true)
     * images : Map ou objet src → {data: Uint8Array, type: 'png'|'jpeg'|'gif', w, h}
     */
    async function toDocx(doc, opts = {}) {
        const imgs = opts.images instanceof Map ? opts.images : new Map(Object.entries(opts.images || {}));
        const rels = [], media = [], notes = {footnote: [], endnote: []}, cmIds = new Map();
        let relN = 10, revN = 1000, olN = 0, picN = 0;
        const pg0 = {...T.PAGE0, ...(doc.page || {})}, m0 = {...T.PAGE0.m, ...(doc.page?.m || {})};
        const ctx = {doc, textWidthMm: Math.max(20, (pg0.orient === 'landscape' ? Math.max(pg0.w, pg0.h) : Math.min(pg0.w, pg0.h)) - m0.l - m0.r), hfRefs: [], titlePg: false,
            rel: (type, target, external) => { const f = rels.find(r => r.type === type && r.target === target); if (f) return f.id; const id = `rId${++relN}`; rels.push({id, type, target, external}); return id; },
            revId: () => ++revN, newOl: () => (++olN) + 1,
            cmId: id => { if (!cmIds.has(id)) { if (!(doc.comments || []).some(c => c.id === id)) return null; cmIds.set(id, ++revN); } return cmIds.get(id); },
            addNote: (k, n) => { notes[k].push(n); return notes[k].length; },
            drawing: im => {
                let got = imgs.get(im.src); if (!got) { const d = fromDataUrl(im.src); if (d) got = {...d, ...(imageSize(d.data) || {})}; }
                if (!got || !['png', 'jpeg', 'gif'].includes(got.type)) return '';
                let ent = media.find(x => x.src === im.src);
                if (!ent) { ent = {src: im.src, name: `image${media.length + 1}.${got.type === 'jpeg' ? 'jpeg' : got.type}`, data: got.data}; media.push(ent); ent.rel = ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${ent.name}`); }
                const wpx = clamp(im.w || got.w || 300, 8, 3000), ratio = got.w && got.h ? got.h / got.w : (im.h && im.w ? im.h / im.w : 0.75), hpx = im.h && !got.w ? im.h : Math.round(wpx * ratio);
                const cx = PXEMU(wpx), cy = PXEMU(hpx), id = ++picN;
                const graphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xe(ent.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${ent.rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
                const docPr = `<wp:docPr id="${id}" name="Image ${id}" descr="${xe(im.alt || im.cap || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`;
                if (im.inline || im.wrap !== 'square') return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${docPr}${graphic}</wp:inline></w:drawing>`;
                return `<w:drawing><wp:anchor distT="45720" distB="45720" distL="114300" distR="114300" simplePos="0" relativeHeight="${251658240 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${im.al === 'right' ? 'right' : im.al === 'center' ? 'center' : 'left'}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/>${docPr}${graphic}</wp:anchor></w:drawing>`;
            }};
        // en-têtes et pieds : rangés avant le texte (le texte y renvoie)
        const hfPart = (kind, blocks, n) => { const name = `${kind}${n}.xml`, tag = kind === 'header' ? 'hdr' : 'ftr'; const body = blocksXml(blocks.length ? blocks : [para([])], ctx) || '<w:p/>'; return {name, rel: ctx.rel(`http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}`, name), xml: `${XMLH}<w:${tag} ${NS_W}>${body}</w:${tag}>`}; };
        const hfParts = [];
        const hasH = (doc.header?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field)), hasF = (doc.footer?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field));
        const first = !!(doc.header?.first || doc.footer?.first);
        if (hasH || first) { const p = hfPart('header', doc.header?.blocks || [], 1); hfParts.push(p); ctx.hfRefs.push(`<w:headerReference w:type="default" r:id="${p.rel}"/>`); }
        if (first) { const p = hfPart('header', doc.header?.first ? doc.header.firstBlocks || [] : doc.header?.blocks || [], 2); hfParts.push(p); ctx.hfRefs.push(`<w:headerReference w:type="first" r:id="${p.rel}"/>`); }
        if (hasF || first) { const p = hfPart('footer', doc.footer?.blocks || [], 1); hfParts.push(p); ctx.hfRefs.push(`<w:footerReference w:type="default" r:id="${p.rel}"/>`); }
        if (first) { const p = hfPart('footer', doc.footer?.first ? doc.footer.firstBlocks || [] : doc.footer?.blocks || [], 2); hfParts.push(p); ctx.hfRefs.push(`<w:footerReference w:type="first" r:id="${p.rel}"/>`); }
        ctx.titlePg = first;
        // le texte, section par section (la fin d'une section est dans le dernier paragraphe de la section)
        const secs = doc.sections || [], body = [];
        // un passage en colonnes : une section « continue » de Word (même page, plusieurs colonnes)
        const wsecs = [];
        secs.forEach(sec => { let seg = {sec, blocks: [], cols: 1, type: 'nextPage'}; wsecs.push(seg);
            (sec.blocks || []).forEach(b => { if (b.t === 'cols') { if (seg.blocks.length) { seg = {sec, blocks: [], cols: 1, type: 'continuous'}; wsecs.push(seg); } seg.blocks = b.blocks || []; seg.cols = clamp(b.n || 2, 2, 6); seg = {sec, blocks: [], cols: 1, type: 'continuous'}; wsecs.push(seg); } else seg.blocks.push(b); }); });
        const ws = wsecs.filter((w, k) => w.blocks.length || k === 0 || w.cols > 1 || wsecs[k - 1]?.sec !== w.sec);
        ws.forEach((w, k) => {
            let x = blocksXml(w.blocks, ctx);
            if (k < ws.length - 1) x += `<w:p><w:pPr>${sectPrXml(w.sec, ctx, false, {cols: w.cols, type: w.type})}</w:pPr></w:p>`;
            else ctx.lastSect = w;
            body.push(x);
        });
        const bg = doc.page?.color && hex6(doc.page.color) && hex6(doc.page.color) !== 'FFFFFF' ? `<w:background w:color="${hex6(doc.page.color)}"/>` : '';
        const documentXml = `${XMLH}<w:document ${NS_W}>${bg}<w:body>${body.join('')}${sectPrXml(ctx.lastSect?.sec || secs[secs.length - 1] || {}, ctx, true, {cols: ctx.lastSect?.cols || 1, type: ctx.lastSect?.type || 'nextPage'})}</w:body></w:document>`;
        const noteXml = k => { const tag = k === 'footnote' ? 'footnotes' : 'endnotes', one = k, sty = k === 'footnote' ? 'Footnote' : 'Endnote';
            return `${XMLH}<w:${tag} ${NS_W}><w:${one} w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:${one}><w:${one} w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:${one}>`
                + notes[k].map((n, i) => `<w:${one} w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="${sty}Text"/></w:pPr><w:r><w:rPr><w:rStyle w:val="${sty}Reference"/></w:rPr><w:${one}Ref/></w:r><w:r>${tXml(' ' + (n.text || ''))}</w:r></w:p></w:${one}>`).join('') + `</w:${tag}>`; };
        const commentsXml = `${XMLH}<w:comments ${NS_W}>${[...cmIds].map(([id, n]) => { const c = (doc.comments || []).find(x => x.id === id) || {}; const ini = String(c.author || 'L').split(/\s+/).map(w => w[0] || '').join('').slice(0, 3).toUpperCase();
            return `<w:comment w:id="${n}" w:author="${xe(c.author || 'LCNDA')}" w:date="${xe(isoDate(c.at))}" w:initials="${xe(ini || 'L')}"><w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r>${tXml(c.text || '')}</w:r></w:p>${(c.replies || []).map(r => `<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r>${tXml(`${r.author ? r.author + ' : ' : ''}${r.text || ''}`)}</w:r></w:p>`).join('')}</w:comment>`; }).join('')}</w:comments>`;
        const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
        const fixed = [['rId1', R + 'styles', 'styles.xml'], ['rId2', R + 'settings', 'settings.xml'], ['rId3', R + 'numbering', 'numbering.xml'], ['rId4', R + 'footnotes', 'footnotes.xml'], ['rId5', R + 'endnotes', 'endnotes.xml'], ['rId6', R + 'comments', 'comments.xml'], ['rId7', R + 'fontTable', 'fontTable.xml']];
        const docRels = `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fixed.map(([id, t, f]) => `<Relationship Id="${id}" Type="${t}" Target="${f}"/>`).join('')}${rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${xe(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
        const settings = `${XMLH}<w:settings ${NS_W}><w:zoom w:percent="100"/>${bg ? '<w:displayBackgroundShape/>' : ''}${doc.track ? '<w:trackRevisions/>' : ''}<w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="fr-FR"/></w:settings>`;
        const fonts = [...new Set([(doc.styles || []).find(s => s.id === 'normal')?.font || 'Georgia', ...(doc.styles || []).map(s => s.font).filter(Boolean)])].map(fontOk).filter(Boolean);
        const fontTable = `${XMLH}<w:fonts ${NS_W}>${fonts.map(f => `<w:font w:name="${xe(f)}"><w:family w:val="${/courier|mono/i.test(f) ? 'modern' : /arial|helvetica|verdana|sans/i.test(f) ? 'swiss' : 'roman'}"/></w:font>`).join('')}</w:fonts>`;
        const now = isoDate();
        const core = `${XMLH}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(doc.title || '')}</dc:title><dc:subject>${xe(doc.meta?.subject || '')}</dc:subject><dc:creator>${xe(doc.meta?.author || '')}</dc:creator><dc:language>${xe(doc.lang === 'fr' ? 'fr-FR' : doc.lang || 'fr-FR')}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
        const app = `${XMLH}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>LCNDA — Traitement de texte</Application><Words>${T.wordCount(T.allBlocks(doc).map(T.blockText).join(' '))}</Words></Properties>`;
        const exts = [...new Set(media.map(m => m.name.split('.').pop()))];
        const ct = `${XMLH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${exts.map(e => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('')}`
            + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>'
            + hfParts.map(p => `<Override PartName="/word/${p.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${p.name.startsWith('header') ? 'header' : 'footer'}+xml"/>`).join('')
            + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
        const top = `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
        const files = [{name: '[Content_Types].xml', data: ct}, {name: '_rels/.rels', data: top}, {name: 'docProps/core.xml', data: core}, {name: 'docProps/app.xml', data: app},
            {name: 'word/document.xml', data: documentXml}, {name: 'word/styles.xml', data: stylesXml(doc)}, {name: 'word/settings.xml', data: settings}, {name: 'word/numbering.xml', data: numberingXml(olN)},
            {name: 'word/footnotes.xml', data: noteXml('footnote')}, {name: 'word/endnotes.xml', data: noteXml('endnote')}, {name: 'word/comments.xml', data: commentsXml}, {name: 'word/fontTable.xml', data: fontTable},
            ...hfParts.map(p => ({name: `word/${p.name}`, data: p.xml})), {name: 'word/_rels/document.xml.rels', data: docRels}, ...media.map(m => ({name: `word/media/${m.name}`, data: m.data, store: true}))];
        if (opts.files) return files;
        return S().makeZip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }



    /** sommaire, index, bibliographie : leurs paragraphes stylés redeviennent des blocs fabriqués (refaits par l'éditeur) */
    function groupGen(blocks, onRemove = () => {}) {
        const gen = []; blocks.forEach((b, i) => { if (b._gen) { const k = b._gen.startsWith('__toc') ? 'toc' : b._gen === '__index' ? 'index' : 'bib'; const head = b._gen === '__toc0'; if (gen.length && gen[gen.length - 1].k === k && gen[gen.length - 1].end === i - 1 && !head) gen[gen.length - 1].end = i; else gen.push({k, start: i, end: i}); } });
        gen.reverse().forEach(g => { blocks.splice(g.start, g.end - g.start + 1, {t: g.k}); onRemove(g); });
        blocks.forEach(b => { delete b._gen; delete b._drop; });
        return blocks;
    }

    /* ═════════ DOCX : lire ═════════ */
    const NAME_TO_ST = n => { n = String(n || '').toLowerCase().trim(); let m;
        if ((m = /^(heading|titre)\s*(\d)$/.exec(n))) return 'h' + Math.min(6, Number(m[2]));
        if (n === 'title' || n === 'titre') return 'title'; if (n === 'subtitle' || n === 'sous-titre') return 'subtitle';
        if (/^(quote|intense quote|citation|quotations|citation intense|block text)$/.test(n)) return 'quote';
        if (n === 'caption' || n === 'légende') return 'caption'; if (/^(normal|standard|default|default paragraph style|list paragraph|paragraphe de liste|body text|corps de texte|no spacing|sans interligne|text body|first paragraph|compact|text_20_body|text)$/.test(n)) return 'normal';
        if ((m = /^(?:toc|contents)\s*(\d)$/.exec(n))) return '__toc' + m[1]; if (/^(toc heading|contents heading)$/.test(n)) return '__toc0'; if (/^index\s*(\d|heading)$/.test(n)) return '__index'; if (/^(bibliography|bibliographie|bibliography heading|bibliography 1)$/.test(n)) return '__bib';
        return null; };
    const mmTw = v => (v == null || v === '' ? undefined : TWMM(v));
    function readRPr(rPr, base = {}) {
        const o = {...base}; if (!rPr) return o;
        const on = n => { const e = kid(rPr, n); return e ? onOff(e) : undefined; };
        const b = on('b'); if (b !== undefined) o.b = b ? 1 : 0; const i = on('i'); if (i !== undefined) o.i = i ? 1 : 0;
        const st = on('strike') ?? on('dstrike'); if (st !== undefined) o.s = st ? 1 : 0;
        const sc = on('smallCaps'); if (sc !== undefined) o.sc = sc ? 1 : 0; const caps = on('caps'); if (caps !== undefined) o.caps = caps ? 1 : 0;
        const u = kid(rPr, 'u'); if (u) o.u = !['none', '0', 'false'].includes(String(attr(u, 'w:val') || 'single')) ? 1 : 0;
        const c = kid(rPr, 'color'); if (c && /^[0-9a-f]{6}$/i.test(attr(c, 'w:val') || '') && attr(c, 'w:val').toUpperCase() !== '000000') o.col = '#' + attr(c, 'w:val').toLowerCase();
        const sz = kid(rPr, 'sz'); if (sz && Number(attr(sz, 'w:val')) > 0) o.sz = Number(attr(sz, 'w:val')) / 2;
        const f = kid(rPr, 'rFonts'); const fn = f && (attr(f, 'w:ascii') || attr(f, 'w:hAnsi')); if (fn) o.font = fontOk(fn);
        const hl = kid(rPr, 'highlight'); const HL = {yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', lightGray: '#c0c0c0', darkGray: '#808080', black: '#000000'};
        if (hl && HL[attr(hl, 'w:val')]) o.bg = HL[attr(hl, 'w:val')];
        const shd = kid(rPr, 'shd'); if (shd && /^[0-9a-f]{6}$/i.test(attr(shd, 'w:fill') || '') && !/^(auto|FFFFFF)$/i.test(attr(shd, 'w:fill'))) o.bg = '#' + attr(shd, 'w:fill').toLowerCase();
        const va = kid(rPr, 'vertAlign'); if (va) { const v = attr(va, 'w:val'); if (v === 'superscript') o.sup = 1; else if (v === 'subscript') o.sub = 1; }
        const rs = kid(rPr, 'rStyle'); if (rs) o._rs = attr(rs, 'w:val');
        return o;
    }
    function readPPr(pPr) {
        const o = {}; if (!pPr) return o;
        const jc = kid(pPr, 'jc'); if (jc) { const v = attr(jc, 'w:val'); o.al = v === 'both' || v === 'distribute' ? 'justify' : v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'left' || v === 'start' ? 'left' : undefined; }
        const sp = kid(pPr, 'spacing'); if (sp) { if (attr(sp, 'w:before') != null) o.sb = Number(attr(sp, 'w:before')) / 20; if (attr(sp, 'w:after') != null) o.sa = Number(attr(sp, 'w:after')) / 20; const ln = Number(attr(sp, 'w:line')); if (ln && (attr(sp, 'w:lineRule') || 'auto') === 'auto') o.lh = Math.round(ln / 240 * 100) / 100; }
        const ind = kid(pPr, 'ind'); if (ind) { const l = attr(ind, 'w:left') ?? attr(ind, 'w:start'), r = attr(ind, 'w:right') ?? attr(ind, 'w:end'); if (l) o.il = mmTw(l); if (r) o.ir = mmTw(r); if (attr(ind, 'w:firstLine')) o.fi = mmTw(attr(ind, 'w:firstLine')); if (attr(ind, 'w:hanging')) o.fi = -mmTw(attr(ind, 'w:hanging')); }
        const shd = kid(pPr, 'shd'); if (shd && /^[0-9a-f]{6}$/i.test(attr(shd, 'w:fill') || '') && !/^(auto|FFFFFF)$/i.test(attr(shd, 'w:fill'))) o.bg = '#' + attr(shd, 'w:fill').toLowerCase();
        const bdr = kid(pPr, 'pBdr'); if (bdr) { const sides = ['top', 'left', 'bottom', 'right'].filter(s => kid(bdr, s) && attr(kid(bdr, s), 'w:val') !== 'none'); if (sides.length >= 3) o.bd = true; else if (sides.length === 1 && sides[0] === 'bottom') o.hrule = true; }
        if (kid(pPr, 'pageBreakBefore') && onOff(kid(pPr, 'pageBreakBefore'))) o.pb = true;
        if (kid(pPr, 'keepNext') && onOff(kid(pPr, 'keepNext'))) o.keep = true;
        const ol = kid(pPr, 'outlineLvl'); if (ol) o._ol = Number(attr(ol, 'w:val'));
        return o;
    }
    function readPage(sectPr, prev) {
        const pg = {...(prev || T.PAGE0), m: {...(prev || T.PAGE0).m}};
        const sz = kid(sectPr, 'pgSz'); if (sz) { const w = Number(attr(sz, 'w:w')), h = Number(attr(sz, 'w:h')); if (w > 0 && h > 0) { pg.w = TWMM(w); pg.h = TWMM(h); } pg.orient = attr(sz, 'w:orient') === 'landscape' || pg.w > pg.h ? 'landscape' : 'portrait'; }
        const mar = kid(sectPr, 'pgMar'); if (mar) ['top', 'right', 'bottom', 'left'].forEach((k, i) => { const v = Number(attr(mar, `w:${k}`)); if (Number.isFinite(v) && attr(mar, `w:${k}`) != null) pg.m['trbl'[i]] = Math.abs(TWMM(v)); });
        const cols = kid(sectPr, 'cols'); if (cols) { pg.cols = clamp(Number(attr(cols, 'w:num')) || 1, 1, 6); if (attr(cols, 'w:space')) pg.gap = TWMM(attr(cols, 'w:space')); }
        return pg;
    }
    async function fromDocx(buf, opts = {}) {
        const X = S(), z = await X.unzip(buf);
        if (!z.has('word/document.xml')) throw new Error('ce n’est pas un document Word (.docx) : il manque son texte');
        const notices = []; if (z.names.some(n => /vbaProject\.bin$/i.test(n))) notices.push('Les macros du fichier sont ignorées (elles ne sont jamais lancées).');
        const xml = async n => { const t = await z.text(n); return t ? X.parseXml(t) : null; };
        const relsOf = async part => { const dir = part.slice(0, part.lastIndexOf('/') + 1), r = await xml(`${dir}_rels/${part.slice(dir.length)}.rels`), map = new Map();
            findAll(r, 'Relationship').forEach(e => { let t = attr(e, 'Target') || ''; const ext = attr(e, 'TargetMode') === 'External'; if (!ext) { t = t.startsWith('/') ? t.slice(1) : dir + t; const parts = []; t.split('/').forEach(x => { if (x === '..') parts.pop(); else if (x !== '.') parts.push(x); }); t = parts.join('/'); } map.set(attr(e, 'Id'), {type: String(attr(e, 'Type') || '').split('/').pop(), target: t, ext}); }); return map; };
        const docXml = await xml('word/document.xml'), rels = await relsOf('word/document.xml');
        // les styles : nom et forme (pour reconnaître « Titre 1 » d'un Word en français, et garder les styles à soi)
        const styleMap = new Map(), stylesX = await xml('word/styles.xml'), docStyles = [];
        findAll(stylesX, 'style').forEach(s => { const id = attr(s, 'w:styleId'), name = attr(kid(s, 'name'), 'w:val') || id; styleMap.set(id, {type: attr(s, 'w:type'), name, based: attr(kid(s, 'basedOn'), 'w:val'), rPr: kid(s, 'rPr'), pPr: kid(s, 'pPr')}); });
        const stOf = (id, depth = 0) => { const s = styleMap.get(id); if (!s || depth > 10) return null; const k = NAME_TO_ST(s.name) || NAME_TO_ST(id); if (k) return k; const lv = kid(s.pPr, 'outlineLvl'); if (lv && Number(attr(lv, 'w:val')) < 6) return null; return s.based ? (stOf(s.based, depth + 1) && null) : null; };
        const custom = new Map();
        const customOf = (id, kind) => { if (custom.has(id)) return custom.get(id); const s = styleMap.get(id); if (!s) return null;
            const myId = 'u-' + String(id).replace(/[^\w-]/g, '').slice(0, 30), r = readRPr(s.rPr), p = readPPr(s.pPr), base = s.based ? (stOf(s.based) || 'normal') : 'normal';
            const st = T.cleanStyle({id: myId, name: s.name, kind, base: base.startsWith('__') ? 'normal' : base, font: r.font, size: r.sz, color: r.col, bg: r.bg, b: r.b, i: r.i, u: r.u, s: r.s, sc: r.sc, caps: r.caps, align: p.al, line: p.lh, before: p.sb, after: p.sa, il: p.il, ir: p.ir, fi: p.fi});
            if (st) docStyles.push(st); custom.set(id, st ? myId : null); return st ? myId : null; };
        // les listes : numId → sorte de chaque niveau
        const numX = await xml('word/numbering.xml'), abstract = new Map(), nums = new Map();
        findAll(numX, 'abstractNum').forEach(a => abstract.set(attr(a, 'w:abstractNumId'), kids(a, 'lvl').map(l => attr(kid(l, 'numFmt'), 'w:val') || 'decimal')));
        findAll(numX, 'num').forEach(n => nums.set(attr(n, 'w:numId'), abstract.get(attr(kid(n, 'abstractNumId'), 'w:val')) || []));
        // les images : octets → data:image (bornés)
        let imgBytes = 0, imgCount = 0;
        const imageOf = async (rid, relMap = rels) => { const r = relMap.get(rid); if (!r || r.ext || r.type !== 'image') return null; if (++imgCount > T.LIMITS.images) return null; const u8 = await z.read(r.target); if (!u8) return null; imgBytes += u8.length; if (imgBytes > T.LIMITS.imageBytes) { if (!notices.includes('Certaines images, trop lourdes, n’ont pas été reprises.')) notices.push('Certaines images, trop lourdes, n’ont pas été reprises.'); return null; }
            const t = sniffImage(u8); if (!['png', 'jpeg', 'gif', 'webp'].includes(t)) { if (!notices.some(x => x.startsWith('Une image'))) notices.push('Une image d’une sorte que le navigateur ne montre pas (EMF, WMF, TIFF…) a été laissée de côté.'); return null; } return {src: dataUrl(u8, t), ...(imageSize(u8) || {})}; };
        // notes, commentaires
        const notesOf = async (part, tag) => { const x = await xml(part), m = new Map(); findAll(x, tag).forEach(n => { const id = attr(n, 'w:id'); if (Number(id) > 0) m.set(id, kids(n, 'p').map(p => findAll(p, 't').map(xtext).join('')).join(' ').trim()); }); return m; };
        const fnMap = await notesOf('word/footnotes.xml', 'footnote'), enMap = await notesOf('word/endnotes.xml', 'endnote');
        const cmX = await xml('word/comments.xml'), comments = [];
        findAll(cmX, 'comment').forEach(c => comments.push({id: 'c' + attr(c, 'w:id'), text: kids(c, 'p').map(p => findAll(p, 't').map(xtext).join('')).join('\n').trim(), author: attr(c, 'w:author') || '', at: attr(c, 'w:date') || ''}));
        const doc = {...T.newDoc(), styles: T.styleSet('classique'), comments, sections: []};
        let depth = 0;
        /* les morceaux d'un paragraphe */
        async function runsOf(el, ctx, out = [], fmt = {}) {
            if (++depth > 4000000) throw new Error('fichier refusé : trop compliqué');
            for (const ch of el.c || []) {
                if (typeof ch !== 'object') continue;
                const n = local(ch.n);
                if (n === 'r') await oneRun(ch, ctx, out, fmt);
                else if (n === 'hyperlink') { const rid = attr(ch, 'r:id'), an = attr(ch, 'w:anchor') || ''; const r = rid ? ctx.rels.get(rid) : null; let f = {...fmt};
                    const lm = /^lcnda-(person|place)-(\d+)(?:-([a-z_]+))?$/.exec(an); if (lm) f.link = {k: lm[1], id: Number(lm[2]), ...(lm[3] ? {part: lm[3]} : {})}; else if (r?.ext && /^(https?:\/\/|mailto:)/i.test(r.target)) f.href = r.target; else if (an) f.href = '#' + an;
                    await runsOf(ch, ctx, out, f); }
                else if (n === 'ins' || n === 'del') await runsOf(ch, ctx, out, {...fmt, tc: {k: n, id: 't' + (attr(ch, 'w:id') || nid('')), a: attr(ch, 'w:author') || '', t: attr(ch, 'w:date') || ''}});
                else if (n === 'fldSimple') { const ins = String(attr(ch, 'w:instr') || '').trim().split(/\s+/)[0].toUpperCase(); if (ins === 'PAGE' || ins === 'NUMPAGES') out.push({field: ins === 'PAGE' ? 'page' : 'pages', fieldText: findAll(ch, 't').map(xtext).join('') || '1'}); else await runsOf(ch, ctx, out, fmt); }
                else if (['smartTag', 'customXml', 'bdo', 'dir'].includes(n)) await runsOf(ch, ctx, out, fmt);
                else if (n === 'sdt') { const c = kid(ch, 'sdtContent'); if (c) await runsOf(c, ctx, out, fmt); }
                else if (n === 'commentRangeStart') ctx.cm.add('c' + attr(ch, 'w:id'));
                else if (n === 'commentRangeEnd') ctx.cm.delete('c' + attr(ch, 'w:id'));
                else if (n === 'oMath' || n === 'oMathPara') out.push(run(findAll(ch, 't').map(xtext).join(''), fmt));
            }
            return out;
        }
        async function oneRun(r, ctx, out, fmt) {
            const rPr = kid(r, 'rPr'); let f = readRPr(rPr, fmt);
            if (f._rs) { const sm = styleMap.get(f._rs); const k = sm && NAME_TO_ST(sm.name); if (sm && !/hyperlink|footnote|endnote|annotation|comment/i.test(sm.name) && !k) { const cs = customOf(f._rs, 'c'); if (cs) f.cs = cs; } delete f._rs; }
            const cm = [...ctx.cm]; if (cm.length) f.cm = cm;
            for (const ch of r.c || []) {
                if (typeof ch !== 'object') continue;
                const n = local(ch.n);
                if (ctx.fld) { // champ compliqué : on garde ce qui s'affiche
                    if (n === 'instrText') { ctx.fld.instr += xtext(ch); continue; }
                    if (n === 'fldChar') { const t = attr(ch, 'w:fldCharType'); if (t === 'separate') { ctx.fld.show = true; const ins = ctx.fld.instr.trim().split(/\s+/)[0].toUpperCase(); const hm = /HYPERLINK\s+"([^"]+)"/i.exec(ctx.fld.instr); if (hm && /^(https?:\/\/|mailto:)/i.test(hm[1])) ctx.fld.href = hm[1]; if (ins === 'PAGE' || ins === 'NUMPAGES') ctx.fld.field = ins === 'PAGE' ? 'page' : 'pages'; } else if (t === 'end') { if (ctx.fld.field) out.push({field: ctx.fld.field, fieldText: ctx.fld.text || '1'}); ctx.fld = null; } continue; }
                    if (!ctx.fld.show) continue;
                    if (ctx.fld.field) { if (n === 't') ctx.fld.text += xtext(ch); continue; }
                    if (ctx.fld.href) f = {...f, href: ctx.fld.href};
                }
                if (n === 'fldChar' && attr(ch, 'w:fldCharType') === 'begin') { ctx.fld = {instr: '', show: false, text: ''}; continue; }
                if (n === 't' || n === 'delText') { const t = xtext(ch); if (t) out.push(run(t, f)); }
                else if (n === 'tab' || n === 'ptab') out.push({tab: true, ...f, x: ''});
                else if (n === 'br' || n === 'cr') { if (attr(ch, 'w:type') === 'page') out.push({pagebreak: true}); else out.push({br: true}); }
                else if (n === 'noBreakHyphen') out.push(run('‑', f)); else if (n === 'softHyphen') out.push(run('­', f));
                else if (n === 'sym') { const c = parseInt(attr(ch, 'w:char') || '', 16); if (c > 0) out.push(run(String.fromCodePoint(c >= 0xF000 ? c - 0xF000 : c), f)); }
                else if (n === 'footnoteReference' || n === 'endnoteReference') { const id = attr(ch, 'w:id'), end = n === 'endnoteReference'; out.push({note: {id: nid('n'), k: end ? 'end' : 'foot', text: (end ? enMap : fnMap).get(id) || ''}}); }
                else if (n === 'drawing') { const inl = kid(ch, 'inline'), anc = kid(ch, 'anchor'), d = inl || anc; if (!d) continue; const blip = findAll(d, 'blip')[0], ext = kid(d, 'extent'), dp = kid(d, 'docPr');
                    const im = blip ? await imageOf(attr(blip, 'r:embed'), ctx.rels) : null; if (!im) continue;
                    const w = ext ? EMUPX(attr(ext, 'cx')) : im.w, h = ext ? EMUPX(attr(ext, 'cy')) : im.h, alt = attr(dp, 'descr') || attr(dp, 'title') || '';
                    if (anc) { const ah = findAll(anc, 'align')[0]; out.push({img: {src: im.src, w, h, alt}, anchor: {wrap: kid(anc, 'wrapSquare') || kid(anc, 'wrapTight') || kid(anc, 'wrapThrough') ? 'square' : 'topbottom', al: ah ? xtext(ah) : 'left'}}); }
                    else out.push({img: {src: im.src, w, h, alt}}); }
                else if (n === 'pict') { const idata = findAll(ch, 'imagedata')[0]; const im = idata ? await imageOf(attr(idata, 'r:id'), ctx.rels) : null; if (im) out.push({img: {src: im.src, w: Math.min(600, im.w || 300), h: im.h, alt: ''}}); }
            }
        }
        /* un paragraphe → un ou plusieurs blocs (une image seule, un saut de page au milieu…) */
        async function paraOf(p, ctx, inCell = false) {
            const pPr = kid(p, 'pPr'), base = readPPr(pPr), ps = attr(kid(pPr, 'pStyle'), 'w:val');
            let st = ps ? (stOf(ps) || null) : 'normal';
            if (ps && !st) { const sm = styleMap.get(ps), lv = kid(sm?.pPr, 'outlineLvl'); st = lv && Number(attr(lv, 'w:val')) < 6 ? 'h' + (Number(attr(lv, 'w:val')) + 1) : customOf(ps, 'p') || 'normal'; }
            if (base._ol != null && base._ol < 6 && st === 'normal') st = 'h' + (base._ol + 1); delete base._ol;
            const np = kid(pPr, 'numPr'); let list = null;
            if (np) { const id = attr(kid(np, 'numId'), 'w:val'), l = Number(attr(kid(np, 'ilvl'), 'w:val') || 0); const fmts = nums.get(id); if (id && id !== '0' && fmts) list = {k: (fmts[l] || fmts[0]) === 'bullet' ? 'ul' : 'ol', l: clamp(l, 0, 8)}; }
            if (!np && ps) { const sm = styleMap.get(ps), snp = kid(sm?.pPr, 'numPr'); if (snp) { const id = attr(kid(snp, 'numId'), 'w:val'), fmts = nums.get(id); if (fmts) list = {k: fmts[0] === 'bullet' ? 'ul' : 'ol', l: 0}; } }
            const drop = kid(pPr, 'framePr') && /drop|margin/.test(attr(kid(pPr, 'framePr'), 'w:dropCap') || '');
            const runs = await runsOf(p, ctx);
            const out = []; let cur = [];
            const flush = (force = false) => { if (!cur.length && !force) return; const b = {t: 'p', st: st && !st.startsWith('__') ? st : 'normal', ...base, runs: mergeRuns(cur.map(r => { const o = {...r}; delete o.anchor; return o; }))}; if (st && st.startsWith('__')) b._gen = st; if (list) b.list = list; if (b.hrule) { delete b.hrule; if (!plainOf(b.runs).trim()) { out.push({t: 'hr'}); cur = []; return; } } out.push(b); cur = []; };
            for (const r of runs) {
                if (r.pagebreak) { flush(); out.push({t: 'pb'}); continue; }
                if (r.anchor) { out.push({t: 'img', src: r.img.src, w: r.img.w, h: r.img.h, alt: r.img.alt, wrap: r.anchor.wrap, al: r.anchor.al}); continue; }
                cur.push(r);
            }
            // une image seule dans son paragraphe : une figure (haut et bas), alignée comme le paragraphe
            if (!inCell && cur.length && cur.every(r => r.img || (!r.x || !r.x.trim()) && !r.note && !r.field) && cur.filter(r => r.img).length === 1) { const r = cur.find(x => x.img); out.push({t: 'img', src: r.img.src, w: r.img.w, h: r.img.h, alt: r.img.alt, wrap: 'topbottom', al: base.al || 'center'}); cur = []; }
            if (cur.length || !out.length) flush(true);
            if (drop) out.forEach(b => { if (b.t === 'p') b._drop = true; });
            return out;
        }
        async function tableOf(tbl, ctx) {
            const rows = [], grid = []; let head = 0;
            const trs = kids(tbl, 'tr');
            for (let ri = 0; ri < trs.length; ri++) {
                const tr = trs[ri], trPr = kid(tr, 'trPr'); if (kid(trPr, 'tblHeader') && head === ri) head++;
                const row = []; let gc = 0; grid[ri] = [];
                for (const tc of kids(tr, 'tc')) {
                    const tcPr = kid(tc, 'tcPr'), span = Number(attr(kid(tcPr, 'gridSpan'), 'w:val')) || 1, vm = kid(tcPr, 'vMerge'), vmv = vm ? (attr(vm, 'w:val') || 'continue') : '';
                    if (vmv === 'continue') { // la suite d'une case fusionnée vers le bas
                        for (let y = ri - 1; y >= 0; y--) { const owner = grid[y][gc]; if (owner) { owner.rs = (owner.rs || 1) + 1; break; } }
                        gc += span; continue;
                    }
                    const blocks = []; for (const ch of tc.c || []) { if (typeof ch !== 'object') continue; const n = local(ch.n); if (n === 'p') blocks.push(...await paraOf(ch, ctx, true)); else if (n === 'tbl') blocks.push(await tableOf(ch, ctx)); }
                    const shd = kid(tcPr, 'shd'), cell = {blocks: blocks.length ? blocks : [para([])]}; if (span > 1) cell.cs = span;
                    if (shd && /^[0-9a-f]{6}$/i.test(attr(shd, 'w:fill') || '') && !/^(auto|FFFFFF)$/i.test(attr(shd, 'w:fill'))) cell.bg = '#' + attr(shd, 'w:fill').toLowerCase();
                    row.push(cell); grid[ri][gc] = cell; gc += span;
                }
                rows.push(row);
            }
            const gridCols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(g => Number(attr(g, 'w:w')) || 0), tot = gridCols.reduce((a, b) => a + b, 0);
            const bd = kid(kid(tbl, 'tblPr'), 'tblBorders'), noBd = bd && ['top', 'insideH'].every(s => !kid(bd, s) || attr(kid(bd, s), 'w:val') === 'none');
            const t = {t: 'table', head, rows}; if (tot > 0) t.cols = gridCols.map(w => Math.round(w / tot * 1000) / 10); if (noBd) t.bd = false;
            return t;
        }
        async function bodyBlocks(el, ctx) {
            const out = [];
            for (const ch of el.c || []) {
                if (typeof ch !== 'object') continue;
                const n = local(ch.n);
                if (out.length > T.LIMITS.blocks) throw new Error('fichier refusé : beaucoup trop de paragraphes');
                if (n === 'p') {
                    const bl = await paraOf(ch, ctx);
                    // la lettrine de Word : sa lettre dans un cadre, puis le paragraphe
                    if (out.length && out[out.length - 1]._drop && bl[0]?.t === 'p') { const d = out.pop(); bl[0].runs = mergeRuns([...d.runs.map(r => { const o = {...r}; delete o.sz; return o; }), ...bl[0].runs]); bl[0].drop = true; }
                    out.push(...bl);
                    const sp = kid(kid(ch, 'pPr'), 'sectPr'); if (sp) { const last = out[out.length - 1]; if (bl.length === 1 && last?.t === 'p' && !last.runs.length && out.length > 1) out.pop(); ctx.secEnds.push({at: out.length, sectPr: sp}); }
                }
                else if (n === 'tbl') out.push(await tableOf(ch, ctx));
                else if (n === 'sdt') { const c = kid(ch, 'sdtContent'); if (c) out.push(...await bodyBlocks(c, ctx)); }
                else if (n === 'customXml') out.push(...await bodyBlocks(ch, ctx));
            }
            return out;
        }
        const body = kid(kid(docXml, 'document'), 'body'); if (!body) throw new Error('document Word sans texte');
        const ctx = {rels, cm: new Set(), fld: null, secEnds: []};
        const blocks = await bodyBlocks(body, ctx);
        // les légendes : un paragraphe « Légende » juste après une image
        for (let i = blocks.length - 1; i > 0; i--) if (blocks[i].t === 'p' && blocks[i].st === 'caption' && blocks[i - 1].t === 'img' && !blocks[i - 1].cap) { blocks[i - 1].cap = plainOf(blocks[i].runs); blocks.splice(i, 1); ctx.secEnds.forEach(s => { if (s.at > i) s.at--; }); }
        // sommaire, index, bibliographie : leurs paragraphes stylés redeviennent des blocs fabriqués (refaits par l'éditeur)
        groupGen(blocks, g => ctx.secEnds.forEach(s => { if (s.at > g.end) s.at -= g.end - g.start; }));
        // les sections
        const lastSect = kid(body, 'sectPr'); let prev = null, from = 0;
        // une section « continue » (des colonnes au milieu d'une page) reste dans la même section de pages
        const addSec = (sectPr, part) => { const pg = sectPr ? readPage(sectPr, prev) : prev || {...T.PAGE0}, type = attr(kid(sectPr, 'type'), 'w:val') || 'nextPage', cols = pg.cols || 1; pg.cols = 1;
            const bl = cols > 1 ? [{t: 'cols', n: cols, blocks: part}] : part, last = doc.sections[doc.sections.length - 1];
            if (last && type === 'continuous' && last.page.orient === pg.orient && last.page.w === pg.w) last.blocks.push(...bl); else doc.sections.push({page: pg, blocks: bl});
            prev = pg; };
        ctx.secEnds.forEach(s => { addSec(s.sectPr, blocks.slice(from, s.at)); from = s.at; });
        // la dernière : son type dit comment elle commence (continue après des colonnes)
        addSec(lastSect, blocks.slice(from));
        doc.page = {...doc.sections[0].page}; doc.sections.forEach(s => { if (JSON.stringify(s.page) === JSON.stringify(doc.page)) s.page = null; else s.page = {orient: s.page.orient, w: s.page.w, h: s.page.h, m: s.page.m, cols: s.page.cols}; });
        // en-têtes et pieds (de la dernière section)
        const hfOf = async (sectPr, kind) => { const refs = kids(sectPr, `${kind}Reference`), pick = t => refs.find(r => (attr(r, 'w:type') || 'default') === t);
            const read = async ref => { if (!ref) return []; const r = rels.get(attr(ref, 'r:id')); if (!r) return []; const x = await xml(r.target), hr = await relsOf(r.target); const root = kid(x, kind === 'header' ? 'hdr' : 'ftr'); return root ? await bodyBlocks(root, {rels: hr, cm: new Set(), fld: null, secEnds: []}) : []; };
            const first = kid(sectPr, 'titlePg') && onOff(kid(sectPr, 'titlePg'));
            return {blocks: await read(pick('default')), first: !!first, firstBlocks: first ? await read(pick('first')) : []}; };
        if (lastSect) { doc.header = await hfOf(lastSect, 'header'); doc.footer = await hfOf(lastSect, 'footer'); }
        const bg = kid(kid(docXml, 'document'), 'background'); if (bg && /^[0-9a-f]{6}$/i.test(attr(bg, 'w:color') || '')) doc.page.color = '#' + attr(bg, 'w:color').toLowerCase();
        const settings = await xml('word/settings.xml'); if (kid(kid(settings, 'settings'), 'trackRevisions')) doc.track = true;
        const core = await xml('docProps/core.xml'); const title = findAll(core, 'title')[0], author = findAll(core, 'creator')[0]; if (title) doc.title = xtext(title).trim().slice(0, 200); if (author) doc.meta.author = xtext(author).trim().slice(0, 120);
        // les polices et tailles du style Normal du fichier
        const defR = findAll(stylesX, 'rPrDefault')[0], nm = [...styleMap.entries()].find(([id, s]) => s.type === 'paragraph' && (id === 'Normal' || /^normal$/i.test(s.name)));
        const nr = readRPr(kid(defR, 'rPr')), nr2 = readRPr(nm?.[1]?.rPr, nr); const ns = doc.styles.find(s => s.id === 'normal'); if (nr2.font) ns.font = nr2.font; if (nr2.sz) ns.size = nr2.sz;
        doc.styles.push(...docStyles);
        const used = new Set(T.allBlocks(doc).filter(b => b.t === 'p').map(b => b.st)); if (!comments.length) doc.comments = [];
        finish(doc);
        doc.styles = doc.styles.filter(s => T.BUILTIN.has(s.id) || used.has(s.id) || s.kind === 'c');
        return {doc, notices};
    }

    /* ═════════ ODT (LibreOffice) : écrire ═════════ */
    const NS_O = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" office:version="1.3"';
    const ODT_NAMES = {normal: ['Standard', 'Default Paragraph Style'], title: ['Title', 'Title'], subtitle: ['Subtitle', 'Subtitle'], quote: ['Quotations', 'Quotations'], caption: ['Caption', 'Caption'],
        h1: ['Heading_20_1', 'Heading 1'], h2: ['Heading_20_2', 'Heading 2'], h3: ['Heading_20_3', 'Heading 3'], h4: ['Heading_20_4', 'Heading 4'], h5: ['Heading_20_5', 'Heading 5'], h6: ['Heading_20_6', 'Heading 6']};
    const odtName = id => ODT_NAMES[id]?.[0] || ('Lc_' + String(id).replace(/[^A-Za-z0-9]/g, '_'));
    const cm = mm => `${r2(mm / 10)}cm`;
    const r2 = v => Math.round(Number(v) * 100) / 100;
    const ALIGN_O = {left: 'start', center: 'center', right: 'end', justify: 'justify'};
    function textPropsXml(r, fonts) {
        const a = [];
        if (r.b) a.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"'); else if (r.b === 0) a.push('fo:font-weight="normal"');
        if (r.i) a.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
        if (r.u) a.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
        if (r.s) a.push('style:text-line-through-style="solid" style:text-line-through-type="single"');
        if (r.sup) a.push('style:text-position="super 58%"'); else if (r.sub) a.push('style:text-position="sub 58%"');
        if (r.sc) a.push('fo:font-variant="small-caps"'); if (r.caps) a.push('fo:text-transform="uppercase"');
        if (r.col && hex6(r.col)) a.push(`fo:color="#${hex6(r.col).toLowerCase()}"`);
        if (r.bg && hex6(r.bg)) a.push(`fo:background-color="#${hex6(r.bg).toLowerCase()}"`);
        if (r.font) { const f = fontOk(r.font); fonts.add(f); a.push(`style:font-name="${xe(f)}"`); }
        if (r.sz) a.push(`fo:font-size="${r2(r.sz)}pt" style:font-size-asian="${r2(r.sz)}pt" style:font-size-complex="${r2(r.sz)}pt"`);
        return a.length ? `<style:text-properties ${a.join(' ')}/>` : '';
    }
    function paraPropsXml(b) {
        const a = [];
        if (b.al) a.push(`fo:text-align="${ALIGN_O[b.al] || 'start'}"`);
        if (b.sb != null) a.push(`fo:margin-top="${r2(b.sb)}pt"`); if (b.sa != null) a.push(`fo:margin-bottom="${r2(b.sa)}pt"`);
        if (b.il) a.push(`fo:margin-left="${cm(b.il)}"`); if (b.ir) a.push(`fo:margin-right="${cm(b.ir)}"`); if (b.fi) a.push(`fo:text-indent="${cm(b.fi)}"`);
        if (b.lh) a.push(`fo:line-height="${Math.round(b.lh * 100)}%"`);
        if (b.bg && hex6(b.bg)) a.push(`fo:background-color="#${hex6(b.bg).toLowerCase()}"`);
        if (b.bd) a.push('fo:border="0.5pt solid #444444" fo:padding="0.1cm"');
        if (b.hrule) a.push('fo:border-bottom="0.75pt solid #888888" fo:padding-bottom="0.05cm" fo:border-top="none" fo:border-left="none" fo:border-right="none"');
        if (b.pb) a.push('fo:break-before="page"');
        if (b.keep) a.push('fo:keep-with-next="always"');
        const drop = b.drop ? '<style:drop-cap style:lines="3" style:length="1" style:distance="0.1cm"/>' : '';
        return a.length || drop ? (drop ? `<style:paragraph-properties ${a.join(' ')}>${drop}</style:paragraph-properties>` : `<style:paragraph-properties ${a.join(' ')}/>`) : '';
    }
    async function toOdt(doc, opts = {}) {
        const imgs = opts.images instanceof Map ? opts.images : new Map(Object.entries(opts.images || {}));
        const auto = new Map(), autoXml = [], fonts = new Set(), pictures = [], changes = [], layouts = [], masters = [];
        let tN = 0, pN = 0, frN = 0, tabN = 0, chN = 0, secN = 0, notesN = 0;
        const normal = (doc.styles || []).find(s => s.id === 'normal') || BASE_STYLES[0]; fonts.add(fontOk(normal.font || 'Georgia'));
        const autoStyle = (family, key, xml, extraAttrs = '') => { const k = family + '|' + key + '|' + extraAttrs; if (auto.has(k)) return auto.get(k); const name = family === 'text' ? `T${++tN}` : `${{paragraph: 'P', graphic: 'fr', 'table-cell': 'C'}[family] || 'X'}${++pN}`; auto.set(k, name); autoXml.push(`<style:style style:name="${name}" style:family="${family}"${extraAttrs}>${xml}</style:style>`); return name; };
        // les pages : une mise en page et une page maîtresse par sorte de page (A4 portrait, paysage…)
        const pageOf = sec => { const pg = {...T.PAGE0, ...(doc.page || {}), ...(sec?.page || {})}, m = {...T.PAGE0.m, ...(doc.page?.m || {}), ...(sec?.page?.m || {})}; let w = pg.w, h = pg.h; const land = pg.orient === 'landscape'; if (land && h > w) [w, h] = [h, w]; if (!land && w > h) [w, h] = [h, w]; return {w, h, m, land, cols: pg.cols || 1, gap: pg.gap || 10}; };
        const masterFor = sec => { const p = pageOf(sec), key = JSON.stringify(p); let ms = masters.find(x => x.key === key); if (ms) return ms.name;
            const ln = `pm${layouts.length + 1}`, ht = hfHas.h ? p.m.t / 2 : p.m.t, fb = hfHas.f ? p.m.b / 2 : p.m.b;
            layouts.push(`<style:page-layout style:name="${ln}"><style:page-layout-properties fo:page-width="${cm(p.w)}" fo:page-height="${cm(p.h)}" style:print-orientation="${p.land ? 'landscape' : 'portrait'}" fo:margin-top="${cm(ht)}" fo:margin-bottom="${cm(fb)}" fo:margin-left="${cm(p.m.l)}" fo:margin-right="${cm(p.m.r)}"${doc.page?.color && hex6(doc.page.color) ? ` fo:background-color="#${hex6(doc.page.color).toLowerCase()}"` : ''}>${p.cols > 1 ? `<style:columns fo:column-count="${p.cols}" fo:column-gap="${cm(p.gap)}"/>` : ''}</style:page-layout-properties><style:header-style><style:header-footer-properties fo:min-height="${cm(p.m.t - ht)}" fo:margin-bottom="0cm" style:dynamic-spacing="false"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="${cm(p.m.b - fb)}" fo:margin-top="0cm" style:dynamic-spacing="false"/></style:footer-style></style:page-layout>`);
            const name = masters.length ? `Lc_${masters.length + 1}` : 'Standard'; masters.push({key, name, layout: ln}); return name; };
        const ctx = {doc, fonts, noteRuns: null};
        function runsOdt(runs) {
            const out = []; let open = [];
            const list = mergeRuns(runs);
            list.forEach((r, i) => {
                (r.cm || []).filter(id => !open.includes(id)).forEach(id => { const c = (doc.comments || []).find(x => x.id === id); if (!c) return; out.push(`<office:annotation office:name="${xe(id)}"><dc:creator>${xe(c.author || '')}</dc:creator><dc:date>${xe(isoDate(c.at).replace('Z', ''))}</dc:date><text:p>${xe(c.text || '')}</text:p>${(c.replies || []).map(rp => `<text:p>${xe(`${rp.author ? rp.author + ' : ' : ''}${rp.text || ''}`)}</text:p>`).join('')}</office:annotation>`); open.push(id); });
                out.push(oneRunOdt(r));
                const next = list[i + 1]?.cm || [];
                open.filter(id => !next.includes(id)).forEach(id => out.push(`<office:annotation-end office:name="${xe(id)}"/>`));
                open = open.filter(id => next.includes(id));
            });
            return out.join('');
        }
        const spaces = t => xe(t).replace(/ {2,}/g, m => ` <text:s text:c="${m.length - 1}"/>`).replace(/\t/g, '<text:tab/>').replace(/\n/g, '<text:line-break/>');
        function oneRunOdt(r) {
            const fmt = {b: r.b, i: r.i, u: r.u || (r.href || r.link ? 0 : 0), s: r.s, sup: r.sup, sub: r.sub, sc: r.sc, caps: r.caps, col: r.col, bg: r.bg, font: r.font, sz: r.sz};
            const tp = textPropsXml(fmt, fonts), sty = tp ? autoStyle('text', tp, tp, r.cs && !T.BUILTIN.has(r.cs) ? ` style:parent-style-name="${odtName(r.cs)}"` : '') : (r.cs && !T.BUILTIN.has(r.cs) ? odtName(r.cs) : '');
            let x;
            if (r.br) x = '<text:line-break/>';
            else if (r.tab) x = '<text:tab/>';
            else if (r.note) { const n = ++notesN, end = r.note.k === 'end'; x = `<text:note text:id="ftn${n}" text:note-class="${end ? 'endnote' : 'footnote'}"><text:note-citation>${n}</text:note-citation><text:note-body><text:p text:style-name="${end ? 'Endnote' : 'Footnote'}">${spaces(r.note.text || '')}</text:p></text:note-body></text:note>`; }
            else if (r.field === 'page') x = `<text:page-number text:select-page="current">${xe(r.fieldText || '1')}</text:page-number>`;
            else if (r.field === 'pages') x = `<text:page-count>${xe(r.fieldText || '1')}</text:page-count>`;
            else if (r.img) x = frame({...r.img, inline: true});
            else x = sty ? `<text:span text:style-name="${sty}">${spaces(r.x || r.fieldText || '')}</text:span>` : spaces(r.x || r.fieldText || '');
            if (r.tc) {
                const id = `ct${++chN}`, info = `<office:change-info><dc:creator>${xe(r.tc.a || 'LCNDA')}</dc:creator><dc:date>${xe(isoDate(r.tc.t).replace('Z', ''))}</dc:date></office:change-info>`;
                if (r.tc.k === 'del') { changes.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:deletion>${info}<text:p>${x}</text:p></text:deletion></text:changed-region>`); x = `<text:change text:change-id="${id}"/>`; }
                else { changes.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:insertion>${info}</text:insertion></text:changed-region>`); x = `<text:change-start text:change-id="${id}"/>${x}<text:change-end text:change-id="${id}"/>`; }
            }
            if (r.href && /^(https?:\/\/|mailto:)/i.test(r.href)) x = `<text:a xlink:type="simple" xlink:href="${xe(r.href)}">${x}</text:a>`;
            else if (r.link) x = `<text:a xlink:type="simple" xlink:href="#lcnda-${r.link.k === 'place' ? 'place' : 'person'}-${Number(r.link.id) || 0}${r.link.part ? '-' + String(r.link.part).replace(/[^a-z_]/g, '') : ''}" office:title="${r.link.k === 'place' ? 'Lieu' : 'Fiche'} de la base LCNDA">${x}</text:a>`;
            return x;
        }
        function frame(im) {
            let got = imgs.get(im.src); if (!got) { const d = fromDataUrl(im.src); if (d) got = {...d, ...(imageSize(d.data) || {})}; }
            if (!got || !['png', 'jpeg', 'gif', 'webp'].includes(got.type)) return xe(im.alt ? `[${im.alt}]` : '');
            let ent = pictures.find(x => x.src === im.src); if (!ent) { ent = {src: im.src, name: `Pictures/image${pictures.length + 1}.${got.type === 'jpeg' ? 'jpg' : got.type}`, data: got.data, type: got.type}; pictures.push(ent); }
            const wpx = clamp(im.w || got.w || 300, 8, 3000), ratio = got.w && got.h ? got.h / got.w : 0.75, hpx = Math.round(wpx * ratio);
            const wrap = im.inline ? 'none' : im.wrap === 'square' ? 'parallel' : 'none', pos = im.al === 'right' ? 'right' : im.al === 'left' ? 'left' : 'center';
            const fs = autoStyle('graphic', `${wrap}|${pos}|${im.inline ? 1 : 0}`, `<style:graphic-properties style:wrap="${wrap}" style:number-wrapped-paragraphs="no-limit" style:vertical-pos="top" style:vertical-rel="${im.inline ? 'baseline' : 'paragraph'}" style:horizontal-pos="${pos}" style:horizontal-rel="paragraph" fo:margin-left="0.2cm" fo:margin-right="0.2cm" fo:margin-top="0.1cm" fo:margin-bottom="0.1cm"/>`);
            const n = ++frN;
            return `<draw:frame draw:style-name="${fs}" draw:name="Image${n}" text:anchor-type="${im.inline ? 'as-char' : 'paragraph'}" svg:width="${cm(wpx / T.MM_PX)}" svg:height="${cm(hpx / T.MM_PX)}" draw:z-index="${n}"><draw:image xlink:href="${ent.name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${im.alt ? `<svg:desc>${xe(im.alt)}</svg:desc>` : ''}</draw:frame>`;
        }
        const pStyle = (b, extra = '') => { const pp = paraPropsXml(b), parent = odtName(b.st || 'normal'); if (!pp && !extra) return parent; return autoStyle('paragraph', `${parent}|${pp}|${extra}`, pp, ` style:parent-style-name="${parent}"${extra}`); };
        function blocksOdt(blocks, o = {}) {
            const out = []; let i = 0;
            while (i < blocks.length) {
                const b = blocks[i];
                if (b.t === 'p' && b.list) { const items = []; while (i < blocks.length && blocks[i].t === 'p' && blocks[i].list) items.push(blocks[i++]); out.push(listOdt(items, o)); continue; }
                out.push(blockOdt(b, o, i)); i++;
            }
            return out.join('');
        }
        function paraOdt(b, o, extra = '') {
            const lv = /^h([1-6])$/.exec(b.st || ''), st = o.firstMaster ? pStyle(b, ` style:master-page-name="${o.firstMaster}"`) : pStyle(b, extra);
            if (o.firstMaster) o.firstMaster = '';
            return lv ? `<text:h text:style-name="${st}" text:outline-level="${lv[1]}">${runsOdt(b.runs)}</text:h>` : `<text:p text:style-name="${st}">${runsOdt(b.runs)}</text:p>`;
        }
        function listOdt(items, o) {
            // des listes imbriquées selon le niveau ; chaque liste à la sorte (puces, numéros) de son premier élément
            let h = '', depth = -1; const kinds = [];
            items.forEach(b => {
                const L = clamp(b.list.l || 0, 0, 8), K = b.list.k === 'ol' ? 'L2' : 'L1';
                if (depth < 0) { h += `<text:list text:style-name="${K}"><text:list-item>`; depth = 0; kinds[0] = K; }
                else if (L > depth) { while (depth < L) { h += `<text:list><text:list-item>`; depth++; kinds[depth] = K; } }
                else { h += '</text:list-item>'; while (depth > L) { h += '</text:list></text:list-item>'; depth--; } if (depth === 0 && kinds[0] !== K) { h += `</text:list><text:list text:style-name="${K}">`; kinds[0] = K; } h += '<text:list-item>'; }
                const p = {...b}; delete p.list; h += paraOdt(p, o);
            });
            h += '</text:list-item>'; while (depth > 0) { h += '</text:list></text:list-item>'; depth--; } h += '</text:list>';
            return h;
        }
        function blockOdt(b, o) {
            if (b.t === 'p') return paraOdt(b, o);
            if (b.t === 'pb') return `<text:p text:style-name="${pStyle({st: 'normal', pb: true})}"/>`;
            if (b.t === 'hr') return `<text:p text:style-name="${pStyle({st: 'normal', hrule: true})}"/>`;
            if (b.t === 'img') { const x = `<text:p text:style-name="${pStyle({st: 'normal', al: b.wrap === 'square' ? undefined : b.al || 'center', keep: !!b.cap}, o.firstMaster ? ` style:master-page-name="${o.firstMaster}"` : '')}">${frame(b)}</text:p>`; o.firstMaster = ''; return x + (b.cap ? `<text:p text:style-name="Caption">${spaces(b.cap)}</text:p>` : ''); }
            if (b.t === 'table') {
                const n = ++tabN, name = `Tableau${n}`, rows = b.rows || [], nCols = Math.max(1, ...rows.map(r => r.reduce((k, c) => k + Math.max(1, c.cs || 1), 0)));
                const pg = pageOf(o.sec), tw = Math.max(20, pg.w - pg.m.l - pg.m.r), cols = b.cols && b.cols.length === nCols ? b.cols : Array.from({length: nCols}, () => 100 / nCols);
                autoXml.push(`<style:style style:name="${name}" style:family="table"><style:table-properties style:width="${cm(tw)}" table:align="margins"/></style:style>`);
                cols.forEach((w, k) => autoXml.push(`<style:style style:name="${name}.C${k + 1}" style:family="table-column"><style:table-column-properties style:column-width="${cm(tw * w / 100)}"/></style:style>`));
                const cellSt = bg => autoStyle('table-cell', `${b.bd === false ? 0 : 1}|${bg || ''}`, `<style:table-cell-properties fo:padding="0.1cm" fo:border="${b.bd === false ? 'none' : '0.5pt solid #808080'}"${bg && hex6(bg) ? ` fo:background-color="#${hex6(bg).toLowerCase()}"` : ''}/>`);
                const grid = []; rows.forEach((r, ri) => { grid[ri] = grid[ri] || []; let ci = 0; r.forEach(c => { while (grid[ri][ci]) ci++; const cs = Math.max(1, c.cs || 1), rs = Math.max(1, c.rs || 1); for (let y = 0; y < rs; y++) { grid[ri + y] = grid[ri + y] || []; for (let x = 0; x < cs; x++) grid[ri + y][ci + x] = y || x ? 'cov' : c; } ci += cs; }); });
                const rowX = (ri) => `<table:table-row>${Array.from({length: nCols}, (_, ci) => { const g = grid[ri]?.[ci]; if (g === 'cov') return '<table:covered-table-cell/>'; if (!g) return `<table:table-cell table:style-name="${cellSt('')}" office:value-type="string"><text:p/></table:table-cell>`;
                    return `<table:table-cell table:style-name="${cellSt(g.bg)}" office:value-type="string"${g.cs > 1 ? ` table:number-columns-spanned="${g.cs}"` : ''}${g.rs > 1 ? ` table:number-rows-spanned="${g.rs}"` : ''}>${blocksOdt(g.blocks || [], {...o, firstMaster: ''}) || '<text:p/>'}</table:table-cell>`; }).join('')}</table:table-row>`;
                const nh = clamp(b.head || 0, 0, grid.length);
                const x = `<table:table table:name="${name}" table:style-name="${name}">${cols.map((_, k) => `<table:table-column table:style-name="${name}.C${k + 1}"/>`).join('')}${nh ? `<table:table-header-rows>${grid.slice(0, nh).map((_, ri) => rowX(ri)).join('')}</table:table-header-rows>` : ''}${grid.slice(nh).map((_, k) => rowX(k + nh)).join('')}</table:table>`;
                if (o.firstMaster) { const m = o.firstMaster; o.firstMaster = ''; return `<text:p text:style-name="${pStyle({st: 'normal'}, ` style:master-page-name="${m}"`)}"/>${x}`; }
                return x;
            }
            if (b.t === 'cols') { const n = ++secN, name = `Sect${n}`; autoXml.push(`<style:style style:name="${name}" style:family="section"><style:section-properties text:dont-balance-text-columns="false"><style:columns fo:column-count="${clamp(b.n || 2, 2, 6)}" fo:column-gap="0.5cm"/></style:section-properties></style:style>`); return `<text:section text:style-name="${name}" text:name="Colonnes${n}">${blocksOdt(b.blocks || [], o)}</text:section>`; }
            if (b.t === 'toc' || b.t === 'index' || b.t === 'bib') return (b.blocks || []).map(x => x.t === 'p' ? `<text:p text:style-name="${!x.lvl ? (b.t === 'toc' ? 'Contents_20_Heading' : b.t === 'index' ? 'Index_20_Heading' : 'Bibliography_20_Heading') : b.t === 'toc' ? `Contents_20_${clamp(x.lvl || 1, 1, 3)}` : b.t === 'index' ? 'Index_20_1' : 'Bibliography_20_1'}">${runsOdt(x.runs)}</text:p>` : blockOdt(x, o)).join('');
            return '';
        }
        const hfHas = {h: (doc.header?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field)) || !!doc.header?.first, f: (doc.footer?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field)) || !!doc.footer?.first};
        const secs = doc.sections || [], body = [];
        secs.forEach((sec, si) => { const m = masterFor(sec); const o = {sec, firstMaster: si > 0 ? m : ''}; body.push(blocksOdt(sec.blocks || [], o)); });
        if (!masters.length) masterFor({});
        const hfOdt = blocks => blocksOdt(blocks || [], {sec: secs[0]});
        const hasH = (doc.header?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field)), hasF = (doc.footer?.blocks || []).some(b => T.blockText(b).trim() || (b.runs || []).some(r => r.field));
        const H = hasH ? `<style:header>${hfOdt(doc.header.blocks)}</style:header>` : '', F = hasF ? `<style:footer>${hfOdt(doc.footer.blocks)}</style:footer>` : '';
        const H1 = doc.header?.first ? `<style:header-first>${hfOdt(doc.header.firstBlocks) || '<text:p/>'}</style:header-first>` : '', F1 = doc.footer?.first ? `<style:footer-first>${hfOdt(doc.footer.firstBlocks) || '<text:p/>'}</style:footer-first>` : '';
        const bodyXml = body.join('');
        // les styles nommés (comme LibreOffice : Standard, Heading 1…, et les styles à soi)
        const sty = s => { const r = textPropsXml({font: s.font, b: s.b, i: s.i, u: s.u, s: s.s, sc: s.sc, caps: s.caps, col: s.color, bg: s.bg, sz: s.size}, fonts); const p = s.kind === 'c' ? '' : paraPropsXml({al: s.align, sb: s.before, sa: s.after, il: s.il, ir: s.ir, fi: s.fi, lh: s.line, keep: s.keep, bd: s.bd}); return p + r; };
        const named = (doc.styles || T.styleSet()).map(s => {
            const [nm, disp] = ODT_NAMES[s.id] || [odtName(s.id), s.name], lv = /^h([1-6])$/.exec(s.id);
            if (s.kind === 'c') return T.BUILTIN.has(s.id) ? '' : `<style:style style:name="${nm}" style:display-name="${xe(s.name)}" style:family="text">${sty(s)}</style:style>`;
            return `<style:style style:name="${nm}" style:display-name="${xe(disp)}" style:family="paragraph"${s.id !== 'normal' ? ' style:parent-style-name="Standard" style:next-style-name="Standard"' : ''}${lv ? ` style:default-outline-level="${lv[1]}"` : ''}${lv ? ' style:class="text"' : ''}>${sty(s)}</style:style>`;
        }).join('');
        const listStyles = `<text:list-style style:name="L1">${Array.from({length: 9}, (_, l) => `<text:list-level-style-bullet text:level="${l + 1}" text:bullet-char="${BULLETS[l]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${r2(1.27 + l * 0.635)}cm" fo:text-indent="-0.635cm" fo:margin-left="${r2(1.27 + l * 0.635)}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('')}</text:list-style>`
            + `<text:list-style style:name="L2">${Array.from({length: 9}, (_, l) => `<text:list-level-style-number text:level="${l + 1}" style:num-suffix="." style:num-format="${['1', 'a', 'i'][l % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${r2(1.27 + l * 0.635)}cm" fo:text-indent="-0.635cm" fo:margin-left="${r2(1.27 + l * 0.635)}cm"/></style:list-level-properties></text:list-level-style-number>`).join('')}</text:list-style>`;
        const fontDecl = () => `<office:font-face-decls>${[...fonts].map(f => `<style:font-face style:name="${xe(f)}" svg:font-family="'${xe(f)}'" style:font-family-generic="${/courier|mono/i.test(f) ? 'modern' : /arial|helvetica|verdana|sans/i.test(f) ? 'swiss' : 'roman'}"/>`).join('')}</office:font-face-decls>`;
        const extraNamed = ['Footnote', 'Endnote'].map(n => `<style:style style:name="${n}" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-left="0.6cm" fo:text-indent="-0.6cm" fo:margin-bottom="0cm"/><style:text-properties fo:font-size="9pt"/></style:style>`).join('')
            + [1, 2, 3].map(n => `<style:style style:name="Contents_20_${n}" style:display-name="Contents ${n}" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="${r2((n - 1) * 0.5)}cm"><style:tab-stops><style:tab-stop style:position="16cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style>`).join('')
            + ['Contents', 'Index', 'Bibliography'].map(k => `<style:style style:name="${k}_20_Heading" style:display-name="${k} Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:text-properties fo:font-weight="bold" fo:font-size="14pt"/></style:style>`).join('')
            + '<style:style style:name="Index_20_1" style:display-name="Index 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index"/><style:style style:name="Bibliography_20_1" style:display-name="Bibliography 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="1cm" fo:text-indent="-1cm"/></style:style>';
        const masterXml = masters.map(m => `<style:master-page style:name="${m.name}" style:page-layout-name="${m.layout}">${H}${H1}${F}${F1}</style:master-page>`).join('');
        const stylesDoc = `${XMLH}<office:document-styles ${NS_O}>${fontDecl()}<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.21cm" fo:line-height="115%"/><style:text-properties style:font-name="${xe(fontOk(normal.font || 'Georgia'))}" fo:font-size="${r2(normal.size || 12)}pt" fo:language="${(doc.lang || 'fr').slice(0, 2)}" fo:country="${(doc.lang || 'fr').slice(0, 2) === 'fr' ? 'FR' : 'none'}"/></style:default-style>${named}${extraNamed}${listStyles}<text:notes-configuration text:note-class="footnote" style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/><text:notes-configuration text:note-class="endnote" style:num-format="i" text:start-value="0"/></office:styles><office:automatic-styles>${layouts.join('')}</office:automatic-styles><office:master-styles>${masterXml}</office:master-styles></office:document-styles>`;
        const content = `${XMLH}<office:document-content ${NS_O}>${fontDecl()}<office:automatic-styles>${autoXml.join('')}</office:automatic-styles><office:body><office:text>${changes.length ? `<text:tracked-changes text:track-changes="${doc.track ? 'true' : 'false'}">${changes.join('')}</text:tracked-changes>` : ''}${bodyXml}</office:text></office:body></office:document-content>`;
        const now = isoDate().replace('Z', '');
        const meta = `${XMLH}<office:document-meta ${NS_O}><office:meta><meta:generator>LCNDA — Traitement de texte</meta:generator><dc:title>${xe(doc.title || '')}</dc:title><dc:subject>${xe(doc.meta?.subject || '')}</dc:subject><dc:creator>${xe(doc.meta?.author || '')}</dc:creator><dc:language>${xe(doc.lang || 'fr')}</dc:language><meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date><meta:document-statistic meta:word-count="${T.wordCount(T.allBlocks(doc).map(T.blockText).join(' '))}"/></office:meta></office:document-meta>`;
        const manifest = `${XMLH}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pictures.map(p => `<manifest:file-entry manifest:full-path="${p.name}" manifest:media-type="image/${p.type}"/>`).join('')}</manifest:manifest>`;
        const files = [{name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true}, {name: 'content.xml', data: content}, {name: 'styles.xml', data: stylesDoc}, {name: 'meta.xml', data: meta}, ...pictures.map(p => ({name: p.name, data: p.data, store: true})), {name: 'META-INF/manifest.xml', data: manifest}];
        if (opts.files) return files;
        return S().makeZip(files, 'application/vnd.oasis.opendocument.text');
    }

    /* ═════════ ODT : lire ═════════ */
    const lenMm = v => { const m = /^(-?[\d.]+)(cm|mm|in|pt|pc|px)?$/.exec(String(v || '').trim()); if (!m) return undefined; const n = Number(m[1]), u = m[2] || 'cm'; return Math.round((u === 'cm' ? n * 10 : u === 'mm' ? n : u === 'in' ? n * 25.4 : u === 'pt' ? n * 25.4 / 72 : u === 'pc' ? n * 25.4 / 6 : n / T.MM_PX) * 10) / 10; };
    const lenPt = v => { const mm = lenMm(v); return mm == null ? undefined : Math.round(mm / 25.4 * 72 * 10) / 10; };
    function odtTextProps(tp) {
        const o = {}; if (!tp) return o;
        const a = n => attr(tp, n);
        if (a('fo:font-weight')) o.b = /bold|[6-9]00/.test(a('fo:font-weight')) ? 1 : 0;
        if (a('fo:font-style')) o.i = a('fo:font-style') === 'italic' || a('fo:font-style') === 'oblique' ? 1 : 0;
        if (a('style:text-underline-style')) o.u = a('style:text-underline-style') !== 'none' ? 1 : 0;
        if (a('style:text-line-through-style')) o.s = a('style:text-line-through-style') !== 'none' ? 1 : 0;
        const pos = String(a('style:text-position') || ''); if (/^super|^\d+%?/.test(pos) && !/^0/.test(pos)) o.sup = 1; if (/^sub|^-/.test(pos)) o.sub = 1;
        if (a('fo:font-variant') === 'small-caps') o.sc = 1; if (a('fo:text-transform') === 'uppercase') o.caps = 1;
        if (/^#[0-9a-f]{6}$/i.test(a('fo:color') || '') && !/^#000000$/i.test(a('fo:color'))) o.col = a('fo:color').toLowerCase();
        if (/^#[0-9a-f]{6}$/i.test(a('fo:background-color') || '') && !/^#ffffff$/i.test(a('fo:background-color'))) o.bg = a('fo:background-color').toLowerCase();
        if (a('style:font-name') || a('fo:font-family')) o.font = fontOk(String(a('style:font-name') || a('fo:font-family')).replace(/^'|'$/g, ''));
        if (/pt$/.test(a('fo:font-size') || '')) o.sz = Number(a('fo:font-size').replace('pt', ''));
        return o;
    }
    function odtParaProps(pp) {
        const o = {}; if (!pp) return o;
        const a = n => attr(pp, n);
        const al = a('fo:text-align'); if (al) o.al = {start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify'}[al];
        if (a('fo:margin-top') != null) o.sb = lenPt(a('fo:margin-top')); if (a('fo:margin-bottom') != null) o.sa = lenPt(a('fo:margin-bottom'));
        if (lenMm(a('fo:margin-left'))) o.il = lenMm(a('fo:margin-left')); if (lenMm(a('fo:margin-right'))) o.ir = lenMm(a('fo:margin-right')); if (lenMm(a('fo:text-indent'))) o.fi = lenMm(a('fo:text-indent'));
        const lh = /^([\d.]+)%$/.exec(a('fo:line-height') || ''); if (lh) o.lh = Number(lh[1]) / 100;
        if (/^#[0-9a-f]{6}$/i.test(a('fo:background-color') || '') && !/^#ffffff$/i.test(a('fo:background-color'))) o.bg = a('fo:background-color').toLowerCase();
        if (a('fo:border') && a('fo:border') !== 'none') o.bd = true; else if (a('fo:border-bottom') && a('fo:border-bottom') !== 'none' && (!a('fo:border-top') || a('fo:border-top') === 'none')) o.hrule = true;
        if (a('fo:break-before') === 'page') o.pb = true; if (a('fo:keep-with-next') === 'always') o.keep = true;
        if (kid(pp, 'drop-cap')) o.drop = true;
        return o;
    }
    async function fromOdt(buf) {
        const X = S(), z = await X.unzip(buf);
        const mt = await z.text('mimetype');
        if (!z.has('content.xml') || (mt && !/opendocument\.text/.test(mt))) throw new Error(mt && /opendocument/.test(mt) ? 'ce fichier LibreOffice n’est pas un texte (c’est un classeur ou une présentation)' : 'ce n’est pas un document LibreOffice (.odt)');
        const notices = []; if (z.names.some(n => /^Basic\//.test(n) || /^Scripts\//.test(n))) notices.push('Les macros du fichier sont ignorées (elles ne sont jamais lancées).');
        const content = X.parseXml(await z.text('content.xml')), stylesX = z.has('styles.xml') ? X.parseXml(await z.text('styles.xml')) : null;
        // tous les styles : nommés (styles.xml) et automatiques (les deux fichiers) ; un style hérite de son parent
        const styles = new Map(), pageLayouts = new Map(), masters = new Map(), listStyles = new Map();
        const readStyles = root => {
            findAll(root, 'style').filter(e => local(e.n) === 'style' && e.n.startsWith('style:')).forEach(e => styles.set(attr(e, 'style:name'), {family: attr(e, 'style:family'), parent: attr(e, 'style:parent-style-name'), disp: attr(e, 'style:display-name') || attr(e, 'style:name'), master: attr(e, 'style:master-page-name'), level: attr(e, 'style:default-outline-level'), t: odtTextProps(kid(e, 'text-properties')), p: odtParaProps(kid(e, 'paragraph-properties')), g: kid(e, 'graphic-properties'), c: kid(e, 'table-cell-properties'), s: kid(e, 'section-properties')}));
            findAll(root, 'page-layout').forEach(e => { const pp = kid(e, 'page-layout-properties'), cols = kid(pp, 'columns'), hh = kid(kid(e, 'header-style'), 'header-footer-properties'), fh = kid(kid(e, 'footer-style'), 'header-footer-properties'); pageLayouts.set(attr(e, 'style:name'), {hh: (lenMm(attr(hh, 'fo:min-height')) || 0) + (lenMm(attr(hh, 'fo:margin-bottom')) || 0), fh: (lenMm(attr(fh, 'fo:min-height')) || 0) + (lenMm(attr(fh, 'fo:margin-top')) || 0), w: lenMm(attr(pp, 'fo:page-width')), h: lenMm(attr(pp, 'fo:page-height')), orient: attr(pp, 'style:print-orientation'), m: {t: lenMm(attr(pp, 'fo:margin-top')) || 20, r: lenMm(attr(pp, 'fo:margin-right')) || 20, b: lenMm(attr(pp, 'fo:margin-bottom')) || 20, l: lenMm(attr(pp, 'fo:margin-left')) || 20}, cols: Number(attr(cols, 'fo:column-count')) || 1, color: attr(pp, 'fo:background-color')}); });
            findAll(root, 'master-page').forEach(e => masters.set(attr(e, 'style:name'), {layout: attr(e, 'style:page-layout-name'), header: kid(e, 'header'), footer: kid(e, 'footer'), headerFirst: kid(e, 'header-first'), footerFirst: kid(e, 'footer-first')}));
            findAll(root, 'list-style').forEach(e => listStyles.set(attr(e, 'style:name'), (e.c || []).filter(x => typeof x === 'object').map(x => (local(x.n) === 'list-level-style-bullet' ? 'ul' : 'ol'))));
        };
        if (stylesX) readStyles(stylesX); readStyles(content);
        const chain = (name, f) => { const out = []; let n = name, k = 0; while (n && styles.has(n) && k++ < 20) { out.unshift(styles.get(n)); n = styles.get(n).parent; } return out.reduce((a, s) => ({...a, ...f(s)}), {}); };
        const stId = name => { let n = name, k = 0; while (n && k++ < 20) { const s = styles.get(n); const id = NAME_TO_ST(s?.disp || n) || NAME_TO_ST(String(n).replace(/_20_/g, ' ')); if (id) return id; if (s?.level && Number(s.level) <= 6) return 'h' + s.level; if (!s) break; if (s.family === 'paragraph' && !s.parent) break; n = s.parent; } return null; };
        const custom = new Map(), docStyles = [];
        const customOf = (name, kind) => { if (custom.has(name)) return custom.get(name); const s = styles.get(name); if (!s) return null; const id = 'u-' + String(name).replace(/[^\w-]/g, '').slice(0, 30), t = chain(name, x => x.t), pp = chain(name, x => x.p);
            const st = T.cleanStyle({id, name: String(s.disp).replace(/_20_/g, ' '), kind, font: t.font, size: t.sz, color: t.col, bg: t.bg, b: t.b, i: t.i, u: t.u, s: t.s, sc: t.sc, caps: t.caps, align: pp.al, line: pp.lh, before: pp.sb, after: pp.sa, il: pp.il, ir: pp.ir, fi: pp.fi});
            if (st) docStyles.push(st); custom.set(name, st ? id : null); return st ? id : null; };
        // le style d'un paragraphe : le style nommé (Titre 1…), puis ce que le style automatique ajoute
        const paraStyle = name => { const s = styles.get(name); if (!s) return {st: 'normal'}; const auto = s && !stylesX?.c ? false : true;
            let named = name; if (s.parent && !NAME_TO_ST(s.disp) && !(s.level)) { // automatique : son parent est le style nommé
                const isAuto = findAll(kid(content, 'document-content'), 'automatic-styles').some(a => kids(a, 'style').some(e => attr(e, 'style:name') === name)); if (isAuto) named = s.parent; }
            let st = stId(named) || (named && styles.has(named) && !/^Standard$/.test(named) ? customOf(named, 'p') : null) || 'normal';
            const own = named !== name ? s.p : {}; return {st, ...own, master: s.master, t: named !== name ? s.t : {}}; };
        const textOf = name => { const s = styles.get(name); if (!s) return {}; const o = {...chain(name, x => x.t)}; const top = (() => { let n = name; while (styles.get(n)?.parent) n = styles.get(n).parent; return n; })(); if (styles.get(name)?.parent && !NAME_TO_ST(styles.get(top)?.disp)) { /* style de caractère nommé */ } return o; };
        const charStyleOf = name => { const s = styles.get(name); if (!s || s.family !== 'text') return null; const isAuto = findAll(kid(content, 'document-content'), 'automatic-styles').some(a => kids(a, 'style').some(e => attr(e, 'style:name') === name)); const n = isAuto ? s.parent : name; return n && !/^(Internet_20_link|Footnote|Endnote|Visited)/i.test(n) ? customOf(n, 'c') : null; };
        // les suppressions suivies : leur texte est rangé à part, dans text:tracked-changes
        const changes = new Map();
        findAll(content, 'changed-region').forEach(r => { const id = attr(r, 'text:id') || attr(r, 'xml:id'), del = kid(r, 'deletion'), ins = kid(r, 'insertion'), info = kid(del || ins || kid(r, 'format-change'), 'change-info'); changes.set(id, {k: del ? 'del' : ins ? 'ins' : 'fmt', a: xtext(kid(info, 'creator')), t: xtext(kid(info, 'date')), text: del ? kids(del, 'p').concat(kids(del, 'h')).map(xtext).join('\n') : ''}); });
        let imgBytes = 0, imgCount = 0;
        const pic = async href => { if (!href || /^(https?:|\.\.\/|\/)/i.test(href) || ++imgCount > T.LIMITS.images) return null; const u8 = await z.read(href.replace(/^\.\//, '')); if (!u8) return null; imgBytes += u8.length; if (imgBytes > T.LIMITS.imageBytes) return null; const t = sniffImage(u8); if (!['png', 'jpeg', 'gif', 'webp'].includes(t)) { if (!notices.some(x => x.startsWith('Une image'))) notices.push('Une image d’une sorte que le navigateur ne montre pas (SVG, EMF, WMF…) a été laissée de côté.'); return null; } return {src: dataUrl(u8, t), ...(imageSize(u8) || {})}; };
        const comments = [], doc = {...T.newDoc(), comments, sections: []};
        let nodes = 0;
        async function inl(el, ctx, out, fmt) {
            for (const ch of el.c || []) {
                if (++nodes > 6000000) throw new Error('fichier refusé : trop compliqué');
                if (typeof ch === 'string') { const t = ch.replace(/[\r\n]+/g, ' ').replace(/ {2,}/g, ' '); if (t) out.push(run(t, {...fmt, ...(ctx.ins ? {tc: ctx.ins} : {}), ...(ctx.cm.size ? {cm: [...ctx.cm]} : {})})); continue; }
                const n = local(ch.n);
                if (n === 'span') { const f = {...fmt, ...textOf(attr(ch, 'text:style-name'))}; const cs = charStyleOf(attr(ch, 'text:style-name')); if (cs) f.cs = cs; await inl(ch, ctx, out, f); }
                else if (n === 'a') { const h = String(attr(ch, 'xlink:href') || ''), lm = /^#lcnda-(person|place)-(\d+)(?:-([a-z_]+))?$/.exec(h); const f = {...fmt}; if (lm) f.link = {k: lm[1], id: Number(lm[2]), ...(lm[3] ? {part: lm[3]} : {})}; else if (/^(https?:\/\/|mailto:|#)/i.test(h)) f.href = h; await inl(ch, ctx, out, f); }
                else if (n === 's') out.push(run(' '.repeat(clamp(Number(attr(ch, 'text:c')) || 1, 1, 200)), fmt));
                else if (n === 'tab') out.push({tab: true, x: ''});
                else if (n === 'line-break') out.push({br: true});
                else if (n === 'soft-page-break' || n === 'bookmark' || n === 'bookmark-start' || n === 'bookmark-end' || n === 'reference-mark' || n === 'reference-mark-start' || n === 'reference-mark-end') continue;
                else if (n === 'note') { const end = attr(ch, 'text:note-class') === 'endnote', body = kid(ch, 'note-body'); out.push({note: {id: nid('n'), k: end ? 'end' : 'foot', text: [...kids(body, 'p'), ...kids(body, 'h')].map(xtext).join(' ').replace(/\s+/g, ' ').trim()}}); }
                else if (n === 'page-number') out.push({field: 'page', fieldText: xtext(ch) || '1'});
                else if (n === 'page-count') out.push({field: 'pages', fieldText: xtext(ch) || '1'});
                else if (n === 'change-start') { const c = changes.get(attr(ch, 'text:change-id')); if (c?.k === 'ins') ctx.ins = {k: 'ins', id: 't' + attr(ch, 'text:change-id'), a: c.a, t: c.t}; }
                else if (n === 'change-end') ctx.ins = null;
                else if (n === 'change') { const c = changes.get(attr(ch, 'text:change-id')); if (c?.k === 'del' && c.text) out.push(run(c.text, {...fmt, tc: {k: 'del', id: 't' + attr(ch, 'text:change-id'), a: c.a, t: c.t}})); }
                else if (n === 'annotation') { const name = attr(ch, 'office:name') || nid('c'), id = 'c' + String(name).replace(/[^\w-]/g, '').slice(0, 30); comments.push({id, text: kids(ch, 'p').map(xtext).join('\n').trim(), author: xtext(kid(ch, 'creator')), at: xtext(kid(ch, 'date'))}); if (attr(ch, 'office:name')) ctx.cm.add(id); }
                else if (n === 'annotation-end') ctx.cm.delete('c' + String(attr(ch, 'office:name') || '').replace(/[^\w-]/g, '').slice(0, 30));
                else if (n === 'frame') { const im = kid(ch, 'image'); const got = im ? await pic(attr(im, 'xlink:href')) : null; if (!got) { const tb = kid(ch, 'text-box'); if (tb) out.push(run(xtext(tb), fmt)); continue; }
                    const w = Math.round((lenMm(attr(ch, 'svg:width')) || 80) * T.MM_PX), h = Math.round((lenMm(attr(ch, 'svg:height')) || 60) * T.MM_PX), st = styles.get(attr(ch, 'draw:style-name')), g = st?.g;
                    const anchor = attr(ch, 'text:anchor-type'), alt = xtext(kid(ch, 'desc')) || xtext(kid(ch, 'title')) || '';
                    if (anchor === 'as-char' || anchor === 'char') out.push({img: {src: got.src, w, h, alt}});
                    else out.push({img: {src: got.src, w, h, alt}, anchor: {wrap: ['parallel', 'dynamic', 'left', 'right', 'run-through'].includes(attr(g, 'style:wrap')) ? 'square' : 'topbottom', al: ({left: 'left', right: 'right', center: 'center', 'from-left': 'left', inside: 'left', outside: 'right'})[attr(g, 'style:horizontal-pos')] || 'center'}}); }
                else await inl(ch, ctx, out, fmt);
            }
            return out;
        }
        async function paraOf(el, ctx, extra = {}) {
            const ps = paraStyle(attr(el, 'text:style-name'));
            let st = ps.st; if (local(el.n) === 'h' && (st === 'normal' || !st)) st = 'h' + clamp(Number(attr(el, 'text:outline-level')) || 1, 1, 6);
            const base = {...ps}; delete base.st; delete base.master; delete base.t;
            const runs = await inl(el, ctx, [], {...ps.t});
            const out = []; let cur = [];
            const flush = force => { if (!cur.length && !force) return; const b = {t: 'p', st: st && !st.startsWith('__') ? st : 'normal', ...base, ...extra, runs: mergeRuns(cur.map(r => { const o = {...r}; delete o.anchor; return o; }))}; if (st?.startsWith('__')) b._gen = st; if (b.hrule) { delete b.hrule; if (!plainOf(b.runs).trim()) { out.push({t: 'hr'}); cur = []; return; } } if (b.pb && !plainOf(b.runs).trim() && !b.runs.some(r => r.img)) { out.push({t: 'pb'}); cur = []; return; } out.push(b); cur = []; };
            for (const r of runs) { if (r.anchor) { out.push({t: 'img', src: r.img.src, w: r.img.w, h: r.img.h, alt: r.img.alt, wrap: r.anchor.wrap, al: r.anchor.al}); continue; } cur.push(r); }
            if (cur.length && cur.every(r => r.img || (!r.x || !r.x.trim()) && !r.note && !r.field) && cur.filter(r => r.img).length === 1 && !extra.list) { const r = cur.find(x => x.img); out.push({t: 'img', src: r.img.src, w: r.img.w, h: r.img.h, alt: r.img.alt, wrap: 'topbottom', al: base.al || 'center'}); cur = []; }
            if (cur.length || !out.length) flush(true);
            if (ps.master && ctx.onMaster) ctx.onMaster(ps.master, out);
            if (base.pb && out[0]?.t === 'p') { out[0].pb = true; }
            return out;
        }
        async function listOf(el, ctx, level, kind) {
            const out = [], ls = listStyles.get(attr(el, 'text:style-name'));
            const k = ls ? ls[Math.min(level, ls.length - 1)] : kind || 'ul';
            for (const item of kids(el)) {
                if (!['list-item', 'list-header'].includes(local(item.n))) continue;
                for (const ch of kids(item)) { const n = local(ch.n); if (n === 'p' || n === 'h') out.push(...(await paraOf(ch, ctx, {list: {k, l: clamp(level, 0, 8)}}))); else if (n === 'list') out.push(...await listOf(ch, ctx, level + 1, k)); }
            }
            return out;
        }
        async function tableOf(el, ctx) {
            const rows = []; let head = 0;
            const rowEls = []; const walk = (e, inHead) => kids(e).forEach(x => { const n = local(x.n); if (n === 'table-row') rowEls.push({x, inHead}); else if (['table-header-rows', 'table-rows', 'table-row-group'].includes(n)) walk(x, inHead || n === 'table-header-rows'); });
            walk(el, false);
            for (const {x, inHead} of rowEls.slice(0, 5000)) {
                if (inHead && head === rows.length) head++;
                const row = [];
                for (const c of kids(x)) { if (local(c.n) !== 'table-cell') continue; const blocks = []; for (const ch of kids(c)) { const n = local(ch.n); if (n === 'p' || n === 'h') blocks.push(...await paraOf(ch, ctx)); else if (n === 'list') blocks.push(...await listOf(ch, ctx, 0)); else if (n === 'table') blocks.push(await tableOf(ch, ctx)); }
                    const cell = {blocks: blocks.length ? blocks : [para([])]}, cs = Number(attr(c, 'table:number-columns-spanned')) || 1, rs = Number(attr(c, 'table:number-rows-spanned')) || 1; if (cs > 1) cell.cs = cs; if (rs > 1) cell.rs = rs;
                    const cp = styles.get(attr(c, 'table:style-name'))?.c; if (cp && /^#[0-9a-f]{6}$/i.test(attr(cp, 'fo:background-color') || '') && !/^#ffffff$/i.test(attr(cp, 'fo:background-color'))) cell.bg = attr(cp, 'fo:background-color').toLowerCase();
                    const rep = clamp(Number(attr(c, 'table:number-columns-repeated')) || 1, 1, 60); for (let k = 0; k < rep; k++) row.push(k ? {blocks: [para([])]} : cell); }
                rows.push(row);
            }
            return {t: 'table', head, rows};
        }
        async function blocksOf(el, ctx) {
            const out = [];
            for (const ch of kids(el)) {
                const n = local(ch.n);
                if (out.length > T.LIMITS.blocks) throw new Error('fichier refusé : beaucoup trop de paragraphes');
                if (n === 'p' || n === 'h') out.push(...await paraOf(ch, ctx));
                else if (n === 'list') out.push(...await listOf(ch, ctx, 0));
                else if (n === 'table') out.push(await tableOf(ch, ctx));
                else if (n === 'section') { const sp = styles.get(attr(ch, 'text:style-name'))?.s, cols = Number(attr(kid(sp, 'columns'), 'fo:column-count')) || 1; const inner = await blocksOf(ch, ctx); if (cols > 1) out.push({t: 'cols', n: clamp(cols, 2, 6), blocks: inner}); else out.push(...inner); }
                else if (n === 'table-of-content') out.push({t: 'toc'});
                else if (n === 'alphabetical-index') out.push({t: 'index'});
                else if (n === 'bibliography') out.push({t: 'bib'});
                else if (n === 'soft-page-break' || n === 'tracked-changes' || n === 'sequence-decls' || n === 'variable-decls' || n === 'user-field-decls') continue;
            }
            return out;
        }
        const office = kid(kid(kid(content, 'document-content'), 'body'), 'text'); if (!office) throw new Error('document LibreOffice sans texte');
        // une page maîtresse nouvelle = une nouvelle section (orientation, marges)
        const secStarts = [];
        const ctx = {cm: new Set(), ins: null, onMaster: (m, blocks) => { if (blocks.length) secStarts.push({master: m, first: blocks[0]}); }};
        const blocks = await blocksOf(office, ctx);
        for (let i = blocks.length - 1; i > 0; i--) if (blocks[i].t === 'p' && blocks[i].st === 'caption' && blocks[i - 1].t === 'img' && !blocks[i - 1].cap) { blocks[i - 1].cap = plainOf(blocks[i].runs); blocks.splice(i, 1); }
        const firstOf = new Set(secStarts.map(x => x.first)); groupGen(blocks); secStarts.forEach(x => { if (!blocks.includes(x.first)) x.first = null; }); void firstOf;
        const pageOfMaster = m => { const ms = masters.get(m) || masters.get('Standard') || [...masters.values()][0], pl = pageLayouts.get(ms?.layout); if (!pl) return {...T.PAGE0}; const land = pl.orient === 'landscape' || (pl.w > pl.h); return {w: pl.w || 210, h: pl.h || 297, m: {...pl.m, t: Math.round((pl.m.t + (ms?.header ? pl.hh : 0)) * 10) / 10, b: Math.round((pl.m.b + (ms?.footer ? pl.fh : 0)) * 10) / 10}, orient: land ? 'landscape' : 'portrait', cols: pl.cols || 1, gap: 10, color: pl.color}; };
        const firstMaster = secStarts.find(s => s.first === blocks[0])?.master || 'Standard';
        let cur = {page: pageOfMaster(firstMaster), blocks: []}; doc.sections.push(cur);
        blocks.forEach(b => { const s = secStarts.find(x => x.first === b); if (s && cur.blocks.length) { cur = {page: pageOfMaster(s.master), blocks: []}; doc.sections.push(cur); if (b.pb) delete b.pb; } cur.blocks.push(b); });
        const p0 = doc.sections[0].page; doc.page = {w: p0.w, h: p0.h, m: p0.m, orient: p0.orient, cols: p0.cols, gap: 10}; if (p0.color && /^#[0-9a-f]{6}$/i.test(p0.color) && !/^#ffffff$/i.test(p0.color)) doc.page.color = p0.color.toLowerCase();
        doc.sections.forEach(s => { const p = {w: s.page.w, h: s.page.h, m: s.page.m, orient: s.page.orient, cols: s.page.cols, gap: 10}; s.page = JSON.stringify(p) === JSON.stringify({...doc.page, color: undefined, gap: 10, cols: doc.page.cols}) || (p.orient === doc.page.orient && p.w === doc.page.w && JSON.stringify(p.m) === JSON.stringify(doc.page.m) && p.cols === doc.page.cols) ? null : p; });
        const ms = masters.get(firstMaster) || [...masters.values()][0];
        const hf = async (el, elFirst) => ({blocks: el ? await blocksOf(el, {cm: new Set(), ins: null}) : [], first: !!elFirst, firstBlocks: elFirst ? await blocksOf(elFirst, {cm: new Set(), ins: null}) : []});
        if (ms) { doc.header = await hf(ms.header, ms.headerFirst); doc.footer = await hf(ms.footer, ms.footerFirst); }
        const metaX = z.has('meta.xml') ? X.parseXml(await z.text('meta.xml')) : null; const ti = findAll(metaX, 'title')[0], au = findAll(metaX, 'creator')[0] || findAll(metaX, 'initial-creator')[0]; if (ti) doc.title = xtext(ti).trim().slice(0, 200); if (au) doc.meta.author = xtext(au).trim().slice(0, 120);
        const tc = findAll(content, 'tracked-changes')[0]; if (tc && attr(tc, 'text:track-changes') === 'true') doc.track = true;
        // la police et la taille par défaut
        const def = findAll(stylesX, 'default-style').find(e => attr(e, 'style:family') === 'paragraph'), dt = odtTextProps(kid(def, 'text-properties')), std = styles.get('Standard')?.t || {};
        doc.styles = T.styleSet('classique'); const ns = doc.styles.find(s => s.id === 'normal'); if (std.font || dt.font) ns.font = std.font || dt.font; if (std.sz || dt.sz) ns.size = std.sz || dt.sz;
        doc.styles.push(...docStyles);
        blocks.forEach(b => { delete b._gen; });
        finish(doc);
        return {doc, notices};
    }

    /* ═════════ RTF ═════════ */
    const rtfEsc = t => String(t || '').replace(/[\\{}]/g, c => '\\' + c).replace(/\t/g, '\\tab ').replace(/\n/g, '\\line ').replace(/[^\x00-\x7f]/g, c => { const n = c.charCodeAt(0); return `\\u${n > 32767 ? n - 65536 : n}?`; });
    function toRtf(doc) {
        const fonts = ['Georgia'], colors = [''];
        const fi = f => { f = fontOk(f) || 'Georgia'; let i = fonts.indexOf(f); if (i < 0) { fonts.push(f); i = fonts.length - 1; } return i; };
        const ci = c => { const h = hex6(c); if (!h) return 0; let i = colors.indexOf(h); if (i < 0) { colors.push(h); i = colors.length - 1; } return i; };
        const styles = doc.styles || T.styleSet(), normal = styles.find(x => x.id === 'normal') || BASE_STYLES[0]; fi(normal.font);
        const notes = [];
        const runR = r => {
            if (r.br) return '\\line '; if (r.tab) return '\\tab ';
            if (r.note) return `{\\super\\chftn}{\\footnote\\pard\\plain\\fs18 {\\super\\chftn} ${rtfEsc(r.note.text || '')}}`;
            if (r.field === 'page') return '{\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}'; if (r.field === 'pages') return '{\\field{\\*\\fldinst NUMPAGES}{\\fldrslt 1}}';
            if (r.img) return pictR(r.img);
            if (r.tc?.k === 'del') return '';
            const st = (styles.find(x => x.id === r.cs) || {}); const f = {...st, ...r};
            let c = ''; if (f.b) c += '\\b'; if (f.i) c += '\\i'; if (f.u) c += '\\ul'; if (f.s) c += '\\strike'; if (f.sup) c += '\\super'; if (f.sub) c += '\\sub'; if (f.sc) c += '\\scaps'; if (f.caps) c += '\\caps';
            if (r.col) c += `\\cf${ci(r.col)}`; if (r.bg) c += `\\highlight${ci(r.bg)}\\chcbpat${ci(r.bg)}`; if (r.font) c += `\\f${fi(r.font)}`; if (r.sz) c += `\\fs${Math.round(r.sz * 2)}`;
            const body = `{${c}${c ? ' ' : ''}${rtfEsc(r.x)}}`;
            return r.href && /^(https?:\/\/|mailto:)/i.test(r.href) ? `{\\field{\\*\\fldinst HYPERLINK "${rtfEsc(r.href)}"}{\\fldrslt ${body}}}` : body;
        };
        const pictR = im => { const d = fromDataUrl(im.src); if (!d || !['png', 'jpeg'].includes(d.type)) return rtfEsc(im.alt ? `[${im.alt}]` : '[image]'); const sz = imageSize(d.data) || {w: im.w || 300, h: im.h || 200}, w = im.w || sz.w, h = Math.round(w * (sz.h / sz.w)); let hx = ''; for (const b of d.data) hx += b.toString(16).padStart(2, '0'); return `{\\pict\\${d.type === 'png' ? 'pngblip' : 'jpegblip'}\\picw${sz.w}\\pich${sz.h}\\picwgoal${Math.round(w * 15)}\\pichgoal${Math.round(h * 15)} ${hx}}`; };
        const paraR = (b, inTable = false) => {
            const st = styles.find(x => x.id === b.st) || normal, o = {...st, ...b};
            let c = `\\pard${inTable ? '\\intbl' : ''}\\plain`;
            const lv = /^h([1-6])$/.exec(b.st || ''); if (lv) c += `\\outlinelevel${Number(lv[1]) - 1}`;
            const al = b.al || st.align; c += al === 'center' ? '\\qc' : al === 'right' ? '\\qr' : al === 'justify' ? '\\qj' : '\\ql';
            const sb = b.sb ?? st.before, sa = b.sa ?? st.after; if (sb) c += `\\sb${Math.round(sb * 20)}`; if (sa != null) c += `\\sa${Math.round(sa * 20)}`;
            const il = (b.il || st.il || 0) + (b.list ? 6.35 * (b.list.l + 1) : 0); if (il) c += `\\li${MMTW(il)}`; if (b.ir || st.ir) c += `\\ri${MMTW(b.ir || st.ir)}`; const fi0 = b.list ? -6.35 : b.fi || st.fi; if (fi0) c += `\\fi${MMTW(fi0)}`;
            if (b.pb) c += '\\pagebb'; if (b.bd) c += '\\box\\brdrs\\brdrw10\\brsp80'; if (b.bg) c += `\\cbpat${ci(b.bg)}`;
            c += `\\f${fi(o.font || normal.font)}\\fs${Math.round((o.size || normal.size || 12) * 2)}${o.b ? '\\b' : ''}${o.i ? '\\i' : ''}${o.color ? `\\cf${ci(o.color)}` : ''} `;
            const bullet = b.list ? (b.list.k === 'ol' ? `${b._n || 1}.\\tab ` : '\\u8226?\\tab ') : '';
            return `{${c}${bullet}${mergeRuns(b.runs).map(runR).join('')}\\par}\n`;
        };
        const blocksR = (blocks, inTable = false) => { const cnt = []; return blocks.map(b => {
            if (b.t === 'p') { if (b.list) { cnt.length = b.list.l + 1; cnt[b.list.l] = (cnt[b.list.l] || 0) + 1; b = {...b, _n: cnt[b.list.l]}; } else cnt.length = 0; return paraR(b, inTable); }
            cnt.length = 0;
            if (b.t === 'pb') return '\\page\n'; if (b.t === 'hr') return '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}\n';
            if (b.t === 'img') return `{\\pard\\q${b.al === 'right' ? 'r' : b.al === 'left' ? 'l' : 'c'} ${pictR(b)}\\par}\n${b.cap ? paraR({st: 'caption', runs: [run(b.cap)]}) : ''}`;
            if (b.t === 'table') { const n = Math.max(1, ...b.rows.map(r => r.reduce((k, c) => k + (c.cs || 1), 0))), tw = MMTW(160); return b.rows.map(r => { let x = 0; const defs = r.map(c => { x += (c.cs || 1); return `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs${c.bg ? `\\clcbpat${ci(c.bg)}` : ''}\\cellx${Math.round(tw * x / n)}`; }).join(''); return `\\trowd\\trgaph108${defs}\n${r.map(c => blocksR(c.blocks || [], true).replace(/\\par}\n$/, '}') + '\\cell ').join('')}\\row\n`; }).join('') + '\\pard\n'; }
            if (b.blocks) return blocksR(b.blocks);
            return '';
        }).join(''); };
        const body = (doc.sections || []).map((sec, i) => (i ? `\\sect\\sectd${sec.page?.orient === 'landscape' ? '\\lndscpsxn' : ''}\n` : '') + blocksR(sec.blocks || [])).join('');
        const hd = (doc.header?.blocks || []).length ? `{\\header ${blocksR(doc.header.blocks)}}` : '', ft = (doc.footer?.blocks || []).length ? `{\\footer ${blocksR(doc.footer.blocks)}}` : '';
        const pg = {...T.PAGE0, ...(doc.page || {})}, m = {...T.PAGE0.m, ...(doc.page?.m || {})}, land = pg.orient === 'landscape';
        const W = land ? Math.max(pg.w, pg.h) : Math.min(pg.w, pg.h), H = land ? Math.min(pg.w, pg.h) : Math.max(pg.w, pg.h);
        return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl${fonts.map((f, i) => `{\\f${i}\\f${/courier|mono/i.test(f) ? 'modern' : /arial|helvetica|verdana/i.test(f) ? 'swiss' : 'roman'} ${rtfEsc(f)};}`).join('')}}\n{\\colortbl;${colors.slice(1).map(h => `\\red${parseInt(h.slice(0, 2), 16)}\\green${parseInt(h.slice(2, 4), 16)}\\blue${parseInt(h.slice(4), 16)};`).join('')}}\n{\\info{\\title ${rtfEsc(doc.title || '')}}{\\author ${rtfEsc(doc.meta?.author || '')}}}\n\\paperw${MMTW(W)}\\paperh${MMTW(H)}\\margl${MMTW(m.l)}\\margr${MMTW(m.r)}\\margt${MMTW(m.t)}\\margb${MMTW(m.b)}${land ? '\\landscape' : ''}\\deflang1036\n${hd}${ft}\n${body}}`;
    }
    const CP1252 = {128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376};
    function fromRtf(text) {
        const src = String(text || '');
        if (!/^\s*\{\\rtf/.test(src)) throw new Error('ce n’est pas un fichier RTF');
        if (src.length > T.LIMITS.textBytes) throw new Error('fichier refusé : trop gros');
        const doc = T.newDoc(), blocks = [], colors = [], fonts = {};
        let cur = [], para0 = {}, st = {}, stack = [], skip = 0, uc = 1, ucSkip = 0, i = 0, depth = 0;
        let row = null, rows = null, cellBlocks = [], inTable = false, note = null, field = null, pict = null;
        const flushPara = () => { const sty = T.BASE_STYLES.find(x => x.id === (para0.st || 'normal')) || T.BASE_STYLES[0], nrm = T.BASE_STYLES[0]; cur.forEach(r => { if (r.font && r.font === (sty.font || nrm.font)) delete r.font; if (r.sz && (r.sz === (sty.size || nrm.size))) delete r.sz; if (r.col && (r.col === sty.color || r.col === nrm.color)) delete r.col; if (r.b && sty.b) delete r.b; }); const b = {t: 'p', st: para0.st || 'normal', ...para0, runs: mergeRuns(cur)}; delete b.intbl; if (inTable && row) cellBlocks.push(b); else { if (rows) { blocks.push({t: 'table', head: 0, rows}); rows = null; } blocks.push(b); } cur = []; };
        const push = t => { if (!t) return; if (note) { note.text += t; return; } if (field && field.inst) { field.instr += t; return; } if (pict) return; const f = {...st}; delete f.f; delete f.fs; if (field?.href) f.href = field.href; cur.push(run(t, f)); };
        const DEST = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'object', 'objdata', 'mmathPr', 'pgdsctbl', 'fldtype', 'bkmkstart', 'bkmkend', 'listtext', 'pntext', 'pntxtb', 'pntxta']);
        let tokens = 0;
        while (i < src.length) {
            if (++tokens > 8000000) throw new Error('fichier refusé : trop compliqué');
            const c = src[i];
            if (c === '{') { stack.push({st: {...st}, skip, dest: null, uc}); if (++depth > 200) throw new Error('fichier RTF trop imbriqué'); i++; continue; }
            if (c === '}') { const top = stack.pop(); depth--; if (top) { if (top.dest === 'footnote' && note) { cur.push({note: {id: nid('n'), k: 'foot', text: note.text.trim()}}); note = null; } if (top.dest === 'fldinst' && field) { field.inst = false; const hm = /HYPERLINK\s+"([^"]+)"/i.exec(field.instr); if (hm && /^(https?:\/\/|mailto:)/i.test(hm[1])) field.href = hm[1]; const fw = field.instr.trim().split(/\s+/)[0].toUpperCase(); if (fw === 'PAGE' || fw === 'NUMPAGES') field.page = fw === 'PAGE' ? 'page' : 'pages'; } if (top.dest === 'field' && field) { field = null; } if (top.dest === 'fldrslt' && field?.page) { cur = cur.filter(r => !r._fr); cur.push({field: field.page, fieldText: '1'}); } if (top.dest === 'pict' && pict) { const hx = pict.hex.replace(/[^0-9a-f]/gi, ''); if (hx.length > 16 && hx.length < 2 * T.LIMITS.imageBytes) { const u8 = new Uint8Array(hx.length >> 1); for (let k = 0; k < u8.length; k++) u8[k] = parseInt(hx.substr(k * 2, 2), 16); const t = sniffImage(u8); if (['png', 'jpeg'].includes(t)) cur.push({img: {src: dataUrl(u8, t), w: pict.w || (imageSize(u8) || {}).w || 200, alt: ''}}); } pict = null; } st = top.st; skip = top.skip; uc = top.uc; } i++; continue; }
            if (c === '\\') {
                const n1 = src[i + 1];
                if (n1 === '\\' || n1 === '{' || n1 === '}') { if (!skip) push(n1); i += 2; continue; }
                if (n1 === "'") { const code = parseInt(src.substr(i + 2, 2), 16); if (ucSkip > 0) { ucSkip--; } else if (!skip) push(String.fromCharCode(CP1252[code] || code)); i += 4; continue; }
                if (n1 === '*') { stack[stack.length - 1] && (stack[stack.length - 1].star = true); i += 2; continue; }
                if (n1 === '~') { if (!skip) push('\u00a0'); i += 2; continue; } if (n1 === '-') { i += 2; continue; } if (n1 === '_') { if (!skip) push('‑'); i += 2; continue; }
                if (n1 === '\n' || n1 === '\r') { if (!skip) { flushPara(); } i += 2; continue; }
                const m = /^\\([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(src.slice(i, i + 48)); if (!m) { i++; continue; }
                i += m[0].length; const w = m[1], arg = m[2] != null ? Number(m[2]) : null;
                const top = stack[stack.length - 1];
                if (top && !top.dest) {
                    if (DEST.has(w) || (top.star && !['fldinst'].includes(w))) { top.dest = w; if (w === 'colortbl') { top.dest = 'colortbl'; } else { skip = 1; } if (w !== 'colortbl') continue; }
                    if (w === 'footnote') { top.dest = 'footnote'; note = {text: ''}; continue; }
                    if (w === 'field') { top.dest = 'field'; field = {instr: '', inst: false}; continue; }
                    if (w === 'fldinst') { top.dest = 'fldinst'; if (field) field.inst = true; continue; }
                    if (w === 'fldrslt') { top.dest = 'fldrslt'; continue; }
                    if (w === 'pict') { top.dest = 'pict'; pict = {hex: '', w: 0}; continue; }
                }
                if (top?.dest === 'colortbl') { if (w === 'red') colors._r = arg; if (w === 'green') colors._g = arg; if (w === 'blue') colors._b = arg; continue; }
                if (pict) { if (w === 'picwgoal') pict.w = Math.round(arg / 15); continue; }
                if (skip) continue;
                switch (w) {
                    case 'par': flushPara(); break; case 'line': cur.push({br: true}); break; case 'tab': cur.push({tab: true, x: ''}); break;
                    case 'page': flushPara(); blocks.push({t: 'pb'}); break; case 'sect': break;
                    case 'pard': para0 = {}; if (!inTable) row = null; break; case 'plain': st = {}; break;
                    case 'b': st.b = arg === 0 ? 0 : 1; break; case 'i': st.i = arg === 0 ? 0 : 1; break; case 'ul': st.u = arg === 0 ? 0 : 1; break; case 'ulnone': st.u = 0; break;
                    case 'strike': st.s = arg === 0 ? 0 : 1; break; case 'super': st.sup = 1; delete st.sub; break; case 'sub': st.sub = 1; delete st.sup; break; case 'nosupersub': delete st.sup; delete st.sub; break;
                    case 'scaps': st.sc = arg === 0 ? 0 : 1; break; case 'caps': st.caps = arg === 0 ? 0 : 1; break;
                    case 'cf': if (colors[arg]) st.col = colors[arg]; else delete st.col; break; case 'highlight': case 'chcbpat': if (colors[arg]) st.bg = colors[arg]; else delete st.bg; break;
                    case 'fs': if (arg > 0) st.sz = arg / 2; break; case 'f': st.font = fonts[arg]; break;
                    case 'qc': para0.al = 'center'; break; case 'qr': para0.al = 'right'; break; case 'qj': para0.al = 'justify'; break; case 'ql': para0.al = 'left'; break;
                    case 'sb': para0.sb = arg / 20; break; case 'sa': para0.sa = arg / 20; break; case 'li': if (arg) para0.il = TWMM(arg); break; case 'ri': if (arg) para0.ir = TWMM(arg); break; case 'fi': if (arg) para0.fi = TWMM(arg); break;
                    case 'outlinelevel': if (arg >= 0 && arg < 6) para0.st = 'h' + (arg + 1); break; case 'pagebb': para0.pb = true; break;
                    case 'intbl': inTable = true; if (!row) { row = []; rows = rows || []; } break;
                    case 'cell': flushPara(); if (row) row.push({blocks: cellBlocks.length ? cellBlocks : [para([])]}); cellBlocks = []; break;
                    case 'row': if (row) { rows = rows || []; rows.push(row); } row = []; inTable = false; break;
                    case 'trowd': row = []; break;
                    case 'u': { const cp = arg < 0 ? arg + 65536 : arg; push(String.fromCharCode(cp)); ucSkip = uc; break; }
                    case 'uc': uc = arg || 0; break;
                    case 'emdash': push('—'); break; case 'endash': push('–'); break; case 'bullet': push('•'); break; case 'lquote': push('‘'); break; case 'rquote': push('’'); break; case 'ldblquote': push('“'); break; case 'rdblquote': push('”'); break;
                }
                continue;
            }
            if (c === '\r' || c === '\n') { i++; continue; }
            const top = stack[stack.length - 1];
            if (top?.dest === 'colortbl') { if (c === ';') { colors.push(colors._r == null ? null : '#' + [colors._r, colors._g, colors._b].map(v => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')); colors._r = colors._g = colors._b = null; } i++; continue; }
            if (top?.dest === 'fonttbl' || (skip && stack.some(s => s.dest === 'fonttbl'))) { // les polices : « {\f1 Georgia;} »
                const fm = /^([^;{}]*);/.exec(src.slice(i, i + 200)); const fs = stack.slice().reverse().find(s => s.font != null); if (fm) { const fnum = /\\f(\d+)[^{}]*$/.exec(src.slice(Math.max(0, i - 120), i)); if (fnum) fonts[fnum[1]] = fontOk(fm[1].trim()); i += fm[0].length; continue; }
            }
            if (pict) { const e = src.slice(i).search(/[\\{}]/); const chunk = e < 0 ? src.slice(i) : src.slice(i, i + e); pict.hex += chunk; i += chunk.length || 1; continue; }
            if (skip) { i++; continue; }
            if (ucSkip > 0) { ucSkip--; i++; continue; }
            const e = src.slice(i).search(/[\\{}\r\n]/); const chunk = e < 0 ? src.slice(i) : src.slice(i, i + e); push(chunk); i += chunk.length || 1;
        }
        if (cur.length) flushPara(); if (rows?.length) blocks.push({t: 'table', head: 0, rows});
        // les puces écrites en texte (« • », « 1. ») redeviennent des listes
        blocks.forEach(b => { if (b.t !== 'p' || !b.runs.length) return; const t = b.runs[0].x || ''; const m = /^(•|·|-|\d{1,3}[.)])\s*$/.exec(t) && b.runs[1]?.tab ? t : null; if (m) { b.list = {k: /\d/.test(m) ? 'ol' : 'ul', l: clamp(Math.round(((b.il || 6.35) - 6.35) / 6.35), 0, 8)}; b.runs = b.runs.slice(2); delete b.il; delete b.fi; } });
        doc.sections = [{page: null, blocks: blocks.filter(b => !(b.t === 'p' && !b.runs.length && blocks.length > 1)).slice(0, T.LIMITS.blocks)}];
        return {doc: finish(doc), notices: []};
    }

    /* ═════════ Markdown ═════════ */
    const mdEsc = t => String(t || '').replace(/([\\`*_{}\[\]<>#|~])/g, '\\$1').replace(/^(\d+)\./, '$1\\.');
    function toMarkdown(doc) {
        const notes = [];
        const inlineMd = runs => mergeRuns(runs).map(r => {
            if (r.br) return '  \n'; if (r.tab) return '\t'; if (r.tc?.k === 'del') return '';
            if (r.note) { notes.push(r.note.text || ''); return `[^${notes.length}]`; }
            if (r.field) return r.fieldText || ''; if (r.img) return `![${mdEsc(r.img.alt || '')}](${r.img.src})`;
            let t = mdEsc(r.x); if (!t.trim()) return t;
            const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0]; t = t.trim();
            if (r.s) t = `~~${t}~~`; if (r.i) t = `*${t}*`; if (r.b) t = `**${t}**`; if (r.sup) t = `<sup>${t}</sup>`; if (r.sub) t = `<sub>${t}</sub>`;
            if (r.href) t = `[${t}](${r.href})`;
            return lead + t + trail;
        }).join('');
        const out = [];
        const blk = (b, cnt) => {
            if (b.t === 'p') {
                const t = inlineMd(b.runs); const lv = /^h([1-6])$/.exec(b.st || '');
                if (b.list) { const n = (cnt[b.list.l] = (cnt[b.list.l] || 0) + 1); cnt.length = b.list.l + 1; return `${'    '.repeat(b.list.l)}${b.list.k === 'ol' ? `${n}.` : '-'} ${t}`; }
                cnt.length = 0;
                if (lv) return `${'#'.repeat(Number(lv[1]))} ${t}`; if (b.st === 'title') return `# ${t}`; if (b.st === 'subtitle') return `## ${t}`;
                if (b.st === 'quote') return t.split('\n').map(l => `> ${l}`).join('\n');
                if (b.al === 'center' || b.al === 'right') return t;
                return t;
            }
            cnt.length = 0;
            if (b.t === 'pb') return '<div style="page-break-after: always"></div>'; if (b.t === 'hr') return '---';
            if (b.t === 'img') return `![${mdEsc(b.cap || b.alt || '')}](${b.src})${b.cap ? `\n*${mdEsc(b.cap)}*` : ''}`;
            if (b.t === 'table') { const rows = b.rows.map(r => r.flatMap(c => [inlineMd((c.blocks || []).flatMap((x, k) => (x.runs ? [...(k ? [{x: ' '}] : []), ...x.runs] : []))).replace(/\|/g, '\\|').replace(/\n/g, ' '), ...Array(Math.max(0, (c.cs || 1) - 1)).fill('')]));
                const n = Math.max(1, ...rows.map(r => r.length)); rows.forEach(r => { while (r.length < n) r.push(''); });
                return [`| ${rows[0].join(' | ')} |`, `|${' --- |'.repeat(n)}`, ...rows.slice(1).map(r => `| ${r.join(' | ')} |`)].join('\n'); }
            if (b.blocks) return b.blocks.map(x => blk(x, [])).join('\n\n');
            if (b.t === 'toc') return '[[_TOC_]]';
            return '';
        };
        (doc.sections || []).forEach((sec, si) => { if (si) out.push('<div style="page-break-after: always"></div>'); const cnt = []; let prevList = false; (sec.blocks || []).forEach(b => { const x = blk(b, cnt); const isList = b.t === 'p' && !!b.list; if (x !== '') out.push({x, list: isList, prevList}); prevList = isList; }); });
        let md = (doc.title ? '' : '') + out.map((o, k) => (typeof o === 'string' ? o : o.x) + ((typeof out[k + 1] === 'object' && out[k + 1].list && o.list) ? '\n' : '\n\n')).join('');
        if (notes.length) md += '\n' + notes.map((t, k) => `[^${k + 1}]: ${t}`).join('\n') + '\n';
        return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }
    function mdInline(t, notesDef) {
        const out = [];
        const rx = /(\\[\\`*_{}\[\]()#+\-.!|~<>])|(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\[\^([^\]]+)\])|(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\*\*|__)|(~~)|(\*|_)|(`[^`]+`)|(<(sup|sub)>)|(<\/(sup|sub)>)|(  \n|\\\n)|(<br\s*\/?>)/g;
        let f = {}, last = 0, m;
        const txt = s => { if (s) out.push(run(s.replace(/\n/g, ' '), {...f})); };
        while ((m = rx.exec(t))) {
            txt(t.slice(last, m.index)); last = rx.lastIndex;
            if (m[1]) txt(m[1].slice(1));
            else if (m[2]) { if (/^(https?:\/\/|data:image\/|media\/)/i.test(m[4])) out.push({img: {src: m[4], alt: m[3], w: 300}}); }
            else if (m[5]) out.push({note: {id: nid('n'), k: 'foot', text: notesDef.get(m[6]) || ''}});
            else if (m[7]) { const sub = mdInline(m[8], notesDef); const href = /^(https?:\/\/|mailto:|#)/i.test(m[9]) ? m[9] : ''; sub.forEach(r => out.push(href && !r.note ? {...r, ...f, href} : r)); }
            else if (m[10]) f.b = f.b ? 0 : 1; else if (m[11]) f.s = f.s ? 0 : 1; else if (m[12]) f.i = f.i ? 0 : 1;
            else if (m[13]) out.push(run(m[13].slice(1, -1), {...f, font: 'Courier New'}));
            else if (m[14]) f[m[15]] = 1; else if (m[16]) delete f[m[17]];
            else if (m[18] || m[19]) out.push({br: true});
        }
        txt(t.slice(last));
        return out.map(r => { const o = {...r}; ['b', 'i', 's'].forEach(k => { if (!o[k]) delete o[k]; }); return o; });
    }
    function fromMarkdown(text) {
        const src = String(text || '').replace(/\r\n?/g, '\n'); if (src.length > T.LIMITS.textBytes) throw new Error('fichier refusé : trop gros');
        const lines = src.split('\n'), blocks = [], notesDef = new Map();
        lines.forEach(l => { const m = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(l); if (m) notesDef.set(m[1], m[2]); });
        let i = 0, paraBuf = [];
        const flush = () => { if (paraBuf.length) { blocks.push(para(mdInline(paraBuf.join('\n'), notesDef))); paraBuf = []; } };
        while (i < lines.length && blocks.length < T.LIMITS.blocks) {
            const l = lines[i];
            if (/^\[\^[^\]]+\]:/.test(l)) { flush(); i++; continue; }
            if (!l.trim()) { flush(); i++; continue; }
            let m;
            if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { flush(); blocks.push(para(mdInline(m[2], notesDef), {st: 'h' + m[1].length})); i++; continue; }
            if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*_-]*$/.test(l)) { flush(); blocks.push({t: 'hr'}); i++; continue; }
            if (/page-break-after|^\\pagebreak|^\\newpage/.test(l)) { flush(); blocks.push({t: 'pb'}); i++; continue; }
            if ((m = /^```/.exec(l))) { flush(); i++; const code = []; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; code.forEach(c => blocks.push(para([run(c, {})], {st: 'mono'}))); continue; }
            if (/^>\s?/.test(l)) { flush(); const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); blocks.push(para(mdInline(q.join('\n'), notesDef), {st: 'quote'})); continue; }
            if ((m = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(l))) { flush(); const lvl = clamp(Math.floor(m[1].replace(/\t/g, '    ').length / 2) > 0 ? Math.round(m[1].replace(/\t/g, '    ').length / 4) || 1 : 0, 0, 8); blocks.push(para(mdInline(m[3].replace(/^\[[ xX]\]\s*/, x => (/x/i.test(x) ? '☑ ' : '☐ ')), notesDef), {list: {k: /\d/.test(m[2]) ? 'ol' : 'ul', l: lvl}})); i++; continue; }
            if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) { flush(); const cells = r => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
                const rows = [cells(l)]; i += 2; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
                blocks.push({t: 'table', head: 1, rows: rows.map(r => r.map(c => ({blocks: [para(mdInline(c, notesDef))]})))}); continue; }
            if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l)) && /^(https?:\/\/|data:image\/|media\/)/i.test(m[2])) { flush(); blocks.push({t: 'img', src: m[2], alt: m[1], w: 400, wrap: 'topbottom', al: 'center'}); i++; continue; }
            paraBuf.push(l); i++;
        }
        flush();
        const doc = T.newDoc(); doc.sections = [{page: null, blocks: blocks.map(b => (b.t === 'p' ? {...b, runs: mergeRuns(b.runs)} : b))}];
        return {doc: finish(doc), notices: []};
    }

    /* ═════════ Texte brut ═════════ */
    function toText(doc) {
        const lines = [];
        const blk = (b, cnt) => {
            if (b.t === 'p') { const t = plainOf(b.runs); if (b.list) { const n = (cnt[b.list.l] = (cnt[b.list.l] || 0) + 1); cnt.length = b.list.l + 1; lines.push(`${'  '.repeat(b.list.l)}${b.list.k === 'ol' ? n + '.' : '•'} ${t}`); return; } cnt.length = 0; lines.push(t); return; }
            cnt.length = 0;
            if (b.t === 'table') b.rows.forEach(r => lines.push(r.map(c => (c.blocks || []).map(T.blockText).join(' ')).join('\t')));
            else if (b.t === 'img') { if (b.cap) lines.push(b.cap); }
            else if (b.t === 'pb') lines.push('\f');
            else if (b.t === 'hr') lines.push('————');
            else if (b.blocks) b.blocks.forEach(x => blk(x, []));
        };
        (doc.sections || []).forEach(sec => { const cnt = []; (sec.blocks || []).forEach(b => blk(b, cnt)); });
        const notes = T.allBlocks(doc).flatMap(b => (b.runs || []).filter(r => r.note)).map((r, k) => `[${k + 1}] ${r.note.text}`);
        return '\ufeff' + lines.join('\r\n') + (notes.length ? '\r\n\r\nNotes :\r\n' + notes.join('\r\n') : '') + '\r\n';
    }
    function fromText(text) {
        const src = String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n'); if (src.length > T.LIMITS.textBytes) throw new Error('fichier refusé : trop gros');
        const blocks = [];
        src.split('\n').forEach(l => {
            if (blocks.length > T.LIMITS.blocks) return;
            if (l === '\f') { blocks.push({t: 'pb'}); return; }
            const parts = l.split('\f'); parts.forEach((x, k) => { if (k) blocks.push({t: 'pb'}); const runs = []; x.split('\t').forEach((y, j) => { if (j) runs.push({tab: true, x: ''}); if (y) runs.push(run(y)); }); blocks.push(para(runs)); });
        });
        // les lignes vides en série n'en font qu'une
        const out = blocks.filter((b, k) => !(b.t === 'p' && !b.runs.length && blocks[k - 1]?.t === 'p' && !blocks[k - 1].runs.length));
        while (out.length > 1 && out[out.length - 1].t === 'p' && !out[out.length - 1].runs.length) out.pop();
        const doc = T.newDoc(); doc.sections = [{page: null, blocks: out}];
        return {doc: finish(doc), notices: []};
    }

    /** un fichier → document (selon son nom et ses premiers octets) ; HTML : rendu au navigateur (rendre {html}) */
    async function readFile(name, buf) {
        const u8 = new Uint8Array(buf); if (u8.length > T.LIMITS.fileBytes) throw new Error(`fichier trop gros (plus de ${Math.round(T.LIMITS.fileBytes / 1048576)} Mo)`);
        const ext = String(name || '').toLowerCase().split('.').pop(), zip = u8[0] === 0x50 && u8[1] === 0x4b;
        if (zip) { const z = await S().unzip(buf); if (z.has('word/document.xml')) return {kind: 'docx', ...(await fromDocx(buf))}; if (z.has('content.xml')) return {kind: 'odt', ...(await fromOdt(buf))}; throw new Error('ce fichier zip n’est ni un document Word (.docx) ni un document LibreOffice (.odt)'); }
        if (u8[0] === 0xd0 && u8[1] === 0xcf) throw new Error('les anciens fichiers Word (.doc) ne se lisent pas : ouvre-le dans Word ou LibreOffice et enregistre-le en .docx');
        if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) throw new Error('un PDF ne se transforme pas en texte modifiable ici : ouvre la Transcription d’actes pour le recopier');
        const dec = S().decodeBytes(u8), text = dec.text;
        if (/^\s*\{\\rtf/.test(text) || ext === 'rtf') return {kind: 'rtf', ...fromRtf(text), encoding: dec.encoding};
        if (ext === 'html' || ext === 'htm' || /^\s*(<!doctype html|<html|<body|<meta|<div|<p[\s>])/i.test(text)) return {kind: 'html', html: text, encoding: dec.encoding};
        if (ext === 'md' || ext === 'markdown') return {kind: 'md', ...fromMarkdown(text), encoding: dec.encoding};
        if (['docx', 'odt'].includes(ext)) throw new Error(`ce fichier .${ext} est abîmé (ce n’est pas un zip)`);
        return {kind: 'txt', ...fromText(text), encoding: dec.encoding};
    }

    return {toRtf, fromRtf, toMarkdown, fromMarkdown, toText, fromText, readFile, toOdt, fromOdt, toDocx, fromDocx, _docx: {stylesXml, numberingXml, wStyleId, NAME_TO_ST}};
});
