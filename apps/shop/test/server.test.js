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
  const sampleDir = path.join(filesDir, "samples");
  const srcDir = path.join(tempRoot, "src");

  fs.mkdirSync(sampleDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(sampleDir, "coffee.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="8" y="24">coffee</text></svg>\n',
    "utf8"
  );
  fs.writeFileSync(
    path.join(srcDir, "server.js"),
    "sensitive server source fixture\n",
    "utf8"
  );

  const started = startServer({
    attackerUrl: "http://localhost:9000",
    databasePath: databasePath,
    filesRoot: filesDir,
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
    const imageCommentResponse = await sendRequest(started.server, {
      method: "POST",
      path: "/products/1/comments",
      headers: {
        cookie: cookie
      },
      body: {
        body: "sample image",
        image_path: "samples/coffee.svg"
      }
    });
    assert.strictEqual(imageCommentResponse.statusCode, 302);

    const productResponse = await sendRequest(started.server, {
      path: "/products/1",
      headers: {
        cookie: cookie
      }
    });
    assert.strictEqual(productResponse.statusCode, 200);
    assert.notStrictEqual(
      productResponse.body.indexOf(Buffer.from("/comment-images/1")),
      -1
    );

    const imageResponse = await sendRequest(started.server, {
      path: "/comment-images/1"
    });
    assert.strictEqual(imageResponse.statusCode, 200);
    assert.notStrictEqual(
      imageResponse.body.indexOf(Buffer.from("<svg")),
      -1
    );

    const traversalResponse = await sendRequest(started.server, {
      method: "POST",
      path: "/products/1/comments",
      headers: {
        cookie: cookie
      },
      body: {
        body: "read source",
        image_path: "../src/server.js"
      }
    });
    assert.strictEqual(traversalResponse.statusCode, 302);

    const leakedResponse = await sendRequest(started.server, {
      path: "/comment-images/2"
    });
    assert.strictEqual(leakedResponse.statusCode, 200);
    assert.notStrictEqual(
      leakedResponse.body.indexOf(Buffer.from("sensitive server source fixture")),
      -1
    );

    const xssCommentResponse = await sendRequest(started.server, {
      method: "POST",
      path: "/products/1/comments",
      headers: {
        cookie: cookie
      },
      body: {
        body: "<script>alert('xss')</script>",
        image_path: ""
      }
    });
    assert.strictEqual(xssCommentResponse.statusCode, 302);

    const xssResponse = await sendRequest(started.server, {
      path: "/products/1",
      headers: {
        cookie: cookie
      }
    });
    assert.strictEqual(xssResponse.statusCode, 200);
    assert.notStrictEqual(
      xssResponse.body.indexOf(Buffer.from("<script>alert('xss')</script>")),
      -1
    );

    const handsOnResponse = await sendRequest(started.server, {
      path: "/hands-on",
      headers: {
        cookie: cookie
      }
    });
    assert.strictEqual(handsOnResponse.statusCode, 200);
    assert.notStrictEqual(
      handsOnResponse.body.indexOf(Buffer.from("体験⑤ クリックジャッキング")),
      -1
    );
    assert.notStrictEqual(
      handsOnResponse.body.indexOf(Buffer.from("http://localhost:9000/clickjacking")),
      -1
    );
    assert.notStrictEqual(
      handsOnResponse.body.indexOf(Buffer.from("体験⑦ ディレクトリ・トラバーサル")),
      -1
    );

    const purchaseResponse = await sendRequest(started.server, {
      path: "/purchase/1",
      headers: {
        cookie: cookie
      }
    });
    assert.strictEqual(purchaseResponse.statusCode, 200);
    assert.strictEqual(purchaseResponse.headers["x-frame-options"], undefined);
    assert.strictEqual(
      purchaseResponse.headers["content-security-policy"],
      undefined
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
