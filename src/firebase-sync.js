// firebase-sync.js — real-time cloud sync engine
// Loaded after firebase-config.js and the Firebase compat SDK scripts

(function (W) {
  'use strict';

  // Support both `var` (window property) and `const`/`let` (global scope only)
  var cfg = (typeof firebaseConfig !== 'undefined') ? firebaseConfig : null;
  if (!W.firebase || !cfg || cfg.apiKey === 'YOUR_API_KEY') {
    console.info('[sync] Firebase not configured — cloud sync disabled.');
    return;
  }

  const app  = firebase.apps.length
    ? firebase.apps[0]
    : firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let uid        = null;
  let pushTimer  = null;
  let unsub      = null;
  let lastPushAt = 0;

  function userDoc() {
    return db.doc('users/' + uid + '/sync/data');
  }

  // ── Status indicator ───────────────────────────────────────────────────────
  function setStatus(state) {
    document.querySelectorAll('.sync-dot').forEach(dot => {
      dot.className = 'sync-dot sync-' + state;
    });
    document.querySelectorAll('.sync-label').forEach(lbl => {
      lbl.textContent = { on: 'Synced', busy: 'Syncing…', err: 'Sync error', off: 'Not syncing' }[state] || '';
    });
  }

  // ── Apply cloud data → localStorage + re-render ───────────────────────────
  function applyCloud(data) {
    if (!data) return;
    var map = {
      entries: 'dht_entries', jobs: 'dht_jobs', rates: 'dht_rates',
      mileage: 'dht_mileage', expenses: 'dht_expenses', notes: 'dht_notes',
    };
    Object.entries(map).forEach(function (pair) {
      if (data[pair[0]] != null)
        localStorage.setItem(pair[1], JSON.stringify(data[pair[0]]));
    });
    if (data.theme) {
      localStorage.setItem('dht_theme', data.theme);
      document.documentElement.setAttribute('data-theme', data.theme);
      var p = document.getElementById('themePicker');
      if (p) {
        p.value = data.theme;
        // Keep the custom-select display label in sync
        var wrap = p.closest('.cs-wrap');
        var disp = wrap && wrap.querySelector('.cs-display');
        if (disp) disp.textContent = p.options[p.selectedIndex]?.text || '';
      }
    }
    ['renderCalendar','renderSummary','renderWeeklySummary','renderJobsList','renderRates','renderNotes']
      .forEach(function (fn) { if (typeof W[fn] === 'function') W[fn](); });
    setStatus('on');
  }

  // ── Push local → cloud (debounced 800 ms) ─────────────────────────────────
  W.syncPush = function () {
    if (!uid) return;
    setStatus('busy');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      userDoc().set({
        entries:  JSON.parse(localStorage.getItem('dht_entries')  || '{}'),
        jobs:     JSON.parse(localStorage.getItem('dht_jobs')     || '[]'),
        rates:    JSON.parse(localStorage.getItem('dht_rates')    || '[]'),
        mileage:  JSON.parse(localStorage.getItem('dht_mileage')  || '{}'),
        expenses: JSON.parse(localStorage.getItem('dht_expenses') || '{}'),
        notes:    JSON.parse(localStorage.getItem('dht_notes')    || '[]'),
        theme:    localStorage.getItem('dht_theme') || 'light',
        savedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      }).then(function () {
        lastPushAt = Date.now();
        setStatus('on');
      }).catch(function (e) {
        console.warn('[sync] push error:', e);
        setStatus('err');
        if (typeof W.showToast === 'function') {
          W.showToast('Sync failed — check your connection.', 6000, { label: 'Retry', fn: function () { W.syncPush(); } });
        }
      });
    }, 800);
  };

  // ── Real-time listener ─────────────────────────────────────────────────────
  function startListener() {
    if (unsub) unsub();
    unsub = userDoc().onSnapshot(function (snap) {
      if (!snap.exists) return;
      if (snap.metadata.hasPendingWrites) return;
      if (Date.now() - lastPushAt < 1500) return;
      applyCloud(snap.data());
    }, function () {
      setStatus('err');
      if (typeof W.showToast === 'function') {
        W.showToast('Sync connection lost.', 6000, { label: 'Retry', fn: function () { startListener(); } });
      }
    });
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  W.syncSignIn  = function (e, p) { return auth.signInWithEmailAndPassword(e, p).catch(function (err) { return Promise.reject(err.message); }); };
  W.syncSignUp  = function (e, p) { return auth.createUserWithEmailAndPassword(e, p).catch(function (err) { return Promise.reject(err.message); }); };
  W.syncSignOut = function ()     { auth.signOut(); };

  auth.onAuthStateChanged(function (user) {
    uid = user ? user.uid : null;
    updateAuthUI(user);
    if (user) {
      startListener();
      userDoc().get().then(function (s) { if (s.exists) applyCloud(s.data()); }).catch(function () {});
    } else {
      if (unsub) { unsub(); unsub = null; }
      setStatus('off');
    }
  });

  // ── Auth UI helpers ────────────────────────────────────────────────────────
  function updateAuthUI(user) {
    document.querySelectorAll('.sync-email').forEach(function (el) {
      el.textContent = user ? user.email : '';
    });
    document.querySelectorAll('.sync-signin-btn').forEach(function (el) {
      el.style.display = user ? 'none' : '';
    });
    document.querySelectorAll('.sync-signout-btn').forEach(function (el) {
      el.style.display = user ? '' : 'none';
    });
    setStatus(user ? 'on' : 'off');
  }

  // ── Auth modal ─────────────────────────────────────────────────────────────
  W.openSyncModal = function () {
    if (document.getElementById('syncModal')) return;

    var m = document.createElement('div');
    m.id = 'syncModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center';
    m.innerHTML = [
      '<div class="import-backdrop" id="syncBackdrop"></div>',
      '<div class="import-dialog" style="width:min(360px,92vw)">',
        '<div class="import-dialog-title">Sign in to sync</div>',
        '<p style="font-size:.82rem;color:var(--muted);margin-bottom:16px;line-height:1.5">',
          'Your data syncs automatically across desktop and phone whenever you\'re online.',
        '</p>',
        '<div class="form-group"><label>Email</label>',
          '<input type="email" id="syncEmailIn" placeholder="you@example.com" autocomplete="email" />',
        '</div>',
        '<div class="form-group"><label>Password</label>',
          '<input type="password" id="syncPassIn" placeholder="Password (min 6 chars)" autocomplete="current-password" />',
        '</div>',
        '<div id="syncAuthErr" style="color:var(--danger);font-size:.8rem;margin-bottom:10px;display:none"></div>',
        '<div class="import-dialog-actions">',
          '<button class="btn btn-ghost" id="syncCancelBtn">Cancel</button>',
          '<button class="btn btn-ghost" id="syncCreateBtn">Create account</button>',
          '<button class="btn btn-primary" id="syncLoginBtn">Sign in</button>',
        '</div>',
      '</div>',
    ].join('');
    document.body.appendChild(m);

    var err = document.getElementById('syncAuthErr');
    function showErr(msg) { err.textContent = msg; err.style.display = ''; }

    function close() { m.remove(); }

    document.getElementById('syncBackdrop').onclick = close;
    document.getElementById('syncCancelBtn').onclick = close;

    document.getElementById('syncLoginBtn').onclick = function () {
      var e = document.getElementById('syncEmailIn').value.trim();
      var p = document.getElementById('syncPassIn').value;
      if (!e || !p) return showErr('Please enter your email and password.');
      W.syncSignIn(e, p).then(close).catch(showErr);
    };

    document.getElementById('syncCreateBtn').onclick = function () {
      var e = document.getElementById('syncEmailIn').value.trim();
      var p = document.getElementById('syncPassIn').value;
      if (!e || !p) return showErr('Please enter an email and password.');
      if (p.length < 6) return showErr('Password must be at least 6 characters.');
      W.syncSignUp(e, p).then(close).catch(showErr);
    };

    document.getElementById('syncPassIn').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') document.getElementById('syncLoginBtn').click();
    });

    setTimeout(function () { document.getElementById('syncEmailIn').focus(); }, 50);
  };

}(window));
