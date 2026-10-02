import asyncio
import json
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
CATALOG_PATH = ROOT / "data" / "quantum_concepts.json"
ASSESSMENTS_PATH = ROOT / "data" / "quantum_assessments.json"
SCHEMA_PATH = Path(__file__).with_name("schema.sql")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://qmentra:qmentra-local@localhost:5433/qmentra",
)


async def seed() -> None:
    articles = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    assessments = json.loads(ASSESSMENTS_PATH.read_text(encoding="utf-8"))
    connection = await asyncpg.connect(DATABASE_URL)
    try:
        await connection.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
        async with connection.transaction():
            for article in articles:
                await connection.execute(
                    """INSERT INTO concept_articles
                       (slug, title, category, level, minutes, summary, content, tags, sources)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                       ON CONFLICT (slug) DO UPDATE SET
                         title = EXCLUDED.title,
                         category = EXCLUDED.category,
                         level = EXCLUDED.level,
                         minutes = EXCLUDED.minutes,
                         summary = EXCLUDED.summary,
                         content = EXCLUDED.content,
                         tags = EXCLUDED.tags,
                         sources = EXCLUDED.sources,
                         updated_at = NOW()""",
                    article["slug"],
                    article["title"],
                    article["category"],
                    article["level"],
                    article["minutes"],
                    article["summary"],
                    article["content"],
                    article["tags"],
                    json.dumps(article["sources"]),
                )
            for assessment in assessments:
                await connection.execute(
                    """INSERT INTO concept_assessments
                       (concept_slug, question, options, correct_index, explanation)
                       VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (concept_slug) DO UPDATE SET
                         question = EXCLUDED.question,
                         options = EXCLUDED.options,
                         correct_index = EXCLUDED.correct_index,
                         explanation = EXCLUDED.explanation,
                         updated_at = NOW()""",
                    assessment["slug"],
                    assessment["question"],
                    assessment["options"],
                    assessment["correct_index"],
                    assessment["explanation"],
                )
    finally:
        await connection.close()
    print(f"Seeded {len(articles)} concept articles and {len(assessments)} quizzes.")


if __name__ == "__main__":
    asyncio.run(seed())