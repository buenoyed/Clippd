(function () {
  const root = document.getElementById("app");
  const MIN_BUDGET_USD = 10;
  const PLATFORMS = ["tiktok", "instagram", "youtube", "x"];
  const launchDraft = {
    step: 1,
    ticker: "",
    name: "",
    contract: "",
    hashtag: "",
    image: "",
    brief: "",
    budget_usd: "",
    rate_per_1k_usd: "",
    ugc_rate_per_1k_usd: "",
    viral_bonus_usd: "",
    min_views: 1000,
    duration_days: 14,
    platforms: ["tiktok", "instagram", "youtube", "x"],
  };
  let fundTimer = 0;
  let quoteTimer = 0;

  function h(html) {
    return html;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function path() {
    return location.pathname.replace(/\/+$/, "") || "/";
  }
  function go(href, ev) {
    if (ev) ev.preventDefault();
    history.pushState({}, "", href);
    render();
  }
  function usd(n) {
    return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function sol(n) {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { maximumFractionDigits: 9 }) + " SOL";
  }
  function solCopy(n) {
    const lamports = Math.round(Number(n || 0) * 1e9);
    return String(lamports / 1e9);
  }
  function stopQuotePoll() {
    clearInterval(quoteTimer);
    quoteTimer = 0;
  }
  function paintQuote(q) {
    if (!q) return;
    const send = document.getElementById("quote-sol") || document.getElementById("fund-send");
    const meta = document.getElementById("quote-meta") || document.getElementById("fund-price");
    if (q.empty) {
      if (send && document.getElementById("quote-sol")) send.textContent = "—";
      if (meta && document.getElementById("quote-meta")) meta.textContent = "Enter a budget to quote SOL.";
      return;
    }
    if (q.error) {
      if (meta) meta.textContent = q.error;
      return;
    }
    if (send) send.textContent = sol(q.sol);
    const copySol = document.getElementById("copy-sol");
    if (copySol && q.sol != null) copySol.setAttribute("data-sol", solCopy(q.sol));
    const need = document.getElementById("fund-need");
    if (need && q.sol != null) need.textContent = sol(q.sol);
    if (meta) {
      meta.textContent = document.getElementById("fund-price")
        ? usd(q.usd) + " at " + usd(q.sol_price_usd) + " / SOL · live"
        : usd(q.sol_price_usd) + " / SOL · " + usd(q.usd) + " budget · live";
    }
    const rem = document.getElementById("fund-remaining");
    const page = document.getElementById("fund-page");
    if (rem && page && q.lamports != null) {
      const net = Number(page.getAttribute("data-net-lamports") || 0);
      rem.textContent = sol(Math.max(0, q.lamports - net) / 1e9);
    }
  }
  async function fetchQuote(usdVal) {
    if (usdVal === "" || usdVal == null || String(usdVal).trim() === "") return { empty: true };
    const n = Number(usdVal);
    if (!(n >= MIN_BUDGET_USD)) return { error: "Minimum budget is $" + MIN_BUDGET_USD + " USD" };
    return api("/api/quote?usd=" + n);
  }
  function startQuotePoll(getUsd) {
    stopQuotePoll();
    const tick = async () => {
      if (!document.getElementById("quote-sol") && !document.getElementById("fund-send")) return stopQuotePoll();
      try {
        paintQuote(await fetchQuote(getUsd()));
      } catch (e) {
        paintQuote({ error: e.message || "Could not fetch SOL price" });
      }
    };
    tick();
    quoteTimer = setInterval(tick, 15000);
  }
  function when(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString();
  }

  function nav(active) {
    return `
      <header class="mk-nav">
        <div class="mk-nav-inner">
          <a class="mk-brand" href="/"><img src="/assets/clipdpfp.png" alt="Clipd" width="36" height="36"/></a>
          <nav class="mk-links">
            <a href="/docs">Docs</a>
            <a class="${active === "campaigns" ? "on" : ""}" href="/campaigns" data-nav>Campaigns</a>
            <a class="${active === "launch" ? "on" : ""}" href="/launch" data-nav>Launch</a>
            ${
              (window.ClippdWallet && window.ClippdWallet.get && window.ClippdWallet.get() && window.ClippdWallet.get().address)
                ? `<a class="${active === "profile" ? "on" : ""}" href="/u/${esc(window.ClippdWallet.get().address)}" data-nav data-you>You</a>`
                : ""
            }
          </nav>
          <div class="mk-nav-right">
            <button type="button" class="ca-chip" data-ca-chip data-ca="..." title="Copy contract address"><span class="ca-k">CA</span> <span data-ca-text>…</span></button>
            <a class="mk-x" href="https://x.com/clipdonpump" target="_blank" rel="noopener" aria-label="Clipd on X">
              <img src="/assets/platforms/x.svg" alt="" width="14" height="14"/>
            </a>
            <span data-wallet-slot></span>
            <a class="mk-cta" href="/launch" data-nav>Launch</a>
          </div>
        </div>
      </header>`;
  }

  function wrap(active, inner) {
    return `<div class="mk-wrap" id="mk-shell">${nav(active)}
      <main class="mk-main" id="mk-main">${inner}</main>
      <footer class="mk-foot">
        <button type="button" class="ca-chip" data-ca-chip data-ca="..." title="Copy contract address"><span class="ca-k">CA:</span> <span data-ca-text>…</span></button>
        <a href="https://x.com/clipdonpump" target="_blank" rel="noopener">X · @clipdonpump</a>
      </footer></div>`;
  }
  function syncNav(active) {
    const links = document.querySelector(".mk-links");
    if (!links) return;
    const w = window.ClippdWallet && window.ClippdWallet.get && window.ClippdWallet.get();
    let you = links.querySelector("[data-you]");
    if (w && w.address) {
      if (!you) {
        you = document.createElement("a");
        you.setAttribute("data-nav", "");
        you.setAttribute("data-you", "");
        you.textContent = "You";
        links.appendChild(you);
      }
      you.href = "/u/" + w.address;
    } else if (you) {
      you.remove();
      you = null;
    }
    links.querySelectorAll("a").forEach((a) => {
      const href = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      const on =
        (active === "campaigns" && href === "/campaigns") ||
        (active === "launch" && href === "/launch") ||
        (active === "profile" && a.hasAttribute("data-you"));
      a.classList.toggle("on", on);
    });
  }
  function paint(active, inner) {
    if (!document.getElementById("mk-shell")) {
      root.innerHTML = wrap(active, "");
      if (window.ClippdWallet && window.ClippdWallet.refresh) window.ClippdWallet.refresh();
    } else {
      syncNav(active);
    }
    const main = document.getElementById("mk-main");
    if (main) main.innerHTML = inner;
    if (window.ClippdCa && window.ClippdCa.apply) window.ClippdCa.apply();
  }
  function walletOrThrow() {
    const w = window.ClippdWallet && window.ClippdWallet.get && window.ClippdWallet.get();
    if (w && w.address) return w;
    if (window.ClippdWallet) window.ClippdWallet.openModal();
    throw new Error("Connect Phantom, Solflare, or MetaMask first.");
  }

  function statusBadge(c) {
    if (c.demo) return `<span class="badge badge-live"><span class="pulse"></span> Demo · Live</span>`;
    if (c.status === "live") return `<span class="badge badge-live"><span class="pulse"></span> Live</span>`;
    return `<span class="badge badge-wait">Awaiting SOL</span>`;
  }

  function platIcon(p, size) {
    const n = size || 16;
    return `<img class="plat-ico" src="/assets/platforms/${esc(p)}.svg" alt="${esc(p)}" width="${n}" height="${n}">`;
  }

  function daysLeft(c) {
    const days = Number(c.duration_days || 14);
    if (!c.created_at) return days;
    const end = new Date(c.created_at).getTime() + days * 86400000;
    return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  }

  function shortCa(addr) {
    if (!addr) return "";
    return addr.slice(0, 4) + "…" + addr.slice(-6);
  }

  function who(addr, label, from) {
    if (!addr) return esc(label || "");
    let href = "/u/" + encodeURIComponent(addr);
    const safe = safeFrom(from);
    if (safe) href += "?from=" + encodeURIComponent(safe);
    return `<a class="who" href="${esc(href)}" data-nav>${esc(label || shortCa(addr))}</a>`;
  }

  function safeFrom(raw) {
    const s = String(raw || "");
    if (/^\/campaigns\/[A-Za-z0-9_-]+$/.test(s) || /^\/launch\/[A-Za-z0-9_-]+$/.test(s)) return s;
    return "";
  }

  function solscanUrl(addr) {
    return "https://solscan.io/account/" + addr;
  }

  function vaultAddressBlock(address) {
    if (!address) return "";
    const href = solscanUrl(address);
    return `<a class="addr addr-link" href="${esc(href)}" target="_blank" rel="noopener" title="View on Solscan" style="margin-top:.6rem">${esc(address)}</a>
          <div class="fund-actions" style="margin-top:.65rem">
            <a class="btn fund-btn" target="_blank" rel="noopener" href="${esc(href)}">View on Solscan</a>
          </div>`;
  }

  function normalizeHandle(raw) {
    return String(raw || "").trim().replace(/^@+/, "");
  }

  function handleHint(raw) {
    const h = normalizeHandle(raw);
    if (!h) return "3–20 characters. Start with a letter. Letters, numbers, and underscores only.";
    if (h.length < 3) return "At least 3 characters.";
    if (h.length > 20) return "20 characters max.";
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(h)) return "Start with a letter. Only letters, numbers, and underscores.";
    if (/__/.test(h)) return "No double underscores.";
    return "";
  }

  function avatarMarkup(url, sizeClass) {
    const src = url || "/assets/userclippdpfpusre.png";
    return `<img class="avatar ${sizeClass || ""}" src="${esc(src)}" alt="" decoding="async" width="48" height="48">`;
  }

  function bindCopyCa() {
    document.querySelectorAll("[data-ca]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ca = btn.getAttribute("data-ca") || "";
        if (ca) navigator.clipboard.writeText(ca);
        flashCopied(btn, "Copied");
      });
    });
  }

  function flashCopied(btn, doneText) {
    if (!btn) return;
    const label = btn.querySelector("[data-copy-label]") || btn.querySelector(".camp-ca-action") || btn;
    if (btn._copyPrev == null) btn._copyPrev = label.textContent;
    btn.classList.add("copied");
    label.textContent = doneText || "Copied";
    clearTimeout(btn._copyT);
    btn._copyT = setTimeout(() => {
      btn.classList.remove("copied");
      label.textContent = btn._copyPrev;
    }, 1400);
  }

  function fieldHead(label, name) {
    return `<div class="field-head"><span>${label}</span><span class="field-err" data-err="${esc(name)}" hidden></span></div>`;
  }

  function clearLaunchErrors() {
    document.querySelectorAll("[data-err]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
    });
    document.querySelectorAll(".input-bad").forEach((el) => el.classList.remove("input-bad"));
    const err = document.getElementById("launch-err");
    if (err) err.textContent = "";
  }

  function setLaunchErrors(map) {
    clearLaunchErrors();
    Object.keys(map).forEach((name) => {
      const el = document.querySelector("[data-err='" + name + "']");
      if (el) {
        el.textContent = map[name];
        el.hidden = false;
      }
      const input = document.querySelector("[name='" + name + "']");
      if (input) input.classList.add("input-bad");
    });
    const first = document.querySelector(".input-bad");
    if (first) first.focus();
  }

  function tokenMark(c, size) {
    const n = size || 44;
    if (c.image) {
      return `<img src="${esc(c.image)}" alt="${esc(c.ticker)}" width="${n}" height="${n}" decoding="async" style="width:${n}px;height:${n}px;border-radius:12px;object-fit:cover;flex-shrink:0;box-shadow:inset 0 0 0 1px ${esc(c.color || "#60cb89")}55">`;
    }
    const letters = String(c.ticker || "$").replace("$", "").slice(0, 3).toUpperCase() || "TKR";
    const color = c.color || "#60cb89";
    return `<div style="width:${n}px;height:${n}px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:${esc(color)}18;color:${esc(color)};box-shadow:inset 0 0 0 1px ${esc(color)}55">${esc(letters)}</div>`;
  }

  function campaignCard(c) {
    const spent = Number(c.spent_usd || 0);
    const budget = Number(c.budget_usd || 0);
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const plats = c.platforms && c.platforms.length ? c.platforms : PLATFORMS;
    const live = c.status === "live" || c.demo;
    const href = !live && c.status === "awaiting_deposit" ? "/launch/" + c.id : "/campaigns/" + c.id;
    return `
      <a class="glass-card glass-card-hover camp-card p-5" href="${esc(href)}" data-nav>
        <div style="display:flex;align-items:flex-start;gap:.75rem">
          ${tokenMark(c, 44)}
          <div style="min-width:0;flex:1">
            <div style="font-size:15px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.ticker)} · ${esc(c.name)}</div>
            <div style="margin-top:.35rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
              ${live ? `<span class="badge badge-live"><span class="pulse"></span> Active</span>` : statusBadge(c)}
              <span class="meta" style="margin:0">${daysLeft(c)} days left</span>
            </div>
          </div>
        </div>
        ${
          c.contract
            ? `<button type="button" class="camp-ca" data-ca="${esc(c.contract)}"><span class="camp-ca-left"><span class="camp-ca-k">CA</span> <span class="mono camp-ca-addr">${esc(shortCa(c.contract))}</span></span><span class="camp-ca-action">Copy</span></button>`
            : ""
        }
        <div style="margin-top:1.15rem">
          <div class="label">Campaign vault</div>
          <div class="stat" style="margin-top:.2rem;font-size:1.85rem">${usd(budget)}</div>
        </div>
        <div style="margin-top:1rem">
          <div class="label">Platforms</div>
          <div class="plat-row" style="margin-top:.5rem">${plats.map((p) => platIcon(p, 16)).join("")}</div>
        </div>
        <div style="margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--hairline)">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
            <span><b style="color:var(--foreground)">${usd(spent)}</b> paid out</span>
            <span>of <b style="color:var(--foreground)">${usd(budget)}</b></span>
          </div>
          <div style="margin-top:.4rem;height:6px;border-radius:99px;background:var(--surface);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:99px"></div>
          </div>
          <div style="margin-top:.4rem;display:flex;justify-content:space-between;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">
            <span>${pct}% used</span>
            <span>Min ${(c.min_views || 0).toLocaleString()} views to qualify</span>
          </div>
        </div>
      </a>`;
  }

  async function pageCampaigns() {
    paint("campaigns", `<p class="mk-lead">Loading campaigns…</p>`);
    let campaigns = [];
    let err = "";
    try {
      campaigns = (await api("/api/campaigns")).campaigns || [];
    } catch (e) {
      err = e.message;
    }
    const shown = campaigns.filter((c) => c.status === "live" || c.demo);
    const live = shown.filter((c) => c.status === "live" || c.demo);
    const pool = shown.reduce((s, c) => s + Number(c.budget_usd || 0), 0);
    const paid = shown.reduce((s, c) => s + Number(c.spent_usd || 0), 0);
    const clips = shown.reduce((s, c) => s + Number(c.clip_count || (c.submissions && c.submissions.length) || 0), 0);
    paint(
      "campaigns",
      `
      <div class="page-badge"><span class="pulse"></span> Open marketplace · Paid in SOL from campaign vaults</div>
      <div class="page-head">
        <div>
          <h1 class="page-title">Campaigns</h1>
          <p class="page-sub">Live campaigns only. Fund a vault to appear here.</p>
        </div>
        <a class="btn-pill go primary" href="/launch" data-nav>Launch a campaign</a>
      </div>
      <div class="stat-strip">
        <div class="stat-cell"><div class="label">Total vault</div><div class="stat accent">${usd(pool)}</div></div>
        <div class="stat-cell"><div class="label">Paid out</div><div class="stat">${usd(paid)}</div></div>
        <div class="stat-cell"><div class="label">Clips submitted</div><div class="stat">${clips}</div></div>
        <div class="stat-cell"><div class="label">Campaigns</div><div class="stat">${shown.length}</div></div>
      </div>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      ${
        !shown.length
          ? `<div class="empty card" style="margin-top:2rem">No campaigns yet. Launch one to get a vault.</div>`
          : `<div class="camp-grid">${shown.map(campaignCard).join("")}</div>`
      }`
    );
    bindCopyCa();
  }

  function embedBlock(clip) {
    const iframe = clip.embed && clip.embed.iframe;
    if (iframe) {
      return `<iframe class="embed" src="${esc(iframe)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    return `<div class="empty">Open the ${esc(clip.platform)} post →</div>`;
  }

  async function pageCampaign(id) {
    paint("campaigns", `<p class="mk-lead">Loading campaign…</p>`);
    let c, err;
    try {
      c = (await api("/api/campaigns/" + id)).campaign;
    } catch (e) {
      err = e.message;
    }
    if (!c) {
      paint("campaigns", `<h1 class="mk-h1">Not found.</h1><p class="err">${esc(err || "")}</p><p><a href="/campaigns" data-nav>Back to campaigns</a></p>`);
      return;
    }
    if (c.status && c.status !== "live" && !c.demo) {
      paint(
        "campaigns",
        `<h1 class="mk-h1">Not live yet.</h1><p class="mk-lead">Campaigns only appear here after the vault is funded.</p><p><a href="/campaigns" data-nav>Back to campaigns</a></p>`
      );
      return;
    }
    const clips = c.submissions || [];
    paint(
      "campaigns",
      `
      <a href="/campaigns" data-nav class="mk-kicker">← All campaigns</a>
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;align-items:flex-end;margin-top:.5rem">
        <div>
          <h1 class="mk-h1">${esc(c.ticker)}</h1>
          <p class="mk-lead" style="margin-top:.6rem">${esc(c.name)} ${statusBadge(c)}</p>
        </div>
        <div style="text-align:right">
          <div class="label">Budget · vault</div>
          <div class="stat">${usd(c.budget_usd)}</div>
          <div class="meta" style="text-align:right">${esc(sol(c.received_sol || 0))} received</div>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:1.5rem">
        <div class="card">
          <div class="label">This campaign’s terms</div>
          ${c.rate_per_1k_usd ? `<div class="stat">${usd(c.rate_per_1k_usd)} <span class="stat-note">/ 1K views · set by the creator</span></div>` : `<p class="meta">Creator did not publish a per-1K rate.</p>`}
          ${c.ugc_rate_per_1k_usd ? `<p class="meta">UGC / face-cam ${usd(c.ugc_rate_per_1k_usd)} / 1K</p>` : ""}
          ${c.viral_bonus_usd ? `<p class="meta">Viral bonus ${usd(c.viral_bonus_usd)}</p>` : ""}
          <p class="meta">Min ${esc(String(c.min_views))} views · ${esc(String(c.duration_days))} days</p>
          <div class="plat-row" style="margin-top:.75rem">${(c.platforms || []).map((p) => platIcon(p, 18)).join("")}</div>
          ${c.hashtag ? `<p class="meta">${esc(c.hashtag)}</p>` : ""}
          ${c.creator_wallet ? `<p class="meta">Creator ${who(c.creator_wallet, c.creator_handle || shortCa(c.creator_wallet), "/campaigns/" + c.id)}</p>` : ""}
          ${
            c.contract
              ? `<button type="button" class="camp-ca" data-ca="${esc(c.contract)}" style="margin-top:.85rem"><span class="camp-ca-left"><span class="camp-ca-k">CA</span> <span class="mono camp-ca-addr">${esc(shortCa(c.contract))}</span></span><span class="camp-ca-action">Copy</span></button>`
              : ""
          }
          ${c.brief ? `<p style="margin-top:1rem;line-height:1.6">${esc(c.brief)}</p>` : ""}
        </div>
        <div class="card">
          <div class="label">Campaign vault</div>
          ${
            c.vault_demo || !c.vault_address
              ? `<p class="meta" style="margin-top:.6rem;line-height:1.55">This is a demo campaign, so there is no on-chain wallet.<br/><br/>On a real campaign, Clipd creates a Solana vault for that campaign only. The creator sends SOL there. When a clip’s views verify, that vault pays the clipper.</p>`
              : `${vaultAddressBlock(c.vault_address)}
          <p class="meta">vault for ${esc(c.ticker)} only</p>
          ${c.status !== "live" ? `<p class="err" style="margin-top:1rem">This campaign is not live until the counted SOL covers the live quote.</p>` : `<p class="ok" style="margin-top:1rem">Vault funded. Submit a clip below.</p>`}`
          }
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:1.5rem">
        <form id="clip-form" class="card">
          <div class="label">Submit a clip</div>
          <p class="meta" style="margin-bottom:1rem">Paste a TikTok, Instagram, YouTube, or X link. Connect a wallet first.</p>
          <div class="field"><label>Clip URL</label><input name="url" placeholder="https://www.tiktok.com/@you/video/…" required></div>
          <div class="field"><label>Handle (optional)</label><input name="handle" placeholder="@yourhandle"></div>
          <button class="btn btn-primary" ${c.status !== "live" ? "disabled" : ""}>Submit clip</button>
          <div class="err" id="clip-err"></div>
        </form>
        <div class="card">
          <div class="label">Submitted</div>
          <div class="stat">${clips.length}</div>
          <p class="meta">TikTok, Instagram, YouTube, and X posts show here as they come in.</p>
        </div>
      </div>
      <h2 style="margin:2.5rem 0 1rem;font-size:1.6rem;letter-spacing:-.04em">Clips</h2>
      ${
        !clips.length
          ? `<div class="empty card">Nothing submitted yet.</div>`
          : `<div class="clips">${clips
              .map(
                (clip) => `
            <article class="card">
              <div class="clip-top">
                <div>
                  <div class="badge badge-live">${esc(clip.platform)}</div>
                  <div class="meta">${clip.clipper_wallet ? who(clip.clipper_wallet, clip.clipper_username || clip.handle || shortCa(clip.clipper_wallet), "/campaigns/" + id) : esc(clip.handle || "")} · ${esc(when(clip.created_at))}</div>
                </div>
                <a class="btn btn-ghost btn-sm" href="${esc(clip.url)}" target="_blank" rel="noopener">Open post</a>
              </div>
              ${embedBlock(clip)}
            </article>`
              )
              .join("")}</div>`
      }`
    );
    bindCopyCa();

    const form = document.getElementById("clip-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById("clip-err");
        errEl.textContent = "";
        const fd = new FormData(form);
        try {
          const w = walletOrThrow();
          await api("/api/campaigns/" + id + "/clips", {
            method: "POST",
            body: JSON.stringify({ url: fd.get("url"), handle: fd.get("handle"), clipper_wallet: w.address, clipper_wallet_name: w.wallet }),
          });
          pageCampaign(id);
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }
  }

  function readLaunchFields() {
    const d = launchDraft;
    const val = (name) => {
      const el = document.querySelector("[name='" + name + "']");
      return el ? el.value : d[name];
    };
    d.ticker = val("ticker");
    d.name = val("name");
    d.contract = val("contract");
    d.hashtag = val("hashtag");
    d.brief = val("brief");
    ["budget_usd", "rate_per_1k_usd", "ugc_rate_per_1k_usd", "viral_bonus_usd", "min_views", "duration_days"].forEach((k) => {
      const el = document.querySelector("[name='" + k + "']");
      if (!el) return;
      d[k] = el.value === "" ? "" : Number(el.value);
    });
  }

  function stepper(step) {
    const names = ["Project", "Terms & platforms", "Rules & vault"];
    return `<div class="stepper">${names
      .map((n, i) => {
        const s = i + 1;
        const cls = step > s ? "done" : step === s ? "on" : "";
        return `<div class="stepper-item">
          <div class="step-num ${cls}">${step > s ? "✓" : s}</div>
          <div class="step-lab ${step === s ? "on" : ""}">${n}</div>
          ${i < names.length - 1 ? `<div class="step-line"></div>` : ""}
        </div>`;
      })
      .join("")}</div>`;
  }

  async function pageLaunch(payId) {
    if (payId) return pageFund(payId);
    const d = launchDraft;
    let quote = { empty: Number(d.budget_usd) < MIN_BUDGET_USD, usd: d.budget_usd, sol: 0, sol_price_usd: 0 };

    const step1 = `
      <div class="field"><label>Token image</label>
        <div style="display:flex;align-items:center;gap:1rem">
          <label class="token-up">${d.image ? `<img src="${esc(d.image)}" alt="">` : `<span class="label" style="text-align:center;padding:.5rem">Upload</span>`}<input id="token-file" type="file" accept="image/*"></label>
          <div class="meta" style="margin:0">Square PNG or JPG. This shows on your campaign cards.${d.image ? ` <button type="button" id="token-remove" class="btn-pill" style="padding:.2rem .6rem">Remove</button>` : ""}</div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">${fieldHead("Ticker *", "ticker")}<input class="input" name="ticker" placeholder="$COIN" value="${esc(d.ticker)}"></div>
        <div class="field">${fieldHead("Project name *", "name")}<input class="input" name="name" placeholder="Your coin" value="${esc(d.name)}"></div>
      </div>
      <div class="field"><label>Contract address</label><input class="input mono" name="contract" placeholder="Your token CA" value="${esc(d.contract)}"></div>
      <div class="field"><label>Campaign hashtag</label><input class="input" name="hashtag" placeholder="#coin" value="${esc(d.hashtag)}"></div>`;

    const step2 = `
      <p class="meta" style="margin:0 0 1rem">Clipd has no rate card. Budget, payout, bonuses, and platforms are all yours. Minimum budget is $${MIN_BUDGET_USD} USD.</p>
      <div class="grid grid-2">
        <div class="field">${fieldHead("Total budget (USD)", "budget_usd")}<input class="input" name="budget_usd" type="number" min="${MIN_BUDGET_USD}" step="1" placeholder="0" value="${esc(d.budget_usd)}"><p class="meta" style="margin:.35rem 0 0">Floor is $${MIN_BUDGET_USD}. Quoted live in SOL.</p></div>
        <div class="field"><label>Min views to qualify</label><input class="input" name="min_views" type="number" min="0" step="100" value="${esc(d.min_views)}"></div>
        <div class="field">${fieldHead("Pay per 1,000 views (USD)", "rate_per_1k_usd")}<input class="input" name="rate_per_1k_usd" type="number" min="0.01" step="0.05" placeholder="e.g. 2.00" value="${esc(d.rate_per_1k_usd)}"><p class="meta" style="margin:.35rem 0 0">What you pay a clipper from this vault for every 1,000 verified views. $2.00 → 10,000 views = $20.</p></div>
        <div class="field"><label>UGC / face-cam pay per 1K (optional)</label><input class="input" name="ugc_rate_per_1k_usd" type="number" min="0" step="0.05" placeholder="Optional extra" value="${esc(d.ugc_rate_per_1k_usd)}"><p class="meta" style="margin:.35rem 0 0">Only if you want to pay more for face-on-camera clips.</p></div>
        <div class="field"><label>Viral bonus USD (optional)</label><input class="input" name="viral_bonus_usd" type="number" min="0" step="1" placeholder="Optional" value="${esc(d.viral_bonus_usd)}"></div>
        <div class="field"><label>Duration (days)</label><input class="input" name="duration_days" type="number" min="1" value="${esc(d.duration_days)}"></div>
      </div>
      <div class="field"><label>Allowed platforms</label>
        <div class="plat-row" style="flex-wrap:wrap;gap:.5rem">
          ${PLATFORMS.map((p) => {
            const on = d.platforms.includes(p) ? "on" : "";
            return `<button type="button" class="plat-chip ${on}" data-plat="${p}">${platIcon(p, 16)}${p}</button>`;
          }).join("")}
        </div>
      </div>`;

    const step3 = `
      <div class="field"><label>Rules &amp; requirements</label>
        <textarea class="input" name="brief" rows="8" placeholder="• Post must include ${esc(d.hashtag || "#hashtag")}\n• Original edits only\n• No AI voice-over\n• Payout after ${esc(String(d.min_views))} views">${esc(d.brief)}</textarea>
      </div>
      <div class="warn">On launch Clipd creates a real Solana vault for this campaign and saves it against this campaign ID. You send the quoted SOL to that address.</div>`;

    const previewTick = d.ticker ? (d.ticker.startsWith("$") ? d.ticker.toUpperCase() : "$" + d.ticker.toUpperCase()) : "$TICKER";

    paint(
      "launch",
      `
      <div class="page-head">
        <div>
          <div class="mk-kicker">Campaigns</div>
          <h1 class="page-title" style="margin-top:.5rem">Launch a campaign</h1>
          <p class="page-sub">You set every term. Clipd creates a Solana vault for this campaign and goes live when the SOL lands.</p>
        </div>
      </div>
      <div class="launch-grid">
        <form id="launch-form" class="launch-form">
          ${stepper(d.step)}
          <div style="margin-top:1.5rem">${d.step === 1 ? step1 : d.step === 2 ? step2 : step3}</div>
          <div class="launch-nav">
            <button type="button" class="btn-pill" id="launch-back">${d.step === 1 ? "Cancel" : "← Back"}</button>
            ${
              d.step < 3
                ? `<button type="button" class="btn-pill go" id="launch-next">Continue →</button>`
                : `<button type="submit" class="btn-pill go primary" id="launch-submit">Create vault &amp; launch</button>`
            }
          </div>
          <div class="err" id="launch-err"></div>
        </form>
        <aside>
          <div class="preview-card">
            <div class="label">Preview</div>
            <div style="margin-top:1rem;display:flex;align-items:flex-start;gap:.75rem">
              ${tokenMark({ ticker: previewTick, name: d.name, image: d.image, color: "#60cb89" }, 44)}
              <div>
                <div style="font-weight:800;font-size:14px">${esc(previewTick)}</div>
                <div class="meta" style="margin:.2rem 0 0">${esc(d.name || "Project name")}</div>
              </div>
            </div>
            <div class="grid grid-2" style="margin-top:1rem;gap:.5rem">
              <div class="mini-stat"><div class="label">Budget</div><div style="font-weight:800;margin-top:.2rem">${d.budget_usd === "" || d.budget_usd == null ? "—" : usd(d.budget_usd)}</div></div>
              <div class="mini-stat"><div class="label">Your rate</div><div style="font-weight:800;margin-top:.2rem">${d.rate_per_1k_usd === "" || d.rate_per_1k_usd == null ? "—" : "$" + esc(d.rate_per_1k_usd) + "/1K"}</div></div>
            </div>
            <div class="plat-row" style="margin-top:1rem">${d.platforms.map((p) => platIcon(p, 16)).join("")}</div>
          </div>
          <div class="preview-card" style="margin-top:1rem;background:linear-gradient(180deg, color-mix(in oklab, var(--primary) 10%, #fff), #fff)">
            <div class="label" style="color:var(--primary)">Campaign vault</div>
            <div class="stat" id="quote-sol" style="margin-top:.5rem">${quote.sol ? sol(quote.sol) : "—"}</div>
            <p class="meta" id="quote-meta">${quote.error ? esc(quote.error) : quote.sol_price_usd ? usd(quote.sol_price_usd) + " / SOL · " + usd(quote.usd) + " budget · live" : "Enter a budget to quote SOL."}</p>
            <p class="meta">USD budget quoted in SOL. Price refreshes every 15 seconds.</p>
          </div>
        </aside>
      </div>`
    );

    const file = document.getElementById("token-file");
    if (file) {
      file.addEventListener("change", () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          launchDraft.image = String(reader.result || "");
          readLaunchFields();
          pageLaunch();
        };
        reader.readAsDataURL(f);
      });
    }
    const remove = document.getElementById("token-remove");
    if (remove) {
      remove.onclick = () => {
        launchDraft.image = "";
        readLaunchFields();
        pageLaunch();
      };
    }
    document.querySelectorAll("[data-plat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        readLaunchFields();
        const p = btn.getAttribute("data-plat");
        if (d.platforms.includes(p)) d.platforms = d.platforms.filter((x) => x !== p);
        else d.platforms = d.platforms.concat(p);
        if (!d.platforms.length) d.platforms = [p];
        pageLaunch();
      });
    });
    const budget = document.querySelector("[name='budget_usd']");
    if (budget) {
      budget.addEventListener("input", () => {
        clearTimeout(budget._t);
        budget._t = setTimeout(async () => {
          try {
            paintQuote(await fetchQuote(budget.value));
          } catch (e) {
            paintQuote({ error: e.message || "Could not fetch SOL price" });
          }
        }, 250);
      });
    }
    const back = document.getElementById("launch-back");
    if (back) {
      back.onclick = () => {
        readLaunchFields();
        if (d.step === 1) return go("/campaigns");
        d.step -= 1;
        pageLaunch();
      };
    }
    const next = document.getElementById("launch-next");
    if (next) {
      next.onclick = () => {
        readLaunchFields();
        if (d.step === 1) {
          const errs = {};
          if (!String(d.ticker).trim()) errs.ticker = "Required";
          if (!String(d.name).trim()) errs.name = "Required";
          if (Object.keys(errs).length) return setLaunchErrors(errs);
        }
        if (d.step === 2) {
          const errs = {};
          if (!(Number(d.budget_usd) >= MIN_BUDGET_USD)) errs.budget_usd = "Minimum is $" + MIN_BUDGET_USD;
          if (!(Number(d.rate_per_1k_usd) > 0)) errs.rate_per_1k_usd = "Required";
          if (Object.keys(errs).length) return setLaunchErrors(errs);
        }
        d.step += 1;
        pageLaunch();
      };
    }
    const form = document.getElementById("launch-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      readLaunchFields();
      const errEl = document.getElementById("launch-err");
      errEl.textContent = "";
      try {
        const w = walletOrThrow();
        if (Number(d.budget_usd) < MIN_BUDGET_USD) {
          setLaunchErrors({ budget_usd: "Minimum is $" + MIN_BUDGET_USD });
          return;
        }
        if (!(Number(d.rate_per_1k_usd) > 0)) {
          setLaunchErrors({ rate_per_1k_usd: "Required" });
          return;
        }
        const created = await api("/api/campaigns", {
          method: "POST",
          body: JSON.stringify({
            ticker: d.ticker,
            name: d.name,
            contract: d.contract,
            brief: d.brief,
            hashtag: d.hashtag,
            image: d.image,
            budget_usd: Number(d.budget_usd),
            rate_per_1k_usd: Number(d.rate_per_1k_usd),
            ugc_rate_per_1k_usd: d.ugc_rate_per_1k_usd || null,
            viral_bonus_usd: d.viral_bonus_usd || null,
            min_views: Number(d.min_views),
            duration_days: Number(d.duration_days),
            platforms: d.platforms,
            creator_wallet: w.address,
            creator_wallet_name: w.wallet,
          }),
        });
        launchDraft.step = 1;
        go("/launch/" + created.campaign.id);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
    startQuotePoll(() => {
      const el = document.querySelector("[name='budget_usd']");
      return el ? el.value : d.budget_usd;
    });
  }

  async function pageFund(id, silent) {
    clearTimeout(fundTimer);
    const existing = document.getElementById("fund-page");
    if (!silent && !existing) {
      paint("launch", `<p class="mk-lead">Setting up the vault…</p>`);
    }
    let c;
    try {
      c = (await api("/api/campaigns/" + id)).campaign;
    } catch (e) {
      paint("launch", `<h1 class="mk-h1">Campaign not found.</h1><p class="err">${esc(e.message)}</p><p><a href="/campaigns" data-nav>← Campaigns</a></p>`);
      return;
    }
    if (path() !== "/launch/" + id) return;
    const funded = c.status === "live";
    const seed = Number(c.seed_lamports || 0) / 1e9;
    const net = c.net_received_sol != null ? Number(c.net_received_sol) : Math.max(0, Number(c.received_sol || 0) - seed);
    const remaining = c.remaining_sol != null ? Number(c.remaining_sol) : Math.max(0, Number(c.expected_sol || 0) - net);
    const onchain = !!c.vault_onchain;

    function paintFundNumbers() {
      const page = document.getElementById("fund-page");
      if (page) page.setAttribute("data-net-lamports", String(Math.round(net * 1e9)));
      const rec = document.getElementById("fund-received");
      if (rec) {
        rec.textContent = funded
          ? "Counted " + sol(net) + " · funded"
          : "Counted " + sol(net) + " of " + sol(c.expected_sol) + " · " + sol(remaining) + " still due";
      }
      const need = document.getElementById("fund-need");
      if (need) need.textContent = sol(c.expected_sol);
      const bal = document.getElementById("fund-onchain-balance");
      if (bal) bal.textContent = sol(c.received_sol || 0);
      const counted = document.getElementById("fund-counted");
      if (counted) counted.textContent = sol(net);
      const rem = document.getElementById("fund-remaining");
      if (rem) rem.textContent = funded ? sol(0) : sol(remaining);
      const badge = document.getElementById("fund-onchain-badge");
      if (badge) {
        badge.className = "fund-badge " + (onchain ? "on" : "off");
        badge.textContent = onchain ? "On Solana" : "Opening on Solana";
      }
      paintQuote({ sol: c.expected_sol, usd: c.budget_usd, sol_price_usd: c.sol_price_usd, lamports: c.expected_lamports });
      const copySolLive = document.getElementById("copy-sol");
      if (copySolLive) copySolLive.setAttribute("data-sol", solCopy(c.expected_sol));
    }

    if (silent && existing && !funded) {
      paintFundNumbers();
      fundTimer = setTimeout(() => {
        if (path() === "/launch/" + id) pageFund(id, true);
      }, 5000);
      return;
    }

    paint(
      "launch",
      `
      <div id="fund-page" data-net-lamports="${esc(Math.round(net * 1e9))}">
        <a href="/campaigns" data-nav class="mk-kicker">← Campaigns</a>
        <div class="mk-kicker" style="margin-top:1rem">${funded ? "Live" : "Fund the vault"}</div>
        <h1 class="mk-h1">${esc(c.ticker)}</h1>
        <p class="mk-lead">Send the quoted SOL to this campaign’s vault. Clipd checks the mainnet balance and the exact amount. When it matches, the campaign goes live.</p>
        <div class="grid grid-2" style="margin-top:1.5rem">
          <div class="card">
            <div class="label">Send this exact amount</div>
            <div class="fund-send-row">
              <div class="stat" id="fund-send">${esc(sol(c.expected_sol))}</div>
              ${
                funded
                  ? ""
                  : `<button class="btn fund-btn" id="copy-sol" type="button" data-sol="${esc(solCopy(c.expected_sol))}"><span data-copy-label>Copy amount</span></button>`
              }
            </div>
            <p class="meta" id="fund-price">${usd(c.budget_usd)} at ${usd(c.sol_price_usd)} / SOL · live</p>
            <div class="label" style="margin-top:1.25rem">This campaign’s vault</div>
            <a class="addr addr-link" id="vault-addr" href="${esc(solscanUrl(c.vault_address))}" target="_blank" rel="noopener" title="View on Solscan">${esc(c.vault_address)}</a>
            <div class="fund-actions">
              <button class="btn fund-btn" id="copy-addr" type="button"><span data-copy-label>Copy address</span></button>
              ${c.vault_address ? `<a class="btn fund-btn" target="_blank" rel="noopener" href="${esc(solscanUrl(c.vault_address))}">View on Solscan</a>` : ""}
              <span id="fund-onchain-badge" class="fund-badge ${onchain ? "on" : "off"}">${onchain ? "On Solana" : "Opening on Solana"}</span>
            </div>
            <div class="fund-ledger">
              <div class="fund-ledger-row"><span>Campaign ID</span><strong class="mono">${esc(c.id)}</strong></div>
              <div class="fund-ledger-row"><span>Coin</span><strong>${esc(c.ticker)}${c.name ? " · " + esc(c.name) : ""}</strong></div>
              <div class="fund-ledger-row"><span>Need (live quote)</span><strong id="fund-need">${esc(sol(c.expected_sol))}</strong></div>
              <div class="fund-ledger-row"><span>On-chain balance</span><strong id="fund-onchain-balance">${esc(sol(c.received_sol || 0))}</strong></div>
              <div class="fund-ledger-row"><span>Counted toward campaign</span><strong id="fund-counted">${esc(sol(net))}</strong></div>
              <div class="fund-ledger-row"><span>Still due</span><strong id="fund-remaining">${esc(funded ? sol(0) : sol(remaining))}</strong></div>
            </div>
            <p class="meta" id="fund-received" style="margin-top:1rem">${
              funded
                ? "Counted " + sol(net) + " · funded"
                : "Counted " + sol(net) + " of " + sol(c.expected_sol) + " · " + sol(remaining) + " still due"
            }</p>
            ${seed > 0 ? `<p class="meta">A tiny rent amount to open the account is not counted as funding.</p>` : ""}
          </div>
          <div class="card">
            ${
              funded
                ? `<div class="ok">Vault funded. Campaign is live.</div>
                   <div class="mk-row" style="margin-top:1rem"><a class="btn btn-primary" href="/campaigns/${esc(c.id)}" data-nav>Open campaign</a></div>`
                : `<div class="warn">Waiting for SOL. Send from Phantom, Solflare, or any wallet. We check Solana in the background.</div>`
            }
            <div class="label" style="margin-top:1.25rem">How funding works</div>
            <ul class="fund-steps">
              <li>Clipd creates one Solana vault per campaign. This campaign ID is locked to the address on the left. A different campaign gets a different vault.</li>
              <li>You send the live quoted SOL to that vault. The USD→SOL amount refreshes every 15 seconds.</li>
              <li>Every few seconds Clipd reads the vault on Solana mainnet and checks the exact amount against the live quote.</li>
              <li>When counted SOL covers the current quote, the campaign goes live and clippers can submit.</li>
            </ul>
          </div>
        </div>
      </div>`
    );

    const copyAddr = document.getElementById("copy-addr");
    if (copyAddr && c.vault_address) {
      copyAddr.onclick = () => {
        navigator.clipboard.writeText(c.vault_address);
        flashCopied(copyAddr);
      };
    }
    const copySol = document.getElementById("copy-sol");
    if (copySol) {
      copySol.onclick = () => {
        navigator.clipboard.writeText(copySol.getAttribute("data-sol") || solCopy(c.expected_sol));
        flashCopied(copySol);
      };
    }
    if (!funded) {
      startQuotePoll(() => c.budget_usd);
      fundTimer = setTimeout(() => {
        if (path() === "/launch/" + id) pageFund(id, true);
      }, 5000);
    } else {
      stopQuotePoll();
    }
  }

  async function pageOps() {
    document.title = "Clipd ops";
    const res = await fetch("/api/ops/vaults", { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 503) {
      paint(
        "",
        `
        <div class="page-head">
          <div>
            <div class="mk-kicker">Operator</div>
            <h1 class="page-title" style="margin-top:.5rem">Campaign vaults</h1>
            <p class="page-sub">Private keys for live campaign vaults. Password only. This page is not in the public nav.</p>
            <p class="meta">This list is only the vaults stored on <strong>${esc(location.host)}</strong>. Campaigns launched on another host are a different list.</p>
          </div>
        </div>
        <form id="ops-form" class="card" style="max-width:28rem">
          <div class="field">
            ${fieldHead("Password", "password")}
            <input class="input" name="password" type="password" autocomplete="current-password" autofocus>
          </div>
          <button class="btn btn-primary" type="submit">Unlock</button>
          <p class="err" id="ops-err">${res.status === 503 ? esc(data.error || "") : ""}</p>
        </form>`
      );
      const form = document.getElementById("ops-form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const err = document.getElementById("ops-err");
        if (err) err.textContent = "";
        try {
          const r = await fetch("/api/ops/unlock", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: form.password.value }),
          });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error || "Could not unlock");
          pageOps();
        } catch (ex) {
          if (err) err.textContent = ex.message;
        }
      });
      return;
    }
    if (!res.ok) {
      paint("", `<h1 class="mk-h1">Could not load vaults.</h1><p class="err">${esc(data.error || "")}</p>`);
      return;
    }
    const vaults = (data.vaults || []).filter((v) => v.status === "live");
    paint(
      "",
      `
      <div class="page-head">
        <div>
          <div class="mk-kicker">Operator</div>
          <h1 class="page-title" style="margin-top:.5rem">Campaign vaults</h1>
          <p class="page-sub">Live campaigns only. Awaiting-deposit vaults stay off this page.</p>
          <p class="meta">Vaults on <strong>${esc(location.host)}</strong>. Localhost and getclippd.fun do not share keys.</p>
        </div>
        <button type="button" class="btn-pill" id="ops-clear">Remove all campaigns</button>
        <button type="button" class="btn-pill" id="ops-lock">Lock</button>
      </div>
      ${
        !vaults.length
          ? `<div class="empty card">No live campaign vaults.</div>`
          : vaults
              .map(
                (v) => `
        <article class="card ops-card">
          <div>
            <div style="font-weight:800">${esc(v.ticker || "")} · ${esc(v.name || "")}</div>
            <p class="meta" style="margin:.35rem 0 0">Campaign ID ${esc(v.campaign_id || "")} · ${esc(v.status || "")}${v.budget_usd != null ? " · " + usd(v.budget_usd) : ""}${v.vault_onchain ? " · on Solana" : ""}</p>
          </div>
          <div class="field" style="margin-top:1rem;margin-bottom:.6rem">
            <div class="field-head"><span>Public key</span></div>
            <div class="addr">${esc(v.address || "")}</div>
          </div>
          <div class="fund-actions">
            <button type="button" class="btn btn-primary fund-btn" data-copy="${esc(v.address || "")}"><span data-copy-label>Copy public</span></button>
            ${v.address ? `<a class="btn btn-primary fund-btn" target="_blank" rel="noopener" href="https://solscan.io/account/${esc(v.address)}">Solscan</a>` : ""}
          </div>
          <div class="field" style="margin-top:1.1rem;margin-bottom:.6rem">
            <div class="field-head"><span>Private key</span></div>
            <div class="addr ops-secret" data-secret="${esc(v.secret_base58 || "")}">••••••••••••••••</div>
          </div>
          <div class="fund-actions">
            <button type="button" class="btn btn-ghost fund-btn" data-reveal>Show</button>
            <button type="button" class="btn btn-primary fund-btn" data-copy="${esc(v.secret_base58 || "")}"><span data-copy-label>Copy private</span></button>
          </div>
        </article>`
              )
              .join("")
      }`
    );
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute("data-copy") || "";
        if (val) navigator.clipboard.writeText(val);
        flashCopied(btn);
      };
    });
    document.querySelectorAll("[data-reveal]").forEach((btn) => {
      btn.onclick = () => {
        const card = btn.closest(".ops-card");
        const el = card && card.querySelector(".ops-secret");
        if (!el) return;
        const secret = el.getAttribute("data-secret") || "";
        const on = el.classList.toggle("show");
        el.textContent = on ? secret : "••••••••••••••••";
        btn.textContent = on ? "Hide" : "Show";
      };
    });
    const clear = document.getElementById("ops-clear");
    if (clear) {
      clear.onclick = async () => {
        if (!confirm("Remove every campaign from this host? Profiles stay. Vault keys for those campaigns are deleted.")) return;
        try {
          const r = await fetch("/api/ops/clear-campaigns", { method: "POST", credentials: "same-origin" });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error || "Could not clear campaigns");
          pageOps();
        } catch (ex) {
          alert(ex.message);
        }
      };
    }
    const lock = document.getElementById("ops-lock");
    if (lock) {
      lock.onclick = async () => {
        await fetch("/api/ops/lock", { method: "POST", credentials: "same-origin" });
        pageOps();
      };
    }
  }

  async function pageProfile(addr) {
    paint("profile", `<p class="mk-lead">Loading profile…</p>`);
    let data, err;
    try {
      data = await api("/api/users/" + encodeURIComponent(addr));
    } catch (e) {
      err = e.message;
    }
    if (!data || !data.user) {
      paint("profile", `<h1 class="mk-h1">Not found.</h1><p class="err">${esc(err || "")}</p>`);
      return;
    }
    const u = data.user;
    const me = window.ClippdWallet && window.ClippdWallet.get && window.ClippdWallet.get();
    const mine = me && me.address === u.address;
    const handle = normalizeHandle(u.handle || "");
    const bio = u.bio || "";
    const avatar = u.avatar || "";
    const clips = data.clips || [];
    const camps = (data.campaigns || []).filter((c) => mine || c.status === "live" || c.demo);
    const backTo = safeFrom(new URLSearchParams(location.search).get("from"));
    const title = handle ? "@" + handle : shortCa(u.address);
    const handleLocked = !!u.handle_locked;
    const unlockLabel = u.handle_unlock_at ? when(u.handle_unlock_at) : "";
    let pendingAvatar = "";
    paint(
      "profile",
      `
      ${
        backTo
          ? `<a href="${esc(backTo)}" data-nav class="back-link">← Back to campaign</a>`
          : `<a href="/campaigns" data-nav class="back-link">← Campaigns</a>`
      }
      <div class="page-head profile-hero" style="margin-top:.85rem">
        <div class="profile-hero-main">
          ${avatarMarkup(avatar, "lg")}
          <div style="min-width:0">
            <div class="mk-kicker">Clipper</div>
            <h1 class="page-title" style="margin-top:.35rem">${esc(title)}</h1>
            <p class="page-sub mono" style="margin-top:.4rem">${esc(u.address)}</p>
            ${bio ? `<p class="profile-bio">${esc(bio)}</p>` : ""}
          </div>
        </div>
        ${
          mine
            ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button type="button" class="btn-pill go primary" id="edit-profile">Edit profile</button>
        <button type="button" class="btn-pill" id="copy-profile"><span data-copy-label>Copy wallet</span></button>
      </div>`
            : `<button type="button" class="btn-pill" id="copy-profile"><span data-copy-label>Copy wallet</span></button>`
        }
      </div>
      <div class="stat-strip">
        <div class="stat-cell"><div class="label">Clips submitted</div><div class="stat">${data.stats.clips}</div></div>
        <div class="stat-cell"><div class="label">Campaigns launched</div><div class="stat">${data.stats.campaigns}</div></div>
      </div>
      ${
        mine
          ? `<div id="clippd-profile-modal" hidden>
        <div class="cw-backdrop" data-profile-close></div>
        <div class="cw-sheet profile-sheet" role="dialog" aria-labelledby="profile-edit-title">
          <div class="cw-head">
            <div>
              <h3 id="profile-edit-title">Edit profile</h3>
              <p class="cw-lead">Usernames are unique. You can change yours once per day.</p>
            </div>
            <button type="button" class="cw-x" data-profile-close aria-label="Close">×</button>
          </div>
          <form id="profile-form" class="profile-edit" style="margin-top:1.1rem">
            <div style="display:flex;flex-wrap:wrap;gap:1.25rem;align-items:flex-start">
              <label class="avatar-up">
                <img class="avatar lg" id="avatar-preview" src="${esc(avatar || "/assets/userclippdpfpusre.png")}" alt="">
                <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                <span>Change photo</span>
              </label>
              <div style="flex:1;min-width:200px">
                <div class="field">
                  ${fieldHead("Username", "handle")}
                  <input class="input" name="handle" maxlength="20" placeholder="yourname" value="${esc(handle)}" autocomplete="username"${handleLocked ? " disabled" : ""}>
                  <p class="handle-hint" id="handle-hint">${
                    handleLocked
                      ? esc("Once per day. You can change it again " + (unlockLabel || "tomorrow") + ".")
                      : esc(handleHint(handle) || "Unique. Letters, numbers, underscores. Once per day.")
                  }</p>
                </div>
                <div class="field" style="margin-bottom:0">
                  ${fieldHead("Bio", "bio")}
                  <textarea class="input" name="bio" maxlength="160" placeholder="What you clip, what you launch.">${esc(bio)}</textarea>
                  <p class="handle-hint">160 characters max.</p>
                </div>
              </div>
            </div>
            <button class="btn-pill go primary" type="submit" style="margin-top:1.15rem">Save profile</button>
            <div class="err" id="profile-err"></div>
          </form>
        </div>
      </div>`
          : ""
      }
      <h2 style="margin:2.5rem 0 1rem;font-size:1.6rem;letter-spacing:-.04em">Clips</h2>
      ${
        !clips.length
          ? `<div class="empty card">No clips submitted yet.</div>`
          : `<div class="clips">${clips
              .map(
                (clip) => `
            <article class="card">
              <div class="clip-top">
                <div>
                  <div class="badge badge-live">${esc(clip.platform)}</div>
                  <div class="meta">${clip.campaign_id ? `<a href="/campaigns/${esc(clip.campaign_id)}" data-nav>${esc(clip.campaign_ticker || "Campaign")}</a>` : ""} · ${esc(when(clip.created_at))}</div>
                </div>
                <a class="btn btn-ghost btn-sm" href="${esc(clip.url)}" target="_blank" rel="noopener">Open post</a>
              </div>
              ${embedBlock(clip)}
            </article>`
              )
              .join("")}</div>`
      }
      <h2 style="margin:2.5rem 0 1rem;font-size:1.6rem;letter-spacing:-.04em">Campaigns launched</h2>
      ${
        !camps.length
          ? `<div class="empty card">No campaigns launched yet.</div>`
          : `<div class="camp-grid">${camps.map(campaignCard).join("")}</div>`
      }`
    );
    bindCopyCa();
    const copyBtn = document.getElementById("copy-profile");
    const modal = document.getElementById("clippd-profile-modal");
    const openEdit = document.getElementById("edit-profile");
    const closeProfile = () => {
      if (modal) modal.hidden = true;
    };
    if (openEdit && modal) {
      openEdit.onclick = () => {
        modal.hidden = false;
      };
      modal.querySelectorAll("[data-profile-close]").forEach((el) => {
        el.onclick = closeProfile;
      });
    }
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(u.address);
        flashCopied(copyBtn);
      };
    }
    const file = document.getElementById("avatar-file");
    const preview = document.getElementById("avatar-preview");
    if (file && preview) {
      file.addEventListener("change", () => {
        const f = file.files && file.files[0];
        const errEl = document.getElementById("profile-err");
        if (errEl) errEl.textContent = "";
        if (!f) return;
        if (f.size > 400 * 1024) {
          if (errEl) errEl.textContent = "Photo must be under 400KB.";
          file.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          pendingAvatar = String(reader.result || "");
          preview.src = pendingAvatar;
        };
        reader.readAsDataURL(f);
      });
    }
    const handleInput = document.querySelector("#profile-form [name='handle']");
    const hint = document.getElementById("handle-hint");
    if (handleInput && hint && !handleLocked) {
      handleInput.addEventListener("input", () => {
        hint.textContent = handleHint(handleInput.value) || "Looks good.";
      });
    }
    const form = document.getElementById("profile-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById("profile-err");
        if (errEl) errEl.textContent = "";
        const nextHandle = handleLocked ? handle : normalizeHandle(new FormData(form).get("handle"));
        const hintText = handleLocked ? "" : handleHint(nextHandle);
        if (nextHandle && hintText) {
          if (errEl) errEl.textContent = hintText;
          return;
        }
        try {
          const body = {
            address: u.address,
            bio: new FormData(form).get("bio"),
            wallet_name: me && me.wallet,
          };
          if (!handleLocked) body.handle = nextHandle;
          if (pendingAvatar) body.avatar = pendingAvatar;
          await api("/api/users", { method: "POST", body: JSON.stringify(body) });
          pageProfile(addr);
        } catch (ex) {
          if (errEl) errEl.textContent = ex.message;
        }
      });
    }
  }

  async function render() {
    clearTimeout(fundTimer);
    stopQuotePoll();
    const p = path();
    document.title = "Clipd";
    if (p === "/campaigns") return pageCampaigns();
    let m = p.match(/^\/campaigns\/([^/]+)$/);
    if (m) return pageCampaign(m[1]);
    if (p === "/launch") return pageLaunch();
    m = p.match(/^\/launch\/([^/]+)$/);
    if (m) return pageLaunch(m[1]);
    m = p.match(/^\/u\/([^/]+)$/);
    if (m) return pageProfile(decodeURIComponent(m[1]));
    if (p === "/ops") return pageOps();
    location.replace("/");
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav]");
    if (!a) return;
    go(a.getAttribute("href"), e);
  });
  window.addEventListener("popstate", render);
  render();
  if (window.ClippdWallet && window.ClippdWallet.onChange) {
    window.ClippdWallet.onChange(() => {
      const links = document.querySelector(".mk-links");
      if (!links) return;
      const you = links.querySelector("[data-you]");
      const w = window.ClippdWallet.get && window.ClippdWallet.get();
      if (w && w.address) {
        if (you) {
          you.setAttribute("href", "/u/" + w.address);
          return;
        }
        const a = document.createElement("a");
        a.href = "/u/" + w.address;
        a.setAttribute("data-nav", "");
        a.setAttribute("data-you", "");
        a.textContent = "You";
        links.appendChild(a);
      } else if (you) {
        you.remove();
      }
    });
  }
})();
