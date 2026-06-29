<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">

      <!-- Header + tabs -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ t('history.title') }}</h1>
          <p class="text-sm text-muted-foreground">{{ t('history.subtitle') }}</p>
        </div>
        <div class="flex gap-1 rounded-lg border p-1">
          <button
            v-for="tb in TABS"
            :key="tb.value"
            class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
            :class="tab === tb.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="tab = tb.value"
          >{{ tb.label }}</button>
        </div>
      </div>

      <!-- ═══════════════════════ TAB: STATISTICS ═══════════════════════════ -->
      <template v-if="tab === 'stats'">

        <!-- Range selector -->
        <div class="flex gap-1 self-start rounded-lg border p-1">
          <button
            v-for="r in RANGES"
            :key="r.value"
            class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
            :class="range === r.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="range = r.value"
          >{{ r.label }}</button>
        </div>

        <!-- KPI cards -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div v-for="stat in kpiCards" :key="stat.label" class="rounded-lg border bg-card p-4">
            <div class="mb-2 flex items-center gap-1.5 text-muted-foreground">
              <component :is="stat.icon" class="size-3.5" />
              <span class="text-xs font-medium">{{ stat.label }}</span>
            </div>
            <p class="truncate text-2xl font-bold tabular-nums" :title="String(stat.value)">
              {{ loading ? '—' : stat.value }}
            </p>
          </div>
        </div>

        <!-- Timeline chart -->
        <div class="rounded-lg border bg-card p-5">
          <p class="text-sm font-semibold">{{ t('history.timeline.title') }}</p>
          <p class="mb-5 text-xs text-muted-foreground">{{ timelineTitle }}</p>
          <div v-if="loading" class="flex h-32 items-end gap-0.5">
            <div v-for="i in 30" :key="i" class="flex-1 animate-pulse rounded-sm bg-muted" :style="{ height: `${10 + (i * 3) % 80}px` }" />
          </div>
          <div v-else-if="timelineBars.length === 0" class="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {{ t('history.timeline.noData') }}
          </div>
          <div v-else class="flex items-end gap-0.5" style="height: 128px;">
            <div v-for="bar in timelineBars" :key="bar.key" class="group flex flex-1 flex-col items-center gap-0.5">
              <span class="text-[8px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 leading-none">
                {{ bar.count || '' }}
              </span>
              <div
                class="w-full rounded-sm transition-all duration-200"
                :class="bar.isCurrent ? 'bg-primary' : 'bg-primary/40 hover:bg-primary/70'"
                :style="{
                  height: bar.count ? `${Math.max(4, (bar.count / maxTimeline) * 104)}px` : '2px',
                  opacity: bar.count ? undefined : '0.12',
                }"
                :title="bar.count !== 1 ? t('history.timeline.tooltipPlural', { label: bar.label, count: bar.count }) : t('history.timeline.tooltip', { label: bar.label, count: bar.count })"
              />
              <span class="text-[8px] leading-none text-muted-foreground whitespace-nowrap" :class="{ 'font-semibold text-foreground': bar.isCurrent }">
                {{ bar.shortLabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- Top suppliers + Day of week -->
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="rounded-lg border bg-card p-5">
            <p class="mb-4 text-sm font-semibold">{{ t('history.topSuppliers') }}</p>
            <div v-if="!loading && topSuppliers.length === 0" class="py-8 text-center text-sm text-muted-foreground">{{ t('history.noData') }}</div>
            <div v-else class="flex flex-col gap-3.5">
              <div v-for="(s, i) in topSuppliers" :key="s.name">
                <div class="mb-1 flex items-center justify-between">
                  <span class="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span class="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{{ i + 1 }}</span>
                    <span class="truncate">{{ s.name }}</span>
                  </span>
                  <span class="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">{{ s.count }}×</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${(s.count / topSuppliers[0].count) * 100}%` }" />
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border bg-card p-5">
            <p class="mb-4 text-sm font-semibold">{{ t('history.dow.title') }}</p>
            <div class="flex flex-col gap-3">
              <div v-for="day in dowStats" :key="day.name" class="flex items-center gap-3">
                <span class="w-7 shrink-0 text-xs text-muted-foreground">{{ day.short }}</span>
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary/70 transition-all duration-500" :style="{ width: `${(day.count / Math.max(1, maxDow)) * 100}%` }" />
                </div>
                <span class="w-5 text-right text-xs tabular-nums text-muted-foreground">{{ day.count }}</span>
              </div>
            </div>
            <div v-if="!loading && busiestDay" class="mt-4 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {{ t('history.dow.mostActive') }} <span class="font-medium text-foreground">{{ busiestDay }}</span>
            </div>
          </div>
        </div>

        <!-- Top products -->
        <div class="rounded-lg border bg-card p-5">
          <p class="text-sm font-semibold">{{ t('history.topProducts.title') }}</p>
          <p class="mb-5 text-xs text-muted-foreground">{{ t('history.topProducts.subtitle') }}</p>
          <div v-if="!loading && topProducts.length === 0" class="py-8 text-center text-sm text-muted-foreground">{{ t('history.noData') }}</div>
          <div v-else class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div v-for="(p, i) in topProducts" :key="p.name" class="flex items-center gap-3">
              <span class="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{{ i + 1 }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <span class="truncate text-sm font-medium">{{ p.name }}</span>
                  <span class="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">{{ p.qty }}</span>
                </div>
                <div class="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary/60 transition-all duration-500" :style="{ width: `${(p.qty / topProducts[0].qty) * 100}%` }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Order log -->
        <div class="overflow-hidden rounded-lg border bg-card">
          <div class="border-b px-5 py-4">
            <p class="text-sm font-semibold">{{ t('history.orderLog.title') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('history.orderLog.subtitle') }}</p>
          </div>
          <div v-if="!loading && filteredSent.length === 0" class="py-10 text-center text-sm text-muted-foreground">{{ t('history.orderLog.empty') }}</div>
          <table v-else class="w-full text-sm">
            <thead class="border-b bg-muted/40">
              <tr>
                <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{{ t('history.orderLog.col.supplier') }}</th>
                <th class="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">{{ t('history.orderLog.col.by') }}</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.orderLog.col.items') }}</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.orderLog.col.date') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="o in filteredSent.slice(0, 50)" :key="o.id" class="transition-colors hover:bg-muted/20">
                <td class="px-4 py-2.5 font-medium">{{ o.supplierName }}</td>
                <td class="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{{ o.createdByName ?? '—' }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{{ totalItems(o) }}</td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">{{ formatDate(o.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!loading && filteredSent.length > 50" class="border-t px-5 py-3 text-center text-xs text-muted-foreground">
            {{ t('history.orderLog.showing', { total: String(filteredSent.length) }) }}
          </div>
        </div>

      </template>

      <!-- ════════════════════ TAB: PRODUCT LOOKUP ═════════════════════════ -->
      <template v-if="tab === 'lookup'">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">

          <!-- Left: filters -->
          <div class="flex flex-col gap-4 lg:col-span-1">

            <!-- Date range -->
            <div class="rounded-lg border bg-card p-4">
              <p class="mb-3 text-sm font-semibold">{{ t('history.lookup.dateRange') }}</p>
              <div class="flex flex-col gap-2">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-muted-foreground">{{ t('history.lookup.from') }}</label>
                  <input
                    v-model="lookupFrom"
                    type="date"
                    class="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-muted-foreground">{{ t('history.lookup.to') }}</label>
                  <input
                    v-model="lookupTo"
                    type="date"
                    class="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <!-- Quick presets -->
              <div class="mt-3 flex flex-wrap gap-1">
                <button
                  v-for="p in datePresets"
                  :key="p.label"
                  class="rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  @click="applyPreset(p)"
                >{{ p.label }}</button>
              </div>
            </div>

            <!-- Product selector -->
            <div class="rounded-lg border bg-card p-4">
              <div class="mb-3 flex items-center justify-between">
                <p class="text-sm font-semibold">{{ t('history.lookup.products') }}</p>
                <div class="flex gap-2">
                  <button class="text-xs text-muted-foreground hover:text-foreground" @click="selectAllProducts">{{ t('history.lookup.all') }}</button>
                  <span class="text-muted-foreground">·</span>
                  <button class="text-xs text-muted-foreground hover:text-foreground" @click="selectedProducts = new Set()">{{ t('history.lookup.none') }}</button>
                </div>
              </div>
              <input
                v-model="productSearch"
                type="text"
                :placeholder="t('history.lookup.searchProducts')"
                class="mb-2 w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                <label
                  v-for="p in filteredProductList"
                  :key="p"
                  class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    class="accent-primary"
                    :checked="selectedProducts.has(p)"
                    @change="toggleProduct(p)"
                  />
                  <span class="truncate">{{ p }}</span>
                </label>
                <p v-if="filteredProductList.length === 0" class="py-4 text-center text-xs text-muted-foreground">{{ t('history.lookup.noProducts') }}</p>
              </div>
              <p class="mt-2 text-xs text-muted-foreground">
                {{ t('history.lookup.selectedOf', { selected: String(selectedProducts.size), total: String(allProductNames.length) }) }}
              </p>
            </div>
          </div>

          <!-- Right: results -->
          <div class="flex flex-col gap-4 lg:col-span-2">

            <!-- Summary cards -->
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-lg border bg-card p-4">
                <p class="text-xs font-medium text-muted-foreground">{{ t('history.lookup.ordersMatched') }}</p>
                <p class="mt-1 text-2xl font-bold tabular-nums">{{ lookupResult.orderCount }}</p>
              </div>
              <div class="rounded-lg border bg-card p-4">
                <p class="text-xs font-medium text-muted-foreground">{{ t('history.lookup.totalQty') }}</p>
                <p class="mt-1 text-2xl font-bold tabular-nums">{{ lookupResult.totalQty }}</p>
              </div>
              <div class="rounded-lg border bg-card p-4">
                <p class="text-xs font-medium text-muted-foreground">{{ t('history.lookup.avgQty') }}</p>
                <p class="mt-1 text-2xl font-bold tabular-nums">{{ lookupResult.avgQty }}</p>
              </div>
            </div>

            <!-- Results table -->
            <div class="overflow-hidden rounded-lg border bg-card">
              <div class="border-b px-5 py-4">
                <p class="text-sm font-semibold">{{ t('history.lookup.results') }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ t('history.lookup.resultsRange', { from: lookupFrom ? formatDate(lookupFrom) : '—', to: lookupTo ? formatDate(lookupTo) : '—' }) }}
                </p>
              </div>
              <div v-if="selectedProducts.size === 0" class="py-12 text-center text-sm text-muted-foreground">
                {{ t('history.lookup.selectPrompt') }}
              </div>
              <div v-else-if="lookupRows.length === 0" class="py-12 text-center text-sm text-muted-foreground">
                {{ t('history.lookup.noOrders') }}
              </div>
              <table v-else class="w-full text-sm">
                <thead class="border-b bg-muted/40">
                  <tr>
                    <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.product') }}</th>
                    <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.orders') }}</th>
                    <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.totalQty') }}</th>
                    <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.avgQty') }}</th>
                    <th class="px-4 py-2.5 pr-5 text-right text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.share') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="row in lookupRows" :key="row.name" class="transition-colors hover:bg-muted/20">
                    <td class="px-4 py-2.5 font-medium">{{ row.name }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{{ row.orders }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums font-medium">{{ row.totalQty }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{{ row.avgQty }}</td>
                    <td class="px-4 py-2.5 pr-5">
                      <div class="flex items-center justify-end gap-2">
                        <div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div class="h-full rounded-full bg-primary/60" :style="{ width: `${row.share}%` }" />
                        </div>
                        <span class="w-8 text-right text-xs tabular-nums text-muted-foreground">{{ row.share }}%</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Per-order breakdown -->
            <div v-if="lookupRows.length > 0" class="overflow-hidden rounded-lg border bg-card">
              <div class="border-b px-5 py-4">
                <p class="text-sm font-semibold">{{ t('history.lookup.breakdown') }}</p>
                <p class="text-xs text-muted-foreground">{{ t('history.lookup.breakdownSub') }}</p>
              </div>
              <table class="w-full text-sm">
                <thead class="border-b bg-muted/40">
                  <tr>
                    <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.date') }}</th>
                    <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.supplier') }}</th>
                    <th class="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">{{ t('history.lookup.col.by') }}</th>
                    <th class="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{{ t('history.lookup.col.qty') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="o in lookupOrders.slice(0, 50)" :key="o.id" class="transition-colors hover:bg-muted/20">
                    <td class="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{{ formatDate(o.createdAt) }}</td>
                    <td class="px-4 py-2.5 font-medium">{{ o.supplierName }}</td>
                    <td class="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{{ o.createdByName ?? '—' }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums">{{ o.matchedQty }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="lookupOrders.length > 50" class="border-t px-5 py-3 text-center text-xs text-muted-foreground">
                {{ t('history.lookup.showing', { total: String(lookupOrders.length) }) }}
              </div>
            </div>
          </div>
        </div>
      </template>

    </div>
  </TopLoader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Send, Package, BarChart3, TrendingUp } from 'lucide-vue-next';
import TopLoader from '@/components/ui/top-loader/TopLoader.vue';
import { apiFetch } from '@/lib/apiFetch';
import { useAuth } from '@/lib/useAuth';
import { useLocale } from '@/lib/useLocale';

const { loading: authLoading } = useAuth();
const { locale, t } = useLocale();

interface OrderLine { productId: string; internalName: string; supplierName?: string; quantity: number }
interface Order {
  id: string
  supplierId: string
  supplierName: string
  status: string
  lines: OrderLine[]
  createdBy: string
  createdByName?: string
  createdAt: string
}

const loading = ref(true);
const orders = ref<Order[]>([]);

const TABS = computed(() => [
  { label: t('history.tab.stats'),  value: 'stats'  },
  { label: t('history.tab.lookup'), value: 'lookup' },
]);
type TabValue = 'stats' | 'lookup';
const tab = ref<TabValue>('stats');

const RANGES = computed(() => [
  { label: t('history.range.30d'), value: '30d' },
  { label: t('history.range.90d'), value: '90d' },
  { label: t('history.range.6m'),  value: '6m'  },
  { label: t('history.range.all'), value: 'all' },
]);
type RangeValue = '30d' | '90d' | '6m' | 'all';
const range = ref<RangeValue>('30d');

async function fetchAllOrders() {
  loading.value = true;
  const collected: Order[] = [];
  let cursor: string | null = null;
  try {
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams();
      if (cursor) params.set('after', cursor);
      const res = await apiFetch(`/api/orders?${params}`);
      const data = await res.json() as { items: Order[]; hasMore: boolean; nextCursor: string | null };
      collected.push(...data.items);
      if (!data.hasMore || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
    orders.value = collected;
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

watch(authLoading, (v) => { if (!v) fetchAllOrders(); }, { immediate: true });

const now = new Date();
const todayStr = now.toISOString().slice(0, 10);

// ── Statistics tab ────────────────────────────────────────────────────────────
const cutoff = computed((): Date => {
  const d = new Date(now);
  if (range.value === '30d') { d.setDate(d.getDate() - 30); return d; }
  if (range.value === '90d') { d.setDate(d.getDate() - 90); return d; }
  if (range.value === '6m')  { d.setMonth(d.getMonth() - 6); return d; }
  return new Date(0);
});

const filteredSent = computed(() =>
  orders.value.filter(o => o.status === 'sent' && new Date(o.createdAt) >= cutoff.value)
);

function totalItems(o: Order) {
  return o.lines.reduce((s, l) => s + l.quantity, 0);
}

const totalItemsCount = computed(() => filteredSent.value.reduce((s, o) => s + totalItems(o), 0));
const avgItems = computed(() =>
  filteredSent.value.length ? (totalItemsCount.value / filteredSent.value.length).toFixed(1) : '—'
);
const topSupplierName = computed(() => {
  const map = new Map<string, number>();
  for (const o of filteredSent.value) map.set(o.supplierName, (map.get(o.supplierName) ?? 0) + 1);
  let max = 0, name = '—';
  for (const [n, c] of map) if (c > max) { max = c; name = n; }
  return name;
});

const kpiCards = computed(() => [
  { label: t('history.kpi.ordersSent'),   value: filteredSent.value.length, icon: Send       },
  { label: t('history.kpi.itemsOrdered'), value: totalItemsCount.value,     icon: Package    },
  { label: t('history.kpi.avgItems'),     value: avgItems.value,            icon: BarChart3  },
  { label: t('history.kpi.topSupplier'),  value: topSupplierName.value,     icon: TrendingUp },
]);

const topSuppliers = computed(() => {
  const map = new Map<string, number>();
  for (const o of filteredSent.value) map.set(o.supplierName, (map.get(o.supplierName) ?? 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
});

// Day-of-week names via Intl so they follow the locale automatically
const DOW = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    // Monday=0 … Sunday=6; pick a reference Monday (2024-01-01 was a Monday)
    const d = new Date(2024, 0, 1 + i);
    return {
      name:  d.toLocaleDateString(locale.value, { weekday: 'long'  }),
      short: d.toLocaleDateString(locale.value, { weekday: 'short' }),
    };
  });
});

const dowStats = computed(() => {
  const counts = new Array(7).fill(0);
  for (const o of filteredSent.value) {
    const d = new Date(o.createdAt).getDay();
    counts[d === 0 ? 6 : d - 1]++;
  }
  return DOW.value.map((d, i) => ({ ...d, count: counts[i] }));
});
const maxDow = computed(() => Math.max(1, ...dowStats.value.map(d => d.count)));
const busiestDay = computed(() => {
  const m = dowStats.value.reduce((a, b) => b.count > a.count ? b : a, dowStats.value[0]);
  return m?.count > 0 ? m.name : null;
});

const topProducts = computed(() => {
  const map = new Map<string, number>();
  for (const o of filteredSent.value)
    for (const l of o.lines) {
      if (!l.quantity) continue;
      const name = l.internalName || l.supplierName || 'Unknown';
      map.set(name, (map.get(name) ?? 0) + l.quantity);
    }
  return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 16);
});

interface Bar { key: string; label: string; shortLabel: string; count: number; isCurrent: boolean }

const timelineTitle = computed(() => ({
  '30d': t('history.timeline.daily'),
  '90d': t('history.timeline.weekly'),
  '6m':  t('history.timeline.monthly6'),
  'all': t('history.timeline.monthlyAll'),
}[range.value]));

const timelineBars = computed((): Bar[] => {
  if (range.value === '30d') return buildDailyBars(30);
  if (range.value === '90d') return buildWeeklyBars(13);
  if (range.value === '6m')  return buildMonthlyBars(6);
  return buildAllMonthlyBars();
});

function buildDailyBars(days: number): Bar[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const count = filteredSent.value.filter(o => o.createdAt.slice(0, 10) === dateStr).length;
    const showLabel = i === 0 || (i + 1) % 5 === 0 || i === days - 1;
    return { key: dateStr, label: d.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' }),
      shortLabel: showLabel ? d.toLocaleDateString(locale.value, { day: 'numeric' }) : '', count, isCurrent: dateStr === todayStr };
  });
}
function buildWeeklyBars(weeks: number): Bar[] {
  const s = new Date(now); const dow = s.getDay(); s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1)); s.setHours(0,0,0,0);
  return Array.from({ length: weeks }, (_, i) => {
    const ws = new Date(s); ws.setDate(s.getDate() - (weeks - 1 - i) * 7);
    const we = new Date(ws); we.setDate(ws.getDate() + 7);
    const count = filteredSent.value.filter(o => { const d = new Date(o.createdAt); return d >= ws && d < we; }).length;
    const isLast = i === weeks - 1;
    const label = ws.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' });
    return { key: ws.toISOString().slice(0, 10), label: `Week of ${label}`,
      shortLabel: (i === 0 || (i+1) % 4 === 0 || isLast) ? label : '', count, isCurrent: isLast };
  });
}
function buildMonthlyBars(months: number): Bar[] {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const count = filteredSent.value.filter(o => { const od = new Date(o.createdAt); return od >= d && od < next; }).length;
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }),
      shortLabel: d.toLocaleDateString(locale.value, { month: 'short' }), count,
      isCurrent: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() };
  });
}
function buildAllMonthlyBars(): Bar[] {
  if (filteredSent.value.length === 0) return [];
  const earliest = filteredSent.value.reduce((m, o) => o.createdAt < m ? o.createdAt : m, filteredSent.value[0].createdAt);
  const ed = new Date(earliest);
  let cur = new Date(ed.getFullYear(), ed.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const bars: Bar[] = [];
  while (cur < end) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const count = filteredSent.value.filter(o => { const od = new Date(o.createdAt); return od >= cur && od < next; }).length;
    bars.push({ key: cur.toISOString().slice(0, 10), label: cur.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }),
      shortLabel: cur.toLocaleDateString(locale.value, { month: 'short', year: '2-digit' }), count,
      isCurrent: cur.getMonth() === now.getMonth() && cur.getFullYear() === now.getFullYear() });
    cur = next;
  }
  return bars;
}
const maxTimeline = computed(() => Math.max(1, ...timelineBars.value.map(b => b.count)));

// ── Product lookup tab ────────────────────────────────────────────────────────
const lookupFrom = ref(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10));
const lookupTo   = ref(todayStr);
const productSearch = ref('');
const selectedProducts = ref<Set<string>>(new Set());

const datePresets = computed(() => [
  { label: t('history.lookup.preset7d'),   days: 7   },
  { label: t('history.lookup.preset30d'),  days: 30  },
  { label: t('history.lookup.preset90d'),  days: 90  },
  { label: t('history.lookup.presetYear'), days: -1  },
]);

function applyPreset(p: { label: string; days: number }) {
  lookupTo.value = todayStr;
  if (p.days === -1) {
    lookupFrom.value = `${now.getFullYear()}-01-01`;
  } else {
    const d = new Date(now); d.setDate(now.getDate() - p.days);
    lookupFrom.value = d.toISOString().slice(0, 10);
  }
}

const sentOrders = computed(() => orders.value.filter(o => o.status === 'sent'));

const allProductNames = computed(() => {
  const names = new Set<string>();
  for (const o of sentOrders.value)
    for (const l of o.lines)
      if (l.quantity) names.add(l.internalName || l.supplierName || 'Unknown');
  return [...names].sort((a, b) => a.localeCompare(b));
});

const filteredProductList = computed(() =>
  allProductNames.value.filter(n => n.toLowerCase().includes(productSearch.value.toLowerCase()))
);

function toggleProduct(name: string) {
  const s = new Set(selectedProducts.value);
  s.has(name) ? s.delete(name) : s.add(name);
  selectedProducts.value = s;
}
function selectAllProducts() {
  selectedProducts.value = new Set(filteredProductList.value);
}

const lookupOrdersInRange = computed(() => {
  const from = lookupFrom.value ? new Date(lookupFrom.value) : new Date(0);
  const to   = lookupTo.value   ? new Date(lookupTo.value + 'T23:59:59') : new Date();
  return sentOrders.value.filter(o => {
    const d = new Date(o.createdAt);
    return d >= from && d <= to;
  });
});

const lookupOrders = computed(() => {
  if (selectedProducts.value.size === 0) return [];
  return lookupOrdersInRange.value
    .map(o => {
      const matchedQty = o.lines
        .filter(l => selectedProducts.value.has(l.internalName || l.supplierName || 'Unknown'))
        .reduce((s, l) => s + l.quantity, 0);
      return matchedQty > 0 ? { ...o, matchedQty } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.createdAt.localeCompare(a!.createdAt)) as (Order & { matchedQty: number })[];
});

const lookupRows = computed(() => {
  if (selectedProducts.value.size === 0) return [];
  const map = new Map<string, { orders: number; totalQty: number }>();
  for (const o of lookupOrders.value) {
    for (const l of o.lines) {
      const name = l.internalName || l.supplierName || 'Unknown';
      if (!selectedProducts.value.has(name) || !l.quantity) continue;
      const entry = map.get(name) ?? { orders: 0, totalQty: 0 };
      entry.orders++;
      entry.totalQty += l.quantity;
      map.set(name, entry);
    }
  }
  const maxQty = Math.max(1, ...[...map.values()].map(v => v.totalQty));
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      orders: v.orders,
      totalQty: v.totalQty,
      avgQty: (v.totalQty / v.orders).toFixed(1),
      share: Math.round((v.totalQty / maxQty) * 100),
    }))
    .sort((a, b) => b.totalQty - a.totalQty);
});

const lookupResult = computed(() => {
  const orderCount = lookupOrders.value.length;
  const totalQty = lookupOrders.value.reduce((s, o) => s + o.matchedQty, 0);
  return {
    orderCount,
    totalQty,
    avgQty: orderCount ? (totalQty / orderCount).toFixed(1) : '—',
  };
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>
