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

      <!-- ─── MOBILE: infinite scroll ──────────────────────────────────────────── -->
      <div class="md:hidden flex flex-col gap-3">
        <div v-if="!mobileLoading && mobileItems.length === 0" class="py-16 text-center text-sm text-muted-foreground">
          {{ activeFilter === "all" ? "No orders yet." : `No ${activeFilter} orders.` }}
        </div>
        <template v-else>
          <div
            v-for="order in mobileItems"
            :key="order.id"
            class="rounded-lg border bg-card p-4 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
            @click="viewOrder(order)"
          >
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
              <div class="flex gap-1" @click.stop>
                <Button v-if="order.status === 'draft'" variant="ghost" size="icon" title="Continue draft" @click="continueOrder(order)">
                  <Pencil class="size-4" />
                </Button>
                <Button v-if="order.status === 'sent'" variant="ghost" size="icon" title="Resend email" @click="confirmResend(order)">
                  <RotateCw class="size-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete" @click="confirmDelete(order)">
                  <Trash2 class="size-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>
          <!-- Sentinel -->
          <div ref="mobileSentinel" class="py-2 text-center text-sm text-muted-foreground">
            <Loader2 v-if="mobileLoadingMore" class="mx-auto size-4 animate-spin" />
            <span v-else-if="!mobileHasMore" class="opacity-40">All orders loaded</span>
          </div>
        </template>
      </div>

      <!-- ─── DESKTOP: paginated table ─────────────────────────────────────────── -->
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
                <tr
                  v-for="order in deskItems"
                  :key="order.id"
                  class="hover:bg-muted/30 transition-colors cursor-pointer"
                  @click="viewOrder(order)"
                >
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
                  <td class="px-4 py-3" @click.stop>
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
                      <Button
                        v-if="order.status === 'sent'"
                        variant="ghost"
                        size="icon"
                        title="Resend email"
                        @click="confirmResend(order)"
                      >
                        <RotateCw class="size-4 text-muted-foreground" />
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

  <!-- ─── Order detail dialog ──────────────────────────────────────────────────── -->
  <Dialog v-model:open="detailOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <div class="flex items-center justify-between gap-3 pr-6">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              {{ detailOrder?.supplierName }}
              <Sparkles v-if="detailOrder?.fromAiTemplate" class="size-3.5 text-purple-500" title="AI template" />
            </DialogTitle>
            <DialogDescription class="mt-0.5">
              {{ detailOrder?.supplierEmail || "—" }} · {{ detailOrder ? formatDate(detailOrder.createdAt) : "" }}
            </DialogDescription>
          </div>
          <StatusBadge v-if="detailOrder" :status="detailOrder.status" />
        </div>
      </DialogHeader>

      <div v-if="detailOrder" class="flex flex-col gap-4">
        <!-- Meta row -->
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span v-if="detailOrder.createdByName">Created by <strong class="text-foreground">{{ detailOrder.createdByName }}</strong></span>
          <span v-if="detailOrder.updatedAt">Updated {{ formatDate(detailOrder.updatedAt) }}</span>
        </div>

        <!-- Order lines table -->
        <div class="overflow-hidden rounded-md border">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th class="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="line in detailOrder.lines.filter(l => l.quantity > 0)" :key="line.productId">
                <td class="px-3 py-2">
                  <p class="font-medium">{{ line.internalName }}</p>
                  <p v-if="line.supplierName && line.supplierName !== line.internalName" class="text-xs text-muted-foreground">{{ line.supplierName }}</p>
                </td>
                <td class="px-3 py-2 text-right font-semibold tabular-nums">{{ line.quantity }}</td>
              </tr>
              <tr v-if="!detailOrder.lines.some(l => l.quantity > 0)">
                <td colspan="2" class="px-3 py-4 text-center text-xs text-muted-foreground">No items in this order.</td>
              </tr>
            </tbody>
            <tfoot class="border-t bg-muted/30">
              <tr>
                <td class="px-3 py-2 text-xs font-medium text-muted-foreground">Total</td>
                <td class="px-3 py-2 text-right text-sm font-bold tabular-nums">{{ totalItems(detailOrder) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Notes -->
        <div v-if="detailOrder.notes" class="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p class="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p class="whitespace-pre-line">{{ detailOrder.notes }}</p>
        </div>
      </div>

      <DialogFooter class="mt-2 flex-wrap gap-2">
        <Button variant="outline" @click="detailOpen = false">Close</Button>
        <Button
          v-if="detailOrder?.status === 'draft'"
          variant="outline"
          @click="continueOrder(detailOrder!); detailOpen = false"
        >
          <Pencil class="mr-2 size-4" /> Continue draft
        </Button>
        <Button
          v-if="detailOrder?.status === 'sent'"
          variant="outline"
          @click="confirmResend(detailOrder!); detailOpen = false"
        >
          <RotateCw class="mr-2 size-4" /> Resend email
        </Button>
        <Button
          variant="destructive"
          @click="confirmDelete(detailOrder!); detailOpen = false"
        >
          <Trash2 class="mr-2 size-4" /> Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Delete confirm ───────────────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="deleteOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" class="sm:max-w-md">
      <component :is="isDesktop ? DialogHeader : DrawerHeader">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Delete order?</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          This will permanently delete the order for
          <strong>{{ deleteTarget?.supplierName }}</strong>. This cannot be undone.
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

  <!-- ─── Resend confirm ───────────────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="resendOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" class="sm:max-w-md">
      <component :is="isDesktop ? DialogHeader : DrawerHeader">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Resend order email?</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          This will resend the order email to <strong>{{ resendTarget?.supplierName }}</strong>.
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['gap-2', !isDesktop && 'px-4 pb-4']">
        <Button variant="outline" @click="resendOpen = false">Cancel</Button>
        <Button :disabled="resending" @click="doResend">
          <Loader2 v-if="resending" class="mr-2 size-4 animate-spin" />
          <RotateCw v-else class="mr-2 size-4" />
          Resend
        </Button>
      </component>
    </component>
  </component>

  <!-- ─── Resend success ───────────────────────────────────────────────────────── -->
  <Dialog v-model:open="resendSuccessOpen">
    <DialogContent class="sm:max-w-sm text-center">
      <div class="flex flex-col items-center gap-3 py-4">
        <div class="flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle class="size-7 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <DialogTitle class="text-lg">Email resent!</DialogTitle>
          <DialogDescription class="mt-1">
            The order email to <strong>{{ resendSuccessSupplier }}</strong> has been resent successfully.
          </DialogDescription>
        </div>
      </div>
      <DialogFooter class="sm:justify-center">
        <Button variant="outline" @click="resendSuccessOpen = false">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Mailto fallback ──────────────────────────────────────────────────────── -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="mailtoOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" class="sm:max-w-md">
      <component :is="isDesktop ? DialogHeader : DrawerHeader">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Email could not be sent</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          The automatic email failed. You can send it manually using your email client.
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['gap-2', !isDesktop && 'px-4 pb-4']">
        <Button variant="outline" @click="mailtoOpen = false">Close</Button>
        <Button as="a" :href="mailtoUrl" target="_blank" @click="mailtoOpen = false">
          <MailOpen class="mr-2 size-4" />
          Open in email client
        </Button>
      </component>
    </component>
  </component>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { useMediaQuery } from "@vueuse/core";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RotateCw,
  MailOpen,
  CheckCircle,
} from "lucide-vue-next";
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
import { useLocale } from "@/lib/useLocale";

const { loading: authLoading } = useAuth();
const { locale } = useLocale();
const isDesktop = useMediaQuery("(min-width: 768px)");

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderLine {
  productId: string;
  internalName: string;
  supplierName?: string;
  quantity: number;
}
interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  status: string;
  lines: OrderLine[];
  notes?: string;
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
type Cursor = string | null;

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
const deskCursorStack = ref<Cursor[]>([null]);
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

watch(activeFilter, () => { initMobile(); initDesk(); });

watch(authLoading, (loading) => {
  if (!loading) { initMobile(); initDesk(); }
}, { immediate: true });

onMounted(() => {
  setTimeout(() => {
    if (!mobileSentinel.value) return;
    observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreMobile(); },
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
  return new Date(iso).toLocaleDateString(locale.value, { day: "numeric", month: "short", year: "numeric" });
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
      lines: order.lines,
      quantities: {},
    }),
  );
  sessionStorage.setItem("order_resume", "1");
  location.href = "/orders/new";
}

// ─── Order detail ─────────────────────────────────────────────────────────────
const detailOpen = ref(false);
const detailOrder = ref<Order | null>(null);

function viewOrder(order: Order) {
  detailOrder.value = order;
  detailOpen.value = true;
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

// ─── Resend ───────────────────────────────────────────────────────────────────
const resendOpen = ref(false);
const resendTarget = ref<Order | null>(null);
const resending = ref(false);
const resendSuccessOpen = ref(false);
const resendSuccessSupplier = ref("");
const mailtoOpen = ref(false);
const mailtoUrl = ref("");

function confirmResend(order: Order) {
  resendTarget.value = order;
  resendOpen.value = true;
}

async function doResend() {
  if (!resendTarget.value) return;
  resending.value = true;
  try {
    const res = await apiFetch(`/api/orders/${resendTarget.value.id}/resend`, { method: "POST" });
    const data = await res.json() as { ok: boolean; mailto?: { to: string; subject: string; body: string } };
    resendOpen.value = false;
    if (data.ok) {
      resendSuccessSupplier.value = resendTarget.value.supplierName;
      resendSuccessOpen.value = true;
    } else if (data.mailto) {
      const m = data.mailto;
      mailtoUrl.value = `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
      mailtoOpen.value = true;
    }
  } catch {
    // Network error — build mailto fallback from local order data
    resendOpen.value = false;
    const order = resendTarget.value;
    const lines = order.lines.filter((l) => l.quantity > 0);
    const body = lines.map((l) => `${l.internalName}: ${l.quantity}`).join("\n");
    mailtoUrl.value = `mailto:${encodeURIComponent(order.supplierEmail)}?subject=${encodeURIComponent("Order")}&body=${encodeURIComponent(body)}`;
    mailtoOpen.value = true;
  } finally {
    resending.value = false;
  }
}
</script>
