"""Brochure -> Add Property form extractor.

Heavy deps (openai, PyMuPDF) are imported lazily so that
`from brochure_extractor.schema import FORM` works anywhere.
"""

from .config import settings
from .schema import CONFIG_FIELDS, FORM, IMAGE_SLOTS, build_json_schema

__version__ = "1.0.0"
__all__ = [
    "settings",
    "extract_property",
    "extract_from_dir",
    "to_form_payload",
    "build_json_schema",
    "FORM",
    "CONFIG_FIELDS",
    "IMAGE_SLOTS",
]

_LAZY = {"extract_property", "extract_from_dir", "to_form_payload"}


def __getattr__(name):
    if name in _LAZY:
        from . import pipeline

        return getattr(pipeline, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
