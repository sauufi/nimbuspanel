# Email & Webmail

NimbusPanel includes a complete mail stack: Postfix (SMTP) + Dovecot (IMAP) + OpenDKIM (signing) + SnappyMail (webmail).

## Adding a Mail Domain

**Mail** page → **Add Domain**:

1. Enter your domain (e.g. `example.com`)
2. Click **Add Domain**

The domain is now ready to receive mail. You must set DNS records (see below).

## DNS Records

Set these at your DNS provider:

```
# Required (MX + SPF):
example.com.              MX    10 mail.your-server.com.
example.com.              TXT   "v=spf1 mx ~all"

# DKIM (after generating keys — see below):
mail._domainkey.example.com.   TXT   "v=DKIM1; h=sha256; k=rsa; p=MIIBIj..."

# DMARC (recommended):
_dmarc.example.com.       TXT   "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com"
```

Also set **reverse DNS (PTR)** at your VPS provider:
- IP → `mail.your-server.com` (your server's hostname)

## Creating Mailboxes

**Mail** page → **Mailboxes** section:

1. Enter the local part (e.g. `info`)
2. Select the domain
3. Click **Create Mailbox**
4. Password is generated automatically — save it!

Example: `info@example.com` with password `Xk9mP2nQ...`

## Aliases (Forwarding)

**Mail** page → **Aliases** section:

Create email addresses that forward to another mailbox:

```
noreply@example.com → admin@example.com
support@example.com → you@gmail.com
```

## DKIM Signing

**Mail** page → **DNS & DKIM** section:

1. Find your domain → click **Generate keys**
2. Copy the TXT record shown
3. Paste it at your DNS provider
4. Your mail is now DKIM-signed

DKIM proves your mail is legitimately from your server, improving deliverability to Gmail/Outlook.

## Webmail (SnappyMail)

**Mail** page → **Webmail** section:

1. Choose "On the panel domain" (recommended) or a PHP site
2. Click **Install Webmail**
3. Access at `https://your-panel-domain/webmail`

SnappyMail is a lightweight, fast webmail client:
- Login with full email address + mailbox password
- Read/compose/reply emails
- Address book, search, attachments
- Mobile-friendly

## Client Settings

| Protocol | Host | Port | Security |
|---|---|---|---|
| IMAP | your-server.com | 143 | STARTTLS |
| IMAP (SSL) | your-server.com | 993 | SSL/TLS |
| SMTP | your-server.com | 587 | STARTTLS |
| SMTP | your-server.com | 25 | STARTTLS (inbound) |

**Username:** Full email address (e.g. `info@example.com`)

## Port 25 Blocking

Many VPS providers block outbound port 25 (anti-spam). If you can receive but not send:

1. Check: `telnet gmail-smtp-in.l.google.com 25` — if timeout, port is blocked
2. Contact your VPS provider to unblock
3. Or use an SMTP relay (Brevo, SendGrid — free tiers available)

## Mailbox Management

| Action | How |
|---|---|
| Change password | Mail page → **New password** button |
| Delete mailbox | Mail page → **Delete** button (mail data destroyed) |
| Delete domain | Mail page → **✕** on domain chip (all mailboxes/aliases removed) |
