import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AppState } from '../types';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  syncState: (state: AppState) => Promise<void>;
  saveHistoryItem: (item: any) => Promise<void>;
  remoteState: Partial<AppState> | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [remoteState, setRemoteState] = useState<Partial<AppState> | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setRemoteState(null);
      return;
    }

    const path = `users/${user.uid}`;
    const unsubscribeDoc = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRemoteState(data as Partial<AppState>);
      } else {
        setRemoteState(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribeDoc();
  }, [user]);

  const syncState = async (state: AppState) => {
    if (!user) return;

    const path = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      const { activeFilter, history, ...savableState } = state;
      
      await setDoc(userRef, {
        ...savableState,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveHistoryItem = async (item: any) => {
    if (!user) return;
    const path = `users/${user.uid}/history/${item.taskId}`;
    try {
      const historyRef = doc(db, 'users', user.uid, 'history', item.taskId);
      await setDoc(historyRef, {
        ...item,
        updatedAt: serverTimestamp() // consistency review: using serverTimestamp
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, syncState, saveHistoryItem, remoteState }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
