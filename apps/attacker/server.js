const express = require("express");
const morgan = require("morgan");

const PORT = Number(process.env.PORT || 5000);
const TARGET_BASE = process.env.TARGET_BASE || "http://localhost:4000";

const app = express();
app.use(morgan("dev"));

app.get("/", (req, res) => {
  const html = `<!doctype html>
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
    ${require("fs").readFileSync(__dirname + "/public/index.html", "utf8")}
  </body>
</html>`;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(html);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[attacker] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[attacker] TARGET_BASE=${TARGET_BASE}`);
});
