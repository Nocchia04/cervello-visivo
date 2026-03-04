const TOKEN_KEY = "cervello_visivo_token";
// Cookie letto dal middleware Edge per proteggere le route server-side.
// Stesso valore del localStorage, stessa scadenza (7 giorni).
const COOKIE_NAME = "cervello_visivo_auth";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 giorni in secondi

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
