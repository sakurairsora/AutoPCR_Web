import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import {
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
} from '../../components/ui/modal';
import { Checkbox } from '../../components/ui/checkbox';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAccount, getAccountConfig } from '@api/Account';
import { ModuleInfo } from '@interfaces/Module';
import { Skeleton } from '../../components/ui/skeleton';
import { toaster } from '../../components/ui/toaster';
import { QuickActionItem } from './quickActions';
import { getCachedAreaConfig, setCachedAreaConfig } from './Area';

interface QuickActionPickerProps {
    /** 参考账号：功能定义全服一致，取任意一个真实账号拉取 */
    alias: string;
    current: QuickActionItem[];
}

interface PickerGroup {
    areaKey: string;
    areaName: string;
    modules: { key: string; name: string; dangerous: boolean }[];
}

const QuickActionPicker = NiceModal.create(({ alias, current }: QuickActionPickerProps) => {
    const modal = useModal();
    const [groups, setGroups] = useState<PickerGroup[]>([]);
    const [selected, setSelected] = useState<Set<string>>(() => new Set(current.map((b) => b.key)));
    const [searchText, setSearchText] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // NiceModal hide 后组件不卸载：每次重新打开时把勾选/搜索复位到当前实况，而不是残留上次未保存的改动
    const lastVisibleRef = useRef(false);
    if (modal.visible && !lastVisibleRef.current) {
        setSelected(new Set(current.map((b) => b.key)));
        setSearchText('');
    }
    lastVisibleRef.current = modal.visible;

    useEffect(() => {
        if (!modal.visible || !alias) return;
        let isMounted = true;
        (async () => {
            setIsLoading(true);
            try {
                // 打开即校验：本地已存但后端已消失的功能在这里被自然排除
                const detail = await getAccount(alias);
                const areas = detail?.area || [];
                const built: PickerGroup[] = [];
                for (const area of areas) {
                    const cached = getCachedAreaConfig(alias, area.key);
                    const res = cached ?? (await getAccountConfig(alias, area.key));
                    if (!cached) setCachedAreaConfig(alias, area.key, res);
                    const mods = (res?.order || [])
                        .map((k) => res.info?.[k])
                        .filter((m): m is ModuleInfo => !!m && m.implemented && m.runnable)
                        .map((m) => ({ key: m.key, name: m.name, dangerous: area.name === '危险' }));
                    built.push({ areaKey: area.key, areaName: area.name, modules: mods });
                }
                if (isMounted) setGroups(built);
            } catch (err) {
                if (isMounted) {
                    toaster.create({ type: 'error', title: '获取功能列表失败', description: '请检查网络后重试' });
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        })();
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modal.visible, alias]);

    const q = searchText.trim().toLowerCase();
    const filtered = useMemo(
        () =>
            groups
                .map((g) => ({
                    ...g,
                    modules: q
                        ? g.modules.filter(
                              (m) => m.name.toLowerCase().includes(q) || m.key.toLowerCase().includes(q),
                          )
                        : g.modules,
                }))
                .filter((g) => g.modules.length > 0),
        [groups, q],
    );

    const toggle = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleGroup = (group: PickerGroup) => {
        const keys = group.modules.map((m) => m.key);
        const allIn = keys.every((k) => selected.has(k));
        setSelected((prev) => {
            const next = new Set(prev);
            keys.forEach((k) => (allIn ? next.delete(k) : next.add(k)));
            return next;
        });
    };

    const handleConfirm = () => {
        if (groups.length === 0) return; // 拉取失败时不允许确认，避免误清空全部按钮
        // 顺序=列表顺序（日常在前）；同 key 跨区服只保留首个，避免重复按钮
        const items: QuickActionItem[] = [];
        const seen = new Set<string>();
        groups.forEach((g) =>
            g.modules.forEach((m) => {
                if (selected.has(m.key) && !seen.has(m.key)) {
                    seen.add(m.key);
                    items.push({ key: m.key, name: m.name, areaKey: g.areaKey, areaName: g.areaName, dangerous: m.dangerous });
                }
            }),
        );
        // 后端已下线的功能：勾了也带不回来，单独提示（用户主动取消勾选不在此列，不提示）
        const vanished = [...selected].filter((k) => !seen.has(k));
        if (vanished.length > 0) {
            const named = groups.flatMap((g) => g.modules).filter((m) => vanished.includes(m.key)).map((m) => m.name);
            const extra = vanished.length - named.length;
            const suffix = extra > 0 ? ` 等 ${vanished.length} 个` : '';
            toaster.create({ type: 'warning', title: '部分功能已失效', description: `${named.join('、')}${suffix} 在后端已不存在，未能添加` });
        }
        modal.resolve(items);
        void modal.hide();
    };

    const handleClose = () => {
        modal.resolve(undefined);
        void modal.hide();
    };

    return (
        <Modal isOpen={modal.visible} onClose={handleClose} size="lg" closeOnOverlayClick={false}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>增加功能</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Input
                        placeholder="搜索功能名"
                        mb={3}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        autoFocus
                    />
                    <Box maxH="55vh" overflowY="auto" p={2} borderRadius="md" borderWidth="1px" borderColor="border" bg="bg.panel">
                        {isLoading && (
                            <Flex direction="column" gap={3} p={2}>
                                <Skeleton height="20px" width="60%" />
                                <Skeleton height="20px" width="80%" />
                                <Skeleton height="20px" width="70%" />
                            </Flex>
                        )}
                        {!isLoading &&
                            filtered.map((g) => {
                                const keys = g.modules.map((m) => m.key);
                                const inCount = keys.filter((k) => selected.has(k)).length;
                                return (
                                    <Box key={g.areaKey} mb={4}>
                                        <Flex align="center" justify="space-between" mb={1} px={1}>
                                            <Text fontSize="sm" fontWeight="bold" color={g.areaName === '危险' ? 'red.fg' : 'fg.muted'}>
                                                {g.areaName}
                                            </Text>
                                            <Checkbox
                                                size="sm"
                                                colorPalette="blue"
                                                checked={inCount === keys.length && keys.length > 0 ? true : inCount > 0 ? 'indeterminate' : false}
                                                onCheckedChange={() => toggleGroup(g)}
                                            >
                                                全选
                                            </Checkbox>
                                        </Flex>
                                        <Flex wrap="wrap" gap={2} px={1}>
                                            {g.modules.map((m) => (
                                                <Checkbox
                                                    key={m.key}
                                                    size="sm"
                                                    colorPalette={m.dangerous ? 'red' : 'blue'}
                                                    checked={selected.has(m.key)}
                                                    onCheckedChange={() => toggle(m.key)}
                                                >
                                                    {m.name}
                                                </Checkbox>
                                            ))}
                                        </Flex>
                                    </Box>
                                );
                            })}
                        {!isLoading && filtered.length === 0 && (
                            <Text color="fg.muted" fontSize="sm" py={4} textAlign="center">
                                无匹配功能
                            </Text>
                        )}
                    </Box>
                    <Text mt={2} fontSize="xs" color="fg.muted">
                        勾选后点确定，按钮会出现在主页工具栏中间；取消勾选即移除。
                    </Text>
                </ModalBody>
                <ModalFooter>
                    <Button colorPalette="blue" mr={3} onClick={handleConfirm} loading={isLoading} disabled={groups.length === 0}>
                        确定
                    </Button>
                    <Button variant="ghost" onClick={handleClose}>
                        取消
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
});

export default QuickActionPicker;
