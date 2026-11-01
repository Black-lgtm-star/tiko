/* market-notifications.js — local market-session alerts; no server or price feed required. */
(function (TA) {
  'use strict';

  var NY_TZ = 'America/New_York';
  var STORE_KEY = 'gt.market-alerts.last-event.v1';
  var GRACE_MIN = 10; // keep alerting briefly after an event so a reload still catches it
  var SOON_MIN = 15; // pre-close reminder window
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var timer = null;
  var lastLocalKey = '';
  var holidaysByYear = Object.create(null);
  var formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  function partsAt(date) {
    var out = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') out[part.type] = part.value;
    });
    return out;
  }

  function dateKey(y, m, d) {
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function tzOffsetMinutes(date) {
    var p = partsAt(date);
    var wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }

  function etTime(year, month, day, hour, minute) {
    var wall = Date.UTC(year, month - 1, day, hour, minute);
    var offset = tzOffsetMinutes(new Date(wall));
    var at = new Date(wall - offset * 60000);
    var settled = tzOffsetMinutes(at);
    if (settled !== offset) at = new Date(wall - settled * 60000);
    return at;
  }

  function shiftDay(year, month, day, delta) {
    var d = new Date(Date.UTC(year, month - 1, day + delta));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function nthWeekday(year, month, weekday, nth) {
    var first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  }

  function lastWeekday(year, month, weekday) {
    var last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var day = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
    return last - ((day - weekday + 7) % 7);
  }

  function easterSunday(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month: month, day: day };
  }

  function addObserved(set, year, month, day, saturdayRule) {
    var dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow === 0) set[dateKey(year, month, day + 1)] = true;
    else if (dow === 6) {
      if (saturdayRule !== 'none') set[dateKey(year, month, day - 1)] = true;
    } else set[dateKey(year, month, day)] = true;
  }

  function holidaySet(year) {
    var set = {};
    // NYSE observes New Year's Day when it falls on a weekday or Sunday;
    // Saturday Jan 1 is not moved to the preceding Friday.
    var newYearDow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    if (newYearDow === 0) set[dateKey(year, 1, 2)] = true;
    else if (newYearDow !== 6) set[dateKey(year, 1, 1)] = true;
    set[dateKey(year, 1, nthWeekday(year, 1, 1, 3))] = true; // MLK Day
    set[dateKey(year, 2, nthWeekday(year, 2, 1, 3))] = true; // Washington's Birthday
    var easter = easterSunday(year);
    var goodFriday = new Date(Date.UTC(year, easter.month - 1, easter.day - 2));
    set[dateKey(year, goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate())] = true;
    set[dateKey(year, 5, lastWeekday(year, 5, 1))] = true; // Memorial Day
    if (year >= 2022) addObserved(set, year, 6, 19, 'nearest'); // Juneteenth
    addObserved(set, year, 7, 4, 'nearest'); // Independence Day
    set[dateKey(year, 9, nthWeekday(year, 9, 1, 1))] = true; // Labor Day
    set[dateKey(year, 11, nthWeekday(year, 11, 4, 4))] = true; // Thanksgiving
    addObserved(set, year, 12, 25, 'nearest'); // Christmas Day
    return set;
  }

  function holidaysFor(year) {
    if (!holidaysByYear[year]) holidaysByYear[year] = holidaySet(year);
    return holidaysByYear[year];
  }

  function thanksgivingFriday(year) {
    return dateKey(year, 11, nthWeekday(year, 11, 4, 4) + 1);
  }

  function isEarlyClose(year, month, day, holidays) {
    var key = dateKey(year, month, day);
    if (key === thanksgivingFriday(year)) return true;
    var dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (month === 12 && day === 24 && dow >= 1 && dow <= 5 && !holidays[key]) return true;
    // The exchanges publish a 1 p.m. close on July 3 when it is a trading day.
    if (month === 7 && day === 3 && dow >= 1 && dow <= 5 && !holidays[key]) return true;
    return false;
  }

  function stockSession(year, month, day) {
    var dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    var holidays = holidaysFor(year);
    var trading = dow >= 1 && dow <= 5 && !holidays[dateKey(year, month, day)];
    return {
      trading: trading,
      openMin: 9 * 60 + 30,
      closeMin: trading && isEarlyClose(year, month, day, holidays) ? 13 * 60 : 16 * 60
    };
  }

  function nextTradingOpen(year, month, day) {
    for (var i = 1; i <= 14; i++) {
      var d = shiftDay(year, month, day, i);
      var info = stockSession(d.year, d.month, d.day);
      if (info.trading) return etTime(d.year, d.month, d.day, 9, 30);
    }
    return etTime(year, month, day, 9, 30);
  }

  function forexOpenAt(weekday, minutes) {
    if (weekday === 'Sun') return minutes >= 17 * 60;
    if (weekday === 'Fri') return minutes < 17 * 60;
    return weekday !== 'Sat';
  }

  function sessionState(at) {
    var when = at instanceof Date ? at : new Date();
    var p = partsAt(when);
    var year = +p.year, month = +p.month, day = +p.day;
    var minutes = +p.hour * 60 + +p.minute;
    var dow = WEEKDAYS.indexOf(p.weekday);
    var info = stockSession(year, month, day);
    var stocksOpen = info.trading && minutes >= info.openMin && minutes < info.closeMin;
    var stocksNext;
    if (stocksOpen) {
      stocksNext = { type: 'close', at: etTime(year, month, day, Math.floor(info.closeMin / 60), info.closeMin % 60) };
    } else if (info.trading && minutes < info.openMin) {
      stocksNext = { type: 'open', at: etTime(year, month, day, 9, 30) };
    } else {
      stocksNext = { type: 'open', at: nextTradingOpen(year, month, day) };
    }

    var forexOpen = forexOpenAt(p.weekday, minutes);
    var forexNext;
    if (forexOpen) {
      var closeIn = dow === 5 ? 0 : (5 - dow + 7) % 7;
      var f = shiftDay(year, month, day, closeIn);
      forexNext = { type: 'close', at: etTime(f.year, f.month, f.day, 17, 0) };
    } else {
      var openIn = dow === 0 ? 0 : (7 - dow) % 7;
      var s = shiftDay(year, month, day, openIn);
      forexNext = { type: 'open', at: etTime(s.year, s.month, s.day, 17, 0) };
    }

    return {
      at: when,
      stocks: { open: stocksOpen, next: stocksNext },
      forex: { open: forexOpen, next: forexNext }
    };
  }

  function inWindow(minutes, start, end) {
    return minutes >= start && minutes < end;
  }

  function wasSent(key) {
    if (lastLocalKey === key) return true;
    try {
      if (window.localStorage.getItem(STORE_KEY) === key) {
        lastLocalKey = key;
        return true;
      }
      window.localStorage.setItem(STORE_KEY, key);
    } catch (e) {}
    lastLocalKey = key;
    return false;
  }

  function dispatch(key, titleKey, bodyKey) {
    if (wasSent(key)) return;
    var title = TA.i18n.t(titleKey);
    var body = TA.i18n.t(bodyKey);
    if (TA.ui && TA.ui.toast) TA.ui.toast(title + ' · ' + body);
    if (typeof window.Notification === 'function' && window.Notification.permission === 'granted') {
      try {
        var notice = new window.Notification(title, { body: body, tag: key });
        notice.onclick = function () { window.focus(); notice.close(); };
      } catch (e) {}
    }
  }

  function checkAt(at) {
    if (TA.auth && TA.auth.session && !TA.auth.session()) return;
    var settings = TA.store.settings();
    if (!settings.marketAlertsEnabled) return;
    var when = at instanceof Date ? at : new Date();
    var p = partsAt(when);
    var year = +p.year, month = +p.month, day = +p.day;
    var minutes = +p.hour * 60 + +p.minute;
    var date = dateKey(year, month, day);

    if (settings.marketStockAlerts !== false) {
      var info = stockSession(year, month, day);
      if (info.trading) {
        if (inWindow(minutes, info.openMin, info.openMin + GRACE_MIN)) {
          dispatch(date + ':stocks-open', 'alerts.stocks.open.title', 'alerts.stocks.open.body');
        }
        if (inWindow(minutes, info.closeMin - SOON_MIN, info.closeMin)) {
          dispatch(date + ':stocks-soon', 'alerts.stocks.soon.title',
            info.closeMin === 13 * 60 ? 'alerts.stocks.soonEarly.body' : 'alerts.stocks.soon.body');
        }
        if (inWindow(minutes, info.closeMin, info.closeMin + GRACE_MIN)) {
          dispatch(date + ':stocks-close', 'alerts.stocks.close.title',
            info.closeMin === 13 * 60 ? 'alerts.stocks.closeEarly.body' : 'alerts.stocks.close.body');
        }
      }
    }

    if (settings.marketForexAlerts !== false) {
      if (p.weekday === 'Sun' && inWindow(minutes, 17 * 60, 17 * 60 + GRACE_MIN)) {
        dispatch(date + ':forex-open', 'alerts.forex.open.title', 'alerts.forex.open.body');
      }
      if (p.weekday === 'Fri') {
        if (inWindow(minutes, 17 * 60 - SOON_MIN, 17 * 60)) {
          dispatch(date + ':forex-soon', 'alerts.forex.soon.title', 'alerts.forex.soon.body');
        }
        if (inWindow(minutes, 17 * 60, 17 * 60 + GRACE_MIN)) {
          dispatch(date + ':forex-close', 'alerts.forex.close.title', 'alerts.forex.close.body');
        }
      }
    }
  }

  function start() {
    if (timer) return;
    checkAt();
    timer = window.setInterval(function () { checkAt(); }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkAt();
    });
  }

  function permission() {
    return typeof window.Notification === 'function' ? window.Notification.permission : 'unsupported';
  }

  function requestPermission() {
    var result = Promise.resolve('unsupported');
    try {
      if (typeof window.Notification === 'function') {
        result = window.Notification.permission === 'default'
          ? Promise.resolve(window.Notification.requestPermission())
          : Promise.resolve(window.Notification.permission);
      }
    } catch (e) { result = Promise.resolve('denied'); }
    return result.catch(function () { return 'denied'; });
  }

  function enable() {
    return requestPermission().then(function (status) {
      TA.store.updateSettings({ marketAlertsEnabled: true });
      checkAt();
      return status;
    });
  }

  function disable() {
    TA.store.updateSettings({ marketAlertsEnabled: false });
    return false;
  }

  function status() {
    var settings = TA.store.settings();
    var state = sessionState(new Date());
    return {
      enabled: !!settings.marketAlertsEnabled,
      stocksEnabled: settings.marketStockAlerts !== false,
      forexEnabled: settings.marketForexAlerts !== false,
      permission: permission(),
      at: state.at,
      stocks: state.stocks,
      forex: state.forex
    };
  }

  TA.marketNotifications = {
    start: start,
    enable: enable,
    disable: disable,
    permission: permission,
    status: status,
    sessionState: sessionState,
    checkAt: checkAt
  };
})(window.TA = window.TA || {});
