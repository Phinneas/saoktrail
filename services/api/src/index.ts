import { createApp } from './routes';
import { handleScheduledEvent } from './scheduler';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    await handleScheduledEvent(event, env, ctx);
  }
};
