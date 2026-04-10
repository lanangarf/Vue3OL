import { ref, watch, shallowRef } from "vue";
import { GeoJSON as OLGeoJSON }   from "ol/format";
import { Style, Circle, Fill, Stroke, Text } from "ol/style";
import Heatmap        from "ol/layer/Heatmap";
import TileLayer      from "ol/layer/Tile";
import TileArcGISRest from "ol/source/TileArcGISRest";
import VectorSource   from "ol/source/Vector";
import Feature        from "ol/Feature";
import Point          from "ol/geom/Point";

// ─── Proxy Express ────────────────────────────────────────────────────────────
const PROXY = "http://localhost:3001/api/arcgis-proxy";
export function proxyUrl(targetUrl) {
  return `${PROXY}?url=${encodeURIComponent(targetUrl)}`;
}

// ─── ArcGIS REST Endpoints ────────────────────────────────────────────────────
export const ARCGIS_BASE = {
  pasar:     "https://gis.bnpb.go.id/server/rest/services/Basemap/Pasar_tradisional/MapServer/0",
  sekolah:   "https://gis.bnpb.go.id/server/rest/services/Basemap/Sekolah/MapServer/0",
  terminal:  "https://gis.bnpb.go.id/server/rest/services/Basemap/Terminal/MapServer/0",
  wisata:    "https://gis.bnpb.go.id/server/rest/services/thematic/Objek_wisata/MapServer/0",
  stasiun:   "https://gis.bnpb.go.id/server/rest/services/Basemap/stasiun_kereta/MapServer/0",
  bandara:   "https://gis.bnpb.go.id/server/rest/services/Basemap/Bandara/MapServer/0",
  pelabuhan: "https://gis.bnpb.go.id/server/rest/services/Basemap/Pelabuhan/MapServer/0",
};

export const ARCGIS_URLS = Object.fromEntries(
  Object.entries(ARCGIS_BASE).map(([k, v]) => [k, `${v}/query`])
);

// ─── Field nama per layer ─────────────────────────────────────────────────────
export const NAME_FIELDS = {
  pasar:     ["POI_NAME", "nama_pasar", "NAMA_PASAR", "name"],
  bandara:   ["namobj", "nama_bandara", "NAMA_BANDARA", "nama", "name"],
  pelabuhan: ["namobj", "nama_pelabuhan", "NAMA_PELABUHAN", "nama", "name"],
  stasiun:   ["namobj", "nama_stasiun", "NAMA_STASIUN", "nama", "name"],
  terminal:  ["namaobj", "nama_terminal", "NAMA_TERMINAL", "nama", "name"],
  wisata:    ["Nama_Objek","nama_objek","NAMA_OBJEK","nama_wisata","NAMA_WISATA","nama","name"],
  sekolah:   ["nama_sekolah", "NAMA_SEKOLAH", "name"],
};

// ─── GeoJSON lokal via fetch() ────────────────────────────────────────────────
const OFFLINE_PATHS = {
  bandara:   "/src/assets/data/bandara.geojson",
  pasar:     "/src/assets/data/pasar.geojson",
  pelabuhan: "/src/assets/data/pelabuhan.geojson",
  stasiun:   "/src/assets/data/stasiun.geojson",
  terminal:  "/src/assets/data/terminal.geojson",
  wisata:    "/src/assets/data/wisata.geojson",
};

const LAYER_KEYS = ["pasar","sekolah","terminal","wisata","stasiun","bandara","pelabuhan"];

// ─── Warna tile per layer (untuk identifikasi visual di map) ─────────────────
const TILE_ZINDEX = 10; // tile di bawah cluster (zIndex 11)

// ═════════════════════════════════════════════════════════════════════════════
export function useArcGISLoader({
  pasarVisible, pasarMode, pasarOpacity,
  pasarHeatmapBlur, pasarHeatmapRadius,
  mapRef,
}) {

  // ── VectorSource refs (cluster & popup) ─────────────────────────────────────
  const pasarVectorSource     = ref(null);
  const sekolahVectorSource   = ref(null);
  const terminalVectorSource  = ref(null);
  const wisataVectorSource    = ref(null);
  const stasiunVectorSource   = ref(null);
  const bandaraVectorSource   = ref(null);
  const pelabuhanVectorSource = ref(null);

  const vectorSourceMap = {
    pasar:     pasarVectorSource,
    sekolah:   sekolahVectorSource,
    terminal:  terminalVectorSource,
    wisata:    wisataVectorSource,
    stasiun:   stasiunVectorSource,
    bandara:   bandaraVectorSource,
    pelabuhan: pelabuhanVectorSource,
  };

  // ── OL TileLayers (programmatik, ditambahkan ke map setelah mount) ───────────
  // Disimpan di sini agar bisa toggle visible / opacity dari luar
  const tileLayers = shallowRef({});   // { pasar: TileLayer, sekolah: TileLayer, ... }

  // ── Loading state ────────────────────────────────────────────────────────────
  const loadingState = ref(
    Object.fromEntries(LAYER_KEYS.map(k => [k, {
      loading: false,
      loaded:  0,
      error:   "",
      source:  "",   // "vector-offline" | "vector-online"
      page:    0,
    }]))
  );

  const anyLoading  = () => Object.values(loadingState.value).some(s => s.loading);
  const totalLoaded = () => Object.values(loadingState.value).reduce((s, v) => s + v.loaded, 0);

  // ── Heatmap ──────────────────────────────────────────────────────────────────
  let heatmapLayer  = null;
  let heatmapSource = null;

  function getOlMap() { return mapRef.value?.map ?? null; }

  // ── Init: heatmap + tile layers ───────────────────────────────────────────────
  function initHeatmapLayer() {
    const olMap = getOlMap();
    if (!olMap) { console.warn("[ArcGIS] OL map belum siap"); return; }

    // Heatmap pasar
    heatmapSource = new VectorSource({ features: [] });
    heatmapLayer  = new Heatmap({
      source:  heatmapSource,
      blur:    pasarHeatmapBlur.value,
      radius:  pasarHeatmapRadius.value,
      weight:  f => f.get("weight") ?? 1,
      visible: false,
      zIndex:  2,
      opacity: pasarOpacity.value,
      updateWhileAnimating:   false,
      updateWhileInteracting: false,
    });
    heatmapLayer.getFeatures = () => Promise.resolve([]);
    heatmapLayer.set("disableHitDetection", true);
    olMap.addLayer(heatmapLayer);

    // Tile layers — satu per layer BNPB, ditambahkan ke map secara programatik
    const layers = {};
    LAYER_KEYS.forEach(key => {
      const src = new TileArcGISRest({
        url:        proxyUrl(ARCGIS_BASE[key]),
        projection: "EPSG:4326",
      });
      const tl = new TileLayer({
        source:  src,
        visible: false,   // default off, dikontrol via watch di bawah
        opacity: 1,
        zIndex:  TILE_ZINDEX,
      });
      olMap.addLayer(tl);
      layers[key] = tl;
    });
    tileLayers.value = layers;
  }

  // ── Watch: sinkronisasi visible/opacity tile dengan ref di App.vue ─────────
  // App.vue memanggil syncTileLayer(key, visible, opacity) saat ref berubah.
  function syncTileLayer(key, visible, opacity = 1) {
    const tl = tileLayers.value[key];
    if (!tl) return;
    tl.setVisible(visible);
    tl.setOpacity(opacity);
  }

  watch([pasarMode, pasarVisible], () => {
    if (heatmapLayer)
      heatmapLayer.setVisible(pasarVisible.value && pasarMode.value === "heatmap");
  });
  watch(pasarHeatmapBlur,   val => { if (heatmapLayer) heatmapLayer.setBlur(val); });
  watch(pasarHeatmapRadius, val => { if (heatmapLayer) heatmapLayer.setRadius(val); });
  watch(pasarOpacity,       val => { if (heatmapLayer) heatmapLayer.setOpacity(val); });

  // ── ArcGIS JSON → GeoJSON ────────────────────────────────────────────────────
  function arcgisToGeoJson(json) {
    if (json.type === "FeatureCollection" || json.type === "Feature") return json;
    if (json.error) throw new Error(`Server: ${JSON.stringify(json.error)}`);
    const features = (json.features || []).map(f => {
      const g = f.geometry; let geometry = null;
      if (g) {
        if (g.x !== undefined && g.y !== undefined)
          geometry = { type: "Point", coordinates: [g.x, g.y] };
        else if (g.paths)
          geometry = g.paths.length === 1
            ? { type: "LineString",      coordinates: g.paths[0] }
            : { type: "MultiLineString", coordinates: g.paths };
        else if (g.rings)
          geometry = g.rings.length === 1
            ? { type: "Polygon",      coordinates: g.rings }
            : { type: "MultiPolygon", coordinates: g.rings.map(r => [r]) };
      }
      return { type: "Feature", properties: f.attributes || {}, geometry };
    });
    return { type: "FeatureCollection", features };
  }

  // ── Inject features ke VectorSource (clear + set, retry) ─────────────────────
  function injectFeatures(vSrcRef, features, stateKey) {
    const attempt = (retry = 0) => {
      const src = vSrcRef.value?.source;
      if (src) { src.clear(); src.addFeatures(features); }
      else if (retry < 25) setTimeout(() => attempt(retry + 1), 150 + retry * 80);
      else console.warn(`[ArcGIS:${stateKey}] VectorSource tidak tersedia setelah 25 retry`);
    };
    attempt();
  }

  // ── Append batch ke VectorSource (tanpa clear, untuk pagination) ─────────────
  function appendFeatures(vSrcRef, features) {
    const attempt = (retry = 0) => {
      const src = vSrcRef.value?.source;
      if (src) src.addFeatures(features);
      else if (retry < 25) setTimeout(() => attempt(retry + 1), 150 + retry * 80);
    };
    attempt();
  }

  function clearVectorSource(vSrcRef) {
    const attempt = (retry = 0) => {
      const src = vSrcRef.value?.source;
      if (src) src.clear();
      else if (retry < 20) setTimeout(() => attempt(retry + 1), 100);
    };
    attempt();
  }

  // ── Heatmap fill (append per batch) ──────────────────────────────────────────
  function fillHeatmap(olFeatures) {
    if (!heatmapSource) return;
    const heatFeats = olFeatures.map(f => {
      const geom = f.getGeometry(); if (!geom) return null;
      const feat = new Feature({ geometry: new Point(geom.getCoordinates()) });
      feat.set("weight", 1); return feat;
    }).filter(Boolean);
    heatmapSource.addFeatures(heatFeats);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD OFFLINE — fetch GeoJSON dari path Vite dev server (bukan static import)
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadOffline(path, vSrcRef, stateKey) {
    const st = loadingState.value[stateKey];
    st.loading = true; st.error = ""; st.loaded = 0; st.source = "";
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojsonData = await res.json();
      const parser   = new OLGeoJSON();
      const features = parser.readFeatures(geojsonData, {
        dataProjection:    "EPSG:4326",
        featureProjection: "EPSG:4326",
      });
      st.loaded  = features.length;
      st.source  = "vector-offline";
      st.loading = false;
      injectFeatures(vSrcRef, features, stateKey);
      if (stateKey === "pasar") fillHeatmap(features);
      console.info(`[ArcGIS:${stateKey}] ✅ Offline — ${features.length} fitur`);
      return true;
    } catch (err) {
      console.warn(`[ArcGIS:${stateKey}] ⚠️ Offline gagal (${err.message}), fallback online`);
      st.loading = false;
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH ONLINE — pagination penuh\
  // ═══════════════════════════════════════════════════════════════════════════
  async function fetchOnline(baseQueryUrl, vSrcRef, stateKey) {
    const st        = loadingState.value[stateKey];
    const isSilent  = stateKey === "sekolah"; // suppress per-page log untuk sekolah
    st.loading = true; st.error = ""; st.loaded = 0; st.source = ""; st.page = 0;

    const parser        = new OLGeoJSON();
    const PAGE_SIZE     = 1000;
    let   offset        = 0;
    let   hasMore       = true;
    let   usePagination = true;
    let   totalFetched  = 0;
    let   isFirstBatch  = true;

    clearVectorSource(vSrcRef);
    if (stateKey === "pasar" && heatmapSource) heatmapSource.clear();

    while (hasMore) {
      const params = new URLSearchParams({
        where: "1=1", outFields: "*", f: "geojson", outSR: "4326",
      });
      if (usePagination) {
        params.set("resultOffset",      offset);
        params.set("resultRecordCount", PAGE_SIZE);
      }

      try {
        const res = await fetch(proxyUrl(`${baseQueryUrl}?${params.toString()}`));

        if (res.status === 503) {
          if (usePagination && offset > 0) { usePagination = false; offset = 0; continue; }
          st.error = "Server BNPB tidak tersedia (503)"; st.loading = false; return false;
        }
        if (!res.ok) {
          if (usePagination) { usePagination = false; offset = 0; continue; }
          st.error = `HTTP ${res.status}`; st.loading = false; return false;
        }

        const raw = await res.json();

        if (raw.error) {
          const code = raw.error.code ?? 0;
          const msg  = (raw.error.message || "").toLowerCase();
          if (usePagination && (code === 400 || msg.includes("pagination")
              || msg.includes("offset") || msg.includes("unable"))) {
            console.warn(`[ArcGIS:${stateKey}] Pagination tidak didukung (${code}), fallback`);
            usePagination = false; offset = 0; continue;
          }
          st.error = `Error ${code}: ${raw.error.message}`; st.loading = false; return false;
        }

        const gj    = arcgisToGeoJson(raw);
        const batch = parser.readFeatures(gj, {
          dataProjection:    "EPSG:4326",
          featureProjection: "EPSG:4326",
        });

        totalFetched += batch.length;
        st.loaded     = totalFetched;

        if (isFirstBatch) { injectFeatures(vSrcRef, batch, stateKey); isFirstBatch = false; }
        else              { appendFeatures(vSrcRef, batch); }

        if (stateKey === "pasar") fillHeatmap(batch);

        if (usePagination && raw.exceededTransferLimit) {
          offset += PAGE_SIZE;
          st.page++;
          // Hanya log untuk layer non-sekolah agar tidak spam
          if (!isSilent) {
            console.info(`[ArcGIS:${stateKey}] 📄 Halaman ${st.page} — ${totalFetched} fitur`);
          }
        } else {
          hasMore = false;
        }

      } catch (err) {
        if (err instanceof TypeError && usePagination) {
          usePagination = false; offset = 0; continue;
        }
        st.error   = err instanceof TypeError ? "Gagal terhubung ke proxy server" : `Gagal: ${err.message}`;
        st.loading = false;
        console.warn(`[ArcGIS:${stateKey}]`, err.message);
        return false;
      }
    }

    st.source  = "vector-online";
    st.loading = false;
    console.info(`[ArcGIS:${stateKey}] ✅ Online — ${totalFetched} fitur${st.page > 0 ? ` (${st.page} halaman)` : ""}`);
    return totalFetched > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD LAYER — Offline (fetch lokal) dulu → fallback online jika gagal
  // Tile layer sudah ditambahkan ke map di initHeatmapLayer().
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadLayer(stateKey, vSrcRef) {
    const offlinePath = OFFLINE_PATHS[stateKey];
    if (offlinePath) {
      const ok = await loadOffline(offlinePath, vSrcRef, stateKey);
      if (ok) return;
    }
    await fetchOnline(ARCGIS_URLS[stateKey], vSrcRef, stateKey);
  }

  // ── Public: load semua vector layer ──────────────────────────────────────────
  function fetchAll() {
    LAYER_KEYS.forEach(k => loadLayer(k, vectorSourceMap[k]));
  }

  // ── Public: force refresh dari online (skip cache lokal) ─────────────────────
  async function forceRefreshOnline(stateKey) {
    const vSrcRef = vectorSourceMap[stateKey];
    if (!vSrcRef) return;
    await fetchOnline(ARCGIS_URLS[stateKey], vSrcRef, stateKey);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════════
  function clusterStyle(f) {
    const sz = f.get("features").length;
    if (sz === 1)
      return new Style({
        image: new Circle({
          radius: 10,
          fill:   new Fill({ color: "#3498db" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
        }),
      });
    return new Style({
      image: new Circle({
        radius: 15 + Math.min(sz, 10) * 2,
        fill:   new Fill({ color: sz > 5 ? "#ff6b6b" : "#4ecdc4" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
      }),
      text: new Text({
        text: sz.toString(),
        fill: new Fill({ color: "#fff" }),
        font: "bold 14px sans-serif",
      }),
    });
  }

  function makeOverrideStyle(colorFn, fields) {
    return (feature, style) => {
      const cf    = feature.get("features"); const sz = cf.length;
      const color = colorFn(sz);
      const r     = Math.max(10, Math.min(sz * 0.6 + 10, 28));
      const sl    = (2 * Math.PI * r) / 6;
      const dash  = [0, sl, sl, sl, sl, sl, sl];
      const img   = style.getImage();
      img.getStroke().setLineDash(dash);
      img.getStroke().setColor(`rgba(${color},0.5)`);
      img.getFill().setColor(`rgba(${color},1)`);
      img.setRadius(r);
      const getName = x => { for (const k of fields) { const v = x.get(k); if (v) return v; } return ""; };
      if (sz === 1) {
        const nm = getName(cf[0]); const lbl = nm.length > 14 ? nm.slice(0, 13) + "…" : nm;
        style.getText().setText(lbl); style.getText().setOffsetY(-r - 8);
        style.getText().setFont("bold 10px sans-serif");
        style.getText().setBackgroundFill(new Fill({ color: "rgba(0,0,0,0.5)" }));
        style.getText().setPadding([2, 4, 2, 4]);
      } else {
        style.getText().setText(sz.toString()); style.getText().setOffsetY(0);
        style.getText().setFont("bold 13px sans-serif");
        style.getText().setBackgroundFill(null);
      }
      return style;
    };
  }

  const overridePasarStyle     = makeOverrideStyle(s => s>50?"192,0,0":s>20?"220,80,0":s>8?"200,150,0":s>3?"80,140,0":"0,110,60",     NAME_FIELDS.pasar);
  const overrideSekolahStyle   = makeOverrideStyle(s => s>50?"30,60,180":s>20?"50,100,220":s>8?"80,140,240":s>3?"120,180,255":"160,210,255", NAME_FIELDS.sekolah);
  const overrideTerminalStyle  = makeOverrideStyle(s => s>50?"100,0,150":s>20?"140,30,180":s>8?"170,70,210":s>3?"190,110,230":"210,160,245", NAME_FIELDS.terminal);
  const overrideWisataStyle    = makeOverrideStyle(s => s>50?"180,80,0":s>20?"210,120,0":s>8?"230,160,0":s>3?"240,190,30":"250,220,80",   NAME_FIELDS.wisata);
  const overrideStasiunStyle   = makeOverrideStyle(s => s>50?"0,80,60":s>20?"0,120,80":s>8?"0,160,110":s>3?"0,190,140":"60,210,170",    NAME_FIELDS.stasiun);
  const overrideBandaraStyle   = makeOverrideStyle(s => s>50?"0,60,120":s>20?"0,90,160":s>8?"20,120,200":s>3?"60,150,220":"100,180,240", NAME_FIELDS.bandara);
  const overridePelabuhanStyle = makeOverrideStyle(s => s>50?"80,50,0":s>20?"120,80,0":s>8?"160,110,20":s>3?"190,145,50":"220,180,90",  NAME_FIELDS.pelabuhan);

  // ── Cluster hover/select handlers ────────────────────────────────────────────
  function makeClusterHandler(fields, label) {
    return (ev, hoveredName, hoveredPos, popup) => {
      if (popup?.value) { hoveredName.value = ""; hoveredPos.value = null; return; }
      if (ev.selected.length === 1) {
        const f = ev.selected[0]; const cf = f.get("features");
        const getName = x => { for (const k of fields) { const v = x.get(k); if (v) return v; } return null; };
        if (cf?.length === 1) {
          hoveredPos.value  = cf[0].getGeometry().getCoordinates();
          hoveredName.value = getName(cf[0]) || label;
        } else if (cf?.length > 1) {
          hoveredPos.value  = f.getGeometry().getCoordinates();
          hoveredName.value = `${cf.length} ${label}`;
        }
      } else { hoveredName.value = ""; hoveredPos.value = null; }
    };
  }

  const _pasarHandler     = makeClusterHandler(NAME_FIELDS.pasar,     "Pasar");
  const _sekolahHandler   = makeClusterHandler(NAME_FIELDS.sekolah,   "Sekolah");
  const _terminalHandler  = makeClusterHandler(NAME_FIELDS.terminal,  "Terminal");
  const _wisataHandler    = makeClusterHandler(NAME_FIELDS.wisata,    "Wisata");
  const _stasiunHandler   = makeClusterHandler(NAME_FIELDS.stasiun,   "Stasiun");
  const _bandaraHandler   = makeClusterHandler(NAME_FIELDS.bandara,   "Bandara");
  const _pelabuhanHandler = makeClusterHandler(NAME_FIELDS.pelabuhan, "Pelabuhan");

  function bindCluster(handler, hoveredName, hoveredPos, popup) {
    return ev => handler(ev, hoveredName, hoveredPos, popup);
  }

  return {
    // ── VectorSource refs ──
    pasarVectorSource, sekolahVectorSource, terminalVectorSource,
    wisataVectorSource, stasiunVectorSource, bandaraVectorSource, pelabuhanVectorSource,

    // ── Tile layer control ──
    syncTileLayer,   // syncTileLayer(key, visible, opacity) — dipanggil dari App.vue watch

    // ── State ──
    loadingState, anyLoading, totalLoaded,
    NAME_FIELDS,

    // ── Init & load ──
    initHeatmapLayer,
    fetchAll,
    forceRefreshOnline,

    // ── Proxy helper ──
    proxyArcGISUrl: proxyUrl,
    ARCGIS_BASE,
    ARCGIS_URLS,

    // ── Styles ──
    clusterStyle,
    overridePasarStyle, overrideSekolahStyle, overrideTerminalStyle,
    overrideWisataStyle, overrideStasiunStyle, overrideBandaraStyle, overridePelabuhanStyle,

    // ── Handlers ──
    bindCluster,
    _pasarHandler, _sekolahHandler, _terminalHandler,
    _wisataHandler, _stasiunHandler, _bandaraHandler, _pelabuhanHandler,
  };
}