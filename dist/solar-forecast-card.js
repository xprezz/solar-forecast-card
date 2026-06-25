/**
 * Solar Forecast Card - Custom Lovelace card for the solar_forecast integration.
 *
 * Install via `/local/community/solar-forecast-card/solar-forecast-card.js` and
 * add a resource pointing to it.
 *
 * Auto-discovers entities from the solar_forecast integration regardless of
 * what you named the config entry (e.g. "Garage My Solar Forecast" works fine).
 *
 * Minimal config:
 *   type: custom:solar-forecast-card
 *
 * Optional overrides if you have multiple integration instances or want to
 * point the card at specific entities:
 *   type: custom:solar-forecast-card
 *   prefix: sensor.garage_my_solar_forecast      # narrow auto-discovery
 *   today: sensor.garage_my_solar_forecast_today # or override individual slots
 *   tomorrow: ...
 *   week: ...
 *   peak: ...
 *   strategy_today: ...
 *   strategy_tomorrow: ...
 *   model: ...
 *   hourly: ...
 */

const CARD_VERSION = "2.1.0";

// Map of slot name -> suffix(es) to match against entity_id, in priority order.
const SLOT_SUFFIXES = {
  today:             ["_today"],
  tomorrow:          ["_tomorrow"],
  week:              ["_7_day_total", "_week_total"],
  peak:              ["_forecast_peak_power", "_peak_power", "_peak"],
  strategy_today:    ["_strategy_today"],
  strategy_tomorrow: ["_strategy_tomorrow"],
  model:             ["_model_rmse", "_model"],
  hourly:            ["_hourly_forecast", "_hourly"],
  today_actual:      ["_today_actual"],
  daily_log:         ["_daily_log"],
};

class SolarForecastCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    if (!this._root) this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() { return 8; }

  // Sections view: allow 6..12 columns wide; content reflows via container queries.
  getGridOptions() {
    return { rows: "auto", columns: 12, min_columns: 6, max_columns: 12, min_rows: 6 };
  }

  // Masonry/grid legacy layout support.
  getLayoutOptions() {
    return { grid_columns: 12, grid_rows: "auto", grid_min_columns: 6, grid_max_columns: 12 };
  }

  /**
   * Auto-discover entity_ids for every slot. Strategy:
   *   1. If user supplied a config.<slot>, trust it absolutely.
   *   2. Else, take all sensor entities whose entity_id contains "solar_forecast"
   *      (or match config.prefix if given) and pick the first one whose
   *      entity_id ends with any of the slot's known suffixes.
   *   3. As a fallback, look at friendly_name suffix (e.g. "... Today").
   */
  _resolveEntities() {
    const resolved = {};
    const states = this._hass.states;
    const prefix = this._config.prefix; // optional narrow filter

    const candidates = Object.keys(states).filter((eid) => {
      if (!eid.startsWith("sensor.")) return false;
      if (prefix && !eid.startsWith(prefix)) return false;
      return eid.includes("solar_forecast") || (states[eid].attributes.attribution || "").includes("solar_forecast");
    });

    for (const [slot, suffixes] of Object.entries(SLOT_SUFFIXES)) {
      if (this._config[slot]) {
        resolved[slot] = this._config[slot];
        continue;
      }
      // Try suffix match on entity_id
      let hit = candidates.find((eid) => suffixes.some((sfx) => eid.endsWith(sfx)));
      if (!hit) {
        // Friendly-name fallback: match trailing words (case-insensitive)
        const nameSuffixes = {
          today: ["today"], tomorrow: ["tomorrow"],
          week: ["7 day total", "week total"],
          peak: ["forecast peak power", "peak power"],
          strategy_today: ["strategy today"],
          strategy_tomorrow: ["strategy tomorrow"],
          model: ["model rmse"],
          hourly: ["hourly forecast"],
        }[slot] || [];
        hit = candidates.find((eid) => {
          const fn = (states[eid].attributes.friendly_name || "").toLowerCase();
          return nameSuffixes.some((s) => fn.endsWith(s));
        });
      }
      if (hit) resolved[slot] = hit;
    }
    return resolved;
  }

  _build() {
    this._root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display:block; container-type: inline-size; }
      .card { background: var(--card-background-color, #fff); color: var(--primary-text-color);
              border-radius: var(--ha-card-border-radius, 12px); padding:16px;
              box-shadow: var(--ha-card-box-shadow, 0 1px 2px rgba(0,0,0,.1)); font-family: var(--paper-font-body1_-_font-family); }
      .content { container-type: inline-size; }
      .layout { display: block; }
      .col-l > *:last-child, .col-r > *:last-child { margin-bottom: 0; }
      @container (min-width: 720px) {
        .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
        .col-l, .col-r { min-width: 0; }
        .days { grid-template-columns: repeat(7, 1fr); }
        svg.chart { height: 320px; }
      }
      @container (min-width: 1080px) {
        .hero-num { font-size: 3rem; }
        svg.chart { height: 360px; }
      }
      .hero { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
      .hero-num { font-size:2.4rem; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; }
      .hero-unit { font-size:0.55em; color:var(--secondary-text-color); margin-left:4px; }
      .hero-sub { color:var(--secondary-text-color); font-size:.85rem; margin-top:4px; display:flex; flex-direction:column; gap:2px; }
      .sub-row { display:inline-flex; flex-wrap:wrap; gap:8px; align-items:baseline; }
      .actual-chip { color:#2bb35e; font-weight:500; display:inline-flex; flex-wrap:wrap; gap:6px; align-items:baseline; }
      .delta-pos { color: var(--success-color, #43a047); font-weight:600; }
      .delta-neg { color: var(--warning-color, #f59e0b); font-weight:600; }
      .chart-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:.82rem; color:var(--secondary-text-color); margin-top:10px; padding-left:12px; }
      .chart-legend .lg { display:inline-flex; align-items:center; gap:6px; }
      .chart-legend .sw { display:inline-block; width:14px; height:3px; border-radius:2px; }
      .chart-legend .sw-pred { background:#f5a623; }
      .chart-legend .sw-actual { background:#2bb35e; }
      .chart-legend .sw-now { background:var(--primary-color); height:10px; width:2px; border-radius:0; }
      .sun { width:72px; height:72px; min-width:72px; position:relative;
             display:flex; align-items:center; justify-content:center; line-height:1; user-select:none;
             animation: pulse 4s ease-in-out infinite; }
      .sun-glyph { position:relative; z-index:1; font-size:3rem; line-height:1; }
      .sun.sunny  { color:#eab65a; }
      .sun.cloudy { color:#8a98b3; }
      .sun.rainy  { color:#5d7da3; }
      .sun.moon   { color:#7a8aae; }
      @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
      .kpi-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px; }
      .kpi { background:var(--secondary-background-color); border-radius:10px; padding:10px 12px; }
      .kpi-label { font-size:.7rem; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.05em; }
      .kpi-val { font-size:1.25rem; font-weight:700; font-variant-numeric:tabular-nums; margin-top:2px; }
      .days-wrap { margin-bottom:14px; }
      .days-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
      .days-head .title { font-size:.78rem; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.05em; }
      .days-nav { display:flex; gap:4px; }
      .days-nav button { background:var(--secondary-background-color); color:var(--primary-text-color); border:none;
                         border-radius:6px; width:28px; height:24px; cursor:pointer; font-size:.85rem; padding:0;
                         display:inline-flex; align-items:center; justify-content:center; }
      .days-nav button:hover { background:var(--divider-color); }
      .days-nav button:disabled { opacity:.35; cursor:not-allowed; }
      .days { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
      .day { background:var(--secondary-background-color); border-radius:8px; padding:6px 3px; text-align:center;
             cursor:pointer; transition:transform .12s, border-color .12s; border:2px solid transparent; min-width:0; }
      .day:hover { transform:translateY(-1px); }
      .day.active { border-color:var(--primary-color); background:var(--card-background-color); box-shadow:0 0 0 1px var(--primary-color) inset; }
      .day.today { background:linear-gradient(180deg, rgba(245,166,35,0.18), var(--secondary-background-color)); }
      .day.future { opacity:.95; }
      .day.past { }
      .day-name { font-size:.65rem; color:var(--secondary-text-color); }
      .day-num { font-size:.6rem; color:var(--secondary-text-color); }
      .day-emoji { font-size:1.15rem; margin:1px 0; }
      .day-kwh { font-weight:700; font-size:.85rem; font-variant-numeric:tabular-nums; }
      .day-delta { font-size:.65rem; font-variant-numeric:tabular-nums; margin-top:1px; }
      .day-bar { height:3px; background:var(--divider-color); border-radius:99px; margin-top:4px; overflow:hidden; }
      .day-bar > div { height:100%; background:linear-gradient(90deg,#f5a623,var(--primary-color)); transition:width .8s; }
      .detail { background:var(--secondary-background-color); border-radius:10px; padding:12px 14px; margin-bottom:14px; }
      .detail-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
      .detail-date { font-weight:700; font-size:1.05rem; }
      .detail-tag { font-size:.7rem; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.04em; }
      .detail-prod { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:10px; font-variant-numeric:tabular-nums; }
      .detail-prod .blk { display:flex; flex-direction:column; }
      .detail-prod .blk .lbl { font-size:.65rem; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.04em; }
      .detail-prod .blk .val { font-size:1.1rem; font-weight:700; }
      .detail-prod .blk .val.pred { color:#f5a623; }
      .detail-prod .blk .val.act { color:#2bb35e; }
      .wx-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; }
      .wx { background:var(--card-background-color); border-radius:8px; padding:7px 9px; display:flex; align-items:center; gap:8px; }
      .wx .ic { font-size:1.1rem; }
      .wx .txt { display:flex; flex-direction:column; min-width:0; }
      .wx .lbl { font-size:.62rem; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.04em; }
      .wx .val { font-size:.9rem; font-weight:600; font-variant-numeric:tabular-nums; }
      .strat { padding:12px 14px; border-radius:10px; border-left:4px solid var(--divider-color);
               background:var(--secondary-background-color); margin-bottom:10px; }
      .strat.surplus { border-left-color: var(--success-color, #43a047); }
      .strat.good { border-left-color: #f5a623; }
      .strat.modest { border-left-color: var(--warning-color, #ff9800); }
      .strat.low { border-left-color: var(--error-color, #e53935); }
      .strat-head { font-weight:600; margin-bottom:4px; }
      .strat ul { margin:4px 0 0; padding-left:18px; font-size:.85rem; color:var(--secondary-text-color); }
      .chart-wrap { position:relative; }
      svg.chart { width:100%; height:300px; display:block; }
      svg.chart path.area { fill:url(#g); }
      svg.chart path.line { fill:none; stroke:#f5a623; stroke-width:2; }
      svg.chart path.actual-line { stroke:#2bb35e; stroke-width:2.2; }
      svg.chart .actual-dot { fill:#2bb35e; }
      svg.chart .axis { fill:var(--secondary-text-color); font-size:13px; }
      svg.chart .grid { stroke:var(--divider-color); stroke-dasharray:3 3; }
      svg.chart .now { stroke:var(--primary-color); stroke-dasharray:3 3; }
      .footer { font-size:.7rem; color:var(--secondary-text-color); margin-top:10px; text-align:right; }
      .model-info { font-size:.75rem; color:var(--secondary-text-color); display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; }
    `;
    this._root.appendChild(style);
    const card = document.createElement("ha-card");
    card.classList.add("card");
    card.innerHTML = `<div class="content"></div>`;
    this._root.appendChild(card);
    this._content = card.querySelector(".content");
    this._windowOffset = 0;
    this._selectedDate = null;
    this._chartScope = "future"; // "future" or selected past/today day's hourly
  }

  _weatherEmoji(code, cloud, precip) {
    if (precip > 3) return "🌧️";
    if (precip > 0.3) return "🌦️";
    if (code != null) {
      if (code >= 95) return "⛈️";
      if (code >= 71) return "❄️";
      if (code >= 51) return "🌧️";
      if (code >= 45) return "🌫️";
      if (code >= 3) return "☁️";
      if (code >= 2) return "⛅";
      if (code >= 1) return "🌤️";
      return "☀️";
    }
    if (cloud > 80) return "☁️"; if (cloud > 50) return "⛅"; if (cloud > 25) return "🌤️"; return "☀️";
  }

  _heroWeather(todayState) {
    const a = (todayState && todayState.attributes) || {};
    const now = new Date();
    const sunrise = a.sunrise ? new Date(a.sunrise) : null;
    const sunset = a.sunset ? new Date(a.sunset) : null;
    const isNight = !!(sunrise && sunset && (now < sunrise || now > sunset));

    const cloud = Number(a.cloud_pct ?? 0);
    const precip = Number(a.precip_mm ?? 0);
    const code = a.weather_code;
    let emoji = this._weatherEmoji(code, cloud, precip);
    if (isNight && ["☀️", "🌤️", "⛅"].includes(emoji)) emoji = "🌙";

    let cls = "sunny";
    if (emoji.includes("🌧") || emoji.includes("⛈")) cls = "rainy";
    else if (emoji.includes("☁") || emoji.includes("⛅") || emoji.includes("🌫")) cls = "cloudy";
    else if (emoji.includes("🌙")) cls = "moon";

    return { emoji, cls };
  }

  _render() {
    if (!this._hass) return;
    const slots = this._resolveEntities();
    const s = (eid) => eid ? this._hass.states[eid] : undefined;
    const today = s(slots.today);
    const tomorrow = s(slots.tomorrow);
    const week = s(slots.week);
    const peak = s(slots.peak);
    const stratT = s(slots.strategy_today);
    const stratTomo = s(slots.strategy_tomorrow);
    const model = s(slots.model);
    const hourly = s(slots.hourly);
    const todayActual = s(slots.today_actual);
    const dailyLog = s(slots.daily_log);

    if (!today) {
      this._content.innerHTML = `<div style="padding:8px;">
        Solar Forecast sensors not found. Make sure the Solar Forecast integration
        is set up. If you have multiple instances, add <code>prefix: sensor.your_name</code>
        to this card's config.
      </div>`;
      return;
    }

    // ----- Build the merged day list (past actuals + today + future forecast) -----
    const logEntries = (dailyLog && dailyLog.attributes.entries) || [];
    const weatherEntries = (week && week.attributes.per_day_weather) || [];
    // Merge by date — log entries are authoritative for actual + stored predicted/weather;
    // week entries fill in future days (and today if not yet stored).
    const byDate = new Map();
    for (const e of logEntries) byDate.set(e.date, { ...e, source: "log" });
    for (const e of weatherEntries) {
      const existing = byDate.get(e.date) || {};
      byDate.set(e.date, {
        ...existing,
        date: e.date,
        // prefer log's predicted (stored at-the-time prediction); fall back to forecast
        predicted: existing.predicted ?? e.predicted_kwh,
        actual: existing.actual,
        ghi_wh_m2: existing.ghi_wh_m2 ?? (e.ghi_mj_m2 != null ? Math.round(e.ghi_mj_m2 * 277.777) : null),
        sunshine_min: existing.sunshine_min ?? e.sunshine_min,
        cloud_pct: existing.cloud_pct ?? e.cloud_pct,
        temp_min: existing.temp_min ?? e.temp_min,
        temp_max: existing.temp_max ?? e.temp_max,
        precip_mm: existing.precip_mm ?? e.precip_mm,
        uv_max: existing.uv_max ?? e.uv_max,
        weather_code: existing.weather_code ?? e.weather_code,
        source: existing.source || "forecast",
      });
    }
    const allDays = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Determine today + the window of 14 days centered around today + offset
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayIdx = allDays.findIndex(d => d.date === todayIso);
    const WIN = 7;
    // Default window: 3 past + today + 3 future (balanced)
    const defaultStart = Math.max(0, (todayIdx >= 0 ? todayIdx - 3 : 0));
    const winStart = Math.max(0, Math.min(allDays.length - 1, defaultStart + this._windowOffset));
    const winEnd = Math.min(allDays.length, winStart + WIN);
    const windowDays = allDays.slice(winStart, winEnd);

    // Selected day: default today, fallback to last day in window
    let selectedDate = this._selectedDate;
    if (!selectedDate || !byDate.has(selectedDate)) {
      selectedDate = todayIso && byDate.has(todayIso) ? todayIso : (windowDays.length ? windowDays[windowDays.length - 1].date : null);
    }

    // Max kWh for bar scaling (across the visible window)
    const maxDay = Math.max(1,
      ...windowDays.map(d => Math.max(Number(d.predicted) || 0, Number(d.actual) || 0))
    );

    // Render the strip cells
    const dayStripHtml = windowDays.map(d => {
      const dt = new Date(d.date);
      const wd = dt.toLocaleDateString(undefined, { weekday: "short" });
      const dn = dt.getDate();
      const isToday = d.date === todayIso;
      const isPast = d.date < todayIso;
      const isFuture = d.date > todayIso;
      const cls = ["day"];
      if (isToday) cls.push("today");
      else if (isPast) cls.push("past");
      else cls.push("future");
      if (d.date === selectedDate) cls.push("active");
      const emoji = this._weatherEmoji(d.weather_code, d.cloud_pct ?? 50, d.precip_mm ?? 0);
      // Headline value: actual if past, predicted otherwise
      const hasActual = d.actual != null;
      const headlineVal = (isPast && hasActual) ? Number(d.actual) : Number(d.predicted ?? 0);
      const barW = Math.min(100, (headlineVal / maxDay) * 100);
      let deltaHtml = "";
      if (hasActual && d.predicted != null) {
        const dv = d.actual - d.predicted;
        const sign = dv >= 0 ? "+" : "";
        const cl = dv >= 0 ? "delta-pos" : "delta-neg";
        deltaHtml = `<div class="day-delta ${cl}">${sign}${dv.toFixed(0)}</div>`;
      } else if (isFuture && d.predicted != null) {
        deltaHtml = `<div class="day-delta" style="color:var(--secondary-text-color)">pred</div>`;
      } else {
        deltaHtml = `<div class="day-delta" style="visibility:hidden">.</div>`;
      }
      return `<div class="${cls.join(" ")}" data-date="${d.date}">
        <div class="day-name">${wd}</div>
        <div class="day-num">${dn}</div>
        <div class="day-emoji">${emoji}</div>
        <div class="day-kwh">${headlineVal.toFixed(0)}</div>
        ${deltaHtml}
        <div class="day-bar"><div style="width:${barW}%"></div></div>
      </div>`;
    }).join("");

    // Build detail panel for selected day
    const detailHtml = selectedDate ? this._renderDetail(byDate.get(selectedDate), todayIso, todayActual) : "";

    // strategies — only today + tomorrow are exposed as separate sensors
    const strategies = [stratT, stratTomo].filter(Boolean);

    // Hourly curve chart across the visible 7-day window (168 points).
    // For each day we use:
    //   - hourly_pred_kw[24] from stored history (past days) or from live hourly sensor (today + future)
    //   - hourly_actual_kwh[24] from stored history (past + today)
    // For past days without stored hourly_pred (pre-upgrade), we synthesize a
    // bell curve from the daily total so the user still sees the daylight shape.
    let chartSvg = "";
    if (windowDays.length) {
      const W = 700, H = 320, padL = 36, padR = 8, padT = 34, padB = 28;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;
      const HOURS_PER_DAY = 24;
      const totalPoints = windowDays.length * HOURS_PER_DAY;

      // Build a flat 168-length predicted + actual array (kW per hour ~ kWh per hour for 1h buckets)
      const liveHourly = hourly ? hourly.attributes : {};
      const liveTimes = liveHourly.time || [];
      const livePred = liveHourly.pred_kw || [];
      const liveActual = liveHourly.actual_kwh || [];
      // Build a date -> hour -> {pred, actual} map from live hourly sensor
      const liveMap = new Map(); // key: "YYYY-MM-DD", value: {pred:[24], actual:[24]}
      for (let i = 0; i < liveTimes.length; i++) {
        const t = liveTimes[i];
        const dk = t.slice(0, 10);
        const h = parseInt(t.slice(11, 13), 10);
        if (!liveMap.has(dk)) liveMap.set(dk, { pred: Array(24).fill(null), actual: Array(24).fill(null) });
        const m = liveMap.get(dk);
        m.pred[h] = livePred[i] != null ? Number(livePred[i]) : null;
        m.actual[h] = liveActual[i] != null ? Number(liveActual[i]) : null;
      }

      // Synthesize a bell curve scaled to daily total. Bell peaks at solar noon.
      // Use sunrise/sunset approximation by month for a slightly better shape.
      const synthBell = (dailyTotal, dt) => {
        const arr = Array(24).fill(0);
        if (!dailyTotal || dailyTotal <= 0) return arr;
        // Rough daylight window (Copenhagen) by month
        const m = dt.getMonth(); // 0..11
        const sunriseByMonth = [9, 8, 7, 6, 5, 4.5, 5, 6, 7, 8, 8.5, 9];
        const sunsetByMonth  = [16, 17, 18, 20, 21, 22, 22, 21, 19, 18, 16.5, 16];
        const sr = sunriseByMonth[m], ss = sunsetByMonth[m];
        const noon = (sr + ss) / 2;
        const sigma = (ss - sr) / 4;
        let weights = arr.map((_, h) => Math.exp(-Math.pow(h + 0.5 - noon, 2) / (2 * sigma * sigma)));
        const total = weights.reduce((a, b) => a + b, 0);
        return weights.map(w => (w / total) * dailyTotal);
      };

      // Build flat arrays
      const predFlat = Array(totalPoints).fill(null);
      const actualFlat = Array(totalPoints).fill(null);
      windowDays.forEach((d, di) => {
        const offset = di * HOURS_PER_DAY;
        const dt = new Date(d.date);
        let predDay = null;
        // 1. Try stored hourly_pred_kw from history
        if (Array.isArray(d.hourly_pred_kw)) {
          predDay = d.hourly_pred_kw;
        }
        // 2. Try live hourly sensor for today/future
        if ((!predDay || predDay.every(v => v == null)) && liveMap.has(d.date)) {
          predDay = liveMap.get(d.date).pred;
        }
        // 3. Synthesize bell from daily total
        if ((!predDay || predDay.every(v => v == null)) && d.predicted != null) {
          predDay = synthBell(Number(d.predicted), dt);
        }
        if (predDay) {
          for (let h = 0; h < 24; h++) {
            if (predDay[h] != null) predFlat[offset + h] = Number(predDay[h]);
          }
        }

        let actDay = null;
        if (Array.isArray(d.hourly_actual_kwh)) actDay = d.hourly_actual_kwh;
        if ((!actDay || actDay.every(v => v == null)) && liveMap.has(d.date)) {
          actDay = liveMap.get(d.date).actual;
        }
        if (actDay) {
          for (let h = 0; h < 24; h++) {
            if (actDay[h] != null) actualFlat[offset + h] = Number(actDay[h]);
          }
        }
      });

      const maxKw = Math.max(0.5,
        ...predFlat.filter(v => v != null),
        ...actualFlat.filter(v => v != null),
      );

      const x = i => padL + (i / Math.max(1, totalPoints - 1)) * innerW;
      const y = v => padT + innerH * (1 - v / maxKw);

      // Build predicted area + line (continuous, treat null as 0 so the area touches baseline)
      let area = `M ${x(0)} ${padT + innerH}`;
      let line = "";
      let lineStarted = false;
      for (let i = 0; i < totalPoints; i++) {
        const v = predFlat[i] != null ? predFlat[i] : 0;
        area += ` L ${x(i)} ${y(v)}`;
        if (predFlat[i] != null) {
          line += lineStarted ? ` L ${x(i)} ${y(v)}` : `M ${x(i)} ${y(v)}`;
          lineStarted = true;
        } else {
          lineStarted = false;
        }
      }
      area += ` L ${x(totalPoints - 1)} ${padT + innerH} Z`;

      // Actual line (only where we have data)
      let actualPath = "";
      let actStarted = false;
      for (let i = 0; i < totalPoints; i++) {
        const v = actualFlat[i];
        if (v == null) { actStarted = false; continue; }
        actualPath += actStarted ? ` L ${x(i)} ${y(v)}` : `M ${x(i)} ${y(v)}`;
        actStarted = true;
      }

      // Day dividers + labels
      let dividers = "";
      windowDays.forEach((d, di) => {
        const xStart = di * HOURS_PER_DAY;
        if (di > 0) dividers += `<line class="grid" x1="${x(xStart)}" y1="${padT}" x2="${x(xStart)}" y2="${padT + innerH}"/>`;
        const cx = x(xStart + 12); // midday
        const dt = new Date(d.date);
        const wd = dt.toLocaleDateString(undefined, { weekday: "short" });
        const dn = dt.getDate();
        const isToday = d.date === todayIso;
        const isSel = d.date === selectedDate;
        const lblColor = isToday ? "var(--primary-color)" : "var(--secondary-text-color)";
        const fw = isToday || isSel ? "700" : "400";
        dividers += `<text class="axis" x="${cx}" y="${H - 6}" text-anchor="middle" fill="${lblColor}" font-weight="${fw}">${wd} ${dn}</text>`;
        // Selected/today underline
        if (isToday || isSel) {
          const ux1 = x(xStart) + 2;
          const ux2 = x(Math.min(totalPoints - 1, xStart + 23)) - 2;
          const uc = isToday ? "var(--primary-color)" : "var(--divider-color)";
          dividers += `<line x1="${ux1}" y1="${H - 22}" x2="${ux2}" y2="${H - 22}" stroke="${uc}" stroke-width="2"/>`;
        }
      });

      // "Now" line if today is in window
      let nowLine = "";
      if (todayIdx >= 0) {
        const todayWinPos = windowDays.findIndex(d => d.date === todayIso);
        if (todayWinPos >= 0) {
          const now = new Date();
          const hourFloat = now.getHours() + now.getMinutes() / 60;
          const nowI = todayWinPos * HOURS_PER_DAY + hourFloat;
          nowLine = `<line class="now" x1="${x(nowI)}" y1="${padT}" x2="${x(nowI)}" y2="${padT + innerH}"/>`;
        }
      }

      // Invisible click-overlays per day for chart interaction
      let clickRects = "";
      windowDays.forEach((d, di) => {
        const x1 = x(di * HOURS_PER_DAY);
        const x2 = x(Math.min(totalPoints - 1, (di + 1) * HOURS_PER_DAY));
        clickRects += `<rect x="${x1}" y="${padT}" width="${x2 - x1}" height="${innerH}"
                              fill="transparent" data-date="${d.date}" class="day-hit" style="cursor:pointer"/>`;
      });

      chartSvg = `
        <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#f5a623" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#f5a623" stop-opacity="0.05"/>
          </linearGradient></defs>
          ${dividers}
          <path class="area" d="${area}"/>
          <path class="line" d="${line}"/>
          <path class="actual-line" d="${actualPath}" fill="none"/>
          ${nowLine}
          <text class="axis" x="10" y="20" text-anchor="start">Peak: ${maxKw.toFixed(1)} kW</text>
          ${clickRects}
        </svg>
        <div class="chart-legend">
          <span class="lg"><span class="sw sw-pred"></span>Predicted</span>
          <span class="lg"><span class="sw sw-actual"></span>Actual</span>
          <span class="lg"><span class="sw sw-now"></span>Now</span>
        </div>`;
    }

    const heroWx = this._heroWeather(today);

    this._content.innerHTML = `
      <div class="layout">
        <div class="col-l">
          <div class="hero">
            <div>
              <div class="hero-num">${Number(week ? week.state : 0).toFixed(0)}<span class="hero-unit">kWh / 7 days</span></div>
              <div class="hero-sub">
                <span class="sub-row">
                  <span><b>Today</b> ${Number(today.state).toFixed(1)} kWh predicted</span>
                  ${todayActual ? (() => {
                    const a = Number(todayActual.state);
                    const pDay = Number(today.state);
                    const deltaKwh = a - pDay;
                    const sign = deltaKwh >= 0 ? "+" : "";
                    const cls = deltaKwh >= 0 ? "delta-pos" : "delta-neg";
                    return `<span class="actual-chip" title="actual production today vs full-day predicted">
                      <b>${a.toFixed(1)} kWh actual</b>
                      <span class="${cls}">(${sign}${deltaKwh.toFixed(1)} kWh vs ${pDay.toFixed(1)} predicted today)</span>
                    </span>`;
                  })() : ""}
                </span>
                <span class="sub-row"><b>Tomorrow</b> ${tomorrow ? Number(tomorrow.state).toFixed(1) : "—"} kWh predicted</span>
              </div>
            </div>
            <div class="sun ${heroWx.cls}" title="Current sky icon based on local time and weather"><span class="sun-glyph">${heroWx.emoji}</span></div>
          </div>

          <div class="kpi-row">
            <div class="kpi">
              <div class="kpi-label">Peak power</div>
              <div class="kpi-val">${peak ? Number(peak.state).toFixed(1) : "—"} kW</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Model RMSE</div>
              <div class="kpi-val">${model ? Number(model.state).toFixed(1) : "—"} kWh</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Accuracy (14d)</div>
              <div class="kpi-val">${dailyLog && dailyLog.attributes.mape_pct_last_14d != null ? (100 - dailyLog.attributes.mape_pct_last_14d).toFixed(0) + "%" : (model ? (model.attributes.trained_on_days || "—") + " d" : "—")}</div>
            </div>
          </div>

          <div class="days-wrap">
            <div class="days-head">
              <span class="title">Daily history & forecast</span>
              <div class="days-nav">
                <button data-nav="back" title="Earlier days">◀</button>
                <button data-nav="today" title="Jump to today">●</button>
                <button data-nav="fwd" title="Later days">▶</button>
              </div>
            </div>
            <div class="days">${dayStripHtml}</div>
          </div>

          ${detailHtml}
        </div>

        <div class="col-r">
          ${strategies.map(st => {
            const cls = st.state || "low";
            const tips = (st.attributes.tips || []).map(t => `<li>${t}</li>`).join("");
            const date = st.attributes.date || "";
            const wd = date ? new Date(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) : "";
            return `<div class="strat ${cls}">
              <div class="strat-head">${wd} · ${st.attributes.predicted_kwh || 0} kWh · ${cls.toUpperCase()}</div>
              <ul>${tips}</ul>
            </div>`;
          }).join("")}

          <div class="chart-wrap">${chartSvg}</div>

          <div class="model-info">
            <span>a = ${model ? model.attributes.intercept : "?"}</span>
            <span>b = ${model ? model.attributes.slope : "?"}</span>
            <span>R² = ${model ? model.attributes.r2 : "?"}</span>
            <span>last refit: ${model ? model.attributes.trained_at : "?"}</span>
          </div>
          <div class="footer">solar-forecast-card v${CARD_VERSION}</div>
        </div>
      </div>
    `;

    // ---- post-render: wire up day strip clicks, bar clicks, and nav buttons ----
    this._content.querySelectorAll(".day").forEach((el) => {
      el.addEventListener("click", () => {
        this._selectedDate = el.dataset.date;
        this._render();
      });
    });
    this._content.querySelectorAll("svg.chart .day-hit").forEach((el) => {
      el.addEventListener("click", () => {
        this._selectedDate = el.dataset.date;
        this._render();
      });
    });
    this._content.querySelectorAll(".days-nav button").forEach((btn) => {
      const nav = btn.dataset.nav;
      // Disable boundary buttons
      if (nav === "back" && winStart === 0) btn.disabled = true;
      if (nav === "fwd" && winEnd >= allDays.length) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (nav === "today") { this._windowOffset = 0; this._selectedDate = todayIso; }
        else if (nav === "back") { this._windowOffset -= WIN; }
        else if (nav === "fwd") { this._windowOffset += WIN; }
        this._render();
      });
    });
  }

  _renderDetail(d, todayIso, todayActualState) {
    if (!d) return "";
    const dt = new Date(d.date);
    const longDate = dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const isToday = d.date === todayIso;
    const isPast = d.date < todayIso;
    const tag = isToday ? "Today" : (isPast ? "Past" : "Forecast");

    // Override actual with live today_actual when looking at today
    const actualVal = isToday && todayActualState ? Number(todayActualState.state) : (d.actual != null ? Number(d.actual) : null);

    // Production block
    const predVal = d.predicted != null ? Number(d.predicted) : null;
    let deltaBlock = "";
    if (actualVal != null && predVal != null) {
      const dv = actualVal - predVal;
      const sign = dv >= 0 ? "+" : "";
      const cl = dv >= 0 ? "delta-pos" : "delta-neg";
      const pct = predVal > 0.5 ? ` (${sign}${((dv / predVal) * 100).toFixed(0)}%)` : "";
      deltaBlock = `<div class="blk"><span class="lbl">Delta</span><span class="val ${cl}">${sign}${dv.toFixed(1)} kWh${pct}</span></div>`;
    }
    const prodHtml = `
      <div class="detail-prod">
        ${predVal != null ? `<div class="blk"><span class="lbl">Predicted</span><span class="val pred">${predVal.toFixed(1)} kWh</span></div>` : ""}
        ${actualVal != null ? `<div class="blk"><span class="lbl">Actual${isToday ? " (so far)" : ""}</span><span class="val act">${actualVal.toFixed(1)} kWh</span></div>` : ""}
        ${deltaBlock}
      </div>`;

    // Weather inputs grid — only show fields that exist
    const wx = [];
    if (d.ghi_wh_m2 != null) wx.push({ ic: "☀️", lbl: "Irradiance (GHI)", val: `${Math.round(d.ghi_wh_m2).toLocaleString()} Wh/m²` });
    if (d.sunshine_min != null) {
      const h = Math.floor(d.sunshine_min / 60), m = d.sunshine_min % 60;
      wx.push({ ic: "🌞", lbl: "Sunshine", val: `${h}h ${m}m` });
    }
    if (d.cloud_pct != null) wx.push({ ic: "☁️", lbl: "Cloud cover", val: `${Math.round(d.cloud_pct)}%` });
    if (d.temp_min != null && d.temp_max != null) wx.push({ ic: "🌡️", lbl: "Temperature", val: `${d.temp_min.toFixed(0)}° / ${d.temp_max.toFixed(0)}°C` });
    if (d.precip_mm != null) wx.push({ ic: "💧", lbl: "Precipitation", val: `${Number(d.precip_mm).toFixed(1)} mm` });
    if (d.uv_max != null) wx.push({ ic: "🔆", lbl: "UV index (max)", val: `${Number(d.uv_max).toFixed(1)}` });

    const wxHtml = wx.length
      ? `<div class="wx-grid">${wx.map(w => `
          <div class="wx"><span class="ic">${w.ic}</span><span class="txt"><span class="lbl">${w.lbl}</span><span class="val">${w.val}</span></span></div>
        `).join("")}</div>`
      : `<div style="font-size:.8rem;color:var(--secondary-text-color)">No weather data stored for this day. Run <code>solar_forecast.refit_model</code> to backfill from the archive.</div>`;

    return `
      <div class="detail">
        <div class="detail-head">
          <span class="detail-date">${longDate}</span>
          <span class="detail-tag">${tag}</span>
        </div>
        ${prodHtml}
        ${wxHtml}
      </div>`;
  }
}

customElements.define("solar-forecast-card", SolarForecastCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "solar-forecast-card",
  name: "Solar Forecast Card",
  description: "Animated dashboard for the solar_forecast integration",
});

console.info(`%c SOLAR-FORECAST-CARD %c ${CARD_VERSION} `, "color:#fff;background:#f5a623;font-weight:700", "color:#f5a623;background:#fff");
