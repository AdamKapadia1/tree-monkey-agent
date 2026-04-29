(function() {
  'use strict';

  const BACKEND = document.currentScript?.src?.split('/widget.js')[0] || 'https://tree-monkey-production.up.railway.app';
  const cfg = {
    color:   document.currentScript?.getAttribute('data-primary-color') || '#2d5a1b',
    accent:  document.currentScript?.getAttribute('data-accent-color')  || '#4a8a2a',
    name:    document.currentScript?.getAttribute('data-business-name') || 'Tree Monkey Tree Care',
    phone:   document.currentScript?.getAttribute('data-phone')         || '01442 733249',
  };

  let sessionId = sessionStorage.getItem('tree_monkey_session') || null;
  let isOpen = false;
  let isTyping = false;

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
      width:360px; height:520px; border-radius:16px;
      background:#fff; box-shadow:0 8px 40px rgba(0,0,0,0.18);
      display:flex; flex-direction:column; overflow:hidden;
      transform:scale(0.85) translateY(20px); transform-origin:bottom right;
      opacity:0; pointer-events:none;
      transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #kdk-widget-panel.open {
      transform:scale(1) translateY(0); opacity:1; pointer-events:all;
    }
    @media(max-width:480px){
      #kdk-widget-panel { width:calc(100vw - 16px); right:8px; bottom:88px; height:72vh; }
      #kdk-widget-btn  { bottom:16px; right:16px; }
    }
    .kdk-header {
      background:${cfg.color}; padding:14px 16px;
      display:flex; align-items:center; gap:10px; flex-shrink:0;
    }
    .kdk-avatar {
      width:36px; height:36px; border-radius:50%;
      background:${cfg.accent}; display:flex; align-items:center;
      justify-content:center; font-weight:700; font-size:12px;
      color:${cfg.color}; flex-shrink:0; letter-spacing:-.5px;
    }
    .kdk-header-info h3 { color:#fff; font-size:14px; font-weight:600; margin:0; }
    .kdk-header-info p  { color:rgba(255,255,255,0.65); font-size:11px; margin:2px 0 0; }
    .kdk-online { width:8px; height:8px; border-radius:50%; background:#4ade80;
      margin-left:auto; box-shadow:0 0 0 2px rgba(74,222,128,0.3); flex-shrink:0; }
    .kdk-messages {
      flex:1; overflow-y:auto; padding:14px 12px;
      display:flex; flex-direction:column; gap:8px;
      background:#f8f9fa;
    }
    .kdk-messages::-webkit-scrollbar { width:3px; }
    .kdk-messages::-webkit-scrollbar-thumb { background:#ddd; border-radius:2px; }
    .kdk-msg { display:flex; gap:7px; align-items:flex-end; max-width:88%; animation:kdkFade .2s ease; }
    .kdk-msg.bot { align-self:flex-start; }
    .kdk-msg.user { align-self:flex-end; flex-direction:row-reverse; }
    .kdk-msg-av {
      width:26px; height:26px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:700;
    }
    .bot .kdk-msg-av { background:${cfg.color}; color:${cfg.accent}; }
    .user .kdk-msg-av { background:${cfg.accent}; color:${cfg.color}; }
    .kdk-bubble {
      padding:9px 12px; border-radius:14px;
      font-size:13px; line-height:1.55; color:#1a1a1a;
    }
    .bot .kdk-bubble {
      background:#fff; border:1px solid #e8e8e8;
      border-bottom-left-radius:3px;
    }
    .user .kdk-bubble {
      background:${cfg.color}; color:#fff;
      border-bottom-right-radius:3px;
    }
    .kdk-quick-replies {
      display:flex; flex-wrap:wrap; gap:5px;
      padding:6px 12px 2px; flex-shrink:0; background:#f8f9fa;
    }
    .kdk-qr {
      font-size:12px; padding:5px 11px; border-radius:20px;
      border:1px solid ${cfg.color}; background:transparent;
      color:${cfg.color}; cursor:pointer; font-weight:500;
      font-family:inherit; transition:all .15s;
    }
    .kdk-qr:hover { background:${cfg.color}; color:#fff; }
    .kdk-input-row {
      display:flex; gap:8px; padding:10px 12px;
      background:#fff; border-top:1px solid #f0f0f0; flex-shrink:0;
    }
    .kdk-input {
      flex:1; font-size:13px; padding:9px 12px;
      border-radius:20px; border:1px solid #e0e0e0;
      outline:none; font-family:inherit; background:#f8f9fa;
      color:#1a1a1a; transition:border-color .15s;
    }
    .kdk-input:focus { border-color:${cfg.color}; background:#fff; }
    .kdk-input::placeholder { color:#aaa; }
    .kdk-send {
      width:36px; height:36px; border-radius:50%;
      background:${cfg.color}; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0; transition:background .15s;
    }
    .kdk-send:hover { background:#2d6b47; }
    .kdk-send svg { width:15px; height:15px; fill:#fff; }
    .kdk-footer {
      text-align:center; padding:6px; font-size:10px;
      color:#bbb; background:#fff; flex-shrink:0;
      border-top:1px solid #f5f5f5;
    }
    .kdk-footer a { color:#bbb; text-decoration:none; }
    .kdk-typing-dots { display:flex; gap:3px; padding:2px; }
    .kdk-typing-dots span {
      width:5px; height:5px; border-radius:50%; background:#ccc;
      animation:kdkBounce 1.2s infinite;
    }
    .kdk-typing-dots span:nth-child(2) { animation-delay:.2s; }
    .kdk-typing-dots span:nth-child(3) { animation-delay:.4s; }
    .kdk-cta-bar {
      display:flex; gap:6px; padding:8px 12px 4px; flex-shrink:0; background:#f8f9fa;
    }
    .kdk-cta {
      flex:1; padding:7px 6px; border-radius:8px; border:none;
      font-size:11.5px; font-weight:600; cursor:pointer;
      font-family:inherit; transition:opacity .15s; text-align:center;
    }
    .kdk-cta:hover { opacity:.88; }
    .kdk-cta-book { background:${cfg.accent}; color:#fff; }
    .kdk-cta-call { background:${cfg.color}; color:#fff; }
    @keyframes kdkFade { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
    @keyframes kdkBounce { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-4px);opacity:1} }
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
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
      <div id="kdk-widget-badge">1</div>`;
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'kdk-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Tree Monkey Tree Care chat');
    panel.innerHTML = `
      <div class="kdk-header">
        <div style="display:flex;align-items:center;gap:7px;background:#fff;border-radius:6px;padding:4px 8px">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="14" fill="#2d5a1b"/>
            <path d="M14 5c-3.3 0-6 2.7-6 6 0 2.1 1.1 4 2.7 5.1L9 22h10l-1.7-5.9C18.9 15 20 13.1 20 11c0-3.3-2.7-6-6-6z" fill="#8bc34a"/>
            <rect x="13" y="18" width="2" height="4" rx="1" fill="#5d4037"/>
          </svg>
          <div style="line-height:1.2">
            <div style="font-size:13px;font-weight:800;color:#1a1a1a">Tree Monkey</div>
            <div style="font-size:11px;font-weight:700;color:#4a8a2a">Tree Care</div>
          </div>
        </div>
        <div class="kdk-header-info">
          <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0">Typically replies in seconds</p>
        </div>
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
        <button class="kdk-qr" onclick="kdkSendQuick('Does my tree have a preservation order?')">TPO advice</button>
        <button class="kdk-qr" onclick="kdkSendQuick('What areas do you cover?')">Coverage</button>
        <button class="kdk-qr" onclick="kdkSendQuick('I have an emergency tree situation')">Emergency</button>
      </div>
      <div class="kdk-input-row">
        <input class="kdk-input" id="kdk-input" type="text" placeholder="Ask about tree surgery or send a photo URL..." autocomplete="off"/>
        <button class="kdk-send" id="kdk-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
      <div class="kdk-footer">Powered by <a href="#" target="_blank">Tree AI</a></div>`;
    document.body.appendChild(panel);

    // Wire events
    btn.addEventListener('click', togglePanel);
    document.getElementById('kdk-send').addEventListener('click', sendMsg);
    document.getElementById('kdk-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });

    // Show welcome after 2s
    setTimeout(showWelcome, 2000);
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen = !isOpen;
    const btn = document.getElementById('kdk-widget-btn');
    const panel = document.getElementById('kdk-widget-panel');
    const badge = document.getElementById('kdk-widget-badge');
    btn.classList.toggle('open', isOpen);
    panel.classList.toggle('open', isOpen);
    if (isOpen) {
      badge.style.display = 'none';
      setTimeout(() => document.getElementById('kdk-input')?.focus(), 300);
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  function addMsg(role, html) {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = `kdk-msg ${role}`;
    const initial = role === 'bot' ? 'TM' : 'Y';
    const content = role === 'bot' ? formatReply(html) : html;
    wrap.innerHTML = `<div class="kdk-msg-av" style="font-size:8px">${initial}</div><div class="kdk-bubble">${content}</div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function addTyping() {
    const container = document.getElementById('kdk-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'kdk-msg bot';
    wrap.id = 'kdk-typing';
    wrap.innerHTML = `<div class="kdk-msg-av" style="font-size:8px">TM</div><div class="kdk-bubble"><div class="kdk-typing-dots"><span></span><span></span><span></span></div></div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('kdk-typing')?.remove();
  }

  function showWelcome() {
    if (document.getElementById('kdk-messages').children.length === 0) {
      addMsg('bot', `Hi there! Welcome to <strong>${cfg.name}</strong> — NPTC qualified, family-run tree surgeons serving Hertfordshire, Buckinghamshire and Bedfordshire since 2004.<br><br>I can help with free site visit quotes, tree advice, TPO queries, or emergencies. Send a photo URL of your tree for an instant AI assessment.<br><br>How can I help you today?`);
    }
  }

  // ── Markdown formatter ────────────────────────────────────────────────────
  function formatReply(text) {
    return text
      .replace(/—/g, '-')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\n/g, '<br>');
  }

  // ── API call ──────────────────────────────────────────────────────────────
  async function callAPI(message) {
    addTyping();
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
      });
      const data = await res.json();
      removeTyping();
      if (data.sessionId) {
        sessionId = data.sessionId;
        sessionStorage.setItem('tree_monkey_session', sessionId);
      }
      const reply = data.reply || 'Sorry, something went wrong. Please call us on ' + cfg.phone;
      addMsg('bot', reply);
    } catch {
      removeTyping();
      addMsg('bot', `Sorry, I'm having trouble connecting. Please call us on <strong>${cfg.phone}</strong> and we'll help straight away.`);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  function sendMsg() {
    const input = document.getElementById('kdk-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val || isTyping) return;
    input.value = '';
    addMsg('user', val);
    document.getElementById('kdk-qrs').style.display = 'none';
    callAPI(val);
  }

  // ── Quick replies ─────────────────────────────────────────────────────────
  window.kdkSendQuick = function(text) {
    addMsg('user', text);
    document.getElementById('kdk-qrs').style.display = 'none';
    callAPI(text);
  };

  window.kdkStartBooking = function() {
    if (!isOpen) togglePanel();
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
