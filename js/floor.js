// floor.js (HQ) — High-quality chips: sRGB + ACES tone mapping, soft shadows,
// anisotropic mipmapped textures, pixel-accurate DOM→world mapping.
// Works with your current Baccarat.html / baccarat_script.js.
//
// Drop-in replacement. No other code changes required.
// If #chip-overlay is missing in HTML, this script will create it under .game-table.
//
// Notes:
// - Keep running over http(s), not file:// (browser security). 
// - Chips are cleared when #gameHistory receives a new item (intended behavior).

window.addEventListener('DOMContentLoaded', () => {
  // ---------- Globals ----------
  let scene, camera, renderer, world;
  const demo = []; // [{mesh, body}]
  let overlay = document.getElementById('chip-overlay');

  // Create overlay div inside the table if missing (pixel-perfect layer)
  if (!overlay) {
    const gameTable = document.querySelector('.game-table');
    if (gameTable) {
      overlay = document.createElement('div');
      overlay.id = 'chip-overlay';
      Object.assign(overlay.style, {
        position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none'
      });
      gameTable.appendChild(overlay);
    }
  }
  if (!overlay) {
    console.error('[chips] Cannot find or create #chip-overlay. Check HTML structure.');
    return;
  }

  // Global app namespace (keep your fields)
  window.app = window.app || {};
  app.gamePlay = app.gamePlay || { spining: false, currentBetValue: 100 };
  app.currentBets = app.currentBets || {};
  app.stacks = {}; // betType -> { count, basePx:{x,y}, baseWorld:{x,y,z} }

  // ---------- Three / Cannon / Textures ----------
  let overlayW = 1, overlayH = 1;
  let floorMesh = null;
  let keyLight = null;

  const texLoader = new THREE.TextureLoader();
  const chipTex = {
    white:  texLoader.load('images/white_chip.png'),
    cyan:   texLoader.load('images/cyan_chip.png'),
    red:    texLoader.load('images/red_chip.png'),
    yellow: texLoader.load('images/yellow_chip.png'),
    blue:   texLoader.load('images/blue_chip.png'),
    green:  texLoader.load('images/green_chip.png'),
    black:  texLoader.load('images/black_chip.png'),
    purple: texLoader.load('images/purple_chip.png'),
    brown:  texLoader.load('images/brown_chip.png'),
  };
  const unitToTexKey  = { 1:'white', 5:'cyan', 10:'red', 50:'yellow', 100:'blue', 500:'green', 1000:'black', 5000:'purple', 10000:'brown' };
  const unitToImgPath = { 1:'images/white_chip.png', 5:'images/cyan_chip.png', 10:'images/red_chip.png', 50:'images/yellow_chip.png', 100:'images/blue_chip.png', 500:'images/green_chip.png', 1000:'images/black_chip.png', 5000:'images/purple_chip.png', 10000:'images/brown_chip.png' };

  function setupTextureQuality() {
    // After renderer is available, apply mipmap + anisotropy
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    Object.values(chipTex).forEach(t => {
      t.encoding = THREE.sRGBEncoding;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = maxAniso;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    });
  }

  function setupThree() {
    scene = new THREE.Scene();
    scene.background = null;

    // Pixel size from overlay
    const r = overlay.getBoundingClientRect();
    overlayW = Math.max(1, Math.floor(r.width));
    overlayH = Math.max(1, Math.floor(r.height));

    // Ortho camera in pixel units (XY plane at z=0)
    camera = new THREE.OrthographicCamera(-overlayW/2, overlayW/2, overlayH/2, -overlayH/2, 0.1, 2000);
    camera.position.set(0, 0, 400);
    camera.lookAt(0, 0, 0);

    // Renderer (HQ)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(overlayW, overlayH, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';

    // Color management & tone mapping
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Soft shadow
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = true;

    overlay.innerHTML = '';
    overlay.appendChild(renderer.domElement);

    setupTextureQuality();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(overlayW * 0.25, overlayH * 0.35, 600);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left   = -overlayW/2;
    keyLight.shadow.camera.right  =  overlayW/2;
    keyLight.shadow.camera.top    =  overlayH/2;
    keyLight.shadow.camera.bottom = -overlayH/2;
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far  = 1200;
    scene.add(keyLight);

    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-overlayW * 0.2, -overlayH * 0.2, 400);
    scene.add(fill);

    // Shadow receiver floor (fully transparent color, but shows soft shadow)
    if (floorMesh) scene.remove(floorMesh);
    const floorGeo = new THREE.PlaneGeometry(overlayW, overlayH);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    floorMat.transparent = true;
    floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    floorMesh.position.set(0, 0, 0);
    floorMesh.renderOrder = 0;
    scene.add(floorMesh);
  }

  function setupCannon() {
    world = new CANNON.World();
    world.gravity.set(0, 0, 0); // static chips
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;

    // Static plane (not strictly necessary but kept for structure)
    const groundMat = new CANNON.Material('ground');
    const floorBody = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Plane() });
    world.addBody(floorBody);
  }

  // ---------- DOM → World mapping ----------
  function getButtonCenterPx(el) {
    const b = el.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    return { x: (b.left + b.right)/2 - o.left, y: (b.top + b.bottom)/2 - o.top };
  }
  function pxToWorld(px) { return { x: px.x - overlayW/2, y: overlayH/2 - px.y }; }

  const betButtons = Array.from(document.querySelectorAll('.betting-button')); // has data-area per HTML
  function recomputeStackBases() {
    betButtons.forEach(btn => {
      const type = btn.getAttribute('data-area');
      if (!type) return;
      const centerPx = getButtonCenterPx(btn);
      const w = pxToWorld(centerPx);
      if (!app.stacks[type]) app.stacks[type] = { count: 0, basePx: centerPx, baseWorld: { x: w.x, y: w.y, z: 0 } };
      else { app.stacks[type].basePx = centerPx; app.stacks[type].baseWorld = { x: w.x, y: w.y, z: 0 }; }
    });
  }

  // ---------- Chip creation (HQ material) ----------
  const CHIP_RADIUS = 22;   // px
  const CHIP_THICK  = 7;    // px
  const OFFSET_RNG  = 2;    // px jitter on x/y for natural stacking

  function makeChipMaterial(tex) {
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide
    });
  }

  function addChip(betType) {
    if (app.gamePlay.spining) return;

    const unit = app.gamePlay.currentBetValue;
    const texKey = unitToTexKey[unit];
    const tex = chipTex[texKey];
    if (!tex) { console.warn('[chips] missing texture for unit', unit); return; }

    if (!app.stacks[betType]) { recomputeStackBases(); if (!app.stacks[betType]) return; }
    const stack = app.stacks[betType];

    const jitterX = (Math.random()*2-1) * OFFSET_RNG;
    const jitterY = (Math.random()*2-1) * OFFSET_RNG;

    const px = { x: stack.baseWorld.x + jitterX, y: stack.baseWorld.y + jitterY };
    const z  = stack.count * CHIP_THICK + CHIP_THICK/2;

    // High-res cylinder with caps; rotate so caps face camera
    const geo = new THREE.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_THICK, 128, 1, false);
    const mat = makeChipMaterial(tex);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(px.x, px.y, z);
    mesh.castShadow = true; // shadow onto transparent floor
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    scene.add(mesh);

    // Static body (no dynamics — keeps stack crisp & jitter-free)
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(CHIP_RADIUS, CHIP_RADIUS, CHIP_THICK/2)),
      position: new CANNON.Vec3(px.x, px.y, z)
    });
    world.addBody(body);

    demo.push({ mesh, body });

    app.currentBets[betType] = (app.currentBets[betType] || 0) + unit;
    stack.count += 1;
  }

  // ---------- Animate ----------
  function animate() {
    requestAnimationFrame(animate);
    world.step(1/60);
    for (const {mesh, body} of demo) {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
    }
    renderer.render(scene, camera);
  }

  // ---------- Clear on result ----------
  const gameHistoryList = document.getElementById('gameHistory');
  if (gameHistoryList) {
    const obs = new MutationObserver((ml) => {
      for (const m of ml) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          // Clear current stacks
          while (demo.length) {
            const {mesh, body} = demo.pop();
            scene.remove(mesh);
            world.removeBody(body);
          }
          Object.keys(app.stacks).forEach(k => app.stacks[k].count = 0);
        }
      }
    });
    obs.observe(gameHistoryList, { childList: true });
  }

  // ---------- Wire events ----------
  document.querySelectorAll('.betting-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-area');
      addChip(type);
    });
  });
  document.querySelectorAll('.betting-unit').forEach(button => {
    button.addEventListener('click', () => {
      const unit = Number(button.getAttribute('data-unit'));
      app.gamePlay.currentBetValue = unit;
      const el = document.getElementById('betting-chip');
      if (el) el.innerHTML = `<img src="${unitToImgPath[unit]}" alt="Bet Chip" style="width:50px;height:50px;">`;
      document.querySelectorAll('.betting-unit').forEach(b=>b.classList.remove('active'));
      button.classList.add('active');
    });
  });

  // ---------- Resize-safe (pixel-perfect) ----------
  const resizeAll = () => {
    // Rebuild renderer/camera/floor/shadows to match new pixel size
    // (dispose old renderer silently via DOM replacement)
    setupThree();
    recomputeStackBases();
  };
  const ro = new ResizeObserver(resizeAll);
  ro.observe(overlay);
  window.addEventListener('resize', resizeAll);

  // ---------- Boot ----------
  setupThree();
  setupCannon();
  recomputeStackBases();
  animate();
});
