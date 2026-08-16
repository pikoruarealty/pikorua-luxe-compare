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

class CanonicalCommercialTerms(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseSalePriceRupees: int | None = Field(default=None, ge=0)
    rateRupeesPerSqFt: Decimal | None = Field(default=None, ge=0)
    rateAreaBasis: AreaBasis | None = None
