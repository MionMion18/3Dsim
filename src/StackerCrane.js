import * as THREE from 'three';
import { InverterMotor } from './InverterMotor.js';
import { RACK_CONFIG } from './Warehouse.js';

const C = RACK_CONFIG;

export function bayToWorldX(bay)   { return bay * C.bayWidth + C.bayWidth / 2; }
export function levelToWorldY(lvl) { return (lvl + 1) * C.levelHeight; }
export function sideToForkZ(side)  { return side * (C.aisleWidth / 2 + C.depth / 2); }

export class StackerCrane {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physics = physicsWorld;
    this.emergency = false;

    // ── 走行モータ (11kW / 4P / ギア比8 / 車輪径φ300) ────
    this.travelMotor = new InverterMotor({
      name: '走行', ratedPower: 11000, ratedRPM: 1480, poles: 4,
      gearRatio: 8,  drumRadius: 0.15, ratedCurrent: 22,
      maxFreq: 50,   maxOutputSpeed: 3.0,
      M_eff: 1800,   kFriction: 320, accelRate: 1.2, decelRate: 1.8,
    });

    // ── 昇降モータ (7.5kW / 4P / ギア比10 / ドラム径φ200) ─
    this.liftMotor = new InverterMotor({
      name: '昇降', ratedPower: 7500,  ratedRPM: 1480, poles: 4,
      gearRatio: 10, drumRadius: 0.10, ratedCurrent: 16,
      maxFreq: 50,   maxOutputSpeed: 1.5,
      M_eff: 300,    kFriction: 120, accelRate: 0.8, decelRate: 1.2,
    });
    this.liftMotor.loadForce = 80 * 9.81; // 昇降台自重 80 kg

    // ── フォークモータ (1.5kW / 4P / ギア比9) ─────────────
    this.forkMotor = new InverterMotor({
      name: 'フォーク', ratedPower: 1500, ratedRPM: 1480, poles: 4,
      gearRatio: 9,  drumRadius: 0.05, ratedCurrent: 4,
      maxFreq: 50,   maxOutputSpeed: 0.9,
      M_eff: 80,     kFriction: 60, accelRate: 2.0, decelRate: 2.0,
    });

    this.load = null;
    this._loadOffset = new THREE.Vector3(0, 0.28, 0);

    this._buildMesh();

    // 初期位置
    this.travelMotor.position = -0.5;
    this.liftMotor.position   =  0.18;
    this.forkMotor.position   =  0;
    this._syncMesh();
  }

  _mat(color, metalness = 0.7, roughness = 0.3) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 走行台車
    this.cartMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 1.05), this._mat(0x2a4a7a));
    this.cartMesh.castShadow = true;
    this.group.add(this.cartMesh);

    // 車輪
    const wGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.07, 14);
    const wMat = this._mat(0x1a2a3a, 0.9, 0.1);
    [[-0.18, -0.42], [-0.18, 0.42], [0.18, -0.42], [0.18, 0.42]].forEach(([xo, zo]) => {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(xo, -0.1, zo);
      this.group.add(w);
    });

    // マスト
    const mastH   = C.numLevels * C.levelHeight + 0.9;
    const mastGeo = new THREE.BoxGeometry(0.09, mastH, 0.09);
    const mastMat = this._mat(0x3a5a8a);

    this.mastL = new THREE.Mesh(mastGeo, mastMat);
    this.mastL.position.set(0, mastH / 2, -0.40);
    this.mastL.castShadow = true;
    this.group.add(this.mastL);

    this.mastR = new THREE.Mesh(mastGeo, mastMat);
    this.mastR.position.set(0, mastH / 2,  0.40);
    this.mastR.castShadow = true;
    this.group.add(this.mastR);

    const topMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.89), mastMat);
    topMesh.position.set(0, mastH, 0);
    this.group.add(topMesh);

    // 昇降台
    this.liftGroup = new THREE.Group();
    this.group.add(this.liftGroup);

    this.liftBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.10, 0.88), this._mat(0x4a6090));
    this.liftBase.castShadow = true;
    this.liftGroup.add(this.liftBase);

    const rMat = this._mat(0x8aaac0, 0.9, 0.1);
    [-0.43, 0.43].forEach(zo => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), rMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(0.02, 0, zo);
      this.liftGroup.add(r);
    });

    const guideMat = this._mat(0x5a7090, 0.6, 0.4);
    [-0.18, 0.18].forEach(xo => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.04), guideMat);
      g.position.set(xo, -0.07, 0);
      this.liftGroup.add(g);
    });

    // フォーク (Z方向スライド)
    this.forkGroup = new THREE.Group();
    this.liftGroup.add(this.forkGroup);

    const fbase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.14), this._mat(0x5a7aaa));
    fbase.position.set(0, -0.075, 0);
    this.forkGroup.add(fbase);

    const tineMat = this._mat(0x6a8abb, 0.8, 0.2);
    [-0.17, 0.17].forEach(xo => {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.72), tineMat);
      tine.position.set(xo, -0.10, 0);
      tine.castShadow = true;
      this.forkGroup.add(tine);
    });

    const headlight = new THREE.PointLight(0x88aaff, 0.7, 4);
    headlight.position.set(0.3, 0.15, 0);
    this.liftGroup.add(headlight);
  }

  // ── モータ指令 ───────────────────────────────────────────
  travelTo(x) { this.travelMotor.setTarget(x); }
  liftTo(y)   { this.liftMotor.setTarget(y); }

  extendFork(side) {
    this.forkMotor.setTarget(side === 0 ? 0 : sideToForkZ(side));
  }

  setSpeedFactor(f) {
    const k = f / 5;
    this.travelMotor.setMaxSpeed(3.0 * k);
    this.liftMotor.setMaxSpeed(1.5 * k);
    this.forkMotor.setMaxSpeed(0.9 * k);
  }

  emergencyStop() {
    this.travelMotor.running = false;
    this.liftMotor.running   = false;
    this.forkMotor.running   = false;
    this.emergency = true;
  }

  resume() { this.emergency = false; }

  // ── 毎フレーム更新 ───────────────────────────────────────
  update(dt) {
    const eff = this.emergency ? 0 : dt;
    this.travelMotor.step(eff);
    this.liftMotor.step(eff);
    this.forkMotor.step(eff);
    this._syncMesh();

    if (this.load) {
      const wp = new THREE.Vector3();
      this.forkGroup.getWorldPosition(wp);
      this.load.position.copy(wp).add(this._loadOffset);
    }
  }

  _syncMesh() {
    this.group.position.set(this.travelMotor.position, 0, 0);
    this.liftGroup.position.y = this.liftMotor.position;
    this.forkGroup.position.z = this.forkMotor.position;
  }

  // 搭載時 → 昇降モータの重力荷重を増加（電流・トルクが上昇）
  attachLoad(mesh) {
    this.load = mesh;
    this.liftMotor.loadForce = (80 + 300) * 9.81;
  }

  detachLoad() {
    const m = this.load;
    this.load = null;
    this.liftMotor.loadForce = 80 * 9.81;
    return m;
  }

  get pos() {
    return { x: this.travelMotor.position, y: this.liftMotor.position, fork: this.forkMotor.position };
  }

  get travelSpeed() { return this.travelMotor.speed; }

  get isIdle() {
    return this.travelMotor.isIdle && this.liftMotor.isIdle && this.forkMotor.isIdle;
  }

  get forkWorldPos() {
    const wp = new THREE.Vector3();
    this.forkGroup.getWorldPosition(wp);
    return wp;
  }
}
