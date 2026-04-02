// ==UserScript==
// @name         Corrigo Contact Buttons
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Shows WSC & ACE contact buttons on WO detail page — building data loaded live from private GitHub Gist
// @include      https://jll-google.corrigo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.github.com
// @updateURL    https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/Corrigo-Contacts/main/corrigo-contact-buttons.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/Corrigo-Contacts/main/corrigo-contact-buttons.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURATION — stored in GM storage, prompted on first run
    // ─────────────────────────────────────────────────────────────────────────
    const FILENAME     = 'building-data.js';
    const CACHE_KEY    = 'corrigo_building_data';
    const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
    const TOKEN_KEY    = 'corrigo_github_token';
    const GIST_KEY     = 'corrigo_gist_id';

    // ─────────────────────────────────────────────────────────────────────────
    // FIRST RUN SETUP — styled modal to collect token + gist id
    // ─────────────────────────────────────────────────────────────────────────
    function showSetupModal(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.6)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'z-index:999999', 'font-family:sans-serif'
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'background:#fff', 'border-radius:10px', 'padding:28px 32px',
            'width:420px', 'box-shadow:0 8px 32px rgba(0,0,0,0.25)'
        ].join(';');

        box.innerHTML = [
            '<h2 style="margin:0 0 6px;font-size:16px;color:#1a1a1a;">Corrigo Contact Buttons</h2>',
            '<p style="margin:0 0 20px;font-size:13px;color:#555;">First-time setup — enter your GitHub credentials. Saved locally, never shared.</p>',
            '<label style="display:block;font-size:12px;font-weight:600;color:#333;margin-bottom:4px;">GitHub Token</label>',
            '<input id="cbb-token" type="password" placeholder="ghp_..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:14px;" />',
            '<label style="display:block;font-size:12px;font-weight:600;color:#333;margin-bottom:4px;">Gist ID</label>',
            '<input id="cbb-gist" type="text" placeholder="abc123def456..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:20px;" />',
            '<div id="cbb-error" style="color:#c0392b;font-size:12px;margin-bottom:10px;display:none;"></div>',
            '<div style="display:flex;gap:10px;justify-content:flex-end;">',
            '  <button id="cbb-cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;font-size:13px;cursor:pointer;">Cancel</button>',
            '  <button id="cbb-save" style="padding:8px 16px;border:none;border-radius:6px;background:#2d89ef;color:white;font-size:13px;cursor:pointer;font-weight:600;">Save & Connect</button>',
            '</div>'
        ].join('');

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('cbb-cancel').onclick = function() { overlay.remove(); };

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
            overlay.remove();
            callback(token, gist);
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
            showSetupModal(callback);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATA LOADER — fetches Gist, injects into page scope, caches in GM storage
    // ─────────────────────────────────────────────────────────────────────────
    function loadBuildingData(token, gistId, callback) {
        var cached     = GM_getValue(CACHE_KEY, null);
        var cachedAt   = GM_getValue(CACHE_KEY + '_ts', 0);
        var cacheValid = cached && (Date.now() - cachedAt < CACHE_TTL_MS);

        if (cacheValid) {
            try {
                var s = document.createElement('script');
                s.textContent = cached;
                document.head.appendChild(s);
                document.head.removeChild(s);
                if (window.BuildingLib && window.BuildingLib.buildingContactMap) {
                    callback(window.BuildingLib.buildingContactMap);
                    return;
                }
            } catch (e) {
                console.warn('[Corrigo Buttons] Cache eval failed, re-fetching.', e);
            }
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
                    console.error('[Corrigo Buttons] Invalid token — clearing saved credentials.');
                    GM_setValue(TOKEN_KEY, null);
                    GM_setValue(GIST_KEY, null);
                    alert('Corrigo Buttons: GitHub token is invalid. Reload the page to re-enter your credentials.');
                    return;
                }
                if (response.status !== 200) {
                    console.error('[Corrigo Buttons] Failed to fetch building data. Status:', response.status);
                    return;
                }
                var jsText;
                try {
                    var gistData = JSON.parse(response.responseText);
                    jsText = gistData.files[FILENAME] && gistData.files[FILENAME].content;
                    if (!jsText) {
                        console.error('[Corrigo Buttons] File "' + FILENAME + '" not found in Gist. Check your Gist ID.');
                        return;
                    }
                } catch (e) {
                    console.error('[Corrigo Buttons] Failed to parse Gist API response:', e);
                    return;
                }
                try {
                    var script = document.createElement('script');
                    script.textContent = jsText;
                    document.head.appendChild(script);
                    document.head.removeChild(script);
                    if (!window.BuildingLib || !window.BuildingLib.buildingContactMap) {
                        console.error('[Corrigo Buttons] building-data.js loaded but window.BuildingLib not found. Check the Gist file.');
                        return;
                    }
                    GM_setValue(CACHE_KEY, jsText);
                    GM_setValue(CACHE_KEY + '_ts', Date.now());
                    callback(window.BuildingLib.buildingContactMap);
                } catch (e) {
                    console.error('[Corrigo Buttons] Failed to evaluate building-data.js:', e);
                }
            },
            onerror: function(err) {
                console.error('[Corrigo Buttons] Network error fetching building data:', err);
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
        getCredentials(function(token, gistId) {
            loadBuildingData(token, gistId, function(buildingContactMap) {
                setupModalButtons(buildingContactMap);
                setupInlineButtons(buildingContactMap);
            });
        });
    });

})();
