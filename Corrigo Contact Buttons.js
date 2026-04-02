// ==UserScript==
// @name         Corrigo Contact Buttons
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Shows WSC & ACE contact buttons on WO detail page — building data loaded live from private GitHub Gist
// @include      https://jll-google.corrigo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.github.com
// @updateURL    https://raw.githubusercontent.com/connorchacon124-alt/Corrigo-Contacts/main/corrigo-contact-buttons.user.js
// @downloadURL  https://raw.githubusercontent.com/connorchacon124-alt/Corrigo-Contacts/main/corrigo-contact-buttons.user.js
// ==/UserScript==

(function () {
    'use strict';

    const FILENAME     = 'building-data.js';
    const CACHE_KEY    = 'corrigo_building_data';
    const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
    const TOKEN_KEY    = 'corrigo_github_token';
    const GIST_KEY     = 'corrigo_gist_id';

    // ─────────────────────────────────────────────────────────────────────────
    // PARSE — handles flat window.BuildingLib = { buildingContactMap: {...} }
    // ─────────────────────────────────────────────────────────────────────────
    function parseBuildingData(jsText) {
        try {
            console.log('[Corrigo Buttons] jsText preview:', jsText.substring(0, 200));
            // Strip the JS wrapper and parse the inner JSON
            var match = jsText.match(/window\.BuildingLib\s*=\s*(\{[\s\S]+\})\s*;/);
            if (match) {
                var parsed = JSON.parse(match[1]);
                if (parsed.buildingContactMap) {
                    console.log('[Corrigo Buttons] Successfully parsed buildingContactMap.');
                    return parsed.buildingContactMap;
                }
            }
            console.error('[Corrigo Buttons] Could not find buildingContactMap in Gist file.');
            return null;
        } catch (e) {
            console.error('[Corrigo Buttons] Failed to parse building data:', e);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODAL BUILDER — shared by setup + settings
    // ─────────────────────────────────────────────────────────────────────────
    function showCredentialModal(existingToken, existingGist, onSave) {
        var overlay = document.createElement('div');
        overlay.id = 'cbb-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:sans-serif;';

        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:10px;padding:28px 32px;width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.25);';
        var isFirstRun = !existingToken && !existingGist;
        var cachedAt = GM_getValue(CACHE_KEY + '_ts', 0);
        var lastUpdated = cachedAt ? 'Last synced: ' + new Date(cachedAt).toLocaleTimeString() : 'Not yet synced';

        box.innerHTML = [
            '<h2 style="margin:0 0 6px;font-size:16px;color:#1a1a1a;">Corrigo Contact Buttons</h2>',
            '<p style="margin:0 0 20px;font-size:13px;color:#555;">' + (isFirstRun ? 'First-time setup — enter your GitHub credentials.' : 'Update your GitHub credentials below.') + ' Saved locally, never shared.</p>',
            '<label style="display:block;font-size:12px;font-weight:600;color:#333;margin-bottom:4px;">GitHub Token</label>',
            '<input id="cbb-token" type="password" placeholder="ghp_..." value="' + (existingToken || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:14px;" />',
            '<label style="display:block;font-size:12px;font-weight:600;color:#333;margin-bottom:4px;">Gist ID</label>',
            '<input id="cbb-gist" type="text" placeholder="abc123def456..." value="' + (existingGist || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:14px;" />',
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">',
            '<span id="cbb-sync-status" style="font-size:11px;color:#888;">' + lastUpdated + '</span>',
            '<button id="cbb-refresh" style="padding:6px 12px;border:1px solid #2d89ef;border-radius:6px;background:#fff;color:#2d89ef;font-size:12px;cursor:pointer;font-weight:600;">Force Refresh</button>',
            '</div>',
            '<div id="cbb-error" style="color:#c0392b;font-size:12px;margin-bottom:10px;display:none;"></div>',
            '<div style="display:flex;gap:10px;justify-content:flex-end;">',
            '<button id="cbb-cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;font-size:13px;cursor:pointer;">Cancel</button>',
            '<button id="cbb-save" style="padding:8px 16px;border:none;border-radius:6px;background:#2d89ef;color:white;font-size:13px;cursor:pointer;font-weight:600;">Save & Connect</button>',
            '</div>'
        ].join('');

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('cbb-cancel').onclick = function() { overlay.remove(); };

        document.getElementById('cbb-refresh').onclick = function() {
            var refreshBtn = document.getElementById('cbb-refresh');
            var status = document.getElementById('cbb-sync-status');
            refreshBtn.textContent = 'Refreshing...';
            refreshBtn.disabled = true;
            GM_setValue(CACHE_KEY, null);
            GM_setValue(CACHE_KEY + '_ts', 0);
            var token = GM_getValue(TOKEN_KEY, null);
            var gist  = GM_getValue(GIST_KEY, null);
            if (!token || !gist) {
                status.textContent = 'No credentials saved yet.';
                refreshBtn.textContent = 'Force Refresh';
                refreshBtn.disabled = false;
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.github.com/gists/' + gist,
                headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' },
                onload: function(response) {
                    if (response.status !== 200) {
                        status.textContent = 'Refresh failed. Status: ' + response.status;
                        refreshBtn.textContent = 'Force Refresh';
                        refreshBtn.disabled = false;
                        return;
                    }
                    try {
                        var gistData = JSON.parse(response.responseText);
                        var jsText = gistData.files[FILENAME] && gistData.files[FILENAME].content;
                        if (jsText) {
                            GM_setValue(CACHE_KEY, jsText);
                            GM_setValue(CACHE_KEY + '_ts', Date.now());
                            status.textContent = 'Last synced: ' + new Date().toLocaleTimeString();
                        }
                    } catch(e) {}
                    refreshBtn.textContent = 'Done!';
                    refreshBtn.style.borderColor = '#1e7a3c';
                    refreshBtn.style.color = '#1e7a3c';
                    setTimeout(function() {
                        refreshBtn.textContent = 'Force Refresh';
                        refreshBtn.style.borderColor = '#2d89ef';
                        refreshBtn.style.color = '#2d89ef';
                        refreshBtn.disabled = false;
                    }, 2000);
                },
                onerror: function() {
                    status.textContent = 'Network error during refresh.';
                    refreshBtn.textContent = 'Force Refresh';
                    refreshBtn.disabled = false;
                }
            });
        };

        document.getElementById('cbb-save').onclick = function() {
            var token = document.getElementById('cbb-token').value.trim();
            var gist  = document.getElementById('cbb-gist').value.trim();
            var error = document.getElementById('cbb-error');
            if (!token || !gist) {
                error.textContent = 'Both fields are required.';
                error.style.display = 'block';
                return;
            }
            if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
                error.textContent = 'Token should start with ghp_ or github_pat_';
                error.style.display = 'block';
                return;
            }
            GM_setValue(TOKEN_KEY, token);
            GM_setValue(GIST_KEY, gist);
            // Clear cache so it re-fetches with new credentials
            GM_setValue(CACHE_KEY, null);
            GM_setValue(CACHE_KEY + '_ts', 0);
            overlay.remove();
            onSave(token, gist);
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREDENTIALS — returns saved creds or triggers setup modal
    // ─────────────────────────────────────────────────────────────────────────
    function getCredentials(callback) {
        var token = GM_getValue(TOKEN_KEY, null);
        var gist  = GM_getValue(GIST_KEY, null);
        if (token && gist) {
            callback(token, gist);
        } else {
            showCredentialModal(null, null, callback);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SETTINGS BUTTON — fixed bottom-left of window
    // ─────────────────────────────────────────────────────────────────────────
    function addSettingsButton() {
        var btn = document.createElement('button');
        btn.textContent = 'CB Settings';
        btn.title = 'Corrigo Buttons — Edit GitHub Token & Gist ID';
        btn.style.cssText = [
            'position:fixed',
            'bottom:16px',
            'left:16px',
            'z-index:99999',
            'padding:7px 13px',
            'background:#1a1a2e',
            'color:#fff',
            'border:none',
            'border-radius:6px',
            'font-size:12px',
            'font-family:sans-serif',
            'cursor:pointer',
            'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
            'opacity:0.75',
            'transition:opacity 0.2s'
        ].join(';');
        btn.onmouseenter = function() { btn.style.opacity = '1'; };
        btn.onmouseleave = function() { btn.style.opacity = '0.75'; };
        btn.onclick = function() {
            var token = GM_getValue(TOKEN_KEY, null);
            var gist  = GM_getValue(GIST_KEY, null);
            showCredentialModal(token, gist, function(newToken, newGist) {
                // Reload the page so the new credentials take effect
                window.location.reload();
            });
        };
        document.body.appendChild(btn);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATA LOADER
    // ─────────────────────────────────────────────────────────────────────────
    function loadBuildingData(token, gistId, callback) {
        var cached     = GM_getValue(CACHE_KEY, null);
        var cachedAt   = GM_getValue(CACHE_KEY + '_ts', 0);
        var cacheValid = cached && (Date.now() - cachedAt < CACHE_TTL_MS);

        if (cacheValid) {
            var map = parseBuildingData(cached);
            if (map) { callback(map); return; }
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.github.com/gists/' + gistId,
            headers: {
                'Authorization': 'token ' + token,
                'Accept': 'application/vnd.github+json'
            },
            onload: function(response) {
                if (response.status === 401) {
                    GM_setValue(TOKEN_KEY, null);
                    GM_setValue(GIST_KEY, null);
                    alert('Corrigo Buttons: GitHub token is invalid. Reload the page to re-enter your credentials.');
                    return;
                }
                if (response.status !== 200) {
                    console.error('[Corrigo Buttons] Failed to fetch building data. Status:', response.status);
                    return;
                }
                try {
                    var gistData = JSON.parse(response.responseText);
                    var jsText   = gistData.files[FILENAME] && gistData.files[FILENAME].content;
                    if (!jsText) {
                        console.error('[Corrigo Buttons] File "' + FILENAME + '" not found in Gist.');
                        return;
                    }
                    var map = parseBuildingData(jsText);
                    if (!map) return;
                    GM_setValue(CACHE_KEY, jsText);
                    GM_setValue(CACHE_KEY + '_ts', Date.now());
                    callback(map);
                } catch (e) {
                    console.error('[Corrigo Buttons] Failed to process Gist response:', e);
                }
            },
            onerror: function(err) {
                console.error('[Corrigo Buttons] Network error:', err);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function copyToClipboard(text) { navigator.clipboard.writeText(text); }

    function createCopyButton(label, value, id) {
        var btn = document.createElement('button');
        btn.textContent = label + ': ' + value;
        btn.id = id;
        btn.style.cssText = 'margin:5px;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;background:#2d89ef;color:white;font-size:12px;';
        btn.onclick = function() {
            copyToClipboard(value);
            var original = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.style.background = '#1e7a3c';
            setTimeout(function() {
                btn.textContent = original;
                btn.style.background = '#2d89ef';
            }, 1500);
        };
        return btn;
    }

    function getBuildingCodeFromText(text) {
        var match = text.match(/(?:US-)?(?:MTV|MLP)[-\w\d]+/i);
        return match ? match[0].replace(/^US-/i, '').trim().toUpperCase() : null;
    }

    function getContact(buildingContactMap, buildingCode) {
        if (!buildingCode) return null;
        return buildingContactMap[buildingCode] || buildingContactMap[buildingCode.toUpperCase()] || null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTON INJECTION — Modal
    // ─────────────────────────────────────────────────────────────────────────
    function setupModalButtons(buildingContactMap) {
        var observer = new MutationObserver(function() {
            var modal = document.querySelector('div.modal-body');
            if (modal && !modal.querySelector('#wscButton')) {
                var buildingCode = getBuildingCodeFromText(modal.innerText);
                var contact = getContact(buildingContactMap, buildingCode);
                if (!contact) return;
                modal.appendChild(createCopyButton('WSC', contact.WSC, 'wscButton'));
                modal.appendChild(createCopyButton('ACE', contact.ACE, 'aceButton'));
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTON INJECTION — Inline
    // ─────────────────────────────────────────────────────────────────────────
    function setupInlineButtons(buildingContactMap) {
        var interval = setInterval(function() {
            var container = document.querySelector('div.lv-value span.lv-value-as-link');
            if (container && !document.querySelector('#wscInlineButton')) {
                var buildingCode = getBuildingCodeFromText(container.textContent);
                var contact = getContact(buildingContactMap, buildingCode);
                if (!contact) return;
                var wscBtn = createCopyButton('WSC', contact.WSC, 'wscInlineButton');
                var aceBtn = createCopyButton('ACE', contact.ACE, 'aceInlineButton');
                wscBtn.style.marginLeft = '10px';
                aceBtn.style.marginLeft = '5px';
                container.parentElement.appendChild(wscBtn);
                container.parentElement.appendChild(aceBtn);
                clearInterval(interval);
            }
        }, 500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────
    window.addEventListener('load', function() {
        addSettingsButton();
        getCredentials(function(token, gistId) {
            loadBuildingData(token, gistId, function(buildingContactMap) {
                setupModalButtons(buildingContactMap);
                setupInlineButtons(buildingContactMap);
            });
        });
    });

})();
