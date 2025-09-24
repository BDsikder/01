// --- সম্পূর্ণ JavaScript কোড শুরু ---
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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const messaging = firebase.messaging();

const correctOperatingPassword = "123";

let deviceCharts = {}, energyCharts = {}, advancedEnergyChart = null;
let selectedMetric = 'voltage', selectedTimeRange = 30, historicalData = {};
let relayOperationContext = null, timerOperationContext = null, allTimersData = {};
let currentBackgroundIndex = 0; const totalBackgrounds = 11;
let currentEnergyData = {}, currentDeviceStates = {}, automationRules = {};

function logAuditEvent(action, actor = null) {
    const user = auth.currentUser;
    if (user || actor) {
        const userEmail = actor ? actor : user.email;
        const logEntry = { user: userEmail, action: action, timestamp: firebase.database.ServerValue.TIMESTAMP };
        database.ref('auditLog').push(logEntry);
    }
}

function loginWithFirebase() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("error");
    const loginBox = document.querySelector(".login-box");

    if (!email || !password) {
        errorDiv.innerText = "❌ দয়া করে ইমেল এবং পাসওয়ার্ড দিন।";
        loginBox.classList.add('shake-animation');
        setTimeout(() => loginBox.classList.remove('shake-animation'), 500);
        return;
    }
    errorDiv.innerText = "";

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            logAuditEvent("সিস্টেমে সফলভাবে লগইন করেছেন।");
            const loginContainer = document.getElementById("login");
            const appContainer = document.getElementById("app");
            loginContainer.style.animation = "fadeOut 0.5s ease forwards";
            setTimeout(() => {
                loginContainer.style.display = "none";
                appContainer.style.display = "block";
                appContainer.style.animation = "fadeIn 0.5s ease forwards";
                loadDataRealtime(); initializeCharts(); loadThemePreference(); loadBackgroundPreference();
                initEnergyCharts(); loadEnergyData(); initAdvancedEnergyChart(); loadHistoricalData();
                loadRelayStates(); loadDateTimeData(); loadTimersData(); setInterval(updateAllTimerDisplays, 1000);
                updateTriggerOptions(); loadAutomationRules(); initializeNotifications(); loadAuditLog();
            }, 500);
        })
        .catch(error => {
            errorDiv.innerText = "❌ ইমেল বা পাসওয়ার্ড সঠিক নয়।";
            loginBox.classList.add('shake-animation');
            setTimeout(() => loginBox.classList.remove('shake-animation'), 500);
        });
}

function logout() {
    logAuditEvent("সিস্টেম থেকে লগআউট করেছেন।");
    auth.signOut().then(() => {
        document.getElementById("app").style.animation = "fadeOut 0.5s ease forwards";
        setTimeout(() => window.location.reload(), 500);
    }).catch(error => console.error("লগআউট করার সময় ত্রুটি:", error));
}

function showPage(pageNum) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab')[pageNum-1].classList.add('active');
    document.querySelectorAll('.device-page').forEach(page => page.classList.remove('active'));
    document.getElementById('page'+pageNum).classList.add('active');
    if(pageNum === 6 && advancedEnergyChart) updateAdvancedChart();
}

function controlDevice(device, load, state) {
    const stateText = state === 1 ? 'চালু' : (state === 2 ? 'সতর্কতা মোডে' : 'বন্ধ');
    database.ref('devices/' + device).update({ [load]: state });
    addLogEntry(device, `${device} এর ${load} ${stateText} করা হয়েছে`, state === 1 ? 'success' : state === 2 ? 'warning' : 'error');
    logAuditEvent(`ডিভাইস ${device.replace('device', '')}-এর '${load}' ${stateText} সেট করেছেন।`);
}

function controlRelay(device, relay, element) {
    const state = element.checked;
    database.ref('devices/' + device).update({ [relay]: state });
    addLogEntry(device, `${device} এর ${relay} ${state ? 'চালু' : 'বন্ধ'} করা হয়েছে`, state ? 'success' : 'error');
    logAuditEvent(`ডিভাইস ${device.replace('device', '')}-এর '${relay}' ${state ? 'চালু' : 'বন্ধ'} করেছেন।`);
}

function addLogEntry(device, message, type) {
    const logId = `device${device.replace('device', '')}-logs`;
    const logElement = document.getElementById(logId);
    if (!logElement) return;
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `<div class="log-time">${new Date().toLocaleString('bn-BD')}</div><div class="log-message log-${type}">${message}</div>`;
    logElement.insertBefore(logItem, logElement.firstChild);
    if(logElement.children.length > 50) logElement.removeChild(logElement.lastChild);
}

function initializeCharts() {
    for(let i = 1; i <= 4; i++) {
        const ctx = document.getElementById(`device${i}-chart`).getContext('2d');
        if (deviceCharts[`device${i}`]) deviceCharts[`device${i}`].destroy();
        deviceCharts[`device${i}`] = new Chart(ctx, {
            type: 'doughnut', data: { labels: ['এক্টিভ', 'সতর্কতা', 'ইনএক্টিভ'], datasets: [{ data: [0, 0, 16], backgroundColor: [ 'rgba(46, 204, 113, 0.8)', 'rgba(243, 156, 18, 0.8)', 'rgba(231, 76, 60, 0.8)' ], borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 2 }] },
            options: { responsive: true, plugins: { legend: { labels: { color: 'var(--text-color)' } } } }
        });
    }
}

function loadDataRealtime() {
    for(let i = 1; i <= 4; i++) {
        const deviceKey = `device${i}`;
        database.ref(`devices/${deviceKey}`).on('value', snapshot => {
            const data = snapshot.val();
            if(!data) return;
            currentDeviceStates[deviceKey] = data;
            let active = 0, inactive = 0, warning = 0;
            for(let j = 1; j <= 16; j++) {
                const loadKey = `Load${j}`;
                const value = data[loadKey];
                const loadEl = document.getElementById(`d${i}-load${j}`);
                if (loadEl) loadEl.innerText = value === true || value === 1 ? 'ON' : (value === 2 ? 'WARN' : 'OFF');
                
                const statusEl = document.getElementById(`d${i}-load${j}-status`);
                if(statusEl) {
                    if(value === true || value === 1) { statusEl.textContent = 'এক্টিভ'; statusEl.className = 'card-status status-active'; active++; }
                    else if(value === 2) { statusEl.textContent = 'সতর্কতা'; statusEl.className = 'card-status status-warning'; warning++; }
                    else { statusEl.textContent = 'ইনএক্টিভ'; statusEl.className = 'card-status status-inactive'; inactive++; }
                }
            }
            document.getElementById(`d${i}-active-count`).textContent = active;
            document.getElementById(`d${i}-inactive-count`).textContent = inactive;
            document.getElementById(`d${i}-warning-count`).textContent = warning;
            if(deviceCharts[deviceKey]) {
                deviceCharts[deviceKey].data.datasets[0].data = [active, warning, inactive];
                deviceCharts[deviceKey].update();
            }
            checkAutomationRules('device', { deviceId: deviceKey, states: data });
        });
    }
}

function sendFirmwareUpdate() {
    const urlInput = document.getElementById('firmware-url-input');
    const statusDiv = document.getElementById('firmware-update-status');
    const url = urlInput.value.trim();
    if (url === '' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        statusDiv.textContent = '❌ অনুগ্রহ করে একটি সঠিক URL দিন।';
        statusDiv.className = 'status-error';
        return;
    }
    statusDiv.textContent = 'কমান্ড পাঠানো হচ্ছে...';
    statusDiv.className = '';
    const otaData = { url: url, timestamp: firebase.database.ServerValue.TIMESTAMP };
    database.ref('firmware/ota').set(otaData)
        .then(() => {
            statusDiv.textContent = '✅ আপডেট কমান্ড সফলভাবে পাঠানো হয়েছে!';
            statusDiv.className = 'status-success';
            urlInput.value = '';
            logAuditEvent(`ফার্মওয়্যার আপডেটের জন্য একটি নতুন URL (${url}) জমা দিয়েছেন।`);
            setTimeout(() => { statusDiv.textContent = ''; statusDiv.className = ''; }, 5000);
        })
        .catch(error => {
            statusDiv.textContent = '❌ কমান্ড পাঠাতে সমস্যা হয়েছে।';
            statusDiv.className = 'status-error';
        });
}

function loadAuditLog() {
    const logListContainer = document.getElementById('audit-log-list');
    database.ref('auditLog').limitToLast(100).on('value', snapshot => {
        logListContainer.innerHTML = '';
        const logs = snapshot.val();
        if (!logs) { logListContainer.innerHTML = '<p>কোনো কার্যকলাপের লগ পাওয়া যায়নি...</p>'; return; }
        const logKeys = Object.keys(logs).reverse();
        logKeys.forEach(key => {
            const log = logs[key];
            const logItem = document.createElement('div');
            logItem.className = 'audit-log-item';
            const date = new Date(log.timestamp);
            const formattedTime = date.toLocaleString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSystem = log.user === 'সিস্টেম অটোমেশন';
            logItem.innerHTML = `<div class="audit-log-header"><span class="audit-log-user ${isSystem ? 'audit-log-user-system' : ''}">👤 ${log.user}</span><span class="audit-log-timestamp">🕒 ${formattedTime}</span></div><div class="audit-log-action">${log.action}</div>`;
            logListContainer.appendChild(logItem);
        });
    });
}

function toggleTheme(){document.body.classList.toggle("light-theme",document.getElementById("theme-toggle").checked),localStorage.setItem("theme",document.getElementById("theme-toggle").checked?"light":"dark")}function loadThemePreference(){const e=localStorage.getItem("theme")||"dark";document.body.classList.toggle("light-theme","light"===e),document.getElementById("theme-toggle").checked="light"===e,document.getElementById("theme-toggle").addEventListener("change",toggleTheme)}function changeBackground(){currentBackgroundIndex=(currentBackgroundIndex+1)%totalBackgrounds,applyBackground(currentBackgroundIndex),localStorage.setItem("backgroundIndex",currentBackgroundIndex)}function applyBackground(e){const t=document.body;for(let o=0;o<totalBackgrounds;o++)t.classList.remove(`bg-${o}`);t.classList.add(`bg-${e}`),currentBackgroundIndex=e}function loadBackgroundPreference(){const e=localStorage.getItem("backgroundIndex");applyBackground(e?parseInt(e,10):0)}function initEnergyCharts(){const e={voltageChart:"voltage-chart",currentChart:"current-chart",powerChart:"power-chart",energyChart:"energy-chart"};Object.keys(e).forEach(e=>{energyCharts[e]&&energyCharts[e].destroy()});const t=document.getElementById("voltage-chart").getContext("2d");energyCharts.voltageChart=new Chart(t,{type:"line",data:{labels:Array(12).fill(""),datasets:[{label:"ভোল্টেজ (V)",data:[],borderColor:"rgba(230, 126, 34, 1)",backgroundColor:"rgba(230, 126, 34, 0.2)",borderWidth:2,tension:.4,fill:!0}]},options:getChartOptions("ভোল্টেজ ট্রেন্ড (V)")});const o=document.getElementById("current-chart").getContext("2d");energyCharts.currentChart=new Chart(o,{type:"line",data:{labels:Array(12).fill(""),datasets:[{label:"কারেন্ট (A)",data:[],borderColor:"rgba(26, 188, 156, 1)",backgroundColor:"rgba(26, 188, 156, 0.2)",borderWidth:2,tension:.4,fill:!0}]},options:getChartOptions("কারেন্ট ট্রেন্ড (A)")});const a=document.getElementById("power-chart").getContext("2d");energyCharts.powerChart=new Chart(a,{type:"line",data:{labels:Array(12).fill(""),datasets:[{label:"পাওয়ার (W)",data:[],borderColor:"rgba(52, 152, 219, 1)",backgroundColor:"rgba(52, 152, 219, 0.2)",borderWidth:2,tension:.4,fill:!0}]},options:getChartOptions("পাওয়ার ট্রেন্ড (W)")});const n=document.getElementById("energy-chart").getContext("2d");energyCharts.energyChart=new Chart(n,{type:"bar",data:{labels:["সকাল","দুপুর","বিকাল","রাত"],datasets:[{label:"এনার্জি (kWh)",data:[0,0,0,0],backgroundColor:"rgba(155, 89, 182, 0.7)",borderColor:"rgba(155, 89, 182, 1)",borderWidth:1}]},options:getChartOptions("এনার্জি কনজাম্পশন (kWh)")})}function getChartOptions(e){return{responsive:!0,plugins:{legend:{labels:{color:"var(--text-color)"}}},scales:{x:{grid:{color:"rgba(255, 255, 255, 0.1)"},ticks:{color:"var(--text-color)"}},y:{grid:{color:"rgba(255, 255, 255, 0.1)"},ticks:{color:"var(--text-color)"}}}}}function updateEnergyData(e){currentEnergyData=e,document.getElementById("voltage-value").innerHTML=e.voltage?e.voltage.toFixed(2)+' <span class="energy-unit">V</span>':"-- V",document.getElementById("current-value").innerHTML=e.current?e.current.toFixed(2)+' <span class="energy-unit">A</span>':"-- A",document.getElementById("power-value").innerHTML=e.power?e.power.toFixed(2)+' <span class="energy-unit">W</span>':"-- W",document.getElementById("energy-value").innerHTML=e.energy?e.energy.toFixed(2)+' <span class="energy-unit">kWh</span>':"-- kWh",document.getElementById("frequency-value").innerHTML=e.frequency?e.frequency.toFixed(2)+' <span class="energy-unit">Hz</span>':"-- Hz",document.getElementById("power-factor-value").innerHTML=e.powerFactor?e.powerFactor.toFixed(2):"--",document.getElementById("active-power-value").innerHTML=e.activePower?e.activePower.toFixed(2)+' <span class="energy-unit">W</span>':"-- W",document.getElementById("reactive-power-value").innerHTML=e.reactivePower?e.reactivePower.toFixed(2)+' <span class="energy-unit">VAR</span>':"-- VAR",document.getElementById("units-value").innerHTML=e.units?e.units.toFixed(2)+' <span class="energy-unit">Units</span>':"-- Units",document.getElementById("daily-cost-value").innerHTML=e.dailyCost?e.dailyCost.toFixed(2)+' <span class="energy-unit">BDT</span>':"-- BDT",e.timestamp?document.getElementById("timestamp-value").textContent=new Date(10===e.timestamp.toString().length?1e3*e.timestamp:e.timestamp).toLocaleString("bn-BD",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):document.getElementById("timestamp-value").textContent="--",updateEnergyChartData(energyCharts.voltageChart,e.voltage),updateEnergyChartData(energyCharts.currentChart,e.current),updateEnergyChartData(energyCharts.powerChart,e.power),e.energy&&(energyCharts.energyChart.data.datasets[0].data[new Date().getHours()>=6&&new Date().getHours()<12?0:new Date().getHours()>=12&&new Date().getHours()<16?1:new Date().getHours()>=16&&new Date().getHours()<20?2:3]=e.energy,energyCharts.energyChart.update());const t=new Date().getTime();historicalData[t]||(historicalData[t]=e,document.getElementById("page6").classList.contains("active")&&updateAdvancedChart()),checkForAnomalies(e.power),checkAutomationRules("energy",e)}function updateEnergyChartData(e,t){t&&e&&(e.data.labels.push(""),e.data.labels.length>12&&e.data.labels.shift(),e.data.datasets[0].data.push(t),e.data.datasets[0].data.length>12&&e.data.datasets[0].data.shift(),e.update())}function loadEnergyData(){database.ref("energymonitoring").on("value",e=>{const t=e.val();t&&updateEnergyData(t)})}function loadRelayStates(){for(let e=1;e<=8;e++){const t="relay"+e;database.ref("devices/device1/"+t).on("value",o=>{const a=o.val(),n=document.getElementById("d1-"+t+"-toggle");n&&(n.checked=a)})}for(let e=1;e<=5;e++){const t="d2-relay"+e;database.ref("devices/device2/relay"+e).on("value",o=>{const a=o.val(),n=document.getElementById(t+"-toggle");n&&(n.checked=a)})}for(let e=1;e<=2;e++){const t="d3-relay"+e;database.ref("devices/device3/relay"+e).on("value",o=>{const a=o.val(),n=document.getElementById(t+"-toggle");n&&(n.checked=a)})}for(let e=1;e<=2;e++){const t="d4-relay"+e;database.ref("devices/device4/relay"+e).on("value",o=>{const a=o.val(),n=document.getElementById(t+"-toggle");n&&(n.checked=a)})}}function promptForRelayPassword(e,t,o){o.checked=!o.checked,relayOperationContext={device:e,relay:t,element:o,targetState:!o.checked},document.getElementById("relayPasswordModal").style.display="flex",document.getElementById("relayPasswordInput").focus(),document.getElementById("relayPasswordError").innerText=""}function verifyAndOperateRelay(){const e=document.getElementById("relayPasswordInput").value;if(e===correctOperatingPassword)relayOperationContext&&(e=>{const{device:t,relay:o,element:a,targetState:n}=e;a.checked=n,controlRelay(t,o,a),closeRelayModal()})(relayOperationContext);else{const e=document.getElementById("relayPasswordError");e.innerText="❌ ভুল পাসওয়ার্ড!";const t=document.querySelector("#relayPasswordModal .password-modal-box");t.style.animation="shake 0.5s ease-in-out",setTimeout(()=>{t.style.animation=""},500)}document.getElementById("relayPasswordInput").value=""}function cancelRelayOperation(){closeRelayModal()}function closeRelayModal(){document.getElementById("relayPasswordModal").style.display="none",document.getElementById("relayPasswordInput").value="",relayOperationContext=null}function loadDateTimeData(){database.ref("devices/device1").on("value",e=>{const t=e.val();t&&t.currentDate&&t.currentTime&&(document.querySelectorAll("#page8 .current-date").forEach(e=>{e.textContent=`📅 ${t.currentDate}`}),document.querySelectorAll("#page8 .current-time").forEach(e=>{e.textContent=`⏰ ${t.currentTime}`}))})}function loadTimersData(){database.ref("timers").on("value",e=>{allTimersData=e.val()||{},updateAllTimerDisplays()})}function updateAllTimerDisplays(){for(const e in allTimersData){const t=allTimersData[e],o=document.getElementById(`timer-status-${e}`);o&&(o.innerHTML=t.enabled?`টাইমার সক্রিয়। ${(a=calculateCountdown(t.online,t.offline)).nextState} ${a.timeLeft} পর।`:"টাইমার নিষ্ক্রিয় আছে।");var a}}function calculateCountdown(e,t){const o=new Date,a=new Date(o.toDateString()+" "+e),n=new Date(o.toDateString()+" "+t);let r,d;a<n?o>=a&&o<n?(r=n,d="অফ হবে"):(r=o<a?a:new Date(a.getTime()+864e5),d="অন হবে"):o>=n&&o<a?(r=a,d="অন হবে"):(r=o<n?n:new Date(n.getTime()+864e5),d="অফ হবে");const i=r-o,s=Math.floor(i/36e5),l=Math.floor(i%36e5/6e4),c=Math.floor(i%6e4/1e3);return{timeLeft:`${String(s).padStart(2,"0")}:${String(l).padStart(2,"0")}:${String(c).padStart(2,"0")}`,nextState:d}}function openTimerModal(e){timerOperationContext=e;const t=allTimersData[e]||{};document.getElementById("timer-modal-title").textContent=`${e.toUpperCase()} - টাইমার সেটিংস`,document.getElementById("timer-online-time").value=t.online||"00:00:00",document.getElementById("timer-offline-time").value=t.offline||"00:00:00",document.getElementById("timer-relay-select").value=t.relay||"relay1";const o=document.getElementById("timer-enabled-btn");updateEnabledButton(o,!!t.enabled),document.getElementById("timerModal").style.display="flex"}function updateEnabledButton(e,t){e.textContent=t?"সক্রিয়":"নিষ্ক্রিয়",e.classList.toggle("enabled",t),e.classList.toggle("disabled",!t)}function toggleTimerEnabled(){const e=document.getElementById("timer-enabled-btn");updateEnabledButton(e,!e.classList.contains("enabled"))}function closeTimerModal(){document.getElementById("timerModal").style.display="none",document.getElementById("timerPasswordInput").value="",document.getElementById("timerPasswordError").textContent="",timerOperationContext=null}function saveTimerSettings(){const e=document.getElementById("timerPasswordInput").value;if(e!==correctOperatingPassword){const e=document.getElementById("timerPasswordError");e.textContent="❌ ভুল অপারেটিং পাসওয়ার্ড!";const t=document.querySelector("#timerModal .timer-modal-box");return t.style.animation="shake 0.5s ease-in-out",void setTimeout(()=>{t.style.animation=""},500)}timerOperationContext&&database.ref("timers/"+timerOperationContext).update({enabled:document.getElementById("timer-enabled-btn").classList.contains("enabled"),online:document.getElementById("timer-online-time").value,offline:document.getElementById("timer-offline-time").value,relay:document.getElementById("timer-relay-select").value}).then(()=>{logAuditEvent(`'${timerOperationContext}' এর জন্য টাইমার সেটিংস পরিবর্তন করেছেন।`),closeTimerModal()}).catch(e=>{document.getElementById("timerPasswordError").textContent="ত্রুটি: সংরক্ষণ করা যায়নি।"})}function initAdvancedEnergyChart(){const e=document.getElementById("advanced-energy-chart").getContext("2d");advancedEnergyChart&&advancedEnergyChart.destroy(),advancedEnergyChart=new Chart(e,{type:"line",data:{labels:[],datasets:[{label:"ভোল্টেজ (V)",data:[],borderColor:"rgba(230, 126, 34, 1)",backgroundColor:"rgba(230, 126, 34, 0.2)",borderWidth:2,tension:.4,fill:!0}]},options:getChartOptions("Advanced Trend")})}function changeTimeRange(e){selectedTimeRange=e,document.querySelectorAll(".time-btn").forEach(e=>e.classList.remove("active")),event.target.classList.add("active"),updateAdvancedChart()}function selectMetric(e){selectedMetric=e,document.querySelectorAll(".metric-card").forEach(e=>e.classList.remove("selected")),event.target.closest(".metric-card").classList.add("selected"),updateAdvancedChart()}function updateAdvancedChart(){if(!advancedEnergyChart)return;const e=new Date().getTime(),t=e-60*selectedTimeRange*1e3,o=Object.keys(historicalData).filter(e=>parseInt(e)>=t).sort(),a=o.map(e=>new Date(parseInt(e)).toLocaleTimeString("bn-BD")),n=o.map(e=>historicalData[e][selectedMetric]);document.getElementById("advanced-graph-title").textContent=`${(d={voltage:"ভোল্টেজ",current:"কারেন্ট",power:"পাওয়ার",energy:"এনার্জি",frequency:"ফ্রিকোয়েন্সি",powerFactor:"পাওয়ার ফ্যাক্টর",activePower:"অ্যাক্টিভ পাওয়ার",reactivePower:"রিঅ্যাক্টিভ পাওয়ার"},d[r]||r)} ট্রেন্ড (${(i=selectedTimeRange)<60?`${i} মিনিট`:`${Math.floor(i/60)} ঘন্টা`})`,advancedEnergyChart.data.labels=a,advancedEnergyChart.data.datasets[0].data=n,advancedEnergyChart.data.datasets[0].label=`${(l={voltage:"ভোল্টেজ",current:"কারেন্ট",power:"পাওয়ার",energy:"এনার্জি",frequency:"ফ্রিকোয়েন্সি",powerFactor:"পাওয়ার ফ্যাক্টর",activePower:"অ্যাক্টিভ পাওয়ার",reactivePower:"রিঅ্যাক্টিভ পাওয়ার"},l[s]||s)} (${(c={voltage:"V",current:"A",power:"W",energy:"kWh",frequency:"Hz",powerFactor:"",activePower:"W",reactivePower:"VAR"},c[s]||"")})`,advancedEnergyChart.update(),document.getElementById("no-data-message").style.display=0===n.length?"block":"none";var r,d,s,l,c,i}function loadHistoricalData(){database.ref("energyHistory").limitToLast(1e3).on("value",e=>{const t=e.val();t&&(historicalData=t,updateAdvancedChart())})}function downloadGraphData(){const e=Object.keys(historicalData).sort();let t="data:text/csv;charset=utf-8,সময়,ভোল্টেজ (V),কারেন্ট (A),পাওয়ার (W),এনার্জি (kWh),ফ্রিকোয়েন্সি (Hz),পাওয়ার ফ্যাক্টর,অ্যাক্টিভ পাওয়ার (W),রিঅ্যাক্টিভ পাওয়ার (VAR)\n";e.forEach(e=>{const o=historicalData[e];t+=[new Date(parseInt(e)).toLocaleString(),o.voltage||"",o.current||"",o.power||"",o.energy||"",o.frequency||"",o.powerFactor||"",o.activePower||"",o.reactivePower||""].join(",")+"\n"});const o=encodeURI(t),a=document.createElement("a");a.setAttribute("href",o),a.setAttribute("download",`energy_data_${(new Date).toLocaleDateString()}.csv`),document.body.appendChild(a),a.click(),document.body.removeChild(a)}function printGraph(){const e=document.getElementById("advanced-energy-chart"),t=window.open("","Print Chart");t.document.write(`<html><head><title>Print Chart</title></head><body><h1>${document.getElementById("advanced-graph-title").textContent}</h1><img src="${e.toDataURL()}"/></body></html>`),t.document.close(),t.focus(),setTimeout(()=>{t.print(),t.close()},500)}function showToast(e,t="info"){const o=document.getElementById("toast-container"),a=document.createElement("div");a.className=`toast-message ${t}`;let n="ℹ️";"success"===t&&(n="✅"),"error"===t&&(n="❌"),a.innerHTML=`${n} ${e}`,o.appendChild(a),setTimeout(()=>{a.remove()},5e3)}function displayNotification(e,t){"Notification"in window&&"granted"===Notification.permission&&navigator.serviceWorker.ready.then(o=>{o.showNotification(e,{body:t,icon:"Bisnu.png",badge:"Bisnu.png"})})}function initializeNotifications(){messaging.onMessage(e=>{showToast(e.notification.body,"info")})}async function requestNotificationPermission(){const e=document.getElementById("notification-btn");try{await messaging.requestPermission();const t=await messaging.getToken(),o=auth.currentUser;o&&(database.ref(`fcmTokens/${o.uid}`).set({token:t}),showToast("নোটিফিকেশন সফলভাবে চালু হয়েছে!","success"),e.textContent="✅ নোটিফিকেশন চালু আছে",e.disabled=!0)}catch(e){showToast("নোটিফিকেশনের অনুমতি দেওয়া হয়নি।","error")}}function checkForAnomalies(e){const t=document.getElementById("anomaly-alert");e>5e3?(e=`অস্বাভাবিকভাবে উচ্চ পাওয়ার (${e.toFixed(0)} W) ব্যবহার শনাক্ত হয়েছে।`,t.innerHTML=`<div class="alert-message"><strong>সতর্কতা!</strong> ${e}</div>`,triggerNotification("উচ্চ পাওয়ার ব্যবহার!",e)):t.innerHTML="<p>সিস্টেম স্বাভাবিকভাবে চলছে। কোনো অস্বাভাবিকতা শনাক্ত হয়নি।</p>"}function updateTriggerOptions(){const e=document.getElementById("trigger-source").value,t=document.getElementById("trigger-options-container");let o="";"energy"===e?o='<div class="form-group"><label for="trigger-metric">ম্যাট্রিক</label><select id="trigger-metric"><option value="power">পাওয়ার (W)</option><option value="voltage">ভোল্টেজ (V)</option><option value="current">কারেন্ট (A)</option></select></div><div class="form-group"><label for="trigger-condition">শর্ত</label><select id="trigger-condition"><option value=">">এর বেশি হলে</option><option value="<">এর কম হলে</option><option value="==">এর সমান হলে</option></select></div><div class="form-group"><label for="trigger-value">মান</label><input type="number" id="trigger-value" placeholder="যেমন: 2000" required></div>':"time"===e?o='<div class="form-group"><label for="trigger-value">নির্দিষ্ট সময়</label><input type="time" id="trigger-value" required></div>':"device"===e&&(o=`<div class="form-group"><label for="trigger-device">ডিভাইস</label><select id="trigger-device"><option value="device1">ডিভাইস ১</option><option value="device2">ডিভাইস ২</option><option value="device3">ডিভাইস ৩</option><option value="device4">ডিভাইস ৪</option></select></div><div class="form-group"><label for="trigger-relay">রিলে/লোড</label><select id="trigger-relay">${Array.from({length:16},(e,t)=>`<option value="relay${t+1}">রিলে ${t+1}</option>`).join("")}</select></div><div class="form-group"><label for="trigger-condition">অবস্থা</label><select id="trigger-condition"><option value="true">ON হলে</option><option value="false">OFF হলে</option></select></div>`),t.innerHTML=o}document.getElementById("send-notification-checkbox").addEventListener("change",function(){document.getElementById("notification-message-group").style.display=this.checked?"flex":"none"});function saveAutomationRule(e){e.preventDefault();const t=document.getElementById("send-notification-checkbox").checked,o={name:document.getElementById("rule-name").value,triggerSource:document.getElementById("trigger-source").value,actionDevice:document.getElementById("action-device").value,actionRelay:document.getElementById("action-relay").value,actionState:"true"===document.getElementById("action-state").value,sendNotification:t,notificationMessage:t?document.getElementById("notification-message").value:"",isEnabled:!0,lastFired:0};"energy"===o.triggerSource?(o.triggerMetric=document.getElementById("trigger-metric").value,o.triggerCondition=document.getElementById("trigger-condition").value,o.triggerValue=parseFloat(document.getElementById("trigger-value").value)):"time"===o.triggerSource?o.triggerValue=document.getElementById("trigger-value").value:"device"===o.triggerSource&&(o.triggerDevice=document.getElementById("trigger-device").value,o.triggerRelay=document.getElementById("trigger-relay").value,o.triggerCondition="true"===document.getElementById("trigger-condition").value),database.ref("automationRules").push(o).then(()=>{showToast("অটোমেশন রুল সফলভাবে সংরক্ষিত হয়েছে!","success"),logAuditEvent(`নতুন অটোমেশন রুল '${o.name}' তৈরি করেছেন।`),document.querySelector(".rule-builder-form").reset(),document.getElementById("notification-message-group").style.display="none"})}function loadAutomationRules(){database.ref("automationRules").on("value",e=>{automationRules=e.val()||{};const t=document.getElementById("automation-rule-list");if(t.innerHTML="",0===Object.keys(automationRules).length)return void(t.innerHTML="<p>কোনো অটোমেশন বা অ্যালার্ট রুল এখনো তৈরি করা হয়নি।</p>");for(const e in automationRules){const o=automationRules[e],a=document.createElement("div");a.className=`rule-card ${o.isEnabled?"":"disabled"}`;let n=`<strong>${o.name}:</strong> `;"energy"===o.triggerSource?n+=`যদি <strong>${o.triggerMetric}</strong> এর মান <strong>${o.triggerCondition} ${o.triggerValue}</strong> হয়, `:n+="time"===o.triggerSource?`যদি সময় <strong>${o.triggerValue}</strong> হয়, `:n+="device"===o.triggerSource?`যদি <strong>${o.triggerDevice}</strong> এর <strong>${o.triggerRelay}</strong> <strong>${o.triggerCondition?"ON":"OFF"}</strong> হয়, `:"???",n+=`তবে <strong>${o.actionDevice}</strong> এর <strong>${o.actionRelay}</strong> কে <strong>${o.actionState?"ON":"OFF"}</strong> করুন।`,o.sendNotification&&(n+=" এবং একটি নোটিফিকেশন পাঠান।"),a.innerHTML=`<div class="rule-description">${n}</div><div class="rule-actions"><button class="pro-btn rule-btn toggle-rule-btn ${o.isEnabled?"enabled":"disabled"}" onclick="toggleRule('${e}')">${o.isEnabled?"নিষ্ক্রিয় করুন":"সক্রিয় করুন"}</button><button class="pro-btn rule-btn delete-btn" onclick="deleteRule('${e}')">ডিলিট</button></div>`,t.appendChild(a)}})}function toggleRule(e){const t=automationRules[e],o=!t.isEnabled;database.ref(`automationRules/${e}/isEnabled`).set(o).then(()=>{logAuditEvent(`'${t.name}' রুলটি ${o?"সক্রিয়":"নিষ্ক্রিয়"} করেছেন।`)})}function deleteRule(e){if(confirm("আপনি কি সত্যিই এই রুলটি মুছে ফেলতে চান?")){const t=automationRules[e].name;database.ref(`automationRules/${e}`).remove().then(()=>{logAuditEvent(`'${t}' রুলটি মুছে ফেলেছেন।`)})}}function triggerNotification(e,t){showToast(t,"info"),displayNotification(e,t)}function checkAutomationRules(e,t){const o=new Date,a=`${String(o.getHours()).padStart(2,"0")}:${String(o.getMinutes()).padStart(2,"0")}`,n=o.getTime();for(const o in automationRules){const r=automationRules[o];if(r.isEnabled&&!(n-(r.lastFired||0)<3e4)){let d=!1;"energy"===e&&"energy"===r.triggerSource&&(">"===r.triggerCondition&&t[r.triggerMetric]>r.triggerValue&&(d=!0),"<"===r.triggerCondition&&t[r.triggerMetric]<r.triggerValue&&(d=!0),"=="===r.triggerCondition&&t[r.triggerMetric]==r.triggerValue&&(d=!0)),"time"===r.triggerSource&&r.triggerValue===a&&(d=!0),"device"===e&&"device"===r.triggerSource&&t.deviceId===r.triggerDevice&&t.states[r.triggerRelay]===r.triggerCondition&&(d=!0),d&&(database.ref(`devices/${r.actionDevice}`).update({[r.actionRelay]:r.actionState}),r.sendNotification&&r.notificationMessage&&triggerNotification(`"${r.name}" কার্যকর হয়েছে`,r.notificationMessage),database.ref(`automationRules/${o}/lastFired`).set(n),addLogEntry(r.actionDevice.replace("device","device"),`অটোমেশন "${r.name}" অনুযায়ী ${r.actionDevice} এর ${r.actionRelay} ${r.actionState?"ON":"OFF"} করা হয়েছে।`,"info"),logAuditEvent(`অটোমেশন "${r.name}" অনুযায়ী ${r.actionDevice} এর ${r.actionRelay} ${r.actionState?"ON":"OFF"} করা হয়েছে।`,"সিস্টেম অটোমেশন"))}}}setInterval(()=>checkAutomationRules("time",{}),6e4);function openImageModal(e,t){const o=document.getElementById("imageModal");o.style.display="flex",document.getElementById("modalImage").src=e,document.getElementById("modalCaption").innerHTML=t}function closeImageModal(){document.getElementById("imageModal").style.display="none"}window.onclick=function(e){e.target==document.getElementById("imageModal")&&closeImageModal()};function handleLoginKeyPress(e){"Enter"===e.key&&loginWithFirebase()}document.getElementById("email").addEventListener("keypress",handleLoginKeyPress),document.getElementById("password").addEventListener("keypress",handleLoginKeyPress),document.getElementById("relayPasswordInput").addEventListener("keypress",function(e){"Enter"===e.key&&verifyAndOperateRelay()}),document.getElementById("timerPasswordInput").addEventListener("keypress",function(e){"Enter"===e.key&&saveTimerSettings()});function createParticles(){const e=document.getElementById("particles");if(e.children.length>0)return;for(let t=0;t<30;t++){const o=document.createElement("div");o.classList.add("particle");const a=10*Math.random()+5;o.style.width=`${a}px`,o.style.height=`${a}px`,o.style.left=`${100*Math.random()}%`,o.style.top=`${100*Math.random()}%`,o.style.animationDelay=`${15*Math.random()}s`,o.style.animationDuration=`${10*Math.random()+10}s`,o.style.opacity=.5*Math.random()+.1,e.appendChild(o)}}window.onload=function(){createParticles()};
// --- সম্পূর্ণ JavaScript কোড শেষ ---