function addHistory(item) { 
  state.history.unshift({ ...item, at: Date.now() }); 
  saveHistory(); 
  renderHistory(); 
  renderStats(); 
}
function renderStats() {
  $('stat-sent').textContent = state.history.filter(h => h.type === 'send').length;
  $('stat-verified').textContent = state.history.filter(h => h.type === 'verify' && h.ok).length;
  $('stat-bulk').textContent = state.history.filter(h => h.type === 'bulk').reduce((a, b) => a + (b.count || 0), 0);
}
function renderHistory() {
  const list = $('history-list');
  if (!state.history.length) { list.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">Belum ada aktivitas.</p>'; return; }
  list.innerHTML = state.history.map(h => {
    const time = new Date(h.at).toLocaleString('id-ID');
    const label = { send: 'Link terkirim', verify: h.ok ? 'Verifikasi berhasil' : 'Verifikasi gagal', bulk: 'Bulk: ' + (h.count || 0) + ' akun' }[h.type] || h.type;
    return `<div class="history-item"><div><strong>${label}</strong><small>${escapeHtml(h.email)}</small></div><small style="color:var(--text-muted);">${time}</small></div>`;
  }).join('');
}

$('export-history-btn').addEventListener('click', () => {
  if (!state.history || !state.history.length) return toast('Tidak ada riwayat untuk diexport', 'error');
  
  let csvContent = "Tipe,Target/Jumlah,Status,Waktu\n";
  state.history.forEach(h => {
    const time = new Date(h.at).toLocaleString('id-ID');
    const label = { send: 'Link terkirim', verify: h.ok ? 'Verifikasi berhasil' : 'Verifikasi gagal', bulk: 'Bulk: ' + (h.count || 0) + ' akun' }[h.type] || h.type;
    const target = h.type === 'bulk' ? h.count + ' akun' : h.email;
    csvContent += `"${label}","${target}","${h.ok ? 'Success' : 'Failed'}",\"${time}\"\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `zyxell_history_${state.user.username}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Riwayat berhasil diexport', 'success');
});

const sendForm = $('send-form');
const sendBtn = $('send-btn');
sendForm.addEventListener('submit', async e => {
  e.preventDefault();
  
  await syncUserData();
  if (!state.user) return;

  const baseLimit = state.user.tier === 'VIP' ? 5000 : 30;
  const totalLimit = baseLimit + (state.user.bonus_kuota || 0);
  const used = state.user.kuota_terpakai || 0;
  if (used >= totalLimit) {
    return toast('Limit harian Anda sudah habis. Silakan tunggu 24 jam.', 'error');
  }

  const email = $('send-email').value.trim(); if (!email) return;
  state.currentEmail = email;
  sendBtn.disabled = true; sendBtn.innerHTML = '<span class="spin-inline"></span> Memproses...';
  
  try {
    const data = await api.send(email);
    const magicLink = findLink(data);
    if (magicLink) { 
      try { await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, magicLink }) }); } catch (err) { console.error('Gagal kirim email:', err); } 
    }
    addHistory({ type: 'send', email, detail: magicLink ? 'Link diproses' : 'Link dikirim' });
    $('wait-email').textContent = email; showStep('waiting');
    if (magicLink) { $('auto-link-box').style.display = 'block'; $('auto-link-text').textContent = magicLink; $('verify-link').value = magicLink; } else { $('auto-link-box').style.display = 'none'; }
    toast('Link berhasil diproses!', 'success');
  } catch (err) { 
    console.error("Error Send Link:", err);
    toast('Gagal: ' + err.message, 'error'); 
  } finally { 
    sendBtn.disabled = false; 
    sendBtn.textContent = 'Kirim Tautan Verifikasi'; 
  }
});
function findLink(obj) { if (!obj) return null; const m = JSON.stringify(obj).match(/https?:\\?\/\\?\/[^"'\s]+/); return m ? m[0].replace(/\\\//g, '/') : null; }
$('resend-btn').addEventListener('click', async () => {
  const btn = $('resend-btn'); btn.disabled = true; btn.textContent = 'Memproses...';
  try {
    const data = await api.send(state.currentEmail); const magicLink = findLink(data);
    if (magicLink) await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.currentEmail, magicLink }) }).catch(()=>{});
    addHistory({ type: 'send', email: state.currentEmail, detail: 'Kirim ulang' }); toast('Link dikirim ulang', 'success');
  } catch (err) { toast('Gagal: ' + err.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'Kirim Ulang'; }
});
$('cancel-send').addEventListener('click', resetSendFlow);
$('verify-btn').addEventListener('click', async () => {
  const link = $('verify-link').value.trim(); if (!link) return toast('Tempel tautan terlebih dahulu', 'error');
  const btn = $('verify-btn'); btn.disabled = true; btn.innerHTML = '<span class="spin-inline"></span> Memverifikasi...';
  try {
    const data = await api.verify(state.currentEmail, link);
    const ok = detectSuccess(data);
    addHistory({ type: 'verify', email: state.currentEmail, ok, detail: ok ? 'Premium aktif' : 'Gagal' });
    if (ok) {
      await deductQuota(1); 
      showSuccess();
    } else {
      toast('Verifikasi gagal.', 'error');
    }
  } catch (err) { toast('Gagal: ' + err.message, 'error'); addHistory({ type: 'verify', email: state.currentEmail, ok: false, detail: 'Error' }); } finally { btn.disabled = false; btn.textContent = 'Verifikasi'; }
});
function detectSuccess(data) {
  if (!data) return false;
  if (typeof data === 'string') {
    const s = data.toLowerCase();
    return /success|berhasil|premium|verified|active/.test(s) && !/false|failed|gagal|error/.test(s);
  }
  if (typeof data !== 'object') return false;
  if (data.status === true || data.success === true || data.ok === true) return true;
  if (data.status === 'success' || data.status === 'ok' || data.status === 'premium') return true;
  if (data.premium === true || data.verified === true || data.active === true) return true;
  const stack = [data];
  let iterations = 0;
  while (stack.length && iterations < 200) {
    iterations++;
    const obj = stack.pop();
    if (!obj || typeof obj !== 'object') continue;
    if (obj.status === true || obj.success === true || obj.ok === true) return true;
    if (obj.status === 'success' || obj.status === 'ok' || obj.status === 'premium') return true;
    if (obj.premium === true || obj.verified === true || obj.active === true) return true;
    for (const k in obj) {
      if (obj[k] && typeof obj[k] === 'object') stack.push(obj[k]);
    }
  }
  const str = JSON.stringify(data).toLowerCase();
  const hasSuccess = /"(success|status)"\s*:\s*(true|"success"|"ok"|"premium")/.test(str)
    || /"premium"\s*:\s*true/.test(str)
    || /"verified"\s*:\s*true/.test(str)
    || /berhasil/.test(str);
  const hasFail = /"success"\s*:\s*false/.test(str)
    || /"status"\s*:\s*"(error|failed|gagal)"/.test(str)
    || /"(error|failed|gagal)"\s*:/.test(str);
  return hasSuccess && !hasFail;
}
function showSuccess() {
  $('success-email').textContent = state.currentEmail;
  const until = new Date(); until.setFullYear(until.getFullYear() + 1);
  $('success-until').textContent = until.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  showStep('success'); toast('Akun premium aktif!', 'success');
}
$('success-done').addEventListener('click', () => { resetSendFlow(); showTab('overview'); });

$('bulk-btn').addEventListener('click', async () => {
  await syncUserData();
  if (!state.user) return;

  const userIp = await getIP();
  const inputCount = parseInt($('bulk-count').value, 10) || 0;
  
  const baseLimit = state.user.tier === 'VIP' ? 5000 : 30;
  const totalLimit = baseLimit + (state.user.bonus_kuota || 0);
  const used = state.user.kuota_terpakai || 0;
  
  if (!inputCount || inputCount < 1) return toast('Jumlah tidak valid', 'error');
  if (used + inputCount > totalLimit) {
    return toast(`Limit tidak cukup. Sisa limit Anda: ${Math.max(0, totalLimit - used)} akun.`, 'error');
  }

  const btn = $('bulk-btn'); 
  btn.disabled = true; 
  btn.innerHTML = '<span class="spin-inline"></span> Memasukkan ke Antrean...'; 

  try {
    const { data: queueData, error: queueErr } = await supabaseClient.from('bulk_queue').insert([{
      username: state.user.username,
      count: inputCount,
      status: 'pending'
    }]).select().single();

    if (queueErr) throw queueErr;

    toast('Antrean berhasil dibuat! Proses berjalan di background.', 'success');
    $('bulk-result').style.display = 'block';
    $('bulk-result').innerHTML = `
      <div class="result-row"><span>Status</span><strong style="color:var(--accent);">Menunggu Antrean...</strong></div>
      <p style="font-size:12px; text-align:center; margin-top:10px;">Anda boleh menutup halaman ini. Proses akan berjalan otomatis di server (per 1 menit). Cek menu Riwayat nanti.</p>
    `;

    const queueId = queueData.id;
    let checkCount = 0;
    const pollInterval = setInterval(async () => {
      checkCount++;
      const { data: statusData } = await supabaseClient.from('bulk_queue').select('status, error_msg').eq('id', queueId).single();
      
      if (statusData) {
        if (statusData.status === 'completed') {
          clearInterval(pollInterval);
          $('bulk-result').innerHTML = `<div class="result-row"><span>Status</span><strong style="color:var(--success);">Berhasil Diproses!</strong></div>`;
          toast('Bulk berhasil diproses oleh server!', 'success');
          addHistory({ type: 'bulk', count: inputCount, detail: 'Selesai (Queue)', email: state.user.username });
          syncUserData();
          btn.disabled = false; btn.textContent = 'Jalankan Bulk';
        } else if (statusData.status === 'failed') {
          clearInterval(pollInterval);
          $('bulk-result').innerHTML = `<div class="result-row"><span>Gagal</span><strong style="color:var(--danger);">${statusData.error_msg}</strong></div>`;
          toast('Antrean gagal: ' + statusData.error_msg, 'error');
          btn.disabled = false; btn.textContent = 'Jalankan Bulk';
        } else if (checkCount > 30) { 
          clearInterval(pollInterval);
          $('bulk-result').innerHTML = `<div class="result-row"><span>Status</span><strong>Masih Diproses (Cek Riwayat Nanti)</strong></div>`;
          btn.disabled = false; btn.textContent = 'Jalankan Bulk';
        }
      }
    }, 10000);

  } catch (err) {
    console.error("Error Queue Bulk:", err);
    toast('Gagal masuk antrean: ' + err.message, 'error');
    btn.disabled = false; 
    btn.textContent = 'Jalankan Bulk'; 
  }
});

$('clear-history').addEventListener('click', () => {
  if (!confirm('Hapus semua riwayat?')) return;
  state.history = []; saveHistory(); renderHistory(); renderStats(); toast('Riwayat dihapus', 'success');
});

function checkDailyButtonState() {
   const btn = document.getElementById('btn-checkin');
   if(!btn || !state.user) return;
   const today = new Date().toISOString().split('T')[0];
   if (state.user.last_checkin === today) {
      btn.disabled = true; btn.textContent = 'Sudah Diklaim'; btn.className = 'btn btn-ghost btn-sm';
   } else {
      btn.disabled = false; btn.textContent = 'Klaim Kuota'; btn.className = 'btn btn-primary btn-sm';
   }
}

async function claimDailyReward() {
   if (!state.user) return;
   const today = new Date().toISOString().split('T')[0];
   if (state.user.last_checkin === today) return toast('Anda sudah klaim hari ini.', 'error');
   
   const btn = document.getElementById('btn-checkin');
   btn.disabled = true; btn.innerHTML = '<span class="spin-inline"></span> Klaim...';
   
   try {
      const newBonus = (state.user.bonus_kuota || 0) + 5;
      const { error } = await supabaseClient.from('users').update({ bonus_kuota: newBonus, last_checkin: today }).eq('username', state.user.username);
      if (error) throw error;
      
      state.user.bonus_kuota = newBonus; state.user.last_checkin = today;
      saveUser(state.user); renderUserQuota(); checkDailyButtonState();
      toast('Berhasil klaim +5 Kuota!', 'success');
   } catch (err) {
      toast('Gagal klaim: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Klaim Kuota';
   }
}

async function loadSupportTickets() {
   if (!state.user) return;
   const list = document.getElementById('support-tickets-list');
   list.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
   
   try {
      const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('username', state.user.username).order('created_at', { ascending: false });
      if (error) throw error;
      
      if (!data || data.length === 0) {
         list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Belum ada tiket. Silakan buat baru jika ada kendala.</p>';
         return;
      }
      
      list.innerHTML = data.map(t => {
         let messages = t.messages || [];
         if (messages.length === 0 && t.message) {
             messages.push({ sender: 'user', text: t.message, time: t.created_at });
             if (t.admin_reply) messages.push({ sender: 'admin', text: t.admin_reply, time: t.replied_at });
         }

         const chatHtml = messages.map(m => `
            <div class="chat-bubble ${m.sender}">
               ${escapeHtml(m.text)}
               <span class="chat-time">${new Date(m.time).toLocaleString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
         `).join('');

         const isClosed = t.status === 'closed';
         const canReply = t.status === 'replied' && !isClosed;
         const statusBadge = isClosed 
             ? '<span class="badge-status badge-closed">Tiket Ditutup</span>' 
             : (t.status === 'replied' 
                 ? '<span class="badge-status badge-replied">Admin Membalas</span>' 
                 : '<span class="badge-status badge-open">Menunggu Admin</span>');

         let actionButtons = '';
         if (!isClosed) {
             actionButtons = `<div style="margin-top:10px; display:flex; gap:8px;">
                 <button class="btn btn-danger btn-sm" onclick="closeTicket('${t.id}')">Tutup Tiket</button>
             </div>`;
         }

         return `
         <div class="ticket-card">
            <div class="ticket-header">
               <span>Subjek: <strong>${escapeHtml(t.subject)}</strong></span>
               ${statusBadge}
            </div>
            
            <div class="ticket-chat-box">
               ${chatHtml}
            </div>

            ${canReply ? `
               <form class="chat-reply-form" onsubmit="replyTicket(event, '${t.id}')">
                  <input type="text" id="reply-input-${t.id}" placeholder="Ketik balasan Anda..." required>
                  <button type="submit" class="btn btn-primary btn-sm" id="reply-btn-${t.id}">Kirim</button>
               </form>
            ` : (isClosed ? '' : `
               <p style="font-size:12px; color:var(--text-muted); text-align:center; margin-top:10px;">
                  <em>Menunggu balasan Admin sebelum Anda dapat membalas lagi.</em>
               </p>
            `)}
            
            ${actionButtons}
            
            <div style="margin-top:12px; font-size:10px; color:var(--text-muted); text-align:right;">ID: ${t.id}</div>
         </div>
         `;
      }).join('');
   } catch (err) {
      list.innerHTML = '<p style="color:var(--danger); text-align:center;">Gagal memuat tiket.</p>';
   }
}

async function replyTicket(e, ticketId) {
   e.preventDefault();
   if (!state.user) return;
   
   const input = document.getElementById(`reply-input-${ticketId}`);
   const btn = document.getElementById(`reply-btn-${ticketId}`);
   const text = input.value.trim();
   if (!text) return;

   btn.disabled = true; btn.innerHTML = '<span class="spin-inline"></span>';

   try {
      const { data: ticket, error: getErr } = await supabaseClient.from('support_tickets').select('messages').eq('id', ticketId).single();
      if (getErr) throw getErr;

      let messages = ticket.messages || [];
      messages.push({ sender: 'user', text: text, time: new Date().toISOString() });

      const { error: updErr } = await supabaseClient.from('support_tickets').update({ 
         status: 'open', 
         messages: messages 
      }).eq('id', ticketId);
      
      if (updErr) throw updErr;

      toast('Balasan terkirim ke Admin', 'success');
      loadSupportTickets();

      notifyTelegram(`*BALASAN TIKET BARU*\n\nUser: ${state.user.username}\nPesan: ${text}\n\n_Buka panel admin atau gunakan /reply ${ticketId} <pesan> untuk membalas._`);
   } catch (err) {
      toast('Gagal mengirim: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Kirim';
   }
}

async function closeTicket(ticketId) {
    if (!confirm('Apakah Anda yakin ingin menutup tiket ini? Anda tidak dapat membalas lagi setelah ditutup.')) return;
    try {
        const { error } = await supabaseClient.from('support_tickets').update({ status: 'closed' }).eq('id', ticketId);
        if (error) throw error;
        toast('Tiket berhasil ditutup', 'success');
        loadSupportTickets();
        notifyTelegram(`*TIKET DITUTUP*\n\nID Tiket: \`${ticketId}\`\nDitutup oleh: ${state.user.username}`);
    } catch (err) {
        toast('Gagal menutup tiket: ' + err.message, 'error');
    }
}

document.getElementById('ticket-form').addEventListener('submit', async (e) => {
   e.preventDefault();
   if (!state.user) return;
   const subj = document.getElementById('ticket-subject').value.trim();
   const msg = document.getElementById('ticket-message').value.trim();
   if (!subj || !msg) return;
   
   const btn = document.getElementById('ticket-btn');
   btn.disabled = true; btn.innerHTML = '<span class="spin-inline"></span> Mengirim...';
   
   try {
      const { data, error } = await supabaseClient.from('support_tickets').insert([{ 
         username: state.user.username, 
         subject: subj, 
         message: msg,
         status: 'open',
         messages: [{ sender: 'user', text: msg, time: new Date().toISOString() }] 
      }]).select().single();
      if (error) throw error;
      
      document.getElementById('ticket-form').reset();
      loadSupportTickets();
      toast('Tiket berhasil dikirim ke Admin', 'success');
      
      notifyTelegram(`*TIKET BANTUAN BARU!*\n\nDari: ${state.user.username}\nSubjek: ${subj}\nPesan: ${msg}\n\nID Tiket: \`${data.id}\`\n\n_Balas dengan:_ \`/reply ${data.id} <pesan balasan>\``);
      
   } catch (err) {
      toast('Gagal kirim tiket: ' + err.message, 'error');
   } finally {
      btn.disabled = false; btn.textContent = 'Kirim Tiket';
   }
});

async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        const { data, error } = await supabaseClient.from('users').select('username, total_generated, avatar').order('total_generated', { ascending: false }).limit(10);
        if (error) throw error;
        
        if (!data.length) return list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Belum ada data.</p>';
        
        list.innerHTML = data.map((u, i) => `
            <div class="leaderboard-item">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="leaderboard-rank" style="color:${i===0?'#fbbf24':i===1?'#cbd5e1':i===2?'#b45309':'var(--text-muted)'};">#${i+1}</div>
                    <div class="avatar" style="background-image:url('${u.avatar || ''}')">${u.avatar ? '' : u.username[0].toUpperCase()}</div>
                    <strong>${escapeHtml(u.username)}</strong>
                </div>
                <div class="leaderboard-score">${u.total_generated || 0} Generate</div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = 'Gagal memuat.'; }
}

async function sendTestEmail() {
    const email = document.getElementById('test-email-target').value.trim();
    const magicLink = document.getElementById('test-email-link').value.trim();
    const btn = document.getElementById('btn-send-test-email');
    const resultBox = document.getElementById('test-email-result');
    const tbody = document.getElementById('test-email-log-tbody');
    
    if (!email) return toast('Masukkan email tujuan', 'error');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-inline"></span> Mengirim...';
    resultBox.style.display = 'none';
    
    try {
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, magicLink })
        });
        
        const data = await res.json();
        
        if (tbody.innerHTML.includes('Belum ada tes email')) {
            tbody.innerHTML = '';
        }

        const time = new Date().toLocaleTimeString('id-ID');
        const tr = document.createElement('tr');
        
        if (res.ok) {
            resultBox.style.display = 'block';
            resultBox.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            resultBox.style.border = '1px solid var(--success)';
            resultBox.innerHTML = `<strong style="color: var(--success);">Berhasil!</strong><br>Email berhasil dikirim ke <b>${email}</b>. Silakan cek Inbox/Spam.`;
            toast('Email berhasil dikirim!', 'success');
            
            tr.innerHTML = `<td>${email}</td><td><span style="color:var(--success); font-weight:bold;">Berhasil</span></td><td>${time}</td>`;
        } else {
            throw new Error(data.message || data.error || 'Gagal mengirim email');
        }
        tbody.prepend(tr); 
        
    } catch (err) {
        resultBox.style.display = 'block';
        resultBox.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        resultBox.style.border = '1px solid var(--danger)';
        resultBox.innerHTML = `<strong style="color: var(--danger);">Gagal!</strong><br>Error: ${err.message}<br><br><small>Pastikan RESEND_API_KEY sudah di-set di Vercel dan domain sudah diverifikasi.</small>`;
        toast('Gagal mengirim email: ' + err.message, 'error');
        
        const time = new Date().toLocaleTimeString('id-ID');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${email}</td><td><span style="color:var(--danger); font-weight:bold;">Gagal</span></td><td>${time}</td>`;
        tbody.prepend(tr);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim Tes Email';
    }
}

async function broadcastEmail() {
    if (!confirm('Apakah Anda yakin ingin mengirim email BROADCAST ke SEMUA pengguna terdaftar? Tindakan ini tidak dapat dibatalkan.')) return;
    
    const btn = document.getElementById('btn-broadcast-email');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-inline"></span> Memproses Broadcast...';
    
    try {
        const { data: users, error } = await supabaseClient.from('users').select('email').neq('role', 'admin').not('email', 'is', null);
        if (error) throw error;
        if (!users || users.length === 0) return toast('Tidak ada user yang memiliki email valid.', 'error');
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < users.length; i++) {
            const email = users[i].email;
            if(!email) continue;
            
            try {
                const res = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: email, 
                        magicLink: 'https://zyxell-bulk.vercel.app/#', 
                        isBroadcast: true 
                    })
                });
                
                if (res.ok) successCount++;
                else failCount++;
            } catch(e) {
                failCount++;
            }
            
            await new Promise(r => setTimeout(r, 100));
        }
        
        toast(`Broadcast selesai! Berhasil: ${successCount}, Gagal: ${failCount}`, successCount > 0 ? 'success' : 'error');
        
    } catch (err) {
        toast('Gagal memproses broadcast: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim Broadcast Email ke SEMUA User';
    }
}