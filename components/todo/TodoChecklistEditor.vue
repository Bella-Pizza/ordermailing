<template>
  <fieldset class="group">
    <legend class="label">{{ t("todo.checklist.title") }}</legend>
    <p v-if="!modelValue.length" class="hint">{{ perDay ? t("todo.checklist.hint") : t("todo.checklist.hintSingle") }}</p>

    <ul v-else ref="list" class="items">
      <li v-for="(item, index) in modelValue" :key="index" class="item">
        <div class="item-top">
          <input
            class="name"
            type="text"
            maxlength="80"
            autocomplete="off"
            :value="item.name"
            :aria-label="t('todo.checklist.itemName', { n: index + 1 })"
            :placeholder="t('todo.checklist.itemPlaceholder')"
            @input="setName(index, ($event.target as HTMLInputElement).value)"
          />
          <!-- One date: a single amount, on the same line -->
          <label v-if="!perDay" class="qty qty-inline">
            <span class="day">{{ t("todo.checklist.amount") }}</span>
            <input
              type="text"
              inputmode="numeric"
              maxlength="4"
              autocomplete="off"
              :value="item.qty[SINGLE] ?? ''"
              :aria-label="t('todo.checklist.qtyOne', { name: item.name || index + 1 })"
              placeholder="–"
              @input="setQty(index, SINGLE, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <button class="remove state-layer" type="button" :aria-label="t('todo.checklist.remove', { name: item.name || index + 1 })" @click="remove(index)">
            <X :size="20" aria-hidden="true" />
          </button>
        </div>

        <!-- Recurring: an amount per selected day -->
        <div v-if="perDay" class="quantities">
          <label v-for="day in days" :key="day" class="qty">
            <span class="day">{{ t(`todo.day.${day}`) }}</span>
            <input
              type="text"
              inputmode="numeric"
              maxlength="4"
              autocomplete="off"
              :value="item.qty[day] ?? ''"
              :aria-label="t('todo.checklist.qtyFor', { name: item.name || index + 1, day: weekdayName(day, locale) })"
              placeholder="–"
              @input="setQty(index, String(day), ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </li>
    </ul>

    <button class="add state-layer" type="button" @click="add">
      <Plus :size="20" aria-hidden="true" />
      {{ t("todo.checklist.add") }}
    </button>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Plus, X } from "lucide-vue-next";
import { SINGLE_AMOUNT as SINGLE, weekdayName, type EditorItem, type Weekday } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

// `days` given: recurring, with an amount per day. Left out: a single date, one amount.
const props = defineProps<{ modelValue: EditorItem[]; days?: Weekday[] }>();
const emit = defineEmits<{ "update:modelValue": [items: EditorItem[]] }>();
const { t, locale } = useLocale();

const perDay = computed(() => props.days !== undefined);
const update = (items: EditorItem[]) => emit("update:modelValue", items);

function setName(index: number, name: string) {
  update(props.modelValue.map((item, i) => (i === index ? { ...item, name } : item)));
}

// An empty box means no amount: for a recurring task, not on the list that day.
function setQty(index: number, key: string, raw: string) {
  const amount = Number.parseInt(raw.replace(/\D/g, ""), 10);
  update(
    props.modelValue.map((item, i) => {
      if (i !== index) return item;
      const qty = { ...item.qty };
      if (amount > 0) qty[key] = amount;
      else delete qty[key];
      return { ...item, qty };
    }),
  );
}

function remove(index: number) {
  update(props.modelValue.filter((_, i) => i !== index));
}

const list = ref<HTMLElement | null>(null);

async function add() {
  update([...props.modelValue, { name: "", qty: {} }]);
  await nextTick();
  // Within this editor only: other sheets on the page use the same class names.
  const names = list.value?.querySelectorAll<HTMLInputElement>("input.name");
  names?.[names.length - 1]?.focus();
}
</script>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.label {
  margin-bottom: 8px;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 600;
}

.hint {
  color: var(--on-surface-variant);
  font-size: 14px;
}

.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: var(--surface-container);
}

.item-top {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.name {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 16px;
}

.remove {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 48px;
  border-radius: 50%;
  color: var(--on-surface-variant);
}

.quantities {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.qty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.qty-inline {
  flex: none;
  width: 64px;
}

.qty-inline input {
  height: 48px;
}

.day {
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 600;
  text-transform: lowercase;
}

.qty input {
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background: var(--surface-lowest);
  color: var(--on-surface);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.name:focus,
.qty input:focus {
  border-color: var(--primary);
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  border: 1px dashed var(--outline);
  border-radius: 14px;
  color: var(--primary);
  font-weight: 600;
}
</style>
