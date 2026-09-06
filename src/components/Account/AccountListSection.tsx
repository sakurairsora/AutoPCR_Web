/** 主页账号列表区：表格视图 / 卡片视图（自 DashBoard 拆出） */

import { Box, Card, SimpleGrid, Table } from '@chakra-ui/react';
import { Skeleton, SkeletonText } from '../../components/ui/skeleton';
import { Checkbox } from '../../components/ui/checkbox';
import NiceModal from '@ebay/nice-modal-react';
import ConfigSyncModal from './ConfigSyncModal';
import { AccountInfo } from './AccountCard';
import { UserInfoResponse } from '@interfaces/UserInfo';

interface AccountListSectionProps {
    userInfo?: UserInfoResponse;
    isTableView: boolean;
    selectedAccounts: string[];
    batchAccounts: string[];
    busyAccounts: Set<string>;
    allSelected: boolean;
    toggleSelectAll: (details: { checked: boolean | 'indeterminate' }) => void;
    toggleSelectAccount: (name: string) => void;
    onRefresh: () => void;
    increaseCount: () => void;
    decreaseCount: () => void;
    updateAccountInfo: (account: UserInfoResponse['accounts'] extends (infer U)[] | undefined ? U : never) => void;
    setAccountBusy: (name: string, busy: boolean) => void;
    occupiedNamesFactory: (selfAlias: string) => Set<string>;
}

export default function AccountListSection({
    userInfo,
    isTableView,
    selectedAccounts,
    batchAccounts,
    busyAccounts,
    allSelected,
    toggleSelectAll,
    toggleSelectAccount,
    onRefresh,
    increaseCount,
    decreaseCount,
    updateAccountInfo,
    setAccountBusy,
    occupiedNamesFactory,
}: AccountListSectionProps) {
    const cardProps = (account: NonNullable<UserInfoResponse['accounts']>[number]) => ({
        account,
        onToggle: onRefresh,
        increaseCount,
        decreaseCount,
        updateAccountInfo,
        isTableView,
        isSelected: selectedAccounts.includes(account.name),
        onToggleSelect: () => toggleSelectAccount(account.name),
        batchAccounts,
        getOccupiedNames: occupiedNamesFactory,
        isBusy: busyAccounts.has(account.name),
        onBusyChange: setAccountBusy,
        onOpenSyncConfig: (a: string) => {
            NiceModal.show(ConfigSyncModal, { sourceAccount: a });
        },
    });

    if (isTableView) {
        return (
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
                                <AccountInfo key={account.name} {...cardProps(account)} />
                            ))
                        )}
                    </Table.Body>
                </Table.Root>
            </Box>
        );
    }

    return (
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
                        <AccountInfo key={account.name} {...cardProps(account)} />
                    ))
                )}
            </SimpleGrid>
        </Box>
    );
}
