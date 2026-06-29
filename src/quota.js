const fs = require("fs");
const { QUOTA_PATH } = require("./config");

const DAILY_LIMIT = 100000;
const MAX_LOG = 200;

function pacificDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function loadQuota() {
  const today = pacificDay();
  if (fs.existsSync(QUOTA_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(QUOTA_PATH));
      if (data.day === today) {
        if (!data.byMethod) {
          data.byMethod = {};
          for (const entry of data.log || []) {
            data.byMethod[entry.method] = (data.byMethod[entry.method] || 0) + entry.cost;
          }
        }
        return data;
      }
    } catch {}
  }
  return { day: today, used: 0, log: [], byMethod: {} };
}

function saveQuota(state) {
  fs.writeFileSync(QUOTA_PATH, JSON.stringify(state));
}

let state = null;
function current() {
  const today = pacificDay();
  if (!state || state.day !== today) state = loadQuota();
  return state;
}

function trackQuota(method, cost) {
  const s = current();
  s.used += cost;
  s.byMethod[method] = (s.byMethod[method] || 0) + cost;
  s.log.push({ method, cost, total: s.used, time: new Date().toLocaleTimeString() });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  saveQuota(s);
}

function getQuota() {
  const s = current();
  return {
    day: s.day,
    used: s.used,
    limit: DAILY_LIMIT,
    remaining: DAILY_LIMIT - s.used,
    byMethod: { ...s.byMethod },
    log: [...s.log],
  };
}

module.exports = { trackQuota, getQuota, DAILY_LIMIT };
