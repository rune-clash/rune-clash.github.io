/*
 * Rune Clash — Arène des Trophées : AFFICHAGE ET COMMANDES
 * ========================================================
 * ARENE_RENDU.creer(canvas, opts)      dessine une « vue » de partie (locale, hôte ou invité) en 2D vue de dessus.
 * ARENE_COMMANDES.creer(couche, opts)  joystick tactile, boutons Attaque / Super, clavier + souris, manette.
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
    const traces = new Map();

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

    /* ---------- sol pré-dessiné une fois par partie ---------- */
    function preparerSol(carte) {
      const E = 26, T = carte.taille, D = Math.round(T * E), c = document.createElement('canvas');
      c.width = c.height = D;
      const g = c.getContext('2d'), rnd = M.alea(carte.graine ^ 0x51ed);
      const gr = g.createRadialGradient(D / 2, D / 2, D * 0.05, D / 2, D / 2, D * 0.72);
      gr.addColorStop(0, '#1c2547'); gr.addColorStop(0.6, '#131a35'); gr.addColorStop(1, '#0b1024');
      g.fillStyle = gr; g.fillRect(0, 0, D, D);
      /* dalles */
      g.strokeStyle = 'rgba(120,150,255,.06)'; g.lineWidth = 1;
      for (let i = 0; i <= T; i += 2) {
        g.beginPath(); g.moveTo(i * E, 0); g.lineTo(i * E, D); g.stroke();
        g.beginPath(); g.moveTo(0, i * E); g.lineTo(D, i * E); g.stroke();
      }
      for (let i = 0; i < T * T / 7; i++) {
        const x = Math.floor(rnd() * T / 2) * 2, y = Math.floor(rnd() * T / 2) * 2;
        g.fillStyle = `rgba(${90 + rnd() * 60 | 0},${110 + rnd() * 60 | 0},255,${0.02 + rnd() * 0.035})`;
        g.fillRect(x * E + 1, y * E + 1, 2 * E - 2, 2 * E - 2);
      }
      /* sillons de runes */
      g.strokeStyle = 'rgba(150,120,255,.10)'; g.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        let x = rnd() * D, y = rnd() * D;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); }
        g.stroke();
      }
      /* cercle central */
      g.strokeStyle = 'rgba(255,210,120,.13)'; g.lineWidth = 3;
      g.beginPath(); g.arc(D / 2, D / 2, 3.2 * E, 0, TAU); g.stroke();
      g.beginPath(); g.arc(D / 2, D / 2, 4.1 * E, 0, TAU); g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU;
        g.beginPath(); g.moveTo(D / 2 + Math.cos(a) * 3.2 * E, D / 2 + Math.sin(a) * 3.2 * E); g.lineTo(D / 2 + Math.cos(a) * 4.1 * E, D / 2 + Math.sin(a) * 4.1 * E); g.stroke();
      }
      /* points de départ */
      carte.depart.forEach(d => {
        g.strokeStyle = 'rgba(120,200,255,.10)'; g.lineWidth = 2;
        g.beginPath(); g.arc((d.x + T / 2) * E, (d.y + T / 2) * E, 0.9 * E, 0, TAU); g.stroke();
      });
      /* bord */
      g.strokeStyle = 'rgba(140,170,255,.35)'; g.lineWidth = 6; g.strokeRect(3, 3, D - 6, D - 6);
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

    function evenements(vue, liste, moi) {
      for (const e of liste) {
        const o = e.o != null && e.o >= 0 && vue.f[e.o], col = o ? couleur(o.perso) : '#ff6b8a';
        switch (e.k) {
          case 'hit':
            if (e.z) { if (e.s === moi && Math.random() < 0.5) etincelles(e.x, e.y, '#b06bff', 3, 2, 0.5); if (e.s === moi) cam.secousse = Math.max(cam.secousse, 0.12); break; }
            etincelles(e.x, e.y, col, 7, 6, 0.35);
            texte(e.x + (Math.random() - 0.5) * 0.4, e.y - 0.9, String(e.n), e.s === moi ? '#ff5a6e' : e.o === moi ? '#ffffff' : 'rgba(255,255,255,.65)', e.o === moi);
            if (e.s === moi) cam.secousse = Math.max(cam.secousse, 0.25);
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
          case 'cone': arcs.push({ x: e.x, y: e.y, a: e.a, p: e.p, l: e.l * Math.PI / 180, c: col, vie: 0.22, max: 0.22 }); break;
          case 'onde': case 'impact': anneau(e.x, e.y, e.r, col, 0.5, 7); etincelles(e.x, e.y, col, 24, 7, 0.6); if (e.o === moi) cam.secousse = Math.max(cam.secousse, 0.35); break;
          case 'boum': anneau(e.x, e.y, e.r, col, 0.35, 5); etincelles(e.x, e.y, col, 14, 5, 0.45); break;
          case 'foudre': anneau(e.x, e.y, e.r, '#c9a6ff', 0.55, 8); etincelles(e.x, e.y, '#e7d4ff', 30, 9, 0.6); break;
          case 'attraction': anneau(e.x, e.y, e.r, col, 0.5, 5); anneau(e.x, e.y, e.r * 0.4, col, 0.5, 3); break;
          case 'super': { const v = vue.f[e.s]; anneau(e.x, e.y, 1.6, '#ffd166', 0.4, 5); if (v) etincelles(e.x, e.y, couleur(v.perso), 16, 5, 0.5); break; }
          case 'soin': etincelles(e.x, e.y, '#5df0a0', 18, 3, 0.8); texte(e.x, e.y - 1.2, '+' + e.n, '#5df0a0', true); break;
          case 'mur': etincelles(e.x, e.y, 'rgba(200,210,255,.8)', 3, 2, 0.25); break;
          case 'victoire': { const v = vue.f[e.s]; if (v) for (let i = 0; i < 6; i++) anneau(v.x, v.y, 1 + i * 0.7, '#ffd166', 0.6 + i * 0.12, 3); break; }
        }
      }
    }

    /* ---------- dessin des éléments du décor ---------- */
    const HAUT = 0.62; /* hauteur apparente des murs */
    function mur(m) {
      const [x, y] = versEcran(m.x - m.w / 2, m.y - m.h / 2), w = m.w * ech, h = m.h * ech, z = HAUT * ech;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + z * 0.35, y + z * 0.25, w, h);
      const gf = ctx.createLinearGradient(0, y + h - z, 0, y + h);
      gf.addColorStop(0, '#252d52'); gf.addColorStop(1, '#151a33');
      ctx.fillStyle = gf; ctx.fillRect(x, y + h - z, w, z);
      const gt = ctx.createLinearGradient(x, y - z, x + w, y + h - z);
      gt.addColorStop(0, '#3d4a82'); gt.addColorStop(1, '#2c3765');
      ctx.fillStyle = gt; ctx.fillRect(x, y - z, w, h);
      ctx.strokeStyle = 'rgba(140,175,255,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y - z + 0.75, w - 1.5, h - 1.5);
      ctx.fillStyle = 'rgba(160,140,255,.22)';
      const n = Math.max(1, Math.round(Math.max(m.w, m.h) / 1.6));
      for (let i = 0; i < n; i++) {
        const cx = m.w > m.h ? x + w * (i + 0.5) / n : x + w / 2, cy = (m.w > m.h ? y + h / 2 : y + h * (i + 0.5) / n) - z;
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 3, cy); ctx.fill();
      }
    }
    function rocher(o) {
      const [x, y] = versEcran(o.x, o.y), r = o.r * ech, z = HAUT * 0.8 * ech;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + z * 0.3, y + z * 0.2, r, r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b2244'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.92, 0, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.3, y - z - r * 0.4, 1, x, y - z, r);
      g.addColorStop(0, '#5a68a8'); g.addColorStop(1, '#2a3366');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - z * 0.6, r, r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,255,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
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

    function combattant(f, moi, t, transparent) {
      const [x, y0] = versEcran(f.x, f.y), r = f.r * ech || CFG.REGLES.RAYON_COMBATTANT * ech;
      const sK = f.sautK != null ? f.sautK : (f.saut && f.saut.T ? Math.min(1, f.saut.t / f.saut.T) : 0);
      const sautH = sK ? Math.sin(sK * Math.PI) * 2.2 * ech : 0, y = y0 - sautH;
      const estMoi = f.slot === moi, el = couleur(f.perso);
      ctx.save();
      if (transparent) ctx.globalAlpha = 0.42;
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(x, y0 + r * 0.55, r * (1 - sautH / ech * 0.15), r * 0.42, 0, 0, TAU); ctx.fill();
      if (estMoi) {
        ctx.strokeStyle = 'rgba(93,240,160,.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, y0 + r * 0.55, r * 1.25, r * 0.55, 0, 0, TAU); ctx.stroke();
      }
      /* direction */
      const a = f.ang || 0;
      ctx.fillStyle = rgba(el, 0.9);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45); ctx.lineTo(x + Math.cos(a + 0.42) * r * 1.08, y + Math.sin(a + 0.42) * r * 1.08); ctx.lineTo(x + Math.cos(a - 0.42) * r * 1.08, y + Math.sin(a - 0.42) * r * 1.08); ctx.fill();
      if (f.sup >= 1 && estMoi) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,209,102,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r * 1.3, t * 3, t * 3 + 4.4); ctx.stroke(); ctx.restore();
      }
      const j = jeton(f.perso, f.cadre || 'base', r);
      ctx.drawImage(j, x - j.width / 2, y - j.height / 2);
      if (f.bouclier > 0) {
        ctx.fillStyle = 'rgba(140,200,255,.18)'; ctx.strokeStyle = 'rgba(190,230,255,.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, TAU); ctx.fill(); ctx.stroke();
      }
      if (f.lent > 0) { ctx.strokeStyle = 'rgba(140,220,255,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (f.etourdi > 0) {
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
        const n = CFG.REGLES.MUNITIONS, w = bw / n;
        for (let i = 0; i < n; i++) {
          const k = clamp(f.mun - i, 0, 1);
          ctx.fillStyle = 'rgba(5,8,20,.8)'; ctx.fillRect(x - bw / 2 + i * w, y + r + 8, w - 2, 5);
          ctx.fillStyle = k >= 1 ? '#ffb347' : 'rgba(255,179,71,.45)'; ctx.fillRect(x - bw / 2 + i * w, y + r + 8, (w - 2) * k, 5);
        }
      }
      ctx.restore();
    }

    function projectile(p, moi, t) {
      const o = vueCourante && vueCourante.f[p.o], c = o ? couleur(o.perso) : '#fff';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (p.k === 'lob') {
        const k = clamp(p.t / p.T, 0, 1), gx = p.x0 + (p.tx - p.x0) * k, gy = p.y0 + (p.ty - p.y0) * k;
        const [tx, ty] = versEcran(p.tx, p.ty);
        ctx.strokeStyle = rgba(c, 0.35 + 0.3 * k); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, p.r * ech, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(c, 0.08 + 0.12 * k); ctx.fill();
        const [x, y] = versEcran(gx, gy), h = Math.sin(k * Math.PI) * 2.6 * ech;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 3.5, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y - h, 1, x, y - h, 14);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, rgba(c, 0.9)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - h, 14, 0, TAU); ctx.fill();
      } else {
        const [x, y] = versEcran(p.x, p.y), r = Math.max(3, p.r * ech), v = hyp(p.vx, p.vy) || 1;
        const lx = -p.vx / v * Math.min(r * 4, 0.07 * v * ech), ly = -p.vy / v * Math.min(r * 4, 0.07 * v * ech);
        const g = ctx.createLinearGradient(x, y, x + lx, y + ly);
        g.addColorStop(0, rgba(c, 0.85)); g.addColorStop(1, rgba(c, 0));
        ctx.strokeStyle = g; ctx.lineWidth = r * 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lx, y + ly); ctx.stroke();
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.4, rgba(c, 0.95)); g2.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
        if (p.sup) { ctx.strokeStyle = 'rgba(255,209,102,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    }

    /* ---------- indicateur de visée ---------- */
    function visee(f, v) {
      if (!f || !v) return;
      const d = PERSO[f.perso], A = v.sup ? d.super : d.attaque;
      const [x, y] = versEcran(f.x, f.y), col = v.sup ? 'rgba(255,209,102,' : 'rgba(255,255,255,';
      ctx.save();
      const t = A.type, ang = v.a;
      if (t === 'tir') {
        const L = A.portee * ech, n = A.projectiles || 1, sp = (A.dispersion || 0) * Math.PI / 180;
        if (sp >= TAU - 0.01) { ctx.strokeStyle = col + '.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, L, 0, TAU); ctx.stroke(); ctx.fillStyle = col + '.08)'; ctx.fill(); }
        else {
          const w = Math.max(A.rayon || 0.3, 0.25) * ech * 2;
          ctx.fillStyle = col + '.16)'; ctx.strokeStyle = col + '.55)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.arc(x, y, L, ang - sp / 2 - Math.atan2(w / 2, L), ang + sp / 2 + Math.atan2(w / 2, L)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else if (t === 'cone') {
        const L = A.portee * ech, l = (A.angle || 60) * Math.PI / 180;
        ctx.fillStyle = col + '.18)'; ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, L, ang - l / 2, ang + l / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (t === 'lob' || t === 'zone' || t === 'saut' || t === 'attraction') {
        const P = A.portee, dd = clamp(v.d == null ? P : v.d, 0.5, P);
        const [tx, ty] = versEcran(f.x + Math.cos(ang) * dd, f.y + Math.sin(ang) * dd);
        ctx.strokeStyle = col + '.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(x, y, P * ech, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col + '.5)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = col + '.2)'; ctx.strokeStyle = col + '.75)';
        ctx.beginPath(); ctx.arc(tx, ty, (A.rayon || 1) * ech, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (t === 'ruee') {
        const L = A.distance * ech, w = 1.2 * ech;
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

      /* brume */
      for (const b of carte.brumes) {
        const [x, y] = versEcran(b.x, b.y);
        if (x < -b.r * ech * 1.3 || x > W + b.r * ech * 1.3 || y < -b.r * ech * 1.3 || y > H + b.r * ech * 1.3) continue;
        const dedans = obs && hyp(obs.x - b.x, obs.y - b.y) < b.r;
        const g = ctx.createRadialGradient(x, y, b.r * ech * 0.2, x, y, b.r * ech * 1.08);
        const a = dedans ? 0.32 : 0.62;
        g.addColorStop(0, `rgba(96,64,170,${a})`); g.addColorStop(0.75, `rgba(70,48,140,${a * 0.85})`); g.addColorStop(1, 'rgba(60,40,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r * ech * 1.08, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(170,140,255,${dedans ? 0.06 : 0.12})`;
        for (let i = 0; i < 5; i++) {
          const a2 = t * 0.25 + i * 1.3 + b.x, rr = b.r * ech * (0.35 + 0.12 * Math.sin(t + i));
          ctx.beginPath(); ctx.arc(x + Math.cos(a2) * b.r * ech * 0.45, y + Math.sin(a2) * b.r * ech * 0.35, rr, 0, TAU); ctx.fill();
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
      for (const o of carte.rochers) liste.push([o.y + o.r * 0.5, 1, o]);
      for (const s of vue.steles) if (s.hp > 0) liste.push([s.y + 0.3, 2, s]);
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
      for (const [, k, o] of liste) {
        if (k === 0) { if (o.x + o.w / 2 < vx0 || o.x - o.w / 2 > vx1 || o.y + o.h / 2 < vy0 || o.y - o.h / 2 > vy1) continue; mur(o); }
        else if (o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) continue;
        else if (k === 1) rocher(o);
        else if (k === 2) stele(o, t);
        else if (k === 3) rune(o, t);
        else {
          const dansBrume = o.slot === moi && (o.brume || o.invisible > 0);
          combattant(o, moi, t, dansBrume);
        }
      }

      /* coups au corps à corps */
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]; a.vie -= dt;
        if (a.vie <= 0) { arcs.splice(i, 1); continue; }
        const [x, y] = versEcran(a.x, a.y), k = a.vie / a.max;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(a.c, 0.35 * k); ctx.strokeStyle = rgba(a.c, 0.9 * k); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, a.p * ech * (1.1 - k * 0.2), a.a - a.l / 2, a.a + a.l / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, a.p * ech * (1.1 - k * 0.2), a.a - a.l / 2, a.a + a.l / 2); ctx.stroke();
        ctx.restore();
      }

      for (const p of vue.p) projectile(p, moi, t);

      if (opt.visee && moiF && moiF.vivant) visee(moiF, opt.visee);

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

    function vider() { parts.length = 0; nombres.length = 0; anneaux.length = 0; arcs.length = 0; cam.ok = false; traces.clear(); }

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
              autoVisee(sup) → {a,d} ; peutSuper() → bool ; onPause() */
    const etat = { mx: 0, my: 0 };
    let tir = null, sup = null, visee = null;
    const touches = {};
    let souris = null, sourisActive = false, dernierType = 'tactile';
    const D = document.createElement('div');
    D.className = 'ar-cmd';
    D.innerHTML = `<div class="ar-joy" hidden><i></i></div>
      <div class="ar-joyhint" aria-hidden="true"><i></i></div>
      <button class="ar-bsup" type="button" aria-label="Super"><svg viewBox="0 0 40 40"><circle class="fd" cx="20" cy="20" r="17"/><circle class="ch" cx="20" cy="20" r="17"/></svg><b>SUPER</b></button>
      <button class="ar-btir" type="button" aria-label="Attaque"><svg viewBox="0 0 40 40"></svg><b>ATTAQUE</b></button>
      <div class="ar-knob" hidden></div>`;
    couche.appendChild(D);
    const joy = D.querySelector('.ar-joy'), knob = joy.querySelector('i');
    const bTir = D.querySelector('.ar-btir'), bSup = D.querySelector('.ar-bsup'), bout = D.querySelector('.ar-knob');
    const ptrs = new Map();
    const R_JOY = 52;

    function majMun(mun, n) {
      const svg = bTir.querySelector('svg');
      let h = '';
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * TAU / n + 0.1, a1 = -Math.PI / 2 + (i + 1) * TAU / n - 0.1, k = clamp(mun - i, 0, 1), a2 = a0 + (a1 - a0) * k;
        const arc = (a, b) => `M${20 + Math.cos(a) * 17} ${20 + Math.sin(a) * 17} A17 17 0 0 1 ${20 + Math.cos(b) * 17} ${20 + Math.sin(b) * 17}`;
        h += `<path d="${arc(a0, a1)}" class="fd"/>` + (k > 0.01 ? `<path d="${arc(a0, a2)}" class="${k >= 1 ? 'pl' : 'ch'}"/>` : '');
      }
      svg.innerHTML = h;
    }
    function majSuper(k) {
      const c = bSup.querySelector('.ch'), L = TAU * 17;
      c.style.strokeDasharray = `${L * clamp(k, 0, 1)} ${L}`;
      bSup.classList.toggle('pret', k >= 1);
    }

    function pointerDown(e) {
      dernierType = e.pointerType === 'mouse' ? 'souris' : 'tactile';
      if (e.pointerType === 'mouse') return;
      const cible = e.target.closest('.ar-btir,.ar-bsup');
      if (cible) {
        e.preventDefault();
        const r = cible.getBoundingClientRect();
        const s = cible === bSup;
        if (s && !opts.peutSuper()) { cible.classList.add('non'); setTimeout(() => cible.classList.remove('non'), 250); return; }
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
      if (e.pointerType === 'mouse') {
        souris = [e.clientX, e.clientY]; sourisActive = true; dernierType = 'souris';
        return;
      }
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.type === 'joy') {
        let dx = e.clientX - p.cx, dy = e.clientY - p.cy;
        const L = hyp(dx, dy);
        if (L > R_JOY) { /* le joystick suit le doigt */ p.cx += dx * (1 - R_JOY / L); p.cy += dy * (1 - R_JOY / L); dx = e.clientX - p.cx; dy = e.clientY - p.cy; joy.style.left = p.cx + 'px'; joy.style.top = p.cy + 'px'; }
        knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
        const k = Math.min(1, hyp(dx, dy) / R_JOY);
        etat.mx = k > 0.12 ? dx / (hyp(dx, dy) || 1) * k : 0; etat.my = k > 0.12 ? dy / (hyp(dx, dy) || 1) * k : 0;
      } else {
        p.dx = e.clientX - p.cx; p.dy = e.clientY - p.cy;
        const L = hyp(p.dx, p.dy);
        if (L > 14) {
          const d = PERSO_ACTIF(), A = p.type === 'sup' ? d.super : d.attaque, P = A.portee || A.distance || 6;
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
      const L = hyp(p.dx, p.dy);
      let req;
      if (L > 14 && visee) req = { a: visee.a, d: visee.d };
      else req = opts.autoVisee(p.type === 'sup');
      if (e.type === 'pointercancel') req = null;
      if (req) { if (p.type === 'sup') sup = req; else tir = req; }
      visee = null;
    }

    /* souris : visée vers le pointeur, clic gauche = attaque, clic droit = super */
    function mouseDown(e) {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.target.closest('.ar-btir,.ar-bsup,.ar-hud button')) return;
      dernierType = 'souris'; souris = [e.clientX, e.clientY]; sourisActive = true;
      const r = viseeSouris(e.button === 2);
      if (!r) return;
      if (e.button === 2) { if (opts.peutSuper()) sup = r; } else tir = r;
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
      if (e.repeat && (e.code === 'Space' || e.code === 'KeyE')) return;
      touches[e.code] = true;
      if (e.code === 'Space' || e.code === 'KeyE') { if (opts.peutSuper()) sup = sourisActive ? viseeSouris(true) : opts.autoVisee(true); e.preventDefault(); }
      else if (e.code === 'KeyJ' || e.code === 'Enter') { tir = sourisActive ? viseeSouris(false) : opts.autoVisee(false); e.preventDefault(); }
      else if (e.code === 'Escape') opts.onPause && opts.onPause();
      if (/^Arrow/.test(e.code)) e.preventDefault();
      dernierType = 'clavier';
    }
    function keyUp(e) { touches[e.code] = false; }
    const presse = l => l.some(c => touches[c]);

    /* manette */
    const prevBtn = [];
    let viseeManette = null;
    function manette() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = [...pads].find(p => p && p.connected);
      if (!gp) return null;
      const ax = gp.axes, b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
      const dz = v => Math.abs(v) < 0.18 ? 0 : v;
      const mx = dz(ax[0] || 0), my = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      const out = { mx, my };
      if (hyp(rx, ry) > 0.35) {
        const d = PERSO_ACTIF(), A = d.attaque;
        viseeManette = { a: Math.atan2(ry, rx), d: clamp(hyp(rx, ry), 0, 1) * (A.portee || 6) };
      } else viseeManette = null;
      const front = i => b(i) && !prevBtn[i];
      if (front(7) || front(5) || front(0)) tir = viseeManette ? { a: viseeManette.a, d: viseeManette.d } : opts.autoVisee(false);
      if ((front(6) || front(4) || front(1)) && opts.peutSuper()) sup = viseeManette ? { a: viseeManette.a, d: (PERSO_ACTIF().super.portee || 6) * clamp(hyp(rx, ry), 0.3, 1) } : opts.autoVisee(true);
      if (front(9)) opts.onPause && opts.onPause();
      for (let i = 0; i < gp.buttons.length; i++) prevBtn[i] = b(i);
      if (mx || my || rx || ry || gp.buttons.some(x => x.pressed)) dernierType = 'manette';
      return out;
    }

    let PERSO_ACTIF = () => CFG.PERSONNAGES[0];
    function lire() {
      let mx = etat.mx, my = etat.my;
      const kx = (presse(CODES.droite) ? 1 : 0) - (presse(CODES.gauche) ? 1 : 0), ky = (presse(CODES.bas) ? 1 : 0) - (presse(CODES.haut) ? 1 : 0);
      if (kx || ky) { const L = hyp(kx, ky); mx = kx / L; my = ky / L; }
      const g = manette();
      if (g && (g.mx || g.my)) { mx = g.mx; my = g.my; }
      let v = visee;
      if (!v && viseeManette) v = { a: viseeManette.a, d: viseeManette.d, sup: false };
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
    majMun(CFG.REGLES.MUNITIONS, CFG.REGLES.MUNITIONS); majSuper(0);

    return {
      lire,
      prendreTir() { const r = tir; tir = null; return r; },
      prendreSuper() { const r = sup; sup = null; return r; },
      majBoutons(f) { if (!f) return; majMun(f.mun, CFG.REGLES.MUNITIONS); majSuper(f.sup); },
      definirPerso(id) { PERSO_ACTIF = () => PERSO[id] || CFG.PERSONNAGES[0]; },
      get type() { return dernierType; },
      vider() { tir = sup = visee = null; etat.mx = etat.my = 0; for (const k in touches) touches[k] = false; ptrs.clear(); joy.hidden = true; },
      detruire() {
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
