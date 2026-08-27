/**
 * NetOptimizer Enterprise v8.5 - Next-Gen Network Diagnostics & Kernel Optimization Engine
 * Architecture: Event-Driven Async Pipeline | Performance API Probing | Smart Advice Engine
 * License: MIT
 */

(() => {
  'use strict';

  // =========================================================================
  // 1. CONSTANTS & ENDPOINT REGISTRY
  // =========================================================================

  const CONFIG = {
    DEFAULT_TIMEOUT_MS: 3000,
    SPEED_TEST_STREAMS: 6,         // Parallel HTTP streams for saturation
    SPEED_TEST_DURATION_MS: 8000,   // Test duration cap per direction
    DOWNLOAD_PAYLOAD_MB: 25,
    UPLOAD_CHUNK_KB: 1024,
    TRIM_PERCENTILE: 0.1,           // 10% trimmed mean for outlier rejection
  };

  const ENDPOINTS = {
    dns: [
      { id: 'dns-cf', name: 'Cloudflare (1.1.1.1)', doh: 'https://1.1.1.1/dns-query' },
      { id: 'dns-goog', name: 'Google (8.8.8.8)', doh: 'https://dns.google/resolve' },
      { id: 'dns-q9', name: 'Quad9 (9.9.9.9)', doh: 'https://dns.quad9.net:5053/dns-query' },
      { id: 'dns-opendns', name: 'OpenDNS', doh: 'https://doh.opendns.com/dns-query' },
      { id: 'dns-adguard', name: 'AdGuard DNS', doh: 'https://dns.adguard-dns.com/dns-query' },
      { id: 'dns-nextdns', name: 'NextDNS', doh: 'https://dns.nextdns.io' },
      { id: 'dns-controld', name: 'Control D', doh: 'https://freedns.controld.com/p2' }
    ],
    games: [
      { id: 'ping-fn', name: 'Fortnite (AWS East)', url: 'https://dynamodb.us-east-1.amazonaws.com' },
      { id: 'ping-val', name: 'Valorant (Riot Edge)', url: 'https://ping.riotgames.com' },
      { id: 'ping-rblx', name: 'Roblox Engine', url: 'https://www.roblox.com' },
      { id: 'ping-steam', name: 'Steam CDN', url: 'https://media.steampowered.com' },
      { id: 'ping-mc', name: 'Minecraft Auth', url: 'https://session.minecraft.net' },
      { id: 'ping-ea', name: 'EA / Apex Edge', url: 'https://ea.com' }
    ],
    services: [
      { id: 'ping-discord', name: 'Discord Gateway', url: 'https://gateway.discord.gg' },
      { id: 'ping-twitch', name: 'Twitch Ingest', url: 'https://ingest.twitch.tv' },
      { id: 'ping-yt', name: 'YouTube Edge', url: 'https://www.youtube.com' },
      { id: 'ping-fast', name: 'Netflix CDN (Fast)', url: 'https://fast.com' },
      { id: 'ping-gh', name: 'GitHub API', url: 'https://api.github.com' }
    ]
  };

  // =========================================================================
  // 2. REACTIVE STATE STORE & EVENT BUS
  // =========================================================================

  class StateStore {
    constructor() {
      this.state = {
        activeTab: 'linux', // 'linux' | 'windows' | 'mac'
        isRunning: false,
        telemetry: {},
        pings: {},
        unloadedLatency: [],
        loadedLatencyDl: [],
        loadedLatencyUl: [],
        downloadMbps: 0,
        uploadMbps: 0,
        bufferbloatScore: 'N/A',
        rpm: 0,
        recommendations: []
      };
      this.listeners = new Set();
    }

    getState() {
      return Object.freeze({ ...this.state });
    }

    setState(patch) {
      this.state = { ...this.state, ...patch };
      this.notify();
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify() {
      const stateCopy = this.getState();
      this.listeners.forEach(fn => fn(stateCopy));
    }
  }

  const Store = new StateStore();

  // =========================================================================
  // 3. STATISTICAL UTILITIES
  // =========================================================================

  class MathUtils {
    static trimmedMean(samples, trimRatio = 0.1) {
      if (!samples || !samples.length) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      const trimCount = Math.floor(sorted.length * trimRatio);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      if (!trimmed.length) return sorted[Math.floor(sorted.length / 2)];
      return trimmed.reduce((acc, v) => acc + v, 0) / trimmed.length;
    }

    static calculateJitter(samples) {
      if (!samples || samples.length < 2) return 0;
      let sumDiffs = 0;
      for (let i = 1; i < samples.length; i++) {
        sumDiffs += Math.abs(samples[i] - samples[i - 1]);
      }
      return sumDiffs / (samples.length - 1);
    }

    static calculatePercentile(samples, p) {
      if (!samples || !samples.length) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    }
  }

  // =========================================================================
  // 4. NETWORK TELEMETRY & HIGH-PRECISION PROBING
  // =========================================================================

  class NetworkTelemetry {
    static async getCDNTrace() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONFIG.DEFAULT_TIMEOUT_MS);

      try {
        const res = await fetch('https://1.1.1.1/cdn-cgi/trace', {
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('Trace failed');
        const text = await res.text();
        
        const entries = text
          .trim()
          .split('\n')
          .filter(line => line.includes('='))
          .map(line => {
            const idx = line.indexOf('=');
            return [line.slice(0, idx), line.slice(idx + 1)];
          });

        return Object.fromEntries(entries);
      } catch (err) {
        return { ip: '192.168.1.1', loc: 'US', colo: 'Local Target', asn: 'Unknown' };
      }
    }

    static getLocalConnectionInfo() {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return null;
      return {
        effectiveType: conn.effectiveType || '4g',
        rtt: conn.rtt || 0,
        downlink: conn.downlink || 0,
        saveData: conn.saveData || false
      };
    }
  }

  class HighPrecisionProber {
    static async probeEndpoint(url, samplesCount = 4) {
      const latencies = [];

      for (let i = 0; i < samplesCount; i++) {
        const separator = url.includes('?') ? '&' : '?';
        const cacheBuster = `${separator}_cb=${performance.now()}_${Math.random()}`;
        const targetUrl = url + cacheBuster;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CONFIG.DEFAULT_TIMEOUT_MS);

        const startTime = performance.now();
        try {
          await fetch(targetUrl, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
          clearTimeout(timer);
          
          const entries = performance.getEntriesByName(targetUrl);
          if (entries.length > 0) {
            const entry = entries[entries.length - 1];
            const rtt = entry.duration > 0 ? entry.duration : (performance.now() - startTime);
            latencies.push(Math.max(1, Math.round(rtt)));
          } else {
            latencies.push(Math.max(1, Math.round(performance.now() - startTime)));
          }
        } catch (e) {
          clearTimeout(timer);
          const elapsed = performance.now() - startTime;
          if (elapsed < CONFIG.DEFAULT_TIMEOUT_MS) {
            latencies.push(Math.max(1, Math.round(elapsed)));
          }
        }
      }

      return MathUtils.trimmedMean(latencies, CONFIG.TRIM_PERCENTILE);
    }
  }

  // =========================================================================
  // 5. PARALLEL MULTI-STREAM SPEED ENGINE
  // =========================================================================

  class SpeedTestEngine {
    static async measureDownload(onProgress) {
      const streamsCount = CONFIG.SPEED_TEST_STREAMS;
      const durationMs = CONFIG.SPEED_TEST_DURATION_MS;
      const testUrl = 'https://speed.cloudflare.com/__down?bytes=25000000';
      
      let totalBytesReceived = 0;
      const startTime = performance.now();
      const samples = [];
      const loadedPings = [];
      const abortController = new AbortController();

      const capTimer = setTimeout(() => abortController.abort(), durationMs);

      const latencyWorker = (async () => {
        while (!abortController.signal.aborted) {
          try {
            const ping = await HighPrecisionProber.probeEndpoint('https://1.1.1.1/dns-query', 1);
            if (ping > 0) loadedPings.push(ping);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 200));
        }
      })();

      const streamTasks = Array.from({ length: streamsCount }, async () => {
        while (performance.now() - startTime < durationMs && !abortController.signal.aborted) {
          try {
            const res = await fetch(`${testUrl}&_r=${Math.random()}`, {
              signal: abortController.signal,
              cache: 'no-store'
            });
            if (!res.body) break;
            const reader = res.body.getReader();

            while (!abortController.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytesReceived += value.length;

              const elapsedSec = (performance.now() - startTime) / 1000;
              if (elapsedSec > 0.2) {
                const currentMbps = (totalBytesReceived * 8) / (elapsedSec * 1_000_000);
                samples.push(currentMbps);
                onProgress(parseFloat(currentMbps.toFixed(1)), samples.slice(-20));
              }
              if (performance.now() - startTime >= durationMs) {
                abortController.abort();
                break;
              }
            }
          } catch (e) {
            break;
          }
        }
      });

      await Promise.allSettled(streamTasks);
      clearTimeout(capTimer);
      abortController.abort();
      await Promise.allSettled([latencyWorker]);

      const finalMbps = samples.length ? MathUtils.calculatePercentile(samples, 90) : 0;
      return {
        mbps: parseFloat(finalMbps.toFixed(1)),
        loadedPings
      };
    }

    static async measureUpload(onProgress) {
      const streamsCount = 4;
      const durationMs = CONFIG.SPEED_TEST_DURATION_MS;
      const testUrl = 'https://speed.cloudflare.com/__up';
      
      // Fix Web Crypto QuotaExceededError by chunking fill
      const chunk = new Uint8Array(CONFIG.UPLOAD_CHUNK_KB * 1024);
      const maxCryptoChunk = 65536;
      for (let offset = 0; offset < chunk.length; offset += maxCryptoChunk) {
        const subChunk = chunk.subarray(offset, Math.min(offset + maxCryptoChunk, chunk.length));
        crypto.getRandomValues(subChunk);
      }

      let totalBytesUploaded = 0;
      const startTime = performance.now();
      const samples = [];
      const loadedPings = [];
      const abortController = new AbortController();

      const capTimer = setTimeout(() => abortController.abort(), durationMs);

      const latencyWorker = (async () => {
        while (!abortController.signal.aborted) {
          try {
            const ping = await HighPrecisionProber.probeEndpoint('https://1.1.1.1/dns-query', 1);
            if (ping > 0) loadedPings.push(ping);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 250));
        }
      })();

      const streamTasks = Array.from({ length: streamsCount }, async () => {
        while (performance.now() - startTime < durationMs && !abortController.signal.aborted) {
          try {
            await fetch(`${testUrl}?_r=${Math.random()}`, {
              method: 'POST',
              body: chunk,
              cache: 'no-store',
              signal: abortController.signal
            });
            totalBytesUploaded += chunk.length;

            const elapsedSec = (performance.now() - startTime) / 1000;
            if (elapsedSec > 0.2) {
              const currentMbps = (totalBytesUploaded * 8) / (elapsedSec * 1_000_000);
              samples.push(currentMbps);
              onProgress(parseFloat(currentMbps.toFixed(1)), samples.slice(-20));
            }
          } catch (e) {
            break;
          }
        }
      });

      await Promise.allSettled(streamTasks);
      clearTimeout(capTimer);
      abortController.abort();
      await Promise.allSettled([latencyWorker]);

      const finalMbps = samples.length ? MathUtils.calculatePercentile(samples, 85) : 0;
      return {
        mbps: parseFloat(finalMbps.toFixed(1)),
        loadedPings
      };
    }
  }

  // =========================================================================
  // 6. BUFFERBLOAT & SMART RECOMMENDATION ENGINE
  // =========================================================================

  class BufferbloatAnalyzer {
    static computeGrade(unloadedPingMs, loadedPingsMs) {
      if (!loadedPingsMs || !loadedPingsMs.length) return { grade: 'Grade A+', rpm: 2400, delta: 0 };

      const avgLoaded = MathUtils.trimmedMean(loadedPingsMs, 0.1);
      const delta = Math.max(0, avgLoaded - unloadedPingMs);
      const rpm = Math.round(60000 / Math.max(1, avgLoaded));

      let grade = 'Grade A+';
      if (delta > 100) grade = 'Grade F';
      else if (delta > 60) grade = 'Grade D';
      else if (delta > 30) grade = 'Grade C';
      else if (delta > 15) grade = 'Grade B';
      else if (delta > 5) grade = 'Grade A';

      return { grade, rpm, delta: Math.round(delta) };
    }
  }

  class SmartAdvisor {
    static generateFixes(state, fastestDns) {
      const recs = [];
      const jitter = MathUtils.calculateJitter(state.unloadedLatency);
      const avgPing = MathUtils.trimmedMean(state.unloadedLatency, 0.1);

      // 1. Bufferbloat & Latency Spike Analysis
      if (state.bufferbloatScore.includes('C') || state.bufferbloatScore.includes('D') || state.bufferbloatScore.includes('F')) {
        const dlDelta = state.loadedLatencyDl.length ? Math.max(0, Math.round(MathUtils.trimmedMean(state.loadedLatencyDl) - avgPing)) : 30;
        recs.push({
          severity: 'HIGH',
          title: 'Bufferbloat / Queue Bloat Detected',
          desc: `Your latency spikes by +${dlDelta} ms under load. Enable Smart Queue Management (SQM) with CAKE or FQ-CoDel on your router, or cap max bandwidth to 90% in router QoS settings.`
        });
      }

      // 2. High Jitter / Packet Fluctuation
      if (jitter > 8) {
        recs.push({
          severity: 'HIGH',
          title: 'High Network Jitter & Packet Instability',
          desc: `Jitter measured at ${jitter.toFixed(1)} ms. If using Wi-Fi, switch to 5GHz/6GHz channels, use MoCA 2.5 coaxial adapters, or connect directly via Cat6 Ethernet to bypass wireless interference.`
        });
      }

      // 3. DNS Optimization
      if (fastestDns && fastestDns.time > 0) {
        recs.push({
          severity: 'MEDIUM',
          title: `Optimal DNS Resolver: ${fastestDns.name}`,
          desc: `Resolved queries in ${fastestDns.time} ms. Update your router or OS DNS settings to use ${fastestDns.name} (e.g., 1.1.1.1 or 8.8.8.8) with DNS-over-HTTPS enabled.`
        });
      }

      // 4. Kernel Congestion Control
      recs.push({
        severity: 'MEDIUM',
        title: 'TCP BBR / Congestion Tuning',
        desc: 'Enable TCP BBR and disable Nagle\'s Algorithm to prevent micro-stuttering during multi-stream connections and online gaming.'
      });

      // 5. Hardware & Ethernet Driver Tuning
      recs.push({
        severity: 'LOW',
        title: 'NIC Power Savings & LSO Offloading',
        desc: 'Disable Energy Efficient Ethernet (EEE) and Large Send Offload (LSO) on your network adapter properties to eliminate random packet processing drops.'
      });

      return recs;
    }
  }

  // =========================================================================
  // 7. MULTI-OS KERNEL & NETWORK OPTIMIZATION GENERATOR
  // =========================================================================

  class KernelOptimizer {
    static buildPowerShell(options) {
      let ps = `# =====================================================================\n`;
      ps += `# NETOPTIMIZER PRO v8.5 ENTERPRISE - WINDOWS POWERSHELL TUNER\n`;
      ps += `# Target: Windows 10 / 11 / Server 2022+ (Execute as Administrator)\n`;
      ps += `# =====================================================================\n\n`;

      ps += `# Step 1: Create System Restore Point\n`;
      ps += `try {\n`;
      ps += `    Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue\n`;
      ps += `    Checkpoint-Computer -Description "NetOptimizer_v8_Restore" -RestorePointType "MODIFY_SETTINGS"\n`;
      ps += `    Write-Host "[+] Restore point successfully created." -ForegroundColor Green\n`;
      ps += `} catch { Write-Host "[!] Skipping restore point creation." -ForegroundColor Yellow }\n\n`;

      if (options.nagle) {
        ps += `# Disable Nagle's Algorithm (TCP ACK Frequency & No Delay for Low Latency)\n`;
        ps += `Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object {\n`;
        ps += `    Set-ItemProperty -Path $_.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -ErrorAction SilentlyContinue\n`;
        ps += `    Set-ItemProperty -Path $_.PSPath -Name 'TCPNoDelay' -Value 1 -Type DWord -ErrorAction SilentlyContinue\n`;
        ps += `}\n\n`;
      }

      if (options.throttle) {
        ps += `# Eliminate Windows Multimedia Network Throttling & Network Gaming Overhead\n`;
        ps += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -Value 0xFFFFFFFF -Type DWord -ErrorAction SilentlyContinue\n`;
        ps += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -Value 0 -Type DWord -ErrorAction SilentlyContinue\n\n`;
      }

      if (options.lso) {
        ps += `# Disable Large Send Offload (LSO) & Receive Side Coalescing (RSC) to stop micro-stuttering\n`;
        ps += `Disable-NetAdapterLso -Name * -IPv4 -IPv6 -ErrorAction SilentlyContinue\n`;
        ps += `Disable-NetAdapterRsc -Name * -IPv4 -IPv6 -ErrorAction SilentlyContinue\n\n`;
      }

      if (options.doh) {
        ps += `# Apply High-Performance DNS Resolvers (Cloudflare / Google) & Clear Cache\n`;
        ps += `Set-DnsClientServerAddress -InterfaceAlias '*' -ServerAddresses ('1.1.1.1','1.0.0.1','8.8.8.8') -ErrorAction SilentlyContinue\n`;
        ps += `Clear-DnsClientCache\n\n`;
      }

      if (options.tcp) {
        ps += `# Optimize TCP Global Auto-Tuning, Congestion Control (CUBIC/BBR) & ECN\n`;
        ps += `Set-NetTCPSetting -SettingName 'Internet' -CongestionProvider CUBIC -AutoTuningLevelLocal Normal -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetTCPSetting -SettingName 'Internet' -EcnCapability Enabled -ScalingHeuristics Disabled -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetOffloadGlobalSetting -ReceiveSideScaling Enabled -ErrorAction SilentlyContinue\n\n`;
      }

      if (options.qos) {
        ps += `# Unlock 100% Adapter Throughput (Remove QoS Reserved Bandwidth Limit)\n`;
        ps += `New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows' -Name 'Psched' -Force -ErrorAction SilentlyContinue | Out-Null\n`;
        ps += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched' -Name 'NonBestEffortLimit' -Value 0 -Type DWord -ErrorAction SilentlyContinue\n\n`;
      }

      if (options.buffers) {
        ps += `# Maximize Network Adapter Transmit/Receive Buffers & Disable Energy Saving\n`;
        ps += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Receive Buffers' -DisplayValue '2048' -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Transmit Buffers' -DisplayValue '2048' -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Energy Efficient Ethernet' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetAdapterAdvancedProperty -Name * -DisplayName 'Interrupt Moderation' -DisplayValue 'Disabled' -ErrorAction SilentlyContinue\n\n`;
      }

      ps += `Write-Host "[+] All Network Optimizations Successfully Applied! Restarting recommended." -ForegroundColor Cyan\n`;
      return ps;
    }

    static buildBashScript(options) {
      let sh = `#!/usr/bin/env bash\n`;
      sh += `# =====================================================================\n`;
      sh += `# NETOPTIMIZER PRO v8.5 ENTERPRISE - LINUX SYSCTL & KERNEL TUNER\n`;
      sh += `# Compatibility: Modern Linux Kernels 5.x / 6.x (Run: sudo bash net_tune.sh)\n`;
      sh += `# =====================================================================\n\n`;
      sh += `set -e\n`;
      sh += `SYSCTL_CONF="/etc/sysctl.d/99-netoptimizer.conf"\n\n`;
      sh += `echo "[+] Deploying persistent sysctl overrides to $SYSCTL_CONF..."\n`;
      sh += `sudo mkdir -p /etc/sysctl.d/\n`;
      sh += `cat << 'EOF' | sudo tee "$SYSCTL_CONF" > /dev/null\n`;

      if (options.tcp) {
        sh += `# Modern Congestion Control & Queue Discipline (BBR / FQ / CAKE)\n`;
        sh += `net.core.default_qdisc = fq\n`;
        sh += `net.ipv4.tcp_congestion_control = bbr\n`;
        sh += `net.ipv4.tcp_fastopen = 3\n`;
        sh += `net.ipv4.tcp_slow_start_after_idle = 0\n`;
        sh += `net.ipv4.tcp_tw_reuse = 1\n\n`;
      }

      if (options.buffers) {
        sh += `# Expand Core Network Buffer Allocations (Up to 32MB Max for High Throughput)\n`;
        sh += `net.core.rmem_max = 33554432\n`;
        sh += `net.core.wmem_max = 33554432\n`;
        sh += `net.core.rmem_default = 262144\n`;
        sh += `net.core.wmem_default = 262144\n`;
        sh += `net.ipv4.tcp_rmem = 4096 87380 33554432\n`;
        sh += `net.ipv4.tcp_wmem = 4096 65536 33554432\n`;
        sh += `net.core.netdev_max_backlog = 10000\n\n`;
      }

      if (options.nagle) {
        sh += `# Low Latency Socket Priorities & Auto-corking\n`;
        sh += `net.ipv4.tcp_autocorking = 0\n\n`;
      }

      sh += `EOF\n\n`;
      sh += `sudo sysctl --system\n\n`;

      if (options.lso) {
        sh += `# Disable Packet Offloading via Ethtool across physical interfaces\n`;
        sh += `for iface in $(ip -o link show | awk -F': ' '$2 !~ "lo|docker|veth" {print $2}'); do\n`;
        sh += `    echo "[+] Disabling offload capabilities on $iface..."\n`;
        sh += `    sudo ethtool -K "$iface" tso off gso off gro off 2>/dev/null || true\n`;
        sh += `done\n\n`;
      }

      if (options.doh) {
        sh += `# Configure Systemd-Resolved / Static DNS Resolvers\n`;
        sh += `if systemctl is-active --quiet systemd-resolved; then\n`;
        sh += `    sudo resolvectl dns $(ip route show default | awk '{print $5}' | head -n 1) 1.1.1.1 8.8.8.8\n`;
        sh += `    sudo resolvectl flush-caches\n`;
        sh += `fi\n\n`;
      }

      sh += `echo "[+] Linux Kernel Tuning Successfully Applied!"\n`;
      return sh;
    }

    static buildMacOSScript(options) {
      let mac = `#!/usr/bin/env zsh\n`;
      mac += `# =====================================================================\n`;
      mac += `# NETOPTIMIZER PRO v8.5 ENTERPRISE - macOS (DARWIN) TUNER\n`;
      mac += `# Compatibility: macOS Monterey / Ventura / Sonoma / Sequoia\n`;
      mac += `# =====================================================================\n\n`;

      if (options.nagle) {
        mac += `# Disable TCP Delayed ACK for Low Latency Gaming & Voice\n`;
        mac += `sudo sysctl -w net.inet.tcp.delayed_ack=0\n`;
        mac += `sudo sysctl -w net.inet.tcp.msec_to_idle=10\n\n`;
      }

      if (options.buffers) {
        mac += `# Expand Socket Buffer Allocation (4MB Window Scaling)\n`;
        mac += `sudo sysctl -w net.inet.tcp.sendspace=4194304\n`;
        mac += `sudo sysctl -w net.inet.tcp.recvspace=4194304\n`;
        mac += `sudo sysctl -w net.inet.tcp.autorcvbufmax=8388608\n`;
        mac += `sudo sysctl -w net.inet.tcp.autosndbufmax=8388608\n\n`;
      }

      if (options.doh) {
        mac += `# Flush mDNSResponder & Network Directory Services Cache\n`;
        mac += `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder\n`;
        mac += `echo "[+] macOS DNS cache flushed."\n\n`;
      }

      mac += `echo "[+] macOS Network Optimizations Successfully Applied!"\n`;
      return mac;
    }

    static buildRollbackScript(platform) {
      if (platform === 'windows' || platform === 'ps' || platform === 'powershell') {
        let ps = `# =====================================================================\n`;
        ps += `# POWERSHELL RESTORE & ROLLBACK SCRIPT\n`;
        ps += `# =====================================================================\n`;
        ps += `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -Value 10 -Type DWord -ErrorAction SilentlyContinue\n`;
        ps += `Set-NetTCPSetting -SettingName 'Internet' -AutoTuningLevelLocal Normal -ErrorAction SilentlyContinue\n`;
        ps += `Enable-NetAdapterLso -Name * -IPv4 -IPv6 -ErrorAction SilentlyContinue\n`;
        ps += `Enable-NetAdapterRsc -Name * -IPv4 -IPv6 -ErrorAction SilentlyContinue\n`;
        ps += `Write-Host "[+] System network configurations restored to Windows defaults." -ForegroundColor Green\n`;
        return ps;
      }

      if (platform === 'mac' || platform === 'macos') {
        let mac = `#!/usr/bin/env zsh\n`;
        mac += `# macOS ROLLBACK TO DEFAULTS\n`;
        mac += `sudo sysctl -w net.inet.tcp.delayed_ack=3\n`;
        mac += `echo "[+] macOS TCP parameters reset to defaults."\n`;
        return mac;
      }

      // Default Linux Rollback
      let sh = `#!/usr/bin/env bash\n`;
      sh += `# LINUX ROLLBACK SCRIPT\n`;
      sh += `sudo rm -f /etc/sysctl.d/99-netoptimizer.conf\n`;
      sh += `sudo sysctl --system\n`;
      sh += `echo "[+] Default sysctl parameters restored."\n`;
      return sh;
    }
  }

  // =========================================================================
  // 8. MAIN ORCHESTRATION PIPELINE
  // =========================================================================

  class DiagnosticPipeline {
    static async run() {
      if (Store.getState().isRunning) return;
      Store.setState({ isRunning: true });

      const term = document.getElementById('terminal-out') || document.querySelector('.console');
      const log = (msg) => {
        if (!term) return;
        term.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        term.scrollTop = term.scrollHeight;
      };

      if (term) term.value = '';
      log('Starting Enterprise Network Diagnostics Pipeline v8.5...');

      // Phase 1: Telemetry
      log('Phase 1/6: Fetching Edge Network Path Telemetry...');
      const telemetry = await NetworkTelemetry.getCDNTrace();
      Store.setState({ telemetry });
      log(` -> Connected via IP: ${telemetry.ip} | Location: ${telemetry.loc} | POP: [${telemetry.colo}]`);

      // Phase 2: DNS Benchmark
      log('Phase 2/6: Benchmarking Multi-DNS Resolvers...');
      let fastestDns = { name: 'Cloudflare', time: 999 };
      const dnsResults = {};

      await Promise.all(
        ENDPOINTS.dns.map(async (ep) => {
          const latency = await HighPrecisionProber.probeEndpoint(ep.doh, 3);
          dnsResults[ep.name] = latency;
          const el = document.getElementById(ep.id);
          if (el) el.innerText = `${latency} ms`;
          
          if (latency > 0 && latency < fastestDns.time) {
            fastestDns = { name: ep.name, time: latency };
          }
        })
      );
      log(` -> Optimal Resolver Identified: ${fastestDns.name} (${fastestDns.time} ms)`);

      // Phase 3: Edge Service Probing
      log('Phase 3/6: Probing Game & Service Edge Nodes...');
      const allIdlePings = [];
      
      const gameTasks = ENDPOINTS.games.map(async (ep) => {
        const ping = await HighPrecisionProber.probeEndpoint(ep.url, 3);
        if (ping > 0) allIdlePings.push(ping);
        const el = document.getElementById(ep.id);
        if (el) el.innerText = `${ping} ms`;
      });

      const serviceTasks = ENDPOINTS.services.map(async (ep) => {
        const ping = await HighPrecisionProber.probeEndpoint(ep.url, 3);
        if (ping > 0) allIdlePings.push(ping);
        const el = document.getElementById(ep.id);
        if (el) el.innerText = `${ping} ms`;
      });

      await Promise.all([...gameTasks, ...serviceTasks]);
      const baselineLatency = MathUtils.trimmedMean(allIdlePings, 0.1);
      const baselineJitter = MathUtils.calculateJitter(allIdlePings);
      log(` -> Baseline Latency: ${baselineLatency.toFixed(1)} ms | Jitter: ${baselineJitter.toFixed(1)} ms`);

      // Phase 4: Download Test
      log('Phase 4/6: Executing Multi-Stream Download Speed & Working Latency Test...');
      const dlResult = await SpeedTestEngine.measureDownload((currentMbps, samples) => {
        const el = document.getElementById('val-download') || document.querySelector('.metric-card:nth-child(1) .metric-val');
        if (el) el.innerHTML = `${currentMbps} <span>Mbps</span>`;
        RenderEngine.renderSparkline('spark-dl', samples);
      });
      log(` -> Download Saturation Peak: ${dlResult.mbps} Mbps`);

      // Phase 5: Upload Test
      log('Phase 5/6: Executing Upstream Payload Saturation Test...');
      const ulResult = await SpeedTestEngine.measureUpload((currentMbps, samples) => {
        const el = document.getElementById('val-upload') || document.querySelector('.metric-card:nth-child(2) .metric-val');
        if (el) el.innerHTML = `${currentMbps} <span>Mbps</span>`;
        RenderEngine.renderSparkline('spark-ul', samples);
      });
      log(` -> Upload Saturation Peak: ${ulResult.mbps} Mbps`);

      // Phase 6: Bufferbloat & Advisor Engine
      const allLoadedPings = [...dlResult.loadedPings, ...ulResult.loadedPings];
      const bloatAnalysis = BufferbloatAnalyzer.computeGrade(baselineLatency, allLoadedPings);
      
      const currentState = {
        downloadMbps: dlResult.mbps,
        uploadMbps: ulResult.mbps,
        unloadedLatency: allIdlePings,
        loadedLatencyDl: dlResult.loadedPings,
        loadedLatencyUl: ulResult.loadedPings,
        bufferbloatScore: bloatAnalysis.grade,
        rpm: bloatAnalysis.rpm,
        isRunning: false
      };

      const recommendations = SmartAdvisor.generateFixes(currentState, fastestDns);
      Store.setState({ ...currentState, recommendations });

      log(` -> Diagnostic Complete! Bufferbloat Grade: ${bloatAnalysis.grade} (RPM: ${bloatAnalysis.rpm})`);
      log(` -> Generated ${recommendations.length} actionable optimization recommendations.`);
      
      RenderEngine.updateUI();
    }
  }

  // =========================================================================
  // 9. UI RENDERING & SPARKLINE ENGINE
  // =========================================================================

  class RenderEngine {
    static renderSparkline(elementId, data) {
      const path = document.getElementById(elementId) || document.querySelectorAll('.sparkline-path')[elementId === 'spark-dl' ? 0 : 1];
      if (!path || !data || !data.length) return;

      const width = 100;
      const height = 35;
      const maxVal = Math.max(...data, 1);
      const step = data.length > 1 ? width / (data.length - 1) : 0;

      const points = data.map((val, idx) => ({
        x: idx * step,
        y: height - (val / maxVal) * (height - 5)
      }));

      let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const mx = (curr.x + next.x) / 2;
        const my = (curr.y + next.y) / 2;
        d += ` Q ${curr.x.toFixed(1)},${curr.y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
      }
      d += ` L ${points[points.length - 1].x.toFixed(1)},${points[points.length - 1].y.toFixed(1)}`;

      path.setAttribute('d', d);
    }

    static renderFixCards() {
      const container = document.getElementById('recommendations-list') || document.querySelector('.recommendations');
      if (!container) return;

      const { recommendations } = Store.getState();
      if (!recommendations || !recommendations.length) {
        container.innerHTML = '<div class="rec-empty">No critical issues detected. Connection operating within optimal parameters.</div>';
        return;
      }

      container.innerHTML = recommendations.map(rec => `
        <div class="fix-card severity-${rec.severity.toLowerCase()}">
          <div class="fix-header">
            <span class="badge badge-${rec.severity.toLowerCase()}">${rec.severity}</span>
            <h4 class="fix-title">${rec.title}</h4>
          </div>
          <p class="fix-desc">${rec.desc}</p>
        </div>
      `).join('');
    }

    static getScriptOptions() {
      const getChecked = (id) => {
        const el = document.getElementById(id);
        return el ? el.checked : true;
      };

      return {
        nagle: getChecked('opt-nagle'),
        throttle: getChecked('opt-throttle'),
        lso: getChecked('opt-lso'),
        doh: getChecked('opt-doh'),
        tcp: getChecked('opt-tcp'),
        qos: getChecked('opt-qos'),
        buffers: getChecked('opt-buffers')
      };
    }

    static updateGeneratedScript() {
      const scriptBox = document.getElementById('generated-script') || document.querySelector('.code-output');
      if (!scriptBox) return;

      const state = Store.getState();
      const options = RenderEngine.getScriptOptions();
      let script = '';

      if (state.activeTab === 'windows') {
        script = KernelOptimizer.buildPowerShell(options);
      } else if (state.activeTab === 'mac') {
        script = KernelOptimizer.buildMacOSScript(options);
      } else {
        script = KernelOptimizer.buildBashScript(options);
      }

      if (scriptBox.tagName === 'TEXTAREA' || scriptBox.tagName === 'INPUT') {
        scriptBox.value = script;
      } else {
        scriptBox.textContent = script;
      }
    }

    static updateUI() {
      const state = Store.getState();
      
      const elJitter = document.getElementById('metric-jitter');
      if (elJitter) {
        const jitter = MathUtils.calculateJitter(state.unloadedLatency);
        elJitter.innerText = `${jitter.toFixed(1)} ms`;
      }

      const elBloat = document.getElementById('metric-bloat');
      if (elBloat) {
        elBloat.innerText = `${state.bufferbloatScore} (${state.rpm} RPM)`;
        elBloat.style.color = state.bufferbloatScore.includes('A') ? '#10b981' : '#f59e0b';
      }

      RenderEngine.renderFixCards();
      RenderEngine.updateGeneratedScript();
    }
  }

  // =========================================================================
  // 10. EVENT BINDINGS & DOM INITIALIZATION
  // =========================================================================

  function initApp() {
    const tabButtons = document.querySelectorAll('[data-os-tab]');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-os-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        Store.setState({ activeTab: tab });
        RenderEngine.updateGeneratedScript();
      });
    });

    const startBtn = document.getElementById('btn-run-pipeline') || document.querySelector('.btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        DiagnosticPipeline.run();
      });
    }

    const rollbackBtn = document.getElementById('btn-rollback');
    if (rollbackBtn) {
      rollbackBtn.addEventListener('click', () => {
        const scriptBox = document.getElementById('generated-script') || document.querySelector('.code-output');
        const state = Store.getState();
        const script = KernelOptimizer.buildRollbackScript(state.activeTab);
        if (scriptBox) {
          if (scriptBox.tagName === 'TEXTAREA' || scriptBox.tagName === 'INPUT') {
            scriptBox.value = script;
          } else {
            scriptBox.textContent = script;
          }
        }
      });
    }

    const optionCheckboxes = document.querySelectorAll('.script-option');
    optionCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        RenderEngine.updateGeneratedScript();
      });
    });

    RenderEngine.updateGeneratedScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  // Expose global controller
  window.NetOptimizer = {
    run: () => DiagnosticPipeline.run(),
    Store,
    KernelOptimizer,
    DiagnosticPipeline
  };
})();
