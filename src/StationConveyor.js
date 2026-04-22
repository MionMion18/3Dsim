import * as THREE from 'three';

// 軸非依存ローラーコンベア
//   X 軸モード: { startX, endX, z, y?, width? }
//   Z 軸モード: { startZ, endZ, x, y?, width? }
export class StationConveyor {
  constructor(scene, opts) {
    this.scene = scene;
    this.y     = opts.y     ?? 0.18;
    this.width = opts.width ?? 0.85;

    if (opts.startZ !== undefined) {
      this._axis  = 'z';
      this._start = opts.startZ;
      this._end   = opts.endZ;
      this._cross = opts.x;
    } else {
      this._axis  = 'x';
      this._start = opts.startX;
      this._end   = opts.endX;
      this._cross = opts.z;
    }

    this._beltSpeed = 0.8;
    this._rollers   = [];
    this._pallet    = null;
    this._arrived   = false;
    this._onArrived = null;

    this._buildMesh();
  }

  // 後方互換 getter
  get startX() { return this._axis === 'x' ? this._start : this._cross; }
  get endX()   { return this._axis === 'x' ? this._end   : this._cross; }
  get z()      { return this._axis === 'x' ? this._cross : (this._start + this._end) / 2; }

  _mat(color, metalness = 0.6, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  _place(obj, along, cross, y = this.y) {
    if (this._axis === 'z') obj.position.set(cross, y, along);
    else                    obj.position.set(along, y, cross);
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const length = Math.abs(this._end - this._start);
    const center = (this._start + this._end) / 2;
    const dir    = Math.sign(this._end - this._start);
    const isZ    = this._axis === 'z';

    // フレーム
    const frame = new THREE.Mesh(
      isZ
        ? new THREE.BoxGeometry(this.width, 0.06, length)
        : new THREE.BoxGeometry(length, 0.06, this.width),
      this._mat(0x4a6080)
    );
    this._place(frame, center, this._cross, this.y - 0.03);
    frame.castShadow = true;
    this.group.add(frame);

    // 支持脚
    const legGeo   = new THREE.BoxGeometry(0.06, this.y, 0.06);
    const legMat   = this._mat(0x3a5070, 0.7, 0.3);
    const legCount = Math.max(1, Math.ceil(length / 1.4));
    for (let i = 0; i <= legCount; i++) {
      const lp = this._start + dir * (length / legCount) * i;
      [-this.width * 0.38, this.width * 0.38].forEach(d => {
        const leg = new THREE.Mesh(legGeo, legMat);
        this._place(leg, lp, this._cross + d, this.y / 2);
        this.group.add(leg);
      });
    }

    // ガイドレール (両側)
    const railMat = this._mat(0x2a4060, 0.8, 0.2);
    [-this.width * 0.44, this.width * 0.44].forEach(d => {
      const rail = new THREE.Mesh(
        isZ
          ? new THREE.BoxGeometry(0.04, 0.04, length)
          : new THREE.BoxGeometry(length, 0.04, 0.04),
        railMat
      );
      this._place(rail, center, this._cross + d, this.y + 0.06);
      this.group.add(rail);
    });

    // ローラー
    const rollerCount = Math.max(1, Math.floor(length / 0.25));
    const rollerGeo   = new THREE.CylinderGeometry(0.032, 0.032, this.width - 0.06, 8);
    const rollerMat   = this._mat(0x8aaac0, 0.8, 0.2);
    for (let i = 0; i <= rollerCount; i++) {
      const rg = new THREE.Group();
      const rp = this._start + dir * i * (length / rollerCount);
      this._place(rg, rp, this._cross, this.y);
      const r = new THREE.Mesh(rollerGeo, rollerMat);
      // シリンダー軸は X 方向（X搬送なら搬送方向・Z搬送なら搬送に直交＝横並びローラー）
      r.rotation.z = Math.PI / 2;
      rg.add(r);
      this.group.add(rg);
      this._rollers.push(rg);
    }

    // 進行方向マーカー
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00, transparent: true, opacity: 0.30,
    });
    const arrowCount = Math.max(1, Math.floor(length / 1.2));
    for (let i = 0; i < arrowCount; i++) {
      const ap = this._start + dir * (i + 0.5) * (length / arrowCount);
      const mk = new THREE.Mesh(
        isZ ? new THREE.PlaneGeometry(0.16, 0.36) : new THREE.PlaneGeometry(0.36, 0.16),
        arrowMat
      );
      mk.rotation.x = -Math.PI / 2;
      this._place(mk, ap, this._cross, this.y + 0.002);
      this.group.add(mk);
    }

    // 始点インジケータランプ
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x33ff88, emissiveIntensity: 0.7 })
    );
    this._place(lamp, this._start, this._cross, this.y + 0.20);
    this.group.add(lamp);
  }

  transport(palletMesh, onArrived = null) {
    this._pallet    = palletMesh;
    this._arrived   = false;
    this._onArrived = onArrived;
    if (this._axis === 'z') palletMesh.position.set(this._cross, this.y + 0.28, this._start);
    else                    palletMesh.position.set(this._start, this.y + 0.28, this._cross);
  }

  step(dt) {
    const omega = this._beltSpeed / 0.032;
    const dir   = Math.sign(this._end - this._start);

    // シリンダー軸 (X) まわりの回転 = ローラーの自転
    for (const rg of this._rollers) rg.rotation.x += dir * omega * dt;

    if (this._pallet && !this._arrived) {
      const isZ  = this._axis === 'z';
      const curr = isZ ? this._pallet.position.z : this._pallet.position.x;
      const next = curr + dir * this._beltSpeed * dt;

      if ((dir > 0 && next >= this._end) || (dir < 0 && next <= this._end)) {
        this._arrived = true;
        if (isZ) this._pallet.position.z = this._end;
        else     this._pallet.position.x = this._end;
        this._onArrived?.(this._pallet);
        this._pallet = null;
      } else {
        if (isZ) this._pallet.position.z = next;
        else     this._pallet.position.x = next;
      }
    }
  }

  get isTransporting() { return !!this._pallet && !this._arrived; }
}
