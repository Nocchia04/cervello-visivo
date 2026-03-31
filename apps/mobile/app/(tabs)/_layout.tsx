import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRef, useEffect } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const TABS: { name: string; icon: FeatherIconName }[] = [
  { name: 'index',        icon: 'home'     },
  { name: 'cantieri',     icon: 'layers'   },
  { name: 'impostazioni', icon: 'settings' },
];

interface TabItemProps {
  icon: FeatherIconName;
  focused: boolean;
  onPress: () => void;
}

function TabItem({ icon, focused, onPress }: TabItemProps) {
  const scale       = useRef(new Animated.Value(focused ? 1.15 : 1.0)).current;
  const iconOpacity = useRef(new Animated.Value(focused ? 1.0  : 0.35)).current;
  const dotOpacity  = useRef(new Animated.Value(focused ? 1.0  : 0.0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1.15 : 1.0,
        tension: 280,
        friction: 18,
        useNativeDriver: true,
      }),
      Animated.timing(iconOpacity, {
        toValue: focused ? 1.0 : 0.35,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(dotOpacity, {
        toValue: focused ? 1.0 : 0.0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.tabItem}>
      <Animated.View style={{ opacity: iconOpacity, transform: [{ scale }] }}>
        <Feather name={icon} size={26} color="#FFFFFF" />
      </Animated.View>
      <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
    </TouchableOpacity>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem key={route.key} icon={tab.icon} focused={focused} onPress={onPress} />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cantieri" />
      <Tabs.Screen name="impostazioni" />
    </Tabs>
  );
}

const BAR_H = 72;

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    height: BAR_H,
    marginHorizontal: 20,
    borderRadius: BAR_H / 2,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 18,
  },
  tabItem: {
    flex: 1,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1D4ED8',
  },
});
