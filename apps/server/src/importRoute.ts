import { Router } from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { extractAuthHeader, getUserFromToken } from "./middleware/auth.js";
import { createImportJob } from "./lib/importJobs.js";

const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
  "application/octet-stream", // alcuni browser inviano questo per gli .zip
]);

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `hb-upload-${randomUUID()}.zip`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    const okMime = ZIP_MIMES.has(file.mimetype);
    const okExt = path.extname(file.originalname).toLowerCase() === ".zip";
    if (okMime || okExt) cb(null, true);
    else cb(new Error("Carica un file .zip"));
  },
});

export const importRouter = Router();

/**
 * POST /import/holobuilder — admin only.
 * Riceve uno ZIP HoloBuilder, lo estrae+analizza e ritorna { jobId, manifest }.
 * Non scrive ancora nel DB: la creazione avviene con la mutation di conferma.
 */
importRouter.post("/import/holobuilder", (req, res) => {
  // Auth PRIMA di accettare l'upload (evita di caricare 550MB per poi rifiutare).
  const auth = extractAuthHeader(req);
  const user = auth?.kind === "bearer" ? getUserFromToken(auth.token) : null;
  if (!user || user.role !== "ADMIN") {
    res.status(403).json({ error: "Accesso riservato agli amministratori" });
    return;
  }

  // Cast: dual-version dei tipi Express nel monorepo (stesso caso di index.ts).
  (zipUpload.single("file") as unknown as (
    req: unknown,
    res: unknown,
    cb: (err: unknown) => void
  ) => void)(req, res, async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload fallito" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Nessun file ZIP caricato" });
      return;
    }
    const zipPath = req.file.path;
    try {
      const { jobId, manifest } = await createImportJob(zipPath, req.file.originalname);
      res.json({ jobId, manifest });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Errore durante l'analisi dello ZIP",
      });
    } finally {
      // lo ZIP sorgente non serve più (i file sono estratti nella temp del job)
      fs.rm(zipPath, { force: true }, () => {});
    }
  });
});
