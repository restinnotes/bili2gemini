// Options logic for Bili-Q-TLDR Pro
const subtitleInput = document.getElementById('subtitle-prompt');
const commentInput = document.getElementById('comment-prompt');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status');

// Default values
const DEFAULTS = {
    subtitlePrompt: '总结视频内容',
    commentPrompt: '总结评论区观点'
};

// Load saved settings
function loadOptions() {
    chrome.storage.sync.get(DEFAULTS, (items) => {
        subtitleInput.value = items.subtitlePrompt;
        commentInput.value = items.commentPrompt;
    });
}

// Save settings
function saveOptions() {
    chrome.storage.sync.set({
        subtitlePrompt: subtitleInput.value,
        commentPrompt: commentInput.value
    }, () => {
        status.textContent = '设置已保存！';
        setTimeout(() => { status.textContent = ''; }, 2000);
    });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveBtn.addEventListener('click', saveOptions);
