<template>
  <TopLoader :loading="loading">
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ t('suppliers.title') }}</h1>
          <p class="text-muted-foreground text-sm">{{ t('suppliers.subtitle') }}</p>
        </div>
        <Button @click="openAddSupplier">
          <Plus class="mr-2 size-4" />
          {{ t('suppliers.add') }}
        </Button>
      </div>

      <!-- Search bar -->
      <div class="relative max-w-sm">
        <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="searchQuery" :placeholder="t('suppliers.search')" class="pl-9" />
      </div>

      <!-- Mobile: card list -->
      <div class="flex flex-col gap-3 md:hidden">
        <div v-if="!loading && filteredSuppliers.length === 0" class="py-8 text-center text-sm text-muted-foreground">
          {{ searchQuery ? t('suppliers.noMatch') : t('suppliers.empty') }}
        </div>
        <div v-for="supplier in filteredSuppliers" :key="supplier.id" class="rounded-lg border bg-card p-4 shadow-sm">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ supplier.name }}</p>
              <p class="truncate text-sm text-muted-foreground">{{ supplier.email }}</p>
            </div>
            <Badge :variant="supplier.isActive ? 'default' : 'secondary'" class="shrink-0">
              {{ supplier.isActive ? t('suppliers.status.active') : t('suppliers.status.inactive') }}
            </Badge>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" class="gap-1.5 px-2" @click="openProductsSheet(supplier)">
              <Package class="size-3.5" />
              {{ supplier.productCount }} {{ supplier.productCount === 1 ? t('suppliers.productWord') : t('suppliers.productWordPlural') }}
            </Button>
            <div class="flex gap-1">
              <Button variant="ghost" size="icon" @click="openEditSupplier(supplier)">
                <Pencil class="size-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" @click="confirmDeleteSupplier(supplier)">
                <Trash2 class="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop: table -->
      <Table class="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button variant="ghost" size="sm" class="-ml-3 h-8 gap-1" @click="toggleSort('name')">
                {{ t('suppliers.table.name') }}
                <ArrowUpDown v-if="sortKey !== 'name'" class="size-3.5 text-muted-foreground" />
                <ArrowUp v-else-if="sortDir === 'asc'" class="size-3.5" />
                <ArrowDown v-else class="size-3.5" />
              </Button>
            </TableHead>
            <TableHead>{{ t('suppliers.table.email') }}</TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" class="-ml-3 h-8 gap-1" @click="toggleSort('isActive')">
                {{ t('suppliers.table.status') }}
                <ArrowUpDown v-if="sortKey !== 'isActive'" class="size-3.5 text-muted-foreground" />
                <ArrowUp v-else-if="sortDir === 'asc'" class="size-3.5" />
                <ArrowDown v-else class="size-3.5" />
              </Button>
            </TableHead>
            <TableHead>{{ t('suppliers.table.products') }}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="!loading && filteredSuppliers.length === 0">
            <TableCell colspan="5" class="py-8 text-center text-muted-foreground">
              {{ searchQuery ? t('suppliers.noMatch') : t('suppliers.empty') }}
            </TableCell>
          </TableRow>
          <TableRow v-for="supplier in filteredSuppliers" :key="supplier.id">
            <TableCell class="font-medium">{{ supplier.name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ supplier.email }}</TableCell>
            <TableCell>
              <Badge :variant="supplier.isActive ? 'default' : 'secondary'">
                {{ supplier.isActive ? t('suppliers.status.active') : t('suppliers.status.inactive') }}
              </Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="openProductsSheet(supplier)">
                <Package class="size-3.5" />
                {{ supplier.productCount }}
              </Button>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" @click="openEditSupplier(supplier)">
                  <Pencil class="size-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" @click="confirmDeleteSupplier(supplier)">
                  <Trash2 class="size-4 text-muted-foreground" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </TopLoader>

  <!-- Add / Edit supplier — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="supplierFormOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-md' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">
          {{ editingSupplier ? t('suppliers.editTitle') : t('suppliers.addTitle') }}
        </component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          {{ editingSupplier ? t('suppliers.editDesc') : t('suppliers.addDesc') }}
        </component>
      </component>
      <div :class="['flex flex-col gap-4 py-2', !isDesktop && 'px-6']">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.form.name') }}</label>
          <Input v-model="supplierForm.name" placeholder="Supplier name" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.form.email') }}</label>
          <Input v-model="supplierForm.email" type="email" placeholder="supplier@example.com" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox id="supplier-active" v-model="supplierForm.isActive" />
          <label for="supplier-active" class="cursor-pointer text-sm font-medium">{{ t('suppliers.form.active') }}</label>
        </div>
      </div>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" :disabled="supplierSaving" @click="supplierFormOpen = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="supplierSaving" @click="saveSupplier">
          <Loader2 v-if="supplierSaving" class="mr-2 size-4 animate-spin" />
          {{ editingSupplier ? t('common.save') : t('common.add') }}
        </Button>
      </component>
    </component>
  </component>

  <!-- Delete supplier — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="deleteSupplierOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-sm' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">{{ t('suppliers.delete.title') }}</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          {{ t('suppliers.delete.description', { name: deleteSupplierTarget?.name ?? '' }) }}
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" :disabled="deletingSupplier" @click="deleteSupplierOpen = false">{{ t('common.cancel') }}</Button>
        <Button variant="destructive" :disabled="deletingSupplier" @click="executeDeleteSupplier">
          <Loader2 v-if="deletingSupplier" class="mr-2 size-4 animate-spin" />
          {{ t('suppliers.delete.confirm') }}
        </Button>
      </component>
    </component>
  </component>

  <!-- Products sheet -->
  <Sheet v-model:open="productsSheetOpen">
    <SheetContent class="flex w-full flex-col gap-0 overflow-hidden sm:max-w-3xl" side="right">
      <SheetHeader class="border-b px-6 pb-4">
        <SheetTitle>{{ selectedSupplier?.name }}</SheetTitle>
        <SheetDescription>{{ t('suppliers.products.subtitle') }}</SheetDescription>
      </SheetHeader>

      <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-6">
        <!-- Toolbar -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="relative flex-1 sm:max-w-xs">
            <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="productSearch" :placeholder="t('suppliers.products.search')" class="pl-9" />
          </div>
          <div class="flex items-center gap-3">
            <span v-if="savingOrder" class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 class="size-3 animate-spin" /> {{ t('suppliers.products.saving') }}
            </span>
            <p v-else class="text-sm text-muted-foreground">
              {{ productSearch ? `${filteredProducts.length} ${t('suppliers.productOf')} ${products.length}` : products.length }}
              {{ products.length === 1 ? t('suppliers.productWord') : t('suppliers.productWordPlural') }}
            </p>
            <Button size="sm" variant="outline" class="hidden md:flex" :disabled="productsLoading" @click="openMatrixEdit">
              <LayoutGrid class="mr-1.5 size-3.5" />
              {{ t('suppliers.products.matrixEdit') }}
            </Button>
            <Button size="sm" @click="openAddProduct">
              <Plus class="mr-1.5 size-3.5" />
              {{ t('suppliers.products.add') }}
            </Button>
          </div>
        </div>

        <!-- Mobile: draggable product cards -->
        <draggable
          v-model="products"
          item-key="id"
          class="flex flex-col gap-3 md:hidden"
          handle=".drag-handle"
          :disabled="!!productSearch"
          @end="onDragEnd"
        >
          <template #header>
            <div v-if="productsLoading" class="py-6 text-center text-sm text-muted-foreground">{{ t('suppliers.products.loading') }}</div>
            <div v-else-if="products.length === 0" class="py-6 text-center text-sm text-muted-foreground">
              {{ t('suppliers.products.empty') }}
            </div>
            <div
              v-else-if="productSearch && filteredProducts.length === 0"
              class="py-6 text-center text-sm text-muted-foreground"
            >
              {{ t('suppliers.products.noMatch') }}
            </div>
          </template>
          <template #item="{ element: product }">
            <div v-show="matchesSearch(product)" class="rounded-lg border bg-card p-4 shadow-sm">
              <div class="flex items-start gap-2">
                <button
                  class="drag-handle mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-opacity"
                  :class="productSearch ? 'cursor-default opacity-30' : 'cursor-grab hover:text-foreground'"
                >
                  <GripVertical class="size-4" />
                </button>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ product.internalName }}</p>
                  <p class="truncate text-sm text-muted-foreground">{{ product.supplierName }}</p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" class="size-8" @click="openEditProduct(product)">
                    <Pencil class="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" class="size-8" @click="confirmDeleteProduct(product)">
                    <Trash2 class="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2 text-sm">
                <div class="text-muted-foreground">
                  {{ t('suppliers.products.stock') }} <span class="font-medium text-foreground">{{ product.idealStock }}</span>
                </div>
                <div class="text-muted-foreground">
                  {{ t('suppliers.products.order') }} <span class="font-medium text-foreground">{{ product.displayOrder }}</span>
                </div>
                <Badge :variant="product.manualOrder ? 'default' : 'secondary'" class="text-xs">
                  {{ product.manualOrder ? t('suppliers.products.manual') : t('suppliers.products.automatic') }}
                </Badge>
                <Badge :variant="product.isActive ? 'default' : 'secondary'" class="text-xs">
                  {{ product.isActive ? t('suppliers.status.active') : t('suppliers.status.inactive') }}
                </Badge>
              </div>
            </div>
          </template>
        </draggable>

        <!-- Desktop: draggable product table -->
        <Table class="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead class="w-8" />
              <TableHead>{{ t('suppliers.products.col.supplierName') }}</TableHead>
              <TableHead>{{ t('suppliers.products.col.ourName') }}</TableHead>
              <TableHead>{{ t('suppliers.products.col.idealStock') }}</TableHead>
              <TableHead>{{ t('suppliers.products.col.manual') }}</TableHead>
              <TableHead>{{ t('suppliers.products.col.status') }}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <draggable
            v-model="products"
            item-key="id"
            tag="tbody"
            class="[&_tr:last-child]:border-0"
            handle=".drag-handle"
            :disabled="!!productSearch"
            @end="onDragEnd"
          >
            <template #header>
              <tr v-if="productsLoading">
                <td colspan="7" class="p-4 text-center text-sm text-muted-foreground">{{ t('suppliers.products.loading') }}</td>
              </tr>
              <tr v-else-if="products.length === 0">
                <td colspan="7" class="p-4 text-center text-sm text-muted-foreground">{{ t('suppliers.products.empty') }}</td>
              </tr>
              <tr v-else-if="productSearch && filteredProducts.length === 0">
                <td colspan="7" class="p-4 text-center text-sm text-muted-foreground">
                  {{ t('suppliers.products.noMatch') }}
                </td>
              </tr>
            </template>
            <template #item="{ element: product }">
              <tr v-show="matchesSearch(product)" class="border-b transition-colors hover:bg-muted/50">
                <td class="w-8 p-2 pl-4">
                  <GripVertical
                    class="drag-handle size-4 text-muted-foreground transition-opacity"
                    :class="productSearch ? 'cursor-default opacity-30' : 'cursor-grab'"
                  />
                </td>
                <td class="p-4 align-middle font-medium">{{ product.supplierName }}</td>
                <td class="p-4 align-middle text-muted-foreground">{{ product.internalName }}</td>
                <td class="p-4 align-middle">{{ product.idealStock }}</td>
                <td class="p-4 align-middle">
                  <Badge :variant="product.manualOrder ? 'default' : 'secondary'">
                    {{ product.manualOrder ? t('suppliers.products.yes') : t('suppliers.products.no') }}
                  </Badge>
                </td>
                <td class="p-4 align-middle">
                  <Badge :variant="product.isActive ? 'default' : 'secondary'">
                    {{ product.isActive ? t('suppliers.status.active') : t('suppliers.status.inactive') }}
                  </Badge>
                </td>
                <td class="p-4 align-middle text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" @click="openEditProduct(product)">
                      <Pencil class="size-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" @click="confirmDeleteProduct(product)">
                      <Trash2 class="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </td>
              </tr>
            </template>
          </draggable>
        </Table>
      </div>
    </SheetContent>
  </Sheet>

  <!-- Add / Edit product — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="productFormOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-lg' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">
          {{ editingProduct ? t('suppliers.product.editTitle') : t('suppliers.product.addTitle') }}
        </component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          {{ editingProduct ? t('suppliers.product.editDesc') : t('suppliers.product.addDesc') }}
        </component>
      </component>
      <div :class="['grid gap-4 py-2', isDesktop ? 'grid-cols-2' : 'grid-cols-1 px-6 pb-2']">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.product.form.supplierName') }}</label>
          <Input v-model="productForm.supplierName" placeholder="Name on supplier's list" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.product.form.ourName') }}</label>
          <Input v-model="productForm.internalName" placeholder="Internal name" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.product.form.displayOrder') }}</label>
          <Input v-model.number="productForm.displayOrder" type="number" min="0" placeholder="0" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">{{ t('suppliers.product.form.idealStock') }}</label>
          <Input v-model.number="productForm.idealStock" type="number" min="0" placeholder="0" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox id="product-manual" v-model="productForm.manualOrder" />
          <label for="product-manual" class="cursor-pointer text-sm font-medium">{{ t('suppliers.product.form.manualOrder') }}</label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox id="product-active" v-model="productForm.isActive" />
          <label for="product-active" class="cursor-pointer text-sm font-medium">{{ t('suppliers.product.form.active') }}</label>
        </div>
      </div>
      <p v-if="productSaveError" :class="['text-sm text-destructive', !isDesktop && 'px-6']">{{ productSaveError }}</p>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" :disabled="productSaving" @click="productFormOpen = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="productSaving" @click="saveProduct">
          <Loader2 v-if="productSaving" class="mr-2 size-4 animate-spin" />
          {{ editingProduct ? t('common.save') : t('common.add') }}
        </Button>
      </component>
    </component>
  </component>

  <!-- Matrix Edit Dialog (desktop only) -->
  <Dialog v-model:open="matrixEditOpen">
    <DialogContent class="flex max-h-[90vh] flex-col sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ t('suppliers.products.matrixEdit') }} — {{ selectedSupplier?.name }}</DialogTitle>
        <DialogDescription>{{ t('suppliers.products.matrixDesc') }}</DialogDescription>
      </DialogHeader>
      <div class="flex-1 overflow-auto rounded border">
        <table class="w-full text-sm">
          <thead class="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr class="border-b">
              <th class="w-8 p-2" />
              <th class="p-2 text-left font-medium text-muted-foreground">{{ t('suppliers.products.col.supplierName') }}</th>
              <th class="p-2 text-left font-medium text-muted-foreground">{{ t('suppliers.products.col.ourName') }}</th>
              <th class="p-2 text-left font-medium text-muted-foreground">{{ t('suppliers.products.col.idealStock') }}</th>
              <th class="p-2 text-center font-medium text-muted-foreground">{{ t('suppliers.products.col.manual') }}</th>
              <th class="p-2 text-center font-medium text-muted-foreground">{{ t('suppliers.product.form.active') }}</th>
            </tr>
          </thead>
          <draggable
            v-model="matrixRows"
            item-key="id"
            tag="tbody"
            handle=".matrix-drag-handle"
            @end="onMatrixDragEnd"
          >
            <template #header>
              <tr v-if="matrixRows.length === 0">
                <td colspan="6" class="p-4 text-center text-muted-foreground">{{ t('suppliers.products.empty') }}</td>
              </tr>
            </template>
            <template #item="{ element: row, index: i }">
              <tr class="border-b last:border-0 hover:bg-muted/30">
                <td class="w-8 p-2 pl-3">
                  <GripVertical class="matrix-drag-handle size-4 cursor-grab text-muted-foreground" />
                </td>
                <td class="p-1"><Input v-model="matrixRows[i].supplierName" class="h-8 text-sm" /></td>
                <td class="p-1"><Input v-model="matrixRows[i].internalName" class="h-8 text-sm" /></td>
                <td class="p-1"><Input v-model.number="matrixRows[i].idealStock" type="number" min="0" class="h-8 w-24 text-sm" /></td>
                <td class="p-1 text-center"><Checkbox v-model="matrixRows[i].manualOrder" /></td>
                <td class="p-1 text-center"><Checkbox v-model="matrixRows[i].isActive" /></td>
              </tr>
            </template>
          </draggable>
        </table>
      </div>
      <DialogFooter class="mt-2">
        <Button variant="outline" :disabled="matrixSaving" @click="matrixEditOpen = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="matrixSaving" @click="saveMatrixEdit">
          <Loader2 v-if="matrixSaving" class="mr-2 size-4 animate-spin" />
          {{ t('suppliers.products.matrixSaveAll') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Delete product — Dialog on desktop, Drawer on mobile -->
  <component :is="isDesktop ? Dialog : Drawer" v-model:open="deleteProductOpen">
    <component :is="isDesktop ? DialogContent : DrawerContent" :class="isDesktop ? 'sm:max-w-sm' : ''">
      <component :is="isDesktop ? DialogHeader : DrawerHeader" :class="!isDesktop && 'px-6 text-left'">
        <component :is="isDesktop ? DialogTitle : DrawerTitle">{{ t('suppliers.product.delete.title') }}</component>
        <component :is="isDesktop ? DialogDescription : DrawerDescription">
          {{ t('suppliers.product.delete.description', { name: deleteProductTarget?.internalName ?? '' }) }}
        </component>
      </component>
      <component :is="isDesktop ? DialogFooter : DrawerFooter" :class="['mt-2', !isDesktop && 'px-6 pb-6']">
        <Button variant="outline" :disabled="deletingProduct" @click="deleteProductOpen = false">{{ t('common.cancel') }}</Button>
        <Button variant="destructive" :disabled="deletingProduct" @click="executeDeleteProduct">
          <Loader2 v-if="deletingProduct" class="mr-2 size-4 animate-spin" />
          {{ t('suppliers.product.delete.confirm') }}
        </Button>
      </component>
    </component>
  </component>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import draggable from "vuedraggable";
import TopLoader from "@/components/ui/top-loader/TopLoader.vue";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Package,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  LayoutGrid,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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

const { t } = useLocale();

interface Supplier {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

interface Product {
  id: string;
  supplierName: string;
  internalName: string;
  manualOrder: boolean;
  isActive: boolean;
  idealStock: number;
  displayOrder: number;
}

const { loading: authLoading } = useAuth();
const isDesktop = useMediaQuery("(min-width: 768px)");

// ─── Suppliers ────────────────────────────────────────────────────────────────
const suppliers = ref<Supplier[]>([]);
const loading = ref(true);

const sortKey = ref<"name" | "isActive" | null>("isActive");
const searchQuery = ref("");
const sortDir = ref<"asc" | "desc">("desc");

function toggleSort(key: "name" | "isActive") {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "isActive" ? "desc" : "asc";
  }
}

const filteredSuppliers = computed(() => {
  let list = suppliers.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }

  if (sortKey.value) {
    const key = sortKey.value;
    const dir = sortDir.value === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (key === "isActive") {
        return (Number(b.isActive) - Number(a.isActive)) * dir;
      }
      return a[key].localeCompare(b[key]) * dir;
    });
  }

  return list;
});

const supplierFormOpen = ref(false);
const editingSupplier = ref<Supplier | null>(null);
const supplierSaving = ref(false);
const supplierForm = reactive({ name: "", email: "", isActive: true });

const deleteSupplierOpen = ref(false);
const deleteSupplierTarget = ref<Supplier | null>(null);
const deletingSupplier = ref(false);

// ─── Products ─────────────────────────────────────────────────────────────────
const productsSheetOpen = ref(false);
const selectedSupplier = ref<Supplier | null>(null);
const products = ref<Product[]>([]);
const productsLoading = ref(false);
const savingOrder = ref(false);
const productSearch = ref("");

function matchesSearch(product: Product): boolean {
  if (!productSearch.value) return true;
  const q = productSearch.value.toLowerCase();
  return product.internalName.toLowerCase().includes(q) || product.supplierName.toLowerCase().includes(q);
}

const filteredProducts = computed(() => (productSearch.value ? products.value.filter(matchesSearch) : products.value));

async function onDragEnd() {
  if (!selectedSupplier.value) return;
  savingOrder.value = true;
  try {
    await Promise.all(
      products.value.map((p, i) =>
        apiFetch(`/api/suppliers/${selectedSupplier.value!.id}/products/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({ displayOrder: i }),
        }),
      ),
    );
    products.value = products.value.map((p, i) => ({ ...p, displayOrder: i }));
  } finally {
    savingOrder.value = false;
  }
}

const productFormOpen = ref(false);
const editingProduct = ref<Product | null>(null);
const productSaving = ref(false);
const productSaveError = ref("");
const productForm = reactive({
  supplierName: "",
  internalName: "",
  manualOrder: false,
  isActive: true,
  idealStock: 0,
  displayOrder: 0,
});

const deleteProductOpen = ref(false);
const deleteProductTarget = ref<Product | null>(null);
const deletingProduct = ref(false);

// ─── Init ─────────────────────────────────────────────────────────────────────
watch(
  authLoading,
  (isLoading) => {
    if (!isLoading) fetchSuppliers();
  },
  { immediate: true },
);

// ─── Supplier CRUD ────────────────────────────────────────────────────────────
async function fetchSuppliers() {
  loading.value = true;
  try {
    const res = await apiFetch("/api/suppliers");
    suppliers.value = await res.json();
  } catch {
    suppliers.value = [];
  } finally {
    loading.value = false;
  }
}

function openAddSupplier() {
  editingSupplier.value = null;
  supplierForm.name = "";
  supplierForm.email = "";
  supplierForm.isActive = true;
  supplierFormOpen.value = true;
}

function openEditSupplier(supplier: Supplier) {
  editingSupplier.value = supplier;
  supplierForm.name = supplier.name;
  supplierForm.email = supplier.email;
  supplierForm.isActive = supplier.isActive;
  supplierFormOpen.value = true;
}

async function saveSupplier() {
  if (!supplierForm.name || !supplierForm.email) return;
  supplierSaving.value = true;
  try {
    if (editingSupplier.value) {
      await apiFetch(`/api/suppliers/${editingSupplier.value.id}`, {
        method: "PATCH",
        body: JSON.stringify(supplierForm),
      });
    } else {
      await apiFetch("/api/suppliers", {
        method: "POST",
        body: JSON.stringify(supplierForm),
      });
    }
    supplierFormOpen.value = false;
    await fetchSuppliers();
  } finally {
    supplierSaving.value = false;
  }
}

function confirmDeleteSupplier(supplier: Supplier) {
  deleteSupplierTarget.value = supplier;
  deleteSupplierOpen.value = true;
}

async function executeDeleteSupplier() {
  if (!deleteSupplierTarget.value) return;
  deletingSupplier.value = true;
  try {
    await apiFetch(`/api/suppliers/${deleteSupplierTarget.value.id}`, { method: "DELETE" });
    deleteSupplierOpen.value = false;
    deleteSupplierTarget.value = null;
    await fetchSuppliers();
  } finally {
    deletingSupplier.value = false;
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────
async function openProductsSheet(supplier: Supplier) {
  selectedSupplier.value = supplier;
  productSearch.value = "";
  productsSheetOpen.value = true;
  await fetchProducts(supplier.id);
}

async function fetchProducts(supplierId: string) {
  productsLoading.value = true;
  try {
    const res = await apiFetch(`/api/suppliers/${supplierId}/products`);
    products.value = await res.json();
  } catch {
    products.value = [];
  } finally {
    productsLoading.value = false;
  }
}

function openAddProduct() {
  editingProduct.value = null;
  productForm.supplierName = "";
  productForm.internalName = "";
  productForm.manualOrder = false;
  productForm.isActive = true;
  productForm.idealStock = 0;
  productForm.displayOrder = 0;
  productSaveError.value = "";
  productFormOpen.value = true;
}

function openEditProduct(product: Product) {
  editingProduct.value = product;
  productForm.supplierName = product.supplierName;
  productForm.internalName = product.internalName;
  productForm.manualOrder = product.manualOrder;
  productForm.isActive = product.isActive;
  productForm.idealStock = product.idealStock;
  productForm.displayOrder = product.displayOrder;
  productSaveError.value = "";
  productFormOpen.value = true;
}

async function saveProduct() {
  if (!productForm.supplierName || !productForm.internalName || !selectedSupplier.value) return;
  productSaving.value = true;
  productSaveError.value = "";
  try {
    if (editingProduct.value) {
      const res = await apiFetch(`/api/suppliers/${selectedSupplier.value.id}/products/${editingProduct.value.id}`, {
        method: "PATCH",
        body: JSON.stringify(productForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        productSaveError.value = (err as any).message ?? t("suppliers.product.saveFailed", { status: res.status });
        return;
      }
      // Update in place — no re-fetch needed
      const idx = products.value.findIndex((p) => p.id === editingProduct.value!.id);
      if (idx !== -1) products.value[idx] = { ...products.value[idx], ...productForm };
    } else {
      const res = await apiFetch(`/api/suppliers/${selectedSupplier.value.id}/products`, {
        method: "POST",
        body: JSON.stringify(productForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        productSaveError.value = (err as any).message ?? t("suppliers.product.saveFailed", { status: res.status });
        return;
      }
      await fetchProducts(selectedSupplier.value.id);
      await fetchSuppliers();
    }
    productFormOpen.value = false;
  } finally {
    productSaving.value = false;
  }
}

function confirmDeleteProduct(product: Product) {
  deleteProductTarget.value = product;
  deleteProductOpen.value = true;
}

// ─── Matrix Edit ──────────────────────────────────────────────────────────────
const matrixEditOpen = ref(false);
const matrixRows = ref<Product[]>([]);
const matrixSaving = ref(false);
let matrixOriginal: Product[] = [];

function openMatrixEdit() {
  matrixOriginal = JSON.parse(JSON.stringify(products.value));
  matrixRows.value = JSON.parse(JSON.stringify(products.value));
  matrixEditOpen.value = true;
}

function onMatrixDragEnd() {
  matrixRows.value = matrixRows.value.map((row, i) => ({ ...row, displayOrder: i }));
}

async function saveMatrixEdit() {
  if (!selectedSupplier.value) return;
  matrixSaving.value = true;
  try {
    const changed = matrixRows.value.filter((row, i) => {
      const orig = matrixOriginal[i];
      return (
        row.supplierName !== orig.supplierName ||
        row.internalName !== orig.internalName ||
        row.idealStock !== orig.idealStock ||
        row.displayOrder !== orig.displayOrder ||
        row.manualOrder !== orig.manualOrder ||
        row.isActive !== orig.isActive
      );
    });
    await Promise.all(
      changed.map((row) =>
        apiFetch(`/api/suppliers/${selectedSupplier.value!.id}/products/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify(row),
        }),
      ),
    );
    products.value = JSON.parse(JSON.stringify(matrixRows.value));
    matrixEditOpen.value = false;
  } finally {
    matrixSaving.value = false;
  }
}

async function executeDeleteProduct() {
  if (!deleteProductTarget.value || !selectedSupplier.value) return;
  deletingProduct.value = true;
  try {
    await apiFetch(`/api/suppliers/${selectedSupplier.value.id}/products/${deleteProductTarget.value.id}`, {
      method: "DELETE",
    });
    deleteProductOpen.value = false;
    deleteProductTarget.value = null;
    await fetchProducts(selectedSupplier.value.id);
    await fetchSuppliers();
  } finally {
    deletingProduct.value = false;
  }
}
</script>
