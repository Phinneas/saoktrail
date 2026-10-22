import { createApp } from './routes';
import { handleScheduledEvent } from './scheduler';
import { handleDeployTrigger } from './deploy';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    // The 12:00 UTC cron rebuilds and deploys the sites so new posts go live.
    // It runs after the 09:00-11:40 UTC post slots (1-5 AM Pacific window).
    // Match on the hour only, so the day-of-week list in wrangler.toml can change
    // without silently routing this run to the autoposter instead.
    if (String(event.cron || '').startsWith('0 12 ')) {
      await handleDeployTrigger(env);
    } else {
      await handleScheduledEvent(event, env, ctx);
    }
  }
};
