/** DashBoard 与账号卡片共享的模块级状态：批量清理登记表 + 显示名/弹结果存取 + 自动批次名单 */

export const handle: Map<string, (arg0: boolean) => void> = new Map<string, (arg0: boolean) => void>();

export const DISPLAY_NAME_KEY = (alias: string) => 'autopcr_displayName_' + alias;

export function getDisplayName(alias: string): string {
    return localStorage.getItem(DISPLAY_NAME_KEY(alias)) || alias;
}

/** 每账号"弹结果"标记：该账号执行完自动弹出结果窗 */
export const POPUP_FLAG_KEY = (alias: string) => 'autopcr_popupResult_' + alias;

export function loadPopupFlag(alias: string): boolean {
    // 默认勾选：只有明确存过 'false'（用户关掉过）才静默
    return localStorage.getItem(POPUP_FLAG_KEY(alias)) !== 'false';
}

/** 「弹结果」总开关（工具栏勾选框），默认开 */
export const POPUP_MASTER_KEY = 'autopcr_popupResult';

export function loadPopupMaster(): boolean {
    return localStorage.getItem(POPUP_MASTER_KEY) !== 'false';
}

/** 周期通知：开关 + 静音名单（模块 key），存本地 */
export interface NotifyPrefs {
    enabled: boolean;
    muted: string[];
}

const NOTIFY_KEY = 'autopcr_notify_v1';

export function loadNotifyPrefs(): NotifyPrefs {
    try {
        const raw = localStorage.getItem(NOTIFY_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<NotifyPrefs>) : null;
        return {
            enabled: !!parsed?.enabled,
            muted: Array.isArray(parsed?.muted) ? parsed.muted.filter((x): x is string => typeof x === 'string') : [],
        };
    } catch {
        return { enabled: false, muted: [] };
    }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
    try {
        localStorage.setItem(NOTIFY_KEY, JSON.stringify(prefs));
    } catch {
        // 本地存储不可用则仅本次会话有效
    }
}

/** 同类警报的已通知记录：一个月内同类只弹一次（跨账号共用），活动h本例外 */
const NOTIFY_SENT_KEY = 'autopcr_notify_sent_v1';
const NOTIFY_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function wasNotifiedRecently(classId: string): boolean {
    try {
        const raw = localStorage.getItem(NOTIFY_SENT_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        const last = map[classId];
        return typeof last === 'number' && Date.now() - last < NOTIFY_MONTH_MS;
    } catch {
        return false;
    }
}

export function markNotifiedForClass(classId: string): void {
    try {
        const raw = localStorage.getItem(NOTIFY_SENT_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[classId] = Date.now();
        localStorage.setItem(NOTIFY_SENT_KEY, JSON.stringify(map));
    } catch {
        // 本地存储不可用则不去重
    }
}

/** 账号日常执行完成事件（无条件派发，监听端按通知开关过滤），载荷=账号名 */
export function emitDailyFinished(alias: string): void {
    try {
        window.dispatchEvent(new CustomEvent('autopcr_daily_finished', { detail: alias }));
    } catch {
        // 环境不支持 CustomEvent 时忽略
    }
}

/** 订阅账号日常执行完成事件；返回取消订阅函数 */
export function onDailyFinished(cb: (alias: string) => void): () => void {
    const listener = (e: Event): void => {
        const detail = (e as CustomEvent).detail as string | undefined;
        if (detail) cb(detail);
    };
    window.addEventListener('autopcr_daily_finished', listener);
    return () => {
        window.removeEventListener('autopcr_daily_finished', listener);
    };
}

/** 文字越多两侧越窄；3 个字以内保持默认内边距（图标/短按钮保持好点） */
export function textFitPadding(label: string): string | undefined {
    const len = Array.from(label).length;
    if (len <= 3) return undefined;
    if (len <= 5) return '0.5rem';
    return '0.25rem';
}

/** 自动批次名单（多"默认账号"），带版本号存本地 */
const BATCH_KEY = 'autopcr_batch_v1';

export function loadBatch(): string[] {
    try {
        const raw = localStorage.getItem(BATCH_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const list = (parsed as { accounts?: unknown } | null)?.accounts;
        if (Array.isArray(list)) {
            return list.filter((x): x is string => typeof x === 'string');
        }
    } catch {
        return [];
    }
    return [];
}

export function saveBatch(accounts: string[]): void {
    try {
        localStorage.setItem(BATCH_KEY, JSON.stringify({ version: 1, accounts }));
    } catch {
        // 本地存储不可用则仅本次会话有效
    }
}

/** localStorage 写入兜底：隐私模式等场景不抛异常打断调用方 */
export function safeSetItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // 本地存储不可用则忽略
    }
}

/** 周期通知的可静音对象：与日常分模块结果里的模块 key 对应（静音/去重均按 key 精确匹配，不依赖中文文案） */
export const NOTIFY_CANDIDATES: { key: string; label: string }[] = [
    { key: 'special_underground', label: '特别地下城' },
    { key: 'abyss_frontier', label: '深渊讨伐战' },
    { key: 'abyss_boss', label: '深渊boss战' },
    { key: 'very_hard_hurdle', label: '扫荡活动h本' },
    { key: 'luna_tower', label: '露娜塔回廊扫荡' },
];

/** 活动h本扫荡：不参与月度去重（复刻活动不定日期开放，多个活动并存会漏扫），静音仍然有效 */
export const NOTIFY_NO_DEDUP_KEY = 'very_hard_hurdle';
