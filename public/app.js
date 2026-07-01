/* ============================================================
   RAMIZ AI CONVERTER — Frontend Application (FUNCTIONAL)
   ============================================================ */

(() => {
  'use strict';

  /* ---------- Helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Application State ---------- */
  const state = {
    languages: [],
    currentSection: 'translator',
    calendar: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      selected: formatDateKey(new Date()),
      events: JSON.parse(localStorage.getItem('ramiz_events') || '{}')
    },
    notes: JSON.parse(localStorage.getItem('ramiz_notes') || '[]'),
    editingNoteId: null,
    notesSearch: '',
    tasks: JSON.parse(localStorage.getItem('ramiz_tasks') || '[]'),
    taskFilter: 'all'
  };

  /* ============================================================
     TOAST
     ============================================================ */
  function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle'
              : type === 'error'   ? 'circle-exclamation'
              : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  /* ============================================================
     SECTION NAVIGATION  (FIX #2)
     ============================================================ */
  const SECTION_META = {
    translator: { title: 'Translator',  subtitle: 'Real-time AI-powered language conversion' },
    calendar:   { title: 'Calendar',    subtitle: 'Organize your schedule and events' },
    notes:      { title: 'Notes',       subtitle: 'Capture and organize your thoughts' },
    tasks:      { title: 'Tasks',       subtitle: 'Track your daily activities and progress' }
  };

  function initNavigation() {
    // Sidebar clicks
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (!section) return;
        switchSection(section);
        // Close mobile sidebar
        $('#sidebar')?.classList.remove('open');
      });
    });

    // Mobile menu toggle
    $('#sidebarToggle')?.addEventListener('click', () => {
      $('#sidebar')?.classList.toggle('open');
    });
  }

  function switchSection(section) {
    if (!SECTION_META[section]) return;
    state.currentSection = section;

    // Update nav active state
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === section));

    // Update visible section
    $$('.section').forEach(s => s.classList.remove('active'));
    const target = $(`#${section}`);
    if (target) target.classList.add('active');

    // Update topbar
    $('#sectionTitle').textContent = SECTION_META[section].title;
    $('#sectionSubtitle').textContent = SECTION_META[section].subtitle;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     THEME
     ============================================================ */
  function initTheme() {
    const saved = localStorage.getItem('ramiz_theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    updateThemeIcon(saved);

    $('#themeToggle')?.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('ramiz_theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    const icon = $('#themeToggle i');
    if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    const label = $('#themeToggle span');
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  /* ============================================================
     TRANSLATOR  (FIX #1 — wire to real backend)
     ============================================================ */
  async function initTranslator() {
    try {
      const res = await fetch('/api/languages');
      const json = await res.json();
      state.languages = json.data || [];

      const fromSel = $('#fromLang');
      const toSel   = $('#toLang');
      if (!fromSel || !toSel) return;

      const options = state.languages
        .map(l => `<option value="${l.code}">${l.flag} ${l.name}</option>`).join('');
      fromSel.innerHTML = options;
      toSel.innerHTML   = options;

      // Defaults: English → Urdu (showcases real script)
      fromSel.value = 'en';
      toSel.value   = 'ur';

      const sourceEl   = $('#sourceText');
      const targetEl   = $('#targetText');
      const charCount  = $('#charCount');
      const statusEl   = $('#translateStatus');

      let debounceTimer;
      sourceEl.addEventListener('input', () => {
        charCount.textContent = sourceEl.value.length;
        clearTimeout(debounceTimer);
        const txt = sourceEl.value.trim();
        if (!txt) { targetEl.textContent = ''; statusEl.textContent = 'Ready'; return; }
        statusEl.textContent = 'Translating…';
        debounceTimer = setTimeout(() => translateText(txt), 350);
      });

      [fromSel, toSel].forEach(sel =>
        sel.addEventListener('change', () => {
          const txt = sourceEl.value.trim();
          if (txt) translateText(txt);
        })
      );

      $('#swapBtn')?.addEventListener('click', () => {
        const from = fromSel.value, to = toSel.value;
        fromSel.value = to;
        toSel.value   = from;
        const srcText = sourceEl.value;
        const tgtText = targetEl.textContent;
        sourceEl.value = tgtText;
        targetEl.textContent = srcText;
        charCount.textContent = srcText.length;
        if (tgtText.trim()) translateText(tgtText);
      });

      $('#clearSource')?.addEventListener('click', () => {
        sourceEl.value = '';
        targetEl.textContent = '';
        charCount.textContent = '0';
        statusEl.textContent = 'Ready';
      });

      $('#copyTarget')?.addEventListener('click', async () => {
        const txt = targetEl.textContent;
        if (!txt) return;
        try { await navigator.clipboard.writeText(txt); showToast('Copied to clipboard'); }
        catch { showToast('Copy failed', 'error'); }
      });

      $('#speakSource')?.addEventListener('click', () => speak(sourceEl.value, fromSel.value));
      $('#speakTarget')?.addEventListener('click', () => speak(targetEl.textContent, toSel.value));

      if ($('#statLangs')) $('#statLangs').textContent = state.languages.length;
    } catch (err) {
      console.error(err);
      showToast('Failed to load languages', 'error');
    }
  }

  async function translateText(text) {
    const statusEl = $('#translateStatus');
    const targetEl = $('#targetText');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: $('#fromLang').value, to: $('#toLang').value })
      });
      const json = await res.json();
      if (json.success) {
        targetEl.textContent = json.data.translated;
        statusEl.textContent = 'Translated';
      } else {
        statusEl.textContent = 'Error';
        showToast(json.error || 'Translation failed', 'error');
      }
    } catch (err) {
      statusEl.textContent = 'Error';
      showToast('Network error — check server', 'error');
    }
  }

  function speak(text, lang) {
    if (!text || !('speechSynthesis' in window)) { showToast('Speech unavailable', 'error'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /* ============================================================
     CALENDAR  (FIX #3 — dynamic current month)
     ============================================================ */
  function initCalendar() {
    $('#prevMonth')?.addEventListener('click', () => {
      state.calendar.month--;
      if (state.calendar.month < 0) { state.calendar.month = 11; state.calendar.year--; }
      renderCalendar();
    });

    $('#nextMonth')?.addEventListener('click', () => {
      state.calendar.month++;
      if (state.calendar.month > 11) { state.calendar.month = 0; state.calendar.year++; }
      renderCalendar();
    });

    $('#addEvent')?.addEventListener('click', addEvent);
    $('#eventTitle')?.addEventListener('keypress', e => { if (e.key === 'Enter') addEvent(); });

    renderCalendar();
  }

  function renderCalendar() {
    const { year, month } = state.calendar;
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    const monthEl = $('#monthYear');
    if (monthEl) monthEl.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const todayKey = formatDateKey(new Date());

    const cells = [];

    // Leading days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      cells.push({
        day: d,
        key: formatDateKey(new Date(year, month - 1, d)),
        otherMonth: true
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const key = formatDateKey(new Date(year, month, d));
      cells.push({
        day: d,
        key,
        otherMonth: false,
        today: key === todayKey,
        selected: key === state.calendar.selected,
        hasEvent: (state.calendar.events[key] || []).length > 0
      });
    }

    // Trailing days
    const totalCells = cells.length <= 35 ? 35 : 42;
    let nextDay = 1;
    while (cells.length < totalCells) {
      cells.push({
        day: nextDay++,
        key: formatDateKey(new Date(year, month + 1, nextDay - 1)),
        otherMonth: true
      });
    }

    const grid = $('#calendarDays');
    if (!grid) return;
    grid.innerHTML = cells.map(c =>
      `<div class="day ${c.otherMonth ? 'other-month' : ''} ${c.today ? 'today' : ''} ${c.selected ? 'selected' : ''} ${c.hasEvent ? 'has-event' : ''}" data-key="${c.key}">${c.day}</div>`
    ).join('');

    grid.querySelectorAll('.day').forEach(el => {
      el.addEventListener('click', () => {
        state.calendar.selected = el.dataset.key;
        renderCalendar();
      });
    });

    renderEvents();
  }

  function renderEvents() {
    const key = state.calendar.selected;
    const date = new Date(key + 'T00:00:00');
    const badge = $('#selectedDate');
    if (badge) badge.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const list = $('#eventsList');
    if (!list) return;
    const events = state.calendar.events[key] || [];

    if (events.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-xmark"></i><p>No events for this day</p></div>`;
      return;
    }

    list.innerHTML = events
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .map(ev => `
        <div class="event-item">
          <div>
            <div class="event-item-title">${escapeHtml(ev.title)}</div>
            <div class="event-item-time"><i class="fas fa-clock"></i> ${ev.time || 'All day'}</div>
          </div>
          <button class="event-item-delete" data-id="${ev.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
      `).join('');

    list.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', () => deleteEvent(btn.dataset.id));
    });
  }

  function addEvent() {
    const titleEl = $('#eventTitle');
    const timeEl  = $('#eventTime');
    const title = titleEl.value.trim();
    if (!title) { showToast('Enter an event title', 'error'); return; }
    const time = timeEl.value || '00:00';
    const key = state.calendar.selected;

    if (!state.calendar.events[key]) state.calendar.events[key] = [];
    state.calendar.events[key].push({ id: Date.now().toString(), title, time });
    localStorage.setItem('ramiz_events', JSON.stringify(state.calendar.events));

    titleEl.value = '';
    renderCalendar();
    showToast('Event added');
  }

  function deleteEvent(id) {
    const key = state.calendar.selected;
    if (!state.calendar.events[key]) return;
    state.calendar.events[key] = state.calendar.events[key].filter(e => e.id !== id);
    if (state.calendar.events[key].length === 0) delete state.calendar.events[key];
    localStorage.setItem('ramiz_events', JSON.stringify(state.calendar.events));
    renderCalendar();
    showToast('Event deleted');
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /* ============================================================
     NOTES  (FIX #3 — create/save cards)
     ============================================================ */
  function initNotes() {
    $('#newNoteBtn')?.addEventListener('click', () => openNoteEditor());
    $('#closeNoteEditor')?.addEventListener('click', closeNoteEditor);
    $('#cancelNote')?.addEventListener('click', closeNoteEditor);
    $('#saveNote')?.addEventListener('click', saveNote);
    $('#notesSearch')?.addEventListener('input', e => {
      state.notesSearch = e.target.value.toLowerCase();
      renderNotes();
    });

    $('#noteEditor')?.addEventListener('click', e => {
      if (e.target.id === 'noteEditor') closeNoteEditor();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#noteEditor').classList.contains('hidden')) closeNoteEditor();
    });

    renderNotes();
  }

  function openNoteEditor(note = null) {
    state.editingNoteId = note ? note.id : null;
    $('#noteTitle').value = note ? note.title : '';
    $('#noteContent').value = note ? note.content : '';
    $('#noteTimestamp').textContent = note
      ? `Last edited: ${new Date(note.updatedAt).toLocaleString()}`
      : 'New note';
    $('#noteEditor').classList.remove('hidden');
    setTimeout(() => $('#noteTitle').focus(), 50);
  }

  function closeNoteEditor() {
    $('#noteEditor').classList.add('hidden');
    state.editingNoteId = null;
  }

  function saveNote() {
    const title = $('#noteTitle').value.trim() || 'Untitled Note';
    const content = $('#noteContent').value.trim();
    if (!content && title === 'Untitled Note') { showToast('Note is empty', 'error'); return; }
    const now = new Date().toISOString();

    if (state.editingNoteId) {
      const note = state.notes.find(n => n.id === state.editingNoteId);
      if (note) { note.title = title; note.content = content; note.updatedAt = now; }
    } else {
      state.notes.unshift({ id: Date.now().toString(), title, content, createdAt: now, updatedAt: now });
    }

    localStorage.setItem('ramiz_notes', JSON.stringify(state.notes));
    renderNotes();
    closeNoteEditor();
    showToast(state.editingNoteId ? 'Note updated' : 'Note saved');
  }

  function deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    state.notes = state.notes.filter(n => n.id !== id);
    localStorage.setItem('ramiz_notes', JSON.stringify(state.notes));
    renderNotes();
    showToast('Note deleted');
  }

  function renderNotes() {
    const grid = $('#notesGrid');
    if (!grid) return;

    const filtered = state.notes.filter(n =>
      n.title.toLowerCase().includes(state.notesSearch) ||
      n.content.toLowerCase().includes(state.notesSearch)
    );

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-note-sticky"></i>
          <p>${state.notes.length === 0 ? 'No notes yet. Create your first one!' : 'No notes match your search.'}</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(note => `
      <div class="note-card" data-id="${note.id}">
        <h4>${escapeHtml(note.title)}</h4>
        <p>${note.content ? escapeHtml(note.content) : '<em style="color:var(--text-muted)">No content</em>'}</p>
        <div class="note-card-footer">
          <span class="note-date">${new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <div class="note-actions">
            <button class="note-action-btn edit" title="Edit"><i class="fas fa-pen"></i></button>
            <button class="note-action-btn delete" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      const note = state.notes.find(n => n.id === id);
      card.addEventListener('click', e => {
        if (e.target.closest('.note-action-btn')) return;
        openNoteEditor(note);
      });
      card.querySelector('.edit')?.addEventListener('click', () => openNoteEditor(note));
      card.querySelector('.delete')?.addEventListener('click', () => deleteNote(id));
    });
  }

  /* ============================================================
     TASKS  (FIX #3 — toggle checkboxes)
     ============================================================ */
  function initTasks() {
    $('#addTask')?.addEventListener('click', addTask);
    $('#taskInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') addTask(); });

    $$('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.taskFilter = chip.dataset.filter;
        renderTasks();
      });
    });

    renderTasks();
  }

  function addTask() {
    const input = $('#taskInput');
    const text = input.value.trim();
    if (!text) return;
    state.tasks.unshift({ id: Date.now().toString(), text, completed: false, createdAt: new Date().toISOString() });
    input.value = '';
    saveTasks();
    renderTasks();
    showToast('Task added');
  }

  function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
  }

  function saveTasks() {
    localStorage.setItem('ramiz_tasks', JSON.stringify(state.tasks));
  }

  function renderTasks() {
    const list = $('#tasksList');
    if (!list) return;

    const filtered = state.tasks.filter(t => {
      if (state.taskFilter === 'pending')   return !t.completed;
      if (state.taskFilter === 'completed') return t.completed;
      return true;
    });

    const completed = state.tasks.filter(t => t.completed).length;
    const total = state.tasks.length;
    const prog = $('#taskProgress');
    const bar = $('#progressBar');
    if (prog) prog.textContent = `${completed} / ${total}`;
    if (bar) bar.style.width = `${total === 0 ? 0 : (completed / total) * 100}%`;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clipboard-check"></i>
          <p>${total === 0 ? 'No tasks yet. Add one above!' : 'No tasks in this filter.'}</p>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(task => `
      <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-toggle="${task.id}" role="checkbox" aria-checked="${task.completed}">
          ${task.completed ? '<i class="fas fa-check" style="font-size:0.7rem"></i>' : ''}
        </div>
        <span class="task-text">${escapeHtml(task.text)}</span>
        <button class="task-delete" data-delete="${task.id}" aria-label="Delete task"><i class="fas fa-times"></i></button>
      </div>
    `).join('');

    list.querySelectorAll('[data-toggle]').forEach(el =>
      el.addEventListener('click', () => toggleTask(el.dataset.toggle))
    );
    list.querySelectorAll('[data-delete]').forEach(el =>
      el.addEventListener('click', () => deleteTask(el.dataset.delete))
    );
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initTranslator();
    initCalendar();
    initNotes();
    initTasks();
    console.log('%c⚡ RAMIZ AI CONVERTER ready', 'color:#6366f1;font-weight:bold;font-size:14px');
  });
})();
/* ============================================================
   RAMIZ AI ASSISTANT — Client Logic
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const chatState = {
    open: false,
    history: [],
    isTyping: false,
    sessionId: 'ramiz_chat_' + Date.now()
  };

  const $ = (sel) => document.querySelector(sel);

  const els = {
    launcher:  $('#chatLauncher'),
    window:    $('#chatWindow'),
    close:     $('#chatClose'),
    clear:     $('#chatClear'),
    messages:  $('#chatMessages'),
    form:      $('#chatForm'),
    input:     $('#chatInput'),
    send:      $('#chatSend'),
    quickReplies: $('#quickReplies')
  };

  if (!els.launcher || !els.window) {
    console.warn('[Chat] Chat elements not found in DOM.');
    return;
  }

  /* ---------- Utilities ---------- */
  const getTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  };

  /* ---------- Welcome Message ---------- */
  function showWelcomeIfEmpty() {
    if (els.messages.children.length > 0) return;

    const welcomeMsg = `👋 Hello! I am **Ramiz AI Assistant**.

I can chat with you in **any language** — English, Urdu (اُردو), Hindi (हिन्दी), Punjabi (ਪੰਜਾਬੀ), Arabic, Chinese, and 100+ more.

Try asking me anything, or use the quick replies below!`;

    appendMessage('bot', welcomeMsg, false);
  }

  /* ---------- Message Rendering ---------- */
  function appendMessage(role, content, saveToHistory = true) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg ${role}`;

    const avatarChar = isUser ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    wrapper.innerHTML = `
      <div class="chat-msg-avatar">${avatarChar}</div>
      <div>
        <div class="chat-msg-bubble">${formatMessage(escapeHtml(content))}</div>
        <div class="chat-msg-time">${getTime()}</div>
      </div>
    `;

    els.messages.appendChild(wrapper);
    scrollToBottom();

    if (saveToHistory) {
      chatState.history.push({ role, content });
      // Keep history bounded
      if (chatState.history.length > 20) chatState.history = chatState.history.slice(-20);
    }
  }

  function formatMessage(text) {
    // Convert **bold** to <strong>
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Convert newlines to <br>
    text = text.replace(/\n/g, '<br>');
    // Convert line breaks within bubbles
    return text;
  }

  function showTypingIndicator() {
    const typing = document.createElement('div');
    typing.className = 'chat-msg bot typing';
    typing.id = 'typingIndicator';
    typing.innerHTML = `
      <div class="chat-msg-avatar"><i class="fas fa-robot"></i></div>
      <div>
        <div class="chat-msg-bubble">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
    els.messages.appendChild(typing);
    scrollToBottom();
    chatState.isTyping = true;
  }

  function hideTypingIndicator() {
    const typing = document.getElementById('typingIndicator');
    if (typing) typing.remove();
    chatState.isTyping = false;
  }

  /* ---------- Send Message ---------- */
  async function sendMessage(text) {
    const message = (text || els.input.value).trim();
    if (!message || chatState.isTyping) return;

    // Display user message
    appendMessage('user', message);
    els.input.value = '';
    autoResizeInput();

    // Hide quick replies after first interaction
    if (els.quickReplies && chatState.history.length === 1) {
      els.quickReplies.style.display = 'none';
    }

    // Show typing indicator
    showTypingIndicator();
    setSendLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       // ✅ Isay aise replace kar dein:
        body: JSON.stringify({
         message,
        history: [] // History ko filterout kar ke khali array bhej dein
        })
      });

      const data = await response.json();

      hideTypingIndicator();
      setSendLoading(false);

      if (data.success && data.data?.reply) {
        appendMessage('bot', data.data.reply);
      } else {
        appendMessage('bot', '⚠️ ' + (data.error || 'I encountered an error. Please try again.'));
      }
    } catch (err) {
      console.error('[Chat] Network error:', err);
      hideTypingIndicator();
      setSendLoading(false);
      appendMessage('bot', '🌐 Network error — please check your connection and try again.');
    }
  }

  function setSendLoading(loading) {
    if (!els.send) return;
    els.send.disabled = loading;
    els.send.classList.toggle('loading', loading);
  }

  /* ---------- Auto-Resize Input ---------- */
  function autoResizeInput() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  }

  /* ---------- Toggle Chat ---------- */
  function toggleChat(forceState) {
    const willOpen = forceState !== undefined ? forceState : !chatState.open;
    chatState.open = willOpen;

    if (willOpen) {
      els.window.classList.remove('hidden');
      els.launcher.classList.add('hidden');
      showWelcomeIfEmpty();
      setTimeout(() => els.input.focus(), 300);
    } else {
      els.window.classList.add('hidden');
      els.launcher.classList.remove('hidden');
    }
  }

  function clearChat() {
    if (!confirm('Clear all messages?')) return;
    els.messages.innerHTML = '';
    chatState.history = [];
    if (els.quickReplies) els.quickReplies.style.display = 'flex';
    showWelcomeIfEmpty();
  }

  /* ---------- Event Listeners ---------- */
  function attachListeners() {
    // Launcher
    els.launcher.addEventListener('click', () => toggleChat(true));

    // Close
    els.close.addEventListener('click', () => toggleChat(false));

    // Clear
    els.clear.addEventListener('click', clearChat);

    // Form submit
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    // Enter to send, Shift+Enter for newline
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize
    els.input.addEventListener('input', autoResizeInput);

    // Quick replies
    document.querySelectorAll('.quick-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        if (msg) sendMessage(msg);
      });
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chatState.open) toggleChat(false);
    });
  }

  /* ---------- Init ---------- */
  attachListeners();
  console.log('%c🤖 Ramiz AI Assistant ready', 'color:#6366f1;font-weight:bold;font-size:13px');
});
