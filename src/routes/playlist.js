const { google } = require("googleapis");
const { isAuthenticated, getAuthenticatedClient } = require("../auth");
const { loadCache } = require("../cache");
const { loadProgress, saveProgress, clearProgress } = require("../progress");
const {
  isQuotaError,
  getSubscriptions,
  getUploadsPlaylists,
  getVideos,
  getDurations,
  createPlaylist,
  addToPlaylist,
  getQuota,
} = require("../youtube");
const { DAILY_LIMIT } = require("../quota");

function parseDateRange(query) {
  const mode = query.mode;
  const now = new Date();
  let start, end;

  if (mode === "range") {
    if (!query.startDate || !query.endDate) return null;
    start = new Date(query.startDate);
    end = new Date(query.endDate);
  } else if (mode === "since") {
    if (!query.sinceDate) return null;
    start = new Date(query.sinceDate);
    end = now;
  } else if (mode === "days") {
    const days = parseInt(query.days);
    if (!days || days < 1) return null;
    end = now;
    start = new Date(now);
    start.setDate(start.getDate() - days);
  } else if (mode === "year") {
    const y = parseInt(query.year);
    if (!y) return null;
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31);
  } else if (mode === "month") {
    if (!query.month) return null;
    const [y, m] = query.month.split("-").map(Number);
    start = new Date(y, m - 1, 1);
    end = new Date(y, m, 0);
  } else {
    return null;
  }

  return { start, end };
}

function registerRoutes(app) {
  app.get("/quota", (req, res) => {
    res.json(getQuota());
  });

  app.get("/run", async (req, res) => {
    if (!isAuthenticated()) return res.status(401).send("Not authenticated");

    const resume = req.query.resume === "1";
    let start, end, title, mode;

    if (resume) {
      const progress = loadProgress();
      if (!progress) return res.status(400).send("No progress to resume");
      start = new Date(progress.startDate);
      end = new Date(progress.endDate);
      title = progress.title;
      mode = "resume";
    } else {
      mode = req.query.mode;
      title = req.query.title;
      if (!mode || !title) return res.status(400).send("Missing params");

      const range = parseDateRange(req.query);
      if (!range) return res.status(400).send("Invalid date parameters");
      start = range.start;
      end = range.end;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    const send = msg => { res.write(msg + "\n"); };
    const sendQuota = () => {
      const q = getQuota();
      const recent = q.log.slice(-1)[0];
      if (recent) send(`QUOTA:${recent.time} | ${recent.method} (+${recent.cost}) — Total: ${q.used}/${DAILY_LIMIT}`);
    };

    try {
      const cache = loadCache();
      const client = getAuthenticatedClient();
      const youtube = google.youtube({ version: "v3", auth: client });

      let progress = loadProgress();
      let resuming = false;
      let pid, filtered, addedSet;

      if (progress && progress.title === title && progress.startDate === start.toISOString() && progress.endDate === end.toISOString() && progress.phase === "adding" && progress.filtered) {
        resuming = true;
        pid = progress.playlistId;
        filtered = progress.filtered;
        addedSet = new Set(progress.added || []);
        const remaining = filtered.length - addedSet.size;
        send(`Resuming previous run: ${addedSet.size}/${filtered.length} videos already added, ${remaining} remaining.`);
      } else {
        send("Fetching subscriptions...");
        const allChannels = await getSubscriptions(youtube, cache);
        send(`Found ${allChannels.length} subscriptions.`);
        sendQuota();

        const selected = cache.selectedChannels ? new Set(cache.selectedChannels) : null;
        const channels = selected ? allChannels.filter(id => selected.has(id)) : allChannels;
        if (selected) send(`Using ${channels.length} selected channels (${allChannels.length - channels.length} excluded).`);

        send("Resolving upload playlists...");
        const uploadsMap = await getUploadsPlaylists(youtube, channels, cache);
        send(`Upload playlists resolved.`);
        sendQuota();

        let vids = [];
        for (let i = 0; i < channels.length; i++) {
          try {
            const uploads = uploadsMap[channels[i]];
            if (!uploads) continue;
            const videos = await getVideos(youtube, uploads, cache);
            videos.forEach(v => {
              const d = new Date(v.publishedAt);
              if (d >= start && d <= end) vids.push({ id: v.id, publishedAt: v.publishedAt });
            });
            if ((i + 1) % 10 === 0 || i === channels.length - 1) {
              send(`Scanned ${i + 1}/${channels.length} channels (${vids.length} videos so far)`);
              sendQuota();
            }
          } catch (e) {
            if (isQuotaError(e)) {
              send(`Quota exceeded after processing ${i}/${channels.length} channels. Progress saved — rerun to resume.`);
              saveProgress({ title, startDate: start.toISOString(), endDate: end.toISOString(), phase: "scanning", scannedIndex: i, vids: vids.map(v => v.id), playlistId: null, filtered: null, added: [] });
              res.end();
              return;
            }
          }
        }

        send(`Total videos in date range: ${vids.length}`);
        const filterShorts = req.query.filterShorts !== "0";
        if (filterShorts) {
          send("Fetching durations to filter Shorts...");
          const vidIds = vids.map(v => v.id);
          const durations = await getDurations(youtube, vidIds, cache);
          vids = vids.filter(v => durations[v.id] > 120);
        }
        vids.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
        filtered = vids.map(v => v.id);
        send(filterShorts
          ? `After Shorts filter: ${filtered.length} videos (sorted oldest first)`
          : `${filtered.length} videos (sorted oldest first, Shorts included)`);
        sendQuota();

        send(`Creating playlist "${title}"...`);
        pid = await createPlaylist(youtube, title);
        addedSet = new Set();
        send(`Playlist created (${pid}). Adding ${filtered.length} videos...`);
        sendQuota();

        saveProgress({ title, startDate: start.toISOString(), endDate: end.toISOString(), phase: "adding", playlistId: pid, filtered, added: [] });
      }

      let addCount = addedSet ? addedSet.size : 0;
      for (let i = 0; i < filtered.length; i++) {
        if (addedSet.has(filtered[i])) continue;
        try {
          await addToPlaylist(youtube, pid, filtered[i]);
          addedSet.add(filtered[i]);
          addCount++;
          sendQuota();
          if (addCount % 10 === 0 || addCount === filtered.length) {
            send(`Added ${addCount}/${filtered.length}`);
            saveProgress({ title, startDate: start.toISOString(), endDate: end.toISOString(), phase: "adding", playlistId: pid, filtered, added: [...addedSet] });
          }
        } catch (e) {
          if (isQuotaError(e)) {
            saveProgress({ title, startDate: start.toISOString(), endDate: end.toISOString(), phase: "adding", playlistId: pid, filtered, added: [...addedSet] });
            send(`Quota exceeded at ${addCount}/${filtered.length}. Progress saved — rerun tomorrow to continue.`);
            res.end();
            return;
          }
          send(`Failed to add video ${filtered[i]}: ${e.message}`);
        }
      }

      clearProgress();
      send(`Done! Playlist created with ${addCount} videos.`);
      const finalQ = getQuota();
      send(`QUOTA:Run complete \u2014 ${finalQ.used}/${DAILY_LIMIT} quota units used today`);
      send(`PLAYLIST_URL:https://www.youtube.com/playlist?list=${pid}`);
    } catch (err) {
      if (isQuotaError(err)) {
        send("Quota exceeded. Progress has been saved — rerun when quota resets (midnight Pacific).");
      } else {
        send("Error: " + err.message);
      }
    }

    res.end();
  });
}

module.exports = registerRoutes;
