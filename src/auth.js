const fs = require("fs");
const { google } = require("googleapis");
const { CREDENTIALS_PATH, REDIRECT_URI, TOKEN_PATH } = require("./config");

function getOAuth2Client() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content).web;
  const { client_secret, client_id } = credentials;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

function getAuthenticatedClient() {
  const client = getOAuth2Client();
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  client.setCredentials(token);
  client.on("tokens", (newTokens) => {
    console.log("Token refreshed:", newTokens.access_token ? "new access_token received" : "no access_token");
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const merged = { ...existing, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
  });
  return client;
}

function isAuthenticated() {
  if (!fs.existsSync(TOKEN_PATH)) return false;
  try {
    JSON.parse(fs.readFileSync(TOKEN_PATH));
    return true;
  } catch {
    return false;
  }
}

module.exports = { getOAuth2Client, getAuthenticatedClient, isAuthenticated };
