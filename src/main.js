import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { Warehouse, RACK_CONFIG, STATIONS, stationWorldZ } from './Warehouse.js';
import { StackerCrane, bayToWorldX, levelToWorldY } from './StackerCrane.js';
import { LoadManager } from './LoadManager.js';
import { JobScheduler, JOB_TYPE } from './JobScheduler.js';
import { AutoController } from './AutoController.js';
import { MobileSorter, SORTER_CONFIG } from './MobileSorter.js';
import { SorterController } from './SorterController.js';
import { StationConveyor } from './StationConveyor.js';
import { HumanoidRobot } from './HumanoidRobot.js';
import { ControlPanel3D } from './ControlPanel3D.js';

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
const sorter      = new MobileSorter(scene);
const sorterCtrl  = new SorterController(sorter);
const autoCtrl    = new AutoController(crane, warehouse, loadManager, scheduler, sorterCtrl);
// 10体のロボット: 2列×5 (z=6.5 / z=8.5, x=-10〜-2 間隔2m)
const ROBOT_POSITIONS = [
  [-10, 6.5], [-8, 6.5], [-6, 6.5], [-4, 6.5], [-2, 6.5],
  [-10, 8.5], [-8, 8.5], [-6, 8.5], [-4, 8.5], [-2, 8.5],
];
const robots = ROBOT_POSITIONS.map(([x, z]) =>
  new HumanoidRobot(
    scene,
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x + 2.5, 0, z + 0.2)
  )
);
const robot = robots[0]; // 既存コード互換用
const controlPanel = new ControlPanel3D(scene);
const st1Conv      = new StationConveyor(scene, {
  startX: -4.0,
  endX:   STATIONS.ST1.x,
  z:      stationWorldZ(STATIONS.ST1.side),
  y:      STATIONS.ST1.y,
});
// ST2 (R-1-1, z=1.5) → MobileSorter (手前 z=3.5) を Z 方向で連結する出庫コンベア
const st2Conv      = new StationConveyor(scene, {
  startZ: stationWorldZ(STATIONS.ST2.side),
  endZ:   SORTER_CONFIG.z,
  x:      STATIONS.ST2.x,
  y:      STATIONS.ST2.y,
});

// ST2 プラットフォーム基台（台にローラーがついたコンベア）
{
  const stZ     = stationWorldZ(STATIONS.ST2.side);   // 1.5
  const zEnd    = SORTER_CONFIG.z;                    // 3.5
  const length  = zEnd - stZ;                         // 2.0
  const platW   = 1.20;
  const platH   = STATIONS.ST2.y - 0.08;              // ローラー下端まで ~1.12
  const cx      = STATIONS.ST2.x;
  const cz      = (stZ + zEnd) / 2;

  // 床パッチ（台の下に薄い黒フロア、見切り用）
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(platW + 0.4, 0.10, length + 1.0),
    new THREE.MeshStandardMaterial({ color: 0x1e2c38, roughness: 0.9, metalness: 0.1 })
  );
  pad.position.set(cx, -0.05, cz);
  pad.receiveShadow = true;
  scene.add(pad);

  // メイン台座（緑、出庫STカラー）
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(platW, platH, length),
    new THREE.MeshStandardMaterial({ color: 0x1a8a3a, metalness: 0.3, roughness: 0.7 })
  );
  plat.position.set(cx, platH / 2, cz);
  plat.castShadow = true;
  plat.receiveShadow = true;
  scene.add(plat);

  // 側面上部の黄色安全ストライプ（両側面）
  [-platW / 2 - 0.002, platW / 2 + 0.002].forEach(dx => {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.010, 0.09, length - 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    );
    s.position.set(cx + dx, platH - 0.18, cz);
    scene.add(s);
  });

  // 四隅の黒コーナーガード
  const cornerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.4 });
  [[-platW / 2, stZ], [platW / 2, stZ], [-platW / 2, zEnd], [platW / 2, zEnd]].forEach(([dx, ccz]) => {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, platH + 0.04, 0.07), cornerMat
    );
    c.position.set(cx + dx, (platH + 0.04) / 2, ccz);
    c.castShadow = true;
    scene.add(c);
  });

  // 前面銘板 "ST2" (ST側 = z=1.5 面)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0a3a1a';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ST2', 128, 50);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('OUTBOUND', 128, 94);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
    );
    plate.position.set(cx, platH - 0.45, stZ - 0.001);
    plate.rotation.y = Math.PI; // ST 側を向く
    scene.add(plate);
  }
}

// ST2 ↔ モビルソータ 境界マーカー
{
  const boundZ = SORTER_CONFIG.z;
  const boundX = STATIONS.ST2.x;

  // 床の黄色安全ストライプ（境界ライン）
  const gStripe = new THREE.Mesh(
    new THREE.PlaneGeometry(1.30, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  gStripe.rotation.x = -Math.PI / 2;
  gStripe.position.set(boundX, 0.015, boundZ);
  scene.add(gStripe);

  // 境界ラベル "ST2 ▶ SORTER"
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ST2 ▶ SORTER', 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true,
    }));
    sprite.scale.set(1.1, 0.27, 1);
    sprite.position.set(boundX, 2.05, boundZ);
    scene.add(sprite);
  }

  // 引き渡しゾーンマット（ST2コンベア天面に重ねる、黄色半透明）
  const handoff = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.20),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.35 })
  );
  handoff.rotation.x = -Math.PI / 2;
  handoff.position.set(boundX, STATIONS.ST2.y + 0.005, boundZ);
  scene.add(handoff);
}

// ── モーダル制御 ───────────────────────────────────────────
const opModal = document.getElementById('op-modal');
function openModal()  { opModal.classList.add('open'); }
function closeModal() { opModal.classList.remove('open'); }

document.getElementById('modal-close').addEventListener('click', closeModal);
opModal.addEventListener('click', e => { if (e.target === opModal) closeModal(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── 3D パネルへのレイキャスター ───────────────────────────
const raycaster = new THREE.Raycaster();
const _mouse    = new THREE.Vector2();
renderer.domElement.addEventListener('click', e => {
  _mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
  _mouse.y = (e.clientY / window.innerHeight) * -2 + 1;
  raycaster.setFromCamera(_mouse, camera);
  if (raycaster.intersectObject(controlPanel.screenMesh).length > 0) openModal();
});

// ソーターがポートへ排出したパレットをロボットが回収
const _SHUTE_Z0   = SORTER_CONFIG.z + SORTER_CONFIG.convWidth / 2;
const _PORT_TGT_Z = _SHUTE_Z0 + SORTER_CONFIG.portZDepth + 0.6;
sorterCtrl.onPortComplete = (label, pallet) => {
  const idx  = sorter.getPortIndex(label);
  const port = sorter.ports[idx];
  robot.assignPickup(pallet, new THREE.Vector3(port.x, 0, _PORT_TGT_Z));
};

// ST2 → コンベア → ソーター のハンドオフ
autoCtrl.onST2Handoff = (pallet, portLabel) => {
  st2Conv.transport(pallet, (m) => sorterCtrl.addSortJob(m, portLabel));
};

// ポート未指定で ST2 に置かれたパレットもロボットが回収
autoCtrl.onST2Place = (pallet, destPos) => {
  robot.assignPickup(pallet, new THREE.Vector3(destPos.x + 1.5, 0, destPos.z + 1.2));
};

// 初期ロード（ラックにパレットをランダムに配置）
const initLoads = [
  /* bay 0 / level 0 (side -1) は ST1 と同座標なので省略 */
                     { side: -1, bay:  2, level: 1 },
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

// ST1 入庫コンベアでパレットを搬送
function spawnST1Pallet() {
  const st = STATIONS.ST1;
  const z  = stationWorldZ(st.side);
  const pallet = loadManager.createPallet(new THREE.Vector3(st1Conv.startX, st.y + 0.28, z));
  st1Conv.transport(pallet);
  return pallet;
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
  const hasST1Load = st1Conv.isTransporting || loadManager.loads.some(
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

  const destPort = document.getElementById('ret-port').value || null;
  scheduler.addJob(JOB_TYPE.RETRIEVE, { sourceSide: side, sourceBay: bay, sourceLevel: level, destPort });
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
  sorter.step(dt);
  sorterCtrl.update(dt);
  st1Conv.step(dt);
  st2Conv.step(dt);
  for (const r of robots) r.update(dt);
  controlPanel.update(dt);

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
  document.getElementById('sorterStatus').textContent = sorterCtrl.statusText;
  document.getElementById('robotStatus').textContent  = robot.statusText;

  // ソーターポート状態更新
  sorter.portStatus.forEach(({ label, count }) => {
    const el = document.getElementById(`port-count-${label}`);
    if (el) el.textContent = count;
  });

  // モータ監視パネル更新
  updateMotorUI('t', crane.travelMotor);
  updateMotorUI('l', crane.liftMotor);
  updateMotorUI('f', crane.forkMotor);
  updateMotorUI('s', sorter.cartMotor);

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
  const pct   = Math.min(250, Math.abs(m.torquePct));
  const barId = ({ t: 'travel', l: 'lift', f: 'fork', s: 'sorter' })[id] ?? id;
  const bar   = document.getElementById(`bar-${barId}`);
  if (bar) {
    bar.style.width = Math.min(100, pct / 2.5) + '%';
    bar.classList.toggle('bar-over', pct > 100);
  }

  const pfx = 'm' + id;
  const rpmEl = document.getElementById(pfx + '-rpm');
  if (rpmEl) rpmEl.textContent = Math.round(m.motorRPM) + ' rpm';
  const trqEl = document.getElementById(pfx + '-trq');
  if (trqEl) {
    trqEl.textContent = m.torquePct.toFixed(1) + ' %';
    trqEl.className   = 'm-val-num' + (Math.abs(m.torquePct) > 100 ? ' hi' : '');
  }
  const curEl = document.getElementById(pfx + '-cur');
  if (curEl) curEl.textContent = m.current.toFixed(1) + ' A';
  const frqEl = document.getElementById(pfx + '-freq');
  if (frqEl) frqEl.textContent = m.frequency.toFixed(1) + ' Hz';
}

// ── カメラ視点切替 ────────────────────────────────────────
document.getElementById('btn-view-sorter')?.addEventListener('click', () => {
  camera.position.set(-6, 8, 14);
  controls.target.set(-6, 1.5, 3);
  controls.update();
});
document.getElementById('btn-view-robot')?.addEventListener('click', () => {
  camera.position.set(-6, 6, 14);
  controls.target.set(-5, 1, 7);
  controls.update();
});
document.getElementById('btn-view-crane')?.addEventListener('click', () => {
  camera.position.set(centerX, topY + 4, 22);
  controls.target.set(centerX, topY / 2, 0);
  controls.update();
});

// ── ユーティリティ ────────────────────────────────────────
function validCell(side, bay, level) {
  return (side === -1 || side === 1)
    && bay >= 0 && bay < RACK_CONFIG.numBays
    && level >= 0 && level < RACK_CONFIG.numLevels;
}
function addrStr(side, bay, level) {
  return `${side < 0 ? 'L' : 'R'}-${bay + 1}-${level + 1}`;
}
