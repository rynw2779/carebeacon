"use strict";

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { jsx as _jsx } from "react/jsx-runtime";
export const withFadeAnimation = (WrappedComponent, {
  containerStyle
} = {}) => {
  return props => {
    const opacityAnimationValue = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.timing(opacityAnimationValue, {
        duration: 800,
        toValue: 1,
        useNativeDriver: true,
        easing: Easing.bezier(0.3, 0.58, 0.25, 0.99)
      }).start();
    }, [opacityAnimationValue]);
    return /*#__PURE__*/_jsx(Animated.View, {
      style: [containerStyle, {
        opacity: opacityAnimationValue
      }],
      children: /*#__PURE__*/_jsx(WrappedComponent, {
        ...props
      })
    });
  };
};
//# sourceMappingURL=withFadeAnimation.js.map