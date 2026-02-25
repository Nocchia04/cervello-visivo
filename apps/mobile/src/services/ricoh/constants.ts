// Ricoh Theta SC2 - OSC (Open Spherical Camera) API constants
// Default WiFi: camera creates AP, device connects to it
// Default IP when connected to Theta WiFi: 192.168.1.1

export const RICOH_BASE_URL = "http://192.168.1.1";

export const OSC_ENDPOINTS = {
  INFO: "/osc/info",
  STATE: "/osc/state",
  EXECUTE: "/osc/commands/execute",
  STATUS: "/osc/commands/status",
} as const;

export const OSC_COMMANDS = {
  TAKE_PICTURE: "camera.takePicture",
  GET_LIVE_PREVIEW: "camera.getLivePreview",
  LIST_FILES: "camera.listFiles",
  DELETE: "camera.delete",
  GET_OPTIONS: "camera.getOptions",
  SET_OPTIONS: "camera.setOptions",
} as const;

export const COMMAND_STATUS = {
  IN_PROGRESS: "inProgress",
  DONE: "done",
  ERROR: "error",
} as const;

export const POLLING_INTERVAL_MS = 500;
export const MAX_POLL_ATTEMPTS = 60; // 30 seconds max
