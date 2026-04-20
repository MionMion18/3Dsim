import * as THREE from 'three';
import { InverterMotor } from './InverterMotor.js';

export const SORTER_CONFIG = {
  inputX:    -0.5,   // ST2 入力点 X
  endX:      -11.5,  // コンベア終端 X
  z:          1.5,   // ST2 と同じ Z
  y:          0.26,  // コンベア上面高さ
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

    this.load = null;

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

    // ── ローラー ──
    const rollerCount = Math.floor(convLen / 0.28);
    const rollerGeo   = new THREE.CylinderGeometry(0.038, 0.038, SC.convWidth - 0.05, 8);
    const rollerMat   = this._mat(0x8aaac0, 0.8, 0.2);
    for (let i = 0; i <= rollerCount; i++) {
      const r = new THREE.Mesh(rollerGeo, rollerMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(SC.inputX - i * (convLen / rollerCount), SC.y + 0.003, SC.z);
      this.rootGroup.add(r);
    }

    // ── ガイドレール ──
    const railMat = this._mat(0x2a4060, 0.8, 0.2);
    [-0.42, 0.42].forEach(zo => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(convLen, 0.04, 0.04), railMat);
      rail.position.set(centerX, SC.y + 0.09, SC.z + zo);
      this.rootGroup.add(rail);
    });

    // ── 各ポート ──
    this.ports.forEach(port => {
      const color = SC.portColors[port.index];
      const hex   = '#' + color.toString(16).padStart(6, '0');

      // シュートフレーム
      const shMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.70, 0.08, SC.portZDepth),
        this._mat(color, 0.3, 0.7)
      );
      shMesh.position.set(port.x, SC.y - 0.04, SHUTE_Z0 + SC.portZDepth / 2);
      shMesh.castShadow = true;
      this.rootGroup.add(shMesh);

      // シュート両サイドガイド
      const sgMat = this._mat(color, 0.5, 0.5);
      [-0.35, 0.35].forEach(xo => {
        const sg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, SC.portZDepth), sgMat);
        sg.position.set(port.x + xo, SC.y + 0.05, SHUTE_Z0 + SC.portZDepth / 2);
        this.rootGroup.add(sg);
      });

      // 収集ビン (背面壁)
      const binMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.55, 0.12),
        this._mat(color, 0.4, 0.6)
      );
      binMesh.position.set(port.x, SC.y + 0.30, SHUTE_Z0 + SC.portZDepth + 0.06);
      this.rootGroup.add(binMesh);

      // 床マーカー
      const mkr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
      );
      mkr.rotation.x = -Math.PI / 2;
      mkr.position.set(port.x, 0.01, SC.z);
      this.rootGroup.add(mkr);

      // ラベルスプライト
      this._addLabel(port.label, hex,
        new THREE.Vector3(port.x, SC.y + 0.9, SHUTE_Z0 + SC.portZDepth + 0.1));
    });

    // ── ソーターカート (オレンジ台車) ──
    this.cartGroup = new THREE.Group();
    this.rootGroup.add(this.cartGroup);

    this.cartBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.16, 0.90), this._mat(0xff6600, 0.7, 0.3)
    );
    this.cartBody.castShadow = true;
    this.cartGroup.add(this.cartBody);

    const cwMat = this._mat(0x1a1a1a, 0.9, 0.1);
    [[-0.38, -0.40], [-0.38, 0.40], [0.38, -0.40], [0.38, 0.40]].forEach(([xo, zo]) => {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), cwMat
      );
      w.rotation.x = Math.PI / 2;
      w.position.set(xo, -0.10, zo);
      this.cartGroup.add(w);
    });

    const cLight = new THREE.PointLight(0xff8833, 0.6, 3);
    cLight.position.set(0, 0.15, 0);
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
      mesh.position.set(
        port.x,
        SC.y + 0.28 + stackH * 0.65,
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
