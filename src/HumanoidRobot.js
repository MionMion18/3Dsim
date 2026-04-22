import * as THREE from 'three';

const HOME       = new THREE.Vector3(-6.0, 0, 7.0);
const COLLECTION = new THREE.Vector3(-3.5, 0, 7.2);
const WALK_SPEED = 1.5;

export class HumanoidRobot {
  constructor(scene, homePos = HOME, collectPos = COLLECTION) {
    this.scene        = scene;
    this._homePos     = homePos.clone();
    this._collectPos  = collectPos.clone();
    this._state       = 'IDLE';
    this._target      = homePos.clone();
    this._pallet      = null;
    this._queue       = [];
    this._animT       = 0;
    this._stackCount  = 0;
    this.statusText   = 'ロボット待機';

    this._buildMesh();
    this._group.position.copy(homePos);
  }

  assignPickup(pallet, worldPos) {
    this._queue.push({ pallet, pos: worldPos.clone() });
  }

  update(dt) {
    this._animT += dt;

    if (this._state === 'IDLE' && this._queue.length) {
      const { pallet, pos } = this._queue.shift();
      this._pallet = pallet;
      this._target.copy(pos);
      this._state  = 'WALK_TO_ST';
      this._animT  = 0;
      this.statusText = 'ポートへ向かう';
    }

    switch (this._state) {
      case 'IDLE':
        this._idleAnim();
        break;

      case 'WALK_TO_ST':
        this._walkToward(this._target, dt);
        this._walkAnim();
        if (this._distTo(this._target) < 0.45) {
          this._state = 'PICKUP_ANIM';
          this._animT = 0;
          this.statusText = '荷物を掴む';
        }
        break;

      case 'PICKUP_ANIM': {
        const t = Math.min(1, this._animT / 0.7);
        this._torsoGroup.rotation.x = t * 0.72;
        this._leftArm.rotation.x    = t * 0.92;
        this._rightArm.rotation.x   = t * 0.92;
        this._group.position.y      = 0;
        if (t >= 1) {
          if (this._pallet) {
            this._group.add(this._pallet);
            this._pallet.position.set(0, 0.94, 0.34);
          }
          this._state = 'WALK_HOME';
          this._animT = 0;
          this.statusText = 'ホームへ搬送中';
        }
        break;
      }

      case 'WALK_HOME':
        this._torsoGroup.rotation.x = Math.max(0, this._torsoGroup.rotation.x - dt * 1.6);
        this._walkToward(this._homePos, dt);
        this._walkAnim();
        if (this._distTo(this._homePos) < 0.4) {
          this._state = 'PUTDOWN_ANIM';
          this._animT = 0;
          this.statusText = '荷物を置く';
        }
        break;

      case 'PUTDOWN_ANIM': {
        const t = Math.min(1, this._animT / 0.7);
        this._torsoGroup.rotation.x = t * 0.72;
        this._leftArm.rotation.x    = t * 0.92;
        this._rightArm.rotation.x   = t * 0.92;
        this._group.position.y      = 0;
        if (t >= 1) {
          if (this._pallet) {
            this.scene.add(this._pallet);
            const n   = this._stackCount++;
            const col = n % 4;
            const row = Math.floor(n / 4);
            this._pallet.position.set(
              this._collectPos.x + col * 0.62,
              0.28 + row * 0.28,
              this._collectPos.z
            );
            this._pallet = null;
          }
          this._state = 'STAND_UP';
          this._animT = 0;
          this.statusText = '起き上がり中';
        }
        break;
      }

      case 'STAND_UP': {
        const t = Math.min(1, this._animT / 0.6);
        this._torsoGroup.rotation.x = 0.72 * (1 - t);
        this._leftArm.rotation.x    = Math.max(0.05, 0.92 * (1 - t));
        this._rightArm.rotation.x   = Math.max(0.05, 0.92 * (1 - t));
        this._group.position.y      = 0;
        if (t >= 1) {
          this._torsoGroup.rotation.x = 0;
          this._leftArm.rotation.x    = 0.05;
          this._rightArm.rotation.x   = 0.05;
          this._state = 'IDLE';
          this.statusText = 'ロボット待機';
        }
        break;
      }
    }
  }

  _idleAnim() {
    const t = this._animT;
    this._torsoGroup.scale.y   = 1 + Math.sin(t * 0.9)  * 0.006;
    this._headGroup.rotation.y = Math.sin(t * 0.38) * 0.12;
    this._leftArm.rotation.x   = 0.05;
    this._rightArm.rotation.x  = 0.05;
    this._leftLeg.rotation.x   = 0;
    this._rightLeg.rotation.x  = 0;
    this._group.position.y     = 0;
  }

  _walkAnim() {
    const s = Math.sin(this._animT * 6.5) * 0.42;
    this._leftLeg.rotation.x  =  s;
    this._rightLeg.rotation.x = -s;
    this._leftArm.rotation.x  = -s * 0.38;
    this._rightArm.rotation.x =  s * 0.38;
    this._group.position.y    = Math.abs(Math.sin(this._animT * 6.5)) * 0.028;
  }

  _walkToward(target, dt) {
    const dx   = target.x - this._group.position.x;
    const dz   = target.z - this._group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return;
    const step = Math.min(WALK_SPEED * dt, dist);
    this._group.position.x += (dx / dist) * step;
    this._group.position.z += (dz / dist) * step;
    this._group.rotation.y  = Math.atan2(dx, dz);
  }

  _distTo(pos) {
    const dx = pos.x - this._group.position.x;
    const dz = pos.z - this._group.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  get isIdle() { return this._state === 'IDLE'; }

  // ── メッシュ構築 ──────────────────────────────────────────
  _buildMesh() {
    this._group = new THREE.Group();
    this.scene.add(this._group);

    const white  = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.20, roughness: 0.30 });
    const offWh  = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.18, roughness: 0.38 });
    const dark   = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.75, roughness: 0.22 });
    const joint  = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.80, roughness: 0.18 });
    const eyeGl  = new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x1166cc, emissiveIntensity: 1.4 });
    const indGl  = new THREE.MeshStandardMaterial({ color: 0x0088cc, emissive: 0x004488, emissiveIntensity: 0.8 });

    // ── 胴体グループ (腰ピボット y=0.85) ──
    this._torsoGroup = new THREE.Group();
    this._torsoGroup.position.set(0, 0.85, 0);
    this._group.add(this._torsoGroup);

    // 骨盤ジョイント
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 12), joint);
    pelvis.position.set(0, 0.06, 0);
    this._torsoGroup.add(pelvis);

    // 胴体パネル（下部→上部で幅が広がる）
    [-1, 1].forEach(s => {
      const lo = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.20), white);
      lo.position.set(s * 0.095, 0.19, 0);
      lo.castShadow = true;
      this._torsoGroup.add(lo);

      const hi = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.22), white);
      hi.position.set(s * 0.115, 0.38, 0);
      hi.castShadow = true;
      this._torsoGroup.add(hi);
    });

    // 胴体中央フレーム
    const cframe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.22), dark);
    cframe.position.set(0, 0.27, 0);
    this._torsoGroup.add(cframe);

    // 胸部インジケーター（発光）
    const indic = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.03), indGl);
    indic.position.set(0, 0.33, 0.12);
    this._torsoGroup.add(indic);

    // 肩ヨーク（横ブリッジ）
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.22), dark);
    yoke.position.set(0, 0.47, 0);
    this._torsoGroup.add(yoke);

    // ネック
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.054, 0.12, 10), joint);
    neck.position.set(0, 0.54, 0);
    this._torsoGroup.add(neck);

    // ── 頭 ──
    this._headGroup = new THREE.Group();
    this._headGroup.position.set(0, 0.66, 0);
    this._torsoGroup.add(this._headGroup);

    // 頭部本体（ダーク）
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.30, 0.24), dark);
    head.castShadow = true;
    this._headGroup.add(head);

    // 頭頂部白キャップ
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.10, 12), white);
    cap.position.set(0, 0.20, 0);
    this._headGroup.add(cap);

    // 額パネル（白）
    const forehead = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.08, 0.03), white);
    forehead.position.set(0, 0.10, 0.13);
    this._headGroup.add(forehead);

    // 頬パネル左右（白）
    [-0.082, 0.082].forEach(xo => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.13, 0.035), white);
      cheek.position.set(xo, -0.01, 0.13);
      this._headGroup.add(cheek);
    });

    // 顎パネル（白）
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.035), white);
    jaw.position.set(0, -0.10, 0.13);
    this._headGroup.add(jaw);

    // 眉（ダーク細ボックス×2）
    [-0.065, 0.065].forEach(xo => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.014, 0.022), dark);
      brow.position.set(xo, 0.076, 0.148);
      this._headGroup.add(brow);
    });

    // 目ソケット（ダーク凹み）
    [-0.065, 0.065].forEach(xo => {
      const socket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.040, 0.038), dark);
      socket.position.set(xo, 0.040, 0.136);
      this._headGroup.add(socket);
    });

    // 目（発光スフィア）
    [-0.065, 0.065].forEach(xo => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 8), eyeGl);
      eye.position.set(xo, 0.040, 0.158);
      this._headGroup.add(eye);
    });

    // 鼻（白小ボックス突き出し）
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.038, 0.038), white);
    nose.position.set(0, 0.005, 0.153);
    this._headGroup.add(nose);

    // 口スリット（ダーク細ボックス）
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.015, 0.028), dark);
    mouth.position.set(0, -0.054, 0.148);
    this._headGroup.add(mouth);

    // ── 腕 ──
    this._leftArm  = this._makeArm(white, offWh, dark, joint, -1);
    this._rightArm = this._makeArm(white, offWh, dark, joint,  1);

    // ── 脚 ──
    this._leftLeg  = this._makeLeg(white, offWh, joint, -1);
    this._rightLeg = this._makeLeg(white, offWh, joint,  1);
  }

  _makeArm(white, offWh, dark, joint, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.265, 0.44, 0);
    this._torsoGroup.add(g);

    // 肩デルトイドキャップ（白球）
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), white);
    g.add(deltoid);

    // 上腕（白シリンダー）
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.044, 0.24, 10), white);
    upper.position.set(0, -0.15, 0);
    upper.castShadow = true;
    g.add(upper);

    // 肘ジョイント
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), joint);
    elbow.position.set(0, -0.29, 0);
    g.add(elbow);

    // 前腕（やや細め off-white）
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.036, 0.22, 10), offWh);
    fore.position.set(0, -0.41, 0);
    g.add(fore);

    // 手首ジョイント
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), joint);
    wrist.position.set(0, -0.53, 0);
    g.add(wrist);

    // ハンド（ダーク）
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.08), dark);
    hand.position.set(0, -0.60, 0);
    g.add(hand);

    return g;
  }

  _makeLeg(white, offWh, joint, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.11, 0.85, 0);
    this._group.add(g);

    // ヒップジョイント球
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), joint);
    g.add(hip);

    // 大腿部（白シリンダー）
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.060, 0.38, 12), white);
    thigh.position.set(0, -0.22, 0);
    thigh.castShadow = true;
    g.add(thigh);

    // 膝蓋骨プレート（白・前面突き出し）
    const kneeCap = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.06), white);
    kneeCap.position.set(0, -0.43, 0.07);
    g.add(kneeCap);

    // 膝ジョイント
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), joint);
    knee.position.set(0, -0.43, 0);
    g.add(knee);

    // 下腿部（off-white・少し細め）
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.36, 12), offWh);
    calf.position.set(0, -0.64, 0);
    g.add(calf);

    // 足首ジョイント
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), joint);
    ankle.position.set(0, -0.84, 0);
    g.add(ankle);

    // フットプレート（白・つま先方向）
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.28), white);
    foot.position.set(0, -0.88, 0.06);
    g.add(foot);

    // かかと（白・後方）
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.10), white);
    heel.position.set(0, -0.88, -0.09);
    g.add(heel);

    return g;
  }
}
