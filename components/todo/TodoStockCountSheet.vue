<template>
  <TodoSheet :open="open" :title="t(`todo.stock.countSheetTitle.${location}`)" @close="emit('close')">
    <template #top>
      <div
        class="meter"
        role="progressbar"
        aria-valuemin="0"
        :aria-valuenow="progress.counted"
        :aria-valuemax="progress.total"
        :aria-label="t('todo.stock.progress', { done: progress.counted, total: progress.total })"
      >
        <div class="meter-text">
          <span class="meter-count">{{ progress.counted }} / {{ progress.total }}</span>
          <span>{{ t("todo.stock.counted") }}</span>
          <span class="meter-day">{{ t("todo.stock.forDay", { day: dayName }) }}</span>
        </div>
        <div class="bar"><div class="bar-fill" :style="{ transform: `scaleX(${progress.total ? progress.counted / progress.total : 0})` }" /></div>
      </div>
      <p class="hint">{{ t(`todo.stock.hint.${location}`) }}</p>
    </template>

    <div v-if="status === 'loading'" class="skeletons" aria-hidden="true">
      <div v-for="i in 6" :key="i" class="skeleton" />
    </div>

    <div v-else-if="status === 'error'" class="message" role="alert">
      <p>{{ t("todo.stock.loadError") }}</p>
      <button class="text-button state-layer" type="button" @click="load">{{ t("todo.retry") }}</button>
    </div>

    <p v-else-if="locked" class="message" role="status">{{ t("todo.stock.locked") }}</p>

    <p v-else-if="!rows.length" class="message">{{ t("todo.stock.noItems") }}</p>

    <ul v-else ref="list" class="rows">
      <TodoStockRow
        v-for="entry in rows"
        :key="`${location}-${entry.item.id}`"
        :row-id="entry.item.id"
        :name="entry.item.name"
        :ideal="entry.line.ideal"
        :value="entry.line.counted"
        @update:value="(value) => setCount(entry.item.id, location, value)"
      />
    </ul>

    <template #footer>
      <p v-if="saveError" class="problem" role="alert">
        {{ t("todo.stock.saveError") }}
        <button class="link state-layer" type="button" @click="flush">{{ t("todo.retry") }}</button>
      </p>
      <p v-else-if="finishError" class="problem" role="alert">{{ t("todo.stock.finishError") }}</p>
      <button class="primary state-layer" type="button" :disabled="status !== 'ready' || locked || !rows.length || finishing" @click="onPrimary">
        <span v-if="finishing" class="spinner" aria-hidden="true" />
        {{ remaining > 0 ? t("todo.stock.next", { n: remaining }) : t(`todo.stock.finish.${location}`) }}
      </button>
    </template>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import TodoSheet from "./TodoSheet.vue";
import TodoStockRow from "./TodoStockRow.vue";
import {
  fetchStock,
  fetchStockCount,
  finishStockCount,
  setStockCount,
  TodoApiError,
  weekdayName,
  type StockCounts,
  type StockItem,
  type TodoTask,
  type Weekday,
} from "@/lib/todoApi";
import { countProgress, stockLines, weekdayOfIso, type Location } from "@/lib/stockCalc";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{ open: boolean; task: TodoTask | null; storeId: string; token: string }>();
const emit = defineEmits<{ close: []; finished: [location: Location, prepare: number | null]; error: [err: unknown] }>();
const { t, locale } = useLocale();

const SAVE_DELAY_MS = 300;
const SYNC_MS = 8_000;

const target = computed(() => props.task?.stock?.targetDate ?? "");
// Each card counts one place: the makeline first, then, once that is done, the fridge.
const location = computed<Location>(() => (props.task?.stock?.location === "chambre" ? "chambre" : "makeline"));
const weekday = computed(() => (target.value ? weekdayOfIso(target.value) : 1));
const dayName = computed(() => weekdayName(weekday.value as Weekday, locale.value));

const status = ref<"loading" | "ready" | "error">("loading");
const items = ref<StockItem[]>([]);
const counts = ref<StockCounts>({});
const makelineFinished = ref(false);
const finishing = ref(false);
const saveError = ref(false);
const finishError = ref(false);
const list = ref<HTMLElement | null>(null);

const lines = computed(() => stockLines(items.value, counts.value, weekday.value));
const progress = computed(() => countProgress(lines.value, location.value));
const remaining = computed(() => progress.value.total - progress.value.counted);
const rows = computed(() =>
  lines.value.filter((line) => line[location.value]).map((line) => ({ item: line.item, line: line[location.value]! })),
);
// The fridge can only be counted once the makeline is finished.
const locked = computed(() => location.value === "chambre" && !makelineFinished.value);

const isUnauthorized = (err: unknown) => err instanceof TodoApiError && err.status === 401;

// ─── Loading ──────────────────────────────────────────────────────────────────
async function load() {
  status.value = "loading";
  finishError.value = false;
  try {
    const [stock, saved] = await Promise.all([
      fetchStock(props.storeId, props.token),
      fetchStockCount(props.storeId, props.token, target.value),
    ]);
    items.value = stock.items;
    counts.value = saved.counts;
    makelineFinished.value = saved.makelineFinished;
    status.value = "ready";
  } catch (err) {
    if (isUnauthorized(err)) emit("error", err);
    status.value = "error";
  }
}

// ─── Saving ───────────────────────────────────────────────────────────────────
// Every tap is kept on screen at once and sent a moment later, so rapid taps on + make
// one request. Each count is its own small write: two phones counting different places
// at the same time don't overwrite each other.
const dirty = new Map<string, { itemId: string; location: Location; value: number | null }>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let localVersion = 0;

function setCount(itemId: string, location: Location, value: number | null) {
  const entry = { ...counts.value[itemId] };
  if (value === null) delete entry[location];
  else entry[location] = value;
  counts.value = { ...counts.value, [itemId]: entry };

  localVersion++;
  dirty.set(`${itemId}:${location}`, { itemId, location, value });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

async function flush() {
  clearTimeout(saveTimer);
  if (!dirty.size) return;
  const batch = [...dirty.entries()];
  dirty.clear();

  const results = await Promise.allSettled(
    batch.map(([, change]) => setStockCount(props.storeId, props.token, target.value, change.itemId, change.location, change.value)),
  );
  let failed = false;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    failed = true;
    const [key, change] = batch[index];
    if (!dirty.has(key)) dirty.set(key, change); // kept for the retry
    if (isUnauthorized(result.reason)) emit("error", result.reason);
  });
  saveError.value = failed;
}

// Someone else may be counting the other place on another phone: take their counts in
// every few seconds, but never while this phone has taps that haven't been saved.
let syncTimer: ReturnType<typeof setInterval> | undefined;

async function sync() {
  if (status.value !== "ready" || dirty.size || finishing.value || document.visibilityState !== "visible") return;
  const version = localVersion;
  try {
    // Products added meanwhile (say, a missing one added from the Stock button) show up too
    const [stock, saved] = await Promise.all([
      fetchStock(props.storeId, props.token),
      fetchStockCount(props.storeId, props.token, target.value),
    ]);
    items.value = stock.items;
    makelineFinished.value = saved.makelineFinished;
    if (version === localVersion && !dirty.size) counts.value = saved.counts;
  } catch {
    /* a missed refresh is fine */
  }
}

const stopSync = () => clearInterval(syncTimer);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await load();
      stopSync();
      syncTimer = setInterval(sync, SYNC_MS);
    } else {
      stopSync();
      await flush();
    }
  },
);

onBeforeUnmount(() => {
  stopSync();
  flush();
});

// ─── The button at the bottom ─────────────────────────────────────────────────
// Until everything is counted it jumps to the next product still to do; after that it finishes.
async function onPrimary() {
  if (remaining.value > 0) return jumpToNext();

  await flush();
  if (saveError.value) return;
  finishing.value = true;
  finishError.value = false;
  try {
    const result = await finishStockCount(props.storeId, props.token, target.value, location.value);
    emit("finished", location.value, result.prepare);
  } catch (err) {
    if (isUnauthorized(err)) emit("error", err);
    finishError.value = true;
  } finally {
    finishing.value = false;
  }
}

async function jumpToNext() {
  const row = rows.value.find((entry) => entry.line.counted === null);
  if (!row) return;
  const element = list.value?.querySelector<HTMLElement>(`[data-row="${row.item.id}"]`);
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  element?.classList.add("nudge");
  setTimeout(() => element?.classList.remove("nudge"), 1100);
}
</script>

<style scoped>
.meter {
  margin-bottom: 10px;
}

.meter-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--on-surface-variant);
  font-size: 14px;
}

.meter-day {
  margin-left: auto;
  color: var(--on-surface);
  font-size: 15px;
  font-weight: 600;
}

.meter-count {
  color: var(--on-surface);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--surface-high);
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--primary);
  transform-origin: left;
  transition: transform 300ms var(--ease-emphasized);
}

.hint {
  color: var(--on-surface-variant);
  font-size: 14px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rows :deep(.row.nudge) {
  animation: stock-nudge 1000ms var(--ease-emphasized);
}

@keyframes stock-nudge {
  20%,
  60% {
    background: var(--primary-container);
    transform: scale(1.015);
  }
}

.skeletons {
  display: grid;
  gap: 8px;
  padding-top: 8px;
}

.skeleton {
  height: 64px;
  border-radius: 18px;
  background: var(--surface-container);
  animation: stock-pulse 1.4s ease-in-out infinite;
}

@keyframes stock-pulse {
  50% {
    opacity: 0.5;
  }
}

.message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 8px;
  color: var(--on-surface-variant);
  text-align: center;
}

.text-button {
  min-height: 48px;
  padding: 0 24px;
  border-radius: 24px;
  color: var(--primary);
  font-weight: 600;
}

.problem {
  margin-bottom: 8px;
  color: var(--error);
  font-size: 14px;
  text-align: center;
}

.link {
  margin-left: 4px;
  padding: 6px 12px;
  border-radius: 16px;
  color: var(--primary);
  font-weight: 700;
}

.primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  border-radius: 28px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 17px;
  font-weight: 600;
}

.primary:disabled {
  opacity: 0.6;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: stock-spin 700ms linear infinite;
}

@keyframes stock-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
