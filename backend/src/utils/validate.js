import { badRequest } from './httpError.js';

/**
 * Validator ringan tanpa dependensi. Mengumpulkan SEMUA kesalahan
 * lalu melempar satu HttpError 400 berisi peta { field: pesan }.
 */
export class Validator {
  constructor(source = {}) {
    this.src = source;
    this.errors = {};
    this.out = {};
  }

  #fail(field, msg) {
    if (!this.errors[field]) this.errors[field] = msg;
  }

  #raw(field) {
    const v = this.src[field];
    return typeof v === 'string' ? v.trim() : v;
  }

  string(field, { required = false, min = 0, max = 255, label = field, allow = null } = {}) {
    const v = this.#raw(field);
    if (v === undefined || v === null || v === '') {
      if (required) this.#fail(field, `${label} wajib diisi.`);
      else this.out[field] = null;
      return this;
    }
    const s = String(v);
    if (s.length < min) this.#fail(field, `${label} minimal ${min} karakter.`);
    else if (s.length > max) this.#fail(field, `${label} maksimal ${max} karakter.`);
    else if (allow && !allow.includes(s)) this.#fail(field, `${label} harus salah satu dari: ${allow.join(', ')}.`);
    else this.out[field] = s;
    return this;
  }

  int(field, { required = false, min = null, max = null, label = field, default: def = null } = {}) {
    const v = this.#raw(field);
    if (v === undefined || v === null || v === '') {
      if (required) this.#fail(field, `${label} wajib diisi.`);
      else this.out[field] = def;
      return this;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) this.#fail(field, `${label} harus berupa bilangan bulat.`);
    else if (min !== null && n < min) this.#fail(field, `${label} minimal ${min}.`);
    else if (max !== null && n > max) this.#fail(field, `${label} maksimal ${max}.`);
    else this.out[field] = n;
    return this;
  }

  bool(field, { default: def = null } = {}) {
    const v = this.src[field];
    if (v === undefined || v === null || v === '') {
      this.out[field] = def;
      return this;
    }
    this.out[field] = v === true || v === 1 || v === '1' || v === 'true';
    return this;
  }

  date(field, { required = false, label = field } = {}) {
    const v = this.#raw(field);
    if (!v) {
      if (required) this.#fail(field, `${label} wajib diisi.`);
      else this.out[field] = null;
      return this;
    }
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
      this.#fail(field, `${label} harus tanggal valid (YYYY-MM-DD).`);
    } else {
      this.out[field] = s;
    }
    return this;
  }

  custom(field, msgIfInvalid, predicate) {
    if (!predicate()) this.#fail(field, msgIfInvalid);
    return this;
  }

  /** Lempar error bila ada pelanggaran; jika bersih, kembalikan data bersih. */
  done() {
    if (Object.keys(this.errors).length) {
      throw badRequest('Data yang dikirim belum lengkap atau tidak valid.', this.errors);
    }
    return this.out;
  }
}

export const v = (source) => new Validator(source);
