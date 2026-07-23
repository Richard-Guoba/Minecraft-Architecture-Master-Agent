export class TrainingDataError extends Error {
  constructor(code, detail, metadata = {}) {
    super(`${code}: ${detail}`);
    this.name = 'TrainingDataError';
    this.code = code;
    this.detail = String(detail);
    this.metadata = Object.freeze({ ...metadata });
  }
}

export function assertSourceId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(value)) {
    throw new TrainingDataError('SOURCE_ID_INVALID', String(value));
  }
  return value;
}
