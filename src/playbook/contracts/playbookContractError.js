export class PlaybookContractError extends Error {
  constructor(code, path, detail) {
    super(`${code}: ${path}: ${detail}`);
    this.name = 'PlaybookContractError';
    this.code = code;
    this.path = path;
    this.detail = String(detail);
  }
}

export function failPlaybookContract(code, path, detail) {
  throw new PlaybookContractError(code, path, detail);
}
