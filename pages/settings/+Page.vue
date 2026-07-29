<template>
  <div class="flex flex-col gap-8 max-w-2xl">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">{{ t('settings.title') }}</h1>
      <p class="text-muted-foreground text-sm">{{ t('settings.subtitle') }}</p>
    </div>

    <!-- ─── Profile section ──────────────────────────────────────────────────── -->
    <div class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.profile.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('settings.profile.subtitle') }}</p>
      </div>
      <div class="flex flex-col gap-4 px-6 py-5">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('settings.profile.name') }}</label>
          <Input v-model="profileName" :placeholder="t('settings.profile.name')" class="max-w-sm" />
        </div>
        <div class="flex items-center gap-3">
          <Button :disabled="profileSaving || !profileName.trim()" @click="saveProfile">
            <Loader2 v-if="profileSaving" class="mr-2 size-4 animate-spin" />
            {{ t('settings.profile.save') }}
          </Button>
          <span v-if="profileSuccess" class="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle class="size-4" /> {{ t('settings.profile.success') }}
          </span>
          <span v-if="profileError" class="text-sm text-destructive">{{ profileError }}</span>
        </div>
      </div>
    </div>

    <!-- ─── Password section ─────────────────────────────────────────────────── -->
    <div class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.password.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('settings.password.subtitle') }}</p>
      </div>
      <div class="flex flex-col gap-4 px-6 py-5">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('settings.password.current') }}</label>
          <Input v-model="currentPassword" type="password" class="max-w-sm" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('settings.password.new') }}</label>
          <Input v-model="newPassword" type="password" class="max-w-sm" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('settings.password.confirm') }}</label>
          <Input v-model="confirmPassword" type="password" class="max-w-sm" />
        </div>
        <div class="flex items-center gap-3">
          <Button
            :disabled="passwordSaving || !currentPassword || !newPassword || !confirmPassword"
            @click="changePassword"
          >
            <Loader2 v-if="passwordSaving" class="mr-2 size-4 animate-spin" />
            {{ t('settings.password.save') }}
          </Button>
          <span v-if="passwordSuccess" class="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle class="size-4" /> {{ t('settings.password.success') }}
          </span>
          <span v-if="passwordError" class="text-sm text-destructive">{{ passwordError }}</span>
        </div>
      </div>
    </div>

    <!-- ─── Language section ─────────────────────────────────────────────────── -->
    <div class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.language.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('settings.language.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3 px-6 py-5">
        <Button
          :variant="lang === 'en' ? 'default' : 'outline'"
          class="w-32"
          @click="setLang('en')"
        >
          🇬🇧 {{ t('settings.language.en') }}
        </Button>
        <Button
          :variant="lang === 'fr' ? 'default' : 'outline'"
          class="w-32"
          @click="setLang('fr')"
        >
          🇫🇷 {{ t('settings.language.fr') }}
        </Button>
      </div>
    </div>

    <!-- ─── Appearance section ───────────────────────────────────────────────── -->
    <div class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.appearance.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('settings.appearance.subtitle') }}</p>
      </div>
      <div class="divide-y px-6">
        <div class="flex items-center justify-between py-5">
          <div>
            <p class="text-sm font-medium">{{ t('settings.appearance.darkMode') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('settings.appearance.darkModeDesc') }}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            @click="toggleTheme"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </Button>
        </div>
        <div class="flex items-center justify-between py-5">
          <div>
            <p class="text-sm font-medium">{{ t('settings.appearance.nolanMode') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('settings.appearance.nolanModeDesc') }}</p>
          </div>
          <Switch v-model="nolanMode" aria-label="Toggle Nolan mode" />
        </div>
      </div>
    </div>

    <!-- ─── Gmail connection section (admin only) ──────────────────────────── -->
    <div v-if="userRole === 'admin'" class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.gmail.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('settings.gmail.subtitle') }}</p>
      </div>
      <div class="flex flex-col gap-4 px-6 py-5">
        <div v-if="gmailStatus === null" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>

        <div v-else-if="!gmailStatus.configured" class="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
          {{ t('settings.gmail.notConfigured') }}
        </div>

        <template v-else>
          <div v-if="gmailStatus.connected" class="flex items-center gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
              <CheckCircle class="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p class="text-sm font-medium">{{ t('settings.gmail.connected', { email: gmailStatus.email }) }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <Button v-if="!gmailStatus.connected" @click="connectGmail">
              <svg class="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {{ t('settings.gmail.connect') }}
            </Button>
            <Button v-else variant="outline" :disabled="gmailDisconnecting" @click="disconnectGmail">
              <Loader2 v-if="gmailDisconnecting" class="mr-2 size-4 animate-spin" />
              {{ gmailDisconnecting ? t('settings.gmail.disconnecting') : t('settings.gmail.disconnect') }}
            </Button>
            <span v-if="gmailSuccessMsg" class="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle class="size-4" /> {{ gmailSuccessMsg }}
            </span>
            <span v-if="gmailErrorMsg" class="text-sm text-destructive">{{ gmailErrorMsg }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- ─── Import section ───────────────────────────────────────────────────── -->
    <div class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">{{ t('settings.import.title') }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t('settings.import.subtitle') }}
          <span class="font-medium text-destructive">{{ t('settings.import.warning') }}</span>
        </p>
      </div>
      <div class="flex flex-col gap-4 px-6 py-5">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('settings.import.fileLabel') }}</label>
          <div
            class="relative flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-4 py-5 transition-colors"
            :class="
              parsedData
                ? 'border-primary/50 bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            "
            @click="fileInput?.click()"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <FileJson class="size-8 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p v-if="fileName" class="truncate text-sm font-medium">{{ fileName }}</p>
              <p v-else class="text-sm text-muted-foreground">{{ t('settings.import.dropzone') }}</p>
              <p v-if="parseError" class="mt-0.5 text-xs text-destructive">{{ parseError }}</p>
              <p v-else-if="parsedData" class="mt-0.5 text-xs text-muted-foreground">
                {{ t('settings.import.found', { suppliers: parsedData.suppliers.length, products: parsedData.totalProducts }) }}
              </p>
            </div>
            <input ref="fileInput" type="file" accept=".json,application/json" class="sr-only" @change="onFileChange" />
          </div>
        </div>

        <div v-if="parsedData && parsedData.suppliers.length" class="rounded-md border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground">{{ t('settings.import.col.supplier') }}</th>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground">{{ t('settings.import.col.email') }}</th>
                <th class="px-3 py-2 text-right font-medium text-muted-foreground">{{ t('settings.import.col.products') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="(s, i) in parsedData.suppliers.slice(0, 10)" :key="i">
                <td class="px-3 py-2 font-medium">{{ s.name }}</td>
                <td class="px-3 py-2 text-muted-foreground">{{ s.email || "—" }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ s.productCount }}</td>
              </tr>
              <tr v-if="parsedData.suppliers.length > 10">
                <td colspan="3" class="px-3 py-2 text-center text-xs text-muted-foreground">
                  {{ t('settings.import.more', { n: parsedData.suppliers.length - 10 }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex justify-end">
          <Button :disabled="!parsedData || importing" @click="confirmOpen = true">
            <Upload class="mr-2 size-4" />
            {{ t('settings.import.button') }}
          </Button>
        </div>

        <div
          v-if="importSuccess"
          class="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
        >
          <CheckCircle class="size-4 shrink-0" />
          {{ t('settings.import.success', { suppliers: importSuccess.suppliers, products: importSuccess.products }) }}
        </div>
      </div>
    </div>

    <!-- ─── Copy products from another store (admin only) ────────────────────── -->
    <div v-if="userRole === 'admin' && stores.length > 1" class="rounded-lg border">
      <div class="flex flex-col gap-1 border-b px-6 py-4">
        <h2 class="font-semibold">Copy products from another store</h2>
        <p class="text-sm text-muted-foreground">
          Replace <span class="font-medium text-foreground">{{ currentStore?.name ?? "this store" }}</span>'s suppliers
          and products with a copy from another store.
          <span class="font-medium text-destructive">This overwrites all current suppliers and products.</span>
        </p>
      </div>
      <div class="flex flex-col gap-4 px-6 py-5">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Copy from</label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="w-full justify-between font-normal sm:w-72">
                <span>{{ copySourceName || "Select a store…" }}</span>
                <ChevronsUpDown class="ml-2 size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-72">
              <DropdownMenuItem
                v-for="s in otherStores"
                :key="s.id"
                @click="copySourceId = s.id"
              >
                <span class="flex-1 truncate">{{ s.name }}</span>
                <Check v-if="copySourceId === s.id" class="ml-2 size-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div class="flex items-center gap-3">
          <Button variant="destructive" :disabled="!copySourceId || copying" @click="copyConfirmOpen = true">
            <Loader2 v-if="copying" class="mr-2 size-4 animate-spin" />
            Overwrite &amp; copy
          </Button>
          <span
            v-if="copySuccess"
            class="flex items-center gap-1.5 text-sm text-green-600"
          >
            <CheckCircle class="size-4" /> Copied {{ copySuccess.suppliers }} suppliers, {{ copySuccess.products }} products
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Confirm copy-products dialog -->
  <Dialog v-model:open="copyConfirmOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Overwrite products?</DialogTitle>
        <DialogDescription>
          This permanently replaces all suppliers and products of
          "{{ currentStore?.name ?? "this store" }}" with a copy from "{{ copySourceName }}". This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="mt-2">
        <Button variant="outline" :disabled="copying" @click="copyConfirmOpen = false">Cancel</Button>
        <Button variant="destructive" :disabled="copying" @click="runCopyProducts">
          <Loader2 v-if="copying" class="mr-2 size-4 animate-spin" />
          Overwrite &amp; copy
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Confirm overwrite dialog -->
  <Dialog v-model:open="confirmOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('settings.import.confirm.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.import.confirm.description') }}
        </DialogDescription>
      </DialogHeader>
      <div v-if="parsedData" class="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {{ t('settings.import.confirm.summary', { suppliers: parsedData.suppliers.length, products: parsedData.totalProducts }) }}
      </div>
      <DialogFooter class="mt-2">
        <Button variant="outline" :disabled="importing" @click="confirmOpen = false">{{ t('settings.import.confirm.cancel') }}</Button>
        <Button variant="destructive" :disabled="importing" @click="runImport">
          <Loader2 v-if="importing" class="mr-2 size-4 animate-spin" />
          {{ t('settings.import.confirm.overwrite') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { FileJson, Upload, Loader2, CheckCircle, Sun, Moon, Check, ChevronsUpDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/useTheme";
import { useNolanMode } from "@/lib/useNolanMode";
import { useLocale } from "@/lib/useLocale";
import { useAuth } from "@/lib/useAuth";
import { useStore } from "@/lib/useStore";
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiFetch";

const { isDark, toggleTheme } = useTheme();
const { nolanMode } = useNolanMode();
const { t, lang, setLang } = useLocale();
const { currentUser, userRole } = useAuth();
const { stores, currentStore, currentStoreId, fetchStores } = useStore();

// ─── Profile ──────────────────────────────────────────────────────────────────
const profileName = ref("");
const profileSaving = ref(false);
const profileSuccess = ref(false);
const profileError = ref("");

onMounted(() => {
  profileName.value = currentUser.value?.displayName ?? "";

  if (userRole.value === "admin") {
    fetchStores();
    fetchGmailStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.has("gmail_connected")) {
      gmailSuccessMsg.value = t("settings.gmail.successMsg");
      setTimeout(() => { gmailSuccessMsg.value = ""; }, 4000);
      history.replaceState(null, "", window.location.pathname);
    } else if (params.has("gmail_error")) {
      gmailErrorMsg.value = t("settings.gmail.errorMsg");
      history.replaceState(null, "", window.location.pathname);
    }
  }
});

async function saveProfile() {
  if (!auth.currentUser || !profileName.value.trim()) return;
  profileSaving.value = true;
  profileSuccess.value = false;
  profileError.value = "";
  try {
    await updateProfile(auth.currentUser, { displayName: profileName.value.trim() });
    profileSuccess.value = true;
    setTimeout(() => { profileSuccess.value = false; }, 3000);
  } catch (err: unknown) {
    profileError.value = (err as Error).message ?? "Failed to update profile.";
  } finally {
    profileSaving.value = false;
  }
}

// ─── Password ─────────────────────────────────────────────────────────────────
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const passwordSaving = ref(false);
const passwordSuccess = ref(false);
const passwordError = ref("");

async function changePassword() {
  if (!auth.currentUser) return;
  passwordError.value = "";
  passwordSuccess.value = false;

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = t("settings.password.mismatch");
    return;
  }

  passwordSaving.value = true;
  try {
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email!,
      currentPassword.value,
    );
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword.value);
    passwordSuccess.value = true;
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
    setTimeout(() => { passwordSuccess.value = false; }, 3000);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      passwordError.value = "Current password is incorrect.";
    } else {
      passwordError.value = (err as Error).message ?? "Failed to change password.";
    }
  } finally {
    passwordSaving.value = false;
  }
}

// ─── Gmail ────────────────────────────────────────────────────────────────────
interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
}

const gmailStatus = ref<GmailStatus | null>(null);
const gmailDisconnecting = ref(false);
const gmailSuccessMsg = ref("");
const gmailErrorMsg = ref("");

async function fetchGmailStatus() {
  try {
    const res = await apiFetch("/api/gmail/status");
    if (res.ok) gmailStatus.value = await res.json();
  } catch {
    // silently ignore
  }
}

async function connectGmail() {
  gmailErrorMsg.value = "";
  try {
    const res = await apiFetch("/api/gmail/auth-url");
    if (!res.ok) { gmailErrorMsg.value = t("settings.gmail.errorMsg"); return; }
    const { url } = await res.json();
    window.location.href = url;
  } catch {
    gmailErrorMsg.value = t("settings.gmail.errorMsg");
  }
}

async function disconnectGmail() {
  gmailDisconnecting.value = true;
  gmailSuccessMsg.value = "";
  gmailErrorMsg.value = "";
  try {
    const res = await apiFetch("/api/gmail/disconnect", { method: "DELETE" });
    if (!res.ok) { gmailErrorMsg.value = t("settings.gmail.errorMsg"); return; }
    gmailStatus.value = { configured: true, connected: false };
    gmailSuccessMsg.value = t("settings.gmail.disconnectSuccess");
    setTimeout(() => { gmailSuccessMsg.value = ""; }, 3000);
  } catch {
    gmailErrorMsg.value = t("settings.gmail.errorMsg");
  } finally {
    gmailDisconnecting.value = false;
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────
interface ParsedData {
  suppliers: Array<{ name: string; email: string; productCount: number }>;
  totalProducts: number;
  raw: object;
}

const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref("");
const parseError = ref("");
const parsedData = ref<ParsedData | null>(null);
const confirmOpen = ref(false);
const importing = ref(false);
const importSuccess = ref<{ suppliers: number; products: number } | null>(null);

function parseFile(text: string, name: string) {
  fileName.value = name;
  parseError.value = "";
  parsedData.value = null;
  importSuccess.value = null;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    parseError.value = "Invalid JSON — could not parse the file.";
    return;
  }

  const obj = json as Record<string, unknown>;
  const list: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(obj?.suppliers)
      ? (obj.suppliers as unknown[])
      : Array.isArray(obj?.data)
        ? (obj.data as unknown[])
        : [];

  if (list.length === 0) {
    parseError.value = "No suppliers found. Expected an array, { suppliers: [...] }, or { data: [...] }.";
    return;
  }

  const suppliers = list.map((s: unknown) => {
    const obj = s as Record<string, unknown>;
    const products = Array.isArray(obj.products) ? obj.products : [];
    return {
      name: String(obj.name ?? ""),
      email: String(obj.email ?? ""),
      productCount: products.length,
    };
  });

  parsedData.value = {
    suppliers,
    totalProducts: suppliers.reduce((sum, s) => sum + s.productCount, 0),
    raw: Array.isArray(json) ? { suppliers: list } : (json as object),
  };
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => parseFile(reader.result as string, file.name);
  reader.readAsText(file);
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => parseFile(reader.result as string, file.name);
  reader.readAsText(file);
}

async function runImport() {
  if (!parsedData.value) return;
  importing.value = true;
  try {
    const res = await apiFetch("/api/suppliers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedData.value.raw),
    });

    if (!res.ok) {
      const err = await res.json();
      parseError.value = err.message ?? "Import failed.";
      confirmOpen.value = false;
      return;
    }

    const result = await res.json();
    confirmOpen.value = false;
    fileName.value = "";
    parsedData.value = null;
    parseError.value = "";
    if (fileInput.value) fileInput.value.value = "";
    importSuccess.value = { suppliers: result.suppliersCreated, products: result.productsCreated };
  } finally {
    importing.value = false;
  }
}

// ─── Copy products from another store ──────────────────────────────────────────
const copySourceId = ref("");
const copyConfirmOpen = ref(false);
const copying = ref(false);
const copySuccess = ref<{ suppliers: number; products: number } | null>(null);

const otherStores = computed(() => stores.value.filter((s) => s.id !== currentStoreId.value));
const copySourceName = computed(() => otherStores.value.find((s) => s.id === copySourceId.value)?.name ?? "");

async function runCopyProducts() {
  if (!copySourceId.value || !currentStoreId.value) return;
  copying.value = true;
  copySuccess.value = null;
  try {
    const res = await apiFetch(`/api/stores/${currentStoreId.value}/copy-products`, {
      method: "POST",
      body: JSON.stringify({ sourceStoreId: copySourceId.value }),
    });
    if (!res.ok) return;
    const result = await res.json();
    copySuccess.value = { suppliers: result.suppliersCopied, products: result.productsCopied };
    copyConfirmOpen.value = false;
    copySourceId.value = "";
  } finally {
    copying.value = false;
  }
}
</script>
