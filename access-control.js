// Global Generator — Client-side Access, Licensing & Admin Control System
// Handles Authentication, Manual Easypaisa Payments, User Dashboard, Subscriptions & Admin Approvals

if (typeof window !== 'undefined') {
    if (typeof window.API_BASE === 'undefined') {
        const savedBase = localStorage.getItem('gta_api_server_url');
        if (savedBase) {
            window.API_BASE = savedBase.replace(/\/+$/, '');
        } else if (window.location.protocol === 'file:' || window.location.origin === 'null') {
            window.API_BASE = 'http://localhost:3000';
        } else {
            // Running on Vercel or any online web server: use current domain origin
            window.API_BASE = '';
        }
    }
}
var API_BASE = (typeof window !== 'undefined' ? window.API_BASE : '');

function apiFetch(endpoint, options = {}) {
    let base = (typeof window !== 'undefined' && window.API_BASE !== undefined) ? window.API_BASE : (API_BASE || '');
    if (endpoint.startsWith('http')) {
        return fetch(endpoint, options);
    }
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
        cleanEndpoint = cleanEndpoint.replace(/^\/api/, '');
    }
    const url = base + cleanEndpoint;
    return fetch(url, options);
}

var authToken = (typeof localStorage !== 'undefined' ? localStorage.getItem('gta_auth_token') : null) || null;
var currentUser = null;
var availablePlans = [];
var easypaisaConfig = {
    accountName: 'سفیان حبیب (Sufyan Habib)',
    accountNumber: '03008998381',
    instructions: 'Easypaisa کے ذریعے اپنے منتخب کردہ Plan کی رقم ادا کریں۔',
    supportContact: 'WhatsApp: 03008998381'
};
var currentAdminUsers = [];
var currentAdminPayments = [];
var selectedScreenshotBase64 = null;

function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    const txt = document.getElementById('toastMsg');
    if (!toast || !txt) {
        console.log('[Toast]:', msg);
        return;
    }
    txt.innerText = msg;
    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2500);
}

function configureServerUrl() {
    const current = (typeof window.API_BASE !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location.origin || 'http://localhost:3000');
    const newUrl = prompt("🌐 سرور ایڈریس درج کریں (Server URL):\nاگر سرور اسی ویب سائٹ پر ہے تو خالی چھوڑ دیں، ورنہ ایڈمن کا دیا گیا سرور لنک درج کریں:", current);
    if (newUrl !== null) {
        const clean = newUrl.trim().replace(/\/+$/, '');
        if (clean === '' || clean === window.location.origin) {
            localStorage.removeItem('gta_api_server_url');
            window.API_BASE = (window.location.protocol === 'file:' || window.location.origin === 'null') ? 'http://localhost:3000' : '';
            API_BASE = window.API_BASE;
            showToast("سرور ری سیٹ ہو گیا (Current Website)");
        } else {
            localStorage.setItem('gta_api_server_url', clean);
            window.API_BASE = clean;
            API_BASE = clean;
            showToast("سرور ایڈریس محفوظ ہو گیا: " + clean);
        }
        fetchCurrentUserProfile();
    }
}
if (typeof window !== 'undefined') {
    window.showServerConnectionModal = configureServerUrl;
}

function isUserActiveAndAuthorized(user) {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (user.status === 'ACTIVE') {
        if (!user.subscription || !user.subscription.expiry_date) return true;
        return new Date() < new Date(user.subscription.expiry_date);
    }
    return false;
}

function enforceGatekeeperLock() {
    const isAuth = isUserActiveAndAuthorized(currentUser);
    const mainEl = document.querySelector('main');
    const authModal = document.getElementById('authModal');
    const closeBtn = document.getElementById('authModalCloseBtn');

    if (!isAuth) {
        // Lock main tool completely
        if (mainEl) {
            mainEl.style.filter = 'blur(10px)';
            mainEl.style.pointerEvents = 'none';
            mainEl.style.userSelect = 'none';
        }
        if (closeBtn) closeBtn.style.display = 'none';
        if (authModal) authModal.classList.remove('hidden');
        updateGatekeeperNotice();
    } else {
        // Unlock main tool completely
        if (mainEl) {
            mainEl.style.filter = 'none';
            mainEl.style.pointerEvents = 'auto';
            mainEl.style.userSelect = 'auto';
        }
        if (closeBtn) closeBtn.style.display = 'block';
        if (authModal) authModal.classList.add('hidden');
        const notice = document.getElementById('gatekeeperNoticeBox');
        if (notice) notice.classList.add('hidden');
    }
}

function updateGatekeeperNotice() {
    let noticeBox = document.getElementById('gatekeeperNoticeBox');
    if (!noticeBox) {
        const modalInner = document.querySelector('#authModal .glass-panel');
        if (modalInner) {
            noticeBox = document.createElement('div');
            noticeBox.id = 'gatekeeperNoticeBox';
            const tabSwitcher = document.querySelector('#authModal .flex.border-b');
            if (tabSwitcher) {
                modalInner.insertBefore(noticeBox, tabSwitcher);
            }
        }
    }
    if (!noticeBox) return;

    if (!currentUser) {
        noticeBox.className = "p-3 rounded-xl bg-purple-950/80 border border-purple-500/50 text-xs text-purple-200 text-center font-bold mb-3 shadow-inner";
        noticeBox.innerHTML = `🔒 <b>لائسنس اور سبسکرپشن ایکٹیویشن درکار ہے!</b><br><span class="text-[11px] text-gray-300 font-normal">ٹول اوپن کرنے کے لیے لاگ اِن کریں یا نیا اکاؤنٹ بنا کر ری چارج کریں۔</span>`;
    } else if (currentUser.status === 'PENDING') {
        noticeBox.className = "p-3 rounded-xl bg-amber-950/90 border border-amber-500/50 text-xs text-amber-200 text-center font-bold mb-3 shadow-inner";
        noticeBox.innerHTML = `⏳ <b>اکاؤنٹ تصدیق کے مراحل میں ہے (Pending Verification)</b><br><span class="text-[11px] text-amber-300 font-normal">آپ کی ادائیگی کی تصدیق ہوتے ہی سفیان حبیب (ایڈمن) کی طرف سے ٹول فوراً انلاک کر دیا جائے گا۔</span><div class="mt-2.5 flex flex-wrap items-center justify-center gap-2"><button type="button" onclick="openPaymentModal('${currentUser.subscription?.plan || 'Monthly'}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">💰 ادائیگی کی رسید جمع کرائیں</button><button type="button" onclick="fetchCurrentUserProfile()" class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition">🔄 اسٹیٹس چیک کریں</button><button type="button" onclick="handleLogout()" class="px-2.5 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition">لاگ آؤٹ</button></div>`;
    } else if (currentUser.status === 'EXPIRED') {
        noticeBox.className = "p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 text-center font-bold mb-3 shadow-inner";
        noticeBox.innerHTML = `⚠️ <b>آپ کا ری چارج ختم ہو چکا ہے (Expired)</b><br><span class="text-[11px] text-gray-300 font-normal">ٹول دوبارہ فعال کرنے کے لیے نیا ری چارج منتخب کریں۔</span><div class="mt-2.5 flex items-center justify-center gap-2"><button type="button" onclick="openPricingModal()" class="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition">ری چارج پلانز دیکھیں</button><button type="button" onclick="handleLogout()" class="px-2.5 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition">لاگ آؤٹ</button></div>`;
    } else if (currentUser.status === 'BLOCKED' || currentUser.status === 'REJECTED') {
        noticeBox.className = "p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 text-center font-bold mb-3 shadow-inner";
        noticeBox.innerHTML = `🚫 <b>رسائی بند ہے (${currentUser.status})</b><br><span class="text-[11px] text-gray-300 font-normal">آپ کا اکاؤنٹ ایڈمن نے بلاک یا مسترد کر دیا ہے۔ برائے رابطہ: 03008998381</span><div class="mt-2.5"><button type="button" onclick="handleLogout()" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition">لاگ آؤٹ</button></div>`;
    } else {
        noticeBox.innerHTML = '';
        noticeBox.className = "hidden";
    }
}

async function fetchCurrentUserProfile() {
    if (!authToken) {
        currentUser = null;
        updateUserUI(null);
        enforceGatekeeperLock();
        return null;
    }

    try {
        const res = await apiFetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = {
                ...data.user,
                subscription: data.subscription
            };
            updateUserUI(currentUser);
            enforceGatekeeperLock();
            return currentUser;
        } else {
            // Invalid or expired token
            localStorage.removeItem('gta_auth_token');
            authToken = null;
            currentUser = null;
            updateUserUI(null);
            enforceGatekeeperLock();
            return null;
        }
    } catch (err) {
        console.warn('[Profile fetch notice]:', err.message);
        updateUserUI(currentUser);
        enforceGatekeeperLock();
        return null;
    }
}

function updateUserUI(user) {
    const loggedOut = document.getElementById('loggedOutControls');
    const loggedIn = document.getElementById('loggedInControls');
    const navName = document.getElementById('navUserName');
    const navBadge = document.getElementById('navUserBadge');
    const adminBtn = document.getElementById('adminNavBtn');
    const subBannerText = document.getElementById('subBannerText');
    const subBannerBtn = document.getElementById('subBannerBtn');
    const subBannerIcon = document.getElementById('subBannerIcon');

    if (!user) {
        if (loggedOut) loggedOut.classList.remove('hidden');
        if (loggedIn) loggedIn.classList.add('hidden');
        if (adminBtn) adminBtn.classList.add('hidden');

        if (subBannerText) {
            subBannerText.innerHTML = `رسائی کی حالت: <b class="text-white">براہ کرم لاگ ان کریں</b>`;
        }
        if (subBannerIcon) subBannerIcon.innerText = '🔒';
        if (subBannerBtn) {
            subBannerBtn.innerText = 'لاگ ان';
            subBannerBtn.onclick = () => openAuthModal('login');
        }
        return;
    }

    if (loggedOut) loggedOut.classList.add('hidden');
    if (loggedIn) loggedIn.classList.remove('hidden');
    if (navName) navName.innerText = user.name.split(' (')[0] || user.name;

    // Show Admin Button if role is ADMIN
    if (adminBtn) {
        if (user.role === 'ADMIN') {
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
        }
    }

    // Status Badge Styling
    const status = user.status || 'PENDING';
    const sub = user.subscription;
    const daysLeft = sub ? sub.daysRemaining : 0;

    let badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    let statusLabel = status;

    if (user.role === 'ADMIN') {
        badgeClass = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
        statusLabel = '👑 ADMIN (ACTIVE)';
    } else if (status === 'ACTIVE') {
        badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        statusLabel = `ACTIVE (${daysLeft}d)`;
    } else if (status === 'BLOCKED') {
        badgeClass = 'bg-red-500/20 text-red-300 border-red-500/30';
        statusLabel = 'BLOCKED';
    } else if (status === 'EXPIRED') {
        badgeClass = 'bg-red-500/20 text-red-400 border-red-500/30';
        statusLabel = 'EXPIRED';
    } else if (status === 'PENDING') {
        badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        statusLabel = 'PENDING VERIFICATION';
    } else if (status === 'REJECTED') {
        badgeClass = 'bg-red-500/20 text-red-300 border-red-500/30';
        statusLabel = 'REJECTED';
    }

    if (navBadge) {
        navBadge.className = `text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${badgeClass}`;
        navBadge.innerText = statusLabel;
    }

    // Update bottom generator status strip
    if (subBannerText && subBannerBtn) {
        if (user.role === 'ADMIN') {
            subBannerText.innerHTML = `ایڈمن رسائی: <b class="text-yellow-400">مکمل کنٹرول و لامحدود رسائی</b>`;
            if (subBannerIcon) subBannerIcon.innerText = '👑';
            subBannerBtn.innerText = 'ایڈمن پینل';
            subBannerBtn.onclick = () => openAdminModal();
        } else if (status === 'ACTIVE') {
            subBannerText.innerHTML = `سبسکرپشن: <b class="text-emerald-400">${sub?.plan || 'Active'}</b> — باقی دن: <b class="text-white">${daysLeft} Days</b>`;
            if (subBannerIcon) subBannerIcon.innerText = '⚡';
            subBannerBtn.innerText = 'میرا اکاؤنٹ';
            subBannerBtn.onclick = () => openUserDashboardModal();
        } else if (status === 'PENDING') {
            subBannerText.innerHTML = `<span class="text-amber-300">آپ کی payment verification کے لیے pending ہے۔</span>`;
            if (subBannerIcon) subBannerIcon.innerText = '⏳';
            subBannerBtn.innerText = 'تفصیلات دیکھیں';
            subBannerBtn.onclick = () => openUserDashboardModal();
        } else if (status === 'EXPIRED') {
            subBannerText.innerHTML = `<span class="text-red-400">آپ کا subscription ختم ہو چکا ہے۔</span>`;
            if (subBannerIcon) subBannerIcon.innerText = '❌';
            subBannerBtn.innerText = 'تجدید کریں';
            subBannerBtn.onclick = () => openPricingModal();
        } else if (status === 'BLOCKED') {
            subBannerText.innerHTML = `<span class="text-red-400">آپ کا access administrator نے بند کر دیا ہے۔</span>`;
            if (subBannerIcon) subBannerIcon.innerText = '🚫';
            subBannerBtn.innerText = 'اکاؤنٹ اسٹیٹس';
            subBannerBtn.onclick = () => openUserDashboardModal();
        } else if (status === 'REJECTED') {
            subBannerText.innerHTML = `<span class="text-red-400">آپ کی ادائیگی مسترد کر دی گئی ہے۔</span>`;
            if (subBannerIcon) subBannerIcon.innerText = '⚠️';
            subBannerBtn.innerText = 'دوبارہ ادائیگی';
            subBannerBtn.onclick = () => openPricingModal();
        }
    }
}

function handleAccessButtonClick() {
    if (!currentUser) {
        openAuthModal('login');
    } else {
        openUserDashboardModal();
    }
}

// ============================================================
// 2. AUTH MODAL (Login / Register / Reset)
// ============================================================

function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    switchAuthTab(tab);
    if (typeof updateGatekeeperNotice === 'function') updateGatekeeperNotice();
}

function closeAuthModal() {
    if (!isUserActiveAndAuthorized(currentUser)) {
        showToast("🔒 ٹول تک رسائی کے لیے فعال ری چارج و ایکٹیویشن لازمی ہے!");
        return;
    }
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('hidden');
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');
    const resetForm = document.getElementById('authResetForm');
    const loginTabBtn = document.getElementById('authTabLoginBtn');
    const signupTabBtn = document.getElementById('authTabSignupBtn');
    const resetTabBtn = document.getElementById('authTabResetBtn');
    const authError = document.getElementById('authErrorMsg');

    if (authError) authError.classList.add('hidden');

    if (tab === 'signup') {
        if (loginForm) loginForm.classList.add('hidden');
        if (resetForm) resetForm.classList.add('hidden');
        if (signupForm) signupForm.classList.remove('hidden');
        if (loginTabBtn) loginTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
        if (signupTabBtn) signupTabBtn.className = "py-2 px-4 text-xs font-bold text-pink-400 border-b-2 border-pink-500 transition cursor-pointer";
        if (resetTabBtn) resetTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
    } else if (tab === 'reset') {
        if (loginForm) loginForm.classList.add('hidden');
        if (signupForm) signupForm.classList.add('hidden');
        if (resetForm) resetForm.classList.remove('hidden');
        if (loginTabBtn) loginTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
        if (signupTabBtn) signupTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
        if (resetTabBtn) resetTabBtn.className = "py-2 px-4 text-xs font-bold text-cyan-400 border-b-2 border-cyan-500 transition cursor-pointer";
    } else {
        // default: login
        if (signupForm) signupForm.classList.add('hidden');
        if (resetForm) resetForm.classList.add('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
        if (loginTabBtn) loginTabBtn.className = "py-2 px-4 text-xs font-bold text-pink-400 border-b-2 border-pink-500 transition cursor-pointer";
        if (signupTabBtn) signupTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
        if (resetTabBtn) resetTabBtn.className = "py-2 px-4 text-xs font-bold text-gray-400 hover:text-white border-b-2 border-transparent transition cursor-pointer";
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginSubmitBtn');
    const authError = document.getElementById('authErrorMsg');

    if (!email || !password) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin">⏳</span> لاگ ان ہو رہا ہے...`;
    if (authError) authError.classList.add('hidden');

    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'لاگ ان ناکام ہو گیا');
        }

        authToken = data.token;
        localStorage.setItem('gta_auth_token', authToken);
        currentUser = {
            ...data.user,
            subscription: data.subscription
        };

        updateUserUI(currentUser);
        enforceGatekeeperLock();

        if (isUserActiveAndAuthorized(currentUser)) {
            closeAuthModal();
            showToast(`خوش آمدید، ${currentUser.name}!`);
        } else {
            showToast(`لاگ ان کامیاب، لیکن آپ کا اکاؤنٹ فعال نہیں ہے!`);
        }
    } catch (err) {
        if (authError) {
            authError.innerText = err.message;
            authError.classList.remove('hidden');
        }
    } finally {
        btn.disabled = false;
        btn.innerText = 'لاگ ان کریں (LOGIN)';
    }
}

async function handleSignupSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const plan = document.getElementById('signupPlanSelect').value;
    const btn = document.getElementById('signupSubmitBtn');
    const authError = document.getElementById('authErrorMsg');

    if (!name || !email || !password) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin">⏳</span> اکاؤنٹ بن رہا ہے...`;
    if (authError) authError.classList.add('hidden');

    try {
        const res = await apiFetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, plan })
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'رجسٹریشن ناکام ہو گئی');
        }

        authToken = data.token;
        localStorage.setItem('gta_auth_token', authToken);
        currentUser = {
            ...data.user,
            subscription: data.subscription
        };

        updateUserUI(currentUser);
        enforceGatekeeperLock();
        showToast("اکاؤنٹ بن گیا! براہ کرم اپنی ادائیگی جمع کرائیں۔");

        // Immediately open Payment modal for the chosen plan
        openPaymentModal(plan);
    } catch (err) {
        if (authError) {
            authError.innerText = err.message;
            authError.classList.remove('hidden');
        }
    } finally {
        btn.disabled = false;
        btn.innerText = 'نیا اکاؤنٹ بنائیں (CREATE ACCOUNT)';
    }
}

async function handleLogout() {
    if (authToken) {
        try {
            await apiFetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        } catch (_) {}
    }

    localStorage.removeItem('gta_auth_token');
    authToken = null;
    currentUser = null;
    updateUserUI(null);
    enforceGatekeeperLock();
    showToast("آپ کامیابی سے لاگ آؤٹ ہو چکے ہیں");
}

// ============================================================
// 3. USER DASHBOARD MODAL & PAYMENT HISTORY
// ============================================================

async function openUserDashboardModal() {
    if (!currentUser) {
        openAuthModal('login');
        return;
    }

    const modal = document.getElementById('userDashboardModal');
    if (!modal) return;

    const sub = currentUser.subscription;
    const status = currentUser.status || 'PENDING';
    const planName = sub?.plan || 'Monthly';
    const priceText = `PKR ${Number(sub?.price || 3000).toLocaleString()}`;
    const startDateText = sub?.start_date ? new Date(sub.start_date).toLocaleDateString() : '-';
    const expiryDateText = sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '-';
    const daysLeft = sub?.daysRemaining || 0;

    document.getElementById('dashUserName').innerText = currentUser.name;
    document.getElementById('dashUserEmail').innerText = currentUser.email;
    document.getElementById('dashPlanName').innerText = planName;
    document.getElementById('dashPlanPrice').innerText = priceText;
    document.getElementById('dashStartDate').innerText = startDateText;
    document.getElementById('dashExpiryDate').innerText = expiryDateText;
    document.getElementById('dashDaysRemaining').innerText = `${daysLeft} Days`;

    // Status Banner Elements
    const activeNotice = document.getElementById('dashActiveNotice');
    const pendingNotice = document.getElementById('dashPendingNotice');
    const expiredNotice = document.getElementById('dashExpiredNotice');
    const blockedNotice = document.getElementById('dashBlockedNotice');
    const rejectedNotice = document.getElementById('dashRejectedNotice');
    const openGenBtn = document.getElementById('dashOpenGenBtn');

    if (activeNotice) activeNotice.classList.add('hidden');
    if (pendingNotice) pendingNotice.classList.add('hidden');
    if (expiredNotice) expiredNotice.classList.add('hidden');
    if (blockedNotice) blockedNotice.classList.add('hidden');
    if (rejectedNotice) rejectedNotice.classList.add('hidden');

    if (currentUser.role === 'ADMIN' || status === 'ACTIVE') {
        if (activeNotice) activeNotice.classList.remove('hidden');
        if (openGenBtn) {
            openGenBtn.disabled = false;
            openGenBtn.className = "w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold text-sm tracking-wider uppercase transition shadow-xl shadow-emerald-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2";
        }
    } else if (status === 'PENDING') {
        if (pendingNotice) pendingNotice.classList.remove('hidden');
        if (openGenBtn) {
            openGenBtn.disabled = true;
            openGenBtn.className = "w-full py-3.5 px-6 rounded-xl bg-gray-800 text-gray-500 font-bold text-sm tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-2";
        }
    } else if (status === 'EXPIRED') {
        if (expiredNotice) expiredNotice.classList.remove('hidden');
        if (openGenBtn) {
            openGenBtn.disabled = true;
            openGenBtn.className = "w-full py-3.5 px-6 rounded-xl bg-gray-800 text-gray-500 font-bold text-sm tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-2";
        }
    } else if (status === 'BLOCKED') {
        if (blockedNotice) blockedNotice.classList.remove('hidden');
        if (openGenBtn) {
            openGenBtn.disabled = true;
            openGenBtn.className = "w-full py-3.5 px-6 rounded-xl bg-gray-800 text-gray-500 font-bold text-sm tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-2";
        }
    } else if (status === 'REJECTED') {
        if (rejectedNotice) rejectedNotice.classList.remove('hidden');
        if (openGenBtn) {
            openGenBtn.disabled = true;
            openGenBtn.className = "w-full py-3.5 px-6 rounded-xl bg-gray-800 text-gray-500 font-bold text-sm tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-2";
        }
    }

    modal.classList.remove('hidden');

    // Load User Payment History
    await loadUserPaymentHistory();
}

function closeUserDashboardModal() {
    const modal = document.getElementById('userDashboardModal');
    if (modal) modal.classList.add('hidden');
    if (!isUserActiveAndAuthorized(currentUser)) {
        enforceGatekeeperLock();
    }
}

async function loadUserPaymentHistory() {
    const tbody = document.getElementById('dashPaymentHistoryBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-xs text-gray-400">لوڈ ہو رہا ہے...</td></tr>`;

    try {
        const res = await apiFetch('/api/user/payments', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load payments');
        const data = await res.json();
        const payments = data.payments || [];

        if (payments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-xs text-gray-500">کوئی ادائیگی ریکارڈ نہیں ہوئی</td></tr>`;
            return;
        }

        let html = '';
        payments.forEach(p => {
            let badge = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
            let label = p.payment_status;
            if (p.payment_status === 'PAID') {
                badge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                label = 'Approved / Active';
            } else if (p.payment_status === 'REJECTED') {
                badge = 'bg-red-500/20 text-red-300 border-red-500/30';
                label = 'Rejected';
            } else if (p.payment_status === 'PENDING') {
                badge = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                label = 'Pending Verification';
            }

            html += `
            <tr class="border-b border-white/5 hover:bg-white/5 text-[11px]">
                <td class="p-2.5 font-bold text-white">${p.plan}</td>
                <td class="p-2.5 text-cyan-300 font-mono">PKR ${Number(p.amount).toLocaleString()}</td>
                <td class="p-2.5 font-mono text-yellow-300">${p.transaction_reference || '-'}</td>
                <td class="p-2.5 text-gray-400 font-mono">${p.payment_date || new Date(p.created_at).toLocaleDateString()}</td>
                <td class="p-2.5">
                    <span class="px-2 py-0.5 rounded font-mono font-bold border ${badge}">${label}</span>
                </td>
            </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-xs text-red-400">${err.message}</td></tr>`;
    }
}

async function checkPaymentStatus() {
    showToast("🔄 اسٹیٹس چیک کیا جا رہا ہے...");
    const user = await fetchCurrentUserProfile();
    await loadUserPaymentHistory();

    if (user) {
        if (user.status === 'ACTIVE') {
            showToast("✓ مبارک ہو! آپ کا اکاؤنٹ ایکٹیو ہے اور ٹول دستیاب ہے۔");
        } else if (user.status === 'PENDING') {
            showToast("⏳ آپ کی payment verification کے لیے pending ہے۔");
        } else if (user.status === 'EXPIRED') {
            showToast("❌ آپ کی subscription ختم ہو چکی ہے۔ نیا پلان خریدیں۔");
        } else if (user.status === 'REJECTED') {
            showToast("⚠️ آپ کی ادائیگی مسترد کر دی گئی ہے۔ ایڈمن سے رابطہ کریں۔");
        }
    }
}

function openGeneratorFromDashboard() {
    if (currentUser && (currentUser.role === 'ADMIN' || currentUser.status === 'ACTIVE')) {
        closeUserDashboardModal();
        const mainInput = document.getElementById('topicInput');
        if (mainInput) mainInput.focus();
        showToast("✓ گلوبل جنریٹر کھلا ہے! موضوع درج کریں اور کہانی بنائیں");
    } else {
        showToast("⚠️ فعال رسائی درکار ہے!");
    }
}

// ============================================================
// 4. PRICING & EASYPAISA PAYMENT MODAL
// ============================================================

async function openPricingModal() {
    const modal = document.getElementById('pricingModal');
    if (!modal) return;

    // Render immediately so modal is never blank even if offline/loading
    renderPricingCards();
    modal.classList.remove('hidden');

    try {
        const res = await apiFetch('/api/plans');
        if (res.ok) {
            const data = await res.json();
            availablePlans = data.plans || [];
            if (data.easypaisa) {
                easypaisaConfig = data.easypaisa;
            }
            renderPricingCards();
        }
    } catch (_) {}
}

function closePricingModal() {
    const modal = document.getElementById('pricingModal');
    if (modal) modal.classList.add('hidden');
    if (!isUserActiveAndAuthorized(currentUser)) {
        enforceGatekeeperLock();
    }
}

function renderPricingCards() {
    const container = document.getElementById('pricingCardsContainer');
    if (!container) return;

    if (!availablePlans || availablePlans.length === 0) {
        availablePlans = [
            { id: 'Monthly', name: 'Monthly Plan', price: 3000, durationDays: 30, durationLabel: '30 Days' },
            { id: '6 Months', name: '6 Months Plan', price: 15000, durationDays: 180, durationLabel: '6 Months', popular: true },
            { id: 'Annual', name: 'Annual Plan', price: 25000, durationDays: 365, durationLabel: '1 Year (365 Days)' }
        ];
    }

    let html = '';
    availablePlans.forEach(p => {
        const isPopular = p.popular;
        html += `
        <div class="relative glass-panel rounded-2xl p-6 border ${isPopular ? 'border-pink-500 shadow-2xl shadow-pink-500/20' : 'border-gta-border'} flex flex-col justify-between space-y-5">
            ${isPopular ? `<span class="absolute -top-3 right-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-md">سب سے مقبول</span>` : ''}
            <div>
                <h3 class="text-xl font-extrabold text-white mb-1">${p.name}</h3>
                <p class="text-xs text-gray-400">${p.durationLabel || `${p.durationDays} Days`} Full Access</p>
                <div class="my-4">
                    <span class="text-3xl font-black text-white">PKR ${Number(p.price).toLocaleString()}</span>
                    <span class="text-xs text-gray-400">/ ${p.durationLabel || `${p.durationDays} دن`}</span>
                </div>
                <ul class="space-y-2 text-xs text-gray-300">
                    <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> مکمل 8K سنیماٹک اسکرپٹ جنریٹر</li>
                    <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> ڈائنامک کریکٹر ڈی این اے مستقل لاک</li>
                    <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Zero-Failure AI ویڈیو پرامپٹس (Kling, Runway, Luma)</li>
                    <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Midjourney v6.1 کی فریم پرامپٹس</li>
                    <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> تیز رفتار Groq LPU کلاؤڈ پروسیسنگ</li>
                </ul>
            </div>
            <button onclick="handleSelectPlan('${p.id}')" class="w-full py-3.5 rounded-xl ${isPopular ? 'bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white' : 'bg-white/10 hover:bg-white/20 text-white'} font-black text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-lg flex items-center justify-center gap-1.5">
                <span>💎</span> <span>Buy Plan</span>
            </button>
        </div>
        `;
    });

    container.innerHTML = html;
}

function handleSelectPlan(planId) {
    if (!currentUser) {
        closePricingModal();
        openAuthModal('signup');
        showToast("براہ کرم سبسکرپشن لینے کے لیے پہلے اکاؤنٹ بنائیں!");
        return;
    }

    closePricingModal();
    openPaymentModal(planId);
}

async function openPaymentModal(planId = null) {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;

    if (!currentUser) {
        openAuthModal('login');
        return;
    }

    // Refresh plan/easypaisa settings if needed
    try {
        const res = await apiFetch('/api/plans');
        if (res.ok) {
            const data = await res.json();
            availablePlans = data.plans || [];
            if (data.easypaisa) easypaisaConfig = data.easypaisa;
        }
    } catch (_) {}

    const chosenId = planId || (currentUser.subscription?.plan) || 'Monthly';
    const plan = (availablePlans || []).find(p => p.id === chosenId || p.name === chosenId) || { name: 'Monthly Plan', price: 3000 };

    document.getElementById('paySelectedPlanName').innerText = plan.name;
    document.getElementById('paySelectedPlanPrice').innerText = `PKR ${Number(plan.price).toLocaleString()}`;
    document.getElementById('payHiddenPlan').value = plan.name;
    document.getElementById('payHiddenAmount').value = plan.price;

    // Prefill User Details
    if (document.getElementById('payUserName')) document.getElementById('payUserName').value = currentUser.name;
    if (document.getElementById('payUserEmail')) document.getElementById('payUserEmail').value = currentUser.email;

    // Render Admin Easypaisa Receiving Account
    if (document.getElementById('payEasypaisaAccountName')) {
        document.getElementById('payEasypaisaAccountName').innerText = easypaisaConfig.accountName;
    }
    if (document.getElementById('payEasypaisaAccountNumber')) {
        document.getElementById('payEasypaisaAccountNumber').innerText = easypaisaConfig.accountNumber;
    }
    if (document.getElementById('paySupportContactText')) {
        document.getElementById('paySupportContactText').innerText = easypaisaConfig.supportContact;
    }

    // Set today's date
    const today = new Date().toISOString().substring(0, 10);
    const dateInput = document.getElementById('payPaymentDate');
    if (dateInput) dateInput.value = today;

    // Reset screenshot input
    selectedScreenshotBase64 = null;
    const fileInput = document.getElementById('payScreenshotInput');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('payScreenshotPreview');
    if (preview) preview.classList.add('hidden');

    modal.classList.remove('hidden');
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.classList.add('hidden');
    if (!isUserActiveAndAuthorized(currentUser)) {
        enforceGatekeeperLock();
    }
}

function handleScreenshotFileSelect(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('payScreenshotPreview');
    const previewImg = document.getElementById('payScreenshotPreviewImg');

    if (!file) {
        selectedScreenshotBase64 = null;
        if (preview) preview.classList.add('hidden');
        return;
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
        alert('فائل کا سائز 5MB سے زیادہ نہیں ہونا چاہیے!');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        selectedScreenshotBase64 = evt.target.result;
        if (preview && previewImg) {
            previewImg.src = selectedScreenshotBase64;
            preview.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    const plan = document.getElementById('payHiddenPlan').value;
    const amount = parseInt(document.getElementById('payHiddenAmount').value, 10);
    const transactionReference = document.getElementById('payTrxRef').value.trim();
    const paymentDate = document.getElementById('payPaymentDate')?.value || new Date().toISOString().substring(0, 10);
    const btn = document.getElementById('paySubmitBtn');

    if (!transactionReference) {
        alert('براہ کرم Easypaisa Transaction ID درج کریں!');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin">⏳</span> بھیجا جا رہا ہے...`;

    try {
        const res = await apiFetch('/api/payments/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                plan,
                amount,
                paymentMethod: 'Easypaisa',
                transactionReference,
                paymentDate,
                screenshot: selectedScreenshotBase64
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'ادائیگی جمع کرانے میں خرابی');

        closePaymentModal();
        await fetchCurrentUserProfile();
        openUserDashboardModal();
        showToast("آپ کی payment verification کے لیے بھیج دی گئی ہے۔ Admin verification کے بعد آپ کا account activate کیا جائے گا۔");
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Payment';
    }
}

// ============================================================
// 5. ADMIN CONTROL PANEL
// ============================================================

function openAdminModal() {
    if (!currentUser || currentUser.role !== 'ADMIN') {
        showToast("صرف ایڈمن کو رسائی کی اجازت ہے!");
        return;
    }

    const modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    loadAdminStats();
    setAdminTab('users');
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.classList.add('hidden');
}

function setAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.className = "admin-tab-btn px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer";
    });

    const activeBtn = document.getElementById(`adminTabBtn-${tab}`);
    if (activeBtn) {
        activeBtn.className = "admin-tab-btn px-4 py-2 rounded-xl text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 transition cursor-pointer";
    }

    document.getElementById('adminViewUsers').classList.add('hidden');
    document.getElementById('adminViewPayments').classList.add('hidden');
    document.getElementById('adminViewSettings').classList.add('hidden');
    document.getElementById('adminViewLogs').classList.add('hidden');

    if (tab === 'payments') {
        document.getElementById('adminViewPayments').classList.remove('hidden');
        loadAdminPayments();
    } else if (tab === 'settings') {
        document.getElementById('adminViewSettings').classList.remove('hidden');
        loadAdminSettings();
    } else if (tab === 'logs') {
        document.getElementById('adminViewLogs').classList.remove('hidden');
        loadAdminAuditLogs();
    } else {
        // 'users'
        document.getElementById('adminViewUsers').classList.remove('hidden');
        loadAdminUsers();
    }
}

async function loadAdminStats() {
    try {
        const res = await apiFetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const stats = await res.json();

        document.getElementById('statTotalUsers').innerText = stats.totalUsers || 0;
        document.getElementById('statActiveUsers').innerText = stats.activeUsers || 0;
        document.getElementById('statPendingUsers').innerText = stats.pendingUsers || 0;
        document.getElementById('statExpiredUsers').innerText = stats.expiredUsers || 0;
        document.getElementById('statBlockedUsers').innerText = stats.blockedUsers || 0;
        document.getElementById('statActiveSubs').innerText = stats.totalActiveSubscriptions || 0;
    } catch (_) {}
}

async function loadAdminUsers() {
    const query = document.getElementById('adminUserSearchInput')?.value || '';
    const status = document.getElementById('adminUserStatusFilter')?.value || 'ALL';
    const plan = document.getElementById('adminUserPlanFilter')?.value || 'ALL';
    const tbody = document.getElementById('adminUsersTableBody');

    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-gray-400">لوڈ ہو رہا ہے...</td></tr>`;

    try {
        const params = new URLSearchParams({ q: query, status, plan });
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        currentAdminUsers = data.users || [];
        renderAdminUsersTable(currentAdminUsers);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-red-400">${err.message}</td></tr>`;
    }
}

function renderAdminUsersTable(users) {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-gray-500">کوئی صارف نہیں ملا (No users found)</td></tr>`;
        return;
    }

    let html = '';
    users.forEach(u => {
        let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        if (u.status === 'ACTIVE') badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        else if (u.status === 'BLOCKED') badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';
        else if (u.status === 'EXPIRED') badgeColor = 'bg-red-500/20 text-red-400 border-red-500/30';
        else if (u.status === 'REJECTED') badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';

        const startDateFormatted = u.start_date ? new Date(u.start_date).toLocaleDateString() : '-';
        const expiryDateFormatted = u.expiry_date ? new Date(u.expiry_date).toLocaleDateString() : '-';

        html += `
        <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
            <td class="p-3 font-bold text-white">${u.name}</td>
            <td class="p-3 text-gray-300 font-mono">${u.email}</td>
            <td class="p-3 font-semibold text-cyan-300">${u.plan || 'Monthly'}</td>
            <td class="p-3 text-gray-300">PKR ${Number(u.price || 3000).toLocaleString()}</td>
            <td class="p-3 text-gray-400 font-mono text-[11px]">${startDateFormatted}</td>
            <td class="p-3 text-gray-400 font-mono text-[11px]">${expiryDateFormatted} (${u.daysRemaining}d)</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}">${u.status}</span>
            </td>
            <td class="p-3">
                <div class="flex items-center gap-1">
                    <button onclick="adminViewUser('${u.id}')" title="تفصیلات" class="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] transition cursor-pointer">
                        VIEW
                    </button>
                    ${u.status !== 'ACTIVE' ? `
                    <button onclick="adminActivateUser('${u.id}')" title="فعال کریں" class="px-2 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition cursor-pointer">
                        Activate Subscription
                    </button>` : ''}
                    ${u.status !== 'BLOCKED' ? `
                    <button onclick="adminBlockUser('${u.id}')" title="بلاک کریں" class="px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded text-[10px] font-bold transition cursor-pointer">
                        BLOCK
                    </button>` : `
                    <button onclick="adminUnblockUser('${u.id}')" title="ان بلاک کریں" class="px-2 py-1 bg-cyan-600/80 hover:bg-cyan-500 text-white rounded text-[10px] font-bold transition cursor-pointer">
                        UNBLOCK
                    </button>`}
                    <button onclick="adminOpenExtendModal('${u.id}')" title="سبسکرپشن بڑھائیں" class="px-2 py-1 bg-purple-600/80 hover:bg-purple-500 text-white rounded text-[10px] font-bold transition cursor-pointer">
                        EXTEND
                    </button>
                    <button onclick="adminOpenEditModal('${u.id}')" title="تبدیل کریں" class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-[10px] transition cursor-pointer">
                        EDIT
                    </button>
                    <button onclick="adminDeleteUser('${u.id}')" title="ڈیلیٹ کریں" class="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-300 rounded text-[10px] transition cursor-pointer">
                        DELETE
                    </button>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function adminActivateUser(userId) {
    if (!confirm('کیا آپ واقعی اس صارف کا سبسکرپشن فعال کرنا چاہتے ہیں؟')) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({})
        });
        if (res.ok) {
            showToast("سبسکرپشن کامیابی سے فعال ہو گیا!");
            loadAdminStats();
            loadAdminUsers();
        } else {
            const d = await res.json();
            alert(d.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

async function adminBlockUser(userId) {
    if (!confirm('کیا آپ واقعی اس صارف کو بلاک کرنا چاہتے ہیں؟ اس کی تمام AI جنریشن فوری بند ہو جائے گی۔')) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}/block`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            showToast("صارف بلاک کر دیا گیا!");
            loadAdminStats();
            loadAdminUsers();
        }
    } catch (err) {
        alert(err.message);
    }
}

async function adminUnblockUser(userId) {
    try {
        const res = await fetch(`/api/admin/users/${userId}/unblock`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            showToast("صارف ان بلاک کر دیا گیا!");
            loadAdminStats();
            loadAdminUsers();
        }
    } catch (err) {
        alert(err.message);
    }
}

async function adminDeleteUser(userId) {
    if (!confirm('کیا آپ واقعی اس صارف کو مستقل طور پر حذف کرنا چاہتے ہیں؟')) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            showToast("صارف ڈیلیٹ کر دیا گیا!");
            loadAdminStats();
            loadAdminUsers();
        }
    } catch (err) {
        alert(err.message);
    }
}

function adminViewUser(userId) {
    const user = currentAdminUsers.find(u => u.id === userId);
    if (!user) return;
    alert(`صارف کی تفصیلات:\nنام: ${user.name}\nای میل: ${user.email}\nپلان: ${user.plan}\nاسٹیٹس: ${user.status}\nتاریخ آغاز: ${new Date(user.start_date).toLocaleString()}\nتاریخ اختتام: ${new Date(user.expiry_date).toLocaleString()}\nباقی دن: ${user.daysRemaining}`);
}

// Create User Submodal
function adminOpenCreateModal() {
    const m = document.getElementById('adminCreateUserModal');
    if (m) m.classList.remove('hidden');
}

function adminCloseCreateModal() {
    const m = document.getElementById('adminCreateUserModal');
    if (m) m.classList.add('hidden');
}

async function adminSubmitCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('adminCreateName').value.trim();
    const email = document.getElementById('adminCreateEmail').value.trim();
    const password = document.getElementById('adminCreatePassword').value;
    const plan = document.getElementById('adminCreatePlan').value;
    const status = document.getElementById('adminCreateStatus').value;

    try {
        const res = await apiFetch('/api/admin/users/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ name, email, password, plan, status })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');

        adminCloseCreateModal();
        showToast("نیا صارف کامیابی سے بن گیا!");
        loadAdminStats();
        loadAdminUsers();
    } catch (err) {
        alert(err.message);
    }
}

// Extend Subscription Submodal
function adminOpenExtendModal(userId) {
    const user = currentAdminUsers.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('adminExtendUserId').value = userId;
    document.getElementById('adminExtendUserName').innerText = user.name;
    document.getElementById('adminExtendModal').classList.remove('hidden');
}

function adminCloseExtendModal() {
    document.getElementById('adminExtendModal').classList.add('hidden');
}

async function adminSubmitExtend(e) {
    e.preventDefault();
    const userId = document.getElementById('adminExtendUserId').value;
    const days = parseInt(document.getElementById('adminExtendDays').value, 10);

    try {
        const res = await fetch(`/api/admin/users/${userId}/extend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ days })
        });
        if (res.ok) {
            adminCloseExtendModal();
            showToast(`سبسکرپشن میں ${days} دن کا اضافہ کر دیا گیا!`);
            loadAdminStats();
            loadAdminUsers();
        } else {
            const d = await res.json();
            alert(d.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

// Edit User Submodal
function adminOpenEditModal(userId) {
    const user = currentAdminUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('adminEditUserId').value = userId;
    document.getElementById('adminEditName').value = user.name;
    document.getElementById('adminEditEmail').value = user.email;
    document.getElementById('adminEditPlan').value = user.plan || 'Monthly';
    document.getElementById('adminEditStatus').value = user.status;
    document.getElementById('adminEditExpiry').value = user.expiry_date ? user.expiry_date.substring(0, 10) : '';

    document.getElementById('adminEditUserModal').classList.remove('hidden');
}

function adminCloseEditModal() {
    document.getElementById('adminEditUserModal').classList.add('hidden');
}

async function adminSubmitEditUser(e) {
    e.preventDefault();
    const userId = document.getElementById('adminEditUserId').value;
    const name = document.getElementById('adminEditName').value.trim();
    const email = document.getElementById('adminEditEmail').value.trim();
    const plan = document.getElementById('adminEditPlan').value;
    const status = document.getElementById('adminEditStatus').value;
    const expiry = document.getElementById('adminEditExpiry').value;
    const password = document.getElementById('adminEditPassword').value;

    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({
                name,
                email,
                plan,
                status,
                expiry_date: expiry ? new Date(expiry).toISOString() : undefined,
                password: password || undefined
            })
        });

        if (res.ok) {
            adminCloseEditModal();
            showToast("صارف کی تفصیلات اپ ڈیٹ ہو گئیں!");
            loadAdminStats();
            loadAdminUsers();
        } else {
            const d = await res.json();
            alert(d.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

// Admin Payments Management
async function loadAdminPayments() {
    const tbody = document.getElementById('adminPaymentsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-xs text-gray-400">لوڈ ہو رہا ہے...</td></tr>`;

    try {
        const res = await apiFetch('/api/admin/payments', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        currentAdminPayments = data.payments || [];
        renderAdminPaymentsTable(currentAdminPayments);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-xs text-red-400">${err.message}</td></tr>`;
    }
}

function renderAdminPaymentsTable(payments) {
    const tbody = document.getElementById('adminPaymentsTableBody');
    if (!tbody) return;

    if (!payments || payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-xs text-gray-500">کوئی ادائیگی جمع نہیں ہوئی (No payments recorded)</td></tr>`;
        return;
    }

    let html = '';
    payments.forEach(p => {
        let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        let statusLabel = 'Pending Verification';
        if (p.payment_status === 'PAID') {
            badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            statusLabel = 'Approved';
        } else if (p.payment_status === 'REJECTED') {
            badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';
            statusLabel = 'Rejected';
        }

        const submissionDate = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';
        const paymentDate = p.payment_date || '-';

        html += `
        <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
            <td class="p-3 font-bold text-white">${p.user_name}</td>
            <td class="p-3 text-gray-300 font-mono">${p.user_email}</td>
            <td class="p-3 text-cyan-300 font-semibold">${p.plan}</td>
            <td class="p-3 text-white font-mono">PKR ${Number(p.amount).toLocaleString()}</td>
            <td class="p-3 font-mono text-yellow-300 font-bold select-all">${p.transaction_reference}</td>
            <td class="p-3 text-gray-400 font-mono text-[11px]">${paymentDate}</td>
            <td class="p-3">
                ${p.screenshot_url ? `
                <button onclick="viewPaymentScreenshot('${p.screenshot_url}')" class="px-2 py-1 bg-cyan-950 text-cyan-300 border border-cyan-500/40 rounded text-[10px] font-bold hover:bg-cyan-900 transition flex items-center gap-1 cursor-pointer">
                    <span>🖼️</span> <span>رسید دیکھیں</span>
                </button>` : `<span class="text-gray-500 text-[10px]">کوئی رسید نہیں</span>`}
            </td>
            <td class="p-3 text-gray-400 font-mono text-[11px]">${submissionDate}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}">${statusLabel}</span>
            </td>
            <td class="p-3">
                ${p.payment_status === 'PENDING' ? `
                <div class="flex items-center gap-1.5">
                    <button onclick="adminVerifyPayment('${p.id}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black tracking-wide transition cursor-pointer shadow-md shadow-emerald-600/30">
                        Approve Payment
                    </button>
                    <button onclick="adminRejectPayment('${p.id}')" class="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-black tracking-wide transition cursor-pointer shadow-md shadow-red-600/30">
                        Reject Payment
                    </button>
                </div>` : `<span class="text-gray-500 text-[10px]">مکمل شدہ</span>`}
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

function viewPaymentScreenshot(url) {
    const modal = document.getElementById('screenshotModal');
    const img = document.getElementById('screenshotModalImg');
    if (!modal || !img) {
        window.open(url, '_blank');
        return;
    }
    img.src = url;
    modal.classList.remove('hidden');
}

function closeScreenshotModal() {
    const modal = document.getElementById('screenshotModal');
    if (modal) modal.classList.add('hidden');
}

async function adminVerifyPayment(paymentId) {
    if (!confirm('کیا آپ واقعی اس ادائیگی کی تصدیق کر کے صارف کا اکاؤنٹ فعال کرنا چاہتے ہیں؟\n\n- Monthly Plan: +30 Days\n- 6 Months Plan: +6 Calendar Months')) return;
    try {
        const res = await fetch(`/api/admin/payments/${paymentId}/verify`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            showToast("✓ Payment Approved! صارف کا اکاؤنٹ کامیابی سے فعال ہو گیا۔");
            loadAdminStats();
            loadAdminPayments();
        }
    } catch (err) {
        alert(err.message);
    }
}

async function adminRejectPayment(paymentId) {
    if (!confirm('کیا آپ واقعی یہ ادائیگی مسترد کرنا چاہتے ہیں؟ اس صارف کا اکاؤنٹ بند رہے گا۔')) return;
    try {
        const res = await fetch(`/api/admin/payments/${paymentId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            showToast("✕ Payment Rejected! ادائیگی مسترد کر دی گئی۔");
            loadAdminStats();
            loadAdminPayments();
        }
    } catch (err) {
        alert(err.message);
    }
}

// Admin Settings
async function loadAdminSettings() {
    try {
        const res = await apiFetch('/api/admin/settings', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        const s = data.settings || {};

        if (document.getElementById('setEasypaisaName')) {
            document.getElementById('setEasypaisaName').value = s.easypaisa_account_name || 'GLOBAL GENERATOR OFFICIAL';
        }
        if (document.getElementById('setEasypaisaNumber')) {
            document.getElementById('setEasypaisaNumber').value = s.easypaisa_account_number || '0300-1234567';
        }
        if (document.getElementById('setSupportContact')) {
            document.getElementById('setSupportContact').value = s.support_contact || 'WhatsApp: +92 300 1234567';
        }
        if (document.getElementById('setPaymentInstructions')) {
            document.getElementById('setPaymentInstructions').value = s.payment_instructions || 'Easypaisa کے ذریعے اپنے منتخب کردہ Plan کی رقم ادا کریں۔';
        }
        if (document.getElementById('setMonthlyPrice')) {
            document.getElementById('setMonthlyPrice').value = s.plan_monthly_price || '3000';
        }
        if (document.getElementById('set6MonthsPrice')) {
            document.getElementById('set6MonthsPrice').value = s.plan_6months_price || '15000';
        }
        if (document.getElementById('setAnnualPrice')) {
            document.getElementById('setAnnualPrice').value = s.plan_annual_price || '25000';
        }
        if (document.getElementById('setRateLimit')) {
            document.getElementById('setRateLimit').value = s.rate_limit_per_hour || '60';
        }
    } catch (_) {}
}

async function adminSaveSettings(e) {
    e.preventDefault();
    const payload = {
        easypaisa_account_name: document.getElementById('setEasypaisaName')?.value || 'سفیان حبیب (Sufyan Habib)',
        easypaisa_account_number: document.getElementById('setEasypaisaNumber')?.value || '03008998381',
        support_contact: document.getElementById('setSupportContact')?.value || 'WhatsApp: 03008998381',
        payment_instructions: document.getElementById('setPaymentInstructions')?.value || '',
        plan_monthly_price: document.getElementById('setMonthlyPrice')?.value || '3000',
        plan_6months_price: document.getElementById('set6MonthsPrice')?.value || '15000',
        plan_annual_price: document.getElementById('setAnnualPrice')?.value || '25000',
        rate_limit_per_hour: document.getElementById('setRateLimit')?.value || '60'
    };

    try {
        const res = await apiFetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("تمام سیٹنگز کامیابی سے محفوظ ہو گئیں!");
            // Refresh local easypaisaConfig
            easypaisaConfig.accountName = payload.easypaisa_account_name;
            easypaisaConfig.accountNumber = payload.easypaisa_account_number;
            easypaisaConfig.supportContact = payload.support_contact;
            easypaisaConfig.instructions = payload.payment_instructions;
        } else {
            alert('سیٹنگز محفوظ کرنے میں خرابی');
        }
    } catch (err) {
        alert(err.message);
    }
}

// Admin Audit Logs
async function loadAdminAuditLogs() {
    const tbody = document.getElementById('adminLogsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-gray-400">لوڈ ہو رہا ہے...</td></tr>`;

    try {
        const res = await apiFetch('/api/admin/audit-logs', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-gray-500">کوئی سرگرمی نہیں (No logs yet)</td></tr>`;
            return;
        }

        let html = '';
        logs.forEach(l => {
            html += `
            <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
                <td class="p-3 font-mono text-gray-400 text-[11px]">${new Date(l.created_at).toLocaleString()}</td>
                <td class="p-3 font-bold text-pink-400">${l.action}</td>
                <td class="p-3 text-gray-300">${l.details}</td>
                <td class="p-3 text-gray-400 font-mono text-[11px]">${l.admin_email || l.admin_id}</td>
            </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-red-400">${err.message}</td></tr>`;
    }
}
