import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { Warehouse, RACK_CONFIG, STATIONS, stationWorldZ } from './Warehouse.js';
import { StackerCrane, bayToWorldX, levelToWorldY } from './StackerCrane.js';
import { LoadManager } from './LoadManager.js';
import { JobScheduler, JOB_TYPE } from './JobScheduler.js';
import { AutoController } from './AutoController.js';

// ── レンダラー ─────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
container.appendChild(renderer.domElement);

// ── シーン ────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd0dce8);
scene.fog = new THREE.Fog(0xd0dce8, 30, 80);

// ── カメラ ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(52, container.clientWidth / container.clientHeight, 0.1, 100);
const centerX = RACK_CONFIG.numBays * RACK_CONFIG.bayWidth / 2;
const topY    = RACK_CONFIG.numLevels * RACK_CONFIG.levelHeight;
camera.position.set(centerX, topY + 4, 22);
camera.lookAt(centerX, topY / 2, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(centerX, topY / 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI * 0.48;

// ── 照明 ─────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 2.5));

const sun = new THREE.DirectionalLight(0xfff5e0, 3.0);
sun.position.set(centerX, topY + 10, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 0.5, far: 80, left: -centerX - 5, right: centerX + 5, top: topY + 5, bottom: -5 });
scene.add(sun);

// 天井スポット列 (4間口おきに1灯)
for (let i = 0; i < RACK_CONFIG.numBays; i += 4) {
  const x = i * RACK_CONFIG.bayWidth + RACK_CONFIG.bayWidth / 2;
  const pl = new THREE.PointLight(0xffffff, 1.2, 14);
  pl.position.set(x, topY + 0.5, 0);
  scene.add(pl);
}

// ── システム初期化 ────────────────────────────────────────
const physics     = new PhysicsWorld();
const warehouse   = new Warehouse(scene, physics);
const crane       = new StackerCrane(scene, physics);
const loadManager = new LoadManager(scene);
const scheduler   = new JobScheduler();
const autoCtrl    = new AutoController(crane, warehouse, loadManager, scheduler);

// 初期ロード（ラックにパレットをランダムに配置）
const initLoads = [
  { side: -1, bay:  0, level: 0 }, { side: -1, bay:  2, level: 1 },
  { side: -1, bay:  4, level: 0 }, { side: -1, bay:  6, level: 2 },
  { side: -1, bay:  8, level: 1 }, { side: -1, bay: 10, level: 0 },
  { side: -1, bay: 12, level: 3 }, { side: -1, bay: 14, level: 1 },
  { side: -1, bay: 16, level: 0 }, { side: -1, bay: 18, level: 2 },
  { side:  1, bay:  1, level: 0 }, { side:  1, bay:  3, level: 2 },
  { side:  1, bay:  5, level: 1 }, { side:  1, bay:  7, level: 0 },
  { side:  1, bay:  9, level: 3 }, { side:  1, bay: 11, level: 1 },
  { side:  1, bay: 13, level: 0 }, { side:  1, bay: 15, level: 2 },
  { side:  1, bay: 17, level: 4 }, { side:  1, bay: 19, level: 0 },
];
initLoads.forEach(({ side, bay, level }) => {
  const pos = warehouse.getCellWorldPos(side, bay, level);
  if (pos) {
    const mesh = loadManager.createPallet(pos);
    warehouse.setLoad(side, bay, level, mesh);
  }
});

// ST1 に待機パレット
function spawnST1Pallet() {
  const st = STATIONS.ST1;
  const z  = stationWorldZ(st.side);
  return loadManager.createPallet(new THREE.Vector3(st.x, st.y + 0.28, z));
}

// ── タブ切替 ─────────────────────────────────────────────
let currentJobType = 'store';
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentJobType = btn.dataset.job;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.job-form').forEach(f => f.classList.remove('visible'));
    document.getElementById(`form-${currentJobType}`).classList.add('visible');
  });
});

// ── 入庫実行 ─────────────────────────────────────────────
document.getElementById('btn-exec-store').addEventListener('click', () => {
  const side  = parseInt(document.getElementById('store-side').value);
  const bay   = parseInt(document.getElementById('store-bay').value)   - 1;
  const level = parseInt(document.getElementById('store-level').value) - 1;

  if (!validCell(side, bay, level)) return alert('無効なアドレス');
  if (warehouse.isCellOccupied(side, bay, level)) return alert(`セル ${addrStr(side,bay,level)} は既に使用中`);

  // ST1 にパレットがなければ生成
  const st1 = STATIONS.ST1;
  const st1Z = stationWorldZ(st1.side);
  const hasST1Load = loadManager.loads.some(
    l => Math.abs(l.position.x - st1.x) < 0.6 && Math.abs(l.position.z - st1Z) < 0.6
  );
  if (!hasST1Load) spawnST1Pallet();

  scheduler.addJob(JOB_TYPE.STORE, { targetSide: side, targetBay: bay, targetLevel: level });
});

// ── 出庫実行 ─────────────────────────────────────────────
document.getElementById('btn-exec-retrieve').addEventListener('click', () => {
  const side  = parseInt(document.getElementById('ret-side').value);
  const bay   = parseInt(document.getElementById('ret-bay').value)   - 1;
  const level = parseInt(document.getElementById('ret-level').value) - 1;

  if (!validCell(side, bay, level)) return alert('無効なアドレス');
  if (!warehouse.isCellOccupied(side, bay, level)) return alert(`セル ${addrStr(side,bay,level)} は空き`);

  scheduler.addJob(JOB_TYPE.RETRIEVE, { sourceSide: side, sourceBay: bay, sourceLevel: level });
});

// ── 移動実行 ─────────────────────────────────────────────
document.getElementById('btn-exec-relocate').addEventListener('click', () => {
  const srcSide  = parseInt(document.getElementById('rel-src-side').value);
  const srcBay   = parseInt(document.getElementById('rel-src-bay').value)   - 1;
  const srcLevel = parseInt(document.getElementById('rel-src-level').value) - 1;
  const dstSide  = parseInt(document.getElementById('rel-dst-side').value);
  const dstBay   = parseInt(document.getElementById('rel-dst-bay').value)   - 1;
  const dstLevel = parseInt(document.getElementById('rel-dst-level').value) - 1;

  if (!validCell(srcSide, srcBay, srcLevel)) return alert('移元アドレス無効');
  if (!validCell(dstSide, dstBay, dstLevel)) return alert('移先アドレス無効');
  if (!warehouse.isCellOccupied(srcSide, srcBay, srcLevel)) return alert(`移元 ${addrStr(srcSide,srcBay,srcLevel)} は空き`);
  if (warehouse.isCellOccupied(dstSide, dstBay, dstLevel)) return alert(`移先 ${addrStr(dstSide,dstBay,dstLevel)} は使用中`);

  scheduler.addJob(JOB_TYPE.RELOCATE, {
    sourceSide: srcSide, sourceBay: srcBay, sourceLevel: srcLevel,
    targetSide: dstSide, targetBay: dstBay, targetLevel: dstLevel,
  });
});

// ── 手動フォーク ─────────────────────────────────────────
document.getElementById('btn-fork-left').addEventListener('click',   () => crane.extendFork(-1));
document.getElementById('btn-fork-right').addEventListener('click',  () => crane.extendFork(1));
document.getElementById('btn-fork-center').addEventListener('click', () => crane.extendFork(0));

// ── 速度スライダー ────────────────────────────────────────
document.getElementById('speed-slider').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  document.getElementById('speed-val').textContent = v;
  crane.setSpeedFactor(v);
});

// ── 非常停止 ─────────────────────────────────────────────
const btnEmg = document.getElementById('btn-emergency');
btnEmg.addEventListener('click', () => {
  if (crane.emergency) {
    crane.resume();
    btnEmg.textContent = '⚠ 非常停止 [E]';
    btnEmg.classList.remove('active-emg');
  } else {
    crane.emergencyStop();
    btnEmg.textContent = '▶ 運転再開 [E]';
    btnEmg.classList.add('active-emg');
  }
});
window.addEventListener('keydown', e => {
  if (e.key === 'e' || e.key === 'E') btnEmg.click();
});

// ── ジョブリスト更新 ─────────────────────────────────────
const JOB_LABELS = {
  [JOB_TYPE.STORE]:    ['tag-store',    '入庫'],
  [JOB_TYPE.RETRIEVE]: ['tag-retrieve', '出庫'],
  [JOB_TYPE.RELOCATE]: ['tag-relocate', '移動'],
};
scheduler.onUpdate(jobs => {
  const el = document.getElementById('job-items');
  if (!jobs.length) { el.innerHTML = '<div style="font-size:10px;color:#334">キューなし</div>'; return; }
  el.innerHTML = jobs.slice(0, 20).map(j => {
    const [cls, lbl] = JOB_LABELS[j.type] ?? ['', j.type];
    const p = j.params;
    let detail = '';
    if (j.type === JOB_TYPE.STORE)
      detail = `ST1 → ${addrStr(p.targetSide, p.targetBay, p.targetLevel)}`;
    else if (j.type === JOB_TYPE.RETRIEVE)
      detail = `${addrStr(p.sourceSide, p.sourceBay, p.sourceLevel)} → ST2`;
    else if (j.type === JOB_TYPE.RELOCATE)
      detail = `${addrStr(p.sourceSide,p.sourceBay,p.sourceLevel)}→${addrStr(p.targetSide,p.targetBay,p.targetLevel)}`;

    return `<div class="job-item ${j.state}">
      <span class="job-tag ${cls}">${lbl}</span>${detail}
    </div>`;
  }).join('');
});

// ── リサイズ ──────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ── レンダーループ ────────────────────────────────────────
const clock = new THREE.Clock();
let fpsTimer = 0, frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  physics.step(dt);
  crane.update(dt);
  autoCtrl.update(dt);

  // UI ステータス更新
  const p = crane.pos;
  document.getElementById('sb-x').textContent     = p.x.toFixed(2) + ' m';
  document.getElementById('sb-y').textContent     = p.y.toFixed(2) + ' m';
  document.getElementById('sb-fork').textContent  = p.fork.toFixed(2) + ' m';
  document.getElementById('sb-speed').textContent = crane.travelSpeed.toFixed(2) + ' m/s';
  document.getElementById('sb-load').textContent  = crane.load ? '搭載中' : 'なし';
  document.getElementById('craneStatus').textContent = crane.emergency
    ? '⚠ 非常停止中'
    : (autoCtrl.statusText || (crane.isIdle ? '待機中' : '動作中'));

  // モータ監視パネル更新
  updateMotorUI('t', crane.travelMotor);
  updateMotorUI('l', crane.liftMotor);
  updateMotorUI('f', crane.forkMotor);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    document.getElementById('sb-fps').textContent = Math.round(frames / fpsTimer);
    frames = 0; fpsTimer = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ── モータUI更新 ─────────────────────────────────────────
function updateMotorUI(id, m) {
  const pct = Math.min(250, Math.abs(m.torquePct));
  const bar = document.getElementById(`bar-${id === 't' ? 'travel' : id === 'l' ? 'lift' : 'fork'}`);
  bar.style.width = Math.min(100, pct / 2.5) + '%';
  bar.classList.toggle('bar-over', pct > 100);

  const pfx = 'm' + id;
  document.getElementById(pfx + '-rpm').textContent  = Math.round(m.motorRPM) + ' rpm';
  const trqEl = document.getElementById(pfx + '-trq');
  trqEl.textContent = m.torquePct.toFixed(1) + ' %';
  trqEl.className   = 'm-val-num' + (Math.abs(m.torquePct) > 100 ? ' hi' : '');
  document.getElementById(pfx + '-cur').textContent  = m.current.toFixed(1) + ' A';
  document.getElementById(pfx + '-freq').textContent = m.frequency.toFixed(1) + ' Hz';
}

// ── ユーティリティ ────────────────────────────────────────
function validCell(side, bay, level) {
  return (side === -1 || side === 1)
    && bay >= 0 && bay < RACK_CONFIG.numBays
    && level >= 0 && level < RACK_CONFIG.numLevels;
}
function addrStr(side, bay, level) {
  return `${side < 0 ? 'L' : 'R'}-${bay + 1}-${level + 1}`;
}
