"use strict";

import React, { memo, useMemo } from 'react';
import { StyleSheet, FlatList, View, useColorScheme } from 'react-native';
import * as Animatable from 'react-native-animatable';
import { fadeInDownShort, fadeInUpShort } from './helpers';
import { theme } from './theme';
import { jsx as _jsx } from "react/jsx-runtime";
export const Dropdown = /*#__PURE__*/memo(props => {
  const {
    dataSet,
    suggestionsListMaxHeight,
    renderItem,
    ListEmptyComponent,
    ItemSeparatorComponent,
    direction,
    ...rest
  } = props;
  const themeName = useColorScheme();
  const styles = useMemo(() => getStyles(themeName || 'light'), [themeName]);
  const defaultItemSeparator = useMemo(() => {
    return () => /*#__PURE__*/_jsx(View, {
      style: styles.itemSeparator
    });
  }, [styles.itemSeparator]);
  return /*#__PURE__*/_jsx(Animatable.View, {
    useNativeDriver: true,
    animation: direction === 'up' ? fadeInUpShort : fadeInDownShort,
    easing: "ease-out-quad",
    delay: direction === 'up' ? 150 : 0,
    duration: 150,
    style: {
      ...styles.listContainer,
      ...rest.suggestionsListContainerStyle
    },
    children: /*#__PURE__*/_jsx(FlatList, {
      keyboardDismissMode: "on-drag",
      keyboardShouldPersistTaps: "handled",
      nestedScrollEnabled: true,
      data: dataSet,
      style: {
        maxHeight: suggestionsListMaxHeight
      },
      renderItem: renderItem,
      keyExtractor: item => item.id,
      ListEmptyComponent: ListEmptyComponent,
      ItemSeparatorComponent: ItemSeparatorComponent ?? defaultItemSeparator,
      ...rest.flatListProps
    })
  });
});
const getStyles = (themeName = 'light') => StyleSheet.create({
  container: {},
  listContainer: {
    backgroundColor: theme[themeName].suggestionsListBackgroundColor,
    width: '100%',
    zIndex: 9,
    borderRadius: 5,
    shadowColor: theme[themeName || 'light'].shadowColor,
    shadowOffset: {
      width: 0,
      height: 12
    },
    shadowOpacity: 0.3,
    shadowRadius: 15.46,
    elevation: 20
  },
  itemSeparator: {
    height: 1,
    width: '100%',
    backgroundColor: theme[themeName || 'light'].itemSeparatorColor
  }
});
//# sourceMappingURL=Dropdown.js.map