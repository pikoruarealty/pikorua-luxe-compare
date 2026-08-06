"""
Data model for the property brochure OCR pipeline.

Every scalar field on the "Add Property" form is wrapped in a `Field`
object instead of a bare value. That wrapper is what makes the
tick-box-verify / edit workflow possible on the frontend:

    {
      "value": "Ikebana",
      "found": true,
      "confidence": 0.94,
      "source_file": "brochure.pdf",
      "source_page": 2,
      "evidence": "Welcome to Ikebana, an address...",
      "verified": false
    }

Rules the extractor must follow (enforced in prompts.py + extractor.py):
  - Never guess. If a field isn't explicitly present in the document,
    found=false, value=null, confidence=0, evidence=null.
  - Every found=true field must carry a page number and a short
    verbatim snippet as evidence, so a human can jump straight to the
    source and verify in one glance instead of re-reading the whole PDF.
  - `verified` always starts false. It only flips to true when a human
    ticks the checkbox on the frontend — the backend never sets it.
"""

from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field as PydanticField


class ExtractedField(BaseModel):
    """A single extracted value plus provenance, for one form field."""

    value: Optional[Any] = None
    found: bool = False
    confidence: float = 0.0  # 0.0 - 1.0
    source_file: Optional[str] = None
    source_page: Optional[int] = None
    evidence: Optional[str] = None  # short verbatim snippet, <= ~25 words
    verified: bool = False  # human tick-box state; backend never sets True
    # True when this value was computed from other extracted values
    # rather than read off the page (e.g. "4 BHK" counted from the
    # bedrooms on a plan). The UI labels these differently so a human
    # never mistakes a derivation for something the brochure stated.
    derived: bool = False

    @classmethod
    def empty(cls) -> "ExtractedField":
        return cls()


def blank_field() -> ExtractedField:
    return ExtractedField()


class RoomDimension(BaseModel):
    """One room label + its printed size from a floor plan, e.g.
    BEDROOM / 11'9" X 14'0".

    `dimension` is kept as the VERBATIM string off the plan — feet and
    inches, the brochure's own punctuation — never converted to sq ft
    or decimals. A buyer comparing layouts is reading the same drawing,
    so the number on screen has to match the number on the paper.
    Rooms repeat (four BEDROOMs in a 4 BHK); each printed label is its
    own entry, in the order it appears."""

    room_name: ExtractedField = PydanticField(default_factory=blank_field)  # "Master Bedroom", "Kitchen"
    dimension: ExtractedField = PydanticField(default_factory=blank_field)  # "11'9\" X 14'0\""


class ConfigVariant(BaseModel):
    """One row under "Configurations" (e.g. 4 BHK / Type A).

    A single brochure floor plan usually shows a unit type (Unit A)
    split into two mirrored series (101-1101 and 102-1102) whose room
    sizes genuinely differ, so `floor_range` is part of what makes a
    variant distinct — not decoration."""

    bhk_type: ExtractedField = PydanticField(default_factory=blank_field)  # "4 BHK", "Penthouse", "Duplex"
    variant_label: ExtractedField = PydanticField(default_factory=blank_field)  # "Unit A" / "Type A"
    floor_range: ExtractedField = PydanticField(default_factory=blank_field)  # "101 to 1101"
    carpet_area: ExtractedField = PydanticField(default_factory=blank_field)
    built_up_area: ExtractedField = PydanticField(default_factory=blank_field)
    # The headline size a buyer is quoted — brochures and price lists print it
    # as "Super Built-up", "Saleable Area" or "Super Area". Kept distinct from
    # built_up_area because the two are different numbers on the same sheet.
    super_built_up_area: ExtractedField = PydanticField(default_factory=blank_field)
    price: ExtractedField = PydanticField(default_factory=blank_field)
    # "Basic rate" / "Rate per sq ft" off a price list.
    rate_per_sqft: ExtractedField = PydanticField(default_factory=blank_field)
    rooms: List[RoomDimension] = PydanticField(default_factory=list)


class BasicsSection(BaseModel):
    property_name: ExtractedField = PydanticField(default_factory=blank_field)
    developer: ExtractedField = PydanticField(default_factory=blank_field)
    category: ExtractedField = PydanticField(default_factory=blank_field)  # Apartment, Villa, ...
    status: ExtractedField = PydanticField(default_factory=blank_field)  # e.g. "Near Possession"
    possession: ExtractedField = PydanticField(default_factory=blank_field)  # "9 Months" / "RTMI"
    possession_confirmed_as_of: ExtractedField = PydanticField(default_factory=blank_field)  # dd-mm-yyyy
    location: ExtractedField = PydanticField(default_factory=blank_field)
    city: ExtractedField = PydanticField(default_factory=blank_field)
    state: ExtractedField = PydanticField(default_factory=blank_field)
    tagline: ExtractedField = PydanticField(default_factory=blank_field)
    expert_note: ExtractedField = PydanticField(default_factory=blank_field)


class ProjectStructureSection(BaseModel):
    plot_size: ExtractedField = PydanticField(default_factory=blank_field)
    available_bhk_types: ExtractedField = PydanticField(default_factory=blank_field)  # "4, 5, 6 BHK"
    total_towers: ExtractedField = PydanticField(default_factory=blank_field)
    total_floors: ExtractedField = PydanticField(default_factory=blank_field)
    units_per_floor: ExtractedField = PydanticField(default_factory=blank_field)
    total_units: ExtractedField = PydanticField(default_factory=blank_field)


class ReraSection(BaseModel):
    rera_id: ExtractedField = PydanticField(default_factory=blank_field)
    rera_link: ExtractedField = PydanticField(default_factory=blank_field)
    proposed_start_date: ExtractedField = PydanticField(default_factory=blank_field)  # "Jan 2025"


class ConstructionAmenitiesSection(BaseModel):
    parking_levels: ExtractedField = PydanticField(default_factory=blank_field)
    podium_structure: ExtractedField = PydanticField(default_factory=blank_field)
    lifts_per_tower: ExtractedField = PydanticField(default_factory=blank_field)
    open_space: ExtractedField = PydanticField(default_factory=blank_field)
    geyser_heat_pump: ExtractedField = PydanticField(default_factory=blank_field)
    vrv_ac_provided: ExtractedField = PydanticField(default_factory=blank_field)
    window_glasses: ExtractedField = PydanticField(default_factory=blank_field)
    bath_sanitary_fittings: ExtractedField = PydanticField(default_factory=blank_field)
    flooring: ExtractedField = PydanticField(default_factory=blank_field)
    density_units_per_acre: ExtractedField = PydanticField(default_factory=blank_field)
    construction_quality: ExtractedField = PydanticField(default_factory=blank_field)
    internal_ceiling_height: ExtractedField = PydanticField(default_factory=blank_field)
    clubhouse_size: ExtractedField = PydanticField(default_factory=blank_field)


class DeveloperSection(BaseModel):
    experience_years: ExtractedField = PydanticField(default_factory=blank_field)
    total_delivered_projects: ExtractedField = PydanticField(default_factory=blank_field)
    ongoing_projects: ExtractedField = PydanticField(default_factory=blank_field)
    background: ExtractedField = PydanticField(default_factory=blank_field)
    notable_delivered_projects: List[ExtractedField] = PydanticField(default_factory=list)


class ImageCandidate(BaseModel):
    """An embedded image pulled from the PDF. Category is never
    auto-assigned (cover / living room / pool / ...) — a human always
    picks that, because OCR has no reliable way to tell a living room
    photo from a pool photo. We just surface the candidates and the
    page they came from so the human doesn't have to dig through the
    PDF by hand."""

    source_file: str
    source_page: int
    image_path: str  # path to the extracted image on disk
    width: int
    height: int


class ImageSlots(BaseModel):
    """Named image slots on the form. These are NEVER auto-filled by
    OCR — a human always picks which candidate (or upload / URL) goes
    in each slot, since there's no reliable way to tell a pool photo
    from a living room photo from pixels alone. Plain optional URLs,
    not ExtractedField, because there's no OCR confidence to attach."""

    cover: Optional[str] = None
    living_room: Optional[str] = None
    master_bedroom: Optional[str] = None
    pool: Optional[str] = None
    clubhouse: Optional[str] = None


class PropertyExtraction(BaseModel):
    """Full form_payload — mirrors the Add Property form 1:1."""

    basics: BasicsSection = PydanticField(default_factory=BasicsSection)
    project_structure: ProjectStructureSection = PydanticField(default_factory=ProjectStructureSection)
    rera: ReraSection = PydanticField(default_factory=ReraSection)
    construction_amenities: ConstructionAmenitiesSection = PydanticField(
        default_factory=ConstructionAmenitiesSection
    )
    developer: DeveloperSection = PydanticField(default_factory=DeveloperSection)
    configurations: List[ConfigVariant] = PydanticField(default_factory=list)
    amenities: List[ExtractedField] = PydanticField(default_factory=list)  # "Infinity Pool", ...
    highlights: List[ExtractedField] = PydanticField(default_factory=list)  # "Handover within months"
    image_candidates: List[ImageCandidate] = PydanticField(default_factory=list)
    images: ImageSlots = PydanticField(default_factory=ImageSlots)

    # bookkeeping, not shown on the form
    source_files: List[str] = PydanticField(default_factory=list)
    warnings: List[str] = PydanticField(default_factory=list)
