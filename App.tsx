import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AppProvider } from './src/context/AppContext.jsx';
import { ThemeProvider, useTheme } from './src/context/ThemeContext.jsx';

const VIEWS = ['Login', 'World', 'Settings'];

function AppContent() {
  const [currentView, setCurrentView] = useState('Login');
  const { V } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: V.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.text, { color: V.ink }]}>{currentView} Screen</Text>
      </View>
      <View style={[styles.tabBar, { backgroundColor: V.surf, borderTopColor: V.outv }]}>
        {VIEWS.map((view) => {
          const active = currentView === view;
          return (
            <Pressable
              key={view}
              style={[styles.tab, active && [styles.activeTab, { borderTopColor: V.pri }]]}
              onPress={() => setCurrentView(view)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? V.pri : V.ink2 },
                  active && styles.activeTabText,
                ]}
              >
                {view}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 20,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTab: {
    borderTopWidth: 2,
  },
  tabText: {
    fontSize: 12,
  },
  activeTabText: {
    fontWeight: 'bold',
  },
});
