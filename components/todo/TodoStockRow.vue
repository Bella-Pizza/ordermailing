<template>
  <li class="row" :class="{ counted: value !== null, short: missing > 0, full: value !== null && missing === 0 }" :data-row="rowId">
    <!-- ✓ = "it's full": counts exactly the ideal. Tap again to un-count. -->
    <button class="tick state-layer" type="button" :aria-pressed="value !== null && value === ideal" :aria-label="tickLabel" @click="tick">
      <Check :size="22" :stroke-width="3" aria-hidden="true" />
    </button>

    <div class="text">
      <span class="name">{{ name }}</span>
      <span class="sub">{{ t("todo.stock.ideal", { n: formatQty(ideal) }) }}</span>
      <strong v-if="value !== null" class="verdict" :class="missing > 0 ? 'short-text' : 'ok-text'">
        {{ missing > 0 ? t("todo.stock.missing", { n: formatQty(missing) }) : t("todo.stock.enough") }}
      </strong>
    </div>

    <div class="stepper">
      <button class="step state-layer" type="button" :disabled="value !== null && value <= 0" :aria-label="t('todo.stock.minus', { name })" @click="step(-1)">
        <Minus :size="22" aria-hidden="true" />
      </button>
      <input
        ref="input"
        class="value"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        v-field-value="display"
        :aria-label="t('todo.stock.countOf', { name })"
        @focus="selectAll"
        @change="onChange"
        @keydown.enter.prevent="input?.blur()"
      />
      <button class="step state-layer" type="button" :aria-label="t('todo.stock.plus', { name })" @click="step(1)">
        <Plus :size="22" aria-hidden="true" />
      </button>
      <button class="half state-layer" :class="{ on: hasHalf }" type="button" :aria-pressed="hasHalf" :aria-label="t('todo.stock.half', { name })" @click="toggleHalf">
        ½
      </button>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Minus, Plus } from "lucide-vue-next";
import { vFieldValue } from "./fieldValue";
import { formatQty, parseQty } from "@/lib/stockCalc";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{
  rowId: string;
  name: string;
  /** What it should be: the target for tomorrow */
  ideal: number;
  /** What was counted; null while it hasn't been */
  value: number | null;
}>();
const emit = defineEmits<{ "update:value": [value: number | null] }>();
const { t } = useLocale();

const input = ref<HTMLInputElement | null>(null);

// "?" = not counted yet. A dash would read as a second minus next to the − button.
const display = computed(() => (props.value === null ? "?" : formatQty(props.value)));
const missing = computed(() => (props.value === null ? 0 : Math.max(0, props.ideal - props.value)));
const hasHalf = computed(() => props.value !== null && props.value % 1 === 0.5);
const tickLabel = computed(() =>
  props.value === props.ideal
    ? t("todo.stock.tickClear", { name: props.name })
    : t("todo.stock.tickFull", { name: props.name, n: formatQty(props.ideal) }),
);

function tick() {
  emit("update:value", props.value === props.ideal ? null : props.ideal);
}

// Not counted yet: + starts at 1 and − at 0, the two answers people reach for first.
function step(direction: 1 | -1) {
  if (props.value === null) return emit("update:value", direction > 0 ? 1 : 0);
  emit("update:value", Math.max(0, props.value + direction));
}

function toggleHalf() {
  if (props.value === null) return emit("update:value", 0.5);
  emit("update:value", hasHalf.value ? props.value - 0.5 : props.value + 0.5);
}

const selectAll = (event: FocusEvent) => (event.target as HTMLInputElement).select();

function onChange(event: Event) {
  const field = event.target as HTMLInputElement;
  const parsed = parseQty(field.value);
  if (parsed === null) field.value = display.value; // not a quantity: put back what was there
  else emit("update:value", parsed);
}
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 68px;
  padding: 6px 8px 6px 4px;
  border-radius: 18px;
  transition: background-color 160ms linear;
}

.row.counted {
  background: var(--surface-container);
}

.tick {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 2px solid var(--outline);
  border-radius: 50%;
  color: transparent;
  transition:
    background-color 140ms linear,
    border-color 140ms linear,
    color 140ms linear,
    transform 200ms var(--ease-decelerate);
}

.full .tick {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
}

/* Counted, but under the ideal: the circle shows how far off, not a tick */
.short .tick {
  border-color: var(--error);
  color: var(--error);
}

.text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.sub {
  color: var(--on-surface-variant);
  font-size: 13px;
}

.verdict {
  font-size: 13px;
  font-weight: 700;
}

.short-text {
  color: var(--error);
}

.ok-text {
  color: var(--primary);
}

.stepper {
  flex: none;
  display: flex;
  align-items: center;
  gap: 3px;
}

.step,
.half {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-high);
  color: var(--on-surface);
}

.step:disabled {
  opacity: 0.4;
}

.half {
  width: 40px;
  font-size: 20px;
  font-weight: 600;
}

.half.on {
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.value {
  width: 52px;
  height: 44px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--on-surface);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.row:not(.counted) .value {
  color: var(--on-surface-variant);
  font-weight: 500;
}

.value:focus {
  border-color: var(--primary);
  background: var(--surface-lowest);
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}
</style>
