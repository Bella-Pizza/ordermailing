<template>
  <TodoSheet :open="open" :title="task?.title ?? ''" @close="emit('close')">
    <template v-if="task?.checklist">
      <div class="progress" role="progressbar" :aria-valuenow="doneCount" aria-valuemin="0" :aria-valuemax="total" :aria-label="t('todo.checklist.progress', { done: doneCount, total })">
        <div class="progress-text">
          <span class="progress-count">{{ doneCount }} / {{ total }}</span>
          <span>{{ t("todo.checklist.done") }}</span>
        </div>
        <div class="bar"><div class="bar-fill" :style="{ transform: `scaleX(${total ? doneCount / total : 0})` }" /></div>
      </div>

      <ul class="items">
        <li v-for="(item, index) in task.checklist" :key="`${index}-${item.name}`">
          <button
            class="item state-layer"
            :class="{ done: item.done }"
            type="button"
            role="checkbox"
            :aria-checked="item.done"
            @click="emit('toggle', index, !item.done)"
          >
            <span class="box" aria-hidden="true"><Check :size="18" :stroke-width="3" /></span>
            <span class="name">{{ item.name }}</span>
            <span v-if="item.qty !== null" class="qty">{{ t("todo.checklist.max", { n: item.qty }) }}</span>
          </button>
        </li>
      </ul>

      <div class="actions">
        <button v-if="task.recurringId" class="text-button state-layer" type="button" @click="emit('editSeries', task.recurringId)">
          <Repeat :size="18" aria-hidden="true" />
          {{ t("todo.recurring.editSeries") }}
        </button>
        <button class="text-button state-layer" type="button" @click="emit('editTask', task)">
          <Pencil :size="18" aria-hidden="true" />
          {{ t("todo.checklist.editTask") }}
        </button>
      </div>
    </template>
  </TodoSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Check, Pencil, Repeat } from "lucide-vue-next";
import TodoSheet from "./TodoSheet.vue";
import type { TodoTask } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{ open: boolean; task: TodoTask | null }>();
const emit = defineEmits<{
  close: [];
  toggle: [index: number, done: boolean];
  editTask: [task: TodoTask];
  editSeries: [recurringId: string];
}>();
const { t } = useLocale();

const total = computed(() => props.task?.checklist?.length ?? 0);
const doneCount = computed(() => props.task?.checklist?.filter((i) => i.done).length ?? 0);
</script>

<style scoped>
.progress {
  position: sticky;
  top: -8px;
  z-index: 1;
  padding: 4px 0 12px;
  background: var(--surface-low);
}

.progress-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--on-surface-variant);
  font-size: 14px;
}

.progress-count {
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

.items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border-radius: 14px;
  text-align: left;
}

.box {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--outline);
  border-radius: 8px;
  color: transparent;
  transition:
    background-color 120ms linear,
    border-color 120ms linear,
    color 120ms linear;
}

.done .box {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.done .name {
  color: var(--on-surface-variant);
  text-decoration: line-through;
}

.qty {
  flex: none;
  min-width: 64px;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--surface-high);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.done .qty {
  opacity: 0.55;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.text-button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--outline-variant);
  border-radius: 24px;
  color: var(--primary);
  font-weight: 600;
}
</style>
