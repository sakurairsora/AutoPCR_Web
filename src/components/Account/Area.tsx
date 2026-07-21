import { Box, Flex, IconButton, Popover, Stack, useDisclosure } from '@chakra-ui/react';
import { useEffect, useState } from 'react'

import { FiCompass } from 'react-icons/fi';
import Module from "./Module"
import { ConfigValue, ModuleResponse } from '@interfaces/Module';
import { Skeleton } from '../../components/ui/skeleton';
import Toc from "./Toc"
import { getAccountConfig } from '@api/Account'

interface AreaProps {
    alias: string,
    keys: string,
    areaName: string,
    showOnlyFav: boolean
}

export interface TocItem {
    name: string,
    id: string
}

export default function Area({ alias, keys: key, areaName, showOnlyFav }: AreaProps) {

    const [config, setConfig] = useState<ModuleResponse | null>(null);
    // 1. 增加 isFetching 状态，专门用来做切 Tab 的无感过渡
    const [isFetching, setIsFetching] = useState(false);
    const { open, onOpen, onClose } = useDisclosure();

    useEffect(() => {
        let isMounted = true;
        // 开启加载锁：旧内容立刻开始变暗
        setIsFetching(true);

        if (alias && key) {
            getAccountConfig(alias, key).then((res) => {
                if (!isMounted) return;

                const favKey = `autopcr_fav_${alias}`;
                const stored = localStorage.getItem(favKey);
                let finalRes = res;

                if (stored) {
                    try {
                        const favMap = JSON.parse(stored) as Record<string, string[]>;
                        const areaFavs = favMap[key] || [];
                        const mergedConfig = { ...res.config };
                        areaFavs.forEach(moduleKey => {
                            mergedConfig[`_fav_${moduleKey}`] = true;
                        });
                        finalRes = { ...res, config: mergedConfig };
                    } catch {
                        finalRes = res;
                    }
                }
                
                // 直接覆盖旧 config，不经过 null 状态
                setConfig(finalRes);
            }).catch((err) => {
                if (isMounted) console.log(err);
            }).finally(() => {
                if (isMounted) {
                    // 解锁：恢复亮度
                    setIsFetching(false);
                }
            });
        }

        return () => {
            isMounted = false;
        };
    }, [alias, key]);

    const handleConfigUpdate = (configKey: string, value: ConfigValue) => {
        setConfig(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                config: { ...prev.config, [configKey]: value }
            };
        });
    };

    // 根据 showOnlyFav 过滤模块列表
    const visibleModules = showOnlyFav
        ? config?.order.filter(moduleKey => config.config[`_fav_${moduleKey}`] === true) ?? []
        : config?.order ?? [];

    const tocList: TocItem[] = visibleModules
        .filter((moduleKey) => config?.info?.[moduleKey])
        .map((moduleKey) => ({
            name: config?.info[moduleKey]?.name || moduleKey,
            id: moduleKey
        }));

    // 只有第一次进页面、手头上彻底没有任何数据时，才展示骨架屏
    const isInitialLoading = !config && isFetching;

    return (
        <Box
            // 核心动画细节：
            // 1. 切换时 0.15s 迅速变暗（35% opacity）+ 轻微下沉 4px，给用户明确的"正在换页"反馈
            // 2. 数据到位后 0.15s 瞬间变亮并复位，全程旧组件垫底，无任何空白/闪烁
            opacity={isFetching && config ? 0.35 : 1}
            transform={isFetching && config ? "translateY(15px)" : "translateY(0)"}
            transition="opacity 0.15s ease-out, transform 0.15s ease-out"
            pointerEvents={isFetching ? 'none' : 'auto'} // 变暗期间禁止误触
            pb={20}
        >
            <Stack gap={4}>
                {isInitialLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Box key={i} p={6} borderWidth="1px" borderRadius="2xl" bg="bg.panel" shadow="sm">
                            <Skeleton height="30px" width="40%" mb={4} />
                            <Skeleton height="20px" width="100%" mb={2} />
                            <Skeleton height="20px" width="80%" mb={2} />
                            <Skeleton height="20px" width="90%" mb={6} />
                            <Skeleton height="40px" width="100%" />
                        </Box>
                    ))
                ) : (
                    visibleModules.map((module) => (
                        <Module 
                            key={module} 
                            id={module} 
                            alias={alias} 
                            areaKey={key} 
                            areaName={areaName} 
                            config={config?.config ?? {}} 
                            info={(config?.info[module])} 
                            isOpen={open} 
                            onOpen={onOpen} 
                            onClose={onClose} 
                            onConfigUpdate={handleConfigUpdate} 
                        />
                    ))
                )}
            </Stack>

            <Flex position="fixed"
                right="6"
                top="50%"
                transform="translateY(-50%)"
                justifyContent="center"
                alignItems="center"
                zIndex={100}
            >
                <Popover.Root lazyMount positioning={{ placement: 'left', gutter: 4 }}>
                    <Popover.Trigger>
                        <IconButton 
                            aria-label='TOC'
                            colorPalette="blue"
                            size="xl"
                            rounded="full"
                            shadow="xl"
                            transition="all 0.2s"
                            _hover={{ transform: "scale(1.1)", shadow: "2xl" }}
                        >
                            <FiCompass />
                        </IconButton>
                    </Popover.Trigger>
                    <Popover.Content width="auto" minW="200px">
                        <Toc maxH="60vh" tocList={tocList} />
                    </Popover.Content>
                </Popover.Root>
            </Flex>
        </Box>
    )
}
