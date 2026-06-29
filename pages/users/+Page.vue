<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Users</h1>
          <p class="text-muted-foreground text-sm">Manage who has access to this application.</p>
        </div>
        <Button :disabled="inviteGenerating" @click="generateInvite">
          <Loader2 v-if="inviteGenerating" class="mr-2 size-4 animate-spin" />
          <UserPlus v-else class="mr-2 size-4" />
          Add user
        </Button>
      </div>

      <!-- Users table -->
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Added</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="!loading && users.length === 0">
            <TableCell colspan="5" class="py-8 text-center text-muted-foreground">No users found.</TableCell>
          </TableRow>
          <TableRow v-for="user in users" :key="user.id">
            <TableCell class="font-medium">{{ user.name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ user.email }}</TableCell>
            <TableCell>
              <DropdownMenu>
                <div class="w-fit" @mouseenter="hoveredUserId = user.id" @mouseleave="hoveredUserId = null">
                  <DropdownMenuTrigger
                    :disabled="user.id === currentUser?.uid"
                    class="flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-muted disabled:pointer-events-none outline-none"
                  >
                    <Badge :variant="user.role === 'admin' ? 'default' : 'secondary'">
                      {{ user.role }}
                    </Badge>
                    <ChevronsUpDown
                      v-if="user.id !== currentUser?.uid"
                      class="size-3.5 text-muted-foreground transition-opacity"
                      :class="hoveredUserId === user.id ? 'opacity-100' : 'opacity-0'"
                    />
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    v-for="r in roles"
                    :key="r"
                    class="flex items-center gap-2"
                    :class="{ 'font-medium': user.role === r }"
                    @click="changeRole(user, r)"
                  >
                    <Check v-if="user.role === r" class="size-3.5" />
                    <span v-else class="size-3.5" />
                    {{ r }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ formatDate(user.createdAt) }}</TableCell>
            <TableCell class="text-right">
              <Button v-if="user.id !== currentUser?.uid" variant="ghost" size="icon" @click="confirmDelete(user)">
                <Trash2 class="size-4 text-muted-foreground" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </TopLoader>

  <!-- Delete confirmation — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="deleteOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" class="sm:max-w-sm">
      <component :is="isDesktop ? DialogHeader : DrawerHeader">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">Remove user</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          Are you sure you want to remove
          <span class="font-medium text-foreground">{{ deleteTarget?.name }}</span>
          (<span class="text-foreground">{{ deleteTarget?.email }}</span
          >)? This action cannot be undone.
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-4 pb-4']">
        <Button variant="outline" :disabled="deleting" @click="deleteOpen = false">Cancel</Button>
        <Button variant="destructive" :disabled="deleting" @click="executeDelete">
          <Loader2 v-if="deleting" class="mr-2 size-4 animate-spin" />
          Remove
        </Button>
      </component>
    </component>
  </component>

  <!-- Invite link dialog -->
  <Dialog v-model:open="inviteOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Registration link</DialogTitle>
        <DialogDescription>
          Share this link with the person you want to invite. It can only be used once.
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-2">
        <div class="flex items-center gap-2">
          <Input :model-value="inviteLink" readonly class="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" @click="copyLink">
            <Check v-if="copied" class="size-4 text-green-500" />
            <Copy v-else class="size-4" />
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">The link expires as soon as it is used to register.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeInviteDialog">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { UserPlus, Trash2, Copy, Check, Loader2, ChevronsUpDown } from "lucide-vue-next";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/lib/useAuth";
import { useLocale } from "@/lib/useLocale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "kassa";
  createdAt: string;
}

const { currentUser, loading: authLoading } = useAuth();
const { locale } = useLocale();
const isDesktop = useMediaQuery("(min-width: 768px)");

const roles = ["admin", "user", "kassa"] as const;
type Role = (typeof roles)[number];

const users = ref<AppUser[]>([]);
const loading = ref(true);

const inviteOpen = ref(false);
const inviteGenerating = ref(false);
const inviteLink = ref("");
const copied = ref(false);

const hoveredUserId = ref<string | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<AppUser | null>(null);
const deleting = ref(false);

// Wait for Firebase auth to resolve before fetching — prevents 401 on hard refresh
watch(
  authLoading,
  (isLoading) => {
    if (!isLoading) fetchUsers();
  },
  { immediate: true },
);

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await apiFetch("/api/users");
    users.value = await res.json();
  } catch {
    users.value = [];
  } finally {
    loading.value = false;
  }
}

async function generateInvite() {
  inviteGenerating.value = true;
  try {
    const res = await apiFetch("/api/users/invite", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? "Failed to create invite");
    }
    const data = await res.json();
    inviteLink.value = `${window.location.origin}/register?token=${data.token}`;
    inviteOpen.value = true;
  } finally {
    inviteGenerating.value = false;
  }
}

async function copyLink() {
  await navigator.clipboard.writeText(inviteLink.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

function closeInviteDialog() {
  inviteOpen.value = false;
  inviteLink.value = "";
  copied.value = false;
}

async function changeRole(user: AppUser, role: Role) {
  if (user.role === role) return;
  user.role = role; // optimistic update
  try {
    await apiFetch(`/api/users/${user.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  } catch {
    await fetchUsers(); // revert on failure
  }
}

function confirmDelete(user: AppUser) {
  deleteTarget.value = user;
  deleteOpen.value = true;
}

async function executeDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await apiFetch(`/api/users/${deleteTarget.value.id}`, { method: "DELETE" });
    deleteOpen.value = false;
    deleteTarget.value = null;
    await fetchUsers();
  } finally {
    deleting.value = false;
  }
}

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(locale.value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
</script>
