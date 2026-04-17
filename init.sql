CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS draw_layers (
  id      SERIAL PRIMARY KEY,
  name    TEXT    NOT NULL DEFAULT 'Lapisan tanpa judul',
  color   TEXT    NOT NULL DEFAULT '#3498db',
  opacity NUMERIC NOT NULL DEFAULT 1,
  visible BOOLEAN NOT NULL DEFAULT true,
  icon    TEXT
);

CREATE TABLE IF NOT EXISTS draw_features (
  id          SERIAL PRIMARY KEY,
  layer_id    INTEGER NOT NULL REFERENCES draw_layers(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT 'Objek',
  description TEXT    NOT NULL DEFAULT '',
  color       TEXT    NOT NULL DEFAULT '#3498db',
  icon        TEXT,
  geom_type   TEXT    NOT NULL,
  geom        GEOMETRY(Geometry, 4326) NOT NULL,
  properties  JSONB   NOT NULL DEFAULT '{}'
);