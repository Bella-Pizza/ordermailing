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
  </div>

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
import { ref, onMounted } from "vue";
import { FileJson, Upload, Loader2, CheckCircle, Sun, Moon } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/useTheme";
import { useNolanMode } from "@/lib/useNolanMode";
import { useLocale } from "@/lib/useLocale";
import { useAuth } from "@/lib/useAuth";
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
const { currentUser } = useAuth();

// ─── Profile ──────────────────────────────────────────────────────────────────
const profileName = ref("");
const profileSaving = ref(false);
const profileSuccess = ref(false);
const profileError = ref("");

onMounted(() => {
  profileName.value = currentUser.value?.displayName ?? "";
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
</script>
