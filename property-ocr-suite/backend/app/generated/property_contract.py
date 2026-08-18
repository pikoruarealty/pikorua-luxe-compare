# GENERATED from schemas/property.v1.json. Do not edit.
from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

PROPERTY_SCHEMA_VERSION = 1

class FieldState(str, Enum):
    STATED = "stated"
    NOT_STATED = "not_stated"
    EXPLICITLY_NOT_OFFERED = "explicitly_not_offered"
    NOT_APPLICABLE = "not_applicable"
    PENDING_REVIEW = "pending_review"

class ConfigurationKind(str, Enum):
    VALUE_2_BHK = "2_bhk"
    VALUE_3_BHK = "3_bhk"
    VALUE_4_BHK = "4_bhk"
    VALUE_5_BHK = "5_bhk"
    VALUE_6_BHK = "6_bhk"
    VALUE_7_BHK = "7_bhk"
    PENTHOUSE = "penthouse"
    DUPLEX = "duplex"
    VILLA = "villa"
    BUNGALOW = "bungalow"
    PLOT = "plot"

class PropertyType(str, Enum):
    APARTMENT = "apartment"
    VILLA = "villa"
    BUNGALOW = "bungalow"
    PLOT = "plot"

class AreaBasis(str, Enum):
    CARPET = "carpet"
    RERA_CARPET = "rera_carpet"
    BUILT_UP = "built_up"
    SUPER_BUILT_UP = "super_built_up"
    PLOT = "plot"
    NOT_STATED = "not_stated"

class AreaUnit(str, Enum):
    SQ_FT = "sq_ft"
    SQ_M = "sq_m"
    SQ_YD = "sq_yd"
    ACRE = "acre"
    GAJ = "gaj"

class CeilingHeightBasis(str, Enum):
    CLEAR = "clear"
    SLAB_TO_SLAB = "slab_to_slab"
    NOT_STATED = "not_stated"

class CanonicalPublicProperty(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    developerName: str | None = None
    propertyType: PropertyType
    addressLine: str | None = None
    locality: str | None = None
    stateCode: str
    cityCode: str
    reraRegistration: str | None = None
    possessionDate: date | None = None
    configurationKind: ConfigurationKind
    areaValue: Decimal | None = None
    areaBasis: AreaBasis | None = None
    areaUnit: AreaUnit | None = None
    amenitiesOther: str | None = None
    totalTowers: int | None = None
    totalFloors: int | None = None
    unitsPerFloor: int | None = None
    totalUnits: int | None = None

class CanonicalCommercialTerms(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseSalePriceRupees: int | None = Field(default=None, ge=0)
    rateRupeesPerSqFt: Decimal | None = Field(default=None, ge=0)
    rateAreaBasis: AreaBasis | None = None

class CanonicalGatedProperty(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plotSizeValue: Decimal | None = Field(default=None, ge=0)
    plotSizeUnit: AreaUnit | None = None
    unitsPerAcre: Decimal | None = Field(default=None, ge=0)
    openSpacePercent: Decimal | None = Field(default=None, ge=0)
    parkingLevels: int | None = Field(default=None, ge=0)
    podiumStructure: str | None = None
    liftsPerTower: int | None = Field(default=None, ge=0)
    clubhouseSizeSqFt: Decimal | None = Field(default=None, ge=0)
    internalCeilingHeightFt: Decimal | None = Field(default=None, ge=0)
    ceilingHeightBasis: CeilingHeightBasis | None = None
    constructionQuality: str | None = None
    flooringType: str | None = None
    windowGlazing: str | None = None
    bathSanitaryFittings: str | None = None
    vrvAcProvision: str | None = None
    geyserProvision: str | None = None
    experienceYears: int | None = Field(default=None, ge=0)
    deliveredProjects: int | None = Field(default=None, ge=0)
    ongoingProjects: int | None = Field(default=None, ge=0)
    notableDeliveredProjects: list[str] | None = None
    background: str | None = None
    proposedStartDateRera: date | None = None
    possessionConfirmedAsOf: date | None = None
    bathrooms: int | None = Field(default=None, ge=0)
    balconies: int | None = Field(default=None, ge=0)
    servantRoom: bool | None = None
    floorPlanPage: int | None = Field(default=None, ge=0)
