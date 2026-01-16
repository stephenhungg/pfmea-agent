-- Migration: Drop deprecated detection fields from pfmea_results table
-- Date: 2026-01-15
-- Description: Removes detection and detection_justification columns that are no longer used

-- SQLite doesn't support DROP COLUMN directly, so we need to:
-- 1. Create new table without deprecated columns
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

BEGIN TRANSACTION;

-- Create new table without detection fields
CREATE TABLE pfmea_results_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER NOT NULL,
    process VARCHAR NOT NULL,
    subprocess TEXT,
    failure_mode TEXT NOT NULL,
    potential_effect TEXT NOT NULL,
    severity INTEGER NOT NULL,
    severity_justification TEXT,
    occurrence INTEGER NOT NULL,
    occurrence_justification TEXT,
    rpn INTEGER NOT NULL,
    risk_level VARCHAR NOT NULL,
    action_required VARCHAR NOT NULL,
    control_point TEXT,
    confidence VARCHAR,
    analysis_reasoning TEXT,
    validation_reasoning TEXT,
    correction_reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);

-- Copy data from old table (excluding detection fields)
INSERT INTO pfmea_results_new (
    id, analysis_id, process, subprocess, failure_mode, potential_effect,
    severity, severity_justification, occurrence, occurrence_justification,
    rpn, risk_level, action_required, control_point, confidence,
    analysis_reasoning, validation_reasoning, correction_reasoning, created_at
)
SELECT
    id, analysis_id, process, subprocess, failure_mode, potential_effect,
    severity, severity_justification, occurrence, occurrence_justification,
    rpn, risk_level, action_required, control_point, confidence,
    analysis_reasoning, validation_reasoning, correction_reasoning, created_at
FROM pfmea_results;

-- Drop old table
DROP TABLE pfmea_results;

-- Rename new table
ALTER TABLE pfmea_results_new RENAME TO pfmea_results;

-- Recreate indexes
CREATE INDEX idx_pfmea_results_analysis_id ON pfmea_results(analysis_id);
CREATE INDEX idx_pfmea_results_risk_level ON pfmea_results(risk_level);
CREATE INDEX idx_pfmea_results_rpn ON pfmea_results(rpn);

COMMIT;
