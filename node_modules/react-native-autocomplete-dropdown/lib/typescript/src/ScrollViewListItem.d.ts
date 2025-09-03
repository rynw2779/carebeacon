import type { FC } from 'react';
import type { ViewProps } from 'react-native';
interface ScrollViewListItemProps {
    highlight: string;
    title: string;
    style?: ViewProps['style'];
    onPress?: () => void;
    ignoreAccents?: boolean;
    numberOfLines?: number;
}
export declare const ScrollViewListItem: FC<ScrollViewListItemProps>;
export {};
//# sourceMappingURL=ScrollViewListItem.d.ts.map