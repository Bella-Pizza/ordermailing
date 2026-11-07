<template>
  <main class="pin">
    <button class="back state-layer" type="button" :aria-label="t('todo.pin.back')" @click="emit('back')">
      <ArrowLeft :size="24" aria-hidden="true" />
    </button>

    <div class="content">
      <p class="store">{{ store.name }}</p>
      <h1>{{ t("todo.pin.title") }}</h1>

      <div
        class="dots"
        :class="{ shake }"
        role="img"
        :aria-label="t('todo.pin.progress', { n: pin.length })"
        @animationend="shake = false"
      >
        <span v-for="i in PIN_LENGTH" :key="i" class="dot" :class="{ filled: i <= pin.length }" />
      </div>

      <p class="status" role="alert">{{ statusMessage }}</p>

      <div class="pad">
        <button
          v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
          :key="digit"
          class="key state-layer"
          type="button"
          :disabled="padDisabled"
          @click="press(digit)"
        >
          {{ digit }}
        </button>
        <span />
        <button class="key state-layer" type="button" :disabled="padDisabled" @click="press('0')">0</button>
        <button
          class="key key-plain state-layer"
          type="button"
          :aria-label="t('todo.pin.erase')"
          :disabled="padDisabled || !pin"
          @click="erase"
        >
          <Delete :size="26" aria-hidden="true" />
        </button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowLeft, Delete } from "lucide-vue-next";
import { TodoApiError, verifyPin, type TodoStore } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const PIN_LENGTH = 4;

const props = defineProps<{ store: TodoStore; notice?: string }>();
const emit = defineEmits<{ verified: [token: string]; back: [] }>();
const { t } = useLocale();

const pin = ref("");
const busy = ref(false);
const shake = ref(false);
const error = ref("");
const lockSeconds = ref(0);
let lockTimer: ReturnType<typeof setInterval> | undefined;

const padDisabled = computed(() => busy.value || lockSeconds.value > 0);

const statusMessage = computed(() => {
  if (lockSeconds.value > 0) {
    const minutes = Math.floor(lockSeconds.value / 60);
    const seconds = String(lockSeconds.value % 60).padStart(2, "0");
    return t("todo.pin.locked", { time: `${minutes}:${seconds}` });
  }
  return error.value || props.notice || "";
});

function press(digit: string) {
  if (padDisabled.value || pin.value.length >= PIN_LENGTH) return;
  error.value = "";
  pin.value += digit;
  if (pin.value.length === PIN_LENGTH) submit();
}

function erase() {
  if (!padDisabled.value) pin.value = pin.value.slice(0, -1);
}

function startLock(seconds: number) {
  lockSeconds.value = seconds;
  clearInterval(lockTimer);
  lockTimer = setInterval(() => {
    lockSeconds.value -= 1;
    if (lockSeconds.value <= 0) clearInterval(lockTimer);
  }, 1000);
}

async function submit() {
  busy.value = true;
  try {
    const { token } = await verifyPin(props.store.id, pin.value);
    emit("verified", token);
  } catch (err) {
    pin.value = "";
    shake.value = true;
    if (err instanceof TodoApiError && err.status === 429) {
      startLock(err.retryAfterSeconds ?? 60);
    } else if (err instanceof TodoApiError && err.status === 401) {
      error.value = t("todo.pin.wrong");
    } else {
      error.value = t("todo.pin.error");
    }
  } finally {
    busy.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (/^\d$/.test(event.key)) press(event.key);
  else if (event.key === "Backspace") erase();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  clearInterval(lockTimer);
});
</script>

<style scoped>
.pin {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 72px 16px 24px;
}

.back {
  position: absolute;
  top: 12px;
  left: 12px;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.content {
  width: 100%;
  max-width: 340px;
  text-align: center;
}

.store {
  color: var(--primary);
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

h1 {
  margin-top: 4px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 32px;
}

.dots.shake {
  animation: pin-shake 380ms var(--ease-emphasized);
}

.dot {
  width: 16px;
  height: 16px;
  border: 2px solid var(--outline);
  border-radius: 50%;
  transition:
    transform 160ms var(--ease-decelerate),
    background-color 120ms linear,
    border-color 120ms linear;
}

.dot.filled {
  border-color: var(--primary);
  background: var(--primary);
  transform: scale(1.15);
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  margin: 8px 0;
  color: var(--error);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  justify-items: center;
}

.key {
  display: grid;
  place-items: center;
  width: 100%;
  max-width: 88px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface-container);
  font-size: 28px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  transition:
    border-radius 180ms var(--ease-emphasized),
    opacity 120ms linear;
}

.key:active:not(:disabled) {
  border-radius: 28%;
}

.key:disabled {
  opacity: 0.45;
}

.key-plain {
  background: transparent;
}

@keyframes pin-shake {
  20% {
    transform: translateX(-10px);
  }
  45% {
    transform: translateX(8px);
  }
  70% {
    transform: translateX(-5px);
  }
  90% {
    transform: translateX(2px);
  }
}
</style>
