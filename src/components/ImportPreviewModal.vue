<script setup>


import { ref, computed, watch, nextTick } from "vue";
import * as XLSX from "xlsx";

const props = defineProps({
  show:       { type: Boolean, required: true },
  layerId:    { type: Number,  default: null  },
  layerColor: { type: String,  default: "#3498db" },
});
const emit = defineEmits(["close", "confirm"]);

// ── State ──────────────────────────────────────────────────────────────────────
const fileName      = ref("");
const workbook      = ref(null);
const sheetNames    = ref([]);
const selectedSheet = ref("");
const rawRows       = ref([]);
const headers       = ref([]);
const loading       = ref(false);
const dragOver      = ref(false);

const coordMode = ref("latLng");
const mapLat    = ref("");
const mapLng    = ref("");
const mapWKT    = ref("");
const mapName   = ref("");
const mapDesc   = ref("");

const extraCols = ref([]);

const search      = ref("");
const currentPage = ref(1);
const PAGE_SIZE   = 100;

const activeTab = ref("koordinat");

// ── Inline editing ─────────────────────────────────────────────────────────────
const editingCell    = ref(null);  // { gIdx, col }
const editingValue   = ref("");
const editInputRef   = ref(null);
const isDirty        = ref(false);
const newColName     = ref("");
const showAddCol     = ref(false);
const addColInputRef = ref(null);

// ── Watch ──────────────────────────────────────────────────────────────────────
watch(selectedSheet, loadSheet);
watch(showAddCol, v => { if (v) nextTick(() => addColInputRef.value?.focus()); });

// ── Computed ───────────────────────────────────────────────────────────────────
const filteredRows = computed(() => {
  if (!search.value) return rawRows.value;
  const q = search.value.toLowerCase();
  return rawRows.value.filter(r =>
    Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q))
  );
});
const totalRows  = computed(() => filteredRows.value.length);
const totalPages = computed(() => Math.ceil(totalRows.value / PAGE_SIZE));
const pagedRows  = computed(() => {
  const s = (currentPage.value - 1) * PAGE_SIZE;
  return filteredRows.value.slice(s, s + PAGE_SIZE);
});

function globalIdx(pageRowIdx) {
  const s = (currentPage.value - 1) * PAGE_SIZE;
  return rawRows.value.indexOf(filteredRows.value[s + pageRowIdx]);
}

const validRows = computed(() => {
  if (coordMode.value === "wkt")
    return rawRows.value.filter(r => r[mapWKT.value]?.toString().trim());
  return rawRows.value.filter(r => {
    const lat = parseFloat(r[mapLat.value]);
    const lng = parseFloat(r[mapLng.value]);
    return !isNaN(lat) && !isNaN(lng);
  });
});
const hasCoords = computed(() =>
  coordMode.value === "wkt" ? !!mapWKT.value : !!(mapLat.value && mapLng.value)
);
const includedExtra = computed(() => extraCols.value.filter(e => e.include));
const colRole = computed(() => {
  const m = {};
  if (mapLat.value)  m[mapLat.value]  = { label: "LAT",  cls: "coord" };
  if (mapLng.value)  m[mapLng.value]  = { label: "LNG",  cls: "coord" };
  if (mapWKT.value)  m[mapWKT.value]  = { label: "WKT",  cls: "coord" };
  if (mapName.value) m[mapName.value] = { label: "NAMA", cls: "name"  };
  if (mapDesc.value) m[mapDesc.value] = { label: "DESC", cls: "desc"  };
  extraCols.value.filter(e => e.include).forEach(e => {
    m[e.col] = { label: (e.alias || e.col).slice(0,8), cls: "prop" };
  });
  return m;
});

// ── File loading ───────────────────────────────────────────────────────────────
function reset() {
  fileName.value = ""; workbook.value = null;
  sheetNames.value = []; selectedSheet.value = "";
  rawRows.value = []; headers.value = [];
  mapLat.value = mapLng.value = mapWKT.value = mapName.value = mapDesc.value = "";
  extraCols.value = []; coordMode.value = "latLng";
  search.value = ""; currentPage.value = 1;
  activeTab.value = "koordinat";
  editingCell.value = null; isDirty.value = false;
  newColName.value = ""; showAddCol.value = false;
}

async function handleFile(file) {
  if (!file) return;
  loading.value = true; fileName.value = file.name;
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    const wb  = ext === "csv"
      ? XLSX.read(await file.text(), { type: "string", raw: false })
      : XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
    workbook.value   = wb;
    sheetNames.value = wb.SheetNames;
    const guess = wb.SheetNames.find(n =>
      /master|data|cabang|branch|poi|point|titik/i.test(n)
    ) || wb.SheetNames[0];
    selectedSheet.value = guess;
  } catch (e) { alert("Gagal membaca file: " + e.message); }
  finally { loading.value = false; }
}

function loadSheet(name) {
  if (!workbook.value || !name) return;
  const data = XLSX.utils.sheet_to_json(workbook.value.Sheets[name], {
    defval: "", raw: false,
  });
  rawRows.value   = data;
  headers.value   = data.length ? Object.keys(data[0]) : [];
  currentPage.value = 1;
  editingCell.value = null;
  isDirty.value = false;
  autoDetect();
}

function autoDetect() {
  const h = headers.value;
  const wktH = h.find(x => /^wkt$/i.test(x));
  if (wktH) { mapWKT.value = wktH; coordMode.value = "wkt"; }
  else { mapWKT.value = ""; coordMode.value = "latLng"; }
  mapLat.value  = h.find(x => /^lat$|^latitude$|^lintang$/i.test(x)) || h.find(x => /lat/i.test(x)) || "";
  mapLng.value  = h.find(x => /^lng$|^lon$|^long$|^longitude$|^bujur$/i.test(x)) || h.find(x => /lon|lng|long/i.test(x)) || "";
  mapName.value = h.find(x => /^nama$|^name$|^nama_cabang$/i.test(x)) || h.find(x => /nama|name/i.test(x)) || h[0] || "";
  mapDesc.value = h.find(x => /^deskripsi$|^desc$|^description$|^keterangan$/i.test(x)) || "";
  buildExtraCols();
}

function buildExtraCols() {
  const reserved = new Set([mapLat.value, mapLng.value, mapWKT.value, mapName.value, mapDesc.value].filter(Boolean));
  const prevMap = Object.fromEntries(extraCols.value.map(e => [e.col, e]));
  extraCols.value = headers.value
    .filter(h => !reserved.has(h))
    .map(col => prevMap[col] ? { ...prevMap[col] } : { col, alias: col, include: false });
}

watch([mapLat, mapLng, mapWKT, mapName, mapDesc], buildExtraCols);

function toggleAllExtra(val) { extraCols.value.forEach(e => e.include = val); }
function onFileInput(e) { handleFile(e.target.files[0]); e.target.value = ""; }
function onDrop(e) { dragOver.value = false; handleFile(e.dataTransfer.files[0]); }

// ── Inline editing ─────────────────────────────────────────────────────────────
function startEdit(rowPageIdx, col) {
  commitEdit();
  const gIdx = globalIdx(rowPageIdx);
  editingCell.value  = { gIdx, col };
  editingValue.value = String(rawRows.value[gIdx]?.[col] ?? "");
  nextTick(() => { if (editInputRef.value) { editInputRef.value.focus(); editInputRef.value.select(); } });
}

function commitEdit() {
  if (!editingCell.value) return;
  const { gIdx, col } = editingCell.value;
  if (rawRows.value[gIdx]) { rawRows.value[gIdx][col] = editingValue.value; isDirty.value = true; }
  editingCell.value = null;
}

function cancelEdit() { editingCell.value = null; }

function onCellKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
  if (e.key === "Escape") cancelEdit();
  if (e.key === "Tab") {
    e.preventDefault();
    const { gIdx, col } = editingCell.value;
    const fIdx = filteredRows.value.indexOf(rawRows.value[gIdx]);
    const pageRowIdx = fIdx - (currentPage.value - 1) * PAGE_SIZE;
    commitEdit();
    const hi = headers.value.indexOf(col);
    const nextCol = e.shiftKey ? headers.value[hi - 1] : headers.value[hi + 1];
    if (nextCol) nextTick(() => startEdit(pageRowIdx, nextCol));
  }
}

// ── Row / Col management ───────────────────────────────────────────────────────
function addRow() {
  commitEdit();
  rawRows.value.push(Object.fromEntries(headers.value.map(h => [h, ""])));
  isDirty.value = true;
  currentPage.value = Math.ceil(rawRows.value.length / PAGE_SIZE);
}

function deleteRow(rowPageIdx) {
  commitEdit();
  rawRows.value.splice(globalIdx(rowPageIdx), 1);
  isDirty.value = true;
}

function addColumn() {
  const name = newColName.value.trim();
  if (!name) return;
  if (headers.value.includes(name)) { alert("Nama kolom sudah ada"); return; }
  headers.value.push(name);
  rawRows.value.forEach(r => { r[name] = ""; });
  extraCols.value.push({ col: name, alias: name, include: true });
  isDirty.value = true;
  newColName.value = ""; showAddCol.value = false;
}

function deleteColumn(col) {
  if (!confirm(`Hapus kolom "${col}"?`)) return;
  commitEdit();
  headers.value.splice(headers.value.indexOf(col), 1);
  rawRows.value.forEach(r => delete r[col]);
  if (mapLat.value === col)  mapLat.value  = "";
  if (mapLng.value === col)  mapLng.value  = "";
  if (mapWKT.value === col)  mapWKT.value  = "";
  if (mapName.value === col) mapName.value = "";
  if (mapDesc.value === col) mapDesc.value = "";
  buildExtraCols();
  isDirty.value = true;
}

function renameColumn(col) {
  const newName = prompt("Rename kolom:", col);
  if (!newName || newName === col) return;
  if (headers.value.includes(newName)) { alert("Nama kolom sudah ada"); return; }
  const hi = headers.value.indexOf(col);
  headers.value[hi] = newName;
  rawRows.value.forEach(r => { r[newName] = r[col]; delete r[col]; });
  if (mapLat.value === col)  mapLat.value  = newName;
  if (mapLng.value === col)  mapLng.value  = newName;
  if (mapWKT.value === col)  mapWKT.value  = newName;
  if (mapName.value === col) mapName.value = newName;
  if (mapDesc.value === col) mapDesc.value = newName;
  buildExtraCols();
  isDirty.value = true;
}

// ── Coordinate validation ──────────────────────────────────────────────────────
function coordInRange(val, min, max) {
  const n = parseFloat(String(val ?? "").replace(/,/g, "."));
  return !isNaN(n) && n >= min && n <= max;
}
function parseCoord(val) {
  if (val === null || val === undefined || val === "") return NaN;
  return parseFloat(String(val).trim().replace(/,(?=\d{1,6}($|\s))/g, "."));
}
function coordHint(val, min, max) {
  if (coordInRange(val, min, max)) return null;
  const n = parseCoord(val);
  if (isNaN(n)) return "Bukan angka";
  if (n / 1e7 >= min && n / 1e7 <= max) return "Pastikan Sesuai";
  return `Di luar range ${min} ~ ${max}`;
}
const coordsSeemValid = computed(() => {
  if (coordMode.value === "wkt" || !mapLat.value || !mapLng.value) return true;
  const sample = rawRows.value.slice(0, 3).filter(r => r[mapLat.value] !== "" || r[mapLng.value] !== "");
  if (!sample.length) return true;
  return sample.every(r => coordInRange(r[mapLat.value], -90, 90) && coordInRange(r[mapLng.value], -180, 180));
});
function isRowValid(row) {
  if (coordMode.value === "wkt") return !!row[mapWKT.value]?.toString().trim();
  const lat = parseCoord(row[mapLat.value]);
  const lng = parseCoord(row[mapLng.value]);
  return !isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lng) && lng >= -180 && lng <= 180;
}

// ── WKT parser ─────────────────────────────────────────────────────────────────
function parseWKT(wkt) {
  if (!wkt) return null;
  try {
    const pairs = s => s.trim().split(/,\s*/).map(p => p.trim().split(/\s+/).map(Number));
    const up = wkt.toUpperCase();
    if (up.startsWith("POINT")) {
      const m = wkt.match(/POINT\s*\(\s*([^)]+)\)/i);
      return m ? { type: "Point", coordinates: m[1].trim().split(/\s+/).map(Number) } : null;
    }
    if (up.startsWith("LINESTRING")) {
      const m = wkt.match(/LINESTRING\s*\(\s*([^)]+)\)/i);
      return m ? { type: "LineString", coordinates: pairs(m[1]) } : null;
    }
    if (up.startsWith("POLYGON")) {
      const rings = []; const re = /\(([^()]+)\)/g; let m;
      while ((m = re.exec(wkt))) rings.push(pairs(m[1]));
      return rings.length ? { type: "Polygon", coordinates: rings } : null;
    }
    return null;
  } catch { return null; }
}

// ── Confirm ────────────────────────────────────────────────────────────────────
function confirmImport() {
  commitEdit();
  const payload = validRows.value.map((row, i) => {
    const name = (mapName.value ? String(row[mapName.value] ?? "") : "") || `Objek ${i + 1}`;
    const desc = mapDesc.value ? String(row[mapDesc.value] ?? "") : "";
    let geojson;
    if (coordMode.value === "wkt") {
      geojson = parseWKT(String(row[mapWKT.value] ?? "").trim());
    } else {
      const lat = parseCoord(row[mapLat.value]);
      const lng = parseCoord(row[mapLng.value]);
      geojson = { type: "Point", coordinates: [lng, lat] };
    }
    if (!geojson) return null;
    const properties = {};
    includedExtra.value.forEach(e => {
      properties[(e.alias || e.col).trim() || e.col] = row[e.col] ?? "";
    });
    return { name, description: desc, color: props.layerColor, geojson, properties };
  }).filter(Boolean);
  emit("confirm", { layerId: props.layerId, features: payload });
}

function close() { commitEdit(); reset(); emit("close"); }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="im-backdrop" @click.self="close">
        <div class="im-modal">

          <!-- Header -->
          <div class="im-header">
            <div class="im-header-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="im-title">{{ fileName || 'Import Data ke Peta' }}</span>
              <span v-if="isDirty" class="im-dirty-badge">● diubah</span>
            </div>
            <button class="im-close" @click="close">✕</button>
          </div>

          <!-- Drop zone -->
          <div v-if="!workbook && !loading" class="im-dropzone" :class="{'is-over':dragOver}"
            @dragover.prevent="dragOver=true" @dragleave="dragOver=false" @drop.prevent="onDrop">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p class="im-drop-label">Drag &amp; drop file di sini, atau</p>
            <label class="im-browse-btn">Pilih File<input type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="onFileInput"/></label>
            <p class="im-drop-hint">xlsx · xls · csv</p>
          </div>

          <!-- Loading -->
          <div v-else-if="loading" class="im-loading">
            <svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M21 12a9 9 0 00-9-9" stroke-linecap="round"/></svg>
            Membaca file…
          </div>

          <!-- Main content -->
          <template v-else>

            <!-- Sheet tabs + stats -->
            <div class="im-topbar">
              <div class="im-sheet-tabs">
                <button v-for="s in sheetNames" :key="s" :class="['im-sheet-tab', selectedSheet===s?'active':'']" @click="selectedSheet=s">{{ s }}</button>
              </div>
              <div class="im-stat">
                <span class="im-chip total">{{ rawRows.length.toLocaleString() }} baris</span>
                <span v-if="hasCoords" class="im-chip valid">✓ {{ validRows.length.toLocaleString() }} valid</span>
                <span v-if="hasCoords && rawRows.length-validRows.length>0" class="im-chip invalid">✗ {{ rawRows.length-validRows.length }} skip</span>
                <span v-if="includedExtra.length" class="im-chip props">+{{ includedExtra.length }} kolom</span>
                <span v-if="isDirty" class="im-chip dirty">● diubah</span>
              </div>
            </div>

            <!-- Body -->
            <div class="im-body">

              <!-- Sidebar -->
              <div class="im-sidebar">
                <div class="im-tab-row">
                  <button :class="['im-tab', activeTab==='koordinat'?'active':'']" @click="activeTab='koordinat'">📍 Koordinat</button>
                  <button :class="['im-tab', activeTab==='kolom'?'active':'']" @click="activeTab='kolom'">
                    📊 Kolom Data
                    <span v-if="includedExtra.length" class="im-tab-badge">{{ includedExtra.length }}</span>
                  </button>
                </div>

                <!-- Tab: Koordinat -->
                <div v-show="activeTab==='koordinat'" class="im-tab-panel">
                  <div class="im-section-label">Mode Koordinat</div>
                  <div class="im-mode-toggle">
                    <button :class="['im-mode-btn', coordMode==='latLng'?'active':'']" @click="coordMode='latLng'">Lat / Lng</button>
                    <button :class="['im-mode-btn', coordMode==='wkt'?'active':'']" @click="coordMode='wkt'">WKT</button>
                  </div>
                  <template v-if="coordMode==='latLng'">
                    <div class="im-field">
                      <label class="im-label">Latitude <span class="req">*</span></label>
                      <select class="im-sel" v-model="mapLat"><option value="">— pilih —</option><option v-for="h in headers" :key="h" :value="h">{{ h }}</option></select>
                    </div>
                    <div class="im-field">
                      <label class="im-label">Longitude <span class="req">*</span></label>
                      <select class="im-sel" v-model="mapLng"><option value="">— pilih —</option><option v-for="h in headers" :key="h" :value="h">{{ h }}</option></select>
                    </div>
                    <div v-if="mapLat && mapLng && rawRows[0]" class="im-coord-preview" :class="!coordsSeemValid?'warn':''">
                      <div class="im-coord-row">
                        <span class="im-coord-lbl">Lat:</span>
                        <code :class="['im-coord-val', coordInRange(rawRows[0][mapLat],-90,90)?'ok':'bad']">{{ rawRows[0][mapLat] }}</code>
                      </div>
                      <div v-if="coordHint(rawRows[0][mapLat],-90,90)" class="im-coord-hint">⚠ {{ coordHint(rawRows[0][mapLat],-90,90) }}</div>
                      <div class="im-coord-row" style="margin-top:3px">
                        <span class="im-coord-lbl">Lng:</span>
                        <code :class="['im-coord-val', coordInRange(rawRows[0][mapLng],-180,180)?'ok':'bad']">{{ rawRows[0][mapLng] }}</code>
                      </div>
                      <div v-if="coordHint(rawRows[0][mapLng],-180,180)" class="im-coord-hint">⚠ {{ coordHint(rawRows[0][mapLng],-180,180) }}</div>
                      <div v-if="!coordsSeemValid" class="im-coord-block-msg">Format koordinat belum sesuai.</div>
                      <div v-else class="im-coord-ok">✓ Format koordinat valid</div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="im-field">
                      <label class="im-label">Kolom WKT <span class="req">*</span></label>
                      <select class="im-sel" v-model="mapWKT"><option value="">— pilih —</option><option v-for="h in headers" :key="h" :value="h">{{ h }}</option></select>
                    </div>
                  </template>
                  <div class="im-divider"/>
                  <div class="im-field">
                    <label class="im-label">Nama Fitur</label>
                    <select class="im-sel" v-model="mapName"><option value="">— tidak ada —</option><option v-for="h in headers" :key="h" :value="h">{{ h }}</option></select>
                  </div>
                  <div class="im-field">
                    <label class="im-label">Deskripsi</label>
                    <select class="im-sel" v-model="mapDesc"><option value="">— tidak ada —</option><option v-for="h in headers" :key="h" :value="h">{{ h }}</option></select>
                  </div>
                </div>

                <!-- Tab: Kolom Data -->
                <div v-show="activeTab==='kolom'" class="im-tab-panel">
                  <div class="im-section-label">Pilih kolom → properties</div>
                  <p class="im-hint-text">Kolom yang dipilih disimpan sebagai atribut JSONB dan tampil di popup peta.</p>
                  <div class="im-extra-actions">
                    <button class="im-link-btn" @click="toggleAllExtra(true)">Pilih semua</button>
                    <span class="im-dot-sep">·</span>
                    <button class="im-link-btn" @click="toggleAllExtra(false)">Hapus semua</button>
                  </div>
                  <div class="im-extra-list">
                    <div v-if="!extraCols.length" class="im-empty-cols">Tidak ada kolom tersisa</div>
                    <div v-for="ec in extraCols" :key="ec.col" :class="['im-extra-item', ec.include?'checked':'']">
                      <label class="im-check-label">
                        <input type="checkbox" v-model="ec.include" class="im-check"/>
                        <span class="im-col-name" :title="ec.col">{{ ec.col }}</span>
                        <span v-if="rawRows[0]" class="im-col-preview">{{ String(rawRows[0][ec.col]??'').slice(0,14) }}</span>
                      </label>
                      <div v-if="ec.include" class="im-alias-row">
                        <span class="im-alias-label">Alias:</span>
                        <input v-model="ec.alias" class="im-alias-inp" :placeholder="ec.col"/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right: table -->
              <div class="im-right">
                <div class="im-toolbar">
                  <div class="im-toolbar-left">
                    <div class="im-search-wrap">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input v-model="search" class="im-search" placeholder="Cari di tabel…" @input="currentPage=1"/>
                    </div>
                    <button class="im-tbl-btn" @click="addRow">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Baris
                    </button>
                    <div class="im-addcol-wrap">
                      <button class="im-tbl-btn" @click="showAddCol=!showAddCol">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Kolom
                      </button>
                      <div v-if="showAddCol" class="im-addcol-popup">
                        <input ref="addColInputRef" v-model="newColName" class="im-addcol-inp" placeholder="Nama kolom baru…"
                          @keydown.enter="addColumn" @keydown.esc="showAddCol=false"/>
                        <button class="im-addcol-ok" @click="addColumn">Tambah</button>
                      </div>
                    </div>
                  </div>
                  <div class="im-pager">
                    <span class="im-pager-info">{{ ((currentPage-1)*PAGE_SIZE+1).toLocaleString() }}–{{ Math.min(currentPage*PAGE_SIZE,totalRows).toLocaleString() }} dari {{ totalRows.toLocaleString() }}</span>
                    <button class="im-pager-btn" :disabled="currentPage<=1" @click="currentPage--">‹</button>
                    <button class="im-pager-btn" :disabled="currentPage>=totalPages" @click="currentPage++">›</button>
                  </div>
                </div>

                <!-- Edit hint bar -->
                <div class="im-edit-hint">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Klik sel untuk edit · Enter simpan · Esc batal · Tab pindah kolom · Hover header untuk rename/hapus kolom
                </div>

                <div class="im-table-wrap">
                  <table class="im-table">
                    <thead>
                      <tr>
                        <th class="im-th-idx">#</th>
                        <th v-for="h in headers" :key="h" class="im-th">
                          <div class="im-th-inner">
                            <span class="im-th-text" :title="h">{{ h }}</span>
                            <span v-if="colRole[h]" :class="['im-badge', colRole[h].cls]">{{ colRole[h].label }}</span>
                            <div class="im-th-actions">
                              <button class="im-th-act-btn" title="Rename" @click.stop="renameColumn(h)">✎</button>
                              <button class="im-th-act-btn del" title="Hapus kolom" @click.stop="deleteColumn(h)">✕</button>
                            </div>
                          </div>
                        </th>
                        <th class="im-th im-th-del-h"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row,ri) in pagedRows" :key="ri" :class="['im-tr', hasCoords&&!isRowValid(row)?'invalid':'']">
                        <td class="im-td-idx">
                          <span v-if="hasCoords" :class="['im-dot', isRowValid(row)?'ok':'err']"/>
                          <span v-else class="im-rn">{{ (currentPage-1)*PAGE_SIZE+ri+1 }}</span>
                        </td>
                        <td v-for="h in headers" :key="h"
                          :class="['im-td',
                            colRole[h] ? 'hl' : '',
                            colRole[h]?.cls==='prop' ? 'hl-prop' : '',
                            editingCell && editingCell.gIdx===globalIdx(ri) && editingCell.col===h ? 'editing' : '']"
                          @click="startEdit(ri, h)">
                          <input
                            v-if="editingCell && editingCell.gIdx===globalIdx(ri) && editingCell.col===h"
                            ref="editInputRef"
                            v-model="editingValue"
                            class="im-cell-input"
                            @blur="commitEdit"
                            @keydown="onCellKeydown"
                            @click.stop
                          />
                          <span v-else :title="String(row[h]??'')">{{ row[h] ?? '' }}</span>
                        </td>
                        <td class="im-td-del">
                          <button class="im-del-row-btn" @click.stop="deleteRow(ri)" title="Hapus baris">✕</button>
                        </td>
                      </tr>
                      <tr v-if="!pagedRows.length">
                        <td :colspan="headers.length+2" class="im-td-empty">Tidak ada data</td>
                      </tr>
                      <tr class="im-tr-addrow" @click="addRow">
                        <td :colspan="headers.length+2" class="im-td-addrow">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Tambah baris
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="im-footer">
              <div :class="['im-footer-info', hasCoords&&coordsSeemValid?'ok':'warn']">
                <svg v-if="!hasCoords||!coordsSeemValid" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span v-if="!hasCoords">Pilih kolom koordinat untuk melanjutkan</span>
                <span v-else-if="!coordsSeemValid">Koordinat tidak valid — perbaiki dulu</span>
                <span v-else>{{ validRows.length.toLocaleString() }} fitur<template v-if="includedExtra.length"> · {{ includedExtra.length }} kolom data</template> siap diimport</span>
              </div>
              <div class="im-footer-actions">
                <button class="im-btn-cancel" @click="close">Batal</button>
                <button class="im-btn-import" :disabled="!hasCoords||!validRows.length||!coordsSeemValid" @click="confirmImport">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M5 15v4a2 2 0 002 2h10a2 2 0 002-2v-4"/></svg>
                  Import {{ validRows.length ? validRows.length.toLocaleString()+' Fitur' : '' }}
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.im-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.46);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;}
.im-modal{background:#fff;border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.22);width:100%;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
.modal-fade-enter-active,.modal-fade-leave-active{transition:all .17s ease;}
.modal-fade-enter-from,.modal-fade-leave-to{opacity:0;transform:scale(.97) translateY(6px);}
.im-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0;}
.im-header-left{display:flex;align-items:center;gap:8px;color:#666;}
.im-title{font-size:13px;font-weight:700;color:#1a1a1a;}
.im-dirty-badge{font-size:10px;color:#d97706;font-weight:600;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:1px 7px;}
.im-close{width:24px;height:24px;border:none;background:none;cursor:pointer;color:#bbb;border-radius:6px;font-size:13px;transition:all .1s;}
.im-close:hover{background:#f5f5f5;color:#555;}
.im-dropzone{display:flex;flex-direction:column;align-items:center;gap:10px;padding:52px 24px;border:2px dashed #e0e0e0;border-radius:10px;margin:18px;cursor:pointer;transition:all .15s;}
.im-dropzone.is-over{border-color:#3b82f6;background:#eff6ff;}
.im-drop-label{font-size:13px;color:#777;margin:0;}
.im-drop-hint{font-size:10.5px;color:#ccc;margin:0;font-style:italic;}
.im-browse-btn{padding:7px 18px;background:#3b82f6;color:#fff;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;transition:background .12s;}
.im-browse-btn:hover{background:#2563eb;}
.im-loading{display:flex;flex-direction:column;align-items:center;gap:12px;padding:56px;color:#999;font-size:13px;}
.spin{animation:spin .7s linear infinite;transform-origin:center;}
@keyframes spin{to{transform:rotate(360deg);}}
.im-topbar{display:flex;align-items:center;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #f3f3f3;flex-shrink:0;gap:8px;flex-wrap:wrap;}
.im-sheet-tabs{display:flex;gap:3px;flex-wrap:wrap;}
.im-sheet-tab{padding:4px 11px;font-size:11.5px;font-weight:600;border:1.5px solid transparent;border-radius:6px;cursor:pointer;background:none;color:#999;transition:all .12s;font-family:inherit;}
.im-sheet-tab:hover{background:#f5f5f5;color:#333;}
.im-sheet-tab.active{background:#eff6ff;border-color:#bfdbfe;color:#2563eb;}
.im-stat{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.im-chip{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;}
.im-chip.total{background:#f3f4f6;color:#666;}
.im-chip.valid{background:#dcfce7;color:#16a34a;}
.im-chip.invalid{background:#fee2e2;color:#dc2626;}
.im-chip.props{background:#ede9fe;color:#7c3aed;}
.im-chip.dirty{background:#fffbeb;color:#d97706;}
.im-body{display:flex;flex:1;overflow:hidden;min-height:0;}
.im-sidebar{width:222px;min-width:222px;border-right:1px solid #f0f0f0;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;}
.im-tab-row{display:flex;border-bottom:1px solid #f0f0f0;flex-shrink:0;}
.im-tab{flex:1;padding:8px 4px;font-size:11px;font-weight:600;border:none;background:none;cursor:pointer;color:#aaa;transition:all .12s;font-family:inherit;}
.im-tab.active{color:#2563eb;border-bottom:2px solid #3b82f6;background:#fafcff;}
.im-tab-badge{display:inline-block;background:#7c3aed;color:#fff;border-radius:10px;font-size:9px;font-weight:800;padding:0 5px;margin-left:3px;vertical-align:middle;}
.im-tab-panel{flex:1;overflow-y:auto;padding:11px 12px;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;}
.im-section-label{font-size:10px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px;}
.im-hint-text{font-size:10.5px;color:#bbb;line-height:1.5;margin-bottom:8px;}
.im-mode-toggle{display:flex;border:1.5px solid #e5e7eb;border-radius:7px;overflow:hidden;margin-bottom:10px;}
.im-mode-btn{flex:1;padding:5px 6px;font-size:11px;font-weight:600;border:none;background:none;cursor:pointer;color:#999;font-family:inherit;transition:all .12s;}
.im-mode-btn.active{background:#3b82f6;color:#fff;}
.im-field{margin-bottom:8px;}
.im-label{display:block;font-size:10px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
.im-label .req{color:#ef4444;}
.im-sel{width:100%;font-size:11.5px;padding:5px 7px;border:1.5px solid #e5e7eb;border-radius:6px;outline:none;background:#fff;color:#333;cursor:pointer;font-family:inherit;transition:border-color .12s;}
.im-sel:focus{border-color:#3b82f6;}
.im-divider{height:1px;background:#f0f0f0;margin:8px 0;}
.im-extra-actions{display:flex;gap:6px;align-items:center;margin-bottom:8px;}
.im-link-btn{background:none;border:none;cursor:pointer;font-size:11px;color:#3b82f6;padding:0;font-family:inherit;text-decoration:underline;}
.im-dot-sep{color:#ccc;font-size:10px;}
.im-extra-list{display:flex;flex-direction:column;gap:4px;}
.im-empty-cols{font-size:11px;color:#ccc;font-style:italic;text-align:center;padding:10px 0;}
.im-extra-item{padding:5px 7px;border-radius:6px;border:1.5px solid #f0f0f0;transition:border-color .12s;}
.im-extra-item.checked{border-color:#c4b5fd;background:#faf5ff;}
.im-check-label{display:flex;align-items:center;gap:6px;cursor:pointer;}
.im-check{accent-color:#7c3aed;cursor:pointer;flex-shrink:0;}
.im-col-name{font-size:11.5px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}
.im-col-preview{font-size:10px;color:#ccc;flex-shrink:0;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.im-coord-preview{background:#f8fafb;border:1.5px solid #e8f0fe;border-radius:7px;padding:7px 9px;margin-top:6px;display:flex;flex-direction:column;gap:2px;}
.im-coord-preview.warn{background:#fffbeb;border-color:#f59e0b;}
.im-coord-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.im-coord-lbl{font-size:10px;font-weight:700;color:#aaa;width:24px;flex-shrink:0;}
.im-coord-val{font-size:11px;font-family:monospace;padding:2px 5px;border-radius:4px;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.im-coord-val.ok{background:#dcfce7;color:#166534;}
.im-coord-val.bad{background:#fee2e2;color:#dc2626;}
.im-coord-hint{font-size:10px;color:#b45309;line-height:1.4;padding:1px 0 2px 28px;font-weight:500;}
.im-coord-block-msg{font-size:10.5px;color:#dc2626;font-weight:700;padding-top:4px;border-top:1px solid #fecaca;margin-top:3px;}
.im-coord-ok{font-size:10.5px;color:#16a34a;font-weight:600;padding-top:2px;}
.im-alias-row{display:flex;align-items:center;gap:5px;margin-top:4px;}
.im-alias-label{font-size:10px;color:#bbb;flex-shrink:0;}
.im-alias-inp{flex:1;font-size:11px;padding:3px 7px;border:1.5px solid #c4b5fd;border-radius:5px;outline:none;font-family:inherit;color:#5b21b6;background:#faf5ff;}
.im-alias-inp:focus{border-color:#7c3aed;}
/* Right panel */
.im-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
.im-toolbar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #f3f3f3;flex-shrink:0;gap:8px;}
.im-toolbar-left{display:flex;align-items:center;gap:6px;}
.im-search-wrap{display:flex;align-items:center;gap:6px;border:1.5px solid #e5e7eb;border-radius:7px;padding:4px 9px;background:#fafafa;}
.im-search{border:none;background:none;outline:none;font-size:12px;color:#333;width:130px;font-family:inherit;}
.im-tbl-btn{display:flex;align-items:center;gap:4px;padding:4px 9px;font-size:11px;font-weight:600;border:1.5px solid #e5e7eb;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-family:inherit;transition:all .12s;}
.im-tbl-btn:hover{background:#f0f7ff;border-color:#bfdbfe;color:#2563eb;}
.im-addcol-wrap{position:relative;}
.im-addcol-popup{position:absolute;top:calc(100% + 4px);left:0;z-index:200;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:8px;display:flex;gap:5px;min-width:200px;}
.im-addcol-inp{flex:1;font-size:12px;padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;outline:none;font-family:inherit;}
.im-addcol-inp:focus{border-color:#3b82f6;}
.im-addcol-ok{padding:5px 11px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:700;font-family:inherit;}
.im-addcol-ok:hover{background:#2563eb;}
.im-pager{display:flex;align-items:center;gap:5px;}
.im-pager-info{font-size:11px;color:#bbb;}
.im-pager-btn{width:22px;height:22px;border-radius:5px;border:1.5px solid #e5e7eb;background:none;cursor:pointer;font-size:13px;color:#666;display:flex;align-items:center;justify-content:center;transition:all .1s;}
.im-pager-btn:disabled{opacity:.3;cursor:not-allowed;}
.im-pager-btn:not(:disabled):hover{background:#eff6ff;border-color:#bfdbfe;}
/* Edit hint */
.im-edit-hint{padding:3px 12px;background:#fffbf0;border-bottom:1px solid #fef3c7;font-size:10px;color:#b45309;display:flex;align-items:center;gap:6px;flex-shrink:0;}
/* Table */
.im-table-wrap{flex:1;overflow:auto;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;}
.im-table{width:100%;border-collapse:collapse;font-size:11.5px;}
.im-th-idx,.im-td-idx{width:32px;min-width:32px;background:#fafafa;border-right:1px solid #f0f0f0;text-align:center;padding:5px 3px;position:sticky;left:0;z-index:2;}
.im-th{padding:5px 10px;background:#fafafa;border-bottom:2px solid #eaeaea;border-right:1px solid #f2f2f2;white-space:nowrap;position:sticky;top:0;z-index:1;font-size:11px;font-weight:700;color:#666;}
.im-th:hover .im-th-actions{opacity:1;}
.im-th-inner{display:flex;align-items:center;gap:4px;}
.im-th-text{overflow:hidden;text-overflow:ellipsis;max-width:110px;}
.im-th-actions{opacity:0;display:flex;gap:2px;margin-left:auto;flex-shrink:0;transition:opacity .12s;}
.im-th-act-btn{padding:1px 4px;border:none;background:none;cursor:pointer;border-radius:3px;font-size:10px;color:#999;line-height:1;transition:all .1s;}
.im-th-act-btn:hover{background:#e5e7eb;color:#333;}
.im-th-act-btn.del:hover{background:#fee2e2;color:#dc2626;}
.im-th-del-h{width:28px;min-width:28px;background:#fafafa;border-bottom:2px solid #eaeaea;position:sticky;top:0;z-index:1;}
.im-badge{display:inline-block;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;letter-spacing:.3px;flex-shrink:0;}
.im-badge.coord{background:#dbeafe;color:#1d4ed8;}
.im-badge.name{background:#d1fae5;color:#065f46;}
.im-badge.desc{background:#fef3c7;color:#92400e;}
.im-badge.prop{background:#ede9fe;color:#6d28d9;}
.im-td{padding:3px 10px;border-bottom:1px solid #f5f5f5;border-right:1px solid #fafafa;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#444;cursor:pointer;transition:background .08s;}
.im-td:hover:not(.editing){background:#f0f7ff !important;}
.im-td.hl{background:#fdfbff;}
.im-td.hl-prop{background:#faf5ff;}
.im-td.editing{padding:0;background:#fffbf0 !important;outline:2px solid #f59e0b;outline-offset:-2px;overflow:visible;}
.im-cell-input{width:100%;height:100%;border:none;outline:none;font-size:11.5px;font-family:inherit;color:#1a1a1a;background:transparent;padding:3px 10px;box-sizing:border-box;min-height:26px;}
.im-tr:hover td{background:#f8faff;}
.im-tr:hover .im-td.hl-prop{background:#f3eeff;}
.im-tr.invalid td{color:#d1d5db;}
.im-dot{display:inline-block;width:7px;height:7px;border-radius:50%;}
.im-dot.ok{background:#22c55e;}
.im-dot.err{background:#fca5a5;}
.im-rn{font-size:10px;color:#ddd;}
.im-td-del{width:28px;min-width:28px;text-align:center;border-bottom:1px solid #f5f5f5;padding:0 2px;}
.im-del-row-btn{width:20px;height:20px;border:none;background:none;cursor:pointer;color:#e0e0e0;border-radius:4px;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;margin:auto;transition:all .1s;}
.im-tr:hover .im-del-row-btn{color:#fca5a5;}
.im-del-row-btn:hover{background:#fee2e2 !important;color:#dc2626 !important;}
.im-tr-addrow{cursor:pointer;}
.im-td-addrow{padding:5px 12px;color:#bbb;font-size:11px;border-top:1px dashed #f0f0f0;display:flex;align-items:center;gap:6px;transition:background .1s;}
.im-tr-addrow:hover .im-td-addrow{background:#f0f7ff;color:#3b82f6;}
.im-td-empty{text-align:center;color:#ccc;padding:24px;font-style:italic;}
/* Footer */
.im-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #f0f0f0;flex-shrink:0;gap:12px;}
.im-footer-info{display:flex;align-items:center;gap:6px;font-size:12px;}
.im-footer-info.warn{color:#d97706;}
.im-footer-info.ok{color:#16a34a;}
.im-footer-actions{display:flex;gap:8px;}
.im-btn-cancel{padding:7px 16px;border:1.5px solid #e5e7eb;border-radius:8px;background:none;cursor:pointer;font-size:12.5px;color:#666;font-family:inherit;transition:all .12s;}
.im-btn-cancel:hover{background:#f5f5f5;}
.im-btn-import{display:flex;align-items:center;gap:6px;padding:7px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700;font-family:inherit;transition:background .12s;box-shadow:0 2px 8px rgba(59,130,246,.3);}
.im-btn-import:hover:not(:disabled){background:#2563eb;}
.im-btn-import:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;}
</style>