/* LCNDA — 📤 « Envoyer vers… » : une image faite dans l'outil vectoriel (carte, dessin) ou dans la retouche (à la Photoshop)
 * part dans le Montage vidéo ou dans le Studio d'animation, nouveau ou existant. L'image est d'abord rangée dans les Médias
 * (copie, ext.rtUploadCopy), puis : Montage → un rush posé sur la piste Vidéo 1 ; Studio → une scène « photo » (zoom doux).
 *   window.LCNDA_EXT.sendImage(blob, {title, anchor})   (anchor : le bouton ou le menu d'où l'on vient, pour le petit menu) */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {}, A = () => window.LCNDA_APP;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    /** range l'image dans les Médias → {id, filename, title} */
    async function store(blob, title) {
        if (!ext.rtUploadCopy) throw new Error(T('L’envoi dans les médias n’est pas chargé.'));
        const r = await ext.rtUploadCopy(blob, {title}); const id = Number(r.media_id || r.id || 0), filename = r.filename || '';
        if (!id || !filename) throw new Error(T('L’image n’a pas pu être rangée dans les médias.'));
        return {id, filename, title};
    }
    async function pickAnimProject() {
        let list = []; try { list = (await A().api('anim_projects')).projects || []; } catch (_) {}
        if (!list.length) { A().toast(T('Aucun film dans le Studio d’animation : un nouveau est créé.')); return 0; }
        return new Promise(res => { const items = list.slice(0, 40).map(p => ({icon: '🎞', label: p.title || T('Sans nom'), run: () => res(Number(p.id))})); items.push('-', {icon: '＋', label: T('Un nouveau film'), run: () => res(0)});
            window.LCNDA_UI?.menuAt ? window.LCNDA_UI.menuAt(document.activeElement || document.body, items, {title: T('Dans quel film ?')}) : res(0); });
    }
    async function send(blob, {title = 'Image', anchor = null, to = ''} = {}) {
        const go = async where => {
            let m; try { A().toast(T('Rangement de l’image dans les médias…')); m = await store(blob, title); } catch (e) { return A().toast(e.message, 'error'); }
            if (where === 'montage-new' || where === 'montage') {
                ext._montageSeedVisual = {mediaId: m.id, filename: m.filename, title: m.title};
                if (where === 'montage' && ext.openMontageProjects) return ext.openMontageProjects();
                return ext.newMontage?.();
            }
            if (where === 'anim-new' || where === 'anim') {
                const id = where === 'anim' ? await pickAnimProject() : 0;
                return ext.openAnimStudio?.({id, image: {id: m.id, filename: m.filename, title: m.title}});
            }
        };
        if (to) return go(to);
        const items = [{icon: '🎬', label: T('Dans un nouveau montage vidéo'), run: () => go('montage-new')}, {icon: '🎬', label: T('Dans un montage existant…'), run: () => go('montage')}, '-',
            {icon: '🎞', label: T('Dans un nouveau film du Studio d’animation'), run: () => go('anim-new')}, {icon: '🎞', label: T('Dans un film existant du Studio…'), run: () => go('anim')}];
        if (window.LCNDA_UI?.menuAt) window.LCNDA_UI.menuAt(anchor || document.body, items, {title: T('Envoyer l’image vers…')});
        else go('montage-new');
    }
    ext.sendImage = send;
})();
