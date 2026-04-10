<script setup>

const props = defineProps({
  // AI click toggle
  aiEnabled: { type: Boolean, default: true },
  // Batas Wilayah
  dati1Visible: Boolean, dati1Opacity: Number,
  dati2Visible: Boolean, dati2Opacity: Number,
  // Fasilitas
  pasarVisible: Boolean, pasarOpacity: Number,
  sekolahVisible: Boolean, sekolahOpacity: Number,
  wisataVisible: Boolean, wisataOpacity: Number,
  // Transportasi
  terminalVisible: Boolean, terminalOpacity: Number,
  stasiunVisible: Boolean, stasiunOpacity: Number,
  bandaraVisible: Boolean, bandaraOpacity: Number,
  pelabuhanVisible: Boolean, pelabuhanOpacity: Number,
  // Lainnya
  clusterVisible: Boolean, clusterOpacity: Number,
  osmVisible: Boolean, osmOpacity: Number,
  // Pasar mode & heatmap
  pasarMode: { type: String, default: "cluster" },
  pasarHeatmapBlur: { type: Number, default: 50 },
  pasarHeatmapRadius: { type: Number, default: 10 },
  // Loading state
  loadingState: { type: Object, required: true },
});

const emit = defineEmits([
  "update:aiEnabled",
  // emit update per field (v-model pattern)
  "update:dati1Visible",   "update:dati1Opacity",
  "update:dati2Visible",   "update:dati2Opacity",
  "update:pasarVisible",   "update:pasarOpacity",
  "update:sekolahVisible", "update:sekolahOpacity",
  "update:wisataVisible",  "update:wisataOpacity",
  "update:terminalVisible","update:terminalOpacity",
  "update:stasiunVisible", "update:stasiunOpacity",
  "update:bandaraVisible", "update:bandaraOpacity",
  "update:pelabuhanVisible","update:pelabuhanOpacity",
  "update:clusterVisible", "update:clusterOpacity",
  "update:osmVisible",     "update:osmOpacity",
  "update:pasarMode",
  "update:pasarHeatmapBlur",
  "update:pasarHeatmapRadius",
]);

import { ref } from "vue";
const grpOpen = ref({ wilayah: false, fasilitas: false, transportasi: false, lainnya: false });
function toggleGrp(k) { grpOpen.value[k] = !grpOpen.value[k]; }

const pct = v => Math.round(v * 100) + "%";
</script>

<template>
  <div class="kl-panel" @click.stop>

    <!-- ── Batas Wilayah ── -->
    <div class="kl-group">
      <div class="kl-grp-hd" @click="toggleGrp('wilayah')">
        <svg class="kl-chev" :class="{open:grpOpen.wilayah}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>Batas Wilayah</span>
      </div>
      <div v-show="grpOpen.wilayah" class="kl-grp-body">
        <label class="kl-row">
          <input type="checkbox" :checked="dati1Visible" @change="emit('update:dati1Visible', $event.target.checked)"/>
          <span class="kl-dot" style="background:rgb(200,80,80)"/>
          <span class="kl-name">DATI I (Provinsi)</span>
        </label>
        <!-- <div class="kl-ai-row" :class="{ 'kl-ai-disabled': !dati1Visible }">
          <span class="kl-ai-label">✦ Klik → AI</span>
          <button
            class="kl-ai-toggle"
            :class="{ active: aiEnabled && dati1Visible }"
            :disabled="!dati1Visible"
            @click="emit('update:aiEnabled', !aiEnabled)"
            :title="!dati1Visible ? 'Aktifkan layer DATI I dulu' : aiEnabled ? 'Nonaktifkan AI klik provinsi' : 'Aktifkan AI klik provinsi'"
          >
            <span class="kl-ai-track"><span class="kl-ai-thumb"/></span>
            <span class="kl-ai-status">{{ aiEnabled && dati1Visible ? 'ON' : 'OFF' }}</span>
          </button>
        </div> -->
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="dati1Opacity" @input="emit('update:dati1Opacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(dati1Opacity) }}</span>
        </div>
        <label class="kl-row">
          <input type="checkbox" :checked="dati2Visible" @change="emit('update:dati2Visible', $event.target.checked)"/>
          <span class="kl-dot" style="background:rgb(230,126,34)"/>
          <span class="kl-name">DATI II (Kab/Kota)</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="dati2Opacity" @input="emit('update:dati2Opacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(dati2Opacity) }}</span>
        </div>
      </div>
    </div>

    <!-- ── Fasilitas Umum ── -->
    <div class="kl-group">
      <div class="kl-grp-hd" @click="toggleGrp('fasilitas')">
        <svg class="kl-chev" :class="{open:grpOpen.fasilitas}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>Fasilitas Umum</span>
      </div>
      <div v-show="grpOpen.fasilitas" class="kl-grp-body">

        <!-- Pasar -->
        <label class="kl-row">
          <input type="checkbox" :checked="pasarVisible" @change="emit('update:pasarVisible', $event.target.checked)"/>
          <span class="kl-dot" style="background:rgb(0,110,60)"/>
          <span class="kl-name">Pasar Tradisional</span>
          <span v-if="loadingState.pasar.loading" class="kl-badge loading">···</span>
          <span v-else-if="loadingState.pasar.loaded" class="kl-badge">{{ loadingState.pasar.loaded.toLocaleString() }}</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="pasarOpacity" @input="emit('update:pasarOpacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(pasarOpacity) }}</span>
        </div>
        <!-- Mode cluster/heatmap khusus pasar -->
        <div v-if="pasarVisible" class="kl-mode-row">
          <button :class="['kl-mode-btn', pasarMode==='cluster' ? 'active' : '']" @click="emit('update:pasarMode','cluster')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><circle cx="4" cy="6" r="2.5"/><circle cx="20" cy="6" r="2.5"/><circle cx="4" cy="18" r="2.5"/><circle cx="20" cy="18" r="2.5"/></svg>
            Cluster
          </button>
          <button :class="['kl-mode-btn', pasarMode==='heatmap' ? 'active' : '']" @click="emit('update:pasarMode','heatmap')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/></svg>
            Heatmap
          </button>
        </div>
        <div v-if="pasarVisible && pasarMode==='heatmap'" class="kl-heatmap-controls">
          <div class="kl-hm-row">
            <span class="kl-hm-label">Blur</span>
            <input type="range" class="kl-slider" :value="pasarHeatmapBlur" @input="emit('update:pasarHeatmapBlur', +$event.target.value)" min="1" max="60" step="1"/>
            <span class="kl-pct">{{ pasarHeatmapBlur }}</span>
          </div>
          <div class="kl-hm-row">
            <span class="kl-hm-label">Radius</span>
            <input type="range" class="kl-slider" :value="pasarHeatmapRadius" @input="emit('update:pasarHeatmapRadius', +$event.target.value)" min="1" max="60" step="1"/>
            <span class="kl-pct">{{ pasarHeatmapRadius }}</span>
          </div>
        </div>

        <!-- Sekolah -->
        <label class="kl-row">
          <input type="checkbox" :checked="sekolahVisible" @change="emit('update:sekolahVisible', $event.target.checked)"/>
          <span class="kl-dot" style="background:rgb(80,140,240)"/>
          <span class="kl-name">Sekolah</span>
          <span v-if="loadingState.sekolah.loading" class="kl-badge loading">···</span>
          <span v-else-if="loadingState.sekolah.loaded" class="kl-badge">{{ loadingState.sekolah.loaded.toLocaleString() }}</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="sekolahOpacity" @input="emit('update:sekolahOpacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(sekolahOpacity) }}</span>
        </div>

        <!-- Wisata -->
        <label class="kl-row">
          <input type="checkbox" :checked="wisataVisible" @change="emit('update:wisataVisible', $event.target.checked)"/>
          <span class="kl-dot" style="background:rgb(230,160,0)"/>
          <span class="kl-name">Objek Wisata</span>
          <span v-if="loadingState.wisata.loading" class="kl-badge loading">···</span>
          <span v-else-if="loadingState.wisata.loaded" class="kl-badge">{{ loadingState.wisata.loaded.toLocaleString() }}</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="wisataOpacity" @input="emit('update:wisataOpacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(wisataOpacity) }}</span>
        </div>
      </div>
    </div>

    <!-- ── Transportasi ── -->
    <div class="kl-group">
      <div class="kl-grp-hd" @click="toggleGrp('transportasi')">
        <svg class="kl-chev" :class="{open:grpOpen.transportasi}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>Transportasi</span>
      </div>
      <div v-show="grpOpen.transportasi" class="kl-grp-body">
        <template v-for="item in [
          { key:'terminal', label:'Terminal',   color:'rgb(170,70,210)',  visKey:'terminalVisible', opcKey:'terminalOpacity' },
          { key:'stasiun',  label:'Stasiun KA', color:'rgb(0,160,110)',   visKey:'stasiunVisible',  opcKey:'stasiunOpacity'  },
          { key:'bandara',  label:'Bandara',    color:'rgb(20,120,200)',  visKey:'bandaraVisible',  opcKey:'bandaraOpacity'  },
          { key:'pelabuhan',label:'Pelabuhan',  color:'rgb(160,110,20)', visKey:'pelabuhanVisible',opcKey:'pelabuhanOpacity'},
        ]" :key="item.key">
          <label class="kl-row">
            <input type="checkbox" :checked="props[item.visKey]" @change="emit('update:'+item.visKey, $event.target.checked)"/>
            <span class="kl-dot" :style="{background:item.color}"/>
            <span class="kl-name">{{ item.label }}</span>
            <span v-if="loadingState[item.key]?.loading" class="kl-badge loading">···</span>
            <span v-else-if="loadingState[item.key]?.loaded" class="kl-badge">{{ loadingState[item.key].loaded.toLocaleString() }}</span>
          </label>
          <div class="kl-opc">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
            <input type="range" class="kl-slider" :value="props[item.opcKey]" @input="emit('update:'+item.opcKey, +$event.target.value)" min="0" max="1" step="0.05"/>
            <span class="kl-pct">{{ pct(props[item.opcKey]) }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- ── Lainnya ── -->
    <div class="kl-group">
      <div class="kl-grp-hd" @click="toggleGrp('lainnya')">
        <svg class="kl-chev" :class="{open:grpOpen.lainnya}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>Lainnya</span>
      </div>
      <div v-show="grpOpen.lainnya" class="kl-grp-body">
        <label class="kl-row">
          <input type="checkbox" :checked="clusterVisible" @change="emit('update:clusterVisible', $event.target.checked)"/>
          <span class="kl-dot" style="background:#3498db"/>
          <span class="kl-name">Cluster Dummy</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="clusterOpacity" @input="emit('update:clusterOpacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(clusterOpacity) }}</span>
        </div>
        <label class="kl-row">
          <input type="checkbox" :checked="osmVisible" @change="emit('update:osmVisible', $event.target.checked)"/>
          <span class="kl-dot" style="background:#888"/>
          <span class="kl-name">Base Map (OSM)</span>
        </label>
        <div class="kl-opc">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>
          <input type="range" class="kl-slider" :value="osmOpacity" @input="emit('update:osmOpacity', +$event.target.value)" min="0" max="1" step="0.05"/>
          <span class="kl-pct">{{ pct(osmOpacity) }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.kl-ai-row{display:flex;align-items:center;gap:6px;padding:2px 12px 4px 28px;}
.kl-ai-disabled{opacity:.38;pointer-events:none;}
.kl-ai-label{flex:1;font-size:11px;color:#6b7280;}
.kl-ai-toggle{display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;padding:0;}
.kl-ai-toggle:disabled{cursor:default;}
.kl-ai-track{display:inline-block;width:26px;height:14px;border-radius:7px;background:#d1d5db;position:relative;transition:background .18s;flex-shrink:0;}
.kl-ai-toggle.active .kl-ai-track{background:#7c3aed;}
.kl-ai-thumb{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s;}
.kl-ai-toggle.active .kl-ai-thumb{transform:translateX(12px);}
.kl-ai-status{font-size:9px;font-weight:700;color:#9ca3af;min-width:18px;}
.kl-ai-toggle.active .kl-ai-status{color:#7c3aed;}
.kl-panel{position:absolute;top:calc(100% + 6px);right:0;width:260px;background:rgba(255,255,255,0.98);backdrop-filter:blur(12px);border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,0.18),0 1px 4px rgba(0,0,0,0.08);max-height:calc(100vh - 80px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#ddd transparent;padding-bottom:6px;}
.kl-panel::-webkit-scrollbar{width:3px;}
.kl-panel::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px;}
.kl-group{border-bottom:1px solid rgba(0,0,0,0.05);}
.kl-grp-hd{display:flex;align-items:center;gap:6px;padding:7px 12px;cursor:pointer;font-size:10.5px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;transition:background .1s;user-select:none;}
.kl-grp-hd:hover{background:rgba(0,0,0,0.025);}
.kl-chev{transition:transform .16s;color:#bbb;flex-shrink:0;}
.kl-chev.open{transform:rotate(180deg);}
.kl-grp-body{padding:0 0 4px;}
.kl-row{display:flex;align-items:center;gap:6px;padding:4px 12px;cursor:pointer;transition:background .1s;}
.kl-row:hover{background:rgba(0,0,0,0.02);}
.kl-row input[type=checkbox]{width:13px;height:13px;cursor:pointer;accent-color:#1a73e8;flex-shrink:0;}
.kl-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;border:1px solid rgba(0,0,0,.1);}
.kl-name{flex:1;font-size:12px;color:#333;}
.kl-badge{font-size:10px;font-weight:700;background:rgba(0,0,0,.07);padding:1px 5px;border-radius:8px;color:#666;flex-shrink:0;}
.kl-badge.loading{color:#1a73e8;background:rgba(26,115,232,.1);}
.kl-badge-ai{background:rgba(37,99,235,0.1);color:#2563eb;}
.kl-opc{display:flex;align-items:center;gap:6px;padding:2px 12px 3px 28px;color:#ccc;}
.kl-slider{flex:1;height:3px;accent-color:#1a73e8;cursor:pointer;}
.kl-pct{font-size:10px;color:#aaa;width:26px;text-align:right;flex-shrink:0;}
.kl-mode-row{display:flex;gap:4px;padding:4px 12px 2px 28px;}
.kl-mode-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 0;border-radius:6px;border:1.5px solid #e5e7eb;background:#f9fafb;font-size:10.5px;font-weight:600;color:#888;cursor:pointer;transition:all .13s;}
.kl-mode-btn:hover{border-color:#93c5fd;color:#3b82f6;}
.kl-mode-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;}
.kl-heatmap-controls{padding:4px 12px 6px 28px;background:rgba(239,246,255,0.6);border-radius:0 0 6px 6px;margin:0 8px 4px;}
.kl-hm-row{display:flex;align-items:center;gap:6px;padding:2px 0;}
.kl-hm-label{font-size:10px;color:#6b7280;width:34px;flex-shrink:0;}
</style>