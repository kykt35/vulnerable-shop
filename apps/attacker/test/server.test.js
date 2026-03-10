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

async function run() {
  await testTopPageShowsSessionHijackEntry();
  await testCollectAndSessionHijackPageShowStolenCookie();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
