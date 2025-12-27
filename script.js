// ### ৩. `script.js`
// এই ফাইলে সব জাভাস্ক্রিপ্ট কোড থাকবে।

// ```javascript
// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// মাউস হুইল দিয়ে মেনু ডানে-বামে সরানোর লজিক
const navContainer = document.getElementById('nav-tabs-container');
if (navContainer) {
    navContainer.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        navContainer.scrollLeft += evt.deltaY;
    });
}

// Particle Effect Initialization
function createParticles() { const cont = document.getElementById('particles'); if(cont.children.length > 0) return; for (let i=0; i<30; i++) { const p = document.createElement('div'); p.className = 'particle'; const size = Math.random()*10+5; p.style.width=`${size}px`; p.style.height=`${size}px`; p.style.left=`${Math.random()*100}%`; p.style.top=`${Math.random()*100}%`; p.style.animationDelay=`${Math.random()*15}s`; p.style.animationDuration=`${Math.random()*10+10}s`; p.style.opacity=Math.random()*0.5+0.1; cont.appendChild(p); } }

window.onload = function() { 
    createParticles(); 
};

// Firebase কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyATDfnefdyPAzBNKZY4VM5ja8K2-63PC-U",
  authDomain: "home-server-346b6.firebaseapp.com",
  databaseURL: "https://home-server-346b6-default-rtdb.firebaseio.com",
  projectId: "home-server-346b6",
  storageBucket: "home-server-346b6.appspot.com",
  messagingSenderId: "531234227336",
  appId: "1:531234227336:web:f57f700dd6baaed4358b3d",
  measurementId: "G-QDWVP34FSX"
};

// Firebase ইনিশিয়ালাইজ করুন
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const messaging = firebase.messaging();

const correctOperatingPassword = "000";

// --- গ্লোবাল ভ্যারিয়েবল এবং ডিফল্ট পাথ ---
let databaseStructure = {};
let pathMappings = {};
let activeListeners = [];
let logicOverrides = {}; 
let previousDeviceStates = {}; 
// ★★★ সাউন্ড মিউট অবস্থা localStorage থেকে লোড করা হচ্ছে ★★★
let isNotificationMuted = localStorage.getItem('isNotificationMuted') === 'true';

// ★★★ NEW: Global Temp Data Cache for immediate re-render ★★★
let currentTempData = {};

// ★★★ NEW: Temp History Buffer for Large Graph ★★★
let tempSensorHistory = {}; 
let largeTempChartInstance = null;

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
    custom_pages: 'custom_pages'
};

// --- EDIT STATE VARIABLES ---
let editingAutomationRuleId = null;
let editingLogicRuleId = null;


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

// --- ★★★ নতুন ফাংশন: রেজিস্ট্রেশন পাসওয়ার্ড চেক ★★★ ---
function openRegistrationSecurityModal() {
    document.getElementById('registrationSecurityModal').style.display = 'flex';
    document.getElementById('regSecurityInput').value = '';
    document.getElementById('regSecurityInput').focus();
    document.getElementById('regSecurityError').innerText = '';
}

function closeRegistrationSecurityModal() {
    document.getElementById('registrationSecurityModal').style.display = 'none';
}

function checkRegistrationSecurity() {
    const input = document.getElementById('regSecurityInput').value;
    if (input === '00$') {
        closeRegistrationSecurityModal();
        toggleForms(); // সঠিক পাসওয়ার্ড হলে ফর্ম টগল করুন
    } else {
        document.getElementById('regSecurityError').innerText = '❌ ভুল পাসওয়ার্ড!';
        const box = document.querySelector('#registrationSecurityModal .password-modal-box');
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
            if (notificationSound && !isNotificationMuted) { // সাউন্ড চেক
                notificationSound.muted = true;
                notificationSound.play().then(() => {
                    notificationSound.pause();
                    notificationSound.currentTime = 0;
                    notificationSound.muted = false;
                }).catch(e => console.error("Audio unlock failed", e));
            }

            // ★★★ SHOW LOADER IMMEDIATELY ★★★
            document.getElementById('global-loader').style.display = 'flex';

            const loginContainer = document.getElementById("login-screen");
            const appContainer = document.getElementById("app");
            loginContainer.style.animation = "fadeOut 0.5s ease forwards";
            
            await loadPathMappings();
            await fetchDatabaseSchema();
            
            setTimeout(() => {
                // ★★★ HIDE LOADER AFTER DATA LOAD ★★★
                document.getElementById('global-loader').style.display = 'none';

                loginContainer.style.display = "none";
                appContainer.style.display = "block";
                appContainer.style.animation = "fadeIn 0.5s ease forwards";
                setupFirebaseListeners();
                initializeCharts();
                loadThemePreference();
                loadBackgroundPreference();
                loadSoundPreference(); // ★★★ সাউন্ড প্রিফারেন্স লোড ★★★
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
    auth.signOut().then(() => {
        document.getElementById("app").style.animation = "fadeOut 0.5s ease forwards";
        setTimeout(() => window.location.reload(), 500);
    }).catch(error => console.error("লগআউট করার সময় ত্রুটি:", error));
}

// --- পাথ ম্যানেজমেন্ট ---

function getPathFor(componentId) {
    return pathMappings[componentId] || defaultPaths[componentId];
}

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
    popover.style.display = 'flex'; // Display before calculating position
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
            option.value = key;
            option.textContent = key;
            if (key === segment) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            const level = parseInt(e.target.dataset.level);
            const newSegments = [];
            container.querySelectorAll('select').forEach(s => {
                if(parseInt(s.dataset.level) <= level) {
                    newSegments.push(s.value);
                }
            });
            rebuildPathSelectors(newSegments);
        });
        
        container.appendChild(select);
        currentLevelObject = currentLevelObject[segment];
    }
    
    if (typeof currentLevelObject === 'object' && currentLevelObject !== null && Object.keys(currentLevelObject).length > 0) {
        const select = document.createElement('select');
        select.dataset.level = currentSegments.length;
        
        const firstOption = document.createElement('option');
        firstOption.value = "";
        firstOption.textContent = "একটি নির্বাচন করুন...";
        select.appendChild(firstOption);

        Object.keys(currentLevelObject).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            const level = parseInt(e.target.dataset.level);
            const newSegments = [];
            container.querySelectorAll('select').forEach(s => {
                 if(parseInt(s.dataset.level) < level) {
                    newSegments.push(s.value);
                }
            });
            if (e.target.value) {
                newSegments.push(e.target.value);
            }
            rebuildPathSelectors(newSegments);
        });
        
        container.appendChild(select);
    }
}

function closePathSelector() {
    document.getElementById('path-selector-popover').style.display = 'none';
}

async function savePathMapping() {
    const user = auth.currentUser;
    if (!user) return showToast("এই সুবিধাটি শুধুমাত্র লগইন করা ব্যবহারকারীদের জন্য।", "error");
    
    const popover = document.getElementById('path-selector-popover');
    const componentId = popover.dataset.componentId;
    
    const segments = [];
    document.getElementById('path-segments-container').querySelectorAll('select').forEach(select => {
        if (select.value) {
            segments.push(select.value);
        }
    });
    const finalPath = segments.join('/');

    await database.ref(`ui_path_mappings/${user.uid}/${componentId}`).set(finalPath);
    
    showToast("Path সফলভাবে সংরক্ষণ করা হয়েছে!", "success");
    closePathSelector();
    
    await loadPathMappings();
    setupFirebaseListeners();
}


document.addEventListener('click', function(event) {
    const popover = document.getElementById('path-selector-popover');
    if (popover.style.display === 'flex' && !popover.contains(event.target) && !event.target.classList.contains('path-config-icon')) {
        closePathSelector();
    }
});


// --- বাকি জাভাস্ক্রিপ্ট কোড ---
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
  
  function showPage(pageId) {
    document.querySelectorAll('.nav-tabs .nav-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.nav-tab[data-tab-id="${pageId}"]`);
    if(activeTab) activeTab.classList.add('active');
    document.querySelectorAll('.device-page').forEach(p => p.classList.remove('active'));
    const activePage = document.getElementById(pageId);
    if(activePage) activePage.classList.add('active');
    if(pageId === 'page6' && advancedEnergyChart) updateAdvancedChart();
  }
  
  function controlRelay(device, relay, element) {
      const state = element.checked;
      const deviceRootPath = getPathFor('devices_root');
      const path = `${deviceRootPath}/${device}`;
      
      // ★★★ SET MANUAL OVERRIDE FLAG ★★★
      const overridePath = `${getPathFor('logic_gate_overrides')}/${device}/${relay}`;
      database.ref(overridePath).set(firebase.database.ServerValue.TIMESTAMP);

      database.ref(path).update({ [relay]: state });
      
      const name = (relayNames[device]?.[relay]) || relay;
      const msg = `${device} এর ${name} ${state ? 'চালু' : 'বন্ধ'} করা হয়েছে (ম্যানুয়াল)`;
      addLogEntry(device, msg, state ? 'success' : 'error');
      logAuditEvent(`ডিভাইস ${device.replace('device','')} এর '${name}' ${state ? 'চালু' : 'বন্ধ'} করেছেন (ম্যানুয়াল ওভাররাইড)।`);
  }

  function controlDevice(device, load, state) {
      const stateText = state === 1 ? 'চালু' : (state === 2 ? 'সতর্কতা মোডে' : 'বন্ধ');
      const path = getPathFor(`${device}_data`);
      if(!path) {
          showToast(`Error: Path for ${device} is not configured!`, 'error');
          return;
      }
      
      // ★★★ SET MANUAL OVERRIDE FLAG ★★★
      const overridePath = `${getPathFor('logic_gate_overrides')}/${device}/${load}`;
      database.ref(overridePath).set(firebase.database.ServerValue.TIMESTAMP);

      database.ref(path).update({ [load]: state });
      
      addLogEntry(device, `${device} এর ${load} ${stateText} করা হয়েছে (ম্যানুয়াল)`, state === 1 ? 'success' : state === 2 ? 'warning' : 'error');
      logAuditEvent(`ডিভাইস ${device.replace('device','')} এর '${load}' ${stateText} সেট করেছেন (ম্যানুয়াল ওভাররাইড)।`);
  }
  
  // ★★★ NEW FUNCTION: CLEAR OVERRIDE ★★★
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
  
  // ★★★ OPTIMIZED: Update Single Device Page without full redraw ★★★
  function updateSingleDevicePage(deviceId, deviceData) {
      const deviceNum = deviceId.replace('device', '');
      const container = document.getElementById(`${deviceId}-cards-container`);
      if (!container) return;

      if (deviceData) {
          const loadKeys = Object.keys(deviceData).filter(k => k.startsWith('Load')).sort((a, b) => parseInt(a.replace('Load', '')) - parseInt(b.replace('Load', '')));
          
          // Only clear and rebuild if structure changes, otherwise update values
          // For simplicity in this fix, we are just using innerHTML replacement BUT with CSS hardware acceleration
          // This stops the visual blinking/vibration.
          
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
          
          // Only update innerHTML if it actually changed to prevent some unnecessary reflows
          if (container.innerHTML !== html) {
              container.innerHTML = html;
          }

          document.getElementById(`d${deviceNum}-active-count`).textContent = active;
          document.getElementById(`d${deviceNum}-inactive-count`).textContent = inactive;
          document.getElementById(`d${deviceNum}-warning-count`).textContent = warning;
          document.getElementById(`d${deviceNum}-total-count`).textContent = total;
          if (deviceCharts[deviceId]) { deviceCharts[deviceId].data.datasets[0].data = [active, warning, inactive]; deviceCharts[deviceId].update(); }
      }
  }

  function toggleTheme() {
    const isLight = document.getElementById('theme-toggle').checked;
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    Chart.defaults.color = isLight ? '#2c3e50' : '#FFFFFF';
    Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    Object.values({...deviceCharts, ...energyCharts, advancedEnergyChart, ...sensorHistoricalCharts}).forEach(c => c?.update());
  }

  function loadThemePreference() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.getElementById('theme-toggle').checked = (theme === 'light');
    toggleTheme();
    document.getElementById('theme-toggle').addEventListener('change', toggleTheme);
  }
  
  function applyBackground(index) { document.body.className = `bg-${index}`; currentBackgroundIndex = index; }
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
  
  function createGaugeScale(dialId, min, max, major, minor) {
    const dial = document.getElementById(dialId); if (!dial) return; dial.innerHTML = '';
    for (let i=min; i<=max; i+=(major/minor)) {
      const angle = -135 + ((i-min)/(max-min))*270, isMajor = (i-min)%major===0;
      const tick = document.createElement('div'); tick.className = isMajor ? 'gauge-tick' : 'gauge-tick minor';
      tick.style.transform = `rotate(${angle}deg) translate(45%)`; dial.appendChild(tick);
      if(isMajor) {
        const num = document.createElement('div'); num.className = 'gauge-number'; num.textContent = i;
        const angleRad = (angle-90)*(Math.PI/180);
        num.style.left = `${50 + 41*Math.cos(angleRad)}%`; num.style.top = `${50 + 41*Math.sin(angleRad)}%`; dial.appendChild(num);
      }
    }
  }

  function updateProGauge(needleId, val, min, max) {
    const needle = document.getElementById(needleId); if (!needle) return;
    const value = Math.max(min, Math.min(val, max));
    needle.style.transform = `rotate(${-135 + ((value - min) / (max - min)) * 270}deg)`;
  }
  
  function updateEnergyData(data) {
    currentEnergyData = data;
    const setHTML = (id, val, unit) => document.getElementById(id).innerHTML = data[val] ? data[val].toFixed(2) + ` <span class="energy-unit">${unit}</span>` : `-- ${unit}`;
    setHTML('voltage-value', 'voltage', 'V'); setHTML('current-value', 'current', 'A'); setHTML('power-value', 'power', 'W');
    setHTML('energy-value', 'energy', 'kWh'); setHTML('frequency-value', 'frequency', 'Hz'); setHTML('active-power-value', 'activePower', 'W');
    setHTML('reactive-power-value', 'reactivePower', 'VAR'); setHTML('units-value', 'units', 'Units'); setHTML('daily-cost-value', 'dailyCost', 'BDT');
    document.getElementById('power-factor-value').textContent = data.powerFactor ? data.powerFactor.toFixed(2) : '--';
    document.getElementById('timestamp-value').textContent = data.timestamp ? new Date(data.timestamp * 1000).toLocaleString('bn-BD') : '--';
    
    const updateChart = (chart, value) => { if(!value || !chart) return; chart.data.labels.push(''); if(chart.data.labels.length>12) chart.data.labels.shift(); chart.data.datasets[0].data.push(value); if(chart.data.datasets[0].data.length>12) chart.data.datasets[0].data.shift(); chart.update(); };
    updateChart(energyCharts.voltageChart, data.voltage); updateChart(energyCharts.currentChart, data.current); updateChart(energyCharts.powerChart, data.power);
    
    const ts = new Date().getTime(); 
    // Fix: Merge instead of overwrite
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

  // --- ★★★ TIMER LOGIC: DISPLAY AND EXECUTION ★★★ ---
  
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
  
  // New Function: Actually switch the relays
  function processTimerExecution() {
      const now = new Date();
      // Format time as HH:MM:SS to match HTML time input with step="1"
      const currentTimeString = now.toLocaleTimeString('en-GB', { hour12: false });
      
      for(const key in allTimersData) {
          const t = allTimersData[key];
          if(!t.enabled) continue;
          
          // Trigger ON
          // Note: HTML input type="time" normally gives HH:MM. If step="1" is used, it gives HH:MM:SS.
          // We check basic equality. For production, checking a range is safer, but equality works for exact seconds.
          if(t.online === currentTimeString) {
              console.log(`Timer Trigger: Turning ON ${t.device} ${t.relay}`);
              const deviceRootPath = getPathFor('devices_root');
              database.ref(`${deviceRootPath}/${t.device}`).update({ [t.relay]: true });
          }
          
          // Trigger OFF
          if(t.offline === currentTimeString) {
              console.log(`Timer Trigger: Turning OFF ${t.device} ${t.relay}`);
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

  // --- Minified helper functions ---
  function initAdvancedEnergyChart(){if(advancedEnergyChart)advancedEnergyChart.destroy();advancedEnergyChart=new Chart('advanced-energy-chart',{type:'line',data:{datasets:[{label:'ভোল্টেজ (V)',data:[],borderColor:'rgba(230,126,34,1)',backgroundColor:'rgba(230,126,34,0.2)',fill:true,tension:0.4}]},options:getChartOptions()});}
  function changeTimeRange(mins){selectedTimeRange=mins;document.querySelectorAll('.time-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');updateAdvancedChart();}
  function selectMetric(metric){selectedMetric=metric;document.querySelectorAll('.metric-card').forEach(c=>c.classList.remove('selected'));event.target.closest('.metric-card').classList.add('selected');updateAdvancedChart();}
  function getMetricName(m){return{voltage:'ভোল্টেজ',current:'কারেন্ট',power:'পাওয়ার',energy:'এনার্জি',frequency:'ফ্রিকোয়েন্সি',powerFactor:'পাওয়ার ফ্যাক্টর',activePower:'অ্যাক্টিভ পাওয়ার',reactivePower:'রিঅ্যাক্টিভ পাওয়ার'}[m]||m;}
  function getTimeRangeText(m){return m<60?`${m} মিনিট`:`${Math.floor(m/60)} ঘন্টা`;}
  function updateAdvancedChart(){if(!advancedEnergyChart)return;const now=new Date().getTime(),cutoff=now-(selectedTimeRange*60*1000);const timestamps=Object.keys(historicalData).filter(ts=>parseInt(ts)>=cutoff).sort();const labels=timestamps.map(ts=>new Date(parseInt(ts)).toLocaleTimeString('bn-BD'));const data=timestamps.map(ts=>historicalData[ts]?.[selectedMetric]);document.getElementById('advanced-graph-title').textContent=`${getMetricName(selectedMetric)} ট্রেন্ড (${getTimeRangeText(selectedTimeRange)})`;advancedEnergyChart.data.labels=labels;advancedEnergyChart.data.datasets[0].data=data;advancedEnergyChart.data.datasets[0].label=`${getMetricName(selectedMetric)} (${getUnit(selectedMetric)})`;advancedEnergyChart.update();document.getElementById('no-data-message').style.display=data.length===0?'block':'none';}
  function getUnit(m){return{voltage:'V',current:'A',power:'W',energy:'kWh',frequency:'Hz',powerFactor:'',activePower:'W',reactivePower:'VAR'}[m]||'';}
  function downloadGraphData(){let csv="data:text/csv;charset=utf-8,সময়,ভোল্টেজ (V),কারেন্ট (A),পাওয়ার (W),এনার্জি (kWh),ফ্রিকোয়েন্সি (Hz),পাওয়ার ফ্যাক্টর,অ্যাক্টিভ পাওয়ার (W),রিঅ্যাক্টিভ পাওয়ার (VAR)\n";Object.keys(historicalData).sort().forEach(ts=>{const d=historicalData[ts];csv+=[new Date(parseInt(ts)).toLocaleString(),d.voltage||'',d.current||'',d.power||'',d.energy||'',d.frequency||'',d.powerFactor||'',d.activePower||'',d.reactivePower||''].join(",")+"\n";});const link=document.createElement("a");link.href=encodeURI(csv);link.download=`energy_data_${new Date().toLocaleDateString()}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);}
  function printGraph(){const canvas=document.getElementById('advanced-energy-chart'),win=window.open('','Print');win.document.write(`<h1>${document.getElementById('advanced-graph-title').textContent}</h1><img src="${canvas.toDataURL()}"/>`);win.document.close();win.focus();setTimeout(()=>{win.print();win.close();},500);}
  function showToast(msg,type='info'){
      // ★★★ সাউন্ড মিউট লজিক এখানে যুক্ত করা হয়েছে ★★★
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
  
  // --- ★★★ নতুন টগল সাউন্ড ফাংশন ★★★ ---
  function toggleNotificationSound() {
      isNotificationMuted = !isNotificationMuted;
      localStorage.setItem('isNotificationMuted', isNotificationMuted); // Save state
      loadSoundPreference();
      showToast(isNotificationMuted ? 'নোটিফিকেশন সাউন্ড বন্ধ করা হয়েছে।' : 'নোটিফিকেশন সাউন্ড চালু করা হয়েছে।', isNotificationMuted ? 'warning' : 'success');
  }

  // --- ★★★ সাউন্ড প্রিফারেন্স লোড ফাংশন ★★★ ---
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
  
  // ★★★ FIX FOR INPUT BLINKING ★★★
  function updateAutomationFormOptions(){
      const devs=currentDeviceStates?Object.keys(currentDeviceStates).sort((a,b)=>parseInt(a.replace('device',''))-parseInt(b.replace('device',''))):[],actDevSelect=document.getElementById('action-device');
      if(!actDevSelect)return;
      const currActDev=actDevSelect.value;
      
      // Update Action Device Dropdown (Safe)
      actDevSelect.innerHTML='';
      devs.forEach(devId=>{const opt=document.createElement('option');opt.value=devId;opt.textContent=devId.replace('device','ডিভাইস ');actDevSelect.appendChild(opt);});
      if(devs.includes(currActDev))actDevSelect.value=currActDev;
      
      populateRelayDropdown(actDevSelect,document.getElementById('action-relay'));
      
      // Only update trigger options if source is 'device', otherwise skip to prevent input reset
      const src = document.getElementById('trigger-source').value;
      if (src === 'device') {
          // Even if device, check focus to be safe
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
      
      // If editing, use different confirmation logic if needed, or reuse prompt
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
             .then(()=>{
                 showToast('অটোমেশন রুল সফলভাবে আপডেট হয়েছে!','success');
                 logAuditEvent(`অটোমেশন রুল '${rule.name}' আপডেট করেছেন।`);
                 cancelEditAutomation();
             });
          } else {
             database.ref(getPathFor('automation_rules')).push(rule)
             .then(()=>{
                 showToast('অটোমেশন রুল সফলভাবে সংরক্ষিত হয়েছে!','success');
                 logAuditEvent(`নতুন অটোমেশন রুল '${rule.name}' তৈরি করেছেন।`);
                 cancelEditAutomation();
             });
          }
      });
  }

  function editAutomationRule(id) {
      const rule = automationRules[id];
      if (!rule) return;
      
      editingAutomationRuleId = id;
      document.getElementById('rule-name').value = rule.name;
      document.getElementById('trigger-source').value = rule.triggerSource;
      updateTriggerOptions(); // Rebuild trigger options based on source
      
      // Populate Trigger Options
      setTimeout(() => {
          if(rule.triggerSource==='energy'){
              document.getElementById('trigger-metric').value = rule.triggerMetric;
              document.getElementById('trigger-condition').value = rule.triggerCondition;
              document.getElementById('trigger-value').value = rule.triggerValue;
          }else if(rule.triggerSource==='time') {
              document.getElementById('trigger-value').value = rule.triggerValue;
          }else if(rule.triggerSource==='device'){
              document.getElementById('trigger-device').value = rule.triggerDevice;
              // Need to populate relay dropdown for trigger device
              populateRelayDropdown(document.getElementById('trigger-device'),document.getElementById('trigger-relay'));
              document.getElementById('trigger-relay').value = rule.triggerRelay;
              document.getElementById('trigger-condition').value = rule.triggerState ? 'true' : 'false';
          }
      }, 100); // Small delay to ensure DOM is ready

      document.getElementById('action-device').value = rule.actionDevice;
      populateRelayDropdown(document.getElementById('action-device'), document.getElementById('action-relay'));
      document.getElementById('action-relay').value = rule.actionRelay;
      document.getElementById('action-state').value = rule.actionState ? 'true' : 'false';

      document.getElementById('send-notification-checkbox').checked = rule.sendNotification;
      document.getElementById('notification-message-group').style.display = rule.sendNotification ? 'flex' : 'none';
      document.getElementById('notification-message').value = rule.notificationMessage || '';

      // Change UI to Edit Mode
      const submitBtn = document.querySelector('#automation-rule-form button[type="submit"]');
      submitBtn.textContent = '🔄 আপডেট করুন';
      document.getElementById('cancel-automation-edit-btn').style.display = 'block';
      
      // Scroll to form
      document.querySelector('.automation-grid').scrollIntoView({behavior: 'smooth'});
  }

  function cancelEditAutomation() {
      editingAutomationRuleId = null;
      document.getElementById('automation-rule-form').reset();
      document.getElementById('notification-message-group').style.display='none';
      updateTriggerOptions(); // Reset trigger options to default
      
      const submitBtn = document.querySelector('#automation-rule-form button[type="submit"]');
      submitBtn.textContent = '💾 রুল সংরক্ষণ করুন';
      document.getElementById('cancel-automation-edit-btn').style.display = 'none';
  }

  function toggleRule(id){const rule=automationRules[id],newState=!rule.isEnabled;database.ref(`${getPathFor('automation_rules')}/${id}/isEnabled`).set(newState).then(()=>logAuditEvent(`'${rule.name}' রুলটি ${newState?'সক্রিয়':'নিষ্ক্রিয়'} করেছেন।`));}
  function deleteRule(id){const name=automationRules[id].name;promptForActionPassword('রুল মুছুন',`আপনি কি সত্যিই "${name}" রুলটি মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('automation_rules')}/${id}`).remove().then(()=>logAuditEvent(`'${name}' রুলটি মুছে ফেলেছেন।`)));}
  function triggerNotification(title,body){showToast(body,'info');displayNotification(title,body);}
  
  // --- ★★★ AUTOMATION LOGIC FIX (Manual Override Support) ★★★ ---
  function checkAutomationRules(src, data) {
    const now = new Date();
    const currTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowTs = now.getTime();

    for (const id in automationRules) {
        const rule = automationRules[id];
        if (!rule.isEnabled || (nowTs - (rule.lastFired || 0) < 5000)) continue;

        // ★★★ CHECK FOR MANUAL OVERRIDE ★★★
        if (logicOverrides[rule.actionDevice] && logicOverrides[rule.actionDevice][rule.actionRelay]) {
            // Skip automation if manually overridden
            continue;
        }

        let trigger = false;

        // Energy Logic
        if (src === 'energy' && rule.triggerSource === 'energy') {
            const val = parseFloat(data[rule.triggerMetric]);
            const targetVal = parseFloat(rule.triggerValue);

            if (!isNaN(val)) {
                if (rule.triggerCondition === '>' && val > targetVal) trigger = true;
                if (rule.triggerCondition === '<' && val < targetVal) trigger = true;
                if (rule.triggerCondition === '==' && val == targetVal) trigger = true;
            }
        }

        // Time Logic
        if (src === 'time' && rule.triggerSource === 'time' && rule.triggerValue === currTime) {
            trigger = true;
        }

        // Device Logic
        if (src === 'device' && rule.triggerSource === 'device') {
            if (data.deviceId === rule.triggerDevice) {
                 const currentState = data.states[rule.triggerRelay];
                 if (String(currentState) === String(rule.triggerState)) {
                     trigger = true;
                 }
            }
        }

        if (trigger) {
            console.log(`Automation Triggered: ${rule.name}`);
            database.ref(`${getPathFor('devices_root')}/${rule.actionDevice}`).update({
                [rule.actionRelay]: rule.actionState
            });

            if (rule.sendNotification && rule.notificationMessage) {
                triggerNotification(`"${rule.name}" কার্যকর হয়েছে`, rule.notificationMessage);
            }

            database.ref(`${getPathFor('automation_rules')}/${id}/lastFired`).set(nowTs);
            const logMsg = `অটোমেশন "${rule.name}" অনুযায়ী ${rule.actionDevice} এর ${rule.actionRelay} ${rule.actionState ? 'ON' : 'OFF'} করা হয়েছে।`;
            addLogEntry(rule.actionDevice, logMsg, 'info');
            logAuditEvent(logMsg, "সিস্টেম অটোমেশন");
        }
    }
  }

  // Check time-based rules every minute as backup
  setInterval(()=>checkAutomationRules('time',{}),60000);
  
  function editRelayName(dev,rel){const currName=(relayNames[dev]?.[rel])||rel;const newName=prompt(`'${currName}' এর জন্য নতুন নাম দিন:`,currName);if(newName&&newName.trim()!=="")database.ref(`${getPathFor('device_metadata')}/${dev}/relay_names/${rel}`).set(newName).then(()=>logAuditEvent(`'${currName}' রিলের নাম পরিবর্তন করে '${newName}' রেখেছেন।`));}
  function executeScene(id,actions,name){promptForActionPassword(`'${name}' দৃশ্যটি চালান`,`আপনি কি সত্যিই "${name}" দৃশ্যটি কার্যকর করতে চান?`,()=>{const updates={};if(Array.isArray(actions))actions.forEach(a=>updates[`${getPathFor('devices_root')}/${a.device}/${a.relay}`]=a.state);if(Object.keys(updates).length===0)return showToast("এই দৃশ্যে কোনো অ্যাকশন সেট করা নেই।","warning");database.ref().update(updates).then(()=>logAuditEvent(`"${name}" দৃশ্যটি কার্যকর করেছেন।`));});}
  function openSceneModal(){const cont=document.getElementById('scene-relay-list-container');let html='';const sortedDevs=Object.keys(currentDeviceStates).sort((a,b)=>parseInt(a.replace('device',''))-parseInt(b.replace('device','')));sortedDevs.forEach(devId=>{html+=`<div class="scene-device-header">${devId.replace('device','ডিভাইস ')}</div>`;const relays=Object.keys(currentDeviceStates[devId]).filter(k=>k.startsWith('relay')||k.startsWith('Load')).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/)));relays.forEach(relId=>{const name=(relayNames[devId]?.[relId])||relId;html+=`<div class="scene-relay-item"><span>${name}</span><select class="scene-action-select" data-device="${devId}" data-relay="${relId}"><option value="ignore">কোনো পরিবর্তন নয়</option><option value="true">ON করুন</option><option value="false">OFF করুন</option></select></div>`;});});cont.innerHTML=html;document.getElementById('sceneModal').style.display='flex';}
  function closeSceneModal(){document.getElementById('sceneModal').style.display='none';document.getElementById('scene-name').value='';document.getElementById('scene-error-message').textContent='';}
  async function saveScene(){const name=document.getElementById('scene-name').value;if(!name||name.trim()==='')return showToast('দৃশ্যের একটি নাম দিন।','error');const actions=[];document.querySelectorAll('.scene-action-select').forEach(sel=>{if(sel.value!=='ignore')actions.push({device:sel.dataset.device,relay:sel.dataset.relay,state:sel.value==='true'});});if(actions.length===0)return showToast('অন্তত একটি রিলের জন্য অ্যাকশন নির্বাচন করুন।','error');await database.ref(getPathFor('scenes')).push({name:name,actions:actions});logAuditEvent(`নতুন দৃশ্য '${name}' তৈরি করেছেন।`);closeSceneModal();}
  function deleteScene(id,name){promptForActionPassword('দৃশ্য মুছুন',`আপনি কি "${name}" দৃশ্যটি স্থায়ীভাবে মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('scenes')}/${id}`).remove().then(()=>logAuditEvent(`দৃশ্য '${name}' মুছে ফেলেছেন।`)));}
  function updateAllDateTimeDisplays(){const now=new Date(),date=now.toLocaleDateString('en-GB').replace(/\//g,'-'),time=now.toLocaleTimeString('en-GB');document.querySelectorAll('[id^="date-"]').forEach(el=>el.innerHTML=`<i class="fas fa-calendar-alt"></i> ${date}`);document.querySelectorAll('[id^="time-"]').forEach(el=>el.innerHTML=`<i class="fas fa-clock"></i> ${time}`);}
  
  // --- ★★★ NEW: Get Linked Rules Helper ★★★ ---
  function getLinkedRules(deviceId, relayId) {
      const links = [];
      // Check Automation Rules (Output/Action)
      for (const id in automationRules) {
          const rule = automationRules[id];
          if (rule.actionDevice === deviceId && rule.actionRelay === relayId && rule.isEnabled) {
              links.push(`অটোমেশন: ${rule.name}`);
          }
      }
      // Check Logic Gate Rules (Output)
      for (const id in logicGateRules) {
          const rule = logicGateRules[id];
          if (rule.output.device === deviceId && rule.output.relay === relayId && rule.isEnabled) {
              links.push(`লজিক গেট: ${rule.name}`);
          }
      }
      return links;
  }
  
  function isTargetOfActiveLogicRule(deviceId, relayId) {
      for (const id in logicGateRules) {
          const rule = logicGateRules[id];
          if (rule.isEnabled && rule.output.device === deviceId && rule.output.relay === relayId) {
              return true;
          }
      }
      return false;
  }
  
  function toggleLinkDropdown(element, event) {
      event.stopPropagation();
      const dropdown = element.querySelector('.linked-rule-dropdown');
      const allDropdowns = document.querySelectorAll('.linked-rule-dropdown');
      
      // Close others
      allDropdowns.forEach(d => {
          if(d !== dropdown) d.classList.remove('show');
      });
      
      dropdown.classList.toggle('show');
  }

  // --- ★★★ OPTIMIZED: কন্ট্রোল প্যানেল রেন্ডারিং (লাফানো বন্ধ করবে) ★★★ ---
  function renderControlPanel(devsData, relNames) {
      const cont = document.getElementById('control-panel-container');
      if (!cont) return;

      const sortedDevs = Object.keys(devsData).sort((a, b) => {
          const nA = parseInt(a.replace('device', '')), nB = parseInt(b.replace('device', ''));
          if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
          return a.localeCompare(b);
      });

      sortedDevs.forEach(devId => {
          if (devId.startsWith('temperature')) return; // তাপমাত্রা সেন্সর বাদ দিন

          // ১. ডিভাইস সেকশন চেক করুন (আগে থেকে আছে কিনা)
          let section = document.getElementById(`section-${devId}`);
          
          // যদি সেকশন না থাকে, তৈরি করুন
          if (!section) {
              section = document.createElement('section');
              section.id = `section-${devId}`;
              section.className = 'control-section';
              section.dataset.componentId = `${devId}_data`;
              
              // সেকশন হেডার তৈরি
              section.innerHTML = `
                  <div class="section-header">
                      <h2 class="control-section-title">
                          <span id="title-${devId}">${(deviceMetadata[devId]?.name) || devId.replace('device', 'ডিভাইস ')} কন্ট্রোল</span>
                      </h2>
                      <div>
                          <button class="pro-btn delete-btn" onclick="deleteDevice('${devId}')" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 10px;">
                              <i class="fas fa-trash-alt"></i> Delete
                          </button>
                          <i class="fas fa-cog path-config-icon" onclick="openPathSelector('${devId}_data', event)"></i>
                      </div>
                  </div>
                  <div class="toggle-switch-grid" id="grid-${devId}"></div>
                  <button class="pro-btn add-relay-btn" onclick="addNewRelay('${devId}')">
                      <i class="fas fa-plus"></i> এই ডিভাইসে নতুন রিলে যোগ করুন
                  </button>
              `;
              cont.appendChild(section);
          } else {
              // নাম আপডেট করুন যদি মেটাডেটা পরিবর্তন হয়
              const titleEl = document.getElementById(`title-${devId}`);
              const newName = (deviceMetadata[devId]?.name) || devId.replace('device', 'ডিভাইস ');
              if (titleEl && titleEl.textContent !== `${newName} কন্ট্রোল`) {
                  titleEl.textContent = `${newName} কন্ট্রোল`;
              }
          }

          // ২. রিলে কার্ড প্রসেসিং
          const grid = document.getElementById(`grid-${devId}`);
          const relays = devsData[devId];
          const sortedRels = Object.keys(relays).filter(k => k.startsWith('relay')).sort((a, b) => parseInt(a.replace('relay', '')) - parseInt(b.replace('relay', '')));

          sortedRels.forEach(relId => {
              const cardId = `card-${devId}-${relId}`;
              let card = document.getElementById(cardId);
              
              const state = relays[relId];
              const name = (relNames[devId]?.[relId]) || relId.replace('relay', 'রিলে ');
              const isOverridden = logicOverrides[devId] && logicOverrides[devId][relId];

              // লিঙ্কড রুল আইকন লজিক
              const linkedRules = getLinkedRules(devId, relId);
              let linkIconHtml = '';
              if (linkedRules.length > 0) {
                  const linksList = linkedRules.map(r => `<div>• ${r}</div>`).join('');
                  linkIconHtml = `<span class="linked-rule-indicator" onclick="toggleLinkDropdown(this, event)" title="লিঙ্কড রুলস"><i class="fas fa-link"></i><div class="linked-rule-dropdown">${linksList}</div></span>`;
              }

              // যদি কার্ড না থাকে, নতুন তৈরি করুন
              if (!card) {
                  card = document.createElement('div');
                  card.className = `toggle-switch-container ${isOverridden ? 'manual-override' : ''}`;
                  card.id = cardId;
                  
                  card.innerHTML = `
                      <div class="toggle-switch-header">
                          <span class="toggle-switch-label">
                              <span class="relay-name-text">${name}</span> 
                              <span class="link-icon-container">${linkIconHtml}</span>
                              <i class="fas fa-pencil-alt edit-relay-name-icon" onclick="editRelayName('${devId}','${relId}')"></i>
                              <i class="fas fa-trash-alt delete-icon" onclick="deleteRelay('${devId}','${relId}')"></i>
                          </span>
                          <div class="device-time-info">
                              <span id="date-${devId}-${relId}"></span>
                              <span id="time-${devId}-${relId}"></span>
                          </div>
                      </div>
                      <div class="toggle-switch-body">
                          <div class="timer-status" id="timer-status-${devId}-${relId}"></div>
                      </div>
                      <div class="toggle-switch-footer">
                          <button class="pro-btn timer-btn" onclick="openTimerModal('${devId}','${relId}')">⏲️ টাইমার</button>
                          <label class="toggle-switch">
                              <input type="checkbox" id="check-${devId}-${relId}" onchange="promptForRelayPassword('${devId}','${relId}',this)" ${state ? 'checked' : ''}>
                              <span class="slider"></span>
                          </label>
                      </div>
                      <i class="fas fa-hand-paper manual-override-indicator" id="override-${devId}-${relId}" style="display: ${isOverridden ? 'block' : 'none'};" onclick="clearManualOverride('${devId}', '${relId}')"></i>
                  `;
                  grid.appendChild(card);
              } else {
                  // ★★★ কার্ড আগেই থাকলে শুধুমাত্র ভ্যালু আপডেট করুন (এটাই জাম্পিং আটকাবে) ★★★
                  
                  // ১. চেকবাক্স আপডেট
                  const checkbox = document.getElementById(`check-${devId}-${relId}`);
                  if (checkbox && checkbox.checked !== state) {
                      checkbox.checked = state;
                  }

                  // ২. নাম আপডেট
                  const nameText = card.querySelector('.relay-name-text');
                  if (nameText && nameText.textContent !== name) {
                      nameText.textContent = name;
                  }

                  // ৩. লিঙ্ক আইকন আপডেট (যদি পরিবর্তন হয়)
                  const linkContainer = card.querySelector('.link-icon-container');
                  if (linkContainer && linkContainer.innerHTML !== linkIconHtml) {
                      linkContainer.innerHTML = linkIconHtml;
                  }

                  // ৪. ম্যানুয়াল ওভাররাইড স্টাইল আপডেট
                  const overrideIcon = document.getElementById(`override-${devId}-${relId}`);
                  if (isOverridden) {
                      card.classList.add('manual-override');
                      if(overrideIcon) overrideIcon.style.display = 'block';
                  } else {
                      card.classList.remove('manual-override');
                      if(overrideIcon) overrideIcon.style.display = 'none';
                  }
              }
          });
          
          // যদি কোনো রিলে ডিলিট হয়ে থাকে, DOM থেকেও রিমুভ করুন
          Array.from(grid.children).forEach(child => {
              const childRelayId = child.id.split('-')[2]; // card-device1-relay1 -> relay1
              if (!relays.hasOwnProperty(childRelayId)) {
                  child.remove();
              }
          });
      });
      
      // টাইমার এবং সময় আপডেট (UI নষ্ট না করে)
      updateAllTimerDisplays();
      updateAllDateTimeDisplays();
      applyUiHighlights();
  }
  
  // Close dropdowns on outside click
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
  function addNewTemperatureSensor(){const name=prompt("নতুন সেন্সর গ্রুপের নাম দিন:");if(!name||name.trim()==="")return;promptForActionPassword('নতুন সেন্সর গ্রুপ যোগ করুন',`আপনি কি '${name}' নামে একটি নতুন সেন্সর গ্রুপ যোগ করতে চান?`,()=>{database.ref(getPathFor('devices_root')).once('value',snap=>{const devs=snap.val()||{};let maxNum=0;Object.keys(devs).forEach(k=>{if(k.startsWith('temperature')){const num=parseInt(k.replace('temperature',''),10);if(!isNaN(num)&&num>maxNum)maxNum=num;}});const newId=`temperature${maxNum+1}`;const updates={};updates[`${getPathFor('devices_root')}/${newId}/celsius_value`]=0;updates[`${getPathFor('devices_root')}/${newId}/fahrenheit_value`]=32;updates[`${getPathFor('device_metadata')}/${newId}/name`]=name.trim();database.ref().update(updates).then(()=>logAuditEvent(`নতুন তাপমাত্রা সেন্সর গ্রুপ '${name.trim()}' যোগ করেছেন।`));});});}
  function editTemperatureSensorName(id){const currentName=(deviceMetadata[id]&&deviceMetadata[id].name)||id;const newName=prompt("সেন্সরের নতুন নাম দিন:",currentName);if(newName&&newName.trim()!==""){const path=`${getPathFor('device_metadata')}/${id}/name`;database.ref(path).set(newName.trim()).then(()=>{showToast("সেন্সরের নাম সফলভাবে পরিবর্তন করা হয়েছে!","success");logAuditEvent(`তাপমাত্রা সেন্সর '${id}' এর নাম পরিবর্তন করে '${newName.trim()}' রাখা হয়েছে।`);}).catch((error)=>{console.error("Error updating name:",error);showToast("নাম পরিবর্তন করতে সমস্যা হয়েছে।","error");});}}
  function deleteTemperatureSensor(id,name){promptForActionPassword('সেন্সর গ্রুপ মুছুন',`আপনি কি সত্যিই '${name}' সেন্সর গ্রুপটি মুছে ফেলতে চান?`,()=>{const updates={};updates[`${getPathFor('devices_root')}/${id}`]=null;updates[`${getPathFor('device_metadata')}/${id}`]=null;database.ref().update(updates).then(()=>logAuditEvent(`তাপমাত্রা সেন্সর গ্রুপ '${name}' মুছে ফেলেছেন।`));});}
  function initSensorHistoricalChart(id){const canvas=document.getElementById(`mini-chart-${id}`);if(!canvas)return;if(sensorHistoricalCharts[id])sensorHistoricalCharts[id].destroy();const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,0,60);gradient.addColorStop(0,'rgba(46, 204, 113, 0.5)');gradient.addColorStop(1,'rgba(46, 204, 113, 0.0)');sensorHistoricalCharts[id]=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{data:[],borderColor:'#2ecc71',backgroundColor:gradient,borderWidth:2,pointRadius:1,pointBackgroundColor:'#fff',fill:true,tension:0.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:true,position:'right',ticks:{color:'#9ca3af',font:{size:9},maxTicksLimit:3},grid:{color:'rgba(255,255,255,0.05)',drawBorder:false}}},layout:{padding:{left:0,right:5,top:5,bottom:0}},animation:{duration:800}}});}
  function updateLiveDataOnSensorChart(id,vals){const chart=sensorHistoricalCharts[id];const label=new Date().toLocaleTimeString('bn-BD');if(chart&&vals.celsius_value!==undefined){chart.data.labels.push(label);chart.data.datasets[0].data.push(vals.celsius_value);if(chart.data.labels.length>20){chart.data.labels.shift();chart.data.datasets[0].data.shift();}chart.update();}if(!tempSensorHistory[id]){tempSensorHistory[id]={labels:[],c:[],f:[]};}tempSensorHistory[id].labels.push(label);tempSensorHistory[id].c.push(vals.celsius_value);tempSensorHistory[id].f.push(vals.fahrenheit_value);if(tempSensorHistory[id].labels.length>50){tempSensorHistory[id].labels.shift();tempSensorHistory[id].c.shift();tempSensorHistory[id].f.shift();}if(largeTempChartInstance&&document.getElementById('tempHistoryModal').style.display==='flex'){}}
  function openTempHistoryModal(id,name){const modal=document.getElementById('tempHistoryModal');document.getElementById('temp-history-title').innerHTML=`<i class="fas fa-history"></i> ${name} - বিস্তারিত ইতিহাস`;modal.style.display='flex';const ctx=document.getElementById('largeTempChart').getContext('2d');if(largeTempChartInstance){largeTempChartInstance.destroy();}const history=tempSensorHistory[id]||{labels:[],c:[],f:[]};largeTempChartInstance=new Chart(ctx,{type:'line',data:{labels:history.labels,datasets:[{label:'সেলসিয়াস (°C)',data:history.c,borderColor:'#3b82f6',backgroundColor:'rgba(59, 130, 246, 0.1)',yAxisID:'y-c',tension:0.3,fill:true},{label:'ফারেনহাইট (°F)',data:history.f,borderColor:'#f97316',backgroundColor:'rgba(249, 115, 22, 0.1)',yAxisID:'y-f',tension:0.3,fill:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false,},scales:{'y-c':{type:'linear',display:true,position:'left',title:{display:true,text:'Celsius (°C)',color:'#3b82f6'},grid:{color:'rgba(255,255,255,0.1)'}},'y-f':{type:'linear',display:true,position:'right',title:{display:true,text:'Fahrenheit (°F)',color:'#f97316'},grid:{drawOnChartArea:false}},x:{ticks:{color:'#9ca3af'},grid:{display:false}}},plugins:{legend:{labels:{color:'#fff'}},tooltip:{backgroundColor:'rgba(0,0,0,0.8)',titleColor:'#fff',bodyColor:'#fff'}}}});}
  function closeTempHistoryModal(){document.getElementById('tempHistoryModal').style.display='none';}
  function confirmDeleteAllLogs(){promptForActionPassword('সমস্ত লগ মুছে ফেলুন','আপনি কি নিশ্চিত যে আপনি অডিট লগের সমস্ত ইতিহাস মুছে ফেলতে চান? এটি ফিরিয়ে আনা যাবে না।',()=>{const logPath=getPathFor('audit_log');database.ref(logPath).remove().then(()=>{showToast('সমস্ত অডিট লগ সফলভাবে মুছে ফেলা হয়েছে!','success');logAuditEvent('অডিট লগের সমস্ত ইতিহাস মুছে ফেলা হয়েছে।');}).catch(error=>{showToast('লগ মুছতে সমস্যা হয়েছে: '+error.message,'error');});});}

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
        
        // --- ★★★ UPDATED LISTENER FOR REAL-TIME LOGIC ★★★ ---
        devices_root: (snapshot) => {
            previousDeviceStates = currentDeviceStates;
            const allDevices = snapshot.val() || {};
            const regularDevices = Object.keys(allDevices).filter(key => !key.startsWith('temperature')).reduce((obj, key) => ({ ...obj, [key]: allDevices[key] }), {});
            currentDeviceStates = regularDevices;
            renderControlPanel(regularDevices, relayNames);
            updateAutomationFormOptions();
            populateLogicGateSelectors();
            
            // Force Logic Gates check
            evaluateLogicGateRules();
            
            // Check Automation Rules based on device state changes
            Object.keys(regularDevices).forEach(deviceId => {
                checkAutomationRules('device', {
                    deviceId: deviceId,
                    states: regularDevices[deviceId]
                });
            });
        },
        
        // ★★★ FIX: Temperature Data Rendering Logic ★★★
        temperature_data: (snapshot) => {
            const allDevices = snapshot.val() || {};
            const temps = Object.keys(allDevices).filter(key => key.startsWith('temperature')).reduce((obj, key) => ({ ...obj, [key]: allDevices[key] }), {});
            
            // Cache current temp data globally so we can re-render when metadata changes
            currentTempData = temps;

            // Check if container is empty OR if sensor list changed
            const container = document.getElementById('temperature-sensors-container');
            const isContainerEmpty = container && container.children.length === 0;
            const isSensorListChanged = JSON.stringify(Object.keys(sensorHistoricalCharts).sort()) !== JSON.stringify(Object.keys(temps).sort());

            // Force render if empty or list changed
            if (isSensorListChanged || isContainerEmpty) {
                renderTemperatureSensors(temps, deviceMetadata);
            }
            updateAllGauges(temps);
            for (const id in temps) updateLiveDataOnSensorChart(id, temps[id]);
        },
        
        // ★★★ FIX: Metadata Listener Logic ★★★
        device_metadata: (snapshot) => {
            deviceMetadata = snapshot.val() || {};
            relayNames = {};
            for (const devId in deviceMetadata) {
                if (deviceMetadata[devId].relay_names) relayNames[devId] = deviceMetadata[devId].relay_names;
            }
            
            // Update Control Panel Relays
            if (Object.keys(currentDeviceStates).length > 0) {
                renderControlPanel(currentDeviceStates, relayNames);
            }
            
            // Update Temperature Sensor Names immediately
            if (Object.keys(currentTempData).length > 0) {
                renderTemperatureSensors(currentTempData, deviceMetadata);
            }
        },
        
        // --- ★★★ UPDATED LISTENER FOR REAL-TIME AUTOMATION ★★★ ---
        energymonitoring_root: (snapshot) => {
            const data = snapshot.val();
            if (data) {
                updateEnergyData(data);
                checkAutomationRules('energy', data); // Trigger automation immediately
            }
        },
        
        energymonitoring_history: (snapshot) => { 
            if(snapshot.val()) { 
                historicalData = { ...snapshot.val(), ...historicalData };
                if (document.getElementById('page6').classList.contains('active')) updateAdvancedChart(); 
            }
        },
        timers: (snapshot) => { allTimersData = snapshot.val() || {}; updateAllTimerDisplays(); },
        
        // --- ★★★ UPDATED LISTENER FOR REAL-TIME ICON REFRESH ★★★ ---
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
                
                card.innerHTML = `<div class="rule-description">${desc}</div>
                <div class="rule-actions">
                    <button class="pro-btn rule-btn toggle-rule-btn ${r.isEnabled ? 'enabled' : 'disabled'}" onclick="toggleRule('${id}')">${r.isEnabled ? 'নিষ্ক্রিয়' : 'সক্রিয়'} করুন</button>
                    <button class="pro-btn rule-btn edit-btn" onclick="editAutomationRule('${id}')">এডিট</button>
                    <button class="pro-btn rule-btn delete-btn" onclick="deleteRule('${id}')">ডিলিট</button>
                </div>`;
                cont.appendChild(card);
            }
            // Refresh control panel to update Linked Rules Icons
            if(currentDeviceStates && Object.keys(currentDeviceStates).length > 0) {
                renderControlPanel(currentDeviceStates, relayNames);
            }
            // Also refresh single device pages if active
            ['device1', 'device2', 'device3', 'device4'].forEach(devId => {
                 if(document.getElementById(`page${devId.replace('device','')}`).classList.contains('active')) {
                     updateSingleDevicePage(devId, currentDeviceStates[devId]);
                 }
            });
        },
        
        logic_gate_rules: (snapshot) => { 
            logicGateRules = snapshot.val() || {}; 
            renderLogicGateRules();
            // Force re-evaluation to clean up old overrides if needed
            evaluateLogicGateRules(); 
            
            // Refresh control panel to update Linked Rules Icons
            if(currentDeviceStates && Object.keys(currentDeviceStates).length > 0) {
                renderControlPanel(currentDeviceStates, relayNames);
            }
            // Also refresh single device pages if active
            ['device1', 'device2', 'device3', 'device4'].forEach(devId => {
                 if(document.getElementById(`page${devId.replace('device','')}`).classList.contains('active')) {
                     updateSingleDevicePage(devId, currentDeviceStates[devId]);
                 }
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
        custom_pages: (snapshot) => { renderCustomPagesFromFirebase(snapshot.val() || {}); loadAndApplyTabOrder(); }
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
  function generateComponentSelectorHTML(currComps=[]){let html='';const isChecked=comp=>currComps.some(c=>JSON.stringify(c)===JSON.stringify(comp));for(let i=1;i<=4;i++){const devId=`device${i}`;html+=`<div class="page-editor-group"><h4>ডিভাইস ${i}</h4><label><input type="checkbox" data-component='${JSON.stringify({type:'device_cards',deviceId:devId})}' ${isChecked({type:'device_cards',deviceId:devId})?'checked':''}> কন্ট্রোল কার্ড</label><label><input type="checkbox" data-component='${JSON.stringify({type:'device_summary',deviceId:devId})}' ${isChecked({type:'device_summary',deviceId:devId})?'checked':''}> স্ট্যাটাস সামারি</label></div>`;}html+=`<div class="page-editor-group"><h4>অন্যান্য</h4><label><input type="checkbox" data-component='${JSON.stringify({type:'control_panel'})}' ${isChecked({type:'control_panel'})?'checked':''}> কন্ট্রোল প্যানেল</label><label><input type="checkbox" data-component='${JSON.stringify({type:'scenes'})}' ${isChecked({type:'scenes'})?'checked':''}> দৃশ্য (Scenes)</label><label><input type="checkbox" data-component='${JSON.stringify({type:'system_status'})}' ${isChecked({type:'system_status'})?'checked':''}> সিস্টেম স্ট্যাটাস</label></div>`;return html;}
  function savePageComponents(){if(!currentPageToEdit)return;const comps=[];document.querySelectorAll('#pageEditorModal input:checked').forEach(cb=>comps.push(JSON.parse(cb.dataset.component)));database.ref(`${getPathFor('custom_pages')}/${currentPageToEdit}/components`).set(comps).then(()=>closePageEditorModal());}
  function deleteCustomPage(id,name,e){e.stopPropagation();promptForActionPassword('পেজ মুছুন',`আপনি কি সত্যিই '${name}' পেজটি মুছে ফেলতে চান?`,()=>database.ref(`${getPathFor('custom_pages')}/${id}`).remove().then(()=>showPage('page1'))); }
  function renderCustomPagesFromFirebase(pagesData){const navCont=document.getElementById('nav-tabs-container'),pagesCont=document.getElementById('dynamic-pages-container');document.querySelectorAll('.custom-page-tab, .custom-page').forEach(el=>el.remove());for(const id in pagesData){const page=pagesData[id],navTab=document.createElement('div');navTab.className='nav-tab custom-page-tab';navTab.onclick=()=>showPage(`custom_page_${id}`);navTab.dataset.tabId=`custom_page_${id}`;navTab.innerHTML=`<span>${page.name}</span><span class="page-actions"><i class="fas fa-pencil-alt" onclick="openPageEditorModal('${id}','${page.name}',event)"></i><i class="fas fa-trash-alt" onclick="deleteCustomPage('${id}','${page.name}',event)"></i></span>`;navCont.insertBefore(navTab,document.getElementById('add-new-page-btn'));const pageCont=document.createElement('main');pageCont.id=`custom_page_${id}`;pageCont.className='device-page custom-page';renderDynamicPageContent(pageCont,page.components||[]);pagesCont.appendChild(pageCont);}}
  function renderDynamicPageContent(cont,comps){cont.innerHTML=`<div class="dynamic-page-grid"></div>`;const grid=cont.querySelector('.dynamic-page-grid');comps.forEach(c=>{let el;switch(c.type){case'device_cards':el=document.querySelector(`#page${c.deviceId.replace('device','')} .device-cards`);break;case'device_summary':el=document.getElementById(`${c.deviceId}-summary`);break;case'control_panel':el=document.getElementById('page8');break;case'scenes':el=document.getElementById('page-component-scenes');break;case'system_status':el=document.getElementById('page-component-system-status');break;}if(el){const clone=el.cloneNode(true);clone.querySelectorAll('canvas').forEach(can=>{can.id=`clone_${can.id}_${cont.id}`;});grid.appendChild(clone);}});}

    let logicInputCount = 0;

    function initLogicGateInputs() {
        document.getElementById('logic-inputs-list').innerHTML = '';
        logicInputCount = 0;
        addLogicInput();
        addLogicInput();
        populateLogicGateSelectors();
    }

    function addLogicInput() {
        logicInputCount++;
        const container = document.getElementById('logic-inputs-list');
        const inputGroup = document.createElement('div');
        inputGroup.className = 'logic-input-group';
        inputGroup.id = `logic-input-group-${logicInputCount}`;

        inputGroup.innerHTML = `
            <div class="form-group">
                <label>ইনপুট ${logicInputCount} ডিভাইস</label>
                <select class="logic-input-device"></select>
            </div>
            <div class="form-group">
                <label>ইনপুট ${logicInputCount} রিলে</label>
                <select class="logic-input-relay"></select>
            </div>
            <div class="form-group">
                <label>অবস্থা</label>
                <select class="logic-input-state">
                    <option value="true">ON</option>
                    <option value="false">OFF</option>
                </select>
            </div>
            <i class="fas fa-trash-alt delete-icon" onclick="removeLogicInput('logic-input-group-${logicInputCount}')"></i>
        `;
        container.appendChild(inputGroup);
        populateNewInputSelectors(inputGroup);
    }

    function removeLogicInput(groupId) {
        const container = document.getElementById('logic-inputs-list');
        if (container.children.length <= 2) {
            showToast("কমপক্ষে দুটি ইনপুট প্রয়োজন।", "warning");
            return;
        }
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
                relays.forEach(relayId => {
                    relaySelect.innerHTML += `<option value="${relayId}">${(relayNames[selectedDeviceId]?.[relayId]) || relayId}</option>`;
                });
            }
        };
        deviceSelect.onchange = updateRelays;
        updateRelays();
    }

    function populateLogicGateSelectors() {
        document.querySelectorAll('.logic-input-group').forEach(group => populateNewInputSelectors(group));
        const outDevSelect = document.getElementById('logic-output-device');
        const outRelSelect = document.getElementById('logic-output-relay');
        outDevSelect.innerHTML = Object.keys(currentDeviceStates).sort((a,b) => parseInt(a.replace('device','')) - parseInt(b.replace('device',''))).map(id => `<option value="${id}">${(deviceMetadata[id]?.name) || id.replace('device','ডিভাইস ')}</option>`).join('');
        outDevSelect.onchange = () => populateRelayDropdown(outDevSelect, outRelSelect);
        populateRelayDropdown(outDevSelect, outRelSelect);
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
        const outputDevice = document.getElementById('logic-output-device').value;
        const outputRelay = document.getElementById('logic-output-relay').value;
        const outputState = document.getElementById('logic-output-state').value === 'true';

        if (!ruleName || inputs.length < 2 || !outputRelay) { return showToast("অনুগ্রহ করে সমস্ত ফিল্ড পূরণ করুন।", "error"); }
        if (inputs.some(inp => inp.device === outputDevice && inp.relay === outputRelay)) {
            return showToast("আউটপুট রিলে ইনপুট রিলের সমান হতে পারে না।", "error");
        }

        const rule = { name: ruleName, inputs: inputs, gate: gateType, output: { device: outputDevice, relay: outputRelay, state: outputState }, isEnabled: true };

        const isEdit = editingLogicRuleId !== null;
        const actionTitle = isEdit ? 'রুল আপডেট করুন' : 'রুল সংরক্ষণ করুন';
        const actionDesc = isEdit ? `আপনি কি "${ruleName}" রুলটি আপডেট করতে চান?` : `আপনি কি "${ruleName}" রুলটি সংরক্ষণ করতে চান?`;

        promptForActionPassword(actionTitle, actionDesc, () => {
            if (isEdit) {
                database.ref(`${getPathFor('logic_gate_rules')}/${editingLogicRuleId}`).update(rule)
                .then(() => {
                    showToast('লজিক গেট রুল সফলভাবে আপডেট হয়েছে!', 'success');
                    logAuditEvent(`লজিক গেট রুল '${rule.name}' আপডেট করেছেন।`);
                    cancelEditLogicGate();
                });
            } else {
                database.ref(getPathFor('logic_gate_rules')).push(rule)
                .then(() => {
                    showToast('লজিক গেট রুল সফলভাবে সংরক্ষিত হয়েছে!', 'success');
                    logAuditEvent(`নতুন লজিক গেট রুল '${rule.name}' তৈরি করেছেন।`);
                    cancelEditLogicGate();
                });
            }
        });
    }

    function editLogicGateRule(id) {
        const rule = logicGateRules[id];
        if (!rule) return;

        editingLogicRuleId = id;
        document.getElementById('logic-rule-name').value = rule.name;

        // Clear existing inputs and repopulate
        document.getElementById('logic-inputs-list').innerHTML = '';
        logicInputCount = 0;
        
        rule.inputs.forEach((input, index) => {
            addLogicInput();
            const inputGroups = document.querySelectorAll('.logic-input-group');
            const group = inputGroups[inputGroups.length - 1];
            
            group.querySelector('.logic-input-device').value = input.device;
            // Manually trigger the relay population
            const deviceSelect = group.querySelector('.logic-input-device');
            deviceSelect.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                 group.querySelector('.logic-input-relay').value = input.relay;
                 group.querySelector('.logic-input-state').value = input.state ? 'true' : 'false';
            }, 50);
        });

        document.getElementById('logic-gate-type').value = rule.gate;
        document.getElementById('logic-output-device').value = rule.output.device;
        populateRelayDropdown(document.getElementById('logic-output-device'), document.getElementById('logic-output-relay'));
        document.getElementById('logic-output-relay').value = rule.output.relay;
        document.getElementById('logic-output-state').value = rule.output.state ? 'true' : 'false';

        // Change UI to Edit Mode
        const submitBtn = document.querySelector('#logic-gate-form button[type="submit"]');
        submitBtn.textContent = '🔄 আপডেট করুন';
        document.getElementById('cancel-logic-edit-btn').style.display = 'block';
        
        // Scroll
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
            const description = `<strong>${rule.name}:</strong> IF (${inputsStr}) THEN SET <strong>${getRelayName(rule.output.device, rule.output.relay)}</strong> TO <strong>${rule.output.state ? 'ON' : 'OFF'}</strong>`;

            const card = document.createElement('div');
            card.className = `rule-card ${rule.isEnabled ? '' : 'disabled'}`;
            // Added Edit button here
            card.innerHTML = `<div class="rule-description">${description}</div>
            <div class="rule-actions">
                <button class="pro-btn rule-btn toggle-rule-btn ${rule.isEnabled ? 'enabled' : 'disabled'}" onclick="toggleLogicGateRule('${ruleId}')">${rule.isEnabled ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}</button>
                <button class="pro-btn rule-btn edit-btn" onclick="editLogicGateRule('${ruleId}')">এডিট</button>
                <button class="pro-btn rule-btn delete-btn" onclick="deleteLogicGateRule('${ruleId}')">ডিলিট</button>
            </div>`;
            listContainer.appendChild(card);
        }
    }

    function toggleLogicGateRule(id) { const newState = !logicGateRules[id].isEnabled; database.ref(`${getPathFor('logic_gate_rules')}/${id}/isEnabled`).set(newState); }
    function deleteLogicGateRule(id) { const name = logicGateRules[id].name; promptForActionPassword('লজিক গেট রুল মুছুন', `আপনি কি "${name}" রুলটি মুছে ফেলতে চান?`, () => database.ref(`${getPathFor('logic_gate_rules')}/${id}`).remove()); }

    // --- ★★★ LOGIC GATE FIX (Simplified & Strict + Auto Cleanup) ★★★ ---
    function evaluateLogicGateRules() {
        const updates = {};
        const overridesToRemove = {}; // Container for cleanup

        // 1. Evaluate existing rules
        for (const ruleId in logicGateRules) {
            const rule = logicGateRules[ruleId];
            if (!rule.isEnabled || !rule.inputs || rule.inputs.length < 2) continue;

            const { device: outDevice, relay: outRelay, state: outState } = rule.output;
            
            // ★★★ CHECK FOR MANUAL OVERRIDE ★★★
            if (logicOverrides[outDevice] && logicOverrides[outDevice][outRelay]) {
                console.log(`Logic Gate: Skipping ${outDevice}/${outRelay} due to manual override.`);
                continue; // Skip processing this rule for this output
            }

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
            
            const targetState = logicResult ? outState : !outState;
            const currentStateOut = !!currentDeviceStates[outDevice]?.[outRelay];

            if (targetState !== currentStateOut) {
                const path = `${getPathFor('devices_root')}/${outDevice}/${outRelay}`;
                updates[path] = targetState;
                console.log(`Logic Gate '${rule.name}' changing ${outDevice}/${outRelay} to ${targetState}`);
            }
        }

        // 2. Cleanup Orphan Overrides (Hand Symbol)
        if (logicOverrides) {
            for (const devId in logicOverrides) {
                for (const relId in logicOverrides[devId]) {
                    if (!isTargetOfActiveLogicRule(devId, relId)) {
                        // If this relay is overridden but no rule targets it, delete the override
                        overridesToRemove[`logic_gate_overrides/${devId}/${relId}`] = null;
                    }
                }
            }
        }
        
        if (Object.keys(updates).length > 0) {
            database.ref().update(updates);
        }
        if (Object.keys(overridesToRemove).length > 0) {
            database.ref().update(overridesToRemove);
        }
    }


  // Event Listeners
  function handleLoginKeyPress(e){if(e.key==="Enter"){if(document.getElementById('login-box').style.display!=='none')loginWithFirebase();else registerWithFirebase();}}
  ['email','password','register-username','register-email','register-password','confirm-password'].forEach(id=>document.getElementById(id).addEventListener("keypress",handleLoginKeyPress));
  document.getElementById("relayPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")verifyAndOperateRelay();});
  document.getElementById("timerPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")saveTimerSettings();});
  document.getElementById("actionPasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")verifyAndExecuteAction();});
  document.getElementById("addPagePasswordInput").addEventListener("keypress",e=>{if(e.key==="Enter")saveNewPage();});
  document.getElementById("regSecurityInput").addEventListener("keypress",e=>{if(e.key==="Enter")checkRegistrationSecurity();});
  document.getElementById('action-device').addEventListener('change',()=>populateRelayDropdown(document.getElementById('action-device'), document.getElementById('action-relay')));
  
  window.onload = function() { createParticles(); };