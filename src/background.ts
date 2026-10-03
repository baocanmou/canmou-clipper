// 快捷键进入阅读模式。剪藏本身在弹窗里完成，这里不做别的。
chrome.commands.onCommand.addListener(async (command, tab) => {
	if (command !== 'toggle-reader' || !tab?.id) return;
	try {
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page.js'] });
		await chrome.tabs.sendMessage(tab.id, { type: 'canmou:reader' });
	} catch {
		// chrome:// 等页面不允许注入，按了也没反应是预期行为
	}
});
