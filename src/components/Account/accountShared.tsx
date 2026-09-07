/** DashBoard 与账号卡片共享：状态登记表/存取/通知/批次/工具栏控件/全局监听（碎文件合并版） */

import { Box, Popover, Stack, Text } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { API } from '@api/APIUtils';
import { Checkbox } from '../../components/ui/checkbox';
import { toaster } from '../../components/ui/toaster';



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
        let muted = Array.isArray(parsed?.muted) ? parsed.muted.filter((x): x is string => typeof x === 'string') : [];
        // 旧版本存的是中文名：换成模块 key，静音才不会被 key 精确匹配打穿
        const labelToKey = new Map(NOTIFY_CANDIDATES.map((c) => [c.label, c.key]));
        muted = muted.map((x) => labelToKey.get(x) ?? x);
        return { enabled: !!parsed?.enabled, muted };
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

/* ==================== 周期通知工具栏控件 ==================== */

export function NotifySettings() {
    const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs());

    useEffect(() => {
        saveNotifyPrefs(notifyPrefs);
    }, [notifyPrefs]);

    return (
        <Popover.Root lazyMount positioning={{ placement: 'bottom-end', gutter: 4 }}>
            <Popover.Trigger asChild>
                <Box
                    borderWidth="1px"
                    borderColor="currentColor"
                    borderRadius="md"
                    px={2}
                    h="2rem"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    flexShrink={0}
                    cursor="pointer"
                    color="orange.500"
                    _hover={{ bg: 'orange.subtle' }}
                    title="让周期性任务，出警报（非跳过）时，弹出系统通知。同类警报一个月内只弹一次（活动h本扫荡不去重）。需停留在本站页面。"
                >
                    <Checkbox
                        checked={notifyPrefs.enabled}
                        onCheckedChange={async (details) => {
                            const next = !!details.checked;
                            if (next && 'Notification' in window && Notification.permission === 'default') {
                                try {
                                    await Notification.requestPermission();
                                } catch {
                                    // 用户拒绝或浏览器不支持时仍可开启，未授权期间用站内提示
                                }
                            }
                            setNotifyPrefs((prev) => ({ ...prev, enabled: next }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        colorPalette="orange"
                        size="md"
                        aria-label="开启周期通知"
                    />
                    <Text color="orange.500" css={{ cursor: 'pointer', userSelect: 'none' }}>
                        周期通知
                    </Text>
                    <FiPlus />
                </Box>
            </Popover.Trigger>
            <Popover.Positioner>
                <Popover.Content width="auto" minW="200px" zIndex={1400}>
                    <Popover.Body p={3}>
                        <Stack gap={2}>
                            {NOTIFY_CANDIDATES.map((c) => (
                                <Checkbox
                                    key={c.key}
                                    checked={!notifyPrefs.muted.includes(c.key)}
                                    onCheckedChange={(details) => {
                                        const notifyOn = !!details.checked;
                                        setNotifyPrefs((prev) => ({
                                            ...prev,
                                            muted: notifyOn
                                                ? prev.muted.filter((k) => k !== c.key)
                                                : [...prev.muted, c.key],
                                        }));
                                    }}
                                    colorPalette="orange"
                                    size="md"
                                >
                                    {c.label}
                                </Checkbox>
                            ))}
                        </Stack>
                    </Popover.Body>
                </Popover.Content>
            </Popover.Positioner>
        </Popover.Root>
    );
}

/* ==================== 周期通知全局监听（挂在 _sidebar 布局层，全站可收事件） ==================== */

/** 每账号是否处于警报态（恢复后复位）——按账号隔离，互不吞警报 */
const alarmSeenByAlias = new Map<string, boolean>();
/** 同一账号拉取进行中则跳过，避免事件风暴下重复请求；期间再来事件记 trailing，完成后补查一次 */
const notifyInflight = new Set<string>();
const notifyTrailing = new Set<string>();

/** 已知的可静音模块 key 集合 */
const CANDIDATE_KEYS = new Set(NOTIFY_CANDIDATES.map((c) => c.key));

/** 该警报是否值得弹：静音按 key 精确匹配（优先）；活动h本只豁免去重、静音依然有效 */
function alarmWorthNotifying(key: string, muted: string[]): boolean {
    if (muted.includes(key)) return false;
    if (key === NOTIFY_NO_DEDUP_KEY) return true; // 活动h本：不去重，每次都弹（复刻活动并存会漏扫）
    return !wasNotifiedRecently(key);
}

/** 登出/删QQ 时清理跨登录的警报态：避免下一个登录者被上一个用户的警报记录吞掉通知 */
export function resetNotifyWatcherState(): void {
    alarmSeenByAlias.clear();
    notifyInflight.clear();
    notifyTrailing.clear();
}

export function NotifyWatcher(): null {
    useEffect(() => {
        const check = (alias: string, prefsMuted: string[]) => {
            void (async () => {
                try {
                    const res = await API.get<{ result?: Record<string, { status?: string; name?: string }> }>(
                        `/account/${encodeURIComponent(alias)}/daily_result?text=true`,
                    );
                    const modules = res?.data?.result ?? {};
                    const alarms = Object.entries(modules).filter(([, m]) => m?.status === '错误' || m?.status === '中止');
                    if (alarms.length === 0) {
                        alarmSeenByAlias.set(alias, false); // 该账号恢复正常：重新武装
                        return;
                    }
                    // 逐个筛查全部警报模块（find 逐项判断，第一个被抑制不挡后面的）：
                    // 已知模块（候选表内）静音按 key；未知模块不静音但参与月度去重
                    const chosen = alarms.find(
                        ([key]) => CANDIDATE_KEYS.has(key)
                            ? alarmWorthNotifying(key, prefsMuted)
                            : !wasNotifiedRecently(key),
                    );
                    if (!chosen) return; // 全部被抑制：不弹，也不置警报态（被静音的旧警报不该吞掉后续新警报）
                    if (chosen[0] !== NOTIFY_NO_DEDUP_KEY) {
                        markNotifiedForClass(chosen[0]);
                    }
                    // 只有真的弹了才置警报态：静音期不武装，新模块警报仍可弹出
                    alarmSeenByAlias.set(alias, true);
                    const accName = getDisplayName(alias);
                    const body = `${accName}：${chosen[1]?.name || chosen[0]} 状态「${chosen[1]?.status}」`;
                    try {
                        if (Notification.permission === 'granted') {
                            new Notification('AutoPCR 日常警报', { body });
                        } else {
                            toaster.create({ type: 'warning', title: '日常警报（浏览器通知未授权）', description: body });
                        }
                    } catch {
                        toaster.create({ type: 'warning', title: '日常警报', description: body });
                    }
                } catch {
                    // 拉取失败静默：下次事件再来
                } finally {
                    notifyInflight.delete(alias);
                    // 拉取期间又来了事件：补查一次，新警报不用等下一次日常才被发现
                    if (notifyTrailing.delete(alias)) {
                        const prefs = loadNotifyPrefs();
                        if (prefs.enabled) check(alias, prefs.muted);
                    }
                }
            })();
        };
        const off = onDailyFinished((alias: string) => {
            // 偏好在事件到达时现读：改设置无需重挂监听，永无闭包陈旧
            const prefs = loadNotifyPrefs();
            if (!prefs.enabled) return;
            if (notifyInflight.has(alias)) {
                notifyTrailing.add(alias); // 正在拉取：标记补查而非丢弃
                return;
            }
            notifyInflight.add(alias);
            check(alias, prefs.muted);
        });
        return off;
    }, []);

    return null;
}
