// js/chip.js 

// 기본 변수 설정
let scene, camera, renderer, world, demo = [];
let app = {
  gamePlay: {
    spining: false
  },
  GLTFLoader: new THREE.GLTFLoader(),
  currentBets: {},
  stacks: {}, // 베팅 유형별 스택 정보 저장
  chipValues: {
    "black_chip": 1000, // 검은색 칩 = 1000달러
    "blue_chip": 100,    // 파란색 칩 = 100달러
    "red_chip": 10       // 빨간색 칩 = 10달러
  },
  totalAmount: 0, // 총 베팅 금액
  currentBalance: 10000 // 초기 잔액 설정
};

// 텍스처 로더 초기화
const textureLoader = new THREE.TextureLoader();
const chipTextures = {
  "red_chip": textureLoader.load('../images/red_chip.png'),       // 빨간색 칩
  "black_chip": textureLoader.load('../images/black_chip.png'),   // 검은색 칩
  "blue_chip": textureLoader.load('../images/blue_chip.png')      // 파란색 칩
};

// 텍스처 설정 (투명도 지원)
for (let key in chipTextures) {
  chipTextures[key].encoding = THREE.sRGBEncoding;
  chipTextures[key].wrapS = THREE.ClampToEdgeWrapping;
  chipTextures[key].wrapT = THREE.ClampToEdgeWrapping;
  chipTextures[key].repeat.set(1, 1);
}

// 베팅 유형별 스택의 기본 위치 정의
const stackBasePositions = {
  "player": new THREE.Vector3(-0.05, 0, 0.05),
  "banker": new THREE.Vector3(0.05, 0, 0.05),
  "tie": new THREE.Vector3(0, 0, -0.05),
  "player-pair": new THREE.Vector3(-0.05, 0, -0.05),
  "banker-pair": new THREE.Vector3(0.05, 0, -0.05)
};

// 3D 씬 초기화
function initThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202020);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.01, // 근접 클리핑을 줄임
    1000
  );
  camera.position.set(0, 0.1, 0.3); // 칩이 화면 중앙에 적절히 보이도록 위치 조정
  camera.lookAt(new THREE.Vector3(0, 0, 0)); // 카메라가 칩을 바라보도록 설정

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // 그림자 설정
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 조명 추가
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // 바닥 생성
  const floorGeometry = new THREE.PlaneGeometry(1, 1); // 스케일을 줄임
  const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

// 물리 엔진 초기화
function initCannonJS() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;

  // 바닥과 칩에 적용할 마찰력과 바운스 설정
  const groundMaterial = new CANNON.Material('groundMaterial');
  const chipMaterial = new CANNON.Material('chipMaterial');

  // 마찰력 설정
  const contactMaterial = new CANNON.ContactMaterial(groundMaterial, chipMaterial, {
    friction: 1.7, // 마찰력 증가 (칩이 잘 안 굴러가게 만듦)
    restitution: 0.9 // 반발력 감소 (칩이 튕기지 않게)
  });
  world.addContactMaterial(contactMaterial);

  // 바닥 물리 바디 추가
  const floorBody = new CANNON.Body({
    mass: 0, // 고정
    shape: new CANNON.Plane(),
    material: groundMaterial // 바닥에 마찰력 적용
  });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);
}

/**
 * 베팅 유형별 핸들러 객체
 */
const betTypeHandlers = {
  "player": function (chipColor) {
    console.log(`Player bets on Player with ${chipColor}`);
    const chipValue = app.chipValues[chipColor];
    app.currentBets.player = (app.currentBets.player || 0) + chipValue;
    updateTotalAmount(chipValue);a
    decBalance(chipValue);
  },
  "banker": function (chipColor) {
    console.log(`Player bets on Banker with ${chipColor}`);
    const chipValue = app.chipValues[chipColor];
    app.currentBets.banker = (app.currentBets.banker || 0) + chipValue;
    updateTotalAmount(chipValue);
    decBalance(chipValue);
  },
  "tie": function (chipColor) {
    console.log(`Player bets on Tie with ${chipColor}`);
    const chipValue = app.chipValues[chipColor];
    app.currentBets.tie = (app.currentBets.tie || 0) + chipValue;
    updateTotalAmount(chipValue);
    decBalance(chipValue);
  },
  "player-pair": function (chipColor) {
    console.log(`Player bets on Player Pair with ${chipColor}`);
    const chipValue = app.chipValues[chipColor];
    app.currentBets.playerPair = (app.currentBets.playerPair || 0) + chipValue;
    updateTotalAmount(chipValue);
    decBalance(chipValue);
  },
  "banker-pair": function (chipColor) {
    console.log(`Player bets on Banker Pair with ${chipColor}`);
    const chipValue = app.chipValues[chipColor];
    app.currentBets.bankerPair = (app.currentBets.bankerPair || 0) + chipValue;
    updateTotalAmount(chipValue);
    decBalance(chipValue);
  },
  // 추가적인 베팅 유형 핸들러 추가 가능
};

/**
 * 베팅 유형에 따라 게임 상태를 업데이트하는 함수 (핸들러 객체 사용)
 * @param {string} betType - 베팅 유형
 * @param {string} chipColor - 칩 색상
 */
function processBetType(betType, chipColor) {
  if (betTypeHandlers[betType]) {
    betTypeHandlers[betType](chipColor);
  } else {
    console.log("Unknown bet type:", betType);
  }
}

/**
 * 잔액을 감소시키는 함수
 * @param {number} amount - 차감할 금액
 */
function decBalance(amount) {
  app.currentBalance = app.currentBalance || 1000; // 초기 잔액 설정
  app.currentBalance -= amount;
  console.log("잔액:", app.currentBalance);
  
  // UI에 잔액 업데이트
  const balanceElement = document.getElementById('currentBalance');
  if (balanceElement) {
    balanceElement.innerText = app.currentBalance;
  }
}

/**
 * 총 베팅 금액을 업데이트하는 함수
 * @param {number} chipValue - 추가된 칩의 금액
 */
function updateTotalAmount(chipValue) {
  app.totalAmount += chipValue;
  const totalAmountElement = document.getElementById('totalAmount');
  if (totalAmountElement) {
    totalAmountElement.innerText = app.totalAmount;
  }
}

/**
 * 칩을 게임에 추가하는 함수
 * @param {string} betType - 베팅 유형
 * @param {string} chipColor - 칩 색상
 */
function addChip(betType, chipColor) {
  // 현재 게임이 스피닝 중인지 확인
  if (app.gamePlay.spining === true) {
    return;
  }


  // 베팅 유형에 따른 텍스처 선택
  let texture = chipTextures[chipColor];

  if (!texture) {
    console.log("Unknown chip color for texture:", chipColor);
    return;
  }

  // 베팅 유형별 스택 정보 초기화
  if (!app.stacks[betType]) {
    app.stacks[betType] = {
      count: 0,
      basePosition: stackBasePositions[betType] || new THREE.Vector3(0, 0, 0)
    };
  }

  const stack = app.stacks[betType];
  const stackHeight = stack.count * 0.005; // 칩의 두께만큼 높이 증가

  // 칩 위치 설정
  const position = stack.basePosition.clone();
  position.y += stackHeight;

  // 칩에 약간의 오프셋 추가
  const offsetX = (Math.random() - 0.5) * 0.005; // -0.0025 ~ 0.0025
  const offsetZ = (Math.random() - 0.5) * 0.005; // -0.0025 ~ 0.0025
  position.x += offsetX;
  position.z += offsetZ;

  // 원형 디스크 생성 (지오메트리 크기 조정)
  const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.005, 64); // 반지름 0.02m, 높이 0.005m, 세그먼트 수 64
  const material = new THREE.MeshPhongMaterial({
    map: texture,
    shininess: 100,
    transparent: true,    // 투명도 사용
    alphaTest: 0.5,       // 투명도 테스트 임계값
    side: THREE.DoubleSide // 양면 렌더링
  });
  const chip = new THREE.Mesh(geometry, material);

  // 칩 위치 설정
  chip.position.copy(position);

  // 칩을 약간 회전시킴
  chip.rotation.y = Math.random() * Math.PI * 2;

  scene.add(chip);

  // 물리 바디 설정 (필요한 경우에만 사용)
  const body = new CANNON.Body({
    mass: 0.05, // 질량 조정 (예: 0.05kg)
    position: new CANNON.Vec3(position.x, position.y, position.z),
    shape: new CANNON.Cylinder(0.02, 0.02, 0.005, 64),
    material: new CANNON.Material('chipMaterial')
  });
  world.addBody(body);

  // 회전 잠금 (회전 방지)
  if (body.angularFactor) {
    body.angularFactor.set(0, 0, 0); // 모든 축의 회전 잠금
  } else {
    // 대체 방법: angularFactor가 undefined일 경우 직접 할당
    body.angularFactor = new CANNON.Vec3(0, 0, 0);
  }

  // 초기 속도와 각속도 0으로 설정
  body.velocity.setZero();
  body.angularVelocity.setZero();

  // 애니메이션 루프에서 동기화
  demo.push({ mesh: chip, body: body });

  // 베팅 유형에 따른 게임 상태 업데이트
  processBetType(betType, chipColor);

  // 스택 카운트 증가
  stack.count += 1;
}

// 애니메이션 루프
function animate() {
  requestAnimationFrame(animate);

  // 물리 엔진 업데이트
  world.step(1 / 60);

  // 물리 바디와 메쉬 동기화
  if (demo.length > 0) {
    demo.forEach(item => {
      // 속도와 각속도를 0으로 설정하여 움직이지 않게 함
      item.body.velocity.setZero();
      item.body.angularVelocity.setZero();

      // 위치와 회전 동기화
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);
    });
  }

  renderer.render(scene, camera);
}

// 애니메이션 루프 시작
// animate(); // baccarat_script.js에서 초기화 시 호출하도록 변경

// 버튼 클릭 이벤트 설정 (필요 시)
document.getElementById('addChipButton').addEventListener('click', () => {
  // 선택된 베팅 유형과 칩 색상 가져오기
  const betTypeSelect = document.getElementById('betTypeSelect');
  const chipColorSelect = document.getElementById('chipColorSelect');
  const betType = betTypeSelect.value;
  const chipColor = chipColorSelect.value;

  addChip(betType, chipColor);
});

// 창 크기 변경 시 카메라와 렌더러 업데이트
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 초기화 및 애니메이션 시작
function startChipScene() {
  initThreeJS();
  initCannonJS();
  animate();
}

// window 객체에 함수 노출
window.addChipToScene = addChip;
window.initChipScene = startChipScene;

// 초기화는 baccarat_script.js에서 호출
