(function () {
  const header = document.querySelector('.site-header');
  const navLinks = document.querySelectorAll('nav a[data-section]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function updateHeader() {
    if (!header) return;
    const hero = document.querySelector('.hero');
    const pastHero = hero ? window.scrollY > hero.offsetHeight - 80 : window.scrollY > 8;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    header.classList.toggle('is-light', pastHero);
  }

  function setActive(sectionId) {
    navLinks.forEach(function (link) {
      const isActive = link.dataset.section === sectionId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function currentSection() {
    const offset = (header ? header.offsetHeight : 72) + 24;
    const game = document.getElementById('game');
    const events = document.getElementById('events');
    if (game && game.getBoundingClientRect().top <= offset) return 'game';
    if (events && events.getBoundingClientRect().top <= offset) return 'events';
    return 'home';
  }

  function scrollToSection(id, updateHash) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (updateHash && id && id !== 'home') {
      history.pushState(null, '', '#' + id);
    } else if (updateHash) {
      history.pushState(null, '', location.pathname + location.search);
    }
    setActive(id);
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      const id = (link.getAttribute('href') || '').slice(1);
      if (!id || !document.getElementById(id)) return;
      event.preventDefault();
      scrollToSection(id, true);
    });
  });

  window.addEventListener('scroll', function () {
    updateHeader();
    setActive(currentSection());
  }, { passive: true });

  updateHeader();

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    );
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      revealer.observe(el);
    });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  function formatCount(value, decimals) {
    return value.toFixed(decimals);
  }

  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals, 10) || 0;
    if (Number.isNaN(target)) return;

    if (reduceMotion) {
      el.textContent = formatCount(target, decimals);
      return;
    }

    const duration = 1400;
    const start = performance.now();

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatCount(target * eased, decimals);
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    }

    el.textContent = formatCount(0, decimals);
    requestAnimationFrame(frame);
  }

  const impactSection = document.querySelector('.impact-section');
  const counters = document.querySelectorAll('.impact-stat-value');

  if (impactSection && counters.length) {
    if ('IntersectionObserver' in window) {
      const counterObserver = new IntersectionObserver(
        function (entries, observer) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            counters.forEach(function (el, index) {
              window.setTimeout(function () {
                animateCount(el);
              }, index * 120);
            });
            observer.disconnect();
          });
        },
        { threshold: 0.35 }
      );
      counterObserver.observe(impactSection);
    } else {
      counters.forEach(animateCount);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseEventDate(dateString, timeString) {
    const parts = String(dateString).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    const match = String(timeString || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2] || '0', 10);
      const meridiem = (match[3] || '').toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      date.setHours(hours, mins, 0, 0);
    }
    return date;
  }

  function formatEventDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function renderEvents() {
    const events = Array.isArray(window.WSO_EVENTS) ? window.WSO_EVENTS.slice() : [];
    const upcomingRoot = document.getElementById('upcoming-events');
    const pastRoot = document.getElementById('past-events');
    const countdownRoot = document.getElementById('next-event-countdown');
    if (!upcomingRoot || !pastRoot) return;

    const now = new Date();
    const upcoming = [];
    const past = [];

    events.forEach(function (event) {
      const date = parseEventDate(event.date, event.time);
      const item = Object.assign({}, event, { dateObj: date });
      if (!date || date >= now) upcoming.push(item);
      else past.push(item);
    });

    upcoming.sort(function (a, b) {
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj - b.dateObj;
    });
    past.sort(function (a, b) { return b.dateObj - a.dateObj; });

    if (upcoming.length) {
      upcomingRoot.innerHTML = upcoming.map(function (event) {
        const meta = [
          event.dateObj ? formatEventDate(event.dateObj) : 'N/A',
          event.time,
          event.location
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          '<article class="upcoming-event-card">' +
            '<h3>' + escapeHtml(event.title) + '</h3>' +
            '<p class="upcoming-meta">' + escapeHtml(meta) + '</p>' +
            '<p>' + escapeHtml(event.description || '') + '</p>' +
          '</article>'
        );
      }).join('');
    } else {
      upcomingRoot.innerHTML = '<p class="empty-events">No upcoming events posted yet. Follow us on Instagram for the next date.</p>';
    }

    if (past.length) {
      pastRoot.innerHTML = past.map(function (event) {
        const image = event.image
          ? '<div class="past-events-image-wrapper"><img src="' + escapeHtml(event.image) + '" alt="' + escapeHtml(event.alt || event.title) + '" class="past-events-image" loading="lazy" /></div>'
          : '';
        return (
          '<div class="past-event-item">' +
            '<div class="past-events-text">' +
              '<p><span class="event-date">' + escapeHtml(formatEventDate(event.dateObj)) + '</span>' + escapeHtml(event.description || event.title) + '</p>' +
            '</div>' +
            image +
          '</div>'
        );
      }).join('');
    }

    if (!countdownRoot) return;
    const next = upcoming[0];
    if (!next) {
      countdownRoot.hidden = true;
      return;
    }

    countdownRoot.hidden = false;
    countdownRoot.innerHTML =
      '<p class="countdown-kicker">Next event</p>' +
      '<p class="countdown-title">' + escapeHtml(next.title) + '</p>' +
      '<div class="countdown-grid" aria-live="polite">' +
        '<div class="countdown-unit"><strong data-part="days">N/A</strong><span>Days</span></div>' +
        '<div class="countdown-unit"><strong data-part="hours">N/A</strong><span>Hours</span></div>' +
        '<div class="countdown-unit"><strong data-part="mins">N/A</strong><span>Mins</span></div>' +
        '<div class="countdown-unit"><strong data-part="secs">N/A</strong><span>Secs</span></div>' +
      '</div>';

    if (!next.dateObj) return;

    const parts = {
      days: countdownRoot.querySelector('[data-part="days"]'),
      hours: countdownRoot.querySelector('[data-part="hours"]'),
      mins: countdownRoot.querySelector('[data-part="mins"]'),
      secs: countdownRoot.querySelector('[data-part="secs"]')
    };
    const target = next.dateObj.getTime();

    function tick() {
      let diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / 86400000);
      diff -= days * 86400000;
      const hours = Math.floor(diff / 3600000);
      diff -= hours * 3600000;
      const mins = Math.floor(diff / 60000);
      diff -= mins * 60000;
      const secs = Math.floor(diff / 1000);
      parts.days.textContent = pad(days);
      parts.hours.textContent = pad(hours);
      parts.mins.textContent = pad(mins);
      parts.secs.textContent = pad(secs);
    }

    tick();
    window.setInterval(tick, 1000);
  }

  renderEvents();

  function weatherLabel(code) {
    if (code === 0) return 'Clear sky';
    if (code === 1) return 'Mostly clear';
    if (code === 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code === 45 || code === 48) return 'Foggy';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if (code >= 61 && code <= 67) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain showers';
    if (code >= 85 && code <= 86) return 'Snow showers';
    if (code >= 95) return 'Thunderstorms';
    return 'Mixed conditions';
  }

  function aqiInfo(aqi) {
    if (aqi <= 50) return { label: 'Good', className: 'aqi-good' };
    if (aqi <= 100) return { label: 'Moderate', className: 'aqi-moderate' };
    if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', className: 'aqi-usg' };
    if (aqi <= 200) return { label: 'Unhealthy', className: 'aqi-unhealthy' };
    return { label: 'Very unhealthy', className: 'aqi-severe' };
  }

  function cleanupTip(code, rainChance, aqi) {
    if (aqi >= 151) return 'Air quality is poor. Consider rescheduling outdoor work.';
    if (aqi >= 101) return 'Sensitive members may want a mask for outdoor cleanup.';
    if (code >= 61 || (rainChance != null && rainChance >= 50)) {
      return 'Rain is likely. Check Instagram for a backup plan before heading out.';
    }
    if (code >= 51 || (rainChance != null && rainChance >= 30)) {
      return 'Bring a light jacket in case of drizzle.';
    }
    return 'Good conditions for an outdoor cleanup.';
  }

  function loadCampusConditions() {
    const root = document.getElementById('campus-conditions');
    if (!root) return;

    const lat = 35.7847;
    const lon = -78.6821;
    const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m' +
      '&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min' +
      '&timezone=America%2FNew_York&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1';
    const airUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
      '&current=us_aqi,pm2_5&timezone=America%2FNew_York';

    Promise.all([
      fetch(weatherUrl).then(function (res) {
        if (!res.ok) throw new Error('Weather request failed');
        return res.json();
      }),
      fetch(airUrl).then(function (res) {
        if (!res.ok) throw new Error('Air quality request failed');
        return res.json();
      })
    ]).then(function (results) {
      const weather = results[0];
      const air = results[1];
      const current = weather.current || {};
      const daily = weather.daily || {};
      const aqiValue = air.current && air.current.us_aqi != null ? Math.round(air.current.us_aqi) : null;
      const code = current.weather_code;
      const rainChance = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : null;
      const aqi = aqiValue == null ? { label: 'Unavailable', className: 'aqi-unknown' } : aqiInfo(aqiValue);
      const temp = Math.round(current.temperature_2m);
      const feels = Math.round(current.apparent_temperature);
      const high = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : temp;
      const low = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : temp;
      const humidity = current.relative_humidity_2m;
      const wind = Math.round(current.wind_speed_10m);
      const pm25 = air.current && air.current.pm2_5 != null ? air.current.pm2_5.toFixed(1) : null;

      root.innerHTML =
        '<div class="conditions-grid">' +
          '<div class="condition-card">' +
            '<p class="condition-kicker">Weather</p>' +
            '<p class="condition-value">' + escapeHtml(String(temp)) + '°F</p>' +
            '<p class="condition-label">' + escapeHtml(weatherLabel(code)) + '</p>' +
            '<p class="condition-meta">Feels like ' + escapeHtml(String(feels)) + '° · High ' + escapeHtml(String(high)) + '° / Low ' + escapeHtml(String(low)) + '°</p>' +
            '<p class="condition-meta">' + escapeHtml(String(humidity)) + '% humidity · ' + escapeHtml(String(wind)) + ' mph wind</p>' +
          '</div>' +
          '<div class="condition-card">' +
            '<p class="condition-kicker">Air quality</p>' +
            '<p class="condition-value">' + (aqiValue == null ? 'N/A' : escapeHtml(String(aqiValue))) + '</p>' +
            '<p class="condition-label aqi-pill ' + aqi.className + '">' + escapeHtml(aqi.label) + '</p>' +
            '<p class="condition-meta">' + (rainChance == null ? 'Rain chance unavailable' : escapeHtml(String(rainChance)) + '% chance of rain today') + '</p>' +
            '<p class="condition-meta">' + (pm25 ? 'PM2.5 ' + escapeHtml(pm25) + ' µg/m³' : 'PM2.5 unavailable') + '</p>' +
          '</div>' +
        '</div>' +
        '<p class="conditions-tip">' + escapeHtml(cleanupTip(code, rainChance, aqiValue || 0)) + '</p>' +
        '<p class="conditions-source">Campus area data from <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></p>';
    }).catch(function () {
      root.innerHTML = '<p class="conditions-status">Live campus conditions are unavailable right now. Check back before the next cleanup.</p>';
    });
  }

  loadCampusConditions();

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  const isReload = navEntry ? navEntry.type === 'reload' : (performance.navigation && performance.navigation.type === 1);
  const initial = (location.hash || '').slice(1);

  if (isReload) {
    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    window.scrollTo(0, 0);
    setActive('home');
  } else if (initial && document.getElementById(initial)) {
    window.setTimeout(function () {
      scrollToSection(initial, false);
    }, 50);
  } else {
    setActive('home');
  }
})();
