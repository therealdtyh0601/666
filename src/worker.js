/**
 * Simple Telegram Re-upload Bot (Cloudflare Workers)
 *
 * - Takes forwarded or normal posts
 * - Re-uploads (copyMessage) the same media
 * - Copies caption as plain text only
 * - Optional: deletes original message
 */

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("OK");
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Optional webhook secret check
    if (env.TELEGRAM_SECRET_TOKEN) {
      const token = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (token !== env.TELEGRAM_SECRET_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const update = await request.json();

    const msg =
      update.message ||
      update.channel_post ||
      update.edited_message ||
      update.edited_channel_post;

    if (!msg) {
      return new Response("No message", { status: 200 });
    }

    const chatId = msg.chat?.id;
    const messageId = msg.message_id;
    if (!chatId || !messageId) {
      return new Response("Missing ids", { status: 200 });
    }

    // Extract plain caption or text
    const plainText = (msg.caption || msg.text || "").trim();

    // Detect media (anything copyable)
    const hasMedia =
      msg.photo ||
      msg.video ||
      msg.document ||
      msg.audio ||
      msg.voice ||
      msg.animation ||
      msg.video_note ||
      msg.sticker;

    if (hasMedia) {
      // Re-upload media with plain-text caption
      await telegram(env.BOT_TOKEN, "copyMessage", {
        chat_id: chatId,
        from_chat_id: chatId,
        message_id: messageId,
        caption: plainText || undefined,
        parse_mode: undefined
      });
    } else if (plainText) {
      // Text-only message
      await telegram(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: plainText
      });
    } else {
      return new Response("Nothing to repost", { status: 200 });
    }

    // Optional: delete original forwarded post
    try {
      await telegram(env.BOT_TOKEN, "deleteMessage", {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (_) {}

    return new Response("Done", { status: 200 });
  }
};

async function telegram(botToken, method, payload) {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || "Telegram API error");
  }
  return data.result;
}
