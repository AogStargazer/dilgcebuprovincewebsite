(function () {
  const clocks = document.querySelectorAll("[data-header-clock]");
  if (!clocks.length) return;

  const dateFormatterCache = new Map();
  const timeFormatterCache = new Map();
  const weatherCodes = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Foggy",
    48: "Foggy",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    95: "Thunderstorm"
  };

  function getFormatter(cache, timeZone, options) {
    if (!cache.has(timeZone)) {
      cache.set(timeZone, new Intl.DateTimeFormat("en-US", {
        timeZone,
        ...options
      }));
    }
    return cache.get(timeZone);
  }

  function updateHeaderClocks() {
    const now = new Date();

    clocks.forEach((clock) => {
      const timeZone = clock.dataset.timeZone || "Asia/Manila";
      const dateElem = clock.querySelector("[data-clock-date]");
      const timeElem = clock.querySelector("[data-clock-time]");
      const isoValue = now.toISOString();

      if (dateElem) {
        dateElem.textContent = getFormatter(dateFormatterCache, timeZone, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        }).format(now);
        dateElem.setAttribute("datetime", isoValue);
      }

      if (timeElem) {
        timeElem.textContent = getFormatter(timeFormatterCache, timeZone, {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZoneName: "short"
        }).format(now);
        timeElem.setAttribute("datetime", isoValue);
      }
    });
  }

  function setWeatherText(text) {
    document.querySelectorAll("[data-weather-status]").forEach((element) => {
      element.textContent = text;
    });
  }

  async function getIpLocation() {
    const response = await fetch("https://ipwho.is/");
    if (!response.ok) throw new Error("IP location request failed");

    const data = await response.json();
    if (!data.success || !data.latitude || !data.longitude) {
      throw new Error("IP location unavailable");
    }

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      label: data.city || data.country || "Your Area"
    };
  }

  async function updateHeaderWeather() {
    const defaultLocation = { latitude: 10.3157, longitude: 123.8854, label: "Cebu City" };
    let location;

    try {
      location = await getIpLocation();
    } catch (error) {
      location = defaultLocation;
    }

    try {
      const params = new URLSearchParams({
        latitude: location.latitude,
        longitude: location.longitude,
        current: "temperature_2m,weather_code",
        timezone: "auto"
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error("Weather request failed");

      const data = await response.json();
      const temperature = Math.round(data.current.temperature_2m);
      const condition = weatherCodes[data.current.weather_code] || "Weather";
      setWeatherText(`${location.label}: ${temperature}\u00b0C, ${condition}`);
    } catch (error) {
      setWeatherText("Weather unavailable");
    }
  }

  updateHeaderClocks();
  setInterval(updateHeaderClocks, 1000);
  updateHeaderWeather();
}());
