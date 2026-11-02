(async function init() {
  state.history = loadHistory();
  state.user = loadUser(); 

  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    const { data: adminData } = await supabaseClient
      .from('admins').select('username, email').eq('id', session.user.id).single();

    if (adminData) {
      state.user = { username: adminData.username || 'Admin', email: session.user.email, isAdmin: true };
      saveUser(state.user);
      showScreen('screen-admin');
      showAdminTab('admin-dashboard');
      loadAdminDashboard();
      return; 
    }
  }

  try {
      const { data: accessData } = await supabaseClient.from('settings').select('value').eq('key', 'page_access').single();
      if (accessData && accessData.value) {
          pageAccess = { ...defaultPageAccess, ...JSON.parse(accessData.value) };
      }
  } catch(e) {}

  await checkWebStatus();

  try {
    supabaseClient.channel('public:settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, payload => {
        if (payload.new && payload.new.key === 'web_status') checkWebStatus();
        if (payload.new && payload.new.key === 'announcement') loadAnnouncement();
        if (payload.new && payload.new.key === 'api_key') {
            API_KEYS = payload.new.value.split(',').map(k => k.trim()).filter(Boolean);
            if (API_KEYS.length === 0) API_KEYS = ['kayz-r6azlrf2ql6864c6x6uf'];
        }
        if (payload.new && payload.new.key === 'page_access') {
            try {
                pageAccess = { ...defaultPageAccess, ...JSON.parse(payload.new.value) };
                applyPageAccess();
            } catch(e){}
        }
      })
      .subscribe();

    supabaseClient.channel('realtime-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_logs' }, payload => {
        if (document.getElementById('tab-admin-audit').classList.contains('active')) {
          renderAdminAudit();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_logs' }, payload => {
        if (document.getElementById('tab-admin-logs').classList.contains('active')) {
          renderAdminLogs();
        }
      })
      .subscribe();
      
    if (state.user && !state.user.isAdmin) {
      supabaseClient.channel('user-data-' + state.user.username)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `username=eq.${state.user.username}` }, payload => {
           if (payload.new) {
               if (payload.new.device_id && payload.new.device_id !== myDeviceId) {
                   forceLogout('Sesi berakhir: Akun Anda telah login di perangkat lain.');
                   return;
               }

               if (payload.new.status === 'banned') {
                   forceLogout('Akun Anda telah diblokir oleh Admin secara real-time.');
                   return;
               }

               const oldBonus = state.user.bonus_kuota || 0;
               const newBonus = payload.new.bonus_kuota || 0;
               const oldSaldo = state.user.saldo || 0;
               const newSaldo = payload.new.saldo || 0;

               if (newBonus > oldBonus) {
                   toast(`Admin menambahkan bonus kuota +${newBonus - oldBonus}!`, 'success');
               } else if (newBonus < oldBonus) {
                   toast(`Kuota Anda dikurangi ${oldBonus - newBonus} oleh Admin.`, 'error');
               }

               if (newSaldo > oldSaldo) {
                   toast(`Saldo Anda bertambah +${newSaldo - oldSaldo}!`, 'success');
               }

               state.user.limit_harian = payload.new.limit_harian || 30;
               state.user.kuota_terpakai = payload.new.kuota_terpakai || 0;
               state.user.reset_kuota_at = payload.new.reset_kuota_at;
               state.user.tier = payload.new.tier || 'Free';
               state.user.bonus_kuota = newBonus;
               state.user.referral_code = payload.new.referral_code || '';
               state.user.vip_expired_at = payload.new.vip_expired_at;
               state.user.saldo = newSaldo;
               state.user.last_checkin = payload.new.last_checkin;
               
               saveUser(state.user);
               renderUserQuota();
               checkDailyButtonState();
           }
        })
        .subscribe();

        supabaseClient.channel('support-tickets-' + state.user.username)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `username=eq.${state.user.username}` }, payload => {
             if (payload.new && document.getElementById('tab-support').classList.contains('active')) {
                 loadSupportTickets();
                 if(payload.new.status === 'replied') toast('Admin membalas tiket Anda!', 'success');
                 else if(payload.new.status === 'closed') toast('Admin menutup tiket Anda.', 'info');
             }
          })
          .subscribe();

        // Realtime listener untuk tabel transactions
        supabaseClient.channel('user-transactions-' + state.user.username)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: `username=eq.${state.user.username}` }, payload => {
              if (document.getElementById('tab-store').classList.contains('active')) {
                  loadTransactionHistory();
              }
          })
          .subscribe();
    }
    if (state.user && state.user.isAdmin) {
        supabaseClient.channel('admin-notif').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, payload => {
            addAdminNotification(`Tiket Baru: ${payload.new.subject} dari ${payload.new.username}`);
            toast('Tiket bantuan baru masuk!', 'info');
        }).subscribe();
    }
  } catch (e) {}

  if (state.user) {
    if (state.user.isAdmin) {
      showScreen('screen-admin');
      showAdminTab('admin-dashboard');
      loadAdminDashboard();
    } else {
      enterDashboard();
    }
    
    setInterval(async () => {
      if (state.user && !state.user.isAdmin) {
        await syncUserData();
      }
    }, 5000); 

  } else {
    showScreen('screen-login');
  }
})();

function alightMotionVerify(email, link) {
    axios.get('https://apikayz.clutch.web.id/tools/am-verify', {
      params: { apikey: 'kayz-r6azlrf2ql6864c6x6uf', email: email, link: link }
    }).then(response => console.log('AM Verify Response:', response.data)).catch(error => console.error('AM Verify Error:', error));
}

function alightMotionBulk(count) {
    axios.get('https://apikayz.clutch.web.id/tools/am-bulk', {
      params: { apikey: 'kayz-r6azlrf2ql6864c6x6uf', count: count }
    }).then(response => console.log('AM Bulk Response:', response.data)).catch(error => console.error('AM Bulk Error:', error));
}