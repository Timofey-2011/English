/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Mic, 
  Headphones, 
  PenTool, 
  Settings, 
  ChevronRight, 
  CheckCircle2, 
  Target, 
  Zap, 
  Flame,
  MessageSquare,
  BarChart3,
  Globe,
  Star,
  ArrowRight,
  TrendingUp,
  Award,
  Clock,
  Send,
  Loader2,
  X,
  Volume2,
  Play,
  Plus,
  RefreshCw,
  Activity,
  Shield,
  Sparkles,
  Search,
  Menu,
  LogIn,
  LogOut,
  User as UserIcon,
  Smartphone
} from 'lucide-react';
import { generateLearningPlan, getExerciseFeedback, getTutorResponse, getTaskAudio, getWordTranslation, generateScenarios, generateReplacementTask } from './lib/gemini';
import { AppState, UserAssessment, LearningTask, WeeklyPlan, AIChatMessage, ProficiencyLevel, AppMode, CommunicationScenario } from './types';
import { useFirebase } from './components/FirebaseProvider';
import { signInWithGoogle, logout, isQuotaExceeded } from './lib/firebase';

// Browser Speech Recognition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function App() {
  const { user, loading: firebaseLoading, syncState, saveHistoryItem, remoteState, quotaExceeded, lastSyncedAt } = useFirebase();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('linguist_ai_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && 'onboardingComplete' in parsed) {
          return {
            mode: 'learning',
            communicationScenarios: [],
            estimatedIELTSBand: 5.5,
            activeFilter: 'all',
            activeTaskId: null,
            sessionUserInput: '',
            sessionQuizAnswers: {},
            sessionUnknownWords: {},
            dictionary: {},
            streak: {
              count: 0,
              lastLoginDate: '',
              best: 0
            },
            achievements: [
              { id: 'first_step', title: 'Neural Ignition', description: 'Complete your first tactical session', icon: 'Zap', isUnlocked: false },
              { id: 'streak_3', title: 'Tri-Phase Sync', description: 'Maintain a 3-day neural link', icon: 'Flame', isUnlocked: false },
              { id: 'mastery_1', title: 'Lexical Architect', description: 'Add 50 tokens to your dictionary', icon: 'BookOpen', isUnlocked: false }
            ],
            masteryScores: {
              speaking: 10,
              writing: 10,
              listening: 10,
              reading: 10,
              grammar: 10,
              vocabulary: 10
            },
            history: [],
            ...parsed
          };
        }
      }
    } catch (e) {
      console.error("Failed to load state from localStorage:", e);
    }
    return {
      onboardingComplete: false,
      mode: 'learning',
      communicationScenarios: [],
      assessment: null,
      weeklyPlan: null,
      estimatedIELTSBand: 5.5,
      activeFilter: 'all',
      activeTaskId: null,
      sessionUserInput: '',
      sessionQuizAnswers: {},
      sessionUnknownWords: {},
      dictionary: {},
      streak: {
        count: 0,
        lastLoginDate: '',
        best: 0
      },
      achievements: [
        { id: 'first_step', title: 'Neural Ignition', description: 'Complete your first tactical session', icon: 'Zap', isUnlocked: false },
        { id: 'streak_3', title: 'Tri-Phase Sync', description: 'Maintain a 3-day neural link', icon: 'Flame', isUnlocked: false },
        { id: 'mastery_1', title: 'Lexical Architect', description: 'Add 50 tokens to your dictionary', icon: 'BookOpen', isUnlocked: false }
      ],
      masteryScores: {
        speaking: 10,
        writing: 10,
        listening: 10,
        reading: 10,
        grammar: 10,
        vocabulary: 10
      },
      history: []
    };
  });

  const setFilter = (filter: AppState['activeFilter']) => {
    setState(prev => ({ ...prev, activeFilter: filter }));
    setActiveTask(null);
  };

  const addRelocationTask = () => {
    const relocationTask: LearningTask = {
      id: `relocation-${Date.now()}`,
      type: 'speaking',
      title: 'Relocation Intelligence: The Move',
      description: 'Simulated high-stakes relocation interview. Focus on articulating your professional value proposition and cultural adaptability in a international high-performance environment.',
      topic: 'Global Mobility & Carrier Logic',
      difficulty: state.assessment?.currentLevel || 'Mid-Intermediate',
      estimatedTime: 25,
      completed: false,
      content: {
        exercise: 'You are applying for a prestigious internal transfer to a global innovation hub. The panel is evaluating not just your linguistic skill, but your "Neural Adaptability"—the ability to integrate into new cultural and professional systems seamlessly.',
        questions: [
          "What is your strategic motivation for this global transition?",
          "How do you plan to mitigate the cognitive load of settling into a drastically different cultural architecture?",
          "Can you describe a situation where you successfully navigated a complex multi-cultural node?",
          "How will your specific linguistic and professional strengths amplify the synergy of the local team?"
        ],
        vocabularyList: ["Linguistic synergy", "Cognitive load", "Global transition", "Cultural architecture", "Professional value proposition", "Neural adaptability", "Deployment"]
      }
    };

    setState(prev => {
      if (!prev.weeklyPlan) return prev;
      return {
        ...prev,
        activeFilter: 'speaking',
        weeklyPlan: {
          ...prev.weeklyPlan,
          tasks: [relocationTask, ...prev.weeklyPlan.tasks]
        }
      };
    });
    
    // Smooth transition to visual feedback
    setTutorOpen(false);
    setActiveTask(null);
  };

  const onStartTask = (task: LearningTask) => {
    setState(prev => {
      // If we are resuming the SAME task, keep the existing session data
      if (prev.activeTaskId === task.id) {
        return { ...prev };
      }
      // NEW task started, clear session state
      return {
        ...prev,
        activeTaskId: task.id,
        sessionUserInput: '',
        sessionUnknownWords: {}
      };
    });
    setActiveTask(task);
  };

  const resetProgress = () => {
    if (confirm("Are you sure you want to reset your learning progress?")) {
      setState({
        onboardingComplete: false,
        assessment: null,
        weeklyPlan: null,
        estimatedIELTSBand: 5.5,
        activeFilter: 'all',
        history: []
      });
      localStorage.removeItem('linguist_ai_state');
    }
  };

   const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [showLanding, setShowLanding] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<LearningTask | null>(null);
  const [activeScenario, setActiveScenario] = useState<CommunicationScenario | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([
    { role: 'assistant', content: 'Hello! I am your AI Tutor. How can I help you today?' }
  ]);

  // Restore active task from state on reload
  useEffect(() => {
    if (state.activeTaskId && !activeTask && state.weeklyPlan) {
      const task = state.weeklyPlan.tasks.find(t => t.id === state.activeTaskId);
      if (task) {
        setActiveTask(task);
      }
    }
  }, [state.activeTaskId, state.weeklyPlan, activeTask]);

  useEffect(() => {
    if (user && remoteState) {
      const today = new Date().toISOString().split('T')[0];
      const lastLogin = remoteState.streak?.lastLoginDate || '';
      
      if (lastLogin !== today) {
        setState(prev => {
          const newCount = (lastLogin === new Date(Date.now() - 86400000).toISOString().split('T')[0]) 
            ? (prev.streak?.count || 0) + 1 
            : 1;
            
          return {
            ...prev,
            streak: {
              count: newCount,
              lastLoginDate: today,
              best: Math.max(prev.streak?.best || 0, newCount)
            }
          };
        });
      }
    }
  }, [user, remoteState?.streak?.lastLoginDate]);

  // Debounced Sync Effect to stay within free tier limits
  useEffect(() => {
    localStorage.setItem('linguist_ai_state', JSON.stringify(state));
    
    // Fail fast if quota is exceeded or storage marks it as such
    if (user && state.onboardingComplete && !quotaExceeded && !isQuotaExceeded()) {
      const handler = setTimeout(() => {
        // Double check right before calling
        if (!isQuotaExceeded()) {
          syncState(state);
        }
      }, 300000); // 5 minutes sync interval - heavily throttled for quota preservation

      return () => clearTimeout(handler);
    }
  }, [state, user, quotaExceeded, syncState]);

  // Quota Exceeded Notification
  useEffect(() => {
    if (quotaExceeded) {
      console.warn("CRITICAL: Firestore Quota Exceeded. Writes are suspended until tomorrow.");
    }
  }, [quotaExceeded]);

   // Sync from remote when user logs in
  useEffect(() => {
    if (user && remoteState) {
      setState(prev => {
        // Deep partial comparison to avoid unnecessary state updates that cause sync loops
        // Only merge if the remote state has something new or different
        const hasChange = JSON.stringify(remoteState.weeklyPlan?.lastGenerated) !== JSON.stringify(prev.weeklyPlan?.lastGenerated) ||
                         (remoteState.onboardingComplete !== prev.onboardingComplete);
        
        if (!hasChange && prev.onboardingComplete) return prev;

        // Prevent sudden resets if already in middle of onboarding or task
        if (prev.activeTaskId && remoteState.activeTaskId === prev.activeTaskId) {
           return { ...prev, ...remoteState }; 
        }
        if (prev.activeTaskId) return prev; 
        
        return {
          ...prev,
          ...remoteState,
          activeFilter: prev.activeFilter
        } as AppState;
      });
    }
  }, [user, remoteState]);

  const handleAssessmentComplete = async (assessment: UserAssessment) => {
    setIsLoading(true);
    setLoadingStatus('Initializing Neural Matrix Deployment...');
    
    try {
      setLoadingStatus('Synthesizing Academic Syllabus...');
      // Parallel generation for speed and reliability
      const [plan, scenarios] = await Promise.all([
        generateLearningPlan(assessment),
        generateScenarios(assessment)
      ]);
      
      const levelToIELTS: Partial<Record<ProficiencyLevel, number>> = {
        'Beginner': 3.0,
        'Elementary': 3.5,
        'Low-Pre-Intermediate': 4.0,
        'Mid-Pre-Intermediate': 4.3,
        'High-Pre-Intermediate': 4.7,
        'Low-Intermediate': 5.0,
        'Mid-Intermediate': 5.3,
        'High-Intermediate': 5.7,
        'Low-Upper-Intermediate': 6.0,
        'High-Upper-Intermediate': 6.5,
        'Advanced': 7.5,
        'Proficient': 8.5
      };

      setState(prev => ({
        ...prev,
        onboardingComplete: true,
        assessment,
        weeklyPlan: plan,
        communicationScenarios: scenarios,
        estimatedIELTSBand: levelToIELTS[assessment.currentLevel] || 5.5,
        masteryScores: prev.masteryScores || {
          speaking: 40, writing: 40, listening: 40, reading: 40, grammar: 40, vocabulary: 40
        }
      }));
    } catch (error: any) {
      console.error("Critical AI Generation Error:", error);
      onRegenerateEmergency();
    } finally {
      setIsLoading(false);
      setSettingsOpen(false);
      setProfileOpen(false);
    }
  };

  const onRegenerateEmergency = () => {
    setState(prev => ({
      ...prev,
      onboardingComplete: true,
      communicationScenarios: [
        {
          id: 'fallback-1',
          type: 'text',
          situation: 'Airport Lost Luggage',
          description: 'Your suitcase is missing at London Heathrow. The staff seems unhelpful.',
          goal: 'Convince the staff to track it immediately and get a reference number.',
          difficulty: prev.assessment?.currentLevel || 'Intermediate',
          roleAI: 'Busy Airport Clerk',
          roleUser: 'Tired Passenger'
        }
      ],
      weeklyPlan: {
        monthTitle: "Emergency Stability Plan",
        focus: "Core Language Recovery",
        aiAdvice: "I've deployed a scientific baseline plan while my neural processors re-calibrate.",
        lastGenerated: new Date().toISOString(),
        tasks: Array.from({ length: 12 }).map((_, idx) => ({
          id: `emergency-${idx}`,
          type: ['vocabulary', 'grammar', 'reading', 'speaking', 'listening', 'writing', 'quiz'][idx % 7] as any,
          title: `Neural Foundation ${idx + 1}`,
          description: 'Core recall exercise while sync is re-established.',
          topic: 'System Core',
          difficulty: prev.assessment?.currentLevel || 'Intermediate',
          estimatedTime: 5 + (idx % 3) * 5,
          completed: false,
          content: { exercise: "Review your previous interests and document them in your own words.", questions: ["How do your interests relate?", "Why is English vital?"] }
        }))
      }
    }));
  };

  const handleTaskComplete = async (taskId: string, score: number, feedback: string) => {
    const task = state.weeklyPlan?.tasks.find(t => t.id === taskId);
    
    // 1. Update State synchronously for immediate UI feedback
    setState(prev => {
      const completedTask = prev.weeklyPlan?.tasks.find(t => t.id === taskId);
      if (!completedTask) return prev;
      
      const newPlan = prev.weeklyPlan ? {
        ...prev.weeklyPlan,
        tasks: prev.weeklyPlan.tasks.map(t => 
          t.id === taskId ? { ...t, completed: true } : t
        )
      } : null;

      let bandDelta = 0;
      if (score >= 85) bandDelta = 0.1;
      else if (score < 40) bandDelta = -0.1;
      
      const newBand = Math.min(9.0, Math.max(1.0, prev.estimatedIELTSBand + bandDelta));
      const type = completedTask.type;
      const currentMastery = prev.masteryScores[type] || 0;
      const masteryDelta = score / 10;

      const historyItem = { 
        taskId, 
        score, 
        feedback, 
        date: new Date().toISOString(),
        taskType: type 
      };

      const updatedHistory = [...prev.history, historyItem];
      const updatedAchievements = prev.achievements.map(a => {
        if (a.isUnlocked) return a;
        let shouldUnlock = false;
        if (a.id === 'first_step' && updatedHistory.length >= 1) shouldUnlock = true;
        if (a.id === 'streak_3' && prev.streak?.count >= 3) shouldUnlock = true;
        if (a.id === 'mastery_1' && Object.keys(prev.dictionary).length >= 50) shouldUnlock = true;
        if (shouldUnlock) {
           return { ...a, isUnlocked: true, dateEarned: new Date().toISOString() };
        }
        return a;
      });

      return {
        ...prev,
        history: updatedHistory,
        achievements: updatedAchievements,
        weeklyPlan: newPlan,
        estimatedIELTSBand: Number(newBand.toFixed(1)),
        masteryScores: {
          ...prev.masteryScores,
          [type]: Math.min(100, currentMastery + masteryDelta)
        },
        activeTaskId: null,
        sessionUserInput: '',
        sessionUnknownWords: {}
      };
    });

    // 2. Trigger persistent storage side-effect outside the state updater
    if (user && !quotaExceeded) {
      const type = task.type;
      saveHistoryItem({ 
        taskId, 
        score, 
        feedback, 
        date: new Date().toISOString(),
        taskType: type 
      });
    }

    // 3. Continuous Intelligence Protocol: Synchronize a new task to maintain sector density
    if (state.assessment) {
      setTimeout(async () => {
        try {
          const replacement = await generateReplacementTask(state.assessment!, state.weeklyPlan?.tasks || []);
          setState(prev => {
            if (!prev.weeklyPlan) return prev;
            return {
              ...prev,
              weeklyPlan: {
                ...prev.weeklyPlan,
                tasks: [...prev.weeklyPlan.tasks, replacement]
              }
            };
          });
        } catch (e) {
          console.error("Replacement Sync Error:", e);
        }
      }, 500);
    }
    
    if (task?.isTest && score < 70) {
      console.log("Scientific Review: Score below threshold on knowledge check. Suggesting recovery focused missions.");
    }
    setActiveTask(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-6 text-center overflow-hidden relative">
        <div className="neural-background" />
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="w-20 h-20 bg-accent-blue rounded-[1.5rem] mb-8 flex items-center justify-center text-bg-base shadow-2xl shadow-accent-blue/30 relative z-10"
        >
          <Globe className="w-10 h-10" />
        </motion.div>
        <h2 className="text-3xl font-bold tracking-tighter mb-3 relative z-10">Neural Architecture Sync</h2>
        <p className="text-text-dim max-w-md font-mono text-sm relative z-10">Compiling 30 days of scientific interleaving curriculum tailored for your unique baseline...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-main flex flex-col lg:flex-row relative overflow-hidden font-sans">
      <AnimatePresence>
        {quotaExceeded && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 inset-x-0 z-[200] bg-orange-500/90 backdrop-blur-md text-white py-3 px-6 text-center text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl"
          >
            <Shield className="w-4 h-4" />
            <span>Neural Link Limited: Daily Synchronization Quota Exceeded. Progress will be saved locally.</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="neural-background" />

      {/* Mobile Top Header */}
      {state.onboardingComplete && !activeTask && (
        <div className="lg:hidden h-20 bg-bg-card/40 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 shrink-0 relative z-40">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent-blue rounded-xl flex items-center justify-center shadow-lg shadow-accent-blue/10">
                 <Globe className="w-6 h-6 text-bg-base" />
              </div>
              <h1 className="text-sm font-black tracking-tighter italic">COGNITO <span className="text-accent-blue font-black">AI</span></h1>
           </div>
           <div className="flex items-center gap-4">
              <AuthStatus user={user} loading={firebaseLoading} lastSyncedAt={lastSyncedAt} onSync={() => syncState(state)} quotaExceeded={quotaExceeded} />
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
           </div>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: '-100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '-100%' }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div className="absolute inset-0 bg-bg-base/95 backdrop-blur-3xl overflow-y-auto p-8 pt-24 custom-scrollbar">
              <div className="space-y-6">
                <div className="text-[10px] uppercase font-black tracking-[0.6em] text-white/20 px-5 mb-8">Intelligence Sectors</div>
                {[
                  { id: 'all', label: 'Matrix Overview', icon: Zap },
                  { id: 'speaking', label: 'Oral Production', icon: Mic },
                  { id: 'listening', label: 'Aural Decoding', icon: Headphones },
                  { id: 'writing', label: 'Textual Synthesis', icon: PenTool },
                  { id: 'reading', label: 'Lexical Analysis', icon: BookOpen },
                  { id: 'grammar', label: 'Structural Logic', icon: Activity },
                  { id: 'vocabulary', label: 'Semantic Nodes', icon: Sparkles },
                  { id: 'glossary', label: 'Lexical Hub', icon: Search }
                ].map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => {
                        setFilter(item.id as any);
                        setIsMobileMenuOpen(false);
                    }}
                    className={`w-full group flex items-center gap-6 p-6 rounded-3xl transition-all ${state.activeFilter === item.id ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-dim'}`}
                  >
                    <item.icon className={`w-6 h-6 ${state.activeFilter === item.id ? 'text-accent-blue' : 'text-text-dim'}`} />
                    <span className="font-bold tracking-tight text-lg uppercase">{item.label}</span>
                  </button>
                ))}

                <div className="pt-10 mt-10 border-t border-white/5 space-y-4">
                  <button onClick={() => { setProfileOpen(true); setIsMobileMenuOpen(false); }} className="w-full group flex items-center gap-6 p-6 rounded-3xl text-text-dim bg-white/5">
                    <UserIcon className="w-6 h-6 text-accent-blue" />
                    <span className="font-bold tracking-tight text-lg uppercase">Agent Profile</span>
                  </button>
                  <button onClick={() => { setTutorOpen(true); setIsMobileMenuOpen(false); }} className="w-full group flex items-center gap-6 p-6 rounded-3xl text-text-dim bg-white/5">
                    <MessageSquare className="w-6 h-6 text-accent-blue" />
                    <span className="font-bold tracking-tight text-lg uppercase">Neural Tutor UI</span>
                  </button>
                  <button onClick={() => { addRelocationTask(); setIsMobileMenuOpen(false); }} className="w-full group flex items-center gap-6 p-6 rounded-3xl text-accent-gold bg-accent-gold/10">
                    <Star className="w-6 h-6" />
                    <span className="font-bold tracking-tight text-lg uppercase">Relocation Prep</span>
                  </button>
                </div>

                <div className="pt-10 mt-10 border-t border-white/5">
                  <button onClick={() => { resetProgress(); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-6 p-6 rounded-3xl text-red-400">
                    <Settings className="w-6 h-6" />
                    <span className="font-bold tracking-tight text-lg uppercase">System Reset</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isLoading || firebaseLoading) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-bg-base/80 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
          >
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 mb-10 text-accent-blue"
            >
              <RefreshCw className="w-full h-full" />
            </motion.div>
            <h2 className="text-4xl font-black italic tracking-tighter mb-4 text-white">Neural Processing...</h2>
            <p className="text-text-dim text-lg font-light italic max-w-sm mb-8">{isLoading ? loadingStatus : 'Synchronizing with Neural Core...'}</p>
            
            {isLoading && (
              <button 
                onClick={() => {
                  setIsLoading(false);
                  onRegenerateEmergency();
                }}
                className="text-xs text-text-dim hover:text-white underline underline-offset-4 opacity-50 hover:opacity-100 transition-all font-black uppercase tracking-widest"
              >
                Intervention: Deploy Static Matrix
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!user ? (
          <AuthScreen onGoogleSignIn={signInWithGoogle} />
        ) : !state.onboardingComplete ? (
          <motion.div 
            key="entry" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="w-full relative z-10"
          >
            {showLanding ? (
              <Landing onStart={() => setShowLanding(false)} user={user} loading={firebaseLoading} />
            ) : (
              <Onboarding onComplete={handleAssessmentComplete} />
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex flex-col lg:flex-row w-full relative z-10 h-screen"
          >
            {/* Mission Control Sidebar - Desktop Only */}
            <nav className="hidden lg:flex w-80 border-r border-white/5 bg-bg-card/40 backdrop-blur-3xl flex-col p-10 shrink-0 relative z-20">
              <div className="mb-14 flex items-center gap-5 px-3 justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-accent-blue rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-accent-blue/20 tech-border border-accent-blue/30 group cursor-pointer" onClick={() => setFilter('all')}>
                    <Globe className="w-7 h-7 text-bg-base transition-transform group-hover:rotate-12" />
                  </div>
                  <div className="text-left">
                    <h1 className="text-xl font-black tracking-tighter leading-none mb-1 italic">COGNITO <span className="text-accent-blue font-black">AI</span></h1>
                    <span className="text-[9px] uppercase tracking-[0.4em] text-accent-blue font-black opacity-40">Scientific Core v2.4</span>
                  </div>
                </div>
              </div>

              <div className="mb-10 px-3">
                 <AuthStatus user={user} loading={firebaseLoading} lastSyncedAt={lastSyncedAt} onSync={() => syncState(state)} quotaExceeded={quotaExceeded} />
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2">
                <div className="text-[10px] uppercase font-black tracking-[0.6em] text-white/20 px-5 mb-6 hidden lg:block">Intelligence Sectors</div>
                {[
                  { id: 'all', label: 'Matrix Overview', icon: Zap },
                  { id: 'speaking', label: 'Oral Production', icon: Mic },
                  { id: 'listening', label: 'Aural Decoding', icon: Headphones },
                  { id: 'writing', label: 'Textual Synthesis', icon: PenTool },
                  { id: 'reading', label: 'Lexical Analysis', icon: BookOpen },
                  { id: 'grammar', label: 'Structural Logic', icon: Activity },
                  { id: 'vocabulary', label: 'Semantic Nodes', icon: Sparkles },
                  { id: 'glossary', label: 'Lexical Hub', icon: Search }
                ].map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => setFilter(item.id as any)}
                    className={`nav-link-dark w-full group transition-all duration-300 flex items-center gap-5 px-6 py-4 rounded-2xl text-text-dim hover:text-white hover:bg-white/[0.03] ${state.activeFilter === item.id ? 'nav-active !text-white' : ''}`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${state.activeFilter === item.id ? 'text-accent-blue' : 'group-hover:text-accent-blue'} transition-colors`} />
                    <span className="hidden lg:block font-bold tracking-tight text-sm uppercase opacity-80">{item.label}</span>
                  </button>
                ))}

                <div className="pt-10 mt-10 border-t border-white/5 space-y-3">
                   <div className="text-[10px] uppercase font-black tracking-[0.6em] text-white/20 px-5 mb-4 hidden lg:block">Neural Add-ons</div>
                   <button onClick={() => setProfileOpen(true)} className="nav-link-dark w-full group flex items-center gap-5 px-6 py-5 rounded-2xl text-text-dim hover:text-white hover:bg-white/[0.03] transition-all">
                      <div className="w-10 h-10 rounded-xl bg-accent-blue/5 flex items-center justify-center group-hover:bg-accent-blue/10 transition-colors">
                        <UserIcon className="w-5 h-5 text-accent-blue" />
                      </div>
                      <span className="hidden lg:block font-bold tracking-tight text-sm uppercase">Agent Profile</span>
                   </button>
                   <button onClick={() => setTutorOpen(true)} className="nav-link-dark w-full group flex items-center gap-5 px-6 py-5 rounded-2xl text-text-dim hover:text-white hover:bg-white/[0.03] transition-all">
                      <div className="w-10 h-10 rounded-xl bg-accent-blue/5 flex items-center justify-center group-hover:bg-accent-blue/10 transition-colors">
                        <MessageSquare className="w-5 h-5 text-accent-blue" />
                      </div>
                      <span className="hidden lg:block font-bold tracking-tight text-sm uppercase">Neural Tutor UI</span>
                   </button>
                   
                   <button 
                      onClick={addRelocationTask}
                      className="w-full mt-4 p-5 bg-accent-gold/5 border border-accent-gold/10 rounded-3xl flex items-center lg:items-center gap-5 text-accent-gold hover:bg-accent-gold/10 transition-all group relative overflow-hidden active:scale-95"
                   >
                      <div className="w-10 h-10 rounded-xl bg-accent-gold/10 flex items-center justify-center transition-transform group-hover:rotate-12">
                        <Star className="w-5 h-5 fill-accent-gold/20" />
                      </div>
                      <div className="hidden lg:block text-left">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 leading-none mb-1">Elite Deployment</div>
                        <div className="text-xs font-black uppercase tracking-widest">Relocation Prep</div>
                      </div>
                      <div className="absolute inset-0 bg-white/5 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
                   </button>
                </div>
              </div>

              <div className="pt-8 mt-auto border-t border-white/5">
                <button onClick={() => setSettingsOpen(true)} className="nav-link-dark w-full group flex items-center gap-5 px-6 py-5 rounded-2xl text-text-dim hover:text-accent-blue hover:bg-accent-blue/5 transition-all">
                  <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                  <span className="hidden lg:block font-bold tracking-tight text-sm uppercase">Neural Tuning</span>
                </button>
                <button onClick={resetProgress} className="nav-link-dark w-full group flex items-center gap-5 px-6 py-5 rounded-2xl text-text-dim hover:text-red-400 hover:bg-red-400/5 transition-all">
                  <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  <span className="hidden lg:block font-bold tracking-tight text-sm uppercase">System Reset</span>
                </button>
              </div>
            </nav>

            <main className="flex-1 overflow-y-auto p-6 lg:p-14 pb-32 custom-scrollbar relative">
              <AnimatePresence mode="wait">
                {profileOpen ? (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <ProfileView 
                      state={state} 
                      assessment={state.assessment!} 
                      onUpdate={(newAssessment) => {
                        handleAssessmentComplete(newAssessment);
                      }}
                      onClose={() => setProfileOpen(false)}
                      user={user}
                    />
                  </motion.div>
                ) : activeScenario ? (
                   <motion.div 
                     key="scenario"
                     initial={{ opacity: 0, scale: 0.98 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0 }}
                   >
                     <ScenarioSession 
                       scenario={activeScenario} 
                       onClose={() => setActiveScenario(null)}
                       state={state}
                       setState={setState}
                       setLoadingStatus={setLoadingStatus}
                     />
                   </motion.div>
                ) : state.mode === 'communication' ? (
                   <motion.div
                     key="communication"
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -20 }}
                   >
                     <CommunicationView 
                        scenarios={state.communicationScenarios} 
                        onSelect={setActiveScenario}
                        onRegenerate={() => {
                          setLoadingStatus('Generating New Tactical Scenarios...');
                          setIsLoading(true);
                          generateScenarios(state.assessment!).then(s => {
                            setState(prev => ({ ...prev, communicationScenarios: s }));
                            setIsLoading(false);
                          });
                        }}
                     />
                   </motion.div>
                ) : settingsOpen ? (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <SettingsView 
                      assessment={state.assessment!} 
                      onUpdate={(newAssessment) => {
                        setSettingsOpen(false);
                        handleAssessmentComplete(newAssessment);
                      }}
                      onClose={() => setSettingsOpen(false)}
                    />
                  </motion.div>
                ) : activeTask ? (
                  <motion.div
                    key="exercise"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <ExerciseView 
                      task={activeTask} 
                      sessionState={{
                        userInput: state.sessionUserInput,
                        quizAnswers: state.sessionQuizAnswers || {},
                        unknownWords: state.sessionUnknownWords || {},
                        dictionary: state.dictionary || {}
                      }}
                      updateSession={(upd) => setState(prev => ({ ...prev, ...upd }))}
                      onClose={() => {
                        setState(prev => ({ ...prev, activeTaskId: null }));
                        setActiveTask(null);
                      }} 
                      onComplete={handleTaskComplete}
                      onWordsVerified={(words) => {
                        setState(prev => ({
                          ...prev,
                          dictionary: { ...prev.dictionary, ...words }
                        }));
                      }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Dashboard 
                      state={state} 
                      onStartTask={onStartTask} 
                      onRegenerate={() => state.assessment && handleAssessmentComplete(state.assessment)}
                      activeFilter={state.activeFilter}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
            
            {/* Quota Exhausted Warning */}
            <AnimatePresence>
              {quotaExceeded && (
                <motion.div 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-6"
                >
                  <div className="bg-red-500/10 backdrop-blur-3xl border border-red-500/20 p-4 rounded-2xl flex items-start gap-4 shadow-2xl">
                    <Shield className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Local Storage Mode Active</h4>
                      <p className="text-[10px] text-red-400/80 leading-relaxed font-bold italic"> Daily cloud sync quota reached. Progress is being saved locally and will synchronize once bandwidth resets.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Navigation Matrix */}
            {!activeTask && !activeScenario && state.onboardingComplete && (
               <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                  <div className="bg-bg-card/80 backdrop-blur-xl border border-white/10 p-2 rounded-full flex items-center gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] scale-90 sm:scale-100">
                     <button 
                       onClick={() => setState(prev => ({ ...prev, mode: 'learning' }))}
                       className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-500 ${state.mode === 'learning' ? 'bg-accent-blue text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'text-text-dim hover:bg-white/5'}`}
                     >
                        <Zap className={`w-5 h-5 ${state.mode === 'learning' ? 'fill-white' : ''}`} />
                        <span className="font-black italic uppercase tracking-tighter text-sm">Learning</span>
                     </button>
                     <button 
                       onClick={() => setState(prev => ({ ...prev, mode: 'communication' }))}
                       className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-500 ${state.mode === 'communication' ? 'bg-accent-gold text-bg-base shadow-[0_0_20px_rgba(234,179,8,0.4)]' : 'text-text-dim hover:bg-white/5'}`}
                     >
                        <MessageSquare className={`w-5 h-5 ${state.mode === 'communication' ? 'fill-bg-base' : ''}`} />
                        <span className="font-black italic uppercase tracking-tighter text-sm">Communication</span>
                     </button>
                  </div>
               </div>
            )}
            
            <TutorPanel 
              isOpen={tutorOpen} 
              onToggle={() => setTutorOpen(!tutorOpen)} 
              messages={chatMessages}
              setMessages={setChatMessages}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!activeTask && state.onboardingComplete && !tutorOpen && (
        <motion.button 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setTutorOpen(true)}
          className="fixed bottom-10 right-10 w-16 h-16 bg-accent-blue text-bg-base rounded-2xl shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group shadow-accent-blue/30 overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <MessageSquare className="w-8 h-8" />
        </motion.button>
      )}
    </div>
  );
}

function AuthStatus({ user, loading, lastSyncedAt, onSync, quotaExceeded }: { user: any, loading: boolean, lastSyncedAt: Date | null, onSync: () => void, quotaExceeded: boolean }) {
  if (loading) return <div className="animate-pulse w-8 h-8 rounded-full bg-white/10" />;

  if (!user) {
    return (
      <button 
        onClick={async () => {
          if (isQuotaExceeded()) {
            alert("Neural Link Offline: Daily synchronization quota exceeded. Identity link will resume tomorrow.");
            return;
          }
          try {
            await signInWithGoogle();
          } catch (e) {
            console.log("Nav sync auth suppressed.");
          }
        }}
        className={`flex items-center gap-3 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest group ${isQuotaExceeded() ? 'border-red-500/30 opacity-50 cursor-not-allowed' : 'border-white/5'}`}
      >
        <div className={`w-4 h-4 flex items-center justify-center rounded-full font-serif font-black text-[10px] text-white ${isQuotaExceeded() ? 'bg-red-500/20' : 'bg-white/10'}`}>G</div>
        <span className={`hidden sm:block font-black uppercase tracking-widest ml-1 ${isQuotaExceeded() ? 'text-red-400' : 'text-accent-blue'}`}>
          {isQuotaExceeded() ? 'Sync Offline' : 'Connect ID'}
        </span>
        <div className="sm:hidden flex items-center gap-2">
           <Smartphone className={`w-3 h-3 ${isQuotaExceeded() ? 'text-red-400' : 'text-accent-blue'}`} />
        </div>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 sm:gap-6">
      <div className="flex items-center gap-3 sm:pr-4 sm:border-r border-white/10">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-black uppercase tracking-tighter text-white/40">Neural Link</p>
          <p className={`text-[9px] italic font-bold ${quotaExceeded ? 'text-red-400' : 'text-accent-blue'}`}>
            {quotaExceeded ? 'Link Suspended' : (lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sync Pending')}
          </p>
        </div>
        <div className="relative group">
          <img 
            src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
            alt={user.displayName || 'User'} 
            className={`w-10 h-10 rounded-xl border shadow-lg ${quotaExceeded ? 'border-red-500/30 shadow-red-500/5' : 'border-accent-blue/30 shadow-accent-blue/5'}`}
            referrerPolicy="no-referrer"
          />
          <div className={`absolute top-0 right-0 w-3 h-3 border-2 border-bg-base rounded-full ${quotaExceeded ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'}`} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={quotaExceeded ? () => {} : onSync}
          disabled={quotaExceeded}
          className={`w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center transition-all group ${quotaExceeded ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
          title={quotaExceeded ? "Quota Exceeded" : "Manual Neural Sync"}
        >
          <RefreshCw className={`w-4 h-4 ${quotaExceeded ? 'text-red-400' : 'text-accent-blue group-hover:rotate-180 transition-transform duration-700'}`} />
        </button>
        <button 
          onClick={() => logout()}
          className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-all group"
          title="Terminate Link"
        >
          <LogOut className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
}

// --- SUBCOMPONENTS ---

function Landing({ onStart, user, loading }: { onStart: () => void, user: any, loading: boolean }) {
  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-6 lg:p-14 relative overflow-hidden">
      <div className="neural-background" />
      
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center relative z-10">
        <div className="space-y-12 text-center lg:text-left">
           <div className="flex items-center gap-4 justify-center lg:justify-start">
              <div className="px-5 py-2 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 text-[10px] font-black uppercase tracking-[0.4em]">Neural Edition 2026</div>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
           </div>
           
           <div className="space-y-6">
              <h1 className="text-7xl lg:text-[10rem] font-black tracking-tighter leading-[0.8] text-white italic drop-shadow-2xl">
                COGNITO<br />
                <span className="text-accent-blue">MASTER</span>
              </h1>
              <p className="text-xl lg:text-2xl text-text-dim max-w-xl font-light italic leading-snug">
                The high-performance neural architecture for professional English mastery. 
                Custom missions for <span className="text-white font-medium">IELTS 8.5</span>, 
                <span className="text-white font-medium italic">Global Relocation</span>, 
                and <span className="text-white font-medium">C-Level Fluency</span>.
              </p>
           </div>

           <div className="flex flex-col sm:flex-row items-center gap-6 justify-center lg:justify-start">
              <button 
                onClick={onStart}
                className="group relative px-12 py-6 bg-white text-bg-base rounded-[2rem] font-black text-xl italic uppercase tracking-widest overflow-hidden shadow-[0_20px_50px_rgba(255,255,255,0.1)] transition-all hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 bg-accent-blue/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                <span className="relative z-10 flex items-center gap-4">
                  Initiate Sync
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </span>
              </button>
              
              {!user ? (
                <button 
                  onClick={async () => {
                    try {
                      await signInWithGoogle();
                    } catch (e) {
                      console.log("Dashboard auth suppressed.");
                    }
                  }}
                  className="px-12 py-6 rounded-[2rem] border border-white/10 hover:bg-white/5 transition-all flex items-center gap-4 font-black uppercase tracking-widest text-sm"
                >
                  <LogIn className="w-5 h-5 text-accent-blue" />
                  Returning Agent? Sign In
                </button>
              ) : (
                <div className="flex items-center gap-4 px-8 py-5 bg-white/5 rounded-[2rem] border border-white/5">
                   <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-accent-blue" />
                   <div className="text-left">
                      <div className="text-[9px] font-black uppercase tracking-widest text-accent-blue">Matrix Link Active</div>
                      <div className="text-sm font-bold text-white uppercase">{user.displayName.split(' ')[0]}</div>
                   </div>
                </div>
              )}
           </div>
        </div>

        <div className="hidden lg:block relative">
           <div className="aspect-square rounded-[5rem] overflow-hidden rotate-3 tech-border border-white/10 group">
              <img 
                src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2672&auto=format&fit=crop" 
                alt="Neural Matrix" 
                className="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-1000"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-transparent to-transparent" />
              <div className="absolute top-12 left-12 flex flex-col gap-2">
                 <div className="w-40 h-1 bg-accent-blue/30" />
                 <div className="w-20 h-1 bg-accent-blue/10" />
              </div>
           </div>
           
           <div className="absolute -bottom-10 -right-10 w-64 h-64 glass-morphism rounded-[3rem] p-8 flex flex-col justify-end border-white/10 -rotate-6 shadow-2xl">
              <div className="text-accent-gold text-4xl mb-4"><Star className="fill-accent-gold" /></div>
              <div className="text-xs font-black uppercase tracking-widest leading-tight">Neural Sync Success Rate 98.4%</div>
           </div>
        </div>
      </div>
      
      <div className="absolute bottom-10 left-10 text-[9px] font-black text-text-dim uppercase tracking-[1em] opacity-20 hidden lg:block">System Status: Nominal // Neural Link v4.2</div>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: (a: UserAssessment) => void | Promise<void> }) {
  const [step, setStep] = useState(1);
  const [assessment, setAssessment] = useState<Partial<UserAssessment>>({
    goals: [],
    interests: [],
    currentLevel: 'Mid-Intermediate',
    weaknesses: [],
    strengths: [],
    preferredTopics: [],
    neuralIntensity: 1.0
  });

  const levels: ProficiencyLevel[] = [
    'Beginner', 'Elementary', 
    'Low-Pre-Intermediate', 'Mid-Pre-Intermediate', 'High-Pre-Intermediate',
    'Low-Intermediate', 'Mid-Intermediate', 'High-Intermediate',
    'Low-Upper-Intermediate', 'High-Upper-Intermediate',
    'Advanced', 'Proficient'
  ];

  const levelToNumeric = (l: ProficiencyLevel): number => {
    const map: Record<ProficiencyLevel, number> = {
      'Beginner': 1.0,
      'Elementary': 1.5,
      'Low-Pre-Intermediate': 2.0,
      'Mid-Pre-Intermediate': 2.3,
      'High-Pre-Intermediate': 2.7,
      'Low-Intermediate': 3.0,
      'Mid-Intermediate': 3.3,
      'High-Intermediate': 3.7,
      'Low-Upper-Intermediate': 4.0,
      'High-Upper-Intermediate': 4.5,
      'Advanced': 5.0,
      'Proficient': 6.0
    };
    return map[l];
  };

  const commonGoals = ['Moving Abroad', 'IELTS Score 7+', 'IELTS Score 8+', 'Professional Fluency', 'Casual Conversation', 'University Admission', 'Business Negotiation', 'Technical Writing', 'Travel Survival', 'Accent Reduction', 'Literature Analysis', 'Diplomatic English'];
  const commonInterests = ['Travel', 'Technology', 'Culture', 'Business', 'Literature', 'Science', 'Cinematography', 'History', 'Cooking', 'Gaming', 'Art', 'Sports', 'Economics', 'Psychology', 'Design', 'Environment', 'Politics', 'Medicine'];
  const commonWeaknesses = ['Speaking Confidence', 'Grammar Accuracy', 'Writing Structure', 'Vocabulary Range', 'Native Listening', 'Idiomatic Expressions', 'Speed Reading', 'Note Taking'];

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
    else onComplete(assessment as UserAssessment);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-base">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-bg-card rounded-[2rem] shadow-2xl overflow-hidden border border-border-subtle"
      >
        <div className="p-10 md:p-14">
          {/* Progress bar */}
          <div className="flex gap-3 mb-12">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-accent-blue' : 'bg-bg-accent'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h1 className="text-3xl font-black text-white italic tracking-tighter mb-4">Neural Calibration Phase</h1>
                <p className="text-text-dim mb-12 text-lg leading-relaxed font-light italic opacity-70">Detecting your current cognitive baseline. Choose a granular level that mirrors your reality.</p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-12">
                   {levels.map(l => (
                     <button
                       key={l}
                       onClick={() => setAssessment({ ...assessment, currentLevel: l, numericLevel: levelToNumeric(l) })}
                       className={`p-4 rounded-2xl border transition-all text-left group overflow-hidden relative ${assessment.currentLevel === l ? 'border-accent-blue bg-accent-blue/10 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-white/5 hover:border-white/20 bg-white/[0.02]'}`}
                     >
                        <div className={`text-[8px] font-black uppercase tracking-widest mb-1 transition-colors ${assessment.currentLevel === l ? 'text-accent-blue' : 'text-white/20'}`}>
                           {l.includes('Intermediate') ? 'B-CORE' : l.includes('Advanced') ? 'C-ELITE' : 'A-BASE'}
                        </div>
                        <div className={`text-[10px] font-bold leading-tight ${assessment.currentLevel === l ? 'text-white' : 'text-text-dim'}`}>
                           {l.replace(/-/g, ' ')}
                        </div>
                        {assessment.currentLevel === l && (
                           <div className="absolute top-0 right-0 p-2">
                             <div className="w-1 h-1 rounded-full bg-accent-blue animate-ping" />
                           </div>
                        )}
                     </button>
                   ))}
                </div>

                <div className="p-10 tech-border bg-white/[0.02] rounded-[3.5rem] mb-12 border-white/5 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                      <Target className="w-24 h-24 text-accent-blue" />
                   </div>
                   
                   <div className="flex justify-between items-end mb-8 relative z-10">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-blue mb-2">Fine-Tuning Sync</div>
                        <div className="text-5xl font-black italic text-white flex items-baseline gap-3 tracking-tighter">
                           {assessment.numericLevel || 3.0}
                           <span className="text-lg font-light text-text-dim not-italic tracking-normal">CEFR_IDX</span>
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="text-[10px] font-black uppercase tracking-widest text-text-dim opacity-40 mb-1">Active profile</div>
                         <div className="text-lg font-bold text-accent-blue italic tracking-tight">
                            {assessment.currentLevel?.replace(/-/g, ' ') || 'Mid-Intermediate'}
                         </div>
                      </div>
                   </div>

                   <input 
                     type="range"
                     min="1.0"
                     max="6.0"
                     step="0.1"
                     value={assessment.numericLevel || 3.0}
                     onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        // Fine-grained heuristic to update labels while sliding
                        let level: ProficiencyLevel = 'Mid-Intermediate';
                        if (val <= 1.2) level = 'Beginner';
                        else if (val <= 1.7) level = 'Elementary';
                        else if (val <= 2.1) level = 'Low-Pre-Intermediate';
                        else if (val <= 2.4) level = 'Mid-Pre-Intermediate';
                        else if (val <= 2.8) level = 'High-Pre-Intermediate';
                        else if (val <= 3.2) level = 'Low-Intermediate';
                        else if (val <= 3.5) level = 'Mid-Intermediate';
                        else if (val <= 3.8) level = 'High-Intermediate';
                        else if (val <= 4.2) level = 'Low-Upper-Intermediate';
                        else if (val <= 4.7) level = 'High-Upper-Intermediate';
                        else if (val <= 5.5) level = 'Advanced';
                        else level = 'Proficient';
                        
                        setAssessment({ ...assessment, numericLevel: val, currentLevel: level });
                     }}
                     className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer accent-accent-blue mb-8"
                   />

                   <div className="flex justify-between text-[8px] font-bold text-text-dim opacity-30 tracking-[0.2em] px-2">
                      <span>1.0</span>
                      <span>2.0</span>
                      <span>3.0</span>
                      <span>4.0</span>
                      <span>5.0</span>
                      <span>6.0</span>
                   </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-3xl font-bold text-text-main mb-3">What are your main goals?</h2>
                <p className="text-text-dim mb-10 text-lg">Select all that apply to your journey.</p>
                <div className="flex flex-wrap gap-3">
                  {commonGoals.map(g => (
                    <button
                      key={g}
                      onClick={() => {
                        const newGoals = assessment.goals?.includes(g) 
                          ? assessment.goals.filter(goal => goal !== g)
                          : [...(assessment.goals || []), g];
                        setAssessment({ ...assessment, goals: newGoals });
                      }}
                      className={`px-8 py-4 rounded-2xl border transition-all ${assessment.goals?.includes(g) ? 'border-accent-blue bg-accent-blue text-bg-base font-bold' : 'border-border-subtle bg-bg-accent/40 text-text-dim hover:text-text-main'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {assessment.goals?.some(g => g.includes('IELTS')) && (
                  <div className="mt-12 p-8 bg-bg-accent/40 rounded-3xl border border-border-subtle">
                    <label className="block text-sm font-bold text-text-dim uppercase tracking-widest mb-4">Target IELTS Band</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="number" 
                        step="0.5" 
                        min="1" 
                        max="9" 
                        className="w-24 p-4 rounded-xl bg-bg-base border border-border-subtle outline-none focus:border-accent-blue text-2xl font-bold text-center"
                        placeholder="7.5"
                        onChange={(e) => setAssessment({ ...assessment, targetIELTSScore: parseFloat(e.target.value) })}
                      />
                      <p className="text-text-dim text-sm italic">Most universities require 6.5 - 7.5</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-3xl font-bold text-text-main mb-3">Strengths & Weaknesses</h2>
                <p className="text-text-dim mb-10 text-lg">Help us understand which areas need more attention.</p>
                
                <div className="mb-10">
                  <h3 className="section-title-dark">Areas to improve</h3>
                  <div className="flex flex-wrap gap-3">
                    {commonWeaknesses.map(w => (
                      <button
                        key={w}
                        onClick={() => {
                          const newW = assessment.weaknesses?.includes(w) 
                            ? assessment.weaknesses.filter(item => item !== w)
                            : [...(assessment.weaknesses || []), w];
                          setAssessment({ ...assessment, weaknesses: newW });
                        }}
                        className={`px-6 py-3 rounded-xl border transition-all text-sm ${assessment.weaknesses?.includes(w) ? 'border-accent-gold bg-accent-gold/10 text-accent-gold' : 'border-border-subtle bg-bg-accent/40 text-text-dim'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="section-title-dark">Personal Interests</h3>
                  <div className="flex flex-wrap gap-3">
                    {commonInterests.map(i => (
                      <button
                        key={i}
                        onClick={() => {
                          const newI = assessment.interests?.includes(i) 
                            ? assessment.interests.filter(item => item !== i)
                            : [...(assessment.interests || []), i];
                          setAssessment({ ...assessment, interests: newI });
                        }}
                        className={`px-6 py-3 rounded-xl border transition-all text-sm ${assessment.interests?.includes(i) ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border-subtle bg-bg-accent/40 text-text-dim'}`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-3xl font-bold text-text-main mb-3">Neural Intensity</h2>
                <p className="text-text-dim mb-10 text-lg leading-relaxed">Adjust the curriculum's cognitive load. If Intermediate is too hard, slide left for a smoother transition.</p>
                
                <div className="p-10 tech-border bg-bg-accent/40 rounded-[3rem] mb-8 border-white/5">
                   <div className="flex justify-between items-end mb-6">
                      <div className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-blue">Load Configuration</div>
                      <div className="text-5xl font-black italic text-white">{(assessment.neuralIntensity || 1.0).toFixed(1)}x</div>
                   </div>
                   <input 
                     type="range"
                     min="0.5"
                     max="1.5"
                     step="0.1"
                     value={assessment.neuralIntensity}
                     onChange={(e) => setAssessment({ ...assessment, neuralIntensity: parseFloat(e.target.value) })}
                     className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent-blue mb-6"
                   />
                   <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-text-dim opacity-40 italic">
                      <span>Low Density (Easier)</span>
                      <span>High Density (Harder)</span>
                   </div>
                </div>
                
                <div className="p-6 bg-accent-blue/5 border border-accent-blue/10 rounded-2xl flex items-center gap-4">
                   <Activity className="w-6 h-6 text-accent-blue" />
                   <p className="text-sm italic text-text-dim">Our AI will recalibrate vocabulary complexity and response nuance based on this coefficient.</p>
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center">
                  <div className="w-20 h-20 bg-bg-accent rounded-full flex items-center justify-center mx-auto mb-8 border border-border-subtle">
                    <Globe className="w-10 h-10 text-accent-blue" />
                  </div>
                  <h2 className="text-3xl font-bold text-text-main mb-4">Ready to Start?</h2>
                  <p className="text-text-dim mb-10 text-lg leading-relaxed">We've gathered enough information to build your personalized path. Let's start your journey to English mastery.</p>
                  
                  <div className="bg-bg-accent/40 p-8 rounded-[2rem] text-left border border-border-subtle">
                    <h3 className="text-sm font-bold text-text-dim uppercase tracking-widest mb-6">Profile Summary</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-border-subtle pb-4">
                        <span className="text-text-dim">Current Level</span>
                        <span className="font-bold">{assessment.currentLevel}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-border-subtle pb-4">
                        <span className="text-text-dim">Main Goals</span>
                        <span className="font-bold text-right">{assessment.goals?.slice(0, 2).join(', ')}...</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-dim">Primary Focus</span>
                        <span className="font-bold text-accent-gold">{assessment.weaknesses?.[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-14 flex justify-between items-center">
            {step > 1 ? (
              <button 
                onClick={() => setStep(step - 1)}
                className="text-text-dim hover:text-text-main font-bold transition-colors"
              >
                Back
              </button>
            ) : <div />}
            <button 
              onClick={handleNext}
              disabled={step === 2 && assessment.goals?.length === 0}
              className="btn-primary-dark shadow-lg shadow-accent-blue/20"
            >
              <span className="px-2">{step === 4 ? 'Generate My Plan' : 'Continue'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function GlossaryView({ dictionary }: { dictionary: Record<string, string> }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const words = Object.keys(dictionary || {});
  const filteredWords = words.filter(w => 
    w.toLowerCase().includes(searchTerm.toLowerCase()) || 
    dictionary[w].toLowerCase().includes(searchTerm.toLowerCase())
  ).sort();

  return (
    <section className="space-y-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <div className="w-2 h-16 bg-accent-gold rounded-full shadow-[0_0_25px_rgba(252,211,77,0.8)]" />
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.8em] text-white/30 leading-none mb-3">Neural Archive</h2>
            <div className="text-xl font-black italic text-text-dim/60 tracking-widest uppercase">Lexical Glossary Hub</div>
          </div>
        </div>
        
        <div className="relative w-full sm:w-96 group">
          <input 
            type="text" 
            placeholder="Search verified tokens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-4 text-sm text-white italic outline-none focus:border-accent-gold focus:ring-1 focus:ring-accent-gold/50 transition-all placeholder:text-white/10"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent-gold transition-colors" />
        </div>
      </div>

      {words.length === 0 ? (
        <div className="tech-border p-16 lg:p-24 bg-bg-card/30 rounded-[4rem] text-center space-y-8 opacity-40">
           <BookOpen className="w-16 h-16 mx-auto text-white/20" />
           <p className="text-2xl font-light italic text-text-dim tracking-tight">Archival memory banks empty. Verify tokens during missions to expand your glossary.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredWords.map((word) => (
              <motion.div 
                key={word}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass-morphism p-8 rounded-[2.5rem] group hover:border-accent-gold/30 transition-all duration-500 flex items-center justify-between gap-6"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-gold/50 mb-1">Entry_Token</span>
                  <span className="text-xl font-black text-white italic tracking-tighter uppercase">{word}</span>
                </div>
                <div className="flex-1 h-px bg-white/5 mx-2" />
                <div className="flex flex-col text-right">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-1">Translation</span>
                  <span className="text-lg font-light text-text-dim italic">{dictionary[word]}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      
      {words.length > 0 && filteredWords.length === 0 && (
        <div className="text-center py-20 text-text-dim italic font-light opacity-50">
          No matching tokens found in the archive.
        </div>
      )}
    </section>
  );
}

function Dashboard({ state, onStartTask, onRegenerate, activeFilter }: { state: AppState, onStartTask: (t: LearningTask) => void, onRegenerate: () => void, activeFilter: AppState['activeFilter'] }) {
  const weeklyPlan = state.weeklyPlan;
  
  if (!weeklyPlan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 0] }} 
          transition={{ duration: 6, repeat: Infinity }}
          className="w-28 h-28 bg-accent-blue/10 border border-accent-blue/20 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-2xl shadow-accent-blue/10"
        >
          <RefreshCw className="w-12 h-12 text-accent-blue opacity-50" />
        </motion.div>
        <h2 className="text-4xl font-black tracking-tighter mb-4 italic">Neural Sync Required</h2>
        <p className="text-text-dim max-w-sm mb-12 text-lg font-medium opacity-60 italic">Your cognition path is offline. Deploy a new syllabus to bridge the semantic gap.</p>
        <button onClick={onRegenerate} className="btn-primary-dark active:scale-95 transition-transform">
          <Zap className="w-5 h-5" />
          <span>Deploy Matrix</span>
        </button>
      </div>
    );
  }

  // 1. Separate uncompleted and completed tasks
  const uncompletedTasks = weeklyPlan.tasks.filter(t => !t.completed);
  const completedTasks = weeklyPlan.tasks.filter(t => t.completed);

  // 2. Filter uncompleted tasks based on active category
  const filteredUncompleted = uncompletedTasks.filter(t => 
    activeFilter === 'all' || (t.type || '').toLowerCase().trim() === activeFilter.toLowerCase().trim()
  );

  // 3. Group filtered uncompleted tasks into Daily Phases (3 per phase)
  const taskGroups: LearningTask[][] = [];
  for (let i = 0; i < filteredUncompleted.length; i += 3) {
    taskGroups.push(filteredUncompleted.slice(i, i + 3));
  }

  const completedCount = weeklyPlan.tasks.filter(t => t.completed).length;
  const progress = (completedCount / Math.max(1, weeklyPlan.tasks.length)) * 100;

  if (activeFilter === 'glossary') {
    return (
      <div className="max-w-6xl mx-auto space-y-12 lg:space-y-32">
        <header className="relative">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-12 mb-12 px-4 sm:px-0 text-center sm:text-left">
            <div className="space-y-6 lg:space-y-8 max-w-2xl">
               <div className="flex items-center gap-4 mb-4 justify-center sm:justify-start">
                  <div className="px-5 py-2 rounded-full bg-accent-gold/10 text-accent-gold border border-accent-gold/20 text-[10px] font-black uppercase tracking-[0.4em]">Archival Access</div>
                  <div className="text-[10px] font-black text-text-dim uppercase tracking-[0.4em] opacity-30 italic">Secured Storage</div>
               </div>
               <h1 className="text-5xl md:text-7xl lg:text-9xl font-black tracking-tighter leading-[0.85] text-white italic capitalize">
                 Neural<br />Archive
               </h1>
            </div>
          </div>
        </header>

        <GlossaryView dictionary={state.dictionary} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 lg:space-y-32">
      <header className="relative">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-12 mb-12 lg:mb-24 px-4 sm:px-0">
          <div className="space-y-6 lg:space-y-8 max-w-2xl">
             <div className="flex items-center gap-4 mb-4">
                <div className="px-5 py-2 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 text-[10px] font-black uppercase tracking-[0.4em]">Sector Active</div>
                <div className="text-[10px] font-black text-text-dim uppercase tracking-[0.4em] opacity-30 italic">Linguist AI Core 2.4.5</div>
             </div>
             <h1 className="text-4xl md:text-7xl lg:text-9xl font-black tracking-tighter leading-[0.85] text-white italic">
               {taskGroups.length}-Day Neural<br />Deployment
             </h1>
             <div className="flex items-center gap-6 pt-4">
                <div className="w-2 h-12 bg-accent-blue rounded-full shadow-[0_0_20px_rgba(96,165,250,0.6)]" />
                <p className="text-text-dim text-2xl lg:text-3xl font-light tracking-tight italic opacity-70 leading-relaxed">{weeklyPlan.monthTitle}</p>
             </div>
          </div>
          
          <div className="glass-morphism p-8 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] flex flex-col sm:flex-row items-center gap-10 lg:gap-14 min-w-full lg:min-w-[450px] relative overflow-hidden group">
             <div className="absolute inset-0 bg-accent-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
             <div className="flex flex-col items-center gap-2 relative z-10 scale-100 lg:scale-110">
                <div className="text-5xl lg:text-6xl font-black italic text-accent-gold drop-shadow-[0_0_30px_rgba(252,211,77,0.4)]">
                  {(state.estimatedIELTSBand || 5.5).toFixed(1)}
                </div>
                <div className="text-[9px] font-black tracking-[0.5em] text-accent-gold uppercase opacity-40">IELTS Band</div>
             </div>
             <div className="w-[1px] h-24 bg-white/10 relative z-10" />
             <div className="flex-1 space-y-6 relative z-10">
                <div className="flex justify-between items-end">
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Cognitive Readiness</p>
                   <TrendingUp className="w-4 h-4 text-accent-blue animate-pulse" />
                </div>
                <div className="progress-track-dark h-2 rounded-full">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${(state.estimatedIELTSBand || 5.5) / 9 * 100}%` }} 
                    transition={{ duration: 2, ease: "circOut" }}
                    className="progress-fill-dark !bg-gradient-to-r from-accent-blue to-cyan-400 h-full rounded-full" 
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono font-bold text-white/20 uppercase tracking-widest italic">
                  <span>Baseline 1.0</span>
                  <span>Target 9.0</span>
                </div>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 glass-morphism p-12 rounded-[4rem] aspect-square lg:aspect-auto flex flex-col justify-between group overflow-hidden relative tech-border border-white/5 hover:border-white/10 transition-colors">
            <div className="relative z-10">
              <div className="section-title-dark mb-4">Neural Persistence</div>
              <div className="flex items-baseline gap-4 mb-8">
                <span className="text-7xl font-black text-white italic tracking-tighter leading-none">{Math.round(progress)}%</span>
                <span className="text-xs text-text-dim font-black uppercase tracking-widest opacity-30">({completedCount}/{weeklyPlan.tasks.length})</span>
              </div>
            </div>
            <div className="relative z-10">
               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/20 mb-4">
                  <span>Phase Progress</span>
                  <span className="text-accent-blue">Active</span>
               </div>
               <div className="progress-track-dark h-2 overflow-visible">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5 }}
                    className="progress-fill-dark !bg-white group-hover:!bg-accent-blue transition-colors relative"
                  >
                     <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_20px_white] animate-pulse" />
                  </motion.div>
               </div>
            </div>
            <Award className="absolute -right-16 -bottom-16 w-52 h-52 text-accent-gold opacity-[0.03] group-hover:scale-110 transition-transform duration-[4000ms] pointer-events-none" />
          </div>

          <div className="md:col-span-2 lg:col-span-8 glass-morphism p-12 lg:p-16 rounded-[4rem] flex flex-col md:flex-row items-center gap-14 relative overflow-hidden group tech-border border-white/5">
            <div className="absolute inset-0 bg-accent-blue/[0.01] group-hover:bg-accent-blue/[0.03] transition-colors" />
            <div className="w-28 h-28 bg-accent-blue/10 rounded-[2.5rem] flex-shrink-0 flex items-center justify-center transition-all duration-700 group-hover:scale-110 group-hover:rotate-12 border border-accent-blue/20 shadow-2xl shadow-accent-blue/10">
               <Zap className="w-12 h-12 text-accent-blue drop-shadow-[0_0_20px_rgba(96,165,250,0.5)]" />
            </div>
            <div className="relative z-10 flex-1 space-y-6">
              <div className="section-title-dark mb-0">Strategic Neural Insight</div>
              <p className="text-3xl lg:text-4xl font-light italic leading-snug text-white/90 tracking-tight">"{weeklyPlan.aiAdvice}"</p>
              <div className="flex items-center gap-5 italic opacity-40 text-sm">
                 <div className="w-8 h-[1px] bg-white/30" />
                 <span>AI Linguistic Auditor</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Neural Rewards Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* Win Streak Widget */}
        <div className="tech-border p-10 bg-black/40 rounded-[3.5rem] border-white/5 relative overflow-hidden group">
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-6 mb-8">
               <div className={`w-16 h-16 rounded-[2rem] flex items-center justify-center border transition-all ${state.streak?.count > 0 ? 'bg-orange-500/20 border-orange-500/40 text-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.4)]' : 'bg-white/5 border-white/10 text-white/20'}`}>
                  <Flame className={`w-10 h-10 ${state.streak?.count > 0 ? 'animate-pulse' : ''}`} />
               </div>
               <div>
                 <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 mb-2">Sync Series</div>
                 <div className="text-3xl font-black text-white italic tracking-tighter uppercase">{state.streak?.count || 0} Day Streak</div>
               </div>
            </div>
            <div className="mt-auto">
               <div className="text-[10px] font-black text-text-dim uppercase tracking-[0.4em] mb-4">Best Sync: {state.streak?.best || 0} Days</div>
               <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((state.streak?.count || 0) / 7) * 100)}%` }}
                    className="h-full bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.6)]" 
                  />
               </div>
            </div>
          </div>
        </div>

        {/* Neural Rank & Global Stats */}
        <div className="tech-border p-10 bg-black/40 rounded-[3.5rem] border-white/5 relative overflow-hidden group">
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-6 mb-8">
               <div className="w-16 h-16 bg-accent-blue/20 rounded-[2rem] flex items-center justify-center border border-accent-blue/40 text-accent-blue shadow-[0_0_40px_rgba(59,130,246,0.4)]">
                  <Globe className="w-10 h-10" />
               </div>
               <div>
                 <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 mb-2">System Rank</div>
                 <div className="text-3xl font-black text-white italic tracking-tighter uppercase"># {Math.floor(1000 + (state.estimatedIELTSBand * 50))} Global</div>
               </div>
            </div>
            <div className="mt-auto space-y-3">
               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-dim italic">
                  <span>Knowledge Percentile</span>
                  <span className="text-accent-blue font-black">Top 12.4%</span>
               </div>
               <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-accent-blue w-[87.6%]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.5 }} />
               </div>
            </div>
          </div>
        </div>

        {/* Active Achievements */}
        <div className="tech-border p-10 bg-black/40 rounded-[3.5rem] border-white/5 relative overflow-hidden group">
           <div className="flex flex-col h-full">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-accent-gold/20 rounded-2xl flex items-center justify-center text-accent-gold border border-accent-gold/30">
                    <Award className="w-7 h-7" />
                  </div>
                  <div className="text-lg font-black text-white uppercase italic tracking-tighter">Achievements</div>
                </div>
                <div className="text-[10px] font-black text-accent-gold uppercase tracking-[0.4em]">{state.achievements?.filter(a => a.isUnlocked).length || 0}/{state.achievements?.length || 0}</div>
             </div>
             <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
                {state.achievements?.map((a) => (
                  <div 
                    key={a.id} 
                    className={`shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center border transition-all snap-center ${a.isUnlocked ? 'bg-accent-gold/20 border-accent-gold/40 text-accent-gold shadow-[0_0_30px_rgba(250,204,21,0.3)]' : 'bg-white/5 border-white/10 text-white/20 grayscale'}`}
                    title={`${a.title}: ${a.description}`}
                  >
                    {a.icon === 'Zap' && <Zap className="w-8 h-8" />}
                    {a.icon === 'Flame' && <Flame className="w-8 h-8" />}
                    {a.icon === 'BookOpen' && <BookOpen className="w-8 h-8" />}
                  </div>
                ))}
             </div>
           </div>
        </div>
      </div>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-10 mb-20 px-4">
          <div className="flex items-center gap-8">
            <div className="w-2 h-16 bg-accent-blue rounded-full shadow-[0_0_25px_rgba(96,165,250,0.8)]" />
            <div>
               <h2 className="text-xs font-black uppercase tracking-[0.8em] text-white/30 leading-none mb-3">
                 {activeFilter === 'all' ? "Neural Mission Matrix" : `${activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Logistics`}
               </h2>
               <div className="text-xl font-black italic text-text-dim/60 tracking-widest uppercase">Sector Access Log</div>
            </div>
          </div>
          <div className="flex items-center gap-5">
             <div className="hidden lg:flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                <Activity className="w-4 h-4 text-accent-blue animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{weeklyPlan.tasks.length} Operational Nodes</span>
             </div>
             <button onClick={onRegenerate} className="btn-command-sm bg-bg-card hover:bg-white/5 border-white/10 px-8 h-14">
               <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-1000" />
               <span className="text-[11px] font-black uppercase tracking-widest ml-3">Re-Sync Matrix</span>
             </button>
          </div>
        </div>
        
        <div className="space-y-32">
          {taskGroups.length === 0 ? (
            <div className="text-center py-40 glass-morphism rounded-[5rem] border border-dashed border-white/5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/[0.01] group-hover:bg-white/[0.03] transition-colors" />
              <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto mb-12 shadow-2xl relative z-10">
                 <CheckCircle2 className="w-12 h-12 text-white opacity-20" />
              </div>
              <p className="text-4xl font-black text-white mb-4 tracking-tighter italic relative z-10">Sector Symmetry Achieved</p>
              <p className="text-xl text-text-dim max-w-sm mx-auto font-light leading-relaxed opacity-60 italic relative z-10">No pending neural loads in this sector. Re-synchronize for the next evolutionary phase or switch sectors.</p>
              <button onClick={onRegenerate} className="mt-12 btn-primary-dark mx-auto scale-90 active:scale-95 transition-all">
                <RefreshCw className="w-5 h-5 mr-3" />
                <span>Re-Deploy Matrix</span>
              </button>
            </div>
          ) : (
            taskGroups.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-12">
                <div className="flex items-center gap-6 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent-blue/10 flex items-center justify-center font-black italic text-accent-blue border border-accent-blue/20">
                    {groupIdx + 1}
                  </div>
                  <div className="text-sm font-black uppercase tracking-[0.5em] text-white/40">Daily Neural Phase 0{groupIdx + 1}</div>
                  <div className="flex-1 h-[1px] bg-white/5" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {group.map((task, idx) => (
                    <motion.div 
                      key={task.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.1 }}
                      onClick={() => !task.completed && onStartTask(task)}
                      className="group p-8 rounded-[3.5rem] border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[320px] bg-bg-card border-white/5 hover:border-accent-blue/30 hover:bg-white/[0.04] hover:-translate-y-2 shadow-2xl active:scale-95"
                    >
                      <div className="relative z-10 space-y-6">
                        <div className="flex justify-between items-start">
                           <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-bg-base shadow-xl">
                              {task.type === 'speaking' && "🗣️"}
                              {task.type === 'listening' && "🎧"}
                              {task.type === 'writing' && "✍️"}
                              {task.type === 'grammar' && "⚙️"}
                              {task.type === 'vocabulary' && "⚡"}
                              {task.type === 'reading' && "📖"}
                              {task.type === 'quiz' && "🧩"}
                           </div>
                        </div>
                        <div>
                           <div className="text-[9px] font-black uppercase tracking-[0.4em] text-accent-blue mb-1">{task.type}</div>
                           <h3 className="text-2xl font-black italic text-white tracking-tight leading-tight group-hover:text-accent-blue transition-colors">{task.title}</h3>
                           <p className="text-xs text-text-dim/60 font-light italic mt-2 line-clamp-2">{task.topic || task.description}</p>
                        </div>
                      </div>

                      <div className="relative z-10 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/30 pt-6 border-t border-white/5">
                        <div className="flex items-center gap-2">
                           <Clock className="w-3 h-3" />
                           <span>{task.estimatedTime}m</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <Shield className="w-3 h-3" />
                           <span>{task.difficulty}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Completed Lessons Cluster: Visual Progress */}
          {completedTasks.length > 0 && (
            <div className="pt-20 border-t border-white/5 space-y-12">
               <div className="flex items-center gap-6 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="text-sm font-black uppercase tracking-[0.5em] text-white/40">Mastered Pathways Archive</div>
                  <div className="flex-1 h-[1px] bg-white/5" />
               </div>
               <div className="flex flex-wrap gap-4 px-4 overflow-x-auto pb-4 scrollbar-none">
                  {completedTasks.slice(-24).map((task) => (
                    <motion.div 
                      key={task.id}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-xl grayscale opacity-40 hover:grayscale-0 hover:opacity-100 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-help relative group/icon"
                      title={`${task.title} (Completed)`}
                    >
                      {task.type === 'speaking' && "🗣️"}
                      {task.type === 'listening' && "🎧"}
                      {task.type === 'writing' && "✍️"}
                      {task.type === 'grammar' && "⚙️"}
                      {task.type === 'vocabulary' && "⚡"}
                      {task.type === 'reading' && "📖"}
                      {task.type === 'quiz' && "🧩"}
                      
                      <div className="absolute -top-12 left-1/2 -track-x-1/2 px-4 py-2 bg-emerald-500 text-bg-base text-[9px] font-black uppercase tracking-widest rounded-xl whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity z-50 pointer-events-none">
                        {task.title}
                      </div>
                    </motion.div>
                  ))}
                  {completedTasks.length > 24 && (
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-white/30">
                      +{completedTasks.length - 24}
                    </div>
                  )}
               </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-16 pt-20 border-t border-white/5">
          <div className="xl:col-span-7 space-y-16">
            <div className="space-y-4">
               <h2 className="section-title-dark tracking-[0.8em] mb-0">Neural Proficiency Matrix</h2>
               <p className="text-text-dim font-light italic opacity-50">Real-time dynamic skill evaluation based on submission metadata.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {Object.entries(state.masteryScores || {}).map(([skill, score], idx) => (
                <div key={skill} className="glass-morphism p-12 rounded-[3.5rem] group hover:border-white/20 transition-all duration-700 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.01] group-hover:opacity-[0.03] transition-opacity">
                     <Activity className="w-32 h-32" />
                  </div>
                  <div className="flex justify-between items-end mb-10 relative z-10">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.5em] text-accent-blue mb-5 flex items-center gap-3">
                         <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse shadow-[0_0_10px_rgba(96,165,250,1)]" />
                         {skill} Hub
                      </p>
                      <span className="text-5xl font-black text-white tracking-widest italic">{Math.round(score)}<span className="text-xs font-light text-text-dim tracking-normal ml-2">% MASTERY</span></span>
                    </div>
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                       <BarChart3 className="w-7 h-7 text-accent-blue" />
                    </div>
                  </div>
                  <div className="progress-track-dark h-1.5 overflow-visible relative z-10">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 2, ease: "circOut", delay: idx * 0.1 }}
                      className="progress-fill-dark !bg-accent-blue shadow-[0_0_15px_rgba(96,165,250,0.6)] h-full relative" 
                    >
                       <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white rounded-full group-hover:scale-150 transition-transform" />
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-5 space-y-16">
            <div className="space-y-4">
               <h2 className="section-title-dark tracking-[0.8em] mb-0">Syllabus Framework</h2>
               <p className="text-text-dim font-light italic opacity-50">Linguistic logic underlying your current cognitive path.</p>
            </div>
            <div className="glass-morphism p-12 lg:p-20 rounded-[5rem] relative overflow-hidden group min-h-full flex flex-col justify-center border-dashed border-white/10 hover:border-accent-gold/30 transition-colors duration-1000">
              <div className="relative z-10">
                <div className="w-24 h-24 bg-accent-gold/10 rounded-[3.5rem] flex items-center justify-center mb-16 border border-accent-gold/20 shadow-2xl shadow-accent-gold/5 group-hover:scale-110 transition-transform duration-1000">
                   <Target className="w-12 h-12 text-accent-gold drop-shadow-2xl" />
                </div>
                <h3 className="text-5xl font-black text-white mb-10 leading-none tracking-tighter italic">Adaptive Interleaving Core</h3>
                <p className="text-3xl leading-snug text-text-dim font-light opacity-90 mb-16 italic tracking-tight">"Proprietary cognitive algorithms mix divergent skill sets to trigger <strong>maximum synaptic plasticity</strong>—mirroring the high-stress retrieval demands of reality."</p>
                
                <div className="pt-12 border-t border-white/5 flex items-center justify-between">
                  <div className="flex -space-x-4">
                    <div className="w-16 h-16 rounded-full border-4 border-bg-card bg-accent-blue/30 backdrop-blur-xl" />
                    <div className="w-16 h-16 rounded-full border-4 border-bg-card bg-accent-gold/30 backdrop-blur-xl" />
                    <div className="w-16 h-16 rounded-full border-4 border-bg-card bg-white/40 shadow-2xl" />
                  </div>
                  <div className="flex items-center gap-5 text-accent-gold font-black uppercase tracking-[0.5em] text-[11px] italic">
                    <Award className="w-6 h-6 animate-pulse" />
                    <span>Neural Path Verified</span>
                  </div>
                </div>
              </div>
              <div className="absolute -right-32 -top-32 w-[500px] h-[500px] bg-accent-gold/[0.03] blur-[150px] group-hover:scale-150 transition-transform duration-[8000ms]" />
            </div>
          </div>
      </section>
    </div>
  );
}

function ExerciseView({ 
  task, 
  sessionState, 
  updateSession, 
  onClose, 
  onComplete,
  onWordsVerified
}: { 
  task: LearningTask, 
  sessionState: { userInput: string, quizAnswers: Record<string, string>, unknownWords: Record<string, string>, dictionary: Record<string, string> },
  updateSession: (upd: any) => void,
  onClose: () => void, 
  onComplete: (id: string, score: number, feedback: string) => void,
  onWordsVerified: (words: Record<string, string>) => void
}) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [result, setResult] = useState<{ score: number, feedback: string } | null>(null);
  const [recording, setRecording] = useState(false);
  
  const [testMode, setTestMode] = useState(false);
  const [vocabAnswers, setVocabAnswers] = useState<Record<string, string>>({});
  const [showVocabResults, setShowVocabResults] = useState(false);
  const [isTranslating, setIsTranslating] = useState<string | null>(null);

  const userInput = sessionState.userInput;
  const unknownWords = sessionState.unknownWords;

  const setUserInput = (val: string) => updateSession({ sessionUserInput: val });
  const setUnknownWords = (newWords: any) => {
    const val = typeof newWords === 'function' ? newWords(unknownWords) : newWords;
    updateSession({ sessionUnknownWords: val });
  };

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleWordClick = async (word: string) => {
    const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").toLowerCase().trim();
    if (!cleanWord || isTranslating === cleanWord) return;
    
    if (unknownWords[cleanWord]) return;

    // Check global dictionary first
    if (sessionState.dictionary[cleanWord]) {
      setUnknownWords((prev: any) => ({ ...prev, [cleanWord]: sessionState.dictionary[cleanWord] }));
      return;
    }

    setIsTranslating(cleanWord);
    try {
      const translation = await getWordTranslation(cleanWord, task.content?.exercise || '');
      setUnknownWords((prev: any) => ({ ...prev, [cleanWord]: translation }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslating(null);
    }
  };

  const renderClickableText = (text: string) => {
    if (!text) return null;
    return text.split(' ').map((word, i) => {
      const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").toLowerCase().trim();
      const translation = unknownWords[cleanWord];
      
      return (
        <span key={i} className="inline-block mr-1.5 mb-1 group/word relative">
          <button
            onClick={() => handleWordClick(word)}
            className={`transition-all duration-300 relative rounded-md px-0.5 ${
              translation 
                ? 'bg-accent-blue/20 text-accent-blue font-medium cursor-help underline decoration-accent-blue/30' 
                : 'hover:bg-white/10 hover:text-white cursor-pointer px-1'
            }`}
          >
            {word}
            {translation && (
              <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-accent-blue text-bg-base text-[10px] font-black uppercase tracking-widest rounded-xl whitespace-nowrap shadow-2xl opacity-0 group-hover/word:opacity-100 transition-opacity z-[60]">
                {translation}
              </span>
            )}
            {isTranslating === cleanWord && (
              <span className="absolute inset-0 flex items-center justify-center">
                 <RefreshCw className="w-3 h-3 animate-spin text-accent-blue" />
              </span>
            )}
          </button>
        </span>
      );
    });
  };

  const handlePlayAudio = async () => {
    const textToRead = task.content?.audioScript || task.content?.exercise;
    if (!textToRead || isPlayingAudio) return;
    
    setIsPlayingAudio(true);
    const base64 = await getTaskAudio(textToRead);
    
    if (base64) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const binary = atob(base64);
      const buffer = new Int16Array(binary.length / 2);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      }
      
      const audioBuffer = ctx.createBuffer(1, buffer.length, 24000);
      const nowBuffering = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        nowBuffering[i] = buffer[i] / 32768.0;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlayingAudio(false);
      source.start();
    } else {
      setIsPlayingAudio(false);
    }
  };

  useEffect(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setUserInput(transcript);
      };

      recognition.onend = () => setRecording(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
    } else {
      setUserInput('');
      recognitionRef.current?.start();
      setRecording(true);
    }
  };

  const handleQuizOptionSelect = (qIdx: number, option: string) => {
    updateSession({ 
      sessionQuizAnswers: { 
        ...sessionState.quizAnswers, 
        [qIdx]: option 
      } 
    });
  };

  const handleSubmit = async () => {
    if (task.type === 'quiz') {
      const quizItems = task.content.quizItems || [];
      let correctCount = 0;
      let detailedFeedback = "";

      quizItems.forEach((item: any, idx: number) => {
        const userAns = sessionState.quizAnswers[idx];
        const isCorrect = userAns === item.correctAnswer;
        if (isCorrect) correctCount++;
        detailedFeedback += `\nQ${idx+1}: ${isCorrect ? '✅' : '❌'} ${item.explanation}`;
      });

      const score = Math.round((correctCount / quizItems.length) * 100);
      setResult({
        score,
        feedback: `Результат теста: ${correctCount}/${quizItems.length}.\n${detailedFeedback}`
      });
      return;
    }

    if (!userInput.trim()) return;
    setIsEvaluating(true);
    try {
      const res = await getExerciseFeedback(task, userInput);
      setResult(res);
    } catch (error) {
      console.error(error);
      alert("Neural sync error during evaluation.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-10 selection:bg-accent-blue selection:text-white px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 sm:mb-20 gap-8">
        <button onClick={onClose} className="p-4 sm:p-5 bg-white/5 border border-white/10 rounded-2xl text-text-dim hover:text-white hover:border-white/20 transition-all flex items-center gap-4 font-black uppercase tracking-widest text-[9px] group backdrop-blur-3xl shadow-2xl">
          <ArrowRight className="w-5 h-5 rotate-180 group-hover:-translate-x-2 transition-transform" />
          Abort Mission
        </button>
        <div className="flex items-center gap-8 w-full sm:w-auto justify-between">
           <div className="text-right">
              <div className="text-[10px] font-black text-accent-gold uppercase tracking-[0.5em] mb-1 opacity-50">Operation Sector</div>
              <div className="text-xl sm:text-3xl font-black text-white tracking-tighter uppercase italic">{task.type}</div>
           </div>
           <div className="w-[1px] h-12 bg-white/10 hidden sm:block" />
           <div className="w-14 h-14 bg-accent-blue rounded-2xl flex items-center justify-center text-bg-base font-black italic shadow-2xl shadow-accent-blue/30 blur-[0.2px]">COGNITO</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12 sm:gap-16">
          <div className="card-dark p-8 sm:p-12 lg:p-24 relative overflow-hidden backdrop-blur-[60px] bg-bg-card/30 border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)] rounded-[3rem] sm:rounded-[5rem]">
             {/* Decorative Background Elements */}
             <div className="absolute top-0 right-0 p-16 opacity-[0.02] pointer-events-none">
                <Globe className="w-96 h-96 rotate-12" />
             </div>
             <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-accent-blue/5 blur-[150px] pointer-events-none rounded-full" />

             {!result ? (
               <div className="space-y-24 relative z-10">
                 {/* Task Title & Specs */}
                 <div className="max-w-5xl mx-auto space-y-12">
                    <div className="space-y-8">
                      <div className="flex items-center gap-4">
                         <span className="w-12 h-0.5 bg-accent-blue" />
                         <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.5em]">Phase Day {task.id.includes('relocation') ? 'SPECIAL' : '01'} - MISSION_INIT</span>
                      </div>
                      <h2 className="text-6xl lg:text-9xl font-black tracking-tight leading-[0.8] text-white italic">
                        {renderClickableText(task.title)}
                      </h2>
                      <p className="text-2xl lg:text-4xl text-text-main/70 font-light leading-snug tracking-tight italic max-w-4xl">
                        {renderClickableText(task.description)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-6 items-center pt-8 border-t border-white/5">
                      <div className="flex items-center gap-4 px-8 py-3 bg-white/5 rounded-full border border-white/5">
                         <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse shadow-[0_0_10px_rgba(96,165,250,1)]" />
                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Neural Stream Active</span>
                      </div>
                      <div className="flex items-center gap-4 px-8 py-3 bg-white/5 rounded-full border border-white/5">
                         <Clock className="w-4 h-4 text-accent-gold" />
                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">{task.estimatedTime}m Load</span>
                      </div>
                      <div className="flex items-center gap-4 px-8 py-3 bg-white/5 rounded-full border border-white/5">
                         <Shield className="w-4 h-4 text-emerald-400" />
                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">{task.difficulty} COMPLEXITY</span>
                      </div>
                    </div>
                 </div>

                 {/* Laboratory Resources */}
                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 max-w-6xl mx-auto">
                    {(task.content?.exercise || task.content?.audioScript) && (
                      <div className="lg:col-span-12 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-0.5 bg-accent-blue" />
                               <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-accent-blue/60">Primary Source Material</h4>
                            </div>
                            <button 
                              onClick={handlePlayAudio}
                              disabled={isPlayingAudio}
                              className="btn-command-sm bg-accent-blue/10 text-accent-blue border-accent-blue/20 hover:bg-accent-blue/20 ring-offset-bg-base"
                            >
                              {isPlayingAudio ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                              <span className="text-[10px] font-black uppercase tracking-widest">{isPlayingAudio ? 'TRANSMITTING...' : 'AUDIO FEED'}</span>
                            </button>
                        </div>
                        
                        <div className="tech-border p-8 lg:p-16 bg-bg-base/30 rounded-[2.5rem] lg:rounded-[4rem] text-xl lg:text-3xl leading-relaxed text-text-main font-light italic relative group custom-scrollbar max-h-[400px] lg:max-h-[600px] overflow-y-auto border-white/5 selection:bg-accent-blue selection:text-white">
                           <div className="absolute top-10 right-10 p-4 bg-bg-card border border-white/10 rounded-2xl opacity-10 group-hover:opacity-40 transition-opacity">
                              <Target className="w-6 h-6 text-accent-blue" />
                           </div>
                           <div className="flex flex-wrap items-baseline content-start">
                             {renderClickableText(task.content?.exercise || task.content?.audioScript || '')}
                           </div>
                        </div>
                      </div>
                    )}

                    {task.content?.vocabularyList && (
                      <div className="lg:col-span-6 space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-0.5 bg-accent-gold" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-accent-gold/60">Lexical Tokens</h4>
                        </div>
                        <div className="flex flex-wrap gap-3 sm:gap-4 p-8 sm:p-10 bg-white/5 rounded-[2.5rem] lg:rounded-[4rem] border border-white/5">
                          {(task.content.vocabularyList || []).map((item: any, idx: number) => {
                            const word = typeof item === 'string' ? item : item.word;
                            const translation = typeof item === 'string' ? '' : item.translation;
                            return (
                              <button 
                                key={idx} 
                                onClick={() => handleWordClick(word)}
                                className="px-6 py-3 bg-accent-gold/10 text-accent-gold border border-accent-gold/10 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-accent-gold/20 transition-all italic text-left group/v"
                              >
                                <span>{word}</span>
                                {translation && <span className="ml-3 opacity-40 group-hover/v:opacity-100 transition-opacity whitespace-nowrap">[{translation}]</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {task.content?.questions && (
                      <div className="lg:col-span-6 space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-0.5 bg-emerald-400" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-emerald-400/60">Inquiry Vectors</h4>
                        </div>
                        <div className="p-6 lg:p-10 bg-white/5 rounded-[2rem] lg:rounded-[4rem] border border-white/5">
                           <ul className="space-y-6 lg:space-y-8">
                             {(task.content.questions || []).map((q: string, i: number) => (
                               <li key={i} className="flex gap-4 lg:gap-6 text-xl lg:text-2xl font-light italic leading-tight text-white/80 group/q">
                                 <span className="text-emerald-400 font-black not-italic text-sm pt-1">0{i+1}.</span>
                                 <span className="group-hover/q:text-white transition-colors">
                                   {renderClickableText(q)}
                                 </span>
                               </li>
                             ))}
                           </ul>
                        </div>
                      </div>
                    )}
                 </div>

                 {/* Response Laboratory */}
                 <div className="max-w-5xl mx-auto space-y-16">
                    <div className="flex items-center gap-8">
                       <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                       <div className="text-[10px] font-black uppercase tracking-[0.8em] text-text-dim/40">Transmission Point</div>
                       <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>

                    <div className="relative">
                      {task.type === 'quiz' ? (
                         <div className="space-y-16">
                            {(task.content.quizItems || []).map((item: any, qIdx: number) => (
                              <div key={qIdx} className="space-y-8">
                                <div className="flex items-center gap-6">
                                   <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue font-black border border-accent-blue/20">0{qIdx + 1}</div>
                                   <h5 className="text-2xl font-black italic text-white tracking-tight">{item.question}</h5>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   {(item.options || []).map((opt: string, oIdx: number) => {
                                     const isSelected = sessionState.quizAnswers[qIdx] === opt;
                                     return (
                                       <button 
                                         key={oIdx}
                                         onClick={() => handleQuizOptionSelect(qIdx, opt)}
                                         className={`quiz-option ${isSelected ? 'quiz-option-selected' : ''}`}
                                       >
                                         <span className="text-lg font-light italic">{opt}</span>
                                         {isSelected && <CheckCircle2 className="w-6 h-6 text-accent-blue animate-pulse" />}
                                       </button>
                                     );
                                   })}
                                </div>
                              </div>
                            ))}
                         </div>
                      ) : task.type === 'speaking' ? (
                         <div className="flex flex-col items-center gap-16">
                            <div className="w-full min-h-[350px] p-16 lg:p-24 bg-bg-base/40 rounded-[4.5rem] border-2 border-dashed border-white/10 text-center flex flex-col items-center justify-center hover:border-accent-blue/30 transition-all group/speak relative overflow-hidden">
                               <div className="absolute inset-0 bg-accent-blue/[0.02] opacity-0 group-hover/speak:opacity-100 transition-opacity" />
                               <div className="relative z-10 text-3xl lg:text-5xl font-light text-white italic leading-relaxed max-w-3xl">
                                  {userInput || (recording ? 'Streaming bio-audio interface...' : 'Initialize neural voice transmission...')}
                               </div>
                               {recording && (
                                  <div className="absolute inset-x-0 bottom-0 py-8 flex justify-center gap-2">
                                     {[1, 2, 3, 4, 5].map(i => (
                                       <motion.div 
                                         key={i}
                                         animate={{ height: [10, 40, 10] }}
                                         transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                                         className="w-1 bg-accent-blue rounded-full shadow-[0_0_10px_rgba(96,165,250,0.8)]"
                                       />
                                     ))}
                                  </div>
                               )}
                            </div>
                            
                            <div className="flex flex-col items-center gap-8">
                              <motion.button
                                animate={recording ? { scale: [1, 1.1, 1] } : {}}
                                transition={{ repeat: Infinity, duration: 2 }}
                                onClick={toggleRecording}
                                className={`w-32 h-32 rounded-[3.5rem] flex items-center justify-center shadow-2xl transition-all relative overflow-hidden ring-offset-bg-base ring-offset-4 ring-transparent hover:ring-white/20 ${
                                  recording ? 'bg-accent-gold text-bg-base scale-110 shadow-accent-gold/40' : 'bg-accent-blue text-bg-base hover:-translate-y-3 shadow-accent-blue/30'
                                }`}
                              >
                                 <Mic className="w-14 h-14" />
                              </motion.button>
                              <div className="text-[10px] font-black uppercase tracking-[0.5em] text-text-dim">
                                 {recording ? 'PROTOCOL: CAPTURING' : 'DEPLOY INTERFACE'}
                              </div>
                            </div>
                         </div>
                      ) : (
                        <div className="relative group">
                           <textarea
                             value={userInput}
                             onChange={(e) => setUserInput(e.target.value)}
                             placeholder={task.type === 'reading' ? "Begin neural data interpretation..." : "Drafting mission response schema..."}
                             className="w-full min-h-[550px] bg-bg-base/50 p-16 lg:p-24 rounded-[4.5rem] border border-white/5 focus:border-accent-blue/30 focus:bg-bg-base/70 outline-none transition-all text-2xl lg:text-3xl font-light leading-relaxed text-white placeholder:text-white/10 italic custom-scrollbar shadow-inner"
                           />
                           <div className="absolute bottom-12 right-12 text-[10px] font-mono font-bold text-white/10 uppercase tracking-[0.3em] pointer-events-none group-hover:text-white/30 transition-all italic">Linguist.COGNITO_v3.Alpha</div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center pt-10">
                      <button
                        disabled={!userInput.trim() || isEvaluating}
                        onClick={handleSubmit}
                        className="btn-command group bg-white text-bg-base border-white hover:bg-transparent hover:text-white px-20 py-8 text-2xl rounded-[2.5rem] transition-all duration-700 shadow-[0_20px_50px_rgba(255,255,255,0.2)]"
                      >
                        {isEvaluating ? <Loader2 className="w-8 h-8 animate-spin mr-6" /> : <Zap className="w-8 h-8 mr-6 group-hover:scale-125 transition-transform" />}
                        <span className="font-black italic uppercase tracking-widest">{isEvaluating ? 'SYNCING MATRIX...' : 'COMMIT FEED'}</span>
                      </button>
                    </div>
                 </div>
               </div>
             ) : !testMode && Object.keys(unknownWords).length > 0 ? (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="space-y-16 relative z-10 text-center py-20"
               >
                 <div className="w-48 h-48 bg-accent-gold/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-accent-gold/20 relative">
                    <div className="absolute inset-0 bg-accent-gold/5 blur-3xl animate-pulse" />
                    <Sparkles className="w-20 h-20 text-accent-gold relative z-10" />
                 </div>
                 <div className="space-y-6">
                    <h2 className="text-7xl lg:text-9xl font-black italic text-white tracking-tighter uppercase leading-none">Lexical Test</h2>
                    <p className="text-2xl lg:text-3xl text-text-dim max-w-2xl mx-auto font-light leading-snug tracking-tight italic">
                      Neural analysis detected <span className="text-accent-gold font-bold">{Object.keys(unknownWords).length} new lexical tokens</span>. You must verify their definitions to synchronize the matrix.
                    </p>
                 </div>
                 <button 
                  onClick={() => setTestMode(true)}
                  className="btn-command group bg-accent-gold text-bg-base border-accent-gold hover:bg-transparent hover:text-accent-gold px-24 py-10 text-3xl rounded-[3rem] transition-all duration-700 shadow-[0_30px_70px_rgba(252,211,77,0.2)]"
                 >
                   <span className="font-black italic uppercase tracking-[0.2em]">Initialize Check</span>
                 </button>
               </motion.div>
             ) : testMode ? (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="space-y-20 relative z-10 max-w-5xl mx-auto py-10"
               >
                 <header className="text-center space-y-8">
                    <div className="flex items-center justify-center gap-4">
                       <span className="w-12 h-0.5 bg-accent-blue" />
                       <div className="text-xs font-black text-accent-blue uppercase tracking-[0.8em]">Mandatory Verification</div>
                       <span className="w-12 h-0.5 bg-accent-blue" />
                    </div>
                    <h2 className="text-6xl lg:text-8xl font-black italic text-white tracking-tighter uppercase">Def_Verification</h2>
                 </header>

                 <div className="grid gap-10">
                   {Object.keys(unknownWords).map((word) => (
                     <div key={word} className="tech-border p-10 lg:p-14 bg-bg-card/40 rounded-[3rem] border-white/5 flex flex-col sm:flex-row items-center gap-12 group transition-all hover:bg-bg-card/60">
                        <div className="text-5xl lg:text-7xl font-black italic text-accent-blue/80 w-full sm:w-1/2 text-left tracking-tighter">{word}</div>
                        <div className="w-full sm:w-1/2 relative">
                          <input 
                            type="text"
                            placeholder="Enter definition..."
                            value={vocabAnswers[word] || ''}
                            onChange={(e) => setVocabAnswers(prev => ({ ...prev, [word]: e.target.value }))}
                            className="w-full bg-bg-base/60 border border-white/10 rounded-[2rem] px-8 py-8 text-2xl text-white italic outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-all placeholder:text-white/5"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 right-8 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
                             <PenTool className="w-6 h-6 text-white" />
                          </div>
                        </div>
                     </div>
                   ))}
                 </div>

                 <div className="flex justify-center pt-10">
                    <button 
                      onClick={() => {
                        const allFilled = Object.keys(unknownWords).every(w => (vocabAnswers[w] || '').trim().length > 0);

                        if (allFilled) {
                          if (!showVocabResults) {
                            setShowVocabResults(true);
                          } else {
                            onWordsVerified(vocabAnswers);
                            setUnknownWords({}); // This triggers transition to the final result screen
                            setTestMode(false);
                            setShowVocabResults(false);
                          }
                        } else {
                          alert("Matrix sync incomplete. All lexical fields required.");
                        }
                      }}
                      className="btn-command group bg-white text-bg-base px-24 py-10 text-3xl rounded-[3rem] transition-all duration-700 shadow-[0_30px_70px_rgba(255,255,255,0.1)]"
                    >
                      <Zap className="w-8 h-8 mr-6 group-hover:scale-125 transition-transform" />
                      <span className="font-black italic uppercase tracking-[0.2em]">Finalize Operation</span>
                    </button>
                 </div>
               </motion.div>
             ) : (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="text-center max-w-5xl mx-auto py-20"
               >
                 <div className="mb-24 space-y-10">
                    <div className="relative inline-block">
                       <div className="w-64 h-64 lg:w-80 h-80 rounded-full border border-white/10 flex items-center justify-center mx-auto bg-gradient-to-br from-accent-gold/10 to-transparent shadow-[0_0_100px_rgba(252,211,77,0.1)] relative overflow-hidden group">
                          <div className="absolute inset-0 bg-accent-gold/5 animate-pulse" />
                          <div className="relative z-10 text-9xl lg:text-[11rem] font-black text-white italic drop-shadow-[0_0_40px_rgba(255,255,255,0.4)] selection:bg-accent-blue">{result.score}</div>
                       </div>
                       <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-10 py-3 bg-accent-gold text-bg-base rounded-2xl font-black italic tracking-[0.3em] text-xs uppercase shadow-2xl">Neural Mastery Index</div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-6xl lg:text-8xl font-black tracking-tighter text-white italic">Protocol Fulfilled</h3>
                      <p className="text-[11px] font-black uppercase tracking-[0.8em] text-accent-gold opacity-50">SYNC_STATUS: SUCCESSFUL (LVL-3_ADPT)</p>
                    </div>
                 </div>

                 <div className="tech-border p-16 lg:p-24 bg-bg-accent/40 rounded-[5rem] text-left mb-24 relative overflow-hidden border-2 shadow-2xl border-white/5 backdrop-blur-3xl group/fb">
                    <div className="absolute -right-20 -bottom-20 p-16 opacity-[0.02] group-hover/fb:scale-110 group-hover/fb:opacity-[0.05] transition-all duration-1000">
                       <Target className="w-80 h-80" />
                    </div>
                    <div className="flex items-center gap-6 mb-12 text-accent-gold">
                      <div className="w-14 h-14 bg-accent-gold/10 rounded-2xl flex items-center justify-center border border-accent-gold/20">
                         <Shield className="w-8 h-8" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.4em]">AI TACTICAL DEBRIEF</span>
                    </div>

                    <div className="mb-12 space-y-6">
                       <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 ml-2">Response_Transcript</div>
                       <div className="p-10 bg-black/40 rounded-[2.5rem] border border-white/5 text-2xl text-text-dim italic font-light leading-relaxed">
                          "{userInput}"
                       </div>
                    </div>

                    <p className="text-3xl lg:text-5xl leading-tight text-white font-light italic tracking-tight selection:bg-accent-blue selection:text-white px-2">
{result.score < 45 && (
                         <div className="mb-16 p-10 bg-red-500/5 border border-red-500/20 rounded-[3rem] flex items-center gap-10 group/warn transition-all hover:bg-red-500/10 shadow-[0_40px_100px_rgba(239,68,68,0.1)] backdrop-blur-xl">
                            <div className="w-20 h-20 bg-red-500/20 rounded-[2rem] flex items-center justify-center text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse shrink-0">
                               <RefreshCw className="w-10 h-10" />
                            </div>
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.5em] text-red-500 mb-2">Neural Link Instability Detected</div>
                              <p className="text-2xl font-light text-red-100 italic tracking-tight leading-snug">Performance index ({result.score}%) dropped below absolute threshold. We recommend re-engaging this mission to stabilize the synaptic data and ensure permanent lexical retention.</p>
                            </div>
                         </div>
                       )}

                       {result.feedback}
                    </p>

                    {Object.keys(vocabAnswers).length > 0 && (
                      <div className="mt-20 pt-16 border-t border-white/10 space-y-8">
                        <div className="flex items-center gap-4">
                          <Plus className="w-4 h-4 text-accent-blue" />
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-accent-blue/60">Neural Glossary Expansion</span>
                        </div>
                        <div className="flex flex-wrap gap-4">
                          {Object.entries(vocabAnswers).map(([w, t]) => (
                            <div key={w} className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4 group/v">
                               <span className="text-sm font-black italic text-white uppercase tracking-tight">{w}</span>
                               <ArrowRight className="w-3 h-3 text-white/20 group-hover/v:text-accent-blue transition-colors" />
                               <span className="text-sm font-light italic text-text-dim">{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>

                 <button
                   onClick={() => onComplete(task.id, result.score, result.feedback)}
                   className="group relative px-20 py-8 bg-accent-blue text-bg-base rounded-[3rem] font-black text-2xl lg:text-3xl italic uppercase tracking-[0.3em] overflow-hidden shadow-[0_20px_50px_rgba(59,130,246,0.3)] transition-all hover:-translate-y-4 active:translate-y-0"
                 >
                   <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                   <div className="flex items-center gap-6 relative z-10">
                     <span>RETURN_TO_HUB</span>
                     <ArrowRight className="w-8 h-8 group-hover:translate-x-3 transition-transform" />
                   </div>
                 </button>
               </motion.div>
             )}
          </div>
      </div>
    </div>
  );
}

function CommunicationView({ scenarios, onSelect, onRegenerate }: { scenarios: CommunicationScenario[], onSelect: (s: CommunicationScenario) => void, onRegenerate: () => void }) {
  return (
    <div className="max-w-6xl mx-auto space-y-12 py-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-4 sm:px-0">
        <div>
           <div className="text-[10px] font-black uppercase tracking-[0.5em] text-accent-gold mb-3">Language Activation Layer</div>
           <h2 className="text-3xl lg:text-6xl font-black italic text-white tracking-tighter leading-none">
             Tactical Communication
           </h2>
           <p className="mt-4 text-text-dim text-base lg:text-lg font-light italic opacity-60">High-stakes situational immersion. Master the art of conflict, negotiation, and social dynamics.</p>
        </div>
        <button 
          onClick={onRegenerate}
          className="flex items-center gap-3 px-8 py-4 rounded-full border border-white/10 text-white hover:bg-white/5 transition-all group"
        >
          <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
          <span className="font-black italic uppercase tracking-tighter text-sm">Regenerate Matrix</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {(scenarios || []).map((s) => (
          <motion.button
            key={s.id}
            whileHover={{ y: -10, scale: 1.02 }}
            onClick={() => onSelect(s)}
            className="glass-morphism p-10 rounded-[3.5rem] border-white/5 hover:border-accent-gold/30 transition-all text-left flex flex-col group relative overflow-hidden"
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${s.type === 'voice' ? 'bg-accent-gold/20 text-accent-gold' : 'bg-accent-blue/20 text-accent-blue'}`}>
               {s.type === 'voice' ? <Mic className="w-7 h-7" /> : <MessageSquare className="w-7 h-7" />}
            </div>
            
            <div className="text-[10px] font-black uppercase tracking-widest text-text-dim opacity-40 mb-2">Scenario Alpha</div>
            <h3 className="text-2xl font-black text-white italic tracking-tight mb-4 group-hover:text-accent-gold transition-colors">{s.situation}</h3>
            <p className="text-sm text-text-dim font-light italic mb-8 flex-1 line-clamp-3 leading-relaxed">{s.description}</p>
            
            <div className="flex items-center justify-between pt-6 border-t border-white/5">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-widest">{s.difficulty}</span>
               </div>
               <div className="flex items-center gap-2 text-white/40 text-[10px] font-black italic">
                 INITIATE
                 <ChevronRight className="w-4 h-4" />
               </div>
            </div>
            
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
               {s.type === 'voice' ? <Volume2 className="w-32 h-32" /> : <Send className="w-32 h-32" />}
            </div>
          </motion.button>
        ))}
      </div>

      <div className="p-12 rounded-[4rem] border border-accent-gold/10 bg-accent-gold/5 flex flex-col md:flex-row items-center gap-10">
         <div className="w-20 h-20 rounded-full bg-accent-gold/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-10 h-10 text-accent-gold" />
         </div>
         <div>
            <h4 className="text-2xl font-black italic text-white mb-2">Scientific Fluency Protocol</h4>
            <p className="text-text-dim font-light italic text-lg leading-relaxed">
              These scenarios implement <strong className="text-accent-gold">Embodied Learning</strong>. By simulating real-world pressure (Voice or Text), your brain bypasses passive memorization and forces active neural retrieval, which is the fastest route to natural fluency.
            </p>
         </div>
      </div>
    </div>
  );
}

function ScenarioSession({ scenario, onClose, state, setState, setLoadingStatus }: { scenario: CommunicationScenario, onClose: () => void, state: AppState, setState: any, setLoadingStatus: any }) {
  const [messages, setMessages] = useState<AIChatMessage[]>([{ role: 'assistant', content: `[${scenario.roleAI}]: Hello. Let's begin the scenario. ${scenario.description} Your goal: ${scenario.goal}` }]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState<{ score: number, feedback: string } | null>(null);
  const recognition = useRef<any>(null);

  useEffect(() => {
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };
      recognition.current.onerror = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognition.current?.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognition.current?.start();
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      // Use the tutor service or a specialized scenario service (simulated here with tutor for speed)
      const aiResponse = await getTutorResponse([...messages, userMsg]);
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "SYSTEM_ERROR: Neural relay lost." }]);
    }
  };

  const handleEvaluate = async () => {
    setLoadingStatus('Analyzing Linguistic Performance...');
    // We repurpose getExerciseFeedback for scenarios
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return;
    
    try {
      const evalResult = await getExerciseFeedback({
        id: scenario.id,
        type: scenario.type === 'voice' ? 'speaking' : 'writing',
        title: scenario.situation,
        description: scenario.description,
        topic: 'Tactical Communication',
        difficulty: scenario.difficulty,
        estimatedTime: 0,
        completed: false,
        content: { exercise: scenario.description, questions: [scenario.goal] }
      }, messages.map(m => `${m.role}: ${m.content}`).join('\n'));
      
      setFeedback(evalResult);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-10">
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-4 px-4 sm:px-0">
        <button onClick={onClose} className="flex items-center gap-3 text-text-dim hover:text-white transition-colors group">
           <ChevronRight className="w-6 h-6 rotate-180" />
           <span className="font-black italic uppercase tracking-widest text-[10px]">Exit Layer</span>
        </button>
        <div className="text-center lg:text-right">
           <div className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-gold mb-1">Active Scenario</div>
           <div className="text-lg lg:text-xl font-bold text-white italic">{scenario.situation}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
           <div className="glass-morphism h-[600px] rounded-[3.5rem] flex flex-col overflow-hidden relative">
              <div className="p-8 border-b border-white/5 bg-white/2 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-accent-gold animate-pulse" />
                    <div>
                       <div className="text-[8px] font-black uppercase text-accent-gold tracking-widest">Neural Uplink Status</div>
                       <div className="text-xs font-bold text-white italic">Live Transmission...</div>
                    </div>
                 </div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-text-dim opacity-30">Goal: {scenario.goal}</div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                {messages.map((m, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-8 rounded-[2.5rem] ${m.role === 'user' ? 'bg-accent-blue/10 border border-accent-blue/20 text-white rounded-br-none' : 'bg-white/5 border border-white/5 text-white/90 rounded-bl-none'}`}>
                       <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-3">{m.role === 'assistant' ? scenario.roleAI : scenario.roleUser}</div>
                       <p className="text-lg font-light leading-relaxed italic">{m.content}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="p-8 border-t border-white/5 bg-white/2">
                 <div className="flex gap-4">
                    {scenario.type === 'voice' && (
                      <button 
                        onClick={toggleListening}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-accent-gold/20 text-accent-gold hover:bg-accent-gold/30'}`}
                      >
                        <Mic className="w-8 h-8" />
                      </button>
                    )}
                    <div className="flex-1 relative">
                       <input 
                         value={input}
                         onChange={(e) => setInput(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                         placeholder={isListening ? "Listening..." : "Formulate your tactical response..."}
                         className="w-full h-16 bg-white/5 border border-white/10 rounded-full px-8 text-white focus:outline-none focus:border-accent-blue transition-all"
                       />
                       <button onClick={handleSend} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-accent-blue text-white rounded-full flex items-center justify-center hover:scale-105 transition-all">
                          <Send className="w-5 h-5" />
                       </button>
                    </div>
                 </div>
              </div>
           </div>

           <div className="flex gap-4">
              <button onClick={handleEvaluate} className="flex-1 h-20 glass-morphism rounded-[2rem] border-accent-gold/20 flex items-center justify-center gap-4 text-white hover:bg-accent-gold/5 transition-all">
                 <Target className="w-6 h-6 text-accent-gold" />
                 <span className="font-black italic uppercase tracking-widest text-sm">Seal & Analyze Session</span>
              </button>
           </div>
        </div>

        <div className="space-y-8">
           <div className="glass-morphism p-10 rounded-[3rem] border-accent-gold/10">
              <h4 className="text-xl font-black italic text-white uppercase tracking-tighter mb-6">Mission Briefing</h4>
              <div className="space-y-6">
                 <div>
                    <div className="text-[10px] font-black uppercase text-accent-gold tracking-widest mb-1">Perspective</div>
                    <div className="text-sm text-white font-bold">{scenario.roleUser}</div>
                 </div>
                 <div>
                    <div className="text-[10px] font-black uppercase text-accent-gold tracking-widest mb-1">Objective</div>
                    <div className="text-sm text-white/80 font-light italic">{scenario.goal}</div>
                 </div>
                 <div className="pt-6 border-t border-white/5">
                    <p className="text-xs text-text-dim italic leading-relaxed">
                       PRO-TIP: Use idioms and varied sentence structures to boost your activation score.
                    </p>
                 </div>
              </div>
           </div>

           {feedback && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass-morphism p-10 rounded-[3rem] border-accent-blue bg-accent-blue/5"
             >
                <div className="flex items-center justify-between mb-8">
                   <h4 className="text-xl font-black italic text-white uppercase tracking-tighter">Debriefing</h4>
                   <div className="text-3xl font-black italic text-accent-blue">{feedback.score}<span className="text-xs opacity-50">/100</span></div>
                </div>
                <div className="text-sm text-text-dim leading-relaxed italic font-light whitespace-pre-wrap">
                   {feedback.feedback}
                </div>
             </motion.div>
           )}
        </div>
      </div>
    </div>
  );
}

function ProfileView({ state, assessment, onUpdate, onClose, user }: { state: AppState, assessment: UserAssessment, onUpdate: (a: UserAssessment) => void, onClose: () => void, user: any }) {
  const [localAssessment, setLocalAssessment] = useState<UserAssessment>(assessment);
  
  const commonGoals = ['Moving Abroad', 'IELTS Score 7+', 'IELTS Score 8+', 'Professional Fluency', 'Casual Conversation', 'University Admission', 'Business Negotiation', 'Technical Writing', 'Travel Survival', 'Accent Reduction', 'Literature Analysis', 'Diplomatic English'];
  const commonInterests = ['Travel', 'Technology', 'Culture', 'Business', 'Literature', 'Science', 'Cinematography', 'History', 'Cooking', 'Gaming', 'Art', 'Sports', 'Economics', 'Psychology', 'Design', 'Environment', 'Politics', 'Medicine'];
  const levels: ProficiencyLevel[] = [
    'Beginner', 'Elementary', 
    'Low-Pre-Intermediate', 'Mid-Pre-Intermediate', 'High-Pre-Intermediate',
    'Low-Intermediate', 'Mid-Intermediate', 'High-Intermediate',
    'Low-Upper-Intermediate', 'High-Upper-Intermediate',
    'Advanced', 'Proficient'
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <div className="relative">
            <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-[2.5rem] bg-gradient-to-br from-accent-blue to-accent-gold p-[2px] shadow-2xl shadow-accent-blue/20">
               <div className="w-full h-full rounded-[2.4rem] bg-bg-base flex items-center justify-center overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-12 h-12 text-accent-blue opacity-50" />
                  )}
               </div>
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-bg-card border border-white/10 rounded-xl flex items-center justify-center shadow-xl">
               <Shield className="w-5 h-5 text-accent-gold" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h2 className="text-4xl lg:text-5xl font-black italic text-white tracking-tighter shrink-0">
                {user?.displayName || 'Neural Agent'}
              </h2>
              <span className="px-4 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-[10px] font-black uppercase tracking-widest">Active Link</span>
            </div>
            <p className="text-text-dim text-lg font-light italic opacity-60">System Identity: {user?.email || 'unlinked_entity'}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all border border-white/5">
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          {/* Level Selection Section */}
          <section className="glass-morphism p-10 lg:p-14 rounded-[3.5rem] relative overflow-hidden">
            <div className="flex items-center justify-between mb-10">
               <h3 className="text-2xl font-black italic text-white uppercase tracking-tighter">Neural Baseline Calibration</h3>
               <div className="text-right">
                  <div className="text-[10px] uppercase font-black tracking-widest text-accent-blue mb-1">Current Sync</div>
                  <div className="text-xl font-bold text-white italic">{localAssessment.currentLevel?.replace(/-/g, ' ')}</div>
               </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {levels.map(l => (
                <button
                  key={l}
                  onClick={() => setLocalAssessment({ ...localAssessment, currentLevel: l })}
                  className={`p-6 rounded-3xl border transition-all text-left group relative overflow-hidden ${localAssessment.currentLevel === l 
                    ? 'border-accent-blue bg-accent-blue/10 text-white shadow-lg shadow-accent-blue/10' 
                    : 'border-white/5 bg-white/5 text-text-dim opacity-50 hover:opacity-100 hover:border-white/10'}`}
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">Level Node</div>
                  <div className="font-bold text-sm leading-tight">{l.replace(/-/g, ' ')}</div>
                  {localAssessment.currentLevel === l && (
                    <motion.div layoutId="active-level" className="absolute top-2 right-2">
                       <Zap className="w-3 h-3 text-accent-blue fill-accent-blue" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
            
            <div className="mt-12 p-8 bg-white/5 rounded-3xl border border-white/5">
               <p className="text-sm font-light italic text-text-dim leading-relaxed">
                 <Sparkles className="w-4 h-4 inline-block mr-2 text-accent-gold" />
                 Calibration ensures the Neural Matrix generates linguistic challenges at your exact cognitive threshold. "Mid" and "High" variants provide finer-grained progression steps.
               </p>
            </div>
          </section>

          {/* Interests & Goals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section className="glass-morphism p-10 rounded-[3rem]">
              <h3 className="text-xl font-black italic text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
                <Target className="w-5 h-5 text-accent-blue" />
                Strategic Goals
              </h3>
              <div className="flex flex-wrap gap-2">
                {commonGoals.map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      const newGoals = localAssessment.goals.includes(g) 
                        ? localAssessment.goals.filter(goal => goal !== g)
                        : [...localAssessment.goals, g];
                      setLocalAssessment({ ...localAssessment, goals: newGoals });
                    }}
                    className={`px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${localAssessment.goals.includes(g) 
                      ? 'border-accent-blue bg-accent-blue text-bg-base' 
                      : 'border-white/5 bg-white/5 text-text-dim hover:border-white/20'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-morphism p-10 rounded-[3rem]">
              <h3 className="text-xl font-black italic text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-accent-gold" />
                Interest Nodes
              </h3>
              <div className="flex flex-wrap gap-2">
                {commonInterests.map(i => (
                  <button
                    key={i}
                    onClick={() => {
                      const newInterests = (localAssessment.interests || []).includes(i) 
                        ? localAssessment.interests.filter(int => int !== i)
                        : [...(localAssessment.interests || []), i];
                      setLocalAssessment({ ...localAssessment, interests: newInterests });
                    }}
                    className={`px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${localAssessment.interests?.includes(i) 
                      ? 'border-accent-gold bg-accent-gold text-bg-base' 
                      : 'border-white/5 bg-white/5 text-text-dim hover:border-white/20'}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </section>
          </div>
          
          <div className="pt-6">
            <button 
              onClick={() => {
                onUpdate(localAssessment);
                onClose();
              }}
              className="w-full h-24 btn-primary-dark text-xl flex items-center justify-center gap-6"
            >
              <RefreshCw className="w-6 h-6" />
              SYNCHRONIZE NEURAL BASELINE
            </button>
          </div>
        </div>

        <div className="space-y-10">
          {/* Achievement Matrix */}
          <section className="glass-morphism p-10 rounded-[3.5rem] border-accent-gold/20">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-black italic text-white uppercase tracking-tighter flex items-center gap-3">
                 <Award className="w-5 h-5 text-accent-gold" />
                 Neural Badge Matrix
               </h3>
               <span className="text-[10px] font-black text-accent-gold">{state.achievements?.filter(a => a.isUnlocked).length}/{state.achievements?.length}</span>
            </div>
            <div className="space-y-4">
              {(state.achievements || []).map((a) => {
                const Icon = a.icon === 'Zap' ? Zap : a.icon === 'Flame' ? Flame : BookOpen;
                return (
                  <div key={a.id} className={`p-6 rounded-3xl border flex items-center gap-6 transition-all ${a.isUnlocked ? 'border-accent-gold/20 bg-accent-gold/5' : 'border-white/5 bg-white/2 opacity-40 grayscale'}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${a.isUnlocked ? 'bg-accent-gold/20 text-accent-gold' : 'bg-white/5 text-text-dim'}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm tracking-tight">{a.title}</div>
                      <div className="text-[10px] text-text-dim italic font-light">{a.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Skill Mastery Snapshot */}
          <section className="glass-morphism p-10 rounded-[3.5rem]">
            <h3 className="text-xl font-black italic text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-accent-blue" />
              Linguistic Synthesis
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(state.masteryScores || {}).map(([skill, score]) => (
                <div key={skill} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim mb-2">{skill}</div>
                  <div className="flex items-end gap-2">
                    <div className="text-2xl font-black italic text-white leading-none">{score}</div>
                    <div className="text-[10px] font-bold text-accent-blue mb-1">%</div>
                  </div>
                  <div className="mt-3 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      className="h-full bg-accent-blue"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button onClick={() => { logout(); onClose(); }} className="w-full p-6 rounded-3xl border border-red-500/10 bg-red-500/5 text-red-400 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-red-500/10 transition-all">
             <LogOut className="w-4 h-4" />
             Terminate Session
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ assessment, onUpdate, onClose }: { assessment: UserAssessment, onUpdate: (a: UserAssessment) => void, onClose: () => void }) {
  const [localAssessment, setLocalAssessment] = useState<UserAssessment>(assessment);
  
  const commonGoals = ['Moving Abroad', 'IELTS Score 7+', 'IELTS Score 8+', 'Professional Fluency', 'Casual Conversation', 'University Admission', 'Business Negotiation', 'Technical Writing', 'Travel Survival', 'Accent Reduction', 'Literature Analysis', 'Diplomatic English'];
  const commonInterests = ['Travel', 'Technology', 'Culture', 'Business', 'Literature', 'Science', 'Cinematography', 'History', 'Cooking', 'Gaming', 'Art', 'Sports', 'Economics', 'Psychology', 'Design', 'Environment', 'Politics', 'Medicine'];
  const levels: ProficiencyLevel[] = [
    'Beginner', 'Elementary', 
    'Low-Pre-Intermediate', 'Mid-Pre-Intermediate', 'High-Pre-Intermediate',
    'Low-Intermediate', 'Mid-Intermediate', 'High-Intermediate',
    'Low-Upper-Intermediate', 'High-Upper-Intermediate',
    'Advanced', 'Proficient'
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-16 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-5xl font-black italic text-white tracking-tighter mb-4">Neural Tuning</h2>
          <p className="text-text-dim text-xl font-light italic opacity-60">Re-calibrate your evolutionary path.</p>
        </div>
        <button onClick={onClose} className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all border border-white/5">
          <X className="w-8 h-8" />
        </button>
      </div>

      <div className="space-y-20">
        <section>
          <h3 className="section-title-dark mb-10">Cognitive Level</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {levels.map(l => (
              <button
                key={l}
                onClick={() => setLocalAssessment({ ...localAssessment, currentLevel: l })}
                className={`p-6 rounded-3xl border transition-all text-left ${localAssessment.currentLevel === l ? 'border-accent-blue bg-accent-blue/10 text-text-main shadow-lg shadow-accent-blue/10' : 'border-white/5 bg-white/5 text-text-dim opacity-50 hover:opacity-100'}`}
              >
                <div className="font-bold text-lg">{l}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="section-title-dark mb-10">Strategic Goals</h3>
          <div className="flex flex-wrap gap-4">
            {commonGoals.map(g => (
              <button
                key={g}
                onClick={() => {
                  const newGoals = localAssessment.goals.includes(g) 
                    ? localAssessment.goals.filter(goal => goal !== g)
                    : [...localAssessment.goals, g];
                  setLocalAssessment({ ...localAssessment, goals: newGoals });
                }}
                className={`px-8 py-5 rounded-3xl border transition-all text-sm font-bold ${localAssessment.goals.includes(g) ? 'border-accent-blue bg-accent-blue text-bg-base' : 'border-white/5 bg-white/5 text-text-dim opacity-50 hover:opacity-100'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="section-title-dark mb-10">Interest Nodes</h3>
          <div className="flex flex-wrap gap-4">
            {commonInterests.map(i => (
              <button
                key={i}
                onClick={() => {
                  const newInterests = localAssessment.interests.includes(i) 
                    ? localAssessment.interests.filter(int => int !== i)
                    : [...localAssessment.interests, i];
                  setLocalAssessment({ ...localAssessment, interests: newInterests });
                }}
                className={`px-8 py-5 rounded-3xl border transition-all text-sm font-bold ${localAssessment.interests.includes(i) ? 'border-accent-gold bg-accent-gold text-bg-base shadow-lg shadow-accent-gold/20' : 'border-white/5 bg-white/5 text-text-dim opacity-50 hover:opacity-100'}`}
              >
                {i}
              </button>
            ))}
          </div>
        </section>

        <div className="flex gap-6 pt-10 border-t border-white/5">
          <button 
            onClick={() => onUpdate(localAssessment)}
            className="btn-primary-dark flex-1 h-20 text-xl"
          >
            Deploy Updated Curriculum
          </button>
          <button 
            onClick={onClose}
            className="flex-1 h-20 rounded-[2.5rem] border border-white/10 text-white font-black uppercase tracking-widest hover:bg-white/5 transition-all text-sm"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorPanel({ isOpen, onToggle, messages, setMessages }: { 
  isOpen: boolean, 
  onToggle: () => void, 
  messages: AIChatMessage[], 
  setMessages: (m: AIChatMessage[]) => void 
}) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const newMsg: AIChatMessage = { role: 'user', content: input };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setInput('');
    setIsTyping(true);

    try {
      const response = await getTutorResponse(updated);
      setMessages([...updated, { role: 'assistant', content: response }]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ x: 400 }}
          animate={{ x: 0 }}
          exit={{ x: 400 }}
          className="fixed top-0 right-0 w-full sm:w-[450px] h-full bg-bg-card shadow-2xl z-50 flex flex-col border-l border-border-subtle"
        >
          <div className="p-8 border-b border-border-subtle flex items-center justify-between bg-bg-accent/40 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-accent-blue rounded-xl flex items-center justify-center text-bg-base font-bold italic">AI</div>
              <div>
                <h3 className="font-bold text-text-main leading-none mb-1 uppercase tracking-widest text-xs">AI Language Coach</h3>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Connected</span>
                </div>
              </div>
            </div>
            <button onClick={onToggle} className="p-2 hover:bg-bg-accent rounded-xl transition-colors text-text-dim hover:text-text-main">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 bg-bg-base/20">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user' 
                  ? 'bg-accent-blue text-bg-base font-bold rounded-tr-none shadow-lg shadow-accent-blue/10' 
                  : 'bg-bg-accent text-text-main border border-border-subtle rounded-tl-none italic opacity-95'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-bg-accent p-4 rounded-2xl rounded-tl-none border border-border-subtle">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-8 bg-bg-accent/40 border-t border-border-subtle">
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                className="input-dark w-full pr-14 italic"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-accent-blue hover:scale-110 transition-transform disabled:opacity-30"
              >
                <Send className="w-6 h-6" />
              </button>
            </div>
            <p className="mt-4 text-[10px] text-center text-text-dim font-bold uppercase tracking-[0.3em]">Neural Tutor Framework 3.0</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AuthScreen({ onGoogleSignIn }: { onGoogleSignIn: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGoogleSignIn();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || "Failed to establish secure link.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-bg-base flex items-center justify-center p-6"
    >
      <div className="neural-background" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-12">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-accent-blue rounded-[2rem] mx-auto mb-8 flex items-center justify-center text-bg-base shadow-2xl shadow-accent-blue/20"
          >
            <Globe className="w-10 h-10" />
          </motion.div>
          <h1 className="text-4xl font-black italic tracking-tighter mb-3 text-white uppercase">Cognito <span className="text-accent-blue">AI</span></h1>
          <p className="text-text-dim font-bold uppercase tracking-[0.4em] text-[10px] bg-white/5 py-2 px-4 rounded-full inline-block">Neural Intelligence Access Layer</p>
        </div>

        <div className="bg-bg-card/50 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-10 md:p-12 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 blur-3xl -mr-16 -mt-16 rounded-full group-hover:bg-accent-blue/10 transition-colors" />
          
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">Identity Authentication</h2>
              <p className="text-sm text-text-dim italic">Access your personalized neural curriculum from any device via Google SSO.</p>
            </div>

            <button 
              onClick={handleSignIn}
              disabled={loading}
              className="w-full h-16 rounded-[1.5rem] bg-white text-bg-base font-black flex items-center justify-center gap-4 hover:bg-opacity-90 transition-all shadow-xl shadow-white/5 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <div className="w-6 h-6 flex items-center justify-center bg-bg-base text-white rounded-full font-serif font-black text-xs">G</div>
                  <span className="uppercase tracking-widest text-sm">Sync with Google ID</span>
                </>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400 text-xs font-bold leading-relaxed"
              >
                <Shield className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <div className="pt-6 border-t border-white/5 text-center">
              <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] leading-relaxed">
                By connecting, you authorize secure synchronization of your linguistic progress metadata.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-12 text-center text-[8px] font-black text-white/10 uppercase tracking-[0.5em] leading-relaxed italic">
          Cognito AI Core • Authentication Module v5.0.0
        </p>
      </div>
    </motion.div>
  );
}


