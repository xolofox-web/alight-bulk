function renderProfile() {
  if (!state.user) return;
  $('profile-username').value = state.user.username;
  $('profile-email').value = state.user.email || '';
  $('profile-referral-code').value = state.user.referral_code || '-';
  $('profile-bonus-kuota').textContent = state.user.bonus_kuota || 0;
  $('profile-password').value = '';
  $('profile-password-confirm').value = '';
  
  const avatarDivs = [$('user-avatar'), $('profile-preview')];
  if (state.user.avatar) {
    avatarDivs.forEach(div => { div.style.backgroundImage = `url(${state.user.avatar})`; div.textContent = ''; });
    state.tempAvatar = state.user.avatar;
  } else {
    const initial = state.user.username[0].toUpperCase();
    avatarDivs.forEach(div => { div.style.backgroundImage = 'none'; div.textContent = initial; });
    state.tempAvatar = null;
  }
}

function copyReferral() {
  const copyText = document.getElementById("profile-referral-code");
  copyText.select();
  copyText.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(copyText.value);
  toast('Kode Referral berhasil dicopy!', 'success');
}

$('avatar-upload').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) return toast('Ukuran gambar maksimal 2MB', 'error');
    const reader = new FileReader();
    reader.onload = function(evt) {
      state.tempAvatar = evt.target.result;
      const preview = $('profile-preview');
      preview.style.backgroundImage = `url(${state.tempAvatar})`;
      preview.textContent = '';
    };
    reader.readAsDataURL(file);
  }
});

$('profile-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('profile-email').value.trim();
  const newPassword = $('profile-password').value;
  const confirmPassword = $('profile-password-confirm').value;

  if (newPassword || confirmPassword) {
    if (newPassword !== confirmPassword) return toast('Konfirmasi password tidak cocok!', 'error');
    if (newPassword.length < 4) return toast('Password minimal 4 karakter', 'error');
  }

  const updates = { email };
  if (state.tempAvatar) updates.avatar = state.tempAvatar;
  
  if (newPassword) {
    const salt = bcrypt.genSaltSync(10);
    updates.password = bcrypt.hashSync(newPassword, salt);
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Menyimpan...';

  try {
    const { error } = await withTimeout(supabaseClient.from('users').update(updates).eq('username', state.user.username));
    if (error) throw error;

    state.user.email = email;
    if (state.tempAvatar) state.user.avatar = state.tempAvatar;
    renderProfile();
    toast('Profil berhasil diperbarui!', 'success');
  } catch (err) {
    toast('Gagal memperbarui profil: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan';
  }
});