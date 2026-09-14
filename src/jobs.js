import crypto from 'node:crypto';

export class JobStore {
  constructor({ ttlMs = 15 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.jobs = new Map();
  }

  create({ url, format }) {
    const now = Date.now();
    const job = {
      id: crypto.randomUUID(), url, format,
      status: 'queued', progress: 0, error: null,
      errorCode: null, sourceUrl: null,
      filePath: null, title: null,
      createdAt: now, updatedAt: now
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (Date.now() - job.updatedAt > this.ttlMs) {
      this.jobs.delete(id);
      return null;
    }
    return job;
  }

  update(id, patch) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    return job;
  }

  delete(id) { return this.jobs.delete(id); }

  public(id) {
    const job = this.get(id);
    if (!job) return null;
    return {
      id: job.id,
      format: job.format,
      status: job.status,
      progress: job.progress,
      error: job.error,
      errorCode: job.errorCode,
      sourceUrl: job.sourceUrl,
      title: job.title,
      downloadUrl: job.status === 'ready' ? `/api/jobs/${job.id}/file` : null,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString()
    };
  }
}
