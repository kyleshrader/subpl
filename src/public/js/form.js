// Populate year select dynamically
(function () {
  const sel = document.getElementById("yearSelect");
  for (let i = 0; i < 10; i++) {
    const y = new Date().getFullYear() - i;
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === new Date().getFullYear()) opt.selected = true;
    sel.appendChild(opt);
  }
})();

function toLocalDatetime(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Default range dates: today 00:00 to now
(function () {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  document.getElementById("startDate").value = toLocalDatetime(todayStart);
  document.getElementById("endDate").value = toLocalDatetime(now);
})();

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function attachVideoPicker(btn) {
  const targetId = btn.dataset.target;
  const direction = btn.dataset.direction === "after" ? 60_000 : -60_000;
  const input = document.getElementById(targetId);
  const hint = document.querySelector(`.hint[data-hint-for="${targetId}"]`);
  if (!input) return;
  const defaultHint = hint ? hint.textContent : "";
  let videoMode = false;
  let savedDate = "";

  function setHint(text) { if (hint) hint.textContent = text; }

  function enterVideoMode() {
    savedDate = input.value;
    input.type = "text";
    input.value = "";
    input.placeholder = "Paste YouTube URL or video ID, then press Enter";
    input.focus();
    btn.classList.add("active");
    btn.title = "Cancel";
    setHint("Paste a video URL/ID and submit to use its publish date.");
    videoMode = true;
  }

  function exitVideoMode(restore) {
    input.type = "datetime-local";
    input.placeholder = "";
    if (restore) { input.value = savedDate; setHint(defaultHint); }
    btn.classList.remove("active");
    btn.title = "Use a video's publish date";
    videoMode = false;
  }

  async function submitVideo() {
    const id = extractVideoId(input.value);
    if (!id) { setHint("Could not parse a video ID from that input."); return; }
    input.disabled = true;
    btn.disabled = true;
    setHint("Fetching video info...");
    try {
      const res = await fetch("/video-info?id=" + encodeURIComponent(id));
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(res.status === 404 ? "Route not found — restart the server" : `HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || "Failed");
      const target = new Date(new Date(data.publishedAt).getTime() + direction);
      exitVideoMode(false);
      input.value = toLocalDatetime(target);
      setHint(`Including "${data.title}" by ${data.channelTitle}.`);
      updateTitle();
    } catch (e) {
      setHint("Error: " + e.message);
    } finally {
      input.disabled = false;
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", () => {
    if (videoMode) exitVideoMode(true);
    else enterVideoMode();
  });

  input.addEventListener("keydown", (e) => {
    if (videoMode && e.key === "Enter") { e.preventDefault(); submitVideo(); }
    else if (videoMode && e.key === "Escape") { e.preventDefault(); exitVideoMode(true); }
  });
}

document.querySelectorAll(".video-picker-btn").forEach(attachVideoPicker);

function fmt(d) {
  return (
    (d.getMonth() + 1).toString().padStart(2, "0") +
    "/" +
    d.getDate().toString().padStart(2, "0")
  );
}

function getDateRange() {
  const mode = document.getElementById("modeInput").value;
  let start, end;
  if (mode === "range") {
    start = new Date(document.querySelector("[name=startDate]").value);
    end = new Date(document.querySelector("[name=endDate]").value);
  } else if (mode === "since") {
    start = new Date(document.querySelector("[name=sinceDate]").value);
    end = new Date();
  } else if (mode === "days") {
    const days = parseInt(document.querySelector("[name=days]").value) || 30;
    end = new Date();
    start = new Date();
    start.setDate(start.getDate() - days);
  } else if (mode === "year") {
    const y = parseInt(document.querySelector("[name=year]").value);
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31);
  } else if (mode === "month") {
    const [y, m] = document
      .querySelector("[name=month]")
      .value.split("-")
      .map(Number);
    start = new Date(y, m - 1, 1);
    end = new Date(y, m, 0);
  }
  return { start, end };
}

function updateTitle() {
  const { start, end } = getDateRange();
  if (start && end && !isNaN(start) && !isNaN(end)) {
    document.getElementById("titleInput").value =
      "Subscriptions " + fmt(start) + " - " + fmt(end);
  }
}

const tabs = document.querySelectorAll("#modeTabs button");
const modeInput = document.getElementById("modeInput");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    modeInput.value = mode;
    document
      .querySelectorAll(".mode-fields")
      .forEach((f) => f.classList.remove("active"));
    document.getElementById("fields-" + mode).classList.add("active");
    updateTitle();
  });
});
document
  .querySelectorAll(
    "input[type=datetime-local],input[type=month],input[type=number],select[name=year]"
  )
  .forEach((el) => {
    el.addEventListener("change", updateTitle);
    el.addEventListener("input", updateTitle);
  });
updateTitle();

// Check for resumable progress
fetch("/progress")
  .then((r) => r.json())
  .then((p) => {
    if (!p) return;
    const banner = document.getElementById("resumeBanner");
    const info = document.getElementById("resumeInfo");
    if (p.phase === "adding" && p.total) {
      info.textContent =
        '"' + p.title + '" — ' + p.added + "/" + p.total + " videos added.";
    } else {
      info.textContent =
        '"' + p.title + '" — paused during channel scanning.';
    }
    banner.style.display = "block";
  });

// Channel selection + Collections
(function () {
  let allChannels = [];
  let collections = [];
  let activeCollectionId = null;

  const list = document.getElementById("channelList");
  const countEl = document.getElementById("channelCount");
  const filterInput = document.getElementById("channelFilter");
  const collectionSelect = document.getElementById("collectionSelect");

  function updateCount() {
    const checked = list.querySelectorAll('input[type="checkbox"]:checked').length;
    countEl.textContent = "(" + checked + "/" + allChannels.length + ")";
  }

  function renderChannels(filter) {
    const lc = (filter || "").toLowerCase();
    list.innerHTML = "";
    allChannels.forEach((ch) => {
      if (lc && !ch.title.toLowerCase().includes(lc)) return;
      const div = document.createElement("div");
      div.className = "channel-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "ch-" + ch.id;
      cb.value = ch.id;
      cb.checked = ch.selected;
      cb.addEventListener("change", () => {
        ch.selected = cb.checked;
        updateCount();
        saveSelection();
      });
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      const link = document.createElement("a");
      link.href = "https://www.youtube.com/channel/" + ch.id;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = ch.title;
      lbl.appendChild(link);
      div.appendChild(cb);
      div.appendChild(lbl);
      list.appendChild(div);
    });
    updateCount();
  }

  function saveSelection() {
    const selected = allChannels.filter((c) => c.selected).map((c) => c.id);
    const body =
      selected.length === allChannels.length
        ? { selectedChannels: null }
        : { selectedChannels: selected };
    fetch("/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function getSelectedIds() {
    return allChannels.filter((c) => c.selected).map((c) => c.id);
  }

  function applyCollection(col) {
    const selSet = new Set(col.channels);
    allChannels.forEach((c) => { c.selected = selSet.has(c.id); });
    renderChannels(filterInput.value);
    saveSelection();
  }

  function renderCollections() {
    const current = collectionSelect.value;
    collectionSelect.innerHTML = '<option value="">— collections —</option>';
    collections.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      collectionSelect.appendChild(opt);
    });
    // restore selection if still valid
    if (activeCollectionId && collections.find((c) => c.id === activeCollectionId)) {
      collectionSelect.value = activeCollectionId;
    } else if (current && collections.find((c) => c.id === current)) {
      collectionSelect.value = current;
    }
  }

  document.getElementById("loadCollection").addEventListener("click", () => {
    const id = collectionSelect.value;
    if (!id) return;
    const col = collections.find((c) => c.id === id);
    if (!col) return;
    activeCollectionId = id;
    applyCollection(col);
  });

  document.getElementById("saveAsNew").addEventListener("click", () => {
    const name = prompt("Collection name:");
    if (!name || !name.trim()) return;
    const channels = getSelectedIds();
    fetch("/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), channels }),
    })
      .then((r) => r.json())
      .then((col) => {
        if (col.error) { alert(col.error); return; }
        collections.push(col);
        activeCollectionId = col.id;
        renderCollections();
      });
  });

  document.getElementById("updateCollection").addEventListener("click", () => {
    const id = collectionSelect.value;
    if (!id) { alert("Select a collection first."); return; }
    const channels = getSelectedIds();
    fetch("/collections/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels }),
    })
      .then((r) => r.json())
      .then((col) => {
        if (col.error) { alert(col.error); return; }
        const idx = collections.findIndex((c) => c.id === id);
        if (idx !== -1) collections[idx] = col;
        renderCollections();
      });
  });

  document.getElementById("renameCollection").addEventListener("click", () => {
    const id = collectionSelect.value;
    if (!id) { alert("Select a collection first."); return; }
    const col = collections.find((c) => c.id === id);
    const name = prompt("New name:", col ? col.name : "");
    if (!name || !name.trim()) return;
    fetch("/collections/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => r.json())
      .then((updated) => {
        if (updated.error) { alert(updated.error); return; }
        const idx = collections.findIndex((c) => c.id === id);
        if (idx !== -1) collections[idx] = updated;
        renderCollections();
      });
  });

  document.getElementById("deleteCollection").addEventListener("click", () => {
    const id = collectionSelect.value;
    if (!id) { alert("Select a collection first."); return; }
    const col = collections.find((c) => c.id === id);
    if (!confirm('Delete collection "' + (col ? col.name : id) + '"?')) return;
    fetch("/collections/" + id, { method: "DELETE" })
      .then((r) => r.json())
      .then((result) => {
        if (result.error) { alert(result.error); return; }
        collections = collections.filter((c) => c.id !== id);
        if (activeCollectionId === id) activeCollectionId = null;
        renderCollections();
      });
  });

  // Load channels and collections in parallel
  Promise.all([
    fetch("/channels").then((r) => r.json()),
    fetch("/collections").then((r) => r.json()),
  ]).then(([channelData, colData]) => {
    collections = colData.collections || [];
    renderCollections();

    if (!channelData.channels || !channelData.channels.length) {
      countEl.textContent = "(no subscriptions cached yet)";
      return;
    }
    const selSet = channelData.selectedChannels
      ? new Set(channelData.selectedChannels)
      : null;
    allChannels = channelData.channels.map((ch) => ({
      ...ch,
      selected: selSet ? selSet.has(ch.id) : true,
    }));
    renderChannels("");
  });

  filterInput.addEventListener("input", () => {
    renderChannels(filterInput.value);
  });

  document.getElementById("selectAll").addEventListener("click", () => {
    allChannels.forEach((c) => (c.selected = true));
    renderChannels(filterInput.value);
    saveSelection();
  });

  document.getElementById("selectNone").addEventListener("click", () => {
    allChannels.forEach((c) => (c.selected = false));
    renderChannels(filterInput.value);
    saveSelection();
  });
})();

// Log filtering
const outputLines = [];
const quotaLines = [];
let activeLog = "output";

function renderLog() {
  const status = document.getElementById("status");
  const lines = activeLog === "quota" ? quotaLines : outputLines;
  status.textContent = lines.join("\n");
  status.scrollTop = status.scrollHeight;
}

function processChunk(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line) continue;
    const plMatch = line.match(/PLAYLIST_URL:(\S+)/);
    if (plMatch) { window.open(plMatch[1], "_blank"); continue; }
    if (line.startsWith("QUOTA:")) {
      quotaLines.push(line.slice(6));
    } else {
      outputLines.push(line);
    }
  }
  renderLog();
}

function clearLog() {
  outputLines.length = 0;
  quotaLines.length = 0;
  renderLog();
}

document.querySelectorAll("#logTabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#logTabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeLog = btn.dataset.log;
    renderLog();
  });
});

async function doResume() {
  const btn = document.querySelector("#resumeBanner button");
  btn.disabled = true;
  btn.textContent = "Resuming...";
  clearLog();
  outputLines.push("Resuming...");
  renderLog();
  document.getElementById("resumeBanner").style.display = "none";

  const res = await fetch("/run?resume=1");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    processChunk(decoder.decode(value));
  }
  btn.disabled = false;
  btn.textContent = "Resume";
}
window.doResume = doResume;

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Working...";
  clearLog();
  outputLines.push("Starting...");
  renderLog();

  const fd = new FormData(e.target);
  const params = new URLSearchParams();
  for (const [k, v] of fd) params.set(k, v);
  // Checkboxes are omitted from FormData when unchecked — set explicitly
  params.set("filterShorts", document.getElementById("filterShorts").checked ? "1" : "0");

  const res = await fetch("/run?" + params.toString());
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    processChunk(decoder.decode(value));
  }

  btn.disabled = false;
  btn.textContent = "Create Playlist";
});
