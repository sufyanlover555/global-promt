// Global Generator Local Proxy & Access License Server
// Handles Authentication, Subscriptions, Admin Licensing, Rate Limiting & Secure Groq Proxy

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// 1. Load Server Environment Variables (.env)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx !== -1) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim();
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
}

const db = require('./db.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp4': 'video/mp4'
};

// Response helper
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

// Authentication helper
function getAuthenticatedUser(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        return db.validateSession(token);
    }
    return null;
}

// Access Verification for AI Endpoints
function verifyAiAccess(user) {
    if (!user) {
        return {
            allowed: false,
            status: 401,
            error: 'Unauthorized: براہ کرم پہلے لاگ ان کریں (Please log in to continue).'
        };
    }

    if (user.role === 'ADMIN') {
        return { allowed: true }; // Admin always has full access
    }

    if (user.status === 'BLOCKED') {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کا access administrator نے بند کر دیا ہے۔ (Your access has been blocked by administrator).'
        };
    }

    if (user.status === 'PENDING') {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کی payment verification کے لیے pending ہے۔ (Your subscription is pending admin approval).'
        };
    }

    if (user.status === 'EXPIRED') {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کی subscription ختم ہو چکی ہے۔ Tool دوبارہ استعمال کرنے کے لیے نیا Plan خریدیں۔ (Your subscription has expired).'
        };
    }

    if (user.status === 'REJECTED') {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کی ادائیگی مسترد کر دی گئی ہے۔ تفصیلات کے لیے ایڈمن سے رابطہ کریں۔ (Payment rejected by administrator).'
        };
    }

    if (user.status !== 'ACTIVE') {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کا اکاؤنٹ فعال نہیں ہے۔ (Your account is not active).'
        };
    }

    // Check expiry date
    const sub = user.subscription;
    if (!sub || new Date() > new Date(sub.expiry_date)) {
        return {
            allowed: false,
            status: 403,
            error: 'آپ کا subscription ختم ہو چکا ہے۔ (Your subscription has expired).'
        };
    }

    // Check rate limit
    const rateCheck = db.checkRateLimit(user.id);
    if (!rateCheck.allowed) {
        return {
            allowed: false,
            status: 429,
            error: rateCheck.message
        };
    }

    return { allowed: true };
}

const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-fal-key');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Robust URL and pathname resolution supporting Vercel rewrites, serverless functions, proxies, and localhost
    const initialParsed = url.parse(req.url, true);
    let rawPath = (initialParsed.query && initialParsed.query.__endpoint)
               || req.headers['x-matched-path'] 
               || req.headers['x-forwarded-uri'] 
               || req.headers['x-invoke-path'] 
               || req.url;

    rawPath = rawPath.replace(/^\/api\/index(\.js)?/, '');
    if (!rawPath.startsWith('/')) {
        rawPath = '/' + rawPath;
    }
    if (!rawPath.startsWith('/api') && (
        rawPath.startsWith('/auth') || 
        rawPath.startsWith('/plans') || 
        rawPath.startsWith('/payments') || 
        rawPath.startsWith('/user') || 
        rawPath.startsWith('/admin') || 
        rawPath.startsWith('/generate') || 
        rawPath.startsWith('/tts') || 
        rawPath.startsWith('/video')
    )) {
        rawPath = '/api' + rawPath;
    }

    const parsedUrl = url.parse(rawPath, true);
    parsedUrl.query = Object.assign({}, initialParsed.query, parsedUrl.query);
    delete parsedUrl.query.__endpoint;

    let pathname = parsedUrl.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }

    // Helper to read JSON request body (supports both native Node streams and pre-parsed Vercel/Express bodies)
    const getRequestBody = () => new Promise((resolve, reject) => {
        if (req.body !== undefined && req.body !== null) {
            if (typeof req.body === 'object') {
                return resolve(req.body);
            }
            if (typeof req.body === 'string') {
                try {
                    return resolve(req.body ? JSON.parse(req.body) : {});
                } catch (e) {
                    return resolve({});
                }
            }
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', (err) => reject(err));
    });

    // ============================================================
    // 1. AUTHENTICATION & USER ROUTES
    // ============================================================

    // Sign Up
    if (pathname === '/api/auth/register' && req.method === 'POST') {
        try {
            const { name, email, password, plan } = await getRequestBody();
            if (!name || !email || !password) {
                sendJson(res, 400, { error: 'Name, email, and password are required' });
                return;
            }
            if (password.length < 6) {
                sendJson(res, 400, { error: 'Password must be at least 6 characters long' });
                return;
            }

            const user = db.createUser({
                name,
                email,
                password,
                role: 'USER',
                status: 'PENDING',
                plan: plan || 'Monthly'
            });

            const session = db.createSession(user.id);
            sendJson(res, 201, {
                success: true,
                token: session.token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status
                },
                subscription: user.subscription
            });
            return;
        } catch (err) {
            sendJson(res, 400, { error: err.message });
            return;
        }
    }

    // Login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
        try {
            const { email, password } = await getRequestBody();
            if (!email || !password) {
                sendJson(res, 400, { error: 'Email and password are required' });
                return;
            }

            const user = db.getUserByEmail(email);
            if (!user) {
                sendJson(res, 401, { error: 'غلط ای میل یا پاس ورڈ (Invalid email or password)' });
                return;
            }

            const valid = db.verifyPassword(password, user.password_hash, user.salt);
            if (!valid) {
                sendJson(res, 401, { error: 'غلط ای میل یا پاس ورڈ (Invalid email or password)' });
                return;
            }

            const session = db.createSession(user.id);
            sendJson(res, 200, {
                success: true,
                token: session.token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status
                },
                subscription: user.subscription
            });
            return;
        } catch (err) {
            sendJson(res, 500, { error: 'Login error: ' + err.message });
            return;
        }
    }

    // Logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            db.deleteSession(authHeader.substring(7));
        }
        sendJson(res, 200, { success: true });
        return;
    }

    // Get Current User Profile (Me)
    if (pathname === '/api/auth/me' && req.method === 'GET') {
        const user = getAuthenticatedUser(req);
        if (!user) {
            sendJson(res, 401, { error: 'Not authenticated' });
            return;
        }
        sendJson(res, 200, {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            },
            subscription: user.subscription
        });
        return;
    }

    // User Password Reset
    if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
        try {
            const user = getAuthenticatedUser(req);
            if (!user) {
                sendJson(res, 401, { error: 'Not authenticated' });
                return;
            }
            const { newPassword } = await getRequestBody();
            if (!newPassword || newPassword.length < 6) {
                sendJson(res, 400, { error: 'Password must be at least 6 characters' });
                return;
            }
            db.updateUser(user.id, { password: newPassword }, user.id);
            sendJson(res, 200, { success: true, message: 'Password updated successfully' });
            return;
        } catch (err) {
            sendJson(res, 400, { error: err.message });
            return;
        }
    }

    // Get Plans & Easypaisa Settings
    if (pathname === '/api/plans' && req.method === 'GET') {
        const settings = db.getAllSettings();
        const plans = [
            {
                id: 'Monthly',
                name: 'Monthly Plan',
                price: parseInt(settings.plan_monthly_price || '3000', 10),
                durationDays: parseInt(settings.plan_monthly_days || '30', 10),
                durationLabel: '30 Days',
                currency: 'PKR',
                features: [
                    'مکمل 8K سنیماٹک اسکرپٹ جنریٹر',
                    'ڈائنامک کریکٹر ڈی این اے مستقل لاک',
                    'Zero-Failure ویڈیو پرامپٹس (Kling, Runway, Luma)',
                    'Midjourney v6.1 کی فریم پرامپٹس',
                    'تیز رفتار Groq LPU کلاؤڈ پروسیسنگ'
                ]
            },
            {
                id: '6 Months',
                name: '6 Months Plan',
                price: parseInt(settings.plan_6months_price || '15000', 10),
                durationDays: parseInt(settings.plan_6months_days || '180', 10),
                durationLabel: '6 Months',
                currency: 'PKR',
                popular: true,
                features: [
                    '6 ماہ کی بلا تعطل رسائی (6 Months)',
                    'تمام ماہانہ پلان کے تمام فیچرز',
                    'ترجیحی AI پراسیسنگ اسپیڈ',
                    'لامحدود اسکرپٹ ٹیکسٹ ڈاؤنلوڈز',
                    '24/7 واٹس ایپ و ایڈمن سپورٹ'
                ]
            },
            {
                id: 'Annual',
                name: 'Annual Plan',
                price: parseInt(settings.plan_annual_price || '25000', 10),
                durationDays: parseInt(settings.plan_annual_days || '365', 10),
                durationLabel: '1 Year (365 Days)',
                currency: 'PKR',
                badge: 'Best Value',
                features: [
                    'مکمل 1 سال (365 Days) لامحدود رسائی',
                    'تمام 8K سنیماٹک اسکرپٹ جنریٹر و اپڈیٹس',
                    'ڈائنامک کریکٹر ڈی این اے مستقل لاک',
                    'Zero-Failure AI ویڈیو پرامپٹس (Kling, Runway, Luma)',
                    'Midjourney v6.1 کی فریم پرامپٹس',
                    'تیز رفتار Groq LPU VIP ترجیحی کلاؤڈ پروسیسنگ',
                    '24/7 ڈائریکٹ واٹس ایپ ترجیحی سپورٹ'
                ]
            }
        ];

        sendJson(res, 200, {
            plans,
            easypaisa: {
                accountName: settings.easypaisa_account_name || 'GLOBAL GENERATOR OFFICIAL',
                accountNumber: settings.easypaisa_account_number || '0300-1234567',
                instructions: settings.payment_instructions || 'Easypaisa کے ذریعے اپنے منتخب کردہ Plan کی رقم ادا کریں۔',
                supportContact: settings.support_contact || 'WhatsApp: +92 300 1234567'
            }
        });
        return;
    }

    // Submit Payment Reference & Optional Screenshot
    if (pathname === '/api/payments/submit' && req.method === 'POST') {
        try {
            const user = getAuthenticatedUser(req);
            if (!user) {
                sendJson(res, 401, { error: 'Not authenticated' });
                return;
            }
            const { plan, amount, paymentMethod, transactionReference, paymentDate, screenshot } = await getRequestBody();
            if (!plan || !transactionReference) {
                sendJson(res, 400, { error: 'Plan and Transaction ID are required' });
                return;
            }

            // Save optional base64 screenshot to media/payments
            let screenshotUrl = null;
            if (screenshot && typeof screenshot === 'string' && screenshot.startsWith('data:image')) {
                try {
                    const matches = screenshot.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                    if (matches) {
                        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                        const buffer = Buffer.from(matches[2], 'base64');
                        const paymentsDir = path.join(__dirname, 'media', 'payments');
                        if (!fs.existsSync(paymentsDir)) fs.mkdirSync(paymentsDir, { recursive: true });
                        const filename = `receipt_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
                        fs.writeFileSync(path.join(paymentsDir, filename), buffer);
                        screenshotUrl = `/media/payments/${filename}`;
                    }
                } catch (imgErr) {
                    console.warn('[Screenshot Save Warning]:', imgErr.message);
                }
            }

            const planCfg = db.getPlanConfig(plan);
            const result = db.submitPayment({
                userId: user.id,
                plan: planCfg.name,
                amount: amount || planCfg.price,
                paymentMethod: paymentMethod || 'Easypaisa',
                transactionReference: transactionReference.trim(),
                paymentDate: paymentDate || new Date().toISOString().substring(0, 10),
                screenshotUrl
            });

            sendJson(res, 200, {
                success: true,
                message: 'آپ کی payment verification کے لیے بھیج دی گئی ہے۔ Admin verification کے بعد آپ کا account activate کیا جائے گا۔',
                paymentId: result.id
            });
            return;
        } catch (err) {
            sendJson(res, 400, { error: err.message });
            return;
        }
    }

    // User Subscription Details
    if (pathname === '/api/user/subscription' && req.method === 'GET') {
        const user = getAuthenticatedUser(req);
        if (!user) {
            sendJson(res, 401, { error: 'Not authenticated' });
            return;
        }
        sendJson(res, 200, {
            user: {
                name: user.name,
                email: user.email,
                status: user.status
            },
            subscription: user.subscription
        });
        return;
    }

    // User Payment History
    if (pathname === '/api/user/payments' && req.method === 'GET') {
        const user = getAuthenticatedUser(req);
        if (!user) {
            sendJson(res, 401, { error: 'Not authenticated' });
            return;
        }
        const payments = db.getUserPayments(user.id);
        sendJson(res, 200, { payments });
        return;
    }

    // ============================================================
    // 2. ADMIN ROUTES (Protected with role === 'ADMIN')
    // ============================================================

    if (pathname.startsWith('/api/admin/')) {
        const user = getAuthenticatedUser(req);
        if (!user || user.role !== 'ADMIN') {
            sendJson(res, 403, { error: 'رسائی ممنوع ہے (Access denied: Admin role required)' });
            return;
        }

        // Admin Stats
        if (pathname === '/api/admin/stats' && req.method === 'GET') {
            const stats = db.getAdminStats();
            sendJson(res, 200, stats);
            return;
        }

        // Admin Search Users
        if (pathname === '/api/admin/users' && req.method === 'GET') {
            const { q, status, plan } = parsedUrl.query;
            const users = db.searchUsers({ query: q, status, plan });
            sendJson(res, 200, { users });
            return;
        }

        // Admin Create User
        if (pathname === '/api/admin/users/create' && req.method === 'POST') {
            try {
                const body = await getRequestBody();
                const { name, email, password, plan, status, startDate, expiryDate } = body;
                if (!name || !email || !password) {
                    sendJson(res, 400, { error: 'Name, email, and password are required' });
                    return;
                }

                const newUser = db.createUser({
                    name,
                    email,
                    password,
                    role: 'USER',
                    status: status || 'ACTIVE',
                    plan: plan || 'Monthly'
                });

                if (status === 'ACTIVE') {
                    db.activateUserSubscription(newUser.id, plan, user.id);
                }

                if (expiryDate) {
                    db.setSubscriptionExpiry(newUser.id, expiryDate, user.id);
                }

                db.logAudit(user.id, 'User Created', `Created user ${email} with status ${status || 'ACTIVE'}`);
                sendJson(res, 201, { success: true, user: db.getUserById(newUser.id) });
                return;
            } catch (err) {
                sendJson(res, 400, { error: err.message });
                return;
            }
        }

        // Dynamic Admin User ID Endpoints: /api/admin/users/:id/...
        const userActionMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)(?:\/(.*))?$/);
        if (userActionMatch) {
            const targetUserId = userActionMatch[1];
            const action = userActionMatch[2];

            // Edit User: PUT /api/admin/users/:id
            if (!action && req.method === 'PUT') {
                try {
                    const body = await getRequestBody();
                    const updated = db.updateUser(targetUserId, body, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Delete User: DELETE /api/admin/users/:id
            if (!action && req.method === 'DELETE') {
                const ok = db.deleteUser(targetUserId, user.id);
                sendJson(res, 200, { success: ok });
                return;
            }

            // Activate User
            if (action === 'activate' && req.method === 'POST') {
                try {
                    const body = await getRequestBody();
                    const updated = db.activateUserSubscription(targetUserId, body.plan, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Block User
            if (action === 'block' && req.method === 'POST') {
                try {
                    const updated = db.blockUser(targetUserId, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Unblock User
            if (action === 'unblock' && req.method === 'POST') {
                try {
                    const updated = db.unblockUser(targetUserId, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Extend Subscription
            if (action === 'extend' && req.method === 'POST') {
                try {
                    const body = await getRequestBody();
                    const days = parseInt(body.days, 10);
                    if (!days || days <= 0) {
                        sendJson(res, 400, { error: 'Valid number of days required' });
                        return;
                    }
                    const updated = db.extendSubscription(targetUserId, days, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Reduce Subscription
            if (action === 'reduce' && req.method === 'POST') {
                try {
                    const body = await getRequestBody();
                    const days = parseInt(body.days, 10);
                    if (!days || days <= 0) {
                        sendJson(res, 400, { error: 'Valid number of days required' });
                        return;
                    }
                    const updated = db.reduceSubscription(targetUserId, days, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Set Specific Expiry Date
            if (action === 'set-expiry' && req.method === 'POST') {
                try {
                    const body = await getRequestBody();
                    if (!body.expiryDate) {
                        sendJson(res, 400, { error: 'expiryDate required' });
                        return;
                    }
                    const updated = db.setSubscriptionExpiry(targetUserId, body.expiryDate, user.id);
                    sendJson(res, 200, { success: true, user: updated });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }

            // Reset Access / Password
            if (action === 'reset-access' && req.method === 'POST') {
                try {
                    const body = await getRequestBody();
                    const tempPassword = body.password || ('Gen' + Math.floor(100000 + Math.random() * 900000) + '!');
                    db.updateUser(targetUserId, { password: tempPassword }, user.id);
                    db.logAudit(user.id, 'Reset User Access', `Password reset for user ID: ${targetUserId}`);
                    sendJson(res, 200, { success: true, newPassword: tempPassword });
                    return;
                } catch (err) {
                    sendJson(res, 400, { error: err.message });
                    return;
                }
            }
        }

        // Admin Payments List
        if (pathname === '/api/admin/payments' && req.method === 'GET') {
            const { status } = parsedUrl.query;
            const payments = db.getPayments(status);
            sendJson(res, 200, { payments });
            return;
        }

        // Admin Verify Payment: /api/admin/payments/:id/verify
        const verifyPaymentMatch = pathname.match(/^\/api\/admin\/payments\/([^\/]+)\/verify$/);
        if (verifyPaymentMatch && req.method === 'POST') {
            try {
                const paymentId = verifyPaymentMatch[1];
                const resData = db.verifyPayment(paymentId, user.id);
                sendJson(res, 200, resData);
                return;
            } catch (err) {
                sendJson(res, 400, { error: err.message });
                return;
            }
        }

        // Admin Reject Payment: /api/admin/payments/:id/reject
        const rejectPaymentMatch = pathname.match(/^\/api\/admin\/payments\/([^\/]+)\/reject$/);
        if (rejectPaymentMatch && req.method === 'POST') {
            try {
                const paymentId = rejectPaymentMatch[1];
                const resData = db.rejectPayment(paymentId, user.id);
                sendJson(res, 200, resData);
                return;
            } catch (err) {
                sendJson(res, 400, { error: err.message });
                return;
            }
        }

        // Admin Settings: GET & POST
        if (pathname === '/api/admin/settings') {
            if (req.method === 'GET') {
                const settings = db.getAllSettings();
                sendJson(res, 200, { settings });
                return;
            }
            if (req.method === 'POST') {
                const body = await getRequestBody();
                db.updateSettingsBatch(body);
                db.logAudit(user.id, 'Settings Updated', 'Admin modified pricing/rate limit/payment settings');
                sendJson(res, 200, { success: true, settings: db.getAllSettings() });
                return;
            }
        }

        // Admin Audit Logs
        if (pathname === '/api/admin/audit-logs' && req.method === 'GET') {
            const logs = db.getAuditLogs(100);
            sendJson(res, 200, { logs });
            return;
        }
    }

    // ============================================================
    // 3. AI GENERATION ENDPOINTS (Strictly Protected by Subscription)
    // ============================================================

    // 3.1 Groq AI Story & Microscopic Prompt Generation
    if (pathname === '/api/generate-story' && req.method === 'POST') {
        try {
            // 1. Authenticate user & check subscription
            const user = getAuthenticatedUser(req);
            const access = verifyAiAccess(user);
            if (!access.allowed) {
                sendJson(res, access.status, { error: access.error });
                return;
            }

            // 2. Fetch server-side secret Groq key
            const groqKey = process.env.GROQ_API_KEY;
            if (!groqKey || groqKey.trim() === '' || groqKey.startsWith('YOUR_')) {
                sendJson(res, 500, {
                    error: 'سرور پر Groq API Key سیٹ نہیں ہے۔ برائے کرم ایڈمن سے رابطہ کریں۔ (Server Groq API key is not configured).'
                });
                return;
            }

            const body = await getRequestBody();
            const { topic, lang, duration, style, camera } = body;

            if (!topic || topic.trim() === '') {
                sendJson(res, 400, { error: 'Topic is required' });
                return;
            }

            // Record usage log
            db.recordUsage(user.id, 'story_generation');

            const sceneCount = Math.max(3, Math.round((duration || 60) / 10));

            const systemPrompt = `You are GLOBAL GENERATOR, the world's elite cinematic story & AI prompt engineering system.
Your mission is to produce flawless, zero-failure AI prompts with strict narrative continuity and chronological sequence for any topic that work with 100% success on any AI generation tool (Midjourney v6.1, Kling 1.5, Runway Gen-3, Luma Dream Machine, Sora, Minimax, Pika).

CRITICAL RULES:
1. STRICT NARRATIVE CONTINUITY & CHRONOLOGICAL SEQUENCE (ایک خاص تسلسل، ربط اور منطقی بہاؤ):
   - Every scene MUST follow a tight chronological cause-and-effect narrative arc:
     * Scene 1: Cinematic Hook & Opening Establishing Shot (Introduces lead character, objective, and specific environment).
     * Scene 2: Inciting Incident / Initial Action (Tension escalates, plan initiated, movement into action).
     * Scene 3: Peak Confrontation / High-Stakes Climax (Peak action beat, adrenaline, tactical maneuver or encounter).
     * Scene 4+: Climax Payoff & Resolution (Cinematic aftermath, victory, escape, or transition to the next chapter).
   - Temporal & Environmental Continuity: Weather, time-of-day, color grading palette, and geographical location must remain logically consistent across scenes.
   - Character Visual Continuity: Each character's locked appearance, wardrobe colors/materials, hairstyle, and distinctive tokens MUST be strictly maintained across all scenes they appear in, ensuring zero-morphing consistency across AI image and video models.

2. DYNAMIC CHARACTERS ACCORDING TO TOPIC:
   Analyze the user's topic and determine the EXACT required characters.
   - Solo mission / lone wolf / single agent? Generate EXACTLY 1 character.
   - Partnership / dynamic duo? Generate 2 characters.
   - Heist crew / syndicate / squad? Generate 3 or 4 characters with distinct specialized roles (e.g. Mastermind, Driver, Hacker, Muscle).
   DO NOT force 2 characters if the story demands 1 or 3! Adapt dynamically to the user's topic.
   For each character, define locked identity: name, role, age, gender, exact physical build, distinct facial features (hair, eyes, skin tone), signature locked wardrobe (colors and materials), and a compact consistency token.

3. ZERO-FAILURE PROMPTS (MUST NEVER FAIL ON ANY AI TOOL):
   - All prompts MUST be in English.
   - NO banned or safety-triggering words (avoid gore, extreme violence terms that trip content filters; use professional cinematic action terms like tactical maneuver, holster, high-speed evasive drift, pursuit).
   - videoPrompt (for Kling 1.5, Runway Gen-3, Luma, Sora):
     Format: [Dynamic Character Action & Locked Appearance] + [Specific Camera Movement, e.g. Low-angle tracking dolly push at 60fps] + [Lighting & Environment] + [Cinematic tags: photorealistic 8K, Unreal Engine 5.4 Lumen, 35mm lens, hyper-detailed].
     Keep under 450 characters so it fits within all tool input limits.
   - midjourneyPrompt (for Midjourney v6.1 / Image Keyframes):
     Format: [Subject & action description], [character wardrobe & facial details], [environment & atmospheric lighting], shot on 35mm anamorphic lens, photorealistic 8K, Unreal Engine 5.4, Rockstar RAGE Engine --ar 16:9 --style raw --v 6.1
   - negativePrompt:
     Format: blurry, low quality, morphing, deformed hands, extra limbs, distorted face, oversaturated, cartoon, CGI, watermark, text, signature

4. DIALOGUES:
   Must be 100% natural, punchy cinematic English.

Return valid JSON:
{
  "genre": "string",
  "style": "${style || 'GTA-VI Open-World Cinematic'}",
  "characters": [
    {
      "name": "string",
      "role": "string",
      "age": "string",
      "gender": "string",
      "body": "string",
      "facialFeatures": "string",
      "clothing": "string",
      "dnaLockToken": "string"
    }
  ],
  "story": "full engaging cinematic production story overview",
  "scenes": [
    {
      "number": 1,
      "title": "Scene Title",
      "timestamp": "0s - 10s",
      "activeCharacters": ["Character Name"],
      "camera": "string",
      "lighting": "string",
      "dialogue": "Punchy cinematic English dialogue",
      "videoPrompt": "Universal 8K video prompt under 450 chars for Kling, Runway, Luma",
      "midjourneyPrompt": "Midjourney v6.1 prompt ending with --ar 16:9 --style raw --v 6.1",
      "negativePrompt": "blurry, low quality, morphing, deformed hands, extra limbs, distorted face, watermark"
    }
  ]
};`;

            const modelsToTry = [
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3.8-27b"
            ];
            let parsedContent = null;
            let lastError = null;

            for (const modelName of modelsToTry) {
                try {
                    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${groqKey}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: `Generate complete 8K cinematic production for topic: "${topic}". Total scenes: ${sceneCount}. Style: ${style}. Return JSON with 100% English dialogues.` }
                            ],
                            response_format: { type: "json_object" },
                            temperature: 0.7,
                            max_tokens: 4096
                        })
                    });

                    const data = await response.json();
                    if (!response.ok) {
                        lastError = data.error?.message || `Groq status ${response.status}`;
                        continue;
                    }

                    parsedContent = JSON.parse(data.choices[0].message.content);
                    break;
                } catch (err) {
                    lastError = err.message;
                }
            }

            if (!parsedContent) {
                sendJson(res, 502, {
                    error: 'AI ماڈل سے عارضی رابطہ ممکن نہیں ہو سکا۔ برائے مہربانی کچھ دیر بعد دوبارہ کوشش کریں۔ (AI service temporarily unavailable)'
                });
                return;
            }

            sendJson(res, 200, parsedContent);
            return;

        } catch (err) {
            console.error("[Groq Generation Error]:", err.message);
            sendJson(res, 500, {
                error: 'کہانی بناتے وقت غیر متوقع خرابی پیش آئی۔ (Unexpected error during AI generation).'
            });
            return;
        }
    }

    // 3.2 Real AI Scene Visual Generation (Protected)
    if (pathname === '/api/generate-ai-scene' && req.method === 'POST') {
        try {
            const user = getAuthenticatedUser(req);
            const access = verifyAiAccess(user);
            if (!access.allowed) {
                sendJson(res, access.status, { error: access.error });
                return;
            }

            const body = await getRequestBody();
            const { prompt, sceneNum, characterDNA, location } = body;
            
            let dnaText = "";
            if (characterDNA) {
                const cA = characterDNA.protagonistA;
                const cB = characterDNA.protagonistB;
                if (cA && cA.name) {
                    dnaText += `Protagonist ${cA.name} (${cA.age || '28yo'}, ${cA.body || 'athletic build'}, wearing ${cA.clothing || 'crimson halter top & tactical holster'}, identical facial features, zero morphing). `;
                }
                if (cB && cB.name) {
                    dnaText += `Protagonist ${cB.name} (${cB.age || '31yo'}, ${cB.body || 'muscular build'}, wearing ${cB.clothing || 'vintage cuban shirt & white tank'}, identical facial features, zero morphing). `;
                }
            }

            const locationText = location ? `Location: ${location}. ` : "";
            const master8kDirectives = "GTA 6 ultra photorealistic 8K cinematic, Google Flow cinematic engine, Rockstar RAGE Next-Gen Engine, Unreal Engine 5.4 Lumen raytracing, volumetric atmospheric lighting, anamorphic lens flare, 35mm film grain, 60fps cinematic fluidity, crisp 8K resolution, octane render, masterpiece, hyper-detailed";
            const userPromptText = (prompt || 'Vice city sunset neon chase').substring(0, 300);
            const full8kPrompt = `${userPromptText}. ${dnaText}${locationText}${master8kDirectives}`;
            const cleanPrompt = encodeURIComponent(full8kPrompt.substring(0, 480));
            
            const seed = Math.floor(Math.random() * 900000) + 100000;
            const pollUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=576&model=flux&nologo=true&seed=${seed}`;
            
            let imgRes = null;
            try {
                imgRes = await Promise.race([
                    fetch(pollUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('AI generation timed out')), 22000))
                ]);
            } catch (fetchErr) {
                throw new Error("AI visual fetch failed: " + fetchErr.message);
            }
            
            if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const mediaDir = path.join(__dirname, 'media');
                if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                const fileName = `generated_scene_${sceneNum || 1}_8k_${Date.now()}.jpg`;
                const filePath = path.join(mediaDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
                sendJson(res, 200, { success: true, imageUrl: `/media/${fileName}` });
                return;
            } else {
                throw new Error("AI visual generation status: " + imgRes.status);
            }
        } catch (err) {
            sendJson(res, 200, { success: false, fallback: true, error: err.message });
            return;
        }
    }

    // 3.3 Strict English Character Voice TTS Engine (Protected)
    if (pathname === '/api/tts' && req.method === 'GET') {
        try {
            const user = getAuthenticatedUser(req);
            const access = verifyAiAccess(user);
            if (!access.allowed) {
                sendJson(res, access.status, { error: access.error });
                return;
            }

            const rawText = parsedUrl.query.text || 'The plan is set, no mistakes tonight.';
            const voiceKey = parsedUrl.query.voice || 'jason_deep';
            
            const cleanText = rawText.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim();
            const textToSpeak = cleanText.length > 0 ? cleanText.substring(0, 240) : "Proceed with caution, eyes open.";

            let langCode = 'en-US';
            if (voiceKey === 'british_agent') {
                langCode = 'en-GB';
            } else if (voiceKey === 'cyber_operative') {
                langCode = 'en-AU';
            } else if (voiceKey === 'hollywood_trailer') {
                langCode = 'en-CA';
            } else if (voiceKey === 'tommy_gangster' || voiceKey === 'jason_deep' || voiceKey === 'lucia_tactical' || voiceKey === 'agent_miller' || voiceKey === 'system_ai') {
                langCode = 'en-US';
            }

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textToSpeak)}&tl=${langCode}&client=tw-ob`;
            
            const ttsRes = await fetch(ttsUrl, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (ttsRes.ok) {
                const arrayBuffer = await ttsRes.arrayBuffer();
                res.writeHead(200, {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': arrayBuffer.byteLength,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400'
                });
                res.end(Buffer.from(arrayBuffer));
                return;
            } else {
                throw new Error("TTS upstream status: " + ttsRes.status);
            }
        } catch (err) {
            sendJson(res, 500, { error: err.message });
            return;
        }
    }

    // 3.4 Video Generation API Endpoints (Protected)
    if (pathname === '/api/generate-video' && req.method === 'POST') {
        try {
            const user = getAuthenticatedUser(req);
            const access = verifyAiAccess(user);
            if (!access.allowed) {
                sendJson(res, access.status, { error: access.error });
                return;
            }

            const body = await getRequestBody();
            const { provider, apiKey, prompt, negativePrompt, duration, aspectRatio } = body;

            if (!apiKey) {
                sendJson(res, 400, { error: 'API Key مطلوب ہے (API Key is required).' });
                return;
            }

            // PROVIDER 1: REPLICATE
            if (provider === 'replicate') {
                const modelVersion = body.model === 'kling' 
                    ? "kwaivgi/kling-v1.5-standard"
                    : "minimax/video-01";

                const response = await fetch("https://api.replicate.com/v1/predictions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Token ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: modelVersion,
                        input: { prompt, prompt_optimizer: true }
                    })
                });

                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            }

            // PROVIDER 2: FAL.AI
            else if (provider === 'fal') {
                const authHeader = apiKey.startsWith('Key ') ? apiKey : `Key ${apiKey}`;
                const falEndpoint = body.endpoint || "fal-ai/kling-video/v1.5/standard/text-to-video";

                const response = await fetch(`https://queue.fal.run/${falEndpoint}`, {
                    method: "POST",
                    headers: {
                        "Authorization": authHeader,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        negative_prompt: negativePrompt || "",
                        duration: duration || "5",
                        aspect_ratio: aspectRatio || "16:9"
                    })
                });

                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            }

            // PROVIDER 3: LUMA
            else if (provider === 'luma') {
                const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        aspect_ratio: aspectRatio || "16:9"
                    })
                });

                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            }

            // PROVIDER 4: RUNWAY
            else if (provider === 'runway') {
                const response = await fetch("https://api.dev.runwayml.com/v1/tasks", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "X-Runway-Version": "2024-09-13",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        taskType: "gen3a_turbo",
                        internal: false,
                        options: {
                            text_prompt: prompt,
                            duration: 5,
                            ratio: "1280:768"
                        }
                    })
                });

                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            }

            else {
                sendJson(res, 400, { error: `Unsupported provider: ${provider}` });
                return;
            }

        } catch (err) {
            sendJson(res, 500, { error: err.message });
            return;
        }
    }

    // 3.5 Video Status Polling Endpoint (Protected)
    if (pathname === '/api/video-status' && req.method === 'POST') {
        try {
            const user = getAuthenticatedUser(req);
            const access = verifyAiAccess(user);
            if (!access.allowed) {
                sendJson(res, access.status, { error: access.error });
                return;
            }

            const body = await getRequestBody();
            const { provider, apiKey, checkUrl, taskId } = body;

            if (provider === 'replicate') {
                const response = await fetch(checkUrl, { headers: { "Authorization": `Token ${apiKey}` } });
                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            } else if (provider === 'fal') {
                const response = await fetch(checkUrl, { headers: { "Authorization": `Key ${apiKey}` } });
                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            } else if (provider === 'luma') {
                const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`, {
                    headers: { "Authorization": `Bearer ${apiKey}` }
                });
                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            } else if (provider === 'runway') {
                const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "X-Runway-Version": "2024-09-13"
                    }
                });
                const data = await response.json();
                sendJson(res, response.status, data);
                return;
            }

            sendJson(res, 400, { error: 'Unknown status provider' });
            return;
        } catch (err) {
            sendJson(res, 500, { error: err.message });
            return;
        }
    }

    // ============================================================
    // 4. STATIC FILE SERVING
    // ============================================================
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
        const defaultPage = 'index.html';
        const targetFile = (pathname === '/' || pathname === '') ? defaultPage : pathname.replace(/^\/+/, '');
        let filePath = path.join(__dirname, targetFile);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(process.cwd(), targetFile);
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            filePath = fs.existsSync(path.join(__dirname, 'index.html'))
                ? path.join(__dirname, 'index.html')
                : path.join(process.cwd(), 'index.html');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (ext === '.mp4' && range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*'
                };
                res.writeHead(206, head);
                file.pipe(res);
                return;
            }

            res.writeHead(200, { 
                'Content-Type': MIME_TYPES[ext] || 'text/html; charset=utf-8',
                'Content-Length': fileSize,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }
    }

    // Default 404
    console.warn(`[404 Not Found] ${req.method} ${pathname} (raw: ${req.url})`);
    sendJson(res, 404, { error: 'Endpoint not found: ' + req.method + ' ' + pathname });
});

// Automatically ensure initial admin account exists on startup
try {
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'sufyanhbl143@gmail.com').toLowerCase().trim();
    const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Thepak@100';
    const existingAdmin = db.getUserByEmail(adminEmail);
    if (!existingAdmin) {
        const newAdmin = db.createUser({
            name: 'سفیان حبیب (Sufyan Habib)',
            email: adminEmail,
            password: adminPass,
            role: 'ADMIN',
            status: 'ACTIVE',
            plan: 'Annual'
        });
        db.activateUserSubscription(newAdmin.id, 'Annual', 'SYSTEM_AUTO_INIT');
        console.log(`👑 Admin account auto-initialized for: ${adminEmail}`);
    }
} catch (e) {
    console.warn('[Admin auto-init warning]:', e.message);
}

if (!process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🎬 GLOBAL GENERATOR & LICENSING SERVER ACTIVE`);
        console.log(`👉 Running on http://localhost:${PORT}`);
        console.log(`🔒 Security: Groq API Key protected server-side`);
        console.log(`🛡️ Database: SQLite Native Engine Initialized`);
        console.log(`====================================================`);
    });
}

process.on('uncaughtException', (err) => {
    console.error('[Server UncaughtException]:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Server UnhandledRejection]:', reason);
});

module.exports = server;
