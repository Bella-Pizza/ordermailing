<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">
      <!-- Header -->
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold tracking-tight">Sollicitaties</h1>
        <p class="text-sm text-muted-foreground">Overzicht van alle ingediende sollicitaties.</p>
      </div>

      <!-- Search + filter -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-52">
          <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            v-model="searchQuery"
            placeholder="Zoek op naam, email of gsm..."
            class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <select
          v-model="statusFilter"
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Alle statussen</option>
          <option value="nieuw">Nieuw</option>
          <option value="in behandeling">In behandeling</option>
          <option value="aangenomen">Aangenomen</option>
          <option value="afgewezen">Afgewezen</option>
        </select>
      </div>

      <!-- Empty state -->
      <div v-if="!loading && filtered.length === 0" class="py-16 text-center text-sm text-muted-foreground">
        Geen sollicitaties gevonden.
      </div>

      <!-- Mobile cards -->
      <div v-else class="grid gap-3 sm:hidden">
        <Card v-for="s in filtered" :key="s.id" class="p-4 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" @click="openDetail(s)">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium">{{ s.voornaam }} {{ s.naam }}</div>
              <div class="text-xs text-muted-foreground">{{ formatDate(s.createdAt) }}</div>
            </div>
            <StatusBadge :status="s.status" />
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div class="flex items-center gap-1.5"><Phone class="size-3.5 shrink-0" /> {{ s.gsm }}</div>
            <div class="flex items-center gap-1.5 truncate"><Mail class="size-3.5 shrink-0" /> <span class="truncate">{{ s.email || "—" }}</span></div>
          </div>
        </Card>
      </div>

      <!-- Desktop table -->
      <div class="hidden overflow-hidden rounded-lg border bg-card shadow-sm sm:block">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Talen</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Ingediend</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th class="px-4 py-3" />
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr
              v-for="s in filtered"
              :key="s.id"
              class="hover:bg-muted/30 transition-colors cursor-pointer"
              @click="openDetail(s)"
            >
              <td class="px-4 py-3 font-medium">
                <div>{{ s.voornaam }} {{ s.naam }}</div>
                <div class="text-xs text-muted-foreground">{{ s.geboorteplaats }}</div>
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                <div class="flex flex-col gap-0.5">
                  <span>{{ s.gsm }}</span>
                  <span class="truncate max-w-36">{{ s.email || "—" }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                <div class="flex flex-col gap-0.5 text-xs">
                  <span>NL: {{ s.kennisNederlands }}</span>
                  <span>FR: {{ s.kennisFrans }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDate(s.createdAt) }}</td>
              <td class="px-4 py-3" @click.stop>
                <select
                  :value="s.status"
                  @change="updateStatus(s, ($event.target as HTMLSelectElement).value)"
                  class="h-8 rounded-md border border-input bg-background px-2 py-0 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="statusClass(s.status)"
                >
                  <option value="nieuw">Nieuw</option>
                  <option value="in behandeling">In behandeling</option>
                  <option value="aangenomen">Aangenomen</option>
                  <option value="afgewezen">Afgewezen</option>
                </select>
              </td>
              <td class="px-4 py-3 text-right" @click.stop>
                <Button variant="ghost" size="icon" @click="confirmDelete(s)">
                  <Trash2 class="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </TopLoader>

  <!-- Detail dialog -->
  <Dialog v-model:open="detailOpen">
    <DialogContent class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ detail?.voornaam }} {{ detail?.naam }}</DialogTitle>
        <DialogDescription>Ingediend op {{ formatDate(detail?.createdAt) }}</DialogDescription>
      </DialogHeader>

      <div v-if="detail" class="flex flex-col gap-5 py-2 text-sm">
        <!-- Status -->
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground w-36 shrink-0">Status</span>
          <select
            :value="detail.status"
            @change="updateStatus(detail!, ($event.target as HTMLSelectElement).value)"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :class="statusClass(detail.status)"
          >
            <option value="nieuw">Nieuw</option>
            <option value="in behandeling">In behandeling</option>
            <option value="aangenomen">Aangenomen</option>
            <option value="afgewezen">Afgewezen</option>
          </select>
        </div>

        <hr />

        <Section title="Persoonlijke gegevens">
          <Row label="Naam" :value="`${detail.voornaam} ${detail.naam}`" />
          <Row label="Geboortedatum" :value="detail.geboortedatum" />
          <Row label="Geboorteplaats" :value="detail.geboorteplaats" />
          <Row label="Adres" :value="detail.adres" />
          <Row label="GSM" :value="detail.gsm" />
          <Row label="E-mail" :value="detail.email || '—'" />
          <Row label="Burgerlijke staat" :value="detail.burgerlijkeStaat" />
        </Section>

        <hr />

        <Section title="Administratieve gegevens">
          <Row label="Rijksregisternummer" :value="detail.rijksregister" />
          <Row label="Bankrekeningnummer" :value="detail.bankrekening" />
        </Section>

        <hr />

        <Section title="Taalkennis">
          <Row label="Nederlands" :value="detail.kennisNederlands" />
          <Row label="Frans" :value="detail.kennisFrans" />
        </Section>

        <hr />

        <Section title="Motivatie & hobby's">
          <div v-if="detail.hobbys">
            <p class="text-xs font-medium text-muted-foreground mb-1">Hobby's</p>
            <p class="text-foreground">{{ detail.hobbys }}</p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted-foreground mb-1">Motivatie</p>
            <p class="text-foreground whitespace-pre-line">{{ detail.motivatie }}</p>
          </div>
        </Section>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="destructive" size="sm" @click="confirmDelete(detail!); detailOpen = false">
          <Trash2 class="mr-1.5 size-3.5" /> Verwijderen
        </Button>
        <Button @click="detailOpen = false">Sluiten</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Delete confirm dialog -->
  <Dialog v-model:open="deleteOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Sollicitatie verwijderen?</DialogTitle>
        <DialogDescription>
          Weet je zeker dat je de sollicitatie van
          <strong>{{ deleteTarget?.voornaam }} {{ deleteTarget?.naam }}</strong> wilt verwijderen?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="gap-2">
        <Button variant="outline" @click="deleteOpen = false">Annuleren</Button>
        <Button variant="destructive" :disabled="deleting" @click="doDelete">
          <Loader2 v-if="deleting" class="mr-2 size-4 animate-spin" />
          Verwijderen
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Search, Trash2, Loader2, Mail, Phone } from "lucide-vue-next";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/lib/useAuth";

interface Sollicitatie {
  id: string;
  voornaam: string;
  naam: string;
  geboortedatum: string;
  geboorteplaats: string;
  adres: string;
  gsm: string;
  email: string;
  burgerlijkeStaat: string;
  rijksregister: string;
  bankrekening: string;
  kennisNederlands: string;
  kennisFrans: string;
  hobbys: string;
  motivatie: string;
  createdAt: string;
  status: string;
}

// ─── Tiny reusable sub-components ─────────────────────────────────────────────
const Section = {
  props: ["title"],
  template: `<div><p class="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3">{{ title }}</p><div class="flex flex-col gap-2"><slot /></div></div>`,
};
const Row = {
  props: ["label", "value"],
  template: `<div class="flex gap-2"><span class="text-muted-foreground w-36 shrink-0">{{ label }}</span><span class="text-foreground font-medium">{{ value }}</span></div>`,
};
const StatusBadge = {
  props: ["status"],
  setup(props: { status: string }) {
    const cls = computed(() => {
      if (props.status === "aangenomen") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
      if (props.status === "in behandeling") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
      if (props.status === "afgewezen") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    });
    return { cls };
  },
  template: `<span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls]">{{ status }}</span>`,
};

// ─── State ────────────────────────────────────────────────────────────────────
const { loading: authLoading } = useAuth();
const loading = ref(true);
const all = ref<Sollicitatie[]>([]);
const searchQuery = ref("");
const statusFilter = ref("");

// ─── Detail ───────────────────────────────────────────────────────────────────
const detailOpen = ref(false);
const detail = ref<Sollicitatie | null>(null);

function openDetail(s: Sollicitatie) {
  detail.value = s;
  detailOpen.value = true;
}

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteOpen = ref(false);
const deleteTarget = ref<Sollicitatie | null>(null);
const deleting = ref(false);

function confirmDelete(s: Sollicitatie) {
  deleteTarget.value = s;
  deleteOpen.value = true;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  const id = deleteTarget.value.id;
  try {
    await apiFetch(`/api/sollicitaties/${id}`, { method: "DELETE" });
    all.value = all.value.filter((s) => s.id !== id);
    deleteOpen.value = false;
  } catch (err) {
    console.error("Failed to delete sollicitatie:", err);
  } finally {
    deleting.value = false;
  }
}

// ─── Status update ────────────────────────────────────────────────────────────
async function updateStatus(s: Sollicitatie, status: string) {
  try {
    await apiFetch(`/api/sollicitaties/${s.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    s.status = status;
    if (detail.value?.id === s.id) detail.value.status = status;
  } catch (err) {
    console.error("Failed to update status:", err);
  }
}

// ─── Computed ─────────────────────────────────────────────────────────────────
const filtered = computed(() => {
  return all.value.filter((s) => {
    if (statusFilter.value && s.status !== statusFilter.value) return false;
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      return (
        `${s.voornaam} ${s.naam}`.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.gsm?.includes(q)
      );
    }
    return true;
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function statusClass(status: string) {
  if (status === "aangenomen") return "text-emerald-700 border-emerald-300";
  if (status === "in behandeling") return "text-blue-700 border-blue-300";
  if (status === "afgewezen") return "text-red-700 border-red-300";
  return "";
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchAll() {
  loading.value = true;
  try {
    const res = await apiFetch("/api/sollicitaties");
    all.value = (await res.json()) as Sollicitatie[];
  } catch (err) {
    console.error("Failed to fetch sollicitaties:", err);
  } finally {
    loading.value = false;
  }
}

watch(authLoading, (val) => { if (!val) fetchAll(); }, { immediate: true });
</script>
