<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">

      <!-- ─── Header ──────────────────────────────────────────────────────────── -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-2xl font-bold tracking-tight">{{ greeting }}, {{ firstName }}!</p>
          <p class="text-sm text-muted-foreground capitalize">{{ todayLabel }}</p>
        </div>
        <Button as-child size="lg">
          <a href="/orders/new">
            <PlusCircle class="size-4" />
            {{ t('home.newOrder') }}
          </a>
        </Button>
      </div>

      <!-- ─── Stat cards ──────────────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="stat in statCards" :key="stat.label" class="rounded-lg border bg-card p-4">
          <div class="mb-2 flex items-center gap-1.5 text-muted-foreground">
            <component :is="stat.icon" class="size-3.5" />
            <span class="text-xs font-medium">{{ stat.label }}</span>
          </div>
          <p class="text-2xl font-bold tabular-nums">{{ loading ? "—" : stat.value }}</p>
        </div>
      </div>

      <!-- ─── Suggestions ─────────────────────────────────────────────────────── -->
      <div
        v-if="!loading && suggestions.length"
        class="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20"
      >
        <div class="mb-3 flex items-center gap-2">
          <Bell class="size-4 text-amber-600 dark:text-amber-400" />
          <p class="text-sm font-semibold text-amber-900 dark:text-amber-300">
            {{ t('home.suggestions.title', { day: todayDayName }) }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <div
            v-for="s in suggestions"
            :key="s.supplierId"
            class="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/40"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ s.supplierName }}</p>
              <p class="text-xs text-muted-foreground">
                {{ t('home.suggestions.history', { day: todayDayName, count: s.count }) }}
              </p>
            </div>
            <Button size="sm" as-child>
              <a href="/orders/new">{{ t('home.suggestions.orderNow') }}</a>
            </Button>
          </div>
        </div>
      </div>

      <!-- ─── Chart + Recent orders ───────────────────────────────────────────── -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">

        <!-- Bar chart -->
        <div class="rounded-lg border bg-card p-5 lg:col-span-3">
          <p class="text-sm font-semibold">{{ t('home.chart.title') }}</p>
          <p class="mb-5 text-xs text-muted-foreground">{{ t('home.chart.subtitle') }}</p>

          <div v-if="loading" class="flex h-32 items-end gap-1">
            <div
              v-for="i in 14"
              :key="i"
              class="flex-1 animate-pulse rounded-sm bg-muted"
              :style="{ height: `${20 + Math.random() * 60}px` }"
            />
          </div>

          <div v-else class="flex items-end gap-1 h-32">
            <div
              v-for="day in chartData"
              :key="day.date"
              class="group flex flex-1 flex-col items-center gap-1"
            >
              <span class="text-[10px] font-medium text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                {{ day.count || "" }}
              </span>
              <div
                class="w-full rounded-sm transition-all"
                :class="day.isToday ? 'bg-primary' : 'bg-primary/40 hover:bg-primary/60'"
                :style="{
                  height: day.count ? `${Math.max(6, (day.count / maxChart) * 96)}px` : '3px',
                  opacity: day.count ? undefined : '0.2',
                }"
                :title="`${day.fullLabel}: ${day.count} ${day.count !== 1 ? t('home.orderWordPlural') : t('home.orderWord')}`"
              />
              <span
                class="text-[10px] text-muted-foreground"
                :class="{ 'font-semibold text-foreground': day.isToday }"
              >
                {{ day.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recent orders -->
        <div class="rounded-lg border bg-card p-5 lg:col-span-2">
          <p class="mb-4 text-sm font-semibold">{{ t('home.recentOrders') }}</p>

          <div class="flex flex-col divide-y">
            <div v-if="loading" v-for="i in 5" :key="i" class="flex items-center justify-between gap-2 py-2.5">
              <div class="flex flex-col gap-1">
                <div class="h-3.5 w-28 animate-pulse rounded bg-muted" />
                <div class="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div class="h-5 w-12 animate-pulse rounded-full bg-muted" />
            </div>

            <div
              v-else-if="recentOrders.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('home.noOrders') }}
            </div>

            <div
              v-else
              v-for="o in recentOrders"
              :key="o.id"
              class="flex items-center justify-between gap-2 py-2.5"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ o.supplierName }}</p>
                <p class="text-xs text-muted-foreground">{{ formatDate(o.createdAt) }}</p>
              </div>
              <StatusBadge :status="o.status" />
            </div>
          </div>

          <div v-if="!loading && recentOrders.length" class="mt-3 border-t pt-3">
            <a href="/orders" class="text-xs text-muted-foreground transition-colors hover:text-foreground">
              {{ t('home.viewAll') }}
            </a>
          </div>
        </div>

      </div>
    </div>
  </TopLoader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { PlusCircle, ClipboardList, Send, CalendarCheck, FilePen, Bell } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/lib/useAuth";
import { useLocale } from "@/lib/useLocale";

const { currentUser, loading: authLoading } = useAuth();
const { t, locale } = useLocale();

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderLine { productId: string; internalName: string; quantity: number }
interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  status: "draft" | "pending" | "sent";
  lines: OrderLine[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

// ─── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const orders = ref<Order[]>([]);

// ─── Fetch up to 50 most recent orders ───────────────────────────────────────
async function fetchOrders() {
  loading.value = true;
  const collected: Order[] = [];
  let cursor: string | null = null;
  let pages = 0;
  try {
    while (pages < 5) {
      const params = new URLSearchParams();
      if (cursor) params.set("after", cursor);
      const res = await apiFetch(`/api/orders?${params}`);
      const data = (await res.json()) as { items: Order[]; hasMore: boolean; nextCursor: string | null };
      collected.push(...data.items);
      pages++;
      if (!data.hasMore || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
    orders.value = collected;
  } catch {
    /* ignore */
  } finally {
    loading.value = false;
  }
}

watch(authLoading, (v) => { if (!v) fetchOrders(); }, { immediate: true });

// ─── Greeting ─────────────────────────────────────────────────────────────────
const firstName = computed(() => {
  const name = currentUser.value?.displayName ?? currentUser.value?.email ?? "there";
  return name.split(/[\s@]+/)[0];
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return t('home.greeting.morning');
  if (h < 18) return t('home.greeting.afternoon');
  return t('home.greeting.evening');
});

const now = new Date();
const todayLabel = computed(() =>
  now.toLocaleDateString(locale.value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
);

// ─── Stats ────────────────────────────────────────────────────────────────────
const sevenDaysAgo = new Date(now);
sevenDaysAgo.setDate(now.getDate() - 7);
sevenDaysAgo.setHours(0, 0, 0, 0);

const todayStr2 = now.toISOString().slice(0, 10);

const stats = computed(() => ({
  total: orders.value.length,
  sentThisWeek: orders.value.filter((o) => o.status === "sent" && new Date(o.createdAt) >= sevenDaysAgo).length,
  sentToday: orders.value.filter((o) => o.status === "sent" && o.createdAt.slice(0, 10) === todayStr2).length,
  drafts: orders.value.filter((o) => o.status === "draft").length,
}));

const statCards = computed(() => [
  { label: t('home.stats.totalOrders'), value: stats.value.total, icon: ClipboardList },
  { label: t('home.stats.sent7days'), value: stats.value.sentThisWeek, icon: Send },
  { label: t('home.stats.sentToday'), value: stats.value.sentToday, icon: CalendarCheck },
  { label: t('home.stats.drafts'), value: stats.value.drafts, icon: FilePen },
]);

// ─── Today suggestions ────────────────────────────────────────────────────────
const todayDow = now.getDay();
const todayDayName = computed(() => t('home.dayNames').split(',')[todayDow]);

const orderedTodayIds = computed(() =>
  new Set(orders.value.filter((o) => o.createdAt.slice(0, 10) === todayStr).map((o) => o.supplierId)),
);

const suggestions = computed(() => {
  const map = new Map<string, { supplierId: string; supplierName: string; count: number }>();
  for (const o of orders.value) {
    if (new Date(o.createdAt).getDay() !== todayDow) continue;
    const entry = map.get(o.supplierId);
    if (entry) {
      entry.count++;
    } else {
      map.set(o.supplierId, { supplierId: o.supplierId, supplierName: o.supplierName, count: 1 });
    }
  }
  return [...map.values()]
    .filter((s) => !orderedTodayIds.value.has(s.supplierId))
    .sort((a, b) => b.count - a.count);
});

// ─── Recent orders ────────────────────────────────────────────────────────────
const recentOrders = computed(() => orders.value.slice(0, 7));

// ─── Chart: last 14 days ──────────────────────────────────────────────────────
const todayStr = now.toISOString().slice(0, 10);

const chartData = computed(() => {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (13 - i));
    const date = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(locale.value, { day: "numeric", month: "numeric" });
    const fullLabel = d.toLocaleDateString(locale.value, { day: "numeric", month: "long" });
    const count = orders.value.filter((o) => o.createdAt.slice(0, 10) === date).length;
    return { date, label, fullLabel, count, isToday: date === todayStr };
  });
});

const maxChart = computed(() => Math.max(1, ...chartData.value.map((d) => d.count)));

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = {
  props: ["status"],
  setup(props: { status: string }) {
    const cfg: Record<string, { label: string; cls: string }> = {
      draft: { label: t("home.status.draft"), cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
      sent: { label: t("home.status.sent"), cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    };
    const c = computed(() => cfg[props.status] ?? { label: props.status, cls: "bg-muted text-muted-foreground" });
    return { c };
  },
  template: `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap" :class="c.cls">{{ c.label }}</span>`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value, { day: "numeric", month: "short" });
}
</script>
