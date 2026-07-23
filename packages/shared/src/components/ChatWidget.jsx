import { createSignal, createEffect, For, Show, onMount } from 'solid-js';
import { marked } from 'marked';

export function ChatWidget({
  apiUrl = '',
  siteName = '',
  siteUrl = '',
  region = '',
  currentSpringSlug = null,
  suggestedPrompts = []
}) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [messages, setMessages] = createSignal([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [inputText, setInputText] = createSignal('');

  let messagesContainer;

  onMount(() => {
    try {
      const stored = localStorage.getItem('chat_history');
      const timestamp = localStorage.getItem('chat_timestamp');
      if (stored && timestamp) {
        if (Date.now() - parseInt(timestamp) < 24 * 60 * 60 * 1000) {
          setMessages(JSON.parse(stored));
        } else {
          localStorage.removeItem('chat_history');
          localStorage.removeItem('chat_timestamp');
        }
      }
    } catch (e) {}
  });

  createEffect(() => {
    if (messages().length > 0) {
      localStorage.setItem('chat_history', JSON.stringify(messages()));
      localStorage.setItem('chat_timestamp', Date.now().toString());
    }
  });

  createEffect(() => {
    messages();
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 50);
    }
  });

  const allPrompts = currentSpringSlug
    ? [...suggestedPrompts, "Tell me about visiting this spring."]
    : suggestedPrompts;

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading()) return;

    const userMsg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages(),
          context: {
            siteUrl,
            siteName,
            region,
            currentPage: window.location.href,
            currentSpringSlug
          }
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Too many questions — come back in an hour.");
        }
        throw new Error('Failed to connect to the trip assistant.');
      }

      const data = await res.json();
      const assistantMsg = {
        role: 'assistant',
        content: data.reply,
        sources: data.sources || []
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    localStorage.removeItem('chat_history');
    localStorage.removeItem('chat_timestamp');
    setError(null);
  };

  const renderMarkdown = (content) => {
    try {
      return marked.parse(content, { breaks: true });
    } catch {
      return content;
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-ds-button text-white shadow-lg flex items-center justify-center hover:bg-ds-header transition-colors"
        aria-label="Open trip assistant"
      >
        <Show when={!isOpen()} fallback={
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        }>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>
        </Show>
      </button>

      <div class={`fixed bottom-0 right-0 sm:bottom-24 sm:right-6 z-40 w-full sm:w-96 bg-ds-background sm:rounded-lg shadow-2xl transition-transform duration-300 transform flex flex-col ${isOpen() ? 'translate-y-0 h-[100dvh] sm:h-[600px]' : 'translate-y-full sm:translate-y-[120%] h-[100dvh] sm:h-[600px]'}`}>
        <div class="bg-ds-text text-ds-background p-4 flex justify-between items-center sm:rounded-t-lg">
          <div>
            <h3 class="font-bold text-base">Trip Assistant</h3>
            <Show when={siteName}>
              <p class="text-xs text-white/60">{siteName}</p>
            </Show>
          </div>
          <button onClick={handleNewConversation} class="text-xs text-white/70 hover:text-white" title="New Conversation">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 1 0 9-9"/></svg>
          </button>
        </div>

        <div ref={messagesContainer} class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <Show when={messages().length === 0}>
            <div class="text-black/70 text-sm text-center mb-4">
              I can help you plan a hot springs trip, find the best soaks in {region}, and recommend gear.
            </div>
            <div class="flex flex-wrap gap-2">
              <For each={allPrompts}>
                {(prompt) => (
                  <button
                    onClick={() => sendMessage(prompt)}
                    class="bg-ds-header/20 text-ds-text text-xs px-3 py-2 rounded-full hover:bg-ds-button hover:text-white transition-colors text-left"
                  >
                    {prompt}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <For each={messages()}>
            {(msg) => (
              <div class={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div class={`max-w-[90%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-ds-button text-white' : 'bg-white text-ds-text border border-ds-header/30'}`}>
                  <Show when={msg.role === 'assistant'}
                    fallback={<p class="whitespace-pre-wrap text-sm leading-relaxed font-sans">{msg.content}</p>}
                  >
                    <div class="text-sm leading-relaxed font-sans chat-md" innerHTML={renderMarkdown(msg.content)} />
                  </Show>
                </div>
                <Show when={msg.sources && msg.sources.length > 0}>
                  <div class="mt-1 text-[10px] text-black/60 flex flex-wrap gap-1">
                    <span class="mr-1">Based on:</span>
                    <For each={msg.sources}>
                      {(source) => (
                        <a href={`/springs/${source.slug}`} class="text-ds-button hover:underline">{source.name}</a>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>

          <Show when={isLoading()}>
            <div class="flex justify-start">
              <div class="bg-white text-ds-text border border-ds-header/30 rounded-lg px-4 py-3 flex gap-1">
                <span class="w-2 h-2 bg-black/40 rounded-full animate-bounce"></span>
                <span class="w-2 h-2 bg-black/40 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                <span class="w-2 h-2 bg-black/40 rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
              </div>
            </div>
          </Show>

          <Show when={error()}>
            <div class="text-center text-xs text-red-600 bg-red-50 p-2 rounded">
              {error()}
            </div>
          </Show>
        </div>

        <div class="p-3 border-t border-ds-header/30 bg-white sm:rounded-b-lg">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(inputText()); }}
            class="flex gap-2"
          >
            <input
              type="text"
              value={inputText()}
              onInput={(e) => setInputText(e.target.value)}
              placeholder="Plan your hot springs trip..."
              class="flex-1 px-3 py-2 border border-ds-header/30 rounded focus:outline-none focus:border-ds-button text-sm text-ds-text"
              disabled={isLoading()}
            />
            <button
              type="submit"
              disabled={!inputText().trim() || isLoading()}
              class="bg-ds-text text-white px-3 py-2 rounded disabled:opacity-50 hover:bg-ds-text/80 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </form>
          <div class="text-center mt-2">
            <span class="text-[9px] text-black/40 tracking-wider">AI TRIP ASSISTANT</span>
          </div>
        </div>
      </div>
    </>
  );
}
