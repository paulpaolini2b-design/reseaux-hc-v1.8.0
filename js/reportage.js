/* reportage.js — v1.8.0 : reportage photo automatique (H-369 à H-382).
 *
 * Modèle :
 * - page de reportage : plan `type: 'reportage'`, page vierge A3 (ou A4) paysage, légende masquée, sans descriptif ;
 * - réglages du projet : `projet.reportage` { par_page, format, titre (null = automatique), cree_le } — null tant que le
 *   reportage n'est pas créé ;
 * - vignette : image libre (`type: 'image'`) portant `reportage` { source { objet_id, plan_id, photo_id }, blocs[],
 *   largeur_blocs, echelle_texte, alertes[], pose } ; elle RÉFÉRENCE le binaire de la photo (`fond_id`), sans copie.
 *   Écart assumé au prompt (§ 4.1, type `reportage_vignette`) : l'image libre apporte déplacement, taille, rotation,
 *   rognage, export PDF / PNG et protection du binaire déjà éprouvés (même choix que le plan de situation) ;
 * - bloc : { id, objet_id, plan_id, repere, etat, equipement (+ *_manuel), lignes [{ id, cle_auto, origine, texte,
 *   supprimee? }], empreinte, alertes[] } — texte généré par le moteur du descriptif (descriptif.js), jamais ailleurs ;
 * - titre et folio : notes marquées `reportage_role` 'titre' | 'folio', recalculées par les commandes ;
 * - objets de réseau d'une page de reportage : `illustratif: true` (hors descriptif, métré, nomenclature, légende,
 *   contrôles), `vignette_id` (vignette sous leur premier point, null sinon) — ils suivent la vignette (synchroniserPage).
 *
 * Module sans DOM : les commandes modifient le projet passé en argument ; ui/reportage.js les enregistre dans l'historique
 * (opérations de pages) et fournit les dimensions des photos (`dimsDe(fond_id)` → { l, h } en pixels ou null). */
import { CHARTE, MM } from './charte.js';
import { genererId, nouveauPlan, nouvelleImage, nouvelleNote, TYPES_PONCTUELS, porteurPhotos, auReportageParDefaut } from './modele.js';
import { contexteReportage, ordreObjetsDescriptif, equipementReportage, lignesOuvrageReportage, comparerNaturel, empreinte, appliquerFormat } from './descriptif.js';
import { dimensionsFormat } from './plans-calcul.js';
import { mesurerTexte } from './primitives.js';
import { dansRectangleTourne, rectangleVisible, tourner } from './forme-calcul.js';
import { hauteurBlocs, boitePhoto } from './reportage-rendu.js';

const R = () => CHARTE.reportage;
export const TYPES_RESEAU = [...TYPES_PONCTUELS, 'troncon', 'fourreau'];

/* ---------- Lecture ---------- */
export function estPageReportage(plan) { return !!plan && plan.type === 'reportage'; }
export function estVignette(o) { return !!o && o.type === 'image' && !!o.reportage; }
export function pagesReportage(projet) { return ((projet && projet.plans) || []).filter(estPageReportage); }
export function vignettesProjet(projet) { return pagesReportage(projet).flatMap((p) => (p.objets || []).filter(estVignette)); }

export function reglagesParDefaut() {
  return { par_page: R().par_page_defaut, format: R().format_defaut, titre: null, cree_le: null };
}
export function reglages(projet) {
  const r = (projet && projet.reportage) || {};
  const d = reglagesParDefaut();
  return {
    par_page: R().par_page.includes(Number(r.par_page)) ? Number(r.par_page) : d.par_page,
    format: R().formats.includes(r.format) ? r.format : d.format,
    titre: typeof r.titre === 'string' ? r.titre : null,
    cree_le: r.cree_le || null
  };
}

/* Titre automatique (champs `commune` et `num_sieep` de l'affaire ; morceau omis si vide). */
export function titreAutomatique(projet) {
  const p = projet || {};
  return appliquerFormat(R().titre.defaut, { commune: String(p.commune || '').trim(), num_sieep: String(p.num_sieep || '').trim() });
}
export function titreEffectif(projet) {
  const t = reglages(projet).titre;
  return t !== null && t.trim() ? t.trim() : titreAutomatique(projet);
}

/* La photo est-elle retenue au reportage ? (valeur stockée, sinon défaut selon le type) */
export function photoRetenue(o, ph) {
  return !!ph && (typeof ph.au_reportage === 'boolean' ? ph.au_reportage : auReportageParDefaut(o));
}

/* Objet et plan d'origine (plan indiqué d'abord, puis tout le projet). */
export function trouverSource(projet, plan_id, objet_id) {
  const plans = (projet && projet.plans) || [];
  const pl = plans.find((p) => p.id === plan_id && !estPageReportage(p));
  const o1 = pl && (pl.objets || []).find((o) => o.id === objet_id);
  if (o1) return { plan: pl, objet: o1 };
  for (const p of plans) {
    if (estPageReportage(p)) continue;
    const o = (p.objets || []).find((x) => x.id === objet_id);
    if (o) return { plan: p, objet: o };
  }
  return null;
}

/* ---------- Ordre des ouvrages et des photos (§ 3.2) ---------- */

/* Ouvrages d'un plan dans l'ordre du descriptif ; ERAS et MALT rattachées juste après leur hôte ; le reste (exclu du
 * descriptif) en fin, ordre naturel des repères. */
export function ouvragesOrdonnes(plan, projet) {
  const ctx = contexteReportage(plan, projet);
  const parId = new Map((plan.objets || []).map((o) => [o.id, o]));
  const ordre = [];
  const vus = new Set();
  const pousser = (o) => {
    if (!o || vus.has(o.id) || o.illustratif) return;
    vus.add(o.id);
    if (porteurPhotos(o)) ordre.push(o);
    for (const r of ctx.attaches.get(o.id) || []) pousser(r);
  };
  for (const id of ordreObjetsDescriptif(plan, projet)) pousser(parId.get(id));
  const reste = (plan.objets || []).filter((o) => porteurPhotos(o) && !vus.has(o.id))
    .sort((a, b) => comparerNaturel(a.repere || '', b.repere || ''));
  for (const o of reste) pousser(o);
  return { ordre, ctx };
}

/* Photos retenues du projet, dans l'ordre : [{ plan, objet, photo }]. */
export function photosRetenues(projet) {
  const res = [];
  for (const plan of (projet && projet.plans) || []) {
    if (estPageReportage(plan)) continue;
    const { ordre } = ouvragesOrdonnes(plan, projet);
    for (const o of ordre) {
      const photos = [...(o.photos || [])].filter((ph) => ph && ph.fond_id && photoRetenue(o, ph))
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      for (const ph of photos) res.push({ plan, objet: o, photo: ph });
    }
  }
  return res;
}

/* Toutes les photos du projet (retenues ou non), groupées par ouvrage dans le même ordre (« Choisir les photos »). */
export function toutesPhotos(projet) {
  const res = [];
  for (const plan of (projet && projet.plans) || []) {
    if (estPageReportage(plan)) continue;
    for (const o of ouvragesOrdonnes(plan, projet).ordre) {
      const photos = [...(o.photos || [])].filter((ph) => ph && ph.fond_id).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      if (photos.length) res.push({ plan, objet: o, photos });
    }
  }
  return res;
}

/* ---------- Blocs (§ 4.2, § 4.3) ---------- */

export function contenuBloc(o, ctx) {
  return {
    repere: String(o.repere || '').replace(/\.\s*$/, '').trim(),
    etat: R().etats_bloc.includes(o.etat) ? o.etat : 'existant',
    equipement: equipementReportage(o),
    lignes: lignesOuvrageReportage(o, ctx)
  };
}

export function aDuManuel(b) {
  return !!b && (!!b.repere_manuel || !!b.etat_manuel || !!b.equipement_manuel || (b.lignes || []).some((l) => l.origine === 'manuelle'));
}

/* Lignes générées fondues dans les lignes du bloc : les lignes automatiques suivent la génération (même id), celles qui
 * ne s'appliquent plus disparaissent, les nouvelles s'insèrent après leur voisine générée ; les lignes manuelles
 * (modifiées, ajoutées, supprimées) restent telles quelles. */
export function fusionnerLignesBloc(existantes, nouvelles) {
  const parCle = new Map(nouvelles.map((n) => [n.cle, n]));
  const res = [];
  const vues = new Set();
  for (const l of existantes || []) {
    if (l.origine === 'auto') {
      const n = parCle.get(l.cle_auto);
      if (n && !vues.has(n.cle)) { l.texte = n.texte; delete l.supprimee; res.push(l); vues.add(n.cle); }
    } else { res.push(l); if (l.cle_auto) vues.add(l.cle_auto); }
  }
  nouvelles.forEach((n, i) => {
    if (vues.has(n.cle)) return;
    let pos = -1;
    for (let j = i - 1; j >= 0 && pos < 0; j--) pos = res.findIndex((x) => x.cle_auto === nouvelles[j].cle);
    res.splice(pos + 1, 0, { id: genererId('rl'), cle_auto: n.cle, origine: 'auto', texte: n.texte });
    vues.add(n.cle);
  });
  return res;
}

/* Applique le contenu généré à un bloc (neuf ou existant). */
export function appliquerContenuBloc(b, c) {
  b.lignes = fusionnerLignesBloc(b.lignes, c.lignes);
  if (!b.repere_manuel) b.repere = c.repere;
  if (!b.etat_manuel) b.etat = c.etat;
  if (!b.equipement_manuel) b.equipement = c.equipement;
  const e = empreinte({ r: c.repere, e: c.etat, q: c.equipement, l: c.lignes.map((l) => [l.cle, l.texte]) });
  const alertes = (b.alertes || []).filter((a) => a === 'source_modifiee');
  if (b.empreinte && b.empreinte !== e && aDuManuel(b) && !alertes.includes('source_modifiee')) alertes.push('source_modifiee');
  b.empreinte = e;
  b.alertes = alertes;
  return b;
}

export function nouveauBloc(o, plan, ctx) {
  const b = { id: genererId('rb'), objet_id: o.id, plan_id: plan.id, repere: '', repere_manuel: false, etat: 'existant', etat_manuel: false, equipement: '', equipement_manuel: false, lignes: [], empreinte: null, alertes: [] };
  return appliquerContenuBloc(b, contenuBloc(o, ctx));
}

/* Met à jour un bloc d'après son ouvrage source ; source introuvable → bloc figé, alerte « source_supprimee ». */
export function mettreAJourBloc(b, projet, cache = new Map()) {
  const src = trouverSource(projet, b.plan_id, b.objet_id);
  if (!src) {
    b.alertes = [...new Set([...(b.alertes || []).filter((a) => a !== 'source_supprimee'), 'source_supprimee'])];
    return false;
  }
  b.plan_id = src.plan.id;
  if (!cache.has(src.plan.id)) cache.set(src.plan.id, contexteReportage(src.plan, projet));
  b.alertes = (b.alertes || []).filter((a) => a !== 'source_supprimee');
  appliquerContenuBloc(b, contenuBloc(src.objet, cache.get(src.plan.id)));
  return true;
}

/* Alertes propres à la vignette (§ 8) — `vignette_pleine` est posée par la mise en page et conservée ici. */
export function alertesVignette(v, projet) {
  const rp = v.reportage;
  const res = (rp.alertes || []).filter((a) => a === 'vignette_pleine');
  const src = trouverSource(projet, rp.source.plan_id, rp.source.objet_id);
  if (!src) res.push('source_supprimee');
  else {
    const ph = (src.objet.photos || []).find((p) => p.id === rp.source.photo_id);
    if (!ph) res.push('photo_retiree');
    else if (!photoRetenue(src.objet, ph)) res.push('photo_non_retenue');
  }
  return res;
}

/* Toutes les alertes d'une vignette (vignette + blocs), libellés lisibles, sans doublon. */
export function libellesAlertes(v) {
  const A = R().alertes;
  const rp = v && v.reportage;
  if (!rp) return [];
  const cles = [...(rp.alertes || [])];
  for (const b of rp.blocs || []) for (const a of b.alertes || []) cles.push(a === 'source_supprimee' ? 'source_supprimee:' + (b.repere || '') : a);
  return [...new Set(cles)].map((k) => {
    const [c, rep] = k.split(':');
    return (A[c] || c) + (rep ? ' (' + rep + ')' : '');
  });
}

/* ---------- Mise en page (§ 3.3) ---------- */

export function dimensionsPage(format) {
  return dimensionsFormat({ papier: format, orientation: 'paysage' }, CHARTE.plans.papiers);
}

/* Cellules de la grille d'une page : [{ x, y, l, h }] en unités plan, ligne par ligne. */
export function cellulesGrille(format, par_page) {
  const { l: W, h: H } = dimensionsPage(format);
  const K = R();
  const [nc, nr] = K.grilles[par_page] || K.grilles[K.par_page_defaut];
  const m = K.marge_mm * MM, g = K.ecart_cellules_mm * MM;
  const x0 = m, y0 = m + K.titre.hauteur_zone_mm * MM;
  const lz = W - 2 * m, hz = H - y0 - m - K.folio.hauteur_zone_mm * MM;
  const lc = (lz - (nc - 1) * g) / nc, hc = (hz - (nr - 1) * g) / nr;
  const res = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) res.push({ x: x0 + c * (lc + g), y: y0 + r * (hc + g), l: lc, h: hc });
  return res;
}

/* Place une vignette dans une cellule : blocs sur toute la largeur de la cellule, photo au-dessus (proportions de la
 * partie visible conservées), réduction du texte jusqu'à `echelle_texte_min` si la photo n'a plus sa part minimale. */
export function placerDansCellule(v, cell) {
  const K = R(), rp = v.reportage;
  rp.largeur_blocs = cell.l;
  const ecart = rp.blocs && rp.blocs.length ? K.ecart_photo_blocs_mm * MM : 0;
  const hB = (e) => hauteurBlocs(rp.blocs, cell.l, e) + ecart;
  const minPhoto = cell.h * K.photo_min_fraction;
  let e = 1;
  while (cell.h - hB(e) < minPhoto && e > K.echelle_texte_min + 1e-9) e = Math.max(K.echelle_texte_min, Math.round((e - 0.05) * 100) / 100);
  const pleine = cell.h - hB(e) < minPhoto;
  rp.echelle_texte = e;
  rp.alertes = (rp.alertes || []).filter((a) => a !== 'vignette_pleine');
  if (pleine) rp.alertes.push('vignette_pleine');
  const hPhoto = Math.max(minPhoto, cell.h - hB(e));
  const bp = boitePhoto(v);
  const k = Math.min(cell.l / (bp.l || 1), hPhoto / (bp.h || 1));
  v.largeur = v.largeur * k; v.hauteur = v.hauteur * k;
  v.x = (v.x - bp.cx) * k + bp.cx; v.y = (v.y - bp.cy) * k + bp.cy;   // visible mis à l'échelle autour de son propre centre
  const b2 = boitePhoto(v);
  v.x += cell.x + cell.l / 2 - b2.cx;
  v.y += cell.y - b2.y;
  return v;
}

/* Nouvelle vignette (photo `ph` de l'ouvrage `o` du plan `plan`) ; `dims` : { l, h } en pixels (null : 4 × 3 portrait). */
export function nouvelleVignette(o, plan, ph, ctx, dims) {
  const l = dims && dims.l > 0 ? dims.l : 3, h = dims && dims.h > 0 ? dims.h : 4;
  const v = nouvelleImage(0, 0, l, h, ph.fond_id, 'photo ' + (o.repere || ''));
  v.echelle_plan_origine = null;
  v.reportage = { source: { objet_id: o.id, plan_id: plan.id, photo_id: ph.id }, blocs: [nouveauBloc(o, plan, ctx)], largeur_blocs: 0, echelle_texte: 1, alertes: [], pose: null };
  return v;
}

/* ---------- Titre et folio (§ 1.1) ---------- */

function noteReportage(role, texte, taille, page) {
  const n = nouvelleNote(0, 0, texte);
  n.echelle_plan_origine = null;
  n.reportage_role = role;
  n.couleur = '#000000';
  n.taille = taille;
  n.fond = 'aucun'; n.cadre = 'aucun';
  positionnerNote(n, page, role);
  return n;
}

function positionnerNote(n, page, role) {
  const K = R();
  const { l: W, h: H } = dimensionsPage(page.format && page.format.papier ? page.format.papier : K.format_defaut);
  const gras = role === 'titre';
  n.segments = [[gras ? { t: n.texte, g: true } : { t: n.texte }]];
  n.alignement = 'gauche';
  const larg = mesurerTexte(n.texte, n.taille, gras ? { gras: true } : null);
  const hauteur = n.taille * 1.22;
  const m = K.marge_mm * MM;
  n.x = W / 2 - larg / 2;
  n.y = role === 'titre' ? m + (K.titre.hauteur_zone_mm * MM - hauteur) / 2 : H - m - (K.folio.hauteur_zone_mm * MM + hauteur) / 2;
}

/* Titre sur chaque page, folio « n/N » s'il y a plusieurs pages (retiré sinon). */
export function majTitresFolios(projet) {
  const pages = pagesReportage(projet);
  const N = pages.length;
  const titre = titreEffectif(projet);
  pages.forEach((page, i) => {
    let t = page.objets.find((o) => o.type === 'note' && o.reportage_role === 'titre');
    if (!titre) page.objets = page.objets.filter((o) => o !== t);
    else if (!t) page.objets.unshift(noteReportage('titre', titre, R().titre.taille_mm * MM, page));
    else { t.texte = titre; positionnerNote(t, page, 'titre'); }
    const f = page.objets.find((o) => o.type === 'note' && o.reportage_role === 'folio');
    const tf = (i + 1) + '/' + N;
    if (N <= 1) page.objets = page.objets.filter((o) => o !== f);
    else if (!f) page.objets.push(noteReportage('folio', tf, R().folio.taille_mm * MM, page));
    else { f.texte = tf; positionnerNote(f, page, 'folio'); }
  });
}

/* ---------- Pages ---------- */

export function nouvellePageReportage(projet, numero) {
  const r = reglages(projet);
  const p = nouveauPlan('Reportage photo ' + numero);
  p.type = 'reportage';
  p.format = { papier: r.format, orientation: 'paysage' };
  p.page_vierge = true;
  p.legende.visible = false;
  return p;
}

/* Indice d'insertion des pages de reportage : après la dernière page de type `plan`. */
function indiceInsertion(projet) {
  let i = -1;
  projet.plans.forEach((p, k) => { if (!estPageReportage(p)) i = k; });
  return i + 1;
}

/* ---------- Suivi des objets rattachés (§ 7) ---------- */

export function poseVignette(v) { return { x: v.x, y: v.y, largeur: v.largeur, rotation: v.rotation || 0 }; }
function memePose(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y && a.largeur === b.largeur && a.rotation === b.rotation; }

/* Transforme un point de la pose `a` vers la pose `b` (translation, échelle, rotation de la photo). */
export function transformerPoint(p, a, b) {
  const k = (b.largeur || 1) / (a.largeur || 1);
  const q = tourner(p, { x: a.x, y: a.y }, -(a.rotation || 0));
  const r = { x: b.x + (q.x - a.x) * k, y: b.y + (q.y - a.y) * k };
  return tourner(r, { x: b.x, y: b.y }, b.rotation || 0);
}

export function transformerObjet(o, a, b) {
  const tp = (p) => transformerPoint(p, a, b);
  if (typeof o.x === 'number' && typeof o.y === 'number') { const q = tp({ x: o.x, y: o.y }); o.x = q.x; o.y = q.y; }
  if (Array.isArray(o.points)) o.points = o.points.map((p) => ({ ...p, ...tp(p) }));
  if (o.fleche && typeof o.fleche.x === 'number') o.fleche = tp(o.fleche);
  const d = (b.rotation || 0) - (a.rotation || 0);
  if (d && o.type !== 'troncon' && o.type !== 'fourreau' && typeof o.rotation === 'number' && !Array.isArray(o.points)) o.rotation = ((o.rotation + d) % 360 + 360) % 360;
}

function ancre(o) {
  if (Array.isArray(o.points) && o.points.length) return o.points[0];
  if (typeof o.x === 'number' && typeof o.y === 'number') return { x: o.x, y: o.y };
  return null;
}

function vignetteSous(p, vignettes) {
  if (!p) return null;
  for (let i = vignettes.length - 1; i >= 0; i--) {
    const v = vignettes[i], r = rectangleVisible(v);
    if (dansRectangleTourne(p, r.cx, r.cy, r.l, r.h, v.rotation || 0)) return v;
  }
  return null;
}

/* Appelé par valider() sur la page affichée et par les commandes sur chaque page de reportage : marque les objets de
 * réseau illustratifs, rattache les nouveaux objets à la vignette sous leur premier point, fait suivre la vignette à ses
 * objets rattachés, retire les objets d'une vignette supprimée. Retourne true si quelque chose a changé. */
export function synchroniserPage(plan) {
  if (!estPageReportage(plan)) return false;
  let change = false;
  const vignettes = plan.objets.filter(estVignette);
  const ids = new Set(vignettes.map((v) => v.id));
  const avant = plan.objets.length;
  plan.objets = plan.objets.filter((o) => !(o.vignette_id && !ids.has(o.vignette_id)));
  if (plan.objets.length !== avant) change = true;
  for (const o of plan.objets) {
    if (estVignette(o) || o.reportage_role) continue;
    if (TYPES_RESEAU.includes(o.type) && !o.illustratif) { o.illustratif = true; change = true; }
    if (o.vignette_id === undefined) { const v = vignetteSous(ancre(o), vignettes); o.vignette_id = v ? v.id : null; change = true; }
  }
  for (const v of vignettes) {
    const pose = poseVignette(v);
    const ancienne = v.reportage.pose;
    if (ancienne && !memePose(ancienne, pose)) {
      for (const o of plan.objets) if (o.vignette_id === v.id) transformerObjet(o, ancienne, pose);
      change = true;
    }
    if (!memePose(ancienne, pose)) { v.reportage.pose = pose; change = true; }
  }
  return change;
}

/* ---------- Commandes (§ 3.1) ---------- */

function dimsVisibles(dimsDe, fond_id) { try { return dimsDe ? dimsDe(fond_id) : null; } catch (e) { return null; } }

/* Distribue des vignettes (avec leurs objets rattachés) dans les cellules, à partir de la page `debutPage`, case `debutCase`.
 * Crée les pages manquantes (insérées après la dernière page de reportage, ou après les plans). */
function distribuer(projet, elements, debut = null) {
  const r = reglages(projet);
  const cells = cellulesGrille(r.format, r.par_page);
  let pages = pagesReportage(projet);
  let ip = debut ? debut.page : 0, ic = debut ? debut.case : 0;
  const ajoutees = [];
  for (const el of elements) {
    if (ic >= cells.length) { ip++; ic = 0; }
    if (!pages[ip]) {
      const p = nouvellePageReportage(projet, pages.length + 1);
      const der = pages.length ? projet.plans.indexOf(pages[pages.length - 1]) + 1 : indiceInsertion(projet);
      projet.plans.splice(der, 0, p);
      pages = pagesReportage(projet);
      ajoutees.push(p);
    }
    const page = pages[ip];
    const v = el.vignette;
    const avant = poseVignette(v);
    placerDansCellule(v, cells[ic]);
    const apres = poseVignette(v);
    for (const o of el.rattaches) transformerObjet(o, avant, apres);
    v.reportage.pose = apres;
    page.objets.push(v, ...el.rattaches);
    ic++;
  }
  return ajoutees;
}

/* Crée le reportage. Retourne { pages: [plans ajoutés], vignettes: n } ou { erreur }. */
export function creerReportage(projet, dimsDe, options = {}) {
  if (projet.reportage && pagesReportage(projet).length) return { erreur: 'Le reportage existe déjà : « Mettre à jour » ou « Redisposer tout »' };
  const sources = photosRetenues(projet);
  if (!sources.length) return { erreur: 'Aucune photo retenue : prenez des photos depuis la fiche des ouvrages, ou cochez-en dans « Choisir les photos »' };
  projet.reportage = { ...reglagesParDefaut(), ...options, cree_le: new Date().toISOString() };
  projet.reportage = { ...projet.reportage, ...reglages(projet) };
  const cache = new Map();
  const ctxDe = (pl) => { if (!cache.has(pl.id)) cache.set(pl.id, contexteReportage(pl, projet)); return cache.get(pl.id); };
  const elements = sources.map((s) => ({ vignette: nouvelleVignette(s.objet, s.plan, s.photo, ctxDe(s.plan), dimsVisibles(dimsDe, s.photo.fond_id)), rattaches: [] }));
  const pages = distribuer(projet, elements);
  for (const v of vignettesProjet(projet)) v.reportage.alertes = alertesVignette(v, projet);
  majTitresFolios(projet);
  return { pages, vignettes: elements.length };
}

/* Met à jour : texte des blocs, alertes, nouvelles photos en fin de reportage (sans redisposer l'existant). */
export function mettreAJourReportage(projet, dimsDe) {
  if (!projet.reportage) return { erreur: 'Aucun reportage : « Créer le reportage » d’abord' };
  const cache = new Map();
  const vignettes = vignettesProjet(projet);
  for (const v of vignettes) for (const b of v.reportage.blocs || []) mettreAJourBloc(b, projet, cache);
  const presentes = new Set(vignettes.map((v) => v.reportage.source.photo_id));
  const ctxDe = (pl) => { if (!cache.has(pl.id)) cache.set(pl.id, contexteReportage(pl, projet)); return cache.get(pl.id); };
  const nouvelles = photosRetenues(projet).filter((s) => !presentes.has(s.photo.id));
  const elements = nouvelles.map((s) => ({ vignette: nouvelleVignette(s.objet, s.plan, s.photo, ctxDe(s.plan), dimsVisibles(dimsDe, s.photo.fond_id)), rattaches: [] }));
  let pages = [];
  if (elements.length) {
    const r = reglages(projet);
    const n = cellulesGrille(r.format, r.par_page).length;
    const toutes = pagesReportage(projet);
    let debut = { page: 0, case: 0 };
    if (toutes.length) {
      const der = toutes.length - 1;
      const occ = toutes[der].objets.filter(estVignette).length;
      debut = occ < n ? { page: der, case: occ } : { page: der + 1, case: 0 };
    }
    pages = distribuer(projet, elements, debut);
  }
  for (const v of vignettesProjet(projet)) v.reportage.alertes = alertesVignette(v, projet);
  majTitresFolios(projet);
  return { pages, ajoutees: elements.length };
}

/* Redispose toutes les vignettes (ordre du § 3.2, puis celles hors de l'ordre dans leur ordre actuel). Les objets
 * rattachés suivent leur vignette, les autres objets restent sur leur page. Les pages de reportage vidées sont retirées
 * (la première est conservée). Retourne { pages: ajoutées, retirees: [plans retirés] }. */
export function redisposerReportage(projet) {
  if (!projet.reportage) return { erreur: 'Aucun reportage : « Créer le reportage » d’abord' };
  const pages = pagesReportage(projet);
  const vignettes = [];
  const rattachesDe = new Map();
  for (const p of pages) {
    synchroniserPage(p);
    for (const o of p.objets) if (estVignette(o)) vignettes.push(o);
    for (const o of p.objets) if (o.vignette_id) { if (!rattachesDe.has(o.vignette_id)) rattachesDe.set(o.vignette_id, []); rattachesDe.get(o.vignette_id).push(o); }
    p.objets = p.objets.filter((o) => !estVignette(o) && !o.vignette_id);
  }
  const rang = new Map(photosRetenues(projet).map((s, i) => [s.photo.id, i]));
  const ordonnees = vignettes.map((v, i) => ({ v, i, r: rang.has(v.reportage.source.photo_id) ? rang.get(v.reportage.source.photo_id) : Infinity }))
    .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.v);
  const ajoutees = distribuer(projet, ordonnees.map((v) => ({ vignette: v, rattaches: rattachesDe.get(v.id) || [] })));
  const retirees = [];
  const toutes = pagesReportage(projet);
  toutes.forEach((p, i) => {
    if (i === 0) return;
    if (!p.objets.some((o) => estVignette(o) || (!o.reportage_role))) { retirees.push(p); }
  });
  projet.plans = projet.plans.filter((p) => !retirees.includes(p));
  for (const v of vignettesProjet(projet)) v.reportage.alertes = alertesVignette(v, projet);
  majTitresFolios(projet);
  return { pages: ajoutees, retirees };
}

/* Ajoute sous la vignette le bloc d'un autre ouvrage (§ 5). */
export function ajouterOuvrage(v, projet, plan_id, objet_id) {
  const src = trouverSource(projet, plan_id, objet_id);
  if (!src || !estVignette(v)) return null;
  const b = nouveauBloc(src.objet, src.plan, contexteReportage(src.plan, projet));
  v.reportage.blocs.push(b);
  return b;
}

/* Ouvrages du projet proposés par « + Ouvrage » : [{ plan, objet }] dans l'ordre du reportage. */
export function ouvragesProposes(projet) {
  const res = [];
  for (const plan of (projet && projet.plans) || []) {
    if (estPageReportage(plan)) continue;
    for (const o of ouvragesOrdonnes(plan, projet).ordre) res.push({ plan, objet: o });
  }
  return res;
}

/* ---------- Export PDF (§ 10, H-381) ----------
 * Largeur en pixels de l'image ENTIÈRE pour que la photo imprimée atteigne `dpi` ; 0 si la photo stockée n'en a pas
 * davantage (embarquée telle quelle, jamais suréchantillonnée). */
export function largeurPxExport(largeurPlan, largeurPxStockee, dpi = R().export.dpi) {
  const cible = Math.ceil((largeurPlan / MM / 25.4) * dpi);
  return !largeurPxStockee || !(cible > 0) || cible >= largeurPxStockee ? 0 : cible;
}

/* ---------- Doublons de repère (§ 9) ---------- */

export function normaliserRepere(r) { return String(r || '').replace(/\s+/g, '').replace(/\.$/, ''); }

/* Map repère → nombre d'occurrences (> 1 seulement), objets non illustratifs des pages de type `plan`. */
export function doublonsReperes(projet) {
  const n = new Map();
  for (const plan of (projet && projet.plans) || []) {
    if (estPageReportage(plan)) continue;
    for (const o of plan.objets || []) {
      if (o.illustratif || !TYPES_RESEAU.includes(o.type)) continue;
      const r = normaliserRepere(o.repere);
      if (r) n.set(r, (n.get(r) || 0) + 1);
    }
  }
  for (const [k, v] of [...n]) if (v < 2) n.delete(k);
  return n;
}

export function texteDoublon(repere, n) {
  return R().doublon.replace('{repere}', repere).replace('{n}', String(n));
}
