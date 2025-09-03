import type { FC, ComponentType } from 'react';
import type { ViewProps } from 'react-native';
interface WithFadeAnimationProps {
    containerStyle?: ViewProps['style'];
}
export declare const withFadeAnimation: <P extends object>(WrappedComponent: ComponentType<P>, { containerStyle }?: WithFadeAnimationProps) => FC<P>;
export {};
//# sourceMappingURL=withFadeAnimation.d.ts.map