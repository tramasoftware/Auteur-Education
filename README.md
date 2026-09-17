# Auteur Education

Personalized theoretical education. This repository currently contains the
**course-generator demonstration** (see `AGENTS.md §10`): the flow from a learning
intention to a generated course with sources, synthesis and a Knowledge Check.

Product documentation lives in `docs/` (`PRODUCT.md`, `MVP.md`, `USER_FLOWS.md`,
`BUSINESS_RULES.md`, `AI_GENERATION.md`). Temporary technical decisions for the
demo are recorded in `docs/DECISIONS.md`.

## Layout

```text
apps/api   FastAPI backend (Python 3.12, uv)   -> http://127.0.0.1:8000/api/v1
apps/web   Next.js frontend (pnpm)             -> http://localhost:3000
```

## Requirements

- Node 20+ and `pnpm` (`corepack enable` or `npm i -g pnpm`)
- Python 3.12 and [`uv`](https://docs.astral.sh/uv/)
- An OpenAI API key (server-side only)

## Setup

```bash
pnpm install
cd apps/api && uv sync && cp .env.example .env   # then set OPENAI_API_KEY in .env
cd ../web && cp .env.example .env.local
```

`apps/web/.env.local` points the browser to the API (`NEXT_PUBLIC_API_URL`,
default `http://localhost:8000`). Only non-secret values belong there.

Relevant API settings (`apps/api/.env`, documented in `.env.example`):

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Provider key. Never exposed to the browser. |
| `OPENAI_MODEL` | Single model for all stages (DEC-008). |
| `BLUEPRINT_WEB_SEARCH` | Use the provider's web search for research (DEC-002). |
| `GENERATION_MAX_MODULES` | Demo cost/time limit; empty builds the whole course (DEC-007). |
| `APP_ENV` | `production` disables the demo bypass and the diagnostics endpoints. |

## Running

```bash
pnpm dev    # web + api with auto-reload (development)
pnpm demo   # web + api WITHOUT auto-reload (use this for the demonstration)
```

Use `pnpm demo` when presenting: state is kept in memory and long generations run
inside the API process (DEC-003/DEC-004), so an auto-reload triggered by a file
change would lose the current request and any build in progress.

Then open http://localhost:3000 and start a learning request.

## Checks

```bash
pnpm lint                       # eslint (web) + ruff (api)
pnpm test                       # api unit/contract tests with a fake provider
pnpm --filter @auteur/web build # production build of the frontend
```

## Evaluation with the real provider

Both require `OPENAI_API_KEY` in `apps/api/.env` and cost tokens.

```bash
cd apps/api
uv run pytest -m live tests/live -s              # schema + rule checks, prints latency/tokens
uv run python scripts/run_demo_case.py --list    # the AI_GENERATION.md minimum case set
uv run python scripts/run_demo_case.py ambiguous --until proposals
uv run python scripts/run_demo_case.py materialist-central --until course
```

The runner talks to a running API (`pnpm demo` or `pnpm dev:api`) exactly like the
frontend does and prints per-stage calls, duration and tokens. Add `--out <file>`
to save the JSON evidence somewhere outside the repository (DEC-010).

While the API runs outside production, `GET /api/v1/learning-requests/{id}/diagnostics`
and `GET /api/v1/courses/{id}/diagnostics` expose the same traces (DEC-005).

## What the demo does not include

Authentication, subscriptions, credits, audio, library, administration, progress
and persistent storage are out of scope for this milestone (`AGENTS.md §12`).
