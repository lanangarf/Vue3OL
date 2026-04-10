<script setup>

const props = defineProps({
  mouseCoord:     { type: Array,   default: null },
  activeTool:     { type: String,  default: null },
  drawEnable:     { type: Boolean, default: false },
  dati1Visible:   { type: Boolean, default: false },
  aiChatOpen:     { type: Boolean, default: false },
  pasarVisible:   { type: Boolean, default: false },
  pasarMode:      { type: String,  default: "cluster" },
  pasarHeatmapBlur:   { type: Number, default: 50 },
  pasarHeatmapRadius: { type: Number, default: 10 },
  loadingState:   { type: Object,  required: true },
  anyLoading:     { type: Boolean, default: false },
  totalLoaded:    { type: Number,  default: 0 },
});

const typeLabels = {
  Point:      "Titik",
  LineString: "Garis",
  Polygon:    "Poligon",
  Circle:     "Lingkaran",
};
</script>

<template>
  <div class="infobar">
    <!-- Hint klik provinsi untuk AI -->
    <div v-if="dati1Visible && !activeTool && !aiChatOpen" class="ib-hint ib-province-hint">
      🗺️ Klik provinsi → Analisis AI
    </div>

    <!-- Hint mode draw aktif -->
    <div v-if="activeTool" class="ib-hint">
      <template v-if="drawEnable">
        ✏️ Klik → {{ typeLabels[activeTool] }}
        <template v-if="activeTool !== 'Point'"> · dbl-klik selesai</template>
      </template>
      <template v-else-if="activeTool === 'modify'">↔ Drag titik untuk ubah bentuk</template>
      <template v-else>🗑 Klik objek untuk hapus</template>
    </div>

    <!-- Status loading per layer -->
    <template v-for="(st, key) in loadingState" :key="key">
      <div v-if="st.loading" class="ib-loading">
        <span class="spinner"/>{{ key }} {{ st.loaded.toLocaleString() }}
      </div>
    </template>

    <!-- Total data loaded -->
    <!-- <div v-if="!anyLoading && totalLoaded > 0" class="ib-ok">
      ✓ {{ totalLoaded.toLocaleString() }} data
    </div> -->

    <!-- Koordinat mouse -->
    <div v-if="mouseCoord" class="ib-coord">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
      </svg>
      {{ mouseCoord[0].toFixed(4) }}° BT
      <span class="ib-sep">|</span>
      {{ Math.abs(mouseCoord[1]).toFixed(4) }}° {{ mouseCoord[1] >= 0 ? 'LU' : 'LS' }}
    </div>
  </div>
</template>

<style scoped>
.infobar{position:absolute;top:58px;right:14px;z-index:550;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;pointer-events:none;max-width:calc(100vw - 280px);}
.ib-coord{display:flex;align-items:center;gap:4px;font-family:'SF Mono','Fira Code',monospace;font-size:11px;font-weight:500;color:#444;background:rgba(255,255,255,0.92);backdrop-filter:blur(8px);border-radius:20px;padding:3px 10px;box-shadow:0 1px 6px rgba(0,0,0,0.12);}
.ib-sep{color:#ccc;margin:0 2px;}
.ib-hint{background:rgba(59,130,246,0.12);backdrop-filter:blur(8px);color:#1d4ed8;font-weight:600;font-size:11px;border-radius:20px;padding:3px 10px;box-shadow:0 1px 6px rgba(0,0,0,0.08);}
.ib-province-hint{animation:hint-blink 2.5s ease-in-out infinite;}
@keyframes hint-blink{0%,100%{opacity:1;}50%{opacity:0.55;}}
.ib-loading{display:flex;align-items:center;gap:5px;color:#3b82f6;font-size:11px;font-weight:600;background:rgba(255,255,255,0.92);backdrop-filter:blur(8px);border-radius:20px;padding:3px 10px;box-shadow:0 1px 6px rgba(0,0,0,0.1);}
.ib-ok{color:#16a34a;font-size:11px;font-weight:600;background:rgba(255,255,255,0.92);backdrop-filter:blur(8px);border-radius:20px;padding:3px 10px;box-shadow:0 1px 6px rgba(0,0,0,0.1);}
.spinner{width:11px;height:11px;border:2px solid rgba(59,130,246,.3);border-top-color:#3b82f6;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg);}}
</style>