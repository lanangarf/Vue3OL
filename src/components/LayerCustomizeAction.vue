<script setup>
/**
 * LayerCustomizeAction.vue — context menu lapisan
 * Self-contained: tidak butuh komponen child tambahan.
 */
const props = defineProps({
  layerMenu:      { type: Object,  required: true }, // { layerId, x, y }
  importLoading:  { type: Boolean, default: false },
  importProgress: { type: Number,  default: 0 },
  importError:    { type: String,  default: null },
  layerIds:       { type: Array,   default: () => [] },
});

const emit = defineEmits([
  "rename",
  "editData",      // buka LayerDataEditor — edit fitur as spreadsheet
  "exportGeoJSON",
  "exportExcel",
  "exportXLS",
  "import",        // xlsx/csv → buka modal preview
  "importDirect",  // gpx/kml/geojson → langsung trigger file picker
  "delete",
  "close",
]);
</script>

<template>
  <!-- Overlay untuk tutup menu saat klik di luar -->
  <div class="ctx-overlay" @click="emit('close')" @contextmenu.prevent="emit('close')"/>

  <div
    class="ctx-menu"
    :style="{ top: layerMenu.y + 'px', left: layerMenu.x + 'px' }"
    @click.stop
  >
    <!-- Ganti Nama -->
    <button @click="emit('rename', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Ganti Nama
    </button>

    <!-- Edit Data Layer — spreadsheet editor -->
    <button @click="emit('editData', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="15" x2="21" y2="15"/>
        <line x1="9" y1="9" x2="9" y2="21"/>
      </svg>
      Edit Data
    </button>
    <!-- <div class="ctx-hint">Preview tabel</div> -->

    <div class="ctx-sep"/>

    <!-- Export group -->
    <div class="ctx-group-label">Export</div>

    <button @click="emit('exportGeoJSON', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export GeoJSON
    </button>

    <button @click="emit('exportXLS', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="12" x2="15" y2="18"/>
        <line x1="15" y1="12" x2="9" y2="18"/>
      </svg>
      Export XLS
    </button>

     <button @click="emit('exportExcel', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      Export CSV (Koordinat)
    </button>

    <div class="ctx-sep"/>

    <!-- Import group -->
    <div class="ctx-group-label">Import</div>

    <button :disabled="importLoading" @click="emit('import', layerMenu.layerId)">
      <svg v-if="!importLoading" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <svg v-else class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M21 12a9 9 0 00-9-9"/>
      </svg>
      {{ importLoading ? `Mengimpor… ${importProgress}%` : 'Import XLSX/CSV' }}
    </button>
    <div class="ctx-hint">Preview tabel</div>

    <button :disabled="importLoading" @click="emit('importDirect', layerMenu.layerId)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
        <path d="M5 15v4a2 2 0 002 2h10a2 2 0 002-2v-4"/>
      </svg>
      Import Lainnya
    </button>
    <div class="ctx-hint">GeoJSON/GPX/KML</div>

    <!-- Progress bar -->
    <div v-if="importLoading" class="ctx-progress">
      <div class="ctx-progress-fill" :style="{ width: importProgress + '%' }"/>
    </div>

    <!-- Error message -->
    <div v-if="importError" class="ctx-error">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {{ importError }}
    </div>

    <div class="ctx-sep"/>

    <!-- Hapus -->
    <button class="danger" @click="emit('delete', layerMenu.layerId); emit('close')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
      Hapus Lapisan
    </button>
  </div>
</template>

<style scoped>
.ctx-overlay {
  position: fixed; inset: 0; z-index: 9998;
}
.ctx-menu {
  position: fixed; z-index: 9999;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 28px rgba(0,0,0,.18), 0 1px 4px rgba(0,0,0,.08);
  padding: 5px 0;
  min-width: 205px;
  animation: pop .13s ease;
}
@keyframes pop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.ctx-group-label {
  font-size: 10px; font-weight: 700;
  letter-spacing: .6px; text-transform: uppercase;
  color: #bbb; padding: 4px 13px 2px;
}
.ctx-menu button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 13px;
  background: none; border: none; cursor: pointer;
  font-size: 12.5px; color: #333;
  transition: background .1s; font-family: inherit;
}
.ctx-menu button:hover:not(:disabled) { background: #f0f4ff; }
.ctx-menu button:disabled { opacity: .5; cursor: not-allowed; }
.ctx-menu button.danger { color: #dc2626; }
.ctx-menu button.danger:hover { background: #fee2e2; }
.ctx-sep { height: 1px; background: #f0f0f0; margin: 3px 0; }
.ctx-hint {
  font-size: 10px; color: #c0c0c0;
  padding: 0 13px 5px; font-style: italic;
}
.ctx-progress {
  height: 3px; background: #e8f0fe;
  margin: 0 13px 6px; border-radius: 2px; overflow: hidden;
}
.ctx-progress-fill {
  height: 100%; background: #3b82f6;
  border-radius: 2px; transition: width .3s ease;
}
.ctx-error {
  display: flex; align-items: flex-start; gap: 5px;
  font-size: 10.5px; color: #dc2626;
  padding: 2px 13px 6px; line-height: 1.4;
}
.spin { animation: spin .7s linear infinite; transform-origin: center; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>