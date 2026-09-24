// One-time OAuth bootstrap for real Google Docs mode.
// Run it logged into the DEDICATED Google account that will own the tender docs:
//
//   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy \
//     PATH="$HOME/Downloads/google-cloud-sdk/bin:$PATH" node functions/oauth-bootstrap.mjs
//
// It opens a consent screen, captures the offline refresh token, and stores all three values
// in Secret Manager (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) for project biding-system.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { google } from 'googleapis';

const PROJECT = 'biding-system';
const PORT = 53682;
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, `http://localhost:${PORT}`);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  // drive.file is NON-sensitive (access only to files the app creates) → no verification wall.
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

function putSecret(name, value) {
  try {
    execSync(`gcloud secrets create ${name} --replication-policy=automatic --project ${PROJECT}`, {
      stdio: 'ignore',
    });
  } catch {
    /* already exists */
  }
  execSync(`gcloud secrets versions add ${name} --data-file=- --project ${PROJECT}`, {
    input: value,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('No code');
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) throw new Error('No refresh_token returned (revoke prior grant and retry with prompt=consent).');
    putSecret('GOOGLE_OAUTH_CLIENT_ID', clientId);
    putSecret('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret);
    putSecret('GOOGLE_OAUTH_REFRESH_TOKEN', tokens.refresh_token);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<h2>✅ Refresh token stored in Secret Manager. You can close this tab.</h2>',
    );
    console.log('\n✅ Stored GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN in Secret Manager.');
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error('❌', e.message || e);
    server.close();
    process.exit(2);
  }
});

server.listen(PORT, () => {
  console.log('\n1) Make sure you are signed into the DEDICATED Google account in your browser.');
  console.log('2) Open this URL and approve (click through the "unverified app" warning):\n');
  console.log('   ' + authUrl + '\n');
});
