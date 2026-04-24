import pandas as pd
from prophet import Prophet
from typing import List
from .schemas import HistoryPoint, ForecastPoint


def forecast_score(history: List[HistoryPoint], horizon_months: int = 12) -> List[ForecastPoint]:
    df = pd.DataFrame([{'ds': h.date, 'y': h.score} for h in history])
    df['ds'] = pd.to_datetime(df['ds'])

    model = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
    model.fit(df)

    future = model.make_future_dataframe(periods=horizon_months, freq='MS')
    forecast = model.predict(future)

    result_df = forecast[forecast['ds'] > df['ds'].max()][['ds', 'yhat', 'yhat_lower', 'yhat_upper']]

    return [
        ForecastPoint(
            date=row['ds'].date(),
            score=round(max(0, min(100, row['yhat'])), 2),
            lower=round(max(0, row['yhat_lower']), 2),
            upper=round(min(100, row['yhat_upper']), 2),
        )
        for _, row in result_df.iterrows()
    ]
