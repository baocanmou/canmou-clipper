import { judge } from './lib/jev';
import { buildNote, obsidianUri, safeFileName, type Article } from './lib/note';
import { loadSettings, type Settings } from './lib/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const titleInput = $<HTMLInputElement>('title');
const folderSelect = $<HTMLSelectElement>('folder');
const hint = $('hint');
const tagBox = $('tags');
const valueBadge = $('value');
const status = $('status');
const saveButton = $<HTMLButtonElement>('save');
const copyButton = $<HTMLButtonElement>('copy');
const readerButton = $<HTMLButtonElement>('reader');

let settings: Settings;
let article: Article | null = null;
let tabId = 0;
let value = '';
const selectedTags = new Set<string>();

function setStatus(text: string, isError = false) {
	status.textContent = text;
	status.classList.toggle('error', isError);
}

function renderFolders(selected: string) {
	folderSelect.replaceChildren();
	const names = [settings.inbox, ...settings.folders.map(f => f.name)];
	for (const name of names) {
		const option = document.createElement('option');
		option.value = name;
		option.textContent = name === settings.inbox ? `${name}（收件箱）` : name;
		folderSelect.append(option);
	}
	folderSelect.value = selected;
}

function renderTags() {
	tagBox.replaceChildren();
	for (const tag of settings.tags) {
		const chip = document.createElement('button');
		chip.type = 'button';
		chip.className = 'chip';
		chip.textContent = tag.name;
		chip.title = tag.desc;
		chip.setAttribute('aria-pressed', String(selectedTags.has(tag.name)));
		chip.addEventListener('click', () => {
			if (selectedTags.has(tag.name)) selectedTags.delete(tag.name);
			else selectedTags.add(tag.name);
			renderTags();
		});
		tagBox.append(chip);
	}
}

function renderValue() {
	valueBadge.hidden = !value;
	valueBadge.textContent = value ? `参考价值：${value}` : '';
	valueBadge.dataset.level = value;
}

async function runJev() {
	if (!article) return;
	if (!settings.jevEnabled || !settings.jevKey) {
		hint.textContent = settings.jevEnabled ? '未填 Jev 密钥，先放收件箱。可在设置里填写。' : 'Jev 判断已关闭。';
		return;
	}
	hint.textContent = 'Jev 判断中…';
	try {
		const result = await judge(article, settings);
		// 用户已经手动改过目录就不覆盖
		if (folderSelect.value === settings.inbox) folderSelect.value = result.folder;
		result.tags.forEach(t => selectedTags.add(t));
		value = result.value;
		renderTags();
		renderValue();
		hint.textContent = result.folderMatched
			? `Jev 建议归到这里（把握 ${Math.round(result.folderConfidence * 100)}%），可以改。`
			: 'Jev 没找到合适的目录，先放收件箱。';
	} catch (err) {
		hint.textContent = `${(err as Error).message}，先放收件箱。`;
	}
}

function currentNote(): string {
	return buildNote(article!, { title: titleInput.value.trim() || article!.title, tags: [...selectedTags], value });
}

async function save() {
	if (!article) return;
	saveButton.disabled = true;
	try {
		await navigator.clipboard.writeText(currentNote());
		const uri = obsidianUri(settings.vault, folderSelect.value, safeFileName(titleInput.value || article.title));
		await chrome.tabs.update(tabId, { url: uri });
		setStatus('已交给 Obsidian。浏览器若询问是否打开 Obsidian，请点允许。');
	} catch (err) {
		setStatus(`保存失败：${(err as Error).message}`, true);
	} finally {
		saveButton.disabled = false;
	}
}

async function init() {
	settings = await loadSettings();
	renderFolders(settings.inbox);
	renderTags();
	$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	tabId = tab?.id ?? 0;
	try {
		await chrome.scripting.executeScript({ target: { tabId }, files: ['page.js'] });
		const response = await chrome.tabs.sendMessage(tabId, { type: 'canmou:extract' });
		if (!response?.ok) throw new Error(response?.error);
		article = response.article as Article;
	} catch {
		setStatus('这个页面不能剪藏（浏览器内置页面、应用商店等不允许扩展读取）。', true);
		return;
	}

	titleInput.value = article.title;
	if (!article.markdown.trim()) {
		setStatus('没有识别到正文，保存后只有标题和链接。', true);
	}
	saveButton.disabled = copyButton.disabled = readerButton.disabled = false;

	saveButton.addEventListener('click', save);
	copyButton.addEventListener('click', async () => {
		await navigator.clipboard.writeText(currentNote());
		setStatus('Markdown 已复制。');
	});
	readerButton.addEventListener('click', async () => {
		await chrome.tabs.sendMessage(tabId, { type: 'canmou:reader' });
		window.close();
	});

	await runJev();
}

void init();
