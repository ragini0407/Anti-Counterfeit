const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

test("Multer creates and writes uploads to its absolute products directory", async () => {
  const previousCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anti-counterfeit-upload-"));
  const middlewarePath = require.resolve("../middleware/uploadMiddleware");
  let server;

  try {
    process.chdir(tempRoot);
    delete require.cache[middlewarePath];
    const upload = require(middlewarePath);
    const expectedDirectory = path.resolve(tempRoot, "uploads", "products");

    assert.equal(upload.PRODUCT_UPLOAD_DIRECTORY, expectedDirectory);
    assert.equal(path.isAbsolute(upload.PRODUCT_UPLOAD_DIRECTORY), true);
    assert.equal(fs.statSync(expectedDirectory).isDirectory(), true);

    const app = express();
    app.post("/upload", upload.single("referenceImage"), (req, res) => {
      res.status(200).json({
        destination: req.file.destination,
        path: req.file.path,
        filename: req.file.filename
      });
    });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });

    const form = new FormData();
    form.append("referenceImage", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "reference.jpeg");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/upload`, {
      method: "POST",
      body: form
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.destination, expectedDirectory);
    assert.equal(path.dirname(saved.path), expectedDirectory);
    assert.match(saved.filename, /^\d+-\d+\.jpeg$/);
    assert.deepEqual(fs.readFileSync(saved.path), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    process.chdir(previousCwd);
    delete require.cache[middlewarePath];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
