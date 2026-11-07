<template>
  <TodoSheet :open="open" :title="task ? t('todo.form.editTitle') : t('todo.form.newTitle')" @close="emit('close')">
    <form class="form" novalidate @submit.prevent="submit">
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

      <!-- Due date -->
      <fieldset class="group">
        <legend class="label">{{ t("todo.form.due") }}</legend>
        <div class="chips">
          <button
            v-for="option in dueOptions"
            :key="option.value"
            class="chip state-layer"
            :class="{ selected: dueDate === option.value && !customDateOpen }"
            type="button"
            :aria-pressed="dueDate === option.value && !customDateOpen"
            @click="pickDue(option.value)"
          >
            <Check v-if="dueDate === option.value && !customDateOpen" :size="18" aria-hidden="true" />
            {{ option.label }}
          </button>
          <button
            class="chip state-layer"
            :class="{ selected: customDateOpen }"
            type="button"
            :aria-pressed="customDateOpen"
            @click="customDateOpen = true"
          >
            <CalendarDays :size="18" aria-hidden="true" />
            {{ t("todo.form.pickDate") }}
          </button>
        </div>
        <input
          v-if="customDateOpen"
          v-model="dueDate"
          class="input date-input"
          type="date"
          :aria-label="t('todo.form.pickDate')"
        />
        <p v-if="errors.dueDate" class="error" role="alert">{{ errors.dueDate }}</p>
      </fieldset>

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
        <div v-if="categories.length" class="chips">
          <button
            v-for="c in categories"
            :key="c.id"
            class="category-chip category-option state-layer"
            :class="{ selected: !newCategoryOpen && category === c.name }"
            :style="{ '--hue': c.hue }"
            type="button"
            :aria-pressed="!newCategoryOpen && category === c.name"
            @click="pickCategory(c.name)"
          >
            <Check v-if="!newCategoryOpen && category === c.name" :size="16" aria-hidden="true" />
            <span class="category-name">{{ c.name }}</span>
          </button>
          <button
            class="chip state-layer"
            :class="{ selected: newCategoryOpen }"
            type="button"
            :aria-pressed="newCategoryOpen"
            @click="openNewCategory"
          >
            <Plus :size="18" aria-hidden="true" />
            {{ t("todo.form.newCategory") }}
          </button>
        </div>
        <input
          v-if="newCategoryOpen || !categories.length"
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
        <button v-if="task" class="delete-button state-layer" type="button" @click="emit('delete', task)">
          <Trash2 :size="20" aria-hidden="true" />
          {{ t("todo.task.delete") }}
        </button>
        <button class="submit state-layer" type="submit" :disabled="saving">
          <span v-if="saving" class="spinner" aria-hidden="true" />
          {{ task ? t("todo.form.save") : t("todo.form.add") }}
        </button>
      </div>
    </form>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { CalendarDays, Check, Plus, Trash2 } from "lucide-vue-next";
import TodoFlame from "./TodoFlame.vue";
import TodoSheet from "./TodoSheet.vue";
import { addDays, type Importance, type TaskInput, type TodoCategory, type TodoTask } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const LEVELS: Importance[] = [1, 2, 3];

const props = defineProps<{
  open: boolean;
  task: TodoTask | null;
  categories: TodoCategory[];
  today: string;
  saving: boolean;
}>();
const emit = defineEmits<{ close: []; save: [input: TaskInput]; delete: [task: TodoTask] }>();
const { t } = useLocale();

const title = ref("");
const dueDate = ref("");
const customDateOpen = ref(false);
const importance = ref<Importance>(2);
const category = ref("");
const newCategory = ref("");
const newCategoryOpen = ref(false);
const newCategoryInput = ref<HTMLInputElement | null>(null);
const errors = reactive({ title: "", dueDate: "", category: "" });
let holdsEdit = false;

const tomorrow = computed(() => addDays(props.today, 1));
const dueOptions = computed(() => [
  { value: props.today, label: t("todo.section.today") },
  { value: tomorrow.value, label: t("todo.section.tomorrow") },
]);

function clearErrors() {
  errors.title = errors.dueDate = errors.category = "";
}

function reset() {
  title.value = "";
  dueDate.value = tomorrow.value;
  customDateOpen.value = false;
  importance.value = 2;
  category.value = "";
  newCategory.value = "";
  newCategoryOpen.value = false;
  clearErrors();
}

function loadTask(task: TodoTask) {
  title.value = task.title;
  dueDate.value = task.dueDate;
  customDateOpen.value = task.dueDate !== props.today && task.dueDate !== tomorrow.value;
  importance.value = task.importance;
  category.value = task.categoryName;
  // Its category may have been cleaned up since; it then has to be typed to be shown.
  const known = props.categories.some((c) => c.name === task.categoryName);
  newCategoryOpen.value = !known;
  newCategory.value = known ? "" : task.categoryName;
  clearErrors();
}

// A half-written new task survives closing the sheet by accident.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.task) {
      loadTask(props.task);
      holdsEdit = true;
    } else if (holdsEdit || !dueDate.value) {
      reset();
      holdsEdit = false;
    }
  },
);

function pickDue(value: string) {
  dueDate.value = value;
  customDateOpen.value = false;
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

function submit() {
  const chosenCategory = (newCategoryOpen.value || !props.categories.length ? newCategory.value : category.value).trim();
  errors.title = title.value.trim() ? "" : t("todo.form.taskRequired");
  errors.dueDate = dueDate.value ? "" : t("todo.form.dueRequired");
  errors.category = chosenCategory ? "" : t("todo.form.categoryRequired");
  if (errors.title || errors.dueDate || errors.category) return;

  emit("save", {
    title: title.value.trim(),
    dueDate: dueDate.value,
    importance: importance.value,
    category: chosenCategory,
  });
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

.category-option {
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: 2px solid transparent;
  border-radius: 12px;
  font-size: 15px;
}

.category-option.selected {
  border-color: currentColor;
}

.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
