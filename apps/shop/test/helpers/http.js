const http = require("http");
const querystring = require("querystring");

function sendRequest(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const headers = Object.assign({}, options.headers || {});
    let body = options.body || null;

    if (body && !Buffer.isBuffer(body) && typeof body !== "string") {
      body = querystring.stringify(body);
      if (!headers["content-type"]) {
        headers["content-type"] = "application/x-www-form-urlencoded";
      }
    }

    if (body) {
      headers["content-length"] = Buffer.byteLength(body);
    }

    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        method: options.method || "GET",
        path: options.path,
        headers: headers
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

module.exports = {
  sendRequest: sendRequest
};
