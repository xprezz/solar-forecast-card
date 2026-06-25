# Solar Forecast Card

A custom Lovelace card built specifically for the
[`solar-forecast`](https://github.com/xprezz/solar-forecast) Home Assistant
integration. Single file, no dependencies, container‑aware layout.

![accuracy badge](https://img.shields.io/badge/HACS-Plaintext-blue)

## What it shows

- Hero with 7‑day total, today’s predicted/actual, tomorrow’s prediction
- Dynamic weather hero icon (sun / moon / cloud / rain) by time of day
- KPI strip: peak kW, model RMSE, rolling 14‑day accuracy
- Scrollable 7‑day history & forecast strip (drill into any day)
- Hourly predicted vs actual area+line chart across the visible 7 days
- Per‑day weather detail (irradiance, sunshine, cloud, temp, precip, UV)
- “SURPLUS / GOOD / MODEST / LOW” strategy hints for today & tomorrow

## Install via HACS

1. HACS → Frontend → ⋮ → **Custom repositories**
2. Add `https://github.com/xprezz/solar-forecast-card` as category **Lovelace**
3. Install **Solar Forecast Card**
4. HACS auto‑adds it as a dashboard resource. If you’re on legacy YAML mode:
   ```yaml
   resources:
     - url: /hacsfiles/solar-forecast-card/solar-forecast-card.js
       type: module
   ```

## Use

Minimal:
```yaml
type: custom:solar-forecast-card
```

Optional overrides:
```yaml
type: custom:solar-forecast-card
prefix: sensor.my_solar_forecast        # narrow auto‑discovery
today: sensor.my_solar_forecast_today    # or override any individual slot
tomorrow: sensor.my_solar_forecast_tomorrow
week: sensor.my_solar_forecast_7_day_total
peak: sensor.my_solar_forecast_forecast_peak_power
strategy_today: sensor.my_solar_forecast_strategy_today
strategy_tomorrow: sensor.my_solar_forecast_strategy_tomorrow
model: sensor.my_solar_forecast_model_rmse
hourly: sensor.my_solar_forecast_hourly_forecast
today_actual: sensor.my_solar_forecast_today_actual
daily_log: sensor.my_solar_forecast_daily_log
```

The card auto‑discovers entities — for most installs no config is needed.

## Companion integration

This card expects entities produced by the
[`solar-forecast`](https://github.com/xprezz/solar-forecast) integration.
Install that one first.
