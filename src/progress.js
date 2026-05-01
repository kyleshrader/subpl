const fs = require("fs");
const { PROGRESS_PATH } = require("./config");

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_PATH)); } catch {}
  }
  return null;
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
}

function clearProgress() {
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
}

module.exports = { loadProgress, saveProgress, clearProgress };
