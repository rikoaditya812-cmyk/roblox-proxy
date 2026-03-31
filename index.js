// proxy-server/index.js
// Deploy ini ke Railway.app atau Render.com (gratis)
//
// CARA DEPLOY KE RAILWAY:
// 1. Buat akun di railway.app
// 2. New Project -> Deploy from GitHub repo (upload folder ini)
// 3. Atau pakai Railway CLI: railway up
// 4. Copy URL yang dikasih Railway (misal: https://namaapp.up.railway.app)
//
// CARA DEPLOY KE RENDER:
// 1. Buat akun di render.com
// 2. New -> Web Service -> upload/connect repo ini
// 3. Build command: npm install
// 4. Start command: node index.js

const express = require("express");
const app = express();
app.use(express.json());

// ============================================================
// GANTI INI: Place ID game Roblox lo
// Cari di: Game Settings -> Basic Info -> Place ID
// ============================================================
const ALLOWED_GAME_IDS = [
  "9860616417", // <-- Ganti dengan Place ID game lo
];

// ============================================================
// GANTI INI: Password rahasia lo
// Harus sama persis dengan yang di script Roblox
// ============================================================
const SECRET_KEY = "Jancok123@";

// ============================================================
// GANTI INI: Satu Discord Webhook URL untuk semua notif
// Cara buat: Discord channel -> Edit -> Integrations -> Webhooks -> New Webhook -> Copy URL
// ============================================================
const WEBHOOK_URL = "https://discord.com/api/webhooks/1488594199615111219/Zftw603-dm6An6Gtvp5P94CKPsrhw-FfHMbK-wmT1DorJ0hQGiMN0R49VvPTz9HDrSxU"; // <-- Ganti ini

// Rate limiting sederhana
const rateLimitMap = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const data = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > data.resetAt) {
    data.count = 0;
    data.resetAt = now + 60000;
  }
  data.count++;
  rateLimitMap.set(ip, data);
  return data.count > 30;
}

// Forward ke Discord
async function sendToDiscord(embed) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "🛡 AntiCheat Bot",
        avatar_url: "https://i.imgur.com/Q3VhRRk.png",
        embeds: [embed],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[PROXY] Discord error:", res.status, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err) {
    console.error("[PROXY] Fetch error:", err.message);
    return { ok: false, error: err.message };
  }
}

// Embed builder
function buildEmbed(type, data) {
  const timestamp = new Date().toISOString();
  const gameLink = `https://www.roblox.com/games/${data.gameId}`;
  const profileLink = data.userId
    ? `https://www.roblox.com/users/${data.userId}/profile`
    : null;

  const playerField = {
    name: "👤 Player",
    value: profileLink
      ? `[${data.username || "Unknown"}](${profileLink}) (ID: ${data.userId || "?"})`
      : data.username || "Unknown",
    inline: true,
  };
  const gameField = {
    name: "🎮 Game",
    value: `[Lihat Game](${gameLink})`,
    inline: true,
  };
  const serverField = {
    name: "🌐 Server",
    value: data.serverId || "Unknown",
    inline: true,
  };

  switch (type) {
    case "ban":
      return {
        title: "🔨 Player Di-Ban",
        color: 0xff4444,
        fields: [
          playerField,
          { name: "📋 Alasan", value: data.reason || "Tidak ada alasan", inline: false },
          { name: "👮 Oleh", value: data.adminName || "Auto Anti-Cheat", inline: true },
          gameField, serverField,
        ],
        footer: { text: "Anti-Cheat System" },
        timestamp,
      };
    case "kick":
      return {
        title: "👟 Player Di-Kick",
        color: 0xff9900,
        fields: [
          playerField,
          { name: "📋 Alasan", value: data.reason || "Tidak ada alasan", inline: false },
          { name: "👮 Oleh", value: data.adminName || "Auto Anti-Cheat", inline: true },
          gameField, serverField,
        ],
        footer: { text: "Anti-Cheat System" },
        timestamp,
      };
    case "unban":
      return {
        title: "🔓 Player Di-Unban",
        color: 0x00cc66,
        fields: [
          playerField,
          { name: "📋 Alasan Unban", value: data.reason || "Tidak ada alasan", inline: false },
          { name: "👮 Oleh Admin", value: data.adminName || "Unknown", inline: true },
          gameField,
        ],
        footer: { text: "Anti-Cheat System" },
        timestamp,
      };
    case "violation":
      return {
        title: "⚠️ Deteksi Cheat",
        color: 0xffcc00,
        fields: [
          playerField,
          { name: "🚨 Tipe", value: data.violationType || "Unknown", inline: true },
          { name: "📊 Total Violations", value: String(data.totalViolations || "?"), inline: true },
          { name: "📝 Detail", value: data.details || "-", inline: false },
          gameField, serverField,
        ],
        footer: { text: "Anti-Cheat System" },
        timestamp,
      };
    case "admin":
      return {
        title: "🛡 Admin Panel Dibuka",
        color: 0x5b8cff,
        fields: [
          { name: "👮 Admin", value: data.adminName || "Unknown", inline: true },
          { name: "🔑 Role", value: data.adminRole || "Admin", inline: true },
          gameField, serverField,
        ],
        footer: { text: "Anti-Cheat System" },
        timestamp,
      };
    default:
      return {
        title: "📢 Anti-Cheat Notif",
        color: 0x888888,
        description: JSON.stringify(data),
        timestamp,
      };
  }
}

// Endpoint utama
app.post("/notify", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "Rate limited" });
  }

  const key = req.headers["x-secret-key"];
  if (key !== SECRET_KEY) {
    return res.status(403).json({ ok: false, error: "Invalid secret key" });
  }

  const gameId = req.body?.gameId?.toString();
  if (ALLOWED_GAME_IDS.length > 0 && gameId && !ALLOWED_GAME_IDS.includes(gameId)) {
    return res.status(403).json({ ok: false, error: "Game ID not allowed" });
  }

  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ ok: false, error: "Missing type or data" });
  }

  console.log(`[PROXY] Incoming: type=${type}, player=${data.username}, game=${gameId}`);

  const embed = buildEmbed(type, data);
  const result = await sendToDiscord(embed);
  return res.json(result);
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "AntiCheat Discord Proxy running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[PROXY] Server running on port ${PORT}`);
});
