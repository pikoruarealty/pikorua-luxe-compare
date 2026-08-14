"""Environment-driven settings. Never hardcode API keys in source."""

import logging
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

    # Shared secret the developer portal sends back to this service. Not an LLM
    # key — it is the only thing standing between this API and the internet.
    SERVICE_API_KEY: str = os.getenv("SERVICE_API_KEY", "")

    # Running with no key used to silently disable auth everywhere, which meant
    # one forgotten environment variable published the upload endpoint, the job
    # reads and the extracted images — with an LLM budget behind them. Now that
    # only happens when it is asked for, out loud.
    ALLOW_INSECURE_LOCAL: bool = os.getenv("ALLOW_INSECURE_LOCAL", "") == "1"

    # Origins allowed to call this service from a browser. The upload genuinely
    # is cross-origin — the browser posts brochures here directly, because the
    # website's host caps request bodies well below what a brochure weighs — so
    # this cannot simply be closed; it has to be a list.
    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]

    # --- upload limits ---
    # MAX_PAGES_PER_DOC caps pages within one document but nothing capped the
    # number of documents, so a single request could fan out into hundreds of
    # vision-LLM calls and fill the disk on the way.
    MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_FILE_MB", "40")) * 1024 * 1024
    MAX_FILES: int = int(os.getenv("MAX_FILES", "6"))

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
    # ...but plenty of brochures ship with no text layer at all — every
    # label, room sizes included, is artwork. Those pages read as ordinary
    # marketing to the check above, so the plan sheets quietly lose both
    # the extra resolution and the dedicated LLM call they need: one such
    # book returned nine rooms for a 4 BHK, a different nine each run.
    #
    # A drawing is line art, so count the page's vector paths instead. Real
    # marketing pages sit in the tens; plan sheets run to hundreds or
    # thousands. Measured across this project's brochures, no marketing
    # page cleared 100 and no plan sheet came in under 350.
    FLOORPLAN_VECTOR_PATHS: int = int(os.getenv("FLOORPLAN_VECTOR_PATHS", "300"))
    # Vision APIs downscale what you send them — Claude to a 1568px long edge,
    # OpenAI likewise — so a plan sheet sent as one big image arrives at the
    # model no sharper than a small one, and the 4'3"X5'0" tucked into a corner
    # is simply not resolvable. Sending overlapping crops is the only way to
    # buy real magnification: each crop is downscaled on its own, so a 2x2 grid
    # doubles the linear detail the model actually sees. The overlap keeps a
    # label that straddles a seam from being sliced in half.
    # Set the grid to 1 to switch tiling off.
    FLOORPLAN_TILE_GRID: int = int(os.getenv("FLOORPLAN_TILE_GRID", "2"))
    FLOORPLAN_TILE_OVERLAP: float = float(os.getenv("FLOORPLAN_TILE_OVERLAP", "0.12"))
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

    def check_auth_configured(self) -> None:
        """Refuse to start unauthenticated unless that was the explicit intent.

        Failing here is the point. The alternative -- which this service shipped
        with -- is starting fine and serving every endpoint to anyone, with
        nothing in the logs to say so."""
        if self.SERVICE_API_KEY:
            return
        if self.ALLOW_INSECURE_LOCAL:
            logging.getLogger("config").warning(
                "SERVICE_API_KEY is empty and ALLOW_INSECURE_LOCAL=1: this process "
                "serves every endpoint without authentication. Local use only."
            )
            return
        raise RuntimeError(
            "SERVICE_API_KEY is not set. Set it, or set ALLOW_INSECURE_LOCAL=1 to "
            "run without authentication (local development only)."
        )


settings = Settings()
settings.ensure_dirs()
settings.check_auth_configured()
