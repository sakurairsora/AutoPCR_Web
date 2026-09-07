import { AccountInfo as AccountInfoInterface, UserInfoResponse } from '@interfaces/UserInfo';
import {
    Box,
    Button,
    Card,
    Flex,
    HStack,
    Input,
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
import { NotifySettings } from './accountShared';

import { getErrorDescription } from './Config';

import { handle, getDisplayName, loadBatch, saveBatch, loadPopupFlag, loadPopupMaster, textFitPadding, safeSetItem, resetNotifyWatcherState, POPUP_MASTER_KEY, VIEW_MODE_KEY } from './accountShared';

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
        safeSetItem(POPUP_MASTER_KEY, popupResult ? 'true' : 'false');
    }, [popupResult]);

    // 批次名单随账号列表自动剔除失效项（依赖名单序列化：删一加一 length 不变也能触发）
    useEffect(() => {
        if (!userInfo) return;
        const names = new Set(userInfo.accounts?.map((acc) => acc.name) ?? []);
        setBatchAccounts((prev) => {
            const next = prev.filter((name) => names.has(name));
            return next.length === prev.length ? prev : next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userInfo?.accounts?.map((a) => a.name).join('\u0001')]);

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

    /** 批量目标解析（唯一实现）：勾选 > 自动批次 > 全体（排除 BATCH_RUNNER），忙碌切分+提示；无可执行目标时返回 null */
    const resolveTargets = (actionName: string): { free: string[]; targetDesc: string } | null => {
        const allNames = userInfo?.accounts?.map((acc) => acc.name).filter((n) => n !== 'BATCH_RUNNER') ?? [];
        const targetDesc = selectedAccounts.length > 0 ? '勾选账号' : batchAccounts.length > 0 ? '自动批次' : '全体账号';
        const targets = selectedAccounts.length > 0 ? selectedAccounts : batchAccounts.length > 0 ? batchAccounts : allNames;
        const free = targets.filter((name) => !busyRef.current.has(name));
        const busy = targets.filter((name) => busyRef.current.has(name));
        if (free.length === 0) {
            toaster.create({ type: 'warning', title: '请等待执行完毕', description: '所选账号都正在执行中' });
            return null;
        }
        if (busy.length > 0) {
            toaster.create({ type: 'info', title: `${actionName}：已跳过 ${busy.length} 个正在执行中的账号` });
        }
        return { free, targetDesc };
    };

    const handleCleanDailyAll = () => {
        const resolved = resolveTargets('清理日常');
        if (!resolved) return;
        for (const name of resolved.free) {
            const fn = handle.get(name);
            void fn?.();
        }
    };

    // 自定义功能按钮：目标=勾选的账号 > 自动批次（没勾选时） > 全体（批次也为空时）；忙碌账号跳过；危险功能先确认
    const handleQuickAction = async (btn: QuickActionItem) => {
        const resolved = resolveTargets(btn.name);
        if (!resolved) return;
        const free = resolved.free;
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
        const targetDesc = resolved.targetDesc;
        // 单账号 + 该账号开了弹结果：只弹详情窗，不叠汇总窗
        const singleDetail = free.length === 1 && loadPopupFlag(free[0]) && outcomes.get(free[0])?.ok && outcomes.get(free[0])?.res;
        if (popupResult && !singleDetail) {
            const rows: ResultSummaryRow[] = free.map((name) => {
                const o = outcomes.get(name);
                return { alias: name, name: getDisplayName(name), status: o?.ok ? '成功' : '失败', detail: o?.ok ? undefined : o?.detail };
            });
            NiceModal.show(ResultSummaryModal, { title: `${btn.name} · ${targetDesc}`, rows }).catch(() => {});
        }
        // 没开弹结果时才用 toast 反馈（弹窗本身就是反馈，不叠 toast）
        if (!popupResult) {
            toaster.create({
                type: fail > 0 ? 'warning' : 'success',
                title: `${btn.name} 执行完毕`,
                description: fail > 0 ? `成功 ${ok} / 失败 ${fail}，请在各账号详情的功能区里查看结果` : '请在各账号详情的功能区里查看结果',
            });
        }
        // 仅对单账号执行且该账号开了"弹结果"标记的，直接弹该账号的功能结果窗
        if (singleDetail) {
            const o = outcomes.get(free[0]);
            if (o?.res) {
                NiceModal.show(ResultInfoModal, { alias: free[0], title: btn.name, resultInfo: o.res }).catch(() => {});
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
            // 不弹提示：勾/取消勾是用户主动操作，结果按钮直接可见
            setQuickActions(items as QuickActionItem[]);
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
        // 全选集合排除 BATCH_RUNNER 虚拟账号：勾进去会在批量执行时直打后端
        const selectable = userInfo?.accounts?.map((acc) => acc.name).filter((n) => n !== 'BATCH_RUNNER') ?? [];
        if (selectedAccounts.length === selectable.length) {
            setSelectedAccounts([]);
        } else {
            setSelectedAccounts(selectable);
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
                resetNotifyWatcherState(); // 跨登录清理：下一个登录者不被旧警报记录吞通知
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
                        <NotifySettings />
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
                                    safeSetItem(VIEW_MODE_KEY, 'table');
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
                                    safeSetItem(VIEW_MODE_KEY, 'card');
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