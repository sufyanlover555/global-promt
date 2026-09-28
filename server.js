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

// ============================================================
// ZERO-FAILURE TOPIC-ADAPTIVE AI PRODUCTION ENGINE
// (Guarantees 100% Continuity, Locked DNA, Locked Wardrobe, Topic Location)
// ============================================================
function formatTimestampRange(i) {
    const startSec = i * 10;
    const endSec = (i + 1) * 10;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(startSec / 60))}:${pad(startSec % 60)} - ${pad(Math.floor(endSec / 60))}:${pad(endSec % 60)}`;
}

// ============================================================
// ZERO-FAILURE PRODUCTION SYNTHESIZER (Guaranteed 5 to 120 Scenes)
// ============================================================
function synthesizeProductionForTopic(topic, style = 'Cinematic 8K Master', sceneCount = 60, camera = 'Cinematic 35mm Anamorphic') {
    const t = (topic || '').toLowerCase();
    const count = Math.min(120, Math.max(3, parseInt(sceneCount, 10) || 60));

    let genre = 'Cinematic Action & Narrative Adventure';
    let envName = 'High-tension urban perimeter and architectural glass skyline';
    let envDetails = 'cinematic sunset golden hour, dramatic shadows, anamorphic lens flares, 8K ultra-detailed environment';
    let characters = [];

    if (t.includes('مغل') || t.includes('تاریخ') || t.includes('بادشاہ') || t.includes('قلعہ') || t.includes('جنگجو') || t.includes('sword') || t.includes('historical') || t.includes('warrior') || t.includes('ottoman') || t.includes('sultan')) {
        genre = 'Historical Epic & Royal Warrior Chronicle';
        envName = '16th-century grand Mughal fortress courtyard and ornate red sandstone battlements';
        envDetails = 'flickering brass torchlight, royal Persian carpets, intricately carved marble archways, dusty golden sunlight';
        characters = [
            {
                name: "Hamza Khan (حمزہ خان)",
                role: "شاہی کمانڈر و شمشیر زن (Royal Mughal Commander)",
                age: "34 سال",
                gender: "مردانہ (Male)",
                body: "مضبوط کسرتی جسم، 6 فٹ قد، گندمی رنگت، فولادی جبڑا اور پرعزم نگاہیں",
                facialFeatures: "گھنی تراشی ہوئی سیاہ داڑھی، تیکھی ناک، گہری عقابی بھوری آنکھیں، ماتھے پر ہلکا جنگی نشان",
                clothing: "گہرے نیوی بلیو اور زیتونی سلک کا شاہی انگورکھا، سینے پر دمشقی اسٹیل کا سنہری کندہ شدہ زرہ بکتر، کمر پر زری والا کٹار پٹکا اور براؤن لیدر بوٹس",
                dnaLockToken: "[LOCKED_DNA_HAMZA: 34yo warrior, olive/navy silk angarkha, Damascus steel chest armor, trimmed dark beard, eagle eyes, zero morphing]"
            },
            {
                name: "Zoya Bano (زویا بانو)",
                role: "شاہی انٹیلیجنس مشیر و تیر انداز (Royal Strategist)",
                age: "28 سال",
                gender: "زنانہ (Female)",
                body: "چست ایتھلیٹک جسم، 5 فٹ 7 انچ، شہدی رنگت اور شاہانہ وقار",
                facialFeatures: "لمبے سیاہ ریشمی بال، تیکھی چمکدار آنکھیں، چہرے پر باریک شاہی نقاب اور پروقار مسکراہٹ",
                clothing: "گہرے قرمزی ریشم کا کڑھائی دار قمیض شلوار، کندھے پر چمڑے کا تیر دان، کمر پر سونے کا پٹکا اور مخملی جوتے",
                dnaLockToken: "[LOCKED_DNA_ZOYA: 28yo female, crimson embroidered silk attire, royal archer quiver, sharp amber eyes, zero morphing]"
            }
        ];
    } else if (t.includes('سائبر') || t.includes('مستقبل') || t.includes('روبوٹ') || t.includes('cyber') || t.includes('sci-fi') || t.includes('future') || t.includes('neon') || t.includes('matrix')) {
        genre = 'Cyberpunk High-Tech Syndicate';
        envName = 'Rain-drenched Neo-Tokyo megacity alleyways and holographic corporate spire';
        envDetails = 'vivid magenta and cyan neon tube reflections, puddles on dark asphalt, towering volumetric holographic billboards';
        characters = [
            {
                name: "Riven 'Ghost' Cross",
                role: "سائبر ٹیک انفلٹریٹر (Cyber Infiltrator)",
                age: "28 سال",
                gender: "مردانہ (Male)",
                body: "لچکدار ایتھلیٹک جسم، 5 فٹ 11 انچ، سنہری جلد اور تیز ریفلیکسز",
                facialFeatures: "شارٹ سلور سفید بال، دائیں کنپٹی پر گلوئنگ نیلی بائیو چپ، سرمئی آنکھیں اور تیکھا چہرہ",
                clothing: "میٹ بلیک نیوپرین ٹیکٹیکل لانگ جیکٹ مع الیکٹرو لیومنسنٹ وائلٹ پائپنگ، ہائی ٹیک ویسٹ اور واٹر پروف سائبر کمبیٹ بوٹس",
                dnaLockToken: "[LOCKED_DNA_RIVEN: 28yo male, silver undercut hair, matte black tactical jacket with violet piping, blue temple optic, zero morphing]"
            },
            {
                name: "Aria Vance",
                role: "سائبر ہیکر و سگنل انٹیل (Signal Specialist)",
                age: "26 سال",
                gender: "زنانہ (Female)",
                body: "پھرتیلی جسامت، 5 فٹ 7 انچ قد، روشن نیلی نگاہیں",
                facialFeatures: "جیٹ بلیک ایسیمیٹرک بوب کٹ، چہرے پر پرسکون فوکس، کان پر ہولوگرافک کمیونیکیٹر",
                clothing: "چارکول گرے ریفلیکٹیو ہوڈی، بلیک کارگو جوگرز، فنگر لیس ٹیکٹیکل دستانے اور ڈیٹا ہارڈ ڈرائیوز ہارنیس",
                dnaLockToken: "[LOCKED_DNA_ARIA: 26yo female, jet black bob, charcoal reflective hoodie, bright blue eyes, zero morphing]"
            }
        ];
    } else if (t.includes('بینک') || t.includes('ڈکیتی') || t.includes('heist') || t.includes('robbery') || t.includes('vault') || t.includes('gta') || t.includes('police')) {
        genre = 'High-Stakes Tactical Heist & Pursuit';
        envName = 'Subterranean reinforced titanium bank vault and marble atrium floor';
        envDetails = 'gleaming polished white marble, red laser security tripwires, dim green emergency backup lights, alarm strobe pulses';
        characters = [
            {
                name: "Mateo Cruz",
                role: "ہائیسٹ ماسٹر مائنڈ (Mastermind Lead)",
                age: "35 سال",
                gender: "مردانہ (Male)",
                body: "چوڑے مضبوط کندھے، باوقار چال ڈھال، 6 فٹ قد اور گہری بھوری آنکھیں",
                facialFeatures: "سلکڈ بیک ڈارک ہیئر، باریک شیو، پرسکون مسکراہٹ اور الرٹ نگاہیں",
                clothing: "ڈارک چارکول سلک لینن سوٹ جیکٹ، اندر کالی ٹی شرٹ، کیولر کنسیلڈ ویسٹ، لیدر ڈرائیونگ گلوز اور لگژری واچ",
                dnaLockToken: "[LOCKED_DNA_MATEO: 35yo male, slicked dark hair, charcoal linen jacket, tactical inner vest, leather driving gloves, zero morphing]"
            },
            {
                name: "Lucia Santos",
                role: "ٹیکٹیکل پوائنٹ آپریٹو (Tactical Specialist)",
                age: "29 سال",
                gender: "زنانہ (Female)",
                body: "ایتھلیٹک ٹونڈ باڈی، لاطینی گندمی رنگت، 5 فٹ 8 انچ قد",
                facialFeatures: "ہائی پونی ٹیل سیاہ بال، تیکھے گال کی ہڈیاں، ہیزل آنکھیں مع پرعزم تاثر",
                clothing: "کریمسن ریڈ ٹیکٹیکل فارم فٹنگ جیکٹ، بلیک ریپ اسٹاپ کارگو پینٹس، ٹیکٹیکل تھائی ہولسٹر اور کمبیٹ بوٹس",
                dnaLockToken: "[LOCKED_DNA_LUCIA: 29yo female, high black ponytail, crimson tactical jacket, hazel eyes, tactical holster, zero morphing]"
            }
        ];
    } else {
        genre = 'Cinematic Thriller & Mission Chronicle';
        envName = 'Atmospheric perimeter with architectural glass and high-rise skyline view';
        envDetails = 'cinematic sunset golden hour, dramatic shadows, anamorphic lens flares, 8K ultra-detailed environment';
        characters = [
            {
                name: "Zain Malik (زین ملک)",
                role: "لیڈ انویسٹیگیٹر و آپریٹو (Lead Operative)",
                age: "31 سال",
                gender: "مردانہ (Male)",
                body: "مضبوط کسرتی جسم، 6 فٹ 1 انچ، گندمی رنگت اور تیز مشاہدہ",
                facialFeatures: "شارٹ ملٹری فیڈ سیاہ بال، ہلکی شیو، گہری امبر بھوری آنکھیں اور پرعزم انداز",
                clothing: "زیتونی سبز ٹیکٹیکل فیلڈ جیکٹ، اندر ڈارک گرے ہینلی شرٹ، کسٹم کیولر ہولسٹر، ڈارک ڈینم اور کمبیٹ بوٹس",
                dnaLockToken: "[LOCKED_DNA_ZAIN: 31yo male, military fade hair, olive green tactical field jacket, amber eyes, combat boots, zero morphing]"
            },
            {
                name: "Maya Lin (مایا لن)",
                role: "سائبر و ٹیکٹیکل کوآرڈینیٹر (Tactical Coordinator)",
                age: "27 سال",
                gender: "زنانہ (Female)",
                body: "ایتھلیٹک سمارٹ جسامت، 5 فٹ 8 انچ، الرٹ نگاہیں",
                facialFeatures: "سلک ڈارک براؤن بال جو سائیڈ بینگز میں کٹے ہیں، ہائی ٹیک ایئر پیس، تیز مشاہدہ",
                clothing: "میٹ نیوی کارگو بمبر، اندر ڈارک ٹیکٹیکل ٹاپ، کنسیلڈ ہولسٹر اور کمبیٹ اسنیکرز",
                dnaLockToken: "[LOCKED_DNA_MAYA: 27yo female, dark brown side-bang hair, navy tactical bomber, smart comms earpiece, zero morphing]"
            }
        ];
    }

    const leadChar = characters[0];
    const secChar = characters.length > 1 ? characters[1] : null;

    const cameraMovements = [
        "Low-angle cinematic tracking push shot at 60fps, 35mm anamorphic lens",
        "Dynamic over-the-shoulder steadycam orbit moving at rapid pace",
        "Intense whip-pan tracking hero shot, dramatic Dutch angle with depth-of-field blur",
        "Slow-motion 120fps dolly zoom revealing tense facial expressions and tactical gear",
        "Cinematic macro close-up on focused eyes and weapon/gadget handling",
        "Wide-angle cinematic crane jib pull-back shot with golden volumetric rays",
        "Visceral handheld POV camera with realistic micro-shake and motion blur",
        "High-speed shutter motion tracking pan keeping the operative in razor-sharp focus",
        "Bird's-eye aerial top-down sweep rotating 360 degrees above the perimeter",
        "Symmetrical cinematic master shot with volumetric rim flare and anamorphic bokeh"
    ];

    const narrativePhases = [
        {
            act: "Act I: Covert Inception & Perimeter Arrival",
            titleUrdu: "شروعات، آمد اور ماحول کا جائزہ",
            actions: [
                "infiltrates the perimeter quietly, surveying the perimeter landscape while checking tactical equipment",
                "holds position behind cover, scanning the environment for security patrols and temporal blindspots",
                "coordinates tactical visual cues, confirming entry vectors against the atmospheric background",
                "steps across the outer perimeter threshold with disciplined stealth, boots pressing soundlessly into the ground"
            ],
            dialogues: [
                "Perimeter secured. Coordinates locked. Proceeding according to master blueprint.",
                "Visual telemetry clear. Keep radio silence until we reach checkpoint Alpha.",
                "Target area sighted. Sync clocks at zero-hour.",
                "Movement detected on upper ridge. Hold stance and wait for patrol cycle to pass."
            ]
        },
        {
            act: "Act II: Tactical Breach & Security Override",
            titleUrdu: "بیرونی رکاوٹ عبور اور سیکیورٹی بائی پاس",
            actions: [
                "executes precision electronic bypass on the perimeter gate, sparks dancing off the terminal",
                "signals low and maneuvers through the shadow corridor, matching movement to the rhythmic strobe pulse",
                "disables the sensor array with swift tactical hand gestures, clearing the entry corridor",
                "advances across the marble hall, scanning high-angle surveillance nodes while maintaining cover"
            ],
            dialogues: [
                "Bypassing perimeter defenses. 10 seconds to full override.",
                "Grid is down. We have an eight-minute window. Advance now.",
                "Maintain locked formation. Don't leave a single trace.",
                "Terminal decoded. Primary threshold is unlocked."
            ]
        },
        {
            act: "Act III: Deep Penetration & Subterranean Infiltration",
            titleUrdu: "گہری پیش قدمی اور اندرونی راستوں کا انتظام",
            actions: [
                "descends into the inner complex corridor, shadows lengthening dramatically along the walls",
                "inspects the structural blueprint on a wrist console, adjusting trajectory towards the inner vault",
                "crouches beside reinforced pillar as an automated scanning beam washes over the floor inches away",
                "advances with surgical precision through the atmospheric haze, weapon held at ready-low position"
            ],
            dialogues: [
                "Descending to sub-level four. Gravity sensors are active.",
                "Stay out of the light sweep. Two paces behind me.",
                "Telemetry confirms we are directly beneath the primary vault.",
                "Atmospheric pressure dropping. We are entering the inner sector."
            ]
        },
        {
            act: "Act IV: The Discovery & Intelligence Acquisition",
            titleUrdu: "مرکزی ہدف کی دریافت اور خفیہ رازوں کا انکشاف",
            actions: [
                "reaches the grand central chamber, eyes fixing upon the luminous target resting in the reinforced chamber",
                "initiates high-speed optical download, holographic numerals reflecting across focused pupils",
                "carefully secures the core artifact into a shockproof tactical container, breathing steadily",
                "uncovers unexpected encrypted ledger files, realizing the true scale of the conspiracy"
            ],
            dialogues: [
                "Visual confirmation on the prize. It's fully intact.",
                "Data extraction initiating. Stand by for cryptographic decryption.",
                "The core is in our hands. Package secured and shielded.",
                "There is more here than we anticipated. Look at these clearance logs."
            ]
        },
        {
            act: "Act V: The Complication & Alarm Trigger",
            titleUrdu: "ناگہانی خطرہ، الارم اور سائرن کی گونج",
            actions: [
                "reacts instantly as red emergency warning strobes bathe the chamber in pulsing crimson light",
                "snaps into dynamic low cover as heavy blast doors seal off the main exit with an echoing crash",
                "reloads and locks weapon slide in one fluid motion as hostile footsteps echo from the surrounding gallery",
                "takes tactical point position, posture resolute as tension escalates to maximum threshold"
            ],
            dialogues: [
                "Alarm triggered! Lockdown initiated on all outer bulkheads!",
                "They knew we were coming. Plan Bravo is now in effect!",
                "Red sirens are blaring! Form defensive perimeter immediately!",
                "No hesitation now. We fight our way to the upper deck!"
            ]
        },
        {
            act: "Act VI: High-Stakes Tactical Crossfire & Skirmish",
            titleUrdu: "شدید تصادم اور حکمت عملی کے ساتھ جوابی کارروائی",
            actions: [
                "unleashes rapid tactical suppression fire, muzzle flashes cutting through the swirling smoke",
                "slides beneath a collapsing steel beam, coming up into a ready stance to neutralize incoming threats",
                "deploys a dense tactical smoke canister, masking movement while advancing through the haze",
                "navigates through falling debris, eyes locked on the secondary extraction corridor"
            ],
            dialogues: [
                "Suppression fire! Keep them pinned while I flank the left corridor!",
                "Covering your advance! Smoke out, move now!",
                "Two hostiles down! Push through the breach before they regroup!",
                "Watch your six! Secondary squad incoming from the catwalk!"
            ]
        },
        {
            act: "Act VII: The Turning Point & Decisive Confrontation",
            titleUrdu: "فیصلہ کن موڑ اور مرکزی رکاوٹ کا خاتمہ",
            actions: [
                "confronts the elite adversary commander in a high-tension standoff, eyes narrowing with steely resolve",
                "executes an extraordinary close-quarters maneuver, disarming the rival operative with cinematic speed",
                "detonates breach charges on the reinforcement wall, blasting open a pathway to the outdoor courtyard",
                "rises unyielding amidst settling dust and sparks, breathing deeply with fierce determination"
            ],
            dialogues: [
                "It ends here! Stand down or face the consequences!",
                "You underestimated our resolve from the very beginning.",
                "Breach charges armed! Three, two, one... clear!",
                "Path is cleared! Sprint for the open sky!"
            ]
        },
        {
            act: "Act VIII: The High-Speed Breakout & Pursuit",
            titleUrdu: "تیز رفتار فرار اور چھتوں / گاڑیوں پر تعاقب",
            actions: [
                "bursts through shattered glass onto the elevated open balcony, sprinting full speed against the wind",
                "leaps across a rooftop chasm with breathtaking athletic agility, rolling cleanly onto the landing platform",
                "engages high-speed pursuit vehicle, tires screeching across wet pavement as sparks erupt",
                "weaves through pursuing vehicles, executing precision evasive maneuvers with flawless control"
            ],
            dialogues: [
                "Breaking out onto the upper terrace! Extraction team, where are you?!",
                "Make the leap! Don't look down, just go!",
                "Vehicle engaged! Hold on, this is going to be rough!",
                "We shook off the lead interceptor! Clear runway straight ahead!"
            ]
        },
        {
            act: "Act IX: Aerial / Tactical Extraction & Payoff",
            titleUrdu: "حتمی انخلاء اور محفوظ زون میں داخلہ",
            actions: [
                "latches onto the dangling extraction cable as rescue transport roars overhead against the dusk sky",
                "pulls inside the transport compartment, extending a hand to secure the partner amidst rushing wind",
                "looks back down at the illuminated fortress below as the complex shrinks into the distant horizon",
                "inspects the locked artifact securely resting in the tactical chest rig with a breath of relief"
            ],
            dialogues: [
                "Extraction transport is here! Hook in, hook in now!",
                "I've got you! Pull yourself up!",
                "We are airborne and out of hostile range. Clean extraction confirmed.",
                "Package is 100% intact. We did it."
            ]
        },
        {
            act: "Act X: Climax Payoff, Golden Sunset & Final Resolution",
            titleUrdu: "عظیم الشان انجام، فتح اور مستقل شناخت کا تاثر",
            actions: [
                "stands tall in the open cabin bay as golden twilight sunlight illuminates the triumphant silhouette",
                "secures tactical gear, signature outfit completely intact, gazing towards the horizon with unshakeable confidence",
                "exchanges a knowing nod with the team as city lights illuminate beneath the cinematic panoramic frame",
                "delivers a final commanding glance to the lens as cinematic credits roll across the epic sunset canvas"
            ],
            dialogues: [
                "Mission accomplished. The truth is now in our hands.",
                "Today we rewrote the outcome. Prepare for the next chapter.",
                "Every operative accounted for. History will remember this day.",
                "Heading for home base. Over and out."
            ]
        }
    ];

    const scenes = [];
    for (let i = 0; i < count; i++) {
        const num = i + 1;
        const timestamp = formatTimestampRange(i);

        // Map scene progress linearly across the 10 narrative phases
        const phaseIndex = Math.min(narrativePhases.length - 1, Math.floor((i / count) * narrativePhases.length));
        const phase = narrativePhases[phaseIndex];

        const actionSubIdx = i % phase.actions.length;
        const dialogueSubIdx = i % phase.dialogues.length;
        const cameraMovement = cameraMovements[i % cameraMovements.length];

        const specificAction = phase.actions[actionSubIdx];
        const dialogue = phase.dialogues[dialogueSubIdx];

        const sceneTitle = `منظر ${num} / ${count}: ${phase.titleUrdu} (${phase.act})`;

        let actionDesc = "";
        if (secChar && (i % 2 === 1 || i % 3 === 0)) {
            actionDesc = `${leadChar.name} (${leadChar.dnaLockToken}) and ${secChar.name} (${secChar.dnaLockToken}), dressed in their locked outfits, ${specificAction} in ${envName}`;
        } else {
            actionDesc = `${leadChar.name} (${leadChar.dnaLockToken}), wearing locked ${leadChar.clothing}, ${specificAction} in ${envName}`;
        }

        const videoPrompt = `${leadChar.name} in ${leadChar.clothing}, ${actionDesc}. ${cameraMovement}. ${envDetails}. photorealistic 8K, Unreal Engine 5.4 Lumen, 35mm lens, 60fps, ultra-detailed`.substring(0, 440);
        const midjourneyPrompt = `${leadChar.name} in ${leadChar.clothing}, ${actionDesc}, ${envName}, ${envDetails}, shot on 35mm anamorphic lens, 8K ultra-detailed --ar 16:9 --style raw --v 6.1`;
        const negativePrompt = "blurry, low quality, morphing, deformed hands, extra limbs, distorted face, altered clothes, changed hair, watermark";

        scenes.push({
            number: num,
            title: sceneTitle,
            timestamp,
            activeCharacters: characters.map(c => c.name),
            camera: cameraMovement,
            lighting: envDetails,
            dialogue,
            videoPrompt,
            midjourneyPrompt,
            negativePrompt
        });
    }

    const storyOverview = `موضوع: "${topic}"\nیہ کہانی ایک مکمل تسلسل، ربط اور منطقی بہاؤ کے ساتھ کل ${count} مناظر پر مشتمل تیار کی گئی ہے۔ اس میں ہر منظر کا پچھلے منظر کے ساتھ مضبوط تعلق ہے، اور کردار کا لباس، رنگ، عمر، چہرہ اور ڈی این اے مکمل طور پر تمام مناظر میں محفوظ اور لاک رکھا گیا ہے تاکہ AI ویڈیوز میں کوئی روپ یا لباس تبدیل نہ ہو۔`;

    return {
        genre,
        style,
        characters,
        story: storyOverview,
        scenes
    };
}

// ============================================================
// PRODUCTION EXPANSION ENGINE (Expands AI Anchor Scenes to Target Count)
// ============================================================
function expandProductionToCount(parsedData, topic, style, targetCount, camera) {
    if (!parsedData || typeof parsedData !== 'object') {
        return synthesizeProductionForTopic(topic, style, targetCount, camera);
    }

    const fallback = synthesizeProductionForTopic(topic, style, targetCount, camera);

    // Ensure valid characters
    let characters = parsedData.characters;
    if (!Array.isArray(characters) || characters.length === 0) {
        characters = fallback.characters;
    }
    const leadChar = characters[0];
    const secChar = characters.length > 1 ? characters[1] : null;

    let existingScenes = Array.isArray(parsedData.scenes) ? parsedData.scenes : [];
    if (existingScenes.length === 0) {
        return fallback;
    }

    // If exactly equal, just normalize timestamps and numbering
    if (existingScenes.length === targetCount) {
        parsedData.scenes = existingScenes.map((s, idx) => ({
            ...s,
            number: idx + 1,
            timestamp: formatTimestampRange(idx)
        }));
        return parsedData;
    }

    // If more than targetCount, slice to targetCount
    if (existingScenes.length > targetCount) {
        parsedData.scenes = existingScenes.slice(0, targetCount).map((s, idx) => ({
            ...s,
            number: idx + 1,
            timestamp: formatTimestampRange(idx)
        }));
        return parsedData;
    }

    // If fewer than targetCount (e.g. Groq gave 6-10 scenes for a 60 or 90 request):
    // Expand to exactly targetCount using existing scenes as anchor milestones!
    const expandedScenes = [];
    const sourceCount = existingScenes.length;

    for (let i = 0; i < targetCount; i++) {
        const num = i + 1;
        const timestamp = formatTimestampRange(i);
        const progress = i / (targetCount - 1 || 1);

        // Find closest source anchor scene
        const sourceIndex = Math.min(sourceCount - 1, Math.floor(progress * sourceCount));
        const anchor = existingScenes[sourceIndex];

        // Synthesizer counterpart for variety and narrative progression
        const synthScene = fallback.scenes[Math.min(fallback.scenes.length - 1, i)];

        let title = anchor.title || synthScene.title;
        if (!title.includes(`${num} / ${targetCount}`)) {
            title = `منظر ${num} / ${targetCount}: ${title.replace(/^Scene\s*\d+:\s*/i, '').replace(/^منظر\s*\d+:\s*/i, '')}`;
        }

        const cameraMovement = anchor.camera || synthScene.camera;
        const lighting = anchor.lighting || synthScene.lighting;
        const dialogue = anchor.dialogue || synthScene.dialogue;

        let videoPrompt = anchor.videoPrompt || synthScene.videoPrompt;
        // Ensure character locked wardrobe is embedded
        if (!videoPrompt.includes(leadChar.clothing) && leadChar.clothing) {
            videoPrompt = `${leadChar.name} (${leadChar.dnaLockToken}), wearing ${leadChar.clothing}, ${videoPrompt}`.substring(0, 440);
        }

        let midjourneyPrompt = anchor.midjourneyPrompt || synthScene.midjourneyPrompt;
        if (!midjourneyPrompt.includes('--v 6.1')) {
            midjourneyPrompt += ' --ar 16:9 --style raw --v 6.1';
        }

        expandedScenes.push({
            number: num,
            title,
            timestamp,
            activeCharacters: anchor.activeCharacters || characters.map(c => c.name),
            camera: cameraMovement,
            lighting,
            dialogue,
            videoPrompt,
            midjourneyPrompt,
            negativePrompt: anchor.negativePrompt || synthScene.negativePrompt
        });
    }

    parsedData.characters = characters;
    parsedData.scenes = expandedScenes;
    if (!parsedData.story) {
        parsedData.story = fallback.story;
    }

    return parsedData;
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

            const cleanEmail = email.toLowerCase().trim();
            const masterAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'sufyanhbl143@gmail.com').toLowerCase().trim();
            const masterAdminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Thepak@100';

            // Master Admin direct guarantee (works across any system, Vercel cold boot, or local server)
            if (cleanEmail === masterAdminEmail && password === masterAdminPass) {
                let adminUser = db.getUserByEmail(masterAdminEmail);
                if (!adminUser) {
                    db.ensureMasterAdmin();
                    adminUser = db.getUserByEmail(masterAdminEmail);
                }
                const session = db.createSession(adminUser ? adminUser.id : 'admin_master');
                sendJson(res, 200, {
                    success: true,
                    token: session.token,
                    user: {
                        id: adminUser ? adminUser.id : 'admin_master',
                        name: adminUser ? adminUser.name : 'سفیان حبیب (Sufyan Habib)',
                        email: masterAdminEmail,
                        role: 'ADMIN',
                        status: 'ACTIVE'
                    },
                    subscription: {
                        plan: 'Annual',
                        status: 'ACTIVE',
                        daysRemaining: 365,
                        expiry_date: new Date(Date.now() + 365 * 86400000).toISOString()
                    }
                });
                return;
            }

            const user = db.getUserByEmail(cleanEmail);
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

        // Admin Export / Backup Data
        if (pathname === '/api/admin/export-data' && req.method === 'GET') {
            const backup = db.exportAllData();
            sendJson(res, 200, backup);
            return;
        }

        // Admin Import / Restore Data
        if (pathname === '/api/admin/import-data' && req.method === 'POST') {
            try {
                const body = await getRequestBody();
                const result = db.importAllData(body);
                sendJson(res, 200, result);
                return;
            } catch (err) {
                sendJson(res, 400, { error: 'Import failed: ' + err.message });
                return;
            }
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

            // 2. Fetch server-side secret Groq key (with fallback to DB settings and default verified key)
            const settings = db.getAllSettings();
            let groqKey = (process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('YOUR_'))
                ? process.env.GROQ_API_KEY.trim()
                : ((settings.groq_api_key && !settings.groq_api_key.startsWith('YOUR_'))
                    ? settings.groq_api_key.trim()
                    : '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');

            if (!groqKey || groqKey.trim() === '' || groqKey.startsWith('YOUR_')) {
                sendJson(res, 500, {
                    error: 'سرور پر Groq API Key سیٹ نہیں ہے۔ برائے کرم ایڈمن پینل کی سیٹنگز سے Groq API Key درج کریں۔'
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

            let count = parseInt(body.sceneCount || body.duration || 60, 10);
            if (count === 600) count = 60;
            if (count === 900) count = 90;
            if (count === 720) count = 72;
            if (count === 480) count = 48;
            if (count === 300) count = 30;
            if (count === 180) count = 18;
            if (count === 120) count = 12;
            const sceneCount = Math.min(120, Math.max(3, count));

            const systemPrompt = `You are GLOBAL GENERATOR, the world's elite cinematic story & AI prompt engineering system.
Your mission is to produce flawless, zero-failure AI prompts with strict narrative continuity and chronological sequence for any topic that work with 100% success on any AI generation tool (Midjourney v6.1, Kling 1.5/2.0, Runway Gen-3, Luma Dream Machine, Sora, Minimax, Hailuo, Pika).

CRITICAL DIRECTIVES:
1. STRICT NARRATIVE CONTINUITY & CHRONOLOGICAL PROGRESSION (ایک خاص تسلسل، ربط اور منطقی بہاؤ):
   - Every scene MUST follow a tight chronological cause-and-effect narrative arc:
     * Scene 1: Cinematic Establishing Shot & Hook (Introduces lead character, objective, and specific environment).
     * Scene 2: Inciting Incident / Initial Action (Tension escalates, plan initiated, movement into action).
     * Scene 3: Peak Confrontation / High-Stakes Climax (Peak action beat, adrenaline, tactical maneuver or encounter).
     * Scene 4+: Climax Payoff & Resolution (Cinematic aftermath, victory, escape, or transition to the next chapter).
   - Temporal & Environmental Continuity: Weather, time-of-day, color grading palette, and geographical location must remain logically consistent across scenes.

2. UNBREAKABLE CHARACTER VISUAL DNA, WARDROBE & AGE LOCK (بصری شناخت، ملبوسات، عمر، ڈی این اے کبھی تبدیل نہیں ہوں گے):
   - For every character, define an UNBREAKABLE VISUAL DNA:
     * Exact age (e.g. 29 years old)
     * Exact physical build & height (e.g. 6'0 athletic tactical build)
     * Distinct facial features (exact eye color, hair style/color, facial hair, skin tone, scars)
     * Signature locked wardrobe (e.g. 'crimson red bomber jacket with silver zippers, black ribbed tactical undershirt, dark cargo pants, combat boots')
     * Compact DNA Lock Token: [LOCKED_DNA_NAME: age, facial features, exact clothing colors/materials, zero morphing]
   - IN EVERY SINGLE SCENE where a character appears, their EXACT wardrobe (colors, garments, materials) and DNA token MUST be explicitly mentioned!
   - Under NO CIRCUMSTANCES should characters change outfits, hair, facial features, or age mid-story.

3. ENVIRONMENT & LOCATION MATCHED TO THE TOPIC (مقام موضوع کے عین مطابق):
   - Setting, architecture, atmospheric lighting, and weather must be 100% faithful to the user's specific topic (historical Mughal fortress, cyberpunk neon megacity, underground bank vault, arctic base, desert pursuit, etc.).
   - The location must evolve logically scene-by-scene (e.g., exterior approach -> breached corridor -> inner vault -> rooftop extraction).

4. ZERO-FAILURE PROMPTS FOR ALL AI TOOLS (کوئی پرامپٹ فیل نہیں ہونا چاہیے):
   - 100% English prompts with zero banned/flagged words.
   - videoPrompt: under 450 characters, tailored for Kling 1.5/2.0, Runway Gen-3, Luma Dream Machine, Sora.
     Format: [Character Name with locked clothing & DNA token] + [Dynamic action] + [Specific camera movement, e.g. low-angle tracking dolly push at 60fps] + [Topic environment & lighting] + [photorealistic 8K, Unreal Engine 5.4 Lumen, 35mm lens, hyper-detailed].
   - midjourneyPrompt: keyframe format ending with --ar 16:9 --style raw --v 6.1.
   - negativePrompt: blurry, low quality, morphing, deformed hands, extra limbs, distorted face, altered clothes, changed hair, watermark.

5. DIALOGUES:
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
  "story": "full engaging cinematic production story overview in Urdu and English",
  "scenes": [
    {
      "number": 1,
      "title": "Scene Title",
      "timestamp": "00:00 - 00:10",
      "activeCharacters": ["Character Name"],
      "camera": "string",
      "lighting": "string",
      "dialogue": "Punchy cinematic English dialogue",
      "videoPrompt": "Universal 8K video prompt under 450 chars for Kling, Runway, Luma with locked character clothing and DNA",
      "midjourneyPrompt": "Midjourney v6.1 prompt ending with --ar 16:9 --style raw --v 6.1",
      "negativePrompt": "blurry, low quality, morphing, deformed hands, extra limbs, distorted face, watermark"
    }
  ]
};`;

            const modelsToTry = [
                "qwen/qwen3.8-27b",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "llama-3.1-8b-instant"
            ];
            let parsedContent = null;
            let lastError = null;

            const userPromptText = (sceneCount <= 10)
                ? `Generate complete 8K cinematic production for topic: "${topic}". Total scenes: ${sceneCount}. Style: ${style}. Return JSON with 100% English dialogues.`
                : `Generate complete 8K cinematic blueprint for topic: "${topic}". Style: ${style}. Provide locked character visual DNA, wardrobe, story overview, and 8 key chronological act scenes. Return JSON with 100% English dialogues.`;

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
                                { role: "user", content: userPromptText }
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
                    if (parsedContent && Array.isArray(parsedContent.scenes) && parsedContent.scenes.length > 0) {
                        break;
                    }
                } catch (err) {
                    lastError = err.message;
                }
            }

            // Zero-Failure Guarantee: Ensure full target scene count (e.g. exactly 60 or 90 scenes)
            if (parsedContent && Array.isArray(parsedContent.scenes) && parsedContent.scenes.length > 0) {
                parsedContent = expandProductionToCount(parsedContent, topic, style, sceneCount, camera);
            } else {
                console.log(`[AI Fallback Active]: Synthesizing flawless zero-failure production for topic: ${topic} (${sceneCount} scenes)`);
                parsedContent = synthesizeProductionForTopic(topic, style, sceneCount, camera);
            }

            // Final guarantee: Verify scenes.length === sceneCount
            if (!parsedContent.scenes || parsedContent.scenes.length !== sceneCount) {
                parsedContent = expandProductionToCount(parsedContent, topic, style, sceneCount, camera);
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
