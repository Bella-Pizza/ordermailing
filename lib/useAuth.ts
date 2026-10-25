import { ref, readonly } from "vue";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import { apiFetch } from "./apiFetch";

const currentUser = ref<User | null>(null);
const userRole = ref<string>("user");
const loading = ref(true);
// Flips as soon as Firebase has resolved the session, without waiting for the
// role lookup. Pages use it to start fetching their data in parallel with
// `/api/users/me` instead of queueing behind it.
const authReady = ref(false);

// Only subscribe in the browser — auth doesn't exist during SSR
if (typeof window !== "undefined") {
  onAuthStateChanged(auth, async (user) => {
    currentUser.value = user;
    authReady.value = true;
    if (user) {
      try {
        const response = await apiFetch("/api/users/me");
        if (!response.ok) {
          throw new Error(`Failed to fetch current user: ${response.status}`);
        }

        const userData = (await response.json()) as { role?: string };
        userRole.value = userData.role?.trim().toLowerCase() || "user";
      } catch (err) {
        console.error("Failed to fetch user role:", err);
        userRole.value = "user";
      }
    } else {
      userRole.value = "user";
    }
    loading.value = false;
  });
}

export function useAuth() {
  async function signIn(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    return firebaseSignOut(auth);
  }

  return {
    currentUser: readonly(currentUser),
    userRole: readonly(userRole),
    loading: readonly(loading),
    authReady: readonly(authReady),
    signIn,
    signOut,
  };
}
