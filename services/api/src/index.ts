import { createApp } from './routes';
import { handleScheduledEvent } from './scheduler';
import { handleDeployTrigger } from './deploy';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    if (event.cron === '0 8 * * 1,4') {
      await handleDeployTrigger(env);
    } else {
      await handleScheduledEvent(event, env, ctx);
    }
  }
};
