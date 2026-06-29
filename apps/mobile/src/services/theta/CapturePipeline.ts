/**
 * CapturePipeline — pipeline "anteprima istantanea + 5K in background".
 *
 * Flusso (deciso con l'utente):
 *  - Lo scatto mostra SUBITO un frame della live preview (1024×512, già sul
 *    telefono) per confermare l'inquadratura → zero attesa.
 *  - Alla conferma, qui in BACKGROUND: si attende il vero scatto 5K (shutter),
 *    si scarica il file pieno dalla camera e lo si carica su SiteLens. Il tutto
 *    mentre l'operatore cammina verso il punto successivo.
 *
 * La sessione camera resta viva tra gli screen (gestita da ThetaSession, che
 * disconnette solo quando l'app va in background): qui non serve coordinare il
 * teardown. Serializza i job: la SC2 gestisce un solo accesso per volta.
 *
 * Reliability: se lo shutter 5K o il download falliscono, come fallback si
 * carica comunque il FRAME (1024×512) così lo scatto non va perso.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { thetaSession } from "./ThetaSession";
import { uploadQueue } from "../upload/UploadQueue";
import { getCameraCredentials } from "../../lib/storage";
import { dlog } from "../../lib/debugLog";

/** Chiave AsyncStorage dei job di cattura non ancora accodati per l'upload. */
const PENDING_CAPTURES_KEY = "@cervello_visivo:pending_captures";

interface ShotJob {
  id: string;
  /** Promise dello scatto 5K → fileUrl sulla camera (in volo al momento della conferma). */
  shotPromise: Promise<string>;
  puntoDiScattoId: string;
  timestamp: string;
  /** Frame della preview (fallback se lo shutter/download 5K fallisce). */
  thumbUri: string;
}

/**
 * Record PERSISTITO di uno scatto confermato non ancora accodato per l'upload.
 * Garantisce che, se l'app si chiude durante il download 5K, allo riavvio si
 * carichi almeno il frame (thumbUri, già su disco) → lo scatto non va perso.
 */
interface PersistedCapture {
  id: string;
  puntoDiScattoId: string;
  timestamp: string;
  thumbUri: string;
}

type CountListener = (pending: number) => void;

class CapturePipeline {
  private pending = 0;
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<CountListener>();

  getPending(): number {
    return this.pending;
  }

  isBusy(): boolean {
    return this.pending > 0;
  }

  onPendingChange(listener: CountListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setPending(n: number) {
    this.pending = n;
    this.listeners.forEach((fn) => {
      try {
        fn(n);
      } catch {}
    });
  }

  /** Attende che la catena di job in background sia vuota (prima di un nuovo scatto). */
  async waitIdle(): Promise<void> {
    await this.chain.catch(() => {});
  }

  // ── Persistenza (sopravvivenza alla chiusura app) ────────────────────────

  private async loadPersisted(): Promise<PersistedCapture[]> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_CAPTURES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async addPersisted(rec: PersistedCapture): Promise<void> {
    try {
      const list = await this.loadPersisted();
      list.push(rec);
      await AsyncStorage.setItem(PENDING_CAPTURES_KEY, JSON.stringify(list));
    } catch {}
  }

  private async removePersisted(id: string): Promise<void> {
    try {
      const list = (await this.loadPersisted()).filter((r) => r.id !== id);
      await AsyncStorage.setItem(PENDING_CAPTURES_KEY, JSON.stringify(list));
    } catch {}
  }

  /**
   * All'avvio app: per ogni cattura confermata ma non completata (app chiusa
   * durante il download 5K), carica il FRAME salvato come fallback — lo scatto
   * non si perde (in qualità ridotta). Il 5K era solo sulla camera, non più
   * raggiungibile a freddo, quindi non si ritenta.
   */
  async resumePending(): Promise<void> {
    const list = await this.loadPersisted();
    if (list.length === 0) return;
    dlog("CAM", `Ripresa: ${list.length} scatto/i interrotto/i → carico il frame salvato`);
    for (const rec of list) {
      try {
        const info = await FileSystem.getInfoAsync(rec.thumbUri);
        if (info.exists) {
          await uploadQueue.addToQueue({
            id: rec.id,
            localUri: rec.thumbUri,
            puntoDiScattoId: rec.puntoDiScattoId,
            timestamp: rec.timestamp,
            skipResize: true,
          });
        }
      } catch (e) {
        dlog("CAM", `Ripresa job ${rec.id} fallita: ${e instanceof Error ? e.message : e}`);
      } finally {
        await this.removePersisted(rec.id);
      }
    }
  }

  /**
   * Accoda un job: attende lo scatto 5K, scarica il full, carica su SiteLens.
   * Serializzato. Fallback al frame se il 5K fallisce. Persiste subito un
   * record (frame) così la chiusura dell'app non perde lo scatto.
   */
  enqueueShot(job: ShotJob): void {
    this.setPending(this.pending + 1);
    // Persisti SUBITO il fallback-frame (prima del lungo download).
    this.addPersisted({
      id: job.id,
      puntoDiScattoId: job.puntoDiScattoId,
      timestamp: job.timestamp,
      thumbUri: job.thumbUri,
    });
    this.chain = this.chain.then(() => this.runShot(job));
  }

  private async runShot(job: ShotJob): Promise<void> {
    try {
      // 1. Attendi il completamento dello scatto 5K (shutter, ~4-8s).
      let fileUrl: string | null = null;
      try {
        fileUrl = await job.shotPromise;
      } catch (e) {
        dlog("CAM", `Shutter 5K fallito per ${job.id}: ${e instanceof Error ? e.message : e}`);
      }

      if (fileUrl) {
        // 2. Scarica il full dalla camera (sessione ancora viva).
        const { ssid, password } = await getCameraCredentials();
        if (ssid) await thetaSession.ensureConnected(ssid, password ?? "");

        let localUri: string | null = null;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            localUri = await thetaSession.downloadPhoto(fileUrl);
            break;
          } catch (e) {
            lastErr = e;
            dlog("CAM", `BG download 5K tentativo ${attempt} fallito: ${e instanceof Error ? e.message : e}`);
            if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
          }
        }

        if (localUri) {
          // 3. Accoda l'upload del 5K + rimuovi il record persistito + butta
          //    il frame (non serve più).
          await uploadQueue.addToQueue({
            id: job.id,
            localUri,
            puntoDiScattoId: job.puntoDiScattoId,
            timestamp: job.timestamp,
          });
          await this.removePersisted(job.id);
          FileSystem.deleteAsync(job.thumbUri, { idempotent: true }).catch(() => {});
          dlog("CAM", `5K scaricato e accodato per upload SiteLens: ${job.id}`);
          return;
        }
        dlog("CAM", `⚠️ download 5K fallito (${lastErr instanceof Error ? lastErr.message : lastErr}) — fallback al frame`);
      }

      // FALLBACK: carica il frame della preview così lo scatto non va perso.
      await uploadQueue.addToQueue({
        id: job.id,
        localUri: job.thumbUri,
        puntoDiScattoId: job.puntoDiScattoId,
        timestamp: job.timestamp,
        skipResize: true,
      });
      await this.removePersisted(job.id);
      dlog("CAM", `Fallback: caricato il frame 1024px per ${job.id}`);
    } catch (e) {
      // Il record persistito resta: all'avvio successivo resumePending()
      // caricherà il frame come fallback → niente perdita.
      dlog("CAM", `⚠️ Job ${job.id} interrotto: ${e instanceof Error ? e.message : e} (recupero all'avvio)`);
    } finally {
      this.setPending(Math.max(0, this.pending - 1));
    }
  }
}

export const capturePipeline = new CapturePipeline();
