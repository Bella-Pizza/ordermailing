<template>
  <div ref="root" class="board">
    <!-- Everything behind an open sheet is inert, which also keeps Tab inside the sheet -->
    <div :inert="anySheetOpen">
      <header class="appbar">
        <button class="store-switch state-layer" type="button" :aria-label="t('todo.switchStore')" @click="emit('switchStore')">
          <span class="store-name">{{ storeName }}</span>
          <ChevronsUpDown :size="18" aria-hidden="true" />
        </button>
        <span class="appbar-date">{{ todayLong }}</span>
        <button
          class="icon-button state-layer"
          type="button"
          :disabled="status !== 'ready'"
          :aria-label="t('todo.stock.settingsTitle')"
          :title="t('todo.stock.settingsTitle')"
          aria-haspopup="dialog"
          @click="stockSettingsOpen = true"
        >
          <Boxes :size="22" aria-hidden="true" />
        </button>
        <button
          class="icon-button state-layer"
          type="button"
          :disabled="status !== 'ready'"
          :aria-label="t('todo.recurring.title')"
          :title="t('todo.recurring.title')"
          aria-haspopup="dialog"
          @click="recurringSheetOpen = true"
        >
          <Repeat :size="22" aria-hidden="true" />
        </button>
        <button class="lang state-layer" type="button" :aria-label="t('todo.switchLanguage')" @click="toggleLang">
          {{ lang === "en" ? "FR" : "EN" }}
        </button>
      </header>

      <main class="main">
        <div v-if="status === 'loading'" class="skeletons" aria-hidden="true">
          <div v-for="i in 4" :key="i" class="skeleton" />
        </div>

        <div v-else-if="status === 'error'" class="load-error" role="alert">
          <CloudOff :size="32" aria-hidden="true" />
          <p>{{ t("todo.board.loadError") }}</p>
          <button class="retry state-layer" type="button" @click="load">{{ t("todo.retry") }}</button>
        </div>

        <template v-else>
          <p v-if="showSwipeHint && open.length" class="swipe-hint">{{ t("todo.board.swipeHint") }}</p>

          <TransitionGroup tag="div" name="section" class="sections">
            <section
              v-for="section in sections"
              :key="section.key"
              class="section"
              :class="[`section-${section.key}`]"
              :aria-labelledby="`todo-section-${section.key}`"
            >
              <div class="section-head">
                <h2 :id="`todo-section-${section.key}`">{{ section.title }}</h2>
                <span class="section-date">{{ section.subtitle }}</span>
                <span class="section-count" :aria-label="t('todo.board.taskCount', { n: section.tasks.length })">
                  {{ section.tasks.length }}
                </span>
              </div>

              <TransitionGroup tag="ul" name="task" class="tasks">
                <TodoItem
                  v-for="task in section.tasks"
                  :key="task.id"
                  :task="task"
                  :date-label="section.showDates ? shortDate(task.dueDate) : undefined"
                  :overdue="section.key === 'overdue'"
                  @complete="(card, swiped) => completeTask(task, card, swiped)"
                  @blocked="(remaining) => showSnackbar(t('todo.checklist.notDone', { n: remaining }))"
                  @delete="removeTask(task)"
                  @edit="openEdit(task)"
                  @swiped="dismissSwipeHint"
                />
              </TransitionGroup>

              <p v-if="!section.tasks.length" class="section-empty">
                <PartyPopper v-if="section.key === 'today'" :size="20" aria-hidden="true" />
                {{ section.key === "today" ? t("todo.board.emptyToday") : t("todo.board.emptyTomorrow") }}
              </p>
            </section>
          </TransitionGroup>
        </template>
      </main>

      <div class="bottom-bar">
        <button
          ref="drawerButton"
          class="drawer-button state-layer"
          type="button"
          :disabled="status !== 'ready'"
          aria-haspopup="dialog"
          @click="drawerOpen = true"
        >
          <CheckCheck :size="22" aria-hidden="true" />
          <span>{{ t("todo.board.completed") }}</span>
          <span class="drawer-count">{{ displayedCompletedCount }}</span>
        </button>
        <button class="fab state-layer" type="button" :disabled="status !== 'ready'" :aria-label="t('todo.form.newTitle')" @click="openAdd">
          <Plus :size="28" aria-hidden="true" />
          <span class="fab-label">{{ t("todo.form.newTitle") }}</span>
        </button>
      </div>
    </div>

    <TodoTaskSheet
      ref="taskSheet"
      :open="taskSheetOpen"
      :task="editingTask"
      :recurring="editingRecurring"
      :start-repeating="startRepeating"
      :categories="categories"
      :today="today"
      :saving="saving"
      @close="closeTaskSheet"
      @save="saveTask"
      @save-recurring="saveRecurring"
      @delete="deleteFromSheet"
      @delete-recurring="removeRecurring"
      @edit-recurring="openEditRecurringById"
    />

    <TodoChecklistSheet
      :open="checklistOpen"
      :task="checklistTask"
      @close="checklistOpen = false"
      @toggle="toggleChecklistItem"
      @edit-task="(task) => openTaskSheet({ task })"
      @edit-series="openEditRecurringById"
    />

    <TodoRecurringSheet
      :open="recurringSheetOpen"
      :recurring="recurring"
      @close="recurringSheetOpen = false"
      @edit="openEditRecurring"
      @add="openAddRecurring"
    />

    <TodoStockCountSheet
      :open="stockCountOpen"
      :task="stockCountTask"
      :store-id="store.id"
      :token="token"
      @close="stockCountOpen = false"
      @finished="onStockFinished"
      @error="failed"
    />

    <TodoStockSettingsSheet
      :open="stockSettingsOpen"
      :store-id="store.id"
      :token="token"
      @close="stockSettingsOpen = false"
      @error="failed"
    />

    <TodoSheet :open="drawerOpen" :title="t('todo.board.completed')" @close="drawerOpen = false">
      <p v-if="!completed.length" class="drawer-empty">{{ t("todo.board.emptyCompleted") }}</p>
      <TransitionGroup v-else tag="ul" name="done" class="done-list">
        <li v-for="task in completed" :key="task.id" class="done-row">
          <button
            class="done-reopen state-layer"
            type="button"
            :aria-label="t('todo.task.reopenNamed', { title: taskTitle(task, t, locale) })"
            @click="reopenTask(task)"
          >
            <span class="done-ring"><Check :size="18" :stroke-width="3" aria-hidden="true" /></span>
          </button>
          <div class="done-text">
            <span class="done-title">{{ taskTitle(task, t, locale) }}</span>
            <span class="done-meta">
              <span class="category-chip done-chip" :style="{ '--hue': task.categoryHue }">{{ task.categoryName }}</span>
              {{ completedLabel(task) }}
            </span>
          </div>
          <button
            class="done-delete state-layer"
            type="button"
            :aria-label="t('todo.task.deleteNamed', { title: taskTitle(task, t, locale) })"
            @click="removeTask(task)"
          >
            <Trash2 :size="20" aria-hidden="true" />
          </button>
        </li>
      </TransitionGroup>
    </TodoSheet>

    <div class="snackbar-region" role="status" aria-live="polite">
      <Transition name="snackbar">
        <div v-if="snackbar" :key="snackbar.id" class="snackbar">
          <span>{{ snackbar.message }}</span>
          <button v-if="snackbar.undo" class="snackbar-action state-layer" type="button" @click="runSnackbarUndo">
            {{ t("todo.undo") }}
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  Boxes,
  Check,
  CheckCheck,
  ChevronsUpDown,
  CloudOff,
  PartyPopper,
  Plus,
  Repeat,
  Trash2,
} from "lucide-vue-next";
import TodoChecklistSheet from "./TodoChecklistSheet.vue";
import TodoItem from "./TodoItem.vue";
import TodoRecurringSheet from "./TodoRecurringSheet.vue";
import TodoSheet from "./TodoSheet.vue";
import TodoStockCountSheet from "./TodoStockCountSheet.vue";
import TodoStockSettingsSheet from "./TodoStockSettingsSheet.vue";
import TodoTaskSheet from "./TodoTaskSheet.vue";
import {
  addDays,
  createRecurring,
  createTask,
  deleteRecurring,
  deleteTask,
  fetchBoard,
  isoDay,
  parseDay,
  taskTitle,
  TodoApiError,
  updateRecurring,
  updateTask,
  type RecurringInput,
  type RecurringTask,
  type TaskInput,
  type TodoCategory,
  type TodoStore,
  type TodoTask,
} from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const POLL_MS = 30_000;
const SNACKBAR_MS = 5_000;
const CHECK_BEAT_MS = 180; // Lets the check mark register before the task flies away
const HINT_KEY = "todo_swipe_hint_dismissed";

const props = defineProps<{ store: TodoStore; token: string }>();
const emit = defineEmits<{ unauthorized: []; notFound: []; switchStore: [] }>();
const { t, lang, setLang, locale } = useLocale();

const toggleLang = () => setLang(lang.value === "en" ? "fr" : "en");

const root = ref<HTMLElement | null>(null);
const drawerButton = ref<HTMLElement | null>(null);
const taskSheet = ref<InstanceType<typeof TodoTaskSheet> | null>(null);

const status = ref<"loading" | "ready" | "error">("loading");
const storeName = ref(props.store.name);
const open = ref<TodoTask[]>([]);
const completed = ref<TodoTask[]>([]);
const categories = ref<TodoCategory[]>([]);
const recurring = ref<RecurringTask[]>([]);
const today = ref(isoDay(new Date()));

const taskSheetOpen = ref(false);
const drawerOpen = ref(false);
const recurringSheetOpen = ref(false);
const checklistOpen = ref(false);
const checklistTaskId = ref<string | null>(null);
// Looked up live, so ticks (and background refreshes) show in the open sheet.
const checklistTask = computed(() => open.value.find((task) => task.id === checklistTaskId.value) ?? null);
const stockSettingsOpen = ref(false);
const stockCountOpen = ref(false);
const stockCountTaskId = ref<string | null>(null);
const stockCountTask = computed(() => open.value.find((task) => task.id === stockCountTaskId.value) ?? null);
const anySheetOpen = computed(
  () =>
    taskSheetOpen.value ||
    drawerOpen.value ||
    recurringSheetOpen.value ||
    checklistOpen.value ||
    stockSettingsOpen.value ||
    stockCountOpen.value,
);
const editingTask = shallowRef<TodoTask | null>(null);
const editingRecurring = shallowRef<RecurringTask | null>(null);
const startRepeating = ref(false);
// Set when the task sheet was opened from the recurring list, to go back there after.
const returnToRecurring = ref(false);
const saving = ref(false);

// ─── Loading ──────────────────────────────────────────────────────────────────
// Other devices change this list too, so it refreshes in the background. A response
// is thrown away if anything changed locally while it was on its way, otherwise it
// could briefly undo what the user just did.
let localChanges = 0;
let writesInFlight = 0;

async function load() {
  const startedAt = localChanges;
  if (status.value === "error") status.value = "loading";
  try {
    const data = await fetchBoard(props.store.id, props.token, today.value);
    if (startedAt !== localChanges || writesInFlight > 0) return;
    storeName.value = data.storeName;
    open.value = data.open.filter((task) => !pendingDeletes.has(task.id));
    completed.value = data.completed.filter((task) => !pendingDeletes.has(task.id));
    categories.value = data.categories;
    recurring.value = data.recurring;
    status.value = "ready";
  } catch (err) {
    if (handleAuthError(err)) return;
    // A failed background refresh shouldn't replace a list that's still useful.
    if (status.value !== "ready") status.value = "error";
  }
}

function handleAuthError(err: unknown): boolean {
  if (err instanceof TodoApiError && err.status === 401) {
    emit("unauthorized");
    return true;
  }
  if (err instanceof TodoApiError && err.status === 404 && status.value !== "ready") {
    emit("notFound");
    return true;
  }
  return false;
}

async function write<T>(run: () => Promise<T>): Promise<T> {
  localChanges++;
  writesInFlight++;
  try {
    return await run();
  } finally {
    writesInFlight--;
  }
}

function refresh() {
  if (document.visibilityState !== "visible") return;
  today.value = isoDay(new Date()); // Moves tasks along when the page stays open past midnight
  load();
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  load();
  pollTimer = setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("pagehide", flushDeletes);
  try {
    showSwipeHint.value = !localStorage.getItem(HINT_KEY);
  } catch {
    /* Storage blocked: the hint just stays visible */
  }
});

onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearTimeout(snackbarTimer);
  document.removeEventListener("visibilitychange", refresh);
  window.removeEventListener("pagehide", flushDeletes);
  flushDeletes();
});

// ─── Sections ─────────────────────────────────────────────────────────────────
const longDate = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { weekday: "long", day: "numeric", month: "long" }).format(parseDay(iso));
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { weekday: "short", day: "numeric", month: "short" }).format(parseDay(iso));

const todayLong = computed(() => longDate(today.value));

const byPriority = (a: TodoTask, b: TodoTask) =>
  b.importance - a.importance || a.createdAt.localeCompare(b.createdAt);
const byDateThenPriority = (a: TodoTask, b: TodoTask) => a.dueDate.localeCompare(b.dueDate) || byPriority(a, b);

const sections = computed(() => {
  const tomorrow = addDays(today.value, 1);
  const inRange = (test: (due: string) => boolean) => open.value.filter((task) => test(task.dueDate));

  const overdue = inRange((due) => due < today.value).sort(byDateThenPriority);
  const later = inRange((due) => due > tomorrow).sort(byDateThenPriority);

  return [
    ...(overdue.length
      ? [{ key: "overdue", title: t("todo.section.overdue"), subtitle: "", tasks: overdue, showDates: true }]
      : []),
    {
      key: "today",
      title: t("todo.section.today"),
      subtitle: longDate(today.value),
      tasks: inRange((due) => due === today.value).sort(byPriority),
      showDates: false,
    },
    {
      key: "tomorrow",
      title: t("todo.section.tomorrow"),
      subtitle: longDate(tomorrow),
      tasks: inRange((due) => due === tomorrow).sort(byPriority),
      showDates: false,
    },
    ...(later.length
      ? [{ key: "later", title: t("todo.section.later"), subtitle: "", tasks: later, showDates: true }]
      : []),
  ];
});

function completedLabel(task: TodoTask): string {
  if (!task.completedAt) return "";
  const when = new Date(task.completedAt);
  const time = new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit" }).format(when);
  return isoDay(when) === today.value ? time : `${shortDate(isoDay(when))}, ${time}`;
}

// ─── Swipe hint ───────────────────────────────────────────────────────────────
const showSwipeHint = ref(false);

function dismissSwipeHint() {
  showSwipeHint.value = false;
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* Storage blocked: nothing to remember */
  }
}

// ─── Snackbar ─────────────────────────────────────────────────────────────────
type Snackbar = { id: number; message: string; undo?: () => void };
const snackbar = shallowRef<Snackbar | null>(null);
let snackbarId = 0;
let snackbarTimer: ReturnType<typeof setTimeout> | undefined;

function showSnackbar(message: string, undo?: () => void) {
  clearTimeout(snackbarTimer);
  snackbar.value = { id: ++snackbarId, message, undo };
  snackbarTimer = setTimeout(() => (snackbar.value = null), SNACKBAR_MS);
}

function runSnackbarUndo() {
  const undo = snackbar.value?.undo;
  clearTimeout(snackbarTimer);
  snackbar.value = null;
  undo?.();
}

function failed(err: unknown) {
  if (!handleAuthError(err)) showSnackbar(t("todo.board.saveError"));
}

// ─── Completing ───────────────────────────────────────────────────────────────
const landing = ref(0); // Tasks in flight, not counted on the drawer until they arrive
const displayedCompletedCount = computed(() => Math.max(0, completed.value.length - landing.value));
const completing = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fly a copy of the card into the drawer button, while the real row leaves the list. */
function flyToDrawer(card: HTMLElement) {
  const target = drawerButton.value;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!target || !root.value || reduceMotion || !card.animate) return;

  const from = card.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const endScale = Math.min(0.3, to.width / from.width);

  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    transform: "none",
    zIndex: "30",
    pointerEvents: "none",
    transition: "none",
  });
  root.value.appendChild(ghost);

  landing.value++;
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 16}px) scale(0.82)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${endScale})`, opacity: 0.25, offset: 1 },
    ],
    { duration: 520, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" },
  );
  flight.onfinish = flight.oncancel = () => {
    ghost.remove();
    landing.value--;
    target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
      { duration: 280, easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" },
    );
  };
}

async function completeTask(task: TodoTask, card: HTMLElement, swiped: boolean) {
  if (completing.has(task.id)) return;
  completing.add(task.id);
  if (!swiped) await sleep(CHECK_BEAT_MS);

  flyToDrawer(card);
  const done: TodoTask = { ...task, completedAt: new Date().toISOString() };
  open.value = open.value.filter((item) => item.id !== task.id);
  completed.value = [done, ...completed.value];
  completing.delete(task.id);

  const saved = write(() => updateTask(props.store.id, props.token, task.id, { completed: true }));
  showSnackbar(t("todo.board.taskCompleted"), () => reopenTask(done, saved));
  try {
    await saved;
  } catch (err) {
    completed.value = completed.value.filter((item) => item.id !== task.id);
    open.value = [...open.value, task];
    failed(err);
  }
}

async function reopenTask(task: TodoTask, afterSave?: Promise<unknown>) {
  const reopened: TodoTask = { ...task, completedAt: null };
  completed.value = completed.value.filter((item) => item.id !== task.id);
  open.value = [...open.value, reopened];
  try {
    await write(async () => {
      await afterSave?.catch(() => undefined); // An undo must land after the completion it undoes
      await updateTask(props.store.id, props.token, task.id, { completed: false });
    });
  } catch (err) {
    open.value = open.value.filter((item) => item.id !== task.id);
    completed.value = [task, ...completed.value];
    failed(err);
  }
}

// ─── Deleting ─────────────────────────────────────────────────────────────────
// Sent only once the Undo window has passed, or straight away if the page closes.
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

function sendDelete(taskId: string, keepalive = false) {
  pendingDeletes.delete(taskId);
  return write(() => deleteTask(props.store.id, props.token, taskId, keepalive));
}

function flushDeletes() {
  for (const [taskId, timer] of [...pendingDeletes]) {
    clearTimeout(timer);
    sendDelete(taskId, true).catch(() => undefined);
  }
}

function removeTask(task: TodoTask) {
  const wasCompleted = !!task.completedAt;
  const list = wasCompleted ? completed : open;
  list.value = list.value.filter((item) => item.id !== task.id);
  localChanges++;

  const restore = () => {
    list.value = wasCompleted ? [task, ...list.value] : [...list.value, task];
  };

  pendingDeletes.set(
    task.id,
    setTimeout(() => {
      sendDelete(task.id).catch((err) => {
        restore();
        failed(err);
      });
    }, SNACKBAR_MS),
  );

  showSnackbar(t("todo.board.taskDeleted"), () => {
    clearTimeout(pendingDeletes.get(task.id));
    pendingDeletes.delete(task.id);
    localChanges++;
    restore();
  });
}

function deleteFromSheet(task: TodoTask) {
  taskSheetOpen.value = false;
  removeTask(task);
}

// ─── Adding and editing ───────────────────────────────────────────────────────
function openTaskSheet(options: { task?: TodoTask; recurring?: RecurringTask; repeating?: boolean; fromList?: boolean }) {
  editingTask.value = options.task ?? null;
  editingRecurring.value = options.recurring ?? null;
  startRepeating.value = !!options.repeating;
  returnToRecurring.value = !!options.fromList;
  recurringSheetOpen.value = false;
  checklistOpen.value = false;
  taskSheetOpen.value = true;
}

const openAdd = () => openTaskSheet({});

// A task with a checklist opens the list to tick off; its details are a tap further.
function openEdit(task: TodoTask) {
  if (task.stock?.kind === "count") {
    stockCountTaskId.value = task.id;
    stockCountOpen.value = true;
  } else if (task.checklist?.length) {
    checklistTaskId.value = task.id;
    checklistOpen.value = true;
  } else {
    openTaskSheet({ task });
  }
}

async function toggleChecklistItem(index: number, done: boolean) {
  const task = checklistTask.value;
  if (!task?.checklist) return;
  const setDone = (value: boolean) => {
    open.value = open.value.map((item) =>
      item.id === task.id && item.checklist
        ? { ...item, checklist: item.checklist.map((entry, i) => (i === index ? { ...entry, done: value } : entry)) }
        : item,
    );
  };

  setDone(done);
  try {
    await write(() => updateTask(props.store.id, props.token, task.id, { checkItem: { index, done } }));
  } catch (err) {
    setDone(!done);
    failed(err);
    return;
  }

  // Ticking the last item completes the card, flying it into the drawer like any task.
  const latest = open.value.find((item) => item.id === task.id);
  if (done && latest?.checklist?.every((entry) => entry.done)) {
    checklistOpen.value = false;
    await sleep(320);
    const card = root.value?.querySelector<HTMLElement>(`[data-task-id="${task.id}"] .todo-card`);
    if (card) completeTask(latest, card, false);
  }
}
// The count is done and the server has written the "to prepare" list: the count card
// flies into the drawer, and the list shows up on the board.
async function onStockFinished(prepare: number) {
  const card = stockCountTask.value
    ? root.value?.querySelector<HTMLElement>(`[data-task-id="${stockCountTask.value.id}"] .todo-card`)
    : null;
  stockCountOpen.value = false;
  await sleep(320); // lets the sheet slide away first
  if (card?.isConnected) flyToDrawer(card);
  showSnackbar(prepare ? t("todo.stock.finished", { n: prepare }) : t("todo.stock.finishedNone"));
  await load();
}

const openAddRecurring = () => openTaskSheet({ repeating: true, fromList: true });
const openEditRecurring = (item: RecurringTask) => openTaskSheet({ recurring: item, fromList: true });

function openEditRecurringById(recurringId: string) {
  const item = recurring.value.find((r) => r.id === recurringId);
  if (item) openTaskSheet({ recurring: item });
  else showSnackbar(t("todo.recurring.gone"));
}

function closeTaskSheet() {
  taskSheetOpen.value = false;
  if (returnToRecurring.value) recurringSheetOpen.value = true;
  returnToRecurring.value = false;
}

// ─── Recurring tasks ──────────────────────────────────────────────────────────
async function saveRecurring(input: RecurringInput) {
  saving.value = true;
  const editing = editingRecurring.value;
  try {
    const saved = await write(() =>
      editing
        ? updateRecurring(props.store.id, props.token, editing.id, input, today.value)
        : createRecurring(props.store.id, props.token, input),
    );
    // Update the list right away: closing may reopen it before the reload below lands.
    recurring.value = editing
      ? recurring.value.map((item) => (item.id === saved.id ? saved : item))
      : [...recurring.value, saved].sort((a, b) => a.title.localeCompare(b.title));
    closeTaskSheet();
    taskSheet.value?.reset();
    showSnackbar(editing ? t("todo.recurring.saved") : t("todo.recurring.added"));
    await load(); // Brings in today's and tomorrow's copies
  } catch (err) {
    failed(err);
  } finally {
    saving.value = false;
  }
}

async function removeRecurring(item: RecurringTask) {
  saving.value = true;
  try {
    await write(() => deleteRecurring(props.store.id, props.token, item.id, today.value));
    recurring.value = recurring.value.filter((r) => r.id !== item.id);
    closeTaskSheet();
    // Undo recreates it from the same details; its copies for today and tomorrow come back with it.
    showSnackbar(t("todo.recurring.deleted"), async () => {
      try {
        await write(() =>
          createRecurring(props.store.id, props.token, {
            title: item.title,
            days: item.days,
            importance: item.importance,
            category: item.categoryName,
            checklist: item.checklist ?? null,
          }),
        );
        await load();
      } catch (err) {
        failed(err);
      }
    });
    await load();
  } catch (err) {
    failed(err);
  } finally {
    saving.value = false;
  }
}

async function saveTask(input: TaskInput) {
  saving.value = true;
  const editing = editingTask.value;
  try {
    const saved = await write(() =>
      editing
        ? updateTask(props.store.id, props.token, editing.id, input)
        : createTask(props.store.id, props.token, input),
    );
    open.value = editing ? open.value.map((item) => (item.id === saved.id ? saved : item)) : [...open.value, saved];
    closeTaskSheet();
    taskSheet.value?.reset();
    showSnackbar(editing ? t("todo.board.taskSaved") : t("todo.board.taskAdded"));
    load(); // Picks up a new or cleaned-up category
  } catch (err) {
    failed(err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.board {
  min-height: 100dvh;
}

.appbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 8px 8px 8px 4px;
  background: var(--surface);
}

.store-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  padding: 0 10px 0 12px;
  border-radius: 24px;
  color: var(--on-surface);
  font-size: 18px;
  font-weight: 650;
}

.store-switch svg {
  flex: none;
  color: var(--on-surface-variant);
}

.store-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.appbar-date {
  display: none;
  margin-left: auto;
  color: var(--on-surface-variant);
  font-size: 15px;
}

.icon-button {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-left: auto;
  border-radius: 50%;
  color: var(--on-surface-variant);
}

.icon-button + .icon-button {
  margin-left: 0;
}

.lang {
  flex: none;
  min-width: 48px;
  height: 48px;
  border-radius: 24px;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 600;
}

.main {
  max-width: 760px;
  margin: 0 auto;
  padding: 4px 16px 128px;
  /* A card swiped past the edge must not widen the page. clip, not hidden, so this
     doesn't become a scroll container. */
  overflow-x: clip;
}

.swipe-hint {
  margin-bottom: 12px;
  color: var(--on-surface-variant);
  font-size: 14px;
}

.sections {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
}

.section {
  min-width: 0;
}

.section-move {
  transition: transform 320ms var(--ease-emphasized);
}

.section-enter-active {
  transition: opacity 220ms linear;
}

.section-enter-from,
.section-leave-to {
  opacity: 0;
}

.section-leave-active {
  position: absolute;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 10px;
  margin-bottom: 12px;
}

h2 {
  font-size: 32px;
  font-weight: 750;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.section-tomorrow h2,
.section-later h2 {
  font-size: 24px;
  font-weight: 700;
}

.section-overdue h2 {
  color: var(--error);
  font-size: 24px;
}

.section-date {
  flex: 1;
  min-width: 0;
  color: var(--on-surface-variant);
  font-size: 14px;
}

.section-count {
  display: grid;
  place-items: center;
  align-self: center;
  min-width: 32px;
  height: 32px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 16px;
  background: var(--surface-container);
  color: var(--on-surface-variant);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.section-today .section-count {
  background: var(--primary);
  color: var(--on-primary);
}

.section-overdue .section-count {
  background: var(--error);
  color: var(--on-error);
}

.tasks {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.task-move {
  transition: transform 320ms var(--ease-emphasized);
}

.task-enter-active {
  transition:
    opacity 200ms linear,
    transform 320ms var(--ease-decelerate);
}

.task-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

/* The flying copy takes over visually, so the row steps out of the layout at once
   and its neighbours close the gap through .task-move. */
.task-leave-active {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.section-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 18px;
  border: 1px dashed var(--outline-variant);
  border-radius: 20px;
  color: var(--on-surface-variant);
}

.section-empty svg {
  flex: none;
  color: var(--primary);
}

.skeletons {
  display: grid;
  gap: 10px;
  margin-top: 56px;
}

.skeleton {
  height: 76px;
  border-radius: 20px;
  background: var(--surface-container);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 72px 16px;
  color: var(--on-surface-variant);
  text-align: center;
}

.retry {
  min-height: 48px;
  padding: 0 24px;
  border-radius: 24px;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
}

/* ─── Bottom bar ─────────────────────────────────────────────────────────── */
.bottom-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--surface) 62%, transparent);
  pointer-events: none;
}

.bottom-bar > * {
  pointer-events: auto;
}

.drawer-button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 12px 0 16px;
  border-radius: 28px;
  background: var(--surface-high);
  box-shadow: var(--elevation-1);
  color: var(--on-surface);
  font-weight: 600;
}

.drawer-count {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  border-radius: 14px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fab {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 64px;
  height: 64px;
  border-radius: 20px;
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--elevation-3);
  font-size: 16px;
  font-weight: 600;
  transition:
    box-shadow 160ms linear,
    border-radius 200ms var(--ease-emphasized);
}

.fab:active:not(:disabled) {
  border-radius: 28px;
}

.fab-label {
  display: none;
}

/* ─── Completed drawer ───────────────────────────────────────────────────── */
.drawer-empty {
  padding: 32px 0;
  color: var(--on-surface-variant);
  text-align: center;
}

.done-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.done-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 64px;
}

.done-move {
  transition: transform 280ms var(--ease-emphasized);
}

.done-leave-active {
  position: absolute;
  opacity: 0;
}

.done-reopen,
.done-delete {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.done-delete {
  color: var(--on-surface-variant);
}

.done-ring {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary);
}

.done-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.done-title {
  color: var(--on-surface-variant);
  text-decoration: line-through;
  overflow-wrap: anywhere;
}

.done-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  color: var(--on-surface-variant);
  font-size: 13px;
}

.done-chip {
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
}

/* ─── Snackbar ───────────────────────────────────────────────────────────── */
.snackbar-region {
  position: fixed;
  right: 0;
  bottom: calc(92px + env(safe-area-inset-bottom));
  left: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  pointer-events: none;
}

.snackbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  max-width: 480px;
  min-height: 52px;
  padding: 4px 8px 4px 16px;
  border-radius: 14px;
  background: var(--inverse-surface);
  box-shadow: var(--elevation-3);
  color: var(--inverse-on-surface);
  font-size: 15px;
  pointer-events: auto;
}

.snackbar-action {
  flex: none;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 22px;
  color: var(--inverse-primary);
  font-weight: 700;
}

.snackbar-enter-active {
  transition:
    opacity 160ms linear,
    transform 280ms var(--ease-decelerate);
}

.snackbar-leave-active {
  position: absolute;
  transition: opacity 120ms linear;
}

.snackbar-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.snackbar-leave-to {
  opacity: 0;
}

/* ─── Wider screens ─────────────────────────────────────────────────────── */
@media (min-width: 840px) {
  /* Lines the store name up with the 760px content column below it */
  .appbar {
    padding-block: 8px;
    padding-inline: max(12px, calc((100% - 760px) / 2 + 12px));
  }

  .appbar-date {
    display: block;
  }

  .icon-button {
    margin-left: 0;
  }

  .main {
    padding: 8px 24px 128px;
  }

  .sections {
    gap: 32px;
  }

  .fab {
    padding: 0 24px 0 20px;
  }

  .fab-label {
    display: inline;
  }

  .bottom-bar {
    padding-inline: 24px;
  }
}
</style>
