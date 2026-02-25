import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  AUTH_TOKEN: "@cervello_visivo:auth_token",
  USER_DATA: "@cervello_visivo:user_data",
  UPLOAD_QUEUE: "@cervello_visivo:upload_queue",
} as const;

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
}

export async function removeAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
}

export async function getUserData<T>(): Promise<T | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
  return data ? JSON.parse(data) : null;
}

export async function setUserData<T>(data: T): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(data));
}

export async function removeUserData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
}

export { STORAGE_KEYS };
