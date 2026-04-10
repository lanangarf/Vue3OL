<script setup>
/**
 * IconPickerModal.vue
 * Modal penuh untuk memilih ikon & warna
 * Dipakai oleh LayerCustomize (per-layer/mass) dan LayerCustomizePopup (per-feature).
 *
 * Props:
 *   modelValue   – icon aktif (string Material Symbols)
 *   color        – warna aktif (hex)
 *   colorPalette – array hex (opsional)
 *   title        – judul modal (opsional)
 *
 * Emits:
 *   confirm ({ icon, color })  – user klik Oke / pilih ikon
 *   close                       – user klik X / backdrop
 */
import { ref, watch } from "vue";

const props = defineProps({
  modelValue:   { type: String,  default: "place" },
  color:        { type: String,  default: "#1a73e8" },
  colorPalette: { type: Array,   default: null },
  title:        { type: String,  default: "Pilih Ikon" },
});

const emit = defineEmits(["confirm", "close"]);

// ── Warna default ─────────────────────────────────────────────────────────────
const DEFAULT_COLORS = [
  "#e53935","#d81b60","#8e24aa","#5e35b1","#3949ab","#1e88e5","#039be5",
  "#00acc1","#00897b","#43a047","#7cb342","#c0ca33","#fdd835","#ffb300",
  "#fb8c00","#f4511e","#795548","#757575","#546e7a","#000000",
];

// ── Kategori ikon ─────────────────────────────────────────────────────────────
const ICON_CATEGORIES = [
  {
    label: "Bentuk",
    color: "#9e9e9e",
    icons: [
      "place","circle","square","diamond","star","pentagon","hexagon",
      "favorite","bookmark","flag","location_on","push_pin","navigation",
      "arrow_upward","arrow_forward","arrow_downward","arrow_back",
    ],
  },
  {
    label: "Bisnis",
    color: "#f9a825",
    icons: [
      "store","shopping_cart","local_mall","storefront","business","work",
      "apartment","domain","real_estate_agent","corporate_fare",
      "restaurant","local_cafe","local_bar","nightlife","wine_bar",
      "local_pizza","fastfood","ramen_dining","bakery_dining","lunch_dining",
      "local_atm","attach_money","payments","currency_exchange",
      "local_gas_station","ev_station","local_parking","local_taxi",
      "hotel","bed","meeting_room","event","manage_accounts",
      "camera_alt","photo_camera","videocam","music_note","headphones",
      "phone","smartphone","laptop","computer",
      "local_grocery_store","liquor","cake","icecream","local_drink",
      "cut","dry_cleaning","local_laundry_service",
    ],
  },
  {
    label: "Krisis",
    color: "#e53935",
    icons: [
      "warning","emergency","flood","storm",
      "thunderstorm","cyclone","landslide","volcano","tsunami",
      "coronavirus","sick","health_and_safety","medical_services",
      "local_hospital","ambulance","emergency_share","crisis_alert",
      "report","report_problem","notification_important","priority_high",
      "skull","pest_control",
      "air","water_damage","power_off","electrical_services",
    ],
  },
  {
    label: "Fasilitas",
    color: "#1e88e5",
    icons: [
      "local_hospital","local_pharmacy","medical_services","healing",
      "school","menu_book","science","history_edu","class","child_care",
      "church","mosque","temple_buddhist","temple_hindu","synagogue",
      "local_police","local_post_office",
      "museum","theater_comedy","movie","sports_esports","casino",
      "stadium","fitness_center","pool","sports","spa",
      "park","forest","nature","eco","grass","water",
      "library_books","archive","description",
      "wc","accessible","elevator","stairs",
    ],
  },
  {
    label: "Menarik",
    color: "#43a047",
    icons: [
      "landscape","beach_access","forest","park","nature",
      "travel_explore","explore","tour","attractions","account_balance",
      "local_see","camera","photo","panorama",
      "temple_buddhist","castle","fort","lighthouse","stadium",
      "sailing","anchor","rowing",
      "hiking","backpack","camping","outdoor_grill","fireplace",
      "wb_sunny","nightlight","nights_stay","cloud","rainy","foggy",
      "scuba_diving","surfing","kitesurfing","kayaking","paragliding",
    ],
  },
  {
    label: "Rekreasi",
    color: "#00897b",
    icons: [
      "sports_soccer","sports_basketball","sports_tennis","sports_baseball",
      "sports_volleyball","sports_football","sports_rugby","sports_cricket",
      "sports_golf","sports_hockey","sports_martial_arts",
      "directions_bike","directions_run","nordic_walking","hiking",
      "fitness_center","pool","surfing","kitesurfing","kayaking",
      "golf_course","sports_esports","games","toys","casino","theater_comedy",
      "movie","music_note","headphones","piano","mic","party_mode",
      "celebration","cake","local_bar","nightlife","wine_bar",
    ],
  },
  {
    label: "Transportasi",
    color: "#3949ab",
    icons: [
      "directions_car","local_taxi","electric_car","two_wheeler","motorcycle",
      "directions_bus","airport_shuttle","rv_hookup","train","tram","metro",
      "directions_subway","commute","directions_railway","flight",
      "flight_land","flight_takeoff","local_airport","helicopter",
      "directions_boat","sailing","anchor","directions_walk",
      "directions_bike","local_shipping","fire_truck","emergency","ambulance",
      "local_parking","ev_station","local_gas_station","traffic",
      "signpost","u_turn_right","alt_route","fork_right","roundabout_left",
    ],
  },
  {
    label: "Cuaca",
    color: "#0288d1",
    icons: [
      "wb_sunny","light_mode","sunny","wb_twilight","nightlight","nights_stay",
      "cloud","cloud_queue","cloudy_snowing","grain","rainy",
      "thunderstorm","storm","cyclone","tornado","ac_unit","water","waves",
      "foggy","visibility","thermostat","device_thermostat",
      "heat","severe_cold","umbrella","flood","landslide","tsunami",
      "air","wind_power","wb_iridescent","flare",
    ],
  },
];

// ── State lokal ───────────────────────────────────────────────────────────────
const localIcon  = ref(props.modelValue || "place");
const localColor = ref(props.color     || "#1a73e8");
const filter     = ref("");
const activeTab  = ref(ICON_CATEGORIES[0].label);

// Sync dari parent kalau props berubah
watch(() => props.modelValue, v => { localIcon.value  = v || "place"; });
watch(() => props.color,      v => { localColor.value = v || "#1a73e8"; });

const palette = props.colorPalette || DEFAULT_COLORS;

// ── Filter + tab ──────────────────────────────────────────────────────────────
function filteredIcons() {
  const q = filter.value.trim().toLowerCase();
  if (!q) {
    const cat = ICON_CATEGORIES.find(c => c.label === activeTab.value);
    return cat ? [{ label: cat.label, color: cat.color, icons: cat.icons }] : [];
  }
  return ICON_CATEGORIES.map(cat => ({
    ...cat,
    icons: cat.icons.filter(ic => ic.replace(/_/g, " ").includes(q)),
  })).filter(cat => cat.icons.length);
}

function onFilterInput(e) {
  filter.value = e.target.value;
}

// ── Actions ───────────────────────────────────────────────────────────────────
function selectIcon(icon) {
  localIcon.value = icon;
}

function selectColor(hex) {
  localColor.value = hex;
}

function confirm() {
  emit("confirm", { icon: localIcon.value, color: localColor.value });
}

function onBackdrop() {
  emit("close");
}
</script>

<template>
  <!-- Backdrop -->
  <teleport to="body">
    <div class="ipm-backdrop" @click.self="onBackdrop">
      <div class="ipm-modal" @click.stop>

        <!-- Header -->
        <div class="ipm-header">
          <span class="ipm-title">{{ title }}</span>
          <button class="ipm-close" @click="emit('close')">
            <svg width="11" height="11" viewBox="0 0 12 12">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Color palette -->
        <div class="ipm-section">
          <div class="ipm-section-label">Warna</div>
          <div class="ipm-color-grid">
            <button
              v-for="hex in palette" :key="hex"
              class="ipm-cswatch"
              :style="{
                background: hex,
                boxShadow: localColor === hex ? `0 0 0 2px #fff, 0 0 0 4.5px ${hex}` : 'none',
                transform: localColor === hex ? 'scale(1.18)' : 'scale(1)',
              }"
              @click="selectColor(hex)"
              :title="hex"
            />
          </div>
        </div>

        <!-- Filter -->
        <div class="ipm-filter-row">
          <svg class="ipm-filter-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            class="ipm-filter"
            placeholder="Filter ikon..."
            :value="filter"
            @input="onFilterInput"
            spellcheck="false"
          />
          <button v-if="filter" class="ipm-filter-clear" @click="filter = ''">
            <svg width="9" height="9" viewBox="0 0 12 12">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Tabs (hilang saat filter aktif) -->
        <div v-if="!filter" class="ipm-tabs">
          <button
            v-for="cat in ICON_CATEGORIES" :key="cat.label"
            :class="['ipm-tab', activeTab === cat.label ? 'active' : '']"
            :style="activeTab === cat.label ? { color: cat.color, borderBottomColor: cat.color } : {}"
            @click="activeTab = cat.label"
          >{{ cat.label }}</button>
        </div>

        <!-- Grid ikon -->
        <div class="ipm-grid-wrap">
          <div v-for="cat in filteredIcons()" :key="cat.label" class="ipm-cat-block">
            <div v-if="filter" class="ipm-cat-label" :style="{ color: cat.color }">{{ cat.label }}</div>
            <div class="ipm-grid">
              <button
                v-for="ic in cat.icons" :key="ic"
                :class="['ipm-icon-btn', localIcon === ic ? 'active' : '']"
                :style="localIcon === ic ? { background: localColor, color: '#fff', borderColor: localColor } : {}"
                :title="ic.replace(/_/g, ' ')"
                @click="selectIcon(ic)"
              >
                <span class="material-symbols-outlined ipm-sym">{{ ic }}</span>
              </button>
            </div>
          </div>
          <div v-if="filter && filteredIcons().length === 0" class="ipm-empty">
            Ikon tidak ditemukan untuk "{{ filter }}"
          </div>
        </div>

        <!-- Footer -->
        <div class="ipm-footer">
          <div class="ipm-preview-wrap">
            <span
              class="material-symbols-outlined ipm-preview-icon"
              :style="{ color: localColor }"
            >{{ localIcon }}</span>
            <span class="ipm-preview-label">{{ (localIcon || '').replace(/_/g, ' ') }}</span>
          </div>
          <div class="ipm-footer-btns">
            <button class="ipm-btn-cancel" @click="emit('close')">Batal</button>
            <button class="ipm-btn-ok" :style="{ background: localColor }" @click="confirm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              Oke
            </button>
          </div>
        </div>

      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* Backdrop */
.ipm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

/* Modal card */
.ipm-modal {
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,.28), 0 4px 16px rgba(0,0,0,.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Google Sans', 'Segoe UI', sans-serif;
}

/* Header */
.ipm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.ipm-title {
  font-size: 15px;
  font-weight: 700;
  color: #202124;
}
.ipm-close {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: #f1f3f4;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .12s;
}
.ipm-close:hover { background: #fce8e6; color: #d93025; }

/* Section label */
.ipm-section { padding: 10px 16px 6px; flex-shrink: 0; }
.ipm-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #80868b;
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-bottom: 7px;
}

/* Color grid */
.ipm-color-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.ipm-cswatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
  transition: transform .12s, box-shadow .12s;
  flex-shrink: 0;
  padding: 0;
}
.ipm-cswatch:hover { transform: scale(1.2); }

/* Filter */
.ipm-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.ipm-filter-ic { color: #bbb; flex-shrink: 0; }
.ipm-filter {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #333;
  background: transparent;
  font-family: inherit;
}
.ipm-filter::placeholder { color: #bbb; }
.ipm-filter-clear {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #e8eaed;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}
.ipm-filter-clear:hover { background: #fce8e6; color: #d93025; }

/* Tabs */
.ipm-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid #e8eaed;
  flex-shrink: 0;
}
.ipm-tabs::-webkit-scrollbar { display: none; }
.ipm-tab {
  padding: 7px 11px;
  font-size: 11.5px;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: #80868b;
  border-bottom: 2.5px solid transparent;
  white-space: nowrap;
  transition: color .12s, border-color .12s;
  font-family: inherit;
  flex-shrink: 0;
}
.ipm-tab:hover { color: #333; }
.ipm-tab.active { color: #1a73e8; border-bottom-color: #1a73e8; }

/* Grid */
.ipm-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 4px;
  scrollbar-width: thin;
  scrollbar-color: #e8eaed transparent;
}
.ipm-grid-wrap::-webkit-scrollbar { width: 5px; }
.ipm-grid-wrap::-webkit-scrollbar-thumb { background: #e8eaed; border-radius: 3px; }

.ipm-cat-block { margin-bottom: 6px; }
.ipm-cat-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .4px;
  padding: 4px 2px 3px;
}
.ipm-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ipm-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1.5px solid transparent;
  background: #f8f9fa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .11s;
  color: #555;
  padding: 0;
}
.ipm-icon-btn:hover { background: #e8f0fe; color: #1a73e8; border-color: #c5d8fd; }
.ipm-icon-btn.active { border-color: transparent; }
.ipm-sym {
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  line-height: 1;
  pointer-events: none;
}
.ipm-empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 32px 0;
  font-style: italic;
}

/* Footer */
.ipm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 12px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  gap: 12px;
}
.ipm-preview-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.ipm-preview-icon {
  font-size: 26px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
  flex-shrink: 0;
  line-height: 1;
  transition: color .15s;
}
.ipm-preview-label {
  font-size: 12px;
  color: #555;
  text-transform: capitalize;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ipm-footer-btns {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.ipm-btn-cancel {
  padding: 7px 16px;
  border-radius: 7px;
  border: 1.5px solid #e0e0e0;
  background: #fff;
  color: #555;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all .12s;
}
.ipm-btn-cancel:hover { background: #f5f5f5; border-color: #ccc; }
.ipm-btn-ok {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 18px;
  border-radius: 7px;
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity .12s, background .15s;
}
.ipm-btn-ok:hover { opacity: .88; }
</style>