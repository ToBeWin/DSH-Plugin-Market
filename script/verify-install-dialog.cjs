const { app, BrowserWindow } = require('electron');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 700 });
  await window.loadURL('http://127.0.0.1:39183/?embed=1&lang=en');
  await delay(250);
  const dialogClosed = await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('#install-dialog');
    document.querySelector('#install-button').click();
    if (!dialog.open) return false;
    document.querySelector('#close-install-dialog').click();
    return !dialog.open;
  })()`);
  await window.destroy();
  app.quit();
  if (!dialogClosed) throw new Error('Install dialog close control did not dismiss the dialog');
});
