<template>
  <div class="select">
    <button
      class="field state-layer"
      :class="{ invalid }"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-controls="todo-category-list"
      :aria-label="t('todo.form.category')"
      :aria-expanded="open"
      :aria-invalid="invalid"
      :aria-activedescendant="open ? `todo-category-${activeIndex}` : undefined"
      @click="open = !open"
      @blur="open = false"
      @keydown="onKeydown"
    >
      <span class="value" :class="{ placeholder: !isNew && !selected }">
        <Plus v-if="isNew" :size="18" aria-hidden="true" />
        <span v-else-if="selected" class="dot" :style="{ '--hue': selected.hue }" aria-hidden="true" />
        <span class="label">{{ isNew ? t("todo.form.newCategory") : (selected?.name ?? t("todo.form.categorySelect")) }}</span>
      </span>
      <ChevronDown :size="22" class="chevron" :class="{ flipped: open }" aria-hidden="true" />
    </button>

    <Transition name="menu">
      <ul v-show="open" id="todo-category-list" class="menu" role="listbox" :aria-label="t('todo.form.category')">
        <!-- mousedown.prevent keeps focus on the trigger, so its blur doesn't close the menu mid-click -->
        <li
          v-for="(category, index) in categories"
          :id="`todo-category-${index}`"
          :key="category.id"
          class="option"
          :class="{ active: index === activeIndex }"
          role="option"
          :aria-selected="!isNew && category.name === modelValue"
          @mousedown.prevent
          @mouseenter="activeIndex = index"
          @click="choose(index)"
        >
          <span class="dot" :style="{ '--hue': category.hue }" aria-hidden="true" />
          <span class="label">{{ category.name }}</span>
          <Check v-if="!isNew && category.name === modelValue" :size="18" class="tick" aria-hidden="true" />
        </li>
        <li
          :id="`todo-category-${categories.length}`"
          class="option option-new"
          :class="{ active: activeIndex === categories.length, divided: categories.length > 0 }"
          role="option"
          :aria-selected="isNew"
          @mousedown.prevent
          @mouseenter="activeIndex = categories.length"
          @click="choose(categories.length)"
        >
          <Plus :size="18" aria-hidden="true" />
          <span class="label">{{ t("todo.form.newCategory") }}</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, Plus } from "lucide-vue-next";
import type { TodoCategory } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{
  categories: TodoCategory[];
  modelValue: string;
  isNew: boolean;
  invalid?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [name: string]; new: [] }>();
const { t } = useLocale();

const open = ref(false);
const activeIndex = ref(0);

const selected = computed(() => props.categories.find((c) => c.name === props.modelValue));

// The last index is the "New category" option, after the saved categories.
function choose(index: number) {
  open.value = false;
  if (index === props.categories.length) emit("new");
  else emit("update:modelValue", props.categories[index].name);
}

function onKeydown(event: KeyboardEvent) {
  const optionCount = props.categories.length + 1;
  if (event.key === "Escape" && open.value) {
    // Only closes the menu: without this the sheet behind it would close as well.
    event.stopPropagation();
    open.value = false;
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!open.value) {
      open.value = true;
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = (activeIndex.value + step + optionCount) % optionCount;
  } else if ((event.key === "Enter" || event.key === " ") && open.value) {
    event.preventDefault();
    choose(activeIndex.value);
  }
}
</script>

<style scoped>
.select {
  position: relative;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px 8px 16px;
  border: 1px solid var(--outline);
  border-radius: 14px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 17px;
  text-align: left;
}

.field.invalid {
  border-color: var(--error);
}

.value {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.placeholder {
  color: var(--on-surface-variant);
}

.label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dot {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: hsl(var(--hue) 65% 50%);
}

.chevron {
  flex: none;
  color: var(--on-surface-variant);
  transition: transform 200ms var(--ease-emphasized);
}

.chevron.flipped {
  transform: rotate(180deg);
}

/* Opens upward: this field sits at the bottom of a scrolling sheet, where a menu
   opening downward would be cut off. */
.menu {
  position: absolute;
  z-index: 5;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: min(42dvh, 320px);
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 16px;
  background: var(--surface-high);
  box-shadow: var(--elevation-3);
  transform-origin: bottom;
}

.option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 6px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.option.active {
  background: var(--surface-container);
}

.option-new {
  color: var(--primary);
  font-weight: 600;
}

.option-new.divided {
  margin-top: 8px;
  box-shadow: 0 -5px 0 -4px var(--outline-variant);
}

.tick {
  flex: none;
  margin-left: auto;
  color: var(--primary);
}

.menu-enter-active {
  transition:
    opacity 150ms linear,
    transform 220ms var(--ease-decelerate);
}

.menu-leave-active {
  transition: opacity 100ms linear;
}

.menu-enter-from {
  opacity: 0;
  transform: scaleY(0.92);
}

.menu-leave-to {
  opacity: 0;
}
</style>
