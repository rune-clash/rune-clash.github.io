/*
 * Rune Clash — Runes des Trophées : AFFICHAGE ET COMMANDES
 * ========================================================
 * ARENE_RENDU.creer(canvas, opts)      dessine une « vue » de partie (locale, hôte ou invité) en 2D vue de dessus.
 * ARENE_COMMANDES.creer(couche, opts)  joystick tactile, boutons Attaque / Esquive / Spécial, clavier + souris, manette.
 *
 * La vue attendue : { t, carte, zone:{cx,cy,r}, f:[combattants], p:[projectiles], z:[zones], runes:[], steles:[] }
 * (la simulation du moteur a déjà cette forme ; l'invité en reconstruit une à partir des états reçus).
 */
(function () {
  'use strict';
  const CFG = window.ARENE_CONFIG, M = window.ARENE_MOTEUR;
  const TAU = Math.PI * 2, hyp = Math.hypot;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const PERSO = M.PERSO;

  function rgba(hex, a) {
    const h = String(hex || '#88aaff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  /* ================================================================== */
  /* AFFICHAGE                                                          */
  /* ================================================================== */
  function creer(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const couleur = id => (opts.couleur && opts.couleur(id)) || '#7cc4ff';
    let W = 1, H = 1, dpr = 1, ech = 30;
    const cam = { x: 0, y: 0, ok: false, secousse: 0 };
    let sol = null, solCarte = null, solEch = 0;
    const parts = [], nombres = [], anneaux = [], arcs = [];
    const jetons = new Map();

    function redim() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      /* on voit environ 22 m sur la grande dimension et 13 m sur la petite */
      ech = Math.min(Math.max(W, H) / 22, Math.min(W, H) / 12.5);
    }
    const versEcran = (x, y) => [(x - cam.x) * ech + W / 2, (y - cam.y) * ech + H / 2];
    const versMonde = (sx, sy) => [(sx - W / 2) / ech + cam.x, (sy - H / 2) / ech + cam.y];

    /* ---------- thèmes d'environnement (un par carte, tiré de la graine) ---------- */
    const THEMES = {
      feu:    { sol: ['#2b1712', '#1e0f0c', '#120806'], dalle: [255, 150, 100], joint: 'rgba(255,120,70,.08)', mur: ['#6b3326', '#47201a', '#2a120e'], arete: 'rgba(255,170,120,.55)', pilier: ['#8a4632', '#4a2219'], lueur: '#ff8a3d', cache: ['#ffb070', '#a33a1c', '#5a1a0c'], detail: 'lave' },
      eau:    { sol: ['#11263c', '#0b1b2d', '#071120'], dalle: [110, 180, 255], joint: 'rgba(120,190,255,.07)', mur: ['#2c5272', '#1d3a54', '#112437'], arete: 'rgba(150,215,255,.55)', pilier: ['#3a6a8e', '#1a3550'], lueur: '#5fd0ff', cache: ['#9ff0ff', '#1f7aa0', '#0c3a52'], detail: 'flaques' },
      foudre: { sol: ['#1d1a3a', '#141029', '#0b0819'], dalle: [170, 150, 255], joint: 'rgba(180,160,255,.07)', mur: ['#3f3a78', '#2a2552', '#191533'], arete: 'rgba(210,190,255,.55)', pilier: ['#5a4fa0', '#2a2458'], lueur: '#c9a6ff', cache: ['#e4d2ff', '#6a4ac0', '#2e1d66'], detail: 'eclats' },
      terre:  { sol: ['#202515', '#161b0f', '#0d1009'], dalle: [170, 200, 120], joint: 'rgba(190,220,140,.07)', mur: ['#5a5236', '#3c3623', '#241f14'], arete: 'rgba(230,215,160,.5)', pilier: ['#6e6440', '#36301c'], lueur: '#b6e07a', cache: ['#c6f08a', '#3f7a2a', '#1c3a12'], detail: 'herbe' },
      ombre:  { sol: ['#1b1531', '#120e22', '#0a0714'], dalle: [160, 130, 255], joint: 'rgba(170,140,255,.07)', mur: ['#3d3270', '#29214d', '#171230'], arete: 'rgba(200,170,255,.55)', pilier: ['#4c3f8c', '#241d4a'], lueur: '#a98aff', cache: ['#d3b6ff', '#5a34a8', '#25134f'], detail: 'runes' },
      prisme: { sol: ['#1c2547', '#131a35', '#0b1024'], dalle: [130, 150, 255], joint: 'rgba(120,150,255,.07)', mur: ['#3d4a82', '#2c3765', '#1a2142'], arete: 'rgba(160,190,255,.6)', pilier: ['#5a68a8', '#2a3366'], lueur: '#ffb0ea', cache: ['#ffc6f0', '#6a4ad0', '#2a1a66'], detail: 'cristaux' }
    };
    let TH = THEMES.prisme;
    const sprites = new Map();          /* fourrés pré-dessinés */
    const flashs = new Map();           /* éclair blanc bref sur un élément touché */
    const traces = [];                  /* brûlures au sol (explosions), estompées */
    const gravats = [];                 /* débris laissés par un élément détruit */

    /* ---------- sol pré-dessiné une fois par partie ---------- */
    function preparerSol(carte) {
      TH = THEMES[carte.theme] || THEMES.prisme;
      sprites.clear(); traces.length = 0; gravats.length = 0; flashs.clear();
      const E = 26, T = carte.taille, D = Math.round(T * E), c = document.createElement('canvas');
      c.width = c.height = D;
      const g = c.getContext('2d'), rnd = M.alea(carte.graine ^ 0x51ed), [dr, dg, db] = TH.dalle;
      const gr = g.createRadialGradient(D / 2, D / 2, D * 0.05, D / 2, D / 2, D * 0.72);
      gr.addColorStop(0, TH.sol[0]); gr.addColorStop(0.6, TH.sol[1]); gr.addColorStop(1, TH.sol[2]);
      g.fillStyle = gr; g.fillRect(0, 0, D, D);
      /* dalles de 2 m biseautées (lumière en haut à gauche) */
      for (let i = 0; i < T; i += 2) for (let j = 0; j < T; j += 2) {
        const x = i * E, y = j * E, s2 = 2 * E, v = rnd();
        g.fillStyle = `rgba(${dr},${dg},${db},${0.015 + v * 0.045})`; g.fillRect(x + 2, y + 2, s2 - 4, s2 - 4);
        g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(x + 2, y + 2, s2 - 4, 2); g.fillRect(x + 2, y + 2, 2, s2 - 4);
        g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 2, y + s2 - 4, s2 - 4, 2); g.fillRect(x + s2 - 4, y + 2, 2, s2 - 4);
        if (v > 0.86) { /* dalle fendue */
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; g.beginPath(); let cx = x + rnd() * s2, cy = y + 3; g.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) { cx += (rnd() - 0.5) * 18; cy += s2 / 4; g.lineTo(cx, Math.min(y + s2 - 3, cy)); } g.stroke();
        }
      }
      g.strokeStyle = TH.joint; g.lineWidth = 1;
      for (let i = 0; i <= T; i += 2) { g.beginPath(); g.moveTo(i * E, 0); g.lineTo(i * E, D); g.stroke(); g.beginPath(); g.moveTo(0, i * E); g.lineTo(D, i * E); g.stroke(); }
      /* détails propres au thème */
      for (let i = 0; i < 60; i++) {
        const x = rnd() * D, y = rnd() * D;
        if (TH.detail === 'lave') {
          g.strokeStyle = `rgba(255,${100 + rnd() * 80 | 0},40,${0.25 + rnd() * 0.25})`; g.lineWidth = 1.5 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y);
          let cx = x, cy = y; for (let k = 0; k < 4; k++) { cx += (rnd() - 0.5) * 40; cy += (rnd() - 0.5) * 40; g.lineTo(cx, cy); } g.stroke();
        } else if (TH.detail === 'flaques') {
          const r = 8 + rnd() * 22; g.fillStyle = 'rgba(110,190,255,.08)'; g.beginPath(); g.ellipse(x, y, r * 1.6, r, rnd() * 3, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(190,235,255,.10)'; g.lineWidth = 1; g.stroke();
        } else if (TH.detail === 'herbe') {
          g.strokeStyle = `rgba(150,${190 + rnd() * 50 | 0},90,${0.18 + rnd() * 0.2})`; g.lineWidth = 1.3;
          for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2; g.beginPath(); g.moveTo(x + k * 2, y); g.lineTo(x + k * 2 + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke(); }
        } else if (TH.detail === 'runes') {
          g.strokeStyle = 'rgba(170,140,255,.12)'; g.lineWidth = 1.5; const r = 6 + rnd() * 10; g.beginPath(); g.arc(x, y, r, 0, TAU); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
        } else {
          const c2 = TH.detail === 'eclats' ? 'rgba(210,190,255,' : 'rgba(255,190,240,'; g.fillStyle = c2 + (0.12 + rnd() * 0.15) + ')';
          g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.fill();
        }
      }
      /* cercle central et points de départ */
      g.strokeStyle = 'rgba(255,210,120,.13)'; g.lineWidth = 3;
      g.beginPath(); g.arc(D / 2, D / 2, 3.2 * E, 0, TAU); g.stroke();
      g.beginPath(); g.arc(D / 2, D / 2, 4.1 * E, 0, TAU); g.stroke();
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(D / 2 + Math.cos(a) * 3.2 * E, D / 2 + Math.sin(a) * 3.2 * E); g.lineTo(D / 2 + Math.cos(a) * 4.1 * E, D / 2 + Math.sin(a) * 4.1 * E); g.stroke(); }
      carte.depart.forEach(d => { g.strokeStyle = 'rgba(120,200,255,.10)'; g.lineWidth = 2; g.beginPath(); g.arc((d.x + T / 2) * E, (d.y + T / 2) * E, 0.9 * E, 0, TAU); g.stroke(); });
      g.strokeStyle = TH.arete; g.lineWidth = 6; g.strokeRect(3, 3, D - 6, D - 6);
      sol = c; solCarte = carte; solEch = E;
    }

    /* ---------- jeton d'un combattant (portrait + contour), mis en cache ---------- */
    function jeton(perso, cadre, rpx) {
      const cle = perso + '|' + cadre + '|' + Math.round(rpx);
      const img = opts.portrait && opts.portrait(perso);
      const prete = img && img.complete && img.naturalWidth > 0;
      const k2 = cle + (prete ? '|i' : '|x');
      if (jetons.has(k2)) return jetons.get(k2);
      const s = Math.ceil(rpx * 2 + 10), c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d'), m = s / 2, el = couleur(perso);
      g.save(); g.beginPath(); g.arc(m, m, rpx, 0, TAU); g.closePath(); g.clip();
      const bg = g.createRadialGradient(m, m - rpx * 0.3, 1, m, m, rpx);
      bg.addColorStop(0, rgba(el, 0.9)); bg.addColorStop(1, '#0a0d1c');
      g.fillStyle = bg; g.fillRect(0, 0, s, s);
      if (prete) {
        /* les vignettes du jeu font 160 × 200 : on cadre le visage */
        const iw = img.naturalWidth, ih = img.naturalHeight, cw = iw * 0.74, sx = (iw - cw) / 2, sy = ih * 0.04;
        g.drawImage(img, sx, sy, cw, cw, m - rpx, m - rpx, rpx * 2, rpx * 2);
      } else {
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(rpx)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText((PERSO[perso] ? perso : '?').slice(0, 1).toUpperCase(), m, m + 1);
      }
      g.restore();
      const cc = (CFG.CADRES[cadre] || CFG.CADRES.base).couleur;
      g.lineWidth = Math.max(2.5, rpx * 0.16);
      if (cc === 'arc') {
        const gr = g.createConicGradient ? g.createConicGradient(0, m, m) : null;
        if (gr) { ['#ff6ad5', '#ffd166', '#6af0ff', '#9b7bff', '#ff6ad5'].forEach((c2, i) => gr.addColorStop(i / 4, c2)); g.strokeStyle = gr; } else g.strokeStyle = '#d6b4ff';
      } else g.strokeStyle = cadre === 'base' ? el : cc;
      g.beginPath(); g.arc(m, m, rpx, 0, TAU); g.stroke();
      if (cadre !== 'base') { g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(m, m, rpx + g.lineWidth * 2, 0, TAU); g.stroke(); }
      if (prete || !img) jetons.set(k2, c);
      return c;
    }

    /* ---------- effets ---------- */
    function etincelles(x, y, c, n, v, vie) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = (0.3 + Math.random()) * (v || 5);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vie: (vie || 0.45) * (0.6 + Math.random() * 0.6), max: vie || 0.45, c, t: 0.07 + Math.random() * 0.08 });
      }
    }
    function anneau(x, y, r, c, duree, epais) { anneaux.push({ x, y, r, c, vie: duree || 0.45, max: duree || 0.45, e: epais || 4 }); }
    function texte(x, y, txt, c, gros) { nombres.push({ x, y, txt, c, vie: gros ? 1.3 : 0.9, max: gros ? 1.3 : 0.9, gros: !!gros }); }

    /* Couleurs des projections selon l'identité du personnage (forme). */
    const FORME_C = {
      flamme: ['#fff1a8', '#ff8a2a'], magma: ['#ffd38a', '#ff4a1c'], onde: ['#ffd38a', '#ff6a2a'], lumiere: ['#ffffff', '#ffe27a'],
      vague: ['#e6fbff', '#38b6ff'], etoile: ['#fff6ff', '#ff8ad8'], abysse: ['#c8fff4', '#1fb39a'], fil: ['#f2dcff', '#9d5cff'],
      eclair: ['#f6eaff', '#b98cff'], roc: ['#f0d9b0', '#a0703a'], neant: ['#f0d4ff', '#7a2cc9']
    };
    const formeDe = (o, p) => (p && p.forme) || (o && PERSO[o.perso] && PERSO[o.perso].forme) || 'flamme';
    const fc = f => FORME_C[f] || FORME_C.flamme;
    const traine = [];

    function evenements(vue, liste, moi) {
      for (const e of liste) {
        const o = e.o != null && e.o >= 0 && vue.f[e.o], col = o ? couleur(o.perso) : '#ff6b8a';
        switch (e.k) {
          case 'hit':
            if (e.z) { if (e.s === moi && Math.random() < 0.5) etincelles(e.x, e.y, '#b06bff', 3, 2, 0.5); if (e.s === moi) cam.secousse = Math.max(cam.secousse, 0.12); break; }
            etincelles(e.x, e.y, fc(formeDe(o))[1], e.fin ? 16 : 7, e.fin ? 8 : 6, e.fin ? 0.5 : 0.35);
            if (e.fin) anneau(e.x, e.y, 1.1, fc(formeDe(o))[0], 0.3, 5);
            texte(e.x + (Math.random() - 0.5) * 0.4, e.y - 0.9, String(e.n), e.s === moi ? '#ff5a6e' : e.o === moi ? (e.fin ? '#ffd166' : '#ffffff') : 'rgba(255,255,255,.65)', e.o === moi || e.fin);
            if (e.s === moi) cam.secousse = Math.max(cam.secousse, e.fin ? 0.45 : 0.25);
            break;
          case 'ko': {
            const v = vue.f[e.s], c2 = v ? couleur(v.perso) : '#fff';
            etincelles(e.x, e.y, c2, 34, 8, 0.9); anneau(e.x, e.y, 2.4, c2, 0.6, 6);
            texte(e.x, e.y - 1.4, 'K.O.', '#ffd166', true);
            if (e.s === moi) cam.secousse = 0.8;
            break;
          }
          case 'rune': etincelles(e.x, e.y, '#ffd166', 10, 3.5, 0.5); if (e.s === moi) texte(e.x, e.y - 1, '+1 RUNE', '#ffd166', true); break;
          case 'casse': etincelles(e.x, e.y, '#8fd8ff', 22, 6, 0.7); anneau(e.x, e.y, 1.6, '#8fd8ff', 0.4, 4); break;
          case 'stele': etincelles(e.x, e.y, '#8fd8ff', 3, 3, 0.3); break;
          case 'cone': arcs.push({ x: e.x, y: e.y, a: e.a, p: e.p, l: Math.min(360, e.l) * Math.PI / 180, c: fc(e.f || formeDe(o))[1], c2: fc(e.f || formeDe(o))[0], vie: e.fin ? 0.3 : 0.22, max: e.fin ? 0.3 : 0.22, fin: e.fin }); break;
          case 'onde': case 'impact': traces.push({ x: e.x, y: e.y, r: e.r * 0.8, vie: 6 }); anneau(e.x, e.y, e.r, col, 0.5, 7); etincelles(e.x, e.y, col, 24, 7, 0.6); if (e.o === moi) cam.secousse = Math.max(cam.secousse, 0.35); break;
          case 'boum': { const c = fc(e.f || formeDe(o)); traces.push({ x: e.x, y: e.y, r: e.r * 0.9, vie: 6 }); anneau(e.x, e.y, e.r, c[1], 0.35, 5); etincelles(e.x, e.y, c[0], 14, 5, 0.45); if (e.f === 'eclair') eclairs.push({ x: e.x, y: e.y, vie: 0.18, max: 0.18, c: c[1] }); break; }
          case 'foudre': traces.push({ x: e.x, y: e.y, r: e.r, vie: 7 }); anneau(e.x, e.y, e.r, '#c9a6ff', 0.55, 8); etincelles(e.x, e.y, '#e7d4ff', 30, 9, 0.6); eclairs.push({ x: e.x, y: e.y, vie: 0.25, max: 0.25, c: '#d8c2ff', gros: true }); break;
          case 'attraction': anneau(e.x, e.y, e.r, col, 0.5, 5); anneau(e.x, e.y, e.r * 0.4, col, 0.5, 3); break;
          case 'super': {
            const v = vue.f[e.s];
            anneau(e.x, e.y, e.ampl ? 2.6 : 1.6, '#ffd166', e.ampl ? 0.6 : 0.4, e.ampl ? 8 : 5);
            if (v) etincelles(e.x, e.y, couleur(v.perso), e.ampl ? 30 : 16, 5, 0.5);
            if (e.ampl) texte(e.x, e.y - 1.6, 'MAX !', '#ffd166', true);
            break;
          }
          case 'soin': etincelles(e.x, e.y, '#5df0a0', 18, 3, 0.8); texte(e.x, e.y - 1.2, '+' + e.n, '#5df0a0', true); break;
          case 'mur': { const c = fc(e.f || formeDe(o)); etincelles(e.x, e.y, c[0], 5, 3, 0.25); etincelles(e.x, e.y, rgba(TH.mur[0], 0.9), 3, 2.5, 0.35); anneau(e.x, e.y, 0.35, c[1], 0.18, 2); break; }
          case 'victoire': { const v = vue.f[e.s]; if (v) for (let i = 0; i < 6; i++) anneau(v.x, v.y, 1 + i * 0.7, '#ffd166', 0.6 + i * 0.12, 3); break; }
          case 'esquive': { const v = vue.f[e.s]; if (v) traine.push({ x: e.x, y: e.y, a: e.a, perso: v.perso, cadre: v.cadre, vie: 0.35, max: 0.35, r: v.r || 0.55 }); break; }
          case 'evite': texte(e.x, e.y - 1.2, 'ESQUIVÉ', '#8fe9ff', e.s === moi); break;
          case 'atk': if (e.s === moi && e.e >= 2) texte(vue.f[moi].x, vue.f[moi].y - 1.9, e.e === 3 ? 'FINAL !' : 'COMBO ' + e.e, e.e === 3 ? '#ffd166' : '#ffe9b0', e.e === 3); break;
          case 'prep': { const v = vue.f[e.s]; if (v) anneau(v.x, v.y, 1.2, fc(formeDe(v))[1], 0.3, 3); break; }
          /* refus : signalé par le message et le tremblement du bouton (pas d'effet dans l'arène, pour rester lisible) */
          case 'decor': {
            const ob = vue.carte.parId && vue.carte.parId[e.id];
            if (ob) { flashs.set(ob.id, performance.now() + 120); if (e.r) etincelles(ob.x, ob.y, 'rgba(220,220,240,.8)', 2, 2, 0.2); }
            break;
          }
          case 'detruit': {
            const c1 = e.t === 'cachette' ? TH.cache : [TH.mur[0], TH.mur[1], TH.arete];
            const n = e.t === 'mur' ? Math.round((e.w * e.h) * 6) + 14 : 22;
            for (let i = 0; i < n; i++) {
              const ox = e.t === 'mur' ? (Math.random() - 0.5) * e.w : (Math.random() - 0.5) * (e.r || 1) * 1.6, oy = e.t === 'mur' ? (Math.random() - 0.5) * e.h : (Math.random() - 0.5) * (e.r || 1) * 1.6;
              const a = Math.random() * TAU, sp = 2 + Math.random() * 6;
              parts.push({ x: e.x + ox, y: e.y + oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vie: 0.5 + Math.random() * 0.5, max: 1, c: c1[i % 2], t: 0.12 + Math.random() * 0.12 });
            }
            anneau(e.x, e.y, (e.r || Math.max(e.w || 1, e.h || 1) / 2) + 0.8, '#e8e0ff', 0.45, 6);
            if (e.t !== 'cachette') {
              /* gravats au sol : la zone reste lisible, mais on voit qu'il y avait un mur */
              const pierres = [], nb = e.t === 'mur' ? Math.round(e.w * e.h * 3) + 6 : 8;
              for (let i = 0; i < nb; i++) pierres.push({ dx: (Math.random() - 0.5) * (e.w || e.r * 2), dy: (Math.random() - 0.5) * (e.h || e.r * 2), r: 0.08 + Math.random() * 0.16, a: Math.random() * 3, c: i % 3 ? 'rgba(0,0,0,.25)' : rgba(TH.mur[1], 0.8) });
              gravats.push({ x: e.x, y: e.y, pierres });
              if (gravats.length > 60) gravats.shift();
            }
            const mf = vue.f[moi];
            if (mf && hyp(mf.x - e.x, mf.y - e.y) < 6) cam.secousse = Math.max(cam.secousse, 0.3);
            texte(e.x, e.y - 0.8, e.t === 'cachette' ? 'FOURRÉ DÉTRUIT' : 'BRISÉ !', '#ffe3b0', false);
            break;
          }
          case 'embuscade': texte(e.x, e.y - 1.6, 'EMBUSCADE !', '#b6ffcf', true); anneau(e.x, e.y, 1.3, '#7dffb5', 0.35, 4); break;
        }
      }
    }
    const eclairs = [];

    /* ---------- dessin des éléments du décor ---------- */
    const HAUTEURS = { muret: 0.5, rempart: 0.95 };   /* hauteur apparente selon le type */
    function fissures(x, y, w, h, k, graine) {
      /* fissures qui apparaissent quand l'élément perd des PV */
      if (k > 0.66) return;
      const rnd = M.alea(graine * 7919 + 1), n = k > 0.33 ? 2 : 5;
      ctx.strokeStyle = 'rgba(10,6,12,.7)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < n; i++) {
        let cx = x + rnd() * w, cy = y + rnd() * h; ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let j = 0; j < 3; j++) { cx += (rnd() - 0.5) * Math.min(w, 30); cy += (rnd() - 0.5) * Math.min(h, 30); ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    }
    function flash(o) { const f = flashs.get(o.id); return f ? Math.max(0, f - performance.now()) / 120 : 0; }
    function mur(m, transparent) {
      const hz = HAUTEURS[m.type] || 0.62;
      const [x, y] = versEcran(m.x - m.w / 2, m.y - m.h / 2), w = m.w * ech, h = m.h * ech, z = hz * ech;
      ctx.save();
      if (transparent) ctx.globalAlpha = 0.42;
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(x + z * 0.45, y + z * 0.3, w, h);         /* ombre portée */
      /* face avant (sud) : appareillage de pierres */
      const gf = ctx.createLinearGradient(0, y + h - z, 0, y + h);
      gf.addColorStop(0, TH.mur[1]); gf.addColorStop(1, TH.mur[2]);
      ctx.fillStyle = gf; ctx.fillRect(x, y + h - z, w, z);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
      const rangs = Math.max(1, Math.round(hz * 3));
      for (let r = 1; r < rangs; r++) { const yy = y + h - z + z * r / rangs; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
      for (let r = 0; r < rangs; r++) for (let xx = x + ((r % 2) ? 14 : 0) + 4; xx < x + w; xx += 28) { ctx.beginPath(); ctx.moveTo(xx, y + h - z + z * r / rangs); ctx.lineTo(xx, y + h - z + z * (r + 1) / rangs); ctx.stroke(); }
      /* dessus */
      const gt = ctx.createLinearGradient(x, y - z, x + w, y + h - z);
      gt.addColorStop(0, TH.mur[0]); gt.addColorStop(1, TH.mur[1]);
      ctx.fillStyle = gt; ctx.fillRect(x, y - z, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x, y - z, w, Math.min(4, h));
      ctx.strokeStyle = TH.arete; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y - z + 0.75, w - 1.5, h - 1.5);
      if (m.type === 'rempart') {
        /* créneaux */
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        const long = m.w > m.h, n = Math.max(2, Math.round(Math.max(m.w, m.h) / 0.9));
        for (let i = 0; i < n; i += 2) long ? ctx.fillRect(x + w * i / n, y - z, w / n, Math.min(h, 6)) : ctx.fillRect(x, y - z + h * i / n, Math.min(w, 6), h / n);
      }
      /* runes lumineuses */
      ctx.fillStyle = rgba(TH.lueur, 0.35);
      const nr = Math.max(1, Math.round(Math.max(m.w, m.h) / 1.6));
      for (let i = 0; i < nr; i++) {
        const cx = m.w > m.h ? x + w * (i + 0.5) / nr : x + w / 2, cy = (m.w > m.h ? y + h / 2 : y + h * (i + 0.5) / nr) - z;
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 3, cy); ctx.fill();
      }
      fissures(x, y - z, w, h + z, m.pv / m.pvMax, m.id);
      const fl = flash(m);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${0.45 * fl})`; ctx.fillRect(x, y - z, w, h + z); }
      ctx.restore();
    }
    function pilier(o, transparent) {
      const [x, y] = versEcran(o.x, o.y), r = o.r * ech, z = 1.05 * ech;
      ctx.save();
      if (transparent) ctx.globalAlpha = 0.42;
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(x + z * 0.4, y + z * 0.25, r, r * 0.85, 0, 0, TAU); ctx.fill();
      /* fût du pilier (cylindre) */
      const gs = ctx.createLinearGradient(x - r, 0, x + r, 0);
      gs.addColorStop(0, TH.pilier[1]); gs.addColorStop(0.35, TH.pilier[0]); gs.addColorStop(1, TH.mur[2]);
      ctx.fillStyle = gs; ctx.fillRect(x - r, y - z, r * 2, z);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = rgba(TH.lueur, 0.5 + 0.2 * Math.sin(performance.now() / 400 + o.id)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y - z * 0.45, r, r * 0.5, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      /* chapiteau */
      const gt = ctx.createRadialGradient(x - r * 0.3, y - z - r * 0.2, 1, x, y - z, r * 1.1);
      gt.addColorStop(0, TH.mur[0]); gt.addColorStop(1, TH.pilier[1]);
      ctx.fillStyle = gt; ctx.beginPath(); ctx.ellipse(x, y - z, r * 1.08, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = TH.arete; ctx.lineWidth = 1.2; ctx.stroke();
      fissures(x - r, y - z, r * 2, z, o.pv / o.pvMax, o.id);
      const fl = flash(o);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${0.45 * fl})`; ctx.fillRect(x - r, y - z - r * 0.5, r * 2, z + r); }
      ctx.restore();
    }
    /* fourré de cristal : sprite pré-dessiné (brins lumineux), balancé légèrement */
    function spriteCachette(b) {
      const cle = b.id + '|' + Math.round(b.r * ech);
      if (sprites.has(cle)) return sprites.get(cle);
      const R0 = b.r * ech, s2 = Math.ceil(R0 * 2.4), c = document.createElement('canvas');
      c.width = c.height = s2;
      const g = c.getContext('2d'), m = s2 / 2, rnd = M.alea(b.id * 104729 + 3);
      const halo = g.createRadialGradient(m, m, R0 * 0.2, m, m, R0 * 1.05);
      halo.addColorStop(0, rgba(TH.cache[2], 0.85)); halo.addColorStop(1, rgba(TH.cache[2], 0));
      g.fillStyle = halo; g.beginPath(); g.arc(m, m, R0 * 1.05, 0, TAU); g.fill();
      const nb = Math.round(R0 * R0 / 9) + 30;
      for (let i = 0; i < nb; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * R0 * 0.95, x = m + Math.cos(a) * d, y = m + Math.sin(a) * d * 0.85;
        const L = 8 + rnd() * R0 * 0.35, inc = (rnd() - 0.5) * 0.9;
        const gb = g.createLinearGradient(x, y, x + Math.sin(inc) * L, y - Math.cos(inc) * L);
        gb.addColorStop(0, rgba(TH.cache[2], 0.95)); gb.addColorStop(0.6, rgba(TH.cache[1], 0.95)); gb.addColorStop(1, rgba(TH.cache[0], 0.95));
        g.strokeStyle = gb; g.lineWidth = 2 + rnd() * 2.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(inc) * L * 0.4, y - L * 0.6, x + Math.sin(inc) * L, y - Math.cos(inc) * L); g.stroke();
      }
      sprites.set(cle, c);
      return c;
    }
    function cachette(b, t, dedans) {
      const [x, y] = versEcran(b.x, b.y), sp = spriteCachette(b), k = b.pv / b.pvMax;
      ctx.save();
      ctx.globalAlpha = (dedans ? 0.5 : 0.92) * (0.55 + 0.45 * k);
      ctx.translate(x, y + b.r * ech * 0.1); ctx.transform(1, 0, Math.sin(t * 1.3 + b.id) * 0.03, 1, 0, 0);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
      ctx.restore();
      const fl = flash(b);
      if (fl > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(TH.cache[0], 0.35 * fl); ctx.beginPath(); ctx.arc(x, y, b.r * ech, 0, TAU); ctx.fill(); ctx.restore(); }
      if (dedans) { ctx.save(); ctx.strokeStyle = rgba(TH.cache[0], 0.6); ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, b.r * ech, 0, TAU); ctx.stroke(); ctx.restore(); }
    }
    function stele(s, t) {
      const [x, y] = versEcran(s.x, s.y), r = M.RAYON_STELE * ech, z = 1.1 * ech;
      const k = s.hp / (s.hpMax || 1);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 3, r * 0.95, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#16325a'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
      g.addColorStop(0, '#2a6fb5'); g.addColorStop(0.5, '#8fe0ff'); g.addColorStop(1, '#2350a0');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x - r * 0.45, y - z); ctx.lineTo(x, y - z - r * 0.55); ctx.lineTo(x + r * 0.45, y - z); ctx.lineTo(x + r * 0.62, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,245,255,.7)'; ctx.lineWidth = 1.3; ctx.stroke();
      const pul = 0.5 + 0.5 * Math.sin(t * 3 + s.id);
      ctx.fillStyle = `rgba(255,214,110,${0.55 + pul * 0.4})`;
      ctx.beginPath(); ctx.arc(x, y - z * 0.55, r * 0.17, 0, TAU); ctx.fill();
      if (k < 0.999) barre(x, y - z - r * 0.9, 1.3 * ech, 5, k, '#8fe0ff');
    }
    function rune(ru, t) {
      const [x, y] = versEcran(ru.x, ru.y), b = Math.sin(t * 4 + ru.id) * 3, s = 0.32 * ech;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 3, s * 0.8, s * 0.35, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - s + b, 1, x, y - s + b, s * 2.2);
      g.addColorStop(0, 'rgba(255,214,110,.55)'); g.addColorStop(1, 'rgba(255,214,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - s + b, s * 2.2, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s * 2 + b); ctx.lineTo(x + s * 0.7, y - s + b); ctx.lineTo(x, y + b); ctx.lineTo(x - s * 0.7, y - s + b); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    function barre(cx, cy, w, h, k, c) {
      ctx.fillStyle = 'rgba(5,8,20,.8)'; ctx.fillRect(cx - w / 2 - 1.5, cy - 1.5, w + 3, h + 3);
      ctx.fillStyle = c; ctx.fillRect(cx - w / 2, cy, w * clamp(k, 0, 1), h);
    }

    /* Étape de combo qu'une pression d'Attaque lancerait maintenant (pour la visée). */
    function prochaineDef(f, t) {
      const d = PERSO[f.perso];
      const e = f.etat === 'attaque' && f.att ? f.att.etape : f.comboE != null ? (f.etat === 'attaque' ? f.comboE : f.comboE) : f.combo && t <= f.combo.ferme ? f.combo.etape : 0;
      const prochaine = e >= 1 && e < 3 ? e + 1 : 1;
      return prochaine === 1 ? d.attaque : d.combo[prochaine - 2];
    }

    function combattant(f, moi, t, transparent) {
      const [x, y0] = versEcran(f.x, f.y), r = (f.r || CFG.REGLES.RAYON_COMBATTANT) * ech;
      const sK = f.sautK != null ? f.sautK : (f.proj && f.proj.type === 'saut' && f.proj.T ? Math.min(1, f.proj.t / f.proj.T) : 0);
      const sautH = sK ? Math.sin(sK * Math.PI) * 2.2 * ech : 0, y = y0 - sautH;
      const estMoi = f.slot === moi, el = couleur(f.perso), d = PERSO[f.perso], c = fc(d.forme);
      ctx.save();
      if (transparent) ctx.globalAlpha = 0.42;
      else if (f.etat === 'esquive' || f.invul > 0) ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(x, y0 + r * 0.55, r * (1 - sautH / ech * 0.15), r * 0.42, 0, 0, TAU); ctx.fill();
      if (estMoi) {
        ctx.strokeStyle = 'rgba(93,240,160,.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, y0 + r * 0.55, r * 1.25, r * 0.55, 0, 0, TAU); ctx.stroke();
      }
      /* préparation d'une projection : aura qui se charge + direction visible par tous (lisible, esquivable) */
      if (f.etat === 'preparation') {
        const a = f.spec ? f.spec.a : f.specA || f.ang || 0, k = 0.5 + 0.5 * Math.sin(t * 22);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
        g.addColorStop(0, rgba(c[1], 0.0)); g.addColorStop(0.5, rgba(c[1], 0.35 + k * 0.25)); g.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(c[0], 0.6); ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 4 * ech, y + Math.sin(a) * 4 * ech); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      /* direction */
      const a = f.ang || 0;
      ctx.fillStyle = rgba(el, 0.9);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45); ctx.lineTo(x + Math.cos(a + 0.42) * r * 1.08, y + Math.sin(a + 0.42) * r * 1.08); ctx.lineTo(x + Math.cos(a - 0.42) * r * 1.08, y + Math.sin(a - 0.42) * r * 1.08); ctx.fill();
      /* Ki suffisant pour la projection : arc doré qui tourne (pour soi) */
      if (estMoi && f.ki >= d.special.cout) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = f.ki >= CFG.REGLES.KI.AMPLIFIE_SEUIL ? `rgba(255,120,220,${0.55 + 0.4 * Math.sin(t * 10)})` : `rgba(255,209,102,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r * 1.3, t * 3, t * 3 + 4.4); ctx.stroke(); ctx.restore();
      }
      const j = jeton(f.perso, f.cadre || 'base', r);
      ctx.drawImage(j, x - j.width / 2, y - j.height / 2);
      if (f.bouclier > 0) {
        ctx.fillStyle = 'rgba(140,200,255,.18)'; ctx.strokeStyle = 'rgba(190,230,255,.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, TAU); ctx.fill(); ctx.stroke();
      }
      if (f.lent > 0) { ctx.strokeStyle = 'rgba(140,220,255,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (f.etourdi > 0 || f.etat === 'etourdi') {
        ctx.fillStyle = '#ffe27a';
        for (let i = 0; i < 3; i++) { const b = t * 5 + i * TAU / 3; ctx.beginPath(); ctx.arc(x + Math.cos(b) * r * 0.8, y - r * 1.25 + Math.sin(b) * r * 0.25, 3, 0, TAU); ctx.fill(); }
      }
      /* barre de vie, nom, runes */
      const bw = 1.55 * ech, by = y - r - 15;
      barre(x, by, bw, 6, f.hp / f.hpMax, estMoi ? '#5df08f' : '#ff4d6a');
      ctx.font = `700 ${Math.round(clamp(ech * 0.3, 10, 14))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,20,.85)';
      const nm = estMoi ? (f.nom || 'Toi') : f.nom;
      ctx.strokeText(nm, x, by - 3); ctx.fillStyle = estMoi ? '#bfffd8' : '#fff'; ctx.fillText(nm, x, by - 3);
      ctx.font = `600 ${Math.round(clamp(ech * 0.22, 9, 11))}px system-ui,sans-serif`; ctx.textBaseline = 'top';
      ctx.strokeText(Math.ceil(f.hp), x, by + 7); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(Math.ceil(f.hp), x, by + 7);
      if (f.runes > 0) {
        const rx = x + bw / 2 + 9, ry = by + 3;
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(rx, ry - 7); ctx.lineTo(rx + 6, ry); ctx.lineTo(rx, ry + 7); ctx.lineTo(rx - 6, ry); ctx.fill();
        ctx.fillStyle = '#2b1b00'; ctx.font = '800 9px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(f.runes, rx, ry + 0.5);
      }
      if (estMoi) {
        /* 3 charges (anti-spam) puis la jauge de Ki avec le repère du coût de la projection */
        const n = CFG.REGLES.CHARGES.MAX, w = bw / n;
        for (let i = 0; i < n; i++) {
          const k = clamp(f.charges - i, 0, 1);
          ctx.fillStyle = 'rgba(5,8,20,.8)'; ctx.fillRect(x - bw / 2 + i * w, y + r + 8, w - 2, 5);
          ctx.fillStyle = k >= 1 ? '#ffb347' : 'rgba(255,179,71,.45)'; ctx.fillRect(x - bw / 2 + i * w, y + r + 8, (w - 2) * k, 5);
        }
        const kk = clamp(f.ki / CFG.REGLES.KI.MAX, 0, 1);
        ctx.fillStyle = 'rgba(5,8,20,.8)'; ctx.fillRect(x - bw / 2, y + r + 15, bw - 2, 4);
        ctx.fillStyle = kk >= 1 ? '#ff8ad8' : f.ki >= d.special.cout ? '#ffd166' : '#6fb8ff'; ctx.fillRect(x - bw / 2, y + r + 15, (bw - 2) * kk, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - bw / 2 + (bw - 2) * d.special.cout / CFG.REGLES.KI.MAX - 1, y + r + 14, 2, 6);
      }
      ctx.restore();
    }

    /* Une projection dessinée selon l'identité du personnage. */
    function projectile(p, moi, t) {
      const o = vueCourante && vueCourante.f[p.o], forme = formeDe(o, p), c = fc(forme);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (p.k === 'faisceau') {
        const [x, y] = versEcran(p.x, p.y), L = (p.l != null ? p.l : p.L) * ech, w = Math.max(4, p.w * ech * 2), k = 0.85 + 0.15 * Math.sin(t * 40);
        ctx.translate(x, y); ctx.rotate(p.a);
        const g = ctx.createLinearGradient(0, -w, 0, w);
        g.addColorStop(0, rgba(c[1], 0)); g.addColorStop(0.3, rgba(c[1], 0.55 * k)); g.addColorStop(0.5, rgba(c[0], 0.95)); g.addColorStop(0.7, rgba(c[1], 0.55 * k)); g.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g; ctx.fillRect(0, -w, L, w * 2);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, -w * 0.18, L, w * 0.36);
        const g2 = ctx.createRadialGradient(L, 0, 0, L, 0, w * 1.6);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.4, rgba(c[1], 0.8)); g2.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(L, 0, w * 1.6, 0, TAU); ctx.fill();
        ctx.restore();
        return;
      }
      if (p.k === 'lob') {
        const k = clamp(p.t / p.T, 0, 1), gx = p.x0 + (p.tx - p.x0) * k, gy = p.y0 + (p.ty - p.y0) * k;
        const [tx, ty] = versEcran(p.tx, p.ty);
        ctx.strokeStyle = rgba(c[1], 0.35 + 0.3 * k); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, p.r * ech, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(c[1], 0.08 + 0.12 * k); ctx.fill();
        const [x, y] = versEcran(gx, gy), h = Math.sin(k * Math.PI) * 2.6 * ech;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 3.5, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y - h, 1, x, y - h, 14);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, rgba(c[1], 0.9)); g.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - h, 14, 0, TAU); ctx.fill();
        if (forme === 'eclair') { ctx.strokeStyle = rgba(c[0], 0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - h); for (let i = 1; i < 4; i++) ctx.lineTo(x + (Math.random() - 0.5) * 14, y - h - i * 5); ctx.stroke(); }
        ctx.restore();
        return;
      }
      const [x, y] = versEcran(p.x, p.y), r = Math.max(3, p.r * ech), v = hyp(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v;
      const ang = Math.atan2(uy, ux);
      /* traînée commune */
      const lt = Math.min(r * 4.5, 0.08 * v * ech);
      const g = ctx.createLinearGradient(x, y, x - ux * lt, y - uy * lt);
      g.addColorStop(0, rgba(c[1], 0.85)); g.addColorStop(1, rgba(c[1], 0));
      ctx.strokeStyle = g; ctx.lineWidth = r * (forme === 'fil' ? 0.5 : 1.3); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * lt, y - uy * lt); ctx.stroke();
      ctx.translate(x, y); ctx.rotate(ang);
      if (forme === 'vague' || forme === 'onde' || forme === 'magma') {
        /* croissant d'énergie perpendiculaire à la trajectoire */
        ctx.strokeStyle = rgba(c[0], 0.95); ctx.lineWidth = Math.max(2, r * 0.45);
        ctx.beginPath(); ctx.arc(-r * 0.6, 0, r * 1.5, -1.05, 1.05); ctx.stroke();
        ctx.strokeStyle = rgba(c[1], 0.7); ctx.lineWidth = Math.max(3, r * 0.9);
        ctx.beginPath(); ctx.arc(-r * 0.9, 0, r * 1.5, -0.95, 0.95); ctx.stroke();
      } else if (forme === 'etoile') {
        ctx.rotate(t * 9);
        ctx.fillStyle = rgba(c[0], 0.95); ctx.beginPath();
        for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.55 : r * 1.4, b = i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(b) * rr, Math.sin(b) * rr); }
        ctx.closePath(); ctx.fill();
      } else if (forme === 'neant' || forme === 'lumiere') {
        /* lame / lance effilée */
        ctx.fillStyle = rgba(c[1], 0.9); ctx.beginPath(); ctx.moveTo(r * 2.2, 0); ctx.lineTo(-r * 1.2, r * 0.55); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r * 1.2, -r * 0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba(c[0], 0.95); ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(-r * 0.4, r * 0.22); ctx.lineTo(-r * 0.4, -r * 0.22); ctx.closePath(); ctx.fill();
      } else if (forme === 'roc') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(t * 6); ctx.fillStyle = '#8a6438'; ctx.strokeStyle = '#e8cf9c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const b = i * TAU / 6, rr = r * (0.9 + (i % 2) * 0.35); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(b) * rr, Math.sin(b) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (forme === 'fil') {
        ctx.strokeStyle = rgba(c[0], 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.quadraticCurveTo(0, Math.sin(t * 30) * r, -r * 1.4, 0); ctx.stroke();
        ctx.fillStyle = rgba(c[1], 0.95); ctx.beginPath(); ctx.arc(r * 1.2, 0, r * 0.5, 0, TAU); ctx.fill();
      } else if (forme === 'flamme') {
        const fl = 1 + 0.15 * Math.sin(t * 50 + p.id);
        const g2 = ctx.createRadialGradient(r * 0.3, 0, 0, 0, 0, r * 1.8 * fl);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.35, rgba(c[0], 0.95)); g2.addColorStop(0.7, rgba(c[1], 0.7)); g2.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(r * 1.4 * fl, 0); ctx.quadraticCurveTo(0, r * 1.3, -r * 1.6, 0); ctx.quadraticCurveTo(0, -r * 1.3, r * 1.4 * fl, 0); ctx.fill();
      } else {
        const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.4, rgba(c[1], 0.95)); g2.addColorStop(1, rgba(c[1], 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, TAU); ctx.fill();
        if (forme === 'abysse') { ctx.strokeStyle = rgba(c[0], 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, t * 8, t * 8 + 4); ctx.stroke(); }
      }
      if (p.sup) { ctx.strokeStyle = 'rgba(255,209,102,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.stroke(); }
      if (p.fin) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }

    /* ---------- indicateur de visée (prochaine étape du combo, ou projection) ---------- */
    function visee(f, v, t) {
      if (!f || !v) return;
      const d = PERSO[f.perso], A = v.sup ? d.special : prochaineDef(f, t);
      const [x, y] = versEcran(f.x, f.y), col = v.sup ? 'rgba(255,209,102,' : 'rgba(255,255,255,';
      const pk = v.sup && f.ki >= CFG.REGLES.KI.AMPLIFIE_SEUIL ? CFG.REGLES.KI.AMPLIFIE_PORTEE : 1;
      ctx.save();
      const ty = A.type, ang = v.a;
      if (ty === 'tir') {
        const L = A.portee * pk * ech, sp = (A.dispersion || 0) * Math.PI / 180;
        if (sp >= TAU - 0.01) { ctx.strokeStyle = col + '.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, L, 0, TAU); ctx.stroke(); ctx.fillStyle = col + '.08)'; ctx.fill(); }
        else {
          const w = Math.max(A.rayon || 0.3, 0.25) * ech * 2;
          ctx.fillStyle = col + '.16)'; ctx.strokeStyle = col + '.55)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.arc(x, y, L, ang - sp / 2 - Math.atan2(w / 2, L), ang + sp / 2 + Math.atan2(w / 2, L)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else if (ty === 'faisceau') {
        const L = (vueCourante ? window.ARENE_MOTEUR.distanceLibre(vueCourante.carte, f.x, f.y, ang, A.portee * pk) : A.portee) * ech, w = A.largeur * ech * 2;
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = col + '.18)'; ctx.strokeStyle = col + '.65)'; ctx.lineWidth = 2;
        ctx.fillRect(0, -w / 2, L, w); ctx.strokeRect(0, -w / 2, L, w);
      } else if (ty === 'cone') {
        const L = A.portee * ech, l = Math.min(360, A.angle || 60) * Math.PI / 180;
        ctx.fillStyle = col + '.18)'; ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); if (l < TAU - 0.01) ctx.moveTo(x, y); ctx.arc(x, y, L, ang - l / 2, ang + l / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (ty === 'lob' || ty === 'zone' || ty === 'saut' || ty === 'attraction') {
        const P = A.portee * pk, dd = clamp(v.d == null ? P : v.d, 0.5, P);
        const [tx, ty2] = versEcran(f.x + Math.cos(ang) * dd, f.y + Math.sin(ang) * dd);
        ctx.strokeStyle = col + '.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(x, y, P * ech, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col + '.5)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty2); ctx.stroke();
        ctx.fillStyle = col + '.2)'; ctx.strokeStyle = col + '.75)';
        ctx.beginPath(); ctx.arc(tx, ty2, (A.rayon || 1) * ech, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (ty === 'ruee') {
        const L = A.distance * pk * ech, w = 1.2 * ech;
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = col + '.18)'; ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 2;
        ctx.fillRect(0, -w / 2, L, w); ctx.strokeRect(0, -w / 2, L, w);
      } else {
        const rr = (A.rayon || 1.6) * ech;
        ctx.fillStyle = col + '.15)'; ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    let vueCourante = null;
    /* ---------- image complète ---------- */
    function dessiner(vue, moi, dt, opt) {
      opt = opt || {};
      vueCourante = vue;
      if (!vue || !vue.carte) return;
      if (solCarte !== vue.carte) preparerSol(vue.carte);
      const t = vue.t || 0;
      const suivi = vue.f[opt.suivre != null ? opt.suivre : moi] || vue.f[moi];
      if (suivi) {
        const k = cam.ok ? 1 - Math.pow(0.0015, dt) : 1;
        cam.x += (suivi.x - cam.x) * k; cam.y += (suivi.y - cam.y) * k; cam.ok = true;
      }
      const sx = cam.secousse > 0 ? (Math.random() - 0.5) * cam.secousse * 14 : 0, sy = cam.secousse > 0 ? (Math.random() - 0.5) * cam.secousse * 14 : 0;
      cam.secousse = Math.max(0, cam.secousse - dt * 2.2);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
      ctx.translate(sx, sy);
      const carte = vue.carte, Tm = carte.taille;
      const [ox, oy] = versEcran(-Tm / 2, -Tm / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sol, ox, oy, Tm * ech, Tm * ech);

      const moiF = vue.f[moi];
      const obs = moiF && moiF.vivant ? moiF : null;

      /* traces au sol (brûlures) et gravats des éléments détruits */
      for (let i = traces.length - 1; i >= 0; i--) {
        const d = traces[i]; d.vie -= dt;
        if (d.vie <= 0) { traces.splice(i, 1); continue; }
        const [x, y] = versEcran(d.x, d.y), k = Math.min(1, d.vie / 2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, d.r * ech);
        g.addColorStop(0, `rgba(0,0,0,${0.45 * k})`); g.addColorStop(0.7, `rgba(0,0,0,${0.22 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, d.r * ech, d.r * ech * 0.8, 0, 0, TAU); ctx.fill();
      }
      for (const gv of gravats) {
        const [x, y] = versEcran(gv.x, gv.y);
        if (x < -80 || x > W + 80 || y < -80 || y > H + 80) continue;
        for (const c of gv.pierres) {
          ctx.fillStyle = c.c; ctx.beginPath(); ctx.ellipse(x + c.dx * ech, y + c.dy * ech, c.r * ech, c.r * ech * 0.7, c.a, 0, TAU); ctx.fill();
        }
      }

      /* zones au sol à venir (cage d'éclairs) */
      for (const z of vue.z) {
        const [x, y] = versEcran(z.x, z.y), k = 1 - clamp(z.t / (z.T || 1), 0, 1);
        ctx.fillStyle = `rgba(190,150,255,${0.12 + k * 0.2})`; ctx.strokeStyle = 'rgba(220,200,255,.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, z.r * ech, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, z.r * ech * k, 0, TAU); ctx.stroke();
      }

      /* objets triés de haut en bas */
      const liste = [];
      for (const m of carte.murs) liste.push([m.y + m.h / 2, 0, m]);
      for (const o of carte.piliers) liste.push([o.y + o.r * 0.5, 1, o]);
      for (const s of vue.steles) if (s.hp > 0) liste.push([s.y - 0.35, 2, s]); /* un combattant qui chevauche une stèle reste visible */
      for (const r of vue.runes) liste.push([r.y, 3, r]);
      for (const f of vue.f) {
        if (!f.vivant) continue;
        const vis = !obs || f.slot === moi || M.visible(obs, f);
        if (!vis) continue;
        liste.push([f.y + 0.2, 4, f]);
      }
      liste.sort((a, b) => a[0] - b[0]);
      const marge = 3;
      const [vx0, vy0] = versMonde(-marge * ech, -marge * ech), [vx1, vy1] = versMonde(W + marge * ech, H + marge * ech);
      /* lisibilité : un mur ou un pilier qui cache son propre combattant devient translucide */
      const cacheMoi = o => {
        if (!moiF || !moiF.vivant) return false;
        if (o.k === 'mur') return moiF.y < o.y + o.h / 2 && moiF.y > o.y - o.h / 2 - (HAUTEURS[o.type] || 0.62) - 0.9 && Math.abs(moiF.x - o.x) < o.w / 2 + 0.6;
        return moiF.y < o.y && moiF.y > o.y - 1.9 && Math.abs(moiF.x - o.x) < o.r + 0.5;
      };
      for (const [, k, o] of liste) {
        if (k === 0) { if (o.x + o.w / 2 < vx0 || o.x - o.w / 2 > vx1 || o.y + o.h / 2 < vy0 || o.y - o.h / 2 > vy1) continue; mur(o, cacheMoi(o)); }
        else if (o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) continue;
        else if (k === 1) pilier(o, cacheMoi(o));
        else if (k === 2) stele(o, t);
        else if (k === 3) rune(o, t);
        else {
          const cachéMoi = o.slot === moi && (o.cache || o.invisible > 0);
          combattant(o, moi, t, cachéMoi);
        }
      }

      /* cachettes (fourrés de cristal) par-dessus : les combattants dedans sont dissimulés */
      for (const b of carte.cachettes) {
        const [x, y] = versEcran(b.x, b.y), rr = b.r * ech * 1.2;
        if (x < -rr || x > W + rr || y < -rr || y > H + rr) continue;
        const dedans = !!(obs && hyp(obs.x - b.x, obs.y - b.y) < b.r);
        cachette(b, t, dedans);
      }

      /* coups au corps à corps */
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]; a.vie -= dt;
        if (a.vie <= 0) { arcs.splice(i, 1); continue; }
        const [x, y] = versEcran(a.x, a.y), k = a.vie / a.max;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const R0 = a.p * ech * (1.1 - k * 0.2), plein = a.l >= TAU - 0.01;
        ctx.fillStyle = rgba(a.c, (a.fin ? 0.45 : 0.32) * k); ctx.strokeStyle = rgba(a.c2 || a.c, 0.95 * k); ctx.lineWidth = a.fin ? 6 : 4;
        ctx.beginPath(); if (!plein) ctx.moveTo(x, y); ctx.arc(x, y, R0, a.a - a.l / 2, a.a + a.l / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, R0, a.a - a.l / 2, a.a + a.l / 2); ctx.stroke();
        ctx.restore();
      }

      /* images rémanentes de l'esquive */
      for (let i = traine.length - 1; i >= 0; i--) {
        const g = traine[i]; g.vie -= dt;
        if (g.vie <= 0) { traine.splice(i, 1); continue; }
        const k = g.vie / g.max, j = jeton(g.perso, g.cadre || 'base', g.r * ech);
        ctx.save(); ctx.globalAlpha = 0.28 * k;
        for (let n = 0; n < 3; n++) {
          const d2 = (n + 1) * 0.9 * (1 - k), [x, y] = versEcran(g.x + Math.cos(g.a) * d2, g.y + Math.sin(g.a) * d2);
          ctx.drawImage(j, x - j.width / 2, y - j.height / 2);
        }
        ctx.restore();
      }
      if (traine.length > 40) traine.splice(0, traine.length - 40);

      for (const p of vue.p) projectile(p, moi, t);

      /* éclairs (impacts de foudre) */
      for (let i = eclairs.length - 1; i >= 0; i--) {
        const e = eclairs[i]; e.vie -= dt;
        if (e.vie <= 0) { eclairs.splice(i, 1); continue; }
        const [x, y] = versEcran(e.x, e.y), k = e.vie / e.max, H = (e.gros ? 7 : 4.5) * ech;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(e.c, k); ctx.lineWidth = e.gros ? 4 : 2.5;
        ctx.beginPath(); ctx.moveTo(x + (Math.random() - 0.5) * 20, y - H);
        for (let n = 1; n <= 6; n++) ctx.lineTo(x + (Math.random() - 0.5) * (e.gros ? 34 : 18), y - H + H * n / 6);
        ctx.stroke(); ctx.restore();
      }
      if (eclairs.length > 40) eclairs.splice(0, eclairs.length - 40);

      if (opt.visee && moiF && moiF.vivant) visee(moiF, opt.visee, t);

      /* tempête du Néant (hors de la zone) */
      const [zx, zy] = versEcran(vue.zone.cx, vue.zone.cy), zr = vue.zone.r * ech;
      if (zr < hyp(W, H) * 1.5) {
        ctx.save();
        ctx.beginPath(); ctx.rect(-50, -50, W + 100, H + 100); ctx.arc(zx, zy, Math.max(0, zr), 0, TAU, true);
        ctx.fillStyle = 'rgba(58,16,92,.5)'; ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(150,60,220,.08)';
        for (let i = 0; i < 14; i++) {
          const a = t * 0.15 + i * 0.45, rr = zr + 30 + (i % 4) * 40;
          ctx.beginPath(); ctx.arc(zx + Math.cos(a) * rr, zy + Math.sin(a) * rr, 50 + (i % 3) * 25, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(200,120,255,${0.55 + 0.25 * Math.sin(t * 4)})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(0, zr), 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,255,.25)'; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(0, zr + 6), 0, TAU); ctx.stroke();
        ctx.restore();
      }

      /* particules et anneaux */
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = anneaux.length - 1; i >= 0; i--) {
        const a = anneaux[i]; a.vie -= dt;
        if (a.vie <= 0) { anneaux.splice(i, 1); continue; }
        const k = a.vie / a.max, [x, y] = versEcran(a.x, a.y);
        ctx.strokeStyle = rgba(a.c, k * 0.85); ctx.lineWidth = a.e * k + 1;
        ctx.beginPath(); ctx.arc(x, y, a.r * ech * (1.15 - k * 0.5), 0, TAU); ctx.stroke();
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.vie -= dt;
        if (p.vie <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
        const [x, y] = versEcran(p.x, p.y), k = p.vie / p.max, s = Math.max(1.5, p.t * ech * k);
        ctx.fillStyle = p.c.indexOf('rgba') === 0 ? p.c : rgba(p.c, k);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.restore();
      if (parts.length > 700) parts.splice(0, parts.length - 700);
      if (traces.length > 24) traces.splice(0, traces.length - 24);
      if (nombres.length > 80) nombres.splice(0, nombres.length - 80);
      if (anneaux.length > 80) anneaux.splice(0, anneaux.length - 80);
      if (arcs.length > 40) arcs.splice(0, arcs.length - 40);

      for (let i = nombres.length - 1; i >= 0; i--) {
        const n = nombres[i]; n.vie -= dt;
        if (n.vie <= 0) { nombres.splice(i, 1); continue; }
        const k = n.vie / n.max, [x, y] = versEcran(n.x, n.y - (1 - k) * 1.1);
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `800 ${n.gros ? 17 : 13}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(5,6,15,.9)'; ctx.strokeText(n.txt, x, y);
        ctx.fillStyle = n.c; ctx.fillText(n.txt, x, y);
        ctx.globalAlpha = 1;
      }

      /* vignette */
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,.55)');
      ctx.fillStyle = vg; ctx.fillRect(-20, -20, W + 40, H + 40);
      if (moiF && moiF.vivant && hyp(moiF.x - vue.zone.cx, moiF.y - vue.zone.cy) > vue.zone.r) {
        ctx.fillStyle = `rgba(150,40,200,${0.16 + 0.08 * Math.sin(t * 6)})`; ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function vider() { parts.length = 0; nombres.length = 0; anneaux.length = 0; arcs.length = 0; traine.length = 0; eclairs.length = 0; traces.length = 0; gravats.length = 0; flashs.clear(); cam.ok = false; }

    redim();
    return {
      redim, dessiner, evenements, versEcran, versMonde, vider,
      get ech() { return ech; },
      get camera() { return cam; },
      oublierJetons() { jetons.clear(); }
    };
  }

  /* ================================================================== */
  /* COMMANDES                                                          */
  /* ================================================================== */
  function creerCommandes(couche, opts) {
    /* opts : versEcranMoi() → [x,y] position écran du joueur ; versMonde(sx,sy) ;
              autoVisee(special) → {a,d} ; onPause()
       Trois actions : Attaque (combo, 3 charges), Esquive, Spécial (projection payée en Ki).
       Tactile : joystick à gauche ; boutons à droite (glisser pour viser, toucher = visée automatique).
       Clavier : ZQSD/WASD/flèches, J/Entrée = Attaque, Maj/Espace = Esquive, E = Spécial, Échap = pause.
       Souris : visée au pointeur, clic gauche = Attaque, clic droit = Spécial.
       Manette : stick gauche = déplacement, stick droit = visée, A/R1/RT = Attaque, B = Esquive, L1/LT = Spécial. */
    const etat = { mx: 0, my: 0 };
    const file = [];
    let visee = null;
    const touches = {};
    let souris = null, sourisActive = false, dernierType = 'tactile';
    const D = document.createElement('div');
    D.className = 'ar-cmd';
    D.innerHTML = `<div class="ar-joy" hidden><i></i></div>
      <div class="ar-joyhint" aria-hidden="true"><i></i></div>
      <button class="ar-besq" type="button" aria-label="Esquive"><svg viewBox="0 0 40 40"><circle class="fd" cx="20" cy="20" r="17"/><circle class="ch" cx="20" cy="20" r="17"/></svg><b>ESQUIVE</b></button>
      <button class="ar-bsup" type="button" aria-label="Spécial"><svg viewBox="0 0 40 40"><circle class="fd" cx="20" cy="20" r="17"/><circle class="ch" cx="20" cy="20" r="17"/><line class="cout" x1="20" y1="1" x2="20" y2="7"/></svg><b>SPÉCIAL</b><em class="ar-kin num"></em></button>
      <button class="ar-btir" type="button" aria-label="Attaque"><svg viewBox="0 0 40 40"></svg><b>ATTAQUE</b><span class="ar-cpips" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <span class="ar-refus" aria-live="polite"></span>`;
    couche.appendChild(D);
    const joy = D.querySelector('.ar-joy'), knob = joy.querySelector('i');
    const bTir = D.querySelector('.ar-btir'), bSup = D.querySelector('.ar-bsup'), bEsq = D.querySelector('.ar-besq'), lRefus = D.querySelector('.ar-refus');
    const ptrs = new Map();
    const R_JOY = 52;
    let PERSO_ACTIF = () => CFG.PERSONNAGES[0];
    let dernierMvt = { a: 0 };

    function majCharges(ch, n) {
      const svg = bTir.querySelector('svg');
      let h = '';
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * TAU / n + 0.1, a1 = -Math.PI / 2 + (i + 1) * TAU / n - 0.1, k = clamp(ch - i, 0, 1), a2 = a0 + (a1 - a0) * k;
        const arc = (a, b) => `M${20 + Math.cos(a) * 17} ${20 + Math.sin(a) * 17} A17 17 0 0 1 ${20 + Math.cos(b) * 17} ${20 + Math.sin(b) * 17}`;
        h += `<path d="${arc(a0, a1)}" class="fd"/>` + (k > 0.01 ? `<path d="${arc(a0, a2)}" class="${k >= 1 ? 'pl' : 'ch'}"/>` : '');
      }
      if (svg.dataset.h !== h) { svg.innerHTML = h; svg.dataset.h = h; }
      bTir.classList.toggle('vide', ch < 1);
    }
    function majAnneau(btn, k) {
      const c = btn.querySelector('.ch'), L = TAU * 17;
      c.style.strokeDasharray = `${L * clamp(k, 0, 1)} ${L}`;
    }

    /* retour visuel d'une pression refusée */
    const MSG = { vide: 'Recharge…', spam: 'Trop vite !', tot: 'Trop tôt', ki: 'Ki insuffisant', esquive: 'Esquive en recharge', etourdi: 'Étourdi' };
    let tRefus = 0;
    function refus(raison) {
      const btn = raison === 'ki' ? bSup : raison === 'esquive' ? bEsq : bTir;
      btn.classList.remove('non'); void btn.offsetWidth; btn.classList.add('non');
      lRefus.textContent = MSG[raison] || '';
      lRefus.classList.add('on');
      clearTimeout(tRefus); tRefus = setTimeout(() => lRefus.classList.remove('on'), 700);
    }

    function pousser(act, r) { if (r && file.length < 6) file.push({ act, a: r.a, d: r.d }); }
    function dirEsquive() {
      const L = hyp(etat.mx, etat.my);
      const kx = (presse(CODES.droite) ? 1 : 0) - (presse(CODES.gauche) ? 1 : 0), ky = (presse(CODES.bas) ? 1 : 0) - (presse(CODES.haut) ? 1 : 0);
      if (kx || ky) return { a: Math.atan2(ky, kx), d: 0 };
      if (L > 0.2) return { a: Math.atan2(etat.my, etat.mx), d: 0 };
      if (gpMvt) return { a: Math.atan2(gpMvt[1], gpMvt[0]), d: 0 };
      return null; /* la session utilisera la direction du regard */
    }

    function pointerDown(e) {
      dernierType = e.pointerType === 'mouse' ? 'souris' : 'tactile';
      if (e.pointerType === 'mouse') return;
      const cible = e.target.closest('.ar-btir,.ar-bsup,.ar-besq');
      if (cible) {
        e.preventDefault();
        if (cible === bEsq) { cible.classList.add('on'); setTimeout(() => cible.classList.remove('on'), 120); pousser('E', dirEsquive() || { a: NaN, d: 0 }); return; }
        const r = cible.getBoundingClientRect();
        const s = cible === bSup;
        ptrs.set(e.pointerId, { type: s ? 'sup' : 'tir', cx: r.left + r.width / 2, cy: r.top + r.height / 2, dx: 0, dy: 0, t0: performance.now() });
        try { cible.setPointerCapture(e.pointerId); } catch (_) {}
        cible.classList.add('on');
        return;
      }
      if (e.clientX < window.innerWidth * 0.55 && ![...ptrs.values()].some(p => p.type === 'joy')) {
        e.preventDefault();
        ptrs.set(e.pointerId, { type: 'joy', cx: e.clientX, cy: e.clientY });
        joy.hidden = false; joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)';
        D.querySelector('.ar-joyhint').hidden = true;
      }
    }
    function pointerMove(e) {
      if (e.pointerType === 'mouse') { souris = [e.clientX, e.clientY]; sourisActive = true; dernierType = 'souris'; return; }
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.type === 'joy') {
        let dx = e.clientX - p.cx, dy = e.clientY - p.cy;
        const L = hyp(dx, dy);
        if (L > R_JOY) { p.cx += dx * (1 - R_JOY / L); p.cy += dy * (1 - R_JOY / L); dx = e.clientX - p.cx; dy = e.clientY - p.cy; joy.style.left = p.cx + 'px'; joy.style.top = p.cy + 'px'; }
        knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
        const k = Math.min(1, hyp(dx, dy) / R_JOY);
        etat.mx = k > 0.12 ? dx / (hyp(dx, dy) || 1) * k : 0; etat.my = k > 0.12 ? dy / (hyp(dx, dy) || 1) * k : 0;
      } else {
        p.dx = e.clientX - p.cx; p.dy = e.clientY - p.cy;
        const L = hyp(p.dx, p.dy);
        if (L > 14) {
          const d = PERSO_ACTIF(), A = p.type === 'sup' ? d.special : d.attaque, P = A.portee || A.distance || 6;
          visee = { a: Math.atan2(p.dy, p.dx), d: clamp((L - 14) / 70, 0, 1) * P, sup: p.type === 'sup' };
        } else visee = null;
      }
    }
    function pointerUp(e) {
      if (e.pointerType === 'mouse') return;
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (p.type === 'joy') { joy.hidden = true; etat.mx = etat.my = 0; return; }
      (p.type === 'sup' ? bSup : bTir).classList.remove('on');
      if (e.type === 'pointercancel') { visee = null; return; }
      const L = hyp(p.dx, p.dy);
      const req = L > 14 && visee ? { a: visee.a, d: visee.d } : opts.autoVisee(p.type === 'sup');
      pousser(p.type === 'sup' ? 'S' : 'A', req);
      visee = null;
    }

    function mouseDown(e) {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.target.closest('.ar-btir,.ar-bsup,.ar-besq,.ar-hud button')) return;
      dernierType = 'souris'; souris = [e.clientX, e.clientY]; sourisActive = true;
      const r = viseeSouris(e.button === 2);
      if (r) pousser(e.button === 2 ? 'S' : 'A', r);
      e.preventDefault();
    }
    function viseeSouris(s) {
      if (!souris) return null;
      const [mx, my] = opts.versEcranMoi();
      const dx = souris[0] - mx, dy = souris[1] - my;
      const [wx0, wy0] = opts.versMonde(mx, my), [wx1, wy1] = opts.versMonde(souris[0], souris[1]);
      return { a: Math.atan2(dy, dx), d: hyp(wx1 - wx0, wy1 - wy0), sup: !!s };
    }
    const ctxMenu = e => { if (couche.contains(e.target)) e.preventDefault(); };

    const CODES = { haut: ['KeyW', 'KeyZ', 'ArrowUp'], bas: ['KeyS', 'ArrowDown'], gauche: ['KeyA', 'KeyQ', 'ArrowLeft'], droite: ['KeyD', 'ArrowRight'] };
    function keyDown(e) {
      if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
      if (e.repeat) { if (/^Arrow|^Key[WZSAQD]$/.test(e.code)) e.preventDefault(); return; }
      touches[e.code] = true;
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { pousser('E', dirEsquive() || { a: NaN, d: 0 }); e.preventDefault(); }
      else if (e.code === 'KeyE') { pousser('S', sourisActive ? viseeSouris(true) : opts.autoVisee(true)); e.preventDefault(); }
      else if (e.code === 'KeyJ' || e.code === 'Enter') { pousser('A', sourisActive ? viseeSouris(false) : opts.autoVisee(false)); e.preventDefault(); }
      else if (e.code === 'Escape') opts.onPause && opts.onPause();
      if (/^Arrow/.test(e.code)) e.preventDefault();
      dernierType = 'clavier';
    }
    function keyUp(e) { touches[e.code] = false; }
    const presse = l => l.some(c => touches[c]);

    /* manette */
    const prevBtn = [];
    let viseeManette = null, gpMvt = null;
    function manette() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = [...pads].find(p => p && p.connected);
      if (!gp) { gpMvt = null; return null; }
      const ax = gp.axes, b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
      const dz = v => Math.abs(v) < 0.18 ? 0 : v;
      const mx = dz(ax[0] || 0), my = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      gpMvt = mx || my ? [mx, my] : null;
      if (hyp(rx, ry) > 0.35) viseeManette = { a: Math.atan2(ry, rx), k: clamp(hyp(rx, ry), 0, 1) };
      else viseeManette = null;
      const front = i => b(i) && !prevBtn[i];
      const d = PERSO_ACTIF();
      if (front(7) || front(5) || front(0)) pousser('A', viseeManette ? { a: viseeManette.a, d: viseeManette.k * (d.attaque.portee || 6) } : opts.autoVisee(false));
      if (front(1)) pousser('E', dirEsquive() || { a: NaN, d: 0 });
      if (front(6) || front(4)) pousser('S', viseeManette ? { a: viseeManette.a, d: (d.special.portee || 6) * clamp(viseeManette.k, 0.3, 1) } : opts.autoVisee(true));
      if (front(9)) opts.onPause && opts.onPause();
      for (let i = 0; i < gp.buttons.length; i++) prevBtn[i] = b(i);
      if (mx || my || rx || ry || gp.buttons.some(x => x.pressed)) dernierType = 'manette';
      return { mx, my };
    }

    function lire() {
      let mx = etat.mx, my = etat.my;
      const kx = (presse(CODES.droite) ? 1 : 0) - (presse(CODES.gauche) ? 1 : 0), ky = (presse(CODES.bas) ? 1 : 0) - (presse(CODES.haut) ? 1 : 0);
      if (kx || ky) { const L = hyp(kx, ky); mx = kx / L; my = ky / L; }
      const g = manette();
      if (g && (g.mx || g.my)) { mx = g.mx; my = g.my; }
      if (mx || my) dernierMvt = { a: Math.atan2(my, mx) };
      let v = visee;
      if (!v && viseeManette) v = { a: viseeManette.a, d: viseeManette.k * (PERSO_ACTIF().attaque.portee || 6), sup: false };
      if (!v && sourisActive && dernierType === 'souris') v = viseeSouris(false);
      return { mx, my, visee: v };
    }

    const opt = { passive: false };
    couche.addEventListener('pointerdown', pointerDown, opt);
    window.addEventListener('pointermove', pointerMove, opt);
    window.addEventListener('pointerup', pointerUp, opt);
    window.addEventListener('pointercancel', pointerUp, opt);
    couche.addEventListener('mousedown', mouseDown);
    window.addEventListener('contextmenu', ctxMenu);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    majCharges(CFG.REGLES.CHARGES.MAX, CFG.REGLES.CHARGES.MAX); majAnneau(bSup, 0); majAnneau(bEsq, 1);

    return {
      lire,
      /* pressions en attente, dans l'ordre : [{act:'A'|'E'|'S', a, d}] */
      prendreAppuis() { return file.splice(0); },
      refus,
      majBoutons(f, info) {
        if (!f) return;
        const K = CFG.REGLES.KI, d = PERSO_ACTIF(), cout = (info && info.cout) || d.special.cout;
        majCharges(f.charges, CFG.REGLES.CHARGES.MAX);
        majAnneau(bSup, f.ki / K.MAX);
        const ligne = bSup.querySelector('.cout'), ac = TAU * cout / K.MAX; /* le SVG est déjà tourné d'un quart de tour */
        ligne.setAttribute('x1', 20 + Math.cos(ac) * 14); ligne.setAttribute('y1', 20 + Math.sin(ac) * 14);
        ligne.setAttribute('x2', 20 + Math.cos(ac) * 20); ligne.setAttribute('y2', 20 + Math.sin(ac) * 20);
        bSup.classList.toggle('pret', f.ki >= cout); bSup.classList.toggle('max', f.ki >= K.AMPLIFIE_SEUIL);
        const kin = bSup.querySelector('.ar-kin'), txt = String(Math.floor(f.ki));
        if (kin.textContent !== txt) kin.textContent = txt;
        majAnneau(bEsq, 1 - clamp((f.esqCd || 0) / CFG.REGLES.ESQUIVE.RECHARGE_S, 0, 1));
        bEsq.classList.toggle('cd', (f.esqCd || 0) > 0);
        const e = info && info.etape || 0;
        bTir.querySelectorAll('.ar-cpips i').forEach((p, i) => p.classList.toggle('on', i < e));
      },
      definirPerso(id) { PERSO_ACTIF = () => PERSO[id] || CFG.PERSONNAGES[0]; },
      get type() { return dernierType; },
      get regard() { return dernierMvt.a; },
      vider() { file.length = 0; visee = null; etat.mx = etat.my = 0; for (const k in touches) touches[k] = false; ptrs.clear(); joy.hidden = true; },
      detruire() {
        clearTimeout(tRefus);
        couche.removeEventListener('pointerdown', pointerDown, opt);
        window.removeEventListener('pointermove', pointerMove, opt);
        window.removeEventListener('pointerup', pointerUp, opt);
        window.removeEventListener('pointercancel', pointerUp, opt);
        couche.removeEventListener('mousedown', mouseDown);
        window.removeEventListener('contextmenu', ctxMenu);
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        D.remove();
      }
    };
  }

  window.ARENE_RENDU = { creer };
  window.ARENE_COMMANDES = { creer: creerCommandes };
})();
