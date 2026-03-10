const assert = require("assert");
const http = require("http");

const { startServer } = require("../server");

function makeRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: pathname,
        method: "GET"
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function withTargetServer(handler, run) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try {
        await run(server);
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

async function withServer(run) {
  const started = startServer({ port: 0, host: "127.0.0.1", logger: null });
  try {
    await new Promise((resolve, reject) => {
      if (started.server.listening) {
        resolve();
        return;
      }
      started.server.once("listening", resolve);
      started.server.once("error", reject);
    });
    await run(started.server.address().port);
  } finally {
    if (!started.server.listening) {
      return;
    }
    await new Promise((resolve, reject) => {
      started.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function testTopPageShowsSessionHijackEntry() {
  await withServer(async (port) => {
    const response = await makeRequest(port, "/");
    assert.strictEqual(response.statusCode, 200);
    assert(response.body.includes("セッションハイジャック"));
    assert(response.body.includes("/session-hijack"));
    assert(response.body.includes("クリックジャッキング"));
    assert(response.body.includes("/clickjacking"));
  });
}

async function testClickjackingPageShowsEmbeddedPurchaseTarget() {
  await withServer(async (port) => {
    const response = await makeRequest(port, "/clickjacking");
    assert.strictEqual(response.statusCode, 200);
    assert(response.body.includes("Clickjacking Demo"));
    assert(response.body.includes("本物の Shop を見せたまま"));
    assert(response.body.includes("偽UIレイヤー"));
    assert(response.body.includes("本物の Shop 画面"));
    assert(
      response.body.includes("http://localhost:8000/purchase/1") ||
        response.body.includes("http:\\/\\/localhost:8000\\/purchase\\/1")
    );
  });
}

async function testCollectAndSessionHijackPageShowStolenCookie() {
  await withServer(async (port) => {
    const collected = await makeRequest(port, "/collect?cookie=connect.sid%3Ddemo123");
    assert.strictEqual(collected.statusCode, 204);

    const page = await makeRequest(port, "/session-hijack");
    assert.strictEqual(page.statusCode, 200);
    assert(page.body.includes("connect.sid=demo123"));
    assert(page.body.includes("盗まれたCookie"));
  });
}

async function testReplayFlow() {
  let seenCookie = "";
  let seenPath = "";

  await withTargetServer((req, res) => {
    seenCookie = req.headers.cookie || "";
    seenPath = req.url;
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<h1>注文履歴</h1><div>alice_secret_order</div>");
  }, async (targetServer) => {
    const targetPort = targetServer.address().port;
    const started = startServer({
      port: 0,
      host: "127.0.0.1",
      logger: null,
      targetBase: "http://127.0.0.1:" + targetPort
    });

    try {
      await new Promise((resolve, reject) => {
        if (started.server.listening) {
          resolve();
          return;
        }
        started.server.once("listening", resolve);
        started.server.once("error", reject);
      });

      const port = started.server.address().port;
      const collected = await makeRequest(port, "/collect?cookie=connect.sid%3Dstolen-cookie");
      assert.strictEqual(collected.statusCode, 204);

      const page = await makeRequest(port, "/session-hijack");
      assert(page.body.includes("/replay?path=%2Forders"));

      const replay = await makeRequest(port, "/replay?path=%2Forders");
      assert.strictEqual(replay.statusCode, 200);
      assert(replay.body.includes("alice_secret_order"));
      assert.strictEqual(seenCookie, "connect.sid=stolen-cookie");
      assert.strictEqual(seenPath, "/orders");
    } finally {
      await new Promise((resolve, reject) => {
        started.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
}

async function run() {
  await testTopPageShowsSessionHijackEntry();
  await testClickjackingPageShowsEmbeddedPurchaseTarget();
  await testCollectAndSessionHijackPageShowStolenCookie();
  await testReplayFlow();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
