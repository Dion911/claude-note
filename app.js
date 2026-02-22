/**
 * app.js – Main Application Logic
 * Dione OS – Field Notes Edition
 *
 * Modules:
 *   - App       : initialisation, routing
 *   - UINav     : bottom navigation + view switching
 *   - UIDaily   : daily log rendering
 *   - UIProjects: project grid + project detail
 *   - UIThinking: long-form editor
 *   - UISearch  : search + filters
 *   - UICapture : quick capture sheet
 *   - UIEntry   : shared entry editor sheet
 *   - UIFocus   : focus mode overlay
 *   - Utils     : shared helpers
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════ */
const Utils = (() => {
  /** Generate a unique id */
  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Format timestamp as "Mon, 21 Feb" */
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  /** Format timestamp as "HH:MM" */
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  /** Today's date label: "Saturday, February 21" */
  function formatTodayLong() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }

  /** Group entries by calendar date */
  function groupByDate(entries) {
    const groups = {};
    entries.forEach((entry) => {
      const key = new Date(entry.createdAt).toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return groups;
  }

  /** Truncate text to maxLen characters */
  function truncate(text, maxLen = 120) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }

  /** Escape HTML to prevent XSS */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /** Show toast notification */
  function toast(message, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
  }

  /** Download a file to the user's device */
  function downloadFile(filename, content, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Capitalize first letter */
  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  /** Convert markdown-light syntax to HTML */
  function markdownToHTML(text) {
    if (!text) return '';
    let html = escapeHTML(text);

    // Headings
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Checkboxes
    html = html.replace(/^\[x\] (.+)$/gmi, '<label><input type="checkbox" checked disabled /> $1</label>');
    html = html.replace(/^\[ \] (.+)$/gm, '<label><input type="checkbox" disabled /> $1</label>');

    // Unordered list items
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br />');
    if (!html.startsWith('<h') && !html.startsWith('<ul')) {
      html = `<p>${html}</p>`;
    }

    return html;
  }

  /** Mood emoji map */
  const MOOD_EMOJI = {
    great: '😄', good: '🙂', okay: '😐', off: '😔', bad: '😞',
  };

  /** Capture type metadata */
  const CAPTURE_META = {
    idea: { tag: 'idea', mode: 'daily', label: '💡 Idea' },
    expense: { tag: 'expense', mode: 'daily', label: '💸 Expense' },
    coffee: { tag: 'coffee', mode: 'daily', label: '☕ Coffee' },
    quote: { tag: 'quote', mode: 'thinking', label: '❝ Quote' },
    reminder: { tag: 'reminder', mode: 'daily', label: '⏰ Reminder' },
    blank: { tag: '', mode: 'daily', label: 'Note' },
  };

  return {
    uid, formatDate, formatTime, formatTodayLong, groupByDate,
    truncate, escapeHTML, toast, downloadFile, capitalize,
    markdownToHTML, MOOD_EMOJI, CAPTURE_META,
  };
})();

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
const UINav = (() => {
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');
  const topBarTitle = document.getElementById('top-bar-title');

  let currentView = 'daily';

  /** Switch to a named view */
  function switchTo(viewName) {
    if (currentView === viewName) return;
    currentView = viewName;

    views.forEach((v) => {
      v.classList.toggle('hidden', v.dataset.view !== viewName);
    });

    navBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    const labels = { daily: 'Daily', projects: 'Projects', thinking: 'Thinking', search: 'Search' };
    topBarTitle.textContent = labels[viewName] || 'Dione OS';

    // Lazy-render views on first switch
    switch (viewName) {
      case 'daily': UIDaily.render(); break;
      case 'projects': UIProjects.render(); break;
      case 'thinking': UIThinking.render(); break;
      case 'search': UISearch.focus(); break;
    }
  }

  function init() {
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => switchTo(btn.dataset.view));
    });
  }

  function getCurrentView() { return currentView; }

  return { init, switchTo, getCurrentView };
})();

/* ═══════════════════════════════════════════════════════════
   DAILY VIEW
═══════════════════════════════════════════════════════════ */
const UIDaily = (() => {
  const timeline = document.getElementById('timeline');
  const todayLabel = document.getElementById('daily-today-label');
  const moodStripDaily = document.getElementById('mood-strip-daily');

  let _entries = [];

  /** Render the complete daily timeline */
  async function render() {
    todayLabel.textContent = Utils.formatTodayLong();

    // Load daily entries
    _entries = await DioneDB.getEntriesByMode('daily');
    renderTimeline(_entries);
  }

  function renderTimeline(entries) {
    if (entries.length === 0) {
      timeline.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📓</span>
          <p>No entries yet. Tap + to capture your first thought.</p>
        </div>`;
      return;
    }

    const groups = Utils.groupByDate(entries);
    timeline.innerHTML = '';

    Object.keys(groups).forEach((dateKey) => {
      const groupEntries = groups[dateKey];
      const ts = groupEntries[0].createdAt;
      const isToday = new Date(ts).toDateString() === new Date().toDateString();

      const groupEl = document.createElement('div');
      groupEl.className = 'timeline-date-group';

      const dateLabel = document.createElement('div');
      dateLabel.className = 'timeline-date-label';
      dateLabel.textContent = isToday ? 'Today' : Utils.formatDate(ts);
      groupEl.appendChild(dateLabel);

      groupEntries.forEach((entry) => {
        groupEl.appendChild(buildEntryCard(entry));
      });

      timeline.appendChild(groupEl);
    });
  }

  function buildEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.id = entry.id;
    card.dataset.pinned = entry.pinned ? 'true' : 'false';
    card.dataset.starred = entry.starred ? 'true' : 'false';

    const captureLabel = Utils.CAPTURE_META[entry.captureType]?.label || '';
    const moodEmoji = entry.mood ? Utils.MOOD_EMOJI[entry.mood] : '';
    const tagsHTML = (entry.tags || []).map((t) => `<span class="entry-card__tag">#${Utils.escapeHTML(t)}</span>`).join('');

    let metricsHTML = '';
    if (entry.sleepHours || entry.coffeeCount) {
      metricsHTML = `<div class="entry-card__metrics">
        ${entry.sleepHours ? `<span class="metric-badge">🌙 ${entry.sleepHours}h</span>` : ''}
        ${entry.coffeeCount ? `<span class="metric-badge">☕ ${entry.coffeeCount}</span>` : ''}
      </div>`;
    }

    card.innerHTML = `
      <div class="entry-card__meta">
        <span class="entry-card__type-tag">${Utils.escapeHTML(captureLabel)}</span>
        <span class="entry-card__time">${Utils.formatTime(entry.createdAt)}</span>
      </div>
      ${entry.title ? `<div class="entry-card__title">${Utils.escapeHTML(entry.title)}</div>` : ''}
      <div class="entry-card__body">${Utils.escapeHTML(Utils.truncate(entry.body))}</div>
      <div class="entry-card__footer">
        ${moodEmoji ? `<span class="entry-card__mood">${moodEmoji}</span>` : ''}
        ${tagsHTML}
        ${metricsHTML}
      </div>`;

    card.addEventListener('click', () => UIEntry.open(entry));
    return card;
  }

  /** Listen for mood strip taps to quick-log mood */
  function initMoodStrip() {
    moodStripDaily.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (!btn) return;
      moodStripDaily.querySelectorAll('.mood-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }

  return { render, renderTimeline, buildEntryCard, initMoodStrip };
})();

/* ═══════════════════════════════════════════════════════════
   PROJECTS VIEW
═══════════════════════════════════════════════════════════ */
const UIProjects = (() => {
  const projectsGridView = document.getElementById('projects-grid-view');
  const projectDetailView = document.getElementById('project-detail-view');
  const projectsGrid = document.getElementById('projects-grid');
  const projectEntryList = document.getElementById('project-entry-list');
  const projectDetailTitle = document.getElementById('project-detail-title');
  const projectDetailCount = document.getElementById('project-detail-count');
  const btnBack = document.getElementById('btn-back-projects');
  const btnNewProject = document.getElementById('btn-new-project');

  let _currentProjectId = null;

  /** Render the projects grid */
  async function render() {
    showGrid();
    const projects = await DioneDB.getAllProjects();
    renderGrid(projects);
  }

  function renderGrid(projects) {
    if (projects.length === 0) {
      projectsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <span class="empty-icon">📁</span>
          <p>No folders yet. Create your first one below.</p>
        </div>`;
      return;
    }

    projectsGrid.innerHTML = '';
    projects.forEach((project) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div>
          <div class="project-card__icon">${Utils.escapeHTML(project.icon || '📁')}</div>
          <div class="project-card__name">${Utils.escapeHTML(project.name)}</div>
        </div>
        <div class="project-card__meta">${Utils.escapeHTML(project.description || '')}</div>`;
      card.addEventListener('click', () => openProject(project));
      projectsGrid.appendChild(card);
    });
  }

  async function openProject(project) {
    _currentProjectId = project.id;
    projectDetailTitle.textContent = project.name;

    const entries = await DioneDB.getEntriesByProject(project.id);
    projectDetailCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;

    renderEntryList(entries, project);
    showDetail();
  }

  function renderEntryList(entries, project) {
    projectEntryList.innerHTML = '';

    if (entries.length === 0) {
      projectEntryList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">${Utils.escapeHTML(project.icon || '📁')}</span>
          <p>No entries in this folder yet.</p>
        </div>`;
      return;
    }

    entries.forEach((entry) => {
      const card = buildProjectEntryCard(entry);
      projectEntryList.appendChild(card);
    });
  }

  function buildProjectEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.pinned = entry.pinned ? 'true' : 'false';
    card.dataset.starred = entry.starred ? 'true' : 'false';

    const ratingClass = entry.rating ? `rating-${entry.rating}` : '';
    const ratingHTML = entry.rating
      ? `<span class="entry-card__rating ${ratingClass}">${Utils.capitalize(entry.rating)}</span>` : '';
    const tagsHTML = (entry.tags || []).map((t) => `<span class="entry-card__tag">#${Utils.escapeHTML(t)}</span>`).join('');

    card.innerHTML = `
      <div class="entry-card__meta">
        <span class="entry-card__type-tag">${Utils.formatDate(entry.createdAt)}</span>
        <span class="entry-card__time">${Utils.formatTime(entry.createdAt)}</span>
      </div>
      ${entry.title ? `<div class="entry-card__title">${Utils.escapeHTML(entry.title)}</div>` : ''}
      <div class="entry-card__body">${Utils.escapeHTML(Utils.truncate(entry.body))}</div>
      <div class="entry-card__footer">
        ${ratingHTML}
        ${tagsHTML}
      </div>`;

    card.addEventListener('click', () => UIEntry.open(entry));
    return card;
  }

  function showGrid() {
    projectsGridView.classList.remove('hidden');
    projectDetailView.classList.add('hidden');
  }

  function showDetail() {
    projectsGridView.classList.add('hidden');
    projectDetailView.classList.remove('hidden');
  }

  function getCurrentProjectId() { return _currentProjectId; }

  async function refreshCurrentProject() {
    if (!_currentProjectId) return;
    const project = await DioneDB.getProject(_currentProjectId);
    if (project) await openProject(project);
  }

  function init() {
    btnBack.addEventListener('click', () => render());
    btnNewProject.addEventListener('click', () => UIProjectNew.open());
  }

  return { render, openProject, showGrid, refreshCurrentProject, getCurrentProjectId, init };
})();

/* ═══════════════════════════════════════════════════════════
   THINKING VIEW
═══════════════════════════════════════════════════════════ */
const UIThinking = (() => {
  const listView = document.getElementById('thinking-list-view');
  const editorView = document.getElementById('thinking-editor-view');
  const thinkingList = document.getElementById('thinking-list');
  const btnBack = document.getElementById('btn-back-thinking');
  const btnNewThinking = document.getElementById('btn-new-thinking');
  const titleInput = document.getElementById('thinking-title-input');
  const bodyTextarea = document.getElementById('thinking-body');
  const btnSave = document.getElementById('btn-save-thinking');
  const btnStar = document.getElementById('btn-star-thinking');
  const btnPin = document.getElementById('btn-pin-thinking');
  const btnDelete = document.getElementById('btn-delete-thinking');
  const btnFocus = document.getElementById('btn-focus-mode');

  let _currentEntry = null;

  async function render() {
    showList();
    const entries = await DioneDB.getEntriesByMode('thinking');
    renderList(entries);
  }

  function renderList(entries) {
    thinkingList.innerHTML = '';

    if (entries.length === 0) {
      thinkingList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">✍️</span>
          <p>Long-form writing lives here. Manifesto, strategy, reflection.</p>
        </div>`;
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'thinking-card';
      card.dataset.pinned = entry.pinned ? 'true' : 'false';
      card.dataset.starred = entry.starred ? 'true' : 'false';

      const pinIcon = entry.pinned ? '📌 ' : '';
      const starIcon = entry.starred ? '★ ' : '';

      card.innerHTML = `
        <div class="thinking-card__title">${pinIcon}${starIcon}${Utils.escapeHTML(entry.title || 'Untitled')}</div>
        <div class="thinking-card__preview">${Utils.escapeHTML(Utils.truncate(entry.body, 100))}</div>
        <div class="thinking-card__meta">
          <span>${Utils.formatDate(entry.updatedAt || entry.createdAt)}</span>
          ${(entry.tags || []).map((t) => `<span>#${Utils.escapeHTML(t)}</span>`).join('')}
        </div>`;

      card.addEventListener('click', () => openEditor(entry));
      thinkingList.appendChild(card);
    });
  }

  function openEditor(entry) {
    _currentEntry = entry || {
      id: Utils.uid(),
      mode: 'thinking',
      title: '',
      body: '',
      tags: [],
      pinned: false,
      starred: false,
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    titleInput.value = _currentEntry.title || '';
    bodyTextarea.value = _currentEntry.body || '';

    updateToggleButtons();
    showEditor();
  }

  function updateToggleButtons() {
    if (!_currentEntry) return;
    btnStar.textContent = _currentEntry.starred ? 'UNSTAR' : 'STAR';
    btnPin.textContent = _currentEntry.pinned ? 'UNPIN' : 'PIN';
    btnDelete.classList.toggle('hidden', !_currentEntry.createdAt || Date.now() - _currentEntry.createdAt > 500);
  }

  async function saveCurrentEntry() {
    if (!_currentEntry) return;
    _currentEntry.title = titleInput.value.trim();
    _currentEntry.body = bodyTextarea.value;
    _currentEntry.updatedAt = Date.now();
    if (!_currentEntry.createdAt) _currentEntry.createdAt = Date.now();

    await DioneDB.saveEntry(_currentEntry);
    Utils.toast('Page saved');
    render();
  }

  function showList() {
    listView.classList.remove('hidden');
    editorView.classList.add('hidden');
  }

  function showEditor() {
    listView.classList.add('hidden');
    editorView.classList.remove('hidden');
  }

  function initToolbar() {
    document.querySelector('.thinking-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      applyToolbarAction(action);
    });
  }

  function applyToolbarAction(action) {
    const ta = bodyTextarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    let insert = '';

    switch (action) {
      case 'h1': insert = `# ${selected || 'Heading 1'}`; break;
      case 'h2': insert = `## ${selected || 'Heading 2'}`; break;
      case 'bold': insert = `**${selected || 'bold text'}**`; break;
      case 'ul': insert = `- ${selected || 'list item'}`; break;
      case 'checkbox': insert = `[ ] ${selected || 'task'}`; break;
      case 'focus':
        UIFocus.open(ta.value, (text) => { ta.value = text; });
        return;
    }

    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + insert.length;
    ta.focus();
  }

  function init() {
    btnBack.addEventListener('click', () => render());
    btnNewThinking.addEventListener('click', () => openEditor(null));
    btnSave.addEventListener('click', saveCurrentEntry);

    btnStar.addEventListener('click', async () => {
      if (!_currentEntry) return;
      _currentEntry.starred = !_currentEntry.starred;
      await DioneDB.saveEntry(_currentEntry);
      updateToggleButtons();
      Utils.toast(_currentEntry.starred ? 'Starred ★' : 'Unstarred');
    });

    btnPin.addEventListener('click', async () => {
      if (!_currentEntry) return;
      _currentEntry.pinned = !_currentEntry.pinned;
      await DioneDB.saveEntry(_currentEntry);
      updateToggleButtons();
      Utils.toast(_currentEntry.pinned ? 'Pinned 📌' : 'Unpinned');
    });

    btnDelete.addEventListener('click', async () => {
      if (!_currentEntry) return;
      if (!confirm('Delete this page?')) return;
      await DioneDB.deleteEntry(_currentEntry.id);
      Utils.toast('Page deleted');
      render();
    });

    initToolbar();
  }

  return { render, openEditor, init };
})();

/* ═══════════════════════════════════════════════════════════
   SEARCH VIEW
═══════════════════════════════════════════════════════════ */
const UISearch = (() => {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const filterChips = document.querySelectorAll('.filter-chip');

  let _activeFilter = 'all';
  let _debounceTimer = null;

  function focus() {
    setTimeout(() => searchInput.focus(), 300);
  }

  function buildFilter() {
    const filters = {};
    if (_activeFilter === 'pinned') filters.pinned = true;
    else if (_activeFilter === 'starred') filters.starred = true;
    else if (['daily', 'project', 'thinking'].includes(_activeFilter)) filters.mode = _activeFilter;
    return filters;
  }

  async function runSearch() {
    const q = searchInput.value.trim();
    const filters = buildFilter();
    const results = await DioneDB.searchEntries(q, filters);
    renderResults(results, q);
  }

  function renderResults(entries, q) {
    searchResults.innerHTML = '';

    if (entries.length === 0) {
      searchResults.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">◈</span>
          <p>${q ? `No results for "${Utils.escapeHTML(q)}"` : 'Type to search your field notes'}</p>
        </div>`;
      return;
    }

    entries.forEach((entry) => {
      let card;
      if (entry.mode === 'project') {
        card = UIProjects.buildProjectEntryCard ? document.createElement('div') : document.createElement('div');
      }
      card = UIDaily.buildEntryCard(entry);
      searchResults.appendChild(card);
    });
  }

  function init() {
    searchInput.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(runSearch, 220);
    });

    filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        _activeFilter = chip.dataset.filter;
        runSearch();
      });
    });
  }

  return { init, focus, runSearch };
})();

/* ═══════════════════════════════════════════════════════════
   QUICK CAPTURE SHEET
═══════════════════════════════════════════════════════════ */
const UICapture = (() => {
  const overlay = document.getElementById('capture-overlay');
  const fab = document.getElementById('fab');
  const btnClose = document.getElementById('btn-close-capture');

  function open() {
    overlay.classList.remove('hidden');
    overlay.addEventListener('click', onOverlayClick);
  }

  function close() {
    overlay.classList.add('hidden');
    overlay.removeEventListener('click', onOverlayClick);
  }

  function onOverlayClick(e) {
    if (e.target === overlay) close();
  }

  function init() {
    fab.addEventListener('click', open);
    btnClose.addEventListener('click', close);

    overlay.querySelectorAll('.capture-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        close();
        // Determine mode and prefill
        const meta = Utils.CAPTURE_META[type] || Utils.CAPTURE_META.blank;
        const currentView = UINav.getCurrentView();
        const projectId = currentView === 'projects' ? UIProjects.getCurrentProjectId() : null;
        const mode = projectId ? 'project' : meta.mode;
        UIEntry.openNew({ mode, projectId, captureType: type, defaultTag: meta.tag });
      });
    });
  }

  return { init, open, close };
})();

/* ═══════════════════════════════════════════════════════════
   ENTRY EDITOR SHEET
═══════════════════════════════════════════════════════════ */
const UIEntry = (() => {
  const overlay = document.getElementById('entry-overlay');
  const btnClose = document.getElementById('btn-close-entry');
  const sheetTitle = document.getElementById('entry-sheet-title');

  // Form fields
  const entryId = document.getElementById('entry-id');
  const entryModeInput = document.getElementById('entry-mode');
  const entryProjectId = document.getElementById('entry-project-id');
  const entryCaptureType = document.getElementById('entry-capture-type');
  const titleInput = document.getElementById('entry-title');
  const bodyInput = document.getElementById('entry-body');
  const moodSelector = document.getElementById('mood-selector');
  const moodGroup = document.getElementById('mood-group');
  const ratingGroup = document.getElementById('rating-group');
  const ratingSelector = document.getElementById('rating-selector');
  const tagsChips = document.getElementById('tags-chips');
  const tagsInput = document.getElementById('tags-input');
  const metricsGroup = document.getElementById('metrics-group');
  const sleepInput = document.getElementById('metric-sleep');
  const coffeeInput = document.getElementById('metric-coffee');
  const attachmentGroup = document.getElementById('attachment-group');
  const attachmentInput = document.getElementById('attachment-input');
  const attachmentsPreview = document.getElementById('attachments-preview');
  const btnSave = document.getElementById('btn-save-entry');
  const btnPin = document.getElementById('btn-pin-entry');
  const btnStar = document.getElementById('btn-star-entry');
  const btnDelete = document.getElementById('btn-delete-entry');

  let _state = {
    id: '',
    mode: 'daily',
    projectId: null,
    captureType: '',
    pinned: false,
    starred: false,
    mood: null,
    rating: null,
    tags: [],
    attachments: [], // stored as base64 data URLs
  };

  // ── Open existing entry ─────────────────────────────────
  function open(entry) {
    _state = {
      id: entry.id,
      mode: entry.mode,
      projectId: entry.projectId || null,
      captureType: entry.captureType || '',
      pinned: !!entry.pinned,
      starred: !!entry.starred,
      mood: entry.mood || null,
      rating: entry.rating || null,
      tags: [...(entry.tags || [])],
      attachments: [...(entry.attachments || [])],
    };

    sheetTitle.textContent = 'Edit Entry';
    titleInput.value = entry.title || '';
    bodyInput.value = entry.body || '';
    sleepInput.value = entry.sleepHours || '';
    coffeeInput.value = entry.coffeeCount || '';

    renderTags();
    renderAttachments();
    setMoodUI(_state.mood);
    setRatingUI(_state.rating);
    updateToggleUI();
    configureGroups(_state.mode);
    btnDelete.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }

  // ── Open new entry ──────────────────────────────────────
  function openNew({ mode, projectId, captureType, defaultTag } = {}) {
    _state = {
      id: Utils.uid(),
      mode: mode || 'daily',
      projectId: projectId || null,
      captureType: captureType || '',
      pinned: false,
      starred: false,
      mood: null,
      rating: null,
      tags: defaultTag ? [defaultTag] : [],
      attachments: [],
    };

    const labelMap = {
      idea: '💡 New Idea', expense: '💸 Expense', coffee: '☕ Coffee Recipe',
      quote: '❝ New Quote', reminder: '⏰ Reminder', blank: 'New Entry',
    };
    sheetTitle.textContent = labelMap[captureType] || 'New Entry';
    titleInput.value = '';
    bodyInput.value = '';
    sleepInput.value = '';
    coffeeInput.value = '';

    renderTags();
    renderAttachments();
    setMoodUI(null);
    setRatingUI(null);
    updateToggleUI();
    configureGroups(_state.mode);
    btnDelete.classList.add('hidden');
    overlay.classList.remove('hidden');

    setTimeout(() => bodyInput.focus(), 350);
  }

  // ── Configure visible groups based on mode ──────────────
  function configureGroups(mode) {
    moodGroup.classList.toggle('hidden', mode === 'project');
    ratingGroup.classList.toggle('hidden', mode !== 'project');
    metricsGroup.classList.toggle('hidden', mode !== 'daily');
    attachmentGroup.classList.toggle('hidden', mode !== 'project');
  }

  // ── Mood UI ─────────────────────────────────────────────
  function setMoodUI(mood) {
    moodSelector.querySelectorAll('.mood-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.mood === mood);
    });
  }

  // ── Rating UI ───────────────────────────────────────────
  function setRatingUI(rating) {
    ratingSelector.querySelectorAll('.rating-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.rating === rating);
    });
  }

  // ── Toggle pin/star button labels ───────────────────────
  function updateToggleUI() {
    btnPin.textContent = _state.pinned ? 'UNPIN' : 'PIN';
    btnStar.textContent = _state.starred ? 'UNSTAR' : 'STAR';
    btnPin.classList.toggle('btn--active-pin', _state.pinned);
    btnStar.classList.toggle('btn--active-star', _state.starred);
  }

  // ── Tags ────────────────────────────────────────────────
  function renderTags() {
    tagsChips.innerHTML = '';
    _state.tags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `#${Utils.escapeHTML(tag)} <span class="tag-chip__remove" data-index="${i}">×</span>`;
      tagsChips.appendChild(chip);
    });

    tagsChips.querySelectorAll('.tag-chip__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        _state.tags.splice(parseInt(btn.dataset.index), 1);
        renderTags();
      });
    });
  }

  // ── Attachments ─────────────────────────────────────────
  function renderAttachments() {
    attachmentsPreview.innerHTML = '';
    _state.attachments.forEach((src) => {
      const img = document.createElement('img');
      img.className = 'attachment-thumb';
      img.src = src;
      img.alt = 'Attachment';
      attachmentsPreview.appendChild(img);
    });
  }

  // ── Save ────────────────────────────────────────────────
  async function save() {
    const body = bodyInput.value.trim();
    if (!body && !titleInput.value.trim()) {
      Utils.toast('Please write something first');
      return;
    }

    const entry = {
      id: _state.id,
      mode: _state.mode,
      projectId: _state.projectId || null,
      captureType: _state.captureType,
      title: titleInput.value.trim(),
      body,
      mood: _state.mood,
      rating: _state.rating,
      tags: _state.tags,
      attachments: _state.attachments,
      sleepHours: sleepInput.value ? parseFloat(sleepInput.value) : null,
      coffeeCount: coffeeInput.value ? parseInt(coffeeInput.value) : null,
      pinned: _state.pinned,
      starred: _state.starred,
      createdAt: _state.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Preserve original createdAt if editing
    if (!entry.createdAt) entry.createdAt = Date.now();

    await DioneDB.saveEntry(entry);
    Utils.toast('Saved ✓');
    close();
    refreshCurrentView();
  }

  // ── Delete ──────────────────────────────────────────────
  async function deleteEntry() {
    if (!confirm('Delete this entry?')) return;
    await DioneDB.deleteEntry(_state.id);
    Utils.toast('Deleted');
    close();
    refreshCurrentView();
  }

  // ── Close sheet ─────────────────────────────────────────
  function close() {
    overlay.classList.add('hidden');
  }

  // ── Refresh the currently visible view ──────────────────
  function refreshCurrentView() {
    const view = UINav.getCurrentView();
    if (view === 'daily') UIDaily.render();
    else if (view === 'projects') UIProjects.refreshCurrentProject();
    else if (view === 'search') UISearch.runSearch();
  }

  // ── Init event listeners ────────────────────────────────
  function init() {
    btnClose.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    btnSave.addEventListener('click', save);
    btnDelete.addEventListener('click', deleteEntry);

    btnPin.addEventListener('click', () => {
      _state.pinned = !_state.pinned;
      updateToggleUI();
    });

    btnStar.addEventListener('click', () => {
      _state.starred = !_state.starred;
      updateToggleUI();
    });

    // Mood selection
    moodSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (!btn) return;
      _state.mood = _state.mood === btn.dataset.mood ? null : btn.dataset.mood;
      setMoodUI(_state.mood);
    });

    // Rating selection
    ratingSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.rating-btn');
      if (!btn) return;
      _state.rating = _state.rating === btn.dataset.rating ? null : btn.dataset.rating;
      setRatingUI(_state.rating);
    });

    // Tag input
    tagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = tagsInput.value.trim().replace(/^#/, '').toLowerCase();
        if (tag && !_state.tags.includes(tag)) {
          _state.tags.push(tag);
          renderTags();
        }
        tagsInput.value = '';
      }
    });

    // Attachment upload
    attachmentInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _state.attachments.push(ev.target.result);
          renderAttachments();
        };
        reader.readAsDataURL(file);
      });
      attachmentInput.value = '';
    });
  }

  return { init, open, openNew, close };
})();

/* ═══════════════════════════════════════════════════════════
   NEW PROJECT SHEET
═══════════════════════════════════════════════════════════ */
const UIProjectNew = (() => {
  const overlay = document.getElementById('project-overlay');
  const btnClose = document.getElementById('btn-close-project');
  const nameInput = document.getElementById('project-name-input');
  const descInput = document.getElementById('project-desc-input');
  const btnSave = document.getElementById('btn-save-project');

  const PROJECT_ICONS = ['📁', '☕', '🌿', '⌨️', '🧪', '✈️', '📸', '💡', '📐', '🎯', '🔬', '🎨'];

  function open() {
    nameInput.value = '';
    descInput.value = '';
    overlay.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 300);
  }

  function close() {
    overlay.classList.add('hidden');
  }

  async function save() {
    const name = nameInput.value.trim();
    if (!name) { Utils.toast('Enter a folder name'); return; }

    const icon = PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)];
    const project = {
      id: Utils.uid(),
      name,
      icon,
      description: descInput.value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await DioneDB.saveProject(project);
    Utils.toast('Folder created');
    close();
    UIProjects.render();
  }

  function init() {
    btnClose.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    btnSave.addEventListener('click', save);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }

  return { init, open, close };
})();

/* ═══════════════════════════════════════════════════════════
   FOCUS MODE
═══════════════════════════════════════════════════════════ */
const UIFocus = (() => {
  const overlay = document.getElementById('focus-overlay');
  const textarea = document.getElementById('focus-textarea');
  const wordCount = document.getElementById('focus-word-count');
  const btnExit = document.getElementById('btn-exit-focus');

  let _onClose = null;

  function open(initialText, onClose) {
    _onClose = onClose;
    textarea.value = initialText || '';
    updateWordCount();
    overlay.classList.remove('hidden');
    setTimeout(() => textarea.focus(), 200);
  }

  function close() {
    overlay.classList.add('hidden');
    if (_onClose) _onClose(textarea.value);
    _onClose = null;
  }

  function updateWordCount() {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    wordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  }

  function init() {
    btnExit.addEventListener('click', close);
    textarea.addEventListener('input', updateWordCount);

    // ESC key exits focus mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
    });
  }

  return { init, open, close };
})();

/* ═══════════════════════════════════════════════════════════
   EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */
const UIBackup = (() => {
  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const importInput = document.getElementById('import-file-input');

  async function exportData() {
    try {
      const data = await DioneDB.exportData();
      const json = JSON.stringify(data, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      Utils.downloadFile(`dione-os-backup-${date}.json`, json);
      Utils.toast('Backup exported ✓');
    } catch (err) {
      console.error('[Export] Error:', err);
      Utils.toast('Export failed');
    }
  }

  async function importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await DioneDB.importData(data);
      Utils.toast(`Imported ${data.entries.length} entries ✓`);

      // Refresh current view
      const view = UINav.getCurrentView();
      if (view === 'daily') UIDaily.render();
      else if (view === 'projects') UIProjects.render();
      else if (view === 'thinking') UIThinking.render();
    } catch (err) {
      console.error('[Import] Error:', err);
      Utils.toast('Import failed – invalid file');
    }
  }

  function init() {
    btnExport.addEventListener('click', exportData);
    btnImport.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      importData(file);
      importInput.value = '';
    });
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER REGISTRATION
═══════════════════════════════════════════════════════════ */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((reg) => console.log('[SW] Registered, scope:', reg.scope))
        .catch((err) => console.warn('[SW] Registration failed:', err));
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   APP INIT
═══════════════════════════════════════════════════════════ */
const App = (() => {
  async function init() {
    try {
      // Open DB & seed defaults
      await DioneDB.openDB();
      await DioneDB.seedDefaultProjects();

      // Init all modules
      UINav.init();
      UIDaily.initMoodStrip();
      UIProjects.init();
      UIThinking.init();
      UISearch.init();
      UICapture.init();
      UIEntry.init();
      UIProjectNew.init();
      UIFocus.init();
      UIBackup.init();

      // Render initial view
      UIDaily.render();

      // Register PWA service worker
      registerServiceWorker();

      console.log('[Dione OS] Ready ◈');
    } catch (err) {
      console.error('[Dione OS] Init error:', err);
    }
  }

  return { init };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', App.init);
