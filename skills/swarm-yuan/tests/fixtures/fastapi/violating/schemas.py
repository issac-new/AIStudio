from pydantic import BaseModel, validator


class OrderIn(BaseModel):
    name: str

    # 违规：Pydantic v1 @validator（v2 须 @field_validator）
    @validator('name')
    def name_not_empty(cls, v):
        if not v:
            raise ValueError('empty')
        return v

    # 违规：v1 class Config（v2 须 model_config = ConfigDict）
    class Config:
        orm_mode = True
