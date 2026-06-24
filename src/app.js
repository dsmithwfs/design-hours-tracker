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

// ── Init ───────────────────────────────────────────────────────────────────
(function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  if (!S.jobs.length) S.jobs = [{ number: '', name: 'General', budget: null }];

  // Set week start to Monday of current week
  const todayForWeek = new Date();
  todayForWeek.setHours(0,0,0,0);
  const dow = todayForWeek.getDay(); // 0=Sun
  const diff = (dow === 0) ? -6 : 1 - dow;
  currentWeekStart = new Date(todayForWeek);
  currentWeekStart.setDate(currentWeekStart.getDate() + diff);

  document.getElementById('prevMonth').addEventListener('click', () => navigate(-1));
  document.getElementById('nextMonth').addEventListener('click', () => navigate(1));
  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
    selectDate(toKey(now));
  });

  const TAB_IDS = ['month', 'week', 'jobs', 'rates'];
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      const current = TAB_IDS.find(id => document.getElementById(`tab-${id}`).style.display !== 'none');
      if (next === current) return;

      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const outEl = current ? document.getElementById(`tab-${current}`) : null;
      const inEl  = document.getElementById(`tab-${next}`);

      const show = () => {
        if (next === 'week') renderWeeklySummary();
        inEl.style.display   = '';
        inEl.style.opacity   = '0';
        inEl.style.transform = 'translateY(6px)';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          inEl.style.opacity   = '1';
          inEl.style.transform = 'translateY(0)';
        }));
      };

      if (outEl) {
        outEl.style.opacity   = '0';
        outEl.style.transform = 'translateY(-6px)';
        setTimeout(() => { outEl.style.display = 'none'; show(); }, 180);
      } else {
        show();
      }
    });
  });

  document.getElementById('addRateBtn').addEventListener('click', addRate);
  document.getElementById('newRateLabel').addEventListener('keydown', e => { if (e.key === 'Enter') addRate(); });
  document.getElementById('newRateValue').addEventListener('keydown', e => { if (e.key === 'Enter') addRate(); });

  document.getElementById('addJobBtn').addEventListener('click', addJob);
  document.getElementById('newJobNumber').addEventListener('keydown', e => { if (e.key === 'Enter') addJob(); });
  document.getElementById('newJobInput').addEventListener('keydown', e => { if (e.key === 'Enter') addJob(); });
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  document.getElementById('exportJson').addEventListener('click', exportJson);
  document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);
  document.getElementById('importBackupBtn').addEventListener('click', importBackup);
  document.getElementById('exportTimesheetBtn').addEventListener('click', () => exportTimesheetJson());
  document.getElementById('addMileageBtn').addEventListener('click', addMileageEntry);
  document.getElementById('addExpenseBtn').addEventListener('click', addExpenseEntry);

  // Settings bar (Electron only)
  if (window.electronAPI) {
    const bar        = document.getElementById('settingsBar');
    const toggleBtn  = document.getElementById('settingsToggleBtn');
    const panel      = document.getElementById('settingsPanel');
    const timeInput  = document.getElementById('reminderTime');
    const clearBtn   = document.getElementById('clearReminderBtn');
    const track      = document.getElementById('autoStartTrack');
    const saveBtn    = document.getElementById('saveSettingsBtn');
    const savedLabel = document.getElementById('settingsSaved');
    let autoStart    = false;

    bar.style.display = 'block';

    window.electronAPI.getVersion().then(v => {
      const el = document.getElementById('electronVersion');
      if (el) el.textContent = 'v' + v;
      const badge = document.getElementById('versionBtn');
      if (badge) { badge.textContent = 'v' + v; badge.style.display = ''; }
    });

    window.electronAPI.getSettings().then(s => {
      if (s.reminderTime) timeInput.value = s.reminderTime;
      autoStart = !!s.autoStart;
      track.classList.toggle('on', autoStart);
    });

    // Profile fields
    const nameInput = document.getElementById('designerNameInput');
    const empInput  = document.getElementById('employeeNumInput');
    if (nameInput) {
      nameInput.value = localStorage.getItem('dht_designer_name') || '';
      nameInput.addEventListener('input', () => localStorage.setItem('dht_designer_name', nameInput.value));
    }
    if (empInput) {
      empInput.value = localStorage.getItem('dht_employee_num') || '';
      empInput.addEventListener('input', () => localStorage.setItem('dht_employee_num', empInput.value));
    }

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    document.addEventListener('click', e => {
      if (!bar.contains(e.target)) panel.classList.remove('open');
    });

    clearBtn.addEventListener('click', () => { timeInput.value = ''; });

    track.addEventListener('click', () => {
      autoStart = !autoStart;
      track.classList.toggle('on', autoStart);
    });

    saveBtn.addEventListener('click', async () => {
      await window.electronAPI.saveSettings({
        reminderTime: timeInput.value || null,
        autoStart,
      });
      savedLabel.textContent = 'Saved!';
      setTimeout(() => { savedLabel.textContent = ''; panel.classList.remove('open'); }, 1500);
    });
  }

  renderCalendar();
  renderSummary();
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
    grid.classList.add(inClass);
    setTimeout(() => grid.classList.remove(inClass), 200);
  }, 150);
}

function dayTotalHours(entries) {
  return entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
}

function jobLifetimeHours(jobName) {
  const job = S.jobs.find(j => jobKey(j) === jobName);
  const starting = job ? (parseFloat(job.startingHours) || 0) : 0;
  const logged = Object.values(S.entries).flat().reduce((s, e) => {
    return e.job === jobName ? s + (parseFloat(e.hours) || 0) : s;
  }, 0);
  return starting + logged;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function jobLabel(j) {
  return j.number ? `${j.number} – ${j.name}` : j.name;
}

// Unique key stored on entries — use label so existing entries stay linked
function jobKey(j) {
  return jobLabel(j);
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
    if (dow === 6) return key(month, day - 1);
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
  document.getElementById('monthLabel').textContent = `${MONTHS[currentMonth]} ${currentYear}`;

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
    const names = [...new Set(dayEntries.map(e => e.job || e.type).filter(Boolean))];

    const holiday = holidays[key];
    const el = document.createElement('div');
    el.className = 'cal-day'
      + (key === today ? ' today' : '')
      + (dayEntries.length ? ' has-entry' : '')
      + (key === selectedDate ? ' selected' : '')
      + (holiday ? ' holiday' : '');
    el.dataset.key = key;
    el.innerHTML = `
      <span class="day-num">${d}</span>
      ${total > 0 ? `<div class="day-hours">${total}h</div>` : ''}
      <div class="day-jobs">${names.map(j => `<span class="job-dot">${j}</span>`).join('')}</div>
      ${holiday ? `<div class="day-holiday">${holiday}</div>` : ''}
    `;
    el.addEventListener('click', () => selectDate(key));
    if (dayEntries.length) {
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
          ${S.jobs.map(j => `<option value="${esc(jobKey(j))}">${esc(jobLabel(j))}</option>`).join('')}
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
    return `
    <div class="entry-card${isSpecial ? ' entry-card-special' : ''}" onclick="showEntryDetail('${key}', ${i})">
      <div class="entry-card-top">
        <span class="entry-job">${label}</span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span class="entry-hours">${e.hours}h</span>
          <button class="btn btn-danger" onclick="event.stopPropagation();deleteEntry('${key}', ${i})">✕</button>
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
  all[key].splice(index, 1);
  if (!all[key].length) delete all[key];
  S.entries = all;

  renderCalendar();
  renderSummary();
  renderWeeklySummary();
  renderJobsList();
  renderSidePanel(key);
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
function computeWeekRtOt(weekKeys, allEntries) {
  let running = 0;
  const byJob    = {};                              // jobName → {rt[7], ot[7]}
  const byRow    = {};                              // "job||cc" → {jobLabel,costCode,rt[7],ot[7]}
  const special  = { MTG:[0,0,0,0,0,0,0], TRG:[0,0,0,0,0,0,0],
                     HOL:[0,0,0,0,0,0,0], PTO:[0,0,0,0,0,0,0], BRV:[0,0,0,0,0,0,0] };

  weekKeys.forEach((key, dayIdx) => {
    (allEntries[key] || []).forEach(e => {
      const h = parseFloat(e.hours) || 0;

      if (e.type && special[e.type] !== undefined) {
        special[e.type][dayIdx] += h;
        return;
      }

      const cc  = e.costCode || 'Overhead';
      const rtH = Math.min(h, Math.max(0, 40 - running));
      const otH = h - rtH;
      running  += h;

      if (!byJob[e.job]) byJob[e.job] = { rt:[0,0,0,0,0,0,0], ot:[0,0,0,0,0,0,0] };
      byJob[e.job].rt[dayIdx] += rtH;
      byJob[e.job].ot[dayIdx] += otH;

      const rk = `${e.job}||${cc}`;
      if (!byRow[rk]) byRow[rk] = { jobLabel: e.job, costCode: cc, rt:[0,0,0,0,0,0,0], ot:[0,0,0,0,0,0,0] };
      byRow[rk].rt[dayIdx] += rtH;
      byRow[rk].ot[dayIdx] += otH;
    });
  });

  return { byJob, byRow, special };
}

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

  addBtn.disabled = entries.length >= 4;

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
  entries.splice(i, 1);
  saveMileageEntries(entries);
  renderMileage();
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

  addBtn.disabled = entries.length >= 3;

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
  entries.splice(i, 1);
  saveExpenseEntries(entries);
  renderExpenses();
}

// ── Jobs Manager ───────────────────────────────────────────────────────────
function renderJobsList() {
  const list = document.getElementById('jobsList');
  const jobs = S.jobs;
  if (!jobs.length) { list.innerHTML = '<p class="placeholder">No jobs yet.</p>'; return; }

  // Sort by job number (natural sort), jobs without a number go last
  const sorted = jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => {
      if (!a.j.number && !b.j.number) return 0;
      if (!a.j.number) return 1;
      if (!b.j.number) return -1;
      return a.j.number.localeCompare(b.j.number, undefined, { numeric: true, sensitivity: 'base' });
    });

  list.innerHTML = sorted.map(({ j, i }) => {
    const used = jobLifetimeHours(jobKey(j));
    const budget = j.budget;
    const hasBudget = budget != null;
    const remaining = hasBudget ? budget - used : null;
    const pct = hasBudget ? Math.min(100, (used / budget) * 100) : 0;
    const overBudget = hasBudget && remaining < 0;
    const nearBudget = hasBudget && !overBudget && remaining <= budget * 0.1;

    const barClass = overBudget ? 'bar-over' : nearBudget ? 'bar-near' : 'bar-ok';

    return `
      <div class="job-card">
        <div class="job-card-top">
          <span class="job-card-name">
            ${j.number ? `<span class="job-card-number">${esc(j.number)}</span> ` : ''}${esc(j.name)}
          </span>
          <button class="btn btn-danger" onclick="removeJob(${i})" title="Remove">✕</button>
        </div>
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
          <div class="budget-stats"><span class="muted-cell">No budget set — <button class="btn-inline" onclick="setBudget(${i})">Set budget</button></span></div>
        `}
        <div class="budget-edit-row">
          <input type="number" id="budget-input-${i}" class="budget-input" min="0" step="0.5"
            placeholder="Set total hours budget…" value="${hasBudget ? budget : ''}" />
          <button class="btn btn-ghost btn-sm" onclick="saveBudget(${i})">Save</button>
        </div>
      </div>
    `;
  }).join('');
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
  jobs.splice(i, 1);
  S.jobs = jobs;
  renderJobsList();
  renderSummary();
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
          <button class="btn btn-danger" onclick="removeRate(${i})">✕</button>
        </div>
        <div class="rate-edit-row">
          <input type="text"   class="rate-edit-label" data-i="${i}" value="${esc(r.label)}" placeholder="Label" />
          <input type="number" class="rate-edit-value" data-i="${i}" value="${r.value}" min="0" step="0.01" placeholder="Value" />
          <select class="rate-edit-unit" data-i="${i}">
            ${['$/hr','$/day','%','multiplier','custom'].map(u =>
              `<option${u === r.unit ? ' selected' : ''}>${u}</option>`
            ).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="saveRate(${i})">Save</button>
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

function exportTimesheetJson() {
  if (!currentWeekStart) return;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
}

// ── Theme Transition & Preview ─────────────────────────────────────────────
function applyThemeWithAnimation(theme) {
  const bar  = document.querySelector('.theme-bar');
  const rect = bar.getBoundingClientRect();
  const ox   = rect.left + rect.width  / 2;
  const oy   = rect.top  + rect.height / 2;

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
    Array.from(sel.options).forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'cs-item' + (opt.selected ? ' cs-selected' : '');
      item.textContent = opt.text;
      item.style.animationDelay = `${i * 40}ms`;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
      });
      if (isThemePicker) {
        item.addEventListener('mouseenter', () => showThemePreview(opt.value, item, list));
        item.addEventListener('mouseleave', hideThemePreview);
      }
      list.appendChild(item);
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
      return `<div class="cal-popup-entry" data-key="${key}" data-idx="${i}">
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
  popup.style.left = left + 'px';
  popup.style.top  = top + 'px';
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
  document.getElementById('sideContent').innerHTML = `
    <div class="entry-detail-card">
      <div class="entry-detail-label">${esc(label)}</div>
      ${!isSpecial && e.costCode ? `<div class="entry-detail-cc">${esc(e.costCode)}</div>` : ''}
      <div class="entry-detail-hours">${e.hours}h</div>
      ${e.notes ? `<div class="entry-detail-notes">${esc(e.notes)}</div>` : '<div class="entry-detail-notes muted-cell">No notes.</div>'}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn btn-ghost btn-sm" id="detailBackBtn">&#8592; Back</button>
      <button class="btn btn-danger btn-sm" id="detailDeleteBtn">Delete</button>
    </div>
  `;

  document.getElementById('detailBackBtn').addEventListener('click',   () => renderSidePanel(key));
  document.getElementById('detailDeleteBtn').addEventListener('click', () => deleteEntry(key, idx));
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
  const date = new Date().toISOString().slice(0, 10);
  download(`dht-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
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
}

// ── Changelog ──────────────────────────────────────────────────────────────
const CHANGELOG = [
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
  document.getElementById('changelogModal').style.display = 'flex';
}

function hideChangelog() {
  document.getElementById('changelogModal').style.display = 'none';
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
