<template>
  <div class="flex min-h-svh items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"
        >
          <Mail class="size-6" />
        </div>
        <h1 class="text-2xl font-bold">{{ t('register.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('register.subtitle') }}</p>
      </div>

      <div
        v-if="tokenError"
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {{ tokenError }}
      </div>

      <form v-else class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="email">{{ t('register.email') }}</label>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            :disabled="submitting"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="name">{{ t('register.name') }}</label>
          <Input id="name" v-model="name" type="text" placeholder="John Doe" required :disabled="submitting" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="password">{{ t('register.password') }}</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            required
            minlength="8"
            :disabled="submitting"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="confirm">{{ t('register.confirmPassword') }}</label>
          <Input
            id="confirm"
            v-model="confirmPassword"
            type="password"
            placeholder="••••••••"
            required
            :disabled="submitting"
          />
          <p v-if="passwordMismatch" class="text-xs text-destructive">{{ t('register.passwordMismatch') }}</p>
        </div>

        <div
          v-if="submitError"
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {{ submitError }}
        </div>

        <Button type="submit" class="w-full" :disabled="submitting || tokenLoading">
          <Loader2 v-if="submitting" class="mr-2 size-4 animate-spin" />
          {{ t('register.submit') }}
        </Button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Mail, Loader2 } from "lucide-vue-next";
import { signInWithCustomToken } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
import { useLocale } from "@/lib/useLocale";

const { t } = useLocale();

const token = ref("");

const email = ref("");
const name = ref("");
const password = ref("");
const confirmPassword = ref("");

const tokenLoading = ref(true);
const tokenError = ref("");
const submitting = ref(false);
const submitError = ref("");

const passwordMismatch = computed(() => confirmPassword.value.length > 0 && password.value !== confirmPassword.value);

onMounted(async () => {
  token.value = new URLSearchParams(window.location.search).get("token") ?? "";

  if (!token.value) {
    tokenError.value = t("register.noToken");
    tokenLoading.value = false;
    return;
  }
  try {
    const res = await fetch(`/api/users/invite/${token.value}`);
    if (!res.ok) throw new Error();
  } catch {
    tokenError.value = t("register.invalidToken");
  } finally {
    tokenLoading.value = false;
  }
});

async function handleSubmit() {
  if (passwordMismatch.value) return;
  submitting.value = true;
  submitError.value = "";
  try {
    const res = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.value, name: name.value, email: email.value, password: password.value }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? t("register.failed"));
    }
    const data = await res.json();
    // Sign in with the custom token returned by the backend
    await signInWithCustomToken(auth, data.customToken);
    window.location.href = "/";
  } catch (err: any) {
    submitError.value = err.message ?? t("register.unexpected");
  } finally {
    submitting.value = false;
  }
}
</script>
