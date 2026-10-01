import { createApp } from './routes';
import { handleScheduledEvent } from './scheduler';
import { handleDeployTrigger } from './deploy';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    // The 8 AM UTC cron rebuilds and deploys the sites so new posts go live.
    // Match on the hour only, so the day-of-week list in wrangler.toml can change
    // without silently routing this run to the autoposter instead.
    if (String(event.cron || '').startsWith('0 8 ')) {
      await handleDeployTrigger(env);
    } else {
      await handleScheduledEvent(event, env, ctx);
    }
  }
};
