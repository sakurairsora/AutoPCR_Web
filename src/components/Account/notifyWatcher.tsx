/** 周期通知全局监听器：挂在 _sidebar 布局层，账号页/主页/任意页面都能收到日常完成事件 */

import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { API } from '@api/APIUtils';
import {
    getDisplayName,
    loadNotifyPrefs,
    wasNotifiedRecently,
    markNotifiedForClass,
    onDailyFinished,
    NOTIFY_CANDIDATES,
    NOTIFY_NO_DEDUP_KEY,
} from './accountShared';
import { toaster } from '../../components/ui/toaster';

/** 每账号是否处于警报态（恢复后复位）——按账号隔离，互不吞警报 */
const alarmSeenByAlias = new Map<string, boolean>();
/** 同一账号拉取进行中则跳过，避免事件风暴下重复请求 */
const inflight = new Set<string>();

/** 已知的可静音模块 key 集合 */
const CANDIDATE_KEYS = new Set(NOTIFY_CANDIDATES.map((c) => c.key));

export default function NotifyWatcher(): null {
    const navigate = useNavigate();

    useEffect(() => {
        const off = onDailyFinished((alias: string) => {
            // 偏好在事件到达时现读：改设置无需重挂监听，永无闭包陈旧
            const prefs = loadNotifyPrefs();
            if (!prefs.enabled) return;
            if (inflight.has(alias)) return;
            inflight.add(alias);
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
                    if (alarmSeenByAlias.get(alias)) return; // 该账号此前已是警报：静默
                    alarmSeenByAlias.set(alias, true);
                    // 逐个筛查：静音按 key 精确匹配；活动h本只豁免去重、静音依然有效
                    const known = alarms.find(([key]) => CANDIDATE_KEYS.has(key));
                    const target =
                        known &&
                        (prefs.muted.includes(known[0])
                            ? undefined
                            : known[0] === 'very_hard_hurdle' || !wasNotifiedRecently(known[0])
                              ? known
                              : undefined);
                    // 未知模块（不在候选表）：不静音，但参与月度去重
                    const fallback =
                        target ??
                        alarms.find(([key]) => !CANDIDATE_KEYS.has(key) && !wasNotifiedRecently(key));
                    const chosen = target ?? fallback;
                    if (!chosen) return; // 全部被抑制：不弹
                    if (chosen[0] !== NOTIFY_NO_DEDUP_KEY) {
                        markNotifiedForClass(chosen[0]);
                    }
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
                    inflight.delete(alias);
                }
            })();
        });
        return off;
    }, [navigate]);

    return null;
}
