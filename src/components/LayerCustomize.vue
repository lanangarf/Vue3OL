<script setup>
import { ref } from "vue";
import IconPickerModal from "./IconPickerModal.vue";

const props = defineProps({
  drawLayers:    { type: Array,          required: true },
  activeLayerId: { type: [Number, null], default: null  },
  colorPalette:  { type: Array,          required: true },
});

const emit = defineEmits([
  "update:activeLayerId",
  "addLayer",
  "openLayerMenu",
  "finishRename",
  "deleteFeature",
  "openPopup",
  "zoomToFeature",
  "updateLayerStyle",  // (layerId, { icon, color })
  "reorderLayers",     // (fromIndex, toIndex)
]);

// State modal
const modalLayerId = ref(null);  // layer yang sedang dibuka modal-nya

function openIconModal(e, layerId) {
  e.stopPropagation();
  modalLayerId.value = layerId;
}

function onModalConfirm({ icon, color }) {
  const layer = props.drawLayers.find(l => l.id === modalLayerId.value);
  if (layer) {
    layer.icon  = icon;
    layer.color = color;
    emit("updateLayerStyle", layer.id, { icon, color });
  }
  modalLayerId.value = null;
}

function clearIcon(e, layer) {
  e.stopPropagation();
  layer.icon = null;
  emit("updateLayerStyle", layer.id, { icon: null, color: layer.color });
}

// ── Drag & drop reorder ──────────────────────────────────────────────────────
const dragFromIndex = ref(null);
const dragOverIndex = ref(null);

function onDragStart(e, index) {
  dragFromIndex.value = index;
  e.dataTransfer.effectAllowed = "move";
  // Minimal ghost — pakai teks nama layer supaya bawaan browser tidak terlalu besar
  e.dataTransfer.setData("text/plain", String(index));
}

function onDragOver(e, index) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dragOverIndex.value = index;
}

function onDragLeave() {
  // Kosongkan hanya kalau drag keluar dari seluruh list, bukan antar item
  // Dibersihkan di onDrop / onDragEnd
}

function onDrop(e, toIndex) {
  e.preventDefault();
  const from = dragFromIndex.value;
  if (from !== null && from !== toIndex) {
    emit("reorderLayers", from, toIndex);
  }
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}
</script>

<template>
  <div class="lc-root">
  <aside class="left-sidebar" @click.stop>
    <!-- Header -->
    <div class="sb-hd">
      <span class="sb-title">Lapisan Buatan</span>
      <button class="sb-add" @click="emit('addLayer')" title="Tambah lapisan">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Layer list -->
    <div class="sb-body">
      <div
        v-for="(layer, index) in drawLayers" :key="layer.id"
        :class="[
          'sb-layer',
          activeLayerId === layer.id ? 'is-active' : '',
          dragOverIndex === index && dragFromIndex !== index ? 'is-drag-over' : '',
          dragFromIndex === index ? 'is-dragging' : '',
        ]"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <!-- Layer row -->
        <div class="sb-layer-row"
          @click="emit('update:activeLayerId', layer.id); layer.expanded = !layer.expanded">

          <!-- Drag handle -->
          <span class="sb-drag-handle" title="Seret untuk ubah urutan" @click.stop>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
            </svg>
          </span>

          <!-- Toggle visibility -->
          <button class="sb-vis" @click.stop="layer.visible = !layer.visible"
            :title="layer.visible ? 'Sembunyikan' : 'Tampilkan'">
            <svg v-if="layer.visible" width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>

          <!-- Color dot -->
          <span class="sb-dot" :style="{ background: layer.color }"/>

          <!-- Name / rename input -->
          <input v-if="layer.editing" v-model="layer.name" class="sb-name-inp"
            @blur="emit('finishRename', layer)"
            @keydown.enter="emit('finishRename', layer)"
            @click.stop autofocus/>
          <span v-else class="sb-name" :class="{ muted: !layer.visible }" :title="layer.name">
            {{ layer.name }}
          </span>

          <!-- Feature count badge -->
          <span v-if="layer.features.length" class="sb-cnt">{{ layer.features.length }}</span>

          <!-- Context menu trigger -->
          <button class="sb-menu" @click.stop="emit('openLayerMenu', $event, layer.id)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>

          <!-- Expand chevron -->
          <svg class="sb-chev" :class="{ open: layer.expanded }" width="10" height="10"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        <!-- Layer detail (expanded) -->
        <div v-show="layer.expanded" class="sb-layer-detail">
          <!-- Opacity slider -->
          <div class="sb-opc-row">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a10 10 0 010 20z" fill="currentColor"/>
            </svg>
            <input type="range" class="sb-slider" v-model.number="layer.opacity" min="0" max="1" step="0.05"/>
            <span class="sb-pct">{{ Math.round(layer.opacity * 100) }}%</span>
          </div>

          <!-- Color swatches -->
          <div class="sb-swatches">
            <span v-for="c in colorPalette" :key="c" class="sb-swatch"
              :style="{ background: c, boxShadow: layer.color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : '' }"
              @click.stop="layer.color = c"/>
          </div>

          <!-- Icon picker trigger → buka modal -->
          <!-- <div class="sb-icon-row">
            <button
              class="sb-icon-btn"
              :style="{ background: layer.color }"
              :title="layer.icon ? 'Ganti ikon: ' + layer.icon : 'Pilih ikon'"
              @click.stop="openIconModal($event, layer.id)"
            >
              <span class="material-symbols-outlined sb-icon-sym">
                {{ layer.icon || 'add_location' }}
              </span>
            </button>
            <span class="sb-icon-label">
              {{ layer.icon ? layer.icon.replace(/_/g, ' ') : 'Pilih ikon & warna…' }}
            </span>
            <button v-if="layer.icon" class="sb-icon-clear" @click.stop="clearIcon($event, layer)" title="Hapus ikon">
              <svg width="9" height="9" viewBox="0 0 12 12">
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </div> -->

          <!-- Feature list -->
          <div class="sb-feat-list">
            <div v-if="!layer.features.length" class="sb-feat-empty">Belum ada objek</div>
            <div v-for="feat in layer.features" :key="feat.id" class="sb-feat-item"
              @click.stop="emit('update:activeLayerId', layer.id); emit('zoomToFeature', feat); emit('openPopup', layer, feat)">
              <span class="sb-feat-dot" :style="{ background: feat.color }"/>
              <span class="sb-feat-name" :title="feat.name">{{ feat.name }}</span>
              <span v-if="feat.desc" class="sb-feat-desc-ind" title="Ada deskripsi">●</span>
              <button class="sb-feat-del" @click.stop="emit('deleteFeature', layer.id, feat.id)">
                <svg width="9" height="9" viewBox="0 0 12 12">
                  <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Modal Pilih Ikon — Teleport ke body, tidak terpengaruh posisi sidebar -->
  <IconPickerModal
    v-if="modalLayerId !== null"
    :modelValue="drawLayers.find(l => l.id === modalLayerId)?.icon || 'place'"
    :color="drawLayers.find(l => l.id === modalLayerId)?.color || '#1a73e8'"
    :colorPalette="colorPalette"
    :title="'Ikon & Warna — ' + (drawLayers.find(l => l.id === modalLayerId)?.name || 'Lapisan')"
    @confirm="onModalConfirm"
    @close="modalLayerId = null"
  />
  </div>
</template>

<style scoped>
.lc-root{position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;}
.lc-root>.left-sidebar{pointer-events:all;}
.left-sidebar{position:absolute;top:50px;left:0;width:240px;height:calc(100vh - 50px);background:rgba(255,255,255,0.97);backdrop-filter:blur(12px);box-shadow:2px 0 16px rgba(0,0,0,0.12);z-index:500;display:flex;flex-direction:column;overflow:hidden;}
.sb-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px;border-bottom:1px solid rgba(0,0,0,0.07);flex-shrink:0;}
.sb-title{font-size:12px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.5px;}
.sb-add{width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;background:rgba(26,115,232,0.12);color:#1a73e8;display:flex;align-items:center;justify-content:center;transition:background .12s;}
.sb-add:hover{background:rgba(26,115,232,0.25);}
.sb-body{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;}
.sb-body::-webkit-scrollbar{width:3px;}
.sb-body::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:2px;}
.sb-drag-handle{display:flex;align-items:center;cursor:grab;color:#d1d5db;padding:2px 1px;border-radius:3px;flex-shrink:0;transition:color .12s;}
.sb-drag-handle:hover{color:#9ca3af;}
.sb-drag-handle:active{cursor:grabbing;}
.sb-layer.is-drag-over{border-top:2px solid #3b82f6;background:rgba(59,130,246,0.04);}
.sb-layer.is-dragging{opacity:0.45;}
.sb-layer{border-left:3px solid transparent;transition:border-color .15s;}
.sb-layer.is-active{border-left-color:#3b82f6;}
.sb-layer-row{display:flex;align-items:center;gap:5px;padding:7px 8px 6px 6px;cursor:pointer;transition:background .11s;}
.sb-layer-row:hover{background:rgba(0,0,0,0.025);}
.sb-vis{background:none;border:none;cursor:pointer;color:#bbb;padding:2px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;transition:color .12s;}
.sb-vis:hover{color:#3b82f6;}
.sb-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2);}
.sb-name{flex:1;font-size:12px;font-weight:600;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sb-name.muted{color:#ccc;text-decoration:line-through;}
.sb-name-inp{flex:1;font-size:12px;font-weight:600;border:1.5px solid #3b82f6;border-radius:4px;padding:2px 5px;outline:none;min-width:0;}
.sb-cnt{font-size:10px;background:#e8f0fe;color:#1a73e8;border-radius:10px;padding:1px 5px;font-weight:700;flex-shrink:0;}
.sb-menu{background:none;border:none;cursor:pointer;color:#ccc;padding:2px 3px;border-radius:4px;display:flex;align-items:center;flex-shrink:0;}
.sb-menu:hover{color:#555;background:rgba(0,0,0,0.06);}
.sb-chev{color:#ccc;transition:transform .16s;flex-shrink:0;}
.sb-chev.open{transform:rotate(180deg);}
.sb-layer-detail{padding:0 8px 8px 10px;}
.sb-opc-row{display:flex;align-items:center;gap:6px;padding:3px 0;color:#ccc;}
.sb-slider{flex:1;height:3px;accent-color:#3b82f6;cursor:pointer;}
.sb-pct{font-size:10px;color:#aaa;width:26px;text-align:right;flex-shrink:0;}
.sb-swatches{display:flex;gap:4px;flex-wrap:wrap;padding:3px 0 5px;}
.sb-swatch{width:14px;height:14px;border-radius:50%;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .1s;flex-shrink:0;}
.sb-swatch:hover{transform:scale(1.25);}

/* Icon row */
.sb-icon-row{display:flex;align-items:center;gap:6px;padding:3px 0 5px;position:relative;}
.sb-icon-btn{width:24px;height:24px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .12s,box-shadow .12s;box-shadow:0 2px 6px rgba(0,0,0,.2);}
.sb-icon-btn:hover{transform:scale(1.1);box-shadow:0 3px 10px rgba(0,0,0,.25);}
.sb-icon-sym{font-size:14px;color:#fff;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;}
.sb-icon-label{flex:1;font-size:10.5px;color:#666;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sb-icon-clear{background:none;border:none;cursor:pointer;color:#ccc;padding:2px;border-radius:3px;display:flex;align-items:center;flex-shrink:0;}
.sb-icon-clear:hover{background:#fee2e2;color:#dc2626;}

.sb-feat-list{padding:2px 0 2px;}
.sb-feat-empty{font-size:10.5px;color:#ccc;padding:3px 2px;font-style:italic;}
.sb-feat-item{display:flex;align-items:center;gap:5px;padding:3px 4px;border-radius:5px;cursor:pointer;transition:background .1s;}
.sb-feat-item:hover{background:#eff6ff;}
.sb-feat-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.sb-feat-name{flex:1;font-size:11px;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sb-feat-desc-ind{font-size:7px;color:#3b82f6;flex-shrink:0;}
.sb-feat-del{background:none;border:none;cursor:pointer;color:#ddd;padding:2px;border-radius:3px;display:flex;align-items:center;flex-shrink:0;}
.sb-feat-del:hover{background:#fee2e2;color:#dc2626;}
</style>