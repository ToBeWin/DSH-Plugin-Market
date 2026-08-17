const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');

const args = process.argv.slice(2).filter((value) => value !== '--');
const [url, output] = args;
if (!url || !output) throw new Error('Usage: electron capture-market.cjs <url> <output.png>');

app.whenReady().then(async () => {
  const width = Number(process.env.CAPTURE_WIDTH ?? 1440);
  const height = Number(process.env.CAPTURE_HEIGHT ?? 980);
  const window = new BrowserWindow({ show: false, width, height });
  await window.loadURL(url);
  await window.webContents.executeJavaScript(`new Promise((resolve) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (document.querySelector('.plugin-row, .empty') || Date.now() > deadline) return resolve();
      setTimeout(check, 100);
    };
    check();
  })`);
  const image = await window.webContents.capturePage();
  writeFileSync(output, image.toPNG());
  await window.destroy();
  app.quit();
});
