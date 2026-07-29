import { getIdToken } from "firebase/auth";
import { auth } from "./firebase";

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (user) {
    const token = await getIdToken(user);
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Attach the active store so the backend can scope the request. Read from
  // localStorage directly to avoid a circular import with useStore.
  if (typeof window !== "undefined" && !headers.has("X-Store-Id")) {
    const storeId = localStorage.getItem("current_store_id");
    if (storeId) headers.set("X-Store-Id", storeId);
  }

  return fetch(input, { ...init, headers });
}
