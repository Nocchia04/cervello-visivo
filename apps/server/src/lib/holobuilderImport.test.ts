import assert from "assert";
import {
  parseExportDate,
  parseFloorLevel,
  gridPosition,
  analyzeStructure,
  stripRootWrapper,
} from "./holobuilderImport.js";

// ── parseExportDate ──────────────────────────────────────────────────────────
assert.strictEqual(parseExportDate("Scene 0 (apr. 01, 2025).jpeg")!.getMonth(), 3);
assert.strictEqual(parseExportDate("Scene 0 (apr. 01, 2025).jpeg")!.getDate(), 1);
assert.strictEqual(parseExportDate("Scene 0 (apr. 01, 2025).jpeg")!.getFullYear(), 2025);
assert.strictEqual(parseExportDate("Scene 5 (gen 3 2025).jpeg")!.getMonth(), 0);
assert.strictEqual(parseExportDate("Scene 5 (gen 3 2025).jpeg")!.getDate(), 3);
assert.strictEqual(parseExportDate("Scene 0 (gen. 03, 2025) (2).jpeg")!.getDate(), 3);
assert.strictEqual(parseExportDate("Scene 11 (feb. 14, 2025) (1).jpeg")!.getMonth(), 1);
assert.strictEqual(parseExportDate("Scene 2.jpeg"), null);
assert.strictEqual(parseExportDate("Scene 0 (xyz. 03, 2025).jpeg"), null);

// ── parseFloorLevel ──────────────────────────────────────────────────────────
assert.strictEqual(parseFloorLevel("primo piano", 0), 1);
assert.strictEqual(parseFloorLevel("secondo piano", 1), 2);
assert.strictEqual(parseFloorLevel("Piano terra", 3), 0);
assert.strictEqual(parseFloorLevel("Mezzanino", 5), 6);
assert.strictEqual(parseFloorLevel("Livello 4", 0), 4);

// ── gridPosition ─────────────────────────────────────────────────────────────
for (const t of [1, 4, 13, 17]) {
  for (let i = 0; i < t; i++) {
    const g = gridPosition(i, t);
    assert.ok(g.x >= 0 && g.x <= 100, `x in range (${g.x})`);
    assert.ok(g.y >= 0 && g.y <= 100, `y in range (${g.y})`);
  }
}

// ── stripRootWrapper ─────────────────────────────────────────────────────────
assert.deepStrictEqual(stripRootWrapper(["UN/a/b.jpg", "UN/c.png"]), ["a/b.jpg", "c.png"]);
assert.deepStrictEqual(
  stripRootWrapper(["x (floor plan).png", "x/s/a.jpg"]),
  ["x (floor plan).png", "x/s/a.jpg"]
); // niente wrapper unico (c'è un file a radice)

// ── analyzeStructure ─────────────────────────────────────────────────────────
const r = analyzeStructure([
  "primo piano (floor plan).png",
  "primo piano/scena 0/Scene 0 (apr. 01, 2025).jpeg",
  "primo piano/scena 0/Scene 0 (mar. 07, 2025).jpeg",
  "primo piano/scena 1/note.txt", // → fileIgnorato, scena 1 resta vuota
  "orfana (floor plan).png", // → planimetriaSenzaCartella
  "random.txt", // → fuoriStruttura
]);
assert.strictEqual(r.floors.length, 1);
assert.strictEqual(r.floors[0].livello, 1);
assert.strictEqual(r.floors[0].points.length, 1); // solo scena 0
assert.strictEqual(r.totaleFoto, 2);
assert.strictEqual(r.totalePunti, 1);
assert.ok(r.issues.some((i) => i.categoria === "fileIgnorato"));
assert.ok(r.issues.some((i) => i.categoria === "scenaVuota"));
assert.ok(r.issues.some((i) => i.categoria === "planimetriaSenzaCartella"));
assert.ok(r.issues.some((i) => i.categoria === "fuoriStruttura"));

console.log("OK holobuilderImport");
