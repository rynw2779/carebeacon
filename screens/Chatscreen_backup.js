import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Image, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth, db, firestore } from '../firebaseConfig';
import { ref, onValue, push, set, serverTimestamp, update, get, increment } from 'firebase/database';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';

let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
  AutocompleteDropdown = null;
}
AutocompleteDropdown = null;

export const formatUserDisplay = (user) => {
  const lastName = user?.lastName || '';
  const firstName = user?.firstName || '';
  return `${firstName} ${lastName}`.trim() || 'Unknown User';
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
  return chat.lastMessage?.text?.substring(0, 50) || 'Chat started';
};

const getTimestamp = (chat) => {
  const ts = chat.lastMessage?.timestamp;
  return ts ? new Date(ts).toLocaleTimeString() : '';
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
  const [chatMessages, setChatMessages] = useState({});
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [senderDataCache, setSenderDataCache] = useState({});
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const flatListRef = useRef(null);
  const currentUserId = auth.currentUser?.uid;

  // Moved inside: Function to get chat name, now with access to availableUsers
  const getChatName = useCallback((chat, currentUserId) => {
    if (!chat.participants || Object.keys(chat.participants).length === 0) {
      return 'Unknown Chat';
    }
    const uids = Object.keys(chat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    if (otherUids.length === 0) {
      return 'Unknown Chat';
    }
    // Safeguard: If users not loaded yet, show placeholder
    if (!availableUsers || availableUsers.length === 0) {
      return 'Loading...';
    }
    const otherParticipants = otherUids.map(id => availableUsers.find(u => u.id === id) || { id });
    if (otherParticipants.length === 1) {
      return formatUserDisplay(otherParticipants[0]);
    } else {
      const names = otherParticipants.map(p => formatUserDisplay(p)).join(', ');
      return names.length > 30 ? 'Group Chat' : names;
    }
  }, [availableUsers]);

  // Moved inside: Function to get chat avatar, now with access to availableUsers
  const getChatAvatar = useCallback((chat, currentUserId) => {
    if (!chat.participants || Object.keys(chat.participants).length === 0) {
      return {
        photo: null,
        initials: '?',
      };
    }
    const uids = Object.keys(chat.participants);
    const otherUids = uids.filter(id => id !== currentUserId);
    // Safeguard: If users not loaded yet, show default
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
    async function loadUsersAndChats() {
      const user = auth.currentUser;
      if (user) {
        console.log('Loading data for user:', user.uid);
        try {
          const userDoc = await getDoc(doc(firestore, 'users', user.uid));
          if (userDoc.exists()) {
            const role = userDoc.data().role;
            setCurrentUserRole(role);
            console.log('User role:', role);
            let userList = [];
            if (role === 'administrator' || role === 'nurse' || role === 'aide' || role === 'MSW' || role === 'chaplain') {
              const querySnapshot = await getDocs(collection(firestore, 'users'));
              userList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
            } else if (role === 'patient' || role === 'POA') {
              const assignedStaff = userDoc.data().assignedStaff || [];
              userList = await Promise.all(assignedStaff.map(async (staffId) => {
                const staffDoc = await getDoc(doc(firestore, 'users', staffId));
                return staffDoc.exists() ? { id: staffId, ...staffDoc.data() } : null;
              })).filter(u => u !== null);
            }
            setAvailableUsers(userList);
            console.log('Available users loaded:', userList.length);
          }

          const chatsRef = ref(db, 'chats');
          onValue(chatsRef, (snapshot) => {
            const chatsData = snapshot.val() || {};
            const chatList = Object.entries(chatsData)
              .filter(([_, chat]) => chat.participants && chat.participants[user.uid])
              .map(([id, chat]) => ({ id, ...chat }));
            setChats(chatList.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)));
            setIsLoadingChats(false);
          });
        } catch (error) {
          console.error('Error loading users and chats:', error);
          setIsLoadingChats(false);
        }
      }
    }
    loadUsersAndChats();
  }, []);

  useEffect(() => {
    setFilteredChats(
      chats.filter(chat =>
        getChatName(chat, currentUserId).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [searchQuery, chats, currentUserId, getChatName]);

  useEffect(() => {
    if (selectedChat) {
      const messagesRef = ref(db, `chats/${selectedChat.id}/messages`);
      onValue(messagesRef, (snapshot) => {
        const messagesData = snapshot.val() || {};
        const messageList = Object.entries(messagesData).map(([id, msg]) => ({ id, ...msg }));
        setMessages(messageList.sort((a, b) => a.timestamp - b.timestamp));
      });

      // Mark messages as read
      const unreadRef = ref(db, `chats/${selectedChat.id}/unread/${currentUserId}`);
      set(unreadRef, 0);
    }
  }, [selectedChat, currentUserId]);

  const toggleSearch = () => {
    setShowSearchInput(!showSearchInput);
    setSearchQuery('');
  };

  const startNewChat = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('No users selected');
      return;
    }
    const userIds = [...selectedUsers.map(u => u.id), currentUserId];
    const roomId = generateRoomId(userIds);
    const chatRef = ref(db, `chats/${roomId}`);
    const chatSnapshot = await get(chatRef);
    if (!chatSnapshot.exists()) {
      const participants = userIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      const unread = userIds.reduce((acc, id) => ({ ...acc, [id]: 0 }), {});
      await set(chatRef, {
        participants,
        unread,
        lastMessage: { text: 'Chat created', timestamp: serverTimestamp() },
      });
    }
    setShowNewChatModal(false);
    setSelectedUsers([]);
  };

  const sendMessage = async () => {
    if (newMessage.trim() === '') return;
    const messageRef = push(ref(db, `chats/${selectedChat.id}/messages`));
    const messageData = {
      text: newMessage,
      senderId: currentUserId,
      timestamp: serverTimestamp(),
      readBy: [currentUserId],
    };
    await set(messageRef, messageData);
    await update(ref(db, `chats/${selectedChat.id}`), {
      lastMessage: messageData,
    });
    const participants = Object.keys(selectedChat.participants);
    participants.forEach(async (uid) => {
      if (uid !== currentUserId) {
        await update(ref(db, `chats/${selectedChat.id}/unread/${uid}`), increment(1));
      }
    });
    setNewMessage('');
    flatListRef.current.scrollToEnd({ animated: true });
  };

  const toggleUserSelection = (user) => {
    setSelectedUsers(prev =>
      prev.some(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  };

  const renderChatItem = ({ item }) => {
    const avatar = getChatAvatar(item, currentUserId);
    const unreadCount = item.unread?.[currentUserId] || 0;
    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => setSelectedChat(item)}>
        {avatar.photo ? (
          <Image source={{ uri: avatar.photo }} style={styles.avatar} />
        ) : (
          <View style={styles.initialsCircle}>
            <Text style={styles.initialsText}>{avatar.initials}</Text>
          </View>
        )}
        <View style={styles.statusDot} />
        <View style={styles.chatInfo}>
          <Text style={styles.chatName}>{getChatName(item, currentUserId)}</Text>
          <Text style={styles.preview}>{getLastMessagePreview(item)}</Text>
        </View>
        <View style={styles.chatRight}>
          <Text style={styles.timestamp}>{getTimestamp(item)}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item }) => {
    const isSender = item.senderId === currentUserId;
    const sender = senderDataCache[item.senderId] || { firstName: 'Unknown', lastName: '' };
    return (
      <View style={[styles.messageContainer, isSender ? styles.senderContainer : styles.receiverContainer]}>
        {!isSender && (
          sender.profilePhoto ? (
            <Image source={{ uri: sender.profilePhoto }} style={styles.messageAvatar} />
          ) : (
            <View style={styles.messageInitialsCircle}>
              <Text style={styles.messageInitialsText}>{getInitials(sender)}</Text>
            </View>
          )
        )}
        <View style={[styles.bubble, isSender ? styles.senderBubble : styles.receiverBubble]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.messageTimestamp}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </View>
        {isSender && (
          <Text style={styles.messageStatus}>
            {item.readBy?.length === Object.keys(selectedChat.participants).length ? 'Read' : 'Sent'}
          </Text>
        )}
      </View>
    );
  };

  // Extra safeguard: If availableUsers is still loading/empty, show a message instead of crashing
  if (isLoadingChats || availableUsers.length === 0) {
    return <ActivityIndicator style={styles.loading} size="large" color="#A7C7E7" />;
  }

  return (
    <View style={styles.container}>
      {!selectedChat ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Chats</Text>
            <TouchableOpacity onPress={toggleSearch}>
              <MaterialIcons name="search" style={styles.searchIcon} />
            </TouchableOpacity>
          </View>
          {showSearchInput && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search chats..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Button title="Cancel" onPress={toggleSearch} color="#A7C7E7" />
            </View>
          )}
          {filteredChats.length === 0 ? (
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
          <Modal visible={showNewChatModal} animationType="slide">
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Start New Chat</Text>
              {selectedUsers.map(user => (
                <View key={user.id} style={styles.selectedUserItem}>
                  <Text>{formatUserDisplay(user)}</Text>
                  <TouchableOpacity onPress={() => toggleUserSelection(user)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TextInput
                placeholder="Search users..."
                value={modalSearchQuery}
                onChangeText={setModalSearchQuery}
                style={styles.searchInput}
              />
              <FlatList
                data={availableUsers.filter(user =>
                  formatUserDisplay(user).toLowerCase().includes(modalSearchQuery.toLowerCase()) &&
                  user.id !== currentUserId &&
                  !selectedUsers.some(u => u.id === user.id)
                )}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.userItem} onPress={() => toggleUserSelection(item)}>
                    <Text style={styles.userItemText}>{formatUserDisplay(item)}</Text>
                  </TouchableOpacity>
                )}
              />
              <Button title="Start Chat" onPress={startNewChat} color="#A7C7E7" />
              <Button title="Cancel" onPress={() => setShowNewChatModal(false)} color="#A7C7E7" />
            </View>
          </Modal>
        </>
      ) : (
        <View style={styles.chatViewContainer}>
          <View style={styles.chatTitleContainer}>
            {getChatAvatar(selectedChat, currentUserId).photo ? (
              <Image source={{ uri: getChatAvatar(selectedChat, currentUserId).photo }} style={styles.chatTitleAvatar} />
            ) : (
              <View style={styles.chatTitleInitialsCircle}>
                <Text style={styles.chatTitleInitialsText}>{getChatAvatar(selectedChat, currentUserId).initials}</Text>
              </View>
            )}
            <Text style={styles.chatTitle}>{getChatName(selectedChat, currentUserId)}</Text>
          </View>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            onContentSizeChange={() => flatListRef.current.scrollToEnd({ animated: true })}
          />
          <View style={styles.inputContainer}>
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
          <Button title="Back to Inbox" onPress={() => setSelectedChat(null)} color="#A7C7E7" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0', padding: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#A7C7E7' },
  searchIcon: { fontSize: 24, color: '#A7C7E7' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#A7C7E7', padding: 10, borderRadius: 5, backgroundColor: '#FFF', marginRight: 10 },
  emptyText: { textAlign: 'center', color: 'gray', marginTop: 20 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatItem: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  initialsCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center' },
  initialsText: { color: '#FFF', fontSize: 20 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'green', position: 'absolute', left: 45, bottom: 10 },
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
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#FFF' },
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
  chatTitle: { fontSize: 24, fontWeight: 'bold', color: '#A7C7E7' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
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
  messageTimestamp: { fontSize: 10, color: 'gray', alignSelf: 'flex-end', marginTop: 5 },
  messageAvatar: { width: 30, height: 30, borderRadius: 15 },
  messageInitialsCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center' },
  messageInitialsText: { color: '#FFF', fontSize: 12 },
  messageStatus: { fontSize: 10, alignSelf: 'flex-end' },
});