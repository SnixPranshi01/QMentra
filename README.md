# QMentra

QMentra is a responsive quantum-learning MVP built with React and Vite. It includes a searchable, source-linked article library, circuit builder, local simulator fallback, assessment, dashboard, and personal tracker.

## Run the frontend

```powershell
npm install
npm run dev
```

## Open in VS Code or GitHub Codespaces

Open `QMentra.code-workspace` in VS Code, or push this repository to GitHub and choose **Code → Codespaces → Create codespace**. The `.devcontainer` setup provisions Node.js, Python, and Docker access, installs project dependencies, starts the Vite web app when Codespaces attaches, and forwards the web, API, and PostgreSQL ports. Open the forwarded **QMentra web** port to use the interactive circuit builder and safe in-browser simulator. In the VS Code **Tasks: Run Task** menu, start PostgreSQL or the API when needed.

## Enable PostgreSQL storage and the FastAPI API

Install Docker Desktop, then from the project folder:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m backend.seed
uvicorn backend.main:app --reload --port 8000
```

The API serves articles from PostgreSQL and stores concept completion in `concept_progress`. Until PostgreSQL is connected, the API can still serve the bundled article catalog; the UI also keeps reading progress in browser storage. The Vite development server proxies `/api` to `http://localhost:8000`.

The local Compose credentials are for development only. Replace them and configure `DATABASE_URL` before deploying.

## Article references

Article explanations are original QMentra content. Each article links to official IBM Quantum Learning and Google Quantum AI/Cirq material for further study.