const fs = require("fs");
const { google } = require("googleapis");
const { CREDENTIALS_PATH, REDIRECT_URI, TOKEN_PATH } = require("./config");

function getOAuth2Client() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content).web;
  const { client_secret, client_id } = credentials;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
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

module.exports = { getOAuth2Client, isAuthenticated };
