"use strict";

import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import diacriticless from './diacriticless';
import { theme } from './theme';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const ScrollViewListItem = /*#__PURE__*/memo(({
  highlight,
  title,
  style,
  onPress,
  ignoreAccents,
  numberOfLines = 2
}) => {
  const themeName = useColorScheme();
  const styles = useMemo(() => getStyles(themeName || 'light'), [themeName]);
  const titleParts = useMemo(() => {
    let titleHighlighted = '';
    let titleStart = title;
    let titleEnd = '';
    if (typeof title === 'string' && title?.length > 0 && highlight?.length > 0) {
      const highlightIn = ignoreAccents ? diacriticless(title?.toLowerCase()) : title?.toLowerCase();
      const highlightWhat = ignoreAccents ? diacriticless(highlight?.toLowerCase()) : highlight?.toLowerCase();
      const substrIndex = highlightIn?.indexOf(highlightWhat);
      if (substrIndex !== -1) {
        titleStart = title?.slice(0, substrIndex);
        titleHighlighted = title?.slice(substrIndex, substrIndex + highlight?.length);
        titleEnd = title?.slice(substrIndex + highlight?.length);
      }
    }
    return {
      titleHighlighted,
      titleStart,
      titleEnd
    };
  }, [highlight, ignoreAccents, title]);
  return /*#__PURE__*/_jsx(TouchableOpacity, {
    onPress: onPress,
    children: /*#__PURE__*/_jsx(View, {
      style: styles.container,
      children: /*#__PURE__*/_jsxs(Text, {
        numberOfLines: numberOfLines,
        children: [/*#__PURE__*/_jsx(Text, {
          numberOfLines: 1,
          style: {
            ...styles.text,
            ...style
          },
          children: titleParts.titleStart
        }), /*#__PURE__*/_jsx(Text, {
          numberOfLines: 1,
          style: {
            ...styles.text,
            ...style,
            ...styles.textBold
          },
          children: titleParts.titleHighlighted
        }), /*#__PURE__*/_jsx(Text, {
          numberOfLines: 1,
          style: {
            ...styles.text,
            ...style
          },
          children: titleParts.titleEnd
        })]
      })
    })
  });
});
const getStyles = (themeName = 'light') => StyleSheet.create({
  container: {
    padding: 15,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    width: '100%'
  },
  text: {
    color: theme[themeName].listItemTextColor,
    fontSize: 16,
    flexGrow: 1,
    flexShrink: 0
  },
  textBold: {
    fontWeight: 'bold'
  }
});
//# sourceMappingURL=ScrollViewListItem.js.map