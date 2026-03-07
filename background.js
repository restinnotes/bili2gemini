/**
 * Bili2Gemini - Background Service Worker
 * Handles Tab opening to bypass "User Activation" restrictions.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_GEMINI') {
        chrome.tabs.create({ url: message.url }, (tab) => {
            // Logic after tab creation if needed
        });
    }
});
