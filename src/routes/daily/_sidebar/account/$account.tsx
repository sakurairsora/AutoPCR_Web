import { Box, Button, HStack, Tabs, Tag } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { FiActivity, FiCheck, FiStar, FiTarget, FiUserX } from 'react-icons/fi';
import NiceModal from '@ebay/nice-modal-react';

import { AccountResponse } from '@interfaces/Account';
import Area, { clearAreaConfigCache } from '@components/Account/Area';
import ConfigImportExport from '@components/Account/ConfigImportExport.tsx';
import Info from '@components/Account/Info';
import { createFileRoute } from '@tanstack/react-router';
import { getAccount, getAccountDailyResultList, postAccountAreaDaily } from '@api/Account';
import { POPUP_FLAG_KEY, loadPopupFlag, emitDailyFinished, textFitPadding } from '@components/Account/accountShared';
import { getErrorDescription } from '@components/Account/Config';
import { toaster } from '../../../../components/ui/toaster';
import { Checkbox } from '../../../../components/ui/checkbox';
import ResultInfoModal from '@components/Account/ResultInfoModal';

export const Route = createFileRoute('/daily/_sidebar/account/$account')({
    component: AccountComponent,
    loader: ({ params: { account } }) => getAccount(account),
    errorComponent: () => <div> Not Found </div>,
});

function AccountComponent() {
    const { account } = Route.useParams();
    const initialAccountInfo = Route.useLoaderData<AccountResponse>();
    const [accountInfo, setAccountInfo] = useState<AccountResponse>(initialAccountInfo);

    const hasCredentials =
        (initialAccountInfo?.username ?? '') !== '' && (initialAccountInfo?.password ?? '') !== '';
    const hasAreas = (initialAccountInfo?.area?.length ?? 0) > 0;
    const initialTab = hasCredentials && hasAreas ? '1' : '0';

    const [activeTab, setActiveTab] = useState<string>(initialTab);
    const [favOnlyMap, setFavOnlyMap] = useState<Record<string, boolean>>({});
    const [cleanLoading, setCleanLoading] = useState(false);

    const [cleanStatus, setCleanStatus] = useState<string>(
        () => (initialAccountInfo as any)?.daily_clean_time?.status || '',
    );

    const [displayName, setDisplayName] = useState(
        () => localStorage.getItem(`autopcr_displayName_${account}`) || account,
    );

    // 「弹结果」：本账号执行完自动弹出结果窗（本地存储，按账号记忆）
    const [popupOn, setPopupOn] = useState<boolean>(() => loadPopupFlag(account));

    const statusMeta = useMemo(() => {
        if (cleanStatus === '成功' || cleanStatus === '跳过') {
            return {
                color: 'green' as const,
                icon: <FiCheck />,
                label: cleanStatus === '跳过' ? '跳过' : '完成',
            };
        }
        if (cleanStatus === '警告' || cleanStatus === '中止') {
            return { color: 'orange' as const, icon: <FiActivity />, label: cleanStatus };
        }
        if (cleanStatus === '错误') {
            return { color: 'red' as const, icon: <FiUserX />, label: '错误' };
        }
        if (cleanStatus) {
            return { color: 'gray' as const, icon: <FiActivity />, label: cleanStatus };
        }
        return null;
    }, [cleanStatus]);

    const refreshAccountData = async () => {
        try {
            const freshData = await getAccount(account);
            setAccountInfo(freshData);
            setDisplayName(localStorage.getItem(`autopcr_displayName_${account}`) || account);
            const st = (freshData as any)?.daily_clean_time?.status;
            if (st) setCleanStatus(st);
        } catch (e) {
            console.error(e);
        }
    };

    const handleImportSuccess = async () => {
        clearAreaConfigCache(accountInfo?.alias || account);
        await refreshAccountData();
    };

    // 切换账号（含浏览器后退/前进）时整体重置；刷新 accountInfo 不要把用户正在看的 Tab 打回初始
    useEffect(() => {
        setAccountInfo(initialAccountInfo);
        setActiveTab(initialTab);
        setDisplayName(localStorage.getItem(`autopcr_displayName_${account}`) || account);
        setCleanStatus((initialAccountInfo as any)?.daily_clean_time?.status || '');
        setFavOnlyMap({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account]);

    useEffect(() => {
        setDisplayName(localStorage.getItem(`autopcr_displayName_${account}`) || account);
        const st = (initialAccountInfo as any)?.daily_clean_time?.status;
        if (st) setCleanStatus(st);
    }, [initialAccountInfo, account]);

    // 离开本账号详情时清缓存
    useEffect(() => {
        const alias = account;
        return () => {
            clearAreaConfigCache(alias);
        };
    }, [account]);

    const currentArea =
        activeTab !== '0' && accountInfo?.area
            ? accountInfo.area[Number(activeTab) - 1]
            : null;
    const isCurrentTabFavOnly = currentArea ? !!favOnlyMap[currentArea.key] : false;

    const handleToggleCurrentFavOnly = () => {
        if (!currentArea?.key) return;
        setFavOnlyMap((prev) => ({ ...prev, [currentArea.key]: !prev[currentArea.key] }));
    };

    const handleCleanDaily = async () => {
        const a = accountInfo?.alias || account;
        const nameForUi =
            localStorage.getItem(`autopcr_displayName_${a}`) || displayName || a;

        setCleanLoading(true);
        setCleanStatus('');
        toaster.create({ type: 'info', title: `开始为${nameForUi}清理日常...` });

        try {
            const res = await postAccountAreaDaily(a);
            void emitDailyFinished(a);
            const st =
                (res as any)?.daily_clean_time?.status ||
                (res as any)?.status ||
                '';

            setCleanStatus(st);
            sessionStorage.setItem('autopcr_need_refresh_dashboard', '1');
            await refreshAccountData();

            if (st === '错误') {
                toaster.create({ type: 'error', title: `${nameForUi}清日常结束` });
            } else if (st === '警告' || st === '中止') {
                toaster.create({ type: 'warning', title: `${nameForUi}清日常完成(${st})` });
            } else {
                toaster.create({ type: 'success', title: `${nameForUi}清日常成功` });
            }
            if (popupOn) {
                getAccountDailyResultList(a)
                    .then((resList) => {
                        return NiceModal.show(ResultInfoModal, { alias: a, title: '日常', resultInfo: resList });
                    })
                    .catch(() => {
                        return;
                    });
            }
        } catch (err: any) {
            setCleanStatus('错误');
            toaster.create({
                type: 'error',
                title: `${nameForUi}清日常失败`,
                description: await getErrorDescription(err),
            });
        } finally {
            setCleanLoading(false);
        }
    };

    return (
        <Tabs.Root
            lazyMount
            unmountOnExit
            variant="plain"
            value={activeTab}
            onValueChange={(d) => setActiveTab(d.value)}
            display="flex"
            flexDirection="column"
            height="100%"
        >
            <Tabs.List
                bg="bg.panel"
                p={1}
                borderRadius="xl"
                shadow="sm"
                borderWidth="1px"
                borderColor="border.subtle"
                mb={4}
                overflowX="auto"
                gap={1}
                alignItems="center"
            >
                <Tabs.Trigger
                    value="0"
                    px={4}
                    py={1.5}
                    rounded="lg"
                    fontWeight="semibold"
                    _selected={{ bg: 'blue.solid', color: 'white', shadow: 'md' }}
                    _hover={{ bg: 'bg.subtle', _selected: { bg: 'blue.solid', color: 'white' } }}
                >
                    {displayName}
                </Tabs.Trigger>

                <Box width="1px" height="1em" alignSelf="center" bg="border.muted" mx={1} />

                {accountInfo?.area?.map((area, index) => (
                    <Tabs.Trigger
                        key={area?.key}
                        value={String(index + 1)}
                        px={3}
                        py={1.5}
                        rounded="lg"
                        fontWeight="medium"
                        color="fg.muted"
                        _selected={{
                            bg: 'bg.subtle',
                            color: 'blue.600',
                            fontWeight: 'bold',
                            shadow: 'sm',
                        }}
                        _hover={{ bg: 'bg.subtle', color: 'fg' }}
                    >
                        {area?.name}
                    </Tabs.Trigger>
                ))}

                {activeTab !== '0' && (
                    <HStack alignItems="center" pr={2} gap={2}>
                        <Box w="1px" h="1.25rem" bg="black" mx={1} alignSelf="center" />
                        <Button
                            size="sm"
                            variant={isCurrentTabFavOnly ? 'solid' : 'ghost'}
                            colorPalette={isCurrentTabFavOnly ? 'yellow' : 'gray'}
                            onClick={handleToggleCurrentFavOnly}
                            px={textFitPadding(isCurrentTabFavOnly ? '显示全部' : '只显示收藏')}
                            type="button"
                        >
                            {isCurrentTabFavOnly ? (
                                <><FiStar fill="currentColor" /> 显示全部</>
                            ) : (
                                <><FiStar /> 只显示收藏</>
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            colorPalette="orange"
                            onClick={() => void handleCleanDaily()}
                            loading={cleanLoading}
                            px={textFitPadding('清理全部日常')}
                            type="button"
                        >
                            <FiTarget /> 清理全部日常
                        </Button>
                        <Checkbox
                            checked={popupOn}
                            onCheckedChange={(details) => {
                                const next = !!details.checked;
                                setPopupOn(next);
                                localStorage.setItem(POPUP_FLAG_KEY(account), next ? 'true' : 'false');
                            }}
                            colorPalette="blue"
                            size="md"
                            title="开启后，本账号清理完日常自动弹出结果窗"
                        >
                            弹结果
                        </Checkbox>
                        {statusMeta && (
                            <Tag.Root size="sm" colorPalette={statusMeta.color} variant="subtle">
                                <Tag.StartElement>{statusMeta.icon}</Tag.StartElement>
                                <Tag.Label>{statusMeta.label}</Tag.Label>
                            </Tag.Root>
                        )}
                    </HStack>
                )}
            </Tabs.List>

            <Box flex={1} overflow="auto">
                <Tabs.Content value="0">
                    <Info accountInfo={accountInfo} onSaveSuccess={refreshAccountData} />
                    <ConfigImportExport
                        alias={accountInfo?.alias}
                        areas={accountInfo?.area}
                        onImportSuccess={handleImportSuccess}
                    />
                </Tabs.Content>

                {accountInfo?.area?.map((area, index) => (
                    <Tabs.Content key={area?.key} value={String(index + 1)}>
                        <Area
                            alias={accountInfo?.alias}
                            keys={area?.key}
                            areaName={area?.name}
                            showOnlyFav={!!favOnlyMap[area?.key]}
                        />
                    </Tabs.Content>
                ))}
            </Box>
        </Tabs.Root>
    );
}
