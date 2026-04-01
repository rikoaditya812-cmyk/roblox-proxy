const express = require("express");
const app = express();
app.use(express.json());

// ✅ Ambil dari Railway Variables, bukan hardcode
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SECRET_KEY  = process.env.SECRET_KEY;

const ALLOWED_GAME_IDS = [
  "9860616417",
];

// Validasi saat startup
if (!WEBHOOK_URL) console.error("[PROXY] ❌ DISCORD_WEBHOOK_URL belum diset di Railway Variables!");
if (!SECRET_KEY)  console.error("[PROXY] ❌ SECRET_KEY belum diset di Railway Variables!");

// Rate limiting
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
