// トラペゾイダル速度プロファイルによるモータシミュレーション
export class Motor {
  constructor({ maxSpeed = 2.0, accel = 1.5, decel = 2.0 } = {}) {
    this.maxSpeed = maxSpeed;  // [m/s]
    this.accel = accel;        // [m/s²]
    this.decel = decel;        // [m/s²]

    this.position = 0;
    this.velocity = 0;
    this.target = 0;
    this.running = false;
  }

  setTarget(pos) {
    this.target = pos;
    this.running = true;
  }

  setMaxSpeed(v) { this.maxSpeed = v; }

  step(dt) {
    if (!this.running) { this.velocity = 0; return; }

    const err = this.target - this.position;
    if (Math.abs(err) < 0.001) {
      this.position = this.target;
      this.velocity = 0;
      this.running = false;
      return;
    }

    const dir = Math.sign(err);
    const dist = Math.abs(err);

    // 減速距離 = v² / (2*decel)
    const stopDist = (this.velocity * this.velocity) / (2 * this.decel);

    let targetVel;
    if (dist <= stopDist + 0.001) {
      targetVel = 0;
    } else {
      targetVel = dir * Math.min(this.maxSpeed, Math.sqrt(2 * this.accel * dist));
    }

    // 速度を目標速度へ向かって変化
    const dv = targetVel - this.velocity;
    const maxDV = (dv > 0 ? this.accel : this.decel) * dt;
    this.velocity += Math.sign(dv) * Math.min(Math.abs(dv), maxDV);

    this.position += this.velocity * dt;

    // オーバーシュート防止
    if (dir > 0 && this.position > this.target) this.position = this.target;
    if (dir < 0 && this.position < this.target) this.position = this.target;
  }

  get isIdle() { return !this.running; }
  get speed() { return Math.abs(this.velocity); }
}
