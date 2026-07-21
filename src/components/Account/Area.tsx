import { Box, Flex, IconButton, Popover, Stack, useDisclosure } from '@chakra-ui/react';
import { useEffect, useState } from 'react'

import { FiCompass } from 'react-icons/fi';
import Module from "./Module"
import { ConfigValue, ModuleResponse } from '@interfaces/Module';
import { Skeleton } from '../../components/ui/skeleton';
import Toc from "./Toc"
import { getAccountConfig } from '@api/Account'
import { keyframes } from '@emotion/react'

interface AreaProps {
    alias: string,
    keys: string,
    areaName: string,
    showOnlyFav?: boolean
}

export interface TocItem {
    name: string,
    id: string
}

// 首次加载的轻量入场动画
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`

export default function Area({ alias, keys: key, areaName, showOnlyFav = false }: AreaProps) {

    const [config, setConfig] = useState<ModuleResponse | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const { open, onOpen, onClose } = useDisclosure();

    useEffect(() => {
        let isMounted = true;
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
                
                setConfig(finalRes);
            }).catch((err) => {
                if (isMounted) console.log(err);
            }).finally(() => {
                if (isMounted) {
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

    const visibleModules = showOnlyFav
        ? config?.order.filter(moduleKey => config.config[`_fav_${moduleKey}`] === true) ?? []
        : config?.order ?? [];

    const tocList: TocItem[] = visibleModules
        .filter((moduleKey) => config?.info?.[moduleKey])
        .map((moduleKey) => ({
            name: config?.info[moduleKey]?.name || moduleKey,
            id: moduleKey
        }));

    const isInitialLoading = !config && isFetching;

    return (
        <>
            {/* 1. 内容模块区域：仅对内容做透明度过渡与入场动画 */}
            <Box
                animation={config && !isFetching ? `${fadeInUp} 0.25s ease-out` : undefined}
                opacity={isFetching && config ? 0.35 : 1}
                transition="opacity 0.15s ease-out"
                pointerEvents={isFetching ? 'none' : 'auto'}
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
                        visibleModules.map((module) => {
                            const moduleInfo = config?.info?.[module];
                            if (!moduleInfo) return null;

                            return (
                                <Module 
                                    key={module} 
                                    id={module} 
                                    alias={alias} 
                                    areaKey={key} 
                                    areaName={areaName} 
                                    config={config?.config ?? {}} 
                                    info={moduleInfo} 
                                    isOpen={open} 
                                    onOpen={onOpen} 
                                    onClose={onClose} 
                                    onConfigUpdate={handleConfigUpdate} 
                                />
                            );
                        })
                    )}
                </Stack>
            </Box>

            {/* 2. 悬浮 TOC 导航球：移至最外层 Fragment，实现真·Viewport 屏幕中央固定，零闪跳且适应各种 DPI/分辨率 */}
            <Flex 
                position="fixed"
                right={{ base: "3", md: "6" }} // 适配小屏幕/高 DPI 缩放，防止挤压卡片内容
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
                            size={{ base: "lg", md: "xl" }} // 响应式尺寸
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
        </>
    )
}
