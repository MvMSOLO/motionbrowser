import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "public/motion");

test("motion asset manifest matches files, hashes, ids, and licenses", () => {
  const manifest = JSON.parse(readFileSync(join(root, "manifest/asset-manifest.json"), "utf8"));
  const licenses = readFileSync(join(root, "manifest/ASSET_LICENSES.md"), "utf8");
  assert.ok(Array.isArray(manifest.assets));
  assert.ok(manifest.assets.length > 0);
  const ids = new Set();
  for (const asset of manifest.assets) {
    assert.equal(ids.has(asset.id), false, `duplicate ${asset.id}`);
    ids.add(asset.id);
    assert.ok(licenses.includes(asset.licenseId), asset.licenseId);
    const file = join(root, asset.path);
    assert.equal(existsSync(file), true, asset.path);
    const buf = readFileSync(file);
    assert.ok(buf.length > 0, asset.path);
    assert.equal(buf.length, asset.bytes, asset.path);
    const hash = `sha256-${createHash("sha256").update(buf).digest("hex")}`;
    assert.equal(hash, asset.integrity, asset.path);
    if (asset.path.endsWith(".json")) JSON.parse(buf.toString("utf8"));
    if (asset.path.endsWith(".glb")) assert.equal(buf.subarray(0, 4).toString("utf8"), "glTF", asset.path);
  }
});
