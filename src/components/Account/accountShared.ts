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
