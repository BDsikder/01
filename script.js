// ### ৩. `script.js` ফাইল

// এই ফাইলটিতে আপনার ওয়েবসাইটের সমস্ত কার্যকারিতা (functionality) এবং লজিক রয়েছে।

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
const auth = firebase.auth(); // Firebase Auth সার্ভিস অ্যাক্সেস করার জন্য

// রিলে অপারেশনের জন্য পাসওয়ার্ড (লগইনের জন্য ব্যবহৃত হবে না)
const correctOperatingPassword = "123";

// ### নতুন: Firebase ব্যবহার করে সুরক্ষিত লগইন ফাংশন ###
function loginWithFirebase() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("error");
    const loginBox = document.querySelector(".login-box");

    // খালি ইনপুট চেক
    if (!email || !password) {
        errorDiv.innerText = "❌ দয়া করে ইমেল এবং পাসওয়ার্ড দিন।";
        loginBox.classList.add('shake-animation');
        setTimeout(() => {
            loginBox.classList.remove('shake-animation');
        }, 500);
        return;
    }
    
    errorDiv.innerText = ""; // আগের error মুছে ফেলা হলো

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // লগইন সফল হলে...
            console.log("লগইন সফল:", userCredential.user.email);
            
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
            }, 500);
        })
        .catch((error) => {
            // লগইন ব্যর্থ হলে...
            console.error("লগইন ত্রুটি:", error.message);
            errorDiv.innerText = "❌ ইমেল বা পাসওয়ার্ড সঠিক নয়।";
            loginBox.classList.add('shake-animation');
            setTimeout(() => {
                loginBox.classList.remove('shake-animation');
            }, 500);
        });
}

// ### নতুন: Firebase ব্যবহার করে সুরক্ষিত লগআউট ফাংশন ###
function logout() {
    auth.signOut().then(() => {
        const appContainer = document.getElementById("app");
        const loginContainer = document.getElementById("login");

        appContainer.style.animation = "fadeOut 0.5s ease forwards";
        setTimeout(() => {
            appContainer.style.display = "none";
            loginContainer.style.display = "flex";
            document.getElementById("email").value = "";
            document.getElementById("password").value = "";
            document.getElementById("error").innerText = "";
            loginContainer.style.animation = "fadeIn 0.5s ease forwards";
            // এখানে পেজ রিলোড করা যেতে পারে, যাতে সকল ডেটা লিসেনার বন্ধ হয়ে যায়
            // window.location.reload(); 
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
  
  // রিলে কন্ট্রোল ফাংশন (পাসওয়ার্ড ভেরিফিকেশনের পর কল হবে)
  function controlRelay(device, relay, element) {
    const state = element.checked;
    console.log(`Controlling ${device}/${relay} to ${state}`);
    database.ref('devices/' + device).update({
        [relay]: state
    });
    const logMessage = `${device} এর ${relay} ${state ? 'চালু' : 'বন্ধ'} করা হয়েছে`;
    addLogEntry(device, logMessage, state ? 'success' : 'error');
  }

  // ডিভাইস কন্ট্রোল ফাংশন (for pages 1-4)
  function controlDevice(device, load, state) {
    const timestamp = new Date().toISOString();
    const logMessage = `${device} এর ${load} ${state === 1 ? 'চালু' : state === 2 ? 'সতর্কতা মোডে' : 'বন্ধ'} করা হয়েছে`;
    
    database.ref('devices/' + device).update({
      [load]: state
    });
    
    addLogEntry(device, logMessage, state === 1 ? 'success' : state === 2 ? 'warning' : 'error');
    updateChart(device);
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
              labels: { color: 'var(--text-color)' }
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

  // থিম টগল ফাংশন
  function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    
    if(themeToggle.checked) {
      body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
  }

  // থিম প্রিফারেন্স লোড করার ফাংশন
  function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeToggle = document.getElementById('theme-toggle');
    
    if(savedTheme === 'light') {
      document.body.classList.add('light-theme');
      themeToggle.checked = true;
    } else {
      document.body.classList.remove('light-theme');
      themeToggle.checked = false;
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
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'ভোল্টেজ (V)', data: [], borderColor: 'rgba(230, 126, 34, 1)', backgroundColor: 'rgba(230, 126, 34, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions('ভোল্টেজ ট্রেন্ড (V)')
    });
    const currentCtx = document.getElementById('current-chart').getContext('2d');
    energyCharts.currentChart = new Chart(currentCtx, {
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'কারেন্ট (A)', data: [], borderColor: 'rgba(26, 188, 156, 1)', backgroundColor: 'rgba(26, 188, 156, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions('কারেন্ট ট্রেন্ড (A)')
    });
    const powerCtx = document.getElementById('power-chart').getContext('2d');
    energyCharts.powerChart = new Chart(powerCtx, {
      type: 'line', data: { labels: Array(12).fill(''), datasets: [{ label: 'পাওয়ার (W)', data: [], borderColor: 'rgba(52, 152, 219, 1)', backgroundColor: 'rgba(52, 152, 219, 0.2)', borderWidth: 2, tension: 0.4, fill: true }] }, options: getChartOptions('পাওয়ার ট্রেন্ড (W)')
    });
    const energyCtx = document.getElementById('energy-chart').getContext('2d');
    energyCharts.energyChart = new Chart(energyCtx, {
      type: 'bar', data: { labels: ['সকাল', 'দুপুর', 'বিকাল', 'রাত'], datasets: [{ label: 'এনার্জি (kWh)', data: [0, 0, 0, 0], backgroundColor: 'rgba(155, 89, 182, 0.7)', borderColor: 'rgba(155, 89, 182, 1)', borderWidth: 1 }] }, options: getChartOptions('এনার্জি কনজাম্পশন (kWh)')
    });
  }

  function getChartOptions(title) {
    return {
      responsive: true,
      plugins: { legend: { labels: { color: 'var(--text-color)' } } },
      scales: { x: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: 'var(--text-color)' } }, y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: 'var(--text-color)' } } }
    };
  }

  // এনার্জি ডাটা আপডেট করার ফাংশন
  function updateEnergyData(data) {
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
          let activeCount = 0, inactiveCount = 0, warningCount = 0;
          for(let loadNum = 1; loadNum <= 16; loadNum++) {
            const key = 'Load' + loadNum;
            const value = data[key] !== undefined ? data[key] : 0;
            const el = document.getElementById(`d${deviceNum}-load${loadNum}`);
            if(el) el.innerText = value === 1 ? 'ON' : value === 2 ? 'WARN' : 'OFF';
            
            const statusEl = document.getElementById(`d${deviceNum}-load${loadNum}-status`);
            if(statusEl) {
              if(value === 1) {
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
            if (toggle) toggle.checked = !!state;
        });
    }
    for(let i = 1; i <= 5; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device2/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d2-' + relayName + '-toggle');
            if (toggle) toggle.checked = !!state;
        });
    }
    for(let i = 1; i <= 1; i++) {
        const relayName = 'relay' + i;
        database.ref('devices/device3/' + relayName).on('value', snapshot => {
            const state = snapshot.val();
            const toggle = document.getElementById('d3-' + relayName + '-toggle');
            if (toggle) toggle.checked = !!state;
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
          const updates = {
              enabled: document.getElementById('timer-enabled-btn').classList.contains('enabled'),
              online: document.getElementById('timer-online-time').value,
              offline: document.getElementById('timer-offline-time').value,
              relay: document.getElementById('timer-relay-select').value
          };
          
          database.ref('timers/' + timerOperationContext).update(updates)
              .then(() => {
                  console.log('Timer settings saved successfully!');
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
      options: getChartOptions('Advanced Trend')
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








