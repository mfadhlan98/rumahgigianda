export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Sesi tidak valid, silakan login ulang.') => new HttpError(401, msg);
export const forbidden = (msg = 'Anda tidak punya hak akses untuk tindakan ini.') => new HttpError(403, msg);
export const notFound = (msg = 'Data tidak ditemukan.') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);
