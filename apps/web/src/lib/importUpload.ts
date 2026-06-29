import { SERVER_URL } from "./upload";
import { getToken } from "./auth";

export interface ImportIssue {
  severita: "error" | "warning" | string;
  categoria: string;
  percorso: string;
  messaggio: string;
  azione: string;
}
export interface ImportManifestFloor {
  nome: string;
  livello: number;
  hasPlanimetria: boolean;
  puntiCount: number;
  fotoCount: number;
}
export interface ImportManifest {
  jobId: string;
  nomeCantiere: string;
  floors: ImportManifestFloor[];
  totalePunti: number;
  totaleFoto: number;
  issues: ImportIssue[];
}

/**
 * Carica uno ZIP HoloBuilder al server (fase 1: analisi). Usa XMLHttpRequest
 * per esporre l'avanzamento dell'upload (fetch non lo permette). Risolve con
 * il manifest da mostrare in anteprima; NON scrive ancora nel DB.
 */
export function uploadHolobuilderZip(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ jobId: string; manifest: ImportManifest }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SERVER_URL}/import/holobuilder`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { jobId?: string; manifest?: ImportManifest; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* risposta non JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.jobId && body.manifest) {
        resolve({ jobId: body.jobId, manifest: body.manifest });
      } else {
        reject(new Error(body?.error || `Upload fallito (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Errore di rete durante l'upload"));

    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}
