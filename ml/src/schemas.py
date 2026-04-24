from pydantic import BaseModel
from typing import List, Optional
from datetime import date


class HistoryPoint(BaseModel):
    date: date
    score: float
    conflict: Optional[float] = None
    disaster: Optional[float] = None
    food: Optional[float] = None


class ForecastPoint(BaseModel):
    date: date
    score: float
    lower: float
    upper: float


class ForecastRequest(BaseModel):
    country_code: str
    history: List[HistoryPoint]
    horizon_months: int = 12


class ForecastResponse(BaseModel):
    country_code: str
    forecast: List[ForecastPoint]
