import * as Network from "expo-network";
import { uploadQueue } from "./UploadQueue";

type Listener = (count: number) => void;

class UploadWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Listener[] = [];

  // Start monitoring network and processing queue
  start(pollIntervalMs: number = 15000): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected && networkState.isInternetReachable) {
        await uploadQueue.processQueue();
        const count = await uploadQueue.getPendingCount();
        this.notifyListeners(count);
      }
    }, pollIntervalMs);

    // Process immediately on start
    this.processNow();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processNow(): Promise<void> {
    await uploadQueue.processQueue();
    const count = await uploadQueue.getPendingCount();
    this.notifyListeners(count);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(count: number): void {
    for (const listener of this.listeners) {
      listener(count);
    }
  }
}

export const uploadWorker = new UploadWorker();
