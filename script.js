/* ==========================================================================
   Marine Dashboard - Enhanced Script
   Full replacement for script.js
   ========================================================================== */

const DASHBOARD_WIDTH = 1920;
const DASHBOARD_HEIGHT = 1080;

/* storage keys */
const STORAGE_KEY = "marineDashboardLayoutV2";
const NOAA_PROXY = "https://noaa-proxy.lanceburkin.workers.dev";
const SETTINGS_KEY = "marineDashboardWidgetSettingsV2";

/* location defaults */
let userLat = 29.938;
let userLon = -81.302;

/* stations */
const LOCAL_STATIONS = [
  { id: "8720554", name: "Vilano Beach ICWW", state: "FL", lat: 29.938, lon: -81.302 },
  { id: "8720576", name: "St. Augustine", state: "FL", lat: 29.894, lon: -81.313 },
  { id: "8720587", name: "St. Augustine Beach", state: "FL", lat: 29.857, lon: -81.264 },
  { id: "8720582", name: "State Road 312, Matanzas River", state: "FL", lat: 29.876, lon: -81.294 }
];

const DEFAULT_STATION = LOCAL_STATIONS[0];

let selectedStation = DEFAULT_STATION;
let nearbyStations = [...LOCAL_STATIONS];

const WEATHER_HOURS = 12;

const TIDE_WINDOW_HOURS = 24;
const LIVE_LINE_OFFSET_MINUTES = 30;
const LOW_TIDE_ALERT_FT = 0.4;
const WIND_ALERT_MPH = 25;
const HEAT_ALERT_F = 95;

let tidePredictions = [];
let layoutEditMode = false;

let tideViewMode = "live";
let selectedTideDate = null;

let tideScrubTimeMs = null;
let tideDragging = false;

let weatherViewMode = "hourly";

/* widget settings state */
let widgetSettings = {};
let dashboardSettings = {
  backgroundColor: "#07131c",
  backgroundHue: 0
};

init();

/* ==========================================================================
   INIT
   ========================================================================== */
function init() {
  setupDashboardScale();
  setupLayoutEditor();
  setupDateControls();
  setupTideInteraction();
  setupWidgetSettingsSystem();

  updateClockAndDate();
  attachEvents();
  populateStationDropdown();
  initializeDatePicker();

  loadAllSettings();
  applyAllWidgetSettings();

  refreshAll();
  getLocation();

  setInterval(updateClockAndDate, 1000);

  setInterval(() => {
    loadWeather();
    if (tideViewMode === "live") loadTides();
  }, 60000);
}

/* ==========================================================================
   SCALE
   ========================================================================== */
 function setupDashboardScale() {
  const dashboard = document.getElementById("dashboard");

  function applyScale() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const scale = Math.min(vw / DASHBOARD_WIDTH, vh / DASHBOARD_HEIGHT);

    dashboard.style.position = "absolute";
    dashboard.style.left = "0px";
    dashboard.style.top = "0px";
    dashboard.style.transformOrigin = "top left";
    dashboard.style.transform = `scale(${scale})`;
  }

  window.addEventListener("resize", () => {
    applyScale();

    if (tidePredictions.length) {
      drawTide(tidePredictions);
    }
  });

  applyScale();
}

function getDashboardScale() {
  const dashboard = document.getElementById("dashboard");
  if (!dashboard) return 1;

  const style = window.getComputedStyle(dashboard);
  const transform = style.transform;

  if (!transform || transform === "none") return 1;

  const match = transform.match(/matrix\(([^)]+)\)/);
  if (match) {
    const values = match[1].split(",").map(Number);
    return values[0] || 1;
  }

  const match3d = transform.match(/matrix3d\(([^)]+)\)/);
  if (match3d) {
    const values = match3d[1].split(",").map(Number);
    return values[0] || 1;
  }

  return 1;
}

/* ==========================================================================
   LAYOUT EDITOR
   ========================================================================== */
function setupLayoutEditor() {
  const toggle = document.getElementById("layoutToggle");
  const widgets = [...document.querySelectorAll(".widget")];

  loadLayout();

  toggle.addEventListener("click", () => {
    layoutEditMode = !layoutEditMode;

    document.body.classList.toggle("layout-edit", layoutEditMode);
    toggle.classList.toggle("active", layoutEditMode);
    toggle.textContent = layoutEditMode ? "Done Editing" : "Edit Layout";

    /* important: re-apply hidden widgets/settings when switching modes */
    applyAllWidgetSettings();

    if (!layoutEditMode) {
      closeAllSettingsPanels();
      saveLayout();
      saveAllSettings();
    }
  });

  widgets.forEach(makeWidgetInteractive);
}

function makeWidgetInteractive(widget) {
  const handle = widget.querySelector(".widgetHandle");
  const resize = widget.querySelector(".widgetResize");

  if (!handle || !resize) return;

  let dragStart = null;
  let resizeStart = null;

  handle.addEventListener("mousedown", (e) => {
    if (!layoutEditMode) return;
    if (e.target.closest(".widgetSettingsBtn")) return;
    if (e.target.closest(".widgetHideBtn")) return;
    if (e.target.closest(".widgetSettingsPanel")) return;

    e.preventDefault();
    e.stopPropagation();

    dragStart = {
      startX: e.clientX,
      startY: e.clientY,
      left: parseFloat(widget.style.left || widget.offsetLeft),
      top: parseFloat(widget.style.top || widget.offsetTop),
      scale: getDashboardScale()
    };

    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  });

  resize.addEventListener("mousedown", (e) => {
    if (!layoutEditMode) return;

    e.preventDefault();
    e.stopPropagation();

    resizeStart = {
  startX: e.clientX,
  startY: e.clientY,
  width: widget.offsetWidth,
  height: widget.offsetHeight,
  scale: getDashboardScale()
};

    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  });

  function onDragMove(e) {
    if (!dragStart) return;

    const dx = (e.clientX - dragStart.startX) / dragStart.scale;
    const dy = (e.clientY - dragStart.startY) / dragStart.scale;

    const left = clamp(dragStart.left + dx, 0, DASHBOARD_WIDTH - widget.offsetWidth);
    const top = clamp(dragStart.top + dy, 0, DASHBOARD_HEIGHT - widget.offsetHeight);

    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;
  }

  function onDragEnd() {
    dragStart = null;
    saveLayout();

    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  function onResizeMove(e) {
    if (!resizeStart) return;

    const dx = (e.clientX - resizeStart.startX) / resizeStart.scale;
    const dy = (e.clientY - resizeStart.startY) / resizeStart.scale;

    widget.style.width = `${Math.max(120, resizeStart.width + dx)}px`;
    widget.style.height = `${Math.max(40, resizeStart.height + dy)}px`;

    if (widget.dataset.widget === "tideChart" && tidePredictions.length) {
      drawTide(tidePredictions);
    }
  }

  function onResizeEnd() {
    resizeStart = null;
    saveLayout();

    if (widget.dataset.widget === "tideChart" && tidePredictions.length) {
      drawTide(tidePredictions);
    }

    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }
}

/* ==========================================================================
   SAVE / LOAD LAYOUT
   ========================================================================== */
function saveLayout() {
  const layout = {};

  document.querySelectorAll(".widget").forEach(widget => {
    layout[widget.dataset.widget] = {
      left: widget.style.left || `${widget.offsetLeft}px`,
      top: widget.style.top || `${widget.offsetTop}px`,
      width: widget.style.width || `${widget.offsetWidth}px`,
      height: widget.style.height || `${widget.offsetHeight}px`
    };
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

function loadLayout() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const layout = JSON.parse(raw);

    Object.entries(layout).forEach(([key, value]) => {
      const widget = document.querySelector(`.widget[data-widget="${key}"]`);
      if (!widget) return;

      if (value.left) widget.style.left = value.left;
      if (value.top) widget.style.top = value.top;
      if (value.width) widget.style.width = value.width;
      if (value.height) widget.style.height = value.height;
    });
  } catch (err) {
    console.error(err);
  }
}

/* ==========================================================================
   SETTINGS SYSTEM
   ========================================================================== */
function setupWidgetSettingsSystem() {
  const widgets = [...document.querySelectorAll(".widget")];

  widgets.forEach(widget => {
    const key = widget.dataset.widget;

    /* open settings */
    const settingsBtn = widget.querySelector(".widgetSettingsBtn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!layoutEditMode) return;

        const isOpen = widget.classList.contains("show-settings");
        closeAllSettingsPanels();

        if (!isOpen) widget.classList.add("show-settings");
      });
    }

    /* close settings */
    const closeBtn = widget.querySelector(".closeSettingsBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        widget.classList.remove("show-settings");
      });
    }

    /* hide widget */
    const hideBtn = widget.querySelector(".widgetHideBtn");
    if (hideBtn) {
      hideBtn.addEventListener("click", () => {
        const state = getWidgetSettings(key);
        state.hidden = !state.hidden;

        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    }

    /* theme selects */
    widget.querySelectorAll(".themeSelect").forEach(el => {
      el.addEventListener("change", () => {
        const state = getWidgetSettings(key);
        state.theme = el.value;
        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    });

    /* bg color */
    widget.querySelectorAll(".widgetBgColorInput").forEach(el => {
      el.addEventListener("input", () => {
        const state = getWidgetSettings(key);
        state.backgroundColor = el.value;
        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    });

    /* font selects */
    widget.querySelectorAll(".fontSelect").forEach(el => {
      el.addEventListener("change", () => {
        const state = getWidgetSettings(key);
        state[el.dataset.target] = el.value;
        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    });

    /* font colors */
    widget.querySelectorAll(".fontColorInput").forEach(el => {
      el.addEventListener("input", () => {
        const state = getWidgetSettings(key);
        state[el.dataset.target] = el.value;
        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    });

    /* alert colors */
    widget.querySelectorAll(".alertColorInput").forEach(el => {
      el.addEventListener("input", () => {
        const state = getWidgetSettings(key);
        state[el.dataset.target] = el.value;
        applyWidgetSettings(widget, state);
        saveAllSettings();
      });
    });

    /* title text edits */
    const heroTitleInput = widget.querySelector("#heroTitleInput");
    if (heroTitleInput) {
      heroTitleInput.addEventListener("input", () => {
        document.getElementById("heroTitleText").textContent = heroTitleInput.value;
      });
    }

    const heroSubtitleInput = widget.querySelector("#heroSubtitleInput");
    if (heroSubtitleInput) {
      heroSubtitleInput.addEventListener("input", () => {
        document.getElementById("heroSubtitleText").textContent = heroSubtitleInput.value;
      });
    }

    /* reset */
    widget.querySelectorAll(".resetWidgetBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        widgetSettings[key] = {};
        applyWidgetSettings(widget, getWidgetSettings(key));
        syncControlsFromState(widget, getWidgetSettings(key));
        saveAllSettings();
      });
    });
  });

  /* dashboard settings */
  const bgColor = document.getElementById("dashboardBackgroundColor");
  const bgHue = document.getElementById("dashboardBackgroundHue");
  const bgReset = document.getElementById("dashboardResetBtn");

  if (bgColor) {
    bgColor.addEventListener("input", () => {
      dashboardSettings.backgroundColor = bgColor.value;
      applyDashboardSettings();
      saveAllSettings();
    });
  }

  if (bgHue) {
    bgHue.addEventListener("input", () => {
      dashboardSettings.backgroundHue = Number(bgHue.value);
      applyDashboardSettings();
      saveAllSettings();
    });
  }

  if (bgReset) {
    bgReset.addEventListener("click", () => {
      dashboardSettings = {
        backgroundColor: "#07131c",
        backgroundHue: 0
      };

      applyDashboardSettings();

      if (bgColor) bgColor.value = dashboardSettings.backgroundColor;
      if (bgHue) bgHue.value = dashboardSettings.backgroundHue;

      saveAllSettings();
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".widgetSettingsPanel") &&
        !e.target.closest(".widgetSettingsBtn")) {
      closeAllSettingsPanels();
    }
  });
}

function closeAllSettingsPanels() {
  document.querySelectorAll(".widget").forEach(w => {
    w.classList.remove("show-settings");
  });
}

function getWidgetSettings(key) {
  if (!widgetSettings[key]) widgetSettings[key] = {};
  return widgetSettings[key];
}

function applyAllWidgetSettings() {
  document.querySelectorAll(".widget").forEach(widget => {
    const key = widget.dataset.widget;
    applyWidgetSettings(widget, getWidgetSettings(key));
    syncControlsFromState(widget, getWidgetSettings(key));
  });

  applyDashboardSettings();
}

function applyWidgetSettings(widget, state) {
  const hideBtn = widget.querySelector(".widgetHideBtn");

  /* hidden widgets should still appear while editing */
  widget.classList.toggle("hidden-widget", !!state.hidden && !layoutEditMode);

  if (hideBtn) {
    hideBtn.classList.toggle("is-hidden", !!state.hidden);
  }

  widget.classList.remove(
    "theme-default",
    "theme-clean",
    "theme-glass",
    "theme-ocean",
    "theme-sunset",
    "theme-dynamic"
  );

  widget.classList.add(`theme-${state.theme || "default"}`);

  if (state.backgroundColor) {
    widget.style.setProperty("--widget-local-bg", state.backgroundColor);
  } else {
    widget.style.removeProperty("--widget-local-bg");
  }

  setIf(state.row1Font, "--row1-font", widget);
  setIf(state.row2Font, "--row2-font", widget);

  setIf(state.row1Color, "--row1-color", widget);
  setIf(state.row2Color, "--row2-color", widget);

  setIf(state.row1AlertColor, "--row1-alert-color", widget);
  setIf(state.row2AlertColor, "--row2-alert-color", widget);
}

function setIf(value, prop, el) {
  if (value) el.style.setProperty(prop, value);
  else el.style.removeProperty(prop);
}

function syncControlsFromState(widget, state) {
  widget.querySelectorAll(".themeSelect").forEach(el => {
    el.value = state.theme || "default";
  });

  widget.querySelectorAll(".widgetBgColorInput").forEach(el => {
    el.value = state.backgroundColor || "#0a1924";
  });

  widget.querySelectorAll(".fontSelect").forEach(el => {
    el.value = state[el.dataset.target] || "Segoe UI";
  });

  widget.querySelectorAll(".fontColorInput").forEach(el => {
    el.value = state[el.dataset.target] || "#eef7ff";
  });

  widget.querySelectorAll(".alertColorInput").forEach(el => {
    el.value = state[el.dataset.target] || "#ff7c7c";
  });
}

function applyDashboardSettings() {
  const color = dashboardSettings.backgroundColor || "#07131c";
  const hue = dashboardSettings.backgroundHue || 0;

  const shifted = shiftHue(color, hue);
  const darker1 = shadeColor(shifted, -18);
  const darker2 = shadeColor(shifted, -34);

  document.documentElement.style.setProperty("--dashboard-bg-1", shifted);
  document.documentElement.style.setProperty("--dashboard-bg-2", darker1);
  document.documentElement.style.setProperty("--dashboard-bg-3", darker2);

  document.body.style.background = `
    radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 35%),
    linear-gradient(to bottom, ${shifted} 0%, ${darker1} 45%, ${darker2} 100%)
  `;
}

function saveAllSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      widgetSettings,
      dashboardSettings,
      heroTitle: document.getElementById("heroTitleText")?.textContent || "",
      heroSubtitle: document.getElementById("heroSubtitleText")?.textContent || ""
    })
  );
}

function loadAllSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);

    widgetSettings = parsed.widgetSettings || {};
    dashboardSettings = parsed.dashboardSettings || dashboardSettings;

    if (parsed.heroTitle) {
      const el = document.getElementById("heroTitleText");
      if (el) el.textContent = parsed.heroTitle;
    }

    if (parsed.heroSubtitle) {
      const el = document.getElementById("heroSubtitleText");
      if (el) el.textContent = parsed.heroSubtitle;
    }
  } catch (e) {
    console.error(e);
  }
}

/* ==========================================================================
   DATE CONTROLS
   ========================================================================== */
function setupDateControls() {
  const viewBtn = document.getElementById("viewDateBtn");
  const liveBtn = document.getElementById("liveViewBtn");

  if (viewBtn) {
    viewBtn.addEventListener("click", async () => {
      const value = document.getElementById("tideDateSelect").value;
      if (!value) return;

      tideViewMode = "date";
      selectedTideDate = value;
      tideScrubTimeMs = null;

      await loadTides();
    });
  }

  if (liveBtn) {
    liveBtn.addEventListener("click", async () => {
      tideViewMode = "live";
      selectedTideDate = null;
      tideScrubTimeMs = null;

      await loadTides();
    });
  }
}

function initializeDatePicker() {
  const dateInput = document.getElementById("tideDateSelect");
  if (!dateInput) return;

  const today = new Date();
  const oneYear = new Date();
  oneYear.setFullYear(today.getFullYear() + 1);

  dateInput.min = formatDateInput(today);
  dateInput.max = formatDateInput(oneYear);
  dateInput.value = formatDateInput(today);
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/* ==========================================================================
   EVENTS
   ========================================================================== */
function attachEvents() {
  const select = document.getElementById("stationSelect");

  if (select) {
    select.addEventListener("change", async (e) => {
      const stationId = e.target.value;
      const match = nearbyStations.find(s => s.id === stationId);

      if (!match) return;

      selectedStation = match;
      tideScrubTimeMs = null;

      await refreshAll();
    });
  }

  const forecastWidget = document.getElementById("forecastWidget");

  if (forecastWidget) {
    forecastWidget.addEventListener("click", async (e) => {
      if (layoutEditMode) return;
      if (e.target.closest(".widgetControls")) return;
      if (e.target.closest(".widgetSettingsPanel")) return;

      weatherViewMode = weatherViewMode === "hourly" ? "weekly" : "hourly";
      await loadWeather();
    });
  }
}

/* ==========================================================================
   CLOCK
   ========================================================================== */
function updateClockAndDate() {
  const now = new Date();

  const clock = document.getElementById("clock");
  const date = document.getElementById("date");

  if (clock) {
    clock.textContent = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  if (date) {
    date.textContent = now.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }
}

/* ==========================================================================
   LOCATION
   ========================================================================== */
function getLocation() {
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;

      nearbyStations = [...LOCAL_STATIONS]
        .map(station => ({
          ...station,
          distance: haversineMiles(userLat, userLon, station.lat, station.lon)
        }))
        .sort((a, b) => a.distance - b.distance);

      populateStationDropdown();

      const existing = nearbyStations.find(s => s.id === selectedStation.id);
      selectedStation = existing || nearbyStations[0];

      const select = document.getElementById("stationSelect");
      if (select) select.value = selectedStation.id;

      await refreshAll();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function populateStationDropdown() {
  const select = document.getElementById("stationSelect");
  if (!select) return;

  select.innerHTML = "";

  nearbyStations.forEach((station) => {
    const opt = document.createElement("option");

    opt.value = station.id;
    opt.textContent =
      typeof station.distance === "number"
        ? `${station.name}, ${station.state} • ${station.distance.toFixed(1)} mi`
        : `${station.name}, ${station.state}`;

    select.appendChild(opt);
  });

  select.value = selectedStation.id;
}

/* ==========================================================================
   WEATHER
   ========================================================================== */
async function loadWeather() {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${userLat}&longitude=${userLon}` +
      `&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,windspeed_10m,winddirection_10m,weathercode` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto`;

    const res = await fetch(url);
    const data = await res.json();

    renderWeather(data);
    renderCurrentConditions(data);
  } catch (err) {
    console.error(err);
  }
}

function renderCurrentConditions(data) {
  const nowHour = new Date().getHours();
  const idx = data.hourly.time.findIndex(t => new Date(t).getHours() === nowHour);

  const i = idx >= 0 ? idx : 0;

  const temp = Math.round(data.hourly.temperature_2m[i]);
  const humidity = Math.round(data.hourly.relative_humidity_2m[i]);
  const wind = Math.round(data.hourly.windspeed_10m[i]);
  const deg = Math.round(data.hourly.winddirection_10m[i]);

  const tempMain = document.getElementById("tempMain");
  const tempSub = document.getElementById("tempSub");

  if (tempMain) tempMain.textContent = `${temp}°`;
  if (tempSub) tempSub.textContent = `${humidity}% Humidity`;

  const windSpeed = document.getElementById("windSpeed");
  const windDeg = document.getElementById("windDeg");
  const arrow = document.getElementById("windArrow");

  if (windSpeed) windSpeed.textContent = `${wind} mph`;
  if (windDeg) windDeg.textContent = `${degToCompass(deg)} ${deg}°`;
  if (arrow) arrow.style.transform = `translateX(-50%) rotate(${deg}deg)`;
}

function renderWeather(data) {
  const wrap = document.getElementById("forecast");
  if (!wrap) return;

  wrap.innerHTML = "";

  if (weatherViewMode === "weekly") {
    for (let i = 0; i < 7; i++) {
      const card = document.createElement("div");
      card.className = "card weekly";

      const code = data.daily.weathercode[i];
      card.classList.add(getWeatherClass(code, false));

      card.innerHTML = `
        <div class="hour">${formatWeekday(data.daily.time[i])}</div>
        <div class="tempF">${Math.round(data.daily.temperature_2m_max[i])}°</div>
        <div class="tempC">Low ${Math.round(data.daily.temperature_2m_min[i])}°</div>
        <div class="rain">${Math.round(data.daily.precipitation_probability_max[i])}% Rain</div>
        <div class="windMini">${Math.round(data.daily.windspeed_10m_max[i])} mph</div>
      `;

      wrap.appendChild(card);
    }

    return;
  }

  const currentHour = new Date().getHours();

let startIndex = data.hourly.time.findIndex(t => {
  return new Date(t).getHours() === currentHour;
});

if (startIndex < 0) startIndex = 0;

for (let n = 0; n < WEATHER_HOURS; n++) {
  const i = startIndex + n;
  if (i >= data.hourly.time.length) break;
    const code = data.hourly.weathercode[i];
    const hourText = formatHour(data.hourly.time[i]);

    const rain = Math.round(data.hourly.precipitation_probability[i]);
    const wind = Math.round(data.hourly.windspeed_10m[i]);
    const temp = Math.round(data.hourly.temperature_2m[i]);
    const humid = Math.round(data.hourly.relative_humidity_2m[i]);

    const danger =
      rain > 70 || wind >= WIND_ALERT_MPH || temp >= HEAT_ALERT_F;

    const card = document.createElement("div");
    card.className = "card";
    card.classList.add(getWeatherClass(code, isNightHour(data.hourly.time[i])));

    card.innerHTML = `
      <div class="hour">${hourText}</div>
      <div class="tempF ${danger ? "danger" : ""}">${temp}°</div>
      <div class="humidity">${humid}% Humidity</div>
      <div class="rain">${rain}% Rain</div>
      <div class="windMini">${wind} mph</div>
      <div class="dirMini">${weatherText(code)}</div>
      ${danger ? `<div class="boxAlert">Alert</div>` : ""}
    `;

    wrap.appendChild(card);
  }
}

function getWeatherClass(code, night) {
  if (night) return "weather-night";

  if ([95, 96, 99].includes(code)) return "weather-stormy";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "weather-rainy";
  if ([1, 2].includes(code)) return "weather-partly";
  if ([3, 45, 48].includes(code)) return "weather-cloudy";

  return "weather-sunny";
}

function weatherText(code) {
  if ([95, 96, 99].includes(code)) return "Storm";
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return "Rain";
  if ([3,45,48].includes(code)) return "Cloudy";
  if ([1,2].includes(code)) return "Partly";
  return "Clear";
}

function isNightHour(iso) {
  const h = new Date(iso).getHours();
  return h < 6 || h > 19;
}

/* ==========================================================================
   TIDES
   ========================================================================== */
async function loadTides() {
  if (!selectedStation) return;

  try {
    let queryParams;

    if (tideViewMode === "live") {
      const now = new Date();
      const start = new Date(now.getTime() - LIVE_LINE_OFFSET_MINUTES * 60 * 1000);

      queryParams =
        `?product=predictions` +
        `&application=marine_dashboard` +
        `&begin_date=${encodeURIComponent(formatNoaaDate(start))}` +
        `&range=${TIDE_WINDOW_HOURS}` +
        `&station=${selectedStation.id}` +
        `&datum=MLLW` +
        `&time_zone=lst_ldt` +
        `&interval=6` +
        `&units=english` +
        `&format=json`;
    } else {
      const start = new Date(`${selectedTideDate}T00:00:00`);

      queryParams =
        `?product=predictions` +
        `&application=marine_dashboard` +
        `&begin_date=${encodeURIComponent(formatNoaaDate(start))}` +
        `&range=24` +
        `&station=${selectedStation.id}` +
        `&datum=MLLW` +
        `&time_zone=lst_ldt` +
        `&interval=6` +
        `&units=english` +
        `&format=json`;
    }

    const url = `${NOAA_PROXY}${queryParams}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tide request failed: ${res.status}`);

    const data = await res.json();
    if (!data.predictions || !data.predictions.length) return;

    tidePredictions = data.predictions.map((p) => ({
      time: p.t,
      timeMs: new Date(p.t.replace(" ", "T")).getTime(),
      value: parseFloat(p.v)
    }));

    drawTide(tidePredictions);
  } catch (err) {
    console.error("Tide error:", err);
  }
}

function updateTideStatus() {
  const current = document.getElementById("currentTide");
  const alert = document.getElementById("lowTideAlert");

  if (!current || !alert || !tidePredictions.length) return;

  const now = Date.now();
  const nearest = tidePredictions.reduce((a, b) =>
    Math.abs(a.timeMs - now) < Math.abs(b.timeMs - now) ? a : b
  );

  current.textContent =
    `${nearest.type === "H" ? "High" : "Low"} Tide ${nearest.value.toFixed(1)} ft at ${formatHour(nearest.time)}`;

  if (nearest.type === "L" && nearest.value <= LOW_TIDE_ALERT_FT) {
    alert.textContent = "LOW WATER ALERT";
  } else {
    alert.textContent = "";
  }
}

function drawTide(series) {
  const c = document.getElementById("tideChart");
  const line = document.getElementById("tideLine");
  const currentTideEl = document.getElementById("currentTide");
  const lowTideAlertEl = document.getElementById("lowTideAlert");
  const readoutEl = ensureTideReadout();

  if (!c || !series.length) return;

  const ctx = c.getContext("2d");
  c.width = c.offsetWidth;
  c.height = c.offsetHeight;
  ctx.clearRect(0, 0, c.width, c.height);

  const metrics = getTideChartMetrics(c);
  const {
    startMs,
    endMs,
    leftPad,
    rightPad,
    topPad,
    bottomPad,
    chartW,
    chartH
  } = metrics;

  const defaultLineTimeMs = getDefaultTideLineTime();
  const activeLineTimeMs = tideScrubTimeMs ?? defaultLineTimeMs;

  const defaultTideValue = getTideAtTime(series, defaultLineTimeMs);
  const activeTideValue = getTideAtTime(series, activeLineTimeMs);

  const values = [...series.map(d => d.value)];
  if (defaultTideValue != null) values.push(defaultTideValue);
  if (activeTideValue != null) values.push(activeTideValue);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = Math.max(0.1, rawMax - rawMin);

  const paddedMin = rawMin - rawRange * 0.12;
  const paddedMax = rawMax + rawRange * 0.12;
  const range = Math.max(0.1, paddedMax - paddedMin);

  const xForTime = (timeMs) => {
    const pct = (timeMs - startMs) / (endMs - startMs);
    return leftPad + clamp(pct, 0, 1) * chartW;
  };

  const yForValue = (v) => {
    return topPad + chartH - ((v - paddedMin) / range) * chartH;
  };

  const activeX = xForTime(activeLineTimeMs);
  const activeY = activeTideValue != null ? yForValue(activeTideValue) : topPad + chartH / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = topPad + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(c.width - rightPad, y);
    ctx.stroke();
  }

  ctx.beginPath();
  series.forEach((point, i) => {
    const x = xForTime(point.timeMs);
    const y = yForValue(point.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#7be8ff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  let lastLabeledHour = null;

  for (const point of series) {
    const dt = new Date(point.timeMs);
    const hourKey = `${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}`;

    if (dt.getMinutes() === 0 && hourKey !== lastLabeledHour) {
      lastLabeledHour = hourKey;
      const x = xForTime(point.timeMs);
      const y = yForValue(point.value);

      ctx.fillStyle = "white";
      ctx.fillText(
        dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }),
        x - 18,
        c.height - 16
      );

      ctx.fillStyle = "#bfefff";
      ctx.fillText(`${point.value.toFixed(1)}ft`, x - 18, y - 10);
    }
  }

  /* dedupe slack points so only one label shows per cycle */
  const rawSlackPoints = findSlackPoints(series);
  const slackPoints = [];
  const minTimeGapMs = 90 * 60 * 1000; // 90 minutes

  for (const point of rawSlackPoints) {
    const prev = slackPoints[slackPoints.length - 1];

    if (
      !prev ||
      prev.kind !== point.kind ||
      Math.abs(point.timeMs - prev.timeMs) > minTimeGapMs
    ) {
      slackPoints.push(point);
    } else {
      if (point.kind === "high" && point.value > prev.value) {
        slackPoints[slackPoints.length - 1] = point;
      }
      if (point.kind === "low" && point.value < prev.value) {
        slackPoints[slackPoints.length - 1] = point;
      }
    }
  }

  ctx.textAlign = "center";

  slackPoints.forEach(point => {
    const x = xForTime(point.timeMs);
    const y = yForValue(point.value);

    ctx.strokeStyle = "#ff6a6a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.stroke();

    ctx.fillStyle = "#ff9a9a";
    ctx.font = "bold 13px Arial";
    ctx.fillText(
      point.kind === "high" ? "High Slack" : "Low Slack",
      x,
      y - 24
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.fillText(
      new Date(point.timeMs).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }),
      x,
      y + 18
    );
  });

  if (activeTideValue != null) {
    ctx.beginPath();
    ctx.arc(activeX, activeY, 5, 0, Math.PI * 2);
    ctx.fillStyle = tideDragging ? "#ffd166" : "#ff6f61";
    ctx.fill();
  }

  if (line) {
    line.style.display = "block";
    line.style.left = `${activeX}px`;
  }

  if (readoutEl) {
    if (tideDragging && activeTideValue != null) {
      readoutEl.style.display = "block";
      readoutEl.style.left = `${activeX}px`;
      readoutEl.textContent = formatTideReadout(activeLineTimeMs, activeTideValue);
    } else {
      readoutEl.style.display = "none";
    }
  }

  if (activeTideValue != null) {
    if (tideDragging) {
      currentTideEl.innerText =
        `Selected tide at ${selectedStation.name}: ${formatTideReadout(activeLineTimeMs, activeTideValue)}`;
    } else if (tideViewMode === "live") {
      currentTideEl.innerText =
        `Tide now at ${selectedStation.name}: ${activeTideValue > 0 ? "+" : ""}${activeTideValue.toFixed(2)} ft`;
    } else {
      currentTideEl.innerText =
        `Tide forecast for ${selectedTideDate} at ${selectedStation.name}: ${formatTideReadout(activeLineTimeMs, activeTideValue)}`;
    }

    currentTideEl.style.color = activeTideValue <= LOW_TIDE_ALERT_FT ? "#ff6a6a" : "#dff6ff";
    lowTideAlertEl.textContent = activeTideValue <= LOW_TIDE_ALERT_FT ? "ALERT: LOW TIDE" : "";
  } else {
    currentTideEl.innerText = "";
    currentTideEl.style.color = "#dff6ff";
    lowTideAlertEl.textContent = "";
    if (readoutEl) readoutEl.style.display = "none";
  }
}
function setupTideInteraction() {
  const canvas = document.getElementById("tideChart");
  if (!canvas) return;

  const updateScrubFromMouse = (clientX) => {
    if (!tidePredictions.length) return;

    const metrics = getTideChartMetrics(canvas);
    const rect = canvas.getBoundingClientRect();

    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const rawX = (clientX - rect.left) * scaleX;
    const clampedX = clamp(rawX, metrics.leftPad, canvas.width - metrics.rightPad);
    const pct = (clampedX - metrics.leftPad) / metrics.chartW;

    tideScrubTimeMs = metrics.startMs + pct * (metrics.endMs - metrics.startMs);
    drawTide(tidePredictions);
  };

  canvas.addEventListener("mousedown", (e) => {
    if (layoutEditMode || e.button !== 0 || !tidePredictions.length) return;

    tideDragging = true;
    updateScrubFromMouse(e.clientX);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  function onMove(e) {
    if (!tideDragging) return;
    updateScrubFromMouse(e.clientX);
  }

  function onUp() {
    tideDragging = false;
    tideScrubTimeMs = null;
    drawTide(tidePredictions);

    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
}
/* ==========================================================================
   HELPERS
   ========================================================================== */
function ensureTideReadout() {
  const panel = document.querySelector("#tideChartWidget .tidePanel");
  if (!panel) return null;

  let el = document.getElementById("tideReadout");
  if (!el) {
    el = document.createElement("div");
    el.id = "tideReadout";
    panel.appendChild(el);
  }
  return el;
}

function getTideChartMetrics(canvas) {
  const leftPad = 36;
  const rightPad = 20;
  const topPad = 28;
  const bottomPad = 34;
  const chartW = canvas.width - leftPad - rightPad;
  const chartH = canvas.height - topPad - bottomPad;

  return {
    startMs: tidePredictions[0]?.timeMs ?? Date.now(),
    endMs: tidePredictions[tidePredictions.length - 1]?.timeMs ?? Date.now() + 1,
    leftPad,
    rightPad,
    topPad,
    bottomPad,
    chartW,
    chartH
  };
}

function getDefaultTideLineTime() {
  if (tideViewMode === "live") {
    return Date.now();
  }

  if (tidePredictions.length) {
    return tidePredictions[0].timeMs;
  }

  return Date.now();
}

function formatTideReadout(timeMs, value) {
  return `${new Date(timeMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })} • ${value > 0 ? "+" : ""}${value.toFixed(2)} ft`;
}

function findSlackPoints(series) {
  const points = [];

  for (let i = 1; i < series.length - 1; i++) {
    const prev = series[i - 1].value;
    const curr = series[i].value;
    const next = series[i + 1].value;

    const isHigh = curr >= prev && curr >= next && (curr > prev || curr > next);
    const isLow = curr <= prev && curr <= next && (curr < prev || curr < next);

    if (isHigh) {
      points.push({ ...series[i], kind: "high" });
    } else if (isLow) {
      points.push({ ...series[i], kind: "low" });
    }
  }

  return points;
}

function getTideAtTime(series, targetMs) {
  if (!series.length) return null;
  if (series.length === 1) return series[0].value;

  if (targetMs <= series[0].timeMs) return series[0].value;
  if (targetMs >= series[series.length - 1].timeMs) return series[series.length - 1].value;

  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i];
    const b = series[i + 1];

    if (targetMs >= a.timeMs && targetMs <= b.timeMs) {
      const span = b.timeMs - a.timeMs;
      const pct = span === 0 ? 0 : (targetMs - a.timeMs) / span;
      return a.value + (b.value - a.value) * pct;
    }
  }

  return null;
}

async function refreshAll() {
  await Promise.allSettled([loadWeather(), loadTides()]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function degToCompass(deg) {
  const dirs = [
    "N","NNE","NE","ENE",
    "E","ESE","SE","SSE",
    "S","SSW","SW","WSW",
    "W","WNW","NW","NNW"
  ];

  return dirs[Math.round(deg / 22.5) % 16];
}

function formatNoaaDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");

  return `${y}${m}${d} ${hh}:${mm}`;
}

function formatHour(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    hour12: true
  });
}

function formatWeekday(iso) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "short"
  });
}

function shadeColor(hex, amt) {
  const col = hex.replace("#", "");
  let num = parseInt(col, 16);

  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00FF) + amt;
  let b = (num & 0x0000FF) + amt;

  r = clamp(r, 0, 255);
  g = clamp(g, 0, 255);
  b = clamp(b, 0, 255);

  return "#" + (
    (1 << 24) +
    (r << 16) +
    (g << 8) +
    b
  ).toString(16).slice(1);
}

function shiftHue(hex, degree) {
  const c = hexToRgb(hex);
  const hsl = rgbToHsl(c.r, c.g, c.b);

  hsl.h = (hsl.h + degree) % 360;

  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);

  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);

  return {
    r: (v >> 16) & 255,
    g: (v >> 8) & 255,
    b: v & 255
  };
}

function rgbToHex(r, g, b) {
  return "#" + [r,g,b].map(v =>
    v.toString(16).padStart(2, "0")
  ).join("");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r,g,b);
  const min = Math.min(r,g,b);

  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;

    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch(max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }

    h *= 60;
  }

  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q-p)*(2/3 - t)*6;
      return p;
    };

    const q = l < .5 ? l * (1+s) : l + s - l*s;
    const p = 2*l - q;

    r = hue2rgb(p,q,h + 1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}