(function (root) {
  const KEY = "clippd:wallet";
  const INSTALL = {
    phantom: "https://phantom.app/download",
    solflare: "https://solflare.com/download",
    metamask: "https://metamask.io/download/",
  };
  const LOGO = {
    phantom: "/assets/wallets/phantom.svg",
    solflare: "/assets/wallets/solflare.svg",
    metamask: "/assets/wallets/metamask.svg",
  };
  const standardWallets = [];
  let state = null;
  const listeners = new Set();

  bootWalletStandard();
  restoreSession();

  function wipeStored() {
    try {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    } catch (_) {}
  }

  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && obj.address && obj.wallet) state = obj;
    } catch (_) {}
  }

  function persist() {
    try {
      if (state && state.address) {
        sessionStorage.setItem(
          KEY,
          JSON.stringify({
            address: state.address,
            wallet: state.wallet,
            connectedAt: state.connectedAt || Date.now(),
          })
        );
      } else {
        sessionStorage.removeItem(KEY);
      }
      localStorage.removeItem(KEY);
    } catch (_) {}
  }

  function save(next) {
    state = next;
    persist();
    listeners.forEach((fn) => fn(state));
    renderAll();
  }
  function short(addr) {
    if (!addr) return "";
    return addr.slice(0, 4) + "…" + addr.slice(-4);
  }
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function get() {
    return state;
  }

  function bootWalletStandard() {
    const register = (wallet) => {
      if (!wallet || standardWallets.some((w) => w.name === wallet.name)) return;
      standardWallets.push(wallet);
    };
    try {
      window.addEventListener("wallet-standard:register-wallet", (e) => {
        try {
          e.detail.register(register);
        } catch (_) {}
      });
      window.dispatchEvent(
        new CustomEvent("wallet-standard:app-ready", {
          detail: { register },
        })
      );
    } catch (_) {}
  }

  function findStandard(nameRe) {
    return standardWallets.find((w) => nameRe.test(w.name || ""));
  }

  function provider(kind) {
    if (kind === "phantom") {
      if (window.phantom?.solana) return { type: "injected", p: window.phantom.solana };
      if (window.solana?.isPhantom) return { type: "injected", p: window.solana };
      const std = findStandard(/phantom/i);
      if (std) return { type: "standard", p: std };
      return null;
    }
    if (kind === "solflare") {
      if (window.solflare) return { type: "injected", p: window.solflare };
      const std = findStandard(/solflare/i);
      if (std) return { type: "standard", p: std };
      return null;
    }
    if (kind === "metamask") {
      if (window.metamask?.solana) return { type: "injected", p: window.metamask.solana };
      const std = findStandard(/metamask/i);
      if (std) return { type: "standard", p: std };
      return null;
    }
    return null;
  }

  function installed(kind) {
    return !!provider(kind);
  }

  function metamaskEvmOnly() {
    return !!(window.ethereum && window.ethereum.isMetaMask) && !provider("metamask");
  }

  async function forgetInjected(p) {
    if (!p) return;
    try {
      if (typeof p.disconnect === "function") await p.disconnect();
    } catch (_) {}
    try {
      if (typeof p.request === "function") await p.request({ method: "disconnect" });
    } catch (_) {}
  }

  async function forgetStandard(wallet) {
    if (!wallet || !wallet.features) return;
    const feature = wallet.features["standard:disconnect"];
    if (feature && typeof feature.disconnect === "function") {
      try {
        await feature.disconnect();
      } catch (_) {}
    }
  }

  async function forgetAll() {
    wipeStored();
    save(null);
    await forgetProviders();
  }

  async function forgetProviders() {
    for (const kind of ["phantom", "solflare", "metamask"]) {
      const found = provider(kind);
      if (!found) continue;
      if (found.type === "injected") await forgetInjected(found.p);
      else await forgetStandard(found.p);
    }
  }

  function decodeError(err, kind) {
    const msg = String((err && (err.message || err.err || err)) || "Wallet error");
    const code = err && err.code;
    if (code === 4001 || /user rejected|denied|cancelled|canceled/i.test(msg)) {
      return kind + " connection was rejected.";
    }
    if (code === -32002 || /already pending|request already/i.test(msg)) {
      return "A connect request is already open in " + kind + ". Check the extension popup.";
    }
    if (/unexpected error|failed to connect|could not connect|disconnected/i.test(msg)) {
      return "Could not reach " + kind + ". Unlock the extension and try again.";
    }
    if (/forbidden|origin|unauthorized/i.test(msg)) {
      return kind + " blocked this site. Open the wallet and approve Clipped.";
    }
    return msg;
  }

  async function connectInjected(p) {
    if (typeof p.connect !== "function") throw new Error("This wallet does not support connect().");
    const res = await p.connect({ onlyIfTrusted: false });
    const key = res && (res.publicKey || res);
    const addr = key && (typeof key.toString === "function" ? key.toString() : String(key));
    if (!addr || addr.length < 32) throw new Error("Wallet did not return an address.");
    return addr;
  }

  async function connectStandard(wallet) {
    await forgetStandard(wallet);
    const feature = wallet.features && (wallet.features["standard:connect"] || wallet.features["solana:connect"]);
    if (!feature || typeof feature.connect !== "function") {
      throw new Error(wallet.name + " is installed but has no connect method.");
    }
    const res = await feature.connect({ silent: false });
    const accounts = (res && res.accounts) || wallet.accounts || [];
    const sol = accounts.find((a) => (a.chains || []).some((c) => String(c).startsWith("solana:"))) || accounts[0];
    if (!sol || !sol.address) throw new Error(wallet.name + " did not return an account.");
    return sol.address;
  }

  async function connect(kind) {
    const label = kind === "phantom" ? "Phantom" : kind === "solflare" ? "Solflare" : "MetaMask";
    if (kind === "metamask" && metamaskEvmOnly()) {
      throw Object.assign(new Error("MetaMask is installed. Unlock the extension and try again."), {
        code: "SOLANA_NOT_ENABLED",
      });
    }
    const found = provider(kind);
    if (!found) {
      throw Object.assign(new Error(label + " is not installed."), {
        code: "NOT_INSTALLED",
        install: INSTALL[kind],
        wallet: label,
      });
    }
    try {
      const address = found.type === "standard" ? await connectStandard(found.p) : await connectInjected(found.p);
      save({ address, wallet: kind, connectedAt: Date.now() });
      closeModal();
      return state;
    } catch (err) {
      save(null);
      throw Object.assign(new Error(decodeError(err, label)), { cause: err });
    }
  }

  async function disconnect() {
    const found = state && provider(state.wallet);
    try {
      if (found?.type === "injected") await forgetInjected(found.p);
      if (found?.type === "standard") await forgetStandard(found.p);
    } catch (_) {}
    wipeStored();
    save(null);
  }

  async function requireConnected() {
    if (state && state.address) return state;
    openModal();
    throw Object.assign(new Error("Connect a wallet first."), { code: "WALLET_REQUIRED" });
  }

  function logoTag(kind) {
    const extra = kind === "metamask" ? " is-mm" : "";
    return `<span class="cw-logo${extra}"><img src="${LOGO[kind]}" alt="" width="40" height="40"></span>`;
  }

  function ensureModal() {
    if (document.getElementById("clippd-wallet-modal")) return;
    const el = document.createElement("div");
    el.id = "clippd-wallet-modal";
    el.hidden = true;
    el.innerHTML = `
      <div class="cw-backdrop" data-cw-close></div>
      <div class="cw-sheet" role="dialog" aria-labelledby="cw-title">
        <div class="cw-head">
          <div>
            <h3 id="cw-title">Connect wallet</h3>
            <p class="cw-lead">Choose a wallet, then approve the request.</p>
          </div>
          <button type="button" class="cw-x" data-cw-close aria-label="Close">×</button>
        </div>
        <div class="cw-err" id="cw-err" hidden></div>
        <div class="cw-opts">
          <button type="button" class="cw-opt" data-cw="phantom">
            ${logoTag("phantom")}
            <span class="cw-opt-name">Phantom</span>
            <span class="cw-opt-go">→</span>
          </button>
          <button type="button" class="cw-opt" data-cw="solflare">
            ${logoTag("solflare")}
            <span class="cw-opt-name">Solflare</span>
            <span class="cw-opt-go">→</span>
          </button>
          <button type="button" class="cw-opt" data-cw="metamask">
            ${logoTag("metamask")}
            <span class="cw-opt-name">MetaMask</span>
            <span class="cw-opt-go">→</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-cw-close]")) closeModal();
      const btn = e.target.closest("[data-cw]");
      if (btn) pick(btn.getAttribute("data-cw"));
    });
  }

  function openModal() {
    ensureModal();
    const err = document.getElementById("cw-err");
    if (err) {
      err.hidden = true;
      err.innerHTML = "";
    }
    document.getElementById("clippd-wallet-modal").hidden = false;
  }
  function closeModal() {
    const el = document.getElementById("clippd-wallet-modal");
    if (el) el.hidden = true;
  }

  async function pick(kind) {
    const err = document.getElementById("cw-err");
    const label = kind === "phantom" ? "Phantom" : kind === "solflare" ? "Solflare" : "MetaMask";
    try {
      await connect(kind);
    } catch (e) {
      if (!err) return;
      err.hidden = false;
      if (e.code === "NOT_INSTALLED") {
        err.innerHTML = esc(e.message) + ` <a href="${esc(e.install)}" target="_blank" rel="noopener">Install ${esc(label)}</a>`;
      } else {
        err.textContent = e.message;
      }
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function slotHtml() {
    if (state && state.address) {
      return `<div class="cw-connected">
        <button type="button" class="cw-addr" data-cw-menu title="${esc(state.address)}">${esc(short(state.address))}</button>
        <div class="cw-menu" hidden>
          <div class="cw-menu-label">${esc(state.wallet)}</div>
          <div class="cw-menu-addr">${esc(state.address)}</div>
          <a class="cw-menu-link" href="/u/${esc(state.address)}" data-nav data-cw-profile>View profile</a>
          <button type="button" data-cw-disconnect>Disconnect</button>
        </div>
      </div>`;
    }
    return `<button type="button" class="cw-connect" data-cw-open>Connect wallet</button>`;
  }

  function closeMenus(except) {
    document.querySelectorAll(".cw-menu").forEach((m) => {
      if (m !== except) m.hidden = true;
    });
  }

  function bindSlot(node) {
    node.querySelector("[data-cw-open]")?.addEventListener("click", openModal);
    node.querySelector("[data-cw-disconnect]")?.addEventListener("click", disconnect);
    const menuBtn = node.querySelector("[data-cw-menu]");
    const menu = node.querySelector(".cw-menu");
    if (menuBtn && menu) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasHidden = menu.hidden;
        closeMenus();
        menu.hidden = !wasHidden;
      });
    }
    node.querySelector("[data-cw-profile]")?.addEventListener("click", () => closeMenus());
  }

  if (!document.documentElement.hasAttribute("data-cw-menu-bound")) {
    document.documentElement.setAttribute("data-cw-menu-bound", "");
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".cw-connected")) return;
      closeMenus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenus();
    });
  }

  function renderAll() {
    document.querySelectorAll("[data-wallet-slot]").forEach((node) => {
      node.innerHTML = slotHtml();
      bindSlot(node);
    });
    const app = document.getElementById("app");
    if (app) return;
    const links = document.querySelector(".mk-links");
    if (!links) return;
    let you = links.querySelector("[data-you]");
    if (state && state.address) {
      if (!you) {
        you = document.createElement("a");
        you.setAttribute("data-you", "");
        you.textContent = "You";
        links.appendChild(you);
      }
      you.setAttribute("href", "/u/" + state.address);
    } else if (you) {
      you.remove();
    }
  }

  function bindProviderEvents() {
    const p = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
    if (p && !p._clippdBound) {
      p._clippdBound = true;
      try {
        p.on("accountChanged", (key) => {
          if (!key || !state) return;
          const addr = typeof key.toString === "function" ? key.toString() : String(key);
          if (addr && addr.length >= 32) {
            save({ address: addr, wallet: state.wallet || "phantom", connectedAt: Date.now() });
          }
        });
      } catch (_) {}
    }
  }

  async function silentReconnect() {
    if (!state || !state.wallet) return;
    const found = provider(state.wallet);
    if (!found || found.type !== "injected" || typeof found.p.connect !== "function") return;
    try {
      const res = await found.p.connect({ onlyIfTrusted: true });
      const key = res && (res.publicKey || res);
      const addr = key && (typeof key.toString === "function" ? key.toString() : String(key));
      if (addr && addr.length >= 32) {
        save({ address: addr, wallet: state.wallet, connectedAt: Date.now() });
      }
    } catch (_) {}
  }

  function mount() {
    restoreSession();
    ensureModal();
    renderAll();
    bindProviderEvents();
    silentReconnect();
    setTimeout(bindProviderEvents, 500);
    loadCa();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  root.ClippdWallet = {
    get,
    connect,
    disconnect,
    requireConnected,
    openModal,
    onChange,
    installed,
    short,
    refresh: renderAll,
  };

  function caShort(raw) {
    const s = String(raw || "...").trim() || "...";
    if (s.length > 12) return s.slice(0, 4) + "…" + s.slice(-4);
    return s;
  }
  function applyCa() {
    const raw = window.CLIPPD_CA || "...";
    const label = caShort(raw);
    document.querySelectorAll("[data-ca-chip]").forEach((btn) => {
      btn.setAttribute("data-ca", raw);
      const t = btn.querySelector("[data-ca-text]");
      if (t) t.textContent = label;
    });
  }
  function loadCa() {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        window.CLIPPD_CA = (c && c.ca) || "...";
        applyCa();
      })
      .catch(() => {
        window.CLIPPD_CA = "...";
        applyCa();
      });
  }
  if (!document.documentElement.hasAttribute("data-ca-bound")) {
    document.documentElement.setAttribute("data-ca-bound", "");
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ca-chip]");
      if (!btn) return;
      const ca = btn.getAttribute("data-ca") || window.CLIPPD_CA || "...";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ca);
      btn.classList.add("copied");
      clearTimeout(btn._caT);
      btn._caT = setTimeout(() => btn.classList.remove("copied"), 1200);
    });
  }
  root.ClippdCa = { apply: applyCa };
})(window);
