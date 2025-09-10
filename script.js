// ## 3. `script.js` (নতুন)

// এই ফাইলে আপনার `index.html` থেকে সমস্ত JavaScript কোড কপি করে রাখা হয়েছে।

// ```javascript



// Firebase কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyATDfnefdyPAzBNKZY4VM5ja8K2-63PC-U",
  authDomain: "home-server-346b6.firebaseapp.com",
  databaseURL: "https://home-server-346b6-default-rtdb.firebaseio.com",
  projectId: "home-server-346b6",
  storageBucket: "home-server-346b6.firebasestorage.app",
  messagingSenderId: "531234227336",
  appId: "1:531234227336:web:f57f700dd6baaed4358b3d",
  measurementId: "G-QDWVP34FSX"
};

// Firebase ইনিশিয়ালাইজ করুন
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const messaging = firebase.messaging();


// রিলে অপারেশনের জন্য পাসওয়ার্ড (লগইনের জন্য ব্যবহৃত হবে না)
const correctOperatingPassword = "123";

// ★★★ নতুন: অডিট লগ ইভেন্ট তৈরি করার ফাংশন ★★★
// actor প্যারামিটারটি সিস্টেম জেনারেটেড লগের জন্য ব্যবহার করা হবে
function logAuditEvent(action, actor = null) {
    const user = auth.currentUser;
    // ব্যবহারকারী যদি লগইন করা থাকে অথবা actor যদি সিস্টেম হয়, তবেই লগ তৈরি হবে
    if (user || actor) {
        const userEmail = actor ? actor : user.email; // যদি actor থাকে, সেটি ব্যবহার করবে, নাহলে ব্যবহারকারীর ইমেল
        
        const logEntry = {
            user: userEmail,
            action: action,
            timestamp: firebase.database.ServerValue.TIMESTAMP // সার্ভারের সঠিক সময় ব্যবহার করা হচ্ছে
        };
        
        // 'auditLog' নোডে নতুন লগ পুশ করা হচ্ছে
        database.ref('auditLog').push(logEntry);
    }
}


// Firebase ব্যবহার করে সুরক্ষিত লগইন ফাংশন
function loginWithFirebase() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("error");
    const loginBox = document.querySelector(".login-box");

    if (!email || !password) {
        errorDiv.innerText = "❌ দয়া করে ইমেল এবং পাসওয়ার্ড দিন।";
        loginBox.classList.add('shake-animation');
        setTimeout(() => {
            loginBox.classList.remove('shake-animation');
        }, 500);
        return;
    }
    
    errorDiv.innerText = "";

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("লগইন সফল:", userCredential.user.email);
            
            // ★★★ পরিবর্তিত: লগইন সফল হলে অডিট লগে এন্ট্রি যোগ করা হচ্ছে ★★★
            logAuditEvent("সিস্টেমে সফলভাবে লগইন করেছেন।");

            const loginContainer = document.getElementById("login");
            const appContainer = document.getElementById("app");

            loginContainer.style.animation = "fadeOut 0.5s ease forwards";
            setTimeout(() => {
                loginContainer.style.display = "none";
                appContainer.style.display = "block";
                appContainer.style.animation = "fadeIn 0.5s ease forwards";
                
                // সফল লগইনের পর প্রয়োজনীয় সব ফাংশন কল করা হচ্ছে
                loadDataRealtime();
                initializeCharts();
                loadThemePreference();
                loadBackgroundPreference();
                initEnergyCharts();
                loadEnergyData();
                initAdvancedEnergyChart();
                loadHistoricalData();
                loadRelayStates();
                loadDateTimeData();
                loadTimersData();
                setInterval(updateAllTimerDisplays, 1000);
                updateTriggerOptions(); 
                loadAutomationRules();
                initializeNotifications();
                // ★★★ নতুন: অডিট লগ লোড করার ফাংশন কল করা হচ্ছে ★★★
                loadAuditLog(); 
            }, 500);
        })
        .catch((error) => {
            console.error("লগইন ত্রুটি:", error.message);
            errorDiv.innerText = "❌ ইমেল বা পাসওয়ার্ড সঠিক নয়।";
            loginBox.classList.add('shake-animation');
            setTimeout(() => {
                loginBox.classList.remove('shake-animation');
            }, 500);
        });
}

// Firebase ব্যবহার করে সুরক্ষিত লগআউট ফাংশন
function logout() {
    // ★★★ পরিবর্তিত: লগআউট করার আগে অডিট লগে এন্ট্রি যোগ করা হচ্ছে ★★★
    logAuditEvent("সিস্টেম থেকে লগআউট করেছেন।");
    
    auth.signOut().then(() => {
        const appContainer = document.getElementById("app");
        const loginContainer = document.getElementById("login");

        appContainer.style.animation = "fadeOut 0.5s ease forwards";
        setTimeout(() => {
            window.location.reload(); 
        }, 500);
    }).catch((error) => {
        console.error("লগআউট করার সময় ত্রুটি:", error);
    });
}

// --- বাকি জাভাস্ক্রিপ্ট কোড ---

  // চার্ট ইনস্ট্যান্স স্টোর করার অবজেক্ট
  const deviceCharts = {};
  let energyCharts = {};
  let advancedEnergyChart = null;
  let selectedMetric = 'voltage';
  let selectedTimeRange = 30; // মিনিট
  let historicalData = {};
  
  // রিলে অপারেশন কনটেক্সট সংরক্ষণের জন্য ভেরিয়েবল
  let relayOperationContext = null;
  // টাইমার অপারেশন কনটেক্সট এবং ডেটা সংরক্ষণের জন্য ভেরিয়েবল
  let timerOperationContext = null;
  let allTimersData = {};
  
  // ব্যাকগ্রাউন্ড ম্যানেজমেন্টের জন্য ভেরিয়েবল
  let currentBackgroundIndex = 0;
  const totalBackgrounds = 11; // ১০টি ইমেজ + ১টি অ্যানিমেটেড গ্রেডিয়েন্ট
  
  // অটোমেশন রুল ও ডেটা সংরক্ষণের জন্য ভেরিয়েবল
  let currentEnergyData = {};
  let currentDeviceStates = {};
  let automationRules = {};


  // ইমেজ মোডাল ফাংশন
  function openImageModal(imageSrc, caption) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');
    
    modal.style.display = "flex";
    modalImg.src = imageSrc;
    modalCaption.innerHTML = caption;
    
    document.addEventListener('keydown', function(event) {
      if (event.key === "Escape") {
        closeImageModal();
      }
    });
  }

  function closeImageModal() {
    document.getElementById('imageModal').style.display = "none";
    document.removeEventListener('keydown', function(event) {
      if (event.key === "Escape") {
        closeImageModal();
      }
    });
  }

  window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
      closeImageModal();
    }
  }

  // পার্টিকল এনিমেশন তৈরি
  function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if(particlesContainer.children.length > 0) return;
    const particleCount = 30;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');
      
      const size = Math.random() * 10 + 5;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 15}s`;
      particle.style.animationDuration = `${Math.random() * 10 + 10}s`;
      particle.style.opacity = Math.random() * 0.5 + 0.1;
      
      particlesContainer.appendChild(particle);
    }
  }

  // পেইজ পরিবর্তন ফাংশন
  function showPage(pageNum) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-tab')[pageNum-1].classList.add('active');
    
    document.querySelectorAll('.device-page').forEach(page => {
      page.classList.remove('active');
    });
    
    document.getElementById('page'+pageNum).classList.add('active');

    if(pageNum === 6 && advancedEnergyChart) {
      updateAdvancedChart();
    }
  }
  
  // ★★★ পরিবর্তিত: রিলে কন্ট্রোল ফাংশনে অডিট লগ যুক্ত করা হয়েছে ★★★
  function controlRelay(device, relay, element) {
    const state = element.checked;
    console.log(`Controlling ${device}/${relay} to ${state}`);
    
    database.ref('devices/' + device).update({
        [relay]: state
    });

    const logMessage = `${device} এর ${relay} ${state ? 'চালু' : 'বন্ধ'} করা হয়েছে`;
    addLogEntry(device, logMessage, state ? 'success' : 'error');

    // অডিট লগের জন্য টেক্সট তৈরি
    const auditActionText = `ডিভাইস ${device.replace('device', '')}-এর '${relay}' ${state ? 'চালু' : 'বন্ধ'} করেছেন।`;
    logAuditEvent(auditActionText);
  }


  // ★★★ পরিবর্তিত: ডিভাইস কন্ট্রোল ফাংশনে অডিট লগ যুক্ত করা হয়েছে ★★★
  function controlDevice(device, load, state) {
    const stateText = state === 1 ? 'চালু' : (state === 2 ? 'সতর্কতা মোডে' : 'বন্ধ');
    const logMessage = `${device} এর ${load} ${stateText} করা হয়েছে`;
    
    database.ref('devices/' + device).update({
      [load]: state
    });
    
    addLogEntry(device, logMessage, state === 1 ? 'success' : state === 2 ? 'warning' : 'error');
    updateChart(device);
    
    // অডিট লগের জন্য টেক্সট
    const auditActionText = `ডিভাইস ${device.replace('device', '')}-এর '${load}' ${stateText} সেট করেছেন।`;
    logAuditEvent(auditActionText);
  }

  // লগ এন্ট্রি যোগ করার ফাংশন
  function addLogEntry(device, message, type) {
    const logIdMap = {
      'device1': 'device1-logs',
      'device2': 'device2-logs',
      'device3': 'device3-logs',
      'device4': 'device4-logs',
    };
    const logElementId = logIdMap[device];
    if (!logElementId) return;

    const logElement = document.getElementById(logElementId);
    if (!logElement) return;

    const timestamp = new Date().toLocaleString('bn-BD');
    const logClass = `log-${type}`;
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `
      <div class="log-time">${timestamp}</div>
      <div class="log-message ${logClass}">${message}</div>
    `;
    
    logElement.insertBefore(logItem, logElement.firstChild);
    
    if(logElement.children.length > 50) {
      logElement.removeChild(logElement.lastChild);
    }
  }

  // ডিভাইস চার্ট ইনিশিয়ালাইজ করার ফাংশন
  function initializeCharts() {
    for(let i = 1; i <= 4; i++) {
      const ctx = document.getElementById(`device${i}-chart`).getContext('2d');
      if (deviceCharts[`device${i}`]) {
          deviceCharts[`device${i}`].destroy();
      }
      deviceCharts[`device${i}`] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['এক্টিভ', 'সতর্কতা', 'ইনএক্টিভ'],
          datasets: [{
            data: [0, 0, 16],
            backgroundColor: [ 'rgba(46, 204, 113, 0.8)', 'rgba(243, 156, 18, 0.8)', 'rgba(231, 76, 60, 0.8)' ],
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              // Color will be set by global defaults
            }
          }
        }
      });
    }
  }

  // ডিভাইস চার্ট আপডেট করার ফাংশন
  function updateChart(device) {
    const activeCount = parseInt(document.getElementById(`${device}-active-count`).textContent);
    const warningCount = parseInt(document.getElementById(`${device}-warning-count`).textContent);
    const inactiveCount = parseInt(document.getElementById(`${device}-inactive-count`).textContent);
    
    if(deviceCharts[device]) {
      deviceCharts[device].data.datasets[0].data = [activeCount, warningCount, inactiveCount];
      deviceCharts[device].update();
    }
  }

  // ★★★ পরিবর্তিত: থিম টগল ফাংশন ★★★
  function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    
    if(themeToggle.checked) {
        body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        // চার্টের রঙ আপডেট করা
        Chart.defaults.color = '#2c3e50';
        Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.1)';
    } else {
        body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        // চার্টের রঙ আপডেট করা
        Chart.defaults.color = '#FFFFFF';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    }

    // সমস্ত চার্ট আপডেট করা
    const allCharts = [...Object.values(deviceCharts), ...Object.values(energyCharts), advancedEnergyChart];
    allCharts.forEach(chart => {
        if(chart) chart.update();
    });
  }

  // ★★★ পরিবর্তিত: থিম প্রিফারেন্স লোড করার ফাংশন ★★★
  function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeToggle = document.getElementById('theme-toggle');
    
    if(savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggle.checked = true;
        // চার্টের জন্য ডিফল্ট রঙ সেট করা
        Chart.defaults.color = '#2c3e50'; // লাইট থিমের জন্য কালো রঙ
        Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.1)'; // গ্রিডের জন্য হালকা কালো
    } else {
        document.body.classList.remove('light-theme');
        themeToggle.checked = false;
        // চার্টের জন্য ডিফল্ট রঙ সেট করা
        Chart.defaults.color = '#FFFFFF'; // ডার্ক থিমের জন্য সাদা রঙ
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)'; // গ্রিডের জন্য হালকা সাদা
    }
    
    themeToggle.addEventListener('change', toggleTheme);
  }
  
  // --- ব্যাকগ্রাউন্ড ম্যানেজমেন্ট ফাংশন ---
  function changeBackground() {
    currentBackgroundIndex = (currentBackgroundIndex + 1) % totalBackgrounds;
    applyBackground(currentBackgroundIndex);
    localStorage.setItem('backgroundIndex', currentBackgroundIndex);
  }

  function applyBackground(index) {
    const body = document.body;
    for (let i = 0; i < totalBackgrounds; i++) {
      body.classList.remove(`bg-${i}`);
    }
    body.classList.add(`bg-${index}`);
    currentBackgroundIndex = index;
  }

  function loadBackgroundPreference() {
    const savedIndex = localStorage.getItem('backgroundIndex');
    const indexToApply = savedIndex ? parseInt(savedIndex, 10) : 0;
    applyBackground(indexToApply);
  }

  // এনার্জি চার্ট ইনিশিয়ালাইজ করার ফাংশন
  function initEnergyCharts() {
    const chartsToInit = {
        'voltageChart': 'voltage-chart',
        'currentChart': 'current-chart',
        'powerChart': 'power-chart',
        'energyChart': 'energy-chart'
    };
    Object.keys(chartsToInit).forEach(chartKey => {
        if (energyCharts[chartKey]) {
            energyCharts[chartKey].destroy();
        }
    });

    const voltageCtx = document.getElementById('voltage-chart').getContext('2d');
    energyCharts.voltageChart = new Chart(voltageCtx, {
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'ভোল্টেজ (V)', data: [], borderColor: 'rgba(230, 126, 34, 1)', backgroundColor: 'rgba(230, 126, 34, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions()
    });
    const currentCtx = document.getElementById('current-chart').getContext('2d');
    energyCharts.currentChart = new Chart(currentCtx, {
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'কারেন্ট (A)', data: [], borderColor: 'rgba(26, 188, 156, 1)', backgroundColor: 'rgba(26, 188, 156, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions()
    });
    const powerCtx = document.getElementById('power-chart').getContext('2d');
    energyCharts.powerChart = new Chart(powerCtx, {
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'পাওয়ার (W)', data: [], borderColor: 'rgba(52, 152, 219, 1)', backgroundColor: 'rgba(52, 152, 219, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions()
    });
    const energyCtx = document.getElementById('energy-chart').getContext('2d');
    energyCharts.energyChart = new Chart(energyCtx, {
      type: 'bar', data: { labels: ['সকাল', 'দুপুর', 'বিকাল', 'রাত'], datasets: [{ label: 'এনার্জি (kWh)', data: [0, 0, 0, 0], backgroundColor: 'rgba(155, 89, 182, 0.7)', borderColor: 'rgba(155, 89, 182, 1)', borderWidth: 1 }] }, options: getChartOptions()
    });
  }

  // ★★★ পরিবর্তিত: চার্ট অপশন ফাংশন ★★★
  function getChartOptions() {
    return {
        responsive: true,
        // No need to specify colors here, they will use Chart.js global defaults
    };
  }


  // এনার্জি ডাটা আপডেট করার ফাংশন
  function updateEnergyData(data) {
    currentEnergyData = data;

    document.getElementById('voltage-value').innerHTML = data.voltage ? data.voltage.toFixed(2) + ' <span class="energy-unit">V</span>' : '-- V';
    document.getElementById('current-value').innerHTML = data.current ? data.current.toFixed(2) + ' <span class="energy-unit">A</span>' : '-- A';
    document.getElementById('power-value').innerHTML = data.power ? data.power.toFixed(2) + ' <span class="energy-unit">W</span>' : '-- W';
    document.getElementById('energy-value').innerHTML = data.energy ? data.energy.toFixed(2) + ' <span class="energy-unit">kWh</span>' : '-- kWh';
    document.getElementById('frequency-value').innerHTML = data.frequency ? data.frequency.toFixed(2) + ' <span class="energy-unit">Hz</span>' : '-- Hz';
    document.getElementById('power-factor-value').innerHTML = data.powerFactor ? data.powerFactor.toFixed(2) : '--';
    document.getElementById('active-power-value').innerHTML = data.activePower ? data.activePower.toFixed(2) + ' <span class="energy-unit">W</span>' : '-- W';
    document.getElementById('reactive-power-value').innerHTML = data.reactivePower ? data.reactivePower.toFixed(2) + ' <span class="energy-unit">VAR</span>' : '-- VAR';
    document.getElementById('units-value').innerHTML = data.units ? data.units.toFixed(2) + ' <span class="energy-unit">Units</span>' : '-- Units';
    document.getElementById('daily-cost-value').innerHTML = data.dailyCost ? data.dailyCost.toFixed(2) + ' <span class="energy-unit">BDT</span>' : '-- BDT';
    
    if (data.timestamp) {
      const timestampInMs = data.timestamp.toString().length === 10 ? data.timestamp * 1000 : data.timestamp;
      const date = new Date(timestampInMs);
      document.getElementById('timestamp-value').textContent = date.toLocaleString('bn-BD', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } else {
      document.getElementById('timestamp-value').textContent = '--';
    }

    updateEnergyChartData(energyCharts.voltageChart, data.voltage);
    updateEnergyChartData(energyCharts.currentChart, data.current);
    updateEnergyChartData(energyCharts.powerChart, data.power);
    
    if(data.energy) {
      const hours = new Date().getHours();
      let period = (hours >= 6 && hours < 12) ? 0 : (hours >= 12 && hours < 16) ? 1 : (hours >= 16 && hours < 20) ? 2 : 3;
      energyCharts.energyChart.data.datasets[0].data[period] = data.energy;
      energyCharts.energyChart.update();
    }

    const timestamp = new Date().getTime();
    if(!historicalData[timestamp]) {
      historicalData[timestamp] = data;
      const cutoffTime = timestamp - (selectedTimeRange * 60 * 1000 * 2);
      Object.keys(historicalData).forEach(key => {
        if(parseInt(key) < cutoffTime) delete historicalData[key];
      });
      if(document.getElementById('page6').classList.contains('active')) {
          updateAdvancedChart();
      }
    }
    
    checkForAnomalies(data.power);
    checkAutomationRules('energy', data);
  }

  function updateEnergyChartData(chart, newValue) {
    if(!newValue || !chart) return;
    chart.data.labels.push('');
    if(chart.data.labels.length > 12) chart.data.labels.shift();
    chart.data.datasets[0].data.push(newValue);
    if(chart.data.datasets[0].data.length > 12) chart.data.datasets[0].data.shift();
    chart.update();
  }

  function loadEnergyData() {
    database.ref('energymonitoring').on('value', (snapshot) => {    
      const data = snapshot.val();
      if(data) updateEnergyData(data);
    });
  }

  function loadDataRealtime() {
    for(let deviceNum = 1; deviceNum <= 4; deviceNum++) {
      const devicePath = 'devices/device' + deviceNum;
      const deviceKey = 'device' + deviceNum;
      
      database.ref(devicePath).on('value', snapshot => {
        const data = snapshot.val();
        if(data) {
          currentDeviceStates[deviceKey] = data;
          
          let activeCount = 0, inactiveCount = 0, warningCount = 0;
          for(let loadNum = 1; loadNum <= 16; loadNum++) {
            const key = 'Load' + loadNum;
            const value = data[key];
            const el = document.getElementById(`d${deviceNum}-load${loadNum}`);
            
            let statusText = 'OFF';
            if (value === true || value === 1) {
                statusText = 'ON';
            } else if (value === 2) {
                statusText = 'WARN';
            }

            if(el) el.innerText = statusText;
            
            const statusEl = document.getElementById(`d${deviceNum}-load${loadNum}-status`);
            if(statusEl) {
              if(value === true || value === 1) {
                statusEl.textContent = 'এক্টিভ';
                statusEl.className = 'card-status status-active';
                activeCount++;
              } else if(value === 2) {
                statusEl.textContent = 'সতর্কতা';
                statusEl.className = 'card-status status-warning';
                warningCount++;
              } else {
                statusEl.textContent = 'ইনএক্টিভ';
                statusEl.className = 'card-status status-inactive';
                inactiveCount++;
              }
            }
          }
          
          document.getElementById(`d${deviceNum}-active-count`).textContent = activeCount;
          document.getElementById(`d${deviceNum}-inactive-count`).textContent = inactiveCount;
          document.getElementById(`d${deviceNum}-warning-count`).textContent = warningCount;
          
          if(deviceCharts[deviceKey]) {
            deviceCharts[deviceKey].data.datasets[0].data = [activeCount, warningCount, inactiveCount];
            deviceCharts[deviceKey].update();
          }
          checkAutomationRules('device', { deviceId: deviceKey, states: data });
        }
      });
    }
  }
  
  function loadRelayStates() {
    for(let i = 1; i <= 8; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device1/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d1-' + relayName + '-toggle');
            if (toggle) toggle.checked = (state === true);
        });
    }
    for(let i = 1; i <= 5; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device2/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d2-' + relayName + '-toggle');
            if (toggle) toggle.checked = (state === true);
        });
    }
    for(let i = 1; i <= 2; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device3/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d3-' + relayName + '-toggle');
            if (toggle) toggle.checked = (state === true);
        });
    }
     for(let i = 1; i <= 2; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device4/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d4-' + relayName + '-toggle');
            if (toggle) toggle.checked = (state === true);
        });
    }
  }

  function promptForRelayPassword(device, relay, element) {
    const currentState = !element.checked;
    element.checked = currentState; 
    relayOperationContext = { device, relay, element, targetState: !currentState };
    document.getElementById('relayPasswordModal').style.display = 'flex';
    document.getElementById('relayPasswordInput').focus();
    document.getElementById('relayPasswordError').innerText = '';
  }

  function verifyAndOperateRelay() {
    const inputPassword = document.getElementById('relayPasswordInput').value;
    if (inputPassword === correctOperatingPassword) {
      if (relayOperationContext) {
        const { device, relay, element, targetState } = relayOperationContext;
        element.checked = targetState;
        controlRelay(device, relay, element);
        closeRelayModal();
      }
    } else {
      const errorEl = document.getElementById('relayPasswordError');
      errorEl.innerText = '❌ ভুল পাসওয়ার্ড!';
      const modalBox = document.querySelector('#relayPasswordModal .password-modal-box');
      modalBox.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => { modalBox.style.animation = ''; }, 500);
    }
    document.getElementById('relayPasswordInput').value = '';
  }

  function cancelRelayOperation() {
    closeRelayModal();
  }

  function closeRelayModal() {
    document.getElementById('relayPasswordModal').style.display = 'none';
    document.getElementById('relayPasswordInput').value = '';
    relayOperationContext = null;
  }
  
  function loadDateTimeData() {
      database.ref('devices/device1').on('value', (snapshot) => {
          const data = snapshot.val();
          if(data && data.currentDate && data.currentTime) {
              const dateElements = document.querySelectorAll('#page8 .current-date');
              const timeElements = document.querySelectorAll('#page8 .current-time');
              dateElements.forEach(el => el.textContent = `📅 ${data.currentDate}`);
              timeElements.forEach(el => el.textContent = `⏰ ${data.currentTime}`);
          }
      });
  }

  function loadTimersData() {
      database.ref('timers').on('value', (snapshot) => {
          allTimersData = snapshot.val() || {};
          updateAllTimerDisplays();
      });
  }
  
  function updateAllTimerDisplays() {
      for (const relayKey in allTimersData) {
          const timerData = allTimersData[relayKey];
          const statusElement = document.getElementById(`timer-status-${relayKey}`);
          if (statusElement) {
              if (timerData.enabled) {
                  const countdown = calculateCountdown(timerData.online, timerData.offline);
                  statusElement.innerHTML = `টাইমার সক্রিয়। ${countdown.nextState} ${countdown.timeLeft} পর।`;
              } else {
                  statusElement.textContent = 'টাইমার নিষ্ক্রিয় আছে।';
              }
          }
      }
  }
  
  function calculateCountdown(onlineTimeStr, offlineTimeStr) {
      const now = new Date();
      const onlineTime = new Date(now.toDateString() + ' ' + onlineTimeStr);
      const offlineTime = new Date(now.toDateString() + ' ' + offlineTimeStr);

      let nextEvent, nextState;

      if (onlineTime < offlineTime) {
          if (now >= onlineTime && now < offlineTime) {
              nextEvent = offlineTime;
              nextState = 'অফ হবে';
          } else {
              nextEvent = now < onlineTime ? onlineTime : new Date(onlineTime.getTime() + 24 * 60 * 60 * 1000);
              nextState = 'অন হবে';
          }
      } else {
          if (now >= offlineTime && now < onlineTime) {
              nextEvent = onlineTime;
              nextState = 'অন হবে';
          } else {
              nextEvent = now < offlineTime ? offlineTime : new Date(offlineTime.getTime() + 24 * 60 * 60 * 1000);
              nextState = 'অফ হবে';
          }
      }

      const diff = nextEvent - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return {
          timeLeft: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
          nextState: nextState
      };
  }

  function openTimerModal(relayKey) {
      timerOperationContext = relayKey;
      const timerData = allTimersData[relayKey] || {};
      
      document.getElementById('timer-modal-title').textContent = `${relayKey.toUpperCase()} - টাইমার সেটিংস`;
      document.getElementById('timer-online-time').value = timerData.online || '00:00:00';
      document.getElementById('timer-offline-time').value = timerData.offline || '00:00:00';
      document.getElementById('timer-relay-select').value = timerData.relay || 'relay1';

      const enabledBtn = document.getElementById('timer-enabled-btn');
      updateEnabledButton(enabledBtn, !!timerData.enabled);

      document.getElementById('timerModal').style.display = 'flex';
  }

  function updateEnabledButton(btn, isEnabled) {
      btn.textContent = isEnabled ? 'সক্রিয়' : 'নিষ্ক্রিয়';
      btn.classList.toggle('enabled', isEnabled);
      btn.classList.toggle('disabled', !isEnabled);
  }

  function toggleTimerEnabled() {
      const btn = document.getElementById('timer-enabled-btn');
      const isCurrentlyEnabled = btn.classList.contains('enabled');
      updateEnabledButton(btn, !isCurrentlyEnabled);
  }

  function closeTimerModal() {
      document.getElementById('timerModal').style.display = 'none';
      document.getElementById('timerPasswordInput').value = '';
      document.getElementById('timerPasswordError').textContent = '';
      timerOperationContext = null;
  }
  
  // ★★★ পরিবর্তিত: টাইমার সেটিংসে অডিট লগ যুক্ত করা হয়েছে ★★★
  function saveTimerSettings() {
      const password = document.getElementById('timerPasswordInput').value;
      if (password !== correctOperatingPassword) {
          const errorEl = document.getElementById('timerPasswordError');
          errorEl.textContent = '❌ ভুল অপারেটিং পাসওয়ার্ড!';
          const modalBox = document.querySelector('#timerModal .timer-modal-box');
          modalBox.style.animation = 'shake 0.5s ease-in-out';
          setTimeout(() => { modalBox.style.animation = ''; }, 500);
          return;
      }
      
      if (timerOperationContext) {
          const isEnabled = document.getElementById('timer-enabled-btn').classList.contains('enabled');
          const onlineTime = document.getElementById('timer-online-time').value;
          const offlineTime = document.getElementById('timer-offline-time').value;
          const targetRelay = document.getElementById('timer-relay-select').value;
          
          const updates = {
              enabled: isEnabled,
              online: onlineTime,
              offline: offlineTime,
              relay: targetRelay
          };
          
          database.ref('timers/' + timerOperationContext).update(updates)
              .then(() => {
                  console.log('Timer settings saved successfully!');
                  
                  // অডিট লগ তৈরি
                  const auditActionText = `'${timerOperationContext}' এর জন্য টাইমার সেটিংস পরিবর্তন করেছেন। স্ট্যাটাস: ${isEnabled ? 'সক্রিয়' : 'নিষ্ক্রিয়'}, অন-টাইম: ${onlineTime}, অফ-টাইম: ${offlineTime}।`;
                  logAuditEvent(auditActionText);
                  
                  closeTimerModal();
              })
              .catch(error => {
                  console.error('Error saving timer settings: ', error);
                  document.getElementById('timerPasswordError').textContent = 'ত্রুটি: সংরক্ষণ করা যায়নি।';
              });
      }
  }

  function initAdvancedEnergyChart() {
    const ctx = document.getElementById('advanced-energy-chart').getContext('2d');
    if (advancedEnergyChart) {
        advancedEnergyChart.destroy();
    }
    advancedEnergyChart = new Chart(ctx, {
      type: 'line', data: { labels: [], datasets: [{ label: 'ভোল্টেজ (V)', data: [], borderColor: 'rgba(230, 126, 34, 1)', backgroundColor: 'rgba(230, 126, 34, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] },
      options: getChartOptions()
    });
  }

  function changeTimeRange(minutes) {
    selectedTimeRange = minutes;
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateAdvancedChart();
  }

  function selectMetric(metric) {
    selectedMetric = metric;
    document.querySelectorAll('.metric-card').forEach(card => card.classList.remove('selected'));
    event.target.closest('.metric-card').classList.add('selected');
    updateAdvancedChart();
  }

  function getMetricName(metric) {
    const names = { 'voltage': 'ভোল্টেজ', 'current': 'কারেন্ট', 'power': 'পাওয়ার', 'energy': 'এনার্জি', 'frequency': 'ফ্রিকোয়েন্সি', 'powerFactor': 'পাওয়ার ফ্যাক্টর', 'activePower': 'অ্যাক্টিভ পাওয়ার', 'reactivePower': 'রিঅ্যাক্টিভ পাওয়ার' };
    return names[metric] || metric;
  }

  function getTimeRangeText(minutes) {
    if(minutes < 60) return `${minutes} মিনিট`;
    return `${Math.floor(minutes/60)} ঘন্টা`;
  }

  function updateAdvancedChart() {
    if(!advancedEnergyChart) return;
    const now = new Date().getTime();
    const cutoffTime = now - (selectedTimeRange * 60 * 1000);
    const timestamps = Object.keys(historicalData).filter(ts => parseInt(ts) >= cutoffTime).sort();
    
    const labels = timestamps.map(ts => new Date(parseInt(ts)).toLocaleTimeString('bn-BD'));
    const data = timestamps.map(ts => historicalData[ts][selectedMetric]);
    
    document.getElementById('advanced-graph-title').textContent = `${getMetricName(selectedMetric)} ট্রেন্ড (${getTimeRangeText(selectedTimeRange)})`;
    advancedEnergyChart.data.labels = labels;
    advancedEnergyChart.data.datasets[0].data = data;
    advancedEnergyChart.data.datasets[0].label = `${getMetricName(selectedMetric)} (${getUnit(selectedMetric)})`;
    advancedEnergyChart.update();
    
    document.getElementById('no-data-message').style.display = data.length === 0 ? 'block' : 'none';
  }

  function getUnit(metric) {
    const units = { 'voltage': 'V', 'current': 'A', 'power': 'W', 'energy': 'kWh', 'frequency': 'Hz', 'powerFactor': '', 'activePower': 'W', 'reactivePower': 'VAR' };
    return units[metric] || '';
  }

  function loadHistoricalData() {
    database.ref('energyHistory').limitToLast(1000).on('value', (snapshot) => {
      const data = snapshot.val();
      if(data) {
        historicalData = data;
        updateAdvancedChart();
      }
    });
  }

  function downloadGraphData() {
    const timestamps = Object.keys(historicalData).sort();
    let csvContent = "data:text/csv;charset=utf-8,সময়,ভোল্টেজ (V),কারেন্ট (A),পাওয়ার (W),এনার্জি (kWh),ফ্রিকোয়েন্সি (Hz),পাওয়ার ফ্যাক্টর,অ্যাক্টিভ পাওয়ার (W),রিঅ্যাক্টিভ পাওয়ার (VAR)\n";
    
    timestamps.forEach(ts => {
      const data = historicalData[ts];
      const row = [ new Date(parseInt(ts)).toLocaleString(), data.voltage || '', data.current || '', data.power || '', data.energy || '', data.frequency || '', data.powerFactor || '', data.activePower || '', data.reactivePower || '' ];
      csvContent += row.join(",") + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `energy_data_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printGraph() {
    const canvas = document.getElementById('advanced-energy-chart');
    const win = window.open('', 'Print Chart');
    win.document.write(`<html><head><title>Print Chart</title></head><body><h1>${document.getElementById('advanced-graph-title').textContent}</h1><img src="${canvas.toDataURL()}"/></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  // --- ★★★ নতুন এবং পরিবর্তিত: নোটিফিকেশন, অটোমেশন এবং ইন্টেলিজেন্স ফাংশন ★★★ ---
  
  // অন-স্ক্রিন টোস্ট নোটিফিকেশন দেখানোর ফাংশন
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  // ব্রাউজার নোটিফিকেশন দেখানোর ফাংশন
  function displayNotification(title, body) {
      if ('Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, {
                  body: body,
                  icon: 'Bisnu.png',
                  badge: 'Bisnu.png'
              });
          });
      }
  }

  // নোটিফিকেশন সিস্টেম চালু এবং অনুমতি চাওয়ার ফাংশন
  function initializeNotifications() {
      messaging.onMessage((payload) => {
          console.log('Message received. ', payload);
          showToast(payload.notification.body, 'info');
      });
  }

  async function requestNotificationPermission() {
      const notificationBtn = document.getElementById('notification-btn');
      try {
          await messaging.requestPermission();
          console.log('নোটিফিকেশনের অনুমতি দেওয়া হয়েছে।');
          const token = await messaging.getToken();
          console.log('FCM Token:', token);
          
          const user = auth.currentUser;
          if (user) {
              database.ref(`fcmTokens/${user.uid}`).set({ token: token });
              showToast('নোটিফিকেশন সফলভাবে চালু হয়েছে!', 'success');
              notificationBtn.textContent = '✅ নোটিফিকেশন চালু আছে';
              notificationBtn.disabled = true;
          }
      } catch (err) {
          console.error('নোটিফিকেশনের অনুমতি পেতে ব্যর্থ: ', err);
          showToast('নোটিফিকেশনের অনুমতি দেওয়া হয়নি।', 'error');
      }
  }

  // অ্যানোমালি বা অস্বাভাবিকতা শনাক্তকরণ
  function checkForAnomalies(power) {
    const alertDiv = document.getElementById('anomaly-alert');
    const powerThreshold = 5000; // ওয়াট

    if (power > powerThreshold) {
      const message = `অস্বাভাবিকভাবে উচ্চ পাওয়ার (${power.toFixed(0)} W) ব্যবহার শনাক্ত হয়েছে।`;
      alertDiv.innerHTML = `<div class="alert-message"><strong>সতর্কতা!</strong> ${message}</div>`;
      triggerNotification("উচ্চ পাওয়ার ব্যবহার!", message);
    } else {
      alertDiv.innerHTML = `<p>সিস্টেম স্বাভাবিকভাবে চলছে। কোনো অস্বাভাবিকতা শনাক্ত হয়নি।</p>`;
    }
  }
  
  // অটোমেশন রুল বিল্ডারের অপশন আপডেট
  function updateTriggerOptions() {
    const source = document.getElementById('trigger-source').value;
    const container = document.getElementById('trigger-options-container');
    let html = '';

    if (source === 'energy') {
      html = `
        <div class="form-group">
          <label for="trigger-metric">ম্যাট্রিক</label>
          <select id="trigger-metric">
            <option value="power">পাওয়ার (W)</option>
            <option value="voltage">ভোল্টেজ (V)</option>
            <option value="current">কারেন্ট (A)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trigger-condition">শর্ত</label>
          <select id="trigger-condition">
            <option value=">">এর বেশি হলে</option>
            <option value="<">এর কম হলে</option>
            <option value="==">এর সমান হলে</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trigger-value">মান</label>
          <input type="number" id="trigger-value" placeholder="যেমন: 2000" required>
        </div>
      `;
    } else if (source === 'time') {
      html = `
        <div class="form-group">
          <label for="trigger-value">নির্দিষ্ট সময়</label>
          <input type="time" id="trigger-value" required>
        </div>
      `;
    } else if (source === 'device') {
      html = `
        <div class="form-group">
          <label for="trigger-device">ডিভাইস</label>
          <select id="trigger-device">
            <option value="device1">ডিভাইস ১</option>
            <option value="device2">ডিভাইস ২</option>
            <option value="device3">ডিভাইস ৩</option>
            <option value="device4">ডিভাইস ৪</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trigger-relay">রিলে/লোড</label>
          <select id="trigger-relay">
            ${Array.from({length: 16}, (_, i) => `<option value="relay${i+1}">রিলে ${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="trigger-condition">অবস্থা</label>
          <select id="trigger-condition">
            <option value="true">ON হলে</option>
            <option value="false">OFF হলে</option>
          </select>
        </div>
      `;
    }
    container.innerHTML = html;
  }
  
  // নোটিফিকেশন বার্তা বক্স দেখানো/লুকানোর জন্য ইভেন্ট লিসেনার
  document.getElementById('send-notification-checkbox').addEventListener('change', function() {
    document.getElementById('notification-message-group').style.display = this.checked ? 'flex' : 'none';
  });


  // ★★★ পরিবর্তিত: অটোমেশন রুলে অডিট লগ যুক্ত করা হয়েছে ★★★
  function saveAutomationRule(event) {
    event.preventDefault();
    const sendNotification = document.getElementById('send-notification-checkbox').checked;

    const rule = {
      name: document.getElementById('rule-name').value,
      triggerSource: document.getElementById('trigger-source').value,
      actionDevice: document.getElementById('action-device').value,
      actionRelay: document.getElementById('action-relay').value,
      actionState: document.getElementById('action-state').value === 'true',
      sendNotification: sendNotification,
      notificationMessage: sendNotification ? document.getElementById('notification-message').value : '',
      isEnabled: true,
      lastFired: 0 
    };

    if (rule.triggerSource === 'energy') {
      rule.triggerMetric = document.getElementById('trigger-metric').value;
      rule.triggerCondition = document.getElementById('trigger-condition').value;
      rule.triggerValue = parseFloat(document.getElementById('trigger-value').value);
    } else if (rule.triggerSource === 'time') {
      rule.triggerValue = document.getElementById('trigger-value').value;
    } else if (rule.triggerSource === 'device') {
      rule.triggerDevice = document.getElementById('trigger-device').value;
      rule.triggerRelay = document.getElementById('trigger-relay').value;
      rule.triggerCondition = document.getElementById('trigger-condition').value === 'true';
    }

    database.ref('automationRules').push(rule)
      .then(() => {
        showToast('অটোমেশন রুল সফলভাবে সংরক্ষিত হয়েছে!', 'success');
        // অডিট লগ
        logAuditEvent(`নতুন অটোমেশন রুল '${rule.name}' তৈরি করেছেন।`);
        document.querySelector('.rule-builder-form').reset();
        document.getElementById('notification-message-group').style.display = 'none';
      })
      .catch(error => console.error("রুল সংরক্ষণ করতে সমস্যা হয়েছে: ", error));
  }

  // Firebase থেকে সকল রুল লোড করে দেখানো
  function loadAutomationRules() {
    database.ref('automationRules').on('value', snapshot => {
      automationRules = snapshot.val() || {};
      const listContainer = document.getElementById('automation-rule-list');
      listContainer.innerHTML = '';

      if (Object.keys(automationRules).length === 0) {
        listContainer.innerHTML = '<p>কোনো অটোমেশন বা অ্যালার্ট রুল এখনো তৈরি করা হয়নি।</p>';
        return;
      }

      for (const ruleId in automationRules) {
        const rule = automationRules[ruleId];
        const card = document.createElement('div');
        card.className = `rule-card ${rule.isEnabled ? '' : 'disabled'}`;
        
        let description = `<strong>${rule.name}:</strong> `;
        if (rule.triggerSource === 'energy') {
            description += `যদি <strong>${rule.triggerMetric}</strong> এর মান <strong>${rule.triggerCondition} ${rule.triggerValue}</strong> হয়, `;
        } else if (rule.triggerSource === 'time') {
            description += `যদি সময় <strong>${rule.triggerValue}</strong> হয়, `;
        } else if (rule.triggerSource === 'device') {
            description += `যদি <strong>${rule.triggerDevice}</strong> এর <strong>${rule.triggerRelay}</strong> <strong>${rule.triggerCondition ? 'ON' : 'OFF'}</strong> হয়, `;
        }
        description += `তবে <strong>${rule.actionDevice}</strong> এর <strong>${rule.actionRelay}</strong> কে <strong>${rule.actionState ? 'ON' : 'OFF'}</strong> করুন।`;
        
        if (rule.sendNotification) {
            description += ` এবং একটি নোটিফিকেশন পাঠান।`;
        }


        card.innerHTML = `
          <div class="rule-description">${description}</div>
          <div class="rule-actions">
            <button class="pro-btn rule-btn toggle-rule-btn ${rule.isEnabled ? 'enabled' : 'disabled'}" onclick="toggleRule('${ruleId}')">
              ${rule.isEnabled ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
            </button>
            <button class="pro-btn rule-btn delete-btn" onclick="deleteRule('${ruleId}')">ডিলিট</button>
          </div>
        `;
        listContainer.appendChild(card);
      }
    });
  }

  // রুল সক্রিয় বা নিষ্ক্রিয় করা
  function toggleRule(ruleId) {
    const rule = automationRules[ruleId];
    const newState = !rule.isEnabled;
    database.ref(`automationRules/${ruleId}/isEnabled`).set(newState).then(() => {
        logAuditEvent(`'${rule.name}' রুলটি ${newState ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করেছেন।`);
    });
  }

  // রুল ডিলিট করা
  function deleteRule(ruleId) {
    if (confirm('আপনি কি সত্যিই এই রুলটি মুছে ফেলতে চান?')) {
      const ruleName = automationRules[ruleId].name;
      database.ref(`automationRules/${ruleId}`).remove().then(() => {
          logAuditEvent(`'${ruleName}' রুলটি মুছে ফেলেছেন।`);
      });
    }
  }
  
  // একটি নোটিফিকেশন ট্রিগার করার ফাংশন
  function triggerNotification(title, body) {
      showToast(body, 'info');
      displayNotification(title, body);
  }


  // ★★★ মূল অটোমেশন ইঞ্জিন (পরিবর্তিত) ★★★
  function checkAutomationRules(source, data) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const nowTimestamp = now.getTime();
    
    for (const ruleId in automationRules) {
      const rule = automationRules[ruleId];
      if (!rule.isEnabled) continue;

      if (nowTimestamp - (rule.lastFired || 0) < 30000) continue;

      let triggerMet = false;

      if (source === 'energy' && rule.triggerSource === 'energy') {
        const value = data[rule.triggerMetric];
        if (rule.triggerCondition === '>' && value > rule.triggerValue) triggerMet = true;
        if (rule.triggerCondition === '<' && value < rule.triggerValue) triggerMet = true;
        if (rule.triggerCondition === '==' && value == rule.triggerValue) triggerMet = true;
      }
      
      if (rule.triggerSource === 'time' && rule.triggerValue === currentTime) {
        triggerMet = true;
      }

      if (source === 'device' && rule.triggerSource === 'device') {
        if (data.deviceId === rule.triggerDevice) {
           const deviceCurrentState = data.states[rule.triggerRelay];
           if (deviceCurrentState === rule.triggerCondition) {
             triggerMet = true;
           }
        }
      }

      if (triggerMet) {
        console.log(`অটোমেশন রুল "${rule.name}" কার্যকর হচ্ছে...`);
        database.ref(`devices/${rule.actionDevice}`).update({
          [rule.actionRelay]: rule.actionState 
        });

        if (rule.sendNotification && rule.notificationMessage) {
            triggerNotification(`"${rule.name}" কার্যকর হয়েছে`, rule.notificationMessage);
        }
        
        database.ref(`automationRules/${ruleId}/lastFired`).set(nowTimestamp);
        
        const logMessage = `অটোমেশন "${rule.name}" অনুযায়ী ${rule.actionDevice} এর ${rule.actionRelay} ${rule.actionState ? 'ON' : 'OFF'} করা হয়েছে।`;
        addLogEntry(rule.actionDevice.replace('device','device'), logMessage, 'info');
        
        // ★★★ নতুন: অটোমেশন কার্যকর হলে অডিট লগ তৈরি ★★★
        logAuditEvent(logMessage, "সিস্টেম অটোমেশন");
      }
    }
  }
  setInterval(() => checkAutomationRules('time', {}), 60000);

  // ★★★ নতুন: অডিট লগ লোড এবং প্রদর্শন করার ফাংশন ★★★
  function loadAuditLog() {
      const logListContainer = document.getElementById('audit-log-list');
      // শেষ ১০০টি লগ লোড করা হচ্ছে পারফর্মেন্স ঠিক রাখার জন্য
      const auditLogRef = database.ref('auditLog').limitToLast(100);

      auditLogRef.on('value', (snapshot) => {
          logListContainer.innerHTML = ''; // আগের লগ মুছে ফেলা হলো
          const logs = snapshot.val();
          
          if (!logs) {
              logListContainer.innerHTML = '<p>কোনো কার্যকলাপের লগ পাওয়া যায়নি...</p>';
              return;
          }

          // লগগুলোকে নতুন থেকে পুরানো ক্রমে সাজানো হচ্ছে
          const logKeys = Object.keys(logs).reverse();

          logKeys.forEach(key => {
              const log = logs[key];
              const isSystem = log.user === 'সিস্টেম অটোমেশন';

              const logItem = document.createElement('div');
              logItem.className = `audit-log-item ${isSystem ? 'system-log' : ''}`;
              
              const date = new Date(log.timestamp);
              const formattedTime = date.toLocaleString('bn-BD', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit'
              });
              
              logItem.innerHTML = `
                  <div class="audit-log-header">
                      <span class="audit-log-user ${isSystem ? 'audit-log-user-system' : ''}">👤 ${log.user}</span>
                      <span class="audit-log-timestamp">🕒 ${formattedTime}</span>
                  </div>
                  <div class="audit-log-action">${log.action}</div>
              `;
              
              logListContainer.appendChild(logItem);
          });
      });
  }


  // এন্টার কী প্রেস ইভেন্ট লিসেনার
  function handleLoginKeyPress(event) {
    if (event.key === "Enter") {
        loginWithFirebase();
    }
  }
  document.getElementById("email").addEventListener("keypress", handleLoginKeyPress);
  document.getElementById("password").addEventListener("keypress", handleLoginKeyPress);
  
  document.getElementById("relayPasswordInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") verifyAndOperateRelay();
  });
  document.getElementById("timerPasswordInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") saveTimerSettings();
  });

  window.onload = function() {
    createParticles();
  };