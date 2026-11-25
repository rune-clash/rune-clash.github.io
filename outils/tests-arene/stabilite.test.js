/* Stabilité à 10 combattants (phase 4).  Lancer : node --expose-gc outils/tests-arene/stabilite.test.js
 * A. Moteur : 40 parties de 10 bots — temps de calcul par pas (moyenne, 99e centile, pire), nombre maximal
 *    d'entités, mémoire avant/après (aucune croissance continue).
 * B. Réseau : 10 vrais joueurs (base en mémoire, même API que Firebase) ; deux invités se coupent en
 *    pleine partie : l'hôte continue, les 7 autres invités reçoivent toujours l'état et la fin.
 * C. Réseau : l'hôte se coupe : chaque invité termine la partie (« interrompue ») au bout de COUPURE_S. */
global.window = global; global.navigator = { onLine: true };
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'), vm = require('vm');
const D = require('path').join(__dirname, '../../arene/') + '/';
['config.js', 'moteur.js', 'reseau.js'].forEach(f => vm.runInThisContext(fs.readFileSync(D + f, 'utf8')));
const C = window.ARENE_CONFIG, M = window.ARENE_MOTEUR, RS = window.ARENE_RESEAU;
let echecs = 0, ok = 0;
const verifier = (c, m) => { if (c) ok++; else { echecs++; console.log('  ÉCHEC :', m); } };
const gc = () => { if (global.gc) global.gc(); };

/* ---------- A. moteur ---------- */
(function moteur() {
  const DT = 1 / 30, pas = [];
  let maxEnt = 0, maxEv = 0;
  gc(); const tas0 = process.memoryUsage().heapUsed;
  for (let g = 1; g <= 40; g++) {
    const parts = C.PERSONNAGES.map((p, i) => ({ nom: 'B' + i, perso: p.id, humain: false, niveau: [0, 300, 1000, 5000][g % 4] }));
    const S = M.creerSimulation({ graine: g * 104729, participants: parts, mode: 'runes' });
    let n = 0;
    while (!S.fini && n < 9000) {
      const t0 = performance.now(); S.pas(DT, {}); pas.push(performance.now() - t0);
      maxEnt = Math.max(maxEnt, S.p.length + S.z.length + S.runes.length); maxEv = Math.max(maxEv, S.ev.length);
      S.ev.length = 0; n++;
    }
    verifier(S.fini, 'partie ' + g + ' non terminée');
    const places = S.f.map(f => f.place).sort((a, b) => a - b).join(',');
    verifier(places === '1,2,3,4,5,6,7,8,9,10', 'places partie ' + g + ' : ' + places);
    verifier(S.f.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && f.hp <= f.hpMax + 1e-6), 'positions ou PV invalides partie ' + g);
  }
  gc(); const tas1 = process.memoryUsage().heapUsed;
  pas.sort((a, b) => a - b);
  const moy = pas.reduce((a, b) => a + b, 0) / pas.length, p99 = pas[Math.floor(pas.length * 0.99)], pire = pas[pas.length - 1];
  console.log(`A. moteur : ${pas.length} pas · moyenne ${moy.toFixed(3)} ms · 99e centile ${p99.toFixed(3)} ms · pire ${pire.toFixed(1)} ms · entités max ${maxEnt} · événements max/pas ${maxEv}`);
  console.log(`   mémoire : ${(tas0 / 1e6).toFixed(1)} Mo → ${(tas1 / 1e6).toFixed(1)} Mo après 40 parties`);
  verifier(p99 < 4, '99e centile du pas trop lent (' + p99.toFixed(2) + ' ms, budget 4 ms sur 33 ms)');
  verifier(maxEv <= 160, 'événements non bornés');
  verifier(!global.gc || tas1 - tas0 < 30e6, 'mémoire en hausse de ' + ((tas1 - tas0) / 1e6).toFixed(1) + ' Mo');
})();

/* ---------- base partagée en mémoire (même API que l'adaptateur Firebase du jeu), ~40 ms de latence ---------- */
function base() {
  const db = {}, ls = [];
  const parts = p => p.split('/').filter(Boolean);
  const get = p => parts(p).reduce((o, k) => o && o[k], db);
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const set = (p, v) => { const k = parts(p); let o = db; k.slice(0, -1).forEach(x => { o[x] = o[x] && typeof o[x] === 'object' ? o[x] : {}; o = o[x]; }); if (v == null) delete o[k[k.length - 1]]; else o[k[k.length - 1]] = clone(v); notifier(); };
  let attente = null;
  const notifier = () => { if (attente) return; attente = setTimeout(() => { attente = null; ls.forEach(l => { if (l.mort) return; const v = JSON.stringify(clone(get(l.p))); if (v !== l.last) { l.last = v; l.cb(JSON.parse(v)); } }); }, 40); };
  let n = 0;
  return {
    set: (p, v) => (set(p, v), Promise.resolve()), update: (p, o) => { Object.keys(o).forEach(k => set(p + '/' + k, o[k])); return Promise.resolve(); },
    remove: p => (set(p, null), Promise.resolve()), get: p => Promise.resolve(clone(get(p))), key: () => 'k' + (n++) + Math.random().toString(36).slice(2, 6),
    on: (p, cb) => { const l = { p, cb, last: undefined }; ls.push(l); setTimeout(() => { if (l.mort) return; l.last = JSON.stringify(clone(get(p))); cb(JSON.parse(l.last)); }, 10); return () => { l.mort = true; }; },
    top: (p, c, k) => { const o = get(p) || {}, out = {}; Object.keys(o).sort((a, b) => (o[b][c] || 0) - (o[a][c] || 0)).slice(0, k).forEach(x => out[x] = clone(o[x])); return Promise.resolve(out); },
    ts: () => Date.now(), onDisc: () => Promise.resolve(), ecoutes: () => ls.filter(l => !l.mort).length
  };
}
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function salle10(nomTest) {
  const A = base(), sessions = [], persos = C.PERSONNAGES.map(p => p.id);
  for (let i = 0; i < 10; i++) {
    global.NET = { ready: true, user: { uid: nomTest + 'u' + i }, me: { pseudo: 'J' + i }, db: () => A };
    RS.chercher({ moi: { nom: 'J' + i, perso: persos[i], trophees: 100 + i, cadre: 'base' }, onMaj: () => {}, onPret: s => { sessions[i] = s; s.demarrer && s.demarrer(); } });
    await attendre(60);
  }
  for (let k = 0; k < 400 && sessions.filter(Boolean).length < 10; k++) await attendre(100);
  return { A, sessions };
}

(async () => {
  /* ---------- B. deux invités se coupent ---------- */
  {
    const { A, sessions } = await salle10('b');
    const prets = sessions.filter(Boolean);
    verifier(prets.length === 10, '10 sessions prêtes (obtenu ' + prets.length + ')');
    const hote = prets.find(s => s.role === 'hote'), inv = prets.filter(s => s.role === 'invite');
    verifier(!!hote && inv.length === 9, '1 hôte et 9 invités');
    verifier(hote && hote.participants.filter(p => p.humain).length === 10, '10 humains dans la partie');
    const coupes = inv.slice(0, 2), restants = inv.slice(2);
    let tick = setInterval(() => inv.forEach(s => !coupes.includes(s) || !s.__coupe ? s.maj(1 / 30) : 0), 33);
    await attendre(2500);
    const t0 = restants.map(s => s.vue.t);
    coupes.forEach(s => { s.__coupe = true; s.arreter ? s.arreter() : s.quitter(); });
    await attendre(3000);
    verifier(restants.every((s, i) => s.vue.t > t0[i] + 2), 'les invités restants reçoivent encore l\'état après la coupure');
    verifier(hote.sim.f.length === 10 && !hote.sim.fini, 'l\'hôte continue la partie');
    let fins = 0, interrompues = 0;
    restants.forEach(s => s.onFin(r => { fins++; if (r.interrompue) interrompues++; }));
    hote.finirVite();
    await attendre(2500);
    console.log(`B. 10 joueurs, 2 invités coupés : fins reçues ${fins}/7 · interrompues ${interrompues} · écoutes actives ${A.ecoutes()}`);
    verifier(fins === 7 && interrompues === 0, 'les 7 invités restants reçoivent la fin normale');
    clearInterval(tick);
    [hote].concat(inv).forEach(s => s.arreter && s.arreter());
  }
  /* ---------- C. l'hôte se coupe ---------- */
  {
    const { sessions } = await salle10('c');
    const prets = sessions.filter(Boolean), hote = prets.find(s => s.role === 'hote'), inv = prets.filter(s => s.role === 'invite');
    let fins = 0, interrompues = 0;
    inv.forEach(s => s.onFin(r => { fins++; if (r.interrompue) interrompues++; }));
    let tick = setInterval(() => inv.forEach(s => s.maj(1 / 30)), 33);
    await attendre(2000);
    hote.arreter ? hote.arreter() : null;
    await attendre((C.MATCHMAKING.COUPURE_S + 2) * 1000);
    console.log(`C. hôte coupé : ${fins}/${inv.length} invités ont terminé (interrompue : ${interrompues})`);
    verifier(fins === inv.length && interrompues === inv.length, 'chaque invité termine la partie interrompue');
    clearInterval(tick);
    inv.forEach(s => s.arreter && s.arreter());
  }
  console.log(`\n${ok} vérifications réussies, ${echecs} échecs`);
  process.exit(echecs ? 1 : 0);
})();
