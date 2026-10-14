/* photos.js — v1.7.0 §10 (H-333) : photos des ouvrages (stockage, nommage, copie de l'original).
 *
 * Stockage : magasin IndexedDB `fonds` existant ({ id, blob, type: 'photo_objet', mime, nom_fichier }), sans changer
 * (v1.8.0 : `au_reportage` — photo retenue au reportage photo, défaut selon le type d'objet)
 * VERSION_BD. L'objet du plan ne porte que la référence : photos [{ id, fond_id, etat_photo, legende, date, origine }].
 * Réduction identique aux images libres (images.js → preparerFichierImage : côté long 2 400 px, orientation EXIF
 * appliquée, JPEG réencodé ; message HEIC repris). Les références sont lues par plans-calcul.js → fondsReferences() :
 * taille du projet, export / import .json, duplication de projet et protection contre la purge des orphelins.
 * Un objet supprimé laisse ses binaires en base jusqu'à la purge des orphelins au démarrage : « Annuler » le rétablit
 * avec ses photos.
 *
 * Copie sur la tablette : une PWA ne peut pas écrire dans la galerie, et l'appareil photo appelé par <input capture>
 * n'enregistre pas toujours la prise de vue. Après chaque PRISE, l'original pleine résolution est téléchargé (dossier
 * Téléchargements) sous le nom {affaire}_{repère}_{AAAAMMJJ-HHMMSS}.jpg. Les photos importées ne sont pas recopiées.
 */
import { bd } from './bd.js';
import { CHARTE } from './charte.js';
import { genererId, auReportageParDefaut } from './modele.js';
import { preparerFichierImage } from './images.js';

const P = () => CHARTE.photos;

/* « 20261011-143205 » (heure locale de la tablette). */
export function horodatage(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const z = (n, l = 2) => String(n).padStart(l, '0');
  return x.getFullYear() + z(x.getMonth() + 1) + z(x.getDate()) + '-' + z(x.getHours()) + z(x.getMinutes()) + z(x.getSeconds());
}

/* Morceau de nom de fichier sûr (Android, Windows) : accents conservés, séparateurs et caractères interdits remplacés. */
export function nettoyerNom(t, repli = 'sans-nom') {
  const s = String(t || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (s || repli).slice(0, 60);
}

/* Nom de la copie de l'original : {affaire}_{repère}_{AAAAMMJJ-HHMMSS}.jpg (extension réelle si ce n'est pas un JPEG). */
export function nomCopieOriginal(affaire, repere, date, mime = 'image/jpeg') {
  const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : /hei[cf]/i.test(mime) ? 'heic' : 'jpg';
  return P().nom_copie
    .replace('{affaire}', nettoyerNom(affaire, 'affaire'))
    .replace('{repere}', nettoyerNom(repere, 'objet'))
    .replace('{horodatage}', horodatage(date)) + '.' + ext;
}

/* État photographié proposé par défaut : l'état de l'objet. */
export function etatPhotoParDefaut(o) {
  return o && P().etats[o.etat] ? o.etat : 'autre';
}

/* Prépare et enregistre une photo ; retourne l'entrée à ajouter à `o.photos` (rien n'est ajouté à l'objet ici).
 * `origine` : 'appareil' | 'import'. Date de prise : maintenant pour l'appareil ; date du fichier pour un import. */
export async function enregistrerPhoto(fichier, origine, o) {
  const prep = await preparerFichierImage(fichier);   // lève « image illisible … (format HEIC : choisir une photo JPEG) »
  const fond_id = genererId('fd');
  await bd.put('fonds', { id: fond_id, blob: prep.blob, type: P().type_fond, mime: prep.mime, nom_fichier: prep.nom_fichier });
  const date = origine === 'import' && fichier.lastModified ? new Date(fichier.lastModified) : new Date();
  return { id: genererId('ph'), fond_id, etat_photo: etatPhotoParDefaut(o), legende: '', date: date.toISOString(), origine: origine === 'appareil' ? 'appareil' : 'import', au_reportage: auReportageParDefaut(o) };   // au_reportage : v1.8.0
}

/* Télécharge le fichier ORIGINAL (pleine résolution, non réduit) sur la tablette. */
export function telechargerOriginal(fichier, nom) {
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

/* Date lisible « 11/10/2026 14:32 ». */
export function formaterDatePhoto(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const z = (n) => String(n).padStart(2, '0');
  return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}
