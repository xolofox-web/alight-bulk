// ================= FUNGSI STATUS API (TAMBAHAN) =================
async function renderAdminApiStatus() {
    const tbody = document.getElementById('admin-api-status-tbody');
    const keyInput = document.getElementById('api-key-input-status');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);"><span class="spin-inline"></span> Mengecek server API...</td></tr>';
    
    try {
        const { data } = await supabaseClient.from('settings').select('value').eq('key', 'api_key').single();
        const keys = data?.value ? data.value.split(',').map(k=>k.trim()).filter(Boolean) : [];
        if(keyInput) keyInput.value = keys.join(', ');

        if(!keys.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">API Key belum diatur.</td></tr>';
            return;
        }

        let html = '';
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const maskedKey = key.substring(0, 8) + '...' + key.slice(-4);
            
            const endpointsToTry = [
                `https://apikayz.clutch.web.id/tools/am-test?apikey=${key}`,
                `https://apikayz.clutch.web.id/api/check-key?apikey=${key}`,
                `https://apikayz.clutch.web.id/api/status?apikey=${key}`,
                `https://apikayz.clutch.web.id/tools/am-verify?apikey=${key}&email=test@test.com&link=test`
            ];

            let isSuccess = false;
            let latency = 0;
            let statusText = '';
            let statusClass = '';

            for (const url of endpointsToTry) {
                const startTime = performance.now();
                try {
                    const res = await fetch(url, { method: 'GET' });
                    const endTime = performance.now();
                    latency = Math.round(endTime - startTime);

                    if (res.ok) {
                        isSuccess = true;
                        statusText = 'RUNNING';
                        statusClass = 'active';
                        break;
                    } 
                    else if (res.status === 401 || res.status === 403) {
                        isSuccess = false;
                        statusText = 'INVALID KEY';
                        statusClass = 'banned';
                        break; 
                    }
                } catch (e) {}
            }

            if (!statusText) {
                statusText = 'DOWN / NOT FOUND';
                statusClass = 'banned';
            }

            html += `<tr>
                <td>${i+1}</td>
                <td><code>${maskedKey}</code></td>
                <td><span class="badge-status ${statusClass}">${statusText}</span></td>
                <td>${isSuccess ? `<span style="color:var(--success);">${latency} ms</span>` : '-'}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteApiKey('${key}')">Hapus</button></td>
            </tr>`;
        }
        tbody.innerHTML = html;
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
    }
}

async function deleteApiKey(keyToDelete) {
    if (!confirm('Hapus API Key ini?')) return;
    try {
        const { data } = await supabaseClient.from('settings').select('value').eq('key', 'api_key').single();
        if (!data || !data.value) return;
        let keys = data.value.split(',').map(k=>k.trim()).filter(Boolean);
        keys = keys.filter(k => k !== keyToDelete);
        const newVal = keys.join(',');
        await supabaseClient.from('settings').upsert({ key: 'api_key', value: newVal });
        toast('API Key dihapus', 'success');
        renderAdminApiStatus();
        
        if (document.getElementById('api-key-input')) document.getElementById('api-key-input').value = newVal;
        API_KEYS = keys;
    } catch(e) { toast('Gagal: ' + e.message, 'error'); }
}

const saveApiKeyBtnStatus = document.getElementById('save-api-key-btn-status');
if (saveApiKeyBtnStatus) {
  saveApiKeyBtnStatus.addEventListener('click', async () => {
    const val = document.getElementById('api-key-input-status').value.trim();
    const btn = document.getElementById('save-api-key-btn-status');
    btn.disabled = true;
    try {
      const { error } = await supabaseClient.from('settings').upsert({ key: 'api_key', value: val });
      if (error) throw error;
      API_KEYS = val.split(',').map(k => k.trim()).filter(Boolean);
      if (API_KEYS.length === 0) API_KEYS = ['kayz-r6azlrf2ql6864c6x6uf'];
      toast('API Key berhasil diperbarui', 'success');
      renderAdminApiStatus();
      if (document.getElementById('api-key-input')) document.getElementById('api-key-input').value = val;
    } catch(e) { toast('Gagal: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });
}
// ================================================================

async function renderAdminVouchers() {
  try {
    const { data: vouchers, error } = await supabaseClient.from('vouchers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    $('admin-vouchers-tbody').innerHTML = vouchers && vouchers.length ? vouchers.map(v => `
      <tr>
        <td style="text-align: center;"><input type="checkbox" class="voucher-cb" value="${escapeHtml(v.code)}" onchange="updateVoucherBulkActionVisibility()" style="cursor: pointer;"></td>
        <td><strong>${escapeHtml(v.code)}</strong></td>
        <td>${v.reward_type === 'vip' ? 'Upgrade VIP' : v.reward_amount + ' Kuota'}</td>
        <td>${v.current_uses}</td>
        <td>${v.max_uses}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteVoucher('${escapeHtml(v.code)}')">Hapus</button></td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;">Belum ada voucher.</td></tr>';

    if(document.getElementById('select-all-vouchers')) document.getElementById('select-all-vouchers').checked = false;
    updateVoucherBulkActionVisibility();

  } catch (e) {
    $('admin-vouchers-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">Gagal memuat data.</td></tr>';
  }
}

// === FITUR BULK DELETE VOUCHER ===
function toggleSelectAllVouchers(checkbox) {
  const cbs = document.querySelectorAll('.voucher-cb');
  cbs.forEach(cb => cb.checked = checkbox.checked);
  updateVoucherBulkActionVisibility();
}

function updateVoucherBulkActionVisibility() {
  const cbs = document.querySelectorAll('.voucher-cb:checked');
  const count = cbs.length;
  const container = document.getElementById('voucher-bulk-actions');
  
  if(container) {
      container.style.display = count > 0 ? 'flex' : 'none';
      document.getElementById('selected-voucher-count').textContent = count;
  }
}

async function executeBulkDeleteVouchers() {
  const cbs = document.querySelectorAll('.voucher-cb:checked');
  const codes = Array.from(cbs).map(cb => cb.value);
  
  if (codes.length === 0) return;
  if (!confirm(`Yakin ingin menghapus ${codes.length} voucher terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const { error } = await supabaseClient.from('vouchers').delete().in('code', codes);
    if (error) throw error;
    
    toast(`Berhasil menghapus ${codes.length} voucher`, 'success');
    logAdminAction(`Bulk Delete: Menghapus ${codes.length} voucher sekaligus`);
    notifyTelegram(`*Bulk Delete Voucher!*\nAdmin baru saja menghapus ${codes.length} voucher sekaligus dari sistem.`);
    
    renderAdminVouchers();
  } catch (err) {
    toast('Gagal menghapus voucher: ' + err.message, 'error');
  }
}
// ==================================

async function createVoucher() {
  const code = $('new-voucher-code').value.trim().toUpperCase();
  const type = $('new-voucher-type').value;
  const amount = parseInt($('new-voucher-amount').value) || 0;
  const max = parseInt($('new-voucher-max').value) || 100;
  
  if (!code) return toast('Kode voucher tidak boleh kosong', 'error');
  if (type === 'kuota' && amount < 1) return toast('Jumlah kuota minimal 1', 'error');
  
  const btn = event.target;
  btn.disabled = true;

  try {
    const { error } = await supabaseClient.from('vouchers').insert([{ 
      code, 
      reward_type: type, 
      reward_amount: type === 'kuota' ? amount : 0, 
      max_uses: max 
    }]);
    if (error) throw error;
    toast('Voucher berhasil dibuat', 'success');
    $('new-voucher-code').value = '';
    renderAdminVouchers();
    logAdminAction(`Membuat voucher baru: ${code}`);
    notifyTelegram(`*Voucher Baru!*\nAdmin telah membuat voucher: \`${code}\`\nTipe: ${type}\nMax Pakai: ${max}`);
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteVoucher(code) {
  if (!confirm(`Hapus voucher ${code}?`)) return;
  try {
    await supabaseClient.from('vouchers').delete().eq('code', code);
    toast('Voucher dihapus', 'success');
    renderAdminVouchers();
    logAdminAction(`Menghapus voucher: ${code}`);
  } catch (e) {
    toast('Gagal menghapus', 'error');
  }
}

// ============ TAMBAHAN: FUNGSI BULK VOUCHER GENERATOR ============
function openBulkVoucherModal() {
    document.getElementById('bulk-voucher-modal').style.display = 'flex';
}

async function generateBulkVouchers() {
    const qty = parseInt(document.getElementById('bulk-qty').value) || 10;
    const prefix = document.getElementById('bulk-prefix').value.trim().toUpperCase();
    const type = document.getElementById('bulk-type').value;
    const amount = parseInt(document.getElementById('bulk-amount').value) || 50;
    const btn = document.getElementById('btn-generate-bulk');
    
    if(qty > 100) return toast('Maksimal 100 voucher sekali generate', 'error');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-inline"></span> Memproses...';
    
    let generatedCodes = [];
    let insertData = [];
    
    for (let i = 0; i < qty; i++) {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = prefix ? `${prefix}${randomStr}` : randomStr;
        generatedCodes.push(code);
        insertData.push({
            code: code,
            reward_type: type,
            reward_amount: type === 'kuota' ? amount : 0,
            max_uses: 1
        });
    }
    
    try {
        const { error } = await supabaseClient.from('vouchers').insert(insertData);
        if (error) throw error;
        
        let csvContent = "Kode Voucher,Tipe,Reward\n";
        generatedCodes.forEach(code => {
            csvContent += `"${code}","${type}","${type === 'kuota' ? amount : 'VIP'}"\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `vouchers_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast(`Berhasil generate ${qty} voucher!`, 'success');
        document.getElementById('bulk-voucher-modal').style.display = 'none';
        renderAdminVouchers();
    } catch (err) {
        toast('Gagal generate: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate & Unduh';
    }
}
// ===================================================================

document.getElementById('bulk-voucher-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        let successCount = 0;
        
        toast('Memproses CSV...', 'info');
        
        for (let i = 1; i < lines.length; i++) {
            const [code, type, amount, maxUses] = lines[i].split(',');
            if (!code) continue;
            
            try {
                const { error } = await supabaseClient.from('vouchers').insert([{ 
                    code: code.trim().toUpperCase(), 
                    reward_type: type?.trim().toLowerCase() || 'kuota', 
                    reward_amount: parseInt(amount) || 50, 
                    max_uses: parseInt(maxUses) || 100 
                }]);
                if (!error) successCount++;
            } catch(err) {}
        }
        toast(`Berhasil import ${successCount} voucher!`, 'success');
        renderAdminVouchers();
        e.target.value = '';
    };
    reader.readAsText(file);
});