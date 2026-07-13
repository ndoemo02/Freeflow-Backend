-- Migration: live_perf_logs — instrumentacja czasu reakcji Live
-- Stage: vad_gap | transcript_to_toolcall | http_roundtrip | backend_execution | compact_response | tts_generation | total_e2e

CREATE TABLE IF NOT EXISTS live_perf_logs (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    model       TEXT,
    stage       TEXT NOT NULL,
    ms          INTEGER NOT NULL,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_perf_session ON live_perf_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_live_perf_stage   ON live_perf_logs(stage);
CREATE INDEX IF NOT EXISTS idx_live_perf_model   ON live_perf_logs(model);
CREATE INDEX IF NOT EXISTS idx_live_perf_created ON live_perf_logs(created_at);
