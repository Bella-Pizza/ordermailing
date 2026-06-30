<template>
  <!-- ─── Step 1: Pick a supplier ─────────────────────────────────────────── -->
  <div v-if="!selectedSupplier" class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">New order</h1>
      <p class="text-sm text-muted-foreground">Choose a supplier to order from.</p>
    </div>

    <!-- Search -->
    <div class="relative max-w-sm">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="supplierSearch" placeholder="Search suppliers…" class="pl-9" />
    </div>

    <!-- Loading -->
    <div v-if="loadingSuppliers" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="n in 6" :key="n" class="h-28 animate-pulse rounded-xl border bg-muted" />
    </div>

    <!-- Empty -->
    <p v-else-if="filteredSuppliers.length === 0" class="text-sm text-muted-foreground">
      {{ supplierSearch ? "No suppliers match your search." : "No active suppliers found." }}
    </p>

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="supplier in filteredSuppliers"
        :key="supplier.id"
        class="group relative flex items-center gap-4 rounded-xl border bg-card px-5 py-4 text-left shadow-sm transition-all duration-150 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        @click="pickSupplier(supplier)"
      >
        <!-- Coloured initial avatar -->
        <div
          class="flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          :style="{ backgroundColor: supplierColor(supplier.name) }"
        >
          {{ supplier.name[0]?.toUpperCase() }}
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold leading-tight">{{ supplier.name }}</p>
          <p v-if="supplier.description" class="truncate text-sm text-muted-foreground">{{ supplier.description }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ supplier.productCount }} product{{ supplier.productCount !== 1 ? "s" : "" }}
          </p>
        </div>

        <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  </div>

  <!-- ─── Step 2: Products & quantities ──────────────────────────────────── -->
  <div v-else class="flex flex-col gap-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="icon" class="-ml-2 shrink-0" @click="handleReturnClick">
        <ArrowLeft class="size-5" />
      </Button>
      <div class="flex-1">
        <h1 class="text-2xl font-bold tracking-tight">{{ selectedSupplier.name }}</h1>
        <p class="text-sm text-muted-foreground">Fill in the quantities for this order.</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="shrink-0 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900"
        :disabled="generating || loadingProducts"
        @click="generateTemplate"
      >
        <Loader2 v-if="generating" class="mr-1.5 size-4 animate-spin" />
        <Sparkles v-else class="mr-1.5 size-4" />
        {{ generating ? "Generating…" : "Generate Template" }}
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="loadingProducts" class="flex flex-col gap-2">
      <div v-for="n in 5" :key="n" class="h-14 animate-pulse rounded-lg border bg-muted" />
    </div>

    <!-- Empty -->
    <p v-else-if="filteredProducts.length === 0" class="text-sm text-muted-foreground">
      This supplier has no active products.
    </p>

    <!-- Product rows -->
    <div v-else class="flex flex-col gap-3">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        class="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4"
      >
        <!-- Top row: name + ideal stock -->
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold leading-tight">{{ product.internalName }}</p>
              <Badge
                v-if="product.manualOrder"
                class="shrink-0 border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
              >
                {{ t('newOrder.manual') }}
              </Badge>
            </div>
            <p
              v-if="product.internalName !== product.supplierName"
              class="mt-0.5 truncate text-xs text-muted-foreground"
            >
              {{ product.supplierName }}
            </p>
          </div>
          <p class="shrink-0 text-sm text-muted-foreground">
            {{ t('newOrder.idealStock') }} <span class="font-medium text-foreground">{{ product.idealStock }}</span>
          </p>
        </div>

        <!-- Stepper row -->
        <div class="flex items-center gap-3">
          <Button
            variant="default"
            class="size-12 shrink-0 rounded-xl text-lg"
            size="icon"
            :disabled="(quantities[product.id] ?? 0) <= 0"
            @mousedown="startPress(product.id, -1)"
            @touchstart.prevent="startPress(product.id, -1)"
            @mouseup="stopPress"
            @mouseleave="stopPress"
            @touchend="stopPress"
          >
            <Minus class="size-5" />
          </Button>

          <Input
            :value="quantities[product.id] ?? 0"
            type="number"
            min="0"
            :max="product.manualOrder ? undefined : product.idealStock"
            class="h-12 flex-1 text-center text-xl font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            @input="setQty(product.id, Number(($event.target as HTMLInputElement).value))"
          />

          <Button
            variant="default"
            class="size-12 shrink-0 rounded-xl text-lg"
            size="icon"
            :disabled="!product.manualOrder && (quantities[product.id] ?? 0) >= product.idealStock"
            @mousedown="startPress(product.id, 1)"
            @touchstart.prevent="startPress(product.id, 1)"
            @mouseup="stopPress"
            @mouseleave="stopPress"
            @touchend="stopPress"
          >
            <Plus class="size-5" />
          </Button>
        </div>

        <!-- Sub-label -->
        <p class="text-sm text-muted-foreground">
          <template v-if="product.manualOrder">
            <span class="font-semibold text-foreground">{{ orderQty(product) }}</span> {{ t('newOrder.willBeOrdered') }}
          </template>
          <template v-else-if="nolanMode">
            <span class="font-semibold text-foreground">{{ orderQty(product) }}</span> {{ t('newOrder.ordered') }}
            {{ t('newOrder.countedInStock') }}: <span class="font-semibold text-foreground">{{ countedQty(product) }}</span>
          </template>
          <template v-else>
            {{ t('newOrder.countedInStock') }} →
            <span class="font-semibold text-foreground">{{ orderQty(product) }}</span> {{ t('newOrder.willBeOrdered') }}
          </template>
        </p>
      </div>
    </div>

    <!-- Summary bar: always visible while editing -->
    <div class="sticky bottom-4 mt-2">
      <div class="flex items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 shadow-lg">
        <!-- Save indicator -->
        <div class="flex min-w-0 items-center gap-1.5 text-xs">
          <Loader2 v-if="saveStatus === 'saving'" class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <HardDrive v-else-if="saveStatus === 'local'" class="size-3.5 shrink-0 text-muted-foreground" />
          <CloudOff v-else-if="saveStatus === 'offline'" class="size-3.5 shrink-0 text-amber-500" />
          <Cloud v-else-if="saveStatus === 'saved'" class="size-3.5 shrink-0 text-green-500" />
          <span v-if="saveStatus === 'saving'" class="text-muted-foreground">{{ t('newOrder.saving') }}</span>
          <span v-else-if="saveStatus === 'local'" class="text-muted-foreground">{{ t('newOrder.savedLocally') }}</span>
          <span v-else-if="saveStatus === 'offline'" class="text-amber-500">{{ t('newOrder.offline') }}</span>
          <span v-else-if="saveStatus === 'saved'" class="text-green-500">{{ t('newOrder.saved') }}</span>
          <span v-else class="text-muted-foreground"
            >{{ orderLines.length }} item{{ orderLines.length !== 1 ? "s" : "" }}</span
          >
        </div>
        <Button :disabled="orderLines.length === 0" @click="reviewOpen = true">
          <ClipboardList class="mr-2 size-4" />
          Review order
        </Button>
      </div>
    </div>
  </div>

  <!-- ─── Review dialog ──────────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="reviewOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-lg' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Order for {{ selectedSupplier?.name }}</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">Review your order before sending.</component>
      </component>

      <div :class="['mt-3', !isDesktop && 'px-6']">
        <Textarea
          v-model="notes"
          placeholder="Additional notes (optional)…"
          class="min-h-[80px] resize-none text-sm"
        />
      </div>

      <div :class="['overflow-y-auto rounded-md border', isDesktop ? 'max-h-80' : 'mx-6 max-h-[55vh]']">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
              <th class="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="line in orderLines" :key="line.productId">
              <td class="px-3 py-2">
                <p class="font-medium">{{ line.internalName }}</p>
                <p v-if="line.internalName !== line.supplierName" class="text-xs text-muted-foreground">
                  {{ line.supplierName }}
                </p>
              </td>
              <td class="px-3 py-2 text-right font-semibold tabular-nums">{{ line.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" @click="reviewOpen = false">Edit</Button>
        <Button :disabled="submitting" @click="submitOrder">
          <Loader2 v-if="submitting" class="mr-2 size-4 animate-spin" />
          Send order
        </Button>
      </component>
    </component>
  </component>

  <!-- ─── Confirm leave dialog ────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="confirmLeaveOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-sm' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">{{ t('newOrder.leave.title') }}</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          {{ t('newOrder.leave.description', { supplier: selectedSupplier?.name ?? '' }) }}
        </component>
      </component>
      <div :class="['flex flex-col gap-2 pt-2', !isDesktop && 'px-6 pb-6']">
        <Button class="w-full justify-start" @click="leaveAndSave">
          <Cloud class="mr-2 size-4" />
          {{ t('newOrder.leave.saveLeave') }}
        </Button>
        <Button variant="destructive" class="w-full justify-start" @click="leaveAndDiscard">
          <Trash2 class="mr-2 size-4" />
          {{ t('newOrder.leave.discardLeave') }}
        </Button>
        <Button variant="outline" class="w-full justify-start" @click="confirmLeaveOpen = false">
          <ArrowLeft class="mr-2 size-4" />
          {{ t('newOrder.leave.continue') }}
        </Button>
      </div>
    </component>
  </component>

  <!-- ─── AI Suggestion dialog ────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="suggestionOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-lg' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <div class="flex items-center gap-2.5">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
            <Sparkles class="size-4 text-purple-600 dark:text-purple-400" />
          </div>
          <component :is="isDesktop ? DialogTitle : DrawerTitle">AI Order Suggestion</component>
        </div>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          Generated based on your past orders and upcoming Belgian holidays.
        </component>
      </component>

      <div
        :class="[
          'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
          !isDesktop && 'mx-6',
        ]"
      >
        <p class="font-semibold">⚠️ This is a suggestion only</p>
        <p class="mt-0.5 text-amber-800 dark:text-amber-300">
          Quantities are estimated by AI — not guaranteed to be correct. Review carefully. You can edit everything after
          accepting.
        </p>
      </div>

      <div
        v-if="suggestions.length === 0"
        :class="['py-6 text-center text-sm text-muted-foreground', !isDesktop && 'px-6']"
      >
        No suggestions could be generated for this supplier.
      </div>
      <div v-else :class="['overflow-y-auto rounded-md border', isDesktop ? 'max-h-72' : 'mx-6 max-h-[40vh]']">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
              <th class="px-3 py-2 text-right font-medium text-muted-foreground">Suggested Qty</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="s in suggestions" :key="s.productId" :class="s.note && 'bg-amber-50/60 dark:bg-amber-950/30'">
              <td class="px-3 py-2">
                <div class="flex items-center gap-1.5">
                  <AlertTriangle
                    v-if="s.note"
                    class="size-3.5 shrink-0 text-amber-500"
                  />
                  <div>
                    <p class="font-medium">{{ filteredProducts.find((p) => p.id === s.productId)?.internalName ?? s.productId }}</p>
                    <p v-if="s.note" class="text-xs text-amber-700 dark:text-amber-400">{{ s.note }}</p>
                  </div>
                </div>
              </td>
              <td class="px-3 py-2 text-right font-semibold tabular-nums text-purple-700 dark:text-purple-300">
                {{ s.quantity }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" @click="rejectSuggestion">
          <X class="mr-2 size-4" />
          Reject
        </Button>
        <Button
          class="bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
          :disabled="suggestions.length === 0"
          @click="acceptSuggestion"
        >
          <Check class="mr-2 size-4" />
          Accept Suggestion
        </Button>
      </component>
    </component>
  </component>

  <!-- ─── Success dialog ─────────────────────────────────────────────────── -->
  <Dialog v-model:open="successOpen">
    <DialogContent class="sm:max-w-sm text-center">
      <div class="flex flex-col items-center gap-3 py-4">
        <div class="flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle class="size-7 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <DialogTitle class="text-lg">Order sent!</DialogTitle>
          <DialogDescription class="mt-1">
            Your order to <strong>{{ lastOrderSupplier }}</strong> has been placed.
          </DialogDescription>
        </div>
      </div>
      <DialogFooter class="sm:justify-center gap-2">
        <Button variant="outline" @click="newOrder">New order</Button>
        <Button as-child>
          <a href="/orders">View orders</a>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted } from "vue";
import { useMediaQuery } from "@vueuse/core";
import {
  Search,
  ChevronRight,
  ArrowLeft,
  Plus,
  Minus,
  ClipboardList,
  Loader2,
  CheckCircle,
  Cloud,
  CloudOff,
  HardDrive,
  Trash2,
  Sparkles,
  Check,
  X,
  AlertTriangle,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/lib/useAuth";
import { useNolanMode } from "@/lib/useNolanMode";
import { useLocale } from "@/lib/useLocale";

const isDesktop = useMediaQuery("(min-width: 768px)");

interface Supplier {
  id: string;
  name: string;
  email: string;
  description?: string;
  isActive: boolean;
  productCount: number;
}

interface Product {
  id: string;
  supplierName: string;
  internalName: string;
  isActive: boolean;
  idealStock: number;
  displayOrder: number;
  manualOrder: boolean;
}

const { loading: authLoading } = useAuth();
const { nolanMode } = useNolanMode();
const { t } = useLocale();

// ─── Suppliers ────────────────────────────────────────────────────────────────
const suppliers = ref<Supplier[]>([]);
const loadingSuppliers = ref(true);
const supplierSearch = ref("");

const filteredSuppliers = computed(() => {
  const q = supplierSearch.value.toLowerCase().trim();
  return suppliers.value.filter((s) => s.isActive && s.productCount > 0 && (!q || s.name.toLowerCase().includes(q)));
});

watch(
  authLoading,
  (loading) => {
    if (!loading) fetchSuppliers();
  },
  { immediate: true },
);

async function fetchSuppliers() {
  loadingSuppliers.value = true;
  try {
    const res = await apiFetch("/api/suppliers");
    suppliers.value = await res.json();
    await tryRestoreDraft();
  } catch {
    suppliers.value = [];
  } finally {
    loadingSuppliers.value = false;
  }
}

// Deterministic pastel-ish color from name
function supplierColor(name: string): string {
  const palette = ["#4f7cff", "#e05c5c", "#44b89a", "#e07e3c", "#9b59b6", "#e0b63c", "#3cb0d0", "#d05c8c"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ─── Products ─────────────────────────────────────────────────────────────────
const selectedSupplier = ref<Supplier | null>(null);
const products = ref<Product[]>([]);
const loadingProducts = ref(false);
const quantities = reactive<Record<string, number>>({});

const filteredProducts = computed(() => products.value.filter((p) => p.isActive));

/**
 * For manualOrder products: direct input.
 * For normal products in Nolan mode: direct input (user enters order qty).
 * For normal products default: idealStock − counted (clamped ≥ 0).
 */
function orderQty(product: Product): number {
  const val = quantities[product.id] ?? 0;
  if (product.manualOrder || nolanMode.value) return val;
  return Math.max(0, product.idealStock - val);
}

/** The amount counted in stock, derived from the input (only meaningful in Nolan mode for non-manual products). */
function countedQty(product: Product): number {
  const val = quantities[product.id] ?? 0;
  return Math.max(0, product.idealStock - val);
}

const orderLines = computed(() =>
  filteredProducts.value
    .filter((p) => orderQty(p) > 0)
    .map((p) => ({
      productId: p.id,
      supplierName: p.supplierName,
      internalName: p.internalName,
      quantity: orderQty(p),
    })),
);

// ─── Autosave ─────────────────────────────────────────────────────────────────
const LS_KEY = "order_draft";
const draftId = ref<string | null>(null);
const saveStatus = ref<"idle" | "local" | "saving" | "saved" | "offline">("idle");
const dirty = ref(false);
let syncTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
let creating = false; // guard against concurrent draft-creation POSTs

/** Persist to localStorage immediately */
function saveLocal() {
  if (!selectedSupplier.value) return;
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({
      supplierId: selectedSupplier.value.id,
      supplierName: selectedSupplier.value.name,
      supplierEmail: selectedSupplier.value.email,
      draftId: draftId.value,
      quantities: { ...quantities },
    }),
  );
}

function clearLocal() {
  localStorage.removeItem(LS_KEY);
}

/** Cancel both localStorage and the DB draft (reads draftId from localStorage as fallback) */
async function discardDraftFully() {
  // Prefer in-memory id; fall back to what's stored locally
  let idToDelete = draftId.value;
  if (!idToDelete) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) idToDelete = JSON.parse(raw)?.draftId ?? null;
    } catch {
      /* ignore */
    }
  }
  clearLocal();
  if (idToDelete) {
    try {
      await apiFetch(`/api/orders/${idToDelete}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }
  draftId.value = null;
}

/** Push current draft to the server (always PATCH; draft is created on supplier selection) */
async function syncToServer() {
  if (!selectedSupplier.value || !dirty.value) return;
  if (!navigator.onLine) {
    saveStatus.value = "offline";
    return;
  }

  saveStatus.value = "saving";
  dirty.value = false;

  const lines = filteredProducts.value.map((p) => ({
    productId: p.id,
    supplierName: p.supplierName,
    internalName: p.internalName,
    quantity: orderQty(p),
  }));

  try {
    if (!draftId.value) {
      // Fallback: draft creation may have failed during pickSupplier — retry here,
      // but guard against concurrent POSTs duplicating the order.
      if (creating) return;
      creating = true;
      try {
        const res = await apiFetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: selectedSupplier.value.id,
            supplierName: selectedSupplier.value.name,
            supplierEmail: selectedSupplier.value.email,
            lines,
            status: "draft",
          }),
        });
        const data = (await res.json()) as { id: string };
        draftId.value = data.id;
        saveLocal();
      } finally {
        creating = false;
      }
    } else {
      await apiFetch(`/api/orders/${draftId.value}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, ...(fromAiTemplate.value && { fromAiTemplate: true }) }),
      });
    }
    saveStatus.value = "saved";
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      saveStatus.value = "idle";
    }, 3000);
  } catch {
    dirty.value = true; // retry next cycle
    saveStatus.value = navigator.onLine ? "saving" : "offline";
  }
}

/** Called after every quantity change */
function onQuantityChange() {
  dirty.value = true;
  saveLocal();
  saveStatus.value = "local";
  // Debounce: sync to server 2 s after the last interaction
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncToServer();
  }, 2_000);
}

function startSyncTimer() {
  stopSyncTimer();
  syncTimer = setInterval(syncToServer, 30_000); // safety-net flush every 30 s
}

function stopSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function handleOnline() {
  if (saveStatus.value === "offline" || dirty.value) {
    saveStatus.value = "saving";
    syncToServer();
  }
}

onMounted(() => {
  history.pushState(null, "", location.href);
  window.addEventListener("popstate", handlePopState);
  document.addEventListener("click", handleSidebarClick, true);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", () => {
    if (saveStatus.value !== "idle") saveStatus.value = "offline";
  });
});

onUnmounted(() => {
  stopSyncTimer();
  window.removeEventListener("popstate", handlePopState);
  document.removeEventListener("click", handleSidebarClick, true);
  window.removeEventListener("online", handleOnline);
});

// ─── Auto-restore draft on page load ─────────────────────────────────────────
async function tryRestoreDraft() {
  if (typeof window === "undefined" || selectedSupplier.value) return;

  const shouldResume = sessionStorage.getItem("order_resume") === "1";
  sessionStorage.removeItem("order_resume");

  // Also restore on a page refresh so the user doesn't lose their work
  const isReload =
    (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";

  const hasDraftInStorage = !!localStorage.getItem("order_draft");

  if (!shouldResume && !(isReload && hasDraftInStorage)) {
    // Genuine fresh navigation — discard any lingering draft
    await discardDraftFully();
    return;
  }
  const raw = localStorage.getItem("order_draft");
  if (!raw) return;
  try {
    const draft = JSON.parse(raw) as {
      supplierId: string;
      draftId?: string;
      quantities: Record<string, number>;
      lines?: Array<{ productId: string; quantity: number }>;
    };
    const match = suppliers.value.find((s) => s.id === draft.supplierId);
    if (!match) return;
    await pickSupplier(match, true); // existing draft — skip creating a new one
    draftId.value = draft.draftId ?? null;

    if (draft.lines && draft.lines.length > 0) {
      // Restore from lines (coming from the orders list page).
      // Convert order qty → input value depending on mode:
      //   manualOrder or Nolan mode → input = order qty (direct)
      //   normal mode               → input = counted = idealStock − order qty
      const lineMap = new Map(draft.lines.map((l) => [l.productId, l.quantity]));
      for (const p of products.value) {
        if (!(p.id in quantities)) continue;
        const orderQtyVal = lineMap.get(p.id) ?? 0;
        quantities[p.id] =
          p.manualOrder || nolanMode.value ? orderQtyVal : Math.max(0, p.idealStock - orderQtyVal);
      }
    } else {
      // Restore from quantities (saved mid-session by autosave)
      for (const [id, qty] of Object.entries(draft.quantities ?? {})) {
        if (id in quantities) quantities[id] = qty;
      }
    }
  } catch {
    /* ignore */
  }
}

// ─── Pick supplier ────────────────────────────────────────────────────────────
/**
 * Select a supplier and transition to step 2.
 * @param skipDbCreate  Pass true when restoring a draft that already exists in DB.
 */
async function pickSupplier(supplier: Supplier, skipDbCreate = false) {
  stopSyncTimer();
  selectedSupplier.value = supplier;
  draftId.value = null;
  dirty.value = false;
  saveStatus.value = "idle";
  creating = false;
  for (const key in quantities) delete quantities[key];

  loadingProducts.value = true;
  try {
    const res = await apiFetch(`/api/suppliers/${supplier.id}/products`);
    products.value = ((await res.json()) as Product[]).sort((a, b) => a.displayOrder - b.displayOrder);
    for (const p of products.value) {
      if (p.isActive) quantities[p.id] = 0;
    }
  } catch {
    products.value = [];
  } finally {
    loadingProducts.value = false;
  }

  // Eagerly create the draft in DB so draftId is set before any quantity changes.
  if (!skipDbCreate) {
    try {
      saveStatus.value = "saving";
      creating = true;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierEmail: supplier.email,
          lines: [],
          status: "draft",
        }),
      });
      const data = (await res.json()) as { id: string };
      draftId.value = data.id;
      saveLocal();
      saveStatus.value = "saved";
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        saveStatus.value = "idle";
      }, 3000);
    } catch {
      saveStatus.value = "offline";
    } finally {
      creating = false;
    }
  }

  startSyncTimer();
}

function maxInput(productId: string): number {
  const p = products.value.find((p) => p.id === productId);
  return p && !p.manualOrder ? p.idealStock : Infinity;
}

function adjust(productId: string, delta: number) {
  const cur = quantities[productId] ?? 0;
  quantities[productId] = Math.min(Math.max(0, cur + delta), maxInput(productId));
  onQuantityChange();
}

function setQty(productId: string, val: number) {
  const clamped = isNaN(val) || val < 0 ? 0 : val;
  quantities[productId] = Math.min(clamped, maxInput(productId));
  onQuantityChange();
}

// ─── Hold-to-repeat ───────────────────────────────────────────────────────────
let pressActive = false;
let pressTimer: ReturnType<typeof setTimeout> | null = null;

function startPress(productId: string, delta: number) {
  adjust(productId, delta);
  pressActive = true;
  pressTimer = setTimeout(() => repeat(productId, delta), 400);
}

function repeat(productId: string, delta: number) {
  if (!pressActive) return;
  adjust(productId, delta);
  const delay = (quantities[productId] ?? 0) > 5 ? 50 : 150;
  pressTimer = setTimeout(() => repeat(productId, delta), delay);
}

function stopPress() {
  pressActive = false;
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

// ─── Review & submit ──────────────────────────────────────────────────────────
const reviewOpen = ref(false);
const submitting = ref(false);
const successOpen = ref(false);
const notes = ref("");
const lastOrderSupplier = ref("");
const confirmLeaveOpen = ref(false);
const pendingNavUrl = ref<string | null>(null);
const pendingNavBack = ref(false);
const pendingNavInternal = ref(false); // true = return to supplier picker (step 1)

// ─── AI template generation ───────────────────────────────────────────────────
interface AISuggestion {
  productId: string;
  quantity: number;
  note?: string;
}
const generating = ref(false);
const suggestions = ref<AISuggestion[]>([]);
const suggestionOpen = ref(false);
const fromAiTemplate = ref(false);

async function generateTemplate() {
  if (!selectedSupplier.value || generating.value) return;
  generating.value = true;
  try {
    const res = await apiFetch("/api/orders/generate-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: selectedSupplier.value.id,
        products: filteredProducts.value.map((p) => ({
          id: p.id,
          internalName: p.internalName,
          supplierName: p.supplierName,
          idealStock: p.idealStock,
          manualOrder: p.manualOrder,
        })),
      }),
    });
    const data = (await res.json()) as { suggestions: AISuggestion[] };
    suggestions.value = data.suggestions ?? [];
  } catch {
    suggestions.value = [];
  } finally {
    generating.value = false;
    suggestionOpen.value = true;
  }
}

function acceptSuggestion() {
  // Reset all quantities, then apply the AI suggestion as a complete recommendation
  for (const id of Object.keys(quantities)) quantities[id] = 0;
  for (const s of suggestions.value) {
    const product = filteredProducts.value.find((p) => p.id === s.productId);
    if (!product) continue;
    // manualOrder & Nolan mode: input = order qty directly
    // normal mode: input = counted stock = idealStock − orderQty
    quantities[product.id] =
      product.manualOrder || nolanMode.value ? s.quantity : Math.max(0, product.idealStock - s.quantity);
  }
  fromAiTemplate.value = true;
  if (suggestions.value.length > 0) onQuantityChange();
  suggestionOpen.value = false;
}

function rejectSuggestion() {
  suggestions.value = [];
  suggestionOpen.value = false;
}

/** True whenever a draft is in progress (supplier picked and at least one edit made) */
const hasDraft = computed(() => !!selectedSupplier.value && (dirty.value || !!draftId.value));

function handleReturnClick() {
  if (!hasDraft.value) {
    selectedSupplier.value = null;
    return;
  }
  pendingNavInternal.value = true;
  pendingNavBack.value = false;
  pendingNavUrl.value = null;
  confirmLeaveOpen.value = true;
}

function interceptNav(url: string | null, isBack: boolean) {
  if (!hasDraft.value) {
    // No draft — navigate freely
    if (isBack) history.go(-2);
    else if (url) window.location.href = url;
    return;
  }
  pendingNavUrl.value = url;
  pendingNavBack.value = isBack;
  pendingNavInternal.value = false;
  confirmLeaveOpen.value = true;
}

/** Intercept clicks on sidebar navigation links only */
function handleSidebarClick(e: MouseEvent) {
  const anchor = (e.target as Element)?.closest("a[href]");
  if (!anchor) return;
  // Only intercept sidebar navigation links (data-sidebar="menu-button" is set by SidebarMenuButtonChild)
  if ((anchor as HTMLElement).dataset.sidebar !== "menu-button") return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href === "/orders/new") return;
  if (!hasDraft.value) return;
  e.preventDefault();
  e.stopPropagation();
  interceptNav(href, false);
}

function handlePopState() {
  // Re-push so URL stays put while dialog is open
  history.pushState(null, "", location.href);
  interceptNav(null, true);
}

/** Save to cloud, keep localStorage so Layout resume popup will appear */
async function leaveAndSave() {
  confirmLeaveOpen.value = false;
  stopSyncTimer();
  dirty.value = true; // force sync even if timer just ran
  await syncToServer();
  clearLocal(); // draft is in the cloud now, no need to resume locally
  doNavigate();
}

/** Cancel DB draft and clear localStorage */
async function leaveAndDiscard() {
  confirmLeaveOpen.value = false;
  stopSyncTimer();
  await discardDraftFully(); // cancels DB + clears localStorage
  clearLocal(); // explicit: ensure localStorage is gone even if API failed
  selectedSupplier.value = null;
  doNavigate();
}

function doNavigate() {
  if (pendingNavInternal.value) {
    pendingNavInternal.value = false;
    selectedSupplier.value = null;
  } else if (pendingNavBack.value) {
    history.go(-2);
  } else if (pendingNavUrl.value) {
    window.location.href = pendingNavUrl.value;
  }
}

async function submitOrder() {
  if (!selectedSupplier.value) return;
  submitting.value = true;
  try {
    if (draftId.value) {
      // Promote existing draft to pending
      await apiFetch(`/api/orders/${draftId.value}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: orderLines.value, status: "sent", notes: notes.value, ...(fromAiTemplate.value && { fromAiTemplate: true }) }),
      });
    } else {
      // No draft yet — create directly as sent
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier.value.id,
          supplierName: selectedSupplier.value.name,
          supplierEmail: selectedSupplier.value.email,
          lines: orderLines.value,
          status: "sent",
          notes: notes.value,
          ...(fromAiTemplate.value && { fromAiTemplate: true }),
        }),
      });
      const data = (await res.json()) as { id: string };
      draftId.value = data.id;
    }
    stopSyncTimer();
    clearLocal();
    draftId.value = null;
    dirty.value = false;
    lastOrderSupplier.value = selectedSupplier.value.name;
    reviewOpen.value = false;
    successOpen.value = true;
  } finally {
    submitting.value = false;
  }
}

function newOrder() {
  successOpen.value = false;
  selectedSupplier.value = null;
  supplierSearch.value = "";
  draftId.value = null;
  saveStatus.value = "idle";
  notes.value = "";
  fromAiTemplate.value = false;
  stopSyncTimer();
}
</script>
