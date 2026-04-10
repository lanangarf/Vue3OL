<template>
  <transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <transition name="modal-slide">
        <div v-if="isOpen" class="modal-panel">

          <!-- Header -->
          <div class="mp-header">
            <div class="mp-header-left">
              <div class="mp-ai-dot"/>
              <div>
                <div class="mp-title">AI GIS Assistant</div>
                <div class="mp-subtitle" v-if="provinceName">📍 {{ provinceName }}</div>
              </div>
            </div>
            <button class="mp-close" @click="$emit('close')">
              <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>

          <!-- Chat body -->
          <div class="mp-body" ref="chatBody">
            <!-- Messages -->
            <div v-for="(msg, i) in chatHistory" :key="i" :class="['mp-msg', msg.role]">
              <div class="mp-bubble">
                <div class="mp-bubble-label">{{ msg.role === 'user' ? 'Anda' : '🤖 AI' }}</div>
                <div class="mp-bubble-text" v-html="formatText(msg.text)"/>
              </div>
            </div>

            <!-- Typing indicator -->
            <div v-if="isLoading" class="mp-msg model">
              <div class="mp-bubble">
                <div class="mp-bubble-label">🤖 AI</div>
                <div class="mp-typing"><span/><span/><span/></div>
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="mp-footer">
            <input
              class="mp-input"
              v-model="userInput"
              @keydown.enter.prevent="sendMessage"
              placeholder="Tanya lebih lanjut tentang provinsi ini..."
              :disabled="isLoading"
              ref="inputRef"
            />
            <button class="mp-send" @click="sendMessage" :disabled="isLoading || !userInput.trim()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>

        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  isOpen:       Boolean,
  provinceName: String,
  contextData:  String,
});
const emit = defineEmits(['close']);

const userInput   = ref('');
const chatHistory = ref([]);
const isLoading   = ref(false);
const chatBody    = ref(null);
const inputRef    = ref(null);

// Saat modal dibuka → reset chat + langsung analisis otomatis
watch(() => props.isOpen, async (val) => {
  if (val && props.provinceName) {
    chatHistory.value = [];
    userInput.value   = '';
    await nextTick();
    inputRef.value?.focus();
    await autoAnalyze();
  }
});

async function scrollToBottom() {
  await nextTick();
  if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight;
}

function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// Analisis otomatis saat pertama kali buka — tanpa input user
async function autoAnalyze() {
  if (!props.provinceName || isLoading.value) return;
  isLoading.value = true;
  scrollToBottom();

  const name    = props.provinceName;
  const prompt  = `Lakukan analisis komprehensif Provinsi ${name} meliputi:
1. Geografi & kondisi alam
2. Demografi & kependudukan
3. Potensi ekonomi & unggulan daerah
4. Risiko bencana
5. Infrastruktur & aksesibilitas

Berikan insight spasial yang konkret dan berguna untuk perencanaan wilayah.`;

  const contextPrompt = props.contextData
    ? `Konteks: Provinsi ${name}\n${props.contextData}\n\n${prompt}`
    : prompt;

  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: contextPrompt, province: name }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    chatHistory.value.push({ role: 'model', text: data.reply });
  } catch {
    chatHistory.value.push({ role: 'model', text: 'Maaf, terjadi kesalahan koneksi ke server.' });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

// Kirim pesan lanjutan dari user
async function sendMessage() {
  const msg = userInput.value.trim();
  if (!msg || isLoading.value) return;

  chatHistory.value.push({ role: 'user', text: msg });
  userInput.value  = '';
  isLoading.value  = true;
  scrollToBottom();

  const name          = props.provinceName;
  const contextPrompt = props.contextData
    ? `Konteks: Provinsi ${name}\n${props.contextData}\n\nPertanyaan: ${msg}`
    : `Konteks: User bertanya tentang Provinsi "${name}" di peta Indonesia.\n\nPertanyaan: ${msg}`;

  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: contextPrompt, province: name }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    chatHistory.value.push({ role: 'model', text: data.reply });
  } catch {
    chatHistory.value.push({ role: 'model', text: 'Maaf, terjadi kesalahan koneksi ke server.' });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}
</script>

<style scoped>
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(3px);
  z-index: 2000;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 16px;
}

/* Panel */
.modal-panel {
  width: 380px;
  height: 560px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "Inter", "Segoe UI", system-ui, sans-serif;
}

/* Header */
.mp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #f0f0f0;
  background:#1e3a5f;
  flex-shrink: 0;
}
.mp-header-left { display: flex; align-items: center; gap: 10px; }
.mp-ai-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 3px rgba(74,222,128,0.3);
  animation: pulse-dot 2s infinite;
  flex-shrink: 0;
}
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 3px rgba(74,222,128,0.3); }
  50% { box-shadow: 0 0 0 6px rgba(74,222,128,0.1); }
}
.mp-title { font-size: 13px; font-weight: 700; color: #fff; line-height: 1.2; }
.mp-subtitle { font-size: 11px; color: rgba(255,255,255,0.75); margin-top: 1px; }
.mp-close {
  background: rgba(255,255,255,0.15);
  border: none;
  border-radius: 8px;
  width: 28px; height: 28px;
  cursor: pointer;
  color: rgba(255,255,255,0.8);
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.mp-close:hover { background: rgba(255,255,255,0.25); color: #fff; }

/* Body */
.mp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: #e0e0e0 transparent;
}
.mp-body::-webkit-scrollbar { width: 3px; }
.mp-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }



/* Messages */
.mp-msg { display: flex; }
.mp-msg.user { justify-content: flex-end; }
.mp-msg.model { justify-content: flex-start; }

.mp-bubble {
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mp-msg.user .mp-bubble { align-items: flex-end; }
.mp-msg.model .mp-bubble { align-items: flex-start; }

.mp-bubble-label {
  font-size: 10px;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-bottom: 2px;
}
.mp-bubble-text {
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.65;
}
.mp-msg.user .mp-bubble-text {
  background: #2563eb;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.mp-msg.model .mp-bubble-text {
  background: #f3f4f6;
  color: #1a1a1a;
  border-bottom-left-radius: 4px;
}

/* Typing indicator */
.mp-typing {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f3f4f6;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  align-items: center;
}
.mp-typing span {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  animation: bounce 1.2s infinite ease-in-out;
}
.mp-typing span:nth-child(1) { animation-delay: 0s; }
.mp-typing span:nth-child(2) { animation-delay: .2s; }
.mp-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.2); opacity: 1; }
}

/* Footer / input */
.mp-footer {
  display: flex;
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.mp-input {
  flex: 1;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  color: #111;
  outline: none;
  transition: border-color .15s;
  background: #fafafa;
}
.mp-input:focus { border-color: #2563eb; background: #fff; }
.mp-input:disabled { opacity: 0.6; cursor: not-allowed; }
.mp-input::placeholder { color: #aaa; }
.mp-send {
  width: 38px; height: 38px;
  border-radius: 10px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all .14s;
}
.mp-send:hover:not(:disabled) { background: #1d4ed8; }
.mp-send:disabled { opacity: 0.4; cursor: not-allowed; }

/* Transitions */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-slide-enter-active, .modal-slide-leave-active { transition: all .25s cubic-bezier(.34,1.56,.64,1); }
.modal-slide-enter-from, .modal-slide-leave-to { opacity: 0; transform: translateY(24px) scale(0.97); }
</style>