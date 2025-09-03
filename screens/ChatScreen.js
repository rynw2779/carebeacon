import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Image, TouchableOpacity, Modal, Alert, ActivityIndicator, Platform, Vibration, Animated, ScrollView, KeyboardAvoidingView, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth, db, firestore, storage } from '../firebaseConfig';
import { ref, onValue, push, set, serverTimestamp, update, get, increment, off, remove } from 'firebase/database';
import { collection, getDocs, getDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { sendPushNotification } from '../utils/pushNotifications';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Asset } from 'expo-asset';
import { PinchGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler';
import { AutocompleteDropdownContextProvider } from 'react-native-autocomplete-dropdown';
import { useFocusEffect } from '@react-navigation/native';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
}
export const formatUserDisplay = (user) => {
  const lastName = user?.lastName || '';
  const firstName = user?.firstName || '';
  const display = `${firstName} ${lastName}`.trim();
  const email = user?.email || '';
  const role = user?.role || '';
  return display || `${email} (${role})` || 'Unknown User';
};
export const getInitials = (user) => {
  const first = user?.firstName ? user.firstName[0] : '';
  const last = user?.lastName ? user.lastName[0] : '';
  return `${first}${last}`.toUpperCase() || '?';
};
export const generateRoomId = (userIds) => {
  return userIds.sort().join('_');
};
const getLastMessagePreview = (chat) => {
  return chat?.lastMessage?.text?.substring(0, 50) || 'Chat started';
};
const getTimestamp = (chat) => {
  const ts = chat?.lastMessage?.timestamp;
  if (!ts) return '';
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};
const getLastMessageReceipt = (chat, currentUserId) => {
  const lastMessage = chat?.lastMessage;
  if (lastMessage && lastMessage.senderId === currentUserId) {
    const readBy = lastMessage.readBy || {};
    const readCount = Object.keys(readBy).length - 1;
    const totalOthers = Object.keys(chat.participants || {}).length - 1;
    if (readCount === totalOthers) {
      return totalOthers === 1 ? 'Read' : 'Read by all';
    } else if (readCount > 0) {
      return `Read by ${readCount}`;
    } else {
      return 'Delivered';
    }
  }
  return '';
};
export default function ChatScreen({ navigation, route }) {
  const [chats, setChats] = useState([]);
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [addUserSearchQuery, setAddUserSearchQuery] = useState('');
  const [chatMessages, setChatMessages] = useState({});
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [processedMessages, setProcessedMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [senderDataCache, setSenderDataCache] = useState({});
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isProfileImage, setIsProfileImage] = useState(false);
  const flatListRef = useRef(null);
  const currentUserId = auth.currentUser?.uid;
  const chatListenersRef = useRef([]);
  const prevMessageCountRef = useRef(0);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [notificationSound, setNotificationSound] = useState('default');
  const [matchingMessageIndex, setMatchingMessageIndex] = useState(null);
  const fontScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [originalParticipants, setOriginalParticipants] = useState([]);
  const { selectedChatId } = route.params || {};
  const [viewMode, setViewMode] = useState('own');
  const [showMessageMenuModal, setShowMessageMenuModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [selectedForwardTargets, setSelectedForwardTargets] = useState([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [showChatMenuModal, setShowChatMenuModal] = useState(false);
  const [selectedChatForMenu, setSelectedChatForMenu] = useState(null);
  const [isDnd, setIsDnd] = useState(false);
  const [awayMessage, setAwayMessage] = useState('');
  const [showDndModal, setShowDndModal] = useState(false);
  const [tempAwayMessage, setTempAwayMessage] = useState('');
  const [userPhoto, setUserPhoto] = useState(null);
  const [userStatus, setUserStatus] = useState('offline');
  const [userDnd, setUserDnd] = useState(false);
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ marginRight: 5, fontWeight: 'bold', color: '#333' }}>DND</Text>
          <Switch
            value={isDnd}
            onValueChange={handleDndToggle}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={isDnd ? '#ff0000' : '#f4f3f4'}
            style={{ marginLeft: 2 }}
          />
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <View>
              {userPhoto ? (
                <Image source={{ uri: userPhoto }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text>👤</Text>
              )}
              {!userDnd && userStatus === 'active' ? <View style={[styles.statusDot, { backgroundColor: 'green', position: 'absolute', bottom: 0, right: 0 }]} /> : null}
              {userDnd ? <View style={[styles.statusDot, { backgroundColor: 'red', position: 'absolute', bottom: 0, right: 0 }]} /> : null}
            </View>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [isDnd, navigation, userPhoto, userStatus, userDnd]);
  const handleDndToggle = (value) => {
    if (value) {
      setTempAwayMessage(awayMessage);
      setShowDndModal(true);
    } else {
      updateDndStatus(false, '');
      setIsDnd(false);
      setAwayMessage('');
    }
  };
  const confirmDnd = () => {
    updateDndStatus(true, tempAwayMessage);
    setIsDnd(true);
    setAwayMessage(tempAwayMessage);
    setShowDndModal(false);
  };
  const updateDndStatus = async (dnd, msg) => {
    try {
      await updateDoc(doc(firestore, 'users', currentUserId), { dnd, awayMessage: msg });
    } catch (error) {
      console.error('Error updating DND status:', error);
      Alert.alert('Error', 'Failed to update DND status.');
    }
  };
  useEffect(() => {
    if (selectedChatId) {
      const chat = chats.find(c => c.id === selectedChatId);
      if (chat) {
        setSelectedChat(chat);
        const queryLower = searchQuery.toLowerCase();
        if (queryLower) {
          const msgs = chatMessages[chat.id] || [];
          const reversedIndex = msgs.findIndex(msg => msg.text?.toLowerCase().includes(queryLower));
          setMatchingMessageIndex(reversedIndex >= 0 ? reversedIndex : null);
        } else {
          setMatchingMessageIndex(null);
        }
      }
    }
  }, [selectedChatId, chats, searchQuery, chatMessages]);
  const getChatName = useCallback((chat, currentUserId) => {
    if (!chat) return 'Unknown Chat';
    if (chat.name) {
      return chat.name;
    }
    if (!chat.participants || Object.keys(chat.participants).length === 0) {
      return 'Unknown Chat';
    }
    const uids = Object.keys(chat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    if (otherUids.length === 0) {
      return 'Unknown Chat';
    }
    if (!availableUsers || availableUsers.length === 0) {
      return 'Loading...';
    }
    const otherParticipants = otherUids.map(id => availableUsers.find(u => u.id === id) || { id });
    if (otherParticipants.length === 1) {
      return formatUserDisplay(otherParticipants[0]);
    } else if (otherParticipants.length <= 5) {
      return otherParticipants.map(p => formatUserDisplay(p)).join(', ');
    } else {
      return `Group Chat (${otherParticipants.length} participants)`;
    }
  }, [availableUsers]);
  const getChatAvatar = useCallback((chat, currentUserId) => {
    if (!chat) return { photo: null, initials: '?' };
    if (chat.profilePhoto) {
      return {
        photo: chat.profilePhoto,
        initials: '?',
      };
    }
    if (!chat.participants || Object.keys(chat.participants).length === 0) {
      return {
        photo: null,
        initials: '?',
      };
    }
    const uids = Object.keys(chat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    if (!availableUsers || availableUsers.length === 0) {
      return {
        photo: null,
        initials: '?',
      };
    }
    const otherParticipants = otherUids.map(id => availableUsers.find(u => u.id === id) || { id });
    if (otherParticipants.length === 1) {
      const participant = otherParticipants[0];
      return {
        photo: participant.profilePhoto,
        initials: getInitials(participant),
      };
    } else {
      return {
        photo: null,
        initials: otherParticipants.map(p => getInitials(p)[0]).join(''),
      };
    }
  }, [availableUsers]);
  useEffect(() => {
    const preloadNotificationSound = async () => {
      const notificationAsset = Asset.fromModule(notificationSound);
      await notificationAsset.downloadAsync();
    };
    preloadNotificationSound();
  }, []);
  useEffect(() => {
    console.log('loadUsersAndChats started'); // New log: Trace start of user/chat loading
    const loadUsersAndChats = () => {
      const user = auth.currentUser;
      if (user) {
        console.log('Authenticated user found:', user.uid); // New log: Confirm auth
        const unsubscribe = onSnapshot(doc(firestore, 'users', user.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const role = data.role;
            console.log('User role:', role); // New log: Role detection
            setCurrentUserRole(role);
            setChatNotificationsEnabled(data.chatNotificationsEnabled ?? true);
            setNotificationSound(data.notificationSound ?? 'default');
            setIsDnd(data.dnd ?? false);
            setUserDnd(data.dnd ?? false);
            setAwayMessage(data.awayMessage ?? '');
            setUserStatus(data.status || 'offline');
            setUserPhoto(data.profilePhoto || null); // Load profile photo for header
          } else {
            console.error('User document does not exist');
          }
        }, (error) => {
          console.error('Error listening to user document:', error);
        });
        // Fetch available users
        const fetchAvailableUsers = async () => {
          try {
            const userDoc = await getDoc(doc(firestore, 'users', user.uid)); // One-time get for role
            if (userDoc.exists()) {
              const role = userDoc.data().role;
              let userList = [];
              if (role === 'administrator' || role === 'nurse' || role === 'aide' || role === 'MSW' || role === 'chaplain') {
                console.log('Fetching all users for staff role'); // New log: Staff user fetch
                const querySnapshot = await getDocs(collection(firestore, 'users'));
                userList = querySnapshot.docs.map(doc => ({
                  id: doc.id,
                  title: formatUserDisplay(doc.data()),
                  ...doc.data()
                }));
              } else if (role === 'patient' || role === 'POA') {
                console.log('Fetching assigned staff for patient/POA'); // New log: Non-staff fetch
                const assignedStaff = userDoc.data().assignedStaff || [];
                userList = await Promise.all(assignedStaff.map(async (staffId) => {
                  const staffDoc = await getDoc(doc(firestore, 'users', staffId));
                  return staffDoc.exists() ? { id: staffId, title: formatUserDisplay(staffDoc.data()), ...staffDoc.data() } : null;
                }));
                userList = userList.filter(u => u !== null);
              }
              console.log('Available users loaded:', userList.length); // New log: Users count
              setAvailableUsers(userList);
              listenToChats(user.uid);
            }
          } catch (error) {
            console.error('Error loading users:', error); // New log: Catch errors
          }
        };
        fetchAvailableUsers();
        return unsubscribe;
      } else {
        console.error('No authenticated user'); // Existing, but ensured
      }
    };
    const cleanup = loadUsersAndChats();
    return cleanup;
  }, [currentUserRole, viewMode]); // Re-listen when viewMode changes
  const listenToChats = (userId) => {
    console.log('listenToChats called with viewMode:', viewMode); // New log: Trace listener setup
    const chatsRef = ref(db, 'chats');
    const listener = onValue(chatsRef, (snapshot) => {
      console.log('onValue snapshot received'); // New log: Confirm DB callback
      const data = snapshot.val();
      let theChats = data ? Object.entries(data)
        .map(([roomId, chat]) => ({
          id: roomId,
          ...chat,
          unread: chat.unread || {},
          mutedBy: chat.mutedBy || {},
        })) : [];
      console.log('Raw chats before filter:', theChats.length); // New log: Raw data count
      if (currentUserRole !== 'administrator' || viewMode === 'own') {
        theChats = theChats.filter(chat => chat && chat.participants && chat.participants[userId]);
        console.log('Chats after own-mode filter:', theChats.length); // New log: Filtered count
      } // No filter in 'all' mode for admins
      // Sort chats by lastMessage timestamp descending (newest first)
      theChats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
      setChats(theChats);
      setFilteredChats(theChats);
      console.log('isLoadingChats set to false'); // New log: Loading end
      setIsLoadingChats(false);
      // Load messages for all visible chats
      theChats.forEach(chat => {
        const messagesRef = ref(db, `chats/${chat.id}/messages`);
        const msgListener = onValue(messagesRef, (msgSnap) => {
          console.log(`Messages loaded for chat ${chat.id}`); // New log: Per-chat messages
          const msgData = msgSnap.val();
          const msgList = msgData ? Object.entries(msgData).map(([id, msg]) => ({ id, ...msg })) : [];
          setChatMessages(prev => ({ ...prev, [chat.id]: msgList.reverse() }));
        }, (error) => { // Added: Error callback for messages
          console.error(`Messages onValue error for chat ${chat.id}:`, error);
        });
        chatListenersRef.current.push(msgListener);
      });
    }, (error) => { // Added: Error callback for chats listener
      console.error('Chats onValue error:', error);
      setIsLoadingChats(false);
      Alert.alert('Error', 'Failed to load chats. Check permissions or network.');
    });
    chatListenersRef.current.push(listener);
  };
  useEffect(() => {
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      const filtered = chats.filter(chat => {
        const nameMatch = getChatName(chat, currentUserId).toLowerCase().includes(queryLower);
        const messages = chatMessages[chat.id] || [];
        const messageMatch = messages.some(msg => msg.text?.toLowerCase().includes(queryLower));
        return nameMatch || messageMatch;
      });
      console.log('Filtered chats after search:', filtered.length); // New log: Search filter
      setFilteredChats(filtered);
    } else {
      setFilteredChats(chats);
    }
  }, [searchQuery, chats, chatMessages, getChatName, currentUserId]);
  const toggleSearch = () => {
    setShowSearchInput(!showSearchInput);
    if (showSearchInput) {
      setSearchQuery('');
    }
  };
  const handleSelectUser = (user) => {
    if (!selectedUsers.some(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
    setModalSearchQuery('');
  };
  const removeSelectedUser = (userId) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };
  const createNewChat = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one user.');
      return;
    }
    const userIds = [currentUserId, ...selectedUsers.map(u => u.id)];
    const roomId = generateRoomId(userIds);
    const chatRef = ref(db, `chats/${roomId}`);
    const chatSnapshot = await get(chatRef);
    if (!chatSnapshot.exists()) {
      const participants = Object.fromEntries(userIds.map(id => [id, true]));
      await set(chatRef, {
        participants,
        unread: Object.fromEntries(userIds.map(id => [id, 0])),
      });
      for (const id of userIds) {
        const userChatRef = ref(db, `user_chats/${id}/${roomId}`);
        await set(userChatRef, true);
      }
      // Manually add to local state for immediate update
      const newChat = {
        id: roomId,
        participants,
        unread: Object.fromEntries(userIds.map(id => [id, 0])),
      };
      setChats(prev => [...prev, newChat]);
      setFilteredChats(prev => [...prev, newChat]);
    }
    setShowNewChatModal(false);
    setSelectedUsers([]);
    navigation.navigate('Chat', { selectedChatId: roomId });
  };
  const updateChatParticipants = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'At least one user must remain in the chat.');
      return;
    }
    const newUserIds = selectedUsers.map(u => u.id).filter(id => !originalParticipants.includes(id));
    const removedUserIds = originalParticipants.filter(id => !selectedUsers.map(u => u.id).includes(id) && id !== currentUserId);
    const chatRef = ref(db, `chats/${selectedChat.id}`);
    const updates = {};
    newUserIds.forEach(id => {
      updates[`participants/${id}`] = true;
      updates[`unread/${id}`] = 0;
    });
    removedUserIds.forEach(id => {
      updates[`participants/${id}`] = null;
      updates[`unread/${id}`] = null;
    });
    await update(chatRef, updates);
    for (const id of newUserIds) {
      const userChatRef = ref(db, `user_chats/${id}/${selectedChat.id}`);
      await set(userChatRef, true);
    }
    for (const id of removedUserIds) {
      const userChatRef = ref(db, `user_chats/${id}/${selectedChat.id}`);
      await set(userChatRef, null);
    }
    const senderDoc = await getDoc(doc(firestore, 'users', currentUserId));
    const senderName = senderDoc.exists() ? formatUserDisplay(senderDoc.data()) : 'Someone';
    const expoPushTokensAdded = await Promise.all(newUserIds.map(async (id) => {
      const userDoc = await getDoc(doc(firestore, 'users', id));
      return userDoc.data()?.expoPushToken;
    }));
    expoPushTokensAdded.filter(token => token).forEach(token => {
      sendPushNotification(token, `${senderName} added you to a chat.`);
    });
    const expoPushTokensRemoved = await Promise.all(removedUserIds.map(async (id) => {
      const userDoc = await getDoc(doc(firestore, 'users', id));
      return userDoc.data()?.expoPushToken;
    }));
    expoPushTokensRemoved.filter(token => token).forEach(token => {
      sendPushNotification(token, `${senderName} removed you from a chat.`);
    });
    setShowAddUserModal(false);
    setSelectedUsers([]);
    setOriginalParticipants([]);
    setShowParticipantsModal(false);
  };
  const uploadGroupPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant permission to access your media library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileRef = storageRef(storage, `chat_photos/${selectedChat.id}.jpg`);
      await uploadBytes(fileRef, blob);
      const imageUrl = await getDownloadURL(fileRef);
      const chatRef = ref(db, `chats/${selectedChat.id}`);
      await update(chatRef, { profilePhoto: imageUrl });
      Alert.alert('Success', 'Group photo uploaded!');
    }
  };
  const getFilteredUsers = () => {
    if (!selectedChat) return [];
    return availableUsers.filter(user =>
      user.id !== currentUserId &&
      !selectedUsers.some(s => s.id === user.id)
    );
  };
  useEffect(() => {
    if (selectedChat) {
      navigation.setOptions({
        headerLeft: () => null,
      });
      const chatRef = ref(db, `chats/${selectedChat.id}`);
      const messagesRef = ref(db, `chats/${selectedChat.id}/messages`);
      const unreadUpdate = { [currentUserId]: 0 };
      update(chatRef, { unread: unreadUpdate });
      const listener = onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const msgList = Object.entries(data).map(([id, msg]) => ({ id, ...msg })).filter(msg => !msg.deletedFor?.[currentUserId]); // Filter deleted for self
          setMessages(msgList.reverse());
          msgList.forEach(async (msg) => {
            if (msg.senderId !== currentUserId && !msg.readBy?.[currentUserId]) {
              const messageRef = ref(db, `chats/${selectedChat.id}/messages/${msg.id}`);
              await update(messageRef, { readBy: { ...msg.readBy, [currentUserId]: true } });
            }
            if (!senderDataCache[msg.senderId]) {
              const senderDoc = await getDoc(doc(firestore, 'users', msg.senderId));
              if (senderDoc.exists()) {
                setSenderDataCache(prev => ({ ...prev, [msg.senderId]: senderDoc.data() }));
              }
            }
          });
          if (msgList.length > prevMessageCountRef.current) {
            const latestMsg = msgList[0];
            if (latestMsg.senderId !== currentUserId) {
              if (chatNotificationsEnabled && !isDnd) {
                playNotificationSound();
              }
              if (isDnd && awayMessage && !latestMsg.isAutoReply) {
                const autoData = {
                  text: `Auto-reply: ${awayMessage}`,
                  senderId: currentUserId,
                  timestamp: serverTimestamp(),
                  readBy: { [currentUserId]: true },
                  isAutoReply: true,
                };
                sendChatMessage(autoData, false);
              }
            }
          }
          prevMessageCountRef.current = msgList.length;
        } else {
          setMessages([]);
        }
      }, (error) => { // Added: Error callback for selected chat messages
        console.error('Selected chat messages onValue error:', error);
      });
      chatListenersRef.current.push(listener);
      if (matchingMessageIndex !== null) {
        flatListRef.current?.scrollToIndex({ animated: true, index: matchingMessageIndex });
      } else {
        flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
      }
    } else {
      navigation.setOptions({
        headerLeft: undefined,
      });
    }
    return () => {
      if (selectedChat) {
        chatListenersRef.current.forEach(unsub => unsub());
        chatListenersRef.current = [];
      }
    };
  }, [selectedChat, chatNotificationsEnabled, notificationSound, navigation, matchingMessageIndex, isDnd, awayMessage]);
  useEffect(() => {
    // Process messages to insert date dividers
    if (messages.length > 0) {
      const today = new Date().toDateString();
      const processed = [];
      let currentDate = null;
      // From oldest (messages.length - 1) to newest (0)
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgDate = new Date(msg.timestamp).toDateString();
        if (msgDate !== currentDate) {
          const displayDate = msgDate === today ? 'Today' : new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          processed.push({ type: 'date', key: `date-${msgDate}`, date: displayDate });
          currentDate = msgDate;
        }
        processed.push({ ...msg, key: msg.id });
      }
      // Reverse to newest first
      setProcessedMessages(processed.reverse());
    } else {
      setProcessedMessages([]);
    }
  }, [messages]);
  const playNotificationSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.mp3')
      );
      await sound.playAsync();
      await Vibration.vibrate();
    } catch (error) {
      console.error('Error playing sound or vibrating:', error);
    }
  };
  const sendChatMessage = async (messageData, isImage = false, chatId = selectedChat.id) => { // Modified: Accept chatId param for forward
    const chatRef = ref(db, `chats/${chatId}`);
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    const newMessageRef = push(messagesRef);
    await set(newMessageRef, messageData);
    const lastMessageText = isImage ? 'Sent an image' : messageData.text;
    const lastMessageData = {
      text: lastMessageText,
      senderId: currentUserId,
      timestamp: serverTimestamp(),
      readBy: { [currentUserId]: true },
    };
    await update(chatRef, { lastMessage: lastMessageData });
    const chatSnap = await get(chatRef);
    const chatData = chatSnap.val();
    const uids = Object.keys(chatData.participants || {});
    const otherUids = uids.filter(id => id !== currentUserId);
    const unreadUpdates = {};
    otherUids.forEach(id => {
      unreadUpdates[`unread/${id}`] = increment(1);
    });
    await update(chatRef, unreadUpdates);
    const senderDoc = await getDoc(doc(firestore, 'users', currentUserId));
    const senderName = senderDoc.exists() ? formatUserDisplay(senderDoc.data()) : 'Someone';
    const notificationMessage = isImage ? 'sent an image' : messageData.text;
    const recipients = await Promise.all(otherUids.map(async (id) => {
      if (chatData.mutedBy?.[id]) return null; // Skip if muted
      const userDoc = await getDoc(doc(firestore, 'users', id));
      const data = userDoc.data();
      return { token: data?.expoPushToken, dnd: data?.dnd ?? false };
    }));
    recipients.filter(r => r && r.token && !r.dnd).forEach(r => {
      sendPushNotification(r.token, `${senderName}: ${notificationMessage}`);
    });
  };
  const sendMessage = async () => {
    if (newMessage.trim() === '') return;
    const messageData = {
      text: newMessage,
      senderId: currentUserId,
      timestamp: serverTimestamp(),
      readBy: { [currentUserId]: true },
    };
    await sendChatMessage(messageData, false);
    setNewMessage('');
  };
  const pickImage = async () => {
    console.log('pickImage function called');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log('Media library permission status:', status);
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant permission to access your media library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    console.log('Image picker result:', result);
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      console.log('Selected image URI:', uri);
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileRef = storageRef(storage, `chat_images/${selectedChat.id}/${Date.now()}.jpg`);
      await uploadBytes(fileRef, blob);
      const imageUrl = await getDownloadURL(fileRef);
      console.log('Uploaded image URL:', imageUrl);
      const messageData = {
        imageUrl,
        senderId: currentUserId,
        timestamp: serverTimestamp(),
        readBy: { [currentUserId]: true },
      };
      await sendChatMessage(messageData, true);
    } else {
      console.log('Image selection canceled');
    }
  };
  const downloadImage = async (imageUrl) => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await MediaLibrary.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        Alert.alert('Permission required', 'Please grant permission to save images.');
        return;
      }
    }
    try {
      if (Platform.OS === 'ios') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        Vibration.vibrate(10);
      }
      const urlObj = new URL(imageUrl);
      const encodedPath = urlObj.pathname.split('/').pop();
      const decodedPath = decodeURIComponent(encodedPath);
      const cleanFileName = decodedPath.split('/').pop().split('?')[0]; // Remove query params if any
      const localUri = `${FileSystem.cacheDirectory}${cleanFileName}`;
      await FileSystem.downloadAsync(imageUrl, localUri);
      const asset = await MediaLibrary.createAssetAsync(localUri);
      await MediaLibrary.createAlbumAsync('Downloads', asset, false);
      Alert.alert('Success', 'Image saved to gallery!');
      if (Platform.OS === 'ios') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Vibration.vibrate([0, 50, 100, 50]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save image.');
      console.error(error);
    }
  };
  const getReceiptStatus = (message) => {
    const readBy = message.readBy || {};
    const readCount = Object.keys(readBy).length - 1;
    const totalOthers = Object.keys(selectedChat.participants).length - 1;
    if (readCount === totalOthers) {
      return totalOthers === 1 ? 'Read' : 'Read by all';
    } else if (readCount > 0) {
      return `Read by ${readCount}`;
    } else {
      return 'Delivered';
    }
  };
  const handleSetGroupName = async () => {
    if (newGroupName.trim() === '') return;
    const chatRef = ref(db, `chats/${selectedChat.id}`);
    await update(chatRef, { name: newGroupName });
    setShowGroupNameModal(false);
    setNewGroupName('');
  };
  const toggleMute = async () => {
    const isMuted = selectedChat.mutedBy?.[currentUserId] || false;
    const chatRef = ref(db, `chats/${selectedChat.id}`);
    await update(chatRef, { [`mutedBy/${currentUserId}`]: !isMuted ? true : null });
    // Optimistic update
    setSelectedChat(prev => {
      const newMutedBy = { ...prev.mutedBy };
      if (!isMuted) {
        newMutedBy[currentUserId] = true;
      } else {
        delete newMutedBy[currentUserId];
      }
      return { ...prev, mutedBy: newMutedBy };
    });
    setChats(prevChats => prevChats.map(c =>
      c.id === selectedChat.id ? {
        ...c,
        mutedBy: !isMuted ? { ...c.mutedBy, [currentUserId]: true } : Object.fromEntries(Object.entries(c.mutedBy || {}).filter(([k]) => k !== currentUserId))
      } : c
    ));
    setFilteredChats(prevChats => prevChats.map(c =>
      c.id === selectedChat.id ? {
        ...c,
        mutedBy: !isMuted ? { ...c.mutedBy, [currentUserId]: true } : Object.fromEntries(Object.entries(c.mutedBy || {}).filter(([k]) => k !== currentUserId))
      } : c
    ));
  };
  const renderChatItem = ({ item: chat }) => {
    if (!chat) return null;
    const avatar = getChatAvatar(chat, currentUserId);
    const uids = Object.keys(chat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    const userData = otherUids.length === 1 ? availableUsers.find(u => u.id === otherUids[0]) : null;
    const isDndUser = userData?.dnd;
    const isOnline = !isDndUser && userData?.status === 'active';
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('Chat', { selectedChatId: chat.id })}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setSelectedChatForMenu(chat);
          setShowChatMenuModal(true);
        }}
      >
        {avatar.photo ? (
          <Image source={{ uri: avatar.photo }} style={styles.avatar} />
        ) : (
          <View style={styles.initialsCircle}>
            <Text style={styles.initialsText}>{avatar.initials}</Text>
          </View>
        )}
        {otherUids.length === 1 && isDndUser ? <View style={[styles.statusDot, { backgroundColor: 'red' }]} /> : null}
        {otherUids.length === 1 && isOnline ? <View style={styles.statusDot} /> : null}
        <View style={styles.chatInfo}>
          <Text style={styles.chatName}>{getChatName(chat, currentUserId)}</Text>
          <Text style={styles.preview}>{getLastMessagePreview(chat)}</Text>
        </View>
        <View style={styles.chatRight}>
          <Text style={styles.timestamp}>{getTimestamp(chat)}</Text>
          <Text style={styles.receipt}>{getLastMessageReceipt(chat, currentUserId)}</Text>
          {chat.unread?.[currentUserId] > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{chat.unread[currentUserId]}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };
  const handleLongPressMessage = (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectedMessage(message);
    setShowMessageMenuModal(true);
  };
  const deleteMessageForSelf = async (messageId) => {
    const messageRef = ref(db, `chats/${selectedChat.id}/messages/${messageId}`);
    await update(messageRef, { [`deletedFor/${currentUserId}`]: true });
    setShowMessageMenuModal(false);
  };
  const deleteMessageForAll = async (messageId) => {
    const messageRef = ref(db, `chats/${selectedChat.id}/messages/${messageId}`);
    await remove(messageRef);
    setShowMessageMenuModal(false);
  };
  const recallMessage = async (messageId) => {
    await deleteMessageForAll(messageId); // Recall unsends for everyone
    // Trigger notification if needed (e.g., "Message recalled")
    const otherUids = Object.keys(selectedChat.participants).filter(id => id !== currentUserId);
    const expoPushTokens = await Promise.all(otherUids.map(async (id) => {
      const userDoc = await getDoc(doc(firestore, 'users', id));
      return userDoc.data()?.expoPushToken;
    }));
    expoPushTokens.filter(token => token).forEach(token => {
      sendPushNotification(token, 'A message was recalled.');
    });
    setShowMessageMenuModal(false);
  };
  const getOrCreateChatWithUser = async (userId) => {
    const userIds = [currentUserId, userId];
    const roomId = generateRoomId(userIds);
    const existingChat = chats.find(chat => chat.id === roomId);
    if (existingChat) {
      return existingChat.id;
    }
    const participantsObj = Object.fromEntries(userIds.map(id => [id, true]));
    const unreadObj = Object.fromEntries(userIds.map(id => [id, 0]));
    const chatRef = ref(db, `chats/${roomId}`);
    await set(chatRef, {
      participants: participantsObj,
      unread: unreadObj,
    });
    for (const id of userIds) {
      const userChatRef = ref(db, `user_chats/${id}/${roomId}`);
      await set(userChatRef, true);
    }
    // Add to local state
    const newChat = {
      id: roomId,
      participants: participantsObj,
      unread: unreadObj,
      mutedBy: {},
    };
    setChats(prev => [...prev, newChat].sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)));
    setFilteredChats(prev => [...prev, newChat].sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)));
    return roomId;
  };
  const forwardMessageToTargets = async () => {
    console.log('Forward button pressed. Targets:', selectedForwardTargets);
    if (selectedForwardTargets.length === 0) {
      Alert.alert('Error', 'Select at least one target to forward.');
      return;
    }
    let forwardedData = {
      senderId: currentUserId,
      timestamp: serverTimestamp(),
      readBy: { [currentUserId]: true },
      originalSenderId: forwardingMessage.senderId,
    };
    if (forwardingMessage.text) {
      forwardedData.text = forwardingMessage.text;
    }
    if (forwardingMessage.imageUrl) {
      forwardedData.imageUrl = forwardingMessage.imageUrl;
    }
    for (const target of selectedForwardTargets) {
      console.log('Processing target:', target);
      try {
        let chatId;
        if (target.type === 'user') {
          chatId = await getOrCreateChatWithUser(target.id);
        } else if (target.type === 'chat') {
          chatId = target.id;
        }
        console.log('Sending to chatId:', chatId);
        await sendChatMessage(forwardedData, !!forwardingMessage.imageUrl, chatId);
      } catch (error) {
        console.error('Error forwarding to target', target, error);
      }
    }
    setShowForwardModal(false);
    setSelectedForwardTargets([]);
    setForwardingMessage(null);
    setShowMessageMenuModal(false);
    Alert.alert('Success', 'Message forwarded!');
    // Navigate back to inbox
    navigation.navigate('Chat');
  };
  const addForwardTarget = (item) => {
    if (!selectedForwardTargets.some(t => t.id === item.id && t.type === item.type)) {
      setSelectedForwardTargets([...selectedForwardTargets, item]);
    }
    setForwardSearchQuery('');
  };
  const removeForwardTarget = (targetId, type) => {
    setSelectedForwardTargets(selectedForwardTargets.filter(t => !(t.id === targetId && t.type === type)));
  };
  const getForwardDataSet = () => {
    const queryLower = forwardSearchQuery.toLowerCase();
    const usersData = availableUsers.filter(u => u.id !== currentUserId && !selectedForwardTargets.some(t => t.id === u.id && t.type === 'user') && formatUserDisplay(u).toLowerCase().includes(queryLower))
      .map(u => ({ id: u.id, title: formatUserDisplay(u), type: 'user' }));
    const chatsData = chats.filter(c => Object.keys(c.participants).length > 2 && !selectedForwardTargets.some(t => t.id === c.id && t.type === 'chat') && getChatName(c, currentUserId).toLowerCase().includes(queryLower))
      .map(c => ({ id: c.id, title: getChatName(c, currentUserId), type: 'chat' }));
    const combined = [...usersData, ...chatsData].sort((a, b) => a.title.localeCompare(b.title));
    return combined;
  };
  const handleDeleteChat = async () => {
    const chatId = selectedChatForMenu.id;
    const chatRef = ref(db, `chats/${chatId}`);
    const snap = await get(chatRef);
    if (!snap.exists()) return;
    const chatData = snap.val();
    const participants = chatData.participants || {};
    delete participants[currentUserId];
    const remainingParticipants = Object.keys(participants);
    if (remainingParticipants.length < 2) {
      // Delete the entire chat if fewer than 2 participants left
      await remove(chatRef);
      // Remove from remaining user's user_chats if any
      if (remainingParticipants.length === 1) {
        const remainingUserId = remainingParticipants[0];
        const userChatRef = ref(db, `user_chats/${remainingUserId}/${chatId}`);
        await remove(userChatRef);
      }
    } else {
      // Update participants
      await update(chatRef, { participants });
      // Notify others
      const senderDoc = await getDoc(doc(firestore, 'users', currentUserId));
      const senderName = senderDoc.exists() ? formatUserDisplay(senderDoc.data()) : 'Someone';
      const expoPushTokens = await Promise.all(remainingParticipants.map(async (id) => {
        const userDoc = await getDoc(doc(firestore, 'users', id));
        return userDoc.data()?.expoPushToken;
      }));
      expoPushTokens.filter(token => token).forEach(token => {
        sendPushNotification(token, `${senderName} left the chat.`);
      });
    }
    // Remove from own user_chats
    const userChatRef = ref(db, `user_chats/${currentUserId}/${chatId}`);
    await remove(userChatRef);
    // Update local state
    setChats(prev => prev.filter(c => c.id !== chatId));
    setFilteredChats(prev => prev.filter(c => c.id !== chatId));
    setShowChatMenuModal(false);
    setSelectedChatForMenu(null);
  };
  const renderMessageItem = ({ item }) => {
    if (item.type === 'date') {
      return (
        <View style={styles.dateDividerContainer}>
          <Text style={styles.dateDividerText}>{item.date}</Text>
        </View>
      );
    }
    const isSender = item.senderId === currentUserId;
    const senderData = senderDataCache[item.senderId] || {};
    const avatar = senderData.profilePhoto;
    const initials = getInitials(senderData);
    const dynamicFontSize = Animated.multiply(lastScale.current, fontScale).interpolate({
      inputRange: [0.75, 1.5],
      outputRange: [12, 24],
      extrapolate: 'clamp',
    });
    const messageTime = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const originalName = item.originalSenderId ? formatUserDisplay(senderDataCache[item.originalSenderId] || {}) : null;
    const forwarderName = formatUserDisplay(senderDataCache[item.senderId] || {});
    const forwardedLabel = originalName ? `Forwarded from ${originalName}${originalName === forwarderName ? '' : ' by ' + forwarderName}` : null;
    const isDndSender = senderData.dnd;
    const isOnlineSender = !isDndSender && senderData.status === 'active';
    const isGroupChat = Object.keys(selectedChat.participants).length > 2;
    return (
      <View style={[styles.messageContainer, isSender ? styles.senderContainer : styles.receiverContainer]}>
        {!isSender ? (
          <View style={{ marginRight: 5 }}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.messageAvatar} />
            ) : (
              <View style={styles.messageInitialsCircle}>
                <Text style={styles.messageInitialsText}>{initials}</Text>
              </View>
            )}
            {isDndSender ? <View style={[styles.statusDot, { backgroundColor: 'red', position: 'absolute', bottom: -2, right: -2 }]} /> : null}
            {!isDndSender && isOnlineSender ? <View style={[styles.statusDot, { backgroundColor: 'green', position: 'absolute', bottom: -2, right: -2 }]} /> : null}
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.bubble, isSender ? styles.senderBubble : styles.receiverBubble]}
          onPress={() => item.imageUrl && (setIsProfileImage(false), setIsImageLoading(true), setSelectedImage(item.imageUrl))}
          onLongPress={() => handleLongPressMessage(item)}
        >
          {!isSender && isGroupChat && <Text style={styles.senderName}>{formatUserDisplay(senderData)}</Text>}
          {forwardedLabel && <Text style={styles.forwardedLabel}>{forwardedLabel}</Text>}
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.messageImage}
              onLoadEnd={() => setIsImageLoading(false)}
            />
          ) : (
            <Animated.Text style={[styles.messageText, item.isAutoReply && { fontStyle: 'italic' }, { fontSize: dynamicFontSize }]}>{item.text}</Animated.Text>
          )}
          <View style={styles.messageBottom}>
            <Text style={styles.messageTimestamp}>{messageTime}</Text>
            {isSender && <Text style={styles.receipt}>{getReceiptStatus(item)}</Text>}
          </View>
        </TouchableOpacity>
      </View>
    );
  };
  const getChatParticipants = () => {
    if (!selectedChat) return [];
    const uids = Object.keys(selectedChat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    return otherUids.map(id => availableUsers.find(u => u.id === id) || { id });
  };
  const isGroupChat = selectedChat ? Object.keys(selectedChat.participants).length > 2 : false;
  const otherUids = selectedChat ? Object.keys(selectedChat.participants).filter(id => id !== currentUserId) : [];
  const profilePhoto = selectedChat && otherUids.length === 1 ? getChatAvatar(selectedChat, currentUserId).photo : null;
  useEffect(() => {
    const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
      if (selectedChat) {
        e.preventDefault();
        setSelectedChat(null);
        navigation.setParams({ selectedChatId: undefined });
      }
    });
    return () => {
      beforeRemoveListener();
    };
  }, [navigation, selectedChat]);
  useEffect(() => {
    lastScale.current = 1;
    fontScale.setValue(1);
  }, [selectedChat]);
  const onPinchEvent = Animated.event([{ nativeEvent: { scale: fontScale } }], { useNativeDriver: false });
  const onPinchEnd = () => {
    lastScale.current *= fontScale._value;
    if (lastScale.current > 1.5) lastScale.current = 1.5;
    if (lastScale.current < 0.75) lastScale.current = 0.75;
    fontScale.setValue(1);
  };
  useEffect(() => {
    if (showAddUserModal && selectedChat) {
      const currentOtherParticipants = getChatParticipants();
      setSelectedUsers(currentOtherParticipants);
      setOriginalParticipants(currentOtherParticipants.map(p => p.id));
      console.log('Participants Modal Opened - Available Users Count:', availableUsers.length);
      if (availableUsers.length > 0) {
        console.log('Sample Available User:', availableUsers[0]);
      } else {
        console.log('No available users loaded for dropdown.');
      }
    }
  }, [showAddUserModal, selectedChat, availableUsers]);
  useFocusEffect(
    useCallback(() => {
      if (!selectedChat) {
        listenToChats(currentUserId);
      }
    }, [currentUserId])
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={['#d4e6f1', '#ffffff']} style={styles.container}>
        {!selectedChat ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Chats</Text>
              {currentUserRole === 'administrator' && (
                <View style={styles.toggleContainer}>
                  <Text>Own</Text>
                  <Switch
                    value={viewMode === 'all'}
                    onValueChange={(val) => setViewMode(val ? 'all' : 'own')}
                  />
                  <Text>All</Text>
                </View>
              )}
              <TouchableOpacity onPress={toggleSearch}>
                <MaterialIcons name="search" size={24} color="#333333" />
              </TouchableOpacity>
            </View>
            {showSearchInput ? (
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <Button title="Cancel" onPress={toggleSearch} color="#A7C7E7" />
              </View>
            ) : null}
            {isLoadingChats ? (
              <ActivityIndicator size="large" color="#A7C7E7" style={styles.loading} />
            ) : filteredChats.length === 0 ? (
              <Text style={styles.emptyText}>No chats available</Text>
            ) : (
              <FlatList
                data={filteredChats}
                renderItem={renderChatItem}
                keyExtractor={item => item.id}
              />
            )}
            <TouchableOpacity style={styles.fab} onPress={() => setShowNewChatModal(true)}>
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
            <Modal
              visible={showNewChatModal}
              animationType="slide"
              onRequestClose={() => setShowNewChatModal(false)}
            >
              <LinearGradient colors={['#d4e6f1', '#ffffff']} style={styles.modalGradient}>
                <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} >
                  <AutocompleteDropdownContextProvider>
                    <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                      <Text style={styles.modalTitle}>Start New Chat</Text>
                      {AutocompleteDropdown ? (
                        <AutocompleteDropdown
                          clearOnFocus={false}
                          closeOnBlur={true}
                          closeOnSubmit={false}
                          direction="down"
                          suggestionsListContainerStyle={{
                            maxHeight: 200,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#DDDDDD',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.25,
                            shadowRadius: 3.84,
                            elevation: 5,
                            zIndex: 1000,
                            position: 'absolute',
                            left: 0,
                            right: 0,
                          }}
                          suggestionsListTextStyle={{ color: '#000000', fontSize: 16 }}
                          inputContainerStyle={{
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#A7C7E7',
                            borderRadius: 5,
                          }}
                          textInputProps={{
                            placeholder: 'Search Users',
                            placeholderTextColor: 'lightgray',
                            style: { color: '#000000', padding: 10 },
                          }}
                          dataSet={availableUsers.filter(user => user.id !== currentUserId).map(user => ({ id: user.id, title: formatUserDisplay(user) }))}
                          onSelectItem={(item) => { if (item) handleSelectUser(availableUsers.find(u => u.id === item.id)); }}
                          useFilter={true}
                          containerStyle={styles.dropdownContainer}
                        />
                      ) : (
                        <View>
                          <TextInput
                            style={styles.searchInput}
                            placeholder="Search Users"
                            value={modalSearchQuery}
                            onChangeText={setModalSearchQuery}
                          />
                          <FlatList
                            data={availableUsers.filter(user => user.id !== currentUserId && formatUserDisplay(user).toLowerCase().includes(modalSearchQuery.toLowerCase()))}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => (
                              <TouchableOpacity onPress={() => handleSelectUser(item)}>
                                <Text style={styles.userItemText}>{formatUserDisplay(item)}</Text>
                              </TouchableOpacity>
                            )}
                          />
                        </View>
                      )}
                      <Text>Selected Users:</Text>
                      {selectedUsers.map(user => (
                        <View key={user.id} style={styles.selectedUserItem}>
                          <Text>{formatUserDisplay(user)}</Text>
                          <TouchableOpacity onPress={() => removeSelectedUser(user.id)}>
                            <Text style={styles.removeText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      <Button title="Create Chat" onPress={createNewChat} color="#A7C7E7" />
                      <Button title="Cancel" onPress={() => setShowNewChatModal(false)} color="#A7C7E7" />
                    </ScrollView>
                  </AutocompleteDropdownContextProvider>
                </KeyboardAvoidingView>
              </LinearGradient>
            </Modal>
          </>
        ) : (
          <View style={styles.chatViewContainer}>
            <View style={styles.chatTitleContainer}>
              <View>
                {getChatAvatar(selectedChat, currentUserId).photo ? (
                  <TouchableOpacity onPress={() => profilePhoto && (setIsProfileImage(true), setSelectedImage(profilePhoto))}>
                    <Image source={{ uri: getChatAvatar(selectedChat, currentUserId).photo }} style={styles.chatTitleAvatar} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.chatTitleInitialsCircle}>
                    <Text style={styles.chatTitleInitialsText}>{getChatAvatar(selectedChat, currentUserId).initials}</Text>
                  </View>
                )}
                {otherUids.length === 1 && availableUsers.find(u => u.id === otherUids[0])?.dnd ? <View style={[styles.statusDot, { backgroundColor: 'red', position: 'absolute', bottom: -2, right: -2 }]} /> : null}
                {otherUids.length === 1 && !availableUsers.find(u => u.id === otherUids[0])?.dnd && availableUsers.find(u => u.id === otherUids[0])?.status === 'active' ? <View style={[styles.statusDot, { backgroundColor: 'green', position: 'absolute', bottom: -2, right: -2 }]} /> : null}
              </View>
              <TouchableOpacity
                onPress={isGroupChat ? () => setShowGroupNameModal(true) : null}
                disabled={!isGroupChat}
              >
                <Text style={styles.chatTitle}>{getChatName(selectedChat, currentUserId)}</Text>
              </TouchableOpacity>
              {otherUids.length > 0 ? (
                <TouchableOpacity onPress={() => setShowParticipantsModal(true)}>
                  <MaterialIcons name="group" size={24} color="#4682B4" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={toggleMute}>
                <MaterialIcons
                  name={selectedChat.mutedBy?.[currentUserId] ? "notifications-off" : "notifications"}
                  size={24}
                  color={selectedChat.mutedBy?.[currentUserId] ? "red" : "#4682B4"}
                />
              </TouchableOpacity>
            </View>
            <PinchGestureHandler
              onGestureEvent={onPinchEvent}
              onEnded={onPinchEnd}
            >
              <Animated.View style={{ flex: 1 }}>
                <FlatList
                  data={processedMessages}
                  renderItem={renderMessageItem}
                  keyExtractor={item => item.key}
                  inverted
                  ref={flatListRef}
                />
              </Animated.View>
            </PinchGestureHandler>
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
                <MaterialIcons name="attach-file" size={24} color="#A7C7E7" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                value={newMessage}
                onChangeText={setNewMessage}
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                <MaterialIcons name="send" size={24} color="#A7C7E7" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Modal
          visible={showParticipantsModal}
          animationType="slide"
          onRequestClose={() => setShowParticipantsModal(false)}
        >
          <LinearGradient colors={['#d4e6f1', '#ffffff']} style={styles.modalGradient}>
            <View style={styles.modalHeader}>
              {isGroupChat ? (
                <TouchableOpacity onPress={uploadGroupPhoto} style={{ marginBottom: 10 }}>
                  {selectedChat.profilePhoto ? (
                    <Image source={{ uri: selectedChat.profilePhoto }} style={styles.groupPhoto} />
                  ) : (
                    <View style={styles.groupPhotoPlaceholder}>
                      <Text style={styles.placeholderText}>Add Group Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null}
              <Text style={styles.modalTitle}>Participants</Text>
            </View>
            <FlatList
              data={getChatParticipants()}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <Text style={styles.userItemText}>{formatUserDisplay(item)}</Text>
              )}
              style={styles.participantsList}
            />
            <TouchableOpacity style={[styles.fab, { bottom: 70 }]} onPress={() => setShowAddUserModal(true)}>
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
            <Button title="Close" onPress={() => setShowParticipantsModal(false)} color="#A7C7E7" />
          </LinearGradient>
        </Modal>
        <Modal
          visible={showAddUserModal}
          animationType="slide"
          onRequestClose={() => setShowAddUserModal(false)}
        >
          <LinearGradient colors={['#d4e6f1', '#ffffff']} style={styles.modalGradient}>
            <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} >
              <AutocompleteDropdownContextProvider>
                <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitle}>Manage Chat Participants</Text>
                  {AutocompleteDropdown ? (
                    <AutocompleteDropdown
                      clearOnFocus={false}
                      closeOnBlur={true}
                      closeOnSubmit={false}
                      direction="down"
                      suggestionsListContainerStyle={{
                        maxHeight: 200,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#DDDDDD',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 3.84,
                        elevation: 5,
                        zIndex: 1000,
                        position: 'absolute',
                        left: 0,
                        right: 0,
                      }}
                      suggestionsListTextStyle={{ color: '#000000', fontSize: 16 }}
                      inputContainerStyle={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#A7C7E7',
                        borderRadius: 5,
                      }}
                      textInputProps={{
                        placeholder: 'Search Users',
                        placeholderTextColor: 'lightgray',
                        style: { color: '#000000', padding: 10 },
                      }}
                      dataSet={getFilteredUsers().map(user => ({ id: user.id, title: formatUserDisplay(user) }))}
                      onSelectItem={(item) => { if (item) handleSelectUser(availableUsers.find(u => u.id === item.id)); }}
                      useFilter={true}
                      containerStyle={styles.dropdownContainer}
                    />
                  ) : (
                    <View>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search Users"
                        value={addUserSearchQuery}
                        onChangeText={setAddUserSearchQuery}
                      />
                      <FlatList
                        data={getFilteredUsers().filter(user => formatUserDisplay(user).toLowerCase().includes(addUserSearchQuery.toLowerCase()))}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                          <TouchableOpacity onPress={() => handleSelectUser(item)}>
                            <Text style={styles.userItemText}>{formatUserDisplay(item)}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                  <Text style={styles.selectedUsersTitle}>Chat Participants:</Text>
                  {selectedUsers.map(user => (
                    <View key={user.id} style={styles.selectedUserItem}>
                      <Text>{formatUserDisplay(user)}</Text>
                      <TouchableOpacity onPress={() => removeSelectedUser(user.id)}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <Button title="Save Changes" onPress={updateChatParticipants} color="#A7C7E7" />
                  <Button title="Cancel" onPress={() => { setShowAddUserModal(false); setSelectedUsers([]); setOriginalParticipants([]); }} color="#A7C7E7" />
                </ScrollView>
              </AutocompleteDropdownContextProvider>
            </KeyboardAvoidingView>
          </LinearGradient>
        </Modal>
        <Modal
          visible={showGroupNameModal}
          animationType="slide"
          onRequestClose={() => setShowGroupNameModal(false)}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Set Group Name</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter group name..."
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <Button title="Save" onPress={handleSetGroupName} color="#A7C7E7" />
            <Button title="Cancel" onPress={() => setShowGroupNameModal(false)} color="#A7C7E7" />
          </View>
        </Modal>
        <Modal
          visible={!!selectedImage}
          animationType="fade"
          onRequestClose={() => setSelectedImage(null)}
        >
          <View style={styles.fullImageModal}>
            {isImageLoading ? <ActivityIndicator size="large" color="#FFF" style={styles.imageLoading} /> : null}
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
              resizeMode="contain"
              onLoadEnd={() => setIsImageLoading(false)}
              onError={(e) => {
                console.error('Image load error:', e.nativeEvent.error, 'URI:', selectedImage);
                setIsImageLoading(false);
                setSelectedImage(null);
                Alert.alert('Error', 'Failed to load image. Please check your internet connection or try again later.');
              }}
            />
            {!isProfileImage ? (
              <TouchableOpacity style={styles.downloadButton} onPress={() => downloadImage(selectedImage)}>
                <MaterialIcons name="file-download" size={30} color="#FFF" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedImage(null)}>
              <MaterialIcons name="close" size={30} color="#FFF" />
            </TouchableOpacity>
          </View>
        </Modal>
        {/* Message Menu Modal */}
        <Modal
          visible={showMessageMenuModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowMessageMenuModal(false)}
        >
          <View style={styles.menuModalContainer}>
            <View style={styles.menuModalContent}>
              <Button title="Forward" onPress={() => { setForwardingMessage(selectedMessage); setShowForwardModal(true); setShowMessageMenuModal(false); }} color="#A7C7E7" />
              <Button title={currentUserRole === 'administrator' && viewMode === 'all' ? 'Delete for All' : 'Delete'} onPress={() => {
                if (currentUserRole === 'administrator' && viewMode === 'all') {
                  deleteMessageForAll(selectedMessage.id);
                } else {
                  deleteMessageForSelf(selectedMessage.id);
                }
              }} color="#A7C7E7" />
              {selectedMessage?.senderId === currentUserId && (
                <Button title="Recall" onPress={() => recallMessage(selectedMessage.id)} color="#A7C7E7" />
              )}
              <Button title="Cancel" onPress={() => setShowMessageMenuModal(false)} color="#A7C7E7" />
            </View>
          </View>
        </Modal>
        {/* Forward Modal */}
        <Modal
          visible={showForwardModal}
          animationType="slide"
          onRequestClose={() => setShowForwardModal(false)}
        >
          <LinearGradient colors={['#d4e6f1', '#ffffff']} style={styles.modalGradient}>
            <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} >
              <AutocompleteDropdownContextProvider>
                <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitle}>Forward Message</Text>
                  {AutocompleteDropdown ? (
                    <AutocompleteDropdown
                      clearOnFocus={false}
                      closeOnBlur={true}
                      closeOnSubmit={false}
                      direction="down"
                      suggestionsListContainerStyle={{
                        maxHeight: 200,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#DDDDDD',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 3.84,
                        elevation: 5,
                        zIndex: 1000,
                        position: 'absolute',
                        left: 0,
                        right: 0,
                      }}
                      suggestionsListTextStyle={{ color: '#000000', fontSize: 16 }}
                      inputContainerStyle={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#A7C7E7',
                        borderRadius: 5,
                      }}
                      textInputProps={{
                        placeholder: 'Search Users or Groups',
                        placeholderTextColor: 'lightgray',
                        style: { color: '#000000', padding: 10 },
                        value: forwardSearchQuery,
                        onChangeText: setForwardSearchQuery,
                      }}
                      dataSet={getForwardDataSet()}
                      onSelectItem={(item) => { if (item) { addForwardTarget(item); setForwardSearchQuery(''); } }}
                      useFilter={true}
                      containerStyle={styles.dropdownContainer}
                    />
                  ) : (
                    <View>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search Users or Groups"
                        value={forwardSearchQuery}
                        onChangeText={setForwardSearchQuery}
                      />
                      <FlatList
                        data={getForwardDataSet()}
                        keyExtractor={item => `${item.type}-${item.id}`}
                        renderItem={({ item }) => (
                          <TouchableOpacity onPress={() => { addForwardTarget(item); setForwardSearchQuery(''); }}>
                            <Text style={styles.userItemText}>{item.title}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                  <Text style={styles.selectedUsersTitle}>Selected Targets for Forwarding:</Text>
                  {selectedForwardTargets.map(target => (
                    <View key={`${target.type}-${target.id}`} style={styles.selectedUserItem}>
                      <Text>{target.title}</Text>
                      <TouchableOpacity onPress={() => removeForwardTarget(target.id, target.type)}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <Button title="Forward" onPress={forwardMessageToTargets} color="#A7C7E7" />
                  <Button title="Cancel" onPress={() => { setShowForwardModal(false); setSelectedForwardTargets([]); setForwardSearchQuery(''); }} color="#A7C7E7" />
                </ScrollView>
              </AutocompleteDropdownContextProvider>
            </KeyboardAvoidingView>
          </LinearGradient>
        </Modal>
        {/* Chat Menu Modal */}
        <Modal
          visible={showChatMenuModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowChatMenuModal(false)}
        >
          <View style={styles.menuModalContainer}>
            <View style={styles.menuModalContent}>
              <Button title="Delete" onPress={handleDeleteChat} color="#A7C7E7" />
              <Button title="Cancel" onPress={() => setShowChatMenuModal(false)} color="#A7C7E7" />
            </View>
          </View>
        </Modal>
        {/* DND Modal */}
        <Modal
          visible={showDndModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowDndModal(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '80%' }}
              keyboardVerticalOffset={150}
            >
              <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
                <View style={{ backgroundColor: '#FFF', padding: 20, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 }}>
                  <Text>Enter Away Message (optional):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: '#FFF', color: '#000' }]}
                    value={tempAwayMessage}
                    onChangeText={setTempAwayMessage}
                    placeholder="I'm away..."
                    autoFocus={true}
                    multiline={true}
                    returnKeyType="done"
                  />
                  <Button title="Confirm" onPress={confirmDnd} color="#A7C7E7" />
                  <Button title="Cancel" onPress={() => { setShowDndModal(false); setIsDnd(false); }} color="#A7C7E7" />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333333' },
  searchIcon: { fontSize: 24, color: '#A7C7E7' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#A7C7E7', padding: 10, borderRadius: 5, backgroundColor: '#FFF', marginRight: 10 },
  emptyText: { textAlign: 'center', color: 'gray', marginTop: 20 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatItem: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  initialsCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center' },
  initialsText: { color: '#FFF', fontSize: 20 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'green', position: 'absolute', bottom: -2, right: -2 },
  chatInfo: { flex: 1, marginLeft: 10 },
  chatName: { fontWeight: 'bold' },
  preview: { color: 'gray' },
  chatRight: { alignItems: 'flex-end' },
  timestamp: { color: 'gray', fontSize: 12 },
  unreadBadge: { backgroundColor: 'red', borderRadius: 10, padding: 5, marginTop: 5 },
  unreadText: { color: '#FFF', fontSize: 12 },
  receipt: { color: '#4CAF50', fontSize: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#A7C7E7', padding: 10, marginVertical: 10, borderRadius: 5 },
  message: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7' },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: '#A7C7E7', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  fabText: { color: '#FFF', fontSize: 30 },
  modalGradient: { flex: 1 },
  modalKeyboardView: { flex: 1 },
  modalScrollContent: { padding: 20, flexGrow: 1 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  selectedUserItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 5 },
  removeText: { color: 'red' },
  userItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7', backgroundColor: '#FFF' },
  userItemText: { color: '#000' },
  chatViewContainer: { flex: 1 },
  chatTitleContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  chatTitleAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  chatTitleInitialsCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  chatTitleInitialsText: { color: '#FFF', fontSize: 16 },
  chatTitle: { fontSize: 24, fontWeight: 'bold', color: '#333333' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  attachButton: { marginRight: 10, padding: 10 },
  sendButton: { marginLeft: 10, padding: 10 },
  dividerContainer: { alignItems: 'center', marginVertical: 10 },
  dividerText: { color: 'gray', fontSize: 12, backgroundColor: '#F0F0F0', paddingHorizontal: 10 },
  messageContainer: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 5, paddingHorizontal: 10 },
  senderContainer: { justifyContent: 'flex-end' },
  receiverContainer: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '70%', padding: 10, borderRadius: 20 },
  senderBubble: { backgroundColor: '#A7C7E7', marginLeft: 10 },
  receiverBubble: { backgroundColor: '#E0E0E0', marginRight: 10 },
  messageText: { color: '#000' },
  messageTimestamp: { fontSize: 10, color: '#555555', marginLeft: 5 },
  messageAvatar: { width: 30, height: 30, borderRadius: 15 },
  messageInitialsCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center' },
  messageInitialsText: { color: '#FFF', fontSize: 12 },
  messageStatus: { fontSize: 10, alignSelf: 'flex-end', fontWeight: 'bold' },
  messageImage: { width: 200, height: 200, borderRadius: 10 },
  fullImageModal: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: 40, right: 20 },
  downloadButton: { position: 'absolute', top: 40, left: 20 },
  imageLoading: { position: 'absolute', zIndex: 1 },
  modalHeader: { flexDirection: 'column', alignItems: 'center', marginBottom: 10 },
  addUserButton: { padding: 10 },
  uploadPhotoButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  participantsList: { marginTop: 20 },
  groupPhoto: { width: 100, height: 100, borderRadius: 50 },
  groupPhotoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#DDD', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { textAlign: 'center' },
  enhancedSearchInput: { flex: 1, borderWidth: 1, borderColor: '#A7C7E7', padding: 15, borderRadius: 10, backgroundColor: '#FFF', marginBottom: 20, fontSize: 16, color: '#000' },
  selectedUsersTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 10 },
  dropdownContainer: { marginBottom: 20 },
  toggleContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  menuModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  menuModalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 10, width: '80%' },
  forwardChatItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7' },
  dateDividerContainer: { alignItems: 'center', marginVertical: 10 },
  dateDividerText: { color: 'gray', fontSize: 12, backgroundColor: '#F0F0F0', paddingHorizontal: 10, borderRadius: 10 },
  forwardedLabel: { fontSize: 12, color: 'gray', marginBottom: 5 },
  senderName: { fontSize: 12, color: 'gray', marginBottom: 2 },
  messageBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 5 },
});