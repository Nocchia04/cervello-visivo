import assert from "assert";
import path from "path";
import { resolveSafe } from "./importJobs.js";

const base = path.resolve("/tmp/hb-import-abc");

// path normali → ok, dentro base
assert.strictEqual(resolveSafe(base, "primo piano/scena 0/a.jpg"), path.join(base, "primo piano/scena 0/a.jpg"));
assert.strictEqual(resolveSafe(base, "x (floor plan).png"), path.join(base, "x (floor plan).png"));

// zip slip → deve lanciare
assert.throws(() => resolveSafe(base, "../evil.txt"), /zip slip/i);
assert.throws(() => resolveSafe(base, "a/../../evil.txt"), /zip slip/i);
assert.throws(() => resolveSafe(base, "/etc/passwd"), /zip slip/i);

console.log("OK importJobs (zip-slip)");
