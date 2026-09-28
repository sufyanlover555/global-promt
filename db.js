const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dbPath = isVercel ? path.join(os.tmpdir(), 'database.sqlite') : path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance and concurrency
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Initialize Database Schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    price INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    transaction_reference TEXT,
    payment_date TEXT,
    screenshot_url TEXT,
    created_at TEXT NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
);
`);

// Migration safeguard for existing tables
try { db.exec(`ALTER TABLE payments ADD COLUMN payment_date TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE payments ADD COLUMN screenshot_url TEXT;`); } catch (_) {}

// Seed Default Settings if missing
const defaultSettings = [
    { key: 'plan_monthly_price', value: '3000' },
    { key: 'plan_monthly_days', value: '30' },
    { key: 'plan_6months_price', value: '15000' },
    { key: 'plan_6months_days', value: '180' },
    { key: 'plan_annual_price', value: '25000' },
    { key: 'plan_annual_days', value: '365' },
    { key: 'rate_limit_per_hour', value: '60' },
    { key: 'easypaisa_account_name', value: 'سفیان حبیب (Sufyan Habib)' },
    { key: 'easypaisa_account_number', value: '03008998381' },
    { key: 'support_contact', value: 'WhatsApp: 03008998381' },
    { key: 'payment_instructions', value: 'Easypaisa کے ذریعے اپنے منتخب کردہ Plan کی رقم ادا کریں۔ رقم بھیجنے کے بعد Transaction ID اور تاریخ درج کریں اور رسید کا اسکرین شاٹ منسلک کریں۔' },
    { key: 'groq_api_key', value: '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' }
];

const checkSettingStmt = db.prepare('SELECT value FROM admin_settings WHERE key = ?');
const insertSettingStmt = db.prepare('INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, ?)');

for (const s of defaultSettings) {
    const existing = checkSettingStmt.get(s.key);
    if (!existing) {
        insertSettingStmt.run(s.key, s.value, new Date().toISOString());
    } else if (s.key === 'groq_api_key' && (!existing.value || existing.value.trim() === '' || existing.value.startsWith('YOUR_'))) {
        db.prepare('UPDATE admin_settings SET value = ?, updated_at = ? WHERE key = ?').run(s.value, new Date().toISOString(), s.key);
    }
}

// ============================================================
// CRYPTO & AUTH HELPERS
// ============================================================

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    try {
        const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculated, 'hex'));
    } catch {
        return false;
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'GLOBAL_GEN_SECRET_98381_SUFYAN_KEY_SECURE_2026';

function signStatelessToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifyStatelessToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    try {
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (signature.length !== expectedSig.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
            return null;
        }
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

function generateToken(payload = null) {
    if (payload) return signStatelessToken(payload);
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// SETTINGS
// ============================================================

function getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM admin_settings').all();
    const settings = {};
    for (const r of rows) {
        settings[r.key] = r.value;
    }
    return settings;
}

function updateSetting(key, value) {
    const stmt = db.prepare(`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, String(value), new Date().toISOString());
}

function updateSettingsBatch(settingsObj) {
    for (const [k, v] of Object.entries(settingsObj)) {
        updateSetting(k, v);
    }
}

// Calculate Plan Details based on current settings
function getPlanConfig(planName) {
    const settings = getAllSettings();
    if (planName === 'Annual') {
        return {
            name: 'Annual',
            price: parseInt(settings.plan_annual_price || '25000', 10),
            durationDays: parseInt(settings.plan_annual_days || '365', 10)
        };
    } else if (planName === '6 Months') {
        return {
            name: '6 Months',
            price: parseInt(settings.plan_6months_price || '15000', 10),
            durationDays: parseInt(settings.plan_6months_days || '180', 10)
        };
    } else {
        // Default: Monthly
        return {
            name: 'Monthly',
            price: parseInt(settings.plan_monthly_price || '3000', 10),
            durationDays: parseInt(settings.plan_monthly_days || '30', 10)
        };
    }
}

// ============================================================
// USERS & SESSIONS
// ============================================================

function createUser({ name, email, password, role = 'USER', status = 'PENDING', plan = 'Monthly' }) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
        throw new Error('اس ای میل سے پہلے ہی اکاؤنٹ موجود ہے (Email already registered)');
    }

    const userId = crypto.randomUUID();
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO users (id, name, email, password_hash, salt, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), email.toLowerCase().trim(), hash, salt, role, status, now, now);

    // Create associated subscription record
    const planCfg = getPlanConfig(plan);
    const subId = crypto.randomUUID();
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + planCfg.durationDays);

    db.prepare(`
        INSERT INTO subscriptions (id, user_id, plan, price, start_date, expiry_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        subId,
        userId,
        planCfg.name,
        planCfg.price,
        startDate.toISOString(),
        expiryDate.toISOString(),
        status,
        now,
        now
    );

    return getUserById(userId);
}

function getUserById(userId) {
    const user = db.prepare(`
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users WHERE id = ?
    `).get(userId);

    if (!user) return null;

    // Check & auto-expire subscription if active
    const sub = getLatestSubscription(userId);
    if (sub) {
        checkAndApplyAutoExpiry(user, sub);
    }

    // Refresh status if updated by expiry check
    const refreshedUser = db.prepare(`
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users WHERE id = ?
    `).get(userId);

    return {
        ...refreshedUser,
        subscription: getLatestSubscription(userId)
    };
}

function getUserByEmail(email) {
    const user = db.prepare(`
        SELECT id, name, email, password_hash, salt, role, status, created_at, updated_at
        FROM users WHERE email = ?
    `).get(email.toLowerCase().trim());

    if (!user) return null;

    const sub = getLatestSubscription(user.id);
    if (sub) {
        checkAndApplyAutoExpiry(user, sub);
    }

    const refreshedUser = db.prepare(`
        SELECT id, name, email, password_hash, salt, role, status, created_at, updated_at
        FROM users WHERE id = ?
    `).get(user.id);

    return {
        ...refreshedUser,
        subscription: getLatestSubscription(user.id)
    };
}

function createSession(userId, expiresInDays = 30) {
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'sufyanhbl143@gmail.com').toLowerCase().trim();
    const user = getUserById(userId) || (userId === 'admin_master' ? getUserByEmail(adminEmail) : null);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const isAdmin = (user && user.role === 'ADMIN') || userId === 'admin_master' || (user && user.email === adminEmail);

    // Issue cryptographic stateless token containing role, user ID, and expiration
    const token = signStatelessToken({
        uid: user ? user.id : userId,
        email: user ? user.email : (isAdmin ? adminEmail : ''),
        role: isAdmin ? 'ADMIN' : (user ? user.role : 'USER'),
        name: user ? user.name : (isAdmin ? 'سفیان حبیب (Sufyan Habib)' : ''),
        exp: expiresAt.getTime()
    });

    try {
        db.prepare(`
            INSERT OR REPLACE INTO sessions (token, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
        `).run(token, userId, expiresAt.toISOString(), now.toISOString());
    } catch (_) {
        // Safe to ignore in stateless or read-only edge runtimes
    }

    return { token, expiresAt: expiresAt.toISOString() };
}

function validateSession(token) {
    if (!token) return null;

    // 1. Check stateless cryptographic token first
    const payload = verifyStatelessToken(token);
    if (payload) {
        if (payload.role === 'ADMIN') {
            const dbAdmin = getUserByEmail(payload.email) || (payload.uid ? getUserById(payload.uid) : null);
            if (dbAdmin) {
                return { ...dbAdmin, role: 'ADMIN', status: 'ACTIVE' };
            }
            // Guaranteed admin fallback for serverless cold instances
            return {
                id: payload.uid || 'admin_master',
                name: payload.name || 'سفیان حبیب (Sufyan Habib)',
                email: payload.email || 'sufyanhbl143@gmail.com',
                role: 'ADMIN',
                status: 'ACTIVE',
                subscription: {
                    plan: 'Annual',
                    status: 'ACTIVE',
                    daysRemaining: 365,
                    expiry_date: new Date(Date.now() + 365 * 86400000).toISOString()
                }
            };
        }

        // For regular user: check DB if available (to respect blocks and deletions)
        const user = (payload.uid ? getUserById(payload.uid) : null) || getUserByEmail(payload.email);
        if (user) {
            return user;
        }
        return {
            id: payload.uid,
            name: payload.name,
            email: payload.email,
            role: payload.role || 'USER',
            status: 'ACTIVE'
        };
    }

    // 2. Fallback to database sessions table
    try {
        const session = db.prepare(`
            SELECT token, user_id, expires_at FROM sessions WHERE token = ?
        `).get(token);

        if (!session) return null;

        if (new Date() > new Date(session.expires_at)) {
            try { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch (_) {}
            return null;
        }

        return getUserById(session.user_id);
    } catch (_) {
        return null;
    }
}

function deleteSession(token) {
    if (!token) return;
    try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } catch (_) {}
}

// ============================================================
// SUBSCRIPTION LIFECYCLE & AUTO-EXPIRY
// ============================================================

function getLatestSubscription(userId) {
    const sub = db.prepare(`
        SELECT id, user_id, plan, price, start_date, expiry_date, status, created_at, updated_at
        FROM subscriptions
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    if (!sub) return null;

    // Calculate days remaining
    const now = new Date();
    const expiry = new Date(sub.expiry_date);
    const diffMs = expiry.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return {
        ...sub,
        daysRemaining
    };
}

function checkAndApplyAutoExpiry(user, sub) {
    if (user.status === 'ACTIVE' && sub && sub.status === 'ACTIVE') {
        const now = new Date();
        const expiry = new Date(sub.expiry_date);
        if (now > expiry) {
            const updatedAt = now.toISOString();
            db.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?').run('EXPIRED', updatedAt, sub.id);
            db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run('EXPIRED', updatedAt, user.id);
            sub.status = 'EXPIRED';
            user.status = 'EXPIRED';
        }
    }
}

function activateUserSubscription(userId, planName = null, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const sub = getLatestSubscription(userId);
    const chosenPlan = planName || (sub ? sub.plan : 'Monthly');
    const planCfg = getPlanConfig(chosenPlan);

    const now = new Date();
    const expiry = new Date(now);
    if (planCfg.name === 'Annual') {
        expiry.setFullYear(now.getFullYear() + 1);
    } else if (planCfg.name === '6 Months') {
        expiry.setMonth(now.getMonth() + 6);
    } else {
        expiry.setDate(now.getDate() + 30);
    }

    const nowIso = now.toISOString();
    const expiryIso = expiry.toISOString();

    if (sub) {
        db.prepare(`
            UPDATE subscriptions
            SET plan = ?, price = ?, start_date = ?, expiry_date = ?, status = 'ACTIVE', updated_at = ?
            WHERE id = ?
        `).run(planCfg.name, planCfg.price, nowIso, expiryIso, nowIso, sub.id);
    } else {
        const subId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO subscriptions (id, user_id, plan, price, start_date, expiry_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `).run(subId, userId, planCfg.name, planCfg.price, nowIso, expiryIso, nowIso, nowIso);
    }

    db.prepare(`UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(nowIso, userId);

    logAudit(adminId, 'Payment Approved / User Activated', `User ${user.email} activated on plan ${planCfg.name} until ${expiryIso}`);
    return getUserById(userId);
}

function blockUser(userId, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE users SET status = 'BLOCKED', updated_at = ? WHERE id = ?`).run(nowIso, userId);
    db.prepare(`UPDATE subscriptions SET status = 'BLOCKED', updated_at = ? WHERE user_id = ?`).run(nowIso, userId);

    // Invalidate any active sessions immediately
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    logAudit(adminId, 'User Blocked', `User ${user.email} blocked and sessions revoked`);
    return getUserById(userId);
}

function unblockUser(userId, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const sub = getLatestSubscription(userId);
    const now = new Date();
    let newStatus = 'PENDING';

    if (sub) {
        const expiry = new Date(sub.expiry_date);
        if (now < expiry) {
            newStatus = 'ACTIVE';
        } else {
            newStatus = 'EXPIRED';
        }
    }

    const nowIso = now.toISOString();
    db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, nowIso, userId);
    if (sub) {
        db.prepare(`UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, nowIso, sub.id);
    }

    logAudit(adminId, 'User Unblocked', `User ${user.email} unblocked. Restored status: ${newStatus}`);
    return getUserById(userId);
}

function extendSubscription(userId, days, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');
    const sub = getLatestSubscription(userId);
    if (!sub) throw new Error('Subscription not found');

    const currentExpiry = new Date(sub.expiry_date);
    const now = new Date();
    // If currently expired, extend from now; if currently active, extend from currentExpiry
    const baseDate = currentExpiry > now ? currentExpiry : now;
    baseDate.setDate(baseDate.getDate() + parseInt(days, 10));

    const newExpiryIso = baseDate.toISOString();
    const nowIso = now.toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET expiry_date = ?, status = 'ACTIVE', updated_at = ?
        WHERE id = ?
    `).run(newExpiryIso, nowIso, sub.id);

    db.prepare(`UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(nowIso, userId);

    logAudit(adminId, 'Subscription Extended', `User ${user.email} subscription extended by ${days} days to ${newExpiryIso}`);
    return getUserById(userId);
}

function reduceSubscription(userId, days, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');
    const sub = getLatestSubscription(userId);
    if (!sub) throw new Error('Subscription not found');

    const currentExpiry = new Date(sub.expiry_date);
    currentExpiry.setDate(currentExpiry.getDate() - parseInt(days, 10));

    const now = new Date();
    const newExpiryIso = currentExpiry.toISOString();
    const nowIso = now.toISOString();
    const newStatus = currentExpiry > now ? 'ACTIVE' : 'EXPIRED';

    db.prepare(`
        UPDATE subscriptions
        SET expiry_date = ?, status = ?, updated_at = ?
        WHERE id = ?
    `).run(newExpiryIso, newStatus, nowIso, sub.id);

    db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, nowIso, userId);

    logAudit(adminId, 'Subscription Reduced', `User ${user.email} subscription reduced by ${days} days to ${newExpiryIso}`);
    return getUserById(userId);
}

function setSubscriptionExpiry(userId, targetIsoDate, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');
    const sub = getLatestSubscription(userId);
    if (!sub) throw new Error('Subscription not found');

    const targetDate = new Date(targetIsoDate);
    const now = new Date();
    const newStatus = targetDate > now ? 'ACTIVE' : 'EXPIRED';
    const nowIso = now.toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET expiry_date = ?, status = ?, updated_at = ?
        WHERE id = ?
    `).run(targetDate.toISOString(), newStatus, nowIso, sub.id);

    db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, nowIso, userId);

    logAudit(adminId, 'Expiry Date Set', `User ${user.email} expiry set to ${targetDate.toISOString()}`);
    return getUserById(userId);
}

function changeUserPlan(userId, newPlanName, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');
    const sub = getLatestSubscription(userId);
    if (!sub) throw new Error('Subscription not found');

    const planCfg = getPlanConfig(newPlanName);
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(now.getDate() + planCfg.durationDays);

    const nowIso = now.toISOString();
    const expiryIso = expiry.toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET plan = ?, price = ?, start_date = ?, expiry_date = ?, updated_at = ?
        WHERE id = ?
    `).run(planCfg.name, planCfg.price, nowIso, expiryIso, nowIso, sub.id);

    logAudit(adminId, 'Plan Changed', `User ${user.email} plan changed to ${planCfg.name}`);
    return getUserById(userId);
}

function updateUser(userId, { name, email, role, status, plan, expiry_date, password }, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const nowIso = new Date().toISOString();
    let query = 'UPDATE users SET name = ?, email = ?, role = ?, status = ?, updated_at = ? WHERE id = ?';
    let params = [name || user.name, (email || user.email).toLowerCase().trim(), role || user.role, status || user.status, nowIso, userId];

    if (password && password.trim()) {
        const { hash, salt } = hashPassword(password);
        query = 'UPDATE users SET name = ?, email = ?, role = ?, status = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?';
        params = [name || user.name, (email || user.email).toLowerCase().trim(), role || user.role, status || user.status, hash, salt, nowIso, userId];
    }

    db.prepare(query).run(...params);

    if (plan || expiry_date || status) {
        const sub = getLatestSubscription(userId);
        if (sub) {
            const updatedPlan = plan || sub.plan;
            const planCfg = getPlanConfig(updatedPlan);
            const updatedExpiry = expiry_date || sub.expiry_date;
            const updatedStatus = status || sub.status;

            db.prepare(`
                UPDATE subscriptions
                SET plan = ?, price = ?, expiry_date = ?, status = ?, updated_at = ?
                WHERE id = ?
            `).run(planCfg.name, planCfg.price, updatedExpiry, updatedStatus, nowIso, sub.id);
        }
    }

    logAudit(adminId, 'User Edited', `User ${user.email} updated by admin`);
    return getUserById(userId);
}

function deleteUser(userId, adminId = 'SYSTEM') {
    const user = getUserById(userId);
    if (!user) return false;

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logAudit(adminId, 'User Deleted', `User ${user.email} permanently deleted`);
    return true;
}

// ============================================================
// ADMIN QUERIES & STATS
// ============================================================

function getAdminStats() {
    // Run auto-expiry check on all active subscriptions first
    const activeSubs = db.prepare(`
        SELECT s.id, s.user_id, s.expiry_date
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE u.status = 'ACTIVE' AND s.status = 'ACTIVE'
    `).all();

    const now = new Date();
    for (const sub of activeSubs) {
        if (now > new Date(sub.expiry_date)) {
            const updatedAt = now.toISOString();
            db.prepare("UPDATE subscriptions SET status = 'EXPIRED', updated_at = ? WHERE id = ?").run(updatedAt, sub.id);
            db.prepare("UPDATE users SET status = 'EXPIRED', updated_at = ? WHERE id = ?").run(updatedAt, sub.user_id);
        }
    }

    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'USER'").get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND status = 'ACTIVE'").get().count;
    const blockedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND status = 'BLOCKED'").get().count;
    const expiredUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND status = 'EXPIRED'").get().count;
    const pendingUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND status = 'PENDING'").get().count;
    const totalActiveSubs = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'ACTIVE'").get().count;
    const pendingPayments = db.prepare("SELECT COUNT(*) as count FROM payments WHERE payment_status = 'PENDING'").get().count;

    return {
        totalUsers,
        activeUsers,
        blockedUsers,
        expiredUsers,
        pendingUsers,
        totalActiveSubscriptions: totalActiveSubs,
        pendingPayments
    };
}

function searchUsers({ query = '', status = '', plan = '', limit = 100, includeAdmin = false } = {}) {
    let sql = `
        SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
               s.plan, s.price, s.start_date, s.expiry_date, s.status as sub_status
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id AND s.id = (
            SELECT id FROM subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
        )
        WHERE 1=1
    `;
    const params = [];

    if (!includeAdmin) {
        sql += ` AND u.role = 'USER'`;
    }

    if (query && query.trim()) {
        sql += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
        const q = `%${query.trim()}%`;
        params.push(q, q);
    }

    if (status && status !== 'ALL') {
        sql += ` AND u.status = ?`;
        params.push(status);
    }

    if (plan && plan !== 'ALL') {
        sql += ` AND s.plan = ?`;
        params.push(plan);
    }

    sql += ` ORDER BY u.created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    const now = new Date();

    return rows.map(r => {
        let daysRemaining = 0;
        if (r.expiry_date) {
            const expiry = new Date(r.expiry_date);
            const diffMs = expiry.getTime() - now.getTime();
            daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }
        return {
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            status: r.status,
            created_at: r.created_at,
            plan: r.plan || 'Monthly',
            price: r.price || 3000,
            start_date: r.start_date || r.created_at,
            expiry_date: r.expiry_date || r.created_at,
            daysRemaining
        };
    });
}

// ============================================================
// PAYMENTS
// ============================================================

function submitPayment({ userId, plan, amount, paymentMethod, transactionReference, paymentDate, screenshotUrl }) {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const paymentId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const payDate = paymentDate || nowIso.substring(0, 10);

    db.prepare(`
        INSERT INTO payments (id, user_id, plan, amount, payment_method, payment_status, transaction_reference, payment_date, screenshot_url, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
    `).run(paymentId, userId, plan, amount, paymentMethod || 'Easypaisa', transactionReference, payDate, screenshotUrl || null, nowIso);

    // Keep user status in PENDING while awaiting manual verification
    db.prepare(`UPDATE users SET status = 'PENDING', updated_at = ? WHERE id = ?`).run(nowIso, userId);

    return { id: paymentId, status: 'PENDING' };
}

function getPayments(options = null) {
    let status = (typeof options === 'string') ? options : (options && typeof options === 'object' ? options.status : null);
    let limit = (options && typeof options === 'object' && options.limit) ? options.limit : 100;

    let sql = `
        SELECT p.id, p.user_id, p.plan, p.amount, p.payment_method, p.payment_status,
               p.transaction_reference, p.payment_date, p.screenshot_url, p.created_at, p.verified_at, p.verified_by,
               u.name as user_name, u.email as user_email
        FROM payments p
        JOIN users u ON u.id = p.user_id
    `;
    const params = [];
    if (status && status !== 'ALL') {
        sql += ` WHERE p.payment_status = ?`;
        params.push(status);
    }
    sql += ` ORDER BY p.created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(sql).all(...params);
}

function getUserPayments(userId) {
    return db.prepare(`
        SELECT id, plan, amount, payment_method, payment_status, transaction_reference, payment_date, screenshot_url, created_at
        FROM payments
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).all(userId);
}

function verifyPayment(paymentId, adminId = 'SYSTEM') {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) throw new Error('Payment not found');

    const nowIso = new Date().toISOString();
    db.prepare(`
        UPDATE payments
        SET payment_status = 'PAID', verified_at = ?, verified_by = ?
        WHERE id = ?
    `).run(nowIso, adminId, paymentId);

    // Activate the user's subscription
    activateUserSubscription(payment.user_id, payment.plan, adminId);
    logAudit(adminId, 'Payment Approved', `Payment ${paymentId} approved for user ${payment.user_id} (${payment.plan})`);

    return { success: true };
}

function rejectPayment(paymentId, adminId = 'SYSTEM') {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) throw new Error('Payment not found');

    const nowIso = new Date().toISOString();
    db.prepare(`
        UPDATE payments
        SET payment_status = 'REJECTED', verified_at = ?, verified_by = ?
        WHERE id = ?
    `).run(nowIso, adminId, paymentId);

    // User status becomes REJECTED and Tool access is disabled
    db.prepare(`UPDATE users SET status = 'REJECTED', updated_at = ? WHERE id = ?`).run(nowIso, payment.user_id);
    db.prepare(`UPDATE subscriptions SET status = 'REJECTED', updated_at = ? WHERE user_id = ?`).run(nowIso, payment.user_id);

    logAudit(adminId, 'Payment Rejected', `Payment ${paymentId} rejected for user ${payment.user_id}`);
    return { success: true };
}

// ============================================================
// AUDIT LOGS & RATE LIMITING
// ============================================================

function logAudit(adminId, action, details) {
    try {
        const id = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        db.prepare(`
            INSERT INTO audit_logs (id, admin_id, action, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, adminId, action, details || '', nowIso);
    } catch (err) {
        console.error('[Audit Log Error]:', err.message);
    }
}

function getAuditLogs(limit = 100) {
    return db.prepare(`
        SELECT a.id, a.admin_id, a.action, a.details, a.created_at, u.name as admin_name, u.email as admin_email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC LIMIT ?
    `).all(limit);
}

function recordUsage(userId, requestType = 'story_generation') {
    try {
        const id = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        db.prepare(`
            INSERT INTO usage_logs (id, user_id, request_type, created_at)
            VALUES (?, ?, ?, ?)
        `).run(id, userId, requestType, nowIso);
    } catch (err) {
        console.error('[Usage Log Error]:', err.message);
    }
}

function checkRateLimit(userId) {
    const settings = getAllSettings();
    const maxPerHour = parseInt(settings.rate_limit_per_hour || '60', 10);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const count = db.prepare(`
        SELECT COUNT(*) as count FROM usage_logs
        WHERE user_id = ? AND created_at > ?
    `).get(userId, oneHourAgo).count;

    if (count >= maxPerHour) {
        return {
            allowed: false,
            message: `Rate limit exceeded. You have made ${count} requests in the last hour. Limit: ${maxPerHour}/hour.`
        };
    }

    return { allowed: true, remaining: maxPerHour - count };
}

// ============================================================
// SYSTEM AUTO-SEEDING & MASTER ADMIN GUARANTEE
// ============================================================

function ensureMasterAdmin() {
    try {
        const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'sufyanhbl143@gmail.com').toLowerCase().trim();
        const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Thepak@100';
        const adminName = 'سفیان حبیب (Sufyan Habib)';

        const existing = getUserByEmail(adminEmail);
        if (!existing) {
            console.log(`[DB Auto-Init] Auto-creating Master Admin account for: ${adminEmail}`);
            const newAdmin = createUser({
                name: adminName,
                email: adminEmail,
                password: adminPass,
                role: 'ADMIN',
                status: 'ACTIVE',
                plan: 'Annual'
            });
            activateUserSubscription(newAdmin.id, 'Annual', 'AUTO_INIT');
            console.log(`[DB Auto-Init] Master Admin initialized successfully.`);
        } else {
            // Guarantee role is ADMIN and status is ACTIVE
            if (existing.role !== 'ADMIN' || existing.status !== 'ACTIVE') {
                updateUser(existing.id, { role: 'ADMIN', status: 'ACTIVE' }, 'AUTO_INIT');
            }
        }
    } catch (err) {
        console.warn('[Ensure Master Admin Warn]:', err.message);
    }
}

function autoSeedDatabaseIfEmpty() {
    try {
        // If on Vercel and local database.sqlite exists, try to copy it if tmp database is fresh
        if (isVercel) {
            const localDbFile = path.join(__dirname, 'database.sqlite');
            if (fs.existsSync(localDbFile) && (!fs.existsSync(dbPath) || fs.statSync(dbPath).size < 10000)) {
                try {
                    fs.copyFileSync(localDbFile, dbPath);
                    console.log('[DB Auto-Init] Seeded SQLite database from bundled database.sqlite');
                } catch (copyErr) {
                    console.warn('[DB Copy Warning]:', copyErr.message);
                }
            }
        }

        const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        if (count === 0) {
            const seedPath = path.join(__dirname, 'data_seed.json');
            if (fs.existsSync(seedPath)) {
                console.log('[DB Auto-Init] Loading seed data from data_seed.json...');
                const seedRaw = fs.readFileSync(seedPath, 'utf8');
                const seed = JSON.parse(seedRaw);

                if (Array.isArray(seed.users)) {
                    for (const u of seed.users) {
                        try {
                            const salt = crypto.randomBytes(16).toString('hex');
                            const hash = crypto.scryptSync('Pakistan@123', salt, 64).toString('hex');
                            const now = new Date().toISOString();
                            db.prepare(`
                                INSERT OR IGNORE INTO users (id, name, email, password_hash, salt, role, status, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(u.id, u.name, u.email, hash, salt, u.role || 'USER', u.status || 'ACTIVE', u.created_at || now, now);

                            if (u.plan) {
                                const subId = crypto.randomUUID();
                                const start = u.start_date || now;
                                const expiry = u.expiry_date || new Date(Date.now() + (u.daysRemaining || 30) * 86400000).toISOString();
                                db.prepare(`
                                    INSERT OR IGNORE INTO subscriptions (id, user_id, plan, price, start_date, expiry_date, status, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `).run(subId, u.id, u.plan, u.price || 3000, start, expiry, u.status || 'ACTIVE', start, now);
                            }
                        } catch (err) {
                            console.warn('[Seed User Warn]:', err.message);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[Auto-Seed Warning]:', err.message);
    }

    ensureMasterAdmin();
}

function exportAllData() {
    return {
        exportedAt: new Date().toISOString(),
        users: searchUsers({ limit: 10000, includeAdmin: true }),
        settings: getAllSettings(),
        payments: getPayments({ limit: 10000 })
    };
}

function importAllData(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid data payload');
    const now = new Date().toISOString();
    let importedUsers = 0;

    if (Array.isArray(data.users)) {
        for (const u of data.users) {
            try {
                const existing = db.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(u.id, (u.email || '').toLowerCase().trim());
                if (existing) {
                    db.prepare(`
                        UPDATE users SET name = ?, email = ?, role = ?, status = ?, updated_at = ?
                        WHERE id = ?
                    `).run(u.name, (u.email || '').toLowerCase().trim(), u.role || 'USER', u.status || 'ACTIVE', now, existing.id);

                    if (u.plan) {
                        const sub = getLatestSubscription(existing.id);
                        if (sub) {
                            db.prepare(`
                                UPDATE subscriptions SET plan = ?, price = ?, expiry_date = ?, status = ?, updated_at = ?
                                WHERE id = ?
                            `).run(u.plan, u.price || 3000, u.expiry_date || sub.expiry_date, u.status || 'ACTIVE', now, sub.id);
                        }
                    }
                } else {
                    const salt = crypto.randomBytes(16).toString('hex');
                    const hash = crypto.scryptSync('Pakistan@123', salt, 64).toString('hex');
                    db.prepare(`
                        INSERT INTO users (id, name, email, password_hash, salt, role, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(u.id || crypto.randomUUID(), u.name, (u.email || '').toLowerCase().trim(), hash, salt, u.role || 'USER', u.status || 'ACTIVE', u.created_at || now, now);
                }
                importedUsers++;
            } catch (err) {
                console.warn('[Import User Warn]:', err.message);
            }
        }
    }

    if (data.settings && typeof data.settings === 'object') {
        updateSettingsBatch(data.settings);
    }

    ensureMasterAdmin();
    return { success: true, importedUsers };
}

// Run auto-seed on module initialization
autoSeedDatabaseIfEmpty();

module.exports = {
    db,
    hashPassword,
    verifyPassword,
    signStatelessToken,
    verifyStatelessToken,
    createUser,
    getUserById,
    getUserByEmail,
    createSession,
    validateSession,
    deleteSession,
    getLatestSubscription,
    activateUserSubscription,
    blockUser,
    unblockUser,
    extendSubscription,
    reduceSubscription,
    setSubscriptionExpiry,
    changeUserPlan,
    updateUser,
    deleteUser,
    getAdminStats,
    searchUsers,
    submitPayment,
    getPayments,
    getUserPayments,
    verifyPayment,
    rejectPayment,
    getAllSettings,
    updateSettingsBatch,
    getPlanConfig,
    logAudit,
    getAuditLogs,
    recordUsage,
    checkRateLimit,
    ensureMasterAdmin,
    autoSeedDatabaseIfEmpty,
    exportAllData,
    importAllData
};
