import { AccountInfo as AccountInfoInterface } from '@interfaces/UserInfo';
import { Box, Card, Flex, HStack, Input, Spinner, Table, Tag, Text, useDisclosure } from '@chakra-ui/react';
import { FiActivity, FiCheck, FiCopy, FiTarget, FiUpload, FiUserX, FiX } from 'react-icons/fi';
import React, { ChangeEvent, useRef } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route as DashBoardRoute } from '@routes/daily/_sidebar/account/index';
import Alert from '../alert';
import { AxiosError } from 'axios';
import { Checkbox } from '../../components/ui/checkbox';
import { IconButton } from '../../components/ui/icon-button';
import { Tooltip } from '../../components/ui/tooltip';
import NiceModal from '@ebay/nice-modal-react';
import ResultInfoModal from './ResultInfoModal';
import { toaster } from '../../components/ui/toaster';
import { delAccount, getAccount, getAccountConfig, getAccountDailyResultList, postAccountAreaDaily, putAccountConfigs } from '@api/Account';
import { getErrorDescription } from './Config';
import { handle, DISPLAY_NAME_KEY, getDisplayName } from './accountShared';
import type { Candidate, ConfigType, ConfigValue, ModuleResponse } from '@interfaces/Module';
interface AccountInfoProps {
    account: AccountInfoInterface;
    onToggle: () => void;
    increaseCount: () => void;
    decreaseCount: () => void;
    updateAccountInfo: (updatedAccount: AccountInfoInterface) => void;
    isTableView?: boolean;
    isSelected?: boolean;
    onToggleSelect?: () => void;
    /** 自动批次（多"默认账号"）名单：成员卡片显示"默认"标 */
    batchAccounts?: string[];
    onOpenSyncConfig?: (alias: string) => void;
    /** 该账号是否有动作正在执行（转圈=忙，其他动作不可对其生效） */
    isBusy?: boolean;
    onBusyChange?: (alias: string, busy: boolean) => void;
    getOccupiedNames: (selfAlias: string) => Set<string>;
}

export function AccountInfo({
    account,
    onToggle,
    increaseCount,
    decreaseCount,
    updateAccountInfo,
    isTableView = false,
    isSelected = false,
    onToggleSelect,
    batchAccounts = [],
    onOpenSyncConfig,
    isBusy,
    onBusyChange,
    getOccupiedNames,
}: AccountInfoProps) {
    const buttomLoading = useDisclosure();
    const alias = account.name;
    const deleteConfirm = useDisclosure();
    const navigate = useNavigate();
    const importFileRef = useRef<HTMLInputElement>(null);
    const cancelRef = React.useRef<HTMLButtonElement>(null);

    const [isEditingName, setIsEditingName] = useState(false);
    const [displayName, setDisplayName] = useState(() => getDisplayName(alias));
    const [nameDraft, setNameDraft] = useState(displayName);
    const composingRef = useRef(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    // 批量清理的提示文案要在按下那一刻取最新显示名；登记只看账号原名
    const displayNameRef = useRef(displayName);
    displayNameRef.current = displayName;
    // 忙碌状态与登记回调经 ref 取最新值，避免闭包过期
    const busyRef = useRef(isBusy);
    busyRef.current = isBusy;
    const onBusyRef = useRef(onBusyChange);
    onBusyRef.current = onBusyChange;

    const clean = account.daily_clean_time;
    const cleanStatus = clean?.status || '未知';
    const cleanTime = clean?.time || '';

    const statusMeta =
        cleanStatus === '成功' || cleanStatus === '跳过'
            ? { color: 'green' as const, icon: <FiCheck />, label: cleanStatus === '跳过' ? '跳过' : '完成' }
            : cleanStatus === '警告' || cleanStatus === '中止'
              ? { color: 'orange' as const, icon: <FiActivity />, label: cleanStatus }
              : cleanStatus === '错误'
                ? { color: 'red' as const, icon: <FiUserX />, label: '错误' }
                : { color: 'gray' as const, icon: <FiActivity />, label: cleanStatus };

    useEffect(() => {
        const latest = getDisplayName(alias);
        setDisplayName(latest);
        if (!isEditingName) setNameDraft(latest);
    }, [alias, isEditingName]);

    const handleCleanDaily = async () => {
        if (busyRef.current) {
            toaster.create({ type: 'warning', title: '该账号正在执行中，请等待执行完毕' });
            return;
        }
        buttomLoading.onOpen();
        onBusyRef.current?.(alias, true);
        increaseCount();
        const nameForUi = displayNameRef.current || alias;
        toaster.create({ type: 'info', title: `开始为${nameForUi}清理日常...` });
        try {
            const res = await postAccountAreaDaily(alias);
            updateAccountInfo(res);

            const st = res?.daily_clean_time?.status || '';
            if (st === '错误') {
                toaster.create({ type: 'error', title: `${nameForUi}清日常结束`, description: st });
            } else if (st === '警告' || st === '中止') {
                toaster.create({ type: 'warning', title: `${nameForUi}清日常完成(${st})`, description: st });
            } else if (st === '成功' || st === '跳过') {
                toaster.create({ type: 'success', title: `${nameForUi}清日常成功` });
            } else {
                toaster.create({ type: 'success', title: `${nameForUi}清日常完成`, description: st || undefined });
            }
        } catch (err: any) {
            toaster.create({
                type: 'error',
                title: `${nameForUi}清日常失败`,
                description: await getErrorDescription(err),
            });
        } finally {
            buttomLoading.onClose();
            onBusyRef.current?.(alias, false);
            decreaseCount();
        }
    };

    // 批量清理用：只按账号原名注册（显示名仅用于提示文案，经 ref 取最新值），卸载时删掉
    useEffect(() => {
        handle.set(alias, handleCleanDaily as any);
        return () => {
            handle.delete(alias);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alias]);

    const handleDeleteAccount = () => {
        delAccount(alias)
            .then((res) => {
                toaster.create({ type: 'success', title: '删除账号成功', description: res });
                onToggle();
            })
            .catch(async (err: AxiosError) => {
                toaster.create({
                    type: 'error',
                    title: '删除账号失败',
                    description: await getErrorDescription(err),
                });
            });
    };

    const handleDailyResult = () => {
        toaster.create({ type: 'info', title: `正在获取${alias}的日常结果...` });
        getAccountDailyResultList(alias)
            .then(async (res) => {
                toaster.create({ type: 'success', title: '获取日常结果成功' });
                await NiceModal.show(ResultInfoModal, { alias: alias, title: '日常', resultInfo: res });
            })
            .catch(async (err: AxiosError) => {
                toaster.create({
                    type: 'error',
                    title: '获取日常结果失败',
                    description: await getErrorDescription(err),
                });
            });
    };

    const goDetail = () => {
        void navigate({ to: `${DashBoardRoute.to || ''}${alias}` as any });
    };


    useEffect(() => {
        if (isEditingName) {
            // autoFocus 只在挂载时生效；编辑态切换时手动 focus
            const t = window.setTimeout(() => nameInputRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
    }, [isEditingName]);

    const commitDisplayName = () => {
        const next = nameDraft.trim();
        // 空名 / 等于真实 alias：恢复为 alias
        if (!next || next === alias) {
            localStorage.removeItem(DISPLAY_NAME_KEY(alias));
            setDisplayName(alias);
            setNameDraft(alias);
            setIsEditingName(false);
            return;
        }
        const occupied = getOccupiedNames(alias);
        if (occupied.has(next) && next !== displayName) {
            toaster.create({
                type: 'error',
                title: '显示名冲突',
                description: `「${next}」已被其他账号使用`,
            });
            setNameDraft(displayName);
            setIsEditingName(false);
            return;
        }
        localStorage.setItem(DISPLAY_NAME_KEY(alias), next);
        setDisplayName(next);
        setIsEditingName(false);
    };

    // 始终同一 Input：可编辑区域与名字位置重合
    const nameInput = (
        <Input
            ref={nameInputRef}
            size="sm"
            value={isEditingName ? nameDraft : displayName}
            readOnly={!isEditingName}
            variant={isEditingName ? 'outline' : 'flushed'}
            onClick={(e) => {
                e.stopPropagation();
                if (!isEditingName) {
                    setNameDraft(displayName);
                    setIsEditingName(true);
                }
            }}
            onChange={(e) => {
                if (!isEditingName) return;
                setNameDraft(e.target.value);
            }}
            onCompositionStart={() => {
                composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
                composingRef.current = false;
                setNameDraft((e.target as HTMLInputElement).value);
                // 组词中途点到别处：compositionend 时可能已失焦，补一次提交，避免卡在编辑态
                const el = e.target as HTMLInputElement;
                window.setTimeout(() => {
                    if (document.activeElement !== el) {
                        commitDisplayName();
                    }
                }, 0);
            }}
            onBlur={() => {
                if (!isEditingName) return;
                if (composingRef.current) {
                    // 组词中 blur：等 composition 结束后由上面的 timeout 处理；再兜底一次
                    window.setTimeout(() => {
                        if (!composingRef.current) {
                            commitDisplayName();
                        }
                    }, 0);
                    return;
                }
                commitDisplayName();
            }}
            onKeyDown={(e) => {
                if (!isEditingName || composingRef.current) return;
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                    setNameDraft(displayName);
                    setIsEditingName(false);
                }
            }}
            fontWeight="bold"
            maxW="12em"
            minW="4em"
            h="2em"
            px={isEditingName ? 2 : 0}
            lineHeight="1"
            cursor="text"
            title={isEditingName ? undefined : '点击修改显示名称'}
            _hover={!isEditingName ? { color: 'blue.fg' } : undefined}
            borderColor={isEditingName ? undefined : 'transparent'}
            boxShadow={isEditingName ? undefined : 'none'}
        />
    );

    const toCheckedConfigItem = (
        type: ConfigType,
        candidates: Candidate[],
        value: unknown,
    ): ConfigValue | undefined => {
        switch (type) {
            case 'bool':
            case 'single':
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    return value as ConfigValue;
                }
                break;
            case 'int':
                if (typeof value === 'number') return value;
                break;
            case 'text':
                if (typeof value === 'string') return value;
                break;
            case 'time':
                if (typeof value === 'string' && value.match(/^\d{2}:\d{2}$/) !== null) return value;
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
    };

    const realImportByModule = (
        module: ModuleResponse,
        configs: Record<string, ConfigValue>,
    ): Record<string, ConfigValue> => {
        const uploadConfig: Record<string, ConfigValue> = {};
        for (const moduleKey in module.info) {
            if (configs[moduleKey] !== undefined && typeof configs[moduleKey] === 'boolean') {
                uploadConfig[moduleKey] = configs[moduleKey];
            }
            const moduleConf = module.info[moduleKey].config;
            for (const moduleConfKey in moduleConf) {
                const moduleItem = moduleConf[moduleConfKey];
                const confItem = toCheckedConfigItem(
                    moduleItem.config_type,
                    moduleItem.candidates,
                    configs[moduleConfKey],
                );
                if (confItem !== undefined) {
                    uploadConfig[moduleConfKey] = confItem;
                }
            }
        }
        return uploadConfig;
    };

    const handleImportConfigFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        buttomLoading.onOpen();
        try {
            const rawCfg = await file.text();
            let configs: Record<string, Record<string, ConfigValue>>;
            try {
                configs = JSON.parse(decodeURIComponent(atob(rawCfg.trim()))) as Record<
                    string,
                    Record<string, ConfigValue>
                >;
            } catch {
                throw new Error('配置文件格式无效，请检查选取的配置文件。');
            }

            const accountDetail = await getAccount(alias);
            const areas = accountDetail?.area || [];
            if (!areas.length) {
                throw new Error('该账号暂无可用区服，无法导入配置');
            }

            const configItems = await Promise.all(
                areas.map((area: { key: string }) => getAccountConfig(alias, area.key)),
            );
            const uploadConfig: Record<string, ConfigValue> = {};
            const importedFav: Record<string, string[]> = {};

            configItems.forEach((value, index) => {
                const areaKey = areas[index].key;
                const areaConfig = configs[areaKey];
                if (!areaConfig) return;

                Object.assign(uploadConfig, realImportByModule(value, areaConfig));

                for (const key in areaConfig) {
                    if (key.startsWith('_fav_')) {
                        importedFav[areaKey] = importedFav[areaKey] || [];
                        if (areaConfig[key] === true) {
                            importedFav[areaKey].push(key.slice(5));
                        }
                    } else if (uploadConfig[key] === undefined && areaConfig[key] !== undefined) {
                        uploadConfig[key] = areaConfig[key];
                    }
                }
            });

            if (Object.keys(uploadConfig).length === 0) {
                throw new Error('文件中没有可用配置，未做任何修改。');
            }
            await putAccountConfigs(alias, uploadConfig);
            // 全部成功后才写收藏，避免半导入状态
            localStorage.setItem(`autopcr_fav_${alias}`, JSON.stringify(importedFav));
            toaster.create({ type: 'success', title: '配置导入成功' });
            onToggle();
        } catch (err) {
            if (err instanceof AxiosError) {
                toaster.create({
                    type: 'error',
                    title: '配置导入失败',
                    description: await getErrorDescription(err),
                });
            } else {
                toaster.create({
                    type: 'error',
                    title: '配置导入失败',
                    description: (err as Error).message,
                });
            }
        } finally {
            buttomLoading.onClose();
        }
    };

    // 函数渲染，不要内嵌组件（否则每帧新类型，按钮整卸整挂）
    const renderActionButtons = (
        size: 'xs' | 'sm' | 'md' = 'xs',
        flexMode = false,
    ) => (
        <HStack
            gap={flexMode ? 0 : 1}
            w={flexMode ? 'full' : undefined}
            justify={flexMode ? 'space-between' : undefined}
            align="center"
            onClick={(e) => e.stopPropagation()}
        >
            <input
                ref={importFileRef}
                type="file"
                accept=".autopcrcfg"
                style={{ display: 'none' }}
                onChange={handleImportConfigFile}
            />

            <Tooltip content="立刻清理" openDelay={0} closeDelay={0}>
                <IconButton
                    aria-label="Clean Daily"
                    size={size}
                    flex={flexMode ? '1' : undefined}
                    variant="ghost"
                    colorPalette="orange"
                    onClick={handleCleanDaily}
                    loading={buttomLoading.open}
                >
                    <FiTarget />
                </IconButton>
            </Tooltip>

            <Tooltip content="导入配置" openDelay={0} closeDelay={0}>
                <IconButton
                    aria-label="Import Config"
                    size={size}
                    flex={flexMode ? '1' : undefined}
                    variant="ghost"
                    colorPalette="blue"
                    onClick={() => importFileRef.current?.click()}
                    loading={buttomLoading.open}
                >
                    <FiUpload />
                </IconButton>
            </Tooltip>

            <Tooltip content="同步配置" openDelay={0} closeDelay={0}>
                <IconButton
                    aria-label="Sync Config"
                    size={size}
                    flex={flexMode ? '1' : undefined}
                    variant="ghost"
                    colorPalette="teal"
                    onClick={() => onOpenSyncConfig && onOpenSyncConfig(alias)}
                    loading={buttomLoading.open}
                >
                    <FiCopy />
                </IconButton>
            </Tooltip>

            <Tooltip content="运行结果" openDelay={0} closeDelay={0}>
                <IconButton
                    aria-label="View Results"
                    size={size}
                    flex={flexMode ? '1' : undefined}
                    variant="ghost"
                    colorPalette="green"
                    onClick={handleDailyResult}
                    loading={buttomLoading.open}
                >
                    <FiActivity />
                </IconButton>
            </Tooltip>
        </HStack>
    );

    if (isTableView) {
        return (
            <Table.Row key={alias} bg="bg.panel" _hover={{ bg: 'bg.muted' }}>
                <Table.Cell px={2} py={3} width="56px" onClick={(e) => e.stopPropagation()}>
                    <Flex align="center" justify="center" minH="2.75em" px={1} py={1}>
                        <Checkbox
                            checked={isSelected}
                            onCheckedChange={onToggleSelect}
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
                    </Flex>
                </Table.Cell>

                <Table.Cell px={2} py={3}>
                    <Flex
                        align="center"
                        gap={2}
                        minW={0}
                        w="full"
                        cursor="pointer"
                        onClick={goDetail}
                        title="进入详细设置"
                    >
                        {/* ✅ 补回内层 Flex 容器；曾用名 minW 保底，标签不挤占省略空间 */}
                        <Flex align="center" gap={1} minW={0} flex="1" lineHeight="1">
                            <Flex
                                boxSize="2em"
                                flexShrink={0}
                                bg="blue.subtle"
                                color="blue.fg"
                                borderRadius="full"
                                align="center"
                                justify="center"
                                fontSize="sm"
                                lineHeight="1"
                            >
                                {displayName.charAt(0).toUpperCase()}
                            </Flex>

                            <Box
                                onClick={(e) => e.stopPropagation()}
                                display="flex"
                                alignItems="center"
                                lineHeight="1"
                                fontSize="sm"
                                flexShrink={1}
                                minW={0}
                                maxW={displayName !== alias ? '42%' : '70%'}
                            >
                                {nameInput}
                            </Box>

                            {displayName !== alias && (
                                <Text
                                    as="span"
                                    fontSize="xs"
                                    color="fg.muted"
                                    whiteSpace="nowrap"
                                    lineHeight="1"
                                    flex="1 1 4.5em"
                                    minW="4.5em"
                                    overflow="hidden"
                                    textOverflow="ellipsis"
                                    title={alias}
                                >
                                    {alias}
                                </Text>
                            )}

                            {/* 标签单独一组 flexShrink=0，避免反噬曾用名 */}
                            <Flex align="center" gap={1} flexShrink={0}>
                                {batchAccounts.includes(account.name) && (
                                    <Tag.Root size="sm" p={0.5} colorPalette="purple" variant="solid" flexShrink={0}>
                                        <Tag.Label fontSize="2xs" lineHeight="1">默认</Tag.Label>
                                    </Tag.Root>
                                )}
                                {account.clan_forbid && (
                                    <Tag.Root size="sm" colorPalette="red" variant="solid" flexShrink={0}>
                                        <Tag.Label fontSize="2xs" lineHeight="1">公会战禁用</Tag.Label>
                                    </Tag.Root>
                                )}
                            </Flex>
                        </Flex>

                        <Box flexShrink={0} onClick={(e) => e.stopPropagation()}>
                            <Alert
                                leastDestructiveRef={cancelRef}
                                isOpen={deleteConfirm.open}
                                onClose={deleteConfirm.onClose}
                                title="删除账号"
                                body={`确定删除账号${alias}吗？`}
                                onConfirm={handleDeleteAccount}
                            >
                                {' '}
                            </Alert>
                            {/* 热区略小、叉图形略大 */}
                            <IconButton
                                aria-label="Delete"
                                size="xs"
                                variant="ghost"
                                colorPalette="gray"
                                title="删除账号"
                                minW="1.5rem"
                                h="1.5rem"
                                p={0}
                                fontSize="1.25rem"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteConfirm.onOpen();
                                }}
                                _hover={{ bg: 'red.subtle', color: 'red.fg' }}
                            >
                                <FiX size={18} strokeWidth={2.5} />
                            </IconButton>
                        </Box>
                    </Flex>
                </Table.Cell>

                {/* 表格状态列：保持可进详情（仅卡片状态区做安全点击区） */}
                <Table.Cell
                    px={3}
                    py={3}
                    cursor="pointer"
                    onClick={goDetail}
                    title="进入详细设置"
                >
                    <Flex align="center" gap={2} minW={0}>
                        {isBusy ? (
                            <Tag.Root colorPalette="blue" variant="subtle" flexShrink={0}>
                                <Tag.StartElement css={{ boxSize: 'auto', ms: 0, display: 'flex', alignItems: 'center' }}>
                                    <Spinner size="xs" />
                                </Tag.StartElement>
                                <Tag.Label>执行中</Tag.Label>
                            </Tag.Root>
                        ) : (
                            <Tag.Root colorPalette={statusMeta.color} variant="subtle" flexShrink={0}>
                                <Tag.StartElement>{statusMeta.icon}</Tag.StartElement>
                                <Tag.Label>
                                    {statusMeta.label}
                                    {cleanTime ? ` ${cleanTime}` : ''}
                                </Tag.Label>
                            </Tag.Root>
                        )}
                    </Flex>
                </Table.Cell>

                <Table.Cell
                    px={3}
                    py={3}
                    cursor="pointer"
                    onClick={goDetail}
                    title="进入详细设置"
                >
                    {renderActionButtons('xs')}
                </Table.Cell>
            </Table.Row>
        );
    }

    return (
        <Card.Root
            key={alias}
            bg="bg.panel"
            shadow="sm"
            borderRadius="2xl"
            borderWidth="1px"
            borderColor={isSelected ? 'blue.focusRing' : 'border.subtle'}
            transition="all 0.2s"
            overflow="hidden"
            cursor="pointer"
            onClick={goDetail}
            /* 不要在 Root 上挂 title：会继承到选框/删除/状态，悬停误提示「进入详细设置」 */
            _hover={{ shadow: 'lg', transform: 'translateY(-2px)', borderColor: 'blue.focusRing' }}
        >
            {/* 整卡 onClick 进详情；Header/状态/按钮区内控件自行 stopPropagation */}
            <Card.Header px={4} pt={3} pb={3} minH="2.75em" title="进入详细设置">
                {/* 整 Header 随卡片进详情；仅选框/改名/删除 stopPropagation */}
                <Flex align="center" gap={2} minH="2.25em">
                    <Box
                        onClick={(e) => e.stopPropagation()}
                        flexShrink={0}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        title="选择账号"
                        cursor="default"
                    >
                        <Checkbox
                            checked={isSelected}
                            onCheckedChange={onToggleSelect}
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
                    </Box>

                    <Flex align="center" gap={2} minW={0} flex="1" overflow="hidden">
                        <Box
                            onClick={(e) => e.stopPropagation()}
                            display="flex"
                            alignItems="center"
                            lineHeight="1"
                            fontSize="lg"
                            flex="1 1 6em"
                            minW="4em"
                            maxW={displayName !== alias ? '52%' : '75%'}
                            overflow="hidden"
                            title="点击修改显示名称"
                            cursor="default"
                        >
                            {nameInput}
                        </Box>

                        {displayName !== alias && (
                            <Text
                                as="span"
                                fontSize="xs"
                                color="fg.muted"
                                whiteSpace="nowrap"
                                overflow="hidden"
                                textOverflow="ellipsis"
                                flex="1 1 4em"
                                minW="3em"
                                maxW="32%"
                                lineHeight="1"
                                title={alias}
                            >
                                {alias}
                            </Text>
                        )}

                        <Flex align="center" gap={1} flexShrink={0} minW={0}>
                            {batchAccounts.includes(account.name) && (
                                <Tag.Root size="sm" p={0.5} colorPalette="purple" variant="solid" flexShrink={0}>
                                    <Tag.Label fontSize="2xs" lineHeight="1" whiteSpace="nowrap">默认</Tag.Label>
                                </Tag.Root>
                            )}
                            {account.clan_forbid && (
                                <Tag.Root size="sm" p={0.5} colorPalette="red" variant="subtle" flexShrink={0}>
                                    <Tag.Label fontSize="2xs" lineHeight="1" whiteSpace="nowrap">禁用</Tag.Label>
                                </Tag.Root>
                            )}
                        </Flex>
                    </Flex>

                    <Box
                        onClick={(e) => e.stopPropagation()}
                        flexShrink={0}
                        title="删除账号"
                        cursor="default"
                    >
                        <Alert
                            leastDestructiveRef={cancelRef}
                            isOpen={deleteConfirm.open}
                            onClose={deleteConfirm.onClose}
                            title="删除账号"
                            body={`确定删除账号${displayName || alias}吗？`}
                            onConfirm={handleDeleteAccount}
                        >
                            {' '}
                        </Alert>
                        <IconButton
                            size="xs"
                            variant="ghost"
                            colorPalette="gray"
                            aria-label="Delete"
                            title="删除账号"
                            minW="1.5rem"
                            w="1.5rem"
                            h="1.5rem"
                            p={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteConfirm.onOpen();
                            }}
                            _hover={{ bg: 'red.subtle', color: 'red.fg' }}
                            css={{
                                '& svg': {
                                    width: '1.4em',
                                    height: '1.4em',
                                    strokeWidth: 2.5,
                                },
                            }}
                        >
                            <FiX />
                        </IconButton>
                    </Box>
                </Flex>
            </Card.Header>

            {/* 整卡任意位置点击都进详情（含运行状态区） */}
            <Card.Body px={4} py={2} title="进入详细设置" cursor="pointer">
                <Box
                    bg="bg.subtle"
                    p={2}
                    borderRadius="lg"
                >
                    <Flex justify="space-between" align="center" mb={1} gap={2}>
                        <Text fontSize="xs" color="fg.muted">
                            上次运行
                        </Text>
                        <Text fontSize="xs" fontWeight="bold">
                            {cleanTime || '—'}
                        </Text>
                    </Flex>
                    <Flex justify="space-between" align="center" gap={2}>
                        <Text fontSize="xs" color="fg.muted" flexShrink={0}>
                            状态
                        </Text>
                        {isBusy ? (
                            <Tag.Root size="sm" colorPalette="blue" flexShrink={0}>
                                <Tag.StartElement css={{ boxSize: 'auto', ms: 0, display: 'flex', alignItems: 'center' }}>
                                    <Spinner size="xs" />
                                </Tag.StartElement>
                                <Tag.Label>执行中</Tag.Label>
                            </Tag.Root>
                        ) : (
                            <Tag.Root size="sm" colorPalette={statusMeta.color} flexShrink={0}>
                                <Tag.StartElement>{statusMeta.icon}</Tag.StartElement>
                                <Tag.Label>{cleanStatus}</Tag.Label>
                            </Tag.Root>
                        )}
                    </Flex>
                </Box>
            </Card.Body>

            <Card.Footer px={4} pt={2} pb={3} title="进入详细设置">
                {renderActionButtons('md', true)}
            </Card.Footer>
        </Card.Root>
    );
}
