<template>
  <Transition name="sheet" @after-enter="focusInitial">
    <div v-if="open" class="sheet-root" :style="{ '--keyboard': `${keyboardInset}px` }">
      <div class="scrim" @click="emit('close')" />
      <section
        ref="panel"
        class="panel"
        :class="{ dragging: dragY > 0 }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        :style="dragY ? { transform: `translateY(${dragY}px)` } : undefined"
      >
        <header
          class="grab"
          @pointerdown="onGrabDown"
          @pointermove="onGrabMove"
          @pointerup="onGrabUp"
          @pointercancel="dragY = 0"
        >
          <span class="handle" aria-hidden="true" />
          <div class="heading">
            <h2 :id="titleId">{{ title }}</h2>
            <slot name="heading-action" />
            <button class="close state-layer" type="button" :aria-label="t('todo.close')" @click="emit('close')">
              <X :size="24" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div class="body"><slot /></div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { X } from "lucide-vue-next";
import { useLocale } from "@/lib/useLocale";

const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useLocale();

const DISMISS_PX = 110;

const titleId = useId();
const panel = ref<HTMLElement | null>(null);
const dragY = ref(0);
const keyboardInset = ref(0);
let grabStart: number | null = null;
let returnFocusTo: HTMLElement | null = null;

// Keep the sheet above the on-screen keyboard, which overlays fixed elements on iOS.
function trackKeyboard() {
  const viewport = window.visualViewport;
  if (viewport) keyboardInset.value = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocusTo = document.activeElement as HTMLElement | null;
      dragY.value = 0;
      window.visualViewport?.addEventListener("resize", trackKeyboard);
      window.addEventListener("keydown", onKeydown);
      await nextTick();
      // Focus now rather than after the animation: iOS only opens the keyboard for
      // focus that happens during the tap itself.
      focusInitial();
    } else {
      window.visualViewport?.removeEventListener("resize", trackKeyboard);
      window.removeEventListener("keydown", onKeydown);
      keyboardInset.value = 0;
      returnFocusTo?.focus?.();
    }
  },
);

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", trackKeyboard);
  window.removeEventListener("keydown", onKeydown);
});

// On window, not the sheet: focus falls back to <body> when the focused button is
// removed, such as after reopening a task from the completed list.
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

function focusInitial() {
  if (!panel.value || panel.value.contains(document.activeElement)) return;
  (panel.value.querySelector<HTMLElement>("[data-autofocus]") ?? panel.value).focus();
}

function onGrabDown(event: PointerEvent) {
  if ((event.target as HTMLElement).closest("button")) return;
  grabStart = event.clientY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onGrabMove(event: PointerEvent) {
  if (grabStart !== null) dragY.value = Math.max(0, event.clientY - grabStart);
}

function onGrabUp() {
  if (grabStart === null) return;
  grabStart = null;
  if (dragY.value > DISMISS_PX) emit("close");
  else dragY.value = 0;
}
</script>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: var(--keyboard);
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  max-height: calc(92dvh - var(--keyboard));
  border-radius: 28px 28px 0 0;
  background: var(--surface-low);
  box-shadow: var(--elevation-3);
  outline: none;
  transition: transform 240ms var(--ease-emphasized);
}

.panel.dragging {
  transition: none;
}

.grab {
  flex: none;
  padding: 10px 12px 4px 24px;
  touch-action: none;
  cursor: grab;
}

.handle {
  display: block;
  width: 36px;
  height: 4px;
  margin: 0 auto 8px calc(50% - 30px);
  border-radius: 2px;
  background: var(--outline-variant);
}

.heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

h2 {
  flex: 1;
  min-width: 0;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.25;
}

.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: var(--on-surface-variant);
}

.body {
  flex: 1;
  min-height: 0;
  padding: 8px 24px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.sheet-enter-active .scrim {
  transition: opacity 260ms linear;
}

.sheet-enter-active .panel {
  transition: transform 340ms var(--ease-decelerate);
}

.sheet-leave-active .scrim {
  transition: opacity 180ms linear;
}

.sheet-leave-active .panel {
  transition: transform 200ms var(--ease-accelerate);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 340ms;
}

.sheet-enter-from .scrim,
.sheet-leave-to .scrim {
  opacity: 0;
}

.sheet-enter-from .panel,
.sheet-leave-to .panel {
  transform: translateY(100%);
}
</style>
