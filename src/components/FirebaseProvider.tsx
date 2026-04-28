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
  lastSyncedAt: Date | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [remoteState, setRemoteState] = useState<Partial<AppState> | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const isWritingRef = useRef(false);
  const lastSyncRef = useRef<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(() => isQuotaExceeded());

  const handleQuotaExceeded = useCallback(() => {
    if (!quotaExceeded) {
      setQuotaExceeded(true);
      console.error("SYSTEM CRITICAL: Firestore Write Quota Exceeded. All cloud sync suspended.");
      disableNetwork(db).catch(() => {});
    }
  }, [quotaExceeded]);

  useEffect(() => {
    // Aggressive network cutoff if quota is detected during usage
    if (quotaExceeded) {
      console.warn("[FirebaseProvider] Quota exceeded. Killing network link.");
      disableNetwork(db).catch(() => {});
    }
  }, [quotaExceeded]);

  useEffect(() => {
    // Immediate network cutoff if we know we're over quota on mount
    if (quotaExceeded || isQuotaExceeded()) {
      disableNetwork(db).catch(() => {});
    }

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
    
    // Total silence if quota exceeded
    if (quotaExceeded || isQuotaExceeded()) {
      setLoading(false);
      setRemoteState(null);
      return;
    }

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
      const { activeFilter, history, ...savableState } = state;
      const stateString = JSON.stringify(savableState);
      
      // Optimization: Only write if state has actually changed from last sync
      if (lastSyncRef.current === stateString) return;

      isWritingRef.current = true;
      const userRef = doc(db, 'users', user.uid);
      
      await setDoc(userRef, {
        ...savableState,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      lastSyncRef.current = stateString;
      setLastSyncedAt(new Date());
      
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
    <FirebaseContext.Provider value={{ user, loading, syncState, saveHistoryItem, remoteState, quotaExceeded, lastSyncedAt }}>
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
