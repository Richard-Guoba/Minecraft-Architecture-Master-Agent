export class ResidentialContractError extends Error {
  constructor(code, path, detail, metadata = {}) {
    super(`${code}: ${path}: ${detail}`);
    this.name = 'ResidentialContractError';
    this.code = String(code);
    this.path = String(path);
    this.detail = String(detail);
    this.metadata = Object.freeze({ ...metadata });
  }
}

export function failContract(code, path, detail, metadata) {
  throw new ResidentialContractError(code, path, detail, metadata);
}
