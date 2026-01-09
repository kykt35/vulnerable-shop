const fs = require("fs");
const path = require("path");
const express = require("express");
const morgan = require("morgan");

const PORT = Number(process.env.PORT || 5000);
const TARGET_BASE = process.env.TARGET_BASE || "http://localhost:4000";

const app = express();
app.use(morgan("dev"));

function renderPage(filename) {
  const body = fs.readFileSync(path.join(__dirname, "public", filename), "utf8");
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Attacker Site</title>
  </head>
  <body>
    <script>
      window.__TARGET_BASE__ = ${JSON.stringify(TARGET_BASE)};
    </script>
    ${body}
  </body>
</html>`;
}

app.get("/", (req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(renderPage("index.html"));
});

app.get("/auto-purchase", (req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(renderPage("auto_purchase.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[attacker] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[attacker] TARGET_BASE=${TARGET_BASE}`);
});
