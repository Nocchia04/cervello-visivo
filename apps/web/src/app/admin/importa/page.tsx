"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useSubscription } from "@apollo/client";
import {
  Upload,
  FileArchive,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import {
  uploadHolobuilderZip,
  type ImportManifest,
  type ImportIssue,
} from "@/lib/importUpload";
import { CONFERMA_IMPORT_HOLOBUILDER } from "@/graphql/mutations";
import { IMPORT_PROGRESS } from "@/graphql/subscriptions";

type Step = "idle" | "uploading" | "preview" | "importing" | "done" | "error";

interface ImportResult {
  stato: string;
  cantiereId: string | null;
  piantineCreate: number;
  puntiCreati: number;
  fotoCreate: number;
  issues: ImportIssue[];
}

const CATEGORIA_LABEL: Record<string, string> = {
  dataMancante: "Data non riconosciuta nel nome",
  fileIgnorato: "File non immagine ignorati",
  pianoSenzaPlanimetria: "Piani senza planimetria",
  planimetriaSenzaCartella: "Planimetrie senza cartella",
  scenaVuota: "Scene senza immagini",
  fuoriStruttura: "File fuori struttura",
  scritturaFallita: "Errori di salvataggio",
};

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ImportIssue[]>();
    for (const i of issues) {
      if (!m.has(i.categoria)) m.set(i.categoria, []);
      m.get(i.categoria)!.push(i);
    }
    return Array.from(m.entries());
  }, [issues]);

  if (issues.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.map(([cat, items]) => (
        <div key={cat} className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle className="w-4 h-4" style={{ color: "var(--warning)" }} />
            <span style={{ fontWeight: 600 }}>
              {CATEGORIA_LABEL[cat] ?? cat} ({items.length})
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 13 }}>
            {items.slice(0, 30).map((it, idx) => (
              <li key={idx}>
                <code>{it.percorso}</code> — {it.azione}
              </li>
            ))}
            {items.length > 30 && <li>…e altri {items.length - 30}</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ImportaPage() {
  const [step, setStep] = useState<Step>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [manifest, setManifest] = useState<ImportManifest | null>(null);
  const [nome, setNome] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [skipNoData, setSkipNoData] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [confermaImport] = useMutation(CONFERMA_IMPORT_HOLOBUILDER);

  // Avanzamento live: subscription attiva appena abbiamo un jobId (in anteprima),
  // così è già pronta prima che la mutation inizi a pubblicare → niente race.
  const { data: progressData } = useSubscription(IMPORT_PROGRESS, {
    variables: { jobId: manifest?.jobId },
    skip: !manifest?.jobId || step === "done" || step === "error",
  });
  const progress = progressData?.importProgress;

  const handleFile = useCallback(async (file: File) => {
    setErrorMsg("");
    setStep("uploading");
    setUploadPct(0);
    try {
      const { manifest } = await uploadHolobuilderZip(file, setUploadPct);
      setManifest(manifest);
      setNome(manifest.nomeCantiere);
      setStep("preview");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Errore durante l'upload");
      setStep("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const startImport = useCallback(async () => {
    if (!manifest || !indirizzo.trim() || !nome.trim()) return;
    setStep("importing");
    try {
      const res = await confermaImport({
        variables: {
          jobId: manifest.jobId,
          nome: nome.trim(),
          indirizzo: indirizzo.trim(),
          skipFotoSenzaData: skipNoData,
        },
      });
      setResult(res.data.confermaImportHolobuilder as ImportResult);
      setStep("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Import fallito");
      setStep("error");
    }
  }, [manifest, indirizzo, nome, skipNoData, confermaImport]);

  const reset = useCallback(() => {
    setStep("idle");
    setManifest(null);
    setResult(null);
    setErrorMsg("");
    setUploadPct(0);
    setNome("");
    setIndirizzo("");
  }, []);

  const importPct = progress?.totali
    ? Math.round((progress.correnti / progress.totali) * 100)
    : progress?.completato
    ? 100
    : 0;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/admin" className="btn-ghost" style={{ padding: 8 }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Importa da HoloBuilder</h1>
      </div>
      <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
        Carica uno ZIP esportato da HoloBuilder. Verrà creato un nuovo cantiere con
        piantine, punti e foto. I problemi sui singoli file vengono segnalati senza
        interrompere l&apos;import.
      </p>

      {/* IDLE — dropzone */}
      {step === "idle" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="card"
          style={{
            cursor: "pointer",
            textAlign: "center",
            padding: 48,
            border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
            background: dragOver ? "var(--surface-hover)" : "var(--surface)",
          }}
        >
          <FileArchive className="w-10 h-10" style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Trascina qui lo ZIP o clicca per scegliere</div>
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>Solo file .zip</div>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {/* UPLOADING */}
      {step === "uploading" && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Upload className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600 }}>Caricamento ZIP… {uploadPct}%</span>
          </div>
          <ProgressBar pct={uploadPct} />
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            Non chiudere la pagina durante il caricamento.
          </p>
        </div>
      )}

      {/* PREVIEW */}
      {step === "preview" && manifest && (
        <>
          <div className="card" style={{ padding: 20 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Anteprima</div>
            <div style={{ fontSize: 15, marginBottom: 12 }}>
              <strong>{manifest.floors.length}</strong> piani ·{" "}
              <strong>{manifest.totalePunti}</strong> punti ·{" "}
              <strong>{manifest.totaleFoto}</strong> foto
              {manifest.issues.length > 0 && (
                <span style={{ color: "var(--warning)" }}> · ⚠ {manifest.issues.length} avvisi</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
              {manifest.floors.map((f) => (
                <div key={f.nome}>
                  📐 <strong>{f.nome}</strong> (livello {f.livello}) — {f.puntiCount} punti, {f.fotoCount} foto
                  {!f.hasPlanimetria && <span style={{ color: "var(--danger)" }}> · senza planimetria</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="section-label">Nome cantiere</label>
              <input className="input-field" style={{ width: "100%", marginTop: 4 }} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label className="section-label">Indirizzo *</label>
              <input className="input-field" style={{ width: "100%", marginTop: 4 }} value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via, città" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={skipNoData} onChange={(e) => setSkipNoData(e.target.checked)} />
              Salta le foto senza data riconoscibile (altrimenti importate con la data di oggi)
            </label>
          </div>

          {manifest.issues.length > 0 && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Avvisi ({manifest.issues.length})</div>
              <IssueList issues={manifest.issues} />
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-secondary" onClick={reset}>Annulla</button>
            <button className="btn-primary" onClick={startImport} disabled={!indirizzo.trim() || !nome.trim()} style={{ flex: 1 }}>
              Importa {manifest.totaleFoto} foto
            </button>
          </div>
        </>
      )}

      {/* IMPORTING */}
      {step === "importing" && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600 }}>{progress?.messaggio ?? "Import in corso…"}</span>
          </div>
          <ProgressBar pct={importPct} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            <span>{progress?.correnti ?? 0} / {progress?.totali ?? manifest?.totaleFoto ?? 0} foto</span>
            <span>
              {(progress?.avvisiCount ?? 0) > 0 && <span style={{ color: "var(--warning)" }}>⚠ {progress?.avvisiCount} </span>}
              {(progress?.erroriCount ?? 0) > 0 && <span style={{ color: "var(--danger)" }}>✕ {progress?.erroriCount}</span>}
            </span>
          </div>
        </div>
      )}

      {/* DONE */}
      {step === "done" && result && (
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 className="w-6 h-6" style={{ color: "var(--success)" }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {result.stato === "completato" ? "Import completato" : "Import completato con avvisi"}
            </span>
          </div>
          <div style={{ fontSize: 14 }}>
            {result.piantineCreate} piantine · {result.puntiCreati} punti · {result.fotoCreate} foto importate
          </div>
          {result.issues.length > 0 && <IssueList issues={result.issues} />}
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-secondary" onClick={reset}>Importa un altro ZIP</button>
            {result.cantiereId && (
              <Link className="btn-primary" href={`/dashboard/cantieri/${result.cantiereId}`} style={{ flex: 1, textAlign: "center" }}>
                Apri il cantiere
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ERROR */}
      {step === "error" && (
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, borderColor: "var(--danger)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <XCircle className="w-6 h-6" style={{ color: "var(--danger)" }} />
            <span style={{ fontWeight: 700 }}>Errore</span>
          </div>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>{errorMsg}</p>
          <button className="btn-secondary" onClick={reset}>Riprova</button>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-hover)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, background: "var(--accent)", transition: "width .2s" }} />
    </div>
  );
}
