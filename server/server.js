import dotenv from "dotenv";
dotenv.config();

import express from "express";
import Groq from "groq-sdk";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// ─── Groq ────────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test koneksi saat startup
pool.query("SELECT NOW()").then(() => {
  console.log("✅ PostgreSQL terhubung");
}).catch(err => {
  console.error("❌ PostgreSQL gagal:", err.message);
});

// ─── HELPER ───────────────────────────────────────────────────────────────────
// Ubah row DB → format yang dipakai frontend useDrawLayers.js
function rowToLayer(row) {
  return {
    id:       row.id,
    name:     row.name,
    color:    row.color,
    opacity:  parseFloat(row.opacity),
    visible:  row.visible,
    icon:     row.icon ?? null,
    // expanded & editing adalah state UI saja, tidak perlu disimpan ke DB
    expanded: true,
    editing:  false,
    features: [],   // akan diisi terpisah
  };
}

function rowToFeature(row) {
  return {
    id:         row.id,
    layer_id:   row.layer_id,
    name:       row.name,
    desc:       row.description,
    color:      row.color,
    icon:       row.icon ?? null,
    type:       row.geom_type,
    geojson:    JSON.parse(row.geom),
    properties: row.properties || {},
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/layers
// Ambil semua layer beserta semua fiturnya sekaligus
app.get("/api/layers", async (req, res) => {
  try {
    // Ambil semua layer
    const layerResult = await pool.query(
      `SELECT id, name, color, opacity, visible, icon
       FROM draw_layers
       ORDER BY id ASC`
    );

    // Ambil semua fitur sekaligus (lebih efisien dari N+1 query)
    const featResult = await pool.query(
      `SELECT id, layer_id, name, description, color, icon, geom_type, properties,
              ST_AsGeoJSON(geom) as geom
       FROM draw_features
       ORDER BY id ASC`
    );

    // Gabungkan: pasangkan fitur ke layer masing-masing
    const layers = layerResult.rows.map(rowToLayer);
    featResult.rows.forEach(featRow => {
      const layer = layers.find(l => l.id === featRow.layer_id);
      if (layer) layer.features.push(rowToFeature(featRow));
    });

    res.json(layers);
  } catch (err) {
    console.error("GET /api/layers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/layers
// Buat layer baru (tanpa fitur)
app.post("/api/layers", async (req, res) => {
  try {
    const { name, color, opacity, visible, icon } = req.body;
    const result = await pool.query(
      `INSERT INTO draw_layers (name, color, opacity, visible, icon)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, color, opacity, visible, icon`,
      [
        name    || "Lapisan tanpa judul",
        color   || "#3498db",
        opacity ?? 1,
        visible ?? true,
        icon    ?? null,
      ]
    );
    res.json(rowToLayer(result.rows[0]));
  } catch (err) {
    console.error("POST /api/layers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/layers/:id
// Update nama / warna / opacity / visible layer
app.put("/api/layers/:id", async (req, res) => {
  try {
    const { name, color, opacity, visible, icon } = req.body;
    const result = await pool.query(
      `UPDATE draw_layers
       SET name=$1, color=$2, opacity=$3, visible=$4, icon=$5
       WHERE id=$6
       RETURNING id, name, color, opacity, visible, icon`,
      [name, color, opacity, visible, icon ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Layer tidak ditemukan" });
    res.json(rowToLayer(result.rows[0]));
  } catch (err) {
    console.error("PUT /api/layers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/layers/:id
// Hapus layer (fiturnya otomatis terhapus karena ON DELETE CASCADE)
app.delete("/api/layers/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM draw_layers WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/layers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/features
app.post("/api/features", async (req, res) => {
  try {
    const { layer_id, name, description, color, icon, geojson, properties } = req.body;
    const result = await pool.query(
      `INSERT INTO draw_features (layer_id, name, description, color, icon, geom_type, geom, properties)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), $8)
       RETURNING id, layer_id, name, description, color, icon, geom_type, properties,
                 ST_AsGeoJSON(geom) as geom`,
      [layer_id, name||"Objek", description||"", color||"#3498db",
       icon||null, geojson.type, JSON.stringify(geojson), JSON.stringify(properties||{})]
    );
    res.json(rowToFeature(result.rows[0]));
  } catch (err) {
    console.error("POST /api/features error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/features/bulk — simpan banyak fitur dalam satu transaction
// PENTING: harus didefinisikan SEBELUM PUT /api/features/:id agar Express
// tidak menganggap "bulk" sebagai :id parameter
app.post("/api/features/bulk", async (req, res) => {
  const client = await pool.connect();
  try {
    const { layer_id, features } = req.body;
    if (!layer_id)
      return res.status(400).json({ error: "layer_id wajib diisi" });
    if (!Array.isArray(features) || !features.length)
      return res.status(400).json({ error: "features harus array tidak kosong" });

    await client.query("BEGIN");
    const saved = [];
    for (const feat of features) {
      const { name, description, color, icon, geojson, properties } = feat;
      const result = await client.query(
        `INSERT INTO draw_features (layer_id, name, description, color, icon, geom_type, geom, properties)
         VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), $8)
         RETURNING id, layer_id, name, description, color, icon, geom_type, properties,
                   ST_AsGeoJSON(geom) AS geom`,
        [
          layer_id,
          name        || "Objek",
          description || "",
          color       || "#3498db",
          icon        || null,
          geojson.type,
          JSON.stringify(geojson),
          JSON.stringify(properties || {}),
        ]
      );
      saved.push(rowToFeature(result.rows[0]));
    }
    await client.query("COMMIT");
    res.json(saved);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/features/bulk error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/features/:id
app.put("/api/features/:id", async (req, res) => {
  try {
    const { name, description, color, icon, geojson, properties } = req.body;
    let result;
    if (geojson) {
      result = await pool.query(
        `UPDATE draw_features
         SET name=$1, description=$2, color=$3, icon=$4,
             geom=ST_SetSRID(ST_GeomFromGeoJSON($5),4326), geom_type=$6,
             properties=COALESCE($7::jsonb, properties)
         WHERE id=$8
         RETURNING id, layer_id, name, description, color, icon, geom_type, properties,
                   ST_AsGeoJSON(geom) as geom`,
        [name, description, color, icon ?? null, JSON.stringify(geojson), geojson.type,
         properties ? JSON.stringify(properties) : null, req.params.id]
      );
    } else {
      result = await pool.query(
        `UPDATE draw_features
         SET name=$1, description=$2, color=$3, icon=$4,
             properties=COALESCE($5::jsonb, properties)
         WHERE id=$6
         RETURNING id, layer_id, name, description, color, icon, geom_type, properties,
                   ST_AsGeoJSON(geom) as geom`,
        [name, description, color, icon ?? null,
         properties ? JSON.stringify(properties) : null, req.params.id]
      );
    }
    if (!result.rows.length) return res.status(404).json({ error: "Fitur tidak ditemukan" });
    res.json(rowToFeature(result.rows[0]));
  } catch (err) {
    console.error("PUT /api/features/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/features/:id
app.delete("/api/features/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM draw_features WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/features/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Chatbot
const sessionMemory = {};

const SYSTEM_PROMPT = `
Kamu adalah AI GIS Expert profesional untuk peta Indonesia.

Aturan:
- Jawab dalam Bahasa Indonesia yang formal namun mudah dipahami.
- Fokus pada analisis spasial dan geografis.
- Jika ada nama provinsi di konteks, analisis dari aspek: geografi, demografi, ekonomi, risiko bencana, dan infrastruktur.
- Berikan insight berbasis data spasial yang konkret dan berguna.
- Format jawaban dengan rapi, gunakan poin-poin jika diperlukan.
- Jangan menjawab di luar konteks GIS dan geografi Indonesia.
`.trim();

app.post("/api/chat", async (req, res) => {
  try {
    const { message, province } = req.body;
    const sessionKey = province || "general";
    if (!sessionMemory[sessionKey]) sessionMemory[sessionKey] = [];
    const memory = sessionMemory[sessionKey];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...memory,
      { role: "user", content: message },
    ];
    const completion = await groq.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens:  1024,
    });
    const reply = completion.choices[0].message.content;
    memory.push({ role: "user", content: message });
    memory.push({ role: "assistant", content: reply });
    if (memory.length > 20) sessionMemory[sessionKey] = memory.slice(-20);
    res.json({ reply });
  } catch (error) {
    console.error("Groq error:", error);
    res.status(500).json({ error: "LLM error: " + error.message });
  }
});

app.post("/api/reset", (req, res) => {
  const { province } = req.body;
  if (province && sessionMemory[province]) delete sessionMemory[province];
  res.json({ ok: true });
});

// ─── ArcGIS BNPB Proxy ────────────────────────────────────────────────────────
// Semua request ke gis.bnpb.go.id diblokir CORS dari browser.
// Frontend kirim ke /api/arcgis-proxy?url=<encoded_url> → server forward server-side.
//
// Keamanan: hanya URL dengan host gis.bnpb.go.id yang diizinkan.
// Strategi frontend: offline GeoJSON lokal (utama) → proxy ini (backup/refresh).

const ALLOWED_HOSTS = ["gis.bnpb.go.id"];

app.get("/api/arcgis-proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: "Parameter url wajib diisi" });

  let parsed;
  try { parsed = new URL(targetUrl); } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  // Whitelist: hanya izinkan domain BNPB
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return res.status(403).json({ error: `Domain tidak diizinkan: ${parsed.hostname}` });
  }

  // Set CORS agar browser tidak blokir response dari proxy ini
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 45_000); // 45 detik

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":  "Mozilla/5.0 (compatible; GIS-Proxy/1.0)",
        "Accept":      "application/json, text/plain, */*",
        "Referer":     "https://gis.bnpb.go.id/",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Forward status & content-type dari upstream
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.set("Content-Type", ct);

    const body = await upstream.text();
    console.log(`[arcgis-proxy] ${upstream.status} ${targetUrl.slice(0, 80)}... (${body.length} bytes)`);
    res.send(body);
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[arcgis-proxy] Timeout (45s):", targetUrl.slice(0, 80));
      return res.status(504).json({ error: "Upstream timeout setelah 45 detik" });
    }
    console.error("[arcgis-proxy] Gagal fetch:", err.message);
    res.status(502).json({ error: "Upstream error: " + err.message });
  }
});

// Handle preflight CORS untuk proxy
app.options("/api/arcgis-proxy", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log("🚀 Server jalan di http://localhost:3001");
  console.log("🔀 ArcGIS proxy aktif: GET /api/arcgis-proxy?url=<encoded>");
});