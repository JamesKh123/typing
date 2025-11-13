// client.js - minimal typing race client
const socket = io();
let roomId = null;
let text = '';
let words = [];
let currentIdx = 0;
let startTime = null;
let correctChars = 0;
const updateIntervalMs = 1500; // throttle to 1.5s

document.getElementById('create').onclick = () => {
  const custom = prompt('Enter custom text') || 'quick brown fox jumps over the lazy dog';
  window.location = `/create?text=${encodeURIComponent(custom)}`;
};

document.getElementById('join').onclick = () => {
  const name = document.getElementById('name').value || 'guest';
  roomId = document.getElementById('room').value.trim() || new URLSearchParams(window.location.search).get('room') || '';
  if (!roomId) return alert('Enter room id or open from create link');
  socket.emit('join', { roomId, name });
  document.getElementById('roomArea').style.display = '';
};

socket.on('roomInfo', (data) => {
  roomId = data.roomId;
  text = data.text;
  words = text.split(/\s+/).filter(Boolean);
  renderText();
  resetInput();
});

function renderText() {
  const box = document.getElementById('textBox');
  box.innerHTML = '';
  words.forEach((w, i) => {
    const span = document.createElement('span');
    span.textContent = w + ' ';
    span.className = 'word' + (i === currentIdx ? ' current' : '');
    box.appendChild(span);
  });
}

function resetInput(){
  currentIdx = 0;
  startTime = null;
  correctChars = 0;
  renderText();
  document.getElementById('input').value = '';
}

const input = document.getElementById('input');
let lastSend = 0;

input.addEventListener('input', (e) => {
  if (!startTime) startTime = Date.now();
  const val = e.target.value;
  if (val.endsWith(' ')) {
    const typed = val.trim();
    const expected = words[currentIdx] || '';
    if (typed === expected) correctChars += typed.length;
    currentIdx++;
    e.target.value = '';
    renderText();
    maybeSendProgress();
    if (currentIdx >= words.length) finishRace();
  }
});

function maybeSendProgress(final=false){
  const now = Date.now();
  if (final || now - lastSend > updateIntervalMs) {
    const pct = Math.round((currentIdx / words.length) * 100);
    socket.emit('progress', { roomId, progressPct: pct });
    lastSend = now;
  }
}

function finishRace(){
  const timeSeconds = (Date.now() - startTime) / 1000;
  maybeSendProgress(true);
  socket.emit('finish', { roomId, timeSeconds, correctChars });
  alert('Finished! Your result sent to server.');
}

socket.on('leaderboard', (data) => {
  const lb = data.leaderboard || [];
  const container = document.getElementById('leaderboard');
  container.innerHTML = '<h4>Leaderboard</h4>' + lb.map((p, idx) =>
    `<div>${idx+1}. ${escapeHtml(p.name)} — ${p.finished ? p.wpm + ' WPM' : p.progress + '%'} ${p.finished ? '(done)' : ''}</div>`
  ).join('');
});

function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
