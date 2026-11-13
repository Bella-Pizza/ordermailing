<template>
  <TodoSheet :open="open" :title="t('todo.stock.countSheetTitle')" @close="emit('close')">
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

      <div class="tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab state-layer"
          :class="{ active: tab.key === current }"
          type="button"
          role="tab"
          :aria-selected="tab.key === current"
          @click="current = tab.key"
        >
          <span class="tab-label">{{ tab.label }}</span>
          <span class="tab-meta" :class="{ done: tab.complete }">
            <Check v-if="tab.complete" :size="14" :stroke-width="3" aria-hidden="true" />
            {{ tab.meta }}
          </span>
        </button>
      </div>
    </template>

    <div v-if="status === 'loading'" class="skeletons" aria-hidden="true">
      <div v-for="i in 6" :key="i" class="skeleton" />
    </div>

    <div v-else-if="status === 'error'" class="message" role="alert">
      <p>{{ t("todo.stock.loadError") }}</p>
      <button class="text-button state-layer" type="button" @click="load">{{ t("todo.retry") }}</button>
    </div>

    <p v-else-if="!lines.length" class="message">{{ t("todo.stock.noItems") }}</p>

    <template v-else>
      <ul v-if="current !== 'prep'" ref="list" class="rows">
        <TodoStockRow
          v-for="entry in rowsFor(current)"
          :key="`${current}-${entry.item.id}`"
          :row-id="entry.item.id"
          :name="entry.item.name"
          :ideal="entry.line.ideal"
          :value="entry.line.counted"
          @update:value="(value) => setCount(entry.item.id, current as Location, value)"
        />
      </ul>

      <div v-else class="results">
        <p class="lead">{{ resultsLead }}</p>
        <ul v-if="prep.length" class="prep">
          <li v-for="entry in prep" :key="entry.item.id" class="prep-row">
            <span class="prep-name">{{ entry.item.name }}</span>
            <span class="prep-qty">× {{ formatQty(entry.qty) }}</span>
            <span class="prep-parts">{{ partsText(entry.parts) }}</span>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <p v-if="saveError" class="problem" role="alert">
        {{ t("todo.stock.saveError") }}
        <button class="link state-layer" type="button" @click="flush">{{ t("todo.retry") }}</button>
      </p>
      <p v-else-if="finishError" class="problem" role="alert">{{ t("todo.stock.finishError") }}</p>
      <button class="primary state-layer" type="button" :disabled="status !== 'ready' || !lines.length || finishing" @click="onPrimary">
        <span v-if="finishing" class="spinner" aria-hidden="true" />
        {{ remaining > 0 ? t("todo.stock.next", { n: remaining }) : t("todo.stock.finish") }}
      </button>
    </template>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Check } from "lucide-vue-next";
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
import {
  LOCATIONS,
  countProgress,
  formatQty,
  prepList,
  stockLines,
  weekdayOfIso,
  type Location,
  type PrepEntry,
} from "@/lib/stockCalc";
import { useLocale } from "@/lib/useLocale";

type Tab = Location | "prep";

const props = defineProps<{ open: boolean; task: TodoTask | null; storeId: string; token: string }>();
const emit = defineEmits<{ close: []; finished: [prepare: number]; error: [err: unknown] }>();
const { t, locale } = useLocale();

const SAVE_DELAY_MS = 300;
const SYNC_MS = 8_000;

const target = computed(() => props.task?.stock?.targetDate ?? "");
const weekday = computed(() => (target.value ? weekdayOfIso(target.value) : 1));
const dayName = computed(() => weekdayName(weekday.value as Weekday, locale.value));

const status = ref<"loading" | "ready" | "error">("loading");
const items = ref<StockItem[]>([]);
const counts = ref<StockCounts>({});
const current = ref<Tab>("chambre");
const finishing = ref(false);
const saveError = ref(false);
const finishError = ref(false);
const list = ref<HTMLElement | null>(null);

const lines = computed(() => stockLines(items.value, counts.value, weekday.value));
const progress = computed(() => countProgress(lines.value));
const remaining = computed(() => progress.value.total - progress.value.counted);
const prep = computed(() => prepList(lines.value));

const tabs = computed(() => [
  ...LOCATIONS.map((location) => {
    const rows = lines.value.filter((line) => line[location]);
    const done = rows.filter((line) => line[location]!.counted !== null).length;
    return { key: location as Tab, label: t(`todo.stock.${location}`), meta: `${done}/${rows.length}`, complete: rows.length > 0 && done === rows.length };
  }),
  { key: "prep" as Tab, label: t("todo.stock.prep"), meta: String(prep.value.length), complete: false },
]);

const rowsFor = (location: Tab) =>
  location === "prep" ? [] : lines.value.filter((line) => line[location]).map((line) => ({ item: line.item, line: line[location]! }));

const resultsLead = computed(() => {
  if (!progress.value.counted) return t("todo.stock.resultsEmpty");
  if (remaining.value > 0) return t("todo.stock.resultsPartial", { n: prep.value.length });
  if (!prep.value.length) return t("todo.stock.resultsNone");
  return t("todo.stock.resultsDone", { n: prep.value.length, day: dayName.value });
});

const partsText = (parts: PrepEntry["parts"]) =>
  LOCATIONS.filter((location) => parts[location])
    .map((location) => t(`todo.stock.parts.${location}`, { n: formatQty(parts[location]!) }))
    .join(" · ");

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
    status.value = "ready";
    // Start where there is still something to count; once everything is, on the result.
    current.value = LOCATIONS.find((location) => lines.value.some((line) => line[location]?.counted === null)) ?? "prep";
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
    const result = await finishStockCount(props.storeId, props.token, target.value);
    emit("finished", result.prepare);
  } catch (err) {
    if (isUnauthorized(err)) emit("error", err);
    finishError.value = true;
  } finally {
    finishing.value = false;
  }
}

async function jumpToNext() {
  const places = [current.value, ...LOCATIONS].filter((tab): tab is Location => tab !== "prep");
  for (const location of places) {
    const row = lines.value.find((line) => line[location]?.counted === null);
    if (!row) continue;
    current.value = location;
    await nextTick();
    const element = list.value?.querySelector<HTMLElement>(`[data-row="${row.item.id}"]`);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    element?.classList.add("nudge");
    setTimeout(() => element?.classList.remove("nudge"), 1100);
    return;
  }
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

.tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 20px;
  background: var(--surface-container);
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 56px;
  padding: 4px 4px;
  border-radius: 16px;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  transition:
    background-color 160ms linear,
    color 160ms linear;
}

.tab.active {
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.tab-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tab-meta.done {
  color: var(--primary);
}

.tab.active .tab-meta.done {
  color: var(--on-primary-container);
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

.results {
  padding-top: 8px;
}

.lead {
  margin-bottom: 12px;
  color: var(--on-surface-variant);
}

.prep {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prep-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 12px;
  align-items: baseline;
  padding: 12px 16px;
  border-radius: 16px;
  background: var(--surface-container);
}

.prep-name {
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.prep-qty {
  grid-row: span 2;
  align-self: center;
  padding: 4px 12px;
  border-radius: 12px;
  background: var(--primary-container);
  color: var(--on-primary-container);
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.prep-parts {
  color: var(--on-surface-variant);
  font-size: 13px;
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
