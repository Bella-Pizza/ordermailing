<template>
  <!-- Full-bleed editor — no outer padding from Layout -->
  <div class="fixed inset-0 flex flex-col bg-[#1a1a1a] text-white" style="z-index: 50">
    <!-- ── Top toolbar ──────────────────────────────────────────────────────── -->
    <div class="flex h-11 shrink-0 items-center gap-1 border-b border-white/10 bg-[#242424] px-2">
      <a
        href="/design"
        class="mr-1 flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-white/10"
      >
        <ChevronLeft class="size-4" />
        <span class="max-w-[160px] truncate font-medium text-white">{{ project?.name ?? "…" }}</span>
      </a>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Tool buttons -->
      <template v-for="tool in TOOLS" :key="tool.id">
        <button
          :title="tool.label + (tool.shortcut ? ` (${tool.shortcut})` : '')"
          :class="[
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            activeTool === tool.id
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-white/10 hover:text-white',
          ]"
          @click="activeTool = tool.id"
        >
          <component :is="tool.icon" class="size-4" />
        </button>
      </template>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Undo / redo -->
      <button
        title="Undo (Ctrl+Z)"
        :disabled="historyIdx <= 0"
        class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
        @click="undo"
      >
        <Undo2 class="size-4" />
      </button>
      <button
        title="Redo (Ctrl+Y)"
        :disabled="historyIdx >= history.length - 1"
        class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
        @click="redo"
      >
        <Redo2 class="size-4" />
      </button>

      <div class="flex-1" />

      <!-- Zoom -->
      <div class="flex items-center gap-1">
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-white/10"
          @click="zoom = Math.max(0.1, +(zoom - 0.1).toFixed(1))"
        >
          <ZoomOut class="size-3.5" />
        </button>
        <span class="w-12 text-center text-xs text-muted-foreground">{{ Math.round(zoom * 100) }}%</span>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-white/10"
          @click="zoom = Math.min(4, +(zoom + 0.1).toFixed(1))"
        >
          <ZoomIn class="size-3.5" />
        </button>
        <button
          title="Fit to screen"
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-white/10"
          @click="fitToScreen"
        >
          <Maximize2 class="size-3.5" />
        </button>
      </div>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Import SVG -->
      <button
        title="Import SVG"
        class="flex h-7 items-center gap-1.5 rounded border border-white/10 px-2 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
        @click="svgInputEl?.click()"
      >
        <FileCode2 class="size-3.5" />Import SVG
      </button>

      <!-- AI Generate Button -->
      <Dialog v-model:open="isAiDialogOpen">
        <DialogTrigger as-child>
          <button
            title="AI Image Generation"
            class="flex h-7 items-center gap-1.5 rounded border border-white/10 px-2 text-xs font-medium text-pink-400 hover:bg-white/10 hover:text-pink-300 ml-1"
          >
            <Sparkles class="size-3.5" />AI Prompt
          </button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Generate Image</DialogTitle>
            <DialogDescription> Enter a prompt to generate an SVG and add it to your design. </DialogDescription>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <div class="grid gap-2">
              <label class="text-sm font-medium leading-none">Prompt</label>
              <textarea
                v-model="aiPrompt"
                class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="A cool looking vector logo of a wolf..."
              ></textarea>
            </div>
            <div class="grid gap-2">
              <label class="text-sm font-medium leading-none">Reference Image (Optional)</label>
              <input
                type="file"
                accept="image/*"
                @change="onAiImageSelect"
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button @click="handleAiGenerate" :disabled="isGeneratingAI || !aiPrompt.trim()">
              <Loader2 v-if="isGeneratingAI" class="mr-2 h-4 w-4 animate-spin" />
              <Sparkles v-else class="mr-2 h-4 w-4" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Text menu -->
      <div class="relative" data-text-menu>
        <button
          title="Text options"
          class="flex h-7 items-center gap-1 rounded border border-white/10 px-2 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
          :class="textMenuOpen ? 'bg-white/10 text-white' : ''"
          @click="
            textMenuOpen = !textMenuOpen;
            if (!textMenuOpen) textMenuFontOpen = false;
          "
        >
          <Type class="size-3.5" />
          <span>Text</span>
          <ChevronDown class="size-3" />
        </button>

        <!-- Dropdown -->
        <div
          v-if="textMenuOpen"
          class="absolute left-0 top-9 z-50 w-52 rounded-lg border border-white/20 bg-[#1e1e1e] py-1 shadow-2xl"
        >
          <!-- Font for all layers -->
          <div class="relative" data-text-menu>
            <button
              class="flex w-full items-center justify-between px-3 py-2 text-xs text-white hover:bg-white/10"
              @click="textMenuFontOpen = !textMenuFontOpen"
            >
              <span class="flex items-center gap-2"><Type class="size-3.5 opacity-60" />Font – all layers</span>
              <ChevronDown class="size-3 opacity-60" :class="textMenuFontOpen ? 'rotate-180' : ''" />
            </button>
            <!-- Inline font submenu -->
            <div
              v-if="textMenuFontOpen"
              class="mx-1 mb-1 max-h-48 overflow-y-auto rounded border border-white/10 bg-[#161616]"
            >
              <button
                v-for="f in FONTS"
                :key="f.family"
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/10"
                :style="{ fontFamily: f.family }"
                @click="setFontForAll(f)"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <div class="my-1 border-t border-white/10" />

          <!-- Auto-size all -->
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/10"
            @click="
              autoSizeAll();
              textMenuOpen = false;
            "
          >
            <Maximize2 class="size-3.5 opacity-60" />
            Auto-size all text
            <span class="ml-auto text-[10px] text-muted-foreground">Ctrl+Shift+A</span>
          </button>
        </div>
      </div>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Save status -->
      <div class="flex items-center gap-1.5 text-xs">
        <Loader2 v-if="saveStatus === 'saving'" class="size-3.5 animate-spin text-muted-foreground" />
        <CloudOff v-else-if="saveStatus === 'offline'" class="size-3.5 text-amber-500" />
        <Cloud v-else-if="saveStatus === 'saved'" class="size-3.5 text-green-500" />
        <span v-if="saveStatus === 'saving'" class="text-muted-foreground">Saving…</span>
        <span v-else-if="saveStatus === 'offline'" class="text-amber-500">Offline</span>
        <span v-else-if="saveStatus === 'saved'" class="text-green-500">Saved</span>
      </div>

      <div class="mx-1 h-5 w-px bg-white/10" />

      <!-- Export -->
      <div class="flex items-center gap-1">
        <select v-model="exportFormat" class="h-7 rounded border border-white/10 bg-[#2e2e2e] px-2 text-xs text-white">
          <option value="png">PNG</option>
          <option value="jpeg">JPG</option>
        </select>
        <button
          class="flex h-7 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-white hover:bg-primary/90"
          @click="exportCanvas"
        >
          <Download class="size-3.5" />Export
        </button>
      </div>
    </div>

    <!-- ── Main area ────────────────────────────────────────────────────────── -->
    <div class="flex min-h-0 flex-1">
      <!-- Left: layers panel -->
      <div class="flex w-44 shrink-0 flex-col border-r border-white/10 bg-[#242424]">
        <div class="flex h-8 items-center justify-between px-3">
          <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</span>
          <button class="text-muted-foreground hover:text-white" title="Add layer" @click="openAddMenu">
            <Plus class="size-3.5" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div
            v-for="el in layersReversed"
            :key="el.id"
            :class="[
              'group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs transition-colors',
              selectedId === el.id || selectedIds.includes(el.id)
                ? 'bg-primary/20 text-white'
                : 'text-muted-foreground hover:bg-white/5 hover:text-white',
            ]"
            @click="selectEl(el.id)"
          >
            <component :is="elementIcon(el)" class="size-3 shrink-0 opacity-60" />
            <span class="flex-1 truncate">{{ el.name }}</span>
            <button
              class="hidden shrink-0 rounded p-0.5 hover:bg-destructive/20 hover:text-red-400 group-hover:flex"
              @click.stop="deleteElement(el.id)"
            >
              <X class="size-3" />
            </button>
          </div>
        </div>
        <!-- Add layer quick buttons -->
        <div class="flex flex-col gap-0.5 border-t border-white/10 p-2">
          <button
            class="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
            @click="addRect"
          >
            <Square class="size-3" />Rectangle
          </button>
          <button
            class="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
            @click="addEllipse"
          >
            <Circle class="size-3" />Ellipse
          </button>
          <button
            class="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
            @click="addText"
          >
            <Type class="size-3" />Text
          </button>
          <button
            class="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
            @click="fileInputEl?.click()"
          >
            <ImageIcon class="size-3" />Image
          </button>
        </div>
      </div>

      <!-- Centre: canvas viewport -->
      <div
        ref="viewportEl"
        class="relative flex-1 overflow-hidden bg-[#1a1a1a]"
        style="cursor: default"
        :style="{
          cursor:
            activeTool === 'pan' ? (panning ? 'grabbing' : 'grab') : activeTool !== 'select' ? 'crosshair' : 'default',
        }"
        @mousedown="onViewportMouseDown"
        @wheel.prevent="onWheel"
        @dblclick="onViewportDblClick"
      >
        <!-- Artboard + elements -->
        <div
          ref="artboardEl"
          class="absolute origin-top-left shadow-2xl"
          :style="{
            width: artboard.width + 'px',
            height: artboard.height + 'px',
            background: artboard.background,
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          }"
        >
          <!-- Rendered elements -->
          <template v-for="el in artboard.elements" :key="el.id">
            <!-- Rect / ellipse -->
            <div
              v-if="el.type === 'rect' || el.type === 'ellipse'"
              :class="['absolute', el.type === 'ellipse' ? 'rounded-full' : '']"
              :style="elStyle(el)"
              @mousedown.stop="onElMouseDown($event, el)"
            />

            <!-- Text -->
            <div
              v-else-if="el.type === 'text'"
              class="absolute overflow-hidden whitespace-pre-wrap break-words"
              :style="elStyle(el)"
              @mousedown.stop="onElMouseDown($event, el)"
              @dblclick.stop="startTextEdit(el)"
            >
              <template v-if="editingTextId !== el.id">{{ el.text }}</template>
              <textarea
                v-else
                ref="textareaEl"
                v-model="el.text"
                class="h-full w-full resize-none bg-transparent focus:outline-none"
                :style="{
                  color: el.color,
                  fontSize: el.fontSize + 'px',
                  fontWeight: el.fontWeight,
                  textAlign: el.textAlign as any,
                  fontFamily: el.fontFamily,
                }"
                @blur="commitTextEdit"
                @keydown.esc="commitTextEdit"
              />
            </div>

            <!-- Image -->
            <div
              v-else-if="el.type === 'image'"
              class="absolute overflow-hidden"
              :style="{
                left: el.x + 'px',
                top: el.y + 'px',
                width: el.width + 'px',
                height: el.height + 'px',
                opacity: el.opacity,
                borderRadius: (el.borderRadius ?? 0) + 'px',
              }"
              @mousedown.stop="onElMouseDown($event, el)"
            >
              <img
                v-if="el.src"
                :src="el.src"
                :class="el.objectFit === 'cover' ? 'object-cover' : 'object-contain'"
                class="h-full w-full"
                :style="
                  el.objectFit === 'cover'
                    ? `object-position: ${(el.offsetX ?? 0) / 2 + 50}% ${(el.offsetY ?? 0) / 2 + 50}%`
                    : undefined
                "
                @error="retrySrc($event, el)"
              />
              <div v-else class="flex h-full w-full items-center justify-center bg-muted/20">
                <ImageIcon class="size-6 text-muted-foreground/40" />
              </div>
            </div>
          </template>

          <!-- Selection handles -->
          <template v-if="selected && editingTextId !== selected.id">
            <div
              class="pointer-events-none absolute border-2 border-primary"
              :style="{
                left: selected.x - 1 + 'px',
                top: selected.y - 1 + 'px',
                width: selected.width + 2 + 'px',
                height: selected.height + 2 + 'px',
              }"
            />
            <!-- 8 resize handles -->
            <template v-for="handle in resizeHandles" :key="handle.id">
              <div
                class="absolute z-10 h-2.5 w-2.5 rounded-sm border border-primary bg-white shadow"
                :style="{ left: handle.x - 5 + 'px', top: handle.y - 5 + 'px', cursor: handle.cursor }"
                @mousedown.stop="onResizeHandleDown($event, handle)"
              />
            </template>
          </template>

          <!-- Multi-selection bounding box + resize handles -->
          <template v-if="selectedIds.length > 1 && multiSelectionBBox">
            <!-- Dashed aggregate outline -->
            <div
              class="absolute cursor-move border-2 border-primary border-dashed"
              :style="{
                left: multiSelectionBBox.x - 1 + 'px',
                top: multiSelectionBBox.y - 1 + 'px',
                width: multiSelectionBBox.width + 2 + 'px',
                height: multiSelectionBBox.height + 2 + 'px',
              }"
              @mousedown.stop="onMultiBBoxMouseDown"
            />
            <!-- Per-element thin outlines -->
            <div
              v-for="elId in selectedIds"
              :key="'sel-' + elId"
              class="pointer-events-none absolute border border-primary/50"
              :style="multiElOutlineStyle(elId)"
            />
            <!-- 8 resize handles -->
            <template v-for="handle in multiResizeHandles" :key="'mr-' + handle.id">
              <div
                class="absolute z-10 h-2.5 w-2.5 rounded-sm border border-primary bg-white shadow"
                :style="{ left: handle.x - 5 + 'px', top: handle.y - 5 + 'px', cursor: handle.cursor }"
                @mousedown.stop="onMultiResizeHandleDown($event, handle)"
              />
            </template>
          </template>

          <!-- Marquee selection rect -->
          <div
            v-if="marqueeActive && marqueeRect"
            class="pointer-events-none absolute border border-primary bg-primary/10"
            :style="{
              left: Math.min(marqueeRect.x1, marqueeRect.x2) + 'px',
              top: Math.min(marqueeRect.y1, marqueeRect.y2) + 'px',
              width: Math.abs(marqueeRect.x2 - marqueeRect.x1) + 'px',
              height: Math.abs(marqueeRect.y2 - marqueeRect.y1) + 'px',
            }"
          />

          <!-- Draw preview rect (non-text/image tools) -->
          <div
            v-if="drawing && drawPreview"
            class="pointer-events-none absolute border-2 border-primary/70 bg-primary/10"
            :style="{
              left: Math.min(drawPreview.x1, drawPreview.x2) + 'px',
              top: Math.min(drawPreview.y1, drawPreview.y2) + 'px',
              width: Math.abs(drawPreview.x2 - drawPreview.x1) + 'px',
              height: Math.abs(drawPreview.y2 - drawPreview.y1) + 'px',
              borderRadius: activeTool === 'ellipse' ? '50%' : '0',
            }"
          />
        </div>
      </div>

      <!-- Right: properties panel -->
      <div class="flex w-56 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#242424]">
        <div class="sticky top-0 border-b border-white/10 bg-[#242424] px-3 py-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Properties</p>
        </div>

        <!-- Artboard section (always shown) -->
        <div class="flex flex-col gap-0.5 border-b border-white/10 p-3">
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">Artboard</p>
          <PropRow label="W">
            <PropInput
              :model-value="artboard.width"
              type="number"
              @update:model-value="
                (v) => {
                  artboard.width = +v;
                  pushHistory();
                }
              "
            />
          </PropRow>
          <PropRow label="H">
            <PropInput
              :model-value="artboard.height"
              type="number"
              @update:model-value="
                (v) => {
                  artboard.height = +v;
                  pushHistory();
                }
              "
            />
          </PropRow>
          <PropRow label="BG">
            <input
              type="color"
              :value="artboard.background"
              class="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
              @input="
                (e) => {
                  artboard.background = (e.target as HTMLInputElement).value;
                  pushHistory();
                }
              "
            />
          </PropRow>
        </div>

        <!-- Multi-selection panel -->
        <div v-if="selectedIds.length > 1" class="flex flex-col gap-1.5 border-b border-white/10 p-3">
          <p class="text-xs font-medium text-muted-foreground">Selection</p>
          <p class="text-xs text-white">{{ selectedIds.length }} layers selected</p>
          <button
            class="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded border border-destructive/50 text-xs text-red-400 hover:bg-destructive/20"
            @click="deleteMultiple"
          >
            <Trash2 class="size-3.5" />Delete selected
          </button>
        </div>

        <!-- Element section -->
        <template v-if="selected">
          <div class="flex flex-col gap-0.5 border-b border-white/10 p-3">
            <p class="mb-1.5 text-xs font-medium text-muted-foreground">Transform</p>
            <PropRow label="X"><PropInput v-model.number="selected.x" type="number" @change="pushHistory" /></PropRow>
            <PropRow label="Y"><PropInput v-model.number="selected.y" type="number" @change="pushHistory" /></PropRow>
            <PropRow label="W"
              ><PropInput v-model.number="selected.width" type="number" min="1" @change="pushHistory"
            /></PropRow>
            <PropRow label="H"
              ><PropInput v-model.number="selected.height" type="number" min="1" @change="pushHistory"
            /></PropRow>
            <PropRow label="Opacity">
              <input
                type="range"
                v-model.number="selected.opacity"
                min="0"
                max="1"
                step="0.01"
                class="w-full accent-primary"
                @change="pushHistory"
              />
              <span class="ml-1 w-8 shrink-0 text-right text-xs text-muted-foreground"
                >{{ Math.round((selected.opacity ?? 1) * 100) }}%</span
              >
            </PropRow>
            <PropRow label="Name">
              <input
                v-model="selected.name"
                class="h-6 w-full rounded border border-white/10 bg-[#1a1a1a] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                @change="pushHistory"
              />
            </PropRow>
          </div>

          <!-- Fill / stroke (rect & ellipse) -->
          <div
            v-if="selected.type === 'rect' || selected.type === 'ellipse'"
            class="flex flex-col gap-0.5 border-b border-white/10 p-3"
          >
            <p class="mb-1.5 text-xs font-medium text-muted-foreground">Appearance</p>
            <PropRow label="Fill">
              <input
                type="color"
                :value="selected.fill || '#3b82f6'"
                class="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
                @input="
                  (e) => {
                    selected!.fill = (e.target as HTMLInputElement).value;
                    pushHistory();
                  }
                "
              />
              <input
                v-model="selected.fill"
                class="ml-1 h-6 flex-1 rounded border border-white/10 bg-[#1a1a1a] px-2 text-xs text-white focus:outline-none"
                @change="pushHistory"
              />
            </PropRow>
            <PropRow label="Stroke">
              <input
                type="color"
                :value="selected.stroke || '#000000'"
                class="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
                @input="
                  (e) => {
                    selected!.stroke = (e.target as HTMLInputElement).value;
                    pushHistory();
                  }
                "
              />
              <input
                v-model="selected.stroke"
                class="ml-1 h-6 flex-1 rounded border border-white/10 bg-[#1a1a1a] px-2 text-xs text-white focus:outline-none"
                @change="pushHistory"
              />
            </PropRow>
            <PropRow label="SW">
              <PropInput v-model.number="selected.strokeWidth" type="number" min="0" @change="pushHistory" />
            </PropRow>
            <PropRow label="R">
              <PropInput v-model.number="selected.borderRadius" type="number" min="0" @change="pushHistory" />
            </PropRow>
          </div>

          <!-- Text properties -->
          <div v-if="selected.type === 'text'" class="flex flex-col gap-0.5 border-b border-white/10 p-3">
            <p class="mb-1.5 text-xs font-medium text-muted-foreground">Text</p>
            <PropRow label="Color">
              <input
                type="color"
                :value="selected.color || '#000000'"
                class="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
                @input="
                  (e) => {
                    selected!.color = (e.target as HTMLInputElement).value;
                    pushHistory();
                  }
                "
              />
            </PropRow>
            <PropRow label="Size">
              <PropInput v-model.number="selected.fontSize" type="number" min="1" @change="pushHistory" />
            </PropRow>
            <PropRow label="Weight">
              <select
                v-model="selected.fontWeight"
                class="h-6 w-full rounded border border-white/10 bg-[#1a1a1a] px-2 text-xs text-white focus:outline-none"
                @change="pushHistory"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="lighter">Light</option>
              </select>
            </PropRow>
            <PropRow label="Align">
              <div class="flex gap-1">
                <button
                  v-for="a in ['left', 'center', 'right']"
                  :key="a"
                  :class="[
                    'flex h-6 w-6 items-center justify-center rounded text-xs transition-colors',
                    selected.textAlign === a
                      ? 'bg-primary text-white'
                      : 'border border-white/10 text-muted-foreground hover:text-white',
                  ]"
                  @click="
                    selected.textAlign = a;
                    pushHistory();
                  "
                >
                  <AlignLeft v-if="a === 'left'" class="size-3" />
                  <AlignCenter v-else-if="a === 'center'" class="size-3" />
                  <AlignRight v-else class="size-3" />
                </button>
              </div>
            </PropRow>
            <PropRow label="Font">
              <div class="relative w-full" data-font-picker>
                <button
                  class="flex h-6 w-full items-center justify-between truncate rounded border border-white/10 bg-[#1a1a1a] px-2 text-left text-xs text-white focus:outline-none hover:border-white/30"
                  :style="{
                    fontFamily:
                      selected?.fontFamily && selected.fontFamily !== 'inherit'
                        ? selected.fontFamily
                        : 'MyriadPro-Black',
                  }"
                  @click="fontPickerOpen = !fontPickerOpen"
                >
                  <span class="truncate">{{
                    FONTS.find((f) => f.family === selected?.fontFamily)?.label ??
                    (selected?.fontFamily && selected.fontFamily !== "inherit"
                      ? selected.fontFamily
                      : "MyriadPro Black")
                  }}</span>
                  <ChevronDown class="ml-1 size-3 shrink-0 opacity-50" />
                </button>
                <div
                  v-if="fontPickerOpen"
                  class="absolute left-0 top-7 z-50 max-h-56 w-full overflow-y-auto rounded-lg border border-white/20 bg-[#1e1e1e] py-1 shadow-2xl"
                >
                  <button
                    v-for="f in FONTS"
                    :key="f.family"
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/10"
                    :class="selected?.fontFamily === f.family ? 'text-primary' : 'text-white'"
                    :style="{ fontFamily: f.family }"
                    @click="selectFont(f)"
                  >
                    <Check v-if="selected?.fontFamily === f.family" class="size-3 shrink-0" />
                    <span v-else class="size-3 shrink-0" />
                    {{ f.label }}
                  </button>
                </div>
              </div>
            </PropRow>
            <button
              :class="[
                'mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded border text-xs transition-colors',
                selected.autoSize
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-white/10 text-muted-foreground hover:border-white/30 hover:text-white',
              ]"
              @click="
                selected.autoSize = !selected.autoSize;
                if (selected.autoSize) applyAutoSize(selected);
                pushHistory();
              "
            >
              <Maximize2 class="size-3.5" />
              Auto size
            </button>
          </div>

          <!-- Image properties -->
          <div v-if="selected.type === 'image'" class="flex flex-col gap-0.5 border-b border-white/10 p-3">
            <p class="mb-1.5 text-xs font-medium text-muted-foreground">Image</p>
            <button
              class="mb-1 flex h-7 w-full items-center justify-center gap-1.5 rounded border border-white/10 text-xs text-muted-foreground hover:border-white/30 hover:text-white"
              @click="fileInputEl?.click()"
            >
              <Upload class="size-3.5" />{{ selected.src ? "Replace" : "Choose image" }}
            </button>
            <button
              class="mb-1 flex h-7 w-full items-center justify-center gap-1.5 rounded border border-white/10 text-xs text-muted-foreground hover:border-white/30 hover:text-white disabled:opacity-40"
              :disabled="removingBg || !selected.src"
              @click="removeBg()"
            >
              <Scissors class="size-3.5" />
              <span v-if="removingBg">Removing background…</span>
              <span v-else>Remove background</span>
            </button>
            <PropRow label="Fit">
              <div class="flex gap-1">
                <button
                  v-for="f in ['contain', 'cover']"
                  :key="f"
                  :class="[
                    'flex h-6 flex-1 items-center justify-center rounded text-xs capitalize transition-colors',
                    (selected.objectFit ?? 'contain') === f
                      ? 'bg-primary text-white'
                      : 'border border-white/10 text-muted-foreground hover:text-white',
                  ]"
                  @click="
                    selected.objectFit = f as any;
                    pushHistory();
                  "
                >
                  {{ f }}
                </button>
              </div>
            </PropRow>
            <template v-if="selected.objectFit === 'cover'">
              <PropRow label="X">
                <input
                  type="range"
                  v-model.number="selected.offsetX"
                  min="-100"
                  max="100"
                  step="1"
                  class="w-full accent-primary"
                  @input="pushHistoryDebounced"
                />
                <span class="ml-1 w-7 shrink-0 text-right text-xs text-muted-foreground">{{
                  selected.offsetX ?? 0
                }}</span>
              </PropRow>
              <PropRow label="Y">
                <input
                  type="range"
                  v-model.number="selected.offsetY"
                  min="-100"
                  max="100"
                  step="1"
                  class="w-full accent-primary"
                  @input="pushHistoryDebounced"
                />
                <span class="ml-1 w-7 shrink-0 text-right text-xs text-muted-foreground">{{
                  selected.offsetY ?? 0
                }}</span>
              </PropRow>
            </template>
          </div>

          <!-- Common: border radius & lock aspect -->
          <div class="flex flex-col gap-1 p-3">
            <button
              class="flex h-7 w-full items-center justify-center gap-1.5 rounded border border-white/10 text-xs text-destructive hover:border-red-500/40 hover:bg-red-500/10"
              @click="deleteElement(selected.id)"
            >
              <Trash2 class="size-3.5" />Delete element
            </button>
            <!-- Layer order -->
            <div class="flex gap-1">
              <button
                class="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
                @click="moveLayer(1)"
                title="Bring forward"
              >
                <ArrowUp class="size-3" />Front
              </button>
              <button
                class="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
                @click="moveLayer(-1)"
                title="Send backward"
              >
                <ArrowDown class="size-3" />Back
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Hidden file input -->
  <input ref="fileInputEl" type="file" accept="image/*" class="hidden" @change="onFilePick" />
  <input ref="svgInputEl" type="file" accept=".svg,image/svg+xml" class="hidden" @change="onSvgPick" />
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted, nextTick, watch } from "vue";
import { apiFetch } from "@/lib/apiFetch";
import { removeBackground } from "@imgly/background-removal";
import myriadProUrl from "@/assets/MyriadPro-Black.otf?url";
import { usePageContext } from "vike-vue/usePageContext";
import {
  ChevronLeft,
  MousePointer2,
  Square,
  Circle,
  Type,
  Image as ImageIcon,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Plus,
  X,
  Trash2,
  Upload,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  FileCode2,
  Scissors,
  ChevronDown,
  Check,
  Loader2,
  CloudOff,
  Cloud,
  Sparkles,
} from "lucide-vue-next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Shared prop-row + prop-input mini-components ─────────────────────────────
// Render functions rather than `template` strings: a runtime template would
// pull Vue's ~180 kB template compiler into the browser bundle.
const PropRow = {
  name: "PropRow",
  props: ["label"],
  setup(props: { label?: string }, { slots }: { slots: Record<string, (() => unknown) | undefined> }) {
    return () =>
      h("div", { class: "flex items-center gap-1.5" }, [
        h("span", { class: "w-12 shrink-0 text-xs text-muted-foreground" }, props.label),
        h("div", { class: "flex min-w-0 flex-1 items-center gap-1" }, slots.default?.() as never),
      ]);
  },
};
const PropInput = {
  name: "PropInput",
  props: ["modelValue", "type", "min"],
  emits: ["update:modelValue", "change"],
  setup(
    props: { modelValue?: unknown; type?: string; min?: unknown },
    { emit }: { emit: (event: string, ...args: unknown[]) => void },
  ) {
    return () =>
      h("input", {
        type: props.type || "text",
        value: props.modelValue,
        min: props.min,
        class:
          "h-6 w-full rounded border border-white/10 bg-[#1a1a1a] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary",
        onInput: (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).value),
        onChange: () => emit("change"),
      });
  },
};

// ─── Fonts ───────────────────────────────────────────────────────────────
const FONTS: { label: string; family: string; google?: boolean }[] = [
  { label: "MyriadPro Black", family: "MyriadPro-Black" },
  { label: "Arial", family: "Arial" },
  { label: "Helvetica", family: "Helvetica Neue, Helvetica, sans-serif" },
  { label: "Georgia", family: "Georgia" },
  { label: "Times New Roman", family: "Times New Roman" },
  { label: "Courier New", family: "Courier New" },
  { label: "Roboto", family: "Roboto", google: true },
  { label: "Open Sans", family: "Open Sans", google: true },
  { label: "Lato", family: "Lato", google: true },
  { label: "Montserrat", family: "Montserrat", google: true },
  { label: "Raleway", family: "Raleway", google: true },
  { label: "Oswald", family: "Oswald", google: true },
  { label: "Playfair Display", family: "Playfair Display", google: true },
];

const fontPickerOpen = ref(false);
const textMenuOpen = ref(false);
const textMenuFontOpen = ref(false);
const loadedGoogleFonts = new Set<string>();

function loadGoogleFont(family: string) {
  const key = family.split(",")[0].trim();
  if (loadedGoogleFonts.has(key)) return;
  loadedGoogleFonts.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(key)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function selectFont(f: (typeof FONTS)[number]) {
  if (!selected.value) return;
  if (f.google) loadGoogleFont(f.family);
  selected.value.fontFamily = f.family;
  if (selected.value.autoSize) applyAutoSize(selected.value);
  fontPickerOpen.value = false;
  pushHistory();
}

function setFontForAll(f: (typeof FONTS)[number]) {
  if (f.google) loadGoogleFont(f.family);
  artboard.value.elements
    .filter((el) => el.type === "text")
    .forEach((el) => {
      el.fontFamily = f.family;
      if (el.autoSize) applyAutoSize(el);
    });
  textMenuFontOpen.value = false;
  textMenuOpen.value = false;
  pushHistory();
}

// Pre-load all Google Fonts so they render correctly in the picker dropdown
function preloadPickerFonts() {
  FONTS.filter((f) => f.google).forEach((f) => loadGoogleFont(f.family));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DesignElement {
  id: string;
  name: string;
  type: "rect" | "ellipse" | "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  textAlign?: string;
  fontFamily?: string;
  autoSize?: boolean;
  src?: string;
  objectFit?: "contain" | "cover";
  offsetX?: number;
  offsetY?: number;
}
interface Artboard {
  width: number;
  height: number;
  background: string;
  elements: DesignElement[];
}
interface DesignProject {
  id: string;
  name: string;
  createdAt: string;
  artboard: Artboard;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TOOLS = [
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { id: "rect", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", shortcut: "E", icon: Circle },
  { id: "text", label: "Text", shortcut: "T", icon: Type },
  { id: "image", label: "Image", shortcut: "I", icon: ImageIcon },
  { id: "pan", label: "Pan", shortcut: "H", icon: Hand },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];
// ─── State ───────────────────────────────────────────────────────────────────
const pageContext = usePageContext();
const projectId = computed(() => (pageContext.routeParams as any)?.id as string);

const project = ref<DesignProject | null>(null);
const artboard = ref<Artboard>({ width: 1920, height: 1080, background: "#ffffff", elements: [] });

const activeTool = ref<ToolId>("select");
const selectedId = ref<string | null>(null);
const selected = computed(() => artboard.value.elements.find((e) => e.id === selectedId.value) ?? null);
const layersReversed = computed(() => [...artboard.value.elements].reverse());

const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);

const viewportEl = ref<HTMLElement | null>(null);
const artboardEl = ref<HTMLElement | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const svgInputEl = ref<HTMLInputElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

// AI Generation state
const isAiDialogOpen = ref(false);
const aiPrompt = ref("");
const aiImageFile = ref<File | null>(null);
const isGeneratingAI = ref(false);

function onAiImageSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) aiImageFile.value = file;
}

async function handleAiGenerate() {
  if (!aiPrompt.value.trim()) return;
  isGeneratingAI.value = true;
  try {
    const formData = new FormData();
    formData.append("prompt", aiPrompt.value);
    if (aiImageFile.value) {
      formData.append("image", aiImageFile.value);
    }

    const res = await apiFetch("/api/designs/generate", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || "Server error");
    }

    const data = await res.json();
    if (data.imageUrl) {
      artboard.value.width = 1920;
      artboard.value.height = 1080;
      artboard.value.elements.push({
        id: crypto.randomUUID(),
        name: "AI Generated Ad",
        type: "image",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        opacity: 1,
        src: data.imageUrl,
        objectFit: "cover",
        offsetX: 0,
        offsetY: 0,
      });
    }
  } catch (error) {
    console.error("AI Generation failed:", error);
    alert("Failed to generate image. Please try again or check server logs.");
  } finally {
    isGeneratingAI.value = false;
    isAiDialogOpen.value = false;
    aiPrompt.value = "";
    aiImageFile.value = null;
  }
}

const exportFormat = ref<"png" | "jpeg">("png");
const editingTextId = ref<string | null>(null);

// History (undo/redo)
const history = ref<string[]>([]);
const historyIdx = ref(-1);

// Drawing state
const drawing = ref(false);
const drawPreview = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
const drawStart = ref<{ x: number; y: number } | null>(null);

// Dragging state
const dragging = ref(false);
const dragStart = ref<{ mx: number; my: number; ox: number; oy: number } | null>(null);

// Resizing state
const resizing = ref(false);
const resizeHandle = ref<{ id: string; ox: number; oy: number; ow: number; oh: number; mx: number; my: number } | null>(
  null,
);

// Panning
const panning = ref(false);
const panStart = ref<{ mx: number; my: number; px: number; py: number } | null>(null);

// Multi-selection
const selectedIds = ref<string[]>([]);

// Marquee (rubber-band) selection
const marqueeActive = ref(false);
const marqueeRect = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

// Multi-drag
const multiDragging = ref(false);
const multiDragStart = ref<{ mx: number; my: number; origins: Record<string, { ox: number; oy: number }> } | null>(
  null,
);

// Multi-resize
const multiResizing = ref(false);
const multiResizeHandle = ref<{
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
  origins: Record<string, { ox: number; oy: number; ow: number; oh: number }>;
  mx: number;
  my: number;
} | null>(null);

// Debounced history push timer
let _histDebounce: ReturnType<typeof setTimeout> | null = null;

// ─── Save status ─────────────────────────────────────────────────────────────
const saveStatus = ref<"idle" | "saving" | "saved" | "offline">("idle");
const dirty = ref(false);
let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _savedTimer: ReturnType<typeof setTimeout> | null = null;
let _inflightSave: Promise<void> | null = null; // track in-flight upload so unmount can wait
let _reloading = false; // true while syncing server state back locally (suppress dirty mark)

// ─── CDN retry helper ────────────────────────────────────────────────────────
// Supabase CDN can take a few seconds to propagate a newly uploaded file.
// When an img fails to load, retry up to 5 times with increasing delays
// by appending/updating a cache-buster query param on CDN URLs.
const _retryCounts = new WeakMap<HTMLImageElement, number>();
function retrySrc(e: Event, el: DesignElement) {
  const img = e.target as HTMLImageElement;
  if (!el.src || el.src.startsWith("data:")) return; // data: URLs never need retry
  const count = (_retryCounts.get(img) ?? 0) + 1;
  if (count > 5) return;
  _retryCounts.set(img, count);
  const delay = Math.min(500 * count, 3000); // 500ms, 1s, 1.5s, 2s, 2.5s
  setTimeout(() => {
    const base = el.src!.split("?")[0];
    img.src = `${base}?t=${Date.now()}`;
  }, delay);
}

// ─── Image compression (reduces upload bandwidth before sending to server) ────
async function compressDataUrl(dataUrl: string, maxPx = 1200, quality = 0.75): Promise<string> {
  if (!dataUrl.startsWith("data:image/") || dataUrl.startsWith("data:image/svg")) return dataUrl;
  const mime = dataUrl.match(/data:(image\/[^;]+)/)?.[1] ?? "";
  // Only compress JPEGs. PNGs/WebP/GIF may have transparency — re-encoding through
  // a canvas can silently lose alpha data (background-removed images especially).
  // These are uploaded as binary files to Supabase anyway, so Firestore size is irrelevant.
  if (mime !== "image/jpeg" && mime !== "image/jpg") return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
async function prepareForSave(proj: DesignProject): Promise<DesignProject> {
  const clone: DesignProject = JSON.parse(JSON.stringify(proj));
  for (const el of clone.artboard.elements) {
    if (el.type === "image" && el.src && el.src.startsWith("data:")) {
      el.src = await compressDataUrl(el.src);
    }
  }
  return clone;
}

// ─── API persistence ──────────────────────────────────────────────────────────
/** Push dirty artboard to the server. No-ops when nothing changed or offline. */
async function syncToServer() {
  if (!project.value || !dirty.value) return;
  if (!navigator.onLine) {
    saveStatus.value = "offline";
    return;
  }
  saveStatus.value = "saving";
  dirty.value = false;
  const run = async () => {
    try {
      project.value!.artboard = artboard.value;
      const payload = await prepareForSave(JSON.parse(JSON.stringify(project.value)));
      await apiFetch(`/api/designs/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: payload.name, createdAt: payload.createdAt, artboard: payload.artboard }),
      });
      saveStatus.value = "saved";
      if (_savedTimer) clearTimeout(_savedTimer);
      _savedTimer = setTimeout(() => {
        saveStatus.value = "idle";
      }, 3_000);
    } catch {
      dirty.value = true; // retry on next cycle
      saveStatus.value = navigator.onLine ? "saving" : "offline";
    } finally {
      _inflightSave = null;
    }
  };
  _inflightSave = run();
  await _inflightSave;
}

/** Alias kept so pushHistory/undo/redo callers still work */
function save() {
  markDirty();
}

/** Immediately sync without waiting for the 2 s debounce.
 * Use for destructive operations (background removal, replace image, etc.)
 * where leaving the page right after must not lose the change.
 * After a successful save, reloads the artboard from the server so local
 * data: URLs are replaced by their definitive CDN URLs — preventing any
 * subsequent stale save from overwriting the correct server state. */
async function saveNow() {
  dirty.value = true;
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  await syncToServer();
  // Reload from server to replace data: URLs with CDN URLs in local state
  await reloadFromServer();
}

/** Fetch the current server artboard and apply it locally.
 * Uses the _reloading flag so the deep watcher doesn't mark the page dirty. */
async function reloadFromServer() {
  if (!projectId.value) return;
  try {
    _reloading = true;
    const res = await apiFetch(`/api/designs/${projectId.value}?t=${Date.now()}`);
    if (res.ok) {
      const fresh: DesignProject = await res.json();
      artboard.value = JSON.parse(JSON.stringify(fresh.artboard));
      dirty.value = false;
      if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
      }
    }
  } catch {
    /* ignore — local state stays as-is */
  } finally {
    // Wait one tick so Vue's queued watcher (flush: 'pre') fires while
    // _reloading is still true — otherwise it would call markDirty().
    await nextTick();
    _reloading = false;
  }
}

/** Mark the artboard dirty and schedule a debounced cloud sync (2 s idle) */
function markDirty() {
  dirty.value = true;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    syncToServer();
  }, 2_000);
}

function startSyncTimer() {
  stopSyncTimer();
  _syncTimer = setInterval(syncToServer, 30_000); // safety-net flush every 30 s
}
function stopSyncTimer() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}
function handleOnline() {
  if (saveStatus.value === "offline" || dirty.value) syncToServer();
}
// Mark dirty on every artboard mutation — the 2 s debounce inside markDirty() handles the actual upload
// _reloading guard prevents a server-reload from immediately marking dirty again.
watch(
  artboard,
  () => {
    if (!_reloading) markDirty();
  },
  { deep: true },
);

// ─── History ──────────────────────────────────────────────────────────────────
function pushHistory() {
  const snap = JSON.stringify(artboard.value);
  history.value.splice(historyIdx.value + 1);
  history.value.push(snap);
  if (history.value.length > 80) history.value.shift();
  historyIdx.value = history.value.length - 1;
  save();
}
function pushHistoryDebounced() {
  if (_histDebounce) clearTimeout(_histDebounce);
  _histDebounce = setTimeout(() => {
    pushHistory();
    _histDebounce = null;
  }, 200);
}
function undo() {
  if (historyIdx.value <= 0) return;
  historyIdx.value--;
  artboard.value = JSON.parse(history.value[historyIdx.value]);
  save();
}
function redo() {
  if (historyIdx.value >= history.value.length - 1) return;
  historyIdx.value++;
  artboard.value = JSON.parse(history.value[historyIdx.value]);
  save();
}

// ─── Init ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Wipe the old local IndexedDB that was used before cloud sync.
  // It is never read anymore but stale data there could cause confusion.
  try {
    indexedDB.deleteDatabase("designProjects");
  } catch {
    /* ignore */
  }

  try {
    const res = await apiFetch(`/api/designs/${projectId.value}`);
    if (res.ok) {
      const found: DesignProject = await res.json();
      project.value = found;
      artboard.value = JSON.parse(JSON.stringify(found.artboard));
      pushHistory();
      nextTick(() => fitToScreen());
    }
  } catch {
    // project not found — will show empty editor
  }
  // Register embedded MyriadPro-Black font
  const myriadFace = new FontFace("MyriadPro-Black", `url(${myriadProUrl})`);
  myriadFace
    .load()
    .then((f) => document.fonts.add(f))
    .catch(() => {});
  // Pre-load Google Font stylesheets so the picker looks correct immediately
  preloadPickerFonts();
  startSyncTimer();
  window.addEventListener("online", handleOnline);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("mousedown", onDocMouseDown);
});
onUnmounted(async () => {
  stopSyncTimer();
  window.removeEventListener("online", handleOnline);
  detachWindowListeners();
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("beforeunload", onBeforeUnload);
  document.removeEventListener("mousedown", onDocMouseDown);
  // Wait for any in-flight save to complete, then do a final flush if still dirty.
  if (_inflightSave) await _inflightSave;
  if (dirty.value) await syncToServer();
});

function onDocMouseDown(e: MouseEvent) {
  const target = e.target as Element;
  if (fontPickerOpen.value && !target.closest("[data-font-picker]")) {
    fontPickerOpen.value = false;
  }
  if (textMenuOpen.value && !target.closest("[data-text-menu]")) {
    textMenuOpen.value = false;
    textMenuFontOpen.value = false;
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || _inflightSave) {
    e.preventDefault();
  }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "A") {
    e.preventDefault();
    autoSizeAll();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedIds.value.length > 1) {
      deleteMultiple();
    } else if (selectedId.value) {
      deleteElement(selectedId.value);
    }
    return;
  }
  if (e.key === "Escape") {
    selectedIds.value = [];
    selectedId.value = null;
    return;
  }
  const map: Record<string, ToolId> = { v: "select", r: "rect", e: "ellipse", t: "text", i: "image", h: "pan" };
  if (!e.ctrlKey && !e.metaKey && map[e.key.toLowerCase()]) activeTool.value = map[e.key.toLowerCase()];
}

// ─── Zoom / pan ───────────────────────────────────────────────────────────────
function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    zoom.value = Math.max(0.05, Math.min(4, +(zoom.value + delta).toFixed(2)));
  } else {
    panX.value -= e.deltaX;
    panY.value -= e.deltaY;
  }
}
function fitToScreen() {
  if (!viewportEl.value) return;
  const vw = viewportEl.value.clientWidth - 80;
  const vh = viewportEl.value.clientHeight - 80;
  zoom.value = Math.min(vw / artboard.value.width, vh / artboard.value.height);
  panX.value = (viewportEl.value.clientWidth - artboard.value.width * zoom.value) / 2;
  panY.value = (viewportEl.value.clientHeight - artboard.value.height * zoom.value) / 2;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function toArtboard(clientX: number, clientY: number) {
  if (!viewportEl.value) return { x: 0, y: 0 };
  const rect = viewportEl.value.getBoundingClientRect();
  return {
    x: (clientX - rect.left - panX.value) / zoom.value,
    y: (clientY - rect.top - panY.value) / zoom.value,
  };
}

// ─── Window-level drag/resize/pan listeners ──────────────────────────────────
// Attached to window on interaction start so fast mouse movement never loses events.
function attachWindowListeners() {
  window.addEventListener("mousemove", onGlobalMove);
  window.addEventListener("mouseup", onGlobalUp);
}
function detachWindowListeners() {
  window.removeEventListener("mousemove", onGlobalMove);
  window.removeEventListener("mouseup", onGlobalUp);
}

function onGlobalMove(e: MouseEvent) {
  if (panning.value && panStart.value) {
    panX.value = panStart.value.px + (e.clientX - panStart.value.mx);
    panY.value = panStart.value.py + (e.clientY - panStart.value.my);
    return;
  }
  if (dragging.value && dragStart.value && selected.value) {
    const dx = (e.clientX - dragStart.value.mx) / zoom.value;
    const dy = (e.clientY - dragStart.value.my) / zoom.value;
    selected.value.x = dragStart.value.ox + dx;
    selected.value.y = dragStart.value.oy + dy;
    return;
  }
  if (multiDragging.value && multiDragStart.value) {
    const dx = (e.clientX - multiDragStart.value.mx) / zoom.value;
    const dy = (e.clientY - multiDragStart.value.my) / zoom.value;
    artboard.value.elements
      .filter((el) => selectedIds.value.includes(el.id))
      .forEach((el) => {
        const orig = multiDragStart.value!.origins[el.id];
        if (!orig) return;
        el.x = orig.ox + dx;
        el.y = orig.oy + dy;
      });
    return;
  }
  if (resizing.value && resizeHandle.value && selected.value) {
    const h = resizeHandle.value;
    const dx = (e.clientX - h.mx) / zoom.value;
    const dy = (e.clientY - h.my) / zoom.value;
    const nb = computeResizeBBox({ x: h.ox, y: h.oy, w: h.ow, h: h.oh }, h.id, dx, dy, e.shiftKey, e.altKey);
    selected.value.x = nb.x;
    selected.value.y = nb.y;
    selected.value.width = nb.w;
    selected.value.height = nb.h;
    return;
  }
  if (multiResizing.value && multiResizeHandle.value) {
    const h = multiResizeHandle.value;
    const dx = (e.clientX - h.mx) / zoom.value;
    const dy = (e.clientY - h.my) / zoom.value;
    const nb = computeResizeBBox(h.bbox, h.id, dx, dy, e.shiftKey, e.altKey);
    const scaleX = nb.w / h.bbox.w;
    const scaleY = nb.h / h.bbox.h;
    artboard.value.elements
      .filter((el) => selectedIds.value.includes(el.id))
      .forEach((el) => {
        const orig = h.origins[el.id];
        if (!orig) return;
        el.x = nb.x + (orig.ox - h.bbox.x) * scaleX;
        el.y = nb.y + (orig.oy - h.bbox.y) * scaleY;
        el.width = Math.max(1, orig.ow * scaleX);
        el.height = Math.max(1, orig.oh * scaleY);
      });
    return;
  }
  if (marqueeActive.value && marqueeRect.value) {
    const pt = toArtboard(e.clientX, e.clientY);
    marqueeRect.value = { ...marqueeRect.value, x2: pt.x, y2: pt.y };
    return;
  }
  if (drawing.value && drawStart.value) {
    const pt = toArtboard(e.clientX, e.clientY);
    drawPreview.value = { x1: drawStart.value.x, y1: drawStart.value.y, x2: pt.x, y2: pt.y };
  }
}

function onGlobalUp(_e: MouseEvent) {
  detachWindowListeners();
  if (panning.value) {
    panning.value = false;
    panStart.value = null;
    return;
  }
  if (dragging.value) {
    dragging.value = false;
    dragStart.value = null;
    pushHistory();
    return;
  }
  if (multiDragging.value) {
    multiDragging.value = false;
    multiDragStart.value = null;
    pushHistory();
    return;
  }
  if (resizing.value) {
    resizing.value = false;
    resizeHandle.value = null;
    pushHistory();
    return;
  }
  if (multiResizing.value) {
    multiResizing.value = false;
    multiResizeHandle.value = null;
    pushHistory();
    return;
  }
  if (marqueeActive.value && marqueeRect.value) {
    const mr = marqueeRect.value;
    const mx1 = Math.min(mr.x1, mr.x2);
    const my1 = Math.min(mr.y1, mr.y2);
    const mx2 = Math.max(mr.x1, mr.x2);
    const my2 = Math.max(mr.y1, mr.y2);
    if (mx2 - mx1 > 3 && my2 - my1 > 3) {
      const hits = artboard.value.elements.filter(
        (el) => el.x < mx2 && el.x + el.width > mx1 && el.y < my2 && el.y + el.height > my1,
      );
      if (hits.length === 1) {
        selectedIds.value = [];
        selectEl(hits[0].id);
      } else if (hits.length > 1) {
        selectedIds.value = hits.map((h) => h.id);
        selectedId.value = null;
      } else {
        selectedId.value = null;
        selectedIds.value = [];
      }
    } else {
      // Tiny movement = plain click on canvas → clear selection
      selectedId.value = null;
      selectedIds.value = [];
    }
    marqueeActive.value = false;
    marqueeRect.value = null;
    return;
  }
  if (drawing.value && drawStart.value && drawPreview.value) {
    const x1 = Math.min(drawPreview.value.x1, drawPreview.value.x2);
    const y1 = Math.min(drawPreview.value.y1, drawPreview.value.y2);
    const w = Math.abs(drawPreview.value.x2 - drawPreview.value.x1);
    const h = Math.abs(drawPreview.value.y2 - drawPreview.value.y1);
    if (w > 3 && h > 3) {
      const tool = activeTool.value;
      if (tool === "rect" || tool === "ellipse") {
        addElement({
          type: tool,
          x: x1,
          y: y1,
          width: w,
          height: h,
          fill: "#3b82f6",
          stroke: "transparent",
          strokeWidth: 0,
        });
      } else if (tool === "text") {
        addElement({
          type: "text",
          x: x1,
          y: y1,
          width: w,
          height: h,
          text: "Text",
          fontSize: 32,
          fontWeight: "normal",
          color: "#000000",
          textAlign: "left",
          fontFamily: "MyriadPro-Black",
        });
      }
    }
    drawing.value = false;
    drawPreview.value = null;
    drawStart.value = null;
    activeTool.value = "select";
  }
}

// ─── Viewport mouse ───────────────────────────────────────────────────────────
function onViewportMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const pt = toArtboard(e.clientX, e.clientY);

  if (activeTool.value === "pan") {
    panning.value = true;
    panStart.value = { mx: e.clientX, my: e.clientY, px: panX.value, py: panY.value };
    attachWindowListeners();
    return;
  }
  if (activeTool.value === "select") {
    // Start a marquee — resolved on mouseup into a selection or plain deselect
    marqueeActive.value = true;
    marqueeRect.value = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    attachWindowListeners();
    return;
  }
  if (activeTool.value === "image") {
    fileInputEl.value?.click();
    return;
  }
  // Draw tools
  drawing.value = true;
  drawStart.value = { x: pt.x, y: pt.y };
  drawPreview.value = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
  attachWindowListeners();
}

function onViewportDblClick(_e: MouseEvent) {
  // deselect on double-click on empty canvas
}

// ─── Element mouse ────────────────────────────────────────────────────────────
function onElMouseDown(e: MouseEvent, el: DesignElement) {
  if (activeTool.value === "pan") return;
  if (activeTool.value !== "select") return;

  if (e.shiftKey) {
    // Toggle element in/out of multi-selection
    const idx = selectedIds.value.indexOf(el.id);
    if (idx === -1) {
      // Also pull in the currently single-selected element if there is one
      const base = selectedId.value && !selectedIds.value.includes(selectedId.value) ? [selectedId.value] : [];
      selectedIds.value = [...base, ...selectedIds.value.filter((id) => id !== selectedId.value), el.id];
    } else {
      selectedIds.value = selectedIds.value.filter((id) => id !== el.id);
    }
    selectedId.value = selectedIds.value.length === 1 ? selectedIds.value[0] : null;
    return;
  }

  // If already part of a multi-selection → start multi-drag instead of re-selecting
  if (selectedIds.value.length > 1 && selectedIds.value.includes(el.id)) {
    const origins: Record<string, { ox: number; oy: number }> = {};
    artboard.value.elements
      .filter((x) => selectedIds.value.includes(x.id))
      .forEach((x) => {
        origins[x.id] = { ox: x.x, oy: x.y };
      });
    multiDragging.value = true;
    multiDragStart.value = { mx: e.clientX, my: e.clientY, origins };
    attachWindowListeners();
    return;
  }

  // Normal single select + drag
  selectedIds.value = [];
  selectEl(el.id);
  dragging.value = true;
  dragStart.value = { mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y };
  attachWindowListeners();
}

// ─── Resize handles ───────────────────────────────────────────────────────────
const resizeHandles = computed(() => {
  const el = selected.value;
  if (!el) return [];
  const { x, y, width, height } = el;
  return [
    { id: "nw", x, y, cursor: "nwse-resize" },
    { id: "n", x: x + width / 2, y, cursor: "ns-resize" },
    { id: "ne", x: x + width, y, cursor: "nesw-resize" },
    { id: "e", x: x + width, y: y + height / 2, cursor: "ew-resize" },
    { id: "se", x: x + width, y: y + height, cursor: "nwse-resize" },
    { id: "s", x: x + width / 2, y: y + height, cursor: "ns-resize" },
    { id: "sw", x, y: y + height, cursor: "nesw-resize" },
    { id: "w", x, y: y + height / 2, cursor: "ew-resize" },
  ];
});

function onResizeHandleDown(e: MouseEvent, handle: { id: string }) {
  const el = selected.value;
  if (!el) return;
  resizing.value = true;
  resizeHandle.value = { id: handle.id, ox: el.x, oy: el.y, ow: el.width, oh: el.height, mx: e.clientX, my: e.clientY };
  attachWindowListeners();
}

// ─── Element helpers ──────────────────────────────────────────────────────────
function selectEl(id: string) {
  selectedId.value = id;
  selectedIds.value = [];
  activeTool.value = "select";
}

function addElement(partial: Partial<DesignElement>) {
  const count = artboard.value.elements.length;
  const el: DesignElement = {
    id: crypto.randomUUID(),
    name:
      partial.type === "text"
        ? "Text"
        : partial.type === "image"
          ? "Image"
          : `${partial.type === "rect" ? "Rectangle" : "Ellipse"} ${count + 1}`,
    type: "rect",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    opacity: 1,
    borderRadius: 0,
    strokeWidth: 0,
    ...partial,
  };
  artboard.value.elements.push(el);
  selectedId.value = el.id;
  selectedIds.value = [];
  pushHistory();
}

// ─── Multi-selection helpers ──────────────────────────────────────────────────
const multiSelectionBBox = computed(() => {
  if (selectedIds.value.length < 2) return null;
  const els = artboard.value.elements.filter((e) => selectedIds.value.includes(e.id));
  if (!els.length) return null;
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  const right = Math.max(...els.map((e) => e.x + e.width));
  const bottom = Math.max(...els.map((e) => e.y + e.height));
  return { x, y, width: right - x, height: bottom - y };
});

const multiResizeHandles = computed(() => {
  const b = multiSelectionBBox.value;
  if (!b) return [];
  const { x, y, width, height } = b;
  return [
    { id: "nw", x, y, cursor: "nwse-resize" },
    { id: "n", x: x + width / 2, y, cursor: "ns-resize" },
    { id: "ne", x: x + width, y, cursor: "nesw-resize" },
    { id: "e", x: x + width, y: y + height / 2, cursor: "ew-resize" },
    { id: "se", x: x + width, y: y + height, cursor: "nwse-resize" },
    { id: "s", x: x + width / 2, y: y + height, cursor: "ns-resize" },
    { id: "sw", x, y: y + height, cursor: "nesw-resize" },
    { id: "w", x, y: y + height / 2, cursor: "ew-resize" },
  ];
});

function multiElOutlineStyle(id: string) {
  const el = artboard.value.elements.find((e) => e.id === id);
  if (!el) return {};
  return { left: el.x - 1 + "px", top: el.y - 1 + "px", width: el.width + 2 + "px", height: el.height + 2 + "px" };
}

/**
 * Compute a new bounding box for a resize drag.
 * Shift = maintain aspect ratio (corners only).
 * Alt   = resize from centre (mirror opposite edge).
 */
function computeResizeBBox(
  orig: { x: number; y: number; w: number; h: number },
  handleId: string,
  dx: number,
  dy: number,
  shiftKey: boolean,
  altKey: boolean,
): { x: number; y: number; w: number; h: number } {
  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.w;
  let bottom = orig.y + orig.h;

  if (handleId.includes("w")) left = orig.x + dx;
  if (handleId.includes("e")) right = orig.x + orig.w + dx;
  if (handleId.includes("n")) top = orig.y + dy;
  if (handleId.includes("s")) bottom = orig.y + orig.h + dy;

  // Alt: mirror the opposite edge (resize from centre)
  if (altKey) {
    if (handleId.includes("w")) right = orig.x + orig.w - dx;
    if (handleId.includes("e")) left = orig.x - dx;
    if (handleId.includes("n")) bottom = orig.y + orig.h - dy;
    if (handleId.includes("s")) top = orig.y - dy;
  }

  // Shift: lock aspect ratio (corner handles only)
  if (shiftKey && handleId.length === 2) {
    const aspect = orig.w / orig.h;
    const nw = Math.abs(right - left);
    const nh = Math.abs(bottom - top);
    if (nw / nh > aspect) {
      const ch = nw / aspect;
      if (handleId.includes("n")) top = bottom - ch;
      else bottom = top + ch;
    } else {
      const cw = nh * aspect;
      if (handleId.includes("w")) left = right - cw;
      else right = left + cw;
    }
  }

  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

function onMultiBBoxMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const origins: Record<string, { ox: number; oy: number }> = {};
  artboard.value.elements
    .filter((el) => selectedIds.value.includes(el.id))
    .forEach((el) => {
      origins[el.id] = { ox: el.x, oy: el.y };
    });
  multiDragging.value = true;
  multiDragStart.value = { mx: e.clientX, my: e.clientY, origins };
  attachWindowListeners();
}

function onMultiResizeHandleDown(e: MouseEvent, handle: { id: string }) {
  const b = multiSelectionBBox.value;
  if (!b) return;
  const origins: Record<string, { ox: number; oy: number; ow: number; oh: number }> = {};
  artboard.value.elements
    .filter((el) => selectedIds.value.includes(el.id))
    .forEach((el) => {
      origins[el.id] = { ox: el.x, oy: el.y, ow: el.width, oh: el.height };
    });
  multiResizing.value = true;
  multiResizeHandle.value = {
    id: handle.id,
    bbox: { x: b.x, y: b.y, w: b.width, h: b.height },
    origins,
    mx: e.clientX,
    my: e.clientY,
  };
  attachWindowListeners();
}

function deleteMultiple() {
  const toDelete = new Set(selectedIds.value);
  artboard.value.elements = artboard.value.elements.filter((e) => !toDelete.has(e.id));
  selectedIds.value = [];
  selectedId.value = null;
  pushHistory();
}

function addRect() {
  addElement({
    type: "rect",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    fill: "#3b82f6",
    stroke: "transparent",
    strokeWidth: 0,
  });
}
function addEllipse() {
  addElement({
    type: "ellipse",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    fill: "#22c55e",
    stroke: "transparent",
    strokeWidth: 0,
  });
}
function addText() {
  addElement({
    type: "text",
    x: 100,
    y: 100,
    width: 400,
    height: 80,
    text: "Text",
    fontSize: 48,
    fontWeight: "normal",
    color: "#000000",
    textAlign: "left",
    fontFamily: "MyriadPro-Black",
  });
}

function openAddMenu() {
  addRect();
}

function deleteElement(id: string) {
  artboard.value.elements = artboard.value.elements.filter((e) => e.id !== id);
  if (selectedId.value === id) selectedId.value = null;
  pushHistory();
}

function moveLayer(dir: 1 | -1) {
  const arr = artboard.value.elements;
  const idx = arr.findIndex((e) => e.id === selectedId.value);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  const [el] = arr.splice(idx, 1);
  arr.splice(newIdx, 0, el);
  pushHistory();
}

// ─── Text editing ─────────────────────────────────────────────────────────────
function startTextEdit(el: DesignElement) {
  editingTextId.value = el.id;
  nextTick(() => {
    (textareaEl.value as any)?.[0]?.focus?.() ?? textareaEl.value?.focus();
  });
}
function commitTextEdit() {
  editingTextId.value = null;
  pushHistory();
}

// ─── Background removal ────────────────────────────────────────────────────
const removingBg = ref(false);
async function removeBg() {
  const el = selected.value;
  if (!el || el.type !== "image" || !el.src) return;
  removingBg.value = true;
  try {
    // 0. Load the original image first to get its TRUE pixel dimensions.
    //    @imgly/background-removal may internally rescale to ≤1024px, so the
    //    result blob dimensions (nw/nh) can differ from the original. We need
    //    the original size so the artboard-unit ↔ pixel scale is correct.
    const origImg = new window.Image();
    if (!el.src.startsWith("data:")) origImg.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      origImg.onload = () => res();
      origImg.onerror = rej;
      origImg.src = el.src!;
    });
    const origNw = origImg.naturalWidth,
      origNh = origImg.naturalHeight;

    // 1. Run AI background removal
    const resultBlob = await removeBackground(el.src);

    // 2. Draw on canvas to find tight non-transparent crop
    const img = new window.Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = URL.createObjectURL(resultBlob);
    });
    const nw = img.naturalWidth,
      nh = img.naturalHeight;

    // Scale from result-blob pixels → original-image pixels
    // (needed because the library may internally downscale for the model)
    const rsx = origNw / nw,
      rsy = origNh / nh;

    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, nw, nh);
    const data = imageData.data;

    // Snap alpha: cast shadows / fringe halos ≤ 200 → fully transparent
    for (let i = 3; i < data.length; i += 4) {
      data[i] = data[i] < 200 ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);

    let x0 = nw,
      y0 = nh,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const a = data[(y * nw + x) * 4 + 3];
        if (a > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) {
      x0 = 0;
      y0 = 0;
      x1 = nw - 1;
      y1 = nh - 1;
    }

    // 3. Crop to tight bbox
    const cropW = x1 - x0 + 1,
      cropH = y1 - y0 + 1;
    const crop = document.createElement("canvas");
    crop.width = cropW;
    crop.height = cropH;
    crop.getContext("2d")!.drawImage(canvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
    const newSrc = crop.toDataURL("image/png");

    // 4. Map crop coordinates from result-blob space → original-pixel space,
    //    then convert to artboard units using the original image dimensions.
    const scaleX = el.width / origNw,
      scaleY = el.height / origNh;
    el.x = el.x + x0 * rsx * scaleX;
    el.y = el.y + y0 * rsy * scaleY;
    el.width = cropW * rsx * scaleX;
    el.height = cropH * rsy * scaleY;
    el.src = newSrc;
    el.objectFit = "contain";
    pushHistory();
    // Await the full upload so navigating away immediately after still persists the result.
    await saveNow();
  } catch (e) {
    console.error("Background removal failed", e);
  } finally {
    removingBg.value = false;
  }
}

// ─── Text auto-size ─────────────────────────────────────────────────────────
function applyAutoSize(el: DesignElement) {
  if (!el.text) return;
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    top: "-9999px",
    left: "0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: (el.fontSize ?? 16) + "px",
    fontWeight: el.fontWeight ?? "normal",
    fontFamily: el.fontFamily ?? "inherit",
    lineHeight: "1.2",
    // No maxWidth — let the text determine its own natural width and height
    width: "max-content",
  });
  probe.textContent = el.text;
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  el.width = Math.ceil(rect.width) + 16; // generous padding so overflow:hidden never clips
  el.height = Math.ceil(rect.height) + 16;
  document.body.removeChild(probe);
}

function autoSizeAll() {
  const textEls = artboard.value.elements.filter((e) => e.type === "text");
  if (!textEls.length) return;
  textEls.forEach((e) => {
    e.autoSize = true;
    applyAutoSize(e);
  });
  pushHistory();
}

// Re-apply auto-size only when the same element's text/font values actually change.
// Tracking the id prevents firing on re-selection (null → [values] transition).
watch(
  () => {
    const s = selected.value;
    if (!s || s.type !== "text" || !s.autoSize) return null;
    return { id: s.id, text: s.text, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily };
  },
  (val, prev) => {
    if (!val || !prev) return; // selection appeared/disappeared — skip
    if (val.id !== prev.id) return; // different element selected — skip
    applyAutoSize(selected.value!);
  },
);

// ─── Image pick ───────────────────────────────────────────────────────────────
let _pendingImageElId: string | null = null;
function onFilePick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = "";
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result as string;
    if (_pendingImageElId) {
      const el = artboard.value.elements.find((e) => e.id === _pendingImageElId);
      if (el) {
        el.src = src;
        pushHistory();
      }
      _pendingImageElId = null;
    } else if (selected.value?.type === "image") {
      selected.value.src = src;
      pushHistory();
    } else {
      addElement({
        type: "image",
        x: 50,
        y: 50,
        width: 400,
        height: 300,
        src,
        objectFit: "contain",
        offsetX: 0,
        offsetY: 0,
      });
    }
  };
  reader.readAsDataURL(file);
}

// Watch activeTool to auto open file picker for image tool
watch(activeTool, (t) => {
  if (t === "image") {
    _pendingImageElId = null;
  }
});

// ─── SVG import ───────────────────────────────────────────────────────────────
function onSvgPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = "";
  const reader = new FileReader();
  reader.onload = () => importSvg(reader.result as string);
  reader.readAsText(file);
}

function importSvg(text: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const svgEl = doc.documentElement as SVGSVGElement;

  // ── 1. Artboard size from viewBox / width / height ──────────────────────────
  let aw = parseFloat(svgEl.getAttribute("width") ?? "0");
  let ah = parseFloat(svgEl.getAttribute("height") ?? "0");
  const vb = svgEl.getAttribute("viewBox");
  if (vb) {
    const pts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (!aw && pts[2]) aw = pts[2];
    if (!ah && pts[3]) ah = pts[3];
  }
  if (!aw || isNaN(aw)) aw = 1920;
  if (!ah || isNaN(ah)) ah = 1080;

  // ── 2. Temporarily render the SVG in DOM to use getBBox() ───────────────────
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  host.setAttribute("width", String(aw));
  host.setAttribute("height", String(ah));
  host.setAttribute("viewBox", vb ?? `0 0 ${aw} ${ah}`);
  Object.assign(host.style, {
    position: "fixed",
    top: "-9999px",
    left: "-9999px",
    opacity: "0",
    pointerEvents: "none",
  });
  // Copy <defs> so gradients / clip-paths resolve
  for (const child of svgEl.children) {
    if (child.tagName.toLowerCase() === "defs") host.appendChild(child.cloneNode(true));
  }
  document.body.appendChild(host);

  const elements: DesignElement[] = [];
  let svgBackground = "#ffffff";

  function attr(el: Element, ...names: string[]): string {
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v) return v;
    }
    return "";
  }
  function resolveColor(v: string, fallback = "transparent"): string {
    return !v || v === "none" ? fallback : v;
  }
  function getBbox(node: SVGGraphicsElement): DOMRect | null {
    const clone = node.cloneNode(true) as SVGGraphicsElement;
    host.appendChild(clone);
    let bb: DOMRect | null = null;
    try {
      bb = clone.getBBox();
    } catch {}
    host.removeChild(clone);
    return bb && (bb.width > 0 || bb.height > 0) ? bb : null;
  }

  function processNode(node: Element, depth = 0) {
    if (depth > 20) return;
    const tag = node.tagName.replace(/.*:/, "").toLowerCase();

    // Skip non-visual nodes
    if (["defs", "style", "title", "desc", "metadata", "symbol", "clippath", "mask", "filter"].includes(tag)) return;

    if (tag === "g") {
      for (const child of node.children) processNode(child, depth + 1);
      return;
    }

    const opacity = parseFloat(attr(node, "opacity") || "1");
    const fill = resolveColor(
      attr(node, "fill") ||
        node
          .getAttribute("style")
          ?.match(/fill:\s*([^;]+)/)?.[1]
          ?.trim() ||
        "",
      "#000000",
    );
    const stroke = resolveColor(attr(node, "stroke"));
    const sw = parseFloat(attr(node, "stroke-width") || "0");

    // Background rect detection: first rect that covers the whole artboard
    if (tag === "rect" && elements.length === 0) {
      const rx = parseFloat(attr(node, "x") || "0");
      const ry = parseFloat(attr(node, "y") || "0");
      const rw = parseFloat(attr(node, "width") || "0");
      const rh = parseFloat(attr(node, "height") || "0");
      if (rx <= 0 && ry <= 0 && rw >= aw * 0.95 && rh >= ah * 0.95 && fill !== "transparent") {
        svgBackground = fill;
        return; // treat as artboard background, not an element
      }
    }

    const gfx = node as SVGGraphicsElement;
    const bb = getBbox(gfx);
    if (!bb) {
      console.warn("importSvg ignored node because getBBox failed:", tag, node.outerHTML);
      return;
    }

    if (tag === "rect") {
      elements.push({
        id: crypto.randomUUID(),
        name: "Rectangle",
        type: "rect",
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        opacity,
        fill,
        stroke,
        strokeWidth: sw,
        borderRadius: parseFloat(attr(node, "rx", "ry") || "0"),
      });
    } else if (tag === "circle" || tag === "ellipse") {
      elements.push({
        id: crypto.randomUUID(),
        name: "Ellipse",
        type: "ellipse",
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        opacity,
        fill,
        stroke,
        strokeWidth: sw,
      });
    } else if (tag === "text") {
      const content = (node as SVGTextElement).textContent ?? "";
      const fontSize = parseFloat(attr(node, "font-size") || "16");
      const fw = attr(node, "font-weight") || "normal";
      const anchor = attr(node, "text-anchor");
      const align = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
      elements.push({
        id: crypto.randomUUID(),
        name: content.slice(0, 20) || "Text",
        type: "text",
        x: bb.x,
        y: bb.y,
        width: Math.max(bb.width, 60),
        height: Math.max(bb.height, fontSize * 1.4),
        opacity,
        text: content,
        fontSize,
        fontWeight: fw,
        color: fill === "transparent" ? "#000000" : fill,
        textAlign: align,
        fontFamily: attr(node, "font-family") || "inherit",
      });
    } else if (tag === "image") {
      const href = attr(node, "href", "xlink:href");
      elements.push({
        id: crypto.randomUUID(),
        name: "Image",
        type: "image",
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        opacity,
        src: href,
        objectFit: "contain",
        offsetX: 0,
        offsetY: 0,
      });
    } else {
      // path, polygon, polyline, line, use — embed as inline SVG image
      const snippet = `<svg xmlns="http://www.w3.org/2000/svg" width="${bb.width}" height="${bb.height}" viewBox="${bb.x} ${bb.y} ${bb.width} ${bb.height}">${(node as Element).outerHTML}</svg>`;
      const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(snippet);
      elements.push({
        id: crypto.randomUUID(),
        name: tag.charAt(0).toUpperCase() + tag.slice(1),
        type: "image",
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        opacity,
        src: dataUrl,
        objectFit: "contain",
        offsetX: 0,
        offsetY: 0,
      });
    }
  }

  for (const child of svgEl.children) processNode(child);
  document.body.removeChild(host);

  // ── 3. Apply to artboard ────────────────────────────────────────────────────
  artboard.value.width = aw;
  artboard.value.height = ah;
  artboard.value.background = svgBackground;
  artboard.value.elements = elements;
  selectedId.value = elements[elements.length - 1]?.id ?? null;
  pushHistory();
  nextTick(() => fitToScreen());
}

// ─── Element CSS style ────────────────────────────────────────────────────────
function elStyle(el: DesignElement) {
  const base: Record<string, string | number> = {
    left: el.x + "px",
    top: el.y + "px",
    width: el.width + "px",
    height: el.height + "px",
    opacity: el.opacity ?? 1,
    borderRadius: el.type === "ellipse" ? "50%" : (el.borderRadius ?? 0) + "px",
  };
  if (el.type === "rect" || el.type === "ellipse") {
    base.background = el.fill ?? "transparent";
    if (el.strokeWidth && el.stroke) {
      base.outline = `${el.strokeWidth}px solid ${el.stroke}`;
      base.outlineOffset = `-${el.strokeWidth}px`;
    }
  }
  if (el.type === "text") {
    base.color = el.color ?? "#000";
    base.fontSize = (el.fontSize ?? 16) + "px";
    base.fontWeight = el.fontWeight ?? "normal";
    base.textAlign = el.textAlign ?? "left";
    base.fontFamily = el.fontFamily ?? "inherit";
    base.lineHeight = "1.2";
    base.padding = "4px";
  }
  return base;
}

// ─── Element icon for layers panel ───────────────────────────────────────────
function elementIcon(el: DesignElement) {
  if (el.type === "rect") return Square;
  if (el.type === "ellipse") return Circle;
  if (el.type === "text") return Type;
  return ImageIcon;
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function exportCanvas() {
  const ab = artboard.value;
  const canvas = document.createElement("canvas");
  canvas.width = ab.width;
  canvas.height = ab.height;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = ab.background;
  ctx.fillRect(0, 0, ab.width, ab.height);

  for (const el of ab.elements) {
    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;

    if (el.type === "rect" || el.type === "ellipse") {
      const r = el.borderRadius ?? 0;
      ctx.fillStyle = el.fill ?? "transparent";
      ctx.beginPath();
      if (el.type === "ellipse") {
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(el.x, el.y, el.width, el.height, r);
      }
      ctx.fill();
      if (el.strokeWidth && el.stroke) {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
      }
    }

    if (el.type === "text" && el.text) {
      ctx.fillStyle = el.color ?? "#000";
      ctx.font = `${el.fontWeight ?? "normal"} ${el.fontSize ?? 16}px ${el.fontFamily ?? "sans-serif"}`;
      ctx.textAlign = (el.textAlign as CanvasTextAlign) ?? "left";
      ctx.textBaseline = "top";
      const lines = el.text.split("\n");
      const lh = (el.fontSize ?? 16) * 1.2;
      for (let i = 0; i < lines.length; i++) {
        const tx =
          el.textAlign === "center" ? el.x + el.width / 2 : el.textAlign === "right" ? el.x + el.width : el.x + 4;
        ctx.fillText(lines[i], tx, el.y + 4 + i * lh);
      }
    }

    if (el.type === "image" && el.src) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        // Required for cross-origin CDN images (Supabase) so canvas.toDataURL()
        // doesn't throw a SecurityError about tainted canvases.
        if (!el.src!.startsWith("data:")) img.crossOrigin = "anonymous";
        img.onload = () => {
          if (el.objectFit === "cover") {
            const scale = Math.max(el.width / img.width, el.height / img.height);
            const sw = img.width * scale,
              sh = img.height * scale;
            const sx = ((el.width - sw) * ((el.offsetX ?? 0) + 100)) / 200;
            const sy = ((el.height - sh) * ((el.offsetY ?? 0) + 100)) / 200;
            ctx.save();
            ctx.beginPath();
            ctx.rect(el.x, el.y, el.width, el.height);
            ctx.clip();
            ctx.drawImage(img, el.x + sx, el.y + sy, sw, sh);
            ctx.restore();
          } else {
            const scale = Math.min(el.width / img.width, el.height / img.height);
            const sw = img.width * scale,
              sh = img.height * scale;
            ctx.drawImage(img, el.x + (el.width - sw) / 2, el.y + (el.height - sh) / 2, sw, sh);
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = el.src!;
      });
    }

    ctx.restore();
  }

  const mimeType = exportFormat.value === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = canvas.toDataURL(mimeType, 0.95);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${project.value?.name ?? "design"}.${exportFormat.value}`;
  a.click();
}
</script>

<style scoped>
/* Prevent layout scrollbars — the editor is a fixed overlay */
:global(body) {
  overflow: hidden;
}
</style>
