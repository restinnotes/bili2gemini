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

    // ========== Wbi Signing (Bilibili API Fix) ==========
    const mixinKeyEncTab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
        33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
        61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
        36, 20, 34, 44, 52,
    ];

    const getMixinKey = (orig) => mixinKeyEncTab.map((n) => orig[n]).join("").slice(0, 32);

    function md5(string) {
        function md5_Cycle(x, k) {
            var a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
            x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
        }
        function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
        function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
        function md51(s) {
            var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
            for (i = 64; i <= n; i += 64) md5_Cycle(state, md5blk(s.substring(i - 64, i)));
            s = s.substring(i - 64);
            var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) { md5_Cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
            tail[14] = n * 8; md5_Cycle(state, tail);
            return state;
        }
        function md5blk(s) {
            var i, tmp = [];
            for (i = 0; i < 64; i += 4) tmp[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
            return tmp;
        }
        var hex_chr = '0123456789abcdef'.split('');
        function rhex(n) { var s = '', j; for (j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F]; return s; }
        function hex(x) { for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(''); }
        return hex(md51(string));
    }

    async function getWbiKeys() {
        const res = await safeFetch('https://api.bilibili.com/x/web-interface/nav');
        const img_url = res.data.wbi_img.img_url;
        const sub_url = res.data.wbi_img.sub_url;
        return {
            img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
            sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'))
        };
    }

    function encWbi(params, img_key, sub_key) {
        const mixin_key = getMixinKey(img_key + sub_key);
        const wts = Math.round(Date.now() / 1000);
        const chr_filter = /[!'()*]/g;
        params.wts = wts;
        const query = Object.keys(params).sort().map((key) => {
            const value = params[key].toString().replace(chr_filter, '');
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }).join('&');
        const w_rid = md5(query + mixin_key);
        return query + '&w_rid=' + w_rid;
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

                // 2024+ New Requirement: Wbi Signing
                const keys = await getWbiKeys();
                const signedQuery = encWbi({ aid, cid }, keys.img_key, keys.sub_key);
                const playerJson = await safeFetch(`https://api.bilibili.com/x/player/wbi/v2?${signedQuery}`);

                const subtitles = playerJson.data?.subtitle?.subtitles;
                if (!subtitles || !subtitles.length) {
                    if (playerJson.data?.need_login_subtitle) {
                        throw new Error('此视频字幕需要登录 B 站后才能提取，请确保已在当前浏览器登录');
                    }
                    throw new Error('视频无可用字幕 (可能未开启 CC 字幕)');
                }

                // 强化匹配逻辑：优先繁简中文 (包含原生与 AI 生成)，其次英文，最后兜底
                const sub = subtitles.find(s => {
                    const l = s.lan.toLowerCase();
                    return l.includes('zh') || l.includes('hans') || l.includes('cn');
                }) || subtitles.find(s => s.lan.toLowerCase().includes('en')) || subtitles[0];

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
