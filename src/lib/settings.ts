export interface Rule {
	/** 目录路径或标签名 */
	name: string;
	/** 给 Jev 看的说明：什么内容该归到这里 */
	desc: string;
}

export interface Settings {
	vault: string;
	/** Jev 拿不准或未启用时的落点 */
	inbox: string;
	folders: Rule[];
	tags: Rule[];
	/** 一句话说明“我是做什么的”，用来判断参考价值 */
	profile: string;
	jevEnabled: boolean;
	jevKey: string;
	readerFont: 'song' | 'kai' | 'hei';
	readerSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
	vault: '',
	inbox: '剪藏/待整理',
	folders: [
		{ name: '剪藏/品牌与营销', desc: '品牌定位、营销案例、广告文案、消费者洞察' },
		{ name: '剪藏/设计参考', desc: 'Logo、VI、包装、空间、字体等视觉设计' },
		{ name: '剪藏/餐饮与连锁', desc: '餐饮、连锁门店、食品快消行业的经营方法与案例' },
		{ name: '剪藏/搜索与内容', desc: 'SEO、GEO、AI 搜索、自媒体运营与内容写作方法' },
		{ name: '剪藏/AI工具', desc: 'AI 工具、提示词、自动化工作流、软件教程' },
		{ name: '剪藏/商标与合规', desc: '商标、版权、广告法与合规风险' },
	],
	tags: [
		{ name: '案例', desc: '完整讲述某个具体品牌或企业的做法与结果' },
		{ name: '方法', desc: '给出可以照着做的步骤、框架或判断标准' },
		{ name: '数据', desc: '包含调研数据、行业统计或报告结论' },
		{ name: '工具', desc: '介绍或教学某个软件、工具、插件的用法' },
		{ name: '观点', desc: '以作者的个人看法、评论为主' },
	],
	profile: '品牌策划与设计公司，主要服务餐饮、连锁门店和食品快消品牌',
	jevEnabled: true,
	jevKey: '',
	readerFont: 'song',
	readerSize: 19,
};

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
	const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
	return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
	const next = { ...(await loadSettings()), ...patch };
	await chrome.storage.local.set({ [KEY]: next });
	return next;
}

/** 设置页文本框：每行“名称 | 说明” */
export function parseRules(text: string): Rule[] {
	const seen = new Set<string>();
	const rules: Rule[] = [];
	for (const line of text.split('\n')) {
		const [rawName, ...rest] = line.split('|');
		const name = rawName.trim().replace(/^\/+|\/+$/g, '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		rules.push({ name, desc: rest.join('|').trim() });
	}
	return rules;
}

export function formatRules(rules: Rule[]): string {
	return rules.map(r => (r.desc ? `${r.name} | ${r.desc}` : r.name)).join('\n');
}
