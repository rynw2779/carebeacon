import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth, db, firestore } from '../firebaseConfig';
import { ref, onValue, push, set, serverTimestamp, update, get, increment } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { formatUserDisplay, getInitials, getChatName, getChatAvatar } from './ChatScreen'; // Import helpers from ChatScreen.js

const ChatDetails = ({ route, navigation }) => {
  const { roomId, chat } = route.params; // Get roomId and chat data from navigation
  const flatListRef = useRef(null);
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [senderDataCache, setSenderDataCache] = useState({});

  useEffect(() => {
    const messagesRef = ref(db, `chats/${roomId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const msgData = snapshot.val();
      if (msgData) {
        const msgList = Object.entries(msgData).map(([key, msg]) => ({ ...msg, key })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
        // Mark as read
        msgList.forEach(async (msg) => {
          if (!msg.readBy.includes(auth.currentUser.uid)) {
            await update(ref(db, `chats/${roomId}/messages/${msg.key}`), {
              readBy: [...msg.readBy, auth.currentUser.uid],
            });
            await update(ref(db, `chats/${auth.currentUser.uid}/${roomId}/unread`), {
              unread: increment(-1),
            });
          }
        });
      } else {
        setMessages([]);
      }
    });
    return unsubscribe;
  }, [roomId]);

  useEffect(() => {
    async function fetchSenderData() {
      const uniqueSenderIds = [...new Set(messages.map(m => m.senderId))];
      const newCache = { ...senderDataCache };
      for (const sid of uniqueSenderIds) {
        if (!newCache[sid]) {
          const sDoc = await getDoc(doc(firestore, 'users', sid));
          if (sDoc.exists()) newCache[sid] = sDoc.data();
        }
      }
      setSenderDataCache(newCache);
    }
    fetchSenderData();
  }, [messages]);

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (newMessage.trim()) {
      const messagesRef = ref(db, `chats/${roomId}/messages`);
      const newMsgRef = push(messagesRef);
      const timestamp = serverTimestamp();
      const senderId = auth.currentUser.uid;
      const readBy = [senderId];
      const lastMessageData = { text: newMessage, senderId, timestamp, readBy };
      await set(newMsgRef, lastMessageData);

      await set(ref(db, `chats/${roomId}/lastMessage`), lastMessageData);

      // Fan out to all participants
      const allUids = [auth.currentUser.uid, ...chat.participants.map(p => p.id)];
      for (const uid of allUids) {
        await update(ref(db, `chats/${uid}/${roomId}`), { lastMessage: lastMessageData });
        if (uid !== senderId) {
          await update(ref(db, `chats/${uid}/${roomId}/unread`), { unread: increment(1) });
        }
      }
      setNewMessage('');
    }
  };

  const renderMessage = ({ item }) => {
    const isSender = item.senderId === auth.currentUser.uid;
    const senderData = senderDataCache[item.senderId] || {};
    const avatar = senderData.profilePhoto ? (
      <Image source={{ uri: senderData.profilePhoto }} style={styles.messageAvatar} />
    ) : (
      <View style={styles.messageInitialsCircle}>
        <Text style={styles.messageInitialsText}>{getInitials(senderData)}</Text>
      </View>
    );

    let receiptStatus = '';
    if (isSender) {
      const readCount = item.readBy?.length || 1;
      const totalParticipants = chat.participants.length + 1;
      const readByOthers = readCount - 1;
      const others = totalParticipants - 1;
      if (readByOthers === 0) {
        receiptStatus = 'Delivered';
      } else if (readByOthers < others) {
        receiptStatus = `${readByOthers}/${others} Read`;
      } else {
        receiptStatus = 'Read';
      }
    }

    return (
      <View style={[styles.messageContainer, isSender ? styles.senderContainer : styles.receiverContainer]}>
        {!isSender && avatar}
        <View style={[styles.bubble, isSender ? styles.senderBubble : styles.receiverBubble]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.messageTimestamp}>
            {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
          {receiptStatus && <Text style={[styles.messageStatus, receiptStatus === 'Read' ? { color: 'green' } : { color: 'gray' }]}>{receiptStatus}</Text>}
        </View>
        {isSender && avatar}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.chatTitle}>{getChatName(chat)}</Text> {/* Optional header */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.key}
        renderItem={renderMessage}
        onContentSizeChange={() => flatListRef.current.scrollToEnd({ animated: true })}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <MaterialIcons name="send" size={24} color="#A7C7E7" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0' },
  chatTitle: { fontSize: 24, fontWeight: 'bold', color: '#A7C7E7', padding: 10 },
  inputContainer: { flexDirection: 'row', padding: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: '#A7C7E7', padding: 10, borderRadius: 5 },
  sendButton: { padding: 10 },
  messageContainer: { flexDirection: 'row', marginVertical: 5, paddingHorizontal: 10 },
  senderContainer: { justifyContent: 'flex-end' },
  receiverContainer: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '70%', padding: 10, borderRadius: 20 },
  senderBubble: { backgroundColor: '#A7C7E7', alignSelf: 'flex-end' },
  receiverBubble: { backgroundColor: '#E0E0E0', alignSelf: 'flex-start' },
  messageText: { color: '#000' },
  messageTimestamp: { fontSize: 10, color: 'gray', alignSelf: 'flex-end' },
  messageAvatar: { width: 30, height: 30, borderRadius: 15, marginHorizontal: 5 },
  messageInitialsCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center', marginHorizontal: 5 },
  messageInitialsText: { color: '#FFF', fontSize: 12 },
  messageStatus: { fontSize: 10, alignSelf: 'flex-end', color: 'gray' },
});

export default ChatDetails;