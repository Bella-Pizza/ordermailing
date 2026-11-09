<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ t('stores.title') }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ t('stores.subtitle') }}
          </p>
        </div>
        <Button @click="openCreate">
          <Plus class="mr-2 size-4" />
          {{ t('stores.add') }}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('stores.table.name') }}</TableHead>
            <TableHead>{{ t('stores.table.address') }}</TableHead>
            <TableHead>{{ t('stores.table.vat') }}</TableHead>
            <TableHead>{{ t('stores.table.phone') }}</TableHead>
            <TableHead>{{ t('stores.table.contactEmail') }}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="!loading && stores.length === 0">
            <TableCell colspan="6" class="py-8 text-center text-muted-foreground">{{ t('stores.empty') }}</TableCell>
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
                    {{ t('stores.menu.edit') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="openCopy(store)">
                    <CopyIcon class="mr-2 size-4" />
                    {{ t('stores.menu.copy') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem v-if="stores.length > 1" @click="openCopyTodos(store)">
                    <Repeat class="mr-2 size-4" />
                    {{ t('stores.menu.copyTodos') }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="confirmDelete(store)">
                    <Trash2 class="mr-2 size-4" />
                    {{ t('stores.menu.delete') }}
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
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ editingId ? t('stores.form.editTitle') : t('stores.form.newTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('stores.form.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-1">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.form.name') }}</label>
          <Input v-model="form.name" placeholder="Bella Pizza — Center" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.form.address') }}</label>
          <Input v-model="form.address" placeholder="Main Street 1, 8000 Bruges" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">{{ t('stores.form.vat') }}</label>
            <Input v-model="form.vatNumber" placeholder="BE0123.456.789" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">{{ t('stores.form.phone') }}</label>
            <Input v-model="form.phone" placeholder="+32 470 00 00 00" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.form.contactEmail') }}</label>
          <Input v-model="form.contactEmail" type="email" placeholder="store@example.com" />
          <p class="text-xs text-muted-foreground">{{ t('stores.form.contactEmailHint') }}</p>
        </div>

        <!-- PIN for the public /todo page -->
        <div v-if="editingId" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="store-todo-pin">{{ t('stores.form.todoPin') }}</label>
          <Input
            id="store-todo-pin"
            v-model="form.todoPin"
            inputmode="numeric"
            autocomplete="off"
            maxlength="4"
            placeholder="••••"
          />
          <p class="text-xs" :class="editingPinIsDefault ? 'text-destructive' : 'text-muted-foreground'">
            {{ editingPinIsDefault ? t('stores.form.todoPinDefault') : t('stores.form.todoPinCustom') }}
          </p>
          <p class="text-xs text-muted-foreground">{{ t('stores.form.todoPinHint') }}</p>
        </div>

        <!-- Copy products on creation -->
        <div v-if="!editingId && stores.length > 0" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.form.copyFrom') }}</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="justify-between font-normal">
                <span>{{ copyFromName || t('stores.form.startEmpty') }}</span>
                <ChevronsUpDown class="ml-2 size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-56">
              <DropdownMenuItem @click="form.copyFromStoreId = ''">
                <span class="flex-1">{{ t('stores.form.startEmpty') }}</span>
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
        <Button variant="outline" :disabled="saving" @click="formOpen = false">{{ t('stores.form.cancel') }}</Button>
        <Button :disabled="saving || !form.name.trim() || !todoPinIsValid" @click="saveStore">
          <Loader2 v-if="saving" class="mr-2 size-4 animate-spin" />
          {{ editingId ? t('stores.form.save') : t('stores.form.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Copy products dialog (with warning) ─────────────────────────────── -->
  <Dialog v-model:open="copyOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('stores.copy.title', { name: copyTarget?.name ?? '' }) }}</DialogTitle>
        <DialogDescription>
          {{ t('stores.copy.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-1">
        <div
          class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0" />
          <span>
            {{ t('stores.copy.warning', { name: copyTarget?.name ?? '' }) }}
          </span>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.copy.copyFrom') }}</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="justify-between font-normal">
                <span>{{ copySourceName || t('stores.copy.select') }}</span>
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
        <Button variant="outline" :disabled="copying" @click="copyOpen = false">{{ t('stores.copy.cancel') }}</Button>
        <Button variant="destructive" :disabled="copying || !copySourceId" @click="executeCopy">
          <Loader2 v-if="copying" class="mr-2 size-4 animate-spin" />
          {{ t('stores.copy.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Copy recurring to-dos to another store ──────────────────────────── -->
  <Dialog v-model:open="copyTodosOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('stores.copyTodos.title', { name: copyTodosSource?.name ?? '' }) }}</DialogTitle>
        <DialogDescription>{{ t('stores.copyTodos.description') }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-1">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('stores.copyTodos.copyTo') }}</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="justify-between font-normal" :disabled="copyingTodos">
                <span>{{ copyTodosTargetName || t('stores.copyTodos.select') }}</span>
                <ChevronsUpDown class="ml-2 size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-56">
              <DropdownMenuItem
                v-for="s in stores.filter((s) => s.id !== copyTodosSource?.id)"
                :key="s.id"
                @click="selectCopyTodosTarget(s.id)"
              >
                <span class="flex-1 truncate">{{ s.name }}</span>
                <Check v-if="copyTodosTargetId === s.id" class="ml-2 size-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p v-if="copyTodosMessage" class="text-sm" :class="copyTodosFailed ? 'text-destructive' : 'text-muted-foreground'" role="status">
          {{ copyTodosMessage }}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="copyingTodos" @click="copyTodosOpen = false">
          {{ copyTodosDone ? t('stores.copyTodos.close') : t('stores.copyTodos.cancel') }}
        </Button>
        <Button :disabled="copyingTodos || !copyTodosTargetId || copyTodosDone" @click="executeCopyTodos">
          <Loader2 v-if="copyingTodos" class="mr-2 size-4 animate-spin" />
          {{ t('stores.copyTodos.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ─── Delete confirmation ─────────────────────────────────────────────── -->
  <Dialog v-model:open="deleteOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('stores.delete.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('stores.delete.description', { name: deleteTarget?.name ?? '' }) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="mt-2">
        <Button variant="outline" :disabled="deleting" @click="deleteOpen = false">{{ t('stores.delete.cancel') }}</Button>
        <Button variant="destructive" :disabled="deleting" @click="executeDelete">
          <Loader2 v-if="deleting" class="mr-2 size-4 animate-spin" />
          {{ t('stores.delete.confirm') }}
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
  Repeat,
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
import { useLocale } from "@/lib/useLocale";
import { useStore, type Store } from "@/lib/useStore";

const { loading: authLoading } = useAuth();
const { t } = useLocale();
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
  todoPin: "",
});

const copyFromName = computed(() => stores.value.find((s) => s.id === form.value.copyFromStoreId)?.name ?? "");
const todoPinIsValid = computed(() => form.value.todoPin === "" || /^\d{4}$/.test(form.value.todoPin));
const editingPinIsDefault = computed(() => !stores.value.find((s) => s.id === editingId.value)?.todoPinCustom);

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
  form.value = { name: "", address: "", vatNumber: "", phone: "", contactEmail: "", copyFromStoreId: "", todoPin: "" };
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
    todoPin: "",
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
      if (form.value.todoPin) payload.todoPin = form.value.todoPin;
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

// ─── Copy recurring to-dos ────────────────────────────────────────────────────
const copyTodosOpen = ref(false);
const copyingTodos = ref(false);
const copyTodosSource = ref<Store | null>(null);
const copyTodosTargetId = ref("");
const copyTodosMessage = ref("");
const copyTodosFailed = ref(false);
const copyTodosDone = ref(false);

const copyTodosTargetName = computed(() => stores.value.find((s) => s.id === copyTodosTargetId.value)?.name ?? "");

function openCopyTodos(store: Store) {
  copyTodosSource.value = store;
  copyTodosTargetId.value = "";
  copyTodosMessage.value = "";
  copyTodosFailed.value = false;
  copyTodosDone.value = false;
  copyTodosOpen.value = true;
}

function selectCopyTodosTarget(id: string) {
  copyTodosTargetId.value = id;
  copyTodosMessage.value = "";
  copyTodosDone.value = false;
}

async function executeCopyTodos() {
  if (!copyTodosSource.value || !copyTodosTargetId.value) return;
  copyingTodos.value = true;
  copyTodosFailed.value = false;
  try {
    const res = await apiFetch(`/api/stores/${copyTodosSource.value.id}/copy-recurring`, {
      method: "POST",
      body: JSON.stringify({ targetStoreId: copyTodosTargetId.value }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const { copied, skipped } = await res.json();
    copyTodosMessage.value = t("stores.copyTodos.result", { copied, skipped });
    copyTodosDone.value = true;
  } catch {
    copyTodosMessage.value = t("stores.copyTodos.error");
    copyTodosFailed.value = true;
  } finally {
    copyingTodos.value = false;
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
