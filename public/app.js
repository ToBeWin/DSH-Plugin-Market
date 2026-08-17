const translations = {
  zh: {
    title: '插件市场', subtitle: '管理本机已安装的 DeepSeek Harness 插件', addPlugin: '＋ 安装插件', install: '安装', profile: '配置档案',
    notice: '启用、停用、更新或卸载会在重启 DeepSeek Harness 后生效。', plugin: '插件', version: '版本', source: '来源', status: '状态', actions: '操作', loading: '正在读取本地 profile…',
    recent: '最近操作', collapse: '收起', installTitle: '安装插件', installHelp: '输入 npm 包名、Git 地址或本地插件目录。安装仍由官方 dsh plugin 执行。', pluginSource: '插件来源', cancel: '取消',
    local: '仅本机', inBox: '内置层', localDependency: '本地依赖', notPlugin: '非插件包', enabled: '已启用', disabled: '已停用', harnessManaged: '由 Harness 管理',
    enable: '启用', disable: '停用', update: '更新', remove: '卸载', empty: '这个 profile 尚未安装额外插件。', unavailable: '无法读取插件列表：', completed: '操作完成。重启 Harness 后生效。',
    toggleDone: '，重启 Harness 后生效。', removeConfirm: (name) => `确定卸载 ${name} 吗？这会移除当前 profile 的依赖。`, bundle: 'DeepSeek Harness 插件 bundle', core: 'Harness 基础依赖', done: '操作完成。',
  },
  en: {
    title: 'Plugin Market', subtitle: 'Manage DeepSeek Harness plugins installed on this machine', addPlugin: '＋ Install plugin', install: 'Install', profile: 'Profile',
    notice: 'Enable, disable, update, and removal changes take effect after restarting DeepSeek Harness.', plugin: 'Plugin', version: 'Version', source: 'Source', status: 'Status', actions: 'Actions', loading: 'Reading local profile…',
    recent: 'Recent activity', collapse: 'Collapse', installTitle: 'Install plugin', installHelp: 'Enter an npm package, Git URL, or local plugin directory. Installation still runs through the official dsh plugin command.', pluginSource: 'Plugin source', cancel: 'Cancel',
    local: 'Local only', inBox: 'In-box layer', localDependency: 'Local dependency', notPlugin: 'Not a plugin package', enabled: 'Enabled', disabled: 'Disabled', harnessManaged: 'Managed by Harness',
    enable: 'Enable', disable: 'Disable', update: 'Update', remove: 'Remove', empty: 'No additional plugins are installed in this profile.', unavailable: 'Unable to read plugin list: ', completed: 'Done. Restart Harness to apply the change.',
    toggleDone: '. Restart Harness to apply the change.', removeConfirm: (name) => `Remove ${name}? This removes the dependency from the current profile.`, bundle: 'DeepSeek Harness plugin bundle', core: 'Harness core dependency', done: 'Operation completed.',
  },
};

const query = new URLSearchParams(window.location.search);
const embedded = query.get('embed') === '1';
const theme = query.get('theme') === 'dark' ? 'dark' : 'light';
let language = query.get('lang') === 'en' || (!query.has('lang') && localStorage.getItem('dsh-plugin-market-language') === 'en') ? 'en' : 'zh';
const list = document.querySelector('#plugin-list');
const locationLabel = document.querySelector('#location');
const refreshButton = document.querySelector('#refresh-button');
const installButton = document.querySelector('#install-button');
const installDialog = document.querySelector('#install-dialog');
const installForm = document.querySelector('#install-form');
const specInput = document.querySelector('#plugin-spec');
const toast = document.querySelector('#toast');
const activity = document.querySelector('#activity');
const activityOutput = document.querySelector('#activity-output');
const languageButton = document.querySelector('#language-button');
let toastTimer;
let inventory;

const t = (key) => translations[language][key];

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.documentElement.dataset.dshTheme = theme;
  document.body.classList.toggle('embedded', embedded);
  document.title = language === 'en' ? 'DSH Plugin Market' : 'DSH 插件中心';
  const staticCopy = {
    title: t('title'), subtitle: t('subtitle'), addPlugin: t('addPlugin'), install: t('install'), profile: t('profile'), notice: t('notice'), plugin: t('plugin'), version: t('version'), source: t('source'), status: t('status'), actions: t('actions'), loading: t('loading'), recent: t('recent'), collapse: t('collapse'), installTitle: t('installTitle'), installHelp: t('installHelp'), pluginSource: t('pluginSource'), cancel: t('cancel'),
  };
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = staticCopy[node.dataset.i18n]; });
  document.querySelector('#local-label').textContent = t('local');
  refreshButton.title = language === 'en' ? 'Refresh plugin list' : '刷新插件列表';
  refreshButton.setAttribute('aria-label', refreshButton.title);
  specInput.placeholder = language === 'en' ? '@scope/dsh-plugin or /path/to/plugin' : '@scope/dsh-plugin 或 /path/to/plugin';
  if (inventory) render(inventory);
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

async function request(path, init) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || payload.value?.output || 'Request failed');
  return payload.value;
}

function sourceLabel(plugin) { return plugin.source === 'profile-layer' ? t('inBox') : t('localDependency'); }
function statusCell(plugin) {
  if (!plugin.bundle) return `<span class="status unavailable"><i></i>${t('notPlugin')}</span>`;
  return `<span class="status ${plugin.enabled ? 'enabled' : ''}"><i></i>${plugin.enabled ? t('enabled') : t('disabled')}</span>`;
}
function actionButton(label, action, name, kind = '') { return `<button class="button ${kind}" data-action="${action}" data-name="${encodeURIComponent(name)}">${label}</button>`; }
function actions(plugin) {
  if (plugin.source === 'profile-layer') return `<span class="source">${t('harnessManaged')}</span>`;
  const buttons = [];
  if (plugin.bundle) buttons.push(actionButton(plugin.enabled ? t('disable') : t('enable'), 'toggle', plugin.name));
  buttons.push(actionButton(t('update'), 'update', plugin.name));
  buttons.push(actionButton(t('remove'), 'remove', plugin.name, 'danger'));
  return `<div class="actions">${buttons.join('')}</div>`;
}
function render(value) {
  inventory = value;
  locationLabel.textContent = value.profileDir;
  if (!value.plugins.length) { list.innerHTML = `<p class="empty">${t('empty')}</p>`; return; }
  list.innerHTML = value.plugins.map((plugin) => `
    <article class="plugin-row">
      <div class="plugin-name"><strong title="${plugin.name}">${plugin.name}</strong><span title="${plugin.description || ''}">${plugin.description || (plugin.bundle ? t('bundle') : t('core'))}</span></div>
      <span class="value" data-label="${t('version')}">${plugin.installedVersion || plugin.requestedVersion || '—'}</span>
      <span class="source" data-label="${t('source')}">${sourceLabel(plugin)}</span>
      <span data-label="${t('status')}">${statusCell(plugin)}</span>
      ${actions(plugin)}
    </article>`).join('');
}
async function refresh() {
  refreshButton.disabled = true;
  refreshButton.textContent = '…';
  try { render(await request('/api/inventory')); } catch (error) { list.innerHTML = `<p class="empty">${t('unavailable')}${error.message}</p>`; showToast(error.message, true); }
  finally { refreshButton.disabled = false; refreshButton.textContent = '↻'; }
}
function showActivity(output) { activity.hidden = false; activityOutput.textContent = output.trim() || t('done'); }
async function runOperation(action, subject, confirm = false) {
  try {
    const result = await request('/api/operation', { method:'POST', body:JSON.stringify({ action, subject, confirm }) });
    showActivity(result.output);
    showToast(t('completed'));
    await refresh();
  } catch (error) { showToast(error.message, true); }
}
list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const name = decodeURIComponent(button.dataset.name);
  if (action === 'toggle') {
    const enabled = button.textContent === t('enable');
    button.disabled = true;
    try { await request('/api/enabled', { method:'POST', body:JSON.stringify({ name, enabled }) }); showToast(`${enabled ? t('enabled') : t('disabled')}${t('toggleDone')}`); await refresh(); }
    catch (error) { showToast(error.message, true); button.disabled = false; }
  }
  if (action === 'update') runOperation('update', name);
  if (action === 'remove' && window.confirm(t('removeConfirm')(name))) runOperation('remove', name, true);
});
refreshButton.addEventListener('click', refresh);
installButton.addEventListener('click', () => { installDialog.showModal(); specInput.focus(); });
installForm.addEventListener('submit', (event) => { event.preventDefault(); const spec = specInput.value.trim(); if (!spec) return; installDialog.close(); specInput.value = ''; runOperation('add', spec); });
document.querySelector('#close-install-dialog').addEventListener('click', () => installDialog.close());
document.querySelector('#cancel-install').addEventListener('click', () => installDialog.close());
document.querySelector('#close-activity').addEventListener('click', () => { activity.hidden = true; });
languageButton.addEventListener('click', () => { language = language === 'zh' ? 'en' : 'zh'; localStorage.setItem('dsh-plugin-market-language', language); applyLanguage(); });
applyLanguage();
refresh();
