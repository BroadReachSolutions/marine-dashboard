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

const DEFAULT_LAYOUT = {"layout":{"left":"384.808px","top":"115.985px","width":"128px","height":"40px"},"stations":{"left":"6.31489px","top":"-8.67933px","width":"536px","height":"155px"},"logo":{"left":"698.706px","top":"11.5911px","width":"120px","height":"45.1404px"},"heroText":{"left":"562.555px","top":"12.9564px","width":"120px","height":"40px"},"clock":{"left":"8.96061px","top":"220.614px","width":"351px","height":"148px"},"temp":{"left":"781.268px","top":"124.438px","width":"340px","height":"130px"},"wind":{"left":"1284.36px","top":"10.6411px","width":"614px","height":"333px"},"tideStatus":{"left":"317.877px","top":"282.466px","width":"1231.23px","height":"88px"},"forecast":{"left":"8.8933px","top":"347.661px","width":"1896.39px","height":"262.928px"},"divider":{"left":"823.756px","top":"13.4772px","width":"120px","height":"43px"},"tideChart":{"left":"2.3574px","top":"594.809px","width":"1906px","height":"348px"}};

const DEFAULT_SETTINGS = {"widgetSettings":{"layout":{},"stations":{"theme":"clean"},"logo":{"hidden":true},"heroText":{"hidden":true},"clock":{"theme":"clean"},"temp":{"theme":"clean"},"wind":{"theme":"clean","row2Font":"Georgia","row1Font":"Georgia"},"tideStatus":{"theme":"clean"},"forecast":{"theme":"clean","row2Font":"Segoe UI"},"divider":{"hidden":true,"theme":"clean"},"tideChart":{"theme":"clean"}},"dashboardSettings":{"backgroundColor":"#07131c","backgroundHue":0},"heroTitle":"f","heroSubtitle":"f"};


/* location defaults */
let userLat = 29.938;
let userLon = -81.302;

/* marine location for satellite compass */
let marineLocationLat = null;
let marineLocationLon = null;
let compassZoom = 15;
let compassMapMode = "compass";
let compassSize = 190;
let compassStyle = "ring";
let cardinalOffset = 20;
let showWindMph = true;
let showWindKph = false;
let showWindKnots = false;
let showWindDir = true;
let lastWindMph = 0;
let lastWindDeg = 0;
let windTopOffset = 0;
let windBotOffset = 0;

/* NOAA full station list cache */
let allNoaaStations = null;

/* stations — fallback used only if NOAA station API fails */
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
async function init() {
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

  attachCompassSettingsEvents();
  makeSettingsPanelsDraggable();
  refreshAll();

  await loadMarineLocation();
  if (!marineLocationLat || !marineLocationLon) {
    getLocation();
  }

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
  const stage = document.getElementById("dashboardStage");
  const dashboard = document.getElementById("dashboard");

  function applyScale() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const scale = vw / DASHBOARD_WIDTH;

    const scaledW = DASHBOARD_WIDTH * scale;
    const scaledH = DASHBOARD_HEIGHT * scale;

    const offsetX = (vw - scaledW) / 2;
    const offsetY = (vh - scaledH) / 2;

    stage.style.width = "100vw";
    stage.style.height = "100vh";
    stage.style.left = "0px";
    stage.style.top = "0px";
    stage.style.overflow = "visible";

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

    const left = dragStart.left + dx;
    const top = dragStart.top + dy;

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
  const layout = raw ? JSON.parse(raw) : DEFAULT_LAYOUT;

  try {
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
    const settingsPanel = widget.querySelector(".widgetSettingsPanel");
    const closeBtn = settingsPanel
      ? settingsPanel.querySelector(".closeSettingsBtn")
      : widget.querySelector(".closeSettingsBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        widget.classList.remove("show-settings");
        if (settingsPanel) {
          settingsPanel.style.display = "";
          settingsPanel.classList.remove("is-detached");
          /* move back into widget if it was detached to body */
          if (settingsPanel.parentElement === document.body) {
            widget.appendChild(settingsPanel);
          }
        }
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
  const parsed = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;

  try {
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
  } catch (err) {
    console.error(err);
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


const marineBtn = document.getElementById("marineAddressBtn");
  if (marineBtn) {
    marineBtn.addEventListener("click", () => {
      const input = document.getElementById("marineAddressInput");
      if (input && input.value.trim()) {
        geocodeMarineAddress(input.value.trim());
      }
    });
    const input = document.getElementById("marineAddressInput");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          geocodeMarineAddress(input.value.trim());
        }
      });
    }
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

      /* marina address takes priority over GPS */
      if (marineLocationLat && marineLocationLon) return;

      const select = document.getElementById("stationSelect");
      if (select) select.innerHTML = "<option>Finding nearby stations...</option>";

      if (!allNoaaStations) {
        allNoaaStations = await fetchAllNoaaStations();
      }

      await updateNearbyStations(userLat, userLon);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

async function updateNearbyStations(lat, lon) {
  const stations = allNoaaStations || LOCAL_STATIONS;

  nearbyStations = stations
    .map(s => ({
      ...s,
      distance: haversineMiles(lat, lon, s.lat, s.lon)
    }))
    .filter(s => !isNaN(s.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (nearbyStations.length === 0) nearbyStations = [...LOCAL_STATIONS];

  populateStationDropdown();

  const existing = nearbyStations.find(s => s.id === selectedStation.id);
  selectedStation = existing || nearbyStations[0];

  const select = document.getElementById("stationSelect");
  if (select) select.value = selectedStation.id;

  await refreshAll();
}

async function fetchAllNoaaStations() {
  /* check localStorage cache first — valid for 24 hours */
  const cached = localStorage.getItem("noaaStationsCache");
  const cachedTime = localStorage.getItem("noaaStationsCacheTime");

  if (cached && cachedTime) {
    const age = Date.now() - parseInt(cachedTime);
    if (age < 86400000) { /* 24 hours */
      try {
        return JSON.parse(cached);
      } catch(e) {}
    }
  }

  try {
    const res = await fetch(`${NOAA_PROXY}/stations`);
    if (!res.ok) throw new Error("Station list fetch failed");

    const data = await res.json();

    /* NOAA returns stations in data.stations array
       filter to only tide prediction stations (type "R" = water level) */
    const stations = (data.stations || [])
      .filter(s =>
        s.lat != null &&
        s.lng != null
      )
      .map(s => ({
        id: s.id,
        name: s.name,
        state: s.state || "",
        lat: parseFloat(s.lat),
        lon: parseFloat(s.lng)
      }));

    /* cache to localStorage */
    localStorage.setItem("noaaStationsCache", JSON.stringify(stations));
    localStorage.setItem("noaaStationsCacheTime", Date.now().toString());

    return stations;
  } catch (err) {
    console.warn("Could not fetch NOAA stations, using local fallback:", err);
    return null;
  }
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
  lastWindMph = Math.round(data.hourly.windspeed_10m[i]);
  lastWindDeg = Math.round(data.hourly.winddirection_10m[i]);

  const tempMain = document.getElementById("tempMain");
  const tempSub = document.getElementById("tempSub");
  if (tempMain) tempMain.textContent = `${temp}°`;
  if (tempSub) tempSub.textContent = `${humidity}% Humidity`;

  renderWindReadings();
  renderCompass();
  updateCompassMap();
}
function renderWindReadings() {
  const topEl = document.getElementById("windReadings");
  const botEl = document.getElementById("windDir");

  const mph = lastWindMph;
  const kph = Math.round(mph * 1.60934);
  const knots = Math.round(mph * 0.868976);

  const parts = [];
  if (showWindMph) parts.push(`${mph} mph`);
  if (showWindKph) parts.push(`${kph} kph`);
  if (showWindKnots) parts.push(`${knots} kts`);

  if (topEl) {
    topEl.innerHTML = parts.length
      ? `<div class="windReadingLine">${parts.join(' <span class="windSep">|</span> ')}</div>`
      : "";
    topEl.style.transform = `translateY(${windTopOffset}px)`;
  }

  let botHtml = "";
  if (showWindDir) botHtml = `<div class="windReadingDir">${degToCompass(lastWindDeg)} ${lastWindDeg}°</div>`;
  if (botEl) {
    botEl.innerHTML = botHtml;
    botEl.style.transform = `translateY(${windBotOffset}px)`;
  }
}

function renderCompass() {
  const compassEl = document.getElementById("compassWidget");
  const outer = document.getElementById("compassOuter");
  const arrow = document.getElementById("windArrow");
  const cardinals = document.getElementById("compassCardinals");
  if (!compassEl) return;

  const size = compassSize;

  /* size the compass circle */
  compassEl.style.width = `${size}px`;
  compassEl.style.height = `${size}px`;
if (outer) {
    outer.style.width = `${size}px`;
    outer.style.height = `${size}px`;
  }

  /* size the arrow proportionally */
  if (arrow) {
    const arrowH = Math.round(size * 0.42);
    arrow.style.height = `${arrowH}px`;
    arrow.style.top = `${Math.round(size * 0.08)}px`;
    arrow.style.transform = `translateX(-50%) rotate(${lastWindDeg}deg)`;
  }

  /* apply compass style class */
  if (compassEl) {
    compassEl.className = `compass compassStyle-${compassStyle}`;
    compassEl.id = "compassWidget";
  }

  /* position cardinals based on offset */
  if (cardinals) {
    const r = size / 2 + cardinalOffset;
    const n = document.getElementById("cardinalN");
    const s = document.getElementById("cardinalS");
    const e = document.getElementById("cardinalE");
    const w = document.getElementById("cardinalW");

    if (n) { n.style.left = "50%"; n.style.top = `calc(50% - ${r}px)`; }
    if (s) { s.style.left = "50%"; s.style.top = `calc(50% + ${r}px)`; }
    if (e) { e.style.left = `calc(50% + ${r}px)`; e.style.top = "50%"; }
    if (w) { w.style.left = `calc(50% - ${r}px)`; w.style.top = "50%"; }
  }
}

/* ==========================================================================
   SATELLITE COMPASS
   ========================================================================== */
function updateCompassMap() {
  const canvas = document.getElementById("compassMapCanvas");
  const compassEl = document.getElementById("compassWidget");
  const widgetFrame = document.querySelector("#windWidget .widgetFrame");
  if (!canvas || !marineLocationLat || !marineLocationLon) return;

  const size = compassSize;

  if (compassMapMode === "none") {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "block";

  if (compassMapMode === "widget" && widgetFrame) {
    const w2 = widgetFrame.offsetWidth;
    const h2 = widgetFrame.offsetHeight;
    canvas.width = w2;
    canvas.height = h2;
    canvas.style.width = w2 + "px";
    canvas.style.height = h2 + "px";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.borderRadius = "8px";

    /* move canvas to widgetFrame level */
    if (canvas.parentElement !== widgetFrame) {
      widgetFrame.insertBefore(canvas, widgetFrame.firstChild);
    }
    canvas.classList.add("fillWidget");
  } else {
    /* compass mode — canvas stays inside .compass */
    if (canvas.parentElement !== compassEl) {
      compassEl.insertBefore(canvas, compassEl.firstChild);
    }
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.borderRadius = "50%";
    canvas.classList.remove("fillWidget");
  }

  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const zoom = compassZoom;
  const lat = marineLocationLat;
  const lon = marineLocationLon;

  const n = Math.pow(2, zoom);
  const tileX = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  const pixelX = Math.floor(((lon + 180) / 360 * n - tileX) * 256);
  const pixelY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - tileY) * 256);

  ctx.save();
  ctx.beginPath();
  if (compassMapMode === "compass") {
    ctx.roundRect(0, 0, w, h, 8);
  } else {
    ctx.roundRect(0, 0, w, h, 8);
  }
  ctx.clip();
  ctx.fillStyle = "#0a1924";
  ctx.fillRect(0, 0, w, h);

  [-1, 0, 1].forEach(dy => {
    [-1, 0, 1].forEach(dx => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY + dy}/${tileX + dx}`;
      img.onload = () => {
        const drawX = (w / 2 - pixelX) + dx * 256;
        const drawY = (h / 2 - pixelY) + dy * 256;
        ctx.drawImage(img, drawX, drawY, 256, 256);
      };
    });
  });

  ctx.restore();
}


async function loadMarineLocation() {
  const lat = localStorage.getItem("marineLocationLat");
  const lon = localStorage.getItem("marineLocationLon");
  const address = localStorage.getItem("marineLocationAddress");
  const savedZoom = localStorage.getItem("compassZoom");
  const savedMode = localStorage.getItem("compassMapMode");
  const savedSize = localStorage.getItem("compassSize");
  const savedStyle = localStorage.getItem("compassStyle");
  const savedCardinalOffset = localStorage.getItem("cardinalOffset");
  const savedShowMph = localStorage.getItem("showWindMph");
  const savedShowKph = localStorage.getItem("showWindKph");
  const savedShowKnots = localStorage.getItem("showWindKnots");
  const savedShowDir = localStorage.getItem("showWindDir");
  const savedTopOffset = localStorage.getItem("windTopOffset");
  const savedBotOffset = localStorage.getItem("windBotOffset");

  if (savedZoom) {
    compassZoom = parseInt(savedZoom);
    const el = document.getElementById("compassZoom");
    const label = document.getElementById("compassZoomLabel");
    if (el) el.value = compassZoom;
    if (label) label.textContent = compassZoom;
  }
  if (savedMode) {
    compassMapMode = savedMode;
    const el = document.getElementById("compassMapMode");
    if (el) el.value = compassMapMode;
  }
  if (savedSize) {
    compassSize = parseInt(savedSize);
    const el = document.getElementById("compassSizeSlider");
    const label = document.getElementById("compassSizeLabel");
    if (el) el.value = compassSize;
    if (label) label.textContent = compassSize + "px";
  }
  if (savedStyle) {
    compassStyle = savedStyle;
    const el = document.getElementById("compassStyle");
    if (el) el.value = compassStyle;
  }
  if (savedCardinalOffset) {
    cardinalOffset = parseInt(savedCardinalOffset);
    const el = document.getElementById("cardinalOffset");
    const label = document.getElementById("cardinalOffsetLabel");
    if (el) el.value = cardinalOffset;
    if (label) label.textContent = cardinalOffset + "px";
  }
  if (savedShowMph !== null) {
    showWindMph = savedShowMph === "1";
    const el = document.getElementById("showWindMph");
    if (el) el.checked = showWindMph;
  }
  if (savedShowKph !== null) {
    showWindKph = savedShowKph === "1";
    const el = document.getElementById("showWindKph");
    if (el) el.checked = showWindKph;
  }
  if (savedShowKnots !== null) {
    showWindKnots = savedShowKnots === "1";
    const el = document.getElementById("showWindKnots");
    if (el) el.checked = showWindKnots;
  }
  if (savedShowDir !== null) {
    showWindDir = savedShowDir === "1";
    const el = document.getElementById("showWindDir");
    if (el) el.checked = showWindDir;
  }
  if (savedTopOffset !== null) {
    windTopOffset = parseInt(savedTopOffset);
    const el = document.getElementById("windTopOffset");
    const label = document.getElementById("windTopOffsetLabel");
    if (el) el.value = windTopOffset;
    if (label) label.textContent = windTopOffset + "px";
  }
  if (savedBotOffset !== null) {
    windBotOffset = parseInt(savedBotOffset);
    const el = document.getElementById("windBotOffset");
    const label = document.getElementById("windBotOffsetLabel");
    if (el) el.value = windBotOffset;
    if (label) label.textContent = windBotOffset + "px";
  }

  if (lat && lon) {
    marineLocationLat = parseFloat(lat);
    marineLocationLon = parseFloat(lon);
    userLat = marineLocationLat;
    userLon = marineLocationLon;
    const input = document.getElementById("marineAddressInput");
    if (input && address) input.value = address;
    updateCompassMap();
    await fetchAllNoaaStations().then(stations => {
      allNoaaStations = stations;
      return updateNearbyStations(marineLocationLat, marineLocationLon);
    });
  }
  renderCompass();
  renderWindReadings();

  return Promise.resolve();
}

function attachCompassSettingsEvents() {
  const marineBtn = document.getElementById("marineAddressBtn");
  if (marineBtn) {
    marineBtn.addEventListener("click", () => {
      const input = document.getElementById("marineAddressInput");
      if (input && input.value.trim()) geocodeMarineAddress(input.value.trim());
    });
  }

  const addressInput = document.getElementById("marineAddressInput");
  if (addressInput) {
    addressInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && addressInput.value.trim()) geocodeMarineAddress(addressInput.value.trim());
    });
  }

  const zoomSlider = document.getElementById("compassZoom");
  if (zoomSlider) {
    zoomSlider.addEventListener("input", () => {
      compassZoom = parseInt(zoomSlider.value);
      document.getElementById("compassZoomLabel").textContent = compassZoom;
      localStorage.setItem("compassZoom", compassZoom);
      updateCompassMap();
    });
  }

  const modeSelect = document.getElementById("compassMapMode");
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      compassMapMode = modeSelect.value;
      localStorage.setItem("compassMapMode", compassMapMode);
      updateCompassMap();
    });
  }

  const sizeSlider = document.getElementById("compassSizeSlider");
  if (sizeSlider) {
    sizeSlider.addEventListener("input", () => {
      compassSize = parseInt(sizeSlider.value);
      document.getElementById("compassSizeLabel").textContent = compassSize + "px";
      localStorage.setItem("compassSize", compassSize);
      renderCompass();
      updateCompassMap();
    });
  }

  const styleSelect = document.getElementById("compassStyle");
  if (styleSelect) {
    styleSelect.addEventListener("change", () => {
      compassStyle = styleSelect.value;
      localStorage.setItem("compassStyle", compassStyle);
      renderCompass();
    });
  }

  const cardinalSlider = document.getElementById("cardinalOffset");
  if (cardinalSlider) {
    cardinalSlider.addEventListener("input", () => {
      cardinalOffset = parseInt(cardinalSlider.value);
      document.getElementById("cardinalOffsetLabel").textContent = cardinalOffset + "px";
      localStorage.setItem("cardinalOffset", cardinalOffset);
      renderCompass();
    });
  }

  const topOffsetSlider = document.getElementById("windTopOffset");
  if (topOffsetSlider) {
    topOffsetSlider.addEventListener("input", () => {
      windTopOffset = parseInt(topOffsetSlider.value);
      document.getElementById("windTopOffsetLabel").textContent = windTopOffset + "px";
      localStorage.setItem("windTopOffset", windTopOffset);
      renderWindReadings();
    });
  }

  const botOffsetSlider = document.getElementById("windBotOffset");
  if (botOffsetSlider) {
    botOffsetSlider.addEventListener("input", () => {
      windBotOffset = parseInt(botOffsetSlider.value);
      document.getElementById("windBotOffsetLabel").textContent = windBotOffset + "px";
      localStorage.setItem("windBotOffset", windBotOffset);
      renderWindReadings();
    });
  }

  const checks = [
    ["showWindMph",   v => showWindMph = v,   "showWindMph"],
    ["showWindKph",   v => showWindKph = v,   "showWindKph"],
    ["showWindKnots", v => showWindKnots = v, "showWindKnots"],
    ["showWindDir",   v => showWindDir = v,   "showWindDir"],
  ];
  checks.forEach(([id, setter, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => {
      setter(el.checked);
      localStorage.setItem(key, el.checked ? "1" : "0");
      renderWindReadings();
    });
  });
}

function makeSettingsPanelsDraggable() {
  document.querySelectorAll(".widgetSettingsPanel").forEach(panel => {
    const header = panel.querySelector(".settingsHeader");
    if (!header) return;

    const btn = document.createElement("button");
    btn.className = "settingsDragBtn";
    btn.title = "Pop out / dock";
    btn.textContent = "⎋";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const detaching = !panel.classList.contains("is-detached");

      if (detaching) {
        /* move panel to body so it escapes widget stacking context */
        const rect = panel.getBoundingClientRect();
        document.body.appendChild(panel);
        panel.style.position = "fixed";
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "auto";
        panel.style.width = "260px";
        panel.style.maxHeight = "80vh";
        panel.style.zIndex = "99999";
        panel.style.display = "block";
        panel.classList.add("is-detached");
        btn.textContent = "⊡";
      } else {
        /* dock it back — find its widget and re-attach */
        const widgetId = panel.dataset.settingsFor;
        const widget = document.querySelector(`[data-widget="${widgetId}"]`);
        if (widget) {
          widget.appendChild(panel);
          panel.style.position = "";
          panel.style.left = "";
          panel.style.top = "";
          panel.style.right = "";
          panel.style.width = "";
          panel.style.maxHeight = "";
          panel.style.zIndex = "";
        }
        panel.classList.remove("is-detached");
        btn.textContent = "⎋";
      }
    });
    header.appendChild(btn);

    /* drag logic */
    let dragging = false;
    let ox = 0, oy = 0;

    header.addEventListener("mousedown", (e) => {
      if (!panel.classList.contains("is-detached")) return;
      if (e.target === btn) return;
      dragging = true;
      ox = e.clientX - panel.getBoundingClientRect().left;
      oy = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + "px";
      panel.style.top = (e.clientY - oy) + "px";
    });

    document.addEventListener("mouseup", () => { dragging = false; });
  });
}

async function geocodeMarineAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

    const res = await fetch(url, {
      headers: { "Accept-Language": "en" }
    });
    const data = await res.json();

    if (data && data.length > 0) {
      marineLocationLat = parseFloat(data[0].lat);
      marineLocationLon = parseFloat(data[0].lon);

      localStorage.setItem("marineLocationLat", marineLocationLat);
      localStorage.setItem("marineLocationLon", marineLocationLon);
      localStorage.setItem("marineLocationAddress", address);

      updateCompassMap();
    } else {
      alert("Address not found — try being more specific, e.g. '111 Avenida Menendez, St Augustine FL'");
    }
  } catch (err) {
    console.error("Geocode error:", err);
  }
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

/* ==========================================================================
   SATELLITE COMPASS
   ========================================================================== */
function updateCompassMap() {
  const canvas = document.getElementById("compassMapCanvas");
  if (!canvas || !marineLocationLat || !marineLocationLon) return;

  if (compassMapMode === "none") {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "block";

  if (compassMapMode === "widget") {
    /* move canvas to widgetFrame so it fills the whole widget */
    const widgetFrame = document.querySelector("#windWidget .widgetFrame");
    if (!widgetFrame) return;

    if (canvas.parentElement !== widgetFrame) {
      widgetFrame.insertBefore(canvas, widgetFrame.firstChild);
    }

    const w = widgetFrame.offsetWidth;
    const h = widgetFrame.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.style.borderRadius = "12px";
    canvas.style.opacity = "0.45";
    canvas.style.zIndex = "0";
    drawMapTiles(canvas, w, h);

  } else {
    /* move canvas back inside compass */
    const compassEl = document.getElementById("compassWidget");
    if (!compassEl) return;

    if (canvas.parentElement !== compassEl) {
      compassEl.insertBefore(canvas, compassEl.firstChild);
    }

    const size = compassSize;
    canvas.width = size;
    canvas.height = size;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.borderRadius = "50%";
    canvas.style.opacity = "0.65";
    canvas.style.zIndex = "0";
    drawMapTiles(canvas, size, size);
  }
}

function drawMapTiles(canvas, w, h) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const zoom = compassZoom;
  const lat = marineLocationLat;
  const lon = marineLocationLon;

  const n = Math.pow(2, zoom);
  const tileX = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  const pixelX = Math.floor(((lon + 180) / 360 * n - tileX) * 256);
  const pixelY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - tileY) * 256);

  ctx.save();
  ctx.beginPath();
  if (compassMapMode === "compass") {
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  } else {
    ctx.roundRect(0, 0, w, h, 12);
  }
  ctx.clip();
  ctx.fillStyle = "#0a1924";
  ctx.fillRect(0, 0, w, h);

  [-1, 0, 1].forEach(dy => {
    [-1, 0, 1].forEach(dx => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY + dy}/${tileX + dx}`;
      img.onload = () => {
        const drawX = (w / 2 - pixelX) + dx * 256;
        const drawY = (h / 2 - pixelY) + dy * 256;
        ctx.drawImage(img, drawX, drawY, 256, 256);
      };
    });
  });

  ctx.restore();
}

async function geocodeMarineAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();

    if (data && data.length > 0) {
      marineLocationLat = parseFloat(data[0].lat);
      marineLocationLon = parseFloat(data[0].lon);

      localStorage.setItem("marineLocationLat", marineLocationLat);
      localStorage.setItem("marineLocationLon", marineLocationLon);
      localStorage.setItem("marineLocationAddress", address);

      updateCompassMap();

      /* update nearby stations based on marina address */
      userLat = marineLocationLat;
      userLon = marineLocationLon;

      if (!allNoaaStations) allNoaaStations = await fetchAllNoaaStations();
      await updateNearbyStations(marineLocationLat, marineLocationLon);
    } else {
      alert("Address not found — try being more specific, e.g. '111 Avenida Menendez, St Augustine FL'");
    }
  } catch (err) {
    console.error("Geocode error:", err);
  }
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