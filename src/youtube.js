const { saveCache } = require("./cache");

let quotaUsed = 0;
const quotaLog = [];

function trackQuota(method, cost) {
  quotaUsed += cost;
  quotaLog.push({ method, cost, total: quotaUsed, time: new Date().toLocaleTimeString() });
}

function getQuota() { return { used: quotaUsed, log: [...quotaLog] }; }
function resetQuota() { quotaUsed = 0; quotaLog.length = 0; }

function isQuotaError(err) {
  return err?.code === 403 || err?.status === 403 ||
    (err?.message && err.message.includes('quota'));
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

async function getSubscriptions(youtube, cache) {
  if (cache.subscriptions) {
    return cache.subscriptions;
  }
  let channels = [];
  let nextPageToken;
  do {
    const res = await youtube.subscriptions.list({
      part: "snippet",
      mine: true,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    trackQuota("subscriptions.list", 1);
    (res.data.items || []).forEach(i => {
      const id = i.snippet.resourceId.channelId;
      channels.push(id);
      if (!cache.channelNames) cache.channelNames = {};
      cache.channelNames[id] = i.snippet.title;
    });
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);
  cache.subscriptions = channels;
  saveCache(cache);
  return channels;
}

async function getUploadsPlaylists(youtube, channelIds, cache) {
  const result = {};
  const uncached = [];

  for (const id of channelIds) {
    if (cache.uploads[id]) {
      result[id] = cache.uploads[id];
    } else {
      uncached.push(id);
    }
  }

  for (let i = 0; i < uncached.length; i += 50) {
    const chunk = uncached.slice(i, i + 50);
    const res = await youtube.channels.list({ part: "contentDetails", id: chunk.join(",") });
    trackQuota("channels.list", 1);
    for (const item of (res.data.items || [])) {
      const playlistId = item.contentDetails.relatedPlaylists.uploads;
      result[item.id] = playlistId;
      cache.uploads[item.id] = playlistId;
    }
  }

  if (uncached.length > 0) saveCache(cache);
  return result;
}

async function getVideos(youtube, playlistId, cache) {
  const entry = cache.videos[playlistId];
  const knownIds = new Set(entry ? entry.map(v => v.id) : []);

  let newVids = [];
  let nextPageToken;
  let hitCached = false;

  do {
    const res = await youtube.playlistItems.list({
      part: "snippet",
      playlistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    trackQuota("playlistItems.list", 1);
    for (const i of (res.data.items || [])) {
      const vid = { id: i.snippet.resourceId.videoId, publishedAt: i.snippet.publishedAt };
      if (knownIds.has(vid.id)) {
        hitCached = true;
        break;
      }
      newVids.push(vid);
    }
    if (hitCached) break;
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  const merged = [...newVids];
  const mergedIds = new Set(newVids.map(v => v.id));
  if (entry) {
    for (const v of entry) {
      if (!mergedIds.has(v.id)) merged.push(v);
    }
  }

  cache.videos[playlistId] = merged;
  saveCache(cache);
  return merged;
}

async function getDurations(youtube, ids, cache) {
  const uncached = ids.filter(id => !(id in cache.durations));

  for (let i = 0; i < uncached.length; i += 50) {
    const chunk = uncached.slice(i, i + 50);
    const res = await youtube.videos.list({ part: "contentDetails", id: chunk.join(",") });
    trackQuota("videos.list", 1);
    (res.data.items || []).forEach(v => {
      cache.durations[v.id] = parseDuration(v.contentDetails.duration);
    });
  }

  if (uncached.length > 0) saveCache(cache);

  const map = {};
  for (const id of ids) {
    if (id in cache.durations) map[id] = cache.durations[id];
  }
  return map;
}

async function createPlaylist(youtube, title) {
  const res = await youtube.playlists.insert({
    part: "snippet,status",
    requestBody: {
      snippet: { title },
      status: { privacyStatus: "private" },
    },
  });
  trackQuota("playlists.insert", 50);
  return res.data.id;
}

async function addToPlaylist(youtube, pid, vid) {
  await youtube.playlistItems.insert({
    part: "snippet",
    requestBody: {
      snippet: {
        playlistId: pid,
        resourceId: { kind: "youtube#video", videoId: vid },
      },
    },
  });
  trackQuota("playlistItems.insert", 50);
}

module.exports = {
  isQuotaError,
  parseDuration,
  getSubscriptions,
  getUploadsPlaylists,
  getVideos,
  getDurations,
  createPlaylist,
  addToPlaylist,
  getQuota,
  resetQuota,
};
