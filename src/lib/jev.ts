import type { Article } from './note';
import type { Settings } from './settings';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
/** 正文只送开头这么多字，足够判断主题，也控制用量 */
const MAX_CONTENT_CHARS = 6000;
const NONE = 'none_of_these';

/** 目录把握低于此值就进收件箱 */
export const FOLDER_MIN_CONFIDENCE = 0.5;
/** 标签为“是”的概率达到此值才打上 */
export const TAG_MIN_PROBABILITY = 0.6;

const VALUE_LEVELS = [
	'Mostly promotion, brief news or filler; nothing the reader would come back to',
	'Some useful points, but generic and widely known',
	'Concrete methods, cases or data the reader could cite or reuse',
	'A detailed, well-evidenced method, case study or dataset directly applicable to the reader\'s work',
];

export interface Judgment {
	/** 最终落点：命中的目录，或收件箱 */
	folder: string;
	/** Jev 选了某个目录且把握足够 */
	folderMatched: boolean;
	folderConfidence: number;
	tags: string[];
	/** 高 / 中 / 低 */
	value: string;
	model: string;
}

type Answer =
	| { type: 'choice'; choice: string; confidence: number }
	| { type: 'noul'; noul: number }
	| { type: 'score'; score: number; confidence: number };

export function buildRequest(article: Article, settings: Settings) {
	const folderCriteria: Record<string, string | null> = {};
	for (const f of settings.folders) folderCriteria[f.name] = f.desc || null;
	folderCriteria[NONE] = 'The main topic of the article does not belong in any of the folders above';

	const questions: Record<string, unknown> = {
		value: {
			type: 'score',
			instructions: {
				reader: settings.profile,
				question: 'How valuable is this article as long-term reference material for the `reader`?',
			},
			criteria: VALUE_LEVELS,
		},
	};
	if (settings.folders.length) {
		questions.folder = {
			type: 'choice',
			instructions:
				'The reader files web articles into folders of a personal knowledge base. Judging by the main topic of the article, which folder does it belong in?',
			criteria: folderCriteria,
		};
	}
	settings.tags.forEach((tag, i) => {
		questions[`tag_${i}`] = {
			type: 'noul',
			instructions: {
				label: tag.name,
				meaning: tag.desc || tag.name,
				question: 'Does the label described by `label` and `meaning` clearly apply to this article?',
			},
		};
	});

	return {
		model: MODEL,
		state: {
			title: article.title,
			site: article.site,
			description: article.description,
			content: article.markdown.slice(0, MAX_CONTENT_CHARS),
		},
		questions,
	};
}

export function interpret(answers: Record<string, Answer>, settings: Settings, model = ''): Judgment {
	const folderAnswer = answers.folder;
	const known = new Set(settings.folders.map(f => f.name));
	const folderMatched =
		folderAnswer?.type === 'choice' &&
		known.has(folderAnswer.choice) &&
		folderAnswer.confidence >= FOLDER_MIN_CONFIDENCE;

	const tags = settings.tags
		.filter((_, i) => {
			const a = answers[`tag_${i}`];
			return a?.type === 'noul' && a.noul >= TAG_MIN_PROBABILITY;
		})
		.map(t => t.name);

	const valueAnswer = answers.value;
	const score = valueAnswer?.type === 'score' ? valueAnswer.score : NaN;
	const value = Number.isNaN(score) ? '' : score >= 2 ? '高' : score >= 1.2 ? '中' : '低';

	return {
		folder: folderMatched ? (folderAnswer as { choice: string }).choice : settings.inbox,
		folderMatched,
		folderConfidence: folderAnswer?.type === 'choice' ? folderAnswer.confidence : 0,
		tags,
		value,
		model,
	};
}

export async function judge(article: Article, settings: Settings, fetchImpl: typeof fetch = fetch): Promise<Judgment> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 20000);
	let res: Response;
	try {
		res = await fetchImpl(ENDPOINT, {
			method: 'POST',
			headers: { Authorization: `Bearer ${settings.jevKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(buildRequest(article, settings)),
			signal: controller.signal,
		});
	} catch (err) {
		throw new Error(controller.signal.aborted ? 'Jev 响应超时' : '连不上 Jev，请检查网络');
	} finally {
		clearTimeout(timer);
	}
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) throw new Error('Jev 密钥无效，请到设置里检查');
		if (res.status === 429) throw new Error('Jev 请求过于频繁，稍后再试');
		throw new Error(`Jev 返回错误（${res.status}）`);
	}
	const data = await res.json();
	return interpret(data.answers ?? {}, settings, data.model ?? '');
}
