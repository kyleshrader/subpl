const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { TOKEN_PATH } = require("../config");
const { getOAuth2Client, getAuthenticatedClient, isAuthenticated } = require("../auth");
const { loadCache, saveCache } = require("../cache");
const { loadProgress, clearProgress } = require("../progress");

const VIEWS_DIR = path.join(__dirname, "../views");

function registerRoutes(app) {
  app.get("/", (req, res) => {
    if (isAuthenticated()) {
      res.sendFile(path.join(VIEWS_DIR, "form.html"));
    } else {
      res.sendFile(path.join(VIEWS_DIR, "login.html"));
    }
  });

  app.get("/auth", (req, res) => {
    const client = getOAuth2Client();
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/youtube"],
    });
    res.redirect(url);
  });

  app.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code parameter");

    try {
      const client = getOAuth2Client();
      const { tokens } = await client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log("Token saved.");
      res.redirect("/");
    } catch (err) {
      console.error("Token exchange failed:", err.message);
      res.status(500).send("Authentication failed: " + err.message);
    }
  });

  app.get("/logout", (req, res) => {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
    res.redirect("/");
  });

  app.get("/progress", (req, res) => {
    const progress = loadProgress();
    if (!progress) return res.json(null);
    res.json({
      title: progress.title,
      phase: progress.phase,
      total: progress.filtered ? progress.filtered.length : null,
      added: progress.added ? progress.added.length : 0,
    });
  });

  app.get("/discard-progress", (req, res) => {
    clearProgress();
    res.redirect("/");
  });

  app.get("/channels", async (req, res) => {
    if (!isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const cache = loadCache();
    if (!cache.subscriptions) return res.json({ channels: [], selectedChannels: null });

    if (!cache.channelNames) cache.channelNames = {};
    const missing = cache.subscriptions.filter(id => !cache.channelNames[id]);
    if (missing.length > 0) {
      try {
        const client = getAuthenticatedClient();
        const youtube = google.youtube({ version: "v3", auth: client });
        for (let i = 0; i < missing.length; i += 50) {
          const chunk = missing.slice(i, i + 50);
          const r = await youtube.channels.list({ part: "snippet", id: chunk.join(",") });
          for (const item of (r.data.items || [])) {
            cache.channelNames[item.id] = item.snippet.title;
          }
        }
        saveCache(cache);
      } catch (e) {
        console.error("Failed to fetch channel names:", e.message);
      }
    }

    const channels = cache.subscriptions.map(id => ({
      id,
      title: cache.channelNames[id] || id,
    }));
    channels.sort((a, b) => a.title.localeCompare(b.title));
    res.json({ channels, selectedChannels: cache.selectedChannels });
  });

  app.post("/channels", (req, res) => {
    if (!isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const { selectedChannels } = req.body;
    if (selectedChannels !== null && !Array.isArray(selectedChannels)) {
      return res.status(400).json({ error: "Invalid selection" });
    }
    const cache = loadCache();
    cache.selectedChannels = selectedChannels;
    saveCache(cache);
    res.json({ ok: true });
  });
}

module.exports = registerRoutes;
