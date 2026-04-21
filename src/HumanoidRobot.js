import * as THREE from 'three';

const HOME       = new THREE.Vector3(-6.0, 0, 7.0);
const COLLECTION = new THREE.Vector3(-3.5, 0, 7.2);
const WALK_SPEED = 1.5;

export class HumanoidRobot {
  constructor(scene) {
    this.scene       = scene;
    this._state      = 'IDLE';
    this._target     = new THREE.Vector3().copy(HOME);
    this._pallet     = null;
    this._queue      = [];
    this._animT      = 0;
    this._stackCount = 0;
    this.statusText  = 'ロボット待機';

    this._buildMesh();
    this._group.position.copy(HOME);
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
        this._walkToward(HOME, dt);
        this._walkAnim();
        if (this._distTo(HOME) < 0.4) {
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
              COLLECTION.x + col * 0.62,
              0.28 + row * 0.28,
              COLLECTION.z
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

    const skin  = new THREE.MeshStandardMaterial({ color: 0xffc090, roughness: 0.6 });
    const suit  = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x80d4ff, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.75 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.4, metalness: 0.7 });
    const vestM = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.4 });
    const glow  = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.0 });

    // ── 胴体グループ (腰ピボット y=0.85) ──
    this._torsoGroup = new THREE.Group();
    this._torsoGroup.position.set(0, 0.85, 0);
    this._group.add(this._torsoGroup);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.22), suit);
    torso.position.set(0, 0.24, 0);
    torso.castShadow = true;
    this._torsoGroup.add(torso);

    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.30, 0.23), vestM);
    vestMesh.position.set(0, 0.28, 0);
    this._torsoGroup.add(vestMesh);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 12), dark);
    waist.position.set(0, 0.04, 0);
    this._torsoGroup.add(waist);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), suit);
    neck.position.set(0, 0.52, 0);
    this._torsoGroup.add(neck);

    // ── 頭 ──
    this._headGroup = new THREE.Group();
    this._headGroup.position.set(0, 0.64, 0);
    this._torsoGroup.add(this._headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.32, 0.28), suit);
    head.castShadow = true;
    this._headGroup.add(head);

    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.04), visor);
    visorMesh.position.set(0, 0.04, 0.15);
    this._headGroup.add(visorMesh);

    const antShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 6), dark);
    antShaft.position.set(0.09, 0.26, 0);
    this._headGroup.add(antShaft);

    const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), glow);
    antBall.position.set(0.09, 0.36, 0);
    this._headGroup.add(antBall);

    // ── 腕 ──
    this._leftArm  = this._makeArm(suit, skin, -1);
    this._rightArm = this._makeArm(suit, skin,  1);

    // ── 脚 ──
    this._leftLeg  = this._makeLeg(suit, dark, -1);
    this._rightLeg = this._makeLeg(suit, dark,  1);
  }

  _makeArm(suit, skin, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.24, 0.44, 0);
    this._torsoGroup.add(g);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), suit);
    upper.position.set(0, -0.13, 0);
    upper.castShadow = true;
    g.add(upper);

    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.10), suit);
    fore.position.set(0, -0.34, 0);
    g.add(fore);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.10), skin);
    hand.position.set(0, -0.49, 0);
    g.add(hand);

    return g;
  }

  _makeLeg(suit, dark, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.11, 0.85, 0);
    this._group.add(g);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.15), suit);
    upper.position.set(0, -0.20, 0);
    upper.castShadow = true;
    g.add(upper);

    const calf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), suit);
    calf.position.set(0, -0.58, 0);
    g.add(calf);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), dark);
    foot.position.set(0, -0.83, 0.05);
    g.add(foot);

    return g;
  }
}
