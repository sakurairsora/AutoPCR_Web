/** 周期通知工具栏控件：开关勾选框 + 静音菜单（自持偏好状态） */

import { Box, Popover, Stack, Text } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { Checkbox } from '../../components/ui/checkbox';
import { loadNotifyPrefs, saveNotifyPrefs, NOTIFY_CANDIDATES } from './accountShared';
import type { NotifyPrefs } from './accountShared';

export default function NotifySettings() {
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
