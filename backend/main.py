import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger("qmentra.api")
load_dotenv()
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "quantum_concepts.json"
ASSESSMENTS_PATH = Path(__file__).resolve().parent.parent / "data" / "quantum_assessments.json"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://qmentra:qmentra-local@localhost:5433/qmentra",
)


def load_catalog() -> list[dict[str, Any]]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def load_assessments() -> list[dict[str, Any]]:
    return json.loads(ASSESSMENTS_PATH.read_text(encoding="utf-8"))


def public_assessment(assessment: dict[str, Any]) -> dict[str, Any]:
    return {key: assessment[key] for key in ("slug", "question", "options", "explanation")}


def article_from_row(row: asyncpg.Record) -> dict[str, Any]:
    article = dict(row)
    if isinstance(article["sources"], str):
        article["sources"] = json.loads(article["sources"])
    article["minutes"] = article.pop("minutes")
    return article


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
        logger.info("Connected to PostgreSQL")
    except (OSError, asyncpg.PostgresError) as error:
        app.state.pool = None
        logger.warning("PostgreSQL unavailable; serving the bundled concept catalog: %s", error)
    yield
    if app.state.pool:
        await app.state.pool.close()


app = FastAPI(title="QMentra Learning API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_methods=["GET", "PUT"],
    allow_headers=["Content-Type"],
)


class ProgressUpdate(BaseModel):
    completed: bool
    user_id: str = Field(default="demo-student", min_length=1, max_length=100)


class AssessmentSubmission(BaseModel):
    answer_index: int = Field(ge=0, le=2)
    user_id: str = Field(default="demo-student", min_length=1, max_length=100)


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "storage": "postgresql" if app.state.pool else "catalog-fallback"}


@app.get("/api/v1/concepts")
async def list_concepts(
    search: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=80),
) -> list[dict[str, Any]]:
    pool = app.state.pool
    if pool:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """SELECT slug, title, category, level, minutes, summary, content, tags, sources
                   FROM concept_articles
                   WHERE ($1::text IS NULL OR category = $1)
                     AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%'
                          OR summary ILIKE '%' || $2 || '%'
                          OR array_to_string(tags, ' ') ILIKE '%' || $2 || '%')
                   ORDER BY category, title""",
                category,
                search.strip() if search else None,
            )
            return [article_from_row(row) for row in rows]

    query = search.strip().casefold() if search else ""
    return [
        article
        for article in load_catalog()
        if (not category or article["category"] == category)
        and (
            not query
            or query in " ".join(
                [article["title"], article["summary"], *article["tags"]]
            ).casefold()
        )
    ]


@app.get("/api/v1/concepts/{slug}")
async def get_concept(slug: str) -> dict[str, Any]:
    pool = app.state.pool
    if pool:
        async with pool.acquire() as connection:
            row = await connection.fetchrow(
                """SELECT slug, title, category, level, minutes, summary, content, tags, sources
                   FROM concept_articles WHERE slug = $1""",
                slug,
            )
            if row:
                return article_from_row(row)
    article = next((item for item in load_catalog() if item["slug"] == slug), None)
    if not article:
        raise HTTPException(status_code=404, detail="Concept not found")
    return article


@app.get("/api/v1/progress/concepts")
async def get_concept_progress(
    user_id: str = Query(default="demo-student", min_length=1, max_length=100),
) -> list[dict[str, Any]]:
    if not app.state.pool:
        return []
    async with app.state.pool.acquire() as connection:
        rows = await connection.fetch(
                """SELECT concept_slug AS slug, completed, assessment_passed, updated_at
                    FROM concept_progress WHERE user_id = $1""",
            user_id,
        )
    return [dict(row) for row in rows]


@app.put("/api/v1/progress/concepts/{slug}")
async def update_concept_progress(slug: str, update: ProgressUpdate) -> dict[str, Any]:
    if not app.state.pool:
        raise HTTPException(status_code=503, detail="PostgreSQL is not connected")
    async with app.state.pool.acquire() as connection:
        exists = await connection.fetchval(
            "SELECT EXISTS(SELECT 1 FROM concept_articles WHERE slug = $1)", slug
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Concept not found")
        row = await connection.fetchrow(
            """INSERT INTO concept_progress (user_id, concept_slug, completed)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id, concept_slug) DO UPDATE
               SET completed = EXCLUDED.completed,
                   assessment_passed = CASE WHEN EXCLUDED.completed
                       THEN concept_progress.assessment_passed ELSE FALSE END,
                   updated_at = NOW()
               RETURNING concept_slug AS slug, completed, assessment_passed, updated_at""",
            update.user_id,
            slug,
            update.completed,
        )
    return dict(row)


@app.get("/api/v1/assessments/{slug}")
async def get_assessment(slug: str) -> dict[str, Any]:
    if app.state.pool:
        async with app.state.pool.acquire() as connection:
            row = await connection.fetchrow(
                """SELECT concept_slug AS slug, question, options, explanation
                   FROM concept_assessments WHERE concept_slug = $1""",
                slug,
            )
            if row:
                return dict(row)
    assessment = next((item for item in load_assessments() if item["slug"] == slug), None)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return public_assessment(assessment)


@app.post("/api/v1/assessments/{slug}/submit")
async def submit_assessment(slug: str, submission: AssessmentSubmission) -> dict[str, Any]:
    pool = app.state.pool
    if not pool:
        assessment = next((item for item in load_assessments() if item["slug"] == slug), None)
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        correct = submission.answer_index == assessment["correct_index"]
        return {"correct": correct, "passed": correct, "explanation": assessment["explanation"]}

    async with pool.acquire() as connection:
        is_completed = await connection.fetchval(
            """SELECT completed FROM concept_progress
               WHERE user_id = $1 AND concept_slug = $2""",
            submission.user_id,
            slug,
        )
        if not is_completed:
            raise HTTPException(status_code=409, detail="Complete the concept article before taking its quiz")
        assessment = await connection.fetchrow(
            """SELECT correct_index, explanation FROM concept_assessments
               WHERE concept_slug = $1""",
            slug,
        )
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        correct = submission.answer_index == assessment["correct_index"]
        if correct:
            await connection.execute(
                """UPDATE concept_progress SET assessment_passed = TRUE, updated_at = NOW()
                   WHERE user_id = $1 AND concept_slug = $2""",
                submission.user_id,
                slug,
            )
    return {"correct": correct, "passed": correct, "explanation": assessment["explanation"]}