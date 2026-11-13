<template>
  <TodoSheet :open="open" :title="t('todo.stock.settingsTitle')" @close="emit('close')">
    <template #top>
      <div class="tabs" role="tablist">
        <button
          v-for="location in LOCATIONS"
          :key="location"
          class="tab state-layer"
          :class="{ active: tab === location }"
          type="button"
          role="tab"
          :aria-selected="tab === location"
          @click="tab = location"
        >
          {{ t(`todo.stock.${location}`) }}
        </button>
      </div>

      <div class="statusline">
        <span class="days-note">{{ daysNote }}</span>
        <span class="saved" :class="{ bad: failed }" role="status" aria-live="polite">
          <template v-if="failed">{{ t("todo.stock.notSaved") }}</template>
          <template v-else-if="pending">{{ t("todo.stock.saving") }}</template>
          <template v-else-if="savedOnce"><Check :size="14" :stroke-width="3" aria-hidden="true" /> {{ t("todo.stock.saved") }}</template>
        </span>
      </div>

      <!-- On wide screens one header row labels the day columns for every product -->
      <div class="dayheader" aria-hidden="true">
        <span v-for="day in WEEKDAYS" :key="day">{{ t(`todo.day.${day}`) }}</span>
      </div>
    </template>

    <div v-if="status === 'loading'" class="skeletons" aria-hidden="true">
      <div v-for="i in 5" :key="i" class="skeleton" />
    </div>

    <div v-else-if="status === 'error'" class="message" role="alert">
      <p>{{ t("todo.stock.loadError") }}</p>
      <button class="text-button state-layer" type="button" @click="load">{{ t("todo.retry") }}</button>
    </div>

    <template v-else>
      <!-- Adding a product: a name and one quantity per place, applied to every open day -->
      <form v-if="addOpen || !items.length" ref="addPanel" class="addpanel" @submit.prevent="addItem">
        <h3 class="addpanel-title">{{ t("todo.stock.addTitle") }}</h3>
        <label class="field">
          <span class="field-label">{{ t("todo.stock.addNameLabel") }}</span>
          <input
            ref="addNameInput"
            v-model="addName"
            class="add-input"
            type="text"
            maxlength="60"
            autocomplete="off"
            :placeholder="t('todo.stock.addPlaceholder')"
          />
        </label>
        <p class="field-hint">{{ t("todo.stock.addQtyHint") }}</p>
        <div class="qtys">
          <label v-for="location in LOCATIONS" :key="location" class="field">
            <span class="field-label">{{ t(`todo.stock.${location}`) }}</span>
            <input
              v-model="addQty[location]"
              class="qty-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="–"
              @focus="selectAll"
            />
          </label>
        </div>
        <p v-if="addError" class="add-error" role="alert">{{ addError }}</p>
        <p v-if="lastAdded" class="added" role="status">
          <Check :size="16" :stroke-width="3" aria-hidden="true" />
          {{ t("todo.stock.addAdded", { name: lastAdded.name }) }}
          <button class="link state-layer" type="button" @click="viewAdded">{{ t("todo.stock.addView") }}</button>
        </p>
        <div class="addpanel-actions">
          <button v-if="items.length" class="ghost state-layer" type="button" @click="addOpen = false">{{ t("todo.stock.addClose") }}</button>
          <button class="add-button state-layer" type="submit" :disabled="!addName.trim() || addBusy">
            <Plus :size="20" aria-hidden="true" />
            {{ t("todo.stock.add") }}
          </button>
        </div>
      </form>

      <p class="hint">{{ t("todo.stock.settingsHint") }}</p>
      <p v-if="!items.length" class="message">{{ t("todo.stock.empty") }}</p>

      <ul ref="list" class="products">
        <li v-for="item in items" :key="item.id" class="product" :class="{ unused: isUnused(item) }" :data-item="item.id" :data-name="item.name">
          <input
            class="name"
            type="text"
            maxlength="60"
            autocomplete="off"
            v-field-value="item.name"
            :aria-label="t('todo.stock.name')"
            @change="rename(item, $event)"
          />

          <label v-for="day in WEEKDAYS" :key="day" class="cell">
            <span class="day">{{ t(`todo.day.${day}`) }}</span>
            <input
              class="cell-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              v-field-value="formatQty(item[tab][String(day)] ?? 0)"
              :aria-label="t('todo.stock.idealOf', { name: item.name, day: weekdayName(day, locale) })"
              @focus="selectAll"
              @change="setIdeal(item, day, $event)"
              @keydown.enter.prevent="focusNextCell($event)"
            />
          </label>

          <button
            class="del state-layer"
            :class="{ confirming: confirming === item.id }"
            type="button"
            :aria-label="confirming === item.id ? t('todo.stock.confirmDelete', { name: item.name }) : t('todo.stock.delete', { name: item.name })"
            @click="askDelete(item)"
          >
            <Trash2 :size="20" aria-hidden="true" />
            <span v-if="confirming === item.id" class="del-text">{{ t("todo.stock.sure") }}</span>
          </button>
        </li>
      </ul>
    </template>

    <template #footer>
      <button class="newbtn state-layer" type="button" :disabled="status !== 'ready'" :aria-expanded="addOpen" @click="openAdd">
        <Plus :size="22" aria-hidden="true" />
        {{ t("todo.stock.addTitle") }}
      </button>
    </template>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Check, Plus, Trash2 } from "lucide-vue-next";
import TodoSheet from "./TodoSheet.vue";
import { vFieldValue } from "./fieldValue";
import {
  createStockItem,
  deleteStockItem,
  fetchStock,
  TodoApiError,
  updateStockItem,
  weekdayName,
  WEEKDAYS,
  type StockItem,
  type Weekday,
} from "@/lib/todoApi";
import { LOCATIONS, formatQty, openWeekdays, parseQty, type Location } from "@/lib/stockCalc";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{ open: boolean; storeId: string; token: string }>();
const emit = defineEmits<{ close: []; error: [err: unknown] }>();
const { t, locale } = useLocale();

const status = ref<"loading" | "ready" | "error">("loading");
const items = ref<StockItem[]>([]);
const tab = ref<Location>("chambre");
const list = ref<HTMLElement | null>(null);

const pending = ref(0); // saves on their way
const failed = ref(false);
const savedOnce = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    // Every time the sheet opens, it starts with a clean form
    addOpen.value = false;
    addName.value = "";
    addQty.value = { chambre: "", makeline: "" };
    addError.value = "";
    lastAdded.value = null;
    load();
  },
);

async function load() {
  status.value = "loading";
  try {
    items.value = (await fetchStock(props.storeId, props.token)).items;
    status.value = "ready";
  } catch (err) {
    if (err instanceof TodoApiError && err.status === 401) emit("error", err);
    status.value = "error";
  }
}

// ─── Which days count as open ─────────────────────────────────────────────────
// A day where every quantity is 0 is a closed day: nobody counts for it, and the count
// on the day before prepares for the next open day instead.
const daysNote = computed(() => {
  if (!items.value.length) return "";
  const open = openWeekdays(items.value);
  const closed = WEEKDAYS.filter((day) => !open.includes(day));
  if (!closed.length) return t("todo.stock.openAll");
  if (!open.length) return t("todo.stock.openNone");
  return t("todo.stock.closedDays", { days: closed.map((day) => t(`todo.day.${day}`)).join(", ") });
});

const isUnused = (item: StockItem) => WEEKDAYS.every((day) => (item[tab.value][String(day)] ?? 0) === 0);

// ─── Saving ───────────────────────────────────────────────────────────────────
// Each change is saved the moment it's made, as its own small write, so people editing
// different cells at once never overwrite each other. A failed one is put back.
async function save(run: () => Promise<unknown>, undo: () => void) {
  pending.value++;
  failed.value = false;
  try {
    await run();
    savedOnce.value = true;
  } catch (err) {
    undo();
    failed.value = true;
    if (err instanceof TodoApiError && err.status === 401) emit("error", err);
  } finally {
    pending.value--;
  }
}

const patchItem = (id: string, change: (item: StockItem) => StockItem) => {
  items.value = items.value.map((item) => (item.id === id ? change(item) : item));
};

const setLocal = (id: string, location: Location, day: Weekday, amount: number) =>
  patchItem(id, (item) => ({ ...item, [location]: { ...item[location], [String(day)]: amount } }));

function setIdeal(item: StockItem, day: Weekday, event: Event) {
  const field = event.target as HTMLInputElement;
  const location = tab.value;
  const before = item[location][String(day)] ?? 0;
  const amount = field.value.trim() === "" ? 0 : parseQty(field.value);

  if (amount === null) {
    field.value = formatQty(before); // not a quantity: put back what was there
    return;
  }
  field.value = formatQty(amount);
  if (amount === before) return;

  setLocal(item.id, location, day, amount);
  save(
    () => updateStockItem(props.storeId, props.token, item.id, { [location]: { [String(day)]: amount } }),
    () => setLocal(item.id, location, day, before),
  );
}

function rename(item: StockItem, event: Event) {
  const field = event.target as HTMLInputElement;
  const name = field.value.trim().replace(/\s+/g, " ");
  if (!name) {
    field.value = item.name;
    return;
  }
  if (name === item.name) return;
  const before = item.name;
  patchItem(item.id, (entry) => ({ ...entry, name }));
  save(
    () => updateStockItem(props.storeId, props.token, item.id, { name }),
    () => patchItem(item.id, (entry) => ({ ...entry, name: before })),
  );
}

// ─── Removing: the first tap asks, a second one within a few seconds deletes ──
const confirming = ref<string | null>(null);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function askDelete(item: StockItem) {
  if (confirming.value !== item.id) {
    confirming.value = item.id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirming.value = null), 3500);
    return;
  }
  confirming.value = null;
  const before = items.value;
  items.value = items.value.filter((entry) => entry.id !== item.id);
  save(
    () => deleteStockItem(props.storeId, props.token, item.id),
    () => (items.value = before),
  );
}

onBeforeUnmount(() => clearTimeout(confirmTimer));

// ─── Adding ───────────────────────────────────────────────────────────────────
// A new product is a name plus, per place, how much it should hold on every open day.
// Anything finer (a day with more or less) is a tap in the list afterwards.
const addOpen = ref(false);
const addName = ref("");
const addQty = ref<Record<Location, string>>({ chambre: "", makeline: "" });
const addBusy = ref(false);
const addError = ref("");
const lastAdded = ref<StockItem | null>(null);
const addPanel = ref<HTMLElement | null>(null);
const addNameInput = ref<HTMLInputElement | null>(null);

async function openAdd() {
  addOpen.value = true;
  addError.value = "";
  lastAdded.value = null;
  await nextTick();
  addPanel.value?.scrollIntoView({ block: "start", behavior: "smooth" });
  addNameInput.value?.focus();
}

/** "" is none, a quantity is itself, anything else is undefined. */
function readQty(text: string): number | undefined {
  if (!text.trim()) return 0;
  return parseQty(text) ?? undefined;
}

async function addItem() {
  const name = addName.value.trim().replace(/\s+/g, " ");
  if (!name || addBusy.value) return;

  const amounts = { chambre: readQty(addQty.value.chambre), makeline: readQty(addQty.value.makeline) };
  if (amounts.chambre === undefined || amounts.makeline === undefined) {
    addError.value = t("todo.stock.addBadQty");
    return;
  }

  // On the days the shop is open; with nothing set up yet, every day.
  const open = openWeekdays(items.value);
  const days = open.length ? open : [...WEEKDAYS];
  const everyDay = (amount: number) => Object.fromEntries(days.map((day) => [String(day), amount]));

  addBusy.value = true;
  addError.value = "";
  pending.value++;
  failed.value = false;
  try {
    const created = await createStockItem(props.storeId, props.token, {
      name,
      ...(amounts.chambre ? { chambre: everyDay(amounts.chambre) } : {}),
      ...(amounts.makeline ? { makeline: everyDay(amounts.makeline) } : {}),
    });
    items.value = [...items.value, created];
    lastAdded.value = created;
    savedOnce.value = true;
    // The form stays up (in a shop that had no products it was only showing because the list was empty)
    addOpen.value = true;
    // Ready for the next one
    addName.value = "";
    addQty.value = { chambre: "", makeline: "" };
    await nextTick();
    addNameInput.value?.focus();
  } catch (err) {
    addError.value = t("todo.stock.addError");
    if (err instanceof TodoApiError && err.status === 401) emit("error", err);
  } finally {
    pending.value--;
    addBusy.value = false;
  }
}

/** Jumps to the product that was just added, to fine-tune single days. */
async function viewAdded() {
  const created = lastAdded.value;
  if (!created) return;
  addOpen.value = false;
  await nextTick();
  const row = list.value?.querySelector<HTMLElement>(`[data-item="${created.id}"]`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
  row?.querySelector<HTMLInputElement>(".cell-input")?.focus();
}

// ─── Typing ───────────────────────────────────────────────────────────────────
const selectAll = (event: FocusEvent) => (event.target as HTMLInputElement).select();

/** Enter moves to the next quantity, like a spreadsheet. */
function focusNextCell(event: KeyboardEvent) {
  const cells = [...(list.value?.querySelectorAll<HTMLInputElement>(".cell-input") ?? [])];
  const next = cells[cells.indexOf(event.target as HTMLInputElement) + 1];
  if (next) next.focus();
  else (event.target as HTMLInputElement).blur();
}
</script>

<style scoped>
.tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 20px;
  background: var(--surface-container);
}

.tab {
  min-height: 48px;
  border-radius: 16px;
  color: var(--on-surface-variant);
  font-size: 15px;
  font-weight: 600;
  transition:
    background-color 160ms linear,
    color 160ms linear;
}

.tab.active {
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.statusline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  margin-top: 8px;
  font-size: 13px;
}

.days-note {
  color: var(--on-surface-variant);
}

.saved {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--primary);
  font-weight: 600;
}

.saved.bad {
  color: var(--error);
}

.dayheader {
  display: none;
}

.hint {
  margin-bottom: 12px;
  color: var(--on-surface-variant);
  font-size: 14px;
}

.products {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr)) 44px;
  gap: 8px 4px;
  padding: 10px;
  border-radius: 16px;
  background: var(--surface-container);
}

.product.unused .name {
  color: var(--on-surface-variant);
}

.name {
  grid-column: 1 / 8;
  min-width: 0;
  min-height: 44px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--on-surface);
  font-size: 17px;
  font-weight: 600;
}

.name:focus,
.cell-input:focus,
.add-input:focus,
.qty-input:focus {
  border-color: var(--primary);
  background: var(--surface-lowest);
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.del {
  grid-column: 8;
  grid-row: 1;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--on-surface-variant);
}

.del.confirming {
  width: auto;
  grid-column: 6 / 9;
  grid-auto-flow: column;
  gap: 4px;
  padding: 0 14px;
  border-radius: 22px;
  background: var(--error-container);
  color: var(--on-error-container);
  font-size: 14px;
  font-weight: 700;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.day {
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 600;
  text-transform: lowercase;
}

.cell-input {
  width: 100%;
  min-width: 0;
  height: 44px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.addpanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--primary);
  border-radius: 20px;
  background: var(--surface-container);
}

.addpanel-title {
  font-size: 18px;
  font-weight: 700;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field-label {
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 600;
}

.field-hint {
  color: var(--on-surface-variant);
  font-size: 13px;
}

.qtys {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.add-input,
.qty-input {
  width: 100%;
  min-width: 0;
  min-height: 52px;
  padding: 0 16px;
  border: 1px solid var(--outline);
  border-radius: 14px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 17px;
}

.qty-input {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.add-error {
  color: var(--error);
  font-size: 14px;
}

.added {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--primary);
  font-size: 14px;
  font-weight: 600;
}

.link {
  padding: 6px 12px;
  border-radius: 16px;
  color: var(--primary);
  font-weight: 700;
  text-decoration: underline;
}

.addpanel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost {
  min-height: 52px;
  padding: 0 20px;
  border-radius: 26px;
  color: var(--primary);
  font-weight: 600;
}

.add-button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 52px;
  padding: 0 22px;
  border-radius: 26px;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
}

.add-button:disabled {
  opacity: 0.5;
}

.newbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 56px;
  border-radius: 28px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 17px;
  font-weight: 600;
}

.newbtn:disabled {
  opacity: 0.6;
}

.skeletons {
  display: grid;
  gap: 8px;
}

.skeleton {
  height: 96px;
  border-radius: 16px;
  background: var(--surface-container);
  animation: stock-set-pulse 1.4s ease-in-out infinite;
}

@keyframes stock-set-pulse {
  50% {
    opacity: 0.5;
  }
}

.message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 8px;
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

/* Wide enough for one line per product: name, seven days, delete */
@media (min-width: 600px) {
  .dayheader,
  .product {
    grid-template-columns: minmax(90px, 1fr) repeat(7, 48px) 40px;
    column-gap: 4px;
  }

  .dayheader {
    display: grid;
    margin-top: 4px;
    padding: 0 10px;
    color: var(--on-surface-variant);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    text-transform: lowercase;
  }

  .dayheader span:first-child {
    grid-column: 2;
  }

  .product {
    align-items: center;
    padding: 6px 10px;
  }

  .name {
    grid-column: 1;
  }

  .cell .day {
    display: none;
  }

  .del {
    grid-column: 9;
    width: 40px;
    height: 40px;
  }

  .del.confirming {
    grid-column: 7 / 10;
    width: auto;
  }
}
</style>
