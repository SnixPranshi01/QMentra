CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS concept_articles (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    minutes SMALLINT NOT NULL CHECK (minutes > 0),
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_articles_category_idx
    ON concept_articles (category, title);

CREATE TABLE IF NOT EXISTS concept_progress (
    user_id TEXT NOT NULL,
    concept_slug TEXT NOT NULL REFERENCES concept_articles (slug) ON DELETE CASCADE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, concept_slug)
);

ALTER TABLE concept_progress
    ADD COLUMN IF NOT EXISTS assessment_passed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS concept_assessments (
    concept_slug TEXT PRIMARY KEY REFERENCES concept_articles (slug) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options TEXT[] NOT NULL CHECK (cardinality(options) >= 2),
    correct_index SMALLINT NOT NULL CHECK (correct_index >= 0),
    explanation TEXT NOT NULL,
    CHECK (correct_index < cardinality(options)),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_progress_user_updated_idx
    ON concept_progress (user_id, updated_at DESC);