/* Lancer : node outils/tests-arene/moteur.test.js — Tests Phase 1 : anti-spam, combos, élan, Ki, faisceaux, esquive, invariants, bots */
global.window = global;
const fs = require('fs'), vm = require('vm');
const D = require('path').join(__dirname, '../../arene/') + '/';
vm.runInThisContext(fs.readFileSync(D + 'config.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(D + 'moteur.js', 'utf8'));
const M = window.ARENE_MOTEUR, C = window.ARENE_CONFIG, R = C.REGLES;
let ok = 0, ko = 0;
const verif = (cond, nom, info) => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info !== undefined ? JSON.stringify(info) : ''); } };
const DT = 1 / 30;

/* une partie « labo » : tous humains et immobiles sauf ce qu'on commande */
function labo(persos, graine) {
  const parts = Array.from({ length: 10 }, (_, i) => ({ nom: 'H' + i, perso: persos[i] || 'bram', humain: true }));
  const S = M.creerSimulation({ graine: graine || 4242, participants: parts });
  S.zone.r = 999;
  return S;
}
/* place deux combattants face à face dans un endroit dégagé, les autres loin */
function placer(S, a, b, dist) {
  const c = S.carte;
  for (let y = -15; y <= 15; y += 0.5) for (let x = -15; x <= 15; x += 0.5) {
    if (M.dansObstacle(c, x, y, 1.2) || M.dansObstacle(c, x + dist, y, 1.2) || M.segmentBloque(c, x, y, x + dist, y)) continue;
    if (S.steles.some(s => Math.hypot(s.x - x, s.y - y) < 2.5 || Math.hypot(s.x - x - dist, s.y - y) < 2.5)) continue;
    S.f[a].x = x; S.f[a].y = y; S.f[b].x = x + dist; S.f[b].y = y;
    S.f.forEach((f, i) => { if (i !== a && i !== b) { f.x = 20 + (i % 3); f.y = -20 + i; } });
    return true;
  }
  return false;
}
function avancer(S, s, entree) { S.pas(DT, entree || {}); const e = S.ev.splice(0); return e; }
function presser(S, slot, act, a, d) { return S.pas(DT, { [slot]: { appuis: [{ act, a: a || 0, d }] } }), S.ev.splice(0); }

/* 1. Anti-spam : 10 pressions frénétiques → 3 attaques au maximum, le reste refusé */
{
  const S = labo(['rin']); placer(S, 0, 1, 3);
  const evs = [];
  for (let i = 0; i < 40; i++) evs.push(...S.pas(DT, { 0: { appuis: i % 1 === 0 ? [{ act: 'A', a: 0 }] : [] } }) || [], ...S.ev.splice(0));
  const atk = evs.filter(e => e.k === 'atk' && e.s === 0).length, refus = evs.filter(e => e.k === 'refus' && e.s === 0).length;
  verif(atk <= 3, 'spam : 3 attaques max', atk);
  verif(atk === 3, 'spam : les 3 charges sont bien utilisées', atk);
  verif(refus >= 30, 'spam : pressions excédentaires refusées', refus);
  verif(S.f[0].charges >= 0 && S.f[0].charges < 1, 'spam : charges épuisées sans passer sous 0', S.f[0].charges);
  verif(evs.some(e => e.k === 'refus' && e.r === 'vide') && evs.some(e => e.k === 'refus' && e.r === 'spam'), 'spam : raisons vide et spam signalées');
  /* recharge : une charge revient après « rechargement » secondes (+ pause) */
  let charge = false;
  for (let i = 0; i < Math.ceil((C.PERSONNAGES[0].rechargement + R.CHARGES.PAUSE_RECHARGE_S + 0.2) / DT); i++) { S.pas(DT, {}); if (S.ev.splice(0).some(e => e.k === 'charge' && e.s === 0)) charge = true; }
  verif(charge && S.f[0].charges >= 1, 'recharge : une charge revient avec un événement', S.f[0].charges);
}

/* 2. Combo complet au bon rythme : étapes 1 → 2 → 3, coup final */
function combo(perso, rythme) {
  const S = labo([perso]); placer(S, 0, 1, 2);
  const f = S.f[0], etapes = [];
  let evs = presser(S, 0, 'A', 0);
  etapes.push(...evs.filter(e => e.k === 'atk' && e.s === 0).map(e => e.e));
  for (let n = 0; n < 200 && etapes.length < 3; n++) {
    let ap = [];
    if (f.etat === 'attaque' && f.att && f.att.t >= f.att.prep + f.att.recup * R.COMBO.OUVERTURE_RECUP + rythme && !f.tampon) ap = [{ act: 'A', a: 0 }];
    if (f.etat === 'libre' && f.combo && rythme > 0.4 && !f.tampon) ap = [{ act: 'A', a: 0 }];
    S.pas(DT, { 0: { appuis: ap } });
    etapes.push(...S.ev.splice(0).filter(e => e.k === 'atk' && e.s === 0).map(e => e.e));
  }
  return { etapes, S };
}
for (const p of C.PERSONNAGES) {
  const r = combo(p.id, 0.02);
  verif(r.etapes.join(',') === '1,2,3', `combo ${p.id} : 1→2→3`, r.etapes);
}
{
  /* le coup final touche → bonus de Ki */
  const S = labo(['bram', 'rin']); placer(S, 0, 1, 1.6);
  const f = S.f[0], x1 = S.f[1].x;
  let finals = 0;
  S.pas(DT, { 0: { appuis: [{ act: 'A', a: 0 }] } });
  for (let n = 0; n < 120; n++) {
    const ap = f.etat === 'attaque' && f.att && f.att.etape < 3 && f.att.t >= f.att.prep + f.att.recup * 0.6 && !f.tampon ? [{ act: 'A', a: 0 }] : [];
    S.pas(DT, { 0: { appuis: ap } });
    finals += S.ev.splice(0).filter(e => e.k === 'hit' && e.o === 0 && e.fin).length;
  }
  verif(finals >= 1 && S.stats.finals >= 1, 'combo : le coup final touche et donne du Ki', { finals, st: S.stats.finals });
  verif(Math.abs(S.f[1].x - x1) > 2, 'combo : propriétés du final (la coulée repousse)', S.f[1].x - x1);
}

/* 3. Pendant le coup final, une pression trop tôt est refusée ; après la fenêtre, le combo repart à 1 */
{
  const r = combo('tsuchi', 0.02), S = r.S, f = S.f[0];
  verif(f.etat === 'attaque' && f.att.etape === 3, 'fenêtre : coup final en cours', f.att && f.att.etape);
  f.charges = 3;
  for (let i = 0; i < 4; i++) S.pas(DT, {});   /* au-delà de l'intervalle anti-spam, mais bien avant la fin du coup final */
  S.ev.splice(0);
  const evs = presser(S, 0, 'A', 0);
  verif(evs.some(e => e.k === 'refus' && e.r === 'tot'), 'fenêtre : trop tôt (pendant le final) = refusé', evs.filter(e => e.k === 'refus'));
  for (let i = 0; i < 40; i++) S.pas(DT, {});
  S.ev.splice(0);
  const e2 = presser(S, 0, 'A', 0);
  for (let i = 0; i < 3; i++) { S.pas(DT, {}); e2.push(...S.ev.splice(0)); }
  const atk = e2.filter(e => e.k === 'atk' && e.s === 0).map(e => e.e);
  verif(atk[0] === 1, 'fenêtre : après la fermeture, le combo repart à 1', atk);
}

/* 4. Esquive puis Attaque = attaque d'élan ; invulnérabilité pendant l'esquive */
{
  const S = labo(['rin', 'hikari']); placer(S, 0, 1, 4);
  const f = S.f[0];
  presser(S, 0, 'E', 0);
  verif(f.etat === 'esquive' && f.invul > 0, 'esquive : état et invulnérabilité', f.etat);
  const evs = [];
  for (let i = 0; i < 12; i++) { S.pas(DT, { 0: { appuis: f.etat === 'esquive' && f.esq.t > 0.12 && !f.tampon && !evs.some(e => e.k === 'atk') ? [{ act: 'A', a: 0 }] : [] } }); evs.push(...S.ev.splice(0)); }
  verif(evs.some(e => e.k === 'atk' && e.s === 0 && e.el === 1), "élan : Esquive puis Attaque = attaque d'élan", evs.filter(e => e.k === 'atk'));
  const e3 = presser(S, 0, 'E', 0);
  verif(e3.some(e => e.k === 'refus' && e.r === 'esquive'), 'esquive : recharge respectée');
  /* tir sur un combattant qui esquive : évité */
  const S2 = labo(['hikari', 'rin']); placer(S2, 0, 1, 6);
  presser(S2, 0, 'A', 0);
  let evite = false;
  for (let i = 0; i < 20; i++) { const ap = i === 2 ? [{ act: 'E', a: Math.PI }] : []; S2.pas(DT, { 1: { appuis: ap } }); if (S2.ev.splice(0).some(e => e.k === 'evite' && e.s === 1)) evite = true; }
  verif(evite || S2.f[1].hp === S2.f[1].hpMax, "esquive : le tir pendant l'invulnérabilité est évité");
}

/* 5. Ki : refus si insuffisant, coût payé, réduction après combo, version amplifiée à 100 */
{
  const S = labo(['mizuha', 'bram']); placer(S, 0, 1, 4);
  const f = S.f[0];
  f.ki = 10;
  verif(presser(S, 0, 'S', 0).some(e => e.k === 'refus' && e.r === 'ki'), 'Ki : projection refusée sans assez de Ki');
  f.ki = 60;
  const e1 = []; e1.push(...presser(S, 0, 'S', 0));
  verif(f.etat === 'preparation', 'Ki : préparation (signalée aux autres)', f.etat);
  for (let i = 0; i < 12; i++) { S.pas(DT, {}); e1.push(...S.ev.splice(0)); }
  verif(e1.some(e => e.k === 'prep') && e1.some(e => e.k === 'super' && e.s === 0), 'Ki : projection lancée');
  verif(f.ki < 60 - 45 && f.ki > 0, 'Ki : coût payé', f.ki);
  verif(S.f[1].hp < S.f[1].hpMax, 'Ki : la vague touche', S.f[1].hp);
  /* après 2 étapes de combo : coût réduit */
  const S2 = labo(['mizuha', 'bram']); placer(S2, 0, 1, 3);
  const g = S2.f[0]; g.ki = 45;
  presser(S2, 0, 'A', 0);
  let lance = false;
  for (let i = 0; i < 80 && !lance; i++) {
    let ap = [];
    if (g.etat === 'attaque' && g.att.etape === 1 && g.att.t >= g.att.prep + g.att.recup * 0.6 && !g.tampon) ap = [{ act: 'A', a: 0 }];
    else if (g.etat === 'attaque' && g.att.etape === 2 && g.att.t >= g.att.prep + g.att.recup * 0.6 && !g.tampon) ap = [{ act: 'S', a: 0 }];
    S2.pas(DT, { 0: { appuis: ap } });
    if (S2.ev.splice(0).some(e => e.k === 'prep' && e.s === 0)) lance = true;
  }
  verif(lance, 'Ki : A·A → Spécial accepté avec un coût réduit (45 Ki < 50)');
  const S3 = labo(['seren', 'bram']); placer(S3, 0, 1, 3);
  S3.f[0].ki = 100;
  const e3 = presser(S3, 0, 'S', 0); for (let i = 0; i < 10; i++) { S3.pas(DT, {}); e3.push(...S3.ev.splice(0)); }
  verif(e3.some(e => e.k === 'super' && e.ampl === 1) && S3.f[0].ki < 5, 'Ki : projection amplifiée à 100 (tout le Ki consommé)', S3.f[0].ki);
}

/* 6. Faisceau : touche en ligne, arrêté par un mur, nettoyé à la fin */
{
  const S = labo(['hikari', 'bram']); placer(S, 0, 1, 7);
  const f = S.f[0]; f.ki = 60;
  presser(S, 0, 'S', 0, 7);
  let maxP = 0;
  for (let i = 0; i < 60; i++) { S.pas(DT, {}); maxP = Math.max(maxP, S.p.filter(p => p.k === 'faisceau').length); }
  verif(maxP === 1, 'faisceau : une entité pendant la canalisation', maxP);
  verif(S.p.filter(p => p.k === 'faisceau').length === 0 && f.etat === 'libre', 'faisceau : supprimé et lanceur libéré à la fin', f.etat);
  verif(S.f[1].hp < S.f[1].hpMax - 1500, 'faisceau : dégâts sur la cible en ligne', S.f[1].hp);
  /* derrière un mur */
  const S2 = labo(['hikari', 'bram']);
  const m = S2.carte.murs.find(w => w.w > 3 && Math.abs(w.x) < 15 && Math.abs(w.y) < 15) || S2.carte.murs[0];
  const g = S2.f[0], h = S2.f[1];
  g.x = m.x; g.y = m.y - m.h / 2 - 3; h.x = m.x; h.y = m.y + m.h / 2 + 1.5;
  S2.f.forEach((x, i) => { if (i > 1) { x.x = 22; x.y = -22 + i; } });
  g.ki = 60;
  presser(S2, 0, 'S', Math.PI / 2, 8);
  for (let i = 0; i < 50; i++) S2.pas(DT, {});
  verif(h.hp === h.hpMax, 'faisceau : arrêté par le mur', h.hp);
  const L = M.distanceLibre(S2.carte, g.x, g.y, Math.PI / 2, 12);
  verif(L < 3.6, 'distanceLibre : rayon coupé au mur', L);
}

/* 7. Étourdissement pendant une préparation : la projection est annulée et le Ki n'est pas payé */
{
  const S = labo(['raimei', 'bram']); placer(S, 0, 1, 1.5);
  const f = S.f[0], b = S.f[1]; f.ki = 60;
  presser(S, 0, 'S', 0);
  verif(f.etat === 'preparation', 'préparation lancée');
  /* Bram enchaîne : son coup d'élan étourdit (0,3 s) */
  b.finEsq = S.t; b.ang = Math.PI;
  S.pas(DT, { 1: { appuis: [{ act: 'A', a: Math.PI }] } });
  for (let i = 0; i < 6; i++) S.pas(DT, {});
  S.ev.length = 0;
  verif(f.etat === 'etourdi' || f.etourdi > 0 || f.ki === 60 || f.ki > 55, 'étourdi : projection annulée', { etat: f.etat, ki: f.ki });
  verif(f.ki > 55, "étourdi : Ki non payé quand la projection n'est pas partie", f.ki);
}

/* 8. Invariants sur des parties aléatoires (humains au hasard + bots) */
{
  const t0 = Date.now();
  let parties = 0, pasTotal = 0, bloques = 0, viol = [];
  const etats = new Set(M.ETATS);
  const st = { refus: 0, combos: 0, finals: 0, esquives: 0, evites: 0, specials: 0, amplifies: 0 };
  let maxP = 0;
  for (let g = 1; g <= 120; g++) {
    const parts = C.PERSONNAGES.map((p, i) => ({ nom: 'J' + i, perso: p.id, humain: i < 3, niveau: [0, 300, 1000, 5000][g % 4] }));
    const S = M.creerSimulation({ graine: g * 7717, participants: parts });
    let n = 0;
    while (!S.fini && n < 9000) {
      const ent = {};
      for (let i = 0; i < 3; i++) {
        const r = Math.random();
        ent[i] = { mx: Math.cos(g + n * 0.05 + i), my: Math.sin(g * 2 + n * 0.03), appuis: r < 0.25 ? [{ act: r < 0.15 ? 'A' : r < 0.2 ? 'E' : 'S', a: Math.random() * 6.28, d: Math.random() * 8 }] : [] };
      }
      S.pas(DT, ent); S.ev.length = 0; n++;
      maxP = Math.max(maxP, S.p.length + S.z.length);
      for (const f of S.f) {
        if (!etats.has(f.etat)) viol.push(['etat', f.etat]);
        if (!(f.charges >= 0 && f.charges <= R.CHARGES.MAX)) viol.push(['charges', f.charges]);
        if (!(f.ki >= 0 && f.ki <= R.KI.MAX)) viol.push(['ki', f.ki]);
        if (!isFinite(f.x) || !isFinite(f.y)) viol.push(['pos', f.x, f.y]);
        if (f.vivant && f.etat === 'ko') viol.push(['ko vivant']);
        if (!f.vivant && f.etat !== 'ko') viol.push(['mort non ko', f.etat]);
        if (f.vivant && f.etat !== 'libre' && f.etatT > 3) { bloques++; viol.push(['bloqué', f.etat, f.etatT.toFixed(2)]); }
      }
      if (viol.length > 5) break;
    }
    pasTotal += n; parties++;
    verif(S.fini, `partie ${g} terminée`, S.t);
    const places = S.f.map(f => f.place).sort((a, b) => a - b).join(',');
    verif(places === '1,2,3,4,5,6,7,8,9,10', `partie ${g} : classement complet`, places);
    for (const k in st) st[k] += S.stats[k];
    if (viol.length > 5) break;
  }
  verif(viol.length === 0, 'invariants de la machine à états', viol.slice(0, 5));
  verif(maxP < 400, 'pas de fuite : projectiles et zones bornés', maxP);
  console.log(`  ${parties} parties aléatoires, ${pasTotal} pas, ${Date.now() - t0} ms — stats cumulées`, JSON.stringify(st));
}

/* 9. Bots seuls : ils combinent, esquivent, utilisent le Ki et finissent la partie */
{
  const st = { refus: 0, combos: 0, finals: 0, esquives: 0, evites: 0, specials: 0, amplifies: 0 };
  const durees = [], kills = {};
  for (let g = 1; g <= 40; g++) {
    const parts = C.PERSONNAGES.map((p, i) => ({ nom: 'B' + i, perso: p.id, humain: false, niveau: [0, 300, 1000, 5000][g % 4] }));
    const S = M.creerSimulation({ graine: g * 7919, participants: parts });
    while (!S.fini) { S.pas(DT, null); S.ev.length = 0; }
    durees.push(S.t);
    for (const k in st) st[k] += S.stats[k];
    S.f.forEach(f => kills[f.perso] = (kills[f.perso] || 0) + f.kills);
  }
  verif(st.combos > 200 && st.finals > 50, 'bots : combos complets exécutés', st);
  verif(st.esquives > 100, 'bots : esquives', st.esquives);
  verif(st.specials > 100, 'bots : projections de Ki', st.specials);
  verif(st.refus < st.combos, 'bots : peu de pressions refusées (pas de spam)', st.refus);
  console.log('  bots : durée moyenne', (durees.reduce((a, b) => a + b) / durees.length).toFixed(1), 's — stats', JSON.stringify(st));
  console.log('  éliminations par personnage', JSON.stringify(kills));
}
console.log(`\n${ok} vérifications réussies, ${ko} échecs`);
process.exit(ko ? 1 : 0);
