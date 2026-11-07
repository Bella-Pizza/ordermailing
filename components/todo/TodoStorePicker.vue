<template>
  <main class="picker">
    <button class="lang state-layer" type="button" :aria-label="t('todo.switchLanguage')" @click="toggleLang">
      {{ lang === "en" ? "FR" : "EN" }}
    </button>

    <div class="content">
      <div class="mark" aria-hidden="true"><ListChecks :size="32" /></div>
      <h1>{{ t("todo.picker.title") }}</h1>
      <p class="subtitle">{{ t("todo.picker.subtitle") }}</p>

      <div v-if="status === 'error'" class="message" role="alert">
        <p>{{ t("todo.picker.error") }}</p>
        <button class="text-button state-layer" type="button" @click="load">{{ t("todo.retry") }}</button>
      </div>
      <p v-else-if="status === 'ready' && !stores.length" class="message">{{ t("todo.picker.empty") }}</p>

      <div v-else class="field-wrap">
        <button
          ref="trigger"
          class="field state-layer"
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-controls="todo-store-list"
          :aria-expanded="menuOpen"
          :aria-activedescendant="menuOpen ? `todo-store-${activeIndex}` : undefined"
          :disabled="status === 'loading'"
          @click="menuOpen = !menuOpen"
          @blur="menuOpen = false"
          @keydown="onKeydown"
        >
          <span>{{ status === "loading" ? t("todo.loading") : t("todo.picker.select") }}</span>
          <ChevronDown :size="24" class="chevron" :class="{ flipped: menuOpen }" aria-hidden="true" />
        </button>

        <Transition name="menu">
          <ul v-show="menuOpen" id="todo-store-list" class="menu" role="listbox" :aria-label="t('todo.picker.select')">
            <!-- mousedown.prevent keeps focus on the trigger, so its blur doesn't close the menu mid-click -->
            <li
              v-for="(store, index) in stores"
              :id="`todo-store-${index}`"
              :key="store.id"
              class="option"
              :class="{ active: index === activeIndex }"
              role="option"
              :aria-selected="index === activeIndex"
              @mousedown.prevent
              @mouseenter="activeIndex = index"
              @click="emit('select', store)"
            >
              <StoreIcon :size="20" aria-hidden="true" />
              <span>{{ store.name }}</span>
            </li>
          </ul>
        </Transition>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ChevronDown, ListChecks, Store as StoreIcon } from "lucide-vue-next";
import { fetchTodoStores, type TodoStore } from "@/lib/todoApi";
import { useLocale } from "@/lib/useLocale";

const emit = defineEmits<{ select: [store: TodoStore] }>();
const { t, lang, setLang } = useLocale();

const stores = ref<TodoStore[]>([]);
const status = ref<"loading" | "ready" | "error">("loading");
const menuOpen = ref(false);
const activeIndex = ref(0);

const toggleLang = () => setLang(lang.value === "en" ? "fr" : "en");

async function load() {
  status.value = "loading";
  try {
    stores.value = await fetchTodoStores();
    status.value = "ready";
  } catch {
    status.value = "error";
  }
}

onMounted(load);

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    menuOpen.value = false;
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!menuOpen.value) {
      menuOpen.value = true;
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = (activeIndex.value + step + stores.value.length) % stores.value.length;
  } else if ((event.key === "Enter" || event.key === " ") && menuOpen.value) {
    event.preventDefault();
    emit("select", stores.value[activeIndex.value]);
  }
}
</script>

<style scoped>
.picker {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px 16px;
}

.lang {
  position: absolute;
  top: 12px;
  right: 12px;
  min-width: 48px;
  height: 48px;
  border-radius: 24px;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 600;
}

.content {
  width: 100%;
  max-width: 420px;
  text-align: center;
}

.mark {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 24px;
  border-radius: 24px;
  background: var(--primary-container);
  color: var(--on-primary-container);
}

h1 {
  font-size: clamp(30px, 8vw, 40px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.subtitle {
  margin: 12px 0 32px;
  color: var(--on-surface-variant);
}

.field-wrap {
  position: relative;
  text-align: left;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 64px;
  padding: 0 16px 0 20px;
  border: 1px solid var(--outline);
  border-radius: 16px;
  background: var(--surface-lowest);
  font-size: 18px;
  font-weight: 500;
}

.field:disabled {
  color: var(--on-surface-variant);
}

.chevron {
  transition: transform 200ms var(--ease-emphasized);
}

.chevron.flipped {
  transform: rotate(180deg);
}

.menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: min(50dvh, 360px);
  padding: 8px;
  overflow-y: auto;
  border-radius: 16px;
  background: var(--surface-container);
  box-shadow: var(--elevation-2);
  transform-origin: top;
}

.option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.option svg {
  flex: none;
  color: var(--on-surface-variant);
}

.option.active {
  background: var(--surface-high);
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
  transform: scaleY(0.9);
}

.menu-leave-to {
  opacity: 0;
}

.message {
  padding: 16px;
  border-radius: 16px;
  background: var(--surface-container);
  color: var(--on-surface-variant);
}

.text-button {
  min-height: 48px;
  margin-top: 8px;
  padding: 0 20px;
  border-radius: 24px;
  color: var(--primary);
  font-weight: 600;
}
</style>
