import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { STORAGE_KEYS, getAuthToken } from "../../lib/storage";
import { apolloClient } from "../../lib/apollo-client";
import { UPLOAD_FOTO360_MUTATION } from "../../graphql/mutations";

const PROD_SERVER_URL = "https://api.holobuilderino.com";

/**
 * Target di ridimensionamento per le foto 360° prima dell'upload al backend.
 * SC2 produce equirettangolari 5376×2688 (~10-15 MB).
 * 3072×1536 ≈ 1/3 dei pixel, JPEG quality 0.85 → file ~1.5-3 MB.
 * Qualità ancora ottima per la sfera (decoder GL su mobile usa già downscale).
 */
const UPLOAD_MAX_WIDTH = 3072;
const UPLOAD_JPEG_QUALITY = 0.85;

function getServerBaseUrl(): string {
  if (!__DEV__) return PROD_SERVER_URL;
  // Usa l'IP di Metro (uguale per Android fisico e iOS) — 10.0.2.2 è solo per emulatore
  const metroHost = Constants.expoConfig?.hostUri?.split(":").shift();
  return `http://${metroHost ?? "localhost"}:4000`;
}

export interface QueueItem {
  id: string;
  localUri: string;
  puntoDiScattoId: string;
  timestamp: string;
  retryCount: number;
  status: "pending" | "uploading" | "failed";
  /** Se true, NON ridimensionare (immagine già piccola, es. frame preview 1024px). */
  skipResize?: boolean;
}

const MAX_RETRIES = 3;

class UploadQueueService {
  private processing = false;

  async getQueue(): Promise<QueueItem[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.UPLOAD_QUEUE);
    return data ? JSON.parse(data) : [];
  }

  private async saveQueue(queue: QueueItem[]): Promise<void> {
    await AsyncStorage.setItem(
      STORAGE_KEYS.UPLOAD_QUEUE,
      JSON.stringify(queue)
    );
  }

  async addToQueue(item: Omit<QueueItem, "retryCount" | "status">): Promise<void> {
    const queue = await this.getQueue();
    queue.push({
      ...item,
      retryCount: 0,
      status: "pending",
    });
    await this.saveQueue(queue);

    // Avvia subito la queue — isInternetReachable può essere null su Android (stato
    // sconosciuto), quindi non usarlo come gate. Se l'upload fallisce, il retry gestisce.
    this.processQueue();
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const queue = await this.getQueue();
      const pendingItems = queue.filter(
        (item) => item.status === "pending" || item.status === "failed"
      );

      for (const item of pendingItems) {
        try {
          await this.uploadItem(item);
          // Remove from queue on success
          const updatedQueue = await this.getQueue();
          const filtered = updatedQueue.filter((q) => q.id !== item.id);
          await this.saveQueue(filtered);
        } catch {
          // Mark as failed and increment retry count
          const updatedQueue = await this.getQueue();
          const idx = updatedQueue.findIndex((q) => q.id === item.id);
          if (idx !== -1) {
            updatedQueue[idx].retryCount += 1;
            updatedQueue[idx].status =
              updatedQueue[idx].retryCount >= MAX_RETRIES ? "failed" : "pending";
            await this.saveQueue(updatedQueue);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async uploadItem(item: QueueItem): Promise<void> {
    const serverBaseUrl = getServerBaseUrl();

    // 1. Ridimensiona la foto prima dell'upload — riduce ~70% di banda
    // mobile e accelera l'upload sul 4G/5G. Saltato per le immagini già
    // piccole (frame preview 1024px): ridimensionarle a 3072px sarebbe un
    // upscaling inutile e dannoso.
    let uploadUri = item.localUri;
    let resizedCacheUri: string | null = null;
    if (!item.skipResize) {
      try {
        const resized = await ImageManipulator.manipulateAsync(
          item.localUri,
          [{ resize: { width: UPLOAD_MAX_WIDTH } }],
          {
            compress: UPLOAD_JPEG_QUALITY,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
        uploadUri = resized.uri;
        resizedCacheUri = resized.uri;
      } catch (e) {
        // Se il resize fallisce (file corrotto, lib non disponibile, ecc.),
        // fai fallback all'originale: meglio upload più lento che fallimento.
        console.warn("[UploadQueue] Resize fallito, fallback all'originale:", e);
      }
    }

    // 2. Upload del file ridimensionato (o originale se resize fallito)
    const formData = new FormData();
    formData.append("foto", {
      uri: uploadUri,
      type: "image/jpeg",
      name: uploadUri.split("/").pop() ?? "photo.jpg",
    } as any);

    const token = await getAuthToken();
    let uploadRes: Response;
    try {
      uploadRes = await fetch(`${serverBaseUrl}/upload`, {
        method: "POST",
        body: formData,
        headers: {
          // NON impostare Content-Type manualmente con FormData:
          // fetch lo setta automaticamente con il boundary corretto.
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
    } finally {
      // Cleanup del file ridimensionato in cache (sia su successo che fallimento)
      if (resizedCacheUri) {
        FileSystem.deleteAsync(resizedCacheUri, { idempotent: true }).catch(() => {});
      }
    }

    if (!uploadRes.ok) {
      throw new Error(`File upload failed: ${uploadRes.status}`);
    }

    const uploadData = await uploadRes.json();
    const publicUrl = `${serverBaseUrl}${uploadData.url}`;

    // 3. Registra la foto via GraphQL mutation con la public URL
    await apolloClient.mutate({
      mutation: UPLOAD_FOTO360_MUTATION,
      variables: {
        puntoDiScattoId: item.puntoDiScattoId,
        url: publicUrl,
        metadata: {
          capturedAt: item.timestamp,
          source: "ricoh-theta-sc2",
        },
      },
    });
  }

  async retryFailed(): Promise<void> {
    const queue = await this.getQueue();
    let changed = false;
    for (const item of queue) {
      if (item.status === "failed") {
        item.status = "pending";
        item.retryCount = 0;
        changed = true;
      }
    }
    if (changed) {
      await this.saveQueue(queue);
      await this.processQueue();
    }
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.filter((item) => item.status !== "failed" || item.retryCount < MAX_RETRIES).length;
  }

  async clearCompleted(): Promise<void> {
    // Items are already removed on success, this clears permanently failed items
    const queue = await this.getQueue();
    const filtered = queue.filter(
      (item) => !(item.status === "failed" && item.retryCount >= MAX_RETRIES)
    );
    await this.saveQueue(filtered);
  }
}

export const uploadQueue = new UploadQueueService();
