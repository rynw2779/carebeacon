import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
interface RightButtonProps {
    inputHeight?: number;
    onClearPress?: () => void;
    onChevronPress?: () => void;
    isOpened?: boolean;
    showChevron?: boolean;
    showClear?: boolean;
    loading?: boolean;
    enableLoadingIndicator?: boolean;
    buttonsContainerStyle?: StyleProp<ViewStyle>;
    ChevronIconComponent?: React.ReactNode;
    ClearIconComponent?: React.ReactNode;
    RightIconComponent?: React.ReactNode;
    onRightIconComponentPress?: () => void;
}
export declare const RightButton: React.FC<RightButtonProps>;
export {};
//# sourceMappingURL=RightButton.d.ts.map