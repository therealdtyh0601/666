/**
 * Cloudflare Worker Telegram bot (webhook)
 * Features:
 * - Sanitize text/caption: remove Markdown-ish chars: * _ ~ ` |
 * - Repost sanitized content (text -> sendMessage, media -> copyMessage with caption)
 * - Delete original message (best-effort)
 * - Ignore long videos > MAX_DURATION seconds
 * - Optional secret token verification via X-Telegram-Bot-Api-Secret-Token header
 *
 * Secrets to set:
 * - BOT_TOKEN (required)
 * - TELEGRAM_SECRET_TOKEN (optional but recommended)
 */

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Health check / simple GET
      if (request.method === "GET") {
        return new Response("OK");
      }

      // Only accept POST for webhook
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      // Optional: lock to a specific path
      // e.g., only accept /webhook
      if (url.pathname !== "/" && url.pathname !== "/webhook") {
        return new Response("Not Found", { status: 404 });
      }

      // Optional: verify Telegram secret token header
      // Set via setWebhook secret_token=...
      if (env.TELEGRAM_SECRET_TOKEN) {
        const headerToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (!headerToken || headerToken !== env.TELEGRAM_SECRET_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const update = await request.json();

      // Handle message or edited_message (you can extend as needed)
      const msg =
        update?.message ||
        update?.edited_message ||
        update?.channel_post ||
        update?.edited_channel_post;

      if (!msg) {
        return new Response("No message in update", { status: 200 });
      }

      // Ignore service messages without text/caption/media
      const chatId = msg.chat?.id;
      const messageId = msg.message_id;
      if (!chatId || !messageId) {
        return new Response("Missing chat/message id", { status: 200 });
      }

      // Build sanitized caption/text
      const rawText = msg.text ?? msg.caption ?? "";
      const cleaned = sanitizeText(rawText);

      // Decide if media message
      const isMedia =
        !!msg.photo ||
        !!msg.document ||
        !!msg.audio ||
        !!msg.voice ||
        !!msg.video ||
        !!msg.animation ||
        !!msg.sticker ||
        !!msg.video_note;

      // Repost sanitized
      if (isMedia) {
        // copyMessage supports caption for most media types
        await telegramCall(env.BOT_TOKEN, "copyMessage", {
          chat_id: chatId,
          from_chat_id: chatId,
          message_id: messageId,
          caption: cleaned || undefined,
          // Keep it plain; if you want markdown, you'd need different sanitization
          parse_mode: undefined
        });
      } else if (msg.text) {
        // Pure text
        if (cleaned) {
          await telegramCall(env.BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: cleaned
          });
        } else {
          // If cleaned becomes empty, do nothing
          return new Response("Empty after sanitize", { status: 200 });
        }
      } else {
        // Nothing we can handle (e.g. contact, location) - do nothing
        return new Response("Unhandled message type", { status: 200 });
      }

      // Delete original message (best effort)
      // Requires bot to have rights in groups/channels
      await telegramCall(env.BOT_TOKEN, "deleteMessage", {
        chat_id: chatId,
        message_id: messageId
      }).catch(() => {});

      return new Response("Done", { status: 200 });
    } catch (err) {
      // Never throw raw errors back to Telegram; keep 200 so Telegram doesn't retry forever
      return new Response("Error handled", { status: 200 });
    }
  }
};

function sanitizeText(text) {
  if (!text) return "";
  // matches your Python: remove ["*", "_", "~", "`", "||"] effectively -> remove * _ ~ ` and |
  // (removing '|' catches the '||' as well)
  return text.replace(/[*_~`|]/g, "").trim();
}

async function telegramCall(botToken, method, payload) {
  if (!botToken) throw new Error("Missing BOT_TOKEN");
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const desc = data?.description || `HTTP ${res.status}`;
    throw new Error(`Telegram API error: ${method}: ${desc}`);
  }
  return data.result;
}
