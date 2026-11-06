from typing import Literal
from pydantic import BaseModel, Field, field_validator


class Credentials(BaseModel):
    email: str = Field(
        min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default="Shopper", min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def lower(cls, v):
        return v.strip().lower()


class Preferences(BaseModel):
    budget: int = Field(default=150000, ge=0, le=100000000)
    monthly_budget: int = Field(default=600000, ge=0, le=100000000)
    household_size: int = Field(default=2, ge=1, le=30)
    dietary: list[Literal["vegetarian", "vegan"]] = Field(
        default_factory=list, max_length=2
    )
    allergies: list[
        Literal[
            "milk",
            "wheat",
            "peanut",
            "egg",
            "fish",
            "soy",
            "tree nut",
            "shellfish",
            "sesame",
        ]
    ] = Field(default_factory=list)
    preferred_brands: list[str] = Field(default_factory=list, max_length=20)
    preferred_categories: list[str] = Field(default_factory=list, max_length=11)
    frequency: Literal["daily", "weekly", "monthly"] = "weekly"
    context: Literal["regular", "breakfast", "family", "essentials"] = "regular"


class ItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=99)
    minimum: int = Field(default=0, ge=0, le=99)
    locked: bool = False


class ItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=99)
    minimum: int = Field(default=0, ge=0, le=99)
    locked: bool = False


class RunInput(BaseModel):
    mode: Literal[
        "Balanced",
        "Budget Saver",
        "Nutrition Focus",
        "Preference Focus",
        "Essentials First",
    ] = "Balanced"


class Decision(BaseModel):
    optimization_id: str
    accepted_item_ids: list[int] | None = Field(default=None, max_length=110)


class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=100)
