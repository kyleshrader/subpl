const path = require("path");
const express = require("express");
const { PORT } = require("./config");
const registerAuthRoutes = require("./routes/auth");
const registerPlaylistRoutes = require("./routes/playlist");

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

registerAuthRoutes(app);
registerPlaylistRoutes(app);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});