import { DEFAULT_SETTINGS, formatRules, loadSettings, parseRules, saveSettings, type Settings } from './lib/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');

function fill(settings: Settings) {
	$<HTMLInputElement>('vault').value = settings.vault;
	$<HTMLInputElement>('inbox').value = settings.inbox;
	$<HTMLTextAreaElement>('folders').value = formatRules(settings.folders);
	$<HTMLTextAreaElement>('tags').value = formatRules(settings.tags);
	$<HTMLInputElement>('jevEnabled').checked = settings.jevEnabled;
	$<HTMLInputElement>('jevKey').value = settings.jevKey;
	$<HTMLInputElement>('profile').value = settings.profile;
}

function read(): Partial<Settings> {
	return {
		vault: $<HTMLInputElement>('vault').value.trim(),
		inbox: $<HTMLInputElement>('inbox').value.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_SETTINGS.inbox,
		folders: parseRules($<HTMLTextAreaElement>('folders').value),
		tags: parseRules($<HTMLTextAreaElement>('tags').value),
		jevEnabled: $<HTMLInputElement>('jevEnabled').checked,
		jevKey: $<HTMLInputElement>('jevKey').value.trim(),
		profile: $<HTMLInputElement>('profile').value.trim() || DEFAULT_SETTINGS.profile,
	};
}

function flash(text: string, isError = false) {
	status.textContent = text;
	status.classList.toggle('error', isError);
}

$('save').addEventListener('click', async () => {
	fill(await saveSettings(read()));
	flash('已保存。');
});

$('export').addEventListener('click', () => {
	// 导出的配置可能会发给同事，密钥不带出去
	const { jevKey: _omit, ...shareable } = { ...DEFAULT_SETTINGS, ...read() };
	const url = URL.createObjectURL(new Blob([JSON.stringify(shareable, null, 2)], { type: 'application/json' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = '参谋剪藏配置.json';
	link.click();
	URL.revokeObjectURL(url);
});

$('import').addEventListener('click', () => $<HTMLInputElement>('importFile').click());

$<HTMLInputElement>('importFile').addEventListener('change', async event => {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	try {
		const data = JSON.parse(await file.text()) as Partial<Settings>;
		const current = await loadSettings();
		const clean = (rules: unknown, fallback: Settings['folders']) =>
			Array.isArray(rules) ? parseRules(rules.map(r => `${r?.name ?? ''} | ${r?.desc ?? ''}`).join('\n')) : fallback;
		fill({
			...current,
			vault: typeof data.vault === 'string' ? data.vault : current.vault,
			inbox: typeof data.inbox === 'string' && data.inbox ? data.inbox : current.inbox,
			profile: typeof data.profile === 'string' && data.profile ? data.profile : current.profile,
			folders: clean(data.folders, current.folders),
			tags: clean(data.tags, current.tags),
		});
		flash('已读入配置，检查无误后点“保存设置”。');
	} catch {
		flash('这个文件不是有效的配置。', true);
	}
});

void loadSettings().then(fill);
