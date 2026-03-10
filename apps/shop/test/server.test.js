const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { startServer } = require("../src/server");
const { sendRequest } = require("./helpers/http");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vulnerable-shop-test-"));
}

function waitForListening(server) {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function run() {
  const tempRoot = createTempDir();
  const databasePath = path.join(tempRoot, "data", "shop.db");
  const filesDir = path.join(tempRoot, "files");

  fs.mkdirSync(filesDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "traversal-secret.txt"),
    "directory traversal fixture\n",
    "utf8"
  );

  const started = startServer({
    attackerUrl: "http://localhost:9000",
    databasePath: databasePath,
    logger: null,
    port: 0,
    host: "127.0.0.1"
  });
  await waitForListening(started.server);

  try {
    const homeResponse = await sendRequest(started.server, { path: "/" });
    assert.strictEqual(homeResponse.statusCode, 200);
    assert.notStrictEqual(homeResponse.body.indexOf(Buffer.from("Hands-on")), -1);

    const loginResponse = await sendRequest(started.server, {
      method: "POST",
      path: "/login",
      body: {
        username: "alice",
        password: "password123"
      }
    });
    assert.strictEqual(loginResponse.statusCode, 302);
    assert.strictEqual(loginResponse.headers.location, "/products");
    assert.ok(loginResponse.headers["set-cookie"]);

    const cookie = loginResponse.headers["set-cookie"][0].split(";")[0];
    const commentResponse = await sendRequest(started.server, {
      method: "POST",
      path: "/products/1/comments",
      headers: {
        cookie: cookie
      },
      body: {
        body: "<script>alert('xss')</script>"
      }
    });
    assert.strictEqual(commentResponse.statusCode, 302);

    const productResponse = await sendRequest(started.server, {
      path: "/products/1",
      headers: {
        cookie: cookie
      }
    });
    assert.strictEqual(productResponse.statusCode, 200);
    assert.notStrictEqual(
      productResponse.body.indexOf(Buffer.from("<script>alert('xss')</script>")),
      -1
    );
  } finally {
    started.server.close();
    started.db.close();
  }
}

run()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((error) => {
    process.stderr.write(String(error && error.stack ? error.stack : error) + "\n");
    process.exit(1);
  });
