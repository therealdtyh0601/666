export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    const update = await request.json();
    const msg =
      update.message ||
      update.channel_post ||
      update.edited_message ||
      update.edited_channel_post;

    if (!msg) return new Response("No message");

    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    // Plain-text caption only
    const caption = sanitizeText(msg.caption || "");

    // PHOTO
    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      await reuploadMedia(env, "photo", fileId, chatId, caption);
      await deleteOriginal(env, chatId, messageId);
      return new Response("Photo reuploaded");
    }

    // VIDEO
    if (msg.video) {
      const fileId = msg.video.file_id;
      await reuploadMedia(env, "video", fileId, chatId, caption);
      await deleteOriginal(env, chatId, messageId);
      return new Response("Video reuploaded");
    }

    return new Response("Ignored");
  }
};

function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/[*_~`|]/g, "").trim();
}

async function reuploadMedia(env, type, fileId, chatId, caption) {
  const token = env.BOT_TOKEN;

  // 1️⃣ Get file path
  const fileResp = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
  );
  const fileData = await fileResp.json();
  const filePath = fileData.result.file_path;

  // 2️⃣ Download file from Telegram
  const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const mediaResp = await fetch(fileUrl);
  const mediaBlob = await mediaResp.blob();

  // 3️⃣ Re-upload
  const form = new FormData();
  form.append(type, mediaBlob);
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);

  await fetch(
    `https://api.telegram.org/bot${token}/send${capitalize(type)}`,
    {
      method: "POST",
      body: form
    }
  );
}

async function deleteOriginal(env, chatId, messageId) {
  await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    }
  ).catch(() => {});
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
