// OSC (Open Spherical Camera) API Response Types

export interface OscInfo {
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  supportUrl: string;
  endpoints: {
    httpPort: number;
    httpUpdatesPort: number;
  };
  apiLevel: number[];
}

export interface OscState {
  fingerprint: string;
  state: {
    batteryLevel: number;
    storageUri: string;
    _captureStatus: "idle" | "shooting";
    _recordedTime: number;
    _recordableTime: number;
    _capturedPictures: number;
    _latestFileUrl: string;
  };
}

export interface OscCommandResponse {
  name: string;
  state: "inProgress" | "done" | "error";
  id?: string;
  results?: {
    fileUrl?: string;
    fileUrls?: string[];
    [key: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
  progress?: {
    completion: number;
  };
}

export interface OscListFilesResult {
  entries: OscFileEntry[];
  totalEntries: number;
}

export interface OscFileEntry {
  name: string;
  fileUrl: string;
  size: number;
  dateTimeZone: string;
  width: number;
  height: number;
  thumbnail?: string; // base64
  _thumbSize: number;
  isProcessed: boolean;
  previewUrl: string;
}

export interface OscCommandRequest {
  name: string;
  parameters?: Record<string, unknown>;
}

export interface OscStatusRequest {
  id: string;
}
