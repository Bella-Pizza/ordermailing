<template>
  <TopLoader :loading="mobileLoading || deskLoading">
    <div class="flex flex-col gap-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Orders</h1>
          <p class="text-sm text-muted-foreground">All orders, including drafts and sent orders.</p>
        </div>
        <Button as-child>
          <a href="/orders/new">
            <PlusCircle class="mr-2 size-4" />
            New order
          </a>
        </Button>
      </div>

      <!-- Status filter -->
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="f in filters"
          :key="f.value"
          :variant="activeFilter === f.value ? 'default' : 'outline'"
          size="sm"
          @click="activeFilter = f.value"
        >
          {{ f.label }}
        </Button>
      </div>

      <!-- ─── MOBILE: infinite scroll ─────────────────────────────────────────────── -->
      <div class="md:hidden flex flex-col gap-3">
        <div v-if="!mobileLoading && mobileItems.length === 0" class="py-16 text-center text-sm text-muted-foreground">
          {{ activeFilter === "all" ? "No orders yet." : `No ${activeFilter} orders.` }}
        </div>
        <template v-else>
          <div v-for="order in mobileItems" :key="order.id" class="rounded-lg border bg-card p-4 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="truncate font-medium">{{ order.supplierName }}</p>
                  <Sparkles v-if="order.fromAiTemplate" class="size-3.5 shrink-0 text-purple-500" title="Started from AI template" />
                </div>
                <p class="truncate text-xs text-muted-foreground">{{ formatDate(order.createdAt) }}</p>
              </div>
              <StatusBadge :status="order.status" />
            </div>
            <div class="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>{{ totalItems(order) }} item{{ totalItems(order) !== 1 ? "s" : "" }}</span>
              <div class="flex gap-1">
                <Button v-if="order.status === 'draft'" variant="ghost" size="icon" @click="continueOrder(order)">
                  <Pencil class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" @click="confirmDelete(order)">
                  <Trash2 class="size-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>
          <!-- Sentinel: IntersectionObserver triggers loadMoreMobile() -->
          <div ref="mobileSentinel" class="py-2 text-center text-sm text-muted-foreground">
            <Loader2 v-if="mobileLoadingMore" class="mx-auto size-4 animate-spin" />
            <span v-else-if="!mobileHasMore" class="opacity-40">All orders loaded</span>
          </div>
        </template>
      </div>

      <!-- ─── DESKTOP: paginated table ──────────────────────────────────────────── -->
      <div class="hidden md:flex md:flex-col md:gap-4">
        <div v-if="!deskLoading && deskItems.length === 0" class="py-16 text-center text-sm text-muted-foreground">
          {{ activeFilter === "all" ? "No orders yet." : `No ${activeFilter} orders.` }}
        </div>
        <template v-else>
          <div class="rounded-lg border overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Supplier</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Items</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Created by</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th class="px-4 py-3" />
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="order in deskItems" :key="order.id" class="hover:bg-muted/30 transition-colors">
                  <td class="px-4 py-3 font-medium">
                    <div class="flex items-center gap-1.5">
                      {{ order.supplierName }}
                      <Sparkles v-if="order.fromAiTemplate" class="size-3.5 shrink-0 text-purple-500" title="Started from AI template" />
                    </div>
                  </td>
                  <td class="px-4 py-3"><StatusBadge :status="order.status" /></td>
                  <td class="px-4 py-3 text-muted-foreground">{{ totalItems(order) }}</td>
                  <td class="px-4 py-3 text-muted-foreground">{{ order.createdByName ?? "—" }}</td>
                  <td class="px-4 py-3 text-muted-foreground">{{ formatDate(order.createdAt) }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1">
                      <Button
                        v-if="order.status === 'draft'"
                        variant="ghost"
                        size="icon"
                        title="Continue draft"
                        @click="continueOrder(order)"
                      >
                        <Pencil class="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" @click="confirmDelete(order)">
                        <Trash2 class="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Pagination controls -->
          <div class="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {{ deskPage + 1 }}</span>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" :disabled="deskPage === 0" @click="goToPage(deskPage - 1)">
                <ChevronLeft class="size-4 mr-1" /> Previous
              </Button>
              <Button variant="outline" size="sm" :disabled="!deskHasMore" @click="goToPage(deskPage + 1)">
                Next <ChevronRight class="size-4 ml-1" />
              </Button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </TopLoader>

  <!-- Delete confirm — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="deleteOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" class="sm:max-w-md">
      <component :is="isDesktop ? DialogHeader : DrawerHeader">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Delete order?</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          This will permanently delete the order for
          <strong>{{ deleteTarget?.supplierName }}</strong
          >. This cannot be undone.
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['gap-2', !isDesktop && 'px-4 pb-4']">
        <Button variant="outline" @click="deleteOpen = false">Cancel</Button>
        <Button variant="destructive" :disabled="deleting" @click="doDelete">
          <Loader2 v-if="deleting" class="mr-2 size-4 animate-spin" />
          Delete
        </Button>
      </component>
    </component>
  </component>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { PlusCircle, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Sparkles } from "lucide-vue-next";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import { Button } from "@/components/ui/button";
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

const { loading: authLoading } = useAuth();
const isDesktop = useMediaQuery("(min-width: 768px)");

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderLine {
  productId: string;
  internalName: string;
  quantity: number;
}
interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  status: string;
  lines: OrderLine[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
  fromAiTemplate?: boolean;
}
interface PageResult {
  items: Order[];
  hasMore: boolean;
  nextCursor: string | null;
}
type Cursor = string | null; // createdAt value of last item

// ─── Status badge (inline component) ─────────────────────────────────────────
const StatusBadge = {
  props: ["status"],
  setup(props: { status: string }) {
    const cfg: Record<string, { label: string; cls: string }> = {
      draft: { label: "Draft", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
      sent: { label: "Sent", cls: "bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400" },
    };
    const c = computed(() => cfg[props.status] ?? { label: props.status, cls: "bg-muted text-muted-foreground" });
    return { c };
  },
  template: `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="c.cls">{{ c.label }}</span>`,
};

// ─── Filter ───────────────────────────────────────────────────────────────────
const filters = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Sent", value: "sent" },
];
const activeFilter = ref("all");

// ─── Shared fetch helper ──────────────────────────────────────────────────────
async function fetchPage(cursor: Cursor): Promise<{ items: Order[]; hasMore: boolean; nextCursor: Cursor }> {
  const params = new URLSearchParams();
  if (activeFilter.value !== "all") params.set("status", activeFilter.value);
  if (cursor) params.set("after", cursor);
  const res = await apiFetch(`/api/orders?${params}`);
  const data = (await res.json()) as PageResult;
  return { items: data.items, hasMore: data.hasMore, nextCursor: data.nextCursor };
}

// ─── Mobile: infinite scroll ──────────────────────────────────────────────────
const mobileItems = ref<Order[]>([]);
const mobileCursor = ref<Cursor>(null);
const mobileHasMore = ref(false);
const mobileLoading = ref(false);
const mobileLoadingMore = ref(false);
const mobileSentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

async function initMobile() {
  mobileLoading.value = true;
  mobileItems.value = [];
  mobileCursor.value = null;
  mobileHasMore.value = false;
  try {
    const { items, hasMore, nextCursor } = await fetchPage(null);
    mobileItems.value = items;
    mobileHasMore.value = hasMore;
    mobileCursor.value = nextCursor;
  } catch {
    /* ignore */
  } finally {
    mobileLoading.value = false;
  }
}

async function loadMoreMobile() {
  if (!mobileHasMore.value || mobileLoadingMore.value) return;
  mobileLoadingMore.value = true;
  try {
    const { items, hasMore, nextCursor } = await fetchPage(mobileCursor.value);
    mobileItems.value.push(...items);
    mobileHasMore.value = hasMore;
    mobileCursor.value = nextCursor;
  } catch {
    /* ignore */
  } finally {
    mobileLoadingMore.value = false;
  }
}

// ─── Desktop: page-based ──────────────────────────────────────────────────────
const deskItems = ref<Order[]>([]);
const deskCursorStack = ref<Cursor[]>([null]); // index = page number
const deskPage = ref(0);
const deskHasMore = ref(false);
const deskLoading = ref(false);

async function initDesk() {
  deskLoading.value = true;
  deskPage.value = 0;
  deskCursorStack.value = [null];
  deskItems.value = [];
  deskHasMore.value = false;
  try {
    const { items, hasMore, nextCursor } = await fetchPage(null);
    deskItems.value = items;
    deskHasMore.value = hasMore;
    if (nextCursor) deskCursorStack.value = [null, nextCursor];
  } catch {
    /* ignore */
  } finally {
    deskLoading.value = false;
  }
}

async function goToPage(page: number) {
  if (page < 0 || deskLoading.value) return;
  deskLoading.value = true;
  try {
    const { items, hasMore, nextCursor } = await fetchPage(deskCursorStack.value[page] ?? null);
    deskItems.value = items;
    deskPage.value = page;
    deskHasMore.value = hasMore;
    if (nextCursor && !deskCursorStack.value[page + 1]) deskCursorStack.value[page + 1] = nextCursor;
  } catch {
    /* ignore */
  } finally {
    deskLoading.value = false;
  }
}

// ─── Reset on filter change ───────────────────────────────────────────────────
watch(activeFilter, () => {
  initMobile();
  initDesk();
});

// Wait for auth before first fetch
watch(
  authLoading,
  (loading) => {
    if (!loading) {
      initMobile();
      initDesk();
    }
  },
  { immediate: true },
);

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  setTimeout(() => {
    if (!mobileSentinel.value) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreMobile();
      },
      { rootMargin: "200px" },
    );
    observer.observe(mobileSentinel.value);
  }, 100);
});
onUnmounted(() => observer?.disconnect());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function totalItems(order: Order) {
  return order.lines.reduce((s, l) => s + l.quantity, 0);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Continue draft ───────────────────────────────────────────────────────────
function continueOrder(order: Order) {
  localStorage.setItem(
    "order_draft",
    JSON.stringify({
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      supplierEmail: order.supplierEmail,
      draftId: order.id,
      lines: order.lines, // used by +Page.vue to restore quantities
      quantities: {}, // fallback for older restore logic
    }),
  );
  sessionStorage.setItem("order_resume", "1");
  location.href = "/orders/new";
}

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteOpen = ref(false);
const deleteTarget = ref<Order | null>(null);
const deleting = ref(false);

function confirmDelete(order: Order) {
  deleteTarget.value = order;
  deleteOpen.value = true;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await apiFetch(`/api/orders/${deleteTarget.value.id}`, { method: "DELETE" });
    const id = deleteTarget.value.id;
    mobileItems.value = mobileItems.value.filter((o) => o.id !== id);
    deskItems.value = deskItems.value.filter((o) => o.id !== id);
    deleteOpen.value = false;
  } catch {
    /* ignore */
  } finally {
    deleting.value = false;
  }
}
</script>
