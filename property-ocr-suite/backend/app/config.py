"""Environment-driven settings. Never hardcode API keys in source."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    # --- Vision LLM provider ---
    # "openai" or "anthropic" — pick whichever key you have. OpenAI's
    # vision models are cheap and fast for this kind of page-by-page
    # extraction; Claude vision works just as well if that's the key
    # you have on hand. Only one is required.
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    # Leave unset to hit api.openai.com directly. Set to an OpenAI-
    # compatible gateway (e.g. https://openrouter.ai/api/v1) if
    # OPENAI_API_KEY is a key for that gateway instead.
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "")

    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    # Shared secret your friend's developer portal sends back to this
    # service. Not an LLM key — just protects this API from being hit
    # by randoms if you deploy it publicly.
    SERVICE_API_KEY: str = os.getenv("SERVICE_API_KEY", "")

    # --- extraction tuning ---
    MAX_PAGES_PER_DOC: int = int(os.getenv("MAX_PAGES_PER_DOC", "40"))
    PAGES_PER_LLM_CALL: int = int(os.getenv("PAGES_PER_LLM_CALL", "3"))
    MIN_TEXT_CHARS_FOR_TEXT_LAYER: int = int(os.getenv("MIN_TEXT_CHARS_FOR_TEXT_LAYER", "40"))
    PAGE_RENDER_DPI: int = int(os.getenv("PAGE_RENDER_DPI", "150"))
    # Vision models downsample internally past this anyway; capping it
    # here keeps large-format brochure pages from ballooning into
    # multi-megabyte uploads that just slow the LLM call down.
    MAX_IMAGE_LONG_SIDE: int = int(os.getenv("MAX_IMAGE_LONG_SIDE", "1600"))
    # Floor plans are the exception: dozens of tiny 11'9" X 14'0" labels
    # scattered over a drawing. At the normal cap those letterforms fall
    # below the point the model can resolve, and room sizes are exactly
    # what we can least afford to guess at — so those pages get more
    # pixels and a higher JPEG quality.
    FLOORPLAN_IMAGE_LONG_SIDE: int = int(os.getenv("FLOORPLAN_IMAGE_LONG_SIDE", "2600"))
    FLOORPLAN_JPEG_QUALITY: int = int(os.getenv("FLOORPLAN_JPEG_QUALITY", "92"))
    # A page is treated as a floor plan once its text layer carries at
    # least this many feet-and-inches dimension strings.
    FLOORPLAN_DIMENSION_HITS: int = int(os.getenv("FLOORPLAN_DIMENSION_HITS", "6"))
    IMAGE_JPEG_QUALITY: int = int(os.getenv("IMAGE_JPEG_QUALITY", "82"))
    # Below this confidence, a field is treated as "not found" and left
    # blank for manual entry rather than shown pre-ticked.
    CONFIDENCE_FLOOR: float = float(os.getenv("CONFIDENCE_FLOOR", "0.55"))

    # --- storage ---
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "storage" / "uploads")))
    IMAGE_DIR: Path = Path(os.getenv("IMAGE_DIR", str(BASE_DIR / "storage" / "images")))
    JOB_DIR: Path = Path(os.getenv("JOB_DIR", str(BASE_DIR / "storage" / "jobs")))

    # --- OCR fallback ---
    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "tesseract")

    def ensure_dirs(self) -> None:
        for d in (self.UPLOAD_DIR, self.IMAGE_DIR, self.JOB_DIR):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
