/* ui/reportage.js — v1.8.0 : interface du reportage photo (H-369 à H-382).
 *
 * - Panneau « Reportage photo » (Outils → Reportage photo ; ≡ Tout) : créer, mettre à jour, redisposer, choisir les
 *   photos, réglages (photos par page, format, titre), aller au reportage, alertes et doublons de repère.
 * - Commandes = opérations de PAGES (historique du projet, H-317) : instantané des pages de reportage, de leur contenu, des
 *   réglages et des photos retenues avant / après ; Annuler et Rétablir rejouent l'instantané. L'historique des objets
 *   des pages modifiées repart de leur nouvel état (rebaserHistorique, H-380).
 * - Section « Reportage » de la fiche d'une vignette : blocs ouvrage éditables (repère, état, équipement, lignes), ajout
 *   d'un ouvrage, ordre, suppression, rétablissement de l'automatique, « Aller à l'ouvrage » ; ces retouches sont des
 *   modifications d'objets ordinaires (valider(), Ctrl+Z).
 * Les champs n'ont pas d'attribut `name` et sont insérés après la liaison générique de la fiche : ils lui échappent. */
import { etat, emettre, notifier, peutModifier, signalerLectureSeule, selectionner } from '../etat.js';
import { CHARTE, LIBELLES } from '../charte.js';
import { cloner, genererId } from '../modele.js';
import { valider, enregistrerOperationPages, rebaserHistorique } from '../historique.js';
import { chargerImage, imageChargee } from '../images.js';
import { changerPlanId } from '../plans.js';
import { vue, appliquer } from '../vue.js';
import * as RP from '../reportage.js';
import { echapper, confirmer, ouvrirDialogue } from './dialogues.js';

const K = () => CHARTE.reportage;
let brouillon = { projet: null, reglages: {} };   // réglages choisis avant la création (non enregistrés dans le projet)

/* ---------- Instantanés des commandes ---------- */

function drapeauxPhotos(projet) {
  const m = new Map();
  for (const pl of projet.plans) if (!RP.estPageReportage(pl)) for (const o of pl.objets || []) for (const ph of o.photos || []) m.set(ph.id, { plan: pl.id, v: ph.au_reportage });
  return m;
}

function instantane(projet) {
  const contenus = new Map();
  for (const p of RP.pagesReportage(projet)) contenus.set(p.id, { plan: p, objets: cloner(p.objets), format: cloner(p.format), nom: p.nom });
  return { plans: projet.plans.slice(), reportage: cloner(projet.reportage ?? null), contenus, drapeaux: drapeauxPhotos(projet) };
}

function idsTouches(a, b) {
  const ids = new Set([...a.contenus.keys(), ...b.contenus.keys()]);
  for (const [id, x] of a.drapeaux) { const y = b.drapeaux.get(id); if (!y || y.v !== x.v) ids.add(x.plan); }
  return [...ids];
}

async function restaurerInstantane(projet, s, ids) {
  if (etat.projet !== projet) return;
  if (etat.plan && !s.plans.includes(etat.plan)) {
    const cible = s.plans.find((p) => !RP.estPageReportage(p)) || s.plans[0];
    if (cible) await changerPlanId(cible.id);
  }
  projet.plans = s.plans.slice();
  for (const c of s.contenus.values()) { c.plan.objets = cloner(c.objets); c.plan.format = cloner(c.format); c.plan.nom = c.nom; }
  projet.reportage = cloner(s.reportage);
  for (const pl of projet.plans) for (const o of pl.objets || []) for (const ph of o.photos || []) if (s.drapeaux.has(ph.id)) ph.au_reportage = s.drapeaux.get(ph.id).v;
  projet.plan_courant = projet.plans.indexOf(etat.plan);
  rebaserHistorique(ids);
  emettre('plans');
  emettre('objets', { etiquette: 'reportage' });
}

/* Dimensions en pixels des photos (lues en base au besoin). */
async function dimensions(fondIds) {
  const m = new Map();
  await Promise.all([...new Set(fondIds)].map(async (id) => {
    try { const e = imageChargee(id) || await chargerImage(id); if (e && e.largeurPx) m.set(id, { l: e.largeurPx, h: e.hauteurPx }); } catch (e) { /* photo absente : proportions par défaut */ }
  }));
  return m;
}

/* Exécute une commande `fn(projet, dimsDe)` en une seule étape annulable (opération de pages). */
async function executer(etiquette, fn) {
  if (!etat.projet) { notifier('Ouvrez d’abord un projet'); return null; }
  if (!peutModifier()) { signalerLectureSeule(); return null; }
  const projet = etat.projet;
  const dims = await dimensions(RP.photosRetenues(projet).map((s) => s.photo.fond_id));
  const avant = instantane(projet);
  let r;
  try { r = fn(projet, (id) => dims.get(id) || null); }
  catch (e) { console.error(e); await restaurerInstantane(projet, avant, []); notifier('Reportage : ' + ((e && e.message) || e), 4500); return null; }
  if (!r || r.erreur) { await restaurerInstantane(projet, avant, []); if (r && r.erreur) notifier(r.erreur, 4500); return null; }
  const apres = instantane(projet);
  const ids = idsTouches(avant, apres);
  projet.plan_courant = projet.plans.indexOf(etat.plan);
  rebaserHistorique(ids);
  emettre('plans');
  emettre('objets', { etiquette });
  enregistrerOperationPages({
    etiquette,
    defaire: async () => { await restaurerInstantane(projet, avant, ids); notifier('Annulé : ' + etiquette.toLowerCase()); },
    faire: async () => { await restaurerInstantane(projet, apres, ids); notifier('Rétabli : ' + etiquette.toLowerCase()); }
  });
  return r;
}

/* ---------- Panneau ---------- */

export function ouvrirReportage() {
  if (!etat.projet) { notifier('Ouvrez d’abord un projet'); return; }
  rendrePanneau();
}

function rendrePanneau() {
  const projet = etat.projet;
  const cree = !!projet.reportage && RP.pagesReportage(projet).length > 0;   // pages toutes supprimées : à recréer
  const r = cree ? RP.reglages(projet) : { ...RP.reglages(projet), ...(brouillon.projet === projet.id ? brouillon.reglages : {}) };
  const pages = RP.pagesReportage(projet);
  const vignettes = RP.vignettesProjet(projet);
  const retenues = RP.photosRetenues(projet);
  const presentes = new Set(vignettes.map((v) => v.reportage.source.photo_id));
  const nouvelles = retenues.filter((s) => !presentes.has(s.photo.id)).length;
  const alertes = vignettes.filter((v) => RP.libellesAlertes(v).length);
  const doublons = [...RP.doublonsReperes(projet)];
  const ro = !peutModifier();
  const d = ouvrirDialogue('dlg-generique', `
    <form method="dialog" class="dialogue dialogue-reportage">
      <h2>Reportage photo</h2>
      <p class="aide">${cree
    ? `${pages.length} page(s), ${vignettes.length} photo(s) au reportage${nouvelles ? ` — <strong>${nouvelles} nouvelle(s) photo(s) retenue(s)</strong> à ajouter par « Mettre à jour »` : ''}.`
    : `${retenues.length} photo(s) retenue(s) dans le projet (ouvrages ponctuels par défaut ; tronçons et fourreaux à cocher).`}</p>
      <div class="boutons-image">
        ${cree ? '' : `<button type="button" class="btn btn-primaire" data-r="creer" ${ro || !retenues.length ? 'disabled' : ''}>Créer le reportage</button>`}
        ${cree ? `<button type="button" class="btn btn-primaire" data-r="maj" ${ro ? 'disabled' : ''}>Mettre à jour</button>` : ''}
        ${cree ? `<button type="button" class="btn" data-r="redisposer" ${ro ? 'disabled' : ''}>Redisposer tout…</button>` : ''}
        <button type="button" class="btn" data-r="choisir">Choisir les photos…</button>
        ${cree && pages.length ? '<button type="button" class="btn" data-r="aller">Aller au reportage</button>' : ''}
      </div>
      <h3>Réglages</h3>
      <div class="ligne2">
        <label>Photos par page<select data-k="par_page" ${ro ? 'disabled' : ''}>${K().par_page.map((n) => `<option value="${n}" ${n === r.par_page ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Format<select data-k="format" ${ro ? 'disabled' : ''}>${K().formats.map((f) => `<option value="${f}" ${f === r.format ? 'selected' : ''}>${f} paysage</option>`).join('')}</select></label>
      </div>
      <label>Titre des pages<input data-k="titre" value="${echapper(r.titre ?? '')}" placeholder="${echapper(RP.titreAutomatique(projet))}" ${ro ? 'disabled' : ''} autocomplete="off"></label>
      <div class="aide">Vide = titre automatique (commune et N° SIEEP de l’affaire). Changer le nombre de photos par page ou le format redispose tout le reportage.${cree ? '' : ' Réglages appliqués à la création.'}</div>
      ${alertes.length ? `<h3>Alertes</h3><ul class="liste-alertes">${alertes.map((v) => `<li><button type="button" class="lien" data-vignette="${echapper(v.id)}">${echapper(v.reportage.blocs[0] ? v.reportage.blocs[0].repere || 'Photo' : 'Photo')}</button> — ${echapper(RP.libellesAlertes(v).join(' ; '))}</li>`).join('')}</ul>` : ''}
      ${doublons.length ? `<h3>Repères en doublon</h3><ul class="liste-alertes">${doublons.map(([rep, n]) => `<li>${echapper(RP.texteDoublon(rep, n))}</li>`).join('')}</ul>` : ''}
      <div class="aide">Ouvrages tracés ou posés sur une page de reportage : illustratifs (hors descriptif, métré, nomenclature et légende ; ni mesure, ni indicateur de longueur). Ils suivent la photo sur laquelle ils ont été commencés.</div>
      <div class="boutons"><button type="submit" class="btn">Fermer</button></div>
    </form>`);
  const q = (k) => d.querySelector(`[data-r="${k}"]`);
  if (q('creer')) q('creer').addEventListener('click', async () => {
    const res = await executer('Reportage photo créé', (p, dims) => RP.creerReportage(p, dims, { par_page: r.par_page, format: r.format, titre: r.titre }));
    if (res) { d.close(); notifier(res.vignettes + ' photo(s) sur ' + RP.pagesReportage(etat.projet).length + ' page(s)', 3000); allerAuReportage(); }
  });
  if (q('maj')) q('maj').addEventListener('click', async () => {
    const res = await executer('Reportage mis à jour', (p, dims) => RP.mettreAJourReportage(p, dims));
    if (res) { notifier(res.ajoutees ? res.ajoutees + ' photo(s) ajoutée(s) en fin de reportage' : 'Reportage à jour', 2600); rendrePanneau(); }
  });
  if (q('redisposer')) q('redisposer').addEventListener('click', async () => {
    if (!(await confirmer('Redisposer toutes les photos du reportage selon la grille et l’ordre du descriptif ? Lignes saisies, blocs ajoutés, rognage et tracés sur les photos sont conservés (annulable par Ctrl+Z).', { ok: 'Redisposer' }))) { rendrePanneau(); return; }
    const res = await executer('Reportage redisposé', (p) => RP.redisposerReportage(p));
    if (res) notifier('Reportage redisposé', 2200);
    rendrePanneau();
  });
  q('choisir').addEventListener('click', () => choisirPhotos());
  if (q('aller')) q('aller').addEventListener('click', () => { d.close(); allerAuReportage(); });
  d.querySelectorAll('[data-vignette]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.vignette;
    const page = RP.pagesReportage(etat.projet).find((p) => p.objets.some((o) => o.id === id));
    d.close();
    if (page && (etat.plan === page || await changerPlanId(page.id))) { selectionner([id]); emettre('ouvrir-fiche', id); }
  }));
  d.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => changerReglage(el.dataset.k, el.value)));
}

async function changerReglage(cle, valeur) {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const projet = etat.projet;
  if (!projet.reportage) {
    // Avant la création : réglages mémorisés pour la création (rien d'autre ne change)
    if (brouillon.projet !== projet.id) brouillon = { projet: projet.id, reglages: {} };
    brouillon.reglages[cle] = cle === 'par_page' ? Number(valeur) : (cle === 'titre' ? (String(valeur).replace(/\s+/g, ' ').trim() || null) : valeur);
    notifier('Réglage retenu pour la création', 1800);
    return;
  }
  if (cle === 'titre') {
    await executer('Titre du reportage', (p) => { p.reportage.titre = String(valeur || '').replace(/\s+/g, ' ').trim() || null; RP.majTitresFolios(p); return { ok: true }; });
    rendrePanneau();
    return;
  }
  const v = cle === 'par_page' ? Number(valeur) : valeur;
  if (!(await confirmer('Appliquer ce réglage et redisposer tout le reportage ?', { ok: 'Appliquer' }))) { rendrePanneau(); return; }
  await executer('Réglage du reportage', (p) => {
    p.reportage[cle] = v;
    if (cle === 'format') for (const pg of RP.pagesReportage(p)) pg.format = { papier: v, orientation: 'paysage' };
    return RP.redisposerReportage(p);
  });
  rendrePanneau();
}

async function allerAuReportage() {
  const page = RP.pagesReportage(etat.projet)[0];
  if (page) await changerPlanId(page.id);
}

/* ---------- Choisir les photos ---------- */

function choisirPhotos() {
  const projet = etat.projet;
  const groupes = RP.toutesPhotos(projet);
  const ro = !peutModifier();
  const choix = new Map();
  for (const g of groupes) for (const ph of g.photos) choix.set(ph.id, RP.photoRetenue(g.objet, ph));
  const d = ouvrirDialogue('dlg-generique', `
    <form method="dialog" class="dialogue dialogue-reportage">
      <h2>Choisir les photos du reportage</h2>
      ${groupes.length ? '' : '<p class="vide">Aucune photo dans le projet : fiche d’un ouvrage → Photos.</p>'}
      <div class="boutons-image">
        <button type="button" class="btn" data-tout="ponctuels:1">Cocher les ouvrages</button>
        <button type="button" class="btn" data-tout="ponctuels:0">Décocher les ouvrages</button>
        <button type="button" class="btn" data-tout="lineaires:1">Cocher tronçons et fourreaux</button>
        <button type="button" class="btn" data-tout="lineaires:0">Décocher tronçons et fourreaux</button>
      </div>
      <div class="liste-photos-reportage">
        ${groupes.map((g) => `
          <div class="groupe-photos-reportage">
            <div class="titre-groupe"><strong>${echapper(g.objet.repere || LIBELLES.types[g.objet.type] || g.objet.type)}</strong> — ${echapper(LIBELLES.types[g.objet.type] || g.objet.type)} <span class="aide">(${echapper(g.plan.nom)})</span></div>
            <div class="vignettes-photos">${g.photos.map((ph) => {
    const e = imageChargee(ph.fond_id);
    return `<label class="vignette-photo choix-photo" data-lineaire="${g.objet.type === 'troncon' || g.objet.type === 'fourreau' ? 1 : 0}">
                ${e ? `<img src="${e.url}" alt="">` : '<span class="attente-photo">…</span>'}
                <span><input type="checkbox" data-photo="${echapper(ph.id)}" ${choix.get(ph.id) ? 'checked' : ''} ${ro ? 'disabled' : ''}> Au reportage</span>
              </label>`;
  }).join('')}</div>
          </div>`).join('')}
      </div>
      <div class="boutons">
        <button type="button" class="btn" data-r="non">Annuler</button>
        <button type="button" class="btn btn-primaire" data-r="oui" ${ro ? 'disabled' : ''}>Valider</button>
      </div>
    </form>`);
  for (const g of groupes) for (const ph of g.photos) if (!imageChargee(ph.fond_id)) chargerImage(ph.fond_id).then((e) => {
    const cb = d.querySelector(`[data-photo="${CSS.escape(ph.id)}"]`);
    const att = cb && cb.closest('label').querySelector('.attente-photo');
    if (e && att) { const img = document.createElement('img'); img.src = e.url; img.alt = ''; att.replaceWith(img); }
  });
  d.querySelectorAll('[data-photo]').forEach((cb) => cb.addEventListener('change', () => choix.set(cb.dataset.photo, cb.checked)));
  d.querySelectorAll('[data-tout]').forEach((b) => b.addEventListener('click', () => {
    const [quoi, v] = b.dataset.tout.split(':');
    d.querySelectorAll('.choix-photo').forEach((l) => {
      if ((l.dataset.lineaire === '1') !== (quoi === 'lineaires')) return;
      const cb = l.querySelector('[data-photo]');
      if (cb && !cb.disabled) { cb.checked = v === '1'; choix.set(cb.dataset.photo, cb.checked); }
    });
  }));
  d.querySelector('[data-r="non"]').addEventListener('click', () => { d.close(); rendrePanneau(); });
  d.querySelector('[data-r="oui"]').addEventListener('click', async () => {
    let n = 0;
    for (const g of groupes) for (const ph of g.photos) if (choix.get(ph.id) !== RP.photoRetenue(g.objet, ph)) n++;
    if (!n) { rendrePanneau(); return; }
    await executer('Photos du reportage', (p) => {
      for (const pl of p.plans) for (const o of pl.objets || []) for (const ph of o.photos || []) if (choix.has(ph.id)) ph.au_reportage = choix.get(ph.id);
      for (const v of RP.vignettesProjet(p)) v.reportage.alertes = RP.alertesVignette(v, p);
      return { ok: true };
    });
    notifier(n + ' photo(s) modifiée(s)' + (etat.projet && etat.projet.reportage ? ' — « Mettre à jour » pour ajouter les nouvelles' : ''), 3000);
    rendrePanneau();
  });
}

/* ---------- Section « Reportage » de la fiche d'une vignette ---------- */

const ETATS = () => K().etats_bloc;
const LIB_ETATS = { a_poser: 'À poser', existant: 'Existant', a_deposer: 'À déposer', a_reprendre: 'À remplacer' };

export function htmlSectionVignette(o) {
  if (!RP.estVignette(o)) return '';
  const rp = o.reportage;
  const ro = !peutModifier();
  const al = RP.libellesAlertes(o);
  const src = RP.trouverSource(etat.projet, rp.source.plan_id, rp.source.objet_id);
  const dis = ro ? 'disabled' : '';
  const blocs = (rp.blocs || []).map((b, i) => `
    <div class="bloc-reportage" data-bloc="${echapper(b.id)}">
      <div class="ligne-bloc-reportage">
        <input class="repere-saisie" data-b="repere" value="${echapper(b.repere || '')}" placeholder="Repère" size="6" ${dis} title="Repère${b.repere_manuel ? ' (saisi)' : ''}">
        <select data-b="etat" ${dis}>${ETATS().map((e) => `<option value="${e}" ${b.etat === e ? 'selected' : ''}>${LIB_ETATS[e]}</option>`).join('')}</select>
        <button type="button" class="btn-icone" data-ba="haut" ${i === 0 || ro ? 'disabled' : ''} title="Monter">▲</button>
        <button type="button" class="btn-icone" data-ba="bas" ${i === rp.blocs.length - 1 || ro ? 'disabled' : ''} title="Descendre">▼</button>
        <button type="button" class="btn-icone" data-ba="supprimer" ${dis} title="Retirer ce bloc">✕</button>
      </div>
      <label>Équipement<input data-b="equipement" value="${echapper(b.equipement || '')}" ${dis}></label>
      <div class="lignes-bloc-reportage">
        ${(b.lignes || []).map((l) => l.supprimee ? '' : `
          <div class="ligne-reportage ${l.origine === 'manuelle' ? 'manuelle' : ''}" data-ligne="${echapper(l.id)}">
            <input data-l="texte" value="${echapper(l.texte || '')}" ${dis} title="${l.origine === 'manuelle' ? 'Ligne saisie à la main' : 'Ligne générée (devient manuelle si on la modifie)'}">
            <button type="button" class="btn-icone" data-la="supprimer" ${dis} title="Supprimer la ligne">✕</button>
          </div>`).join('')}
      </div>
      ${(b.alertes || []).length ? `<div class="alerte-materiel">${echapper((b.alertes || []).map((a) => K().alertes[a] || a).join(' ; '))}</div>` : ''}
      <div class="boutons-image">
        <button type="button" class="btn" data-ba="ligne" ${dis}>+ Ligne</button>
        <button type="button" class="btn" data-ba="auto" ${dis || (RP.aDuManuel(b) ? '' : 'disabled')}>Rétablir l’automatique</button>
        <button type="button" class="btn" data-ba="aller">Aller à l’ouvrage</button>
      </div>
    </div>`).join('');
  const options = RP.ouvragesProposes(etat.projet).map((x) => `<option value="${echapper(x.plan.id + '|' + x.objet.id)}">${echapper((x.objet.repere || '—') + ' — ' + (LIBELLES.types[x.objet.type] || x.objet.type) + ' ' + (LIBELLES.etats[x.objet.etat] || '').toLowerCase() + ' (' + x.plan.nom + ')')}</option>`).join('');
  return `
    <section class="bloc section-reportage">
      <h3>Reportage photo</h3>
      <div class="aide">Photo de ${echapper(src ? (src.objet.repere || LIBELLES.types[src.objet.type] || '') + ' (' + src.plan.nom + ')' : 'un ouvrage supprimé')}. Texte généré comme au descriptif ; toute retouche est conservée par « Mettre à jour ».</div>
      ${al.length ? `<div class="alerte-materiel"><strong>${echapper(al.join(' ; '))}</strong></div>` : ''}
      ${blocs || '<p class="vide">Aucun bloc.</p>'}
      <div class="ligne2">
        <select data-r="ouvrage" ${dis}><option value="">Ajouter le bloc d’un autre ouvrage…</option>${options}</select>
        <button type="button" class="btn" data-r="ajouter" ${dis}>+ Ouvrage</button>
      </div>
    </section>`;
}

export function brancherSectionVignette(racine, o) {
  const z = racine.querySelector('.section-reportage');
  if (!z) return;
  const bloc = (el) => { const id = el.closest('[data-bloc]').dataset.bloc; return o.reportage.blocs.find((b) => b.id === id); };
  const modif = (fn, etiquette) => { if (!peutModifier()) { signalerLectureSeule(); return; } fn(); valider(etiquette); };
  z.querySelectorAll('[data-b]').forEach((el) => el.addEventListener('change', () => modif(() => {
    const b = bloc(el), k = el.dataset.b, v = String(el.value || '').replace(/\s+/g, ' ').trim();
    if (k === 'etat' && !ETATS().includes(v)) return;
    if (b[k] === v) return;
    b[k] = v; b[k + '_manuel'] = true;
  }, 'Reportage — bloc')));
  z.querySelectorAll('[data-l]').forEach((el) => el.addEventListener('change', () => modif(() => {
    const b = bloc(el), l = b.lignes.find((x) => x.id === el.closest('[data-ligne]').dataset.ligne);
    if (!l) return;
    l.texte = String(el.value || ''); l.origine = 'manuelle';
  }, 'Reportage — ligne')));
  z.querySelectorAll('[data-la="supprimer"]').forEach((el) => el.addEventListener('click', () => modif(() => {
    const b = bloc(el), id = el.closest('[data-ligne]').dataset.ligne;
    const l = b.lignes.find((x) => x.id === id);
    if (!l) return;
    if (l.cle_auto) { l.origine = 'manuelle'; l.supprimee = true; } else b.lignes = b.lignes.filter((x) => x !== l);
  }, 'Reportage — ligne supprimée')));
  z.querySelectorAll('[data-ba]').forEach((el) => el.addEventListener('click', async () => {
    const b = bloc(el), act = el.dataset.ba, liste = o.reportage.blocs, i = liste.indexOf(b);
    if (act === 'aller') { allerAOuvrage(b.plan_id, b.objet_id); return; }
    if (act === 'supprimer' && !(await confirmer('Retirer ce bloc de la photo ? (annulable par Ctrl+Z)', { ok: 'Retirer', danger: true }))) return;
    modif(() => {
      if (act === 'haut' && i > 0) [liste[i - 1], liste[i]] = [liste[i], liste[i - 1]];
      else if (act === 'bas' && i < liste.length - 1) [liste[i + 1], liste[i]] = [liste[i], liste[i + 1]];
      else if (act === 'supprimer') liste.splice(i, 1);
      else if (act === 'ligne') b.lignes.push({ id: genererId('rl'), cle_auto: null, origine: 'manuelle', texte: 'Nouvelle ligne' });
      else if (act === 'auto') {
        b.repere_manuel = false; b.etat_manuel = false; b.equipement_manuel = false;
        b.lignes = b.lignes.filter((l) => l.cle_auto).map((l) => ({ ...l, origine: 'auto', supprimee: undefined }));
        b.alertes = (b.alertes || []).filter((a) => a !== 'source_modifiee');
        b.empreinte = null;
        RP.mettreAJourBloc(b, etat.projet);
      }
    }, 'Reportage — bloc');
  }));
  const sel = z.querySelector('[data-r="ouvrage"]');
  z.querySelector('[data-r="ajouter"]').addEventListener('click', () => {
    if (!sel.value) { notifier('Choisissez d’abord un ouvrage dans la liste'); return; }
    const [plan_id, objet_id] = sel.value.split('|');
    modif(() => { RP.ajouterOuvrage(o, etat.projet, plan_id, objet_id); }, 'Reportage — ouvrage ajouté');
  });
}

/* Ouvre le plan de l'ouvrage, le centre, le sélectionne et ouvre sa fiche. */
export async function allerAOuvrage(plan_id, objet_id) {
  const src = RP.trouverSource(etat.projet, plan_id, objet_id);
  if (!src) { notifier('Ouvrage introuvable (supprimé ?)'); return; }
  if (etat.plan !== src.plan && !(await changerPlanId(src.plan.id))) return;
  const o = src.objet;
  const pts = Array.isArray(o.points) && o.points.length ? o.points : null;
  const p = pts ? pts[Math.floor(pts.length / 2)] : { x: o.x || 0, y: o.y || 0 };
  const k = Math.max(vue.k, 2);
  appliquer({ k, tx: vue.largeurEcran / 2 - p.x * k, ty: vue.hauteurEcran / 2 - p.y * k });
  selectionner([o.id]);
  emettre('ouvrir-fiche', o.id);
}

/* ---------- Fiche des ouvrages : doublon de repère, objet illustratif ---------- */

export function htmlAlertesOuvrage(o) {
  if (!o || !etat.projet) return '';
  if (o.illustratif) return '<div class="aide rappel-couleur-perso">Objet illustratif (page de reportage photo) : hors descriptif, métré, nomenclature et légende.</div>';
  const r = RP.normaliserRepere(o.repere);
  if (!r) return '';
  const n = RP.doublonsReperes(etat.projet).get(r);
  return n ? `<div class="alerte-materiel"><strong>${echapper(RP.texteDoublon(r, n))}</strong></div>` : '';
}

