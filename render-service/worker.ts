import { Container, getContainer } from '@cloudflare/containers';

export class RenderContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '30s';

  override onStart() {
    console.log('Render container started');
  }

  override onStop() {
    console.log('Render container stopped');
  }

  override onError(error: unknown) {
    console.error('Render container error:', error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.RENDER_CONTAINER);
    return await container.fetch(request);
  },
};
