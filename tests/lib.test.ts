import { describe, expect, it } from 'vitest';
import { buildRequest, interpret } from '../src/lib/jev';
import { buildNote, obsidianUri, safeFileName, type Article } from '../src/lib/note';
import { DEFAULT_SETTINGS, formatRules, parseRules } from '../src/lib/settings';

const article: Article = {
	title: '一碗面的"定位": 从 42 个品到 9 个',
	url: 'https://example.com/a?b=1',
	author: '张三',
	site: '示例网',
	published: '2026-09-30T08:00:00+08:00',
	description: '',
	markdown: '# 正文\n\n内容',
	html: '<p>内容</p>',
};

describe('note', () => {
	it('文件名去掉 Obsidian 不允许的字符', () => {
		expect(safeFileName('A/B: C? [D] #E')).toBe('A B C D E');
		expect(safeFileName('  ///  ')).toBe('未命名剪藏');
		expect(safeFileName('长'.repeat(200))).toHaveLength(80);
	});

	it('生成带属性的笔记，标题里的引号被转义', () => {
		const note = buildNote(article, { title: article.title, tags: ['案例', '剪藏'], value: '高' }, new Date(2026, 9, 3));
		expect(note).toContain('title: "一碗面的\\"定位\\": 从 42 个品到 9 个"');
		expect(note).toContain('published: 2026-09-30');
		expect(note).toContain('clipped: 2026-10-03');
		expect(note).toContain('value: 高');
		expect(note.match(/- 剪藏/g)).toHaveLength(1);
		expect(note).toContain('---\n\n# 正文');
	});

	it('Obsidian 链接带目录、笔记库，正文走剪贴板', () => {
		const uri = obsidianUri('包参谋', '/剪藏/待整理/', '标题');
		expect(uri).toContain(`file=${encodeURIComponent('剪藏/待整理/标题')}`);
		expect(uri).toContain(`vault=${encodeURIComponent('包参谋')}`);
		expect(uri).toContain('&clipboard&');
		expect(obsidianUri('', '', '标题')).not.toContain('vault=');
	});
});

describe('settings', () => {
	it('解析“名称 | 说明”，跳过空行和重复项', () => {
		const rules = parseRules('/A/B/ | 说明 | 带竖线\n\nA/B | 重复\n只有名称');
		expect(rules).toEqual([
			{ name: 'A/B', desc: '说明 | 带竖线' },
			{ name: '只有名称', desc: '' },
		]);
		expect(parseRules(formatRules(rules))).toEqual(rules);
	});
});

describe('jev', () => {
	it('请求里包含目录选项、兜底选项和每个标签一个问题', () => {
		const body = buildRequest({ ...article, markdown: '字'.repeat(10000) }, DEFAULT_SETTINGS);
		expect(body.state.content).toHaveLength(6000);
		const questions = body.questions as Record<string, any>;
		expect(Object.keys(questions.folder.criteria)).toHaveLength(DEFAULT_SETTINGS.folders.length + 1);
		expect(questions.folder.criteria.none_of_these).toBeTruthy();
		expect(questions[`tag_${DEFAULT_SETTINGS.tags.length - 1}`].type).toBe('noul');
		expect(questions.value.criteria).toHaveLength(4);
	});

	it('把握足够才采用目录，否则进收件箱', () => {
		const folder = DEFAULT_SETTINGS.folders[0].name;
		const base = { value: { type: 'score', score: 2.4, confidence: 0.9 }, tag_0: { type: 'noul', noul: 0.9 }, tag_1: { type: 'noul', noul: 0.3 } } as const;

		const sure = interpret({ ...base, folder: { type: 'choice', choice: folder, confidence: 0.8 } }, DEFAULT_SETTINGS);
		expect(sure).toMatchObject({ folder, folderMatched: true, tags: [DEFAULT_SETTINGS.tags[0].name], value: '高' });

		const unsure = interpret({ ...base, folder: { type: 'choice', choice: folder, confidence: 0.3 } }, DEFAULT_SETTINGS);
		expect(unsure).toMatchObject({ folder: DEFAULT_SETTINGS.inbox, folderMatched: false });

		const none = interpret({ ...base, folder: { type: 'choice', choice: 'none_of_these', confidence: 1 } }, DEFAULT_SETTINGS);
		expect(none.folder).toBe(DEFAULT_SETTINGS.inbox);

		expect(interpret({}, DEFAULT_SETTINGS)).toMatchObject({ folder: DEFAULT_SETTINGS.inbox, tags: [], value: '' });
	});
});
