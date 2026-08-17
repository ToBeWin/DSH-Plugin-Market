window.__ModuleLoader__.load({
  id: '@tobewin/dsh-plugin-market',
  factory: (require) => {
    const React = require('react');
    const { jsx } = require('react/jsx-runtime');
    const NS = 'settings.opcPluginMarket';
    const zh = { tab: '插件市场' };
    const en = { tab: 'Plugin Market' };
    const inject = ['slots', 'locale', 'theme'];

    function createThemeStore(theme) {
      let snapshot = theme.getTheme();
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        sync: (next) => { snapshot = next; listeners.forEach((listener) => listener()); },
      };
    }

    function replaceMarketNavIcon(label) {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        candidate.querySelector('svg') && [...candidate.querySelectorAll('span')]
          .some((element) => element.textContent.trim() === label));
      const current = button?.querySelector('svg');
      if (!current || current.dataset.opcPluginMarketIcon === 'true') return;

      // The current Settings slot contract exposes label/order only. Keep DSH
      // untouched and swap the fallback gear on this plugin's own nav row.
      const namespace = 'http://www.w3.org/2000/svg';
      const icon = document.createElementNS(namespace, 'svg');
      icon.setAttribute('class', current.getAttribute('class') ?? '');
      icon.setAttribute('width', '16');
      icon.setAttribute('height', '16');
      icon.setAttribute('viewBox', '0 0 14 14');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('aria-hidden', 'true');
      icon.dataset.opcPluginMarketIcon = 'true';
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', 'M3.034 5.667 1.701 7l1.33 1.33-.884.885L-.067 7 2.15 4.783l.884.884ZM7 14.067l-2.221-2.221.884-.884L7 12.299l1.333-1.333.884.884L7 14.067Zm4.849-4.849-.884-.884L12.299 7l-1.337-1.337.884-.884L14.067 7l-2.218 2.218ZM8.331 3.032 7 1.701 5.666 3.035l-.884-.884L7-.067l2.215 2.215-.884.884Z');
      path.setAttribute('fill', 'currentColor');
      const center = document.createElementNS(namespace, 'rect');
      center.setAttribute('x', '5.985');
      center.setAttribute('y', '5.985');
      center.setAttribute('width', '2.029');
      center.setAttribute('height', '2.029');
      center.setAttribute('fill', 'currentColor');
      icon.append(path, center);
      current.replaceWith(icon);
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-market: dictionaries');
      const t = ctx.locale.bind(NS);
      const theme = ctx.get('theme');
      const themeStore = createThemeStore(theme);
      ctx.on('theme/change', (snapshot) => themeStore.sync(snapshot));
      ctx.effect(() => {
        const refresh = () => replaceMarketNavIcon(t('tab'));
        const observer = new MutationObserver(refresh);
        observer.observe(document.body, { childList: true, subtree: true });
        refresh();
        return () => observer.disconnect();
      }, 'dsh-plugin-market: market nav icon');
      function MarketSection() {
        const snapshot = React.useSyncExternalStore(ctx.locale.subscribe.bind(ctx.locale), ctx.locale.getSnapshot.bind(ctx.locale));
        const language = snapshot.active === 'en' ? 'en' : 'zh';
        const themeSnapshot = React.useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
        const colorScheme = themeSnapshot.active.colorScheme;
        return jsx('iframe', {
          key: `${language}-${colorScheme}`,
          title: language === 'en' ? 'Local plugin manager' : '本地插件管理',
          src: `http://127.0.0.1:39183/?embed=1&lang=${language}&theme=${colorScheme}`,
          style: { border: 0, display: 'block', minHeight: '760px', width: '100%', background: 'transparent' },
        });
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'opc-plugin-market',
        order: 16,
        label: () => t('tab'),
        locale: NS,
      }, MarketSection));
    }

    return { NS, apply, inject };
  },
});
