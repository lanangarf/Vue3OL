import { ref, computed, watch, nextTick } from "vue";
import { Style, Circle, Fill, Stroke, Text, Icon } from "ol/style";
import { GeoJSON as OLGeoJSON, KML as OLKML, GPX as OLGPX } from "ol/format";
import { getArea, getLength } from "ol/sphere";
import { fromCircle } from "ol/geom/Polygon";
import * as XLSX from "xlsx";

// ─── Config ──────────────────────────────────────────────────────────────────

const API = "http://localhost:3001/api";

// ─── Canvas icon renderer ─────────────────────────────────────────────────────
// Render Material Symbol ke canvas → data URL untuk ol/style Icon
const _iconCache = new Map();

export function makeIconDataUrl(iconName, color, size = 36) {
  const key = `${iconName}|${color}|${size}`;
  if (_iconCache.has(key)) return _iconCache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });

  // Lingkaran latar berwarna
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Border putih tipis
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Teks Material Symbol di tengah canvas
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(size * 0.56)}px \'Material Symbols Outlined\'`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(iconName, size / 2, size / 2 + 1);

  const url = canvas.toDataURL("image/png");
  _iconCache.set(key, url);
  return url;
}

export function clearIconCache() { _iconCache.clear(); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeFeatureStyle(color, label, iconName = null) {
  const textStyle = label
    ? new Text({
        text:    label.length > 18 ? label.slice(0, 17) + "…" : label,
        font:    "bold 11px sans-serif",
        offsetY: iconName ? -22 : -14,
        fill:    new Fill({ color: "#222" }),
        stroke:  new Stroke({ color: "#fff", width: 3 }),
      })
    : undefined;

  if (iconName) {
    const dataUrl = makeIconDataUrl(iconName, color, 36);
    return new Style({
      stroke: new Stroke({ color, width: 2.5 }),
      fill:   new Fill({ color: hexToRgba(color, 0.18) }),
      image:  new Icon({
        src:          dataUrl,
        scale:        1,
        anchor:       [0.5, 0.5],
        anchorXUnits: "fraction",
        anchorYUnits: "fraction",
      }),
      text: textStyle,
    });
  }

  return new Style({
    stroke: new Stroke({ color, width: 2.5 }),
    fill:   new Fill({ color: hexToRgba(color, 0.18) }),
    image:  new Circle({
      radius: 7,
      fill:   new Fill({ color }),
      stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
    text: textStyle,
  });
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c",
  "#3498db","#9b59b6","#34495e","#e91e63","#00bcd4",
];

export const TYPE_LABELS = {
  Point:      "Titik",
  LineString: "Garis",
  Polygon:    "Poligon",
  Circle:     "Lingkaran",
};

// ─── GeoJSON parser (singleton) ──────────────────────────────────────────────

const olParser  = new OLGeoJSON();
const kmlParser = new OLKML();
const gpxParser = new OLGPX();

// ─── Composable ──────────────────────────────────────────────────────────────

export function useDrawLayers() {
  let colorIdx      = 0;
  let featureCounter = 0;        // hanya dipakai untuk ID sementara sebelum DB reply

  const nextColor = () => COLOR_PALETTE[colorIdx++ % COLOR_PALETTE.length];

  // ── State ──────────────────────────────────────────────────────────────────

  const drawLayers    = ref([]);             // diisi dari DB lewat loadLayersFromDB()
  const activeLayerId = ref(null);
  const sourceRefs    = ref({});
  const popup         = ref(null);
  const popupPos      = ref(null);
  const layerMenu     = ref(null);
  const dbLoading     = ref(false);          // indikator loading awal dari DB
  const dbError       = ref(null);           // pesan error jika DB gagal

  // ── Draw-tool state ────────────────────────────────────────────────────────

  const activeTool   = ref(null);
  const drawEnable   = computed(() => ["Point","LineString","Polygon","Circle"].includes(activeTool.value));
  const drawType     = computed(() => drawEnable.value ? activeTool.value : "Point");
  const modifyEnable = computed(() => activeTool.value === "modify");
  const deleteMode   = computed(() => activeTool.value === "delete");

  // ── Helpers internal ───────────────────────────────────────────────────────

  /**
   * Rekonstruksi olFeature dari objek GeoJSON geometry yang datang dari DB.
   * ST_AsGeoJSON di server sudah menghasilkan { type, coordinates }.
   */
  function buildOlFeature(dbFeature) {
    try {
      // server rowToFeature mengirim field "geojson" (hasil ST_AsGeoJSON yang di-parse)
      const geomJson = dbFeature.geojson ?? dbFeature.geometry;
      if (!geomJson) { console.warn("buildOlFeature: no geometry for", dbFeature.id); return null; }
      // Skip GeometryCollection kosong (hasil Circle yang gagal dikonversi)
      if (geomJson.type === "GeometryCollection" && (!geomJson.geometries || geomJson.geometries.length === 0)) {
        console.warn("buildOlFeature: empty GeometryCollection for id", dbFeature.id, "— feature ini perlu digambar ulang");
        return null;
      }
      const olFeature = olParser.readFeature(
        { type: "Feature", geometry: geomJson, properties: {} },
        { dataProjection: "EPSG:4326", featureProjection: "EPSG:4326" }
      );
      olFeature.setId(dbFeature.id);
      // Store per-feature style data as OL properties so style-function can read them
      olFeature.set("_color", dbFeature.color);
      olFeature.set("_name",  dbFeature.name);
      olFeature.set("_icon",  dbFeature.icon ?? null);
      olFeature.setStyle(makeFeatureStyle(dbFeature.color, dbFeature.name, dbFeature.icon ?? null));
      return olFeature;
    } catch (err) {
      console.warn("buildOlFeature gagal untuk id", dbFeature.id, err.message);
      return null;
    }
  }

  /**
   * Normalisasi satu baris layer dari DB menjadi objek layer Vue-reactive.
   */
  function normalizeLayer(row) {
    return {
      id:       row.id,
      name:     row.name,
      visible:  row.visible  ?? true,
      expanded: true,
      opacity:  row.opacity  ?? 1,
      color:    row.color    ?? "#3498db",
      icon:     row.icon     ?? null,
      editing:  false,
      features: (row.features ?? []).flatMap(f => {
        const olFeature = buildOlFeature(f);
        if (!olFeature) return [];
        return [{
          id:         f.id,
          name:       f.name,
          desc:       f.desc ?? f.description ?? "",
          type:       f.geom_type,
          color:      f.color,
          icon:       f.icon ?? null,
          properties: f.properties || {},   // atribut JSONB
          olFeature,
        }];
      }),
    };
  }

  // ── DB: Load semua layer + features ───────────────────────────────────────

  async function loadLayersFromDB() {
    dbLoading.value = true;
    dbError.value   = null;
    try {
      const res = await fetch(`${API}/layers`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      drawLayers.value = data.map(normalizeLayer);

      // Setelah load, set activeLayer ke layer pertama (terbaru)
      if (drawLayers.value.length > 0) {
        activeLayerId.value = drawLayers.value[0].id;
        // Inject features ke ol-source setelah Vue render layer-layer baru
        await injectAllFeaturesAfterLoad();
      } else {
        // Jika DB kosong, buat satu layer default otomatis
        await addDrawLayer();
      }
    } catch (err) {
      dbError.value = err.message;
      console.error("[useDrawLayers] Gagal load dari DB:", err);

      // Fallback: buat layer lokal agar peta tetap bisa dipakai
      drawLayers.value = [{
        id: 1, name: "Lapisan tanpa judul", visible: true,
        expanded: true, opacity: 1, color: "#3498db", features: [], editing: false,
      }];
      activeLayerId.value = 1;
    } finally {
      dbLoading.value = false;
    }
  }

  // ── sourceRefs helper ─────────────────────────────────────────────────────

  // Set untuk mencatat layer yang sudah di-inject — cegah infinite loop
  const injectedLayers = new Set();

  function injectFeaturesToSource(layerId) {
    if (injectedLayers.has(layerId)) return;
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer || !layer.features.length) return;
    const src = sourceRefs.value[layerId]?.source;
    if (!src) return;
    injectedLayers.add(layerId);
    layer.features.forEach(f => {
      if (f.olFeature && !src.getFeatureById(f.id)) {
        src.addFeature(f.olFeature);
      }
    });
  }

  async function injectAllFeaturesAfterLoad() {
    // Reset guard supaya inject bisa jalan ulang setelah reload DB
    injectedLayers.clear();
    await nextTick();
    await new Promise(r => setTimeout(r, 200));
    for (const layer of drawLayers.value) {
      injectFeaturesToSource(layer.id);
    }
  }

  function setSourceRef(layerId, el) {
    if (!el) return;
    const isFirstMount = !sourceRefs.value[layerId];
    sourceRefs.value[layerId] = el;
    // Hanya inject saat pertama kali mount, bukan tiap re-render
    if (isFirstMount) {
      injectFeaturesToSource(layerId);
    }
  }

  // ── Layer CRUD ────────────────────────────────────────────────────────────

  async function addDrawLayer() {
    const color = nextColor();
    try {
      const res = await fetch(`${API}/layers`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: "Lapisan tanpa judul", color, opacity: 1, visible: true }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const row = await res.json();
      const newLayer = normalizeLayer({ ...row, features: [] });
      drawLayers.value.unshift(newLayer);
      activeLayerId.value = newLayer.id;
    } catch (err) {
      console.error("[useDrawLayers] Gagal tambah layer:", err);
    }
  }

  async function deleteDrawLayer(id) {
    const idx = drawLayers.value.findIndex(l => l.id === id);
    if (idx === -1) return;
    try {
      await fetch(`${API}/layers/${id}`, { method: "DELETE" });
      drawLayers.value.splice(idx, 1);
      if (activeLayerId.value === id) {
        activeLayerId.value = drawLayers.value[0]?.id ?? null;
      }
    } catch (err) {
      console.error("[useDrawLayers] Gagal hapus layer:", err);
    }
    closeLayerMenu();
  }

  async function finishRename(layer) {
    layer.editing = false;
    if (!layer.name.trim()) layer.name = "Lapisan tanpa judul";
    try {
      await fetch(`${API}/layers/${layer.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    layer.name,
          color:   layer.color,
          opacity: layer.opacity,
          visible: layer.visible,
          icon:    layer.icon ?? null,
        }),
      });
    } catch (err) {
      console.error("[useDrawLayers] Gagal rename layer:", err);
    }
  }

  // ── Update layer style (color + icon) ke DB ───────────────────────────────
  async function updateLayerStyle(layerId, { color, icon }) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer) return;
    if (color !== undefined) layer.color = color;
    if (icon  !== undefined) layer.icon  = icon;

    // Re-render style setiap fitur di layer (mass update)
    for (const feat of layer.features) {
      if (feat.olFeature) {
        feat.olFeature.set("_color", layer.color);
        feat.olFeature.set("_icon",  layer.icon ?? null);
        feat.olFeature.setStyle(makeFeatureStyle(feat.color || layer.color, feat.name, layer.icon ?? null));
      }
    }

    try {
      await fetch(`${API}/layers/${layerId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    layer.name,
          color:   layer.color,
          opacity: layer.opacity,
          visible: layer.visible,
          icon:    layer.icon ?? null,
        }),
      });
    } catch (err) {
      console.error("[useDrawLayers] Gagal update layer style:", err);
    }
  }

  // ── Draw end ──────────────────────────────────────────────────────────────

  async function onDrawEnd(event, layerId) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer) return;

    const olFeature = event.feature;
    const type      = olFeature.getGeometry().getType();
    const tempId    = --featureCounter;                 // ID negatif sementara
    const name      = `${TYPE_LABELS[type] || "Objek"} ${Math.abs(tempId)}`;

    // Tampilkan dulu ke peta dengan ID sementara
    olFeature.setId(tempId);
    olFeature.set("_color", layer.color);
    olFeature.set("_name",  name);
    olFeature.set("_icon",  layer.icon ?? null);
    olFeature.setStyle(makeFeatureStyle(layer.color, name, layer.icon ?? null));

    const tempFeat = { id: tempId, name, desc: "", type, color: layer.color, icon: layer.icon ?? null, olFeature };
    layer.features.push(tempFeat);

    // Ambil geometry sebagai GeoJSON untuk dikirim ke DB
    // Circle bukan tipe GeoJSON valid — konversi ke Polygon dulu
    let geomForDB = olFeature.getGeometry();
    if (geomForDB.getType() === "Circle") {
      geomForDB = fromCircle(geomForDB, 64); // 64 titik = lingkaran halus
    }
    const geojsonGeom = JSON.parse(
      olParser.writeGeometry(geomForDB, {
        dataProjection:    "EPSG:4326",
        featureProjection: "EPSG:4326",
      })
    );

    try {
      const res = await fetch(`${API}/features`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          layer_id: layerId,
          name,
          description: "",
          color:    layer.color,
          geojson:  geojsonGeom,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const saved = await res.json();

      // Ganti ID sementara dengan ID dari DB
      tempFeat.id = saved.id;
      olFeature.setId(saved.id);
    } catch (err) {
      console.error("[useDrawLayers] Gagal simpan feature ke DB:", err);
      // Feature tetap tampil di peta meski DB gagal (offline fallback)
    }

    setTimeout(() => openPopup(layer, layer.features[layer.features.length - 1]), 80);
  }

  // ── Measure ───────────────────────────────────────────────────────────────

  function getMeasure(olFeature) {
    try {
      const geom = olFeature?.getGeometry();
      if (!geom) return "";
      const t = geom.getType();
      if (t === "Point") {
        const c = geom.getCoordinates();
        return `${c[0].toFixed(5)}, ${c[1].toFixed(5)}`;
      }
      if (t === "LineString") {
        const m = getLength(geom, { projection: "EPSG:4326" });
        return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
      }
      if (t === "Polygon" || t === "Circle") {
        const a = getArea(geom, { projection: "EPSG:4326" });
        return a >= 1e6 ? `${(a / 1e6).toFixed(2)} km²` : `${a.toFixed(0)} m²`;
      }
      return "";
    } catch { return ""; }
  }

  // ── Popup ─────────────────────────────────────────────────────────────────

  function openPopup(layer, feat) {
    popup.value    = {
      layerId:    layer.id,
      featureId:  feat.id,
      name:       feat.name,
      desc:       feat.desc,
      color:      feat.color,
      icon:       feat.icon ?? null,
      measure:    getMeasure(feat.olFeature),
      properties: feat.properties || {},  // atribut JSONB
    };
    popupPos.value = null;
  }

  function closePopup() {
    popup.value    = null;
    popupPos.value = null;
  }

  async function savePopup() {
    const layer = drawLayers.value.find(l => l.id === popup.value.layerId);
    const feat  = layer?.features.find(f => f.id === popup.value.featureId);
    if (feat) {
      feat.name  = popup.value.name;
      feat.desc  = popup.value.desc;
      feat.color = popup.value.color;
      feat.icon  = popup.value.icon ?? null;
      feat.olFeature.set("_color", feat.color);
      feat.olFeature.set("_name",  feat.name);
      feat.olFeature.set("_icon",  feat.icon);
      feat.olFeature.setStyle(makeFeatureStyle(feat.color, feat.name, feat.icon ?? null));

      // Simpan ke DB (hanya jika ID positif = sudah tersimpan di DB)
      if (feat.id > 0) {
        try {
          await fetch(`${API}/features/${feat.id}`, {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              name:        feat.name,
              description: feat.desc,
              color:       feat.color,
              icon:        feat.icon,
            }),
          });
        } catch (err) {
          console.error("[useDrawLayers] Gagal update feature:", err);
        }
      }
    }
    closePopup();
  }

  // ── Feature CRUD ──────────────────────────────────────────────────────────

  async function deleteFeature(layerId, featId) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer) return;
    const idx = layer.features.findIndex(f => f.id === featId);
    if (idx === -1) return;

    // Hapus dari ol-source dulu (langsung terasa di peta)
    const src = sourceRefs.value[layerId]?.source;
    if (src) src.removeFeature(layer.features[idx].olFeature);
    layer.features.splice(idx, 1);
    if (popup.value?.featureId === featId) closePopup();

    // Hapus dari DB (hanya jika ID positif)
    if (featId > 0) {
      try {
        await fetch(`${API}/features/${featId}`, { method: "DELETE" });
      } catch (err) {
        console.error("[useDrawLayers] Gagal hapus feature:", err);
      }
    }
  }

  function zoomToFeature(feat, centerRef, zoomRef) {
    const ext       = feat.olFeature.getGeometry().getExtent();
    centerRef.value = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
    zoomRef.value   = 14;
  }

  // ── Map click ─────────────────────────────────────────────────────────────

  function onMapClick(event, { dati1Visible, dati1SourceRef, openAIChat }) {
    if (!drawEnable.value && dati1Visible.value && dati1SourceRef.value?.source) {
      const hits = dati1SourceRef.value.source.getFeaturesAtCoordinate(event.coordinate);
      if (hits.length > 0) {
        const f    = hits[0];
        const name = f.get("state") || f.get("name") || f.get("NAME_1") || f.get("provinsi") || "Provinsi";
        const coord = event.coordinate;
        openAIChat(name, `Koordinat klik: ${coord[0].toFixed(4)}°BT, ${coord[1].toFixed(4)}°LS`);
        return;
      }
    }
    if (drawEnable.value) return;

    for (const layer of drawLayers.value) {
      const src = sourceRefs.value[layer.id]?.source;
      if (!src) continue;
      const hit = src.getFeaturesAtCoordinate(event.coordinate);
      if (hit.length > 0) {
        const feat = layer.features.find(f => f.id === hit[0].getId());
        if (!feat) continue;
        if (deleteMode.value) deleteFeature(layer.id, feat.id);
        else { activeLayerId.value = layer.id; openPopup(layer, feat); }
        return;
      }
    }
    closePopup();
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  function openLayerMenu(e, layerId) {
    e.stopPropagation();
    layerMenu.value = { layerId, x: e.clientX, y: e.clientY };
  }

  function closeLayerMenu() { layerMenu.value = null; }

  // ── Export / Import GeoJSON ───────────────────────────────────────────────

  function exportGeoJSON(layerId) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer || !layer.features.length) return;
    const features = layer.features.map(f => {
      const gj = JSON.parse(olParser.writeFeature(f.olFeature, {
        dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
      }));
      gj.properties = { ...(gj.properties || {}), _name: f.name, _desc: f.desc, _color: f.color };
      return gj;
    });
    const blob = new Blob(
      [JSON.stringify({ type: "FeatureCollection", name: layer.name, features }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href  = URL.createObjectURL(blob);
    a.download = `${layer.name}.geojson`;
    a.click();
    closeLayerMenu();
  }

  // ─── Import state ───────────────────────────────────────────────────────
  const importLoading  = ref(false);
  const importProgress = ref(0);
  const importError    = ref(null);

  function triggerImport(layerId) {
    document.getElementById(`import-${layerId}`)?.click();
    closeLayerMenu();
  }

  // ─── WKT → GeoJSON geometry (minimal parser untuk Point/LineString/Polygon) ──
  function wktToGeoJSON(wkt) {
    wkt = wkt.trim();
    const up = wkt.toUpperCase();

    function parseCoordPairs(str) {
      return str.trim().split(/,\s*/).map(pair => {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        return [x, y];
      });
    }

    if (up.startsWith("POINT")) {
      const m = wkt.match(/POINT\s*\(\s*([^)]+)\)/i);
      if (!m) return null;
      const [x, y] = m[1].trim().split(/\s+/).map(Number);
      return { type: "Point", coordinates: [x, y] };
    }
    if (up.startsWith("LINESTRING")) {
      const m = wkt.match(/LINESTRING\s*\(\s*([^)]+)\)/i);
      if (!m) return null;
      return { type: "LineString", coordinates: parseCoordPairs(m[1]) };
    }
    if (up.startsWith("POLYGON")) {
      // Ambil semua ring dalam tanda kurung ganda
      const rings = [];
      const ringRe = /\(([^()]+)\)/g;
      let rm;
      while ((rm = ringRe.exec(wkt)) !== null) {
        rings.push(parseCoordPairs(rm[1]));
      }
      if (!rings.length) return null;
      return { type: "Polygon", coordinates: rings };
    }
    if (up.startsWith("MULTIPOINT") || up.startsWith("MULTILINESTRING") || up.startsWith("MULTIPOLYGON")) {
      // Untuk multi-geometri: konversi lewat ol/format WKT
      try {
        const { WKT: OLWKT } = require("ol/format");
        const wktFmt = new OLWKT();
        const feat   = wktFmt.readFeature(wkt, {
          dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
        });
        return JSON.parse(olParser.writeGeometry(feat.getGeometry(), {
          dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
        }));
      } catch { return null; }
    }
    return null;
  }

  // importBulkPayload — terima payload langsung (dari ImportPreviewModal)
  // tanpa perlu baca file lagi
  async function importBulkPayload(layerId, features) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer || !features.length) return;

    importLoading.value  = true;
    importProgress.value = 30;
    importError.value    = null;

    try {
      const res = await fetch(`${API}/features/bulk`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ layer_id: layerId, features }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error: ${res.status}`);
      }

      importProgress.value = 80;
      const saved = await res.json();

      const src = sourceRefs.value[layerId]?.source;
      for (const dbFeat of saved) {
        const olFeat = buildOlFeature(dbFeat);
        if (!olFeat) continue;
        if (src && !src.getFeatureById(dbFeat.id)) src.addFeature(olFeat);
        layer.features.push({
          id:        dbFeat.id,
          name:      dbFeat.name,
          desc:      dbFeat.desc || "",
          type:      dbFeat.type,
          color:      dbFeat.color,
          properties: dbFeat.properties || {},
          olFeature:  olFeat,
        });
      }

      importProgress.value = 100;
      setTimeout(() => { importLoading.value = false; importProgress.value = 0; }, 800);

    } catch (err) {
      importError.value   = err.message;
      importLoading.value = false;
      console.error("[useDrawLayers] importBulkPayload error:", err);
    }
  }

  // importFile — baca XLSX/XLS/CSV/GPX/KML/GeoJSON → bulk POST
  async function importFile(event, layerId) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = "";

    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer) return;

    importLoading.value  = true;
    importProgress.value = 0;
    importError.value    = null;

    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let payload = [];   // array of { name, description, color, geojson }

      // ── 1. Excel (xlsx/xls) ────────────────────────────────────────────
      if (["xlsx", "xls"].includes(ext)) {
        const buffer = await file.arrayBuffer();
        const wb     = XLSX.read(buffer, { type: "array" });
        const ws     = wb.Sheets[wb.SheetNames[0]];
        const rows   = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!rows.length) throw new Error("File kosong atau format tidak dikenali.");

        const headers = Object.keys(rows[0]);
        const latKey  = headers.find(h => /lat|latitude|lintang/i.test(h));
        const lngKey  = headers.find(h => /lng|long|longitude|bujur/i.test(h));
        if (!latKey || !lngKey)
          throw new Error(
            `Kolom koordinat tidak ditemukan.\nKolom tersedia: ${headers.join(", ")}\n` +
            `Kolom yang dicari: lat/latitude/lintang dan lng/long/longitude/bujur`
          );

        const nameKey = headers.find(h => /^name$|^nama$/i.test(h)) || null;
        const descKey = headers.find(h => /^desc|^keterangan|^deskripsi/i.test(h)) || null;

        rows.forEach((row, i) => {
          const lat = parseFloat(row[latKey]);
          const lng = parseFloat(row[lngKey]);
          if (isNaN(lat) || isNaN(lng)) return;
          payload.push({
            name:        (nameKey ? String(row[nameKey]) : "") || `Titik ${i + 1}`,
            description: descKey ? String(row[descKey]) : "",
            color:       layer.color,
            geojson:     { type: "Point", coordinates: [lng, lat] },
          });
        });

        if (!payload.length) throw new Error("Tidak ada baris dengan koordinat valid.");
      }

      // ── 2. CSV berformat WKT (Google My Maps style) ────────────────────
      else if (ext === "csv") {
        const text  = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) throw new Error("File CSV kosong.");

        // Deteksi separator (koma atau titik koma)
        const sep     = lines[0].includes(";") ? ";" : ",";

        // Parse header — handle quoted fields
        function parseCsvLine(line) {
          const result = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; continue; }
            if (c === sep && !inQ) { result.push(cur.trim()); cur = ""; continue; }
            cur += c;
          }
          result.push(cur.trim());
          return result;
        }

        const headers  = parseCsvLine(lines[0]).map(h => h.toLowerCase());
        const wktIdx   = headers.findIndex(h => h === "wkt");
        const nameIdx  = headers.findIndex(h => h === "nama" || h === "name");
        const descIdx  = headers.findIndex(h => h === "deskripsi" || h === "description" || h === "desc");

        // Jika ada kolom WKT → parse sebagai WKT (Google My Maps style)
        if (wktIdx !== -1) {
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            const wkt  = cols[wktIdx] || "";
            if (!wkt) continue;
            try {
              const geojson = wktToGeoJSON(wkt);
              if (!geojson) continue;
              payload.push({
                name:        (nameIdx !== -1 ? cols[nameIdx] : "") || `Objek ${i}`,
                description: descIdx !== -1 ? cols[descIdx] : "",
                color:       layer.color,
                geojson,
              });
            } catch { continue; }
          }
          if (!payload.length) throw new Error("Tidak ada geometri WKT valid di file.");
        } else {
          // Fallback: CSV dengan kolom lat/lng biasa
          const latKey = headers.find(h => /lat|latitude|lintang/.test(h));
          const lngKey = headers.find(h => /lng|long|longitude|bujur/.test(h));
          if (!latKey || !lngKey)
            throw new Error(`Kolom tidak ditemukan. Header: ${headers.join(", ")}`);
          const latIdx2 = headers.indexOf(latKey);
          const lngIdx2 = headers.indexOf(lngKey);
          const nIdx2   = headers.findIndex(h => /^name$|^nama$/.test(h));
          const dIdx2   = headers.findIndex(h => /^desc|^keterangan|^deskripsi/.test(h));
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            const lat  = parseFloat(cols[latIdx2]);
            const lng  = parseFloat(cols[lngIdx2]);
            if (isNaN(lat) || isNaN(lng)) continue;
            payload.push({
              name:        (nIdx2 !== -1 ? cols[nIdx2] : "") || `Titik ${i}`,
              description: dIdx2 !== -1 ? cols[dIdx2] : "",
              color:       layer.color,
              geojson:     { type: "Point", coordinates: [lng, lat] },
            });
          }
          if (!payload.length) throw new Error("Tidak ada baris dengan koordinat valid.");
        }
      }

      // ── 3. GPX ─────────────────────────────────────────────────────────
      // Menggunakan ol/format/GPX (OL core) — menggantikan custom DOMParser.
      // Mendukung waypoint (wpt → Point), track (trk → LineString),
      // dan route (rte → LineString) secara otomatis.
      else if (ext === "gpx") {
        const text       = await file.text();
        const olFeatures = gpxParser.readFeatures(text, {
          dataProjection:    "EPSG:4326",
          featureProjection: "EPSG:4326",
        });
        if (!olFeatures.length) throw new Error("Tidak ada fitur di file GPX.");
        olFeatures.forEach((olFeat, i) => {
          const geom = olFeat.getGeometry();
          if (!geom) return;
          payload.push({
            name:        olFeat.get("name") || `GPX ${i + 1}`,
            description: olFeat.get("desc") || "",
            color:       layer.color,
            geojson:     JSON.parse(olParser.writeGeometry(geom, {
              dataProjection:    "EPSG:4326",
              featureProjection: "EPSG:4326",
            })),
          });
        });
        if (!payload.length) throw new Error("Tidak ada fitur (wpt/trk/rte) di file GPX.");
      }

      // ── 4. KML ─────────────────────────────────────────────────────────
      else if (ext === "kml") {
        const text       = await file.text();
        const olFeatures = kmlParser.readFeatures(text, {
          dataProjection:    "EPSG:4326",
          featureProjection: "EPSG:4326",
        });
        olFeatures.forEach((olFeat, i) => {
          const geom = olFeat.getGeometry();
          if (!geom) return;
          payload.push({
            name:        olFeat.get("name") || `KML ${i + 1}`,
            description: olFeat.get("description") || "",
            color:       layer.color,
            geojson:     JSON.parse(olParser.writeGeometry(geom, {
              dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
            })),
          });
        });
      }

      // ── 5. GeoJSON ─────────────────────────────────────────────────────
      else if (ext === "geojson" || ext === "json") {
        const text       = await file.text();
        const gjfc       = JSON.parse(text);
        const olFeatures = olParser.readFeatures(gjfc, {
          dataProjection:    "EPSG:4326",
          featureProjection: "EPSG:4326",
        });
        olFeatures.forEach((olFeat, i) => {
          const geom = olFeat.getGeometry();
          if (!geom) return;
          payload.push({
            name:        olFeat.get("_name") || olFeat.get("name") || `Objek ${i + 1}`,
            description: olFeat.get("_desc") || olFeat.get("description") || "",
            color:       olFeat.get("_color") || layer.color,
            geojson:     JSON.parse(olParser.writeGeometry(geom, {
              dataProjection: "EPSG:4326", featureProjection: "EPSG:4326",
            })),
          });
        });
      }

      else {
        throw new Error(`Format .${ext} tidak didukung. Gunakan xlsx, xls, csv, kml, atau geojson.`);
      }

      if (!payload.length) throw new Error("Tidak ada fitur yang berhasil dibaca.");

      // ── 4. Kirim bulk ke server ─────────────────────────────────────────
      importProgress.value = 30;
      const res = await fetch(`${API}/features/bulk`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ layer_id: layerId, features: payload }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error: ${res.status}`);
      }

      importProgress.value = 80;
      const saved = await res.json();

      // ── 5. Tambahkan ke state & ol-source ──────────────────────────────
      const src = sourceRefs.value[layerId]?.source;
      for (const dbFeat of saved) {
        const olFeat = buildOlFeature(dbFeat);
        if (!olFeat) continue;
        if (src && !src.getFeatureById(dbFeat.id)) src.addFeature(olFeat);
        layer.features.push({
          id:        dbFeat.id,
          name:      dbFeat.name,
          desc:      dbFeat.desc || "",
          type:      dbFeat.type,
          color:      dbFeat.color,
          properties: dbFeat.properties || {},
          olFeature:  olFeat,
        });
      }

      importProgress.value = 100;
      setTimeout(() => { importLoading.value = false; importProgress.value = 0; }, 800);

    } catch (err) {
      importError.value   = err.message;
      importLoading.value = false;
      console.error("[useDrawLayers] importFile error:", err);
    }
  }

  // exportLayerToCSV — unduh fitur layer sebagai CSV berformat WKT (kompatibel Google My Maps)
  function exportLayerToCSV(layerId) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer || !layer.features.length) {
      alert("Lapisan tidak memiliki fitur untuk diekspor.");
      return;
    }

    // Fungsi konversi GeoJSON geometry → WKT
    function geomToWKT(geom) {
      if (!geom) return "";
      const type = geom.getType();

      function coordToStr(c) { return `${c[0]} ${c[1]}`; }
      function ringToStr(coords) { return coords.map(coordToStr).join(", "); }

      if (type === "Point") {
        const c = geom.getCoordinates();
        return `POINT (${coordToStr(c)})`;
      }
      if (type === "LineString") {
        return `LINESTRING (${ringToStr(geom.getCoordinates())})`;
      }
      if (type === "Polygon") {
        const rings = geom.getCoordinates().map(r => `(${ringToStr(r)})`).join(", ");
        return `POLYGON (${rings})`;
      }
      if (type === "Circle") {
        // Circle tidak ada di WKT standar, konversi ke Polygon dulu
        const poly = fromCircle(geom, 64);
        const rings = poly.getCoordinates().map(r => `(${ringToStr(r)})`).join(", ");
        return `POLYGON (${rings})`;
      }
      // Fallback: tulis geometri via ol parser lalu ambil koordinat
      return "";
    }

    // Build CSV rows
    const csvLines = [`WKT,nama,deskripsi`];
    for (const feat of layer.features) {
      const geom = feat.olFeature?.getGeometry();
      const wkt  = geomToWKT(geom);
      if (!wkt) continue;

      // Escape field yang mengandung koma atau quote
      function escField(v) {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      }

      csvLines.push(`"${wkt}",${escField(feat.name)},${escField(feat.desc || "")}`);
    }

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `${layer.name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    closeLayerMenu();
  }

  // exportLayerToXLS — unduh fitur layer sebagai .xlsx
  // Kolom: nama, deskripsi, tipe, warna, ukuran/koordinat, lon, lat,
  //        lalu semua kolom properties (JSONB) yang ditemukan di layer
  function exportLayerToXLS(layerId) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer || !layer.features.length) {
      alert("Lapisan tidak memiliki fitur untuk diekspor.");
      return;
    }

    // Kumpulkan semua key dari properties seluruh fitur di layer ini
    const propKeysSet = new Set();
    for (const feat of layer.features) {
      if (feat.properties && typeof feat.properties === "object") {
        Object.keys(feat.properties).forEach(k => propKeysSet.add(k));
      }
    }
    const propKeys = [...propKeysSet];

    // Helper: ambil koordinat representatif (centroid kasar) dari geometry
    function getRepresentativeCoord(geom) {
      if (!geom) return { lon: "", lat: "" };
      const type = geom.getType();
      try {
        if (type === "Point") {
          const [lon, lat] = geom.getCoordinates();
          return { lon: +lon.toFixed(6), lat: +lat.toFixed(6) };
        }
        if (type === "LineString") {
          const coords = geom.getCoordinates();
          const mid = coords[Math.floor(coords.length / 2)];
          return { lon: +mid[0].toFixed(6), lat: +mid[1].toFixed(6) };
        }
        if (type === "Polygon" || type === "Circle") {
          const ext = geom.getExtent();
          return {
            lon: +(((ext[0] + ext[2]) / 2).toFixed(6)),
            lat: +(((ext[1] + ext[3]) / 2).toFixed(6)),
          };
        }
      } catch { /* ignore */ }
      return { lon: "", lat: "" };
    }

    // Header baris pertama
    const header = ["nama", "deskripsi", "tipe", "warna", "ukuran", "longitude", "latitude", ...propKeys];

    // Baris data
    const rows = layer.features.map(feat => {
      const geom    = feat.olFeature?.getGeometry();
      const ukuran  = getMeasure(feat.olFeature) || "";
      const { lon, lat } = getRepresentativeCoord(geom);
      const row = [
        feat.name       || "",
        feat.desc       || "",
        TYPE_LABELS[feat.type] || feat.type || "",
        feat.color      || "",
        ukuran,
        lon,
        lat,
      ];
      for (const key of propKeys) {
        const val = feat.properties?.[key];
        row.push(val !== undefined && val !== null ? val : "");
      }
      return row;
    });

    // Buat workbook dengan sheet-data sebagai array-of-arrays
    const sheetData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Lebar kolom otomatis berdasarkan konten terpanjang per kolom
    const colWidths = header.map((h, ci) => {
      const maxLen = Math.max(
        String(h).length,
        ...rows.map(r => String(r[ci] ?? "").length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });
    ws["!cols"] = colWidths;

    // Nama sheet: maks 31 karakter (batas Excel), strip karakter ilegal
    const sheetName = layer.name.replace(/[\\/*?[\]:]/g, "_").slice(0, 31) || "Lapisan";

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${layer.name}.xlsx`);
    closeLayerMenu();
  }

  // ── bulkUpdateFeaturesFromEditor ──────────────────────────────────────────
  // Dipanggil dari LayerDataEditor setelah user klik "Simpan Perubahan".
  // updates = [{ id, _new, _deleted, name, description, geojson, properties }]
  async function bulkUpdateFeaturesFromEditor(layerId, updates) {
    const layer = drawLayers.value.find(l => l.id === layerId);
    if (!layer) throw new Error("Layer tidak ditemukan");

    const src = sourceRefs.value[layerId]?.source;

    for (const upd of updates) {
      // ── Hapus fitur ──────────────────────────────────────────────────────
      if (upd._deleted && !upd._new) {
        const idx = layer.features.findIndex(f => f.id === upd.id);
        if (idx !== -1) {
          if (src) src.removeFeature(layer.features[idx].olFeature);
          layer.features.splice(idx, 1);
        }
        if (upd.id > 0) {
          await fetch(`${API}/features/${upd.id}`, { method: "DELETE" }).catch(console.error);
        }
        continue;
      }

      // ── Fitur baru ───────────────────────────────────────────────────────
      if (upd._new && !upd._deleted) {
        if (!upd.geojson) continue; // belum ada koordinat, skip
        try {
          const res = await fetch(`${API}/features`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              layer_id:    layerId,
              name:        upd.name        || "Objek",
              description: upd.description || "",
              color:       layer.color,
              geojson:     upd.geojson,
              properties:  upd.properties  || {},
            }),
          });
          if (!res.ok) throw new Error(`Server error: ${res.status}`);
          const saved = await res.json();
          const olFeat = buildOlFeature(saved);
          if (olFeat) {
            if (src) src.addFeature(olFeat);
            layer.features.push({
              id:         saved.id,
              name:       saved.name,
              desc:       saved.desc || "",
              type:       saved.type,
              color:      saved.color,
              geojson:    saved.geojson,
              properties: saved.properties || {},
              olFeature:  olFeat,
            });
          }
        } catch (err) {
          console.error("[useDrawLayers] Gagal tambah fitur baru:", err);
        }
        continue;
      }

      // ── Update fitur yang sudah ada ──────────────────────────────────────
      if (!upd._deleted) {
        const feat = layer.features.find(f => f.id === upd.id);
        if (!feat) continue;

        // Update data lokal
        feat.name       = upd.name        || feat.name;
        feat.desc       = upd.description ?? feat.desc;
        feat.properties = upd.properties  || feat.properties;

        // Update geometri jika Point berubah
        if (upd.geojson && feat.type === "Point") {
          feat.geojson = upd.geojson;
          // Update OL feature di peta
          if (feat.olFeature && upd.geojson.type === "Point") {
            const [lng, lat] = upd.geojson.coordinates;
            feat.olFeature.getGeometry().setCoordinates([lng, lat]);
          }
        }

        feat.olFeature?.setStyle(makeFeatureStyle(feat.color, feat.name, feat.icon ?? null));

        // Simpan ke DB
        if (upd.id > 0) {
          try {
            await fetch(`${API}/features/${upd.id}`, {
              method:  "PUT",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                name:        feat.name,
                description: feat.desc,
                color:       feat.color,
                geojson:     upd.geojson && feat.type === "Point" ? upd.geojson : undefined,
                properties:  feat.properties,
              }),
            });
          } catch (err) {
            console.error("[useDrawLayers] Gagal update fitur:", err);
          }
        }
      }
    }
  }

  return {
    // state
    drawLayers, activeLayerId, sourceRefs, popup, popupPos, layerMenu,
    dbLoading, dbError,
    // draw tools
    activeTool, drawEnable, drawType, modifyEnable, deleteMode,
    // constants
    COLOR_PALETTE, TYPE_LABELS,
    // helpers
    hexToRgba, makeFeatureStyle, makeIconDataUrl, clearIconCache,
    // db
    loadLayersFromDB,
    // source
    setSourceRef,
    // layer
    addDrawLayer, deleteDrawLayer, finishRename, updateLayerStyle,
    // draw
    onDrawEnd,
    // popup
    openPopup, closePopup, savePopup,
    // feature
    deleteFeature, zoomToFeature,
    // map
    onMapClick,
    // context menu
    openLayerMenu, closeLayerMenu,
    // geo io
    exportGeoJSON, triggerImport, importFile, importBulkPayload, exportLayerToCSV, exportLayerToXLS,
    importLoading, importProgress, importError,
    // editor
    bulkUpdateFeaturesFromEditor,
  };
}