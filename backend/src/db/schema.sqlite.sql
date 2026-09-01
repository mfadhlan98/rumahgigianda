-- Skema database Klinik Gigi Manda (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'kasir',   -- admin | kasir
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS patients (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  medical_record_no TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  birth_date        TEXT,
  gender            TEXT,                            -- L | P
  phone             TEXT,
  address           TEXT,
  note              TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

-- Master tarif: tindakan, obat, konsultasi
CREATE TABLE IF NOT EXISTS service_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'tindakan', -- tindakan | obat | konsultasi | lainnya
  default_price INTEGER NOT NULL DEFAULT 0,          -- rupiah, bilangan bulat
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_service_items_category ON service_items(category);

CREATE TABLE IF NOT EXISTS receipts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no     TEXT    NOT NULL UNIQUE,
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  receipt_date   TEXT    NOT NULL,                   -- YYYY-MM-DD
  period         TEXT    NOT NULL,                   -- YYYYMM, untuk nomor urut
  seq            INTEGER NOT NULL,
  treatment_type TEXT,                               -- jenis perawatan (ringkasan)
  doctor_name    TEXT,
  payment_method TEXT    NOT NULL,                   -- tunai | transfer | kartu
  payment_ref    TEXT,                               -- no. referensi transfer/kartu
  subtotal       INTEGER NOT NULL DEFAULT 0,
  discount       INTEGER NOT NULL DEFAULT 0,
  tax            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  amount_paid    INTEGER NOT NULL DEFAULT 0,
  change_amount  INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  status         TEXT    NOT NULL DEFAULT 'issued',  -- issued | void
  void_reason    TEXT,
  voided_at      TEXT,
  voided_by      INTEGER REFERENCES users(id),
  created_by     INTEGER NOT NULL REFERENCES users(id),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_period_seq ON receipts(period, seq);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_patient ON receipts(patient_id);

CREATE TABLE IF NOT EXISTS receipt_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id      INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  service_item_id INTEGER REFERENCES service_items(id),
  description     TEXT    NOT NULL,
  category        TEXT    NOT NULL DEFAULT 'tindakan',
  qty             INTEGER NOT NULL DEFAULT 1,
  unit_price      INTEGER NOT NULL DEFAULT 0,
  line_total      INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  skey       TEXT PRIMARY KEY,
  svalue     TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
