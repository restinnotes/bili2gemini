/**
 * Bili-Q-TLDR Pro - Merged Content Script (Refined & Fixed)
 * Handles Subtitle and Comment extraction, and Gemini auto-pasting.
 */

(function () {
    'use strict';

    // ========== Options & Defaults ==========
    const DEFAULTS = {
        subtitlePrompt: '总结视频内容',
        commentPrompt: '总结评论区观点'
    };

    let config = { ...DEFAULTS };

    function loadConfig() {
        chrome.storage.sync.get(DEFAULTS, (items) => {
            config = items;
        });
    }
    loadConfig();

    // ========== Platform Detection ==========
    const PLATFORM = (() => {
        const host = location.hostname;
        if (host.includes('youtube.com')) return 'youtube';
        if (host.includes('bilibili.com')) return 'bilibili';
        if (host.includes('gemini.google.com')) return 'gemini';
        return null;
    })();

    if (!PLATFORM) return;

    // ========== 1. Gemini Auto-Paste Logic ==========
    if (PLATFORM === 'gemini') {
        const hash = location.hash;
        if (hash.includes('stg-auto') || hash.includes('bce-auto')) {
            history.replaceState(null, '', location.pathname + location.search);
            const poller = setInterval(async () => {
                const inputEl = document.querySelector('.ql-editor[contenteditable="true"]');
                if (inputEl) {
                    clearInterval(poller);
                    inputEl.focus();
                    try {
                        // Priority: Read from Storage (to bypass Clipboard user-activation issues)
                        chrome.storage.local.get(['pendingPrompt'], (result) => {
                            const promptText = result.pendingPrompt;
                            if (promptText) {
                                document.execCommand('insertText', false, promptText);
                                chrome.storage.local.remove('pendingPrompt'); // Clean up
                                setTimeout(() => {
                                    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                                }, 600);
                            }
                        });
                    } catch (e) { }
                }
            }, 500);
        }
        return;
    }

    // ========== Helper Functions ==========
    function showToast(msg, duration = 3000) {
        const toast = document.getElementById('bs-toast');
        if (toast) {
            toast.textContent = msg;
            toast.classList.add('bs-show');
            if (duration > 0) {
                setTimeout(() => toast.classList.remove('bs-show'), duration);
            }
        }
    }

    function pauseVideo() {
        try {
            const v = document.querySelector('video');
            if (v && !v.paused) v.pause();
        } catch (e) { }
    }

    // 改进版 safeFetch：仅对 api.bilibili.com 手动加 credentials
    async function safeFetch(url, options = {}, retry = 0) {
        if (url.includes('api.bilibili.com') && !options.credentials) {
            options.credentials = 'include';
        }

        try {
            const resp = await fetch(url, options);
            if (resp.status === 412) throw new Error('触发了 B 站 412 风控，请刷新后再试');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const text = await resp.text();
            try { return JSON.parse(text); }
            catch (e) {
                if ((text.includes('<!DOCTYPE') || text.includes('<html')) && retry < 1) {
                    await new Promise(r => setTimeout(r, 1500));
                    return safeFetch(url, options, retry + 1);
                }
                throw new Error('接口响应异常');
            }
        } catch (err) {
            if (retry < 1 && !err.message.includes('412')) {
                await new Promise(r => setTimeout(r, 1000));
                return safeFetch(url, options, retry + 1);
            }
            throw err;
        }
    }

    function cleanText(str) {
        if (!str) return '';
        return str.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').replace(/\s+/g, ' ').trim();
    }

    // ========== UI Injection & SPA Handling ==========
    function checkAndInject() {
        const isVideoPage = (PLATFORM === 'youtube' && location.pathname.startsWith('/watch')) ||
            (PLATFORM === 'bilibili' && (location.pathname.includes('/video/') || location.pathname.includes('/watchlater/')));

        if (isVideoPage) {
            injectButtons();
        } else {
            const existing = document.getElementById('bili-suite-container');
            if (existing) existing.remove();
        }
    }

    const injectButtons = () => {
        if (document.getElementById('bili-suite-container')) return;
        const container = document.createElement('div');
        container.id = 'bili-suite-container';

        const toast = document.createElement('div');
        toast.id = 'bs-toast';
        container.appendChild(toast);

        // Subtitle Button
        const subBtn = document.createElement('button');
        subBtn.className = 'bs-fab-btn bs-sub-btn';
        subBtn.title = '一键复制内容并发送给 Gemini';
        subBtn.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z" fill="currentColor"/></svg>');
        const subText = document.createElement('span');
        subText.textContent = '字幕';
        subBtn.appendChild(subText);
        container.appendChild(subBtn);

        // Comment Button
        const commBtn = document.createElement('button');
        commBtn.className = 'bs-fab-btn bs-comm-btn';
        commBtn.title = '一键提取精华评论并发送给 Gemini';
        if (PLATFORM !== 'bilibili') commBtn.style.display = 'none';
        commBtn.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" fill="currentColor"/></svg>');
        const commText = document.createElement('span');
        commText.textContent = '热评';
        commBtn.appendChild(commText);
        container.appendChild(commBtn);

        document.body.appendChild(container);

        subBtn.addEventListener('click', function () {
            this.disabled = true;
            extractSubtitle().finally(() => this.disabled = false);
        });

        commBtn.addEventListener('click', function () {
            this.disabled = true;
            extractComments().finally(() => this.disabled = false);
        });
    };

    // Watch for URL changes (SPA)
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkAndInject();
        }
    }, 1000);

    // Initial check
    if (document.body) checkAndInject();
    else document.addEventListener('DOMContentLoaded', checkAndInject);

    async function finalizeExtraction(text, hash) {
        // 1. Save to storage (most reliable for Bridge)
        await chrome.storage.local.set({ pendingPrompt: text });

        // 2. Best-effort clipboard copy
        try { await navigator.clipboard.writeText(text); } catch (e) { }

        showToast('✅ 提取成功，正在直通 Gemini...');

        // 3. Use Background Script to open tab (bypasses activation requirement)
        chrome.runtime.sendMessage({
            type: 'OPEN_GEMINI',
            url: 'https://gemini.google.com/app' + hash
        });
    }

    // ========== 2. Subtitle Extraction Logic ==========
    async function extractSubtitle() {
        pauseVideo();
        showToast('🔍 正在提取字幕...');

        try {
            let textMarkup = '';
            if (PLATFORM === 'youtube') {
                // 对于 YouTube，直接使用链接，Gemini 官方插件会自动处理视频内容
                textMarkup = window.location.href;
            } else {
                // Bilibili Logic
                const pathSearchs = {};
                location.search.slice(1).replace(/([^=&]*)=([^=&]*)/g, (_, a, b) => pathSearchs[a] = b);
                let id = pathSearchs.bvid || location.pathname.split('/').find(p => p.startsWith('BV'));
                if (!id) throw new Error('无法提取视频 ID');

                const viewJson = await safeFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
                const { aid, cid } = viewJson.data;
                const playerJson = await safeFetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`);
                const subtitles = playerJson.data?.subtitle?.subtitles;
                if (!subtitles || !subtitles.length) throw new Error('视频无可用字幕');

                const sub = subtitles.find(s => s.lan.startsWith('zh')) || subtitles[0];
                let subUrl = sub.subtitle_url.replace('http:', 'https:');
                if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;

                const subData = await safeFetch(subUrl, { credentials: 'omit' });
                textMarkup = subData.body.map(i => i.content).join('\n');
            }

            const finalPrompt = textMarkup + '\n\n' + config.subtitlePrompt;
            await finalizeExtraction(finalPrompt, '#stg-auto');
        } catch (e) {
            showToast('❌ 字幕提取失败: ' + e.message);
        }
    }

    // ========== 3. Comment Extraction Logic ==========
    async function extractComments() {
        pauseVideo();
        showToast('🚀 正在提取评论...');

        try {
            const bvid = location.pathname.match(/(BV[a-zA-Z0-9]+)/i)?.[1];
            const aidJson = await safeFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            const aid = aidJson.data.aid;

            let results = [];
            let collectedCount = 0;
            let cursor = 0;

            for (let p = 1; p <= 20; p++) {
                const json = await safeFetch(`https://api.bilibili.com/x/v2/reply/main?next=${cursor}&type=1&oid=${aid}&mode=3`);
                const replies = json.data?.replies || [];
                if (!replies.length) break;

                replies.forEach(r => {
                    const mainMsg = cleanText(r.content.message);
                    if (mainMsg) {
                        results.push({
                            uname: r.member.uname, like: r.like, msg: mainMsg, sub: (r.replies || []).map(sr => ({
                                uname: sr.member.uname, like: sr.like, msg: cleanText(sr.content.message),
                                to: (sr.content.members || []).length > 0 ? sr.content.members[0].uname : ''
                            }))
                        });
                        collectedCount += 1 + (r.replies?.length || 0);
                    }
                });

                cursor = json.data?.cursor?.next;
                showToast(`正在抓取评论: ${Math.min(Math.floor(collectedCount / 5), 99)}%`);
                if (!cursor || collectedCount >= 500) break;
                await new Promise(r => setTimeout(r, 1500));
            }

            results.sort((a, b) => b.like - a.like);
            let doc = `Bilibili 评论提取 (约 ${results.length} 组热评)\n\n`;
            let finalCount = 0;
            for (const c of results) {
                if (finalCount >= 550) break;
                doc += `[${c.like}赞] ${c.uname}: ${c.msg}\n`;
                finalCount++;
                c.sub.forEach(s => {
                    if (finalCount < 550) {
                        doc += `   └─ [${s.like}赞] ${s.uname}${s.to ? ' 回复 ' + s.to : ''}: ${s.msg}\n`;
                        finalCount++;
                    }
                });
                doc += '\n';
            }
            doc += '\n' + config.commentPrompt;

            await finalizeExtraction(doc, '#bce-auto');
        } catch (e) {
            showToast('❌ 评论提取失败: ' + e.message);
        }
    }

})();
