"""Sarvam AI chat client.

Powers the in-app chat (the same 105B sovereign model behind Sarvam's Indus
interface). The API key stays server-side; the browser never sees it.

Endpoint: POST {base}/v1/chat/completions
Auth:     api-subscription-key header (or Authorization: Bearer)
Models:   sarvam-105b (128K context), sarvam-105b-conversations (32K)

`sarvam-m` is deprecated and is not used here.
"""

import httpx

from .settings import settings


class SarvamError(Exception):
    """Raised when Sarvam is unconfigured or returns an error."""


def is_configured() -> bool:
    return bool(settings.sarvam_api_key)


def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    reasoning_effort: str | None = None,
) -> dict:
    """Call Sarvam chat completions and return the assistant reply."""
    if not settings.sarvam_api_key:
        raise SarvamError("SARVAM_API_KEY is not configured")

    payload: dict = {
        "model": model or settings.sarvam_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort

    url = f"{settings.sarvam_base_url.rstrip('/')}/v1/chat/completions"
    headers = {
        "api-subscription-key": settings.sarvam_api_key,
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=90) as client:
            resp = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise SarvamError(f"network error: {exc}") from exc

    if resp.status_code != 200:
        raise SarvamError(f"{resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise SarvamError("empty response from Sarvam")
    message = choices[0].get("message", {})
    return {
        "content": message.get("content") or "",
        "reasoning": message.get("reasoning_content"),
        "model": data.get("model"),
        "usage": data.get("usage"),
    }
