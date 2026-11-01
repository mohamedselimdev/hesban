const { app, safeStorage } = require('electron');
app.whenReady().then(async () => {
  const r = {};
  try {
    r.asyncAvailable = await safeStorage.isAsyncEncryptionAvailable();
    const blob = await safeStorage.encryptStringAsync('secret-key-material');
    r.blobBytes = blob.length;
    const back = await safeStorage.decryptStringAsync(blob);
    r.roundTrip = JSON.stringify(back);
  } catch (e) { r.error = String(e); }
  console.log(JSON.stringify(r));
  app.exit(0);
});
