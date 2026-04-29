(function() {
  'use strict';

  const BACKEND = document.currentScript?.src?.split('/widget.js')[0] || 'https://tree-monkey-production.up.railway.app';
  const cfg = {
    color:   document.currentScript?.getAttribute('data-primary-color') || '#2d5a1b',
    accent:  document.currentScript?.getAttribute('data-accent-color')  || '#4a8a2a',
    name:    document.currentScript?.getAttribute('data-business-name') || 'Tree Monkey Tree Care',
    phone:   document.currentScript?.getAttribute('data-phone')         || '01442 733249',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let sessionId    = sessionStorage.getItem('tree_monkey_session') || null;
  let isOpen       = false;
  let isTyping     = false;
  let camStream    = null;
  let camMode      = null;      // 'quick' | 'scan'
  let scanCaptures = [];        // [{ dataUrl, base64, mediaType }, ...]
  let quickCapture = null;      // { dataUrl, base64, mediaType }
  let scanStep     = 0;         // 0=crown, 1=trunk, 2=base

  const SCAN_STEPS = [
    { label: 'STEP 1 OF 3', text: 'Point at the crown',   sub: 'Canopy and top branches',      arrow: '↑' },
    { label: 'STEP 2 OF 3', text: 'Point at the trunk',   sub: 'Main stem at mid-height',       arrow: '↔' },
    { label: 'STEP 3 OF 3', text: 'Point at the base',    sub: 'Root zone and ground level',    arrow: '↓' },
  ];

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
    #kdk-widget-btn {
      position:fixed; bottom:24px; right:24px; z-index:999999;
      width:60px; height:60px; border-radius:50%;
      background:${cfg.color}; border:none; cursor:pointer;
      box-shadow:0 4px 16px rgba(0,0,0,0.25);
      display:flex; align-items:center; justify-content:center;
      transition:transform 0.2s, box-shadow 0.2s;
    }
    #kdk-widget-btn:hover { transform:scale(1.08); box-shadow:0 6px 22px rgba(0,0,0,0.3); }
    #kdk-widget-btn svg { width:28px; height:28px; fill:#fff; transition:transform 0.2s; }
    #kdk-widget-btn.open svg { transform:rotate(45deg); }
    #kdk-widget-badge {
      position:absolute; top:-4px; right:-4px;
      width:18px; height:18px; border-radius:50%;
      background:${cfg.accent}; border:2px solid #fff;
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:700; color:${cfg.color};
    }
    #kdk-widget-panel {
      position:fixed; bottom:96px; right:24px; z-index:999998;
      width:360px; height:560px; border-radius:16px;
      background:#fff; box-shadow:0 8px 40px rgba(0,0,0,0.18);
      display:flex; flex-direction:column; overflow:hidden;
      transform:scale(0.85) translateY(20px); transform-origin:bottom right;
      opacity:0; pointer-events:none;
      transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #kdk-widget-panel.open { transform:scale(1) translateY(0); opacity:1; pointer-events:all; }
    @media(max-width:480px){
      #kdk-widget-panel { width:calc(100vw - 16px); right:8px; bottom:88px; height:75vh; }
      #kdk-widget-btn  { bottom:16px; right:16px; }
    }
    .kdk-header { background:${cfg.color}; padding:14px 16px; display:flex; align-items:center; gap:10px; flex-shrink:0; }
    .kdk-header-info p { color:rgba(255,255,255,0.8); font-size:12px; margin:0; }
    .kdk-online { width:8px; height:8px; border-radius:50%; background:#4ade80; margin-left:auto; box-shadow:0 0 0 2px rgba(74,222,128,0.3); flex-shrink:0; }
    .kdk-messages { flex:1; overflow-y:auto; padding:14px 12px; display:flex; flex-direction:column; gap:8px; background:#f8f9fa; }
    .kdk-messages::-webkit-scrollbar { width:3px; }
    .kdk-messages::-webkit-scrollbar-thumb { background:#ddd; border-radius:2px; }
    .kdk-msg { display:flex; gap:7px; align-items:flex-end; max-width:92%; animation:kdkFade .2s ease; }
    .kdk-msg.bot { align-self:flex-start; }
    .kdk-msg.user { align-self:flex-end; flex-direction:row-reverse; }
    .kdk-msg-av { width:26px; height:26px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; }
    .bot .kdk-msg-av { background:${cfg.color}; color:${cfg.accent}; }
    .user .kdk-msg-av { background:${cfg.accent}; color:${cfg.color}; }
    .kdk-bubble { padding:9px 12px; border-radius:14px; font-size:13px; line-height:1.55; color:#1a1a1a; }
    .bot .kdk-bubble { background:#fff; border:1px solid #e8e8e8; border-bottom-left-radius:3px; }
    .user .kdk-bubble { background:${cfg.color}; color:#fff; border-bottom-right-radius:3px; }
    .kdk-photo-preview { max-width:200px; max-height:150px; border-radius:10px; display:block; object-fit:cover; }
    .kdk-quick-replies { display:flex; flex-wrap:wrap; gap:5px; padding:6px 12px 2px; flex-shrink:0; background:#f8f9fa; }
    .kdk-qr { font-size:12px; padding:5px 11px; border-radius:20px; border:1px solid ${cfg.color}; background:transparent; color:${cfg.color}; cursor:pointer; font-weight:500; font-family:inherit; transition:all .15s; }
    .kdk-qr:hover { background:${cfg.color}; color:#fff; }
    .kdk-input-row { display:flex; gap:6px; padding:10px 12px; background:#fff; border-top:1px solid #f0f0f0; flex-shrink:0; align-items:center; }
    .kdk-photo-btn { width:36px; height:36px; border-radius:50%; flex-shrink:0; background:#f0f7eb; border:1.5px solid #c8e6c9; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; }
    .kdk-photo-btn:hover { background:#c8e6c9; }
    .kdk-photo-btn svg { width:17px; height:17px; fill:${cfg.color}; }
    .kdk-input { flex:1; font-size:13px; padding:9px 12px; border-radius:20px; border:1px solid #e0e0e0; outline:none; font-family:inherit; background:#f8f9fa; color:#1a1a1a; transition:border-color .15s; }
    .kdk-input:focus { border-color:${cfg.color}; background:#fff; }
    .kdk-input::placeholder { color:#aaa; }
    .kdk-send { width:36px; height:36px; border-radius:50%; background:${cfg.color}; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
    .kdk-send:hover { background:#1a3d10; }
    .kdk-send svg { width:15px; height:15px; fill:#fff; }
    .kdk-footer { text-align:center; padding:6px; font-size:10px; color:#bbb; background:#fff; flex-shrink:0; border-top:1px solid #f5f5f5; }
    .kdk-typing-dots { display:flex; gap:3px; padding:2px; }
    .kdk-typing-dots span { width:5px; height:5px; border-radius:50%; background:#ccc; animation:kdkBounce 1.2s infinite; }
    .kdk-typing-dots span:nth-child(2) { animation-delay:.2s; }
    .kdk-typing-dots span:nth-child(3) { animation-delay:.4s; }
    .kdk-cta-bar { display:flex; gap:6px; padding:8px 12px 4px; flex-shrink:0; background:#f8f9fa; }
    .kdk-cta { flex:1; padding:7px 6px; border-radius:8px; border:none; font-size:11.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:opacity .15s; text-align:center; }
    .kdk-cta:hover { opacity:.88; }
    .kdk-cta-book { background:${cfg.accent}; color:#fff; }
    .kdk-cta-call { background:${cfg.color}; color:#fff; }

    /* ── Camera Modal ─────────────────────────────────────────────────────── */
    #kdk-camera-modal {
      position:fixed; inset:0; z-index:9999999;
      background:#000; display:none; flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      -webkit-user-select:none; user-select:none;
    }
    .kdk-cam-topbar {
      position:absolute; top:0; left:0; right:0; z-index:10;
      display:flex; align-items:center; justify-content:space-between;
      padding:env(safe-area-inset-top, 12px) 16px 12px;
      padding-top:max(env(safe-area-inset-top, 0px), 12px);
      background:linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%);
    }
    .kdk-cam-topbar button {
      color:#fff; background:rgba(255,255,255,0.2); border:none;
      border-radius:20px; padding:7px 14px; font-size:13px;
      cursor:pointer; font-family:inherit; font-weight:600;
      backdrop-filter:blur(4px); transition:background .15s;
    }
    .kdk-cam-topbar button:hover { background:rgba(255,255,255,0.32); }
    #kdk-cam-title { color:#fff; font-size:15px; font-weight:700; letter-spacing:0.3px; }
    .kdk-cam-viewport {
      flex:1; position:relative; overflow:hidden; background:#111;
      display:flex; align-items:center; justify-content:center;
    }
    #kdk-cam-video { width:100%; height:100%; object-fit:cover; display:block; }
    #kdk-cam-canvas { display:none; }
    #kdk-cam-preview-img {
      position:absolute; inset:0; width:100%; height:100%;
      object-fit:cover; display:none;
    }
    #kdk-cam-flash {
      position:absolute; inset:0; background:#fff;
      pointer-events:none; display:none; z-index:5;
    }
    #kdk-cam-guide {
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      text-align:center; pointer-events:none; display:none; z-index:4;
    }
    #kdk-cam-arrow {
      font-size:52px; color:#8bc34a; display:block; margin-bottom:10px;
      text-shadow:0 2px 12px rgba(0,0,0,0.6);
      animation:kdkArrowBounce 1.1s ease-in-out infinite;
    }
    #kdk-cam-guide-main {
      background:rgba(0,0,0,0.68); color:#fff; font-size:19px; font-weight:700;
      padding:9px 22px; border-radius:30px; margin-bottom:7px;
      backdrop-filter:blur(6px); display:inline-block;
    }
    #kdk-cam-guide-sub {
      background:rgba(0,0,0,0.52); color:rgba(255,255,255,0.88); font-size:13px;
      padding:5px 16px; border-radius:20px; backdrop-filter:blur(4px);
      display:inline-block;
    }
    #kdk-cam-scan-frame {
      position:absolute; inset:10%; border:2px solid rgba(139,195,74,0.6);
      border-radius:16px; pointer-events:none; display:none; z-index:3;
      box-shadow:0 0 0 9999px rgba(0,0,0,0.25);
    }
    #kdk-cam-thumbs {
      display:none; flex-shrink:0;
      background:rgba(0,0,0,0.88); padding:10px 16px;
      gap:10px; justify-content:center; align-items:center;
    }
    .kdk-cam-thumb {
      width:68px; height:68px; border-radius:10px; background:#1a1a1a;
      border:2px solid #333; overflow:hidden; position:relative;
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; flex-shrink:0; transition:border-color .2s;
    }
    .kdk-cam-thumb-lbl {
      font-size:10px; color:#666; font-family:inherit; font-weight:600;
    }
    .kdk-cam-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    .kdk-cam-thumb-tag {
      position:absolute; bottom:0; left:0; right:0;
      background:rgba(0,0,0,0.65); color:#fff; font-size:9px;
      text-align:center; padding:2px 0; font-weight:600;
    }
    .kdk-cam-thumb-check {
      position:absolute; top:4px; right:4px; width:16px; height:16px;
      background:#8bc34a; border-radius:50%; display:flex;
      align-items:center; justify-content:center; font-size:9px; color:#fff;
      font-weight:900;
    }
    .kdk-cam-thumb.done { border-color:#8bc34a; }
    .kdk-cam-controls {
      background:rgba(5,5,5,0.96); padding:16px 16px 20px;
      flex-shrink:0; backdrop-filter:blur(8px);
    }
    #kdk-cam-step-counter {
      color:rgba(255,255,255,0.55); font-size:11px; letter-spacing:1.5px;
      text-transform:uppercase; text-align:center; margin-bottom:12px;
      font-weight:600; display:none;
    }
    #kdk-cam-panel-mode { display:flex; flex-direction:column; gap:10px; }
    .kdk-cam-panel-hint {
      color:rgba(255,255,255,0.5); text-align:center;
      font-size:12px; margin:0 0 4px;
    }
    .kdk-cam-mode-btn {
      display:flex; flex-direction:column; align-items:flex-start;
      background:#111; border:1.5px solid #2a2a2a; border-radius:12px;
      padding:14px 16px; cursor:pointer; font-family:inherit;
      color:#fff; font-size:15px; font-weight:700; gap:3px;
      transition:border-color .15s, background .15s; width:100%; text-align:left;
    }
    .kdk-cam-mode-btn span { font-size:12px; font-weight:400; color:rgba(255,255,255,0.5); }
    .kdk-cam-mode-btn:hover { border-color:#444; background:#1a1a1a; }
    .kdk-cam-mode-featured { border-color:#8bc34a !important; background:rgba(139,195,74,0.08) !important; }
    .kdk-cam-mode-featured:hover { background:rgba(139,195,74,0.16) !important; }
    #kdk-cam-panel-shutter { display:none; justify-content:center; align-items:center; padding:4px 0; }
    #kdk-cam-shutter {
      width:74px; height:74px; border-radius:50%;
      background:transparent; border:4px solid #fff; cursor:pointer;
      position:relative; transition:transform .1s; flex-shrink:0;
    }
    #kdk-cam-shutter::after {
      content:''; position:absolute; inset:6px; border-radius:50%; background:#fff; transition:background .1s;
    }
    #kdk-cam-shutter:active { transform:scale(0.9); }
    #kdk-cam-shutter:active::after { background:#ccc; }
    #kdk-cam-panel-preview { display:none; gap:10px; }
    #kdk-cam-panel-done { display:none; }
    .kdk-cam-btn-sec {
      flex:1; padding:13px; border-radius:10px; border:1.5px solid #333;
      background:transparent; color:#fff; font-size:14px; font-weight:600;
      font-family:inherit; cursor:pointer; transition:border-color .15s;
    }
    .kdk-cam-btn-sec:hover { border-color:#555; }
    .kdk-cam-btn-pri {
      flex:2; padding:13px; border-radius:10px; border:none;
      background:${cfg.color}; color:#fff; font-size:14px; font-weight:700;
      font-family:inherit; cursor:pointer; transition:background .15s;
      text-align:center;
    }
    .kdk-cam-btn-pri:hover { background:#1a3d10; }
    .kdk-cam-btn-full { flex:1; width:100%; }

    @keyframes kdkFade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
    @keyframes kdkBounce { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-4px);opacity:1} }
    @keyframes kdkArrowBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
    @keyframes camFlash { 0%{opacity:0} 25%{opacity:0.9} 100%{opacity:0} }
  `;

  // ── DOM Build ─────────────────────────────────────────────────────────────
  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Launcher button
    const btn = document.createElement('button');
    btn.id = 'kdk-widget-btn';
    btn.setAttribute('aria-label', 'Chat with Tree Monkey Tree Care');
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg><div id="kdk-widget-badge">1</div>`;
    document.body.appendChild(btn);

    // File input fallback
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'kdk-photo-input';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Camera modal
    const modal = document.createElement('div');
    modal.id = 'kdk-camera-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Tree camera scanner');
    modal.innerHTML = `
      <div class="kdk-cam-topbar">
        <button id="kdk-cam-back">← Back</button>
        <span id="kdk-cam-title">Tree Scanner</span>
        <button id="kdk-cam-close">✕ Close</button>
      </div>
      <div class="kdk-cam-viewport">
        <video id="kdk-cam-video" autoplay playsinline muted></video>
        <canvas id="kdk-cam-canvas"></canvas>
        <img id="kdk-cam-preview-img" alt="Captured tree">
        <div id="kdk-cam-flash"></div>
        <div id="kdk-cam-scan-frame"></div>
        <div id="kdk-cam-guide">
          <span id="kdk-cam-arrow">↑</span>
          <div id="kdk-cam-guide-main">Point at the crown</div>
          <div id="kdk-cam-guide-sub">Canopy and top branches</div>
        </div>
      </div>
      <div id="kdk-cam-thumbs">
        <div class="kdk-cam-thumb" id="kdk-cam-thumb-0"><span class="kdk-cam-thumb-lbl">Crown</span></div>
        <div class="kdk-cam-thumb" id="kdk-cam-thumb-1"><span class="kdk-cam-thumb-lbl">Trunk</span></div>
        <div class="kdk-cam-thumb" id="kdk-cam-thumb-2"><span class="kdk-cam-thumb-lbl">Base</span></div>
      </div>
      <div class="kdk-cam-controls">
        <div id="kdk-cam-step-counter"></div>
        <div id="kdk-cam-panel-mode">
          <p class="kdk-cam-panel-hint">How would you like to photograph the tree?</p>
          <button id="kdk-cam-btn-quick" class="kdk-cam-mode-btn">
            📷 Quick photo
            <span>Single shot — fast AI assessment</span>
          </button>
          <button id="kdk-cam-btn-scan" class="kdk-cam-mode-btn kdk-cam-mode-featured">
            🌳 Full tree scan — 3 shots
            <span>Crown, trunk and base — most accurate report</span>
          </button>
        </div>
        <div id="kdk-cam-panel-shutter">
          <button id="kdk-cam-shutter" aria-label="Capture photo"></button>
        </div>
        <div id="kdk-cam-panel-preview">
          <button id="kdk-cam-retake" class="kdk-cam-btn-sec">Retake</button>
          <button id="kdk-cam-use" class="kdk-cam-btn-pri">Use photo →</button>
        </div>
        <div id="kdk-cam-panel-done">
          <button id="kdk-cam-analyse" class="kdk-cam-btn-pri kdk-cam-btn-full">Analyse full tree scan →</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Chat panel
    const panel = document.createElement('div');
    panel.id = 'kdk-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Tree Monkey Tree Care chat');
    panel.innerHTML = `
      <div class="kdk-header">
        <div style="display:flex;align-items:center;gap:7px;background:#fff;border-radius:6px;padding:4px 8px">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="14" fill="#2d5a1b"/>
            <path d="M14 5c-3.3 0-6 2.7-6 6 0 2.1 1.1 4 2.7 5.1L9 22h10l-1.7-5.9C18.9 15 20 13.1 20 11c0-3.3-2.7-6-6-6z" fill="#8bc34a"/>
            <rect x="13" y="18" width="2" height="4" rx="1" fill="#5d4037"/>
          </svg>
          <div style="line-height:1.2">
            <div style="font-size:13px;font-weight:800;color:#1a1a1a">Tree Monkey</div>
            <div style="font-size:11px;font-weight:700;color:#4a8a2a">Tree Care</div>
          </div>
        </div>
        <div class="kdk-header-info"><p>Typically replies in seconds</p></div>
        <div class="kdk-online"></div>
      </div>
      <div class="kdk-messages" id="kdk-messages"></div>
      <div class="kdk-cta-bar">
        <button class="kdk-cta kdk-cta-book" onclick="kdkStartBooking()">Free site visit</button>
        <button class="kdk-cta kdk-cta-call" onclick="window.open('tel:${cfg.phone}')">Call ${cfg.phone}</button>
      </div>
      <div class="kdk-quick-replies" id="kdk-qrs">
        <button class="kdk-qr" onclick="kdkSendQuick('What tree surgery services do you offer?')">Services</button>
        <button class="kdk-qr" onclick="kdkSendQuick('How much does tree surgery cost?')">Pricing</button>
        <button class="kdk-qr" onclick="kdkSendQuick('Does my tree have a preservation order?')">TPO check</button>
        <button class="kdk-qr" onclick="kdkSendQuick('What areas do you cover?')">Coverage</button>
        <button class="kdk-qr" onclick="kdkSendQuick('I have an emergency tree situation')">Emergency</button>
      </div>
      <div class="kdk-input-row">
        <button class="kdk-photo-btn" id="kdk-photo-btn" aria-label="Scan or photograph your tree" title="Scan or photograph your tree">
          <svg viewBox="0 0 24 24"><path d="M12 15.2A3.2 3.2 0 1 1 15.2 12 3.2 3.2 0 0 1 12 15.2M9 2L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2z"/></svg>
        </button>
        <input class="kdk-input" id="kdk-input" type="text" placeholder="Ask about tree surgery or scan a tree..." autocomplete="off"/>
        <button class="kdk-send" id="kdk-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
      <div class="kdk-footer">Powered by Tree AI</div>`;
    document.body.appendChild(panel);

    // ── Event wiring ──────────────────────────────────────────────────────
    btn.addEventListener('click', togglePanel);
    document.getElementById('kdk-send').addEventListener('click', sendMsg);
    document.getElementById('kdk-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });

    // Camera button: open modal if getUserMedia available, else file picker
    document.getElementById('kdk-photo-btn').addEventListener('click', () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        openCameraModal();
      } else {
        fileInput.click();
      }
    });

    // File picker fallback
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        if (!isOpen) togglePanel();
        document.getElementById('kdk-qrs').style.display = 'none';
        addPhotoMsg(dataUrl);
        callAPI('Please analyse this tree photo and provide a full arboricultural assessment.', {
          base64: dataUrl.split(',')[1], mediaType: file.type || 'image/jpeg',
        });
      };
      reader.readAsDataURL(file);
    });

    // Camera modal controls
    document.getElementById('kdk-cam-close').addEventListener('click', closeCameraModal);
    document.getElementById('kdk-cam-back').addEventListener('click', handleCamBack);
    document.getElementById('kdk-cam-btn-quick').addEventListener('click', startQuickMode);
    document.getElementById('kdk-cam-btn-scan').addEventListener('click', startScanMode);
    document.getElementById('kdk-cam-shutter').addEventListener('click', handleShutter);
    document.getElementById('kdk-cam-retake').addEventListener('click', handleRetake);
    document.getElementById('kdk-cam-use').addEventListener('click', handleUsePhoto);
    document.getElementById('kdk-cam-analyse').addEventListener('click', handleAnalyseScan);

    setTimeout(showWelcome, 2000);
  }

  // ── Camera modal ──────────────────────────────────────────────────────────

  async function openCameraModal() {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (err) {
      handleCameraError(err);
      return;
    }
    const video = document.getElementById('kdk-cam-video');
    video.srcObject = camStream;
    video.addEventListener('loadedmetadata', () => video.play(), { once: true });

    // Reset all state
    scanCaptures = [];
    quickCapture = null;
    scanStep = 0;
    camMode = null;
    resetThumbs();
    document.getElementById('kdk-cam-title').textContent = 'Tree Scanner';
    document.getElementById('kdk-cam-step-counter').style.display = 'none';
    document.getElementById('kdk-cam-thumbs').style.display = 'none';
    document.getElementById('kdk-cam-guide').style.display = 'none';
    document.getElementById('kdk-cam-scan-frame').style.display = 'none';
    document.getElementById('kdk-cam-preview-img').style.display = 'none';
    document.getElementById('kdk-cam-video').style.display = 'block';

    showCamPanel('mode');
    document.getElementById('kdk-camera-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCameraModal() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    document.getElementById('kdk-cam-video').srcObject = null;
    document.getElementById('kdk-camera-modal').style.display = 'none';
    document.body.style.overflow = '';
    camMode = null; scanCaptures = []; quickCapture = null; scanStep = 0;
  }

  function handleCamBack() {
    if (camMode === null) { closeCameraModal(); return; }
    // Return to mode selection
    camMode = null; scanCaptures = []; quickCapture = null; scanStep = 0;
    resetThumbs();
    document.getElementById('kdk-cam-thumbs').style.display = 'none';
    document.getElementById('kdk-cam-guide').style.display = 'none';
    document.getElementById('kdk-cam-scan-frame').style.display = 'none';
    document.getElementById('kdk-cam-step-counter').style.display = 'none';
    document.getElementById('kdk-cam-preview-img').style.display = 'none';
    document.getElementById('kdk-cam-video').style.display = 'block';
    document.getElementById('kdk-cam-title').textContent = 'Tree Scanner';
    showCamPanel('mode');
  }

  function showCamPanel(name) {
    ['mode', 'shutter', 'preview', 'done'].forEach(p => {
      const el = document.getElementById(`kdk-cam-panel-${p}`);
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById(`kdk-cam-panel-${name}`);
    if (target) target.style.display = name === 'shutter' ? 'flex' : name === 'preview' ? 'flex' : 'flex';
  }

  // ── Quick mode ─────────────────────────────────────────────────────────────

  function startQuickMode() {
    camMode = 'quick';
    document.getElementById('kdk-cam-title').textContent = 'Quick Photo';
    showCamPanel('shutter');
  }

  function handleRetake() {
    quickCapture = null;
    document.getElementById('kdk-cam-preview-img').style.display = 'none';
    document.getElementById('kdk-cam-video').style.display = 'block';
    showCamPanel('shutter');
  }

  function handleUsePhoto() {
    if (!quickCapture) return;
    closeCameraModal();
    if (!isOpen) togglePanel();
    document.getElementById('kdk-qrs').style.display = 'none';
    addPhotoMsg(quickCapture.dataUrl);
    callAPI('Please analyse this tree photo and provide a full arboricultural identification and condition report.', {
      base64: quickCapture.base64, mediaType: quickCapture.mediaType,
    });
  }

  // ── Scan mode ──────────────────────────────────────────────────────────────

  function startScanMode() {
    camMode = 'scan';
    document.getElementById('kdk-cam-title').textContent = 'Tree Scan';
    document.getElementById('kdk-cam-thumbs').style.display = 'flex';
    document.getElementById('kdk-cam-scan-frame').style.display = 'block';
    document.getElementById('kdk-cam-step-counter').style.display = 'block';
    showScanStep(0);
    showCamPanel('shutter');
  }

  function showScanStep(step) {
    const s = SCAN_STEPS[step];
    document.getElementById('kdk-cam-step-counter').textContent = s.label;
    document.getElementById('kdk-cam-arrow').textContent = s.arrow;
    document.getElementById('kdk-cam-guide-main').textContent = s.text;
    document.getElementById('kdk-cam-guide-sub').textContent = s.sub;
    document.getElementById('kdk-cam-guide').style.display = 'block';
  }

  function updateThumb(step, dataUrl) {
    const thumb = document.getElementById(`kdk-cam-thumb-${step}`);
    if (!thumb) return;
    const labels = ['Crown', 'Trunk', 'Base'];
    thumb.innerHTML = `
      <img src="${dataUrl}" alt="${labels[step]}">
      <div class="kdk-cam-thumb-tag">${labels[step]}</div>
      <div class="kdk-cam-thumb-check">✓</div>`;
    thumb.classList.add('done');
  }

  function resetThumbs() {
    ['Crown', 'Trunk', 'Base'].forEach((lbl, i) => {
      const el = document.getElementById(`kdk-cam-thumb-${i}`);
      if (el) { el.innerHTML = `<span class="kdk-cam-thumb-lbl">${lbl}</span>`; el.classList.remove('done'); }
    });
  }

  function handleAnalyseScan() {
    if (scanCaptures.length < 3) return;
    closeCameraModal();
    if (!isOpen) togglePanel();
    document.getElementById('kdk-qrs').style.display = 'none';
    addScanPreviewMsg(scanCaptures);
    callScanAPI(scanCaptures);
  }

  // ── Shared capture ─────────────────────────────────────────────────────────

  function handleShutter() {
    flashAndCapture();
    const capture = captureFrame();
    if (camMode === 'quick') {
      quickCapture = capture;
      document.getElementById('kdk-cam-video').style.display = 'none';
      document.getElementById('kdk-cam-preview-img').src = capture.dataUrl;
      document.getElementById('kdk-cam-preview-img').style.display = 'block';
      showCamPanel('preview');
    } else if (camMode === 'scan') {
      scanCaptures.push(capture);
      updateThumb(scanStep, capture.dataUrl);
      if (scanStep < 2) {
        scanStep++;
        showScanStep(scanStep);
      } else {
        document.getElementById('kdk-cam-guide').style.display = 'none';
        document.getElementById('kdk-cam-scan-frame').style.display = 'none';
        document.getElementById('kdk-cam-step-counter').textContent = 'SCAN COMPLETE';
        document.getElementById('kdk-cam-title').textContent = 'Ready to analyse';
        showCamPanel('done');
      }
    }
  }

  function captureFrame() {
    const video = document.getElementById('kdk-cam-video');
    const canvas = document.getElementById('kdk-cam-canvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  }

  function flashAndCapture() {
    const flash = document.getElementById('kdk-cam-flash');
    flash.style.display = 'block';
    flash.style.animation = 'none';
    void flash.offsetHeight; // force reflow
    flash.style.animation = 'camFlash 0.35s ease-out';
    setTimeout(() => { flash.style.display = 'none'; }, 350);
  }

  function handleCameraError(err) {
    const msgs = {
      NotAllowedError:  'Camera access was denied. Allow camera access in your browser settings, or use the file picker below.',
      NotFoundError:    'No camera was found on this device. You can still upload a photo.',
      NotReadableError: 'The camera is in use by another application. Close other apps and try again.',
    };
    const msg = msgs[err.name] || 'Could not access the camera. You can still upload a photo.';
    if (!isOpen) togglePanel();
    addMsg('bot', msg);
    // Fallback: file picker
    document.getElementById('kdk-photo-input').click();
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen = !isOpen;
    const btn = document.getElementById('kdk-widget-btn');
    const panel = document.getElementById('kdk-widget-panel');
    document.getElementById('kdk-widget-badge').style.display = 'none';
    btn.classList.toggle('open', isOpen);
    panel.classList.toggle('open', isOpen);
    if (isOpen) setTimeout(() => document.getElementById('kdk-input')?.focus(), 300);
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  function addMsg(role, html) {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = `kdk-msg ${role}`;
    wrap.innerHTML = `<div class="kdk-msg-av">${role === 'bot' ? 'TM' : 'Y'}</div><div class="kdk-bubble">${role === 'bot' ? formatReply(html) : html}</div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function addPhotoMsg(dataUrl) {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'kdk-msg user';
    wrap.innerHTML = `<div class="kdk-msg-av">Y</div>
      <div class="kdk-bubble" style="padding:4px">
        <img src="${dataUrl}" class="kdk-photo-preview" alt="Tree photo">
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function addScanPreviewMsg(captures) {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'kdk-msg user';
    const thumbs = captures.map((c, i) =>
      `<div style="text-align:center">
        <img src="${c.dataUrl}" style="width:68px;height:68px;object-fit:cover;border-radius:8px;display:block">
        <div style="font-size:9px;color:rgba(255,255,255,0.75);margin-top:3px;font-weight:600">${['Crown','Trunk','Base'][i]}</div>
      </div>`
    ).join('');
    wrap.innerHTML = `<div class="kdk-msg-av">Y</div>
      <div class="kdk-bubble" style="padding:8px">
        <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-bottom:7px;font-weight:600;letter-spacing:0.3px">3-SHOT TREE SCAN</div>
        <div style="display:flex;gap:6px">${thumbs}</div>
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function addTyping() {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'kdk-msg bot';
    wrap.id = 'kdk-typing';
    wrap.innerHTML = `<div class="kdk-msg-av">TM</div><div class="kdk-bubble"><div class="kdk-typing-dots"><span></span><span></span><span></span></div></div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() { document.getElementById('kdk-typing')?.remove(); }

  function showWelcome() {
    if (document.getElementById('kdk-messages').children.length === 0) {
      addMsg('bot', `Hi there! Welcome to <strong>${cfg.name}</strong> — NPTC qualified, family-run tree surgeons in Hertfordshire, Buckinghamshire and Bedfordshire since 2004.<br><br>I can help with:<br>• <strong>Instant AI tree analysis</strong> — tap the camera icon to scan your tree<br>• Species and condition identification<br>• Ballpark cost estimates<br>• Live TPO and conservation area checks<br>• Free site visit booking<br><br><strong>Tap the camera icon to open the tree scanner.</strong>`);
    }
  }

  function formatReply(text) {
    return text
      .replace(/—/g, '-')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\n/g, '<br>');
  }

  // ── API calls ─────────────────────────────────────────────────────────────
  async function callAPI(message, imageData) {
    isTyping = true;
    addTyping();
    try {
      const body = { message, sessionId };
      if (imageData) { body.imageBase64 = imageData.base64; body.imageMediaType = imageData.mediaType; }
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      removeTyping(); isTyping = false;
      if (data.sessionId) { sessionId = data.sessionId; sessionStorage.setItem('tree_monkey_session', sessionId); }
      addMsg('bot', data.reply || 'Sorry, something went wrong. Please call us on ' + cfg.phone);
    } catch {
      removeTyping(); isTyping = false;
      addMsg('bot', `Sorry, I'm having trouble connecting. Please call us on <strong>${cfg.phone}</strong>.`);
    }
  }

  async function callScanAPI(captures) {
    isTyping = true;
    addTyping();
    try {
      const body = {
        message: 'I have taken a guided 3-shot tree scan: crown (top), trunk (mid-height), and base (root zone). Please provide a comprehensive arboricultural identification and condition assessment, drawing from all three images for the most accurate and detailed analysis possible.',
        sessionId,
        imageBase64Array:     captures.map(c => c.base64),
        imageMediaTypeArray:  captures.map(c => c.mediaType),
      };
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      removeTyping(); isTyping = false;
      if (data.sessionId) { sessionId = data.sessionId; sessionStorage.setItem('tree_monkey_session', sessionId); }
      addMsg('bot', data.reply || 'Sorry, something went wrong. Please call us on ' + cfg.phone);
    } catch {
      removeTyping(); isTyping = false;
      addMsg('bot', `Sorry, I'm having trouble connecting. Please call us on <strong>${cfg.phone}</strong>.`);
    }
  }

  // ── Send (text) ───────────────────────────────────────────────────────────
  function sendMsg() {
    const input = document.getElementById('kdk-input');
    if (!input || isTyping) return;
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    addMsg('user', val);
    document.getElementById('kdk-qrs').style.display = 'none';
    callAPI(val);
  }

  window.kdkSendQuick = function(text) {
    if (isTyping) return;
    addMsg('user', text);
    document.getElementById('kdk-qrs').style.display = 'none';
    callAPI(text);
  };

  window.kdkStartBooking = function() {
    if (!isOpen) togglePanel();
    if (isTyping) return;
    addMsg('user', 'I would like a free site visit and quote');
    document.getElementById('kdk-qrs').style.display = 'none';
    callAPI('I would like a free site visit and quote');
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
