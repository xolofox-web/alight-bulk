async function requestTopup(type, amount) {
  if (!state.user) return;
  const confirmPay = confirm(`Kirim request topup ${type === 'vip' ? 'VIP 30 Hari' : '+50 Kuota'} ke Admin?`);
  if (!confirmPay) return;
  
  toast('Mengirim request ke Admin...', 'info');
  try {
    const res = await fetch('/api/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_topup', username: state.user.username, amount, type })
    });
    if (res.ok) toast('Request terkirim! Admin akan segera memproses.', 'success');
    else throw new Error('Gagal mengirim request');
  } catch (err) { toast('Gagal: ' + err.message, 'error'); }
}

// ============================================================
// FITUR PEMBAYARAN QRIS CASHI.ID (DESAIN BARU)
// ============================================================
const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
};

async function initiateQrisPayment(amount, type, existingOrderId = null, existingExpiresAt = null) {
  if (!state.user) return toast('Anda harus login terlebih dahulu', 'error');

  if (existingOrderId) {
      currentOrderId = existingOrderId;
      currentAmount = amount;
      
      const { data: trx, error: trxErr } = await supabaseClient
          .from('transactions').select('*').eq('order_id', existingOrderId).single();
      
      if (trxErr || !trx) return toast('Transaksi tidak ditemukan di database.', 'error');
      if (trx.status === 'success') return toast('Transaksi ini sudah dibayar.', 'info');
      if (trx.status === 'failed') return toast('Transaksi ini sudah dibatalkan.', 'error');
      
      document.getElementById('qris-product-name').textContent = type === 'vip' ? 'VVIP UPGRADE (30 HARI)' : 'BOOSTER (+1000 KUOTA)';
      document.getElementById('qris-order-id').textContent = existingOrderId;
      document.getElementById('qris-nominal').textContent = formatRupiah(amount);
      document.getElementById('qris-total').textContent = formatRupiah(amount);
      
      const statusBox = document.getElementById('qris-status-box');
      statusBox.className = 'qris-status-wrapper';
      document.getElementById('qris-status-text').textContent = 'Menunggu Pembayaran...';
      
      document.getElementById('qris-modal').style.display = 'flex';
      document.getElementById('qris-loading').style.display = 'none';
      document.getElementById('qris-content').style.display = 'block';
      
      let qrSource = trx.qr_url;
      if (!qrSource) {
          qrSource = 'https://via.placeholder.com/250x250?text=QR+Tidak+Ditemukan';
      } else if (!qrSource.startsWith('http') && !qrSource.startsWith('data:image')) {
          qrSource = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrSource)}`;
      }
      document.getElementById('qris-image').src = qrSource;
      
      startQrisCountdown(trx.expires_at || existingExpiresAt);
      pollPaymentStatus(existingOrderId);
      return;
  }

  const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  currentOrderId = orderId;
  currentAmount = amount;

  const productName = type === 'vip' ? 'VVIP UPGRADE (30 HARI)' : 'BOOSTER (+1000 KUOTA)';
  
  document.getElementById('qris-product-name').textContent = productName;
  document.getElementById('qris-order-id').textContent = orderId;
  document.getElementById('qris-nominal').textContent = formatRupiah(amount);
  document.getElementById('qris-total').textContent = formatRupiah(amount);
  document.getElementById('qris-countdown').textContent = '15:00';
  
  const statusBox = document.getElementById('qris-status-box');
  statusBox.className = 'qris-status-wrapper';
  document.getElementById('qris-status-text').textContent = 'Menunggu Pembayaran...';
  
  document.getElementById('qris-modal').style.display = 'flex';
  document.getElementById('qris-loading').style.display = 'block';
  document.getElementById('qris-content').style.display = 'none';

  try {
    let data;
    try {
        const res = await fetch('/api/cashi/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, order_id: orderId, username: state.user.username, type })
        });
        data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'API Gagal');
    } catch (apiError) {
        throw new Error('Gagal membuat QRIS: ' + apiError.message);
    }

    document.getElementById('qris-loading').style.display = 'none';
    document.getElementById('qris-content').style.display = 'block';
    
    let qrSource = data.qr_url || data.qr_string;
    if (!qrSource && data.raw) {
        const raw = data.raw.data || data.raw;
        qrSource = raw.qr_url || raw.qr_string || raw.qr_code || raw.payment_url || raw.qrString;
    }
    
    if (!qrSource) {
        throw new Error('Backend tidak mengirim data QR.');
    }

    if (!qrSource.startsWith('http') && !qrSource.startsWith('data:image')) {
        qrSource = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrSource)}`;
    }

    const qrImage = document.getElementById('qris-image');
    qrImage.src = qrSource;
    qrImage.onerror = function() {
        this.onerror = null;
        this.src = 'https://via.placeholder.com/250x250?text=Gagal+Memuat+Gambar+QR';
    };

    const { error: dbError } = await supabaseClient.from('transactions').insert([{
        username: state.user.username,
        order_id: orderId,
        product_name: productName,
        plan_type: type,
        amount: amount,
        status: 'pending',
        qr_url: qrSource,
        expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
    }]);

    if (dbError) console.error("Gagal simpan ke DB:", dbError);
    
    startQrisCountdown(data.expires_at || null);
    pollPaymentStatus(orderId);

  } catch (err) {
    document.getElementById('qris-loading').style.display = 'none';
    document.getElementById('qris-content').style.display = 'block';
    statusBox.className = 'qris-status-wrapper error';
    document.getElementById('qris-status-text').innerHTML = err.message;
    toast('Gagal memuat QRIS.', 'error');
  }
}

function startQrisCountdown(expiresAtStr) {
  if (qrisCountdownInterval) clearInterval(qrisCountdownInterval);
  
  let targetTime = expiresAtStr ? new Date(expiresAtStr).getTime() : new Date().getTime() + 15 * 60 * 1000;

  qrisCountdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = targetTime - now;

    if (distance < 0) {
      clearInterval(qrisCountdownInterval);
      document.getElementById('qris-countdown').textContent = '00:00';
      document.getElementById('qris-status-box').className = 'qris-status-wrapper error';
      document.getElementById('qris-status-text').textContent = 'Waktu Habis';
      if (qrisPollInterval) clearInterval(qrisPollInterval);
      return;
    }

    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    document.getElementById('qris-countdown').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function pollPaymentStatus(orderId) {
  if (qrisPollInterval) clearInterval(qrisPollInterval);
  
  qrisPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/cashi/check-status?order_id=${orderId}`);
      const data = await res.json();
      
      const statusBox = document.getElementById('qris-status-box');
      const statusText = document.getElementById('qris-status-text');

      if (data.status === 'SETTLED' || data.status === 'SUCCESS') {
        clearInterval(qrisPollInterval);
        clearInterval(qrisCountdownInterval);
        statusBox.className = 'qris-status-wrapper success';
        statusText.innerHTML = 'Pembayaran Berhasil';
        
        await supabaseClient.from('transactions').update({ status: 'success' }).eq('order_id', orderId);
        
        toast('Pembayaran berhasil!', 'success');
        setTimeout(() => {
          closeQrisModal();
          syncUserData();
          loadTransactionHistory();
        }, 3000);
      } else if (data.status === 'EXPIRED') {
        clearInterval(qrisPollInterval);
        clearInterval(qrisCountdownInterval);
        statusBox.className = 'qris-status-wrapper error';
        statusText.textContent = 'QRIS Kedaluwarsa';
      }
    } catch (e) { 
      console.log('Polling error', e); 
    }
  }, 5000);
}

async function checkTransactionStatus(btn) {
  if (!currentOrderId) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Mengecek...';

  try {
    const res = await fetch(`/api/cashi/check-status?order_id=${currentOrderId}`);
    const data = await res.json();
    
    const statusBox = document.getElementById('qris-status-box');
    const statusText = document.getElementById('qris-status-text');

    if (data.status === 'SETTLED' || data.status === 'SUCCESS') {
      if (qrisPollInterval) clearInterval(qrisPollInterval);
      if (qrisCountdownInterval) clearInterval(qrisCountdownInterval);
      statusBox.className = 'qris-status-wrapper success';
      statusText.innerHTML = 'Pembayaran Berhasil';
      
      await supabaseClient.from('transactions').update({ status: 'success' }).eq('order_id', currentOrderId);
      toast('Pembayaran berhasil!', 'success');
      setTimeout(() => {
        closeQrisModal();
        syncUserData();
        loadTransactionHistory();
      }, 3000);
    } else if (data.status === 'EXPIRED') {
      if (qrisPollInterval) clearInterval(qrisPollInterval);
      if (qrisCountdownInterval) clearInterval(qrisCountdownInterval);
      statusBox.className = 'qris-status-wrapper error';
      statusText.textContent = 'QRIS Kedaluwarsa';
      toast('QRIS kedaluwarsa. Transaksi tetap PENDING.', 'info');
    } else {
      toast('Status: ' + (data.status || 'PENDING') + '. Belum ada pembayaran masuk.', 'info');
    }
  } catch (e) {
    toast('Gagal mengecek status transaksi.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function closeQrisModal() {
  document.getElementById('qris-modal').style.display = 'none';
  if (qrisPollInterval) clearInterval(qrisPollInterval);
  if (qrisCountdownInterval) clearInterval(qrisCountdownInterval);
  
  if (document.getElementById('tab-store').classList.contains('active')) {
      loadTransactionHistory();
  }
  
  if (currentOrderId) {
      toast('Jendela ditutup. Transaksi masih PENDING.', 'info');
  }
}

async function loadTransactionHistory() {
    if (!state.user) return;
    const tbody = document.getElementById('transaction-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><span class="spin-inline"></span> Memuat data...</td></tr>';
    
    try {
        const { data, error } = await supabaseClient.from('transactions')
            .select('*')
            .eq('username', state.user.username)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Belum ada riwayat transaksi.</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(trx => {
            let statusBadge = '';
            let actionBtns = '';
            
            let planType = trx.plan_type || (trx.amount === 35000 ? 'vip' : 'kuota');
            let productName = trx.product_name || (trx.amount === 35000 ? 'VIP 30 Hari' : 'Booster (+1000 Kuota)');
            const displayPlan = (planType === 'vip') ? 'VIP' : 'BOOSTER';

            if (trx.status === 'success') {
                statusBadge = '<span class="badge-status active">Berhasil</span>';
                actionBtns = '<span style="font-size:11px; color:var(--success);">Sukses</span>';
            } else if (trx.status === 'pending') {
                let isExpired = false;
                if (trx.expires_at) isExpired = new Date() > new Date(trx.expires_at);
                else if (trx.created_at) isExpired = (new Date().getTime() - new Date(trx.created_at).getTime()) > (15 * 60 * 1000);

                statusBadge = isExpired
                    ? '<span class="badge-status" style="background:rgba(234, 179, 8, 0.1); color:#eab308;">Pending (Kadaluarsa)</span>'
                    : '<span class="badge-status" style="background:rgba(234, 179, 8, 0.1); color:#eab308;">Menunggu</span>';

                actionBtns = `
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-sm" style="background: var(--accent); color: white; padding: 4px 12px; font-size: 11px; font-weight: 600; border-radius: 20px;" onclick="resumePaymentFromHistory('${trx.order_id}', ${trx.amount}, '${planType}', '${trx.expires_at || ''}')">Bayar</button>
                        <button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 4px 12px; font-size: 11px; font-weight: 600; border-radius: 20px;" onclick="cancelPaymentFromHistory('${trx.order_id}')">Batal</button>
                    </div>
                `;
            } else if (trx.status === 'failed') {
                statusBadge = '<span class="badge-status banned">Gagal</span>';
                actionBtns = '<span style="font-size:11px; color:var(--danger);">Gagal</span>';
            } else {
                statusBadge = '<span class="badge-status banned">Unknown</span>';
                actionBtns = '-';
            }
            
            return `
            <tr>
                <td>${productName}</td>
                <td><code style="font-size: 11px;">${trx.order_id || '-'}</code></td>
                <td><span class="badge-tier ${planType === 'vip' ? 'vip' : 'free'}">${displayPlan}</span></td>
                <td>${formatRupiah(trx.amount || 0)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">${actionBtns}</td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Error loading transactions:", e);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Gagal memuat riwayat.</td></tr>`;
    }
}

function resumePaymentFromHistory(orderId, amount, type, expiresAtStr) {
    let isExpired = false;
    if (expiresAtStr) isExpired = new Date() > new Date(expiresAtStr);

    if (isExpired) {
        if (!confirm('QRIS sudah melewati batas waktu. Tetap lanjutkan?')) {
            return;
        }
    }
    initiateQrisPayment(amount, type, orderId, expiresAtStr);
}
  
async function cancelPaymentFromHistory(orderId) {
    if (!confirm('Apakah Anda yakin ingin membatalkan transaksi ini? Transaksi yang dibatalkan tidak dapat dilanjutkan lagi.')) return;
    
    try {
        const { error } = await supabaseClient.from('transactions').update({ status: 'failed' }).eq('order_id', orderId);
        if (error) throw error;
        
        toast('Transaksi berhasil dibatalkan.', 'success');
        loadTransactionHistory();
    } catch (err) {
        toast('Gagal membatalkan transaksi: ' + err.message, 'error');
    }
}