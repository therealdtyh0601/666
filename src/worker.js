/**
 * Simple Telegram reupload bot (Cloudflare Workers)
 * - Downloads media from Telegram
 * - Reuploads it
 * - Copies caption (plain text)
 * - Deletes original message
 *
 * Required secret:
 * - BOT_TOKEN
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    const update = await request.json();
    const msg = update.message || update.channel_post;

    if (!msg) return new Response("No message");

    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const caption = msg.caption || msg.text || "";

    try {
      // MEDIA HANDLING
      if (msg.photo || msg.video || msg.document || msg.audio || msg.voice) {
        const fileId = extractFileId(msg);
        if (!fileId) return new Response("No file_id");

        // 1️⃣ Get file path from Telegram
        const filePath = await getFilePath(env.BOT_TOKEN, fileId);

        // 2️⃣ Download file
        const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
        const fileResp = await fetch(fileUrl);
        const fileBuffer = await fileResp.arrayBuffer();

        // 3️⃣ Reupload (sendDocument works for all file types safely)
        await telegramUpload(env.BOT_TOKEN, chatId, fileBuffer, caption);

      } else if (msg.text) {
        // TEXT ONLY
        await telegramSendMessage(env.BOT_TOKEN, chatId, msg.text);
      } else {
        return new Response("Unsupported type");
      }

      // 4️⃣ Delete original
      await telegramDelete(env.BOT_TOKEN, chatId, messageId).catch(() => {});

      return new Response("Done");
    } catch (e) {
      return new Response("Handled error", { status: 200 });
    }
  }
};

/* ---------------- helpers ---------------- */

function extractFileId(msg) {
  if (msg.photo) return msg.photo[msg.photo.length - 1].file_id;
  if (msg.video) return msg.video.file_id;
  if (msg.document) return msg.document.file_id;
  if (msg.audio) return msg.audio.file_id;
  if (msg.voice) return msg.voice.file_id;
  return null;
}

async function getFilePath(token, fileId) {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId })
    }
  );
  const data = await res.json();
  return data.result.file_path;
}

async function telegramUpload(token, chatId, buffer, caption) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([buffer]));
  if (caption) form.append("caption", caption);

  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form
  });
}

async function telegramSendMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function telegramDelete(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}
