import { AccountInfo as AccountInfoInterface, UserInfoResponse } from '@interfaces/UserInfo';
import {
    Box,
    Button,
    Card,
    Flex,
    HStack,
    Input,
    Popover,
    SimpleGrid,
    Stack,
    Table,
    Text,
} from '@chakra-ui/react';
import { FiBook, FiCheck, FiGrid, FiKey, FiList, FiPlus, FiStar, FiTarget, FiUpload, FiUserMinus, FiUserPlus, FiUserX } from 'react-icons/fi';
import React, { ChangeEvent, useMemo, useRef } from 'react';
import { Skeleton, SkeletonText } from '../../components/ui/skeleton';
import { clearAccounts, deleteAccount, getUserInfo, putUserInfo } from '@api/Account';
import { delAccount, postAccount, postAccountAreaSingle, postAccountImport } from '@api/Account';
import { API } from '@api/APIUtils';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ResultInfo } from '@interfaces/UserInfo';

import Alert from '../alert';
import { AxiosError } from 'axios';
import { Checkbox } from '../../components/ui/checkbox';
import { IconButton } from '../../components/ui/icon-button';
import { Route as LoginRoute } from '@routes/daily/login';
import NiceModal from '@ebay/nice-modal-react';
import ReadmeModal from './ReadmeModal';
import { Tooltip } from '../../components/ui/tooltip';
import resetPasswdModal from '../Users/ResetPasswdModal';
import { toaster } from '../../components/ui/toaster';
import { useCountHook } from '../count';
import { useDisclosure } from '@chakra-ui/react';
import QuickActionPicker from './QuickActionPicker';
import ConfigSyncModal from './ConfigSyncModal';
import ResultSummaryModal, { ResultSummaryRow } from './ResultSummaryModal';
import ResultInfoModal from './ResultInfoModal';
import { loadQuickActions, saveQuickActions, QuickActionItem } from './quickActions';
import { AccountInfo } from './AccountCard';

import { getErrorDescription } from './Config';

import { handle, getDisplayName, loadBatch, saveBatch, loadPopupFlag, loadPopupMaster, loadNotifyPrefs, saveNotifyPrefs, wasNotifiedRecently, markNotifiedForClass, onDailyFinished } from './accountShared';
import type { NotifyPrefs } from './accountShared';

/** 收集其他账号已占用的显示名（含未自定义时的原始 alias） */
function collectOccupiedNames(accounts: AccountInfoInterface[] | undefined, selfAlias: string): Set<string> {
    const set = new Set<string>();
    for (const acc of accounts || []) {
        if (acc.name === selfAlias) continue;
        set.add(getDisplayName(acc.name));
        set.add(acc.name);
    }
    return set;
}

/** 周期通知的可静音对象：与日常分模块结果里的模块 key 对应 */
const NOTIFY_CANDIDATES: { key: string; label: string }[] = [
    { key: 'special_underground', label: '特别地下城' },
    { key: 'abyss_frontier', label: '深渊讨伐战' },
    { key: 'abyss_boss', label: '深渊boss战' },
    { key: 'very_hard_hurdle', label: '扫荡活动h本' },
    { key: 'luna_tower', label: '露娜塔回廊扫荡' },
];

export function DashBoard() {
    const [userInfo, setUserInfo] = useState<UserInfoResponse>();
    const freshAccountInfo = useDisclosure();
    const creatAccountSwitch = useDisclosure();
    const deleteQQConfirm = useDisclosure();
    const clearAccountConfirm = useDisclosure();
    const [alias, setAlias] = useState<string>('');
    const [count, increaseCount, decreaseCount] = useCountHook();
    const [isTableView, setIsTableView] = useState<boolean>(() => {
        const savedView = localStorage.getItem('accountViewMode');
        return savedView ? savedView === 'table' : false;
    });
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [quickActions, setQuickActions] = useState<QuickActionItem[]>(() => loadQuickActions());
    // 自动批次（多"默认账号"）：星标加入/移出，未勾选时作为执行目标
    const [batchAccounts, setBatchAccounts] = useState<string[]>(() => loadBatch());
    // 「弹结果」：功能按钮执行完自动弹出结果汇总窗
    const [popupResult, setPopupResult] = useState<boolean>(() => loadPopupMaster());
    // 周期通知：日常例行拉取各账号分模块结果，出警报（错误/中止）弹系统通知（整个会话只弹一次）
    const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs());
    // 账号忙碌登记：转圈=忙，其他动作不可对该账号生效
    const [busyAccounts, setBusyAccounts] = useState<Set<string>>(new Set());
    const busyRef = useRef(busyAccounts);
    busyRef.current = busyAccounts;
    const setAccountBusy = (name: string, busy: boolean) => {
        setBusyAccounts((prev) => {
            const next = new Set(prev);
            if (busy) next.add(name);
            else next.delete(name);
            return next;
        });
    };
    useEffect(() => {
        if (!saveQuickActions(quickActions)) {
            toaster.create({ type: 'warning', title: '自定义按钮保存失败', description: '本地存储不可用，本次会话内仍可使用' });
        }
    }, [quickActions]);

    useEffect(() => {
        saveBatch(batchAccounts);
    }, [batchAccounts]);

    useEffect(() => {
        localStorage.setItem('autopcr_popupResult', popupResult ? 'true' : 'false');
    }, [popupResult]);

    useEffect(() => {
        saveNotifyPrefs(notifyPrefs);
    }, [notifyPrefs]);

    // 周期通知：被动监听「某账号日常执行完成」事件 → 若此前无警报，才去筛查该账号的分模块结果；
    // 出现警报（错误/中止）且未被静音/未被去重 → 弹一次系统通知（同类警报一个月内只弹一次，活动h本扫荡例外）。
    // 已是警报状态则静默，直到状态恢复正常后再次出警才会再弹。
    const alarmSeenRef = useRef(false);
    useEffect(() => {
        if (!notifyPrefs.enabled) return;
        const off = onDailyFinished(async (alias: string) => {
            try {
                const res = await API.get<{ result?: Record<string, { status?: string; name?: string }> }>(`/account/${alias}/daily_result?text=true`);
                const modules = res?.data?.result ?? {};
                const alarms = Object.entries(modules).filter(([, m]) => m?.status === '错误' || m?.status === '中止');
                if (alarms.length === 0) {
                    if (alarmSeenRef.current) alarmSeenRef.current = false; // 状态恢复正常，重新武装
                    return;
                }
                if (alarmSeenRef.current) return; // 之前已是警报：静默
                // 逐个筛查警报模块：跳过被静音或月内已弹过的，找到第一个值得弹的（活动h本扫荡永不去重不静音）
                const target = alarms.find(([key, m]) => {
                    const hay = `${key} ${m?.name ?? ''}`;
                    if (hay.includes('活动h') || hay.includes('扫荡活动')) return true;
                    if (notifyPrefs.muted.some((label) => hay.includes(label))) return false;
                    return !wasNotifiedRecently(key); // 同类一月内已弹过（跨账号共用）则跳过
                });
                alarmSeenRef.current = true; // 处于警报态：恢复前保持静默
                if (!target) return; // 全部被抑制：不弹
                const tHay = `${target[0]} ${target[1]?.name ?? ''}`;
                if (!tHay.includes('活动h') && !tHay.includes('扫荡活动')) {
                    markNotifiedForClass(target[0]);
                }
                const accName = getDisplayName(alias);
                const body = `${accName}：${target[1]?.name || target[0]} 状态「${target[1]?.status}」`;
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
                // 拉取失败静默
            }
        });
        return off;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notifyPrefs.enabled, notifyPrefs.muted]);

    // 批次名单随账号列表自动剔除失效项
    useEffect(() => {
        if (!userInfo) return;
        const names = new Set(userInfo.accounts?.map((acc) => acc.name) ?? []);
        setBatchAccounts((prev) => {
            const next = prev.filter((name) => names.has(name));
            return next.length === prev.length ? prev : next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userInfo?.accounts?.length]);

    useEffect(() => {
        if (sessionStorage.getItem('autopcr_need_refresh_dashboard') === '1') {
            sessionStorage.removeItem('autopcr_need_refresh_dashboard');
            freshAccountInfo.onToggle();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const showReadme = () => {
        NiceModal.show(ReadmeModal, {})
            .then(() => {
                localStorage.setItem('readme2', 'true');
            })
            .catch(() => {
                localStorage.setItem('readme2', 'true');
            });
    };

    useEffect(() => {
        const readme = localStorage.getItem('readme2');
        if (!readme) {
            showReadme();
        }
    }, []);

    useEffect(() => {
        getUserInfo()
            .then((res) => {
                setUserInfo(res);
                // 列表刷新后剔除选中里已不存在的账号（删除/清除后不再残留）
                setSelectedAccounts((prev) => prev.filter((name) => res.accounts?.some((acc) => acc.name === name)));
            })
            .catch(async (err: AxiosError) => {
                toaster.create({ type: 'error', title: '获取账号失败', description: await getErrorDescription(err) });
            });
    }, [freshAccountInfo.open]);

    // 星标状态：勾选的账号全部已在批次里才算"亮"
    const selectedInBatch = selectedAccounts.length > 0 && selectedAccounts.every((name) => batchAccounts.includes(name));

    // 星标 = 把勾选的所有账号加入/移出自动批次（多"默认账号"，纯本地名单，动作目标用它，与后端默认账号无关）
    const handleToggleBatchForSelected = () => {
        if (selectedAccounts.length === 0) {
            toaster.create({ type: 'info', title: '请先勾选账号', description: '星标用于把勾选的账号加入或移出自动批次' });
            return;
        }
        const allIn = selectedAccounts.every((name) => batchAccounts.includes(name));
        const next = allIn
            ? batchAccounts.filter((name) => !selectedAccounts.includes(name))
            : [...batchAccounts, ...selectedAccounts.filter((name) => !batchAccounts.includes(name))];
        setBatchAccounts(next);
        toaster.create({
            type: 'success',
            title: allIn ? `已将 ${selectedAccounts.length} 个账号移出自动批次` : `已将 ${selectedAccounts.length} 个账号加入自动批次`,
        });
    };

    const handleResetPassword = () => {
        NiceModal.show(resetPasswdModal, {})
            .then((value) => {
                putUserInfo({ password: value as string })
                    .then((res) => {
                        toaster.create({ type: 'success', title: '修改密码成功', description: res });
                        NiceModal.hide(resetPasswdModal)
                            .then(() => {
                                return;
                            })
                            .catch(() => {
                                return;
                            });
                    })
                    .catch(async (err: AxiosError) => {
                        toaster.create({ type: 'error', title: '修改密码失败', description: await getErrorDescription(err) });
                    });
            })
            .catch(() => {
                return;
            });
    };

    const updateAccountInfo = (updatedAccount: AccountInfoInterface) => {
        setUserInfo((prevUserInfo) => {
            if (!prevUserInfo?.accounts) {
                return prevUserInfo;
            }

            const updatedAccounts = prevUserInfo.accounts.map((account) => (account.name === updatedAccount.name ? updatedAccount : account));

            return {
                ...prevUserInfo,
                accounts: updatedAccounts,
            };
        });
    };

    const allSelected = selectedAccounts.length > 0 && selectedAccounts.length === (userInfo?.accounts?.length ?? 0);

    const handleCleanDailyAll = () => {
        const allNames = userInfo?.accounts?.map((acc) => acc.name) ?? [];
        const targets = selectedAccounts.length > 0 ? selectedAccounts : batchAccounts.length > 0 ? batchAccounts : allNames;
        const free = targets.filter((name) => !busyRef.current.has(name));
        const busy = targets.filter((name) => busyRef.current.has(name));
        if (free.length === 0) {
            toaster.create({ type: 'warning', title: '请等待执行完毕', description: '所选账号都正在执行中' });
            return;
        }
        if (busy.length > 0) {
            toaster.create({ type: 'info', title: `已跳过 ${busy.length} 个正在执行中的账号` });
        }
        for (const name of free) {
            const fn = handle.get(name);
            if (fn) fn(false);
        }
    };

    // 自定义功能按钮：目标=勾选的账号 > 自动批次（没勾选时） > 全体（批次也为空时）；忙碌账号跳过；危险功能先确认
    const handleQuickAction = async (btn: QuickActionItem) => {
        const allNames = userInfo?.accounts?.map((acc) => acc.name) ?? [];
        const targets = selectedAccounts.length > 0 ? selectedAccounts : batchAccounts.length > 0 ? batchAccounts : allNames;
        const free = targets.filter((name) => !busyRef.current.has(name));
        const busy = targets.filter((name) => busyRef.current.has(name));
        if (free.length === 0) {
            toaster.create({ type: 'warning', title: '请等待执行完毕', description: '所选账号都正在执行中' });
            return;
        }
        if (busy.length > 0) {
            toaster.create({ type: 'info', title: `${btn.name}：已跳过 ${busy.length} 个正在执行中的账号` });
        }
        if (btn.dangerous && !window.confirm(`「${btn.name}」为危险功能，确定要对 ${free.length} 个账号执行吗？`)) {
            return;
        }
        free.forEach((name) => {
            setAccountBusy(name, true);
            increaseCount();
        });
        let ok = 0;
        let fail = 0;
        const outcomes = new Map<string, { ok: boolean; detail: string; res?: ResultInfo[] }>();
        await Promise.all(
            free.map(async (name) => {
                try {
                    const res = await postAccountAreaSingle(name, btn.key);
                    outcomes.set(name, { ok: true, detail: '', res });
                    ok += 1;
                } catch (err: any) {
                    outcomes.set(name, { ok: false, detail: await getErrorDescription(err), res: undefined });
                    fail += 1;
                } finally {
                    setAccountBusy(name, false);
                    decreaseCount();
                }
            }),
        );
        const targetDesc = selectedAccounts.length > 0 ? '勾选账号' : batchAccounts.length > 0 ? '自动批次' : '全体账号';
        if (popupResult) {
            const rows: ResultSummaryRow[] = free.map((name) => {
                const o = outcomes.get(name);
                return { alias: name, name: getDisplayName(name), status: o?.ok ? '成功' : '失败', detail: o?.ok ? undefined : o?.detail };
            });
            NiceModal.show(ResultSummaryModal, { title: `${btn.name} · ${targetDesc}`, rows }).catch(() => {
                return;
            });
        } else {
            toaster.create({
                type: fail > 0 ? 'warning' : 'success',
                title: `${btn.name} 执行完成`,
                description: `成功 ${ok} / 失败 ${fail}（目标：${targetDesc}），结果默认不弹窗，可在各账号详情的功能区里查看`,
            });
        }
        // 仅对单账号执行且该账号开了"弹结果"标记的，直接弹该账号的功能结果窗
        if (free.length === 1 && loadPopupFlag(free[0])) {
            const o = outcomes.get(free[0]);
            if (o?.ok && o.res) {
                NiceModal.show(ResultInfoModal, { alias: free[0], title: btn.name, resultInfo: o.res }).catch(() => {
                    return;
                });
            }
        }
    };

    const handleOpenQuickPicker = () => {
        const refAlias = userInfo?.accounts?.find((acc) => acc.name !== 'BATCH_RUNNER')?.name;
        if (!refAlias) {
            toaster.create({ type: 'warning', title: '请先创建一个账号' });
            return;
        }
        NiceModal.show(QuickActionPicker, { alias: refAlias, current: quickActions }).then((items) => {
            if (!Array.isArray(items)) return;
            const deadCount = quickActions.filter((q) => !items.some((i) => i.key === q.key)).length;
            setQuickActions(items as QuickActionItem[]);
            if (deadCount > 0) {
                toaster.create({ type: 'info', title: `已移除 ${deadCount} 个失效的自定义按钮` });
            }
        });
    };

    const toggleSelectAccount = (accountName: string) => {
        setSelectedAccounts((prev) => {
            if (prev.includes(accountName)) {
                return prev.filter((name) => name !== accountName);
            } else {
                return [...prev, accountName];
            }
        });
    };

    const toggleSelectAll = () => {
        if (selectedAccounts.length === userInfo?.accounts?.length) {
            setSelectedAccounts([]);
        } else {
            setSelectedAccounts(userInfo?.accounts?.map((acc) => acc.name) ?? []);
        }
    };

    const handleCreateAccount = () => {
        if (!creatAccountSwitch.open) {
            creatAccountSwitch.onOpen();
            return;
        }
        const trimmed = alias.trim();
        if (!trimmed) {
            toaster.create({
                type: 'warning',
                title: '需输入名字，此次未创建',
            });
            creatAccountSwitch.onClose();
            setAlias('');
            return;
        }

        postAccount(trimmed)
            .then((res) => {
                toaster.create({
                    type: 'success',
                    title: '创建账号成功',
                    description: res,
                });
                creatAccountSwitch.onClose();
                setAlias('');
                freshAccountInfo.onToggle();
            })
            .catch(async (err: AxiosError) => {
                toaster.create({
                    type: 'error',
                    title: '创建账号失败',
                    description: await getErrorDescription(err),
                });
            });
    };

    const handleAccountImport = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) {
            postAccountImport(file)
                .then((res) => {
                    toaster.create({ type: 'success', title: '导入账号成功', description: res });
                    freshAccountInfo.onToggle();
                })
                .catch(async (err: AxiosError) => {
                    toaster.create({ type: 'error', title: '导入账号失败', description: await getErrorDescription(err) });
                });
        }
    };

    const cancelRef = React.useRef<HTMLButtonElement>(null);

    const navigate = useNavigate();

    const handleDeleteAccount = () => {
        deleteAccount()
            .then(async (res) => {
                toaster.create({ type: 'success', title: '删除QQ成功', description: res });
                deleteQQConfirm.onToggle();
                await navigate({ to: LoginRoute.to });
            })
            .catch(async (err: AxiosError) => {
                toaster.create({ type: 'error', title: '删除QQ失败', description: await getErrorDescription(err) });
            });
    };

    const handleClearAccounts = () => {
        clearAccounts()
            .then((res) => {
                toaster.create({ type: 'success', title: '清除账号成功', description: res });
                clearAccountConfirm.onToggle();
                setSelectedAccounts([]);
                freshAccountInfo.onToggle();
            })
            .catch(async (err: AxiosError) => {
                toaster.create({ type: 'error', title: '清除账号失败', description: await getErrorDescription(err) });
            });
    };

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const occupiedNamesFactory = useMemo(() => {
        return (selfAlias: string) => collectOccupiedNames(userInfo?.accounts, selfAlias);
    }, [userInfo?.accounts]);

    // 文字越多两侧越窄；3 个字以内保持默认内边距（图标/短按钮保持好点）
    const textFitPadding = (label: string): string | undefined => {
        const len = Array.from(label).length;
        if (len <= 3) return undefined;
        if (len <= 5) return '0.5rem';
        return '0.25rem';
    };

    return (
        <Stack gap={4} minH="full" w="full" p={4} position="relative" zIndex={1}>
            <Card.Root variant="elevated" bg="bg.glass" backdropFilter="blur(12px)" shadow="sm" borderRadius="2xl" borderWidth="1px" borderColor="border.subtle">
                <Card.Body py={2} px={4}>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                        <Box>
                            {!userInfo ? (
                                <Skeleton height="20px" width="100px" />
                            ) : (
                                <Text fontSize="md" fontWeight="bold">
                                    {`欢迎回来, ${userInfo.qq}`}
                                </Text>
                            )}
                        </Box>

                        <HStack gap={2}>
                            <Button size="xs" variant="surface" colorPalette="teal" onClick={showReadme}>
                                <FiBook /> 使用须知
                            </Button>
                            <Button size="xs" variant="surface" colorPalette="blue" onClick={handleResetPassword}>
                                <FiKey /> 修改密码
                            </Button>
                            <Button size="xs" variant="surface" colorPalette="red" onClick={deleteQQConfirm.onOpen}>
                                <FiUserX /> 注销QQ
                            </Button>
                        </HStack>
                    </Flex>
                </Card.Body>
            </Card.Root>

            <Alert leastDestructiveRef={cancelRef} isOpen={deleteQQConfirm.open} onClose={deleteQQConfirm.onClose} title="删除QQ" body={`确定删除QQ${userInfo?.qq}吗？`} onConfirm={handleDeleteAccount}>
                {' '}
            </Alert>

            <Flex
                bg="bg.panel"
                py={2}
                px={3}
                borderRadius="xl"
                shadow="sm"
                borderWidth="1px"
                borderColor="border.subtle"
                align="flex-start"
                wrap="wrap"
                gap={2}
            >
                <HStack gap={2} alignItems="center">
                    <Box w="80px" flexShrink={0} fontSize="xs" color="fg.muted" lineHeight="1.5" display="flex" alignItems="center">
                        <Text whiteSpace="nowrap">
                            {selectedAccounts.length > 0
                                ? '只执行勾选账号'
                                : batchAccounts.length > 0
                                    ? '只执行默认账号'
                                    : '执行全部账号'}
                        </Text>
                    </Box>
                    <Button
                        size="sm"
                        px={textFitPadding('设默认号')}
                        colorPalette="purple"
                        variant={selectedInBatch ? 'solid' : 'ghost'}
                        borderWidth="1px"
                        borderColor="currentColor"
                        onClick={handleToggleBatchForSelected}
                        title="点选账号可设置默认账号，可决定哪些账号默认使用主页快捷动作。"
                    >
                        <FiStar /> 设默认号
                    </Button>
                    <Button
                        size="sm"
                        px={textFitPadding(selectedAccounts.length > 0 ? '清理选中日常' : batchAccounts.length > 0 ? '清理批次日常' : '清理全部日常')}
                        colorPalette="orange"
                        variant="ghost"
                        borderWidth="1px"
                        borderColor="currentColor"
                        onClick={handleCleanDailyAll}
                        loading={count != 0}
                    >
                        <FiTarget /> {selectedAccounts.length > 0 ? '清理选中日常' : batchAccounts.length > 0 ? '清理批次日常' : '清理全部日常'}
                    </Button>
                </HStack>

                <Flex flex={1} minW={0} wrap="wrap" alignContent="flex-start" justify="flex-start" alignItems="center" gap={2}>
                    <Button
                        size="sm"
                        flexShrink={0}
                        px={textFitPadding('修改功能')}
                        colorPalette="blue"
                        onClick={handleOpenQuickPicker}
                        title="添加或移除自定义功能按钮"
                    >
                        修改功能 <FiPlus />
                    </Button>
                    {quickActions.map((btn) => (
                        <Button
                            key={btn.key}
                            size="sm"
                            px={textFitPadding(btn.name)}
                            colorPalette={btn.dangerous ? 'red' : 'blue'}
                            variant={btn.dangerous ? 'solid' : 'ghost'}
                            borderWidth="1px"
                            borderColor="currentColor"
                            onClick={() => handleQuickAction(btn)}
                            title={btn.dangerous ? '危险功能，执行前会确认' : `执行 ${btn.name}`}
                        >
                            {btn.name}
                        </Button>
                    ))}
                    <Box borderWidth="1px" borderColor="currentColor" borderRadius="md" px={2} h="2rem" display="flex" alignItems="center" flexShrink={0} ml="auto">
                        <Checkbox
                            checked={popupResult}
                            onCheckedChange={(details) => setPopupResult(!!details.checked)}
                            colorPalette="blue"
                            size="md"
                            title="开启后，功能按钮执行完自动弹出结果汇总窗"
                        >
                            弹结果
                        </Checkbox>
                    </Box>
                    <Box w="1px" h="1.25rem" bg="black" flexShrink={0} alignSelf="center" />
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
                                title="让周期性任务，出警报（非跳过）时，弹出系统通知。同类警报一个月内只弹一次（活动h本扫荡除外），多个号报也只弹一次。"
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
                                                checked={!notifyPrefs.muted.includes(c.label)}
                                                onCheckedChange={(details) => {
                                                    const notifyOn = !!details.checked;
                                                    setNotifyPrefs((prev) => ({
                                                        ...prev,
                                                        muted: notifyOn
                                                        ? prev.muted.filter((k) => k !== c.label)
                                                        : [...prev.muted, c.label],
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
                </Flex>

                <HStack gap={2}>
                    <Box bg="bg.subtle" borderRadius="md" display="flex">
                        <Tooltip content="表格视图" openDelay={0} closeDelay={0}>
                            <IconButton
                                aria-label="List view"
                                size="xs"
                                variant={isTableView ? "solid" : "ghost"}
                                colorPalette={isTableView ? "blue" : "gray"}
                                onClick={() => {
                                    setIsTableView(true);
                                    localStorage.setItem('accountViewMode', 'table');
                                }}
                            >
                                <FiList />
                            </IconButton>
                        </Tooltip>
                        <Tooltip content="卡片视图" openDelay={0} closeDelay={0}>
                            <IconButton
                                aria-label="Grid view"
                                size="xs"
                                variant={!isTableView ? "solid" : "ghost"}
                                colorPalette={!isTableView ? "blue" : "gray"}
                                onClick={() => {
                                    setIsTableView(false);
                                    localStorage.setItem('accountViewMode', 'card');
                                }}
                            >
                                <FiGrid />
                            </IconButton>
                        </Tooltip>
                    </Box>

                     <HStack gap={1}>
                        {userInfo?.clan && (
                            <Tooltip content="导入账号 (TSV)"  openDelay={0} closeDelay={0}>
                                <IconButton
                                    aria-label="Import accounts"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                > <FiUpload /> </IconButton>
                            </Tooltip>
                        )}
                        <Input
                            ref={fileInputRef}
                            type="file"
                            accept=".tsv"
                            onChange={handleAccountImport}
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                            display="none"
                        />

                         <Tooltip content={selectedAccounts.length > 0 ? `删除选中(${selectedAccounts.length})` : '删除全部'}  openDelay={0} closeDelay={0}>
                            <IconButton
                                aria-label="Delete selected accounts"
                                size="sm"
                                variant="outline"
                                colorPalette="red"
                                onClick={() => {
                                    if (selectedAccounts.length > 0) {
                                        if (window.confirm(`确定删除选中的 ${selectedAccounts.length} 个账号吗？`)) {
                                            Promise.all(selectedAccounts.map((name) => delAccount(name)))
                                                .then(() => {
                                                    toaster.create({ type: 'success', title: '删除成功' });
                                                    setSelectedAccounts([]);
                                                    freshAccountInfo.onToggle();
                                                })
                                                .catch(async (err) => toaster.create({ type: 'error', title: '删除失败', description: await getErrorDescription(err) }));
                                        }
                                    } else {
                                        clearAccountConfirm.onOpen();
                                    }
                                }}
                            > <FiUserMinus /> </IconButton>
                        </Tooltip>
                        <Box position="relative">
                            <Tooltip content={creatAccountSwitch.open ? '取消创建' : '创建新账号'}  openDelay={0} closeDelay={0}>
                                <IconButton
                                    aria-label={creatAccountSwitch.open ? "Confirm creation" : "Create account"}
                                    size="sm"
                                    variant={creatAccountSwitch.open ? "solid" : "solid"}
                                    colorPalette={creatAccountSwitch.open ? "red" : "green"}
                                    onClick={() => {
                                        handleCreateAccount();
                                    }}
                                >
                                    {creatAccountSwitch.open ? <FiCheck /> : <FiUserPlus />}
                                </IconButton>
                            </Tooltip>
                        </Box>
                     </HStack>
                </HStack>
            </Flex>

            {creatAccountSwitch.open && (
                <Flex
                    bg="bg.panel"
                    p={4}
                    borderRadius="xl"
                    shadow="sm"
                    borderWidth="1px"
                    borderColor="green.subtle"
                    align="center"
                    gap={4}
                    animation="fade-in 0.2s"
                >
                    <Text fontWeight="bold" whiteSpace="nowrap">新账号名称:</Text>
                    <Input
                        autoFocus
                        placeholder="请输入游戏账号昵称..."
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') handleCreateAccount() }}
                    />
                    <Button size="sm" colorPalette="green" onClick={handleCreateAccount}>创建</Button>
                </Flex>
            )}

            <Alert leastDestructiveRef={cancelRef} isOpen={clearAccountConfirm.open} onClose={clearAccountConfirm.onClose} title="删除所有账号" body={`确定删除所有账号吗？`} onConfirm={handleClearAccounts}>
                {' '}
            </Alert>

            {isTableView ? (
                <Box borderRadius="xl">
                    <Table.Root variant="outline" colorPalette="blue" size="sm" bg="bg.panel" borderRadius="xl" boxShadow="sm" ml="0" mr="auto">
                        <Table.Header position="sticky" top={0} bg="bg.subtle" zIndex={1} boxShadow="sm">
                            <Table.Row>
                                <Table.ColumnHeader px={0} fontSize="md" py={4} fontWeight="bold" width="5%" textAlign="center">
                                    <Checkbox
                                        checked={
                                            (selectedAccounts.length > 0 && selectedAccounts.length < (userInfo?.accounts?.length ?? 0))
                                                ? "indeterminate"
                                                : (selectedAccounts.length > 0 && selectedAccounts.length === userInfo?.accounts?.length)
                                        }
                                        onCheckedChange={toggleSelectAll}
                                        colorPalette="blue"
                                        size="md"
                                        css={{
                                            '& [data-part=control], & .chakra-checkbox__control': {
                                                borderRadius: '9999px',
                                                width: '1.25rem',
                                                height: '1.25rem',
                                            },
                                        }}
                                    />
                                </Table.ColumnHeader>
                                <Table.ColumnHeader px={0} fontSize="md" py={4} fontWeight="bold" width="25%" minWidth="80px">
                                    账号
                                </Table.ColumnHeader>
                                <Table.ColumnHeader px={3} fontSize="md" py={4} fontWeight="bold" width="30%">
                                    最近记录
                                </Table.ColumnHeader>
                                <Table.ColumnHeader px={3} fontSize="md" py={4} fontWeight="bold" width="30%">
                                    操作
                                </Table.ColumnHeader>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {!userInfo ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <Table.Row key={i} bg="transparent">
                                        <Table.Cell px={3} py={2}><Skeleton height="20px" width="20px" /></Table.Cell>
                                        <Table.Cell px={0} py={2}><Skeleton height="20px" width="80%" /></Table.Cell>
                                        <Table.Cell px={3} py={2}><Skeleton height="20px" width="60%" /></Table.Cell>
                                        <Table.Cell px={3} py={2}><Skeleton height="32px" width="100%" /></Table.Cell>
                                    </Table.Row>
                                ))
                            ) : (
                                userInfo?.accounts?.map((account) => (
                                    <AccountInfo
                                        key={account.name}
                                        account={account}
                                        onToggle={freshAccountInfo.onToggle}
                                        increaseCount={increaseCount}
                                        decreaseCount={decreaseCount}
                                        updateAccountInfo={updateAccountInfo}
                                        isTableView={isTableView}
                                        isSelected={selectedAccounts.includes(account.name)}
                                        onToggleSelect={() => toggleSelectAccount(account.name)}
                                        batchAccounts={batchAccounts}
                                        getOccupiedNames={occupiedNamesFactory}
                                        isBusy={busyAccounts.has(account.name)}
                                        onBusyChange={setAccountBusy}
                                        onOpenSyncConfig={(a) => {
                                            NiceModal.show(ConfigSyncModal, { sourceAccount: a });
                                        }}
                                    />
                                ))
                            )}
                        </Table.Body>
                    </Table.Root>
                </Box>
            ) : (
                <Box p={1}>
                    <Box mb={2}>
                        <Checkbox
                            checked={allSelected ? true : selectedAccounts.length > 0 ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAll}
                            colorPalette="blue"
                            size="md"
                        >
                            全选账号
                        </Checkbox>
                    </Box>
                    <SimpleGrid gap={4} templateColumns="repeat(auto-fill, minmax(280px, 1fr))">
                        {!userInfo ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <Card.Root key={i} bg="bg.panel" borderRadius="2xl" shadow="sm">
                                    <Card.Header><Skeleton height="24px" width="50%" /></Card.Header>
                                    <Card.Body><SkeletonText noOfLines={3} gap={4} /></Card.Body>
                                    <Card.Footer><Skeleton height="32px" width="100%" /></Card.Footer>
                                </Card.Root>
                            ))
                        ) : (
                            userInfo?.accounts?.map((account) => (
                                <AccountInfo
                                    key={account.name}
                                    account={account}
                                    onToggle={freshAccountInfo.onToggle}
                                    increaseCount={increaseCount}
                                    decreaseCount={decreaseCount}
                                    updateAccountInfo={updateAccountInfo}
                                    isTableView={isTableView}
                                    isSelected={selectedAccounts.includes(account.name)}
                                    onToggleSelect={() => toggleSelectAccount(account.name)}
                                    batchAccounts={batchAccounts}
                                    getOccupiedNames={occupiedNamesFactory}
                                    isBusy={busyAccounts.has(account.name)}
                                    onBusyChange={setAccountBusy}
                                    onOpenSyncConfig={(a) => {
                                        NiceModal.show(ConfigSyncModal, { sourceAccount: a });
                                    }}
                                />
                            ))
                        )}
                    </SimpleGrid>
                </Box>
            )}
        </Stack>
    );
}

