(() => {
  "use strict";
  const CLIENT_ID_KEY = "goe_google_oauth_client_id_v1";
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  let accessToken = "";
  let accountEmail = "";
  let folderId = "";
  let profileProvider = function(){ return []; };
  let tokenClient;
  const $ = function(id){ return document.getElementById(id); };

  function apiError(message){ throw new Error(message); }

  function renderStatus(message, error) {
    const el = $("driveAccountStatus");
    if(!el) return;
    el.textContent = message;
    el.classList.toggle("error", Boolean(error));
  }

  function hasGoogleIdentity(){
    return Boolean(window.google && window.google.accounts && window.google.accounts.oauth2);
  }

  function updateButtons(){
    const clientId = $("googleClientId") && $("googleClientId").value.trim() || "";
    const ready = hasGoogleIdentity();
    $("connectGoogle").disabled = !clientId || !ready || location.protocol === "file:";
    $("disconnectGoogle").hidden = !accessToken;
    $("backupImagesDrive").disabled = !accessToken;

    if(location.protocol === "file:") {
      renderStatus("Google sign-in requires HTTPS or localhost.");
    } else if(accessToken) {
      renderStatus("Connected: " + accountEmail + ". Google Drive backup is ready.");
    } else if(!clientId) {
      renderStatus("Save a Google OAuth client ID to enable sign-in.");
    } else if(!ready) {
      renderStatus("Loading Google sign-in…");
    } else {
      renderStatus("Not connected. Sign in to back up images in your own Google Drive.");
    }
  }

  function saveClientId(){
    const value = $("googleClientId").value.trim();
    if(value && !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value)) {
      renderStatus("That does not look like a valid Google OAuth client ID.", true);
      return;
    }

    try {
      if(value) {
        localStorage.setItem(CLIENT_ID_KEY, value);
      } else {
        localStorage.removeItem(CLIENT_ID_KEY);
      }
    } catch(error) {
      renderStatus("Could not save the Google client ID: " + error.message, true);
      return;
    }

    tokenClient = null;
    renderStatus(value ? "Client ID saved on this device." : "Google client ID cleared.");
    updateButtons();
  }

  function connect(){
    const clientId = $("googleClientId").value.trim();
    if(!clientId) {
      renderStatus("Enter and save your Google OAuth client ID first.", true);
      return;
    }
    if(!hasGoogleIdentity()) {
      renderStatus("Google sign-in is still loading. Try again in a moment.", true);
      return;
    }
    if(location.protocol === "file:") {
      renderStatus("Run this app on HTTPS or localhost before Google sign-in.", true);
      return;
    }

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile " + DRIVE_SCOPE,
        callback: async function(response) {
          if(response.error) {
            accessToken = "";
            accountEmail = "";
            updateButtons();
            renderStatus("Google sign-in failed: " + response.error, true);
            return;
          }
          if(!response.access_token) {
            renderStatus("Google returned no access token.", true);
            return;
          }

          accessToken = response.access_token;
          try {
            const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
              headers: {
                Authorization: "Bearer " + accessToken
              }
            });
            if(!userInfoResponse.ok) throw new Error("Google account lookup failed (" + userInfoResponse.status + ").");
            const user = await userInfoResponse.json();
            accountEmail = typeof user.email === "string" && user.email ? user.email : "Google account";
            updateButtons();
          } catch(error) {
            accessToken = "";
            accountEmail = "";
            updateButtons();
            renderStatus("Signed-in account could not be verified: " + error.message, true);
          }
        },
        error_callback: function(error) {
          renderStatus("Google sign-in could not start: " + (error.message || error.type || "unknown error"), true);
        }
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch(error) {
      renderStatus("Could not start Google sign-in: " + error.message, true);
    }
  }

  function disconnect(){
    accessToken = "";
    accountEmail = "";
    folderId = "";
    tokenClient = null;
    updateButtons();
    renderStatus("Disconnected from this browser. You can revoke access from your Google Account settings.");
  }

  async function driveRequest(url, options) {
    if(!accessToken) throw new Error("Sign in with Google before using Drive storage.");
    const requestOptions = Object.assign({}, options, {
      headers: Object.assign({
        Authorization: "Bearer " + accessToken
      }, options && options.headers ? options.headers : {})
    });
    const response = await fetch(url, requestOptions);
    let body = {};

    try {
      body = await response.json();
    } catch(error) {
      if(response.ok) throw new Error("Google Drive replied with invalid JSON.");
    }

    if(!response.ok) {
      throw new Error(body && body.error && body.error.message ? body.error.message : "Google Drive request failed (" + response.status + ").");
    }

    return body;
  }

  function escapeDriveQuery(value){
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function getDriveFolder(){
    if(folderId) return folderId;
    const query = "name = 'GOD OF EVERYTHING Creator Hub' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const list = await driveRequest("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(query) + "&pageSize=100&fields=files(id,name)");

    if(list.files && list.files.length) {
      folderId = list.files[0].id;
      return folderId;
    }

    const created = await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "GOD OF EVERYTHING Creator Hub",
        mimeType: "application/vnd.google-apps.folder"
      })
    });

    if(!created.id) throw new Error("Google Drive did not return the new folder ID.");
    folderId = created.id;
    return folderId;
  }

  function extensionFor(blob){
    const map = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };
    return map[blob.type] || "img";
  }

  async function findImage(profileId, role, parentId){
    const query = "'" + escapeDriveQuery(parentId) + "' in parents and appProperties has { key='hubProfileId' and value='" + escapeDriveQuery(profileId) + "' } and appProperties has { key='imageRole' and value='" + role + "' } and trashed = false";
    const result = await driveRequest("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(query) + "&pageSize=10&fields=files(id,name)");
    return result.files && result.files[0] ? result.files[0] : null;
  }

  async function uploadImage(profile, role, blob, parentId){
    const existing = await findImage(profile.id, role, parentId);
    const ext = extensionFor(blob);
    const slug = String(profile.slug || "creator").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48) || "creator";
    const metadata = {
      name: slug + "-" + role + "." + ext,
      mimeType: blob.type,
      appProperties: {
        hubProfileId: String(profile.id),
        imageRole: role
      }
    };

    if(!existing) metadata.parents = [parentId];

    const boundary = "-------creatorHub" + crypto.randomUUID().replace(/-/g, "");
    const multipart = new Blob([
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n",
      "--" + boundary + "\r\nContent-Type: " + blob.type + "\r\n\r\n",
      blob,
      "\r\n--" + boundary + "--"
    ], {
      type: "multipart/related; boundary=" + boundary
    });

    const endpoint = existing
      ? "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(existing.id) + "?uploadType=multipart&fields=id,name"
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name";

    const result = await driveRequest(endpoint, {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipart
    });

    if(!result.id) throw new Error("Google Drive did not confirm the uploaded image.");
  }

  async function backupProfile(profile){
    const images = [["avatar", profile.avatarBlob], ["cover", profile.coverBlob]].filter(function(entry){ return entry[1] instanceof Blob; });
    if(!images.length) return 0;

    const parentId = await getDriveFolder();
    let uploaded = 0;
    try {
      for(let i = 0; i < images.length; i += 1) {
        await uploadImage(profile, images[i][0], images[i][1], parentId);
        uploaded += 1;
      }
    } catch(error) {
      throw new Error("Backed up " + uploaded + " image(s) before failure: " + error.message);
    }
    return uploaded;
  }

  async function backupAll(){
    if(!accessToken) {
      renderStatus("Sign in with Google before backing up images.", true);
      return;
    }

    const profiles = await profileProvider();
    const profilesWithImages = profiles.filter(function(profile){ return profile.avatarBlob instanceof Blob || profile.coverBlob instanceof Blob; });
    const total = profilesWithImages.reduce(function(sum, profile){
      return sum + Number(profile.avatarBlob instanceof Blob) + Number(profile.coverBlob instanceof Blob);
    }, 0);

    if(!total) {
      renderStatus("There are no saved profile images to back up.");
      return;
    }

    let uploaded = 0;
    try {
      for(let i = 0; i < profilesWithImages.length; i += 1) {
        renderStatus("Backing up profile " + (i + 1) + " of " + profilesWithImages.length + "…");
        uploaded += await backupProfile(profilesWithImages[i]);
      }
      renderStatus("Backed up " + uploaded + " image(s) to " + accountEmail + "s Google Drive.");
    } catch(error) {
      renderStatus("Backed up " + uploaded + " of " + total + " image(s). " + error.message, true);
    }
  }

  function setProfileProvider(provider){
    if(typeof provider !== "function") throw new Error("The profile provider must be a function.");
    profileProvider = provider;
  }

  function initialize(){
    const settings = $("settings");
    if(!settings) return;

    const panel = document.createElement("div");
    panel.className = "drive-settings";
    panel.innerHTML = '<h3>Google account & private image storage</h3><p class="muted">Optional: sign in with your own Google account and back up creator profile images to your Google Drive. Profiles, reports, and settings remain local unless you explicitly choose to use Drive.</p><div class="field"><label for="googleClientId">Google OAuth client ID</label><input id="googleClientId" type="text" autocomplete="off" spellcheck="false" placeholder="1234567890-abcdefghijk.apps.googleusercontent.com"><span class="hint">This is a public web client ID only. Never paste a secret key here.</span></div><div class="actions"><button id="saveGoogleClientId" class="secondary" type="button">Save client ID</button><button id="connectGoogle" class="primary" type="button">Sign in with Google</button><button id="disconnectGoogle" class="secondary" type="button" hidden>Disconnect</button><button id="backupImagesDrive" class="secondary" type="button">Back up saved images</button></div><p id="driveAccountStatus" class="hint" role="status" aria-live="polite"></p><p class="hint"><a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Create a Google OAuth client</a>. Google controls quotas and terms, so this cannot be guaranteed free forever.</p>';
    settings.insertBefore(panel, settings.querySelector(".actions"));

    try {
      $("googleClientId").value = localStorage.getItem(CLIENT_ID_KEY) || "";
    } catch(error) {
      renderStatus("Could not load the Google client ID: " + error.message, true);
    }

    $("saveGoogleClientId").addEventListener("click", saveClientId);
    $("connectGoogle").addEventListener("click", connect);
    $("disconnectGoogle").addEventListener("click", disconnect);
    $("backupImagesDrive").addEventListener("click", backupAll);
    $("googleClientId").addEventListener("input", updateButtons);

    const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if(script) {
      script.addEventListener("load", updateButtons);
      script.addEventListener("error", function(){ renderStatus("Google sign-in could not load. Refresh the page or check connectivity.", true); });
    }
    updateButtons();
  }

  window.GOEDrive = {
    isConnected: function(){ return Boolean(accessToken); },
    backupProfile: backupProfile,
    backupAll: backupAll,
    setProfileProvider: setProfileProvider
  };

  initialize();
})();
