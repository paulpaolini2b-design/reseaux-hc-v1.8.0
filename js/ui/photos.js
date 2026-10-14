/* ui/photos.js — v1.7.0 §10 (H-333) : section « Photos » de la fiche des objets de réseau et visionneuse plein écran.
 *
 * - « Prendre une photo » : <input type="file" accept="image/*" capture="environment"> ; l'original est ensuite
 *   téléchargé sur la tablette (photos.js → telechargerOriginal). « Importer » : galerie ou fichiers, sans capture,
 *   plusieurs à la fois, sans recopie.
 * - Vignettes = images (pas des boutons) : elles restent consultables en lecture seule, où ui/lecture-seule.js désactive
 *   tous les boutons de la fiche. Appui sur une vignette = visionneuse plein écran (défilement par flèches, glisser ou
 *   ← →), état photographié, légende, date et heure, origine ; suppression avec confirmation.
 * - Toute modification passe par valider() : annulable (Ctrl+Z), sans copie des binaires dans l'historique.
 */
import { etat, sur, objetParId, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { CHARTE, LIBELLES } from '../charte.js';
import { valider } from '../historique.js';
import { porteurPhotos } from '../modele.js';
import { photoRetenue } from '../reportage.js';   // v1.8.0 : case « Au reportage »
import { imageChargee, chargerImage, imageEnErreur } from '../images.js';
import { enregistrerPhoto, nomCopieOriginal, telechargerOriginal, formaterDatePhoto } from '../photos.js';
import { echapper, confirmer } from './dialogues.js';

const P = () => CHARTE.photos;
let visionneuse = null;
let courant = null;   // { objetId, photoId }

/* HTML de la section (placée par fiche-objet.js entre « Matériel associé » et « Commentaire »). */
export function htmlSectionPhotos(o) {
  if (!porteurPhotos(o)) return '';
  const liste = Array.isArray(o.photos) ? o.photos : [];
  const vignettes = liste.map((ph, i) => {
    const e = imageChargee(ph.fond_id);
    const err = imageEnErreur(ph.fond_id);
    return `<figure class="vignette-photo" data-photo="${echapper(ph.id)}" tabindex="0" role="button" aria-label="Photo ${i + 1} : ${echapper(P().etats[ph.etat_photo] || '')}${ph.legende ? ' — ' + echapper(ph.legende) : ''}">
      ${e ? `<img src="${e.url}" alt="">` : `<span class="attente-photo">${err ? '⚠' : '…'}</span>`}
      <figcaption>${echapper(P().etats[ph.etat_photo] || '')}</figcaption>
    </figure>`;
  }).join('');
  return `<div id="fiche-photos">
        <div class="boutons-ligne">
          <button type="button" class="btn" data-photo-action="prendre">📷 Prendre une photo</button>
          <button type="button" class="btn" data-photo-action="importer">Importer</button>
        </div>
        ${liste.length ? `<div class="vignettes-photos">${vignettes}</div>` : '<p class="vide">Aucune photo.</p>'}
        <div class="aide">Prise de vue : l’original est aussi téléchargé sur la tablette (dossier Téléchargements). Photos réduites à ${CHARTE.image.cote_max_px} px dans le projet ; reprises à l’export PDF par le reportage photo seulement (Outils → Reportage photo) ; non copiées par « Dupliquer ».</div>
      </div>`;
}

/* Branche la section sur l'objet `o` (appelé après chaque rendu de la fiche). */
export function brancherSectionPhotos(racine, o) {
  const z = racine.querySelector('#fiche-photos');
  if (!z) return;
  z.querySelectorAll('[data-photo-action]').forEach((b) => b.addEventListener('click', () => {
    if (!peutModifier()) { signalerLectureSeule(); return; }
    choisirFichiers(o.id, b.dataset.photoAction === 'prendre');
  }));
  z.querySelectorAll('.vignette-photo').forEach((f) => {
    const ouvrir = () => ouvrirVisionneuse(o.id, f.dataset.photo);
    f.addEventListener('click', ouvrir);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } });
  });
  // Vignettes pas encore lues en base : chargées puis insérées sans redessiner la fiche
  for (const ph of o.photos || []) {
    if (imageChargee(ph.fond_id) || imageEnErreur(ph.fond_id)) continue;
    chargerImage(ph.fond_id).then((e) => {
      const fig = z.querySelector(`.vignette-photo[data-photo="${CSS.escape(ph.id)}"]`);
      if (!fig) return;
      const att = fig.querySelector('.attente-photo');
      if (e && att) { const img = document.createElement('img'); img.src = e.url; img.alt = ''; att.replaceWith(img); }
      else if (att) att.textContent = '⚠';
    });
  }
}

/* Sélection de fichiers : un <input> neuf à chaque fois (Chrome Android ne redéclenche pas `change` sur le même fichier). */
function choisirFichiers(objetId, camera) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  if (camera) inp.setAttribute('capture', 'environment');
  else inp.multiple = true;
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const fichiers = [...(inp.files || [])];
    inp.remove();
    if (!fichiers.length) return;
    await ajouterPhotos(objetId, fichiers, camera ? 'appareil' : 'import');
  }, { once: true });
  inp.click();
}

async function ajouterPhotos(objetId, fichiers, origine) {
  const o = objetParId(objetId);
  if (!o || !porteurPhotos(o)) return;
  const nouvelles = [];
  for (const f of fichiers) {
    try {
      const ph = await enregistrerPhoto(f, origine, o);
      nouvelles.push(ph);
      if (origine === 'appareil') {
        try { telechargerOriginal(f, nomCopieOriginal(etat.projet && etat.projet.nom, o.repere || LIBELLES.types[o.type] || o.type, new Date(ph.date), f.type)); }
        catch (e) { notifier('Copie de l’original sur la tablette impossible : ' + (e.message || e), 4000); }
      }
    } catch (e) {
      notifier('Photo refusée : ' + (e.message || e), 4500);
    }
  }
  if (!nouvelles.length) return;
  const cible = objetParId(objetId);   // l'objet peut avoir été remplacé par une autre étape entre-temps
  if (!cible) { notifier('Objet introuvable : photo non rattachée'); return; }
  if (!Array.isArray(cible.photos)) cible.photos = [];
  cible.photos.push(...nouvelles);
  valider(nouvelles.length > 1 ? nouvelles.length + ' photos ajoutées' : 'Photo ajoutée');
  notifier(origine === 'appareil' ? 'Photo ajoutée — original téléchargé sur la tablette' : (nouvelles.length > 1 ? nouvelles.length + ' photos importées' : 'Photo importée'));
}

/* ---------- Visionneuse plein écran ---------- */
function creerVisionneuse() {
  visionneuse = document.createElement('div');
  visionneuse.id = 'visionneuse-photos';
  visionneuse.setAttribute('role', 'dialog');
  visionneuse.setAttribute('aria-label', 'Photo');
  visionneuse.hidden = true;
  // Posée au-dessus de la zone de plan : ses gestes ne partent pas au plan
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'contextmenu', 'dblclick']) visionneuse.addEventListener(t, (e) => e.stopPropagation());
  document.getElementById('app').appendChild(visionneuse);
  for (const ev of ['projet-ferme', 'projet-ouvert', 'plan-change']) sur(ev, fermerVisionneuse);
  sur('objets', () => { if (visionneuse && !visionneuse.hidden && !objetEtPhoto()) fermerVisionneuse(); });   // annuler / objet supprimé
  document.addEventListener('keydown', (e) => {
    if (!visionneuse || visionneuse.hidden) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerVisionneuse(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerVisionneuse(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); defiler(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); defiler(1); }
  }, true);
  let x0 = null;
  visionneuse.addEventListener('pointerdown', (e) => { if (e.target.closest('.image-visionneuse')) x0 = e.clientX; });
  visionneuse.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) defiler(dx < 0 ? 1 : -1); });
}

function objetEtPhoto() {
  if (!courant) return null;
  const o = objetParId(courant.objetId);
  if (!o || !Array.isArray(o.photos)) return null;
  const i = o.photos.findIndex((p) => p.id === courant.photoId);
  return i < 0 ? null : { o, i, ph: o.photos[i] };
}

export function ouvrirVisionneuse(objetId, photoId) {
  if (!visionneuse) creerVisionneuse();
  courant = { objetId, photoId };
  visionneuse.hidden = false;
  rendreVisionneuse();
}

export function fermerVisionneuse() {
  if (visionneuse) { visionneuse.hidden = true; visionneuse.innerHTML = ''; }
  courant = null;
}

function defiler(pas) {
  const r = objetEtPhoto();
  if (!r) return;
  const n = r.o.photos.length;
  courant.photoId = r.o.photos[(r.i + pas + n) % n].id;
  rendreVisionneuse();
}

function rendreVisionneuse() {
  const r = objetEtPhoto();
  if (!r) { fermerVisionneuse(); return; }
  const { o, i, ph } = r;
  const n = o.photos.length;
  const ro = !peutModifier();
  const e = imageChargee(ph.fond_id);
  visionneuse.innerHTML = `
    <header class="entete-visionneuse">
      <strong>${echapper(o.repere || LIBELLES.types[o.type] || o.type)} — photo ${i + 1} / ${n}</strong>
      <button type="button" class="btn-icone fermer" data-v="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button>
    </header>
    <div class="image-visionneuse">
      ${n > 1 ? '<button type="button" class="btn-icone nav-photo prec" data-v="prec" aria-label="Photo précédente">‹</button>' : ''}
      ${e ? `<img src="${e.url}" alt="${echapper(ph.legende || '')}">` : `<span class="attente-photo">${imageEnErreur(ph.fond_id) ? 'Photo absente de la base' : 'Chargement…'}</span>`}
      ${n > 1 ? '<button type="button" class="btn-icone nav-photo suiv" data-v="suiv" aria-label="Photo suivante">›</button>' : ''}
    </div>
    <div class="infos-visionneuse">
      <label>État photographié<select data-v="etat" ${ro ? 'disabled' : ''}>${Object.entries(P().etats).map(([k, l]) => `<option value="${k}" ${ph.etat_photo === k ? 'selected' : ''}>${echapper(l)}</option>`).join('')}</select></label>
      <label>Légende<input data-v="legende" value="${echapper(ph.legende || '')}" placeholder="Ex. vue depuis la RD 344" ${ro ? 'disabled' : ''}></label>
      <label class="case"><input type="checkbox" data-v="reportage" ${photoRetenue(o, ph) ? 'checked' : ''} ${ro ? 'disabled' : ''}> Au reportage photo</label>
      <div class="aide">${echapper(formaterDatePhoto(ph.date))} · ${echapper(P().origines[ph.origine] || '')}</div>
      ${ro ? '' : '<button type="button" class="btn btn-danger" data-v="supprimer">Supprimer la photo…</button>'}
    </div>`;
  if (!e) chargerImage(ph.fond_id).then(() => { if (courant && courant.photoId === ph.id) rendreVisionneuse(); });
  const q = (k) => visionneuse.querySelector(`[data-v="${k}"]`);
  q('fermer').addEventListener('click', fermerVisionneuse);
  if (q('prec')) q('prec').addEventListener('click', () => defiler(-1));
  if (q('suiv')) q('suiv').addEventListener('click', () => defiler(1));
  q('etat').addEventListener('change', (ev) => modifier({ etat_photo: ev.target.value }, 'État de la photo'));
  const leg = q('legende');
  leg.addEventListener('change', (ev) => modifier({ legende: String(ev.target.value || '').trim() }, 'Légende de la photo'));
  leg.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); leg.blur(); } });
  if (q('supprimer')) q('supprimer').addEventListener('click', supprimer);
  q('reportage').addEventListener('change', (ev) => modifier({ au_reportage: !!ev.target.checked }, ev.target.checked ? 'Photo retenue au reportage' : 'Photo retirée du reportage'));   // v1.8.0
}

function modifier(champs, etiquette) {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const r = objetEtPhoto();
  if (!r) return;
  if (champs.etat_photo !== undefined && !P().etats[champs.etat_photo]) return;
  Object.assign(r.ph, champs);
  valider(etiquette);
}

async function supprimer() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  if (!(await confirmer('Supprimer cette photo de l’objet ? (annulable par Ctrl+Z)', { ok: 'Supprimer', danger: true }))) return;
  const r = objetEtPhoto();
  if (!r) return;
  r.o.photos.splice(r.i, 1);
  valider('Photo supprimée');
  if (!r.o.photos.length) { fermerVisionneuse(); return; }
  courant.photoId = r.o.photos[Math.min(r.i, r.o.photos.length - 1)].id;
  rendreVisionneuse();
}
