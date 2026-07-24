# Email Campaign Sender — OAuth + Vercel

Next.js 15 application for sending email campaigns through:

- Google OAuth: Gmail and Google Workspace
- Microsoft OAuth: Outlook, Hotmail, Live, Microsoft 365, and GoDaddy mail hosted on Microsoft 365
- Zoho OAuth
- Custom SMTP for other providers

Each OAuth account is connected once. The refresh token is encrypted and stored in Upstash Redis/Vercel KV, so the user does not enter the mailbox password for every campaign.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Use Node.js 20 or newer.

## Vercel deployment

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Connect an Upstash Redis/Vercel KV database to the project.
4. Add every variable from `.env.example` in **Project → Settings → Environment Variables**.
5. Set `NEXT_PUBLIC_APP_URL` to the final production URL, for example:

```text
https://mails-sender.vercel.app
```

6. Redeploy after adding or changing environment variables.

## OAuth callback URLs

Register these exact redirect URLs in each provider console:

```text
https://YOUR-DOMAIN/api/auth/google/callback
https://YOUR-DOMAIN/api/auth/microsoft/callback
https://YOUR-DOMAIN/api/auth/zoho/callback
```

### Google Cloud

Enable Gmail API. Create a Web Application OAuth client. Add the Google callback URL. Required scope:

```text
https://www.googleapis.com/auth/gmail.send
```

The app also requests `openid email profile` and offline access.

### Microsoft Entra

Create an app registration that supports organizational directories and personal Microsoft accounts. Add the Microsoft callback URL as a Web redirect URI. Add delegated permissions:

```text
openid
profile
email
offline_access
User.Read
Mail.Send
```

Create a client secret and put its **value**, not its secret ID, into `MICROSOFT_CLIENT_SECRET`.

### Zoho API Console

Create a Server-based Application and add the Zoho callback URL. Required scopes:

```text
ZohoMail.accounts.READ
ZohoMail.messages.CREATE
```

This project currently uses the US Zoho accounts and mail endpoints. For EU, IN, AU, JP, or CA data centers, update the Zoho authorization/token/API domains in `src/lib/oauth.ts`, `src/lib/providerProfile.ts`, and `src/app/api/sendEmails/route.ts`.

## Health check

After deployment open:

```text
/api/health
```

Expected production response:

```json
{"ok":true,"persistentStoreConfigured":true,"runtime":"nodejs"}
```

If `persistentStoreConfigured` is false, OAuth may appear to work temporarily during local development, but connected accounts will not persist reliably on Vercel.

## Security

- OAuth refresh tokens are encrypted with AES-256-GCM before storage.
- Session IDs are held in secure HTTP-only cookies.
- Provider client secrets must exist only in Vercel environment variables.
- Never commit `.env.local` or real credentials.
