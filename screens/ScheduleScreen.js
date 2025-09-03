import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, Modal, Button, TouchableOpacity, Alert, SectionList, Platform, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore } from '../firebaseConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { Calendar } from 'react-native-calendars';
import moment from 'moment';
import DateTimePicker from '@react-native-community/datetimepicker';

const formatUserDisplay = (user) => {
  const lastName = user?.lastName || '';
  const firstName = user?.firstName || '';
  return `${lastName}, ${firstName}`.trim() || 'Unknown User';
};

export default function ScheduleScreen({ navigation }) {
  const [role, setRole] = useState('');
  const [visits, setVisits] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [sections, setSections] = useState([]);
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [visitDate, setVisitDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [visitTime, setVisitTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [useTime, setUseTime] = useState(false);
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientDataCache, setPatientDataCache] = useState({});
  const [staffDataCache, setStaffDataCache] = useState({});
  const sectionListRef = useRef(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [allStaff, setAllStaff] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        console.log('User UID:', user.uid); // Debug: Confirm user logged in
        try {
          const userDoc = await getDoc(doc(firestore, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('User data from Firestore:', userData); // Debug: Full user doc
            console.log('User role:', userData.role); // Debug: Role check
            setRole(userData.role);
            let patients = [];
            if (userData.role === 'administrator') {
              // Fetch all staff and patients for admin
              try {
                const usersQuerySnapshot = await getDocs(collection(firestore, 'users'));
                const allUsers = usersQuerySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const staffList = allUsers.filter(u => ['administrator', 'nurse', 'aide', 'MSW', 'chaplain'].includes(u.role))
                  .map(u => ({ ...u, title: formatUserDisplay(u) }));
                staffList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
                setAllStaff(staffList);
                const patientList = allUsers.filter(u => u.role === 'patient')
                  .map(u => ({ ...u, title: formatUserDisplay(u) }));
                patientList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
                setAllPatients(patientList);
              } catch (error) {
                console.error('Error fetching all users for admin:', error.message);
              }
            } else if (userData.role !== 'patient' && userData.role !== 'POA') {
              // Non-admin staff: assigned patients
              console.log('Assigned patients field:', userData.assignedPatients || 'none/undefined'); // Debug: Even if missing
              if (userData.assignedPatients) {
                console.log('Assigned patients IDs from Firestore:', userData.assignedPatients); // Debug: Specific array
                for (const patientId of userData.assignedPatients) {
                  try {
                    const patientDoc = await getDoc(doc(firestore, 'users', patientId));
                    if (patientDoc.exists()) {
                      const patientData = patientDoc.data();
                      patients.push({
                        id: patientId,
                        title: formatUserDisplay(patientData),
                        ...patientData,
                      });
                    } else {
                      console.warn(`Invalid assigned patient ID: ${patientId} does not exist. Skipping.`);
                      // Optional: To clean invalid IDs, uncomment below (updates own doc, allowed)
                      // await updateDoc(doc(firestore, 'users', user.uid), { assignedPatients: arrayRemove(patientId) });
                    }
                  } catch (error) {
                    console.error(`Error fetching patient ${patientId}:`, error.message);
                  }
                }
              }
              // Sort patients alphabetically by lastName
              patients.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
              setAssignedPatients(patients);
              console.log('Final assigned patients for picker:', patients); // Debug: Confirm state after sort
            } else if (userData.role === 'POA') {
              // POA: Use poaFor array for multiple patients
              const poaFor = userData.poaFor || [];
              for (const patientId of poaFor) {
                try {
                  const patientDoc = await getDoc(doc(firestore, 'users', patientId));
                  if (patientDoc.exists()) {
                    const patientData = patientDoc.data();
                    patients.push({
                      id: patientId,
                      title: formatUserDisplay(patientData),
                      ...patientData,
                    });
                  } else {
                    console.warn(`Invalid poaFor patient ID: ${patientId} does not exist. Skipping.`);
                  }
                } catch (error) {
                  console.error(`Error fetching patient ${patientId} for POA:`, error.message);
                }
              }
              patients.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
              setAssignedPatients(patients);
            }
            // No assignedPatients for patient role
          }
        } catch (error) {
          console.error('Error fetching user data:', error.message);
        }
      }
    };
    fetchUserData();
  }, []);

  const fetchVisits = (userRole, uid) => {
    let q;
    if (userRole === 'administrator') {
      // Admin: All visits
      q = collection(firestore, 'visits');
    } else if (['nurse', 'aide', 'MSW', 'chaplain'].includes(userRole)) {
      // Non-admin staff: Own visits
      q = query(collection(firestore, 'visits'), where('staffId', '==', uid));
    } else {
      // Patient or POA
      let patientIds = [];
      if (userRole === 'patient') {
        patientIds = [uid];
      } else if (userRole === 'POA') {
        patientIds = assignedPatients.map(p => p.id); // From poaFor
      }
      if (patientIds.length === 0) return;
      if (patientIds.length === 1) {
        q = query(collection(firestore, 'visits'), where('patientId', '==', patientIds[0]));
      } else {
        q = query(collection(firestore, 'visits'), where('patientId', 'in', patientIds));
      }
    }
    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      let visitList = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Sort visits by date
      visitList.sort((a, b) => moment(a.date).diff(moment(b.date)));

      // Group by date for sections
      const grouped = visitList.reduce((acc, visit) => {
        const date = visit.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(visit);
        return acc;
      }, {});

      // Generate sections from today to +30 days
      const today = moment();
      const futureDate = moment().add(30, 'days');
      const allDates = [];
      for (let m = today; m.isBefore(futureDate); m.add(1, 'days')) {
        const dateStr = m.format('YYYY-MM-DD');
        allDates.push(dateStr);
      }

      const sectionData = allDates.map((date) => ({
        title: date,
        data: grouped[date] || [{ id: 'empty', message: 'No visits scheduled' }],
      }));

      setSections(sectionData);
      setVisits(visitList);

      // Mark dates
      const marks = {};
      Object.keys(grouped).forEach((date) => {
        marks[date] = { marked: true, dotColor: 'black' };
      });
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: 'lightblue' };
      setMarkedDates(marks);

      // Cache user data for display
      const patientIds = new Set(visitList.map((v) => v.patientId).filter(Boolean));
      const staffIds = new Set(visitList.map((v) => v.staffId).filter(Boolean));
      const newPatientCache = { ...patientDataCache };
      const newStaffCache = { ...staffDataCache };
      for (const pid of patientIds) {
        if (!newPatientCache[pid]) {
          try {
            const pDoc = await getDoc(doc(firestore, 'users', pid));
            if (pDoc.exists()) {
              newPatientCache[pid] = pDoc.data();
            }
          } catch (error) {
            console.error(`Error caching patient ${pid}:`, error.message);
          }
        }
      }
      for (const sid of staffIds) {
        if (!newStaffCache[sid]) {
          try {
            const sDoc = await getDoc(doc(firestore, 'users', sid));
            if (sDoc.exists()) {
              newStaffCache[sid] = sDoc.data();
            }
          } catch (error) {
            console.error(`Error caching staff ${sid}:`, error.message);
          }
        }
      }
      setPatientDataCache(newPatientCache);
      setStaffDataCache(newStaffCache);
    }, (error) => {
      console.error('Error in visits snapshot:', error.message);
    });
    return unsubscribe; // Cleanup in useEffect
  };

  useEffect(() => {
    if (!role) return;
    const unsub = fetchVisits(role, auth.currentUser.uid);
    return () => unsub();
  }, [role, assignedPatients]); // Re-fetch if assignedPatients changes (e.g., after assignment)

  const onDayPress = (day) => {
    const dateStr = day.dateString;
    setSelectedDate(dateStr);
    const newMarked = { ...markedDates };
    Object.keys(newMarked).forEach((d) => {
      if (d === dateStr) {
        newMarked[d] = { ...newMarked[d], selected: true, selectedColor: 'lightblue' };
      } else if (newMarked[d].selected) {
        delete newMarked[d].selected;
        delete newMarked[d].selectedColor;
      }
    });
    setMarkedDates(newMarked);

    // Scroll to section
    const sectionIndex = sections.findIndex((s) => s.title === dateStr);
    if (sectionIndex !== -1 && sectionListRef.current) {
      sectionListRef.current.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
      });
    }
  };

  const handleAddVisit = async () => {
    if (!selectedPatient || (role === 'administrator' && !selectedStaff)) {
      Alert.alert('Error', 'Please select a patient' + (role === 'administrator' ? ' and staff' : ''));
      return;
    }
    const dateStr = moment(visitDate).format('YYYY-MM-DD');
    const timeStr = useTime ? moment(visitTime).format('HH:mm') : null;
    try {
      await addDoc(collection(firestore, 'visits'), {
        staffId: role === 'administrator' ? selectedStaff.id : auth.currentUser.uid,
        patientId: selectedPatient,
        date: dateStr,
        time: timeStr,
        status: 'scheduled',
      });
      Alert.alert('Success', 'Visit scheduled!');
      resetModal();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleEditVisit = async () => {
    if (!selectedVisit) return;
    const dateStr = moment(visitDate).format('YYYY-MM-DD');
    const timeStr = useTime ? moment(visitTime).format('HH:mm') : null;
    try {
      await updateDoc(doc(firestore, 'visits', selectedVisit.id), {
        staffId: role === 'administrator' && selectedStaff ? selectedStaff.id : selectedVisit.staffId,
        date: dateStr,
        time: timeStr,
        patientId: selectedPatient || selectedVisit.patientId,
      });
      Alert.alert('Success', 'Visit updated!');
      resetModal();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteVisit = async (visitId) => {
    Alert.alert('Confirm', 'Delete this visit?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deleteDoc(doc(firestore, 'visits', visitId));
            Alert.alert('Success', 'Visit deleted!');
          } catch (error) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  };

  const openEditModal = (visit) => {
    setModalMode('edit');
    setSelectedVisit(visit);
    setVisitDate(moment(visit.date).toDate());
    setUseTime(!!visit.time);
    if (visit.time) {
      setVisitTime(moment(`${visit.date} ${visit.time}`).toDate());
    }
    setSelectedPatient(visit.patientId);
    const patient = (role === 'administrator' ? allPatients : assignedPatients).find(p => p.id === visit.patientId);
    if (patient) {
      setPatientSearchQuery(patient.title);
    }
    if (role === 'administrator') {
      const staff = allStaff.find(s => s.id === visit.staffId);
      if (staff) {
        setSelectedStaff({ id: staff.id, title: staff.title || formatUserDisplay(staff) });
        setStaffSearchQuery(staff.title || formatUserDisplay(staff));
      }
    }
    setShowModal(true);
  };

  const resetModal = () => {
    setShowModal(false);
    setModalMode('add');
    setSelectedVisit(null);
    setVisitDate(new Date());
    setVisitTime(new Date());
    setUseTime(false);
    setSelectedPatient(null);
    setPatientSearchQuery('');
    setSelectedStaff(null);
    setStaffSearchQuery('');
  };

  const renderVisitItem = ({ item }) => {
    if (item.id === 'empty') {
      return (
        <View style={styles.emptyItem}>
          <Text style={styles.emptyText}>No visits scheduled</Text>
        </View>
      );
    }
    const timeDisplay = item.time ? moment(item.time, 'HH:mm').format('h:mm A') : 'Time TBD';
    let displayText;
    if (role === 'administrator') {
      // Admin: Show both
      const staff = staffDataCache[item.staffId] || {};
      const patient = patientDataCache[item.patientId] || {};
      const staffName = formatUserDisplay(staff);
      const patientName = formatUserDisplay(patient);
      const staffRole = staff.role ? ` (${staff.role})` : '';
      displayText = `${staffName}${staffRole} to ${patientName} - ${timeDisplay}`;
    } else {
      const isStaffView = role !== 'patient' && role !== 'POA';
      const userId = isStaffView ? item.patientId : item.staffId;
      const userCache = isStaffView ? patientDataCache : staffDataCache;
      const user = userCache[userId] || {};
      const displayName = formatUserDisplay(user);
      const userRole = user.role ? ` (${user.role})` : '';
      displayText = `${displayName}${userRole} - ${timeDisplay}`;
    }

    return (
      <View style={styles.visitItem}>
        <Text style={styles.visitText}>{displayText}</Text>
        {(role !== 'patient' && role !== 'POA') && (
          <View style={styles.visitActions}>
            <TouchableOpacity onPress={() => openEditModal(item)}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteVisit(item.id)}>
              <Text style={styles.actionTextDelete}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section: { title } }) => {
    const dayName = moment(title).format('ddd');
    const dayNum = moment(title).format('D');
    const isToday = title === moment().format('YYYY-MM-DD');
    return (
      <View style={styles.sectionHeader}>
        <View style={styles.dayCircle}>
          <Text style={styles.dayNum}>{dayNum}</Text>
        </View>
        <Text style={styles.sectionTitle}>{dayName} {isToday ? 'Today' : ''}</Text>
      </View>
    );
  };

  const onDateChange = (event, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setVisitDate(selected);
  };

  const onTimeChange = (event, selected) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selected) setVisitTime(selected);
  };

  const patientList = role === 'administrator' ? allPatients : assignedPatients;
  const filteredPatients = patientList.filter((patient) =>
    patient.title.toLowerCase().includes(patientSearchQuery.toLowerCase())
  );

  const filteredStaff = allStaff.filter((staff) =>
    (staff.title || '').toLowerCase().includes(staffSearchQuery.toLowerCase())
  );

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Calendar
          current={selectedDate}
          markedDates={markedDates}
          onDayPress={onDayPress}
          style={styles.calendar}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: '#FFF',
            textSectionTitleDisabledColor: '#A7C7E7',
            selectedDayBackgroundColor: 'lightblue',
            selectedDayTextColor: '#000',
            todayTextColor: '#FFF',
            dayTextColor: '#FFF',
            textDisabledColor: '#A7C7E7',
            dotColor: '#000',
            selectedDotColor: '#000',
            arrowColor: '#FFF',
            disabledArrowColor: '#A7C7E7',
            monthTextColor: '#FFF',
            indicatorColor: '#FFF',
            textDayFontWeight: '300',
            textMonthFontWeight: 'bold',
            textDayHeaderFontWeight: '300',
            textDayFontSize: 16,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 16
          }}
        />
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderVisitItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          style={styles.list}
        />
        {(role !== 'patient' && role !== 'POA') && (
          <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
            <Text style={styles.fabText}>Schedule</Text>
          </TouchableOpacity>
        )}
        <Modal visible={showModal} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{modalMode === 'add' ? 'Schedule Visit' : 'Edit Visit'}</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                <Text style={styles.input}>Date: {moment(visitDate).format('YYYY-MM-DD')}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={visitDate}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                />
              )}
              <View style={styles.checkboxContainer}>
                <TouchableOpacity onPress={() => setUseTime(!useTime)}>
                  <Text style={styles.checkbox}>{useTime ? '☑' : '☐'}</Text>
                  <Text> Add Time</Text>
                </TouchableOpacity>
              </View>
              {useTime && (
                <>
                  <TouchableOpacity onPress={() => setShowTimePicker(true)}>
                    <Text style={styles.input}>Time: {moment(visitTime).format('HH:mm')}</Text>
                  </TouchableOpacity>
                  {showTimePicker && (
                    <DateTimePicker
                      value={visitTime}
                      mode="time"
                      display="default"
                      onChange={onTimeChange}
                    />
                  )}
                </>
              )}
              {role === 'administrator' && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Search Staff"
                    value={staffSearchQuery}
                    onChangeText={setStaffSearchQuery}
                  />
                  <FlatList
                    data={filteredStaff}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedStaff({ id: item.id, title: item.title || formatUserDisplay(item) });
                          setStaffSearchQuery(item.title || formatUserDisplay(item));
                        }}
                        style={styles.patientItem}
                      >
                        <Text>{item.title || formatUserDisplay(item)}</Text>
                      </TouchableOpacity>
                    )}
                    style={styles.patientList}
                  />
                </>
              )}
              {patientList.length === 0 ? (
                <Text style={styles.noPatientsText}>No {role === 'administrator' ? '' : 'assigned '}patients found. {role !== 'administrator' ? 'Please assign patients in the Assignment screen first.' : 'No patients in system.'}</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Search Patient"
                    value={patientSearchQuery}
                    onChangeText={setPatientSearchQuery}
                  />
                  <FlatList
                    data={filteredPatients}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedPatient(item.id);
                          setPatientSearchQuery(item.title);
                        }}
                        style={styles.patientItem}
                      >
                        <Text>{item.title}</Text>
                      </TouchableOpacity>
                    )}
                    style={styles.patientList}
                  />
                </>
              )}
              <Button
                title={modalMode === 'add' ? 'Add' : 'Save'}
                onPress={modalMode === 'add' ? handleAddVisit : handleEditVisit}
                color="#A7C7E7"
              />
              <Button title="Cancel" onPress={resetModal} color="#B2D8B2" />
            </View>
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  calendar: { marginBottom: 10, backgroundColor: 'transparent', borderWidth: 0 },
  list: { flex: 1, backgroundColor: 'transparent' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: '#A7C7E7' },
  dayCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1, borderColor: '#FFF' },
  dayNum: { fontSize: 18, color: '#FFF' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  visitItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEE', backgroundColor: 'transparent' },
  visitText: { fontSize: 16, color: '#FFF' },
  visitActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionText: { color: '#A7C7E7', marginRight: 10 },
  actionTextDelete: { color: '#FF6961' },
  emptyItem: { padding: 10, backgroundColor: 'transparent' },
  emptyText: { color: '#FFF', textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: '#A7C7E7', padding: 10, borderRadius: 5 },
  fabText: { color: '#FFF', fontSize: 16 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 10, width: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#A7C7E7', padding: 10, marginVertical: 5, borderRadius: 5 },
  checkboxContainer: { marginVertical: 10, flexDirection: 'row', alignItems: 'center' },
  checkbox: { fontSize: 16 },
  patientItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  patientList: { maxHeight: 150, backgroundColor: '#FFF' },
  noPatientsText: { color: 'red', marginVertical: 10, textAlign: 'center' },
});