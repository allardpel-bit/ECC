/* ============================================================================
   FORT BOEKOE — De Belegering (1772)
   Een first-person reconstructie van het Marronfort van Boni in Suriname.
   Pure Three.js, procedureel opgebouwd — geen externe assets.
   Historische bronnen: Wikipedia (Fort Boekoe / Marrons van Suriname), kibrimi.sr
   ========================================================================== */

(() => {
  "use strict";

  // ---- Constants --------------------------------------------------------
  const FORT_R = 23;            // straal palissade
  const WALL_H = 5;             // palissade 5 meter hoog (historisch)
  const PLAYER_H = 1.7;
  const PHASE = { VERKENNING: "verkenning", BELEGERING: "belegering", EINDE: "einde" };

  // ---- Three basics -----------------------------------------------------
  let scene, camera, renderer, clock;
  let phase = PHASE.VERKENNING;

  // ---- DOM --------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const hud = $("hud");
  const objText = $("objText"), phaseLabel = $("phaseLabel"), compassDir = $("compassDir");
  const healthNum = $("healthNum"), healthFill = $("healthFill");
  const moraleNum = $("moraleNum"), moraleFill = $("moraleFill");
  const ammoText = $("ammoText"), promptEl = $("prompt"), toastEl = $("toast"), damageEl = $("damage");

  // ---- State ------------------------------------------------------------
  const keys = {};
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  const touchMove = new THREE.Vector2();   // x = strafe, y = forward
  let yaw = 0, pitch = 0;
  let health = 100, morale = 100;
  let ammo = 1, maxAmmo = 1, reloading = false;
  let pointerLocked = false;
  let running = false;

  const player = { pos: new THREE.Vector3(0, PLAYER_H, 8), vel: new THREE.Vector3() };
  const colliders = [];        // {x,z,r} cylinders to block
  const enemies = [];
  const bullets = [];          // visual tracers (enemy)
  const markers = [];          // verkenning info-punten
  const animThings = [];       // {update(dt)}
  let cannons = [];            // draaibas platforms

  // siege bookkeeping
  let escapeTime = 0, escapeTotal = 150; // seconden tot Boni ontkomen is
  let waveTimer = 0, spawnedTotal = 0;
  let nearCannon = null, nearMarker = null;
  let lastShot = 0;

  // ---- Audio (WebAudio, lichtgewicht) ----------------------------------
  let actx = null;
  function audioInit() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } }
  function gunshot(big) {
    if (!actx) return;
    const t = actx.currentTime, dur = big ? 0.5 : 0.18;
    const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, big ? 2 : 3);
    const src = actx.createBufferSource(); src.buffer = buf;
    const g = actx.createGain(); g.gain.value = big ? 0.5 : 0.28;
    const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = big ? 900 : 1800;
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
  }
  function thud() {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 90; o.type = "sine";
    g.gain.setValueAtTime(0.25, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.25);
  }
  let ambientStarted = false;
  function startAmbient() {
    if (!actx || ambientStarted) return; ambientStarted = true;
    // lage jungle-drone
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = 56; g.gain.value = 0.04;
    o.connect(g); g.connect(actx.destination); o.start();
    // af en toe een vogel
    setInterval(() => {
      if (!actx || document.hidden) return;
      if (Math.random() > 0.55) return;
      const b = actx.createOscillator(), bg = actx.createGain();
      b.type = "sine";
      const f0 = 1400 + Math.random() * 900;
      b.frequency.setValueAtTime(f0, actx.currentTime);
      b.frequency.linearRampToValueAtTime(f0 * 1.4, actx.currentTime + 0.08);
      bg.gain.setValueAtTime(0.0, actx.currentTime);
      bg.gain.linearRampToValueAtTime(0.05, actx.currentTime + 0.02);
      bg.gain.linearRampToValueAtTime(0.0, actx.currentTime + 0.18);
      b.connect(bg); bg.connect(actx.destination); b.start(); b.stop(actx.currentTime + 0.2);
    }, 2600);
  }

  // ---- Helpers ----------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  function toast(msg, ms = 4200) {
    toastEl.innerHTML = msg; toastEl.style.opacity = "1";
    clearTimeout(toast._t); toast._t = setTimeout(() => (toastEl.style.opacity = "0"), ms);
  }

  // ====================================================================
  //  WORLD BUILDING
  // ====================================================================
  function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb6c4);
    scene.fog = new THREE.FogExp2(0xc2d2c4, 0.0055);

    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // betere kleur- en lichtkwaliteit
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    document.body.appendChild(renderer.domElement);

    // ---- light: tropische ochtendzon ----
    const hemi = new THREE.HemisphereLight(0xcfe3ec, 0x4a5a30, 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
    sun.position.set(40, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 60;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 200;
    scene.add(sun);

    buildSky();
    buildGround();
    buildSwamp();
    buildPalisade();
    buildHuts();
    buildFlag();
    buildCampfire();
    buildJungle();
    buildCannons();
    buildGroundCover();
    buildVerkenningMarkers();
    buildVillagers();
  }

  // ---- grasplukken, varens en struiken voor leven ----
  function buildGroundCover() {
    const bladeMats = [0x4e7a2e, 0x5d8a34, 0x3f6b2a].map((c) => new THREE.MeshStandardMaterial({ color: c }));
    function tuft(x, z, scale) {
      const g = new THREE.Group();
      const n = 4 + (Math.random() * 4 | 0);
      for (let i = 0; i < n; i++) {
        const h = rand(0.35, 0.8) * scale;
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale, h, 4), bladeMats[i % 3]);
        b.position.set(rand(-0.2, 0.2) * scale, h / 2, rand(-0.2, 0.2) * scale);
        b.rotation.z = rand(-0.3, 0.3); g.add(b);
      }
      g.position.set(x, 0, z); scene.add(g);
    }
    // plukken op de rits (rond de hutten) — vermijd het centrum-plein
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(6, FORT_R - 1.5);
      tuft(Math.cos(a) * r, Math.sin(a) * r, rand(0.7, 1.3));
    }
    // dichte rand net binnen de palissade
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      tuft(Math.cos(a) * (FORT_R - rand(0.5, 2)), Math.sin(a) * (FORT_R - rand(0.5, 2)), rand(0.8, 1.4));
    }
    // struiken (bollen) verspreid binnen en net buiten
    const bushMat = (h) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.27, 0.5, h) });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() > 0.5 ? rand(7, FORT_R - 3) : rand(FORT_R + 7, FORT_R + 16);
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.5, 1), 7, 6), bushMat(rand(0.22, 0.32)));
        b.position.set(rand(-0.5, 0.5), rand(0.4, 0.8), rand(-0.5, 0.5)); b.castShadow = true; g.add(b);
      }
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(g);
    }
    // wat losse boomstammen/voorraad bij het kampvuur
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3320 });
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, rand(1, 1.6), 6), woodMat);
      log.rotation.z = Math.PI / 2; log.rotation.y = rand(0, 6.28);
      log.position.set(-2.5 + rand(-2.2, 2.2), 0.13, 5.5 + rand(-1.5, 1.5)); log.castShadow = true; scene.add(log);
    }
  }

  // ---- tropische luchtkoepel met kleurverloop ----
  function buildSky() {
    const cv = document.createElement("canvas"); cv.width = 16; cv.height = 256;
    const ctx = cv.getContext("2d");
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, "#4f86b8");   // hoog: helderblauw
    grd.addColorStop(0.5, "#9fc2d6");
    grd.addColorStop(0.78, "#dfe9e2");  // wat heiig boven het moeras
    grd.addColorStop(1.0, "#cdd6b8");   // horizon: groenig dampig
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    scene.add(sky);
    scene._sky = sky;

    // een paar zachte wolken
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      const a = Math.random() * Math.PI * 2, r = rand(120, 200), h = rand(60, 110);
      for (let k = 0; k < 4; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(8, 16), 8, 6), cloudMat);
        puff.position.set(rand(-14, 14), rand(-3, 3), rand(-8, 8)); puff.scale.y = 0.55; c.add(puff);
      }
      c.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      scene.add(c);
    }
  }

  // ---- de zandrits + savanne ----
  function buildGround() {
    // grote ondergrond (moeras/savanne) groenbruin
    const groundGeo = new THREE.PlaneGeometry(500, 500, 1, 1);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x55692f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    scene.add(ground);

    // de droge zandrits waar het fort op staat
    const rits = new THREE.Mesh(
      new THREE.CircleGeometry(FORT_R + 7, 48),
      new THREE.MeshStandardMaterial({ color: 0xb79a64 })
    );
    rits.rotation.x = -Math.PI / 2; rits.position.y = 0.02; rits.receiveShadow = true;
    scene.add(rits);

    // wat onregelmatige aarde-plekken binnen het fort
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(
        new THREE.CircleGeometry(rand(1.5, 3.5), 12),
        new THREE.MeshStandardMaterial({ color: 0x8a6e42 })
      );
      p.rotation.x = -Math.PI / 2; p.position.set(rand(-FORT_R + 4, FORT_R - 4), 0.03, rand(-FORT_R + 4, FORT_R - 4));
      p.receiveShadow = true; scene.add(p);
    }
  }

  // ---- het moeras / zwamp rond het fort ----
  function buildSwamp() {
    const water = new THREE.Mesh(
      new THREE.RingGeometry(FORT_R + 6, 180, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a4a3f, transparent: true, opacity: 0.92, metalness: 0.3, roughness: 0.4 })
    );
    water.rotation.x = -Math.PI / 2; water.position.y = -0.15; water.receiveShadow = true;
    scene.add(water);
    animThings.push({ obj: water, update(dt, t) { water.material.color.setHSL(0.36, 0.25, 0.20 + Math.sin(t * 0.8) * 0.015); } });

    // graspollen in het moeras
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x6d7d3a });
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(FORT_R + 8, 90);
      const cl = new THREE.Group();
      const n = 3 + (Math.random() * 4 | 0);
      for (let k = 0; k < n; k++) {
        const h = rand(1.2, 2.6);
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 4), reedMat);
        b.position.set(rand(-0.4, 0.4), h / 2, rand(-0.4, 0.4));
        b.rotation.z = rand(-0.25, 0.25); cl.add(b);
      }
      cl.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(cl);
    }
  }

  // ---- palissade van 5 meter met schietgaten + poort ----
  function buildPalisade() {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 1 });
    const logMatDk = new THREE.MeshStandardMaterial({ color: 0x5a3d20, roughness: 1 });
    const N = 190;                         // dicht op elkaar zodat de wand massief is
    const gateA = -Math.PI / 2;           // poort op noordzijde (richting -z)
    const gateW = 0.34;                    // hoekbreedte poortopening
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // laat een gat voor de poort
      if (Math.abs(((a - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - gateW) continue;
      const x = Math.cos(a) * FORT_R, z = Math.sin(a) * FORT_R;
      const h = WALL_H + rand(-0.25, 0.45);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, h, 6), i % 2 ? logMat : logMatDk);
      log.position.set(x, h / 2, z);
      log.lookAt(0, h / 2, 0); log.rotateX(Math.PI / 2);
      log.rotation.z += rand(-0.04, 0.04);
      log.castShadow = true; log.receiveShadow = true;
      scene.add(log);
    }
    // collider-ring (we benaderen met segmenten)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      if (Math.abs(((a - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - gateW) continue;
      colliders.push({ x: Math.cos(a) * FORT_R, z: Math.sin(a) * FORT_R, r: 1.2 });
    }
    // horizontale dwarsbalken aan de buitenkant: coarser segmenten, gat bij de poort
    const M = 70;
    [WALL_H * 0.5, WALL_H * 0.82].forEach((hy) => {
      for (let i = 0; i < M; i++) {
        const a = (i / M) * Math.PI * 2;
        if (Math.abs(((a - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - gateW) continue;
        const seg = new THREE.Mesh(new THREE.BoxGeometry((Math.PI * 2 * FORT_R / M) * 1.08, 0.16, 0.16), logMatDk);
        seg.position.set(Math.cos(a) * (FORT_R + 0.42), hy, Math.sin(a) * (FORT_R + 0.42));
        seg.lookAt(0, hy, 0); scene.add(seg);
      }
    });

    // poortpalen
    [gateA - gateW, gateA + gateW].forEach((a) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, WALL_H + 1.4, 8), logMatDk);
      post.position.set(Math.cos(a) * FORT_R, (WALL_H + 1.4) / 2, Math.sin(a) * FORT_R);
      post.castShadow = true; scene.add(post);
    });
    // poortbalk bovenop
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, FORT_R * 2 * Math.sin(gateW) + 0.8), logMat);
    lintel.position.set(Math.cos(gateA) * FORT_R, WALL_H + 0.9, Math.sin(gateA) * FORT_R);
    lintel.lookAt(0, WALL_H + 0.9, 0); scene.add(lintel);

    // geschutsplatformen / loopbruggen aan binnenzijde (2 stuks)
    [-0.5, 0.5].forEach((mul) => {
      const a = mul * Math.PI;
      const plat = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 2.4), logMat);
      const px = Math.cos(a) * (FORT_R - 1.6), pz = Math.sin(a) * (FORT_R - 1.6);
      plat.position.set(px, 1.6, pz); plat.lookAt(0, 1.6, 0); plat.castShadow = true; plat.receiveShadow = true;
      scene.add(plat);
      // steunpalen tot de grond
      const right = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      [-1.4, 1.4].forEach((off) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), logMatDk);
        leg.position.set(px + right.x * off, 0.8, pz + right.z * off); leg.castShadow = true; scene.add(leg);
      });
    });
  }

  // ---- rieten/palmblad hutten (zoals diorama) ----
  function makeHut(x, z, scale = 1, rot = 0) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 1 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c7b3e, roughness: 1 });
    const w = 3.6 * scale, d = 2.8 * scale, wh = 1.8 * scale;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
    walls.position.y = wh / 2; walls.castShadow = true; walls.receiveShadow = true; g.add(walls);
    // zadeldak van palmblad
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.001, d * 0.78, wh * 1.1, 4, 1), roofMat);
    roof.rotation.y = Math.PI / 4; roof.scale.x = w / (d * 0.78) * 1.05;
    roof.position.y = wh + wh * 0.55 - 0.1; roof.castShadow = true; g.add(roof);
    // donkere deuropening
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * scale, 1.2 * scale),
      new THREE.MeshStandardMaterial({ color: 0x1a120a }));
    door.position.set(0, 0.6 * scale, d / 2 + 0.01); g.add(door);
    g.position.set(x, 0, z); g.rotation.y = rot;
    scene.add(g);
    colliders.push({ x, z, r: Math.max(w, d) * 0.55 });
    return g;
  }
  function buildHuts() {
    const spots = [
      [-9, -6, 1.1, 0.3], [-3, -10, 1, -0.2], [4, -9, 1.15, 0.5],
      [10, -4, 1, 1.2], [-11, 2, 1, 0.8], [-6, 7, 1.05, -0.4],
      [7, 6, 1, 2.4], [12, 1, 0.95, 1.9], [1, -4, 1.2, 0.1],
    ];
    spots.forEach((s) => makeHut(s[0], s[1], s[2], s[3]));
  }

  // ---- de gele vlag met zwart-witte leeuw ----
  let flagMesh;
  function buildFlag() {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
    pole.position.set(0, 4.5, 0); pole.castShadow = true; scene.add(pole);

    // vlagdoek met canvas-textuur (gele grond, zwarte rand, leeuw)
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 170;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#e9c84a"; ctx.fillRect(0, 0, 256, 170);
    ctx.lineWidth = 16; ctx.strokeStyle = "#111"; ctx.strokeRect(8, 8, 240, 154);
    // gestileerde staande leeuw (zwart/wit)
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(118, 95, 46, 26, 0, 0, Math.PI * 2); ctx.fill();        // lijf
    ctx.beginPath(); ctx.arc(160, 70, 20, 0, Math.PI * 2); ctx.fill();   // kop
    ctx.fillRect(150, 86, 12, 40); ctx.fillRect(95, 100, 10, 34);        // poten
    ctx.fillRect(120, 102, 10, 32);
    ctx.beginPath(); ctx.moveTo(72, 88); ctx.quadraticCurveTo(56, 70, 70, 60); // staart
    ctx.lineWidth = 7; ctx.strokeStyle = "#1a1a1a"; ctx.stroke();
    ctx.fillStyle = "#f4f0e6"; ctx.beginPath(); ctx.arc(168, 66, 5, 0, Math.PI*2); ctx.fill(); // wit oog/manen
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;

    const flagGeo = new THREE.PlaneGeometry(3.4, 2.2, 16, 8);
    flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    flagMesh.position.set(1.8, 7.4, 0); scene.add(flagMesh);
    flagGeo._base = flagGeo.attributes.position.array.slice();
    animThings.push({
      update(dt, t) {
        const pos = flagGeo.attributes.position, base = flagGeo._base;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3];
          const wave = Math.sin(bx * 2 + t * 6) * 0.18 * ((bx + 1.7) / 3.4);
          pos.setZ(i, wave);
        }
        pos.needsUpdate = true;
      }
    });
  }

  // ---- kampvuur met gele vlam ----
  function buildCampfire() {
    const g = new THREE.Group(); g.position.set(-2.5, 0, 4);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), ringMat);
      st.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7); g.add(st);
    }
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2a16 });
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), logMat);
      l.position.y = 0.2; l.rotation.z = Math.PI / 2; l.rotation.y = i * 0.8; g.add(l);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xffae2a, transparent: true, opacity: 0.92 }));
    flame.position.y = 0.7; g.add(flame);
    const light = new THREE.PointLight(0xff9030, 1.4, 12); light.position.y = 1; g.add(light);
    scene.add(g);
    animThings.push({ update(dt, t) {
      const s = 0.85 + Math.sin(t * 14) * 0.12 + Math.sin(t * 23) * 0.06;
      flame.scale.set(1, s, 1); flame.rotation.y = t * 2;
      light.intensity = 1.2 + Math.sin(t * 18) * 0.4;
    }});
  }

  // ---- jungle rondom (palmen + loofbomen) ----
  function makePalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, rand(6, 10), 6),
      new THREE.MeshStandardMaterial({ color: 0x6e5a38 }));
    const th = trunk.geometry.parameters.height; trunk.position.y = th / 2;
    trunk.rotation.z = rand(-0.12, 0.12); trunk.castShadow = true; g.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4), frondMat);
      fr.position.y = th; fr.rotation.z = Math.PI / 2.2; fr.rotation.y = (i / 7) * Math.PI * 2;
      fr.position.x = Math.cos((i / 7) * Math.PI * 2) * 1.4;
      fr.position.z = Math.sin((i / 7) * Math.PI * 2) * 1.4;
      fr.castShadow = true; g.add(fr);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  function makeTree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, rand(4, 7), 6),
      new THREE.MeshStandardMaterial({ color: 0x4e3a24 }));
    const th = trunk.geometry.parameters.height; trunk.position.y = th / 2; trunk.castShadow = true; g.add(trunk);
    const cm = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.28, 0.5, rand(0.22, 0.34)) });
    for (let i = 0; i < 6; i++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(rand(1.7, 2.8), 7, 6), cm);
      // lagere bollen overlappen de stam zodat de boom niet 'zweeft'
      blob.position.set(rand(-1.3, 1.3), th - 0.6 + rand(0, 1.8), rand(-1.3, 1.3));
      blob.castShadow = true; g.add(blob);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  function buildJungle() {
    // verspreide jungle in het moeras
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(FORT_R + 9, 150);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      Math.random() > 0.45 ? makePalm(x, z) : makeTree(x, z);
    }
    // dichte boomwand aan de horizon (zoals het diorama)
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + rand(-0.05, 0.05), r = rand(95, 120);
      makeTree(Math.cos(a) * r, Math.sin(a) * r);
    }
    // een paar bomen binnen het fort
    for (let i = 0; i < 4; i++) makeTree(rand(-FORT_R + 6, FORT_R - 6), rand(-FORT_R + 6, FORT_R - 6));
  }

  // ---- twee draaibassen (rotating cannons) ----
  function buildCannons() {
    [-0.5, 0.5].forEach((mul) => {
      const a = mul * Math.PI;
      const px = Math.cos(a) * (FORT_R - 2.2), pz = Math.sin(a) * (FORT_R - 2.2);
      const g = new THREE.Group(); g.position.set(px, 1.9, pz);
      const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x222 })); yoke.position.y = -0.6; g.add(yoke);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.8, 10),
        new THREE.MeshStandardMaterial({ color: 0x33373b, metalness: 0.7, roughness: 0.4 }));
      barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.5; g.add(barrel);
      g.lookAt(0, 1.9, 0); g.rotateY(Math.PI);
      scene.add(g);
      cannons.push({ x: px, z: pz, group: g, cool: 0 });
    });
  }

  // ====================================================================
  //  PEOPLE (villagers + soldiers) — simpele lowpoly figuren
  // ====================================================================
  function makePerson(opts = {}) {
    const g = new THREE.Group();
    const skin = opts.skin || 0x4a2f1c;
    const cloth = opts.cloth ?? 0x9a7b3a;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: cloth }));
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: skin }));
    head.position.y = 1.5; head.castShadow = true; g.add(head);
    // armen
    const armMat = new THREE.MeshStandardMaterial({ color: skin });
    const la = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), armMat);
    la.position.set(-0.28, 0.95, 0); la.rotation.z = 0.25; g.add(la);
    const ra = la.clone(); ra.position.x = 0.28; ra.rotation.z = -0.25; g.add(ra);
    if (opts.hat) { // rode muts van de Zwarte Jagers (Redi Musu)
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 8),
        new THREE.MeshStandardMaterial({ color: 0xc0291f }));
      hat.position.y = 1.7; g.add(hat);
    }
    if (opts.musket) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a1d10 }));
      m.position.set(0.32, 1.0, 0.25); m.rotation.x = Math.PI / 2.3; g.add(m);
    }
    return g;
  }

  let villagers = [];
  function buildVillagers() {
    const spots = [[-2.5, 5.2], [0, 5.5], [-4, 4.5], [3, -3], [-6, -3], [8, 0], [-9, 4]];
    spots.forEach((s, i) => {
      const v = makePerson({ cloth: [0xb59a4a, 0x8a6a3a, 0xa85a3a, 0xcaa24a][i % 4] });
      v.position.set(s[0], 0, s[1]); v.rotation.y = rand(0, 6.28);
      scene.add(v); villagers.push({ obj: v, ph: rand(0, 6.28) });
    });
    animThings.push({ update(dt, t) {
      villagers.forEach((v) => { v.obj.position.y = Math.abs(Math.sin(t * 2 + v.ph)) * 0.04; });
    }});
  }

  // ====================================================================
  //  VERKENNING — info markers
  // ====================================================================
  function buildVerkenningMarkers() {
    const data = [
      { x: 1.8, z: 1.5, title: "De vlag van Boekoe",
        text: "Boven het fort wapperde een <b>gele vlag met een zwart-witte leeuw</b> en een zwarte rand — het teken van een vrij volk dat zichzelf bestuurde." },
      { x: -2.5, z: 4, title: "Het kampvuur",
        text: "Rond het vuur deelden de Marrons voedsel, verhalen en de <b>Anansi-tori</b>. Velen waren hier geboren in vrijheid, kinderen van wie ontsnapten aan de plantages." },
      { x: 0, z: -9, title: "De hutten",
        text: "Daken van palmblad, wanden van leem en hout. In september 1771 woonden hier zo'n <b>83 mensen</b>: 50 mannen, 24 vrouwen en 9 kinderen." },
      { x: Math.cos(-Math.PI/2)*(FORT_R-3), z: Math.sin(-Math.PI/2)*(FORT_R-3), title: "De palissade",
        text: "Een muur van palen van <b>vijf meter hoog</b>, met schietgaten. Eromheen lag het moeras, en de paden ernaartoe lagen deels <b>onder water verborgen</b>." },
      { x: Math.cos(0.5*Math.PI)*(FORT_R-3.5), z: Math.sin(0.5*Math.PI)*(FORT_R-3.5), title: "De draaibas",
        text: "Twee kleine <b>draaibassen</b> (zwenkkanonnen) bestreken het moeras. Buitgemaakt op de kolonisten — gekeerd tegen hun voormalige meesters." },
    ];
    data.forEach((d) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xe9c84a }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.1, d.z); scene.add(ring);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4, 12),
        new THREE.MeshBasicMaterial({ color: 0xe9c84a, transparent: true, opacity: 0.10 }));
      col.position.set(d.x, 2, d.z); scene.add(col);
      markers.push({ x: d.x, z: d.z, title: d.title, text: d.text, seen: false, ring, col });
    });
  }

  // ====================================================================
  //  SIEGE LOGIC
  // ====================================================================
  function spawnEnemy() {
    // komen door het moeras aan de zuidzijde (z+)
    const a = rand(0.15, Math.PI - 0.15);
    const r = rand(FORT_R + 30, FORT_R + 55);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = makePerson({ skin: 0x4a2f1c, cloth: 0x3a4636, hat: true, musket: true });
    g.position.set(x, 0, z);
    scene.add(g);
    enemies.push({
      obj: g, hp: 1, x, z,
      state: "advance", t: 0, fireCd: rand(1.5, 3.5),
      target: FORT_R + rand(1.5, 3.5),  // stoppen net buiten de muur
      ph: rand(0, 6.28), dead: false,
    });
  }

  function startSiege() {
    phase = PHASE.BELEGERING;
    phaseLabel.textContent = "Belegering";
    setPhaseUI(PHASE.BELEGERING);
    scene.background = new THREE.Color(0x8a8276);
    scene.fog.color.set(0x9a8f7e);
    scene.fog.density = 0.011;
    if (scene._sky) scene._sky.material.color.set(0x8f8a7a); // grimmiger licht
    // markers weghalen
    markers.forEach((m) => { scene.remove(m.ring); scene.remove(m.col); });
    markers.length = 0;
    // dorpelingen "geëvacueerd"
    villagers.forEach((v) => scene.remove(v.obj)); villagers.length = 0;
    // speler centraal achter de zuidmuur
    player.pos.set(0, PLAYER_H, FORT_R - 6); yaw = Math.PI / 2; pitch = -0.05;
    escapeTime = escapeTotal; waveTimer = 0; spawnedTotal = 0;
    health = 100; morale = 100;
    ammo = maxAmmo = 1; reloading = false;
    setObjective("Houd de palissade — geef Boni tijd om te ontkomen. Vlucht voltooid over " + Math.ceil(escapeTime) + "s");
    toast("De Zwarte Jagers naderen door het moeras vanuit het zuiden!", 5000);
    startAmbient();
    for (let i = 0; i < 4; i++) spawnEnemy();
  }

  function updateSiege(dt, t) {
    escapeTime -= dt;
    waveTimer -= dt;

    // spawn-tempo loopt op
    if (waveTimer <= 0 && enemies.length < 18) {
      const batch = 1 + Math.floor((escapeTotal - escapeTime) / 35);
      for (let i = 0; i < batch; i++) spawnEnemy();
      waveTimer = Math.max(2.2, 6 - (escapeTotal - escapeTime) / 30);
      spawnedTotal += batch;
    }

    let atWall = 0;
    for (const e of enemies) {
      if (e.dead) { e.t += dt; e.obj.rotation.x = Math.min(Math.PI / 2, e.obj.rotation.x + dt * 4); continue; }
      e.t += dt;
      const dist = Math.hypot(e.x, e.z);
      // loopanimatie
      e.obj.position.y = Math.abs(Math.sin(t * 6 + e.ph)) * 0.06;
      if (dist > e.target) {
        const ang = Math.atan2(-e.z, -e.x);
        const sp = 2.6 * dt;
        e.x += Math.cos(ang) * sp; e.z += Math.sin(ang) * sp;
        e.obj.position.set(e.x, e.obj.position.y, e.z);
        e.obj.rotation.y = -ang + Math.PI / 2;
      } else {
        atWall++;
        // bij de muur: vuur op de speler / verlaag moraal
        e.fireCd -= dt;
        const face = Math.atan2(player.pos.z - e.z, player.pos.x - e.x);
        e.obj.rotation.y = -face + Math.PI / 2;
        if (e.fireCd <= 0) {
          e.fireCd = rand(2.2, 4.2);
          enemyFire(e);
        }
      }
    }
    // moraal daalt naarmate er meer vijanden de muur bereiken
    if (atWall > 0) {
      morale -= atWall * 1.6 * dt;
      damageFlash(Math.min(0.25, atWall * 0.05));
    }
    morale = Math.max(0, morale);

    // opruimen dode lichamen na tijd
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead && e.t > 6) { scene.remove(e.obj); enemies.splice(i, 1); }
    }

    // cannon cooldown
    cannons.forEach((c) => { if (c.cool > 0) c.cool -= dt; });

    // HUD
    const secs = Math.max(0, Math.ceil(escapeTime));
    setObjective("Houd de palissade — Boni's vlucht voltooid over <b>" + secs + "s</b>");

    // win/lose
    if (escapeTime <= 0) return endGame(true);
    if (health <= 0) return endGame(false, "gevallen");
    if (morale <= 0) return endGame(false, "moraal");
  }

  function enemyFire(e) {
    gunshot(false);
    // tracer
    const from = new THREE.Vector3(e.x, 1.3, e.z);
    const to = new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7 }));
    scene.add(line); bullets.push({ obj: line, life: 0.12 });
    // kans op treffer (musket = onnauwkeurig)
    if (Math.random() < 0.32) {
      const dmg = rand(6, 13);
      health = Math.max(0, health - dmg);
      damageFlash(0.6); thud();
    }
  }

  function damageFlash(intensity) {
    damageEl.style.boxShadow = "inset 0 0 220px 60px rgba(160,0,0," + intensity + ")";
    clearTimeout(damageFlash._t);
    damageFlash._t = setTimeout(() => (damageEl.style.boxShadow = "inset 0 0 220px 40px rgba(160,0,0,0)"), 130);
  }

  // ====================================================================
  //  SHOOTING (player)
  // ====================================================================
  const raycaster = new THREE.Raycaster();
  function shoot() {
    if (phase !== PHASE.BELEGERING) return;
    if (reloading || ammo <= 0) { if (ammo <= 0 && !reloading) reload(); return; }
    ammo--;
    updateAmmo();
    audioInit(); gunshot(nearCannon != null);
    muzzleFlash();

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.set(camera.position, dir);
    const meshes = [];
    enemies.forEach((e) => { if (!e.dead) { e.obj.traverse((o) => { if (o.isMesh) { o._enemy = e; meshes.push(o); } }); } });
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const e = hits[0].object._enemy;
      if (e && !e.dead) killEnemy(e);
    }
    // draaibas: dichtbij kanon = zwaar schot dat meerdere raakt
    if (nearCannon) {
      nearCannon.cool = 4;
      const center = hits.length ? hits[0].point : camera.position.clone().add(dir.multiplyScalar(40));
      enemies.forEach((e) => {
        if (!e.dead && Math.hypot(e.x - center.x, e.z - center.z) < 5) killEnemy(e);
      });
      toast("Draaibas afgevuurd! 💥", 1500);
      ammo = maxAmmo; updateAmmo(); // kanon herlaadt los van musket
    } else {
      reload();
    }
  }
  function killEnemy(e) {
    e.dead = true; e.t = 0;
    morale = Math.min(100, morale + 1.2);
    e.obj.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.offsetHSL(0, -0.3, -0.1); } });
  }
  let muzzle;
  function muzzleFlash() {
    if (!muzzle) {
      muzzle = new THREE.PointLight(0xffd070, 0, 14);
      scene.add(muzzle);
    }
    muzzle.position.copy(camera.position);
    muzzle.intensity = 3;
    setTimeout(() => { if (muzzle) muzzle.intensity = 0; }, 60);
  }
  function reload() {
    if (reloading || phase !== PHASE.BELEGERING) return;
    reloading = true; ammoText.textContent = "herladen…";
    // voorlaadmusket: traag (historisch ~15-20s, hier gecomprimeerd)
    setTimeout(() => { ammo = maxAmmo; reloading = false; updateAmmo(); }, 1900);
  }
  function updateAmmo() {
    ammoText.textContent = reloading ? "herladen…" : ammo + " / " + maxAmmo;
  }

  // ====================================================================
  //  PLAYER MOVEMENT + COLLISION
  // ====================================================================
  function updatePlayer(dt) {
    const speed = (keys["shift"] ? 7.2 : 4.2) * dt;
    // werkelijke kijkrichting (horizontaal) en rechtervector
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3();
    if (keys["w"]) move.add(forward);
    if (keys["s"]) move.sub(forward);
    if (keys["d"]) move.add(right);
    if (keys["a"]) move.sub(right);
    if (touchMove.lengthSq() > 0.001) {
      move.add(forward.clone().multiplyScalar(touchMove.y));
      move.add(right.clone().multiplyScalar(touchMove.x));
    }
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    let nx = player.pos.x + move.x, nz = player.pos.z + move.z;

    // collision met palen/hutten
    for (const c of colliders) {
      const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz);
      if (d < c.r) {
        const push = (c.r - d) / (d || 1);
        nx += dx * push; nz += dz * push;
      }
    }
    // tijdens belegering: binnen het fort blijven
    if (phase === PHASE.BELEGERING) {
      const rr = Math.hypot(nx, nz);
      if (rr > FORT_R - 1.5) { nx = nx / rr * (FORT_R - 1.5); nz = nz / rr * (FORT_R - 1.5); }
    } else {
      // verkenning: niet te ver buiten de rits dwalen
      const rr = Math.hypot(nx, nz);
      if (rr > FORT_R + 5) { nx = nx / rr * (FORT_R + 5); nz = nz / rr * (FORT_R + 5); }
    }

    player.pos.x = nx; player.pos.z = nz;
    // licht hoofdwiebelen
    const bob = move.lengthSq() > 0 ? Math.sin(performance.now() * 0.012) * 0.04 : 0;
    camera.position.set(player.pos.x, PLAYER_H + bob, player.pos.z);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  // ---- interactie / nabijheid ----
  function updateProximity() {
    // markers (verkenning)
    nearMarker = null;
    if (phase === PHASE.VERKENNING) {
      let allSeen = true;
      for (const m of markers) {
        const d = Math.hypot(player.pos.x - m.x, player.pos.z - m.z);
        if (d < 2.2 && !nearMarker) nearMarker = m;
        if (!m.seen) allSeen = false;
        m.ring.rotation.z += 0.01;
      }
      const act = isTouch ? "<b>BEKIJK</b>" : "<b>E</b>";
      if (nearMarker) showPrompt(act + " — bekijk: " + nearMarker.title);
      else if (allSeen && markers.length) showPrompt((isTouch ? "<b>BEKIJK</b>" : "<b>F</b>") + " — start de belegering van 1772");
      else hidePrompt();
    }
    // draaibas (belegering)
    if (phase === PHASE.BELEGERING) {
      nearCannon = null;
      for (const c of cannons) {
        const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
        if (d < 3) nearCannon = c;
      }
      if (nearCannon && nearCannon.cool <= 0) showPrompt("<b>Draaibas gereed</b> — klik voor een zwaar schot");
      else if (nearCannon) showPrompt("Draaibas herlaadt…");
      else hidePrompt();
    }
  }
  function showPrompt(html) { promptEl.innerHTML = html; promptEl.style.display = "block"; }
  function hidePrompt() { promptEl.style.display = "none"; }

  function interact() {
    if (phase === PHASE.VERKENNING) {
      if (nearMarker && !nearMarker.seen) {
        nearMarker.seen = true;
        nearMarker.ring.material.color.set(0x6b8a3a);
        toast("<b style='color:#e9c84a'>" + nearMarker.title + "</b><br>" + nearMarker.text, 6500);
        const left = markers.filter((m) => !m.seen).length;
        if (left === 0) setObjective("Alles bekeken. Druk op <b>F</b> om de belegering te starten.");
        else setObjective("Verken het fort — nog <b>" + left + "</b> plek(ken) te bekijken.");
      }
    }
  }

  // ====================================================================
  //  HUD / OBJECTIVE
  // ====================================================================
  function setObjective(html) { objText.innerHTML = html; }
  function updateHUD() {
    healthNum.textContent = Math.round(health);
    healthFill.style.width = health + "%";
    moraleNum.textContent = Math.round(morale);
    moraleFill.style.width = morale + "%";
    // kompas
    let deg = (yaw * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
    const dirs = ["Z", "ZW", "W", "NW", "N", "NO", "O", "ZO"];
    compassDir.textContent = dirs[Math.round(deg / 45) % 8];
  }

  // ====================================================================
  //  END SCREENS
  // ====================================================================
  function endGame(won, reason) {
    if (phase === PHASE.EINDE) return;
    phase = PHASE.EINDE;
    exitPointerLock(); showTouch(false);
    hud.style.display = "none";
    const card = $("endCard");
    if (won) {
      card.innerHTML = `
        <div class="flagmark">🦁</div>
        <h1 style="font-size:42px">BONI ONTKOMEN<small>20 SEPTEMBER 1772</small></h1>
        <p class="lead">De Zwarte Jagers braken in een half uur door de palissade. Het fort viel —
        maar langs de verborgen waterpaden ontkwamen <b>Boni</b> en zijn leiders, en de
        vrouwen en kinderen waren al veilig in <b>Locusboom</b>.</p>
        <p class="quote">De kolonisten maakten Boekoe met de grond gelijk: tot stof, zoals
        Boni het had genoemd. Maar het verzet ging door tot 1776, toen hij de Marowijne
        overstak naar Frans-Guyana. Zijn nakomelingen — de <b>Aluku</b> — leven daar nog.</p>
        <p class="lead" style="font-size:15px;color:#cdbb88">Een gebouw werd gesloopt, een volk niet.
        De <i>Memre Boekoe</i>-kazerne in Paramaribo draagt vandaag die herinnering.</p>
        <button class="cta" id="btnAgain">Opnieuw spelen</button>`;
    } else {
      const msg = reason === "moraal"
        ? "De linie aan de palissade brak; de verdedigers werden onder de voet gelopen."
        : "Je viel bij de palissade, musket nog in de hand.";
      card.innerHTML = `
        <h1 style="font-size:40px">DE LINIE BRAK<small>FORT BOEKOE</small></h1>
        <p class="lead">${msg}</p>
        <p class="quote">In werkelijkheid hielden de verdedigers nét lang genoeg stand: Boni
        en de zijnen wisten te ontkomen voordat het fort viel. Probeer het opnieuw — geef
        ze die tijd.</p>
        <button class="cta" id="btnAgain">Opnieuw proberen</button>`;
    }
    $("endScreen").style.display = "flex";
    $("btnAgain").onclick = () => location.reload();
  }

  // ====================================================================
  //  INPUT
  // ====================================================================
  function setupInput() {
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === "e") interact();
      if (k === "r") reload();
      if (k === "f" && phase === PHASE.VERKENNING && markers.length && markers.every((m) => m.seen)) {
        beginSiegeFromBrief();
      }
    });
    addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

    renderer.domElement.addEventListener("click", () => {
      if (isTouch) return;
      if (!pointerLocked) { renderer.domElement.requestPointerLock(); return; }
      shoot();
    });
    document.addEventListener("pointerlockchange", () => {
      pointerLocked = document.pointerLockElement === renderer.domElement;
    });
    document.addEventListener("mousemove", (e) => {
      if (!pointerLocked) return;
      yaw -= e.movementX * 0.0022;
      pitch -= e.movementY * 0.0022;
      pitch = Math.max(-1.3, Math.min(1.3, pitch));
    });
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }
  function exitPointerLock() { if (document.exitPointerLock) document.exitPointerLock(); }
  function lockPointer() { if (!isTouch) renderer.domElement.requestPointerLock(); }
  function showTouch(on) { if (isTouch) $("touch").classList.toggle("on", on); }

  // Toon gevecht-UI (richtkruis, munitie, vuur/herlaad) pas in de belegering
  function setPhaseUI(p) {
    const siege = p === PHASE.BELEGERING;
    $("stats").style.display = siege ? "block" : "none";
    $("crosshair").style.display = siege ? "block" : "none";
    if (isTouch) {
      $("btnFire").style.display = siege ? "flex" : "none";
      $("btnReload").style.display = siege ? "flex" : "none";
      $("btnAct").style.display = siege ? "none" : "flex";
    }
  }

  // ---- Touch controls (mobiel) ----
  function setupTouch() {
    if (!isTouch) return;
    const joy = $("joy"), stick = $("joyStick"), look = $("lookZone");
    let joyId = null, joyCx = 0, joyCy = 0;
    const R = 52;

    joy.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
      moveStick(t);
    }, { passive: false });
    joy.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) moveStick(t);
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) if (t.identifier === joyId) {
        joyId = null; touchMove.set(0, 0); stick.style.transform = "translate(0,0)";
      }
    };
    joy.addEventListener("touchend", endJoy);
    joy.addEventListener("touchcancel", endJoy);
    function moveStick(t) {
      let dx = t.clientX - joyCx, dy = t.clientY - joyCy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      stick.style.transform = `translate(${dx}px,${dy}px)`;
      // omhoog = vooruit (richting blik), rechts = naar rechts strafen
      touchMove.set(dx / R, -dy / R);
    }

    // kijken: sleep in de rechterzone
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: false });
    look.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        yaw -= (t.clientX - lx) * 0.005;
        pitch -= (t.clientY - ly) * 0.005;
        pitch = Math.max(-1.3, Math.min(1.3, pitch));
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    look.addEventListener("touchend", endLook);
    look.addEventListener("touchcancel", endLook);

    const tap = (id, fn) => {
      const el = $(id);
      el.addEventListener("touchstart", (e) => { e.preventDefault(); audioInit(); fn(); }, { passive: false });
    };
    tap("btnFire", () => shoot());
    tap("btnReload", () => reload());
    tap("btnAct", () => {
      if (phase === PHASE.VERKENNING) {
        if (nearMarker && !nearMarker.seen) interact();
        else if (markers.length && markers.every((m) => m.seen)) beginSiegeFromBrief();
      }
    });
  }

  // ====================================================================
  //  FLOW
  // ====================================================================
  function beginVerkenning() {
    $("titleScreen").style.display = "none";
    hud.style.display = "block";
    phase = PHASE.VERKENNING;
    phaseLabel.textContent = "Verkenning";
    setPhaseUI(PHASE.VERKENNING);
    setObjective("Verken Fort Boekoe — loop naar de <b>gouden ringen</b> en bekijk ze (E).");
    audioInit(); startAmbient();
    player.pos.set(0, PLAYER_H, 10); yaw = Math.PI;
    lockPointer(); showTouch(true);
    toast(isTouch
      ? "Welkom in Fort Boekoe, 1771. Sleep rechts om te kijken, gebruik de joystick om te lopen."
      : "Welkom in Fort Boekoe, 1771. Loop rond en ontdek hoe het hier was.", 6500);
  }
  function beginSiegeFromBrief() {
    exitPointerLock(); showTouch(false);
    hud.style.display = "none";
    $("briefScreen").style.display = "flex";
  }

  // ====================================================================
  //  MAIN LOOP
  // ====================================================================
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    animThings.forEach((a) => a.update(dt, t));

    // tracers opruimen
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].life -= dt;
      if (bullets[i].life <= 0) { scene.remove(bullets[i].obj); bullets.splice(i, 1); }
    }

    if (phase === PHASE.VERKENNING || phase === PHASE.BELEGERING) {
      updatePlayer(dt);
      updateProximity();
      updateHUD();
    }
    if (phase === PHASE.BELEGERING) updateSiege(dt, t);

    renderer.render(scene, camera);
  }

  // ====================================================================
  //  BOOT
  // ====================================================================
  function init() {
    clock = new THREE.Clock();
    buildWorld();
    setupInput();
    setupTouch();
    camera.position.set(player.pos.x, PLAYER_H, player.pos.z);
    camera.rotation.set(0, Math.PI, 0, "YXZ");
    $("loading").style.display = "none";
    $("titleScreen").style.display = "flex";
    animate();

    $("btnStart").onclick = beginVerkenning;
    $("btnSiege").onclick = () => { $("briefScreen").style.display = "none"; hud.style.display = "block"; startSiege(); lockPointer(); showTouch(true); };
  }

  if (typeof THREE === "undefined") {
    $("loading").innerHTML = "<div style='max-width:420px;text-align:center;padding:20px'>Kon de 3D-bibliotheek (Three.js) niet laden.<br><br>Open dit spel met een internetverbinding, of host de map met een lokale webserver.</div>";
  } else {
    init();
  }
})();
