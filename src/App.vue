<script setup>
import { ref, inject, onMounted, computed, watch } from "vue";

import { useDrawLayers, hexToRgba, makeIconDataUrl, makeFeatureStyle } from "./composables/useDrawLayers.js";
import { useArcGISLoader }          from "./composables/useArcGISLoader.js";

import MapToolbar           from "./components/MapToolbar.vue";
import LayerControl         from "./components/LayerControl.vue";
import LayerCustomize       from "./components/LayerCustomize.vue";
import LayerCustomizePopup  from "./components/LayerCustomizePopup.vue";
import LayerCustomizeAction from "./components/LayerCustomizeAction.vue";
import ImportPreviewModal   from "./components/ImportPreviewModal.vue";
import LayerDataEditor      from "./components/LayerDataEditor.vue";
import StatusBar            from "./components/StatusBar.vue";
import ModalAIAssistant     from "./components/ModalAIAssistant.vue";

//willReadFrequently Patch
;(function patchCanvas() {
  if (typeof HTMLCanvasElement === "undefined") return;
  const _orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    if (type === "2d") options = Object.assign({ willReadFrequently: true }, options || {});
    return _orig.call(this, type, options);
  };
})();

// OpenLayers injections
const format           = inject("ol-format");
const geoJson          = new format.GeoJSON();
const selectConditions = inject("ol-selectconditions");
const selectCondition  = selectConditions.pointerMove;

// Map state
const mapRef     = ref(null);
const center     = ref([118.0, -2.5]);
const zoom       = ref(5);
const projection = ref("EPSG:4326");
const rotation   = ref(0);

// Base layer visibility/opacity
const osmVisible   = ref(true);  const osmOpacity   = ref(1);
const dati1Visible = ref(true);  const dati1Opacity = ref(1);
const dati2Visible = ref(true);  const dati2Opacity = ref(1);

// BNPB layers
const pasarVisible    = ref(false); const pasarOpacity    = ref(1);
const sekolahVisible  = ref(false); const sekolahOpacity  = ref(1);
const terminalVisible = ref(false); const terminalOpacity = ref(1);
const wisataVisible   = ref(false); const wisataOpacity   = ref(1);
const stasiunVisible  = ref(false); const stasiunOpacity  = ref(1);
const bandaraVisible  = ref(false); const bandaraOpacity  = ref(1);
const pelabuhanVisible= ref(false); const pelabuhanOpacity= ref(1);
const clusterVisible  = ref(false); const clusterOpacity  = ref(1);
const clusterDistance = ref(80);    const clusterMinDistance = ref(40);

// Cluster Heatmap
const pasarMode          = ref("cluster");
const pasarHeatmapBlur   = ref(50);
const pasarHeatmapRadius = ref(5);
const pasarClusterVisible = computed(() => pasarVisible.value && pasarMode.value === "cluster");

// Demo points
const points = ref([
  {id:1, coordinate:[106.827,-6.175], name:"Monas"},
  {id:2, coordinate:[106.845,-6.208], name:"Grand Indonesia"},
  {id:3, coordinate:[106.816,-6.195], name:"Bundaran HI"},
  {id:4, coordinate:[106.823,-6.186], name:"Plaza Indonesia"},
  {id:5, coordinate:[106.850,-6.220], name:"Kuningan City"},
  {id:6, coordinate:[106.828,-6.225], name:"Blok M"},
  {id:7, coordinate:[106.797,-6.200], name:"Senayan"},
  {id:8, coordinate:[106.865,-6.230], name:"Cawang"},
  {id:9, coordinate:[106.810,-6.180], name:"Tanah Abang"},
  {id:10,coordinate:[106.840,-6.195], name:"Menteng"},
]);

// AI Chatbot
const aiChatOpen     = ref(false);
const aiEnabled      = ref(true);
const aiProvinceName = ref("");
const aiContextData  = ref("");
function openAIChat(name, ctx = "") {
  aiProvinceName.value = name;
  aiContextData.value  = ctx;
  aiChatOpen.value     = true;
}
function closeAIChat() { aiChatOpen.value = false; }

const dati1SourceRef = ref(null);
const hoveredName    = ref("");
const hoveredPos     = ref(null);

const layerPanelOpen = ref(true);
const klOpen         = ref(false);
const mouseCoord     = ref(null);
function onMapPointerMove(e) { if (e.coordinate) mouseCoord.value = e.coordinate; }
function onMapPointerLeave()  { mouseCoord.value = null; }

// Draw composable
const draw = useDrawLayers();

async function onImportFileChange(event, layerId) {
  await draw.importFile(event, layerId);
}

const previewModal    = ref({ show: false, layerId: null, layerColor: "#3498db" });
const layerDataEditor = ref({ show: false, layerId: null });

function handleEditData(layerId) {
  layerDataEditor.value = { show: true, layerId };
}

const layerDataEditorLayer = computed(() =>
  draw.drawLayers.value.find(l => l.id === layerDataEditor.value.layerId) ?? null
);

async function onLayerDataEditorSave({ layerId, updates }) {
  try {
    await draw.bulkUpdateFeaturesFromEditor(layerId, updates);
    layerDataEditor.value.show = false;
  } catch (err) {
    alert("Gagal menyimpan: " + err.message);
  }
}

function handleImportClick(layerId) {
  const layer = draw.drawLayers.value.find(l => l.id === layerId);
  previewModal.value = { show: true, layerId, layerColor: layer?.color || "#3498db" };
}

async function onPreviewConfirm({ layerId, features }) {
  previewModal.value.show = false;
  await draw.importBulkPayload(layerId, features);
}

function zoomToFeature(feat) { draw.zoomToFeature(feat, center, zoom); }
function onMapClick(event)    { draw.onMapClick(event, { dati1Visible, dati1SourceRef, openAIChat, aiEnabled }); }

// ArcGIS composable
const arcgis = useArcGISLoader({
  pasarVisible, pasarMode, pasarOpacity,
  pasarHeatmapBlur, pasarHeatmapRadius,
  mapRef,
});

// ── Sinkronisasi visible/opacity tile layer (programmatik OL) ─────────────────
// Tile layers dibuat di initHeatmapLayer(). Watch dipasang setelah mount.
const TILE_LAYER_BINDINGS = [
  { key: "pasar",     visible: pasarVisible,     opacity: pasarOpacity },
  { key: "sekolah",   visible: sekolahVisible,   opacity: sekolahOpacity },
  { key: "terminal",  visible: terminalVisible,  opacity: terminalOpacity },
  { key: "wisata",    visible: wisataVisible,     opacity: wisataOpacity },
  { key: "stasiun",   visible: stasiunVisible,   opacity: stasiunOpacity },
  { key: "bandara",   visible: bandaraVisible,   opacity: bandaraOpacity },
  { key: "pelabuhan", visible: pelabuhanVisible, opacity: pelabuhanOpacity },
];

// Cluster select handlers
const pasarClusterSelected     = arcgis.bindCluster(arcgis._pasarHandler,     hoveredName, hoveredPos, draw.popup);
const sekolahClusterSelected   = arcgis.bindCluster(arcgis._sekolahHandler,   hoveredName, hoveredPos, draw.popup);
const terminalClusterSelected  = arcgis.bindCluster(arcgis._terminalHandler,  hoveredName, hoveredPos, draw.popup);
const wisataClusterSelected    = arcgis.bindCluster(arcgis._wisataHandler,    hoveredName, hoveredPos, draw.popup);
const stasiunClusterSelected   = arcgis.bindCluster(arcgis._stasiunHandler,   hoveredName, hoveredPos, draw.popup);
const bandaraClusterSelected   = arcgis.bindCluster(arcgis._bandaraHandler,   hoveredName, hoveredPos, draw.popup);
const pelabuhanClusterSelected = arcgis.bindCluster(arcgis._pelabuhanHandler, hoveredName, hoveredPos, draw.popup);

// Select interaction
const selectLayerFilter = () => true;
const featureSelected = ev => {
  if (draw.popup.value) return;
  if (ev.selected.length === 1) {
    const f = ev.selected[0], ext = f.getGeometry().getExtent();
    hoveredPos.value  = [(ext[0]+ext[2])/2, (ext[1]+ext[3])/2];
    hoveredName.value = f.get("state")||f.get("name")||f.get("NAME_1")||f.get("Kabupaten")||f.get("KABUPATEN")||f.get("kab_kota")||"Unknown";
  } else { hoveredName.value = ""; hoveredPos.value = null; }
};
const selectFilter = f => ["state","name","NAME_1","Kabupaten","KABUPATEN","kab_kota"].some(k => f.get(k) !== undefined);

// ── Font preload untuk canvas icon rendering ──────────────────────────────
// Material Symbols harus fully loaded sebelum makeIconDataUrl() dipanggil
async function waitForMaterialSymbols() {
  if (typeof document === "undefined") return;
  try {
    await document.fonts.load("400 24px 'Material Symbols Outlined'", "place");
  } catch { /* ignore */ }
}

onMounted(async () => {
  // Load font dulu agar canvas icon render dengan benar
  await waitForMaterialSymbols();
  await draw.loadLayersFromDB();

  setTimeout(() => {
    // Init tile layers + heatmap (keduanya butuh ol-map sudah mount)
    arcgis.initHeatmapLayer();

    // Pasang watch setelah tile layers siap
    TILE_LAYER_BINDINGS.forEach(({ key, visible, opacity }) => {
      // Set state awal
      arcgis.syncTileLayer(key, visible.value, opacity.value);
      // Watch perubahan
      watch(visible, v  => arcgis.syncTileLayer(key, v, opacity.value));
      watch(opacity, op => arcgis.syncTileLayer(key, visible.value, op));
    });

    // Fetch vector data (offline → fallback online dengan pagination)
    arcgis.fetchAll();
  }, 500);
});

const popupFeatureType = computed(() => {
  if (!draw.popup.value) return "";
  return draw.drawLayers.value.flatMap(l => l.features).find(f => f.id === draw.popup.value.featureId)?.type || "";
});
const anyLoadingComputed  = computed(() => arcgis.anyLoading());
const totalLoadedComputed = computed(() => arcgis.totalLoaded());
</script>

<template>
  <link
    v-once
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
  />
  <div class="app" @click="draw.closeLayerMenu(); klOpen = false">

    <ol-map
      ref="mapRef" class="map"
      :loadTilesWhileAnimating="true"
      :loadTilesWhileInteracting="true"
      @click="onMapClick"
      @pointermove="onMapPointerMove"
      @mouseleave="onMapPointerLeave"
      style="position:absolute;inset:0;width:100%;height:100%;"
    >
      <ol-view :center="center" :zoom="zoom" :projection="projection" :rotation="rotation"/>
      <ol-zoom-control/>
      <ol-scale-line-control/>

      <!-- OSM -->
      <ol-tile-layer :visible="osmVisible" :opacity="osmOpacity">
        <ol-source-osm/>
      </ol-tile-layer>

      <!-- Select interaction (hover dati1/dati2) -->
      <ol-interaction-select @select="featureSelected" :condition="selectCondition" :filter="selectFilter" :layers="selectLayerFilter">
        <ol-style><ol-style-stroke color="green" :width="4"/><ol-style-fill color="rgba(0,255,0,0.15)"/></ol-style>
      </ol-interaction-select>

      <!-- Batas Provinsi -->
      <ol-vector-layer :visible="dati1Visible" :opacity="dati1Opacity">
        <ol-source-vector ref="dati1SourceRef" url="https://raw.githubusercontent.com/superpikar/indonesia-geojson/master/indonesia.geojson" :format="geoJson" :projection="projection"/>
        <ol-style><ol-style-stroke color="red" :width="1.5"/><ol-style-fill color="rgba(255,100,100,0.05)"/></ol-style>
      </ol-vector-layer>

      <!-- Batas Kab/Kota -->
      <ol-vector-layer :visible="dati2Visible" :opacity="dati2Opacity">
        <ol-source-vector url="https://raw.githubusercontent.com/TheMaggieSimpson/IndonesiaGeoJSON/main/kota-kabupaten.json" :format="geoJson" :projection="projection"/>
        <ol-style><ol-style-stroke color="#e67e22" :width="0.8"/><ol-style-fill color="rgba(230,126,34,0.04)"/></ol-style>
      </ol-vector-layer>


      <!-- PASAR -->
      <ol-interaction-cluster-select @select="pasarClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#27ae60" :width="4"/><ol-style-fill color="rgba(39,174,96,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="pasarClusterVisible" :opacity="pasarOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.pasarVectorSource.value = el?.source ? el : arcgis.pasarVectorSource.value || el"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overridePasarStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- SEKOLAH -->
      <ol-interaction-cluster-select @select="sekolahClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#2980b9" :width="4"/><ol-style-fill color="rgba(41,128,185,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="sekolahVisible" :opacity="sekolahOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.sekolahVectorSource.value = el?.source ? el : (arcgis.sekolahVectorSource.value?.source ? arcgis.sekolahVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overrideSekolahStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- TERMINAL -->
      <ol-interaction-cluster-select @select="terminalClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#8e44ad" :width="4"/><ol-style-fill color="rgba(142,68,173,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="terminalVisible" :opacity="terminalOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.terminalVectorSource.value = el?.source ? el : (arcgis.terminalVectorSource.value?.source ? arcgis.terminalVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overrideTerminalStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- WISATA -->
      <ol-interaction-cluster-select @select="wisataClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#f39c12" :width="4"/><ol-style-fill color="rgba(243,156,18,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="wisataVisible" :opacity="wisataOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.wisataVectorSource.value = el?.source ? el : (arcgis.wisataVectorSource.value?.source ? arcgis.wisataVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overrideWisataStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- STASIUN -->
      <ol-interaction-cluster-select @select="stasiunClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#0a7c5c" :width="4"/><ol-style-fill color="rgba(10,124,92,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="stasiunVisible" :opacity="stasiunOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.stasiunVectorSource.value = el?.source ? el : (arcgis.stasiunVectorSource.value?.source ? arcgis.stasiunVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overrideStasiunStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- BANDARA -->
      <ol-interaction-cluster-select @select="bandaraClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#1a5276" :width="4"/><ol-style-fill color="rgba(26,82,118,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="bandaraVisible" :opacity="bandaraOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.bandaraVectorSource.value = el?.source ? el : (arcgis.bandaraVectorSource.value?.source ? arcgis.bandaraVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overrideBandaraStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- PELABUHAN -->
      <ol-interaction-cluster-select @select="pelabuhanClusterSelected" :pointRadius="20">
        <ol-style><ol-style-stroke color="#7d6608" :width="4"/><ol-style-fill color="rgba(125,102,8,0.25)"/></ol-style>
      </ol-interaction-cluster-select>
      <ol-vector-layer :visible="pelabuhanVisible" :opacity="pelabuhanOpacity" :zIndex="11">
        <ol-source-cluster :distance="45">
          <ol-source-vector :ref="el => arcgis.pelabuhanVectorSource.value = el?.source ? el : (arcgis.pelabuhanVectorSource.value?.source ? arcgis.pelabuhanVectorSource.value : el)"/>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.overridePelabuhanStyle">
          <ol-style-circle :radius="18"><ol-style-stroke color="black" :width="12" :lineDash="[]" lineCap="butt"/><ol-style-fill color="black"/></ol-style-circle>
          <ol-style-text><ol-style-fill color="white"/></ol-style-text>
        </ol-style>
      </ol-vector-layer>

      <!-- Demo cluster -->
      <ol-vector-layer :visible="clusterVisible" :opacity="clusterOpacity">
        <ol-source-cluster :distance="clusterDistance" :minDistance="clusterMinDistance">
          <ol-source-vector>
            <ol-feature v-for="p in points" :key="p.id" :properties="{ name: p.name }">
              <ol-geom-point :coordinates="p.coordinate"/>
            </ol-feature>
          </ol-source-vector>
        </ol-source-cluster>
        <ol-style :overrideStyleFunction="arcgis.clusterStyle"/>
      </ol-vector-layer>

      <!-- Draw layers — icon & warna di-render via makeFeatureStyle per fitur -->
      <template v-for="(layer, layerIndex) in draw.drawLayers.value" :key="'dl-'+layer.id">
        <ol-vector-layer :visible="layer.visible" :opacity="layer.opacity" :zIndex="900 + (draw.drawLayers.value.length - layerIndex)">
          <ol-source-vector :ref="el => draw.setSourceRef(layer.id, el)" :projection="projection">
            <ol-interaction-draw
              v-if="draw.drawEnable.value && draw.activeLayerId.value === layer.id"
              :type="draw.drawType.value"
              @drawend="e => draw.onDrawEnd(e, layer.id)"
            >
              <ol-style>
                <ol-style-stroke :color="layer.color" :width="2" :lineDash="[8,4]"/>
                <ol-style-fill :color="hexToRgba(layer.color, 0.1)"/>
                <ol-style-circle :radius="5">
                  <ol-style-fill :color="layer.color"/>
                  <ol-style-stroke color="#fff" :width="2"/>
                </ol-style-circle>
              </ol-style>
            </ol-interaction-draw>
            <ol-interaction-modify v-if="draw.modifyEnable.value && draw.activeLayerId.value === layer.id"/>
            <ol-interaction-snap   v-if="draw.modifyEnable.value && draw.activeLayerId.value === layer.id"/>
          </ol-source-vector>
          <!-- Fallback style saat feature belum punya setStyle sendiri -->
          <ol-style>
            <ol-style-stroke :color="layer.color" :width="2.5"/>
            <ol-style-fill :color="hexToRgba(layer.color, 0.15)"/>
            <ol-style-circle :radius="7">
              <ol-style-fill :color="layer.color"/>
              <ol-style-stroke color="#fff" :width="2"/>
            </ol-style-circle>
          </ol-style>
        </ol-vector-layer>
      </template>

      <!-- Hover tooltip -->
      <ol-overlay v-if="hoveredName && hoveredPos && !draw.popup.value" :position="hoveredPos">
        <template #default><div class="hover-tip">{{ hoveredName }}</div></template>
      </ol-overlay>
    </ol-map>

    <MapToolbar
      :activeTool="draw.activeTool.value"
      :drawLayers="draw.drawLayers.value"
      :activeLayerId="draw.activeLayerId.value"
      :layerPanelOpen="layerPanelOpen"
      :klOpen="klOpen"
      @update:activeTool="v => draw.activeTool.value = v"
      @update:layerPanelOpen="v => layerPanelOpen = v"
      @update:klOpen="v => klOpen = v"
      @addLayer="draw.addDrawLayer"
    >
      <template #layer-control-panel>
        <transition name="kl-drop">
          <LayerControl
            v-show="klOpen"
            :aiEnabled="aiEnabled"
            :osmVisible="osmVisible"             :osmOpacity="osmOpacity"
            :dati1Visible="dati1Visible"         :dati1Opacity="dati1Opacity"
            :dati2Visible="dati2Visible"         :dati2Opacity="dati2Opacity"
            :pasarVisible="pasarVisible"         :pasarOpacity="pasarOpacity"
            :sekolahVisible="sekolahVisible"     :sekolahOpacity="sekolahOpacity"
            :wisataVisible="wisataVisible"       :wisataOpacity="wisataOpacity"
            :terminalVisible="terminalVisible"   :terminalOpacity="terminalOpacity"
            :stasiunVisible="stasiunVisible"     :stasiunOpacity="stasiunOpacity"
            :bandaraVisible="bandaraVisible"     :bandaraOpacity="bandaraOpacity"
            :pelabuhanVisible="pelabuhanVisible" :pelabuhanOpacity="pelabuhanOpacity"
            :clusterVisible="clusterVisible"     :clusterOpacity="clusterOpacity"
            :pasarMode="pasarMode"
            :pasarHeatmapBlur="pasarHeatmapBlur"
            :pasarHeatmapRadius="pasarHeatmapRadius"
            :loadingState="arcgis.loadingState.value"
            @update:osmVisible="v => osmVisible = v"             @update:osmOpacity="v => osmOpacity = v"
            @update:dati1Visible="v => dati1Visible = v"         @update:dati1Opacity="v => dati1Opacity = v"
            @update:dati2Visible="v => dati2Visible = v"         @update:dati2Opacity="v => dati2Opacity = v"
            @update:pasarVisible="v => pasarVisible = v"         @update:pasarOpacity="v => pasarOpacity = v"
            @update:sekolahVisible="v => sekolahVisible = v"     @update:sekolahOpacity="v => sekolahOpacity = v"
            @update:wisataVisible="v => wisataVisible = v"       @update:wisataOpacity="v => wisataOpacity = v"
            @update:terminalVisible="v => terminalVisible = v"   @update:terminalOpacity="v => terminalOpacity = v"
            @update:stasiunVisible="v => stasiunVisible = v"     @update:stasiunOpacity="v => stasiunOpacity = v"
            @update:bandaraVisible="v => bandaraVisible = v"     @update:bandaraOpacity="v => bandaraOpacity = v"
            @update:pelabuhanVisible="v => pelabuhanVisible = v" @update:pelabuhanOpacity="v => pelabuhanOpacity = v"
            @update:clusterVisible="v => clusterVisible = v"     @update:clusterOpacity="v => clusterOpacity = v"
            @update:pasarMode="v => pasarMode = v"
            @update:pasarHeatmapBlur="v => pasarHeatmapBlur = v"
            @update:pasarHeatmapRadius="v => pasarHeatmapRadius = v"
            @update:aiEnabled="v => aiEnabled = v"
          />
        </transition>
      </template>
    </MapToolbar>

    <transition name="sidebar-slide">
      <LayerCustomize
        v-show="layerPanelOpen"
        :drawLayers="draw.drawLayers.value"
        :activeLayerId="draw.activeLayerId.value"
        :colorPalette="draw.COLOR_PALETTE"
        @update:activeLayerId="v => draw.activeLayerId.value = v"
        @addLayer="draw.addDrawLayer"
        @openLayerMenu="draw.openLayerMenu"
        @finishRename="draw.finishRename"
        @deleteFeature="draw.deleteFeature"
        @openPopup="draw.openPopup"
        @zoomToFeature="zoomToFeature"
        @updateLayerStyle="(layerId, style) => draw.updateLayerStyle(layerId, style)"
        @reorderLayers="(from, to) => { const arr = draw.drawLayers.value; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); }"
      />
    </transition>

    <StatusBar
      :mouseCoord="mouseCoord"
      :activeTool="draw.activeTool.value"
      :drawEnable="draw.drawEnable.value"
      :dati1Visible="dati1Visible"
      :aiChatOpen="aiChatOpen"
      :pasarVisible="pasarVisible"
      :pasarMode="pasarMode"
      :pasarHeatmapBlur="pasarHeatmapBlur"
      :pasarHeatmapRadius="pasarHeatmapRadius"
      :loadingState="arcgis.loadingState.value"
      :anyLoading="anyLoadingComputed"
      :totalLoaded="totalLoadedComputed"
    />

    <transition name="fp-slide">
      <LayerCustomizePopup
        v-if="draw.popup.value"
        :popup="draw.popup.value"
        :colorPalette="draw.COLOR_PALETTE"
        :featureType="popupFeatureType"
        @save="draw.savePopup"
        @delete="draw.deleteFeature"
        @close="draw.closePopup"
      />
    </transition>

    <LayerCustomizeAction
      v-if="draw.layerMenu.value"
      :layerMenu="draw.layerMenu.value"
      :importLoading="draw.importLoading.value"
      :importProgress="draw.importProgress.value"
      :importError="draw.importError.value"
      :layerIds="draw.drawLayers.value.map(l => l.id)"
      @rename="id => { const l = draw.drawLayers.value.find(l => l.id === id); if (l) l.editing = true; }"
      @editData="handleEditData"
      @exportGeoJSON="draw.exportGeoJSON"
      @exportExcel="draw.exportLayerToCSV"
      @exportXLS="draw.exportLayerToXLS"
      @import="handleImportClick"
      @importDirect="draw.triggerImport"
      @delete="draw.deleteDrawLayer"
      @close="draw.closeLayerMenu"
    />

    <ImportPreviewModal
      :show="previewModal.show"
      :layerId="previewModal.layerId"
      :layerColor="previewModal.layerColor"
      @close="previewModal.show = false"
      @confirm="onPreviewConfirm"
    />

    <LayerDataEditor
      :show="layerDataEditor.show"
      :layer="layerDataEditorLayer"
      @close="layerDataEditor.show = false"
      @save="onLayerDataEditorSave"
    />

    <template v-for="layer in draw.drawLayers.value" :key="'imp-'+layer.id">
      <input
        :id="`import-${layer.id}`"
        type="file"
        accept=".gpx,.kml,.geojson,.json"
        style="display:none"
        @change="e => onImportFileChange(e, layer.id)"
      />
    </template>

    <ModalAIAssistant :isOpen="aiChatOpen" :provinceName="aiProvinceName" :contextData="aiContextData" @close="closeAIChat"/>
  </div>
</template>

<style scoped>
:global(html,body){margin:0;padding:0;width:100vw;height:100vh;overflow:hidden;font-family:"Inter","Segoe UI",system-ui,sans-serif;}
:global(.ol-viewport){border:0!important;outline:0!important;}
:global(.ol-viewport canvas){display:block;}


.app{position:fixed;inset:0;width:100%;height:100%;overflow:hidden;}
.map{position:absolute;inset:0;width:100%!important;height:100%!important;}
:deep(.ol-zoom){bottom:1.5rem;right:1rem;top:auto;left:auto;}
:deep(.ol-scale-line){bottom:0.5rem;left:50%;transform:translateX(-50%);}
:deep(.ol-attribution){bottom:0.2rem;right:0.5rem;font-size:10px;}
.hover-tip{background:rgba(20,20,20,.88);color:#fff;padding:5px 11px;border-radius:20px;font-size:12.5px;font-weight:600;box-shadow:0 3px 10px rgba(0,0,0,.4);white-space:nowrap;transform:translate(-50%,-130%);pointer-events:none;}
.kl-drop-enter-active,.kl-drop-leave-active{transition:all .16s ease;}
.kl-drop-enter-from,.kl-drop-leave-to{opacity:0;transform:translateY(-6px);}
.sidebar-slide-enter-active,.sidebar-slide-leave-active{transition:all .2s ease;}
.sidebar-slide-enter-from,.sidebar-slide-leave-to{transform:translateX(-100%);opacity:0;}
.fp-slide-enter-active,.fp-slide-leave-active{transition:all .2s ease;}
.fp-slide-enter-from,.fp-slide-leave-to{opacity:0;transform:translateY(-50%) translateX(20px);}
</style>