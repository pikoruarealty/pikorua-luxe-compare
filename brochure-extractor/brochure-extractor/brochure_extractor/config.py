from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _float(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    # --- OpenAI
    api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    base_url: str | None = field(default_factory=lambda: os.getenv("OPENAI_BASE_URL") or None)
    model: str = field(default_factory=lambda: os.getenv("EXTRACTOR_MODEL", "gpt-4.1-mini"))
    # cheaper model used only for image slot classification
    vision_tag_model: str = field(default_factory=lambda: os.getenv("IMAGE_TAG_MODEL", "gpt-4.1-mini"))
    max_output_tokens: int = field(default_factory=lambda: _int("MAX_OUTPUT_TOKENS", 8000))
    request_timeout: int = field(default_factory=lambda: _int("REQUEST_TIMEOUT", 180))
    max_retries: int = field(default_factory=lambda: _int("MAX_RETRIES", 3))

    # --- PDF handling
    render_dpi: int = field(default_factory=lambda: _int("RENDER_DPI", 150))
    pages_per_chunk: int = field(default_factory=lambda: _int("PAGES_PER_CHUNK", 6))
    max_pages_per_file: int = field(default_factory=lambda: _int("MAX_PAGES_PER_FILE", 60))
    max_file_mb: int = field(default_factory=lambda: _int("MAX_FILE_MB", 40))
    scanned_text_threshold: int = field(default_factory=lambda: _int("SCANNED_TEXT_THRESHOLD", 120))
    use_tesseract: bool = field(default_factory=lambda: _bool("USE_TESSERACT", True))

    # --- extraction behaviour
    parallel_chunks: int = field(default_factory=lambda: _int("PARALLEL_CHUNKS", 4))
    min_confidence: float = field(default_factory=lambda: _float("MIN_CONFIDENCE", 0.35))
    extract_images: bool = field(default_factory=lambda: _bool("EXTRACT_IMAGES", True))
    min_image_px: int = field(default_factory=lambda: _int("MIN_IMAGE_PX", 600))
    image_out_dir: str = field(default_factory=lambda: os.getenv("IMAGE_OUT_DIR", "./extracted_images"))

    def require_key(self) -> None:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.")


settings = Settings()
