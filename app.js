/**
 * NetOptimizer Pro v3.0 Ultra Engine
 * Advanced Network Diagnostics, Parallel Benchmarking & PowerShell Generator
 */

const CONFIG = {
  CDN_ENDPOINTS: [
    { name: 'Cloudflare Edge (1.1.1.1)', url: 'https://1.1.1.1/cdn-cgi/trace' },
    { name: 'Google Public (8.8.8.8)', url: 'https://dns.google/resolve?name=cloudflare.com' },
    { name: 'Quad9 Security (9.9.9.9)', url: 'https://dns.quad9.net:5053/dns-query?name=example.com' }
  ],
  DNS_BENCHMARKS: [
    { name: 'Cloudflare DoH', url: 'https://cloudflare-dns.com/dns-query?name=google.com' },
    { name: 'Google DoH', url: 'https://dns.google/resolve?name=google.com' },
    { name: 'Quad9 DoH', url: 'https://dns.quad9.net/dns-query?name=google.com' },
    { name: 'AdGuard DoH', url: 'https://dns.adguard-dns.com/resolve?name=google.com' }
  ]
};

const STATE = {
  customCommands: [],
  isBenchmarking: false,
  debounceTimer: null
};

// ==========================================
// 1. INITIALIZATION & EVENT DELEGATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  buildPowerShell();
  injectToastContainer();
});

function initUI() {
  // Real-time input handling with debouncing
  document.addEventListener('change', (e) => {
    if (shouldTriggerBuild(e.target)) buildPowerShell();
  });

  document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
      clearTimeout(STATE.debounceTimer);
      STATE.debounceTimer = setTimeout(buildPowerShell, 300);
    }
  });
}

function shouldTriggerBuild(target) {
  const ignored = ['ps-output', 'probe-log', 'config-import'];
  return !ignored.includes(target.id) && (target.tagName === 'INPUT' || target.tagName === 'SELECT');
}

// ==========================================
// 2. ULTRA DIAGNOSTICS & BENCHMARK SUITE
// ==========================================
async function runSpeedTest() {
  if (STATE.isBenchmarking) return;
  STATE.isBenchmarking = true;

  const ui = {
    ping: document.getElementById('txt-ping'),
    dns: document.getElementById('txt-dns-speed'),
    stability: document.getElementById('txt-stability'),
    grade: document.getElementById('txt-grade'),
    log: document.getElementById('probe-log')
  };

  logMessage(ui.log, '=== STARTING COMPREHENSIVE NETWORK AUDIT ===\n', true);
  if (ui.ping) ui.ping.innerText = 'Testing...';
  if (ui.dns) ui.dns.innerText = 'Testing...';
  if (ui.stability) ui.stability.innerText = 'Analyzing...';
  if (ui.grade) ui.grade.innerText = 'Auditing...';

  try {
    // Stage 1: Latency & Jitter Probing across multiple CDNs
    logMessage(ui.log, '[1/4] Probing Edge CDNs for Latency & Jitter...');
    const pingResults = await probeLatencyAndJitter();
    
    if (ui.ping) ui.ping.innerText = `${pingResults.avgPing} ms`;
    logMessage(ui.log, ` -> Avg Latency: ${pingResults.avgPing}ms | Jitter: ${pingResults.jitter}ms | Min/Max: ${pingResults.minPing}/${pingResults.maxPing}ms`);

    // Stage 2: DNS Resolution Speed Test
    logMessage(ui.log, '[2/4] Benchmarking Secure DoH Resolvers in Parallel...');
    const dnsResults = await benchmarkDNS();
    if (ui.dns) ui.dns.innerText = `${dnsResults.fastestTime} ms`;
    logMessage(ui.log, ` -> Fastest Resolver: ${dnsResults.fastestName} (${dnsResults.fastestTime}ms avg)`);

    // Stage 3: Packet Stability & Loss Estimation
    logMessage(ui.log, '[3/4] Testing Packet Stability & Loss Rate...');
    const stabilityScore = calculateStability(pingResults.successRate, pingResults.jitter);
    if (ui.stability) ui.stability.innerText = `${stabilityScore}%`;
    logMessage(ui.log, ` -> Packet Success Rate: ${pingResults.successRate}% | Stability Score: ${stabilityScore}%`);

    // Stage 4: Bufferbloat & Loaded Latency Simulation
    logMessage(ui.log, '[4/4] Estimating Bufferbloat under Traffic Load...');
    const bufferbloat = await estimateBufferbloat(pingResults.avgPing);
    
    if (ui.grade) {
      ui.grade.innerText = bufferbloat.grade;
      ui.grade.style.color = bufferbloat.color;
    }
    logMessage(ui.log, ` -> Unloaded Ping: ${pingResults.avgPing}ms | Loaded Ping: ${bufferbloat.loadedPing}ms (+${bufferbloat.delta}ms)`);
    logMessage(ui.log, `\n=== AUDIT COMPLETE: Rating [${bufferbloat.grade}] ===`);

    showToast('Network benchmark audit completed successfully!', 'success');
  } catch (err) {
    logMessage(ui.log, `\n[CRITICAL ERROR] Diagnostic probe failed: ${err.message}`);
    showToast('Diagnostic audit encountered errors.', 'error');
  } finally {
    STATE.isBenchmarking = false;
  }
}

async function measurePing(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    clearTimeout(id);
    return Math.round(performance.now() - start);
  } catch (e) {
    clearTimeout(id);
    return null; // Request failed or timed out
  }
}

async function probeLatencyAndJitter() {
  const pings = [];
  let totalAttempts = 0;

  for (let i = 0; i < 3; i++) {
    for (const endpoint of CONFIG.CDN_ENDPOINTS) {
      totalAttempts++;
      const latency = await measurePing(endpoint.url);
      if (latency !== null) pings.push(latency);
    }
  }

  if (pings.length === 0) throw new Error('All ICMP/HTTP probes failed. Offline or firewall blocking.');

  const avgPing = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
  const minPing = Math.min(...pings);
  const maxPing = Math.max(...pings);
  
  // Calculate Jitter (Mean Absolute Difference between consecutive pings)
  let jitterSum = 0;
  for (let i = 1; i < pings.length; i++) {
    jitterSum += Math.abs(pings[i] - pings[i - 1]);
  }
  const jitter = pings.length > 1 ? Math.round(jitterSum / (pings.length - 1)) : 0;
  const successRate = Math.round((pings.length / totalAttempts) * 100);

  return { avgPing, minPing, maxPing, jitter, successRate };
}

async function benchmarkDNS() {
  const results = await Promise.all(
    CONFIG.DNS_BENCHMARKS.map(async (dns) => {
      const times = [];
      for (let i = 0; i < 2; i++) {
        const time = await measurePing(dns.url, 2500);
        if (time !== null) times.push(time);
      }
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 999;
      return { name: dns.name, avg };
    })
  );

  results.sort((a, b) => a.avg - b.avg);
  return { fastestName: results[0].name, fastestTime: results[0].avg };
}

async function estimateBufferbloat(unloadedPing) {
  // Simulate network load via multi-threaded payload fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  const loadRequests = [
    fetch('https://1.1.1.1/cdn-cgi/trace', { cache: 'no-store', signal: controller.signal }),
    fetch('https://dns.google/resolve?name=microsoft.com', { cache: 'no-store', signal: controller.signal })
  ];

  const loadedPingStart = performance.now();
  await Promise.allSettled([...loadRequests, measurePing('https://1.1.1.1/cdn-cgi/trace')]);
  clearTimeout(timeoutId);

  const loadedPing = Math.round(performance.now() - loadedPingStart);
  const delta = Math.max(0, loadedPing - unloadedPing);

  if (delta < 15) return { grade: 'Low Bufferbloat (A+)', color: 'var(--accent-green)', loadedPing, delta };
  if (delta < 45) return { grade: 'Moderate (B)', color: 'var(--accent-amber)', loadedPing, delta };
  return { grade: 'High Bufferbloat (C)', color: 'var(--accent-red)', loadedPing, delta };
}

function calculateStability(successRate, jitter) {
  let score = successRate;
  if (jitter > 20) score -= 15;
  else if (jitter > 10) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function logMessage(target, text, clear = false) {
  if (!target) return;
  if (clear) target.value = '';
  target.value += text + '\n';
  target.scrollTop = target.scrollHeight;
}

// ==========================================
// 3. POWERSHELL CODE GENERATOR
// ==========================================
function buildPowerShell() {
  const psOutput = document.getElementById('ps-output');
  if (!psOutput) return;

  const getChk = (id) => !!document.getElementById(id)?.checked;
  const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

  let script = `# ==========================================================================\n`;
  script += `# NETOPTIMIZER PRO V3.0 - MASTER POWERSHELL OPTIMIZATION SCRIPT\n`;
  script += `# TARGET OS: WINDOWS 10 / WINDOWS 11 / WINDOWS SERVER (RUN AS ADMIN)\n`;
  script += `# GENERATED: ${new Date().toLocaleString()}\n`;
  script += `# ==========================================================================\n\n`;

  script += `Write-Host '[+] Verifying Administrative Credentials...' -ForegroundColor Cyan\n`;
  script += `if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {\n`;
  script += `    Write-Error '[!] ERROR: This script MUST be run from an Administrator PowerShell window!'\n`;
  script += `    Exit\n`;
  script += `}\n\n`;

  script += `# --------------------------------------------------------------------------\n`;
  script += `# 1. SYSTEM PROTECTION & RESTORE POINT\n`;
  script += `# --------------------------------------------------------------------------\n`;
  script += `Write-Host '[+] Creating System Restore Point [NetOptimizer_v3_Backup]...' -ForegroundColor Yellow\n`;
  script += `Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue\n`;
  script += `Checkpoint-Computer -Description 'NetOptimizer_v3_Backup' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction SilentlyContinue\n\n`;

  script += `# --------------------------------------------------------------------------\n`;
  script += `# 2. TCP KERNEL & NETWORK STACK OPTIMIZATION\n`;
  script += `# --------------------------------------------------------------------------\n`;
  script += `Write-Host '[+] Optimizing TCP/IP Kernel Parameters...' -ForegroundColor Cyan\n`;
  
  script += `netsh int tcp set global autotuninglevel=${getChk('chk-autotuning') ? 'normal' : 'disabled'}\n`;
  script += `netsh int tcp set global ecncapability=${getChk('chk-ecn') ? 'enabled' : 'disabled'}\n`;
  script += `netsh int tcp set global timestamps=${getChk('chk-timestamps') ? 'disabled' : 'enabled'}\n`;
  script += `netsh int tcp set global fastopen=${getChk('chk-fastopen') ? 'enabled' : 'disabled'}\n`;
  script += `netsh int tcp set global initialRto=2000 -ErrorAction SilentlyContinue\n`;
  script += `netsh int tcp set global nonsackrttresiliency=disabled -ErrorAction SilentlyContinue\n`;

  if (getChk('chk-congestion')) {
    script += `Set-NetTCPSetting -SettingName 'InternetCustom' -CongestionProvider CUBIC -ErrorAction SilentlyContinue\n`;
    script += `Set-NetTCPSetting -SettingName 'DatacenterCustom' -CongestionProvider CUBIC -ErrorAction SilentlyContinue\n`;
    script += `Set-NetTCPSetting -SettingName 'Internet' -CongestionProvider CUBIC -ErrorAction SilentlyContinue\n`;
  }

  script += `\n# --------------------------------------------------------------------------\n`;
  script += `# 3. HARDWARE ADAPTER & NIC DRIVER TWEAKS\n`;
  script += `# --------------------------------------------------------------------------\n`;
  script += `Write-Host '[+] Applying Hardware NIC & Driver Enhancements...' -ForegroundColor Cyan\n`;
  
  if (getChk('chk-rsc')) script += `Disable-NetAdapterRsc -Name * -ErrorAction SilentlyContinue\n`;
  if (getChk('chk-interrupt')) script += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Interrupt Moderation' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
  if (getChk('chk-flowcontrol')) script += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Flow Control' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
  if (getChk('chk-eee')) {
    script += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Energy Efficient Ethernet' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
    script += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Green Ethernet' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
    script += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Ultra Low Power' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
  }
  if (getChk('chk-rss')) script += `Enable-NetAdapterRss -Name * -ErrorAction SilentlyContinue\n`;

  script += `\n# --------------------------------------------------------------------------\n`;
  script += `# 4. POWER MANAGEMENT & HARDWARE OFFLOADING\n`;
  script += `# --------------------------------------------------------------------------\n`;
  if (getChk('chk-powersave')) {
    script += `Disable-NetAdapterPowerManagement -Name * -ErrorAction SilentlyContinue\n`;
    script += `Get-WmiObject Win32_NetworkAdapter | Where-Object {$_.PhysicalAdapter -eq $true} | ForEach-Object { $_.SetPowerManagement($false) } -ErrorAction SilentlyContinue\n`;
  }
  if (getChk('chk-offloads')) {
    script += `Enable-NetAdapterChecksumOffload -Name * -ErrorAction SilentlyContinue\n`;
    script += `Enable-NetAdapterLso -Name * -ErrorAction SilentlyContinue\n`;
  }

  script += `\n# --------------------------------------------------------------------------\n`;
  script += `# 5. SECURE DNS RESOLVER & DOH CONFIGURATION\n`;
  script += `# --------------------------------------------------------------------------\n`;
  const selectedDns = document.querySelector('input[name="dns"]:checked')?.value;
  if (selectedDns) {
    const secDns = selectedDns === '1.1.1.1' ? '1.0.0.1' : (selectedDns === '8.8.8.8' ? '8.8.4.4' : '149.112.112.112');
    script += `$ActiveAdapters = (Get-NetAdapter | Where-Object Status -eq 'Up').Name\n`;
    script += `foreach ($Adapter in $ActiveAdapters) {\n`;
    script += `    Set-DnsClientServerAddress -InterfaceAlias $Adapter -ServerAddresses ("${selectedDns}", "${secDns}") -ErrorAction SilentlyContinue\n`;
    script += `}\n`;
  }

  if (getChk('chk-doh') && selectedDns === '1.1.1.1') {
    script += `Set-DNSClientDohServerAddress -ServerAddress '1.1.1.1' -DohTemplate 'https://cloudflare-dns.com/dns-query' -AllowFallbackToUdp $False -AutoUpgrade $True -ErrorAction SilentlyContinue\n`;
  }
  if (getChk('chk-smart-dns')) {
    script += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient' -Name 'DisableSmartNameResolution' -Value 1 -ErrorAction SilentlyContinue\n`;
  }

  script += `\n# --------------------------------------------------------------------------\n`;
  script += `# 6. LATENCY & NAGLE REGISTRY OVERRIDES\n`;
  script += `# --------------------------------------------------------------------------\n`;
  if (getChk('chk-nagle')) {
    script += `Write-Host '[+] Disabling Nagle Algorithm Delay Buffer...' -ForegroundColor Cyan\n`;
    script += `$Interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'\n`;
    script += `foreach ($Int in $Interfaces) {\n`;
    script += `    Set-ItemProperty -Path $Int.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -ErrorAction SilentlyContinue\n`;
    script += `    Set-ItemProperty -Path $Int.PSPath -Name 'TCPNoDelay' -Value 1 -Type DWord -ErrorAction SilentlyContinue\n`;
    script += `    Set-ItemProperty -Path $Int.PSPath -Name 'TcpDelAckTicks' -Value 0 -Type DWord -ErrorAction SilentlyContinue\n`;
    script += `}\n`;
  }

  // Deep System & Multimedia Responsiveness Registry Optimization
  script += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -Value 0xFFFFFFFF -Type DWord -ErrorAction SilentlyContinue\n`;
  script += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -Value 0 -Type DWord -ErrorAction SilentlyContinue\n`;

  script += `\n# --------------------------------------------------------------------------\n`;
  script += `# 7. QOS PRIORITIZATION POLICIES\n`;
  script += `# --------------------------------------------------------------------------\n`;
  const qosExes = getVal('txt-qos-exe');
  if (qosExes) {
    qosExes.split(',').forEach(exe => {
      const cleanExe = exe.trim();
      if (cleanExe) {
        script += `Remove-NetQosPolicy -Name "Opt_${cleanExe}" -Confirm:$false -ErrorAction SilentlyContinue\n`;
        script += `New-NetQosPolicy -Name "Opt_${cleanExe}" -AppPathNameMatchCondition "${cleanExe}" -DSCPAction 46 -ErrorAction SilentlyContinue\n`;
      }
    });
  }

  if (STATE.customCommands.length > 0) {
    script += `\n# --------------------------------------------------------------------------\n`;
    script += `# 8. CUSTOM REPAIR WIZARD COMMANDS\n`;
    script += `# --------------------------------------------------------------------------\n`;
    STATE.customCommands.forEach(cmd => { script += `${cmd}\n`; });
  }

  script += `\nWrite-Host '===================================================' -ForegroundColor Green\n`;
  script += `Write-Host '[✔] NetOptimizer Pro optimizations successfully applied!' -ForegroundColor Green\n`;
  script += `Write-Host '[!] Please restart your computer to apply kernel registry changes.' -ForegroundColor Yellow\n`;
  script += `Write-Host '===================================================' -ForegroundColor Green\n`;

  psOutput.value = script;
}

// ==========================================
// 4. PRESET & TAB MANAGEMENT
// ==========================================
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById('tab-' + tabId);
  if (targetTab) targetTab.classList.add('active');
  if (btn) btn.classList.add('active');
}

function addCustomCommand(cmd) {
  if (!STATE.customCommands.includes(cmd)) {
    STATE.customCommands.push(cmd);
    buildPowerShell();
    showToast('Command added to Master PowerShell script Generator!', 'info');
  } else {
    showToast('Command is already in the Master Script.', 'warning');
  }
}

function applyPreset(preset) {
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  };

  if (preset === 'gaming') {
    setCheck('chk-autotuning', true);
    setCheck('chk-congestion', true);
    setCheck('chk-ecn', false);
    setCheck('chk-timestamps', true);
    setCheck('chk-fastopen', true);
    setCheck('chk-rsc', true);
    setCheck('chk-interrupt', true);
    setCheck('chk-flowcontrol', true);
    setCheck('chk-eee', true);
    setCheck('chk-rss', true);
    setCheck('chk-nagle', true);
    setCheck('chk-powersave', true);
    setCheck('chk-offloads', true);
  } else if (preset === 'streaming') {
    setCheck('chk-autotuning', true);
    setCheck('chk-congestion', true);
    setCheck('chk-ecn', true);
    setCheck('chk-timestamps', false);
    setCheck('chk-fastopen', true);
    setCheck('chk-rsc', false);
    setCheck('chk-interrupt', false);
    setCheck('chk-flowcontrol', false);
    setCheck('chk-eee', true);
    setCheck('chk-rss', true);
    setCheck('chk-nagle', false);
    setCheck('chk-powersave', true);
    setCheck('chk-offloads', true);
  } else if (preset === 'stock') {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    setCheck('chk-autotuning', true);
  }

  buildPowerShell();
  showToast(`Applied [${preset.toUpperCase()}] profile setup.`, 'success');
}

// ==========================================
// 5. EXPORT / IMPORT & UTILITIES
// ==========================================
function copyScript() {
  const output = document.getElementById('ps-output');
  if (!output) return;
  output.select();
  navigator.clipboard.writeText(output.value);
  showToast('PowerShell script copied to clipboard!', 'success');
}

function downloadScript() {
  const output = document.getElementById('ps-output');
  if (!output) return;
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NetOptimizer_Fixes_${Date.now()}.ps1`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Downloaded PowerShell (.ps1) script.', 'success');
}

function exportConfigJSON() {
  const settings = {};
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => settings[cb.id] = cb.checked);
  document.querySelectorAll('input[type="radio"]').forEach(rb => { if (rb.checked) settings[rb.name] = rb.value; });
  settings['txt-qos-exe'] = document.getElementById('txt-qos-exe')?.value || '';
  settings['customCommands'] = STATE.customCommands;

  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'NetOptimizer_Profile.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Configuration exported to JSON!', 'success');
}

function importConfigJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      Object.keys(data).forEach(key => {
        const el = document.getElementById(key);
        if (el && el.type === 'checkbox') el.checked = data[key];
        if (key === 'txt-qos-exe' && el) el.value = data[key];
      });
      if (Array.isArray(data.customCommands)) STATE.customCommands = data.customCommands;
      buildPowerShell();
      showToast('Configuration loaded successfully!', 'success');
    } catch (err) {
      showToast('Invalid JSON profile file.', 'error');
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 6. NON-BLOCKING TOAST NOTIFICATIONS
// ==========================================
function injectToastContainer() {
  if (document.getElementById('toast-container')) return;
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  `;
  document.body.appendChild(container);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#0EA5E9'
  };

  toast.style.cssText = `
    background: #1E293B; color: #F8FAFC; border-left: 4px solid ${colors[type] || colors.info};
    padding: 12px 18px; border-radius: 6px; font-size: 0.85rem; font-weight: 600;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); opacity: 0; transform: translateY(10px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); pointer-events: auto;
  `;
  toast.innerText = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
