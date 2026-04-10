<script setup>
import { ref, computed } from "vue";
import IconPickerModal from "./IconPickerModal.vue";

const props = defineProps({
  popup:        { type: Object,  required: true },
  colorPalette: { type: Array,   required: true },
  featureType:  { type: String,  default: "" },
});

const emit = defineEmits(["save", "delete", "close"]);

// Icon modal state
const showIconModal = ref(false);

function onIconConfirm({ icon, color }) {
  props.popup.icon  = icon;
  props.popup.color = color;
  showIconModal.value = false;
}

const activeTab = ref("info"); // "info" | "data"

const typeIcons = {
  Point:      "Titik",
  LineString: "Garis",
  Polygon:    "Poligon",
  Circle:     "Lingkaran",
};

// ── Data tab state ────────────────────────────────────────────────────────────

const editRows     = ref([]);
const dataEditing  = ref(false);

function startEdit() {
  const p = props.popup.properties || {};
  editRows.value = Object.entries(p).map(([key, value]) => ({ key, value: String(value ?? "") }));
  if (!editRows.value.length) editRows.value.push({ key: "", value: "" });
  dataEditing.value = true;
}

function addRow() {
  editRows.value.push({ key: "", value: "" });
}

function removeRow(i) {
  editRows.value.splice(i, 1);
}

function commitEdit() {
  const next = {};
  for (const r of editRows.value) {
    const k = r.key.trim();
    if (k) next[k] = r.value;
  }
  props.popup.properties = next;
  dataEditing.value = false;
}

function cancelEdit() {
  dataEditing.value = false;
}

// ── Display helpers ───────────────────────────────────────────────────────────

const propEntries = computed(() => {
  const p = props.popup.properties;
  if (!p || typeof p !== "object") return [];
  return Object.entries(p).filter(([, v]) => v !== null && v !== undefined && v !== "");
});

const totalProps = computed(() => {
  const p = props.popup.properties;
  if (!p || typeof p !== "object") return 0;
  return Object.keys(p).length;
});

function fmtVal(v) {
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== "" && Math.abs(n) > 999) {
    return n.toLocaleString("id-ID");
  }
  return String(v ?? "");
}
</script>

<template>
  <div class="feat-panel" @click.stop>
    <!-- Header -->
    <div class="fp-panel-hd">
      <span class="fp-type-badge">{{ typeIcons[featureType] || "Objek" }}</span>
      <button class="fp-close" @click="emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Tab switcher -->
    <div class="fp-tabs">
      <button :class="['fp-tab', activeTab==='info'?'active':'']" @click="activeTab='info'; cancelEdit()">Info</button>
      <button :class="['fp-tab', activeTab==='data'?'active':'']" @click="activeTab='data'">
        Data
        <span class="fp-tab-cnt" :class="activeTab==='data'?'active':''">{{ totalProps }}</span>
      </button>
    </div>

    <!-- ── Tab: Info ── -->
    <div v-show="activeTab==='info'">
      <input class="fp-name" v-model="popup.name" placeholder="Nama objek..."/>
      <textarea class="fp-desc" v-model="popup.desc" placeholder="Tambah deskripsi..." rows="3"/>

      <div v-if="popup.measure" class="fp-measure">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 20h20M6 20V8l4-4 4 4v12M10 20v-4h4v4"/>
        </svg>
        {{ popup.measure }}
      </div>

      <!-- Icon + warna: buka modal -->
      <div class="fp-icon-row">
        <button
          class="fp-icon-btn"
          :style="{ background: popup.color || '#1a73e8' }"
          :title="popup.icon ? 'Ganti ikon: ' + popup.icon : 'Pilih ikon'"
          @click.stop="showIconModal = true"
        >
          <span class="material-symbols-outlined fp-icon-sym">
            {{ popup.icon || 'place' }}
          </span>
        </button>
        <span class="fp-icon-label">
          {{ popup.icon ? popup.icon.replace(/_/g, ' ') : 'Pilih ikon & warna…' }}
        </span>
      </div>

      <!-- Modal IconPicker -->
      <IconPickerModal
        v-if="showIconModal"
        :modelValue="popup.icon || 'place'"
        :color="popup.color || '#1a73e8'"
        :colorPalette="colorPalette"
        title="Ikon & Warna Objek"
        @confirm="onIconConfirm"
        @close="showIconModal = false"
      />

      <div class="fp-btns">
        <button class="fp-btn save" @click="emit('save')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Simpan
        </button>
        <button class="fp-btn del" @click="emit('delete', popup.layerId, popup.featureId)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Hapus
        </button>
      </div>
    </div>

    <!-- ── Tab: Data ── -->
    <div v-show="activeTab==='data'" class="fp-data-panel">

      <!-- MODE: VIEW -->
      <template v-if="!dataEditing">
        <div v-if="!propEntries.length" class="fp-data-empty">
          Belum ada data atribut
        </div>
        <div v-else class="fp-data-table">
          <div v-for="[k, v] in propEntries" :key="k" class="fp-data-row">
            <span class="fp-data-key" :title="k">{{ k }}</span>
            <span class="fp-data-val" :title="String(v)">{{ fmtVal(v) }}</span>
          </div>
        </div>

        <div class="fp-data-toolbar">
          <button class="fp-data-btn edit-btn" @click="startEdit">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Data
          </button>
        </div>
      </template>

      <!-- MODE: EDIT -->
      <template v-else>
        <div class="fp-edit-rows">
          <div v-for="(row, i) in editRows" :key="i" class="fp-edit-row">
            <input
              class="fp-edit-key"
              v-model="editRows[i].key"
              placeholder="kolom"
              spellcheck="false"
            />
            <span class="fp-edit-sep">:</span>
            <input
              class="fp-edit-val"
              v-model="editRows[i].value"
              placeholder="nilai"
              spellcheck="false"
            />
            <button class="fp-edit-del" @click="removeRow(i)" title="Hapus baris">
              <svg width="10" height="10" viewBox="0 0 12 12">
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <button class="fp-add-row" @click="addRow">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Tambah kolom
        </button>

        <div class="fp-data-toolbar">
          <button class="fp-data-btn cancel-btn" @click="cancelEdit">Batal</button>
          <button class="fp-data-btn save-btn" @click="commitEdit(); emit('save')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            Simpan
          </button>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
.feat-panel{position:absolute;right:14px;top:50%;transform:translateY(-50%);z-index:700;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);padding:14px 14px 14px;width:260px;pointer-events:all;}
.fp-panel-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.fp-close{position:absolute;top:9px;right:9px;background:#f3f4f6;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;color:#888;display:flex;align-items:center;justify-content:center;transition:all .12s;}
.fp-close:hover{background:#fee2e2;color:#dc2626;}
.fp-type-badge{font-size:10.5px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.4px;}

/* Tabs */
.fp-tabs{display:flex;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:10px;}
.fp-tab{flex:1;padding:5px 8px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#999;font-family:inherit;transition:all .12s;}
.fp-tab.active{background:#3b82f6;color:#fff;}
.fp-tab-cnt{display:inline-block;background:#f3f4f6;color:#666;border-radius:10px;font-size:10px;padding:0 5px;margin-left:3px;}
.fp-tab-cnt.active{background:rgba(255,255,255,.25);color:#fff;}

/* Info tab */
.fp-name{display:block;width:100%;box-sizing:border-box;border:1.5px solid #e5e7eb;border-radius:7px;padding:6px 9px;font-size:13px;font-weight:600;color:#111;margin-bottom:6px;outline:none;font-family:inherit;transition:border-color .14s;}
.fp-name:focus{border-color:#3b82f6;}
.fp-desc{display:block;width:100%;box-sizing:border-box;border:1.5px solid #e5e7eb;border-radius:7px;padding:6px 9px;font-size:12px;color:#555;resize:none;margin-bottom:7px;outline:none;font-family:inherit;transition:border-color .14s;}
.fp-desc:focus{border-color:#3b82f6;}
.fp-measure{display:flex;align-items:center;gap:5px;font-size:11px;color:#777;background:#f8f9fa;border-radius:6px;padding:4px 8px;margin-bottom:8px;}
.fp-icon-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.fp-icon-btn{width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.22);transition:transform .12s,box-shadow .12s;flex-shrink:0;}
.fp-icon-btn:hover{transform:scale(1.1);box-shadow:0 3px 10px rgba(0,0,0,.3);}
.fp-icon-sym{font-size:17px;color:#fff;font-variation-settings:'FILL' 1,'wght' 500,'GRAD' 0,'opsz' 24;pointer-events:none;}
.fp-icon-label{font-size:11px;color:#666;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
.fp-btns{display:flex;gap:6px;}
.fp-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px;border-radius:7px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .14s;font-family:inherit;}
.fp-btn.save{background:#3b82f6;color:#fff;}
.fp-btn.save:hover{background:#2563eb;}
.fp-btn.del{background:#f3f4f6;color:#dc2626;}
.fp-btn.del:hover{background:#fee2e2;}

/* Data tab — view mode */
.fp-data-panel{display:flex;flex-direction:column;gap:6px;}
.fp-data-empty{font-size:12px;color:#ccc;text-align:center;padding:16px 0 4px;font-style:italic;}
.fp-data-table{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;}
.fp-data-row{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f5;}
.fp-data-row:last-child{border-bottom:none;}
.fp-data-key{font-size:11px;font-weight:700;color:#888;min-width:80px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;}
.fp-data-val{font-size:12px;color:#222;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;}

/* Data tab toolbar */
.fp-data-toolbar{display:flex;gap:5px;margin-top:2px;}
.fp-data-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;border-radius:7px;border:none;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s;}
.fp-data-btn.edit-btn{background:#f3f4f6;color:#444;}
.fp-data-btn.edit-btn:hover{background:#e5e7eb;}
.fp-data-btn.cancel-btn{background:#f3f4f6;color:#666;}
.fp-data-btn.cancel-btn:hover{background:#e5e7eb;}
.fp-data-btn.save-btn{background:#3b82f6;color:#fff;}
.fp-data-btn.save-btn:hover{background:#2563eb;}

/* Data tab — edit mode */
.fp-edit-rows{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#e0e0e0 transparent;margin-bottom:4px;}
.fp-edit-row{display:flex;align-items:center;gap:4px;}
.fp-edit-key{width:80px;flex-shrink:0;border:1.5px solid #e5e7eb;border-radius:5px;padding:4px 6px;font-size:11.5px;font-weight:600;color:#333;outline:none;font-family:inherit;transition:border-color .12s;background:#fafafa;}
.fp-edit-key:focus{border-color:#3b82f6;background:#fff;}
.fp-edit-sep{font-size:12px;color:#bbb;flex-shrink:0;}
.fp-edit-val{flex:1;min-width:0;border:1.5px solid #e5e7eb;border-radius:5px;padding:4px 6px;font-size:11.5px;color:#222;outline:none;font-family:inherit;transition:border-color .12s;background:#fafafa;}
.fp-edit-val:focus{border-color:#3b82f6;background:#fff;}
.fp-edit-del{flex-shrink:0;width:20px;height:20px;border-radius:50%;border:none;background:#f3f4f6;color:#aaa;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;padding:0;}
.fp-edit-del:hover{background:#fee2e2;color:#dc2626;}
.fp-add-row{width:100%;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px;border:1.5px dashed #d1d5db;border-radius:6px;background:none;color:#9ca3af;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s;margin-bottom:2px;}
.fp-add-row:hover{border-color:#3b82f6;color:#3b82f6;background:#eff6ff;}
</style>