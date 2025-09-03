"use strict";

import React, { memo, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronDown, XCircle } from 'react-native-feather';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const RightButton = /*#__PURE__*/memo(({
  inputHeight,
  onClearPress,
  onChevronPress,
  isOpened,
  showChevron,
  showClear,
  loading,
  enableLoadingIndicator,
  buttonsContainerStyle,
  ChevronIconComponent,
  ClearIconComponent,
  RightIconComponent,
  onRightIconComponentPress
}) => {
  const isOpenedAnimationValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(isOpenedAnimationValue, {
      duration: 350,
      toValue: isOpened ? 1 : 0,
      useNativeDriver: true,
      easing: Easing.bezier(0.3, 0.58, 0.25, 0.99)
    }).start();
  }, [isOpened, isOpenedAnimationValue]);
  const chevronSpin = isOpenedAnimationValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg']
  });
  return /*#__PURE__*/_jsxs(View, {
    style: {
      ...styles.container,
      height: inputHeight,
      ...buttonsContainerStyle
    },
    children: [(!enableLoadingIndicator || !loading) && showClear && /*#__PURE__*/_jsx(TouchableOpacity, {
      onPress: onClearPress,
      style: styles.clearButton,
      children: ClearIconComponent ?? /*#__PURE__*/_jsx(XCircle, {
        width: 18,
        stroke: "#aeb4c6"
      })
    }), enableLoadingIndicator && loading && /*#__PURE__*/_jsx(ActivityIndicator, {
      color: "#999"
    }), RightIconComponent && /*#__PURE__*/_jsx(TouchableOpacity, {
      onPress: onRightIconComponentPress,
      style: styles.chevronButton,
      children: RightIconComponent
    }), showChevron && /*#__PURE__*/_jsx(Animated.View, {
      style: {
        transform: [{
          rotate: chevronSpin
        }]
      },
      children: /*#__PURE__*/_jsx(TouchableOpacity, {
        onPress: onChevronPress,
        style: styles.chevronButton,
        children: ChevronIconComponent ?? /*#__PURE__*/_jsx(ChevronDown, {
          width: 20,
          stroke: "#727992"
        })
      })
    })]
  });
});
const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flex: 0,
    flexDirection: 'row',
    right: 8,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent'
  },
  clearButton: {
    width: 26,
    alignItems: 'center'
  },
  chevronButton: {
    width: 26,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center'
  }
});
//# sourceMappingURL=RightButton.js.map