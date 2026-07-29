<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Stores</h1>
          <p class="text-muted-foreground text-sm">
            Manage your stores. Each store has its own suppliers, products and order emails.
          </p>
        </div>
        <Button @click="openCreate">
          <Plus class="mr-2 size-4" />
          Add store
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>VAT</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Contact email</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="!loading && stores.length === 0">
            <TableCell colspan="6" class="py-8 text-center text-muted-foreground">No stores yet.</TableCell>
          </TableRow>
          <TableRow v-for="store in stores" :key="store.id">
            <TableCell class="font-medium">{{ store.name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ store.address || "-" }}</TableCell>
            <TableCell class="text-muted-foreground">{{ store.vatNumber || "-" }}</TableCell>
            <TableCell class="text-muted-foreground">{{ store.phone || "-" }}</TableCell>
            <TableCell class="text-muted-foreground">{{ store.contactEmail || "-" }}</TableCell>
            <TableCell class="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal class="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="openEdit(store)">
                    <Pencil class="mr-2 size-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="openCopy(store)">
                    <CopyIcon class="mr-2 size-4" />
                    Copy products from…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="confirmDelete(store)">
                    <Trash2 class="mr-2 size-4" />
                    Delete store
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </TopLoader>

  <!-- ─── Create / Edit store dialog ──────────────────────────────────────── -->
  <Dialog v-model:open="formOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ editingId ? "Edit store" : "New store" }}</DialogTitle>
        <DialogDescription>
          These details appear at the bottom of every order email sent for this store.
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-1">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Name</label>
          <Input v-model="form.name" placeholder="Bella Pizza — Center" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Address</label>
          <Input v-model="form.address" placeholder="Main Street 1, 8000 Bruges" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">VAT number</label>
            <Input v-model="form.vatNumber" placeholder="BE0123.456.789" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">Phone</label>
            <Input v-model="form.phone" placeholder="+32 470 00 00 00" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Contact email</label>
          <Input v-model="form.contactEmail" type="email" placeholder="store@example.com" />
          <p class="text-xs text-muted-foreground">Order emails are CC'd here and replies go to this address.</p>
        </div>

        <!-- Copy products on creation -->
        <div v-if="!editingId && stores.length > 0" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Copy suppliers &amp; products from</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="justify-between font-normal">
                <span>{{ copyFromName || "Start empty" }}</span>
                <ChevronsUpDown class="ml-2 size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-56">
              <DropdownMenuItem @click="form.copyFromStoreId = ''">
                <span class="flex-1">Start empty</span>
                <Check v-if="!form.copyFromStoreId" class="ml-2 size-4" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem v-for="s in stores" :key="s.id" @click="form.copyFromStoreId = s.id">
                <span class="flex-1 truncate">{{ s.name }}</span>
                <Check v-if="form.copyFromStoreId === s.id" class="ml-2 size-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="saving" @click="formOpen = false">Cancel</Button>
        <Button :disabled="saving || !form.name.trim()" @click="saveStore">
          <Loader2 v-if="saving" class="mr-2 size-4 animate-spin" />
          {{ editingId ? "Save" : "Create" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Copy products dialog (with warning) ─────────────────────────────── -->
  <Dialog v-model:open="copyOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Copy products into "{{ copyTarget?.name }}"</DialogTitle>
        <DialogDescription>
          Choose a store to copy all suppliers and products from.
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-1">
        <div
          class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0" />
          <span>
            This will <strong>permanently overwrite</strong> the current suppliers and products of
            "{{ copyTarget?.name }}". This cannot be undone.
          </span>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Copy from</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="justify-between font-normal">
                <span>{{ copySourceName || "Select a store…" }}</span>
                <ChevronsUpDown class="ml-2 size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-56">
              <DropdownMenuItem
                v-for="s in stores.filter((s) => s.id !== copyTarget?.id)"
                :key="s.id"
                @click="copySourceId = s.id"
              >
                <span class="flex-1 truncate">{{ s.name }}</span>
                <Check v-if="copySourceId === s.id" class="ml-2 size-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="copying" @click="copyOpen = false">Cancel</Button>
        <Button variant="destructive" :disabled="copying || !copySourceId" @click="executeCopy">
          <Loader2 v-if="copying" class="mr-2 size-4 animate-spin" />
          Overwrite &amp; copy
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Delete confirmation ─────────────────────────────────────────────── -->
  <Dialog v-model:open="deleteOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Delete store</DialogTitle>
        <DialogDescription>
          Delete "{{ deleteTarget?.name }}" and all of its suppliers and products? Orders remain but keep their
          historical store details. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="mt-2">
        <Button variant="outline" :disabled="deleting" @click="deleteOpen = false">Cancel</Button>
        <Button variant="destructive" :disabled="deleting" @click="executeDelete">
          <Loader2 v-if="deleting" class="mr-2 size-4 animate-spin" />
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
  Check,
  ChevronsUpDown,
  Copy as CopyIcon,
  AlertTriangle,
} from "lucide-vue-next";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/lib/useAuth";
import { useStore, type Store } from "@/lib/useStore";

const { loading: authLoading } = useAuth();
const { stores, fetchStores } = useStore();

const loading = ref(true);

// ─── Create / edit form ───────────────────────────────────────────────────────
const formOpen = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const form = ref({
  name: "",
  address: "",
  vatNumber: "",
  phone: "",
  contactEmail: "",
  copyFromStoreId: "",
});

const copyFromName = computed(() => stores.value.find((s) => s.id === form.value.copyFromStoreId)?.name ?? "");

watch(
  authLoading,
  async (isLoading) => {
    if (!isLoading) {
      await fetchStores();
      loading.value = false;
    }
  },
  { immediate: true },
);

function resetForm() {
  form.value = { name: "", address: "", vatNumber: "", phone: "", contactEmail: "", copyFromStoreId: "" };
}

function openCreate() {
  editingId.value = null;
  resetForm();
  formOpen.value = true;
}

function openEdit(store: Store) {
  editingId.value = store.id;
  form.value = {
    name: store.name ?? "",
    address: store.address ?? "",
    vatNumber: store.vatNumber ?? "",
    phone: store.phone ?? "",
    contactEmail: store.contactEmail ?? "",
    copyFromStoreId: "",
  };
  formOpen.value = true;
}

async function saveStore() {
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name.trim(),
      address: form.value.address.trim(),
      vatNumber: form.value.vatNumber.trim(),
      phone: form.value.phone.trim(),
      contactEmail: form.value.contactEmail.trim(),
    };
    if (editingId.value) {
      await apiFetch(`/api/stores/${editingId.value}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      if (form.value.copyFromStoreId) payload.copyFromStoreId = form.value.copyFromStoreId;
      await apiFetch("/api/stores", { method: "POST", body: JSON.stringify(payload) });
    }
    formOpen.value = false;
    await fetchStores();
  } finally {
    saving.value = false;
  }
}

// ─── Copy products ────────────────────────────────────────────────────────────
const copyOpen = ref(false);
const copying = ref(false);
const copyTarget = ref<Store | null>(null);
const copySourceId = ref("");

const copySourceName = computed(() => stores.value.find((s) => s.id === copySourceId.value)?.name ?? "");

function openCopy(store: Store) {
  copyTarget.value = store;
  copySourceId.value = "";
  copyOpen.value = true;
}

async function executeCopy() {
  if (!copyTarget.value || !copySourceId.value) return;
  copying.value = true;
  try {
    await apiFetch(`/api/stores/${copyTarget.value.id}/copy-products`, {
      method: "POST",
      body: JSON.stringify({ sourceStoreId: copySourceId.value }),
    });
    copyOpen.value = false;
  } finally {
    copying.value = false;
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteOpen = ref(false);
const deleting = ref(false);
const deleteTarget = ref<Store | null>(null);

function confirmDelete(store: Store) {
  deleteTarget.value = store;
  deleteOpen.value = true;
}

async function executeDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await apiFetch(`/api/stores/${deleteTarget.value.id}`, { method: "DELETE" });
    deleteOpen.value = false;
    deleteTarget.value = null;
    await fetchStores();
  } finally {
    deleting.value = false;
  }
}
</script>
