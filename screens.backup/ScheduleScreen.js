import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

const mockVisits = [{ id: '1', staff: 'Nurse Jane', time: 'Today 2PM' }, { id: '2', staff: 'Aide John', time: 'Tomorrow 10AM' }];

export default function ScheduleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Schedule</Text>
      <FlatList data={mockVisits} keyExtractor={item => item.id} renderItem={({ item }) => <Text>{item.staff} - {item.time}</Text>} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#A7C7E7' },
});