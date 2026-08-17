// services/api/src/deploy.ts — triggers GitHub Actions to rebuild + deploy all sites.
// Called by the 8 AM UTC cron trigger, one hour after the autoposter runs.

interface DeployEnv {
  GITHUB_PAT?: string;
}

const GITHUB_REPO = 'Phinneas/saoktrail';
const GITHUB_API = 'https://api.github.com';

export async function handleDeployTrigger(env: DeployEnv) {
  console.log('🚀 Deploy trigger fired — calling GitHub Actions...');

  if (!env.GITHUB_PAT) {
    console.error('❌ GITHUB_PAT is not defined — cannot trigger GitHub Actions deploy.');
    return;
  }

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'deploy-sites',
      client_payload: {
        triggered_by: 'cloudflare-cron',
        timestamp: new Date().toISOString(),
      },
    }),
  });

  if (res.status === 204) {
    console.log('✅ GitHub Actions deploy-sites workflow triggered successfully.');
  } else {
    const txt = await res.text();
    console.error(`❌ GitHub dispatch failed (${res.status}): ${txt}`);
  }
}
