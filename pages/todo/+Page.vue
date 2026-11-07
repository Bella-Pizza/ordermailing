<template>
  <div class="todo-app">
    <!-- Nothing but a spinner until mounted: this page is prerendered, while the
         language and remembered store only exist in the browser. -->
    <div v-if="view === 'boot'" class="boot" aria-hidden="true"><span class="spinner" /></div>

    <TodoStorePicker v-else-if="view === 'picker'" @select="selectStore" />

    <TodoPinPad
      v-else-if="view === 'pin' && store"
      :store="store"
      :notice="pinNotice"
      @verified="onVerified"
      @back="goToPicker"
    />

    <TodoBoard
      v-else-if="view === 'board' && store && token"
      :store="store"
      :token="token"
      @unauthorized="onUnauthorized"
      @not-found="goToPicker"
      @switch-store="goToPicker"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import TodoBoard from "@/components/todo/TodoBoard.vue";
import TodoPinPad from "@/components/todo/TodoPinPad.vue";
import TodoStorePicker from "@/components/todo/TodoStorePicker.vue";
import { useLocale } from "@/lib/useLocale";
import {
  forgetToken,
  getLastStore,
  getStoredToken,
  setLastStore,
  storeToken,
  type TodoStore,
} from "@/lib/todoApi";
import "@/components/todo/todo-theme.css";

const { t } = useLocale();

const view = ref<"boot" | "picker" | "pin" | "board">("boot");
const store = ref<TodoStore | null>(null);
const token = ref<string | null>(null);
const pinNotice = ref("");

onMounted(() => {
  const last = getLastStore();
  if (last && getStoredToken(last.id)) selectStore(last);
  else view.value = "picker";
});

function selectStore(next: TodoStore) {
  store.value = next;
  pinNotice.value = "";
  token.value = getStoredToken(next.id);
  if (token.value) openBoard();
  else view.value = "pin";
}

function openBoard() {
  setLastStore(store.value);
  view.value = "board";
}

function onVerified(newToken: string) {
  storeToken(store.value!.id, newToken);
  token.value = newToken;
  openBoard();
}

// The saved token stopped working, which means the PIN was changed in the dashboard.
function onUnauthorized() {
  forgetToken(store.value!.id);
  setLastStore(null);
  token.value = null;
  pinNotice.value = t("todo.pin.changed");
  view.value = "pin";
}

function goToPicker() {
  setLastStore(null);
  store.value = null;
  token.value = null;
  view.value = "picker";
}
</script>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  min-height: 100dvh;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--surface-high);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: boot-spin 800ms linear infinite;
}

@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
