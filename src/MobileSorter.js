import * as THREE from 'three';
import { InverterMotor } from './InverterMotor.js';

export const SORTER_CONFIG = {
  inputX:     0.7,   // ST2 入力点 X (rack bay-0 位置に合わせた)
  endX:      -11.5,  // コンベア終端 X
  z:          3.5,   // ST2(z=1.5)の手前(+Z側)に配置し、連結コンベアで接続
  y:          1.2,   // コンベア上面高さ (ST2 と同じ高架レベル)
  convWidth:  0.95,  // フレーム Z 幅
  portLabels: ['A', 'B', 'C', 'D', 'E'],
  portColors: [0xff3333, 0x33cc33, 0x3399ff, 0xffaa00, 0xcc44ff],
  portZDepth: 2.5,   // シュートの Z 方向長さ
};

const SC = SORTER_CONFIG;
const N  = SC.portLabels.length;

const SHUTE_Z0 = SC.z + SC.convWidth / 2; // = 1.975 (シュート開始 Z)

export function portX(i) {
  const span = SC.endX - SC.inputX; // -11.0
  return SC.inputX + span * (i + 1) / (N + 1);
}

export class MobileSorter {
  constructor(scene) {
    this.scene = scene;

    // ソーターカートモータ (2.2 kW / ギア比 5 / 車輪径 φ150)
    this.cartMotor = new InverterMotor({
      name: 'ソーター',
      ratedPower: 2200, ratedRPM: 1480, poles: 4,
      gearRatio: 5,     drumRadius: 0.075, ratedCurrent: 6,
      maxFreq: 50,      maxOutputSpeed: 2.0,
      M_eff: 150,       kFriction: 80, accelRate: 1.5, decelRate: 2.0,
    });
    this.cartMotor.position = SC.inputX;
    this.cartMotor.target   = SC.inputX;

    this.load         = null;
    this._rollers     = []; // メインコンベアローラー
    this._cartRollers = []; // カート上面ローラー

    this.ports = SC.portLabels.map((label, i) => ({
      label, index: i,
      x: portX(i),
      pallets: [],
    }));

    this._buildMesh();
    this._syncCart();
  }

  _mat(color, metal = 0.6, rough = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  }

  _buildMesh() {
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    const convLen = Math.abs(SC.endX - SC.inputX); // 11.0 m
    const centerX = (SC.inputX + SC.endX) / 2;     // -6.0

    // ── 仕分エリア床面拡張 ──
    const floorW = convLen + 1.0;
    const floorD = SHUTE_Z0 + SC.portZDepth + 1.2;
    const extFloor = new THREE.Mesh(
      new THREE.BoxGeometry(floorW, 0.10, floorD),
      new THREE.MeshStandardMaterial({ color: 0x1e2c38, roughness: 0.9, metalness: 0.1 })
    );
    extFloor.position.set(centerX - 0.5, -0.05, floorD / 2);
    extFloor.receiveShadow = true;
    this.rootGroup.add(extFloor);

    const grid = new THREE.GridHelper(Math.max(floorW, floorD), 20, 0x1a2a38, 0x0d1520);
    grid.position.set(centerX - 0.5, 0.01, floorD / 2);
    this.rootGroup.add(grid);

    // ── メインコンベアフレーム ──
    const frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(convLen, 0.10, SC.convWidth),
      this._mat(0x4a6080)
    );
    frameMesh.position.set(centerX, SC.y - 0.05, SC.z);
    frameMesh.castShadow = true;
    this.rootGroup.add(frameMesh);

    // ── ローラー (グループ化でスピンアニメ対応) ──
    const rollerCount = Math.floor(convLen / 0.28);
    const rollerGeo   = new THREE.CylinderGeometry(0.038, 0.038, SC.convWidth - 0.05, 8);
    const rollerMat   = this._mat(0x8aaac0, 0.8, 0.2);
    for (let i = 0; i <= rollerCount; i++) {
      const rg = new THREE.Group();
      rg.position.set(SC.inputX - i * (convLen / rollerCount), SC.y + 0.003, SC.z);
      const r = new THREE.Mesh(rollerGeo, rollerMat);
      r.rotation.z = Math.PI / 2;
      rg.add(r);
      this.rootGroup.add(rg);
      this._rollers.push(rg);
    }

    // ── ガイドレール ──
    const railMat = this._mat(0x2a4060, 0.8, 0.2);
    [-0.42, 0.42].forEach(zo => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(convLen, 0.04, 0.04), railMat);
      rail.position.set(centerX, SC.y + 0.09, SC.z + zo);
      this.rootGroup.add(rail);
    });

    // ── 高架支持脚 (2m ピッチ × 両側) ──
    const legMat   = this._mat(0x3a5070, 0.8, 0.3);
    const legCount = 7;
    for (let i = 0; i <= legCount; i++) {
      const lx = SC.inputX - i * (convLen / legCount);
      [SC.z - SC.convWidth / 2 - 0.08, SC.z + SC.convWidth / 2 + 0.08].forEach(lz => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, SC.y, 0.10), legMat);
        leg.position.set(lx, SC.y / 2, lz);
        leg.castShadow = true;
        this.rootGroup.add(leg);
      });
    }

    // ── 各ポート ──
    const shuteLen   = Math.sqrt(SC.portZDepth * SC.portZDepth + SC.y * SC.y);
    const shuteAngle = Math.atan2(SC.y, SC.portZDepth); // 傾斜角 (高架→地面)

    this.ports.forEach(port => {
      const color = SC.portColors[port.index];
      const hex   = '#' + color.toString(16).padStart(6, '0');

      // 傾斜シュートフレーム (SC.y → 地面)
      const shMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.70, 0.08, shuteLen),
        this._mat(color, 0.3, 0.7)
      );
      shMesh.position.set(port.x, SC.y / 2, SHUTE_Z0 + SC.portZDepth / 2);
      shMesh.rotation.x = shuteAngle;
      shMesh.castShadow = true;
      this.rootGroup.add(shMesh);

      // 傾斜サイドガイド
      const sgMat = this._mat(color, 0.5, 0.5);
      [-0.35, 0.35].forEach(xo => {
        const sg = new THREE.Mesh(new THREE.BoxGeometry(0.04, SC.y * 0.9, shuteLen), sgMat);
        sg.position.set(port.x + xo, SC.y / 2, SHUTE_Z0 + SC.portZDepth / 2);
        sg.rotation.x = shuteAngle;
        this.rootGroup.add(sg);
      });

      // 収集ビン (地面レベル)
      const binMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.55, 0.12),
        this._mat(color, 0.4, 0.6)
      );
      binMesh.position.set(port.x, 0.30, SHUTE_Z0 + SC.portZDepth + 0.06);
      this.rootGroup.add(binMesh);

      // 床マーカー (シュート終端)
      const mkr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
      );
      mkr.rotation.x = -Math.PI / 2;
      mkr.position.set(port.x, 0.01, SHUTE_Z0 + SC.portZDepth - 0.3);
      this.rootGroup.add(mkr);

      // ラベルスプライト
      this._addLabel(port.label, hex,
        new THREE.Vector3(port.x, SC.y + 0.9, SHUTE_Z0 + SC.portZDepth + 0.1));
    });

    // ── ソーターカート (Toyota Mobile Sorter 風) ──
    this.cartGroup = new THREE.Group();
    this.rootGroup.add(this.cartGroup);

    const cWhite   = this._mat(0xf2f2f2, 0.12, 0.40);
    const cDark    = this._mat(0x181820, 0.88, 0.20);
    const cRail    = this._mat(0x2a2a2a, 0.90, 0.15);
    const cStripeR = this._mat(0xdd2200, 0.15, 0.65);
    const cStripeB = this._mat(0x111111, 0.40, 0.55);
    const cRoller  = this._mat(0x223344, 0.70, 0.30);

    // 下部ダーク台座
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.10, 1.05), cDark);
    base.position.set(0, -0.10, 0);
    base.castShadow = true;
    this.cartGroup.add(base);

    // 白いメインボディ
    this.cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 1.05), cWhite);
    this.cartBody.castShadow = true;
    this.cartGroup.add(this.cartBody);

    // 側面ストライプ（赤 + 黒）×前後2面
    [-0.525, 0.525].forEach(zo => {
      const sr = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.024, 0.018), cStripeR);
      sr.position.set(0, -0.022, zo);
      this.cartGroup.add(sr);
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.015, 0.018), cStripeB);
      sb.position.set(0, -0.044, zo);
      this.cartGroup.add(sb);
    });

    // 上面ローラー群（軸 X 方向、Z 方向に9本配列）
    const cRollerGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.66, 8);
    const rollerN = 9;
    for (let i = 0; i < rollerN; i++) {
      const rg = new THREE.Group();
      rg.position.set(0, 0.082, -0.44 + i * (0.88 / (rollerN - 1)));
      const r = new THREE.Mesh(cRollerGeo, cRoller);
      r.rotation.z = Math.PI / 2;
      rg.add(r);
      this.cartGroup.add(rg);
      this._cartRollers.push(rg);
    }

    // レールガイドフランジ（前後底面）
    [-0.34, 0.34].forEach(zo => {
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.055, 0.075), cRail);
      fl.position.set(0, -0.178, zo);
      this.cartGroup.add(fl);
    });

    // ラベルスプライト（前面）
    this._addCartLabel();

    const cLight = new THREE.PointLight(0xaaddff, 0.35, 3);
    cLight.position.set(0, 0.20, 0);
    this.cartGroup.add(cLight);

  }

  _addLabel(text, hexColor, pos) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.roundRect(2, 2, 124, 60, 8);
    ctx.fill();
    ctx.fillStyle = hexColor;
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 34);
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.55, 0.28, 1);
    sprite.position.copy(pos);
    this.rootGroup.add(sprite);
  }

  _addCartLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#dd2200';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TOYOTA', 10, 24);
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Mobile Sorter', 246, 48);
    ctx.strokeStyle = '#dd2200';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(256, 34); ctx.stroke();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(256, 40); ctx.stroke();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true,
    }));
    sprite.scale.set(0.55, 0.14, 1);
    sprite.position.set(0, 0.01, -0.54);
    this.cartGroup.add(sprite);
  }

  // ── 制御 ──────────────────────────────────────────────────
  moveToPort(index)  { this.cartMotor.setTarget(this.ports[index].x); }
  moveToInput()      { this.cartMotor.setTarget(SC.inputX); }

  isAtPort(index) {
    return this.cartMotor.isIdle
        && Math.abs(this.cartMotor.position - this.ports[index].x) < 0.06;
  }
  isAtInput() {
    return this.cartMotor.isIdle
        && Math.abs(this.cartMotor.position - SC.inputX) < 0.06;
  }

  attachLoad(mesh) {
    this.load = mesh;
    this.cartMotor.M_eff = 450; // カート + パレット荷重増
  }
  detachLoad() {
    const m = this.load;
    this.load = null;
    this.cartMotor.M_eff = 150;
    return m;
  }

  ejectToPort(index) {
    const port = this.ports[index];
    const mesh = this.detachLoad();
    if (mesh) {
      const stackH = port.pallets.length;
      // シュートを滑り下りて地面に積まれるイメージ
      mesh.position.set(
        port.x,
        0.28 + stackH * 0.28,
        SHUTE_Z0 + SC.portZDepth * 0.65
      );
      port.pallets.push(mesh);
    }
    return mesh;
  }

  // ── 毎フレーム ────────────────────────────────────────────
  step(dt) {
    this.cartMotor.step(dt);
    this._syncCart();

    // メインコンベアローラースピン
    const omega = this.cartMotor.velocity / 0.038;
    for (const rg of this._rollers) rg.rotation.x += omega * dt;

    // カート上面ローラースピン（走行速度に連動）
    const cartOmega = this.cartMotor.velocity / 0.026;
    for (const rg of this._cartRollers) rg.rotation.x += cartOmega * dt;

    if (this.load) {
      this.load.position.set(this.cartMotor.position, SC.y + 0.28, SC.z);
    }
  }

  _syncCart() {
    this.cartGroup.position.set(this.cartMotor.position, SC.y + 0.08, SC.z);
  }

  getPortIndex(label) { return this.ports.findIndex(p => p.label === label); }

  get portStatus() {
    return this.ports.map(p => ({ label: p.label, count: p.pallets.length }));
  }
}
