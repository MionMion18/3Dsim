// ジョブスケジューラ: 入庫/出庫/移載の制御シーケンス
export const JOB_STATE = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
};

export const JOB_TYPE = {
  STORE: 'STORE',    // 入庫
  RETRIEVE: 'RETRIEVE', // 出庫
  RELOCATE: 'RELOCATE', // 移載
};

let _jobId = 1;

export class Job {
  constructor(type, params) {
    this.id = _jobId++;
    this.type = type;
    this.params = params;
    this.state = JOB_STATE.QUEUED;
    this.step = 0;
  }
}

export class JobScheduler {
  constructor() {
    this.queue = [];
    this.current = null;
    this.listeners = [];
  }

  addJob(type, params) {
    const job = new Job(type, params);
    this.queue.push(job);
    this._notify();
    return job;
  }

  onUpdate(fn) { this.listeners.push(fn); }
  _notify() { this.listeners.forEach(f => f(this.all)); }

  get all() {
    const cur = this.current ? [this.current] : [];
    return [...cur, ...this.queue];
  }

  get hasPending() { return !!this.current || this.queue.length > 0; }

  nextJob() {
    if (this.current && this.current.state === JOB_STATE.DONE) {
      this.current = null;
    }
    if (!this.current && this.queue.length > 0) {
      this.current = this.queue.shift();
      this.current.state = JOB_STATE.RUNNING;
      this._notify();
    }
    return this.current;
  }

  completeCurrentJob() {
    if (this.current) {
      this.current.state = JOB_STATE.DONE;
      this.current = null;
      this._notify();
    }
  }
}
