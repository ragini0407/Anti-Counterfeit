import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scanner = readFileSync(fileURLToPath(new URL("../src/ConsumerScanner.jsx", import.meta.url)), "utf8");
const styles = readFileSync(fileURLToPath(new URL("../src/ConsumerScanner.css", import.meta.url)), "utf8");

test("consumer verification offers QR camera, manual code lookup, gallery and camera photo selection", () => {
  assert.match(scanner, /Start Scanner/);
  assert.match(scanner, /verify-code\/\$\{encodeURIComponent\(code\)\}/);
  assert.match(scanner, /Choose from gallery/);
  assert.match(scanner, /Take a photo/);
  assert.match(scanner, /capture="environment"/);
  assert.match(scanner, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test("customer image picker enforces the five-megabyte limit and separates AI from registry status", () => {
  assert.match(scanner, /MAX_IMAGE_SIZE = 5 \* 1024 \* 1024/);
  assert.match(scanner, /file\.size > MAX_IMAGE_SIZE/);
  assert.match(scanner, /AI image analysis/);
  assert.match(scanner, /UNAVAILABLE — the uploaded image was not classified/);
  assert.match(scanner, /Saved product record matched active registry/);
  assert.match(scanner, /does not itself prove registration or authenticity/);
});

test("manual lookup and upload controls retain touch-friendly mobile layouts", () => {
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.consumer-image-actions \.consumer-upload-button/);
  assert.match(styles, /\.consumer-manual-lookup-controls input/);
});
