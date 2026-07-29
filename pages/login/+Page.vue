<template>
  <div class="flex min-h-svh items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm">
      <!-- Logo / branding -->
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"
        >
          <Mail class="size-6" />
        </div>
        <h1 class="text-2xl font-bold">{{ t('login.welcome') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('login.subtitle') }}</p>
      </div>

      <!-- Login form -->
      <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="email">{{ t('login.email') }}</label>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
            :disabled="loading"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="password">{{ t('login.password') }}</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            required
            :disabled="loading"
          />
        </div>

        <div
          v-if="error"
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {{ error }}
        </div>

        <Button type="submit" class="w-full" :disabled="loading">
          <Loader2 v-if="loading" class="mr-2 size-4 animate-spin" />
          {{ t('login.signIn') }}
        </Button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Mail, Loader2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import { useLocale } from "@/lib/useLocale";

const { signIn, currentUser } = useAuth();
const { t } = useLocale();

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

// If already logged in, redirect away from login page
onMounted(() => {
  if (currentUser.value) {
    redirect();
  }
});

function redirect() {
  const intended = sessionStorage.getItem("intended_url") ?? "/";
  sessionStorage.removeItem("intended_url");
  window.location.href = intended;
}

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await signIn(email.value, password.value);
    redirect();
  } catch (err: any) {
    const code = err?.code ?? "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      error.value = t("login.error.invalidCredential");
    } else if (code === "auth/too-many-requests") {
      error.value = t("login.error.tooManyRequests");
    } else {
      error.value = t("login.error.unexpected");
    }
  } finally {
    loading.value = false;
  }
}
</script>
