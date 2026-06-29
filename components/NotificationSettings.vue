<template>
  <div v-if="supported" class="flex items-center gap-2 px-4 py-2">
    <div v-if="permission === 'granted'" class="flex items-center text-xs text-muted-foreground gap-2">
      <BellRing class="size-3 text-green-500" />
      Notifications on
    </div>
    <div v-else-if="permission === 'denied'" class="flex items-center text-xs text-muted-foreground gap-2">
      <BellOff class="size-3 text-red-500" />
      Notifications blocked
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { BellRing, BellOff } from "lucide-vue-next";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { apiFetch } from "@/lib/apiFetch";

const supported = ref(false);
const permission = ref<NotificationPermission>("default");
const vapidKey = import.meta.env.PUBLIC_ENV__FIREBASE_VAPID_KEY as string | undefined;

onMounted(async () => {
  const messagingSupported = await isSupported().catch(() => false);
  supported.value = messagingSupported && "Notification" in window && "serviceWorker" in navigator;

  if (!supported.value) {
    return;
  }

  permission.value = Notification.permission;

  const messaging = getMessaging();
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title;
    if (!title || Notification.permission !== "granted") return;

    new Notification(title, {
      body: payload.notification?.body,
      icon: "/icon.svg",
    });
  });

  if (permission.value === "granted") {
    await syncToken();
  }
});

async function requestPermission() {
  const result = await Notification.requestPermission();
  permission.value = result;
  if (result === "granted") {
    await syncToken();
  }
}

async function syncToken() {
  try {
    if (!supported.value) return;

    const messaging = getMessaging();
    const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, {
      serviceWorkerRegistration,
      ...(vapidKey ? { vapidKey } : {}),
    });

    if (token) {
      await apiFetch("/api/reservations/subscribe", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      console.log("Push token synced");
    }
  } catch (err) {
    console.error("Failed to sync push token:", err);
  }
}
</script>
