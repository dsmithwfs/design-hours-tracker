// ── Toast notification ─────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 4000, action = null) {
  let toast = document.getElementById('dht-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dht-toast';
    document.body.appendChild(toast);
  }
  clearTimeout(_toastTimer);
  toast.innerHTML = '';
  const msgEl = document.createElement('span');
  msgEl.className = 'dht-toast-msg';
  msgEl.textContent = msg;
  toast.appendChild(msgEl);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'dht-toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.fn(); toast.className = 'dht-toast'; });
    toast.appendChild(btn);
  }
  toast.className = 'dht-toast dht-toast-in';
  _toastTimer = setTimeout(() => { toast.className = 'dht-toast'; }, duration);
}

function showUpdateReadyBanner() {
  let banner = document.getElementById('dht-update-banner');
  if (banner) return; // already showing
  banner = document.createElement('div');
  banner.id = 'dht-update-banner';
  banner.innerHTML = `
    <span>⬇ Update downloaded and ready to install.</span>
    <button id="dht-update-restart-btn">Restart Now</button>
    <button id="dht-update-later-btn">Later</button>`;
  document.body.prepend(banner);
  document.getElementById('dht-update-restart-btn').addEventListener('click', () => {
    window.electronAPI.installUpdate();
  });
  document.getElementById('dht-update-later-btn').addEventListener('click', () => {
    banner.remove();
  });
}

// ── Theme ──────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('dht_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const picker = document.getElementById('themePicker');
  picker.value = saved;
  picker.addEventListener('change', () => applyThemeWithAnimation(picker.value));
})();

// ── Constants ─────────────────────────────────────────────────────────────
const SPECIAL_LABELS = { PTO:'PTO', HOL:'Holiday', TRG:'Training', MTG:'Design Meeting', BRV:'Bereavement' };

// True only on devices with a real hover pointer (desktop). The calendar's
// hover-preview popup relies on mouseenter/mouseleave, which touch devices
// fire unreliably — a tap shows it but nothing dismisses it. On touch, the
// tap already selects the day and opens the day panel, so we skip the popup.
const HOVER_CAPABLE = typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const THEME_COLORS = {
  light:     { bg:'#f5f6fa', surface:'#ffffff', border:'#dde1ec', primary:'#3b6fd4', text:'#1e2235' },
  dark:      { bg:'#12131a', surface:'#1e2030', border:'#2e3147', primary:'#5b8ef0', text:'#e0e4f5' },
  slate:     { bg:'#1a1f2e', surface:'#232940', border:'#323a58', primary:'#7c9ef5', text:'#cdd5f0' },
  forest:    { bg:'#f0f5f0', surface:'#ffffff', border:'#c8ddc8', primary:'#2e7d46', text:'#1a2e1e' },
  amber:     { bg:'#fdf8ef', surface:'#ffffff', border:'#e8d9b8', primary:'#b36a00', text:'#2e1f00' },
  rose:      { bg:'#fff5f7', surface:'#ffffff', border:'#f0ccd4', primary:'#c0394a', text:'#2e1018' },
  vaporwave: { bg:'#0d0d1a', surface:'#13102a', border:'#2e1f5e', primary:'#ff71ce', text:'#e8d5ff' },
};

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  get entries() { return JSON.parse(localStorage.getItem('dht_entries') || '{}'); },
  set entries(v) { localStorage.setItem('dht_entries', JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); },
  get rates() { return JSON.parse(localStorage.getItem('dht_rates') || '[]'); },
  set rates(v) { localStorage.setItem('dht_rates', JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); },
  get jobs() {
    const raw = JSON.parse(localStorage.getItem('dht_jobs') || '[]');
    // Migrate legacy formats to { number, name, budget }
    return raw.map(j => {
      if (typeof j === 'string') return { number: '', name: j, budget: null };
      if (!('number' in j)) return { number: '', startingHours: 0, ...j };
      return j;
    });
  },
  set jobs(v) { localStorage.setItem('dht_jobs', JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); },
  get mileage() { return JSON.parse(localStorage.getItem('dht_mileage') || '{}'); },
  set mileage(v) { localStorage.setItem('dht_mileage', JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); },
  get expenses() { return JSON.parse(localStorage.getItem('dht_expenses') || '{}'); },
  set expenses(v) { localStorage.setItem('dht_expenses', JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); },
};

let currentYear, currentMonth, selectedDate = null, currentWeekStart = null;
let _showArchivedJobs = false;

// ── Init ───────────────────────────────────────────────────────────────────
(function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  if (!S.jobs.length) S.jobs = [{ number: '', name: 'General', budget: null }];

  // Set week start to Monday of current week
  currentWeekStart = mondayOf(new Date());

  document.getElementById('prevMonth').addEventListener('click', () => navigate(-1));
  document.getElementById('nextMonth').addEventListener('click', () => navigate(1));
  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
    selectDate(toKey(now));
  });

  // Tab switching is now handled by sidebar nav items above.

  document.getElementById('addRateBtn').addEventListener('click', addRate);
  document.getElementById('newRateLabel').addEventListener('keydown', e => { if (e.key === 'Enter') addRate(); });
  document.getElementById('newRateValue').addEventListener('keydown', e => { if (e.key === 'Enter') addRate(); });

  document.getElementById('addJobBtn').addEventListener('click', addJob);
  document.getElementById('newJobNumber').addEventListener('keydown', e => { if (e.key === 'Enter') addJob(); });
  document.getElementById('newJobInput').addEventListener('keydown', e => { if (e.key === 'Enter') addJob(); });
  document.getElementById('importJobsBtn').addEventListener('click', () => document.getElementById('importJobsFile').click());
  document.getElementById('importJobsFile').addEventListener('change', handleJobImportFile);
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  document.getElementById('exportJson').addEventListener('click', exportJson);
  document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);
  document.getElementById('importBackupBtn').addEventListener('click', importBackup);
  document.getElementById('exportTimesheetBtn').addEventListener('click', () => {
    if (window.electronAPI) openWeekPickerModal('Export Timesheet', ws => exportTimesheetJson(ws), 'Export Week to Timesheet');
    else exportTimesheetJson();
  });
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => openPdfWeekPicker());
  document.getElementById('addMileageBtn').addEventListener('click', addMileageEntry);
  document.getElementById('addExpenseBtn').addEventListener('click', addExpenseEntry);

  // ── PDF export button: Electron (Excel) OR the webapp (pdf-lib in browser)
  if (window.electronAPI || window.generateTimesheetPdfInBrowser) {
    const pdfBtn = document.getElementById('exportPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
  }



  // ── Offline indicator
  initOfflineDot();

  // ── Backup reminder
  initBackupNudge();

  // ── Web/mobile daily reminder
  if (!window.electronAPI) initWebReminder();

  // ── Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      const title = btn.dataset.title || '';

      document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('topbarTitle').textContent = title;

      // Show/hide month nav (only relevant on hours view)
      const monthNav = document.querySelector('.topbar-month-nav');
      const todayBtn = document.getElementById('todayBtn');
      const addBtn   = document.getElementById('topbarAddBtn');
      const isHours  = view === 'hours';
      if (monthNav) monthNav.style.display = isHours ? '' : 'none';
      if (todayBtn) todayBtn.style.display  = isHours ? '' : 'none';
      if (addBtn)   addBtn.style.display    = isHours ? '' : 'none';

      document.querySelectorAll('.body-view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
      });
      const target = document.getElementById(`view-${view}`);
      if (target) {
        target.style.display = '';
        requestAnimationFrame(() => target.classList.add('active'));
      }

      if (view === 'week')      renderWeeklySummary();
      if (view === 'notes')     renderNotes();
      if (view === 'map')       setTimeout(renderMap, 150);
      if (view === 'dashboard') setTimeout(renderDashboard, 60);
    });
  });

  // ── Topbar add button: focus side panel / scroll to form
  document.getElementById('topbarAddBtn')?.addEventListener('click', () => {
    const today = toKey(new Date());
    if (selectedDate !== today) selectDate(today);
    document.querySelector('#sideContent input, #sideContent select')?.focus();
  });

  // ── Settings panel (Electron only)
  if (window.electronAPI) {
    const toggleBtn  = document.getElementById('settingsToggleBtn');
    const panel      = document.getElementById('settingsPanel');
    const timeInput  = document.getElementById('reminderTime');
    const clearBtn   = document.getElementById('clearReminderBtn');
    const track      = document.getElementById('autoStartTrack');
    const saveBtn    = document.getElementById('saveSettingsBtn');
    const savedLabel = document.getElementById('settingsSaved');
    let autoStart    = false;

    window.electronAPI.getVersion().then(v => {
      const el = document.getElementById('electronVersion');
      if (el) el.textContent = 'v' + v;
      const badge = document.getElementById('versionBtn');
      if (badge) { badge.textContent = 'v' + v; badge.style.display = ''; }
      // Update sidebar user display
      const nameStored = localStorage.getItem('dht_designer_name');
      if (nameStored) {
        const el2 = document.getElementById('sidebarUserName');
        if (el2) el2.textContent = nameStored;
        const av = document.getElementById('sidebarAvatar');
        if (av) av.textContent = nameStored.charAt(0).toUpperCase();
      }
    });

    window.electronAPI.getSettings().then(s => {
      if (s.reminderTime) timeInput.value = s.reminderTime;
      autoStart = !!s.autoStart;
      track.classList.toggle('on', autoStart);
    });

    const nameInput = document.getElementById('designerNameInput');
    const empInput  = document.getElementById('employeeNumInput');
    if (nameInput) {
      nameInput.value = localStorage.getItem('dht_designer_name') || '';
      nameInput.addEventListener('input', () => {
        localStorage.setItem('dht_designer_name', nameInput.value);
        const el2 = document.getElementById('sidebarUserName');
        if (el2) el2.textContent = nameInput.value || 'Designer';
        const av = document.getElementById('sidebarAvatar');
        if (av) av.textContent = (nameInput.value || 'D').charAt(0).toUpperCase();
      });
    }
    if (empInput) {
      empInput.value = localStorage.getItem('dht_employee_num') || '';
      empInput.addEventListener('input', () => localStorage.setItem('dht_employee_num', empInput.value));
    }

    toggleBtn?.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== toggleBtn) panel.classList.remove('open');
    });

    clearBtn?.addEventListener('click', () => { timeInput.value = ''; });

    track?.addEventListener('click', () => {
      autoStart = !autoStart;
      track.classList.toggle('on', autoStart);
    });

    saveBtn?.addEventListener('click', async () => {
      await window.electronAPI.saveSettings({ reminderTime: timeInput.value || null, autoStart });
      savedLabel.textContent = 'Saved!';
      setTimeout(() => { savedLabel.textContent = ''; panel.classList.remove('open'); }, 1500);
    });

    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
      checkUpdateBtn.addEventListener('click', async () => {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.textContent = 'Checking…';
        const result = await window.electronAPI.checkForUpdates();
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = 'Check for updates';
        if (result === 'latest')         showToast('You\'re on the latest version.', 4000);
        else if (result === 'available') showToast('Update found — downloading…', 5000);
        else if (result === 'dev')       showToast('Running in dev mode — updates disabled.', 4000);
        else if (result === 'checking')  showToast('Already checking for updates…', 3000);
        else showToast('Could not check for updates. Check your connection.', 5000);
      });
    }

    // Listen for update-downloaded from main process and show in-app prompt
    if (window.electronAPI.onUpdateDownloaded) {
      window.electronAPI.onUpdateDownloaded(() => showUpdateReadyBanner());
    }
    if (window.electronAPI.onUpdateError) {
      window.electronAPI.onUpdateError(msg => showToast('Update error: ' + msg, 6000));
    }

    // Show PDF export in sidebar
    const pdfBtn = document.getElementById('exportPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
  }

  // Wire static HTML elements that previously used inline onclick
  document.getElementById('versionBtn')?.addEventListener('click', showChangelog);
  document.getElementById('changelogBackdrop')?.addEventListener('click', hideChangelog);
  document.getElementById('changelogCloseBtn')?.addEventListener('click', hideChangelog);
  document.querySelectorAll('.sync-signin-btn').forEach(el => el.addEventListener('click', () => window.openSyncModal?.()));
  document.querySelectorAll('.sync-signout-btn').forEach(el => el.addEventListener('click', () => window.syncSignOut?.()));

  // Event delegation for dynamically rendered content
  document.addEventListener('click', function(e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var a = t.dataset.action;
    var idx = t.dataset.idx !== undefined ? +t.dataset.idx : 0;
    var key = t.dataset.key || '';
    if (a === 'show-help')           showHelp();
    else if (a === 'open-note')      openNoteEditor(t.dataset.id);
    else if (a === 'del-note')       deleteNote(t.dataset.id);
    else if (a === 'toggle-job-notes') toggleJobNotes(idx);
    else if (a === 'geocode-job')    geocodeJobAddress(idx);
    else if (a === 'show-entry')     showEntryDetail(key, idx);
    else if (a === 'del-entry')   deleteEntry(key, idx);
    else if (a === 'edit-job')    openJobEdit(idx);
    else if (a === 'rm-job')      removeJob(idx);
    else if (a === 'set-budget')  setBudget(idx);
    else if (a === 'save-budget') saveBudget(idx);
    else if (a === 'cancel-job-edit') renderJobsList();
    else if (a === 'save-job-edit')   saveJobEdit(idx);
    else if (a === 'archive-job')     archiveJob(idx);
    else if (a === 'unarchive-job')   unarchiveJob(idx);
    else if (a === 'duplicate-job')   duplicateJob(idx);
    else if (a === 'rm-rate')     removeRate(idx);
    else if (a === 'save-rate')   saveRate(idx);
  });

  document.addEventListener('focusout', function(e) {
    if (e.target.classList.contains('job-notes-input')) {
      const i = +e.target.dataset.idx;
      const jobs = S.jobs;
      if (jobs[i]) { jobs[i].notes = e.target.value; S.jobs = jobs; }
    }
  });

  renderCalendar();
  renderSummary();
  renderStatStrip();
  renderRightColJobs();
  renderWeeklySummary();
  renderJobsList();
  renderRates();
  applyCustomSelects();
})();

// ── Helpers ────────────────────────────────────────────────────────────────
function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function navigate(dir) {
  const grid = document.getElementById('calGrid');
  const outClass = dir > 0 ? 'slide-out-left' : 'slide-out-right';
  const inClass  = dir > 0 ? 'slide-in-left'  : 'slide-in-right';
  grid.classList.add(outClass);
  setTimeout(() => {
    grid.classList.remove(outClass);
    currentMonth += dir;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
    renderCalendar();
    renderSummary();
    renderStatStrip();
    renderRightColJobs();
    grid.classList.add(inClass);
    setTimeout(() => grid.classList.remove(inClass), 200);
  }, 150);
}

// dayTotalHours() now lives in calc.js (loaded before this file).

// ── Stat strip ─────────────────────────────────────────────────────────────
function renderStatStrip() {
  const allEntries = S.entries;
  const now = new Date();

  // Month total
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
  let monthTotal = 0;
  for (const [key, entries] of Object.entries(allEntries)) {
    if (key.startsWith(monthPrefix)) monthTotal += dayTotalHours(entries);
  }

  // Week total
  const weekStart = new Date(currentWeekStart);
  let weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const k = toKey(d);
    weekTotal += dayTotalHours(allEntries[k] || []);
  }

  // Mileage this month
  const allMileage = S.mileage;
  let mileTotal = 0;
  for (const [key, rows] of Object.entries(allMileage)) {
    if (key.startsWith(monthPrefix)) rows.forEach(r => { mileTotal += parseFloat(r.miles) || 0; });
  }

  // Expenses this month
  const allExpenses = S.expenses;
  let expTotal = 0;
  for (const [key, rows] of Object.entries(allExpenses)) {
    if (key.startsWith(monthPrefix)) rows.forEach(r => { expTotal += parseFloat(r.amount) || 0; });
  }

  const fmt = v => v % 1 === 0 ? v + ' h' : v.toFixed(1) + ' h';
  const statMonth = document.getElementById('statMonth');
  const statWeek  = document.getElementById('statWeek');
  const statMile  = document.getElementById('statMileage');
  const statExp   = document.getElementById('statExpenses');
  if (statMonth) { statMonth.textContent = fmt(monthTotal); statMonth.className = 'stat-value' + (monthTotal > 0 ? ' highlight' : ''); }
  if (statWeek)  statWeek.textContent  = fmt(weekTotal);
  if (statMile)  statMile.textContent  = mileTotal > 0 ? mileTotal.toFixed(0) + ' mi' : '—';
  if (statExp)   statExp.textContent   = expTotal > 0 ? '$' + expTotal.toFixed(0) : '—';
}

// ── Right-col jobs list ─────────────────────────────────────────────────────
function renderRightColJobs() {
  const el = document.getElementById('rightColJobs');
  if (!el) return;
  const allEntries = S.entries;
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
  const totals = {};
  for (const [key, entries] of Object.entries(allEntries)) {
    if (!key.startsWith(monthPrefix)) continue;
    entries.forEach(e => {
      const name = e.job || e.type || 'Other';
      totals[name] = (totals[name] || 0) + (parseFloat(e.hours) || 0);
    });
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!sorted.length) { el.innerHTML = ''; return; }
  const COLORS = ['#185FA5','#d4720a','#7b4fb8','#2e8b4a','#1a8a8a','#c83030','#a07800','#4040c8'];
  el.innerHTML = `<div class="rcj-label">Jobs this month</div>` +
    sorted.map(([name, hrs], i) => {
      const h = hrs % 1 === 0 ? hrs + ' h' : hrs.toFixed(1) + ' h';
      return `<div class="rcj-row"><div class="rcj-dot" style="background:${COLORS[i % COLORS.length]}"></div><span class="rcj-name">${name}</span><span class="rcj-hrs">${h}</span></div>`;
    }).join('');
}

function jobLifetimeHours(jobName) {
  const job = S.jobs.find(j => jobKey(j) === jobName);
  const starting = job ? (parseFloat(job.startingHours) || 0) : 0;
  const logged = Object.values(S.entries).flat().reduce((s, e) => {
    return e.job === jobName ? s + (parseFloat(e.hours) || 0) : s;
  }, 0);
  return starting + logged;
}

// esc(), jobLabel(), jobKey(), jobGroup(), jobColorIndex(), mondayOf(), and
// localISODate() now live in calc.js (loaded before this file).

function buildJobOptions() {
  const groups = { '181': [], '187': [], other: [] };
  const sorted = [...S.jobs].sort((a, b) => {
    if (!a.number && !b.number) return 0;
    if (!a.number) return 1;
    if (!b.number) return -1;
    return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
  });
  sorted.forEach(j => groups[jobGroup(j)].push(j));
  let html = '';
  if (groups['181'].length) {
    html += `<optgroup label="181 – Contract">${groups['181'].map(j => `<option value="${esc(jobKey(j))}">${esc(jobLabel(j))}</option>`).join('')}</optgroup>`;
  }
  if (groups['187'].length) {
    html += `<optgroup label="187 – Express">${groups['187'].map(j => `<option value="${esc(jobKey(j))}">${esc(jobLabel(j))}</option>`).join('')}</optgroup>`;
  }
  if (groups.other.length) {
    html += `<optgroup label="Other">${groups.other.map(j => `<option value="${esc(jobKey(j))}">${esc(jobLabel(j))}</option>`).join('')}</optgroup>`;
  }
  return html;
}

// ── US Holidays ────────────────────────────────────────────────────────────
function getUSHolidays(year) {
  const h = {};
  const key = (m, d) => `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const nthWeekday = (month, nth, dow) => {
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (d.getMonth() === month - 1) {
      if (d.getDay() === dow && ++count === nth) return d.getDate();
      d.setDate(d.getDate() + 1);
    }
  };
  const lastWeekday = (month, dow) => {
    const d = new Date(year, month, 0);
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
    return d.getDate();
  };
  const observed = (month, day) => {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0) return key(month, day + 1);
    if (dow === 6) {
      // Saturday: observe on Friday — use Date to handle month boundary (e.g. Jan 1)
      const fri = new Date(year, month - 1, day - 1);
      return `${fri.getFullYear()}-${String(fri.getMonth()+1).padStart(2,'0')}-${String(fri.getDate()).padStart(2,'0')}`;
    }
    return key(month, day);
  };
  h[observed(1,  1)]                  = "New Year's Day";
  h[key(1, nthWeekday(1, 3, 1))]     = 'MLK Day';
  h[key(2, nthWeekday(2, 3, 1))]     = "Presidents' Day";
  h[key(5, lastWeekday(5, 1))]        = 'Memorial Day';
  h[observed(6, 19)]                  = 'Juneteenth';
  h[observed(7,  4)]                  = 'Independence Day';
  h[key(9, nthWeekday(9, 1, 1))]     = 'Labor Day';
  h[key(10, nthWeekday(10, 2, 1))]   = 'Columbus Day';
  h[observed(11, 11)]                 = 'Veterans Day';
  h[key(11, nthWeekday(11, 4, 4))]   = 'Thanksgiving';
  h[observed(12, 25)]                 = 'Christmas Day';
  return h;
}

// ── Calendar ───────────────────────────────────────────────────────────────
function renderCalendar() {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthStr = `${MONTHS[currentMonth]} ${currentYear}`;
  document.getElementById('monthLabel').textContent = monthStr;
  const calTitle = document.getElementById('calAreaTitle');
  if (calTitle) calTitle.textContent = monthStr;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  DAYS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'day-name';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  const daysInPrev = new Date(currentYear, currentMonth, 0).getDate();
  const today = toKey(new Date());
  const allEntries = S.entries;
  const holidays = getUSHolidays(currentYear);

  for (let i = firstDay - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="day-num">${daysInPrev - i}</span>`;
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEntries = allEntries[key] || [];
    const total = dayTotalHours(dayEntries);

    // Per-job hours for chips
    const jobHours = {};
    dayEntries.forEach(e => {
      const label = e.job || e.type || '';
      if (!label) return;
      jobHours[label] = (jobHours[label] || 0) + (parseFloat(e.hours) || 0);
    });
    const jobList = Object.entries(jobHours).sort((a, b) => b[1] - a[1]);

    const holiday = holidays[key];
    const el = document.createElement('div');
    const hmClass = total >= 9 ? ' hm-3' : total >= 7.5 ? ' hm-2' : total > 0 ? ' hm-1' : '';
    el.className = 'cal-day'
      + (key === today ? ' today' : '')
      + hmClass
      + (key === selectedDate ? ' selected' : '')
      + (holiday ? ' holiday' : '');
    el.dataset.key = key;

    const chipsHtml = jobList.map(([label, hrs]) => {
      const ci = jobColorIndex(label);
      const hrsStr = Number.isInteger(hrs) ? hrs : parseFloat(hrs.toFixed(1));
      const display = SPECIAL_LABELS[label] || label;
      return `<div class="job-chip">
        <div class="job-chip-bar" style="background:var(--job-color-${ci})"></div>
        <span class="job-chip-name">${esc(display)}</span>
        <span class="job-chip-hours">${hrsStr}h</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:2px">
        <span class="day-num">${d}</span>
        ${total > 0 ? `<span class="day-hours">${total}h</span>` : ''}
      </div>
      ${holiday ? `<div class="day-holiday">${holiday}</div>` : ''}
      <div class="day-jobs">${chipsHtml}</div>
    `;
    // ── Accessibility: focusable, labelled, keyboard-navigable cells
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.day = d;
    const aria = new Date(currentYear, currentMonth, d)
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    el.setAttribute('aria-label',
      aria + (total > 0 ? `, ${total} hours logged` : ', no hours') + (holiday ? `, ${holiday}` : ''));
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectDate(key); return; }
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (moves[ev.key] !== undefined) {
        ev.preventDefault();
        const target = grid.querySelector(`.cal-day[data-day="${d + moves[ev.key]}"]`);
        if (target) target.focus();
      }
    });

    el.addEventListener('click', () => { hideCalPopup(); selectDate(key); });
    if (dayEntries.length && HOVER_CAPABLE) {
      el.addEventListener('mouseenter', () => showCalPopup(el, key, dayEntries));
      el.addEventListener('mouseleave', () => { _popupTimer = setTimeout(hideCalPopup, 120); });
    }
    grid.appendChild(el);
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="day-num">${d}</span>`;
    grid.appendChild(el);
  }
}

// ── Side Panel ─────────────────────────────────────────────────────────────
function selectDate(key) {
  selectedDate = key;
  renderCalendar();
  renderSidePanel(key);
}

function renderSidePanel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const formatted = new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  document.getElementById('sidePanelTitle').textContent = 'Log Hours';
  document.getElementById('sidePanelDate').textContent = formatted;

  const dayEntries = S.entries[key] || [];
  const total = dayTotalHours(dayEntries);

  const sc = document.getElementById('sideContent');
  sc.classList.add('fading');
  setTimeout(() => {
    sc.classList.remove('fading');
  sc.innerHTML = `
    <div class="form-group">
      <label>Category</label>
      <select id="entryCategory">
        <option value="job">Job Hours</option>
        <option value="PTO">PTO</option>
        <option value="HOL">Holiday</option>
        <option value="TRG">Training</option>
        <option value="MTG">Design Meeting</option>
        <option value="BRV">Bereavement</option>
      </select>
    </div>
    <div id="jobFields">
      <div class="form-group">
        <label>Job</label>
        <select id="entryJob">
          ${buildJobOptions()}
        </select>
      </div>
      <div class="form-group">
        <label>Cost Code</label>
        <select id="entryCostCode">
          <option value="Overhead">Overhead</option>
          <option value="Pump">Pump</option>
          <option value="Underground">Underground</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Hours</label>
      <input type="number" id="entryHours" min="0.25" max="24" step="0.25" placeholder="e.g. 2.5" />
    </div>
    <div class="form-group">
      <label>Notes (optional)</label>
      <textarea id="entryNotes" placeholder="What did you work on?"></textarea>
    </div>
    <button class="btn btn-primary" id="addEntryBtn">Add Entry</button>
    <div class="entries-list" id="entriesList"></div>
    ${dayEntries.length ? `<div class="entry-total">Total: <strong>${total}h</strong></div>` : ''}
  `;

  applyCustomSelects(document.getElementById('sideContent'));
  document.getElementById('entryCategory').addEventListener('change', function() {
    const jobFields = document.getElementById('jobFields');
    const toJob     = this.value === 'job';
    const hidden    = jobFields.style.display === 'none';
    if (toJob && hidden) {
      jobFields.style.opacity   = '0';
      jobFields.style.transform = 'translateY(-6px)';
      jobFields.style.display   = '';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        jobFields.style.opacity   = '1';
        jobFields.style.transform = 'translateY(0)';
      }));
    } else if (!toJob && !hidden) {
      jobFields.style.opacity   = '0';
      jobFields.style.transform = 'translateY(-6px)';
      setTimeout(() => { jobFields.style.display = 'none'; }, 220);
    }
  });
  document.getElementById('addEntryBtn').addEventListener('click', () => addEntry(key));
  renderEntries(key, dayEntries);
  }, 100);
}

function renderEntries(key, dayEntries) {
  const list = document.getElementById('entriesList');
  if (!list) return;
  if (!dayEntries.length) { list.innerHTML = '<p class="placeholder">No entries yet.</p>'; return; }
  list.innerHTML = dayEntries.map((e, i) => {
    const isSpecial = !!e.type;
    const label = isSpecial ? SPECIAL_LABELS[e.type] || e.type : esc(e.job);
    const colorStyle = isSpecial ? '' : `border-left: 3px solid var(--job-color-${jobColorIndex(e.job)});`;
    return `
    <div class="entry-card${isSpecial ? ' entry-card-special' : ''}" style="${colorStyle}" data-action="show-entry" data-key="${key}" data-idx="${i}">
      <div class="entry-card-top">
        <span class="entry-job">${label}</span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span class="entry-hours">${e.hours}h</span>
          <button class="btn btn-danger" data-action="del-entry" data-key="${key}" data-idx="${i}">✕</button>
        </span>
      </div>
      ${!isSpecial && e.costCode ? `<div class="entry-cost-code">${esc(e.costCode)}</div>` : ''}
      ${e.notes ? `<div class="entry-notes">${esc(e.notes)}</div>` : ''}
    </div>`;
  }).join('');
}

// ── CRUD ───────────────────────────────────────────────────────────────────
function addEntry(key) {
  const category = document.getElementById('entryCategory').value;
  const hours    = parseFloat(document.getElementById('entryHours').value);
  const notes    = document.getElementById('entryNotes').value.trim();

  if (!hours || hours <= 0) { alert('Please enter valid hours.'); return; }

  const all = S.entries;
  if (!all[key]) all[key] = [];

  if (category === 'job') {
    const job      = document.getElementById('entryJob').value.trim();
    const costCode = document.getElementById('entryCostCode').value;
    if (!job) { alert('Please select a job.'); return; }
    all[key].push({ job, costCode, hours, notes });
  } else {
    all[key].push({ type: category, hours, notes });
  }
  S.entries = all;

  renderCalendar();
  renderSummary();
  renderWeeklySummary();
  renderJobsList();
  renderSidePanel(key);
}

function deleteEntry(key, index) {
  const all = S.entries;
  if (!all[key]) return;
  const removed = all[key].splice(index, 1)[0];
  if (!all[key].length) delete all[key];
  S.entries = all;

  renderCalendar();
  renderSummary();
  renderWeeklySummary();
  renderJobsList();
  renderSidePanel(key);

  showToast('Entry deleted.', 5000, {
    label: 'Undo',
    fn: () => {
      const cur = S.entries;
      if (!cur[key]) cur[key] = [];
      cur[key].splice(Math.min(index, cur[key].length), 0, removed);
      S.entries = cur;
      renderCalendar(); renderSummary(); renderStatStrip(); renderRightColJobs(); renderWeeklySummary(); renderJobsList(); renderSidePanel(key);
    }
  });
}

// ── Summary ────────────────────────────────────────────────────────────────
function renderSummary() {
  const allEntries = S.entries;
  const jobs = S.jobs;
  const jobTotals = {};
  const specialTotals = {};
  let grandTotal = 0;

  Object.keys(allEntries).forEach(key => {
    const [y, m] = key.split('-').map(Number);
    if (y !== currentYear || m - 1 !== currentMonth) return;
    allEntries[key].forEach(e => {
      const h = parseFloat(e.hours) || 0;
      if (e.type) {
        specialTotals[e.type] = (specialTotals[e.type] || 0) + h;
      } else if (e.job) {
        jobTotals[e.job] = (jobTotals[e.job] || 0) + h;
        grandTotal += h;
      }
    });
  });

  const tbody = document.querySelector('#summaryTable tbody');
  const sorted = Object.entries(jobTotals).sort((a,b) => b[1]-a[1]);
  const hasSpecial = Object.keys(specialTotals).length > 0;

  if (!sorted.length && !hasSpecial) {
    tbody.innerHTML = '<tr><td colspan="4" class="placeholder" style="padding:12px 8px;">No entries this month.</td></tr>';
    return;
  }

  const specialRows = Object.entries(SPECIAL_LABELS)
    .filter(([code]) => specialTotals[code] > 0)
    .map(([code, label]) =>
      `<tr class="special-row"><td class="week-special-label">${label}</td><td>${specialTotals[code].toFixed(2)}</td><td class="muted-cell">—</td><td class="muted-cell">—</td></tr>`
    ).join('');

  tbody.innerHTML = sorted.map(([jobName, monthHrs]) => {
    const jobDef = jobs.find(j => jobKey(j) === jobName);
    const budget = jobDef ? jobDef.budget : null;
    const used = jobLifetimeHours(jobName);
    const remaining = budget != null ? budget - used : null;
    const overBudget = remaining != null && remaining < 0;

    const budgetCell = budget != null
      ? `<td>${used.toFixed(2)} / ${budget.toFixed(2)}</td>
         <td class="${overBudget ? 'over-budget' : remaining <= budget * 0.1 ? 'near-budget' : ''}">
           ${overBudget ? `<span class="budget-warn">▲ ${Math.abs(remaining).toFixed(2)} over</span>` : remaining.toFixed(2)}
         </td>`
      : `<td class="muted-cell">—</td><td class="muted-cell">—</td>`;

    return `<tr><td>${esc(jobName)}</td><td>${monthHrs.toFixed(2)}</td>${budgetCell}</tr>`;
  }).join('') + specialRows +
    `<tr class="total-row"><td>Total</td><td>${grandTotal.toFixed(2)}</td><td></td><td></td></tr>`;
}

// ── RT/OT Split ────────────────────────────────────────────────────────────
// Processes job entries chronologically Mon→Sun. First 40h = RT, rest = OT.
// Special entries (PTO/HOL/TRG/MTG/BRV) are collected separately and don't
// count toward the 40h threshold.
// Returns { byJob, byRow, special }
// computeWeekRtOt() now lives in calc.js (loaded before this file).

// ── Weekly Summary ─────────────────────────────────────────────────────────
function renderWeeklySummary() {
  if (!currentWeekStart) return;

  // Build array of 7 date keys Mon–Sun
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekKeys = weekDays.map(d => toKey(d));

  // Week range label
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const rangeLabel = `${fmt(weekDays[0])} – ${fmt(weekDays[6])}, ${weekDays[6].getFullYear()}`;

  // Nav
  document.getElementById('weekNav').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="prevWeek">&#8249;</button>
    <span class="week-label">${rangeLabel}</span>
    <button class="btn btn-ghost btn-sm" id="nextWeek">&#8250;</button>
    <button class="btn btn-ghost btn-sm" id="thisWeek">This Week</button>
  `;
  document.getElementById('prevWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderWeeklySummary();
  });
  document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderWeeklySummary();
  });
  document.getElementById('thisWeek').addEventListener('click', () => {
    const t = new Date(); t.setHours(0,0,0,0);
    const d = t.getDay();
    currentWeekStart = new Date(t);
    currentWeekStart.setDate(t.getDate() + (d === 0 ? -6 : 1 - d));
    renderWeeklySummary();
  });

  const allEntries = S.entries;
  const { byJob, special } = computeWeekRtOt(weekKeys, allEntries);

  const today = toKey(new Date());
  const DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // Update thead
  const thead = document.querySelector('#weekTable thead tr');
  thead.innerHTML = '<th>Job</th>' +
    weekKeys.map((k, i) => {
      const isToday = k === today;
      return `<th class="${isToday ? 'today-col' : ''}">${DAY_ABBR[i]}<br><span class="week-date">${weekDays[i].getDate()}</span></th>`;
    }).join('') + '<th>Total</th>';

  const tbody = document.querySelector('#weekTable tbody');
  const jobs  = Object.keys(byJob);
  const hasSpecial = Object.values(special).some(arr => arr.some(v => v > 0));

  if (!jobs.length && !hasSpecial) {
    tbody.innerHTML = `<tr><td colspan="9" class="placeholder" style="padding:12px 8px;">No entries this week.</td></tr>`;
    return;
  }

  // Sort by total hours descending
  jobs.sort((a, b) => {
    const totA = byJob[a].rt.reduce((s,v)=>s+v,0) + byJob[a].ot.reduce((s,v)=>s+v,0);
    const totB = byJob[b].rt.reduce((s,v)=>s+v,0) + byJob[b].ot.reduce((s,v)=>s+v,0);
    return totB - totA;
  });

  const fmtH = h => h > 0 ? (h % 1 === 0 ? h + 'h' : h.toFixed(2) + 'h') : null;
  const cell  = (h, isToday, cls='') =>
    `<td class="${[isToday ? 'today-col' : '', cls].filter(Boolean).join(' ')}">${fmtH(h) || '<span class="muted-cell">—</span>'}</td>`;

  // Day totals across all jobs
  const rtDayTotals = [0,0,0,0,0,0,0];
  const otDayTotals = [0,0,0,0,0,0,0];
  jobs.forEach(job => {
    byJob[job].rt.forEach((v,i) => rtDayTotals[i] += v);
    byJob[job].ot.forEach((v,i) => otDayTotals[i] += v);
  });
  const rtWeekTotal = rtDayTotals.reduce((s,v)=>s+v,0);
  const otWeekTotal = otDayTotals.reduce((s,v)=>s+v,0);

  // Special rows (only those with any hours this week)
  const specialRows = Object.entries(SPECIAL_LABELS)
    .filter(([code]) => special[code].some(v => v > 0))
    .map(([code, label]) => {
      const hrs   = special[code];
      const total = hrs.reduce((s,v)=>s+v,0);
      return `<tr class="special-row">
        <td class="week-job-name week-special-label">${label}</td>
        ${hrs.map((h, i) => cell(h, weekKeys[i] === today, 'special-cell')).join('')}
        <td class="week-row-total special-cell">${fmtH(total)}</td>
      </tr>`;
    }).join('');

  tbody.innerHTML = jobs.map(job => {
    const { rt, ot } = byJob[job];
    const rtTotal = rt.reduce((s,v)=>s+v,0);
    const otTotal = ot.reduce((s,v)=>s+v,0);
    const rtRow = `<tr>
      <td class="week-job-name">${esc(job)}</td>
      ${rt.map((h, i) => cell(h, weekKeys[i] === today)).join('')}
      <td class="week-row-total">${fmtH(rtTotal) || '—'}</td>
    </tr>`;
    const otRow = otTotal > 0 ? `<tr class="ot-row">
      <td class="week-ot-label">↳ OT</td>
      ${ot.map((h, i) => cell(h, weekKeys[i] === today, 'ot-cell')).join('')}
      <td class="week-row-total ot-cell">${fmtH(otTotal)}</td>
    </tr>` : '';
    return rtRow + otRow;
  }).join('') + specialRows + `
    <tr class="total-row">
      <td>RT Total</td>
      ${rtDayTotals.map((h, i) => `<td class="${weekKeys[i] === today ? 'today-col' : ''}">${fmtH(h) || '—'}</td>`).join('')}
      <td>${fmtH(rtWeekTotal) || '—'}</td>
    </tr>` +
    (otWeekTotal > 0 ? `
    <tr class="total-row ot-total-row">
      <td>OT Total</td>
      ${otDayTotals.map((h, i) => `<td class="${weekKeys[i] === today ? 'today-col' : ''}">${fmtH(h) || '—'}</td>`).join('')}
      <td>${fmtH(otWeekTotal)}</td>
    </tr>` : '');

  renderMileage();
  renderExpenses();
}

// ── Mileage ────────────────────────────────────────────────────────────────
function mileageWeekKey() {
  if (!currentWeekStart) return null;
  const sun = new Date(currentWeekStart);
  sun.setDate(sun.getDate() + 6);
  return toKey(sun);
}

function getMileageEntries() {
  const key = mileageWeekKey();
  if (!key) return [];
  return (S.mileage[key] || []);
}

function saveMileageEntries(entries) {
  const key = mileageWeekKey();
  if (!key) return;
  const all = S.mileage;
  all[key] = entries;
  S.mileage = all;
}

function renderMileage() {
  const tbody = document.getElementById('mileageTbody');
  const totalEl = document.getElementById('mileageTotal');
  const addBtn = document.getElementById('addMileageBtn');
  const entries = getMileageEntries();

  const atMileageLimit = entries.length >= 4;
  addBtn.disabled = atMileageLimit;
  addBtn.title = atMileageLimit ? 'Maximum 4 mileage entries per week — delete one to add more.' : '';

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="mileage-empty">No mileage entries for this week.</td></tr>`;
    totalEl.textContent = '$0.00';
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = entries.map((e, i) => {
    const amt = (parseFloat(e.miles) || 0) * (parseFloat(e.rate) || 0);
    grandTotal += amt;
    return `<tr>
      <td><input type="text" class="mi-po" data-i="${i}" value="${esc(e.po)}" placeholder="Job # / P.O." /></td>
      <td><input type="text" class="mi-desc" data-i="${i}" value="${esc(e.description)}" placeholder="Description &amp; date" /></td>
      <td><input type="number" class="mi-miles" data-i="${i}" value="${e.miles}" min="0" step="0.1" placeholder="0" style="width:70px" /></td>
      <td><input type="number" class="mi-rate" data-i="${i}" value="${e.rate}" min="0" step="0.001" placeholder="0.670" style="width:70px" /></td>
      <td class="mileage-amount">$${amt.toFixed(2)}</td>
      <td class="mileage-del"><button class="mileage-del-btn" data-i="${i}" title="Remove">&#x2715;</button></td>
    </tr>`;
  }).join('');

  totalEl.textContent = `$${grandTotal.toFixed(2)}`;

  // Wire input changes
  tbody.querySelectorAll('.mi-po').forEach(el => el.addEventListener('change', e => updateMileageField(+e.target.dataset.i, 'po', e.target.value)));
  tbody.querySelectorAll('.mi-desc').forEach(el => el.addEventListener('change', e => updateMileageField(+e.target.dataset.i, 'description', e.target.value)));
  tbody.querySelectorAll('.mi-miles').forEach(el => el.addEventListener('input', e => updateMileageField(+e.target.dataset.i, 'miles', e.target.value)));
  tbody.querySelectorAll('.mi-rate').forEach(el => el.addEventListener('input', e => updateMileageField(+e.target.dataset.i, 'rate', e.target.value)));
  tbody.querySelectorAll('.mileage-del-btn').forEach(el => el.addEventListener('click', e => deleteMileageEntry(+e.target.dataset.i)));
}

function addMileageEntry() {
  const entries = getMileageEntries();
  if (entries.length >= 4) return;
  entries.push({ po: '', description: '', miles: '', rate: '0.670' });
  saveMileageEntries(entries);
  renderMileage();
}

function updateMileageField(i, field, value) {
  const entries = getMileageEntries();
  if (!entries[i]) return;
  entries[i][field] = value;
  saveMileageEntries(entries);
  // Re-render just the totals without full re-render (avoid losing focus)
  let grandTotal = 0;
  entries.forEach(e => { grandTotal += (parseFloat(e.miles) || 0) * (parseFloat(e.rate) || 0); });
  document.getElementById('mileageTotal').textContent = `$${grandTotal.toFixed(2)}`;
  // Update the amount cell for this row
  const amtCell = document.querySelector(`#mileageTbody tr:nth-child(${i + 1}) .mileage-amount`);
  if (amtCell) {
    const amt = (parseFloat(entries[i].miles) || 0) * (parseFloat(entries[i].rate) || 0);
    amtCell.textContent = `$${amt.toFixed(2)}`;
  }
}

function deleteMileageEntry(i) {
  const entries = getMileageEntries();
  const removed = entries.splice(i, 1)[0];
  saveMileageEntries(entries);
  renderMileage();
  showToast('Mileage entry deleted.', 5000, {
    label: 'Undo',
    fn: () => {
      const cur = getMileageEntries();
      cur.splice(Math.min(i, cur.length), 0, removed);
      saveMileageEntries(cur);
      renderMileage();
    }
  });
}

// ── Expenses ───────────────────────────────────────────────────────────────
function getExpenseEntries() {
  const key = mileageWeekKey();
  if (!key) return [];
  return (S.expenses[key] || []);
}

function saveExpenseEntries(entries) {
  const key = mileageWeekKey();
  if (!key) return;
  const all = S.expenses;
  all[key] = entries;
  S.expenses = all;
}

function renderExpenses() {
  const tbody   = document.getElementById('expenseTbody');
  const totalEl = document.getElementById('expenseTotal');
  const addBtn  = document.getElementById('addExpenseBtn');
  const entries = getExpenseEntries();

  const atExpenseLimit = entries.length >= 3;
  addBtn.disabled = atExpenseLimit;
  addBtn.title = atExpenseLimit ? 'Maximum 3 expense entries per week — delete one to add more.' : '';

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="mileage-empty">No expense entries for this week.</td></tr>`;
    totalEl.textContent = '$0.00';
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = entries.map((e, i) => {
    const amt = parseFloat(e.amount) || 0;
    grandTotal += amt;
    return `<tr>
      <td><input type="text" class="ex-po" data-i="${i}" value="${esc(e.po)}" placeholder="Job # / P.O." /></td>
      <td><input type="text" class="ex-desc" data-i="${i}" value="${esc(e.description)}" placeholder="Description &amp; date" /></td>
      <td><input type="number" class="ex-amt" data-i="${i}" value="${e.amount}" min="0" step="0.01" placeholder="0.00" style="width:90px" /></td>
      <td class="mileage-del"><button class="mileage-del-btn" data-i="${i}" title="Remove">&#x2715;</button></td>
    </tr>`;
  }).join('');

  totalEl.textContent = `$${grandTotal.toFixed(2)}`;

  tbody.querySelectorAll('.ex-po').forEach(el   => el.addEventListener('change', e => updateExpenseField(+e.target.dataset.i, 'po', e.target.value)));
  tbody.querySelectorAll('.ex-desc').forEach(el  => el.addEventListener('change', e => updateExpenseField(+e.target.dataset.i, 'description', e.target.value)));
  tbody.querySelectorAll('.ex-amt').forEach(el   => el.addEventListener('input',  e => updateExpenseField(+e.target.dataset.i, 'amount', e.target.value)));
  tbody.querySelectorAll('.mileage-del-btn').forEach(el => el.addEventListener('click', e => deleteExpenseEntry(+e.target.dataset.i)));
}

function addExpenseEntry() {
  const entries = getExpenseEntries();
  if (entries.length >= 3) return;
  entries.push({ po: '', description: '', amount: '' });
  saveExpenseEntries(entries);
  renderExpenses();
}

function updateExpenseField(i, field, value) {
  const entries = getExpenseEntries();
  if (!entries[i]) return;
  entries[i][field] = value;
  saveExpenseEntries(entries);
  let grandTotal = 0;
  entries.forEach(e => { grandTotal += parseFloat(e.amount) || 0; });
  document.getElementById('expenseTotal').textContent = `$${grandTotal.toFixed(2)}`;
}

function deleteExpenseEntry(i) {
  const entries = getExpenseEntries();
  const removed = entries.splice(i, 1)[0];
  saveExpenseEntries(entries);
  renderExpenses();
  showToast('Expense entry deleted.', 5000, {
    label: 'Undo',
    fn: () => {
      const cur = getExpenseEntries();
      cur.splice(Math.min(i, cur.length), 0, removed);
      saveExpenseEntries(cur);
      renderExpenses();
    }
  });
}

// ── Jobs Manager ───────────────────────────────────────────────────────────
function renderJobsList() {
  const list = document.getElementById('jobsList');
  const jobs = S.jobs;
  if (!jobs.length) { list.innerHTML = '<p class="placeholder">No jobs yet.</p>'; return; }

  const hasArchived = jobs.some(j => j.archived);
  const visible = jobs
    .map((j, i) => ({ j, i }))
    .filter(({ j }) => _showArchivedJobs || !j.archived)
    .sort((a, b) => {
      if (!a.j.number && !b.j.number) return 0;
      if (!a.j.number) return 1;
      if (!b.j.number) return -1;
      return a.j.number.localeCompare(b.j.number, undefined, { numeric: true, sensitivity: 'base' });
    });

  const grouped = { '181': [], '187': [], other: [] };
  visible.forEach(item => grouped[jobGroup(item.j)].push(item));

  const groupOrder = [
    { key: '181', label: '181 – Contract' },
    { key: '187', label: '187 – Express' },
    { key: 'other', label: 'Other' },
  ];

  let html = '';

  if (hasArchived) {
    html += `<div class="show-archived-row">
      <label>
        <input type="checkbox" id="showArchivedChk" ${_showArchivedJobs ? 'checked' : ''} />
        Show archived jobs
      </label>
    </div>`;
  }

  groupOrder.forEach(({ key, label }) => {
    const items = grouped[key];
    if (!items.length) return;
    const activeCount = items.filter(({ j }) => !j.archived).length;
    html += `<div class="job-group-header">${label} <span class="job-group-count">${activeCount}</span></div>`;
    html += items.map(({ j, i }) => {
      const used = jobLifetimeHours(jobKey(j));
      const budget = j.budget;
      const hasBudget = budget != null;
      const remaining = hasBudget ? budget - used : null;
      const pct = hasBudget ? Math.min(100, (used / budget) * 100) : 0;
      const overBudget = hasBudget && remaining < 0;
      const nearBudget = hasBudget && !overBudget && remaining <= budget * 0.1;
      const barClass = overBudget ? 'bar-over' : nearBudget ? 'bar-near' : 'bar-ok';

      const metaFields = [
        ['Customer', j.customer], ['Salesman', j.salesman], ['Designer', j.designer],
        ['Superintendent', j.superintendent], ['Foreman', j.foreman],
      ].filter(([, v]) => v);

      return `
        <div class="job-card${j.archived ? ' archived' : ''}" data-idx="${i}">
          <div class="job-card-top">
            <span class="job-card-name">
              ${j.number ? `<span class="job-card-number">${esc(j.number)}</span> ` : ''}${esc(j.name)}
              ${j.archived ? '<span class="job-archived-badge">Archived</span>' : ''}
              ${j.lat != null ? `<span class="job-mapped-pin" title="${esc(j.address || 'Mapped')}">📍</span>` : ''}
            </span>
            <div style="display:flex;gap:4px;flex-shrink:0">
              ${!j.archived ? `<button class="btn btn-ghost btn-sm" data-action="duplicate-job" data-idx="${i}" title="Duplicate as new job">Duplicate</button>` : ''}
              ${!j.archived ? `<button class="btn btn-ghost btn-sm" data-action="edit-job" data-idx="${i}" title="Edit job">Edit</button>` : ''}
              ${j.archived
                ? `<button class="btn btn-ghost btn-sm" data-action="unarchive-job" data-idx="${i}">Restore</button>`
                : `<button class="btn btn-ghost btn-sm" data-action="archive-job" data-idx="${i}" title="Archive">Archive</button>`}
              <button class="btn btn-danger" data-action="rm-job" data-idx="${i}" title="Remove">✕</button>
            </div>
          </div>
          ${metaFields.length ? `<div class="job-meta">${metaFields.map(([lbl, val]) => `<span class="job-meta-item"><span class="job-meta-label">${lbl}:</span> ${esc(val)}</span>`).join('')}</div>` : ''}
          ${hasBudget ? `
            <div class="budget-bar-track">
              <div class="budget-bar-fill ${barClass}" style="width:${pct}%"></div>
            </div>
            <div class="budget-stats">
              <span>Used: <strong>${used.toFixed(2)}h</strong>${j.startingHours ? ` <span class="muted-cell">(incl. ${j.startingHours}h prior)</span>` : ''}</span>
              <span>Budget: <strong>${budget.toFixed(2)}h</strong></span>
              <span class="${overBudget ? 'over-budget' : nearBudget ? 'near-budget' : ''}">
                ${overBudget
                  ? `Remaining: <strong class="over-budget">▲ ${Math.abs(remaining).toFixed(2)}h over</strong>`
                  : `Remaining: <strong>${remaining.toFixed(2)}h</strong>`}
              </span>
            </div>
          ` : `
            <div class="budget-stats"><span class="muted-cell">No budget set — <button class="btn-inline" data-action="set-budget" data-idx="${i}">Set budget</button></span></div>
          `}
          <div class="budget-edit-row">
            <input type="number" id="budget-input-${i}" class="budget-input" min="0" step="0.5"
              placeholder="Set total hours budget…" value="${hasBudget ? budget : ''}" />
            <button class="btn btn-ghost btn-sm" data-action="save-budget" data-idx="${i}">Save</button>
          </div>
          <div class="job-notes-row">
            <button class="btn btn-ghost btn-sm job-notes-toggle" data-action="toggle-job-notes" data-idx="${i}">
              Notes${j.notes ? ' <span class="job-notes-dot">●</span>' : ''}
            </button>
            <div class="job-notes-area" id="job-notes-${i}" style="display:none;">
              <textarea class="job-notes-input" data-idx="${i}" placeholder="Job notes, scope, contacts, punch list…">${esc(j.notes || '')}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');
  });

  list.innerHTML = html;

  const chk = document.getElementById('showArchivedChk');
  if (chk) chk.addEventListener('change', () => { _showArchivedJobs = chk.checked; renderJobsList(); });
}

function archiveJob(i) {
  const jobs = S.jobs;
  if (!jobs[i]) return;
  jobs[i].archived = true;
  S.jobs = jobs;
  renderJobsList();
  showToast(`"${jobs[i].name}" archived.`, 5000, {
    label: 'Undo',
    fn: () => { const j2 = S.jobs; j2[i].archived = false; S.jobs = j2; renderJobsList(); },
  });
}

function unarchiveJob(i) {
  const jobs = S.jobs;
  if (!jobs[i]) return;
  jobs[i].archived = false;
  S.jobs = jobs;
  renderJobsList();
  showToast(`"${jobs[i].name}" restored.`, 3000);
}

function duplicateJob(i) {
  const jobs = S.jobs;
  const src = jobs[i];
  if (!src) return;
  // Pre-fill the add-job form fields
  const numIn  = document.getElementById('newJobNumber');
  const nameIn = document.getElementById('newJobInput');
  if (numIn)  numIn.value  = src.number || '';
  if (nameIn) nameIn.value = src.name   || '';
  if (nameIn) nameIn.focus();
  showToast('Form pre-filled — edit and click Add Job to save the duplicate.', 5000);
}

function setBudget(i) {
  const input = document.getElementById(`budget-input-${i}`);
  if (input) input.focus();
}

function saveBudget(i) {
  const input = document.getElementById(`budget-input-${i}`);
  const val = parseFloat(input.value);
  const jobs = S.jobs;
  jobs[i].budget = (!input.value.trim() || isNaN(val) || val <= 0) ? null : val;
  S.jobs = jobs;
  renderJobsList();
  renderSummary();
}

function openJobEdit(idx) {
  const card = document.querySelector(`.job-card[data-idx="${idx}"]`);
  if (!card) return;
  const j = S.jobs[idx];
  const inp = (field, val, ph, type = 'text') =>
    `<input id="je-${field}-${idx}" type="${type}" value="${esc(String(val ?? ''))}" placeholder="${ph}"
      style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:.84rem;width:100%;box-sizing:border-box" />`;
  const field = (label, fieldId, val, ph, type) =>
    `<div class="job-edit-field"><label class="job-edit-label">${label}</label>${inp(fieldId, val, ph, type)}</div>`;

  card.classList.add('job-card-editing');
  card.innerHTML = `
    <div class="job-edit-grid">
      ${field('Job #',          'number',         j.number,         'Job number…')}
      ${field('Job Name',       'name',           j.name,           'Job name…')}
      ${field('Customer',       'customer',       j.customer,       'Customer…')}
      ${field('Salesman',       'salesman',       j.salesman,       'Salesman…')}
      ${field('Designer',       'designer',       j.designer,       'Designer…')}
      ${field('Superintendent', 'superintendent', j.superintendent, 'Superintendent…')}
      ${field('Foreman',        'foreman',        j.foreman,        'Foreman…')}
      ${field('Starting Hours', 'startingHours',  j.startingHours || '', 'Prior hours used…', 'number')}
      ${field('Budget (hours)', 'budget',         j.budget != null ? j.budget : '', 'Total budget…', 'number')}
      <div class="job-edit-field col-span-2">
        <label class="job-edit-label">Address</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="je-address-${idx}" type="text" value="${esc(j.address || '')}" placeholder="Street address, city, state…"
            style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:.84rem;box-sizing:border-box" />
          <button class="btn btn-ghost btn-sm je-locate-btn${j.lat ? ' located' : ''}" data-action="geocode-job" data-idx="${idx}" style="white-space:nowrap;flex-shrink:0">${j.lat ? '✓ Located' : 'Locate'}</button>
          <input type="hidden" id="je-lat-${idx}" value="${j.lat ?? ''}" />
          <input type="hidden" id="je-lng-${idx}" value="${j.lng ?? ''}" />
        </div>
      </div>
    </div>
    <div class="job-edit-actions">
      <button class="btn btn-ghost btn-sm" data-action="cancel-job-edit">Cancel</button>
      <button class="btn btn-primary btn-sm" data-action="save-job-edit" data-idx="${idx}">Save</button>
    </div>`;
  const grid = card.querySelector('.job-edit-grid');
  if (grid) {
    grid.style.cssText = 'opacity:0;transform:translateY(4px)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      grid.style.transition = 'opacity .15s ease, transform .15s ease';
      grid.style.opacity = '1';
      grid.style.transform = 'none';
    }));
  }
  card.querySelector(`#je-address-${idx}`)?.addEventListener('input', () => {
    document.getElementById(`je-lat-${idx}`).value = '';
    document.getElementById(`je-lng-${idx}`).value = '';
    const b = card.querySelector('.je-locate-btn');
    if (b) { b.textContent = 'Locate'; b.classList.remove('located'); }
  });
  card.querySelector(`#je-name-${idx}`).focus();
}

async function saveJobEdit(idx) {
  const get = f => document.getElementById(`je-${f}-${idx}`)?.value.trim() ?? '';
  const name = get('name');
  if (!name) { showToast('Job name is required.', 3000); return; }
  const budgetVal = parseFloat(get('budget'));
  const startVal  = parseFloat(get('startingHours'));
  const address   = get('address') || undefined;
  let lat = parseFloat(document.getElementById(`je-lat-${idx}`)?.value || '');
  let lng = parseFloat(document.getElementById(`je-lng-${idx}`)?.value || '');
  if (address && (isNaN(lat) || isNaN(lng))) {
    const coords = await geocodeAddress(address);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  const jobs = S.jobs;
  jobs[idx] = {
    ...jobs[idx],
    number:         get('number'),
    name,
    customer:       get('customer')       || undefined,
    salesman:       get('salesman')       || undefined,
    designer:       get('designer')       || undefined,
    superintendent: get('superintendent') || undefined,
    foreman:        get('foreman')        || undefined,
    startingHours:  isNaN(startVal)  || startVal  <= 0 ? 0    : startVal,
    budget:         isNaN(budgetVal) || budgetVal <= 0 ? null : budgetVal,
    address,
    lat: isNaN(lat) ? undefined : lat,
    lng: isNaN(lng) ? undefined : lng,
  };
  S.jobs = jobs;
  renderJobsList();
  renderSummary();
  showToast('Job updated.', 3000);
}

function addJob() {
  const numberInput = document.getElementById('newJobNumber');
  const nameInput   = document.getElementById('newJobInput');
  const budgetInput = document.getElementById('newJobBudget');
  const number = numberInput.value.trim();
  const name   = nameInput.value.trim();

  if (!name) { alert('Please enter a job name.'); return; }

  const jobs = S.jobs;
  const label = number ? `${number} – ${name}` : name;
  if (jobs.find(j => jobKey(j) === label)) { alert('Job already exists.'); return; }

  const usedInput  = document.getElementById('newJobUsed');
  const usedVal    = parseFloat(usedInput.value);
  const startingHours = usedInput.value.trim() && !isNaN(usedVal) && usedVal > 0 ? usedVal : 0;

  const budgetVal = parseFloat(budgetInput.value);
  const budget = budgetInput.value.trim() && !isNaN(budgetVal) && budgetVal > 0 ? budgetVal : null;

  jobs.push({ number, name, startingHours, budget });
  S.jobs = jobs;
  numberInput.value = '';
  nameInput.value = '';
  usedInput.value = '';
  budgetInput.value = '';
  renderJobsList();
  renderSummary();
}

function removeJob(i) {
  const jobs = S.jobs;
  const removed = jobs.splice(i, 1)[0];
  S.jobs = jobs;
  renderJobsList();
  renderSummary();
  showToast('Job removed.', 5000, {
    label: 'Undo',
    fn: () => {
      const cur = S.jobs;
      cur.splice(Math.min(i, cur.length), 0, removed);
      S.jobs = cur;
      renderJobsList(); renderSummary();
    }
  });
}

// ── Job Excel / CSV Import ─────────────────────────────────────────────────
function handleJobImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  if (file.size > 20 * 1024 * 1024) { showToast('File is too large (max 20 MB).', 4000); return; }
  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        .filter(r => r.some(c => String(c).trim() !== ''));
      if (rows.length < 2) { showToast('No job data found in the file.', 4000); return; }
      const headers = rows[0].map(c => String(c));
      showJobImportPreview(file.name, headers, detectJobColumns(headers), rows.slice(1));
    } catch (_) {
      showToast('Could not read file — make sure it is a valid Excel or CSV file.', 5000);
    }
  };
  reader.readAsArrayBuffer(file);
}

function detectJobColumns(headers) {
  const h = headers.map(s => String(s || '').toLowerCase().trim());
  const find = (...terms) => { const i = h.findIndex(hdr => terms.some(t => hdr.includes(t))); return i >= 0 ? i : -1; };
  return {
    number:         find('job #', 'job#', 'job no', 'job number'),
    name:           find('job name', 'name', 'description'),
    customer:       find('customer', 'client', 'owner'),
    salesman:       find('salesman', 'sales'),
    designer:       find('designer'),
    superintendent: find('superintendent', 'supt', 'super'),
    foreman:        find('foreman'),
  };
}

function showJobImportPreview(fileName, headers, cols, rows) {
  if (document.getElementById('jobImportModal')) return;

  const FIELDS = [
    { key: 'number',         label: 'Job #' },
    { key: 'name',           label: 'Job Name *' },
    { key: 'customer',       label: 'Customer' },
    { key: 'salesman',       label: 'Salesman' },
    { key: 'designer',       label: 'Designer' },
    { key: 'superintendent', label: 'Superintendent' },
    { key: 'foreman',        label: 'Foreman' },
  ];

  const selStyle = 'font-size:.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);width:100%';
  const optNone = '<option value="-1">(skip)</option>';
  const mappingRows = FIELDS.map(f => {
    const opts = optNone + headers.map((h, i) =>
      `<option value="${i}"${i === cols[f.key] ? ' selected' : ''}>${esc(h)}</option>`).join('');
    const sel = `<select class="job-col-map" data-field="${f.key}" style="${selStyle}"${cols[f.key] < 0 ? '' : ''}>${opts}</select>`;
    if (cols[f.key] >= 0) {
      // re-select the detected option (default option won't have selected attr if idx matches)
    }
    return `<tr><td style="padding:4px 8px 4px 0;font-size:.82rem;white-space:nowrap">${f.label}</td><td style="padding:4px 0 4px 8px;width:100%">${sel}</td></tr>`;
  }).join('');

  const previewRows = rows.slice(0, 5).map(r =>
    `<tr>${headers.map((_, i) => `<td style="padding:2px 8px;font-size:.75rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid var(--border)">${esc(String(r[i] ?? ''))}</td>`).join('')}</tr>`
  ).join('');

  const m = document.createElement('div');
  m.id = 'jobImportModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center';
  m.innerHTML = `
    <div class="import-backdrop" id="jobImportBackdrop"></div>
    <div class="import-dialog" style="width:min(640px,96vw);max-height:88vh;display:flex;flex-direction:column">
      <div class="import-dialog-title">Import Jobs from Excel</div>
      <div style="overflow-y:auto;flex:1">
        <p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">${esc(fileName)} &mdash; <strong>${rows.length}</strong> row${rows.length !== 1 ? 's' : ''} found</p>
        <p style="font-size:.8rem;font-weight:600;margin-bottom:6px">Map columns</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px"><tbody>${mappingRows}</tbody></table>
        <p style="font-size:.8rem;font-weight:600;margin-bottom:6px">Preview <span style="font-weight:400;color:var(--muted)">(first ${Math.min(5, rows.length)} rows)</span></p>
        <div style="overflow-x:auto;margin-bottom:4px">
          <table style="border-collapse:collapse">
            <thead><tr>${headers.map(h => `<th style="padding:2px 8px;font-size:.74rem;text-align:left;color:var(--muted);white-space:nowrap;border-bottom:1px solid var(--border)">${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
      </div>
      <div class="import-dialog-actions" style="margin-top:16px">
        <button class="btn btn-ghost" id="jobImportCancel">Cancel</button>
        <button class="btn btn-primary" id="jobImportConfirm">Import ${rows.length} job${rows.length !== 1 ? 's' : ''}</button>
      </div>
    </div>`;
  document.body.appendChild(m);

  // Re-apply detected selections (the DOM is now live)
  FIELDS.forEach(f => {
    const sel = m.querySelector(`.job-col-map[data-field="${f.key}"]`);
    if (sel && cols[f.key] >= 0) sel.value = String(cols[f.key]);
  });

  document.getElementById('jobImportBackdrop').onclick = () => m.remove();
  document.getElementById('jobImportCancel').onclick   = () => m.remove();
  document.getElementById('jobImportConfirm').onclick  = () => {
    const map = {};
    m.querySelectorAll('.job-col-map').forEach(sel => { map[sel.dataset.field] = parseInt(sel.value, 10); });
    if (map.name < 0) { showToast('Please map the Job Name column.', 4000); return; }
    confirmJobImport(rows, map);
    m.remove();
  };
}

function confirmJobImport(rows, map) {
  const jobs = S.jobs;
  const existingKeys = new Set(jobs.map(j => jobKey(j)));
  let added = 0, skipped = 0;

  for (const row of rows) {
    const get = idx => idx >= 0 ? String(row[idx] ?? '').trim() : '';
    const name = get(map.name);
    if (!name) continue;
    const job = {
      number:         get(map.number),
      name,
      startingHours:  0,
      budget:         null,
      customer:       get(map.customer)       || undefined,
      salesman:       get(map.salesman)       || undefined,
      designer:       get(map.designer)       || undefined,
      superintendent: get(map.superintendent) || undefined,
      foreman:        get(map.foreman)        || undefined,
    };
    const key = jobKey(job);
    if (existingKeys.has(key)) { skipped++; continue; }
    jobs.push(job);
    existingKeys.add(key);
    added++;
  }

  S.jobs = jobs;
  renderJobsList();
  renderSummary();

  const parts = [`Imported ${added} job${added !== 1 ? 's' : ''}`];
  if (skipped) parts.push(`${skipped} already existed`);
  showToast(parts.join(' · '), 5000);
}

// ── Rates & Calcs ──────────────────────────────────────────────────────────
function renderRates() {
  const rates = S.rates;
  const list  = document.getElementById('ratesList');

  if (!rates.length) {
    list.innerHTML = '<p class="placeholder">No rates defined yet.</p>';
  } else {
    list.innerHTML = rates.map((r, i) => `
      <div class="rate-card">
        <div class="rate-card-main">
          <span class="rate-label">${esc(r.label)}</span>
          <span class="rate-value">${r.unit === '$/hr' || r.unit === '$/day' ? '$' : ''}${parseFloat(r.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="rate-unit">${esc(r.unit)}</span></span>
          <button class="btn btn-danger" data-action="rm-rate" data-idx="${i}">✕</button>
        </div>
        <div class="rate-edit-row">
          <input type="text"   class="rate-edit-label" data-i="${i}" value="${esc(r.label)}" placeholder="Label" />
          <input type="number" class="rate-edit-value" data-i="${i}" value="${r.value}" min="0" step="0.01" placeholder="Value" />
          <select class="rate-edit-unit" data-i="${i}">
            ${['$/hr','$/day','%','multiplier','custom'].map(u =>
              `<option${u === r.unit ? ' selected' : ''}>${u}</option>`
            ).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" data-action="save-rate" data-idx="${i}">Save</button>
        </div>
      </div>
    `).join('');
  }

  applyCustomSelects(document.getElementById('tab-rates'));
  renderRatesCalcs();
}

function renderRatesCalcs() {
  const rates      = S.rates;
  const calcs      = document.getElementById('ratesCalcs');
  const allEntries = S.entries;

  // Gather monthly hours per job
  const jobTotals = {};
  let grandTotal = 0;
  Object.keys(allEntries).forEach(key => {
    const [y, m] = key.split('-').map(Number);
    if (y !== currentYear || m - 1 !== currentMonth) return;
    allEntries[key].forEach(e => {
      if (!e.job) return;
      jobTotals[e.job] = (jobTotals[e.job] || 0) + (parseFloat(e.hours) || 0);
      grandTotal += parseFloat(e.hours) || 0;
    });
  });

  const hrRates = rates.filter(r => r.unit === '$/hr');
  if (!hrRates.length || !grandTotal) {
    calcs.innerHTML = hrRates.length
      ? '<p class="placeholder" style="margin-top:16px;">Log hours to see calculated totals.</p>'
      : '';
    return;
  }

  const jobRows  = Object.entries(jobTotals).sort((a,b) => b[1]-a[1]);
  const fmt      = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rateTotals = hrRates.map(r => ({ ...r, total: grandTotal * parseFloat(r.value) }));

  // ── Per-rate breakdown tables ──────────────────────────────────────────
  const breakdownHtml = hrRates.map(r => `
    <div class="calcs-rate-block">
      <div class="calcs-rate-label">${esc(r.label)} <span class="rate-unit">@ $${parseFloat(r.value).toFixed(2)}/hr</span></div>
      <table class="summary-table">
        <thead><tr><th>Job</th><th>Hours</th><th>Amount</th></tr></thead>
        <tbody>
          ${jobRows.map(([job, hrs]) => `
            <tr>
              <td>${esc(job)}</td>
              <td>${hrs.toFixed(2)}</td>
              <td>${fmt(hrs * parseFloat(r.value))}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td><td>${grandTotal.toFixed(2)}</td><td>${fmt(grandTotal * parseFloat(r.value))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join('');

  // ── Side-by-side comparison table ─────────────────────────────────────
  const comparisonHtml = hrRates.length > 1 ? `
    <div class="calcs-rate-block">
      <div class="calcs-rate-label">Side-by-Side Comparison</div>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Hours</th>
            ${hrRates.map(r => `<th>${esc(r.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${jobRows.map(([job, hrs]) => `
            <tr>
              <td>${esc(job)}</td>
              <td>${hrs.toFixed(2)}</td>
              ${hrRates.map(r => `<td>${fmt(hrs * parseFloat(r.value))}</td>`).join('')}
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td>
            <td>${grandTotal.toFixed(2)}</td>
            ${rateTotals.map(r => `<td>${fmt(r.total)}</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  ` : '';

  // ── Savings matrix (every pair, cheapest vs most expensive) ───────────
  const savingsRows = [];
  for (let a = 0; a < rateTotals.length; a++) {
    for (let b = a + 1; b < rateTotals.length; b++) {
      const rA = rateTotals[a], rB = rateTotals[b];
      const diff    = Math.abs(rA.total - rB.total);
      const cheaper = rA.total < rB.total ? rA : rB;
      const pricier = rA.total < rB.total ? rB : rA;
      const pct     = ((diff / pricier.total) * 100).toFixed(1);
      savingsRows.push({ cheaper, pricier, diff, pct });
    }
  }

  const savingsHtml = hrRates.length > 1 ? `
    <div class="calcs-rate-block">
      <div class="calcs-rate-label">Savings Analysis — ${new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div>
      <div class="savings-grid">
        ${savingsRows.map(({ cheaper, pricier, diff, pct }) => `
          <div class="savings-card">
            <div class="savings-pair">
              <span class="savings-winner">${esc(cheaper.label)}</span>
              <span class="savings-vs">vs</span>
              <span class="savings-loser">${esc(pricier.label)}</span>
            </div>
            <div class="savings-amount">saves ${fmt(diff)}</div>
            <div class="savings-pct">${pct}% less expensive this month</div>
            <div class="savings-detail">
              ${esc(cheaper.label)}: ${fmt(cheaper.total)} &nbsp;|&nbsp; ${esc(pricier.label)}: ${fmt(pricier.total)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  calcs.innerHTML = `
    <div class="calcs-section">
      <div class="calcs-title">Calculations — ${new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div>
      ${savingsHtml}
      ${comparisonHtml}
      ${breakdownHtml}
    </div>
  `;
}

function addRate() {
  const labelEl = document.getElementById('newRateLabel');
  const valueEl = document.getElementById('newRateValue');
  const unitEl  = document.getElementById('newRateUnit');

  const label = labelEl.value.trim();
  const value = parseFloat(valueEl.value);
  const unit  = unitEl.value;

  if (!label) { alert('Please enter a label.'); return; }
  if (isNaN(value)) { alert('Please enter a numeric value.'); return; }

  const rates = S.rates;
  rates.push({ label, value, unit });
  S.rates = rates;

  labelEl.value = '';
  valueEl.value = '';
  renderRates();
}

function saveRate(i) {
  const label = document.querySelector(`.rate-edit-label[data-i="${i}"]`).value.trim();
  const value = parseFloat(document.querySelector(`.rate-edit-value[data-i="${i}"]`).value);
  const unit  = document.querySelector(`.rate-edit-unit[data-i="${i}"]`).value;

  if (!label || isNaN(value)) return;
  const rates = S.rates;
  rates[i] = { label, value, unit };
  S.rates = rates;
  renderRates();
  renderSummary();
}

function removeRate(i) {
  const rates = S.rates;
  rates.splice(i, 1);
  S.rates = rates;
  renderRates();
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportCsv() {
  const allEntries = S.entries;
  const rows = [['Date','Job','Hours','Notes']];
  Object.keys(allEntries).sort().forEach(key => {
    const [y, m] = key.split('-').map(Number);
    if (y !== currentYear || m - 1 !== currentMonth) return;
    allEntries[key].forEach(e => rows.push([key, e.job || e.type || '', e.hours, e.notes || '']));
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  download(`hours-${currentYear}-${String(currentMonth+1).padStart(2,'0')}.csv`, csv, 'text/csv');
}

function exportJson() {
  const allEntries = S.entries;
  const filtered = {};
  Object.keys(allEntries).sort().forEach(key => {
    const [y, m] = key.split('-').map(Number);
    if (y !== currentYear || m - 1 !== currentMonth) return;
    filtered[key] = allEntries[key];
  });
  download(`hours-${currentYear}-${String(currentMonth+1).padStart(2,'0')}.json`, JSON.stringify(filtered, null, 2), 'application/json');
}

function exportTimesheetJson(weekStartOverride) {
  const wsDate = weekStartOverride || currentWeekStart;
  if (!wsDate) return;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wsDate);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekKeys   = weekDays.map(d => toKey(d));
  const weekEnding = weekDays[6]; // Sunday

  const allEntries = S.entries;
  const { byRow, special } = computeWeekRtOt(weekKeys, allEntries);

  const jobs    = S.jobs;
  const jobRows = Object.values(byRow).map(({ jobLabel, costCode, rt, ot }) => {
    const def = jobs.find(j => jobKey(j) === jobLabel);
    return { number: def ? def.number : '', name: def ? def.name : jobLabel, costCode, rt, ot };
  }).sort((a, b) => {
    if (!a.number && !b.number) return 0;
    if (!a.number) return 1;
    if (!b.number) return -1;
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });

  const pad2 = n => String(n).padStart(2, '0');
  const weekEndingStr = `${pad2(weekEnding.getMonth()+1)}/${pad2(weekEnding.getDate())}/${weekEnding.getFullYear()}`;

  const mileage      = getMileageEntries().filter(e => parseFloat(e.miles) > 0);
  const expenses     = getExpenseEntries().filter(e => parseFloat(e.amount) > 0 || e.description);
  const designerName = localStorage.getItem('dht_designer_name') || '';
  const employeeNum  = localStorage.getItem('dht_employee_num')  || '';
  const payload  = { weekEnding: weekEndingStr, jobs: jobRows, special, mileage, expenses, designerName, employeeNum };

  // In Electron: invoke PS1 directly — no file download needed
  if (window.electronAPI) {
    const btn  = document.getElementById('exportTimesheetBtn');
    const hint = document.getElementById('timesheetHint');
    btn.disabled = true;
    btn.textContent = 'Filling…';
    if (hint) hint.textContent = 'Running PowerShell…';

    window.electronAPI.fillTimesheet(payload)
      .then(() => {
        btn.disabled = false;
        btn.textContent = 'Export to Timesheet';
        if (hint) hint.textContent = 'Done! Timesheet opened.';
        setTimeout(() => {
          if (hint) hint.textContent = 'Fills & opens your Excel timesheet automatically';
        }, 4000);
      })
      .catch(err => {
        btn.disabled = false;
        btn.textContent = 'Export to Timesheet';
        if (hint) hint.textContent = 'Error — see alert for details.';
        setTimeout(() => {
          if (hint) hint.textContent = 'Fills & opens your Excel timesheet automatically';
        }, 4000);
        alert('Timesheet fill failed:\n\n' + err.message);
      });
    return;
  }

  // Fallback for plain browser / PWA: download JSON
  const datePart = weekEndingStr.replace(/\//g, '-');
  download(`dht-timesheet-${datePart}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Theme Transition & Preview ─────────────────────────────────────────────
function applyThemeWithAnimation(theme) {
  const bar  = document.querySelector('.theme-bar') || document.getElementById('themePicker');
  const rect = bar ? bar.getBoundingClientRect() : null;
  const ox   = rect ? rect.left + rect.width  / 2 : window.innerWidth  / 2;
  const oy   = rect ? rect.top  + rect.height / 2 : window.innerHeight / 2;

  const newBg = THEME_COLORS[theme]?.bg || '#f5f6fa';

  // New theme's bg expands outward from origin; apply theme once it fully covers the screen
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;background:${newBg};clip-path:circle(0px at ${ox}px ${oy}px);transition:clip-path .65s cubic-bezier(0.4,0,0.2,1)`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.clipPath = `circle(200% at ${ox}px ${oy}px)`;
    overlay.addEventListener('transitionend', () => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('dht_theme', theme);
      if (typeof syncPush === 'function') syncPush();
      overlay.remove();
    }, { once: true });
  }));
}

function showThemePreview(theme, itemEl, list) {
  hideThemePreview();
  const c = THEME_COLORS[theme];
  if (!c) return;

  const name = theme.charAt(0).toUpperCase() + theme.slice(1);
  const panel = document.createElement('div');
  panel.id = 'theme-preview-panel';
  panel.innerHTML = `
    <div class="tp-window" style="background:${c.bg};border-color:${c.border}">
      <div class="tp-titlebar" style="background:${c.surface};border-bottom:2px solid ${c.primary}">
        <div class="tp-dot" style="background:${c.primary}"></div>
        <div class="tp-dot" style="background:${c.primary};opacity:.5"></div>
      </div>
      <div class="tp-body">
        <div class="tp-card" style="background:${c.surface};border-color:${c.border}">
          <div class="tp-bar" style="background:${c.primary}"></div>
          <div class="tp-line" style="background:${c.text};opacity:.7"></div>
          <div class="tp-line" style="background:${c.text};opacity:.35;width:60%"></div>
        </div>
        <div class="tp-card" style="background:${c.surface};border-color:${c.border}">
          <div class="tp-line" style="background:${c.text};opacity:.5"></div>
          <div class="tp-line" style="background:${c.text};opacity:.3;width:75%"></div>
        </div>
      </div>
      <div class="tp-label" style="color:${c.text};border-top:1px solid ${c.border}">${name}</div>
    </div>
  `;

  document.body.appendChild(panel);

  const listRect = list.getBoundingClientRect();
  panel.style.cssText += `position:fixed;z-index:9000;right:${window.innerWidth - listRect.left + 10}px;bottom:${window.innerHeight - listRect.bottom}px`;
}

function hideThemePreview() {
  document.getElementById('theme-preview-panel')?.remove();
}

// ── Custom Selects ─────────────────────────────────────────────────────────
function initCustomSelect(sel) {
  if (sel.dataset.csInit) return;
  sel.dataset.csInit = '1';

  const isThemePicker = sel.id === 'themePicker';

  const wrap = document.createElement('div');
  wrap.className = 'cs-wrap';
  if (isThemePicker) wrap.classList.add('cs-compact');

  // Carry flex sizing from the original select so layout stays intact
  const cs = getComputedStyle(sel);
  wrap.style.flexGrow   = cs.flexGrow;
  wrap.style.flexShrink = cs.flexShrink;
  wrap.style.flexBasis  = cs.flexBasis;
  if (cs.minWidth !== '0px') wrap.style.minWidth = cs.minWidth;

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.style.display = 'none';

  const display = document.createElement('div');
  display.className = 'cs-display';
  display.tabIndex  = 0;
  wrap.appendChild(display);

  const list = document.createElement('div');
  list.className = 'cs-list';
  wrap.appendChild(list);

  const sync = () => {
    display.textContent = sel.options[sel.selectedIndex]?.text || '';
  };

  const close = () => {
    list.classList.remove('cs-open');
    display.classList.remove('cs-active');
    hideThemePreview();
  };

  const open = () => {
    document.querySelectorAll('.cs-wrap').forEach(w => {
      if (w !== wrap) { w.querySelector('.cs-list')?.classList.remove('cs-open'); w.querySelector('.cs-display')?.classList.remove('cs-active'); }
    });
    list.innerHTML = '';
    let animIdx = 0;
    Array.from(sel.children).forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const lbl = document.createElement('div');
        lbl.className = 'cs-group-label';
        lbl.textContent = child.label;
        list.appendChild(lbl);
        Array.from(child.children).forEach(opt => {
          const item = document.createElement('div');
          item.className = 'cs-item' + (opt.selected ? ' cs-selected' : '');
          item.textContent = opt.text;
          item.style.animationDelay = `${animIdx++ * 40}ms`;
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sync();
            close();
          });
          list.appendChild(item);
        });
      } else {
        const item = document.createElement('div');
        item.className = 'cs-item' + (child.selected ? ' cs-selected' : '');
        item.textContent = child.text;
        item.style.animationDelay = `${animIdx++ * 40}ms`;
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          sel.value = child.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
          close();
        });
        if (isThemePicker) {
          item.addEventListener('mouseenter', () => showThemePreview(child.value, item, list));
          item.addEventListener('mouseleave', hideThemePreview);
        }
        list.appendChild(item);
      }
    });

    // Open upward if not enough space below
    const rect = wrap.getBoundingClientRect();
    if (window.innerHeight - rect.bottom < 220) {
      list.style.top    = 'auto';
      list.style.bottom = 'calc(100% + 4px)';
    } else {
      list.style.top    = '';
      list.style.bottom = '';
    }

    list.classList.add('cs-open');
    display.classList.add('cs-active');
  };

  display.addEventListener('click', e => {
    e.stopPropagation();
    list.classList.contains('cs-open') ? close() : open();
  });

  display.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); list.classList.contains('cs-open') ? close() : open(); }
    else if (e.key === 'Escape') close();
  });

  sel.addEventListener('change', sync);
  sync();
}

function applyCustomSelects(root = document) {
  root.querySelectorAll('select:not([data-cs-init])').forEach(initCustomSelect);
}

document.addEventListener('mousedown', e => {
  document.querySelectorAll('.cs-wrap').forEach(w => {
    if (!w.contains(e.target)) {
      w.querySelector('.cs-list')?.classList.remove('cs-open');
      w.querySelector('.cs-display')?.classList.remove('cs-active');
    }
  });
});

// ── Calendar Popup ─────────────────────────────────────────────────────────
let _popupTimer = null;

function showCalPopup(cell, key, entries) {
  clearTimeout(_popupTimer);

  let popup = document.getElementById('cal-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id        = 'cal-popup';
    popup.className = 'cal-popup';
    popup.addEventListener('mouseenter', () => clearTimeout(_popupTimer));
    popup.addEventListener('mouseleave', () => { _popupTimer = setTimeout(hideCalPopup, 120); });
    document.body.appendChild(popup);
  }

  const [y, m, d] = key.split('-').map(Number);
  const dateStr   = new Date(y, m-1, d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const total     = dayTotalHours(entries);

  popup.innerHTML = `
    <div class="cal-popup-header">
      <span class="cal-popup-date">${dateStr}</span>
      <span class="cal-popup-total">${total}h</span>
    </div>
    ${entries.map((e, i) => {
      const isSpecial = !!e.type;
      const label = isSpecial ? (SPECIAL_LABELS[e.type] || e.type) : esc(e.job);
      const colorStyle = isSpecial ? '' : `border-left: 3px solid var(--job-color-${jobColorIndex(e.job)});`;
      return `<div class="cal-popup-entry" data-key="${key}" data-idx="${i}" style="${colorStyle}">
        <div class="cal-popup-entry-top">
          <span class="cal-popup-job">${label}</span>
          <span class="cal-popup-hours">${e.hours}h</span>
        </div>
        ${!isSpecial && e.costCode ? `<div class="cal-popup-cc">${esc(e.costCode)}</div>` : ''}
        ${e.notes ? `<div class="cal-popup-notes">${esc(e.notes)}</div>` : ''}
      </div>`;
    }).join('')}
  `;

  popup.querySelectorAll('.cal-popup-entry').forEach(el => {
    el.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      const k = el.dataset.key;
      const i = parseInt(el.dataset.idx);
      hideCalPopup();
      if (selectedDate !== k) selectDate(k);
      showEntryDetail(k, i);
    });
  });

  const rect = cell.getBoundingClientRect();
  const pw   = 250;
  let left   = rect.left + window.scrollX;
  let top    = rect.bottom + window.scrollY + 6;
  if (left + pw > window.innerWidth - 8) left = rect.right + window.scrollX - pw;
  if (left < 8) left = 8;
  popup.style.left   = left + 'px';
  popup.style.top    = top + 'px';
  popup.style.bottom = '';
  requestAnimationFrame(() => {
    const ph = popup.offsetHeight || 120;
    if (rect.bottom + ph + 6 > window.innerHeight - 8) {
      popup.style.top = (rect.top + window.scrollY - ph - 6) + 'px';
    }
  });
}

function hideCalPopup() {
  const p = document.getElementById('cal-popup');
  if (p) p.remove();
}

function showEntryDetail(key, idx) {
  const entries = S.entries[key] || [];
  const e = entries[idx];
  if (!e) return;

  const [y, m, d] = key.split('-').map(Number);
  const dateStr   = new Date(y, m-1, d).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const isSpecial = !!e.type;
  const label     = isSpecial ? (SPECIAL_LABELS[e.type] || e.type) : e.job;

  document.getElementById('sidePanelTitle').textContent = 'Entry Detail';
  document.getElementById('sidePanelDate').textContent  = dateStr;
  const sc = document.getElementById('sideContent');
  sc.classList.add('fading');
  setTimeout(() => {
    sc.classList.remove('fading');
  sc.innerHTML = `
    <div class="entry-detail-card">
      <div class="entry-detail-label">${esc(label)}</div>
      ${!isSpecial && e.costCode ? `<div class="entry-detail-cc">${esc(e.costCode)}</div>` : ''}
      <div class="entry-detail-hours">${e.hours}h</div>
      ${e.notes ? `<div class="entry-detail-notes">${esc(e.notes)}</div>` : '<div class="entry-detail-notes muted-cell">No notes.</div>'}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" id="detailBackBtn">&#8592; Back</button>
      <button class="btn btn-primary btn-sm" id="detailEditBtn">Edit</button>
      <button class="btn btn-danger btn-sm" id="detailDeleteBtn">Delete</button>
    </div>
  `;

  document.getElementById('detailBackBtn').addEventListener('click', () => renderSidePanel(key));
  document.getElementById('detailDeleteBtn').addEventListener('click', () => deleteEntry(key, idx));
  document.getElementById('detailEditBtn').addEventListener('click', () => openEditEntry(key, idx));
  }, 100);
}

function openEditEntry(key, idx) {
  const entries = S.entries[key] || [];
  const e = entries[idx];
  if (!e) return;
  const isSpecial = !!e.type;

  renderSidePanel(key);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const catSel = document.getElementById('entryCategory');
    if (!catSel) return;

    catSel.value = isSpecial ? e.type : 'job';
    catSel.dispatchEvent(new Event('change'));

    setTimeout(() => {
      if (!isSpecial) {
        const jobSel = document.getElementById('entryJob');
        if (jobSel) { jobSel.value = e.job; jobSel.dispatchEvent(new Event('change')); }
        const ccSel = document.getElementById('entryCostCode');
        if (ccSel) { ccSel.value = e.costCode || 'Overhead'; ccSel.dispatchEvent(new Event('change')); }
      }
      const hoursEl = document.getElementById('entryHours');
      if (hoursEl) hoursEl.value = e.hours;
      const notesEl = document.getElementById('entryNotes');
      if (notesEl) notesEl.value = e.notes || '';

      document.querySelectorAll('#sideContent .cs-wrap').forEach(wrap => {
        const sel  = wrap.querySelector('select');
        const disp = wrap.querySelector('.cs-display');
        if (sel && disp) disp.textContent = sel.options[sel.selectedIndex]?.text || '';
      });

      const addBtn = document.getElementById('addEntryBtn');
      if (!addBtn) return;
      addBtn.textContent = 'Save Changes';
      const fresh = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(fresh, addBtn);
      fresh.addEventListener('click', () => {
        const category = document.getElementById('entryCategory').value;
        const hours    = parseFloat(document.getElementById('entryHours').value);
        const notes    = document.getElementById('entryNotes').value.trim();
        if (!hours || hours <= 0) { alert('Please enter valid hours.'); return; }
        const all = S.entries;
        if (!all[key]) return;
        if (category === 'job') {
          const job      = document.getElementById('entryJob')?.value.trim();
          const costCode = document.getElementById('entryCostCode')?.value || 'Overhead';
          if (!job) { alert('Please select a job.'); return; }
          all[key][idx] = { job, costCode, hours, notes };
        } else {
          all[key][idx] = { type: category, hours, notes };
        }
        S.entries = all;
        renderCalendar(); renderSummary(); renderStatStrip(); renderRightColJobs(); renderWeeklySummary(); renderJobsList(); renderSidePanel(key);
        showToast('Entry updated.');
      });
    }, 120);
  }));
}

// ── Backup & Restore ───────────────────────────────────────────────────────
function exportBackup() {
  const backup = {
    version: 1,
    exported: new Date().toISOString(),
    entries: S.entries,
    jobs: S.jobs,
    rates: S.rates,
  };
  const date = localISODate(new Date());
  download(`dht-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
  localStorage.setItem('dht_last_backup', String(Date.now()));
  showToast(`Backup saved: dht-backup-${date}.json`);
}

// Gentle reminder to export a backup if it's been a while (and there's data
// worth losing). Sync to the cloud covers most cases, but a local export is
// the user's own safety net.
function initBackupNudge() {
  const DAYS = 14;
  const hasData = Object.keys(JSON.parse(localStorage.getItem('dht_entries') || '{}')).length > 0;
  if (!hasData) return;
  const last = parseInt(localStorage.getItem('dht_last_backup') || '0', 10);
  const ageDays = (Date.now() - last) / 86400000;
  if (last && ageDays < DAYS) return;
  // Don't nag on the very first launch; wait until there's a real gap.
  if (!last) { localStorage.setItem('dht_last_backup', String(Date.now())); return; }
  setTimeout(() => {
    showToast('It\'s been a while since your last backup.', 8000,
      { label: 'Back up now', fn: exportBackup });
  }, 4000);
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('Backup file is too large (max 10 MB).'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        showImportModal(data);
      } catch {
        alert('Could not read file — make sure it is a valid JSON backup.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function showImportModal(data) {
  // Detect format: full backup vs raw entries export vs unknown
  const isBackup  = data.version === 1 && ('entries' in data || 'jobs' in data);
  const isEntries = !isBackup && typeof data === 'object' && !Array.isArray(data) &&
    Object.keys(data).length > 0 &&
    Object.keys(data).every(k => /^\d{4}-\d{2}-\d{2}$/.test(k));

  if (!isBackup && !isEntries) {
    alert('Unrecognised file format.\n\nExpected a DHT backup or a month/JSON export from this app.');
    return;
  }

  // Build summary lines
  const lines = [];
  if (isBackup) {
    if (data.exported) lines.push(`Exported: ${new Date(data.exported).toLocaleString()}`);
    const dayCount = Object.keys(data.entries || {}).length;
    lines.push(`${dayCount} day${dayCount !== 1 ? 's' : ''} with entries`);
    lines.push(`${(data.jobs  || []).length} job${(data.jobs  || []).length !== 1 ? 's' : ''}`);
    lines.push(`${(data.rates || []).length} rate${(data.rates || []).length !== 1 ? 's' : ''}`);
  } else {
    lines.push(`Hours export — ${Object.keys(data).length} days with entries`);
    lines.push('(No job or rate data in this file)');
  }

  // Remove any existing modal
  document.getElementById('importModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'importModal';
  modal.innerHTML = `
    <div class="import-backdrop"></div>
    <div class="import-dialog">
      <div class="import-dialog-title">Import Data</div>
      <div class="import-dialog-summary">${lines.map(l => `<div>${l}</div>`).join('')}</div>
      <div class="import-dialog-options">
        <label class="import-option">
          <input type="radio" name="importMode" value="merge" checked>
          <span><strong>Merge</strong> — add imported entries to existing data (keeps current data)</span>
        </label>
        <label class="import-option">
          <input type="radio" name="importMode" value="replace">
          <span><strong>Replace</strong> — overwrite all current data with the imported file</span>
        </label>
      </div>
      <div class="import-dialog-actions">
        <button class="btn btn-ghost" id="importCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="importConfirmBtn">Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.import-backdrop').addEventListener('click', () => modal.remove());
  document.getElementById('importCancelBtn').addEventListener('click', () => modal.remove());
  document.getElementById('importConfirmBtn').addEventListener('click', () => {
    const mode = modal.querySelector('input[name="importMode"]:checked').value;
    doImport(data, isBackup, mode);
    modal.remove();
  });
}

function doImport(data, isBackup, mode) {
  if (mode === 'replace') {
    if (isBackup) {
      if (data.entries) S.entries = data.entries;
      if (data.jobs)    S.jobs    = data.jobs;
      if (data.rates)   S.rates   = data.rates;
    } else {
      S.entries = data; // raw entries-only export
    }
  } else {
    // Merge entries: combine by day key, avoid exact duplicates
    const existing = S.entries;
    const incoming = isBackup ? (data.entries || {}) : data;
    Object.keys(incoming).forEach(key => {
      if (!existing[key]) {
        existing[key] = incoming[key];
      } else {
        incoming[key].forEach(newE => {
          const isDupe = existing[key].some(e =>
            e.hours === newE.hours &&
            e.job   === newE.job   &&
            e.type  === newE.type  &&
            e.notes === newE.notes
          );
          if (!isDupe) existing[key].push(newE);
        });
      }
    });
    S.entries = existing;

    if (isBackup) {
      // Merge jobs: add jobs whose key doesn't already exist
      const existingJobs = S.jobs;
      const existingKeys = new Set(existingJobs.map(j => jobKey(j)));
      (data.jobs || []).forEach(j => {
        if (!existingKeys.has(jobKey(j))) existingJobs.push(j);
      });
      S.jobs = existingJobs;

      // Merge rates: add rates whose label doesn't already exist
      const existingRates  = S.rates;
      const existingLabels = new Set(existingRates.map(r => r.label));
      (data.rates || []).forEach(r => {
        if (!existingLabels.has(r.label)) existingRates.push(r);
      });
      S.rates = existingRates;
    }
  }

  renderCalendar();
  renderSummary();
  renderWeeklySummary();
  renderJobsList();
  renderRates();

  const dayCount = Object.keys(isBackup ? (data.entries || {}) : data).length;
  const jobCount = isBackup ? (data.jobs || []).length : 0;
  const rateCount = isBackup ? (data.rates || []).length : 0;
  const parts = [`${dayCount} day${dayCount !== 1 ? 's' : ''} imported`];
  if (jobCount) parts.push(`${jobCount} job${jobCount !== 1 ? 's' : ''}`);
  if (rateCount) parts.push(`${rateCount} rate${rateCount !== 1 ? 's' : ''}`);
  showToast(parts.join(' · '));
}

// ── Help Guide ─────────────────────────────────────────────────────────────
function showHelp() {
  if (document.getElementById('helpModal')) return;

  function sec(id, icon, title, desc, stepsHtml) {
    return `<div class="help-section" id="${id}">
      <div class="help-section-title">${icon} ${title}</div>
      <div class="help-section-desc">${desc}</div>
      <div class="help-steps">${stepsHtml}</div>
    </div><hr class="help-divider">`;
  }
  function step(n, html) {
    return `<div class="help-step"><div class="help-step-num">${n}</div><div class="help-step-text">${html}</div></div>`;
  }
  function note(html) { return `<div class="help-note">${html}</div>`; }
  function sub(items) {
    return `<div class="help-sub-steps">${items.map((t, i) => `<div class="help-sub-step"><strong>${String.fromCharCode(97 + i)}.</strong> ${t}</div>`).join('')}</div>`;
  }

  const sections = [
    sec('hs1', '🚀', '1. Getting started',
      'Set up your profile before logging your first hours so your name and employee number appear correctly on exported timesheets.',
      [
        step(1, 'Open the app at <strong>wfsdestrack.web.app</strong>, or launch the desktop app.'),
        step(2, '<strong>Open Settings:</strong>' + sub([
          '<strong>Desktop app (Windows):</strong> click the <strong>⚙ Settings</strong> button in the bottom-right corner of the screen.',
          '<strong>Mobile / web browser:</strong> tap the <strong>⚙ Settings</strong> button at the right end of the bottom navigation bar (swipe left if you don\'t see it).',
        ])),
        step(3, 'Enter your <strong>Designer Name</strong> and <strong>Employee #</strong> in the fields provided, then click <strong>Save</strong>.'),
        step(4, 'Go to the <strong>Jobs</strong> tab and add at least one job before logging hours (see section 5).'),
      ].join('')
    ),
    sec('hs2', '🕐', '2. Logging hours',
      'Hours are logged day by day on the calendar. You can add multiple entries per day for different jobs.',
      [
        step(1, 'On the <strong>Calendar</strong> view, click the day you want to log hours for. A panel will slide open on the right.'),
        step(2, 'Select a <strong>Job</strong> from the dropdown. Only jobs you have added will appear here.'),
        step(3, 'Select a <strong>Cost Code</strong> (e.g. Design, Shop Drawings, Site Visit).'),
        step(4, 'Enter the number of <strong>Hours</strong> and any optional <strong>Notes</strong>.'),
        step(5, 'Click <strong>Add Entry</strong>. The day on the calendar will update to show the total hours logged.'),
        step(6, 'To <strong>edit</strong> an entry, click the day, then click the entry in the list and press <strong>Edit</strong>. To <strong>delete</strong> it, press the trash icon — you will have 5 seconds to undo.'),
        note('You can log multiple entries on the same day for different jobs or cost codes.'),
      ].join('')
    ),
    sec('hs3', '📊', '3. Viewing summaries &amp; dashboard',
      'Three views let you review your hours at different levels of detail.',
      [
        step(1, 'Click the <strong>Month</strong> tab to see a breakdown of all hours logged this month, grouped by job and cost code, plus a savings estimate.'),
        step(2, 'Click the <strong>Week</strong> tab to see a table of hours broken down by day for the selected week. Use the arrow buttons at the top of the Week tab to navigate between weeks.'),
        step(3, 'Click the <strong>Dashboard</strong> tab to see analytics for the current month: total hours, miles, and earnings across 3 charts — hours by job, an 8-week trend line, and hours by day of the week.'),
        step(4, 'Use the <strong>arrow buttons</strong> at the top of the calendar to navigate between months. All summaries update automatically.'),
      ].join('')
    ),
    sec('hs4', '🚗', '4. Mileage &amp; expenses',
      'Track job-related mileage and out-of-pocket expenses weekly. These appear on your exported timesheet.',
      [
        step(1, 'Click the <strong>Week</strong> tab, then scroll down to the <strong>Mileage</strong> and <strong>Expenses</strong> sections.'),
        step(2, 'Click <strong>Add Mileage</strong>. Enter the <strong>PO number</strong>, a brief <strong>description</strong>, and the <strong>miles</strong> driven.'),
        step(3, 'Click <strong>Add Expense</strong>. Enter the <strong>PO number</strong>, a <strong>description</strong>, and the <strong>dollar amount</strong>.'),
        step(4, 'To remove an entry, click the <strong>✕</strong> button. You will have 5 seconds to undo.'),
        note('You can add up to 4 mileage entries and 3 expense entries per week.'),
      ].join('')
    ),
    sec('hs5', '💼', '5. Managing jobs',
      'Jobs must be added before you can log hours against them. The easiest way to load your active jobs is to export them directly from the SharePoint job dashboard.',
      [
        step(1, 'Go to the <strong>Jobs</strong> tab.'),
        step(2, '<strong>To import from SharePoint (recommended):</strong>' + sub([
          'Open the <strong>Job Dashboard</strong> in SharePoint.',
          'Filter the list by your <strong>designer name</strong> so only your jobs are shown.',
          'Hover your cursor anywhere inside the dashboard — three dots (<strong>…</strong>) will appear in the top-right corner of the list. Click them.',
          'Click <strong>Export data</strong>. A file called <strong>data.xlsx</strong> will download to your computer.',
          'Back in the Design Hours Tracker, click <strong>Import from Excel</strong>.',
          'Select the <strong>data.xlsx</strong> file that was just downloaded.',
          'The app will detect the column headers automatically. Review the mapping and click <strong>Import</strong>.',
        ])),
        step(3, '<strong>To add a single job manually:</strong> enter the <strong>Job #</strong> and <strong>Job Name</strong> in the fields at the top, then click <strong>Add Job</strong>. You can optionally enter a starting hours balance and a total hours budget.'),
        step(4, '<strong>To edit a job:</strong> click <strong>Edit</strong> on any job card. Update any fields and click <strong>Save</strong>.'),
        step(5, '<strong>To set an hours budget:</strong> open the Edit form for the job, enter the total hours in the <strong>Budget</strong> field, and save. A progress bar will appear on the card showing hours used vs. remaining.'),
        step(6, '<strong>To duplicate a job</strong> (useful for recurring or similar jobs): click <strong>Duplicate</strong> on any card. The add-job form at the top will pre-fill with that job\'s details — edit what you need and click <strong>Add Job</strong>.'),
        step(7, '<strong>To archive a completed job:</strong> click <strong>Archive</strong> on the card. Archived jobs are hidden from the list and from the hour-logging dropdown, but their history is preserved. To restore one, check <strong>Show archived</strong> at the bottom of the list and click <strong>Restore</strong>.'),
        step(8, 'To permanently remove a job, click the <strong>✕</strong> button on the card. You will have 5 seconds to undo.'),
        note('Re-importing from SharePoint will not create duplicates — any jobs already in the app are skipped automatically.'),
      ].join('')
    ),
    sec('hs6', '📄', '6. Exporting the timesheet',
      'The timesheet export automatically fills in your Wiginton Designer Timesheet with your hours, mileage, and expenses for any selected week. Two formats are available — Excel and PDF — and both are only available on the desktop (Windows) app.',
      [
        step(1, 'Make sure your <strong>Designer Name</strong> and <strong>Employee #</strong> are saved in Settings (⚙ bottom-right corner).'),
        step(2, 'Use the calendar arrows to navigate to the week you want to export.'),
        step(3, 'Click the <strong>Week</strong> tab.'),
        step(4, '<strong>To export as Excel (.xlsx):</strong> click <strong>Export to Timesheet</strong>. The filled-in spreadsheet will open directly in Excel so you can review, adjust, and save it.' +
          note('This is the standard format — use this when you need to make any manual edits before submitting.')),
        step(5, '<strong>To export as PDF:</strong> click <strong>Export to PDF</strong> (appears next to the Excel button). The app fills the same timesheet template and saves it as a PDF in the same folder as your timesheet template file.' +
          note('Use PDF when you need to email or print the timesheet without it being editable.')),
        note('Both export buttons are only visible in the desktop (Windows) app — not on the website or mobile browser.'),
      ].join('')
    ),
    sec('hs7', '📈', '7. Dashboard &amp; analytics',
      'The Dashboard tab gives you a visual overview of your productivity for the current month at a glance.',
      [
        step(1, 'Click the <strong>Dashboard</strong> tab.'),
        step(2, 'The top row shows four stat cards: <strong>Hours This Month</strong>, <strong>Active Jobs</strong>, <strong>Miles This Month</strong>, and <strong>Est. Earnings</strong> (based on your hourly rate if one is set in Rates &amp; Calcs).'),
        step(3, 'The <strong>Hours by Job</strong> bar chart shows how your time is split across each job this month, color-coded to match the job dots on the calendar.'),
        step(4, 'The <strong>8-Week Trend</strong> line chart shows your weekly hour totals for the past 8 weeks so you can spot patterns.'),
        step(5, 'The <strong>Hours by Day</strong> bar chart shows which days of the week you tend to work the most.'),
        note('The Dashboard always reflects the currently selected month. Use the calendar arrows to compare different months.'),
      ].join('')
    ),
    sec('hs8', '☁️', '8. Syncing across devices',
      'Create a free sync account to keep your hours in sync between the website, desktop app, and your phone.',
      [
        step(1, 'Open <strong>Settings</strong> (⚙ bottom-right). Find the <strong>sync status dot</strong> at the bottom of the panel.'),
        step(2, 'Click <strong>Sign in</strong>. If you don\'t have an account yet, click <strong>Create account</strong> and enter an email and password.'),
        step(3, 'Once signed in, the dot will turn green and show <strong>Synced</strong>. Your data will sync automatically whenever you\'re online.'),
        step(4, 'Sign in with the <strong>same email and password</strong> on any other device to access your data there.'),
        note('Each designer should use their own sync account. Data is private to your account.'),
      ].join('')
    ),
    sec('hs9', '🔔', '9. Daily reminder notification',
      'Set a daily reminder so the app notifies you to log your hours at the end of each day.',
      [
        step(1, 'Click the <strong>⚙ Settings</strong> button (bottom-right corner).'),
        step(2, 'Under <strong>Daily Reminder</strong>, click the time field and choose your preferred time, then click <strong>Save</strong>.'),
        step(3, 'Windows will show a notification at that time each day while the app is running.'),
        step(4, 'To cancel the reminder, click <strong>Clear time</strong> next to the field and then <strong>Save</strong>.'),
      ].join('')
    ),
  ].join('');

  const toc = `<div class="help-toc">
    <div class="help-toc-label">Contents</div>
    <ol class="help-toc-links">
      <li><a href="#hs1">1. Getting started</a></li>
      <li><a href="#hs2">2. Logging hours</a></li>
      <li><a href="#hs3">3. Viewing summaries &amp; dashboard</a></li>
      <li><a href="#hs4">4. Mileage &amp; expenses</a></li>
      <li><a href="#hs5">5. Managing jobs</a></li>
      <li><a href="#hs6">6. Exporting the timesheet</a></li>
      <li><a href="#hs7">7. Dashboard &amp; analytics</a></li>
      <li><a href="#hs8">8. Syncing across devices</a></li>
      <li><a href="#hs9">9. Daily reminder notification</a></li>
    </ol>
  </div>`;

  const m = document.createElement('div');
  m.id = 'helpModal';
  m.className = 'help-modal-overlay';
  m.innerHTML = `
    <div class="help-modal-dialog">
      <div class="help-modal-header">
        <span class="help-modal-title">How to use Design Hours Tracker</span>
        <button class="btn btn-ghost btn-xs" id="helpCloseBtn">✕ Close</button>
      </div>
      <div class="help-modal-body" id="helpModalBody">
        ${toc}
        ${sections}
      </div>
    </div>`;
  document.body.appendChild(m);

  const closeHelp = () => { m.classList.add('modal-closing'); setTimeout(() => m.remove(), 200); };
  document.getElementById('helpCloseBtn').addEventListener('click', closeHelp);
  m.addEventListener('click', e => { if (e.target === m) closeHelp(); });

  // TOC links scroll inside the modal body
  m.querySelectorAll('.help-toc-links a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── Map ─────────────────────────────────────────────────────────────────────
async function geocodeAddress(address) {
  if (!address) return null;
  try {
    const res = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address),
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'DesignHoursTracker/1.0' } }
    );
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

async function geocodeJobAddress(idx) {
  const addrEl = document.getElementById(`je-address-${idx}`);
  if (!addrEl) return;
  const address = addrEl.value.trim();
  if (!address) { showToast('Enter an address first.', 3000); return; }
  const btn = document.querySelector(`[data-action="geocode-job"][data-idx="${idx}"]`);
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  const coords = await geocodeAddress(address);
  if (btn) btn.disabled = false;
  if (!coords) {
    if (btn) btn.textContent = 'Locate';
    showToast('Address not found — try adding city and state.', 4000);
    return;
  }
  document.getElementById(`je-lat-${idx}`).value = coords.lat;
  document.getElementById(`je-lng-${idx}`).value = coords.lng;
  if (btn) { btn.textContent = '✓ Located'; btn.classList.add('located'); }
}

let _jobMap = null;
let _jobMarkers = null;

function renderMap() {
  const mapEl = document.getElementById('jobMap');
  if (!mapEl || mapEl.offsetWidth === 0) return;
  const jobs = S.jobs.filter(j => j.lat != null && j.lng != null);

  if (!_jobMap) {
    _jobMap = L.map('jobMap', { zoomControl: true }).setView([32.7767, -96.7970], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_jobMap);
    _jobMarkers = L.layerGroup().addTo(_jobMap);
  } else {
    _jobMarkers.clearLayers();
    _jobMap.invalidateSize();
  }

  if (!jobs.length) {
    mapEl.insertAdjacentHTML('afterbegin',
      '<p class="map-empty-msg placeholder" style="padding:20px">Edit a job and add an address to see it pinned here.</p>');
    return;
  }
  document.querySelector('.map-empty-msg')?.remove();

  const bounds = [];
  jobs.forEach(j => {
    const label = (j.number ? j.number + ' — ' : '') + j.name;
    const icon = L.divIcon({
      className: 'job-map-icon',
      html: `<div class="map-pin"><svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19S22 19.25 22 11C22 4.925 17.075 0 11 0z" fill="var(--primary,#3b6fd4)"/><circle cx="11" cy="11" r="4.5" fill="white"/></svg><div class="map-pin-label">${esc(label)}</div></div>`,
      iconSize: [22, 30],
      iconAnchor: [11, 30],
      popupAnchor: [0, -32],
    });
    L.marker([j.lat, j.lng], { icon })
      .addTo(_jobMarkers)
      .bindPopup(`<strong>${esc(label)}</strong>${j.address ? '<br/><span style="font-size:.85em;color:#666">' + esc(j.address) + '</span>' : ''}`);
    bounds.push([j.lat, j.lng]);
  });

  if (bounds.length === 1) {
    _jobMap.setView(bounds[0], 14);
  } else {
    _jobMap.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
  }
  setTimeout(() => _jobMap.invalidateSize(), 120);
}

// ── Offline Indicator ─────────────────────────────────────────────────────────
function initOfflineDot() {
  const dot = document.getElementById('offlineDot');
  if (!dot) return;
  function update() {
    dot.classList.toggle('offline', !navigator.onLine);
    dot.title = navigator.onLine ? 'Online' : 'Offline — changes will sync when reconnected';
  }
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ── Web / Mobile daily reminder ────────────────────────────────────────────────
function initWebReminder() {
  const savedTime = localStorage.getItem('dht_web_reminder');
  // Schedule based on saved time
  if (savedTime) scheduleWebReminder(savedTime);
}

function scheduleWebReminder(timeStr) {
  if (!timeStr) return;
  clearTimeout(window._webReminderTimer);
  function fireNext() {
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    window._webReminderTimer = setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('Design Hours Tracker', { body: "Don't forget to log your hours for today!" });
      }
      fireNext();
    }, next - now);
  }
  fireNext();
}

// ── PDF Export ─────────────────────────────────────────────────────────────────
function openWeekPickerModal(confirmLabel, onConfirm, title) {
  const modal   = document.getElementById('pdfWeekModal');
  const titleEl = document.getElementById('pdfWeekTitle');
  const label   = document.getElementById('pdfWeekLabel');
  const picker  = document.getElementById('pdfWeekPicker');
  const prevBtn = document.getElementById('pdfWeekPrev');
  const nextBtn = document.getElementById('pdfWeekNext');
  const confirm = document.getElementById('pdfWeekConfirm');
  const cancel  = document.getElementById('pdfWeekCancel');

  confirm.textContent = confirmLabel;
  if (titleEl && title) titleEl.textContent = title;

  let ws = mondayOf(currentWeekStart || new Date());

  function updateUI() {
    const end = new Date(ws);
    end.setDate(end.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    label.textContent = `${fmt(ws)} – ${fmt(end)}, ${end.getFullYear()}`;
    picker.value = localISODate(ws);
  }

  prevBtn.onclick = () => { ws.setDate(ws.getDate() - 7); updateUI(); };
  nextBtn.onclick = () => { ws.setDate(ws.getDate() + 7); updateUI(); };
  picker.onchange = () => {
    const [y, m, d] = picker.value.split('-').map(Number);
    ws = mondayOf(new Date(y, m - 1, d));
    updateUI();
  };

  cancel.onclick  = () => { modal.style.display = 'none'; };
  confirm.onclick = () => { modal.style.display = 'none'; onConfirm(new Date(ws)); };
  modal.onclick   = e => { if (e.target === modal) modal.style.display = 'none'; };

  updateUI();
  modal.style.display = 'flex';
}

function openPdfWeekPicker() {
  if (!window.electronAPI && !window.generateTimesheetPdfInBrowser) return;
  openWeekPickerModal('Export PDF', ws => exportTimesheetPdf(ws), 'Export Week to PDF');
}

function exportTimesheetPdf(weekStartOverride) {
  if (!window.electronAPI && !window.generateTimesheetPdfInBrowser) return;
  const wsDate = weekStartOverride || currentWeekStart;
  if (!wsDate) return;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wsDate);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekKeys   = weekDays.map(d => toKey(d));
  const weekEnding = weekDays[6];

  const allEntries = S.entries;
  const { byRow, special } = computeWeekRtOt(weekKeys, allEntries);

  const jobs    = S.jobs;
  const jobRows = Object.values(byRow).map(({ jobLabel, costCode, rt, ot }) => {
    const def = jobs.find(j => jobKey(j) === jobLabel);
    return { number: def ? def.number : '', name: def ? def.name : jobLabel, costCode, rt, ot };
  }).sort((a, b) => {
    if (!a.number && !b.number) return 0;
    if (!a.number) return 1;
    if (!b.number) return -1;
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });

  const pad2 = n => String(n).padStart(2, '0');
  const weekEndingStr = `${pad2(weekEnding.getMonth()+1)}/${pad2(weekEnding.getDate())}/${weekEnding.getFullYear()}`;

  const mileage      = getMileageEntries().filter(e => parseFloat(e.miles) > 0);
  const expenses     = getExpenseEntries().filter(e => parseFloat(e.amount) > 0 || e.description);
  const designerName = localStorage.getItem('dht_designer_name') || '';
  const employeeNum  = localStorage.getItem('dht_employee_num')  || '';
  const payload      = { weekEnding: weekEndingStr, jobs: jobRows, special, mileage, expenses, designerName, employeeNum };

  const btn  = document.getElementById('exportPdfBtn');
  const hint = document.getElementById('timesheetHint');
  const done = msg => {
    if (btn) { btn.disabled = false; btn.textContent = 'Export to PDF'; }
    if (hint) { hint.textContent = msg; setTimeout(() => { if (hint) hint.textContent = 'Fills & opens your timesheet automatically'; }, 4000); }
  };
  if (btn) { btn.disabled = true; btn.textContent = 'Generating PDF…'; }

  if (window.electronAPI) {
    // Desktop: Excel fills the template and opens the PDF.
    window.electronAPI.fillTimesheetPdf(payload)
      .then(() => done('Done! PDF opened.'))
      .catch(err => { done('Error — see alert.'); alert('PDF export failed:\n\n' + err.message); });
  } else {
    // Webapp: fill the official form client-side with pdf-lib and download it.
    const fname = 'Timesheet-' + weekEndingStr.replace(/\//g, '-') + '.pdf';
    window.generateTimesheetPdfInBrowser(payload, fname)
      .then(() => done('Done! PDF downloaded.'))
      .catch(err => { done('Error.'); alert('PDF export failed:\n\n' + (err && err.message || err)); });
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const el = document.getElementById('tab-dashboard');
  if (!el || el.style.display === 'none') return;

  const allEntries = S.entries;
  const jobs = S.jobs.filter(j => !j.archived);
  const rates = S.rates;
  const hourlyRate = rates.find(r => r.unit === '$/hr');
  const rateVal = hourlyRate ? parseFloat(hourlyRate.value) || 0 : 0;

  // ── This-month totals ──
  const monthKey = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}`;
  let monthHours = 0;
  const hoursByJob = {};
  const hoursByDow = [0,0,0,0,0,0,0]; // Mon-Sun → index 0-6

  Object.entries(allEntries).forEach(([dateKey, dayEntries]) => {
    if (!dateKey.startsWith(monthKey)) return;
    const dow = new Date(dateKey + 'T00:00:00').getDay(); // 0=Sun
    const dowIdx = dow === 0 ? 6 : dow - 1; // convert to Mon=0..Sun=6
    (dayEntries || []).forEach(e => {
      const h = parseFloat(e.hours) || 0;
      monthHours += h;
      const jk = e.job || 'Unknown';
      hoursByJob[jk] = (hoursByJob[jk] || 0) + h;
      hoursByDow[dowIdx] += h;
    });
  });

  // ── 8-week trend ──
  const weekTotals = [];
  const weekLabels = [];
  const today = new Date();
  today.setHours(0,0,0,0);
  const thisMon = mondayOf(today);

  for (let w = 7; w >= 0; w--) {
    const mon = new Date(thisMon);
    mon.setDate(thisMon.getDate() - w * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    let wh = 0;
    for (let d = new Date(mon); d <= sun; d.setDate(d.getDate() + 1)) {
      const k = toKey(d);
      (allEntries[k] || []).forEach(e => { wh += parseFloat(e.hours) || 0; });
    }
    weekTotals.push(wh);
    weekLabels.push(`${mon.getMonth()+1}/${mon.getDate()}`);
  }

  // ── Mileage this month ──
  let monthMiles = 0;
  Object.entries(S.mileage).forEach(([wk]) => {
    const entries = S.mileage[wk] || [];
    // wk format: YYYY-MM-DD (Monday of week)
    if (wk.startsWith(monthKey.substring(0,7))) {
      entries.forEach(e => { monthMiles += parseFloat(e.miles) || 0; });
    }
  });

  const earnings = monthHours * rateVal;
  const activeJobCount = jobs.length;

  el.innerHTML = `
    <div class="dash-grid">
      <div class="dash-stat">
        <div class="dash-stat-label">Hours this month</div>
        <div class="dash-stat-value">${monthHours.toFixed(1)}</div>
        <div class="dash-stat-sub">${new Date(currentYear, currentMonth).toLocaleString('default',{month:'long'})} ${currentYear}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Est. earnings</div>
        <div class="dash-stat-value">${rateVal > 0 ? '$' + earnings.toFixed(0) : '—'}</div>
        <div class="dash-stat-sub">${rateVal > 0 ? `@ $${rateVal}/hr` : 'Set a $/hr rate to calculate'}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Active jobs</div>
        <div class="dash-stat-value">${activeJobCount}</div>
        <div class="dash-stat-sub">${S.jobs.filter(j=>j.archived).length} archived</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Miles this month</div>
        <div class="dash-stat-value">${monthMiles.toFixed(0)}</div>
        <div class="dash-stat-sub">mi logged</div>
      </div>
    </div>
    <div class="dash-charts">
      <div class="dash-chart-card">
        <div class="dash-chart-title">Hours by job — ${new Date(currentYear,currentMonth).toLocaleString('default',{month:'short'})}</div>
        <canvas id="dashJobChart" height="220"></canvas>
      </div>
      <div class="dash-chart-card">
        <div class="dash-chart-title">8-week trend</div>
        <canvas id="dashTrendChart" height="220"></canvas>
      </div>
    </div>
    <div class="dash-chart-card dash-chart-full">
      <div class="dash-chart-title">Hours by day of week — all time</div>
      <canvas id="dashDowChart" height="160"></canvas>
    </div>
  `;

  // Draw after browser lays out
  requestAnimationFrame(() => {
    _drawJobChart(document.getElementById('dashJobChart'), hoursByJob, jobs);
    _drawTrendChart(document.getElementById('dashTrendChart'), weekTotals, weekLabels);
    _drawDowChart(document.getElementById('dashDowChart'), hoursByDow);
  });
}

function _chartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text:    s.getPropertyValue('--text').trim()    || '#1e2235',
    muted:   s.getPropertyValue('--muted').trim()   || '#6b7594',
    border:  s.getPropertyValue('--border').trim()  || '#dde1ec',
    primary: s.getPropertyValue('--primary').trim() || '#3b6fd4',
    jobColors: [0,1,2,3,4,5,6,7].map(n => s.getPropertyValue(`--job-color-${n}`).trim()),
  };
}

function _drawJobChart(canvas, hoursByJob, jobs) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const c = _chartColors();
  const entries = Object.entries(hoursByJob).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 10);

  if (!entries.length) {
    ctx.fillStyle = c.muted; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No hours logged this month', W/2, H/2); return;
  }

  const maxVal = Math.max(...entries.map(([,v]) => v));
  const padL = 130, padR = 50, padT = 8, padB = 8;
  const barH = Math.min(22, (H - padT - padB) / entries.length - 4);
  const totalH = entries.length * (barH + 4) - 4;
  const startY = padT + (H - padT - padB - totalH) / 2;

  entries.forEach(([jk, hrs], idx) => {
    const job = jobs.find(j => jobKey(j) === jk);
    const label = job ? (job.number ? `${job.number} ${job.name}` : job.name) : jk;
    const y = startY + idx * (barH + 4);
    const barW = ((hrs / maxVal) * (W - padL - padR));

    // Color matching job index
    const ci = jobs.indexOf(job);
    ctx.fillStyle = c.jobColors[ci % c.jobColors.length] || c.primary;
    ctx.beginPath();
    ctx.roundRect(padL, y, Math.max(4, barW), barH, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = c.text; ctx.font = `${Math.min(12, barH-2)}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const labelTxt = label.length > 18 ? label.slice(0,17)+'…' : label;
    ctx.fillText(labelTxt, padL - 6, y + barH / 2);

    // Value
    ctx.textAlign = 'left'; ctx.fillStyle = c.muted;
    ctx.fillText(hrs.toFixed(1) + 'h', padL + barW + 6, y + barH / 2);
  });
}

function _drawTrendChart(canvas, values, labels) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const c = _chartColors();
  const padL = 36, padR = 16, padT = 16, padB = 32;
  const maxVal = Math.max(...values, 1);
  const n = values.length;
  const xStep = (W - padL - padR) / (n - 1);

  // Grid lines
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    const y = padT + (1 - f) * (H - padT - padB);
    ctx.strokeStyle = c.border; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.muted; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText((maxVal * f).toFixed(0), padL - 4, y);
  });

  // Area fill
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  grad.addColorStop(0, c.primary + '55');
  grad.addColorStop(1, c.primary + '00');
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - v / maxVal) * (H - padT - padB);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + (n-1) * xStep, H - padB);
  ctx.lineTo(padL, H - padB);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = c.primary; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  values.forEach((v, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - v / maxVal) * (H - padT - padB);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots + labels
  values.forEach((v, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - v / maxVal) * (H - padT - padB);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2);
    ctx.fillStyle = c.primary; ctx.fill();
    ctx.fillStyle = c.muted; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(labels[i], x, H - padB + 4);
  });
}

function _drawDowChart(canvas, hoursByDow) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 160;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const c = _chartColors();
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const padL = 36, padR = 16, padT = 16, padB = 24;
  const n = 7;
  const maxVal = Math.max(...hoursByDow, 1);
  const slotW = (W - padL - padR) / n;
  const barW  = slotW * 0.55;

  // Grid
  [0, 0.5, 1].forEach(f => {
    const y = padT + (1-f) * (H - padT - padB);
    ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.setLineDash([]);
    if (f > 0) {
      ctx.fillStyle = c.muted; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((maxVal*f).toFixed(0), padL-4, y);
    }
  });

  hoursByDow.forEach((v, i) => {
    const x = padL + i * slotW + (slotW - barW) / 2;
    const barH = (v / maxVal) * (H - padT - padB);
    const y = padT + (H - padT - padB) - barH;
    ctx.fillStyle = c.primary + (i < 5 ? 'cc' : '77');
    ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 4); ctx.fill();
    ctx.fillStyle = c.text; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(labels[i], padL + i*slotW + slotW/2, H - padB + 4);
    if (v > 0) {
      ctx.fillStyle = c.muted; ctx.textBaseline = 'bottom';
      ctx.fillText(v.toFixed(1), padL + i*slotW + slotW/2, y - 2);
    }
  });
}

// ── Notes ───────────────────────────────────────────────────────────────────
function loadNotes() {
  return JSON.parse(localStorage.getItem('dht_notes') || '[]');
}
function saveNotes(notes) {
  localStorage.setItem('dht_notes', JSON.stringify(notes));
  if (typeof syncPush === 'function') syncPush();
}
function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
window.renderNotes = function renderNotes() {
  const container = document.getElementById('tab-notes');
  if (!container) return;
  const notes = loadNotes();
  const jobs = S.jobs;
  const q = (container.querySelector('.notes-search')?.value || '').toLowerCase();
  const filtered = q
    ? notes.filter(n => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q))
    : notes;
  const sorted = [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const jobMap = {};
  jobs.forEach(j => { jobMap[jobKey(j)] = j; });

  container.innerHTML = `
    <div class="notes-toolbar">
      <button class="btn btn-primary btn-sm" id="addNoteBtn">+ New Note</button>
      <input class="notes-search" id="notesSearch" placeholder="Search notes…" type="search" value="${esc(q)}" />
    </div>
    ${sorted.length ? sorted.map(n => {
      const j = n.jobId ? jobMap[n.jobId] : null;
      const preview = (n.body || '').replace(/\n/g, ' ').slice(0, 140) + ((n.body || '').length > 140 ? '…' : '');
      return `<div class="note-card">
        <div class="note-card-header">
          <span class="note-card-title">${esc(n.title || 'Untitled')}</span>
          <div class="note-card-actions">
            <button class="btn btn-ghost btn-sm" data-action="open-note" data-id="${esc(n.id)}">Edit</button>
            <button class="btn btn-danger btn-sm" data-action="del-note" data-id="${esc(n.id)}">✕</button>
          </div>
        </div>
        <div class="note-card-meta">
          <span class="note-date">${formatNoteDate(n.date)}</span>
          ${j ? `<span class="note-job-tag">${esc((j.number ? j.number + ' — ' : '') + j.name)}</span>` : ''}
        </div>
        ${preview ? `<div class="note-preview">${esc(preview)}</div>` : ''}
      </div>`;
    }).join('') : '<p class="placeholder">No notes yet — hit "+ New Note" to start.</p>'}
  `;
  document.getElementById('addNoteBtn')?.addEventListener('click', () => openNoteEditor(null));
  document.getElementById('notesSearch')?.addEventListener('input', window.renderNotes);
};
function openNoteEditor(id) {
  const notes = loadNotes();
  const note = id ? notes.find(n => n.id === id) : null;
  const today = localISODate(new Date());
  const jobs = S.jobs;
  const m = document.createElement('div');
  m.id = 'noteEditorModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding-top:5vh;';
  m.innerHTML = `
    <div class="import-backdrop" id="noteEditorBd"></div>
    <div class="note-editor-dialog">
      <div class="import-dialog-title">${note ? 'Edit Note' : 'New Note'}</div>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="noteTitle" placeholder="Meeting, topic, site visit…" value="${esc(note?.title || '')}" />
      </div>
      <div style="display:flex;gap:10px;">
        <div class="form-group" style="flex:1">
          <label>Date</label>
          <input type="date" id="noteDate" value="${esc(note?.date || today)}" />
        </div>
        <div class="form-group" style="flex:2">
          <label>Job (optional)</label>
          <select id="noteJobSelect">
            <option value="">— None —</option>
            ${jobs.map(j => `<option value="${esc(jobKey(j))}" ${note?.jobId === jobKey(j) ? 'selected' : ''}>${esc((j.number ? j.number + ' — ' : '') + j.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="noteBody" class="note-editor-body" rows="12" placeholder="Type your notes here…">${esc(note?.body || '')}</textarea>
      </div>
      <div class="import-dialog-actions">
        <button class="btn btn-ghost" id="noteEditorCancel">Cancel</button>
        <button class="btn btn-primary" id="noteEditorSave">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => { m.style.opacity = '0'; setTimeout(() => m.remove(), 150); };
  m.style.opacity = '0';
  requestAnimationFrame(() => { m.style.transition = 'opacity .15s ease'; m.style.opacity = '1'; });
  document.getElementById('noteEditorBd').addEventListener('click', close);
  document.getElementById('noteEditorCancel').addEventListener('click', close);
  document.getElementById('noteEditorSave').addEventListener('click', () => {
    const title = document.getElementById('noteTitle').value.trim();
    const date  = document.getElementById('noteDate').value;
    const jobId = document.getElementById('noteJobSelect').value;
    const body  = document.getElementById('noteBody').value;
    const cur = loadNotes();
    if (note) {
      const i = cur.findIndex(n => n.id === id);
      if (i >= 0) cur[i] = { ...cur[i], title, date, jobId, body, updatedAt: Date.now() };
    } else {
      cur.unshift({ id: 'n' + Date.now(), title, date, jobId, body, updatedAt: Date.now() });
    }
    saveNotes(cur);
    window.renderNotes();
    close();
  });
  setTimeout(() => document.getElementById('noteTitle')?.focus(), 50);
}
function deleteNote(id) {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx < 0) return;
  const removed = notes[idx];
  notes.splice(idx, 1);
  saveNotes(notes);
  window.renderNotes();
  showToast('Note deleted.', 6000, { label: 'Undo', fn: () => {
    const cur = loadNotes();
    cur.splice(Math.min(idx, cur.length), 0, removed);
    saveNotes(cur);
    window.renderNotes();
  }});
}
function toggleJobNotes(idx) {
  const area = document.getElementById(`job-notes-${idx}`);
  if (!area) return;
  const open = area.style.display === 'none' || area.style.display === '';
  area.style.display = open ? 'block' : 'none';
  if (open) area.querySelector('textarea')?.focus();
}

// ── Changelog ──────────────────────────────────────────────────────────────
const CHANGELOG = [
  { version: '2.0.18', date: '2026-06-29', changes: [
    'Fixed the web app timesheet PDF — the RT/OT totals now sit correctly inside their cells (they were drifting up and to the side)',
  ] },
  { version: '2.0.17', date: '2026-06-29', changes: [
    'The web app can now export your timesheet to PDF — the same official form as the desktop app, filled in automatically and downloaded (works on your phone too)',
  ] },
  { version: '2.0.16', date: '2026-06-29', changes: [
    'Switching between tabs now has a smooth fade-in animation',
    'Widened the "Log hours" panel on the right so entries are easier to read',
    'The Windows installer now has Wiginton branding (logo sidebar and header)',
  ] },
  { version: '2.0.15', date: '2026-06-29', changes: [
    'Behind-the-scenes maintenance — the calendar styling and shared code now live in one place across the desktop and web apps so they can\'t drift apart, plus more automated tests. No visible changes.',
  ] },
  { version: '2.0.14', date: '2026-06-29', changes: [
    'Web app can now be installed to your phone\'s home screen as a real app — with the Wiginton icon, full-screen, and offline support (use "Add to Home Screen")',
  ] },
  { version: '2.0.13', date: '2026-06-29', changes: [
    'Web app on phones: tapping a day with logged hours no longer leaves a preview popup stuck on the screen',
  ] },
  { version: '2.0.12', date: '2026-06-29', changes: [
    'Web app on phones: the sidebar is now a slide-out menu (tap ☰) and the calendar fills the screen — no more squished, hard-to-read layout',
  ] },
  { version: '2.0.11', date: '2026-06-29', changes: [
    'Version history now lists every recent update — it had fallen several versions behind',
  ] },
  { version: '2.0.10', date: '2026-06-29', changes: [
    'Calendar day cells now match your selected theme (light, dark, and every accent colour) instead of always showing blue',
    'Web app: fixed the bottom of the page getting cut off, and the calendar now matches the desktop look (bordered cells, job chips, tidier weekday header)',
  ] },
  { version: '2.0.9', date: '2026-06-29', changes: [
    'Calendar is now keyboard-friendly — arrow keys move between days, Enter opens a day — with screen-reader labels',
    'Added a gentle reminder to export a backup if it has been a while',
  ] },
  { version: '2.0.8', date: '2026-06-29', changes: [
    'Removed the large empty gap between the weekday names and the calendar cells',
  ] },
  { version: '2.0.7', date: '2026-06-29', changes: [
    'Calendar cells now have clean bordered cards and larger, easier-to-read text',
  ] },
  { version: '2.0.6', date: '2026-06-29', changes: [
    'Update errors no longer pop up on every launch when you are simply offline',
    'The week-picker title now correctly says PDF or Timesheet depending on what you are exporting',
    'Dates near midnight no longer roll to the wrong day',
  ] },
  { version: '2.0.5', date: '2026-06-29', changes: [
    'Fixed the "Restart Now" button text being hard to read in dark themes',
  ] },
  { version: '2.0.4', date: '2026-06-29', changes: [
    'Security: job names are now safely escaped in the calendar; hardened external-link handling',
  ] },
  { version: '2.0.3', date: '2026-06-29', changes: [
    'Calendar job text is now readable on the highlighted (busier) days in every theme',
  ] },
  { version: '2.0.2', date: '2026-06-29', changes: [
    'Calendar cells now list each job and its hours, each with its own colour',
  ] },
  { version: '2.0.1', date: '2026-06-29', changes: [
    'Export to Timesheet now also shows the week picker before exporting',
  ] },
  { version: '2.0.0', date: '2026-06-29', changes: [
    'Fixed auto-updater download — installer filename now matches what latest.yml expects (no more 404 errors on update)',
  ] },
  { version: '1.9.9', date: '2026-06-29', changes: [
    'Fixed theme switching — was silently crashing because the old theme bar element no longer exists in the redesigned layout',
  ] },
  { version: '1.9.8', date: '2026-06-29', changes: [
    'PDF export now prompts for week selection — use arrows or the date picker to choose any week before exporting',
  ] },
  { version: '1.9.7', date: '2026-06-29', changes: [
    'In-app update banner — when an update downloads, a "Restart Now / Later" bar appears inside the app window instead of a system dialog',
  ] },
  { version: '1.9.6', date: '2026-06-29', changes: [
    'Fixed PDF export failing on portable/updated installs — scripts now always resolve correctly regardless of install method',
  ] },
  { version: '1.9.5', date: '2026-06-29', changes: [
    'Fixed update dialog — now appears on top of the app window when an update is ready to install',
  ] },
  { version: '1.9.4', date: '2026-06-29', changes: [
    'Full UI redesign — new sidebar navigation, heat map calendar, stats strip, and improved job panel layout',
    'Map view overhauled — Leaflet map now fills the full window',
    'Calendar cells now expand to fill available height',
    'Settings panel repositioned and no longer overlaps content',
  ] },
  { version: '1.9.3', date: '2026-06-25', changes: [
    'Updated in-app Help guide: covers PDF export, job archiving/duplicate, Dashboard tab, and daily reminders',
  ] },
  { version: '1.9.2', date: '2026-06-25', changes: [
    'Redesigned daily reminder time picker in Settings — now full-width with larger, easier to read input',
    'Tab row is now horizontally scrollable — all 7 tabs accessible without crowding',
  ] },
  { version: '1.9.1', date: '2026-06-25', changes: [
    'Fixed jobs list not appearing under Manage Jobs on startup (variable initialization order bug)',
    'Removed stopwatch timer from header per user feedback',
  ] },
  { version: '1.9.0', date: '2026-06-25', changes: [
    'Added job archiving — archive completed jobs to keep the list clean without losing data',
    'Added Duplicate button on job cards to pre-fill the add-job form as a template',
    'Added Export to PDF button — fills the Designer Timesheet and opens it as a PDF (Electron only)',
    'Added offline indicator dot in the header (green = online, red = offline)',
    'Added daily reminder setting for web/mobile (via browser Notification API)',
  ] },
  { version: '1.8.0', date: '2026-06-25', changes: [
    'Added Dashboard tab with stat cards and charts — hours by job, 8-week trend, hours by day of week',
  ] },
  { version: '1.7.2', date: '2026-06-25', changes: [
    'Fixed version badge always showing v1.5.0 — now reads from app code instead of version.json',
  ] },
  { version: '1.7.1', date: '2026-06-25', changes: [
    'Fixed map tab not rendering — Leaflet now initializes after the tab container is visible',
  ] },
  { version: '1.7.0', date: '2026-06-25', changes: [
    'Added interactive Map tab showing all jobs as pins on an OpenStreetMap map',
    'Added Address field to job edit form with one-click Nominatim geocoding',
    'Jobs auto-geocode on save if an address is entered without clicking Locate',
    'Pin labels show job number and name; clicking a pin shows address popup',
    'Jobs tab shows 📍 indicator on cards that have a mapped location',
    'Map fits all pins in view automatically; single-job view zooms to street level',
  ] },
  { version: '1.6.0', date: '2026-06-25', changes: [
    'Added Notes tab — create, search, and manage dated meeting and general notes',
    'Notes can be linked to a specific job for easy reference',
    'Added quick per-job notes field on each job card (toggle to expand, auto-saves)',
    'Notes sync across devices via cloud sync',
  ] },
  { version: '1.5.0', date: '2026-06-25', changes: [
    'Fixed help button not responding after inline onclick removal',
    'Fixed settings panel floating into the middle of the screen on Electron',
    'Fixed holiday observed-day calculation when Jan 1 or another holiday falls on Saturday (Dec 31 was not shown)',
    'Fixed toast message XSS vector — message text is now set safely via textContent',
    'Fixed entry detail view missing its fade-in transition when opening from a day entry',
    'Job edit form now animates in when opened',
    'Help, changelog, and settings panels now animate out smoothly on close',
    'Custom select dropdown now fades in as a unit (not just per-item)',
    'All modals (help, changelog, sync) now fade out before removing from DOM',
    'Input and select fields now transition border-color on focus',
    'Sheet backdrop (mobile) now fades out on close',
    'Bottom-nav icon stroke-width now animates on active state change (mobile)',
    'Version badge now lifts on hover like other buttons',
    'Download functions now revoke blob URLs to prevent memory leaks',
    'Added 10 MB size limit on backup imports and 20 MB on Excel imports',
    'Removed deprecated cdn.firebase.com from Content Security Policy (web)',
    'Auto-updater errors are now logged instead of silently swallowed',
    'Guard against duplicate simultaneous update checks',
    'Cloud theme sync now keeps the custom select display label in sync',
  ] },
  { version: '1.4.9', date: '2026-06-25', changes: [
    'Jobs are now grouped by type in Manage Jobs and the log-hours dropdown — 181 Contract, 187 Express, and Other — making large job lists much easier to navigate',
    'Each job now shows a distinct color accent on its entry cards, calendar day chips, and hover popup so you can tell jobs apart at a glance (desktop only)',
  ] },
  { version: '1.4.8', date: '2026-06-25', changes: [
    'Added in-app How-To guide — tap the Help button (desktop: above settings panel; web/mobile: in the theme bar) for step-by-step instructions covering logging hours, managing jobs, importing from SharePoint, mileage & expenses, timesheet export, and syncing',
  ] },
  { version: '1.4.7', date: '2026-06-25', changes: [
    'Job cards now have an Edit button — edit job #, name, customer, salesman, designer, superintendent, foreman, starting hours, and budget inline',
  ] },
  { version: '1.4.6', date: '2026-06-25', changes: [
    'Added Import from Excel button on Jobs tab — import job#, name, customer, salesman, designer, superintendent, and foreman from any .xlsx or .csv file',
    'Job cards now display customer, salesman, designer, superintendent, and foreman when available',
  ] },
  { version: '1.4.5', date: '2026-06-24', changes: [
    'Added Check for Updates button in Settings panel',
  ] },
  { version: '1.4.4', date: '2026-06-24', changes: [
    'Added entry edit mode — click an entry then Edit to modify it in place',
    'Added undo toast after deleting entries, mileage, expenses, and jobs',
    'Added sync error toast with Retry button when Firebase sync fails',
    'Added export/import feedback toasts (file name on export, counts on import)',
    'Fixed calendar day popup clipping off bottom of screen on mobile',
    'Mileage and expense add buttons now explain the limit when disabled',
    'Week summary table first column is now sticky while scrolling horizontally',
    'Summary table switches to card layout on very narrow screens',
    'Faster tab transitions, larger calendar cells, bigger bottom-sheet handle',
  ] },
  { version: '1.4.3', date: '2026-06-24', changes: [
    'Fixed version badge showing stale version number on web app',
    'Fixed changelog missing v1.4.1 and v1.4.2 entries',
    'Removed private repo flag from auto-updater config (repo is public)',
  ]},
  { version: '1.4.2', date: '2026-06-24', changes: [
    'Added US federal holidays to the calendar with observed-date logic',
    'Added Designer Name and Employee # fields in Settings — auto-fill the Excel timesheet',
  ]},
  { version: '1.4.1', date: '2026-06-24', changes: [
    'Added version history changelog viewer (this screen) to the Electron app',
    'Fixed changelog modal centering and scroll bounds',
  ]},
  { version: '1.4.0', date: '2026-06-24', changes: [
    'Added version badge and changelog viewer',
    'Added Windows EXE download button to web app',
    'Fixed calendar hour data not rendering on mobile',
    'Fixed bottom sheet not opening when tapping a calendar cell on mobile',
    'Fixed hover entry popup sticking on mobile touch screens',
    'Fixed mobile nav elements appearing in desktop/Electron view',
    'Improved service worker cache strategy to prevent stale asset delivery',
  ]},
  { version: '1.3.0', date: '2026-06-24', changes: [
    'Added Firebase cloud sync — sign in with Google to sync across devices',
    'Added sync status indicator in settings panel',
    'Added sign in / sign out controls in settings',
  ]},
  { version: '1.2.0', date: '2026-06-24', changes: [
    'Added daily reminder notification with configurable time',
    'Added auto-start with Windows option in settings',
    'Added Export Backup / Import Backup for full data portability',
    'Added mileage reimbursement section to week summary',
    'Added expense tracking section to week summary',
  ]},
  { version: '1.1.0', date: '2026-06-24', changes: [
    'Added week summary view with per-job daily breakdown',
    'Added Export to Timesheet — auto-fills Excel timesheet via PowerShell',
    'Added Rates & Calcs tab for configurable billing rates',
    'Added job number field alongside job name',
    'Added hours-already-used field for tracking pre-existing usage',
  ]},
  { version: '1.0.0', date: '2026-06-01', changes: [
    'Initial release',
    'Monthly calendar view with daily hour logging',
    'Multiple job tracking with budget vs. used display',
    'CSV and JSON export',
    'Light / Dark / Slate / Forest / Amber / Rose / Vaporwave themes',
    'Auto-updater via Firebase Hosting',
  ]},
];

function showChangelog() {
  const body = document.getElementById('changelogBody');
  body.innerHTML = CHANGELOG.map((entry, i) => `
    <div class="cl-entry">
      <div class="cl-header">
        <span class="cl-version">v${entry.version}</span>
        <span class="cl-date">${entry.date}</span>
        ${i === 0 ? '<span class="cl-badge">Latest</span>' : ''}
      </div>
      <ul class="cl-list">${entry.changes.map(c => `<li>${c}</li>`).join('')}</ul>
    </div>`).join('');
  const modal = document.getElementById('changelogModal');
  modal.classList.remove('cl-closing');
  modal.style.display = 'flex';
}

function hideChangelog() {
  const modal = document.getElementById('changelogModal');
  modal.classList.add('cl-closing');
  setTimeout(() => { modal.style.display = 'none'; modal.classList.remove('cl-closing'); }, 200);
}

// ── Ripple ─────────────────────────────────────────────────────────────────
document.addEventListener('mousedown', e => {
  const target = e.target.closest('.btn, .tab, .nav-row button, .cal-day');
  if (!target || target.classList.contains('other-month')) return;

  const rect   = target.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height);
  const el     = document.createElement('span');
  el.className = 'ripple';
  el.style.cssText = `width:${size}px;height:${size}px;left:${rect.width/2 - size/2}px;top:${rect.height/2 - size/2}px`;
  target.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
});
