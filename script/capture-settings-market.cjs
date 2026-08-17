const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');

const args = process.argv.slice(2).filter((value) => value !== '--');
const [url, output] = args;
if (!url || !output) throw new Error('Usage: electron capture-settings-market.cjs <url> <output.png>');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clickText = (window, label) => window.webContents.executeJavaScript(`(() => {
  const candidate = [...document.querySelectorAll('button, [role="button"]')]
    .find((element) => element.textContent.trim() === ${JSON.stringify(label)});
  if (!candidate) return false;
  candidate.click();
  return true;
})()`);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 980 });
  await window.loadURL(url);
  await delay(800);
  await clickText(window, 'Continue');
  await delay(500);
  if (!await clickText(window, 'Settings')) throw new Error('Settings entry was not found');
  await delay(450);
  if (!await clickText(window, 'Plugin Market')) throw new Error('Plugin Market entry was not found');
  await delay(900);
  await clickText(window, 'Configure later');
  await delay(350);
  const image = await window.webContents.capturePage();
  writeFileSync(output, image.toPNG());
  await window.destroy();
  app.quit();
});
