const path = require("path");

// Directory holding runtime state + secrets. Defaults to the cwd so local
// `yarn dev` is unchanged; in Docker it points at a mounted volume.
const DATA_DIR = process.env.DATA_DIR || ".";

const TOKEN_PATH = path.join(DATA_DIR, "token.json");
const CREDENTIALS_PATH = path.join(DATA_DIR, "client_secret.json");
const CACHE_PATH = path.join(DATA_DIR, "cache.json");
const PROGRESS_PATH = path.join(DATA_DIR, "progress.json");
const QUOTA_PATH = path.join(DATA_DIR, "quota.json");
const PORT = parseInt(process.env.PORT, 10) || parseInt(process.argv[2], 10) || 3000;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;

module.exports = { TOKEN_PATH, CREDENTIALS_PATH, CACHE_PATH, PROGRESS_PATH, QUOTA_PATH, PORT, REDIRECT_URI };
