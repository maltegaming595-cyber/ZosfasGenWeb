(() => {
  const $ = (q) => document.querySelector(q);
  const view = $("#view");
  const toast = $("#toast");

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  let tmr=null;
  function showToast(title, detail){
    toast.innerHTML = `<div><strong>${escapeHtml(title)}</strong></div>${detail?`<div class="small">${escapeHtml(detail)}</div>`:''}`;
    toast.classList.add("show");
    clearTimeout(tmr);
    tmr=setTimeout(()=>toast.classList.remove("show"), 3500);
  }

  async function api(path, opts){
    const res = await fetch(path, { headers: { "Content-Type":"application/json" }, ...opts });
    const data = await res.json().catch(()=>({ ok:false, error:"bad_json"}));
    if(!res.ok) throw data;
    return data;
  }

  
  let channelCache = null;
  async function getGuildChannels(){
    if(channelCache) return channelCache;
    const r = await api("/api/guild/channels");
    channelCache = r.channels || [];
    return channelCache;
  }

const routes = {
    generator: {
      title: "Generator",
      sub: "Post game links to your Discord output channel.",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Generate</div>
            <p class="p">Enter a Steam AppID or a game name. If you have a search API configured, names resolve automatically.</p>
            <div class="inputrow">
              <input class="input" id="genQuery" placeholder="2397300 or 'Cyberpunk 2077'"/>
              <button class="btn btn-primary" id="genBtn" style="flex:0 0 auto;">Generate</button>
            </div>
            <p class="p" style="margin-top:10px;">Result posts to your configured output channel as an embed with a download button.</p>
          </div>

          <div class="panel">
            <div class="h2">Update request</div>
            <p class="p">Notify your game adders that a game needs an update.</p>
            <div class="inputrow">
              <input class="input" id="updQuery" placeholder="AppID or name"/>
              <button class="btn" id="updBtn" style="flex:0 0 auto;">Send request</button>
            </div>
          </div>
        </div>
      `,
      bind: () => {
        $("#genBtn").onclick = async () => {
          const q = $("#genQuery").value.trim();
          if(!q) return showToast("Missing input", "Enter an appid or name.");
          try{
            const r = await api("/api/generate", { method:"POST", body: JSON.stringify({ query: q })});
            showToast("Posted to Discord ✅", `appid: ${r.appid}`);
          }catch(e){
            if(e.error === "multiple_matches") return showToast("Multiple matches", "Be more specific.");
            showToast("Generate failed", e.error || "unknown error");
          }
        };
        $("#updBtn").onclick = async () => {
          const q = $("#updQuery").value.trim();
          if(!q) return showToast("Missing input", "Enter an appid or name.");
          try{
            await api("/api/update", { method:"POST", body: JSON.stringify({ query: q })});
            showToast("Update request sent ✅");
          }catch(e){
            showToast("Update failed", e.error || "unknown error");
          }
        };
      }
    },

    tickets: {
      title: "Tickets",
      sub: "Open and manage support tickets (synced with Discord).",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Open ticket</div>
            <p class="p">Topic buttons match your Discord ticket panel: Game / Premium / Glitches / Other.</p>
            <div class="inputrow">
              <select class="input select" id="ticketTopic">
                <option value="game">Game</option>
                <option value="premium">Premium</option>
                <option value="glitches">Glitches</option>
                <option value="other">Other</option>
              </select>
              <input class="input" id="ticketOther" placeholder="If Other, type your topic…" />
              <button class="btn btn-primary" id="ticketBtn" style="flex:0 0 auto;">Create</button>
            </div>
            <p class="p" style="margin-top:10px;">A Discord channel is created under your ticket category, visible to support + you.</p>
          </div>

          <div class="panel">
            <div class="h2">Your tickets</div>
            <p class="p">Shows your open/closed tickets from MongoDB. Admins can switch to “All tickets”.</p>
            <div class="inputrow" style="margin-top:10px;">
              <button class="btn" id="ticketRefresh">Refresh</button>
              <label class="check">
                <input type="checkbox" id="ticketAll"/>
                <span>All tickets (admin)</span>
              </label>
            </div>
            <div class="listbox" id="ticketList" style="margin-top:12px;"></div>
          </div>
        </div>
      `,
      bind: () => {
        $("#ticketBtn").onclick = async () => {
          const topic = $("#ticketTopic").value;
          const otherText = $("#ticketOther").value.trim();
          try{
            const r = await api("/api/tickets", { method:"POST", body: JSON.stringify({ topic, otherText })});
            showToast("Ticket created ✅", r.name);
            await loadTickets();
          }catch(e){
            showToast("Ticket failed", e.error || "unknown error");
          }
        };

        async function loadTickets(){
          const all = $("#ticketAll").checked;
          const r = await api(`/api/tickets/list?scope=${all ? "all" : "mine"}`);
          // lock checkbox if not admin
          $("#ticketAll").disabled = !r.admin;
          if(!r.admin) $("#ticketAll").checked = false;

          const box = $("#ticketList");
          if(!r.tickets?.length){
            box.innerHTML = `<div class="empty">No tickets found.</div>`;
            return;
          }
          box.innerHTML = r.tickets.map(t => `
            <div class="trow">
              <div class="tmeta">
                <div class="tname">${escapeHtml(t.topic || "Ticket")}</div>
                <div class="tsub">
                  <span class="chip ${t.status === "open" ? "chip-open" : "chip-closed"}">${escapeHtml(t.status)}</span>
                  <span>•</span>
                  <span>${new Date(t.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <a class="btn btn-soft" href="${t.url}" target="_blank" rel="noreferrer" title="Open in Discord">↗</a>
            </div>
          `).join("");
        }

        $("#ticketRefresh").onclick = loadTickets;
        $("#ticketAll").onchange = loadTickets;
        loadTickets();
      }
    },

    premium: {
      title: "Premium",
      sub: "Check your premium status and remaining time.",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Your status</div>
            <div class="kpi">
              <div class="big" id="premState">—</div>
              <div class="tag" id="premTag">loading…</div>
            </div>
            <p class="p" style="margin-top:10px;">If you don't have premium, this page will point you to the Discord premium info link.</p>
            <div class="inputrow" style="margin-top:10px;">
              <button class="btn" id="premRefresh">Refresh</button>
              <a class="btn btn-primary" id="premInfo" href="#" target="_blank" rel="noreferrer">Premium info</a>
            </div>
          </div>

          <div class="panel">
            <div class="h2">What sync means</div>
            <p class="p">Premium is checked by Discord role and by the MongoDB premium timer (same as the bot).</p>
          </div>
        </div>
      `,
      bind: async () => {
        const links = await api("/api/links");
        $("#premInfo").href = links.links.premiumInfo || "#";
        async function load(){
          const r = await api("/api/premium");
          const exp = r.expiresAt ? new Date(r.expiresAt) : null;
          const has = r.hasRole || (exp && exp > new Date());
          $("#premState").textContent = has ? "Premium ✅" : "Not premium";
          $("#premTag").textContent = has
            ? (exp ? ("Expires: " + exp.toLocaleString()) : "Granted by role")
            : "Get premium in Discord";
        }
        $("#premRefresh").onclick = load;
        await load();
      }
    },

    boost: {
      title: "Boost",
      sub: "Check your boost status.",
      render: () => `
        <div class="panel">
          <div class="h2">Boost status</div>
          <p class="p" id="boostMsg">Loading…</p>
          <button class="btn" id="boostRefresh">Refresh</button>
        </div>
      `,
      bind: async () => {
        async function load(){
          const r = await api("/api/boost");
          $("#boostMsg").textContent = r.message;
        }
        $("#boostRefresh").onclick = load;
        await load();
      }
    },

    giveaways: {
      title: "Giveaways",
      sub: "Create, end, reroll — and auto-end runs in the background.",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Create giveaway</div>
            <p class="p">Duration format: 30m, 2h, 7d, 1w, 1mo. Auto-ending is enabled server-side.</p>

            <div class="inputrow">
              <select class="input select" id="gwChannelSel"><option>Loading channels…</option></select>
              <button class="btn" id="gwChanRefresh" style="flex:0 0 auto;">Refresh</button>
            </div>

            <div class="inputrow" style="margin-top:10px;">
              <input class="input" id="gwTitle" placeholder="Title"/>
              <input class="input" id="gwDuration" placeholder="2h"/>
              <input class="input" id="gwWinners" type="number" min="1" max="20" value="1"/>
              <button class="btn btn-primary" id="gwCreate" style="flex:0 0 auto;">Create</button>
            </div>

            <p class="p" style="margin-top:10px;">If you don’t see a channel, make sure the bot can view it.</p>
          </div>

          <div class="panel">
            <div class="h2">End / Reroll</div>

            <div class="inputrow">
              <select class="input select" id="gwChannel2Sel"><option>Loading channels…</option></select>
              <button class="btn" id="gwChan2Refresh" style="flex:0 0 auto;">Refresh</button>
            </div>

            <div class="inputrow" style="margin-top:10px;">
              <input class="input" id="gwMsg" placeholder="Message ID"/>
              <button class="btn" id="gwEnd">End</button>
              <button class="btn btn-primary" id="gwReroll">Reroll</button>
            </div>
          </div>
        </div>
      `,
      bind: async () => {
        async function fillSelect(selId){
          const sel = $(selId);
          const chans = await getGuildChannels().catch(()=>[]);
          if(!chans.length){
            sel.innerHTML = `<option value="">No channels found</option>`;
            return;
          }
          sel.innerHTML = chans.map(c => {
            const label = c.parentName ? `${c.parentName} / #${c.name}` : `#${c.name}`;
            return `<option value="${c.id}">${escapeHtml(label)}</option>`;
          }).join("");
        }

        await fillSelect("#gwChannelSel");
        await fillSelect("#gwChannel2Sel");

        $("#gwChanRefresh").onclick = async () => { channelCache = null; await fillSelect("#gwChannelSel"); showToast("Channels refreshed ✅"); };
        $("#gwChan2Refresh").onclick = async () => { channelCache = null; await fillSelect("#gwChannel2Sel"); showToast("Channels refreshed ✅"); };

        $("#gwCreate").onclick = async () => {
          try{
            const body = {
              channelId: $("#gwChannelSel").value,
              title: $("#gwTitle").value.trim(),
              duration: $("#gwDuration").value.trim(),
              winners: parseInt($("#gwWinners").value, 10)
            };
            const r = await api("/api/giveaways/create", { method:"POST", body: JSON.stringify(body) });
            showToast("Giveaway created ✅", "Message ID: " + r.messageId);
          }catch(e){
            showToast("Giveaway failed", e.error || "admin_only / bad input");
          }
        };
        $("#gwEnd").onclick = async () => {
          try{
            const r = await api("/api/giveaways/end", { method:"POST", body: JSON.stringify({ channelId: $("#gwChannel2Sel").value, messageId: $("#gwMsg").value.trim() }) });
            showToast("Giveaway ended ✅", (r.winners?.length ? `Winners: ${r.winners.join(", ")}` : "No valid entries."));
          }catch(e){ showToast("End failed", e.error || "admin_only"); }
        };
        $("#gwReroll").onclick = async () => {
          try{
            const r = await api("/api/giveaways/reroll", { method:"POST", body: JSON.stringify({ channelId: $("#gwChannel2Sel").value, messageId: $("#gwMsg").value.trim() }) });
            showToast("Rerolled ✅", (r.winners||[]).join(", "));
          }catch(e){ showToast("Reroll failed", e.error || "admin_only"); }
        };
      }
    },

    codes: {
      title: "Codes",
      sub: "Stock and print game codes (admin).",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Stock counters</div>
            <p class="p">Shows how many codes remain per tier.</p>
            <table class="table">
              <thead><tr><th>Tier</th><th>In stock</th></tr></thead>
              <tbody id="codeRows"></tbody>
            </table>
            <button class="btn" id="codeRefresh">Refresh</button>
          </div>

          <div class="panel">
            <div class="h2">Add stock</div>
            <p class="p">Paste one code or multiple as <b>code,code,code</b></p>
            <div class="inputrow">
              <select class="input select" id="codeAmount">
                <option value="25">25%</option>
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
              </select>
              <input class="input" id="codeList" placeholder="CODE1,CODE2,CODE3"/>
            </div>
            <div class="inputrow" style="margin-top:10px;">
              <button class="btn btn-primary" id="codeAdd" style="flex:0 0 auto;">Add</button>
            </div>

            <div class="h2" style="margin-top:14px;">Print a code</div>
            <div class="inputrow">
              <button class="btn" data-get="25">25%</button>
              <button class="btn" data-get="50">50%</button>
              <button class="btn" data-get="75">75%</button>
              <button class="btn btn-primary" data-get="100">100%</button>
            </div>
            <p class="p" id="printed" style="margin-top:10px;"></p>
          </div>
        </div>
      `,
      bind: async () => {
        async function refresh(){
          try{
            const r = await api("/api/codes/stock");
            const rows = [25,50,75,100].map(n => `<tr><td>${n}%</td><td>${r.stock[n]}</td></tr>`).join("");
            $("#codeRows").innerHTML = rows;
          }catch(e){ showToast("Stock failed", e.error || "login required"); }
        }
        $("#codeRefresh").onclick = refresh;

        $("#codeAdd").onclick = async () => {
          try{
            const amount = parseInt($("#codeAmount").value, 10);
            const codes = $("#codeList").value.trim();
            const r = await api("/api/codes/stock", { method:"POST", body: JSON.stringify({ amount, codes })});
            showToast("Stock updated ✅", `Added ${r.added}, left ${r.left}`);
            $("#codeList").value = "";
            await refresh();
          }catch(e){ showToast("Add failed", e.error || "admin_only"); }
        };

        document.querySelectorAll("[data-get]").forEach(btn => {
          btn.onclick = async () => {
            try{
              const amount = parseInt(btn.getAttribute("data-get"), 10);
              const r = await api("/api/codes/get", { method:"POST", body: JSON.stringify({ amount })});
              $("#printed").innerHTML = `Code: <b>${escapeHtml(r.code)}</b> <span class="small">(left: ${r.left})</span>`;
              showToast("Code printed ✅", "Copy it now.");
              await refresh();
            }catch(e){
              showToast("Get code failed", e.error || "admin_only / out_of_stock");
            }
          };
        });

        await refresh();
      }
    },

    links: {
      title: "Links",
      sub: "Quick links (same ones the bot provides).",
      render: () => `
        <div class="panel">
          <div class="h2">Your links</div>
          <p class="p">These are served from your server env variables.</p>
          <table class="table">
            <thead><tr><th>Name</th><th>URL</th></tr></thead>
            <tbody id="linkRows"></tbody>
          </table>
        </div>
      `,
      bind: async () => {
        const r = await api("/api/links");
        const links = r.links;
        const rows = [
          ["DLC tool", links.dlc],
          ["Online-fix", links.online],
          ["Store", links.store],
          ["Premium info", links.premiumInfo]
        ].map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td><a href="${escapeHtml(v||'#')}" target="_blank" rel="noreferrer">${escapeHtml(v||"(not set)")}</a></td></tr>`).join("");
        $("#linkRows").innerHTML = rows;
      }
    },

    admin: {
      title: "Admin",
      sub: "Admin-only controls (premium activation, bot-bans, premium list).",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Premium activate</div>
            <p class="p">Duration: 7d, 12h, 1w, 1mo etc.</p>
            <div class="inputrow">
              <input class="input" id="paUser" placeholder="User ID"/>
              <input class="input" id="paDur" placeholder="7d"/>
              <button class="btn btn-primary" id="paBtn" style="flex:0 0 auto;">Activate</button>
            </div>
          </div>

          <div class="panel">
            <div class="h2">Bot ban</div>
            <div class="inputrow">
              <input class="input" id="bbUser" placeholder="User ID"/>
              <input class="input" id="bbDur" placeholder="7d"/>
            </div>
            <div class="inputrow" style="margin-top:10px;">
              <input class="input" id="bbReason" placeholder="Reason (optional)"/>
              <button class="btn btn-primary" id="bbBtn" style="flex:0 0 auto;">Ban</button>
            </div>
          </div>

          <div class="panel" style="grid-column:1 / -1;">
            <div class="h2">Premium list</div>
            <p class="p">Shows all premium users and their expiry (MongoDB timers).</p>
            <button class="btn" id="plBtn">Load</button>
            <table class="table">
              <thead><tr><th>User ID</th><th>Expires</th></tr></thead>
              <tbody id="plRows"></tbody>
            </table>
          </div>
        </div>
      `,
      bind: () => {
        $("#paBtn").onclick = async () => {
          try{
            const userId = $("#paUser").value.trim();
            const duration = $("#paDur").value.trim();
            const r = await api("/api/admin/premium-activate", { method:"POST", body: JSON.stringify({ userId, duration })});
            showToast("Premium activated ✅", "Expires: " + new Date(r.expiresAt).toLocaleString());
          }catch(e){ showToast("Premium activate failed", e.error || "admin_only"); }
        };
        $("#bbBtn").onclick = async () => {
          try{
            const body = {
              userId: $("#bbUser").value.trim(),
              duration: $("#bbDur").value.trim(),
              reason: $("#bbReason").value.trim()
            };
            const r = await api("/api/admin/bot-ban", { method:"POST", body: JSON.stringify(body)});
            showToast("User banned ✅", "Until: " + new Date(r.expiresAt).toLocaleString());
          }catch(e){ showToast("Ban failed", e.error || "admin_only"); }
        };
        $("#plBtn").onclick = async () => {
          try{
            const r = await api("/api/admin/premium-list");
            const rows = (r.list||[]).map(x => `<tr><td>${escapeHtml(x.userId)}</td><td>${escapeHtml(new Date(x.expiresAt).toLocaleString())}</td></tr>`).join("");
            $("#plRows").innerHTML = rows || `<tr><td colspan="2">No premium users found.</td></tr>`;
          }catch(e){ showToast("List failed", e.error || "admin_only"); }
        };
      }
    },

    settings: {
      title: "Settings",
      sub: "Browse channels, verify IDs, and check your session.",
      render: () => `
        <div class="grid">
          <div class="panel">
            <div class="h2">Session</div>
            <p class="p">This dashboard uses Discord OAuth. Use “Who am I?” to confirm you’re logged in.</p>
            <button class="btn" id="whoami">Who am I?</button>
            <div class="p" id="meBox" style="margin-top:10px;"></div>
          </div>

          <div class="panel">
            <div class="h2">Channel browser</div>
            <p class="p">Pick channels from the guild (useful for copying IDs). Only text channels are shown.</p>
            <div class="inputrow" style="margin-top:10px;">
              <button class="btn" id="chanLoad">Load channels</button>
              <button class="btn" id="chanRefresh">Refresh</button>
            </div>
            <div class="listbox" id="chanList" style="margin-top:12px;"></div>
          </div>
        </div>
      `,
      bind: () => {
        $("#whoami").onclick = async () => {
          const r = await api("/api/me");
          $("#meBox").innerHTML = `<b>${escapeHtml(r.loggedIn ? (r.user.username + "#" + r.user.discriminator) : "Not logged in")}</b>`;
        };

        async function renderChannels(){
          const chans = await getGuildChannels().catch(()=>[]);
          const box = $("#chanList");
          if(!chans.length){
            box.innerHTML = `<div class="empty">No channels found (or you’re not in the guild).</div>`;
            return;
          }
          box.innerHTML = chans.slice(0, 120).map(c => {
            const label = c.parentName ? `${c.parentName} / #${c.name}` : `#${c.name}`;
            return `
              <div class="trow">
                <div class="tmeta">
                  <div class="tname">${escapeHtml(label)}</div>
                  <div class="tsub">${escapeHtml(c.id)}</div>
                </div>
                <button class="btn btn-soft" data-copy="${escapeHtml(c.id)}" title="Copy ID">📋</button>
              </div>
            `;
          }).join("");

          box.querySelectorAll("[data-copy]").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.getAttribute("data-copy");
              try{
                await navigator.clipboard.writeText(id);
                showToast("Copied ✅", id);
              }catch{
                showToast("Copy failed", "Your browser blocked clipboard access.");
              }
            };
          });
        }

        $("#chanLoad").onclick = renderChannels;
        $("#chanRefresh").onclick = async () => { channelCache = null; await renderChannels(); showToast("Channels refreshed ✅"); };
      }
    },
  };

  function setActiveNav(route){
    document.querySelectorAll(".navitem").forEach(a => {
      a.classList.toggle("active", a.dataset.route === route);
    });
  }

  async function loadUser(){
    const me = await api("/api/me").catch(()=>({ ok:true, loggedIn:false }));
    const loginBtn = $("#loginBtn");
    const logoutBtn = $("#logoutBtn");
    if(me.loggedIn){
      $("#userLabel").textContent = me.user.username + "#" + me.user.discriminator;
      $("#userHint").textContent = "Logged in";
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-flex";
      const avatar = me.user.avatar
        ? `https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=64`
        : "";
      $("#avatar").style.backgroundImage = avatar ? `url(${avatar})` : "";
      $("#avatar").style.backgroundSize = "cover";
      $("#avatar").style.backgroundPosition = "center";
    }else{
      $("#userLabel").textContent = "Not logged in";
      $("#userHint").textContent = "Login to use features";
      loginBtn.style.display = "inline-flex";
      logoutBtn.style.display = "none";
    }

    logoutBtn.onclick = async () => {
      await fetch("/auth/logout", { method:"POST" }).catch(()=>null);
      location.reload();
    };
  }

  async function loadOnline(){
    const st = await api("/api/stats").catch(()=>({ ok:true, members:null }));
    $("#onlineCount").textContent = st.members ? `${st.members} members` : "— members";
  }

  function routeFromHash(){
    const h = location.hash || "#/generator";
    const route = h.replace(/^#\/?/, "").split("/")[0] || "generator";
    return routes[route] ? route : "generator";
  }

  async function render(){
    const route = routeFromHash();
    const def = routes[route];
    $("#pageTitle").textContent = def.title;
    $("#pageSub").textContent = def.sub;
    setActiveNav(route);
    view.innerHTML = def.render();
    await def.bind?.();
  }

  window.addEventListener("hashchange", render);

  // boot
  loadUser();
  loadOnline();
  render();
})();