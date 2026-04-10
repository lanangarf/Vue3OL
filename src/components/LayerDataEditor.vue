<script setup>
/**
 * LayerDataEditor.vue
 *
 * Spreadsheet editor untuk fitur-fitur yang sudah ada di sebuah layer.
 * - Tampilkan semua fitur sebagai baris tabel
 * - Kolom dinamis: nama, deskripsi, lon, lat (dari geojson Point), + semua properties
 * - Inline cell editing — klik sel untuk edit
 * - Tambah / hapus baris (fitur)
 * - Tambah / hapus kolom properties
 * - Simpan semua perubahan ke DB via bulk update
 */
import { ref, computed, watch, nextTick, toRaw } from "vue";
import { GeoJSON as OLGeoJSON } from "ol/format";

const olGeoJSON = new OLGeoJSON();

const props = defineProps({
  show:    { type: Boolean, required: true },
  layer:   { type: Object,  default: null  },   // { id, name, color, features: [...] }
});
const emit = defineEmits(["close", "save"]);
// emit("save", { layerId, updates: [{ id, name, desc, lng, lat, properties, _delete }] })

// ── State ──────────────────────────────────────────────────────────────────────
// rows: array plain objects { _id, _new, _deleted, _dirty, nama, deskripsi, lng, lat, ...props }
const rows    = ref([]);
const propCols = ref([]);   // kolom properties dinamis (di luar nama/desc/lng/lat)

const search      = ref("");
const currentPage = ref(1);
const PAGE_SIZE   = 100;

const isDirty     = ref(false);
const saving      = ref(false);
const saveError   = ref("");

// Inline editing
const editingCell  = ref(null);   // { rIdx, col }
const editingValue = ref("");
// Tidak pakai ref="editInputRef" karena ada di dalam v-for — fokus via id unik
const EDIT_INPUT_ID = "lde-active-cell-input";

// Add column
const showAddCol    = ref(false);
const newColName    = ref("");
const addColInputRef = ref(null);

// ── Init ───────────────────────────────────────────────────────────────────────
watch(() => props.show, (v) => {
  if (v && props.layer) initRows();
  else resetAll();
});

watch(showAddCol, v => { if (v) nextTick(() => addColInputRef.value?.focus()); });

function getCoord(feat) {
  // toRaw penting: olFeature adalah OL object, tidak boleh wrapped Vue proxy
  const olFeat = toRaw(feat.olFeature);
  if (olFeat) {
    try {
      const geom = olFeat.getGeometry();
      const type = geom?.getType();
      if (type === "Point") {
        const coords = geom.getCoordinates();
        const lng = coords[0], lat = coords[1];
        return {
          lng: isFinite(lng) ? String(+lng.toFixed(7)) : "",
          lat: isFinite(lat) ? String(+lat.toFixed(7)) : "",
        };
      }
    } catch (e) {
      console.warn("[LayerDataEditor] getCoord olFeature error:", e);
    }
  }
  // Fallback: baca dari field geojson jika ada
  const g = feat.geojson;
  if (g?.type === "Point" && Array.isArray(g.coordinates)) {
    const lng = g.coordinates[0], lat = g.coordinates[1];
    return {
      lng: isFinite(lng) ? String(+lng.toFixed(7)) : "",
      lat: isFinite(lat) ? String(+lat.toFixed(7)) : "",
    };
  }
  return { lng: "", lat: "" };
}

function initRows() {
  const features = props.layer?.features ?? [];

  // Kumpulkan semua property keys dari semua fitur
  const propKeySet = new Set();
  features.forEach(f => {
    Object.keys(f.properties || {}).forEach(k => propKeySet.add(k));
  });
  propCols.value = [...propKeySet];

  rows.value = features.map(f => {
    const { lng, lat } = getCoord(f);
    return {
      _id:        f.id,
      _new:       false,
      _deleted:   false,
      _dirty:     false,
      _type:      f.type,
      _olFeature: toRaw(f.olFeature) ?? null,   // raw OL object, bukan Vue proxy
      nama:       f.name   ?? "",
      deskripsi:  f.desc   ?? "",
      lng,
      lat,
      ...Object.fromEntries(propCols.value.map(k => [k, String(f.properties?.[k] ?? "")])),
    };
  });

  search.value = "";
  currentPage.value = 1;
  isDirty.value = false;
  saveError.value = "";
  editingCell.value = null;
}

function resetAll() {
  rows.value = [];
  propCols.value = [];
  search.value = "";
  currentPage.value = 1;
  isDirty.value = false;
  saving.value = false;
  saveError.value = "";
  editingCell.value = null;
  showAddCol.value = false;
  newColName.value = "";
}

// ── Computed ───────────────────────────────────────────────────────────────────
const visibleRows = computed(() => rows.value.filter(r => !r._deleted));

const filteredRows = computed(() => {
  if (!search.value) return visibleRows.value;
  const q = search.value.toLowerCase();
  return visibleRows.value.filter(r =>
    allCols.value.some(c => String(r[c] ?? "").toLowerCase().includes(q))
  );
});

const totalRows  = computed(() => filteredRows.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / PAGE_SIZE)));
const pagedRows  = computed(() => {
  const s = (currentPage.value - 1) * PAGE_SIZE;
  return filteredRows.value.slice(s, s + PAGE_SIZE);
});

// Semua kolom yang ditampilkan (urut: nama, deskripsi, lng, lat, lalu props dinamis)
const fixedCols = ["nama", "deskripsi", "lng", "lat"];
const allCols   = computed(() => [...fixedCols, ...propCols.value]);

const colLabels = {
  nama:      "Nama",
  deskripsi: "Deskripsi",
  lng:       "Longitude",
  lat:       "Latitude",
};

const fixedColCls = {
  nama:      "col-name",
  deskripsi: "col-desc",
  lng:       "col-coord",
  lat:       "col-coord",
};

// Indeks baris di rows.value dari pagedRows index
function rawIdx(pagedIdx) {
  return rows.value.indexOf(pagedRows.value[pagedIdx]);
}

const stats = computed(() => {
  const total   = visibleRows.value.length;
  const dirty   = rows.value.filter(r => !r._deleted && (r._dirty || r._new)).length;
  const deleted = rows.value.filter(r => r._deleted && !r._new).length;
  return { total, dirty, deleted };
});

// ── Inline editing ─────────────────────────────────────────────────────────────
function startEdit(pagedIdx, col) {
  commitEdit();
  const rIdx = rawIdx(pagedIdx);
  editingCell.value  = { rIdx, col };
  editingValue.value = String(rows.value[rIdx]?.[col] ?? "");
  nextTick(() => {
    const el = document.getElementById(EDIT_INPUT_ID);
    if (el) { el.focus(); el.select(); }
  });
}

function commitEdit() {
  if (!editingCell.value) return;
  const { rIdx, col } = editingCell.value;
  const row = rows.value[rIdx];
  if (row && row[col] !== editingValue.value) {
    row[col] = editingValue.value;
    row._dirty = true;
    isDirty.value = true;
  }
  editingCell.value = null;
}

function cancelEdit() { editingCell.value = null; }

function onCellKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
  if (e.key === "Escape") cancelEdit();
  if (e.key === "Tab") {
    e.preventDefault();
    const { rIdx, col } = editingCell.value;
    // Cari pagedIdx dari rIdx
    const pIdx = pagedRows.value.indexOf(rows.value[rIdx]);
    commitEdit();
    const ci = allCols.value.indexOf(col);
    const shift = e.shiftKey ? -1 : 1;
    const nextCol = allCols.value[ci + shift];
    if (nextCol !== undefined) nextTick(() => startEdit(pIdx, nextCol));
  }
}

function isEditing(pagedIdx, col) {
  if (!editingCell.value) return false;
  return editingCell.value.rIdx === rawIdx(pagedIdx) && editingCell.value.col === col;
}

// ── Row management ─────────────────────────────────────────────────────────────
function addRow() {
  commitEdit();
  const newRow = {
    _id:      `new_${Date.now()}_${Math.random()}`,
    _new:     true,
    _deleted: false,
    _dirty:   true,
    _type:    "Point",
    _geojson: null,
    nama:     "",
    deskripsi: "",
    lng:      "",
    lat:      "",
    ...Object.fromEntries(propCols.value.map(k => [k, ""])),
  };
  rows.value.push(newRow);
  isDirty.value = true;
  currentPage.value = totalPages.value;
}

function deleteRow(pagedIdx) {
  commitEdit();
  const rIdx = rawIdx(pagedIdx);
  const row = rows.value[rIdx];
  if (row._new) {
    // Baris baru belum disimpan — hapus langsung
    rows.value.splice(rIdx, 1);
  } else {
    row._deleted = true;
  }
  isDirty.value = true;
}

function restoreRow(pagedIdx) {
  const rIdx = rawIdx(pagedIdx);
  rows.value[rIdx]._deleted = false;
  isDirty.value = true;
}

// ── Column management ──────────────────────────────────────────────────────────
function addColumn() {
  const name = newColName.value.trim();
  if (!name) return;
  if (allCols.value.includes(name)) { alert("Nama kolom sudah ada"); return; }
  propCols.value.push(name);
  rows.value.forEach(r => { if (!(name in r)) r[name] = ""; });
  isDirty.value = true;
  newColName.value = "";
  showAddCol.value = false;
}

function deleteColumn(col) {
  if (fixedCols.includes(col)) return;
  if (!confirm(`Hapus kolom "${col}" dari semua fitur?`)) return;
  commitEdit();
  const i = propCols.value.indexOf(col);
  propCols.value.splice(i, 1);
  rows.value.forEach(r => delete r[col]);
  isDirty.value = true;
}

function renameColumn(col) {
  if (fixedCols.includes(col)) return;
  const name = prompt("Rename kolom:", col);
  if (!name || name === col) return;
  if (allCols.value.includes(name)) { alert("Nama kolom sudah ada"); return; }
  const i = propCols.value.indexOf(col);
  propCols.value[i] = name;
  rows.value.forEach(r => { r[name] = r[col] ?? ""; delete r[col]; });
  isDirty.value = true;
}

// ── Coord validation ───────────────────────────────────────────────────────────
function coordOk(row) {
  if (row._type !== "Point" && !row._new) return true;  // non-point jangan validasi
  const lng = parseFloat(String(row.lng).replace(",", "."));
  const lat = parseFloat(String(row.lat).replace(",", "."));
  if (isNaN(lng) || isNaN(lat)) return row.lng === "" && row.lat === "";
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function save() {
  commitEdit();
  saving.value = true;
  saveError.value = "";
  try {
    const updates = rows.value.map(r => {
      const parseLng = parseFloat(String(r.lng).replace(",", "."));
      const parseLat = parseFloat(String(r.lat).replace(",", "."));

      let geojson = null;

      if (r._type === "Point" || r._new) {
        // Point: pakai koordinat yang diisi user
        if (!isNaN(parseLng) && !isNaN(parseLat)) {
          geojson = { type: "Point", coordinates: [parseLng, parseLat] };
        }
      } else {
        // Non-Point (Polygon, LineString): ambil geom asli dari olFeature
        if (r._olFeature) {
          try {
            const geom = r._olFeature.getGeometry();
            if (geom) {
              geojson = JSON.parse(olGeoJSON.writeGeometry(geom, {
                dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
              }));
            }
          } catch { geojson = null; }
        }
      }

      const properties = {};
      propCols.value.forEach(k => { properties[k] = r[k] ?? ""; });

      return {
        id:          r._id,
        _new:        r._new,
        _deleted:    r._deleted,
        name:        r.nama,
        description: r.deskripsi,
        geojson,
        properties,
      };
    });

    emit("save", { layerId: props.layer.id, updates });
  } catch (err) {
    saveError.value = err.message;
  } finally {
    saving.value = false;
  }
}

function close() {
  commitEdit();
  resetAll();
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lde-fade">
      <div v-if="show" class="lde-backdrop" @click.self="close">
        <div class="lde-modal">

          <!-- Header -->
          <div class="lde-header">
            <div class="lde-header-left">
              <div class="lde-header-dot" :style="{ background: layer?.color || '#3b82f6' }"/>
              <div>
                <div class="lde-title">{{ layer?.name || 'Layer' }}</div>
                <div class="lde-subtitle">Edit data fitur</div>
              </div>
            </div>
            <div class="lde-header-right">
              <div class="lde-stats">
                <span class="lde-chip total">{{ stats.total }} fitur</span>
                <span v-if="stats.dirty"   class="lde-chip dirty">{{ stats.dirty }} diubah</span>
                <span v-if="stats.deleted" class="lde-chip deleted">{{ stats.deleted }} dihapus</span>
              </div>
              <button class="lde-close" @click="close">✕</button>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="lde-toolbar">
            <div class="lde-toolbar-left">
              <div class="lde-search-wrap">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input v-model="search" class="lde-search" placeholder="Cari fitur…" @input="currentPage=1"/>
              </div>
              <button class="lde-tbl-btn" @click="addRow">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Fitur
              </button>
              <div class="lde-addcol-wrap">
                <button class="lde-tbl-btn" @click="showAddCol=!showAddCol">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Kolom
                </button>
                <div v-if="showAddCol" class="lde-addcol-popup">
                  <input ref="addColInputRef" v-model="newColName" class="lde-addcol-inp"
                    placeholder="Nama kolom baru…"
                    @keydown.enter="addColumn" @keydown.esc="showAddCol=false"/>
                  <button class="lde-addcol-ok" @click="addColumn">Tambah</button>
                </div>
              </div>
            </div>
            <div class="lde-pager">
              <span class="lde-pager-info">
                {{ Math.min((currentPage-1)*PAGE_SIZE+1, totalRows) }}–{{ Math.min(currentPage*PAGE_SIZE, totalRows) }}
                dari {{ totalRows }}
              </span>
              <button class="lde-pager-btn" :disabled="currentPage<=1" @click="currentPage--">‹</button>
              <button class="lde-pager-btn" :disabled="currentPage>=totalPages" @click="currentPage++">›</button>
            </div>
          </div>

          <!-- Edit hint -->
          <div class="lde-edit-hint">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Klik sel untuk edit · Enter simpan · Esc batal · Tab pindah · Hover header kolom untuk rename/hapus
          </div>

          <!-- Table -->
          <div class="lde-table-wrap">
            <table class="lde-table">
              <thead>
                <tr>
                  <th class="lde-th lde-th-idx">#</th>
                  <th v-for="col in allCols" :key="col" :class="['lde-th', fixedColCls[col] || 'col-prop']">
                    <div class="lde-th-inner">
                      <span class="lde-th-text" :title="col">{{ colLabels[col] || col }}</span>
                      <span v-if="fixedCols.includes(col)" class="lde-th-fixed-badge">{{ col === 'lng' || col === 'lat' ? 'KOORDINAT' : 'WAJIB' }}</span>
                      <div v-if="!fixedCols.includes(col)" class="lde-th-actions">
                        <button class="lde-th-act" title="Rename" @click.stop="renameColumn(col)">✎</button>
                        <button class="lde-th-act del" title="Hapus kolom" @click.stop="deleteColumn(col)">✕</button>
                      </div>
                    </div>
                  </th>
                  <th class="lde-th lde-th-action-h"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, pi) in pagedRows" :key="row._id"
                  :class="['lde-tr',
                    row._deleted ? 'deleted' : '',
                    row._new     ? 'is-new'  : '',
                    row._dirty && !row._deleted && !row._new ? 'is-dirty' : '']">
                  <td class="lde-td lde-td-idx">
                    <span class="lde-rn">{{ (currentPage-1)*PAGE_SIZE+pi+1 }}</span>
                    <span v-if="row._new" class="lde-new-dot" title="Fitur baru">N</span>
                  </td>
                  <td v-for="col in allCols" :key="col"
                    :class="['lde-td',
                      fixedColCls[col] || 'col-prop',
                      row._deleted ? 'cell-deleted' : '',
                      isEditing(pi, col) ? 'editing' : '']"
                    @click="!row._deleted && !(( col==='lng'||col==='lat') && row._type !== 'Point' && !row._new) && startEdit(pi, col)">
                    <!-- Editing input — hanya untuk Point atau baris baru -->
                    <input
                      v-if="isEditing(pi, col)"
                      :id="EDIT_INPUT_ID"
                      v-model="editingValue"
                      class="lde-cell-input"
                      @blur="commitEdit"
                      @keydown="onCellKeydown"
                      @click.stop
                    />
                    <!-- Non-Point coord cell: tampilkan label tipe geometri, tidak bisa diedit -->
                    <span v-else-if="(col==='lng'||col==='lat') && row._type !== 'Point' && !row._new"
                      class="lde-cell-geom-label" :title="`Tipe ${row._type} — koordinat tidak diedit di sini`">
                      {{ row._type }}
                    </span>
                    <!-- Display biasa -->
                    <span v-else class="lde-cell-val" :title="String(row[col]??'')">
                      {{ row[col] ?? '' }}
                    </span>
                    <!-- Coord invalid indicator -->
                    <span v-if="(col==='lng'||col==='lat') && !row._deleted && !coordOk(row)"
                      class="lde-coord-warn" title="Koordinat tidak valid">⚠</span>
                  </td>
                  <!-- Action: delete / restore -->
                  <td class="lde-td lde-td-action">
                    <button v-if="!row._deleted" class="lde-del-btn" @click.stop="deleteRow(pi)" title="Hapus fitur">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                    <button v-else class="lde-restore-btn" @click.stop="restoreRow(pi)" title="Pulihkan fitur">↩</button>
                  </td>
                </tr>

                <tr v-if="!pagedRows.length">
                  <td :colspan="allCols.length + 2" class="lde-td-empty">Tidak ada data</td>
                </tr>

                <!-- Add row shortcut -->
                <tr class="lde-tr-addrow" @click="addRow">
                  <td :colspan="allCols.length + 2" class="lde-td-addrow">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Tambah fitur baru
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer -->
          <div class="lde-footer">
            <div class="lde-footer-info">
              <svg v-if="saveError" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span v-if="saveError" class="lde-err">{{ saveError }}</span>
              <span v-else-if="isDirty" class="lde-info-dirty">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Ada perubahan yang belum disimpan
              </span>
              <span v-else class="lde-info-ok">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Tidak ada perubahan
              </span>
            </div>
            <div class="lde-footer-actions">
              <button class="lde-btn cancel" @click="close">Batal</button>
              <button class="lde-btn save" :disabled="!isDirty || saving" @click="save">
                <svg v-if="saving" class="lde-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 00-9-9" stroke-linecap="round"/></svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {{ saving ? 'Menyimpan…' : 'Simpan Perubahan' }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lde-backdrop{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.48);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;}
.lde-modal{background:#fff;border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.24);width:100%;max-width:1160px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
.lde-fade-enter-active,.lde-fade-leave-active{transition:all .18s ease;}
.lde-fade-enter-from,.lde-fade-leave-to{opacity:0;transform:scale(.97) translateY(8px);}

/* Header */
.lde-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0;}
.lde-header-left{display:flex;align-items:center;gap:10px;}
.lde-header-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,.2);}
.lde-title{font-size:13px;font-weight:700;color:#1a1a1a;}
.lde-subtitle{font-size:10.5px;color:#aaa;margin-top:1px;}
.lde-header-right{display:flex;align-items:center;gap:10px;}
.lde-stats{display:flex;gap:5px;}
.lde-chip{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;}
.lde-chip.total{background:#f3f4f6;color:#666;}
.lde-chip.dirty{background:#fffbeb;color:#d97706;}
.lde-chip.deleted{background:#fee2e2;color:#dc2626;}
.lde-close{width:24px;height:24px;border:none;background:none;cursor:pointer;color:#bbb;border-radius:6px;font-size:13px;transition:all .1s;}
.lde-close:hover{background:#f5f5f5;color:#555;}

/* Toolbar */
.lde-toolbar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #f3f3f3;flex-shrink:0;gap:8px;}
.lde-toolbar-left{display:flex;align-items:center;gap:6px;}
.lde-search-wrap{display:flex;align-items:center;gap:6px;border:1.5px solid #e5e7eb;border-radius:7px;padding:4px 9px;background:#fafafa;}
.lde-search{border:none;background:none;outline:none;font-size:12px;color:#333;width:140px;font-family:inherit;}
.lde-tbl-btn{display:flex;align-items:center;gap:4px;padding:4px 9px;font-size:11px;font-weight:600;border:1.5px solid #e5e7eb;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-family:inherit;transition:all .12s;}
.lde-tbl-btn:hover{background:#f0f7ff;border-color:#bfdbfe;color:#2563eb;}
.lde-addcol-wrap{position:relative;}
.lde-addcol-popup{position:absolute;top:calc(100% + 4px);left:0;z-index:200;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:8px;display:flex;gap:5px;min-width:210px;}
.lde-addcol-inp{flex:1;font-size:12px;padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;outline:none;font-family:inherit;}
.lde-addcol-inp:focus{border-color:#3b82f6;}
.lde-addcol-ok{padding:5px 11px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:700;font-family:inherit;}
.lde-addcol-ok:hover{background:#2563eb;}
.lde-pager{display:flex;align-items:center;gap:5px;}
.lde-pager-info{font-size:11px;color:#bbb;}
.lde-pager-btn{width:22px;height:22px;border-radius:5px;border:1.5px solid #e5e7eb;background:none;cursor:pointer;font-size:13px;color:#666;display:flex;align-items:center;justify-content:center;transition:all .1s;}
.lde-pager-btn:disabled{opacity:.3;cursor:not-allowed;}
.lde-pager-btn:not(:disabled):hover{background:#eff6ff;border-color:#bfdbfe;}

/* Edit hint */
.lde-edit-hint{padding:3px 12px;background:#fffbf0;border-bottom:1px solid #fef3c7;font-size:10px;color:#b45309;display:flex;align-items:center;gap:6px;flex-shrink:0;}

/* Table */
.lde-table-wrap{flex:1;overflow:auto;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;}
.lde-table{width:100%;border-collapse:collapse;font-size:11.5px;}

.lde-th{padding:5px 10px;background:#fafafa;border-bottom:2px solid #eaeaea;border-right:1px solid #f2f2f2;white-space:nowrap;position:sticky;top:0;z-index:1;font-size:11px;font-weight:700;color:#666;}
.lde-th-idx{width:36px;min-width:36px;text-align:center;position:sticky;left:0;z-index:3;}
.lde-th-action-h{width:32px;min-width:32px;background:#fafafa;border-bottom:2px solid #eaeaea;position:sticky;top:0;z-index:1;}
.lde-th-inner{display:flex;align-items:center;gap:4px;}
.lde-th-text{overflow:hidden;text-overflow:ellipsis;max-width:110px;}
.lde-th-fixed-badge{font-size:8.5px;font-weight:800;padding:1px 4px;border-radius:3px;background:#dbeafe;color:#1d4ed8;flex-shrink:0;letter-spacing:.2px;}
.lde-th:hover .lde-th-actions{opacity:1;}
.lde-th-actions{opacity:0;display:flex;gap:2px;margin-left:auto;flex-shrink:0;transition:opacity .12s;}
.lde-th-act{padding:1px 4px;border:none;background:none;cursor:pointer;border-radius:3px;font-size:10px;color:#999;line-height:1;}
.lde-th-act:hover{background:#e5e7eb;color:#333;}
.lde-th-act.del:hover{background:#fee2e2;color:#dc2626;}

/* Column type widths */
.col-name   .lde-th,.col-name  { min-width:140px; }
.col-desc   .lde-th,.col-desc  { min-width:140px; }
.col-coord  .lde-th,.col-coord { min-width:110px; font-family:monospace; }
.col-prop   .lde-th,.col-prop  { min-width:100px; }

/* Rows */
.lde-td-idx{width:36px;min-width:36px;text-align:center;padding:4px 3px;background:#fafafa;border-right:1px solid #f0f0f0;position:sticky;left:0;z-index:2;}
.lde-td{padding:3px 10px;border-bottom:1px solid #f5f5f5;border-right:1px solid #fafafa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#444;cursor:pointer;transition:background .08s;position:relative;vertical-align:middle;}
.lde-td:hover:not(.editing):not(.cell-deleted){background:#f0f7ff !important;}
.lde-td.col-coord{font-family:monospace;color:#1d4ed8;}
.lde-td.col-prop{background:#faf5ff;}
.lde-td.editing{padding:0;background:#fffbf0 !important;outline:2px solid #f59e0b;outline-offset:-2px;overflow:visible;}
.lde-td.cell-deleted{color:#d1d5db !important;cursor:default;}
.lde-td-action{width:32px;min-width:32px;text-align:center;border-bottom:1px solid #f5f5f5;padding:0 2px;}
.lde-cell-input{width:100%;height:100%;border:none;outline:none;font-size:11.5px;font-family:inherit;color:#1a1a1a;background:transparent;padding:3px 10px;box-sizing:border-box;min-height:26px;}
.lde-cell-val{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lde-coord-warn{position:absolute;right:3px;top:50%;transform:translateY(-50%);font-size:10px;color:#ef4444;}
.lde-cell-geom-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;cursor:default;}
.lde-rn{font-size:10px;color:#ccc;}
.lde-new-dot{display:inline-block;font-size:8px;font-weight:800;background:#10b981;color:#fff;border-radius:3px;padding:0 3px;margin-left:2px;vertical-align:middle;}

/* Row states */
.lde-tr:hover td{background:#f8faff;}
.lde-tr:hover .col-prop{background:#f3eeff;}
.lde-tr.deleted td{opacity:.45;text-decoration:line-through;}
.lde-tr.deleted td.lde-td-idx,.lde-tr.deleted td.lde-td-action{text-decoration:none;opacity:1;}
.lde-tr.is-new td{background:#f0fdf4 !important;}
.lde-tr.is-dirty td{border-left:2px solid #f59e0b;}
.lde-tr.is-dirty td.lde-td-idx{border-left:none;}

/* Delete / restore buttons */
.lde-del-btn,.lde-restore-btn{width:22px;height:22px;border:none;background:none;cursor:pointer;color:#e0e0e0;border-radius:4px;display:flex;align-items:center;justify-content:center;margin:auto;transition:all .1s;font-size:13px;}
.lde-tr:hover .lde-del-btn{color:#fca5a5;}
.lde-del-btn:hover{background:#fee2e2 !important;color:#dc2626 !important;}
.lde-restore-btn{color:#86efac;}
.lde-restore-btn:hover{background:#f0fdf4 !important;color:#16a34a !important;}

/* Add row */
.lde-tr-addrow{cursor:pointer;}
.lde-td-addrow{padding:5px 12px;color:#bbb;font-size:11px;border-top:1px dashed #f0f0f0;display:flex;align-items:center;gap:6px;transition:background .1s;}
.lde-tr-addrow:hover .lde-td-addrow{background:#f0f7ff;color:#3b82f6;}
.lde-td-empty{text-align:center;color:#ccc;padding:24px;font-style:italic;}

/* Footer */
.lde-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #f0f0f0;flex-shrink:0;}
.lde-footer-info{display:flex;align-items:center;gap:6px;font-size:12px;}
.lde-err{color:#dc2626;font-weight:600;}
.lde-info-dirty{display:flex;align-items:center;gap:5px;color:#d97706;font-weight:600;}
.lde-info-ok{display:flex;align-items:center;gap:5px;color:#16a34a;}
.lde-footer-actions{display:flex;gap:8px;}
.lde-btn{display:flex;align-items:center;gap:6px;padding:7px 18px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700;font-family:inherit;transition:all .12s;}
.lde-btn.cancel{border:1.5px solid #e5e7eb;background:none;color:#666;}
.lde-btn.cancel:hover{background:#f5f5f5;}
.lde-btn.save{background:#3b82f6;color:#fff;border:none;box-shadow:0 2px 8px rgba(59,130,246,.3);}
.lde-btn.save:hover:not(:disabled){background:#2563eb;}
.lde-btn.save:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;}
.lde-spin{animation:lde-spin .7s linear infinite;transform-origin:center;}
@keyframes lde-spin{to{transform:rotate(360deg);}}
</style>