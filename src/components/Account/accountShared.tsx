/** DashBoard 与账号卡片共享：状态登记表/存取/通知/批次/工具栏控件/全局监听（碎文件合并版） */

import { Box, Popover, Stack, Text } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useRef, useState } from 'react';
import { API } from '@api/APIUtils';
import { getAccountConfig, putAccountConfigs } from '@api/Account';
import type { Candidate, ConfigType, ConfigValue, ModuleResponse } from '@interfaces/Module';
import { Checkbox } from '../../components/ui/checkbox';
import { toaster } from '../../components/ui/toaster';



/** 批量清理登记表：账号名 → 清理回调（注册方保证包 ref，调用方无参调用） */
/** 批量清理日常的注册表：alias → 该账号卡片的清理入口（DashBoard 全体清理按名调用） */
export const dailyCleanRegistry: Map<string, () => void | Promise<void>> = new Map();

/** 全局忙碌表（模块级真源）：DashBoard setAccountBusy 时同步写；供弹窗等非父子组件查询互斥 */
export const busyAccountsRef = new Set<string>();

export const DISPLAY_NAME_KEY = (alias: string) => 'autopcr_displayName_' + alias;

export function getDisplayName(alias: string): string {
    return safeGetItem(DISPLAY_NAME_KEY(alias)) || alias;
}

/** 每账号"弹结果"标记：该账号执行完自动弹出结果窗 */
export const POPUP_FLAG_KEY = (alias: string) => 'autopcr_popupResult_' + alias;

export function loadPopupFlag(alias: string): boolean {
    // 默认勾选：只有明确存过 'false'（用户关掉过）才静默
    return safeGetItem(POPUP_FLAG_KEY(alias)) !== 'false';
}

/** 「弹结果」总开关（工具栏勾选框），默认开 */
export const POPUP_MASTER_KEY = 'autopcr_popupResult';

/** 主页账号视图模式（表格/卡片） */
export const VIEW_MODE_KEY = 'accountViewMode';

/** 账号收藏（区服→功能名列表）存储键 */
export const favKey = (alias: string) => `autopcr_fav_${alias}`;

export function loadPopupMaster(): boolean {
    return safeGetItem(POPUP_MASTER_KEY) !== 'false';
}

/** 周期通知：开关 + 静音名单（模块 key），存本地 */
export interface NotifyPrefs {
    enabled: boolean;
    muted: string[];
}

const NOTIFY_KEY = 'autopcr_notify_v1';

export function loadNotifyPrefs(): NotifyPrefs {
    try {
        const raw = safeGetItem(NOTIFY_KEY);
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
        const raw = safeGetItem(NOTIFY_SENT_KEY);
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
        const raw = safeGetItem(BATCH_KEY);
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

/** localStorage 读兜底：隐私模式/禁 cookie 场景访问 localStorage 即抛 SecurityError，读函数必须吞掉 */
export function safeGetItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/** localStorage 删除兜底：与 safeSetItem 同语义 */
export function safeRemoveItem(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // 本地存储不可用则忽略
    }
}
export function safeSetItem(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        // 本地存储不可用：返回 false 由调用方决定是否提示
        return false;
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

/** 该警报是否值得弹：已知模块（候选表内）静音按 key + 月度去重（活动h本豁免去重）；未知模块不静音、只做月度去重 */
function alarmWorthNotifying(key: string, muted: string[]): boolean {
    const known = CANDIDATE_KEYS.has(key);
    if (known && muted.includes(key)) return false;
    if (key === NOTIFY_NO_DEDUP_KEY) return true; // 活动h本：不去重，每次都弹（复刻活动并存会漏扫）
    return !wasNotifiedRecently(key);
}

/** 登出/删QQ 时清理跨登录的警报态：避免下一个登录者被上一个用户的警报记录吞掉通知 */
let notifyGeneration = 0;
export function resetNotifyWatcherState(): void {
    notifyGeneration += 1; // 世代+1：在途的晚到响应全部作废，不回写刚清空的表
    alarmSeenByAlias.clear();
    notifyInflight.clear();
    notifyTrailing.clear();
    // busyAccountsRef 不在此清（用户裁决）：忙碌是账号级行为，跨导航/登录存活，晚到 finally 自会 delete
}

export function NotifyWatcher(): null {
    // 通知开关沿革：关闭期间事件全部跳过（全绿复位也观测不到），重新开启时清空警报静默表——
    // 否则关闭期间错过的全绿丢失，重开后的新警报被旧 seen 标记吞掉
    const lastNotifyEnabledRef = useRef<boolean | null>(null);
    useEffect(() => {
        // 挂载即重置：跨登录 seen 污染无条件闭合（401 会话过期无论走硬跳还是软导航，重挂载都发生在新会话）
        resetNotifyWatcherState();
        const check = (alias: string, prefsMuted: string[]) => {
            const gen = notifyGeneration; // 捕获世代：resetNotifyWatcherState 后本 check 的结果作废
            void (async () => {
                try {
                    const res = await API.get<{ result?: Record<string, { status?: string; name?: string }> }>(
                        `/account/${encodeURIComponent(alias)}/daily_result?text=true`,
                    );
                    if (notifyGeneration !== gen) return; // 登出/重置后晚到：丢弃
                    const modules = res?.data?.result ?? {};
                    const alarms = Object.entries(modules).filter(([, m]) => m?.status === '错误' || m?.status === '中止');
                    if (alarms.length === 0) {
                        alarmSeenByAlias.set(alias, false); // 该账号恢复正常：重新武装
                        return;
                    }
                    // 该账号已处于「弹过警报」状态：静默，直到全绿重新武装。
                    // 没有它的话 h本这类不去重的持续警报会在每次日常完成时重复弹
                    if (alarmSeenByAlias.get(alias)) return;
                    // 逐个筛查全部警报模块（find 逐项判断，第一个被抑制不挡后面的）：静音/去重判定统一在 alarmWorthNotifying
                    const chosen = alarms.find(([key]) => alarmWorthNotifying(key, prefsMuted));
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
                    // 世代闸罩住 finally：reset 后晚到的请求不得删新世代的 inflight 登记（否则窗口内同账号重复 GET、trailing 防护失效）
                    if (notifyGeneration === gen) {
                        notifyInflight.delete(alias);
                        // 拉取期间又来了事件：补查一次，新警报不用等下一次日常才被发现（补查同样登记 inflight，保持并发防护闭合）
                        if (notifyTrailing.delete(alias)) {
                            const prefs = loadNotifyPrefs();
                            if (prefs.enabled) {
                                notifyInflight.add(alias);
                                check(alias, prefs.muted);
                            }
                        }
                    }
                }
            })();
        };
        const off = onDailyFinished((alias: string) => {
            // 偏好在事件到达时现读：改设置无需重挂监听，永无闭包陈旧
            const prefs = loadNotifyPrefs();
            if (!prefs.enabled) {
                lastNotifyEnabledRef.current = false;
                return;
            }
            if (lastNotifyEnabledRef.current === false) {
                // 刚从关闭切到开启：关闭期间的警报期状态作废，重新武装所有账号
                alarmSeenByAlias.clear();
            }
            lastNotifyEnabledRef.current = true;
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

/** 危险分区的显示名（后端约定）：快捷按钮 dangerous 标记、危险确认弹窗、Picker 染色共用此常量 */
export const DANGEROUS_AREA_NAME = '危险';

/** 批量运行虚拟账号名（后端约定）：全选/全体兜底/同步目标列表等处统一排除，单勾直打后端会 404 */
export const BATCH_RUNNER = 'BATCH_RUNNER';

/** 安全解析后端错误文案，避免 Blob/.text 抛错或 [object Object]（自 Config.tsx 迁入，通用工具） */
export async function getErrorDescription(err: unknown, fallback = '网络错误'): Promise<string> {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    try {
        if (data == null) {
            if (err instanceof Error && err.message) return err.message;
            return fallback;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
            const txt = await data.text();
            return txt || fallback;
        }
        if (typeof data === 'string') return data || fallback;
        if (typeof data === 'object') {
            try {
                return JSON.stringify(data);
            } catch {
                return fallback;
            }
        }
        return String(data);
    } catch {
        return fallback;
    }
}


/** 校验配置项：按 schema 类型严格校验值合法性（bool 只收 boolean；time 必须 hh:mm；multi 候选过滤），不合法返回 undefined（自 AccountCard/ConfigImportExport 双胞胎收簸，取严格语义） */
export function toCheckedConfigItem(
    type: ConfigType,
    candidates: Candidate[],
    value: unknown,
): ConfigValue | undefined {
    switch (type) {
        case 'bool':
            if (typeof value === 'boolean') return value;
            break;
        case 'single':
            if (typeof value === 'string' || typeof value === 'number') return value;
            break;
        case 'int':
            // 只收整数：小数对 int 型配置无意义（后端解析行为不明，宁拒不猜）
            if (typeof value === 'number' && Number.isInteger(value)) return value;
            break;
        case 'text':
            if (typeof value === 'string') return value;
            break;
        case 'time':
            // hh:mm 且范围合法（00-23:00-59）："99:99" 这种格式对但值错的拒绝
            if (
                typeof value === 'string' &&
                /^\d{2}:\d{2}$/.test(value) &&
                Number(value.slice(0, 2)) <= 23 &&
                Number(value.slice(3)) <= 59
            )
                return value;
            break;
        case 'multi':
        case 'multi_search': {
            if (!Array.isArray(value)) break;
            const checkedArray: (string | number)[] = [];
            for (const item of value) {
                if (typeof item !== 'number' && typeof item !== 'string') continue;
                if (candidates.find((v) => item === v.value)) checkedArray.push(item);
            }
            return checkedArray;
        }
    }
    return undefined;
}

/** 按模块 schema 过滤导入配置：只收 schema 内的键，逐项过 toCheckedConfigItem 校验 */
export function realImportByModule(
    module: ModuleResponse,
    configs: Record<string, ConfigValue>,
): { accepted: Record<string, ConfigValue>; schemaKeys: Set<string> } {
    const accepted: Record<string, ConfigValue> = {};
    const schemaKeys = new Set<string>(); // schema 实际接管的键：含被校验拒绝的（拒绝值不得经补充键复活）
    for (const moduleKey in module.info) {
        schemaKeys.add(moduleKey); // 开关键也属 schema：布尔特判拒掉的字符串 "true" 不再从补充键溜回来
        if (configs[moduleKey] !== undefined && typeof configs[moduleKey] === 'boolean') {
            accepted[moduleKey] = configs[moduleKey];
        }
        const moduleConf = module.info[moduleKey].config;
        for (const moduleConfKey in moduleConf) {
            schemaKeys.add(moduleConfKey);
            const moduleItem = moduleConf[moduleConfKey];
            const confItem = toCheckedConfigItem(moduleItem.config_type, moduleItem.candidates, configs[moduleConfKey]);
            if (confItem !== undefined) {
                accepted[moduleConfKey] = confItem;
            }
        }
    }
    return { accepted, schemaKeys };
}

/** 配置文件导入共享流程：解析 base64 → 逐区服 schema 校验 → PUT → 成功后写收藏标记。
 *  返回值区分三种结果：成功对象 / 抛出可展示错误。收藏写失败不抛（降级，由 favWriteFailed 通知调用方） */
export async function importConfigFile(opts: {
    alias: string;
    rawCfg: string;
    /** 区服名单来源：调用方各自获取（卡片现查 / 弹窗用已有 props） */
    areas: { key: string }[];
    /** 收藏写失败时回调（用于降级提示）；不传则静默 */
    onFavWriteFailed?: () => void;
}): Promise<void> {
    const { alias, rawCfg, areas, onFavWriteFailed } = opts;
    let configs: Record<string, Record<string, ConfigValue>>;
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(atob(rawCfg.trim())));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('bad');
        }
        configs = parsed as Record<string, Record<string, ConfigValue>>;
    } catch {
        throw new Error('配置文件格式无效，请检查选取的配置文件。');
    }

    const configItems = await Promise.all(areas.map((area) => getAccountConfig(alias, area.key)));
    const uploadConfig: Record<string, ConfigValue> = {};
    const importedFav: Record<string, string[]> = {};

    configItems.forEach((value, index) => {
        const areaKey = areas[index].key;
        const areaConfig = configs[areaKey];
        // 区服层形状守卫：字符串/数组是真值，直接迭代会把 "abc" 拆成 "0"/"1"/"2" 垃圾键直通 PUT
        if (typeof areaConfig !== 'object' || areaConfig === null || Array.isArray(areaConfig)) return;

        const { accepted, schemaKeys } = realImportByModule(value, areaConfig);
        Object.assign(uploadConfig, accepted);

        // 收藏标记 + schema 外补充键。schemaKeys = schema 实际接管的键（含被校验拒绝的）：
        // 被拒的非法值（"99:99"、1.5、字符串 "true"）不得经补充键复活直通 PUT；
        // 真正的 schema 外补充键只放行原始值（对象/数组不属于配置值）
        for (const key in areaConfig) {
            if (key.startsWith('_fav_')) {
                importedFav[areaKey] = importedFav[areaKey] || [];
                if (areaConfig[key] === true) {
                    importedFav[areaKey].push(key.slice(5));
                }
            } else if (!schemaKeys.has(key) && uploadConfig[key] === undefined && areaConfig[key] !== undefined) {
                const v = areaConfig[key];
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    uploadConfig[key] = v;
                }
            }
        }
    });

    if (Object.keys(uploadConfig).length === 0) {
        throw new Error('文件中没有可用配置，未做任何修改。');
    }
    // 全部成功后才写收藏（PUT 失败不覆盖现有收藏）；文件不含 _fav_（旧版导出）时不动收藏。
    // 收藏按「文件里出现的区服」合并写回：文件没覆盖的区服（如文件是别的号导出的）保留既有收藏，不整表替换
    await putAccountConfigs(alias, uploadConfig);
    if (Object.keys(importedFav).length > 0) {
        try {
            const raw = localStorage.getItem(favKey(alias));
            const existing = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
            localStorage.setItem(favKey(alias), JSON.stringify({ ...existing, ...importedFav }));
        } catch {
            onFavWriteFailed?.();
        }
    }
}

