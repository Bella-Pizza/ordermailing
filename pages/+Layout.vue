<!-- https://vike.dev/Layout -->

<template>
  <!-- Public pages (login, register) — no sidebar -->
  <template v-if="isPublicPage">
    <slot />
  </template>

  <!-- Authenticated layout with sidebar -->
  <SidebarProvider v-else-if="!loading" class="h-svh">
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" as-child>
              <a href="/">
                <div
                  class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
                >
                  <Mail class="size-4" />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold">Ordermailing</span>
                  <span class="truncate text-xs text-muted-foreground">Dashboard</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Algemeen</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in nav" :key="item.label">
                <SidebarMenuButton :tooltip="item.label" as-child>
                  <a :href="item.url">
                    <component :is="item.icon" />
                    <span>{{ item.label }}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Beheer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in beheerNav" :key="item.label">
                <SidebarMenuButton :tooltip="item.label" as-child>
                  <a :href="item.url">
                    <component :is="item.icon" />
                    <span>{{ item.label }}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NotificationSettings />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <SidebarMenuButton size="lg" tooltip="Account">
                  <Avatar class="size-8 rounded-lg">
                    <AvatarImage src="" alt="User" />
                    <AvatarFallback class="rounded-lg">{{ avatarInitials }}</AvatarFallback>
                  </Avatar>
                  <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">{{ displayName }}</span>
                    <span class="truncate text-xs text-muted-foreground">{{ displayEmail }}</span>
                  </div>
                  <ChevronsUpDown class="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" class="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <User class="mr-2 size-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem as-child>
                    <a href="/settings" class="flex w-full items-center">
                      <Settings class="mr-2 size-4" />
                      <span>Settings</span>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="handleSignOut">
                  <LogOut class="mr-2 size-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>

    <SidebarInset class="min-w-0">
      <SidebarAutoClose />
      <header class="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="mr-2 h-4" />
        <slot name="header" />
      </header>
      <div class="flex flex-1 flex-col gap-4 overflow-x-hidden p-4">
        <slot />
      </div>
    </SidebarInset>

    <!-- ─── What's new dialog ──────────────────────────────────────────────── -->
    <Dialog v-model:open="whatsNewOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <div class="flex items-center gap-2.5">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
              <Sparkles class="size-4 text-purple-600 dark:text-purple-400" />
            </div>
            <DialogTitle>Wat is er nieuw?</DialogTitle>
          </div>
          <DialogDescription>Hier zijn de laatste updates in Ordermailing.</DialogDescription>
        </DialogHeader>
        <ul class="flex flex-col gap-3 py-1">
          <li v-for="item in WHATS_NEW_ITEMS" :key="item.title" class="flex gap-3">
            <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <component :is="item.icon" class="size-3.5 text-muted-foreground" />
            </div>
            <div>
              <p class="text-sm font-semibold leading-tight">{{ item.title }}</p>
              <p class="text-sm text-muted-foreground">{{ item.description }}</p>
            </div>
          </li>
        </ul>
        <DialogFooter>
          <Button class="w-full" @click="dismissWhatsNew">Begrepen!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ─── Resume draft dialog ───────────────────────────────────────────── -->
    <Dialog v-model:open="resumeOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Bezig met bestellen</DialogTitle>
          <DialogDescription>
            Je hebt een niet-verzonden bestelling voor
            <strong>{{ resumeSupplierName }}</strong
            >. Wil je hiermee doorgaan?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="flex-col gap-2 sm:flex-row">
          <Button variant="outline" class="w-full sm:w-auto" @click="discardDraft">Nee, verwijderen</Button>
          <Button class="w-full sm:w-auto" @click="resumeOrder">Ja, doorgaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SidebarProvider>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import {
  PlusCircle,
  Truck,
  History,
  Bot,
  Mail,
  ChevronsUpDown,
  User,
  Settings,
  LogOut,
  Users,
  Home,
  ClipboardList,
  Film,
  PenTool,
  Calendar,
  Sparkles,
  FileText,
} from "lucide-vue-next";

// ─── What's new ───────────────────────────────────────────────────────────────
// Bump this string with every release that has new features to announce.
const WHATS_NEW_VERSION = "1.1.0";
const WHATS_NEW_ITEMS = [
  {
    icon: Sparkles,
    title: "AI Bestellingstemplate",
    description:
      'Klik op "Generate Template" bij een nieuwe bestelling om automatisch hoeveelheden te laten voorstellen op basis van eerdere bestellingen.',
  },
];
import NotificationSettings from "@/components/NotificationSettings.vue";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  SidebarAutoClose,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { sentryBrowserConfig } from "../sentry.browser.config";
import { useAuth } from "@/lib/useAuth";
import { apiFetch } from "@/lib/apiFetch";
import { useTheme } from "@/lib/useTheme";

sentryBrowserConfig();

const pageContext = usePageContext();
const { currentUser, userRole, loading, signOut } = useAuth();
const { initTheme } = useTheme();

// ─── Auth guard & Role-based Redirection ──────────────────────────────────────
const PUBLIC_PATHS = ["/login", "/register"];
const isPublicPage = computed(() => PUBLIC_PATHS.some((p) => pageContext.urlPathname.startsWith(p)));

watch([loading, userRole], ([isLoading, role]) => {
  if (isLoading || typeof window === "undefined") return;
  const path = window.location.pathname;

  if (!currentUser.value) {
    if (!PUBLIC_PATHS.some((p) => path.startsWith(p))) {
      sessionStorage.setItem("intended_url", path);
      window.location.href = "/login";
    }
    return;
  }

  // Role-based redirection logic

  if (role === "kassa") {
    if (path !== "/reservations") {
      window.location.href = "/reservations";
    }
  } else if (role === "user") {
    // Prevent standard users from accessing restricted areas (optional but safer)
    const allowedForUser = ["/", "/orders/new", "/orders", "/reservations", "/automaten", "/settings"];
    const isRestricted = !allowedForUser.some(
      (allowed) => path === allowed || (allowed !== "/" && path.startsWith(allowed)),
    );
    if (isRestricted) {
      window.location.href = "/";
    }
  }
});

async function handleSignOut() {
  await signOut();
  window.location.href = "/login";
}

// ─── User display ─────────────────────────────────────────────────────────────
const displayName = computed(() => currentUser.value?.displayName ?? currentUser.value?.email ?? "User");
const displayEmail = computed(() => currentUser.value?.email ?? "");
const avatarInitials = computed(() => {
  const name = currentUser.value?.displayName ?? currentUser.value?.email ?? "U";
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
});

const allNav = [
  { label: "Home", url: "/", icon: Home },
  { label: "Create order", url: "/orders/new", icon: PlusCircle },
  { label: "Orders", url: "/orders", icon: ClipboardList },
  { label: "Reservaties", url: "/reservations", icon: Calendar },
  { label: "Sollicitaties", url: "/sollicitaties", icon: FileText },
  { label: "Suppliers", url: "/suppliers", icon: Truck },
  { label: "History", url: "/history", icon: History },
  { label: "Automaten", url: "/automaten", icon: Bot },
  { label: "Video Creator", url: "/video", icon: Film },
  { label: "Design Editor", url: "/design", icon: PenTool },
];

const nav = computed(() => {
  const role = userRole.value?.toLowerCase();
  if (role === "admin") return allNav;
  if (role === "kassa") return [{ label: "Reservaties", url: "/reservations", icon: Calendar }];

  // Standard user: Home, Create order, Orders, Reservaties, Automaten
  const allowedLabels = ["Home", "Create order", "Orders", "Reservaties", "Automaten"];
  return allNav.filter((item) => allowedLabels.includes(item.label));
});

const beheerNav = computed(() => {
  if (userRole.value?.toLowerCase() === "admin") return [{ label: "Users", url: "/users", icon: Users }];
  return [];
});

// ─── What's new ───────────────────────────────────────────────────────────────
const WHATS_NEW_LS_KEY = "whats_new_dismissed";
const whatsNewOpen = ref(false);

function dismissWhatsNew() {
  whatsNewOpen.value = false;
  localStorage.setItem(WHATS_NEW_LS_KEY, WHATS_NEW_VERSION);
}

// ─── Resume draft ─────────────────────────────────────────────────────────────
const resumeOpen = ref(false);
const resumeSupplierName = ref("");

onMounted(() => {
  initTheme();
  if (localStorage.getItem(WHATS_NEW_LS_KEY) !== WHATS_NEW_VERSION) {
    whatsNewOpen.value = true;
  }
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/orders/new") return;
  const raw = localStorage.getItem("order_draft");
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft?.supplierName) {
      resumeSupplierName.value = draft.supplierName;
      resumeOpen.value = true;
    }
  } catch {
    /* ignore */
  }
});

function resumeOrder() {
  resumeOpen.value = false;
  sessionStorage.setItem("order_resume", "1");
  window.location.href = "/orders/new";
}

async function discardDraft() {
  resumeOpen.value = false;
  try {
    const raw = localStorage.getItem("order_draft");
    if (raw) {
      const draft = JSON.parse(raw);
      if (draft?.draftId) {
        await apiFetch(`/api/orders/${draft.draftId}`, { method: "DELETE" });
      }
    }
  } catch {
    /* ignore */
  }
  localStorage.removeItem("order_draft");
}
</script>
