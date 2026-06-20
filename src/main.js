import './styles.css';
import * as THREE from 'three';
import md5 from 'blueimp-md5';

const DEFAULT_SECRET = 'change-me-dreamweave-server-secret';
const DEFAULT_PLAYER = {
  position: { x: 0, y: 1.05, z: 8 },
  rotation: { y: 0 },
  inventory: [],
  tasks: [],
  stats: { resonance: 72, stability: 88 }
};

const fallbackScene = {
  meta: { chapter_title: '序章：众星降临', scene_title: '第一幕：沉寂' },
  characters: [{ id: 'guide_luna', name: '露娜', role: '引导者' }],
  dialogues: [{ speaker: 'guide_luna', text: '离线模式已启动。你仍可以在悬空港中移动。', emotion: 'calm' }],
  tasks: [{ title: '连接 Dreamweave Server', description: '启动服务端后点击“连接”，同步服务器剧情。' }]
};

const config = {
  apiBase: localStorage.getItem('dw_api_base') || '',
  serverSecret: localStorage.getItem('dw_server_secret') || DEFAULT_SECRET
};

const state = {
  session: null,
  token: localStorage.getItem('dw_session_token') || '',
  user: null,
  scene: fallbackScene,
  dialogueIndex: 0,
  player: structuredClone(DEFAULT_PLAYER),
  keys: new Set()
};

const $ = (id) => document.getElementById(id);
const dom = {
  sceneName: $('sceneName'),
  serverBadge: $('serverBadge'),
  playerBadge: $('playerBadge'),
  coordBadge: $('coordBadge'),
  taskList: $('taskList'),
  logList: $('logList'),
  speakerName: $('speakerName'),
  speakerRole: $('speakerRole'),
  dialogueText: $('dialogueText'),
  resonanceText: $('resonanceText'),
  stabilityText: $('stabilityText'),
  resonanceBar: $('resonanceBar'),
  stabilityBar: $('stabilityBar'),
  settingsOverlay: $('settingsOverlay'),
  settingsForm: $('settingsForm'),
  settingsMessage: $('settingsMessage'),
  apiBaseInput: $('apiBaseInput'),
  serverSecretInput: $('serverSecretInput'),
  accountOverlay: $('accountOverlay'),
  accountForm: $('accountForm'),
  accountMessage: $('accountMessage'),
  usernameInput: $('usernameInput'),
  passwordInput: $('passwordInput'),
  displayNameInput: $('displayNameInput')
};

dom.apiBaseInput.value = config.apiBase;
dom.serverSecretInput.value = config.serverSecret;

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene3d = new THREE.Scene();
scene3d.background = new THREE.Color(0x080b0f);
scene3d.fog = new THREE.FogExp2(0x101722, 0.032);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 240);
const clock = new THREE.Clock();
const playerRig = new THREE.Group();
playerRig.position.set(DEFAULT_PLAYER.position.x, DEFAULT_PLAYER.position.y, DEFAULT_PLAYER.position.z);
scene3d.add(playerRig);

buildWorld();
bindUi();
renderHud();
animate();

function buildWorld() {
  scene3d.add(new THREE.HemisphereLight(0x8bd8ff, 0x201812, 1.15));

  const sun = new THREE.DirectionalLight(0xffd28a, 2.4);
  sun.position.set(-6, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  scene3d.add(sun);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(10.5, 12.2, 1.1, 96),
    new THREE.MeshStandardMaterial({ color: 0x293543, metalness: 0.22, roughness: 0.48 })
  );
  platform.position.y = -0.55;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene3d.add(platform);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0x45d0c1, emissive: 0x123d3b, metalness: 0.45, roughness: 0.32 });
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(11.4 + i * 1.2, 0.045, 8, 160), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05 + i * 0.03;
    scene3d.add(ring);
  }

  const anchor = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.35, 1),
    new THREE.MeshStandardMaterial({ color: 0x7df7e9, emissive: 0x1a6e69, metalness: 0.18, roughness: 0.2 })
  );
  core.castShadow = true;
  anchor.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.035, 8, 128), new THREE.MeshBasicMaterial({ color: 0xf5bd56 }));
  halo.rotation.x = Math.PI / 2;
  anchor.add(halo);
  anchor.position.set(0, 2.05, 0);
  anchor.name = 'anchor';
  scene3d.add(anchor);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0x1b2635, metalness: 0.3, roughness: 0.5 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xf5bd56 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 18 + (i % 3) * 4;
    const height = 4 + (i % 4) * 1.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, height, 1.8), towerMat);
    tower.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
    tower.rotation.y = -angle;
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene3d.add(tower);

    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.06), windowMat);
    glow.position.set(tower.position.x, height * 0.58, tower.position.z);
    glow.rotation.y = tower.rotation.y;
    scene3d.add(glow);
  }

  const starGeo = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 800; i += 1) {
    const radius = 70 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const y = 10 + Math.random() * 80;
    starPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene3d.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdceeff, size: 0.16, sizeAttenuation: true })));

  const avatar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.85, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.42 })
  );
  body.castShadow = true;
  body.position.y = 0.55;
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.055, 8, 32, Math.PI * 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf5bd56, emissive: 0x332006, roughness: 0.35 })
  );
  scarf.position.y = 1.05;
  scarf.rotation.x = Math.PI / 2;
  avatar.add(body, scarf);
  playerRig.add(avatar);
}

function bindUi() {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));

  document.querySelectorAll('[data-hold]').forEach((button) => {
    const key = button.dataset.hold;
    const start = (event) => { event.preventDefault(); state.keys.add(key); };
    const stop = () => state.keys.delete(key);
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointerleave', stop);
    button.addEventListener('pointercancel', stop);
  });

  $('connectBtn').addEventListener('click', () => dom.settingsOverlay.classList.remove('hidden'));
  $('offlineBtn').addEventListener('click', () => {
    dom.settingsOverlay.classList.add('hidden');
    setBadge(dom.serverBadge, 'warn', '离线');
    log('离线探索模式');
  });
  dom.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    config.apiBase = dom.apiBaseInput.value.trim().replace(/\/$/, '');
    config.serverSecret = dom.serverSecretInput.value || DEFAULT_SECRET;
    localStorage.setItem('dw_api_base', config.apiBase);
    localStorage.setItem('dw_server_secret', config.serverSecret);
    await connect();
  });

  $('syncBtn').addEventListener('click', () => syncState(true));
  $('loginBtn').addEventListener('click', () => dom.accountOverlay.classList.remove('hidden'));
  $('closeAccountBtn').addEventListener('click', () => dom.accountOverlay.classList.add('hidden'));
  $('nextBtn').addEventListener('click', nextDialogue);
  $('nextBtnTop').addEventListener('click', nextDialogue);
  $('registerBtn').addEventListener('click', register);
  dom.accountForm.addEventListener('submit', (event) => {
    event.preventDefault();
    login();
  });
}

async function connect() {
  dom.settingsMessage.textContent = '';
  try {
    await handshake();
    setBadge(dom.serverBadge, 'ok', '已连接');
    await loadStatus();
    await loadStory();
    dom.settingsOverlay.classList.add('hidden');
    if (state.token) await syncState(false);
  } catch (error) {
    setBadge(dom.serverBadge, 'bad', '连接失败');
    dom.settingsMessage.textContent = error.message;
    log(`连接失败：${error.message}`);
  }
  renderHud();
}

async function handshake() {
  const hello = await postJson('/api/hello', {});
  const payload = hello.payload;
  const expectedServerKey = md5(`${config.serverSecret}:${payload.server_nonce}`);
  if (payload.server_key !== expectedServerKey) throw new Error('server proof mismatch');

  const clientNonce = randomHex(16);
  const clientKey = md5(`${config.serverSecret}:${payload.server_nonce}:${clientNonce}`);
  const done = await postJson('/api/hello', {
    handshake_id: payload.handshake_id,
    client_nonce: clientNonce,
    client_key: clientKey
  });

  state.session = {
    handshakeId: payload.handshake_id,
    sessionKey: await sha256Bytes(`${config.serverSecret}:${payload.server_nonce}:${clientNonce}`)
  };
  log(done.payload.authenticated ? '握手完成' : '握手响应异常');
}

async function loadStatus() {
  const status = await signedFetch('/api/status');
  dom.sceneName.textContent = `${status.server_name} · ${status.region} · ${status.status}`;
  log(`服务器状态：${status.status}`);
}

async function loadStory() {
  const pkg = await signedFetch('/api/content/story', { method: 'POST', body: '{}' });
  const rawBytes = await xorPayload(pkg.payload, state.session.sessionKey);
  const text = new TextDecoder().decode(rawBytes);
  if (md5(text) !== pkg.md5) throw new Error('story md5 mismatch');
  const story = JSON.parse(text);
  state.scene = Array.isArray(story.scenes) && story.scenes.length ? story.scenes[0] : story;
  state.dialogueIndex = 0;
  log(`剧情加载：${state.scene.meta?.chapter_title || 'Dreamweave'}`);
}

async function register() {
  dom.accountMessage.textContent = '';
  try {
    const payload = await signedFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        username: dom.usernameInput.value.trim(),
        password: dom.passwordInput.value,
        display_name: dom.displayNameInput.value.trim() || null
      })
    });
    state.user = payload.user;
    dom.accountMessage.textContent = '注册成功，可以登录。';
    log(`注册用户：${state.user.display_name || state.user.username}`);
  } catch (error) {
    dom.accountMessage.textContent = error.message;
  }
  renderHud();
}

async function login() {
  dom.accountMessage.textContent = '';
  try {
    const payload = await signedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: dom.usernameInput.value.trim(), password: dom.passwordInput.value })
    });
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem('dw_session_token', state.token);
    dom.accountOverlay.classList.add('hidden');
    log(`登录成功：${state.user.display_name || state.user.username}`);
    await syncState(false);
  } catch (error) {
    dom.accountMessage.textContent = error.message;
  }
  renderHud();
}

async function syncState(manual) {
  if (!state.token) {
    if (manual) dom.accountOverlay.classList.remove('hidden');
    return;
  }
  try {
    await signedFetch('/api/sync/update', {
      method: 'POST',
      body: JSON.stringify({ token: state.token, state: currentPlayerState() })
    });
    const payload = await signedFetch('/api/sync/get', {
      method: 'POST',
      body: JSON.stringify({ token: state.token })
    });
    applyPlayerState(payload.state || {});
    log('玩家状态已同步');
  } catch (error) {
    log(`同步失败：${error.message}`);
  }
  renderHud();
}

async function postJson(path, body) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include'
  });
  return parseJsonResponse(response);
}

async function signedFetch(path, options = {}) {
  if (!state.session) throw new Error('handshake is not ready');
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body || '';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomHex(16);
  const bodyMd5 = md5(body);
  const key = md5([
    config.serverSecret,
    bytesToHex(state.session.sessionKey),
    state.session.handshakeId,
    method,
    path,
    bodyMd5,
    timestamp,
    nonce
  ].join(':'));

  const response = await fetch(apiUrl(path), {
    ...options,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Dreamweave-Handshake': state.session.handshakeId,
      'X-Dreamweave-Timestamp': timestamp,
      'X-Dreamweave-Nonce': nonce,
      'X-Dreamweave-Key': key,
      ...(options.headers || {})
    },
    credentials: 'include'
  });
  const data = await parseJsonResponse(response);
  return data.payload;
}

async function parseJsonResponse(response) {
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.detail || data.error?.message || 'request failed');
  return data;
}

function apiUrl(path) {
  return `${config.apiBase}${path}`;
}

async function xorPayload(base64, sessionKey) {
  const encrypted = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const output = new Uint8Array(encrypted.length);
  let offset = 0;
  for (let blockId = 0; offset < encrypted.length; blockId += 1) {
    const blockInput = new Uint8Array(sessionKey.length + 8);
    blockInput.set(sessionKey);
    new DataView(blockInput.buffer).setUint32(sessionKey.length + 4, blockId);
    const keyBlock = await sha256Bytes(blockInput);
    for (let i = 0; i < keyBlock.length && offset < encrypted.length; i += 1, offset += 1) {
      output[offset] = encrypted[offset] ^ keyBlock[i];
    }
  }
  return output;
}

async function sha256Bytes(value) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function randomHex(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToHex(data);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayer(dt);
  updateSceneMotion(clock.elapsedTime);
  renderer.render(scene3d, camera);
}

function updatePlayer(dt) {
  const speed = state.keys.has('shift') ? 7 : 4;
  const turnSpeed = 2.4;
  if (state.keys.has('left')) playerRig.rotation.y += turnSpeed * dt;
  if (state.keys.has('right')) playerRig.rotation.y -= turnSpeed * dt;

  const forward = Number(state.keys.has('forward')) - Number(state.keys.has('backward'));
  if (forward) {
    const dir = new THREE.Vector3(Math.sin(playerRig.rotation.y), 0, Math.cos(playerRig.rotation.y));
    playerRig.position.addScaledVector(dir, -forward * speed * dt);
    const dist = Math.hypot(playerRig.position.x, playerRig.position.z);
    if (dist > 10) playerRig.position.multiplyScalar(10 / dist);
  }

  camera.position.lerp(
    new THREE.Vector3(
      playerRig.position.x + Math.sin(playerRig.rotation.y) * 6,
      playerRig.position.y + 4.2,
      playerRig.position.z + Math.cos(playerRig.rotation.y) * 6
    ),
    0.11
  );
  camera.lookAt(playerRig.position.x, playerRig.position.y + 1, playerRig.position.z);
  dom.coordBadge.textContent = `${playerRig.position.x.toFixed(1)}, ${playerRig.position.y.toFixed(1)}, ${playerRig.position.z.toFixed(1)}`;
}

function updateSceneMotion(t) {
  const anchor = scene3d.getObjectByName('anchor');
  if (!anchor) return;
  anchor.rotation.y = t * 0.55;
  anchor.children[1].rotation.z = t * 0.9;
  anchor.position.y = 2.05 + Math.sin(t * 1.4) * 0.16;
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function setKey(event, down) {
  const map = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'backward',
    ArrowDown: 'backward',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'shift',
    ShiftRight: 'shift'
  };
  const key = map[event.code];
  if (!key) return;
  event.preventDefault();
  if (down) state.keys.add(key);
  else state.keys.delete(key);
}

function renderHud() {
  const scene = state.scene || fallbackScene;
  dom.sceneName.textContent = `${scene.meta?.chapter_title || 'Dreamweave'} · ${scene.meta?.scene_title || '未知区域'}`;
  const dialogue = scene.dialogues?.[state.dialogueIndex] || scene.dialogues?.[0];
  const character = scene.characters?.find((item) => item.id === dialogue?.speaker);
  dom.speakerName.textContent = character?.name || dialogue?.speaker || '系统';
  dom.speakerRole.textContent = character?.role || dialogue?.emotion || '织梦网络';
  dom.dialogueText.textContent = dialogue?.text || '没有可用对白。';
  dom.taskList.innerHTML = (scene.tasks || []).map((task) => `
    <div class="list-item">
      <strong>${escapeHtml(task.title || task.id || '任务')}</strong>
      <span>${escapeHtml(task.description || '')}</span>
    </div>
  `).join('') || '<div class="list-item"><strong>自由探索</strong><span>当前场景没有任务。</span></div>';
  const stats = state.player.stats || DEFAULT_PLAYER.stats;
  setMeter('resonance', Number(stats.resonance ?? 72));
  setMeter('stability', Number(stats.stability ?? 88));
  dom.playerBadge.textContent = state.user ? (state.user.display_name || state.user.username || '玩家') : '访客';
}

function nextDialogue() {
  if (!state.scene?.dialogues?.length) return;
  state.dialogueIndex = (state.dialogueIndex + 1) % state.scene.dialogues.length;
  renderHud();
}

function currentPlayerState() {
  return {
    ...state.player,
    position: { x: playerRig.position.x, y: playerRig.position.y, z: playerRig.position.z },
    rotation: { y: playerRig.rotation.y },
    tasks: state.scene?.tasks || []
  };
}

function applyPlayerState(saved) {
  const position = saved.position || saved.player_position || {};
  const rotation = saved.rotation || saved.player_rotation || {};
  if (Number.isFinite(Number(position.x))) playerRig.position.x = Number(position.x);
  if (Number.isFinite(Number(position.y))) playerRig.position.y = Number(position.y);
  if (Number.isFinite(Number(position.z))) playerRig.position.z = Number(position.z);
  if (Number.isFinite(Number(rotation.y))) playerRig.rotation.y = Number(rotation.y);
  state.player = { ...state.player, ...saved };
}

function setMeter(name, value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  dom[`${name}Text`].textContent = `${clamped}%`;
  dom[`${name}Bar`].style.setProperty('--value', `${clamped}%`);
}

function setBadge(node, kind, text) {
  node.className = `badge ${kind}`;
  node.textContent = text;
}

function log(message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const line = document.createElement('div');
  line.className = 'list-item';
  line.textContent = `[${time}] ${message}`;
  dom.logList.prepend(line);
  while (dom.logList.children.length > 8) dom.logList.lastElementChild.remove();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
