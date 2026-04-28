import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, disableNetwork } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, isQuotaExceeded } from '../lib/firebase';
import { AppState } from '../types';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  syncState: (state: AppState) => Promise<void>;
  saveHistoryItem: (item: any) => Promise<void>;
  remoteState: Partial<AppState> | null;
  quotaExceeded: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [remoteState, setRemoteState] = useState<Partial<AppState> | null>(null);
  const isWritingRef = useRef(false);
  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    return sessionStorage.getItem('firestore_quota_exceeded') === 'true';
  });

  const handleQuotaExceeded = useCallback(() => {
    if (!quotaExceeded) {
      setQuotaExceeded(true);
      sessionStorage.setItem('firestore_quota_exceeded', 'true');
      console.error("SYSTEM CRITICAL: Firestore Write Quota Exceeded. All cloud sync suspended.");
      disableNetwork(db).catch(() => {}); // Kill all background tasks
    }
  }, [quotaExceeded]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || quotaExceeded || isQuotaExceeded()) {
      setRemoteState(null);
      if (!quotaExceeded && isQuotaExceeded()) setQuotaExceeded(true);
      return;
    }

    const path = `users/${user.uid}`;
    let isSubscribed = true;
    
    const unsubscribeDoc = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (!isSubscribed) return;
      if (isWritingRef.current) return;
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRemoteState(data as Partial<AppState>);
      } else {
        setRemoteState(null);
      }
    }, (error: any) => {
      if (!isSubscribed) return;
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        handleQuotaExceeded();
      }
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => {
      isSubscribed = false;
      unsubscribeDoc();
    };
  }, [user, quotaExceeded]);

  const syncState = useCallback(async (state: AppState) => {
    if (!user || quotaExceeded || isQuotaExceeded()) {
      if (quotaExceeded === false && isQuotaExceeded()) {
        setQuotaExceeded(true);
      }
      return;
    }

    const path = `users/${user.uid}`;
    try {
      isWritingRef.current = true;
      const userRef = doc(db, 'users', user.uid);
      const { activeFilter, history, ...savableState } = state;
      
      await setDoc(userRef, {
        ...savableState,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // Delay resetting the write flag to allow snapshots to propagate
      setTimeout(() => { isWritingRef.current = false; }, 2000);
    } catch (error: any) {
      isWritingRef.current = false;
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        handleQuotaExceeded();
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [user, quotaExceeded, handleQuotaExceeded]);

  const saveHistoryItem = useCallback(async (item: any) => {
    if (!user || quotaExceeded || isQuotaExceeded()) {
      if (quotaExceeded === false && isQuotaExceeded()) {
        setQuotaExceeded(true);
      }
      return;
    }
    const path = `users/${user.uid}/history/${item.taskId}`;
    try {
      const historyRef = doc(db, 'users', user.uid, 'history', item.taskId);
      await setDoc(historyRef, {
        ...item,
        updatedAt: serverTimestamp() // consistency review: using serverTimestamp
      });
    } catch (error: any) {
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        handleQuotaExceeded();
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [user, quotaExceeded, handleQuotaExceeded]);

  return (
    <FirebaseContext.Provider value={{ user, loading, syncState, saveHistoryItem, remoteState, quotaExceeded }}>
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
