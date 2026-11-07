<template>
  <Flame
    class="flame"
    :class="`level-${level}`"
    :size="SIZES[level] * scale"
    :fill="level === 1 ? 'none' : 'currentColor'"
    :stroke-width="level === 1 ? 2.25 : 1.75"
  />
</template>

<script setup lang="ts">
import { Flame } from "lucide-vue-next";
import type { Importance } from "@/lib/todoApi";

withDefaults(defineProps<{ level: Importance; scale?: number }>(), { scale: 1 });

// The flame grows with importance, so the level still reads without its colour.
const SIZES: Record<Importance, number> = { 1: 16, 2: 21, 3: 27 };
</script>

<style scoped>
.flame {
  flex: none;
}

.level-1 {
  color: var(--flame-1);
}

.level-2 {
  color: var(--flame-2);
}

.level-3 {
  color: var(--flame-3);
}
</style>
