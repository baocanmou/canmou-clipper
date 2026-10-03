// 注入到当前网页：负责提取正文和阅读模式。只在用户点击扩展或按快捷键时注入。
import Defuddle from 'defuddle/full';
import type { Article } from './lib/note';

declare global {
	interface Window {
		__canmouClipper?: boolean;
	}
}

const HOST_ID = 'canmou-reader-host';

const FONTS: Record<string, string> = {
	song: '"Songti SC","Source Han Serif SC","Noto Serif CJK SC",SimSun,serif',
	kai: '"Kaiti SC",KaiTi,STKaiti,serif',
	hei: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
};

function extract(): Article {
	// useAsync 关闭：只读当前页面，不向第三方接口请求内容
	const result = new Defuddle(document, { url: location.href, separateMarkdown: true, useAsync: false }).parse();
	return {
		title: (result.title || document.title || '').trim(),
		url: location.href,
		author: result.author || '',
		site: result.site || result.domain || location.hostname,
		published: result.published || '',
		description: result.description || '',
		markdown: result.contentMarkdown || '',
		html: result.content || '',
	};
}

/** 正文来自任意网页，放进阅读层之前去掉能执行或能跳出的东西 */
function sanitize(html: string): DocumentFragment {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	doc.querySelectorAll('script,style,link,iframe,object,embed,form,input,button').forEach(el => el.remove());
	doc.querySelectorAll('*').forEach(el => {
		for (const attr of Array.from(el.attributes)) {
			const value = attr.value.trim().toLowerCase();
			if (attr.name.startsWith('on') || attr.name === 'style' || value.startsWith('javascript:')) {
				el.removeAttribute(attr.name);
			}
		}
	});
	const fragment = document.createDocumentFragment();
	fragment.append(...Array.from(doc.body.childNodes));
	return fragment;
}

function closeReader() {
	document.getElementById(HOST_ID)?.remove();
	document.documentElement.style.removeProperty('overflow');
	document.removeEventListener('keydown', onKeydown, true);
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') closeReader();
}

async function toggleReader() {
	if (document.getElementById(HOST_ID)) {
		closeReader();
		return;
	}
	const article = extract();
	const stored = ((await chrome.storage.local.get('settings')).settings ?? {}) as { readerFont?: string; readerSize?: number };
	let font: string = stored.readerFont ?? 'song';
	let size: number = stored.readerSize ?? 19;

	const host = document.createElement('div');
	host.id = HOST_ID;
	host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
	const root = host.attachShadow({ mode: 'open' });

	const style = document.createElement('style');
	style.textContent = `
		:host { all: initial; }
		.page { position: fixed; inset: 0; overflow-y: auto; background: #faf8f3; color: #111; }
		.bar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 10px 16px;
			background: rgba(250,248,243,.92); border-bottom: 1px solid #e4e0d5;
			font: 13px "PingFang SC","Microsoft YaHei",sans-serif; }
		.bar button { border: 1px solid #e4e0d5; background: #fff; color: #111; border-radius: 6px; padding: 4px 10px;
			font: inherit; cursor: pointer; }
		.bar button[aria-pressed="true"] { background: #ffd900; border-color: #ffd900; }
		.bar .gap { flex: 1; }
		.body { max-width: 720px; margin: 0 auto; padding: 40px 24px 120px; line-height: 1.9; }
		h1.title { font-size: 1.7em; line-height: 1.4; margin: 0 0 12px; }
		.meta { color: #686860; font-size: .8em; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e4e0d5; }
		.body img, .body video { max-width: 100%; height: auto; }
		.body a { color: inherit; text-decoration-color: #ffd900; text-decoration-thickness: 2px; text-underline-offset: 3px; }
		.body blockquote { margin: 1em 0; padding: 2px 16px; border-left: 3px solid #ffd900; color: #686860; }
		.body pre { overflow-x: auto; padding: 12px; background: #f0ede4; border-radius: 6px; font-size: .8em; line-height: 1.6; }
		.body code { font-family: ui-monospace, Menlo, monospace; }
		.body table { border-collapse: collapse; }
		.body td, .body th { border: 1px solid #e4e0d5; padding: 4px 10px; }
		.body h2, .body h3 { line-height: 1.5; margin-top: 1.8em; }
	`;

	const page = document.createElement('div');
	page.className = 'page';
	const bar = document.createElement('div');
	bar.className = 'bar';
	const body = document.createElement('div');
	body.className = 'body';

	const apply = () => {
		body.style.fontFamily = FONTS[font] ?? FONTS.song;
		body.style.fontSize = `${size}px`;
		bar.querySelectorAll<HTMLButtonElement>('button[data-font]').forEach(b => {
			b.setAttribute('aria-pressed', String(b.dataset.font === font));
		});
	};
	const remember = async () => {
		const current = ((await chrome.storage.local.get('settings')).settings ?? {}) as Record<string, unknown>;
		await chrome.storage.local.set({ settings: { ...current, readerFont: font, readerSize: size } });
	};
	const addButton = (label: string, onClick: () => void, fontKey?: string) => {
		const button = document.createElement('button');
		button.textContent = label;
		if (fontKey) button.dataset.font = fontKey;
		button.addEventListener('click', onClick);
		bar.append(button);
	};
	const setFont = (key: string) => () => {
		font = key;
		apply();
		void remember();
	};
	const resize = (delta: number) => () => {
		size = Math.min(28, Math.max(14, size + delta));
		apply();
		void remember();
	};

	addButton('宋', setFont('song'), 'song');
	addButton('楷', setFont('kai'), 'kai');
	addButton('黑', setFont('hei'), 'hei');
	addButton('A−', resize(-1));
	addButton('A+', resize(1));
	const gap = document.createElement('span');
	gap.className = 'gap';
	bar.prepend(gap);
	addButton('退出阅读 Esc', closeReader);

	const title = document.createElement('h1');
	title.className = 'title';
	title.textContent = article.title;
	const meta = document.createElement('div');
	meta.className = 'meta';
	meta.textContent = [article.author, article.site, article.published.slice(0, 10)].filter(Boolean).join(' · ');
	body.append(title, meta, sanitize(article.html));

	page.append(bar, body);
	root.append(style, page);
	document.documentElement.append(host);
	document.documentElement.style.setProperty('overflow', 'hidden');
	document.addEventListener('keydown', onKeydown, true);
	apply();
}

if (!window.__canmouClipper) {
	window.__canmouClipper = true;
	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type === 'canmou:extract') {
			try {
				sendResponse({ ok: true, article: extract() });
			} catch (err) {
				sendResponse({ ok: false, error: String(err) });
			}
		} else if (message?.type === 'canmou:reader') {
			void toggleReader();
			sendResponse({ ok: true });
		}
		return false;
	});
}
