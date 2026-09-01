-- Skema database Klinik Gigi Manda (MySQL 8 / MariaDB 10.4+)
-- Buat dulu databasenya:  CREATE DATABASE klinik_gigi_manda CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'kasir',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patients (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  medical_record_no VARCHAR(50)  NOT NULL,
  name              VARCHAR(150) NOT NULL,
  birth_date        DATE         NULL,
  gender            VARCHAR(2)   NULL,
  phone             VARCHAR(30)  NULL,
  address           TEXT         NULL,
  note              TEXT         NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_patients_mr (medical_record_no),
  KEY idx_patients_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(40)  NOT NULL,
  name          VARCHAR(150) NOT NULL,
  category      VARCHAR(20)  NOT NULL DEFAULT 'tindakan',
  default_price BIGINT       NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_service_code (code),
  KEY idx_service_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no     VARCHAR(50)  NOT NULL,
  patient_id     INT          NOT NULL,
  receipt_date   DATE         NOT NULL,
  period         VARCHAR(6)   NOT NULL,
  seq            INT          NOT NULL,
  treatment_type VARCHAR(200) NULL,
  doctor_name    VARCHAR(150) NULL,
  payment_method VARCHAR(20)  NOT NULL,
  payment_ref    VARCHAR(100) NULL,
  subtotal       BIGINT       NOT NULL DEFAULT 0,
  discount       BIGINT       NOT NULL DEFAULT 0,
  tax            BIGINT       NOT NULL DEFAULT 0,
  total          BIGINT       NOT NULL DEFAULT 0,
  amount_paid    BIGINT       NOT NULL DEFAULT 0,
  change_amount  BIGINT       NOT NULL DEFAULT 0,
  notes          TEXT         NULL,
  status         VARCHAR(10)  NOT NULL DEFAULT 'issued',
  void_reason    TEXT         NULL,
  voided_at      DATETIME     NULL,
  voided_by      INT          NULL,
  created_by     INT          NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_receipt_no (receipt_no),
  UNIQUE KEY uq_receipt_period_seq (period, seq),
  KEY idx_receipts_date (receipt_date),
  KEY idx_receipts_patient (patient_id),
  CONSTRAINT fk_receipts_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_receipts_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_receipts_voider  FOREIGN KEY (voided_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipt_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  receipt_id      INT          NOT NULL,
  service_item_id INT          NULL,
  description     VARCHAR(255) NOT NULL,
  category        VARCHAR(20)  NOT NULL DEFAULT 'tindakan',
  qty             INT          NOT NULL DEFAULT 1,
  unit_price      BIGINT       NOT NULL DEFAULT 0,
  line_total      BIGINT       NOT NULL DEFAULT 0,
  position        INT          NOT NULL DEFAULT 0,
  KEY idx_receipt_items_receipt (receipt_id),
  CONSTRAINT fk_items_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_service FOREIGN KEY (service_item_id) REFERENCES service_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NULL,
  username   VARCHAR(64)  NULL,
  action     VARCHAR(50)  NOT NULL,
  entity     VARCHAR(50)  NOT NULL,
  entity_id  VARCHAR(50)  NULL,
  detail     TEXT         NULL,
  ip         VARCHAR(64)  NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  skey       VARCHAR(64) NOT NULL PRIMARY KEY,
  svalue     TEXT        NULL,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
