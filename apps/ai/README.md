# Sangam AI service

FastAPI service that holds the moderation, ranking and media-enrichment
logic. Kept in Python (not Node) because the real models - Indic-language
text classifiers, vision models for image/video frames, embeddings for
recommendation - live in the Python ML ecosystem.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs

## Endpoints

- `GET /health`
- `POST /moderate` - text moderation
- `POST /recommend` - rank candidate post IDs

The starter implementations are transparent heuristics with production-shaped
interfaces, so real models drop in without changing callers.
