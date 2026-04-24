from fastapi import FastAPI, HTTPException
from .schemas import ForecastRequest, ForecastResponse
from .prophet_model import forecast_score

app = FastAPI(title='Global Safety Index — ML Service')


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/forecast', response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if len(req.history) < 2:
        raise HTTPException(status_code=400, detail='At least 2 history points required')
    try:
        forecast_points = forecast_score(req.history, req.horizon_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return ForecastResponse(country_code=req.country_code, forecast=forecast_points)
