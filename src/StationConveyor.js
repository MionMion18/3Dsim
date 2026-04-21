import * as THREE from 'three';

// ST1 入庫ローラーコンベア: 外部搬入点 → ステーション まで一定速度で搬送
export class StationConveyor {
  constructor(scene, { startX, endX, z, y = 0.18, width = 0.85 }) {
    this.scene  = scene;
    this.startX = startX;
    this.endX   = endX;
    this.z      = z;
    this.y      = y;
    this.width  = width;

    this._beltSpeed = 0.8; // m/s
    this._rollers   = [];
    this._pallet    = null;
    this._arrived   = false;
    this._onArrived = null;

    this._buildMesh();
  }

  _mat(color, metalness = 0.6, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const length  = Math.abs(this.endX - this.startX);
    const centerX = (this.startX + this.endX) / 2;
    const dir     = Math.sign(this.endX - this.startX);

    // フレーム本体
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.06, this.width),
      this._mat(0x4a6080)
    );
    frame.position.set(centerX, this.y - 0.03, this.z);
    frame.castShadow = true;
    this.group.add(frame);

    // 支持脚
    const legGeo   = new THREE.BoxGeometry(0.06, this.y, 0.06);
    const legMat   = this._mat(0x3a5070, 0.7, 0.3);
    const legCount = Math.ceil(length / 1.4);
    for (let i = 0; i <= legCount; i++) {
      const lx = this.startX + dir * (length / legCount) * i;
      [-this.width * 0.38, this.width * 0.38].forEach(dz => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, this.y / 2, this.z + dz);
        this.group.add(leg);
      });
    }

    // ガイドレール (両側)
    const railMat = this._mat(0x2a4060, 0.8, 0.2);
    [-this.width * 0.44, this.width * 0.44].forEach(dz => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.04), railMat);
      rail.position.set(centerX, this.y + 0.06, this.z + dz);
      this.group.add(rail);
    });

    // ローラー (間隔 0.25m)
    const rollerCount = Math.floor(length / 0.25);
    const rollerGeo   = new THREE.CylinderGeometry(0.032, 0.032, this.width - 0.06, 8);
    const rollerMat   = this._mat(0x8aaac0, 0.8, 0.2);
    for (let i = 0; i <= rollerCount; i++) {
      const rg = new THREE.Group();
      rg.position.set(
        this.startX + dir * i * (length / rollerCount),
        this.y,
        this.z
      );
      const r = new THREE.Mesh(rollerGeo, rollerMat);
      r.rotation.z = Math.PI / 2;
      rg.add(r);
      this.group.add(rg);
      this._rollers.push(rg);
    }

    // 進行方向マーカー (黄色矢印風塗装)
    const arrowMat   = new THREE.MeshBasicMaterial({
      color: 0xffcc00, transparent: true, opacity: 0.30,
    });
    const arrowCount = Math.max(1, Math.floor(length / 1.2));
    for (let i = 0; i < arrowCount; i++) {
      const ax = this.startX + dir * (i + 0.5) * (length / arrowCount);
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.16), arrowMat);
      mk.rotation.x = -Math.PI / 2;
      mk.position.set(ax, this.y + 0.002, this.z);
      this.group.add(mk);
    }

    // 始点インジケータランプ (入荷側)
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x33ff88, emissiveIntensity: 0.7 })
    );
    lamp.position.set(this.startX, this.y + 0.20, this.z);
    this.group.add(lamp);
  }

  // パレットを startX に置き endX まで搬送する
  transport(palletMesh, onArrived = null) {
    this._pallet    = palletMesh;
    this._arrived   = false;
    this._onArrived = onArrived;
    palletMesh.position.set(this.startX, this.y + 0.28, this.z);
  }

  step(dt) {
    const omega = this._beltSpeed / 0.032;
    const dir   = Math.sign(this.endX - this.startX);

    // ローラー常時スピン
    for (const rg of this._rollers) {
      rg.rotation.x += dir * omega * dt;
    }

    // パレット搬送中
    if (this._pallet && !this._arrived) {
      const next = this._pallet.position.x + dir * this._beltSpeed * dt;

      if ((dir > 0 && next >= this.endX) || (dir < 0 && next <= this.endX)) {
        this._arrived = true;
        this._pallet.position.x = this.endX;
        this._onArrived?.(this._pallet);
        this._pallet = null;
      } else {
        this._pallet.position.x = next;
      }
    }
  }

  get isTransporting() { return !!this._pallet && !this._arrived; }
}
