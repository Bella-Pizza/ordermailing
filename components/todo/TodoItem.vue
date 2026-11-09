<template>
  <li class="row" :class="{ 'row-right': offset > 0, 'row-left': offset < 0, armed }" :data-task-id="task.id">
    <!-- Revealed behind the card while swiping -->
    <div class="reveal" aria-hidden="true">
      <span class="reveal-action complete"><Check :size="24" />{{ t("todo.task.complete") }}</span>
      <span class="reveal-action delete">{{ t("todo.task.delete") }}<Trash2 :size="22" /></span>
    </div>

    <article
      ref="card"
      class="todo-card"
      :class="{ settling: !dragging, done: checked, rejected }"
      @animationend="rejected = false"
      :style="offset ? { transform: `translateX(${offset}px)` } : undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="cancelDrag"
      @click.capture="suppressClickAfterDrag"
    >
      <button
        class="todo-check state-layer"
        type="button"
        data-no-swipe
        :aria-label="t('todo.task.completeNamed', { title: task.title })"
        @click="complete"
      >
        <span class="todo-check-ring"><Check :size="20" :stroke-width="3" aria-hidden="true" /></span>
      </button>

      <button class="todo-body" type="button" :aria-label="t('todo.task.editNamed', { title: task.title })" @click="emit('edit')">
        <span class="todo-title">{{ task.title }}</span>
        <span class="todo-meta">
          <span class="category-chip todo-chip" :style="{ '--hue': task.categoryHue }">
            <span class="todo-chip-label">{{ task.categoryName }}</span>
          </span>
          <span v-if="dateLabel" class="todo-date" :class="{ overdue }">{{ dateLabel }}</span>
          <span v-if="task.recurringId" class="todo-repeat" role="img" :aria-label="t('todo.recurring.repeats')">
            <Repeat :size="15" aria-hidden="true" />
          </span>
          <span
            v-if="checklistTotal"
            class="todo-progress"
            :class="{ complete: checklistDone === checklistTotal }"
            :aria-label="t('todo.checklist.progress', { done: checklistDone, total: checklistTotal })"
          >
            <ListChecks :size="15" aria-hidden="true" />
            {{ checklistDone }}/{{ checklistTotal }}
          </span>
        </span>
      </button>

      <span class="todo-flame" role="img" :aria-label="t(`todo.importance.${task.importance}`)">
        <TodoFlame :level="task.importance" />
      </span>
    </article>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ListChecks, Repeat, Trash2 } from "lucide-vue-next";
import TodoFlame from "./TodoFlame.vue";
import type { TodoTask } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{ task: TodoTask; dateLabel?: string; overdue?: boolean }>();
const checklistTotal = computed(() => props.task.checklist?.length ?? 0);
const checklistDone = computed(() => props.task.checklist?.filter((i) => i.done).length ?? 0);
const emit = defineEmits<{
  complete: [card: HTMLElement, swiped: boolean];
  /** Completing was refused: this many checklist items are still open */
  blocked: [remaining: number];
  delete: [];
  edit: [];
  swiped: [];
}>();
const { t } = useLocale();

const INTENT_PX = 10;
const COMMIT_RATIO = 0.35;
const COMMIT_MAX_PX = 140;

const card = ref<HTMLElement | null>(null);
const offset = ref(0);
const dragging = ref(false);
const armed = ref(false);
const checked = ref(false);

let startX = 0;
let startY = 0;
let pointerId: number | null = null;
let swipedThisPress = false;

const rejected = ref(false);
const remaining = computed(() => checklistTotal.value - checklistDone.value);

/** A checklist has to be finished first: shake the card red instead of completing it. */
function refuse() {
  rejected.value = false;
  // Restart the animation even when it's still playing from a previous attempt
  requestAnimationFrame(() => (rejected.value = true));
  navigator.vibrate?.([30, 40, 30]);
  emit("blocked", remaining.value);
}

function complete() {
  if (remaining.value > 0) return refuse();
  checked.value = true;
  emit("complete", card.value!, false);
}

const commitDistance = () => Math.min(card.value!.offsetWidth * COMMIT_RATIO, COMMIT_MAX_PX);

function onPointerDown(event: PointerEvent) {
  swipedThisPress = false;
  if (event.button !== 0 || (event.target as HTMLElement).closest("[data-no-swipe]")) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;

  if (!dragging.value) {
    if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return;
    // Mostly vertical means the user is scrolling the page: leave it alone.
    if (Math.abs(dy) >= Math.abs(dx)) {
      pointerId = null;
      return;
    }
    dragging.value = true;
    swipedThisPress = true;
    card.value!.setPointerCapture(event.pointerId);
  }

  offset.value = dx;
  const nowArmed = Math.abs(dx) >= commitDistance();
  if (nowArmed && !armed.value) navigator.vibrate?.(10);
  armed.value = nowArmed;
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  if (!dragging.value) return;
  dragging.value = false;

  if (!armed.value) {
    offset.value = 0;
    return;
  }
  armed.value = false;
  emit("swiped");

  if (offset.value > 0 && remaining.value > 0) {
    offset.value = 0;
    refuse();
  } else if (offset.value > 0) {
    checked.value = true;
    emit("complete", card.value!, true);
  } else {
    // Slide away first; the row then closes the gap as it's removed.
    offset.value = -card.value!.offsetWidth - 24;
    setTimeout(() => emit("delete"), 160);
  }
}

function cancelDrag() {
  pointerId = null;
  dragging.value = false;
  armed.value = false;
  offset.value = 0;
}

function suppressClickAfterDrag(event: MouseEvent) {
  if (swipedThisPress) {
    event.stopPropagation();
    event.preventDefault();
    swipedThisPress = false;
  }
}
</script>

<style scoped>
.row {
  position: relative;
  width: 100%;
  border-radius: 20px;
}

.reveal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  border-radius: 20px;
  visibility: hidden;
  font-size: 14px;
  font-weight: 600;
}

.row-right .reveal {
  visibility: visible;
  background: var(--primary);
  color: var(--on-primary);
}

.row-left .reveal {
  visibility: visible;
  background: var(--error);
  color: var(--on-error);
}

.reveal-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  opacity: 0.75;
  transition:
    transform 160ms var(--ease-decelerate),
    opacity 120ms linear;
}

.row-right .delete,
.row-left .complete {
  display: none;
}

.row-left .delete {
  margin-left: auto;
}

.armed .reveal-action {
  opacity: 1;
  transform: scale(1.12);
}

/* Not nested under .row: TodoBoard clones this card for the fly-to-drawer animation,
   and the clone is appended outside the row. */
.todo-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 76px;
  padding: 6px 14px 6px 4px;
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--elevation-1);
  color: var(--on-surface);
  touch-action: pan-y;
  user-select: none;
}

.todo-card.settling {
  transition: transform 260ms var(--ease-emphasized);
}

.todo-card.rejected {
  animation: todo-reject 460ms var(--ease-emphasized);
}

@keyframes todo-reject {
  0%,
  100% {
    transform: translateX(0);
  }
  10%,
  70% {
    background: var(--error-container);
    box-shadow: inset 0 0 0 2px var(--error);
  }
  15% {
    transform: translateX(-12px);
  }
  35% {
    transform: translateX(10px);
  }
  55% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(3px);
  }
}

/* No motion wanted: keep the red flash, drop the shake */
@media (prefers-reduced-motion: reduce) {
  .todo-card.rejected {
    animation: todo-reject-still 600ms linear !important;
  }

  @keyframes todo-reject-still {
    0%,
    80% {
      background: var(--error-container);
      box-shadow: inset 0 0 0 2px var(--error);
    }
  }
}

.todo-check {
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
}

.todo-check-ring {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--outline);
  border-radius: 50%;
  color: transparent;
  transition:
    background-color 140ms linear,
    border-color 140ms linear,
    color 140ms linear,
    transform 220ms var(--ease-decelerate);
}

@media (hover: hover) {
  .todo-check:hover .todo-check-ring {
    border-color: var(--primary);
    color: var(--primary);
  }
}

.done .todo-check-ring {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
  transform: scale(1.1);
}

.todo-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px 4px;
  border-radius: 12px;
  text-align: left;
}

.todo-title {
  font-size: 17px;
  font-weight: 500;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}

.todo-chip {
  min-height: 24px;
  padding: 1px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.todo-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-date {
  color: var(--on-surface-variant);
  font-size: 13px;
}

.todo-date.overdue {
  color: var(--error);
  font-weight: 600;
}

.todo-repeat {
  display: inline-flex;
  color: var(--on-surface-variant);
}

.todo-progress {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--surface-high);
  color: var(--on-surface);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.todo-progress.complete {
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.todo-flame {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
}
</style>
