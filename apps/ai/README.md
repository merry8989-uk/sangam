# Sangam AI service

FastAPI service holding the media pipeline, moderation, ranking and the
Sarvam AI chat integration. Kept in Python because the real models - Indic
text classifiers, vision models, embeddings - live in the Python ML ecosystem.

## Run

```bash
pip install -r requirements.txt
export SARVAM_API_KEY=your-key      # from https://dashboard.sarvam.ai/
uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs

## Endpoints

- `GET /health` - status, including whether Sarvam is configured
- `POST /chat` - public chat via Sarvam (model `sarvam-105b`, the model behind Indus)
- `POST /moderate`, `POST /moderate/image` - moderation
- `POST /feed/rank`, `POST /similar` - recommendation
- `POST /process/image`, `POST /process/video` - media enrichment
- `POST /agents/assist` - creator-assist agents

## Moderation models

Moderation runs in two layers, combined:

1. A **real ML backend** (Hugging Face `transformers`), opt-in:
   - text: `unitary/multilingual-toxic-xlm-roberta` (XLM-R; multilingual, incl. Indic)
   - image: `Falconsai/nsfw_image_detection` (ViT)
2. A dependency-free **heuristic lexicon** that always runs as a floor.

Enable it:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ml.txt
export MODERATION_ENABLED=true
```

The models load lazily on first use. If the deps are missing or a model fails
to load, moderation falls back to the heuristic and reports which engine
actually produced the verdict in the `engine` field of the response.

Resource note: `unitary/multilingual-toxic-xlm-roberta` needs roughly 2 GB of
RAM to load (plus torch). Run it on a host with enough memory, or a GPU.

## Embeddings (knowledge-base retrieval)

Agent knowledge bases are embedded so the assistant retrieves only the entries
relevant to each question, instead of the whole KB being pasted into the prompt.

- `POST /embed` returns L2-normalised vectors.
- Backend: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` when
  `EMBEDDINGS_ENABLED=true`; otherwise a dependency-free lexical hashing
  embedding (256-dim), so retrieval works with no ML install.
- The web layer embeds KB entries when the agent is saved, then embeds only the
  query at chat time and ranks by cosine similarity.

## Notes

The Sarvam API key is held server-side only (`SARVAM_API_KEY`); it is never
sent to the browser. Chat calls `POST {SARVAM_BASE_URL}/v1/chat/completions`
with an `api-subscription-key` header. `sarvam-m` is deprecated - we use
`sarvam-105b`.
