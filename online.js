(function () {
  'use strict';

  var authClient = null;
  var currentUser = null;
  var authGeneration = 0;
  var writeTimer = null;
  var writeInProgress = false;
  var writePromise = null;
  var pendingData = null;
  var syncState = 'loading';
  var syncErrorShown = false;
  var authMode = 'signin';

  function byId(id) { return document.getElementById(id); }

  function setGateMessage(message, isError) {
    var box = byId('authMessage');
    if (!box) return;
    box.textContent = message || '';
    box.classList.toggle('error', !!isError);
    box.style.display = message ? 'block' : 'none';
  }

  function showGate(message, isError, loading) {
    document.body.classList.toggle('online-loading', !!loading);
    document.body.classList.toggle('online-logged-out', !loading);
    var retry = byId('authRetry');
    if (retry) retry.hidden = !currentUser;
    var signOut = byId('authSignOut');
    if (signOut) signOut.hidden = !currentUser;
    setGateMessage(message, isError);
  }

  function updateSyncStatus() {
    var text = {
      loading: 'Memuat akun…',
      saved: 'Tersimpan di cloud',
      saving: 'Menyinkronkan…',
      error: 'Sinkronisasi gagal'
    }[syncState] || 'Belum tersinkron';
    document.querySelectorAll('.cloud-sync-state').forEach(function (el) {
      el.textContent = text;
      el.dataset.state = syncState;
      el.title = syncState === 'error' ? 'Ketuk untuk mencoba menyinkronkan lagi' : text;
    });
  }

  function setSyncState(next) {
    syncState = next;
    updateSyncStatus();
  }

  function configurationError() {
    var config = window.DUIT_SUPABASE_CONFIG;
    return !config || !config.url || !config.anonKey ||
      config.url.indexOf('YOUR-PROJECT') >= 0 ||
      config.anonKey.indexOf('YOUR_SUPABASE') >= 0;
  }

  function getErrorMessage(error) {
    if (!error) return 'Terjadi kesalahan yang tidak diketahui.';
    if (error.message) return error.message;
    return String(error);
  }

  function setAuthMode(mode) {
    authMode = mode;
    var form = byId('authForm');
    var title = byId('authTitle');
    var intro = byId('authIntro');
    var password = byId('authPassword');
    var confirm = byId('authConfirm');
    var emailField = byId('authEmailField');
    var emailInput = byId('authEmail');
    var submit = byId('authSubmit');
    var signInLink = byId('authSigninLink');
    var signupLink = byId('authSignupLink');
    var resetLink = byId('authResetLink');
    if (!form) return;

    password.hidden = mode === 'reset';
    confirm.hidden = mode !== 'signup' && mode !== 'update';
    emailField.hidden = mode === 'update';
    emailInput.required = mode !== 'update';
    signInLink.hidden = mode === 'signin' || mode === 'update';
    signupLink.hidden = mode !== 'signin';
    resetLink.hidden = mode !== 'signin';
    confirm.querySelector('input').required = mode === 'signup' || mode === 'update';
    password.querySelector('input').required = mode !== 'reset';

    if (mode === 'signup') {
      title.textContent = 'Buat akun';
      intro.textContent = 'Daftar untuk menyimpan catatan keuangan pribadimu di Supabase.';
      submit.textContent = 'Daftar';
    } else if (mode === 'reset') {
      title.textContent = 'Atur ulang kata sandi';
      intro.textContent = 'Kami akan mengirim tautan pemulihan ke email akunmu.';
      submit.textContent = 'Kirim tautan';
    } else if (mode === 'update') {
      title.textContent = 'Kata sandi baru';
      intro.textContent = 'Buat kata sandi baru untuk akunmu.';
      submit.textContent = 'Simpan kata sandi';
    } else {
      title.textContent = 'Masuk ke Duit';
      intro.textContent = 'Catatan keuangan tersimpan dan disinkronkan di akunmu.';
      submit.textContent = 'Masuk';
    }
    setAuthMessage('');
  }

  function setAuthMessage(message, isError) {
    setGateMessage(message, isError);
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!authClient) return;
    var form = byId('authForm');
    var submit = byId('authSubmit');
    var email = byId('authEmail').value.trim();
    var password = byId('authPasswordValue').value;
    var confirm = byId('authConfirmValue').value;
    if ((authMode === 'signup' || authMode === 'update') && password !== confirm) {
      setAuthMessage('Konfirmasi kata sandi tidak sama.', true);
      return;
    }
    if ((authMode === 'signup' || authMode === 'update') && password.length < 8) {
      setAuthMessage('Gunakan kata sandi minimal 8 karakter.', true);
      return;
    }

    submit.disabled = true;
    setAuthMessage('');
    try {
      var result;
      if (authMode === 'signup') {
        result = await authClient.auth.signUp({ email: email, password: password });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setAuthMode('signin');
          setAuthMessage('Pendaftaran berhasil. Periksa email untuk verifikasi, lalu masuk.');
        } else {
          setAuthMessage('Akun berhasil dibuat. Sedang memuat data…');
        }
      } else if (authMode === 'reset') {
        result = await authClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (result.error) throw result.error;
        setAuthMessage('Jika email terdaftar, tautan pemulihan akan segera dikirim.');
      } else if (authMode === 'update') {
        result = await authClient.auth.updateUser({ password: password });
        if (result.error) throw result.error;
        setAuthMode('signin');
        await authClient.auth.signOut();
        setAuthMessage('Kata sandi berhasil diubah. Silakan masuk kembali.');
      } else {
        result = await authClient.auth.signInWithPassword({ email: email, password: password });
        if (result.error) throw result.error;
        setAuthMessage('Berhasil masuk. Sedang memuat data…');
      }
      form.reset();
    } catch (error) {
      setAuthMessage(getErrorMessage(error), true);
    } finally {
      submit.disabled = false;
    }
  }

  async function upsertData(userId, data) {
    var result = await authClient.from('duit_user_data').upsert({
      user_id: userId,
      data: data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (result.error) throw result.error;
  }

  async function activateUser(user) {
    var generation = ++authGeneration;
    var sameUser = currentUser && currentUser.id === user.id;
    if (!sameUser) {
      pendingData = null;
      clearTimeout(writeTimer);
    }
    currentUser = user;
    setSyncState('loading');
    showGate('Mengambil data akun…', false, true);

    try {
      if (sameUser && pendingData) {
        await flushPending();
        if (syncState === 'error') throw new Error('Perubahan sebelumnya belum tersimpan. Coba sinkronkan lagi.');
      }
      var result = await authClient.from('duit_user_data')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (result.error) throw result.error;
      if (generation !== authGeneration || !currentUser || currentUser.id !== user.id) return;

      if (result.data) {
        db = normalizeDB(result.data.data);
      } else {
        db = defaultDB();
        await upsertData(user.id, db);
      }
      if (generation !== authGeneration) return;
      applyTheme();
      document.body.classList.remove('online-loading', 'online-logged-out');
      setSyncState('saved');
      render();
    } catch (error) {
      if (generation !== authGeneration) return;
      showGate('Data akun gagal dimuat: ' + getErrorMessage(error) + ' Periksa koneksi, tabel, dan kebijakan RLS, lalu coba lagi.', true, false);
      currentUser = user;
    }
  }

  function flushPending() {
    clearTimeout(writeTimer);
    if (writePromise) return writePromise;
    if (!pendingData || !currentUser || !authClient) return Promise.resolve();
    writeInProgress = true;
    setSyncState('saving');
    writePromise = (async function () {
      try {
        while (pendingData && currentUser) {
          var snapshot = pendingData;
          var userId = currentUser.id;
          pendingData = null;
          try {
            await upsertData(userId, snapshot);
          } catch (error) {
            pendingData = pendingData || snapshot;
            throw error;
          }
          if (!currentUser || currentUser.id !== userId) return;
        }
        syncErrorShown = false;
        setSyncState('saved');
      } catch (error) {
        setSyncState('error');
        if (!syncErrorShown) {
          syncErrorShown = true;
          if (typeof toast === 'function') toast('Cloud gagal menyimpan: ' + getErrorMessage(error), 'err');
        }
      } finally {
        writeInProgress = false;
        writePromise = null;
      }
    })();
    return writePromise;
  }

  function queueSave(data) {
    if (!currentUser) {
      if (typeof toast === 'function') toast('Tidak ada akun aktif; perubahan belum disimpan.', 'err');
      return false;
    }
    pendingData = JSON.parse(JSON.stringify(data));
    setSyncState('saving');
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushPending, 350);
    return true;
  }

  async function replaceData(data) {
    if (!currentUser) throw new Error('Silakan masuk sebelum memulihkan data.');
    clearTimeout(writeTimer);
    if (writePromise) await writePromise;
    if (pendingData) await flushPending();
    if (syncState === 'error') throw new Error('Perubahan sebelumnya belum tersimpan. Coba lagi sebelum memulihkan cadangan.');
    var normalized = normalizeDB(data);
    await upsertData(currentUser.id, normalized);
    pendingData = null;
    clearTimeout(writeTimer);
    db = normalized;
    setSyncState('saved');
  }

  async function signOut() {
    if (!currentUser) return;
    if (pendingData || writeInProgress || syncState === 'error') {
      var discard = window.confirm('Ada perubahan yang belum terkonfirmasi tersimpan ke cloud. Keluar tetap dapat membuang perubahan tersebut. Tetap keluar?');
      if (!discard) return;
    }
    var result = await authClient.auth.signOut();
    if (result.error) throw result.error;
  }

  function handleAuthClick(event) {
    var target = event.target.closest('[data-auth-mode], [data-cloud-action]');
    if (!target) return;
    if (target.dataset.authMode) {
      event.preventDefault();
      setAuthMode(target.dataset.authMode);
      return;
    }
    if (target.dataset.cloudAction === 'signout') {
      event.preventDefault();
      signOut().catch(function (error) {
        if (typeof toast === 'function') toast('Gagal keluar: ' + getErrorMessage(error), 'err');
      });
    } else if (target.dataset.cloudAction === 'retry') {
      event.preventDefault();
      if (currentUser) activateUser(currentUser);
    } else if (target.dataset.cloudAction === 'sync') {
      event.preventDefault();
      if (syncState === 'error') {
        syncErrorShown = false;
        flushPending();
      }
    }
  }

  async function start() {
    db = defaultDB();
    document.body.classList.add('online-loading');
    setAuthMode('signin');
    byId('authForm').addEventListener('submit', submitAuth);
    document.addEventListener('click', handleAuthClick);
    if (configurationError()) {
      showGate('Atur URL Supabase dan publishable/anon key di supabase-config.js sebelum menjalankan aplikasi.', true, false);
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      showGate('Library Supabase tidak dapat dimuat. Periksa koneksi internet lalu muat ulang halaman.', true, false);
      return;
    }
    authClient = window.supabase.createClient(
      window.DUIT_SUPABASE_CONFIG.url,
      window.DUIT_SUPABASE_CONFIG.anonKey
    );
    authClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update');
        showGate('', false, false);
      } else if (event === 'SIGNED_OUT' || !session) {
        authGeneration++;
        currentUser = null;
        pendingData = null;
        db = defaultDB();
        showGate('', false, false);
      } else if (event === 'SIGNED_IN' && session.user && (!currentUser || currentUser.id !== session.user.id)) {
        Promise.resolve().then(function () { activateUser(session.user); });
      }
    });

    var sessionResult = await authClient.auth.getSession();
    if (sessionResult.error) {
      showGate('Tidak dapat memeriksa sesi akun: ' + getErrorMessage(sessionResult.error), true, false);
      return;
    }
    if (sessionResult.data.session) {
      if (!currentUser || currentUser.id !== sessionResult.data.session.user.id) {
        await activateUser(sessionResult.data.session.user);
      }
    } else {
      showGate('', false, false);
    }
  }

  window.addEventListener('offline', function () {
    if (currentUser) showGate('Koneksi internet terputus. Aplikasi membutuhkan koneksi untuk membaca dan menyimpan data.', true, false);
  });
  window.addEventListener('online', function () {
    if (currentUser) activateUser(currentUser);
  });

  window.DuitOnline = {
    start: start,
    persist: queueSave,
    replaceData: replaceData,
    updateStatus: updateSyncStatus,
    email: function () { return currentUser ? currentUser.email || '' : ''; },
    retry: flushPending
  };
})();
