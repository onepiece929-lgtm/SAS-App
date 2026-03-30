const DRIVE = (() => {
  const CLIENT_ID   = '391773010103-rf7nnvkp0hlbq2bn3qdsqc7jhvjltesu.apps.googleusercontent.com';
  const API_KEY     = 'AIzaSyBlBYizS7rhbrg_X1JVx_hMSQCKf4c0iXU';
  const FOLDER_NAME = 'SAS外来記録';

  const SCOPES = 'https://www.googleapis.com/auth/drive.file';
  let tokenClient;
  let folderId = null;

  async function init() {
    await loadGapiAndGis();
    await new Promise(resolve => gapi.load('client', resolve));
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    });
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '',
    });
  }

  function loadGapiAndGis() {
    return new Promise(resolve => {
      if (window.gapi && window.google) return resolve();
      let loaded = 0;
      const check = () => { if (++loaded === 2) resolve(); };
      const s1 = document.createElement('script');
      s1.src = 'https://apis.google.com/js/api.js';
      s1.onload = check;
      const s2 = document.createElement('script');
      s2.src = 'https://accounts.google.com/gsi/client';
      s2.onload = check;
      document.head.append(s1, s2);
    });
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      tokenClient.callback = async (resp) => {
        if (resp.error) return reject(resp);
        folderId = await getOrCreateFolder();
        resolve(resp);
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  function signOut() {
    const token = gapi.client.getToken();
    if (token) {
      google.accounts.oauth2.revoke(token.access_token);
      gapi.client.setToken('');
      folderId = null;
    }
  }

  async function getOrCreateFolder() {
    const res = await gapi.client.drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    if (res.result.files.length > 0) return res.result.files[0].id;
    const folder = await gapi.client.drive.files.create({
      resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    return folder.result.id;
  }

  async function savePDF(pdfBlob, fileName) {
    if (!folderId) throw new Error('先にサインインしてください');
    const metadata = { name: fileName, mimeType: 'application/pdf', parents: [folderId] };
    const base64 = await blobToBase64(pdfBlob);
    const boundary = '-------314159265358979323846';
    const body = [
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` + JSON.stringify(metadata),
      `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n` + base64,
      `--${boundary}--`,
    ].join('\r\n');
    const res = await gapi.client.request({
      path: 'https://www.googleapis.com/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body,
    });
    return res.result;
  }

  async function saveJSON(data, fileName) {
    if (!folderId) throw new Error('先にサインインしてください');
    const existing = await gapi.client.drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });
    const content = JSON.stringify(data, null, 2);
    if (existing.result.files.length > 0) {
      const fileId = existing.result.files[0].id;
      await gapi.client.request({
        path: `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        headers: { 'Content-Type': 'application/json' },
        body: content,
      });
    } else {
      const blob = new Blob([content], { type: 'application/json' });
      const base64 = await blobToBase64(blob);
      const metadata = { name: fileName, mimeType: 'application/json', parents: [folderId] };
      const boundary = '-------314159265358979323846';
      const body = [
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n` + JSON.stringify(metadata),
        `--${boundary}\r\nContent-Type: application/json\r\nContent-Transfer-Encoding: base64\r\n\r\n` + base64,
        `--${boundary}--`,
      ].join('\r\n');
      await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body,
      });
    }
  }

  async function loadJSON(fileName) {
    if (!folderId) throw new Error('先にサインインしてください');
    const res = await gapi.client.drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });
    if (res.result.files.length === 0) return null;
    const fileId = res.result.files[0].id;
    const content = await gapi.client.drive.files.get({ fileId, alt: 'media' });
    return JSON.parse(content.body);
  }

  async function listFiles() {
    if (!folderId) throw new Error('先にサインインしてください');
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, createdTime, size)',
      orderBy: 'createdTime desc',
    });
    return res.result.files;
  }

  function blobToBase64(blob) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }

  return { init, signIn, signOut, savePDF, saveJSON, loadJSON, listFiles };
})();
