<template>
  <TodoSheet :open="open" :title="t('todo.recurring.title')" @close="emit('close')">
    <p v-if="!recurring.length" class="empty">{{ t("todo.recurring.empty") }}</p>

    <ul v-else class="list">
      <li v-for="item in recurring" :key="item.id">
        <button
          class="row state-layer"
          type="button"
          :aria-label="t('todo.recurring.editNamed', { title: item.title, days: dayNames(item.days) })"
          @click="emit('edit', item)"
        >
          <span class="top">
            <span class="title">{{ item.title }}</span>
            <TodoFlame :level="item.importance" />
          </span>
          <span class="bottom">
            <span class="category-chip chip" :style="{ '--hue': item.categoryHue }">{{ item.categoryName }}</span>
            <span class="week" aria-hidden="true">
              <span v-for="day in WEEKDAYS" :key="day" class="day" :class="{ on: item.days.includes(day) }">
                {{ t(`todo.day.${day}`) }}
              </span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <button class="add state-layer" type="button" @click="emit('add')">
      <Plus :size="22" aria-hidden="true" />
      {{ t("todo.recurring.add") }}
    </button>
  </TodoSheet>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import TodoFlame from "./TodoFlame.vue";
import TodoSheet from "./TodoSheet.vue";
import { weekdayName, WEEKDAYS, type RecurringTask, type Weekday } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

defineProps<{ open: boolean; recurring: RecurringTask[] }>();
const emit = defineEmits<{ close: []; edit: [item: RecurringTask]; add: [] }>();
const { t, locale } = useLocale();

const dayNames = (days: Weekday[]) => days.map((d) => weekdayName(d, locale.value)).join(", ");
</script>

<style scoped>
.empty {
  padding: 16px 0 24px;
  color: var(--on-surface-variant);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--elevation-1);
  color: var(--on-surface);
  text-align: left;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  min-width: 0;
  font-size: 17px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.bottom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chip {
  padding: 1px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.week {
  display: flex;
  gap: 4px;
}

.day {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 600;
  text-transform: lowercase;
  opacity: 0.55;
}

.day.on {
  background: var(--primary);
  color: var(--on-primary);
  opacity: 1;
}

.add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 56px;
  margin-top: 16px;
  border-radius: 28px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 16px;
  font-weight: 600;
}
</style>
