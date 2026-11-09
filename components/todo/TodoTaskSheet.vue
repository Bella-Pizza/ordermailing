<template>
  <TodoSheet :open="open" :title="sheetTitle" @close="emit('close')">
    <form class="form" novalidate @submit.prevent="submit">
      <!-- One day's copy of a recurring task: point to where the whole series is edited -->
      <div v-if="mode === 'task' && task?.recurringId" class="series-note">
        <Repeat :size="20" aria-hidden="true" />
        <p>{{ t("todo.recurring.instanceNote") }}</p>
        <button class="series-link state-layer" type="button" @click="emit('editRecurring', task.recurringId)">
          {{ t("todo.recurring.editSeries") }}
        </button>
      </div>

      <!-- Task -->
      <div class="group">
        <label class="label" for="todo-title">{{ t("todo.form.task") }}</label>
        <input
          id="todo-title"
          v-model="title"
          class="input"
          type="text"
          data-autofocus
          enterkeyhint="done"
          autocomplete="off"
          maxlength="200"
          :placeholder="t('todo.form.taskPlaceholder')"
          :aria-invalid="!!errors.title"
          :aria-describedby="errors.title ? 'todo-title-error' : undefined"
        />
        <p v-if="errors.title" id="todo-title-error" class="error" role="alert">{{ errors.title }}</p>
      </div>

      <!-- Due date, or the days a recurring task repeats on -->
      <fieldset class="group">
        <legend class="label">{{ mode === "series" ? t("todo.form.days") : t("todo.form.due") }}</legend>
        <div v-if="mode !== 'series'" class="chips">
          <button
            v-for="option in dueOptions"
            :key="option.value"
            class="chip state-layer"
            :class="{ selected: isDueSelected(option.value) }"
            type="button"
            :aria-pressed="isDueSelected(option.value)"
            @click="pickDue(option.value)"
          >
            <Check v-if="isDueSelected(option.value)" :size="18" aria-hidden="true" />
            {{ option.label }}
          </button>
          <button
            class="chip state-layer"
            :class="{ selected: customDateOpen && !repeat }"
            type="button"
            :aria-pressed="customDateOpen && !repeat"
            @click="openCustomDate"
          >
            <CalendarDays :size="18" aria-hidden="true" />
            {{ t("todo.form.pickDate") }}
          </button>
          <button
            v-if="mode === 'new'"
            class="chip state-layer"
            :class="{ selected: repeat }"
            type="button"
            :aria-pressed="repeat"
            @click="setRepeat(true)"
          >
            <Repeat :size="18" aria-hidden="true" />
            {{ t("todo.form.repeat") }}
          </button>
        </div>

        <input
          v-if="customDateOpen && !showDays"
          v-model="dueDate"
          class="input date-input"
          type="date"
          :aria-label="t('todo.form.pickDate')"
        />

        <div v-if="showDays" class="days" role="group" :aria-label="t('todo.form.days')">
          <button
            v-for="day in WEEKDAYS"
            :key="day"
            class="day state-layer"
            :class="{ selected: days.includes(day) }"
            type="button"
            :aria-pressed="days.includes(day)"
            :aria-label="weekdayName(day, locale)"
            @click="toggleDay(day)"
          >
            {{ t(`todo.day.${day}`) }}
          </button>
        </div>
        <p v-if="errors.dueDate" class="error" role="alert">{{ errors.dueDate }}</p>
      </fieldset>

      <!-- Optional checklist: an amount per day when repeating, one amount otherwise -->
      <TodoChecklistEditor v-model="checklist" :days="showDays ? sortedDays : undefined" />

      <!-- Importance -->
      <fieldset class="group">
        <legend class="label">{{ t("todo.form.importance") }}</legend>
        <div class="importance">
          <label v-for="level in LEVELS" :key="level" class="level state-layer" :class="{ selected: importance === level }">
            <input v-model="importance" class="visually-hidden" type="radio" name="todo-importance" :value="level" />
            <span class="level-flame"><TodoFlame :level="level" :scale="1.15" /></span>
            <span>{{ t(`todo.importance.short.${level}`) }}</span>
          </label>
        </div>
      </fieldset>

      <!-- Category -->
      <fieldset class="group">
        <legend class="label">{{ t("todo.form.category") }}</legend>
        <TodoCategorySelect
          :categories="categories"
          :model-value="category"
          :is-new="newCategoryOpen"
          :invalid="!!errors.category && !newCategoryOpen"
          @update:model-value="pickCategory"
          @new="openNewCategory"
        />
        <input
          v-if="newCategoryOpen"
          ref="newCategoryInput"
          v-model="newCategory"
          class="input"
          type="text"
          autocomplete="off"
          maxlength="40"
          :aria-label="t('todo.form.newCategory')"
          :placeholder="t('todo.form.categoryPlaceholder')"
          :aria-invalid="!!errors.category"
        />
        <p v-if="errors.category" class="error" role="alert">{{ errors.category }}</p>
      </fieldset>

      <div class="actions">
        <button v-if="mode !== 'new'" class="delete-button state-layer" type="button" @click="onDelete">
          <Trash2 :size="20" aria-hidden="true" />
          {{ t("todo.task.delete") }}
        </button>
        <button class="submit state-layer" type="submit" :disabled="saving">
          <span v-if="saving" class="spinner" aria-hidden="true" />
          {{ mode === "new" ? t("todo.form.add") : t("todo.form.save") }}
        </button>
      </div>
    </form>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { CalendarDays, Check, Repeat, Trash2 } from "lucide-vue-next";
import TodoCategorySelect from "./TodoCategorySelect.vue";
import TodoChecklistEditor from "./TodoChecklistEditor.vue";
import TodoFlame from "./TodoFlame.vue";
import TodoSheet from "./TodoSheet.vue";
import {
  addDays,
  weekdayName,
  weekdayOf,
  WEEKDAYS,
  SINGLE_AMOUNT as SINGLE,
  type EditorItem,
  type Importance,
  type RecurringInput,
  type RecurringTask,
  type TaskInput,
  type TodoCategory,
  type TodoTask,
  type Weekday,
} from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const LEVELS: Importance[] = [1, 2, 3];

const props = defineProps<{
  open: boolean;
  /** An existing task to edit */
  task: TodoTask | null;
  /** An existing recurring task to edit */
  recurring: RecurringTask | null;
  /** Open a new task with Repeat already chosen */
  startRepeating?: boolean;
  categories: TodoCategory[];
  today: string;
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [input: TaskInput];
  saveRecurring: [input: RecurringInput];
  delete: [task: TodoTask];
  deleteRecurring: [recurring: RecurringTask];
  editRecurring: [recurringId: string];
}>();
const { t, locale } = useLocale();

const title = ref("");
const dueDate = ref("");
const customDateOpen = ref(false);
const repeat = ref(false);
const days = ref<Weekday[]>([]);
const sortedDays = computed(() => [...days.value].sort());
const checklist = ref<EditorItem[]>([]);
const importance = ref<Importance>(2);
const category = ref("");
const newCategory = ref("");
const newCategoryOpen = ref(false);
const newCategoryInput = ref<HTMLInputElement | null>(null);
const errors = reactive({ title: "", dueDate: "", category: "" });
let holdsEdit = false;

const mode = computed<"new" | "task" | "series">(() => (props.recurring ? "series" : props.task ? "task" : "new"));
const showDays = computed(() => mode.value === "series" || (mode.value === "new" && repeat.value));
const sheetTitle = computed(() =>
  mode.value === "series"
    ? t("todo.recurring.editTitle")
    : mode.value === "task"
      ? t("todo.form.editTitle")
      : t("todo.form.newTitle"),
);

const tomorrow = computed(() => addDays(props.today, 1));
const dueOptions = computed(() => [
  { value: props.today, label: t("todo.section.today") },
  { value: tomorrow.value, label: t("todo.section.tomorrow") },
]);

const isDueSelected = (value: string) => !repeat.value && !customDateOpen.value && dueDate.value === value;

function clearErrors() {
  errors.title = errors.dueDate = errors.category = "";
}

function setCategory(name: string) {
  // Its category may have been cleaned up since, so it's no longer in the dropdown.
  // Prefilling it as a new one keeps the category and saves it again.
  const known = props.categories.some((c) => c.name === name);
  category.value = known ? name : "";
  newCategoryOpen.value = !known && !!name;
  newCategory.value = known ? "" : name;
}

function reset() {
  title.value = "";
  dueDate.value = tomorrow.value;
  customDateOpen.value = false;
  repeat.value = false;
  days.value = [];
  checklist.value = [];
  importance.value = 2;
  setCategory("");
  clearErrors();
}

function loadTask(task: TodoTask) {
  title.value = task.title;
  dueDate.value = task.dueDate;
  customDateOpen.value = task.dueDate !== props.today && task.dueDate !== tomorrow.value;
  repeat.value = false;
  importance.value = task.importance;
  setCategory(task.categoryName);
  checklist.value = (task.checklist ?? []).map((item) => ({
    name: item.name,
    qty: item.qty ? { [SINGLE]: item.qty } : {},
    done: item.done,
  }));
  clearErrors();
}

function loadRecurring(recurring: RecurringTask) {
  title.value = recurring.title;
  days.value = [...recurring.days];
  checklist.value = (recurring.checklist ?? []).map((item) => ({ name: item.name, qty: { ...item.qty } }));
  importance.value = recurring.importance;
  setCategory(recurring.categoryName);
  clearErrors();
}

// Switching a new task between one date and Repeat keeps the checklist: one amount
// becomes that amount on every day, and back again it keeps today's amount.
// Only while creating: an edited task or series loads its checklist in the right shape.
watch(showDays, (perDay) => {
  if (mode.value !== "new") return;
  checklist.value = checklist.value.map((item) => {
    if (perDay) {
      const amount = item.qty[SINGLE];
      return { ...item, qty: amount ? Object.fromEntries(WEEKDAYS.map((d) => [String(d), amount])) : {} };
    }
    const amount = item.qty[String(weekdayOf(props.today))] ?? Object.values(item.qty)[0];
    return { ...item, qty: amount ? { [SINGLE]: amount } : {} };
  });
});

// A half-written new task survives closing the sheet by accident.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.recurring) {
      loadRecurring(props.recurring);
      holdsEdit = true;
    } else if (props.task) {
      loadTask(props.task);
      holdsEdit = true;
    } else if (holdsEdit || !dueDate.value) {
      reset();
      holdsEdit = false;
    }
    if (mode.value === "new" && props.startRepeating) setRepeat(true);
  },
);

function pickDue(value: string) {
  dueDate.value = value;
  customDateOpen.value = false;
  repeat.value = false;
  errors.dueDate = "";
}

function openCustomDate() {
  customDateOpen.value = true;
  repeat.value = false;
  errors.dueDate = "";
}

function setRepeat(on: boolean) {
  repeat.value = on;
  customDateOpen.value = false;
  errors.dueDate = "";
  // Start from today's day: one tap less for the common case.
  if (on && !days.value.length) days.value = [weekdayOf(props.today)];
}

function toggleDay(day: Weekday) {
  days.value = days.value.includes(day) ? days.value.filter((d) => d !== day) : [...days.value, day];
  errors.dueDate = "";
}

function pickCategory(name: string) {
  category.value = name;
  newCategoryOpen.value = false;
  errors.category = "";
}

async function openNewCategory() {
  newCategoryOpen.value = true;
  category.value = "";
  errors.category = "";
  await nextTick();
  newCategoryInput.value?.focus();
}

function onDelete() {
  if (props.recurring) emit("deleteRecurring", props.recurring);
  else if (props.task) emit("delete", props.task);
}

function submit() {
  const chosenCategory = (newCategoryOpen.value ? newCategory.value : category.value).trim();
  errors.title = title.value.trim() ? "" : t("todo.form.taskRequired");
  errors.category = chosenCategory ? "" : t("todo.form.categoryRequired");
  if (showDays.value) errors.dueDate = days.value.length ? "" : t("todo.form.daysRequired");
  else errors.dueDate = dueDate.value ? "" : t("todo.form.dueRequired");
  if (errors.title || errors.dueDate || errors.category) return;

  const common = { title: title.value.trim(), importance: importance.value, category: chosenCategory };
  // Rows left without a name are dropped rather than blocking the save.
  const items = checklist.value.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
  if (showDays.value) {
    const perDay = items.map((item) => ({
      name: item.name,
      qty: Object.fromEntries(Object.entries(item.qty).filter(([key]) => /^[1-7]$/.test(key))),
    }));
    emit("saveRecurring", { ...common, days: [...days.value].sort(), checklist: perDay.length ? perDay : null });
  } else {
    // Ticks survive an edit for items that are still there.
    const single = items.map((item) => ({ name: item.name, qty: item.qty[SINGLE] ?? null, done: item.done ?? false }));
    emit("save", { ...common, dueDate: dueDate.value, checklist: single.length ? single : null });
  }
}

defineExpose({ reset });
</script>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.label {
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 600;
}

/* legend ignores flex gap */
legend.label {
  margin-bottom: 8px;
}

.input {
  width: 100%;
  min-height: 56px;
  padding: 12px 16px;
  border: 1px solid var(--outline);
  border-radius: 14px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 17px;
}

.input::placeholder {
  color: var(--on-surface-variant);
  opacity: 0.8;
}

.input:focus {
  border-color: var(--primary);
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.input[aria-invalid="true"] {
  border-color: var(--error);
}

.date-input {
  margin-top: 4px;
}

.error {
  color: var(--error);
  font-size: 14px;
}

.series-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 12px 12px 12px 16px;
  border-radius: 16px;
  background: var(--surface-container);
  color: var(--on-surface-variant);
  font-size: 14px;
}

.series-note svg {
  flex: none;
  color: var(--primary);
}

.series-note p {
  flex: 1;
  min-width: 160px;
}

.series-link {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 20px;
  color: var(--primary);
  font-weight: 600;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  color: var(--on-surface);
  font-size: 15px;
  font-weight: 500;
}

.chip.selected {
  border-color: transparent;
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin-top: 4px;
}

.day {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-height: 44px;
  max-height: 56px;
  border: 1px solid var(--outline-variant);
  border-radius: 50%;
  color: var(--on-surface);
  font-size: 15px;
  font-weight: 600;
  text-transform: lowercase;
  transition:
    background-color 120ms linear,
    color 120ms linear,
    border-color 120ms linear;
}

.day.selected {
  border-color: transparent;
  background: var(--primary);
  color: var(--on-primary);
}

.importance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.level {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 72px;
  padding: 8px 4px;
  border: 1px solid var(--outline-variant);
  border-radius: 16px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition:
    background-color 120ms linear,
    border-color 120ms linear;
}

.level.selected {
  border-color: var(--primary);
  background: var(--surface-high);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.level:has(input:focus-visible) {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

.level-flame {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 32px;
  transition: transform 260ms var(--ease-decelerate);
}

.level.selected .level-flame {
  transform: scale(1.12);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.submit {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 56px;
  border-radius: 28px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 17px;
  font-weight: 600;
}

.submit:disabled {
  opacity: 0.7;
}

.delete-button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 20px;
  border-radius: 28px;
  color: var(--error);
  font-weight: 600;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: submit-spin 700ms linear infinite;
}

@keyframes submit-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
