import './styles.css';
import * as THREE from 'three';
import md5 from 'blueimp-md5';
import { createDreamweaveWorld, updateDreamweaveWorld } from './models/dreamweaveWorld.js';

const DEFAULT_SECRET = 'change-me-dreamweave-server-secret';
const CLIENT = {
  name: 'DreamweaveWeb',
  version: '0.1.2',
  platform: 'web',
  build: 'dev',
  device: navigator.userAgent.slice(0, 80)
};
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
  displayNameInput: $('displayNameInput'),
  emailInput: $('emailInput')
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
const world = createDreamweaveWorld(scene3d, playerRig);

bindUi();
renderHud();
animate();

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
  const hello = await postJson('/api/hello', { client: CLIENT });
  const payload = hello.payload;
  const expectedServerKey = md5(`${config.serverSecret}:${payload.server_nonce}`);
  if (payload.server_key !== expectedServerKey) throw new Error('server proof mismatch');
  if (isVersionLess(CLIENT.version, payload.minimum_client_version || '0.0.0')) {
    throw new Error(`client ${CLIENT.version} is below minimum ${payload.minimum_client_version}`);
  }

  const clientNonce = randomHex(16);
  const clientKey = md5(`${config.serverSecret}:${payload.server_nonce}:${clientNonce}`);
  const done = await postJson('/api/hello', {
    handshake_id: payload.handshake_id,
    client_nonce: clientNonce,
    client_key: clientKey,
    client: CLIENT
  });

  const sessionKey = await sha256Bytes(`${config.serverSecret}:${payload.server_nonce}:${clientNonce}`);
  state.session = {
    handshakeId: payload.handshake_id,
    sessionKey,
    sessionKeyHex: bytesToHex(sessionKey)
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
  const uid = dom.usernameInput.value.trim();
  const passwordMd5 = md5(dom.passwordInput.value);
  try {
    const payload = await signedFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        uid,
        nickname: dom.displayNameInput.value.trim() || uid,
        email: dom.emailInput.value.trim(),
        password_md5: passwordMd5
      })
    });
    state.user = payload.user;
    dom.accountMessage.textContent = '注册成功，可以登录。';
    log(`注册用户：${userLabel(state.user)}`);
  } catch (error) {
    dom.accountMessage.textContent = error.message;
  }
  renderHud();
}

async function login() {
  dom.accountMessage.textContent = '';
  const uid = dom.usernameInput.value.trim();
  const passwordMd5 = md5(dom.passwordInput.value);
  try {
    const payload = await signedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ uid, password_md5: passwordMd5 })
    });
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem('dw_session_token', state.token);
    dom.accountOverlay.classList.add('hidden');
    log(`登录成功：${userLabel(state.user)}`);
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
  const metadataMd5 = md5(clientMetadataText());
  const key = md5([
    config.serverSecret,
    state.session.sessionKeyHex,
    state.session.handshakeId,
    method,
    path,
    bodyMd5,
    timestamp,
    nonce,
    metadataMd5
  ].join(':'));

  const response = await fetch(apiUrl(path), {
    ...options,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Dreamweave-Handshake': state.session.handshakeId,
      'X-Dreamweave-Timestamp': timestamp,
      'X-Dreamweave-Nonce': nonce,
      'X-Dreamweave-Client-Name': CLIENT.name,
      'X-Dreamweave-Client-Version': CLIENT.version,
      'X-Dreamweave-Client-Platform': CLIENT.platform,
      'X-Dreamweave-Client-Build': CLIENT.build,
      'X-Dreamweave-Client-Device': CLIENT.device,
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
  updateDreamweaveWorld(world, clock.elapsedTime);
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
  dom.playerBadge.textContent = state.user ? userLabel(state.user) : '访客';
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

function userLabel(user) {
  return user?.nickname || user?.display_name || user?.uid || user?.username || '玩家';
}

function clientMetadataText() {
  return [
    CLIENT.name,
    CLIENT.version,
    CLIENT.platform || '',
    CLIENT.build || '',
    CLIENT.device || ''
  ].join('\n');
}

function isVersionLess(left, right) {
  const leftParts = String(left).split('.').map((part) => Number(part) || 0);
  const rightParts = String(right).split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    if ((leftParts[i] || 0) < (rightParts[i] || 0)) return true;
    if ((leftParts[i] || 0) > (rightParts[i] || 0)) return false;
  }
  return false;
}
