<script setup>

const props = defineProps({
  activeTool:     { type: String,  default: null },
  drawLayers:     { type: Array,   required: true },
  activeLayerId:  { type: [Number,null], default: null },
  layerPanelOpen: { type: Boolean, default: true },
  klOpen:         { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:activeTool",
  "update:layerPanelOpen",
  "update:klOpen",
  "addLayer",
]);

const toolDefs = [
  { id: "Point",      title: "Titik",       svg: `<circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>` },
  { id: "LineString", title: "Garis",       svg: `<polyline points="3,18 8,8 15,13 21,4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="18" r="2" fill="currentColor"/><circle cx="21" cy="4" r="2" fill="currentColor"/>` },
  { id: "Polygon",    title: "Poligon",     svg: `<polygon points="12,3 21,9 18,20 6,20 3,9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="3" r="2" fill="currentColor"/><circle cx="21" cy="9" r="2" fill="currentColor"/><circle cx="18" cy="20" r="2" fill="currentColor"/><circle cx="6" cy="20" r="2" fill="currentColor"/><circle cx="3" cy="9" r="2" fill="currentColor"/>` },
  { id: "Circle",     title: "Lingkaran",   svg: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2" fill="currentColor"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/>` },
  { id: "modify",     title: "Edit Shape",  svg: `<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>` },
  { id: "delete",     title: "Hapus Shape", svg: `<polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, danger: true },
];

function toggleTool(id) {
  emit("update:activeTool", props.activeTool === id ? null : id);
}
function clearTool() {
  emit("update:activeTool", null);
}
function toggleLayerPanel(e) {
  e.stopPropagation();
  emit("update:layerPanelOpen", !props.layerPanelOpen);
}
function toggleKL(e) {
  e.stopPropagation();
  emit("update:klOpen", !props.klOpen);
}

const activeLayer = () => props.drawLayers.find(l => l.id === props.activeLayerId);
</script>

<template>
  <div class="topbar" @click.stop>
    <!-- ── Kiri: Buat Lapisan ── -->
    <div class="tb-left">
      <button class="tb-lapisan-btn" @click="toggleLayerPanel">
        <svg class="tb-chev" :class="{ open: layerPanelOpen }" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor">
          <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Zm-280-80h-80v-280q0-33 23.5-56.5T160-880h280v80H160v280Z"/>
        </svg>
        <span>Buat Lapisan</span>
      </button>
    </div>

    <!-- ── Tengah: Draw Tools ── -->
    <div class="tb-center">
      <!-- Cursor / cancel -->
      <button
        :class="['tb-tool', !activeTool ? 'tb-tool-primary' : '']"
        @click="clearTool"
        title="Pilih / batalkan">
        <span class="tb-icon" v-html="`<svg width='17' height='17' viewBox='0 0 24 24' fill='none'><path d='M5 3l14 9-7 1-4 7z' stroke='currentColor' stroke-width='2' stroke-linejoin='round' fill='${!activeTool ? '#fff' : 'none'}'/></svg>`"/>
      </button>
      <div class="tb-sep"/>

      <!-- Tool buttons -->
      <button
        v-for="tool in toolDefs" :key="tool.id"
        :class="['tb-tool', activeTool === tool.id ? (tool.danger ? 'tb-tool-danger' : 'tb-tool-active') : '']"
        @click="toggleTool(tool.id)"
        :title="tool.title">
        <span class="tb-icon" v-html="`<svg width='17' height='17' viewBox='0 0 24 24' fill='none'>${tool.svg}</svg>`"/>
      </button>

      <div class="tb-sep"/>

      <!-- Indikator warna lapisan aktif -->
      <div class="tb-layer-dot-wrap" :title="`Lapisan aktif: ${activeLayer()?.name || '—'}`">
        <span class="tb-active-dot" :style="{ background: activeLayer()?.color || '#ccc' }"/>
      </div>
    </div>

    <!-- ── Kanan: Kontrol Lapisan (tombol saja, panel di parent/LayerControlPanel) ── -->
    <div class="tb-right">
      <button class="tb-kl-btn" @click="toggleKL">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>Kontrol Lapisan</span>
        <svg class="tb-chev" :class="{ open: klOpen }" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <!-- Slot untuk LayerControlPanel (dropdown) -->
      <slot name="layer-control-panel"/>
    </div>
  </div>
</template>

<style scoped>
.topbar{position:absolute;top:0;left:0;right:0;height:60px;display:flex;align-items:center;justify-content:space-between;z-index:600;padding:0px 12px;pointer-events:none;}
.tb-left,.tb-center,.tb-right{pointer-events:all;}
.tb-lapisan-btn{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);border:none;border-radius:8px;padding:6px 12px 6px 9px;font-size:12.5px;font-weight:600;color:#1a1a2e;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.14);transition:box-shadow .14s;height:36px;}
.tb-lapisan-btn:hover{box-shadow:0 3px 14px rgba(0,0,0,0.2);}
.tb-chev{transition:transform .18s;color:#888;flex-shrink:0;}
.tb-chev.open{transform:rotate(180deg);}
.tb-center{display:flex;align-items:center;gap:2px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);border-radius:10px;padding:4px 6px;box-shadow:0 2px 14px rgba(0,0,0,0.16);height:46px;}
.tb-tool{width:36px;height:36px;border-radius:8px;border:none;cursor:pointer;background:transparent;color:#555;display:flex;align-items:center;justify-content:center;transition:all .13s;flex-shrink:0;}
.tb-tool:hover{background:#f0f4ff;color:#1a73e8;}
.tb-tool-primary{background:#3b82f6;color:#fff;}
.tb-tool-primary:hover{background:#2563eb;color:#fff;}
.tb-tool-active{background:#dbeafe;color:#1d4ed8;}
.tb-tool-danger{background:#fee2e2;color:#dc2626;}
.tb-icon{display:flex;align-items:center;justify-content:center;line-height:0;}
.tb-icon :deep(svg){stroke:currentColor;}
.tb-sep{width:1px;height:22px;background:rgba(0,0,0,0.1);margin:0 3px;flex-shrink:0;}
.tb-layer-dot-wrap{display:flex;align-items:center;justify-content:center;width:28px;height:28px;}
.tb-active-dot{width:13px;height:13px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);}
.tb-right{position:relative;}
.tb-kl-btn{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);border:none;border-radius:8px;padding:6px 10px 6px 12px;font-size:12.5px;font-weight:600;color:#1a1a2e;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.14);transition:box-shadow .14s;height:36px;white-space:nowrap;}
.tb-kl-btn:hover{box-shadow:0 3px 14px rgba(0,0,0,0.2);}
</style>