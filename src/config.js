const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "client_secret.json";
const CACHE_PATH = "cache.json";
const PROGRESS_PATH = "progress.json";
const PORT = parseInt(process.argv[2], 10) || 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

module.exports = { TOKEN_PATH, CREDENTIALS_PATH, CACHE_PATH, PROGRESS_PATH, PORT, REDIRECT_URI };
