const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const morgan = require("morgan");
const Database = require("better-sqlite3");

const DEFAULT_PORT = Number(process.env.PORT || 8000);
const DEFAULT_SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";
const DEFAULT_DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "shop.db");
const DEFAULT_ATTACKER_URL = process.env.ATTACKER_URL || "http://localhost:5000";
const DEFAULT_FILES_ROOT =
  process.env.FILES_ROOT || path.join(__dirname, "..", "files");

function openDb(databasePath) {
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function initDb(db) {
  // Rebuild for reproducible hands-on state on each process boot.
  db.exec(`
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS users;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT NOT NULL,
      secret_note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_yen INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      image_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_yen INTEGER NOT NULL,
      total_yen INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (productCount === 0) {
    const ins = db.prepare(
      "INSERT INTO products (name, description, price_yen) VALUES (?, ?, ?)"
    );
    ins.run("Coffee Beans", "香り高いコーヒー豆（200g）", 1200);
    ins.run("Drip Bag", "手軽に飲めるドリップバッグ（10袋）", 980);
    ins.run("Mug Cup", "ロゴ入りマグカップ", 1500);
  }

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount === 0) {
    const ins = db.prepare(
      "INSERT INTO users (username, password, email, secret_note) VALUES (?, ?, ?, ?)"
    );
    ins.run("alice", "password123", "alice@example.com", "alice_secret_001");
    ins.run("bob", "password123", "bob@example.com", "bob_secret_002");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function createApp(options) {
  const config = Object.assign(
    {
      sessionSecret: DEFAULT_SESSION_SECRET,
      databasePath: DEFAULT_DATABASE_PATH,
      attackerUrl: DEFAULT_ATTACKER_URL,
      filesRoot: DEFAULT_FILES_ROOT,
      logger: morgan("dev")
    },
    options || {}
  );

  const db = config.db || openDb(config.databasePath);
  ensureDir(config.filesRoot);
  if (!config.skipInitDb) {
    initDb(db);
  }

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  if (config.logger) {
    app.use(config.logger);
  }
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        sameSite: "lax",
        httpOnly: false
      }
    })
  );

  app.use((req, res, next) => {
    let currentUser = null;
    if (req.session.userId) {
      currentUser = db
        .prepare("SELECT id, username, email FROM users WHERE id = ?")
        .get(req.session.userId);
    }
    res.locals.currentUser = currentUser;
    next();
  });

  function requireLogin(req, res, next) {
    if (!req.session.userId) {
      return res.redirect("/login");
    }
    next();
  }

  app.get("/", (req, res) => {
    res.render("home", { currentUser: res.locals.currentUser });
  });

  app.get("/hands-on", (req, res) => {
    res.render("hands_on", {
      currentUser: res.locals.currentUser,
      attackerUrl: config.attackerUrl + "/csrf",
      attackerCollectorUrl: config.attackerUrl + "/collect",
      attackerSessionHijackUrl: config.attackerUrl + "/session-hijack",
      attackerClickjackingUrl: config.attackerUrl + "/clickjacking"
    });
  });

  app.get("/register", (req, res) => {
    res.render("register", { error: null, currentUser: res.locals.currentUser });
  });

  app.post("/register", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;

    try {
      db.prepare(
        "INSERT INTO users (username, password, email, secret_note) VALUES (?, ?, ?, ?)"
      ).run(username, password, email, "secret_for_" + username);
      return res.redirect("/login");
    } catch (e) {
      return res
        .status(400)
        .render("register", { error: String(e), currentUser: res.locals.currentUser });
    }
  });

  app.get("/login", (req, res) => {
    res.render("login", { error: null, currentUser: res.locals.currentUser });
  });

  app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const sql =
      "SELECT id, username FROM users WHERE username = '" +
      username +
      "' AND password = '" +
      password +
      "'";

    const user = db.prepare(sql).get();
    if (!user) {
      return res
        .status(401)
        .render("login", { error: "ログイン失敗（またはSQLiを試してみてください）", currentUser: null });
    }

    req.session.userId = user.id;
    return res.redirect("/products");
  });

  app.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  app.get("/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products ORDER BY id").all();
    res.render("products", { products: products, currentUser: res.locals.currentUser });
  });

  app.get("/products/:id", (req, res) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(req.params.id);
    if (!product) {
      return res.status(404).send("Not Found");
    }

    const comments = db
      .prepare(
        `
        SELECT c.id, c.body, c.image_path, c.created_at, u.username
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.product_id = ?
        ORDER BY c.id DESC
      `
      )
      .all(product.id);

    res.render("product_detail", {
      product: product,
      comments: comments,
      currentUser: res.locals.currentUser
    });
  });

  app.post("/products/:id/comments", requireLogin, (req, res) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(req.params.id);
    if (!product) {
      return res.status(404).send("Not Found");
    }

    const body = req.body.body || "";
    const imagePath = req.body.image_path || "";
    db.prepare(
      "INSERT INTO comments (product_id, user_id, body, image_path, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(product.id, req.session.userId, body, imagePath, nowIso());

    res.redirect("/products/" + product.id);
  });

  app.get("/comment-images/:commentId", (req, res) => {
    const comment = db
      .prepare("SELECT id, image_path FROM comments WHERE id = ?")
      .get(req.params.commentId);
    if (!comment || !comment.image_path) {
      return res.status(404).send("Not Found");
    }

    // Directory traversal vulnerability: stored path is trusted as-is.
    const filePath = path.join(config.filesRoot, comment.image_path);
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(error.statusCode || 404).send("Not Found");
      }
    });
  });

  app.get("/search", (req, res) => {
    const q = req.query.q || "";
    if (!q) {
      return res.render("search", {
        q: q,
        results: null,
        sql: null,
        currentUser: res.locals.currentUser
      });
    }

    const sql =
      "SELECT id, name, description, price_yen FROM products WHERE name LIKE '%" +
      q +
      "%' OR description LIKE '%" +
      q +
      "%' ORDER BY id";

    let results = [];
    try {
      results = db.prepare(sql).all();
    } catch (e) {
      results = [
        {
          id: "ERROR",
          name: String(e),
          description: "",
          price_yen: 0
        }
      ];
    }

    res.render("search", {
      q: q,
      results: results,
      sql: sql,
      currentUser: res.locals.currentUser
    });
  });

  app.get("/purchase/:productId", requireLogin, (req, res) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(req.params.productId);
    if (!product) {
      return res.status(404).send("Not Found");
    }
    res.render("purchase", { product: product, currentUser: res.locals.currentUser });
  });

  function createOrderFromParams(params) {
    const createdAt = nowIso();
    const info = db
      .prepare(
        `
        INSERT INTO orders (user_id, product_id, quantity, unit_price_yen, total_yen, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        params.userId,
        params.productId,
        params.quantity,
        params.unitPrice,
        params.total,
        params.note || null,
        createdAt
      );

    return db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid);
  }

  app.post("/purchase", requireLogin, (req, res) => {
    const productId = Number(req.body.product_id);
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    if (!product) {
      return res.status(404).send("Not Found");
    }

    const quantityRaw = parseInt(req.body.quantity, 10);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

    const unitPriceRaw = Number(req.body.unit_price_yen);
    const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : product.price_yen;
    const totalRaw = Number(req.body.total_yen);
    const total = Number.isFinite(totalRaw) ? totalRaw : unitPrice * quantity;
    const note = req.body.note || "";

    const order = createOrderFromParams({
      userId: req.session.userId,
      productId: productId,
      quantity: quantity,
      unitPrice: unitPrice,
      total: total,
      note: note
    });

    res.render("order_done", { order: order, currentUser: res.locals.currentUser });
  });

  app.get("/orders", requireLogin, (req, res) => {
    const orders = db
      .prepare(
        `
        SELECT o.*, p.name AS product_name
        FROM orders o
        JOIN products p ON p.id = o.product_id
        WHERE o.user_id = ?
        ORDER BY o.id DESC
      `
      )
      .all(req.session.userId);

    res.render("orders", { orders: orders, currentUser: res.locals.currentUser });
  });

  app.locals.db = db;
  app.locals.config = config;

  return { app: app, db: db };
}

function startServer(options) {
  const config = Object.assign({ port: DEFAULT_PORT, host: undefined }, options || {});
  const created = createApp(config);
  const server = created.app.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log("[shop] listening on http://localhost:" + config.port);
    // eslint-disable-next-line no-console
    console.log("[shop] db: " + config.databasePath);
  });
  return { app: created.app, db: created.db, server: server };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp: createApp,
  initDb: initDb,
  nowIso: nowIso,
  openDb: openDb,
  startServer: startServer
};
