# Exploration Vue3 + OpenLayers (SIJABI)

Dibangun dengan Vue 3 + vue3-openlayers di frontend dan Express.js + PostgreSQL/PostGIS di backend.

Source Documentation:
[https://vue3openlayers.netlify.app/](https://vue3openlayers.netlify.app/get-started.html)

---

## Clone Versi Development

Gunakan commit ini untuk menjalankan versi development secara lokal (belum ada perubahan konfigurasi deployment):

```
git clone https://github.com/lanangarf/Vue3OL.git
cd Vue3OL
git checkout e15b1b979394fe575692f350f1d5515dfad1e7ab
```

---

## Cara Menjalankan (Development — Local)

### 1. Setup environment frontend

Duplikat file `.env.example` di **root project** menjadi `.env`:

**Windows (PowerShell)**
```
copy .env.example .env
```

**Mac / Linux**
```
cp .env.example .env
```

Buka `.env` dan sesuaikan konfigurasinya:

```env
VITE_API_URL=http://localhost:3001/api
```

### 2. Setup environment backend

Duplikat file `.env.example` di folder **`server/`** menjadi `server/.env`:

```
cp server/.env.example server/.env
```

Isi konfigurasinya:

```env
GROQ_API_KEY=your_groq_api_key_here

DB_HOST=localhost
DB_PORT=5432
DB_NAME=sijabi
DB_USER=postgres
DB_PASSWORD=your_password
```

> **AI Assistant API Key** (untuk keperluan internal):
> https://drive.google.com/file/d/1xItJxnDxs-gKkRMbDklOonK-aBZnIVkE/view?usp=sharing

### 3. Jalankan database dengan Docker

Pastikan **Docker Desktop** sudah running, lalu di terminal dari folder project:

**Windows / Mac / Linux**
```
docker-compose up --build
```

Ini akan menjalankan container PostgreSQL + PostGIS secara otomatis.

### 4. Jalankan backend

Buka terminal baru, masuk ke folder `server/`:

```
cd server
npm install
node server.js
```

Backend akan berjalan di `http://localhost:3001`.

### 5. Jalankan frontend

Kembali ke root project, buka terminal baru:

```
npm install
npm run dev
```

Frontend akan berjalan di `http://localhost:5173` (atau port lain yang ditampilkan Vite).

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | Vue 3, vue3-openlayers, OpenLayers, Vite |
| Backend | Express.js, Node.js |
| Database | PostgreSQL + PostGIS |
| AI Assistant | Groq SDK (llama-3.3-70b-versatile) |
| Dev Environment | Docker, Docker Compose |

---

## Struktur Project

```
├── server/
│   ├── server.js         # Express API + koneksi PostgreSQL
│   └── package.json
├── src/
│   ├── components/       # Komponen Vue (Map, Layer, AI Assistant, dll)
│   ├── composables/      # useDrawLayers.js, useArcGISLoader.js
│   └── App.vue
├── public/
│   └── data/             # GeoJSON fallback (pasar, sekolah, terminal, dll)
├── docker-compose.yml
├── vite.config.js
└── package.json
```

---

## Catatan

- Pastikan port `5432` (PostgreSQL) dan `3001` (backend) tidak dipakai proses lain sebelum menjalankan.
- Data GeoJSON di `public/data/` digunakan sebagai **fallback offline** apabila layer ArcGIS tidak dapat diakses.
- Fitur AI Assistant membutuhkan `GROQ_API_KEY` yang valid agar bisa digunakan.
