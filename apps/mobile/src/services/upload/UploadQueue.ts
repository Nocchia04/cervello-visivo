import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { STORAGE_KEYS, getAuthToken } from "../../lib/storage";
import { apolloClient } from "../../lib/apollo-client";
import { UPLOAD_FOTO360_MUTATION } from "../../graphql/mutations";

const PROD_SERVER_URL = "https://api.holobuilderino.com";

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

    // 1. Upload the local file to server via multipart form
    const formData = new FormData();
    formData.append("foto", {
      uri: item.localUri,
      type: "image/jpeg",
      name: item.localUri.split("/").pop() ?? "photo.jpg",
    } as any);

    const token = await getAuthToken();
    const uploadRes = await fetch(`${serverBaseUrl}/upload`, {
      method: "POST",
      body: formData,
      headers: {
        // NON impostare Content-Type manualmente con FormData:
        // fetch lo setta automaticamente con il boundary corretto.
        // Impostarlo a mano rimuove il boundary e il server non riesce a parsare il body.
        Authorization: token ? `Bearer ${token}` : "",
      },
    });

    if (!uploadRes.ok) {
      throw new Error(`File upload failed: ${uploadRes.status}`);
    }

    const uploadData = await uploadRes.json();
    const publicUrl = `${serverBaseUrl}${uploadData.url}`;

    // 2. Register the photo via GraphQL mutation with the public URL
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
