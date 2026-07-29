import { ref, computed, readonly } from "vue";
import { apiFetch } from "./apiFetch";

export type Store = {
  id: string;
  name: string;
  address?: string;
  vatNumber?: string;
  phone?: string;
  contactEmail?: string;
};

export const STORE_LS_KEY = "current_store_id";
export const ALL_STORES = "__all__";

// Module-level state shared across the app
const stores = ref<Store[]>([]);
const currentStoreId = ref<string | null>(
  typeof window !== "undefined" ? localStorage.getItem(STORE_LS_KEY) : null,
);
const loaded = ref(false);

/** Read the active store id outside of Vue (used by apiFetch to set the header). */
export function getActiveStoreId(): string | null {
  if (typeof window === "undefined") return currentStoreId.value;
  return localStorage.getItem(STORE_LS_KEY);
}

export function useStore() {
  const currentStore = computed(() => stores.value.find((s) => s.id === currentStoreId.value) ?? null);

  function setCurrentStore(id: string) {
    currentStoreId.value = id;
    if (typeof window !== "undefined") localStorage.setItem(STORE_LS_KEY, id);
  }

  async function fetchStores() {
    try {
      const res = await apiFetch("/api/stores");
      if (!res.ok) return;
      const list = (await res.json()) as Store[];
      stores.value = list;

      // Ensure a valid selection: keep the stored one if still accessible,
      // otherwise fall back to the first available store.
      const stored = currentStoreId.value;
      const validStored = stored && stored !== ALL_STORES && list.some((s) => s.id === stored);
      if (!validStored && list.length > 0) {
        setCurrentStore(list[0].id);
      } else if (list.length === 0) {
        currentStoreId.value = null;
      }
    } finally {
      loaded.value = true;
    }
  }

  return {
    stores: readonly(stores),
    currentStoreId: readonly(currentStoreId),
    currentStore,
    loaded: readonly(loaded),
    setCurrentStore,
    fetchStores,
  };
}
