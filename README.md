# Telegram Sanitizer Bot (Cloudflare Workers)

A webhook-based Telegram bot running on Cloudflare Workers that:
- Sanitizes text/captions by removing `* _ ~ \` |`
- Reposts sanitized content (text -> sendMessage, media -> copyMessage with caption)
- Deletes the original message (best-effort; requires permissions)
- Ignores videos longer than 5 minutes

## Prereqs
- A Telegram bot token (from @BotFather)
- Cloudflare account
- Node.js installed

## Deploy Steps

### 1) Install deps
```bash
npm i
