import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const VIEWS = ['Login', 'World', 'Settings'];

export default function App() {
  const [currentView, setCurrentView] = useState('Login');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.text}>{currentView} Screen</Text>
      </View>
      <View style={styles.tabBar}>
        {VIEWS.map((view) => (
          <Pressable
            key={view}
            style={[styles.tab, currentView === view && styles.activeTab]}
            onPress={() => setCurrentView(view)}
          >
            <Text style={[styles.tabText, currentView === view && styles.activeTabText]}>
              {view}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100f0e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 20,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTab: {
    borderTopWidth: 2,
    borderTopColor: '#4a9eff',
  },
  tabText: {
    color: '#888',
    fontSize: 12,
  },
  activeTabText: {
    color: '#4a9eff',
    fontWeight: 'bold',
  },
});
