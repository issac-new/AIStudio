from pydantic import BaseModel, ConfigDict, field_validator


class OrderIn(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str

    # Pydantic v2：field_validator 替代 v1 @validator
    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError('empty')
        return v


class OrderOut(BaseModel):
    id: int
    name: str
