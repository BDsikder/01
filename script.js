// ================================================================
// BISNU IoT — script.js
// ================================================================

// Service Worker রেজিস্ট্রেশন (PWA সাপোর্ট)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js')
      .then(function(registration) {
        console.log('✅ Service Worker registered:', registration.scope);
      })
      .catch(function(err) {
        console.warn('⚠️ Service Worker registration failed:', err);
      });
  });
}

// ============================================================
// Firebase কনফিগারেশন — localStorage থেকে লোড অথবা ডিফল্ট
// ============================================================
function getFirebaseConfig() {
  try {
    const saved = localStorage.getItem('bisnu_fb_config');
    if (saved) {
      // Unicode-safe decode
      const decoded = decodeURIComponent(escape(atob(saved)));
      const cfg = JSON.parse(decoded);
      if (cfg && cfg.apiKey && cfg.databaseURL) return cfg;
    }
  } catch(e) { console.warn('Firebase config load error:', e); }
  // ডিফল্ট কনফিগ
  return {
    apiKey: "AIzaSyATDfnefdyPAzBNKZY4VM5ja8K2-63PC-U",
    authDomain: "home-server-346b6.firebaseapp.com",
    databaseURL: "https://home-server-346b6-default-rtdb.firebaseio.com",
    projectId: "home-server-346b6",
    storageBucket: "home-server-346b6.appspot.com",
    messagingSenderId: "531234227336",
    appId: "1:531234227336:web:f57f700dd6baaed4358b3d",
    measurementId: "G-QDWVP34FSX"
  };
}

const firebaseConfig = getFirebaseConfig();

// Firebase ইনিশিয়ালাইজ করুন
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const messaging = firebase.messaging();

// অপারেটিং পাসওয়ার্ড — Firebase থেকে লোড হবে, না পেলে ডিফল্ট
var correctOperatingPassword = "000";

// Firebase Auth state change হলে user-এর saved password লোড করো
auth.onAuthStateChanged(function(user) {
    if (user) {
        database.ref('users/' + user.uid + '/operatingPassword').once('value', snap => {
            if (snap.exists() && snap.val()) {
                correctOperatingPassword = snap.val();
            }
        });
    }
    // লগইন/লগআউট উভয় অবস্থায় adminPassword লোড করো
    database.ref('system/adminPassword').once('value', snap => {
        if (snap.exists() && snap.val()) correctAdminPassword = snap.val();
    }).catch(() => {});
});

// --- গ্লোবাল ভ্যারিয়েবল এবং ডিফল্ট পাথ ---
let databaseStructure = {};
let pathMappings = {};
let activeListeners = [];
let logicOverrides = {}; 
let previousDeviceStates = {}; 
let isNotificationMuted = localStorage.getItem('isNotificationMuted') === 'true';
let currentTempData = {};
let tempSensorHistory = {}; 
let largeTempChartInstance = null;
let currentNotes = {}; // Stores fetched notes
let editingNoteId = null; // Stores ID of note being edited

const defaultPaths = {
    devices_root: 'devices',
    device1_data: 'devices/device1',
    device2_data: 'devices/device2',
    device3_data: 'devices/device3',
    device4_data: 'devices/device4',
    temperature_data: 'devices', 
    device_metadata: 'device_metadata',
    energymonitoring_root: 'energymonitoring',
    energymonitoring_history: 'energyHistory',
    timers: 'timers',
    automation_rules: 'automationRules',
    logic_gate_rules: 'logicGateRules',
    logic_gate_overrides: 'logic_gate_overrides',
    audit_log: 'auditLog',
    device_activity_log: 'deviceActivityLog',
    system_status: 'system_status/device1',
    scenes: 'scenes',
    custom_pages: 'custom_pages',
    diagram_notes: 'diagram_notes' // NEW PATH
};

let editingAutomationRuleId = null;
let editingLogicRuleId = null;

// --- Helper Functions ---
function logAuditEvent(action, actor = null) {
    const user = auth.currentUser;
    if (user || actor) {
        const userEmail = actor ? actor : user.email;
        const logEntry = { user: userEmail, action: action, timestamp: firebase.database.ServerValue.TIMESTAMP };
        const logPath = getPathFor('audit_log');
        if (logPath) database.ref(logPath).push(logEntry);
    }
}

function toggleForms() {
    const loginBox = document.getElementById('login-box');
    const registrationBox = document.getElementById('registration-box');
    document.getElementById('login-error').innerText = '';
    document.getElementById('register-error').innerText = '';
    loginBox.classList.toggle('form-active');
    registrationBox.classList.toggle('form-active');
}

function openRegistrationSecurityModal() {
    document.getElementById('registrationSecurityModal').style.display = 'flex';
    document.getElementById('regSecurityInput').value = '';
    document.getElementById('regSecurityInput').focus();
    document.getElementById('regSecurityError').innerText = '';
}

function closeRegistrationSecurityModal() {
    document.getElementById('registrationSecurityModal').style.display = 'none';
}

// অ্যাডমিন রেজিস্ট্রেশন পাসওয়ার্ড — Firebase থেকে লোড, না পেলে ডিফল্ট
var correctAdminPassword = '00$';

// Firebase থেকে adminPassword লোড করো
function loadAdminPassword() {
    database.ref('system/adminPassword').once('value', snap => {
        if (snap.exists() && snap.val()) correctAdminPassword = snap.val();
    }).catch(() => {});
}

function checkRegistrationSecurity() {
    const input = document.getElementById('regSecurityInput').value;
    if (input === correctAdminPassword) {
        closeRegistrationSecurityModal();
        toggleForms();
    } else {
        document.getElementById('regSecurityError').innerText = '❌ ভুল পাসওয়ার্ড!';
        const box = document.querySelector('#registrationSecurityModal .password-modal-box');
        box.classList.add('shake-animation');
        setTimeout(() => box.classList.remove('shake-animation'), 500);
    }
}

// ============================================================
// Reset Admin Password Functions
// ============================================================
function openResetAdminPasswordModal() {
    // registration modal বন্ধ করো
    document.getElementById('registrationSecurityModal').style.display = 'none';
    // রিসেট
    document.getElementById('rapEmailInput').value = '';
    document.getElementById('rapFirebasePassword').value = '';
    document.getElementById('rapEmailError').innerText = '';
    document.getElementById('rapNewPassword').value = '';
    document.getElementById('rapConfirmPassword').value = '';
    document.getElementById('rapNewError').innerText = '';
    document.getElementById('rap-step1').style.display = 'block';
    document.getElementById('rap-step2').style.display = 'none';
    document.getElementById('resetAdminPasswordModal').style.display = 'flex';
    setTimeout(() => document.getElementById('rapEmailInput').focus(), 100);
}

function closeResetAdminPasswordModal() {
    document.getElementById('resetAdminPasswordModal').style.display = 'none';
    // registration modal ফিরিয়ে দাও
    document.getElementById('registrationSecurityModal').style.display = 'flex';
}

function verifyAdminForReset() {
    const email = document.getElementById('rapEmailInput').value.trim();
    const fbPassword = document.getElementById('rapFirebasePassword').value;
    const errorDiv = document.getElementById('rapEmailError');
    errorDiv.innerText = '';

    if (!email || !fbPassword) {
        errorDiv.innerText = '❌ জিমেইল এবং Firebase পাসওয়ার্ড উভয়ই দিন।';
        return;
    }

    // Firebase re-authentication দিয়ে যাচাই করো
    const credential = firebase.auth.EmailAuthProvider.credential(email, fbPassword);
    const currentUser = auth.currentUser;

    if (currentUser) {
        // লগইন অবস্থায় — re-authenticate
        currentUser.reauthenticateWithCredential(credential)
            .then(() => {
                document.getElementById('rap-step1').style.display = 'none';
                document.getElementById('rap-step2').style.display = 'block';
                setTimeout(() => document.getElementById('rapNewPassword').focus(), 100);
            })
            .catch(() => {
                errorDiv.innerText = '❌ জিমেইল বা পাসওয়ার্ড সঠিক নয়।';
                shakeBox('#resetAdminPasswordModal .password-modal-box');
            });
    } else {
        // লগআউট অবস্থায় — signInWithEmailAndPassword দিয়ে যাচাই
        auth.signInWithEmailAndPassword(email, fbPassword)
            .then(() => {
                document.getElementById('rap-step1').style.display = 'none';
                document.getElementById('rap-step2').style.display = 'block';
                setTimeout(() => document.getElementById('rapNewPassword').focus(), 100);
            })
            .catch(() => {
                errorDiv.innerText = '❌ জিমেইল বা Firebase পাসওয়ার্ড সঠিক নয়।';
                shakeBox('#resetAdminPasswordModal .password-modal-box');
            });
    }
}

function saveNewAdminPassword() {
    const newPass = document.getElementById('rapNewPassword').value;
    const confirmPass = document.getElementById('rapConfirmPassword').value;
    const errorDiv = document.getElementById('rapNewError');
    errorDiv.innerText = '';

    if (!newPass) { errorDiv.innerText = '❌ নতুন পাসওয়ার্ড লিখুন।'; return; }
    if (newPass.length < 3) { errorDiv.innerText = '❌ পাসওয়ার্ড কমপক্ষে ৩ অক্ষরের হতে হবে।'; return; }
    if (newPass !== confirmPass) { errorDiv.innerText = '❌ পাসওয়ার্ড দুটি মিলছে না।'; return; }

    // Firebase-এ system/adminPassword তে সেভ করো
    database.ref('system/adminPassword').set(newPass)
        .then(() => {
            correctAdminPassword = newPass;
            showToast('✅ অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!', 'success');
            document.getElementById('resetAdminPasswordModal').style.display = 'none';
            document.getElementById('registrationSecurityModal').style.display = 'none';
            logAuditEvent('অ্যাডমিন রেজিস্ট্রেশন পাসওয়ার্ড পরিবর্তন করা হয়েছে।');
        })
        .catch(err => {
            errorDiv.innerText = '❌ সেভ করতে সমস্যা: ' + err.message;
        });
}

function shakeBox(selector) {
    const box = document.querySelector(selector);
    if (!box) return;
    box.classList.add('shake-animation');
    setTimeout(() => box.classList.remove('shake-animation'), 500);
}

// ============================================================
// Reset Operating Password Functions
// ============================================================
let _ropReturnModal = null; // কোন মোডাল থেকে এসেছে

function openResetOperatingPasswordModal(returnModalId) {
    _ropReturnModal = returnModalId || null;
    // returnModal লুকাও
    if (_ropReturnModal) document.getElementById(_ropReturnModal).style.display = 'none';

    // রিসেট করো
    document.getElementById('ropEmailInput').value = '';
    document.getElementById('ropEmailError').innerText = '';
    document.getElementById('ropNewPassword').value = '';
    document.getElementById('ropConfirmPassword').value = '';
    document.getElementById('ropNewError').innerText = '';
    document.getElementById('rop-step1').style.display = 'block';
    document.getElementById('rop-step2').style.display = 'none';

    document.getElementById('resetOperatingPasswordModal').style.display = 'flex';
    setTimeout(() => document.getElementById('ropEmailInput').focus(), 100);
}

function closeResetOperatingPasswordModal() {
    document.getElementById('resetOperatingPasswordModal').style.display = 'none';
    // ফিরে যাওয়ার মোডাল খোলো
    if (_ropReturnModal) {
        document.getElementById(_ropReturnModal).style.display = 'flex';
        _ropReturnModal = null;
    }
}

function verifyEmailForReset() {
    const email = document.getElementById('ropEmailInput').value.trim();
    const errorDiv = document.getElementById('ropEmailError');
    errorDiv.innerText = '';

    if (!email) {
        errorDiv.innerText = '❌ দয়া করে জিমেইল লিখুন।';
        return;
    }

    // Firebase Auth থেকে বর্তমান লগইন ইউজারের ইমেইল যাচাই করো
    const currentUser = auth.currentUser;
    if (!currentUser) {
        errorDiv.innerText = '❌ আপনি লগইন অবস্থায় নেই।';
        return;
    }

    if (currentUser.email.toLowerCase() !== email.toLowerCase()) {
        errorDiv.innerText = '❌ ইমেইলটি আপনার লগইন একাউন্টের সাথে মিলছে না।';
        const box = document.querySelector('#resetOperatingPasswordModal .password-modal-box');
        box.classList.add('shake-animation');
        setTimeout(() => box.classList.remove('shake-animation'), 500);
        return;
    }

    // যাচাই সফল — ধাপ ২ দেখাও
    document.getElementById('rop-step1').style.display = 'none';
    document.getElementById('rop-step2').style.display = 'block';
    setTimeout(() => document.getElementById('ropNewPassword').focus(), 100);
}

function saveNewOperatingPassword() {
    const newPass = document.getElementById('ropNewPassword').value;
    const confirmPass = document.getElementById('ropConfirmPassword').value;
    const errorDiv = document.getElementById('ropNewError');
    errorDiv.innerText = '';

    if (!newPass) {
        errorDiv.innerText = '❌ নতুন পাসওয়ার্ড লিখুন।';
        return;
    }
    if (newPass.length < 3) {
        errorDiv.innerText = '❌ পাসওয়ার্ড কমপক্ষে ৩ অক্ষরের হতে হবে।';
        return;
    }
    if (newPass !== confirmPass) {
        errorDiv.innerText = '❌ পাসওয়ার্ড দুটি মিলছে না।';
        return;
    }

    // correctOperatingPassword আপডেট করো (runtime এ)
    // Firebase-এ সেভ করো যাতে পেজ রিলোডেও থাকে
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (uid) {
        database.ref('users/' + uid + '/operatingPassword').set(newPass)
            .then(() => {
                // runtime variable আপডেট — এখন থেকে নতুন পাসওয়ার্ড কাজ করবে
                correctOperatingPassword = newPass;
                showToast('✅ অপারেটিং পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!', 'success');
                closeResetOperatingPasswordModal();
                logAuditEvent('অপারেটিং পাসওয়ার্ড পরিবর্তন করেছেন।');
            })
            .catch(err => {
                errorDiv.innerText = '❌ সেভ করতে সমস্যা: ' + err.message;
            });
    } else {
        errorDiv.innerText = '❌ ইউজার সেশন পাওয়া যাচ্ছে না।';
    }
}

function openForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'flex';
    document.getElementById('forgotEmailInput').value = '';
    document.getElementById('forgotPasswordError').innerText = '';
    document.getElementById('forgotPasswordSuccess').style.display = 'none';
    document.getElementById('forgotPasswordSuccess').innerText = '';
    setTimeout(() => document.getElementById('forgotEmailInput').focus(), 100);
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'none';
}

function sendPasswordReset() {
    const email = document.getElementById('forgotEmailInput').value.trim();
    const errorDiv = document.getElementById('forgotPasswordError');
    const successDiv = document.getElementById('forgotPasswordSuccess');
    errorDiv.innerText = '';
    successDiv.style.display = 'none';

    if (!email) {
        errorDiv.innerText = '❌ দয়া করে আপনার জিমেইল লিখুন।';
        return;
    }

    auth.sendPasswordResetEmail(email)
        .then(() => {
            successDiv.innerText = '✅ পাসওয়ার্ড রিসেটের লিঙ্ক আপনার ' + email + ' এ পাঠানো হয়েছে। আপনার ইনবক্স বা স্প্যাম ফোল্ডার চেক করুন।';
            successDiv.style.display = 'block';
            errorDiv.innerText = '';
            setTimeout(() => closeForgotPasswordModal(), 5000);
        })
        .catch((error) => {
            if (error.code === 'auth/user-not-found') {
                errorDiv.innerText = '❌ এই জিমেইলে কোনো একাউন্ট নেই।';
            } else if (error.code === 'auth/invalid-email') {
                errorDiv.innerText = '❌ ইমেল ফরম্যাট সঠিক নয়।';
            } else if (error.code === 'auth/too-many-requests') {
                errorDiv.innerText = '❌ অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।';
            } else {
                errorDiv.innerText = '❌ একটি সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।';
            }
            const box = document.querySelector('#forgotPasswordModal .password-modal-box');
            box.classList.add('shake-animation');
            setTimeout(() => box.classList.remove('shake-animation'), 500);
        });
}

// ============================================================
// Firebase Config Modal Functions
// ============================================================
function openFirebaseConfigModal() {
    document.getElementById('firebaseConfigModal').style.display = 'flex';
    document.getElementById('firebaseConfigError').innerText = '';
    document.getElementById('firebaseConfigTextarea').value = '';
    // বর্তমান databaseURL দেখাও
    const currentCfg = getFirebaseConfig();
    const dbEl = document.getElementById('firebase-current-db');
    if (dbEl) dbEl.innerText = currentCfg.databaseURL || currentCfg.projectId || 'অজানা';
}

function closeFirebaseConfigModal() {
    document.getElementById('firebaseConfigModal').style.display = 'none';
}

function saveFirebaseConfig() {
    const raw = document.getElementById('firebaseConfigTextarea').value;
    const errorDiv = document.getElementById('firebaseConfigError');
    errorDiv.innerText = '';

    if (!raw || !raw.trim()) {
        errorDiv.innerText = '❌ দয়া করে firebaseConfig কোডটি পেস্ট করুন।';
        return;
    }

    try {
        // ════════════════════════════════════════════════════
        // ধাপ ১: সব invisible/control characters পরিষ্কার করো
        // Firebase Console থেকে copy করলে এগুলো আসে
        // ════════════════════════════════════════════════════
        let cleaned = raw
            .replace(/\r\n/g, '\n')          // Windows line endings
            .replace(/\r/g, '\n')             // old Mac line endings
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control chars (tab \t আর newline \n ছাড়া)
            .replace(/\u00A0/g, ' ')          // non-breaking space → normal space
            .replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width chars সরাও

        // ════════════════════════════════════════════════════
        // ধাপ ২: Regex দিয়ে না করে — সরাসরি key-value extract করো
        // এটি সবচেয়ে নির্ভরযোগ্য পদ্ধতি
        // ════════════════════════════════════════════════════
        const knownKeys = ['apiKey','authDomain','databaseURL','projectId','storageBucket','messagingSenderId','appId','measurementId'];
        const cfg = {};

        knownKeys.forEach(key => {
            // pattern: key: "value" অথবা key: 'value'
            const re = new RegExp(key + '\\s*:\\s*["\']([^"\']+)["\']');
            const m = cleaned.match(re);
            if (m) cfg[key] = m[1].trim();
        });

        // ════════════════════════════════════════════════════
        // ধাপ ৩: প্রয়োজনীয় ফিল্ড যাচাই
        // ════════════════════════════════════════════════════
        const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
        const missing = required.filter(k => !cfg[k]);
        if (missing.length > 0) {
            errorDiv.innerText = '❌ এই ফিল্ডগুলো খুঁজে পাওয়া যাচ্ছে না: ' + missing.join(', ') + ' — Firebase Console থেকে সম্পূর্ণ কোড কপি করুন।';
            return;
        }

        // ════════════════════════════════════════════════════
        // ধাপ ৪: Unicode-safe encode → localStorage সেভ
        // ════════════════════════════════════════════════════
        const jsonFinal = JSON.stringify(cfg);
        const encoded = btoa(unescape(encodeURIComponent(jsonFinal)));
        localStorage.setItem('bisnu_fb_config', encoded);

        // ════════════════════════════════════════════════════
        // ধাপ ৫: সফলতার বার্তা ও রিলোড
        // ════════════════════════════════════════════════════
        showToast('✅ Firebase কনফিগ সেভ হয়েছে! পেজ রিলোড হচ্ছে...', 'success');
        closeFirebaseConfigModal();
        setTimeout(() => { window.location.reload(); }, 1500);

    } catch(e) {
        console.error('Firebase config save error:', e);
        errorDiv.innerText = '❌ একটি অপ্রত্যাশিত সমস্যা হয়েছে: ' + e.message;
        const box = document.querySelector('#firebaseConfigModal .password-modal-box');
        box.classList.add('shake-animation');
        setTimeout(() => box.classList.remove('shake-animation'), 500);
    }
}

function loginWithFirebase() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("login-error");
    const loginBox = document.getElementById("login-box");

    if (!email || !password) {
        errorDiv.innerText = "❌ দয়া করে ইমেল এবং পাসওয়ার্ড দিন।";
        loginBox.classList.add('shake-animation');
        setTimeout(() => loginBox.classList.remove('shake-animation'), 500);
        return;
    }
    
    errorDiv.innerText = "";

    auth.signInWithEmailAndPassword(email, password)
        .then(async (userCredential) => {
            logAuditEvent("সিস্টেমে সফলভাবে লগইন করেছেন।");
            const notificationSound = document.getElementById('notification-sound');
            if (notificationSound && !isNotificationMuted) { 
                notificationSound.muted = true;
                notificationSound.play().then(() => {
                    notificationSound.pause();
                    notificationSound.currentTime = 0;
                    notificationSound.muted = false;
                }).catch(e => console.error("Audio unlock failed", e));
            }

            document.getElementById('global-loader').style.display = 'flex';

            const loginContainer = document.getElementById("login-screen");
            const appContainer = document.getElementById("app");
            loginContainer.style.animation = "fadeOut 0.5s ease forwards";
            
            await loadPathMappings();
            await fetchDatabaseSchema();
            
            setTimeout(() => {
                document.getElementById('global-loader').style.display = 'none';
                loginContainer.style.display = "none";
                appContainer.style.display = "block";
                appContainer.style.animation = "fadeIn 0.5s ease forwards";
                setupFirebaseListeners();
                initializeCharts();
                loadThemePreference();
                loadBackgroundPreference();
                loadSoundPreference();
                loadAdminPassword();
                initEnergyCharts();
                initAdvancedEnergyChart();
                setInterval(() => {
                  updateAllTimerDisplays();
                  processTimerExecution();
                }, 1000);
                setInterval(updateAllDateTimeDisplays, 1000);
                updateTriggerOptions();
                initializeNotifications();
                initLogicGateInputs();
            }, 500);
        })
        .catch((error) => {
            errorDiv.innerText = error.code === 'auth/user-disabled' ? "❌ আপনার একাউন্টটি ব্লক করা হয়েছে।" : "❌ ইমেল বা পাসওয়ার্ড সঠিক নয়।";
            loginBox.classList.add('shake-animation');
            setTimeout(() => loginBox.classList.remove('shake-animation'), 500);
        });
}

function registerWithFirebase() {
    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const errorDiv = document.getElementById("register-error");
    const registrationBox = document.getElementById("registration-box");

    if (!username || !email || !password || !confirmPassword) {
        errorDiv.innerText = "❌ অনুগ্রহ করে সবকটি ফিল্ড পূরণ করুন।";
    } else if (password !== confirmPassword) {
        errorDiv.innerText = "❌ পাসওয়ার্ড দুটি মেলেনি।";
    } else if (password.length < 6) {
        errorDiv.innerText = "❌ পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।";
    } else {
        errorDiv.innerText = "";
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                user.updateProfile({ displayName: username });
                database.ref('users/' + user.uid).set({ username: username, email: email, createdAt: firebase.database.ServerValue.TIMESTAMP });
                showToast('রেজিস্ট্রেশন সফল হয়েছে! এখন লগইন করুন।', 'success');
                toggleForms();
            })
            .catch((error) => {
                if (error.code === 'auth/email-already-in-use') errorDiv.innerText = "❌ এই ইমেলটি ইতিমধ্যে ব্যবহৃত হচ্ছে।";
                else if (error.code === 'auth/weak-password') errorDiv.innerText = "❌ পাসওয়ার্ডটি যথেষ্ট শক্তিশালী নয়।";
                else errorDiv.innerText = "❌ রেজিস্ট্রেশনে একটি সমস্যা হয়েছে।";
            });
    }
    if (errorDiv.innerText) {
        registrationBox.classList.add('shake-animation');
        setTimeout(() => registrationBox.classList.remove('shake-animation'), 500);
    }
}

function logout() {
    logAuditEvent("সিস্টেম থেকে লগআউট করেছেন।");
    // গ্রাফ মোড স্টেট সম্পূর্ণ রিসেট (memory + localStorage)
    if (typeof graphModeLiveInterval !== 'undefined' && graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (typeof graphModeFirebaseListener !== 'undefined' && graphModeFirebaseListener) { try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e){} graphModeFirebaseListener = null; graphModeFirebaseCallback = null; }
    if (typeof graphModeFirebaseListener2 !== 'undefined' && graphModeFirebaseListener2) { try { graphModeFirebaseListener2.off(); } catch(e){} graphModeFirebaseListener2 = null; }
    if (typeof graphModeChart !== 'undefined' && graphModeChart) { try { graphModeChart.destroy(); } catch(e){} graphModeChart = null; }
    if (typeof graphModeSelectedPage !== 'undefined') { graphModeSelectedPage = null; graphModeSelectedFields = []; graphModeData = { labels: [], datasets: [] }; graphModeDynamicPages = {}; graphModeInitialized = false; }
    // localStorage থেকে গ্রাফ state মুছো (লগআউটে পুনরুদ্ধার হবে না)
    ['gm_chartType','gm_selectedPage','gm_selectedFields','gm_chartData','gm_gm-start-date','gm_gm-start-time','gm_gm-end-date','gm_gm-end-time'].forEach(k => localStorage.removeItem(k));
    auth.signOut().then(() => {
        document.getElementById("app").style.animation = "fadeOut 0.5s ease forwards";
        setTimeout(() => window.location.reload(), 500);
    }).catch(error => console.error("লগআউট করার সময় ত্রুটি:", error));
}

function getPathFor(componentId) { return pathMappings[componentId] || defaultPaths[componentId]; }

async function loadPathMappings() {
    const user = auth.currentUser;
    if (!user) { pathMappings = {}; return; }
    const snapshot = await database.ref(`ui_path_mappings/${user.uid}`).once('value');
    pathMappings = snapshot.val() || {};
    applyUiHighlights();
}

async function fetchDatabaseSchema() {
    try {
        const snapshot = await database.ref('/').once('value');
        databaseStructure = snapshot.val() || {};
    } catch (error) {
        console.error("Error fetching Firebase schema:", error);
        showToast("Firebase schema পড়তে সমস্যা হয়েছে।", "error");
    }
}

function applyUiHighlights() {
    document.querySelectorAll('[data-component-id]').forEach(el => {
        const componentId = el.dataset.componentId;
        if (pathMappings[componentId] && pathMappings[componentId] !== defaultPaths[componentId]) {
            el.classList.add('path-configured');
        } else {
            el.classList.remove('path-configured');
        }
    });
}

function openPathSelector(componentId, event) {
    event.stopPropagation();
    const popover = document.getElementById('path-selector-popover');
    popover.dataset.componentId = componentId;
    const currentPath = getPathFor(componentId);
    const pathSegments = currentPath ? currentPath.split('/') : [];
    rebuildPathSelectors(pathSegments);
    const iconRect = event.target.getBoundingClientRect();
    popover.style.display = 'flex';
    popover.style.left = `${iconRect.left - popover.offsetWidth}px`;
    popover.style.top = `${iconRect.bottom + window.scrollY}px`;
}

function rebuildPathSelectors(currentSegments = []) {
    const container = document.getElementById('path-segments-container');
    container.innerHTML = '';
    let currentLevelObject = databaseStructure;

    for (let i = 0; i < currentSegments.length; i++) {
        const segment = currentSegments[i];
        if (typeof currentLevelObject !== 'object' || currentLevelObject === null) break;
        const select = document.createElement('select');
        select.dataset.level = i;
        Object.keys(currentLevelObject).forEach(key => {
            const option = document.createElement('option');
            option.value = key; option.textContent = key;
            if (key === segment) option.selected = true;
            select.appendChild(option);
        });
        select.addEventListener('change', (e) => {
            const level = parseInt(e.target.dataset.level);
            const newSegments = [];
            container.querySelectorAll('select').forEach(s => { if(parseInt(s.dataset.level) <= level) newSegments.push(s.value); });
            rebuildPathSelectors(newSegments);
        });
        container.appendChild(select);
        currentLevelObject = currentLevelObject[segment];
    }
    
    if (typeof currentLevelObject === 'object' && currentLevelObject !== null && Object.keys(currentLevelObject).length > 0) {
        const select = document.createElement('select');
        select.dataset.level = currentSegments.length;
        const firstOption = document.createElement('option');
        firstOption.value = ""; firstOption.textContent = "একটি নির্বাচন করুন..."; select.appendChild(firstOption);
        Object.keys(currentLevelObject).forEach(key => { const option = document.createElement('option'); option.value = key; option.textContent = key; select.appendChild(option); });
        select.addEventListener('change', (e) => {
            const level = parseInt(e.target.dataset.level);
            const newSegments = [];
            container.querySelectorAll('select').forEach(s => { if(parseInt(s.dataset.level) < level) newSegments.push(s.value); });
            if (e.target.value) newSegments.push(e.target.value);
            rebuildPathSelectors(newSegments);
        });
        container.appendChild(select);
    }
}

function closePathSelector() { document.getElementById('path-selector-popover').style.display = 'none'; }

async function savePathMapping() {
    const user = auth.currentUser;
    if (!user) return showToast("এই সুবিধাটি শুধুমাত্র লগইন করা ব্যবহারকারীদের জন্য।", "error");
    const popover = document.getElementById('path-selector-popover');
    const componentId = popover.dataset.componentId;
    const segments = [];
    document.getElementById('path-segments-container').querySelectorAll('select').forEach(select => { if (select.value) segments.push(select.value); });
    const finalPath = segments.join('/');
    await database.ref(`ui_path_mappings/${user.uid}/${componentId}`).set(finalPath);
    showToast("Path সফলভাবে সংরক্ষণ করা হয়েছে!", "success");
    closePathSelector();
    await loadPathMappings();
    setupFirebaseListeners();
}

document.addEventListener('click', function(event) {
    const popover = document.getElementById('path-selector-popover');
    if (popover.style.display === 'flex' && !popover.contains(event.target) && !event.target.classList.contains('path-config-icon')) closePathSelector();
});

  const deviceCharts = {};
  let energyCharts = {};
  let advancedEnergyChart = null;
  let sensorHistoricalCharts = {};
  let selectedMetric = 'voltage';
  let selectedTimeRange = 30;
  let historicalData = {};
  let relayOperationContext = null;
  let timerOperationContext = null;
  let allTimersData = {};
  let currentBackgroundIndex = 0;
  const totalBackgrounds = 11;
  let currentEnergyData = {};
  let currentDeviceStates = {};
  let automationRules = {};
  let logicGateRules = {};
  let relayNames = {};
  let deviceMetadata = {};
  let currentPageToEdit = null;
  let actionToConfirmCallback = null;
  let tabSortable = null;
  let isSortingLocked = true;

  function openImageModal(src, cap) { document.getElementById('imageModal').style.display = "flex"; document.getElementById('modalImage').src = src; document.getElementById('modalCaption').innerHTML = cap; }
  function closeImageModal() { document.getElementById('imageModal').style.display = "none"; }
  window.onclick = e => { if (e.target === document.getElementById('imageModal')) closeImageModal(); };
  function createParticles() { const cont = document.getElementById('particles'); if(cont.children.length > 0) return; for (let i=0; i<30; i++) { const p = document.createElement('div'); p.className = 'particle'; const size = Math.random()*10+5; p.style.width=`${size}px`; p.style.height=`${size}px`; p.style.left=`${Math.random()*100}%`; p.style.top=`${Math.random()*100}%`; p.style.animationDelay=`${Math.random()*15}s`; p.style.animationDuration=`${Math.random()*10+10}s`; p.style.opacity=Math.random()*0.5+0.1; cont.appendChild(p); } }
  
  // showPage defined below with graph mode support
  
  function controlRelay(device, relay, element) {
      const state = element.checked;
      const deviceRootPath = getPathFor('devices_root');
      const path = `${deviceRootPath}/${device}`;
      const overridePath = `${getPathFor('logic_gate_overrides')}/${device}/${relay}`;
      database.ref(overridePath).set(firebase.database.ServerValue.TIMESTAMP);
      database.ref(path).update({ [relay]: state });
      const name = (relayNames[device]?.[relay]) || relay;
      const msg = `${device} এর ${name} ${state ? 'চালু' : 'বন্ধ'} করা হয়েছে (ম্যানুয়াল)`;
      addLogEntry(device, msg, state ? 'success' : 'error');
      logAuditEvent(`ডিভাইস ${device.replace('device','')} এর '${name}' ${state ? 'চালু' : 'বন্ধ'} করেছেন (ম্যানুয়াল ওভাররাইড)।`);
  }
      try { if(typeof recordRelayEventForGraph === 'function') recordRelayEventForGraph(device, relay, state); } catch(e) {}

  function controlDevice(device, load, state) {
      const stateText = state === 1 ? 'চালু' : (state === 2 ? 'সতর্কতা মোডে' : 'বন্ধ');
      const path = getPathFor(`${device}_data`);
      if(!path) return showToast(`Error: Path for ${device} is not configured!`, 'error');
      const overridePath = `${getPathFor('logic_gate_overrides')}/${device}/${load}`;
      database.ref(overridePath).set(firebase.database.ServerValue.TIMESTAMP);
      database.ref(path).update({ [load]: state });
      addLogEntry(device, `${device} এর ${load} ${stateText} করা হয়েছে (ম্যানুয়াল)`, state === 1 ? 'success' : state === 2 ? 'warning' : 'error');
      logAuditEvent(`ডিভাইস ${device.replace('device','')} এর '${load}' ${stateText} সেট করেছেন (ম্যানুয়াল ওভাররাইড)।`);
      try { if(typeof recordRelayEventForGraph === 'function') recordRelayEventForGraph(device, load, state); } catch(e) {}
  }
  
  function clearManualOverride(device, relay) {
      const overridePath = `${getPathFor('logic_gate_overrides')}/${device}/${relay}`;
      database.ref(overridePath).remove().then(() => {
          showToast(`'${relay}' এর জন্য অটোমেশন আবার চালু করা হয়েছে।`, 'success');
          logAuditEvent(`'${relay}' এর ম্যানুয়াল ওভাররাইড বাতিল করেছেন। অটোমেশন সক্রিয়।`);
      });
  }

  function addLogEntry(device, message, type) {
    const logId = `device${device.replace('device','')}-logs`;
    const logEl = document.getElementById(logId);
    if (!logEl) return;
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<div class="log-time">${new Date().toLocaleString('bn-BD')}</div><div class="log-message log-${type}">${message}</div>`;
    logEl.insertBefore(item, logEl.firstChild);
    if(logEl.children.length > 50) logEl.removeChild(logEl.lastChild);
  }

  function initializeCharts() {
    for(let i = 1; i <= 4; i++) {
      const ctx = document.getElementById(`device${i}-chart`).getContext('2d');
      if (deviceCharts[`device${i}`]) deviceCharts[`device${i}`].destroy();
      deviceCharts[`device${i}`] = new Chart(ctx, { type: 'doughnut', data: { labels: ['এক্টিভ', 'সতর্কতা', 'ইনএক্টিভ'], datasets: [{ data: [0, 0, 16], backgroundColor: ['rgba(46,204,113,0.8)','rgba(243,156,18,0.8)','rgba(231,76,60,0.8)'], borderColor: 'rgba(255,255,255,0.1)', borderWidth: 2 }] }, options: { responsive: true } });
    }
  }
  
  function updateSingleDevicePage(deviceId, deviceData) {
      const deviceNum = deviceId.replace('device', '');
      const container = document.getElementById(`${deviceId}-cards-container`);
      if (!container) return;
      if (deviceData) {
          const loadKeys = Object.keys(deviceData).filter(k => k.startsWith('Load')).sort((a, b) => parseInt(a.replace('Load', '')) - parseInt(b.replace('Load', '')));
          let html = '';
          let active = 0, inactive = 0, warning = 0, total = loadKeys.length;
          loadKeys.forEach(loadId => {
              const state = deviceData[loadId];
              const name = (relayNames[deviceId]?.[loadId]) || `লোড ${loadId.replace('Load', '')}`;
              let statusText = 'ইনএক্টিভ', statusClass = 'status-inactive', valueText = 'OFF';
              if (state === 1 || state === true) { statusText = 'এক্টিভ'; statusClass = 'status-active'; valueText = 'ON'; active++; }
              else if (state === 2) { statusText = 'সতর্কতা'; statusClass = 'status-warning'; valueText = 'WARNING'; warning++; }
              else { inactive++; }
              const linkedRules = getLinkedRules(deviceId, loadId);
              let linkIconHtml = '';
              if (linkedRules.length > 0) {
                  const linksList = linkedRules.map(r => `<div>• ${r}</div>`).join('');
                  linkIconHtml = `<span class="linked-rule-indicator" onclick="toggleLinkDropdown(this, event)" title="এই লোডটি অটোমেশন বা লজিক গেটের সাথে যুক্ত"><i class="fas fa-link"></i><div class="linked-rule-dropdown">${linksList}</div></span>`;
              }
              html += `<div class="device-card"><div class="card-header"><div class="card-title-container"><span class="card-title">${name} ${linkIconHtml}</span><div class="card-actions"><i class="fas fa-pencil-alt" title="নাম পরিবর্তন করুন" onclick="editRelayName('${deviceId}', '${loadId}')"></i><i class="fas fa-trash-alt" title="এই লোডটি মুছুন" onclick="deleteRelay('${deviceId}', '${loadId}')"></i></div></div><span class="card-status ${statusClass}">${statusText}</span></div><div class="card-value">${valueText}</div><div class="card-footer"><button class="pro-btn card-btn btn-on" onclick="controlDevice('${deviceId}', '${loadId}', 1)">ON</button><button class="pro-btn card-btn btn-warning" onclick="controlDevice('${deviceId}', '${loadId}', 2)">WARN</button><button class="pro-btn card-btn btn-off" onclick="controlDevice('${deviceId}', '${loadId}', 0)">OFF</button></div></div>`;
          });
          if (container.innerHTML !== html) container.innerHTML = html;
          document.getElementById(`d${deviceNum}-active-count`).textContent = active;
          document.getElementById(`d${deviceNum}-inactive-count`).textContent = inactive;
          document.getElementById(`d${deviceNum}-warning-count`).textContent = warning;
          document.getElementById(`d${deviceNum}-total-count`).textContent = total;
          if (deviceCharts[deviceId]) { deviceCharts[deviceId].data.datasets[0].data = [active, warning, inactive]; deviceCharts[deviceId].update(); }
      }
  }

  // ================================================================
  // BISNU IoT MULTI-THEME SYSTEM v2.0
  // ================================================================
  const BISNU_THEMES = [
    {id:'theme-cyber-teal',   icon:'⚡', name:'Neon Teal',      colors:['#0a0e1a','#00d4ff','#ff2d5b','#00ff9d','#c84bff']},
    {id:'theme-ember-matrix', icon:'🔥', name:'Ember Matrix',   colors:['#1a0800','#ff6b00','#ff0040','#ffcc00','#ff9500']},
    {id:'theme-ghost-protocol',icon:'👻',name:'Ghost Protocol', colors:['#f5f8fc','#0078d4','#d13438','#107c10','#8764b8']},
    {id:'theme-toxic-green',  icon:'☣️', name:'Toxic Green',    colors:['#020d00','#39ff14','#ff073a','#f0e000','#00ff88']},
    {id:'theme-deep-space',   icon:'🌌', name:'Deep Space',     colors:['#08001a','#bb86fc','#cf6679','#03dac6','#ffb300']},
    {id:'theme-gold-circuit', icon:'🥇', name:'Gold Circuit',   colors:['#0f0a00','#ffd700','#ff6600','#a8e063','#ff8c00']},
    {id:'theme-ice-core',     icon:'🧊', name:'Ice Core',       colors:['#f0f8ff','#00b4d8','#e63946','#2ec4b6','#4361ee']},
    {id:'theme-synthwave',    icon:'🌆', name:'Synthwave',      colors:['#0d0017','#ff00ff','#00ffff','#00ffaa','#ffee00']},
    {id:'theme-midnight-oil', icon:'🌙', name:'Midnight Oil',   colors:['#050d1f','#4dabf7','#ff6b6b','#51cf66','#cc5de8']},
    {id:'theme-solar-flare',  icon:'☀️', name:'Solar Flare',    colors:['#0c0500','#ff9500','#ff3860','#23d160','#ffdd57']},
    {id:'theme-matrix-code',  icon:'💻', name:'Matrix Code',    colors:['#000800','#00ff41','#ff0000','#88ff00','#00ff99']},
    {id:'theme-aurora',       icon:'🌠', name:'Aurora',         colors:['#020810','#00f5a0','#f500b8','#00c8f5','#f5c400']},
  ];

  let _currentTheme = 'theme-cyber-teal';

  function applyTheme(themeId, save) {
    if (save === undefined) save = true;
    BISNU_THEMES.forEach(t => document.body.classList.remove(t.id));
    document.body.classList.add(themeId);
    _currentTheme = themeId;
    if (save) localStorage.setItem('bisnu_theme_v2', themeId);

    var th = BISNU_THEMES.find(function(t){ return t.id === themeId; });
    var bi = document.getElementById('theme-btn-icon');
    var bn = document.getElementById('theme-btn-name');
    if (bi && th) bi.textContent = th.icon;
    if (bn && th) bn.textContent = th.name;

    var isLight = (themeId === 'theme-ghost-protocol' || themeId === 'theme-ice-core');
    try { Chart.defaults.color = isLight ? '#1a1a2e' : '#c8e6f5'; } catch(e){}
    try { Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)'; } catch(e){}
    try {
      var allCharts = Object.assign({}, deviceCharts, energyCharts, sensorHistoricalCharts);
      if (advancedEnergyChart) allCharts['_adv'] = advancedEnergyChart;
      Object.values(allCharts).forEach(function(c){ if(c) c.update(); });
    } catch(e){}

    // Update active state in modal if open
    document.querySelectorAll('.tm-card').forEach(function(card){
      card.classList.toggle('tm-active', card.dataset.tid === themeId);
    });
  }

  function buildThemeGrid() {
    var grid = document.getElementById('theme-modal-grid');
    if (!grid) return;
    grid.innerHTML = '';
    BISNU_THEMES.forEach(function(th) {
      var card = document.createElement('div');
      card.className = 'tm-card' + (th.id === _currentTheme ? ' tm-active' : '');
      card.dataset.tid = th.id;
      card.title = th.name;
      card.innerHTML =
        '<div class="tm-preview" style="background:' + th.colors[0] + ';">' +
          th.colors.map(function(c){ return '<div class="tm-color-bar" style="background:' + c + ';"></div>'; }).join('') +
        '</div>' +
        '<div class="tm-label"><span>' + th.icon + ' ' + th.name + '</span><span class="tm-check">✓</span></div>';
      card.onclick = function(){ applyTheme(th.id); };
      grid.appendChild(card);
    });
  }

  function openThemeModal() {
    buildThemeGrid();
    document.getElementById('themeModal').style.display = 'flex';
  }

  function closeThemeModal() {
    document.getElementById('themeModal').style.display = 'none';
  }

  function loadThemePreference() {
    var saved = localStorage.getItem('bisnu_theme_v2') || 'theme-cyber-teal';
    applyTheme(saved, false);
  }

  function toggleTheme() { loadThemePreference(); }
  
  function applyBackground(index) {
    // থিম ক্লাস রেখে bg-X পরিবর্তন করো
    for (var i = 0; i <= 15; i++) document.body.classList.remove('bg-' + i);
    document.body.classList.add('bg-' + index);
    if (_currentTheme) document.body.classList.add(_currentTheme);
    currentBackgroundIndex = index;
  }
  function changeBackground() { const newIndex = (currentBackgroundIndex + 1) % totalBackgrounds; applyBackground(newIndex); localStorage.setItem('backgroundIndex', newIndex); }
  function loadBackgroundPreference() { applyBackground(parseInt(localStorage.getItem('backgroundIndex') || 0)); }

  function getChartOptions() { return { responsive: true }; }
  function initEnergyCharts() {
    ['voltage-chart', 'current-chart', 'power-chart', 'energy-chart'].forEach(id => { const chart = Chart.getChart(id); if (chart) chart.destroy(); });
    energyCharts.voltageChart = new Chart('voltage-chart', { type: 'line', data: { datasets: [{ label: 'ভোল্টেজ (V)', data: [], borderColor: 'rgba(230,126,34,1)', backgroundColor: 'rgba(230,126,34,0.2)', fill: true, tension: 0.4 }] }, options: getChartOptions() });
    energyCharts.currentChart = new Chart('current-chart', { type: 'line', data: { datasets: [{ label: 'কারেন্ট (A)', data: [], borderColor: 'rgba(26,188,156,1)', backgroundColor: 'rgba(26,188,156,0.2)', fill: true, tension: 0.4 }] }, options: getChartOptions() });
    energyCharts.powerChart = new Chart('power-chart', { type: 'line', data: { datasets: [{ label: 'পাওয়ার (W)', data: [], borderColor: 'rgba(52,152,219,1)', backgroundColor: 'rgba(52,152,219,0.2)', fill: true, tension: 0.4 }] }, options: getChartOptions() });
    energyCharts.energyChart = new Chart('energy-chart', { type: 'bar', data: { labels: ['সকাল', 'দুপুর', 'বিকাল', 'রাত'], datasets: [{ label: 'এনার্জি (kWh)', data: [0,0,0,0], backgroundColor: 'rgba(155,89,182,0.7)' }] }, options: getChartOptions() });
  }
  
  function updateEnergyData(data) {
    currentEnergyData = data;
    const setHTML = (id, val, unit) => document.getElementById(id).innerHTML = (data[val] !== undefined && data[val] !== null) ? data[val] + ` <span class="energy-unit">${unit}</span>` : `-- <span class="energy-unit">${unit}</span>`;
    
    // Updated mapping based on Firebase snake_case keys
    setHTML('voltage-value', 'voltage', 'V');
    setHTML('current-value', 'current', 'A'); 
    setHTML('power-value', 'power', 'W');
    setHTML('energy-value', 'energy', 'kWh'); 
    setHTML('frequency-value', 'frequency', 'Hz'); 
    setHTML('active-power-value', 'active_power', 'W'); 
    setHTML('reactive-power-value', 'reactive_power', 'VAR'); 
    setHTML('daily-cost-value', 'cost', 'BDT');
    setHTML('units-value', 'units', 'Units'); 
    
    document.getElementById('power-factor-value').textContent = (data.power_factor !== undefined) ? data.power_factor : '--'; 
    
    // Fix for Timestamp (Handling String vs Number)
    let timeDisplay = '--';
    if (data.timestamp) {
        if (typeof data.timestamp === 'string') {
            timeDisplay = data.timestamp; // Use directly if it's "15:04:37"
        } else if (typeof data.timestamp === 'number') {
            timeDisplay = new Date(data.timestamp * 1000).toLocaleString('bn-BD');
        }
    }
    document.getElementById('timestamp-value').textContent = timeDisplay;
    
    const updateChart = (chart, value) => { if(!value || !chart) return; chart.data.labels.push(''); if(chart.data.labels.length>12) chart.data.labels.shift(); chart.data.datasets[0].data.push(value); if(chart.data.datasets[0].data.length>12) chart.data.datasets[0].data.shift(); chart.update(); };
    updateChart(energyCharts.voltageChart, data.voltage); updateChart(energyCharts.currentChart, data.current); updateChart(energyCharts.powerChart, data.power);
    const ts = new Date().getTime(); 
    historicalData = { ...data, ...historicalData };
    if(!historicalData[ts]) historicalData[ts] = data;
    if(document.getElementById('page6').classList.contains('active')) updateAdvancedChart();
    checkForAnomalies(data.power);
  }
  
  function promptForRelayPassword(device, relay, element) { element.checked = !element.checked; relayOperationContext = { device, relay, element, targetState: !element.checked }; document.getElementById('relayPasswordModal').style.display = 'flex'; document.getElementById('relayPasswordInput').focus(); document.getElementById('relayPasswordError').innerText = ''; }
  function verifyAndOperateRelay() { if(document.getElementById('relayPasswordInput').value === correctOperatingPassword) { if(relayOperationContext) { const { device, relay, element, targetState } = relayOperationContext; element.checked = targetState; controlRelay(device, relay, element); closeRelayModal(); } } else { document.getElementById('relayPasswordError').innerText = '❌ ভুল পাসওয়ার্ড!'; } document.getElementById('relayPasswordInput').value = ''; }
  function cancelRelayOperation() { closeRelayModal(); }
  function closeRelayModal() { document.getElementById('relayPasswordModal').style.display = 'none'; document.getElementById('relayPasswordInput').value = ''; relayOperationContext = null; }
  
  function promptForActionPassword(title, desc, cb) { document.getElementById('action-modal-title').textContent = title; document.getElementById('action-modal-description').textContent = desc; actionToConfirmCallback = cb; document.getElementById('actionPasswordModal').style.display = 'flex'; document.getElementById('actionPasswordInput').focus(); document.getElementById('actionPasswordError').textContent = ''; }
  function verifyAndExecuteAction() { if(document.getElementById('actionPasswordInput').value === correctOperatingPassword) { if (typeof actionToConfirmCallback === 'function') actionToConfirmCallback(); cancelAction(); } else { document.getElementById('actionPasswordError').textContent = '❌ ভুল অপারেটিং পাসওয়ার্ড!'; } document.getElementById('actionPasswordInput').value = ''; }
  function cancelAction() { document.getElementById('actionPasswordModal').style.display = 'none'; document.getElementById('actionPasswordInput').value = ''; actionToConfirmCallback = null; }

  function updateAllTimerDisplays() { 
      for(const key in allTimersData) { 
          const data = allTimersData[key]; 
          const el = document.getElementById(`timer-status-${data.device}-${data.relay}`); 
          if(el) {
              el.innerHTML = data.enabled ? 
              `টাইমার সক্রিয়। ${calculateCountdown(data.online, data.offline).nextState} ${calculateCountdown(data.online, data.offline).timeLeft} পর।` 
              : 'টাইমার নিষ্ক্রিয় আছে।'; 
          }
      } 
  }
  
  function processTimerExecution() {
      const now = new Date();
      const currentTimeString = now.toLocaleTimeString('en-GB', { hour12: false });
      for(const key in allTimersData) {
          const t = allTimersData[key];
          if(!t.enabled) continue;
          if(t.online === currentTimeString) {
              const deviceRootPath = getPathFor('devices_root');
              database.ref(`${deviceRootPath}/${t.device}`).update({ [t.relay]: true });
          }
          if(t.offline === currentTimeString) {
              const deviceRootPath = getPathFor('devices_root');
              database.ref(`${deviceRootPath}/${t.device}`).update({ [t.relay]: false });
          }
      }
  }

  function calculateCountdown(on, off) { const now=new Date(), onT=new Date(now.toDateString()+' '+on), offT=new Date(now.toDateString()+' '+off); let next, state; if(onT<offT){ if(now>=onT && now<offT){next=offT; state='অফ হবে';} else {next=now<onT?onT:new Date(onT.getTime()+864e5); state='অন হবে';} } else { if(now>=offT && now<onT){next=onT; state='অন হবে';} else {next=now<offT?offT:new Date(offT.getTime()+864e5); state='অফ হবে';} } const d=next-now, h=Math.floor(d/36e5), m=Math.floor(d%36e5/6e4), s=Math.floor(d%6e4/1e3); return {timeLeft:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, nextState:state}; }
  function openTimerModal(dev, rel) { const key=`${dev}-${rel}`; timerOperationContext=key; const data=allTimersData[key]||{}; const name=(relayNames[dev]?.[rel])||`${dev}-${rel}`; document.getElementById('timer-modal-title').textContent=`${name} - টাইমার সেটিংস`; document.getElementById('timer-online-time').value=data.online||'00:00:00'; document.getElementById('timer-offline-time').value=data.offline||'00:00:00'; updateEnabledButton(document.getElementById('timer-enabled-btn'), !!data.enabled); document.getElementById('timerModal').style.display='flex'; }
  function updateEnabledButton(btn, isEn) { btn.textContent=isEn?'সক্রিয়':'নিষ্ক্রিয়'; btn.classList.toggle('enabled',isEn); btn.classList.toggle('disabled',!isEn); }
  function toggleTimerEnabled() { const btn=document.getElementById('timer-enabled-btn'); updateEnabledButton(btn, !btn.classList.contains('enabled')); }
  function closeTimerModal() { document.getElementById('timerModal').style.display='none'; document.getElementById('timerPasswordInput').value=''; document.getElementById('timerPasswordError').textContent=''; timerOperationContext=null; }
  function saveTimerSettings() { if(document.getElementById('timerPasswordInput').value!==correctOperatingPassword) { document.getElementById('timerPasswordError').textContent='❌ ভুল অপারেটিং পাসওয়ার্ড!'; return; } if(timerOperationContext) { const [dev,rel]=timerOperationContext.split('-'), en=document.getElementById('timer-enabled-btn').classList.contains('enabled'), onT=document.getElementById('timer-online-time').value, offT=document.getElementById('timer-offline-time').value; const updates={enabled:en, online:onT, offline:offT, device:dev, relay:rel}; database.ref(`${getPathFor('timers')}/${timerOperationContext}`).set(updates).then(()=>{ logAuditEvent(`'${timerOperationContext}' এর জন্য টাইমার সেটিংস পরিবর্তন করেছেন।`); closeTimerModal(); }); } }

  function initAdvancedEnergyChart(){if(advancedEnergyChart)advancedEnergyChart.destroy();advancedEnergyChart=new Chart('advanced-energy-chart',{type:'line',data:{datasets:[{label:'ভোল্টেজ (V)',data:[],borderColor:'rgba(230,126,34,1)',backgroundColor:'rgba(230,126,34,0.2)',fill:true,tension:0.4}]},options:getChartOptions()});}
  function changeTimeRange(mins){selectedTimeRange=mins;document.querySelectorAll('.time-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');updateAdvancedChart();}
  
  // FIX: Updated selectMetric and getMetricName to handle snake_case keys correctly
  function selectMetric(metric){
      selectedMetric=metric;
      document.querySelectorAll('.metric-card').forEach(c=>c.classList.remove('selected'));
      event.target.closest('.metric-card').classList.add('selected');
      updateAdvancedChart();
  }
  
  function getMetricName(m){
      const names = {
          voltage:'ভোল্টেজ', current:'কারেন্ট', power:'পাওয়ার', energy:'এনার্জি',
          frequency:'ফ্রিকোয়েন্সি', power_factor:'পাওয়ার ফ্যাক্টর', 
          active_power:'অ্যাক্টিভ পাওয়ার', reactive_power:'রিঅ্যাক্টিভ পাওয়ার'
      };
      return names[m]||m;
  }
  
  function getTimeRangeText(m){return m<60?`${m} মিনিট`:`${Math.floor(m/60)} ঘন্টা`;}
  
  function updateAdvancedChart(){
      if(!advancedEnergyChart)return;
      const now=new Date().getTime(),cutoff=now-(selectedTimeRange*60*1000);
      const timestamps=Object.keys(historicalData).filter(ts=>parseInt(ts)>=cutoff).sort();
      const labels=timestamps.map(ts=>new Date(parseInt(ts)).toLocaleTimeString('bn-BD'));
      // Using snake_case keys based on selectedMetric
      const data=timestamps.map(ts=>historicalData[ts]?.[selectedMetric]);
      
      document.getElementById('advanced-graph-title').textContent=`${getMetricName(selectedMetric)} ট্রেন্ড (${getTimeRangeText(selectedTimeRange)})`;
      advancedEnergyChart.data.labels=labels;
      advancedEnergyChart.data.datasets[0].data=data;
      advancedEnergyChart.data.datasets[0].label=`${getMetricName(selectedMetric)} (${getUnit(selectedMetric)})`;
      advancedEnergyChart.update();
      document.getElementById('no-data-message').style.display=data.length===0?'block':'none';
  }
  
  function getUnit(m){
      const units = {
          voltage:'V', current:'A', power:'W', energy:'kWh', 
          frequency:'Hz', power_factor:'', active_power:'W', reactive_power:'VAR'
      };
      return units[m]||'';
  }
  
  function downloadGraphData(){
      let csv="data:text/csv;charset=utf-8,সময়,ভোল্টেজ (V),কারেন্ট (A),পাওয়ার (W),এনার্জি (kWh),ফ্রিকোয়েন্সি (Hz),পাওয়ার ফ্যাক্টর,অ্যাক্টিভ পাওয়ার (W),রিঅ্যাক্টিভ পাওয়ার (VAR)\n";
      Object.keys(historicalData).sort().forEach(ts=>{
          const d=historicalData[ts];
          // Updated to use snake_case keys for CSV export
          csv+=[new Date(parseInt(ts)).toLocaleString(),d.voltage||'',d.current||'',d.power||'',d.energy||'',d.frequency||'',d.power_factor||'',d.active_power||'',d.reactive_power||''].join(",")+"\n";
      });
      const link=document.createElement("a");
      link.href=encodeURI(csv);
      link.download=`energy_data_${new Date().toLocaleDateString()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }
  
  function printGraph(){const canvas=document.getElementById('advanced-energy-chart'),win=window.open('','Print');win.document.write(`<h1>${document.getElementById('advanced-graph-title').textContent}</h1><img src="${canvas.toDataURL()}"/>`);win.document.close();win.focus();setTimeout(()=>{win.print();win.close();},500);}
  function showToast(msg,type='info'){
      if (!isNotificationMuted) {
          const sound=document.getElementById('notification-sound');
          sound.currentTime=0;
          sound.play().catch(e=>console.log("Audio couldn't play:",e));
      }
      const cont=document.getElementById('toast-container'),toast=document.createElement('div');toast.className=`toast-message ${type}`;toast.innerHTML=`${type==='success'?'✅':type==='error'?'❌':type==='warning'?'🔇':'ℹ️'} ${msg}`;cont.appendChild(toast);setTimeout(()=>toast.remove(),5000);
  }
  function displayNotification(title,body){if('Notification' in window&&Notification.permission==='granted'){navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,{body:body,icon:'Bisnu.png',badge:'Bisnu.png'}));}}
  function initializeNotifications(){messaging.onMessage(payload=>showToast(payload.notification.body,'info'));}
  async function requestNotificationPermission(){const btn=document.getElementById('notification-btn');try{await messaging.requestPermission();const token=await messaging.getToken();const user=auth.currentUser;if(user){database.ref(`fcmTokens/${user.uid}`).set({token:token});showToast('নোটিফিকেশন সফলভাবে চালু হয়েছে!','success');}}catch(err){showToast('নোটিফিkeশনের অনুমতি দেওয়া হয়নি।','error');}}
  
  function toggleNotificationSound() {
      isNotificationMuted = !isNotificationMuted;
      localStorage.setItem('isNotificationMuted', isNotificationMuted);
      loadSoundPreference();
      showToast(isNotificationMuted ? 'নোটিফিকেশন সাউন্ড বন্ধ করা হয়েছে।' : 'নোটিফিকেশন সাউন্ড চালু করা হয়েছে।', isNotificationMuted ? 'warning' : 'success');
  }

  function loadSoundPreference() {
      const btn = document.getElementById('notification-btn');
      if (isNotificationMuted) {
          btn.innerHTML = '<i class="fas fa-bell-slash"></i> সাউন্ড মিউট করা';
          btn.classList.remove('notification-btn');
          btn.classList.add('btn-off');
      } else {
          btn.innerHTML = '🔔 সাউন্ড অন আছে';
          btn.classList.remove('btn-off');
          btn.classList.add('notification-btn');
      }
  }

  function checkForAnomalies(power){const alertDiv=document.getElementById('anomaly-alert');if(power>5000){const msg=`অস্বাভাবিকভাবে উচ্চ পাওয়ার (${power.toFixed(0)} W) ব্যবহার শনাক্ত হয়েছে।`;alertDiv.innerHTML=`<div class="alert-message"><strong>সতর্কতা!</strong> ${msg}</div>`;triggerNotification("উচ্চ পাওয়ার ব্যবহার!",msg);}else{alertDiv.innerHTML=`<p>সিস্টেম স্বাভাবিকভাবে চলছে। কোনো অস্বাভাবিকতা শনাক্ত হয়নি।</p>`;}}
  function populateRelayDropdown(devSelect,relSelect){const selDevId=devSelect.value,currRelVal=relSelect.value;relSelect.innerHTML='';if(selDevId&&currentDeviceStates[selDevId]){const relays=Object.keys(currentDeviceStates[selDevId]).filter(k=>k.startsWith('relay')||k.startsWith('Load')).sort((a,b)=>{const numA=parseInt(a.match(/\d+/));const numB=parseInt(b.match(/\d+/));return numA-numB;});relays.forEach(relId=>{const name=(relayNames[selDevId]?.[relId])||relId;const opt=document.createElement('option');opt.value=relId;opt.textContent=name;relSelect.appendChild(opt);});if(relays.includes(currRelVal))relSelect.value=currRelVal;}}
  
  function updateAutomationFormOptions(){
      const devs=currentDeviceStates?Object.keys(currentDeviceStates).sort((a,b)=>parseInt(a.replace('device',''))-parseInt(b.replace('device',''))):[],actDevSelect=document.getElementById('action-device');
      if(!actDevSelect)return;
      const currActDev=actDevSelect.value;
      actDevSelect.innerHTML='';
      devs.forEach(devId=>{const opt=document.createElement('option');opt.value=devId;opt.textContent=devId.replace('device','ডিভাইস ');actDevSelect.appendChild(opt);});
      if(devs.includes(currActDev))actDevSelect.value=currActDev;
      populateRelayDropdown(actDevSelect,document.getElementById('action-relay'));
      const src = document.getElementById('trigger-source').value;
      if (src === 'device') {
          if (document.activeElement.tagName !== 'SELECT') {
             updateTriggerOptions();
          }
      }
  }

  function updateTriggerOptions(){const src=document.getElementById('trigger-source').value,cont=document.getElementById('trigger-options-container'),devs=currentDeviceStates?Object.keys(currentDeviceStates).sort((a,b)=>parseInt(a.replace('device',''))-parseInt(b.replace('device',''))):[];let html='';if(src==='energy')html=`<div class="form-group"><label for="trigger-metric">ম্যাট্রিক</label><select id="trigger-metric"><option value="power">পাওয়ার (W)</option><option value="voltage">ভোল্টেজ (V)</option><option value="current">কারেন্ট (A)</option></select></div><div class="form-group"><label for="trigger-condition">শর্ত</label><select id="trigger-condition"><option value=">">এর বেশি হলে</option><option value="<">এর কম হলে</option><option value="==">এর সমান হলে</option></select></div><div class="form-group"><label for="trigger-value">মান</label><input type="number" id="trigger-value" required></div>`;else if(src==='time')html=`<div class="form-group"><label for="trigger-value">নির্দিষ্ট সময়</label><input type="time" id="trigger-value" required></div>`;else if(src==='device')html=`<div class="form-group"><label for="trigger-device">ডিভাইস</label><select id="trigger-device" onchange="populateRelayDropdown(this, document.getElementById('trigger-relay'))">${devs.map(id=>`<option value="${id}">${id.replace('device','ডিভাইস ')}</option>`).join('')}</select></div><div class="form-group"><label for="trigger-relay">রিলে/লোড</label><select id="trigger-relay"></select></div><div class="form-group"><label for="trigger-condition">অবস্থা</label><select id="trigger-condition"><option value="true">ON হলে</option><option value="false">OFF হলে</option></select></div>`;cont.innerHTML=html;if(src==='device'&&devs.length>0)populateRelayDropdown(document.getElementById('trigger-device'),document.getElementById('trigger-relay'));}
  document.getElementById('send-notification-checkbox').addEventListener('change',function(){document.getElementById('notification-message-group').style.display=this.checked?'flex':'none';});
  
  function saveAutomationRule(e){
      e.preventDefault();
      const ruleName=document.getElementById('rule-name').value;
      if(!ruleName)return showToast("রুলের একটি নাম দিন।","error");
      const isEdit = editingAutomationRuleId !== null;
      const actionTitle = isEdit ? `'${ruleName}' আপডেট করুন` : `'${ruleName}' সংরক্ষণ করুন`;
      const actionDesc = isEdit ? `আপনি কি '${ruleName}' রুলটি আপডেট করতে চান?` : `আপনি কি '${ruleName}' রুলটি সংরক্ষণ করতে চান?`;
      promptForActionPassword(actionTitle, actionDesc, ()=>{
          const sendNotif=document.getElementById('send-notification-checkbox').checked;
          const rule={
              name:ruleName,
              triggerSource:document.getElementById('trigger-source').value,
              actionDevice:document.getElementById('action-device').value,
              actionRelay:document.getElementById('action-relay').value,
              actionState:document.getElementById('action-state').value==='true',
              sendNotification:sendNotif,
              notificationMessage:sendNotif?document.getElementById('notification-message').value:'',
              isEnabled:true,
              lastFired:0
          };
          if(rule.triggerSource==='energy'){
              rule.triggerMetric=document.getElementById('trigger-metric').value;
              rule.triggerCondition=document.getElementById('trigger-condition').value;
              rule.triggerValue=parseFloat(document.getElementById('trigger-value').value);
          }else if(rule.triggerSource==='time') {
              rule.triggerValue=document.getElementById('trigger-value').value;
          }else if(rule.triggerSource==='device'){
              rule.triggerDevice=document.getElementById('trigger-device').value;
              rule.triggerRelay=document.getElementById('trigger-relay').value;
              rule.triggerState=document.getElementById('trigger-condition').value==='true';
          }
          if (isEdit) {
             database.ref(`${getPathFor('automation_rules')}/${editingAutomationRuleId}`).update(rule)
             .then(()=>{ showToast('অটোমেশন রুল সফলভাবে আপডেট হয়েছে!','success'); logAuditEvent(`অটোমেশন রুল '${rule.name}' আপডেট করেছেন।`); cancelEditAutomation(); });
          } else {
             database.ref(getPathFor('automation_rules')).push(rule)
             .then(()=>{ showToast('অটোমেশন রুল সফলভাবে সংরক্ষিত হয়েছে!','success'); logAuditEvent(`নতুন অটোমেশন রুল '${rule.name}' তৈরি করেছেন।`); cancelEditAutomation(); });
          }
      });
  }

  function editAutomationRule(id) {
      const rule = automationRules[id];
      if (!rule) return;
      editingAutomationRuleId = id;
      document.getElementById('rule-name').value = rule.name;
      document.getElementById('trigger-source').value = rule.triggerSource;
      updateTriggerOptions(); 
      setTimeout(() => {
          if(rule.triggerSource==='energy'){
              document.getElementById('trigger-metric').value = rule.triggerMetric;
              document.getElementById('trigger-condition').value = rule.triggerCondition;
              document.getElementById('trigger-value').value = rule.triggerValue;
          }else if(rule.triggerSource==='time') {
              document.getElementById('trigger-value').value = rule.triggerValue;
          }else if(rule.triggerSource==='device'){
              document.getElementById('trigger-device').value = rule.triggerDevice;
              populateRelayDropdown(document.getElementById('trigger-device'),document.getElementById('trigger-relay'));
              document.getElementById('trigger-relay').value = rule.triggerRelay;
              document.getElementById('trigger-condition').value = rule.triggerState ? 'true' : 'false';
          }
      }, 100); 
      document.getElementById('action-device').value = rule.actionDevice;
      populateRelayDropdown(document.getElementById('action-device'), document.getElementById('action-relay'));
      document.getElementById('action-relay').value = rule.actionRelay;
      document.getElementById('action-state').value = rule.actionState ? 'true' : 'false';
      document.getElementById('send-notification-checkbox').checked = rule.sendNotification;
      document.getElementById('notification-message-group').style.display = rule.sendNotification ? 'flex' : 'none';
      document.getElementById('notification-message').value = rule.notificationMessage || '';
      const submitBtn = document.querySelector('#automation-rule-form button[type="submit"]');
      submitBtn.textContent = '🔄 আপডেট করুন';
      document.getElementById('cancel-automation-edit-btn').style.display = 'block';
      document.querySelector('.automation-grid').scrollIntoView({behavior: 'smooth'});
  }

  function cancelEditAutomation() {
      editingAutomationRuleId = null;
      document.getElementById('automation-rule-form').reset();
      document.getElementById('notification-message-group').style.display='none';
      updateTriggerOptions(); 
      const submitBtn = document.querySelector('#automation-rule-form button[type="submit"]');
      submitBtn.textContent = '💾 রুল সংরক্ষণ করুন';
      document.getElementById('cancel-automation-edit-btn').style.display = 'none';
  }

  function toggleRule(id){const rule=automationRules[id],newState=!rule.isEnabled;database.ref(`${getPathFor('automation_rules')}/${id}/isEnabled`).set(newState).then(()=>logAuditEvent(`'${rule.name}' রুলটি ${newState?'সক্রিয়':'নিষ্ক্রিয়'} করেছেন।`));}
  function deleteRule(id){const name=automationRules[id].name;promptForActionPassword('রুল মুছুন',`আপনি কি সত্যিই "${name}" রুলটি মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('automation_rules')}/${id}`).remove().then(()=>logAuditEvent(`'${name}' রুলটি মুছে ফেলেছেন।`)));}
  function triggerNotification(title,body){showToast(body,'info');displayNotification(title,body);}
  
  function checkAutomationRules(src, data) {
    const now = new Date();
    const currTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowTs = now.getTime();
    for (const id in automationRules) {
        const rule = automationRules[id];
        if (!rule.isEnabled || (nowTs - (rule.lastFired || 0) < 5000)) continue;
        if (logicOverrides[rule.actionDevice] && logicOverrides[rule.actionDevice][rule.actionRelay]) continue;
        let trigger = false;
        if (src === 'energy' && rule.triggerSource === 'energy') {
            const val = parseFloat(data[rule.triggerMetric]);
            const targetVal = parseFloat(rule.triggerValue);
            if (!isNaN(val)) {
                if (rule.triggerCondition === '>' && val > targetVal) trigger = true;
                if (rule.triggerCondition === '<' && val < targetVal) trigger = true;
                if (rule.triggerCondition === '==' && val == targetVal) trigger = true;
            }
        }
        if (src === 'time' && rule.triggerSource === 'time' && rule.triggerValue === currTime) trigger = true;
        if (src === 'device' && rule.triggerSource === 'device') {
            if (data.deviceId === rule.triggerDevice) {
                 const currentState = data.states[rule.triggerRelay];
                 if (String(currentState) === String(rule.triggerState)) trigger = true;
            }
        }
        if (trigger) {
            database.ref(`${getPathFor('devices_root')}/${rule.actionDevice}`).update({ [rule.actionRelay]: rule.actionState });
            if (rule.sendNotification && rule.notificationMessage) triggerNotification(`"${rule.name}" কার্যকর হয়েছে`, rule.notificationMessage);
            database.ref(`${getPathFor('automation_rules')}/${id}/lastFired`).set(nowTs);
            const logMsg = `অটোমেশন "${rule.name}" অনুযায়ী ${rule.actionDevice} এর ${rule.actionRelay} ${rule.actionState ? 'ON' : 'OFF'} করা হয়েছে।`;
            addLogEntry(rule.actionDevice, logMsg, 'info');
            logAuditEvent(logMsg, "সিস্টেম অটোমেশন");
        }
    }
  }

  setInterval(()=>checkAutomationRules('time',{}),60000);
  
  function editRelayName(dev,rel){const currName=(relayNames[dev]?.[rel])||rel;const newName=prompt(`'${currName}' এর জন্য নতুন নাম দিন:`,currName);if(newName&&newName.trim()!=="")database.ref(`${getPathFor('device_metadata')}/${dev}/relay_names/${rel}`).set(newName).then(()=>logAuditEvent(`'${currName}' রিলের নাম পরিবর্তন করে '${newName}' রেখেছেন।`));}
  function executeScene(id,actions,name){promptForActionPassword(`'${name}' দৃশ্যটি চালান`,`আপনি কি সত্যিই "${name}" দৃশ্যটি কার্যকর করতে চান?`,()=>{const updates={};if(Array.isArray(actions))actions.forEach(a=>updates[`${getPathFor('devices_root')}/${a.device}/${a.relay}`]=a.state);if(Object.keys(updates).length===0)return showToast("এই দৃশ্যে কোনো অ্যাকশন সেট করা নেই।","warning");database.ref().update(updates).then(()=>logAuditEvent(`"${name}" দৃশ্যটি কার্যকর করেছেন।`));});}
  function openSceneModal(){const cont=document.getElementById('scene-relay-list-container');let html='';const sortedDevs=Object.keys(currentDeviceStates).sort((a,b)=>parseInt(a.replace('device',''))-parseInt(b.replace('device','')));sortedDevs.forEach(devId=>{html+=`<div class="scene-device-header">${devId.replace('device','ডিভাইস ')}</div>`;const relays=Object.keys(currentDeviceStates[devId]).filter(k=>k.startsWith('relay')||k.startsWith('Load')).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/)));relays.forEach(relId=>{const name=(relayNames[devId]?.[relId])||relId;html+=`<div class="scene-relay-item"><span>${name}</span><select class="scene-action-select" data-device="${devId}" data-relay="${relId}"><option value="ignore">কোনো পরিবর্তন নয়</option><option value="true">ON করুন</option><option value="false">OFF করুন</option></select></div>`;});});cont.innerHTML=html;document.getElementById('sceneModal').style.display='flex';}
  function closeSceneModal(){document.getElementById('sceneModal').style.display='none';document.getElementById('scene-name').value='';document.getElementById('scene-error-message').textContent='';}
  async function saveScene(){const name=document.getElementById('scene-name').value;if(!name||name.trim()==='')return showToast('দৃশ্যের একটি নাম দিন।','error');const actions=[];document.querySelectorAll('.scene-action-select').forEach(sel=>{if(sel.value!=='ignore')actions.push({device:sel.dataset.device,relay:sel.dataset.relay,state:sel.value==='true'});});if(actions.length===0)return showToast('অন্তত একটি রিলের জন্য অ্যাকশন নির্বাচন করুন।','error');await database.ref(getPathFor('scenes')).push({name:name,actions:actions});logAuditEvent(`নতুন দৃশ্য '${name}' তৈরি করেছেন।`);closeSceneModal();}
  function deleteScene(id,name){promptForActionPassword('দৃশ্য মুছুন',`আপনি কি "${name}" দৃশ্যটি স্থায়ীভাবে মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('scenes')}/${id}`).remove().then(()=>logAuditEvent(`দৃশ্য '${name}' মুছে ফেলেছেন।`)));}
  function updateAllDateTimeDisplays(){const now=new Date(),date=now.toLocaleDateString('en-GB').replace(/\//g,'-'),time=now.toLocaleTimeString('en-GB');document.querySelectorAll('[id^="date-"]').forEach(el=>el.innerHTML=`<i class="fas fa-calendar-alt"></i> ${date}`);document.querySelectorAll('[id^="time-"]').forEach(el=>el.innerHTML=`<i class="fas fa-clock"></i> ${time}`);}
  
  function getLinkedRules(deviceId, relayId) {
      const links = [];
      for (const id in automationRules) {
          const rule = automationRules[id];
          if (rule.actionDevice === deviceId && rule.actionRelay === relayId && rule.isEnabled) links.push(`অটোমেশন: ${rule.name}`);
      }
      for (const id in logicGateRules) {
          const rule = logicGateRules[id];
          const outputs = rule.outputs || (rule.output ? [rule.output] : []);
          outputs.forEach(out => {
              if (out.device === deviceId && out.relay === relayId && rule.isEnabled) links.push(`লজিক গেট: ${rule.name}`);
          });
      }
      return links;
  }
  
  function isTargetOfActiveLogicRule(deviceId, relayId) {
      for (const id in logicGateRules) {
          const rule = logicGateRules[id];
          if(rule.isEnabled) {
             const outputs = rule.outputs || (rule.output ? [rule.output] : []);
             if (outputs.some(out => out.device === deviceId && out.relay === relayId)) return true;
          }
      }
      return false;
  }
  
  function toggleLinkDropdown(element, event) {
      event.stopPropagation();
      const dropdown = element.querySelector('.linked-rule-dropdown');
      const allDropdowns = document.querySelectorAll('.linked-rule-dropdown');
      allDropdowns.forEach(d => { if(d !== dropdown) d.classList.remove('show'); });
      dropdown.classList.toggle('show');
  }

  function renderControlPanel(devsData, relNames) {
      const cont = document.getElementById('control-panel-container');
      if (!cont) return;
      const sortedDevs = Object.keys(devsData).sort((a, b) => {
          const nA = parseInt(a.replace('device', '')), nB = parseInt(b.replace('device', ''));
          if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
          return a.localeCompare(b);
      });
      sortedDevs.forEach(devId => {
          if (devId.startsWith('temperature')) return;
          let section = document.getElementById(`section-${devId}`);
          if (!section) {
              section = document.createElement('section');
              section.id = `section-${devId}`;
              section.className = 'control-section';
              section.dataset.componentId = `${devId}_data`;
              section.innerHTML = `
                  <div class="section-header">
                      <h2 class="control-section-title"><span id="title-${devId}">${(deviceMetadata[devId]?.name) || devId.replace('device', 'ডিভাইস ')} কন্ট্রোল</span></h2>
                      <div><button class="pro-btn delete-btn" onclick="deleteDevice('${devId}')" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 10px;"><i class="fas fa-trash-alt"></i> Delete</button><i class="fas fa-cog path-config-icon" onclick="openPathSelector('${devId}_data', event)"></i></div>
                  </div>
                  <div class="toggle-switch-grid" id="grid-${devId}"></div>
                  <button class="pro-btn add-relay-btn" onclick="addNewRelay('${devId}')"><i class="fas fa-plus"></i> এই ডিভাইসে নতুন রিলে যোগ করুন</button>
              `;
              cont.appendChild(section);
          } else {
              const titleEl = document.getElementById(`title-${devId}`);
              const newName = (deviceMetadata[devId]?.name) || devId.replace('device', 'ডিভাইস ');
              if (titleEl && titleEl.textContent !== `${newName} কন্ট্রোল`) titleEl.textContent = `${newName} কন্ট্রোল`;
          }
          const grid = document.getElementById(`grid-${devId}`);
          const relays = devsData[devId];
          const sortedRels = Object.keys(relays).filter(k => k.startsWith('relay')).sort((a, b) => parseInt(a.replace('relay', '')) - parseInt(b.replace('relay', '')));
          sortedRels.forEach(relId => {
              const cardId = `card-${devId}-${relId}`;
              let card = document.getElementById(cardId);
              const state = relays[relId];
              const name = (relNames[devId]?.[relId]) || relId.replace('relay', 'রিলে ');
              const isOverridden = logicOverrides[devId] && logicOverrides[devId][relId];
              const linkedRules = getLinkedRules(devId, relId);
              let linkIconHtml = '';
              if (linkedRules.length > 0) {
                  const linksList = linkedRules.map(r => `<div>• ${r}</div>`).join('');
                  linkIconHtml = `<span class="linked-rule-indicator" onclick="toggleLinkDropdown(this, event)" title="লিঙ্কড রুলস"><i class="fas fa-link"></i><div class="linked-rule-dropdown">${linksList}</div></span>`;
              }
              if (!card) {
                  card = document.createElement('div');
                  card.className = `toggle-switch-container ${isOverridden ? 'manual-override' : ''}`;
                  card.id = cardId;
                  card.innerHTML = `
                      <div class="toggle-switch-header">
                          <span class="toggle-switch-label"><span class="relay-name-text">${name}</span><span class="link-icon-container">${linkIconHtml}</span><i class="fas fa-pencil-alt edit-relay-name-icon" onclick="editRelayName('${devId}','${relId}')"></i><i class="fas fa-trash-alt delete-icon" onclick="deleteRelay('${devId}','${relId}')"></i></span>
                          <div class="device-time-info"><span id="date-${devId}-${relId}"></span><span id="time-${devId}-${relId}"></span></div>
                      </div>
                      <div class="toggle-switch-body"><div class="timer-status" id="timer-status-${devId}-${relId}"></div></div>
                      <div class="toggle-switch-footer"><button class="pro-btn timer-btn" onclick="openTimerModal('${devId}','${relId}')">⏲️ টাইমার</button><label class="toggle-switch"><input type="checkbox" id="check-${devId}-${relId}" onchange="promptForRelayPassword('${devId}','${relId}',this)" ${state ? 'checked' : ''}><span class="slider"></span></label></div>
                      <i class="fas fa-hand-paper manual-override-indicator" id="override-${devId}-${relId}" style="display: ${isOverridden ? 'block' : 'none'};" onclick="clearManualOverride('${devId}', '${relId}')"></i>
                  `;
                  grid.appendChild(card);
              } else {
                  const checkbox = document.getElementById(`check-${devId}-${relId}`);
                  if (checkbox && checkbox.checked !== state) checkbox.checked = state;
                  const nameText = card.querySelector('.relay-name-text');
                  if (nameText && nameText.textContent !== name) nameText.textContent = name;
                  const linkContainer = card.querySelector('.link-icon-container');
                  if (linkContainer && linkContainer.innerHTML !== linkIconHtml) linkContainer.innerHTML = linkIconHtml;
                  const overrideIcon = document.getElementById(`override-${devId}-${relId}`);
                  if (isOverridden) { card.classList.add('manual-override'); if(overrideIcon) overrideIcon.style.display = 'block'; } else { card.classList.remove('manual-override'); if(overrideIcon) overrideIcon.style.display = 'none'; }
              }
          });
          Array.from(grid.children).forEach(child => {
              const childRelayId = child.id.split('-')[2];
              if (!relays.hasOwnProperty(childRelayId)) child.remove();
          });
      });
      updateAllTimerDisplays();
      updateAllDateTimeDisplays();
      applyUiHighlights();
  }
  
  document.addEventListener('click', function(event) {
      if (!event.target.closest('.linked-rule-indicator')) {
          document.querySelectorAll('.linked-rule-dropdown.show').forEach(d => d.classList.remove('show'));
      }
  });

  function deleteDevice(devId){promptForActionPassword('ডিভাইস মুছুন',`আপনি কি সত্যিই '${devId}' এবং এর সমস্ত রিলে মুছে ফেলতে চান?`,()=>{const updates={};updates[`${getPathFor('devices_root')}/${devId}`]=null;updates[`${getPathFor('device_metadata')}/${devId}`]=null;database.ref(getPathFor('timers')).orderByKey().startAt(devId).endAt(devId+'\uf8ff').once('value',snap=>{const timers=snap.val();if(timers)for(const key in timers)updates[`${getPathFor('timers')}/${key}`]=null;database.ref().update(updates).then(()=>logAuditEvent(`ডিভাইস '${devId}' মুছে ফেলেছেন।`));});});}
  function deleteRelay(devId,relId){const name=(relayNames[devId]?.[relId])||relId;promptForActionPassword('রিলে/লোড মুছুন',`আপনি কি সত্যিই '${name}' রিলে/লোডটি '${devId}' থেকে মুছে ফেলতে চান?`,()=>{const updates={};updates[`${getPathFor('devices_root')}/${devId}/${relId}`]=null;updates[`${getPathFor('device_metadata')}/${devId}/relay_names/${relId}`]=null;updates[`${getPathFor('timers')}/${devId}-${relId}`]=null;database.ref().update(updates).then(()=>logAuditEvent(`'${devId}' থেকে '${name}' মুছে ফেলেছেন।`));});}
  function addNewDevice(){const name=prompt("নতুন ডিভাইসের নাম দিন (যেমন: device5):");if(name&&name.trim()!==""){const devId=name.trim();if(currentDeviceStates[devId])return alert("এই নামের ডিভাইস আগে থেকেই আছে!");promptForActionPassword('নতুন ডিভাইস যোগ করুন',`আপনি কি '${devId}' নামে নতুন ডিভাইস যোগ করতে চান?`,()=>{const updates={};updates[`${getPathFor('devices_root')}/${devId}/relay1`]=false;updates[`${getPathFor('device_metadata')}/${devId}/relay_names/relay1`]="রিলে ১";updates[`${getPathFor('devices_root')}/${devId}/Load1`]=0;updates[`${getPathFor('device_metadata')}/${devId}/relay_names/Load1`]="লোড ১";database.ref().update(updates).then(()=>logAuditEvent(`নতুন ডিভাইস '${devId}' যোগ করেছেন।`));});}}
  function addNewRelay(devId){promptForActionPassword('নতুন রিলে যোগ করুন',`আপনি কি '${devId}' ডিভাইসে একটি নতুন রিলে যোগ করতে চান?`,()=>{const devData=currentDeviceStates[devId]||{};let maxNum=0;Object.keys(devData).forEach(k=>{if(k.startsWith('relay')){const num=parseInt(k.replace('relay',''));if(num>maxNum)maxNum=num;}});const newId=`relay${maxNum+1}`,newName=`রিলে ${maxNum+1}`;const updates={};updates[`${getPathFor('devices_root')}/${devId}/${newId}`]=false;updates[`${getPathFor('device_metadata')}/${devId}/relay_names/${newId}`]=newName;database.ref().update(updates).then(()=>logAuditEvent(`'${devId}' ডিভাইসে নতুন রিলে '${newName}' যোগ করেছেন।`));});}
  function addNewLoadToDevice(devId){promptForActionPassword('নতুন লোড যোগ করুন',`আপনি কি '${devId}' ডিভাইসে একটি নতুন লোড যোগ করতে চান?`,()=>{const devData=currentDeviceStates[devId]||{};let maxNum=0;Object.keys(devData).forEach(k=>{if(k.startsWith('Load')){const num=parseInt(k.replace('Load',''));if(!isNaN(num)&&num>maxNum)maxNum=num;}});const newNum=maxNum+1,newId=`Load${newNum}`,newName=`লোড ${newNum}`;const updates={};updates[`${getPathFor('devices_root')}/${devId}/${newId}`]=0;updates[`${getPathFor('device_metadata')}/${devId}/relay_names/${newId}`]=newName;database.ref().update(updates).then(()=>logAuditEvent(`'${devId}' ডিভাইসে নতুন লোড '${newName}' যোগ করেছেন।`));});}
  function toggleTabSorting(){isSortingLocked=!isSortingLocked;const btn=document.getElementById('toggle-sort-btn'),icon=btn.querySelector('i'),cont=document.getElementById('nav-tabs-container');if(isSortingLocked){icon.className='fas fa-lock';btn.childNodes[1].nodeValue=' সাজানো লক করুন';cont.classList.remove('tabs-unlocked');}else{icon.className='fas fa-lock-open';btn.childNodes[1].nodeValue=' সাজানো আনলক করুন';cont.classList.add('tabs-unlocked');}if(tabSortable)tabSortable.option('disabled',isSortingLocked);}
  function initTabSorting(){if(tabSortable)tabSortable.destroy();const cont=document.getElementById('nav-tabs-container');tabSortable=new Sortable(cont,{animation:150,ghostClass:'sortable-ghost',disabled:isSortingLocked,onEnd:saveTabOrder});}
  function saveTabOrder(){const order=Array.from(document.getElementById('nav-tabs-container').children).map(t=>t.dataset.tabId).filter(id=>id);const user=auth.currentUser;if(user&&order.length>0)database.ref(`ui_settings/${user.uid}/tabOrder`).set(order);}
  function loadAndApplyTabOrder(){const user=auth.currentUser,cont=document.getElementById('nav-tabs-container');const applyDefault=()=>{initTabSorting();const firstTab=cont.querySelector('.nav-tab');if(firstTab&&firstTab.dataset.tabId)showPage(firstTab.dataset.tabId);};if(!user)return applyDefault();database.ref(`ui_settings/${user.uid}/tabOrder`).once('value',snap=>{const order=snap.val();if(order&&Array.isArray(order)){const tabs={};Array.from(cont.children).forEach(t=>{if(t.dataset.tabId)tabs[t.dataset.tabId]=t;});order.forEach(id=>{if(tabs[id]){cont.appendChild(tabs[id]);delete tabs[id];}});for(const id in tabs)cont.appendChild(tabs[id]);}applyDefault();});}
  function renderTemperatureSensors(sensorsData,metadata){const cont=document.getElementById('temperature-sensors-container');if(!cont)return;cont.innerHTML='';const sortedIds=Object.keys(sensorsData||{}).sort((a,b)=>parseInt(a.replace('temperature',''))-parseInt(b.replace('temperature','')));if(sortedIds.length===0)return cont.innerHTML=`<p style="grid-column:1/-1;text-align:center;opacity:0.7;">কোনো তাপমাত্রা সেন্সর যোগ করা হয়নি।</p>`;sortedIds.forEach(id=>{const values=sensorsData[id],meta=metadata[id]||{name:id},cVal=values.celsius_value||0,fVal=values.fahrenheit_value||0;const cPercent=Math.min(Math.max((cVal-(-10))/(50-(-10)),0),1);const fPercent=Math.min(Math.max((fVal-20)/(140-20),0),1);const cOffset=226-(226*cPercent);const fOffset=226-(226*fPercent);const card=document.createElement('div');card.className='temp-sensor-card';card.innerHTML=`<div class="temp-card-header"><div class="temp-sensor-name"><i class="fas fa-microchip"></i> ${meta.name}</div><div class="card-actions"><i class="fas fa-pencil-alt" onclick="editTemperatureSensorName('${id}')"></i><i class="fas fa-trash-alt" onclick="deleteTemperatureSensor('${id}','${meta.name}')"></i></div></div><div class="temp-gauges-container" onclick="openTempHistoryModal('${id}','${meta.name}')" title="বিস্তারিত গ্রাফ দেখতে ক্লিক করুন"><div class="circular-progress"><svg><circle cx="50" cy="50" r="36" class="progress-bg"></circle><circle cx="50" cy="50" r="36" class="progress-bar celsius" id="gauge-c-${id}" style="stroke-dashoffset: ${cOffset};"></circle></svg><div class="gauge-value-text"><span class="val-main" id="val-c-${id}">${cVal.toFixed(1)}</span><span class="val-unit">°C</span></div><div class="gauge-label">CELSIUS</div></div><div class="circular-progress"><svg><circle cx="50" cy="50" r="36" class="progress-bg"></circle><circle cx="50" cy="50" r="36" class="progress-bar fahrenheit" id="gauge-f-${id}" style="stroke-dashoffset: ${fOffset};"></circle></svg><div class="gauge-value-text"><span class="val-main" id="val-f-${id}">${fVal.toFixed(1)}</span><span class="val-unit">°F</span></div><div class="gauge-label">FAHRENHEIT</div></div></div><div class="temp-mini-graph"><canvas id="mini-chart-${id}"></canvas></div>`;cont.appendChild(card);setTimeout(()=>initSensorHistoricalChart(id),0);});}
  function updateAllGauges(data){if(!data)return;for(const id in data){const vals=data[id],cVal=vals.celsius_value||0,fVal=vals.fahrenheit_value||0;const cText=document.getElementById(`val-c-${id}`),fText=document.getElementById(`val-f-${id}`);if(cText)cText.textContent=cVal.toFixed(1);if(fText)fText.textContent=fVal.toFixed(1);const cCircle=document.getElementById(`gauge-c-${id}`),fCircle=document.getElementById(`gauge-f-${id}`);if(cCircle){const cPercent=Math.min(Math.max((cVal-(-10))/(50-(-10)),0),1);cCircle.style.strokeDashoffset=226-(226*cPercent);}if(fCircle){const fPercent=Math.min(Math.max((fVal-20)/(140-20),0),1);fCircle.style.strokeDashoffset=226-(226*fPercent);}}}
  function addNewTemperatureSensor(){const name=prompt("নতুন সেন্সর গ্রুপের নাম দিন:");if(!name||name.trim()==='')return;promptForActionPassword('নতুন সেন্সর গ্রুপ যোগ করুন',`আপনি কি '${name}' নামে একটি নতুন সেন্সর গ্রুপ যোগ করতে চান?`,()=>{database.ref(getPathFor('devices_root')).once('value',snap=>{const devs=snap.val()||{};let maxNum=0;Object.keys(devs).forEach(k=>{if(k.startsWith('temperature')){const num=parseInt(k.replace('temperature',''),10);if(!isNaN(num)&&num>maxNum)maxNum=num;}});const newId=`temperature${maxNum+1}`;const updates={};updates[`${getPathFor('devices_root')}/${newId}/celsius_value`]=0;updates[`${getPathFor('devices_root')}/${newId}/fahrenheit_value`]=32;updates[`${getPathFor('device_metadata')}/${newId}/name`]=name.trim();database.ref().update(updates).then(()=>logAuditEvent(`নতুন তাপমাত্রা সেন্সর গ্রুপ '${name.trim()}' যোগ করেছেন।`));});});}
  function editTemperatureSensorName(id){const currentName=(deviceMetadata[id]&&deviceMetadata[id].name)||id;const newName=prompt("সেন্সরের নতুন নাম দিন:",currentName);if(newName&&newName.trim()!==""){const path=`${getPathFor('device_metadata')}/${id}/name`;database.ref(path).set(newName.trim()).then(()=>{showToast("সেন্সরের নাম সফলভাবে পরিবর্তন করা হয়েছে!","success");logAuditEvent(`তাপমাত্রা সেন্সর '${id}' এর নাম পরিবর্তন করে '${newName.trim()}' রাখা হয়েছে।`);}).catch((error)=>{console.error("Error updating name:",error);showToast("নাম পরিবর্তন করতে সমস্যা হয়েছে।","error");});}}
  function deleteTemperatureSensor(id,name){promptForActionPassword('সেন্সর গ্রুপ মুছুন',`আপনি কি সত্যিই '${name}' সেন্সর গ্রুপটি মুছে ফেলতে চান?`,()=>{const updates={};updates[`${getPathFor('devices_root')}/${id}`]=null;updates[`${getPathFor('device_metadata')}/${id}`]=null;database.ref().update(updates).then(()=>logAuditEvent(`তাপমাত্রা সেন্সর গ্রুপ '${name}' মুছে ফেলেছেন।`));});}
  function initSensorHistoricalChart(id){const canvas=document.getElementById(`mini-chart-${id}`);if(!canvas)return;if(sensorHistoricalCharts[id])sensorHistoricalCharts[id].destroy();const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,0,60);gradient.addColorStop(0,'rgba(46, 204, 113, 0.5)');gradient.addColorStop(1,'rgba(46, 204, 113, 0.0)');sensorHistoricalCharts[id]=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{data:[],borderColor:'#2ecc71',backgroundColor:gradient,borderWidth:2,pointRadius:1,pointBackgroundColor:'#fff',fill:true,tension:0.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:true,position:'right',ticks:{color:'#9ca3af',font:{size:9},maxTicksLimit:3},grid:{color:'rgba(255,255,255,0.05)',drawBorder:false}}},layout:{padding:{left:0,right:5,top:5,bottom:0}},animation:{duration:800}}});}
  function updateLiveDataOnSensorChart(id,vals){const chart=sensorHistoricalCharts[id];const label=new Date().toLocaleTimeString('bn-BD');if(chart&&vals.celsius_value!==undefined){chart.data.labels.push(label);chart.data.datasets[0].data.push(vals.celsius_value);if(chart.data.labels.length>20){chart.data.labels.shift();chart.data.datasets[0].data.shift();}chart.update();}if(!tempSensorHistory[id]){tempSensorHistory[id]={labels:[],c:[],f:[]};}tempSensorHistory[id].labels.push(label);tempSensorHistory[id].c.push(vals.celsius_value);tempSensorHistory[id].f.push(vals.fahrenheit_value);if(tempSensorHistory[id].labels.length>50){tempSensorHistory[id].labels.shift();tempSensorHistory[id].c.shift();tempSensorHistory[id].f.shift();}if(largeTempChartInstance&&document.getElementById('tempHistoryModal').style.display==='flex'){}}
  function openTempHistoryModal(id,name){const modal=document.getElementById('tempHistoryModal');document.getElementById('temp-history-title').innerHTML=`<i class="fas fa-history"></i> ${name} - বিস্তারিত ইতিহাস`;modal.style.display='flex';const ctx=document.getElementById('largeTempChart').getContext('2d');if(largeTempChartInstance){largeTempChartInstance.destroy();}const history=tempSensorHistory[id]||{labels:[],c:[],f:[]};largeTempChartInstance=new Chart(ctx,{type:'line',data:{labels:history.labels,datasets:[{label:'সেলসিয়াস (°C)',data:history.c,borderColor:'#3b82f6',backgroundColor:'rgba(59, 130, 246, 0.1)',yAxisID:'y-c',tension:0.3,fill:true},{label:'ফারেনহাইট (°F)',data:history.f,borderColor:'#f97316',backgroundColor:'rgba(249, 115, 22, 0.1)',yAxisID:'y-f',tension:0.3,fill:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false,},scales:{'y-c':{type:'linear',display:true,position:'left',title:{display:true,text:'Celsius (°C)',color:'#3b82f6'},grid:{color:'rgba(255,255,255,0.1)'}},'y-f':{type:'linear',display:true,position:'right',title:{display:true,text:'Fahrenheit (°F)',color:'#f97316'},grid:{drawOnChartArea:false}},x:{ticks:{color:'#9ca3af'},grid:{display:false}}},plugins:{legend:{labels:{color:'#fff'}},tooltip:{backgroundColor:'rgba(0,0,0,0.8)',titleColor:'#fff',bodyColor:'#fff'}}}});}
  function closeTempHistoryModal(){document.getElementById('tempHistoryModal').style.display='none';}
  function confirmDeleteAllLogs(){promptForActionPassword('সমস্ত লগ মুছে ফেলুন','আপনি কি নিশ্চিত যে আপনি অডিট লগের সমস্ত ইতিহাস মুছে ফেলতে চান? এটি ফিরিয়ে আনা যাবে না।',()=>{const logPath=getPathFor('audit_log');database.ref(logPath).remove().then(()=>{showToast('সমস্ত অডিট লগ সফলভাবে মুছে ফেলা হয়েছে!','success');logAuditEvent('অডিট লগের সমস্ত ইতিহাস মুছে ফেলা হয়েছে।');}).catch(error=>{showToast('লগ মুছতে সমস্যা হয়েছে: '+error.message,'error');});});}

  // --- NEW: DYNAMIC NOTES LOGIC ---
  function renderNotes(data) {
      const container = document.getElementById('notes-dynamic-container');
      container.innerHTML = '';
      if (!data || Object.keys(data).length === 0) {
          container.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--text-dim);">
            <i class="fas fa-file-alt" style="font-size:3rem;color:var(--secondary-color);display:block;margin-bottom:16px;opacity:0.5;"></i>
            <p>এখনো কোনো নোট যোগ করা হয়নি।</p><p style="font-size:0.85rem;">নিচের বাটনে ক্লিক করে প্রথম নোট যোগ করুন।</p>
          </div>`;
          return;
      }
      const sortedKeys = Object.keys(data).sort((a,b) => (data[a].order||0) - (data[b].order||0));
      const typeLabels = { text:'টেক্সট', note_box:'নোট বক্স', list:'লিস্ট', image:'ছবি' };
      const sizeLabels = ['25%','50%','75%','100%'];
      const sizeCodes  = [25, 50, 75, 100];

      sortedKeys.forEach((key, idx) => {
          const note = data[key];
          const div = document.createElement('div');
          div.className = 'note-block';
          div.dataset.id = key;
          div.draggable = true;
          div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', key); div.classList.add('dragging'); });
          div.addEventListener('dragend',   () => div.classList.remove('dragging'));
          div.addEventListener('dragover',  e => { e.preventDefault(); div.classList.add('drag-over'); });
          div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
          div.addEventListener('drop', e => {
              e.preventDefault();
              div.classList.remove('drag-over');
              const fromKey = e.dataTransfer.getData('text/plain');
              if (fromKey === key) return;
              swapNoteOrders(fromKey, key, data);
          });

          const isFirst = idx === 0;
          const isLast  = idx === sortedKeys.length - 1;
          const curSize = note.imageSize || 100;

          // Size controls for image
          const sizeControls = note.type === 'image' ? `
            <div class="img-size-controls">
              <span>সাইজ:</span>
              ${sizeCodes.map(s => `<button class="img-size-btn ${s===curSize?'active':''}" onclick="setImageSize('${key}',${s})" title="${s}%">${s}%</button>`).join('')}
            </div>` : '';

          // Controls bar
          const ctrlBar = `<div class="note-controls-bar">
            <div class="note-controls-left">
              <span class="note-drag-handle" title="টেনে সাজান"><i class="fas fa-grip-vertical"></i></span>
              <span class="note-type-badge badge-${note.type}">${typeLabels[note.type]||note.type}</span>
              ${note.title ? `<span style="font-size:0.85rem;font-weight:600;color:var(--text-color);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${note.title}</span>` : ''}
              ${sizeControls}
            </div>
            <div class="note-controls-right">
              <button class="note-ctrl-btn move" onclick="moveNote('${key}','up')" ${isFirst?'disabled':''} title="উপরে নিন"><i class="fas fa-chevron-up"></i></button>
              <button class="note-ctrl-btn move" onclick="moveNote('${key}','down')" ${isLast?'disabled':''} title="নিচে নিন"><i class="fas fa-chevron-down"></i></button>
              <button class="note-ctrl-btn" onclick="editNote('${key}')" title="এডিট করুন"><i class="fas fa-pencil-alt"></i></button>
              <button class="note-ctrl-btn danger" onclick="deleteNote('${key}')" title="মুছুন"><i class="fas fa-trash-alt"></i></button>
            </div>
          </div>`;

          // Content
          let contentHtml = '';
          switch(note.type) {
              case 'text':
                  contentHtml = `<p class="note-paragraph">${note.content}</p>`;
                  break;
              case 'note_box':
                  contentHtml = `<div class="note-letter">
                      <div class="note-letter-title">${note.title||'নোট'}</div>
                      <div class="note-letter-content">${note.content}</div>
                  </div>`;
                  break;
              case 'list':
                  const items = (note.content||'').split('\n').filter(Boolean).map(i=>`<li>${i}</li>`).join('');
                  contentHtml = `<ul style="padding-left:20px;line-height:1.8;margin:0;">${items}</ul>`;
                  break;
              case 'image':
                  const sizeClass = `size-${curSize}`;
                  contentHtml = `<div class="note-img-wrap ${sizeClass}">
                    <div class="note-image" onclick="openImageModal('${note.url}','${note.caption||''}')">
                      <img src="${note.url}" alt="${note.caption||''}" style="width:100%;display:block;">
                      ${note.caption ? `<div class="note-image-caption">${note.caption}</div>` : ''}
                    </div>
                  </div>`;
                  break;
          }

          div.innerHTML = ctrlBar + `<div class="note-content-wrapper">${contentHtml}</div>`;
          container.appendChild(div);
      });
  }

  function moveNote(id, direction) {
      const data = currentNotes;
      const sortedKeys = Object.keys(data).sort((a,b) => (data[a].order||0) - (data[b].order||0));
      const idx = sortedKeys.indexOf(id);
      if (direction === 'up'   && idx <= 0) return;
      if (direction === 'down' && idx >= sortedKeys.length-1) return;
      const swapIdx = direction === 'up' ? idx-1 : idx+1;
      const swapId  = sortedKeys[swapIdx];
      const orderA  = data[id].order || 0;
      const orderB  = data[swapId].order || 0;
      const updates = {};
      updates[`${getPathFor('diagram_notes')}/${id}/order`]     = orderB;
      updates[`${getPathFor('diagram_notes')}/${swapId}/order`] = orderA;
      database.ref().update(updates).then(() => showToast(direction==='up'?'উপরে নেওয়া হয়েছে':'নিচে নেওয়া হয়েছে','success'));
  }

  function swapNoteOrders(fromKey, toKey, data) {
      const orderA = data[fromKey].order || 0;
      const orderB = data[toKey].order   || 0;
      const updates = {};
      updates[`${getPathFor('diagram_notes')}/${fromKey}/order`] = orderB;
      updates[`${getPathFor('diagram_notes')}/${toKey}/order`]   = orderA;
      database.ref().update(updates).then(() => showToast('পুনরায় সাজানো হয়েছে','success'));
  }

  function setImageSize(id, size) {
      database.ref(`${getPathFor('diagram_notes')}/${id}/imageSize`).set(size)
          .then(() => showToast(`ছবির সাইজ ${size}% করা হয়েছে`,'success'));
  }

  function selectModalSize(size) {
      document.getElementById('note-image-size').value = size;
      [25,50,75,100].forEach(s => {
          const btn = document.getElementById('msize-'+s);
          if(btn) btn.classList.toggle('active', s === size);
      });
  }

  function openAddNoteModal() {
      editingNoteId = null;
      document.getElementById('note-modal-title').textContent = 'নতুন নোট যোগ করুন';
      document.getElementById('note-type').value = 'text';
      document.getElementById('note-title-input').value = '';
      document.getElementById('note-content-input').value = '';
      document.getElementById('note-image-url').value = '';
      document.getElementById('note-image-caption').value = '';
      selectModalSize(50);
      handleNoteTypeChange();
      document.getElementById('noteEditorModal').style.display = 'flex';
  }

  function editNote(id) {
      editingNoteId = id;
      const note = currentNotes[id];
      if(!note) return;
      document.getElementById('note-modal-title').textContent = 'নোট এডিট করুন';
      document.getElementById('note-type').value = note.type;
      document.getElementById('note-title-input').value = note.title || '';
      document.getElementById('note-content-input').value = note.content || '';
      if(note.type === 'image') {
          document.getElementById('note-image-url').value = note.url || '';
          document.getElementById('note-image-caption').value = note.caption || '';
          selectModalSize(note.imageSize || 50);
      }
      handleNoteTypeChange();
      document.getElementById('noteEditorModal').style.display = 'flex';
  }

  function saveNote() {
      const type    = document.getElementById('note-type').value;
      const title   = document.getElementById('note-title-input').value;
      const content = document.getElementById('note-content-input').value;
      const noteData = { type, title, content };
      if(!editingNoteId) noteData.order = Date.now();
      if(type === 'image') {
          noteData.url       = document.getElementById('note-image-url').value;
          noteData.caption   = document.getElementById('note-image-caption').value;
          noteData.imageSize = parseInt(document.getElementById('note-image-size').value) || 50;
          if(!noteData.url) return showToast('ছবির লিঙ্ক দিন', 'error');
      } else if(!content && type !== 'image') {
          return showToast('বিষয়বস্তু লিখুন', 'error');
      }
      if(editingNoteId) {
          database.ref(`${getPathFor('diagram_notes')}/${editingNoteId}`).update(noteData)
              .then(() => { closeNoteModal(); showToast('নোট আপডেট হয়েছে', 'success'); });
      } else {
          database.ref(getPathFor('diagram_notes')).push(noteData)
              .then(() => { closeNoteModal(); showToast('নতুন নোট যোগ হয়েছে', 'success'); });
      }
  }

  function deleteNote(id) {
      promptForActionPassword('নোট মুছুন', 'আপনি কি নিশ্চিত এই নোটটি মুছে ফেলতে চান?', () => {
          database.ref(`${getPathFor('diagram_notes')}/${id}`).remove()
              .then(() => showToast('নোট মুছে ফেলা হয়েছে', 'success'));
      });
  }


  function closeNoteModal() {
      document.getElementById('noteEditorModal').style.display = 'none';
  }

  function handleNoteTypeChange() {
      const type = document.getElementById('note-type').value;
      const contentGroup = document.getElementById('note-content-group');
      const imageGroup = document.getElementById('note-image-group');
      const titleGroup = document.getElementById('note-title-group');

      if(type === 'image') {
          contentGroup.style.display = 'none';
          imageGroup.style.display = 'block';
          titleGroup.style.display = 'none';
      } else if (type === 'text') {
          contentGroup.style.display = 'block';
          imageGroup.style.display = 'none';
          titleGroup.style.display = 'none'; // Paragraph usually doesn't need title
      } else {
          contentGroup.style.display = 'block';
          imageGroup.style.display = 'none';
          titleGroup.style.display = 'block';
      }
  }
  
  document.getElementById('note-type').addEventListener('change', handleNoteTypeChange);

  // Initialize Default Data if Firebase is empty (One-time setup for user)
  function initializeDefaultNotes(existingData) {
      if(existingData && Object.keys(existingData).length > 0) return; // Already has data
      
      const defaults = [
          { type: 'text', content: 'এই পৃষ্ঠাটি আমাদের প্রকল্পের জন্য গুরুত্বপূর্ণ নোট এবং ডকুমেন্টেশন সংরক্ষণ করতে ব্যবহৃত হবে। এখানে আপনি প্রকল্পের বিভিন্ন ডায়াগ্রাম, নোট এবং গুরুত্বপূর্ণ তথ্য পাবেন যা প্রকল্পের উন্নয়ন এবং রক্ষণাবেক্ষণের জন্য প্রয়োজনীয়।', order: 1 },
          { type: 'note_box', title: 'গুরুত্বপূর্ণ নোট #1', content: 'প্রকল্পের সার্কিট ডায়াগ্রামটি নিচে দেওয়া হয়েছে। দয়া করে নিশ্চিত করুন যে সমস্ত সংযোগ সঠিকভাবে করা হয়েছে এবং প্রতিটি কম্পোনেন্ট সঠিকভাবে স্থাপন করা হয়েছে। সার্কিট ডায়াগ্রামে কোন পরিবর্তন প্রয়োজন হলে দয়া করে টিম লিডারকে জানান।', order: 2 },
          { type: 'image', url: 'electrical-single-line-diagram-4.jpg', caption: 'প্রকল্পের সার্কিট ডায়াগ্রাম', order: 3 },
          { type: 'image', url: '6005990.jpg', caption: 'সিস্টেম ফ্লো চার্ট', order: 4 },
          { type: 'list', title: 'প্রকল্পের মূল বৈশিষ্ট্য', content: 'রিয়েল-টাইম ডিভাইস মনিটরিং\nএনার্জি কনজাম্পশন ট্র্যাকিং\nরিমোট কন্ট্রোল সক্ষমতা\nডেটা ভিজুয়ালাইজেশন\nমাল্টি-ডিভাইস সাপোর্ট', order: 5 },
          { type: 'note_box', title: 'গুরুত্বপূর্ণ নোট #2', content: 'সিস্টেম আপডেটের সময় নিচের সতর্কতাগুলো মেনে চলুন:\n- আপডেট করার আগে ব্যাকআপ নিন\n- প্রোডাকশন সিস্টেমে সরাসরি আপডেট করবেন না\n- পরিবর্তন করার আগে টিমের সাথে আলোচনা করুন\n- সমস্ত পরিবর্তন ডকুমেন্ট করুন', order: 6 },
          { type: 'list', title: 'সিস্টেম আর্কিটেকচার', content: 'IoT ডিভাইস - ডাটা কালেকশন এবং একচুয়েশন\nক্লাউড সার্ভার - ডাটা প্রসেসিং এবং স্টোরেজ\nওয়েব ইন্টারফেস - ইউজার ইন্টারঅ্যাকশন', order: 7 },
          { type: 'image', url: 'https://i.ibb.co/5KJZ0Lm/system-architecture.jpg', caption: 'সিস্টেম আর্কিটেকচার ডায়াগ্রাম', order: 8 },
          { type: 'list', title: 'ভবিষ্যতের উন্নয়ন পরিকল্পনা', content: 'মোবাইল অ্যাপ্লিকেশন সংযোজন\nAI-ভিত্তিক এনার্জি অপ্টিমাইজেশন\nমাল্টি-ইউজার সাপোর্ট\nঅ্যাডভান্সড রিপোর্টিং সিস্টেম\nথার্ড-পার্টি ইন্টিগ্রেশন', order: 9 }
      ];
      
      const updates = {};
      defaults.forEach(note => {
          const newKey = database.ref(getPathFor('diagram_notes')).push().key;
          updates[`${getPathFor('diagram_notes')}/${newKey}`] = note;
      });
      database.ref().update(updates);
  }

  function detachAllListeners() {
      activeListeners.forEach(({ ref, eventType, callback }) => ref.off(eventType, callback));
      activeListeners = [];
  }
  
  function setupFirebaseListeners() {
    detachAllListeners();

    const addListener = (path, eventType, callback) => {
        if (!path) return;
        const ref = database.ref(path);
        ref.on(eventType, callback, (error) => {
            console.error(`Listener error on path: ${path}`, error);
            showToast(`Error reading path: ${path}`, 'error');
        });
        activeListeners.push({ ref, eventType, callback });
    };

    const componentConfig = {
        device1_data: (snapshot) => updateSingleDevicePage('device1', snapshot.val()),
        device2_data: (snapshot) => updateSingleDevicePage('device2', snapshot.val()),
        device3_data: (snapshot) => updateSingleDevicePage('device3', snapshot.val()),
        device4_data: (snapshot) => updateSingleDevicePage('device4', snapshot.val()),
        
        devices_root: (snapshot) => {
            previousDeviceStates = currentDeviceStates;
            const allDevices = snapshot.val() || {};
            const regularDevices = Object.keys(allDevices).filter(key => !key.startsWith('temperature')).reduce((obj, key) => ({ ...obj, [key]: allDevices[key] }), {});
            currentDeviceStates = regularDevices;
            renderControlPanel(regularDevices, relayNames);
            updateAutomationFormOptions();
            populateLogicGateSelectors();
            evaluateLogicGateRules();
            Object.keys(regularDevices).forEach(deviceId => {
                checkAutomationRules('device', {
                    deviceId: deviceId,
                    states: regularDevices[deviceId]
                });
            });
        },
        
        temperature_data: (snapshot) => {
            const allDevices = snapshot.val() || {};
            const temps = Object.keys(allDevices).filter(key => key.startsWith('temperature')).reduce((obj, key) => ({ ...obj, [key]: allDevices[key] }), {});
            currentTempData = temps;
            const container = document.getElementById('temperature-sensors-container');
            const isContainerEmpty = container && container.children.length === 0;
            const isSensorListChanged = JSON.stringify(Object.keys(sensorHistoricalCharts).sort()) !== JSON.stringify(Object.keys(temps).sort());
            if (isSensorListChanged || isContainerEmpty) {
                renderTemperatureSensors(temps, deviceMetadata);
            }
            updateAllGauges(temps);
            for (const id in temps) updateLiveDataOnSensorChart(id, temps[id]);
        },
        
        device_metadata: (snapshot) => {
            deviceMetadata = snapshot.val() || {};
            relayNames = {};
            for (const devId in deviceMetadata) {
                if (deviceMetadata[devId].relay_names) relayNames[devId] = deviceMetadata[devId].relay_names;
            }
            if (Object.keys(currentDeviceStates).length > 0) renderControlPanel(currentDeviceStates, relayNames);
            if (Object.keys(currentTempData).length > 0) renderTemperatureSensors(currentTempData, deviceMetadata);
        },
        
        energymonitoring_root: (snapshot) => {
            const data = snapshot.val();
            if (data) {
                updateEnergyData(data);
                checkAutomationRules('energy', data); 
            }
        },
        
        energymonitoring_history: (snapshot) => { 
            if(snapshot.val()) { 
                historicalData = { ...snapshot.val(), ...historicalData };
                if (document.getElementById('page6').classList.contains('active')) updateAdvancedChart(); 
            }
        },
        timers: (snapshot) => { allTimersData = snapshot.val() || {}; updateAllTimerDisplays(); },
        
        automation_rules: (snapshot) => {
            automationRules = snapshot.val() || {};
            const cont = document.getElementById('automation-rule-list');
            if(!cont) return; cont.innerHTML = Object.keys(automationRules).length === 0 ? '<p>কোনো অটোমেশন রুল তৈরি করা হয়নি।</p>' : '';
            for (const id in automationRules) {
                const r = automationRules[id];
                const card = document.createElement('div'); card.className = `rule-card ${r.isEnabled ? '' : 'disabled'}`;
                let desc = `<strong>${r.name}:</strong> `;
                if (r.triggerSource === 'energy') desc += `যদি <strong>${r.triggerMetric}</strong> এর মান <strong>${r.triggerCondition} ${r.triggerValue}</strong> হয়, `;
                else if (r.triggerSource === 'time') desc += `যদি সময় <strong>${r.triggerValue}</strong> হয়, `;
                else if (r.triggerSource === 'device') desc += `যদি <strong>${r.triggerDevice.replace('device', 'ডিভাইস ')}</strong> এর <strong>'${(relayNames[r.triggerDevice]?.[r.triggerRelay]) || r.triggerRelay}'</strong> <strong>${r.triggerState ? 'ON' : 'OFF'}</strong> হয়, `;
                desc += `তবে <strong>${r.actionDevice.replace('device', 'ডিভাইস ')}</strong> এর <strong>'${(relayNames[r.actionDevice]?.[r.actionRelay]) || r.actionRelay}'</strong> কে <strong>${r.actionState ? 'ON' : 'OFF'}</strong> করুন।`;
                if (r.sendNotification) desc += ` এবং একটি নোটিফিকেশন পাঠান।`;
                card.innerHTML = `<div class="rule-description">${desc}</div><div class="rule-actions"><button class="pro-btn rule-btn toggle-rule-btn ${r.isEnabled ? 'enabled' : 'disabled'}" onclick="toggleRule('${id}')">${r.isEnabled ? 'নিষ্ক্রিয়' : 'সক্রিয়'} করুন</button><button class="pro-btn rule-btn edit-btn" onclick="editAutomationRule('${id}')">এডিট</button><button class="pro-btn rule-btn delete-btn" onclick="deleteRule('${id}')">ডিলিট</button></div>`;
                cont.appendChild(card);
            }
            if(currentDeviceStates && Object.keys(currentDeviceStates).length > 0) renderControlPanel(currentDeviceStates, relayNames);
            ['device1', 'device2', 'device3', 'device4'].forEach(devId => {
                 if(document.getElementById(`page${devId.replace('device','')}`).classList.contains('active')) updateSingleDevicePage(devId, currentDeviceStates[devId]);
            });
        },
        
        logic_gate_rules: (snapshot) => { 
            logicGateRules = snapshot.val() || {}; 
            renderLogicGateRules();
            evaluateLogicGateRules(); 
            if(currentDeviceStates && Object.keys(currentDeviceStates).length > 0) renderControlPanel(currentDeviceStates, relayNames);
            ['device1', 'device2', 'device3', 'device4'].forEach(devId => {
                 if(document.getElementById(`page${devId.replace('device','')}`).classList.contains('active')) updateSingleDevicePage(devId, currentDeviceStates[devId]);
            });
        },
        
        logic_gate_overrides: (snapshot) => { logicOverrides = snapshot.val() || {}; },
        system_status: (snapshot) => {
            const d = snapshot.val(); if (!d) return;
            const updateStatus = (elemId, val, textConn, textDisc, indId) => {
                document.getElementById(elemId).textContent = val ? textConn : textDisc;
                document.getElementById(indId).className = `status-indicator ${val ? 'connected' : 'disconnected'}`;
            };
            updateStatus('status-wifi', d.wifi, 'কানেক্টেড', 'ডিসকানেক্টেড', 'indicator-wifi'); updateStatus('status-firebase', d.firebase, 'কানেক্টেড', 'ডিসকানেক্টেড', 'indicator-firebase'); updateStatus('status-mega', d.mega, 'কানেক্টেড', 'ডিসকানেক্টেড', 'indicator-mega'); updateStatus('status-sd-card', d.sd_card, 'উপস্থিত', 'অনুপস্থিত', 'indicator-sd-card');
            document.getElementById('status-uptime').textContent = d.uptime || '--';
            const ram = d.ram_usage || 0; document.getElementById('status-ram-usage').textContent = `${ram}%`; document.getElementById('ram-progress-fill').style.width = `${ram}%`;
        },
        scenes: (snapshot) => {
            const scenes = snapshot.val() || {}, cont = document.getElementById('scene-buttons-container'); if (!cont) return;
            cont.innerHTML = '<button class="pro-btn create-scene-btn" onclick="openSceneModal()"><i class="fas fa-plus"></i> নতুন দৃশ্য তৈরি করুন</button>';
            for (const id in scenes) {
                const s = scenes[id], item = document.createElement('div'); item.className = 'scene-item-container';
                item.innerHTML = `<button class="pro-btn scene-btn" onclick="executeScene('${id}', JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(s.actions))}')), '${s.name}')">${s.name}</button><i class="fas fa-trash-alt delete-scene-icon" onclick="deleteScene('${id}', '${s.name}')"></i>`;
                cont.insertBefore(item, cont.querySelector('.create-scene-btn'));
            }
        },
        custom_pages: (snapshot) => { renderCustomPagesFromFirebase(snapshot.val() || {}); loadAndApplyTabOrder(); },
        
        // NEW LISTENER for Diagram Notes
        diagram_notes: (snapshot) => {
            const notes = snapshot.val();
            currentNotes = notes || {};
            if(!notes) {
                initializeDefaultNotes(notes);
            } else {
                renderNotes(notes);
            }
        }
    };
    
    Object.keys(componentConfig).forEach(componentId => {
        addListener(getPathFor(componentId), 'value', componentConfig[componentId]);
    });
    
    loadAuditLog();
}


  function loadAuditLog() {
    const logList=document.getElementById('audit-log-list');
    let allLogs=[],userLoaded=false,devLoaded=false;
    const render=()=>{if(!userLoaded||!devLoaded)return;allLogs.sort((a,b)=>b.timestamp-a.timestamp);logList.innerHTML='';if(allLogs.length===0)return logList.innerHTML='<p>কোনো লগ পাওয়া যায়নি...</p>';allLogs.forEach(l=>{const isSys=l.user==='সিস্টেম অটোমেশন'||l.source==='device'||l.user==='সিস্টেম (লজিক গেট)',item=document.createElement('div');item.className=`audit-log-item ${isSys?'system-log':''}`;const time=new Date(l.timestamp).toLocaleString('bn-BD');item.innerHTML=`<div class="audit-log-header"><span class="audit-log-user ${isSys?'audit-log-user-system':''}"><i class="fas ${isSys?'fa-cogs':'fa-user'}"></i> ${l.source==='device'?'ডিভাইস অ্যাক্টিভিটি':l.user}</span><span class="audit-log-timestamp">🕒 ${time}</span></div><div class="audit-log-action">${l.source==='device'?l.message:l.action}</div>`;logList.appendChild(item);});};
    database.ref(getPathFor('audit_log')).limitToLast(100).on('value', snap=>{allLogs=allLogs.filter(l=>l.source!=='user').concat(Object.values(snap.val()||{}).map(l=>({...l,source:'user'})));userLoaded=true;render();});
    database.ref(getPathFor('device_activity_log')).limitToLast(100).on('value', snap=>{allLogs=allLogs.filter(l=>l.source!=='device').concat(Object.values(snap.val()||{}).map(l=>({...l,source:'device'})));devLoaded=true;render();});
  }
  
  // Custom page functions...
  function openAddPageModal(){document.getElementById('addPageModal').style.display='flex';document.getElementById('new-page-name').focus();}
  function closeAddPageModal(){document.getElementById('addPageModal').style.display='none';document.getElementById('new-page-name').value='';document.getElementById('addPagePasswordInput').value='';document.getElementById('add-page-error').textContent='';}
  function saveNewPage(){const name=document.getElementById('new-page-name').value.trim(),pass=document.getElementById('addPagePasswordInput').value,err=document.getElementById('add-page-error');if(!name||!pass)return err.textContent='নাম এবং পাসওয়ার্ড দিন।';if(pass===correctOperatingPassword){const ref=database.ref(getPathFor('custom_pages')).push({name:name,components:[]});logAuditEvent(`নতুন কাস্টম পেজ '${name}' তৈরি করেছেন।`);closeAddPageModal();openPageEditorModal(ref.key,name,new Event('click'));}else{err.textContent='❌ ভুল অপারেটিং পাসওয়ার্ড!';}}
  function openPageEditorModal(id,name,e){if(e)e.stopPropagation();currentPageToEdit=id;document.getElementById('page-editor-title').textContent=`'${name}' পেজটি এডিট করুন`;database.ref(`${getPathFor('custom_pages')}/${id}/components`).once('value',snap=>{document.getElementById('page-editor-content').innerHTML=generateComponentSelectorHTML(snap.val()||[]);document.getElementById('pageEditorModal').style.display='flex';});}
  function closePageEditorModal(){document.getElementById('pageEditorModal').style.display='none';currentPageToEdit=null;}
  function generateComponentSelectorHTML(currComps=[]){
    const isChecked=comp=>currComps.some(c=>JSON.stringify(c)===JSON.stringify(comp));
    const mkChk=(label,comp,icon='fa-check-square')=>{
      const ch=isChecked(comp)?'checked':'';
      const compStr=JSON.stringify(comp).replace(/'/g,"&apos;");
      return `<label><input type="checkbox" data-component='${JSON.stringify(comp)}' ${ch}> <i class="fas ${icon}" style="color:var(--secondary-color);font-size:0.85rem;"></i> ${label}</label>`;
    };
    let html=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">`;
    for(let i=1;i<=4;i++){
      const devId=`device${i}`;
      html+=`<div class="page-editor-group">
        <h4><i class="fas fa-server" style="margin-right:6px;"></i>ডিভাইস ${i}</h4>
        ${mkChk('কন্ট্রোল কার্ড',{type:'device_cards',deviceId:devId},'fa-toggle-on')}
        ${mkChk('স্ট্যাটাস সামারি',{type:'device_summary',deviceId:devId},'fa-chart-bar')}
      </div>`;
    }
    html+=`<div class="page-editor-group">
      <h4><i class="fas fa-bolt" style="margin-right:6px;"></i>এনার্জি ও গ্রাফ</h4>
      ${mkChk('এনার্জি মনিটর',{type:'energy_monitor'},'fa-bolt')}
      ${mkChk('এডভান্সড গ্রাফ',{type:'advanced_graph'},'fa-chart-line')}
    </div>`;
    html+=`<div class="page-editor-group">
      <h4><i class="fas fa-th-large" style="margin-right:6px;"></i>অন্যান্য</h4>
      ${mkChk('কন্ট্রোল প্যানেল',{type:'control_panel'},'fa-sliders-h')}
      ${mkChk('দৃশ্য (Scenes)',{type:'scenes'},'fa-film')}
      ${mkChk('সিস্টেম স্ট্যাটাস',{type:'system_status'},'fa-info-circle')}
      ${mkChk('তাপমাত্রা মনিটর',{type:'temperature'},'fa-thermometer-half')}
      ${mkChk('অটোমেশন রুলস',{type:'automation'},'fa-robot')}
    </div>`;
    html+=`</div>`;
    return html;
  }
  function savePageComponents(){if(!currentPageToEdit)return;const comps=[];document.querySelectorAll('#pageEditorModal input:checked').forEach(cb=>comps.push(JSON.parse(cb.dataset.component)));database.ref(`${getPathFor('custom_pages')}/${currentPageToEdit}/components`).set(comps).then(()=>closePageEditorModal());}
  function deleteCustomPage(id,name,e){e.stopPropagation();promptForActionPassword('পেজ মুছুন',`আপনি কি সত্যিই '${name}' পেজটি মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('custom_pages')}/${id}`).remove().then(()=>showPage('page1'))); }
  function renderCustomPagesFromFirebase(pagesData){const navCont=document.getElementById('nav-tabs-container'),pagesCont=document.getElementById('dynamic-pages-container');document.querySelectorAll('.custom-page-tab, .custom-page').forEach(el=>el.remove());for(const id in pagesData){const page=pagesData[id],navTab=document.createElement('div');navTab.className='nav-tab custom-page-tab';navTab.onclick=()=>showPage(`custom_page_${id}`);navTab.dataset.tabId=`custom_page_${id}`;navTab.innerHTML=`<span>${page.name}</span><span class="page-actions"><i class="fas fa-pencil-alt" onclick="openPageEditorModal('${id}','${page.name}',event)"></i><i class="fas fa-trash-alt" onclick="deleteCustomPage('${id}','${page.name}',event)"></i></span>`;navCont.insertBefore(navTab,document.getElementById('add-new-page-btn'));const pageCont=document.createElement('main');pageCont.id=`custom_page_${id}`;pageCont.className='device-page custom-page';renderDynamicPageContent(pageCont,page.components||[]);pagesCont.appendChild(pageCont);}}
  function renderDynamicPageContent(cont,comps){
    cont.innerHTML=`<div class="dynamic-page-grid"></div>`;
    const grid=cont.querySelector('.dynamic-page-grid');
    const pageMap={'energy_monitor':'page5','advanced_graph':'page6','temperature':'page13','automation':'page9'};
    comps.forEach(c=>{
      let el;
      switch(c.type){
        case 'device_cards':    el=document.querySelector(`#page${c.deviceId.replace('device','')} .device-cards`); break;
        case 'device_summary':  el=document.getElementById(`${c.deviceId}-summary`); break;
        case 'control_panel':   el=document.getElementById('page8'); break;
        case 'scenes':          el=document.getElementById('page-component-scenes'); break;
        case 'system_status':   el=document.getElementById('page-component-system-status'); break;
        case 'energy_monitor':  el=document.getElementById('page5'); break;
        case 'advanced_graph':  el=document.getElementById('page6'); break;
        case 'temperature':     el=document.getElementById('page13'); break;
        case 'automation':      el=document.getElementById('page9'); break;
        default: break;
      }
      if(el){
        const clone=el.cloneNode(true);
        const ts=Date.now();
        clone.querySelectorAll('canvas').forEach(can=>{ can.id=`clone_${can.id}_${ts}`; });
        clone.querySelectorAll('[id]').forEach(el2=>{ if(!el2.id.startsWith('clone_')) el2.id=`clone_${el2.id}_${ts}`; });
        clone.style.display='block';
        grid.appendChild(clone);
      }
    });
    if(comps.length===0){
      grid.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-dim);grid-column:1/-1;">
        <i class="fas fa-plus-circle" style="font-size:2.5rem;color:var(--secondary-color);display:block;margin-bottom:12px;"></i>
        <p style="font-size:1rem;">এই পেজে এখনো কোনো কম্পোনেন্ট যোগ করা হয়নি।</p>
        <p style="font-size:0.85rem;opacity:0.6;">নেভিগেশনে পেজের নামের পাশে ✏️ আইকনে ক্লিক করে কম্পোনেন্ট যোগ করুন।</p>
      </div>`;
    }
  }

    let logicInputCount = 0;
    let logicOutputCount = 0;

    function initLogicGateInputs() {
        document.getElementById('logic-inputs-list').innerHTML = '';
        logicInputCount = 0;
        addLogicInput();
        addLogicInput();
        document.getElementById('logic-outputs-list').innerHTML = '';
        logicOutputCount = 0;
        addLogicOutput();
        populateLogicGateSelectors();
    }

    function addLogicInput() {
        logicInputCount++;
        const container = document.getElementById('logic-inputs-list');
        const inputGroup = document.createElement('div');
        inputGroup.className = 'logic-input-group';
        inputGroup.id = `logic-input-group-${logicInputCount}`;
        inputGroup.innerHTML = `
            <div class="form-group"><label>ইনপুট ${logicInputCount} ডিভাইস</label><select class="logic-input-device"></select></div>
            <div class="form-group"><label>ইনপুট ${logicInputCount} রিলে</label><select class="logic-input-relay"></select></div>
            <div class="form-group"><label>অবস্থা</label><select class="logic-input-state"><option value="true">ON</option><option value="false">OFF</option></select></div>
            <i class="fas fa-trash-alt delete-icon" onclick="removeLogicInput('logic-input-group-${logicInputCount}')"></i>
        `;
        container.appendChild(inputGroup);
        populateNewInputSelectors(inputGroup);
    }
    
    function addLogicOutput() {
        logicOutputCount++;
        const container = document.getElementById('logic-outputs-list');
        const outputGroup = document.createElement('div');
        outputGroup.className = 'logic-output-group';
        outputGroup.id = `logic-output-group-${logicOutputCount}`;
        outputGroup.innerHTML = `
            <div class="form-group"><label>আউটপুট ডিভাইস</label><select class="logic-output-device"></select></div>
            <div class="form-group"><label>আউটপুট রিলে</label><select class="logic-output-relay"></select></div>
            <div class="form-group"><label>অ্যাকশন</label><select class="logic-output-state"><option value="true">ON করুন</option><option value="false">OFF করুন</option></select></div>
            <i class="fas fa-trash-alt delete-icon" onclick="removeLogicOutput('logic-output-group-${logicOutputCount}')"></i>
        `;
        container.appendChild(outputGroup);
        populateNewOutputSelectors(outputGroup);
    }

    function removeLogicInput(groupId) {
        const container = document.getElementById('logic-inputs-list');
        if (container.children.length <= 2) { showToast("কমপক্ষে দুটি ইনপুট প্রয়োজন।", "warning"); return; }
        document.getElementById(groupId)?.remove();
    }
    
    function removeLogicOutput(groupId) {
        const container = document.getElementById('logic-outputs-list');
        if (container.children.length <= 1) { showToast("কমপক্ষে একটি আউটপুট প্রয়োজন।", "warning"); return; }
        document.getElementById(groupId)?.remove();
    }
    
    function populateNewInputSelectors(inputGroup) {
        const deviceSelect = inputGroup.querySelector('.logic-input-device');
        const relaySelect = inputGroup.querySelector('.logic-input-relay');
        const sortedDeviceIds = Object.keys(currentDeviceStates).sort((a, b) => parseInt(a.replace('device', '')) - parseInt(b.replace('device', '')));
        deviceSelect.innerHTML = sortedDeviceIds.map(id => `<option value="${id}">${(deviceMetadata[id]?.name) || id.replace('device', 'ডিভাইস ')}</option>`).join('');
        const updateRelays = () => {
            relaySelect.innerHTML = '';
            const selectedDeviceId = deviceSelect.value;
            if (currentDeviceStates[selectedDeviceId]) {
                const relays = Object.keys(currentDeviceStates[selectedDeviceId]).filter(key => key.startsWith('relay') || key.startsWith('Load')).sort((a,b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
                relays.forEach(relayId => { relaySelect.innerHTML += `<option value="${relayId}">${(relayNames[selectedDeviceId]?.[relayId]) || relayId}</option>`; });
            }
        };
        deviceSelect.onchange = updateRelays;
        updateRelays();
    }
    
    function populateNewOutputSelectors(outputGroup) {
        const deviceSelect = outputGroup.querySelector('.logic-output-device');
        const relaySelect = outputGroup.querySelector('.logic-output-relay');
        const sortedDeviceIds = Object.keys(currentDeviceStates).sort((a, b) => parseInt(a.replace('device', '')) - parseInt(b.replace('device', '')));
        deviceSelect.innerHTML = sortedDeviceIds.map(id => `<option value="${id}">${(deviceMetadata[id]?.name) || id.replace('device', 'ডিভাইস ')}</option>`).join('');
        const updateRelays = () => {
            relaySelect.innerHTML = '';
            const selectedDeviceId = deviceSelect.value;
            if (currentDeviceStates[selectedDeviceId]) {
                const relays = Object.keys(currentDeviceStates[selectedDeviceId]).filter(key => key.startsWith('relay') || key.startsWith('Load')).sort((a,b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
                relays.forEach(relayId => { relaySelect.innerHTML += `<option value="${relayId}">${(relayNames[selectedDeviceId]?.[relayId]) || relayId}</option>`; });
            }
        };
        deviceSelect.onchange = updateRelays;
        updateRelays();
    }

    function populateLogicGateSelectors() {
        document.querySelectorAll('.logic-input-group').forEach(group => populateNewInputSelectors(group));
        document.querySelectorAll('.logic-output-group').forEach(group => populateNewOutputSelectors(group));
    }
  
    function saveLogicGateRule(event) {
        event.preventDefault();
        const ruleName = document.getElementById('logic-rule-name').value;
        const inputs = [];
        document.querySelectorAll('.logic-input-group').forEach(group => {
            const dev = group.querySelector('.logic-input-device').value;
            const rel = group.querySelector('.logic-input-relay').value;
            const state = group.querySelector('.logic-input-state').value === 'true';
            if(dev && rel) inputs.push({ device: dev, relay: rel, state: state });
        });
        const gateType = document.getElementById('logic-gate-type').value;
        const outputs = [];
        document.querySelectorAll('.logic-output-group').forEach(group => {
            const dev = group.querySelector('.logic-output-device').value;
            const rel = group.querySelector('.logic-output-relay').value;
            const state = group.querySelector('.logic-output-state').value === 'true';
            if(dev && rel) outputs.push({ device: dev, relay: rel, state: state });
        });
        if (!ruleName || inputs.length < 2 || outputs.length < 1) { return showToast("অনুগ্রহ করে সমস্ত ফিল্ড পূরণ করুন।", "error"); }
        for(let output of outputs) {
            if (inputs.some(inp => inp.device === output.device && inp.relay === output.relay)) return showToast(`আউটপুট রিলে (${output.relay}) ইনপুট রিলের সমান হতে পারে না।`, "error");
        }
        const rule = { name: ruleName, inputs: inputs, gate: gateType, outputs: outputs, isEnabled: true };
        const isEdit = editingLogicRuleId !== null;
        const actionTitle = isEdit ? 'রুল আপডেট করুন' : 'রুল সংরক্ষণ করুন';
        const actionDesc = isEdit ? `আপনি কি "${ruleName}" রুলটি আপডেট করতে চান?` : `আপনি কি "${ruleName}" রুলটি সংরক্ষণ করতে চান?`;
        promptForActionPassword(actionTitle, actionDesc, () => {
            if (isEdit) {
                database.ref(`${getPathFor('logic_gate_rules')}/${editingLogicRuleId}`).update(rule)
                .then(() => { showToast('লজিক গেট রুল সফলভাবে আপডেট হয়েছে!', 'success'); logAuditEvent(`লজিক গেট রুল '${rule.name}' আপডেট করেছেন।`); cancelEditLogicGate(); });
            } else {
                database.ref(getPathFor('logic_gate_rules')).push(rule)
                .then(() => { showToast('লজিক গেট রুল সফলভাবে সংরক্ষিত হয়েছে!', 'success'); logAuditEvent(`নতুন লজিক গেট রুল '${rule.name}' তৈরি করেছেন।`); cancelEditLogicGate(); });
            }
        });
    }

    function editLogicGateRule(id) {
        const rule = logicGateRules[id];
        if (!rule) return;
        editingLogicRuleId = id;
        document.getElementById('logic-rule-name').value = rule.name;
        document.getElementById('logic-inputs-list').innerHTML = '';
        logicInputCount = 0;
        rule.inputs.forEach((input, index) => {
            addLogicInput();
            const inputGroups = document.querySelectorAll('.logic-input-group');
            const group = inputGroups[inputGroups.length - 1];
            group.querySelector('.logic-input-device').value = input.device;
            const deviceSelect = group.querySelector('.logic-input-device');
            deviceSelect.dispatchEvent(new Event('change'));
            setTimeout(() => {
                 group.querySelector('.logic-input-relay').value = input.relay;
                 group.querySelector('.logic-input-state').value = input.state ? 'true' : 'false';
            }, 50);
        });
        document.getElementById('logic-gate-type').value = rule.gate;
        document.getElementById('logic-outputs-list').innerHTML = '';
        logicOutputCount = 0;
        const ruleOutputs = rule.outputs || (rule.output ? [rule.output] : []);
        ruleOutputs.forEach((output, index) => {
            addLogicOutput();
            const outputGroups = document.querySelectorAll('.logic-output-group');
            const group = outputGroups[outputGroups.length - 1];
            group.querySelector('.logic-output-device').value = output.device;
            const deviceSelect = group.querySelector('.logic-output-device');
            deviceSelect.dispatchEvent(new Event('change'));
            setTimeout(() => {
                 group.querySelector('.logic-output-relay').value = output.relay;
                 group.querySelector('.logic-output-state').value = output.state ? 'true' : 'false';
            }, 50);
        });
        const submitBtn = document.querySelector('#logic-gate-form button[type="submit"]');
        submitBtn.textContent = '🔄 আপডেট করুন';
        document.getElementById('cancel-logic-edit-btn').style.display = 'block';
        document.querySelector('.logic-equation-builder').scrollIntoView({behavior: 'smooth'});
    }

    function cancelEditLogicGate() {
        editingLogicRuleId = null;
        document.getElementById('logic-gate-form').reset();
        initLogicGateInputs();
        const submitBtn = document.querySelector('#logic-gate-form button[type="submit"]');
        submitBtn.textContent = '💾 রুল সংরক্ষণ করুন';
        document.getElementById('cancel-logic-edit-btn').style.display = 'none';
    }

    function renderLogicGateRules() {
        const listContainer = document.getElementById('logic-gate-rule-list');
        if (!listContainer) return;
        listContainer.innerHTML = Object.keys(logicGateRules).length === 0 ? '<p>কোনো ইন্টারলক রুল এখনো তৈরি করা হয়নি।</p>' : '';
        for (const ruleId in logicGateRules) {
            const rule = logicGateRules[ruleId];
            if (!rule.inputs) continue;
            const getRelayName = (device, relay) => (relayNames[device]?.[relay]) || relay;
            const inputsStr = rule.inputs.map(inp => `<strong>${getRelayName(inp.device, inp.relay)} IS ${inp.state ? 'ON' : 'OFF'}</strong>`).join(` ${rule.gate} `);
            const ruleOutputs = rule.outputs || (rule.output ? [rule.output] : []);
            const outputsStr = ruleOutputs.map(out => `SET <strong>${getRelayName(out.device, out.relay)}</strong> TO <strong>${out.state ? 'ON' : 'OFF'}</strong>`).join(' AND ');
            const description = `<strong>${rule.name}:</strong> IF (${inputsStr}) THEN ${outputsStr}`;
            const card = document.createElement('div');
            card.className = `rule-card ${rule.isEnabled ? '' : 'disabled'}`;
            card.innerHTML = `<div class="rule-description">${description}</div><div class="rule-actions"><button class="pro-btn rule-btn toggle-rule-btn ${rule.isEnabled ? 'enabled' : 'disabled'}" onclick="toggleLogicGateRule('${ruleId}')">${rule.isEnabled ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}</button><button class="pro-btn rule-btn edit-btn" onclick="editLogicGateRule('${ruleId}')">এডিট</button><button class="pro-btn rule-btn delete-btn" onclick="deleteLogicGateRule('${ruleId}')">ডিলিট</button></div>`;
            listContainer.appendChild(card);
        }
    }

    function toggleLogicGateRule(id) { const newState = !logicGateRules[id].isEnabled; database.ref(`${getPathFor('logic_gate_rules')}/${id}/isEnabled`).set(newState); }
    function deleteLogicGateRule(id) { const name = logicGateRules[id].name; promptForActionPassword('লজিক গেট রুল মুছুন', `আপনি কি "${name}" রুলটি মুছে ফেলতে চান?`, () => database.ref(`${getPathFor('logic_gate_rules')}/${id}`).remove()); }

    function evaluateLogicGateRules() {
        const updates = {};
        const overridesToRemove = {};
        for (const ruleId in logicGateRules) {
            const rule = logicGateRules[ruleId];
            if (!rule.isEnabled || !rule.inputs || rule.inputs.length < 2) continue;
            const inputStates = rule.inputs.map(inp => {
                const deviceData = currentDeviceStates[inp.device];
                const relayState = deviceData ? deviceData[inp.relay] : false;
                return (!!relayState) === inp.state;
            });
            let logicResult = false;
            switch (rule.gate) {
                case 'AND': logicResult = inputStates.every(s => s); break;
                case 'OR':  logicResult = inputStates.some(s => s); break;
                case 'NAND':logicResult = !inputStates.every(s => s); break;
                case 'NOR': logicResult = !inputStates.some(s => s); break;
                case 'XOR': logicResult = inputStates.filter(s => s).length % 2 !== 0; break;
                case 'XNOR':logicResult = inputStates.filter(s => s).length % 2 === 0; break;
            }
            const outputs = rule.outputs || (rule.output ? [rule.output] : []);
            outputs.forEach(output => {
                const { device: outDevice, relay: outRelay, state: outState } = output;
                if (logicOverrides[outDevice] && logicOverrides[outDevice][outRelay]) return; 
                const targetState = logicResult ? outState : !outState;
                const currentStateOut = !!currentDeviceStates[outDevice]?.[outRelay];
                if (targetState !== currentStateOut) {
                    const path = `${getPathFor('devices_root')}/${outDevice}/${outRelay}`;
                    updates[path] = targetState;
                }
            });
        }
        if (logicOverrides) {
            for (const devId in logicOverrides) {
                for (const relId in logicOverrides[devId]) {
                    if (!isTargetOfActiveLogicRule(devId, relId)) overridesToRemove[`logic_gate_overrides/${devId}/${relId}`] = null;
                }
            }
        }
        if (Object.keys(updates).length > 0) database.ref().update(updates);
        if (Object.keys(overridesToRemove).length > 0) database.ref().update(overridesToRemove);
    }

  function switchGraphType(type, btn) {
    graphModeChartType = type;
    document.querySelectorAll('.gm-type-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (graphModeChart) { graphModeChart.destroy(); graphModeChart = null; }
    applyGraphModeFilters();
  }

  // Live clock for graph page
  setInterval(() => {
    const el = document.getElementById('gm-live-clock');
    if (el) el.textContent = new Date().toLocaleString('bn-BD');
  }, 1000);

  // Track relay history in memory
  const graphRelayHistory = {};

  function recordRelayEventForGraph(device, relay, state) {
    const key = `${device}__${relay}`;
    if (!graphRelayHistory[key]) graphRelayHistory[key] = [];
    graphRelayHistory[key].push({
      time: new Date().toLocaleString('bn-BD'),
      device, relay, state,
      source: 'ম্যানুয়াল'
    });
    if (graphRelayHistory[key].length > 200) graphRelayHistory[key].shift();
    updateRelayHistoryTable();
  }

  function updateRelayHistoryTable() {
    const section = document.getElementById('gm-relay-history-content');
    if (!section) return;
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg || cfg.type !== 'device') {
      section.innerHTML = '<p style="color:var(--text-dim);font-size:0.9rem;">একটি ডিভাইস পেজ নির্বাচন করলে রিলের ইতিহাস এখানে দেখা যাবে।</p>';
      return;
    }
    const fbKey = cfg.fbKey;
    const relayKeys = Object.keys(graphRelayHistory).filter(k => k.startsWith(fbKey + '__'));
    if (relayKeys.length === 0) {
      section.innerHTML = '<p style="color:var(--text-dim);font-size:0.9rem;">এখনো কোনো রিলে ইভেন্ট রেকর্ড হয়নি।</p>';
      return;
    }
    const counts = {};
    relayKeys.forEach(k => {
      const [dev, rel] = k.split('__');
      const name = (relayNames[dev]?.[rel]) || rel;
      const events = graphRelayHistory[k];
      counts[name] = {
        on: events.filter(e => e.state === true || e.state === 1).length,
        off: events.filter(e => e.state === false || e.state === 0).length,
        manual_on: events.filter(e => (e.state === true || e.state === 1) && e.source === 'ম্যানুয়াল').length,
        manual_off: events.filter(e => (e.state === false || e.state === 0) && e.source === 'ম্যানুয়াল').length,
      };
    });
    const allEvents = [];
    relayKeys.forEach(k => graphRelayHistory[k].forEach(e => allEvents.push(e)));
    allEvents.sort((a, b) => b.time.localeCompare(a.time));
    let html = `<table class="gm-relay-table"><thead><tr><th>রিলে/লোড</th><th>Firebase ON</th><th>Firebase OFF</th><th>ম্যানুয়াল ON</th><th>ম্যানুয়াল OFF</th></tr></thead><tbody>`;
    Object.entries(counts).forEach(([name, c]) => {
      html += `<tr><td>${name}</td><td class="gm-on-badge">${c.on}</td><td class="gm-off-badge">${c.off}</td><td class="gm-on-badge">${c.manual_on}</td><td class="gm-off-badge">${c.manual_off}</td></tr>`;
    });
    html += `</tbody></table><br>`;
    html += `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="gm-btn danger" onclick="clearRelayHistoryLog()"><i class="fas fa-trash"></i> লগ মুছুন</button></div>`;
    html += `<table class="gm-relay-table"><thead><tr><th>সময়</th><th>ডিভাইস</th><th>রিলে</th><th>অবস্থা</th><th>উৎস</th></tr></thead><tbody>`;
    allEvents.slice(0, 100).forEach(e => {
      const name = (relayNames[e.device]?.[e.relay]) || e.relay;
      const stateHtml = (e.state === true || e.state === 1) ? `<span class="gm-on-badge">ON</span>` : `<span class="gm-off-badge">OFF</span>`;
      html += `<tr><td>${e.time}</td><td>${e.device}</td><td>${name}</td><td>${stateHtml}</td><td>${e.source}</td></tr>`;
    });
    html += `</tbody></table>`;
    section.innerHTML = html;
  }

  function clearRelayHistoryLog() {
    if (!confirm('রিলে লগ মুছে ফেলবেন?')) return;
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg) return;
    const fbKey = cfg.fbKey;
    Object.keys(graphRelayHistory).filter(k => k.startsWith(fbKey + '__')).forEach(k => delete graphRelayHistory[k]);
    updateRelayHistoryTable();
    showToast('রিলে ইতিহাস লগ মুছে ফেলা হয়েছে।', 'success');
  }

  // ================================================================
  // GRAPH MODE - PAGE 14 - localStorage Persistence সহ
  // সব সিলেকশন রিফ্রেশ/ব্রাউজার বন্ধেও টিকে থাকবে
  // ================================================================
  let graphModeChart = null;
  // graphModeData - localStorage থেকে পুনরুদ্ধার (পেজ switch বা রিফ্রেশেও টিকে থাকে)
  let graphModeData = (() => {
    try {
      const saved = localStorage.getItem('gm_chartData');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.labels && parsed.datasets) return parsed;
      }
    } catch(e) {}
    return { labels: [], datasets: [] };
  })();

  // graphModeData localStorage-এ সংরক্ষণ (debounce দিয়ে performance ভালো রাখো)
  let _gmDataSaveTimer = null;
  function saveGraphData() {
    if (_gmDataSaveTimer) clearTimeout(_gmDataSaveTimer);
    _gmDataSaveTimer = setTimeout(() => {
      try {
        // সর্বোচ্চ ২০০ পয়েন্ট রাখো যাতে localStorage limit পার না হয়
        const toSave = {
          labels: graphModeData.labels.slice(-200),
          datasets: graphModeData.datasets.map(ds => ({
            ...ds,
            data: ds.data.slice(-200)
          }))
        };
        localStorage.setItem('gm_chartData', JSON.stringify(toSave));
      } catch(e) {
        // localStorage full হলে পুরানো data মুছো
        try { localStorage.removeItem('gm_chartData'); } catch(e2) {}
      }
    }, 300);
  }
  let graphModeLiveInterval = null;
  let graphModeFirebaseListener2 = null;
  let graphModeDynamicPages = {};

  // localStorage থেকে পূর্ববর্তী state পুনরুদ্ধার
  let graphModeChartType = localStorage.getItem('gm_chartType') || 'line';
  let graphModeSelectedPage = localStorage.getItem('gm_selectedPage') || null;
  let graphModeSelectedFields = (() => { try { return JSON.parse(localStorage.getItem('gm_selectedFields') || '[]'); } catch(e) { return []; } })();

  // সব গ্রাফ state একসাথে localStorage-এ সংরক্ষণ
  function saveGraphState() {
    try {
      localStorage.setItem('gm_chartType', graphModeChartType);
      localStorage.setItem('gm_selectedPage', graphModeSelectedPage || '');
      localStorage.setItem('gm_selectedFields', JSON.stringify(graphModeSelectedFields));
      // তারিখ ও সময়ও সংরক্ষণ
      ['gm-start-date','gm-start-time','gm-end-date','gm-end-time'].forEach(id => {
        const el = document.getElementById(id);
        if (el) localStorage.setItem('gm_' + id, el.value);
      });
    } catch(e) {}
  }

  // পেজ লোড হলে তারিখ/সময় পুনরুদ্ধার
  function restoreDateTimeInputs() {
    ['gm-start-date','gm-start-time','gm-end-date','gm-end-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = localStorage.getItem('gm_' + id) || '';
    });
  }

  const GRAPH_COLORS = [
    { border: 'rgba(0,212,255,1)', bg: 'rgba(0,212,255,0.15)' },
    { border: 'rgba(255,45,91,1)', bg: 'rgba(255,45,91,0.15)' },
    { border: 'rgba(0,255,157,1)', bg: 'rgba(0,255,157,0.15)' },
    { border: 'rgba(255,183,0,1)', bg: 'rgba(255,183,0,0.15)' },
    { border: 'rgba(200,75,255,1)', bg: 'rgba(200,75,255,0.15)' },
    { border: 'rgba(255,140,0,1)', bg: 'rgba(255,140,0,0.15)' },
    { border: 'rgba(52,152,219,1)', bg: 'rgba(52,152,219,0.15)' },
    { border: 'rgba(46,204,113,1)', bg: 'rgba(46,204,113,0.15)' },
    { border: 'rgba(231,76,60,1)', bg: 'rgba(231,76,60,0.15)' },
    { border: 'rgba(149,165,166,1)', bg: 'rgba(149,165,166,0.15)' },
  ];

  const ENERGY_FIELDS = [
    { key: 'voltage', label: 'ভোল্টেজ', unit: 'V' },
    { key: 'current', label: 'কারেন্ট', unit: 'A' },
    { key: 'power', label: 'পাওয়ার', unit: 'W' },
    { key: 'energy', label: 'এনার্জি', unit: 'kWh' },
    { key: 'frequency', label: 'ফ্রিকুয়েন্সি', unit: 'Hz' },
    { key: 'power_factor', label: 'পাওয়ার ফ্যাক্টর', unit: '' },
    { key: 'active_power', label: 'অ্যাক্টিভ পাওয়ার', unit: 'W' },
    { key: 'reactive_power', label: 'রিঅ্যাক্টিভ পাওয়ার', unit: 'VAR' },
    { key: 'units', label: 'ব্যবহৃত ইউনিট', unit: 'U' },
    { key: 'cost', label: 'দৈনিক খরচ', unit: 'BDT' },
  ];

  function openGraphModePopup() {
    document.getElementById('graph-mode-popup').style.display = 'flex';
  }

  function closeGraphModePopup() {
    document.getElementById('graph-mode-popup').style.display = 'none';
  }

  function selectGraphType(chartType) {
    graphModeChartType = chartType;
    localStorage.setItem('gm_chartType', chartType);
    document.querySelectorAll('.gm-chart-option').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`.gm-chart-option[data-chart="${chartType}"]`).forEach(el => el.classList.add('active'));
    document.querySelectorAll('.gm-type-btn').forEach(b => b.classList.remove('active'));
    const tb = document.querySelector(`.gm-type-btn[data-type="${chartType}"]`);
    if (tb) tb.classList.add('active');
    if (graphModeChart) { graphModeChart.destroy(); graphModeChart = null; }
    closeGraphModePopup();
    showPage('page14');
    applyGraphModeFilters();
  }

  // Firebase থেকে সব ডিভাইস/পেজ dynamic load
  function buildGraphModeDynamicPages() {
    graphModeDynamicPages = {};

    // ১. এনার্জি মনিটর
    const energyPath = getPathFor('energymonitoring_root') || 'energymonitoring';
    graphModeDynamicPages['energy_monitor'] = {
      label: 'এনার্জি মনিটর', icon: '⚡', type: 'energy',
      fbPath: energyPath, fbKey: 'energy_monitor', fields: ENERGY_FIELDS,
    };

    // ২. devices root থেকে সব child
    const devicesRootPath = getPathFor('devices_root') || 'devices';
    database.ref(devicesRootPath).once('value', snap => {
      const devicesData = snap.val() || {};
      Object.keys(devicesData).forEach(devKey => {
        const devData = devicesData[devKey];
        if (typeof devData !== 'object' || devData === null) return;
        const isTemp = devKey.toLowerCase().startsWith('temperature') ||
          devData.hasOwnProperty('temperature_c') || devData.hasOwnProperty('temperature') || devData.hasOwnProperty('temperature_f');
        const isDevice = devKey.toLowerCase().startsWith('device');
        let icon = '📡', type = 'other', label = devKey, fields = [];
        if (isTemp) {
          icon = '🌡️'; type = 'temperature'; label = devKey;
          fields = Object.keys(devData).filter(k =>
            ['temperature_c','temperature_f','temperature','humidity'].includes(k) ||
            k.toLowerCase().includes('temp') || k.toLowerCase().includes('humid')
          ).map(k => {
            const unit = k.includes('_c') || k === 'temperature' ? '°C' : k.includes('_f') ? '°F' : k.includes('humid') ? '%' : '';
            return { key: k, label: k, unit };
          });
          if (fields.length === 0) fields = [
            {key:'temperature_c',label:'তাপমাত্রা (°C)',unit:'°C'},
            {key:'temperature_f',label:'তাপমাত্রা (°F)',unit:'°F'},
            {key:'humidity',label:'আর্দ্রতা',unit:'%'}
          ];
        } else if (isDevice) {
          icon = '🖥️'; type = 'device';
          label = devKey.replace('device', 'ডিভাইস ');
          fields = Object.keys(devData).filter(k => k.startsWith('Load') || k.startsWith('relay'))
            .sort((a,b) => {
              const na = parseInt(a.match(/\d+/)||[0]);
              const nb = parseInt(b.match(/\d+/)||[0]);
              return na - nb;
            })
            .map(k => ({ key: k, label: (relayNames[devKey]?.[k]) || k, unit: '' }));
        } else {
          // KT2, KT3 etc
          icon = '📡'; type = 'other'; label = devKey;
          fields = Object.keys(devData)
            .filter(k => !['ip','last_seen','timestamp'].includes(k))
            .map(k => ({ key: k, label: k, unit: '' }));
        }
        graphModeDynamicPages[devKey] = {
          label, icon, type,
          fbPath: `${devicesRootPath}/${devKey}`,
          fbKey: devKey, fields, rawData: devData,
        };
      });
      buildGraphPageSelector();
      // Firebase লোড শেষে - সংরক্ষিত পেজ সিলেকশন পুনরুদ্ধার করো
      restoreSavedGraphSelection();
    });

    buildGraphPageSelector();
  }

  // রিফ্রেশের পরে localStorage থেকে সব সিলেকশন পুনরুদ্ধার ও গ্রাফ পুনরায় শুরু
  function restoreSavedGraphSelection() {
    if (!graphModeSelectedPage) return;
    const savedPage = graphModeSelectedPage;
    const savedFields = graphModeSelectedFields;

    // পেজ আছে কিনা চেক
    if (!graphModeDynamicPages[savedPage]) {
      console.warn('Saved page not found in dynamic pages:', savedPage);
      return;
    }

    // UI আপডেট
    buildGraphPageSelector();
    buildGraphFieldSelector();

    // relay history section দেখাও
    const cfg = graphModeDynamicPages[savedPage];
    const histSection = document.getElementById('gm-relay-history-section');
    if (histSection) histSection.style.display = (cfg && cfg.type === 'device') ? 'block' : 'none';

    // ফিল্ড সিলেকশন থাকলে গ্রাফ শুরু করো
    if (savedFields && savedFields.length > 0) {
      const nd = document.getElementById('gm-no-data');
      if (nd) nd.style.display = 'none';
      // তারিখ ফিল্টার পুনরুদ্ধার করো
      restoreDateTimeInputs();
      const sDate = document.getElementById('gm-start-date')?.value || '';
      const eDate = document.getElementById('gm-end-date')?.value || '';
      if (!sDate && !eDate) {
        startGraphModeLive();
      } else {
        const sTime = document.getElementById('gm-start-time')?.value || '00:00:00';
        const eTime = document.getElementById('gm-end-time')?.value || '23:59:59';
        loadGraphModeHistorical(sDate ? `${sDate}T${sTime}` : null, eDate ? `${eDate}T${eTime}` : null);
      }
      showToast(`"${cfg?.label}" - পূর্ববর্তী সিলেকশন পুনরুদ্ধার হয়েছে`, 'success');
    }
  }

  function buildGraphPageSelector() {
    const container = document.getElementById('gm-page-selector');
    if (!container) return;
    container.innerHTML = '';

    const groups = {
      energy: { label: '⚡ এনার্জি মনিটর', items: [] },
      device: { label: '🖥️ ডিভাইস', items: [] },
      temperature: { label: '🌡️ তাপমাত্রা', items: [] },
      other: { label: '📡 অন্যান্য ডিভাইস', items: [] },
    };

    Object.entries(graphModeDynamicPages).forEach(([key, cfg]) => {
      const grp = groups[cfg.type] || groups.other;
      grp.items.push({ key, cfg });
    });

    let hasItems = false;
    Object.entries(groups).forEach(([groupKey, group]) => {
      if (group.items.length === 0) return;
      hasItems = true;
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:0.72rem;color:var(--secondary-color);text-transform:uppercase;letter-spacing:1px;padding:8px 2px 4px;font-weight:700;opacity:0.8;border-top:1px solid rgba(0,212,255,0.1);margin-top:6px;';
      lbl.textContent = group.label;
      container.appendChild(lbl);
      group.items.forEach(({ key, cfg }) => {
        const btn = document.createElement('button');
        btn.className = 'gm-page-btn' + (graphModeSelectedPage === key ? ' active' : '');
        btn.innerHTML = `${cfg.icon} ${cfg.label}`;
        btn.onclick = () => selectGraphPage(key);
        container.appendChild(btn);
      });
    });

    if (!hasItems) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:0.82rem;padding:5px;">Firebase লোড হচ্ছে...</p>';
    }

    // Firebase Path Extension সেকশন
    const sep = document.createElement('div');
    sep.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid rgba(0,212,255,0.1);';
    sep.innerHTML = `
      <div style="font-size:0.72rem;color:var(--secondary-color);text-transform:uppercase;letter-spacing:1px;padding-bottom:7px;font-weight:700;opacity:0.8;">
        🔗 Firebase পাথ Extension
      </div>
      <input type="text" id="gm-custom-fb-path" placeholder="যেমন: devices/KT2" 
        style="width:100%;padding:7px 10px;border-radius:7px;border:1px solid rgba(0,212,255,0.2);
        background:rgba(0,212,255,0.04);color:var(--text-color);font-size:0.82rem;margin-bottom:6px;box-sizing:border-box;">
      <button onclick="loadGraphFromCustomPath()" 
        style="width:100%;padding:7px;border-radius:7px;border:1px solid rgba(0,212,255,0.3);
        background:rgba(0,212,255,0.08);color:var(--secondary-color);cursor:pointer;font-size:0.83rem;font-weight:600;">
        <i class="fas fa-database"></i> পাথ থেকে লোড করুন
      </button>
    `;
    container.appendChild(sep);
  }

  function loadGraphFromCustomPath() {
    const pathInput = document.getElementById('gm-custom-fb-path');
    const customPath = pathInput ? pathInput.value.trim() : '';
    if (!customPath) { showToast('একটি Firebase path লিখুন।', 'error'); return; }
    showToast('লোড হচ্ছে...', 'info');
    database.ref(customPath).once('value', snap => {
      const data = snap.val();
      if (!data) { showToast('এই path-এ কোনো ডেটা নেই।', 'error'); return; }
      const pathLabel = customPath.split('/').pop();
      const key = 'ext_' + pathLabel + '_' + Date.now();
      let fields = [];
      if (typeof data === 'object') {
        fields = Object.keys(data)
          .filter(k => {
            const v = data[k];
            return typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && !isNaN(parseFloat(v)));
          })
          .map(k => ({ key: k, label: k, unit: '' }));
      }
      graphModeDynamicPages[key] = {
        label: `[${pathLabel}]`, icon: '🔗', type: 'other',
        fbPath: customPath, fbKey: key, fields, rawData: data,
      };
      selectGraphPage(key);
      buildGraphPageSelector();
      showToast(`"${pathLabel}" সফলভাবে লোড হয়েছে।`, 'success');
    });
  }

  function selectGraphPage(pageKey) {
    // পেজ পরিবর্তন হলেই ফিল্ড রিসেট করো
    if (graphModeSelectedPage !== pageKey) {
      // নতুন পেজ সিলেক্ট করলে পুরানো data মুছো
      graphModeSelectedFields = [];
      localStorage.setItem('gm_selectedFields', '[]');
      localStorage.removeItem('gm_chartData');
      if (graphModeChart) { try { graphModeChart.destroy(); } catch(e){} graphModeChart = null; }
      graphModeData = { labels: [], datasets: [] };
    }
    graphModeSelectedPage = pageKey;
    localStorage.setItem('gm_selectedPage', pageKey);
    // Firebase listener বন্ধ করো
    if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (graphModeFirebaseListener) { try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e){} graphModeFirebaseListener = null; graphModeFirebaseCallback = null; graphModeLiveInterval = null; }
    if (graphModeFirebaseListener2) { try { graphModeFirebaseListener2.off(); } catch(e){} graphModeFirebaseListener2 = null; }
    buildGraphPageSelector();
    buildGraphFieldSelector();
    const cfg = graphModeDynamicPages[pageKey];
    const histSection = document.getElementById('gm-relay-history-section');
    if (histSection) histSection.style.display = (cfg && cfg.type === 'device') ? 'block' : 'none';
    updateRelayHistoryTable();
    const nd = document.getElementById('gm-no-data');
    if (nd) nd.style.display = graphModeSelectedFields.length === 0 ? 'block' : 'none';
    // আগের ফিল্ড সিলেকশন থাকলে গ্রাফ শুরু করো
    if (graphModeSelectedFields.length > 0) applyGraphModeFilters();
  }

  function buildGraphFieldSelector() {
    const container = document.getElementById('gm-field-selector');
    if (!container) return;
    container.innerHTML = '';
    if (!graphModeSelectedPage) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">প্রথমে একটি পেজ বেছে নিন</p>';
      return;
    }
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg) return;
    let fields = [];
    if (cfg.type === 'device') {
      const liveData = currentDeviceStates[cfg.fbKey] || {};
      const liveFields = Object.keys(liveData)
        .filter(k => k.startsWith('Load') || k.startsWith('relay'))
        .sort((a,b) => parseInt(a.match(/\d+/)||[0]) - parseInt(b.match(/\d+/)||[0]))
        .map(k => ({ key: k, label: (relayNames[cfg.fbKey]?.[k]) || k, unit: '' }));
      fields = liveFields.length > 0 ? liveFields : (cfg.fields || []);
    } else {
      fields = cfg.fields || [];
    }
    cfg._resolvedFields = fields;
    if (fields.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:0.82rem;">ফিল্ড পাওয়া যায়নি।<br><small>Firebase-এ ডেটা থাকলে আবার চেষ্টা করুন।</small></p>';
      return;
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:5px;margin-bottom:7px;';
    const allBtn = document.createElement('button');
    allBtn.className = 'gm-select-all-btn';
    allBtn.style.flex = '1';
    allBtn.innerHTML = '<i class="fas fa-check-double"></i> সব';
    allBtn.onclick = () => { graphModeSelectedFields = fields.map(f => f.key); localStorage.setItem('gm_selectedFields', JSON.stringify(graphModeSelectedFields)); renderFieldChips(fields); applyGraphModeFilters(); };
    const clearBtn = document.createElement('button');
    clearBtn.className = 'gm-select-all-btn';
    clearBtn.style.cssText = 'flex:1;opacity:0.65;';
    clearBtn.innerHTML = '<i class="fas fa-times"></i> বাতিল';
    clearBtn.onclick = () => {
      graphModeSelectedFields = [];
      renderFieldChips(fields);
      if (graphModeChart) { graphModeChart.destroy(); graphModeChart = null; }
      const nd = document.getElementById('gm-no-data');
      if (nd) nd.style.display = 'block';
    };
    row.appendChild(allBtn);
    row.appendChild(clearBtn);
    container.appendChild(row);
    const wrap = document.createElement('div');
    wrap.id = 'gm-chips-wrap';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    container.appendChild(wrap);
    renderFieldChips(fields);
  }

  function renderFieldChips(fields) {
    const wrap = document.getElementById('gm-chips-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    fields.forEach((f, idx) => {
      const chip = document.createElement('div');
      const isSel = graphModeSelectedFields.includes(f.key);
      chip.className = 'gm-field-chip' + (isSel ? ' selected' : '');
      const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
      chip.style.borderColor = isSel ? color.border : '';
      chip.innerHTML = `<span class="gm-field-chip-dot" style="background:${color.border}"></span>${f.label}${f.unit ? ` <small>(${f.unit})</small>` : ''}`;
      chip.onclick = () => {
        if (graphModeSelectedFields.includes(f.key)) graphModeSelectedFields = graphModeSelectedFields.filter(k => k !== f.key);
        else graphModeSelectedFields.push(f.key);
        localStorage.setItem('gm_selectedFields', JSON.stringify(graphModeSelectedFields));
        renderFieldChips(fields);
        applyGraphModeFilters();
      };
      wrap.appendChild(chip);
    });
  }

  function resetToLiveMode() {
    ['gm-start-date','gm-start-time','gm-end-date','gm-end-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; localStorage.setItem('gm_' + id, ''); }
    });
    graphModeData = { labels: [], datasets: [] };
    applyGraphModeFilters();
  }

  function setQuickTimeRange(minutes) {
    if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (graphModeFirebaseListener) { try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e){} graphModeFirebaseListener = null; graphModeFirebaseCallback = null; graphModeLiveInterval = null; }

    const now = new Date();
    const start = new Date(now.getTime() - minutes * 60 * 1000);

    const fmt = (d) => d.toISOString().split('T')[0];
    const fmtTime = (d) => d.toTimeString().slice(0, 8);

    document.getElementById('gm-start-date').value = fmt(start);
    document.getElementById('gm-start-time').value = fmtTime(start);
    document.getElementById('gm-end-date').value = fmt(now);
    document.getElementById('gm-end-time').value = fmtTime(now);

    applyGraphModeFilters();
  }

  function applyGraphModeFilters() {
    if (!graphModeSelectedPage || graphModeSelectedFields.length === 0) {
      if (graphModeChart) { graphModeChart.destroy(); graphModeChart = null; }
      const nd = document.getElementById('gm-no-data');
      if (nd) { nd.style.display = 'block'; const p = nd.querySelector('p'); if(p) p.textContent = 'অন্তত একটি ফিল্ড নির্বাচন করুন'; }
      return;
    }
    const nd = document.getElementById('gm-no-data');
    if (nd) nd.style.display = 'none';
    const sDate = document.getElementById('gm-start-date')?.value || '';
    const sTime = document.getElementById('gm-start-time')?.value || '00:00:00';
    const eDate = document.getElementById('gm-end-date')?.value || '';
    const eTime = document.getElementById('gm-end-time')?.value || '23:59:59';
    // তারিখ/সময় সংরক্ষণ করো
    ['gm-start-date','gm-start-time','gm-end-date','gm-end-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) localStorage.setItem('gm_' + id, el.value);
    });
    if (!sDate && !eDate) {
      startGraphModeLive();
    } else {
      const startDT = sDate ? `${sDate}T${sTime}` : null;
      const endDT = eDate ? `${eDate}T${eTime}` : null;
      loadGraphModeHistorical(startDT, endDT);
    }
  }

  let graphModeFirebaseListener = null; // Firebase .on() listener ref

  // লাইভ টাইম উইন্ডো — ডিফল্ট ৩০ মিনিট (মিনিটে)
  let graphModeLiveWindow = parseInt(localStorage.getItem('gm_liveWindow') || '30');

  function setLiveTimeWindow(minutes) {
    graphModeLiveWindow = minutes;
    localStorage.setItem('gm_liveWindow', minutes);
    // সব বাটনের active class আপডেট
    document.querySelectorAll('.gm-live-window-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.min) === minutes);
    });
    // ✅ FIX 1: ডেটা রিসেট করো না — শুধু পুরানো entries ছাঁটো
    // নতুন window বড় হলে আরও ডেটা দেখাবে, ছোট হলে পুরানো কাটবে
    trimGraphDataByWindow();
    rebuildGraphModeChart();
    // লাইভ interval চলতে থাকুক — রিস্টার্ট দরকার নেই
  }

  // পেজ লোডে সক্রিয় লাইভ উইন্ডো বাটন highlight করো
  function initLiveWindowButtons() {
    document.querySelectorAll('.gm-live-window-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.min) === graphModeLiveWindow);
    });
  }

  function trimGraphDataByWindow() {
    const sDate = document.getElementById('gm-start-date')?.value;
    if (sDate) return; // historical mode — ছাঁটো না
    if (!graphModeData.labels || graphModeData.labels.length === 0) return;
    // ✅ FIX 3: interval 500ms → maxPoints হিসাব আপডেট
    const maxPoints = Math.ceil(graphModeLiveWindow * 60 / 0.5) + 20; // 500ms interval
    if (graphModeData.labels.length > maxPoints) {
      const excess = graphModeData.labels.length - maxPoints;
      graphModeData.labels.splice(0, excess);
      graphModeData.datasets.forEach(ds => ds.data.splice(0, excess));
    }
  }

  function startGraphModeLive() {
    // পুরানো listener/interval বন্ধ করো
    if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (graphModeFirebaseListener) {
      try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e) {}
      graphModeFirebaseListener = null; graphModeLiveInterval = null;
    }
    // graphModeData রিসেট করো না - পুরানো ডেটা রাখো

    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg) return;

    // ===== গুরুত্বপূর্ণ =====
    // energy ও device পেজের জন্য নতুন Firebase listener বসানো বন্ধ -
    // কারণ setupFirebaseListeners() ইতিমধ্যে এগুলো শুনছে।
    // নতুন listener বসালে .off() করার সময় আসল listener-ও বন্ধ হয়ে যায়।
    // পরিবর্তে currentEnergyData / currentDeviceStates থেকে polling করো।
    if (cfg.type === 'energy' || cfg.type === 'device' || cfg.type === 'temperature') {
      // ✅ FIX 3: ৫০০ms পর পর আসল global state থেকে পড়ো (আগে ছিল 2000ms)
      updateGraphModeLiveData(); // সাথে সাথে একবার
      graphModeLiveInterval = setInterval(updateGraphModeLiveData, 500);
      return;
    }

    // অজানা/custom path-এর জন্য আলাদা Firebase listener
    const fbPath = cfg.fbPath;
    if (!fbPath || !database) {
      updateGraphModeLiveData();
      graphModeLiveInterval = setInterval(updateGraphModeLiveData, 500);
      return;
    }

    graphModeFirebaseCallback = (snap) => {
      const data = snap.val();
      if (!data || typeof data !== 'object') return;
      processLiveDataPoint(data, cfg);
    };
    graphModeFirebaseListener = database.ref(fbPath);
    graphModeFirebaseListener.on('value', graphModeFirebaseCallback);
    graphModeLiveInterval = 'firebase';
  }

  let graphModeFirebaseCallback = null;

  let _graphRenderThrottle = null;

  function processLiveDataPoint(sourceData, cfg) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (!graphModeData.labels) graphModeData.labels = [];
    if (document.getElementById('page14') && !document.getElementById('page14').classList.contains('active')) return;

    graphModeData.labels.push(timeLabel);
    // ✅ FIX 3: 500ms interval অনুযায়ী maxPoints
    const maxPoints = Math.ceil(graphModeLiveWindow * 60 / 0.5) + 20;
    if (graphModeData.labels.length > maxPoints) graphModeData.labels.shift();
    if (!graphModeData.datasets) graphModeData.datasets = [];

    graphModeSelectedFields.forEach((fk, idx) => {
      let ds = graphModeData.datasets.find(d => d.fieldKey === fk);
      const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
      const fields = cfg._resolvedFields || cfg.fields || [];
      const fc = fields.find(f => f.key === fk);
      const label = fc ? `${fc.label}${fc.unit ? ' ('+fc.unit+')' : ''}` : fk;
      if (!ds) {
        ds = {
          fieldKey: fk, label, data: [],
          borderColor: color.border, backgroundColor: color.bg,
          fill: graphModeChartType === 'area', tension: 0.3,
          pointRadius: 2, pointHoverRadius: 5,
          borderWidth: 2,
        };
        graphModeData.datasets.push(ds);
      }
      let v = sourceData[fk];
      if (v === true) v = 1;
      else if (v === false) v = 0;
      else { v = parseFloat(v); if (isNaN(v)) v = null; }
      ds.data.push(v);
      if (ds.data.length > maxPoints) ds.data.shift();

      if (cfg.type === 'device' && (fk.startsWith('Load') || fk.startsWith('relay'))) {
        const prevVal = ds.data[ds.data.length - 2];
        if (prevVal !== undefined && prevVal !== v && v !== null) {
          try {
            if (!graphRelayHistory[`${cfg.fbKey}__${fk}`]) graphRelayHistory[`${cfg.fbKey}__${fk}`] = [];
            graphRelayHistory[`${cfg.fbKey}__${fk}`].push({
              time: now.toLocaleString('bn-BD'),
              device: cfg.fbKey, relay: fk,
              state: v === 1 ? true : false,
              source: 'Firebase'
            });
            updateRelayHistoryTable();
          } catch(e) {}
        }
      }
    });
    graphModeData.datasets = graphModeData.datasets.filter(d => graphModeSelectedFields.includes(d.fieldKey));
    trimGraphDataByWindow();

    // ✅ FIX 3: Chart render throttle — প্রতি 500ms এ একবার render, বারবার নয়
    if (_graphRenderThrottle) return;
    _graphRenderThrottle = setTimeout(() => {
      _graphRenderThrottle = null;
      saveGraphData();
      rebuildGraphModeChart();
    }, 500);
  }

  function updateGraphModeLiveData() {
    // Global state থেকে সরাসরি পড়ো - নতুন Firebase listener বসানো নয়
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg) return;
    let sourceData = {};
    if (cfg.type === 'energy') {
      sourceData = currentEnergyData || {};
    } else if (cfg.type === 'device') {
      sourceData = currentDeviceStates[cfg.fbKey] || {};
    } else if (cfg.type === 'temperature') {
      // temperature device-ও currentDeviceStates-এ থাকে
      sourceData = currentDeviceStates[cfg.fbKey] || currentTempData?.[cfg.fbKey] || {};
    } else {
      sourceData = cfg.rawData || {};
    }
    processLiveDataPoint(sourceData, cfg);
  }

  function loadGraphModeHistorical(startDate, endDate) {
    if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (graphModeFirebaseListener) { try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e){} graphModeFirebaseListener = null; graphModeFirebaseCallback = null; graphModeLiveInterval = null; }

    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (!cfg) { showToast('প্রথমে একটি ডিভাইস নির্বাচন করুন।', 'warning'); return; }
    if (!graphModeSelectedFields || graphModeSelectedFields.length === 0) { showToast('অন্তত একটি ফিল্ড নির্বাচন করুন।', 'warning'); return; }

    // ✅ FIX 2: সঠিক ইতিহাস path নির্ধারণ
    let histPath;
    if (cfg.type === 'energy') {
      histPath = getPathFor('energymonitoring_history') || getPathFor('energy_history') || 'energy_history';
    } else if (cfg.type === 'device' || cfg.type === 'temperature') {
      // device এর জন্য history path: devices_history/deviceId অথবা সরাসরি device path
      const devHistPath = getPathFor('device_history');
      histPath = devHistPath ? `${devHistPath}/${cfg.fbKey}` : `${cfg.fbPath}_history`;
      // fallback: সরাসরি device path থেকে পড়ো
    } else {
      histPath = cfg.fbPath;
    }

    const startTs = startDate ? new Date(startDate).getTime() : 0;
    const endTs = endDate ? new Date(endDate).getTime() : Date.now();
    // seconds এও চেক করো (কিছু device seconds এ save করে)
    const startTsSec = startTs / 1000;
    const endTsSec = endTs / 1000;

    showToast('ডেটা লোড হচ্ছে...', 'info');

    // ✅ FIX 2: তিনটি strategy তে ডেটা খোঁজো
    const tryLoadFromPath = (path, callback) => {
      database.ref(path).orderByChild('timestamp').startAt(startTsSec).endAt(endTsSec).limitToLast(2000).once('value', snap => {
        const raw = snap.val();
        if (raw && Object.keys(raw).length > 0) {
          callback(Object.values(raw));
          return;
        }
        // milliseconds timestamp দিয়ে চেষ্টা
        database.ref(path).orderByChild('timestamp').startAt(startTs).endAt(endTs).limitToLast(2000).once('value', snap2 => {
          const raw2 = snap2.val();
          if (raw2 && Object.keys(raw2).length > 0) {
            callback(Object.values(raw2));
            return;
          }
          // timestamp ছাড়া — সব ডেটা নিয়ে date filter করো
          database.ref(path).limitToLast(2000).once('value', snap3 => {
            const raw3 = snap3.val();
            if (!raw3 || Object.keys(raw3).length === 0) {
              callback(null);
              return;
            }
            // Firebase push key থেকে timestamp বের করে filter করো
            const entries = Object.entries(raw3).map(([k, v]) => {
              if (typeof v !== 'object') return null;
              // push key এর প্রথম ৮ char থেকে timestamp
              const pushTs = parseInt(k.substring(0, 8), 16) * 1000;
              return { ...v, _pushTs: pushTs };
            }).filter(e => e && (
              (e.timestamp && ((e.timestamp >= startTsSec && e.timestamp <= endTsSec) || (e.timestamp >= startTs && e.timestamp <= endTs))) ||
              (e._pushTs && e._pushTs >= startTs && e._pushTs <= endTs)
            ));
            callback(entries.length > 0 ? entries : Object.values(raw3).slice(-500));
          });
        });
      }).catch(() => callback(null));
    };

    tryLoadFromPath(histPath, (entries) => {
      if (!entries || entries.length === 0) {
        // fallback: সরাসরি device path থেকে চেষ্টা
        tryLoadFromPath(cfg.fbPath, (entries2) => {
          if (!entries2 || entries2.length === 0) {
            showToast('নির্বাচিত সময়ে কোনো ডেটা পাওয়া যায়নি।', 'warning');
            return;
          }
          processHistoricalData(entries2);
        });
        return;
      }
      processHistoricalData(entries);
    });
  }

  function processHistoricalData(entries) {
    if (!entries || entries.length === 0) { showToast('কোনো ডেটা পাওয়া যায়নি।', 'warning'); return; }
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    // ✅ FIX 2: timestamp বিভিন্ন ফরম্যাটে হতে পারে — সব handle করো
    const getTs = (e) => {
      if (e.timestamp) {
        const ts = e.timestamp;
        // seconds (10 digit) নাকি milliseconds (13 digit)
        return typeof ts === 'number' ? (ts > 1e10 ? ts : ts * 1000) : new Date(ts).getTime();
      }
      if (e._pushTs) return e._pushTs;
      return 0;
    };
    entries = entries.filter(e => e && typeof e === 'object');
    entries.sort((a, b) => getTs(a) - getTs(b));

    const labels = entries.map(e => {
      const ts = getTs(e);
      if (!ts) return '?';
      return new Date(ts).toLocaleString('bn-BD', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
    });
    const datasets = graphModeSelectedFields.map((fk, idx) => {
      const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
      const fields = (cfg._resolvedFields || cfg.fields || []);
      const fc = fields.find(f => f.key === fk);
      const label = fc ? `${fc.label}${fc.unit ? ' ('+fc.unit+')' : ''}` : fk;
      return {
        fieldKey: fk, label,
        data: entries.map(e => { let v = e[fk]; if(v===true)v=1; else if(v===false)v=0; else v=parseFloat(v); return isNaN(v)?null:v; }),
        borderColor: color.border, backgroundColor: color.bg,
        fill: graphModeChartType === 'area', tension: 0.4, pointRadius: 2, borderWidth: 2,
      };
    });
    graphModeData = { labels, datasets };
    saveGraphData();
    rebuildGraphModeChart();
    showToast(`✅ ${entries.length} টি ডেটা পয়েন্ট লোড হয়েছে।`, 'success');
  }

  function rebuildGraphModeChart() {
    const canvas = document.getElementById('gm-main-chart');
    if (!canvas) return;
    // পেজ active না হলে build করো না
    const page14 = document.getElementById('page14');
    if (page14 && !page14.classList.contains('active')) return;

    const nd = document.getElementById('gm-no-data');
    if (nd) nd.style.display = 'none';
    const isArea = graphModeChartType === 'area';
    const isCombo = graphModeChartType === 'combination';
    const isPie = graphModeChartType === 'pie';
    let datasets;
    if (isPie) {
      const lastVals = graphModeData.datasets.map(d => Math.abs(d.data[d.data.length-1] || 0));
      datasets = [{ data: lastVals,
        backgroundColor: graphModeData.datasets.map((d,i) => GRAPH_COLORS[i%GRAPH_COLORS.length].bg.replace('0.15','0.75')),
        borderColor: graphModeData.datasets.map((d,i) => GRAPH_COLORS[i%GRAPH_COLORS.length].border),
        borderWidth: 2 }];
    } else {
      datasets = graphModeData.datasets.map((ds, idx) => {
        const d = {...ds};
        if (isArea) { d.fill = true; d.type = 'line'; }
        else if (isCombo) { d.type = idx%2===0 ? 'bar' : 'line'; d.fill = false; }
        else { d.fill = false; d.type = graphModeChartType; }
        return d;
      });
    }
    const options = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
      spanGaps: true,
      interaction: { mode: isPie ? 'point' : 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#c8e6f5', padding: 15, font: { size: 12 }, usePointStyle: true } },
        tooltip: { backgroundColor: 'rgba(4,8,20,0.97)', titleColor: '#00d4ff', bodyColor: '#c8e6f5',
          borderColor: 'rgba(0,212,255,0.3)', borderWidth: 1, padding: 12,
          callbacks: isPie ? { label: ctx => ` ${graphModeData.datasets[ctx.dataIndex]?.label}: ${ctx.parsed}` } : {}
        }
      },
      scales: isPie ? {} : {
        x: {
          grid: { color: 'rgba(0,212,255,0.05)' },
          ticks: { color: '#8ab4cc', maxTicksLimit: 10, maxRotation: 45, font: { size: 10 }, autoSkip: true },
          // গ্রাফ সবসময় সর্বশেষ ডেটা পর্যন্ত এগিয়ে যাবে
          bounds: 'data',
        },
        y: { grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { color: '#8ab4cc', font: { size: 11 } } }
      }
    };
    const chartLabels = isPie ? graphModeData.datasets.map(d => d.label) : graphModeData.labels;

    // বিদ্যমান chart আছে কিনে চেক করো - আপডেট করো নাহলে নতুন বানাও
    if (graphModeChart) {
      try {
        graphModeChart.data.labels = chartLabels;
        graphModeChart.data.datasets = datasets;
        // x-axis bounds রিসেট করো যাতে নতুন ডেটায় গ্রাফ এগিয়ে যায়
        if (graphModeChart.options.scales && graphModeChart.options.scales.x) {
          graphModeChart.options.scales.x.min = undefined;
          graphModeChart.options.scales.x.max = undefined;
        }
        graphModeChart.update('none');
        return;
      } catch(e) {
        try { graphModeChart.destroy(); } catch(e2) {}
        graphModeChart = null;
      }
    }

    // Chart.js এ canvas re-use সমস্যা এড়াতে existing instance destroy করো
    try {
      const existingChart = Chart.getChart(canvas);
      if (existingChart) existingChart.destroy();
    } catch(e) {}

    try {
      graphModeChart = new Chart(canvas, {
        type: isPie ? 'pie' : (isCombo ? 'bar' : (isArea ? 'line' : graphModeChartType)),
        data: { labels: chartLabels, datasets }, options,
      });
    } catch(e) {
      console.warn('Chart creation error:', e);
    }
  }

  function downloadGraphAsPNG() {
    const canvas = document.getElementById('gm-main-chart');
    if (!canvas || !graphModeChart) { showToast('আগে একটি গ্রাফ তৈরি করুন।', 'error'); return; }
    const link = document.createElement('a');
    link.download = `bisnu_graph_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function downloadGraphDataAsCSV() {
    if (!graphModeData.labels || graphModeData.labels.length === 0) { showToast('কোনো ডেটা নেই।', 'error'); return; }
    let csv = '\uFEFF';
    csv += 'সময়,' + graphModeData.datasets.map(d => d.label).join(',') + '\n';
    graphModeData.labels.forEach((label, i) => {
      csv += `"${label}",` + graphModeData.datasets.map(d => d.data[i] ?? '').join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bisnu_data_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.csv`;
    link.click();
    showToast('CSV ডাউনলোড হচ্ছে।', 'success');
  }

  function printGraphMode() {
    const canvas = document.getElementById('gm-main-chart');
    if (!canvas) return;
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    const title = cfg ? cfg.label : 'গ্রাফ মোড';
    const win = window.open('', 'গ্রাফ প্রিন্ট');
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>body{background:#fff;font-family:sans-serif;text-align:center;padding:20px;}
      h2{color:#0090bb;}p{color:#555;font-size:14px;}</style></head>
      <body><h2>BISNU IoT — ${title}</h2><p>তারিখ: ${new Date().toLocaleString('bn-BD')}</p>
      <img src="${canvas.toDataURL()}" style="max-width:100%;border:1px solid #eee;border-radius:8px;"/>
      </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  }

  function clearGraphHistory() {
    if (!confirm('গ্রাফের সব ডেটা মুছে ফেলবেন?')) return;
    if (graphModeChart) { try { graphModeChart.destroy(); } catch(e){} graphModeChart = null; }
    graphModeData = { labels: [], datasets: [] };
    graphModeSelectedFields = [];
    // localStorage থেকেও মুছো
    localStorage.removeItem('gm_chartData');
    localStorage.setItem('gm_selectedFields', '[]');
    if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
    if (graphModeFirebaseListener) { try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e){} graphModeFirebaseListener = null; graphModeFirebaseCallback = null; graphModeLiveInterval = null; }
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (cfg) buildGraphFieldSelector();
    const nd = document.getElementById('gm-no-data');
    if (nd) nd.style.display = 'block';
    showToast('গ্রাফ ইতিহাস মুছে ফেলা হয়েছে।', 'success');
  }

  function showPage(pageId) {
    document.querySelectorAll('.nav-tabs .nav-tab').forEach(t => t.classList.remove('active'));
    const at = document.querySelector(`.nav-tab[data-tab-id="${pageId}"]`);
    if (at) at.classList.add('active');
    document.querySelectorAll('.device-page').forEach(p => p.classList.remove('active'));
    const ap = document.getElementById(pageId);
    if (ap) ap.classList.add('active');
    if (pageId === 'page6' && typeof advancedEnergyChart !== 'undefined' && advancedEnergyChart) updateAdvancedChart();

    if (pageId === 'page14') {
      initGraphModePage();
    } else {
      // অন্য পেজে গেলে: listener বন্ধ করো কিন্তু graphModeData/chart ধরে রাখো
      if (graphModeLiveInterval && graphModeLiveInterval !== 'firebase') { clearInterval(graphModeLiveInterval); graphModeLiveInterval = null; }
      if (graphModeFirebaseListener) {
        try { graphModeFirebaseListener.off('value', graphModeFirebaseCallback); } catch(e) {}
        graphModeFirebaseListener = null; graphModeFirebaseCallback = null;
        graphModeLiveInterval = null;
      }
      // ডেটা localStorage-এ save করো যাতে রিফ্রেশেও থাকে
      if (graphModeData.labels && graphModeData.labels.length > 0) saveGraphData();
    }
  }

  let graphModeInitialized = false;

  function initGraphModePage() {
    // তারিখ/সময় ইনপুট পুনরুদ্ধার করো
    restoreDateTimeInputs();
    // চার্ট টাইপ বাটন সক্রিয় করো
    document.querySelectorAll('.gm-type-btn').forEach(b => b.classList.remove('active'));
    const activeTypeBtn = document.querySelector(`.gm-type-btn[data-type="${graphModeChartType}"]`);
    if (activeTypeBtn) activeTypeBtn.classList.add('active');
    // লাইভ উইন্ডো বাটন সক্রিয় করো
    document.querySelectorAll('.gm-live-window-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.min) === graphModeLiveWindow);
    });

    if (!graphModeInitialized || Object.keys(graphModeDynamicPages).length === 0) {
      // প্রথমবার বা রিফ্রেশের পরে - Firebase থেকে সব ডিভাইস লোড করো
      buildGraphModeDynamicPages();
      graphModeInitialized = true;
      // localStorage থেকে পুরানো chart data আছে কিনা চেক করো
      if (graphModeSelectedPage && graphModeSelectedFields.length > 0 && graphModeData.datasets.length > 0) {
        // পুরানো ডেটা দিয়ে সাথে সাথে chart দেখাও
        const nd = document.getElementById('gm-no-data');
        if (nd) nd.style.display = 'none';
        setTimeout(() => { try { rebuildGraphModeChart(); } catch(e) {} }, 200);
      }
    } else {
      // অন্য পেজ থেকে ফিরে আসলে
      buildGraphPageSelector();
      if (graphModeSelectedPage) {
        buildGraphFieldSelector();
        // পুরানো chart data থাকলে সাথে সাথে দেখাও
        if (graphModeData.labels && graphModeData.labels.length > 0 && graphModeData.datasets.length > 0) {
          const nd = document.getElementById('gm-no-data');
          if (nd) nd.style.display = 'none';
          // chart destroy হয়ে গেলে rebuild করো
          if (!graphModeChart) {
            try { rebuildGraphModeChart(); } catch(e) {}
          }
        }
        // লাইভ listener restart করো
        if (graphModeSelectedFields.length > 0 && !graphModeLiveInterval && !graphModeFirebaseListener) {
          const sDate = document.getElementById('gm-start-date')?.value || '';
          const eDate = document.getElementById('gm-end-date')?.value || '';
          if (!sDate && !eDate) {
            // ছোট delay দাও যাতে chart canvas ready থাকে
            setTimeout(() => startGraphModeLive(), 100);
          }
        }
      }
    }
    const nd = document.getElementById('gm-no-data');
    if (!graphModeSelectedPage && nd) nd.style.display = 'block';
    else if (graphModeSelectedPage && (graphModeData.datasets.length > 0 || graphModeChart) && nd) nd.style.display = 'none';
    const histSection = document.getElementById('gm-relay-history-section');
    const cfg = graphModeDynamicPages[graphModeSelectedPage];
    if (histSection) histSection.style.display = (cfg && cfg.type === 'device') ? 'block' : 'none';
    updateRelayHistoryTable();
  }

  // Event Listeners
  function handleLoginKeyPress(e){if(e.key==="Enter"){if(document.getElementById('login-box').style.display!=='none')loginWithFirebase();else registerWithFirebase();}}
  ['email','password','register-username','register-email','register-password','confirm-password'].forEach(id=>document.getElementById(id).addEventListener("keypress",handleLoginKeyPress));
  document.getElementById("forgotEmailInput").addEventListener("keypress", e=>{ if(e.key==="Enter") sendPasswordReset(); });
  document.getElementById("relayPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")verifyAndOperateRelay();});
  document.getElementById("timerPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")saveTimerSettings();});
  document.getElementById("actionPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")verifyAndExecuteAction();});
  document.getElementById("addPagePasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")saveNewPage();});
  document.getElementById("regSecurityInput").addEventListener("keypress",e=>{if(e.key==="Enter")checkRegistrationSecurity();});
  document.getElementById('action-device').addEventListener('change',()=>populateRelayDropdown(document.getElementById('action-device'), document.getElementById('action-relay')));
  
  const navContainer = document.getElementById('nav-tabs-container');
  navContainer.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    navContainer.scrollLeft += evt.deltaY;
  });

  window.onload = function() { createParticles(); };
