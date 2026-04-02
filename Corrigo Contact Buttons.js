// ==UserScript==
// @name         Corrigo Contact Buttons
// @namespace    http://tampermonkey.net/
// @version      2.1
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

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURATION — paste your values here
    // ─────────────────────────────────────────────────────────────────────────
    const GITHUB_TOKEN = 'YOUR_NEW_GITHUB_TOKEN'; // ← paste your regenerated token here
    const GIST_ID      = 'YOUR_GIST_ID';          // ← the hash from the Gist URL
    const FILENAME     = 'building-data.js';
    const CACHE_KEY    = 'corrigo_building_data';
    const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour — re-fetches after this

    // ─────────────────────────────────────────────────────────────────────────
    // DATA LOADER — fetches Gist, evals window.BuildingLib, caches in GM storage
    // ─────────────────────────────────────────────────────────────────────────
    function loadBuildingData(callback) {
        // Check GM storage cache first
        const cached     = GM_getValue(CACHE_KEY, null);
        const cachedAt   = GM_getValue(CACHE_KEY + '_ts', 0);
        const cacheValid = cached && (Date.now() - cachedAt < CACHE_TTL_MS);

        if (cacheValid) {
            try {
                // Re-evaluate the cached JS string to restore window.BuildingLib
                // eslint-disable-next-line no-new-func
                new Function(cached)();
                if (window.BuildingLib?.buildingContactMap) {
                    callback(window.BuildingLib.buildingContactMap);
                    return;
                }
            } catch (e) {
                console.warn('[Corrigo Buttons] Cache eval failed, re-fetching.', e);
            }
        }

        // Fetch fresh copy from Gist via authenticated GitHub API
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://api.github.com/gists/${GIST_ID}`,
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json'
            },
            onload(response) {
                if (response.status !== 200) {
                    console.error('[Corrigo Buttons] Failed to fetch building data. Status:', response.status);
                    return;
                }
                let jsText;
                try {
                    const gistData = JSON.parse(response.responseText);
                    jsText = gistData.files[FILENAME]?.content;
                    if (!jsText) {
                        console.error(`[Corrigo Buttons] File "${FILENAME}" not found in Gist. Check FILENAME config.`);
                        return;
                    }
                } catch (e) {
                    console.error('[Corrigo Buttons] Failed to parse Gist API response:', e);
                    return;
                }
                try {
                    // eslint-disable-next-line no-new-func
                    new Function(jsText)();
                    if (!window.BuildingLib?.buildingContactMap) {
                        console.error('[Corrigo Buttons] building-data.js loaded but window.BuildingLib not found. Check the Gist file.');
                        return;
                    }
                    // Cache it for next time
                    GM_setValue(CACHE_KEY, jsText);
                    GM_setValue(CACHE_KEY + '_ts', Date.now());
                    callback(window.BuildingLib.buildingContactMap);
                } catch (e) {
                    console.error('[Corrigo Buttons] Failed to evaluate building-data.js:', e);
                }
            },
            onerror(err) {
                console.error('[Corrigo Buttons] Network error fetching building data:', err);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const copyToClipboard = (text) => navigator.clipboard.writeText(text);

    const createCopyButton = (label, value, id) => {
        const btn = document.createElement('button');
        btn.textContent = `${label}: ${value}`;
        btn.id = id;
        btn.style.cssText = `
            margin: 5px;
            padding: 5px 10px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            background: #2d89ef;
            color: white;
            font-size: 12px;
        `;
        btn.onclick = () => {
            copyToClipboard(value);
            const original = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.style.background = '#1e7a3c';
            setTimeout(() => {
                btn.textContent = original;
                btn.style.background = '#2d89ef';
            }, 1500);
        };
        return btn;
    };

    const getBuildingCodeFromText = (text) => {
        // Matches: MTV-1200, MTV-SB10, MLP-RLRD92, US-MTV-1200, etc.
        const match = text.match(/(?:US-)?(?:MTV|MLP)[-\w\d]+/i);
        return match ? match[0].replace(/^US-/i, '').trim().toUpperCase() : null;
    };

    const getContact = (buildingContactMap, buildingCode) => {
        if (!buildingCode) return null;
        return buildingContactMap[buildingCode] || buildingContactMap[buildingCode.toUpperCase()] || null;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTON INJECTION — Modal (popup WO view)
    // ─────────────────────────────────────────────────────────────────────────
    function setupModalButtons(buildingContactMap) {
        const observer = new MutationObserver(() => {
            const modal = document.querySelector('div.modal-body');
            if (modal && !modal.querySelector('#wscButton')) {
                const buildingCode = getBuildingCodeFromText(modal.innerText);
                const contact = getContact(buildingContactMap, buildingCode);
                if (!contact) return;

                modal.appendChild(createCopyButton('WSC', contact.WSC, 'wscButton'));
                modal.appendChild(createCopyButton('ACE', contact.ACE, 'aceButton'));
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTON INJECTION — Inline (full WO detail page)
    // ─────────────────────────────────────────────────────────────────────────
    function setupInlineButtons(buildingContactMap) {
        const interval = setInterval(() => {
            const container = document.querySelector('div.lv-value span.lv-value-as-link');
            if (container && !document.querySelector('#wscInlineButton')) {
                const buildingCode = getBuildingCodeFromText(container.textContent);
                const contact = getContact(buildingContactMap, buildingCode);
                if (!contact) return;

                const wscBtn = createCopyButton('WSC', contact.WSC, 'wscInlineButton');
                const aceBtn = createCopyButton('ACE', contact.ACE, 'aceInlineButton');
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
    window.addEventListener('load', () => {
        loadBuildingData((buildingContactMap) => {
            setupModalButtons(buildingContactMap);
            setupInlineButtons(buildingContactMap);
        });
    });

})();
