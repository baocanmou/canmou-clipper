export interface Article {
	title: string;
	url: string;
	author: string;
	site: string;
	published: string;
	description: string;
	markdown: string;
	/** 清洗后的正文 HTML，阅读模式用 */
	html: string;
}

export interface NoteMeta {
	title: string;
	tags: string[];
	/** 高 / 中 / 低；未判断时为空 */
	value: string;
}

/** Obsidian 文件名不能含这些字符，# ^ [ ] 会破坏双链 */
export function safeFileName(title: string): string {
	const cleaned = title
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '');
	return (cleaned || '未命名剪藏').slice(0, 80).trim();
}

function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`;
}

export function localDate(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function buildNote(article: Article, meta: NoteMeta, now = new Date()): string {
	const lines = ['---', `title: ${yamlString(meta.title)}`, `source: ${yamlString(article.url)}`];
	if (article.author) lines.push(`author: ${yamlString(article.author)}`);
	if (article.site) lines.push(`site: ${yamlString(article.site)}`);
	if (article.published) lines.push(`published: ${article.published.slice(0, 10)}`);
	lines.push(`clipped: ${localDate(now)}`);
	if (meta.value) lines.push(`value: ${meta.value}`);
	lines.push('tags:');
	for (const tag of ['剪藏', ...meta.tags.filter(t => t !== '剪藏')]) {
		// Obsidian 标签里不能有空格
		lines.push(`  - ${tag.replace(/\s+/g, '-')}`);
	}
	lines.push('---', '', article.markdown.trim(), '');
	return lines.join('\n');
}

/**
 * 正文走剪贴板（&clipboard），避免长文把 URI 撑爆；
 * content 只是 Obsidian 读不到剪贴板时显示的提示。
 */
export function obsidianUri(vault: string, folder: string, fileName: string): string {
	const path = [folder.replace(/^\/+|\/+$/g, ''), fileName].filter(Boolean).join('/');
	let uri = `obsidian://new?file=${encodeURIComponent(path)}`;
	if (vault.trim()) uri += `&vault=${encodeURIComponent(vault.trim())}`;
	uri += `&clipboard&content=${encodeURIComponent('参谋剪藏：Obsidian 没能读取剪贴板，请回到浏览器重新剪藏。')}`;
	return uri;
}
