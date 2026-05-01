const fs = require("fs");
const { CACHE_PATH } = require("./config");

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try { return JSON.parse(fs.readFileSync(CACHE_PATH)); } catch {}
  }
  return { subscriptions: null, channelNames: {}, selectedChannels: null, uploads: {}, videos: {}, durations: {} };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

module.exports = { loadCache, saveCache };
