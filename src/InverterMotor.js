/**
 * インバータ駆動ACモータ シミュレーション
 *
 * 速度制御: 台形プロファイル (accelRate / decelRate で上限)
 * テレメトリ: 速度変化・摩擦・外力から逆算してトルク・電流・周波数を算出
 *
 * ─── 旧 PIコントローラ方式の問題 ───────────────────────────
 *   軽量系 (フォーク M_eff=80kg) で maxForce/M_eff が50+ m/s² になり
 *   1フレームで最高速に達して回転数が突変していた。
 */
export class InverterMotor {
  constructor(cfg) {
    // ── 銘板 ──────────────────────────────────────────────
    this.name         = cfg.name         ?? 'Motor';
    this.ratedPower   = cfg.ratedPower   ?? 5500;   // W
    this.ratedRPM     = cfg.ratedRPM     ?? 1480;   // rpm
    this.poles        = cfg.poles        ?? 4;
    this.gearRatio    = cfg.gearRatio    ?? 10;
    this.drumRadius   = cfg.drumRadius   ?? 0.10;   // m
    this.ratedCurrent = cfg.ratedCurrent ?? 12;     // A
    this.maxFreq      = cfg.maxFreq      ?? 50;     // Hz
    this.maxOutputSpeed = cfg.maxOutputSpeed ?? 2;  // m/s

    // ── 計算値 ────────────────────────────────────────────
    const ratedOmegaM = this.ratedRPM * 2 * Math.PI / 60;
    this.ratedTorque  = this.ratedPower / ratedOmegaM;   // N·m
    this.noLoadCurrent = this.ratedCurrent * 0.32;        // 励磁電流

    // ── 機械系パラメータ (テレメトリ計算用) ───────────────
    this.M_eff     = cfg.M_eff     ?? 500;   // 等価質量 [kg]
    this.kFriction = cfg.kFriction ?? 200;   // 粘性摩擦 [N/(m/s)]
    this.accelRate = cfg.accelRate ?? 1.5;   // 加速度上限 [m/s²]
    this.decelRate = cfg.decelRate ?? 2.0;   // 減速度上限 [m/s²]

    // ── 状態 ──────────────────────────────────────────────
    this.position  = 0;
    this.velocity  = 0;
    this.target    = 0;
    this.running   = false;

    // ── テレメトリ ────────────────────────────────────────
    this.motorRPM  = 0;
    this.torqueNm  = 0;
    this.torquePct = 0;
    this.current   = 0;
    this.frequency = 0;
    this.power     = 0;

    // ── 外力 (昇降の重力荷重など) ─────────────────────────
    this.loadForce = 0;   // [N] 速度方向と逆向きに働く力
  }

  setTarget(pos) { this.target = pos; this.running = true; }
  setMaxSpeed(v) { this.maxOutputSpeed = Math.max(0.01, v); }

  step(dt) {
    if (dt <= 0) return;

    const err = this.target - this.position;

    // 停止判定
    if (!this.running || (Math.abs(err) < 0.001 && Math.abs(this.velocity) < 0.005)) {
      this.position = this.running ? this.target : this.position;
      this.velocity = 0;
      this.running  = false;
      this._setTelemetry(0, 0);
      return;
    }

    // ── 台形速度プロファイル ─────────────────────────────────
    const dir      = Math.sign(err);
    const dist     = Math.abs(err);
    const stopDist = (this.velocity * this.velocity) / (2 * this.decelRate);

    let speedRef;
    if (dist <= stopDist + 0.001) {
      speedRef = 0;
    } else {
      speedRef = dir * Math.min(
        this.maxOutputSpeed,
        Math.sqrt(2 * this.accelRate * dist)
      );
    }

    // ── 速度を accelRate / decelRate で台形追従 ──────────────
    const prevVelocity = this.velocity;
    const dv     = speedRef - this.velocity;
    const limit  = (dv >= 0 ? this.accelRate : this.decelRate) * dt;
    this.velocity += Math.sign(dv) * Math.min(Math.abs(dv), limit);

    this.position += this.velocity * dt;

    // オーバーシュート防止
    if (dir > 0 && this.position > this.target) { this.position = this.target; this.velocity = 0; this.running = false; }
    if (dir < 0 && this.position < this.target) { this.position = this.target; this.velocity = 0; this.running = false; }

    // ── テレメトリ逆算 ───────────────────────────────────────
    const accelActual = (this.velocity - prevVelocity) / dt;
    this._setTelemetry(accelActual, speedRef);
  }

  /**
   * テレメトリ計算
   *   F_total = M_eff * a + kFriction * v + loadForce
   *   T_motor = F_total * drumRadius / gearRatio   (モータ軸換算)
   */
  _setTelemetry(accelActual, speedRef) {
    const v = this.velocity;

    // モータトルク (逆算)
    const F_inertia  = this.M_eff * accelActual;
    const F_friction = this.kFriction * v;
    const F_total    = F_inertia + F_friction + this.loadForce;
    this.torqueNm  = F_total * this.drumRadius / this.gearRatio;
    this.torquePct = (this.torqueNm / this.ratedTorque) * 100;

    // モータ回転数: 出力速度 → ギア換算
    this.motorRPM = Math.abs(v) / this.drumRadius * this.gearRatio * 60 / (2 * Math.PI);

    // VFD出力周波数: 速度指令に比例 (V/f制御を模擬)
    this.frequency = Math.abs(speedRef) / this.maxOutputSpeed * this.maxFreq;

    // 電流: I = √(I_磁化² + I_トルク²)
    const I_torque = this.ratedCurrent * Math.min(2.5, Math.abs(this.torqueNm) / this.ratedTorque);
    this.current = Math.sqrt(this.noLoadCurrent ** 2 + I_torque ** 2);

    // 電力
    this.power = this.torqueNm * (this.motorRPM * 2 * Math.PI / 60);
  }

  get isIdle() { return !this.running && Math.abs(this.velocity) < 0.005; }
  get speed()  { return Math.abs(this.velocity); }
}
